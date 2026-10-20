# Pixilate research-spike index

**Working name:** Pixilate — a playful spelling of “pixelate”; temporary and not yet cleared as a final product name.  
**Research snapshot:** 2026-07-31  
**Updated:** 2026-10-19 — owner decisions ([PRD §25](../planning/product-requirements.md#25-owner-decision-log)), the `prototype/` exception, and the reconciled research layout  
**Scope:** research and planning only. These documents do not authorize application code or lock benchmark-dependent algorithms. Exception (2026-10-19, `OWN-002`): the owner-requested exploratory JavaScript research prototype in `prototype/`; it passes no gate and selects no production default.

## Public comparison and licensing notice

Product and company names may be trademarks of their respective owners. Pixilate is independent and is not affiliated with, endorsed by, or sponsored by the products reviewed. Comparisons are dated, scoped to cited public or publicly licensed sources and authorized observations, and evaluate fit against Pixilate's proposed contract—not whether another product is good or bad at its intended purpose.

License and patent notes are engineering triage, not legal advice. These research documents incorporate no third-party source code, proprietary client details, credentials, user images, screenshots, artwork, model files, or binary assets. A future implementation may reuse a component only after exact-version dependency/asset/provenance review and satisfaction of all applicable terms and notices.

## How to read the evidence

The spikes use a shared vocabulary:

- **VERIFIED** — supported by a current first-party source or directly accessible product surface.
- **CODE-DERIVED** — established from a cited, publicly available source revision whose license permits inspection; it proves only that inspected revision, not every release, deployment, or undisclosed server behavior.
- **OBSERVED** — reproduced in the dated research environment on a named fixture; it is bounded evidence, not a universal benchmark.
- **INFERRED** — an engineering conclusion from verified/code-derived/observed evidence that still needs validation.
- **UNKNOWN** — not established by the available evidence.

“Processing deterministic” means a fixed canonical RGBA input, complete versioned recipe, and pinned engine produce identical canonical output pixels on the declared support matrix. The stronger public promise is “end-to-end strict deterministic”: fixed input bytes also pass through a pinned decoder/color path and produce the same canonical result or stable algorithmic error. Host watchdogs and user cancellation are operational outcomes, not deterministic profile decisions. A fixed seed, similar-looking reruns, or deterministic intent is not enough. “Exact target” means independent native output width and height, not block size, longest-side sizing, square presets, or an inferred logical grid.

## Dated inventory

| Spike | Question | One-line verdict |
|---|---|---|
| 2026-07-31 — [Cross-spike synthesis](SYNTHESIS.md) | Is the original product thesis feasible, and what should be locked versus tested? | Exact, local, deterministic geometry is feasible; automatic artistic quality must be profile-specific and benchmark-gated. |
| 2026-07-31 — [PixelLab](products/pixellab.md) | Can PixelLab be the deterministic implementation reference? | **No for the core:** useful workflow comparator, but relevant processing is remote/generative or undisclosed; explicit sizing exists only on some tools. *2026-10-19 addendum:* public API and MCP documentation recheck. |
| 2026-07-31 — [SpriteFusion Pixel Snapper](products/spritefusion-pixel-snapper.md) | How does this focused snapper work on near-grid sources, and where does its contract differ? | Promising specialized near-grid idea and MIT core reference; discovered geometry, square-grid assumptions, and local cell voting do not satisfy a general exact-target default. *2026-10-19 addendum:* repository recheck. |
| 2026-07-31 — [Unfaker / unfake.js](products/unfake-js.md) | Does its flexible workbench solve target-first conversion? | Broad control-surface reference, but scale-first selected-region behavior, tie/decode limits, and a GPL/commercial quantizer dependency prevent direct adoption under the current production plan. *2026-10-19 addendum:* later releases rechecked. |
| 2026-07-31 — [Commercial and web landscape](landscape/commercial-and-web-tools.md) | Does another current product already combine all required capabilities? | No clearly documented product combines exact W×H, alpha-bounds sizing, grid recovery, deterministic recipes, local processing, palette independence, and an MIT path. *2026-10-19 addendum:* additional tools; Retro Diffusion moved to its own spike. |
| 2026-07-31 — [Open-source ecosystem](landscape/open-source-ecosystem.md) | Is there a reusable open-source stack or complete converter? | No complete core exists; selected permissive resize/quantization primitives are promising, while Pixilate must own its product contracts and grid/topology logic. *2026-10-19 addendum:* additional projects, including some that predate the snapshot. |
| 2026-07-31 — [Deterministic algorithm state of the art](algorithms/state-of-the-art.md) | What pipeline can cover grids, mixels, and continuous raster without AI? | Use one canonical local engine with exact geometry and separate source-condition profiles; the proposed mixel ensemble remains an experiment. *2026-10-19 addendum:* prototype OBSERVED evidence and further literature. |
| 2026-07-31 — [Canonical RGBA geometry, alpha, and hash conformance (proposed)](algorithms/canonical-rgba-geometry-spike.md) | What is the smallest neutral contract that later research can trust? | Proposed R0 Slice A specification; execution, vectors, and production choices remain unauthorized. |
| 2026-10-19 — [Input provenance signals](algorithms/input-provenance-signals.md) | Which deterministic container and metadata signals can report a likely source generator without classifying pixels? | Report-only provenance (`FR-023`): file metadata claims with signatures not checked, no persisted prompts or usernames, and masking-only watermark handling. |
| 2026-07-31 — [Border-connected background and guarded cleanup (proposed)](algorithms/border-connected-background-cleanup-spike.md) | Can explicit border/tolerance/connectivity primitives improve masks without pretending to understand subject semantics? | Bounded `EX-010`/`EX-011` refinement; no measured result, default, or semantic-automatic claim. |
| 2026-07-31 — [Benchmark methodology](evaluation/benchmark-methodology.md) | How can “best” and deterministic claims be tested without a false universal score? | Separate hard conformance, recoverable ground truth, and ambiguous artistic usefulness; gate every claim by input stratum. |
| 2026-10-19 — [Pixel-art quality metrics](evaluation/pixel-art-quality-metrics.md) | Which prototype metrics can measure grid, palette, alpha, and craft quality? | Proposed metric definitions; the benchmark methodology governs corpus, splits, statistics, and claims, and every threshold is provisional. |
| 2026-10-19 — [AI artifact characterization](evaluation/ai-artifact-characterization.md) | How do general-purpose image generators fake pixel art, and how can a seeded degradation model reproduce those artifacts with exact ground truth? | Evidence-labelled artifact taxonomy and degradation model; local-sample measurements are local-only, not rights-cleared, and back no public claim. |
| 2026-10-19 — [Retro Diffusion Pixel Art Fixer](products/retro-diffusion-pixel-art-fixer.md) | How does this open specialist fixer detect and reduce grids, and where does its contract differ? | Dedicated spike replacing the landscape mini-spike; see the spike for its dated verdict. |

The companion [product requirements and design contract](../planning/product-requirements.md) translates the evidence into normative product behavior and phased scope.

The independent audit and correction disposition are recorded in [FINAL-REVIEW.md](../reviews/FINAL-REVIEW.md). The corrected corpus now includes a [documentation-only Slice A specification](algorithms/canonical-rgba-geometry-spike.md), but neither the research harness (Gate A/R0) nor product implementation (Gate B/R1) is authorized. *(2026-10-19: the owner-requested exploratory `prototype/` (`OWN-002`) is outside that sequence and passes no gate. Its design is in [prototype-algorithm-design.md](../planning/prototype-algorithm-design.md) and its results are in [prototype-v1-test-results.md](../reviews/prototype-v1-test-results.md).)*

## Coverage boundary

The landscape work is **bounded-exhaustive**, not proof that no obscure tool exists. It covered the owner-named products, current discoverable commercial/web converters, major editors and command-line tools, direct open-source pixel/mixel projects, conventional resamplers, palette/dither libraries, and deterministic background-selection candidates. Search stopped after the major implementation families repeated. Closed algorithms, inaccessible authenticated/paid paths, unpublished desktop internals, regional/non-indexed products, and future releases remain outside the evidence boundary. Product prices, service behavior, repository heads, licenses, and terms are dated facts and must be rechecked before publication or adoption.

*2026-10-19:* the dated landscape addenda record relevant projects that the 2026-07-31 search missed, some of which predate that snapshot. The bounded-exhaustive claim above is therefore weaker than first stated.

Hands-on observations are diagnostic probes, not the requested comparative benchmark. No spike establishes that a proposed Pixilate mixel algorithm is already superior. The benchmark plan is the mechanism for closing that gap.

## Recommended reading order

1. [SYNTHESIS.md](SYNTHESIS.md) for the product-level answer, conflicts, architecture hypothesis, risks, and gated decisions, including its 2026-10-19 addendum.
2. [product-requirements.md](../planning/product-requirements.md) for the current normative contract and scope tiers, including the [owner decision log](../planning/product-requirements.md#25-owner-decision-log).
3. [Canonical RGBA geometry, alpha, and hash conformance](algorithms/canonical-rgba-geometry-spike.md) before any R0 harness authorization.
4. [Border-connected background and guarded cleanup](algorithms/border-connected-background-cleanup-spike.md) for the bounded `EX-010`/`EX-011` follow-on.
5. The three priority product audits: [PixelLab](products/pixellab.md), [SpriteFusion](products/spritefusion-pixel-snapper.md), then [Unfaker](products/unfake-js.md).
6. [Commercial/web landscape](landscape/commercial-and-web-tools.md) and [open-source ecosystem](landscape/open-source-ecosystem.md) for breadth, alternatives, provenance, and dependency posture.
7. [Algorithm state of the art](algorithms/state-of-the-art.md) for the technical hypothesis.
8. [Benchmark methodology](evaluation/benchmark-methodology.md) before selecting defaults or making quality claims.
9. For the exploratory prototype: the [prototype algorithm design](../planning/prototype-algorithm-design.md), then the [prototype test results](../reviews/prototype-v1-test-results.md).
