// Steps 2, 7, 9: background analysis, indexed-grid cleanup, background removal (contract: algorithm-design.md).
// Every grid pass is Jacobi-style: read the old index array, write a new one.
// ΔE tests use toe-corrected L (toeL) on working copies; stored colors keep true OKLab.

import { dist2 as d2, srgbToOklab, toe, toeL } from './color.js'

const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const SPECK_AREA = 0.005, SPECK_DE = 0.09 // background-speck rule: share of opaque cells, ΔE to a bg color

/** Squared distance from point P[p..] to segment A[a..]-B[b..] in OKLab. */
function segD2(P, p, A, a, B, b) {
  let num = 0, den = 0
  for (let k = 0; k < 3; k++) { const ab = B[b + k] - A[a + k]; num += (P[p + k] - A[a + k]) * ab; den += ab * ab }
  const t = den > 0 ? Math.min(1, Math.max(0, num / den)) : 0
  let s = 0
  for (let k = 0; k < 3; k++) { const e = P[p + k] - (A[a + k] + t * (B[b + k] - A[a + k])); s += e * e }
  return s
}

/** Most frequent value in `vals[0..m)`, ties to the lowest value. */
function mode(vals, m) {
  let best = 0, bc = 0
  for (let i = 0; i < m; i++) {
    let c = 0
    for (let j = 0; j < m; j++) if (vals[j] === vals[i]) c++
    if (c > bc || (c === bc && vals[i] < best)) { bc = c; best = vals[i] }
  }
  return best
}

// Smooth-gradient background (D49): a per-channel quadratic surface in OKLab over normalized canvas
// coordinates u = x / W, v = y / H, fitted to border-block means by trimmed least squares.
const SURF_TERMS = 6, SURF_INLIER = 0.03, SURF_MIN_SHARE = 0.6, SURF_MAX_MED = 0.035, SURF_MIN_RANGE = 0.03
const surfBasis = (u, v, f) => { f[0] = 1; f[1] = u; f[2] = v; f[3] = u * v; f[4] = u * u; f[5] = v * v }

/** Solve the K x K normal equations M x = r in place (partial pivoting); null when (near-)singular. */
function solve(M, r, K) {
  const tol = 1e-9 * M[0] // relative pivot threshold: M[0] = point count, the Gram matrix's largest diagonal
  for (let c = 0; c < K; c++) {
    let piv = c
    for (let i = c + 1; i < K; i++) if (Math.abs(M[i * K + c]) > Math.abs(M[piv * K + c])) piv = i
    if (Math.abs(M[piv * K + c]) < tol) return null
    if (piv !== c) {
      for (let j = 0; j < K; j++) { const t = M[c * K + j]; M[c * K + j] = M[piv * K + j]; M[piv * K + j] = t }
      const t = r[c]; r[c] = r[piv]; r[piv] = t
    }
    for (let i = c + 1; i < K; i++) {
      const f = M[i * K + c] / M[c * K + c]
      for (let j = c; j < K; j++) M[i * K + j] -= f * M[c * K + j]
      r[i] -= f * r[c]
    }
  }
  const x = new Float64Array(K)
  for (let i = K - 1; i >= 0; i--) { let t = r[i]; for (let j = i + 1; j < K; j++) t -= M[i * K + j] * x[j]; x[i] = t / M[i * K + i] }
  return x
}

/** surfaceAt(surface, u, v, out, o): true OKLab of a background surface at normalized (u, v), into out[o..o+2]. */
export function surfaceAt(S, u, v, out, o = 0) {
  const f = new Float64Array(SURF_TERMS)
  surfBasis(u, v, f)
  for (let k = 0; k < 3; k++) { let t = 0; for (let j = 0; j < SURF_TERMS; j++) t += S.coef[k * SURF_TERMS + j] * f[j]; out[o + k] = t }
  return out
}

const toeDist = (a, b) => { const dL = toeL(a[0]) - toeL(b[0]), da = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt(dL * dL + da * da + db * db) }

