// Step 5a: sample one color per grid cell from its inset interior (contract: algorithm-design.md).
import { srgbToOklab, toeL } from './color.js'

const TAU2 = 0.04 * 0.04 // leader-clustering radius, squared ΔEOK (L toe-corrected)

/** Pixel range [lo, hi) per cell whose pixel centres fall inside the inset interior. */
function insetRanges(axis, len) {
  const n = axis.count, cuts = axis.cuts
  const lo = new Int32Array(n), hi = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const c0 = cuts[i], c1 = cuts[i + 1], s = c1 - c0, inset = Math.max(0, Math.min(0.25 * s, (s - 1) / 2))
    // centre j + 0.5 in [c0 + inset, c1 - inset)
    let a = Math.max(0, Math.ceil(c0 + inset - 0.5)), b = Math.min(len, Math.ceil(c1 - inset - 0.5))
    if (b <= a) { a = Math.min(len - 1, Math.max(0, Math.floor((c0 + c1) / 2))); b = a + 1 }
    lo[i] = a; hi[i] = b
  }
  return { lo, hi }
}

/** Visit order for a cw x ch interior: by squared distance to its centre, raster order on ties. */
function centreOut(cw, ch) {
  const ids = Array.from({ length: cw * ch }, (_, i) => i)
  const d = (i) => { const x = 2 * (i % cw) + 1 - cw, y = 2 * Math.floor(i / cw) + 1 - ch; return x * x + y * y }
  return Int32Array.from(ids.sort((i, j) => d(i) - d(j) || i - j))
}

/**
 * sampleCells(img, grid, { mask }) -> Cells (+ `masked`: 1 where most interior pixels are
 * masked, e.g. a watermark; `pure`: 1 where every inset pixel is the same RGB, or all transparent —
 * exact evidence that cleanup must not override; `rgb`: that exact 0xRRGGBB for opaque pure cells,
 * else -1, so exact palettes stay byte-exact).
 * Distances use toe-corrected L (color.js toeL); output colors keep true OKLab.
 * Per cell: opaque inset pixels, visited centre-out -> leader clusters (nearest leader, ties
 * lowest) -> heaviest cluster -> mean after dropping its top/bottom 20% by L (D18: averages
 * texture/noise out of the cell colour; the leader radius already excludes neighbour colours).
 */
export function sampleCells(img, grid, { mask = null } = {}) {
  const W = img.width, d = img.data
  const X = insetRanges(grid.x, W), Y = insetRanges(grid.y, img.height)
  const w = grid.x.count, h = grid.y.count, n = w * h
  const lab = new Float32Array(n * 3), alpha = new Uint8Array(n), dominance = new Float32Array(n), masked = new Uint8Array(n), pure = new Uint8Array(n)
  const rgbOf = new Int32Array(n).fill(-1)
  let maxPx = 1
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) maxPx = Math.max(maxPx, (X.hi[i] - X.lo[i]) * (Y.hi[j] - Y.lo[j]))
  const px = new Float64Array(maxPx * 3), trueL = new Float64Array(maxPx), label = new Int32Array(maxPx), lead = new Int32Array(maxPx), count = new Int32Array(maxPx)
  const order = new Int32Array(maxPx), t = new Float64Array(3), orders = new Map()
  let tl = 0

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const c = cy * w + cx, x0 = X.lo[cx], y0 = Y.lo[cy], cw = X.hi[cx] - x0, ch = Y.hi[cy] - y0
      const key = cw * 65536 + ch
      let visit = orders.get(key)
      if (!visit) orders.set(key, (visit = centreOut(cw, ch)))
      let m = 0, nMasked = 0, prev = -1, first = -1, same = 1
      for (const v of visit) {
        const q = (y0 + Math.floor(v / cw)) * W + x0 + (v % cw), p = q * 4
        if (mask && mask[q]) nMasked++
        if (d[p + 3] < 128) continue
        const rgb = (d[p] << 16) | (d[p + 1] << 8) | d[p + 2]
        if (first < 0) first = rgb
        else if (rgb !== first) same = 0
        if (rgb !== prev) { srgbToOklab(d[p], d[p + 1], d[p + 2], t, 0); tl = toeL(t[0]); prev = rgb }
        trueL[m] = t[0]; px[m * 3] = tl; px[m * 3 + 1] = t[1]; px[m * 3 + 2] = t[2]
        m++
      }
      const total = cw * ch
      if (nMasked * 2 > total) masked[c] = 1
      if (m === 0 || m * 2 < total) { dominance[c] = 1; pure[c] = m === 0 ? 1 : 0; continue } // transparent cell
      alpha[c] = 255
      pure[c] = same && m === total ? 1 : 0
      // leader clustering in visit order
      let k = 0
      for (let i = 0; i < m; i++) {
        let best = -1, bd = TAU2
        for (let q = 0; q < k; q++) {
          const o = lead[q] * 3, dL = px[i * 3] - px[o], da = px[i * 3 + 1] - px[o + 1], db = px[i * 3 + 2] - px[o + 2]
          const dd = dL * dL + da * da + db * db
          if (dd < bd) { bd = dd; best = q }
        }
        if (best < 0) { best = k; lead[k] = i; count[k++] = 0 }
        label[i] = best; count[best]++
      }
      let win = 0
      for (let q = 1; q < k; q++) if (count[q] > count[win]) win = q
      dominance[c] = count[win] / m
      if (pure[c]) { rgbOf[c] = first; lab[c * 3] = trueL[0]; lab[c * 3 + 1] = px[1]; lab[c * 3 + 2] = px[2]; continue }
      let mL = 0, ma = 0, mb = 0, cnt = 0
      for (let i = 0; i < m; i++) if (label[i] === win) order[cnt++] = i
      const sorted = Array.from(order.subarray(0, cnt)).sort((i, j) => px[i * 3] - px[j * 3] || i - j)
      const drop = Math.floor(cnt * 0.2), keep = sorted.slice(drop, cnt - drop)
      for (const i of keep) { mL += trueL[i]; ma += px[i * 3 + 1]; mb += px[i * 3 + 2] }
      lab[c * 3] = mL / keep.length; lab[c * 3 + 1] = ma / keep.length; lab[c * 3 + 2] = mb / keep.length
    }
  }
  return { w, h, lab, alpha, dominance, masked, pure, rgb: rgbOf }
}
