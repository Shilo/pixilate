// The only way to rewrite ratchet baselines (methodology §15.2): test/baseline.json from the committed
// procedural cases, and the gitignored .local/baselines/showcase.json when the local showcase crops exist.
// Prints every old -> new value for the golden-change record. Commit baseline changes on their own,
// with that record and the reason, never together with the code change that caused them.
// Usage (in prototype/): node scripts/update-baseline.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { committedCases, showcaseCases, BASELINE_PATH, SHOWCASE_BASELINE_PATH, REPO_ROOT } from '../test/fixtures.js'
import { runMatrix, summarize } from '../test/metrics.js'

const { convert } = await import('../src/lib/core/pipeline.ts')
const rel = (p) => p.slice(REPO_ROOT.length).replaceAll('\\', '/')
let failed = false
for (const [path, cases] of [[BASELINE_PATH, committedCases()], [SHOWCASE_BASELINE_PATH, showcaseCases()]]) {
  if (!cases.length) { console.log(`${rel(path)}: no cases (local files absent), skipped`); continue }
  const recs = runMatrix(convert, cases), errs = recs.filter((r) => r.error)
  if (errs.length) { // a baseline must not encode contract failures
    console.error(`${rel(path)}: ${errs.length} case errors, not written; first: ${errs[0].id}: ${errs[0].error.split('\n')[0]}`)
    failed = true
    continue
  }
  const cur = summarize(recs, 'group'), old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const lines = []
  for (const g of new Set([...Object.keys(old), ...Object.keys(cur)])) {
    for (const k of new Set([...Object.keys(old[g] ?? {}), ...Object.keys(cur[g] ?? {})])) {
      if (old[g]?.[k] !== cur[g]?.[k]) lines.push(`  ${g}.${k}: ${old[g]?.[k] ?? '-'} -> ${cur[g]?.[k] ?? '-'}`)
    }
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cur, null, 1) + '\n')
  console.log(`${rel(path)}: ${recs.length} cases, ${lines.length} changed values${lines.length ? '\n' + lines.join('\n') : ''}`)
}
if (failed) process.exit(1)
