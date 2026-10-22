// Exploratory competitor comparison (development split, in-sample; methodology §12, not a gate or a claim):
// the prototype (recommended candidate and oracle best-of-candidates) against clean-room reference
// re-implementations of competing tools (test/reference-tools.js: each is "a reference re-implementation of
// <tool> <rev> per spike §…, not the tool itself") and the area/nearest baselines, on the bench matrix
// (test/fixtures.js matrixCases incl. smooth presets; strata G/I/M/B), the no-grid scenes and the private
// local samples (opaque IDs only). Two modes (§12.3):
//   native: each discovered-size tool at its own detected size; scored only when that size equals truth
//           (size-correct rate reported separately; the prototype's native size is the suggestedSize of a
//           blind analyze(img) with no target prior, like the references);
//   target: every method at the truth W x H; a discovered-size tool's output is centre-sample resized to the
//           target and labelled "adapted" (adapter, never the tool's own target support).
// Metrics: em = emSnapRec (snapped exact match on recoverable cells, alpha included; only on cases with no
// baked-in background, since no reference removes backgrounds); emIn = the same with the truth alpha mask
// imposed on the output (colour + placement inside the silhouette; background removal not scored, so ours is
// scored on the background-off run of the SAME candidate id, deduped ids resolved through its alias map, since
// over-removal would count and missed background would not; ours' emIn is that of the on-run recommended id,
// and the two runs can recommend different ids in a few cases), on all
// cases. Trim-subject and +cleanup cases are skipped (no reference can trim; cleanup changes only ours).
// emIn masks first, then applies a common cap (a baked-in background must not take a k-means cluster); ours
// also reports emInOn, the same score on the default background-on run.
// Palette modes (round 3): `native` = every method at its own documented palette cap (Pixel Snapper 16, unfake
// 32, breakfastz 16, fast-pixelizer 32/256; ours, area, nearest, PixelOE, pixeldetector, Real-PixelArt,
// proper-pixel-art, PixelRefiner and Retro Diffusion uncapped or auto: Retro Diffusion's structure palette,
// adaptive K in [16, 48], decides placement only and its output colours are uncapped means of source pixels), where emSnap's 0.05 snap tolerance favours
// uncapped outputs on 25-60-colour fixtures; `common cap` = every output (ours and the oracle included) re-
// quantized by ONE shared deterministic quantizer (reference-tools kmeansRGB: k-means++ in RGB, mulberry32(42),
// 15 iterations; skipped when the output already has <= K colours) to K = the truth palette size (`_kT`) and
// to K = 16 (`_k16`), so palette caps stop deciding the ranking. `oursBest` is an ORACLE (truth-selected best
// candidate), not something a user gets.
// Output: gitignored <repo>/.local/compare/ (results.json, index.html, sheets/*.png, real/*.png).
// Usage: node scripts/compare.mjs [--seeds 1] [--filter gpt] [--rows 10] [--engine <src dir>] [--clean]
//          [--shard k/n] [--budget s]   compute missing cases (cached per case in cases/, resumable), then stop
//          --real-only                  private real samples only (real.json + real/*.png)
//          --merge [--no-real]           no-grid scenes, summaries, sheets, results.json and index.html from the cache
// --engine pins "ours" to a copy of an engine tree (e.g. .local/r3/E/head-src from `git archive HEAD`).
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'
import { degrade, noGrid, resample, SYNTH_VERSION } from '../test/synth.js'
import { proceduralSprites, showcaseSprites, localSprites, matrixCases, noGridCases, readPng, writePng, repoPath, REPO_ROOT, REAL_SAMPLES, CANVAS_OPTS } from '../test/fixtures.js'
import { scoreCase, median } from '../test/metrics.js'
import * as R from '../test/reference-tools.js'
import { scoreImage } from './score.mjs'

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt }
const flag = (name) => process.argv.includes(`--${name}`)
const SEEDS = Number(arg('seeds', 1)), FILTER = arg('filter', ''), ROWS = Number(arg('rows', 10)), REAL = !flag('no-real')
const ENGINE = arg('engine', null), [SK, SN] = arg('shard', '0/1').split('/').map(Number), BUDGET = Number(arg('budget', Infinity)) * 1000
const MODE = flag('merge') ? 'merge' : flag('real-only') ? 'real' : 'cases'
const { analyze, convert, convertCandidates } = await import(ENGINE ? pathToFileURL(resolve(ENGINE) + '/lib/core/pipeline.js').href : '../src/lib/core/pipeline.js')
const OUT = REPO_ROOT + '.local/compare/'
if (flag('clean')) rmSync(OUT, { recursive: true, force: true })
for (const d of ['sheets', 'real', 'cases', 'strips']) mkdirSync(OUT + d, { recursive: true })

