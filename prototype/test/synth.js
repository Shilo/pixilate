// Deterministic pseudo-pixel degradation generator (artifact characterization §2).
// Input: a true low-res sprite Img. Output: { img, truth } where truth holds the
// full-canvas GT lattice (sprite padded with transparent margin cells), the cell
// counts the converter should target, and the true seam positions.
// Seeded per stage (mulberry32 over FNV-1a(stage) ^ seed); never Math.random.
// Transcendentals (sin/exp/log) are fine here: determinism is per JS engine (§2.5).
import jpeg from 'jpeg-js'

export function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stage PRNG: r() uniform [0,1), r.g() standard normal (Box-Muller, cached pair). */
export function rng(seed, stage) {
  let h = 0x811c9dc5 ^ (seed | 0)
  for (let i = 0; i < stage.length; i++) h = Math.imul(h ^ stage.charCodeAt(i), 0x01000193)
  const r = mulberry32(h)
  let spare = null
  r.g = () => {
    if (spare !== null) { const s = spare; spare = null; return s }
    const u = 1 - r(), v = r(), m = Math.sqrt(-2 * Math.log(u))
    spare = m * Math.sin(2 * Math.PI * v)
    return m * Math.cos(2 * Math.PI * v)
  }
  return r
}

// §2.2 defaults. A [lo, hi] array means "draw U(lo, hi) per sample" (rng 'params').
export const DEFAULTS = {
  marginFrac: 0.12, cellSize: 8, aniso: 0.015, phaseX: [-0.5, 0.5], phaseY: [-0.5, 0.5],
  driftAmp: 0.3, driftWavelength: 30, driftComponents: 3, maxLocalScaleVar: 0.06, driftAxisRatio: 1, rotationDeg: 0,
  mixelRegions: 2, mixelRadius: 6, mixelFactor: 2, mixelMaxFrac: 0.25, // cap: share of opaque cells re-rendered as mixels
  supersample: 4, internalScale: 1, resampleKernel: 'bicubic', edgeBlurSigma: 0.5,
  cellJitter: 2, paletteDrift: 1.5, cellGradient: 4, gradientMode: 'light',
  textureAmp: 2, textureScale: 1.5, noiseSigma: 0.7,
  bgMode: 'near-white', nearWhite: [252, 255], checkerSize: 16, checkerLight: 255, checkerDark: 204,
  shadowOpacity: 0, shadowBlur: 8, shadowOffsetX: 0.5, shadowOffsetY: 0.8,
  glowOpacity: 0, glowBlur: 12,
  encode: 'png', jpegQuality: 80, jpegGenerations: 1, cropX: 0, cropY: 0, finalRescale: 1,
  scene: {}, // overrides applied when the GT is fully opaque (scene: fit cover, no margin, bg 'scene')
}

const CLEAN = {
  cellSize: 8, aniso: 0, phaseX: 0, phaseY: 0, driftAmp: 0, mixelRegions: 0, supersample: 1, edgeBlurSigma: 0,
  cellJitter: 0, paletteDrift: 0, cellGradient: 0, textureAmp: 0, noiseSigma: 0, bgMode: 'keep-alpha',
}
const NONINT = { ...CLEAN, cellSize: [4.5, 16], aniso: 0, phaseX: [-0.5, 0.5], phaseY: [-0.5, 0.5], supersample: 4, bgMode: 'flat' }
const GPT = {
  cellSize: [6.6, 10.8], aniso: [-0.02, 0.08], driftAmp: 0.3, driftWavelength: 30, maxLocalScaleVar: 0.06,
  mixelRegions: 4, mixelRadius: 6, edgeBlurSigma: 0.5, cellJitter: 2, paletteDrift: 1.5, cellGradient: 4,
  textureAmp: 3, noiseSigma: 0.6, bgMode: 'near-white', nearWhite: [252, 255],
  scene: { edgeBlurSigma: 0.9, cellGradient: 8, textureAmp: 4 },
}

