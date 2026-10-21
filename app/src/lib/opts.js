// Size logic (GEO-002), engine options and the recipe (spec §8.1, §8.7). Pure; tested in test/opts.test.js.
import { roundHalfEven } from '$engine/core/canonical.js'
import { MAX, T, derivedTooBig, derivedNote } from './copy.js'
import { exportScales } from './geometry.js'
import { version } from '../../package.json'

export const PRESETS = [16, 32, 48, 64, 96, 128]
export const COLOURS = ['auto', 4, 8, 16, 32, 64]
export const DEFAULT_TOOLS = Object.freeze({ background: false, trim: false, colors: 'auto' })

// Derived sides are never clamped above, so validation can name a derived value over 1024.
export const deriveH = (w, W, H) => Math.max(1, roundHalfEven(w * H, W))
export const deriveW = (h, W, H) => Math.max(1, roundHalfEven(h * W, H))

const fits = (s) => s && s[0] <= MAX && s[1] <= MAX

/** Detected size: only for an exact or grid class with a suggested size within 1024 on both sides. */
export function prefill(info) {
  const g = info?.grid, s = g?.suggestedSize
  if (!g || !['exact', 'grid'].includes(g.class) || !fits(s)) return null
  return { w: s[0], h: s[1], lock: true, fit: 'contain', source: 'detected', chip: 'detected', note: null, derived: null }
}

/** Why the size must be chosen: 'over' | 'weak' | 'ambiguous' | 'none' (null when prefilled). */
export function needsCase(info) {
  const s = info.grid.suggestedSize
  if (s && !fits(s)) return 'over'
  if (prefill(info)) return null
  if (info.grid.class === 'weak') return 'weak'
  return info.grid.class === 'none' ? 'none' : 'ambiguous'
}

/** Size chips in order (§8.1). Each: { key, label, w, h, source }. */
export function chips(info, prefilled) {
  const out = []
  const g = info?.grid
  if (prefilled) out.push({ key: 'detected', label: T.detected, w: prefilled.w, h: prefilled.h, source: 'detected' })
  if (g?.class === 'weak' && fits(g.suggestedSize)) out.push({ key: 'maybe', label: T.maybe, w: g.suggestedSize[0], h: g.suggestedSize[1], source: 'suggestion' })
  if (g?.ambiguous && g.candidates) {
    const seen = new Set(prefilled ? [`${prefilled.w}x${prefilled.h}`] : [])
    for (const c of g.candidates) {
      const k = `${c.countX}x${c.countY}`
      // square blocks only: a 16 x 32 "fit" of a square picture would distort it (beyond the spec's wording)
      if (c.sx !== c.sy || c.sx === 1 || seen.has(k) || !fits([c.countX, c.countY])) continue
      seen.add(k)
      out.push({ key: `also-${k}`, label: T.alsoFits, w: c.countX, h: c.countY, source: 'suggestion' })
      if (out.filter((o) => o.key.startsWith('also-')).length === 3) break
    }
  }
  return out
}

/** Preset N: the long side, the other derived (lock on), or N x N (lock off). */
export function applyPreset(size, n, W, H) {
  const base = { ...size, source: 'preset', chip: `preset-${n}`, note: null, derived: null }
  if (!size.lock) return { ...base, w: n, h: n }
  return W >= H ? { ...base, w: n, h: deriveH(n, W, H) } : { ...base, w: deriveW(n, W, H), h: n }
}

/** A typed value for one field; with the lock on the other side is derived (and noted). */
export function typed(size, field, value, W, H) {
  const s = { ...size, [field]: value, source: 'typed', chip: null, note: null, derived: null }
  if (!size.lock || !Number.isInteger(value) || value < 1) return s
  const other = field === 'w' ? 'h' : 'w'
  s[other] = field === 'w' ? deriveH(value, W, H) : deriveW(value, W, H)
  s.source = 'derived'
  s.derived = other
  s.note = derivedNote(other, s[other], W, H)
  return s
}

/** Field errors { w?, h? }; an empty object means valid. */
export function validate(size) {
  const errors = {}
  for (const k of ['w', 'h']) {
    const v = size[k]
    if (!Number.isInteger(v) || v < 1) errors[k] = T.errWhole
    else if (v > MAX) errors[k] = size.derived === k ? derivedTooBig(k, v) : T.errOver
  }
  // a derived error belongs under the field the user typed
  if (size.derived && errors[size.derived]) {
    const typedField = size.derived === 'w' ? 'h' : 'w'
    errors[typedField] ??= errors[size.derived]
    delete errors[size.derived]
  }
  return errors
}
export const isValid = (size) => !!size && Object.keys(validate(size)).length === 0

/** Fit/Fill/Stretch matter only when the size's shape differs from the basis shape. */
export const showsFit = (size, bw, bh) => deriveH(size.w, bw, bh) !== size.h && deriveW(size.h, bw, bh) !== size.w

/** The exact options the app passes to the engine (stages off unless chosen). With the Fit control
 * hidden (the shape matches), fit is always 'contain', so a hidden choice never changes pixels. */
export function toEngineOpts(size, tools = DEFAULT_TOOLS, fitShown = false) {
  return {
    targetW: size.w, targetH: size.h, fit: fitShown ? size.fit ?? 'contain' : 'contain',
    trim: tools.trim ? { basis: 'cells' } : false,
    background: tools.background ? 'auto' : false,
    colors: tools.colors ?? 'auto',
  }
}

/** File-name base: lower-case [a-z0-9-], at most 40 characters. */
export function baseName(name) {
  if (!name) return 'pasted'
  const b = name.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return b || 'image'
}
export const fileName = (base, style, w, h, scale = 1) => `${base}-${style}-${w}x${h}${scale > 1 ? `@${scale}x` : ''}.png`

/** Recipe JSON (no pixels, no file name: NFR-PRIV-005). */
export function recipe({ result, shown, size, derivation, info }) {
  const c = result.candidates.find((x) => x.id === shown), r = c.report
  return {
    schema: 'pixilate-app-recipe/1',
    app: { name: 'pixilate-app', version },
    engine: r.recipe.engine, profile: r.recipe.profile, alphaPolicy: r.recipe.alphaPolicy,
    options: r.recipe.options,
    size: { w: size.w, h: size.h, source: size.source, derivation, note: size.note ?? null },
    style: { chosen: shown, recommended: result.recommended, rule: result.recommendation.rule, evidence: result.recommendation.evidence },
    input: { width: info.width, height: info.height, format: info.format, decode: info.decode },
    output: { width: c.width, height: c.height, colors: r.output.colors, hash: c.hash },
    warnings: r.warnings,
  }
}

/** The export scale actually used: the chosen one, or the largest that keeps each side within 4096. */
export function clampScale(scale, w, h) {
  if (!w) return 1
  const ok = exportScales(w, h)
  return ok.includes(scale) ? scale : ok.filter((k) => k <= scale).pop() ?? 1
}

/** After a failed open restores the previous image: which job must be posted again so nothing hangs. */
export const recoverJob = (status) => (status === 'analysing' ? 'analyse' : status === 'converting' ? 'convert' : null)

/** The style a candidate is shown as: Clean that changed nothing and absorbed Smooth is labelled Smooth. */
export function styleIdOf(c, result) {
  if (c?.id !== 'clean' || result?.alias?.smooth !== 'clean') return c?.id ?? null
  const n = Object.values(c.report?.cleanup?.changed ?? {}).reduce((a, b) => a + b, 0)
  return n ? 'clean' : 'smooth'
}
