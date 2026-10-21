# Session Findings — 2026-10-20

## Purpose and scope

This document records the state reached in the 2026-10-20 session, so work can resume without re-reading the history. It continues the [2026-10-19 session findings](session-findings-2026-10-19.md), whose owner decisions and background still apply. It is a dated summary and resume point. Where it states a number, the canonical source governs: the [prototype design](prototype-algorithm-design.md#deviations) rows D37–D55 and the [test results](../reviews/prototype-v1-test-results.md) sections [Round 3](../reviews/prototype-v1-test-results.md#round-3-2026-10-20) and [2026-10-20 round](../reviews/prototype-v1-test-results.md#2026-10-20-round). The [Round 3 update](#round-3-update-2026-10-20) below is the current state; the later sections record the earlier round of the same day. Evidence labels follow the [research index](../research-spikes/README.md#how-to-read-the-evidence). Numbers that include local samples are OBSERVED, local-only, not rights-cleared, and all of them are in-sample.

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## Round 3 update (2026-10-20)

**Current state.** Engine `0.10.0`, constants 28, synthetic fixture version `pixilate-synth/4`. Round 3 landed D47–D55: the evidence-based recommendation (D47, `1051a8d`), the smooth-upscale palette split gate (D48, `c7ad1dd`), five clean-room references and the common-cap comparison (`9e4f228`), the gradient-background surface, Trim cell basis and soft-alpha stratum (D49–D51, `0da3d1d`), chance-corrected edge support, count refinement and the count-constrained DP (D52, `59471c1`), review fixes (D53, `2c4651d`), shared-work performance (D54, `8b03499`), the baseline rewrite (`93efc52`), the noisy-grid Clean recommendation and Trim-cells fallback (D55, `20dd9f7`), and the mask-before-cap fix in the comparison harness (`fed010a`). The owner approved the first designed MVP app (`OWN-007`, `474f8a6`), and work on it has started in `app/`. Nothing is pushed, and there is still no `LICENSE` file.

**Key numbers** (OBSERVED, local-only, not rights-cleared, in-sample; details in the [test results, Round 3](../reviews/prototype-v1-test-results.md#round-3-2026-10-20)):

- Three-seed bench: stratum I median 0.909 → 0.965; recommended equal to best 54 → 72 %; on I the engine now edges the nearest baseline on the same cases (0.948 against 0.945), but it still trails on M (0.715 against 0.760); false grids 2 → 1 of 12.
- Comparison at a common palette cap (`_kT`, truth palette size): ours 0.976 overall, ahead on I (0.956) and B (0.856). The Real-PixelArt fixed-size reference leads on M (0.872 against 0.835). Native size-exact: ours 0.780, the best reference 0.416. The references are re-implementations, not the tools.
- Real samples: `convertCandidates` is about 2 × faster than on engine `0.5.0`, and D55 cut the recommended output's noise orphans on `gemini-mage`, `gpt-forest` and `unk-coat`.
- Negative results: oracle cell colours lift M by only +0.004, and τ_merge 0.03 (with boundary snap, neighbour smoothing and orphan reassignment) fails the ratchets. The suspected background leak is by design (white-on-white needs an explicit key).

**Ranked next steps** (these replace the [earlier list](#ranked-next-steps); proposals, not decisions):

1. **Stratum M gap** (`OD-005`, `EX-009`). Neither the merge nor the cell estimate is the limit, so look at lattice placement, starting with when the count-constrained lattice should replace the elastic one.
2. **Live AI-image batch with rubric scores** (owner; testing to-do §2–§7). It calibrates the noise-orphan flag and the D55 noise share.
3. **Clean noise on `gemini-mage` and `gpt-oni` since D52.** Bisect the count-DP lattice shift.
4. **Hold-out split** before any further threshold tuning.
5. **Smooth presets where nearest still leads** (`bicubic-x8-clean`, `bilinear-x8.37`) and the noisy `bicubic-x8` preset.
6. **Owner questions:** the Trim basis default (D50), glow and shadow layers under `Binary(128)` (D51), the ambiguous-grid policy (`OD-004`), the licence, and pushing.
7. **Carried over:** the blurred-art discriminator, the bilinear ×3 floor, `proc-ui` ×4, eyes that straddle cells, large reductions, cross-engine determinism.


## What happened

1. A browser check and PixelLab round trips (recorded in the [test results](../reviews/prototype-v1-test-results.md#browser-check-and-pixellab-round-trips-2026-10-20)) showed that bilinear upscales of true pixel art were not detected as gridded.
2. A fix plan was written, challenged and agreed. One proposed fix, a centre-weighted cell-colour estimator, was refuted by experiment and dropped.
3. The engine changes were committed as `3896d49` (engine `0.5.0`, constants 25) and the baseline additions as `0939adc`. A UI evidence display and three research refreshes followed in the working tree.
4. A three-seed benchmark and an exploratory comparison against clean-room reference re-implementations of public tools were run; their tables are in the test results.

## State after the first 2026-10-20 round

- **Engine.** Smoothly upscaled pixel art is now recovered by a second-difference fallback (D38, D39, D41) and cell deconvolution (D40). An octave lock handles art detected at half the requested cell count (D44). The Clean profile keeps compact high-coverage features such as eyes (D42) and thin light protrusions (D43). The fallback, the deconvolution and the octave lock are inert on the real AI samples: their outputs are byte-identical.
- **UI.** A "sprite on a plain background" checkbox (background auto + Trim), "grid class:" wording, and the per-candidate grid evidence lines (D45). Engine defaults are unchanged.
- **Tests.** 267 pass with 2 expected failures (`it.fails`, open eye cases). A fresh clone passes 243, skips 24 local-only tests and has the same 2 expected failures. New gate G-SMOOTH; synthetic version `pixilate-synth/3`.
- **Research.** Dated 2026-10-20 refreshes of the [state of the art](../research-spikes/algorithms/state-of-the-art.md#2026-10-20-refresh), the [open-source ecosystem](../research-spikes/landscape/open-source-ecosystem.md#2026-10-20-refresh) and [commercial and web tools](../research-spikes/landscape/commercial-and-web-tools.md#2026-10-20-refresh). No new literature; new MIT code with usable ideas (Real-PixelArt); GPT Image API output can now be truly transparent.
- **Not done.** Nothing is pushed. There is still no `LICENSE` file. No live AI-image batch with human rubric scores exists yet.

## Key findings

- **Smooth upscales (OBSERVED, local-only, not rights-cleared).** PixelLab bilinear round trips: lattice found in 8 of 8 (was 1 of 8); after deconvolution the round-trip median is 97.3 % of opaque pixels within 12/255. Nearest-neighbour round trips are unchanged.
- **The mixel gap is the palette, not the cell estimate (OBSERVED, mixed).** Forcing true lattices left stratum M unchanged, and centre-weighted estimators scored lower (D46). The Ward merge collapses true colours (`local-tileset` 38 → 7 colours on a smooth upscale), but every τ_merge change tried failed the defect ratchet.
- **Measured limits of the new path.** Heavily blurred pixel art flips the recommendation and loses slightly (14 of 39 cases worse); bilinear ×3 regresses; analysis takes a median 1.75 × longer on eligible inputs (under 300 ms).
- **Comparison (exploratory, not methodology §12).** Against reference re-implementations, the prototype found the exact native size most often and asserted no lattice on the no-grid scenes, where the references mostly did. The plain nearest baseline still beats it at the true size on the interpolated stratum. The caveats (palette caps, oracle candidate, in-sample cases, re-implementations rather than the tools) are in the [test results](../reviews/prototype-v1-test-results.md#exploratory-comparison-with-reference-re-implementations).

## Decisions taken this session

| Decision | Reason |
|---|---|
| Adopt the second-difference fallback only behind a ramp-share gate (≥ 0.15) and a coherence test | Keeps real AI samples, no-grid scenes and nearest-neighbour upscales byte-identical |
| Run cell deconvolution on second-difference lattices only | Non-`d2` outputs stay byte-identical; the measured gain is on smooth upscales |
| Keep the orphan coverage threshold at 0.5 | 0.3 added more than 10 % speckle; 0.4 up to 8.2 % |
| Reject centre-weighted estimators and every τ_merge change | Lower stratum-M scores, or a failed defect ratchet |
| Defer palette fidelity to its own round | It trades against palette size, an owner-visible property |

None of these closes an `OD-*` or `EX-*` item.

## Ranked next steps

Superseded by the [Round 3 update](#round-3-update-2026-10-20); kept as history. Ranked by expected value. Each maps to the [testing to-do §8](testing-todo.md#8-algorithm-work) and the design's [open questions](prototype-algorithm-design.md#open-questions-and-next-experiments).

1. **Palette fidelity (`OD-007`, `EX-007`).** Emit observed or medoid source RGB for non-pure cells, merge only spatially intermixed pairs, or use a two-sided gate. Accept only if stratum M closes the gap to the nearest baseline, the defect ratchet holds, and real native palettes stay within +20 %.
2. **Live AI-image batch with rubric scores (testing to-do §2–§7).** This calibrates the automatic flags and decides the recommendation questions. It is owner work.
3. **Smooth-path discriminators (`EX-005`, `EX-009`).** Use the kernel-fit residual to choose smooth versus clean on blurred art; set a scale floor below which the fallback does not fire (bilinear ×3).
4. **Remaining detection misses (`EX-005`).** The wrong first-difference lattice on `proc-ui` ×4, the seamless veto on gradient art, the second-difference profile under `manualPeriod`, and a chance-corrected edge-support confidence feature.
5. **Count-constrained DP for `lockGrid` (`EX-009`).** A direct swap candidate for the common `grid-locked` rows (Real-PixelArt idea, MIT).
6. **Soft-alpha stratum (`OWN-005`, `FR-011`).** A synthetic preset with soft model alpha, and tests of `Binary(128)`, the background stage and Trim on it.
7. **Clean eyes that straddle cells (`EX-011`).** The two open `it.fails` fixtures; a rule other than a lower coverage threshold.
8. **Carried over from 2026-10-19:** ambiguous exact grids (`OD-004`), large reductions (`EX-003`), the Clean topology guard (`EX-011`), cross-engine determinism (`DET-007`), and the owner actions (licence, push, competitor captures under methodology §12).

## How to resume

Follow [How to resume](session-findings-2026-10-19.md#how-to-resume) in the 2026-10-19 findings, reading this document instead of that one for the current state. This round's benchmark was `npm run bench -- --seeds 3`; `node scripts/compare.mjs` (from `prototype/`) runs the exploratory comparison into the gitignored `.local/compare/`.
