// Quality metrics (pixel-art-quality-metrics.md): Q1-Q4, Q7, Q12 (helper), Q13 on an
// output image, G1-G3, G5, G7-G9 against ground truth, and scoreCase() which flattens
// everything into one record per case. Pure functions over RGBA Img objects.
// An empty or inapplicable metric is null, never 0 or 1 (methodology §10); summaries skip nulls.
import { srgbToOklab, toeL } from '../src/lib/core/color.js'
import { TAU_DUP, N8, d2, indexImage, components, ditherMask, q4 } from '../src/lib/core/orphans.js'
import { degrade, noGrid } from './synth.js'
import { bboxCrop } from './fixtures.js'

export { indexImage, q4 }

// Same-colour tests against GT (emSnap, G3, G8) use toe-corrected L like the pipeline (D1): raw OKLab
// puts sRGB (1,1,1) 0.067 from black, so any non-#000 estimate of a black outline failed a 0.05 test.
const dSame2 = (a, b) => (toeL(a[0]) - toeL(b[0])) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
export const pct = (arr, q) => {
  if (!arr.length) return null
  const s = Float64Array.from(arr).sort()
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]
}
export const median = (arr) => {
  if (!arr.length) return null
  const s = Float64Array.from(arr).sort(), m = s.length >> 1
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---- Intrinsic (output-only) ----

/** Q1 contract: dims, binary alpha, palette budget. Determinism is checked by the caller (repeat run). */
function q1(img, { targetW, targetH, maxColors } = {}, ix = indexImage(img)) {
  let nonBinary = 0
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0 && img.data[i] !== 255) nonBinary++
  const sizeOk = (targetW == null || img.width === targetW) && (targetH == null || img.height === targetH)
  return { sizeOk, nonBinary, kOut: ix.lab.length, budgetOk: maxColors == null || ix.lab.length <= maxColors, ok: sizeOk && nonBinary === 0 && img.width > 0 && img.height > 0 }
}

/** Q2 alpha cleanliness. bgLab (optional OKLab triple) enables `fringe`. */
function q2(ix, bgLab = null) {
  const { w, h, idx } = ix
  const op = components(w, h, (p) => idx[p] >= 0, () => true)
  let big = 0
  for (let i = 1; i < op.sizes.length; i++) if (op.sizes[i] > op.sizes[big]) big = i
  const islands = op.sizes.filter((s, i) => i !== big && s <= 2).length
  const tr = components(w, h, (p) => idx[p] < 0, () => true, false)
  const touches = new Uint8Array(tr.sizes.length)
  for (let p = 0; p < w * h; p++) {
    const x = p % w, y = (p / w) | 0
    if (tr.lab[p] >= 0 && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) touches[tr.lab[p]] = 1
  }
  const pinholes = tr.sizes.filter((s, i) => s <= 2 && !touches[i]).length
  let fringe = 0
  if (bgLab) {
    const B = boundary(ix), outside = new Uint8Array(ix.lab.length)
    for (let p = 0; p < w * h; p++) if (idx[p] >= 0 && !B[p]) outside[idx[p]] = 1
    for (let p = 0; p < w * h; p++) if (B[p] && !outside[idx[p]] && d2(ix.lab[idx[p]], bgLab) < 0.05 * 0.05) fringe++
  }
  return { partial: ix.partial, islands, pinholes, fringe }
}

/** Silhouette boundary B: opaque pixels with a transparent (or out-of-image) N4 neighbour. */
function boundary(ix) {
  const { w, h, idx } = ix, B = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    if (idx[p] < 0) continue
    const x = p % w, y = (p / w) | 0
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || idx[ny * w + nx] < 0) { B[p] = 1; break }
    }
  }
  return B
}

