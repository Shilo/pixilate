// Exploratory benchmark (development split, in-sample; methodology §6.2 research use, not a gate):
// procedural + local-only sprites x presets x seeds (fixtures.js matrixCases), true no-grid scenes,
// candidate sets (recommended vs best), area/nearest baselines, and the private local AI samples when
// present. Writes results.json, per-case PNGs and index.html to the gitignored
// <repo>/.local/pixel-downscaler-bench/. Usage: npm run bench [-- --seeds 3 --filter gpt]
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resample, SYNTH_VERSION } from '../test/synth.js'
import { proceduralSprites, showcaseSprites, localSprites, matrixCases, noGridCases, readPng, writePng, repoPath, REPO_ROOT, REAL_SAMPLES, CANVAS_OPTS } from '../test/fixtures.js'
import { runCase, runScene, scoreCase, intrinsic, median, pct, g1, g2, g3, g5, g7, indexImage } from '../test/metrics.js'
import { analyze, convert, convertCandidates } from '../src/lib/core/pipeline.ts'
import { canonicalHash } from '../src/lib/core/canonical.ts'

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt }
const SEEDS = Number(arg('seeds', 3)), FILTER = arg('filter', '')
const OUT = REPO_ROOT + '.local/pixel-downscaler-bench/'
const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT + 'cases', { recursive: true })

const nnUp = (img, k) => {
  const w = img.width * k, h = img.height * k, d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(img.data.subarray(((((y / k) | 0) * img.width) + ((x / k) | 0)) * 4, ((((y / k) | 0) * img.width) + ((x / k) | 0)) * 4 + 4), (y * w + x) * 4)
  return { width: w, height: h, data: d }
}
const thumb = (img, max = 320) => {
  const f = Math.min(1, max / Math.max(img.width, img.height))
  if (f === 1) return img
  const w = Math.max(1, Math.round(img.width * f)), h = Math.max(1, Math.round(img.height * f))
  return { width: w, height: h, data: Uint8ClampedArray.from(resample(Float32Array.from(img.data), img.width, img.height, w, h, 4, 'bilinear')) }
}
const zoom = (img) => Math.max(1, Math.floor(256 / Math.max(img.width, img.height)))
const slug = (s) => s.replace(/[^a-z0-9-]+/gi, '_')

// ---- baselines (independent of the engine): exact area average and centre-sample nearest, Binary(128) alpha ----
function area(img, tw, th) {
  const { width: W, height: H, data: d } = img, out = new Uint8ClampedArray(tw * th * 4), sx = W / tw, sy = H / th
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const x0 = tx * sx, x1 = x0 + sx, y0 = ty * sy, y1 = y0 + sy
    let r = 0, g = 0, b = 0, a = 0, ws = 0
    for (let y = Math.floor(y0); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.floor(x0); x < Math.min(W, Math.ceil(x1)); x++) {
      const w = (Math.min(y + 1, y1) - Math.max(y, y0)) * (Math.min(x + 1, x1) - Math.max(x, x0)), o = (y * W + x) * 4, al = (d[o + 3] / 255) * w
      r += d[o] * al; g += d[o + 1] * al; b += d[o + 2] * al; a += al; ws += w
    }
    const o = (ty * tw + tx) * 4
    if (a >= 0.5 * ws) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = 255 }
  }
  return { width: tw, height: th, data: out }
}
function nearest(img, tw, th) {
  const out = new Uint8ClampedArray(tw * th * 4)
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const s = (Math.floor(((ty + 0.5) * img.height) / th) * img.width + Math.floor(((tx + 0.5) * img.width) / tw)) * 4, o = (ty * tw + tx) * 4
    if (img.data[s + 3] >= 128) { out.set(img.data.subarray(s, s + 3), o); out[o + 3] = 255 }
  }
  return { width: tw, height: th, data: out }
}

const r4 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(4) : null)
const pick = (s) => ({ emSnapRec: r4(s.emSnapRec), emSnap: r4(s.emSnap), f1T1: r4(s.f1T1), iou: r4(s.iou), deMean: r4(s.deMean) })
// Ranking/headline score: emSnap on recoverable cells (stratum M truth has no single pixel for ambiguous cells);
// trim cases have no ambiguity mask, so they fall back to emSnap.
const score = (s) => s?.emSnapRec ?? s?.emSnap ?? null
const SCORE_DEF = 'emSnapRec (snapped exact match on recoverable cells); emSnap for trim cases'

