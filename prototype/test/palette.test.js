import { describe, expect, it } from 'vitest'
import { buildPalette } from '../src/lib/core/palette.ts'
import { oklabToSrgb, srgbToOklab } from '../src/lib/core/color.ts'
import { sampleCells } from '../src/lib/core/sample.ts'

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
const PAL = [[24, 20, 37], [29, 43, 83], [126, 37, 83], [0, 135, 81], [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232], [255, 0, 77], [255, 163, 0], [41, 173, 255], [255, 119, 168]]
const LAB = PAL.map((c) => { const t = new Float64Array(3); srgbToOklab(...c, t, 0); return t })

/** w x h cells drawn from `colors` (OKLab triplets) with ±noise per channel; `pick(i)` selects the color. */
function cells(w, h, colors, pick, noise = 0.01, seed = 1) {
  const r = rng(seed), n = w * h, lab = new Float32Array(n * 3), alpha = new Uint8Array(n).fill(255)
  for (let c = 0; c < n; c++) {
    const k = pick(c, r)
    if (k < 0) { alpha[c] = 0; continue }
    for (let a = 0; a < 3; a++) lab[c * 3 + a] = colors[k][a] + (r() * 2 - 1) * noise
  }
  return { w, h, lab, alpha, dominance: new Float32Array(n).fill(1) }
}

const count = (ix) => ix.palette.length / 3

