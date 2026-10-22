import type { Image, Grid, Axis, Numbers, Pair, GridCandidate } from './types.ts'
type EdgeProfile = ReturnType<typeof edgeProfiles>
type Spectrum = ReturnType<typeof spectrum>
type AxisSetup = ReturnType<typeof setupAxis>
export interface EdgeState { pr: EdgeProfile; axes: AxisSetup[] }
export interface GridOptions { targetW?: number; targetH?: number; mask?: Uint8Array | null; preset?: { jpegStrict?: boolean }; profile?: string; noRefine?: boolean; edges?: Map<string, EdgeState> | null }
// Grid detection (contract Step 3): recover the fake-pixel lattice per axis — period, phase and
// (optionally drifting) cut positions — plus a gridded/illustration verdict with evidence.
// Deterministic: + - * / sqrt floor round abs only; twiddles come from color.js sinDet/cosDet;
// every argmax keeps the first (lowest-index) maximum.
import { srgbToOklab, sinDet, cosDet } from './color.ts'

const TWO_PI = 6.283185307179586
const FLOOR = 8 // per-term L1 noise floor (sum of 4 premultiplied channels): flat-area grain/JPEG noise
const QMIN = 2.1 // smallest period searched
const QUAL = 0.78 // smallest-qualified rule
const LINES = 96 // sampled rows/columns for the within-cell uniformity guard

// ---------------------------------------------------------------- FFT (radix-2, table twiddles)

const twiddles = new Map() // N -> { c, s }; built once per size, deterministic values
function tw(N: number) {
  let t = twiddles.get(N)
  if (!t) {
    const c = new Float64Array(N / 2), s = new Float64Array(N / 2)
    for (let k = 0; k < N / 2; k++) { c[k] = cosDet((TWO_PI * k) / N); s[k] = sinDet((TWO_PI * k) / N) }
    twiddles.set(N, (t = { c, s }))
  }
  return t
}

/** In-place forward FFT (e^{-i}), N a power of two. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length, { c, s } = tw(n)
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const wr = c[k * step], wi = -s[k * step], a = i + k, b = a + half
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
      }
    }
  }
}

// ---------------------------------------------------------------- edge profiles

/**
 * Premultiplied per-channel L1 differences between adjacent pixels, soft-thresholded by FLOOR
 * (flat backgrounds and grain contribute nothing), clamped at the p95 of unmasked terms above the
 * median, summed per boundary. Boundary i sits between pixel i-1 and i (P[0] = P[len] = 0).
 * Also: 3 band profiles per axis (for windowed agreement) and period-8 JPEG blockiness.
 * profile 'd2': boundary-centred second differences |d(i+1) - d(i-1)| (d = the first difference)
 * replace them: a smooth (bilinear/bicubic) upscale has no steps, its lattice is in the slope kinks
 * at the sample centres (no blockiness then).
 */
function edgeProfiles(img: Image, mask?: Uint8Array | null, profile = 'd1') {
  const W = img.width, H = img.height, d = img.data, n = W * H
  const pm = new Uint8Array(n * 4)
  for (let o = 0; o < n * 4; o += 4) {
    const a = d[o + 3]
    pm[o + 3] = a
    if (a === 255) { pm[o] = d[o]; pm[o + 1] = d[o + 1]; pm[o + 2] = d[o + 2] }
    else { pm[o] = (d[o] * a + 127) / 255; pm[o + 1] = (d[o + 1] * a + 127) / 255; pm[o + 2] = (d[o + 2] * a + 127) / 255 }
  }
  const tx = new Uint16Array(n), ty = new Uint16Array(n), hist = new Float64Array(1021)
  let terms = 0
  // Blockiness: mean small difference by position mod 7/8/9 (period 8 = JPEG, 7/9 = controls).
  const bs = [new Float64Array(7), new Float64Array(8), new Float64Array(9)], bc = bs.map((a) => new Float64Array(a.length))
  const block = (pos: number, v: number) => { for (let m = 0; m < 3; m++) { const r = pos % (7 + m); bs[m][r] += v; bc[m][r]++ } }
  const d2 = profile === 'd2' // its terms read pixels -2..+1 along the axis; the mask test covers all four
  const sd = (o: number, s: number) => { // second difference at the boundary before pixel offset o (s = pixel stride in bytes), clamped
    let v = 0
    for (let c = 0; c < 4; c++) v += Math.abs(pm[o + s + c] - pm[o + c] - pm[o - s + c] + pm[o - 2 * s + c])
    return v < 1020 + FLOOR ? v : 1020 + FLOOR
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, o = p * 4
      if ((d2 ? x >= 2 && x < W - 1 : x > 0) && !(mask && (mask[p] || mask[p - 1] || (d2 && (mask[p - 2] || mask[p + 1]))))) {
        const v = d2 ? sd(o, 4) : Math.abs(pm[o] - pm[o - 4]) + Math.abs(pm[o + 1] - pm[o - 3]) + Math.abs(pm[o + 2] - pm[o - 2]) + Math.abs(pm[o + 3] - pm[o - 1])
        if (!d2 && v < 12 && (y & 3) === 0) block(x, v)
        terms++
        if (v > FLOOR) { tx[p] = v - FLOOR; hist[v - FLOOR]++ } else hist[0]++
      }
      if ((d2 ? y >= 2 && y < H - 1 : y > 0) && !(mask && (mask[p] || mask[p - W] || (d2 && (mask[p - 2 * W] || mask[p + W]))))) {
        const q = o - 4 * W
        const v = d2 ? sd(o, 4 * W) : Math.abs(pm[o] - pm[q]) + Math.abs(pm[o + 1] - pm[q + 1]) + Math.abs(pm[o + 2] - pm[q + 2]) + Math.abs(pm[o + 3] - pm[q + 3])
        if (!d2 && v < 12 && (x & 3) === 0) block(y, v)
        terms++
        if (v > FLOOR) { ty[p] = v - FLOOR; hist[v - FLOOR]++ } else hist[0]++
      }
    }
  }
  // Median of all unmasked terms, then p95 of the terms above it.
  let acc = 0, med = 0
  while (med < 1020 && acc + hist[med] <= terms / 2) acc += hist[med++]
  let above = 0
  for (let v = med + 1; v <= 1020; v++) above += hist[v]
  let clamp = 1020
  if (above > 0) {
    acc = 0
    for (clamp = med + 1; clamp < 1020; clamp++) if ((acc += hist[clamp]) >= 0.95 * above) break
  }
  const Px = new Float64Array(W + 1), Py = new Float64Array(H + 1)
  const bx = [0, 1, 2].map(() => new Float64Array(W + 1)), by = [0, 1, 2].map(() => new Float64Array(H + 1))
  const bandX = new Uint8Array(W)
  for (let x = 0; x < W; x++) bandX[x] = Math.floor((x * 3) / W)
  for (let y = 0; y < H; y++) {
    const rowBand = bx[Math.floor((y * 3) / H)]
    for (let x = 0, p = y * W; x < W; x++, p++) {
      let v = tx[p]
      if (v) rowBand[x] += v < clamp ? v : clamp
      v = ty[p]
      if (v) by[bandX[x]][y] += v < clamp ? v : clamp
    }
  }
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i <= W; i++) Px[i] += bx[b][i]
    for (let i = 0; i <= H; i++) Py[i] += by[b][i]
  }
  // Blockiness per period: best-phase mean / mean of the other phases.
  const blockiness = bs.map((s, m) => {
    let tot = 0, cnt = 0, best = 0, bi = 0
    for (let r = 0; r < s.length; r++) {
      tot += s[r]; cnt += bc[m][r]
      const mean = bc[m][r] ? s[r] / bc[m][r] : 0
      if (mean > best) { best = mean; bi = r }
    }
    const rest = cnt - bc[m][bi]
    return rest > 0 && tot - s[bi] > 0 ? best / ((tot - s[bi]) / rest) : 1
  })
  return { W, H, pm, Px, Py, bx, by, blockiness, d2 }
}

