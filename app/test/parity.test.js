// Determinism: what the app's worker produces equals a direct engine call, byte for byte (canonical hash),
// on committed procedural fixtures only. Also: the 1x PNG decodes to the candidate's RGBA, and the xN export
// decodes to the nearest-neighbour upscale.
import { describe, expect, test } from 'vitest'
import { canonicalHash, convert, convertCandidates } from '$engine/core/pipeline.js'
import { decodeImage, encodePng } from '$engine/decode.js'
import { committedCases, bboxCrop } from '../../prototype/test/fixtures.js'
import { degrade, noGrid } from '../../prototype/test/synth.js'
import { createJobs } from '../src/lib/jobs.js'
import { DEFAULT_TOOLS, manualPeriodOf, toEngineOpts } from '../src/lib/opts.js'
import { upscale } from '../src/lib/geometry.js'

const cases = committedCases()
const pick = (group, spriteId) => cases.find((c) => c.group === group && (!spriteId || c.spriteId === spriteId))
const PICKS = [
  [pick('clean-nn-integer', 'proc-blob'), DEFAULT_TOOLS],
  [pick('gpt-image-like', 'proc-icon'), DEFAULT_TOOLS],
  [pick('nonint-nn', 'proc-tile'), { ...DEFAULT_TOOLS, colors: 8 }],
  [pick('trim-subject', 'proc-blob'), { background: true, trim: true, colors: 'auto' }],
  [pick('bilinear-x8', 'proc-tile'), DEFAULT_TOOLS],
  [pick('no-grid/gradient'), DEFAULT_TOOLS],
]

function input(c) {
  if (c.scene) {
    const img = noGrid(c.scene, c.seed)
    return { img, w: 48, h: Math.max(1, Math.round((48 * img.height) / img.width)) }
  }
  const { img, truth } = degrade(c.sprite, c.params, c.seed)
  const T = c.opts.trim ? bboxCrop(c.sprite) : truth.sprite
  return { img, w: T.width, h: T.height }
}

// Runs the worker handler in-process; resolves with its reply.
const ask = (handle, msg) => new Promise((resolve) => handle(msg, resolve))

describe('worker output equals the engine', () => {
  test.each(PICKS.map(([c, tools]) => [c.id, c, tools]))('%s', async (_, c, tools) => {
    const { img, w, h } = input(c)
    const bytes = encodePng(img).slice()
    const opts = toEngineOpts({ w, h, fit: c.opts.fit ?? 'contain' }, tools)

    const handle = createJobs()
    const a = await ask(handle, { type: 'open', jobId: 1, bytes: bytes.slice().buffer, mime: 'image/png', analyze: true })
    expect(a.type).toBe('analysis')
    const r = await ask(handle, { type: 'convert', jobId: 2, opts })
    expect(r.type).toBe('result')

    const u8 = new Uint8Array(bytes)
    const { format, decode, strict, orientation, warnings } = await decodeImage(u8, 'image/png')
    const direct = convertCandidates(img, { ...opts, format, decode, strict, orientation, warnings }, u8)
    expect(r.candidates.map((x) => x.id)).toEqual(direct.candidates.map((x) => x.id))
    expect(r.recommended).toBe(direct.recommended)
    for (const [i, x] of r.candidates.entries()) {
      expect(x.hash).toBe(await canonicalHash(direct.candidates[i].image))
      expect(await canonicalHash({ width: x.width, height: x.height, data: x.rgba })).toBe(x.hash)
      const png = await decodeImage(x.png, 'image/png')
      expect(Buffer.from(png.img.data).equals(Buffer.from(x.rgba))).toBe(true)
    }
  }, 60000)
})

test('the xN export decodes to the nearest-neighbour upscale', async () => {
  const [c] = PICKS[0]
  const { img, w, h } = input(c)
  const handle = createJobs()
  handle({ type: 'open', jobId: 1, bytes: encodePng(img).slice().buffer, mime: 'image/png', analyze: false }, () => {}) // no reply without analyze
  const r = await ask(handle, { type: 'convert', jobId: 2, opts: toEngineOpts({ w, h, fit: 'stretch' }) })
  const x = r.candidates[0]
  const e = await ask(createJobs(), { type: 'export', jobId: 3, rgba: x.rgba, width: x.width, height: x.height, scale: 4 })
  const png = await decodeImage(e.png, 'image/png')
  expect([png.img.width, png.img.height]).toEqual([x.width * 4, x.height * 4])
  expect(Buffer.from(png.img.data).equals(Buffer.from(upscale(x.rgba, x.width, x.height, 4)))).toBe(true)
}, 60000)

test('decode errors carry the app codes', async () => {
  const handle = createJobs()
  const txt = new TextEncoder().encode('not an image at all').buffer
  expect(await ask(handle, { type: 'open', jobId: 1, bytes: txt, mime: 'image/png', analyze: true })).toMatchObject({ type: 'error', code: 'decode-unsupported' })
  // a PNG signature + IHDR claiming 4097 x 4097: refused before inflating
  const big = new Uint8Array(33)
  big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x10, 0x01, 0, 0, 0x10, 0x01, 8, 6, 0, 0, 0])
  expect(await ask(handle, { type: 'open', jobId: 2, bytes: big.buffer, mime: 'image/png', analyze: true })).toMatchObject({ type: 'error', code: 'decode-too-large' })
  const broken = new Uint8Array(40); broken.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(await ask(handle, { type: 'open', jobId: 3, bytes: broken.buffer, mime: 'image/png', analyze: true })).toMatchObject({ type: 'error', code: 'decode-damaged' })
})

test('a grid override gives the engine output for the same manualPeriod', async () => {
  const c = pick('gpt-image-like', 'proc-blob')
  const { img, truth } = degrade(c.sprite, c.params, c.seed)
  const grid = { cols: truth.cellsX, rows: truth.cellsY }, period = manualPeriodOf(grid, img.width, img.height)
  const opts = toEngineOpts({ w: grid.cols, h: grid.rows }, DEFAULT_TOOLS, false, period)
  const bytes = encodePng(img).slice(), u8 = new Uint8Array(bytes)
  const handle = createJobs()
  handle({ type: 'open', jobId: 1, bytes: bytes.slice().buffer, mime: 'image/png', analyze: false }, () => {})
  const r = await ask(handle, { type: 'convert', jobId: 2, opts })
  expect(r.type).toBe('result')
  const { format, decode, strict, orientation, warnings } = await decodeImage(u8, 'image/png')
  const meta = { format, decode, strict, orientation, warnings }
  const direct = convertCandidates(img, { ...opts, ...meta }, u8)
  expect(r.candidates.map((x) => x.hash)).toEqual(await Promise.all(direct.candidates.map((x) => canonicalHash(x.image))))
  expect(r.candidates[0].report.recipe.options.manualPeriod).toEqual(period)
  // the grid candidate is exactly engine convert() on the grid route with the same manualPeriod
  const g = r.candidates.find((x) => x.id === r.alias.grid)
  const one = convert(img, { ...opts, ...meta, route: 'grid', cleanup: false }, u8)
  expect(g.hash).toBe(await canonicalHash(one.image))
}, 60000)
