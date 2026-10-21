// Steps 5b and 8: illustration-path resampling and native -> target reduction (contract: algorithm-design.md).
import { SRGB_TO_LINEAR, linearToOklab, toe } from './color.js'
import { PixilateError } from './canonical.js'

/** Exact box-filter taps (fractional coverage) mapping length `src` onto `dst` samples. */
function boxTaps(src, dst) {
  const start = new Int32Array(dst), len = new Int32Array(dst), wts = []
  for (let X = 0; X < dst; X++) {
    const a = (X * src) / dst, b = ((X + 1) * src) / dst
    const j0 = Math.floor(a), j1 = Math.min(src, Math.ceil(b))
    start[X] = j0; len[X] = j1 - j0
    for (let j = j0; j < j1; j++) wts.push((Math.min(b, j + 1) - Math.max(a, j)) / (b - a))
  }
  const off = new Int32Array(dst)
  for (let X = 1; X < dst; X++) off[X] = off[X - 1] + len[X - 1]
  return { start, len, off, w: Float64Array.from(wts) }
}

/** Area resample of a premultiplied linear RGBA source (W x H, 4 floats/px) to sw x sh -> OKLab + coverage. */
function areaResample(src, W, H, sw, sh) {
  const tx = boxTaps(W, sw), ty = boxTaps(H, sh)
  const row = new Float64Array(sw * H * 4)
  for (let y = 0; y < H; y++) {
    for (let X = 0; X < sw; X++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let t = 0; t < tx.len[X]; t++) {
        const p = (y * W + tx.start[X] + t) * 4, wt = tx.w[tx.off[X] + t]
        r += src[p] * wt; g += src[p + 1] * wt; b += src[p + 2] * wt; a += src[p + 3] * wt
      }
      const o = (y * sw + X) * 4
      row[o] = r; row[o + 1] = g; row[o + 2] = b; row[o + 3] = a
    }
  }
  const lab = new Float64Array(sw * sh * 3), A = new Float64Array(sw * sh)
  for (let Y = 0; Y < sh; Y++) {
    for (let X = 0; X < sw; X++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let t = 0; t < ty.len[Y]; t++) {
        const o = ((ty.start[Y] + t) * sw + X) * 4, wt = ty.w[ty.off[Y] + t]
        r += row[o] * wt; g += row[o + 1] * wt; b += row[o + 2] * wt; a += row[o + 3] * wt
      }
      const q = Y * sw + X
      A[q] = a
      if (a > 0) linearToOklab(r / a, g / a, b / a, lab, q * 3)
    }
  }
  return { lab, A }
}

/** Summed-area Kuwahara (radius r), alpha-weighted; returns new OKLab. */
function kuwahara(lab, A, w, h, r) {
  const W1 = w + 1, S = [0, 1, 2, 3, 4].map(() => new Float64Array(W1 * (h + 1)))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = y * w + x, a = A[q], L = lab[q * 3], aa = lab[q * 3 + 1], bb = lab[q * 3 + 2], o = (y + 1) * W1 + x + 1
      for (let k = 0; k < 5; k++) {
        const v = k === 0 ? a : k === 1 ? a * L : k === 2 ? a * aa : k === 3 ? a * bb : a * (L * L + aa * aa + bb * bb)
        S[k][o] = v + S[k][o - 1] + S[k][o - W1] - S[k][o - W1 - 1]
      }
    }
  }
  const box = (k, x0, y0, x1, y1) => S[k][(y1 + 1) * W1 + x1 + 1] - S[k][y0 * W1 + x1 + 1] - S[k][(y1 + 1) * W1 + x0] + S[k][y0 * W1 + x0]
  const out = Float64Array.from(lab)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity, bL = 0, ba = 0, bb = 0, found = false
      for (let quad = 0; quad < 4; quad++) { // quadrants (-1, -1), (1, -1), (-1, 1), (1, 1)
        const left = !(quad & 1), up = quad < 2
        const x0 = Math.max(0, left ? x - r : x), x1 = Math.min(w - 1, left ? x : x + r)
        const y0 = Math.max(0, up ? y - r : y), y1 = Math.min(h - 1, up ? y : y + r)
        const sw = box(0, x0, y0, x1, y1)
        if (sw <= 0) continue
        const mL = box(1, x0, y0, x1, y1) / sw, ma = box(2, x0, y0, x1, y1) / sw, mb = box(3, x0, y0, x1, y1) / sw
        const v = box(4, x0, y0, x1, y1) / sw - (mL * mL + ma * ma + mb * mb)
        if (v < best) { best = v; bL = mL; ba = ma; bb = mb; found = true }
      }
      if (found) { const o = (y * w + x) * 3; out[o] = bL; out[o + 1] = ba; out[o + 2] = bb }
    }
  }
  return out
}

