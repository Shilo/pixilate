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
// | retroDiffusion  | Retro-Diffusion/pixel-art-fixer Standard `ef376e57` (v1.1), MIT                      | products/retro-diffusion-pixel-art-fixer.md 2026-10-21 refresh (R1-R11) |
// | pixelOE         | KohakuBlueleaf/PixelOE `7ce444b3`, Apache-2.0 (contrast downscale only)             | landscape addendum; planning/prototype-algorithm-design.md "Raster route" |
// | area, nearest   | Pixilate-owned baselines (same maths as scripts/bench.mjs, which runs on import)   | —                                                                        |
import { mulberry32 } from './synth.js'
import { SRGB_TO_LINEAR, cosDet, sinDet, srgbToOklab, linearToOklab, oklabToSrgb } from '../src/lib/core/color.ts'

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
export function kmeansRGB(img, k, { seed = 42, iters = 15, maxSamples = Infinity } = {}) {
  const d = img.data, n = img.width * img.height, labels = new Int32Array(n).fill(-1), all = []
  for (let p = 0; p < n; p++) if (d[p * 4 + 3] > 0) all.push(p)
  // maxSamples: cluster an even-stride subset, then assign every pixel (fast-pixelizer's 50000 cap)
  const ids = all.length > maxSamples ? Array.from({ length: maxSamples }, (_, i) => all[Math.floor((i * all.length) / maxSamples)]) : all
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
  if (ids !== all) for (const p of all) {
    let best = 0, bd = Infinity
    for (let c = 0; c < k; c++) { const a = d[p * 4] - C[c * 3], b = d[p * 4 + 1] - C[c * 3 + 1], e = d[p * 4 + 2] - C[c * 3 + 2], v = a * a + b * b + e * e; if (v < bd) { bd = v; best = c } }
    labels[p] = best
  }
  return { centers: C, labels }
}

/** Replace RGB of every alpha > 0 pixel by its k-means centre (alpha bytes untouched). */
export function quantize(img, k, opts) {
  const { centers, labels } = kmeansRGB(img, k, opts), out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }
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
// 4. Retro Diffusion Standard (reference re-implementation of pixel-art-fixer `ef376e57` per the spike's
// 2026-10-21 "Pipeline, step by step" and fidelity items R1-R11; the spike and this code read the vendor
// writeup docs/HOW_IT_WORKS.md, never the code). Row "Retro Diffusion ref (partial Stage 2)".
// Documented and used (VERIFIED writeup statements):
//   feature = |2nd difference of luminance| + 0.7 x |1st difference of median-filtered, 12-level luminance|,
//   band profiles over 12, 24 and all lines, each power-normalised (ACF / ACF(0)) and averaged; JPEG notch
//   (z > 5, +-1 px of multiples of 8, interpolated);
//   autocorr: comb at k*s minus anti-comb at (k +- 0.5)*s, weights exp(-k/12), fractional s by ACF
//   interpolation (R1), subharmonic penalty 0.5 x max score of s/2..s/5, parabolic sub-pixel peaks near k*s0
//   and a least-squares fit peak ~ k*s through the origin;
//   runlengths (R3): boundaries by gradient non-maximum suppression per scanline, S(s) = mean_r cos(2 pi r/s)
//   in [-1, 1], largest peak within 0.70 of the max with >= 4 % run mass at 1*s, fine re-search, S < 0.1 =
//   no boundary lattice (this voter abstains; the writeup falls back to the other channels, it does not refuse);
//   selfsim (R4): d(t) = mean |F(x) - F(x+t)| for F = |grad|, blurred |grad|, |Laplacian| after blur; comb
//   t-statistic over K harmonics x min(1, (K-1)/3); smallest peak >= max(0.40 max, 4.0), then a divisor walk;
//   fused curve (R5, R6) = equal-weight sum of per-scan max-normalised {ray_e1, tile_e1, tile_e2, spec_e1}
//   and the fourth voter: ray_e1 projects profile peaks onto the unit circle at 2 pi pos/step, occupancy-scaled;
//   tile_e1 / tile_e2 = Rayleigh phase-coherence z of the gradient / curvature map on 48-192 px tiles, each
//   with its own phase, centred (z - 1) and Stouffer-combined; spec_e1 = Welch power spectrum of gradient
//   scanline groups read at k/step;
//   fast path: the three cheap detectors agree on cols and rows within max(1 cell, 1 %) and |log aspect| <
//   0.35 -> median counts; else the largest aspect-sane group of >= 3 of the 4 voters -> group median (2-of-4
//   is not enough); else Stage 2 arbitration per axis over the candidate pool (R7) = every voter's step plus
//   autocorr's top five, de-duplicated in log space, clamped to (1.2, extent/3), no invented 2x or 1/2x;
//   score = fused + 0.20 vc + 0.25 max(0, agree - 1) + 0.6 recon/rmax (when rmax > 0.005), x 0.35 above the
//   detail cap (ACF central-peak half-width x 8); vc = (var_worst - var_best) / (var_best + 0.05 total) over
//   phases, only "active" pixels (8x8 blocks with variance > 2 % of the total; blocks overlap at stride 4, INFERRED; "total" = variance of the active pixels, INFERRED); recon = max(er - eb, 0) x
//   max(1 - eb/trend(s), 0) on K = 14 colours, PCA to 2 channels + centred alpha, er = error at best phase
//   + s/2, trend = running median over s; smallest step >= 0.78 of the best wins; prefer-fine (|log| > 0.45,
//   fused >= 0.35); harmonic-mean snap (< 0.08); drift-aware counting (<= 8 windows, +-18 % comb re-scan,
//   gated at >= 96 uniform cells and |integrated - uniform| >= 2.5);
//   reconstruction: even lattice x*cols/w; structure palette K = 4-bit colour complexity of the opaque pixels
//   clamped to [16, 48] (R9), labels decide placement only; colour = centre-weighted mean of the original
//   pixels carrying the winning label; transparency = per-cell majority. Manual pixel size (R10):
//   { manualStep } skips detection, cols = round(w/step), rows = round(h/step).
// UNKNOWN in the writeup, substituted here (simplest reading, labelled):
//   feature units (both terms scaled to [0, 1]); median filter 3x3; JPEG z statistic (Welch t of 8k vs 8k+4
//   profile values); step grid (log, ratio 1.004 from 1.25, the writeup cites a 1650-point grid); comb
//   normalised by the weight sum, k while (k + 0.5) s <= extent/2; a negative subharmonic max is not a bonus;
//   autocorr's own pick = the best penalised local maximum, top five = the next best maxima; refinement window
//   +-0.25 s0, k <= 8, one outlier pass (|residual| > 0.1 s0); NMS threshold |dY| >= 8 and no cross-scanline
//   coherence smoothing; run-mass tolerance max(0.5, 0.05 s) px; fine re-search +-1 % in 0.1 % steps; selfsim
//   shifts t <= min(extent/2, 72) (the writeup costs "72 shifts"), K >= 3 harmonics (>= 2 degrees of freedom), on <= 48 sampled lines, [1,2,1] blur, features averaged, no per-tile drift
//   votes (DISP_UNIFORM unused); divisor walk over d = 2, 3 within +-3 %; ray_e1 peaks = local maxima >= 0.2 max
//   of the all-lines profile, score = resultant length x min(1, N s / extent); tile side clamp(min side/4, 48,
//   192), a tile scores a step only when it spans >= 3 steps, weighted Rayleigh z = n_eff R^2; Welch: Hann, 50 % overlap, segment = largest power of two <= min(
//   extent, 512), harmonics k/step <= 0.5 averaged, read by linear interpolation; negative terms clipped
//   before max-normalising; fused >= 0.35 read on the 0..4 sum; vc and recon on the even lattice len/round(len/s), on 1D scanline segments, not the
//   writeup's 2D cells, 8 phases, <= 128 sampled lines; trend window s/1.25 .. 1.25 s on every 8th grid step;
//   recon k-means on <= 50000 samples; agree = voters within max(1 cell, 1 %); log de-duplication 2 %;
//   drift windows = 8 equal spans, comb re-scan in 0.2 % steps; centre weights = tent (stated substitute).
// OMITTED (described but not specified enough to rebuild): cross-axis factor-2/3 promotion (the "plain-comb
// mass" threshold is not given); selfsim tile drift votes; runlengths coherence smoothing; the exact JPEG z
// statistic and the `consensus` strings. The hosted web build is not reproduced (UNKNOWN which commit it runs).
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
const lin = (a, x) => { if (!(x > 0)) return a[0]; const i = Math.floor(x); return i + 1 < a.length ? a[i] + (a[i + 1] - a[i]) * (x - i) : a[a.length - 1] }
const RD_GRID = 1.004, RD_LO = 1.25, RD_EW = Float64Array.from({ length: 1024 }, (_, k) => Math.exp(-k / 12))
function rdAcfOf(p) { // power-normalised (biased) autocorrelation of the mean-removed profile, via FFT
  const n = p.length, m = meanOf(p)
  let N = 1
  while (N < 2 * n) N <<= 1
  const re = new Float64Array(N), im = new Float64Array(N)
  for (let i = 0; i < n; i++) re[i] = p[i] - m
  fft(re, im)
  for (let i = 0; i < N; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0 }
  fft(re, im) // the power spectrum is real and even, so a forward FFT gives N x the autocorrelation
  if (!(re[0] > 1e-12)) return null
  return Float64Array.from({ length: n }, (_, l) => re[l] / re[0])
}
function rdAcf(bands, a, b) { // band-averaged ACF of bands[i][a..b), lags 0..(b-a)/2
  const L = Math.floor((b - a) / 2), A = new Float64Array(L + 1)
  let nb = 0
  for (const p of bands) { const r = rdAcfOf(p.subarray(a, b)); if (!r) continue; for (let l = 0; l <= L; l++) A[l] += r[l]; nb++ }
  if (!nb || L < 2) return null
  for (let l = 0; l <= L; l++) A[l] /= nb
  return A
}
function rdComb(A, s) { // comb at k*s minus anti-comb at (k +- 0.5)*s, weights exp(-k/12)
  const L = A.length - 1
  let c = 0, wt = 0
  for (let k = 1; (k + 0.5) * s <= L && k < RD_EW.length; k++) { c += RD_EW[k] * (lin(A, k * s) - 0.5 * (lin(A, (k - 0.5) * s) + lin(A, (k + 0.5) * s))); wt += RD_EW[k] }
  return wt ? c / wt : 0
}
const rdPeaks = (v) => { const out = []; for (let i = 1; i < v.length - 1; i++) if (v[i] > v[i - 1] && v[i] >= v[i + 1]) out.push(i); return out }
function rdRefine(A, s0) { // parabolic sub-pixel ACF maxima near k*s0, then a robust LS fit peak ~ k*s through the origin
  const L = A.length - 1, pts = []
  for (let k = 1; k <= 8 && k * s0 + 0.25 * s0 < L; k++) {
    let b = -1
    for (let l = Math.max(1, Math.ceil(k * s0 - 0.25 * s0)); l <= Math.min(L - 1, Math.floor(k * s0 + 0.25 * s0)); l++) if (b < 0 || A[l] > A[b]) b = l
    if (b < 1) continue
    const den = A[b - 1] - 2 * A[b] + A[b + 1]
    pts.push([k, b + (den < 0 ? clamp((0.5 * (A[b - 1] - A[b + 1])) / den, -0.5, 0.5) : 0)])
  }
  const fit = (P) => P.reduce((s, [k, x]) => s + k * x, 0) / P.reduce((s, [k]) => s + k * k, 0)
  if (!pts.length) return s0
  let s = fit(pts)
  const keep = pts.filter(([k, x]) => Math.abs(x - k * s) <= 0.1 * s0)
  if (keep.length && keep.length < pts.length) s = fit(keep)
  return Math.abs(Math.log(s / s0)) < 0.2 ? s : s0
}
function rdRayleigh(prof, s) { // weighted Rayleigh z = n_eff R^2 at period s (own phase)
  const wr = cosDet((2 * Math.PI) / s), wi = sinDet((2 * Math.PI) / s)
  let cr = 1, ci = 0, sr = 0, si = 0, W = 0, W2 = 0
  for (let x = 0; x < prof.length; x++) { const v = prof[x]; sr += v * cr; si += v * ci; W += v; W2 += v * v; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr }
  return W > 0 ? (sr * sr + si * si) / W2 : null // n_eff R^2 = (W^2/W2) (|sum|/W)^2
}
function rdTiles(map, n1, lines, side) { // column profiles of map[lines][n1] on ~side px tiles
  const tx = Math.max(1, Math.round(n1 / side)), ty = Math.max(1, Math.round(lines / side)), out = []
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
    const x0 = Math.floor((i * n1) / tx), x1 = Math.floor(((i + 1) * n1) / tx), y0 = Math.floor((j * lines) / ty), y1 = Math.floor(((j + 1) * lines) / ty), p = new Float64Array(x1 - x0)
    for (let l = y0; l < y1; l++) for (let x = x0; x < x1; x++) p[x - x0] += map[l * n1 + x]
    out.push(p)
  }
  return out
}
function rdWelch(bands, n1) { // Welch power spectrum (Hann, 50 % overlap), each band normalised, averaged
  let Lw = 1
  while (Lw * 2 <= Math.min(n1, 512)) Lw *= 2
  if (Lw < 16) return null
  const win = Float64Array.from({ length: Lw }, (_, i) => 0.5 - 0.5 * cosDet((2 * Math.PI * i) / Lw)), P = new Float64Array(Lw / 2 + 1)
  for (const b of bands) {
    const acc = new Float64Array(Lw / 2 + 1)
    for (let a = 0; a + Lw <= n1; a += Lw / 2) {
      const m = meanOf(b.subarray(a, a + Lw)), re = Float64Array.from({ length: Lw }, (_, i) => (b[a + i] - m) * win[i]), im = new Float64Array(Lw)
      fft(re, im)
      for (let k = 0; k <= Lw / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k]
    }
    const t = acc.reduce((s, v) => s + v, 0)
    if (t > 0) for (let k = 0; k <= Lw / 2; k++) P[k] += acc[k] / t
  }
  return { P, Lw }
}
function rdPrefix(chs, mask, len, lines, maxLines) { // per sampled line prefix sums of count, sum and sum of squares
  const stride = Math.max(1, Math.ceil(lines / maxLines)), ls = []
  for (let l = 0; l < lines; l += stride) ls.push(l)
  const N = len + 1, C = new Float64Array(ls.length * N), S1 = chs.map(() => new Float64Array(ls.length * N)), S2 = chs.map(() => new Float64Array(ls.length * N))
  ls.forEach((l, i) => {
    for (let x = 0; x < len; x++) {
      const o = l * len + x, q = i * N + x, m = mask ? mask[o] : 1
      C[q + 1] = C[q] + m
      chs.forEach((ch, c) => { S1[c][q + 1] = S1[c][q] + m * ch[o]; S2[c][q + 1] = S2[c][q] + m * ch[o] * ch[o] })
    }
  })
  return { C, S1, S2, n: ls.length, N, len }
}
function rdSegErr(pf, s, ph) { // mean within-segment squared error of cuts ph + k s on every sampled line
  const cuts = [0]
  for (let v = ph; v < pf.len; v += s) { const c = Math.round(v); if (c > cuts[cuts.length - 1] && c < pf.len) cuts.push(c) }
  cuts.push(pf.len)
  let sse = 0, tot = 0
  for (let i = 0; i < pf.n; i++) for (let k = 1; k < cuts.length; k++) {
    const a = i * pf.N + cuts[k - 1], b = i * pf.N + cuts[k], n = pf.C[b] - pf.C[a]
    if (n <= 0) continue
    tot += n
    for (let c = 0; c < pf.S1.length; c++) { const s1 = pf.S1[c][b] - pf.S1[c][a]; sse += pf.S2[c][b] - pf.S2[c][a] - (s1 * s1) / n }
  }
  return tot ? Math.max(0, sse) / tot : 0
}
// candidates are scored as the even lattice they would produce, step len / round(len / s) (INFERRED: a raw grid
// step drifts across the extent and makes every phase straddle cells)
const rdPhases = (pf, s) => { const e = pf.len / Math.max(1, Math.round(pf.len / s)); return Array.from({ length: 8 }, (_, j) => rdSegErr(pf, e, (j * e) / 8)) }

