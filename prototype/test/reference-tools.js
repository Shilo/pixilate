// Reference re-implementations of competing AI-pixel-art grid-recovery and downscaling algorithms, for
// scripts/compare.mjs (exploratory, methodology §12). Written clean-room in JavaScript from Pixilate's own
// source-level research spikes. No third-party code was downloaded, cloned, installed, executed or copied.
// Every export is a "reference re-implementation of <tool> <pinned revision> per spike §…, not the tool
// itself": results describe the documented algorithm as the spike reads it, never the shipped product.
// UNKNOWN marks a step the spikes do not document (the simplest substitute is named); INFERRED marks our
// reading of an ambiguous description. Test-only code: not part of the prototype engine.
//
// | export          | original tool, pinned revision, original licence                                   | spike (docs/research-spikes/)                                            |
// |-----------------|------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
// | pixelSnapper    | SpriteFusion Pixel Snapper `ae20461f` (crate 1.0.0; HEAD `e6d81463` same lib.rs), MIT | products/spritefusion-pixel-snapper.md §2–§5 and 2026-10-19 addendum     |
// | pixelDetector   | Astropulse pixeldetector `6267db44`, MIT                                            | landscape/open-source-ecosystem.md "Deep source audits" §1               |
// | unfake          | jenissimo/unfake.js v1.4.0 `66368689`, MIT (core links imagequant, GPL-3.0+/commercial: | products/unfake-js.md (scale/grid detection, downscale, auto colour     |
// |                 | NOT re-implemented; a deterministic k-means stands in)                              | count) and 2026-10-19 addendum (fractional, elastic, inset, order)       |
// | retroDiffusion  | Retro-Diffusion/pixel-art-fixer Standard `ef376e57` (v1.1), MIT                      | products/retro-diffusion-pixel-art-fixer.md (Detection, Reconstruction)  |
// | pixelOE         | KohakuBlueleaf/PixelOE `7ce444b3`, Apache-2.0 (contrast downscale only)             | landscape addendum; planning/prototype-algorithm-design.md "Raster route" |
// | area, nearest   | Pixilate-owned baselines (same maths as scripts/bench.mjs, which runs on import)   | —                                                                        |
import { mulberry32 } from './synth.js'
import { SRGB_TO_LINEAR, cosDet, sinDet } from '../src/lib/core/color.js'

const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })
const luma = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2] // Rec.601 (Snapper luma weights INFERRED)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const medianOf = (a) => {
  const s = Float64Array.from(a).sort(), n = s.length
  return n ? (n & 1 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN
}
const pctOf = (a, q) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] : 0 }

/** Centre-sample resize of a native-size output to the target: the §12.3 "adapted" adapter, never tool support. */
export function adapt(img, tw, th) {
  if (img.width === tw && img.height === th) return img
  const out = blank(tw, th)
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const s = (Math.floor(((y + 0.5) * img.height) / th) * img.width + Math.floor(((x + 0.5) * img.width) / tw)) * 4
    out.data.set(img.data.subarray(s, s + 4), (y * tw + x) * 4)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------
// Shared: Pixel Snapper's analysis quantizer (spike §2): k-means++ in gamma RGB over alpha > 0, fixed seed,
// <= 15 iterations, stop when max squared centre move < 0.01 after the first, empty clusters keep their
// centre, k clamped to the pixel count. ChaCha8(42) is replaced by mulberry32(42) (same role, different
// stream: exact centres differ from the Rust build). Reused as the stated substitute quantizer elsewhere.
// ---------------------------------------------------------------------------------------------------
export function kmeansRGB(img, k, { seed = 42, iters = 15 } = {}) {
  const d = img.data, n = img.width * img.height, labels = new Int32Array(n).fill(-1), ids = []
  for (let p = 0; p < n; p++) if (d[p * 4 + 3] > 0) ids.push(p)
  const N = ids.length
  if (!N) return { centers: new Float64Array(0), labels }
  k = Math.min(k, N)
  const X = new Float64Array(N * 3)
  for (let i = 0; i < N; i++) { const o = ids[i] * 4; X[i * 3] = d[o]; X[i * 3 + 1] = d[o + 1]; X[i * 3 + 2] = d[o + 2] }
  const C = new Float64Array(k * 3), D = new Float64Array(N).fill(Infinity), r = mulberry32(seed)
  const d2 = (i, c) => { const a = X[i * 3] - C[c * 3], b = X[i * 3 + 1] - C[c * 3 + 1], e = X[i * 3 + 2] - C[c * 3 + 2]; return a * a + b * b + e * e }
  for (let c = 0; c < k; c++) {
    let pick = Math.floor(r() * N)
    if (c > 0) {
      let tot = 0
      for (let i = 0; i < N; i++) tot += D[i]
      if (tot > 0) { let t = r() * tot; for (pick = 0; pick < N - 1; pick++) { t -= D[pick]; if (t <= 0) break } }
    }
    C[c * 3] = X[pick * 3]; C[c * 3 + 1] = X[pick * 3 + 1]; C[c * 3 + 2] = X[pick * 3 + 2]
    for (let i = 0; i < N; i++) { const v = d2(i, c); if (v < D[i]) D[i] = v }
  }
  const L = new Int32Array(N), S = new Float64Array(k * 3), cnt = new Float64Array(k)
  const assign = () => {
    for (let i = 0; i < N; i++) {
      let best = 0, bd = d2(i, 0)
      for (let c = 1; c < k; c++) { const v = d2(i, c); if (v < bd) { bd = v; best = c } }
      L[i] = best
    }
  }
  for (let it = 0; it < iters; it++) {
    assign()
    S.fill(0); cnt.fill(0)
    for (let i = 0; i < N; i++) { const c = L[i]; S[c * 3] += X[i * 3]; S[c * 3 + 1] += X[i * 3 + 1]; S[c * 3 + 2] += X[i * 3 + 2]; cnt[c]++ }
    let move = 0
    for (let c = 0; c < k; c++) {
      if (!cnt[c]) continue
      let m = 0
      for (let j = 0; j < 3; j++) { const v = S[c * 3 + j] / cnt[c]; m += (v - C[c * 3 + j]) ** 2; C[c * 3 + j] = v }
      move = Math.max(move, m)
    }
    if (it > 0 && move < 0.01) break
  }
  assign()
  for (let i = 0; i < N; i++) labels[ids[i]] = L[i]
  return { centers: C, labels }
}

/** Replace RGB of every alpha > 0 pixel by its k-means centre (alpha bytes untouched). */
function quantize(img, k) {
  const { centers, labels } = kmeansRGB(img, k), out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }
  for (let p = 0; p < labels.length; p++) if (labels[p] >= 0) for (let j = 0; j < 3; j++) out.data[p * 4 + j] = centers[labels[p] * 3 + j]
  return { image: out, labels }
}

