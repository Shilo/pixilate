# Pixilate research-to-release master plan

**Working name:** Pixilate (temporary; naming is not a delivery dependency)  
**Status:** planning only; this document does not authorize implementation  
**Date:** 2026-07-31  
**Target:** local-first, deterministic, non-generative web application; Pixilate-owned code intended for MIT licensing, with every distributed third-party component retaining its approved terms and subject to dependency, asset, codec, and patent review
**Synthesis reconciliation:** 2026-07-31 — reconciled against [SYNTHESIS.md](../research-spikes/SYNTHESIS.md) and the [public-documentation review](../reviews/FINAL-REVIEW.md)

## 1. Outcome and planning stance

Pixilate should be developed as an evidence-gated image-processing product, not as a UI wrapped around a favored pixelation algorithm. The first executable work must establish a licensed corpus, canonical pixel contract, deterministic benchmark harness, and simple baselines. Product UI and automatic profile defaults follow only after those foundations can measure conformance, quality, failure boundaries, runtime, memory, and cross-runtime identity.

The product promise is deliberately bounded:

> For supported input bytes, a named strict engine build, and a complete versioned recipe, Pixilate either returns canonical pixels satisfying the exact requested geometry and declared palette/alpha constraints, or a stable typed error. Automatic modes are deterministic, expose evidence and fallbacks, and make no claim to recover artistic intent where the pixels do not determine it.

“Best algorithm,” “works for every image,” “pixel-perfect,” automatic background intent, and a stable Mixel default are not assumptions. They are claims that may be earned only within a named support tier and benchmark gate.

## 2. Planning principles and locked decisions

The following are locked unless the product requirements are explicitly amended:

1. **Exact target is authoritative.** A successful Tight resize returns exactly `W×H`; detected scale or grid never changes it (`GEO-001–005`, `FR-003`, `AC-GEO-001–002`).
2. **Trim has alpha semantics.** Trim uses oriented canonical alpha bounds, default `alpha > 0`; it is not background inference (`TRIM-001–006`, `FR-004`, `AC-TRIM-001–004`).
3. **Operations stay independent and composable.** Resize/Pixelate, Quantize/Palette, and Background Removal are separate features. The safe composed order is background → bounds → geometry → palette → optional dither/cleanup (`FR-009`, `FR-014–016`).
4. **Local, non-generative processing.** Core processing never uses AI, uploads pixels, or silently invokes a server. Browser-local/offline behavior is part of the product contract (`AUTO-001`, `FR-021`, `NFR-PRIV-001–005`).
5. **One strict processing path per engine ID.** Canvas, GPU, SIMD, browser decode, or compatibility paths may not be substituted invisibly (`DET-001–008`).
6. **Canonical pixels precede file bytes.** Pixel identity and encoded-file identity are separate claims (`OUT-004–005`).
7. **No hidden destructive defaults.** Background removal is explicit; cleanup and dithering are off by default until profile-specific gates pass (`AUTO-007`, `DITH-001`, `CLEAN-001`).
8. **Profiles name source conditions.** Exact Grid, Mixel, Raster, Line Art, No-op, and Background have immutable behavior versions. Low-confidence Auto falls back to Raster and explains why (`AUTO-003–008`).
9. **Distribution closure is a release constraint.** Pixilate-owned code is MIT. A third-party component enters a release only under an approved license/compliance design for the exact combined artifact; current GPL-only candidates are not approved for the MIT-core production bundle absent a deliberate release-license change or suitable commercial terms. LGPL/Wasm, codec patents, algorithms, and bundled assets require exact-build review (`NFR-LIC-001–007`).
10. **Research evidence precedes product defaults.** The held-out corpus, metrics, human evidence, and failure gallery—not attractive examples—select candidate algorithms (`G-010`, `AC-PRO-004`).

Planning assumptions that remain changeable through a recorded decision: Rust/Wasm is the leading engine hypothesis; PNG/JPEG/WebP/BMP are **candidate** strict static formats whose admitted set remains an `OD-002` result; full ICC handling, SIMD, quantizer, decoder set, Mixel scorer, public limits, and encoded PNG policy remain open.

## 3. Scope

### 3.1 MVP definition

The MVP is the first release that satisfies T1 in the product requirements:

- strict, bounded static import through the `OD-002`-approved local codec/color matrix; PNG/JPEG/WebP/BMP are candidates, not all precommitted guarantees;
- canonical orientation, color/alpha normalization, warnings, and supported-limit reporting;
- exact target `W×H`, Trim Tight, Stretch/Contain/Cover, deterministic anchors and rounding;
- PRO-NOOP, PRO-EXACT, and PRO-RASTER; PRO-MIXEL only if clearly experimental and its minimum gate passes; PRO-LINE is deferred to T2 research unless separately promoted through a documented gate;
- independent palette preservation, maximum visible-color cap, exact imported palette, no dither plus one provenance-audited ordered option if validated;
- native and nearest-neighbor enlarged previews with alpha/bounds/grid diagnostics;
- canonical PNG plus recipe JSON export/import and replay diagnostics;
- worker execution, cancellation, offline use, privacy, accessibility, resource limits, security checks, SBOM, notices, and MIT project materials.

MVP success does not require advanced background removal, automated cleanup, batch/animation, indexed PNG, a CLI, every codec, or a universally stable Mixel algorithm.

### 3.2 Post-MVP scope

- **T2:** exact/tolerant/border-connected/component background primitives; visible reorderable pipeline; mapped-margin/custom-canvas Trim restoration; palette locks/order and additional gated quantizers/dithers; formal optional cleanup; local named recipes; richer candidate comparison; gated GIF-frame and color-profile expansion.
- **T3:** batch/animation, shared grid/palette locks, collision-safe sequence export, indexed PNG/palette formats, structured grid exports, CLI/library reuse, additional codecs, and only evidence-justified segmentation or seeded graph cut.

**Explicit T1 release cut:** Phases 0–7 provide research evidence; Phases 9–14 are T1 release-blocking. Phase 8 may run as T2 exploratory research but its Background, Cleanup, and PRO-LINE outputs are nonshipping in T1 and do not block the T1 release. `FR-019` is T3 and has no delivery phase in this plan; it requires a separately authorized post-MVP plan.

### 3.3 Explicit non-goals

- Generative image creation, prompt workflows, semantic AI classifiers, or cloud processing.
- A guarantee of one correct artistic result for arbitrary raster art.
- A full sprite editor, animation suite, vectorizer, tilemap editor, or asset packer in MVP.
- Silent aesthetic cleanup, automatic semantic background deletion, or preservation of every detail at every target.
- Reimplementation of proprietary PixelLab/server behavior or copying closed assets/code.
- Seam carving in the initial core; browser-native decode as a strict deterministic oracle; a server fallback for convenience.
- Byte compatibility with all future versions. Old recipes are version-addressed and never silently migrated.

## 4. Architecture hypothesis and alternatives

### 4.1 Leading hypothesis

Use one pure Rust engine compiled to scalar WebAssembly for strict browser processing. Keep the browser canvas display-only. Run the Wasm engine in a dedicated worker behind a narrow typed bridge. Reuse the same pure engine from future native/CLI adapters only when cross-target conformance is proven.

Why this leads: one implementation minimizes semantic drift; Rust supports checked ownership and bounded buffers; Wasm is portable and offline-capable; an engine separated from UI is directly benchmarkable. This is still an experiment outcome, not a prematurely selected stack (`OD-001`).

### 4.2 Alternatives that must remain measurable