function rdAxis(Y, Q, len, lines) { // Y in 0..255, Q in 0..11, row-major [lines][len] along this axis
  const n1 = len - 1, hi = len / 3
  if (n1 < 6 || hi <= RD_LO * RD_GRID) return null
  const G = []
  for (let s = RD_LO; s <= hi; s *= RD_GRID) G.push(s)
  const F = new Float64Array(lines * n1), g1 = new Float64Array(lines * n1), g2 = new Float64Array(lines * n1)
  for (let l = 0; l < lines; l++) for (let x = 0; x < n1; x++) {
    const o = l * len + x, d2 = x >= 1 ? Math.abs(Y[o - 1] - 2 * Y[o] + Y[o + 1]) / 255 : 0
    F[l * n1 + x] = 0.7 * (Math.abs(Q[o + 1] - Q[o]) / 11) + d2
    g1[l * n1 + x] = Math.abs(Y[o + 1] - Y[o]) / 255; g2[l * n1 + x] = d2
  }
  const b12 = []
  for (let b0 = 0; b0 < lines; b0 += 12) { const p = new Float64Array(n1); for (let l = b0; l < Math.min(lines, b0 + 12); l++) for (let x = 0; x < n1; x++) p[x] += F[l * n1 + x]; b12.push(p) }
  const b24 = []
  for (let i = 0; i < b12.length; i += 2) b24.push(i + 1 < b12.length ? b12[i].map((v, x) => v + b12[i + 1][x]) : b12[i])
  const ball = b12.reduce((a, p) => a.map((v, x) => v + p[x]))
  const bands = [...b12, ...b24, ball].map(jpegSuppress), A = rdAcf(bands, 0, n1)
  // autocorr: penalised comb over the step grid
  let pAc = null, top5 = []
  if (A) {
    const Cg = G.map((s) => rdComb(A, s)), Pg = G.map((s, i) => { let m = 0; for (let d = 2; d <= 5; d++) if (s / d >= RD_LO) m = Math.max(m, rdComb(A, s / d)); return Cg[i] - 0.5 * m })
    const pk = rdPeaks(Pg).filter((i) => Pg[i] > 0).sort((a, b) => Pg[b] - Pg[a] || a - b)
    if (pk.length) pAc = rdRefine(A, G[pk[0]])
    top5 = pk.slice(1, 6).map((i) => G[i])
  }
  // runlengths: cosine comb over distances between gradient-NMS boundaries
  const hist = new Float64Array(len + 1)
  let nd = 0, rmaxD = 0
  for (let l = 0; l < lines; l++) {
    let last = -1
    for (let x = 0; x < n1; x++) {
      const g = g1[l * n1 + x] * 255, gl = x > 0 ? g1[l * n1 + x - 1] * 255 : 0, gr = x < n1 - 1 ? g1[l * n1 + x + 1] * 255 : 0
      if (g >= 8 && g >= gl && g > gr) { if (last >= 0) { hist[x - last]++; nd++; rmaxD = Math.max(rmaxD, x - last) } last = x }
    }
  }
  const Sof = (s) => {
    if (!nd) return 0
    const wr = cosDet((2 * Math.PI) / s), wi = sinDet((2 * Math.PI) / s)
    let cr = 1, ci = 0, t = 0
    for (let r = 1; r <= rmaxD; r++) { const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; if (hist[r]) t += hist[r] * cr }
    return t / nd
  }
  const runMass = (s) => { let m = 0; const tol = Math.max(0.5, 0.05 * s); for (let r = Math.max(1, Math.ceil(s - tol)); r <= Math.min(rmaxD, Math.floor(s + tol)); r++) m += hist[r]; return nd ? m / nd : 0 }
  let pRl = null, S = 0
  if (nd) {
    const Sg = G.map(Sof), Smax = Math.max(...Sg)
    const ok = rdPeaks(Sg).filter((i) => Sg[i] >= 0.7 * Smax && runMass(G[i]) >= 0.04)
    if (Smax > 0 && ok.length) {
      let s0 = G[ok[ok.length - 1]], best = Sg[ok[ok.length - 1]]
      for (let d = -10; d <= 10; d++) { const s = G[ok[ok.length - 1]] * (1 + d / 1000), v = Sof(s); if (v > best) { best = v; s0 = s } }
      S = best
      pRl = S >= 0.1 ? s0 : null
    }
  }
  // selfsim: comb t-statistic of the shift dissimilarity d(t), three features
  const T = Math.min(Math.floor(n1 / 2), 72), stride = Math.max(1, Math.ceil(lines / 48)), Ds = [0, 1, 2].map(() => new Float64Array(T + 1))
  for (let l = 0; l < lines; l += stride) {
    const g = g1.subarray(l * n1, (l + 1) * n1), bl = (v) => v.map((_, x) => (v[Math.max(0, x - 1)] + 2 * v[x] + v[Math.min(v.length - 1, x + 1)]) / 4)
    const yb = bl(Y.subarray(l * len, (l + 1) * len)), lap = Float64Array.from({ length: n1 }, (_, x) => (x >= 1 ? Math.abs(yb[x - 1] - 2 * yb[x] + yb[x + 1]) / 255 : 0))
    const fs = [g, bl(g), lap]
    for (let f = 0; f < 3; f++) for (let t = 1; t <= T; t++) { let a = 0; const v = fs[f]; for (let x = 0; x + t < n1; x++) a += Math.abs(v[x] - v[x + t]); Ds[f][t] += a / Math.max(1, n1 - t) }
  }
  const tstat = (d, s) => {
    const K = Math.floor(T / s - 0.5)
    if (K < 3) return 0
    let m = 0, q = 0
    for (let k = 1; k <= K; k++) { const v = 0.5 * (lin(d, (k - 0.5) * s) + lin(d, (k + 0.5) * s)) - lin(d, k * s); m += v; q += v * v }
    const mean = m / K, vr = (q - K * mean * mean) / (K - 1), t = vr > 1e-18 ? mean / Math.sqrt(vr / K) : mean > 0 ? 1e3 : 0
    return Math.min(t, 1e3) * Math.min(1, (K - 1) / 3)
  }
  const ssAt = (s) => (tstat(Ds[0], s) + tstat(Ds[1], s) + tstat(Ds[2], s)) / 3
  const SSg = G.map(ssAt), ssMax = Math.max(...SSg), thrSs = Math.max(0.4 * ssMax, 4.0)
  let pSs = null
  for (const i of rdPeaks(SSg)) if (SSg[i] >= thrSs) { pSs = G[i]; break }
  for (let walked = true; pSs !== null && walked;) { // divisor walk
    walked = false
    for (const d of [2, 3]) {
      const c = pSs / d
      if (c < RD_LO) continue
      let bs = null, bv = -Infinity
      for (let e = -30; e <= 30; e++) { const s = c * (1 + e / 1000), v = ssAt(s); if (v > bv) { bv = v; bs = s } }
      if (bv >= thrSs) { pSs = bs; walked = true; break }
    }
  }
  // fused curve (fourth voter): {ray_e1, tile_e1, tile_e2, spec_e1}, each max-normalised over the grid
  const pmx = Math.max(...ball), pkPos = []
  for (let x = 0; x < n1; x++) if (ball[x] >= 0.2 * pmx && ball[x] > 0 && (x === 0 || ball[x] > ball[x - 1]) && (x === n1 - 1 || ball[x] >= ball[x + 1])) pkPos.push(x)
  const ind = new Float64Array(n1)
  for (const x of pkPos) ind[x] = 1
  const ray = G.map((s) => { if (!pkPos.length) return 0; const z = rdRayleigh(ind, s); return Math.sqrt(z * pkPos.length) / pkPos.length * Math.min(1, (pkPos.length * s) / n1) }) // R = sqrt(z / N) since n_eff = N
  const side = clamp(Math.round(Math.min(len, lines) / 4), 48, 192)
  const tileTerm = (map) => { const tiles = rdTiles(map, n1, lines, side); return G.map((s) => { let t = 0, m = 0; for (const p of tiles) { if (p.length < 3 * s) continue; const z = rdRayleigh(p, s); if (z !== null) { t += z - 1; m++ } } return m ? t / Math.sqrt(m) : 0 }) }
  const W = rdWelch(bands.slice(0, b12.length), n1)
  const spec = G.map((s) => { if (!W) return 0; const H = Math.floor(s / 2); let t = 0; for (let k = 1; k <= H; k++) t += lin(W.P, (k / s) * W.Lw); return H ? t / H : 0 })
  const fused = new Float64Array(G.length)
  for (const term of [ray, tileTerm(g1), tileTerm(g2), spec]) { const mx = Math.max(0, ...term); if (mx > 0) for (let i = 0; i < G.length; i++) fused[i] += Math.max(0, term[i]) / mx }
  let iFu = 0
  for (let i = 1; i < G.length; i++) if (fused[i] > fused[iFu]) iFu = i
  const pFu = fused[iFu] > 0 ? G[iFu] : null
  const fusedAt = (s) => (s < RD_LO || s > hi ? 0 : lin(fused, Math.log(s / RD_LO) / Math.log(RD_GRID)))
  // detail cap: luminance ACF central-peak half-width x 8
  const yl = []
  for (let l = 0; l < lines; l += Math.max(1, Math.ceil(lines / 64))) yl.push(Y.subarray(l * len, (l + 1) * len))
  const AY = rdAcf(yl, 0, len)
  let cap = Infinity
  if (AY) for (let l = 1; l < AY.length; l++) if (AY[l] < 0.5) { cap = 8 * (l - 1 + (AY[l - 1] - 0.5) / (AY[l - 1] - AY[l])); break }
  const vote = { ac: pAc, rl: pRl, ss: pSs, fu: pFu }
  const agreeN = (s) => Object.values(vote).filter((v) => v !== null && Math.abs(len / s - len / v) <= Math.max(1, (0.01 * len) / s)).length
  /** Stage 2 per axis: rc = recon channels (row-major [lines][len]) for distillability. */
  const arbitrate = (rc) => {
    const raw = [...Object.values(vote).filter((v) => v !== null), ...top5].filter((s) => s > 1.2 && s < hi).sort((a, b) => a - b), pool = []
    for (const s of raw) if (!pool.length || Math.log(s / pool[pool.length - 1]) > 0.02) pool.push(s)
    if (!pool.length) return null
    const yv = Float64Array.from(Y, (v) => v / 255), mY = meanOf(yv), totV = yv.reduce((a, v) => a + (v - mY) ** 2, 0) / yv.length
    const act = new Uint8Array(len * lines)
    for (let by = 0; by < lines; by += 4) for (let bx = 0; bx < len; bx += 4) { // 8x8 blocks at stride 4 (INFERRED: aligned blocks never straddle cells that are multiples of 8)
      let s1 = 0, s2 = 0, n = 0
      for (let l = by; l < Math.min(lines, by + 8); l++) for (let x = bx; x < Math.min(len, bx + 8); x++) { const v = yv[l * len + x]; s1 += v; s2 += v * v; n++ }
      if (s2 / n - (s1 / n) ** 2 > 0.02 * totV) for (let l = by; l < Math.min(lines, by + 8); l++) for (let x = bx; x < Math.min(len, bx + 8); x++) act[l * len + x] = 1
    }
    const pv = rdPrefix([yv], act, len, lines, 128), pr = rdPrefix(rc, null, len, lines, 128)
    let a1 = 0, a2 = 0, an = 0
    for (let p = 0; p < act.length; p++) if (act[p]) { a1 += yv[p]; a2 += yv[p] * yv[p]; an++ }
    const totA = an ? a2 / an - (a1 / an) ** 2 : totV // "total" = variance of the active pixels (INFERRED)
    const vc = pool.map((s) => { const e = rdPhases(pv, s); return (Math.max(...e) - Math.min(...e)) / (Math.min(...e) + 0.05 * totA) })
    const G2 = G.filter((_, i) => i % 8 === 0), E2 = G2.map((s) => Math.min(...rdPhases(pr, s)))
    const trend = (s) => { const v = E2.filter((_, i) => G2[i] >= s / 1.25 && G2[i] <= s * 1.25); return v.length ? medianOf(v) : null }
    const rec = pool.map((s) => { const e = rdPhases(pr, s), j = e.indexOf(Math.min(...e)), eb = e[j], er = e[(j + 4) % 8], tr = trend(s); return tr ? Math.max(er - eb, 0) * Math.max(1 - eb / tr, 0) : 0 })
    const rmax = Math.max(...rec)
    const sc = pool.map((s, i) => (fusedAt(s) + 0.2 * vc[i] + 0.25 * Math.max(0, agreeN(s) - 1) + (rmax > 0.005 ? (0.6 * rec[i]) / rmax : 0)) * (s > cap ? 0.35 : 1))
    const best = Math.max(...sc)
    return best > 0 ? pool[sc.findIndex((v) => v >= 0.78 * best)] : null
  }
  /** Drift-aware count for step s, or null when the gate does not open. */
  const drift = (s) => {
    if (len / s < 96) return null
    let cols = 0
    for (let i = 0; i < 8; i++) {
      const a = Math.floor((i * n1) / 8), b = Math.floor(((i + 1) * n1) / 8), Aw = rdAcf(bands, a, b)
      let bs = s, bv = -Infinity
      if (Aw) for (let e = -90; e <= 90; e++) { const t = s * (1 + e / 500), v = rdComb(Aw, t); if (v > bv) { bv = v; bs = t } }
      cols += (b - a) / bs
    }
    return Math.abs(cols - n1 / s) >= 2.5 ? (cols * len) / n1 : null
  }
  return { vote, top5, S, cap, fusedAt, arbitrate, drift }
}
function rdPca(img) { // recon channels: K = 14 k-means, PCA to 2 channels (power iteration) + centred alpha, scaled 0..1
  const { width: w, height: h, data: d } = img, n = w * h, { centers, labels } = kmeansRGB(img, 14, { maxSamples: 50000 })
  const X = new Float64Array(n * 3), m = [0, 0, 0]
  let cnt = 0, ma = 0
  for (let p = 0; p < n; p++) { ma += d[p * 4 + 3] / 255; if (labels[p] < 0) continue; for (let j = 0; j < 3; j++) { X[p * 3 + j] = centers[labels[p] * 3 + j] / 255; m[j] += X[p * 3 + j] } cnt++ }
  for (let j = 0; j < 3; j++) m[j] /= cnt || 1
  ma /= n
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let p = 0; p < n; p++) if (labels[p] >= 0) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (X[p * 3 + i] - m[i]) * (X[p * 3 + j] - m[j])
  const mul = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]), nrm = (v) => { const l = Math.hypot(...v); return l > 0 ? v.map((x) => x / l) : v }
  const power = (M, v) => { for (let it = 0; it < 60; it++) v = nrm(mul(M, v)); return v }
  const v1 = power(C, nrm([1, 1, 1])), l1 = mul(C, v1).reduce((s, x, i) => s + x * v1[i], 0)
  const v2 = power(C.map((r, i) => r.map((x, j) => x - l1 * v1[i] * v1[j])), nrm([1, -1, 0.5]))
  const P1 = new Float64Array(n), P2 = new Float64Array(n), PA = new Float64Array(n)
  for (let p = 0; p < n; p++) {
    PA[p] = d[p * 4 + 3] / 255 - ma
    if (labels[p] < 0) continue
    const r = [X[p * 3] - m[0], X[p * 3 + 1] - m[1], X[p * 3 + 2] - m[2]]
    P1[p] = r[0] * v1[0] + r[1] * v1[1] + r[2] * v1[2]; P2[p] = r[0] * v2[0] + r[1] * v2[1] + r[2] * v2[2]
  }
  return [P1, P2, PA]
}
const rdT = (a, w, h) => { const t = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = a[y * w + x]; return t }