/** Q3 palette count, near duplicates, rare colours, separation. */
export function q3(ix) {
  const K = ix.lab.length, T2 = TAU_DUP * TAU_DUP, adj = new Set()
  const { w, h, idx } = ix
  for (let p = 0; p < w * h; p++) {
    const a = idx[p]
    if (a < 0) continue
    for (const q of [(p % w) < w - 1 ? p + 1 : -1, p + w < w * h ? p + w : -1]) {
      if (q < 0 || idx[q] < 0 || idx[q] === a) continue
      adj.add(Math.min(a, idx[q]) * 65536 + Math.max(a, idx[q]))
    }
  }
  let dupPairs = 0, dupTouching = 0
  const nearest = new Float64Array(K).fill(Infinity)
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
    const d = d2(ix.lab[i], ix.lab[j])
    if (d < nearest[i]) nearest[i] = d
    if (d < nearest[j]) nearest[j] = d
    if (d < T2) { dupPairs++; if (adj.has(i * 65536 + j)) dupTouching++ }
  }
  const rare = ix.count.filter((c) => c <= 2 || c < 0.001 * ix.opaque).length
  return { kOut: K, dupPairs, dupTouching, rare, separation: K > 1 ? Math.sqrt(pct(Array.from(nearest), 0.1)) : null }
}


/** Q7 thin mask: p is in no 2x2 window that is entirely idx(p). */
function thinMask(ix) {
  const { w, h, idx } = ix, m = new Uint8Array(w * h)
  const same = (x, y, a) => x >= 0 && y >= 0 && x < w && y < h && idx[y * w + x] === a
  for (let p = 0; p < w * h; p++) {
    const a = idx[p]
    if (a < 0) continue
    const x = p % w, y = (p / w) | 0
    let full = false
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      if (same(x + ox, y + oy, a) && same(x + ox + 1, y + oy, a) && same(x + ox, y + oy + 1, a) && same(x + ox + 1, y + oy + 1, a)) { full = true; break }
    }
    if (!full) m[p] = 1
  }
  return m
}

/** Q7 L-corner doubles per 100 thin pixels. */
export function q7(ix, thin = thinMask(ix)) {
  const { w, h, idx } = ix
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : idx[y * w + x])
  let doubles = 0, nThin = 0
  for (let p = 0; p < w * h; p++) {
    if (!thin[p]) continue
    nThin++
    const a = idx[p], x = p % w, y = (p / w) | 0
    const same = N8.filter(([dx, dy]) => at(x + dx, y + dy) === a)
    if (same.length !== 2) continue
    for (const [[ax, ay], [bx, by]] of [[[1, 0], [0, 1]], [[0, 1], [-1, 0]], [[-1, 0], [0, -1]], [[0, -1], [1, 0]]]) {
      if (at(x + ax, y + ay) !== a || at(x + bx, y + by) !== a) continue
      if (at(x + 2 * ax, y + 2 * ay) === a && at(x + 2 * bx, y + 2 * by) === a) continue // true right angle
      doubles++
      break
    }
  }
  return { doubles, thin: nThin, doubleRate: nThin ? (100 * doubles) / nThin : null }
}

/** Q13 hidden upscale (k = 2,3,4) and duplicated lines. */
export function q13(ix) {
  const { w, h, idx } = ix, hidden = {}
  for (const k of [2, 3, 4]) {
    const u = []
    for (let oy = 0; oy < k; oy++) for (let ox = 0; ox < k; ox++) {
      let blocks = 0, single = 0
      for (let by = oy; by + k <= h; by += k) for (let bx = ox; bx + k <= w; bx += k) {
        blocks++
        const a = idx[by * w + bx]
        let ok = true
        for (let y = 0; y < k && ok; y++) for (let x = 0; x < k && ok; x++) if (idx[(by + y) * w + bx + x] !== a) ok = false
        if (ok) single++
      }
      u.push(blocks ? single / blocks : 0)
    }
    hidden[k] = Math.max(...u) - median(u)
  }
  let dupCols = 0, dupRows = 0
  for (let x = 0; x + 1 < w; x++) {
    let eq = true, tr = 0
    for (let y = 0; y < h; y++) {
      if (idx[y * w + x] !== idx[y * w + x + 1]) { eq = false; break }
      if (y && idx[y * w + x] !== idx[(y - 1) * w + x]) tr++
    }
    if (eq && tr >= 2) dupCols++
  }
  for (let y = 0; y + 1 < h; y++) {
    let eq = true, tr = 0
    for (let x = 0; x < w; x++) {
      if (idx[y * w + x] !== idx[(y + 1) * w + x]) { eq = false; break }
      if (x && idx[y * w + x] !== idx[y * w + x - 1]) tr++
    }
    if (eq && tr >= 2) dupRows++
  }
  return { hidden2: hidden[2], hidden3: hidden[3], hidden4: hidden[4], dupRatio: (dupCols + dupRows) / (w + h) }
}