const CW = [1, 2, 2, 1] // center weights inside a 4x4 block
const RIDGE_R = 3, RIDGE_T = 0.06 // top-hat radius at S (~0.75 target cell) and per-cell L threshold

/** Separable square min (isMax false) or max filter of radius r, edges clipped. */
function morph(src, w, h, r, isMax) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h)
  // direct Math.max / Math.min calls (inlined), not through a function variable: ~3x faster
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = src[y * w + x]
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) v = isMax ? Math.max(v, src[y * w + i]) : Math.min(v, src[y * w + i])
    tmp[y * w + x] = v
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = tmp[y * w + x]
    for (let j = Math.max(0, y - r); j <= Math.min(h - 1, y + r); j++) v = isMax ? Math.max(v, tmp[j * w + x]) : Math.min(v, tmp[j * w + x])
    out[y * w + x] = v
  }
  return out
}

/**
 * Literature E anti-vanish/anti-double: per target cell, mean black (dark) and white (light) top-hat
 * of L at S. Returns +1 (dark ridge) / -1 (light ridge) / 0 per cell. A cell is a ridge if its mean
 * exceeds RIDGE_T and it is the strict maximum across the line along x or y (ties to the lower
 * index), so a line straddling two cells claims exactly one of them.
 */
function ridges(lab, A, targetW, targetH) {
  const sw = targetW * 4, sh = targetH * 4, ns = sw * sh, Ld = new Float64Array(ns), Lb = new Float64Array(ns)
  for (let q = 0; q < ns; q++) { const op = A[q] >= 0.5; Ld[q] = op ? lab[q * 3] : 1; Lb[q] = op ? lab[q * 3] : 0 }
  const close = morph(morph(Ld, sw, sh, RIDGE_R, true), sw, sh, RIDGE_R, false)
  const open = morph(morph(Lb, sw, sh, RIDGE_R, false), sw, sh, RIDGE_R, true)
  const n = targetW * targetH, D = [new Float64Array(n), new Float64Array(n)], out = new Int8Array(n)
  for (let q = 0; q < ns; q++) {
    const c = Math.floor(q / sw / 4) * targetW + Math.floor((q % sw) / 4)
    D[0][c] += (close[q] - Ld[q]) / 16; D[1][c] += (Lb[q] - open[q]) / 16
  }
  for (let c = 0; c < n; c++) {
    const x = c % targetW, y = (c - x) / targetW
    let best = RIDGE_T
    for (let s = 0; s < 2; s++) {
      const v = D[s][c], g = (dx, dy) => (x + dx < 0 || y + dy < 0 || x + dx >= targetW || y + dy >= targetH ? 0 : D[s][c + dy * targetW + dx])
      const peak = (v >= g(-1, 0) && v > g(1, 0)) || (v >= g(0, -1) && v > g(0, 1))
      if (v > best && peak) { best = v; out[c] = s ? -1 : 1 }
    }
  }
  return out
}

/**
 * Step 5b selection per 4x4 block of the working image S: PixelOE contrast rule on L (min-L pixel
 * if the bright tail is long, max-L pixel in the mirror case, else the center-weighted medoid);
 * thin-feature ridge cells take their darkest (dark ridge) or brightest (light ridge) pixel. Ridges
 * are found and picked on `raw` (pre-Kuwahara), because Kuwahara erases lines thinner than r + 1.
 */
