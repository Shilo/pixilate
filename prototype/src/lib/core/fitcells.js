// Smooth-upscale cell colours (second-difference grids only): a bilinear/bicubic upscale blurs each
// cell into its neighbours, so the pixel nearest a cell centre is a mix of the cell and its
// neighbourhood. Fit one separable kernel per image by grid-search least squares on the image's own
// pixels (a 2-weight 3-tap kernel, or a 5-tap Keys cubic, D60), then deconvolve the cell colours with it. Premultiplied RGBA floats; only
// sqrt/round; fixed loop orders; no module state.
import { srgbToOklab } from './color.js'

const ITERS = 4 // Jacobi iterations of the deconvolution
const FIT_CELLS = 150 // cells (after striding) whose pixels score a kernel
const MIN_FIT = 8 // fewer fit cells -> no kernel
const EARLY_RMS = 1 // the box-free kernel (a, b) = (1, 0) is accepted below this residual
const MAX_RMS = 12 // a best residual above this -> no kernel
const SNAP = 3 // keep an observed opaque RGB within this max-channel distance of the estimate
const KEYS_A = [-0.5, -0.6, -0.75] // D60: Keys cubic parameters tried after the (a, b) search; adopted below EARLY_RMS only
const RADIUS = 2 // during the search only cells within this Chebyshev distance of a fit cell are solved

/** Per axis: nearest pixel j and its signed offset del (cell units) per cell; cell and offset dp per pixel. */
function axisInfo(a, len) {
  const n = a.count, j = new Int32Array(n), del = new Float64Array(n), cen = new Float64Array(n), per = new Float64Array(n)
  const cell = new Int32Array(len), dp = new Float64Array(len)
  for (let i = 0; i < n; i++) {
    const c0 = a.cuts[i], c1 = a.cuts[i + 1]
    cen[i] = (c0 + c1) / 2; per[i] = c1 - c0
    j[i] = Math.max(0, Math.min(len - 1, Math.round(cen[i] - 0.5)))
    del[i] = (j[i] + 0.5 - cen[i]) / per[i]
  }
  for (let x = 0, i = 0; x < len; x++) {
    while (i < n - 1 && a.cuts[i + 1] <= x + 0.5) i++
    cell[x] = i; dp[x] = (x + 0.5 - cen[i]) / per[i]
  }
  return { n, j, del, cell, dp }
}


/** Keys cubic (parameter A < 0) at distance t >= 0; polynomial only. */
function keys(t, A) {
  if (t < 1) return ((A + 2) * t - (A + 3)) * t * t + 1
  if (t < 2) return ((A * t - 5 * A) * t + 8 * A) * t - 4 * A
  return 0
}

/**
 * 1-D weights on cells -2..+2 at signed offset d. Kernel { a, b }: 3-tap, the d side gets a|d|, the
 * opposite b|d| (cells -2 and +2 get 0). Kernel { keys: A }: Keys cubic at each cell centre, normalized.
 */
function w5(d, k, out) {
  if (k.keys == null) {
    const t = d < 0 ? -d : d
    out[0] = 0; out[4] = 0; out[2] = 1 - (k.a + k.b) * t
    if (d >= 0) { out[3] = k.a * t; out[1] = k.b * t } else { out[1] = k.a * t; out[3] = k.b * t }
    return
  }
  let s = 0
  for (let m = -2; m <= 2; m++) { const t = d - m; s += out[m + 2] = keys(t < 0 ? -t : t, k.keys) }
  for (let m = 0; m < 5; m++) out[m] /= s
}