// ---- synthetic matrix + no-grid scenes ----
const sprites = [...proceduralSprites(1), ...showcaseSprites(), ...localSprites()]
const cases = []
for (let k = 0; k < SEEDS; k++) cases.push(...matrixCases(sprites, { seedBase: 1000 + 10000 * k, extra: true }).map((c) => ({ ...c, id: `${c.id}/s${k}` })))
cases.push(...noGridCases(Array.from({ length: SEEDS }, (_, k) => k + 1)))
const todo = cases.filter((c) => c.id.includes(FILTER))
const recs = []
const t0 = performance.now()
for (const [i, c] of todo.entries()) {
  const scene = c.scene !== undefined
  const r = (scene ? runScene : runCase)(convert, { ...c, repeat: false })
  const rec = { ...r.rec, extra: c.extra ?? false, group: c.group, preset: c.preset ?? null, stratum: c.stratum, family: c.family, spriteId: c.spriteId ?? null, seed: c.seed }
  rec.inputSha256 = await canonicalHash(r.img)
  rec.outputSha256 = r.out ? await canonicalHash(r.out) : null
  if (!rec.error) {
    try {
      const cs = convertCandidates(r.img, r.opts)
      rec.recommended = cs.recommended
      rec.candidates = []
      for (const k of cs.candidates) {
        const s = scene ? {} : pick(scoreCase(k.image, r.T, { report: k.report, truth: c.opts.trim ? null : r.truth, input: r.img, targetW: r.T.width, targetH: r.T.height }))
        rec.candidates.push({ id: k.id, ...s, sha256: await canonicalHash(k.image) })
      }
      // grid-route recommendation (class 'none' yields only raster candidates; a deduped smooth may surface as 'clean')
      if (scene) rec.falseGridRec = rec.class !== 'none' && rec.recommended !== 'smooth' ? 1 : 0
      else {
        const best = rec.candidates.reduce((a, b) => ((score(b) ?? -1) > (score(a) ?? -1) ? b : a))
        rec.recScore = score(rec.candidates.find((k) => k.id === rec.recommended))
        rec.bestScore = score(best)
        rec.bestCandidate = best.id
        rec.recIsBest = rec.recScore === rec.bestScore ? 1 : 0
      }
    } catch (e) { rec.candidatesError = String(e?.stack || e) }
  }
  // Baselines only where the input has no baked-in background (they do no background removal): opaque scenes and keep-alpha.
  if (!scene && !rec.error && !c.opts.trim && (r.truth.opaque || r.truth.params.bgMode === 'keep-alpha')) {
    rec.baselines = {}
    for (const [name, f] of [['area', area], ['nearest', nearest]]) rec.baselines[name] = pick(scoreCase(f(r.img, r.T.width, r.T.height), r.T, { truth: r.truth }))
  }
  const base = `cases/${slug(c.id)}`
  writePng(OUT + base + '-in.png', thumb(r.img))
  if (r.T) writePng(OUT + base + '-truth.png', nnUp(r.T, zoom(r.T)))
  if (r.out) writePng(OUT + base + '-out.png', nnUp(r.out, zoom(r.out)))
  rec.files = base
  recs.push(rec)
  if (i % 25 === 0) process.stdout.write(`\r${i + 1}/${todo.length} cases`)
}
console.log(`\r${todo.length} cases in ${((performance.now() - t0) / 1000).toFixed(1)} s`)

// ---- private real samples (local-only, in-sample; no pixels leave .local/) ----
const real = []
for (const s of REAL_SAMPLES) {
  if (!existsSync(repoPath(s.rel))) { console.log(`[real] ${s.id}: absent, skipped`); continue }
  const img = readPng(repoPath(s.rel)), bytes = new Uint8Array(readFileSync(repoPath(s.rel)))
  const t = performance.now()
  let res, error = null
  try { // W x H is required: analyze without a target, then convert at the suggested size (64 px wide when none)
    const sz = analyze(img, {}, bytes).suggestedSize ?? [64, Math.max(1, Math.round((64 * img.height) / img.width))]
    res = convert(img, { ...CANVAS_OPTS, targetW: sz[0], targetH: sz[1] }, bytes)
  } catch (e) { error = String(e) }
  const ms = performance.now() - t
  const g = res?.report?.grid
  const rec = { id: s.id, size: [img.width, img.height], ms, error, class: g?.class, confidence: g?.confidence, suggestedSize: g?.suggestedSize, period: g?.period, path: res?.report?.path, want: s.want?.map((v) => Number(v.toFixed(1))) }
  if (s.want && g?.suggestedSize) rec.nErrPct = g.suggestedSize.map((n, k) => Number(((100 * (n - s.want[k])) / s.want[k]).toFixed(2)))
  rec.inputSha256 = await canonicalHash(img)
  if (res) {
    const q = intrinsic(res.image)
    Object.assign(rec, { out: [res.image.width, res.image.height], outputSha256: await canonicalHash(res.image), colors: q.kOut, orphansNoise: q.orphansNoise, noiseRate: r4(q.noiseRate), doubleRate: r4(q.doubleRate), hidden2: r4(q.hidden2), dupRatio: r4(q.dupRatio) })
    writePng(OUT + `real-${s.id}-out.png`, nnUp(res.image, zoom(res.image)))
  }
  writePng(OUT + `real-${s.id}-in.png`, thumb(img, 512))
  if (s.reference && existsSync(repoPath(s.reference)) && res) {
    const ref = readPng(repoPath(s.reference))
    rec.localReference = { label: 'non-protocol local reference (PixelLab output): not ground truth, not a §12 capture, no comparative claim', size: [ref.width, ref.height] }
    try {
      const o = convert(img, { ...CANVAS_OPTS, targetW: ref.width, targetH: ref.height }, bytes).image
      const p = g3(indexImage(o), indexImage(ref))
      Object.assign(rec.localReference, g1(o, ref), g2(o, ref), { palPrecision: p.palPrecision, palRecall: p.palRecall, kOut: p.kOut, kRef: p.kGT }, g5(o, ref), g7(o, ref))
      writePng(OUT + `real-${s.id}-at-ref.png`, nnUp(o, 2)); writePng(OUT + `real-${s.id}-ref.png`, nnUp(ref, 2))
    } catch (e) { rec.localReference.error = String(e) }
  }
  real.push(rec)
}