| Alternative | Potential benefit | Principal risk | Decision treatment |
|---|---|---|---|
| Constrained TypeScript engine | simplest web delivery/debugging | numeric/runtime variation, performance and memory pressure | benchmark against Rust/Wasm on canonical hashes, runtime, bundle, auditability |
| Focused C/C++ codecs compiled to Wasm | mature codec/color behavior | build complexity, memory safety, license closure | consider per codec only under `OD-002` |
| SIMD Wasm build | lower runtime | strict cross-host divergence and toolchain bugs | distinct engine ID until pixel-hash equivalence is proven |
| Native browser decode/canvas | broad availability, small bundle | browser-dependent pixels/color/alpha | compatibility mode only, never strict fallback |
| GPU/WebGPU processing | throughput | floating/order variance, security and compatibility surface | post-MVP research, separate engine identity |
| OpenCV/ImageMagick/libvips | wide algorithm surface | large bundle, dependencies, LGPL/build/security concerns | research oracle or isolated experiment; no adoption without unique measured value |
| Server processing | device-independent compute | violates local privacy/offline and adds determinism target | excluded from the core architecture |

### 4.3 Proposed future repository/component boundaries

No directories are created by this plan. When coding is authorized, keep boundaries conceptually as follows:

| Boundary | Responsibility | Forbidden coupling |
|---|---|---|
| `engine-core` | pure canonical image model, geometry, reducers, palette, masks, recipe execution, typed diagnostics | DOM, network, browser canvas, clocks, locale, unordered ambient randomness |
| `engine-codecs` | signature sniffing, bounded decode/encode, orientation, color policy | UI fallbacks or unversioned platform decode |
| `engine-wasm` | stable memory/worker ABI, cancellation checkpoints, structured errors | algorithm choices or display rendering |
| `web-app` | tabs, simple/advanced controls, accessible previews, local storage, offline shell | independent pixel processing or hidden setting defaults |
| `recipe-schema` | canonical serialization, validation, migrations/branching, version registry | executable code or remote resource resolution |
| `eval-fixtures` | procedural corpus generators, manifests, truth annotations, provenance | production runtime dependency |
| `eval-runner` | experiment matrix, metrics, artifacts, competitor capture adapters, reports | choosing defaults without a preregistered gate |
| `conformance` | cross-runtime golden vectors, decoder/color/alpha, hostile inputs, replay | ambiguous visual snapshots as exact truth |
| `docs` | product contract, algorithm decisions, support matrix, privacy/security/license/release docs | undocumented normative behavior elsewhere |

Dependency direction should point inward: UI/adapters → bridge → pure engine; evaluation may call the engine but production code never imports benchmark assets or competitor adapters.

## 5. Deterministic processing, recipe, and version contract

### 5.1 Canonical stage model

```text
input bytes
  → signature validation and bounded strict decode
  → orientation
  → pinned color conversion and canonical RGBA
  → optional explicit background mask stage
  → Trim/full-canvas basis
  → aspect/crop/pad/anchor geometry
  → named spatial candidate
  → named palette build/import/lock
  → palette map
  → optional named dither constrained to the fixed palette when a palette contract is active
  → optional named cleanup/topology guard constrained to palette indices when a palette contract is active
  → mandatory final palette/alpha validation; named serialized correction or typed contract failure
  → canonical pixels + diagnostics
  → pinned encoder and recipe sidecar
```

Every stage produces a typed success/error result and an actual stage trace. A declared stage may not be skipped silently. Final palette validation runs after every color-producing operation and proves the cap/imported-palette contract; any corrective remap is a named recipe stage, never an invisible fix. Alpha-zero RGB is excluded from analysis and normalized to `(0,0,0,0)` in the strict result. Fidelity filters operate in premultiplied linear light and use fixed coefficient, boundary, accumulator, clamp/gamut, unpremultiply-threshold, and rounding definitions. Negative-lobe kernels remain ineligible for a strict profile until those vectors pass; Slice A uses only nearest and nonnegative rational area.

### 5.2 Recipe contract

Canonical recipe serialization must include the fields in product requirements §14.2: schema, engine/build, strict/compatibility path, codec/color IDs, source hashes and orientation action, ordered stages, profile/evidence, mask/bounds, Trim, geometry, grid candidates, reducer/alpha/palette/dither/cleanup, seeds and ties, actual warnings/fallbacks, result hash, palette metadata, encoder identity, and separate noncanonical performance diagnostics.

Rules:

- canonical JSON has a specified UTF-8 encoding, normalized numbers, sorted/defined key order, and no nonfinite values;
- filenames, locale, clock timestamps, elapsed time, and UI state never affect canonical hashes;
- algorithms define traversal, stable total order, ties, accumulation, rounding, initialization, stopping, empty states, and PRNG if any;
- no fast-math, relaxed SIMD, unordered parallel reductions, or ambient random source in strict decision paths;
- hash domains are byte-level and domain-separated: `source-bytes-v1`, `canonical-rgba-v1`, `palette-v1`, `semantic-result-v1`, `recipe-input-v1`, `recipe-result-v1`, and `encoded-file-v1`; `canonical-rgba-v1` contains only its tag/schema, dimensions, and row-major RGBA8; palette metadata is separate;
- recipe-input identity omits derived result/file hashes; no encoded artifact embeds the hash of its own complete bytes;
- strict algorithm work limits (pixels, bytes, candidates, iterations, queue entries, graph edges, allocations) are recipe/engine rules; user cancellation and a host watchdog are noncanonical operational outcomes and never select pixels or become cached deterministic results;
- replay uses the exact engine/profile or fails. “Use current engine” creates a branched recipe and a new identity;
- behavior-changing algorithm/default work increments profile or engine behavior version; schema-only compatible additions use an explicit schema migration;
- byte-identical PNG is claimed only after encoder/filter/compression/chunk/order/metadata policy is pinned and tested.

### 5.3 No-AI and privacy contract

The shipped core contains no generative model, learned semantic classifier, remote inference, or content upload. Processing and recipes stay on-device. Telemetry is off for the first release; if introduced later it must be opt-in, content-free, independently disableable, and must never include filenames, image bytes/thumbnails, hashes, palette values, recipes, prompts, or derived visual features. A visible network/offline status and automated network audit enforce this contract.

## 6. Early experiment register

Every row produces a decision record; a failed hypothesis is a valid result. Numeric quality/performance thresholds that lack evidence are `TBD-BLOCKING` until the baseline phase fixes them.