/** Retro Diffusion Standard reference: returns its own discovered size, or the manual pixel size's (R10). */
export function retroDiffusion(img, { manualStep = null } = {}) {
  const { width: w, height: h, data: d } = img
  let cols, rows, route, info = {}
  if (manualStep) {
    cols = Math.max(1, Math.round(w / manualStep)); rows = Math.max(1, Math.round(h / manualStep)); route = 'manual'
  } else {
    const Y = new Float64Array(w * h)
    for (let p = 0; p < w * h; p++) Y[p] = d[p * 4 + 3] < 128 ? 0 : luma(d, p * 4)
    const M = median3(Y, w, h), Q = new Float64Array(w * h)
    for (let p = 0; p < w * h; p++) Q[p] = Math.round((M[p] / 255) * 11)
    const ax = rdAxis(Y, Q, w, h), ay = rdAxis(rdT(Y, w, h), rdT(Q, w, h), h, w)
    const tol = (m) => Math.max(1, 0.01 * m)
    const group = (ids) => {
      const cs = ids.map((v) => (ax?.vote[v] && ay?.vote[v] ? [w / ax.vote[v], h / ay.vote[v]] : null))
      if (cs.some((c) => !c)) return null
      const cx = cs.map((c) => c[0]), cy = cs.map((c) => c[1]), mc = medianOf(cx), mr = medianOf(cy)
      if (Math.max(...cx) - Math.min(...cx) > tol(mc) || Math.max(...cy) - Math.min(...cy) > tol(mr)) return null
      return Math.abs(Math.log(mc / mr / (w / h))) < 0.35 ? [mc, mr] : null
    }
    let sx = null, sy = null, g = group(['ac', 'rl', 'ss'])
    route = 'fast'
    if (!g) { route = 'supermajority'; for (const ids of [['ac', 'rl', 'ss', 'fu'], ['ac', 'rl', 'fu'], ['ac', 'ss', 'fu'], ['rl', 'ss', 'fu']]) if ((g = group(ids))) break }
    if (g) { sx = w / g[0]; sy = h / g[1] } else {
      route = 'arbitration'
      let rc = null
      const chans = () => (rc ??= rdPca(img))
      sx = ax ? ax.arbitrate(chans()) : null
      sy = ay ? ay.arbitrate(chans().map((c) => rdT(c, w, h))) : null
      if (sx === null) sx = sy
      if (sy === null) sy = sx
      if (sx !== null && Math.abs(Math.log(sx / sy)) > 0.45) { const f = Math.min(sx, sy), other = sx > sy ? ax : ay; if (other && other.fusedAt(f) >= 0.35) sx = sy = f }
      if (sx !== null && Math.abs(Math.log(sx / sy)) < 0.08) sx = sy = 2 / (1 / sx + 1 / sy)
    }
    info = { votes: { x: ax?.vote ?? null, y: ay?.vote ?? null }, S: [ax?.S ?? null, ay?.S ?? null] }
    if (sx === null) return { image: { width: w, height: h, data: Uint8ClampedArray.from(d) }, native: [w, h], info: { route: 'none', ...info } }
    const dx = ax?.drift(sx) ?? null, dy = ay?.drift(sy) ?? null
    cols = Math.max(1, Math.round(dx ?? w / sx)); rows = Math.max(1, Math.round(dy ?? h / sy))
    info.step = [sx, sy]; info.drift = [dx, dy]
  }
  // reconstruction: labels from k-means on opaque pixels (placement only), tent-weighted vote, label-masked mean
  const bin = { width: w, height: h, data: Uint8ClampedArray.from(d) }, c4 = new Set()
  for (let i = 3; i < bin.data.length; i += 4) { bin.data[i] = bin.data[i] >= 128 ? 255 : 0; if (bin.data[i]) c4.add(((d[i - 3] >> 4) << 8) | ((d[i - 2] >> 4) << 4) | (d[i - 1] >> 4)) }
  const K = clamp(c4.size, 16, 48), { labels } = kmeansRGB(bin, K), out = blank(cols, rows), cw = w / cols, chh = h / rows
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
  return { image: out, native: [cols, rows], info: { route, K, ...info } }
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

// ===================================================================================================
// Round-3 references (2026-10-20). Pinned sources were read through a web-fetch tool (a model-mediated
// reading of the public file at the pin; nothing downloaded, cloned, installed or run; no code copied):
// every step below is written from that reading and from the ecosystem spike's 2026-10-19 / 2026-10-20
// addenda. Same conventions: UNKNOWN = not established by the reading (substitute named), INFERRED = our
// interpretation, omitted = documented but not re-implemented. All MIT at the pins.
// | export              | tool, pin                                                       | read files at the pin                                   |
// |---------------------|-----------------------------------------------------------------|---------------------------------------------------------|
// | realPixelArt        | Bocchi-The-Glock/Real-PixelArt `17ce4875` (web core), MIT        | web/core/{grid,features,sampling,pipeline,config}.js    |
// | realPixelArtTarget  | same, fixed-size `targetAxis` route                             | web/core/grid.js targetAxis                             |
// | properPixelArt      | KennethJAllen/proper-pixel-art `4de0dda5`, MIT                   | proper_pixel_art/{mesh,image,colors,config}.py          |
// | fastPixelizer       | handsupmin/fast-pixelizer `5c041fce`, MIT                        | src/snap*.ts                                            |
// | breakfastz          | dolphinep/breakfastz-pixel-truth `a1a3961c`, MIT                 | src/lib/pixel/{grid,pipeline,resample,palette,cleanup}.ts |
// | pixelRefiner        | HappyOnigiri/PixelRefiner `c32659f3` (v1.1.1), MIT               | src/core/{grid-search,cell-sampler}.ts, grid-signals/{profiles,reconstruction,harmonics}.ts, shared/config.ts |
// Not re-implemented (no licence file; ideas only): pixel-pusher, perfectPixel, asepix.
// ===================================================================================================
const gaussZ = (z) => Math.exp(-0.5 * z * z)
const roundEven = (v) => { const r = Math.round(v); return Math.abs(v - Math.trunc(v)) === 0.5 && r % 2 ? r - 1 : r }
const interpAt = (p, x) => { if (x <= 0) return p[0]; if (x >= p.length - 1) return p[p.length - 1]; const i = Math.floor(x), f = x - i; return p[i] * (1 - f) + p[i + 1] * f }
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a }
function premul01(img) {
  const { width: w, height: h, data: d } = img, P = new Float64Array(w * h * 4)
  for (let p = 0; p < w * h; p++) { const a = d[p * 4 + 3] / 255; P[p * 4] = (d[p * 4] / 255) * a; P[p * 4 + 1] = (d[p * 4 + 1] / 255) * a; P[p * 4 + 2] = (d[p * 4 + 2] / 255) * a; P[p * 4 + 3] = a }
  return P
}
function sampleCuts(img, cx, cy, f) { // f(x0, x1, y0, y1) -> [r, g, b, a] bytes; integer cuts
  const out = blank(cx.length - 1, cy.length - 1)
  for (let j = 0; j < cy.length - 1; j++) for (let i = 0; i < cx.length - 1; i++) out.data.set(f(cx[i], cx[i + 1], cy[j], cy[j + 1]), (j * out.width + i) * 4)
  return out
}
const strictCuts = (c, n) => { const o = [0]; for (const v of c.map((x) => clamp(roundEven(x), 0, n))) if (v > o[o.length - 1]) o.push(v); if (o[o.length - 1] !== n) o.push(n); return o }
const topBy = (a, n) => [...a].sort((u, v) => v[1] - u[1] || u[0] - v[0]).slice(0, n).map((u) => u[0])

