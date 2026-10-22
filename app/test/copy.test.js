// Copy coverage: every engine rule, background refusal and warning (read from the engine source) maps to
// plain copy, and no UI string uses the engine's jargon.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import * as C from '../src/lib/copy.ts'

const src = (rel) => readFileSync(new URL(`../../prototype/src/lib/${rel}`, import.meta.url), 'utf8')
const literals = (text, re) => [...text.matchAll(re)].map((m) => m[1].split('${')[0])
const pipeline = src('core/pipeline.ts'), cleanup = src('core/cleanup.ts'), palette = src('core/palette.ts'), decode = src('decode.ts')

const RULES = [...new Set(literals(pipeline, /rule: '([^']+)'/g))]
const REFUSALS = [...new Set([...literals(cleanup, /refuse\(['`]([^'`]+)['`]\)/g), ...literals(cleanup, /reason: '([^']+)'/g), ...literals(pipeline, /\?\? '(no background[^']*)'/g)])]
const WARNINGS = [...new Set([pipeline, palette, decode].flatMap((t) => [
  ...literals(t, /warnings\.(?:push|unshift)\('([^']+)'/g), ...literals(t, /warnings\.(?:push|unshift)\(`([^`]+)`/g),
  ...literals(t, /warning: [^?]*\? `([^`]+)`/g), ...literals(t, /warning: `([^`]+)`/g),
]))]

test('the engine source yields the expected sets', () => {
  expect(RULES).toEqual(expect.arrayContaining(['identity', 'no-grid', 'exact', 'grid-failed', 'smooth-upscale-off-target', 'light-touch-clean', 'noisy-grid-clean', 'grid']))
  expect(REFUSALS.length).toBeGreaterThanOrEqual(6)
  expect(WARNINGS).toEqual(expect.arrayContaining(['aspect distortion: stretched ', 'cover crop: kept ', 'approximate', 'detail reduced']))
})

describe('every engine string maps to copy', () => {
  test.each(RULES)('rule %s', (rule) => {
    for (const cls of ['exact', 'grid', 'weak', 'none']) expect(C.reason({ rule, evidence: '' }, cls)).not.toBe(C.UNKNOWN_REASON)
  })
  test.each(REFUSALS)('background reason %s', (reason) => {
    expect(C.bgLine({ mode: 'auto', applied: false, reason: reason + ' x' })).not.toContain(C.BG_OTHER)
  })
  test.each(WARNINGS)('warning %s', (w) => {
    const s = C.warningSentence(w)
    // hidden (the reason line says it) or a mapped sentence, never the raw engine text
    if (s !== null) expect(s).not.toBe(w)
  })
  test('grid rule sentences follow the evidence', () => {
    const r = (evidence) => C.reason({ rule: 'grid', evidence }, 'grid')
    expect(new Set([r('reduction 2x'), r('Clean identical to grid'), r('smooth-upscale lattice (d2)'), r('Clean declined')]).size).toBe(4)
  })
  test('only the bare "approximate" warning is hidden; non-integer ratio shows', () => {
    expect(C.warningSentence('approximate')).toBeNull()
    expect(C.warningLine(['approximate', 'non-integer ratio, approximate'])).toMatch(/divide/)
    expect(C.warningLine(['approximate'])).toBeNull()
  })
})

// Every string the UI can show, from the static table and from each function over the engine's inputs.
function uiStrings() {
  const out = []
  const walk = (v) => (typeof v === 'string' ? out.push(v) : v && typeof v === 'object' && Object.values(v).forEach(walk))
  walk(C.T)
  for (const id of C.STYLE_ORDER) for (const route of ['grid', 'raster']) out.push(C.styleLabel(id), C.styleDesc(id, route), C.styleName(id, route, true))
  for (const rule of [...RULES, 'other']) for (const cls of ['exact', 'grid', 'weak', 'none']) for (const ev of ['reduction', 'Clean identical', 'd2', '']) out.push(C.reason({ rule, evidence: ev }, cls))
  for (const w of WARNINGS) out.push(C.warningSentence(w) ?? '')
  for (const r of [...REFUSALS, 'other']) out.push(C.bgLine({ mode: 'auto', applied: false, reason: r }))
  out.push(C.bgLine({ mode: 'auto', applied: true, removed: 3 }))
  for (const code of ['decode-unsupported', 'decode-too-large', 'decode-damaged', 'empty-visible-region', 'algorithm-budget-exceeded', 'invalid-input', 'internal-invariant', 'worker', null]) {
    const e = C.errorCopy(code); out.push(e.message, e.label)
  }
  const g = (cls, suggestedSize, period = [16, 16]) => ({ width: 512, height: 512, grid: { class: cls, suggestedSize, period } })
  for (const i of [g('exact', [32, 32]), g('exact', [512, 512], [1, 1]), g('grid', [64, 64], [15.9, 15.9]), g('weak', null), g('none', null), g('exact', [2048, 2048]), g('exact', null)]) out.push(C.derivation(i))
  for (const k of ['none', 'weak', 'over', 'stopped', 'ambiguous']) out.push(C.needsHeading(k, g('exact', [2048, 2048])))
  const rep = (route, fallback) => ({ route, input: { width: 64, height: 64 }, fit: { offset: [0, 2] }, trim: { enabled: true, basis: 'cells', box: [4, 4, 20, 30], fallback } })
  out.push(C.trimCaption(rep('grid')), C.trimCaption(rep('raster')), C.trimCaption(rep('grid', {})), C.trimCaption({ ...rep('grid'), trim: { enabled: true, box: [0, 0, 64, 64] } }))
  out.push(C.cleanLine({ cleanup: { changed: { a: 3 } } }), C.cleanLine({ cleanup: { changed: {} } }), C.readyStatus(32, 32, 'grid', true), C.artLabel(32, 32, 5, 'clean', 8), C.failedStyle('grid', 'invalid-input'))
  for (const code of ['decode-unsupported', 'decode-too-large', 'decode-damaged']) out.push(C.fileError(code, 'notes.txt'), C.fileError(code, null))
  out.push(C.saveLabel(64, 64, 4), C.bestIs('Clean', 'x'), C.derivedNote('h', 48, 1024, 1536), C.derivedTooBig('h', 1536), C.coloursUsed(12, 16), C.metaClaim('Gemini'))
  return out
}

test('UI strings never use the banned words', () => {
  const strings = uiStrings()
  expect(strings.length).toBeGreaterThan(150)
  for (const s of strings) for (const b of C.BANNED) expect(s.toLowerCase(), `"${s}" uses "${b}"`).not.toMatch(new RegExp(`\\b${b}`))
})

test('British spelling and thin-spaced dimensions', () => {
  expect(C.T.colours).toBe('Colours')
  expect(C.dims(32, 16)).toBe('32 × 16')
  expect(C.srDims(32, 16)).toBe('32 by 16')
})

test('the grid sentence shows the real fractional block size and no rounded division', () => {
  const s = C.derivation({ width: 1254, height: 1154, grid: { class: 'grid', suggestedSize: [126, 116], period: [9.95, 9.95] } })
  expect(s).toBe('Found a pixel grid of about 9.95 px blocks, 126 wide and 116 high.')
})
