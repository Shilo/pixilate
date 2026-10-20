# Session Findings — 2026-10-18

## Purpose and scope

This document records the principal findings and decisions developed during the Pixilate research session. It is a dated summary, not a replacement for the detailed product spikes, algorithm studies, requirements, or master plan. Comparative conclusions are limited to the tools and public evidence reviewed.

## Product objective

Pixilate is intended to be a local-first web application that converts raster, AI-generated, and manually created artwork into accurate pixel art without generative processing. It specifically addresses mixels, fractional or misaligned grids, inconsistent cell boundaries, excessive colors, noisy downscaling, orphan pixels, damaged transparency, and lost thin features.

The central product promise is deterministic conversion to an exact, independently selected output width and height while preserving or recovering meaningful structure. The planned platform separates four composable concerns:

1. Resize and pixelation.
2. Palette quantization and remapping.
3. Deterministic background removal.
4. Optional bounded cleanup.

With Trim disabled, sizing uses the complete oriented canvas. With Trim enabled, sizing uses the alpha-visible bounds. Recipes, engine versions, algorithms, parameters, and canonical pixel results must be replayable.

## Key technical conclusions

- No single algorithm is best for every input. Pixilate needs distinct exact-grid, approximate-grid/mixel, raster/illustration, and line-art profiles.
- Exact target geometry must govern the pipeline. Inferred native resolution can be offered as evidence or a suggestion, not silently override the requested dimensions.
- Grid inference is inherently ambiguous. Uniform blocks can support multiple valid factorizations, so detection should expose confidence, alternatives, overlays, and manual correction.
- Geometry should use rational source-footprint mapping instead of accumulated floating-point coordinates.
- Filtering must define color space, premultiplied-alpha behavior, transparent RGB canonicalization, boundary rules, and rounding.
- Palette work should normally follow spatial processing. Palette and alpha invariants must be checked again after every later color-producing stage.
- Dithering and orphan cleanup can damage topology and should be optional, bounded, and disabled by default.
- Background removal should use explicit deterministic operations such as color keys, perceptual tolerances, alpha thresholds, border-connected selection, and seeded masks.
- Canonical decoded pixels, semantic results, recipes, and encoded files require separate hash domains. Pixel determinism is not the same as byte-identical export.
- Browser-native decoding and canvas behavior should not be assumed cross-runtime deterministic without normalization and testing.

## Comparative product findings

The ranking below measures relevance to Pixilate's contract rather than general product quality.

1. **Retro Diffusion Pixel Art Fixer Standard** is currently the closest public algorithmic reference for repairing fake pixel art. Its multi-signal grid detection, confidence path, fractional-cell handling, reconstruction strategy, Rust implementation, and MIT license make it the highest-priority independent benchmark. It still infers native dimensions instead of satisfying arbitrary target dimensions, and its published benchmark results require independent reproduction.
2. **SpriteFusion Pixel Snapper** remains a strong reference for approximate-grid recovery, elastic boundaries, analysis quantization, and cell representatives. Its output dimensions are inference-driven, and difficult topology, thin features, spritesheets, native low-resolution inputs, and global-grid assumptions remain concerns.
3. **Unfake.js** offers the broadest experimental control over grid cleanup, sampling, reduction, palette behavior, and related adjustments. It is valuable as a research workbench, but its scale-first workflow, manual parameter search, incomplete strict-replay story, and ImageQuant licensing boundary prevent direct adoption as the product contract.
4. **PixelOver** is the strongest mature workflow and UX reference reviewed for exact canvas/object controls, resampling, palette indexing, alpha thresholds, animation, and editing. It does not automatically recover a damaged latent grid and is not a reusable MIT web core.
5. **PixelLab** is a useful quality and workflow comparator. Its separation of resize, unzoom, conversion, color reduction, and background removal validates the user journey. Its relevant processing is hosted or generative, and public sources do not establish Pixilate-level canonical replay or reusable implementation rights.
6. **GameTorch Image to Pixel Art** is a useful compact MIT Rust/Wasm reference with seeded clustering, palette support, transparency handling, and histogram reduction. It lacks independent target dimensions, grid inference, Trim, topology protection, and proven cross-platform pixel identity.
7. **Tezumie Image-to-Pixel** is a strong browser reference for palettes and dithering. It uses width with aspect-derived height and lacks independent dimensions, latent-grid recovery, opaque-bounds Trim, and strict replay evidence.
8. **SimplePixelArt** demonstrates an approachable local workflow with size presets, palette editing, median-cut reduction, orphan cleanup, and editor handoff. It lacks arbitrary dimensions, damaged-grid recovery, reusable public implementation evidence, and a formal deterministic contract.
9. **Aseprite** is an essential behavioral oracle for exact sprite sizing, indexed colors, palettes, dithering, trimming, scripting, and animation. It is a manual editor rather than a mixel-recovery pipeline, and its implementation is not an MIT reuse source.
10. **Palettely** is a useful reference for palette-indexed editable output and structured exports. It is square-preset-oriented and lacks damaged-grid recovery, alpha-visible Trim, disclosed deterministic internals, and a fully local non-AI feature set.

