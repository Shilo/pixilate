import { describe, expect, it } from 'vitest'
import { COVERAGE_BUDGET, reduceToTarget, resampleToTarget, upscaleInteger } from '../src/lib/core/resample.js'
import { srgbToOklab } from '../src/lib/core/color.js'
import { cleanup } from '../src/lib/core/cleanup.js'

const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
const lab = (r, g, b) => { const t = new Float64Array(3); srgbToOklab(r, g, b, t, 0); return [...t] }
const BG = [235, 235, 225], INK = [20, 16, 30], FILL = [210, 120, 50]

/** N x N sprite: disc with a 1px dark ring; 0 bg, 1 ink, 2 fill. */
function ringSprite(N) {
  const s = new Uint8Array(N * N), c = (N - 1) / 2, R = N * 0.36
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.sqrt((x - c) ** 2 + (y - c) ** 2)
    s[y * N + x] = d < R - 1 ? 2 : d < R ? 1 : 0
  }
  return s
}

/** Bilinear ("smooth") rendering of an N x N sprite at S x S, shifted by `shift` source px. */
function smoothRender(sprite, N, S, shift) {
  const cols = [BG, INK, FILL], data = new Uint8ClampedArray(S * S * 4), k = S / N
  const at = (x, y) => cols[sprite[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))]]
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fx = (x + 0.5 - shift) / k - 0.5, fy = (y + 0.5 - shift) / k - 0.5
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
    for (let ch = 0; ch < 3; ch++) {
      data[(y * S + x) * 4 + ch] = at(x0, y0)[ch] * (1 - tx) * (1 - ty) + at(x0 + 1, y0)[ch] * tx * (1 - ty) + at(x0, y0 + 1)[ch] * (1 - tx) * ty + at(x0 + 1, y0 + 1)[ch] * tx * ty
    }
    data[(y * S + x) * 4 + 3] = 255
  }
  return { width: S, height: S, data }
}

/** Label each cell by nearest of BG/INK/FILL. */
function classify(cells) {
  const ref = [BG, INK, FILL].map((c) => lab(...c))
  return Array.from({ length: cells.w * cells.h }, (_, i) => {
    let best = 0, bd = Infinity
    ref.forEach((r, k) => { const d = (r[0] - cells.lab[i * 3]) ** 2 + (r[1] - cells.lab[i * 3 + 1]) ** 2 + (r[2] - cells.lab[i * 3 + 2]) ** 2; if (d < bd) { bd = d; best = k } })
    return best
  })
}

/** True if a 4-connected flood from the border over non-ink cells cannot reach the center (ring closed). */
function ringClosed(labels, w, h, ink = 1) {
  const seen = new Uint8Array(w * h), q = []
  for (let i = 0; i < w * h; i++) { const x = i % w, y = (i / w) | 0; if ((!x || !y || x === w - 1 || y === h - 1) && labels[i] !== ink) { seen[i] = 1; q.push(i) } }
  while (q.length) {
    const i = q.pop(), x = i % w
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && labels[j] !== ink) { seen[j] = 1; q.push(j) }
  }
  return !seen[(h >> 1) * w + (w >> 1)]
}