// ---------------------------------------------------------------------------------------------------
// 7. Real-PixelArt (reference re-implementation of Real-PixelArt `17ce4875` web core per ecosystem spike
// 2026-10-20 refresh, not the tool itself). Dense feature path (all fixtures < DENSE_PIXEL_LIMIT 4e6).
// Profile: premultiplied RGBA in [0, 1], max-channel |forward difference|, clipped at 0.35, mean per column/row;
// the features `smooth` kernel is UNKNOWN (substitute [1, 2, 1] / 4). Detection: exact integer grid (GCD of
// active positions, gradient > 1e-6, >= 4 positions, spacing ratio <= 1.12) first; else square candidates
// from edge-gap kernel peaks (top 3) and edge-FFT peaks (top 3), x1/x0.5/x2, range [2, min(64, dim/2)],
// fitted by fitPhase + regular lines, scored 0.48 units + 0.42 chance-corrected explained + 0.10 periodic,
// plus the "strong regular colour edges" independent-axis pair; top 3 re-cut (regular when explained > 0.94,
// else walkCuts); accept at score >= 0.30 with units >= 0.10 on both axes; else identity (input size).
// Omitted: image-spectrum trough proposals, spacing refinement for scores in [0.25, 0.30), segment validation,
// native_preserved / stylized / estimated-edge routes, curvature knots; palette: none (colors null default).
// Sampling: `robust` 5x5 median with centre-coherence check, alpha `auto` = sampled alpha.
// ---------------------------------------------------------------------------------------------------
const smooth121 = (p) => Float64Array.from(p, (v, i) => 0.25 * p[Math.max(0, i - 1)] + 0.5 * v + 0.25 * p[Math.min(p.length - 1, i + 1)])
function rpaFeatures(img) {
  const { width: w, height: h } = img, P = premul01(img), rx = new Float64Array(w), ry = new Float64Array(h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    if (x > 0) { let g = 0; for (let c = 0; c < 4; c++) g = Math.max(g, Math.abs(P[o + c] - P[o - 4 + c])); rx[x] += Math.min(g, 0.35) }
    if (y > 0) { let g = 0; for (let c = 0; c < 4; c++) g = Math.max(g, Math.abs(P[o + c] - P[o - 4 * w + c])); ry[y] += Math.min(g, 0.35) }
  }
  for (let x = 0; x < w; x++) rx[x] /= h
  for (let y = 0; y < h; y++) ry[y] /= w
  return { raw: [rx, ry], prof: [smooth121(rx), smooth121(ry)] }
}
function rpaGroups(p, frac = 0.16) { // thresholded local maxima merged across shallow valleys (>= 0.90 lower peak)
  let mx = 0
  for (const v of p) mx = Math.max(mx, v)
  const thr = Math.max(0.0008, frac * mx), groups = []
  for (let i = 1; i < p.length - 1; i++) {
    if (!(p[i] >= thr && p[i] > p[i - 1] && p[i] >= p[i + 1])) continue
    const g = groups[groups.length - 1]
    if (g) { let v = Infinity; for (let j = g.last; j <= i; j++) v = Math.min(v, p[j]); if (v >= 0.9 * Math.min(p[g.last], p[i])) { g.last = i; continue } }
    groups.push({ first: i, last: i })
  }
  return groups.map((g) => { const c = (g.first + g.last) / 2; return { c, w: interpAt(p, c) } })
}
function rpaPower(p) { const L = p.length, m = meanOf(p), x = Float64Array.from(p, (v) => v - m), pw = new Float64Array((L >> 1) + 2); for (let k = 1; k <= L >> 1; k++) pw[k] = dftMag(x, k / L) ** 2; return pw }
function rpaProposals(A, lo, hi) {
  const { groups, pw, L } = A, out = [], dens = []
  for (let s = lo; s <= hi + 1e-9; s += 0.25) {
    let v = 0
    const bw = Math.max(0.65, 0.09 * s)
    for (let i = 0; i + 1 < groups.length; i++) v += Math.min(groups[i].w, groups[i + 1].w) * gaussZ((groups[i + 1].c - groups[i].c - s) / bw)
    dens.push([s, v])
  }
  out.push(...topBy(dens.filter((d, i) => d[1] > 0 && (i === 0 || d[1] > dens[i - 1][1]) && (i === dens.length - 1 || d[1] >= dens[i + 1][1])), 3))
  const fp = []
  for (let k = 1; k <= L >> 1; k++) if (L / k >= lo && L / k <= hi && pw[k] > pw[k - 1] && pw[k] >= pw[k + 1]) fp.push([L / k, pw[k]])
  out.push(...topBy(fp, 3))
  return out
}
const rpaRes = (v, ph, s) => { const r = (((v - ph) % s) + s) % s; return r >= s / 2 ? r - s : r }
function rpaPhase(groups, s) {
  const n = Math.min(64, Math.max(12, Math.trunc(4 * s))), wd = Math.max(0.6, 0.12 * s)
  let best = 0, bs = -Infinity
  for (let i = 0; i < n; i++) { const ph = (i * s) / n; let sc = 0; for (const g of groups) sc += g.w * gaussZ(rpaRes(g.c, ph, s) / wd); if (sc > bs) { bs = sc; best = ph } }
  for (let pass = 0; pass < 2; pass++) {
    let sw = 0, sr = 0
    for (const g of groups) { const r = rpaRes(g.c, best, s); if (Math.abs(r) < Math.max(0.8, 0.2 * s)) { sw += g.w; sr += g.w * r } }
    if (sw > 0) best = (((best + sr / sw) % s) + s) % s
  }
  return best < 1e-7 || s - best < 1e-7 ? 0 : best
}
function rpaLines(L, s, ph) { const m = Math.max(0.5, 0.2 * s), c = [0]; for (let v = ph; v < L - m; v += s) if (v > m) c.push(v); c.push(L); return c }
function rpaMeasure(A, cuts, s) {
  const { groups, pw, L } = A
  if (groups.length < 4) return { score: 0, units: 0, explained: 0 }
  const tol = Math.max(0.65, 0.14 * s), chance = Math.min(0.85, (2.5066 * tol) / s)
  let mw = 0, mt = 0, j = 0
  for (const g of groups) { while (j + 1 < cuts.length && cuts[j + 1] <= g.c) j++; const dd = Math.min(Math.abs(g.c - cuts[j]), j + 1 < cuts.length ? Math.abs(cuts[j + 1] - g.c) : Infinity); mw += g.w * gaussZ(dd / tol); mt += g.w }
  const explained = Math.max(0, (mt ? mw / mt : 0) - chance) / (1 - chance)
  let uw = 0, ut = 0
  for (let i = 0; i + 1 < groups.length; i++) { const wt = Math.min(groups[i].w, groups[i + 1].w); uw += wt * gaussZ((groups[i + 1].c - groups[i].c - s) / Math.max(0.7, 0.12 * s)); ut += wt }
  const units = ut ? uw / ut : 0
  let pmax = 0
  for (let k = 1; k < pw.length; k++) pmax = Math.max(pmax, pw[k])
  const periodic = pmax > 0 ? Math.min(1, interpAt(pw, L / s) / pmax) : 0
  return { score: 0.48 * units + 0.42 * explained + 0.1 * periodic, units, explained }
}
function rpaWalk(groups, s, L) {
  if (s < 3 || groups.length < 4) return null
  const near = groups.filter((g) => Math.abs(g.c - L / 2) <= s)
  if (!near.length) return null // INFERRED: no anchor -> keep regular cuts
  const anchor = near.reduce((a, b) => (b.w > a.w ? b : a)).c, pick = (pred) => {
    let best = null, bs = -Infinity
    for (const g of groups) if (Math.abs(g.c - pred) <= 0.24 * s) { const v = g.w * gaussZ((g.c - pred) / (0.2 * s)); if (v > bs) { bs = v; best = g.c } }
    return best ?? pred
  }
  const right = [], left = []
  for (let p = anchor; ;) { const pred = p + s; if (pred > L - 0.2 * s) break; p = Math.max(pick(pred), p + 1); right.push(p) }
  for (let p = anchor; ;) { const pred = p - s; if (pred < 0.2 * s) break; p = Math.min(pick(pred), p - 1); left.push(p) }
  return [0, ...left.reverse(), anchor, ...right, L]
}
function rpaExact(raw) {
  const pos = []
  for (let i = 1; i < raw.length; i++) if (raw[i] > 1e-6) pos.push(i)
  if (pos.length < 4) return null
  let g = 0
  for (let i = 1; i < pos.length; i++) g = gcd(g, pos[i] - pos[i - 1])
  return { g, phase: pos[0] % g }
}
function rpaDetect(img, F) {
  const { width: w, height: h } = img, ex = rpaExact(F.raw[0]), ey = rpaExact(F.raw[1])
  if (ex && ey && Math.min(ex.g, ey.g) >= 2 && Math.max(ex.g, ey.g) <= 64 && Math.max(ex.g, ey.g) / Math.min(ex.g, ey.g) <= 1.12)
    return { route: 'exact', step: [ex.g, ey.g], cx: rpaLines(w, ex.g, ex.phase), cy: rpaLines(h, ey.g, ey.phase), score: 0.95 }
  const axes = [0, 1].map((a) => {
    const p = F.prof[a], L = a ? h : w, groups = rpaGroups(p), q95 = pctOf(p, 0.95), q20 = pctOf(p, 0.2)
    return { p, L, groups, pw: rpaPower(p), ok: groups.length >= 4 && (q95 - q20) / Math.max(q95, 1e-9) >= 0.25 }
  })
  if (!axes[0].ok || !axes[1].ok) return null
  const lo = 2, hi = Math.min(64, Math.min(w, h) / 2), props = []
  for (const s0 of [...rpaProposals(axes[0], lo, hi), ...rpaProposals(axes[1], lo, hi)]) for (const m of [1, 0.5, 2]) {
    const s = s0 * m
    if (s >= lo && s <= hi && !props.some((v) => Math.abs(v - s) < 0.08)) props.push(s)
  }
  const fitAxis = (A, s) => { const ph = rpaPhase(A.groups, s), cuts = rpaLines(A.L, s, ph); return { s, cuts, ...rpaMeasure(A, cuts, s) } }
  const fits = props.map((s) => { const per = axes.map((A) => fitAxis(A, s)); return { per, score: (per[0].score + per[1].score) / 2 } })
  const bestAxis = (a) => fits.map((f) => f.per[a]).reduce((u, v) => (v.score > u.score || (v.score === u.score && (v.s > u.s || (v.s === u.s && v.explained > u.explained))) ? v : u), { score: -1 })
  const bx = bestAxis(0), by = bestAxis(1)
  if (bx.s && by.s && bx.s !== by.s && bx.explained > 0.85 && by.explained > 0.85 && Math.max(bx.s, by.s) / Math.min(bx.s, by.s) <= 1.12) fits.push({ per: [bx, by], score: (bx.score + by.score) / 2 })
  const rank = (a, b) => b.score - a.score || b.per[0].s - a.per[0].s
  const top = fits.sort(rank).slice(0, 3).map((f) => {
    const per = f.per.map((r, a) => { if (r.explained > 0.94) return r; const c = rpaWalk(axes[a].groups, r.s, axes[a].L); return c ? { s: r.s, cuts: c, ...rpaMeasure(axes[a], c, r.s) } : r })
    return { per, score: (per[0].score + per[1].score) / 2 }
  }).sort(rank)
  const b = top[0]
  if (!b || b.score < 0.3 || b.per.some((r) => r.units < 0.1)) return null
  return { route: 'grid', step: [b.per[0].s, b.per[1].s], cx: b.per[0].cuts, cy: b.per[1].cuts, score: b.score }
}
function rpaRecover(img, cx, cy) { // `robust` sampling, alpha `auto` (sampled)
  const { width: W, data: d } = img, F = [0.18, 0.34, 0.5, 0.66, 0.82]
  const px = (x, y) => { const o = (y * W + x) * 4; return [d[o] / 255, d[o + 1] / 255, d[o + 2] / 255, d[o + 3] / 255] }
  const pm = (s) => [s[0] * s[3], s[1] * s[3], s[2] * s[3], s[3]]
  return sampleCuts(img, cx, cy, (x0, x1, y0, y1) => {
    let mass = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mass += d[(y * W + x) * 4 + 3]
    if (!mass) return [0, 0, 0, 0]
    const S = []
    for (const fy of F) for (const fx of F) S.push(px(Math.min(x1 - 1, x0 + Math.trunc(fx * (x1 - x0))), Math.min(y1 - 1, y0 + Math.trunc(fy * (y1 - y0)))))
    const vis = S.filter((s) => s[3] > 1e-6), med = [0, 1, 2].map((c) => { const v = vis.map((s) => s[c]).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : 0 })
    med.push(S.map((s) => s[3]).sort((a, b) => a - b)[12])
    const ccx = Math.min(x1 - 1, x0 + Math.trunc(0.5 * (x1 - x0))), ccy = Math.min(y1 - 1, y0 + Math.trunc(0.5 * (y1 - y0))), C = px(ccx, ccy), Cp = pm(C)
    let near = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const n = pm(px(clamp(ccx + i, x0, x1 - 1), clamp(ccy + j, y0, y1 - 1))); if (Math.max(...n.map((v, k) => Math.abs(v - Cp[k]))) < 0.1) near++ }
    const tiny = x1 - x0 <= 2 || y1 - y0 <= 2, dev = [0, 1, 2].some((c) => Math.abs(C[c] - med[c]) > 0.1)
    const v = near < 3 && !tiny && (dev || Math.abs(C[3] - med[3]) > 0.1) ? med : C
    return v[3] <= 0 ? [0, 0, 0, 0] : v.map((x) => Math.round(x * 255))
  })
}
/** Real-PixelArt reference, automatic size: returns its own discovered size (identity when no grid). */
export function realPixelArt(img) {
  const F = rpaFeatures(img), g = rpaDetect(img, F)
  if (!g) return { image: { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }, native: [img.width, img.height], info: { route: 'none' } }
  const image = rpaRecover(img, strictCuts(g.cx, img.width), strictCuts(g.cy, img.height))
  return { image, native: [image.width, image.height], info: { route: g.route, step: g.step, score: g.score } }
}
function rpaTargetAxis(p, n, L) { // fixed count: phase-searched regular cuts in +-0.45 p, then the warp DP
  const s = L / n, r = 0.45 * s, reg = Array.from({ length: n + 1 }, (_, k) => roundEven(k * s))
  let mn = Infinity, mx = -Infinity
  for (const v of p) { mn = Math.min(mn, v); mx = Math.max(mx, v) }
  const amp = mx - mn
  if (n === 1 || n === L || !(amp > 0.0008)) return reg
  const ev = Float64Array.from(p, (v) => (v - mn) / amp), peaks = rpaGroups(ev)
  if (!peaks.length) return reg
  const lo = (k) => Math.max(k, Math.min(reg[k], Math.ceil(k * s - r))), hi = (k) => Math.min(L - n + k, Math.max(reg[k], Math.floor(k * s + r)))
  const E = (c) => (c > 0 && c < L ? ev[c] : 0), unary = (c, g) => -E(c) + 0.12 * ((c - g) / s) ** 2, gapC = (g) => 0.35 * ((g - s) / s) ** 2
  const fitted = clamp(Math.round(rpaRes(rpaPhase(peaks, s), 0, s) * 8) / 8, -r, r)
  const shifts = [0, fitted, ...Array.from({ length: 17 }, (_, i) => -r + (2 * r * i) / 16)]
  let best = null, bc = Infinity
  for (const sh of shifts) {
    const c = [0]
    for (let k = 1; k < n; k++) c.push(clamp(roundEven(k * s + sh), lo(k), hi(k)))
    c.push(L)
    let cost = 0
    for (let k = 1; k < n; k++) cost += unary(c[k], k * s)
    for (let k = 1; k <= n; k++) cost += gapC(c[k] - c[k - 1])
    if (cost < bc - 1e-12) { bc = cost; best = c }
  }
  if (s < 2) return best
  // warp DP (local_warp 'auto' INFERRED on): candidates per cut, unary against the global cut, gap transitions
  const cand = [[0]]
  for (let k = 1; k < n; k++) {
    const a = lo(k), b = hi(k), set = new Set([best[k]])
    if (b - a + 1 < 17) for (let c = a; c <= b; c++) set.add(c)
    else {
      for (let i = 0; i < 9; i++) set.add(Math.round(a + ((b - a) * i) / 8))
      const pk = []
      for (let c = a; c <= b; c++) if (E(c) >= E(c - 1) && E(c) > E(c + 1)) pk.push([c, E(c)])
      for (const c of topBy(pk, 7)) set.add(c)
    }
    cand.push([...set].sort((u, v) => u - v))
  }
  cand.push([L])
  let prev = [{ c: 0, v: 0, back: null }]
  for (let k = 1; k <= n; k++) {
    const cur = []
    for (const c of cand[k]) {
      let bv = Infinity, bb = null
      for (const q of prev) if (c > q.c) { const v = q.v + gapC(c - q.c); if (v < bv) { bv = v; bb = q } }
      if (bb) cur.push({ c, v: bv + (k < n ? unary(c, best[k]) : 0), back: bb })
    }
    prev = cur
  }
  if (!prev.length) return best
  const out = []
  for (let q = prev[0]; q; q = q.back) out.push(q.c)
  return out.reverse()
}
/** Real-PixelArt reference, fixed target size (`fitTargetGrid` / `targetAxis`): exactly tw x th by construction. */
export function realPixelArtTarget(img, tw, th) {
  if (tw > img.width || th > img.height) throw new Error('realPixelArt reference: target exceeds source')
  const F = rpaFeatures(img)
  return rpaRecover(img, rpaTargetAxis(F.prof[0], tw, img.width), rpaTargetAxis(F.prof[1], th, img.height))
}