function select(flat, A, targetW, targetH, raw) {
  const sw = targetW * 4, n = targetW * targetH, ridge = ridges(raw, A, targetW, targetH)
  const out = new Float32Array(n * 3), alpha = new Uint8Array(n), dominance = new Float32Array(n)
  const ids = new Int32Array(16), Ls = new Float64Array(16), sorted = new Float64Array(16)
  for (let ty = 0; ty < targetH; ty++) {
    for (let tx = 0; tx < targetW; tx++) {
      const c = ty * targetW + tx, lab = ridge[c] ? raw : flat
      let m = 0, sum = 0, wsum = 0, wL = 0, wa = 0, wb = 0
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const q = (ty * 4 + j) * sw + tx * 4 + i
        if (A[q] < 0.5) continue
        const wt = CW[i] * CW[j]
        ids[m] = q; Ls[m] = lab[q * 3]; sum += Ls[m]; m++
        wsum += wt; wL += wt * lab[q * 3]; wa += wt * lab[q * 3 + 1]; wb += wt * lab[q * 3 + 2]
      }
      if (m < 8) { dominance[c] = 1; continue }
      alpha[c] = 255
      for (let k = 0; k < m; k++) { // stable insertion sort of Ls[0..m) (m <= 16) into sorted
        const v = Ls[k]
        let j = k
        for (; j > 0 && sorted[j - 1] > v; j--) sorted[j] = sorted[j - 1]
        sorted[j] = v
      }
      const med = (sorted[(m - 1) >> 1] + sorted[m >> 1]) / 2, mean = sum / m, lo = sorted[0], hi = sorted[m - 1]
      let pick = -1
      if (ridge[c] > 0) { for (let k = 0; k < m; k++) if (pick < 0 || Ls[k] < Ls[pick]) pick = k }
      else if (ridge[c] < 0) { for (let k = 0; k < m; k++) if (pick < 0 || Ls[k] > Ls[pick]) pick = k }
      else if (med < mean && hi - med > med - lo) { for (let k = 0; k < m; k++) if (pick < 0 || Ls[k] < Ls[pick]) pick = k }
      else if (med > mean && med - lo > hi - med) { for (let k = 0; k < m; k++) if (pick < 0 || Ls[k] > Ls[pick]) pick = k }
      else {
        wL /= wsum; wa /= wsum; wb /= wsum
        let bd = Infinity
        for (let k = 0; k < m; k++) {
          const o = ids[k] * 3, dL = lab[o] - wL, da = lab[o + 1] - wa, db = lab[o + 2] - wb, dd = dL * dL + da * da + db * db
          if (dd < bd) { bd = dd; pick = k }
        }
      }
      const o = ids[pick] * 3
      out[c * 3] = lab[o]; out[c * 3 + 1] = lab[o + 1]; out[c * 3 + 2] = lab[o + 2]
      let close = 0
      for (let k = 0; k < m; k++) {
        const p = ids[k] * 3, dL = lab[p] - lab[o], da = lab[p + 1] - lab[o + 1], db = lab[p + 2] - lab[o + 2]
        if (dL * dL + da * da + db * db < 0.05 * 0.05) close++
      }
      dominance[c] = close / m
    }
  }
  return { w: targetW, h: targetH, lab: out, alpha, dominance }
}

/** Premultiplied linear source (4 floats/px). */
function linearPremul(img) {
  const W = img.width, H = img.height, d = img.data, src = new Float32Array(W * H * 4)
  for (let p = 0; p < W * H; p++) {
    const al = d[p * 4 + 3] / 255
    src[p * 4] = SRGB_TO_LINEAR[d[p * 4]] * al; src[p * 4 + 1] = SRGB_TO_LINEAR[d[p * 4 + 1]] * al
    src[p * 4 + 2] = SRGB_TO_LINEAR[d[p * 4 + 2]] * al; src[p * 4 + 3] = al
  }
  return src
}

/** areaCells(img, sw, sh) -> Cells: plain linear-light area cells (opaque at coverage >= 0.5), e.g. for a background mask. */
export function areaCells(img, sw, sh) {
  const { lab, A } = areaResample(linearPremul(img), img.width, img.height, sw, sh)
  return { w: sw, h: sh, lab: Float32Array.from(lab), alpha: Uint8Array.from(A, (a) => (a >= 0.5 ? 255 : 0)), dominance: new Float32Array(sw * sh).fill(1) }
}

/**
 * resampleToTarget(img, targetW, targetH) -> Cells: linear-light area downsample to S = 4 x target,
 * SAT Kuwahara (r = 2), then the Step 5b selection (with thin-feature ridges).
 */
export function resampleToTarget(img, targetW, targetH) {
  const { lab, A } = areaResample(linearPremul(img), img.width, img.height, targetW * 4, targetH * 4)
  return select(kuwahara(lab, A, targetW * 4, targetH * 4, 2), A, targetW, targetH, lab)
}

