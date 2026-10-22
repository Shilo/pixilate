import { describe, expect, it } from 'vitest'
import { analyzeBackground, cleanup, removeBackground, surfaceAt } from '../src/lib/core/cleanup.ts'
import { existsSync } from 'node:fs'
import { srgbToOklab } from '../src/lib/core/color.ts'
import { readPng, repoPath } from './fixtures.js'

const lab = (r, g, b) => { const t = new Float64Array(3); srgbToOklab(r, g, b, t, 0); return [...t] }
// palette: . = transparent, 0 navy, 1 body, 2 near-body (ΔE ~0.05), 3 white, 4 black, 5 yellow, 6 red
const PAL = Float32Array.from([lab(20, 24, 60), lab(120, 90, 70), lab(132, 98, 76), lab(255, 255, 255), lab(0, 0, 0), lab(255, 220, 40), lab(220, 30, 30)].flat())

/** Indexed + Cells from rows of palette digits ('.' = transparent); dominance from `dom` (default 1). */
function grid(rows, dom = {}) {
  const h = rows.length, w = rows[0].length, index = new Int16Array(w * h), dominance = new Float32Array(w * h).fill(1)
  rows.forEach((r, y) => [...r].forEach((ch, x) => { index[y * w + x] = ch === '.' ? -1 : +ch }))
  for (const [p, v] of Object.entries(dom)) dominance[p] = v
  return [{ w, h, index, palette: PAL }, { w, h, dominance }]
}
const rows = (ix) => Array.from({ length: ix.h }, (_, y) => [...ix.index.subarray(y * ix.w, (y + 1) * ix.w)].map((v) => (v < 0 ? '.' : v)).join(''))
const recall = (a, b) => a.index.filter((v, i) => v === b.index[i]).length / a.index.length

describe('cleanup', () => {
  it('keeps a confident glint, removes near-color and low-dominance orphans', () => {
    const [ix, cells] = grid([
      '1111111',
      '1444441',
      '1434441', // white eye glint at (2,2), dominance 1
      '1444441',
      '1112111', // near-body orphan at (3,4): ΔE < 0.08
      '1111161', // red orphan at (5,5) with low dominance
      '1111111',
    ], { [5 * 7 + 5]: 0.4 })
    const out = rows(cleanup(ix, cells))
    expect(out[2][2]).toBe('3')
    expect(out[4][3]).toBe('1')
    expect(out[5][5]).toBe('1')
  })

  it('sparse sparks survive (recall 1)', () => {
    const r = ['00000000000', '00500000050', '00000000000', '00000500000', '05000000000', '00000000500', '00000000000']
    const [ix, cells] = grid(r)
    expect(rows(cleanup(ix, cells))).toEqual(r)
    const [ix2, cells2] = grid(r.map((s) => s.replaceAll('0', '.')), Object.fromEntries([...r.join('')].map((c, i) => [i, 0.9])))
    expect(rows(cleanup(ix2, cells2))).toEqual(r.map((s) => s.replaceAll('0', '.')))
  })

  it('UI right angles and 1px frames survive (recall 1)', () => {
    const r = ['0000000000', '0444444440', '0400000040', '0403333040', '0403003040', '0403333040', '0400000040', '0444444440', '0000000000']
    const [ix, cells] = grid(r)
    expect(rows(cleanup(ix, cells))).toEqual(r)
  })

  it('1-bit art (ordered dither ramp, dots, 1px strokes) keeps recall ≥ 0.95', () => {
    const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
    const r = []
    for (let y = 0; y < 24; y++) {
      let s = ''
      for (let x = 0; x < 32; x++) {
        if (y < 12) s += (x / 32) * 16 > B[y & 3][x & 3] ? '3' : '4' // Bayer ramp
        else if (y === 14 || x === 20) s += '3' // 1px strokes
        else s += (x * 7 + y * 3) % 11 === 0 ? '3' : '4' // sparse dots
      }
      r.push(s)
    }
    const [ix, cells] = grid(r)
    expect(recall(cleanup(ix, cells), ix)).toBeGreaterThanOrEqual(0.95)
  })

  it('keeps a checkerboard dither region even at low dominance', () => {
    const r = ['1111111', '1565651', '1656561', '1565651', '1656561', '1111111']
    const [ix, cells] = grid(r, Object.fromEntries(Array.from({ length: 42 }, (_, i) => [i, 0.4])))
    expect(rows(cleanup(ix, cells))).toEqual(r)
  })

  it('removes L-corners only on 1px strokes and spares true right angles', () => {
    const [ix, cells] = grid([
      '00000000',
      '00004000',
      '00040000',
      '04440000', // corner (3,3): arms W and N, W continues, N does not -> removed
      '00000000',
    ])
    expect(rows(cleanup(ix, cells))[3][3]).toBe('0')
    const thick = ['00000000', '00004400', '00044400', '44444000', '44440000', '00000000']
    const [ix2, cells2] = grid(thick)
    expect(rows(cleanup(ix2, cells2))).toEqual(thick)
    expect(rows(cleanup(ix, cells, { pixelPerfect: false }))[3][3]).toBe('4')
  })

  it('fills enclosed pinholes and drops low-dominance islands', () => {
    const [ix, cells] = grid(['.....', '.111.', '.1.1.', '.111.', '.....', '..6..', '.....'], { 27: 0.3 })
    const out = rows(cleanup(ix, cells))
    expect(out[2][2]).toBe('1')
    expect(out[5][2]).toBe('.')
  })

  it('never changes pure cells (exact evidence), even noise-like ones', () => {
    const r = ['1111111', '1111111', '1112111', '1111111', '1111111']
    const [ix, cells] = grid(r, { 17: 0.4 })
    cells.pure = new Uint8Array(35).fill(1)
    expect(rows(cleanup(ix, cells))).toEqual(r)
    cells.pure = null
    expect(rows(cleanup(ix, cells))[2][3]).toBe('1')
  })

  it('is deterministic', () => {
    const r = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => String((x * 31 + y * 17 + x * y) % 7)).join(''))
    const [ix, cells] = grid(r)
    expect(rows(cleanup(ix, cells))).toEqual(rows(cleanup(ix, cells)))
  })
})

