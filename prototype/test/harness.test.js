// Self-tests for the measurement system: synth determinism/exactness and metrics on known inputs.
import { describe, it, expect } from 'vitest'
import { degrade, PRESETS, PRESET_STRATUM, NO_GRID, noGrid } from './synth.js'
import { proceduralSprites, showcaseSprites, nnFactor, TRAPS, SHOWCASE_COUNT, committedCases } from './fixtures.js'
import { indexImage, g1, g3, g5, g7, g8, g9, q4, q7, q13, q3, median, ratchet } from './metrics.js'

const img = (w, h, px) => { // px(x, y) -> [r,g,b,a] | null
  const d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = px(x, y); if (c) d.set(c.length > 3 ? c : [...c, 255], (y * w + x) * 4) }
  return { width: w, height: h, data: d }
}
const sprite = proceduralSprites(1)[0].img
const same = (a, b) => Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length))

describe('fixtures', () => {
  const native = (list) => {
    for (const s of list) {
      expect(nnFactor(s.img), s.id).toBe(1)
      for (let i = 3; i < s.img.data.length; i += 4) expect([0, 255]).toContain(s.img.data[i])
    }
  }
  it('procedural sprites are native 1:1 (identifiable lattice) with binary alpha; traps present', () => {
    for (const seed of [1, 2, 3]) native(proceduralSprites(seed))
    expect(proceduralSprites(1).filter((s) => TRAPS.includes(s.id)).map((s) => s.id)).toEqual(TRAPS)
  })
  it.skipIf(!showcaseSprites().length)('local: showcase crops are native 1:1 with binary alpha', () => {
    const t = showcaseSprites()
    expect(t.length).toBe(SHOWCASE_COUNT)
    native(t)
  })
  it('every committed case has a primary stratum and base family', () => {
    for (const c of committedCases()) {
      expect('GIMHLPATSOUBFX', c.id).toContain(c.stratum)
      expect(c.family, c.id).toMatch(/^procedural:/)
    }
    expect(Object.keys(PRESET_STRATUM).sort()).toEqual(Object.keys(PRESETS).sort())
  })
  it('procedural sprites are seeded', () => {
    expect(proceduralSprites(7)[0].img.data).toEqual(proceduralSprites(7)[0].img.data)
    expect(proceduralSprites(7)[0].img.data).not.toEqual(proceduralSprites(8)[0].img.data)
  })
})