describe('resampleToTarget', () => {
  const N = 32, sprite = ringSprite(N), inkGT = sprite.filter((v) => v === 1).length

  for (const shift of [0, 16]) {
    it(`keeps a 1px dark outline continuous at 32x32 from a 1024² smooth rendering (shift ${shift}px)`, () => {
      const cells = resampleToTarget(smoothRender(sprite, N, 1024, shift), N, N)
      expect(cells.w).toBe(32)
      const labels = classify(cells)
      expect(ringClosed(labels, N, N)).toBe(true)
      expect(labels.filter((v) => v === 1).length).toBeLessThanOrEqual(inkGT * 1.6) // no wholesale doubling
    })
  }

  it('keeps a half-cell line (64-px sprite rendered smooth at 1024², target 32) closed via ridge protection', () => {
    const cells = resampleToTarget(smoothRender(ringSprite(64), 64, 1024, 5), 32, 32)
    expect(ringClosed(classify(cells), 32, 32)).toBe(true)
  })

  it('flat noisy input stays flat (no ridge false positives)', () => {
    const r = rng(7), S = 512, data = new Uint8ClampedArray(S * S * 4)
    for (let p = 0; p < S * S; p++) { for (let k = 0; k < 3; k++) data[p * 4 + k] = 128 + (r() * 2 - 1) * 16; data[p * 4 + 3] = 255 }
    const c = resampleToTarget({ width: S, height: S, data }, 64, 64), L = Array.from({ length: 4096 }, (_, i) => c.lab[i * 3])
    expect(Math.max(...L) - Math.min(...L)).toBeLessThan(0.03)
  })

  it('busy high-contrast speckle (robe embroidery) becomes flat regions, not salt-and-pepper', () => {
    const N = 48, ix = indexedRing(N, true), pal = Array.from(ix.palette), r = rng(5)
    pal.push(...lab(240, 200, 60), ...lab(60, 90, 200)) // 3 gold, 4 blue specks on the fill
    for (let p = 0; p < N * N; p++) if (ix.index[p] === 1 && r() < 0.25) ix.index[p] = r() < 0.5 ? 3 : 4
    const out = reduceToTarget({ ...ix, palette: Float32Array.from(pal) }, 32, 32)
    expect(orphans(out)).toBeLessThanOrEqual(6) // of ~300 opaque cells (iteration 1: 21; 4 before D25 stopped bridging separate specks)
  })

  it('extreme ratio (96 -> 16): interior reads as fill + eyes, the outline stays on the silhouette', () => {
    const N = 96, ix = indexedRing(N, true)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ix.index[y * N + x] === 1 && y > 52 && y % 3 < 2 && x % 7) ix.index[y * N + x] = 0 // dense ink hatching (clothing)
    for (const ex of [36, 54]) for (let y = 36; y < 44; y++) for (let x = ex; x < ex + 6; x++) ix.index[y * N + x] = 0 // two eyes on a calm face
    const out = reduceToTarget(ix, 16, 16), at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? -1 : out.index[y * 16 + x])
    let innerInk = 0, inner = 0, sil = 0, silInk = 0
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (at(x, y) < 0) continue
      const isSil = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) < 0)
      if (isSil) { sil++; silInk += at(x, y) === 0 } else { inner++; innerInk += at(x, y) === 0 }
    }
    expect(silInk).toBe(sil)
    expect(innerInk).toBeGreaterThanOrEqual(2) // the eyes
    expect(innerInk).toBeLessThanOrEqual(4)
    expect(inner).toBeGreaterThan(30)
  })

  it('is deterministic and fast enough (1024² -> 64²)', () => {
    const img = smoothRender(ringSprite(64), 64, 1024, 5)
    const t0 = performance.now()
    const a = resampleToTarget(img, 64, 64)
    const ms = performance.now() - t0
    const b = resampleToTarget(img, 64, 64)
    console.log(`resampleToTarget 1024²->64²: ${ms.toFixed(1)} ms`)
    expect(Buffer.from(a.lab.buffer).equals(Buffer.from(b.lab.buffer))).toBe(true)
    expect(ms).toBeLessThan(2000)
  })
})

/** N x N indexed ring sprite: 0 ink (1 px outline), 1 fill, background -1 (or 2 when opaque). */
function indexedRing(N, transparentBg) {
  const s = ringSprite(N), index = new Int16Array(N * N)
  s.forEach((v, i) => { index[i] = v === 0 ? (transparentBg ? -1 : 2) : v === 1 ? 0 : 1 })
  return { w: N, h: N, index, palette: Float32Array.from([INK, FILL, BG].flatMap((c) => lab(...c))) }
}
const count = (ix, k) => ix.index.reduce((n, v) => n + (v === k), 0)
/** Same-index 8-neighbor-less opaque cells. */
function orphans(ix) {
  const { w, h, index } = ix
  let n = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = index[y * w + x]
    if (v < 0) continue
    let same = false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && index[(y + dy) * w + x + dx] === v) same = true
    }
    if (!same) n++
  }
  return n
}

