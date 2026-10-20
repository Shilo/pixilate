import { describe, expect, it } from 'vitest'
import { sampleCells } from '../src/lib/core/sample.js'
import { srgbToOklab } from '../src/lib/core/color.js'

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
// near-black, not #000: ±6 sRGB noise on pure black spans ~0.1 ΔEOK, which no per-cell sampler can undo
const PAL = [[24, 20, 37], [29, 43, 83], [126, 37, 83], [0, 135, 81], [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232], [255, 0, 77], [255, 163, 0], [41, 173, 255], [255, 119, 168]]

/** 16x16 sprite of palette indices (-1 = transparent corner), rendered at `period` px per cell, 3x3 blur, ±noise. */
function fixture(period, { noise = 6, seed = 1 } = {}) {
  const r = rng(seed), N = 16, sprite = new Int8Array(N * N)
  for (let i = 0; i < N * N; i++) sprite[i] = (r() * PAL.length) | 0
  sprite[0] = sprite[1] = -1
  const S = Math.round(N * period), raw = new Float64Array(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = sprite[Math.min(N - 1, Math.floor(y / period)) * N + Math.min(N - 1, Math.floor(x / period))]
    const c = v < 0 ? [0, 0, 0, 0] : [...PAL[v], 255]
    for (let k = 0; k < 4; k++) raw[(y * S + x) * 4 + k] = c[k]
  }
  const data = new Uint8ClampedArray(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let k = 0; k < 4; k++) {
    let s = 0, n = 0
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j
      if (xx >= 0 && yy >= 0 && xx < S && yy < S) { s += raw[(yy * S + xx) * 4 + k]; n++ }
    }
    data[(y * S + x) * 4 + k] = s / n + (k < 3 ? (r() * 2 - 1) * noise : 0)
  }
  const axis = { period, phase: 0, count: N, cuts: Float64Array.from({ length: N + 1 }, (_, i) => Math.min(S, i * period)) }
  return { img: { width: S, height: S, data }, grid: { x: axis, y: axis, class: 'grid' }, sprite }
}

function accuracy(cells, sprite) {
  let good = 0
  const t = new Float64Array(3)
  for (let c = 0; c < sprite.length; c++) {
    if (sprite[c] < 0) { if (!cells.alpha[c]) good++; continue }
    srgbToOklab(...PAL[sprite[c]], t, 0)
    const dE = Math.hypot(t[0] - cells.lab[c * 3], t[1] - cells.lab[c * 3 + 1], t[2] - cells.lab[c * 3 + 2])
    if (cells.alpha[c] && dE < 0.02) good++
  }
  return good / sprite.length
}

describe('sampleCells', () => {
  it('recovers sprite colors from a x10 blurred, noisy upscale', () => {
    const { img, grid, sprite } = fixture(10)
    const cells = sampleCells(img, grid)
    expect(cells.w).toBe(16)
    expect(accuracy(cells, sprite)).toBeGreaterThanOrEqual(0.98)
  })

  it('handles fractional cuts (period 10.3125)', () => {
    const { img, grid, sprite } = fixture(10.3125, { seed: 7 })
    expect(accuracy(sampleCells(img, grid), sprite)).toBeGreaterThanOrEqual(0.98)
  })

  it('trimmed mean stays accurate and alpha is binary', () => {
    const { img, grid, sprite } = fixture(10, { seed: 3 })
    const cells = sampleCells(img, grid)
    expect(accuracy(cells, sprite)).toBeGreaterThanOrEqual(0.98)
    expect(cells.alpha[0]).toBe(0)
    expect(cells.alpha.every((a) => a === 0 || a === 255)).toBe(true)
  })

  it('dominance drops on a half/half cell and the color still exists in the cell', () => {
    const data = new Uint8ClampedArray(12 * 12 * 4) // inset 3 -> 6x6 interior, split 3/3
    for (let p = 0; p < 144; p++) { const c = p % 12 < 6 ? [255, 0, 0] : [0, 0, 255]; data.set([...c, 255], p * 4) }
    const axis = { count: 1, cuts: Float64Array.from([0, 12]) }
    const cells = sampleCells({ width: 12, height: 12, data }, { x: axis, y: axis })
    expect(cells.dominance[0]).toBeCloseTo(0.5, 5)
    const t = new Float64Array(3)
    srgbToOklab(255, 0, 0, t, 0)
    expect(cells.lab[0]).toBeCloseTo(t[0], 5)
  })

  it('flags pure cells only when every inset pixel is identical', () => {
    expect(sampleCells(fixture(10, { noise: 0 }).img, fixture(10).grid).pure.every((v) => v === 1)).toBe(true)
    const noisy = sampleCells(fixture(10).img, fixture(10).grid)
    expect(noisy.pure.filter((v, i) => noisy.alpha[i]).some((v) => v === 1)).toBe(false)
  })

  it('flags cells whose interior is mostly masked', () => {
    const { img, grid } = fixture(10)
    const mask = new Uint8Array(160 * 160)
    for (let y = 150; y < 160; y++) for (let x = 140; x < 160; x++) mask[y * 160 + x] = 1
    const cells = sampleCells(img, grid, { mask })
    expect(Array.from(cells.masked).reduce((a, b) => a + b)).toBe(2)
    expect(cells.masked[255] + cells.masked[254]).toBe(2)
  })

  it('is deterministic', () => {
    const { img, grid } = fixture(10.3125, { seed: 9 })
    const a = sampleCells(img, grid), b = sampleCells(img, grid)
    expect(Buffer.from(a.lab.buffer).equals(Buffer.from(b.lab.buffer))).toBe(true)
    expect(Buffer.from(a.dominance.buffer).equals(Buffer.from(b.dominance.buffer))).toBe(true)
  })
})
