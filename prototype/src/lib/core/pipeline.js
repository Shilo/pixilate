// Conversion pipeline (contract Steps 1-10): input validation and alpha-0 canonicalization, shared
// analysis (generator report, background estimate, grid), route (grid | raster), explicit background
// stage, Trim, Stretch/Contain/Cover, palette, optional Clean profile, placement, final validator, report.
// Pure and synchronous; the worker calls convert() or convertCandidates().
import { detectGrid, lockGrid } from './grid.js'
import { sampleCells } from './sample.js'
import { buildPalette } from './palette.js'
import { analyzeBackground, cleanup, removeBackground, surfaceAt } from './cleanup.js'
import { areaCells, resampleToTarget, reduceToTarget, upscaleInteger } from './resample.js'
import { detectGenerator } from './detect.js'
import { deconvolveCells, fitKernel } from './fitcells.js'
import { createImage, oklabToSrgb, srgbToOklab } from './color.js'
import { PixilateError, canonicalize, roundHalfEven } from './canonical.js'
import { indexImage, q4 } from './orphans.js'

export { PixilateError, canonicalHash } from './canonical.js'

// Bump `version` when behaviour changes and `constants` whenever a pixel-changing constant does.
export const ENGINE = { id: 'pixilate-prototype-js', version: '0.14.2', constants: 33 }
export const CLEAN_PROFILE = 'ai-sprite-crisp/1' // the named cleanup bundle `cleanup: true` selects
export const MAX_TARGET = 1024
const ALPHA_POLICY = 'Binary(128)' // pixel alpha >= 128 counts as opaque; a cell is opaque by majority coverage

/** Indexed -> RGBA image: exact palette bytes (`rgb`, else OKLab rounded), alpha 255, index -1 transparent. */
export function indexedToImage({ w, h, index, palette, rgb }) {
  const img = createImage(w, h)
  if (!rgb) {
    rgb = new Uint8Array(palette.length)
    for (let i = 0; i < palette.length; i += 3) oklabToSrgb(palette[i], palette[i + 1], palette[i + 2], rgb, i)
  }
  for (let p = 0; p < w * h; p++) {
    const k = index[p]
    if (k < 0) continue
    img.data[p * 4] = rgb[k * 3]; img.data[p * 4 + 1] = rgb[k * 3 + 1]; img.data[p * 4 + 2] = rgb[k * 3 + 2]; img.data[p * 4 + 3] = 255
  }
  return img
}

/** Validate and default the options; every violation is PixilateError('invalid-input'). */
function normalize(opts, requireTarget = true) {
  const o = { targetW: null, targetH: null, trim: false, fit: 'contain', route: 'auto', cleanup: false, background: false, halo: false, colors: 'auto', palette: null, manualPeriod: null, ...opts }
  const bad = (m) => { throw new PixilateError('invalid-input', m) }
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi
  for (const k of ['targetW', 'targetH']) if ((requireTarget || o[k] != null) && !int(o[k], 1, MAX_TARGET)) bad(`${k} must be an integer in 1..${MAX_TARGET} (got ${o[k]})`)
  if (o.trim && typeof o.trim === 'object') { // D50: { basis: 'pixels' (alpha > 0, the default) | 'cells' }
    // D56: the recipe's own form { tau: 0, comparison: '>' } (basis pixels) replays too
    const { basis = 'pixels', tau = 0, comparison = '>', ...rest } = o.trim
    if (!['pixels', 'cells'].includes(basis) || (basis === 'cells' && 'tau' in o.trim) || tau !== 0 || comparison !== '>' || Object.keys(rest).length) bad(`trim must be a boolean or { basis: 'pixels' | 'cells' }`)
    o.trimBasis = basis; o.trim = true
  } else o.trimBasis = 'pixels'
  for (const k of ['trim', 'cleanup', 'halo']) if (typeof o[k] !== 'boolean') bad(`${k} must be a boolean or (trim) { basis }`)
  if (!['stretch', 'contain', 'cover'].includes(o.fit)) bad(`fit must be 'stretch', 'contain' or 'cover' (got ${o.fit})`)
  if (!['auto', 'grid', 'raster'].includes(o.route)) bad(`route must be 'auto', 'grid' or 'raster' (got ${o.route})`)
  const B = o.background
  if (B === 'auto') o.background = { mode: 'auto', connectivity: 4 }
  else if (B && typeof B === 'object') {
    const { mode = 'key', key, tolerance = 0.03, connectivity = 4 } = B
    if (connectivity !== 4 && connectivity !== 8) bad('background.connectivity must be 4 or 8')
    if (mode === 'auto') o.background = { mode, connectivity } // D56: the recipe's own form replays
    else {
      if (mode !== 'key') bad(`background.mode must be 'auto' or 'key' (got ${mode})`)
      if (!Array.isArray(key) || key.length !== 3 || !key.every((v) => int(v, 0, 255))) bad('background.key must be [r, g, b] bytes')
      if (typeof tolerance !== 'number' || !(tolerance >= 0 && tolerance <= 1)) bad('background.tolerance must be a number in 0..1')
      o.background = { mode, key: [...key], tolerance, connectivity }
    }
  } else if (B !== false) bad(`background must be false, 'auto' or { key, tolerance, connectivity }`)
  if (o.colors !== 'auto' && !int(o.colors, 1, 256)) bad(`colors must be 'auto' or an integer in 1..256 (got ${o.colors})`)
  if (o.palette != null) {
    const flat = Array.isArray(o.palette) && Array.isArray(o.palette[0]) ? o.palette.flat() : Array.from(o.palette)
    if (!flat.length || flat.length % 3 || flat.length > 768 || !flat.every((v) => int(v, 0, 255))) bad('palette must be 1..256 [r, g, b] byte entries')
    o.palette = Uint8Array.from(flat)
  }
  if (o.warnings != null && !(Array.isArray(o.warnings) && o.warnings.every((w) => typeof w === 'string'))) bad('warnings must be an array of strings')
  if (o.manualPeriod != null && !(o.manualPeriod.length === 2 && o.manualPeriod.every((v) => Number.isFinite(v) && v > 0))) bad('manualPeriod must be [px, py] positive numbers')
  return o
}

function checkImage(img) {
  const ok = img && Number.isInteger(img.width) && Number.isInteger(img.height) && img.width > 0 && img.height > 0 && img.data?.length === img.width * img.height * 4
  if (!ok) throw new PixilateError('invalid-input', 'image must be { width, height, data: RGBA8 of width x height x 4 }')
}

