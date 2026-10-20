import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import jpeg from 'jpeg-js'
import { detectGrid, lockGrid } from '../src/lib/core/grid.js'
import { analyzeBackground } from '../src/lib/core/cleanup.js'
import { PRESETS, degrade } from './synth.js'
import { proceduralSprites, readPng, repoPath } from './fixtures.js'

// ---- tiny seeded renderer (explicit cell size, phase and drift, so truth is exact) ----

function prng(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** w x h sprite, ~ncol colours: background + random 1-4 cell rectangles. RGB, 3 bytes per cell. */
function sprite(seed, w, h = w, ncol = 12) {
  const r = prng(seed), pal = []
  for (let i = 0; i < ncol; i++) pal.push([(r() * 256) | 0, (r() * 256) | 0, (r() * 256) | 0])
  const s = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) s.set(pal[0], i * 3)
  for (let k = 0; k < Math.round((w * h) / 12); k++) {
    const c = pal[1 + ((r() * (ncol - 1)) | 0)], x0 = (r() * w) | 0, y0 = (r() * h) | 0, rw = 1 + ((r() * 4) | 0), rh = 1 + ((r() * 4) | 0)
    for (let y = y0; y < Math.min(h, y0 + rh); y++) for (let x = x0; x < Math.min(w, x0 + rw); x++) s.set(c, (y * w + x) * 3)
  }
  return { w, h, s, bg: pal[0] }
}

/**
 * Render a sprite to W x H with source coordinate u(x) = (x - phx - drift(x)) / px.
 * soft: 4x4 coverage over a 2 px box (about 2 px anti-aliased seams, flat interiors).
 * noise: sigma via Irwin-Hall. Returns { img, cutsX, cutsY } (true seams).
 */
function render(sp, W, H, { px, py = px, phx = 0, phy = 0, drift = null, soft = false, noise = 0, seed = 7 } = {}) {
  const d = new Uint8ClampedArray(W * H * 4), r = prng(seed)
  const ux = (x) => (x - phx - (drift ? drift(x) : 0)) / px, uy = (y) => (y - phy) / py
  const ns = soft ? 4 : 1, off = (i) => (soft ? (i - 1.5) / 2 : 0) + 0.5 // subsample offsets in px
  const cell = (f, n, len, i) => Math.min(n - 1, Math.max(0, Math.floor(f(i))))
  const IX = new Int32Array(W * ns), IY = new Int32Array(H * ns) // sprite cell per subsample (separable)
  for (let x = 0; x < W; x++) for (let i = 0; i < ns; i++) IX[x * ns + i] = cell(ux, sp.w, W, x + off(i))
  for (let y = 0; y < H; y++) for (let j = 0; j < ns; j++) IY[y * ns + j] = cell(uy, sp.h, H, y + off(j))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4
    let R = 0, G = 0, B = 0
    for (let j = 0; j < ns; j++) for (let i = 0; i < ns; i++) {
      const q = (IY[y * ns + j] * sp.w + IX[x * ns + i]) * 3
      R += sp.s[q]; G += sp.s[q + 1]; B += sp.s[q + 2]
    }
    const v = [R, G, B]
    for (let c = 0; c < 3; c++) {
      let val = v[c] / (ns * ns)
      if (noise) { let g = -6; for (let k = 0; k < 12; k++) g += r(); val += noise * g }
      d[o + c] = Math.round(val)
    }
    d[o + 3] = 255
  }
  const seams = (f, len) => {
    const out = []
    for (let k = Math.ceil(f(0)); k <= Math.floor(f(len)); k++) {
      let lo = 0, hi = len
      for (let it = 0; it < 60; it++) { const m = (lo + hi) / 2; if (f(m) < k) lo = m; else hi = m }
      out.push(lo)
    }
    return out
  }
  return { img: { width: W, height: H, data: d }, cutsX: seams(ux, W), cutsY: seams(uy, H) }
}

const jpegRT = (img, q) => {
  const dec = jpeg.decode(jpeg.encode({ width: img.width, height: img.height, data: img.data }, q).data, { useTArray: true, formatAsRGBA: true })
  return { width: dec.width, height: dec.height, data: new Uint8ClampedArray(dec.data.buffer, dec.data.byteOffset, dec.data.length) }
}