const TAU_LO = 0.05 // ΔE (toe-L OKLab) under which two palette entries vote as one tone group
const TAU_HI = 0.15, BETA = 10 // salience: groups farther than TAU_HI from the regional color get boosted
const THIN_MIN = 0.25 // minimum opaque coverage for a thin-silhouette (ridge) cell
const FEAT = 0.4 // a source feature (tone-group component) needs this many output cells of area to be salient
const BRIDGE = 0.15 // feature coverage that lets a cell bridge a 1-cell gap between two cells of that feature
const EXTREME = 9, EXTREME_FEAT = 0.15 // extreme ratio: source px per output cell (r ~ 4.5); interior feature coverage floor
const NEAR_NATIVE = 1.5 // below this many source px per output cell, busy-spot accents from small source features stay
const TEXTURE = 4 // this many separate source pieces of a color near a cell make it texture, not an accent
const ACCENT = 2 // source components under this many output cells of area are intentional accents
export const COVERAGE_BUDGET = 1 << 25 // max output cells x palette entries per coverage table (2 Float32 tables, 128 MiB each)

/**
 * reduceToTarget(indexed, tw, th) -> Indexed + dominance (Step 8, any ratio): native pixel art onto
 * a tw x th grid by exact fractional coverage. Palette entries are first merged into tone groups
 * (within TAU_LO of a more frequent entry; chroma counts double). Then per output cell:
 * 1. alpha: opaque coverage ≥ 0.5, or ≥ THIN_MIN where the cell is the ridge across a thin part;
 * 2. color: the group with the most coverage, unless a salient group (> TAU_HI from the 3x3
 *    regional group) from a source feature of ≥ FEAT cells is the ridge across that feature and
 *    its contrast-boosted coverage beats the rest of the cell (one cell per line crossing); a
 *    plain cell that joins two separate pieces of such a feature line bridges the gap;
 * 3. orphans keep only as accents (distinct from all neighbors; calm spot or a small source
 *    feature), else take the neighbor mode: no specks, no dashes from cut-off strands;
 * 4. outline: if most of the source silhouette is darker than inside, every output silhouette
 *    cell takes the dominant outline group near its footprint (closed 1 px outline).
 * Cleanup passes (gap bridging, step 3 and step 4) run only with `clean`; `changed` counts the
 * cells each one changed. tw x th x K above COVERAGE_BUDGET throws 'algorithm-budget-exceeded'.
 * dominance (for cleanup) = 1 for feature/accent/outline picks, else the winner's coverage share.
 */
