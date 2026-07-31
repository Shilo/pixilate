# Pixilate unresolved research and gate matrix

**Review date:** 2026-07-31  
**Status:** documentation-only inventory; no experiment has been executed and no implementation is authorized  
**Scope:** unresolved decisions, research experiments, authorization gates, and phase exits in the public planning corpus

## Purpose and evidence basis

This matrix makes the next research cycle explicit. It does not select an engine, codec, quantizer, grid scorer, cleanup rule, background segmenter, or product default. `BLOCKED` means that a stated prerequisite or authorization is absent; it does not mean that the decision is technically impossible.

The matrix uses the evidence vocabulary in the [research-spike index](../research-spikes/README.md). Existing documents are the evidence base:

- [Cross-spike synthesis](../research-spikes/SYNTHESIS.md) — locked decisions, benchmark-gated decisions, risks, and experiment order.
- [Product requirements](../planning/product-requirements.md) — normative IDs, acceptance criteria, support tiers, and open-decision entry/exit criteria.
- [Master plan](../planning/master-plan.md) — experiment register, dependency-ordered phases, R0/R1 authorization, and Slice A boundary.
- [Benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md) — fixture governance, metrics, result schema, regression gates, and legal-use rules.
- [Public-documentation review](FINAL-REVIEW.md) — evidence, privacy, licensing, and public-readiness boundaries.

- [Border-connected background and guarded cleanup spike](../research-spikes/algorithms/border-connected-background-cleanup-spike.md) — proposed `EX-010`/`EX-011` ablations and failure taxonomy; no measured result or default.

No private observation, credential, personal data, proprietary implementation detail, competitor asset, or unlicensed test asset is used here.

## Executive result

The root gap is a reviewed, accepted pre-R0 specification for the canonical in-memory research slice. The surrounding documents describe the intended behavior, but they do not yet supply an accepted byte-level hash/vector contract, bootstrap fixture manifest, deterministic work/error registry, or reference conformance report.

The highest-leverage next spike is **canonical RGBA geometry, alpha, and hash conformance**. It must precede engine comparison, codec/color adapters, quantizer selection, approximate-grid confidence, and Mixel scoring so that those later measurements cannot accidentally measure different Trim, alpha, rounding, target, or input-normalization semantics. The proposed non-production specification is [canonical-rgba-geometry-spike.md](../research-spikes/algorithms/canonical-rgba-geometry-spike.md).

## Follow-up consistency review disposition

The independent public-documentation pass found no private-data or ungated-implementation exposure. It did find documentation mismatches; the following corrections are included in this cycle. They change traceability and wording, not product conclusions or algorithm evidence:

| Finding | Disposition |
|---|---|
| Hash domains used abbreviated names in some planning/research text and `pixilate/.../v1` names elsewhere. | **RESOLVED in wording:** planning and algorithm text now use the `pixilate/.../v1` namespace. Exact byte fields, separators, and projections remain an R0 decision in the proposed Slice A specification. |
| `NFR-SEC-007` and `AC-SEC-002` were not explicit in the master Phase 2/12 and trace rows. | **RESOLVED in traceability:** deterministic work-budget and host-watchdog distinctions are now assigned to both phases and their acceptance IDs. |
| `OUT-003` post-MVP output scope was listed as a Phase 11 T1 requirement. | **RESOLVED in scope:** Phase 11 now excludes `OUT-003` while retaining the product-requirements post-MVP classification. |
| Master performance trace grouped all `NFR-PERF-*` under `AC-CAN-001`. | **RESOLVED in traceability:** Mixel performance maps to `AC-PRO-004`, bundle/dependency policy maps to `AC-LIC-001`, and cancellation/baseline budgets retain `AC-CAN-001`. |
| One ecosystem summary described byte-identical output as part of the complete contract. | **RESOLVED in wording:** it now describes canonical-pixel identity, with encoded-byte identity conditional on a pinned encoder. |
| Open-source evidence labels differed from the shared taxonomy. | **RESOLVED in wording:** the ecosystem spike maps “source-derived fact” to `CODE-DERIVED` and “engineering inference” to `INFERRED`; inventory surface signals remain explicitly non-closure evidence. |
| `[OWNER]` was not visibly separated from public evidence. | **RESOLVED in wording:** the product requirements now identify it as internal product authority and require independent support for public claims. |
| Commissioned-asset CC0 language said “assigns or licenses ... under CC0.” | **RESOLVED in wording:** the benchmark policy now uses “dedicates under CC0” or separately specified public terms. |
| Palette acceptance named only a maximum of 16 while the contract is parameterized by `N`. | **RESOLVED in wording:** `AC-PAL-001` is parameterized over every supported `N`, with 16 retained as a mandatory regression case. |
| A dated algorithm claim linked to mutable `docs.rs/image/latest`. | **RESOLVED in citation scope:** it now points to the dated pinned `image` source audit; later adoption still requires an exact release/revision review. |