// ---------------------------------------------------------------- spectra and scores

/** Hann-windowed, mean-removed, >= 8x zero-padded FFT magnitude of P[a..b). */
function spectrum(P: Float64Array, a: number, b: number) {
  const n = b - a
  let N = 1
  while (N < n) N <<= 1
  N *= 8
  const re = new Float64Array(N), im = new Float64Array(N)
  let mean = 0
  for (let i = a; i < b; i++) mean += P[i]
  mean /= n
  for (let i = 0; i < n; i++) re[i] = (P[a + i] - mean) * (0.5 - 0.5 * cosDet((TWO_PI * i) / (n - 1)))
  fft(re, im)
  const M = new Float64Array(N / 2 + 1)
  for (let k = 0; k <= N / 2; k++) M[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k])
  return { M, N, n }
}

const magAt = (sp: Pick<Spectrum, "M" | "N">, f: number) => {
  const x = f * sp.N, i = Math.floor(x), t = x - i
  return i + 1 < sp.M.length ? sp.M[i] * (1 - t) + sp.M[i + 1] * t : sp.M[sp.M.length - 1]
}

/** Median magnitude over the searched band (noise level for prominence and the harmonic sum). */
function bandMedian(sp: Spectrum, qmax: number) {
  const lo = Math.max(1, Math.floor(sp.N / qmax)), hi = Math.min(sp.M.length - 1, Math.ceil(sp.N / QMIN))
  const v = Float64Array.from(sp.M.subarray(lo, hi + 1)).sort()
  return v.length ? v[v.length >> 1] : 0
}

/**
 * Line spectrum: magnitude / local mean over +-24 natural bins (broad content energy such as sprite
 * shapes scores ~1; only line-like lattice harmonics stand out), then a running max over +-1.5
 * natural bins so the 0.25% period grid and drift sidebands do not miss a smeared line.
 */
function whiten(sp: Spectrum) {
  const { M, N, n } = sp, K = M.length, bin = N / n, r = Math.max(1, Math.round(24 * bin)), pre = new Float64Array(K + 1)
  for (let k = 0; k < K; k++) pre[k + 1] = pre[k] + M[k]
  const Wh = new Float64Array(K), Pk = new Float64Array(K), rm = Math.max(1, Math.round(1.5 * bin))
  for (let k = 0; k < K; k++) {
    const a = Math.max(0, k - r), b = Math.min(K, k + r + 1), m = (pre[b] - pre[a]) / (b - a)
    Wh[k] = m > 0 ? M[k] / m : 0
  }
  for (let k = 0; k < K; k++) {
    let m = 0
    for (let j = Math.max(0, k - rm); j <= Math.min(K - 1, k + rm); j++) if (Wh[j] > m) m = Wh[j]
    Pk[k] = m
  }
  return { M: Pk, N }
}

/**
 * Harmonic sum over h/q below Nyquist of the line excess (<= 2 x local mean adds nothing), weighted
 * 1/h: a multiple kq of the true period then scores ~S(q)/k instead of a superset of S(q).
 */
function harmonicSum(wh: ReturnType<typeof whiten>, q: number) {
  let s = 0
  for (let h = 1; h / q < 0.5; h++) { const m = magAt(wh, h / q) - 2; if (m > 0) s += m / h }
  return s
}

/**
 * Period candidates = local maxima of the harmonic sum on a 0.25% log grid over [2.1, qmax],
 * plus optional extra periods (target prior). Returns the smallest scoring >= 0.78 x best
 * (allowed(q) may veto a candidate, e.g. JPEG-like periods) and every qualified [q, score] by q.
 */
function smallestQualified(sp: Spectrum, qmax: number, extra: number[] = [], allowed: ((q: number) => boolean) | null = null) {
  if (qmax < QMIN) return null
  const wh = whiten(sp), qs = [], ss = []
  for (let q = QMIN; q <= qmax; q *= 1.0025) { qs.push(q); ss.push(harmonicSum(wh, q)) }
  const cand = []
  for (let i = 0; i < qs.length; i++) {
    if ((i === 0 || ss[i] > ss[i - 1]) && (i === qs.length - 1 || ss[i] >= ss[i + 1]) && ss[i] > 0) cand.push([qs[i], ss[i]])
  }
  for (const q of extra) if (q >= QMIN && q <= qmax) cand.push([q, harmonicSum(wh, q)])
  const ok = allowed ? cand.filter(([q]) => allowed(q)) : cand
  let best = 0
  for (const [, s] of ok) if (s > best) best = s
  if (best <= 0) return null
  let pick = Infinity
  for (const [q, s] of ok) if (s >= QUAL * best && q < pick) pick = q
  const qualified = (q: number) => { // within +-1% (the 0.25% grid's peaks are sharp)
    for (let k = -4; k <= 4; k++) if (harmonicSum(wh, q * (1 + 0.0025 * k)) >= QUAL * best) return true
    return false
  }
  const alternatives = ok.filter(([, s]) => s >= QUAL * best).sort((a, b) => a[0] - b[0])
  return { q: pick, score: best, qualified, alternatives }
}

/** Exact DFT of the mean-removed profile x at frequency f (rotation recurrence, one sinDet). */
function dft(x: Float64Array, f: number) {
  const c = cosDet(TWO_PI * f), s = sinDet(TWO_PI * f)
  let wr = 1, wi = 0, re = 0, im = 0
  for (let i = 0; i < x.length; i++) {
    re += x[i] * wr; im -= x[i] * wi
    const t = wr * c - wi * s
    wi = wr * s + wi * c; wr = t
  }
  return Math.sqrt(re * re + im * im)
}

/** Cosine-comb score, maximized over phase: sum of DFT magnitudes at harmonics h <= H below Nyquist. */
function combScore(x: Float64Array, q: number) {
  const H = Math.min(8, Math.ceil(q / 2) - 1)
  let s = 0
  for (let h = 1; h <= H && h / q < 0.5; h++) s += dft(x, h / q)
  return s
}

/**
 * Refine the period around q0 maximizing combScore: 5 zoom rounds of 17 points over +-2% or
 * +-1.5 natural FFT bins, whichever is wider (few cells = coarse spectral peaks).
 */
function refinePeriod(x: Float64Array, q0: number) {
  let q = q0, hw = q0 * Math.max(0.02, (1.5 * q0) / x.length), best = combScore(x, q0)
  for (let r = 0; r < 5; r++) {
    const c = q
    for (let k = -8; k <= 8; k++) {
      const t = c + (k * hw) / 8
      if (t < QMIN || k === 0) continue
      const s = combScore(x, t)
      if (s > best) { best = s; q = t }
    }
    hw /= 4
  }
  return { q, score: best }
}