// ---------------------------------------------------------------------------------------------------
// 1. Pixel Snapper (reference re-implementation of SpriteFusion Pixel Snapper `ae20461f` per spike §2–§5).
// ---------------------------------------------------------------------------------------------------
function snapStep(p) { // §3: strict local maxima > 0.2 max, drop peaks within 3 of the last kept, upper median gap
  let mx = 0
  for (const v of p) if (v > mx) mx = v
  if (!(mx > 0)) return null
  const peaks = []
  for (let i = 1; i < p.length - 1; i++) if (p[i] > p[i - 1] && p[i] > p[i + 1] && p[i] > 0.2 * mx && (!peaks.length || i - peaks[peaks.length - 1] > 3)) peaks.push(i)
  if (peaks.length < 2) return null
  const gaps = peaks.slice(1).map((v, i) => v - peaks[i]).sort((a, b) => a - b)
  return gaps[gaps.length >> 1]
}
const meanOf = (p) => p.reduce((s, v) => s + v, 0) / p.length
function snapPick(p, lo, hi, mean) { // strongest profile value in [lo, hi] if it beats half the mean
  let best = -1, bv = -Infinity
  for (let i = lo; i <= hi; i++) if (p[i] > bv) { bv = p[i]; best = i }
  return best >= 0 && bv > 0.5 * mean ? best : -1
}
// §4: canvas-anchored elastic walk, window radius max(0.35 step, 2). The window's upper end is exclusive and
// truncated (a Rust start..end range; INFERRED): with it the four live probes of spike §"Live synthetic test
// matrix" (64->57, 32->25, flat 64->64, 128x64->113x49) are reproduced exactly; an inclusive end gives 50, 18, 64, 98x34.
function snapWalk(p, step, n) {
  const mean = meanOf(p), r = Math.max(0.35 * step, 2), cuts = [0]
  for (let pos = 0; ;) {
    const t = pos + step
    if (t >= n) { cuts.push(n); break }
    const c = snapPick(p, Math.max(pos + 1, Math.floor(t - r)), Math.min(n - 1, Math.floor(t + r) - 1), mean)
    pos = c >= 0 ? c : Math.max(pos + 1, Math.floor(t))
    cuts.push(pos)
  }
  return cuts
}
function snapUniform(p, step, n) { // stabilization: uniform cuts, each snapped locally (INFERRED window = walker's)
  const cnt = Math.max(1, Math.round(n / step)), s = n / cnt, r = Math.max(0.35 * s, 2), mean = meanOf(p), cuts = [0]
  for (let k = 1; k < cnt; k++) {
    const last = cuts[cuts.length - 1], c = snapPick(p, Math.max(last + 1, Math.floor(k * s - r)), Math.min(n - 1, Math.floor(k * s + r) - 1), mean)
    const v = c >= 0 ? c : Math.round(k * s)
    if (v > last && v < n) cuts.push(v)
  }
  cuts.push(n)
  return cuts
}
function modeCells(img, cx, cy) { // §5: exact RGBA mode per cell; tie -> smallest RGBA tuple; empty -> [0,0,0,0]
  const out = blank(cx.length - 1, cy.length - 1), d = img.data, W = img.width
  for (let j = 0; j < cy.length - 1; j++) for (let i = 0; i < cx.length - 1; i++) {
    const m = new Map()
    for (let y = cy[j]; y < cy[j + 1]; y++) for (let x = cx[i]; x < cx[i + 1]; x++) {
      const o = (y * W + x) * 4, key = d[o] * 16777216 + d[o + 1] * 65536 + d[o + 2] * 256 + d[o + 3]
      m.set(key, (m.get(key) ?? 0) + 1)
    }
    let bk = -1, bc = 0
    for (const [k, c] of m) if (c > bc || (c === bc && k < bk)) { bk = k; bc = c }
    if (bk < 0) continue
    const o = (j * out.width + i) * 4
    out.data[o] = Math.floor(bk / 16777216); out.data[o + 1] = Math.floor(bk / 65536) & 255; out.data[o + 2] = Math.floor(bk / 256) & 255; out.data[o + 3] = bk & 255
  }
  return out
}

/** Pixel Snapper reference: returns its own discovered size (no target input exists, spike §7). */
export function pixelSnapper(img, { colors = 16 } = {}) {
  const { width: w, height: h } = img
  if (w < 3 || h < 3) throw new Error('pixelSnapper reference: input below 3x3')
  const q = quantize(img, colors).image, g = new Float64Array(w * h)
  for (let p = 0; p < w * h; p++) g[p] = q.data[p * 4 + 3] ? luma(q.data, p * 4) : 0 // alpha 0 -> black, any alpha > 0 -> full RGB
  const px = new Float64Array(w), py = new Float64Array(h)
  for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) px[x] += Math.abs(g[y * w + x + 1] - g[y * w + x - 1])
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) py[y] += Math.abs(g[(y + 1) * w + x] - g[(y - 1) * w + x])
  const sx = snapStep(px), sy = snapStep(py), fb = Math.max(1, Math.min(w, h) / 64)
  const step = sx && sy ? (Math.max(sx, sy) / Math.min(sx, sy) <= 1.8 ? (sx + sy) / 2 : Math.min(sx, sy)) : sx ?? sy ?? fb
  let cx = snapWalk(px, step, w), cy = snapWalk(py, step, h)
  const eff = (c, n) => n / (c.length - 1), MIN_CUTS = 4 // addendum: min_cuts_per_axis = 4
  if (cx.length < MIN_CUTS && cy.length < MIN_CUTS) { cx = snapUniform(px, fb, w); cy = snapUniform(py, fb, h) }
  else if (cx.length < MIN_CUTS) cx = snapUniform(px, eff(cy, h), w)
  else if (cy.length < MIN_CUTS) cy = snapUniform(py, eff(cx, w), h)
  const ex = eff(cx, w), ey = eff(cy, h)
  if (Math.max(ex, ey) / Math.min(ex, ey) > 1.8) { // cross-axis check; re-snap an axis whose step > 1.2x target (addendum)
    const t = Math.min(ex, ey)
    if (ex > 1.2 * t) cx = snapUniform(px, t, w)
    if (ey > 1.2 * t) cy = snapUniform(py, t, h)
  }
  const image = modeCells(q, cx, cy)
  return { image, native: [image.width, image.height], info: { step, sx, sy } }
}