describe('synth', () => {
  it('is deterministic per seed and varies across seeds', () => {
    for (const name of Object.keys(PRESETS)) {
      const a = degrade(sprite, name, 5), b = degrade(sprite, name, 5)
      expect(same(a.img.data, b.img.data), name).toBe(true)
    }
    expect(same(degrade(sprite, 'gpt-image-like', 5).img.data, degrade(sprite, 'gpt-image-like', 6).img.data)).toBe(false)
  })

  it('clean-nn-integer reproduces exact k x k blocks of the truth', () => {
    for (const k of [4, 6, 8, 10, 12, 16]) {
      const { img, truth } = degrade(sprite, { ...PRESETS['clean-nn-integer'], cellSize: k }, 1)
      expect(img.width).toBe(truth.cellsX * k)
      expect(img.height).toBe(truth.cellsY * k)
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const o = (y * img.width + x) * 4, t = (Math.floor(y / k) * truth.cellsX + Math.floor(x / k)) * 4
        if (img.data.subarray(o, o + 4).join() !== truth.sprite.data.subarray(t, t + 4).join()) throw new Error(`k=${k} mismatch at ${x},${y}`)
      }
      expect(Array.from(truth.cutsX)).toEqual(Array.from({ length: truth.cellsX + 1 }, (_, i) => i * k))
    }
  })

  it('truth cuts are monotonic, span the canvas, and match the cell size', () => {
    for (const name of Object.keys(PRESETS)) {
      const { img, truth } = degrade(sprite, name, 3)
      for (const [cuts, len, n, cell] of [[truth.cutsX, img.width, truth.cellsX, truth.cellW], [truth.cutsY, img.height, truth.cellsY, truth.cellH]]) {
        expect(cuts.length).toBe(n + 1)
        for (let i = 1; i < cuts.length; i++) expect(cuts[i] - cuts[i - 1], name).toBeGreaterThan(0.85 * cell)
        expect(Math.abs((cuts[n] - cuts[0]) / n - cell) / cell, name).toBeLessThan(0.1)
        expect(Math.abs(cuts[n] - cuts[0] - len), name).toBeLessThan(cell * 1.5)
      }
    }
  })

  it('backgrounds render as specified (corner pixel) and AI presets explode the palette', () => {
    for (const [name, lo, hi] of [['gpt-image-like', 245, 255], ['gemini-like', 240, 255], ['nonint-nn', 105, 145], ['fake-alpha', 190, 255]]) {
      const { img } = degrade(sprite, name, 2)
      expect(img.data[0], name).toBeGreaterThanOrEqual(lo)
      expect(img.data[0], name).toBeLessThanOrEqual(hi)
      if (name !== 'nonint-nn') expect(indexImage(img).lab.length, name).toBeGreaterThan(500)
    }
  })

  it('mixels cover at most 25% of opaque cells; ambiguous mask is empty when clean', () => {
    const tile = proceduralSprites(1)[1].img // 20x20 opaque: worst case for disk coverage
    for (const seed of [1, 2, 3]) {
      const { truth } = degrade(tile, 'mixel-detail', seed)
      expect(truth.mixelCells).toBeGreaterThan(0)
      expect(truth.mixelCells).toBeLessThanOrEqual(0.25 * 400)
    }
    expect(degrade(sprite, 'clean-nn-integer', 1).truth.ambiguous.every((v) => v === 0)).toBe(true)
    expect(degrade(sprite, 'mixel-detail', 1).truth.ambiguous.some((v) => v === 1)).toBe(true)
  })

  it('no-grid scenes are seeded, opaque, non-block-sized and not NN upscales', () => {
    for (const kind of Object.keys(NO_GRID)) {
      const a = noGrid(kind, 4), b = noGrid(kind, 4)
      expect(same(a.data, b.data), kind).toBe(true)
      expect(same(a.data, noGrid(kind, 5).data), kind).toBe(false)
      expect(nnFactor(a), kind).toBe(1)
      for (let i = 3; i < a.data.length; i += 4) if (a.data[i] !== 255) throw new Error(`${kind} alpha`)
      expect(indexImage(a).lab.length, kind).toBeGreaterThan(200)
    }
  })

  it('flags half-cell phase per axis', () => {
    const { truth } = degrade(sprite, { ...PRESETS['nonint-nn'], cellSize: 8, phaseX: -0.5, phaseY: 0.2 }, 1)
    expect(truth.phaseAmbiguous).toEqual([true, false])
  })

  it('opaque GT renders as an opaque scene; jpeg preset output is opaque', () => {
    const tile = proceduralSprites(1)[1].img
    for (const name of ['gpt-image-like', 'jpeg-heavy']) {
      const { img, truth } = degrade(tile, name, 2)
      expect(truth.opaque).toBe(true)
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) throw new Error(`${name} alpha ${img.data[i]}`)
    }
  })
})

