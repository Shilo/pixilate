// Score one output PNG against the testing to-do's hard checks plus the intrinsic metrics in
// test/metrics.js, so human rubric scores are backed by numbers (docs/planning/testing-todo.md §8).
// Thresholds are the PROVISIONAL defaults from pixel-art-quality-metrics.md (Q1, Q2, Q4, Q13); they are
// uncalibrated on real images, so a flag means "look closer", not a verdict.
// Usage: node scripts/score.mjs <output.png> [--target WxH] [--colors N] [--json]
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { decodeImage } from '../src/lib/decode.js'
import { intrinsic } from '../test/metrics.js'

export const THRESHOLDS = { hidden2: 0.3, dupRatio: 0.05, noiseRate: 0.002 } // PROVISIONAL-PILOT

/** Hard checks + metrics for one RGBA image. targetW/targetH/maxColors are optional. */
export function scoreImage(img, { targetW = null, targetH = null, maxColors = null } = {}) {
  const m = intrinsic(img, { targetW, targetH, maxColors })
  const opaque = img.data.reduce((n, v, i) => (i % 4 === 3 && v >= 128 ? n + 1 : n), 0)
  const noiseCeiling = Math.max(1, THRESHOLDS.noiseRate * opaque)
  const hard = {
    size: targetW == null && targetH == null ? null : m.sizeOk,
    binaryAlpha: m.nonBinary === 0,
    noMixels: !(m.hidden2 > THRESHOLDS.hidden2 || m.dupRatio > THRESHOLDS.dupRatio),
    paletteCap: maxColors == null ? null : m.budgetOk,
  }
  const flags = []
  if (hard.size === false) flags.push(`wrong size ${img.width}x${img.height} (want ${targetW}x${targetH})`)
  if (!hard.binaryAlpha) flags.push(`${m.nonBinary} semi-transparent pixels`)
  if (!hard.noMixels) flags.push(`possible mixels (hidden2 ${m.hidden2.toFixed(2)}, dupRatio ${m.dupRatio.toFixed(3)})`)
  if (hard.paletteCap === false) flags.push(`${m.kOut} colours > cap ${maxColors}`)
  if (m.orphansNoise > noiseCeiling) flags.push(`${m.orphansNoise} noise orphans > ${noiseCeiling.toFixed(1)} (look closer)`)
  return {
    width: img.width, height: img.height, opaque, hard, flags,
    pass: flags.length === 0, // determinism and missing features are checked elsewhere (live-batch / human)
    metrics: {
      colours: m.kOut, nearDuplicatePairs: m.dupPairs, rareColours: m.rare,
      orphansNoise: m.orphansNoise, orphansAccent: m.orphansAccent, orphansAA: m.orphansAA,
      lCornerDoublesPer100Thin: m.doubleRate, islands: m.islands, pinholes: m.pinholes,
      hidden2: m.hidden2, dupRatio: m.dupRatio,
    },
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--') && !/^\d/.test(a))
  const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null }
  if (!file) { console.error('usage: node scripts/score.mjs <output.png> [--target WxH] [--colors N] [--json]'); process.exit(2) }
  const [targetW, targetH] = opt('target') ? opt('target').split('x').map(Number) : [null, null]
  const { img } = await decodeImage(new Uint8Array(readFileSync(file)))
  const r = scoreImage(img, { targetW, targetH, maxColors: opt('colors') ? Number(opt('colors')) : null })
  if (args.includes('--json')) return console.log(JSON.stringify(r, null, 2))
  console.log(`${file}: ${r.width}x${r.height}, ${r.metrics.colours} colours — ${r.pass ? 'no hard-check flags' : 'FLAGS'}`)
  for (const f of r.flags) console.log(`  ! ${f}`)
  for (const [k, v] of Object.entries(r.metrics)) console.log(`  ${k}: ${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}`)
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
