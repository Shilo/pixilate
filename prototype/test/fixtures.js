// Ground-truth sprites and case matrices for the harness.
// Procedural fixtures: project-authored seeded generator (no files); outputs intended CC0-1.0
// (methodology §3.1) pending a repo licence decision. Committed gates use only these.
// Local-only sets (gitignored, never tracked, never required by CI, no pixels in reports):
// external PixelLab showcase crops (CC0-dedicated AI outputs, not admitted to a Pixilate corpus,
// methodology §3.2) and private samples. Paths are repo-relative. PNG IO uses fast-png directly.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode, encode } from 'fast-png'
import { rng, PRESETS, PRESET_STRATUM, NO_GRID } from './synth.js'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const repoPath = (rel) => REPO_ROOT + rel

/** Decode a PNG file (any fast-png layout, 8/16 bit) to RGBA8 Img. */
export function readPng(path) {
  const p = decode(readFileSync(path))
  const n = p.width * p.height
  const out = new Uint8ClampedArray(n * 4)
  const sh = p.depth === 16 ? 8 : 0
  if (p.palette) {
    // Indexed: expand via palette (entries are [r,g,b] or [r,g,b,a]); depth < 8 is bit-packed.
    const bitsRow = Math.ceil((p.width * p.depth) / 8)
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const bit = x * p.depth, byte = p.data[y * bitsRow + (bit >> 3)]
      const ix = p.depth === 8 ? byte : (byte >> (8 - p.depth - (bit & 7))) & ((1 << p.depth) - 1)
      const c = p.palette[ix], o = (y * p.width + x) * 4
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c.length > 3 ? c[3] : 255
    }
  } else {
    const ch = p.channels
    for (let i = 0; i < n; i++) {
      const s = i * ch, o = i * 4
      if (ch <= 2) { out[o] = out[o + 1] = out[o + 2] = p.data[s] >> sh; out[o + 3] = ch === 2 ? p.data[s + 1] >> sh : 255 }
      else { out[o] = p.data[s] >> sh; out[o + 1] = p.data[s + 1] >> sh; out[o + 2] = p.data[s + 2] >> sh; out[o + 3] = ch === 4 ? p.data[s + 3] >> sh : 255 }
    }
  }
  return { width: p.width, height: p.height, data: out }
}

export function writePng(path, img) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, encode({ width: img.width, height: img.height, data: new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length), channels: 4, depth: 8 }))
}

export function crop(img, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0, data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1) * 4), y * w * 4)
  return { width: w, height: h, data }
}

/** Binarize alpha at 128 and zero RGB of transparent pixels (GT normal form). */
export function normalizeGT(img) {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 128) d[i + 3] = 255
    else d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0
  }
  return img
}

/** Largest integer k such that img is an exact k x k nearest-neighbour upscale (1 = native). */
export function nnFactor(img) {
  const { width: w, height: h, data: d } = img
  for (let k = Math.min(w, h); k >= 2; k--) {
    if (w % k || h % k) continue
    let ok = true
    for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
      const a = (y * w + x) * 4, b = ((y - (y % k)) * w + (x - (x % k))) * 4
      if (d[a] !== d[b] || d[a + 1] !== d[b + 1] || d[a + 2] !== d[b + 2] || d[a + 3] !== d[b + 3]) ok = false
    }
    if (ok) return k
  }
  return 1
}