describe('buildPalette', () => {
  // D48: deconvolved smooth-upscale cells (kernelRms < 1) keep separable close colours apart
  it('kernelRms: two tight regions 0.025 apart stay separate (merged without it, or with a poor kernel)', () => {
    const c = cells(16, 16, [[0.6, 0, 0], [0.6, 0.025, 0]], (i) => ((i % 16) < 8 ? 0 : 1), 0.002)
    expect(count(buildPalette(c))).toBe(1)
    expect(count(buildPalette(c, { kernelRms: 2 }))).toBe(1)
    const ix = buildPalette(c, { kernelRms: 0.3 })
    expect(count(ix)).toBe(2)
    expect(ix.index[0]).not.toBe(ix.index[15])
  })

  it('kernelRms: a touching sliver (< 10 cells) within 0.03 and a split continuum still merge', () => {
    const sliver = cells(16, 16, [[0.6, 0, 0], [0.6, 0.02, 0]], (i) => (i === 120 || i === 121 || i === 122 ? 1 : 0), 0.002)
    expect(count(buildPalette(sliver, { kernelRms: 0.3 }))).toBe(1)
    const ramp = cells(16, 16, [[0.6, 0, 0]], () => 0, 0)
    const r = rng(7)
    for (let i = 0; i < 256; i++) ramp.lab[i * 3 + 1] = r() * 0.04 // one colour smeared along a: no gap
    expect(count(buildPalette(ramp, { kernelRms: 0.3 }))).toBe(1)
  })

  it('auto K finds 12 ± 1 colors in a noisy 12-color sprite', () => {
    const c = cells(32, 32, LAB, (i, r) => (r() * 12) | 0)
    const ix = buildPalette(c, { colors: 'auto' })
    expect(Math.abs(count(ix) - 12)).toBeLessThanOrEqual(1)
  })

  it('palette entries are colors that exist in the cells (medoids)', () => {
    const c = cells(16, 16, LAB, (i, r) => (r() * 12) | 0)
    const ix = buildPalette(c)
    for (let k = 0; k < count(ix); k++) {
      let found = false
      for (let i = 0; i < 256 && !found; i++) found = [0, 1, 2].every((a) => c.lab[i * 3 + a] === ix.palette[k * 3 + a])
      expect(found).toBe(true)
    }
  })

  it('transparent cells get -1; numeric colors caps K; a far glint cluster survives the cap', () => {
    // 3 close-ish body tones (pairwise > 0.045), a far white glint used by 2 cells, and transparency
    const tones = [[0.5, 0.05, 0.02], [0.58, 0.05, 0.02], [0.66, 0.05, 0.02], [0.99, 0, 0]]
    const c = cells(16, 16, tones, (i) => (i < 16 ? -1 : i === 100 || i === 101 ? 3 : i % 3), 0.002)
    const ix = buildPalette(c, { colors: 2 })
    expect(count(ix)).toBe(2)
    expect(ix.index[0]).toBe(-1)
    expect(ix.palette[ix.index[100] * 3]).toBeGreaterThan(0.95)
    expect(ix.index[100]).not.toBe(ix.index[17])
  })

  it('snaps to an imported RGB palette by nearest entry', () => {
    const c = cells(8, 8, LAB, (i) => i % 12, 0.005)
    const ix = buildPalette(c, { palette: Uint8Array.from(PAL.flat()) })
    for (let i = 0; i < 64; i++) expect(ix.index[i]).toBe(i % 12)
    expect(Array.from(ix.rgb)).toEqual(PAL.flat()) // imported entries render byte-exact
  })

  it('exact NN upscale survives sampling + exact palette bit-exactly (gate T1), close ramps included', () => {
    const N = 24, k = 8, S = N * k, r = rng(3), gt = new Uint8ClampedArray(N * N * 4)
    for (let i = 0; i < N * N; i++) { const v = (r() * 20) | 0; gt.set([100 + v * 3, 60 + v * 2, 40 + v, 255], i * 4) } // 20-step ramp, ~0.01 apart
    const data = new Uint8ClampedArray(S * S * 4)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) data.set(gt.subarray(((y >> 3) * N + (x >> 3)) * 4, ((y >> 3) * N + (x >> 3)) * 4 + 4), (y * S + x) * 4)
    const axis = { count: N, cuts: Float64Array.from({ length: N + 1 }, (_, i) => i * k) }
    const ix = buildPalette(sampleCells({ width: S, height: S, data }, { x: axis, y: axis }), { exact: true })
    const out = new Uint8ClampedArray(N * N * 4), t = new Float64Array(3)
    for (let i = 0; i < N * N; i++) { const e = ix.index[i]; oklabToSrgb(ix.palette[e * 3], ix.palette[e * 3 + 1], ix.palette[e * 3 + 2], t, 0); out.set([...t, 255], i * 4) }
    expect(Buffer.from(out).equals(Buffer.from(gt))).toBe(true)
  })

  it('warns when a requested size exceeds the 64-entry cap, and when exact art has > 256 colors', () => {
    const many = cells(32, 32, Array.from({ length: 300 }, (_, k) => [0.2 + (k % 20) * 0.04, ((k / 20) | 0) * 0.02 - 0.15, 0]), (i) => i % 300, 0)
    expect(buildPalette(many, { colors: 200 }).warnings).toEqual(['palette capped at 64 colors (requested 200)'])
    expect(buildPalette(many, { exact: true }).warnings).toEqual(['exact art quantized: 300 unique colors > 256'])
    expect(buildPalette(many, { colors: 32 }).warnings).toEqual([])
  })

  it('pure cells keep their exact source RGB as the palette bytes', () => {
    const c = cells(2, 1, [LAB[0], LAB[1]], (i) => i, 0)
    c.pure = Uint8Array.from([1, 1]); c.rgb = Int32Array.from([0x18_14_25, 0x1d_2b_53])
    expect(Array.from(buildPalette(c).rgb)).toEqual([24, 20, 37, 29, 43, 83])
  })

  it('a clean grid (≥ 95% pure cells) keeps every exact color, even near-duplicates', () => {
    const tones = [[0.8, 0.05, 0.1], [0.815, 0.05, 0.1], [0.83, 0.05, 0.1]] // 0.015 apart: auto would merge
    const c = cells(8, 8, tones, (i) => i % 3, 0)
    expect(count(buildPalette(c))).toBe(1)
    c.pure = new Uint8Array(64).fill(1)
    expect(count(buildPalette(c))).toBe(3)
    expect(count(buildPalette(c, { colors: 2 }))).toBeLessThanOrEqual(2)
  })

  it('masked cells do not shape the palette but still get the nearest entry', () => {
    const c = cells(8, 8, [LAB[0], LAB[7]], (i) => (i === 63 ? 1 : 0), 0)
    c.masked = new Uint8Array(64)
    c.masked[63] = 1
    const ix = buildPalette(c)
    expect(count(ix)).toBe(1)
    expect(ix.index[63]).toBe(0)
  })

  it('a noisy pure-black outline yields exactly one dark entry (toe-corrected L)', () => {
    const N = 24, k = 10, S = N * k, r = rng(11), cols = [[0, 0, 0], ...PAL.slice(1)] // black + 11 colors
    const sprite = Array.from({ length: N * N }, (_, i) => (i % N % 6 === 0 || Math.floor(i / N) % 6 === 0 ? 0 : 1 + ((r() * 11) | 0)))
    const raw = new Float64Array(S * S * 3), data = new Uint8ClampedArray(S * S * 4)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) raw.set(cols[sprite[Math.floor(y / k) * N + Math.floor(x / k)]], (y * S + x) * 3)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0, cnt = 0
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (x + i >= 0 && y + j >= 0 && x + i < S && y + j < S) { sum += raw[((y + j) * S + x + i) * 3 + ch]; cnt++ }
        data[(y * S + x) * 4 + ch] = sum / cnt + (r() * 2 - 1) * 6
      }
      data[(y * S + x) * 4 + 3] = 255
    }
    const axis = { count: N, cuts: Float64Array.from({ length: N + 1 }, (_, i) => i * k) }
    const ix = buildPalette(sampleCells({ width: S, height: S, data }, { x: axis, y: axis }))
    const dark = Array.from({ length: count(ix) }, (_, e) => ix.palette[e * 3]).filter((L) => L < 0.2)
    expect(dark.length).toBe(1)
    expect(Math.abs(count(ix) - 12)).toBeLessThanOrEqual(1)
  })

  it('is fast and deterministic on 256x256 cells', () => {
    const c = cells(256, 256, LAB, (i, r) => (r() * 12) | 0, 0.02, 5)
    const t0 = performance.now()
    const a = buildPalette(c)
    const ms = performance.now() - t0
    const b = buildPalette(c)
    expect(Buffer.from(a.index.buffer).equals(Buffer.from(b.index.buffer))).toBe(true)
    expect(Buffer.from(a.palette.buffer).equals(Buffer.from(b.palette.buffer))).toBe(true)
    console.log(`buildPalette 256x256 cells: ${ms.toFixed(1)} ms, K=${count(a)}`)
    expect(ms).toBeLessThan(2000)
  })
})