const NATIVE = [ // discovered-size references
  ['snapper', 'Pixel Snapper ref ae20461f', R.pixelSnapper],
  ['pixeldetector', 'pixeldetector ref 6267db44', R.pixelDetector],
  ['unfake', 'unfake.js v1.4 ref 66368689', R.unfake],
  ['rd', 'Retro Diffusion Std ref ef376e57 (partial Stage 2)', R.retroDiffusion],
  ['rpa', 'Real-PixelArt auto ref 17ce4875', R.realPixelArt],
  ['ppa', 'proper-pixel-art ref 4de0dda5', R.properPixelArt],
  ['fastpix', 'fast-pixelizer snap ref 5c041fce', R.fastPixelizer],
  ['bfz', 'breakfastz-pixel-truth ref a1a3961c', R.breakfastz],
  ['refiner', 'PixelRefiner phase-aware grid search ref c32659f3', R.pixelRefiner],
]
const TARGET = [ // methods that take W x H
  ['rpaT', 'Real-PixelArt fixed-size (targetAxis) ref 17ce4875', R.realPixelArtTarget],
  ['bfzManual', 'breakfastz manual width = W ref a1a3961c (rows = round(h / cell), centre-sampled to H when they differ)', (img, tw, th) => R.adapt(R.breakfastz(img, { manualWidth: tw }).image, tw, th)],
  ['rdManual', 'Retro Diffusion manual pixel size = w / W ref ef376e57 (rows = round(h / cell), centre-sampled to H when they differ)', (img, tw, th) => R.adapt(R.retroDiffusion(img, { manualStep: img.width / tw }).image, tw, th)],
  ['pixeloe', 'PixelOE contrast ref 7ce444b3', R.pixelOE],
  ['area', 'area baseline', R.area],
  ['nearest', 'nearest baseline', R.nearest],
]
const METHODS = ['ours', 'oursBest', ...NATIVE.map((m) => m[0]), ...TARGET.map((m) => m[0])]
const CAPS = [['', null], ['_kT', 'truth'], ['_k16', 16]] // palette modes: native, common cap K = truth colours, K = 16
const colourCount = (img) => { const s = new Set(); for (let p = 0; p < img.width * img.height; p++) if (img.data[p * 4 + 3] >= 128) s.add((img.data[p * 4] << 16) | (img.data[p * 4 + 1] << 8) | img.data[p * 4 + 2]); return s.size }
const capK = (img, K) => (colourCount(img) <= K ? img : R.quantize(img, K).image) // the one shared quantizer
const r4 = (v) => (typeof v === 'number' && Number.isFinite(v) ? +v.toFixed(4) : null)
const time = (f) => { const t = performance.now(); const v = f(); return [v, performance.now() - t] }