// ---------------------------------------------------------------------------------------------------
// 2. pixeldetector (reference re-implementation of Astropulse pixeldetector `6267db44` per ecosystem spike §1).
// RGB only (alpha discarded, output opaque). The spike's INFERRED uint8 wrap-around is NOT reproduced: the
// intended signed differences are used. Euclidean RGB distance per adjacent pair (INFERRED). Empty peak
// arrays (the original would fail) give scale 1. Output size rounds image/median (rounding UNKNOWN).
// kCentroid: Pillow's 2-colour quantize is replaced by 2-means seeded with a median-cut split (UNKNOWN
// Pillow method), then the more frequent of the two colours.
// ---------------------------------------------------------------------------------------------------
function scipyPeaks(s) { // find_peaks(height=0, distance=1): local maxima; a flat top resolves to its (lower) middle
  const out = []
  for (let i = 1; i < s.length - 1; i++) {
    if (!(s[i] > s[i - 1])) continue
    let j = i
    while (j + 1 < s.length - 1 && s[j + 1] === s[i]) j++
    if (s[j + 1] < s[i]) out.push((i + j) >> 1)
    i = j
  }
  return out
}
function medianGap(s) {
  const pk = scipyPeaks(s)
  return pk.length < 2 ? 1 : medianOf(pk.slice(1).map((v, i) => v - pk[i]))
}
function twoMeansMajor(px, n) { // px: Float64Array RGB triples
  let ch = 0, rng = -1
  for (let c = 0; c < 3; c++) { let lo = 255, hi = 0; for (let i = 0; i < n; i++) { lo = Math.min(lo, px[i * 3 + c]); hi = Math.max(hi, px[i * 3 + c]) } if (hi - lo > rng) { rng = hi - lo; ch = c } }
  const mean = (sel) => { const m = [0, 0, 0]; let k = 0; for (let i = 0; i < n; i++) if (sel(i)) { k++; for (let c = 0; c < 3; c++) m[c] += px[i * 3 + c] } return k ? m.map((v) => v / k) : null }
  if (rng <= 0) return mean(() => true)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => px[a * 3 + ch] - px[b * 3 + ch] || a - b), side = new Uint8Array(n)
  for (let r = n >> 1; r < n; r++) side[order[r]] = 1
  let M = [mean((i) => !side[i]), mean((i) => side[i])]
  for (let it = 0; it < 3; it++) { // 2 refinements + final assignment
    for (let i = 0; i < n; i++) {
      const d = M.map((m) => (m ? (px[i * 3] - m[0]) ** 2 + (px[i * 3 + 1] - m[1]) ** 2 + (px[i * 3 + 2] - m[2]) ** 2 : Infinity))
      side[i] = d[1] < d[0] ? 1 : 0
    }
    if (it < 2) M = [mean((i) => !side[i]) ?? M[0], mean((i) => side[i]) ?? M[1]]
  }
  let ones = 0
  for (let i = 0; i < n; i++) ones += side[i]
  return ones > n - ones ? M[1] : M[0]
}
function kCentroid(img, ow, oh) {
  const { width: w, height: h, data: d } = img, out = blank(ow, oh), fx = w / ow, fy = h / oh
  for (let ty = 0; ty < oh; ty++) for (let tx = 0; tx < ow; tx++) {
    const x0 = Math.min(w - 1, Math.round(tx * fx)), x1 = clamp(Math.round((tx + 1) * fx), x0 + 1, w)
    const y0 = Math.min(h - 1, Math.round(ty * fy)), y1 = clamp(Math.round((ty + 1) * fy), y0 + 1, h)
    const n = (x1 - x0) * (y1 - y0), px = new Float64Array(n * 3)
    let k = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, k++) { const o = (y * w + x) * 4; px[k * 3] = d[o]; px[k * 3 + 1] = d[o + 1]; px[k * 3 + 2] = d[o + 2] }
    const c = twoMeansMajor(px, n), o = (ty * ow + tx) * 4
    out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255
  }
  return out
}

/** pixeldetector reference: adjacent-difference projections, all peaks, median gap per axis, kCentroid. */
export function pixelDetector(img) {
  const { width: w, height: h, data: d } = img, hs = new Float64Array(w - 1), vs = new Float64Array(h - 1)
  const e = (o, q) => Math.sqrt((d[o] - d[q]) ** 2 + (d[o + 1] - d[q + 1]) ** 2 + (d[o + 2] - d[q + 2]) ** 2)
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) hs[x] += e((y * w + x) * 4, (y * w + x + 1) * 4)
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) vs[y] += e((y * w + x) * 4, ((y + 1) * w + x) * 4)
  const sx = medianGap(hs), sy = medianGap(vs), ow = Math.max(1, Math.round(w / sx)), oh = Math.max(1, Math.round(h / sy))
  return { image: kCentroid(img, ow, oh), native: [ow, oh], info: { scale: [sx, sy] } }
}