/** Shared state of one image + grid: observations (nearest pixel per cell) and the solver. */
function setup(img, g) {
  const W = img.width, H = img.height, d = img.data
  const X = axisInfo(g.x, W), Y = axisInfo(g.y, H), w = X.n, h = Y.n, n = w * h
  const pre = (p, k) => (k === 3 ? d[p + 3] : (d[p + k] * d[p + 3]) / 255)
  const obs = new Float64Array(n * 4)
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    const p = (Y.j[cy] * W + X.j[cx]) * 4
    for (let k = 0; k < 4; k++) obs[(cy * w + cx) * 4 + k] = pre(p, k)
  }
  const cl = (i, m) => (i < 0 ? 0 : i >= m ? m - 1 : i)
  const wx = new Float64Array(5), wy = new Float64Array(5)
  // v = obs, then ITERS Jacobi sweeps v_c = (obs_c - sum of non-centre w * v_nb) / w_c, clamped to
  // [0, 255]; `list` (cell ids) limits the updated cells, the rest keep their observation.
  const solve = (k, list) => {
    let v = Float64Array.from(obs)
    for (let it = 0; it < ITERS; it++) {
      const nv = Float64Array.from(obs)
      for (let q = 0, L = list ? list.length : n; q < L; q++) {
        const c = list ? list[q] : q, cx = c % w, cy = (c - cx) / w
        w5(X.del[cx], k, wx); w5(Y.del[cy], k, wy)
        const wc = wx[2] * wy[2]
        for (let ch = 0; ch < 4; ch++) {
          let s = obs[c * 4 + ch]
          for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if ((i !== 2 || j !== 2) && wx[i] !== 0 && wy[j] !== 0) s -= wx[i] * wy[j] * v[(cl(cy + j - 2, h) * w + cl(cx + i - 2, w)) * 4 + ch]
          const r = s / wc
          nv[c * 4 + ch] = r < 0 ? 0 : r > 255 ? 255 : r
        }
      }
      v = nv
    }
    return v
  }
  return { W, H, d, X, Y, w, h, n, pre, obs, solve, wx, wy, cl }
}

/**
 * fitKernel(img, g, cells) -> { a, b, rms } or { a: A, b: null, keys: A, rms }: per-image kernel
 * weights (a, b), or a Keys cubic parameter A (D60), and their residual (RMS over premultiplied RGB of
 * the fit cells' pixels); a = b = null when there are fewer than 8 fit cells (rms null) or the best
 * residual exceeds 12.
 */