/** Mean-removed copy of the profile interior (boundaries 1..len-1; ends set to 0). */
function centered(P: Float64Array) {
  const len = P.length - 1, x = new Float64Array(len + 1)
  let m = 0
  for (let i = 1; i < len; i++) m += P[i]
  m /= Math.max(1, len - 1)
  for (let i = 1; i < len; i++) x[i] = P[i] - m
  return x
}

/** Normalized edge signal for comb/DP: max(own, half the stronger neighbour) / p90, capped at 1. */
function edgeSignal(P: Float64Array) {
  const len = P.length - 1, e = new Float64Array(len + 1)
  for (let i = 1; i < len; i++) e[i] = Math.max(P[i], 0.5 * Math.max(P[i - 1], P[i + 1]))
  const s = Float64Array.from(e.subarray(1, len).filter((v) => v > 0)).sort() // nonzero: sparse sprites keep a real scale
  const p90 = s.length ? s[Math.floor(0.9 * (s.length - 1))] : 0
  for (let i = 0; i <= len; i++) e[i] = p90 > 0 ? Math.min(1, e[i] / p90) : 0
  return e
}

const interp = (e: Float64Array, t: number) => {
  const i = Math.floor(t)
  if (i < 0) return e[0]
  if (i >= e.length - 1) return e[e.length - 1]
  return e[i] + (e[i + 1] - e[i]) * (t - i)
}

/** Phase by quarter-pixel comb search: argmax over phi of the mean interpolated edge at phi + k p. */
function phaseOf(e: Float64Array, len: number, p: number) {
  let best = -1, phase = 0
  for (let j = 0; j < 4 * p; j++) {
    const phi = j / 4
    let s = 0, n = 0
    for (let c = phi; c <= len; c += p) { s += interp(e, c); n++ }
    if (s / n > best) { best = s / n; phase = phi }
  }
  return p - phase < 0.125 ? 0 : phase // same lattice within 1/8 px: keep phase in [0, p) visibly (no "16 of 16")
}

// ---------------------------------------------------------------- cuts

/** Regular cuts phase + k p, with cuts[0] = 0, cuts[N] = len; edge slivers < half a cell merge inward. */
function regularCuts(len: number, p: number, phase: number) {
  const c = [0]
  for (let k = phase > 1e-9 ? 0 : 1; phase + k * p < len - 1e-9; k++) c.push(phase + k * p)
  c.push(len)
  return mergeSlivers(c, p)
}

function mergeSlivers(c: number[], p: number) {
  if (c.length > 2 && c[1] < 0.5 * p) c.splice(1, 1)
  if (c.length > 2 && c[c.length - 1] - c[c.length - 2] <= 0.5 * p) c.splice(c.length - 2, 1)
  return c
}

/**
 * Elastic cuts: DP on a quarter-pixel lattice maximizing sum of edge strength at cuts minus
 * lambda (s - p)^2, lambda = 1 / (0.25 p)^2, widths in [0.75p, 1.3p]; free partial first/last cell.
 */
function elasticCuts(e: Float64Array, len: number, p: number) {
  const L = len * 4, lam = 1 / (0.25 * p * (0.25 * p))
  const smin = Math.ceil(3 * p), smax = Math.floor(5.2 * p)
  const pen = new Float64Array(smax + 1)
  for (let s = smin; s <= smax; s++) { const dd = s / 4 - p; pen[s] = lam * dd * dd }
  const F = new Float64Array(L + 1).fill(-Infinity), from = new Int32Array(L + 1).fill(-1)
  for (let j = 1; j < L; j++) {
    let best = j <= smax ? 0 : -Infinity, arg = -1
    for (let s = smin, jp = j - smin; s <= smax && jp >= 1; s++, jp--) {
      const v = F[jp] - pen[s]
      if (v > best) { best = v; arg = jp }
    }
    if (best > -Infinity) { F[j] = best + interp(e, j / 4); from[j] = arg }
  }
  let bj = -1, bv = -Infinity
  for (let j = Math.max(1, L - smax); j < L; j++) if (F[j] > bv) { bv = F[j]; bj = j }
  const inner = []
  for (let j = bj; j > 0; j = from[j]) inner.push(j / 4)
  return mergeSlivers([0, ...inner.reverse(), len], p)
}

/**
 * Count-constrained cuts (idea: Real-PixelArt `targetAxis`, MIT; clean-room, D52): exactly n cells over
 * [0, len]. Interior cut k lies within +-0.45p of its anchor k p + d (d = the comb phase, signed: the
 * regular lattice after sliver merging); quarter-pixel DP minimizing sum over cuts of -e(c) +
 * 1.2 ((c - anchor) / p)^2 plus sum over interior cells of 3.5 ((width - p) / p)^2; the two edge cells
 * are free within [0.5p, 1.5p]. Null when no path exists.
 */
function countCuts(e: Float64Array, len: number, n: number, phase: number) {
  const p = len / n, R = 0.45 * p, d = phase > p / 2 ? phase - p : phase
  const gapC = (g: number, edge: boolean) => { if (edge) return g < 0.5 * p || g > 1.5 * p ? Infinity : 0; const t = (g - p) / p; return 3.5 * t * t }
  let prevPos = [0], prevCost = [0]
  const levels = []
  for (let k = 1; k < n; k++) {
    const a = k * p + d, lo = Math.max(1, Math.ceil((a - R) * 4)), hi = Math.min(len * 4 - 1, Math.floor((a + R) * 4))
    const pos = [], cost = [], from = []
    for (let j = lo; j <= hi; j++) {
      const c = j / 4
      let bv = Infinity, bi = -1
      for (let i = 0; i < prevPos.length && prevPos[i] < c; i++) {
        const v = prevCost[i] + gapC(c - prevPos[i], k === 1)
        if (v < bv) { bv = v; bi = i }
      }
      if (bv === Infinity) continue
      const t = (c - a) / p
      from.push(bi); pos.push(c); cost.push(bv - interp(e, c) + 1.2 * t * t)
    }
    if (!pos.length) return null
    levels.push({ pos, from })
    prevPos = pos; prevCost = cost
  }
  let bv = Infinity, bi = -1
  for (let i = 0; i < prevPos.length; i++) { const v = prevCost[i] + gapC(len - prevPos[i], true); if (v < bv) { bv = v; bi = i } }
  if (bi < 0) return null
  const cuts = new Array(n + 1)
  cuts[0] = 0; cuts[n] = len
  for (let k = n - 1; k >= 1; k--) { const L = levels[k - 1]; cuts[k] = L.pos[bi]; bi = L.from[bi] }
  return cuts
}

function capture(e: Float64Array, cuts: Numbers) {
  let s = 0
  for (let k = 1; k < cuts.length - 1; k++) s += interp(e, cuts[k])
  return s
}

/** |sum x_i e^{-2 pi i u(i)}| / sum |x_i|, u = cell coordinate warped through the cuts (= DFT coherence when regular). */
function coherence(x: Float64Array, cuts: Numbers) {
  const N = cuts.length - 1, len = x.length - 1
  let re = 0, im = 0, tot = 0, k = 0
  for (let i = 1; i < len; i++) {
    while (k < N - 1 && i >= cuts[k + 1]) k++
    // edge cells extrapolate with their inner neighbour's width (cut 0 / len are canvas borders)
    let u
    if (k === 0 && N > 1) u = 1 - (cuts[1] - i) / (cuts[2] - cuts[1] || 1)
    else u = k + (i - cuts[k]) / (cuts[k + 1] - cuts[k])
    const a = TWO_PI * (u - Math.floor(u))
    re += x[i] * cosDet(a); im += x[i] * sinDet(a); tot += Math.abs(x[i])
  }
  return tot > 0 ? Math.sqrt(re * re + im * im) / tot : 0
}