/** All intrinsic metrics in one flat record. */
export function intrinsic(img, opts = {}) {
  const ix = indexImage(img)
  const o4 = q4(ix)
  return { ...q1(img, opts, ix), ...q2(ix, opts.bgLab), ...q3(ix), orphansNoise: o4.noise, orphansAccent: o4.accent, orphansAA: o4.aa, noiseRate: o4.noiseRate, ...q7(ix), ...q13(ix) }
}

// ---- Ground-truth fidelity ----

const keyAt = (d, p) => (d[p * 4 + 3] < 128 ? -1 : (d[p * 4] << 16) | (d[p * 4 + 1] << 8) | d[p * 4 + 2])

/** G1 exact match: all, opaque union, interior (no outer ring), best shift in {-1,0,1}^2. */
export function g1(O, G) {
  const w = G.width, h = G.height
  const em = (sx, sy, inset) => {
    let all = 0, n = 0, op = 0, nop = 0
    for (let y = inset; y < h - inset; y++) for (let x = inset; x < w - inset; x++) {
      const ox = x + sx, oy = y + sy
      if (ox < 0 || oy < 0 || ox >= O.width || oy >= O.height) continue
      const a = keyAt(O.data, oy * O.width + ox), b = keyAt(G.data, y * w + x)
      n++; if (a === b) all++
      if (a >= 0 || b >= 0) { nop++; if (a === b) op++ }
    }
    return { all: n ? all / n : null, opaque: nop ? op / nop : null }
  }
  const base = em(0, 0, 0)
  let shift = base.opaque
  if (shift !== null) for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) if (sx || sy) shift = Math.max(shift, em(sx, sy, 0).opaque ?? 0)
  return { emAll: base.all, emOpaque: base.opaque, emInterior: em(0, 0, 1).all, emShift: shift }
}

/**
 * Output with each colour replaced by its nearest GT palette colour when within `tol` dE (toe L).
 * Synthetic inputs perturb colours (jitter, drift, JPEG), so exact-RGB G1 is ~0 by construction;
 * G1 on the snapped image (emSnap) measures structure at palette level. G2 still scores colour error.
 */
function snapToGT(O, ixO, ixG, tol = 0.05) {
  const map = ixO.lab.map((c) => {
    let best = -1, bd = tol * tol
    for (let j = 0; j < ixG.lab.length; j++) { const d = dSame2(c, ixG.lab[j]); if (d < bd) { bd = d; best = j } }
    return best < 0 ? null : ixG.rgb[best]
  })
  const d = Uint8ClampedArray.from(O.data)
  for (let p = 0; p < ixO.idx.length; p++) {
    const k = ixO.idx[p] >= 0 ? map[ixO.idx[p]] : null
    if (k !== null) { d[p * 4] = k >> 16; d[p * 4 + 1] = (k >> 8) & 255; d[p * 4 + 2] = k & 255 }
  }
  return { width: O.width, height: O.height, data: d }
}

