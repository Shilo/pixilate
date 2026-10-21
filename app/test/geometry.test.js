import { describe, expect, test } from 'vitest'
import { convertCandidates } from '$engine/core/pipeline.js'
import { beforeRect, countColours, exportScales, fitZoom, upscale } from '../src/lib/geometry.js'

// 16 x 16 cells at 8 px (128 x 128): a 2-colour cell checker in cells 4..11, transparent around it.
function sprite() {
  const W = 128, data = new Uint8ClampedArray(W * W * 4)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const cx = x >> 3, cy = y >> 3, o = (y * W + x) * 4
    if (cx < 4 || cx > 11 || cy < 4 || cy > 11) continue
    const on = (cx + cy) % 2 === 0
    data.set(on ? [220, 60, 40, 255] : [30, 40, 90, 255], o)
  }
  return { width: W, height: W, data }
}
// 100 x 80 per-pixel noise (no grid) in [20, 80) x [10, 70), transparent around it.
function noise() {
  const W = 100, H = 80, data = new Uint8ClampedArray(W * H * 4)
  let s = 7
  for (let y = 10; y < 70; y++) for (let x = 20; x < 80; x++) {
    const o = (y * W + x) * 4
    for (let c = 0; c < 3; c++) { s = (s * 1103515245 + 12345) >>> 0; data[o + c] = s >>> 24 }
    data[o + 3] = 255
  }
  return { width: W, height: H, data }
}
const IMG = sprite(), NOISE = noise()
const run = (opts, id = 'grid', img = IMG) => {
  const r = convertCandidates(img, { fit: 'contain', trim: false, background: false, colors: 'auto', ...opts })
  return r.candidates.find((c) => c.id === r.alias[id]).report
}
const rect = (opts, id) => beforeRect(run(opts, id), 128, 128)

describe('beforeRect', () => {
  test('exact grid: the whole lattice onto the whole output', () => {
    const r = run({ targetW: 16, targetH: 16 })
    expect(r.route).toBe('grid')
    expect(beforeRect(r, 128, 128)).toEqual({ src: [0, 0, 128, 128], dst: [0, 0, 16, 16] })
  })
  test('trim with basis cells: the sprite cells only', () => {
    expect(rect({ targetW: 8, targetH: 8, trim: { basis: 'cells' } })).toEqual({ src: [32, 32, 96, 96], dst: [0, 0, 8, 8] })
  })
  test('Fill crop on the grid route', () => {
    expect(rect({ targetW: 16, targetH: 8, fit: 'cover' })).toEqual({ src: [0, 32, 128, 96], dst: [0, 0, 16, 8] })
  })
  test('Fill crop on the raster route', () => {
    const r = run({ targetW: 20, targetH: 20, fit: 'cover' }, 'smooth', NOISE)
    expect(r.route).toBe('raster')
    expect(beforeRect(r, 100, 80)).toEqual({ src: [10, 0, 90, 80], dst: [0, 0, 20, 20] })
  })
  test('trim plus Fill on the raster route offsets the crop by the trim box', () => {
    const r = run({ targetW: 20, targetH: 10, fit: 'cover', trim: { basis: 'cells' } }, 'smooth', NOISE)
    expect(r.route).toBe('raster')
    expect(r.trim.box).toEqual([20, 10, 80, 70])
    expect(beforeRect(r, 100, 80)).toEqual({ src: [20, 25, 80, 55], dst: [0, 0, 20, 10] })
  })
  test('Stretch maps the whole source onto the whole output', () => {
    expect(rect({ targetW: 16, targetH: 8, fit: 'stretch' })).toEqual({ src: [0, 0, 128, 128], dst: [0, 0, 16, 8] })
  })
  test('Fit pads: dst is the placed box', () => {
    expect(rect({ targetW: 16, targetH: 8 })).toEqual({ src: [0, 0, 128, 128], dst: [4, 0, 8, 8] })
  })
})

describe('fitZoom counts device pixels', () => {
  const stage = { width: 400, height: 300 }
  test.each([[1, 9], [1.25, 11], [2, 18]])('dpr %s', (dpr, z) => expect(fitZoom(stage, 32, 32, dpr)).toBe(z))
  test('shrinks below 1 and caps at 64', () => {
    expect(fitZoom({ width: 100, height: 100 }, 1024, 1024, 1)).toBeCloseTo(100 / 1024)
    expect(fitZoom({ width: 4000, height: 4000 }, 4, 4, 2)).toBe(64)
  })
})

test('export scales stay within 4096', () => {
  expect(exportScales(32, 32)).toEqual([1, 2, 4, 8, 16])
  expect(exportScales(300, 200)).toEqual([1, 2, 4, 8])
  expect(exportScales(1024, 1024)).toEqual([1, 2, 4])
})

test('upscale is nearest neighbour', () => {
  const px = Uint8ClampedArray.from([1, 2, 3, 4, 5, 6, 7, 8])
  expect(Array.from(upscale(px, 2, 1, 2))).toEqual([1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 5, 6, 7, 8])
})

test('countColours counts distinct visible colours only', () => {
  expect(countColours(Uint8ClampedArray.from([1, 2, 3, 255, 1, 2, 3, 255, 9, 9, 9, 0, 4, 5, 6, 255]))).toBe(2)
})