/** Normalized, input-affecting options (no timings, filenames or passthrough fields). */
function recipeOf(o) {
  return {
    engine: ENGINE, profile: o.cleanup ? CLEAN_PROFILE : null, alphaPolicy: ALPHA_POLICY,
    options: {
      targetW: o.targetW, targetH: o.targetH, trim: !o.trim ? false : o.trimBasis === 'cells' ? { basis: 'cells' } : { tau: 0, comparison: '>' }, fit: o.fit, anchor: 'center',
      route: o.route, cleanup: o.cleanup, background: o.background, halo: o.halo, colors: o.colors,
      palette: o.palette ? Array.from(o.palette) : null, manualPeriod: o.manualPeriod,
    },
  }
}

/**
 * Shared analysis (once per image + options): canonical pixels, generator, background estimate, grid.
 * edges: grid.js edge profiles of (img, mask) per profile; memo: run()'s per-analysis results shared
 * by the candidates (lattices, samples, palettes, raster cells).
 */
function analysis(img0, o, bytes) {
  checkImage(img0)
  const timingsMs = {}
  let t0 = performance.now()
  const lap = (k) => { const t = performance.now(); timingsMs[k] = (timingsMs[k] || 0) + t - t0; t0 = t }
  const img = canonicalize(img0), W = img.width, H = img.height, edges = new Map()
  const gen = detectGenerator(bytes ?? null, img)
  const wm = gen.watermarkMask ?? null
  lap('detect')
  const bg = analyzeBackground(img)
  let mask = wm
  if (bg.checkerboard && bg.mask) {
    mask = Uint8Array.from(bg.mask)
    if (wm) for (let i = 0; i < mask.length; i++) mask[i] |= wm[i]
  }
  lap('background')
  let grid, ramp = null // ramp: the d2 fallback's rampShare, kept for recommend(); null when not computed
  let solveD2 // the second-difference lattice for the smooth-upscale fallback, detected or (manual period) locked
  if (o.manualPeriod) {
    // D65: only the period is imposed; the profile choice (d1 vs d2), phase and cell deconvolution stay the engine's
    const [px, py] = o.manualPeriod, nx = Math.max(1, Math.round(W / px)), ny = Math.max(1, Math.round(H / py))
    grid = lockGrid(img, nx, ny, { mask, preset: gen.preset, edges })
    solveD2 = () => lockGrid(img, nx, ny, { mask, preset: gen.preset, profile: 'd2', edges })
  } else {
    // with Trim the target sizes the trimmed basis, so it is no prior for the full canvas, and the canvas
    // count is not refined over its margins (D52)
    const dopts = { targetW: o.trim ? undefined : o.targetW ?? undefined, targetH: o.trim ? undefined : o.targetH ?? undefined, mask, preset: gen.preset, noRefine: o.trim, edges }
    grid = detectGrid(img, dopts)
    solveD2 = () => detectGrid(img, { ...dopts, profile: 'd2' })
  }
  // Smooth-upscale fallback: no pure grid, but many pixels sit on straight ramps (a bilinear/bicubic
  // upscale of pixel art) -> re-detect on second differences; adopt only a coherent pure grid. A
  // first-difference lattice (weak or grid) is replaced only by a more coherent one, or by one with
  // >= 4x the cells at >= 0.9x its coherence (a smooth upscale's d1 profile often locks onto a multiple).
  // Ramp share (OBSERVED, procedural + local-only samples): natives 0-0.03, gridded AI 0.03-0.06,
  // smooth upscales 0.25-0.89; noisy smooth upscales fall to ~0.06 and pass on rampShareNoisy (D57).
  if (grid.class === 'none' || grid.class === 'weak' || grid.class === 'grid' || (grid.class === 'exact' && grid.confidence < 1)) {
    ramp = rampShare(img)
    const noisy = ramp >= 0.15 ? null : rampShareNoisy(img) // D57: noise-tolerant ramp share, only when the exact one fails
    if (ramp >= 0.15 || noisy >= RAMP_NOISY) {
      const g2 = solveD2(), c2 = minCoherence(g2), lattice = grid.class === 'weak' || grid.class === 'grid'
      const c1 = lattice ? minCoherence(grid) : 0
      const finer = lattice && g2.x.count * g2.y.count >= 4 * grid.x.count * grid.y.count && c2 >= 0.9 * c1
      // a manual period vouches for the lattice, so its d2 lock need not classify as 'grid' (D65)
      if ((g2.class === 'grid' || o.manualPeriod) && c2 >= 0.3 && (!lattice || c2 >= c1 + 0.05 || finer)) {
        g2.evidence.unshift(`smooth-upscale fallback: second-difference lattice ${g2.x.count}x${g2.y.count} (${noisy === null ? `ramp share ${r3(ramp)} >= 0.15` : `noisy ramp share ${r3(noisy)} >= ${RAMP_NOISY}`}, min coherence ${r3(c2)} >= 0.3) replaces ${grid.class}${lattice ? ` ${grid.x.count}x${grid.y.count} (min coherence ${r3(c1)}${finer && c2 < c1 + 0.05 ? ', >= 4x the cells at >= 0.9x its coherence' : ''})` : ''}`)
        grid = g2
      }
    }
  }
  if (o.manualPeriod) {
    grid.evidence.unshift(`manual period ${o.manualPeriod[0]} x ${o.manualPeriod[1]}`)
    if (grid.class === 'none') grid.class = 'weak' // the user vouches for the grid
  }
  lap('grid')
  return { img, gen, wm, bg, mask, grid, ramp, timingsMs, edges, memo: new Map() }
}

const r3 = (v) => Math.round(v * 1000) / 1000
const minCoherence = (g) => Math.min(g.x.coherence, g.y.coherence)

/**
 * Share of opaque pixels whose left and right neighbours differ that lie strictly inside a straight
 * ramp between them (every channel: between L and R, |L + R - 2v| <= 2, and not equal to an
 * end when L != R). High for smooth (bilinear/bicubic) upscales, ~0 for flat-cell art.
 */
export function rampShare(img) {
  const { width: W, height: H, data: d } = img
  let n = 0, r = 0
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const o = (y * W + x) * 4
    if (d[o + 3] < 255 || d[o - 1] < 255 || d[o + 7] < 255) continue
    let diff = false, ramp = true
    for (let c = 0; c < 3; c++) {
      const L = d[o - 4 + c], v = d[o + c], R = d[o + 4 + c]
      if (L !== R) diff = true
      if (!(Math.min(L, R) <= v && v <= Math.max(L, R)) || Math.abs(L + R - 2 * v) > 2 || (L !== R && (v === L || v === R))) ramp = false
    }
    if (!diff) continue
    n++
    if (ramp) r++
  }
  return n ? r / n : 0
}