export function fitKernel(img, g, cells) {
  const S = setup(img, g), { W, H, X, Y, w, h, n, pre, obs, solve, wx, wy, cl } = S
  // fit cells: interior, opaque, not pure, the 3x3 neighbourhood's observations fully opaque
  const fit = []
  for (let cy = 1; cy < h - 1; cy++) for (let cx = 1; cx < w - 1; cx++) {
    const c = cy * w + cx
    if (!cells.alpha[c] || cells.pure[c]) continue
    let ok = true
    for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (obs[((cy + j) * w + cx + i) * 4 + 3] < 255) { ok = false; break }
    if (ok) fit.push(c)
  }
  if (fit.length < MIN_FIT) return { a: null, b: null, rms: null }
  const stride = Math.ceil(fit.length / FIT_CELLS), sel = fit.filter((_, i) => i % stride === 0)
  const inR = new Uint8Array(n)
  for (const c of sel) {
    const cx = c % w, cy = (c - cx) / w
    for (let j = -RADIUS; j <= RADIUS; j++) for (let i = -RADIUS; i <= RADIUS; i++) {
      const x = cx + i, y = cy + j
      if (x >= 0 && y >= 0 && x < w && y < h) inR[y * w + x] = 1
    }
  }
  const region = []
  for (let c = 0; c < n; c++) if (inR[c]) region.push(c)
  // every pixel whose centre falls in a selected cell
  const px = []
  for (const c of sel) {
    const cx = c % w, cy = (c - cx) / w
    for (let y = Math.max(0, Math.ceil(g.y.cuts[cy] - 0.5)); y < g.y.cuts[cy + 1] - 0.5 && y < H; y++) {
      if (Y.cell[y] !== cy) continue
      for (let x = Math.max(0, Math.ceil(g.x.cuts[cx] - 0.5)); x < g.x.cuts[cx + 1] - 0.5 && x < W; x++) if (X.cell[x] === cx) px.push(cx, cy, x, y)
    }
  }
  const sse = (kk, v) => {
    let e = 0
    for (let q = 0; q < px.length; q += 4) {
      const cx = px[q], cy = px[q + 1], x = px[q + 2], y = px[q + 3], p = (y * W + x) * 4
      w5(X.dp[x], kk, wx); w5(Y.dp[y], kk, wy)
      for (let k = 0; k < 3; k++) {
        let pr = 0
        for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (wx[i] !== 0 && wy[j] !== 0) pr += wx[i] * wy[j] * v[(cl(cy + j - 2, h) * w + cl(cx + i - 2, w)) * 4 + k]
        const dv = pre(p, k) - pr
        e += dv * dv
      }
    }
    return e
  }
  let best = null
  const tryAB = (a, b) => { const kk = { a, b }, e = sse(kk, solve(kk, region)); if (!best || e < best.e) best = { a, b, e } }
  let bestK = null
  const tryKeys = (A) => { const kk = { keys: A }, e = sse(kk, solve(kk, region)); if (!bestK || e < bestK.e) bestK = { a: A, b: null, keys: A, e } }
  const rms = () => Math.sqrt(best.e / ((px.length / 4) * 3))
  tryAB(1, 0)
  if (rms() >= EARLY_RMS) {
    for (let ia = 0; ia <= 6; ia++) for (let ib = -3; ib <= 1; ib++) if (ia !== 5 || ib !== 0) tryAB(ia / 5, ib / 5)
    const a0 = best.a, b0 = best.b, steps = [-0.1, -0.05, 0, 0.05, 0.1]
    for (const da of steps) for (const db of steps) if (da || db) tryAB(Math.round((a0 + da) * 100) / 100, Math.round((b0 + db) * 100) / 100)
    for (const A of KEYS_A) tryKeys(A)
    // D60: a Keys cubic replaces the (a, b) kernel only when it fits better and explains the image as a
    // clean upscale (residual < EARLY_RMS); on noisy upscales its sharper inverse amplifies the noise
    if (bestK && bestK.e < best.e && Math.sqrt(bestK.e / ((px.length / 4) * 3)) < EARLY_RMS) best = bestK
  }
  const r = rms()
  return r > MAX_RMS ? { a: null, b: null, rms: r } : best.keys != null ? { a: best.a, b: null, keys: best.keys, rms: r } : { a: best.a, b: best.b, rms: r }
}

/**
 * deconvolveCells(img, g, cells, kernel) -> cells with the lab of every opaque non-pure cell replaced
 * by its deconvolved colour (snapped to an observed opaque RGB within 3 in the 3x3 around the
 * nearest pixel); alpha, dominance, pure, rgb and masked are kept. No kernel -> cells unchanged.
 */
export function deconvolveCells(img, g, cells, kernel) {
  if (kernel?.a == null) return cells
  const { W, H, d, X, Y, w, n, solve } = setup(img, g)
  const v = solve(kernel, null), t = new Float64Array(3)
  for (let c = 0; c < n; c++) {
    if (!cells.alpha[c] || cells.pure[c]) continue
    const al = v[c * 4 + 3] / 255
    if (al < 0.5) continue
    const un = (k) => Math.max(0, Math.min(255, Math.round(v[c * 4 + k] / al)))
    // snap: raster-order scan of the opaque 3x3 around the nearest pixel; a pixel strictly closer
    // (max channel) than the current choice -- the estimate, then the last snapped pixel -- and
    // within SNAP of it becomes the choice (sequential, as measured in review; not a global nearest)
    let r = un(0), gg = un(1), b = un(2), bd = SNAP + 1
    const cx = c % w, cy = (c - cx) / w
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const x = X.j[cx] + i, y = Y.j[cy] + j
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const p = (y * W + x) * 4
      if (d[p + 3] < 255) continue
      const dd = Math.max(Math.abs(d[p] - r), Math.abs(d[p + 1] - gg), Math.abs(d[p + 2] - b))
      if (dd < bd) { bd = dd; r = d[p]; gg = d[p + 1]; b = d[p + 2] }
    }
    srgbToOklab(r, gg, b, t, 0)
    cells.lab[c * 3] = t[0]; cells.lab[c * 3 + 1] = t[1]; cells.lab[c * 3 + 2] = t[2]
  }
  return cells
}