// ---------------------------------------------------------------------------------------------------
// 3. unfake.js (reference re-implementation of unfake.js v1.4.0 `66368689` per spike + 2026-10-19 addendum).
// Recipe: library `processImage` defaults (maxColors 32, elastic on, morphology and jaggy cleanup off, dominant
// 0.15). Auto Colors (documented colour_count rule) is implemented but off, as in both the library and browser
// defaults; turning it on cut median emIn roughly in half on the 2026-10-20 compare run. imagequant (GPL-3.0+/commercial) is replaced by kmeansRGB above.
// Integer detector: browser default "Complex Edge" (tiled). UNKNOWN substitutes: fractional-grid phase
// (0.25 px search maximizing edge energy), "coherence" (|DFT| / sum of windowed profile), "integer-like"
// (|p - round p| < 0.05), elastic "edge-energy gain" (mean normalized edge at elastic vs uniform cuts),
// dominant ties (first encountered; the original uses HashMap order).
// ---------------------------------------------------------------------------------------------------
function grayOf(img) {
  const g = new Float64Array(img.width * img.height)
  for (let p = 0; p < g.length; p++) g[p] = luma(img.data, p * 4)
  return g
}
function sobelProfiles(g, W, x0, y0, rw, rh) { // |Sobel x| summed per column, |Sobel y| per row, region interior
  const px = new Float64Array(rw), py = new Float64Array(rh)
  for (let y = y0 + 1; y < y0 + rh - 1; y++) for (let x = x0 + 1; x < x0 + rw - 1; x++) {
    const a = g[(y - 1) * W + x - 1], b = g[(y - 1) * W + x], c = g[(y - 1) * W + x + 1], dd = g[y * W + x - 1], f = g[y * W + x + 1], gg = g[(y + 1) * W + x - 1], hh = g[(y + 1) * W + x], ii = g[(y + 1) * W + x + 1]
    px[x - x0] += Math.abs(c + 2 * f + ii - a - 2 * dd - gg)
    py[y - y0] += Math.abs(gg + 2 * hh + ii - a - 2 * b - c)
  }
  return { px, py }
}
function acPeak(p) { // autocorrelation lags 2..min(n/8,128): skip initial decay, first local peak >= 0.6 max, else max
  const n = p.length, maxLag = Math.min(Math.floor(n / 8), 128)
  if (maxLag < 2) return 0
  const m = meanOf(p), ac = new Float64Array(maxLag + 2)
  for (let l = 0; l <= maxLag + 1; l++) { let s = 0; for (let i = 0; i + l < n; i++) s += (p[i] - m) * (p[i + l] - m); ac[l] = s }
  let start = 2
  const lim = Math.max(Math.floor(maxLag / 2), 3)
  while (start < lim && start < maxLag && ac[start + 1] < ac[start]) start++
  let gl = start
  for (let l = start; l <= maxLag; l++) if (ac[l] > ac[gl]) gl = l
  for (let l = Math.max(start, 1); l <= maxLag; l++) if (ac[l] > ac[l - 1] && ac[l] >= ac[l + 1] && ac[l] >= 0.6 * ac[gl]) return l
  return gl
}
function edgeScale(img) { // tiled 3x3 (25 % overlap), std < 5 skipped, mode of X/Y candidates > 1
  const { width: w, height: h } = img, g = grayOf(img), tw = Math.floor(w / 2.5), th = Math.floor(h / 2.5) // 3 tiles, 25 % overlap: W = 2.5 t
  const central = () => { const rw = Math.floor(w * 0.75), rh = Math.floor(h * 0.75); return [[(w - rw) >> 1, (h - rh) >> 1, rw, rh]] }
  const tiles = []
  if (tw < 50 || th < 50) tiles.push(...central())
  else for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tiles.push([Math.round((i * (w - tw)) / 2), Math.round((j * (h - th)) / 2), tw, th])
  const collect = (regions) => {
    const c = []
    for (const [x0, y0, rw, rh] of regions) {
      if (rw < 30 || rh < 30) continue
      let s = 0, s2 = 0
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) { const v = g[y * w + x]; s += v; s2 += v * v }
      const n = rw * rh
      if (Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) < 5) continue
      const { px, py } = sobelProfiles(g, w, x0, y0, rw, rh)
      for (const pr of [px, py]) { const l = acPeak(pr); if (l > 1) c.push(l) }
    }
    return c
  }
  let cands = collect(tiles)
  if (!cands.length && tiles.length > 1) cands = collect(central())
  if (!cands.length) return 1
  const cnt = new Map()
  for (const c of cands) cnt.set(c, (cnt.get(c) ?? 0) + 1)
  let best = 1, bc = 0
  for (const [k, v] of [...cnt].sort((a, b) => a[0] - b[0])) if (v > bc) { best = k; bc = v }
  return best
}
function sobelPhase(img, s) { // first phase with the highest summed edge strength; equal maxima -> first
  const g = grayOf(img), { px, py } = sobelProfiles(g, img.width, 0, 0, img.width, img.height)
  return [px, py].map((p) => {
    let best = 0, bs = -1
    for (let ph = 0; ph < s; ph++) { let t = 0; for (let i = ph; i < p.length; i += s) t += p[i]; if (t > bs) { bs = t; best = ph } }
    return best
  })
}
function premulProfiles(img) { // addendum: L1 differences of premultiplied RGBA; index i = boundary between i and i+1
  const { width: w, height: h, data: d } = img, px = new Float64Array(w - 1), py = new Float64Array(h - 1)
  const P = new Float64Array(w * h * 4)
  for (let p = 0; p < w * h; p++) { const a = d[p * 4 + 3] / 255; P[p * 4] = d[p * 4] * a; P[p * 4 + 1] = d[p * 4 + 1] * a; P[p * 4 + 2] = d[p * 4 + 2] * a; P[p * 4 + 3] = d[p * 4 + 3] }
  const l1 = (o, q) => Math.abs(P[o] - P[q]) + Math.abs(P[o + 1] - P[q + 1]) + Math.abs(P[o + 2] - P[q + 2]) + Math.abs(P[o + 3] - P[q + 3])
  for (let y = 0; y < h; y++) for (let x = 0; x < w - 1; x++) px[x] += l1((y * w + x) * 4, (y * w + x + 1) * 4)
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w; x++) py[y] += l1((y * w + x) * 4, ((y + 1) * w + x) * 4)
  return [px, py]
}
function fft(re, im) { // in-place iterative radix-2
  const N = re.length
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = cosDet(ang), wi = sinDet(ang)
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
}
function dftMag(x, f) { // |sum x_i e^{-2 pi i f i}| at an arbitrary frequency (cycles/sample)
  const wr = cosDet(-2 * Math.PI * f), wi = sinDet(-2 * Math.PI * f)
  let cr = 1, ci = 0, sr = 0, si = 0
  for (let i = 0; i < x.length; i++) { sr += x[i] * cr; si += x[i] * ci; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr }
  return Math.hypot(sr, si)
}
function fracAxis(prof, len) { // addendum "Fractional grid detector", per axis
  const m = prof.length
  if (m < 16) return null
  const pmax = clamp(m / 6, 4, 160), x = new Float64Array(m)
  let sumW = 0
  for (let i = 0; i < m; i++) { x[i] = prof[i] * (0.5 - 0.5 * cosDet((2 * Math.PI * i) / (m - 1))); sumW += x[i] }
  if (!(sumW > 0)) return null
  let N = 1
  while (N < 8 * m) N <<= 1
  const re = new Float64Array(N), im = new Float64Array(N)
  re.set(x)
  fft(re, im)
  const k0 = Math.ceil(N / pmax), k1 = Math.floor(N / 2.1), mag = (k) => Math.hypot(re[k], im[k])
  const band = []
  for (let k = k0; k <= k1; k++) band.push(mag(k))
  if (band.length < 3) return null
  const med = medianOf(band), peaks = []
  for (let k = k0 + 1; k < k1; k++) if (mag(k) > mag(k - 1) && mag(k) >= mag(k + 1)) peaks.push(k)
  if (!peaks.length) return null
  const kM = peaks.reduce((a, b) => (mag(b) > mag(a) ? b : a)), cohM = mag(kM) / sumW
  const ks = peaks.filter((k) => mag(k) >= 0.8 * mag(kM) && mag(k) / sumW >= 0.75 * cohM)[0] // lowest qualifying frequency
  const fs = ks / N, As = mag(ks), cohS = As / sumW
  let bestD = 1
  for (let dv = 2; fs / dv >= 1 / pmax; dv++) {
    let ok = true
    for (let j = 1; j < dv && ok; j++) { const a = dftMag(x, (j * fs) / dv); ok = a >= 0.3 * As && a / sumW >= 0.75 * cohS }
    if (ok) bestD = dv
  }
  const score = (f) => { let s = 0; for (let hh = 1; hh <= 8 && hh * f < 0.5; hh++) s += dftMag(x, hh * f); return s }
  let f = fs / bestD, wd = 1.5 / m
  for (let round = 0; round < 6; round++) {
    let bf = f, bs = -1
    for (let i = 0; i <= 32; i++) { const c = f + wd * (i / 16 - 1); if (c <= 0) continue; const s = score(c); if (s > bs) { bs = s; bf = c } }
    f = bf; wd /= 8
  }
  let period = 1 / f
  const c = Math.round(len / period)
  if (c >= 1 && Math.abs(len / period - c) <= 0.25 && score(c / len) >= 0.97 * score(f)) period = len / c
  const coh = dftMag(x, 1 / period) / sumW
  let jpeg = false
  for (let k = 1; k <= 16; k++) if (Math.abs(period - 16 / k) < 0.005) jpeg = true
  if (coh < (jpeg ? 0.3 : 0.15) || mag(kM) / med < 5) return null
  return { period, coherence: coh, prominence: mag(kM) / med }
}
const edgeAt = (prof, b) => { // profile index i sits at boundary position i + 1; linear interpolation
  const t = b - 1
  if (t < 0 || t > prof.length - 1) return 0
  const i = Math.floor(t), f = t - i
  return prof[i] * (1 - f) + (f ? prof[i + 1] : 0) * f
}
function latticeAxis(prof, p, n) { // UNKNOWN phase rule: 0.25 px search for the highest summed edge energy
  let best = 0, bs = -1
  for (let ph = 0; ph < p; ph += 0.25) { let s = 0; for (let b = ph; b < n; b += p) s += edgeAt(prof, b); if (s > bs) { bs = s; best = ph } }
  const cuts = [best > 0 ? best - p : 0]
  while (cuts[cuts.length - 1] < n) cuts.push(cuts[cuts.length - 1] + p)
  return cuts
}
function elasticAxis(prof, p, n) { // addendum "Elastic grid": DP on a 1/4 px lattice
  if (p < 8) return null
  const q90 = pctOf(prof, 0.9) || 1, E = (b) => edgeAt(prof, b) / q90
  const lo = Math.ceil(0.75 * p * 4), hi = Math.floor(1.3 * p * 4), lam = 1 / (0.25 * p) ** 2, off = hi, M = off + 4 * n + hi + 1
  const S = new Float64Array(M).fill(-Infinity), P = new Int32Array(M).fill(-1)
  for (let j = 1; j <= off; j++) S[j] = E((j - off) / 4) // first boundary in (-max spacing, 0]
  for (let j = off + 1; j < M; j++) {
    const e = E((j - off) / 4)
    for (let s = lo; s <= hi; s++) {
      const i = j - s
      if (i < 1) break
      if (S[i] === -Infinity || (i - off) / 4 >= n) continue
      const v = S[i] - lam * (s / 4 - p) ** 2 + e
      if (v > S[j]) { S[j] = v; P[j] = i }
    }
  }
  let bj = -1
  for (let j = off + 4 * n; j < M; j++) if (S[j] > -Infinity && (bj < 0 || S[j] > S[bj])) bj = j
  if (bj < 0) return null
  const cuts = []
  for (let j = bj; j >= 0; j = P[j]) { cuts.push((j - off) / 4); if (P[j] < 0) break }
  cuts.reverse()
  const inner = (cs) => { const v = cs.filter((b) => b > 0 && b < n).map(E); return v.length ? meanOf(v) : 0 }
  const uni = inner(latticeAxis(prof, p, n))
  return inner(cuts) >= 1.5 * uni ? cuts : null
}
function autoColorCount(img, cap = 32) { // spike "Automatic color count" (as corrected 2026-10-19)
  const { width: w, height: h, data: d } = img, W = 64, H = Math.max(1, Math.round((64 * h) / w))
  const ch = [0, 1, 2, 3].map(() => new Float64Array(W * H))
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) { // area resize (box over covered pixels)
    const x0 = Math.floor((tx * w) / W), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * w) / W)), y0 = Math.floor((ty * h) / H), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * h) / H))
    const s = [0, 0, 0, 0]
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 4; c++) s[c] += d[(y * w + x) * 4 + c]
    for (let c = 0; c < 4; c++) ch[c][ty * W + tx] = s[c] / ((x1 - x0) * (y1 - y0))
  }
  const at = (a, x, y) => a[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]
  const gk = [1, 4.4817, 7.3891, 4.4817, 1].map((v) => v / 18.3525) // exp(-x^2/2) taps, sigma 1 (normalized)
  for (let c = 0; c < 3; c++) {
    const a = ch[c], m = new Float64Array(W * H), win = new Float64Array(25)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let k = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) win[k++] = at(a, x + i, y + j); m[y * W + x] = win.sort()[12] }
    const t = new Float64Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -2; i <= 2; i++) s += gk[i + 2] * at(m, x + i, y); t[y * W + x] = s }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = -2; j <= 2; j++) s += gk[j + 2] * at(t, x, y + j); a[y * W + x] = s }
  }
  const bins = new Map()
  for (let p = 0; p < W * H; p++) {
    if (ch[3][p] < 200) continue
    const key = Math.floor(ch[0][p] / 48) * 36 + Math.floor(ch[1][p] / 48) * 6 + Math.floor(ch[2][p] / 48)
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  const count = (frac) => [...bins.values()].filter((v) => v >= Math.max(3, frac * W * H)).length
  let n = count(0.015)
  if (n > cap) n = count(0.02)
  return clamp(n, 2, cap)
}
function dominantCells(img, cx, cy, inset, thr) { // dominant reducer; alpha = median block alpha; mean fallback
  const { width: W, height: H, data: d } = img, ow = cx.length - 1, oh = cy.length - 1, out = blank(ow, oh)
  const range = (a, b, n) => {
    let lo, hi
    if (inset) { const p = b - a, m = Math.min(0.25 * p, Math.max((p - 1) / 2, 0)); lo = Math.ceil(a + m - 0.5); hi = Math.floor(b - m - 0.5) } else { lo = Math.ceil(a); hi = Math.ceil(b) - 1 }
    lo = Math.max(lo, 0); hi = Math.min(hi, n - 1)
    if (hi < lo) lo = hi = clamp(Math.floor((a + b) / 2), 0, n - 1)
    return [lo, hi]
  }
  for (let j = 0; j < oh; j++) {
    const [y0, y1] = range(cy[j], cy[j + 1], H)
    for (let i = 0; i < ow; i++) {
      const [x0, x1] = range(cx[i], cx[i + 1], W), cnt = new Map(), al = []
      let op = 0, sr = 0, sg = 0, sb = 0
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const o = (y * W + x) * 4
        al.push(d[o + 3])
        if (d[o + 3] <= 128) continue
        const key = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2]
        cnt.set(key, (cnt.get(key) ?? 0) + 1); op++; sr += d[o]; sg += d[o + 1]; sb += d[o + 2]
      }
      const o = (j * ow + i) * 4
      if (!op || medianOf(al) < 128) continue // finalize: binary alpha, RGB of transparent zeroed
      let bk = 0, bc = 0
      for (const [k, c] of cnt) if (c > bc) { bk = k; bc = c }
      if (bc / op >= thr) { out.data[o] = bk >> 16; out.data[o + 1] = (bk >> 8) & 255; out.data[o + 2] = bk & 255 } else { out.data[o] = Math.floor(sr / op); out.data[o + 1] = Math.floor(sg / op); out.data[o + 2] = Math.floor(sb / op) }
      out.data[o + 3] = 255
    }
  }
  return out
}