describe('removeBackground (cells)', () => {
  const W3 = lab(250, 250, 250)
  /** Cells from rows: 'w' bg white, 'k' outline, 'f' fill, 'e' eye white, 'h' halo (fill-white blend). */
  function cellsFrom(r) {
    const h = r.length, w = r[0].length, C = { w: W3, k: lab(10, 10, 10), f: lab(200, 60, 40), e: lab(252, 252, 252), h: lab(228, 160, 150), s: lab(215, 215, 213), i: lab(214, 224, 245) }
    const cl = new Float32Array(w * h * 3)
    r.join('').split('').forEach((ch, i) => cl.set(C[ch], i * 3))
    return { w, h, lab: cl, alpha: new Uint8Array(w * h).fill(255), dominance: new Float32Array(w * h).fill(1) }
  }
  const sprite = ['wwwwwwwww', 'wkkkkkkww', 'wkefefkww', 'wkffffkhw', 'wkkkkkkww', 'wwwwwwwww']

  it('removes border-connected background, keeps enclosed white eyes, decontaminates halo', () => {
    const c = cellsFrom(sprite)
    const out = removeBackground(c, Float32Array.from(W3))
    expect(out.alpha[0]).toBe(0)
    expect(out.alpha[2 * 9 + 2]).toBe(255) // eye
    expect(out.alpha[1 * 9 + 1]).toBe(255)
    expect(c.alpha[0]).toBe(255) // input untouched
  })

  it('auto needs ≥ 90% border coverage; true accepts 60%', () => {
    const touching = ['wwwkkwww', 'wkkkkkkk', 'kkefefkw', 'wkffffkw', 'wkkkkkkk', 'wwwkkwww']
    const c = cellsFrom(touching), bg = Float32Array.from(W3)
    expect(removeBackground(c, bg).alpha[0]).toBe(255)
    expect(removeBackground(c, bg, { mode: true }).alpha[0]).toBe(0)
  })

  it("auto leaves full-bleed art opaque (1-bit tileset touching the border); true still removes", () => {
    const tiles = Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x % 6 === 0 || y % 6 === 3 ? 'k' : 'w')).join(''))
    const c = cellsFrom(tiles), bg = Float32Array.from(W3)
    expect(removeBackground(c, bg).alpha.every((a) => a === 255)).toBe(true)
    expect(removeBackground(c, bg, { mode: true }).alpha[1]).toBe(0)
  })

  it('keeps a ground shadow and tinted light ink touching the background (only ΔE < 0.03 is bg)', () => {
    const c = cellsFrom(['wwwwwwww', 'wkkkkiww', 'wkffkiww', 'wkkkkssw', 'wwssssww', 'wwwwwwww'])
    const out = removeBackground(c, Float32Array.from(W3), { mode: true })
    expect(out.alpha[0]).toBe(0)
    expect(out.alpha[4 * 8 + 3]).toBe(255) // shadow kept
    expect(out.alpha[1 * 8 + 5]).toBe(255) // pale blue ink (ΔE ~0.04 from white)
  })

  it('painted checkerboard: removes squares, texture and straddling cells; keeps pale ink near the grey', () => {
    // 2-cell squares; s = tinted steel (ΔE 0.030 from the dark square) touching the background,
    // g = neutral grey enclosed by the outline, m = blend of a cell straddling two squares,
    // n = textured dark square on the border (ΔE 0.033: at 0.03 it would trip the floating-subject check)
    const C = { L: lab(255, 255, 255), D: lab(204, 204, 204), k: lab(30, 30, 40), g: lab(200, 200, 200), s: lab(190, 200, 215), m: lab(228, 228, 228), n: lab(195, 195, 195) }
    const r = ['LLDDLLDDLL', 'LmDDLLDDLL', 'DDkkkkkLDD', 'DDkggggsDD', 'LLkggggsLL', 'LLkggggsLL', 'DDkkkkksDD', 'DDLLDDLLDD', 'LLDDLLDDLL', 'LLDDLLDDnL']
    const w = 10, cl = new Float32Array(w * w * 3)
    r.join('').split('').forEach((ch, i) => cl.set(C[ch], i * 3))
    const c = { w, h: w, lab: cl, alpha: new Uint8Array(w * w).fill(255), dominance: new Float32Array(w * w).fill(1) }
    const out = removeBackground(c, Float32Array.from([...C.L, ...C.D]))
    const kept = r.join('').split('').map((ch, i) => (out.alpha[i] ? ch : '.')).join('')
    expect(kept.replace(/\./g, '')).toBe(r.join('').replace(/[LDmn]/g, '')) // checker fully gone, subject intact
  })

  it('halo repair (own flag) gives a halo cell between fill and background the fill color', () => {
    const c = cellsFrom(['wwwwww', 'wffffw', 'wfffhw', 'wffffw', 'wwwwww'])
    const out = removeBackground(c, Float32Array.from(W3), { mode: true, halo: true })
    const p = 2 * 6 + 4
    expect(out.alpha[p]).toBe(255)
    expect([...out.lab.subarray(p * 3, p * 3 + 3)]).toEqual([...c.lab.subarray((2 * 6 + 3) * 3, (2 * 6 + 3) * 3 + 3)])
    expect(out.background).toEqual({ applied: true, reason: null, removed: 18, specks: 0, haloChanged: 1 })
    const off = removeBackground(c, Float32Array.from(W3), { mode: true })
    expect([...off.lab.subarray(p * 3, p * 3 + 3)]).toEqual([...c.lab.subarray(p * 3, p * 3 + 3)])
    expect(off.background.haloChanged).toBe(0)
  })

  it('a tiny floating near-background speck goes with the background; a distinct spark stays', () => {
    const N = 40, r = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (x >= 5 && x < 25 && y >= 5 && y < 25 ? (x === 5 || y === 5 || x === 24 || y === 24 ? 'k' : 'f') : 'w')).join(''))
    const c = cellsFrom(r), speck = 32 * N + 33, spark = 33 * N + 8
    c.lab.set(lab(232, 232, 228), speck * 3) // off-white noise the 0.03 tolerance misses
    c.lab.set(lab(255, 40, 40), spark * 3) // a distinct one-cell spark
    const out = removeBackground(c, Float32Array.from(W3), { mode: true })
    expect([out.alpha[speck], out.alpha[spark]]).toEqual([0, 255])
    expect(out.background.specks).toBe(1)
  })

  it('reports refusals with a reason', () => {
    const touching = ['wwwkkwww', 'wkkkkkkk', 'kkefefkw', 'wkffffkw', 'wkkkkkkk', 'wwwkkwww']
    expect(removeBackground(cellsFrom(touching), Float32Array.from(W3)).background).toMatchObject({ applied: false, reason: 'border coverage 71% < 90%' })
    expect(removeBackground(cellsFrom(['www', 'www']), Float32Array.from(W3)).background.reason).toBe('no subject')
    expect(removeBackground(cellsFrom(['www', 'www']), null).background.reason).toBe('no background color')
  })

  it("key mode: inclusive tolerance, no gates; 8-connectivity floods through diagonal gaps", () => {
    // white pocket inside a ring whose only opening is a diagonal step
    const r = ['wwwwww', 'wkkkkw', 'wkwwkw', 'wkwwkw', 'wkkkwk', 'wwwwkw']
    const bg = Float32Array.from(W3)
    const four = removeBackground(cellsFrom(r), bg, { mode: 'key', tolerance: 0 })
    const eight = removeBackground(cellsFrom(r), bg, { mode: 'key', tolerance: 0, connectivity: 8 })
    expect(four.alpha[2 * 6 + 2]).toBe(255) // pocket kept
    expect(eight.alpha[2 * 6 + 2]).toBe(0) // reached diagonally through (4,4)-(5,5)... via (3,3)->(4,4)
    expect(four.alpha[0]).toBe(0)
  })
})