// ---- summary: n, base families, median and p10 (no CIs; cases within a family are not independent) ----
const num = (rs, f) => rs.map(f).filter((v) => typeof v === 'number' && Number.isFinite(v))
const med = (rs, f) => r4(median(num(rs, f)))
const p10 = (rs, f) => r4(pct(num(rs, f), 0.1))
const rate = (rs, f) => { const v = num(rs, f); return v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null }
const block = (rs) => {
  const b = rs.filter((r) => r.baselines)
  return {
    n: rs.length, families: new Set(rs.map((r) => r.family)).size, errors: rs.filter((r) => r.error || r.candidatesError).length,
    emSnapRec: med(rs, (r) => r.emSnapRec), 'emSnapRec p10': p10(rs, (r) => r.emSnapRec), emSnap: med(rs, (r) => r.emSnap), 'emSnap p10': p10(rs, (r) => r.emSnap),
    recommended: med(rs, (r) => r.recScore), best: med(rs, (r) => r.bestScore), 'rec=best': rate(rs, (r) => r.recIsBest),
    nBase: b.length, 'engine@base': med(b, score), area: med(b, (r) => score(r.baselines.area)), nearest: med(b, (r) => score(r.baselines.nearest)),
  }
}
const by = (rs, key) => Object.fromEntries([...new Set(rs.map((r) => r[key]))].map((g) => [g, rs.filter((r) => r[key] === g)]))
// extra (gradient-backdrop, soft-alpha) groups are reported apart so strata and the headline stay comparable
const all = recs.filter((r) => !r.group.startsWith('no-grid/')), syn = all.filter((r) => !r.extra), ext = all.filter((r) => r.extra), ng = recs.filter((r) => r.group.startsWith('no-grid/'))
const groups = Object.fromEntries(Object.entries(by(all, 'group')).map(([g, rs]) => [g, block(rs)]))
const extraGroups = Object.fromEntries(Object.entries(by(ext, 'group')).map(([g, rs]) => [g, block(rs)]))
const strata = Object.fromEntries(Object.entries(by(syn, 'stratum')).map(([g, rs]) => [g, block(rs)]))
const noGrid = Object.fromEntries(Object.entries(by(ng, 'group')).map(([g, rs]) => [g, { n: rs.length, stratum: rs[0].stratum, falseGrid: rate(rs, (r) => r.falseGrid), falseGridRec: rate(rs, (r) => r.falseGridRec), classes: Object.entries(by(rs, 'class')).map(([k, v]) => `${k}:${v.length}`).join(' ') }]))
const headline = { scoreDefinition: SCORE_DEF, synthetic: block(syn), falseGridRate: rate(ng, (r) => r.falseGrid), falseGridRecRate: rate(ng, (r) => r.falseGridRec), nNoGrid: ng.length }
console.log(`\nScore = ${SCORE_DEF}. Development split, in-sample, exploratory. Groups:`)
console.table(groups)
console.log('By primary stratum (extra groups excluded):')
console.table(strata)
if (ext.length) { console.log('Extra groups (gradient backdrops, soft alpha A):'); console.table(extraGroups) }
console.log("No-grid scenes (falseGrid = grid class != 'none'; falseGridRec = a grid-route candidate is recommended):")
console.table(noGrid)
console.log('Headline:', JSON.stringify(headline))
if (real.length) console.table(Object.fromEntries(real.map((r) => [r.id, { class: r.class, conf: r.confidence?.toFixed?.(2), suggested: String(r.suggestedSize), want: String(r.want ?? 'none'), 'nErr%': String(r.nErrPct ?? ''), out: String(r.out), colors: r.colors, noise: r.orphansNoise, ms: Math.round(r.ms), err: r.error ?? '' }])))
for (const r of real) if (r.localReference) console.log(`[real] ${r.id}: ${r.localReference.label}, size ${r.localReference.size}`)
const worst = syn.filter((r) => !r.error).sort((a, b) => (score(a) ?? 0) - (score(b) ?? 0)).slice(0, 12)
console.log('\nWorst cases (score):')
for (const r of worst) console.log(`  ${r.id.padEnd(42)} score=${(score(r) ?? 0).toFixed(3)} f1=${r.f1T1?.toFixed(3)} scale=${r.scaleErr?.toFixed(4)} native=${r.nativeErrX},${r.nativeErrY} class=${r.class} path=${r.path}`)
const errs = recs.filter((r) => r.error || r.candidatesError)
if (errs.length) console.log(`\n${errs.length} errors, first: ${errs[0].id}: ${(errs[0].error ?? errs[0].candidatesError).split('\n')[0]}`)