/** Image shifted by (sx, sy) whole pixels, edges replicated. */
function shiftImg(img, sx, sy) {
  const { width: w, height: h } = img, d = new Uint8ClampedArray(img.data.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const q = (Math.min(h - 1, Math.max(0, y - sy)) * w + Math.min(w - 1, Math.max(0, x - sx))) * 4
    d.set(img.data.subarray(q, q + 4), (y * w + x) * 4)
  }
  return { width: w, height: h, data: d }
}
function shiftMask(m, w, h, sx, sy) {
  const o = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = m[Math.min(h - 1, Math.max(0, y - sy)) * w + Math.min(w - 1, Math.max(0, x - sx))]
  return o
}

/** emSnap restricted to recoverable cells (truth.ambiguous = 0), plus the ambiguous share of the opaque union. */
function emRecoverable(S, G, amb) {
  let n = 0, hit = 0, nAmb = 0
  for (let p = 0; p < amb.length; p++) {
    const a = keyAt(S.data, p), b = keyAt(G.data, p)
    if (a < 0 && b < 0) continue
    if (amb[p]) { nAmb++; continue }
    n++; if (a === b) hit++
  }
  return { emSnapRec: n ? hit / n : null, ambFrac: n + nAmb ? nAmb / (n + nAmb) : null }
}

/** G2 OKLab error over the opaque union; alpha mismatch costs 1. */
export function g2(O, G) {
  const n = G.width * G.height, errs = [], a = new Float64Array(3), b = new Float64Array(3)
  for (let p = 0; p < n; p++) {
    const ko = keyAt(O.data, p), kg = keyAt(G.data, p)
    if (ko < 0 && kg < 0) continue
    if ((ko < 0) !== (kg < 0)) { errs.push(1); continue }
    srgbToOklab(O.data[p * 4], O.data[p * 4 + 1], O.data[p * 4 + 2], a)
    srgbToOklab(G.data[p * 4], G.data[p * 4 + 1], G.data[p * 4 + 2], b)
    errs.push(Math.sqrt(d2(a, b)))
  }
  return { deMean: errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : null, deP95: pct(errs, 0.95) }
}

/** G3 palette recovery (set and pixel-weighted precision/recall within TAU_DUP). */
export function g3(ixO, ixG) {
  const T2 = TAU_DUP * TAU_DUP
  const hit = (A, B) => A.lab.map((c) => B.lab.some((d) => dSame2(c, d) < T2))
  const pO = hit(ixO, ixG), rG = hit(ixG, ixO)
  const share = (h) => (h.length ? h.filter(Boolean).length / h.length : null)
  const wshare = (h, ix) => (ix.opaque ? h.reduce((s, v, i) => s + (v ? ix.count[i] : 0), 0) / ix.opaque : null)
  return { palPrecision: share(pO), palRecall: share(rG), palPrecisionPx: wshare(pO, ixO), palRecallPx: wshare(rG, ixG), kOut: ixO.lab.length, kGT: ixG.lab.length, kErr: ixO.lab.length - ixG.lab.length }
}

/** Edge sets from a label function: H edges (x|x+1) and V edges (y|y+1). */
function edges(w, h, label) {
  const H = new Uint8Array(w * h), V = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (x + 1 < w && label(p) !== label(p + 1)) H[p] = 1
    if (y + 1 < h && label(p) !== label(p + w)) V[p] = 1
  }
  return [H, V]
}

/** F1 between two edge sets at tolerance 0 or 1 (greedy one-to-one, raster order, nearest offset first). */
function edgeF1(EO, EG, w, h, tol) {
  const OFF = tol ? [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[0, 0]]
  let nO = 0, nG = 0, match = 0
  for (let k = 0; k < 2; k++) {
    const used = new Uint8Array(w * h), O = EO[k], G = EG[k]
    for (let p = 0; p < w * h; p++) { nO += O[p]; nG += G[p] }
    for (let p = 0; p < w * h; p++) {
      if (!G[p]) continue
      const x = p % w, y = (p / w) | 0
      for (const [dx, dy] of OFF) {
        const nx = x + dx, ny = y + dy, q = ny * w + nx
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && O[q] && !used[q]) { used[q] = 1; match++; break }
      }
    }
  }
  if (!nO && !nG) return null
  const P = nO ? match / nO : 0, R = nG ? match / nG : 0
  return P + R ? (2 * P * R) / (P + R) : 0
}

