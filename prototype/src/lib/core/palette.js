// Step 6: palette from cell colors (contract: algorithm-design.md; literature C.6).
// Dedupe by RGB8 -> Wu (1991) box cuts on OKLab -> weighted Lloyd -> Ward merge -> medoids.
// All distances use toe-corrected L (toeL); palette entries keep the true OKLab of their medoid.
import { oklabToSrgb, srgbToOklab, toe, toeL } from './color.js'

const TAU_MERGE = 0.045, TAU_PROTECT = 0.12, MAX_LLOYD = 20, K_MAX = 64
// Wu lattice: 32 bins per axis over the sRGB gamut in OKLab (out-of-range values clamp to edge bins)
const BINS = 32, S1 = BINS + 1, LO = [0, -0.25, -0.33], HI = [1, 0.28, 0.21]

function nearest(P, k, x, y, z) {
  let best = 0, bd = Infinity
  for (let q = 0; q < k; q++) {
    let dd = x - P[q * 3]
    dd *= dd
    if (dd >= bd) continue
    const da = y - P[q * 3 + 1], db = z - P[q * 3 + 2]
    dd += da * da + db * db
    if (dd < bd) { bd = dd; best = q }
  }
  return best
}

/** Wu's variance-minimizing box cuts on a cumulative-moment lattice; returns a bin-id -> box map. */
function wu(U, wt, nu, k) {
  const bin = new Int32Array(nu), M = [0, 1, 2, 3, 4].map(() => new Float64Array(S1 * S1 * S1))
  const at = (r, g, b) => (r * S1 + g) * S1 + b
  for (let i = 0; i < nu; i++) {
    const q = [0, 1, 2].map((a) => 1 + Math.min(BINS - 1, Math.max(0, Math.floor(((U[i * 3 + a] - LO[a]) / (HI[a] - LO[a])) * BINS))))
    const o = at(q[0], q[1], q[2]), w = wt[i], x = U[i * 3], y = U[i * 3 + 1], z = U[i * 3 + 2]
    bin[i] = o
    M[0][o] += w; M[1][o] += w * x; M[2][o] += w * y; M[3][o] += w * z; M[4][o] += w * (x * x + y * y + z * z)
  }
  for (const m of M) {
    for (let r = 1; r < S1; r++) for (let g = 1; g < S1; g++) for (let b = 1; b < S1; b++) {
      m[at(r, g, b)] += m[at(r - 1, g, b)] + m[at(r, g - 1, b)] + m[at(r, g, b - 1)]
        - m[at(r - 1, g - 1, b)] - m[at(r - 1, g, b - 1)] - m[at(r, g - 1, b - 1)] + m[at(r - 1, g - 1, b - 1)]
    }
  }
  // box = [r0, r1, g0, g1, b0, b1], lower bound exclusive
  const vol = (bx, m) => m[at(bx[1], bx[3], bx[5])] - m[at(bx[0], bx[3], bx[5])] - m[at(bx[1], bx[2], bx[5])] - m[at(bx[1], bx[3], bx[4])]
    + m[at(bx[0], bx[2], bx[5])] + m[at(bx[0], bx[3], bx[4])] + m[at(bx[1], bx[2], bx[4])] - m[at(bx[0], bx[2], bx[4])]
  const gain = (bx) => { const w = vol(bx, M[0]); if (w <= 0) return 0; const x = vol(bx, M[1]), y = vol(bx, M[2]), z = vol(bx, M[3]); return (x * x + y * y + z * z) / w }
  const variance = (bx) => (vol(bx, M[0]) > 0 ? vol(bx, M[4]) - gain(bx) : 0)
  const boxes = [[0, BINS, 0, BINS, 0, BINS]], vars = [variance(boxes[0])]
  while (boxes.length < k) {
    let bi = 0
    for (let b = 1; b < boxes.length; b++) if (vars[b] > vars[bi]) bi = b
    if (vars[bi] <= 0) break
    const bx = boxes[bi]
    let best = -Infinity, cut = null
    for (let ax = 0; ax < 3; ax++) {
      for (let p = bx[ax * 2] + 1; p < bx[ax * 2 + 1]; p++) {
        const A = bx.slice(), B = bx.slice()
        A[ax * 2 + 1] = p; B[ax * 2] = p
        if (vol(A, M[0]) <= 0 || vol(B, M[0]) <= 0) continue
        const g = gain(A) + gain(B)
        if (g > best) { best = g; cut = [A, B] }
      }
    }
    if (!cut) { vars[bi] = 0; continue }
    boxes[bi] = cut[0]; vars[bi] = variance(cut[0])
    boxes.push(cut[1]); vars.push(variance(cut[1]))
  }
  const assign = new Int32Array(nu)
  for (let i = 0; i < nu; i++) {
    const o = bin[i], r = Math.floor(o / (S1 * S1)), g = Math.floor(o / S1) % S1, b = o % S1
    for (let q = 0; q < boxes.length; q++) {
      const bx = boxes[q]
      if (r > bx[0] && r <= bx[1] && g > bx[2] && g <= bx[3] && b > bx[4] && b <= bx[5]) { assign[i] = q; break }
    }
  }
  return { assign, k: boxes.length }
}