## Global gaps across reviewed tools

No reviewed tool combines all of the following in one coherent, publicly specified workflow:

- Arbitrary independent target width and height.
- Explicit full-canvas versus alpha-visible-bounds Trim semantics.
- Target-governed recovery of fractional, drifting, or misaligned grids.
- Confidence, ranked candidates, overlays, and manual correction for ambiguous grids.
- Versioned end-to-end deterministic replay and canonical result hashing.
- Defined EXIF, color-profile, alpha, transparent-RGB, codec, and extreme-aspect behavior.
- Integrated deterministic palette construction, mapping, limits, and validation.
- Topology-aware optional cleanup that protects outlines and thin features.
- Separate deterministic background removal with explicit parameters.
- Local browser processing with an MIT-owned core and audited artifact-level dependency closure.

This combined gap is Pixilate's primary opportunity. The intended product is not merely another block-size pixelation filter: it should reconcile exact user intent with recoverable image structure and report uncertainty when the source does not support a unique answer.

## Benchmark and validation findings

- Conformance and aesthetics must be scored separately.
- The corpus should be divided by input family rather than reduced to one aggregate score.
- Required checks include output dimensions, Trim bounds, palette and alpha limits, repeatability, grid alignment, topology, edge and thin-feature preservation, orphan/noise behavior, runtime, and memory.
- Subjective quality needs crossed judge/asset analysis and should not replace exact invariant checks.
- Fixtures must be rights-cleared and provenance-recorded. Possessing a prompt does not itself establish redistribution rights for an AI-generated image.
- Competitor tests must use authorized inputs and public interfaces. Vendor-reported measurements remain vendor evidence until independently reproduced.
- Numeric thresholds remain provisional until the benchmark fixture set and executable spikes justify them.

## Architecture and licensing findings

The processing-core choice remains evidence-gated. TypeScript offers simpler browser integration; Rust/Wasm offers stronger control over numeric paths and shared native/web execution. The decision should follow measured determinism, performance, memory, bundle size, auditability, and dependency closure. *(Superseded 2026-10-19 by owner decision `OWN-001`, [PRD §25](product-requirements.md#25-owner-decision-log): JavaScript-only engine; the measurements remain verification obligations.)*

An MIT license for Pixilate-owned code does not automatically make every dependency, codec, algorithm, model, test asset, or compiled artifact MIT-compatible. Each shipped artifact needs a locked dependency inventory, license and notice review, provenance record, and any necessary patent or codec analysis. Publicly readable code without a clear reuse grant must not be copied.

## Public research boundary

All tracked documentation is assumed public. Public claims must rely on first-party public documentation, publicly licensed pinned source, authorized black-box testing, or clearly labeled inference. Personal paths, credentials, private data, proprietary internals, unpublished deployment fingerprints, copied unlicensed code, and unsupported allegations do not belong in the repository. Comparisons should remain neutral, scoped, dated, reproducible, and non-affiliated.

Earlier private implementation-level observations were separated into ignored `.local/` notes. They may guide private verification but must not be cited publicly unless independently supported. `.local/` must never be committed and must not be used to retain unlawfully obtained material.

## Current research direction

The highest-value remaining work is executable research rather than additional broad surveying:

1. Independently benchmark the strongest grid-recovery candidates, especially Retro Diffusion Pixel Art Fixer, SpriteFusion, and the relevant Unfake.js configurations, on the same rights-cleared fixtures.
2. Test exact rational geometry, extreme aspect ratios, alpha/color normalization, canonical hashing, and repeated-output identity.
3. Establish deterministic quantizer candidates and stable palette/tie policies.
4. Define confidence and arbitration between exact-grid, approximate-grid, and raster profiles.
5. Determine whether automatic profile selection can be deterministic, explainable, and more reliable than explicit user choice.
6. Resolve the TypeScript versus Rust/Wasm processing boundary with measurements rather than preference.
7. Reconcile new evidence into the synthesis, requirements, benchmark methodology, gap matrix, and master plan before implementation begins.

## Canonical supporting documents

- `docs/research-spikes/SYNTHESIS.md`
- `docs/research-spikes/algorithms/state-of-the-art.md`
- `docs/research-spikes/landscape/commercial-and-web-tools.md`
- `docs/research-spikes/landscape/open-source-ecosystem.md`
- `docs/research-spikes/evaluation/benchmark-methodology.md`
- `docs/planning/product-requirements.md`
- `docs/planning/master-plan.md`
- `docs/reviews/research-gap-matrix.md`
- `docs/reviews/FINAL-REVIEW.md`

Production implementation remains out of scope until the research gates and implementation plan are explicitly approved.