/** G5 edge F1 (tolerance 0 and 1) on exact labels. */
export function g5(O, G) {
  const w = G.width, h = G.height
  const EO = edges(w, h, (p) => keyAt(O.data, p)), EG = edges(w, h, (p) => keyAt(G.data, p))
  return { f1T0: edgeF1(EO, EG, w, h, 0), f1T1: edgeF1(EO, EG, w, h, 1) }
}

/** G7 silhouette IoU and boundary F1 (tolerance 1). */
export function g7(O, G) {
  const w = G.width, h = G.height, n = w * h
  let inter = 0, uni = 0
  for (let p = 0; p < n; p++) {
    const a = O.data[p * 4 + 3] >= 128, b = G.data[p * 4 + 3] >= 128
    if (a && b) inter++
    if (a || b) uni++
  }
  const EO = edges(w, h, (p) => O.data[p * 4 + 3] >= 128), EG = edges(w, h, (p) => G.data[p * 4 + 3] >= 128)
  return { iou: uni ? inter / uni : null, silF1: edgeF1(EO, EG, w, h, 1) }
}

/** G8 small-feature recall: GT orphans, thin-stroke and dither pixels reproduced within TAU_DUP; thin-stroke breaks. */
export function g8(O, G, ixO = indexImage(O), ixG = indexImage(G)) {
  const { w, h, idx } = ixG, T2 = TAU_DUP * TAU_DUP
  const thin = thinMask(ixG), orphan = q4(ixG).orphan, dith = ditherMask(ixG)
  const ok = new Uint8Array(w * h)
  let feats = 0, hits = 0
  for (let p = 0; p < w * h; p++) {
    if (idx[p] < 0) continue
    const io = ixO.idx[p]
    ok[p] = io >= 0 && dSame2(ixO.lab[io], ixG.lab[idx[p]]) < T2 ? 1 : 0
    if (thin[p] || orphan[p] || dith[p]) { feats++; hits += ok[p] }
  }
  const strokes = components(w, h, (p) => thin[p] === 1, (p, q) => idx[p] === idx[q])
  const kept = components(w, h, (p) => thin[p] === 1 && ok[p] === 1, (p, q) => idx[p] === idx[q] && strokes.lab[p] === strokes.lab[q])
  const pieces = new Map()
  for (let p = 0; p < w * h; p++) if (kept.lab[p] >= 0 && strokes.sizes[strokes.lab[p]] >= 2) {
    const s = strokes.lab[p]
    if (!pieces.has(s)) pieces.set(s, new Set())
    pieces.get(s).add(kept.lab[p])
  }
  let breaks = 0
  for (const v of pieces.values()) if (v.size > 1) breaks++
  return { g8Recall: feats ? hits / feats : null, g8Features: feats, g8Breaks: breaks }
}