## Handoff open-question coverage

The open questions in the research handoff are covered by the decision registry below:

| Handoff question | Decision(s) that own it | Current public conclusion | Remaining closure evidence |
|---|---|---|---|
| TypeScript-only versus Rust/Wasm processing core | `OD-001` | Rust/Wasm leads as a hypothesis; constrained TypeScript remains measurable. | Canonical vectors, cross-runtime hashes, runtime/memory/bundle data, auditability, and exact-artifact license review. |
| Canonical internal pixel/color representation and browser decoder boundary | `OD-002`, `OD-003` | Canonical oriented RGBA8 is the contract boundary; strict decode/color membership is not selected. | Codec/color fixture results, profile behavior, alpha/ICC policy, hostile-input results, and browser/architecture matrix. |
| Deterministic quantizer and distance space | `OD-007`, with `OD-008` for dither | Exact caps and palette membership are hard contracts; a quality winner is not selected. | Bake-off, alpha/lock/tie results, runtime, deterministic hashes, and approved dependency closure. |
| Grid confidence and exact/approximate/raster routing | `OD-004`, `OD-005`, `OD-006` | Exact factorization must preserve ambiguity; approximate and Mixel routes remain benchmark-gated. | Factorization enumeration, held-out confidence calibration, cell-representative comparison, and no-grid false-authority bounds. |
| Explainable automatic profile selection | `OD-005` | Auto must be finite, versioned, evidence-reporting, and conservative; no stable scorer exists. | Held-out multi-stratum calibration, candidate scores, fallback behavior, artist study, and bounded resource use. |
| First strict formats and animation behavior | `OD-002` | PNG is the minimum candidate; other formats and frames are gated by the approved matrix. | Per-format decoder/color/conformance/security/license records and an explicit frame policy. |
| Numeric acceptance thresholds and public limits | `OD-011`, plus profile gates | Planning values are provisional and must not be marketed as release limits. | Device benchmarks, cancellation/memory measurements, deterministic work budgets, and approved lower-device policy. |

## Unresolved implementation decisions