// External, local-only PixelLab showcase crops (artifact characterization §3.2), paths relative to
// SHOWCASE_DIR. Not corpus-admitted; #21 (GIF frame) skipped: no GIF decoder dependency.
const SHOWCASE_DIR = '.local/fixtures/showcase/'
const SHOWCASE = [
  ['pip', 'pip/pip.png', null, 'character'],
  ['mz-front', 'rpg-maker-characters/rpg-maker-mz-character.png', [48, 0, 96, 48], 'character'],
  ['vxace-side', 'rpg-maker-characters/rpg-maker-vx-ace-character.png', [32, 64, 64, 96], 'character'],
  ['blade', 'item-icons/fantasy-rpg-inventory-bgremoved-8x8-32px.png', [0, 0, 32, 32], 'icon'],
  ['potion', 'item-icons/fantasy-rpg-inventory-bgremoved-8x8-32px.png', [0, 128, 32, 160], 'icon'],
  ['candy', 'item-icons/candy-sweets-treats-glossy-8x8-32px.png', [0, 0, 32, 32], 'icon'],
  ['inv64', 'item-icons/fantasy-rpg-inventory-64px-4x4.png', [0, 0, 64, 64], 'icon'],
  ['emoji16', 'gui-icons/animal-face-emoji-5x5-16px.png', [0, 0, 16, 16], 'icon'],
  ['skill32', 'skill-icons/create-image-pro-rich-background-8x8-32px.png', [0, 0, 32, 32], 'opaque-icon'],
  ['skill64', 'skill-icons/fantasy-rpg-skill-64px-4x4.png', [0, 0, 64, 64], 'opaque-icon'],
  ['mc-tile16', 'tiles/minecraft-inspired-generate-image-v2-16x16-atlas.png', [48, 0, 64, 16], 'opaque-tile'],
  ['mc-face64', 'tiles/minecraft-block-face-64px-4x4.png', [0, 0, 64, 64], 'opaque-tile'],
  ['onebit-td', 'tilesets/one-bit-black-green-topdown-tileset.png', [0, 0, 64, 64], '1-bit'],
  ['onebit-ss', 'tilesets/one-bit-sidescroller-icy-cap-bw-gameboy.png', [0, 0, 128, 128], '1-bit-alpha'],
  ['terrain', 'tilesets/topdown-dirt-grass-low-single-color-outline.png', null, 'opaque-tileset'],
  ['platformer', 'tilesets/tileset-showcase-32px-sidescroller-atlas.png', [0, 0, 128, 128], 'tiles-alpha'],
  ['fire', 'visual-effects/fire-explosion.png', [32, 0, 64, 32], 'vfx'],
  ['sparks', 'visual-effects/spark-explosion.png', [0, 0, 32, 32], 'vfx-sparse'],
  ['ui-ring', 'gameplay-gui/modular-mmorpg-gui-textless-688x384.png', [116, 294, 190, 367], 'ui'],
  ['ui-bar', 'gameplay-gui/modular-mmorpg-gui-textless-688x384.png', [16, 239, 214, 267], 'ui-aspect'],
]

// Private local sprites (§3.3, gitignored): used only when present.
const LOCAL = [
  ['local-portrait', '.local/samples/local-portrait.png', null, 'opaque-sprite'],
  ['local-creature', '.local/samples/local-creature.png', [37, 31, 88, 92], 'sprite-alpha'],
  ['local-building', '.local/samples/local-building.png', [36, 22, 92, 112], 'sprite-alpha'],
  ['local-tileset', '.local/samples/local-tileset.png', null, 'opaque-tileset'],
]

// family = source file: crops of one sheet are one base family (methodology §2.6).
const load = (list, dir = '') => list.filter(([, rel]) => existsSync(repoPath(dir + rel))).map(([id, rel, box, category]) => {
  let img = readPng(repoPath(dir + rel))
  if (box) img = crop(img, ...box)
  return { id, category, img: normalizeGT(img), family: dir ? `showcase:${rel}` : `local:${id}` }
})

export const SHOWCASE_COUNT = SHOWCASE.length
export const showcaseSprites = () => load(SHOWCASE, SHOWCASE_DIR)
export const localSprites = () => load(LOCAL)

// ---- Procedural sprites (seeded) ----

function canvas(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } }
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
  const o = (y * img.width + x) * 4
  img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255
}
const shade = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))))
const pick = (r) => [40 + Math.floor(r() * 180), 40 + Math.floor(r() * 180), 40 + Math.floor(r() * 180)]