| ID | Closes OD(s) | Scheduled phase | Open decision / hypothesis | Variants | Corpus | Primary metrics | Stop condition / gate | Owner role | Resulting artifact |
|---|---|---:|---|---|---|---|---|---|---|
| EX-001 | `OD-001` | 2 | Rust/Wasm is the best strict engine foundation | Rust scalar Wasm; constrained TS; scalar/SIMD probe | G/A/F/X + microbenchmarks | canonical hashes, runtime, memory, bundle, audit surface | choose only after Slice A vectors exist and a Pareto case is documented | engine lead | ADR: strict engine |
| EX-002 | `OD-002` | 3 | A pinned codec set yields canonical decode/color/alpha | Rust image-family; focused codecs; optional Little CMS; browser diagnostic | F/A/X | expected pixels, orientation, profile behavior, fuzz outcomes, cross-browser hashes | zero unexplained pixel differences; explicit accept/warn/reject table including HDR/narrow-range `cICP` | codec/security lead | codec/color support matrix |
| EX-003 | `OD-003` | 4 | Rational premultiplied-linear area is the safe baseline | exact area/box; triangle; Mitchell; Catmull; Lanczos3; nearest | H/L/P/A/T/O/U | exact dimensions, halo, edge, color, topology, runtime | retain Pareto set; negative-lobe candidates require complete clamp/gamut vectors | imaging researcher | raster reducer report |
| EX-004 | `OD-004` | 4 | Exact constant-block factorization reports valid candidates without inventing an original grid | all valid divisor factorizations; instructed source scale; contamination/refusal | G/I | valid factorizations, uniqueness/ambiguity, palette/alpha, period/phase | 100% validity only for instructed or formally uniquely identifiable fixtures; ambiguity preserved | engine/research | factorization ADR |
| EX-005 | `OD-004` | 6 | Approximate global evidence can be confidence-calibrated | edge/phase; autocorrelation; FFT; run-length; tile consensus; ensemble | I/M/G/P | period/phase, calibration, false-grid/refusal rate | no stable Auto use until held-out calibration and no-grid false-authority bound pass | research lead | grid confidence report |
| EX-006 | `OD-006` | 4, 7 | A categorical representative preserves intended structure | mean; mode; perceptual-binned mode; medoid; center; edge-aware | G/I/M/L/T/O | detail/edge/topology, rare-feature recall, artist preference | select by profile/stratum; stable tie contract required | imaging researcher | cell reducer decision |
| EX-007 | `OD-007` | 5 | A permissive quantizer meets cap and quality needs | Wu; quantette; owned Wu+fixed Lloyd/Oklab; exoquant; image-q; libimagequant research oracle | all visual + A | cap/locks, color error, rare colors, preference, runtime, hash, license | zero cap violations; deterministic finalist with approved exact-artifact license closure | color researcher + license reviewer | quantizer ADR |
| EX-008 | `OD-008` | 5 | One optional dither adds deliberate value | none; Bayer; audited blue noise; fixed-point FS/Sierra/Atkinson | P/H/U/M | color/gradient, introduced components, preference, hashes | none remains default; ship variant only with provenance and stratum benefit | color researcher | dither report |
| EX-009 | `OD-005` | 7 | Mixel candidate ensemble beats simple baselines | area; medoid; global-grid alternatives; eligible irregular-boundary DP; optional segmentation advisory; weighted vs lexicographic score | M plus I/H/L controls | held-out preference, rank correlation, topology/detail, regression, runtime | stable only after `AC-PRO-004`; DP requires target/basis eligibility and explicit complexity bounds | research lead + artist panel | Mixel profile decision |
| EX-010 | `OD-010` | 8 | Deterministic primitive background tools cover useful cases | exact global; exact border; tolerance; border flood; component rules | B/A | mask/boundary/halo, semantic failure taxonomy, hashes | primitives meet exact semantics; no universal automatic claim | mask researcher | background primitive ADR |
| EX-011 | `OD-009` | 8 | Cleanup can reduce accidental noise safely | none; components; neighborhood energy; morphology; topology guard | M/T/O/L | introduced-noise precision, protected-detail recall, components/holes, preference | remain off unless blinded gain and protected-feature margins pass | imaging researcher | cleanup decision |
| EX-012 | `OD-011` | 12 | Public limits and budgets can be supported | 4/10/16 MP and boundary/hostile cases; representative desktop/mobile | performance + X | p50/p95, memory, cancellation, startup/bundle | publish only passing minimum-device limits; otherwise lower with reason | performance/security lead | limits/SLO ADR |
| EX-013 | `OD-012` | 11 | Recipe/encoder replay can be durable | sidecar; non-self-referential compact PNG reference; encoder choices | all goldens | canonical replay, domain-separated hashes, metadata/privacy | exact replay or typed unavailable-engine failure; byte claim separately gated | architecture lead | recipe/encoding ADR |
| EX-014 | none; release evidence | 13 | Comparative value is real | Pixilate baselines; pinned PixelLab surfaces; SpriteFusion; Unfaker; conventional tools | approved synthetic/CC0 subset | capability, native-task quality, repeatability, cost/privacy, failure rate | fair frozen protocol; unsupported is not scored as zero | evaluation lead | comparative report |

## 7. Dependency-ordered delivery phases

Each phase ends in a decision gate. A later phase may prototype behind an experimental flag but may not declare a default whose prerequisite gate is open.

### Phase 0 — Governance, claims, and decision machinery

**Scope class:** T0 research governance; Gate A prerequisite.  
**Goal:** freeze what the project is allowed to claim and how evidence changes behavior.  
**Prerequisites:** product requirements accepted as planning baseline.  
**Deliverables:** support-tier/claim matrix; decision-record template; experiment preregistration template; dependency/asset intake checklists; ownership and review map; working-name disclaimer.  
**Requirements:** `G-002`, `G-008`, `G-010`, `NG-001`, `NG-002`, `NG-003`, `NG-004`, `NG-005`, `NG-006`, `NG-007`, `NG-008`, `NG-009`, `NFR-LIC-001`, `NFR-LIC-002`, `NFR-LIC-003`, `NFR-LIC-004`, `NFR-LIC-005`, `NFR-LIC-006`, `NFR-LIC-007`. `US-001` through `US-012` are rationale inputs, not phase-closeable requirements.  
**Tasks:** resolve blocking ambiguities in canonical, Trim, target, palette, background order, hash, and error language; register `OD-001` through `OD-012`; approve change-control and held-out test access.  
**Gate / exit:** every hard invariant has an owner and verification path; no universal-quality claim remains; no algorithm default is treated as selected.  
**Risk / fallback:** unresolved product semantics block downstream API design; retain narrower claims and typed refusal.

### Phase 1 — Corpus, licenses, and benchmark specifications

**Scope class:** T0 research governance; Gate A prerequisite and continuing corpus work.  
**Goal:** make evaluation legal, reproducible, and statistically honest before algorithm work.  
**Prerequisites:** Phase 0.  
**Deliverables:** CC0 procedural-fixture policy; commission/consent requirements; asset manifest and datasheet schemas; rights/privacy/trademark review; family-based dev/validation/release splits; removal/tombstone process; metric specifications and reference vectors; hostile-fixture safety policy.  
**Requirements:** `G-008`, `G-010`, `NFR-LIC-001`, `NFR-LIC-002`, `NFR-LIC-003`, `NFR-LIC-004`, `NFR-LIC-005`, `NFR-LIC-006`, `NFR-LIC-007`, `NFR-SEC-001`, `NFR-SEC-002`, benchmark policy §18.  
**Tasks:** seed G/I/A/F/X mathematical specifications; define ambiguous/multi-reference protocol; freeze Fast CI/Release/Research corpus roles; inventory AI-output terms and keep uncertain pixels outside public/required CI.  
**Gate / exit:** every admitted asset has provenance/license; fixture math is independently reproducible; metric applicability/empty cases are explicit.  
**Risk / fallback:** rights-cleared real Mixel data may be sparse; use procedural/commissioned AI-like cases for public CI and private approved inputs only as nonredistributable supplementary evidence.

### Phase 2 — Headless evaluation and determinism harness

**Scope class:** T0 research harness; first code-bearing phase, permitted only by Gate A.  
**Goal:** create the mechanism that evaluates all later algorithms before any product UI.  
**Prerequisites:** Phase 1 schemas and fixtures.  
**Deliverables:** dependency-clean Slice A; future headless runner; domain-separated canonical input/recipe/output hash formats; immutable result schema; artifact store by hash; metric runner; golden governance; performance instrumentation; competitor capture schema; report generator; `OD-001` decision record only after Slice A supplies neutral vectors.  
**Requirements:** `DET-001`, `DET-002`, `DET-003`, `DET-004`, `DET-005`, `DET-006`, `DET-007`, `DET-008`, `OUT-004`, `OUT-005`, `AC-DET-001`, `AC-DET-002`, `AC-SEC-001`.  
**Tasks:** execute Slice A from §15; implement cross-process repetition, tie-heavy loops, environment manifests, typed failures, cold/warm measurements, and no-auto-update golden workflow. Run `EX-001` only if the owner's Gate A authorization separately names that follow-on; Slice A itself never selects the production engine.  
**Gate / exit:** a trivial reference transform runs reproducibly across the initial matrix; malformed results/schema fail closed; reports preserve errors and unsupported cases.  
**Risk / fallback:** full browser matrix may not be available in ordinary CI; require a small blocking core matrix plus scheduled/release hardware runners.

### Phase 3 — Canonical decode, color, alpha, and geometry