/**
 * fitSurface(us, vs, L, m) -> { coef, inliers, med, range } | null for m points (u, v, true OKLab). Three
 * rounds of least squares, each on the previous round's inliers (first: all); inlier = toe-ΔE to the surface
 * < max(SURF_INLIER, 2.5 x median residual). med = median inlier residual; range = largest toe-ΔE from the
 * canvas centre to its corners and edge midpoints.
 */
export function fitSurface(us, vs, L, m) {
  const K = SURF_TERMS, f = new Float64Array(K), inl = new Uint8Array(m).fill(1), res = new Float64Array(m), q = new Float64Array(3)
  let S = null
  for (let it = 0; it < 3; it++) {
    const M = new Float64Array(K * K), R = [new Float64Array(K), new Float64Array(K), new Float64Array(K)]
    let n = 0
    for (let i = 0; i < m; i++) {
      if (!inl[i]) continue
      n++
      surfBasis(us[i], vs[i], f)
      for (let a = 0; a < K; a++) { for (let b = 0; b < K; b++) M[a * K + b] += f[a] * f[b]; for (let k = 0; k < 3; k++) R[k][a] += f[a] * L[i * 3 + k] }
    }
    if (n < 4 * K) return null
    const coef = new Float64Array(3 * K)
    for (let k = 0; k < 3; k++) { const x = solve(Float64Array.from(M), R[k], K); if (!x) return null; coef.set(x, k * K) }
    S = { coef }
    for (let i = 0; i < m; i++) res[i] = toeDist(L.subarray(i * 3, i * 3 + 3), surfaceAt(S, us[i], vs[i], q))
    const sorted = Float64Array.from(res).sort(), thr = Math.max(SURF_INLIER, 2.5 * sorted[m >> 1])
    for (let i = 0; i < m; i++) inl[i] = res[i] < thr ? 1 : 0
  }
  const r = []
  for (let i = 0; i < m; i++) if (inl[i]) r.push(res[i])
  r.sort((a, b) => a - b)
  const ref = surfaceAt(S, 0.5, 0.5, new Float64Array(3))
  let range = 0
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) range = Math.max(range, toeDist(surfaceAt(S, u, v, q), ref))
  return { coef: S.coef, inliers: r.length / m, med: r.length ? r[r.length >> 1] : Infinity, range }
}

/**
 * analyzeBackground(img) -> { bg, checkerboard, mask, surface }.
 * Border pixels are leader-clustered in OKLab (ΔE 0.04). One cluster ≥ 60% of the border = solid
 * background. Two light clusters ≥ 60% that alternate with a stable run length = painted
 * checkerboard; its border-connected pixels form `mask` (1 = exclude from grid detection). Otherwise, with
 * >= 40% of the border opaque, a smooth gradient: `surface` = fitSurface on the means of B x B border blocks
 * (B = max(4, round(min(W, H) / 48)), blocks at least half opaque) when its inlier share >= 0.6, median
 * inlier residual < 0.035 and range >= 0.03 (>= 3 distinct block rows and columns, else `reason`); `bg` is then
 * the surface colour at the canvas centre.
 */
