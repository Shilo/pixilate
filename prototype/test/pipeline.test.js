import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { analyze, canonicalHash, convert, convertCandidates, indexedToImage, PixilateError, CLEAN_PROFILE, rampShare, rampShareNoisy } from '../src/lib/core/pipeline.ts'
import { degrade, PRESETS, noGrid } from './synth.js'
import { CANVAS_OPTS, proceduralSprites, readPng, repoPath } from './fixtures.js'
import { indexImage, q4, scoreCase } from './metrics.js'
import { srgbToOklab } from '../src/lib/core/color.ts'

/** Integer NN upscale of an RGBA image. */
function nn(img, k) {
  const W = img.width * k, H = img.height * k, data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (((y / k) | 0) * img.width + ((x / k) | 0)) * 4
    data.set(img.data.subarray(s, s + 4), (y * W + x) * 4)
  }
  return { width: W, height: H, data }
}

/** Opaque-bbox crop of an RGBA image (alpha >= 128). */
function bboxCrop(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1 + 1) * 4), y * w * 4)
  return { width: w, height: h, data, x0, y0 }
}

/** Add a transparent margin (left, top, right, bottom). */
function padded(img, l, t, r, b) {
  const W = img.width + l + r, H = img.height + t + b, data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < img.height; y++) data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + t) * W + l) * 4)
  return { width: W, height: H, data }
}

const binaryAlpha = (img) => img.data.every((v, i) => i % 4 !== 3 || v === 0 || v === 255)
const same = (a, b) => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i])
// transparent pixels compare as transparent regardless of their RGB
const opaqueRGBA = (img) => ({ ...img, data: img.data.map((v, i) => (img.data[i - (i % 4) + 3] === 0 ? 0 : v)) })
const noTimings = (r) => ({ ...r, timingsMs: 0 })
const code = (f) => { try { f() } catch (e) { return e instanceof PixilateError ? e.code : `untyped: ${e}` } return null }

const BLOB = proceduralSprites(1)[0].img // 24 x 28, transparent margin
const BX = BLOB.width, BY = BLOB.height

/** w x h smooth gradient (> 256 colours, no grid). */
function gradient(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([(x * 255) / w, (y * 255) / h, (x * y) & 255, 255], (y * w + x) * 4)
  return { width: w, height: h, data }
}

describe('convert: input validation (typed invalid-input before allocation)', () => {
  const img = gradient(8, 8)
  for (const [name, opts] of [
    ['missing target', {}], ['targetW 0', { targetW: 0, targetH: 8 }], ['targetW 2.5', { targetW: 2.5, targetH: 8 }],
    ['targetH NaN', { targetW: 8, targetH: NaN }], ['targetW 1025', { targetW: 1025, targetH: 8 }], ['targetW -3', { targetW: -3, targetH: 8 }],
    ['targetW string', { targetW: '8', targetH: 8 }], ['fit canvas', { targetW: 8, targetH: 8, fit: 'canvas' }], ['route bogus', { targetW: 8, targetH: 8, route: 'x' }],
    ['trim string', { targetW: 8, targetH: 8, trim: 'yes' }], ['cleanup string', { targetW: 8, targetH: 8, cleanup: 'on' }],
    ['background true', { targetW: 8, targetH: 8, background: true }], ['key out of range', { targetW: 8, targetH: 8, background: { key: [0, 0, 300] } }],
    ['connectivity 6', { targetW: 8, targetH: 8, background: { key: [0, 0, 0], connectivity: 6 } }], ['colors 0', { targetW: 8, targetH: 8, colors: 0 }],
    ['palette byte 256', { targetW: 8, targetH: 8, palette: [[256, 0, 0]] }],
    ['trim basis bogus', { targetW: 8, targetH: 8, trim: { basis: 'alpha' } }], ['trim extra key', { targetW: 8, targetH: 8, trim: { basis: 'cells', tau: 9 } }],
  ]) it(name, () => expect(code(() => convert(img, opts))).toBe('invalid-input'))

  it('malformed image', () => {
    expect(code(() => convert({ width: 2, height: 2, data: new Uint8ClampedArray(4) }, { targetW: 2, targetH: 2 }))).toBe('invalid-input')
    expect(code(() => convertCandidates(null, { targetW: 2, targetH: 2 }))).toBe('invalid-input')
  })
})

describe('convert: decode passthrough', () => {
  it('records format/decode/strict/orientation in report.input and leads with decode warnings', () => {
    const pass = { format: 'png', decode: 'js', strict: true, orientation: 1, warnings: ['color-metadata-ignored'] }
    for (const { report } of [convert(gradient(32, 32), { targetW: 8, targetH: 8, ...pass }), convert(gradient(8, 8), { targetW: 8, targetH: 8, ...pass })]) {
      expect(report.input).toEqual({ width: report.input.width, height: report.input.height, format: 'png', decode: 'js', strict: true, orientation: 1 })
      expect(report.warnings[0]).toBe('color-metadata-ignored')
      expect(JSON.stringify(report.recipe)).not.toMatch(/color-metadata/)
    }
  })
})

describe('convert: exact inputs (gate T1)', () => {
  it('clean NN x8 upscale at its native size -> exact path, output identical to the sprite', () => {
    const { image, report } = convert(nn(BLOB, 8), { targetW: BX, targetH: BY })
    expect(report.path).toBe('exact')
    expect(report.alphaPolicy).toBe('Binary(128)')
    expect(same(opaqueRGBA(image), opaqueRGBA(BLOB))).toBe(true)
  })

  it('trim: alpha > 0 bounds, recorded box, then the exact subject', () => {
    const b = bboxCrop(BLOB), { image, report } = convert(nn(BLOB, 8), { trim: true, targetW: b.width, targetH: b.height })
    expect(report.trim).toEqual({ enabled: true, tau: 0, comparison: '>', box: [b.x0 * 8, b.y0 * 8, (b.x0 + b.width) * 8, (b.y0 + b.height) * 8] })
    expect(same(opaqueRGBA(image), opaqueRGBA(b))).toBe(true)
  })

  it('trim: same subject with different transparent margins gives the same output (AC-TRIM-001)', () => {
    const b = bboxCrop(BLOB), opts = { trim: true, targetW: b.width, targetH: b.height }
    const a = convert(nn(BLOB, 4), opts).image, c = convert(nn(padded(BLOB, 3, 1, 0, 5), 4), opts).image
    expect(same(a, c)).toBe(true)
  })

  it('exact x8 with half the native target -> integer reduce 2:1', () => {
    const { image, report } = convert(nn(BLOB, 8), { fit: 'stretch', targetW: BX / 2, targetH: BY / 2 })
    expect(report.path).toBe('grid-reduce-k')
    expect([image.width, image.height]).toEqual([BX / 2, BY / 2])
    expect(report.warnings).toContain('detail reduced')
  })
})