// ---- image helpers for contact sheets ----
const withAlpha = (out, T) => { // impose the truth alpha mask (emIn)
  const d = Uint8ClampedArray.from(out.data)
  for (let p = 0; p < T.width * T.height; p++) d[p * 4 + 3] = T.data[p * 4 + 3] >= 128 ? 255 : 0
  return { width: out.width, height: out.height, data: d }
}
function tile(img, S, smooth = false) { // fit into S x S: integer NN zoom, or downsample (bilinear for inputs, nearest otherwise)
  if (!img) return null
  const m = Math.max(img.width, img.height)
  if (m <= S) { const k = Math.floor(S / m); return R.adapt(img, img.width * k, img.height * k) }
  const w = Math.max(1, Math.round((img.width * S) / m)), h = Math.max(1, Math.round((img.height * S) / m))
  return smooth ? { width: w, height: h, data: Uint8ClampedArray.from(resample(Float32Array.from(img.data), img.width, img.height, w, h, 4, 'bilinear')) } : R.adapt(img, w, h)
}
function strip(tiles, S, marks = []) { // one row: checker under each tile, red frame where marked
  const G = 4, W = tiles.length * (S + G) + G, H = S + 2 * G, d = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) { d[i * 4] = 29; d[i * 4 + 1] = 31; d[i * 4 + 2] = 36; d[i * 4 + 3] = 255 }
  tiles.forEach((t, k) => {
    const x0 = G + k * (S + G)
    if (marks[k]) for (let y = 1; y < H - 1; y++) for (let x = x0 - 3; x < x0 + S + 3; x++) if (y < 3 || y >= H - 3 || x < x0 - 1 || x >= x0 + S + 1) { const o = (y * W + x) * 4; d[o] = 230; d[o + 1] = 60; d[o + 2] = 60 }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const o = ((y + G) * W + x + x0) * 4, ck = ((x >> 3) + (y >> 3)) & 1 ? 119 : 85
      let r = ck, g = ck, b = ck
      if (t && x < t.width && y < t.height) { const s = (y * t.width + x) * 4, a = t.data[s + 3] / 255; r = t.data[s] * a + ck * (1 - a); g = t.data[s + 1] * a + ck * (1 - a); b = t.data[s + 2] * a + ck * (1 - a) }
      d[o] = r; d[o + 1] = g; d[o + 2] = b
    }
  })
  return { width: W, height: H, data: d }
}
const stack = (rows) => {
  const W = Math.max(...rows.map((r) => r.width)), H = rows.reduce((s, r) => s + r.height, 0), d = new Uint8ClampedArray(W * H * 4)
  let y0 = 0
  for (const r of rows) { for (let y = 0; y < r.height; y++) d.set(r.data.subarray(y * r.width * 4, (y + 1) * r.width * 4), ((y0 + y) * W) * 4); y0 += r.height }
  return { width: W, height: H, data: d }
}
const slug = (s) => s.replace(/[^a-z0-9-]+/gi, '_')