export function analyzeBackground(img) {
  const W = img.width, H = img.height, d = img.data
  const ring = []
  for (let x = 0; x < W; x++) ring.push(x)
  for (let y = 1; y < H; y++) ring.push(y * W + W - 1)
  for (let x = W - 2; x >= 0 && H > 1; x--) ring.push((H - 1) * W + x)
  for (let y = H - 2; y > 0 && W > 1; y--) ring.push(y * W)
  const none = { bg: null, checkerboard: null, mask: null, surface: null }
  const lab = new Float64Array(ring.length * 3), label = new Int32Array(ring.length).fill(-1)
  const leads = [], counts = [], sums = [], tt = new Float64Array(3)
  let opaque = 0
  for (let r = 0; r < ring.length; r++) {
    const p = ring[r] * 4
    if (d[p + 3] < 128) continue
    opaque++
    srgbToOklab(d[p], d[p + 1], d[p + 2], tt, 0)
    lab[r * 3] = toeL(tt[0]); lab[r * 3 + 1] = tt[1]; lab[r * 3 + 2] = tt[2] // toe L for distances
    let best = -1, bd = 0.04 * 0.04
    for (let q = 0; q < leads.length; q++) { const dd = d2(lab, r * 3, lab, leads[q] * 3); if (dd < bd) { bd = dd; best = q } }
    if (best < 0) { best = leads.length; leads.push(r); counts.push(0); sums.push([0, 0, 0]) }
    label[r] = best; counts[best]++
    for (let k = 0; k < 3; k++) sums[best][k] += tt[k]
  }
  if (opaque < ring.length * 0.4) return none // border mostly transparent already
  const surf = () => { // no solid colour or checkerboard: a smooth gradient over the border-block means?
    const B = Math.max(4, Math.round(Math.min(W, H) / 48)), t = new Float64Array(3), us = [], vs = [], L = []
    const block = (x0, y0) => {
      const x1 = Math.min(W, x0 + B), y1 = Math.min(H, y0 + B)
      let n = 0, l = 0, a = 0, b = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4
        if (d[p + 3] < 128) continue
        srgbToOklab(d[p], d[p + 1], d[p + 2], t, 0); l += t[0]; a += t[1]; b += t[2]; n++
      }
      if (n * 2 < (x1 - x0) * (y1 - y0)) return
      us.push((x0 + x1) / 2 / W); vs.push((y0 + y1) / 2 / H); L.push(l / n, a / n, b / n)
    }
    for (let x = 0; x < W; x += B) { block(x, 0); block(x, Math.max(0, H - B)) }
    for (let y = B; y < H - B; y += B) { block(0, y); block(Math.max(0, W - B), y) }
    // a quadratic needs >= 3 distinct block centres per axis (a thin strip has only 2 rows: v^2 undetermined)
    if (new Set(us).size < 3 || new Set(vs).size < 3) return { ...none, reason: 'gradient surface refused: border blocks span < 3 distinct rows or columns' }
    const S = fitSurface(us, vs, Float64Array.from(L), us.length)
    if (!S || S.inliers < SURF_MIN_SHARE || S.med >= SURF_MAX_MED || S.range < SURF_MIN_RANGE) return none
    return { ...none, bg: Float32Array.from(surfaceAt(S, 0.5, 0.5, new Float64Array(3))), surface: { coef: S.coef } }
  }
  const byCount = counts.map((_, q) => q).sort((a, b) => counts[b] - counts[a] || a - b)
  const mean = (q) => sums[q].map((s) => s / counts[q])
  const [c0, c1] = byCount
  if (counts[c0] >= 0.6 * opaque) return { ...none, bg: Float32Array.from(mean(c0)) }
  if (c1 === undefined || counts[c0] + counts[c1] < 0.6 * opaque) return surf()
  const m0 = mean(c0), m1 = mean(c1)
  if (m0[0] < 0.6 || m1[0] < 0.6) return surf()
  // run lengths of the two colors along each side; interior runs only
  const runs = []
  const sides = [[0, W], [W, W + H - 1], [W + H - 1, 2 * W + H - 2], [2 * W + H - 2, ring.length]]
  const Mpair = toe([...m0, ...m1])
  for (const [a, b] of sides) {
    let cur = -1, len = 0, side = []
    for (let r = a; r < b; r++) {
      const s = label[r] < 0 ? -1 : d2(lab, r * 3, Mpair, 0) <= d2(lab, r * 3, Mpair, 3) ? 0 : 1
      if (s === cur) len++
      else { if (cur >= 0) side.push(len); cur = s; len = 1 }
    }
    runs.push(...side.slice(1)) // drop the first (truncated) run; the last one was never pushed
  }
  if (runs.length < 4) return surf()
  runs.sort((a, b) => a - b)
  const period = runs[runs.length >> 1]
  const stable = runs.filter((v) => Math.abs(v - period) <= Math.max(1, 0.25 * period)).length
  if (period < 2 || stable < 0.7 * runs.length) return surf()
  // mask: flood from the border over pixels near the segment between the two checker colors
  const mask = new Uint8Array(W * H), queue = new Int32Array(W * H), t = new Float64Array(3)
  const near = (i) => {
    const p = i * 4
    if (d[p + 3] < 128) return true
    srgbToOklab(d[p], d[p + 1], d[p + 2], t, 0)
    t[0] = toeL(t[0])
    return segD2(t, 0, Mpair, 0, Mpair, 3) < 0.06 * 0.06
  }
  let qh = 0, qt = 0
  for (const i of ring) if (!mask[i] && near(i)) { mask[i] = 1; queue[qt++] = i }
  while (qh < qt) {
    const i = queue[qh++], x = i % W, y = (i - x) / W
    if (x > 0 && !mask[i - 1] && near(i - 1)) { mask[i - 1] = 1; queue[qt++] = i - 1 }
    if (x < W - 1 && !mask[i + 1] && near(i + 1)) { mask[i + 1] = 1; queue[qt++] = i + 1 }
    if (y > 0 && !mask[i - W] && near(i - W)) { mask[i - W] = 1; queue[qt++] = i - W }
    if (y < H - 1 && !mask[i + W] && near(i + W)) { mask[i + W] = 1; queue[qt++] = i + W }
  }
  return { bg: Float32Array.from([...m0, ...m1]), checkerboard: { period }, mask }
}