describe('metrics', () => {
  const grey = [128, 128, 128], white = [255, 255, 255]

  it('G1 exact match counts, shift diagnostic', () => {
    const G = img(4, 4, (x, y) => (x === 1 ? white : grey))
    expect(g1(G, G)).toEqual({ emAll: 1, emOpaque: 1, emInterior: 1, emShift: 1 })
    const O = img(4, 4, (x, y) => (x === 1 && y === 0 ? grey : x === 1 ? white : grey))
    expect(g1(O, G).emAll).toBeCloseTo(15 / 16)
    const S = img(4, 4, (x) => (x === 2 ? white : grey))
    expect(g1(S, G).emShift).toBeGreaterThan(g1(S, G).emOpaque)
  })

  it('G5 edge F1 at tolerance 0 vs 1 on a 1 px shifted bar', () => {
    const G = img(8, 8, (x) => (x === 3 ? white : grey)), O = img(8, 8, (x) => (x === 4 ? white : grey))
    expect(g5(G, G)).toEqual({ f1T0: 1, f1T1: 1 })
    const r = g5(O, G)
    expect(r.f1T0).toBeCloseTo(0.5)
    expect(r.f1T1).toBe(1)
  })

  it('G7 IoU on masks', () => {
    const G = img(4, 4, (x) => (x < 2 ? grey : null)), O = img(4, 4, (x) => (x < 3 ? grey : null))
    expect(g7(O, G).iou).toBeCloseTo(8 / 12)
  })

  it('Q7 counts one L-corner double; a true right angle is kept', () => {
    const L = img(3, 3, (x, y) => ((x === 0 && y === 0) || (x === 1 && y === 0) || (x === 1 && y === 1) ? grey : null))
    expect(q7(indexImage(L)).doubles).toBe(1)
    const R = img(5, 5, (x, y) => ((y === 0 && x <= 2) || (x === 2 && y <= 2) ? grey : null))
    expect(q7(indexImage(R)).doubles).toBe(0)
  })

  it('Q4 classifies accent vs noise', () => {
    const A = img(5, 5, (x, y) => (x === 2 && y === 2 ? white : grey))
    expect(q4(indexImage(A))).toMatchObject({ accent: 1, noise: 0 })
    const N = img(5, 5, (x, y) => (x === 2 && y === 2 ? white : x < 2 ? grey : null))
    expect(q4(indexImage(N)).noise).toBe(1)
  })

  it('Q13 flags a hidden 2x upscale; Q3 counts near duplicates', () => {
    const cols = [[200, 30, 30], [30, 200, 30], [30, 30, 200], [220, 220, 40]]
    const U = img(8, 8, (x, y) => cols[((x >> 1) * 7 + (y >> 1) * 3) % 4])
    const m = q13(indexImage(U))
    expect(m.hidden2).toBeGreaterThan(0.3)
    expect(m.dupRatio).toBeGreaterThan(0.05)
    const D = img(2, 1, (x) => (x ? [128, 128, 128] : [129, 128, 128]))
    expect(q3(indexImage(D))).toMatchObject({ dupPairs: 1, dupTouching: 1 })
  })

  it('G8 recall and breaks on a broken 1 px line', () => {
    const G = img(7, 3, (x, y) => (y === 1 ? white : grey)), O = img(7, 3, (x, y) => (y === 1 && x !== 3 ? white : grey))
    expect(g8(G, G).g8Recall).toBe(1)
    const r = g8(O, G)
    expect(r.g8Breaks).toBe(1)
    expect(r.g8Recall).toBeLessThan(1)
  })

  it('empty or inapplicable metrics are null, never perfect', () => {
    const flat = img(6, 6, () => grey), none = img(4, 4, () => null)
    expect(g8(flat, flat).g8Recall).toBeNull() // no thin/orphan/dither features
    expect(median([])).toBeNull()
    expect(g3(indexImage(none), indexImage(none))).toMatchObject({ palPrecision: null, palRecall: null, palPrecisionPx: null, palRecallPx: null })
    expect(g7(none, none).iou).toBeNull()
    expect(g5(flat, flat).f1T1).toBeNull()
  })

  it('ratchet fails on missing groups/metrics and on any false-grid rise', () => {
    expect(ratchet({ a: { emSnap: 1 } }, { a: { emSnap: 1 } })).toEqual([])
    expect(ratchet({}, { a: { emSnap: 1 } })).toHaveLength(1)
    expect(ratchet({ a: { emSnap: 1 }, b: {} }, { a: { emSnap: 1 } })).toHaveLength(1)
    expect(ratchet({ a: {} }, { a: { g8Recall: 1 } })).toHaveLength(1)
    expect(ratchet({ a: { falseGrid: 0.1 } }, { a: { falseGrid: 0 } })).toHaveLength(1)
  })

  it('G9 is zero for a report that matches the truth lattice', () => {
    const { img: input, truth } = degrade(sprite, 'clean-nn-integer', 1)
    const report = { grid: { period: [8, 8], phase: [0, 0], native: [truth.cellsX, truth.cellsY] } }
    expect(g9(report, truth, input)).toMatchObject({ scaleErrX: 0, phaseErrX: 0, seamP95X: 0, seamP95Y: 0, nativeErrX: 0 })
  })
})