// ---- synthetic matrix ----
const sprites = [...proceduralSprites(1), ...showcaseSprites(), ...localSprites()]
let cases = []
for (let k = 0; k < SEEDS; k++) cases.push(...matrixCases(sprites, { seedBase: 1000 + 10000 * k }).map((c) => ({ ...c, id: `${c.id}/s${k}` })))
cases = cases.filter((c) => c.group !== 'trim-subject' && !c.group.endsWith('+cleanup') && c.id.includes(FILTER))
const S = 160, rank = new Map(), seenG = {}
cases.forEach((c, i) => rank.set(i, (seenG[c.group] = (seenG[c.group] ?? -1) + 1)))
const t0 = performance.now()
let done = 0
for (const [i, c] of MODE === 'cases' ? cases.entries() : []) {
  if (i % SN !== SK || existsSync(OUT + `cases/${i}.json`)) continue
  if (performance.now() - t0 > BUDGET) break
  const { img, truth } = degrade(c.sprite, c.params, c.seed), T = truth.sprite, tw = T.width, th = T.height
  const bgFree = truth.opaque || truth.params.bgMode === 'keep-alpha'
  const KT = colourCount(T)
  const score = (out, outIn = out) => {
    const r = {}
    for (const [suf, K] of CAPS) {
      // emIn: impose the truth mask BEFORE the common cap, so a baked-in background cannot take a k-means cluster
      const k = K === 'truth' ? KT : K, capped = (im) => (K ? capK(im, k) : im), emIn = (im) => { const s = scoreCase(capped(withAlpha(im, T)), T, { truth }); return r4(s.emSnapRec ?? s.emSnap) }
      const s = scoreCase(capped(out), T, { truth })
      r[`em${suf}`] = bgFree ? r4(s.emSnapRec ?? s.emSnap) : null; r[`emIn${suf}`] = emIn(outIn)
      if (outIn !== out) r[`emInOn${suf}`] = emIn(out) // ours: the default (background-on) run, for over-removal
      if (!K) Object.assign(r, { de: r4(s.deMean), f1: r4(s.f1T1), iou: r4(s.iou), colours: colourCount(out) })
    }
    return r
  }
  const rec = { id: c.id, group: c.group, preset: c.preset, stratum: c.stratum, family: c.family, spriteId: c.spriteId, bgFree, input: [img.width, img.height], truth: [tw, th], truthColours: KT, m: {} }
  const imgs = {}
  try {
    const [cs, ms] = time(() => convertCandidates(img, { ...CANVAS_OPTS, targetW: tw, targetH: th }))
    // emIn imposes the truth alpha, so background removal could only lose there: score emIn on a background-off run
    const off = convertCandidates(img, { ...CANVAS_OPTS, background: false, targetW: tw, targetH: th })
    const offImage = (k) => { // the same candidate id on the off run (its survivor when deduped)
      const id = off.alias?.[k.id]
      if (id) return off.candidates.find((c) => c.id === id).image
      // no alias (an engine without the map, or the off run failed this id): rerun this candidate's route and cleanup
      return convert(img, { ...CANVAS_OPTS, background: false, targetW: tw, targetH: th, route: k.report.route ?? 'auto', cleanup: k.report.cleanup.profile != null }).image
    }
    const sc = cs.candidates.map((k) => ({ id: k.id, image: k.image, ...score(k.image, offImage(k)) }))
    const recK = sc.find((k) => k.id === cs.recommended), sug = analyze(img, {}).suggestedSize // blind: no target prior
    const bestBy = (key) => sc.reduce((a, b) => ((b[key] ?? -1) > (a[key] ?? -1) ? b : a))
    const sizeExact = Boolean(sug) && sug[0] === tw && sug[1] === th
    rec.m.ours = { ...recK, image: undefined, candidate: recK.id, native: sug ?? null, sizeExact, within1: Boolean(sug) && Math.abs(sug[0] - tw) <= 1 && Math.abs(sug[1] - th) <= 1, ms: r4(ms) }
    const bE = bestBy('emIn')
    rec.m.oursBest = { de: bE.de, f1: bE.f1, iou: bE.iou, candidate: bE.id, native: rec.m.ours.native, sizeExact, within1: rec.m.ours.within1 }
    for (const [suf] of CAPS) { rec.m.oursBest[`em${suf}`] = bestBy(`em${suf}`)[`em${suf}`]; rec.m.oursBest[`emIn${suf}`] = bestBy(`emIn${suf}`)[`emIn${suf}`] }
    imgs.ours = recK.image; imgs.oursBest = bE.image
  } catch (e) { rec.m.ours = { error: String(e?.message || e) } }
  for (const [id, , f] of NATIVE) {
    try {
      const [r, ms] = time(() => f(img)), ad = R.adapt(r.image, tw, th), sizeExact = r.native[0] === tw && r.native[1] === th
      rec.m[id] = { ...score(ad), native: r.native, sizeExact, within1: Math.abs(r.native[0] - tw) <= 1 && Math.abs(r.native[1] - th) <= 1, adapted: !sizeExact, ms: r4(ms) }
      imgs[id] = ad
    } catch (e) { rec.m[id] = { error: String(e?.message || e) } }
  }
  for (const [id, , f] of TARGET) {
    try { const [o, ms] = time(() => f(img, tw, th)); rec.m[id] = { ...score(o), ms: r4(ms) }; imgs[id] = o } catch (e) { rec.m[id] = { error: String(e?.message || e) } }
  }
  if (rank.get(i) < ROWS) writePng(OUT + `strips/${i}.png`, strip([tile(img, S, true), tile(T, S), ...METHODS.map((m) => tile(imgs[m], S))], S, [0, 0, ...METHODS.map((m) => rec.m[m]?.adapted || rec.m[m]?.error)]))
  writeFileSync(OUT + `cases/${i}.json`, JSON.stringify(rec))
  done++
}
const cached = new Set(readdirSync(OUT + 'cases').map((f) => Number(f.replace('.json', ''))))
if (MODE === 'cases') { console.log(`shard ${SK}/${SN}: ${done} new cases in ${((performance.now() - t0) / 1000).toFixed(1)} s; cache ${cached.size}/${cases.length}`); process.exit(0) }
const SHEET_COLS = ['input', 'truth', ...METHODS], recs = [], sheetRows = {}
if (MODE === 'merge') {
  const missing = cases.map((_, i) => i).filter((i) => !cached.has(i))
  if (missing.length) { console.log(`missing ${missing.length} cases: ${missing.slice(0, 20).join(' ')}`); process.exit(1) }
  cases.forEach((c, i) => { recs.push(JSON.parse(readFileSync(OUT + `cases/${i}.json`, 'utf8'))); if (rank.get(i) < ROWS && existsSync(OUT + `strips/${i}.png`)) (sheetRows[c.group] ??= []).push(readPng(OUT + `strips/${i}.png`)) })
  for (const [g, rows] of Object.entries(sheetRows)) writePng(OUT + `sheets/${slug(g)}.png`, stack(rows))
}