// D57: noisy smooth upscales (generator texture and noise on a bilinear/bicubic upscale) break rampShare's
// exact-line test (0.66 -> 0.06). A pixel then counts only where its neighbours really change (some channel
// |L - R| > RAMP_CHANGE) and lies on the ramp when every channel has |L + R - 2v| <= RAMP_TOL. OBSERVED
// (synthetic): noisy smooth upscales >= 0.39, gridded AI-like presets <= 0.36, real AI samples <= 0.25.
const RAMP_TOL = 6, RAMP_CHANGE = 12, RAMP_NOISY = 0.45
export function rampShareNoisy(img) {
  const { width: W, height: H, data: d } = img
  let n = 0, r = 0
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const o = (y * W + x) * 4
    if (d[o + 3] < 255 || d[o - 1] < 255 || d[o + 7] < 255) continue
    let big = false, ramp = true
    for (let c = 0; c < 3; c++) {
      const L = d[o - 4 + c], v = d[o + c], R = d[o + 4 + c]
      if (Math.abs(L - R) > RAMP_CHANGE) big = true
      if (Math.abs(L + R - 2 * v) > RAMP_TOL) ramp = false
    }
    if (!big) continue
    n++
    if (ramp) r++
  }
  return n ? r / n : 0
}

/** Decode passthrough (decodeImage's format, decode, strict, orientation); not part of the recipe. */
const inputReport = (width, height, o) => ({ width, height, format: o.format ?? null, decode: o.decode ?? 'js', strict: o.strict ?? null, orientation: o.orientation ?? null })

// D56: null = no size supported (an underdetermined or empty exact grid); undefined = a lockGrid lattice
const suggestedSizeOf = (grid) => grid.suggestedSize !== undefined ? grid.suggestedSize : (grid.class !== 'none' ? [grid.x.count, grid.y.count] : null)
const generatorReport = (gen) => ({ family: gen.family, model: gen.model ?? null, confidence: gen.confidence, evidence: gen.evidence })

/**
 * analyze(img, opts?, bytes?) -> { grid, generator, suggestedSize }: the shared analysis alone, e.g.
 * to offer the detected native size before the user fixes W x H (targets optional here).
 */
export function analyze(img, opts = {}, bytes = null) {
  const A = analysis(img, normalize(opts, false), bytes)
  const { cuts, ...grid } = gridReport(A.grid, A.grid, [0, 0])
  return { grid, generator: generatorReport(A.gen), suggestedSize: suggestedSizeOf(A.grid) }
}

/** Per-pixel cell index (cell holding the pixel centre) along one axis. */
function cellIndex(axis, len) {
  const out = new Int32Array(len)
  for (let x = 0, i = 0; x < len; x++) {
    while (i < axis.count - 1 && axis.cuts[i + 1] <= x + 0.5) i++
    out[x] = i
  }
  return out
}

/**
 * Fit a bw x bh basis into Tx x Ty (anchor center; round-half-to-even; each contained axis clamped to
 * 1..T). Cover crops the basis to the target aspect (odd remainder right/bottom) and maps the crop
 * onto the whole box. Returns { fw, fh, crop: [x0, y0, x1, y1] in basis units | null, warning }.
 */
function fitBox(bw, bh, Tx, Ty, mode) {
  const clamp = (v, hi) => Math.max(1, Math.min(hi, v))
  const contain = Tx * bh <= Ty * bw ? [Tx, clamp(roundHalfEven(bh * Tx, bw), Ty)] : [clamp(roundHalfEven(bw * Ty, bh), Tx), Ty]
  if (mode === 'contain') return { fw: contain[0], fh: contain[1], crop: null, warning: null }
  if (mode === 'stretch') return { fw: Tx, fh: Ty, crop: null, warning: contain[0] !== Tx || contain[1] !== Ty ? `aspect distortion: stretched ${bw}x${bh} to ${Tx}x${Ty}` : null }
  const [cw, ch] = Tx * bh >= Ty * bw ? [bw, clamp(roundHalfEven(bw * Ty, Tx), bh)] : [clamp(roundHalfEven(bh * Tx, Ty), bw), bh]
  if (cw === bw && ch === bh) return { fw: Tx, fh: Ty, crop: null, warning: null }
  const x0 = (bw - cw) >> 1, y0 = (bh - ch) >> 1
  return { fw: Tx, fh: Ty, crop: [x0, y0, x0 + cw, y0 + ch], warning: `cover crop: kept ${cw}x${ch} of ${bw}x${bh}` }
}

/** Crop image, grid, cells and masks to a cell box (pixel crop rounded outward to the box's cuts). */
function cropTo(img, grid, cells, wm, gmask, box) {
  const W = img.width
  const px0 = Math.floor(grid.x.cuts[box.x0]), px1 = Math.ceil(grid.x.cuts[box.x1])
  const py0 = Math.floor(grid.y.cuts[box.y0]), py1 = Math.ceil(grid.y.cuts[box.y1])
  const cw = px1 - px0, ch = py1 - py0, src = cropImage(img, px0, py0, px1, py1)
  const cropMask = (m) => {
    if (!m) return null
    const o = new Uint8Array(cw * ch)
    for (let y = 0; y < ch; y++) o.set(m.subarray((y + py0) * W + px0, (y + py0) * W + px1), y * cw)
    return o
  }
  const sub = (a, i0, i1, off, len) => {
    const cuts = Float64Array.from(a.cuts.subarray(i0, i1 + 1), (c) => c - off)
    cuts[0] = 0; cuts[cuts.length - 1] = len
    return { ...a, cuts, count: i1 - i0 }
  }
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0, n = bw * bh
  const c = { w: bw, h: bh, lab: new Float32Array(n * 3), alpha: new Uint8Array(n), dominance: new Float32Array(n) }
  for (const k of ['masked', 'pure']) if (cells[k]) c[k] = new Uint8Array(n)
  if (cells.rgb) c.rgb = new Int32Array(n)
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const s = (y + box.y0) * cells.w + x + box.x0, d = y * bw + x
    c.lab.set(cells.lab.subarray(s * 3, s * 3 + 3), d * 3)
    c.alpha[d] = cells.alpha[s]; c.dominance[d] = cells.dominance[s]
    for (const k of ['masked', 'pure', 'rgb']) if (c[k]) c[k][d] = cells[k][s]
  }
  return {
    src, cells: c, wm: cropMask(wm), gmask: cropMask(gmask), off: [px0, py0],
    g: { ...grid, x: sub(grid.x, box.x0, box.x1, px0, cw), y: sub(grid.y, box.y0, box.y1, py0, ch) },
  }
}

function cropImage(img, x0, y0, x1, y1) {
  const W = img.width, cw = x1 - x0, out = createImage(cw, y1 - y0)
  for (let y = y0; y < y1; y++) out.data.set(img.data.subarray((y * W + x0) * 4, (y * W + x1) * 4), (y - y0) * cw * 4)
  return out
}