export const UNFAKE_DEFAULTS = { alphaThreshold: 128, dominantThreshold: 0.15, maxColors: 32, autoColors: false, elastic: true }

/** unfake.js v1.4 reference (pipeline order per addendum); returns its own discovered size. */
export function unfake(src, opts = {}) {
  const o = { ...UNFAKE_DEFAULTS, ...opts }, { width: w, height: h } = src
  const img = { width: w, height: h, data: Uint8ClampedArray.from(src.data) }
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= o.alphaThreshold ? 255 : 0
  let scale = edgeScale(img)
  const [px, py] = premulProfiles(img), fx = fracAxis(px, w), fy = fracAxis(py, h)
  let grid = null, path = 'integer'
  const intLike = (p) => Math.abs(p - Math.round(p)) < 0.05
  if (fx && fy && Math.abs(fx.period - fy.period) / Math.min(fx.period, fy.period) <= 0.02 && !(intLike(fx.period) && intLike(fy.period))) {
    grid = [latticeAxis(px, fx.period, w), latticeAxis(py, fy.period, h)]
    scale = (fx.period + fy.period) / 2; path = 'fractional'
  }
  if (o.elastic && scale >= 8) {
    const pX = grid ? fx.period : scale, pY = grid ? fy.period : scale, ex = elasticAxis(px, pX, w), ey = elasticAxis(py, pY, h)
    if (ex || ey) { grid ??= [latticeAxis(px, pX, w), latticeAxis(py, pY, h)]; if (ex) grid[0] = ex; if (ey) grid[1] = ey; path = 'elastic' }
  }
  let work = img, cx, cy
  if (grid) [cx, cy] = grid
  else if (scale > 1) { // destructive phase crop to whole cells (integer fallback only)
    const [phx, phy] = sobelPhase(img, scale), nx = Math.floor((w - phx) / scale), ny = Math.floor((h - phy) / scale)
    work = { width: nx * scale, height: ny * scale, data: new Uint8ClampedArray(nx * scale * ny * scale * 4) }
    for (let y = 0; y < work.height; y++) work.data.set(img.data.subarray(((y + phy) * w + phx) * 4, ((y + phy) * w + phx + work.width) * 4), y * work.width * 4)
    cx = Array.from({ length: nx + 1 }, (_, i) => i * scale); cy = Array.from({ length: ny + 1 }, (_, i) => i * scale)
  }
  const cap = o.autoColors ? autoColorCount(work) : o.maxColors, seen = new Set()
  for (let p = 0; p < work.width * work.height; p++) if (work.data[p * 4 + 3] > 128) seen.add((work.data[p * 4] << 16) | (work.data[p * 4 + 1] << 8) | work.data[p * 4 + 2])
  if (seen.size > cap) work = quantize(work, cap).image // substitute for imagequant (speed 1, no dither)
  let image
  if (cx) image = dominantCells(work, cx, cy, Boolean(grid), o.dominantThreshold)
  else { image = { width: w, height: h, data: Uint8ClampedArray.from(work.data) }; for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3] < 128) image.data[i] = image.data[i + 1] = image.data[i + 2] = 0 }
  return { image, native: [image.width, image.height], info: { scale, path, colors: cap } }
}