describe('analyzeBackground', () => {
  function image(w, h, f) {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4)
    return { width: w, height: h, data }
  }
  const inSprite = (x, y) => x >= 40 && x < 88 && y >= 40 && y < 88

  it('finds a solid background', () => {
    const r = analyzeBackground(image(128, 128, (x, y) => (inSprite(x, y) ? [200, 40, 40, 255] : [250, 250, 248, 255])))
    expect(r.bg.length).toBe(3)
    expect(r.bg[0]).toBeGreaterThan(0.95)
    expect(r.checkerboard).toBe(null)
  })

  it('detects a painted checkerboard and masks it but not the sprite', () => {
    const r = analyzeBackground(image(128, 128, (x, y) => (inSprite(x, y) ? [200, 40, 40, 255] : ((x >> 3) + (y >> 3)) & 1 ? [204, 204, 204, 255] : [255, 255, 255, 255])))
    expect(r.checkerboard).toEqual({ period: 8 })
    expect(r.bg.length).toBe(6)
    expect(r.mask[0]).toBe(1)
    expect(r.mask[64 * 128 + 64]).toBe(0)
  })

  it('reports no background for transparent borders', () => {
    const r = analyzeBackground(image(64, 64, (x, y) => (x > 20 && x < 40 ? [0, 0, 0, 255] : [0, 0, 0, 0])))
    expect(r.bg).toBe(null)
  })

  // D49: a smooth gradient backdrop gets a quadratic surface; busy scenes and flat colours get none
  const grad = (x, y) => [150 + 0.5 * y + 0.002 * y * y, 230 - 0.3 * y, 170 + 0.4 * x].map(Math.round).concat(255)
  it('fits a surface to a smooth gradient border (the sprite is off the border)', () => {
    const r = analyzeBackground(image(128, 128, (x, y) => (inSprite(x, y) ? [200, 40, 40, 255] : grad(x, y))))
    expect(r.surface).not.toBe(null)
    expect(r.checkerboard).toBe(null)
    const at = (u, v) => surfaceAt(r.surface, u, v, new Float64Array(3))
    for (const [got, [x, y]] of [[at(0.5, 0), [64, 0]], [at(0.5, 1), [64, 127]], [at(0, 0.5), [0, 64]]]) {
      const ref = lab(...grad(x, y).slice(0, 3))
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - ref[k])).toBeLessThan(0.01)
    }
  })
  it('fits no surface to a busy opaque scene or a flat colour', () => {
    let h = 7
    const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) >>> 16) & 255
    const cols = Array.from({ length: 64 }, () => [rnd(), rnd(), rnd(), 255])
    expect(analyzeBackground(image(128, 128, (x, y) => cols[((x >> 3) * 7 + (y >> 3) * 3) % 64])).surface).toBe(null)
    expect(analyzeBackground(image(128, 128, () => [120, 120, 120, 255])).surface).toBe(null)
  })
  it('refuses a surface on a thin strip whose border blocks lie on only 2 rows (v^2 undetermined)', () => {
    let h = 7
    const rnd = () => (((h = (Math.imul(h, 1103515245) + 12345) >>> 0) >>> 16) % 5) - 2
    const r = analyzeBackground(image(1024, 6, (x) => [60 + 0.15 * x, 90 + 0.08 * x, 220 - 0.12 * x].map((c) => Math.round(c + rnd())).concat(255)))
    expect(r.surface).toBe(null) // was accepted with a corner miss of ~0.05 OKLab
    expect(r.reason).toMatch(/< 3 distinct rows or columns/)
  })
  it('surface removal: gradient cells go and the subject stays; a two-tone tile fails the solid gates', () => {
    const w = 12, h = 12, n = w * h, cells = { w, h, lab: new Float32Array(n * 3), alpha: new Uint8Array(n).fill(255), dominance: new Float32Array(n).fill(1) }
    const field = new Float32Array(n * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, bg = lab(...grad(x * 10, y * 10).slice(0, 3)), sub = x >= 4 && x < 8 && y >= 4 && y < 8
      field.set(bg, p * 3); cells.lab.set(sub ? lab(200, 40, 40) : bg, p * 3)
    }
    const out = removeBackground(cells, field.subarray(0, 3), { mode: 'auto', field })
    expect(out.background.applied).toBe(true)
    expect(out.background.removed).toBe(n - 16)
    expect(out.alpha[5 * w + 5]).toBe(255)
    // a tile of two greens ~0.06 apart against the surface through their middle: coverage < 90%, refused
    const tile = { ...cells, lab: new Float32Array(n * 3) }, mid = new Float32Array(n * 3)
    for (let p = 0; p < n; p++) { tile.lab.set(((p % w) + Math.floor(p / w)) & 1 ? lab(60, 120, 50) : lab(80, 140, 60), p * 3); mid.set(lab(70, 130, 55), p * 3) }
    const t = removeBackground(tile, mid.subarray(0, 3), { mode: 'auto', field: mid })
    expect(t.background.applied).toBe(false)
    expect(t.alpha.every((a) => a === 255)).toBe(true)
  })
})