/** Cells in a strict 3x3 two-color checker (both colors opaque). */
function ditherMask(index, w, h) {
  const prot = new Uint8Array(w * h)
  for (let y = 0; y + 3 <= h; y++) {
    for (let x = 0; x + 3 <= w; x++) {
      const A = index[y * w + x], B = index[y * w + x + 1]
      if (A < 0 || B < 0 || A === B) continue
      let ok = true
      for (let j = 0; j < 3 && ok; j++) for (let i = 0; i < 3 && ok; i++) ok = index[(y + j) * w + x + i] === ((i + j) & 1 ? B : A)
      if (ok) for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) prot[(y + j) * w + x + i] = 1
    }
  }
  return prot
}

/**
 * cleanup(indexed, cells, { pixelPerfect = true }) -> Indexed + `changed` (cells changed per rule:
 * orphan, rareLone, pinhole, island, pixelPerfect).
 * 1. orphans (no same-index 8-neighbor) -> opaque-neighbor mode only if dominance < 0.6 or
 *    ΔE(pixel, mode) < 0.08; never inside a 3x3 checker dither. Then lone 4-connected pixels of a
 *    color used ≤ 2 times with dominance < 0.5.
 * 2. alpha pinholes enclosed by one index; opaque islands with dominance < 0.6.
 * No pass changes a dither cell or a pure cell (`cells.pure`: every inset pixel identical).
 * 3. pixel-perfect: L-corner middle pixel on a 1 px stroke -> mode of its non-stroke neighbors,
 *    except true right angles (both arms continue) and stroke ends (an arm with no onward pixel);
 *    of 8-adjacent candidates only the lowest raster.
 */