// ---- no-grid scenes: does a method assert a lattice where none exists? ----
const scenes = []
for (const c of MODE === 'merge' ? noGridCases(Array.from({ length: SEEDS }, (_, k) => k + 1)) : []) {
  const img = noGrid(c.scene, c.seed), rec = { id: c.id, stratum: c.stratum, input: [img.width, img.height], m: {} }
  try { const a = analyze(img, {}); rec.m.ours = { native: a.suggestedSize, asserted: a.grid.class !== 'none' } } catch (e) { rec.m.ours = { error: String(e) } }
  for (const [id, , f] of NATIVE) { try { const r = f(img); rec.m[id] = { native: r.native, asserted: r.native[0] * 1.5 <= img.width } } catch (e) { rec.m[id] = { error: String(e) } } }
  scenes.push(rec)
}

// ---- summaries ----
const num = (a) => a.filter((v) => typeof v === 'number' && Number.isFinite(v))
const med = (a) => r4(median(num(a)))
const rate = (a) => { const v = a.filter((x) => typeof x === 'boolean'); return v.length ? r4(v.filter(Boolean).length / v.length) : null }
const by = (rs, key) => Object.fromEntries([...new Set(rs.map((r) => r[key]))].map((g) => [g, rs.filter((r) => r[key] === g)]))
const tableTarget = (rs, metric) => Object.fromEntries(Object.entries(rs).map(([g, xs]) => {
  const sub = metric.startsWith('emIn') ? xs : xs.filter((r) => r.bgFree)
  return [g, { n: sub.length, ...Object.fromEntries(METHODS.map((m) => [m, med(sub.map((r) => r.m[m]?.[metric]))])) }]
}))
const NAT = ['ours', ...NATIVE.map((m) => m[0])]
const tableNative = (rs) => Object.fromEntries(Object.entries(rs).map(([g, xs]) => [g, {
  n: xs.length, ...Object.fromEntries(NAT.flatMap((m) => {
    const ok = xs.filter((r) => r.m[m]?.sizeExact)
    return [[`${m} size`, rate(xs.map((r) => r.m[m]?.sizeExact ?? (r.m[m]?.error ? false : undefined)))], [`${m} ±1`, rate(xs.map((r) => r.m[m]?.within1 ?? (r.m[m]?.error ? false : undefined)))], [`${m} emIn|ok`, med(ok.map((r) => r.m[m].emIn))], [`${m} emIn_kT|ok`, med(ok.map((r) => r.m[m].emIn_kT))]]
  })),
}]))
const tableWins = (rs, key = 'emIn') => Object.fromEntries(Object.entries(rs).map(([g, xs]) => [g, Object.fromEntries([...NATIVE, ...TARGET].map(([m]) => {
  const v = xs.filter((r) => typeof r.m[m]?.[key] === 'number' && typeof r.m.ours?.[key] === 'number')
  const win = v.filter((r) => r.m[m][key] > r.m.ours[key] + 0.02).length, loss = v.filter((r) => r.m[m][key] < r.m.ours[key] - 0.02).length
  return [m, `${win}/${loss}/${v.length}`]
}))]))
const strata = by(recs, 'stratum'), presets = by(recs, 'preset')
const all = { all: recs }
const summary = {
  ...Object.fromEntries(CAPS.flatMap(([suf]) => [
    [`targetEmIn${suf}`, { ...tableTarget(all, `emIn${suf}`), ...tableTarget(strata, `emIn${suf}`) }],
    [`targetEm${suf}`, { ...tableTarget(all, `em${suf}`), ...tableTarget(strata, `em${suf}`) }],
    [`presetEmIn${suf}`, tableTarget(presets, `emIn${suf}`)],
    [`winsVsOursRec${suf}`, { ...tableWins(all, `emIn${suf}`), ...tableWins(strata, `emIn${suf}`) }],
    [`presetWins${suf}`, tableWins(presets, `emIn${suf}`)],
  ])),
  native: { ...tableNative(all), ...tableNative(strata) },
  presetNative: tableNative(presets),
  colours: Object.fromEntries(Object.entries({ all: recs, ...strata }).map(([g, xs]) => [g, { truth: med(xs.map((r) => r.truthColours)), ...Object.fromEntries(METHODS.filter((m) => m !== 'oursBest').map((m) => [m, med(xs.map((r) => r.m[m]?.colours))])) }])),
  noGridAsserted: Object.fromEntries(NAT.map((m) => [m, rate(scenes.map((s) => s.m[m]?.asserted))])),
  msMedian: Object.fromEntries(METHODS.map((m) => [m, med(recs.map((r) => r.m[m]?.ms))])),
  errors: Object.fromEntries(METHODS.map((m) => [m, recs.filter((r) => r.m[m]?.error).length])),
}
for (const [suf, K] of CAPS) {
  const mode = K ? `COMMON CAP K = ${K === 'truth' ? 'truth palette size' : K}` : 'NATIVE CAP'
  console.log(`\n[${mode}] Target mode, median emIn${suf} (truth alpha imposed; all cases). Adapted = discovered-size output centre-sampled to the target.`)
  console.table(summary[`targetEmIn${suf}`])
  console.log(`[${mode}] Target mode, median em${suf} (alpha scored; no-baked-background cases only)`)
  console.table(summary[`targetEm${suf}`])
  console.log(`[${mode}] Target mode, median emIn${suf} per preset`)
  console.table(summary[`presetEmIn${suf}`])
  console.log(`[${mode}] Reference beats ours (recommended) by > 0.02 emIn${suf}: wins/losses/n`)
  console.table(summary[`winsVsOursRec${suf}`])
  console.table(summary[`presetWins${suf}`])
}
console.log('Median output colour count (native cap) vs truth')
console.table(summary.colours)
console.log('Native mode: size-exact rate, within-1 rate, median emIn on size-exact cases')
console.table(summary.native)
console.table(summary.presetNative)
console.log('No-grid scenes: lattice asserted rate', summary.noGridAsserted, '\nms median', summary.msMedian, '\nerrors', summary.errors)