export function reduceToTarget(indexed, tw, th, { clean = true } = {}) {
  const { w, h, index, palette } = indexed, K = palette.length / 3, n = tw * th
  if (n * K > COVERAGE_BUDGET) throw new PixilateError('algorithm-budget-exceeded', `coverage table ${tw}x${th} cells x ${K} colors exceeds ${COVERAGE_BUDGET}`)
  const changed = { bridge: 0, orphan: 0, outline: 0 }
  const P = toe(palette)
  // tone groups: entries within TAU_LO of a more frequent entry join it (greedy by source count)
  // (group distance doubles chroma: hue/chroma shifts are features, small lightness steps are shading)
  const D = new Float32Array(K * K), DG = new Float32Array(K * K), uses = new Int32Array(K), rep = new Int16Array(K).fill(-1)
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    const dL = P[i * 3] - P[j * 3], da = P[i * 3 + 1] - P[j * 3 + 1], db = P[i * 3 + 2] - P[j * 3 + 2]
    D[i * K + j] = Math.sqrt(dL * dL + da * da + db * db)
    DG[i * K + j] = Math.sqrt(dL * dL + 4 * (da * da + db * db))
  }
  for (const v of index) if (v >= 0) uses[v]++
  const order = Array.from({ length: K }, (_, i) => i).sort((a, b) => uses[b] - uses[a] || a - b)
  for (const i of order) {
    if (!uses[i]) continue
    for (const j of order) if (rep[j] === j && DG[i * K + j] < TAU_LO) { rep[i] = j; break }
    if (rep[i] < 0) rep[i] = i
  }
  const G = Int16Array.from(index, (v) => (v < 0 ? -1 : rep[v])) // source as tone groups
  // source features: 8-connected same-group components; big = area >= FEAT output cells
  const size = new Int32Array(w * h), root = new Int32Array(w * h), seen = new Uint8Array(w * h), queue = new Int32Array(w * h)
  const cellArea = (w / tw) * (h / th)
  for (let s0 = 0; s0 < w * h; s0++) {
    if (G[s0] < 0 || seen[s0]) continue
    let head = 0, tail = 0
    queue[tail++] = s0; seen[s0] = 1
    while (head < tail) {
      const p = queue[head++], x = p % w, y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[q] && G[q] === G[s0]) { seen[q] = 1; queue[tail++] = q }
      }
    }
    for (let i = 0; i < tail; i++) { size[queue[i]] = tail; root[queue[i]] = s0 }
  }
  // coverage per (cell, group): all source pixels (cov) and feature pixels only (covB)
  const tx = boxTaps(w, tw), ty = boxTaps(h, th), cov = new Float32Array(n * K), covB = new Float32Array(n * K), A = new Float32Array(n)
  for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
    const c = Y * tw + X
    for (let j = 0; j < ty.len[Y]; j++) {
      const row = (ty.start[Y] + j) * w, wy = ty.w[ty.off[Y] + j]
      for (let i = 0; i < tx.len[X]; i++) {
        const p = row + tx.start[X] + i, v = G[p]
        if (v < 0) continue
        const wt = wy * tx.w[tx.off[X] + i]
        cov[c * K + v] += wt; A[c] += wt
        if (size[p] >= FEAT * cellArea) covB[c * K + v] += wt
      }
    }
  }
  // source outline: silhouette pixels darker than their inward neighbors (ol); gOut = its main
  // group, or -1 when under half the silhouette is outline (lineless art, opaque scenes)
  const ol = new Uint8Array(w * h), N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  let gOut = -1
  if (index.some((v) => v < 0)) {
    const src = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : index[y * w + x])
    const sb = new Uint8Array(w * h), olCount = new Int32Array(K)
    let nb = 0, no = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src(x, y) >= 0 && N4.some(([dx, dy]) => src(x + dx, y + dy) < 0)) sb[y * w + x] = 1
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (!sb[p]) continue
      let s = 0, m = 0
      for (const [dx, dy] of N4) { const v = src(x + dx, y + dy); if (v >= 0 && !sb[(y + dy) * w + x + dx]) { s += P[v * 3]; m++ } }
      if (!m) continue // thin part: classified below by the dominant outline group
      nb++
      if (P[G[p] * 3] <= s / m - 0.05) { ol[p] = 1; no++; olCount[G[p]]++ }
    }
    let g = 0
    for (let k = 1; k < K; k++) if (olCount[k] > olCount[g]) g = k
    for (let p = 0; p < w * h; p++) if (sb[p] && !ol[p] && G[p] === g) ol[p] = 1
    if (nb && no * 2 >= nb && olCount[g] * 4 >= nb) gOut = g // one outline group holds a real share of it (not an edge-noise band)
  }

  const at = (arr, k) => (X, Y) => (X < 0 || Y < 0 || X >= tw || Y >= th ? 0 : arr[(Y * tw + X) * K + k])
  // ridge test (ties go to the lower index): v is the across-feature maximum along x or y, and no
  // 4-neighbor holds more (a line's flank is no ridge)
  const ridge = (f, X, Y) => {
    const v = f(X, Y), l = f(X - 1, Y), r = f(X + 1, Y), u = f(X, Y - 1), d = f(X, Y + 1)
    return v >= Math.max(l, r, u, d) && ((v >= l && v > r) || (v >= u && v > d))
  }
  const Af = (X, Y) => (X < 0 || Y < 0 || X >= tw || Y >= th ? 0 : A[Y * tw + X])

  const out = new Int16Array(n).fill(-1), dominance = new Float32Array(n).fill(1), reg = new Float64Array(K)
  const ctx = new Int16Array(n), feat = new Int16Array(n).fill(-1), picked = new Uint8Array(n)
  const op = new Uint8Array(n)
  for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) op[Y * tw + X] = A[Y * tw + X] >= 0.5 || (A[Y * tw + X] >= THIN_MIN && ridge(Af, X, Y)) ? 1 : 0
  const opaqueAt = (x, y) => x >= 0 && y >= 0 && x < tw && y < th && op[y * tw + x]
  // extreme ratios (16 px from 100+): interior cells read as flat masses, as a pixel artist draws
  // them. The outline group cannot win them by plain coverage (a big footprint sums every line into
  // a dark mass; the outline stays on the silhouette), and only features covering ≥ EXTREME_FEAT of
  // the cell (eyes, not hair strands) override the vote.
  const extreme = cellArea >= EXTREME
  const inner = (X, Y) => opaqueAt(X - 1, Y) && opaqueAt(X + 1, Y) && opaqueAt(X, Y - 1) && opaqueAt(X, Y + 1)
  // best salient feature at c whose boosted coverage beats the rest of the cell; with `claim` (pass
  // 2), neighbors won by a different feature do not count against the ridge (an iris under a lash)
  const feature = (X, Y, claim) => {
    const c = Y * tw + X, a = A[c]
    let f = -1, fm = 0
    for (let k = 0; k < K; k++) {
      const g = cov[c * K + k], gb = covB[c * K + k], d = D[k * K + ctx[c]]
      if (!gb || d <= TAU_HI || (extreme && gb < EXTREME_FEAT && inner(X, Y))) continue
      const fk = claim ? (x, y) => (x < 0 || y < 0 || x >= tw || y >= th || (claim[y * tw + x] >= 0 && claim[y * tw + x] !== k) ? 0 : covB[(y * tw + x) * K + k]) : at(covB, k)
      if (!ridge(fk, X, Y)) continue
      const m = gb * (1 + BETA * (d - TAU_HI)) - (a - g)
      if (m > fm) { fm = m; f = k }
    }
    return f
  }
  for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
    const c = Y * tw + X, a = A[c]
    if (!op[c]) continue
    // regional color: the group with the most coverage over the 3x3 neighborhood
    reg.fill(0)
    for (let y = Math.max(0, Y - 1); y <= Math.min(th - 1, Y + 1); y++) for (let x = Math.max(0, X - 1); x <= Math.min(tw - 1, X + 1); x++) {
      for (let k = 0, o = (y * tw + x) * K; k < K; k++) reg[k] += cov[o + k]
    }
    const skip = extreme && gOut >= 0 && inner(X, Y) && cov[c * K + gOut] < a ? gOut : -1
    let best = skip === 0 ? 1 : 0, r = 0
    for (let k = 1; k < K; k++) { if (reg[k] > reg[r]) r = k; if (k !== skip && cov[c * K + k] > cov[c * K + best]) best = k }
    ctx[c] = r
    feat[c] = feature(X, Y, null)
    picked[c] = feat[c] >= 0 ? 1 : 0
    out[c] = feat[c] >= 0 ? feat[c] : best
    dominance[c] = feat[c] >= 0 ? 1 : Math.min(a, cov[c * K + best] / a)
  }
  for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
    const c = Y * tw + X
    if (out[c] < 0 || feat[c] >= 0) continue
    const f = feature(X, Y, feat)
    if (f >= 0) { out[c] = f; dominance[c] = 1; picked[c] = 1 }
  }
  // bridge 1-cell gaps in lines: a plain (non-feature) cell that would join two separate pieces of
  // a contrasting group k among its 8 neighbors, and whose footprint holds part of a k feature,
  // takes k (line steps that no cell's ridge claimed). The pieces must be one source line thinner
  // than an output cell: at least two of them hold the same source feature component, and that
  // component crosses this cell with a run thinner than a cell side (a thick stroke cannot lose a
  // step to the reduction; dots, dither and separate strokes are not bridged into blobs).
  if (clean) {
    const old = Int16Array.from(out), NB = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
    const nv = new Int16Array(8), cc = new Int8Array(8), side = Math.sqrt(cellArea)
    const run = new Int32Array(w * h) // min(horizontal, vertical) same-group run through each pixel
    {
      const hr = new Int32Array(w * h), vr = new Int32Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0, s0 = 0; x <= w; x++) if (x === w || (x > s0 && G[y * w + x] !== G[y * w + s0])) { for (let i = s0; i < x; i++) hr[y * w + i] = x - s0; s0 = x }
      for (let x = 0; x < w; x++) for (let y = 0, s0 = 0; y <= h; y++) if (y === h || (y > s0 && G[y * w + x] !== G[s0 * w + x])) { for (let i = s0; i < y; i++) vr[i * w + x] = y - s0; s0 = y }
      for (let p = 0; p < w * h; p++) run[p] = Math.min(hr[p], vr[p])
    }
    const rootsIn = (X, Y, k, into, thin) => { // feature component roots of group k in the cell footprint
      for (let y = ty.start[Y]; y < ty.start[Y] + ty.len[Y]; y++) for (let x = tx.start[X]; x < tx.start[X] + tx.len[X]; x++) {
        const p = y * w + x
        if (G[p] === k && size[p] >= FEAT * cellArea && (!thin || run[p] < side)) into.add(root[p])
      }
      return into
    }
    const sameLine = (X, Y, k, pieces) => {
      const R = rootsIn(X, Y, k, new Set(), true)
      let hits = 0
      for (let piece = 0; piece < pieces; piece++) {
        const S = new Set()
        for (let j = 0; j < 8; j++) if (cc[j] === piece && nv[j] === k) rootsIn(X + NB[j][0], Y + NB[j][1], k, S)
        for (const r of S) if (R.has(r)) { hits++; break }
      }
      return hits >= 2
    }
    for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
      const c = Y * tw + X, v = old[c]
      if (v < 0 || picked[c]) continue
      for (let i = 0; i < 8; i++) { const x = X + NB[i][0], y = Y + NB[i][1]; nv[i] = x < 0 || y < 0 || x >= tw || y >= th ? -1 : old[y * tw + x] }
      let pick = -1
      for (let i = 0; i < 8; i++) {
        const k = nv[i]
        if (k < 0 || k === v || covB[c * K + k] < BRIDGE || D[k * K + v] <= TAU_HI || (pick >= 0 && covB[c * K + k] <= covB[c * K + pick])) continue
        // separate pieces of k around c: ring members joined when 8-adjacent to each other
        cc.fill(-1)
        let pieces = 0
        for (let j = 0; j < 8; j++) {
          if (nv[j] !== k || cc[j] >= 0) continue
          const stack = [j]; cc[j] = pieces
          while (stack.length) {
            const q = stack.pop()
            for (let t = 0; t < 8; t++) if (nv[t] === k && cc[t] < 0 && Math.abs(NB[t][0] - NB[q][0]) <= 1 && Math.abs(NB[t][1] - NB[q][1]) <= 1) { cc[t] = pieces; stack.push(t) }
          }
          pieces++
        }
        if (pieces >= 2 && sameLine(X, Y, k, pieces)) pick = k
      }
      if (pick >= 0) { out[c] = pick; dominance[c] = 1; changed.bridge++ }
    }
  }

  // orphans (no same-group 8-neighbor) survive only as accents: distinct (> TAU_HI) from every
  // opaque neighbor, and either in a calm spot (<= 3 neighbor groups) or a small isolated feature
  // in the source too (eye, glint). Others (specks, cut-off strand pieces) take the neighbor mode.
  if (clean) {
    const old = Int16Array.from(out), nb = new Int16Array(8), rootSeen = new Int32Array(TEXTURE)
    for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
      const c = Y * tw + X, v = old[c]
      if (v < 0) continue
      let m = 0, same = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = X + dx, y = Y + dy
        if ((dx || dy) && x >= 0 && y >= 0 && x < tw && y < th && old[y * tw + x] >= 0) { nb[m++] = old[y * tw + x]; if (nb[m - 1] === v) same = true }
      }
      if (same || !m) continue
      let groups = 0, minD = Infinity, mode = -1, mc = 0
      for (let i = 0; i < m; i++) {
        let cnt = 0, first = true
        for (let j = 0; j < m; j++) { if (nb[j] === nb[i]) cnt++; if (j < i && nb[j] === nb[i]) first = false }
        if (first) groups++
        if (cnt > mc || (cnt === mc && nb[i] < mode)) { mc = cnt; mode = nb[i] }
        minD = Math.min(minD, D[v * K + nb[i]])
      }
      if (minD > TAU_HI) {
        // separate source pieces of v around c (5x5 cells, 3x3 at extreme ratios): an accent is a few, texture many
        const R = extreme ? 1 : 2, xa = Math.max(0, X - R), xb = Math.min(tw - 1, X + R), ya = Math.max(0, Y - R), yb = Math.min(th - 1, Y + R)
        const x0 = tx.start[xa], x1 = tx.start[xb] + tx.len[xb], y0 = ty.start[ya], y1 = ty.start[yb] + ty.len[yb]
        let pieces = 0, src = 0
        for (let y = y0; y < y1 && pieces < TEXTURE; y++) for (let x = x0; x < x1 && pieces < TEXTURE; x++) {
          const p = y * w + x
          if (G[p] !== v) continue
          let known = false
          for (let i = 0; i < pieces; i++) if (rootSeen[i] === root[p]) known = true
          if (!known) rootSeen[pieces++] = root[p]
          src = Math.max(src, size[p])
        }
        // calm accent (eye, glint), or a compact feature filling most of its cell (an eye under busy shading)
        if (pieces < TEXTURE && (groups <= 3 || cov[c * K + v] >= 0.5 * A[c])) continue
        if (cellArea < NEAR_NATIVE && src < ACCENT * cellArea) continue // near-native small detail
      }
      if (out[c] !== mode) changed.orphan++
      out[c] = mode
      dominance[c] = 1
    }
  }

  // outline rebuild: each output silhouette cell takes the outline group found near its footprint
  if (clean && gOut >= 0) {
    const cnt = new Int32Array(K), oat = (X, Y) => (X < 0 || Y < 0 || X >= tw || Y >= th ? -1 : out[Y * tw + X])
    const res = Int16Array.from(out)
    for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
      const c = Y * tw + X
      if (out[c] < 0 || !N4.some(([dx, dy]) => oat(X + dx, Y + dy) < 0)) continue
      // a salient feature's ridge on a thin protrusion (transparency within 2 cells on both opposite
      // sides: a staff, an antenna) keeps its colour; only the true outer boundary takes the outline
      const gap = (dx, dy) => oat(X + dx, Y + dy) < 0 || oat(X + 2 * dx, Y + 2 * dy) < 0
      if (picked[c] && out[c] !== gOut && ((gap(-1, 0) && gap(1, 0)) || (gap(0, -1) && gap(0, 1)))) continue
      cnt.fill(0)
      // footprint grown by one output cell: neighboring outline cells agree on the color
      const ry = Math.ceil(h / th), rx = Math.ceil(w / tw)
      const y0 = Math.max(0, ty.start[Y] - ry), y1 = Math.min(h, ty.start[Y] + ty.len[Y] + ry)
      const x0 = Math.max(0, tx.start[X] - rx), x1 = Math.min(w, tx.start[X] + tx.len[X] + rx)
      let k = -1
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const p = y * w + x
        if (ol[p] && ++cnt[G[p]] > (k < 0 ? 0 : cnt[k])) k = G[p]
      }
      // one outline color unless this stretch is clearly another (a colored selout)
      if (k >= 0) { res[c] = D[k * K + gOut] > TAU_HI ? k : gOut; dominance[c] = 1 }
    }
    for (let c = 0; c < n; c++) if (res[c] !== out[c]) changed.outline++
    out.set(res)
  }
  // an isolated cell that is mostly a source feature (spark, dot) is content, not a speck: full
  // dominance keeps cleanup's island rule off it
  for (let Y = 0; Y < th; Y++) for (let X = 0; X < tw; X++) {
    const c = Y * tw + X, k = out[c]
    if (k < 0 || covB[c * K + k] < 0.5 * cov[c * K + k]) continue
    let alone = true
    for (let dy = -1; dy <= 1 && alone; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && X + dx >= 0 && Y + dy >= 0 && X + dx < tw && Y + dy < th && out[(Y + dy) * tw + X + dx] >= 0) { alone = false; break }
    if (alone) dominance[c] = 1
  }
  return { w: tw, h: th, index: out, palette, rgb: indexed.rgb, dominance, changed }
}

/** Nearest-neighbor integer upscale. */
export function upscaleInteger(indexed, kx, ky) {
  const { w, h, index, palette } = indexed, ow = w * kx, out = new Int16Array(ow * h * ky)
  for (let y = 0; y < h * ky; y++) for (let x = 0; x < ow; x++) out[y * ow + x] = index[((y / ky) | 0) * w + ((x / kx) | 0)]
  return { w: ow, h: h * ky, index: out, palette, rgb: indexed.rgb }
}
