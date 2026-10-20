# Session Findings — 2026-10-19

> **Resume point moved (2026-10-20).** For the current state and ranked next steps, read the [2026-10-20 session findings](session-findings-2026-10-20.md). This document stays as the record of the 2026-10-18/19 sessions; its "Current state" and "Recommended next steps" describe 2026-10-19.

## Purpose and scope

This document records the state reached in the 2026-10-18/19 sessions that built and then reconciled the owner-requested JavaScript prototype (`OWN-001`, `OWN-002`), so work can resume without re-reading the whole history. It is a dated summary and resume point, not a replacement for the detailed spikes, requirements, design or results. Where it states a number, the canonical source governs. Evidence labels follow the [research index](../research-spikes/README.md#how-to-read-the-evidence).

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## What happened

1. A research prototype was first built outside this repository without reading Pixilate's research. It was then moved here into [`prototype/`](../../prototype/) with its research.
2. Five independent reviews compared the prototype and its research against this repository's spikes, [PRD](product-requirements.md), [master plan](master-plan.md), [benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md) and the [2026-10-18 conversion findings](ai-art-conversion-session-findings.md).
3. The engine, test harness, UI and documents were revised to fit those guidelines. Owner directives that conflict with earlier documents were recorded as dated decisions; nothing historical was rewritten.
4. A final public-safety review ran before commit. Findings were fixed, and the work was committed as two commits on `main`: the prototype, then the documentation reconciliation.

## Owner decisions recorded

The decision log is [PRD §25](product-requirements.md#25-owner-decision-log). In summary:

| ID | Decision |
|---|---|
| `OWN-001` | Deterministic, fully client-side, JavaScript-only engine; Vite + Svelte single-page app (not SvelteKit). Closes `OD-001` by owner decision; `EX-001` was not run. |
| `OWN-002` | `prototype/` is an owner-authorized exploratory exception. It is not Slice A (Gate A/R0) or product work (Gate B/R1), passes no gate and closes no `OD-*`/`EX-*`. |
| `OWN-003` | Generator/provenance detection is report-only (`FR-023`): container metadata, with published output dimensions as weak advisory evidence; "declared (unvalidated)"; no prompts or usernames persisted; watermarks are masked from analysis, never altered. |
| `OWN-004` | Crisp output comes from a named, user-visible Clean profile (`ai-sprite-crisp/1`). Engine defaults keep cleanup and background removal off (`CLEAN-001`, `AUTO-007` stand). |
| `OWN-005` | The prototype outputs binary alpha under the recorded policy `Binary(128)`; the product default stays `PreserveCoverage`. |
| `OWN-006` | The exact output W×H is always required; the detected native size is only `suggestedSize` evidence. |

## Current state

- **Prototype** ([README](../../prototype/README.md), [design](prototype-algorithm-design.md)). `convert` requires an integer W×H and supports explicit Trim, contain/stretch/cover on every route, and routes auto/grid/raster. Cleanup and background removal are off by default. `convertCandidates` returns `grid`/`clean`/`smooth` interpretations with a recommendation. `analyze` reports grid evidence and a suggested size. Every exact factorization is enumerated, with ambiguity. Reports carry a recipe, typed errors and a `pixilate/canonical-rgba/v1` hash. The UI is a plain test harness with a candidate switcher.
- **Tests.** The committed gates (G-CONTRACT, G-EXACT, G-TRAP, the relative Clean G-TRAP, G-RATCHET) run on owned procedural fixtures only. A fresh clone passes with 0 failures; local-only suites skip. Details and numbers are in the [test results](../reviews/prototype-v1-test-results.md).
- **Research.**
  - The prototype's research became dated 2026-10-19 addenda on the canonical [unfake.js](../research-spikes/products/unfake-js.md), [SpriteFusion](../research-spikes/products/spritefusion-pixel-snapper.md), [PixelLab](../research-spikes/products/pixellab.md), [landscape](../research-spikes/landscape/open-source-ecosystem.md) and [state-of-the-art](../research-spikes/algorithms/state-of-the-art.md) spikes.
  - New spikes cover [Retro Diffusion](../research-spikes/products/retro-diffusion-pixel-art-fixer.md) and [input provenance signals](../research-spikes/algorithms/input-provenance-signals.md).
  - The quality metrics and AI-artifact characterization moved to [evaluation](../research-spikes/evaluation/pixel-art-quality-metrics.md).
  - The [synthesis addendum](../research-spikes/SYNTHESIS.md), [gap matrix](../reviews/research-gap-matrix.md) and [final review](../reviews/FINAL-REVIEW.md) record what changed.
- **Not done.** Nothing is pushed. There is no `LICENSE` file ("intended MIT, not yet declared"). No real samples from Grok, Midjourney, Flux, Stable Diffusion or other generators were used, because downloads were not permitted. No competitor benchmark was run under methodology §12.

## Key findings

All are exploratory and in-sample; none closes an open decision.

- **Grid recovery is the strongest part (OBSERVED).**
  - Clean integer upscales are 100 % exact.
  - Procedural non-integer nearest and bilinear upscales reach a median of 1.0 snapped match.
  - Five private gridded AI samples (local-only, not rights-cleared) gave suggested sizes within ±2 % of a no-reference pitch estimate; the painted no-grid control was classed `none`.
- **The mixel stratum is the weakest (OBSERVED, local-only, not rights-cleared).** On the stratum-M baseline cases, a plain centre-sample nearest baseline beats the engine (0.84 against 0.78). This is the most important result for the next round.
- **Detection misses send gridded art to the raster route.** Examples: one non-integer 1-bit case, and many `bicubic-x8` upscales (median 0.10).
- **Defaults-off was right for safety.** The Clean profile initially deleted 1-bit and UI features. After fixes it loses no recall against cleanup off on the procedural traps (relative gate), and is still off by default.
- **Measured negative results worth keeping.** An adaptive palette merge radius improved synthetic scores but bloated real palettes (reverted, D19). A drop-shadow background allowance deleted light subject content (reverted, D15). Raw OKLab lightness split noisy black outlines; toe-corrected lightness fixed it (D1).
- **Determinism (OBSERVED, narrow).** Output was byte-identical between one Chromium build and Node on one sample. Other engines are unverified (`DET-007`).

## Recommended next steps

Ranked by expected value. Each maps to an open question in the [design](prototype-algorithm-design.md#open-questions-and-next-experiments), the [experiment register](master-plan.md#6-early-experiment-register) or [PRD §20](product-requirements.md#20-open-implementation-decisions-with-entryexit-criteria).

1. **Fix mixel handling (`EX-005`, `EX-009`).** Find out why the engine loses to a centre sample on stratum M (`gemini-like`, and `jpeg-heavy` in stratum I). Suspects: trimmed-mean colour estimation (D18) over-smoothing, cell inset size, and palette merge. Accept a change only if it beats the nearest baseline on M without regressing G, I and B.
2. **Calibrated grid / mixel / no-grid confidence (`AUTO-005`, `AUTO-006`).** Reduce detection misses (`bicubic-x8`, the non-integer 1-bit case). Candidates: a second-difference channel, an a-contrario test, and a run-length cross-check. Also make `route: 'auto'` agree with the candidate recommendation for weak grids.
3. **Real, rights-cleared corpus (methodology §3).** With owner permission, admit candidates from the sourcing plan in [AI artifact characterization §4](../research-spikes/evaluation/ai-artifact-characterization.md#4-real-sample-sourcing-plan-do-not-download-until-approved), focusing on generators with no sample, real painted checkerboards and real JPEG uploads.
4. **Ambiguous exact grids (`OD-004`).** Decide whether to refuse, require an instructed lattice, or offer the candidates when several factorizations are valid.
5. **Large reductions of 3× or more (`OD-003`, `EX-003`).** Evaluate PixelOE-style outline expansion and DPID-style weighting on the raster/reduction path.
6. **Clean profile topology guard (`EX-011`, `CLEAN-003`, `CLEAN-004`).** Add a components/holes guard and a diff overlay before Clean can be considered for anything beyond an explicit choice.
7. **Cross-engine determinism (`DET-007`).** Hash the committed gate outputs in Firefox and Safari.
8. **Owner actions.** Declare the licence, decide when to push, and decide on competitor captures under methodology §12.

## How to resume

1. Read [`AGENTS.md`](../../AGENTS.md), then the [research index](../research-spikes/README.md), [PRD §25](product-requirements.md#25-owner-decision-log), this document, the [prototype design](prototype-algorithm-design.md) and the [test results](../reviews/prototype-v1-test-results.md).
2. Run the committed checks: `cd prototype && npm install && npm test`.
3. Run the benchmark: `cd prototype && npm run bench -- --seeds 1`. Output goes to the gitignored `.local/`.
4. Record every behaviour change as a new row in the design doc's [Deviations](prototype-algorithm-design.md#deviations) table with measured evidence.
5. Rewrite baselines only with `node scripts/update-baseline.mjs`, committed on their own with a [golden-change record](../reviews/prototype-v1-test-results.md#golden-change-record) entry.
6. Keep owner samples in the gitignored `.local/samples/` under opaque IDs, and never name or describe them in tracked files.

## Canonical supporting documents

- [Prototype README](../../prototype/README.md)
- [Prototype algorithm design](prototype-algorithm-design.md)
- [Prototype v1 test results](../reviews/prototype-v1-test-results.md)
- [Product requirements](product-requirements.md) and [master plan](master-plan.md)
- [Research synthesis](../research-spikes/SYNTHESIS.md) and [state of the art](../research-spikes/algorithms/state-of-the-art.md)
- [Benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md) and [quality metrics](../research-spikes/evaluation/pixel-art-quality-metrics.md)
- [Research gap matrix](../reviews/research-gap-matrix.md) and [final review](../reviews/FINAL-REVIEW.md)