// ---------------------------------------------------------------------------------------------------
// 4. Retro Diffusion Standard (reference re-implementation of pixel-art-fixer `ef376e57` per spike
// "Detection pipeline" and "Reconstruction"; the spike reads the vendor writeup, not the code).
// Documented and used: 12-level rounded, median-filtered luminance; 0.7 x |first difference| feature summed
// over bands of 12, 24 and all lines (autocorr); soft-GCD comb over boundary distances with S < 0.1 = no
// lattice (runlengths); shift self-similarity, smallest peak >= max(0.40 max, 4.0) (selfsim); fast path
// (agreement within max(1 cell, 1 %), |log aspect| < 0.35); arbitration: smallest step among candidates
// >= 0.78 best, prefer-fine (> 0.45, support >= 0.35), harmonic-mean snap (< 0.08); JPEG suppression at
// z > 5 (+-1 px of multiples of 8); even lattice x*cols/w; k-means labels decide placement only; colour =
// centre-weighted (tent) mean of the original pixels carrying the winning label; transparency majority.
// UNKNOWN, substituted: the other feature terms (omitted); autocorr peak rule (the selfsim rule, no floor);
// comb tolerance (max(1, 0.12 p) px) and pick (largest local max >= 0.85 max); selfsim score (% reduction of
// mean |difference| vs its mean over shifts); fused support (mean of the three normalized detector scores);
// z-score (Welch, 8k vs 8k+4 positions); adaptive K (16, the lower clamp); detail cap and drift-aware
// counting (not implemented); "group of >= 3 proposals" (not reachable with 3 detectors); lags up to
// min(160, n/4).
// ---------------------------------------------------------------------------------------------------
function median3(Y, w, h) {
  const out = new Float64Array(w * h), win = new Float64Array(9)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let k = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) win[k++] = Y[clamp(y + j, 0, h - 1) * w + clamp(x + i, 0, w - 1)]
    out[y * w + x] = win.sort()[4]
  }
  return out
}
function jpegSuppress(p) {
  const a = [], b = []
  for (let i = 0; i < p.length; i++) { if ((i + 1) % 8 === 0) a.push(p[i]); else if ((i + 1) % 8 === 4) b.push(p[i]) }
  if (a.length < 4 || b.length < 4) return p
  const mv = (v) => { const m = meanOf(v); return [m, v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)] }
  const [ma, va] = mv(a), [mb, vb] = mv(b), z = (ma - mb) / Math.sqrt(va / a.length + vb / b.length + 1e-12)
  if (!(z > 5)) return p
  const q = Float64Array.from(p), bad = (i) => { const r = (i + 1) % 8; return r <= 1 || r >= 7 }
  for (let i = 0; i < q.length; i++) {
    if (!bad(i)) continue
    let l = i - 1, r = i + 1
    while (l >= 0 && bad(l)) l--
    while (r < q.length && bad(r)) r++
    q[i] = l < 0 ? (r < q.length ? p[r] : 0) : r >= q.length ? p[l] : p[l] + ((p[r] - p[l]) * (i - l)) / (r - l)
  }
  return q
}
function smallestPeak(s, lo, rel, abs) { // s indexed by period; smallest local peak >= max(rel max, abs)
  let mx = -Infinity
  for (let l = lo; l < s.length; l++) mx = Math.max(mx, s[l])
  const thr = Math.max(rel * mx, abs)
  for (let l = lo; l < s.length - 1; l++) if (s[l] > s[l - 1] && s[l] >= s[l + 1] && s[l] >= thr) return l
  return null
}
const interp = (s, p) => { const i = Math.floor(p), f = p - i; return i + 1 < s.length ? s[i] * (1 - f) + s[i + 1] * f : s[s.length - 1] }

