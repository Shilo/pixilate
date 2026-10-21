import { describe, expect, test } from 'vitest'
import {
  DEFAULT_TOOLS, applyPreset, baseName, chips, clampScale, deriveH, deriveW, fileName, needsCase, prefill, recipe, recoverJob, showsFit, styleIdOf, toEngineOpts, typed, validate,
} from '../src/lib/opts.js'
import pkg from '../package.json'
import { T } from '../src/lib/copy.js'

const info = (cls, suggestedSize, extra = {}) => ({ width: 1024, height: 1024, grid: { class: cls, suggestedSize, ...extra } })
const S = { w: 32, h: 32, lock: true, fit: 'contain', source: 'detected', chip: 'detected', note: null, derived: null }

describe('engine options', () => {
  test('stages are off unless chosen', () => {
    expect(toEngineOpts(S, DEFAULT_TOOLS)).toEqual({ targetW: 32, targetH: 32, fit: 'contain', trim: false, background: false, colors: 'auto' })
  })
  test('tools map to explicit engine options', () => {
    expect(toEngineOpts({ ...S, fit: 'cover' }, { background: true, trim: true, colors: 8 }, true))
      .toEqual({ targetW: 32, targetH: 32, fit: 'cover', trim: { basis: 'cells' }, background: 'auto', colors: 8 })
  })
  test('a hidden Fit control always sends contain', () => {
    expect(toEngineOpts({ ...S, fit: 'stretch' }, DEFAULT_TOOLS, false).fit).toBe('contain')
  })
})

describe('lock derivation (half-even)', () => {
  test('derives the other side', () => {
    expect(deriveH(48, 1024, 1536)).toBe(72)
    expect(deriveW(72, 1024, 1536)).toBe(48)
    // 33 * 3 / 2 = 49.5 -> 50 (even); 35 * 3 / 2 = 52.5 -> 52 (even)
    expect(deriveH(33, 2, 3)).toBe(50)
    expect(deriveH(35, 2, 3)).toBe(52)
    expect(deriveH(1, 1000, 1)).toBe(1) // never below 1
  })
  test('typing with the lock on derives and notes it', () => {
    const s = typed(S, 'w', 48, 1024, 1536)
    expect([s.w, s.h, s.source, s.derived]).toEqual([48, 72, 'derived', 'h'])
    expect(s.note).toBe('Height 72 keeps the 1024 × 1536 shape.')
    const u = typed({ ...S, lock: false }, 'w', 48, 1024, 1536)
    expect([u.w, u.h, u.source, u.derived]).toEqual([48, 32, 'typed', null])
  })
  test('presets set the long side', () => {
    expect(applyPreset(S, 64, 1024, 512)).toMatchObject({ w: 64, h: 32, source: 'preset', chip: 'preset-64' })
    expect(applyPreset(S, 64, 512, 1024)).toMatchObject({ w: 32, h: 64 })
    expect(applyPreset({ ...S, lock: false }, 64, 1024, 512)).toMatchObject({ w: 64, h: 64 })
  })
})

describe('limits', () => {
  test('whole numbers 1..1024', () => {
    for (const v of [NaN, 0, -3, 2.5]) expect(validate({ ...S, w: v })).toEqual({ w: T.errWhole })
    expect(validate({ ...S, h: 1025 })).toEqual({ h: T.errOver })
    expect(validate(S)).toEqual({})
  })
  test('a derived side over 1024 is named under the typed field', () => {
    const s = typed(S, 'w', 1024, 1024, 1536)
    expect(s.h).toBe(1536)
    expect(validate(s)).toEqual({ w: 'That makes the height 1536. The largest is 1024, so use a smaller width.' })
  })
})

describe('prefill', () => {
  test('only exact or grid within 1024', () => {
    expect(prefill(info('exact', [32, 32]))).toMatchObject({ w: 32, h: 32, source: 'detected' })
    expect(prefill(info('grid', [64, 48]))).toMatchObject({ w: 64, h: 48 })
    expect(prefill(info('weak', [48, 48]))).toBeNull()
    expect(prefill(info('none', null))).toBeNull()
    expect(prefill(info('exact', [2048, 2048]))).toBeNull()
  })
  test('needs-size cases', () => {
    expect(needsCase(info('exact', [32, 32]))).toBeNull()
    expect(needsCase(info('weak', [48, 48]))).toBe('weak')
    expect(needsCase(info('none', null))).toBe('none')
    expect(needsCase(info('exact', [2048, 2048]))).toBe('over')
    expect(needsCase(info('exact', null))).toBe('ambiguous')
  })
  test('chips: detected, maybe, up to three square-block "also fits" without 1x1 or the prefilled size', () => {
    const i = info('exact', [32, 32], { ambiguous: true, candidates: [{ sx: 32, sy: 32, countX: 32, countY: 32 }, { sx: 32, sy: 64, countX: 32, countY: 16 }, { sx: 64, sy: 64, countX: 16, countY: 16 }, { sx: 128, sy: 128, countX: 8, countY: 8 }, { sx: 256, sy: 256, countX: 4, countY: 4 }, { sx: 512, sy: 512, countX: 2, countY: 2 }, { sx: 1, sy: 1, countX: 1024, countY: 1024 }] })
    const c = chips(i, prefill(i))
    expect(c.map((x) => `${x.key}`)).toEqual(['detected', 'also-16x16', 'also-8x8', 'also-4x4'])
    expect(chips(info('weak', [48, 48]), null).map((x) => [x.key, x.w, x.h])).toEqual([['maybe', 48, 48]])
  })
})