describe('reduceToTarget', () => {
  for (const N of [64, 48]) {
    for (const transparentBg of [true, false]) {
      it(`${N} -> 32 keeps the 1 px outline closed and not doubled (${transparentBg ? 'transparent' : 'opaque'} bg)`, () => {
        const out = reduceToTarget(indexedRing(N, transparentBg), 32, 32)
        expect([out.w, out.h]).toEqual([32, 32])
        expect(ringClosed(Array.from(out.index), 32, 32, 0)).toBe(true)
        expect(count(out, 0)).toBeLessThanOrEqual(count(indexedRing(32, true), 0) * 1.3)
        expect(out.index[0]).toBe(transparentBg ? -1 : 2)
        expect(orphans(out)).toBe(0)
      })
    }
  }

  it('keeps 2x2 eyes and a 2x2 glint at 64 -> 32 and 48 -> 32', () => {
    for (const N of [64, 48]) {
      const ix = indexedRing(N, true), pal = Array.from(ix.palette)
      pal.push(...lab(250, 250, 250)) // 3 = glint
      const k = N / 64, put = (x, y, v) => { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) ix.index[(Math.round(y * k) + j) * N + Math.round(x * k) + i] = v }
      put(22, 28, 0); put(40, 28, 0); put(30, 18, 3) // eyes in ink, glint in white, on the fill
      const out = reduceToTarget({ ...ix, palette: Float32Array.from(pal) }, 32, 32)
      const inner = (v) => { let n = 0; for (let y = 6; y < 26; y++) for (let x = 6; x < 26; x++) n += out.index[y * 32 + x] === v; return n }
      expect(inner(0), `eyes at ${N}`).toBeGreaterThanOrEqual(2)
      expect(inner(3), `glint at ${N}`).toBeGreaterThanOrEqual(1)
    }
  })

  it('drops low-contrast 1 px stripes instead of fragmenting them (no orphans)', () => {
    const N = 48, ix = indexedRing(N, true), pal = Array.from(ix.palette)
    const f = lab(...FILL); pal.push(f[0] + 0.04, f[1], f[2]) // 3 = a barely lighter strand tone
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ix.index[y * N + x] === 1 && (x + 2 * y) % 5 === 0) ix.index[y * N + x] = 3
    const out = reduceToTarget({ ...ix, palette: Float32Array.from(pal) }, 32, 32)
    expect(count(out, 3)).toBe(0)
    expect(orphans(out)).toBe(0)
  })

  it('keeps a 1 px opaque antenna on transparency as a connected line, alpha by coverage', () => {
    const N = 48, ix = indexedRing(N, true)
    for (let y = 0; y < 12; y++) ix.index[y * N + 24] = 0 // vertical antenna from the top edge to the ring
    const out = reduceToTarget(ix, 32, 32)
    const col = (y) => [15, 16, 17].some((x) => out.index[y * 32 + x] >= 0)
    for (let y = 0; y < 8; y++) expect(col(y), `antenna row ${y}`).toBe(true)
    expect(out.index.every((v) => v >= -1)).toBe(true)
  })

  it('T > N (16 -> 24, canvas) keeps flat halves; transparent stays transparent', () => {
    const index = new Int16Array(256).map((_, i) => (i % 16 < 8 ? 2 : 1)), ix = { w: 16, h: 16, index, palette: indexedRing(4, false).palette }
    index[0] = -1
    const out = reduceToTarget(ix, 24, 24)
    expect([out.index[0], out.index[24 * 12 + 2], out.index[24 * 12 + 21]]).toEqual([-1, 2, 1])
  })

  it('is deterministic and fast (245x176 noisy indexed -> 128x96 under 100 ms)', () => {
    const r = rng(3), w = 245, h = 176, index = new Int16Array(w * h), pal = []
    for (let k = 0; k < 32; k++) pal.push(...lab(r() * 255, r() * 255, r() * 255))
    for (let p = 0; p < w * h; p++) index[p] = r() < 0.1 ? -1 : (((p % w) >> 3) + ((p / w) >> 3) + (r() < 0.2 ? 1 : 0)) % 32
    const ix = { w, h, index, palette: Float32Array.from(pal) }
    reduceToTarget(ix, 128, 96) // warm-up
    const t0 = performance.now(), a = reduceToTarget(ix, 128, 96), ms = performance.now() - t0
    const b = reduceToTarget(ix, 128, 96)
    console.log(`reduceToTarget 245x176 -> 128x96: ${ms.toFixed(1)} ms`)
    expect(Array.from(a.index)).toEqual(Array.from(b.index))
    expect(ms).toBeLessThan(100)
  })
})