// §2.8 presets. `fake-alpha` is the single-sprite form of `fake-alpha-sheet` (checker + shadow).
export const PRESETS = {
  'clean-nn-integer': CLEAN,
  'nonint-nn': NONINT,
  'nonint-bilinear': { ...NONINT, cellSize: 9.6, internalScale: 1.5, resampleKernel: 'bilinear', supersample: 1 },
  'gpt-image-like': GPT,
  'gemini-like': {
    cellSize: 14.2, internalScale: 2, resampleKernel: 'bicubic', aniso: 0.005, driftAmp: 0.35, driftWavelength: 20,
    driftAxisRatio: 0.3, mixelRegions: 3, supersample: 1, edgeBlurSigma: 0, cellJitter: 2, cellGradient: 1,
    textureAmp: 1.5, noiseSigma: 0.8, bgMode: 'near-white', nearWhite: [247, 255],
  },
  'drift-heavy': { ...GPT, cellSize: [5.2, 10], aniso: 0.08, driftAmp: 0.9, driftWavelength: 15, maxLocalScaleVar: 0.1 },
  'mixel-detail': { ...GPT, mixelRegions: 10, mixelRadius: [8, 14], mixelFactor: 2, textureAmp: 4 },
  'jpeg-heavy': { ...NONINT, edgeBlurSigma: 0.4, encode: 'jpeg', jpegQuality: [50, 85], jpegGenerations: 2, cropX: 0, cropY: 0, finalRescale: [0.9, 1.1] },
  'fake-alpha': { ...GPT, bgMode: 'checker', checkerSize: 16, shadowOpacity: 0.3, shadowBlur: 8, shadowOffsetX: 0.5, shadowOffsetY: 0.8 },
  // GT bicubic-upsampled straight to the canvas (internal canvas = 1 px per cell): still gridded
  // pixel art, stratum I. The true no-grid control is noGrid() below.
  'bicubic-x8': {
    cellSize: 8, internalScale: 'cell', supersample: 1, resampleKernel: 'bicubic', edgeBlurSigma: 0.35, driftAmp: 0,
    mixelRegions: 0, cellGradient: 24, textureAmp: 8, textureScale: 3, noiseSigma: 1.5, bgMode: 'gradient',
  },
  // Plain smooth upscales of the GT (no noise, transparent margin): bicubic-x8's 1-px-per-cell
  // mechanism with CLEAN parameters. Seed-free (no drawn parameter is used), stratum I.
  'bilinear-x8': { ...CLEAN, internalScale: 'cell', resampleKernel: 'bilinear' },
  'bilinear-x8.37': { ...CLEAN, cellSize: 8.37, internalScale: 'cell', resampleKernel: 'bilinear' },
  'bicubic-x8-clean': { ...CLEAN, internalScale: 'cell', resampleKernel: 'bicubic' },
}

// Primary benchmark stratum per preset (methodology §4): G exact, I interpolated, M mixel, B background.
export const PRESET_STRATUM = {
  'clean-nn-integer': 'G', 'nonint-nn': 'I', 'nonint-bilinear': 'I', 'jpeg-heavy': 'I', 'bicubic-x8': 'I',
  'bilinear-x8': 'I', 'bilinear-x8.37': 'I', 'bicubic-x8-clean': 'I',
  'gpt-image-like': 'M', 'gemini-like': 'M', 'drift-heavy': 'M', 'mixel-detail': 'M', 'fake-alpha': 'B',
}
// Bumped on any change that alters emitted fixture pixels or truth (recorded by bench.mjs).
export const SYNTH_VERSION = 'pixilate-synth/3'

function resolve(params, seed, opaque) {
  const base = { ...DEFAULTS, ...params }
  const P = opaque ? { ...base, marginFrac: 0, bgMode: 'scene', ...base.scene } : base
  if (P.bgMode === 'keep-alpha' && P.encode === 'jpeg') throw new Error('jpeg needs an opaque background')
  const r = rng(seed, 'params')
  for (const k of Object.keys(P).sort()) {
    const v = P[k]
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') P[k] = v[0] + (v[1] - v[0]) * r()
  }
  if (P.internalScale === 'cell') P.internalScale = P.cellSize // render 1 px per cell, then resample up
  P.cropX = Math.floor(P.cropX); P.cropY = Math.floor(P.cropY)
  P.mixelRegions = Math.round(P.mixelRegions)
  return P
}

// ---- filters on premultiplied Float32 RGBA (alpha in [0,1], rgb premultiplied, 0..255) ----

function gaussKernel(sigma) {
  const rad = Math.ceil(3 * sigma), k = new Float64Array(2 * rad + 1)
  let s = 0
  for (let i = -rad; i <= rad; i++) s += k[i + rad] = Math.exp((-i * i) / (2 * sigma * sigma))
  for (let i = 0; i < k.length; i++) k[i] /= s
  return { k, rad }
}