const expNeg = (x: number) => { if (x >= 40) return 0; let v = 1 - x / 1024; for (let i = 0; i < 10; i++) v *= v; return v } // ~e^-x with * only

/**
 * Chance-corrected edge support (idea: Real-PixelArt, MIT; clean-room, D52): peaks of the edge signal
 * (local maxima, first index of a plateau, above min + 0.16 range) weighted by height; match =
 * gauss(d / tol), d = distance to the nearest cut ('d2': nearest cell centre), tol = max(0.65, 0.14p);
 * chance = min(0.85, 2.5066 tol / p) (the share uniform edges would reach); support =
 * clip((match - chance) / (1 - chance), 0, 1). Null below 4 peaks.
 */
function edgeSupport(A: AxisSetup, cuts: Numbers, p: number) {
  const e = A.e, len = A.len
  let lo = Infinity, hi = -Infinity
  for (let i = 1; i < len; i++) { if (e[i] < lo) lo = e[i]; if (e[i] > hi) hi = e[i] }
  const amp = hi - lo
  if (!(amp > 0)) return null
  let ref = Array.from(cuts)
  if (A.d2) { const m = []; for (let k = 0; k + 1 < ref.length; k++) m.push((ref[k] + ref[k + 1]) / 2); ref = m }
  const thr = lo + 0.16 * amp, tol = Math.max(0.65, 0.14 * p), chance = Math.min(0.85, (2.5066 * tol) / p)
  let sw = 0, sm = 0, np = 0, k = 0
  for (let i = 1; i < len; i++) {
    const v = e[i]
    if (v <= thr || v < e[i - 1] || v < e[i + 1] || (v === e[i - 1] && i > 1)) continue
    while (k + 1 < ref.length && ref[k + 1] <= i) k++
    let d = Math.abs(i - ref[k])
    if (k + 1 < ref.length) d = Math.min(d, Math.abs(ref[k + 1] - i))
    const w = (v - lo) / amp, z = d / tol
    sw += w; sm += w * expNeg((z * z) / 2); np++
  }
  if (np < 4) return null
  const s = (sm / sw - chance) / (1 - chance)
  return s < 0 ? 0 : s > 1 ? 1 : s
}

// ---------------------------------------------------------------- within-cell uniformity (anti-octave guard)

/** OKLab prefix sums along LINES sampled rows (axis 0) or columns (axis 1). */
function sampleLines(pr: EdgeProfile, axis: number) {
  const { W, H, pm } = pr, len = axis ? H : W, other = axis ? W : H, nl = Math.min(other, LINES)
  const pre = new Float64Array(nl * (len + 1) * 4), t = new Float64Array(3)
  for (let l = 0; l < nl; l++) {
    const o = Math.floor(((l + 0.5) * other) / nl), base = l * (len + 1) * 4
    for (let i = 0, prev = -1; i < len; i++) {
      const q = (axis ? i * W + o : o * W + i) * 4, b = base + i * 4
      // runs of one colour (flat cells) reuse the previous conversion
      if (prev < 0 || pm[q] !== pm[prev] || pm[q + 1] !== pm[prev + 1] || pm[q + 2] !== pm[prev + 2]) srgbToOklab(pm[q], pm[q + 1], pm[q + 2], t, 0)
      prev = q
      pre[b + 4] = pre[b] + t[0]; pre[b + 5] = pre[b + 1] + t[1]; pre[b + 6] = pre[b + 2] + t[2]
      pre[b + 7] = pre[b + 3] + t[0] * t[0] + t[1] * t[1] + t[2] * t[2]
    }
  }
  return { pre, nl, len }
}

/**
 * Mean OKLab variance in fixed-width windows (w0 px, half-overlapping) tiled over each cell's
 * 25%-inset interior. A fixed window keeps in-cell gradients from favouring small cells; a
 * window straddling a true seam (wrong period) shows up as variance. Edge cells are skipped.
 */
function uniformity(lines: ReturnType<typeof sampleLines>, cuts: number[], w0: number) {
  const { pre, nl } = lines, stride = (lines.len + 1) * 4
  let sum = 0, cnt = 0
  for (let k = 1; k < cuts.length - 2; k++) {
    const c = cuts[k], q = cuts[k + 1] - c
    let a0 = Math.ceil(c + 0.25 * q - 0.5), a1 = Math.floor(c + 0.75 * q - 0.5)
    if (a1 - a0 + 1 < w0) { a0 = Math.max(0, Math.round(c + 0.5 * q - w0 / 2)); a1 = Math.min(lines.len - 1, a0 + w0 - 1) } // tiny cells: one centred window
    const w = Math.min(a1 - a0 + 1, w0), step = Math.max(1, w >> 1)
    for (let st = a0; ; st += step) {
      const e = Math.min(st + w - 1, a1), s0 = e - w + 1
      for (let l = 0; l < nl; l++) {
        const A = l * stride + s0 * 4, B = l * stride + (e + 1) * 4
        const L = pre[B] - pre[A], aa = pre[B + 1] - pre[A + 1], bb = pre[B + 2] - pre[A + 2], S2 = pre[B + 3] - pre[A + 3]
        sum += S2 / w - (L * L + aa * aa + bb * bb) / (w * w)
        cnt++
      }
      if (e >= a1) break
    }
  }
  return cnt ? sum / cnt : Infinity
}

/** Line at q's fundamental / line at 2/q: ~0 when q is twice the true period (its odd harmonics are empty). */
const fundRatio = (A: AxisSetup, q: number) => linePeak(A.sp, 1 / q) / Math.max(1e-12, linePeak(A.sp, 2 / q))

/**
 * Anti-octave guard over p, 2p, p/2 (each refined, on its own cuts, elastic when adopted).
 * Within-cell uniformity uses one fixed window (p/2's inset width) so in-cell gradients cannot
 * favour small cells. Up to 2p when it is spectrally qualified, has its own fundamental and
 * explains cells about as well; down to p/2 when p lacks its fundamental and p/2 explains cells
 * clearly better. Fundamental ratio measured on the real samples + synthetic: true period >= 0.88,
 * twice the true period <= 0.32 (threshold 0.6).
 */
function octaveGuard(lines: ReturnType<typeof sampleLines>, A: AxisSetup, p: number, qualified: (q: number) => boolean, ev: string[], name: string) {
  for (let it = 0; it < 3; it++) {
    const w0 = Math.max(2, Math.floor(0.25 * p)), u = uniformity(lines, cutsFor(A, p).cuts, w0)
    if (2 * p <= A.qmax && qualified(2 * p) && fundRatio(A, 2 * p) >= 0.6) {
      const q = refinePeriod(A.x, 2 * p).q, u2 = uniformity(lines, cutsFor(A, q).cuts, w0)
      if (u2 <= 1.3 * u + 1e-5) {
        ev.push(`${name}: octave guard ${f2(p)} -> ${f2(q)} (var ${f5(u)} vs ${f5(u2)})`)
        p = q
        continue
      }
    }
    if (p / 2 >= QMIN && fundRatio(A, p) < 0.6) {
      const q = refinePeriod(A.x, p / 2).q, uh = uniformity(lines, cutsFor(A, q).cuts, w0)
      if (uh < 0.5 * u - 1e-5) {
        ev.push(`${name}: octave guard ${f2(p)} -> ${f2(q)} (var ${f5(u)} vs ${f5(uh)})`)
        p = q
        continue
      }
    }
    break
  }
  return p
}

