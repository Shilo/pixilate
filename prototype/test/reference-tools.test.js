// Sanity checks for the competitor reference re-implementations (test/reference-tools.js): each either
// reproduces a clean integer nearest-neighbour upscale exactly or the test documents why not, and the
// Pixel Snapper reference reproduces the spike's dated live probes. Not quality evidence.
import { describe, it, expect } from 'vitest'
import { pixelSnapper, pixelDetector, unfake, retroDiffusion, pixelOE, area, nearest, adapt } from './reference-tools.js'
import { proceduralSprites } from './fixtures.js'
import { mulberry32 } from './synth.js'

const mk = (w, h, f) => {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(f(x, y), (y * w + x) * 4)
  return { width: w, height: h, data: d }
}
const nnUp = (img, k) => mk(img.width * k, img.height * k, (x, y) => img.data.subarray(((((y / k) | 0) * img.width) + ((x / k) | 0)) * 4, ((((y / k) | 0) * img.width) + ((x / k) | 0)) * 4 + 4))
const checker = (n, kx, ky) => mk(n * kx, n * ky, (x, y) => { const v = (((x / kx) | 0) + ((y / ky) | 0)) & 1 ? 255 : 0; return [v, v, v, 255] })
const sprite = (id) => proceduralSprites(1).find((s) => s.id === id).img
const same = (a, b) => a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i])

describe('Pixel Snapper reference (ae20461f)', () => {
  it('reproduces the spike live-probe sizes (2026-07-31)', () => {
    expect(pixelSnapper(checker(8, 8, 8)).native).toEqual([57, 57])
    expect(pixelSnapper(checker(8, 4, 4)).native).toEqual([25, 25])
    expect(pixelSnapper(checker(16, 8, 4)).native).toEqual([113, 49])
    expect(pixelSnapper(mk(64, 64, () => [128, 128, 128, 255])).native).toEqual([64, 64])
  })
  it('does not recover a clean 8x NN upscale: documented hard-edge plateau failure (spike §3)', () => {
    // A hard edge gives two equal centred-derivative samples; strict maxima reject both, so the step falls
    // back to min(w,h)/64 and the walker over-segments. This is the documented behaviour, not a bug here.
    const s = sprite('proc-tile')
    expect(pixelSnapper(nnUp(s, 8)).native).not.toEqual([s.width, s.height])
  })
})

describe('clean integer NN upscale recovery', () => {
  for (const id of ['proc-tile', 'proc-1bit']) {
    const s = sprite(id), img = nnUp(s, 8)
    it(`pixeldetector recovers ${id} x8 exactly (opaque input; alpha is discarded by design)`, () => expect(same(pixelDetector(img).image, s)).toBe(true))
    it(`Retro Diffusion reference recovers ${id} x8 exactly`, () => expect(same(retroDiffusion(img).image, s)).toBe(true))
    it(`PixelOE reference at the true size recovers ${id} x8 exactly`, () => expect(same(pixelOE(img, s.width, s.height), s)).toBe(true))
    it(`area and nearest baselines recover ${id} x8 exactly`, () => {
      expect(same(area(img, s.width, s.height), s)).toBe(true)
      expect(same(nearest(img, s.width, s.height), s)).toBe(true)
    })
  }
  it('unfake reference recovers the spike U-01 shape (13x11, four colours + transparency, x8) exactly', () => {
    const r = mulberry32(7), cols = [[200, 40, 40], [40, 200, 60], [30, 30, 40], [230, 220, 90]]
    const src = mk(13, 11, () => { const v = r(); return v < 0.2 ? [0, 0, 0, 0] : [...cols[Math.floor(v * 4) % 4], 255] })
    const out = unfake(nnUp(src, 8))
    expect(out.info.scale).toBe(8)
    expect(same(out.image, src)).toBe(true)
  })
  it('unfake reference cannot see an 8 px period on a canvas under ~80 px: documented autocorrelation lag cap', () => {
    // Tiles under 50 px fall back to the central 75 % region and lags stop at min(n/8, 128): a 64 px canvas
    // allows lag 6 at most; proc-tile x8 (160 px) gives 64 px tiles, lag 8, just enough.
    expect(unfake(checker(8, 8, 8)).native).not.toEqual([8, 8])
    const s = sprite('proc-tile')
    expect(unfake(nnUp(s, 8)).native).toEqual([s.width, s.height])
  })
})

describe('determinism and adapter', () => {
  it('every reference is repeatable on the same input', () => {
    const img = nnUp(sprite('proc-blob'), 8)
    for (const f of [pixelSnapper, pixelDetector, unfake, retroDiffusion]) expect(same(f(img).image, f(img).image)).toBe(true)
    expect(same(pixelOE(img, 24, 28), pixelOE(img, 24, 28))).toBe(true)
  })
  it('adapt is the identity at the native size and a centre sample otherwise', () => {
    const s = sprite('proc-icon')
    expect(adapt(s, s.width, s.height)).toBe(s)
    expect(same(adapt(nnUp(s, 3), s.width, s.height), s)).toBe(true)
  })
})