// Real-sample guards (gitignored files; skipped when absent). Thresholds sit just below the
// pre-D15 outputs; the D15 shadow rule (light subject pixels removed as "shadow") measured gpt-oni fill 0.41 / light 0.19.
describe('real-sample background guards (suggested size, trim + auto background + Clean)', () => {
  const cases = [
    ['gpt-oni', '.local/samples/gpt-oni.png', 0.58, 0.4], // pre-D15 0.618 / 0.512
    ['gemini-mage', '.local/samples/gemini-mage.png', 0.58, 0], // 0.617
    ['unk-coat', '.local/samples/unk-coat.png', 0.6, 0], // 0.649
  ]
  for (const [id, rel, minFill, minLight] of cases) {
    it.skipIf(!existsSync(repoPath(rel)))(`${id}: subject stays filled (bbox fill ≥ ${minFill}, light share ≥ ${minLight})`, async () => {
      const { analyze, convert } = await import('../src/lib/core/pipeline.ts')
      const img = readPng(repoPath(rel)), [targetW, targetH] = analyze(img).suggestedSize
      const { image } = convert(img, { targetW, targetH, trim: true, background: 'auto', halo: true, cleanup: true })
      const { width: w, data: d } = image, t = new Float64Array(3)
      let x0 = w, y0 = image.height, x1 = -1, y1 = -1, op = 0, light = 0
      for (let p = 0; p < w * image.height; p++) if (d[p * 4 + 3]) { const x = p % w, y = (p - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const p = (y * w + x) * 4
        if (!d[p + 3]) continue
        op++
        srgbToOklab(d[p], d[p + 1], d[p + 2], t, 0)
        if (t[0] > 0.85) light++
      }
      expect(op / ((x1 - x0 + 1) * (y1 - y0 + 1))).toBeGreaterThanOrEqual(minFill)
      expect(light / op).toBeGreaterThanOrEqual(minLight)
    }, 60_000)
  }
})