// ---------------------------------------------------------------------------------------------------
// 8. proper-pixel-art (reference re-implementation of proper-pixel-art `4de0dda5` per ecosystem spike
// 2026-10-19 addendum "Grid-size model selection", not the tool itself). Config defaults read at the pin:
// upscale x2 then fallback x1 on a trivial mesh, crop_border 2, Canny (50, 200), closing 8, HoughLinesP
// (rho 1, theta 1 deg, threshold 100, minLineLength 50, maxLineGap 10), angle 15 deg, cluster 4, snap +-2 at
// 0.5 x profile mean, width: Hough gap median (>= 5 gaps, 20 % trims) / peak spacing (0.2 max, merge < 3) /
// autocorrelation (lag >= 2, >= 0.2), axis ratio 1.8, mesh split int(gap / w + 0.6), snap window
// max(2, 0.35 w), validation keep 1 + 1.5 / replace 1 + 0.2 (pixel-weighted within-cell grey variance);
// colours: method `dominant` (bins 52, two grids offset 26, per-channel median), merge_distance 12 complete
// linkage, alpha 128, transparency majority 0.5. Substitutes (UNKNOWN or OpenCV, not re-implemented): Canny =
// Sobel L1 + 4-direction NMS + 8-connected hysteresis; closing = separable 8x8 max/min; HoughLinesP =
// axis-aligned only (a column/row with >= 100 edge pixels holding a >= 50 px run with gaps <= 10); upscale
// interpolation = nearest (UNKNOWN); grey = Rec.601, alpha < 128 -> 0; output-colour merge = greedy complete
// linkage in RGB, most frequent member kept (space and representative UNKNOWN); border lines map to 0 and W.
// ---------------------------------------------------------------------------------------------------
function ppaEdges(G, W, H) {
  const gx = new Float64Array(W * H), gy = new Float64Array(W * H), mag = new Float64Array(W * H)
  const at = (x, y) => G[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x
    gx[p] = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
    gy[p] = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
    mag[p] = Math.abs(gx[p]) + Math.abs(gy[p])
  }
  const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mag[y * W + x]), st = new Uint8Array(W * H), stack = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, m = mag[p]
    if (m <= 50) continue
    const ax = Math.abs(gx[p]), ay = Math.abs(gy[p])
    let a, b
    if (ay <= ax * 0.4142) { a = M(x - 1, y); b = M(x + 1, y) } else if (ay > ax * 2.4142) { a = M(x, y - 1); b = M(x, y + 1) } else if (gx[p] * gy[p] > 0) { a = M(x - 1, y - 1); b = M(x + 1, y + 1) } else { a = M(x + 1, y - 1); b = M(x - 1, y + 1) }
    if (m > a && m >= b) { st[p] = 1; if (m > 200) { st[p] = 2; stack.push(p) } }
  }
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p - x) / W
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const q = (y + j) * W + x + i; if (x + i >= 0 && x + i < W && y + j >= 0 && y + j < H && st[q] === 1) { st[q] = 2; stack.push(q) } }
  }
  const E = Uint8Array.from(st, (v) => (v === 2 ? 1 : 0))
  const pass = (src, horiz, isMax, lo, hi) => { // separable rect filter over offsets [lo, hi], outside ignored
    const out = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = isMax ? 0 : 1
      for (let k = lo; k <= hi; k++) { const xx = horiz ? x + k : x, yy = horiz ? y : y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const s = src[yy * W + xx]; v = isMax ? v | s : v & s }
      out[y * W + x] = v
    }
    return out
  }
  const dil = pass(pass(E, true, true, -4, 3), false, true, -4, 3)
  return pass(pass(dil, true, false, -3, 4), false, false, -3, 4)
}
function ppaHough(E, W, H, vertical) {
  const out = [], n = vertical ? W : H, m = vertical ? H : W
  for (let i = 0; i < n; i++) {
    let cnt = 0, run = 0, best = 0, gap = 0
    for (let j = 0; j < m; j++) {
      const v = vertical ? E[j * W + i] : E[i * W + j]
      cnt += v
      if (v) { run += gap + 1; gap = 0; best = Math.max(best, run) } else if (run) { gap++; if (gap > 10) { run = 0; gap = 0 } }
    }
    if (cnt >= 100 && best >= 50) out.push(i)
  }
  return out
}
function ppaCluster(pos, t = 4) {
  const s = [...pos].sort((a, b) => a - b), out = []
  let cur = []
  const flush = () => { if (cur.length) { const k = cur.length; out.push(roundEven(k & 1 ? cur[k >> 1] : (cur[k / 2 - 1] + cur[k / 2]) / 2)) } cur = [] }
  for (const v of s) { if (cur.length && v - cur[cur.length - 1] > t) flush(); cur.push(v) }
  flush()
  return out
}
function ppaSnap(prof, t, rad, lo, hi) { // strongest peak within +-rad of t, strictly inside (lo, hi), if > 0.5 mean
  const mean = meanOf(prof)
  let best = -1, bv = -Infinity
  for (let i = Math.max(lo + 1, t - rad); i <= Math.min(hi - 1, t + rad); i++) if (prof[i] > bv) { bv = prof[i]; best = i }
  return best >= 0 && bv > 0.5 * mean ? best : t
}
function ppaWidthAxis(lines, prof) {
  const gaps = lines.slice(1).map((v, i) => v - lines[i]).sort((a, b) => a - b), r = {}
  if (gaps.length >= 5) { const k = Math.floor(0.2 * gaps.length); r.hough = Math.round(medianOf(gaps.slice(k, gaps.length - k))) }
  let mx = 0
  for (const v of prof) mx = Math.max(mx, v)
  const pk = []
  for (let i = 1; i < prof.length - 1; i++) if (prof[i] > 0.2 * mx && prof[i] > prof[i - 1] && prof[i] >= prof[i + 1]) { if (pk.length && i - pk[pk.length - 1] < 3) { if (prof[i] > prof[pk[pk.length - 1]]) pk[pk.length - 1] = i } else pk.push(i) }
  if (pk.length >= 2) r.peak = Math.round(medianOf(pk.slice(1).map((v, i) => v - pk[i])))
  const m = meanOf(prof), c = Float64Array.from(prof, (v) => v - m), n = c.length
  let a0 = 0
  for (const v of c) a0 += v * v
  if (a0 > 0) {
    const ac = (l) => { let s = 0; for (let i = 0; i + l < n; i++) s += c[i] * c[i + l]; return s / a0 }
    let prev = ac(1), cur = ac(2)
    for (let l = 2; l < n / 2; l++) { const nx = ac(l + 1); if (cur > prev && cur >= nx && cur >= 0.2) { r.auto = l; break } prev = cur; cur = nx }
  }
  r.best = r.hough ?? r.peak ?? r.auto ?? null
  return r
}
function ppaComplete(lines, wd, prof) {
  let cur = lines
  const rad = Math.max(2, Math.round(0.35 * wd))
  for (let pass = 0; pass < 8; pass++) {
    const out = [cur[0]]
    let changed = false
    for (let i = 0; i + 1 < cur.length; i++) {
      const a = cur[i], b = cur[i + 1], n = Math.trunc((b - a) / wd + 0.6)
      for (let k = 1; k < n; k++) { const t = ppaSnap(prof, a + Math.trunc((k * (b - a)) / n), rad, out[out.length - 1], b); if (t > out[out.length - 1] && t < b) { out.push(t); changed = true } }
      out.push(b)
    }
    cur = out
    if (!changed) break
  }
  return cur
}
function ppaMesh(img) {
  const B = 2, W = img.width - 2 * B, H = img.height - 2 * B, d = img.data
  if (W < 8 || H < 8) return null
  const G = new Float64Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = ((y + B) * img.width + x + B) * 4; G[y * W + x] = d[o + 3] >= 128 ? luma(d, o) : 0 }
  const E = ppaEdges(G, W, H), prof = [new Float64Array(W), new Float64Array(H)]
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) prof[0][x] += Math.abs(G[y * W + x + 1] - G[y * W + x - 1])
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) prof[1][y] += Math.abs(G[(y + 1) * W + x] - G[(y - 1) * W + x])
  const base = [W, H].map((L, a) => {
    const ls = ppaCluster([0, L - 1, ...ppaHough(E, W, H, a === 0)])
    return ppaCluster(ls.map((v, i) => (i === 0 || i === ls.length - 1 ? v : ppaSnap(prof[a], v, 2, -1, L))))
  })
  const est = base.map((ls, a) => ppaWidthAxis(ls, prof[a]))
  const [ex, ey] = est.map((e) => e.best)
  let wd = ex && ey ? (Math.max(ex, ey) / Math.min(ex, ey) > 1.8 ? Math.min(ex, ey) : Math.round((ex + ey) / 2)) : ex ?? ey
  if (!wd) { const g = base.flatMap((ls) => ls.slice(1).map((v, i) => v - ls[i])); wd = g.length ? Math.round(medianOf(g)) : null }
  if (!wd || wd < 1) return null
  const mesh = (w0) => base.map((ls, a) => ppaComplete(ls, w0, prof[a]))
  if (wd >= 2) { // validation over the candidate widths (pixel-weighted mean within-cell grey variance)
    const score = (w0) => {
      const [mx, my] = mesh(w0), ix = new Int32Array(W), iy = new Int32Array(H)
      for (let i = 0, c = 0; i < W; i++) { while (c + 2 < mx.length && i >= mx[c + 1]) c++; ix[i] = c }
      for (let i = 0, c = 0; i < H; i++) { while (c + 2 < my.length && i >= my[c + 1]) c++; iy[i] = c }
      const nc = (mx.length - 1) * (my.length - 1), S = new Float64Array(nc), S2 = new Float64Array(nc), N = new Float64Array(nc)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = iy[y] * (mx.length - 1) + ix[x], v = G[y * W + x]; S[c] += v; S2[c] += v * v; N[c]++ }
      let t = 0
      for (let c = 0; c < nc; c++) if (N[c]) t += S2[c] - (S[c] * S[c]) / N[c]
      return t / (W * H)
    }
    const cands = [...new Set([wd, ...est.flatMap((e) => [e.hough, e.peak, e.auto])].filter((v) => v && v >= 2 && v <= Math.min(W, H) / 2))]
    if (cands.length) {
      const sc = new Map(cands.map((c) => [c, score(c)])), best = Math.min(...sc.values())
      if (!(sc.has(wd) && sc.get(wd) <= 2.5 * best)) { const ok = cands.filter((c) => sc.get(c) <= 1.2 * best); if (ok.length) wd = Math.max(...ok) }
    }
  }
  const [mx, my] = mesh(wd)
  const shift = (ls, L) => ls.map((v, i) => (i === 0 ? 0 : i === ls.length - 1 ? L : v + B))
  return { cx: shift(mx, img.width), cy: shift(my, img.height), width: wd, lines: [mx.length, my.length] }
}
function ppaDominant(img, cx, cy) {
  const { width: W, data: d } = img
  const med = (s) => [0, 1, 2].map((c) => { const v = s.map((p) => p[c]).sort((a, b) => a - b), k = v.length; return k & 1 ? v[k >> 1] : Math.floor((v[k / 2 - 1] + v[k / 2]) / 2) })
  return sampleCuts(img, cx, cy, (x0, x1, y0, y1) => {
    const px = []
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 4; if (d[o + 3] >= 128) px.push([d[o], d[o + 1], d[o + 2]]) }
    const n = (x1 - x0) * (y1 - y0)
    if (!px.length || px.length <= n * 0.5) return [0, 0, 0, 0]
    if (px.length <= 3) return [...med(px), 255]
    let best = null
    for (const off of [0, 26]) {
      const bins = new Map()
      for (const p of px) { const k = (Math.floor((p[0] + off) / 52) * 8 + Math.floor((p[1] + off) / 52)) * 8 + Math.floor((p[2] + off) / 52); let b = bins.get(k); if (!b) bins.set(k, (b = [])); b.push(p) }
      let top = null
      for (const v of bins.values()) if (!top || v.length > top.length) top = v
      if (!best || top.length > best.length) best = top
    }
    return [...med(best), 255]
  })
}
function mergeColours(img, dist) { // greedy complete-linkage merge of output colours (substitute)
  const cnt = new Map(), d = img.data
  for (let p = 0; p < img.width * img.height; p++) if (d[p * 4 + 3]) { const k = (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2]; cnt.set(k, (cnt.get(k) ?? 0) + 1) }
  if (cnt.size > 4096) return img
  const keys = [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a - b), rgb = (k) => [k >> 16, (k >> 8) & 255, k & 255], clusters = [], map = new Map()
  for (const k of keys) {
    const c = rgb(k), cl = clusters.find((m) => m.every((q) => { const e = rgb(q); return (e[0] - c[0]) ** 2 + (e[1] - c[1]) ** 2 + (e[2] - c[2]) ** 2 <= dist * dist }))
    if (cl) { cl.push(k); map.set(k, cl[0]) } else { clusters.push([k]); map.set(k, k) }
  }
  const out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(d) }
  for (let p = 0; p < img.width * img.height; p++) if (d[p * 4 + 3]) out.data.set(rgb(map.get((d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2])), p * 4)
  return out
}
/** proper-pixel-art reference: returns its own discovered size (mesh cells). */
export function properPixelArt(img) {
  for (const f of [2, 1]) {
    const work = f === 2 ? adapt(img, img.width * 2, img.height * 2) : img, m = ppaMesh(work)
    if (!m) continue
    if (f === 2 && m.lines[0] <= 3 && m.lines[1] <= 3) continue
    const image = mergeColours(ppaDominant(work, m.cx, m.cy), 12)
    return { image, native: [image.width, image.height], info: { scale: f, width: m.width } }
  }
  return { image: { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }, native: [img.width, img.height], info: { scale: 0 } }
}