/** Place an Indexed into a transparent Tw x Th canvas at (ox, oy). */
function place(ix, Tw, Th, ox, oy) {
  const index = new Int16Array(Tw * Th).fill(-1)
  for (let y = 0; y < ix.h; y++) index.set(ix.index.subarray(y * ix.w, (y + 1) * ix.w), (y + oy) * Tw + ox)
  return { w: Tw, h: Th, index, palette: ix.palette, rgb: ix.rgb }
}

/** Grid report: class/confidence/candidates of the detected grid; native/period/cuts of the grid used. */
function gridReport(grid, g, off) {
  const r2 = (v) => Math.round(v * 100) / 100
  return {
    class: grid.class, confidence: grid.confidence, native: [g.x.count, g.y.count], nativeFull: [grid.x.count, grid.y.count],
    period: [r2(g.x.period), r2(g.y.period)], phase: [r2(g.x.phase), r2(g.y.phase)], elastic: [g.x.elastic, g.y.elastic], countDP: [!!g.x.countDP, !!g.y.countDP],
    cuts: { x: Array.from(g.x.cuts, (c) => r2(c + off[0])), y: Array.from(g.y.cuts, (c) => r2(c + off[1])) }, // original source px
    evidence: g.evidence === grid.evidence ? grid.evidence : [...grid.evidence, ...g.evidence],
    candidates: grid.candidates ?? null, ambiguous: grid.ambiguous ?? null, alternatives: grid.alternatives ?? null, suggestedSize: suggestedSizeOf(grid),
  }
}

/** Append the smooth-upscale kernel fit (fitcells.js) to a grid report's evidence. */
function withNotes(rep, notes) {
  if (notes.length) rep.evidence = [...rep.evidence, ...notes]
  return rep
}

function kernelEvidence(rep, k) {
  if (!k) return rep
  const r2 = (v) => Math.round(v * 100) / 100
  rep.evidence = [...rep.evidence, k.rms == null ? 'cell deconvolution: off (fewer than 8 fit cells)'
    : `cell deconvolution: ${k.keys != null ? `Keys cubic A ${k.keys}` : `kernel a ${k.a ?? '-'} b ${k.b ?? '-'}`} (residual RMS ${r2(k.rms)}${k.a == null ? ' > 12: off' : ''})`]
  return rep
}

/** Mandatory final validator: binary alpha, every visible RGB a palette entry, the color cap held. */
function validate(image, out, allowed) {
  const keys = new Set(), d = image.data, rgb = out.rgb
  for (let k = 0; k < rgb.length; k += 3) keys.add((rgb[k] << 16) | (rgb[k + 1] << 8) | rgb[k + 2])
  const used = new Set()
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] === 0) continue
    const key = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]
    if (d[p + 3] !== 255 || !keys.has(key)) throw new PixilateError('internal-invariant', `output pixel ${p / 4} violates the palette/alpha contract`)
    used.add(key)
  }
  if (allowed != null && used.size > allowed) throw new PixilateError('internal-invariant', `${used.size} visible colors exceed the requested ${allowed}`)
  return used.size
}

const LOCK_WINDOW = 0.05 // try a lock to T when |N - T| <= this x T

/** Per-axis Step 4 row for native count N and target T. */
function rowOf(N, T) {
  if (Math.abs(N - T) <= Math.max(1, 0.02 * T)) return { kind: 'lock', k: 1 }
  const r = N / T, k = Math.round(r), ki = Math.round(T / N)
  if (k >= 2 && Math.abs(r - k) <= 0.02 * k) return { kind: 'reduce', k }
  if (ki >= 2 && Math.abs(T / N - ki) <= 0.02 * ki && T % ki === 0) return { kind: 'up', k: ki }
  return { kind: 'nonint', k: 0 }
}