**Scope class:** T0 research conformance; produces evidence for Gate B.  
**Goal:** establish canonical source pixels and exact coordinate semantics independently of artistic algorithms.  
**Prerequisites:** Phase 2.  
**Deliverables:** `OD-002` decision record; signature/limit table; per-format decode/encode/license/patent/security record; orientation and profile behavior; canonical RGBA/alpha-zero policy; Trim/full-canvas implementation spec; exact target/aspect/anchor/rational footprint spec including extreme-aspect zero-axis policy; typed error registry.  
**Requirements:** `G-001`, `G-004`, `FMT-001`, `FMT-002`, `FMT-003`, `FMT-004`, `FMT-005`, `FMT-006`, `FMT-007`, `ALPHA-001`, `ALPHA-002`, `ALPHA-003`, `ALPHA-004`, `ALPHA-005`, `GEO-001`, `GEO-002`, `GEO-003`, `GEO-004`, `GEO-005`, `TRIM-001`, `TRIM-002`, `TRIM-003`, `TRIM-004`, `TRIM-005`, `TRIM-006`, `FR-001`, `FR-003`, `FR-004`, `FR-005`, `FR-011`, `AC-GEO-001`, `AC-GEO-002`, `AC-TRIM-001`, `AC-TRIM-002`, `AC-TRIM-003`, `AC-TRIM-004`, `AC-ALPHA-001`.  
**Tasks:** run `EX-002` only within owner-authorized Gate A follow-on scope; run F/A/X conformance, overflow/allocation boundaries, all-transparent and hidden-RGB fixtures, round-half-to-even/odd-remainder and zero-minor-axis boundary goldens.  
**Gate / exit:** identical strict canonical hashes on declared platforms; zero valid-case dimension errors; every metadata/profile case accepts, warns, or rejects explicitly.  
**Risk / fallback:** full ICC adds excessive bundle/security variance; ship a narrower strict profile matrix and reject/warn unsupported metadata rather than using browser conversion silently.

### Phase 4 — Baseline spatial reduction and no-op/exact recovery

**Scope class:** T0 research baseline; T1 profile evidence.  
**Goal:** provide honest reference behavior and prove lossless claims where mathematically possible.  
**Prerequisites:** Phase 3.  
**Deliverables:** `OD-003`, initial `OD-004`, and `OD-006` decision records; area/nearest/conventional candidate report; PRO-NOOP; exact constant-block factorization with ordered candidates and ambiguity; severity curves; Grid-safe conflict policies.  
**Requirements:** `FR-006`, `PRO-NOOP`, `PRO-EXACT`, `AC-PRO-001`, `AC-PRO-002`, `AC-PRO-005`.  
**Tasks:** run `EX-003`, `EX-004`, and `EX-006` on G/I/A/L/T/O; preserve palette/alpha on instructed or uniquely identifiable fixtures; characterize equal-adjacent, uniform, nested-block, contamination, and harmonic ambiguity; prohibit silent target changes.  
**Gate / exit:** no-op is pixel-identical; every valid factorization is reported, and original-grid identity is claimed only for instructed or formally uniquely identifiable cases; raster Pareto baselines and initial measured budgets are frozen.  
**Risk / fallback:** if one reducer does not dominate, keep named profile-specific alternatives and a conservative area baseline.

### Phase 5 — Palette, quantization, and dither research

**Scope class:** T0 research baseline; T1 palette evidence.  
**Goal:** select deterministic, MIT-compatible palette primitives without coupling them to geometry.  
**Prerequisites:** Phases 2–4.  
**Deliverables:** quantizer bake-off; palette import/normalization/order contract; lock/transparent-slot semantics; final enforcement pass; optional dither report; dependency provenance.  
**Requirements:** `G-005`, `G-007`, `PAL-001`, `PAL-002`, `PAL-003`, `PAL-004`, `PAL-005`, `PAL-006`, `PAL-007`, `DITH-001`, `DITH-002`, `DITH-003`, `DITH-004`, `DITH-005`, `FR-009`, `FR-010`, later `FR-016`, `AC-PAL-001`, `AC-PAL-002`, `AC-DITH-001`.  
**Tasks:** run `EX-007` and `EX-008`; test caps, exact palettes, duplicate locks, ties, empty clusters, alpha weighting, post-cleanup/post-matte final validation; keep modern libimagequant isolated as a research oracle not approved for the current production bundle unless its distribution terms are deliberately adopted.  
**Gate / exit:** zero overflow/forbidden colors, exact deterministic ties, approved license closure, quality/runtime Pareto selection.  
**Risk / fallback:** ship preserve/import plus a simpler audited quantizer; do not trade MIT closure for oracle quality.

### Phase 6 — Approximate grid recovery and confidence

**Scope class:** T0 research baseline; T1 Auto evidence.  
**Goal:** determine whether approximate grid evidence can route safely.  
**Prerequisites:** exact/raster baselines and evaluation corpus.  
**Deliverables:** global period/phase candidate set; tile consensus; confidence calibration; false-grid and refusal report; manual period/phase contract.  
**Requirements:** `AUTO-001`, `AUTO-002`, `AUTO-003`, `AUTO-004`, `AUTO-005`, `AUTO-006`, `AUTO-008`, `FR-006`, `FR-007`, `AC-PRO-002`, `AC-PRO-003`.  
**Tasks:** run `EX-005` on G/I/M plus no-grid H/P controls; measure harmonics, phase, contamination, crop/padding; serialize evidence and alternatives.  
**Gate / exit:** confidence bands have held-out calibration; ambiguous/no-grid cases fall back to PRO-RASTER without geometry change.  
**Risk / fallback:** if classification is not reliable, remove automatic grid routing and offer explicit profiles/manual hints.

### Phase 7 — Mixel candidates and scoring

**Scope class:** T0 research differentiator; provisional T1 experimental-profile evidence.  
**Goal:** test Pixilate’s research differentiator against simple and specialist baselines.  
**Prerequisites:** Phases 4–6; rights-cleared M corpus and human pilot.  
**Deliverables:** bounded candidate generator; irregular-boundary DP experiment; scoring ablations; held-out report/failure gallery; artist study; provisional PRO-MIXEL version or rejection decision.  
**Requirements:** `G-003`, `G-010`, `PRO-MIXEL`, `FR-006`, `FR-007`, `AC-PRO-004`, `NFR-PERF-004`.  
**Tasks:** run `EX-006` and `EX-009`; enforce irregular-boundary eligibility (`target cells ≤ basis samples`, positive gaps, displacement band, bounded time/memory) with typed fallback; compare Pixel Snapper/Unfaker on native grid-recovery tasks and conventional exact-target baselines; preserve alternatives and component scores.  
**Gate / exit:** stable eligibility requires held-out noninferiority/wins, bounded stratum regressions, expert preference, explainable confidence, and budget compliance.  
**Risk / fallback:** ship Mixel as Experimental with candidate chooser, or omit it from Auto/MVP while exact/raster value remains valid.

### Phase 8 — T2 expert primitives: background, cleanup, and line art

**Scope class:** T2 exploratory/nonshipping during the T1 release cycle; not a T1 prerequisite.  
**Goal:** evaluate predictable mask primitives, formal cleanup, and PRO-LINE separately from the T1 core.  
**Prerequisites:** canonical alpha, B corpus, mask metrics.  
**Deliverables:** `OD-009` and `OD-010` decision records; exact/tolerance key, global/border-connected semantics, 4/8 flood, component rules, mask diagnostics, matte-decontamination experiment; cleanup decision; PRO-LINE research report; graph-cut adoption decision later.  
**Requirements:** `BG-001`, `BG-002`, `BG-003`, `BG-004`, `BG-005`, `BG-006`, `BG-007`, `BG-008`, `CLEAN-001`, `CLEAN-002`, `CLEAN-003`, `CLEAN-004`, `CLEAN-005`, `CLEAN-006`, `FR-014`, `FR-015`, `FR-017`, `AC-BG-001`, `AC-BG-002`, `AC-CLEAN-001`, `PRO-LINE`.  
**Tasks:** run `EX-010` and `EX-011`; evaluate PRO-LINE with variants from `EX-003` and `EX-006`; validate holes, border-touching subjects, shared colors, partial alpha, threshold equality, cleanup diffs/topology, and downstream Trim invalidation/recompute.  
**Gate / exit:** repeatable masks and exact primitive semantics; cleanup remains off unless its gate passes; PRO-LINE stays T2 experimental unless separately promoted; none is included in the T1 release artifact.  
**Risk / fallback:** stop at exact and border-connected primitives; omit cleanup/PRO-LINE if evidence is weak; graph cut remains post-MVP unless bundle/license/quality justify it.