/** G9 grid estimation vs truth: cell size error, phase error (cells), seam error p50/p95 (cells), count error. */
export function g9(report, truth, img) {
  const g = report?.grid
  if (!g?.period) return {}
  const r = {}
  for (const [a, cell, cuts, len, n, k] of [['x', truth.cellW, truth.cutsX, img.width, truth.cellsX, 0], ['y', truth.cellH, truth.cutsY, img.height, truth.cellsY, 1]]) {
    const p = g.period[k], ph = g.phase?.[k] ?? 0
    r[`scaleErr${a.toUpperCase()}`] = Math.abs(p - cell) / cell
    const first = Array.from(cuts).find((c) => c >= 0) ?? 0
    let dph = (((ph - first) % cell) + cell) % cell
    r[`phaseErr${a.toUpperCase()}`] = Math.min(dph, cell - dph) / cell
    const est = g.cuts?.[a] ?? (() => { const e = []; for (let c = ph; c <= len + 1e-9; c += p) e.push(c); return e })()
    const errs = []
    for (const c of cuts) {
      if (c <= 0.5 || c >= len - 0.5) continue
      let best = Infinity
      for (const e of est) best = Math.min(best, Math.abs(e - c))
      errs.push(best / cell)
    }
    r[`seamP50${a.toUpperCase()}`] = median(errs)
    r[`seamP95${a.toUpperCase()}`] = pct(errs, 0.95)
    if (g.native) {
      let e = g.native[k] - n
      if (truth.phaseAmbiguous?.[k] && Math.abs(e) === 1) { e = 0; r.phaseAmbiguousHits = (r.phaseAmbiguousHits ?? 0) + 1 } // N vs N+1 both valid
      r[`nativeErr${a.toUpperCase()}`] = e
    }
  }
  return r
}

/**
 * One flat record for a synthetic case: G1-G3, G5, G7-G9, Q defect deltas (O - G), Q1/Q2 contract.
 * `truthImg` is the GT the output is compared to (same size as `out`); `grid` truth is optional.
 */
export function scoreCase(out, truthImg, { report, truth, input, targetW, targetH } = {}) {
  let ixO = indexImage(out), ixG = indexImage(truthImg)
  const rec = { ...q1(out, { targetW, targetH }, ixO), ...q2(ixO) }
  if (out.width !== truthImg.width || out.height !== truthImg.height) return { ...rec, sizeMismatch: true }
  const canvasTruth = truth && truth.sprite === truthImg
  let amb = canvasTruth ? truth.ambiguous : null
  if (canvasTruth && (truth.phaseAmbiguous[0] || truth.phaseAmbiguous[1])) {
    // Phase within 0.05 of 0.5 cell: a whole-axis one-cell shift is equally valid; keep the better alignment.
    let best = { e: -1 }
    for (const sy of truth.phaseAmbiguous[1] ? [0, -1, 1] : [0]) for (const sx of truth.phaseAmbiguous[0] ? [0, -1, 1] : [0]) {
      const G = shiftImg(truthImg, sx, sy), ixS = indexImage(G), e = g1(snapToGT(out, ixO, ixS), G).emOpaque
      if (e > best.e) best = { e, sx, sy, G, ixS }
    }
    if (best.sx || best.sy) { truthImg = best.G; ixG = best.ixS; amb = amb && shiftMask(amb, truthImg.width, truthImg.height, best.sx, best.sy) }
    rec.phaseShift = [best.sx, best.sy]
  }
  const oO = q4(ixO), oG = q4(ixG), dO = q7(ixO), dG = q7(ixG), mO = q13(ixO), mG = q13(ixG), pO = q3(ixO), pG = q3(ixG)
  const snap = g1(snapToGT(out, ixO, ixG), truthImg)
  Object.assign(rec, g1(out, truthImg), g2(out, truthImg), g3(ixO, ixG), g5(out, truthImg), g7(out, truthImg), g8(out, truthImg, ixO, ixG), {
    noiseDelta: oO.noise - oG.noise, noiseLimit: Math.max(1, 0.002 * ixG.opaque),
    doublesDelta: dO.doubleRate === null || dG.doubleRate === null ? null : dO.doubleRate - dG.doubleRate, hidden2Delta: mO.hidden2 - mG.hidden2, dupRatioDelta: mO.dupRatio - mG.dupRatio,
    dupTouchingDelta: pO.dupTouching - pG.dupTouching, emSnap: snap.emOpaque, emSnapAll: snap.emAll,
  })
  if (amb) Object.assign(rec, emRecoverable(snapToGT(out, ixO, ixG), truthImg, amb))
  if (truth && input) Object.assign(rec, g9(report, truth, input))
  return rec
}