/** Character blob: dark outline, 3-tone body, 1-px eyes and glint, 1-px antenna. Transparent bg. */
function blob(seed) {
  const r = rng(seed, 'blob'), w = 24, h = 28, img = canvas(w, h)
  const body = pick(r), dark = shade(body, 0.6), light = shade(body, 1.35), outline = [24, 20, 32]
  const cx = 12, cy = 16, rx = 8 + Math.floor(r() * 2), ry = 9 + Math.floor(r() * 2)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
    if (e <= 1) put(img, x, y, e > 0.72 ? outline : x + y < cx + cy - 4 ? light : x - y > 2 ? dark : body)
  }
  put(img, cx - 3, cy - 2, [250, 250, 250]); put(img, cx + 2, cy - 2, [250, 250, 250]) // eyes
  put(img, cx - 5, cy - 6, [255, 255, 210]) // glint
  for (let y = cy - ry - 4; y < cy - ry + 1; y++) put(img, cx + ((y & 1) ? 0 : 1), y, outline) // 1-px zigzag antenna
  return img
}

/** Opaque tile: checker-dither band, stripes, a 1-px diagonal line, single-pixel sparkles. */
function tile(seed) {
  const r = rng(seed, 'tile'), w = 20, h = 20, img = canvas(w, h)
  const a = pick(r), b = shade(a, 0.7), line = [20, 20, 28], spark = [255, 240, 200]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(img, x, y, y < 6 ? ((x + y) & 1 ? a : b) : y < 13 ? (x % 4 < 2 ? a : b) : a)
  for (let i = 0; i < 7; i++) put(img, 12 + i, 19 - i, line)
  for (let i = 0; i < 3; i++) put(img, 1 + Math.floor(r() * 9), 14 + Math.floor(r() * 5), spark)
  return img
}

/** 16x16 icon: 1-px diagonal blade, 2-px hilt, gem with highlight. Transparent bg. */
function icon(seed) {
  const r = rng(seed, 'icon'), img = canvas(16, 16)
  const steel = [190, 200, 215], edge = [90, 100, 120], gem = pick(r)
  for (let i = 0; i < 10; i++) { put(img, 4 + i, 11 - i, steel); put(img, 5 + i, 11 - i, edge) }
  for (let i = 0; i < 5; i++) put(img, 2 + i, 9 + i, [110, 70, 40])
  put(img, 3, 12, gem); put(img, 4, 12, gem); put(img, 3, 13, gem); put(img, 4, 13, shade(gem, 0.6)); put(img, 3, 12, shade(gem, 1.5))
  return img
}

// ---- Cleanup traps: features a cleanup pass must not delete ----

/** 1-bit opaque tile: 2 colours, 1-px rules, diagonals, a 1-px cross and isolated single pixels. */
function onebit(seed) {
  const r = rng(seed, '1bit'), w = 24, h = 24, img = canvas(w, h), bg = [12, 16, 12], fg = [90, 220, 110]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(img, x, y, bg)
  const ry = 3 + Math.floor(r() * 4), rx = 15 + Math.floor(r() * 4)
  for (let x = 0; x < w; x++) put(img, x, ry, fg) // full-width 1-px rule
  for (let y = ry + 2; y < h; y++) put(img, rx, y, fg) // 1-px post
  for (let i = 0; i < 9; i++) put(img, 2 + i, 12 + i, fg) // diagonal
  for (let i = -2; i <= 2; i++) { put(img, 8 + i, 9, fg); put(img, 8, 9 + i, fg) } // cross
  for (let i = 0; i < 5; i++) put(img, 1 + 2 * Math.floor(r() * 11), ry + 2 + 2 * Math.floor(r() * 8), fg) // single pixels
  return img
}

/** Sparse sparks on transparency: isolated 1-px sparks plus a few 2-px clusters, no main body. */
function sparks(seed) {
  const r = rng(seed, 'sparks'), w = 32, h = 32, img = canvas(w, h)
  const cols = [[255, 245, 170], [255, 150, 40], [250, 250, 250]]
  for (let i = 0; i < 14; i++) {
    const x = 1 + 2 * Math.floor(r() * 15), y = 1 + 2 * Math.floor(r() * 15), c = cols[i % 3]
    put(img, x, y, c)
    if (i % 5 === 0) put(img, x + 1, y, c) // 2-px cluster
  }
  return img
}