// ---------------------------------------------------------------- purity and agreement

/**
 * Cell purity on subsampled cells (4x4 interior samples at 30-70%):
 * ratio = median interior OKLab std of non-flat cells / median across-boundary contrast (grid < 0.5);
 * step = median |in-cell slope| extrapolated over one cell / the neighbour contrast: ~1 for smooth
 * (seamless) fields such as painted waves, low for flat cells with real seams. Measured: gridded
 * real samples 0.12-0.69, the painted wizard 1.00, a sinusoid field 1.32.
 */
function purity(pr: EdgeProfile, cx: Float64Array, cy: Float64Array) {
  const { W, pm } = pr, nx = cx.length - 1, ny = cy.length - 1, t = new Float64Array(3)
  const sx = Math.max(1, Math.floor(nx / 40)), sy = Math.max(1, Math.floor(ny / 40))
  const stat = (i: number, j: number) => {
    const x0 = cx[i], x1 = cx[i + 1], y0 = cy[j], y1 = cy[j + 1], m = new Float64Array(15) // mean, left, right, top, bottom (3 each)
    let S2 = 0
    for (let v = 0; v < 4; v++) {
      const y = Math.floor(y0 + (y1 - y0) * (0.3 + 0.4 * (v / 3)))
      for (let u = 0; u < 4; u++) {
        const x = Math.floor(x0 + (x1 - x0) * (0.3 + 0.4 * (u / 3))), q = (y * W + x) * 4
        srgbToOklab(pm[q], pm[q + 1], pm[q + 2], t, 0)
        const h = 3 + (u < 2 ? 0 : 3), w = 9 + (v < 2 ? 0 : 3)
        for (let c = 0; c < 3; c++) { m[c] += t[c] / 16; m[h + c] += t[c] / 8; m[w + c] += t[c] / 8 }
        S2 += (t[0] * t[0] + t[1] * t[1] + t[2] * t[2]) / 16
      }
    }
    return { m, sd: Math.sqrt(Math.max(0, S2 - m[0] * m[0] - m[1] * m[1] - m[2] * m[2])) }
  }
  const de = (A: Float64Array<ArrayBuffer>, a: number, B: Float64Array<ArrayBuffer>, b: number) => { const l = A[a] - B[b], u = A[a + 1] - B[b + 1], v = A[a + 2] - B[b + 2]; return Math.sqrt(l * l + u * u + v * v) }
  const sds = [], cons = [], steps = []
  for (let j = 0; j + 1 < ny; j += sy) {
    for (let i = 0; i + 1 < nx; i += sx) {
      const c = stat(i, j), R = stat(i + 1, j), D = stat(i, j + 1), r = de(c.m, 0, R.m, 0), dn = de(c.m, 0, D.m, 0)
      if (c.sd > 0.006 || r > 0.03 || dn > 0.03) sds.push(c.sd)
      // half-means sit 0.267 cell apart: slope x 1 cell = their distance / 0.267
      if (r > 0.03) { cons.push(r); steps.push(Math.min(2, de(c.m, 3, c.m, 6) / 0.267 / r)) }
      if (dn > 0.03) { cons.push(dn); steps.push(Math.min(2, de(c.m, 9, c.m, 12) / 0.267 / dn)) }
    }
  }
  if (!cons.length) return { ratio: Infinity, step: Infinity }
  return { ratio: median(sds) / median(cons), step: median(steps) }
}

const median = (a: Iterable<number>) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0 }

/**
 * Energy-weighted share of overlapping windows (3 bands x 50%-overlap segments of max(256, 8p) px)
 * whose local pitch is within 12% of p or where p is still a qualified pitch. Below 256 px there is no room for windows: returns 1 (n/a).
 */
function agreement(bands: Float64Array[], len: number, p: number) {
  if (len < 256) return 1
  const Lw = Math.min(len, Math.max(256, Math.ceil(8 * p))), step = Math.max(1, Lw >> 1)
  let tot = 0, ok = 0, maxE = 0
  const wins: [Float64Array, number, number, number][] = []
  for (const band of bands) {
    for (let a = 0; a + Lw <= len || a === 0; a += step) {
      const b = Math.min(len + 1, a + Lw + 1)
      let E = 0
      for (let i = a; i < b; i++) E += band[i]
      wins.push([band, a, b, E])
      if (E > maxE) maxE = E
      if (a + Lw >= len) break
    }
  }
  for (const [band, a, b, E] of wins) {
    if (E < 0.05 * maxE || E <= 0) continue
    const r = smallestQualified(spectrum(band, a, b), Math.min((b - a) / 4, 128))
    tot += E
    if (r && (Math.abs(r.q / p - 1) <= 0.12 || r.qualified(p))) ok += E // local pick ~p, or p still qualifies there
  }
  return tot > 0 ? ok / tot : 0
}

// ---------------------------------------------------------------- assembly

const f2 = (v: number | null | undefined) => (Math.round(v! * 100) / 100).toString()
const f5 = (v: number) => v.toExponential(2)
const r3 = (v: number) => Math.round(v * 1000) / 1000
const near16k = (p: number) => { for (let k = 1; k <= 8; k++) if (Math.abs(p - 16 / k) <= 0.005 * (16 / k)) return true; return false }

/**
 * Phase, then regular cuts or elastic DP cuts (p >= 4, adopted at >= 1.5x capture and, if given, the fixed count).
 * Second-difference profile: peaks sit at cell centres, so the phase moves by p/2; regular cuts only.
 */
function cutsFor(A: AxisSetup, p: number, fixedCount?: number) {
  let phase = phaseOf(A.e, A.len, p)
  if (A.d2) { phase = (phase + p / 2) % p; if (p - phase < 0.125) phase = 0 }
  let cuts = regularCuts(A.len, p, phase), elastic = false, gain = 1
  if (p >= 4 && !A.d2) {
    const el = elasticCuts(A.e, A.len, p)
    gain = capture(A.e, el) / Math.max(1e-9, capture(A.e, cuts))
    if (gain >= 1.5 && (fixedCount == null || el.length - 1 === fixedCount)) { cuts = el; elastic = true }
  }
  return { phase, cuts, elastic, gain }
}

/** Build one axis from a period: cuts, prominence (line peak / band median), coherence over the cuts. */
function buildAxis(A: AxisSetup, p: number, fixedCount?: number) {
  const { phase, cuts, elastic, gain } = cutsFor(A, p, fixedCount)
  return {
    period: p, phase, cuts: Float64Array.from(cuts), count: cuts.length - 1, elastic,
    prominence: linePeak(A.sp, 1 / p) / Math.max(1e-12, A.med), coherence: coherence(A.x, cuts), gain, support: edgeSupport(A, cuts, p),
  }
}