// ---------------------------------------------------------------------------------------------------
// 9. fast-pixelizer `snap` (reference re-implementation of fast-pixelizer `5c041fce` per ecosystem spike
// 2026-10-19 addendum, not the tool itself), options colorVariety 32, output 'resized' (one pixel per cell;
// the default 'original' repaints blocks at source size). Order: exact-neighbour ratio, native palette
// (<= 1024 RGBA), uniform run-length grid, exact-scale search, exact-transition grid (square only), native
// bypass, else k-means(32) + luma profiles + autocorrelation steps, crisp (phase-aligned) / walked grids,
// peak-grid override, detail modes (enhance: long axis 128-299; preserve: >= 128 and cell <= 9 or >= 300 and
// cell <= 5) with k-means 256, else cell mode on the quantized image. k-means: RGB, alpha > 0, <= 50000
// samples, mulberry32(42) k-means++, 15 iterations (kmeansRGB above; its stop rule is max squared move < 0.01
// after the first iteration, the original's is L1 move <= 0.01). UNKNOWN substitutes: "locally aligned cuts"
// = the walked cuts; "transition grid too coarse" not used; square forcing = rounded mean of the two counts;
// harmonic multiple test = |r - round r| <= 0.08 with round r >= 2.
// ---------------------------------------------------------------------------------------------------
const FP_MIN_CELLS = 4
const fpKey = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0
const fpMinStep = (w, h) => Math.max(2, Math.ceil(Math.min(w, h) / 256))
function fpSmooth(p) { const W = [0.5, 1, 2, 1, 0.5]; return Float64Array.from(p, (_, i) => { let s = 0, t = 0; for (let k = -2; k <= 2; k++) if (i + k >= 0 && i + k < p.length) { s += W[k + 2] * p[i + k]; t += W[k + 2] } return s / t }) }
function fpProfiles(img) {
  const { width: w, height: h, data: d } = img, L = new Float64Array(w * h), px = new Float64Array(w), py = new Float64Array(h)
  for (let p = 0; p < w * h; p++) L[p] = d[p * 4 + 3] ? luma(d, p * 4) : 0
  for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) px[x] += Math.abs(L[y * w + x + 1] - L[y * w + x - 1])
  for (let y = 1; y < h - 1; y++) for (let x = 0; x < w; x++) py[y] += Math.abs(L[(y + 1) * w + x] - L[(y - 1) * w + x])
  return [px, py]
}
function fpPeriodic(p, minLag = 2) {
  const s = fpSmooth(p), m = meanOf(s), c = Float64Array.from(s, (v) => v - m), maxLag = Math.min(256, Math.floor(p.length / 3)), lo = Math.max(2, Math.min(maxLag, Math.ceil(minLag)))
  let e = 0
  for (const v of c) e += v * v
  if (!(e > 0)) return null
  let best = null, bc = -Infinity
  for (let l = lo; l <= maxLag; l++) { let a = 0, b = 0, ab = 0; for (let i = 0; i + l < c.length; i++) { ab += c[i] * c[i + l]; a += c[i] * c[i]; b += c[i + l] * c[i + l] } const r = a > 0 && b > 0 ? ab / Math.sqrt(a * b) : 0; if (r > bc) { bc = r; best = l } }
  return best && Number.isFinite(bc) && bc > 0 ? { step: best, confidence: bc } : null
}
function fpPeakStep(p, minLag = 2) {
  const s = fpSmooth(p), m = meanOf(s), sd = Math.sqrt(meanOf(Array.from(s, (v) => (v - m) ** 2))), thr = m + 0.75 * sd, pk = []
  for (let i = 1; i < s.length - 1; i++) if (s[i] >= thr && s[i] > s[i - 1] && s[i] >= s[i + 1]) pk.push(i)
  if (pk.length < 4) return null
  const maxLag = Math.min(256, Math.floor(p.length / 3)), lo = Math.max(2, Math.ceil(minLag)), hist = new Map()
  let tot = 0
  for (let i = 1; i < pk.length; i++) { const g = pk[i] - pk[i - 1]; if (g >= lo && g <= maxLag) { hist.set(g, (hist.get(g) ?? 0) + 1); tot++ } }
  let best = 0, bc = 0
  for (const [g, c] of [...hist].sort((a, b) => a[0] - b[0])) if (c > bc) { bc = c; best = g }
  return tot && bc / tot >= 0.3 ? { step: best, confidence: bc / tot } : null
}
function fpWalk(p, step, limit) {
  const win = Math.max(2, 0.35 * step), mean = meanOf(p), cuts = [0]
  for (let pos = 0; ;) {
    const t = pos + step
    if (t >= limit) { cuts.push(limit); break }
    let bi = -1, bv = -Infinity
    for (let i = Math.max(pos + 1, Math.ceil(t - win)); i <= Math.min(limit - 1, Math.floor(t + win)); i++) if (p[i] > bv) { bv = p[i]; bi = i }
    pos = bi >= 0 && bv > 0.5 * mean ? bi : Math.max(pos + 1, Math.round(t))
    if (pos >= limit) { cuts.push(limit); break }
    cuts.push(pos)
  }
  return cuts
}
function fpTrim(cuts, step, limit) {
  const c = [...cuts]
  while (c.length > 2 && c[1] - c[0] < 0.5 * step) c.splice(1, 1)
  while (c.length > 2 && c[c.length - 1] - c[c.length - 2] < 0.5 * step) c.splice(c.length - 2, 1)
  c[0] = 0; c[c.length - 1] = limit
  return c
}
const fpUniformCuts = (limit, cells) => { const n = Math.max(FP_MIN_CELLS, Math.min(limit, Math.round(cells))); return Array.from({ length: n + 1 }, (_, i) => Math.round((i * limit) / n)) }
function fpClamp(w, h, cols, rows) {
  if (Math.min(cols, rows) <= 256) return { cols, rows }
  return cols <= rows ? { cols: 256, rows: Math.max(FP_MIN_CELLS, Math.round((256 * h) / w)) } : { rows: 256, cols: Math.max(FP_MIN_CELLS, Math.round((256 * w) / h)) }
}
function fpUniformGrid(img) {
  const { width: w, height: h, data: d } = img
  const axis = (horiz) => {
    const n = horiz ? h : w, limit = horiz ? w : h, stride = Math.max(1, Math.floor(n / 128)), hist = new Map()
    let total = 0, maxRuns = 0, maxThin = 0
    for (let l = 0; l < n; l += stride) {
      let runs = 0, thin = 0, start = 0
      const key = (i) => fpKey(d, (horiz ? l * w + i : i * w + l) * 4)
      for (let i = 1; i <= limit; i++) {
        if (i < limit && key(i) === key(i - 1)) continue
        const len = i - start, first = start === 0, last = i === limit
        if (len >= 2 && len <= 256) { hist.set(len, (hist.get(len) ?? 0) + 1); total++ }
        if (len >= 2 || first || last) runs++; else thin++
        start = i
      }
      maxRuns = Math.max(maxRuns, runs); maxThin = Math.max(maxThin, thin)
    }
    if (total < 64) return null
    let best = null, bf = 0
    for (let s = 2; s <= Math.min(256, Math.floor(limit / FP_MIN_CELLS)); s++) {
      let k = 0
      for (const [len, c] of hist) if (len % s === 0) k += c
      const f = k / total
      if (f < 0.72) continue
      if (!best || f > bf + 0.02 || (f >= 0.98 * bf && s > best)) { best = s; bf = Math.max(bf, f) }
    }
    if (!best) return null
    const cells = maxThin >= 0.5 * maxRuns ? maxRuns : Math.max(Math.round(limit / best), Math.min(maxRuns, Math.ceil(limit / best) + 1))
    return { step: best, cells, confidence: bf }
  }
  const H = axis(true), V = axis(false)
  if (!H || !V || Math.min(H.step, V.step) <= fpMinStep(w, h)) return null
  return { cols: Math.max(FP_MIN_CELLS, H.cells), rows: Math.max(FP_MIN_CELLS, V.cells), confidence: Math.min(H.confidence, V.confidence) }
}
function fpTransitionGrid(img) {
  const { width: w, height: h, data: d } = img
  if (w !== h) return null
  const prof = (horiz) => {
    const n = horiz ? h : w, limit = horiz ? w : h, lines = Math.min(512, n), p = new Float64Array(limit)
    for (let k = 0; k < lines; k++) { const l = Math.floor((k * n) / lines); for (let i = 1; i < limit; i++) { const a = horiz ? l * w + i : i * w + l, b = horiz ? a - 1 : a - w; if (fpKey(d, a * 4) !== fpKey(d, b * 4)) p[i]++ } }
    for (let i = 0; i < limit; i++) p[i] /= lines
    return p
  }
  const px = prof(true), py = prof(false), avg = (meanOf(px) + meanOf(py)) / 2, maxN = Math.min(256, w, h, Math.floor(Math.min(w, h) / fpMinStep(w, h)))
  const sc = (n) => { const f = (p, L) => { let s = 0; for (let i = 1; i < n; i++) s += p[Math.round((i * L) / n)] ?? 0; return n > 1 ? s / (n - 1) : 0 }; return (f(px, w) + f(py, h)) / 2 }
  let best = 0, bs = -1
  const all = new Map()
  for (let n = FP_MIN_CELLS; n <= maxN; n++) { const s = sc(n); all.set(n, s); if (s > bs) { bs = s; best = n } }
  if (!best || bs < 0.08 || bs / (avg + 1e-9) < 3) return null
  for (let n = best + 1; n <= maxN; n++) if (all.get(n) >= 0.8 * bs) best = n
  return { cols: best, rows: best, confidence: bs / (avg + 1e-9) }
}
function fpExactScale(img) {
  const { width: w, height: h, data: d } = img
  for (let s = Math.floor(Math.min(64, w / FP_MIN_CELLS, h / FP_MIN_CELLS)); s >= 2; s--) {
    if (w % s || h % s) continue
    let ok = true
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w; x++) if (fpKey(d, (y * w + x) * 4) !== fpKey(d, (Math.floor(y / s) * s * w + Math.floor(x / s) * s) * 4)) { ok = false; break }
    if (ok) return s
  }
  return 1
}
function fpModeCells(img, cx, cy) {
  const { width: W, data: d } = img
  return sampleCuts(img, cx, cy, (x0, x1, y0, y1) => {
    const m = new Map()
    let bk = 0, bc = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = fpKey(d, (y * W + x) * 4), c = (m.get(k) ?? 0) + 1; m.set(k, c); if (c > bc) { bc = c; bk = k } }
    return [bk >>> 24, (bk >>> 16) & 255, (bk >>> 8) & 255, bk & 255]
  })
}
function fpDetailCells(img, cx, cy, edge) {
  const { width: W, height: H, data: d } = img
  return sampleCuts(img, cx, cy, (x0, x1, y0, y1) => {
    const s = [0, 0, 0, 0]
    let lo = Infinity, hi = -Infinity, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 4; for (let c = 0; c < 4; c++) s[c] += d[o + c]; const l = luma(d, o); lo = Math.min(lo, l); hi = Math.max(hi, l); n++ }
    const ct = hi - lo, wt = edge ? 0.2 + clamp((ct - 8) / 32, 0, 1) * 0.8 : 0.1 + clamp((ct - 14) / 44, 0, 1) * 0.75
    const o = (clamp(Math.floor((y0 + y1) / 2), 0, H - 1) * W + clamp(Math.floor((x0 + x1) / 2), 0, W - 1)) * 4
    return s.map((v, c) => clamp(Math.round(v / n + (d[o + c] - v / n) * wt), 0, 255))
  })
}
function fpSharpen(img) {
  const { width: w, height: h, data: d } = img, out = { width: w, height: h, data: Uint8ClampedArray.from(d) }, K = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let b = 0, k = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) b += K[k++] * luma(d, ((y + j) * w + x + i) * 4)
    const diff = luma(d, (y * w + x) * 4) - b / 16, adj = Math.sign(diff) * Math.min(20, Math.max(0, Math.abs(diff) - 2) * 0.4), o = (y * w + x) * 4
    for (let c = 0; c < 3; c++) out.data[o + c] = clamp(Math.round(d[o + c] + adj), 0, 255)
  }
  return out
}
/** fast-pixelizer snap reference (output 'resized'): returns its own discovered size. */
export function fastPixelizer(img, { colorVariety = 32 } = {}) {
  const { width: w, height: h, data: d } = img
  let same = 0, pairs = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (x + 1 < w) { pairs++; same += fpKey(d, o) === fpKey(d, o + 4) } if (y + 1 < h) { pairs++; same += fpKey(d, o) === fpKey(d, o + 4 * w) } }
  const ratio = pairs ? same / pairs : 0, pal = new Set()
  for (let p = 0; p < w * h && pal.size <= 1024; p++) pal.add(fpKey(d, p * 4))
  const nativePal = pal.size <= 1024
  let uniform = fpUniformGrid(img), exactScale = 1, st = null
  const steps = () => (st ??= (() => { const [px, py] = fpProfiles(img); return [fpPeriodic(px), fpPeriodic(py)] })())
  if (!uniform && nativePal) { const [a, b] = steps(); if (a && b && Math.max(a.step, b.step) <= fpMinStep(w, h)) { exactScale = fpExactScale(img); if (exactScale > 1) uniform = { cols: w / exactScale, rows: h / exactScale, confidence: 1 } } }
  const trans = fpTransitionGrid(img)
  const grid = uniform && (!trans || (uniform.confidence >= 0.95 && Math.min(uniform.cols, uniform.rows) >= 2 * Math.min(trans.cols, trans.rows))) ? uniform : trans ?? uniform
  if (!uniform && nativePal) { const [a, b] = steps(); if (Math.min(w, h) <= 256 || (!trans && a && b && Math.max(a.step, b.step) <= fpMinStep(w, h))) return { image: { width: w, height: h, data: Uint8ClampedArray.from(d) }, native: [w, h], info: { path: 'native-bypass' } } }
  let image, path
  if (grid) {
    const c = exactScale === 1 ? fpClamp(w, h, grid.cols, grid.rows) : grid
    image = fpModeCells(img, fpUniformCuts(w, c.cols), fpUniformCuts(h, c.rows)); path = 'strong-grid'
  } else {
    const q = quantize(img, colorVariety, { maxSamples: 50000 }).image, [qx, qy] = fpProfiles(q), sx = fpPeriodic(qx), sy = fpPeriodic(qy)
    let step = Math.min(w, h) / 64
    if (sx && sy) { const [a, b] = sx.step <= sy.step ? [sx, sy] : [sy, sx], r = b.step / a.step; step = Math.round(r) >= 2 && Math.abs(r - Math.round(r)) <= 0.08 && a.confidence >= 0.55 ? a.step : (sx.step + sy.step) / 2 } else if (sx || sy) step = (sx ?? sy).step
    let cols, rows, cuts = null, walked = null
    if (sx && sy && sx.confidence >= 0.55 && sy.confidence >= 0.55 && ratio >= 0.6) {
      const s = Math.max(1, Math.round(step)), phaseOf = (p) => { let b = 0, bv = -Infinity; for (let ph = 0; ph < s; ph++) { let t = 0, n = 0; for (let i = ph; i < p.length; i += s) { t += p[i]; n++ } if (n && t / n > bv) { bv = t / n; b = ph } } return b === s - 1 ? 0 : b }
      const lay = (ph, L) => { const c = [0]; for (let i = ph; i < L; i += s) if (i > 0) c.push(i); if (c[c.length - 1] !== L) c.push(L); return c }
      cuts = [lay(phaseOf(qx), w), lay(phaseOf(qy), h)]; cols = Math.max(FP_MIN_CELLS, cuts[0].length - 1); rows = Math.max(FP_MIN_CELLS, cuts[1].length - 1); path = 'crisp'
    } else {
      walked = [fpTrim(fpWalk(qx, step, w), step, w), fpTrim(fpWalk(qy, step, h), step, h)]
      cols = Math.max(FP_MIN_CELLS, walked[0].length - 1); rows = Math.max(FP_MIN_CELLS, walked[1].length - 1); path = 'walked'
    }
    if (w === h && cols !== rows) { cols = rows = Math.round((cols + rows) / 2); cuts = null }
    const pa = fpPeakStep(qx), pb = fpPeakStep(qy)
    if (pa && pb) {
      const ps = (pa.step + pb.step) / 2, pc = Math.max(FP_MIN_CELLS, fpTrim(fpWalk(qx, ps, w), ps, w).length - 1), pr = Math.max(FP_MIN_CELLS, fpTrim(fpWalk(qy, ps, h), ps, h).length - 1)
      if (Math.min(cols, rows) < 24 && Math.min(pc, pr) > 1.8 * Math.min(cols, rows) && Math.min(w / pc, h / pr) >= fpMinStep(w, h) && Math.abs(pc / pr / (w / h) - 1) <= 0.05) { cols = pc; rows = pr; cuts = null; walked = null; path = 'peak' }
    }
    const cell = Math.min(w / cols, h / rows), long = Math.max(w, h), sc = cuts ?? [fpUniformCuts(w, cols), fpUniformCuts(h, rows)]
    const k256 = (im) => quantize(im, Math.max(colorVariety, 256), { iters: 12 }).image
    if (long >= 128 && long <= 299 && cell <= 9 && ratio >= 0.25 && walked) { image = k256(fpSharpen(fpDetailCells(img, walked[0], walked[1], true))); path += '+enhance' }
    else if ((long >= 128 && cell <= 9 && ratio >= 0.25) || (long >= 300 && cell <= 5)) { image = k256(fpDetailCells(img, sc[0], sc[1], false)); path += '+preserve' }
    else image = fpModeCells(q, sc[0], sc[1])
  }
  return { image, native: [image.width, image.height], info: { path } }
}