/** UI frame on transparency: 1-px outline with true right angles, panel fill, 1-px inner rule, 2x2 badge. */
function uiFrame(seed) {
  const r = rng(seed, 'ui'), w = 29, h = 21, img = canvas(w, h)
  const line = [28, 24, 40], fill = pick(r), rule = shade(fill, 1.4), badge = [230, 50, 50]
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 4; x++) put(img, x, y, x === 1 || y === 1 || x === w - 5 || y === h - 2 ? line : fill)
  const ry = 6 + Math.floor(r() * 4)
  for (let x = 3; x < w - 6; x++) put(img, x, ry, rule)
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(img, w - 3 + dx, dy, badge)
  return img
}

export const TRAPS = ['proc-1bit', 'proc-sparks', 'proc-ui'] // committed cleanup-trap sprites
export const SHOWCASE_TRAPS = ['onebit-td', 'sparks', 'ui-ring'] // local-only equivalents

export function proceduralSprites(seed = 1) {
  return [['proc-blob', blob, 'character'], ['proc-tile', tile, 'opaque-tile'], ['proc-icon', icon, 'icon'],
    ['proc-1bit', onebit, '1-bit'], ['proc-sparks', sparks, 'vfx-sparse'], ['proc-ui', uiFrame, 'ui']]
    .map(([id, f, category]) => ({ id, category, img: normalizeGT(f(seed)), family: `procedural:${id}` }))
}

// ---- Case matrices (shared by regression.test.js and scripts/update-baseline.mjs) ----

// Explicit engine options (REVISION-PLAN API). Full-canvas cases stretch to the truth cell counts;
// the subject case trims to alpha bounds after background removal. cleanup: true = the Clean profile.
export const CANVAS_OPTS = { trim: false, fit: 'stretch', route: 'auto', cleanup: false, background: 'auto', colors: 'auto' }
export const TRIM_OPTS = { ...CANVAS_OPTS, trim: true, fit: 'contain' }
export const NO_GRID_OPTS = { ...CANVAS_OPTS, background: false }

// Seed-free smooth-upscale presets (stratum I): appended after the seeded cases so existing case seeds stay put.
export const SMOOTH_PRESETS = ['bilinear-x8', 'bilinear-x8.37', 'bicubic-x8-clean']
// Committed smooth upscales: procedural cases that failed before the second-difference fallback, except
// proc-blob/bicubic-x8-clean (a non-regression guard: it passed before too); proc-ui/bilinear-x8 and
// proc-blob/bilinear-x8.37 failed before d2 could replace a first-difference 'grid' lattice.
export const SMOOTH_FIXTURES = [['proc-blob', 'bilinear-x8'], ['proc-blob', 'bicubic-x8-clean'], ['proc-tile', 'bilinear-x8'], ['proc-tile', 'bilinear-x8.37'], ['proc-1bit', 'bilinear-x8.37'],
  ['proc-ui', 'bilinear-x8'], ['proc-blob', 'bilinear-x8.37']]

/**
 * Synthetic cases: every preset per sprite (`fewPresets` ids: 3 presets, runtime), clean k=4/16, cleanup variants for traps,
 * subject trim, then the smooth presets (`smooth`: [spriteId, preset] pairs to keep; default every non-`fewPresets` sprite).
 */