const sameBytes = (a, b) => a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length))

/**
 * Degrade a GT sprite, convert it with explicit `opts` (targets added here), score it. `convert` is
 * injected. opts.trim: truth = the sprite's opaque bbox; otherwise the full-canvas lattice.
 */
export function runCase(convert, { id, sprite, params, seed, opts, repeat = true }) {
  const { img, truth } = degrade(sprite, params, seed)
  const T = opts.trim ? bboxCrop(sprite) : truth.sprite
  const o = { ...opts, targetW: T.width, targetH: T.height }
  let res, error = null
  const t0 = performance.now()
  try { res = convert(img, o) } catch (e) { error = String(e?.stack || e) }
  const ms = performance.now() - t0
  if (error) return { rec: { id, error, ms }, img, truth, T, opts: o }
  let deterministic = null
  if (repeat) { try { deterministic = sameBytes(convert(img, o).image.data, res.image.data) } catch { deterministic = false } }
  const rec = scoreCase(res.image, T, { report: res.report, truth: opts.trim ? null : truth, input: img, targetW: T.width, targetH: T.height })
  const g = res.report?.grid
  Object.assign(rec, {
    id, ms, deterministic, path: res.report?.path, class: g?.class, confidence: g?.confidence, suggestedSize: g?.suggestedSize ?? null,
    scaleErr: rec.scaleErrX === undefined ? undefined : Math.max(rec.scaleErrX, rec.scaleErrY),
    seamP95: rec.seamP95X == null || rec.seamP95Y == null ? null : Math.max(rec.seamP95X, rec.seamP95Y),
    inW: img.width, inH: img.height, cellW: truth.cellW, cellH: truth.cellH, cellsX: truth.cellsX, cellsY: truth.cellsY,
  })
  return { rec, img, truth, T, out: res.image, report: res.report, opts: o }
}

/** No-grid scene case: contract + false-grid flag (any grid class other than 'none'). Target width 48. */
export function runScene(convert, { id, scene, seed, opts, repeat = true }) {
  const img = noGrid(scene, seed)
  const o = { ...opts, targetW: 48, targetH: Math.max(1, Math.round((48 * img.height) / img.width)) }
  let res, error = null
  const t0 = performance.now()
  try { res = convert(img, o) } catch (e) { error = String(e?.stack || e) }
  const ms = performance.now() - t0
  if (error) return { rec: { id, error, ms }, img, opts: o }
  let deterministic = null
  if (repeat) { try { deterministic = sameBytes(convert(img, o).image.data, res.image.data) } catch { deterministic = false } }
  const ix = indexImage(res.image), cls = res.report?.grid?.class
  const rec = { id, ms, deterministic, ...q1(res.image, o, ix), partial: ix.partial, class: cls, falseGrid: cls === 'none' ? 0 : 1, path: res.report?.path, inW: img.width, inH: img.height }
  return { rec, img, out: res.image, report: res.report, opts: o }
}

/** Run case lists from fixtures.js; repeat-run identity on every exact-truth / scene case and the first of each group. */
export function runMatrix(convert, cases) {
  const seen = new Set()
  return cases.map((c) => {
    const repeat = c.scene !== undefined || c.preset === 'clean-nn-integer' || !seen.has(c.group)
    seen.add(c.group)
    const { rec } = (c.scene !== undefined ? runScene : runCase)(convert, { ...c, repeat })
    return { ...rec, group: c.group, preset: c.preset, spriteId: c.spriteId, stratum: c.stratum, family: c.family, cells: [rec.cellsX, rec.cellsY] }
  })
}