/**
 * buildPalette(cells, { colors: 'auto' | number, palette?: Uint8Array (flat RGB), exact?: boolean })
 * -> Indexed { w, h, index, palette (OKLab), rgb (flat RGB8, the rendered bytes), warnings }.
 * Transparent cells get -1. `palette`: imported RGB entries, nearest-entry snap (rendered byte-exact).
 * `exact` (class 'exact', or ≥ 95% of cells `pure`; colors 'auto'; ≤ 256 unique colors, else Wu as
 * usual, warned): palette = the unique cell colors. Every entry's RGB8 is the cell's exact source RGB
 * when it is pure (`cells.rgb`), else its OKLab rounded once. Watermark-masked cells
 * (`cells.masked`) do not shape the palette; they snap to the nearest entry.
 */
export function buildPalette(cells, { colors = 'auto', palette, exact = false } = {}) {
  const { w, h, lab, alpha } = cells, n = w * h, masked = cells.masked, exactRgb = cells.rgb
  const index = new Int16Array(n).fill(-1), warnings = []
  const snap = (pal, keys) => {
    const k = pal.length / 3
    const P = toe(pal), rgb = new Uint8Array(k * 3)
    for (let q = 0; q < k; q++) { rgb[q * 3] = keys[q] >> 16; rgb[q * 3 + 1] = (keys[q] >> 8) & 255; rgb[q * 3 + 2] = keys[q] & 255 }
    for (let c = 0; c < n; c++) if (alpha[c] && index[c] < 0) index[c] = k ? nearest(P, k, toeL(lab[c * 3]), lab[c * 3 + 1], lab[c * 3 + 2]) : -1
    return { w, h, index, palette: Float32Array.from(pal), rgb, warnings }
  }
  if (palette) {
    const k = palette.length / 3, pl = new Float64Array(k * 3), keys = []
    for (let q = 0; q < k; q++) { srgbToOklab(palette[q * 3], palette[q * 3 + 1], palette[q * 3 + 2], pl, q * 3); keys.push((palette[q * 3] << 16) | (palette[q * 3 + 1] << 8) | palette[q * 3 + 2]) }
    return snap(pl, keys)
  }
  // dedupe by RGB8 (first occurrence is the representative) with counts
  const keyOf = new Map(), cellU = new Int32Array(n).fill(-1), rgb = new Float64Array(3)
  const Ulist = [], wlist = [], klist = []
  for (let c = 0; c < n; c++) {
    if (!alpha[c] || (masked && masked[c])) continue
    let key = exactRgb ? exactRgb[c] : -1
    if (key < 0) { oklabToSrgb(lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2], rgb, 0); key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] }
    let u = keyOf.get(key)
    if (u === undefined) { u = wlist.length; keyOf.set(key, u); Ulist.push(lab[c * 3], lab[c * 3 + 1], lab[c * 3 + 2]); wlist.push(0); klist.push(key) }
    wlist[u]++; cellU[c] = u
  }
  const nu = wlist.length
  // a clean grid (≥ 95% of palette cells pure, ≤ 256 colors) is treated like class 'exact'
  let shaping = 0, pureCells = 0
  for (let c = 0; c < n; c++) if (cellU[c] >= 0) { shaping++; if (cells.pure && cells.pure[c]) pureCells++ }
  if (shaping && pureCells >= 0.95 * shaping) exact = true
  if (exact && colors === 'auto') {
    if (nu <= 256) { // larger palettes would overflow Int16 indices and K x K tables
      for (let c = 0; c < n; c++) index[c] = cellU[c]
      return snap(Ulist, klist)
    }
    warnings.push(`exact art quantized: ${nu} unique colors > 256`)
  }
  if (nu === 0) return snap([], [])
  const U = toe(Ulist), wt = Float64Array.from(wlist)
  const maxK = colors === 'auto' ? Infinity : Math.max(1, colors | 0)
  if (colors !== 'auto' && maxK > K_MAX && nu > K_MAX) warnings.push(`palette capped at ${K_MAX} colors (requested ${maxK})`)

  // Wu init -> weighted Lloyd (empty clusters dropped, ties to the lowest index)
  let { assign, k } = wu(U, wt, nu, Math.min(K_MAX, nu)), C = null, N = null
  const centroids = () => {
    const S = new Float64Array(k * 3), Mw = new Float64Array(k)
    for (let i = 0; i < nu; i++) {
      const a = assign[i], wi = wt[i]
      Mw[a] += wi; S[a * 3] += wi * U[i * 3]; S[a * 3 + 1] += wi * U[i * 3 + 1]; S[a * 3 + 2] += wi * U[i * 3 + 2]
    }
    const remap = new Int32Array(k).fill(-1)
    let j = 0
    for (let q = 0; q < k; q++) if (Mw[q] > 0) remap[q] = j++
    C = new Float64Array(j * 3); N = new Float64Array(j)
    for (let q = 0; q < k; q++) {
      const r = remap[q]
      if (r < 0) continue
      N[r] = Mw[q]; C[r * 3] = S[q * 3] / Mw[q]; C[r * 3 + 1] = S[q * 3 + 1] / Mw[q]; C[r * 3 + 2] = S[q * 3 + 2] / Mw[q]
    }
    for (let i = 0; i < nu; i++) assign[i] = remap[assign[i]]
    k = j
  }
  centroids()
  for (let it = 0; it < MAX_LLOYD; it++) {
    // Elkan's bound: a point strictly closer to its center than half that center's nearest-center
    // distance cannot change assignment, so skipping the scan is exact
    const half = new Float64Array(k).fill(Infinity)
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      if (i === j) continue
      const dL = C[i * 3] - C[j * 3], da = C[i * 3 + 1] - C[j * 3 + 1], db = C[i * 3 + 2] - C[j * 3 + 2]
      half[i] = Math.min(half[i], (dL * dL + da * da + db * db) / 4)
    }
    let changed = 0
    for (let i = 0; i < nu; i++) {
      const c = assign[i], dL = U[i * 3] - C[c * 3], da = U[i * 3 + 1] - C[c * 3 + 1], db = U[i * 3 + 2] - C[c * 3 + 2]
      if (dL * dL + da * da + db * db < half[c]) continue
      const a = nearest(C, k, U[i * 3], U[i * 3 + 1], U[i * 3 + 2])
      if (a !== assign[i]) { assign[i] = a; changed++ }
    }
    if (!changed) break
    centroids()
  }

  // Ward merging: pairs closer than TAU_MERGE (never touching protected clusters), then down to maxK
  const alive = new Uint8Array(k).fill(1), parent = Int32Array.from({ length: k }, (_, q) => q)
  const d2 = (i, j) => { const dL = C[i * 3] - C[j * 3], da = C[i * 3 + 1] - C[j * 3 + 1], db = C[i * 3 + 2] - C[j * 3 + 2]; return dL * dL + da * da + db * db }
  let live = k
  while (live > 1) {
    const prot = new Uint8Array(k)
    for (let i = 0; i < k; i++) {
      if (!alive[i]) continue
      let nn = Infinity
      for (let j = 0; j < k; j++) if (j !== i && alive[j]) nn = Math.min(nn, d2(i, j))
      prot[i] = nn > TAU_PROTECT * TAU_PROTECT ? 1 : 0
    }
    const pick = (needClose, allowProt) => {
      let bi = -1, bj = -1, bc = Infinity
      for (let i = 0; i < k; i++) {
        if (!alive[i] || (!allowProt && prot[i])) continue
        for (let j = i + 1; j < k; j++) {
          if (!alive[j] || (!allowProt && prot[j])) continue
          const dd = d2(i, j)
          if (needClose && dd >= TAU_MERGE * TAU_MERGE) continue
          const cost = allowProt ? dd : (N[i] * N[j]) / (N[i] + N[j]) * dd // user cap over protection: plain distance spares far glints longest
          if (cost < bc) { bc = cost; bi = i; bj = j }
        }
      }
      return bi < 0 ? null : [bi, bj]
    }
    const pair = pick(true, false) || (live > maxK ? pick(false, false) || pick(false, true) : null)
    if (!pair) break
    const [i, j] = pair, s = N[i] + N[j]
    for (let a = 0; a < 3; a++) C[i * 3 + a] = (N[i] * C[i * 3 + a] + N[j] * C[j * 3 + a]) / s
    N[i] = s; alive[j] = 0; parent[j] = i; live--
  }
  const root = (q) => { while (parent[q] !== q) q = parent[q]; return q }
  // final clusters in order of first alive index; entry = medoid (member nearest the merged centroid)
  const slot = new Int32Array(k).fill(-1)
  let K = 0
  for (let q = 0; q < k; q++) if (alive[q]) slot[q] = K++
  const uCluster = new Int32Array(nu), bestD = new Float64Array(K).fill(Infinity), med = new Int32Array(K)
  for (let i = 0; i < nu; i++) {
    const r = root(assign[i]), s = slot[r]
    uCluster[i] = s
    const dL = U[i * 3] - C[r * 3], da = U[i * 3 + 1] - C[r * 3 + 1], db = U[i * 3 + 2] - C[r * 3 + 2]
    const dd = dL * dL + da * da + db * db
    if (dd < bestD[s]) { bestD[s] = dd; med[s] = i }
  }
  const pal = new Float32Array(K * 3), keys = []
  for (let s = 0; s < K; s++) { keys.push(klist[med[s]]); for (let a = 0; a < 3; a++) pal[s * 3 + a] = Ulist[med[s] * 3 + a] }
  for (let c = 0; c < n; c++) if (cellU[c] >= 0) index[c] = uCluster[cellU[c]]
  return snap(pal, keys) // masked opaque cells (index still -1) snap to the nearest entry
}