/** Max raw magnitude within +-1.5 natural bins of f (drift splits a line into sidebands). */
function linePeak(sp: Spectrum, f: number) {
  const c = f * sp.N, r = 1.5 * (sp.N / sp.n)
  let m = 0
  for (let k = Math.max(0, Math.ceil(c - r)); k <= Math.min(sp.M.length - 1, Math.floor(c + r)); k++) if (sp.M[k] > m) m = sp.M[k]
  return m
}

function setupAxis(P: Float64Array, len: number, bands: Float64Array[], d2: boolean) {
  const qmax = Math.min(len / 4, 128), sp = spectrum(P, 0, len + 1)
  return { P, len, bands, qmax, sp, med: bandMedian(sp, qmax), x: centered(P), e: edgeSignal(P), d2 }
}

/** Edge profiles and both axes of (img, mask, profile); `edges` (a Map owned by the caller, one img and mask only) keeps them per profile. */
function edgeSetup(img: Image, mask: Uint8Array | null | undefined, profile: string, edges?: Map<string, EdgeState> | null): EdgeState {
  let s = edges?.get(profile)
  if (!s) {
    const pr = edgeProfiles(img, mask, profile)
    s = { pr, axes: [setupAxis(pr.Px, pr.W, pr.bx, pr.d2), setupAxis(pr.Py, pr.H, pr.by, pr.d2)] }
    edges?.set(profile, s)
  }
  return s
}

function regularAxis(len: number, p: number) {
  const n = Math.max(1, Math.round(len / p)), cuts = new Float64Array(n + 1)
  for (let i = 0; i <= n; i++) cuts[i] = (i * len) / n
  return { period: len / n, phase: 0, cuts, count: n, elastic: false, prominence: Infinity, coherence: 1 }
}

const gcd = (a: number, b: number) => { while (b) [a, b] = [b, a % b]; return a }

// Exact constant-block factorization (canonical-rgba-geometry-spike.md "Exact factorization and
// ambiguity"). Serialized policy: cuts at phase + k*scale with partial edge cells kept as cells; a
// candidate is valid when every change position lies on a cut; an axis with < 2 change positions is
// bounded by the canvas edges (aligned divisor scales only) and is underdetermined.
const EXACT_POLICY = 'cuts at phase + k*scale, partial edge cells kept; an axis with < 2 change positions is bounded by the canvas edges (underdetermined)'

/**
 * One axis. Change position i: line i differs from line i - 1 somewhere (canonical RGBA). Valid
 * scales = divisors of G = gcd of the gaps between change positions; phase = first change mod scale.
 * streak: longest run of consecutive change positions. O(N) worst case, per-line early exit otherwise.
 */
function exactAxis(u32: Uint32Array, W: number, H: number, axis: number) {
  const len = axis ? H : W, other = axis ? W : H, step = axis ? W : 1, stride = axis ? 1 : W
  let first = -1, prev = -1, G = 0, changes = 0, run = 0, streak = 0
  for (let i = 1; i < len; i++) {
    let diff = false
    for (let j = 0, p = i * step; j < other; j++, p += stride) if (u32[p] !== u32[p - step]) { diff = true; break }
    if (!diff) continue
    changes++
    run = prev === i - 1 ? run + 1 : 1
    if (run > streak) streak = run
    if (first < 0) first = i
    else G = gcd(G, i - prev)
    prev = i
  }
  if (changes < 2) G = changes ? gcd(first, len) : len
  const scales = []
  for (let s = G; s >= 1; s--) if (G % s === 0) scales.push(s)
  return { scales, streak, phase: (s: number) => (first < 0 ? 0 : first % s), under: changes < 2 && len > 1 }
}

const cellCount = (len: number, s: number, phase: number) => (phase ? 1 + Math.ceil((len - phase) / s) : Math.ceil(len / s))

/**
 * Every valid factorization {sx, sy, phaseX, phaseY, countX, countY}, independent axes, coarsest first
 * (area desc, then sx desc); always includes the trivial 1:1 candidate. ambiguous: more than one
 * non-trivial candidate, or an underdetermined axis. No candidate is the original grid by itself.
 */
function factorize(img: Image) {
  const W = img.width, H = img.height, d = img.data, n = W * H
  const raw = new Uint32Array(d.buffer, d.byteOffset, n), u32 = new Uint32Array(n)
  for (let p = 0; p < n; p++) u32[p] = d[p * 4 + 3] ? raw[p] : 0 // RGB under alpha 0 is not evidence
  const X = exactAxis(u32, W, H, 0), Y = exactAxis(u32, W, H, 1), candidates = []
  for (const sx of X.scales) {
    for (const sy of Y.scales) {
      const phaseX = X.phase(sx), phaseY = Y.phase(sy)
      candidates.push({ sx, sy, phaseX, phaseY, countX: cellCount(W, sx, phaseX), countY: cellCount(H, sy, phaseY) })
    }
  }
  candidates.sort((a, b) => b.sx * b.sy - a.sx * a.sy || b.sx - a.sx)
  const under = X.under || Y.under
  return { u32, candidates, under, streaks: [X.streak, Y.streak], ambiguous: under || candidates.filter((c) => c.sx > 1 || c.sy > 1).length > 1 }
}

/** Integer cuts of an exact lattice: 0, phase (if > 0), phase + k s, len. */
function latticeAxis(len: number, s: number, phase: number) {
  const cuts = [0]
  for (let c = phase || s; c < len; c += s) cuts.push(c)
  cuts.push(len)
  return { period: s, phase, cuts: Float64Array.from(cuts), count: cuts.length - 1, elastic: false, prominence: Infinity, coherence: 1 }
}

/**
 * 1:1 heuristic, not proof: <= 256 exact colours, binary alpha, and >= 3 consecutive changing
 * columns/rows on one axis (>= 2 on the other). An NN upscale by s >= 3 (integer or not, seams
 * anti-aliased over <= 1 px) changes at most 2 lines in a row. ponytail: NN upscales below 3x can
 * pass; they then rely on the spectral path ('grid' overrides this heuristic).
 */
function nativeLooking(img: Image, u32: Uint32Array, [sx, sy]: number[]) {
  if (Math.max(sx, sy) < 3 || Math.min(sx, sy) < 2) return null
  const seen = new Set()
  for (let p = 0; p < u32.length; p++) {
    const a = img.data[p * 4 + 3]
    if (a !== 0 && a !== 255) return null
    seen.add(u32[p])
    if (seen.size > 256) return null
  }
  return `${seen.size} exact colours, binary alpha, ${sx}/${sy} consecutive changing columns/rows (an NN upscale >= 3x has <= 2)`
}

/**
 * D52: an axis below the prominence gate still counts when its lattice is coherent and its edges sit on
 * the cuts far above chance (sparse 1-bit art and fractional NN upscales have weak spectral lines).
 */
const admitted = (a: Pick<Axis, "prominence" | "coherence" | "agreement" | "support">) => a.prominence >= 2.5 && a.coherence >= 0.4 && a.agreement! >= 0.5 && a.support != null && a.support >= 0.7