describe('reduceToTarget: cleanup gating and budget', () => {
  it('clean: false skips bridge, orphan and outline passes (zero changes reported)', () => {
    const N = 48, ix = indexedRing(N, true), pal = Array.from(ix.palette), r = rng(5)
    pal.push(...lab(240, 200, 60), ...lab(60, 90, 200))
    for (let p = 0; p < N * N; p++) if (ix.index[p] === 1 && r() < 0.25) ix.index[p] = r() < 0.5 ? 3 : 4
    const src = { ...ix, palette: Float32Array.from(pal) }
    const off = reduceToTarget(src, 32, 32, { clean: false }), on = reduceToTarget(src, 32, 32)
    expect(off.changed).toEqual({ bridge: 0, orphan: 0, outline: 0 })
    expect(on.changed.orphan + on.changed.bridge + on.changed.outline).toBeGreaterThan(0)
    expect(orphans(off)).toBeGreaterThan(orphans(on))
  })

  /** Indexed non-integer NN upscale (factor f) of rows of palette digits ('.' = transparent). */
  const upscale = (rows, f, pal) => {
    const h = rows.length, w = rows[0].length, W = Math.round(w * f), H = Math.round(h * f), index = new Int16Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const ch = rows[Math.min(h - 1, Math.floor(y / f))][Math.min(w - 1, Math.floor(x / f))]; index[y * W + x] = ch === '.' ? -1 : +ch }
    return { w: W, h: H, index, palette: Float32Array.from(pal.flatMap((c) => lab(...c))) }
  }

  it('Clean on a misread 1:1 grid (9.4x upscale): sparks with edge noise survive (no outline rebuild, no island removal)', () => {
    const rows = ['..........', '.0........', '.......1..', '..........', '....0.....', '..........', '.1......0.', '..........']
    const ix = upscale(rows, 9.37, [[255, 245, 170], [250, 250, 250], [200, 120, 40]])
    for (let y = 1; y < ix.h - 1; y++) for (let x = 1; x < ix.w - 1; x += 2) { // sparse darker edge noise on each spark's top edge
      const p = y * ix.w + x
      if (ix.index[p] >= 0 && ix.index[p - ix.w] < 0) ix.index[p] = 2
    }
    const r = reduceToTarget(ix, 10, 8), out = cleanup(r, r)
    expect(r.changed.outline).toBe(0)
    expect(out.changed.island).toBe(0)
    expect(out.index.filter((v) => v >= 0).length).toBe(5)
  })

  it('Clean does not bridge the gap between two parallel thick strokes of one component', () => {
    const rows = ['.......', '.0.0.0.', '.0.0.0.', '.0.0.0.', '.0.0.0.', '.00000.', '.......']
    const out = reduceToTarget(upscale(rows, 9.37, [[20, 16, 30]]), 7, 7)
    expect(out.changed.bridge).toBe(0)
    expect(Array.from(out.index, (v) => (v < 0 ? '.' : v)).join('')).toBe(rows.join(''))
  })

  it('refuses coverage tables above the budget before allocating them', () => {
    const K = 33, ix = { w: 2, h: 2, index: new Int16Array(4), palette: new Float32Array(K * 3) }
    expect(1024 * 1024 * K).toBeGreaterThan(COVERAGE_BUDGET)
    expect(() => reduceToTarget(ix, 1024, 1024)).toThrow(expect.objectContaining({ code: 'algorithm-budget-exceeded' }))
  })
})

describe('upscaleInteger', () => {
  it('repeats each index k times', () => {
    const out = upscaleInteger({ w: 2, h: 1, index: Int16Array.from([3, -1]), palette: new Float32Array(12) }, 2, 3)
    expect([out.w, out.h]).toEqual([4, 3])
    expect(Array.from(out.index)).toEqual([3, 3, -1, -1, 3, 3, -1, -1, 3, 3, -1, -1])
  })
})