/** Separable Gaussian, clamp-to-edge, on an image with `ch` interleaved channels. */
export function gaussian(src, w, h, ch, sigma) {
  if (!(sigma > 0)) return src
  const { k, rad } = gaussKernel(sigma)
  const pass = (inp, n, m, stride, step) => { // blur along an axis of length n, m lines
    const out = new Float32Array(inp.length), line = new Float32Array((n + 2 * rad) * ch)
    for (let j = 0; j < m; j++) {
      const base = j * stride
      for (let i = -rad; i < n + rad; i++) {
        const s = base + Math.min(n - 1, Math.max(0, i)) * step
        for (let c = 0; c < ch; c++) line[(i + rad) * ch + c] = inp[s + c]
      }
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
        let acc = 0
        for (let t = 0; t < k.length; t++) acc += k[t] * line[(i + t) * ch + c]
        out[base + i * step + c] = acc
      }
    }
    return out
  }
  return pass(pass(src, w, h, w * ch, ch), h, w, ch, w * ch)
}

const KERNELS = {
  bilinear: { support: 1, f: (t) => Math.max(0, 1 - Math.abs(t)) },
  bicubic: { support: 2, f: (t) => { // Keys a = -0.5
    t = Math.abs(t)
    return t < 1 ? 1.5 * t * t * t - 2.5 * t * t + 1 : t < 2 ? -0.5 * t * t * t + 2.5 * t * t - 4 * t + 2 : 0
  } },
}

function weights(sn, dn, kernel) {
  const scale = dn / sn, rows = []
  if (kernel === 'nearest') {
    for (let i = 0; i < dn; i++) rows.push({ i0: Math.min(sn - 1, Math.floor((i + 0.5) / scale)), w: [1] })
    return rows
  }
  const K = KERNELS[kernel], fs = scale < 1 ? scale : 1, sup = K.support / fs
  for (let i = 0; i < dn; i++) {
    const c = (i + 0.5) / scale - 0.5, i0 = Math.floor(c - sup) + 1, i1 = Math.floor(c + sup), w = []
    let s = 0
    for (let j = i0; j <= i1; j++) s += w[j - i0] = K.f((j - c) * fs)
    rows.push({ i0, w: w.map((v) => v / s) })
  }
  return rows
}

/** Separable resample (clamp-to-edge) of a ch-channel float image. */
export function resample(src, sw, sh, dw, dh, ch, kernel) {
  const wx = weights(sw, dw, kernel), wy = weights(sh, dh, kernel)
  const tmp = new Float32Array(dw * sh * ch), out = new Float32Array(dw * dh * ch)
  for (let y = 0; y < sh; y++) for (let x = 0; x < dw; x++) {
    const { i0, w } = wx[x]
    for (let c = 0; c < ch; c++) {
      let s = 0
      for (let j = 0; j < w.length; j++) s += w[j] * src[(y * sw + Math.min(sw - 1, Math.max(0, i0 + j))) * ch + c]
      tmp[(y * dw + x) * ch + c] = s
    }
  }
  for (let y = 0; y < dh; y++) {
    const { i0, w } = wy[y]
    for (let x = 0; x < dw; x++) for (let c = 0; c < ch; c++) {
      let s = 0
      for (let j = 0; j < w.length; j++) s += w[j] * tmp[(Math.min(sh - 1, Math.max(0, i0 + j)) * dw + x) * ch + c]
      out[(y * dw + x) * ch + c] = s
    }
  }
  return out
}

// ---- warp ----

function buildWarp(P, cell, r) {
  const axes = []
  for (const [a, c] of [[0, cell[0]], [1, cell[1]]]) {
    const comps = []
    if (P.driftAmp > 0) {
      const K = P.driftComponents
      for (let k = 0; k < K; k++) {
        const th = r() * 2 * Math.PI, lam = P.driftWavelength * c * (0.6 + 0.8 * r()), ph = r() * 2 * Math.PI
        let A = (P.driftAmp * c) / Math.sqrt(K) * (0.5 + r())
        if (a === 1) A *= P.driftAxisRatio
        comps.push({ cx: Math.cos(th) / lam, cy: Math.sin(th) / lam, ph, A, lam })
      }
      const S = comps.reduce((s, q) => s + (2 * Math.PI * q.A) / q.lam, 0)
      if (S > P.maxLocalScaleVar) for (const q of comps) q.A *= P.maxLocalScaleVar / S
    }
    axes.push(comps)
  }
  const f = (comps) => (X, Y) => {
    let s = 0
    for (const q of comps) s += q.A * Math.sin(2 * Math.PI * (q.cx * X + q.cy * Y) + q.ph)
    return s
  }
  return { dx: f(axes[0]), dy: f(axes[1]), comps: axes }
}