/** One route on a shared analysis. */
function run(A, o) {
  const { img, gen, wm, mask } = A, W = img.width, H = img.height, Tx = o.targetW, Ty = o.targetH, d = img.data
  const warnings = [...(o.warnings ?? [])], timingsMs = { ...A.timingsMs } // decode warnings first
  const gridNotes = [] // extra grid evidence lines from path selection
  let t0 = performance.now()
  const lap = (k) => { const t = performance.now(); timingsMs[k] = (timingsMs[k] || 0) + t - t0; t0 = t }
  const grid = A.grid // detectGrid already prefers the exact factorization matching the target (instructed lattice)
  const exact = grid.class === 'exact', hasGrid = grid.class !== 'none'
  let route = o.route === 'auto' ? (hasGrid ? 'grid' : 'raster') : o.route
  if (!hasGrid) warnings.push('no reliable source grid detected')
  if (route === 'grid' && !hasGrid) { warnings.push('grid route refused: used raster'); route = 'raster' }
  if (route === 'grid' && grid.class === 'weak') warnings.push('weak grid evidence')
  if (route === 'grid' && grid.ambiguous) warnings.push('ambiguous exact grid: several valid factorizations')

  // explicit background stage (on cells); halo repair is its own flag
  const B = o.background
  let bgColors = !B ? null : A.bg.bg
  if (B?.mode === 'key') { bgColors = new Float32Array(3); srgbToOklab(...B.key, bgColors, 0) }
  const estimate = bgColors ? Array.from({ length: bgColors.length / 3 }, (_, i) => { const t = new Uint8Array(3); oklabToSrgb(bgColors[i * 3], bgColors[i * 3 + 1], bgColors[i * 3 + 2], t, 0); return [...t] }) : null
  const bgReport = {
    mode: B ? B.mode : false, estimate, applied: false, reason: !B ? 'off' : bgColors ? null : A.bg.reason ?? 'no background estimate', removed: 0, specks: 0,
    connectivity: B ? B.connectivity : null, metric: B ? 'toe-OKLab dE' : null,
    tolerance: !B ? null : B.mode === 'key' ? B.tolerance : bgColors?.length === 6 ? 0.035 : 0.03, comparison: !B ? null : B.mode === 'key' ? '<=' : '<',
    halo: { enabled: o.halo, changed: 0 },
  }
  let bgMode = B && bgColors ? (B.mode === 'key' ? 'key' : 'auto') : null
  // D49: a gradient surface compares each cell with the surface at its source centre; ux(i) / vy(j) give the
  // normalized source centre of cell column i / row j
  const surface = B && B.mode !== 'key' ? A.bg.surface : null
  if (surface) bgReport.model = 'surface'
  const fieldOf = (cells, [ux, vy]) => {
    if (!surface) return null
    const f = new Float32Array(cells.w * cells.h * 3)
    for (let j = 0; j < cells.h; j++) for (let i = 0; i < cells.w; i++) surfaceAt(surface, ux(i), vy(j), f, (j * cells.w + i) * 3)
    return f
  }
  const gridUV = (g) => [(i) => ((g.x.cuts[i] + g.x.cuts[i + 1]) / 2 + off[0]) / W, (j) => ((g.y.cuts[j] + g.y.cuts[j + 1]) / 2 + off[1]) / H]
  const boxUV = (bx, cw, ch) => [(i) => (bx[0] + ((i + 0.5) * (bx[2] - bx[0])) / cw) / W, (j) => (bx[1] + ((j + 0.5) * (bx[3] - bx[1])) / ch) / H]
  // candidates share one analysis: a key names the same inputs within it (o differs only in route and cleanup)
  const memo = (key, f) => { let v = A.memo.get(key); if (v === undefined) A.memo.set(key, (v = f())); return v }
  const dropBg = (cells, uv) => !bgMode ? cells : removeBackground(cells, bgColors, { mode: bgMode, tolerance: B.tolerance, connectivity: B.connectivity, halo: o.halo, field: fieldOf(cells, uv) })
  const noteBg = (c) => { // report the background stage of cells that went through dropBg
    if (!c.background) return c
    Object.assign(bgReport, { applied: c.background.applied, reason: c.background.reason, removed: c.background.removed, specks: c.background.specks })
    bgReport.halo.changed = c.background.haloChanged
    return c
  }
  const sample = (src, g, m, key) => {
    const c = noteBg(memo(key, () => {
      let c = sampleCells(src, g, { mask: m })
      if (grid.profile === 'd2') { // smooth upscale: deconvolve the cell colours with the image's own kernel
        // the first sample is always the native one (img, grid); later re-samples reuse its kernel
        A.kernel ??= fitKernel(src, g, c)
        c = deconvolveCells(src, g, c, A.kernel)
      }
      return dropBg(c, gridUV(g))
    }))
    lap('sample')
    return c
  }
  const changed = {}
  let reduce = null // D62: core reduction steps (reduceToTarget `steps`), never cleanup counts
  const add = (ch, prefix = '') => { for (const k in ch) { const key = prefix ? prefix + k[0].toUpperCase() + k.slice(1) : k; changed[key] = (changed[key] || 0) + ch[k] } }
  const clean = (cells) => {
    // D48: deconvolved smooth-upscale cells pass the kernel residual (the palette may keep close colours apart)
    const kernelRms = grid.profile === 'd2' && route === 'grid' && A.kernel?.a != null ? A.kernel.rms : null
    let ix = memo(cells, () => buildPalette(cells, { colors: o.colors, palette: o.palette, exact, kernelRms })) // same cells, same options
    for (const w of ix.warnings) if (!warnings.includes(w)) warnings.push(w)
    lap('palette')
    if (o.cleanup && !exact) { ix = cleanup(ix, cells); add(ix.changed); lap('cleanup') }
    return ix
  }
  // D50: basis 'cells' (explicit option) = opaque cells on the grid route, alpha > 127 on the raster route
  const cellBasis = o.trim && o.trimBasis === 'cells'
  const trim = { enabled: o.trim, tau: cellBasis && route !== 'grid' ? 127 : 0, comparison: '>', box: null }
  if (cellBasis) trim.basis = 'cells'
  // smallest half-open box of alpha > tau source pixels; `pixels` = the default basis's visibility
  const visibleBox = (visible, pixels = visible) => {
    const scan = (tau, vis) => {
      let x0 = W, y0 = H, x1 = -1, y1 = -1
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > tau && vis(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1]
    }
    trim.box = scan(trim.tau, visible)
    if (!trim.box && cellBasis) { // D55: a faint subject leaves no opaque cell; fall back to the default alpha > 0 basis
      trim.box = scan(0, pixels)
      if (trim.box) {
        const none = route === 'grid' ? 'opaque cell (Binary(128) majority)' : `pixel with alpha > ${trim.tau}`
        trim.fallback = { basis: 'pixels', tau: 0, reason: `no ${none}` }
        trim.tau = 0
        warnings.push(`trim basis 'cells' found no ${none}: used the default alpha > 0 basis`)
      }
    }
    if (!trim.box) throw new PixilateError('empty-visible-region', `Trim found no ${cellBasis ? 'opaque cell or ' : ''}pixel with alpha > ${cellBasis ? 0 : trim.tau}`)
    return trim.box
  }

  let path, out, g = grid, off = [0, 0], geo, basis, fw, fh
  if (route === 'grid') {
    const N0 = grid.x.count, M0 = grid.y.count
    // native cells, sampled on first use (the lock path re-samples on its own lattice), always before any re-sample
    let nat = null
    const native = () => (nat ??= sample(img, grid, wm, 'cells native'))
    if (grid.profile === 'd2') native() // the deconvolution kernel is fitted on the native sample
    let box = [0, 0, N0, M0] // cell box
    if (o.trim) { // pixels in background-removed cells are not visible
      const nc = native(), col = cellIndex(grid.x, W), row = cellIndex(grid.y, H), gone = nc.removed
      // basis 'cells': only cells left opaque by sampling (Binary(128) majority) and background removal
      const pixels = gone ? (x, y) => !gone[row[y] * N0 + col[x]] : () => true
      const [x0, y0, x1, y1] = visibleBox(cellBasis ? (x, y) => nc.alpha[row[y] * N0 + col[x]] > 0 : pixels, pixels)
      box = [col[x0], row[y0], col[x1 - 1] + 1, row[y1 - 1] + 1]
    }
    basis = [box[2] - box[0], box[3] - box[1]]
    geo = fitBox(basis[0], basis[1], Tx, Ty, o.fit)
    if (geo.crop) box = [box[0] + geo.crop[0], box[1] + geo.crop[1], box[0] + geo.crop[2], box[1] + geo.crop[3]]
    let src = img, cells = null, m = wm, gmask = mask // cells: the crop's or a relock's; else native()
    if (box[0] || box[1] || box[2] < N0 || box[3] < M0) {
      ({ src, g, cells, wm: m, gmask, off } = cropTo(img, grid, native(), wm, mask, { x0: box[0], y0: box[1], x1: box[2], y1: box[3] }))
      // the full canvas decided the background; a crop's border is mostly sprite, so re-samples
      // of it (lock/relock) must not re-run the floating-subject guard
      if (bgMode === 'auto' && bgReport.applied) bgMode = true
    }
    fw = geo.fw; fh = geo.fh
    const N = g.x.count, M = g.y.count, base = () => cells ?? native()
    // nx x ny lattice on src (keyed by the cell box src was cropped to) and its sample
    const at = (nx, ny) => `${box} ${nx}x${ny}`
    const lock = (nx, ny) => {
      const L = memo('lock ' + at(nx, ny), () => lockGrid(src, nx, ny, { mask: gmask, preset: gen.preset, profile: grid.profile, edges: src === img ? A.edges : null }))
      lap('grid')
      return L
    }
    const resample = (nx, ny) => sample(src, lock(nx, ny), m, 'cells ' + at(nx, ny))
    if (exact && N === fw && M === fh) {
      path = 'exact'
      out = clean(base())
    } else {
      const rx = rowOf(N, fw), ry = rowOf(M, fh)
      let kind = rx.kind === ry.kind ? rx.kind : 'nonint', locked = null
      // exact cells are the art itself: a fractional period (lock, or upscale relock) would drop or double rows
      if (exact && (kind === 'lock' || (kind === 'up' && (fw / rx.k !== N || fh / ry.k !== M)))) kind = 'nonint'
      // Also try T when the free count is about half of it (octave error: 2-px art read at 2x cell size).
      else if (!exact && kind !== 'lock' && ((Math.abs(N - fw) <= LOCK_WINDOW * fw && Math.abs(M - fh) <= LOCK_WINDOW * fh) ||
        (Math.abs(2 * N - fw) <= LOCK_WINDOW * fw && Math.abs(2 * M - fh) <= LOCK_WINDOW * fh))) {
        // Judge the lock on edge capture of its elastic cuts vs the free count's elastic lattice on the
        // same image: a drifting source makes a regular T lattice look bad even when T is right.
        const L = lock(fw, fh), F = lock(N, M)
        const ratio = Math.min(L.x.coherence / Math.max(1e-12, F.x.coherence), L.y.coherence / Math.max(1e-12, F.y.coherence))
        if (ratio >= 0.97) {
          if (Math.abs(N - fw) > LOCK_WINDOW * fw || Math.abs(M - fh) > LOCK_WINDOW * fh) gridNotes.push(`octave lock: ${N}x${M} -> ${fw}x${fh} (ratio ${Math.round(ratio * 100) / 100})`)
          kind = 'lock'; locked = L
        }
      }
      const shrink = (nat) => { // native -> target (Step 8), then the Clean profile's cleanup on the result
        const r = reduceToTarget(nat, fw, fh, { clean: o.cleanup })
        add(r.changed, 'reduce')
        reduce = { changed: r.steps }
        lap('reduce')
        if (!o.cleanup) return r
        const c = cleanup(r, r)
        add(c.changed)
        lap('cleanup')
        return c
      }
      if (kind === 'lock') {
        path = 'grid-locked'
        g = locked ?? lock(fw, fh)
        out = clean(resample(fw, fh))
      } else if (kind === 'reduce') {
        path = 'grid-reduce-k'
        warnings.push('detail reduced')
        out = shrink(clean(base()))
      } else if (kind === 'up') {
        path = 'grid-upscale-k'
        warnings.push('target exceeds native resolution')
        if (g.x.count !== fw / rx.k || g.y.count !== fh / ry.k) {
          g = lock(fw / rx.k, fh / ry.k)
          cells = resample(fw / rx.k, fh / ry.k)
        }
        out = upscaleInteger(clean(base()), rx.k, ry.k)
        lap('reduce')
      } else if (o.trim && o.fit === 'contain' && fw >= N && fh >= M) {
        // a trimmed sprite with T > N: never stretch by a non-integer factor (mixels); integer-upscale and pad
        const k = Math.max(1, Math.floor(Math.min(fw / N, fh / M)))
        path = 'grid-upscale-k'
        warnings.push(`target exceeds native resolution: integer upscale x${k}, padded to ${Tx}x${Ty}`)
        out = upscaleInteger(clean(base()), k, k)
        fw = N * k; fh = M * k
        lap('reduce')
      } else {
        path = 'grid-then-resample'
        if (fw < N || fh < M) warnings.push('detail reduced')
        warnings.push('non-integer ratio, approximate')
        if (fw > N || fh > M) warnings.push('target exceeds native resolution')
        out = shrink(clean(base()))
      }
    }
  } else {
    path = 'illustration'
    warnings.push('approximate')
    let box = [0, 0, W, H] // pixel box
    if (o.trim) {
      let visible = () => true
      if (bgMode) { // background before Trim: removal on the 4 x target working lattice of the full canvas
        const sw = Math.min(W, 4 * Tx), sh = Math.min(H, 4 * Ty)
        const ac = areaCells(img, sw, sh)
        const c = removeBackground(ac, bgColors, { mode: bgMode, tolerance: B.tolerance, connectivity: B.connectivity, field: fieldOf(ac, boxUV([0, 0, W, H], sw, sh)) })
        if (c.background.applied) {
          const gone = c.removed
          visible = (x, y) => !gone[Math.floor(((2 * y + 1) * sh) / (2 * H)) * sw + Math.floor(((2 * x + 1) * sw) / (2 * W))]
        }
      }
      box = visibleBox(visible)
      // the full canvas decided the background; the crop's border is mostly subject
      if (bgMode === 'auto' && (box[0] || box[1] || box[2] < W || box[3] < H)) bgMode = true
    }
    basis = [box[2] - box[0], box[3] - box[1]]
    geo = fitBox(basis[0], basis[1], Tx, Ty, o.fit)
    if (geo.crop) box = [box[0] + geo.crop[0], box[1] + geo.crop[1], box[0] + geo.crop[2], box[1] + geo.crop[3]]
    const src = box[0] || box[1] || box[2] < W || box[3] < H ? cropImage(img, ...box) : img
    fw = geo.fw; fh = geo.fh
    const cells = noteBg(memo(`raster ${box} ${fw}x${fh}`, () => dropBg(resampleToTarget(src, fw, fh), boxUV(box, fw, fh))))
    lap('sample')
    out = clean(cells)
  }
  if (geo.warning) warnings.push(geo.warning)

  // 9: place into the target canvas; 10: render, validate, report.
  const ox = (Tx - fw) >> 1, oy = (Ty - fh) >> 1
  if (fw !== Tx || fh !== Ty) out = place(out, Tx, Ty, ox, oy)
  const image = indexedToImage(out)
  const allowed = o.palette ? o.palette.length / 3 : o.colors === 'auto' ? null : o.colors
  const colors = validate(image, out, allowed)
  lap('render')
  const report = {
    input: inputReport(W, H, o),
    generator: generatorReport(gen),
    grid: withNotes(kernelEvidence(gridReport(grid, g, off), route === 'grid' && A.kernel), gridNotes),
    route, path, trim,
    fit: { mode: o.fit, anchor: 'center', basis, basisUnit: route === 'grid' ? 'cells' : 'px', crop: geo.crop, resized: [fw, fh], offset: [ox, oy] },
    background: bgReport,
    cleanup: { profile: o.cleanup ? CLEAN_PROFILE : null, changed },
    reduce,
    alphaPolicy: ALPHA_POLICY,
    output: { width: Tx, height: Ty, colors, colorsAllowed: allowed, transparent: out.index.some((k) => k < 0) },
    recipe: recipeOf(o),
    warnings, timingsMs,
  }
  return { image, indexed: out, report }
}