writeFileSync(OUT + 'results.json', JSON.stringify({
  date: new Date().toISOString(), commit: git('rev-parse HEAD'), dirty: Boolean(git('status --porcelain')), node: process.version, synthVersion: SYNTH_VERSION,
  hash: 'pixilate/canonical-rgba/v1 SHA-256', evidence: 'exploratory, development split, in-sample; local-only fixtures are not corpus-admitted',
  seeds: SEEDS, filter: FILTER, headline, groups, strata, extraGroups, noGrid, real, cases: recs,
}, null, 1))

// ---- contact sheet ----
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : v ?? '-')
let html = `<!doctype html><meta charset="utf-8"><title>Pixel downscaler bench</title><style>
body{font:13px system-ui;background:#1d1f24;color:#ddd;margin:16px}img{image-rendering:pixelated;background:repeating-conic-gradient(#555 0 25%,#777 0 50%) 0 0/16px 16px;max-width:100%}
.row{display:flex;gap:12px;align-items:flex-start;margin:8px 0;padding:8px;background:#272a31;flex-wrap:wrap}.row div{max-width:340px}h2{margin-top:32px}.bad{outline:2px solid #e55}code{color:#9cf}</style>
<h1>Pixel downscaler bench (exploratory, local-only)</h1><p>${todo.length} cases, ${SEEDS} seed(s). Columns: input (thumbnail), output (NN zoom), truth (NN zoom). Score: ${esc(SCORE_DEF)}.</p>`
html += '<h2>Private real samples</h2>'
for (const r of real) html += `<div class="row"><div><img src="real-${r.id}-in.png"></div>${r.out ? `<div><img src="real-${r.id}-out.png"></div>` : ''}${r.localReference && !r.localReference.error ? `<div><img src="real-${r.id}-at-ref.png"><br>ours @ reference size</div><div><img src="real-${r.id}-ref.png"><br>local reference (non-protocol)</div>` : ''}<div><b>${esc(r.id)}</b><br>${esc(JSON.stringify(r))}</div></div>`
for (const g of [...Object.keys(groups), ...Object.keys(noGrid)]) {
  html += `<h2>${esc(g)}</h2><p><code>${esc(JSON.stringify(groups[g] ?? noGrid[g]))}</code></p>`
  for (const r of recs.filter((x) => x.group === g)) {
    const bad = r.error || r.falseGrid || (score(r) ?? 1) < 0.9
    html += `<div class="row${bad ? ' bad' : ''}"><div><img src="${r.files}-in.png"></div><div><img src="${r.files}-out.png" alt="no output"></div>${r.falseGrid === undefined ? `<div><img src="${r.files}-truth.png"></div>` : ''}<div><b>${esc(r.id)}</b> [${esc(r.stratum)}]<br>emRec ${fmt(r.emSnapRec)} · em ${fmt(r.emSnap)} · dE ${fmt(r.deMean)} · F1 ${fmt(r.f1T1)} · IoU ${fmt(r.iou)} · G8 ${fmt(r.g8Recall)}<br>rec ${esc(r.recommended)} ${fmt(r.recScore)} · best ${esc(r.bestCandidate)} ${fmt(r.bestScore)}${r.baselines ? ` · area ${fmt(score(r.baselines.area))} · nn ${fmt(score(r.baselines.nearest))}` : ''}<br>${esc(r.class)} / ${esc(r.path)} · ${Math.round(r.ms)} ms${r.error ? `<br>${esc(r.error.split('\n')[0])}` : ''}</div></div>`
  }
}
writeFileSync(OUT + 'index.html', html)
console.log(`\nWrote ${OUT.slice(REPO_ROOT.length)}index.html and results.json`)