// ---- main ----

/**
 * @param {{width,height,data}} sprite true low-res GT (binary alpha expected)
 * @param {object|string} params preset name or parameter object (merged over DEFAULTS)
 * @param {number} seed
 */
export function degrade(sprite, params = {}, seed = 1) {
  if (typeof params === 'string') params = PRESETS[params]
  const w = sprite.width, h = sprite.height, gt = sprite.data
  let opaque = true
  for (let i = 3; i < gt.length; i += 4) if (gt[i] < 128) { opaque = false; break }
  const P = resolve(params, seed, opaque)

  // Palette (exact opaque RGB) + per-index shift.
  const palKey = new Map(), palIdx = new Int32Array(w * h).fill(-1), palRGB = []
  for (let p = 0; p < w * h; p++) {
    if (gt[p * 4 + 3] < 128) continue
    const key = (gt[p * 4] << 16) | (gt[p * 4 + 1] << 8) | gt[p * 4 + 2]
    if (!palKey.has(key)) { palKey.set(key, palRGB.length); palRGB.push([gt[p * 4], gt[p * 4 + 1], gt[p * 4 + 2]]) }
    palIdx[p] = palKey.get(key)
  }

  // Layout (§2.4 step 2): margin in whole cells; canvas derived from cell size.
  const m = P.marginFrac
  const mx = Math.round((w * m) / (1 - 2 * m)), my = Math.round((h * m) / (1 - 2 * m))
  const cellsX = w + 2 * mx, cellsY = h + 2 * my
  const cx = P.cellSize, cy = cx * (1 + P.aniso)
  const W = Math.round(cellsX * cx), H = Math.round(cellsY * cy)
  const s = P.internalScale, Wi = Math.round(W / s), Hi = Math.round(H / s)
  const cxi = cx / s, cyi = cy / s, x0i = (P.phaseX * cx) / s, y0i = (P.phaseY * cy) / s
  const warp = buildWarp(P, [cxi, cyi], rng(seed, 'warp'))

  // Per-cell and per-palette attributes.
  const rc = rng(seed, 'cells')
  const pshift = palRGB.map(() => [rc.g() * P.paletteDrift, rc.g() * P.paletteDrift, rc.g() * P.paletteDrift])
  const jit = new Float32Array(w * h * 3), gcos = new Float32Array(w * h), gsin = new Float32Array(w * h)
  const alpha0 = rc() * 2 * Math.PI
  for (let p = 0; p < w * h; p++) {
    for (let c = 0; c < 3; c++) jit[p * 3 + c] = rc.g() * P.cellJitter
    const dir = P.gradientMode === 'light' ? alpha0 + rc.g() * (Math.PI / 6) : rc() * 2 * Math.PI
    const mag = P.cellGradient * (0.5 + rc())
    gcos[p] = mag * Math.cos(dir); gsin[p] = mag * Math.sin(dir)
  }

  // Mixels: half-cell re-render (bilinear upsample snapped to the GT palette) inside random disks.
  const rm = rng(seed, 'mixels'), f = P.mixelFactor, inMix = new Uint8Array(w * h)
  const regions = []
  let gt2 = null
  const opaqueCells = []
  for (let p = 0; p < w * h; p++) if (palIdx[p] >= 0) opaqueCells.push(p)
  if (P.mixelRegions > 0 && opaqueCells.length) {
    for (let k = 0; k < P.mixelRegions; k++) {
      const p = opaqueCells[Math.floor(rm() * opaqueCells.length)]
      regions.push({ u: (p % w) + 0.5, v: Math.floor(p / w) + 0.5, r: P.mixelRadius * (0.6 + 0.8 * rm()) })
    }
    // Keep the cells closest to a centre (relative to its radius), at most mixelMaxFrac of the opaque
    // cells: beyond that the image is genuinely half-resolution and the GT stops being the answer.
    const cand = []
    for (let p = 0; p < w * h; p++) {
      const u = (p % w) + 0.5, v = Math.floor(p / w) + 0.5
      let d = Infinity
      for (const q of regions) d = Math.min(d, Math.sqrt((u - q.u) ** 2 + (v - q.v) ** 2) / q.r)
      if (d < 1) cand.push([d, p])
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [, p] of cand.slice(0, Math.floor(P.mixelMaxFrac * opaqueCells.length))) inMix[p] = 1
    gt2 = new Int32Array(w * f * h * f)
    const at = (x, y) => Math.min(w - 1, Math.max(0, x)) + Math.min(h - 1, Math.max(0, y)) * w
    for (let Y = 0; Y < h * f; Y++) for (let X = 0; X < w * f; X++) {
      const sx = (X + 0.5) / f - 0.5, sy = (Y + 0.5) / f - 0.5, ix = Math.floor(sx), iy = Math.floor(sy), tx = sx - ix, ty = sy - iy
      let a = 0, R = 0, G = 0, B = 0
      for (const [px, py, wt] of [[ix, iy, (1 - tx) * (1 - ty)], [ix + 1, iy, tx * (1 - ty)], [ix, iy + 1, (1 - tx) * ty], [ix + 1, iy + 1, tx * ty]]) {
        const q = at(px, py), al = palIdx[q] >= 0 ? wt : 0
        a += al; R += al * gt[q * 4]; G += al * gt[q * 4 + 1]; B += al * gt[q * 4 + 2]
      }
      if (a < 0.5) { gt2[Y * w * f + X] = -1; continue }
      R /= a; G /= a; B /= a
      let best = 0, bd = Infinity
      for (let i = 0; i < palRGB.length; i++) {
        const d = (palRGB[i][0] - R) ** 2 + (palRGB[i][1] - G) ** 2 + (palRGB[i][2] - B) ** 2
        if (d < bd) { bd = d; best = i }
      }
      gt2[Y * w * f + X] = best
    }
  }

  // Render (§2.4 step 6) at internal resolution, premultiplied float RGBA.
  const ss = P.supersample, rot = (P.rotationDeg * Math.PI) / 180, cr = Math.cos(-rot), sr = Math.sin(-rot)
  const ccx = Wi / 2, ccy = Hi / 2
  let buf = new Float32Array(Wi * Hi * 4)
  for (let Y = 0; Y < Hi; Y++) for (let X = 0; X < Wi; X++) {
    const dx = warp.dx(X + 0.5, Y + 0.5), dy = warp.dy(X + 0.5, Y + 0.5)
    let R = 0, G = 0, B = 0, A = 0
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      let Xs = X + (i + 0.5) / ss, Ys = Y + (j + 0.5) / ss
      if (rot) { const ex = Xs - ccx, ey = Ys - ccy; Xs = ccx + cr * ex - sr * ey; Ys = ccy + sr * ex + cr * ey }
      const u = (Xs - x0i - dx) / cxi - mx, v = (Ys - y0i - dy) / cyi - my
      let iu = Math.floor(u), iv = Math.floor(v)
      if (opaque) { iu = Math.min(w - 1, Math.max(0, iu)); iv = Math.min(h - 1, Math.max(0, iv)) } // scene: edge cells extend to the canvas border
      else if (iu < 0 || iv < 0 || iu >= w || iv >= h) continue
      const cell = iv * w + iu
      const pi = inMix[cell] ? gt2[Math.max(0, Math.min(h * f - 1, Math.floor(v * f))) * w * f + Math.max(0, Math.min(w * f - 1, Math.floor(u * f)))] : palIdx[cell]
      if (pi < 0) continue
      const sh = gcos[cell] * (u - iu - 0.5) + gsin[cell] * (v - iv - 0.5), c = palRGB[pi], ps = pshift[pi]
      R += c[0] + ps[0] + jit[cell * 3] + sh
      G += c[1] + ps[1] + jit[cell * 3 + 1] + sh
      B += c[2] + ps[2] + jit[cell * 3 + 2] + sh
      A += 1
    }
    const o = (Y * Wi + X) * 4, n = ss * ss
    buf[o] = R / n; buf[o + 1] = G / n; buf[o + 2] = B / n; buf[o + 3] = A / n
  }

  // Background, shadow, glow (§2.4 step 7).
  if (P.bgMode !== 'keep-alpha' && P.bgMode !== 'scene') {
    const rb = rng(seed, 'bg'), bg = new Float32Array(Wi * Hi * 3)
    const g0 = [0, 1, 2].map(() => 150 + rb() * 105), g1 = [0, 1, 2].map(() => 150 + rb() * 105)
    const nw = P.nearWhite /* drawn in resolve() */, flat = 110 + rb() * 30
    const cs = P.checkerSize / s, cox = rb() * cs, coy = rb() * cs
    for (let Y = 0; Y < Hi; Y++) for (let X = 0; X < Wi; X++) {
      const o = (Y * Wi + X) * 3
      for (let c = 0; c < 3; c++) {
        bg[o + c] = P.bgMode === 'flat' ? flat
          : P.bgMode === 'near-white' ? nw
          : P.bgMode === 'gradient' ? g0[c] + (g1[c] - g0[c]) * (Y / Math.max(1, Hi - 1))
          : P.bgMode === 'checker' ? ((Math.floor((X + cox) / cs) + Math.floor((Y + coy) / cs)) & 1 ? P.checkerDark : P.checkerLight)
          : 255
      }
    }
    const alphaPlane = () => { const a = new Float32Array(Wi * Hi); for (let i = 0; i < a.length; i++) a[i] = buf[i * 4 + 3]; return a }
    if (P.shadowOpacity > 0) {
      const a = gaussian(alphaPlane(), Wi, Hi, 1, P.shadowBlur / s), ox = Math.round(P.shadowOffsetX * cxi), oy = Math.round(P.shadowOffsetY * cyi)
      for (let Y = 0; Y < Hi; Y++) for (let X = 0; X < Wi; X++) {
        const sx = X - ox, sy = Y - oy
        const v = sx >= 0 && sy >= 0 && sx < Wi && sy < Hi ? a[sy * Wi + sx] : 0
        for (let c = 0; c < 3; c++) bg[(Y * Wi + X) * 3 + c] *= 1 - P.shadowOpacity * v
      }
    }
    if (P.glowOpacity > 0) {
      const a = gaussian(alphaPlane(), Wi, Hi, 1, P.glowBlur / s)
      const gc = palRGB.reduce((b, c) => (c[0] + c[1] + c[2] > b[0] + b[1] + b[2] ? c : b), [0, 0, 0])
      for (let i = 0; i < Wi * Hi; i++) for (let c = 0; c < 3; c++) bg[i * 3 + c] = Math.min(255, bg[i * 3 + c] + P.glowOpacity * a[i] * gc[c])
    }
    for (let i = 0; i < Wi * Hi; i++) {
      const A = buf[i * 4 + 3]
      for (let c = 0; c < 3; c++) buf[i * 4 + c] += bg[i * 3 + c] * (1 - A)
      buf[i * 4 + 3] = 1
    }
  }

  // Blur + resample to output size (§2.4 step 8).
  buf = gaussian(buf, Wi, Hi, 4, P.edgeBlurSigma)
  if (Wi !== W || Hi !== H) buf = resample(buf, Wi, Hi, W, H, 4, P.resampleKernel)

  // Texture, noise; unpremultiply; quantize (§2.4 step 9).
  const rn = rng(seed, 'noise')
  let tex = null
  if (P.textureAmp > 0) {
    tex = new Float32Array(W * H)
    for (let i = 0; i < tex.length; i++) tex[i] = rn.g()
    tex = gaussian(tex, W, H, 1, P.textureScale)
    let mean = 0, v = 0
    for (let i = 0; i < tex.length; i++) mean += tex[i]
    mean /= tex.length
    for (let i = 0; i < tex.length; i++) v += (tex[i] - mean) ** 2
    const sd = Math.sqrt(v / tex.length) || 1
    for (let i = 0; i < tex.length; i++) tex[i] = ((tex[i] - mean) / sd) * P.textureAmp
  }
  let out = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const A = Math.min(1, Math.max(0, buf[i * 4 + 3]))
    if (A <= 0) continue
    for (let c = 0; c < 3; c++) {
      let v = buf[i * 4 + c] / A
      if (tex) v += tex[i] + 0.3 * P.textureAmp * rn.g()
      if (P.noiseSigma > 0) v += P.noiseSigma * rn.g()
      out[i * 4 + c] = Math.round(v)
    }
    out[i * 4 + 3] = Math.round(A * 255)
  }
  let img = { width: W, height: H, data: out }

  // Truth seams along the canvas centre row/column, solved through the warp (fixed point; |D'| <= 0.1).
  const solve = (n, origin, cell, D) => {
    const cuts = new Float64Array(n + 1)
    for (let i = 0; i <= n; i++) {
      let X = origin + i * cell
      for (let it = 0; it < 30; it++) X = origin + i * cell + D(X)
      cuts[i] = X * s
    }
    return cuts
  }
  let cutsX = solve(cellsX, x0i, cxi, (X) => warp.dx(X, Hi / 2))
  let cutsY = solve(cellsY, y0i, cyi, (Y) => warp.dy(Wi / 2, Y))
  const sxW = W / (Wi * s), syH = H / (Hi * s) // internal rounding correction
  cutsX = cutsX.map((c) => c * sxW); cutsY = cutsY.map((c) => c * syH)
  let cellW = (cxi * W) / Wi, cellH = (cyi * H) / Hi

  // Encode stage (§2.4 step 11): crop, JPEG generations, final rescale.
  if (P.cropX || P.cropY) {
    const nw = W - P.cropX, nh = H - P.cropY, d = new Uint8ClampedArray(nw * nh * 4)
    for (let y = 0; y < nh; y++) d.set(img.data.subarray(((y + P.cropY) * W + P.cropX) * 4, ((y + P.cropY) * W + W) * 4), y * nw * 4)
    img = { width: nw, height: nh, data: d }
    cutsX = cutsX.map((c) => c - P.cropX); cutsY = cutsY.map((c) => c - P.cropY)
  }
  if (P.encode === 'jpeg') {
    for (let g = 0; g < P.jpegGenerations; g++) {
      const enc = jpeg.encode({ width: img.width, height: img.height, data: img.data }, Math.round(P.jpegQuality))
      const dec = jpeg.decode(enc.data, { useTArray: true, formatAsRGBA: true })
      img = { width: dec.width, height: dec.height, data: new Uint8ClampedArray(dec.data.buffer, dec.data.byteOffset, dec.data.length) }
    }
  }
  if (P.finalRescale !== 1) {
    const nw = Math.round(img.width * P.finalRescale), nh = Math.round(img.height * P.finalRescale)
    const fx = nw / img.width, fy = nh / img.height
    const src = Float32Array.from(img.data), dst = resample(src, img.width, img.height, nw, nh, 4, 'bilinear')
    img = { width: nw, height: nh, data: Uint8ClampedArray.from(dst, (v) => Math.round(v)) }
    cutsX = cutsX.map((c) => c * fx); cutsY = cutsY.map((c) => c * fy)
    cellW *= fx; cellH *= fy
  }

  // Full-canvas truth: sprite inside transparent margin cells.
  const full = { width: cellsX, height: cellsY, data: new Uint8ClampedArray(cellsX * cellsY * 4) }
  for (let y = 0; y < h; y++) full.data.set(gt.subarray(y * w * 4, (y + 1) * w * 4), ((y + my) * cellsX + mx) * 4)

  // Ambiguous cells: on a 4x4 sub-cell sample (mixel source + shading + shifts, as rendered), the GT
  // colour is not the strict plurality of nearest-palette labels, so no converter can recover it.
  const ambiguous = new Uint8Array(cellsX * cellsY), cnt = new Int32Array(palRGB.length + 1)
  for (let cell = 0; cell < w * h; cell++) {
    if (!inMix[cell] && !(P.cellGradient > 0)) continue
    const iu = cell % w, iv = (cell / w) | 0, gi = palIdx[cell]
    cnt.fill(0)
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const fu = (i + 0.5) / 4, fv = (j + 0.5) / 4
      const pi = inMix[cell] ? gt2[Math.min(h * f - 1, Math.floor((iv + fv) * f)) * w * f + Math.min(w * f - 1, Math.floor((iu + fu) * f))] : gi
      if (pi < 0) { cnt[palRGB.length]++; continue }
      const sh = gcos[cell] * (fu - 0.5) + gsin[cell] * (fv - 0.5), c = palRGB[pi], ps = pshift[pi]
      const R = c[0] + ps[0] + jit[cell * 3] + sh, G = c[1] + ps[1] + jit[cell * 3 + 1] + sh, B = c[2] + ps[2] + jit[cell * 3 + 2] + sh
      let best = 0, bd = Infinity
      for (let k = 0; k < palRGB.length; k++) {
        const d = (palRGB[k][0] - R) ** 2 + (palRGB[k][1] - G) ** 2 + (palRGB[k][2] - B) ** 2
        if (d < bd) { bd = d; best = k }
      }
      cnt[best]++
    }
    const g = gi < 0 ? palRGB.length : gi
    for (let k = 0; k < cnt.length; k++) if (k !== g && cnt[k] >= cnt[g]) { ambiguous[(iv + my) * cellsX + iu + mx] = 1; break }
  }
  // |phase| near 0.5 cell: the border cells are half cells, so N vs N+1 and a whole-axis one-cell
  // shift are equally valid answers. Measured from the first true cut after crop/rescale.
  const frac = (cuts, cell) => ((((cuts[0] % cell) + cell) % cell) / cell)
  const phaseAmbiguous = [Math.abs(frac(cutsX, cellW) - 0.5) < 0.05, Math.abs(frac(cutsY, cellH) - 0.5) < 0.05]
  return {
    img,
    truth: {
      sprite: full, cellsX, cellsY, cutsX, cutsY, cellW, cellH, spriteRect: { x: mx, y: my, w, h }, opaque,
      params: P, mixels: regions, mixelCells: inMix.reduce((a, v) => a + v, 0), kGT: palRGB.length, ambiguous, phaseAmbiguous,
    },
  }
}