/** PRO-NOOP: target equals the source and no stage is requested. */
const isNoop = (img, o, perCandidate = false) => o.targetW === img.width && o.targetH === img.height && !o.trim && !o.background &&
  o.colors === 'auto' && !o.palette && !o.manualPeriod && (perCandidate || (!o.cleanup && o.route === 'auto'))

function identity(img, o) {
  const c = canonicalize(img), image = { width: c.width, height: c.height, data: new Uint8ClampedArray(c.data) }
  let transparent = false
  for (let p = 3; p < image.data.length && !transparent; p += 4) transparent = image.data[p] === 0
  return {
    image, indexed: null,
    report: {
      input: inputReport(img.width, img.height, o),
      generator: null, grid: null, route: null, path: 'noop', trim: { enabled: false, tau: 0, comparison: '>', box: null },
      fit: { mode: o.fit, anchor: 'center', basis: [img.width, img.height], basisUnit: 'px', crop: null, resized: [img.width, img.height], offset: [0, 0] },
      background: { mode: false, estimate: null, applied: false, reason: 'off', removed: 0, specks: 0, connectivity: null, metric: null, tolerance: null, comparison: null, halo: { enabled: false, changed: 0 } },
      cleanup: { profile: null, changed: {} }, alphaPolicy: null,
      output: { width: img.width, height: img.height, colors: null, colorsAllowed: null, transparent },
      recipe: recipeOf(o), warnings: [...(o.warnings ?? [])], timingsMs: {},
    },
  }
}

