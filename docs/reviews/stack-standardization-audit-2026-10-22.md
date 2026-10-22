# Stack standardization: independent audit — 2026-10-22

Purpose: independently re-verify the `OWN-010` TypeScript and toolchain migration recorded in [stack-standardization-2026-10-22.md](stack-standardization-2026-10-22.md), without relying on its claims, passing builds or earlier CI.

| Item | Value |
|---|---|
| Scope | `e69f6cf` (pre-migration) to `4e4b2ab`: `b036da3`, `5604c3d`, `104f6d8`, `9ae304a`, `296a2ca`, `4e4b2ab`; 85 files |
| Toolchain | Node.js 24.22.1, npm 11.19.1, committed lockfiles, `npm ci`; Playwright-managed Chromium 156.0.8078.4 |
| Inputs | Project-authored procedural sprites and scenes from `prototype/test` only; no private images |
| Labels | VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, UNKNOWN as in the [research index](../research-spikes/README.md#how-to-read-the-evidence) |

## Result

No migration regression was found in the engine, the app, the browser output or the exported PNGs. No code change was needed. VERIFIED unless marked otherwise.

## Coverage

- **Engine (all 11 core modules, `decode`, both workers, harness `App.svelte`).** Every migrated file was type-stripped with Node's `stripTypeScriptTypes` (strip mode, so non-erasable syntax would throw), transpiled and token-compared with the baseline JavaScript. The only residue is parentheses left by removed `as` casts, each around a bare identifier. The harness `App.svelte` compiles to token-identical client JavaScript. Vite's own transform of all 14 files is token-identical too. The engine identifier `pixilate-prototype-js`, version `0.14.2`, constants `33`, `test/baseline.json`, `test/synth.js` and `test/fixtures.js` are unchanged.
- **App (`src/lib/*.ts`, `worker.ts`, `main.ts`, `App.svelte`, all nine components, `vite.config.ts`).** Every hunk was read. All differences are annotations, `!`/`as` assertions, typed `$state<…>()` and `as const` in `{#each}`. None changes defaults, nullish handling, object shape, transfer lists, stale-reply filtering, cancellation or error paths. The CSS bundle is identical (same content hash).
- **Configuration.** Direct dependencies are exact pins; the lockfiles only add `typescript`, `svelte-check`, `@types/node`, `@playwright/test` and their dependencies. Every existing runtime package keeps its version and integrity. `.nvmrc`, `packageManager` and CI select Node.js 24.22.1 / npm 11.19.1. `npm audit`: 0 vulnerabilities in both packages.
- **Imports.** All 115 relative specifiers match on-disk case exactly; Linux CI (run 39772836071) reports the same counts as Windows.

## Differential engine parity

The baseline JavaScript engine and the TypeScript engine ran the same inputs in separate processes (OBSERVED, procedural).

| Item | Value |
|---|---|
| Cases | 1,060: every `matrixCases(..., { extra: true })` case and every no-grid scene for seeds 1 (committed), 11, 29, 47 and 83 (held out) |
| Option variants | 28 per core case (267 cases): non-square contain/cover/stretch, trim and cell trim with background, background off, Clean with 8 colours, 4 and 64 colours, fixed palette, halo, forced grid/raster routes, two grid overrides, the app's exact default options, 1×1 and 1024×3 targets, and nine invalid-option cases |
| Also | `convert`, `analyze` (with and without a target), PNG decode round trips, 28 malformed decode inputs (empty, text, truncated, corrupted, signature-only, JPEG/GIF headers, oversized header), 15 transparent/solid/1-pixel/line edge images |
| Compared | Raw RGBA hash, encoded PNG hash, size, typed-array type, binary alpha, palette, canonical fingerprint, recipe JSON (including key order), full report without timings, recommendation and reason, alias, analysis, failed styles, error class/code/message, decoder metadata |
| Outcome | 1,116 of 1,116 records byte-identical; 7,208 candidate sets, 14,429 candidates, all with binary alpha; 2,431 error outcomes, all the intended `invalid-input`/decode errors and identical |
| Determinism | In-process repeats identical (267/267); a second process run with different sharding is byte-identical (1,116/1,116) |

## Quality gates

- Engine: 326 passed, 2 expected failures (the open eye cases in `resample.test.js`), 24 skipped. All 24 skips are local-only real samples or the showcase set, absent from a clean checkout.
- The committed gates now import the engine statically. In a scratch copy, renaming the `convert` export fails all six gates; deleting `baseline.json`, changing a palette constant, tightening one baseline value or removing a baseline group each fails `G-RATCHET`.
- The CSP line-ending tests are meaningful: reverting the normalization fails the CRLF and lone-CR cases and leaves LF passing.
- `engine-entry.mjs` loads full current TypeScript and historical JavaScript `src` archives from a path containing a space, with no `package.json` (Node falls back to syntax detection with a harmless warning). `compare.mjs --engine` produced identical case results for both, apart from timings. Its case cache is not keyed by engine, so use `--clean` between engines (pre-existing).

## Fresh checks

Run sequentially; each passed on its first run.

| Command | Result |
|---|---|
| prototype: `npm ci`, `npm run check`, `npm test`, `npm run build` | 0 errors / 0 warnings (267 files); 326 passed, 2 expected fail, 24 skipped; built |
| app: `npm ci`, `npm run check`, `npm test`, `npm run build` | 0 errors / 0 warnings (328 files); 96 passed; built |
| app: `npm run e2e` | 4 passed (desktop and phone) |
| app: `npm run build -- --base=/pixilate/` | built; served under `/pixilate/`, worker, example and export load with 0 CSP violations and 0 out-of-base requests |

## Visual comparison

`e69f6cf` and `4e4b2ab` production builds were driven identically in Chromium 156.0.8078.4 with reduced motion, fresh storage, system fonts and generated inputs (OBSERVED).

- **Viewports:** 1440×900 and 390×844 (touch) full flow; 320×640, 820×1180 and 844×390 short flow; portrait-landscape-portrait rotation; DPR 1.5 and 2.625 for the result and Details. Light and dark throughout.
- **States:** empty, focus walk, import, processing and Stop, cancelled, result, all three styles (and the single-candidate case with no compact selector), size presets, non-square and Fit/Fill, grid override, tools, Export at 1× and 2×, Details, Before, zoom and grid, image replacement, invalid replacement and recovery, overflow.
- **Pixels:** 379 of 392 pairs byte-identical. The other 13 differ by 7–33 anti-aliased pixels on rounded GlassKit borders; same-build reruns show the same differences, so they are rendering noise. No masks or tolerances were used.
- **Exports:** all 40 downloaded 1× and 2× PNGs are byte-identical between revisions, and every 2× file is the exact nearest-neighbour enlargement of its 1×.
- **The one real difference** is the intended `296a2ca` fix. A baseline build from a CRLF checkout hashed the raw CRLF theme script, so the browser blocked it and light mode stayed dark. LF builds, including the deployed Pages site, were never affected.

## Not verified

UNKNOWN: Safari/WebKit, Firefox, real iOS and Android devices, the optional Edge channel, screen readers, forced colours, the system share sheet and clipboard, drag-and-drop and paste. Showcase and real-sample suites need local samples and were skipped. Chromium mobile emulation does not prove real-device behaviour.

Optional hardening, not applied: `erasableSyntaxOnly` in `prototype/tsconfig.json` would reject syntax that Node's type stripping cannot run. Today none exists, and `scripts.test.js` already loads the whole engine under native stripping, so CI would catch it.