// ---------------------------------------------------------------------------------------------------
// 10. breakfastz-pixel-truth (reference re-implementation of breakfastz-pixel-truth `a1a3961c` per ecosystem
// spike 2026-10-19 addendum, not the tool itself), DEFAULT_OPTIONS: auto grid, auto palette 16 (k-means on
// the sampled cells), no dither, orphan removal and pixel-perfect on (skipped for "clean" exact-99 grids),
// background off. Grid order: integer scale (clean, then noisy 3-bit), snapped comb grid (`detected`
// = confidence > 1.4), freeform (block-size estimate, width max(8, round(w / block))). Sampling: inset 0.3
// (exact) / 0.22 (snapped), 5-bit mode bucket then the bucket mean; freeform: whole cell + keepDetail.
// UNKNOWN substitutes: luminance = Rec.601; snapCuts reads the filtered profile; per-candidate phase = the
// best comb phase of that period; uniformGrid rows via round(j * cell) clamped to h; k-means space = OKLab
// (the source comment says OKLab, the helper is `rgbToLab`); PRNG = mulberry32(42); the orphan lightness
// guard 0.25 is read as OKLab L; refinement steps of 1 % of the period.
// ---------------------------------------------------------------------------------------------------
function bfProfile(img, axis) {
  const { width: w, height: h, data: d } = img, Y = new Float64Array(w * h)
  for (let p = 0; p < w * h; p++) Y[p] = luma(d, p * 4)
  const L = axis ? h : w, raw = new Float64Array(L)
  for (let i = 1; i < L; i++) { let s = 0; if (axis) for (let x = 0; x < w; x++) s += Math.abs(Y[i * w + x] - Y[(i - 1) * w + x]); else for (let y = 0; y < h; y++) s += Math.abs(Y[y * w + i] - Y[y * w + i - 1]); raw[i] = s }
  return raw
}
const bfSmooth = (raw) => Float64Array.from(raw, (v, i) => 0.25 * raw[i > 0 ? i - 1 : i] + 0.5 * v + 0.25 * raw[i < raw.length - 1 ? i + 1 : i])
function bfFilter(raw) {
  const s = bfSmooth(raw), f = new Float64Array(s.length), pk = []
  for (let i = 1; i < s.length - 1; i++) if (s[i] >= s[i - 1] && s[i] >= s[i + 1] && s[i] > 0) pk.push(i)
  const t = 0.25 * pctOf(pk.map((i) => s[i]), 0.9)
  for (const i of pk) if (s[i] >= t) f[i] = s[i]
  return f
}
const bfAt = (f, x) => Math.max(f[Math.floor(x)] ?? 0, f[Math.ceil(x)] ?? 0)
function bfScore(f, p, mean) { let best = -1, bp = 0; for (let ph = 0; ph < p; ph += 0.25) { let s = 0, n = 0; for (let x = ph; x < f.length; x += p) { s += bfAt(f, x); n++ } const v = n ? s / n / mean : 0; if (v > best) { best = v; bp = ph } } return { score: best, phase: bp } }
function bfTeeth(f, big, phase, n, mean) { let s = 0, k = 0; for (let i = 0, x = phase; x < f.length; i++, x = phase + (i * big) / n) { if (i % n === 0) continue; s += bfAt(f, x); k++ } return k ? s / k / mean : 0 }
function bfPeriod(raw, minP = 2, maxP = Math.min(64, raw.length / 4)) {
  const f = bfFilter(raw), mean = meanOf(f)
  if (!(mean > 0) || maxP < minP) return null
  const all = []
  let best = null
  for (let p = minP; p <= maxP + 1e-9; p += p < 16 ? 0.05 : 0.1) { const r = bfScore(f, p, mean); all.push(r.score); if (!best || r.score > best.score) best = { p, ...r } }
  const refine = (p0) => { let b = null; for (let k = -3; k <= 3; k++) { const p = p0 * (1 + k / 100), r = bfScore(f, p, mean); if (!b || r.score > b.score) b = { p, ...r } } return b }
  best = refine(best.p)
  for (let changed = true; changed;) {
    changed = false
    for (let n = 6; n >= 2; n--) {
      if (best.p / n < 3) continue
      const r = refine(best.p / n)
      if (r.score >= 0.45 * best.score && bfTeeth(f, best.p, best.phase, n, mean) >= 2) { best = r; changed = true; break }
    }
  }
  const med = medianOf(all)
  return { period: best.p, phase: best.phase, score: best.score, median: med, confidence: med > 0 ? best.score / med : 0, f, mean }
}
function bfSnap(f, mean, period, phase) {
  const L = f.length, cuts = [0]
  let off = 0
  for (let k = 0; ; k++) {
    const base = phase + k * period, pos = base + off
    if (pos >= L - 0.4 * period) break
    let bi = -1, bv = -Infinity
    for (let i = Math.max(1, Math.ceil(pos - 0.3 * period)); i <= Math.min(L - 1, Math.floor(pos + 0.3 * period)); i++) if (f[i] > bv) { bv = f[i]; bi = i }
    let cut
    if (bi >= 0 && bv > 1.2 * mean) { let a = bi, b = bi; while (a > 0 && f[a - 1] >= 0.9 * bv) a--; while (b < L - 1 && f[b + 1] >= 0.9 * bv) b++; cut = Math.round((a + b) / 2); off = cut - base } else cut = Math.round(pos)
    if (cut >= cuts[cuts.length - 1] + 0.5 * period) cuts.push(cut)
  }
  if (cuts.length > 1 && L - cuts[cuts.length - 1] < 0.5 * period) cuts.pop()
  cuts.push(L)
  return cuts
}
function bfCellNoise(img, xs, ys) {
  const { width: W, data: d } = img, v = []
  const sx = Math.max(1, Math.floor((xs.length - 1) / 32)), sy = Math.max(1, Math.floor((ys.length - 1) / 32))
  for (let j = 0; j < ys.length - 1; j += sy) for (let i = 0; i < xs.length - 1; i += sx) {
    const tx = Math.floor(0.25 * (xs[i + 1] - xs[i])), ty = Math.floor(0.25 * (ys[j + 1] - ys[j])), x0 = xs[i] + tx, x1 = Math.max(x0 + 1, xs[i + 1] - tx), y0 = ys[j] + ty, y1 = Math.max(y0 + 1, ys[j + 1] - ty)
    const S = [0, 0, 0], S2 = [0, 0, 0]
    let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * W + x) * 4; for (let c = 0; c < 3; c++) { S[c] += d[o + c]; S2[c] += d[o + c] ** 2 } n++ }
    let t = 0
    for (let c = 0; c < 3; c++) t += Math.max(0, S2[c] / n - (S[c] / n) ** 2)
    v.push(Math.sqrt(t))
  }
  return pctOf(v, 0.9)
}
function bfIntegerScale(img, noisy) {
  const { width: w, height: h, data: d } = img, key = (p) => (d[p * 4 + 3] < 128 ? -1 : noisy ? ((d[p * 4] >> 5) << 6) | ((d[p * 4 + 1] >> 5) << 3) | (d[p * 4 + 2] >> 5) : (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2])
  const cols = new Set()
  for (let p = 0; p < w * h && cols.size <= 4096; p++) cols.add(key(p))
  if (!noisy && cols.size > 4096) return null
  const runs = [], starts = [[], []]
  for (const horiz of [true, false]) {
    const n = horiz ? h : w, L = horiz ? w : h
    for (let l = 0; l < n; l++) {
      let start = 0
      const at = (k) => key(horiz ? l * w + k : k * w + l)
      for (let i = 1; i <= L; i++) {
        if (i < L && at(i) === at(i - 1)) continue
        if (start > 0 && i < L) { runs.push(i - start); starts[horiz ? 0 : 1].push(start) }
        start = i
      }
    }
  }
  if (runs.length < 20) return null
  let k = 0
  for (let c = 32; c >= (noisy ? 2 : 1); c--) { let m = 0; for (const r of runs) if (r % c === 0) m++; if (m / runs.length >= (noisy ? 0.85 : 0.97)) { k = c; break } }
  if (!k) return null
  if (k === 1 && !(runs.filter((r) => r === 1).length >= 0.1 * runs.length && cols.size <= 64 && meanOf(runs) <= 4)) return null
  const cutsOf = (L, st) => {
    const m = new Map()
    for (const s of st) m.set(s % k, (m.get(s % k) ?? 0) + 1)
    let ph = 0, bc = -1
    for (const [r, c] of [...m].sort((a, b) => a[0] - b[0])) if (c > bc) { bc = c; ph = r }
    const c = [0]
    for (let x = ph || k; x < L; x += k) c.push(x)
    if (c.length > 1 && L - c[c.length - 1] < k / 2) c.pop()
    c.push(L)
    return c
  }
  return { kind: 'exact', xs: cutsOf(w, starts[0]), ys: cutsOf(h, starts[1]), confidence: noisy ? 90 : 99 }
}
function bfDetectGrid(img) {
  const { width: w, height: h } = img, ex = bfPeriod(bfProfile(img, 0)), ey = bfPeriod(bfProfile(img, 1))
  if (!ex || !ey) return null
  const cands = []
  for (const base of [ex.period, ey.period]) for (const m of [1, 2, 3, 0.5, 1 / 3]) { const p = base * m; if (p >= 3 && p <= Math.min(w, h) / 3 && !cands.some((c) => Math.abs(c - p) / c < 0.05)) cands.push(p) }
  if (!cands.length) cands.push(ex.period)
  const built = cands.map((p) => { const ax = bfScore(ex.f, p, ex.mean), ay = bfScore(ey.f, p, ey.mean), xs = bfSnap(ex.f, ex.mean, p, ax.phase), ys = bfSnap(ey.f, ey.mean, p, ay.phase); return { p, xs, ys, noise: bfCellNoise(img, xs, ys), sx: ax.score, sy: ay.score } })
  const best = Math.min(...built.map((b) => b.noise)), pick = built.filter((b) => b.noise <= 1.35 * best + 2).reduce((a, b) => (b.p > a.p ? b : a))
  const confidence = Math.min(ex.median > 0 ? pick.sx / ex.median : 0, ey.median > 0 ? pick.sy / ey.median : 0)
  return { kind: 'snapped', xs: pick.xs, ys: pick.ys, confidence, detected: confidence > 1.4 }
}
function bfBlockSize(img) {
  const { width: w, height: h } = img, gaps = []
  for (const axis of [0, 1]) {
    const s = bfSmooth(bfProfile(img, axis)), m = meanOf(s)
    let last = -1
    for (let i = 1; i < s.length - 1; i++) if (s[i] > 1.5 * m && s[i] >= s[i - 1] && s[i] >= s[i + 1]) { if (last >= 0 && i - last >= 3) gaps.push(i - last); last = i }
  }
  if (!gaps.length) return Math.max(1, Math.min(w, h) / 64)
  const small = Math.min(w, h) <= 160
  return clamp(small ? pctOf(gaps, 0.25) : medianOf(gaps), small ? 2 : 3, 64)
}
function bfUniform(w, h, tw) { const cell = w / tw, rows = Math.max(1, Math.round(h / cell)); return { xs: Array.from({ length: tw + 1 }, (_, i) => Math.min(w, Math.round(i * cell))), ys: Array.from({ length: rows + 1 }, (_, j) => (j === rows ? h : Math.min(h, Math.round(j * cell)))) } }
const okOf = (r, g, b) => { const o = new Float64Array(3); srgbToOklab(r, g, b, o, 0); return o }
function bfSample(img, xs, ys, inset, keepDetail) {
  const { width: W, data: d } = img, ink = [], out = blank(xs.length - 1, ys.length - 1)
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const ix = Math.floor((xs[i + 1] - xs[i]) * inset), iy = Math.floor((ys[j + 1] - ys[j]) * inset)
    const x0 = xs[i] + ix, x1 = Math.max(x0 + 1, xs[i + 1] - ix), y0 = ys[j] + iy, y1 = Math.max(y0 + 1, ys[j + 1] - iy), b = new Map()
    let op = 0, n = 0, inkN = 0
    const inkS = [0, 0, 0]
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4
      n++
      if (d[o + 3] < 128) continue
      op++
      const k = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3)
      let e = b.get(k)
      if (!e) b.set(k, (e = [0, 0, 0, 0]))
      e[0] += d[o]; e[1] += d[o + 1]; e[2] += d[o + 2]; e[3]++
      if (luma(d, o) < 60) { inkN++; inkS[0] += d[o]; inkS[1] += d[o + 1]; inkS[2] += d[o + 2] }
    }
    const idx = j * out.width + i
    ink[idx] = { cov: op ? inkN / op : 0, col: inkN ? inkS.map((v) => v / inkN) : null }
    if (!op || op < 0.5 * n) continue
    const ranked = [...b.values()].sort((u, v) => v[3] - u[3])
    let c = ranked[0].slice(0, 3).map((v) => v / ranked[0][3])
    if (keepDetail) {
      if (inkN >= 0.2 * op) c = ink[idx].col
      else if (ranked[1] && ranked[1][3] >= 0.3 * op) {
        const c2 = ranked[1].slice(0, 3).map((v) => v / ranked[1][3]), L1 = okOf(...c.map(Math.round))[0], L2 = okOf(...c2.map(Math.round))[0]
        if (Math.abs(L1 - L2) > 0.12 && (L2 < L1 || ranked[1][3] >= 0.4 * op)) c = c2
      }
    }
    out.data.set([...c.map(Math.round), 255], idx * 4)
  }
  if (keepDetail) { // bridgeInk
    const W2 = out.width, H2 = out.height, cov = (x, y) => (x < 0 || y < 0 || x >= W2 || y >= H2 ? 0 : ink[y * W2 + x].cov)
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const k = ink[y * W2 + x]
      if (!(k.cov >= 0.08 && k.cov < 0.2) || !k.col) continue
      if ([[1, 0], [0, 1], [1, 1], [1, -1]].some(([a, b]) => cov(x - a, y - b) >= 0.2 && cov(x + a, y + b) >= 0.2)) out.data.set([...k.col.map(Math.round), 255], (y * W2 + x) * 4)
    }
  }
  return out
}
function bfKmeans(img, k, iters = 14) {
  const d = img.data, cnt = new Map()
  for (let p = 0; p < img.width * img.height; p++) if (d[p * 4 + 3] >= 128) { const key = (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2]; cnt.set(key, (cnt.get(key) ?? 0) + 1) }
  const keys = [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a) || a - b), N = keys.length
  if (N <= k) return keys.map((q) => [q >> 16, (q >> 8) & 255, q & 255])
  const X = new Float64Array(N * 3), Wt = keys.map((q) => cnt.get(q))
  keys.forEach((q, i) => srgbToOklab(q >> 16, (q >> 8) & 255, q & 255, X, i * 3))
  const C = new Float64Array(k * 3), D = new Float64Array(N).fill(Infinity), r = mulberry32(42), dd = (i, c) => (X[i * 3] - C[c * 3]) ** 2 + (X[i * 3 + 1] - C[c * 3 + 1]) ** 2 + (X[i * 3 + 2] - C[c * 3 + 2]) ** 2
  for (let c = 0; c < k; c++) {
    let pick = 0
    if (c > 0) { let tot = 0; for (let i = 0; i < N; i++) tot += Wt[i] * D[i]; let t = r() * tot; for (pick = 0; pick < N - 1; pick++) { t -= Wt[pick] * D[pick]; if (t <= 0) break } }
    C.set(X.subarray(pick * 3, pick * 3 + 3), c * 3)
    for (let i = 0; i < N; i++) D[i] = Math.min(D[i], dd(i, c))
  }
  for (let it = 0; it < iters; it++) {
    const S = new Float64Array(k * 3), T = new Float64Array(k)
    for (let i = 0; i < N; i++) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { const v = dd(i, c); if (v < bd) { bd = v; b = c } } for (let j = 0; j < 3; j++) S[b * 3 + j] += Wt[i] * X[i * 3 + j]; T[b] += Wt[i] }
    for (let c = 0; c < k; c++) if (T[c]) for (let j = 0; j < 3; j++) C[c * 3 + j] = S[c * 3 + j] / T[c]
  }
  const pal = []
  for (let c = 0; c < k; c++) { const o = [0, 0, 0]; oklabToSrgb(C[c * 3], C[c * 3 + 1], C[c * 3 + 2], o, 0); pal.push([...o, C[c * 3]]) }
  return pal.sort((a, b) => a[3] - b[3]).map((p) => p.slice(0, 3))
}
function bfApply(img, pal) {
  const P = pal.map((c) => okOf(...c)), out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }, o = new Float64Array(3), d = out.data
  for (let p = 0; p < img.width * img.height; p++) {
    if (d[p * 4 + 3] < 128) { d.set([0, 0, 0, 0], p * 4); continue }
    srgbToOklab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], o, 0)
    let b = 0, bd = Infinity
    P.forEach((q, i) => { const v = (q[0] - o[0]) ** 2 + (q[1] - o[1]) ** 2 + (q[2] - o[2]) ** 2; if (v < bd) { bd = v; b = i } })
    d.set([...pal[b], 255], p * 4)
  }
  return out
}
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
function bfKeyAt(img, x, y) { if (x < 0 || y < 0 || x >= img.width || y >= img.height) return -2; const o = (y * img.width + x) * 4; return img.data[o + 3] < 128 ? -1 : (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2] }
function bfMajority(keys) { const m = new Map(); let bk, bc = 0; for (const k of keys) { if (k === -2) continue; const c = (m.get(k) ?? 0) + 1; m.set(k, c); if (c > bc) { bc = c; bk = k } } return bk }
function bfOrphans(img) {
  const out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const k = bfKeyAt(img, x, y)
    if (k < 0) continue
    const nb = N8.map(([a, b]) => bfKeyAt(img, x + a, y + b)), inb = nb.filter((v) => v !== -2)
    if (inb.length < 3 || inb.includes(k)) continue
    const m = bfMajority(nb)
    if (m === undefined || m === -1) continue
    if (Math.abs(okOf(k >> 16, (k >> 8) & 255, k & 255)[0] - okOf(m >> 16, (m >> 8) & 255, m & 255)[0]) > 0.25) continue
    out.data.set([m >> 16, (m >> 8) & 255, m & 255, 255], (y * img.width + x) * 4)
  }
  return out
}
function bfPixelPerfect(img) {
  const out = { width: img.width, height: img.height, data: Uint8ClampedArray.from(img.data) }, arms = [[[0, -1], [1, 0]], [[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]]]
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const k = bfKeyAt(out, x, y)
    if (k < 0) continue
    const same = (dx, dy) => bfKeyAt(out, x + dx, y + dy) === k, orth = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([a, b]) => same(a, b))
    if (orth.length !== 2) continue
    for (const [A, B] of arms) {
      if (!same(...A) || !same(...B) || same(A[0] + B[0], A[1] + B[1])) continue
      if (same(2 * A[0], 2 * A[1]) && same(2 * B[0], 2 * B[1])) continue // both arms long: a box corner
      const m = bfMajority(N8.map(([a, b]) => bfKeyAt(out, x + a, y + b)).filter((v) => v !== k))
      out.data.set(m === undefined || m < 0 ? [0, 0, 0, 0] : [m >> 16, (m >> 8) & 255, m & 255, 255], (y * img.width + x) * 4)
      break
    }
  }
  return out
}
/** breakfastz-pixel-truth reference (defaults); `manualWidth` = its manual grid mode. Returns its own size. */
export function breakfastz(img, { manualWidth = null, colors = 16 } = {}) {
  const { width: w, height: h } = img
  let g
  if (manualWidth) g = { kind: 'manual', ...bfUniform(w, h, manualWidth), confidence: 0 }
  else {
    g = bfIntegerScale(img, false) ?? bfIntegerScale(img, true)
    if (!g) { const s = bfDetectGrid(img); g = s?.detected ? s : { kind: 'freeform', ...bfUniform(w, h, Math.max(8, Math.round(w / bfBlockSize(img)))), confidence: s?.confidence ?? 0 } }
  }
  const cells = bfSample(img, g.xs, g.ys, g.kind === 'exact' ? 0.3 : g.kind === 'snapped' ? 0.22 : 0, g.kind === 'freeform' || g.kind === 'manual')
  const clean = g.kind === 'exact' && g.confidence === 99, nCol = new Set()
  for (let p = 0; p < cells.width * cells.height; p++) if (cells.data[p * 4 + 3]) nCol.add((cells.data[p * 4] << 16) | (cells.data[p * 4 + 1] << 8) | cells.data[p * 4 + 2])
  let image = clean && nCol.size <= colors ? cells : bfApply(cells, bfKmeans(cells, colors))
  if (!clean) image = bfPixelPerfect(bfOrphans(image))
  return { image, native: [image.width, image.height], info: { kind: g.kind, confidence: g.confidence } }
}