### Phase 9 — Browser/Wasm integration foundation

**Scope class:** T1 release-blocking product implementation; requires Gate B.  
**Goal:** expose the proven engine locally without changing its results.  
**Prerequisites:** core contracts from Phases 2–5; later profiles can plug in.  
**Deliverables:** stable bridge ABI; worker scheduling; cancellation checkpoints; bounded transfer/buffer ownership; progress events; offline application shell; engine capability query.  
**Requirements:** `G-009`, `FR-021`, `FR-022`, `NFR-PERF-002`, `NFR-PERF-003`, `NFR-PRIV-001`, `NFR-PRIV-002`, `NFR-PRIV-003`, `NFR-PRIV-004`, `NFR-PRIV-005`, `AC-CAN-001`, `AC-OFF-001`, `AC-PRIV-001`.  
**Tasks:** prove preview/export use the same engine/recipe; test cancellation and last-valid-preview behavior; block hidden browser/canvas processing fallbacks.  
**Gate / exit:** bridge goldens match headless hashes; network audit is clean; offline flow and cancellation pass on reference devices.  
**Risk / fallback:** lower validated resource limits; preserve scalar strict path and label faster variants separately.

### Phase 10 — Simple/advanced UX and feature tabs

**Scope class:** T1 release-blocking product implementation; T2 Background/Cleanup/PRO-LINE UI is explicitly deferred.  
**Goal:** expose exact-target value with safe defaults and inspectable expert control.  
**Prerequisites:** engine/bridge contracts and selected baseline profiles.  
**Deliverables:** T1 Resize/Pixelate and Quantize/Palette tabs; simple target/Trim/fit/profile/palette flow; advanced T1 taxonomy; overlays; native/nearest views; warnings/errors; accessible textual diagnostics. Background, Cleanup, PRO-LINE, mapped-margin, and named-profile UI remain T2 work even if Phase 8 research exists.  
**Requirements:** `G-006`, `AUTO-007`, `FR-002`, `FR-004`, `FR-007`, `FR-008`, `NFR-A11Y-001`, `NFR-A11Y-002`, `NFR-A11Y-003`, `NFR-A11Y-004`, `NFR-A11Y-005`, `NFR-A11Y-006`, `AC-A11Y-001`. Deferred T2 requirements: `FR-014`, `FR-015`, `FR-016`, `FR-017`, `FR-018`, `FR-020`.  
**Tasks:** usability tests for target/Trim understanding, keyboard-only flow, screen-reader announcements, high contrast/reflow/reduced motion, crop/loss warnings, advanced settings serialization.  
**Gate / exit:** full MVP workflow completes without pointer/color dependence; UI never hides effective dimensions/profile/fallback; every material constant is recipe-visible even if not editable.  
**Risk / fallback:** reduce advanced surface to named presets plus recipe inspection; do not expose unvalidated tuning as stable quality controls.

### Phase 11 — Import, export, recipe replay, and local persistence

**Scope class:** T1 release-blocking product implementation; T2 named local recipes are excluded from the T1 cut.  
**Goal:** make outputs durable and reproducible.  
**Prerequisites:** stable recipe schema, engine registry, web integration.  
**Deliverables:** canonical PNG; recipe JSON; import/validation/replay; unavailable-engine branch flow; domain-separated canonical/semantic/encoded hashes; collision-safe download. Named local recipes (`FR-018`) remain T2.  
**Requirements:** `OUT-001`, `OUT-002`, `OUT-003`, `OUT-004`, `OUT-005`, `OUT-006`, `FR-012`, `FR-013`, `DET-008`, `AC-DET-003`. Deferred T2 requirement: `FR-018`.  
**Tasks:** run `EX-013`; prohibit hash self-reference; corrupt/untrusted recipe fuzzing; atomic export; local-state deletion; schema compatibility and migration tests.  
**Gate / exit:** supported recipes replay to stored canonical hash; unavailable versions fail without substitution; failed/cancelled output cannot be downloaded as success.  
**Risk / fallback:** sidecar remains authoritative; defer embedded PNG metadata and byte-identical file claims.

### Phase 12 — Hardening, performance, security, and accessibility closure

**Scope class:** T1 release-blocking hardening; requires Gate B and an integrated T1 candidate.  
**Goal:** turn measured functionality into a defensible public MVP.  
**Prerequisites:** integrated MVP candidate.  
**Deliverables:** final resource limits/SLO report; fuzz/adversarial suite; CSP/offline policy; dependency/vulnerability scans; accessibility audit; browser/device support matrix; recovery/error tests.  
**Requirements:** `NFR-PERF-001`, `NFR-PERF-002`, `NFR-PERF-003`, `NFR-PERF-004`, `NFR-PERF-005`, `NFR-SEC-001`, `NFR-SEC-002`, `NFR-SEC-003`, `NFR-SEC-004`, `NFR-SEC-005`, `NFR-SEC-006`, `NFR-A11Y-001`, `NFR-A11Y-002`, `NFR-A11Y-003`, `NFR-A11Y-004`, `NFR-A11Y-005`, `NFR-A11Y-006`, `AC-SEC-001`, `AC-CAN-001`, `AC-A11Y-001`.  
**Tasks:** run `EX-012`; define per-parser metadata/profile/chunk/frame/recipe/palette limits, checked stride and aggregate live-byte accounting; distinguish deterministic `algorithm-budget-exceeded` from noncanonical `host-watchdog-timeout`; test decode bombs, overflow, hostile metadata, 4/10/16 MP boundaries, memory, bundle, cancellation, and accessibility.  
**Gate / exit:** hard security/conformance gates pass; public limits reflect the weakest supported device; any dependency >1 MiB compressed has evidence and an approved alternative analysis.  
**Risk / fallback:** narrow formats/limits/browser support; never silently exceed validated memory or substitute unsafe decode.

### Phase 13 — Comparative validation and release qualification

**Scope class:** T1 release-blocking qualification; validates only the frozen T1 shipped-scope manifest.  
**Goal:** verify product claims and value against frozen baselines without unfair task adaptation.  
**Prerequisites:** release candidate, frozen release corpus and experiment plan.  
**Deliverables:** capability matrix; task-specific quality report; remote-repeat/drift observations; human study for changed defaults; failure gallery; regression report; claim-to-gate decision.  
**Requirements:** `G-010`, `AC-GEO-001`, `AC-GEO-002`, `AC-TRIM-001`, `AC-TRIM-002`, `AC-TRIM-003`, `AC-PRO-001`, `AC-PRO-002`, `AC-PRO-003`, `AC-PRO-004`, `AC-PRO-005`, `AC-PAL-001`, `AC-PAL-002`, `AC-ALPHA-001`, `AC-DITH-001`, `AC-DET-001`, `AC-DET-002`, `AC-DET-003`, `AC-PRIV-001`, `AC-OFF-001`, `AC-SEC-001`, `AC-CAN-001`, `AC-A11Y-001`, `AC-LIC-001`. `AC-TRIM-004`, `AC-CLEAN-001`, `AC-BG-001`, and `AC-BG-002` are T2 and excluded unless separately promoted before freeze.  
**Tasks:** run `EX-014`; compare exact-target conformance separately from grid recovery; capture versions/settings/hashes/cost/privacy; use only approved upload fixtures; run release browser/architecture matrix. Human panel sizes, corpus counts, and regression margins remain `PROVISIONAL-PILOT` until power/sensitivity and crossed judge/asset analysis establish claim-specific values.  
**Gate / exit:** every advertised claim passes its profile/stratum gate; unsupported, error, refusal, and adapted workflows are labeled rather than numerically disguised.  
**Risk / fallback:** external product access/drift may block fresh comparisons; publish dated reproducible observations and base release claims on owned deterministic baselines.

