import type { Image, Numbers } from './types.ts'
// Output-only colour index and Q4 orphan classification (pixel-art-quality-metrics.md), shared by the
// test metrics (test/metrics.js), the truth-free scorer (scripts/score.mjs) and the recommendation
// rule (pipeline.js, D55). Pure functions over RGBA Img objects.
import { srgbToOklab } from './color.ts'

export const TAU_DUP = 0.03
export const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]

/** Index map: one index per exact opaque RGB (alpha >= 128), -1 = transparent. */
export function indexImage(img: Image) {
  const { width: w, height: h, data: d } = img
  const idx = new Int32Array(w * h), map = new Map(), lab = [], rgb = [], count = []
  let opaque = 0, partial = 0
  const t = new Float64Array(3)
  for (let p = 0; p < w * h; p++) {
    const a = d[p * 4 + 3]
    if (a > 0 && a < 255) partial++
    if (a < 128) { idx[p] = -1; continue }
    opaque++
    const key = (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2]
    let i = map.get(key)
    if (i === undefined) {
      i = lab.length; map.set(key, i)
      srgbToOklab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], t)
      lab.push([t[0], t[1], t[2]]); rgb.push(key); count.push(0)
    }
    count[i]++
    idx[p] = i
  }
  return { w, h, idx, lab, rgb, count, opaque, partial }
}

export const d2 = (a: Numbers, b: Numbers) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** Connected components over pixels where key(p) is not null; same(p,q) decides joining. */
export function components(w: number, h: number, member: (p: number) => boolean | number, same: (p: number, q: number) => boolean, conn8 = true) {
  const lab = new Int32Array(w * h).fill(-1), sizes: number[] = [], stack: number[] = []
  const nb = conn8 ? N8 : [[0, -1], [-1, 0], [1, 0], [0, 1]]
  for (let p = 0; p < w * h; p++) {
    if (lab[p] >= 0 || !member(p)) continue
    const id = sizes.length
    let n = 0
    lab[p] = id; stack.push(p)
    while (stack.length) {
      const q = stack.pop()!; n++
      const x = q % w, y = (q / w) | 0
      for (const [dx, dy] of nb) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const r = ny * w + nx
        if (lab[r] < 0 && member(r) && same(q, r)) { lab[r] = id; stack.push(r) }
      }
    }
    sizes.push(n)
  }
  return { lab, sizes }
}

/** Q12 helper: checker-dither membership (size >= 6 8-connected clusters). */
export function ditherMask(ix: ReturnType<typeof indexImage>) {
  const { w, h, idx } = ix, c = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x, a = idx[p], j = idx[p - 1]
    if (a < 0 || j < 0 || j === a || idx[p + 1] !== j || idx[p - w] !== j || idx[p + w] !== j) continue
    if (idx[p - w - 1] === a && idx[p - w + 1] === a && idx[p + w - 1] === a && idx[p + w + 1] === a) c[p] = 1
  }
  const cc = components(w, h, (p: number) => c[p] === 1, () => true)
  const m = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) if (c[p] && cc.sizes[cc.lab[p]] >= 6) m[p] = 1
  return m
}

/** Q4 orphans, classified (near/DITHER/AA/ACCENT/NOISE). Returns counts plus the orphan mask. */
export function q4(ix: ReturnType<typeof indexImage>, dither = ditherMask(ix)) {
  const { w, h, idx, lab } = ix, T2 = TAU_DUP * TAU_DUP
  const comp = components(w, h, (p: number) => idx[p] >= 0, (p: number, q: number) => idx[p] === idx[q])
  const coherent = (p: number) => idx[p] >= 0 && comp.sizes[comp.lab[p]] >= 4
  const r = { near: 0, dither: 0, aa: 0, accent: 0, noise: 0 }, orphan = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const a = idx[p]
    if (a < 0) continue
    const x = p % w, y = (p / w) | 0, nbs = []
    let allOpaque = true
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy
      const q = nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : ny * w + nx
      if (q < 0 || idx[q] < 0) { allOpaque = false; continue }
      nbs.push(q)
    }
    if (nbs.some((q) => idx[q] === a)) continue
    orphan[p] = 1
    if (nbs.some((q) => d2(lab[idx[q]], lab[a]) < T2)) { r.near++; continue }
    if (dither[p]) { r.dither++; continue }
    const L = lab[a][0]
    // ponytail: AA = between two coherent neighbour colours in L (no step-corner trace); refine if AA vs NOISE split matters.
    let aa = false
    for (let i = 0; i < nbs.length && !aa; i++) for (let j = i + 1; j < nbs.length && !aa; j++) {
      const A = idx[nbs[i]], B = idx[nbs[j]]
      if (A !== B && coherent(nbs[i]) && coherent(nbs[j])) {
        const la = lab[A][0], lb = lab[B][0]
        aa = (L - la) * (L - lb) < 0
      }
    }
    if (aa) { r.aa++; continue }
    if (allOpaque && (nbs.every((q) => lab[idx[q]][0] < L) || nbs.every((q) => lab[idx[q]][0] > L))) { r.accent++; continue }
    r.noise++
  }
  return { ...r, noiseRate: ix.opaque ? r.noise / ix.opaque : null, orphan }
}