// ---- private real samples (local-only; opaque IDs; no ground truth) ----
const real = MODE === 'merge' && REAL ? REAL_SAMPLES.filter((s) => existsSync(OUT + `real/${s.id}.json`)).map((s) => JSON.parse(readFileSync(OUT + `real/${s.id}.json`, 'utf8'))) : []
for (const s of MODE === 'real' ? REAL_SAMPLES.filter((x) => x.id.includes(FILTER)) : []) {
  if (!existsSync(repoPath(s.rel))) { console.log(`[real] ${s.id}: absent, skipped`); continue }
  const img = readPng(repoPath(s.rel)), bytes = new Uint8Array(readFileSync(repoPath(s.rel)))
  const fallback = [64, Math.max(1, Math.round((64 * img.height) / img.width))]
  const [tw, th] = s.want ? s.want.map((v) => Math.round(v)) : fallback
  const rec = { id: s.id, size: [img.width, img.height], want: s.want?.map((v) => +v.toFixed(1)) ?? null, target: [tw, th], native: {}, target_: {} }
  const nat = {}, tgt = {}
  const q = (o, t) => { const r = scoreImage(o, t ? { targetW: tw, targetH: th } : {}); return { size: [o.width, o.height], colours: r.metrics.colours, noise: r.metrics.orphansNoise, hidden2: r4(r.metrics.hidden2), dupRatio: r4(r.metrics.dupRatio), flags: r.flags.length } }
  try {
    const sug = analyze(img, {}, bytes).suggestedSize ?? fallback
    const [o, ms] = time(() => convert(img, { ...CANVAS_OPTS, targetW: sug[0], targetH: sug[1] }, bytes).image)
    nat.ours = o; rec.native.ours = { ...q(o), ms: Math.round(ms) }
    const cs = convertCandidates(img, { ...CANVAS_OPTS, targetW: tw, targetH: th }, bytes)
    for (const k of cs.candidates) { const id = k.id === cs.recommended ? 'ours' : `ours-${k.id}`; tgt[id] = k.image; rec.target_[id] = q(k.image, true) }
    rec.recommended = cs.recommended
  } catch (e) { rec.native.ours = { error: String(e?.message || e) } }
  for (const [id, , f] of NATIVE) {
    try {
      const [r, ms] = time(() => f(img))
      nat[id] = r.image; rec.native[id] = { ...q(r.image), ms: Math.round(ms), info: r.info }
      tgt[id] = R.adapt(r.image, tw, th); rec.target_[id] = { ...q(tgt[id], true), adapted: r.native[0] !== tw || r.native[1] !== th }
    } catch (e) { rec.native[id] = { error: String(e?.message || e) } }
  }
  for (const [id, , f] of TARGET) { try { tgt[id] = f(img, tw, th); rec.target_[id] = q(tgt[id], true) } catch (e) { rec.target_[id] = { error: String(e?.message || e) } } }
  const RS = 224, natIds = Object.keys(nat), tgtIds = Object.keys(tgt)
  writePng(OUT + `real/${s.id}-sheet.png`, stack([strip([tile(img, RS, true), ...natIds.map((k) => tile(nat[k], RS))], RS), strip([tile(img, RS, true), ...tgtIds.map((k) => tile(tgt[k], RS))], RS, [0, ...tgtIds.map((k) => rec.target_[k]?.adapted)])]))
  for (const k of tgtIds) writePng(OUT + `real/${s.id}-target-${k}.png`, R.adapt(tgt[k], tgt[k].width * 4, tgt[k].height * 4))
  rec.sheetCols = { native: ['input', ...natIds], target: ['input', ...tgtIds] }
  real.push(rec)
  console.log(`[real] ${s.id} target ${tw}x${th}:`, Object.entries(rec.native).map(([k, v]) => `${k} ${v.size?.join('x') ?? v.error}`).join(' | '))
}
if (MODE === 'real') { for (const r of real) writeFileSync(OUT + `real/${r.id}.json`, JSON.stringify(r)); console.log('wrote real/<id>.json'); process.exit(0) }
if (real.length) {
  console.log('Real samples, native size per method (want = in-sample pitch estimate, not truth):')
  console.table(Object.fromEntries(real.map((r) => [r.id, { want: String(r.want ?? 'none'), ...Object.fromEntries(Object.entries(r.native).map(([k, v]) => [k, v.size?.join('x') ?? 'ERR'])) }])))
  console.log('Real samples at target: colours / noise orphans / hidden2 / flags')
  console.table(Object.fromEntries(real.flatMap((r) => Object.entries(r.target_).map(([k, v]) => [`${r.id} ${k}`, { colours: v.colours, noise: v.noise, hidden2: v.hidden2, dup: v.dupRatio, flags: v.flags, adapted: v.adapted ?? '' }]))))
}