The decision IDs below are the authoritative open-decision registry from [product requirements §20](../planning/product-requirements.md#20-open-implementation-decisions-with-entryexit-criteria). The experiment IDs and phase references are checked against the [master-plan experiment register](../planning/master-plan.md#6-early-experiment-register).

| Decision | Current evidence and boundary | Status | Required closure artifact and acceptance dependency |
|---|---|---|---|
| `OD-001` strict engine | Rust/Wasm scalar is the leading hypothesis; constrained TypeScript and optimized variants remain alternatives. The determinism contract requires one visible strict path, but no engine has produced vectors. ([Synthesis gated decisions](../research-spikes/SYNTHESIS.md#decisions-that-remain-benchmark-gated), [master-plan architecture](../planning/master-plan.md#41-leading-hypothesis)) | **BLOCKED** — R0 vectors and authorization are absent. | `EX-001` report and strict-engine ADR after Slice A vectors exist; compare canonical hashes, runtime, memory, bundle, auditability, and exact dependency closure. `OD-001` must not be closed by architectural preference alone. |
| `OD-002` codecs and color | Strict versus compatibility paths, candidate formats, orientation, ICC, alpha, and hostile-input policy are specified, but no format has entered an approved strict matrix. ([PRD input policy](../planning/product-requirements.md#8-input-decode-color-and-output-policy), [benchmark candidate/approved distinction](../research-spikes/evaluation/benchmark-methodology.md#13-candidate-versus-approved-codeccolor-matrix)) | **BLOCKED** — no adapter results or matrix. | `EX-002` codec/color support matrix with expected canonical pixels, accept/warn/reject rows, fuzz/security results, browser hashes, and codec/patent/license records. Requires the canonical endpoint from Slice A. |
| `OD-003` raster reducer default | Rational, premultiplied-linear area is the safety baseline; nearest and conventional kernels are named candidates. No quality/runtime Pareto result exists. ([Algorithm resampling](../research-spikes/algorithms/state-of-the-art.md#3-conventional-resampling-kernels), [master-plan EX-003](../planning/master-plan.md#6-early-experiment-register)) | **PARTIALLY SUPPORTED** — contract direction exists; measured selection does not. | `EX-003` reducer report using exact geometry/alpha metrics, halo and edge measures, topology/detail checks, deterministic hashes, and runtime. Retain named alternatives if no single candidate dominates. |
| `OD-004` exact and approximate grid | Constant-block evidence can enumerate valid factorizations but cannot reveal equal-adjacent invisible boundaries. Approximate period/phase signals are explicitly heuristic. ([Synthesis grid findings](../research-spikes/SYNTHESIS.md#core-feasibility-verdict), [algorithm grid evidence](../research-spikes/algorithms/state-of-the-art.md#5-detecting-a-real-or-approximate-pixel-grid)) | **PARTIALLY SUPPORTED** — semantics are documented; no result or calibration exists. | `EX-004` factorization ADR/report plus `EX-005` confidence report. Acceptance requires complete valid-factor enumeration, exact recovery only for instructed/uniquely identifiable cases, ambiguity/refusal on adversarial fixtures, and held-out false-grid calibration. |
| `OD-005` Mixel candidate and scorer | Mixel is an unproven bounded ensemble hypothesis. The product contract keeps it experimental and forbids a stable default before held-out evidence. ([Mixel profile](../research-spikes/algorithms/state-of-the-art.md#b-ai-pseudo-pixel--mixel-reconstruction), [PRD profile gate](../planning/product-requirements.md#10-profiles-auto-confidence-and-fallback)) | **OPEN** — no corpus, score, or artist result. | `EX-009` held-out candidate/ablation report, failure gallery, explainable confidence record, artist comparison, and separate runtime/memory budget. Requires `EX-004`, `EX-005`, and `EX-006` evidence. |
| `OD-006` cell representative | Mean, mode, perceptual bins, medoid, center, and edge-aware choices are named; thin-feature and topology tradeoffs are unresolved. ([Algorithm cell reducers](../research-spikes/algorithms/state-of-the-art.md#4-block-and-cell-reducers), [master-plan EX-006](../planning/master-plan.md#6-early-experiment-register)) | **OPEN** — no stratum-specific comparison. | `EX-006` cell-reducer decision with stable tie rules, alpha weighting, edge/detail/topology metrics, and artist-rated evidence. A profile-specific choice is acceptable; a universal winner is not assumed. |
| `OD-007` quantizer | Maximum/exact palette contracts and final enforcement are lockable. Candidate quantizers and a GPL/commercial research oracle are documented, but no finalist or production closure exists. ([PRD palette contract](../planning/product-requirements.md#122-palette-contract), [ecosystem license matrix](../research-spikes/landscape/open-source-ecosystem.md#reuse-and-license-decision-matrix)) | **BLOCKED** — quality and artifact-level license closure are absent. | `EX-007` bake-off/ADR with zero cap violations, exact-palette/lock/tie behavior, alpha-edge results, deterministic hashes, runtime, and exact-version dependency/notice/SBOM review. |
| `OD-008` dither set | Dither is off by default because it can add components and topology noise. Optional matrices/kernels remain candidates with provenance requirements. ([Algorithm dithering](../research-spikes/algorithms/state-of-the-art.md#8-dithering), [PRD dither rules](../planning/product-requirements.md#123-dithering)) | **PARTIALLY SUPPORTED** — safe default is decided; optional benefit is not. | `EX-008` dither report with fixed phase/scan/precision goldens, provenance/license records, introduced-component metrics, and stratum-specific benefit. No result may change the default silently. |
| `OD-009` cleanup | Cleanup is default-off and T2/deferred. Formal component/topology rules are preferable to aesthetic “beautification.” ([Algorithm cleanup](../research-spikes/algorithms/state-of-the-art.md#10-orphan-cleanup-morphology-and-topology), [guarded cleanup spike](../research-spikes/algorithms/border-connected-background-cleanup-spike.md), [master-plan Phase 8](../planning/master-plan.md#phase-8--t2-expert-primitives-background-cleanup-and-line-art)) | **PARTIALLY SUPPORTED** — default boundary is decided; promotion is untested. | `EX-011` protected-feature/topology report and a T2 promotion or rejection record. Requires blinded benefit, protected-detail margins, diffability, and no palette-contract regression. It does not block T1 while Phase 8 remains nonshipping. |
| `OD-010` advanced background | Exact/tolerance key, border flood, and component rules are deterministic primitives; semantic universal removal is rejected. Graph cut remains conditional T3 research. ([Algorithm background tiers](../research-spikes/algorithms/state-of-the-art.md#9-deterministic-background-removal), [border-connected background spike](../research-spikes/algorithms/border-connected-background-cleanup-spike.md), [PRD background contract](../planning/product-requirements.md#125-deterministic-background-removal)) | **PARTIALLY SUPPORTED** — scope and semantics are bounded; no mask evidence exists. | `EX-010` background primitive ADR/report with mask truth, boundary/halo metrics, explicit failure taxonomy, and dependency/security closure. T2 exploratory work does not block the T1 cut. |
| `OD-011` public size and SLO | Input, pixel, memory, cancellation, and dependency-size values are marked proposed/`OD-011`, not measured release limits. ([PRD performance policy](../planning/product-requirements.md#163-performance-size-and-cancellation), [master-plan measurement gate](../planning/master-plan.md#9-performance-budgets-and-measurement-gate)) | **BLOCKED** — no reference-device measurements or approved limits. | `EX-012` limits/SLO ADR with cold/warm p50/p95, memory, cancellation, bundle, parser limits, deterministic work budgets, and weakest-device policy. |
| `OD-012` recipe and PNG encoding | Domain-separated canonical/semantic/recipe/encoded hashes and sidecar authority are specified. Byte-identical PNG is separately gated; no replay vectors exist. ([PRD hash contract](../planning/product-requirements.md#142-required-recipe-fields), [benchmark hash protocol](../research-spikes/evaluation/benchmark-methodology.md#107-determinism-and-artifact-hashes)) | **PARTIALLY SUPPORTED** — schema direction exists; replay and encoder behavior are unverified. | `EX-013` recipe/encoding ADR with canonicalization vectors, replay/unavailable-engine behavior, privacy checks, and a separate byte-identity decision. |

## Authorization and research gates

### Gate R0 / Gate A — documentation to research harness

| Gate | Existing basis | Current status | Required before authorization |
|---|---|---|---|
| R0 / Gate A | [Benchmark §19](../research-spikes/evaluation/benchmark-methodology.md#19-two-stage-authorization-criteria), [master plan §15](../planning/master-plan.md#15-authorization-gate-a-r0-and-first-executable-research-slice), and [FINAL-REVIEW technical status](FINAL-REVIEW.md#technical-planning-status) define the narrow canonical-RGBA-only boundary. | **BLOCKED** — the owner has not authorized a harness, and the pre-R0 package is not yet accepted. | Review and accept the [proposed Slice A specification](../research-spikes/algorithms/canonical-rgba-geometry-spike.md): byte serialization, hash projections, Trim/geometry edge cases, deterministic work/error fields, procedural fixture rights, bootstrap vectors, and golden/change-control rules. |
| Slice A output | [Master plan §15](../planning/master-plan.md#slice-a--canonical-rgba-geometry-conformance) limits execution to owned in-memory RGBA8, exact geometry, alpha/Trim, nearest/nonnegative area, no-op, factorization ambiguity, hashes, traces, and typed errors. | **NOT EXECUTED** — no harness, vectors, or report are present. | After R0 only: produce a reproducible conformance report. It must not select Rust/Wasm, codecs, quantizers, Mixel scoring, UI, or visual defaults. |

### Gate R1 / Gate B — research harness to product implementation

| Gate | Existing basis | Current status | Required before authorization |
|---|---|---|---|
| R1 / Gate B | [Benchmark R1 criteria](../research-spikes/evaluation/benchmark-methodology.md#gate-r1--research-harness-to-product-implementation), [master plan §16](../planning/master-plan.md#16-authorization-gate-b-r1-and-product-implementation), and [PRD §23](../planning/product-requirements.md#23-definition-of-product-ready-planning) define the evidence package. | **BLOCKED** — R0, ODs, corpus, conformance, profile, resource, security, and dependency gates are open. | Require approved OD-001/002 decisions, strict matrix, corpus/statistics governance, measured limits, dependency/patent/license closure, profile gates, and an explicit T1 shipped-scope manifest. R1 is separate from R0 and does not follow automatically. |

## Phase-exit status

The phase rows below make the master plan’s dependency gates visible in one place. “Not started” describes the public evidence state, not a judgment about feasibility.

| Phase | Exit artifact / gate | Status on 2026-07-31 | Blocking gap |
|---:|---|---|---|
| 0 | Governance, support claims, decision records, and ownership map | **PLANNING BASELINE** | Owner review/acceptance and reusable decision/experiment records are not published as completed artifacts. |
| 1 | Rights-cleared corpus, manifests, metric specifications, and splits | **SPECIFIED, NOT SEEDED** | No public fixture manifest or approved corpus version has been created; uncertain AI outputs remain inadmissible for required CI. |
| 2 | Headless harness, neutral vectors, and determinism report | **R0-GATED** | Slice A contract and authorization are not closed; no harness may be created under the current scope. |
| 3 | Canonical decode/color/alpha/geometry and `OD-002` matrix | **NOT MEASURED** | No codec/color adapters, conformance vectors, fuzz results, or cross-runtime matrix. |
| 4 | Raster baselines, no-op, exact factorization, and cell reducers | **NOT MEASURED** | No `EX-003`, `EX-004`, or `EX-006` report; exact ambiguity is specified but not exercised. |
| 5 | Quantizer/dither reports and palette closure | **NOT MEASURED** | No bake-off, deterministic goldens, or artifact-level license closure. |
| 6 | Approximate-grid candidates and confidence calibration | **NOT MEASURED** | No held-out calibration or false-authority bound. |
| 7 | Mixel candidates, scoring ablation, and provisional profile decision | **NOT MEASURED** | No rights-cleared M corpus, artist pilot, or bounded profile report. |
| 8 | T2 background/cleanup/line-art research | **DEFERRED NONSHIPPING** | It is intentionally not a T1 prerequisite; no promotion decision exists. |
| 9 | Worker/bridge/offline/privacy integration | **R1-BLOCKED** | Product implementation is not authorized; no selected strict engine or release matrix. |
| 10 | Accessible T1 UX and diagnostic flow | **R1-BLOCKED** | No product implementation or validated profile defaults. |
| 11 | Recipe/PNG replay and export | **R1-BLOCKED** | No stable engine registry or `EX-013` vectors. |
| 12 | Security, resource, performance, and accessibility closure | **R1-BLOCKED** | No integrated candidate or `EX-012` device measurements. |
| 13 | Frozen comparative validation and release qualification | **R1-BLOCKED** | No release candidate, frozen corpus, or authorized competitor capture set. |
| 14 | MIT/public release documentation and artifact closure | **R1-BLOCKED** | No release artifact, dependency SBOM, notices, or approved claim-to-gate report. |

## Experiment register status

All `EX-*` rows are defined in the [master-plan experiment register](../planning/master-plan.md#6-early-experiment-register). The absence of an experiment result is intentional at this stage; a specification is not evidence that a candidate worked.

| Experiment | Current evidence | Status | Missing result |
|---|---|---|---|
| `EX-001` strict engine | Candidate matrix and stop condition are defined. | **BLOCKED** | Slice A vectors, comparison report, engine ADR. |
| `EX-002` codec/color | Fixture classes and strict/compatibility rules are defined. | **BLOCKED** | Adapter outputs, matrix rows, fuzz/security, browser hashes. |
| `EX-003` raster reducer | Candidate kernels and metrics are defined. | **BLOCKED** | Pareto report and measured baseline. |
| `EX-004` exact factorization | Validity/ambiguity acceptance is defined. | **BLOCKED** | Enumeration vectors and factorization ADR. |
| `EX-005` approximate grid | Signals, candidates, and false-grid concern are defined. | **BLOCKED** | Held-out confidence calibration and refusal report. |
| `EX-006` cell representative | Candidate reducers and structural metrics are defined. | **BLOCKED** | Stratum comparison, tie contract, and reducer decision. |
| `EX-007` quantizer | Hard palette contract, candidates, and license boundaries are defined. | **BLOCKED** | Bake-off, finalist, deterministic vectors, and closure review. |
| `EX-008` dither | Candidate set and default-off policy are defined. | **BLOCKED** | Provenance, golden vectors, and demonstrated benefit. |
| `EX-009` Mixel | Ensemble, baselines, and eligibility bounds are defined. | **BLOCKED** | Held-out comparison, artist evidence, failure gallery, profile decision. |
| `EX-010` background | T2 primitive scope and failure taxonomy are defined. | **BLOCKED / NONSHIPPING** | Mask corpus, primitive report, and optional adoption decision. |
| `EX-011` cleanup | T2 alternatives and protected-topology criteria are defined. | **BLOCKED / NONSHIPPING** | Blinded benefit/regression report and promotion decision. |
| `EX-012` limits/SLO | Proposed workloads and metrics are defined. | **BLOCKED** | Device data, limits ADR, cancellation and memory report. |
| `EX-013` recipe/encoding | Replay and byte-identity separation are defined. | **BLOCKED** | Schema vectors, replay report, encoder decision. |
| `EX-014` comparative validation | Fair task-specific protocol is defined and closes no OD. | **BLOCKED** | Release-candidate comparison and claim-to-gate report. |

## Immediate non-production research order

This order follows dependency rather than perceived algorithm sophistication. Every executable row remains subject to its stated authorization; documentation of a spike does not authorize its harness.

| Order | Spike | Depends on | Main question and output |
|---:|---|---|---|
| 0 | **Pre-R0 Slice A contract** — [canonical-rgba-geometry-spike.md](../research-spikes/algorithms/canonical-rgba-geometry-spike.md) | Current public requirements and benchmark policy | Can a neutral canonical RGBA8 contract prove exact geometry, Trim, alpha-zero invariance, rational coverage, factorization ambiguity, hashes, and typed failures? Output: reviewed specification and bootstrap vector plan. |
| 1 | **Canonical RGBA geometry/hash conformance** — `EX-004` foundation plus Slice A | Explicit R0 authorization | Does the reference produce exact `W×H`, formal Trim, deterministic nearest/area outputs, complete factorization candidates, and stable hashes? Output: non-production report; no engine selection. |
| 2 | **Codec/color adapters** — `EX-002` / `OD-002` | Slice A canonical endpoint and authorized follow-on | Which decoder/color tuples produce the declared canonical pixels and survive hostile-input/security/license review? Output: accept/warn/reject strict matrix. |
| 3 | **Spatial baseline and exact-grid reducers** — `EX-003`, `EX-004`, `EX-006` | Canonical geometry/alpha plus G/I/T/A fixtures | Which simple reducers and exact-grid policies are valid by source stratum, and where is ambiguity preserved? Output: baseline, factorization, and cell-representative reports. |
| 4 | **Deterministic quantizer and dither** — `EX-007`, `EX-008` | Stable spatial baseline and palette/alpha fixtures | Which permissive candidate meets exact caps, locks, alpha edges, quality, determinism, and closure? Output: quantizer/dither reports and an ADR; default dither remains off unless earned. |
| 5 | **Approximate-grid routing/confidence** — `EX-005` / `OD-004` | Canonical geometry, exact/raster baselines, held-out G/I/M/H/P controls | Can evidence distinguish a recoverable grid from a harmonic or no-grid image without changing target geometry? Output: calibration/refusal report. |
| 6 | **Mixel candidate ablation** — `EX-009` / `OD-005` | Steps 1–5, rights-cleared M corpus, human pilot | Does a bounded ensemble beat or usefully complement simple baselines without protected-detail/topology regressions? Output: experimental-profile decision only. |
| 7 | **T2 background/cleanup research** — `EX-010`, `EX-011` | Canonical alpha, B/T/O corpus, separate T2 authorization | Do explicit primitives improve their stated tasks with predictable failures? Output: nonshipping ADRs; no semantic universal claim. |
| 8 | **Operational qualification and comparative release evidence** — `EX-012`–`EX-014` | Integrated R1-authorized candidate, frozen corpus, approved protocols | Can the frozen T1 claim set meet resource, privacy, security, accessibility, licensing, and fair-comparison gates? Output: release qualification, not an algorithm shortcut. |

## Review constraints for the next cycle

- Keep all work in `docs/` until an explicit implementation gate is granted.
- Treat fixture source, emitted assets, annotations, palettes, matrices, and model/service outputs as separate provenance and license questions. Procedural Slice A fixtures should follow the benchmark policy: generator source MIT; emitted public vectors/annotations dedicated under CC0-1.0; no recognizable people, trademarks, protected characters, or copied assets.
- Distinguish contract evidence from heuristic quality. A passing hash or dimension invariant does not establish artistic superiority; a visually attractive output does not establish determinism.
- Preserve the separation between processing determinism from canonical RGBA and end-to-end strict determinism from encoded bytes through an approved decoder/color tuple.
- Do not close an OD from a planning hypothesis, competitor observation, single fixture, vendor claim, or library license badge.
- Keep T2 Phase 8 and stable Mixel decisions nonblocking for the narrower exact-target/raster product unless a documented scope change promotes them.
- Before publishing a follow-up result, repeat the [public-documentation validation checklist](FINAL-REVIEW.md#validation-expectations): secrets/private-path scan, local-link/anchor validation, dated-source recheck, evidence labels, neutral comparisons, license scope, traceability, and temporary-file exclusion.