export function cleanup(indexed, cells, { pixelPerfect = true } = {}) {
  const { w, h, palette } = indexed, n = w * h, dom = cells.dominance, P = toe(palette)
  const prot = ditherMask(indexed.index, w, h)
  if (cells.pure) for (let p = 0; p < n; p++) prot[p] |= cells.pure[p] // exact cells are content, not noise
  const vals = new Int32Array(8)
  // neighbor indices of p (in bounds) into vals; returns count
  const neigh = (idx, x, y) => {
    let m = 0
    for (const [dx, dy] of NB8) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) vals[m++] = idx[ny * w + nx]
    }
    return m
  }
  const opaqueOnly = (m) => { let k = 0; for (let i = 0; i < m; i++) if (vals[i] >= 0) vals[k++] = vals[i]; return k }
  const changed = { orphan: 0, rareLone: 0, pinhole: 0, island: 0, pixelPerfect: 0 }
  const diff = (a, b) => { let k = 0; for (let p = 0; p < n; p++) if (a[p] !== b[p]) k++; return k }

  // 1a. orphans
  let old = indexed.index, cur = Int16Array.from(old)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, v = old[p]
      if (v < 0 || prot[p]) continue
      let m = neigh(old, x, y), same = false
      for (let i = 0; i < m; i++) if (vals[i] === v) same = true
      if (same) continue
      m = opaqueOnly(m)
      if (m === 0) continue // island: alpha step
      const md = mode(vals, m)
      if (dom[p] < 0.6 || d2(P, v * 3, P, md * 3) < 0.08 * 0.08) cur[p] = md
    }
  }
  changed.orphan = diff(old, cur)
  // 1b. lone 4-connected pixels of rare colors
  old = cur; cur = Int16Array.from(old)
  const uses = new Int32Array(palette.length / 3)
  for (let p = 0; p < n; p++) if (old[p] >= 0) uses[old[p]]++
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, v = old[p]
      if (v < 0 || prot[p] || uses[v] > 2 || dom[p] >= 0.5) continue
      if ((x > 0 && old[p - 1] === v) || (x < w - 1 && old[p + 1] === v) || (y > 0 && old[p - w] === v) || (y < h - 1 && old[p + w] === v)) continue
      const m = opaqueOnly(neigh(old, x, y))
      if (m) cur[p] = mode(vals, m)
    }
  }
  changed.rareLone = diff(old, cur)
  // 2. pinholes and islands
  old = cur; cur = Int16Array.from(old)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, v = old[p], m = neigh(old, x, y)
      if (prot[p]) continue
      if (v < 0) {
        if (m < 8 || vals[0] < 0) continue
        let one = true
        for (let i = 1; i < m; i++) if (vals[i] !== vals[0]) one = false
        if (one) { cur[p] = vals[0]; changed.pinhole++ }
      } else if (dom[p] < 0.6 && opaqueOnly(m) === 0) { cur[p] = -1; changed.island++ }
    }
  }
  // 3. pixel-perfect L-corners
  if (pixelPerfect) {
    old = cur; cur = Int16Array.from(old)
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? old[y * w + x] : -2)
    // thin: no 2x2 window containing (x, y) is all one index
    const thin = (x, y) => {
      const v = at(x, y)
      for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) {
        if (at(x + ox, y + oy) === v && at(x + ox + 1, y + oy) === v && at(x + ox, y + oy + 1) === v && at(x + ox + 1, y + oy + 1) === v) return false
      }
      return true
    }
    const cand = new Uint8Array(n)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = old[y * w + x]
        if (v < 0) continue
        let cnt = 0, hx = 0, vy = 0
        for (const [dx, dy] of NB8) {
          if (at(x + dx, y + dy) !== v) continue
          cnt++
          if (dy === 0) hx = dx
          else if (dx === 0) vy = dy
        }
        if (cnt !== 2 || !hx || !vy) continue
        if (!thin(x, y) || !thin(x + hx, y) || !thin(x, y + vy)) continue
        if (at(x + 2 * hx, y) === v && at(x, y + 2 * vy) === v) continue // true right angle
        // a jaggy step joins two strokes: an arm that ends at the corner (dead-end stub) makes the
        // corner a stroke end, and removing it would break the stroke
        const onward = (ax, ay) => NB8.some(([dx, dy]) => {
          const qx = ax + dx, qy = ay + dy
          return !(qx === x && qy === y) && !(qx === x + hx && qy === y) && !(qx === x && qy === y + vy) && at(qx, qy) === v
        })
        if (!onward(x + hx, y) || !onward(x, y + vy)) continue
        if (!prot[y * w + x]) cand[y * w + x] = 1
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!cand[y * w + x]) continue
        let lower = false // an 8-adjacent candidate earlier in raster order wins
        for (const [dx, dy] of NB8) if ((dy < 0 || (dy === 0 && dx < 0)) && at(x + dx, y + dy) !== -2 && cand[(y + dy) * w + x + dx]) lower = true
        if (lower) continue
        const v = old[y * w + x]
        let m = 0
        for (const [dx, dy] of NB8) { const u = at(x + dx, y + dy); if (u !== v && u !== -2) vals[m++] = u }
        if (m) cur[y * w + x] = mode(vals, m)
      }
    }
    changed.pixelPerfect = diff(old, cur)
  }
  return { w, h, index: cur, palette, rgb: indexed.rgb, changed }
}

