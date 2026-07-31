# Border-connected background and guarded cleanup spike

**Research date:** 2026-07-31
**Status:** proposed non-production research spike; no harness, dependency, default, or application implementation is authorized
**Evidence class:** public primitive documentation is `VERIFIED`; the combined pipeline and parameter choices below are `INFERRED` / `PROPOSED`; no result has been measured
**Decision links:** `OD-009`, `OD-010`, `EX-010`, `EX-011`, `AC-CLEAN-001`, `AC-BG-001`, `AC-BG-002`, `NFR-SEC-007`

## Executive result

The most useful follow-on from this review is a bounded comparison of deterministic background-mask primitives, not a claim of automatic subject understanding. The candidate family is:

1. estimate a background color and spread from a declared border sample;
2. create a color-distance mask using a named metric and explicit threshold semantics;
3. keep only candidate background regions connected to a declared image border under fixed connectivity;
4. report, but do not silently apply, optional component-size cleanup and outline/color repair.

This is a refinement of the existing `EX-010` and `EX-011` plan. It does not change the product conclusion that background removal is a separate alpha-changing stage, that semantic universal removal is impossible to promise, or that cleanup remains default-off and nonshipping until it earns evidence. The canonical RGBA/geometry Slice A still comes first.

The review also reinforces an existing planning rule: extraction, spatial reduction, palette mapping, cleanup, and presentation borders should be independently named stages. A fixed target ladder or a single “faithful” preset is not evidence that a resampling filter, quantizer, cleanup rule, or outline policy is universally appropriate.

## Public evidence and boundary

The following public documentation establishes available primitives, not Pixilate quality or determinism:

- OpenCV’s dated public shape-analysis reference documents connected-component labels, 4- or 8-way connectivity, and per-component statistics in [`connectedComponentsWithStats`](https://docs.opencv.org/4.13.0/d3/dc0/group__imgproc__shape.html) (`VERIFIED`, page reviewed 2026-07-31).
- OpenCV’s dated public k-means tutorial documents explicit cluster count, termination criteria, retry count, and initialization flags in `kmeans` ([OpenCV 4.12.0 k-means tutorial](https://docs.opencv.org/4.12.0/d1/d5c/tutorial_py_kmeans_opencv.html), `VERIFIED`, page reviewed 2026-07-31). Any strict palette experiment must pin these decisions; the API documentation does not establish cross-runtime identity.
- Pillow’s public `Image.resize` reference exposes independent target width/height, resampling choice, source box, and optional reduction behavior ([Pillow Image reference](https://pillow.readthedocs.io/en/stable/reference/Image.html), `VERIFIED`, page reviewed 2026-07-31). A named filter and target geometry remain recipe decisions, not a quality guarantee.
- The existing Pixilate algorithm spike already records border flood, connected-component rules, alpha handling, palette separation, and cleanup risks ([deterministic background removal](state-of-the-art.md#9-deterministic-background-removal), [cleanup and topology](state-of-the-art.md#10-orphan-cleanup-morphology-and-topology)). This document narrows an experiment; it does not add a new public claim.

No non-public material is cited, reproduced, or treated as benchmark evidence here. All algorithm combinations, formulas, thresholds, and promotion rules below require independent public validation and rights-cleared fixtures before they can support a product statement.

PNG and compositing standards remain the authority for transparent-pixel and compositing semantics, not a library’s preview behavior ([PNG Third Edition](https://www.w3.org/TR/png-3/), [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/)).

## Secondary staged-processing disposition

The reviewed workflow also suggests three bounded planning controls, but none is a new product decision:

- **Known-layout extraction (`INFERRED`):** a declared row/column sheet layout is useful for controlled fixtures and the benchmark’s `S` spritesheet stratum. It is not automatic sheet discovery and does not cover gutters, offsets, irregular cells, partial frames, or mixed scales. Keep batch/animation and shared sequence behavior outside T1 unless a later scope decision promotes them.
- **Independent target generation (`INFERRED`):** deriving several target sizes from one canonical source is a useful evaluation schedule, but each target can drift in palette, edge position, and thin-feature survival. A future batch study should compare independent target recipes with explicitly shared analysis/palette/grid locks; it must not infer that one target’s result proves another target’s quality.
- **Resize → palette → cleanup (`PROPOSED`):** these are separate ablations. Public APIs expose target size and resampling choices, while clustering APIs expose multiple convergence and initialization choices; neither establishes a Pixilate default or strict identity. The existing `EX-003`, `EX-007`, and `EX-011` reports remain the right decision owners.

## Research questions

### RQ-1: Does border-derived tolerance improve a flat-background mask?

Compare a user-selected exact/tolerance key with a border-derived estimate and spread. Measure whether adapting the threshold to border variation improves mask recall on mildly noisy or compressed backgrounds without increasing silhouette leakage. The estimate is useful only when the border is a representative background sample; that assumption must be visible and testable.

### RQ-2: Does border connectivity protect enclosed subject color?

Compare global matching with border-connected matching under both 4- and 8-connectivity. The expected semantic difference is that an enclosed region matching the background candidate remains subject when only border-connected regions are removed. The experiment must also show the converse: enclosed background holes remain unless a separately named hole policy is enabled.

### RQ-3: Can cleanup be separated from segmentation truth?

Measure component-size filtering, morphology, and outline/color repair as independent ablations. A mask should not be declared correct merely because a later cleanup pass makes a preview look tidier. Cleanup must report changed pixels, components, holes, topology, and palette effects, and remain off by default.

### RQ-4: Which failure boundary should the product expose?

Determine when the tool should return a mask with a warning, require an explicit seed/key, or refuse automatic removal. Important cases include foreground touching the border, a contaminated border sample, a subject color near the estimated background, gradients/textures, antialiased fringes, partial alpha, and no matching pixels.

## Candidate semantics

These are experiment contracts, not an implementation design.

### Common preconditions

- Input is a canonical RGBA8 buffer after orientation and before any dependent Trim calculation.
- Fully transparent pixels are normalized and excluded from RGB distance statistics, consistent with the canonical alpha policy.
- The stage returns a mask/alpha result and diagnostics at the original geometry. Resized-mask quality is a separate experiment.
- Every parameter that can change a pixel is serialized: color space/metric, sample region, estimator, spread statistic, threshold formula, inclusivity, connectivity, border selection, component predicate, hole policy, and repair policy.
- Work is bounded by pixels, labels, queue entries, and allocations. A deterministic budget failure is distinct from a host watchdog or user cancellation, per `NFR-SEC-007`.

### Candidate A: explicit key controls

Use a user-selected RGB/RGBA key with either exact equality or a declared tolerance. Compare global matching with border-connected matching. This is the control because it makes user intent explicit and exposes the semantic difference between “remove every match” and “remove only the exterior match.”

### Candidate B: border-derived color and spread

1. Select a deterministic border sample region, with a declared width and corner policy.
2. Estimate a center color with a robust statistic such as a per-channel median or a metric-space medoid.
3. Estimate sample spread with a declared robust statistic. Map spread to a bounded tolerance with a versioned, monotone rule and explicit minimum/maximum limits.
4. Mark pixels within the inclusive or exclusive distance threshold as candidate background.
5. Label candidate regions and retain only those connected to the selected border under 4- or 8-connectivity.
6. Convert retained exterior regions to transparent alpha while preserving enclosed candidate regions unless a separate hole policy is selected.

The estimator, spread-to-tolerance mapping, distance space, and clamps are the research variables. No numeric default is proposed from this spike.

### Candidate C: component and repair ablations

- **Component filter:** remove or retain foreground components according to a serialized area/location predicate. The predicate must be evaluated after segmentation and measured against protected-detail fixtures.
- **Neighborhood outlier filter:** a fixed-neighborhood rule may replace a local color outlier with an existing neighborhood representative. Treat this as a separate cleanup candidate: it is not component labeling, can remove intentional one-pixel structure, and must report alpha, topology, and palette effects.
- **Matte/edge repair:** optionally modify RGB near newly transparent pixels under a named policy. It is not part of mask truth and must be evaluated over black, white, gray, and checkerboard backgrounds.
- **Outline policy:** an optional style operation may strengthen a dark silhouette rim, but it must not be disguised as background detection. It can destroy intentional dark accents, create colors outside a supplied palette, and alter visible RGB while leaving alpha unchanged.
- **Presentation border:** a border added for export or preview is a separate canvas operation. It must not be conflated with segmentation, outline repair, or source-grid recovery.

## Rights-cleared experiment design

### Fixture strata

Use only project-authored procedural fixtures and assets with recorded redistribution rights, following the benchmark policy. The minimum matrix should include:

- uniform and mildly noisy flat backgrounds;
- smooth gradients and textured backgrounds;
- foreground colors equal or close to the background color;
- foreground touching each canvas edge;
- enclosed background holes and enclosed subject regions with background-like colors;
- disconnected shadows, highlights, thin features, and dark outlines;
- antialiased/compressed-looking fringes and partial-alpha edges;
- empty, all-matching, and no-matching masks;
- tiny images where the declared border sample overlaps or dominates the canvas;
- hidden RGB under alpha zero and the required compositing previews.

Add annotated masks with definite foreground/background and an uncertain boundary band. Do not turn annotator disagreement into false binary truth.

### Comparators and ablations

Run a bounded factorial or fractional-factorial screen, then one-factor ablations and a frozen validation comparison:

| Dimension | Candidate values | Required record |
|---|---|---|
| Key source | explicit, border-estimated | sample provenance and recipe field |
| Color metric | exact RGBA/RGB, declared encoded-color distance, declared perceptual distance | metric/version and threshold semantics |
| Threshold | exact, fixed tolerance, bounded spread-derived tolerance | numeric value/formula and inclusive boundary result |
| Connectivity | 4-way, 8-way | neighbor order and border seed order |
| Region policy | global, selected-border-connected, component predicate | kept/removed labels and hole behavior |
| Cleanup | none, component threshold, formal morphology/topology guard | changed pixels, components, holes, topology, palette result |
| Edge treatment | preserve, named matte repair, named outline style pass | before/after alpha/RGB and compositing results |

Do not combine every choice into one opaque preset. The purpose is attribution: which stage helped, which stage caused a regression, and which failure should be shown to the user.

### Metrics

Hard conformance and quality metrics must remain separate:

- deterministic mask/alpha hash and repeatability across the declared strict matrix;
- exact geometry preservation and serialized stage order;
- foreground/background precision, recall, and IoU on definite annotated regions;
- boundary precision/recall or boundary F-score with the uncertain band reported separately;
- halo and edge-color error after compositing over black, white, gray, and checkerboard backgrounds;
- protected feature recall, thin-line endpoint/junction survival, component and hole counts, and Euler characteristic where applicable;
- changed-pixel count and palette-contract violations after each cleanup/repair ablation;
- refusal/warning rate by failure stratum;
- peak memory, label/queue counts, and p50/p95 runtime, with deterministic work-budget outcomes separated from operational timeouts.

The benchmark’s existing background protocol already requires exact-vs-tolerance, global-vs-border-connected, connectivity, threshold-boundary, border-touching, hole, fringe, gradient, partial-alpha, and cleanup-threshold cases ([benchmark methodology §8.3](../evaluation/benchmark-methodology.md#83-background-removal)). Reuse that protocol rather than introducing an incompatible score.

## Expected failure taxonomy

| Condition | Expected behavior to test | Why it matters |
|---|---|---|
| Border sample is not background | warning or explicit-key requirement | the estimator has no reliable reference |
| Foreground touches the border | do not promise exterior separation; surface the ambiguity | border connectivity can classify the subject as exterior |
| Subject shares the candidate color | preserve only when connectivity/seed policy supports it; otherwise warn | color equality is not semantic ownership |
| Enclosed background hole | preserve by default; expose a separate hole rule | border-connected semantics are intentionally conservative |
| Gradient or textured background | compare tolerance candidates; allow refusal | a single center/spread may be insufficient |
| Antialiased/compressed fringe | measure matte/halo tradeoff; no silent repair | alpha and RGB have different truth semantics |
| Tiny legitimate feature | never infer noise from area alone | eyes, sparks, highlights, and endpoints can be one pixel |
| Hidden RGB under alpha zero | no effect on mask, Trim, palette, or visible output | prevents invisible data from changing identity |
| Empty or all-matching mask | typed result/warning and explicit user policy | avoids silently exporting a blank or full-frame subject |
| Large input or many labels | stable `algorithm-budget-exceeded` result | bounds denial-of-service and memory risk |

## Decision and promotion rules

This spike can provide evidence for `OD-010` only if the primitive semantics are exact and the failure taxonomy is complete. It can provide evidence for `OD-009` only if cleanup shows blinded benefit and protected-feature margins without breaking palette or topology contracts. Neither result may promote semantic automatic removal, a universal outline rule, or default-on cleanup.

The separate opaque presentation border sometimes used in export examples is out of scope for this mask study. If ever offered, it is an explicit export decoration whose dimensions and recipe stage are separate from exact target geometry. Likewise, static spritesheet extraction can remain a fixture or controlled-layout research input; it does not establish automatic sheet discovery or batch/animation support.

Promotion requires all of the following:

1. Slice A canonical RGBA/alpha semantics are accepted and the background stage is placed explicitly relative to Trim.
2. The corpus manifest, annotations, rights, source hashes, and split are frozen under the benchmark governance rules.
3. Every finalist has deterministic vectors, serialized parameters, exact connectivity/threshold behavior, bounded work, and cross-runtime hash evidence.
4. Mask, boundary, halo, protected-feature, topology, palette, runtime, and refusal results are reported by stratum rather than collapsed into one score.
5. The UI-facing behavior names assumptions and exposes preview/undo; it does not market a mask as universally correct.
6. Any dependency, coefficient, matrix, or asset has exact-version license, notice, patent, and redistribution review.

If these conditions are not met, retain explicit key/border-connected primitives as research-only options, keep cleanup off, and require user confirmation or refusal for ambiguous inputs.

## Planning disposition

- `EX-010`: add border-derived estimator/spread mapping as an ablation family beside exact key, fixed tolerance, border flood, and component rules. It does not replace explicit user seed/key controls.
- `EX-011`: evaluate component filtering and outline/matte operations as independent, opt-in transformations. Do not treat a visually cleaner preview as a segmentation result.
- `EX-003` / `EX-007`: keep spatial reduction and palette mapping as separate controls. A target ladder can be a convenient evaluation schedule, but it does not select Lanczos, k-means, or any cleanup rule for Pixilate.
- Phase 8 remains T2/nonshipping and does not block the narrower deterministic resize/pixelation core.
- No new open-decision ID is needed. The existing `OD-009` and `OD-010` owners and acceptance criteria are sufficient.

## Stop conditions

Stop the spike and record a refusal/fallback policy if any of the following holds:

- border-derived estimates do not beat a fixed explicit-key baseline on their intended flat/noisy stratum without unacceptable boundary regressions;
- connectivity choices cannot be made stable and explainable on enclosed-region and border-touching fixtures;
- cleanup improves an aggregate score only by deleting protected thin features or changing topology beyond the declared margin;
- any candidate requires a learned semantic model, remote service, copied source, uncleared asset, or unbounded operation;
- exact hashes, work-budget outcomes, or alpha behavior diverge across the approved strict matrix;
- the remaining benefit is aesthetic preference without a reproducible, rights-cleared evaluation protocol.

## Current conclusion

**INFERRED:** border-connected background primitives are a credible, narrow research candidate for flat or near-flat backgrounds because connectivity makes an explicit semantic tradeoff visible. **UNKNOWN:** whether border-derived tolerance improves enough real inputs to justify an additional profile. **PROPOSED:** keep the experiment non-production, retain explicit user controls, separate mask truth from cleanup and outline styling, and defer any promotion until `EX-010`/`EX-011` evidence passes the existing gates.