/**
 * convert(img, opts, bytes?) -> { image, indexed, report }.
 * opts: targetW, targetH (required integers 1..1024), trim = false, fit = 'contain' | 'stretch' |
 *       'cover' (anchor center), route = 'auto' | 'grid' | 'raster', cleanup = false (true = the
 *       Clean profile `ai-sprite-crisp/1`), background = false | 'auto' | { key: [r,g,b], tolerance
 *       = 0.03, connectivity = 4 | 8 }, halo = false, colors = 'auto' | 1..256, palette? ([r,g,b]
 *       entries), manualPeriod? [px, py], format?/decode?/strict?/orientation?/warnings? (decodeImage
 *       passthrough: report.input, decode warnings lead report.warnings).
 * Throws PixilateError: 'invalid-input', 'empty-visible-region', 'algorithm-budget-exceeded',
 * 'internal-invariant'. `indexed` is null on the identity (noop) path.
 */
export function convert(img, opts = {}, bytes = null) {
  checkImage(img)
  const o = normalize(opts)
  if (isNoop(img, o)) return identity(img, o)
  return run(analysis(img, o, bytes), o)
}

const sameImage = (a, b) => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i])

// ---- Recommendation: evidence-based rule table on the analysis and the candidate outputs ----
// Constants measured on the procedural bench and extra procedural sets (OBSERVED).
const REC_RAMP = 0.15 // smooth-upscale evidence: rampShare threshold (same as the d2 fallback)
const REC_OFF = 2 // lattice vs fitted target cells >= 2x off on an axis: the lattice disagrees with the target
const REC_REDUCE = 1.25 // min(basis / resized) >= this is a reduction; Clean is never recommended there
const REC_AGREE = 97 // percent of union-opaque output pixels on which grid and clean agree (light touch)
const REC_SAME2 = 0.05 * 0.05 // squared raw OKLab distance for "same colour" in the agreement count
const REC_COV = 0.03 // Clean may lower outline coverage by at most this
// D55: a grid output whose noise orphans (orphans.js Q4 NOISE, as scripts/score.mjs) are >= this share of its
// opaque pixels is AI mixel noise; Clean may then change more, down to REC_AGREE_NOISY % agreement
const REC_NOISE = 0.04
const REC_NOISE_MIN = 12 // D63: and at least this many noise-orphan pixels (on tiny sprites one pixel decides)
const REC_AGREE_NOISY = 90

/** Union-opaque pixels (alpha >= 128 in either) n, and those opaque in both with OKLab distance < 0.05. */
function outputAgreement(A, B) {
  const a = new Float64Array(3), b = new Float64Array(3), d = A.data, e = B.data
  let n = 0, same = 0
  for (let p = 0; p < d.length; p += 4) {
    const oa = d[p + 3] >= 128, ob = e[p + 3] >= 128
    if (!oa && !ob) continue
    n++
    if (!oa || !ob) continue
    srgbToOklab(d[p], d[p + 1], d[p + 2], a, 0); srgbToOklab(e[p], e[p + 1], e[p + 2], b, 0)
    const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]
    if (dl * dl + da * da + db * db < REC_SAME2) same++
  }
  return { n, same }
}

/**
 * Outline coverage (quality metrics Q11, simplified): boundary = opaque pixels with a transparent or
 * out-of-image N4 neighbour; one counts 1 when its OKLab L <= the mean L of its opaque non-boundary N4
 * neighbours - 0.05, and 0.5 when it has none. null when the output is fully opaque or fully transparent.
 */
function outlineCoverage(img) {
  const { width: w, height: h, data: d } = img
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= 128
  let opaque = 0
  for (let p = 3; p < d.length; p += 4) if (d[p] >= 128) opaque++
  if (opaque === w * h || opaque === 0) return null
  const B = new Uint8Array(w * h), L = new Float64Array(w * h), t = new Float64Array(3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!op(x, y)) continue
    const q = (y * w + x) * 4
    srgbToOklab(d[q], d[q + 1], d[q + 2], t, 0); L[y * w + x] = t[0]
    if (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1)) B[y * w + x] = 1
  }
  let nb = 0, ol = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!B[y * w + x]) continue
    let s = 0, n = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (op(x + dx, y + dy) && !B[(y + dy) * w + x + dx]) { s += L[(y + dy) * w + x + dx]; n++ }
    nb++
    if (n && L[y * w + x] <= s / n - 0.05) ol++
    else if (!n) ol += 0.5
  }
  return nb ? ol / nb : null
}