// Gate tiers (metrics doc §D), used as informational pass flags; T0/T1 are enforced by the tests.
const TIERS = {
  T2: (r) => r.emSnap >= 0.98 && r.deMean <= 0.01 && r.f1T0 >= 0.95 && r.iou >= 0.99 && r.scaleErr <= 0.005 && r.seamP95 <= 0.2 && r.g8Recall >= 0.95 && r.g8Breaks === 0 && r.noiseDelta <= r.noiseLimit && r.doublesDelta <= 0.5 && r.dupTouchingDelta <= 0 && r.hidden2Delta <= 0.1,
  T3: (r) => r.emSnap >= 0.8 && r.f1T1 >= 0.9 && r.iou >= 0.97 && r.scaleErr <= 0.01 && r.noiseDelta <= 2 * r.noiseLimit && r.doublesDelta <= 1 && r.hidden2Delta <= 0.2,
}

// Ratchet keys: [direction, absolute floor]. higher: may drop by floor; lower: may rise by max(10%, floor).
const RATCHET = {
  emSnap: ['higher', 0.01], emOpaque: ['higher', 0.01], f1T1: ['higher', 0.01], iou: ['higher', 0.005], g8Recall: ['higher', 0.01],
  deMean: ['lower', 0.002], noiseDelta: ['lower', 0.5], doublesDelta: ['lower', 0.25], scaleErr: ['lower', 0.002], seamP95: ['lower', 0.02],
  emSnapRec: ['higher', 0.01], falseGrid: ['lower', 0], // falseGrid is a rate (mean of 0/1), not a median
}

/** Per-group medians of the ratchet keys (null/missing values skipped; falseGrid = mean). No timings: baselines stay stable. */
export function summarize(recs, groupKey) {
  const groups = {}
  for (const r of recs) (groups[r[groupKey]] ??= []).push(r)
  const out = {}
  for (const [g, rs] of Object.entries(groups)) {
    out[g] = { n: rs.length }
    for (const k of [...Object.keys(RATCHET), 'ambFrac']) {
      const v = rs.map((r) => (r.error || r.sizeMismatch) && RATCHET[k] ? (RATCHET[k][0] === 'higher' ? 0 : 1) : r[k]).filter((x) => typeof x === 'number' && Number.isFinite(x))
      if (v.length) out[g][k] = Number((k === 'falseGrid' ? v.reduce((a, b) => a + b, 0) / v.length : median(v)).toFixed(5))
    }
    out[g].phaseShifted = rs.filter((r) => r.phaseShift && (r.phaseShift[0] || r.phaseShift[1])).length + rs.reduce((s, r) => s + (r.phaseAmbiguousHits ?? 0), 0)
    for (const [t, f] of Object.entries(TIERS)) out[g][`pass${t}`] = Number((rs.filter((r) => !r.error && f(r)).length / rs.length).toFixed(3))
  }
  return out
}

/** Regressions of `cur` vs `base` medians. A group or metric that appears or disappears also fails (rewrite via update-baseline.mjs). */
export function ratchet(cur, base) {
  const bad = []
  for (const g of Object.keys(cur)) if (!base[g]) bad.push(`${g}: not in baseline`)
  for (const [g, b] of Object.entries(base)) {
    const c = cur[g]
    if (!c) { bad.push(`${g}: missing from current run`); continue }
    for (const [k, [dir, floor]] of Object.entries(RATCHET)) {
      if (typeof b[k] !== 'number' && typeof c[k] !== 'number') continue
      if (typeof b[k] !== 'number' || typeof c[k] !== 'number') { bad.push(`${g}.${k}: ${c[k]} vs baseline ${b[k]}`); continue }
      // Defect deltas: only introduced defects (> 0) count; removed GT features are G8's job.
      const bv = k.endsWith('Delta') ? Math.max(0, b[k]) : b[k], cv = k.endsWith('Delta') ? Math.max(0, c[k]) : c[k]
      const lim = dir === 'higher' ? bv - floor : bv + Math.max(0.1 * Math.abs(bv), floor)
      if (dir === 'higher' ? cv < lim : cv > lim) bad.push(`${g}.${k}: ${c[k]} vs baseline ${b[k]} (limit ${lim.toFixed(4)})`)
    }
  }
  return bad
}
