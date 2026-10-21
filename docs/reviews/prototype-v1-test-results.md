# Prototype v1 test results

Last reviewed: 2026-10-20.

Purpose: record how the exploratory prototype in [`prototype/`](../../prototype/) (`OWN-002`) was tested, what it measured, where it still fails, and how to reproduce the numbers. Read it with the [algorithm design](../planning/prototype-algorithm-design.md), whose [Deviations](../planning/prototype-algorithm-design.md#deviations) table (D1–D55) holds the per-change evidence. The newest measurements are in [Round 3 (2026-10-20)](#round-3-2026-10-20); the earlier round of the same day is in [2026-10-20 round](#2026-10-20-round).

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## Evidence class

| Item | Value |
|---|---|
| Class | Exploratory, in-sample. Thresholds were tuned on the fixtures that measured them. |
| Held-out split | None |
| Blinded human panel | None |
| Confidence intervals | None (medians and p10 only; cases within a source family are not independent) |
| Decisions closed | None: no `OD-*` or `EX-*` item, no gate, no production default |
| Code revision | 2026-10-19 sections: working tree of 2026-10-19. [2026-10-20 round](#2026-10-20-round): commits `3896d49` (engine `0.5.0`, constants 25) and `0939adc` (baseline). [Round 3](#round-3-2026-10-20): bench at `93efc52` (engine `0.9.2`); comparison and real-sample timing at `fed010a` (engine `0.10.0`, constants 28) |
| Toolchain | Node 25.0.0, Vitest 4.1.12, synthetic fixture version `pixilate-synth/4` for round 3, `pixilate-synth/3` for the earlier 2026-10-20 round, `pixilate-synth/2` for the 2026-10-19 bench |
| Labels | VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, UNKNOWN as in the [research index](../research-spikes/README.md#how-to-read-the-evidence) |

Committed tests and the procedural benchmark rows are **OBSERVED** and reproducible from the repository. Every number that includes the gitignored showcase crops, private sprites or private AI samples is **OBSERVED, local-only, not rights-cleared**: it cannot be reproduced from the repository and backs no public claim. Nothing here is benchmark evidence under the [benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md).

## Summary

- **Round 3 (2026-10-20; OBSERVED, local-only, not rights-cleared, in-sample).** Three-seed bench: stratum I median 0.909 → 0.965, recommended equal to best 54 → 72 %, and on I the engine now edges the nearest baseline on the same cases (0.948 against 0.945); false grids 2 → 1 of 12. In the comparison at a common palette cap, ours leads overall (0.976) and on I and B, while the Real-PixelArt fixed-size reference leads on M (0.872 against 0.835). See [Round 3](#round-3-2026-10-20).
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

## Round 3 (2026-10-20)

Commits `1051a8d` to `fed010a` (engine `0.6.0` to `0.10.0`, constants 28, synthetic fixture version `pixilate-synth/4`). The design rows are D47–D55. Numbers that include the showcase crops, private sprites or private AI samples are **OBSERVED, local-only, not rights-cleared**; every number here is in-sample and exploratory. Most round-3 thresholds were tuned on the cases that measured them, with no hold-out (exceptions: the D48 family hold-out, D52's held-out no-grid seeds 11–40, and D55's noise-share family hold-out).

### What changed

| Change | Design row | Effect in one line |
|---|---|---|
| Evidence-based candidate recommendation | D47 | Recommended equal to best rises; no pixel changes |
| Smooth-upscale palette split gate (`kernelRms`) | D48 | True near colours of clean smooth upscales survive the merge |
| Gradient-background surface | D49 | Gradient backdrops can be removed |
| Trim basis `{ basis: 'cells' }` | D50 | Soft alpha no longer widens the Trim box by a cell |
| Soft-alpha stratum A and gradient presets | D51 | The bench can see soft model alpha and gradient backdrops |
| Chance-corrected edge support, admit and reject rules, count refinement, count-constrained `lockGrid` DP | D52 | More native sizes exact, fewer false grids |
| Review fixes (honest count-DP report, thin-strip surface refusal, deduped ids) | D53 | Report truthfulness; output changes only on thin strips |
| Shared analysis memo and edge-profile cache | D54 | About 2.2 × faster `convertCandidates`, byte-identical output |
| Noisy-grid Clean recommendation; Trim-cells fallback | D55 | Fewer speckles in the recommended real-sample outputs; one bench throw fixed |
| Rejected: τ_merge 0.03 with boundary snap, neighbour smoothing (`n3`) and orphan reassignment | — | Fails the committed and showcase ratchets; real palettes +37 to +85 % ([open question 5](../planning/prototype-algorithm-design.md#open-questions-and-next-experiments)) |

### Bench, three seeds, round 3

`npm run bench -- --seeds 3` at `93efc52` (engine `0.9.2`, before D55, which changes only recommendations and fixes the one throw below), `pixilate-synth/4`: 1,446 synthetic cases from 28 families (the same matrix as the [earlier 2026-10-20 run](#bench-three-seeds)), the bench-only soft-alpha and gradient groups, and 12 no-grid scenes. "Before" is the earlier 2026-10-20 three-seed run on engine `0.5.0`.

| Stratum | Cases | Median | p10 | Recommended | Best | Rec. = best | Baseline cases | Engine | Area | Nearest |
|---|---|---|---|---|---|---|---|---|---|---|
| G exact grid | 288 | 1.000 | 1.000 | 1.000 | 1.000 | 100 % | 288 | 1.000 | 1.000 | 1.000 |
| I interpolated grid | 648 | 0.909 → **0.965** | 0.216 → 0.216 | 0.900 → 0.960 | 0.915 → 0.965 | 44 → 77 % | 396 | 0.902 → **0.948** | 0.663 | 0.945 |
| M mixel (incl. 60 Trim cases) | 420 | 0.815 → 0.815 | 0.443 → 0.443 | 0.794 → 0.794 | 0.803 → 0.805 | 39 → 51 % | 120 | 0.715 → 0.715 | 0.673 | **0.760** |
| B background | 90 | 0.700 → 0.700 | 0.307 → 0.307 | 0.654 → 0.649 | 0.703 → 0.703 | 42 → 49 % | 30 | **0.812** | 0.665 | 0.687 |

All 1,446 synthetic cases: median 0.948 → 0.974, p10 0.417 → 0.424, recommended 0.922 → 0.953, best 0.935 → 0.960, recommended equal to best 54 → 72 %, 0 errors. On stratum I the engine now edges the nearest baseline on the same baseline cases (0.948 against 0.945); it still trails it on M.

| Group (90 cases) | Median before → after | Recommended | Nearest |
|---|---|---|---|
| `bilinear-x8` | 0.885 → 0.944 | 0.860 → 0.939 | 0.914 |
| `bilinear-x8.37` | 0.871 → 0.951 | 0.860 → 0.951 | **0.978** |
| `bicubic-x8-clean` | 0.768 → 0.777 | 0.745 → 0.777 | **0.961** |
| `bicubic-x8` (noisy) | 0.117 → 0.117 | 0.120 → 0.119 | **0.530** |
| `gemini-like` | 0.818 → 0.818 | 0.815 → 0.815 | **0.930** |
| `jpeg-heavy` | 0.845 → 0.845 | 0.852 → 0.852 | **0.949** |

**Extra groups (new; bench-only, reported apart from the strata).** Gradient backdrops (90 cases each): `gpt-gradient` median 0.844 (engine on baseline cases 0.782, nearest 0.721), `gemini-gradient` 0.835 (0.884, nearest 0.888). Soft alpha, full canvas (60 cases each): `soft-ref` 0.824, `soft-alpha` 0.824, `-premul` 0.785, `-webp` 0.799, `-erode` 0.752, `-matte` 0.744, `-glow` 0.733; nearest 0.698–0.756. With Trim, scored by `emSnap`: `+trim-cells` 0.712–0.768 (glow 0.610) against `+trim` 0.333–0.364 (glow 0.170). One case (`proc-sparks/soft-alpha+trim-cells/s2`) threw `empty-visible-region` at `93efc52`; D55 (2) fixes it.

**No-grid scenes (OBSERVED, procedural).** False grids 2 of 12 → 1 of 12 (one `shapes` seed `weak`); a grid candidate recommended 1 of 12 → 0 of 12. Too few cases for a rate claim.

### Comparison with reference re-implementations, round 3

`node scripts/compare.mjs --seeds 1` at `fed010a` (engine `0.10.0`), 450 synthetic cases, 0 errors for every method, run as 24 shards and merged. Five references were added, each a clean-room re-implementation in `test/reference-tools.js` of an MIT project at its pin: Real-PixelArt `17ce4875` (auto, and fixed-size `targetAxis`), proper-pixel-art `4de0dda5`, fast-pixelizer `5c041fce` (`snap`, 32 colours), breakfastz-pixel-truth `a1a3961c` (auto with 16 colours, and manual width = W) and PixelRefiner `c32659f3` (phase-aware grid search). Every reference is "a reference re-implementation of the tool at a pinned revision, not the tool itself", so results describe the algorithm as Pixilate's spikes read it and support no claim about any product. **OBSERVED, local-only, not rights-cleared** (the matrix includes local-only crops and sprites), in-sample, not a methodology §12 comparison.

Harness caveats, in addition to those of the [earlier 2026-10-20 comparison](#exploratory-comparison-with-reference-re-implementations):

- **Common cap.** `_kT` and `_k16` re-quantize every output, ours and the oracle included, with one shared deterministic k-means (`kmeansRGB`: k-means++ in RGB, seed 42, 15 iterations; skipped when the output already has ≤ K colours) to K = the truth palette size or 16, so palette caps stop deciding the ranking.
- **Mask before cap (`fed010a`).** `emIn` now imposes the truth alpha mask *before* the common cap, so a baked-in background can no longer take a k-means cluster. The previous run (`474f8a6`, engine `0.9.2`, cap before mask) gave lower capped scores for every method: at `_kT` (all / I / M / B), ours 0.955 / 0.909 / 0.835 / 0.787, Real-PixelArt fixed-size 0.930 / 0.902 / 0.852 / 0.782, nearest 0.905 / 0.891 / 0.761 / 0.649. Native-cap `emIn` is not affected.
- **Background off.** Ours' `emIn` is scored on a background-off run of the same candidate id, since over-removal would count and missed background would not; `emInOn` is the default background-on run. Median `emInOn` at `_kT` (all / I / M / B): 0.970 / 0.956 / 0.818 / 0.798 (native cap: 0.964 / 0.948 / 0.818 / 0.804).
- `oursBest` is an oracle (truth-selected candidate). Times per case are not comparable with earlier runs, because 24 shards shared one machine.

**Target mode, common cap K = truth palette size (`_kT`): median `emIn` at the true W×H.** Bold: best non-oracle method per stratum (ties at 1.000 on G are not marked).

| Method | all | G | I | M | B |
|---|---|---|---|---|---|
| Ours (recommended) | **0.976** | 1.000 | **0.956** | 0.835 | **0.856** |
| Ours best (oracle) | 0.984 | 1.000 | 0.967 | 0.854 | 0.860 |
| Real-PixelArt fixed-size ref | 0.963 | 1.000 | 0.929 | **0.872** | 0.830 |
| Nearest | 0.916 | 1.000 | 0.904 | 0.782 | 0.756 |
| Retro Diffusion ref | 0.838 | 1.000 | 0.788 | 0.703 | 0.634 |
| pixeldetector ref | 0.834 | 1.000 | 0.762 | 0.783 | 0.738 |
| PixelOE ref | 0.824 | 1.000 | 0.800 | 0.630 | 0.710 |
| fast-pixelizer ref | 0.812 | 1.000 | 0.725 | 0.752 | 0.561 |
| Real-PixelArt auto ref | 0.811 | 1.000 | 0.769 | 0.640 | 0.536 |
| PixelRefiner ref | 0.750 | 0.777 | 0.759 | 0.725 | 0.546 |
| breakfastz ref | 0.675 | 0.988 | 0.643 | 0.570 | 0.557 |
| proper-pixel-art ref | 0.674 | 0.887 | 0.633 | 0.621 | 0.537 |
| breakfastz manual-width ref | 0.668 | 0.912 | 0.636 | 0.573 | 0.578 |
| unfake ref | 0.664 | 1.000 | 0.569 | 0.605 | 0.587 |
| Area | 0.658 | 1.000 | 0.530 | 0.504 | 0.529 |
| Pixel Snapper ref | 0.569 | 0.783 | 0.530 | 0.519 | 0.526 |

**Native cap and K = 16** (median `emIn`, all / G / I / M / B).

| Method | Native cap | `_k16` |
|---|---|---|
| Ours (recommended) | **0.976** / 1.000 / **0.948** / 0.835 / 0.826 | **0.887** / 0.992 / **0.860** / 0.833 / 0.826 |
| Ours best (oracle) | 0.982 / 1.000 / 0.958 / 0.854 / 0.831 | 0.899 / 0.992 / 0.868 / 0.852 / 0.831 |
| Real-PixelArt fixed-size ref | 0.959 / 1.000 / 0.934 / **0.900** / **0.854** | 0.871 / 0.992 / 0.828 / **0.854** / **0.852** |
| Nearest | 0.929 / 1.000 / 0.938 / 0.792 / 0.781 | 0.818 / 0.992 / 0.806 / 0.714 / 0.768 |
| Retro Diffusion ref | 0.846 / 1.000 / 0.808 / 0.734 / 0.642 | 0.743 / 0.976 / 0.695 / 0.666 / 0.596 |
| pixeldetector ref | 0.844 / 1.000 / 0.793 / 0.775 / 0.764 | 0.760 / 0.992 / 0.665 / 0.731 / 0.740 |
| PixelOE ref | 0.846 / 1.000 / 0.844 / 0.622 / 0.722 | 0.745 / 0.992 / 0.743 / 0.603 / 0.681 |
| fast-pixelizer ref | 0.818 / 1.000 / 0.740 / 0.750 / 0.623 | 0.736 / 0.992 / 0.656 / 0.711 / 0.565 |
| Real-PixelArt auto ref | 0.831 / 1.000 / 0.792 / 0.664 / 0.564 | 0.713 / 0.992 / 0.696 / 0.604 / 0.483 |
| PixelRefiner ref | 0.768 / 0.778 / 0.793 / 0.745 / 0.614 | 0.699 / 0.775 / 0.698 / 0.677 / 0.546 |
| breakfastz ref | 0.680 / 0.988 / 0.649 / 0.564 / 0.557 | 0.680 / 0.988 / 0.649 / 0.564 / 0.557 |
| proper-pixel-art ref | 0.679 / 0.887 / 0.637 / 0.627 / 0.528 | 0.606 / 0.868 / 0.578 / 0.592 / 0.462 |
| breakfastz manual-width ref | 0.671 / 0.914 / 0.636 / 0.572 / 0.578 | 0.671 / 0.914 / 0.636 / 0.572 / 0.578 |
| unfake ref | 0.668 / 1.000 / 0.558 / 0.595 / 0.587 | 0.610 / 0.976 / 0.499 / 0.565 / 0.584 |
| Area | 0.667 / 1.000 / 0.606 / 0.530 / 0.607 | 0.605 / 0.992 / 0.487 / 0.468 / 0.567 |
| Pixel Snapper ref | 0.567 / 0.783 / 0.534 / 0.514 / 0.526 | 0.567 / 0.783 / 0.534 / 0.514 / 0.526 |

**Native mode: size-exact rate** (all / G / I / M / B). Ours 0.780 / 1.000 / 0.743 / 0.733 / 0.567 (earlier 2026-10-20 run: 0.736 / 1.000 / 0.710 / 0.625 / 0.567), within one cell 0.856. References: breakfastz 0.416 / 1.000 / 0.381 / 0.142 / 0.000; Real-PixelArt auto 0.324 / 1.000 / 0.209 / 0.100 / 0.000; fast-pixelizer 0.311 / 1.000 / 0.071 / 0.267 / 0.100; pixeldetector 0.267; proper-pixel-art 0.244; Retro Diffusion 0.233; unfake 0.200; Pixel Snapper 0.100; PixelRefiner 0.069 (all cases). **No-grid scenes** (4, one seed): a lattice was asserted by ours 0, Real-PixelArt auto 0.5, Retro Diffusion 0.75 and every other reference 1.0.

**Where a method beats ours at `_kT`** (cases won / lost by more than 0.02 `emIn`). Over all 450 cases only Real-PixelArt fixed-size wins more than it loses (135 / 88; on M 60 / 21). Nearest is 116 / 137, and every other reference loses more. Per preset (30 cases each; medians in brackets):

| Preset | Ours | Methods with more wins than losses |
|---|---|---|
| `gpt-image-like` | 0.788 | Real-PixelArt fixed-size 14 / 7 (0.861) |
| `gemini-like` | 0.873 | Real-PixelArt fixed-size 17 / 2 (0.939); pixeldetector 16 / 10 (0.870); nearest 14 / 8 (0.845) |
| `drift-heavy` | 0.848 | Real-PixelArt fixed-size 16 / 5 (0.825) |
| `mixel-detail` | 0.843 | Real-PixelArt fixed-size 13 / 7 (0.845) |
| `jpeg-heavy` | 0.883 | Real-PixelArt fixed-size 15 / 4 (0.962); pixeldetector 13 / 11; PixelOE 11 / 9; nearest 12 / 10 (0.898) |
| `fake-alpha` | 0.856 | Real-PixelArt fixed-size 12 / 8 (0.830) |
| `bicubic-x8` (noisy) | 0.369 | Real-PixelArt fixed-size 17 / 7 (0.396); nearest 16 / 9 (0.387); the Retro Diffusion, Real-PixelArt auto, fast-pixelizer, pixeldetector and PixelRefiner refs (0.344–0.390) |
| `bilinear-x8.37` | 0.951 | nearest 11 / 8 (0.959) |
| `bicubic-x8-clean` | 0.777 | Real-PixelArt fixed-size 18 / 4 (0.933); nearest 17 / 4 (0.923); Real-PixelArt auto 15 / 5 (0.923); PixelRefiner 14 / 5; Retro Diffusion 13 / 10 |

On `nonint-nn`, Real-PixelArt fixed-size is 3 / 2 with both medians at 1.000.

**Private AI samples at the pitch-estimate target** (OBSERVED, local-only, not rights-cleared): colours / noise orphans (`score.mjs`) of our recommended output against the Real-PixelArt fixed-size reference, which does no palette reduction.

| Sample | Target | Ours | Real-PixelArt fixed-size ref |
|---|---|---|---|
| `gpt-oni` | 126×117 | `clean` 27 / 72 | 2,628 / 394 |
| `gemini-mage` | 146×144 | `clean` 43 / 497 | 5,189 / 1,566 |
| `gpt-forest` | 250×143 | `clean` 36 / 306 | 24,186 / 3,611 |
| `unk-dungeon` | 241×178 | `clean` 19 / 365 | 6,455 / 1,471 |
| `unk-coat` | 61×64 | `clean` 22 / 58 | 519 / 269 |
| `ai-wizard` (no-grid control) | 64×64 | `smooth` 37 / 300 | 3,034 / 478 |

Native sizes of the older references are unchanged from the [earlier table](#exploratory-comparison-with-reference-re-implementations). Real-PixelArt auto gave 120×118, 145×144, 250×142, 244×183 and 61×63 on the gridded samples and 1024×1024 on `ai-wizard`.

### Real-sample timing and noise after D54–D55

OBSERVED, local-only, not rights-cleared; Node on one machine; `convertCandidates` at the pitch-estimate target; warm median of 3 runs after one cold run. Engine `0.10.0` against engine `0.5.0` (the earlier 2026-10-20 round): `gpt-oni` 857 → 409 ms, `gemini-mage` 1,658 → 666, `gpt-forest` 1,300 → 753, `unk-dungeon` 1,036 → 526, `unk-coat` 349 → 167, `ai-wizard` 236 → 160 (median 2.0 ×). D54 alone measured about 2.2 × in its row (for example `gpt-oni` 937 → 420 ms, `gemini-mage` 1,782 → 795 ms); D52 added a little analysis time.

Noise orphans of the recommended output at the same target, before D55 (`474f8a6`) → after: `gemini-mage` 733 (`grid`) → 497 (`clean`), `gpt-forest` 1,470 (`grid`) → 306 (`clean`), `unk-coat` 82 (`grid`) → 58 (`clean`). `gpt-oni` (72), `unk-dungeon` (365) and `ai-wizard` (300) were already `clean` or `smooth` and are unchanged. Engine `0.5.0` gave 62, 359, 306, 219, 58 and 300 on the same settings (`gpt-oni`, `gemini-mage`, `gpt-forest`, `unk-dungeon`, `unk-coat`, `ai-wizard`), so `gpt-oni`, `gemini-mage` and, at this target, `unk-dungeon` are still noisier than before round 3. D55's own measurement at the suggested sizes is in its row.

### Limitations found in round 3

1. **The Real-PixelArt fixed-size reference still leads on stratum M** in every palette mode (`_kT` 0.872 against 0.835, 60 wins and 21 losses of 120) and on B at native cap and K = 16. Its count-constrained DP was adopted only as a fallback (D52); as the full lock lattice it measured 22 cases worse and 42 better.
2. **Nearest leads on `bilinear-x8.37` and `bicubic-x8-clean`** (bench 0.978 and 0.961 against 0.951 and 0.777; `_kT` 0.959 and 0.923 against 0.951 and 0.777), where it is given the true size and a clean upscale.
3. **The `gemini-mage` and `gpt-oni` Clean candidates are noisier than before D52** (noise orphans 497 against 359, and 72 against 62, on engine `0.5.0`). INFERRED cause: the D52 count-DP fallback shifts parts of their lattices by about one cell.
4. **White-on-white sprites need an explicit key.** The suspected background leak was investigated and is not a bug: background `'auto'` removes subject cells whose colour is within its tolerance of the background, such as near-white sparks on white (OBSERVED, procedural).
5. **`proc-icon/fake-alpha` keeps a checker patch** after background removal (OBSERVED, procedural).
6. **Noisy `bicubic-x8` is unchanged** at 0.117 (nearest 0.530).
7. **In-sample tuning.** Most round-3 thresholds have no hold-out; the exceptions are named at the top of this section.

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

The round-3 rewrite (2026-10-20, after `59471c1`–`8b03499`, D47–D54) changed these committed group medians. D47, D53 and D54 change no pixel; D48–D51 left the committed groups unchanged; every change below is D52 unless noted (OBSERVED, procedural, in-sample):

| Group | Metric | Before | After | Explanation |
|---|---|---|---|---|
| `nonint-nn` | `passT2` / `passT3` | 0.833 / 0.833 | 1 / 1 | `proc-1bit` admitted by edge support |
| `nonint-bilinear` | `passT2` / `passT3` | 0.667 / 0.667 | 0.833 / 0.833 | count refinement |
| `jpeg-heavy` | mean ΔE / `passT2` / `passT3` | 0.00374 / 0.833 / 0.833 | 0.00307 / 1 / 1 | count refinement |
| `fake-alpha` | `noiseDelta` | 0.5 | 4.5 | **attributed regression**: `proc-sparks` none → weak (admit rule); its `emSnap` 0.096 → 0.300, G8 0.294 → 0.706, doubles 10 → 0, noise −1 → 8 |
| `fake-alpha` | seam p95 / scale error / `phaseShifted` | 0.265 / 0.00118 / 0 | 0.232 / 0.00106 / 1 | same case |
| `bicubic-x8` | `emSnap` / IoU / mean ΔE | 0.197 / 0.328 / 0.721 | 0.344 / 0.412 / 0.613 | D49 gradient surface (1 case) and D52 |
| `nonint-nn+cleanup` | `emSnap` / `passT3` / seam p95 | 0.985 / 0.667 / 0.040 | 1 / 1 / 0.053 | the D35 detection miss (`proc-1bit` seed 52) is now found; seam p95 rises with the recovered lattice |
| `no-grid/shapes` | `falseGrid` | 0.667 | 0.333 | D52 reject rule |

The local showcase baseline (gitignored) moved 23 values: `bilinear-x8` and `bilinear-x8.37` improved (D48: `emSnap` 0.841 → 0.918 and 0.841 → 0.877, G8 0.981 → 1), and `trim-subject` `emSnap` 0.492 → 0.479 is the attributed D52 count-DP move on `pip` (noise 14 → −4, doubles 0.48 → −0.32).

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
12. **Limitations found on 2026-10-20** (palette collapse on smooth upscales, blurred art, bilinear ×3, soft alpha and others) are listed in [limitations found this round](#limitations-found-this-round); round-3 limitations are in [Limitations found in round 3](#limitations-found-in-round-3).

## Reproduce

```bash
cd prototype && npm install && npm test
```

```bash
cd prototype && npm run bench -- --seeds 1
```

The bench writes `results.json`, per-case images and `index.html` to the gitignored `.local/pixel-downscaler-bench/`. Rows that use showcase crops, private sprites or private AI samples run only when those gitignored files are present; without them the bench runs the procedural families only.

The three-seed runs are `npm run bench -- --seeds 3`. The exploratory comparison is `cd prototype && node scripts/compare.mjs`, which writes to the gitignored `.local/compare/`; it can run as shards (`--shard k/n --budget s`, cached per case) and then merge (`--merge`), and `--real-only --filter <id>` runs one private sample.

After an intended behaviour change, rewrite the committed baseline, commit it on its own, and add a row to the [golden-change record](#golden-change-record):

```bash
cd prototype && node scripts/update-baseline.mjs
```