describe('convert: empty visible region', () => {
  const empty = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4).map((_, i) => (i % 4 === 3 ? 0 : (i * 7) & 255)) }
  it('trim on an all-transparent input throws empty-visible-region (hidden RGB ignored)', () => {
    expect(code(() => convert(empty, { trim: true, targetW: 8, targetH: 8 }))).toBe('empty-visible-region')
    expect(code(() => convert(empty, { trim: true, targetW: 8, targetH: 8, route: 'raster' }))).toBe('empty-visible-region')
  })
  it('without trim the full transparent canvas is resized', () => {
    const { image } = convert(empty, { targetW: 8, targetH: 8 })
    expect(image.data.every((v) => v === 0)).toBe(true)
  })
  it('reports no grid and no suggested size, not a 1 x 1 exact lattice (D56)', () => {
    const a = analyze(empty), { image, report } = convert(empty, { targetW: 12, targetH: 9 })
    expect([a.grid.class, a.suggestedSize, a.grid.suggestedSize, a.grid.ambiguous, a.grid.candidates, a.grid.alternatives]).toEqual(['none', null, null, false, [], { x: [], y: [] }])
    expect(a.grid.evidence).toEqual(['none: no pixel with alpha > 0'])
    expect([report.grid.class, report.grid.suggestedSize, report.route, image.width, image.height]).toEqual(['none', null, 'raster', 12, 9])
    expect(report.output.colors).toBe(0)
  })
})

describe('convert: identity (PRO-NOOP)', () => {
  it('target == source with no other stage returns the canonical input, partial alpha included', () => {
    const img = { ...BLOB, data: Uint8ClampedArray.from(BLOB.data) }
    for (let p = 0; p < 40; p++) img.data[p * 4 + 3] = 100 // partial alpha stays
    img.data.set([9, 9, 9, 0], (BX * BY - 1) * 4) // hidden RGB is canonicalized
    const { image, indexed, report } = convert(img, { targetW: BX, targetH: BY })
    expect(report.path).toBe('noop')
    expect(indexed).toBe(null)
    const want = Uint8ClampedArray.from(img.data)
    want.set([0, 0, 0, 0], (BX * BY - 1) * 4)
    expect(Array.from(image.data)).toEqual(Array.from(want))
    expect(image.data).not.toBe(img.data)
  })
  it('any requested stage leaves the noop path', () => {
    for (const extra of [{ cleanup: true }, { trim: true }, { background: 'auto' }, { colors: 4 }, { route: 'grid' }]) {
      expect(convert(BLOB, { targetW: BX, targetH: BY, ...extra }).report.path).not.toBe('noop')
    }
  })
})

describe('convert: alpha-0 RGB canonicalization (metamorphic)', () => {
  const hide = (img, seed) => {
    const out = { ...img, data: Uint8ClampedArray.from(img.data) }
    let s = seed
    for (let p = 0; p < out.data.length; p += 4) if (!out.data[p + 3]) for (let k = 0; k < 3; k++) { s = (s * 1103515245 + 12345) >>> 0; out.data[p + k] = s >>> 24 }
    return out
  }
  for (const [name, img, opts] of [
    ['exact grid', nn(BLOB, 4), { targetW: BX, targetH: BY, cleanup: true }],
    ['trim + raster', nn(BLOB, 4), { trim: true, route: 'raster', targetW: 16, targetH: 16 }],
    ['grid then resample', nn(BLOB, 4), { targetW: 17, targetH: 19, fit: 'stretch', cleanup: true }],
  ]) {
    it(`${name}: hidden RGB changes neither pixels nor report`, async () => {
      const a = convert(img, opts), b = convert(hide(img, 7), opts)
      expect(same(a.image, b.image)).toBe(true)
      expect(noTimings(a.report)).toEqual(noTimings(b.report))
      expect(await canonicalHash(hide(img, 3))).toBe(await canonicalHash(img))
    })
  }
})

describe('canonicalHash (pixilate/canonical-rgba/v1)', () => {
  it('is SHA-256 over tag, NUL, u32le W, u32le H and RGBA8', async () => {
    const img = { width: 3, height: 2, data: Uint8ClampedArray.from({ length: 24 }, (_, i) => (i % 4 === 3 ? 255 : i * 10)) }
    const head = Buffer.alloc(9)
    head.writeUInt32LE(3, 1); head.writeUInt32LE(2, 5)
    const want = createHash('sha256').update(Buffer.concat([Buffer.from('pixilate/canonical-rgba/v1', 'ascii'), head, Buffer.from(img.data)])).digest('hex')
    expect(await canonicalHash(img)).toBe(want)
  })
  it('pinned vector: 1x1 transparent', async () => {
    expect(await canonicalHash({ width: 1, height: 1, data: new Uint8ClampedArray(4) })).toBe('9b31f773e33c9c89d0e64fa6c8e8d1073319a067b5cf879f7e009672770840ac')
  })
  it('separates shapes with the same bytes', async () => {
    const d = new Uint8ClampedArray(16).fill(255)
    expect(await canonicalHash({ width: 4, height: 1, data: d })).not.toBe(await canonicalHash({ width: 2, height: 2, data: d }))
  })
})

describe('convert: Stretch / Contain / Cover on the raster route', () => {
  const G = gradient(512, 256)
  const rowsOpaque = (img) => Array.from({ length: img.height }, (_, y) => img.data[(y * img.width + (img.width >> 1)) * 4 + 3] === 255)

  it('contain pads (center, transparent), with the report rectangle', () => {
    const { image, report } = convert(G, { targetW: 40, targetH: 40 })
    expect([report.route, report.fit.mode, report.fit.resized, report.fit.offset]).toEqual(['raster', 'contain', [40, 20], [0, 10]])
    const rows = rowsOpaque(image)
    expect(rows.slice(0, 10).some(Boolean) || rows.slice(30).some(Boolean)).toBe(false)
    expect(rows.slice(10, 30).every(Boolean)).toBe(true)
    expect(report.warnings).toContain('no reliable source grid detected')
  })

  it('cover crops (reported, warned) and fills the box', () => {
    const { image, report } = convert(G, { targetW: 40, targetH: 40, fit: 'cover' })
    expect(report.fit.crop).toEqual([128, 0, 384, 256])
    expect(report.warnings.some((w) => w.startsWith('cover crop'))).toBe(true)
    expect(rowsOpaque(image).every(Boolean)).toBe(true)
  })

  it('stretch fills the box and warns about the aspect change', () => {
    const { report } = convert(G, { targetW: 40, targetH: 40, fit: 'stretch' })
    expect(report.fit.resized).toEqual([40, 40])
    expect(report.warnings.some((w) => w.startsWith('aspect distortion'))).toBe(true)
    expect(convert(G, { targetW: 40, targetH: 20, fit: 'stretch' }).report.warnings.some((w) => w.startsWith('aspect'))).toBe(false)
  })

  it('round half to even: 40x10 contained in 10x10 -> 10x2 (2.5 rounds down), odd remainder bottom', () => {
    const { report } = convert(gradient(40, 10), { targetW: 10, targetH: 10 })
    expect([report.fit.resized, report.fit.offset]).toEqual([[10, 2], [0, 4]])
    expect(convert(gradient(40, 12), { targetW: 10, targetH: 10 }).report.fit.resized).toEqual([10, 3]) // 3.0
    expect(convert(gradient(40, 14), { targetW: 10, targetH: 10 }).report.fit.resized).toEqual([10, 4]) // 3.5 -> 4
  })

  it('extreme aspect: contain clamps the minor axis to 1 px; no silent stretch', () => {
    const tall = convert(gradient(2, 600), { targetW: 40, targetH: 40 }), wide = convert(gradient(4096, 1), { targetW: 1, targetH: 1 })
    expect(tall.report.fit.resized).toEqual([1, 40])
    expect([wide.image.width, wide.image.height, wide.report.fit.resized]).toEqual([1, 1, [1, 1]])
  })

  it('exact W x H for every fit (1x1, 1x9, 9x1 and non-square)', () => {
    for (const fit of ['stretch', 'contain', 'cover']) for (const [w, h] of [[1, 1], [1, 9], [9, 1], [13, 7]]) {
      for (const src of [G, nn(BLOB, 4)]) {
        const { image } = convert(src, { targetW: w, targetH: h, fit })
        expect([image.width, image.height]).toEqual([w, h])
      }
    }
  })
})