/**
 * removeBackground(cells, bg, { mode = 'auto', tolerance, connectivity = 4, halo = false }) -> Cells
 * (removed cells get alpha 0) + `removed` (1 = removed cell) + `background` { applied, reason,
 * removed, haloChanged }.
 * mode 'auto' / true (estimated colors): a cell is bg-colored within ΔE < 0.03 of a bg color (shadows
 * are kept: deleting subject content is worse than keeping a ground shadow); for a checkerboard pair
 * within 0.035 with chroma weighted x2. Gate: bg-colored border cells (masked cells count) must cover
 * ≥ 90% with RMS spread < 0.03 for 'auto' with one solid color, ≥ 60% for a checkerboard pair or
 * mode true. 'auto' also requires a floating subject: ≤ 2% of border cells left opaque by the fill.
 * mode 'key' (a user key color): ΔE ≤ tolerance (default 0.03), no coverage or floating-subject gate.
 * Then a flood fill (4- or 8-connected) from the border over transparent, masked and bg-colored cells
 * (for a checkerboard also cells between its two colours whose 4-neighbours are all background: they
 * straddle squares). A fill that would leave no opaque cell (solid image) is refused ('no subject').
 * Background specks (floating, tiny, near a bg color; see below) are removed with it and counted.
 * halo: an opaque cell beside the removed region that lies within 0.03 of the segment from an opaque
 * 4-neighbor to a bg color takes that neighbor's color.
 * field (gradient surface, D49): per-cell background colours (n x 3 OKLab: the surface at each cell's source
 * centre) replace the bg colors in every test above; the solid-colour tolerance and gates apply unchanged.
 */