describe('fit mode visibility', () => {
  test('only when the shape differs from the basis', () => {
    expect(showsFit({ w: 64, h: 64 }, 1024, 1024)).toBe(false)
    expect(showsFit({ w: 64, h: 32 }, 1024, 1024)).toBe(true)
    expect(showsFit({ w: 48, h: 72 }, 1024, 1536)).toBe(false)
  })
})

describe('files and recipe', () => {
  test('file names', () => {
    expect(baseName('My Cat (final).PNG')).toBe('my-cat-final')
    expect(baseName(null)).toBe('pasted')
    expect(baseName('x'.repeat(60) + '.png')).toHaveLength(40)
    expect(fileName('cat', 'faithful', 32, 32)).toBe('cat-faithful-32x32.png')
    expect(fileName('cat', 'faithful', 32, 32, 8)).toBe('cat-faithful-32x32@8x.png')
  })
  test('the recipe holds size source, derivation, chosen and recommended, and no file name', () => {
    const report = { recipe: { engine: { id: 'e', version: '1' }, profile: null, alphaPolicy: 'Binary(128)', options: { targetW: 32 } }, output: { colors: 5 }, warnings: ['w'] }
    const result = { recommended: 'grid', recommendation: { rule: 'exact', evidence: 'ev' }, candidates: [{ id: 'grid', width: 32, height: 32, hash: 'abc', report }, { id: 'smooth', width: 32, height: 32, hash: 'def', report }] }
    const r = recipe({ result, shown: 'smooth', size: S, derivation: 'Found…', info: { width: 1024, height: 1024, format: 'png', decode: 'js' } })
    expect(r.schema).toBe('pixilate-app-recipe/1')
    expect(r.size).toEqual({ w: 32, h: 32, source: 'detected', derivation: 'Found…', note: null })
    expect(r.style).toEqual({ chosen: 'smooth', recommended: 'grid', rule: 'exact', evidence: 'ev' })
    expect(r.output).toEqual({ width: 32, height: 32, colors: 5, hash: 'def' })
    expect(JSON.stringify(r)).not.toMatch(/\.png/)
  })
})

describe('export scale, recovery and labels', () => {
  test('one clamped scale: never over 4096 a side', () => {
    expect(clampScale(16, 300, 300)).toBe(8)
    expect(clampScale(16, 1024, 1024)).toBe(4)
    expect(clampScale(2, 32, 32)).toBe(2)
    expect(clampScale(8, 0, 0)).toBe(1)
  })
  test('a restored mid-job state posts its job again', () => {
    expect(recoverJob('analysing')).toBe('analyse')
    expect(recoverJob('converting')).toBe('convert')
    expect(recoverJob('result')).toBeNull()
  })
  test('Clean that absorbed Smooth and changed nothing is labelled Smooth', () => {
    const c = (n) => ({ id: 'clean', report: { cleanup: { changed: n ? { orphans: n } : {} } } })
    expect(styleIdOf(c(0), { alias: { smooth: 'clean' } })).toBe('smooth')
    expect(styleIdOf(c(3), { alias: { smooth: 'clean' } })).toBe('clean')
    expect(styleIdOf(c(0), { alias: { smooth: 'smooth' } })).toBe('clean')
    expect(styleIdOf({ id: 'grid' }, { alias: {} })).toBe('grid')
  })
  test('the recipe carries the package version', () => {
    const report = { recipe: { engine: {}, profile: null, alphaPolicy: 'Binary(128)', options: {} }, output: { colors: 1 }, warnings: [] }
    const result = { recommended: 'grid', recommendation: { rule: 'exact', evidence: '' }, candidates: [{ id: 'grid', width: 1, height: 1, hash: null, report }] }
    expect(recipe({ result, shown: 'grid', size: S, derivation: '', info: {} }).app.version).toBe(pkg.version)
  })
})