/** Shared gate: class, confidence, evidence from two finished axes. */
function classify(pr: EdgeProfile, X: Axis, Y: Axis, jpeg: boolean, ev: string[], forced: string | null) {
  const thr = (a: Axis) => (jpeg && near16k(a.period) ? 0.3 : 0.15)
  const ok = (a: Axis) => (a.prominence >= 5 && a.coherence >= thr(a) && a.agreement! >= 0.5) || admitted(a)
  const { ratio: pur, step } = purity(pr, X.cuts, Y.cuts)
  for (const [n, a] of [['x', X], ['y', Y]] as const) {
    ev.push(`${n}: period ${f2(a.period)} phase ${f2(a.phase)} count ${a.count} prominence ${f2(a.prominence)} coherence ${f2(a.coherence)} (min ${thr(a)}) agreement ${f2(a.agreement)} elastic ${a.countDP ? 'no, count-constrained DP' : a.elastic ? 'yes' : 'no'} (gain ${f2(a.gain)})`)
    if (!(a.prominence >= 5 && a.coherence >= thr(a) && a.agreement! >= 0.5) && admitted(a)) ev.push(`${n}: admitted by edge support ${f2(a.support)} (>= 0.7) below the prominence gate (D52)`)
  }
  ev.push(`purity ratio ${f2(pur)} (grid < 0.5), cell step ratio ${f2(step)} (seamless >= 0.85)`)
  const sup = (a: Axis) => (a.support == null ? '-' : f2(a.support))
  ev.push(`edge support x ${sup(X)} y ${sup(Y)} (chance-corrected; an axis is admitted at >= 0.7, a coarse lattice needs a mean >= 0.15)`)
  const both = ok(X) && ok(Y), any = forced ? ok(forced === 'x' ? Y : X) : both
  let cls: Grid['class'] = 'none'
  if (any && step < 0.85) cls = pur < 0.5 && !forced ? 'grid' : 'weak'
  else if (any) ev.push('none: periodic but seamless (in-cell slopes explain the cell-to-cell change)')
  // D52: a coarse lattice (< 12 cells on an axis) whose edges barely beat chance is a shapes scene, not a grid
  if (cls !== 'none' && X.support != null && Y.support != null && (X.support + Y.support) / 2 < 0.15 && Math.min(X.count, Y.count) < 12) {
    ev.push(`none: mean edge support ${f2((X.support + Y.support) / 2)} < 0.15 on a coarse ${X.count}x${Y.count} lattice`)
    cls = 'none'
  }
  const q = (a: Axis) => Math.min(1, a.prominence / 15) * Math.min(1, a.coherence / (2 * thr(a))) * Math.min(1, a.agreement!)
  const confidence = Math.max(0, Math.min(1, Math.min(q(X), q(Y)) * Math.min(1, Math.max(0.1, 1 - pur))))
  return { cls, confidence: Math.round(confidence * 1000) / 1000 }
}

function emptyGrid(img: Image, ev: string[], why: string, alternatives: NonNullable<Grid["alternatives"]> = { x: [], y: [] }): Grid {
  ev.push(why)
  return { x: regularAxis(img.width, img.width), y: regularAxis(img.height, img.height), class: 'none', confidence: 0, evidence: ev, alternatives }
}

/**
 * detectGrid(img, { targetW?, targetH?, mask?, preset?, profile?, noRefine?, edges? }) -> Grid.
 * noRefine: skip the D52 count refinement (the pipeline sets it under Trim). edges: see edgeSetup.
 * mask: Uint8Array (1 = excluded pixel, e.g. watermark/checkerboard). preset.jpegStrict = JPEG container.
 * profile: 'd1' (default, first differences) or 'd2' (second differences, smooth upscales; see edgeProfiles);
 * spectral grids carry it as grid.profile so lockGrid can re-solve on the same profile.
 * Grid adds: candidates (every valid exact factorization, coarsest first; see factorize), ambiguous,
 * suggestedSize ([w, h] evidence only, never a target; null when no size is supported) and
 * alternatives ({ x, y }: qualified spectral periods [{ period, count, score }], empty on the exact path).
 * class 'exact' = a valid exact lattice (the instructed candidate when targetW x targetH equals one,
 * else the coarsest) or the 1:1 heuristic (confidence < 1); it is original-grid recovery only when
 * instructed or not ambiguous.
 */