function rdAxis(F, len, lines, Q, stride) { // F[line][pos] feature (pos = boundary pos..pos+1), Q[line][pos] levels
  const pmax = Math.min(160, Math.floor(len / 4))
  if (pmax < 3) return null
  // autocorr: normalized autocorrelation averaged over band profiles (12, 24, all lines)
  const ac = new Float64Array(pmax + 2)
  let nb = 0
  for (const bh of [12, 24, lines]) for (let b0 = 0; b0 < lines; b0 += bh) {
    const prof = new Float64Array(len - 1)
    for (let l = b0; l < Math.min(lines, b0 + bh); l++) for (let x = 0; x < len - 1; x++) prof[x] += F(l, x)
    const p = jpegSuppress(prof), m = meanOf(p)
    let a0 = 0
    for (let i = 0; i < p.length; i++) a0 += (p[i] - m) ** 2
    if (!(a0 > 0)) continue
    for (let l = 0; l <= pmax + 1; l++) { let s = 0; for (let i = 0; i + l < p.length; i++) s += (p[i] - m) * (p[i + l] - m); ac[l] += s / a0 }
    nb++
  }
  if (nb) for (let l = 0; l < ac.length; l++) ac[l] /= nb
  const pAc = nb ? smallestPeak(ac, 2, 0.4, -Infinity) : null
  // runlengths: soft-GCD comb over distances between label boundaries
  const hist = new Float64Array(4 * pmax + 1)
  let nd = 0
  for (let l = 0; l < lines; l++) {
    let last = -1
    for (let x = 0; x < len - 1; x++) if (Q(l, x) !== Q(l, x + 1)) { if (last >= 0 && x - last <= 4 * pmax) { hist[x - last]++; nd++ } last = x }
  }
  const Sgrid = [], comb = (p) => {
    if (!nd) return 0
    const tau = Math.max(1, 0.12 * p)
    let s = 0
    for (let dd = 1; dd < hist.length; dd++) { if (!hist[dd] || dd < 0.5 * p) continue; s += hist[dd] * Math.max(0, 1 - Math.abs(dd - p * Math.round(dd / p)) / tau) }
    return s / nd
  }
  for (let p = 2; p <= pmax; p += 0.05) Sgrid.push([p, comb(p)])
  const Smax = Math.max(0, ...Sgrid.map((v) => v[1]))
  let pRl = null, S = 0
  for (let i = Sgrid.length - 2; i >= 1; i--) if (Sgrid[i][1] >= Sgrid[i - 1][1] && Sgrid[i][1] >= Sgrid[i + 1][1] && Sgrid[i][1] >= 0.85 * Smax) { pRl = Sgrid[i][0]; S = Sgrid[i][1]; break }
  if (S < 0.1) pRl = null
  // selfsim: % reduction of mean |G(x) - G(x+s)| relative to its mean over shifts
  const D = new Float64Array(pmax + 2)
  for (let s = 1; s <= pmax + 1; s++) { let t = 0, n = 0; for (let l = 0; l < lines; l += stride) for (let x = 0; x + s < len - 1; x++) { t += Math.abs(F(l, x) - F(l, x + s)); n++ } D[s] = n ? t / n : 0 }
  const Dm = meanOf(Array.from(D.subarray(1))), ss = new Float64Array(pmax + 2)
  for (let s = 1; s <= pmax + 1; s++) ss[s] = Dm > 0 ? (100 * (Dm - D[s])) / Dm : 0
  const pSs = smallestPeak(ss, 2, 0.4, 4.0)
  const acMax = Math.max(...ac.subarray(2)), ssMax = Math.max(...ss.subarray(2))
  const support = (p) => (p < 2 || p > pmax ? 0 : (Math.max(0, interp(ac, p)) / (acMax > 0 ? acMax : 1) + Math.max(0, interp(ss, p)) / (ssMax > 0 ? ssMax : 1) + (Smax > 0 ? comb(p) / Smax : 0)) / 3)
  return { props: [pAc, pRl, pSs], support, S }
}

/** Retro Diffusion Standard reference: returns its own discovered size. */
export function retroDiffusion(img) {
  const { width: w, height: h, data: d } = img, Y = new Float64Array(w * h)
  for (let p = 0; p < w * h; p++) Y[p] = d[p * 4 + 3] < 128 ? 0 : luma(d, p * 4)
  const M = median3(Y, w, h), Q = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) Q[p] = Math.round((M[p] / 255) * 11)
  const ax = rdAxis((l, x) => 0.7 * Math.abs(Q[l * w + x + 1] - Q[l * w + x]), w, h, (l, x) => Q[l * w + x], Math.max(1, Math.floor(h / 256)))
  const ay = rdAxis((l, y) => 0.7 * Math.abs(Q[(y + 1) * w + l] - Q[y * w + l]), h, w, (l, y) => Q[y * w + l], Math.max(1, Math.floor(w / 256)))
  let sx = null, sy = null, route = 'none'
  const all3 = (a) => a && a.props.every((v) => v !== null)
  if (all3(ax) && all3(ay)) { // fast path
    const cols = ax.props.map((p) => w / p), rows = ay.props.map((p) => h / p), mc = medianOf(cols), mr = medianOf(rows)
    const agree = (v, m) => Math.max(...v) - Math.min(...v) <= Math.max(1, 0.01 * m)
    if (agree(cols, mc) && agree(rows, mr) && Math.abs(Math.log((mc / mr) / (w / h))) < 0.35) { sx = medianOf(ax.props); sy = medianOf(ay.props); route = 'fast' }
  }
  if (sx === null) { // arbitration
    const pick = (a) => {
      if (!a) return null
      const cands = [...new Set(a.props.filter((v) => v !== null).flatMap((p) => [p, 2 * p, p / 2]))]
      if (!cands.length) return null
      const best = Math.max(...cands.map(a.support))
      return best > 0 ? Math.min(...cands.filter((c) => a.support(c) >= 0.78 * best)) : null
    }
    sx = pick(ax); sy = pick(ay)
    if (sx === null) sx = sy
    if (sy === null) sy = sx
    route = sx === null ? 'none' : 'arbitration'
    if (sx !== null) {
      const r = Math.abs(Math.log(sx / sy))
      if (r > 0.45) { const f = Math.min(sx, sy), other = sx > sy ? ax : ay; if (other && other.support(f) >= 0.35) sx = sy = f }
    }
  }
  if (sx === null) return { image: { width: w, height: h, data: Uint8ClampedArray.from(d) }, native: [w, h], info: { route } }
  if (Math.abs(Math.log(sx / sy)) < 0.08) sx = sy = 2 / (1 / sx + 1 / sy)
  const cols = Math.max(1, Math.round(w / sx)), rows = Math.max(1, Math.round(h / sy))
  // reconstruction: labels from k-means on opaque pixels (placement only), tent-weighted vote, label-masked mean
  const bin = { width: w, height: h, data: Uint8ClampedArray.from(d) }
  for (let i = 3; i < bin.data.length; i += 4) bin.data[i] = bin.data[i] >= 128 ? 255 : 0
  const { labels } = kmeansRGB(bin, 16), out = blank(cols, rows), cw = w / cols, chh = h / rows
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x0 = i * cw, x1 = x0 + cw, y0 = j * chh, y1 = y0 + chh, mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    const votes = new Map(), acc = new Map()
    let wa = 0, wt = 0
    for (let y = Math.ceil(y0 - 0.5); y <= Math.ceil(y1 - 0.5) - 1; y++) for (let x = Math.ceil(x0 - 0.5); x <= Math.ceil(x1 - 0.5) - 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const wgt = Math.max(0, 1 - Math.abs(x + 0.5 - mx) / (cw / 2 + 0.5)) * Math.max(0, 1 - Math.abs(y + 0.5 - my) / (chh / 2 + 0.5)), p = y * w + x
      wt += wgt
      if (labels[p] < 0) continue
      wa += wgt
      votes.set(labels[p], (votes.get(labels[p]) ?? 0) + wgt)
      const a = acc.get(labels[p]) ?? [0, 0, 0, 0]
      a[0] += wgt * d[p * 4]; a[1] += wgt * d[p * 4 + 1]; a[2] += wgt * d[p * 4 + 2]; a[3] += wgt
      acc.set(labels[p], a)
    }
    if (!(wa >= 0.5 * wt) || !votes.size) continue
    let bl = -1, bv = -1
    for (const [l, v] of [...votes].sort((a, b) => a[0] - b[0])) if (v > bv) { bv = v; bl = l }
    const a = acc.get(bl), o = (j * cols + i) * 4
    out.data[o] = a[0] / a[3]; out.data[o + 1] = a[1] / a[3]; out.data[o + 2] = a[2] / a[3]; out.data[o + 3] = 255
  }
  return { image: out, native: [cols, rows], info: { route, step: [sx, sy] } }
}