export function removeBackground(cells, bg, { mode = 'auto', tolerance, connectivity = 4, halo = false, field = null } = {}) {
  const { w, h, lab, alpha, masked } = cells, n = w * h
  const out = { ...cells, lab: Float32Array.from(lab), alpha: Uint8Array.from(alpha), rgb: cells.rgb && Int32Array.from(cells.rgb) }
  const refuse = (reason) => ({ ...out, background: { applied: false, reason, removed: 0, specks: 0, haloChanged: 0 } })
  if (!bg || !bg.length || !mode) return refuse('no background color')
  const key = mode === 'key', nb = field ? 1 : bg.length / 3, T = toe(lab), B = toe(bg), F = field && toe(field)
  // painted checker: neutral grey squares with texture (cells up to ΔE ~0.035 off, which otherwise trip the
  // floating-subject check); chroma x2 keeps tinted pale ink (steel vs the grey square: 0.030 -> 0.051)
  if (nb === 2) for (const A of [T, B]) for (let i = 0; i < A.length; i += 3) { A[i + 1] *= 2; A[i + 2] *= 2 }
  const tol = key ? tolerance ?? 0.03 : nb === 2 ? 0.035 : 0.03, tol2 = tol * tol
  const bgD2 = F ? (p) => d2(T, p * 3, F, p * 3) : (p) => { let m = Infinity; for (let b = 0; b < nb; b++) m = Math.min(m, d2(T, p * 3, B, b * 3)); return m }
  const isBg = (p) => (masked && masked[p]) || (alpha[p] && (key ? bgD2(p) <= tol2 : bgD2(p) < tol2))
  let border = 0, hit = 0, spread = 0
  for (let p = 0; p < n; p++) {
    const x = p % w, y = (p - x) / w
    if (x && y && x < w - 1 && y < h - 1) continue
    border++
    if (isBg(p)) { hit++; if (alpha[p]) spread += bgD2(p) }
  }
  const solidAuto = mode === 'auto' && nb === 1
  if (!key && hit < (solidAuto ? 0.9 : 0.6) * border) return refuse(`border coverage ${Math.round((100 * hit) / border)}% < ${solidAuto ? 90 : 60}%`)
  if (solidAuto && spread / hit >= 0.03 * 0.03) return refuse('border color spread too high')
  const pass0 = (p) => !alpha[p] || isBg(p)
  const ring4 = (p) => { const x = p % w; return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w >= n ? -1 : p + w] }
  const ring = connectivity === 8 ? (p) => {
    const x = p % w, r = ring4(p)
    if (x > 0) r.push(p - w - 1, p + w - 1 < n ? p + w - 1 : -1)
    if (x < w - 1) r.push(p - w + 1, p + w + 1 < n ? p + w + 1 : -1)
    return r
  } : ring4
  // a cell between the two checker colours with only background around it straddles two squares
  const pass = (p) => pass0(p) || (nb === 2 && segD2(T, p * 3, B, 0, B, 3) < tol2 && ring4(p).every((q) => q < 0 || pass0(q)))
  const gone = new Uint8Array(n), queue = new Int32Array(n)
  let qh = 0, qt = 0
  for (let p = 0; p < n; p++) {
    const x = p % w, y = (p - x) / w
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && pass(p)) { gone[p] = 1; queue[qt++] = p }
  }
  while (qh < qt) {
    for (const q of ring(queue[qh++])) if (q >= 0 && !gone[q] && pass(q)) { gone[q] = 1; queue[qt++] = q }
  }
  if (mode === 'auto') { // sprite check: a floating subject leaves ≤ 2% of the border opaque; tiles/scenes/full-bleed art do not
    let kept = 0
    for (let p = 0; p < n; p++) { const x = p % w, y = (p - x) / w; if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !gone[p]) kept++ }
    if (kept > 0.02 * border) return refuse('subject touches the border')
  }
  let left = false
  for (let p = 0; p < n && !left; p++) left = alpha[p] && !gone[p]
  if (!left) return refuse('no subject')
  // background specks (BG-D): a floating 8-connected opaque component (every outside 8-neighbor
  // removed or off-canvas) under SPECK_AREA of the remaining opaque cells whose cells all lie within
  // SPECK_DE of a background color is background noise the tolerance missed; it goes with the background
  let specks = 0
  {
    const seen = new Uint8Array(n), comp = []
    let opaque = 0
    for (let p = 0; p < n; p++) if (alpha[p] && !gone[p]) opaque++
    for (let s0 = 0; s0 < n; s0++) {
      if (!alpha[s0] || gone[s0] || seen[s0]) continue
      comp.length = 0; comp.push(s0); seen[s0] = 1
      let floating = true, near = true
      for (let i = 0; i < comp.length; i++) {
        const p = comp[i], x = p % w, y = (p - x) / w
        if (bgD2(p) >= SPECK_DE * SPECK_DE) near = false
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, q = ny * w + nx
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h || gone[q]) continue
          if (!alpha[q]) floating = false
          else if (!seen[q]) { seen[q] = 1; comp.push(q) }
        }
      }
      if (floating && near && comp.length < SPECK_AREA * opaque) { for (const p of comp) gone[p] = 1; specks += comp.length }
    }
  }
  let removed = 0, haloChanged = 0
  for (let p = 0; p < n; p++) if (gone[p] && out.alpha[p]) { out.alpha[p] = 0; removed++ }
  if (halo) for (let p = 0; p < n; p++) {
    if (gone[p] || !alpha[p]) continue
    const nbrs = ring4(p)
    if (!nbrs.some((q) => q >= 0 && gone[q])) continue
    let best = -1, bd = 0.03 * 0.03
    for (const q of nbrs) {
      if (q < 0 || gone[q] || !alpha[q] || isBg(q)) continue
      for (let b = 0; b < nb; b++) {
        const dd = F ? segD2(T, p * 3, T, q * 3, F, p * 3) : segD2(T, p * 3, T, q * 3, B, b * 3)
        if (dd < bd) { bd = dd; best = q }
      }
    }
    if (best >= 0 && (lab[p * 3] !== lab[best * 3] || lab[p * 3 + 1] !== lab[best * 3 + 1] || lab[p * 3 + 2] !== lab[best * 3 + 2])) {
      for (let a = 0; a < 3; a++) out.lab[p * 3 + a] = lab[best * 3 + a]
      if (out.rgb) out.rgb[p] = cells.rgb[best]
      haloChanged++
    }
  }
  return { ...out, removed: gone, background: { applied: true, reason: null, removed, specks, haloChanged } }
}