/** Rule table -> { id, rule, evidence }; the first matching rule wins. */
function recommend(A, cls, candidates, alias, original, manual = false) {
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100
  if (original) return { id: 'original', rule: 'identity', evidence: 'recommended original: the target equals the source and no stage is requested' }
  // D66: a user-set grid (manualPeriod) on a none/weak lattice skips the no-grid and off-target smooth rules; the
  // grid/Clean choice below still runs, and convertCandidates reports it as rule 'manual-grid'
  const vouched = manual && (cls === 'none' || cls === 'weak')
  if (!vouched && (cls === 'none' || cls === 'weak')) return { id: 'smooth', rule: 'no-grid', evidence: `recommended smooth: grid class ${cls}` }
  if (cls === 'exact' && A.grid.confidence === 1) return { id: 'grid', rule: 'exact', evidence: 'recommended grid: exact grid' }
  const gc = candidates.find((c) => c.id === alias.grid)
  if (!gc) return { id: alias.clean ? 'clean' : 'smooth', rule: 'grid-failed', evidence: 'recommended fallback: the grid candidate failed' }
  const [bw, bh] = gc.report.fit.basis, [fw, fh] = gc.report.fit.resized
  const off = Math.max(bw / fw, fw / bw, bh / fh, fh / bh), red = Math.min(bw / fw, bh / fh)
  const ramp = A.ramp ?? rampShare(A.img), d2 = A.grid.profile === 'd2'
  if (!vouched && ramp >= REC_RAMP && !d2 && off >= REC_OFF)
    return { id: 'smooth', rule: 'smooth-upscale-off-target', evidence: `recommended smooth: smooth-upscale evidence (ramp share ${r2(ramp)} >= ${REC_RAMP}) and the ${bw}x${bh} lattice is ${r1(off)}x off the ${fw}x${fh} target` }
  const cc = alias.clean !== alias.grid ? candidates.find((c) => c.id === alias.clean) : null
  if (cc && !d2 && red < REC_REDUCE) {
    const { n, same } = outputAgreement(gc.image, cc.image), agreeOk = same * 100 >= REC_AGREE * n
    const cg = outlineCoverage(gc.image), ccv = outlineCoverage(cc.image), covOk = cg === null || ccv === null || ccv >= cg - REC_COV
    const pct = n ? (100 * same) / n : 100, outline = cg === null ? 'n/a' : `kept ${r2(ccv)} vs ${r2(cg)}`
    if (agreeOk && covOk)
      return { id: 'clean', rule: 'light-touch-clean', evidence: `recommended clean: light touch (agreement ${r1(pct)} % >= ${REC_AGREE} %, outline ${outline})` }
    let noise = null, noisePx = 0 // the grid output's noise-orphan share and count, only where it can decide
    if (covOk && same * 100 >= REC_AGREE_NOISY * n) { const ix = indexImage(gc.image); noisePx = ix.opaque ? q4(ix).noise : 0; noise = ix.opaque ? noisePx / ix.opaque : 0 }
    if (noise >= REC_NOISE && noisePx >= REC_NOISE_MIN) // null (not measured) never passes
      return { id: 'clean', rule: 'noisy-grid-clean', evidence: `recommended clean: noisy grid (noise orphans ${r1(100 * noise)} % of opaque >= ${100 * REC_NOISE} %, ${noisePx} px >= ${REC_NOISE_MIN}, agreement ${r1(pct)} % >= ${REC_AGREE_NOISY} %, outline ${outline})` }
    const why = noise === null ? '' : noise >= REC_NOISE ? `; noise orphans ${r1(100 * noise)} % but ${noisePx} px < ${REC_NOISE_MIN}` : `; noise orphans ${r1(100 * noise)} % < ${100 * REC_NOISE} %`
    return { id: 'grid', rule: 'grid', evidence: `recommended grid: Clean declined (${!agreeOk ? `agreement ${r1(pct)} % < ${REC_AGREE} %` : `outline coverage ${r2(ccv)} < ${r2(cg)} - ${REC_COV}`}${why})` }
  }
  return { id: 'grid', rule: 'grid', evidence: `recommended grid: ${d2 ? 'smooth-upscale lattice (d2)' : red >= REC_REDUCE ? `reduction ${r2(red)}x >= ${REC_REDUCE}` : 'Clean identical to grid'}` }
}

/**
 * convertCandidates(img, opts, bytes?) -> { candidates: [{ id, image, indexed, report }], recommended,
 * recommendation: { id, rule, evidence }, alias: { [specId]: surviving id }, analysis: { grid, generator, suggestedSize },
 * failed: [{ id, code, message }] }. recommendation.id is the surviving id (= recommended).
 * Shared analysis once; opts as convert (route and cleanup are set per candidate):
 * original (identity, only when the noop rule holds), grid (grid route, cleanup off; grid found),
 * clean (Clean profile on the grid route, else the raster route), smooth (raster route, cleanup off).
 * Identical outputs are deduped (the earlier id survives). Recommendation (recommend(), first match):
 * original when present; class none/weak -> smooth, unless the user set the grid (manualPeriod: rule manual-grid,
 * the grid/Clean choice below without the off-target rule; D66); exact at confidence 1 -> grid; grid failed -> clean
 * else smooth; smooth-upscale evidence with a d1 lattice >= 2x off the target -> smooth; Clean when it
 * is a light touch (>= 97 % pixel agreement with grid, outline coverage kept; d1, no reduction), or when
 * the grid output is noisy (noise orphans >= 4 % of opaque pixels) and agreement >= 90 % (D55); else grid.
 */
export function convertCandidates(img, opts = {}, bytes = null) {
  checkImage(img)
  const o = normalize(opts), A = analysis(img, o, bytes), cls = A.grid.class
  const specs = []
  if (isNoop(img, o, true)) specs.push(['original', null])
  if (cls !== 'none') specs.push(['grid', { route: 'grid', cleanup: false }], ['clean', { route: 'grid', cleanup: true }])
  else specs.push(['clean', { route: 'raster', cleanup: true }])
  specs.push(['smooth', { route: 'raster', cleanup: false }])
  const candidates = [], alias = {}, failed = []
  let firstError = null
  for (const [id, over] of specs) {
    let r
    try { r = over ? run(A, { ...o, ...over }) : identity(img, o) } catch (e) {
      if (!(e instanceof PixilateError)) throw e
      failed.push({ id, code: e.code, message: e.message }); firstError ??= e
      continue
    }
    const dup = candidates.find((c) => sameImage(c.image, r.image))
    if (dup) { alias[id] = dup.id; continue }
    alias[id] = id
    candidates.push({ id, ...r })
  }
  if (!candidates.length) throw firstError
  let rule = recommend(A, cls, candidates, alias, specs[0][0] === 'original', !!o.manualPeriod)
  if (o.manualPeriod && (cls === 'none' || cls === 'weak') && rule.rule !== 'identity' && rule.rule !== 'grid-failed') // D66
    rule = { id: rule.id, rule: 'manual-grid', evidence: `recommended ${rule.id}: your pixel grid (${A.grid.x.count}×${A.grid.y.count})` }
  const id = alias[rule.id] ?? candidates[0].id
  const rec = id === rule.id ? rule : { ...rule, id, evidence: `${rule.evidence} (identical output: ${id})` }
  const { cuts, ...grid } = gridReport(A.grid, A.grid, [0, 0])
  return { candidates, recommended: id, recommendation: rec, alias, analysis: { grid, generator: generatorReport(A.gen), suggestedSize: suggestedSizeOf(A.grid) }, failed }
}
