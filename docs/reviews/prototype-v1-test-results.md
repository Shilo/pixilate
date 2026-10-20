# Prototype v1 test results

Last reviewed: 2026-10-19.

Purpose: record how the exploratory prototype in [`prototype/`](../../prototype/) (`OWN-002`) was tested, what it measured, where it still fails, and how to reproduce the numbers. Read it with the [algorithm design](../planning/prototype-algorithm-design.md), whose [Deviations](../planning/prototype-algorithm-design.md#deviations) table (D1–D36) holds the per-change evidence.

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## Evidence class

| Item | Value |
|---|---|
| Class | Exploratory, in-sample. Thresholds were tuned on the fixtures that measured them. |
| Held-out split | None |
| Blinded human panel | None |
| Confidence intervals | None (medians and p10 only; cases within a source family are not independent) |
| Decisions closed | None: no `OD-*` or `EX-*` item, no gate, no production default |
| Code revision | Working tree of 2026-10-19; for the commit, see `git log` |
| Toolchain | Node 25.0.0, Vitest 4.1.12, synthetic fixture version `pixilate-synth/2` |
| Labels | VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, UNKNOWN as in the [research index](../research-spikes/README.md#how-to-read-the-evidence) |

Committed tests and the procedural benchmark rows are **OBSERVED** and reproducible from the repository. Every number that includes the gitignored showcase crops, private sprites or private AI samples is **OBSERVED, local-only, not rights-cleared**: it cannot be reproduced from the repository and backs no public claim. Nothing here is benchmark evidence under the [benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md).

## Summary

- **Committed tests.** 238 Vitest tests pass in the working tree. A fresh copy of the tracked files without `.local/` passes 214 and skips 24 local-only tests, with 0 failures (OBSERVED, 2026-10-19).
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
| Committed gates | G-CONTRACT (exact size, binary alpha, byte-identical repeat runs); G-EXACT (100 % exact on clean nearest-neighbour upscales); G-TRAP (small-feature recall ≥ 0.95 on procedural cleanup traps with cleanup off); G-TRAP (Clean profile), relative: against cleanup off on the same seed and input, Clean may not lose recall (tolerance 0.01) or add line breaks; G-RATCHET against `test/baseline.json` (procedural cases only) | `test/regression.test.js` |
| Local suites | Skipped when the gitignored files are absent: a showcase ratchet against a local baseline; grid counts within ±2 % of the measured pitch; the no-grid control classed `none`; background guards on `gpt-oni`, `gemini-mage` and `unk-coat` | `test/regression.test.js`, `test/cleanup.test.js`, `test/grid.test.js`, `test/detect.test.js` |
| Synthetic benchmark | 396 cases, one seed: 392 synthetic cases from 28 sprite families (6 committed procedural, 18 local-only showcase crops, 4 local-only private sprites) under the [degradation presets](../research-spikes/evaluation/ai-artifact-characterization.md) and cleanup variants, plus 4 procedural no-grid scenes; scored with the [quality metrics](../research-spikes/evaluation/pixel-art-quality-metrics.md) | `npm run bench -- --seeds 1` (writes to the gitignored `.local/pixel-downscaler-bench/`; 258 s on one machine) |
| Visual review | The authors inspected (unblinded) contact sheets of the private samples at native size and at 64/48/32/16 px before the D23 revision | Gitignored `.local/` sheets |
| Browser | Dev server in one Chromium build: one private sample loaded through the file input; report and download checked; no console errors; output hash equal to the Node run (OBSERVED, local-only) | Manual, 2026-10-19 |
| Internal review | Design and code review findings, applied with regression tests | [Algorithm design](../planning/prototype-algorithm-design.md#deviations) |

## Benchmark headline

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

## Known limitations

1. **Detection misses fall back to the raster route.** For example, `proc-1bit` under a non-integer nearest-neighbour upscale (seed 52) is classed `none` and converted approximately.
2. **The nearest baseline beats the engine on stratum M** over all families (0.84 against 0.78 on 40 baseline cases; OBSERVED, local-only, not rights-cleared), most clearly on `gemini-like` (0.94 against 0.78); `jpeg-heavy` in stratum I shows the same pattern (0.92 against 0.75). On the local sprites the engine's mixel handling is not yet better than a plain centre sample.
3. **Bicubic ×8 upscales score low** (`bicubic-x8` median 0.10 over all families and 0.18 procedural, against a nearest baseline of 0.53 and 0.76). The worst cases are classed `none` or locked to a wrong lattice.
4. **Trim is weaker on near-white sparks**, whose light features fall within the speck and background tolerances.
5. **Large reductions (≥ about 3×) lose identity** (OBSERVED, local-only, not rights-cleared). A real fix probably needs a part-aware method, outside a deterministic v1.
6. **No real samples from Grok, Midjourney, Flux, Stable Diffusion, Ideogram, Recraft or others.** Provenance handling for them is unverified on real files; [input provenance signals](../research-spikes/algorithms/input-provenance-signals.md) keeps no per-vendor catalogue. The download plan in [AI artifact characterization §4](../research-spikes/evaluation/ai-artifact-characterization.md#4-real-sample-sourcing-plan-do-not-download-until-approved) is pending permission.
7. **Real painted checkerboards are unmeasured.** White or grey subject ink identical to a checker colour is still removed.
8. **Ground shadows are kept**, a deliberate choice; synthetic presets whose ground truth excludes shadows score lower for it.
9. **Mixed-scale images** (subject and background on different grids) get one grid.
10. **WebP, AVIF and GIF** decode through the browser canvas, which is not guaranteed deterministic, and they do not work in Node.
11. **Inputs are capped at 16.7 MP and targets at 1024 px per side.**

## Reproduce

```bash
cd prototype && npm install && npm test
```

```bash
cd prototype && npm run bench -- --seeds 1
```

The bench writes `results.json`, per-case images and `index.html` to the gitignored `.local/pixel-downscaler-bench/`. Rows that use showcase crops, private sprites or private AI samples run only when those gitignored files are present; without them the bench runs the procedural families only.

After an intended behaviour change, rewrite the committed baseline, commit it on its own, and add a row to the [golden-change record](#golden-change-record):

```bash
cd prototype && node scripts/update-baseline.mjs
```