// ---------------------------------------------------------------------------------------------------
// 11. PixelRefiner phase-aware grid search + cell sampler (reference re-implementation of PixelRefiner
// `c32659f3` src/core/grid-search.ts, grid-signals/{profiles,reconstruction,harmonics}.ts, cell-sampler.ts and
// shared/config.ts limits, not the tool itself). Runs `searchPhaseAwareGrid` on the full canvas, then
// `hard-alpha-medoid` sampling (32 samples, cellAlphaThreshold 16, core margin 0.375 / max 6 / min span 2,
// coverage >= 128 -> opaque), no colour reduction (PROCESS_DEFAULTS reduceColors false). Omitted (not
// re-implemented): the processor's classifier/routes, trim-to-content (the tool searches the opaque bbox),
// the trimmed-grid strategy and detector.ts fallbacks (used above maxPhaseAwarePixels 1.2 Mpx or when an axis
// score < 0.55: this reference runs the phase-aware search regardless), background tools, thin-feature
// preservation, Gemini watermark handling. UNKNOWN substitutes: transitions "before/after" = pixels p-1 and p;
// phases rounded to quarter pixels; stratified sample grid rows = round(sqrt(32 h / w)).
// ---------------------------------------------------------------------------------------------------
function prProfiles(img) {
  const { width: w, height: h, data: d } = img, stride = Math.max(1, Math.ceil(Math.max(w, h) / 256)), Y = new Float64Array(w * h)
  for (let p = 0; p < w * h; p++) Y[p] = 0.2126 * SRGB_TO_LINEAR[d[p * 4]] + 0.7152 * SRGB_TO_LINEAR[d[p * 4 + 1]] + 0.0722 * SRGB_TO_LINEAR[d[p * 4 + 2]]
  const axes = [0, 1].map((axis) => {
    const L = axis ? h : w, M = axis ? w : h, col = new Float64Array(L + 1), lum = new Float64Array(L + 1), al = new Float64Array(L + 1), n = new Float64Array(L + 1)
    const reg = Array.from({ length: 4 }, () => ({ v: new Float64Array(L + 1), n: new Float64Array(L + 1) }))
    for (let m = 0; m < M; m += stride) {
      const r = reg[Math.min(3, Math.floor((m * 4) / M))]
      for (let p = 1; p < L; p++) {
        const a = axis ? (p - 1) * w + m : m * w + p - 1, b = axis ? p * w + m : m * w + p
        if (d[a * 4 + 3] < 16 && d[b * 4 + 3] < 16) continue
        const c = (Math.abs(d[a * 4] - d[b * 4]) + Math.abs(d[a * 4 + 1] - d[b * 4 + 1]) + Math.abs(d[a * 4 + 2] - d[b * 4 + 2])) / 765, l = Math.abs(Y[a] - Y[b]), al0 = Math.abs(d[a * 4 + 3] - d[b * 4 + 3]) / 255
        col[p] += c; lum[p] += l; al[p] += al0; n[p]++
        r.v[p] += 0.45 * c + 0.35 * l + 0.2 * al0; r.n[p]++
      }
    }
    for (let p = 0; p <= L; p++) if (n[p]) { col[p] /= n[p]; lum[p] /= n[p]; al[p] /= n[p] }
    for (const r of reg) for (let p = 0; p <= L; p++) if (r.n[p]) r.v[p] /= r.n[p]
    const comb = new Float64Array(L + 1)
    for (let p = 1; p <= L - 2; p++) comb[p] = col[p] + 0.7 * lum[p] + 0.3 * al[p]
    return { L, comb, regions: reg.map((r) => r.v) }
  })
  return [...axes, stride]
}
const prNorm = (v, c) => { let r = ((v % c) + c) % c; if (r < 1e-6 || c - r < 1e-6) r = 0; return r }
function prAlign(e, cell, phase) {
  const L = e.length - 1
  let tot = 0, al = 0, mx = 0
  for (let p = 1; p < L; p++) { tot += e[p]; mx = Math.max(mx, e[p]); const r = prNorm(p - phase, cell); if (Math.min(r, cell - r) <= 0.625) al += e[p] }
  const recall = tot > 0 ? al / tot : 0
  let ev = 0, cnt = 0
  for (let b = phase === 0 ? cell : phase; b < L; b += cell) {
    cnt++
    let v = 0
    for (let q = Math.ceil(b - 1); q <= Math.floor(b + 1); q++) if (q >= 0 && q <= L) v = Math.max(v, e[q] * (1 - Math.abs(q - b)))
    ev += v
  }
  const precision = cnt && mx > 0 ? ev / (cnt * mx) : 0
  return clamp(recall * 0.65 + precision * 0.35, 0, 1)
}
function prAuto(e, cell) {
  const base = Math.max(1, Math.round(cell)), L = e.length - 1
  const lag = (l) => {
    const n = L - 1 - l
    if (l < 1 || n < 3) return 0
    let ma = 0, mb = 0
    for (let i = 1; i + l < L; i++) { ma += e[i]; mb += e[i + l] }
    ma /= n; mb /= n
    let ab = 0, aa = 0, bb = 0
    for (let i = 1; i + l < L; i++) { const a = e[i] - ma, b = e[i + l] - mb; ab += a * b; aa += a * a; bb += b * b }
    return aa > 0 && bb > 0 ? clamp(ab / Math.sqrt(aa * bb), 0, 1) : 0
  }
  return clamp(0.55 * lag(base) + 0.3 * lag(2 * base) + 0.15 * lag(3 * base), 0, 1)
}
const prAgree = (v) => { if (v.length <= 1) return v.length; const m = meanOf(v); return clamp(1 - 2 * Math.sqrt(meanOf(v.map((x) => (x - m) ** 2))), 0, 1) }
function prAxisCands(A, maxCell) {
  const { L, comb, regions } = A, cells = new Set(), tr = []
  for (let n = 1; n <= Math.min(600, L); n++) cells.add(+(L / n).toFixed(4))
  for (let c = 1; c <= Math.floor(maxCell); c++) cells.add(c)
  for (let p = 1; p < L; p++) if (comb[p] > 0) tr.push([p, comb[p]])
  const strong = topBy(tr, 32).sort((a, b) => a - b)
  for (let i = 0; i < strong.length; i++) for (let j = i + 1; j < strong.length && j - i < 9; j++) cells.add(+((strong[j] - strong[i]) / (j - i)).toFixed(4))
  const score = (cell, ph, ac) => { const align = prAlign(comb, cell, ph), loc = prAgree(regions.map((r) => prAlign(r, cell, ph))); return (0.75 * align + 0.15 * ac + 0.1 * loc) * Math.min(1, L / cell / 3) }
  const evalCell = (cell) => {
    const ac = prAuto(comb, cell), phs = new Set([0])
    for (const t of strong) phs.add(+prNorm(Math.round(prNorm(t, cell) * 4) / 4, cell).toFixed(4))
    let best = null
    for (const ph of phs) { const s = score(cell, ph, ac); if (!best || s > best.score) best = { cell, phase: ph, score: s } }
    return best.phase === 0 ? [best] : [best, { cell, phase: 0, score: score(cell, 0, ac) }]
  }
  const all = [...cells].filter((c) => c >= 1 && c <= maxCell).flatMap(evalCell)
  all.sort((a, b) => b.score - a.score || b.cell - a.cell || a.phase - b.phase)
  const outN = (c) => Math.max(1, Math.ceil((L - (c.phase > 0 ? c.phase - c.cell : 0)) / c.cell)), seen = new Set(), base = []
  for (const c of all) { if (base.length >= 12) break; const n = outN(c); if (!seen.has(n)) { seen.add(n); base.push(c) } }
  const out = [...base]
  for (const b of base) { if (out.length >= 24) break; if (2 * b.cell <= maxCell) out.push(...evalCell(2 * b.cell)) }
  const uniq = new Map()
  for (const c of out.slice(0, 24)) uniq.set(`${c.cell}:${c.phase}`, c)
  return [...uniq.values()]
}
function prRecon(img, OK, cropX, cropY, cw, ch, stride) {
  const { width: W, height: H, data: d } = img
  let s = 0, n = 0
  for (let y = 0; y < H; y += stride) {
    const cy = clamp(Math.floor(cropY + (Math.floor((y - cropY) / ch) + 0.5) * ch), 0, H - 1)
    for (let x = 0; x < W; x += stride) {
      const p = y * W + x
      if (d[p * 4 + 3] < 16) continue
      const q = cy * W + clamp(Math.floor(cropX + (Math.floor((x - cropX) / cw) + 0.5) * cw), 0, W - 1)
      s += 0.8 * Math.sqrt((OK[p * 3] - OK[q * 3]) ** 2 + (OK[p * 3 + 1] - OK[q * 3 + 1]) ** 2 + (OK[p * 3 + 2] - OK[q * 3 + 2]) ** 2) + (0.2 * Math.abs(d[p * 4 + 3] - d[q * 4 + 3])) / 255
      n++
    }
  }
  return n ? s / n : Infinity
}
function prHarmonics(pairs) {
  const isInt = (v) => Math.abs(v - Math.round(v)) <= 0.001
  for (const p of pairs) {
    if (p.harm) { p.score += 14; continue }
    for (const s of pairs) {
      if (s === p) continue
      const rx = p.x.cell / s.x.cell, ry = p.y.cell / s.y.cell, fx = Math.round(rx), fy = Math.round(ry)
      if ((fx === 1 && fy === 1) || fx < 1 || fx > 3 || fy < 1 || fy > 3 || ![p.x.cell, p.y.cell, s.x.cell, s.y.cell].every(isInt) || Math.abs(rx - fx) > 0.02 || Math.abs(ry - fy) > 0.02) continue
      if (s.recon <= p.recon + 0.02 && s.x.score >= 0.9 * p.x.score && s.y.score >= 0.9 * p.y.score) { p.harm = true; p.score += 14; break }
    }
  }
}
function prSample(img, cx, cy) { // hard-alpha-medoid over inset-core samples, premultiplied OKLab
  const { width: W, data: d } = img, tmp = new Float64Array(3), core = (span) => Math.min(span * 0.375, 6, Math.max(0, (span - 2) / 2))
  return sampleCuts(img, cx, cy, (x0, x1, y0, y1) => {
    const cw = x1 - x0, ch = y1 - y0, area = cw * ch, mx = core(cw), my = core(ch), S = []
    const add = (fx, fy) => {
      const x = clamp(Math.floor(fx), x0, x1 - 1), y = clamp(Math.floor(fy), y0, y1 - 1), o = (y * W + x) * 4, a = d[o + 3] / 255
      linearToOklab(SRGB_TO_LINEAR[d[o]] * a, SRGB_TO_LINEAR[d[o + 1]] * a, SRGB_TO_LINEAR[d[o + 2]] * a, tmp, 0)
      S.push({ rgb: [d[o], d[o + 1], d[o + 2]], a: d[o + 3], lab: [tmp[0], tmp[1], tmp[2]], core: fx >= x0 + mx && fx <= x1 - mx && fy >= y0 + my && fy <= y1 - my })
    }
    if (area <= 32) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) add(x + 0.5, y + 0.5) }
    else { const rows = clamp(Math.round(Math.sqrt((32 * ch) / cw)), 1, 32), cols = Math.max(1, Math.floor(32 / rows)); for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) add(x0 + ((i + 0.5) * cw) / cols, y0 + ((j + 0.5) * ch) / rows) }
    let ta = 0, pk = 0, fl = 255
    for (const s of S) { ta += s.a; pk = Math.max(pk, s.a); fl = Math.min(fl, s.a) }
    const cov = Math.round(ta / S.length)
    if (cw >= 2 && ch >= 2 && pk - fl >= 16 && fl * 2 < pk && pk < 192 && cov < 128) return [0, 0, 0, 0] // bleed-only cell
    if (cov < 128) return [0, 0, 0, 0]
    let pop = S.filter((s) => s.a >= 16), useA = true
    if (!pop.length) { pop = S; useA = false }
    const cs = pop.filter((s) => s.core)
    if (cs.length) pop = cs
    let best = null, bs = Infinity
    for (const c of pop) { let sc = 0; for (const s of pop) sc += ((c.lab[0] - s.lab[0]) ** 2 + (c.lab[1] - s.lab[1]) ** 2 + (c.lab[2] - s.lab[2]) ** 2) * (useA ? s.a / 255 : 1); if (sc < bs) { bs = sc; best = c } }
    return [...best.rgb, 255]
  })
}
/** PixelRefiner reference (phase-aware search on the full canvas + hard-alpha-medoid): its own discovered size. */
export function pixelRefiner(img) {
  const { width: W, height: H } = img, [AX, AY, stride] = prProfiles(img), maxCell = Math.min(W, H)
  const cx = prAxisCands(AX, maxCell), cy = prAxisCands(AY, maxCell)
  if (!cx.length || !cy.length) throw new Error('pixelRefiner reference: no axis candidates')
  const OK = new Float64Array(W * H * 3)
  for (let p = 0; p < W * H; p++) srgbToOklab(img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2], OK, p * 3)
  const crop = (c) => (c.phase > 0 ? c.phase - c.cell : 0), outN = (c, L) => Math.min(600, Math.max(1, Math.ceil((L - crop(c)) / c.cell)))
  let pairs = []
  for (const x of cx) for (const y of cy) pairs.push({ x, y })
  const rescore = (st) => { for (const p of pairs) { p.recon = prRecon(img, OK, crop(p.x), crop(p.y), p.x.cell, p.y.cell, st); p.score = p.recon * 255 + 2 * Math.sqrt(outN(p.x, W) * outN(p.y, H)) - (p.x.score + p.y.score) * 12 } prHarmonics(pairs); pairs.sort((a, b) => a.score - b.score) }
  rescore(Math.max(1, stride * 2))
  pairs = pairs.slice(0, 32)
  rescore(Math.ceil(Math.sqrt((W * H) / 16384)))
  const b = pairs[0], cuts = (c, L) => { const o = crop(c); return strictCuts(Array.from({ length: outN(c, L) + 1 }, (_, i) => o + i * c.cell), L) }
  const image = prSample(img, cuts(b.x, W), cuts(b.y, H))
  return { image, native: [image.width, image.height], info: { cell: [b.x.cell, b.y.cell], phase: [b.x.phase, b.y.phase], score: b.score } }
}