### Phase 14 — Documentation and MIT open-source release

**Scope class:** T1 release cut and publication; releases only the frozen T1 manifest.  
**Goal:** ship an auditable project whose claims, risks, and reproduction path are clear.  
**Prerequisites:** Phase 13 and license/security approval.  
**Deliverables:** MIT license for owned code; third-party notices; artifact-derived SBOM; source and reproducible build instructions; architecture/recipe/algorithm docs; support/limit/browser matrix; privacy/security policy and vulnerability reporting; corpus datasheet; benchmark report; failure boundaries; accessibility statement; changelog and migration notes.  
**Requirements:** `NFR-LIC-001`, `NFR-LIC-002`, `NFR-LIC-003`, `NFR-LIC-004`, `NFR-LIC-005`, `NFR-LIC-006`, `NFR-LIC-007`, `NFR-PRIV-001`, `NFR-PRIV-002`, `NFR-PRIV-003`, `NFR-PRIV-004`, `NFR-PRIV-005`, `NFR-SEC-005`, `AC-LIC-001`.  
**Tasks:** scan source, lockfiles, Wasm/object closure, matrices/noise/assets, codecs and patents; verify no proprietary code/assets; sign/attest release artifacts where practical.  
**Gate / exit:** release CI produces reviewed SBOM/notices and passes all hard gates; docs match the exact shipped engine/profile IDs; download can be built and used offline from published source.  
**Risk / fallback:** remove or replace any component lacking closure; delay a format/profile rather than weakening MIT or privacy claims.

### Deferred post-MVP disposition

- **T2:** Phase 8 research may inform a separately authorized T2 delivery plan for `PRO-LINE`, `FR-014`, `FR-015`, `FR-016`, `FR-017`, `FR-018`, `FR-020`, `AC-TRIM-004`, `AC-CLEAN-001`, `AC-BG-001`, and `AC-BG-002`. No T2 UI or release claim is implied by completing the research.
- **T3:** `FR-019` (batch/animation with shared locks and collision-safe export) is explicitly deferred. No Phase 0–14 deliverable implements or accepts it. A post-MVP plan must define its frame/sequence semantics, security limits, corpus, and acceptance criteria before authorization.

## 8. Testing strategy and CI determinism matrix

### 8.1 Testing pyramid

| Layer | Purpose | Examples | Cadence |
|---|---|---|---|
| Pure unit/property | exhaust arithmetic and invariants cheaply | rational overlaps, rounding, bounds, alpha, tie orders, palette caps, graph connectivity, schema canonicalization | every change |
| Golden conformance | exact truths only | decode/orientation/color, Trim, exact geometry, no-op, instructed/uniquely identifiable grid cases, valid factorization sets, masks, adversarial ties | every change, fast subset |
| Metamorphic/differential | find hidden coupling | alpha-zero RGB invariance, margin equivalence, stage identity, scalar/reference comparisons | every change/scheduled |
| Fuzz/security | fail safely | codecs, recipe/palette parsers, dimensions/strides, hostile metadata | continuous/scheduled + release |
| Engine integration | enforce actual stage/recipe behavior | composed pipeline, warnings/fallbacks, replay, cancellation | every change |
| Browser E2E/a11y/offline | prove user contract | import → target/Trim → process → review → export/replay; keyboard/screen reader; network disabled | blocking representative subset + nightly |
| Corpus quality/performance | select and protect profiles | per-stratum metrics, ablations, p50/p95/memory/bundle | scheduled; full release |
| Human/comparative | evaluate ambiguity and external value | blinded expert study; frozen competitor protocol | before visual-default/claim changes |

Ambiguous outputs get invariant/metric envelopes and human evidence, not self-referential pixel goldens. Golden updates require a separate reviewed record and behavior version where pixels change.

### 8.2 Determinism matrix

| Matrix | Blocking policy |
|---|---|
| Native/reference scalar engine on Windows/Linux/macOS x86-64 and ARM64 where shipped | all canonical vectors identical |
| Wasm scalar on supported Chrome, Firefox, Safari, Edge; x86-64 and ARM64 reference hosts | all strict golden hashes identical (`DET-007`, `AC-DET-002`) |
| SIMD/threads versus scalar | identical or assigned a distinct engine ID; no runtime silent switch |
| cold/warm, worker counts 1/2/4 where exposed, new process | identical canonical output and trace |
| debug/release/compiler optimization/toolchain candidate | release toolchain pinned; pixel divergence blocks upgrade or creates behavior version |
| repeated tie/numeric cases | twice in Fast CI, 100 times for tie subset, 10 per release environment, 1,000 adversarial attempts across release matrix |

If Safari/ARM infrastructure is unavailable per-commit, a minimal browser matrix blocks changes and the complete matrix blocks release. Unverified browsers use compatibility labeling, not the strict claim.

## 9. Performance budgets and measurement gate

The product-requirements planning baseline proposes 4 MP → ≤256×256 raster p95 ≤2.0 s after engine load, cancellation acknowledgement ≤250 ms, large-buffer release ≤1 s, and explicit scrutiny for dependencies adding >1 MiB compressed. These values are `PROPOSED` hypotheses until `EX-012`/`OD-011` measures named reference hardware and records `APPROVED-BUDGET`, `MEASURED-BASELINE`, or `RELEASE-LIMIT` status. They must not be silently relaxed.

Strict algorithms stop only on deterministic work budgets serialized by the engine/profile: checked input/output/allocation bytes, pixels, candidates, iterations, queue entries, graph edges, and other bounded operations. A user cancellation or host wall-clock watchdog depends on scheduling/device conditions and is therefore a noncanonical operational outcome. It returns `cancelled` or `host-watchdog-timeout`, must not choose a lower-quality candidate, and must not be cached or advertised as the deterministic recipe result. A deterministic internal exhaustion returns `algorithm-budget-exceeded`.

Before public limits are fixed, measure decode, normalize, analysis, resize, quantize, masks, encode, and end-to-end independently on tiny, 256², 1024², 4 MP, 10 MP, proposed maximum, high-color noise, mostly transparent, sheet, and just-over-limit inputs. Report cold and warm distributions, p50/p90/p95, peak Wasm/process memory, major allocations, cancellation, startup, and compressed bundle. Mixel and advanced masks receive separate budgets and never inherit baseline SLOs.

If a budget fails, fallback order is: optimize without behavior change; lower validated limit; make the expensive profile explicit/experimental; split an optional dependency; or omit the feature. Server fallback and hidden lower-quality processing are not acceptable fallbacks.

## 10. Dependency, license, and provenance policy

- Pin exact versions/features and toolchains; forbid floating production dependencies.
- Require SPDX/license evidence, source origin, notices, transitive closure, security history, bundle effect, determinism impact, and replacement option before adoption.
- Produce SBOM/notices from the built release, including Wasm/object inputs and bundled threshold/noise/color assets.
- Pixilate-owned code remains MIT. Current GPL-only candidates are not approved for the MIT-core production bundle absent a deliberate release-license change or suitable commercial terms. LGPL/MPL and other retained-license components require exact-artifact compliance design rather than categorical exclusion.
- Treat code copyright, algorithm patent, codec patent grant, model/output terms, fonts/art/assets, privacy/publicity, and trademarks as separate reviews.
- Proprietary competitor code and undocumented behavior are observation only. Permissive reused code keeps required notices; independent implementation from identified public specifications/papers records provenance. “Clean-room” is used only if a formal evidence-separation protocol is adopted and reviewed.
- Research oracles live outside release linkage and may not leak source or assets into owned implementation.

