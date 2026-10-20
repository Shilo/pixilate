// Committed gates over owned procedural fixtures only (a clean checkout without .local/ must pass):
//   G-CONTRACT  no throw, exact size, binary alpha, repeat-run pixel identity
//   G-EXACT     clean integer NN: 100% exact, palette = GT, scale exact, suggested size = lattice
//   G-TRAP      cleanup traps keep G8 small-feature recall >= 0.95 (cleanup off); the Clean profile
//               loses no G8 recall/adds no breaks vs cleanup off on the same seed and input
//   G-RATCHET   per-group medians (and no-grid false-grid rate) vs test/baseline.json
// Local-only suites (skipped when the gitignored files are absent): showcase ratchet vs
// .local/baselines/showcase.json, and real-sample acceptance. Baselines are rewritten only by
// `node scripts/update-baseline.mjs`; a missing baseline fails.
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { committedCases, showcaseCases, readPng, repoPath, REAL_SAMPLES, TRAPS, BASELINE_PATH, SHOWCASE_BASELINE_PATH } from './fixtures.js'
import { runCase, runMatrix, summarize, ratchet } from './metrics.js'

const PIPELINE = new URL('../src/lib/core/pipeline.js', import.meta.url)
const HAS = existsSync(fileURLToPath(PIPELINE))
if (!HAS) console.warn('[regression] skipped: src/lib/core/pipeline.js does not exist yet')

const table = (cur) => console.table(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { n: v.n, emRec: v.emSnapRec, em: v.emSnap, amb: v.ambFrac, emRGB: v.emOpaque, f1: v.f1T1, iou: v.iou, g8: v.g8Recall, dE: v.deMean, scale: v.scaleErr, seam95: v.seamP95, falseGrid: v.falseGrid, T2: v.passT2, T3: v.passT3 }])))
const checkRatchet = (recs, path) => {
  const cur = summarize(recs, 'group')
  table(cur)
  expect(existsSync(path), `baseline missing: run node scripts/update-baseline.mjs`).toBe(true)
  expect(ratchet(cur, JSON.parse(readFileSync(path, 'utf8')))).toEqual([])
}

describe.skipIf(!HAS)('committed gates (procedural fixtures)', () => {
  let recs = []
  beforeAll(async () => {
    const { convert } = await import(PIPELINE.href)
    recs = runMatrix(convert, committedCases())
  }, 300_000)

  it('G-CONTRACT: no throw, exact size, binary alpha, repeat identity', () => {
    const bad = recs.filter((r) => r.error || !r.ok || r.partial !== 0 || r.deterministic === false)
      .map((r) => `${r.id}: ${r.error ? r.error.split('\n')[0] : `ok=${r.ok} nonBinary=${r.nonBinary} partial=${r.partial} deterministic=${r.deterministic}`}`)
    expect(bad).toEqual([])
  })

  it('G-EXACT: clean integer NN is 100% exact, palette = GT, scale exact, suggested size = lattice', () => {
    const exact = recs.filter((r) => r.preset === 'clean-nn-integer' && r.group === 'clean-nn-integer')
    expect(exact.length).toBeGreaterThan(0)
    const bad = exact.filter((r) => !(r.emAll === 1 && r.kErr === 0 && r.scaleErr === 0 && String(r.suggestedSize) === String(r.cells)))
      .map((r) => `${r.id}: emAll=${r.emAll} kErr=${r.kErr} scaleErr=${r.scaleErr} suggested=${r.suggestedSize} want=${r.cells} path=${r.path}`)
    expect(bad).toEqual([])
  })

  const traps = () => recs.filter((r) => TRAPS.includes(r.spriteId) && ['clean-nn-integer', 'nonint-nn'].includes(r.group))
  const trapBad = (rs) => rs.filter((r) => !(r.g8Recall >= 0.95)).map((r) => `${r.id}: g8Recall=${r.g8Recall} breaks=${r.g8Breaks}`)

  it('G-TRAP: cleanup traps keep G8 recall >= 0.95 (clean, nonint-nn; engine default cleanup off)', () => {
    expect(traps().length).toBeGreaterThan(0)
    expect(trapBad(traps())).toEqual([])
  })

  // Relative gate: Clean is judged against cleanup off on the SAME seed and input, so a detection miss
  // (e.g. proc-1bit nonint-nn classed 'none' -> raster route, a recorded detection limitation) is not
  // charged to cleanup. Clean may not lose G8 recall (tolerance 0.01) or add line breaks.
  it('G-TRAP (Clean profile): no feature loss vs cleanup off', async () => {
    const { convert } = await import(PIPELINE.href)
    const cases = committedCases().filter((c) => TRAPS.includes(c.spriteId) && ['clean-nn-integer', 'nonint-nn'].some((p) => c.group === `${p}+cleanup`))
    expect(cases.length).toBeGreaterThan(0)
    const bad = cases.flatMap((c) => {
      const on = recs.find((r) => r.id === c.id), off = runCase(convert, { ...c, opts: { ...c.opts, cleanup: false }, repeat: false }).rec
      return on.g8Recall >= off.g8Recall - 0.01 && on.g8Breaks <= off.g8Breaks ? [] : [`${c.id}: Clean g8Recall=${on.g8Recall} breaks=${on.g8Breaks} vs off ${off.g8Recall}/${off.g8Breaks}`]
    })
    expect(bad).toEqual([])
  }, 120_000)

  it('G-RATCHET: per-group medians and false-grid rate do not regress vs test/baseline.json', () => {
    const ng = recs.filter((r) => r.group.startsWith('no-grid/'))
    console.log(`[no-grid] false-grid rate (class != 'none'): ${ng.filter((r) => r.falseGrid).length}/${ng.length}`)
    checkRatchet(recs, BASELINE_PATH)
  })
})

describe.skipIf(!HAS || !showcaseCases().length)('local: showcase ratchet (external, not corpus-admitted)', () => {
  it('per-group medians do not regress vs .local/baselines/showcase.json', async () => {
    const { convert } = await import(PIPELINE.href)
    checkRatchet(runMatrix(convert, showcaseCases()), SHOWCASE_BASELINE_PATH)
  }, 300_000)
})

describe.skipIf(!HAS)('local: real-sample acceptance (private, in-sample)', () => {
  for (const { id, rel, want } of REAL_SAMPLES) {
    it.skipIf(!existsSync(repoPath(rel)))(`${id} ${want ? 'grid/weak with suggested size within 2%' : "classifies 'none'"}`, async () => {
      const { analyze } = await import(PIPELINE.href) // no target: the size prior must not help detection
      const { grid: g, suggestedSize: n } = analyze(readPng(repoPath(rel)), {}, new Uint8Array(readFileSync(repoPath(rel))))
      if (!want) return expect(g.class).toBe('none')
      expect(['grid', 'weak']).toContain(g.class)
      for (const k of [0, 1]) expect(Math.abs(n[k] - want[k]) / want[k], `${id} axis ${k}: N=${n[k]} want ${want[k].toFixed(1)}`).toBeLessThanOrEqual(0.02)
    }, 120_000)
  }
})
