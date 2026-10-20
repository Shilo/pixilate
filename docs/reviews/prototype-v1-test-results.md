# Prototype v1 test results

Last reviewed: 2026-10-20.

Purpose: record how the exploratory prototype in [`prototype/`](../../prototype/) (`OWN-002`) was tested, what it measured, where it still fails, and how to reproduce the numbers. Read it with the [algorithm design](../planning/prototype-algorithm-design.md), whose [Deviations](../planning/prototype-algorithm-design.md#deviations) table (D1–D46) holds the per-change evidence. The newest measurements are in [2026-10-20 round](#2026-10-20-round).

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## Evidence class

| Item | Value |
|---|---|
| Class | Exploratory, in-sample. Thresholds were tuned on the fixtures that measured them. |
| Held-out split | None |
| Blinded human panel | None |
| Confidence intervals | None (medians and p10 only; cases within a source family are not independent) |
| Decisions closed | None: no `OD-*` or `EX-*` item, no gate, no production default |
| Code revision | 2026-10-19 sections: working tree of 2026-10-19. [2026-10-20 round](#2026-10-20-round): commits `3896d49` (engine `0.5.0`, constants 25) and `0939adc` (baseline); for later commits, see `git log` |
| Toolchain | Node 25.0.0, Vitest 4.1.12, synthetic fixture version `pixilate-synth/3` since 2026-10-20 (`pixilate-synth/2` for the 2026-10-19 bench) |
| Labels | VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, UNKNOWN as in the [research index](../research-spikes/README.md#how-to-read-the-evidence) |

Committed tests and the procedural benchmark rows are **OBSERVED** and reproducible from the repository. Every number that includes the gitignored showcase crops, private sprites or private AI samples is **OBSERVED, local-only, not rights-cleared**: it cannot be reproduced from the repository and backs no public claim. Nothing here is benchmark evidence under the [benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md).

## Summary

- **Committed tests (2026-10-20).** 267 Vitest tests pass and 2 are expected failures (`it.fails`, marked `[open]`). A fresh copy of the tracked files without `.local/` passes 243, skips 24 local-only tests and has the same 2 expected failures, with 0 failures (OBSERVED). On 2026-10-19 the counts were 238, and 214 plus 24 skipped.
- **Smoothly upscaled pixel art (2026-10-20; OBSERVED, local-only, not rights-cleared).** Bilinear ×8 and ×8.37 round trips of 4 local PixelLab sprites now find the lattice in 8 of 8 cases (1 of 8 before), with a median 97.3 % of opaque pixels within 12/255. Raw AI images are unaffected: the new fallback is inert on them. See [2026-10-20 round](#2026-10-20-round).
- **Exact and interpolated grids (OBSERVED, procedural).** Clean integer nearest-neighbour upscales are 100 % exact (gate G-EXACT). Procedural non-integer nearest-neighbour and bilinear upscales have a median snapped match of 1.0.
- **AI-like synthetic degradations (OBSERVED, local-only, not rights-cleared).** Over all 28 sprite families, the median snapped match on recoverable cells is 0.82 for the mixel stratum M, with p10 0.41. On the same baseline cases, the plain centre-sample nearest baseline beats the engine on M (0.84 against 0.78).
- **False grids (OBSERVED, procedural).** None of the 4 no-grid scenes in this one-seed run was classed as a grid; the committed three-seed baseline still has 2 of 3 `shapes` seeds classed as a grid. These are too few cases for a rate claim.
- **Trim after the 2026-10-19 fix (OBSERVED, procedural).** The committed `trim-subject` group median rose from 0.53 to 0.85 snapped match, and IoU from 0.57 to 0.93.
- **Private AI samples (OBSERVED, local-only, not rights-cleared).** The five gridded samples' suggested sizes were within ±2 % of this review's own no-reference pitch estimate, and the no-grid control `ai-wizard` was classed `none`.
- **Not verified:** generators with no local sample (Grok, Midjourney, Flux, Stable Diffusion and others; downloads were not permitted), real painted checkerboards, real JPEG uploads, and real WebP/AVIF decoding (browser canvas fallback only).

## How it was tested

| Layer | What | Where |
|---|---|---|
| Unit and integration | Vitest suites for decode, detect, grid, sample, palette, cleanup, resample and pipeline, plus harness self-tests and regression gates | `prototype/test/` (`npm test`) |
| Committed gates | G-CONTRACT (exact size, binary alpha, byte-identical repeat runs); G-EXACT (100 % exact on clean nearest-neighbour upscales); G-TRAP (small-feature recall ≥ 0.95 on procedural cleanup traps with cleanup off); G-TRAP (Clean profile), relative: against cleanup off on the same seed and input, Clean may not lose recall (tolerance 0.01) or add line breaks; G-SMOOTH (since 2026-10-20): 7 smooth-upscale fixtures classify `grid` on the true lattice with `emSnap` ≥ 0.99; G-RATCHET against `test/baseline.json` (procedural cases only) | `test/regression.test.js` |
| Local suites | Skipped when the gitignored files are absent: a showcase ratchet against a local baseline; grid counts within ±2 % of the measured pitch; the no-grid control classed `none`; background guards on `gpt-oni`, `gemini-mage` and `unk-coat` | `test/regression.test.js`, `test/cleanup.test.js`, `test/grid.test.js`, `test/detect.test.js` |
| Synthetic benchmark | 396 cases, one seed: 392 synthetic cases from 28 sprite families (6 committed procedural, 18 local-only showcase crops, 4 local-only private sprites) under the [degradation presets](../research-spikes/evaluation/ai-artifact-characterization.md) and cleanup variants, plus 4 procedural no-grid scenes; scored with the [quality metrics](../research-spikes/evaluation/pixel-art-quality-metrics.md) | `npm run bench -- --seeds 1` (writes to the gitignored `.local/pixel-downscaler-bench/`; 258 s on one machine) |
| Visual review | The authors inspected (unblinded) contact sheets of the private samples at native size and at 64/48/32/16 px before the D23 revision | Gitignored `.local/` sheets |
| Browser | Dev server in one Chromium build: one private sample loaded through the file input; report and download checked; no console errors; output hash equal to the Node run (OBSERVED, local-only) | Manual, 2026-10-19 |
| Internal review | Design and code review findings, applied with regression tests | [Algorithm design](../planning/prototype-algorithm-design.md#deviations) |

## 2026-10-20 round

Commits `3896d49` (engine `0.5.0`, constants 25) and `0939adc` (baseline additions), plus a UI evidence display in the working tree. The design rows are D37–D46. Unless a row says otherwise, numbers come from the review harnesses of this round, which mix procedural fixtures with local-only sprites and showcase crops, so they are **OBSERVED, local-only, not rights-cleared** and in-sample. The round trips use the four owner-provided local sprites of the earlier PixelLab round-trip check (`local-portrait`, `local-creature`, `local-building`, `local-tileset`; [artifact characterization §3.3](../research-spikes/evaluation/ai-artifact-characterization.md#33-supplementary-ground-truth-local-only-gitignored)). They were not captured under the competitor protocol (methodology §12) and serve only as known-good inputs, never as a tool comparison.

### What changed

| Change | Design row | Effect in one line |
|---|---|---|
| Smooth-upscale presets, 7 committed fixtures, gate G-SMOOTH, `pixilate-synth/3` | D37 | The benchmark can now see bilinear and bicubic upscales of clean pixel art |
| Second-difference (`d2`) fallback at ramp share ≥ 0.15 | D38 | Smoothly upscaled pixel art is detected on its true lattice |
| `d2` may replace a wrong first-difference `grid` | D39 | Fixes lattices locked onto a multiple of the period |
| `fitcells.js` kernel fit and cell deconvolution (`d2` only) | D40 | Cell colours of smooth upscales are de-blurred |
| `d2` mask covers every pixel a term reads | D41 | Masks hold on the new profile |
| Clean orphan rule keeps a compact feature covering ≥ 0.5 of its cell | D42 | Eyes under busy shading survive Clean |
| Clean outline rebuild skips thin protrusions | D43 | Thin light staffs and antennae are no longer blackened |
| Octave lock (N ≈ T/2) | D44 | Art with 2-px structure locks to the requested size |
| UI: sprite shortcut, "grid class:" wording, per-candidate grid evidence | D45 | Sprite workflow is one click; new evidence is visible |
| Rejected: centre-weighted estimators, every τ_merge change, ramp gate 0.5 | D46 | Recorded negative results |

### Re-measured numbers

| Measurement | Before | After | Row |
|---|---|---|---|
| Smooth groups, mean `emSnap` change over 39 cases each (independent re-measure) | — | `bilinear-x8` +0.081, `bilinear-x8.37` +0.149, `bicubic-x8-clean` +0.029; 0 cases worse | D38–D40 |
| Smooth cases (187): correct lattices / mean `emSnap` | 123 / 0.6993 | 130 / 0.7143 | D39 |
| Fallback cases at scales up to ×6 (92): `emSnap` median / mean | 0.806 / 0.768 | 0.888 / 0.847 | D40 |
| Noisy `bicubic-x8` group (39 cases) | — | unchanged (the fallback does not fire) | D38 |
| `mc-face64` under `nonint-nn` and `nonint-bilinear` | 0.552 | 1.000 | D44 |
| Procedural ×2 cases | 0.194 / 0.839 | 1.000 / 1.000 | D44 |
| No-grid scenes (10 seeds × 4 kinds) and 120 JPEG variants | — | class unchanged on all (OBSERVED, procedural) | D38 |
| Real AI samples (5 gridded and `ai-wizard`) | — | byte-identical | D38–D40, D44 |
| Inputs whose true N was asked for at 2N (270) | — | byte-identical | D44 |
| Clean noise-orphan cut against cleanup off | — | ≥ 84 % | D42 |
| Analysis time on fallback-eligible inputs | 1 × | median 1.75 × (worst 3–7 ×, under 300 ms) | D38 |

The D42 coverage threshold was swept at 0.25, 0.3, 0.4 and 0.5. At 0.3, noise orphans rose by more than 10 % on `gpt-image-like` and `mixel-detail`; at 0.4, by up to 8.2 %; 0.5 was kept.

D40 per-case criterion: a case counts as worse only if `emSnap` drops by more than 0.03 **and** mean ΔE, the within-12/255 share or G8 also gets worse. Two cases meet it: `local-creature` bicubic ×8 (`emSnap` −0.07, mean ΔE worse) and `local-portrait` ×12 (`emSnap` −0.07, within-12 −0.1 point).

### PixelLab round trips after the fix

Same protocol as [the 2026-10-20 browser check](#browser-check-and-pixellab-round-trips-2026-10-20): 4 local sprites, upscaled and converted back to native size with `fit: 'stretch'`.

| Upscale | Before (`e62d112`) | After D38–D39 | After D40 |
|---|---|---|---|
| Nearest-neighbour ×8 | 100 % exact on 4 of 4 | unchanged | unchanged |
| Nearest-neighbour ×8.37 | 100 % on 3 of 4; the building sprite classed `none` | unchanged (the building sprite is a pre-existing miss) | unchanged |
| Bilinear ×8 and ×8.37: lattice found | 1 of 8 (one `weak` on a wrong lattice) | 8 of 8 | 8 of 8 |
| Bilinear ×8 and ×8.37: opaque pixels within 12/255 | 0–89 % exact | 87.4–98.2 % | review round-trip set: median 95.8 → 97.3 %, minimum 91.8 → 94.2 % |

Exact-pixel matches stay low after a smooth upscale because the palette stage merges close true colours (see [limitations](#limitations-found-this-round)); within-12/255 is the fairer measure there.

### Clean on real samples

Unblinded author review of Clean diffs at 64/48/32 px (OBSERVED, local-only, not rights-cleared): mildly net-better. The eye is kept on `unk-coat` at 48 px, and the silver staff prongs on `gemini-mage` at 32 px stay light. A few new 1-px artifacts appear. Two procedural eye fixtures whose eyes straddle output cells (best-cell coverage 0.375 at 24 px and 0.44 at 32 px) still fail and are committed as `it.fails` `[open]`.

### Bench, three seeds

`npm run bench -- --seeds 3` on engine `0.5.0` and `pixilate-synth/3`: 1,458 cases (1,446 synthetic from 28 sprite families, 12 no-grid scenes) in 1,634 s on one machine, 0 errors. Score definitions as in the [2026-10-19 headline](#benchmark-headline-2026-10-19-run). All-family rows include the local-only showcase crops and private sprites, so they are **OBSERVED, local-only, not rights-cleared**, in-sample and exploratory. With three seeds and the new smooth groups, these rows are not directly comparable with the one-seed 2026-10-19 tables.

**By primary stratum, all 28 families.**

| Stratum | Cases | Median | p10 | Recommended | Best | Rec. = best | Baseline cases | Engine | Area | Nearest |
|---|---|---|---|---|---|---|---|---|---|---|
| G exact grid | 288 | 1.000 | 1.000 | 1.000 | 1.000 | 100 % | 288 | 1.000 | 1.000 | 1.000 |
| I interpolated grid (incl. 3 smooth groups) | 648 | 0.909 | 0.216 | 0.900 | 0.915 | 44 % | 396 | 0.902 | 0.663 | **0.945** |
| M mixel (incl. 60 Trim cases) | 420 | 0.815 | 0.443 | 0.794 | 0.803 | 39 % | 120 | 0.715 | 0.673 | **0.760** |
| B background | 90 | 0.700 | 0.307 | 0.654 | 0.703 | 42 % | 30 | **0.812** | 0.665 | 0.687 |

All 1,446 synthetic cases: median 0.948, p10 0.417, recommended 0.922, best 0.935, recommended equal to best in 54 % of cases.

**Smooth and selected groups (all 28 families, 90 cases each).**

| Group | Median | p10 | Recommended | Best | Engine on baseline cases | Area | Nearest |
|---|---|---|---|---|---|---|---|
| `bilinear-x8` | 0.885 | 0.460 | 0.860 | 0.885 | 0.885 | 0.635 | **0.914** |
| `bilinear-x8.37` | 0.871 | 0.489 | 0.860 | 0.871 | 0.871 | 0.635 | **0.978** |
| `bicubic-x8-clean` | 0.768 | 0.497 | 0.745 | 0.778 | 0.768 | 0.686 | **0.961** |
| `bicubic-x8` (noisy) | 0.117 | 0.034 | 0.120 | 0.139 | 0.450 | **0.541** | 0.530 |
| `gemini-like` | 0.818 | 0.450 | 0.815 | 0.820 | 0.772 | 0.744 | **0.930** |
| `jpeg-heavy` | 0.845 | 0.442 | 0.852 | 0.854 | 0.750 | 0.702 | **0.949** |

The smooth groups are new, so they have no before value in this table; their before/after effect is in [re-measured numbers](#re-measured-numbers). The nearest baseline is given the true W×H and the clean upscale, and still beats the engine on every smooth group: the engine recovers the lattice, then the palette merge collapses close true colours ([limitations](#limitations-found-this-round), item 1).

**No-grid scenes (OBSERVED, procedural).** `shapes`: 2 of 3 seeds classed as a grid (one `weak`, one `grid`; a grid-route candidate recommended on 1 of 3). `gradient`, `texture` and `waves`: 0 of 3 each. Overall false-grid rate 2 of 12, the same `shapes` seeds the committed baseline already records. Too few cases for a rate claim.

**Private AI samples (OBSERVED, local-only, not rights-cleared).** Class, suggested size and output colours are identical to the [2026-10-19 table](#private-ai-samples) on all six samples; only timings changed (0.4–1.7 s).

### Exploratory comparison with reference re-implementations

`scripts/compare.mjs` runs the prototype against **clean-room reference re-implementations** of five public tools in `test/reference-tools.js`. They were written from Pixilate's own source-level spikes, and no third-party code was downloaded, run or copied. Each is "a reference re-implementation of the tool at a pinned revision, not the tool itself", so results describe the algorithm as the spike reads it, never the shipped product, and they support no claim about any product. The references are: Pixel Snapper `ae20461f`, pixeldetector `6267db44`, unfake.js v1.4.0 `66368689` (its GPL-licensed quantizer is replaced by a deterministic k-means), Retro Diffusion pixel-art-fixer Standard `ef376e57`, and PixelOE contrast downscale `7ce444b3`, plus the area and nearest baselines. Their tests are in `test/reference-tools.test.js`.

This is not a methodology §12 comparison: no tool was captured, the cases are the in-sample development matrix, and the caveats below apply to every number.

- The references run at their documented palette caps (Pixel Snapper 16, unfake 32, Retro Diffusion 16). The prototype, PixelOE, pixeldetector and the baselines are uncapped or `auto`, and `emSnap`'s 0.05 snap tolerance favours uncapped outputs on 25–60-colour fixtures.
- `oursBest` is an oracle (the best candidate chosen with the truth), not something a user gets.
- Native mode: each discovered-size method runs at its own detected size and is scored only when that size equals the truth. The prototype's native size comes from a blind `analyze()` with no target, like the references.
- Target mode: every method runs at the true W×H. A discovered-size output is centre-sampled to the target and labelled "adapted"; that adapter is not the tool's own target support.
- `em` scores alpha and only cases without a baked-in background (no reference removes backgrounds); `emIn` imposes the truth alpha mask and runs on all cases. Trim and Clean cases are skipped.

Run: `node scripts/compare.mjs` (one seed), 450 synthetic cases on engine `0.5.0`, 2,668 s on one machine, 0 errors for every method. **OBSERVED, local-only, not rights-cleared** (the matrix includes the local-only crops and sprites), in-sample, exploratory. An earlier run on the same day, before D39–D40 were final, gave the same picture (ours size-exact 0.72, stratum I target `emIn` 0.85).

**Native mode: share of cases where the method's own detected size equals the true size.**

| Stratum | Cases | Ours | Ours ±1 | Pixel Snapper ref | pixeldetector ref | unfake ref | Retro Diffusion ref |
|---|---|---|---|---|---|---|---|
| all | 450 | **0.736** | 0.844 | 0.100 | 0.267 | 0.200 | 0.233 |
| G | 90 | 1.000 | 1.000 | 0.000 | 1.000 | 0.911 | 0.956 |
| I | 210 | **0.710** | 0.790 | 0.133 | 0.143 | 0.033 | 0.071 |
| M | 120 | **0.625** | 0.833 | 0.133 | 0.000 | 0.000 | 0.033 |
| B | 30 | **0.567** | 0.800 | 0.033 | 0.000 | 0.033 | 0.000 |

On the no-grid scenes, the share of cases where a method asserted a lattice was 0 for ours, 1.0 for the Pixel Snapper, pixeldetector and unfake references, and 0.75 for the Retro Diffusion reference.

**Target mode: median `emIn` at the true W×H** (truth alpha imposed; all cases; discovered-size outputs adapted by centre sampling).

| Stratum | Cases | Ours (recommended) | Ours best (oracle) | Pixel Snapper ref | pixeldetector ref | unfake ref | Retro Diffusion ref | PixelOE ref | Area | Nearest |
|---|---|---|---|---|---|---|---|---|---|---|
| all | 450 | **0.939** | 0.958 | 0.567 | 0.844 | 0.668 | 0.846 | 0.846 | 0.667 | 0.929 |
| G | 90 | 1.000 | 1.000 | 0.783 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| I | 210 | 0.896 | 0.913 | 0.534 | 0.793 | 0.559 | 0.809 | 0.844 | 0.606 | **0.938** |
| M | 120 | **0.817** | 0.823 | 0.514 | 0.775 | 0.595 | 0.734 | 0.622 | 0.530 | 0.792 |
| B | 30 | **0.804** | 0.816 | 0.526 | 0.764 | 0.587 | 0.642 | 0.722 | 0.607 | 0.782 |

Per preset, the nearest baseline beats the recommended candidate on the smooth groups (`bilinear-x8` 0.914 against 0.860, `bilinear-x8.37` 0.978 against 0.860, `bicubic-x8-clean` 0.961 against 0.746) and on `jpeg-heavy` (0.931 against 0.883), and the pixeldetector reference beats it on `gemini-like` (0.888 against 0.828). Counting cases where a method beats the recommended candidate by more than 0.02 `emIn`, the nearest baseline wins 156 and loses 115 of 450; every reference loses more cases than it wins. Median time per case: ours 219 ms, Pixel Snapper ref 222 ms, pixeldetector ref 61 ms, unfake ref 375 ms, Retro Diffusion ref 1,228 ms, PixelOE ref 15 ms.

**Reading.** On these in-sample cases the prototype found the true native size far more often than the references and was the only method that asserted no lattice on the no-grid scenes. At the true size it is ahead on M and B and behind the plain nearest baseline on I, where the nearest baseline is given the true size and a clean, noise-free upscale and keeps every colour. The palette caps (above) depress the Pixel Snapper, unfake and Retro Diffusion reference scores relative to uncapped methods, so the gaps to those references overstate any real difference.

**Private AI samples, native size per method** (OBSERVED, local-only, not rights-cleared). "Pitch estimate" is this review's own in-sample, no-reference estimate ([artifact characterization §1.1](../research-spikes/evaluation/ai-artifact-characterization.md#11-measured-local-real-samples-local-measured)), not ground truth. For `ai-wizard` the prototype reports no grid, so 64×64 is the raster-route target, not a detected size.

| Sample | Pitch estimate | Ours | Pixel Snapper ref | pixeldetector ref | unfake ref | Retro Diffusion ref |
|---|---|---|---|---|---|---|
| `gpt-oni` | 125.9×116.8 | 126×116 | 127×121 | 418×418 | 124×119 | 125×125 |
| `gemini-mage` | 146.2×143.5 | 146×144 | 152×146 | 1024×683 | 149×146 | 152×152 |
| `gpt-forest` | 249.9×143 | 249×141 | 270×158 | 418×235 | 238×134 | 836×471 |
| `unk-dungeon` | 241.1×177.8 | 245×176 | 239×179 | 256×192 | 255×192 | 259×194 |
| `unk-coat` | 61.2×64.2 | 60×64 | 62×64 | 467×467 | 62×65 | 62×62 |
| `ai-wizard` (no-grid control) | none | none (64×64 raster) | 202×202 | 341×341 | 40×40 | 341×341 |

### Golden-change record entry for `0939adc`

See the [golden-change record](#golden-change-record): additions only.

### Limitations found this round

1. **Palette fidelity is now the largest measured loss** (`OD-007`, `EX-007`). The Ward merge (τ_merge 0.045) collapses true colours on clean smooth upscales: `local-tileset` goes from 38 to 7 colours. The palette stage costs 0.12–0.17 `emSnap` on the clean smooth presets. Every τ_merge change tried raised colour match but failed the defect ratchet (D46). Ideas: emit the observed or medoid source RGB for non-pure cells; merge only spatially intermixed pairs; a two-sided gate.
2. **Heavily blurred pixel art** (nearest-neighbour ×8 with edge blur σ 3; 39 cases): the fallback fires and the recommendation moves from `smooth` to `clean`. 14 of 39 cases score worse, with group means −0.01 to −0.04 (`blur3-flat` −0.019, `blur3-gradient` −0.010, `blur3-keep-alpha` −0.039).
3. **Bilinear ×3 is below the method's scale floor.** On `local-portrait`, the fallback fires and within-12 falls from 94.4 % to 85.5 %.
4. **A wrong but coherent first-difference lattice can block the fallback** (`proc-ui` bilinear ×4).
5. **The seamless (step-ratio) veto on gradient-shaded art** is untested against smooth upscales; it is an open item.
6. **Analysis time** on eligible inputs is a median 1.75 × (worst 3–7 ×, still under 300 ms).
7. **Eyes that straddle output cells** are still lost by Clean (D42; two `it.fails` fixtures).
8. **The fallback does not run under `manualPeriod`.**
9. **No soft-alpha stratum.** GPT Image API output can now be truly transparent ([commercial tools refresh](../research-spikes/landscape/commercial-and-web-tools.md#2026-10-20-refresh)); `Binary(128)`, the background stage and Trim are untested on it.
10. **The building sprite at nearest-neighbour ×8.37** is still classed `none` (pre-existing).

## Benchmark headline (2026-10-19 run)

This section is the 2026-10-19 one-seed run on `pixilate-synth/2`, before D37–D46. The 2026-10-20 three-seed run is in [Bench, three seeds](#bench-three-seeds).

Score: `emSnapRec`, the share of output cells whose colour snaps (toe-corrected OKLab, within 0.05) to the ground-truth colour, counted only over cells whose true colour is still recoverable from the degraded input. In the all-family table the median and p10 exclude Trim cases, which are scored by `emSnap` [below](#trim-after-the-fix). "Recommended" and "best" are the medians of the recommended candidate and of the best candidate per case. The area-average and centre-sample nearest baselines do no background removal, so they run only on opaque or keep-alpha cases ("baseline cases"); the engine column is the engine's median on those same cases.

### By primary stratum, all 28 families (OBSERVED, local-only, not rights-cleared)

| Stratum | Cases | Families | Median | p10 | Recommended | Best | Rec. = best | Baseline cases | Engine | Area | Nearest |
|---|---|---|---|---|---|---|---|---|---|---|---|
| G exact grid | 96 | 28 | 1.000 | 1.000 | 1.000 | 1.000 | 100 % | 96 | 1.000 | 1.000 | 1.000 |
| I interpolated grid | 126 | 28 | 0.993 | 0.099 | 0.973 | 0.993 | 60 % | 42 | 0.989 | 0.698 | 0.942 |
| M mixel (incl. 20 Trim cases) | 140 | 28 | 0.821 | 0.413 | 0.793 | 0.794 | 39 % | 40 | 0.777 | 0.743 | **0.836** |
| B background | 30 | 28 | 0.677 | 0.192 | 0.674 | 0.680 | 47 % | 10 | 0.788 | 0.676 | 0.716 |

All 392 synthetic cases: median 0.983, p10 0.327, recommended 0.956, best 0.976, recommended equal to best in 61 % of cases, no errors.

### By primary stratum, procedural families only (OBSERVED, reproducible)

| Stratum | Cases | Families | Median | p10 | Baseline cases | Engine | Area | Nearest |
|---|---|---|---|---|---|---|---|---|
| G | 21 | 6 | 1.000 | 1.000 | 21 | 1.000 | 1.000 | 1.000 |
| I | 27 | 6 | 1.000 | 0.270 | 9 | 0.988 | 0.804 | 0.938 |
| M (Trim cases scored by `emSnap`) | 28 | 6 | 1.000 | 0.669 | 8 | 1.000 | 0.793 | 0.978 |
| B | 6 | 6 | 0.833 | 0.435 | 2 | 1.000 | 0.733 | 0.900 |

The procedural sprites are small and simple, so they flatter the engine; the gap to the nearest baseline on stratum M appears only with the local-only showcase and private sprites.

### No-grid scenes (OBSERVED, procedural)

| Scene | Stratum | Cases | Classed as grid | Grid candidate recommended |
|---|---|---|---|---|
| shapes | H | 1 | 0 | 0 |
| gradient | P | 1 | 0 | 0 |
| texture | P | 1 | 0 | 0 |
| waves | P | 1 | 0 | 0 |

False-grid rate in this run: 0 of 4. The committed baseline, which runs three seeds per scene, records 2 of 3 `shapes` seeds classed as a grid; G-RATCHET only stops that rate from rising.

### Trim after the fix

D33 (background-speck rule) and D34 (background before Trim on the raster route; no target hint under Trim) changed the Trim results:

| Measurement | Before | After |
|---|---|---|
| Committed `trim-subject` group, `emSnap` median (procedural, `test/baseline.json`) | 0.526 | 0.853 |
| Committed `trim-subject` group, IoU median | 0.573 | 0.928 |
| Bench `trim-subject`, all families, `emSnap` median / p10 (OBSERVED, local-only, not rights-cleared) | not re-run | 0.670 / 0.383 |
| Bench `trim-subject`, procedural only, `emSnap` median (4 cases) | not re-run | 0.822 |

The worst Trim cases are sparse near-white sparks (`proc-sparks` and the local `sparks` crop both score 0): their light features sit within the speck and background tolerances.

## Golden-change record

`test/baseline.json` is rewritten only by `node scripts/update-baseline.mjs`. The 2026-10-19 rewrite after D33–D35 changed these committed group medians:

| Group | Metric | Before | After | Explanation |
|---|---|---|---|---|
| `trim-subject` | `emSnap` / IoU / G8 recall | 0.526 / 0.573 / 0.625 | 0.853 / 0.928 / 0.671 | D33, D34 |
| `mixel-detail` | `emSnap` / IoU / `emSnapRec` | 0.986 / 0.998 / 0.998 | 0.988 / 1.000 / 1.000 | D33 (no regression) |
| `nonint-nn+cleanup` | `passT3` | 1.000 | 0.667 | `proc-1bit` seed 52 is a detection miss: classed `none`, so it takes the raster route; the output is identical with cleanup off (D35) |

The 2026-10-20 rewrite (`0939adc`, after `3896d49`) only **added** three groups from the new G-SMOOTH fixtures; no existing group value changed:

| Group | Cases | `emSnap` | IoU | G8 recall | `emOpaque` |
|---|---|---|---|---|---|
| `bilinear-x8` | 3 | 1.000 | 1.000 | 1.000 | 0.575 |
| `bilinear-x8.37` | 3 | 1.000 | 1.000 | 1.000 | 0.687 |
| `bicubic-x8-clean` | 1 | 1.000 | 1.000 | 1.000 | 0.063 |

`emOpaque` (exact RGB on opaque cells) stays low because `emSnap` allows a 0.05 snap; the gap is mostly the palette merge (INFERRED; see [limitations found this round](#limitations-found-this-round)).

## Private AI samples

These are local, gitignored files referenced only by opaque ID; they are not in the repository. The measured pitch comes from [AI artifact characterization §1.1](../research-spikes/evaluation/ai-artifact-characterization.md#11-measured-local-real-samples-local-measured). Generator labels are file metadata claims (signature not checked). All values are OBSERVED, local-only, not rights-cleared, and in-sample. Run: `analyze`, then `convert` at the suggested size with background `'auto'`, in one bench run on one machine (Node).

| Sample | Generator (file metadata claims, signature not checked) | Class | Suggested size | Measured grid | Error x / y | Output colours | Time |
|---|---|---|---|---|---|---|---|
| `gpt-oni` | OpenAI `gpt-image` 2.0, declared | `grid` | 126×116 | 125.9×116.8 | +0.08 % / −0.65 % | 26 | 1.2 s |
| `gemini-mage` | Google, declared; visible watermark declared, generic corner masked | `grid` | 146×144 | 146.2×143.5 | −0.12 % / +0.34 % | 43 | 2.9 s |
| `gpt-forest` | OpenAI `gpt-image` 2.0, declared | `grid` | 249×141 | 249.9×143 | −0.37 % / −1.40 % | 39 | 1.1 s |
| `unk-dungeon` | none | `grid` | 245×176 | 241.1×177.8 | +1.64 % / −1.00 % | 19 | 1.4 s |
| `unk-coat` | none | `grid` | 60×64 | 61.2×64.2 | −1.91 % / −0.37 % | 27 | 0.6 s |
| `ai-wizard` (no-grid control) | none | `none` | none | no stable pitch | n/a | 37 (raster route at 64×64) | 0.4 s |

A local PixelLab output exists for one sample. It was not captured under the competitor protocol (methodology §12), so it is not compared or scored here.

Target-size results (unblinded author-side visual review, measured before the D23–D36 revision and not re-measured; OBSERVED, local-only, not rights-cleared):

| Ratio of native subject to target | Example | Result |
|---|---|---|
| ≤ about 1.6× | `gpt-oni` → 64; `unk-coat` → 48/32 | Closed outline, 17–33 colours |
| About 2–2.5× | `gpt-oni` → 48/32; `gemini-mage` → 64/48 | Outline closed, some interior detail dropped, light speckle on busy textures |
| ≥ about 3× | any character sample → 16; `gemini-mage` → 32 | Silhouette and main colour masses kept; most identifying detail lost |
| Scenes and tiles | `unk-dungeon` → 128×96 / 64×48 | Structure kept; floor texture flattens at 64×48 |

### Browser check and PixelLab round trips (2026-10-20)

OBSERVED, local-only, not rights-cleared. One Chromium build plus Node, at commit e62d112, with an unblinded author review.

**UI flow (testing to-do §3–§5).** These all behaved as specified, with no console errors:

- Required W×H gives `invalid-input` when empty or over 1024.
- "Use detected size" fills W×H only when clicked.
- Grid, Clean and Smooth candidates render, with Clean preselected as recommended.
- Background `auto` with Trim gives a filled sprite and a reported trim box.
- Converting again gives an identical canonical hash.
- Browser and Node PNGs were byte-identical on 3 of 3 checked cases.
- A JPEG re-save of `gpt-oni` still gave the same 126×116 grid. JPEG blocking was detected, not mistaken for the grid, and with metadata stripped the generator reads "unknown".
- `gemini-mage`'s declared visible watermark gave the generic corner mask.
- A fully transparent input with Trim gave `empty-visible-region`.

**Round trips of local PixelLab sprites** (124–128 px), converted back to native size with `fit: 'stretch'`:

| Upscale | Exact pixels |
|---|---|
| Nearest-neighbour ×8 | 100 % on 4 of 4 |
| Nearest-neighbour ×8.37 | 100 % on 3 of 4; the building sprite was classed `none` (89 %) |
| Bilinear ×8 and ×8.37 | 0–89 %; grid not detected in 7 of 8 cases (one `weak` on a wrong lattice) |

**Visual review of real samples.**

- Native-size output was clean on all five gridded samples.
- With background `auto` and Trim, 64 and 48 px sprites were good and 32 px readable.
- Weak points:
  - Faces at 24 px and below.
  - Eyes lost by Clean on `unk-coat` at 32 px.
  - Clean's outline rebuild turned a thin silver staff black.
  - Scenes at strong reductions, where Smooth beat the recommended Clean.
  - With default options (no background removal or Trim), sprites stay small in the canvas and degrade at small targets.

These items are now in [testing to-do §8](../planning/testing-todo.md#8-algorithm-work).

## Fixes found by testing

Each row was found by a test, a review, or visual inspection, and each fix has a regression test. Details are in the design Deviations.

| Problem | How it was found | Fix |
|---|---|---|
| Raw harmonic sum picked 3–4× the true period | Grid tests | Whitened line spectrum (D6), octave guard (D7) |
| Smooth periodic fields passed as grids | Grid tests and the no-grid control | Cell-step-ratio gate (D8) |
| Noisy black outlines split into 3 palette entries | Cell builder tests | Toe-corrected lightness for all comparisons (D1) |
| Background `'auto'` keyed out opaque tiles and 1-bit art | Harness | Floating-subject check (D16) |
| Close glow ramps merged; sparks lost | Harness | Pure-cell protection and exact-palette rule (D13, D14) |
| Target-size reduction gave blobs and fragmented strands | Author visual review | Coverage- and salience-aware `reduceToTarget` (D17) |
| Light subject pixels deleted as "shadow" on `gpt-oni` | Author visual review | Shadow allowance reverted; real-sample guards (D15) |
| Adaptive merge radius bloated real palettes | Author check of real colour counts | Reverted (D19) |
| Painted checkerboards left fully opaque | Benchmark worst cases | Chroma-weighted checker match and straddle rule (D20) |
| Seam metric ignored the elastic cuts | Bisecting a ratchet move | Metric fixed |
| Malformed PNG palettes, colour-index overflow, empty solid images, unbounded inputs | Code review | D22 |
| Missing size validation, silent defaults, hidden-RGB sensitivity, unreported caps | Contract probes | D23–D32 |
| Near-background specks widened the Trim box; raster-route Trim ignored the background | `trim-subject` ratchet | Speck rule (D33); background before Trim (D34) |
| Clean broke 1-bit and UI strokes at stroke ends | G-TRAP (Clean profile) | Stroke ends left alone; relative Clean gate (D35) |
| Watermark handling used a pixel test and vendor mark geometry | Compliance review | Generic corner mask only when declared (D36) |
| Bilinear upscales of true pixel art not detected (7 of 8 round trips) | Browser check and PixelLab round trips | Smooth-upscale presets and G-SMOOTH (D37); second-difference fallback (D38, D39, D41); cell deconvolution (D40) |
| 2-px art detected at half the requested cell count | Benchmark cases (`mc-face64`) | Octave lock (D44) |
| Clean lost eyes and blackened a thin staff | Author visual review | Orphan coverage rule (D42); thin-protrusion outline skip (D43) |

## Known limitations

1. **Detection misses fall back to the raster route.** For example, `proc-1bit` under a non-integer nearest-neighbour upscale (seed 52) is classed `none` and converted approximately.
2. **The nearest baseline beats the engine on stratum M** over all families (0.84 against 0.78 on 40 baseline cases; OBSERVED, local-only, not rights-cleared), most clearly on `gemini-like` (0.94 against 0.78); `jpeg-heavy` in stratum I shows the same pattern (0.92 against 0.75). On the local sprites the engine's mixel handling is not yet better than a plain centre sample. The 2026-10-20 experiments point to palette merging, not the cell estimator: forcing true lattices left M unchanged, and centre-weighted estimators scored lower (D46).
3. **Bicubic ×8 upscales score low** (`bicubic-x8` median 0.10 over all families and 0.18 procedural, against a nearest baseline of 0.53 and 0.76). The worst cases are classed `none` or locked to a wrong lattice. The 2026-10-20 fallback (D38) does not fire on this noisy, textured preset; the clean bicubic preset `bicubic-x8-clean` is recovered.
4. **Trim is weaker on near-white sparks**, whose light features fall within the speck and background tolerances.
5. **Large reductions (≥ about 3×) lose identity** (OBSERVED, local-only, not rights-cleared). A real fix probably needs a part-aware method, outside a deterministic v1.
6. **No real samples from Grok, Midjourney, Flux, Stable Diffusion, Ideogram, Recraft or others.** Provenance handling for them is unverified on real files; [input provenance signals](../research-spikes/algorithms/input-provenance-signals.md) keeps no per-vendor catalogue. The download plan in [AI artifact characterization §4](../research-spikes/evaluation/ai-artifact-characterization.md#4-real-sample-sourcing-plan-do-not-download-until-approved) is pending permission.
7. **Real painted checkerboards are unmeasured.** White or grey subject ink identical to a checker colour is still removed.
8. **Ground shadows are kept**, a deliberate choice; synthetic presets whose ground truth excludes shadows score lower for it.
9. **Mixed-scale images** (subject and background on different grids) get one grid.
10. **WebP, AVIF and GIF** decode through the browser canvas, which is not guaranteed deterministic, and they do not work in Node.
11. **Inputs are capped at 16.7 MP and targets at 1024 px per side.**
12. **Limitations found on 2026-10-20** (palette collapse on smooth upscales, blurred art, bilinear ×3, soft alpha and others) are listed in [limitations found this round](#limitations-found-this-round).

## Reproduce

```bash
cd prototype && npm install && npm test
```

```bash
cd prototype && npm run bench -- --seeds 1
```

The bench writes `results.json`, per-case images and `index.html` to the gitignored `.local/pixel-downscaler-bench/`. Rows that use showcase crops, private sprites or private AI samples run only when those gitignored files are present; without them the bench runs the procedural families only.

The three-seed run in the [2026-10-20 round](#2026-10-20-round) is `npm run bench -- --seeds 3`. The exploratory comparison is `cd prototype && node scripts/compare.mjs`, which writes to the gitignored `.local/compare/`.

After an intended behaviour change, rewrite the committed baseline, commit it on its own, and add a row to the [golden-change record](#golden-change-record):

```bash
cd prototype && node scripts/update-baseline.mjs
```