## 11. Threat and abuse considerations

| Threat | Control |
|---|---|
| decompression/metadata bomb, integer overflow, allocation exhaustion | header-first validation where supported; checked stride/allocation arithmetic; per-parser encoded/decompressed metadata, dimension, pixel, chunk, frame, depth, count, string, queue, candidate, and aggregate live-byte limits; controlled allocation failure |
| malformed codec/parser exploit | pinned hardened decoders, fuzzing, worker concurrency containment, prompt patching, typed fail-closed errors; a Worker is not treated as a separate security origin |
| stale/partial export after cancellation/failure | task identity, last-valid preview, atomic in-memory completion, no success download until hashes verify |
| malicious recipe/palette | data-only schema, size/depth/string/count limits, no code/URL/path/plugin resolution, canonical validation |
| supply-chain compromise | lockfiles, artifact provenance, vulnerability/license scans, restrictive CSP, no runtime eval/remote scripts |
| privacy leakage | no pixel/content telemetry, local processing, explicit export destinations, network audit, deletable local state |
| adversarial complexity in quantizer/grid/graph algorithms | deterministic work budgets for iterations/candidates/queues/edges/allocations; separate noncanonical cancellation and host watchdog outcomes |
| misleading result/claim abuse | visible profile/confidence/fallback, native dimensions, warnings, support tiers, no semantic-certainty claims |
| untrusted image rights or harmful imagery | local-only processing; no central image collection; public corpus governance and takedown/tombstone process |

## 12. Observability without image telemetry

Local diagnostics may record stage durations, peak buffers, engine/profile/version, typed error/warning codes, dimensions and counts only while visible to/exported by the user. Default public telemetry is none. If opt-in aggregate telemetry is ever proposed, a privacy review must show that it contains no image bytes, thumbnails, filenames, paths, hashes, colors/palettes, recipes/settings combinations, crop/mask geometry, prompts, or derived visual fingerprints. Logs must be bounded, inspectable, clearable, and redact local paths. Reproducibility bundles are explicit user exports, not telemetry.

Operational health can be measured with synthetic sentinel inputs and deployment metrics (asset fetch success, version adoption, uncaught UI error code) that contain no user-image information.

## 13. Release, versioning, and migration strategy

- Version recipe schema, engine behavior, every profile, decoder/color pipeline, encoder policy, corpus, metrics, and benchmark report independently.
- Use semantic project releases, but never infer pixel compatibility solely from project SemVer.
- Keep immutable behavior IDs. Fixes that change canonical pixels require a new engine/profile version and golden change record.
- Compatible schema readers may add optional fields only with deterministic defaults defined by schema version. Incompatible recipes fail with an actionable code.
- Opening an old recipe uses its engine if bundled/available; otherwise offer explicit branching to the current engine. Never overwrite the original identity.
- Release channels: research build → alpha (contracts/harness) → beta (quality gates incomplete, prominently labeled profiles) → release candidate (frozen corpus/toolchain) → stable.
- Publish checksums, build provenance, SBOM, notices, support matrix, known failures, migration notes, and the exact claim-to-gate report.
- Maintain a deprecation window for recipe readers and publish offline engine bundles or a reproducible source tag where practical. Security removals may make an engine unavailable, but replay then fails explicitly.

## 14. Traceability

Research keys: [PRD](product-requirements.md), [SYN](../research-spikes/SYNTHESIS.md), [ALG](../research-spikes/algorithms/state-of-the-art.md), [BENCH](../research-spikes/evaluation/benchmark-methodology.md), [PXL](../research-spikes/products/pixellab.md), [SFS](../research-spikes/products/spritefusion-pixel-snapper.md), [UNF](../research-spikes/products/unfake-js.md), [COM](../research-spikes/landscape/commercial-and-web-tools.md), [OSS](../research-spikes/landscape/open-source-ecosystem.md).

**Synthesis reconciliation record (2026-07-31):** SYN's locked decisions are carried into §2 and the pipeline contract. Its benchmark-gated decisions map to `OD-001` through `OD-012`, `EX-001` through `EX-013`, and the scheduled phases in §6. Reconciliation deliberately corrects three overextensions found by independent review: block uniformity proves valid factorization rather than invisible original boundaries; strict codec membership remains an `OD-002` result; and the first research slice is canonical-RGBA-only rather than a codec/engine commitment. `EX-014` supplies comparative release evidence and closes no OD.

| Synthesis decision | PRD contract | Experiment / OD | Phase and acceptance |
|---|---|---|---|
| exact target and formal Trim | `GEO-001`–`GEO-005`; `TRIM-001`–`TRIM-006`; `FR-003`; `FR-004` | Slice A, then `EX-003` | Phase 2/3/4; `AC-GEO-001`, `AC-GEO-002`, `AC-TRIM-001`, `AC-TRIM-002`, `AC-TRIM-003`, `AC-TRIM-004` |
| local non-AI, strict/compat paths, replay | `AUTO-001`; `DET-001`–`DET-008`; `FR-012`; `FR-013`; `FR-021` | `EX-001` closes `OD-001`; `EX-002` closes `OD-002`; `EX-013` closes `OD-012` | Phases 2, 3, 9, 11; `AC-DET-001`, `AC-DET-002`, `AC-DET-003`, `AC-PRIV-001`, `AC-OFF-001` |
| profile routing and Mixel status | `AUTO-002`–`AUTO-008`; `FR-006`; `FR-007` | `EX-004` and `EX-005` close `OD-004`; `EX-006` closes `OD-006`; `EX-009` closes `OD-005` | Phases 4, 6, 7; `AC-PRO-001`, `AC-PRO-002`, `AC-PRO-003`, `AC-PRO-004`, `AC-PRO-005` |
| palette, dither, cleanup | `PAL-001`–`PAL-007`; `DITH-001`–`DITH-005`; `CLEAN-001`–`CLEAN-006` | `EX-007` closes `OD-007`; `EX-008` closes `OD-008`; `EX-011` closes `OD-009` | Phase 5; T2-only Phase 8; `AC-PAL-001`, `AC-PAL-002`, `AC-DITH-001`, T2 `AC-CLEAN-001` |
| deterministic background primitives | `BG-001`–`BG-008`; `FR-014`; `FR-015` | `EX-010` closes `OD-010` | T2-only Phase 8; `AC-BG-001`, `AC-BG-002` |
| limits and release closure | `NFR-PERF-001`–`NFR-PERF-005`; `NFR-LIC-001`–`NFR-LIC-007` | `EX-012` closes `OD-011`; `EX-014` is release evidence | Phases 12–14; `AC-CAN-001`, `AC-SEC-001`, `AC-LIC-001` |