export function matrixCases(sprites, { fewPresets = [], seedBase = 1, smooth = null } = {}) {
  const cases = []
  let seed = seedBase
  for (const s of sprites) {
    const add = (preset, params, opts, group = preset, tag = group) =>
      cases.push({ id: `${s.id}/${tag}`, group, preset, stratum: PRESET_STRATUM[preset] ?? 'M', family: s.family, spriteId: s.id, sprite: s.img, params, opts, seed: seed++ })
    const presets = fewPresets.includes(s.id) ? ['clean-nn-integer', 'nonint-nn', 'gpt-image-like'] : Object.keys(PRESETS).filter((p) => !SMOOTH_PRESETS.includes(p))
    for (const p of presets) add(p, PRESETS[p], CANVAS_OPTS)
    for (const k of [4, 16]) add('clean-nn-integer', { ...PRESETS['clean-nn-integer'], cellSize: k }, CANVAS_OPTS, 'clean-nn-integer', `clean-k${k}`)
    if ([...TRAPS, ...SHOWCASE_TRAPS].includes(s.id)) for (const p of ['clean-nn-integer', 'nonint-nn']) add(p, PRESETS[p], { ...CANVAS_OPTS, cleanup: true }, `${p}+cleanup`)
    if (s.img.data.some((v, i) => i % 4 === 3 && v === 0)) // sprite centred on a big background, target = sprite bbox
      add('gpt-image-like', { ...PRESETS['gpt-image-like'], marginFrac: 0.3 }, TRIM_OPTS, 'trim-subject')
  }
  for (const s of sprites) for (const p of SMOOTH_PRESETS) {
    if (smooth ? !smooth.some(([id, q]) => id === s.id && q === p) : fewPresets.includes(s.id)) continue
    cases.push({ id: `${s.id}/${p}`, group: p, preset: p, stratum: PRESET_STRATUM[p], family: s.family, spriteId: s.id, sprite: s.img, params: PRESETS[p], opts: CANVAS_OPTS, seed: seedBase })
  }
  return cases
}

/** True no-grid scenes (false-grid check): every NO_GRID kind x seeds. */
export const noGridCases = (seeds = [1, 2, 3]) => Object.keys(NO_GRID).flatMap((kind) => seeds.map((seed) =>
  ({ id: `no-grid-${kind}/s${seed}`, group: `no-grid/${kind}`, scene: kind, seed, stratum: NO_GRID[kind], family: `procedural:no-grid-${kind}`, opts: NO_GRID_OPTS })))

/** Crop to the opaque bounding box (the expected output of a subject-fit conversion). */
export function bboxCrop(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] < 128) continue
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return x1 < 0 ? img : crop(img, x0, y0, x1 + 1, y1 + 1)
}

// Private real AI pseudo-pixel samples (gitignored, local-only, §3.4). `want` = len / this review's
// no-reference autocorrelation pitch estimate (§1.1), in-sample acceptance counts (±2%); null = Case B
// control (expects grid class 'none'). `reference` is a PixelLab output: a non-protocol local reference,
// never ground truth and not a competitor capture (methodology §7.1, §12); no comparative claim.
export const REAL_SAMPLES = [
  { id: 'gpt-oni', rel: '.local/samples/gpt-oni.png', want: [1254 / 9.96, 1254 / 10.74] },
  { id: 'gemini-mage', rel: '.local/samples/gemini-mage.png', want: [2048 / 14.01, 2048 / 14.27] },
  { id: 'gpt-forest', rel: '.local/samples/gpt-forest.png', want: [1672 / 6.69, 941 / 6.58] },
  { id: 'unk-dungeon', rel: '.local/samples/unk-dungeon.png', want: [1280 / 5.31, 960 / 5.4], reference: '.local/samples/unk-dungeon-ref.png' },
  { id: 'unk-coat', rel: '.local/samples/unk-coat.png', want: [934 / 15.27, 934 / 14.54] },
  { id: 'ai-wizard', rel: '.local/samples/ai-wizard.png', want: null },
]

// Ratchet baselines. Committed: procedural cases only. Showcase: local-only, gitignored.
// Rewritten only by `node scripts/update-baseline.mjs` (methodology §15.2), never by a test.
export const BASELINE_PATH = fileURLToPath(new URL('./baseline.json', import.meta.url))
export const SHOWCASE_BASELINE_PATH = repoPath('.local/baselines/showcase.json')
export const SHOWCASE_PICKS = ['pip', 'potion', 'mz-front', 'mc-tile16', ...SHOWCASE_TRAPS]
export const committedCases = () => [...matrixCases(proceduralSprites(1), { smooth: SMOOTH_FIXTURES }), ...noGridCases()]
export const showcaseCases = () => matrixCases(showcaseSprites().filter((s) => SHOWCASE_PICKS.includes(s.id)), { fewPresets: SHOWCASE_TRAPS })