const git = (cmd) => { try { return execSync(`git ${cmd}`, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
writeFileSync(OUT + 'results.json', JSON.stringify({
  date: new Date().toISOString(), commit: git('rev-parse HEAD'), dirty: Boolean(git('status --porcelain')), engine: ENGINE ?? 'src (working tree)', node: process.version, synthVersion: SYNTH_VERSION,
  evidence: 'exploratory, development split, in-sample; references are re-implementations of documented algorithms, not the tools; native mode runs every method at its own documented palette cap (favours uncapped outputs under emSnap); common-cap modes (_kT = truth palette size, _k16 = 16) re-quantize every output with one shared deterministic k-means; oursBest is an oracle (truth-selected) pick; local-only fixtures are not corpus-admitted',
  methods: Object.fromEntries([...NATIVE, ...TARGET].map(([id, label]) => [id, label])), sheetColumns: SHEET_COLS, seeds: SEEDS, filter: FILTER,
  summary, scenes, real, cases: recs,
}, null, 1))
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)
const htmlTable = (t) => { const cols = [...new Set(Object.values(t).flatMap((r) => Object.keys(r)))]; return `<table><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${Object.entries(t).map(([k, r]) => `<tr><th>${esc(k)}</th>${cols.map((c) => `<td>${esc(r[c] ?? '-')}</td>`).join('')}</tr>`).join('')}</table>` }
let html = `<!doctype html><meta charset="utf-8"><title>Competitor comparison</title><style>body{font:13px system-ui;background:#1d1f24;color:#ddd;margin:16px}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #444;padding:2px 6px;text-align:right}img{image-rendering:pixelated;max-width:100%}</style>
<h1>Competitor comparison (exploratory, local-only)</h1><p>References are clean-room re-implementations of documented algorithms, not the tools. Native-cap tables use each method's own palette cap (Snapper 16, unfake 32, breakfastz 16; others, RD included, uncapped/auto), which favours uncapped outputs; <code>_kT</code> / <code>_k16</code> tables re-quantize every output with one shared k-means to the truth palette size / 16. <b>oursBest is an oracle (truth-selected) pick.</b> Sheet columns: ${esc(SHEET_COLS.join(' | '))}; red frame = adapted (native size wrong) or error.</p>`
for (const [k, t] of Object.entries(summary)) if (typeof Object.values(t)[0] === 'object') html += `<h2>${esc(k)}</h2>${htmlTable(t)}`
html += `<pre>${esc(JSON.stringify({ noGridAsserted: summary.noGridAsserted, msMedian: summary.msMedian, errors: summary.errors }, null, 1))}</pre>`
for (const r of real) html += `<h2>real ${esc(r.id)}</h2><p>rows: ${esc(r.sheetCols.native.join(' | '))} / ${esc(r.sheetCols.target.join(' | '))}</p><img src="real/${r.id}-sheet.png">`
for (const g of Object.keys(sheetRows)) html += `<h2>${esc(g)}</h2><img src="sheets/${slug(g)}.png">`
writeFileSync(OUT + 'index.html', html)
console.log(`\nWrote ${OUT.slice(REPO_ROOT.length)}index.html, results.json, sheets/ and real/`)
