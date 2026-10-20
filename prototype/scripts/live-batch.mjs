// Live AI-image batch (docs/planning/testing-todo.md §3 as one command): converts every PNG/JPEG in the
// gitignored .local/live/ at its suggested size and a standard target list, in two option sets
// ("default" = engine defaults; "sprite" = background auto + Trim), scores every candidate with
// score.mjs, checks the recommended candidate is byte-identical on a repeat run, and writes outputs,
// one contact sheet per image and a pre-filled results log to .local/live-out/. The human only scores.
// Usage: node scripts/live-batch.mjs [--in DIR] [--out DIR] [--sizes 64x64,48x48,32x32,16x16] [--modes default,sprite]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { decodeImage, encodePng } from '../src/lib/decode.js'
import { analyze, convertCandidates } from '../src/lib/core/pipeline.js'
import { canonicalHash } from '../src/lib/core/canonical.js'
import { scoreImage } from './score.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const IN = arg('in', ROOT + '.local/live/'), OUT = arg('out', ROOT + '.local/live-out/')
const SIZES = arg('sizes', '64x64,48x48,32x32,16x16').split(',').map((s) => s.split('x').map(Number))
const MODES = { default: {}, sprite: { background: 'auto', trim: true } }
const modes = arg('modes', 'default,sprite').split(',').filter((m) => MODES[m])

if (!existsSync(IN)) { console.error(`No input folder ${IN}. Put live AI images there (opaque names like live-001.png).`); process.exit(2) }
const files = readdirSync(IN).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort()
if (!files.length) { console.error(`No PNG/JPEG files in ${IN}.`); process.exit(2) }
mkdirSync(OUT, { recursive: true })

const CELL = 160, PAD = 6
function sheet(rows) { // rows of RGBA images, NN-scaled into CELL boxes over a grey checker
  const cols = Math.max(...rows.map((r) => r.length)), W = cols * (CELL + PAD), H = rows.length * (CELL + PAD)
  const s = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, v = ((x >> 3) + (y >> 3)) & 1 ? 70 : 90; s.data.set([v, v, v + 10, 255], o) }
  rows.forEach((row, ry) => row.forEach((im, cx) => {
    const z = Math.max(1, Math.floor(CELL / Math.max(im.width, im.height)))
    for (let y = 0; y < Math.min(CELL, im.height * z); y++) for (let x = 0; x < Math.min(CELL, im.width * z); x++) {
      const p = (((y / z) | 0) * im.width + ((x / z) | 0)) * 4
      if (im.data[p + 3] >= 128) s.data.set(im.data.subarray(p, p + 3), ((ry * (CELL + PAD) + y) * W + cx * (CELL + PAD) + x) * 4)
    }
  }))
  return s
}

const log = ['| ID | Generator | Category | Source size | Suggested size | Target | Mode | Candidate | Recommended | Auto flags | Hard fail | Silhouette | Outline | Clean | Lines | Shading | Palette | Readable | Faithful | Pass | Notes |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
for (const f of files) {
  const id = f.replace(/\.[^.]+$/, ''), bytes = new Uint8Array(readFileSync(IN + f))
  let d
  try { d = await decodeImage(bytes) } catch (e) { console.log(`${id}: decode failed: ${e.message}`); continue }
  const io = { format: d.format, decode: d.decode, strict: d.strict, orientation: d.orientation, warnings: d.warnings }
  const a = analyze(d.img, io, bytes)
  const gen = a.generator?.family ?? 'unknown'
  const sizes = [...(a.suggestedSize ? [a.suggestedSize] : []), ...SIZES]
  console.log(`${id}: ${d.img.width}x${d.img.height} ${d.format}, grid ${a.grid.class} (conf ${a.grid.confidence?.toFixed?.(2)}), suggested ${a.suggestedSize?.join('x') ?? 'none'}, generator ${gen}`)
  mkdirSync(OUT + id, { recursive: true })
  const rows = [[d.img.width > 640 || d.img.height > 640 ? null : d.img].filter(Boolean)]
  for (const mode of modes) for (const [w, h] of sizes) {
    let r
    try { r = convertCandidates(d.img, { targetW: w, targetH: h, ...io, ...MODES[mode] }, bytes) } catch (e) { console.log(`  ${w}x${h} ${mode}: ${e.code ?? 'error'} ${e.message}`); continue }
    const row = []
    for (const c of r.candidates) {
      const s = scoreImage(c.image, { targetW: w, targetH: h })
      const name = `${id}-${w}x${h}-${mode}-${c.id}${c.id === r.recommended ? '-rec' : ''}`
      writeFileSync(`${OUT}${id}/${name}.png`, encodePng(c.image))
      row.push(c.image)
      log.push(`| ${id} | ${gen} |  | ${d.img.width}×${d.img.height} | ${a.suggestedSize?.join('×') ?? '–'} | ${w}×${h} | ${mode} | ${c.id} | ${c.id === r.recommended ? 'yes' : ''} | ${s.flags.join('; ') || '–'} |  |  |  |  |  |  |  |  |  |  |  |`)
    }
    for (const fl of r.failed ?? []) log.push(`| ${id} | ${gen} |  | ${d.img.width}×${d.img.height} | ${a.suggestedSize?.join('×') ?? '–'} | ${w}×${h} | ${mode} | ${fl.id} |  | FAILED ${fl.code} | yes |  |  |  |  |  |  |  |  |  |  |`)
    // Determinism hard check: the recommended candidate must be byte-identical on a repeat run.
    const rec = r.candidates.find((c) => c.id === r.recommended)
    if (rec) {
      const again = convertCandidates(d.img, { targetW: w, targetH: h, ...io, ...MODES[mode] }, bytes).candidates.find((c) => c.id === r.recommended)
      const [h1, h2] = [await canonicalHash(rec.image), await canonicalHash(again.image)]
      if (h1 !== h2) console.log(`  ! ${w}x${h} ${mode}: NON-DETERMINISTIC recommended output`)
    }
    rows.push(row)
    console.log(`  ${w}x${h} ${mode}: ${r.candidates.map((c) => c.id + (c.id === r.recommended ? '*' : '')).join(' ')}`)
  }
  writeFileSync(`${OUT}${id}/sheet-${id}.png`, encodePng(sheet(rows.filter((r) => r.length))))
}
writeFileSync(OUT + 'results-log.md', `# Live batch results (fill the empty columns; rubric in docs/planning/testing-todo.md)\n\nRows per image: source thumbnail (if ≤ 640 px) then one row per target and mode; candidates left to right.\n\n${log.join('\n')}\n`)
console.log(`\nWrote outputs, contact sheets and results-log.md to ${OUT}`)