/** Sorted per-true-seam distance (cells) to the nearest detected cut, interior seams only. */
function cutErrors(cuts, truth, p, len) {
  const e = []
  for (const t of truth) {
    if (t < 0.5 * p || t > len - 0.5 * p) continue
    let b = Infinity
    for (const c of cuts) b = Math.min(b, Math.abs(c - t))
    e.push(b / p)
  }
  return e.sort((a, b) => a - b)
}
const p95 = (e) => e[Math.floor(0.95 * (e.length - 1))]
const phaseErr = (phase, truth, p) => { const d = (((phase - truth) % p) + p) % p; return Math.min(d, p - d) / p }

const P37 = 1024 / 37, SP37 = sprite(2, 37)

describe('detectGrid synthetic', () => {
  it('exact NN x8 upscale -> exact, 32 cells', () => {
    const g = detectGrid(render(sprite(1, 32), 256, 256, { px: 8 }).img)
    expect(g.class).toBe('exact')
    expect([g.x.count, g.y.count, g.x.period]).toEqual([32, 32, 8])
  })

  it('1:1 native pixel art -> exact n = 1; a non-integer NN upscale is not', () => {
    const sp = sprite(1, 48)
    expect(detectGrid(render(sp, 48, 48, { px: 1 }).img)).toMatchObject({ class: 'exact', x: { count: 48, period: 1 } })
    expect(detectGrid(render(sp, 130, 130, { px: 130 / 48 }).img).class).not.toBe('exact')
  })

  it('non-integer 1024/37 with soft seams -> 37 cells; lockGrid phase within 0.15 cell', () => {
    const g = detectGrid(render(SP37, 1024, 1024, { px: P37, soft: true }).img)
    expect(g.class).toBe('grid')
    expect([g.x.count, g.y.count]).toEqual([37, 37])
    expect(Math.abs(g.x.period / P37 - 1)).toBeLessThan(0.002)
    const L = lockGrid(render(SP37, 1024, 1024, { px: P37, phx: 0.3 * P37, phy: 0.6 * P37, soft: true }).img, 37, 37)
    expect([L.x.count, L.y.count]).toEqual([37, 37])
    expect(L.x.period).toBe(1024 / 37)
    expect(phaseErr(L.x.phase, 0.3 * P37, P37)).toBeLessThan(0.15)
    expect(phaseErr(L.y.phase, 0.6 * P37, P37)).toBeLessThan(0.15)
  })

  it('phase stays in [0, period) even when the best comb phase is ~period (period 16 case)', () => {
    const g = detectGrid(render(sprite(8, 40), 642, 642, { px: 16.004, phx: -0.004 * 40, soft: true }).img)
    for (const a of [g.x, g.y]) {
      expect(a.phase).toBeGreaterThanOrEqual(0)
      expect(Math.round(a.phase * 100) / 100).toBeLessThan(Math.round(a.period * 100) / 100)
    }
  })

  it('phase offset is recovered by detection', () => {
    const g = detectGrid(render(SP37, 1024, 1024, { px: P37, phx: 0.4 * P37, phy: 0.7 * P37, soft: true }).img)
    expect(g.class).toBe('grid')
    expect(Math.abs(g.x.period / P37 - 1)).toBeLessThan(0.005)
    expect(phaseErr(g.x.phase, 0.4 * P37, P37)).toBeLessThan(0.15)
    expect(phaseErr(g.y.phase, 0.7 * P37, P37)).toBeLessThan(0.15)
  })

  it('sinusoidal drift +-0.3 cell -> elastic cuts, p95 seam error < 0.25 cell', () => {
    const r = render(SP37, 1024, 1024, { px: P37, soft: true, drift: (x) => 0.3 * P37 * Math.sin((2 * Math.PI * x) / 700) })
    const g = detectGrid(r.img)
    expect(g.class).not.toBe('none')
    expect(g.x.elastic).toBe(true)
    expect(g.x.count).toBe(37)
    expect(p95(cutErrors(g.x.cuts, r.cutsX, P37, 1024))).toBeLessThan(0.25)
  })

  it('additive noise sigma 6 -> 37 cells', () => {
    const g = detectGrid(render(SP37, 1024, 1024, { px: P37, soft: true, noise: 6 }).img)
    expect(g.class).toBe('grid')
    expect([g.x.count, g.y.count]).toEqual([37, 37])
  })

  it('JPEG q60 8x8 blocking does not create a period-8 grid', () => {
    const g = detectGrid(jpegRT(render(SP37, 1024, 1024, { px: P37, soft: true }).img, 60))
    expect(g.class).toBe('grid')
    expect([g.x.count, g.y.count]).toEqual([37, 37])
  })

  it('alpha sprite on a transparent background -> 37 cells', () => {
    const { img } = render(SP37, 1024, 1024, { px: P37, soft: true })
    const [br, bg, bb] = SP37.bg
    for (let i = 0; i < img.data.length; i += 4) {
      if (Math.abs(img.data[i] - br) + Math.abs(img.data[i + 1] - bg) + Math.abs(img.data[i + 2] - bb) < 40) img.data[i + 3] = 0
    }
    const g = detectGrid(img)
    expect(g.class).toBe('grid')
    expect([g.x.count, g.y.count]).toEqual([37, 37])
  })

  it('small sprite in a big flat JPEG margin -> its grid, not the 8 px JPEG lattice', () => {
    const inner = sprite(5, 20), big = { w: 40, h: 40, s: new Uint8Array(40 * 40 * 3).fill(118) }
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) big.s.set(inner.s.subarray((y * 20 + x) * 3, (y * 20 + x) * 3 + 3), ((y + 10) * 40 + x + 10) * 3)
    const g = detectGrid(jpegRT(render(big, 934, 934, { px: 934 / 40, soft: true, noise: 1 }).img, 80))
    expect(g.class).toBe('grid')
    expect([g.x.count, g.y.count]).toEqual([40, 40])
  })

  it('sprite on a painted 16 px checkerboard -> its cell size, not the checker period (mask)', () => {
    const { img, truth } = degrade(proceduralSprites(1)[0].img, PRESETS['fake-alpha'], 3) // unmasked: 16 x 16
    const g = detectGrid(img, { mask: analyzeBackground(img).mask })
    expect(g.class).toBe('grid')
    expect(Math.abs(g.x.period / truth.cellW - 1)).toBeLessThan(0.03)
    expect(Math.abs(g.y.period / truth.cellH - 1)).toBeLessThan(0.03)
  })

  it('small (64 px, 16 cells) and huge (2048 px, 150 cells) inputs', () => {
    const s = detectGrid(render(sprite(3, 16), 64, 64, { px: 4, soft: true, noise: 3 }).img)
    expect([s.class, s.x.count, s.y.count]).toEqual(['grid', 16, 16])
    const h = detectGrid(render(sprite(4, 150), 2048, 2048, { px: 2048 / 150, soft: true }).img)
    expect([h.class, h.x.count, h.y.count]).toEqual(['grid', 150, 150])
  })

  it('non-square cells (37 x 41) stay anisotropic', () => {
    const g = detectGrid(render(sprite(6, 37, 41), 1024, 1024, { px: P37, py: 1024 / 41, soft: true }).img)
    expect([g.class, g.x.count, g.y.count]).toEqual(['grid', 37, 41])
  })

  it('smooth gradient and random sinusoid field (no grid) -> none', () => {
    const W = 512, grad = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      grad.data.set([x / 2, y / 2, 128 + 60 * Math.sin(x / 90 + y / 130), 255], o)
    }
    expect(detectGrid(grad).class).toBe('none')
    // painterly stand-in: 12 random-direction sinusoids at incommensurate wavelengths (no lattice)
    const r = prng(9), waves = Array.from({ length: 12 }, () => [r() * 6.283, 20 + r() * 120, r() * 6.283, (r() * 3) | 0])
    const vn = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, v = [128, 128, 128]
      for (const [th, lam, ph, c] of waves) v[c] += 40 * Math.sin(((x * Math.cos(th) + y * Math.sin(th)) * 6.283) / lam + ph)
      vn.data.set([v[0], v[1], v[2], 255], o)
    }
    expect(detectGrid(vn).class).toBe('none')
  })

  it('is deterministic and fast enough (1024^2 < ~150 ms target)', () => {
    const img = render(SP37, 1024, 1024, { px: P37, soft: true, noise: 2 }).img
    const a = detectGrid(img)
    const t = performance.now(), b = detectGrid(img), ms = performance.now() - t
    expect(Array.from(b.x.cuts)).toEqual(Array.from(a.x.cuts))
    expect(Array.from(b.y.cuts)).toEqual(Array.from(a.y.cuts))
    expect(b.evidence).toEqual(a.evidence)
    console.log(`detectGrid 1024^2: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(600) // generous for CI; the measured figure is logged
  })
})

// ---- second-difference profile: smooth (bilinear/bicubic) upscales have no steps, only slope kinks ----

describe("detectGrid profile 'd2' (smooth upscales)", () => {
  const tile = proceduralSprites(1)[1].img
  // largest distance of an inner cut to the nearest true seam, in cells
  const seamErr = (ax, cuts, cell) => Math.max(...Array.from(ax.cuts.slice(1, -1), (c) => Math.min(...Array.from(cuts, (u) => Math.abs(u - c))) / cell))

  it("bilinear x8.37: 'd1' misses the lattice, 'd2' finds it with regular cuts on the true seams (p/2 shift)", () => {
    const { img, truth } = degrade(tile, 'bilinear-x8.37', 1)
    const g1 = detectGrid(img)
    expect(g1.profile).toBe('d1')
    expect(g1.class === 'grid' && g1.x.count === truth.cellsX && g1.y.count === truth.cellsY).toBe(false)
    const g = detectGrid(img, { profile: 'd2' })
    expect([g.class, g.x.count, g.y.count, g.profile, g.x.elastic, g.y.elastic]).toEqual(['grid', truth.cellsX, truth.cellsY, 'd2', false, false])
    expect(seamErr(g.x, truth.cutsX, truth.cellW)).toBeLessThan(0.05)
    expect(seamErr(g.y, truth.cutsY, truth.cellH)).toBeLessThan(0.05)
    const L = lockGrid(img, truth.cellsX, truth.cellsY, { profile: 'd2' }) // re-solved on the same profile
    expect(L.profile).toBe('d2')
    expect(seamErr(L.x, truth.cutsX, truth.cellW)).toBeLessThan(0.05)
    expect(seamErr(L.y, truth.cutsY, truth.cellH)).toBeLessThan(0.05)
  })

  it("bilinear x8 and bicubic x8: 'd2' recovers the integer lattice", () => {
    for (const p of ['bilinear-x8', 'bicubic-x8-clean']) {
      const { img, truth } = degrade(tile, p, 1), g = detectGrid(img, { profile: 'd2' })
      expect([p, g.class, g.x.count, g.y.count]).toEqual([p, 'grid', truth.cellsX, truth.cellsY])
      expect(seamErr(g.x, truth.cutsX, truth.cellW)).toBeLessThan(0.05)
    }
  })

  it("masked pixels never reach a 'd2' term (each reads pixels -2..+1 along its axis)", () => {
    const { img } = degrade(tile, 'bilinear-x8', 1), W = img.width, H = img.height
    const mask = new Uint8Array(W * H)
    for (let y = 40; y < 90; y++) for (let x = 50; x < 110; x++) mask[y * W + x] = 1
    const alt = { width: W, height: H, data: Uint8ClampedArray.from(img.data) }
    for (let p = 0; p < W * H; p++) if (mask[p]) for (let c = 0; c < 3; c++) alt.data[p * 4 + c] = (p * 37 + c * 101) & 255
    const key = (g) => JSON.stringify([g.class, g.x.count, g.y.count, Array.from(g.x.cuts), Array.from(g.y.cuts), g.x.coherence, g.y.coherence])
    expect(key(detectGrid(alt, { mask, profile: 'd2' }))).toBe(key(detectGrid(img, { mask, profile: 'd2' })))
  })
})

// ---- exact constant-block factorization (canonical-rgba-geometry-spike.md): every candidate + ambiguity ----

/** NN upscale of a sprite by sx x sy, then crop ox / oy px off the left / top (phase shift). */
function nn(sp, sx, sy = sx, ox = 0, oy = 0) {
  const W = sp.w * sx - ox, H = sp.h * sy - oy, d = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = (Math.floor((y + oy) / sy) * sp.w + Math.floor((x + ox) / sx)) * 3
    d.set([sp.s[q], sp.s[q + 1], sp.s[q + 2], 255], (y * W + x) * 4)
  }
  return { width: W, height: H, data: d }
}
const checker = (w, h) => {
  const s = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) if (((i % w) + Math.floor(i / w)) & 1) s.fill(255, i * 3, i * 3 + 3)
  return { w, h, s }
}
const has = (g, sx, sy) => g.candidates.some((c) => c.sx === sx && c.sy === sy)

describe('detectGrid exact factorization', () => {
  it('anisotropic sx=2 / sy=3 -> exact 24 x 16 (spectral path miscounted 23)', () => {
    for (const sp of [sprite(11, 24, 16), checker(24, 16)]) {
      const g = detectGrid(nn(sp, 2, 3))
      expect([g.class, g.x.period, g.y.period, g.x.count, g.y.count]).toEqual(['exact', 2, 3, 24, 16])
      expect(g.candidates[0]).toEqual({ sx: 2, sy: 3, phaseX: 0, phaseY: 0, countX: 24, countY: 16 })
      expect(g.candidates.map((c) => [c.sx, c.sy])).toEqual([[2, 3], [1, 3], [2, 1], [1, 1]])
      expect(g.suggestedSize).toEqual([24, 16])
    }
  })

  it('1-px phase shift -> exact, phase 1, partial edge cells kept', () => {
    const g = detectGrid(nn(sprite(12, 33), 4, 4, 3, 3)) // first cell 1 px, 129 px wide
    expect([g.class, g.x.period, g.x.phase, g.y.phase, g.x.count]).toEqual(['exact', 4, 1, 1, 33])
    expect(Array.from(g.x.cuts.subarray(0, 4))).toEqual([0, 1, 5, 9])
    expect(g.x.cuts[g.x.count]).toBe(129)
  })

  it('equal-adjacent / nested x2 art -> every candidate, ambiguous; the target instructs the lattice', () => {
    const img = nn({ ...sprite(13, 8), w: 8, h: 8 }, 4) // 16x16 art of 2x2 equal cells, upscaled x2 = 8x8 at x4
    const g = detectGrid(img)
    expect(g.ambiguous).toBe(true)
    expect([has(g, 4, 4), has(g, 2, 2), has(g, 4, 1), has(g, 1, 1)]).toEqual([true, true, true, true])
    expect(g.evidence.join(' | ')).toMatch(/original grid not identified/)
    const t = detectGrid(img, { targetW: 16, targetH: 16 })
    expect([t.x.period, t.x.count, t.y.count]).toEqual([2, 16, 16])
    expect(t.evidence.join(' | ')).toMatch(/instructed lattice/)
  })

  it('checkerboard x4 -> divisor lattice of (4, 4), ambiguous', () => {
    const g = detectGrid(nn(checker(8, 8), 4))
    expect(g.candidates.map((c) => [c.sx, c.sy])).toEqual([[4, 4], [4, 2], [2, 4], [4, 1], [2, 2], [1, 4], [2, 1], [1, 2], [1, 1]])
    expect(g.ambiguous).toBe(true)
  })

  it('uniform 128^2 and 1-axis stripes -> ambiguous, no suggested size (not "native 2x2")', () => {
    const u = detectGrid(nn({ w: 1, h: 1, s: new Uint8Array([9, 99, 199]) }, 128))
    expect([u.ambiguous, u.suggestedSize, u.candidates.length]).toEqual([true, null, 64])
    expect([has(u, 128, 128), has(u, 1, 1)]).toEqual([true, true])
    const st = detectGrid(nn({ ...checker(8, 1), w: 8, h: 1 }, 4, 64)) // vertical stripes: y has no change
    expect([st.ambiguous, st.suggestedSize, st.x.period]).toEqual([true, null, 4])
  })

  it('1:1 native art is the trivial candidate with confidence < 1, not proof', () => {
    const g = detectGrid(render(sprite(1, 48), 48, 48, { px: 1 }).img)
    expect([g.class, g.x.count, g.ambiguous, g.suggestedSize]).toEqual(['exact', 48, false, [48, 48]])
    expect(g.confidence).toBeLessThan(1)
    expect(g.candidates).toEqual([{ sx: 1, sy: 1, phaseX: 0, phaseY: 0, countX: 48, countY: 48 }])
    expect(g.evidence.join(' | ')).toMatch(/heuristic, not proof/)
  })

  it('non-integer NN upscales of 1-bit / UI traps are not exact (regression: proc-1bit nonint-nn seed 40 was 1:1 "exact")', () => {
    for (const sp of proceduralSprites(1).filter((s) => ['proc-1bit', 'proc-ui'].includes(s.id))) {
      for (let seed = 30; seed <= 45; seed++) {
        const g = detectGrid(degrade(sp.img, PRESETS['nonint-nn'], seed).img)
        expect(`${sp.id}/${seed}: ${g.class}`).not.toMatch(/exact$/)
        expect(g.candidates.length).toBe(1) // only the trivial 1:1 factorization is valid
      }
    }
    expect(detectGrid(proceduralSprites(1).find((s) => s.id === 'proc-1bit').img).class).toBe('exact') // native: the 1:1 candidate
    // integer x13 on x but non-integer on y: (13, 1) stays a listed candidate, the approximate detector decides
    const m = detectGrid(render(sprite(15, 24), 312, 260, { px: 13, py: 260 / 24 }).img)
    expect(m.class).not.toBe('exact')
    expect(m.candidates[0]).toMatchObject({ sx: 13, sy: 1 })
    expect(m.y.count).toBe(24)
  })

  it('RGB under alpha 0 is not evidence (hidden RGB noise keeps the x4 factorization)', () => {
    const img = nn(sprite(14, 16), 4)
    for (let p = 0; p < 64 * 16; p++) img.data.set([p & 255, (p * 7) & 255, 3, 0], p * 4) // top quarter transparent, noisy RGB
    const g = detectGrid(img)
    expect([g.class, g.candidates[0].sx, g.candidates[0].sy]).toEqual(['exact', 4, 4])
  })

  it('spectral path exposes qualified alternative periods; output is deterministic', () => {
    const img = render(SP37, 1024, 1024, { px: P37, soft: true }).img
    const g = detectGrid(img)
    expect(g.alternatives.x.some((a) => a.count === 37 && a.score >= 0.78)).toBe(true)
    expect(g.candidates).toEqual([{ sx: 1, sy: 1, phaseX: 0, phaseY: 0, countX: 1024, countY: 1024 }])
    expect(g.suggestedSize).toEqual([37, 37])
    const e = nn(sprite(12, 33), 4, 4, 3, 3)
    expect(JSON.stringify(detectGrid(e))).toBe(JSON.stringify(detectGrid(e)))
  })
})

// ---- binding acceptance: local real AI samples (gitignored; skipped when absent) ----
// Expected counts = the implied logical grids measured in ai-artifact-characterization.md 1.1.
const REAL = [
  ['gpt-forest', 'gpt-forest.png', 250, 142],
  ['gpt-oni', 'gpt-oni.png', 125, 116],
  ['gemini-mage', 'gemini-mage.png', 145, 144],
  ['unk-dungeon', 'unk-dungeon.png', 245, 179],
  ['unk-coat', 'unk-coat.png', 60, 65],
]
const local = (rel) => repoPath('.local/samples/' + rel)

describe('detectGrid real samples', () => {
  for (const [id, rel, ex, ey] of REAL) {
    it.skipIf(!existsSync(local(rel)))(`${id} -> grid/weak at about ${ex}x${ey} (+-2%)`, () => {
      const g = detectGrid(readPng(local(rel)))
      expect(['grid', 'weak']).toContain(g.class)
      expect(Math.abs(g.x.count - ex)).toBeLessThanOrEqual(Math.max(2, 0.02 * ex))
      expect(Math.abs(g.y.count - ey)).toBeLessThanOrEqual(Math.max(2, 0.02 * ey))
    })
  }
  const wiz = 'ai-wizard.png'
  it.skipIf(!existsSync(local(wiz)))('ai-wizard painted control -> none', () => {
    expect(detectGrid(readPng(local(wiz))).class).toBe('none')
  })
})