| Phase | Scope class | Explicit requirement / acceptance coverage | Primary local evidence |
|---:|---|---|---|
| 0 | T0 governance | `G-002`, `G-008`, `G-010`; `NG-001`–`NG-009`; `NFR-LIC-001`–`NFR-LIC-007` | PRD §§5, 19–23; SYN locked/gated decisions; BENCH §§16–19 |
| 1 | T0 governance | `G-008`, `G-010`; `NFR-LIC-001`–`NFR-LIC-007`; `NFR-SEC-001`, `NFR-SEC-002` | BENCH §§3–8, 15–19; OSS license assessment |
| 2 | T0 harness / Gate A | `DET-001`–`DET-008`; `OUT-004`, `OUT-005`; `AC-DET-001`, `AC-DET-002`, `AC-SEC-001` | Slice A; BENCH §§10, 13–16; ALG §12 |
| 3 | T0 conformance | `G-001`, `G-004`; `FMT-001`–`FMT-007`; `ALPHA-001`–`ALPHA-005`; `GEO-001`–`GEO-005`; `TRIM-001`–`TRIM-006`; `FR-001`, `FR-003`, `FR-004`, `FR-005`, `FR-011`; `AC-GEO-001`, `AC-GEO-002`; `AC-TRIM-001`–`AC-TRIM-004`; `AC-ALPHA-001` | PRD §§8–9, 12, 17; ALG §§1–2; BENCH §§5, 8, 10 |
| 4 | T0 baseline | `FR-006`; `PRO-NOOP`; `PRO-EXACT`; `AC-PRO-001`, `AC-PRO-002`, `AC-PRO-005` | ALG §§3–5, 14; BENCH §§9–10, 16; SFS; UNF |
| 5 | T0 palette | `G-005`, `G-007`; `PAL-001`–`PAL-007`; `DITH-001`–`DITH-005`; `FR-009`, `FR-010`, later `FR-016`; `AC-PAL-001`, `AC-PAL-002`, `AC-DITH-001` | ALG §§7–8; BENCH §§8–10; OSS; UNF; PXL |
| 6 | T0 routing | `AUTO-001`–`AUTO-006`, `AUTO-008`; `FR-006`, `FR-007`; `AC-PRO-002`, `AC-PRO-003` | ALG §5; BENCH §§9–10, 16; SFS; UNF |
| 7 | T0 Mixel | `G-003`, `G-010`; `PRO-MIXEL`; `FR-006`, `FR-007`; `AC-PRO-004`; `NFR-PERF-004` | ALG §§5.4–5.5, 14–15; BENCH §§7, 10–12, 16; SFS; UNF; PXL |
| 8 | T2 nonshipping | `BG-001`–`BG-008`; `CLEAN-001`–`CLEAN-006`; `FR-014`, `FR-015`, `FR-017`; `AC-BG-001`, `AC-BG-002`, `AC-CLEAN-001`; `PRO-LINE` | ALG §§9–10; BENCH §§8.3, 10.5; COM; OSS; PXL; UNF |
| 9 | T1 product | `G-009`; `FR-021`, `FR-022`; `NFR-PRIV-001`–`NFR-PRIV-005`; `NFR-PERF-002`, `NFR-PERF-003`; `AC-PRIV-001`, `AC-OFF-001`, `AC-CAN-001` | PRD §§14, 16–17; ALG §§11–12; SFS; UNF |
| 10 | T1 UX | `G-006`; `AUTO-007`; `FR-002`, `FR-004`, `FR-007`, `FR-008`; `NFR-A11Y-001`–`NFR-A11Y-006`; `AC-A11Y-001` | PRD §§7, 11, 15–17; COM diagnostics |
| 11 | T1 persistence | `OUT-001`–`OUT-006`; `FR-012`, `FR-013`; `DET-008`; `AC-DET-003` | PRD §§8, 14, 17; ALG §12; BENCH §§10.7, 15 |
| 12 | T1 hardening | `NFR-PERF-001`–`NFR-PERF-005`; `NFR-SEC-001`–`NFR-SEC-006`; `NFR-A11Y-001`–`NFR-A11Y-006`; `AC-SEC-001`, `AC-CAN-001`, `AC-A11Y-001` | PRD §§16–17; BENCH §§5.7, 10.8, 16; OSS risks |
| 13 | T1 qualification | the exact T1 acceptance list in Phase 13; no “all shipped ACs” shorthand | BENCH §§11–16; SYN; product/landscape spikes |
| 14 | T1 release cut | `NFR-LIC-001`–`NFR-LIC-007`; `NFR-PRIV-001`–`NFR-PRIV-005`; `NFR-SEC-005`; `AC-LIC-001` | PRD §§16.5, 17; ALG §11; OSS; COM |

`US-001` through `US-012` are rationale inputs. `FR-018`, `FR-020`, `AC-TRIM-004`, `AC-CLEAN-001`, `AC-BG-001`, and `AC-BG-002` are T2 delivery items even where Phase 8 researches them. `FR-019` is T3 and explicitly has no Phase 0–14 owner.

## 15. Authorization Gate A (R0) and first executable research slice

**Gate A / R0 — planning to research harness** is a narrow authorization. `Gate A` and `R0` are the same gate; the former is the plain-language name and the latter is the stable trace ID. It permits only owned procedural fixtures, reference metric/hash vectors, simple falsification baselines, and headless research-harness code needed to resolve open decisions. It does **not** authorize the web product, production codecs, a production engine selection, Wasm/browser integration, remote uploads, a quantizer dependency, Mixel defaults, background segmentation, or files outside the owner-approved research-harness scope.

Before asking the owner for Gate A authorization, documentation must specify and receive review acceptance for:

1. the byte-level `canonical-rgba-v1` buffer and domain-separated hash/projection schemas;
2. Trim and exact geometry formulas, including all-transparent input, checked bounds, Contain's extreme-aspect zero-minor-axis policy, crop/pad rectangles, and typed errors;
3. deterministic algorithm work budgets distinct from cancellation and host watchdog outcomes;
4. owned procedural fixture-generator license/provenance and a bootstrap manifest;
5. test-vector review rules and the statement that bootstrap cases are a subset, not a substitute for the provisional 64-case Fast CI corpus.

### Slice A — canonical RGBA geometry conformance

After explicit Gate A authorization, build one headless, UI-free, dependency-clean research slice:

1. accept only owned procedural in-memory canonical RGBA8 arrays; no PNG/JPEG/WebP/BMP decode, EXIF, ICC, browser Canvas, file picker, or encoder;
2. implement `canonical-rgba-v1`, minimal input-recipe/result projections, domain-separated hashes, typed checked bounds/errors, and an actual stage trace;
3. implement Trim off/on (`alpha > 0`), Stretch/Contain/Cover under the preaccepted extreme-aspect policy, nearest, nonnegative rational-area reduction, and PRO-NOOP behavior;
4. implement **exact constant-block factorization** that returns every ordered valid `(sx,sy,phase)` candidate plus ambiguity; it must not infer invisible original boundaries or claim original-grid recovery without instruction/unique identifiability;
5. run exhaustive reduced-domain geometry checks plus property/fuzz boundary tests for exact `W×H`, transparent-margin equivalence, no-op identity, alpha-zero invariance, deterministic ties, allocation arithmetic, and typed budget errors;
6. emit a reproducible research report with hashes, stage trace, dimensions, warnings, deterministic work counts, noncanonical runtime/environment diagnostics, and all failures.

Slice A selects no production codec or engine. It may be implemented as a neutral reference solely to establish vectors. `EX-001` compares candidate production engines **after** those vectors exist; `EX-002` and Slice B later compare candidate decode/color adapters against the same canonical inputs. Slice C is the later bridge/Wasm experiment. Passing Slice A authorizes none of those follow-ons automatically.

## 16. Authorization Gate B (R1) and product implementation

**Gate B / R1 — research harness to product implementation** is a separate explicit owner authorization. `Gate B` and `R1` are the same gate; Gate A/R0 never implies Gate B/R1.

Before requesting Gate B, the package must satisfy the applicable benchmark-methodology §19 and PRD §23 evidence, including:

- accepted corpus governance, reproducible fixture specifications, metric applicability/empty cases, and pilot-derived rather than falsely precise statistical margins;
- `OD-001` and `OD-002` decisions, an exact strict codec/color matrix, canonical hash/recipe schemas, and a strict runtime/toolchain matrix;
- approved parser/allocation limits, deterministic work budgets, host-watchdog policy, error taxonomy, and security/license/patent records for the exact proposed artifact;
- baseline reports sufficient to justify every T1 profile/default and the rule that no stable Mixel or destructive default precedes its evidence gate;
- an explicit T1 shipped-scope manifest excluding Phase 8/T2 and `FR-019` unless separately promoted through a documented scope change.

Only Gate B permits Phases 9–14 product implementation. Until the owner grants the relevant gate, work remains documentation-only under `docs/`.