describe('convert: Step 4 path table on a degraded GPT-like input', () => {
  const { img } = degrade(BLOB, PRESETS['gpt-image-like'], 11)
  const [N, M] = analyze(img).suggestedSize
  const run = (Tx, Ty, extra = {}) => convert(img, { fit: 'stretch', targetW: Tx, targetH: Ty, ...extra })

  it('analysis finds a grid and suggests its native size', () => {
    const a = analyze(img)
    expect(a.grid.class).not.toBe('none')
    expect(a.grid.cuts).toBeUndefined()
    expect(a.suggestedSize).toEqual(a.grid.native)
  })

  const cases = [
    ['T = N', () => [N, M], 'grid-locked'],
    ['T = N + 1', () => [N + 1, M + 1], 'grid-locked'],
    ['T = 2N', () => [2 * N, 2 * M], 'grid-upscale-k'],
    ['T = 0.7N', () => [Math.round(0.7 * N), Math.round(0.7 * M)], 'grid-then-resample'],
    ['T = 1.5N (T > N, non-integer)', () => [Math.round(1.5 * N), Math.round(1.5 * M)], 'grid-then-resample'],
    ['mixed rows (x locks, y non-integer)', () => [N, Math.round(0.7 * M)], 'grid-then-resample'],
  ]
  for (const [name, T, path] of cases) {
    it(`${name} -> ${path}, exact size, binary alpha`, () => {
      const [Tx, Ty] = T(), { image, report } = run(Tx, Ty)
      expect(report.path).toBe(path)
      expect([image.width, image.height]).toEqual([Tx, Ty])
      expect(binaryAlpha(image)).toBe(true)
      expect(report.output.colors).toBeLessThanOrEqual(64)
    })
  }

  it('T > N non-integer also warns that the target exceeds native resolution', () => {
    expect(run(Math.round(1.5 * N), Math.round(1.5 * M)).report.warnings).toEqual(
      expect.arrayContaining(['non-integer ratio, approximate', 'target exceeds native resolution']))
  })

  it('cleanup off changes zero cells; the Clean profile reports changed cells per rule', () => {
    const T = [Math.round(0.7 * N), Math.round(0.7 * M)], off = run(...T), on = run(...T, { cleanup: true })
    expect(off.report.cleanup).toEqual({ profile: null, changed: { reduceBridge: 0, reduceOrphan: 0, reduceOutline: 0 } })
    expect(on.report.cleanup.profile).toBe(CLEAN_PROFILE)
    expect(on.report.recipe.profile).toBe(CLEAN_PROFILE)
    expect(Object.keys(on.report.cleanup.changed)).toEqual(expect.arrayContaining(['orphan', 'rareLone', 'pinhole', 'island', 'pixelPerfect', 'reduceBridge', 'reduceOrphan', 'reduceOutline']))
    expect(Object.values(on.report.cleanup.changed).reduce((a, b) => a + b)).toBeGreaterThan(0)
    expect(same(off.image, on.image)).toBe(false)
  })

  it('contain and cover also work on the grid route', () => {
    const c = run(N, Math.round(M / 2), { fit: 'contain' }), v = run(N, Math.round(M / 2), { fit: 'cover' })
    expect([c.report.route, v.report.route]).toEqual(['grid', 'grid'])
    expect(c.report.fit.basisUnit).toBe('cells')
    expect(c.report.output.transparent).toBe(true)
    expect(v.report.fit.crop).not.toBe(null)
  })

  it('is deterministic (byte-identical image and report) and under 1 s', () => {
    const t = performance.now(), a = run(Math.round(0.7 * N), Math.round(0.7 * M)), ms = performance.now() - t
    const b = run(Math.round(0.7 * N), Math.round(0.7 * M))
    expect(same(a.image, b.image)).toBe(true)
    expect(noTimings(a.report)).toEqual(noTimings(b.report))
    console.log(`convert ${img.width}x${img.height} -> 0.7N: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1000)
  })

  it('records the normalized recipe without timings', () => {
    const { report } = run(N, M, { background: { key: [255, 255, 255] } })
    expect(report.recipe.engine.id).toBe('pixilate-prototype-js')
    expect(report.recipe.options).toEqual({
      targetW: N, targetH: M, trim: false, fit: 'stretch', anchor: 'center', route: 'auto', cleanup: false,
      background: { mode: 'key', key: [255, 255, 255], tolerance: 0.03, connectivity: 4 }, halo: false, colors: 'auto', palette: null, manualPeriod: null,
    })
    expect(JSON.stringify(report.recipe)).not.toMatch(/timings/)
  })

  it('every recorded recipe.options replays through convert() to identical pixels (D56)', async () => {
    const src = nn(BLOB, 8), soft = degrade(BLOB, PRESETS['gpt-image-like'], 3).img
    const combos = [
      [src, {}], [src, { trim: true, fit: 'contain' }], [src, { trim: { basis: 'cells' } }], [src, { background: 'auto' }],
      [src, { background: { key: [255, 255, 255], tolerance: 0.1, connectivity: 8 }, halo: true }], [src, { fit: 'cover', targetW: 20, targetH: 30 }],
      [src, { palette: [[0, 0, 0], [255, 255, 255], [200, 40, 40]] }], [src, { colors: 4, route: 'raster' }], [src, { manualPeriod: [8, 8] }],
      [soft, { trim: true, background: 'auto', cleanup: true }], [soft, { trim: { basis: 'cells' }, background: 'auto', fit: 'contain' }],
      [soft, { route: 'grid', colors: 8 }], [BLOB, { targetW: BX, targetH: BY }],
    ]
    for (const [img, opts] of combos) {
      const a = convert(img, { targetW: BX, targetH: BY, ...opts }), b = convert(img, a.report.recipe.options)
      expect(await canonicalHash(b.image), JSON.stringify(opts)).toBe(await canonicalHash(a.image))
      expect(b.report.recipe, JSON.stringify(opts)).toEqual(a.report.recipe)
    }
  })
})

describe('convert: trimmed sprites on the grid route', () => {
  it('trim + contain with T > N: integer upscale (no mixels), centred, padded transparent', () => {
    const { image, report } = convert(nn(BLOB, 8), { trim: true, targetW: 64, targetH: 64 })
    expect(report.path).toBe('grid-upscale-k')
    expect([image.width, image.height]).toEqual([64, 64])
    const b = bboxCrop(image), s = bboxCrop(BLOB), k = Math.floor(64 / Math.max(s.width, s.height))
    expect([b.width, b.height]).toEqual([s.width * k, s.height * k])
    expect(same(opaqueRGBA(b), opaqueRGBA(nn(s, k)))).toBe(true)
    expect(Math.abs(b.x0 - (64 - b.width - b.x0))).toBeLessThanOrEqual(1) // centred (floor offset)
  })
})

/** Paste the opaque pixels of `img` onto a solid `rgb` canvas with `pad` px margin. */
function onBg(img, rgb, pad) {
  const W = img.width + 2 * pad, H = img.height + 2 * pad, data = new Uint8ClampedArray(W * H * 4)
  for (let p = 0; p < W * H; p++) data.set([...rgb, 255], p * 4)
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const s = (y * img.width + x) * 4
    if (img.data[s + 3] >= 128) data.set(img.data.subarray(s, s + 4), ((y + pad) * W + x + pad) * 4)
  }
  return { width: W, height: H, data }
}

/** Tint each 8 px cell's top-left pixel in place: class grid (no exact factorization), insets still pure. */
function tintRows(big) {
  for (let y = 0; y < big.height; y += 8) for (let x = 0; x < big.width; x += 8) { const p = (y * big.width + x) * 4; if (big.data[p + 3]) big.data[p] = Math.min(255, big.data[p] + 9) }
  return big
}

/** Opaque 1:1 art, 8 colours from a fixed LCG (no period, so class 'exact' n = 1). */
function noiseArt(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  let s = 12345
  for (let p = 0; p < w * h; p++) { s = (s * 1103515245 + 12345) >>> 0; const k = s >>> 29; data.set([k * 32, 255 - k * 30, (k * 77) & 255, 255], p * 4) }
  return { width: w, height: h, data }
}

/** w x h image where every pixel has its own colour. */
function uniqueColors(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < w * h; p++) data.set([p & 255, (p >> 8) & 255, (p * 37) & 255, 255], p * 4)
  return { width: w, height: h, data }
}

describe('convert: degenerate inputs', () => {
  const flat = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(150) })
  for (const [name, img, extra] of [
    ['solid 32x32', flat(32, 32), {}],
    ['1x1', flat(1, 1), {}],
    ['flat 17x13', flat(17, 13), {}],
    ['manual period larger than the image', flat(32, 32), { manualPeriod: [1e6, 1e6] }],
  ]) {
    it(`${name}: background removal never leaves an empty image and says why`, () => {
      const { report } = convert(img, { targetW: img.width, targetH: img.height, background: 'auto', ...extra })
      expect(report.output.colors).toBe(1)
      expect(report.output.transparent).toBe(false)
      expect([report.background.applied, report.background.reason]).toEqual([false, 'no subject'])
    })
  }

  it('exact grid with > 32767 unique colours: no wrapped indices, Wu palette, warned', () => {
    const t = performance.now(), { report, indexed } = convert(nn(uniqueColors(200, 200), 2), { targetW: 200, targetH: 200 })
    expect(report.grid.class).toBe('exact')
    expect(report.output.transparent).toBe(false)
    expect(indexed.palette.length / 3).toBeLessThanOrEqual(64)
    expect(report.warnings).toContain('exact art quantized: 40000 unique colors > 256')
    expect(performance.now() - t).toBeLessThan(5000)
  })

  it('exact grid with many unique colours on the reduce path stays small and under 1 s', () => {
    const img = nn(uniqueColors(64, 64), 2), t = performance.now()
    const { report, indexed } = convert(img, { fit: 'stretch', targetW: 32, targetH: 32 })
    expect(report.path).toBe('grid-reduce-k')
    expect(indexed.palette.length / 3).toBeLessThanOrEqual(64)
    expect(performance.now() - t).toBeLessThan(1000)
  })

  it('a requested palette above the 64-entry cap is warned (200 -> at most 64)', () => {
    const { report } = convert(gradient(256, 256), { targetW: 64, targetH: 64, colors: 200 })
    expect(report.warnings).toContain('palette capped at 64 colors (requested 200)')
    expect(report.output.colors).toBeLessThanOrEqual(64)
    expect(report.output.colorsAllowed).toBe(200)
  })

  it('an imported palette is rendered byte-exact', () => {
    const pal = [[255, 0, 0], [0, 128, 255], [17, 34, 51]], keys = new Set(pal.map((c) => c.join()))
    const { image, report } = convert(gradient(128, 128), { targetW: 32, targetH: 32, palette: pal })
    for (let p = 0; p < image.data.length; p += 4) if (image.data[p + 3]) expect(keys.has([image.data[p], image.data[p + 1], image.data[p + 2]].join())).toBe(true)
    expect(report.output.colorsAllowed).toBe(3)
  })
})

describe('convert: background stage (explicit, off by default)', () => {
  const BG = [200, 220, 240], bgLike = (img) => img.data.some((v, i) => i % 4 === 0 && img.data[i + 3] && Math.abs(v - BG[0]) + Math.abs(img.data[i + 1] - BG[1]) + Math.abs(img.data[i + 2] - BG[2]) < 12)
  const SRC = nn(onBg(BLOB, BG, 4), 8), b = bboxCrop(BLOB)

  it('default: off, reported, no transparency invented', () => {
    const { image, report } = convert(SRC, { targetW: BX + 8, targetH: BY + 8 })
    expect(report.background).toMatchObject({ mode: false, applied: false, reason: 'off' })
    expect(report.output.transparent).toBe(false)
    expect(bgLike(image)).toBe(true)
  })

  it("'auto' removes it and reports estimate, removed cells, connectivity and tolerance; trim then crops", () => {
    const { image, report } = convert(SRC, { trim: true, background: 'auto', targetW: b.width, targetH: b.height })
    expect(report.background).toMatchObject({ mode: 'auto', applied: true, reason: null, connectivity: 4, tolerance: 0.03, comparison: '<' })
    expect(report.background.estimate).toEqual([BG])
    expect(report.background.removed).toBeGreaterThan(0)
    expect(same(opaqueRGBA(image), opaqueRGBA(b))).toBe(true)
    expect(report.grid.native).toEqual([b.width, b.height])
    expect(report.grid.nativeFull).toEqual([BX + 8, BY + 8])
  })

  it('explicit key with tolerance and 8-connectivity', () => {
    const { report, image } = convert(SRC, { background: { key: BG, tolerance: 0.01, connectivity: 8 }, targetW: BX + 8, targetH: BY + 8 })
    expect(report.background).toMatchObject({ mode: 'key', applied: true, connectivity: 8, tolerance: 0.01, comparison: '<=', estimate: [BG] })
    expect(bgLike(image)).toBe(false)
  })

  it("'auto' refusal is reported (full-bleed art touches the border)", () => {
    const { report } = convert(noiseArt(40, 40), { background: 'auto', targetW: 40, targetH: 40 })
    expect(report.background.applied).toBe(false)
    expect(report.background.reason).toBeTruthy()
  })

  it('background re-sampled after the trim crop is still removed (lock path)', () => {
    const big = tintRows(nn(onBg(BLOB, BG, 4), 8)) // class grid: exact inputs never lock
    const { image, report } = convert(big, { trim: true, background: 'auto', targetW: b.width + 1, targetH: b.height + 1 })
    expect(report.path).toBe('grid-locked')
    expect(bgLike(image)).toBe(false)
  })

  for (const [n, T, warn] of [[100, 98, 'detail reduced'], [100, 198, 'target exceeds native resolution']]) {
    it(`exact native ${n}² art, target ${T}: resampled, never locked to a fractional period`, () => {
      const { image, report } = convert(noiseArt(n, n), { fit: 'stretch', targetW: T, targetH: T })
      expect(report.grid.class).toBe('exact')
      expect(report.path).toBe('grid-then-resample')
      expect([image.width, image.height]).toEqual([T, T])
      expect(report.warnings).toEqual(expect.arrayContaining([warn, 'non-integer ratio, approximate']))
    })
  }

  it('the trim crop keeps cells.pure: the Clean profile does not re-clean a clean grid (1 px L stroke intact)', () => {
    const art = { ...BLOB, data: Uint8ClampedArray.from(BLOB.data) } // + a 3 px L stroke cleanup would cut
    for (const [x, y] of [[9, 18], [10, 18], [10, 19]]) art.data.set([250, 40, 40, 255], (y * art.width + x) * 4)
    const t = bboxCrop(art), { image, report } = convert(tintRows(nn(art, 8)), { trim: true, cleanup: true, targetW: t.width, targetH: t.height })
    expect(report.grid.class).toBe('grid')
    expect(same(opaqueRGBA(image), opaqueRGBA(t))).toBe(true)
  })
})

describe('convert: Trim after the background stage (degraded sprites with margins)', () => {
  const b = bboxCrop(BLOB)
  // share of cells matching the sprite: same alpha, RGB within 30 (L1) where opaque
  const agree = (a, c) => a.data.filter((v, i) => i % 4 === 3 && (v > 0) === (c.data[i] > 0) && (!v || Math.abs(a.data[i - 3] - c.data[i - 3]) + Math.abs(a.data[i - 2] - c.data[i - 2]) + Math.abs(a.data[i - 1] - c.data[i - 1]) <= 30)).length / (a.width * a.height)

  it('grid route: trim + contain at the native cell count reproduces the full-canvas result (stray bg specks do not widen the box)', () => {
    const { img, truth } = degrade(BLOB, { ...PRESETS['gpt-image-like'], marginFrac: 0.3 }, 2)
    const full = convert(img, { background: 'auto', fit: 'stretch', targetW: truth.cellsX, targetH: truth.cellsY })
    const trim = convert(img, { trim: true, background: 'auto', targetW: b.width, targetH: b.height })
    expect(trim.report.fit.basis).toEqual([b.width, b.height])
    const crop = bboxCrop(full.image)
    expect([crop.width, crop.height]).toEqual([b.width, b.height])
    expect(agree(trim.image, b)).toBeGreaterThanOrEqual(Math.min(0.95, agree(crop, b) - 0.02))
  })

  it('raster route: background removal runs before Trim, so an opaque canvas is trimmed to the subject', () => {
    const W = 400, H = 300, img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 250, y - 120), t = Math.min(1, Math.max(0, (60 - d) / 2)) // smooth disc, r 60, AA edge
      img.data.set([252 - t * 40, 252 - t * 160, 252 - t * 200, 255], (y * W + x) * 4)
    }
    const { report } = convert(img, { trim: true, background: 'auto', route: 'raster', targetW: 24, targetH: 24 })
    const [x0, y0, x1, y1] = report.trim.box
    expect(report.background.applied).toBe(true)
    for (const [v, want] of [[x0, 190], [y0, 60], [x1, 310], [y1, 180]]) expect(Math.abs(v - want)).toBeLessThanOrEqual(8)
  })
})

describe('convert: soft-alpha sprites and gradient backdrops (D49, D50)', () => {
  const ICON = proceduralSprites(1)[2].img

  it("trim basis 'cells': a feathered alpha edge adds no cell row; the default alpha > 0 basis stays and does", () => {
    for (const [sprite, seed] of [[BLOB, 3], [ICON, 4]]) {
      const { img } = degrade(sprite, { ...PRESETS['soft-alpha'], marginFrac: 0.3 }, seed), b = bboxCrop(sprite)
      const def = convert(img, { trim: true, targetW: b.width, targetH: b.height })
      const cells = convert(img, { trim: { basis: 'cells' }, targetW: b.width, targetH: b.height })
      expect(def.report.trim.tau).toBe(0)
      expect(def.report.recipe.options.trim).toEqual({ tau: 0, comparison: '>' })
      expect(def.report.fit.basis[0]).toBeGreaterThan(b.width) // anti-aliased spill widens the alpha > 0 box by whole cells
      expect(cells.report.fit.basis).toEqual([b.width, b.height])
      expect(cells.report.trim.basis).toBe('cells')
      expect(cells.report.recipe.options.trim).toEqual({ basis: 'cells' })
      expect(scoreCase(cells.image, b, {}).emSnap).toBeGreaterThanOrEqual(0.95)
    }
  })

  it("trim basis 'cells' on the raster route uses alpha > 127", () => {
    const { img } = degrade(BLOB, { ...PRESETS['soft-alpha'], marginFrac: 0.3 }, 3)
    const { report } = convert(img, { trim: { basis: 'cells' }, route: 'raster', targetW: 16, targetH: 16 })
    expect(report.trim.tau).toBe(127)
  })

  it("trim basis 'cells' with no opaque cell falls back to alpha > 0 (warned); a truly empty image still throws (D55)", () => {
    // faint sprite: every pixel alpha 100, so Binary(128) sampling leaves no opaque cell and no pixel > 127
    const faint = padded(nn({ ...BLOB, data: BLOB.data.map((v, i) => (i % 4 === 3 && v ? 100 : v)) }, 8), 16, 8, 24, 0), b = bboxCrop(BLOB)
    const box = [16 + b.x0 * 8, 8 + b.y0 * 8, 16 + (b.x0 + b.width) * 8, 8 + (b.y0 + b.height) * 8]
    for (const extra of [{ manualPeriod: [8, 8] }, { route: 'raster' }]) {
      const { report } = convert(faint, { trim: { basis: 'cells' }, targetW: b.width, targetH: b.height, ...extra })
      expect(report.route).toBe(extra.route ?? 'grid')
      expect(report.trim.box).toEqual(box)
      expect(report.trim).toMatchObject({ basis: 'cells', tau: 0, fallback: { basis: 'pixels', tau: 0 } })
      expect(report.warnings.some((w) => w.startsWith("trim basis 'cells' found no "))).toBe(true)
    }
    const empty = { width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) }
    for (const route of ['auto', 'raster']) expect(code(() => convert(empty, { trim: { basis: 'cells' }, route, targetW: 8, targetH: 8 }))).toBe('empty-visible-region')
  })

  it("gradient backdrop: 'auto' removes it as a surface (model reported); off by default", () => {
    const { img, truth } = degrade(BLOB, 'gpt-gradient', 3), o = { fit: 'stretch', targetW: truth.cellsX, targetH: truth.cellsY }
    const r = convert(img, { ...o, background: 'auto' })
    expect(r.report.background.model).toBe('surface')
    expect(r.report.background.applied).toBe(true)
    expect(scoreCase(r.image, truth.sprite, {}).iou).toBeGreaterThanOrEqual(0.99)
    expect(convert(img, o).report.background.applied).toBe(false)
  })

  it('gradient-preset scene (opaque tile): the surface estimate is refused, output unchanged', () => {
    const tile = proceduralSprites(1)[1].img, { img, truth } = degrade(tile, 'gpt-gradient', 3), o = { fit: 'stretch', targetW: truth.cellsX, targetH: truth.cellsY }
    const r = convert(img, { ...o, background: 'auto' })
    expect(r.report.background.applied).toBe(false)
    expect(same(r.image, convert(img, o).image)).toBe(true)
  })
})

describe('convert: smooth-upscale fallback (second-difference lattice)', () => {
  const TILE = proceduralSprites(1)[1].img
  const fell = (r) => r.grid.evidence.some((e) => e.startsWith('smooth-upscale fallback'))
  /** Share of truth pixels whose output has the same opacity and, if opaque, every channel within 12. */
  const within12 = (out, gt) => {
    let ok = 0
    for (let i = 0; i < gt.data.length; i += 4) {
      const o = out.data[i + 3] >= 128, g = gt.data[i + 3] >= 128
      if (o === g && (!g || [0, 1, 2].every((c) => Math.abs(out.data[i + c] - gt.data[i + c]) <= 12))) ok++
    }
    return ok / (gt.data.length / 4)
  }

  it('rampShare: 0 on NN upscales, >= 0.15 on smooth upscales', () => {
    expect(rampShare(nn(TILE, 8))).toBe(0)
    for (const p of ['bilinear-x8', 'bilinear-x8.37', 'bicubic-x8-clean']) expect(rampShare(degrade(TILE, p, 1).img), p).toBeGreaterThanOrEqual(0.15)
  })

  it('bilinear x8 / x8.37 (1:1 heuristic / weak on first differences) re-detect on second differences and round-trip', () => {
    for (const p of ['bilinear-x8', 'bilinear-x8.37']) {
      const { img, truth } = degrade(TILE, p, 1)
      const r = convert(img, { targetW: truth.cellsX, targetH: truth.cellsY, fit: 'stretch' })
      expect(r.report.grid.evidence[0], p).toMatch(/^smooth-upscale fallback: second-difference lattice 20x20 \(ramp share /)
      expect([r.report.grid.class, r.report.path], p).toEqual(['grid', 'grid-locked'])
      expect(within12(r.image, truth.sprite), p).toBeGreaterThanOrEqual(0.95)
    }
  })

  it('a manual period keeps the smooth-upscale path: bilinear x8 with [8, 8] is no worse than auto (D65)', () => {
    for (const s of proceduralSprites(1).filter((s) => ['proc-tile', 'proc-1bit', 'proc-ui'].includes(s.id))) {
      const { img, truth } = degrade(s.img, 'bilinear-x8', 1), o = { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY }
      const auto = convert(img, o), man = convert(img, { ...o, manualPeriod: [8, 8] })
      expect(man.report.grid.evidence.slice(0, 2).join(' | '), s.id).toMatch(/^manual period 8 x 8 \| smooth-upscale fallback: second-difference lattice /)
      expect(within12(man.image, truth.sprite), s.id).toBeGreaterThanOrEqual(within12(auto.image, truth.sprite))
    }
  })

  it('rampShareNoisy separates a noisy smooth upscale (>= 0.45) from gridded GPT-like input (< 0.45) (D57)', () => {
    for (const s of proceduralSprites(1)) for (const seed of [1, 2]) {
      const smooth = degrade(s.img, 'smooth-noisy-bilinear', seed).img
      expect(rampShare(smooth), s.id).toBeLessThan(0.15) // noise breaks the exact-line test
      expect(rampShareNoisy(smooth), s.id).toBeGreaterThanOrEqual(0.45)
      expect(rampShareNoisy(degrade(s.img, 'gpt-image-like', seed).img), s.id).toBeLessThan(0.45)
    }
  })

  it('a noisy smooth x8.3 upscale recovers its true lattice through the noisy-ramp gate (D57)', () => {
    for (const s of proceduralSprites(1).filter((s) => ['proc-blob', 'proc-tile', 'proc-ui'].includes(s.id))) {
      const { img, truth } = degrade(s.img, 'smooth-noisy-bilinear', 1)
      const r = convert(img, { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY })
      expect(r.report.grid.evidence[0], s.id).toMatch(/^smooth-upscale fallback: second-difference lattice \d+x\d+ \(noisy ramp share /)
      expect([r.report.grid.class, String(r.report.grid.suggestedSize)], s.id).toEqual(['grid', `${truth.cellsX},${truth.cellsY}`])
    }
  })

  const deconv = (r) => r.report.grid.evidence.find((e) => e.startsWith('cell deconvolution'))
  const sprite = (id) => proceduralSprites(1).find((s) => s.id === id).img

  it('a Keys-bicubic x8 upscale adopts the Keys cubic kernel below residual 1 and keeps the true colours (D60)', () => {
    for (const id of ['proc-tile', 'proc-1bit', 'proc-ui']) {
      const { img, truth } = degrade(sprite(id), 'bicubic-x8-clean', 1)
      const r = convert(img, { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY })
      const m = deconv(r).match(/^cell deconvolution: Keys cubic A -0\.5 \(residual RMS ([\d.]+)\)$/)
      expect(m, `${id}: ${deconv(r)}`).not.toBeNull()
      expect(Number(m[1]), id).toBeLessThan(1)
      expect(within12(r.image, truth.sprite), id).toBeGreaterThanOrEqual(0.99)
      // no ringing split of 1-bit art (an over-split (a, b) or split-gated palette gave black two shades)
      if (id === 'proc-1bit') expect(indexImage(r.image).lab.length).toBe(2)
    }
  })

  it('bilinear upscales stay on the (a, b) kernel with byte-identical output (D60)', async () => {
    for (const [id, p, want] of [['proc-tile', 'bilinear-x8.37', 'e3e8ab88e3e050bf91c36ed2b68a36cadc04ea448bc04204f4b44494fb6bf8a9'],
      ['proc-ui', 'bilinear-x8', '41f12fb9df0df53b083bd60b25758d4f6356aaf1a19330a4a0f72cd6c546efed']]) {
      const { img, truth } = degrade(sprite(id), p, 1)
      const r = convert(img, { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY })
      expect(deconv(r), id).toMatch(/^cell deconvolution: kernel a 1 b 0 /)
      expect(await canonicalHash(r.image), id).toBe(want) // engine 0.11.0 output
    }
  })

  it('a noisy bicubic upscale does not adopt the Keys kernel (residual >= 1) (D60)', () => {
    for (const id of ['proc-blob', 'proc-tile', 'proc-1bit']) {
      const { img, truth } = degrade(sprite(id), 'smooth-noisy-bicubic', 1)
      const r = convert(img, { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY })
      expect(deconv(r), id).toMatch(/^cell deconvolution: kernel a /)
    }
  })

  it('a smooth no-grid texture keeps its verdict (second differences find no pure grid); NN upscales skip the fallback', () => {
    const tex = noGrid('texture', 1)
    expect(rampShare(tex)).toBeGreaterThanOrEqual(0.15)
    const a = analyze(tex)
    expect(a.grid.class).toBe('none')
    expect(fell(a)).toBe(false)
    const b = analyze(nn(TILE, 8))
    expect([b.grid.class, fell(b)]).toEqual(['exact', false])
  })
})

describe('convertCandidates', () => {
  const ids = (r) => r.candidates.map((c) => c.id)

  it('grid input: grid / clean / smooth from one analysis, a reduction recommends grid (smooth when weak)', () => {
    const { img } = degrade(BLOB, PRESETS['gpt-image-like'], 11), [N, M] = analyze(img).suggestedSize
    const r = convertCandidates(img, { targetW: Math.round(0.7 * N), targetH: Math.round(0.7 * M), fit: 'stretch' })
    expect(ids(r)).toEqual(['grid', 'clean', 'smooth'])
    expect(r.recommended).toBe(r.analysis.grid.class === 'weak' ? 'smooth' : 'grid')
    expect(r.candidates.map((c) => [c.report.route, c.report.cleanup.profile])).toEqual([['grid', null], ['grid', CLEAN_PROFILE], ['raster', null]])
    expect(r.analysis.suggestedSize).toEqual([N, M])
  })

  it('no grid: clean (raster + Clean) and smooth, smooth recommended', () => {
    const r = convertCandidates(gradient(256, 128), { targetW: 32, targetH: 16 })
    expect(ids(r).every((id) => id === 'clean' || id === 'smooth')).toBe(true)
    expect(r.recommended).toBe('smooth')
  })

  it('a manual period on a no-grid scene recommends the grid route, not smooth (D66)', () => {
    for (const img of [gradient(256, 128), noGrid('texture', 1)]) {
      expect(analyze(img).grid.class).toBe('none')
      const r = convertCandidates(img, { targetW: 32, targetH: 16, manualPeriod: [8, 8] })
      expect(['grid', 'clean']).toContain(r.recommended)
      expect(r.recommendation.rule).toBe('manual-grid')
      expect(r.recommendation.evidence).toMatch(/^recommended (grid|clean): your pixel grid \(\d+×\d+\)$/)
      expect(r.candidates.find((c) => c.id === r.recommended).report.route).toBe('grid')
    }
  })

  it('exact input: grid and clean are identical and deduped, grid recommended', () => {
    const r = convertCandidates(nn(BLOB, 8), { targetW: BX, targetH: BY })
    expect(ids(r)[0]).toBe('grid')
    expect(ids(r)).not.toContain('clean')
    expect(r.recommended).toBe('grid')
  })

  describe('recommendation rule', () => {
    const sprite = (id) => proceduralSprites(1).find((s) => s.id === id).img
    const run = (img, T) => convertCandidates(img, { ...CANVAS_OPTS, targetW: T.width, targetH: T.height })
    const em = (r, id, T, truth) => scoreCase(r.candidates.find((c) => c.id === id).image, T, { truth }).emSnap
    const rec = (r) => [r.recommended, r.recommendation.rule]

    it('supersampled non-integer NN with a high ramp share but a confident d1 lattice stays grid', () => {
      const { img, truth } = degrade(sprite('proc-icon'), { ...PRESETS['nonint-nn'], cellSize: 14 }, 1)
      const r = run(img, truth.sprite)
      expect(rampShare(img)).toBeGreaterThanOrEqual(0.3)
      expect(rec(r)).toEqual(['grid', 'grid'])
      expect(em(r, 'grid', truth.sprite, truth)).toBeGreaterThan(em(r, 'smooth', truth.sprite, truth) + 0.5)
    })

    it('a smooth upscale whose d1 lattice is far off the target recommends smooth', () => {
      for (const [id, p, extra, margin] of [['proc-tile', 'bilinear-x8', { cellSize: 3 }, 0.3], ['proc-tile', 'bilinear-x8', { cellSize: 5 }, 0.1]]) {
        const { img, truth } = degrade(sprite(id), { ...PRESETS[p], ...extra }, 1)
        const r = run(img, truth.sprite)
        expect(rec(r), p).toEqual(['smooth', 'smooth-upscale-off-target'])
        expect(em(r, 'smooth', truth.sprite, truth), p).toBeGreaterThan(em(r, 'grid', truth.sprite, truth) + margin)
      }
      const { img, truth } = degrade(sprite('proc-tile'), { ...PRESETS['bilinear-x8'], cellSize: 3 }, 1)
      expect(run(img, truth.sprite).recommendation.evidence).toBe('recommended smooth: smooth-upscale evidence (ramp share 0.71 >= 0.15) and the 10x3 lattice is 6.7x off the 20x20 target')
    })

    it('former off-target cases now resolve in detection (D52): the true d2 lattice, or no grid', () => {
      // proc-ui bicubic x8: count refinement lets the 39 x 27 second-difference lattice replace the 5 x 4 one
      let { img, truth } = degrade(sprite('proc-ui'), PRESETS['bicubic-x8-clean'], 1)
      let r = run(img, truth.sprite)
      expect(r.analysis.suggestedSize).toEqual([39, 27])
      expect(rec(r)).toEqual(['grid', 'grid'])
      expect(em(r, 'grid', truth.sprite, truth)).toBeGreaterThan(em(r, 'smooth', truth.sprite, truth) + 0.1)
      // proc-blob bilinear, 3 px cells: the coarse 3 x 4 lattice fails the edge-support gate
      ;({ img, truth } = degrade(sprite('proc-blob'), { ...PRESETS['bilinear-x8'], cellSize: 3 }, 1))
      r = run(img, truth.sprite)
      expect(r.analysis.grid.class).toBe('none')
      expect(rec(r)).toEqual(['smooth', 'no-grid'])
    })

    it('a light-touch Clean on an AI-like grid is recommended', () => {
      const { img, truth } = degrade(sprite('proc-blob'), PRESETS['fake-alpha'], 9)
      const r = run(img, truth.sprite)
      expect(rec(r)).toEqual(['clean', 'light-touch-clean'])
      expect(r.recommendation.evidence).toBe('recommended clean: light touch (agreement 98.4 % >= 97 %, outline kept 0.23 vs 0.23)')
      expect(em(r, 'clean', truth.sprite, truth)).toBeGreaterThanOrEqual(em(r, 'grid', truth.sprite, truth) - 0.03)
    })

    it('a sprite with fewer than 12 noise-orphan pixels keeps grid although their share is >= 4 % (D63)', () => {
      // proc-sparks jpeg-heavy: 11 of 17 opaque pixels are noise orphans, but grid is exact and Clean loses a spark
      const { img, truth } = degrade(sprite('proc-sparks'), PRESETS['jpeg-heavy'], 10)
      const r = run(img, truth.sprite)
      expect(rec(r)).toEqual(['grid', 'grid'])
      expect(r.recommendation.evidence).toMatch(/; noise orphans 64\.7 % but 11 px < 12\)$/)
      expect(em(r, 'grid', truth.sprite, truth)).toBeGreaterThan(em(r, 'clean', truth.sprite, truth))
    })

    it('a noisy AI-like grid output recommends Clean below 97 % agreement (D55)', () => {
      const { img, truth } = degrade(sprite('proc-icon'), PRESETS['fake-alpha'], 10)
      const r = run(img, truth.sprite)
      expect(rec(r)).toEqual(['clean', 'noisy-grid-clean'])
      expect(r.recommendation.evidence).toBe('recommended clean: noisy grid (noise orphans 28.3 % of opaque >= 4 %, 17 px >= 12, agreement 95 % >= 90 %, outline kept 0.18 vs 0.17)')
      const noise = (id) => q4(indexImage(r.candidates.find((c) => c.id === id).image)).noise
      expect(noise('clean')).toBeLessThan(noise('grid'))
      expect(em(r, 'clean', truth.sprite, truth)).toBeGreaterThanOrEqual(em(r, 'grid', truth.sprite, truth) - 0.03)
    })

    it('textured art (sub-cell noise on a 2x native) declines Clean', () => {
      const T = sprite('proc-icon'), k = 2, pad = 3, w = T.width + 2 * pad, h = T.height + 2 * pad
      const N = { width: w * k, height: h * k, data: new Uint8ClampedArray(w * h * k * k * 4) }
      for (let y = 0; y < T.height * k; y++) for (let x = 0; x < T.width * k; x++) {
        const q = (((y / k) | 0) * T.width + ((x / k) | 0)) * 4, o = ((y + pad * k) * N.width + x + pad * k) * 4
        const f = 0.85 + 0.3 * (((Math.imul((x * 73856093) ^ (y * 19349663), 2654435761) >>> 0) % 1000) / 1000)
        for (let c = 0; c < 3; c++) N.data[o + c] = Math.min(255, Math.round(T.data[q + c] * f))
        N.data[o + 3] = T.data[q + 3]
      }
      const { img } = degrade(N, { ...PRESETS['gpt-image-like'], marginFrac: 0, cellSize: [4, 6.5] }, 1)
      const r = run(img, { width: w, height: h })
      expect(rec(r)).toEqual(['grid', 'grid']) // agreement below the D55 noise gate's 90 %
      expect(r.recommendation.evidence).toMatch(/^recommended grid: Clean declined \(agreement [\d.]+ % < 97 %\)$/)
    })

    it('a rule id deduped into an earlier candidate resolves to the survivor (no-grid gradient seed 2)', () => {
      const img = noGrid('gradient', 2)
      const r = convertCandidates(img, { ...CANVAS_OPTS, background: false, targetW: 48, targetH: Math.max(1, Math.round((48 * img.height) / img.width)) })
      expect(r.alias.smooth).toBe('clean')
      expect([r.recommended, r.recommendation.id, r.recommendation.rule]).toEqual(['clean', 'clean', 'no-grid'])
      expect(r.recommendation.evidence).toMatch(/^recommended smooth: grid class \w+ \(identical output: clean\)$/)
    })

    it('is deterministic on a repeat run', () => {
      const { img, truth } = degrade(sprite('proc-blob'), PRESETS['fake-alpha'], 9)
      expect(run(img, truth.sprite).recommendation).toEqual(run(img, truth.sprite).recommendation)
    })
  })

  it('target == source: the identity is offered first and recommended', () => {
    const r = convertCandidates(BLOB, { targetW: BX, targetH: BY })
    expect(ids(r)[0]).toBe('original')
    expect(r.recommended).toBe('original')
    expect(same(r.candidates[0].image, BLOB)).toBe(true)
  })
})

describe('indexedToImage', () => {
  it('renders palette colours with binary alpha', () => {
    const img = indexedToImage({ w: 2, h: 1, index: Int16Array.from([0, -1]), palette: Float32Array.from([1, 0, 0]) })
    expect(Array.from(img.data)).toEqual([255, 255, 255, 255, 0, 0, 0, 0])
  })
  it('prefers the exact RGB8 palette', () => {
    const img = indexedToImage({ w: 1, h: 1, index: Int16Array.from([0]), palette: Float32Array.from([1, 0, 0]), rgb: Uint8Array.from([1, 2, 3]) })
    expect(Array.from(img.data)).toEqual([1, 2, 3, 255])
  })
})

const ONI = repoPath('.local/samples/gpt-oni.png')
describe('convert: real sample (skipped when absent)', () => {
  it.skipIf(!existsSync(ONI))('gpt-oni at its suggested size converts on the grid route in under 2 s', () => {
    const img = readPng(ONI), [N, M] = analyze(img).suggestedSize, t = performance.now()
    const { image, report } = convert(img, { targetW: N, targetH: M }), ms = performance.now() - t
    console.log(`convert gpt-oni 1254^2: ${ms.toFixed(0)} ms`, JSON.stringify(report.timingsMs, (k, v) => (typeof v === 'number' ? Math.round(v) : v)))
    expect(report.route).toBe('grid')
    expect(binaryAlpha(image)).toBe(true)
    expect(ms).toBeLessThan(2000)
  })
})

describe('octave lock to the target (N ≈ T/2)', () => {
  // A sprite drawn with 2-px structure (NN x2) is often detected at half the requested cell count.
  const sprites = proceduralSprites(1)
  const ICON2 = nn(sprites[2].img, 2), BLOB2 = nn(sprites[0].img, 2), TILE = sprites[1].img
  const exactShare = (out, ref) => { // share of truth-opaque pixels whose RGB matches exactly
    let n = 0, ok = 0
    for (let p = 0; p < ref.width * ref.height; p++) {
      if (ref.data[p * 4 + 3] < 128) continue
      n++
      if (out.data[p * 4 + 3] >= 128 && [0, 1, 2].every((c) => out.data[p * 4 + c] === ref.data[p * 4 + c])) ok++
    }
    return ok / n
  }
  for (const [name, sprite] of [['proc-icon x2', ICON2], ['proc-blob x2', BLOB2]]) {
    it(`${name} under nonint-nn locks to the full target and recovers the sprite`, () => {
      const { img, truth } = degrade(sprite, PRESETS['nonint-nn'], 1)
      const { image, report } = convert(img, { targetW: truth.cellsX, targetH: truth.cellsY, fit: 'stretch' })
      expect(report.path).toBe('grid-locked')
      expect(report.grid.evidence.some((e) => e.startsWith('octave lock:'))).toBe(true)
      expect(exactShare(image, truth.sprite)).toBeGreaterThanOrEqual(0.99)
    })
  }
  it('a true N grid asked for 2N stays an integer upscale (guard)', () => {
    const { img, truth } = degrade(TILE, PRESETS['nonint-nn'], 1)
    const { report } = convert(img, { targetW: 2 * truth.cellsX, targetH: 2 * truth.cellsY, fit: 'stretch' })
    expect(report.path).toBe('grid-upscale-k')
    expect(report.grid.evidence.some((e) => e.startsWith('octave lock:'))).toBe(false)
  })
})

describe('Clean accent keep (D58)', () => {
  const t = new Float64Array(3)
  const L = (im, x, y) => { const o = (y * im.width + x) * 4; if (im.data[o + 3] < 128) return null; srgbToOklab(im.data[o], im.data[o + 1], im.data[o + 2], t, 0); return t[0] }
  // visible eye: opaque and >= 0.1 lighter (OKLab L) than each opaque 4-neighbour
  const eye = (im, x, y) => { const v = L(im, x, y); return v != null && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => { const u = L(im, x + dx, y + dy); return u == null || u <= v - 0.1 }) }
  // proc-blob 1-px left eye at sprite (9, 14); cases where cleanup off shows it and engine 0.10.1 Clean removed it,
  // then low-contrast eyes (OKLab L 0.10-0.15 above each neighbour) that ACCENT_L 0.15 still removed (D63)
  for (const [seed, preset] of [[1, 'gemini-like'], [2, 'gpt-image-like'], [5, 'smooth-noisy-bilinear'], [36, 'gemini-like'], [15, 'drift-heavy'], [17, 'mixel-detail']]) {
    it(`a 1-px eye inside the sprite survives Clean on the raster route (proc-blob seed ${seed}, ${preset})`, () => {
      const { img, truth } = degrade(proceduralSprites(seed)[0].img, preset, seed), { x: mx, y: my } = truth.spriteRect
      const o = { ...CANVAS_OPTS, targetW: truth.cellsX, targetH: truth.cellsY, route: 'raster' }
      expect(eye(convert(img, o).image, mx + 9, my + 14)).toBe(true)
      expect(eye(convert(img, { ...o, cleanup: true }).image, mx + 9, my + 14)).toBe(true)
    })
  }
})