// ---- True no-grid scenes (methodology §5.4): analytic shapes / gradients / texture, no lattice ----

/** Scene kind -> primary stratum (H continuous illustration, P gradient/texture). `waves` is a periodic false-grid trap. */
export const NO_GRID = { shapes: 'H', gradient: 'P', texture: 'P', waves: 'P' }

/** Opaque RGBA8 scene of a NO_GRID kind, 4x4 supersampled; non-block sizes 160-256 px. */
export function noGrid(kind, seed = 1) {
  if (!(kind in NO_GRID)) throw new Error(`unknown no-grid kind ${kind}`)
  const r = rng(seed, `nogrid-${kind}`), ss = 4
  const W = 160 + Math.floor(r() * 97), H = 144 + Math.floor(r() * 113)
  const col = () => [30 + r() * 200, 30 + r() * 200, 30 + r() * 200]
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const c0 = col(), c1 = col(), th = r() * 2 * Math.PI, ca = Math.cos(th), sa = Math.sin(th)
  const shapes = []
  const nShapes = kind === 'shapes' ? 6 + Math.floor(r() * 5) : kind === 'texture' ? 3 : 0
  for (let i = 0; i < nShapes; i++) {
    const rot = r() * Math.PI
    shapes.push({ cx: r() * W, cy: r() * H, rx: 8 + r() * W / 4, ry: 8 + r() * H / 4, cr: Math.cos(rot), sr: Math.sin(rot), a: col(), b: col(), box: r() < 0.3 })
  }
  const rad = { cx: r() * W, cy: r() * H, R: (0.3 + 0.5 * r()) * Math.max(W, H), c: col() }
  const waves = [0, 1].map(() => { const p = 5.3 + r() * 8.4, a = r() * Math.PI; return { kx: Math.cos(a) / p, ky: Math.sin(a) / p, ph: r() * 2 * Math.PI } })
  const paint = (x, y) => {
    let c = mix(c0, c1, Math.min(1, Math.max(0, 0.5 + (x / W - 0.5) * ca + (y / H - 0.5) * sa)))
    if (kind === 'gradient') c = mix(c, rad.c, Math.max(0, 1 - Math.hypot(x - rad.cx, y - rad.cy) / rad.R))
    if (kind === 'waves') { const v = 40 * (Math.sin(2 * Math.PI * (waves[0].kx * x + waves[0].ky * y) + waves[0].ph) + Math.sin(2 * Math.PI * (waves[1].kx * x + waves[1].ky * y) + waves[1].ph)); c = c.map((u) => u + v) }
    for (const s of shapes) { // painter's order; per-shape gradient along its local x axis
      const ex = ((x - s.cx) * s.cr + (y - s.cy) * s.sr) / s.rx, ey = (-(x - s.cx) * s.sr + (y - s.cy) * s.cr) / s.ry
      if (s.box ? Math.abs(ex) <= 1 && Math.abs(ey) <= 1 : ex * ex + ey * ey <= 1) c = mix(s.a, s.b, (ex + 1) / 2)
    }
    return c
  }
  let tex = null
  if (kind === 'texture' || kind === 'shapes') {
    const rn = rng(seed, `nogrid-tex-${kind}`), amp = kind === 'texture' ? 24 : 4
    tex = new Float32Array(W * H)
    for (let i = 0; i < tex.length; i++) tex[i] = rn.g()
    tex = gaussian(tex, W, H, 1, kind === 'texture' ? 2 + 4 * r() : 1.5)
    let sd = 0
    for (let i = 0; i < tex.length; i++) sd += tex[i] * tex[i]
    sd = Math.sqrt(sd / tex.length) || 1
    for (let i = 0; i < tex.length; i++) tex[i] *= amp / sd
  }
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let R = 0, G = 0, B = 0
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) { const c = paint(x + (i + 0.5) / ss, y + (j + 0.5) / ss); R += c[0]; G += c[1]; B += c[2] }
    const o = (y * W + x) * 4, t = tex ? tex[y * W + x] : 0, n = ss * ss
    data[o] = Math.round(R / n + t); data[o + 1] = Math.round(G / n + t); data[o + 2] = Math.round(B / n + t); data[o + 3] = 255
  }
  return { width: W, height: H, data }
}