// ---------------------------------------------------------------------------------------------------
// 5. PixelOE contrast downscale (reference re-implementation of PixelOE `7ce444b3` contrast rule as recorded
// in prototype-algorithm-design.md "Raster route"; not its outline expansion, colour steps or resize chain).
// Per target patch, on L* of opaque pixels: median < mean and (max - median) > (median - min) -> darkest
// pixel; median > mean and (max - median) < (median - min) -> brightest pixel; else the patch-centre pixel
// (UNKNOWN in the spikes; the prototype's own variant uses a medoid). Patches are fractional source
// footprints; a patch is opaque when >= half its pixels have alpha >= 128 (alpha policy UNKNOWN).
// PixelOE takes a size parameter, so it runs at the requested W x H (no grid detection).
// ---------------------------------------------------------------------------------------------------
export function pixelOE(img, tw, th) {
  const { width: W, height: H, data: d } = img, out = blank(tw, th), Ls = new Float64Array(W * H)
  for (let p = 0; p < W * H; p++) {
    const Y = 0.2126 * SRGB_TO_LINEAR[d[p * 4]] + 0.7152 * SRGB_TO_LINEAR[d[p * 4 + 1]] + 0.0722 * SRGB_TO_LINEAR[d[p * 4 + 2]]
    Ls[p] = Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y
  }
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const x0 = Math.floor((tx * W) / tw), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * W) / tw)), y0 = Math.floor((ty * H) / th), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * H) / th))
    const ids = []
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[(y * W + x) * 4 + 3] >= 128) ids.push(y * W + x)
    if (2 * ids.length < (x1 - x0) * (y1 - y0)) continue
    const L = ids.map((p) => Ls[p]), med = medianOf(L), mean = meanOf(L)
    let iMin = 0, iMax = 0
    for (let k = 1; k < L.length; k++) { if (L[k] < L[iMin]) iMin = k; if (L[k] > L[iMax]) iMax = k }
    const mn = L[iMin], mx = L[iMax]
    let pick
    if (med < mean && mx - med > med - mn) pick = ids[iMin]
    else if (med > mean && mx - med < med - mn) pick = ids[iMax]
    else { // centre pixel, else the opaque pixel nearest the centre (raster order on ties)
      const cx = (x0 + x1 - 1) / 2, cy = (y0 + y1 - 1) / 2
      pick = ids.reduce((a, b) => ((b % W - cx) ** 2 + (Math.floor(b / W) - cy) ** 2 < (a % W - cx) ** 2 + (Math.floor(a / W) - cy) ** 2 ? b : a))
    }
    const o = (ty * tw + tx) * 4
    out.data[o] = d[pick * 4]; out.data[o + 1] = d[pick * 4 + 1]; out.data[o + 2] = d[pick * 4 + 2]; out.data[o + 3] = 255
  }
  return out
}

// ---------------------------------------------------------------------------------------------------
// 6. Baselines: exact area average and centre-sample nearest, Binary(128) alpha (scripts/bench.mjs maths).
// ---------------------------------------------------------------------------------------------------
export function area(img, tw, th) {
  const { width: W, height: H, data: d } = img, out = new Uint8ClampedArray(tw * th * 4), sx = W / tw, sy = H / th
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const x0 = tx * sx, x1 = x0 + sx, y0 = ty * sy, y1 = y0 + sy
    let r = 0, g = 0, b = 0, a = 0, ws = 0
    for (let y = Math.floor(y0); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.floor(x0); x < Math.min(W, Math.ceil(x1)); x++) {
      const wt = (Math.min(y + 1, y1) - Math.max(y, y0)) * (Math.min(x + 1, x1) - Math.max(x, x0)), o = (y * W + x) * 4, al = (d[o + 3] / 255) * wt
      r += d[o] * al; g += d[o + 1] * al; b += d[o + 2] * al; a += al; ws += wt
    }
    const o = (ty * tw + tx) * 4
    if (a >= 0.5 * ws) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = 255 }
  }
  return { width: tw, height: th, data: out }
}
export function nearest(img, tw, th) {
  const out = new Uint8ClampedArray(tw * th * 4)
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const s = (Math.floor(((ty + 0.5) * img.height) / th) * img.width + Math.floor(((tx + 0.5) * img.width) / tw)) * 4, o = (ty * tw + tx) * 4
    if (img.data[s + 3] >= 128) { out.set(img.data.subarray(s, s + 3), o); out[o + 3] = 255 }
  }
  return { width: tw, height: th, data: out }
}
