# Pixilate cross-spike synthesis

**Project:** Pixilate (working name; temporary and uncertain)  
**Research snapshot:** 2026-07-31  
**Decision status:** research synthesis, not an implementation specification  
**Addendum:** 2026-10-19 — owner decisions and prototype v1 findings ([2026-10-19 addendum](#2026-10-19-addendum-owner-decisions-and-prototype-v1))  
**Evidence convention:** **VERIFIED**, **CODE-DERIVED**, **OBSERVED**, **INFERRED**, and **UNKNOWN** retain the meanings in the [research index](README.md).

## Answer to the original product thesis

The central thesis is sound, with one necessary correction.

Pixilate can be a fully deterministic, browser-local, non-generative tool that accepts supported raster images, always produces an explicitly requested native size, treats full-canvas and visible-bounds sizing differently, applies exact palette contracts, and records a replayable recipe. Those are engineering invariants, not aesthetic guesses. The market survey found no clearly documented tool combining those contracts with grid recovery and an MIT-compatible local implementation path. **VERIFIED/INFERRED:** this is a credible product gap. ([commercial landscape](landscape/commercial-and-web-tools.md), [open-source landscape](landscape/open-source-ecosystem.md), [product contract](../planning/product-requirements.md))

The correction is that no deterministic algorithm can produce the uniquely “most accurate” pixel-art interpretation for every image, because that interpretation often is not encoded in the raster. A lone pixel can be noise or an eye; a border color can be background or subject; a repeated edge can be a pixel grid or texture. Exact-grid recovery, irregular mixel reconstruction, continuous-raster abstraction, and line preservation are different tasks with conflicting objectives. **VERIFIED/INFERRED:** the universal promise must be deterministic handling and exact constraints, not universal artistic correctness. ([algorithm limits](algorithms/state-of-the-art.md#why-a-universal-best-algorithm-is-impossible), [evaluation decision](evaluation/benchmark-methodology.md#executive-decision))

The strongest product statement available now is:

> For a supported input, pinned strict engine, and complete versioned recipe, Pixilate returns the exact requested geometry and identical canonical output pixels, or a stable typed error. It selects only among documented deterministic profiles, explains low-confidence fallbacks, and never silently changes size, crop, palette, alpha, cleanup, or background semantics.

The strongest quality statement is not yet available. The proposed AI-mixel route is an **INFERRED engineering hypothesis** until it beats simple and specialist baselines on a held-out, rights-cleared corpus and in blinded artist evaluation. ([mixel proposal](algorithms/state-of-the-art.md#55-candidate-ensemble-recommendation-for-mixels), [release gates](evaluation/benchmark-methodology.md#16-regression-thresholds-and-release-gates))

## Core feasibility verdict

| Capability | Feasibility | Evidence-backed conclusion |
|---|---|---|
| Exact independent output `W×H` | **High; lock now** | Rational source footprints, explicit fit/crop/pad, and caller-sized destination buffers make zero dimension error a hard invariant. ([geometry research](algorithms/state-of-the-art.md#22-exact-output-dimensions-are-a-hard-invariant), [requirements](../planning/product-requirements.md#9-exact-geometry-and-trim-semantics)) |
| `Trim` based on visible pixels | **High; lock semantics now** | Compute a deterministic alpha-threshold bounding box after orientation and any explicit background stage. The default `alpha > 0` is precise; alternative thresholds can be advanced settings. ([Trim research](algorithms/state-of-the-art.md#21-trim-must-have-a-mathematical-definition), [requirements](../planning/product-requirements.md#92-formal-trim-definition)) |
| Reversible clean-grid recovery | **High only when the original grid is identifiable or supplied** | Constant-block tests can prove one or more valid factorizations, but equal neighboring logical cells make the original boundary invisible. Lossless original-grid recovery therefore requires supplied dimensions/scale or a unique factorization under a stated identifiability precondition. ([exact-grid research](algorithms/state-of-the-art.md#51-exact-constant-block-factorization), [benchmark fixtures](evaluation/benchmark-methodology.md#51-exact-grid-family)) |
| Good approximate-grid recovery | **Medium; benchmark-gated** | Period, phase, alpha-aware edge energy, tile consensus, and target-aware candidates are plausible, but harmonics, textures, padding, and local drift remain adversarial. ([grid evidence](algorithms/state-of-the-art.md#52-period-and-phase-evidence), [SpriteFusion failures](products/spritefusion-pixel-snapper.md#failure-taxonomy)) |
| Broad AI-mixel reconstruction | **Plausible but unproven** | A bounded candidate ensemble may outperform one detector/reducer, but no reviewed project establishes universal or even corpus-wide superiority. ([mixel proposal](algorithms/state-of-the-art.md#55-candidate-ensemble-recommendation-for-mixels), [Unfaker results](products/unfake-js.md#hands-on-synthetic-tests)) |
| Continuous illustration/photo reduction | **High as abstraction, not recovery** | Correct conventional area/cubic candidates plus palette reduction can always meet target constraints; quality is profile- and target-dependent. ([resampling](algorithms/state-of-the-art.md#3-conventional-resampling-kernels), [support tier S4](../planning/product-requirements.md#6-support-tiers-and-honest-degradation)) |
| Exact color-count or supplied-palette output | **High; algorithm choice gated** | Final-stage enforcement can guarantee a cap or exact membership. Which permissive quantizer gives the best quality is still an experiment. ([quantization research](algorithms/state-of-the-art.md#7-color-quantization-landscape), [open-source candidates](landscape/open-source-ecosystem.md#reuse-and-license-decision-matrix)) |
| Deterministic background operations | **High for explicit rules; impossible universally** | Exact/tolerance keys, border flood, and component rules are deterministic. Automatically identifying the intended subject for every image is not. ([background tiers](algorithms/state-of-the-art.md#9-deterministic-background-removal), [requirements](../planning/product-requirements.md#125-deterministic-background-removal)) |
| Cross-browser canonical pixel identity | **Plausible with a strict support matrix** | Requires pinned decode/color/engine paths, stable ties/reductions, no silent Canvas/GPU/SIMD switch, and cross-runtime goldens. Wasm alone is insufficient. ([determinism contract](algorithms/state-of-the-art.md#12-cross-browser-determinism-contract), [benchmark gates](evaluation/benchmark-methodology.md#162-profile-quality-gates)) |
| “Every format” and “perfect on every image” | **Not feasible** | Codec, patent, security, memory, animation, color-management, and semantic ambiguity require explicit support tiers and typed rejection. ([input policy](../planning/product-requirements.md#8-input-decode-color-and-output-policy), [misleading claims](evaluation/benchmark-methodology.md#17-impossible-or-misleading-metrics-and-claims)) |

## Competitor comparison

This matrix separates capability from quality. “No” means the exposed product does not satisfy the stated contract; it is not a claim that the product is bad at its intended task.

| System | Exact independent W×H | Visible-bounds target | Deterministic/replayable core | Grid or mixel strength | Palette control | Local/private processing | Reuse posture |
|---|---|---|---|---|---|---|---|
| PixelLab | **Partial:** Resize and standard Image-to-Pixel expose sizes; Unzoom/Pro infer them | No exposed equivalent | No established byte identity; remote AI/server algorithms | Attractive generative redraw and native-scale tools, but undisclosed and potentially identity-changing | Counts/palettes exist on some tools; exact behavior partly unknown | No for relevant services | Proprietary; workflow reference only. ([PixelLab verdict](products/pixellab.md#executive-verdict)) |
| SpriteFusion Pixel Snapper | No; pixel-size hint still discovers output | No | Deterministic intent in a pinned build; cross-target identity unproven | Promising on observed favorable near-grid inputs; limited on no-grid, hard plateaus, non-square cells, padding, and mixed scale | Analysis `k`, then optional exact RGB palette mapping; no dither/locks | Vendor describes browser-local processing; broader site handling follows its public policy | MIT Rust core; candidate reuse requires exact-revision closure and notices. ([SpriteFusion verdict](products/spritefusion-pixel-snapper.md#executive-verdict)) |
| Unfaker | No; `floor(source/scale)` plus phase cropping | No | Several fixed paths, but dominant ties, browser decode, floating paths, timestamp, and build identity prevent a strict Pixilate claim | Broad detector/reducer workbench; well suited to exact-upscale cases; selected-region cropping and detector mismatches occurred in bounded tests | Flexible cap/editor/QVote, with effective internal 24/256 behavior and cap leakage in the audited revision | Public source implements local Worker/Wasm processing | Top-level MIT, but current `imagequant` dependency has separate GPL/commercial terms. ([Unfaker verdict](products/unfake-js.md#executive-verdict)) |
| Retro Diffusion Fixer Standard | No; inferred grid or manual source-pixel size | No | Vendor-reported/code-derived deterministic intent; strict repeatability was not tested | Thoroughly documented open specialist in this bounded survey; two synthetic probes returned a different grid than fixture truth or reported a lattice on continuous art | Auto/explicit/custom palette and ordered dither | Vendor-reported browser-local | MIT declaration, subject to pinned dependency audit. ([mini-spike](landscape/commercial-and-web-tools.md#1-retro-diffusion-pixel-art-fixer-standard)) |
| Pixel It / Tezumie / GameTorch | No: source-sized effect, width-only, or longest-side behavior | No | Mostly deterministic-intent, but Canvas or float/runtime paths prevent strict proof | Useful conventional/palette baselines; no robust target-aware latent-grid contract | From simple nearest palette to broad dither menus | Primarily local | Permissive starting points with implementation-specific caveats. ([commercial mini-spikes](landscape/commercial-and-web-tools.md#individual-mini-spikes), [source audits](landscape/open-source-ecosystem.md#deep-source-audits)) |
| SimplePixelArt / Palettely / Scenario | Mostly square presets, fit modes, or undisclosed semantics | No alpha-bounds target found | Unknown | Approachable cleanup/editing workflows; implementation evidence limited | Visible palette-oriented UX | Vendor-reported local on some paths; paid/AI services vary | Closed or unknown; behavior reference only. ([commercial inventory](landscape/commercial-and-web-tools.md#core-converters-and-recovery-tools)) |
| PixelOver / PixaTool | Rich sizing/effect controls; PixelOver is a mature deterministic-editor comparator | No documented Pixilate-style automatic alpha-bounds target | PixelOver is positioned as non-AI/deterministic; exact replay contract not independently proven here | Production/editor controls rather than target-aware automatic mixel reconstruction | Rich palettes/dither/adjustments | Desktop | Closed; UX/behavior benchmark only. ([PixelOver](landscape/commercial-and-web-tools.md#7-pixelover), [PixaTool](landscape/commercial-and-web-tools.md#8-pixatool)) |
| Aseprite / ImageMagick / GIMP / Krita | Yes, through separate operations | Trim concepts exist but differ; ImageMagick is corner-color based, not alpha-bounds by definition | Scriptable and version-pinnable, not a unified cross-browser recipe contract | Mature primitives; no automatic distorted-grid recovery | Strong indexed/palette/dither functions | Local desktop/CLI | License and architecture vary; behavior/oracle roles are safer than copying. ([editor mini-spikes](landscape/commercial-and-web-tools.md#12-aseprite)) |
| Proposed Pixilate | Yes, invariant | Yes, formal alpha-threshold basis | Strict pinned local engine plus canonical recipe/hash | Separate exact-grid, approximate/mixel, raster, and line profiles | Independent exact cap/palette stage | Local Worker/Wasm; offline-capable goal | Pixilate-owned code under MIT plus an artifact-level audited, obligation-compliant third-party closure. ([product contract](../planning/product-requirements.md#1-executive-product-contract)) |

Two apparent conflicts are resolved by precision:

- PixelLab is not simply “missing target size.” **VERIFIED from public documentation/API:** two relevant tools expose target dimensions, while Unzoom/Pro use inferred or service-selected native sizing, and the relevant conversion operations are described as AI/model workflows rather than strict resampling. The opportunity is therefore **authoritative deterministic target geometry**, not merely adding width/height fields. ([PixelLab scorecard](products/pixellab.md#compact-requirements-scorecard)) *2026-10-19 note:* public MCP/OpenAPI documentation is consistent with Unzoom being algorithmic grid snapping rather than generative redraw, but its method remains INFERRED; see the [PixelLab addendum](products/pixellab.md).
- A tool can be deterministic for one loaded RGBA buffer yet fail Pixilate’s end-to-end contract. Browser decoding, color conversion, unordered ties, floating reduction, encoder metadata, backend changes, or recipe timestamps can diverge. **CODE-DERIVED/INFERRED:** SpriteFusion and Unfaker demonstrate deterministic intent, not the full supported-matrix guarantee. ([SpriteFusion determinism](products/spritefusion-pixel-snapper.md#determinism-and-reproducibility), [Unfaker determinism](products/unfake-js.md#determinism-audit))

## Candidate ideas to evaluate

### From PixelLab

- Keep Unzoom/grid recovery, Resize/Pixelate, Palette Reduction, and Background Removal conceptually separate, while allowing an explicit composed recipe.
- Make target dimensions a top-level workflow concept and provide novice presets.
- Support imported/current palettes and batch/sequence concepts later.
- Treat detected “native scale” as a suggestion and diagnostic, never as authority over the user target.

These are **VERIFIED workflow lessons**, not permission to reproduce proprietary algorithms or client code. ([PixelLab strengths](products/pixellab.md#strengths-worth-learning-from), [licensing](products/pixellab.md#privacy-and-licensing))

### From SpriteFusion

- Preprocess a separate analysis image to suppress near-duplicate AI shades, but do not let the final user palette redefine geometry.
- Preserve categorical whole-color cell mode as one reducer when grid confidence is high.
- Use local Worker/Wasm processing, stable traversal/ties, and one-logical-pixel output.
- Expose period, phase, cuts, confidence, and warnings that the current public API discards.
- Keep a manual source-pixel-size hypothesis, independent X/Y, without confusing it with target W×H.

The useful mechanism is analysis quantization + grid evidence + categorical reduction. The specific strict-luminance peaks, square step, canvas-zero phase, elastic cumulative walk, and unreported fallback should not be inherited unchanged. **CODE-DERIVED/OBSERVED.** ([algorithm audit](products/spritefusion-pixel-snapper.md#what-the-algorithm-actually-does), [adopt/avoid list](products/spritefusion-pixel-snapper.md#reusable-ideas-for-pixilate))

### From Unfaker

- Preserve the workbench model: exact-run fast path, tiled edge/autocorrelation candidates, manual override, grid overlay, several reducers, before/after comparison, presets, magnifier, palette editor, and manifest.
- Test “quantize analysis colors, then vote inside target cells” as a mixel candidate.
- Keep a content-adaptive/conventional reconstruction candidate for no-grid art, but route it through the truthful named pipeline.
- Carry the shared browser/CLI core concept into a single strict engine.

Do not carry forward phase cropping, one scalar X/Y scale, hidden QVote constants, per-channel color synthesis, default morphology/jaggy cleanup, browser-dependent strict decode, unstable dominant ties, or the current quantizer dependency closure. **CODE-DERIVED.** ([pipeline](products/unfake-js.md#exact-pixel-pipeline), [control mapping](products/unfake-js.md#mapping-unfaker-controls-to-pixilates-future-advanced-ui), [license decision](products/unfake-js.md#licensing-and-open-source-reuse))

### From other products and projects

- Retro Fixer: multi-signal period evidence, original-pixel reconstruction after analysis clustering, transparency-aware voting, and manual override; add confidence and target constraints.
- PixelOver: separate canvas/object transforms, opacity thresholds, presets, animation consistency, and production-oriented state.
- SimplePixelArt/Scenario: approachable palette editing, reusable settings, and understandable cleanup labels; replace magic toggles with formal rules and diffs.
- Aseprite/ImageMagick: prove that exact geometry, trim/crop, palette conversion, deterministic scripting, and mature filter choices can coexist as primitives.
- `fast_image_resize`: leading permissive strict-resize substrate candidate; initially force and test one scalar path.
- `image-q`, ExoQuant, `quantette`, and the old BSD libimagequant fork: quantizer bake-off candidates, not predetermined winners.
- `perfectPixel`: FFT/Sobel grid-count and boundary-refinement ideas are highly relevant; reimplement only after provenance clarification and with monotonicity/confidence/alpha/target constraints.
- `magic-wand-js` and GrabCut: small seeded flood selection first; heavy seeded graph cut only as a later advanced experiment.

These are **VERIFIED/CODE-DERIVED candidate lessons** whose adoption remains subject to dependency, provenance, determinism, and quality gates. ([open-source source audits](landscape/open-source-ecosystem.md#deep-source-audits), [reuse matrix](landscape/open-source-ecosystem.md#reuse-and-license-decision-matrix))

## Observed limitations and design requirements

1. **Discovered output dimensions.** A detector can inform reconstruction but cannot override `W×H`.
2. **Silent crop or padding influence.** Phase snapping, aspect adjustment, transparent margins, and partial cells must have named policies and previews.
3. **One grid model for every source.** Clean grids, distorted grids, mixels, continuous art, and line art need different profiles.
4. **Confidence-free Auto.** No-grid inputs can generate plausible periods. Low confidence must fall back to raster abstraction or request an override.
5. **Canvas-defined processing.** Canvas is for preview, not strict decode/filter identity.
6. **Straight-alpha/gamma-space filtering.** Use linear-light premultiplied color where fidelity is claimed; ignore RGB under alpha zero.
7. **Palette leakage.** Every color-producing stage—including fallback averaging, cleanup, and dithering—must precede final exact-cap enforcement or be constrained to palette entries.
8. **Per-channel voting/morphology as color logic.** It can create colors that never existed and break palette identity.
9. **Semantic-blind cleanup by default.** Orphan removal can delete eyes, stars, tips, and diagonal connectors. Cleanup is explicit, diffable, reversible, and initially off.
10. **Seed-as-determinism.** Pin algorithms, versions, traversal, ties, numeric backend, decode, encode, and recipe.
11. **Picker/decoder mismatch and unbounded memory.** Advertise only supported formats; reject by signature and decoded-resource budgets before large allocations.
12. **Pipeline fiction.** A recipe must record stages that actually affected output, not controls an algorithm bypassed.
13. **License-by-badge.** Audit the shipped dependency closure and data assets; an MIT wrapper or repository cannot relicense GPL/LGPL/proprietary contents.

These observed limitations inform the requirements across the priority audits and ecosystem survey. ([PixelLab contract differences](products/pixellab.md#contract-differences-and-pixilate-requirements), [SpriteFusion implications](products/spritefusion-pixel-snapper.md#concrete-pixilate-design-implications-from-this-spike), [Unfaker design implications](products/unfake-js.md#avoid-or-redesign), [scope and licensing misconceptions](landscape/open-source-ecosystem.md#common-scope-and-licensing-misconceptions))

## Deterministic guarantees versus heuristic quality

Pixilate should split its promise into two layers.

**Guarantees that are deterministic and testable now:** canonical decode/rejection policy; exact `W×H`; exact Trim rectangle under serialized threshold; fit/crop/pad and anchor math; palette membership/count; alpha-zero normalization; stable tie and neighbor order; typed errors; local processing; complete stage trace; canonical pixel hash; recipe replay for supported engine versions. ([determinism requirements](../planning/product-requirements.md#14-determinism-replay-and-metadata-contract), [universal hard gates](evaluation/benchmark-methodology.md#161-universal-hard-gates))

**Quality choices that remain deterministic but heuristic:** whether a grid exists; which harmonic/phase is intended; which cell reducer best protects detail; whether an isolated component is noise; palette aesthetics; background intent; and the weights used to choose among mixel candidates. Repeated output does not make those choices correct. They require confidence, alternatives, inspectable scoring, corpus evidence, and human judgment. ([evaluation principles](evaluation/benchmark-methodology.md#2-benchmark-principles), [support tiers](../planning/product-requirements.md#6-support-tiers-and-honest-degradation))

Auto should therefore be a versioned, finite decision procedure—not an unbounded search and not a marketing synonym for intelligence. It measures source conditions, generates a bounded candidate set, applies a fixed score, records all candidates/scores, and falls back conservatively. Advanced mode exposes the same underlying decisions. Improvements create a new profile version rather than silently changing saved work.

## Exact target, Trim, palette, and background conclusions

### Target and aspect

- Every successful Resize/Pixelate route emits exactly the requested native `W×H`; grid detection never changes it.
- Width and height are independent. Aspect lock is a UI convenience that derives and shows a value before execution.
- Stretch, Contain+Pad, and Cover+Crop are explicit. Their rounding, anchor, boundary extension, and odd-pixel allocation are serialized.
- When a recovered logical grid conflicts with the target, the product names the compromise: logical crop/pad, rationally distributed cells, conventional post-resample, or refusal of “grid-perfect” mode. **INFERRED recommendation.** ([target geometry](algorithms/state-of-the-art.md#2-trim-exact-target-size-and-aspect-policy), [geometry requirements](../planning/product-requirements.md#91-geometry-invariants))

### Trim

- `Trim off`: geometry is based on the full oriented canvas.
- `Trim on`: geometry is based on the smallest half-open box containing samples with `alpha > tau`; default `tau=0` (“any visible”).
- Background removal, when explicitly composed first, changes alpha and therefore changes the later Trim box.
- A fully transparent input returns `empty-visible-region`; it does not invent a subject.
- Tight `W×H` output is the first MVP behavior. Restoring original/mapped margins is a separate later canvas policy using recorded offsets.
- Trim never means corner-color similarity or automatic background recognition. **Lock now.** ([formal algorithm](algorithms/state-of-the-art.md#21-trim-must-have-a-mathematical-definition), [normative contract](../planning/product-requirements.md#92-formal-trim-definition))

### Palette and dithering

- Geometry and quantization are separate features. The default composed order is spatial reduction before final palette fitting, except a named profile may use a separate temporary analysis quantization.
- “Maximum K visible colors” excludes fully transparent output and is enforced after every color-producing stage. “Use exact palette” permits no qualifying RGB outside it.
- Preserve/no quantization is the default for exact/native art; no dither is the general default.
- Imported palette order, deduplication, locks, transparency reservation, alpha weighting, metric, tie rule, and dither phase/scan/kernel belong in the recipe.
- A Wu-initialized fixed Lloyd refinement in Oklab/`quantette` is a promising hypothesis, not a selected dependency. **Algorithm gated; contract lockable.** ([palette research](algorithms/state-of-the-art.md#73-recommended-palette-candidate), [requirements](../planning/product-requirements.md#122-palette-contract))

### Background removal

- Keep a separate tab and explicit stage because background selection changes alpha and requires different intent.
- First deterministic tiers: global exact key, tolerance key, border-connected flood with 4/8 connectivity, and component policies. Require sampled colors/seeds and show the mask.
- Preserve holes and same-colored enclosed foreground according to explicit connectivity rules; expose matte decontamination separately.
- Seeded graph cut is later and optional. It can be repeatable with fixed RNG/build/iterations, but it is still interactive segmentation, not universal automatic subject recognition.
- Do not run background removal automatically in the resize default. **Lock boundary now; advanced algorithm gated.** ([background research](algorithms/state-of-the-art.md#9-deterministic-background-removal), [requirements](../planning/product-requirements.md#125-deterministic-background-removal))

## Honest input-support tiers

| Support tier | Input condition | Default treatment | Promise |
|---|---|---|---|
| S1 — Proven grid | Native or uniquely identifiable/instructed uniform replicated logical cells | Constant-block factorization plus categorical/no-op recovery; ambiguity is reported; no cleanup/dither | Lossless only inside declared identifiability and target-policy preconditions |
| S2 — Approximate grid | Dominant period/phase with bounded interpolation/compression | Confidence-scored independent X/Y period/phase candidates | Deterministic best effort; show alternatives and fallback |
| S3 — Mixel | Irregular pseudo-cells, drift, multiple local artifacts | Experimental bounded candidate ensemble | Exact constraints, not recovered truth; quality claim only after held-out gate |
| S4 — Continuous raster / line art | No credible source grid | Rational/conventional or topology-weighted target reduction | Deterministic abstraction to exact size; explicitly “no grid recovered” |
| S5 — Deterministic background | Key/connectivity/seeds define selection | Exact/tolerance/flood/component operation | Repeatable semantics, not universal semantic correctness |
| S6 — Compatibility decode | Format/color path outside strict matrix | Separate local browser or alternate decode | Best effort with non-reproducibility warning |

This tiering reconciles “widest possible support” with honest guarantees. Static PNG/JPEG/WebP/BMP are reasonable strict-v1 candidates, but each must pass decode, color, hostile-input, and cross-runtime gates. GIF requires explicit frame selection; AVIF, HEIC, vector/project files, video, and unconstrained animation should not be implied by “any image.” ([support contract](../planning/product-requirements.md#6-support-tiers-and-honest-degradation), [input strata](evaluation/benchmark-methodology.md#4-input-strata))

## Recommended pipeline and architecture hypothesis

```text
validated bytes
  -> pinned bounded decode + orientation + color normalization
  -> canonical straight RGBA8 (higher-precision linear/premultiplied work buffers)
  -> optional explicit background-mask stage
  -> full-canvas or alpha-bounds measurement ROI
  -> exact aspect/crop/pad geometry
  -> source-condition profile and bounded spatial candidates
  -> selected exact-size spatial result
  -> palette construction/lock + palette mapping
  -> optional deterministic dither
  -> optional explicit topology-guarded cleanup
  -> mandatory final palette/alpha contract validation (or serialized correction/typed failure)
  -> canonical RGBA + diagnostics + versioned recipe
  -> pinned PNG encoder
```

The leading hypothesis is one Rust-to-Wasm normative engine in a Worker, with Canvas used only to display previews. Candidate foundations are a minimal-feature pinned `image` codec layer, `fast_image_resize` for conventional kernels, owned rational-area/trim/grid/cell/component primitives, and a benchmark-selected permissive quantizer. Strict mode initially uses one scalar execution path, stable row-major loops, fixed-point/integer decisions where practical, and no relaxed SIMD or unordered parallel reduction. **INFERRED recommendation, not a final stack selection.** *(Superseded 2026-10-19 by `OWN-001`, see the [2026-10-19 addendum](#2026-10-19-addendum-owner-decisions-and-prototype-v1); retained as the record of the alternative.)* ([algorithm stack](algorithms/state-of-the-art.md#recommended-initial-stack), [open-source architecture](landscape/open-source-ecosystem.md#recommended-open-source-architecture))

The profile hypothesis is likewise explicit: **Exact Grid Recovery** proves or accepts a lattice and otherwise refuses that claim; **Approximate Grid / Mixel** generates bounded grid and non-grid candidates with confidence; **Raster Abstraction** uses alpha-correct conventional reduction when no lattice is credible; **Manual Raster / Line Art** weights silhouette and topology; and **Background Selection** remains a separate mask-producing feature. Auto chooses among these named, versioned routes and records its evidence. It never creates a hidden sixth algorithm. ([recommended profiles](algorithms/state-of-the-art.md#14-recommended-profiles), [profile requirements](../planning/product-requirements.md#10-profiles-auto-confidence-and-fallback))

Alternative decisions and why they remain open:

| Decision | Leading hypothesis | Credible alternative | Why not lock yet |
|---|---|---|---|
| Engine language | Rust/Wasm shared core | Constrained TypeScript core | Need bundle, memory, determinism, developer-cost, and device benchmarks. **Superseded 2026-10-19 by `OWN-001`:** the owner decided for a JavaScript core without these benchmarks; they remain verification obligations. |
| Conventional resize | `fast_image_resize` plus owned rational area | Pica or owned fixed-point filters | Cross-backend pixels, linear/premultiplied correctness, and size/performance need measurement. |
| Quantizer | `quantette` or owned Wu + fixed Lloyd/Oklab | `image-q`, ExoQuant, `color_quant`, reviewed BSD libimagequant fork | Quality, alpha behavior, ties, provenance, runtime, and cross-target identity are unsettled. |
| Mixel routing | Period/phase ensemble + rational/grid/irregular candidates | Simpler global grid plus medoid; no irregular DP in MVP | Complexity is unjustified unless it beats simple baselines on held-out mixels. |
| Color management | Pinned strict sRGB policy, possibly Little CMS | Narrow accepted-profile table with warn/reject | Full ICC increases bundle and attack surface; support claim needs conformance fixtures. |
| Strict performance | Scalar deterministic path | SIMD/threaded strict path | Optimization is allowed only after canonical hashes prove identity or it receives a distinct engine ID. |
| Advanced background | Owned deterministic primitives | Pruned OpenCV GrabCut or owned graph cut | Bundle, seed, numeric stability, UX value, and license/security costs are unproven. |

The simpler alternative must remain available as a falsification baseline. If the mixel ensemble does not materially beat rational area/medoid and one global-grid candidate, do not ship the complexity merely because it sounds sophisticated.

## Source, license, and provenance closure

Pixilate’s intended MIT license constrains the shipped closure, not the research references.

- PixelLab hosted algorithms, closed products, and unknown-license web converters are public-contract/UX references only. Do not copy code, assets, or branding without an applicable grant. ([PixelLab licensing](products/pixellab.md#license-and-reuse-evidence), [commercial licensing](landscape/commercial-and-web-tools.md#licensing-and-mit-compatibility))
- SpriteFusion’s public Rust core is MIT and can be adapted with retained notice, but product artwork, branding, paid UI, and unlocated front-end source are separate. ([SpriteFusion licensing](products/spritefusion-pixel-snapper.md#licensing-and-mit-reuse-compatibility))
- Unfaker’s repository is MIT, yet its compiled core uses current `imagequant` 4.4.x, whose public licensing is GPL-3.0-or-later/commercial. Do not transplant that dependency into Pixilate’s currently approved production artifact without a GPL-compatible distribution decision, qualified review, or a commercial arrangement. ([Unfaker licensing](products/unfake-js.md#licensing-and-open-source-reuse))
- Modern libimagequant is not approved for the current MIT-core production bundle; it remains a research oracle under applicable terms and could ship only after a deliberate GPL-compatible distribution decision or commercial arrangement. The older BSD fork is a conditional candidate only after file-level provenance review; do not conflate the two lines. ([libimagequant audit](landscape/open-source-ecosystem.md#9-the-two-libimagequant-lines-must-not-be-conflated))
- MIT/Apache wrappers do not erase native LGPL/GPL/data/font/palette/codec obligations. Generate an SBOM and notices from the actual release artifact, pin every feature and source checksum, and scan generated Wasm/object closure. ([dependency rules](landscape/open-source-ecosystem.md#dependency-closure-rules-for-planning))
- Algorithms, patents, assets, matrices, palettes, trademarks, service terms, and code licenses are separate questions. This synthesis is engineering triage, not legal advice.

An implementation decision closes only when the exact release revision, feature graph, notices, source availability, bundled data, and relevant patent/codec risks have been reviewed.

## Privacy and local processing

The deterministic core should process image bytes locally, make no image upload, and remain usable after the application shell is cached. This differs from PixelLab’s documented cloud-backed workflows and simplifies reproducibility. **VERIFIED comparison / INFERRED design recommendation.** ([PixelLab public network contract](products/pixellab.md#network-and-server-dependency), [local tool audits](products/spritefusion-pixel-snapper.md#privacy-offline-behavior-and-telemetry), [Unfaker privacy](products/unfake-js.md#privacyoffline))

“Local processing” is not the same as “no network traffic.” Hosting, update checks, analytics, font/CDN loads, and service workers are separate. The release privacy contract should default to no content-derived telemetry and test that pixels, filenames, hashes, palettes, recipes, and mask data do not leave the origin during import, process, preview, save, or export. Optional analytics must be content-free, disclosed, and separable from the engine. ([privacy requirements](../planning/product-requirements.md#161-privacy-and-offline-behavior), [privacy acceptance](../planning/product-requirements.md#174-reproducibility-privacy-resilience-accessibility))

## Cross-product failure taxonomy

| Failure family | Why it happens | Required response |
|---|---|---|
| False or harmonic grid | Texture, outlines, checkerboards, or no-grid art create periodic evidence | Rank candidates, calibrate confidence, show overlay, fall back to raster profile. |
| Wrong phase / cumulative drift | Canvas-zero anchoring or local edge walks follow content edges | Optimize phase globally; constrain monotone boundaries and displacement; never change target count. |
| Non-square, skewed, or mixed grids | One scalar/global axis model cannot represent the source | Independent X/Y models; explicit unsupported/experimental handling for rotation, perspective, and mixed regions. |
| Transparent-padding scale error | Full canvas drives period/fallback while the user means the subject | Formal Canvas/Trim basis; alpha-aware evidence; recorded ROI and offsets. |
| Halo or hidden-RGB contamination | Straight-alpha/gamma filtering or alpha-zero RGB enters analysis | Canonical alpha policy; linear-premultiplied filtering; multi-background halo tests. |
| Thin-detail/topology deletion | Majority/mode, quantization, morphology, and cleanup treat minority pixels as noise | Protected-feature metrics, alternate reducers, cleanup off by default, diff/undo. |
| Orphan/noise creation | Dither, ringing, per-channel synthesis, bad boundaries, or palette chatter | No dither default; whole-color representatives; exact final palette; formal optional component rules. |
| Palette overflow/drift | Mean fallback, post-cap cleanup/dither, hidden constants, or approximate palette paths | Enforce final contract; report actual counts and forbidden colors. |
| Identity/silhouette movement | Generative redraw, seam carving, edge-biased boundary selection | Exclude generative core/seam-carving default; measure edge displacement and topology. |
| Wrong background mask | Foreground shares color, touches border, has holes/shadows, or intent is ambiguous | Explicit seeds/key/connectivity, mask preview, typed limitation; no semantic universal claim. |
| Decode/runtime divergence | Browser codecs, ICC/EXIF, float/SIMD/thread differences, unstable ties | One pinned strict path, goldens across support matrix, distinct compatibility/optimized engine IDs. |
| Resource/format failure | Picker exceeds decoder, decompression bombs, full-pixel K-means, batch collisions | Signature validation, pixel/memory/time budgets, cancellation, collision-safe atomic export, typed errors. |

The taxonomy is consolidated from the observed/code-derived failures in [SpriteFusion](products/spritefusion-pixel-snapper.md#failure-taxonomy), [Unfaker](products/unfake-js.md#failure-modes-by-input-class), [PixelLab](products/pixellab.md#quality-failure-mode-analysis), and the [evaluation strata](evaluation/benchmark-methodology.md#4-input-strata).

## Benchmark gates

No single score may select the default. Evaluation must keep three evidence classes separate:

1. **Hard conformance:** dimensions, Trim ROI, palette membership/count, alpha-zero policy, deterministic hash, bounded errors, cancellation, and no stale/partial artifacts.
2. **Recoverable ground truth:** exact logical cells, period/phase, palettes, masks, topology, and no-op identity on mathematical/paired fixtures.
3. **Ambiguous usefulness:** metric vectors plus blinded judgments for mixels, illustrations, photos, and line art with multiple valid outputs.

Required release gates include:

- zero dimension error and no undocumented crop/pad/fallback for valid cases;
- 100% exact recovery on declared clean-grid fixtures;
- zero palette violations under exact contracts;
- identical canonical pixels on the declared browser/architecture matrix;
- no crash, trap, unbounded allocation, or generic failure where a typed rejection is required;
- mixel/HD/line/background claims evaluated separately on held-out strata, with protected-feature/topology catastrophic regressions unable to hide in averages;
- blind pairwise human review at native and nearest-enlarged views before naming a visual default;
- runtime, peak memory, bundle, cancellation, and minimum-device budgets;
- approved corpus provenance and shipped dependency closure.

Competitors must be tested only on tasks they expose. A discovered-grid tool may compete on grid recovery but cannot be post-resized and credited with native exact-target support. Remote repeat tests are dated service evidence, not proof of future determinism. ([benchmark principles](evaluation/benchmark-methodology.md#2-benchmark-principles), [competitor protocol](evaluation/benchmark-methodology.md#12-competitor-and-baseline-protocol), [claim gates](evaluation/benchmark-methodology.md#163-claim-to-gate-matrix))

## Decisions that can be locked now

- Pixilate remains a working name and requires later naming/trademark work.
- Local, non-generative processing is the normative core; no hidden server fallback.
- Resize/Pixelate, Quantize/Palette, and Background Removal are separate but visibly composable.
- Exact native W×H is authoritative on every successful resize.
- Trim is alpha-threshold geometry (`alpha > 0` default), not background inference; full-canvas and visible-bounds behavior are distinct.
- Background removal is explicit and precedes Trim only when selected in the composed recipe.
- Auto is deterministic, versioned, confidence-reporting, and fallbacks are visible.
- Default dither and cleanup are off; exact/native art has an identity/no-op path.
- Canonical result pixels and recipe are distinct from encoded-file bytes and volatile metadata.
- Strict and compatibility decode paths are distinct; advertised formats match actual decoders.
- Pixilate-owned code is MIT. Each distributed artifact may include only approved third-party components under retained, obligation-compliant terms; incompatible combinations require a deliberate distribution-plan change and qualified review.
- A benchmark/fixture harness precedes selection of visual defaults and full UI implementation.

These decisions are directly reflected in the [product contract](../planning/product-requirements.md).

## Decisions that remain benchmark-gated

- Rust/Wasm versus constrained TypeScript as the normative engine. *(Superseded 2026-10-19 by `OWN-001`: decided by the owner, not by a benchmark.)*
- Exact strict-v1 codecs, ICC coverage, maximum dimensions/pixels, and device SLOs.
- Conventional raster reducer and boundary-extension defaults.
- Approximate-grid signals, confidence calibration, and period/phase thresholds.
- Whether irregular-boundary dynamic programming or segmentation earns bundle/complexity cost.
- Cell representative per profile: whole-color mode, perceptual-binned mode, medoid, mean, center, or edge-aware.
- Quantizer implementation, color metric, fixed/floating arithmetic, and palette initialization/refinement.
- Dither set, fixed matrices, phase, scan, and whether any dither belongs in a named preset.
- Cleanup/topology guard and any automatic proposal threshold.
- Advanced background segmentation and matte cleanup.
- Stable status and default inclusion of the Mixel profile.

Attractive competitor examples or a few live fixtures cannot close these decisions. ([open decisions](../planning/product-requirements.md#20-open-implementation-decisions-with-entryexit-criteria), [validation backlog](evaluation/benchmark-methodology.md#18-prioritized-validation-backlog))

## Prioritized research experiments

1. **P0 dependency-clean conformance harness:** use owned procedural in-memory canonical RGBA vectors to define domain-separated hashes, alpha/Trim, exact geometry, nearest/nonnegative rational area, typed bounds, and all valid constant-block factorizations with ambiguity reporting. This research harness freezes no production codec, engine language, or visual default.
2. **P0 codec/color adapters:** after the canonical buffer contract exists, test candidate PNG/JPEG/WebP/BMP decode, orientation, color, alpha, and encoder paths against it; produce cross-runtime golden vectors and hostile-input limits. PNG is the minimum candidate; the final strict matrix remains an OD-002 result.
3. **P0 quantizer bake-off:** compare permissive Wu/`quantette`, owned Wu+fixed Lloyd/Oklab, `image-q`, ExoQuant, and reviewed candidates against modern libimagequant as a research-only oracle under applicable terms; measure exact caps, alpha edges, locks, quality, time, determinism, and closure.
4. **P1 approximate-grid bake-off:** exact runs/divisor proof, plateau-aware edge score, autocorrelation, FFT, tile consensus, independent X/Y phase, and target-aware candidate ranking; include harmonic/no-grid confidence calibration.
5. **P1 cell-representative bake-off:** rational mean, center, exact/alpha-weighted mode, perceptual bins, medoid, and edge-aware choices on thin-feature/topology fixtures and artist-rated mixels.
6. **P1 specialist comparison:** capture native outputs/settings from Retro Fixer, SpriteFusion, Unfaker, Pixel It, Tezumie, GameTorch, ImageMagick baselines, and legally accessible commercial demos. Preserve unsupported and failed cases.
7. **P1 mixel ablation:** compare the simplest rational/medoid baseline, one global-grid route, nearby hypotheses, and irregular-boundary DP. Add segmentation only after an ablation shows a gap.
8. **P1 background primitives:** exact/tolerance global key versus border flood/components on shared-color, border-touch, hole, shadow, and alpha-fringe ground truth.
9. **P1 human pilot:** calibrate separate silhouette, grid cleanliness, palette, important-detail, noise, and usefulness rubrics with pixel artists and game developers; freeze practical margins before release testing.
10. **P2 operational qualification:** memory, cancellation, bundle, offline, network privacy, accessibility, and scalar/SIMD/device matrices.

The detailed corpus, schema, metrics, and release procedure are defined in the [benchmark methodology](evaluation/benchmark-methodology.md#18-prioritized-validation-backlog).

## Implications for MVP and later scope

The first credible product is narrower than the complete vision but still differentiated.

**Research proof before product UI:** build the corpus, canonical geometry/decode harness, exact-grid/no-grid baselines, quantizer bake-off, and determinism probes. Do not claim a stable Mixel default yet.

**Exact-target local web MVP:** static strict inputs; exact W×H; full-canvas versus Tight Trim; Stretch/Contain/Cover; identity/exact-grid and no-grid raster profiles; experimental, clearly labeled mixel candidates; basic preserve/max/imported palette with no dither plus one ordered option; Worker/cancellation/offline/privacy/accessibility; PNG plus recipe JSON. This delivers the market gap even if the sophisticated mixel ensemble is not ready. ([phased product scope](../planning/product-requirements.md))

**Later expert workflow:** deterministic background tiers, mapped-margin restoration, locks and broader dithers, optional formal cleanup, candidate comparison, richer diagnostics, and expanded frame/color support. ([phased product scope](../planning/product-requirements.md))

**Production expansion:** batch/animation with sequence-level grid and palette locks, collision-safe atomic outputs, indexed/palette/grid formats, and shared CLI/library. Advanced graph cut or extra codecs enter only after their value and closure are proven. ([phased product scope](../planning/product-requirements.md))

## Top risks and unknowns

1. The mixel scorer may optimize measurable neatness while artists prefer a different detail/noise tradeoff.
2. A broad corpus may expose generator/style-specific overfitting or no confidence threshold that cleanly separates grid and no-grid sources.
3. Strict color/decode identity may require more codec/color-management code, bundle size, or platform restriction than expected.
4. Topology-aware cleanup may remain too ambiguous to automate safely.
5. The best permissive quantizer may not match the quality/runtime of GPL/commercial libimagequant, forcing an owned implementation or a clearly lower claim.
6. Rust/Wasm scalar strict processing may exceed mobile memory/latency budgets on the desired maximum source size.
7. Rights-cleared real AI-mixel data and expert annotations may be harder to assemble than synthetic fixtures.
8. FFT/edge/irregular-grid methods may follow subject contours rather than an intended lattice and create displaced features.
9. Full ICC and expanded codecs may add disproportionate security, patent, and license risk.
10. Users may interpret “deterministic” as “artistically correct”; product copy and diagnostics must keep those concepts separate.

## What would falsify this plan

The plan should be changed, simplified, or stopped if the evidence shows any of the following:

- A current product or permissively licensed project is verified to satisfy the complete exact-target, Trim, deterministic recipe, local, palette, and broad-profile contract more effectively than building Pixilate’s owned layer.
- A pinned local browser engine cannot reproduce canonical pixels on a practically useful support matrix without unacceptable restrictions, performance, or bundle cost.
- Held-out mixel tests show that the proposed grid/candidate methods do not materially outperform a simple alpha-correct rational resize plus palette baseline, or they win averages by deleting protected details/topology.
- Pixel artists do not prefer or find useful the outputs/diagnostics at the intended target sizes, even when advanced controls are available.
- The required corpus cannot be assembled with defensible provenance, sufficient style diversity, and reliable annotations.
- An MIT-compatible quantization/codec closure cannot meet minimum quality, security, and performance without a product-license change the owner will not accept.
- User research shows that exact target/Trim/replay are not valuable enough to justify a new tool versus existing editors and specialist converters.

Failure of the sophisticated mixel hypothesis would not falsify the exact-target product gap. It would narrow Pixilate to a deterministic geometry/palette workbench with honest grid-recovery options. Failure of exact, local, replayable conformance at acceptable cost would falsify the product’s core technical promise.

## 2026-10-19 addendum: owner decisions and prototype v1

The sections above are the 2026-07-31 synthesis. They are retained unchanged apart from dated supersession notes.

### Owner decisions

The owner decisions are recorded in [PRD §25](../planning/product-requirements.md#25-owner-decision-log):

- **`OWN-001`:** a JavaScript-only, fully client-side Vite + Svelte single-page application. This closes `OD-001` by owner decision. No comparative evidence was produced and `EX-001` was not run. It supersedes the Rust/Wasm leading hypothesis and the engine-language row above; determinism and engine exit criteria remain verification obligations.
- **`OWN-002`:** `prototype/` is an exploratory research prototype outside Gate A/R0 and Gate B/R1. It passes no gate.
- **`OWN-003`:** source-generator detection becomes `FR-023`, a report-only container-metadata provenance signal with masking-only watermark handling and no persisted prompts or usernames.
- **`OWN-004`:** crisp output is a named, user-visible Clean profile. The locked decisions above (background removal explicit; dither and cleanup off by default) stand.
- **`OWN-005`:** the prototype records binary alpha as `Binary(128)`; the product alpha default is unchanged.
- **`OWN-006`:** `W×H` is always required; a detected native size is only `suggestedSize` evidence.

### Prototype v1 findings

The prototype is described in the [prototype algorithm design](../planning/prototype-algorithm-design.md) and the [prototype test results](../reviews/prototype-v1-test-results.md). Its evidence is exploratory and in-sample. There is no held-out split, blinded panel, or confidence interval, and the thresholds were tuned on the same fixtures. **OBSERVED** below means reproduced on 2026-10-19 with Node and Vitest at the first 2026-10-19 prototype revision (before design D23), on a named project-owned procedural fixture (`proc-blob`, `proc-tile`, or `proc-icon` in `prototype/test/fixtures.js`) or a synthetic case in the prototype unit tests. Numbers from gitignored local samples (third-party AI outputs and local copies of CC0-dedicated generator showcases) are labelled **OBSERVED, local-only, not rights-cleared**. They cannot be reproduced from the repository and cannot back a public claim.

| Finding | Evidence | Label | Bears on |
|---|---|---|---|
| Toe-corrected lightness for palette merging and other decision distances (design D1) | Unit test "a noisy pure-black outline yields exactly one dark entry": ±6 sRGB noise on a black outline gave 3 dark palette entries with raw Oklab L and 1 with the Okhsl toe. | OBSERVED (synthetic unit test); a general advantage stays INFERRED | `OD-007` |
| Whitened harmonic spectrum plus octave guard for period selection (D6, D7) | A raw harmonic sum picked 3–4× the authored period in the synthetic grid tests; the whitened line spectrum and an octave guard that compares candidates on their own cuts recovered it. Some of the guard thresholds were set on local samples. | OBSERVED (synthetic grid tests); thresholds from local samples are local-only | `OD-004`, `EX-005` |
| Cell step-ratio no-grid gate (D8): ratio ≥ 0.85 classes the input `none` | Smooth gradient and random sinusoid fields are classed `none`; a smooth periodic field passed a purity test alone. Gridded AI samples scored 0.12–0.69 and a painted control 1.00. | OBSERVED (synthetic fields); sample scores OBSERVED, local-only, not rights-cleared | `OD-004`, `EX-005` false-grid calibration |
| Approximate-grid recovery on real inputs | Five local gridded AI samples were within ±2% of the review's own no-reference pitch estimate; one painted no-grid control was classed `none`. One sample gave the same output hash in Node and one Chromium build: a single observation, not a processing-determinism claim. | OBSERVED, local-only, not rights-cleared | `OD-004`, `EX-005`, `EX-013` |
| Floating-subject background refusal (D16): automatic border keying is refused when more than 2% of border cells stay opaque after the fill | The rule stopped automatic keying from deleting opaque tiles and 1-bit art; the before/after scores come from a local copy of a CC0-dedicated showcase crop. | OBSERVED, local-only, not rights-cleared; the rule is a candidate refusal criterion | `OD-010`, `EX-010` "foreground touches the border" |
| Painted-checkerboard stratum (D20) | AI "transparent" outputs can contain a painted checkerboard. Under the synthetic `fake-alpha` preset, `proc-blob` stayed almost fully opaque (IoU 0.219) until checker matching was widened and a straddle rule added; preset medians also include local crops. Real painted checkerboards are unmeasured. | OBSERVED (procedural, synthetic preset); medians local-only; the stratum need is INFERRED | `OD-010`; benchmark stratum B |
| Coverage-based reduction to a target smaller than the recovered grid (D17) | Exact fractional coverage of native cells with tone grouping, thin-feature ridges, gap bridging, and optional orphan and outline steps. It was judged better on 16 of 18 local contact-sheet cases in an unblinded author-side review. Reductions of about 3× or more lost identity. | OBSERVED, local-only, not rights-cleared, unblinded visual judgement; a candidate method, not evidence of superiority | `OD-003`, `OD-006`, `OD-009` (its orphan and outline steps are cleanup under `OWN-004`) |
| Adaptive merge radius, tried and reverted (D19): **negative result** | A noise-adaptive palette merge radius raised synthetic snapped-match scores but roughly doubled real palette sizes (for example 17 → 33 colors); every floor that kept real palettes in bounds made it a no-op. The fixed radius was kept. | OBSERVED, local-only, not rights-cleared | `OD-007` |

The prototype also runs the procedural sprites through synthetic degradation presets. Those presets are parameterised from one or two local samples per generator and are not validated generator models.

### Open decisions with early evidence

`OD-003`, `OD-004`, `OD-005`, `OD-006`, `OD-007`, `OD-009`, and `OD-010` received early exploratory evidence. **None is closed**, and no `EX-*` protocol experiment has run. For `OD-004`, the prototype's exact fast path took the coarsest uniform-block factor, which conflicts with the factorization-set semantics above; the prototype now enumerates every valid factorization with an ambiguity flag (design D26) but still computes on the coarsest when none is instructed, which `OD-004` leaves open (2026-10-19). `OD-001` is closed by owner decision only.

The product and landscape spikes carry dated 2026-10-19 addenda, and Retro Diffusion Pixel Art Fixer now has [its own spike](products/retro-diffusion-pixel-art-fixer.md). Where an addendum changes a fact in the competitor comparison above, the addendum governs.