export function detectGrid(img: Image, opts: GridOptions = {}): Grid {
  const W = img.width, H = img.height, f = factorize(img), top = f.candidates[0]
  // D56: no pixel with alpha > 0 is no evidence of any grid (not a 1 x 1 exact lattice)
  if (!f.u32.some((v) => v)) return Object.assign(emptyGrid(img, [], 'none: no pixel with alpha > 0'), { candidates: [], ambiguous: false, suggestedSize: null })
  const done = (g: Grid, suggestedSize: Pair | null) => Object.assign(g, { candidates: f.candidates, ambiguous: f.ambiguous, suggestedSize, alternatives: g.alternatives ?? { x: [], y: [] } })
  const exactOf = (c: GridCandidate, confidence: number, ev: string[], suggested: Pair | null) => done({ x: latticeAxis(W, c.sx, c.phaseX), y: latticeAxis(H, c.sy, c.phaseY), class: 'exact', confidence, evidence: ev }, suggested)
  // A scale-1 axis must itself look native (>= 3 changing lines in a row); otherwise it is a
  // non-integer upscale on that axis and the approximate detector decides (candidates still listed).
  const mixedNonint = (top.sx === 1 && f.streaks[0] < 3) || (top.sy === 1 && f.streaks[1] < 3)
  if ((top.sx > 1 || top.sy > 1) && !mixedNonint) {
    const ev = [`exact policy: ${EXACT_POLICY}`, `exact: ${f.candidates.length} valid factorizations, largest ${top.sx}x${top.sy} px cells (phase ${top.phaseX}, ${top.phaseY}) -> ${top.countX}x${top.countY}`]
    const inst = f.candidates.find((c) => c.countX === opts.targetW && c.countY === opts.targetH)
    if (inst) ev.push(`exact: target ${inst.countX}x${inst.countY} matches candidate ${inst.sx}x${inst.sy} px cells: instructed lattice`)
    else if (f.under) ev.push('exact: ambiguous, an axis has < 2 change positions (no size suggested); original grid not identified')
    else if (f.ambiguous) ev.push('exact: ambiguous, using the largest valid factorization; original grid not identified')
    return exactOf(inst || top, 1, ev, f.under ? null : [top.countX, top.countY])
  }
  const g = spectralGrid(img, opts), native = nativeLooking(img, f.u32, f.streaks)
  if (!native || g.class === 'grid') {
    if (native) g.evidence.unshift(`not 1:1: ${native}, but a pure grid was found`)
    return done(g, g.class === 'none' ? null : [g.x.count, g.y.count])
  }
  // <= 256 colours + binary alpha, no pure grid: the trivial candidate, reported as a heuristic.
  return exactOf(top, 0.9, [`1:1 candidate (heuristic, not proof): ${native}`], [W, H])
}
function spectralGrid(img: Image, { targetW, targetH, mask, preset, profile = 'd1', noRefine = false, edges = null }: GridOptions = {}): Grid {
  const ev: string[] = [], alternatives: NonNullable<Grid["alternatives"]> = { x: [], y: [] }
  if (img.width < 16 || img.height < 16) return emptyGrid(img, ev, 'none: image smaller than 16 px')
  const { pr, axes } = edgeSetup(img, mask, profile, edges)
  const [b7, b8, b9] = pr.blockiness
  const jpeg = !!preset?.jpegStrict || b8 >= 1.2 * Math.max(b7, b9)
  ev.push(`JPEG evidence: ${jpeg ? 'yes' : 'no'} (container ${preset?.jpegStrict ? 'jpeg' : 'n/a'}, blockiness 8: ${f2(b8)} vs 7/9: ${f2(b7)}/${f2(b9)})`)
  const targets = [targetW, targetH], names = ['x', 'y'] as const, periods: number[] = []
  for (let a = 0; a < 2; a++) {
    const A = axes[a], T = targets[a]
    // JPEG-like periods (8, 16/k within 0.5%) need coherence >= 0.30 to compete when JPEG evidence exists.
    const allowed = jpeg ? (q: number) => !near16k(q) || coherence(A.x, regularCuts(A.len, q, phaseOf(A.e, A.len, q))) >= 0.3 : null
    const sq = smallestQualified(A.sp, A.qmax, T ? [A.len / T] : [], allowed)
    if (!sq) return emptyGrid(img, ev, `none: no periodic edge energy on ${names[a]}`, alternatives)
    alternatives[names[a]] = sq.alternatives.map(([q, s]) => ({ period: r3(q), count: Math.round(A.len / q), score: r3(s / sq.score) }))
    let p = refinePeriod(A.x, sq.q).q
    ev.push(`${names[a]}: smallest-qualified period ${f2(sq.q)} -> refined ${f2(p)}`)
    periods.push(octaveGuard(sampleLines(pr, a), A, p, sq.qualified, ev, names[a]))
  }
  // Unify to the geometric mean only if neither axis's count moves by >= 0.25 cell.
  const gm = Math.sqrt(periods[0] * periods[1])
  if (axes.every((A: { len: number }, a: number) => Math.abs(A.len / gm - A.len / periods[a]) < 0.25)) {
    if (periods[0] !== periods[1]) ev.push(`axes unified to ${f2(gm)}`)
    periods[0] = periods[1] = gm
  }
  // Integer lock: within 0.25 cell of a whole count and >= 97% of the comb score.
  for (let a = 0; a < 2; a++) {
    const A = axes[a], p = periods[a], N = Math.round(A.len / p)
    if (N >= 1 && Math.abs(A.len / p - N) <= 0.25 && combScore(A.x, A.len / N) >= 0.97 * combScore(A.x, p)) {
      periods[a] = A.len / N
      ev.push(`${names[a]}: integer lock to ${N} cells`)
    }
  }
  // D52 count refinement: among regular lattices with N0 +- K cells (K = 5 %, 1..2), keep the most coherent.
  // Off below 12 cells, at coherence < 0.25 and under Trim (a full canvas with wide margins extrapolates
  // the period over the margins); reverted below when the refined axis loses confidence.
  const unrefined = periods.slice()
  if (!noRefine) for (let a = 0; a < 2; a++) {
    const A = axes[a], reg = (q: number) => {
      let ph = phaseOf(A.e, A.len, q)
      if (A.d2) { ph = (ph + q / 2) % q; if (q - ph < 0.125) ph = 0 }
      return regularCuts(A.len, q, ph)
    }
    const c0 = reg(periods[a]), N0 = c0.length - 1, base = coherence(A.x, c0)
    if (N0 < 12 || base < 0.25) continue
    const K = Math.min(2, Math.max(1, Math.round(0.05 * N0)))
    let best = base, bn = N0
    for (let n = N0 - K; n <= N0 + K; n++) {
      if (n === N0 || A.len / n < QMIN) continue
      let c = reg(A.len / n)
      if (c.length - 1 !== n) c = Array.from(regularAxis(A.len, A.len / n).cuts)
      const h = coherence(A.x, c)
      if (h > best + 1e-9) { best = h; bn = n }
    }
    if (bn !== N0) { ev.push(`${names[a]}: count refinement ${N0} -> ${bn} cells (coherence ${f2(base)} -> ${f2(best)})`); periods[a] = A.len / bn }
  }
  let [X, Y] = axes.map((A, a) => ({ ...buildAxis(A, periods[a]), agreement: agreement(A.bands, A.len, periods[a]) }))
  // An unconfident axis borrows the confident axis's period.
  const conf = (a: Axis) => (a.prominence >= 5 && a.coherence >= 0.15 && a.agreement! >= 0.5) || admitted(a)
  for (let a = 0; a < 2; a++) {
    if (periods[a] === unrefined[a] || conf(a ? Y : X)) continue
    const A = axes[a], o = { ...buildAxis(A, unrefined[a]), agreement: agreement(A.bands, A.len, unrefined[a]) }
    if (!conf(o)) continue
    ev.push(`${names[a]}: count refinement reverted (refined axis not confident)`)
    periods[a] = unrefined[a]
    if (a) Y = o; else X = o
  }
  let forced = null
  if (conf(X) !== conf(Y)) {
    const [src, dst, d] = conf(X) ? [X, 1, 'y'] : [Y, 0, 'x']
    const A = axes[dst], N = Math.max(1, Math.round(A.len / src.period))
    const ax = { ...buildAxis(A, A.len / N), agreement: agreement(A.bands, A.len, A.len / N) }
    if (dst) Y = ax; else X = ax
    forced = d
    ev.push(`${d}: not confident, borrows period ${f2(src.period)}`)
  }
  const { cls, confidence } = classify(pr, X, Y, jpeg, ev, forced)
  return { x: X, y: Y, class: cls, confidence, evidence: ev, alternatives, profile }
}

/**
 * lockGrid(img, countX, countY, { mask?, preset?, profile?, edges? }) -> Grid with period len/count; phase and
 * elastic cuts re-solved (on the given edge profile, see detectGrid).
 */
export function lockGrid(img: Image, countX: number, countY: number, { mask, preset, profile = 'd1', edges = null }: GridOptions = {}): Grid {
  const ev = [`locked to ${countX}x${countY} cells`]
  const { pr, axes } = edgeSetup(img, mask, profile, edges)
  const [b7, b8, b9] = pr.blockiness
  const jpeg = !!preset?.jpegStrict || b8 >= 1.2 * Math.max(b7, b9)
  const [X, Y] = [countX, countY].map((n, a) => {
    const A = axes[a], p = A.len / n, ax = buildAxis(A, p, n)
    // D52: elastic cuts rejected for their count, or regular cuts with the wrong count: count-constrained DP
    if (!A.d2 && p >= 4 && n >= 2 && (ax.count !== n || (!ax.elastic && ax.gain >= 1.5))) {
      const cc = countCuts(A.e, A.len, n, ax.phase)
      if (cc) {
        Object.assign(ax, { cuts: Float64Array.from(cc), count: n, elastic: false, countDP: true, coherence: coherence(A.x, cc), support: edgeSupport(A, cc, p) })
        ev.push(`${a ? 'y' : 'x'}: count-constrained cuts (${n - 1} by DP; elastic missed the count)`)
      }
    }
    if (ax.count !== n) { // a numeric edge case: fall back to n regular cells
      let c = regularCuts(A.len, p, ax.phase)
      if (c.length - 1 !== n) c = Array.from(regularAxis(A.len, p).cuts)
      Object.assign(ax, { cuts: Float64Array.from(c), count: n, elastic: false, coherence: coherence(A.x, c), support: edgeSupport(A, c, p) })
    }
    return { ...ax, agreement: agreement(A.bands, A.len, p) }
  })
  const { cls, confidence } = classify(pr, X, Y, jpeg, ev, null)
  return { x: X, y: Y, class: cls, confidence, evidence: ev, profile }
}
