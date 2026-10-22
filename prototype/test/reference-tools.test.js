// Sanity checks for the competitor reference re-implementations (test/reference-tools.js): each either
// reproduces a clean integer nearest-neighbour upscale exactly or the test documents why not, and the
// Pixel Snapper reference reproduces the spike's dated live probes. Not quality evidence.
import { describe, it, expect } from 'vitest'
import { pixelSnapper, pixelDetector, unfake, retroDiffusion, pixelOE, area, nearest, adapt, realPixelArt, realPixelArtTarget, properPixelArt, fastPixelizer, breakfastz, pixelRefiner, quantize } from './reference-tools.js'
import { degrade, noGrid, PRESETS } from './synth.js'
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

describe('Retro Diffusion reference (ef376e57, writeup 2026-10-21 reading)', () => {
  const up = (img, k) => mk(Math.round(img.width * k), Math.round(img.height * k), (x, y) => { const o = (Math.min(img.height - 1, Math.floor(y / k)) * img.width + Math.min(img.width - 1, Math.floor(x / k))) * 4; return img.data.subarray(o, o + 4) })
  for (const k of [5.5, 6.37]) it(`recovers fractional NN upscales of proc-blob and proc-1bit x${k} (R1: sub-pixel periods)`, () => {
    for (const id of ['proc-blob', 'proc-1bit']) { const s = sprite(id); expect(retroDiffusion(up(s, k)).native).toEqual([s.width, s.height]) }
  })
  it('accepts a clean x8 upscale by Stage 1 consensus: the three cheap voters or a 3-of-4 group with the fused curve (R5)', () => {
    const r = retroDiffusion(nnUp(sprite('proc-blob'), 8))
    expect(['fast', 'supermajority']).toContain(r.info.route)
    for (const ax of ['x', 'y']) expect(r.info.votes[ax].fu).toBeCloseTo(8, 1)
  })
  it('reports the run-length comb height on the cosine scale [-1, 1] (R3)', () => {
    for (const img of [nnUp(sprite('proc-tile'), 8), noGrid('shapes', 1)]) for (const S of retroDiffusion(img).info.S) if (S !== null) { expect(S).toBeGreaterThanOrEqual(-1); expect(S).toBeLessThanOrEqual(1) }
  })
  it('manual pixel size skips detection: cols = round(w / step), rows = round(h / step) (R10)', () => {
    const s = sprite('proc-ui'), r = retroDiffusion(nnUp(s, 8), { manualStep: 8 })
    expect(r.info.route).toBe('manual')
    expect(same(r.image, s)).toBe(true)
    expect(retroDiffusion(nnUp(s, 8), { manualStep: 8.5 }).native).toEqual([Math.round((s.width * 8) / 8.5), Math.round((s.height * 8) / 8.5)])
  })
  it('structure K is the 4-bit colour complexity clamped to [16, 48] (R9)', () => {
    expect(retroDiffusion(nnUp(sprite('proc-1bit'), 8)).info.K).toBe(16)
    expect(retroDiffusion(noGrid('shapes', 1)).info.K).toBeLessThanOrEqual(48)
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

describe('round-3 references (Real-PixelArt, proper-pixel-art, fast-pixelizer, breakfastz, PixelRefiner)', () => {
  const NEW = { realPixelArt, properPixelArt, fastPixelizer, breakfastz, pixelRefiner }
  for (const id of ['proc-blob', 'proc-icon']) for (const k of [4, 8]) {
    const s = sprite(id), img = nnUp(s, k)
    for (const [n, f] of Object.entries(NEW)) it(`${n} recovers ${id} x${k} exactly`, () => expect(same(f(img).image, s)).toBe(true))
    it(`realPixelArtTarget recovers ${id} x${k} exactly at the true size`, () => expect(same(realPixelArtTarget(img, s.width, s.height), s)).toBe(true))
  }
  it('Real-PixelArt fixed size hits W x H by construction on a degraded GPT-like input', () => {
    const { img, truth } = degrade(sprite('proc-tile'), PRESETS['gpt-image-like'], 11), T = truth.sprite, out = realPixelArtTarget(img, T.width, T.height)
    expect([out.width, out.height]).toEqual([T.width, T.height])
  })
  it('Real-PixelArt returns the input size (no grid) on a plain bilinear x8 upscale: chance-corrected support stays low', () => {
    const img = degrade(sprite('proc-tile'), PRESETS['bilinear-x8'], 1).img
    expect(realPixelArt(img).native).toEqual([img.width, img.height])
  })
  it('fast-pixelizer bypasses (returns the source) on a <= 1024-colour, <= 256 px input without a uniform run grid', () => {
    const img = degrade(sprite('proc-tile'), PRESETS['nonint-nn'], 1000 + 1).img
    if (Math.min(img.width, img.height) <= 256) expect(fastPixelizer(img).info.path).toBe('native-bypass')
  })
  it('PixelRefiner reference picks a 2x coarse grid on proc-1bit x8: the documented area term outweighs reconstruction', () => {
    // pair score = recon * 255 + 2 sqrt(outW outH) - 12 (sx + sy): halving the count saves ~24 points while the
    // reconstruction error grows by < 0.1; the harmonic penalty (+14) does not close the gap. Reading, not a bug here.
    const s = sprite('proc-1bit')
    expect(pixelRefiner(nnUp(s, 8)).native).not.toEqual([s.width, s.height])
  })
  it('breakfastz manual width keeps W and derives rows from the cell size', () => {
    const s = sprite('proc-ui'), r = breakfastz(nnUp(s, 8), { manualWidth: s.width })
    expect(r.native).toEqual([s.width, s.height])
  })
  it('every round-3 reference is repeatable, and the shared common-cap quantizer is deterministic and caps K', () => {
    const img = degrade(sprite('proc-blob'), PRESETS['gpt-image-like'], 5).img
    for (const f of Object.values(NEW)) expect(same(f(img).image, f(img).image)).toBe(true)
    expect(same(realPixelArtTarget(img, 24, 28), realPixelArtTarget(img, 24, 28))).toBe(true)
    const q = quantize(area(img, 24, 28), 8).image, cols = new Set()
    for (let p = 0; p < q.width * q.height; p++) if (q.data[p * 4 + 3]) cols.add(q.data.slice(p * 4, p * 4 + 3).join())
    expect(cols.size).toBeLessThanOrEqual(8)
    expect(same(q, quantize(area(img, 24, 28), 8).image)).toBe(true)
  }, 60000)
  it('no round-3 reference throws on a no-grid scene', () => {
    const img = noGrid('shapes', 1)
    for (const f of Object.values(NEW)) expect(() => f(img)).not.toThrow()
  }, 60000)
})
