# Proposed research spike: canonical RGBA geometry, alpha, and hash conformance

**Research date:** 2026-07-31  
**Status:** proposed documentation-only Slice A specification; execution requires explicit Gate R0 / Gate A authorization  
**Scope:** owned procedural in-memory RGBA8 vectors; no application implementation, production codec, or engine selection

## Decision sought

Establish the smallest neutral reference contract that later experiments can trust for exact target geometry, Trim, alpha-zero handling, rational coverage, factorization ambiguity, typed failures, and canonical hashes.

### Hypothesis

If Pixilate fixes a byte-level canonical RGBA8 representation and exact coordinate semantics, a neutral headless reference can produce reproducible vectors for:

- exact requested output dimensions;
- full-canvas and alpha-bounds geometry;
- alpha-zero RGB invariance;
- nearest and nonnegative rational-area reduction;
- deterministic rounding, anchors, crop, and pad behavior;
- complete constant-block factorization reporting without inventing invisible original boundaries;
- deterministic work-budget and empty-region errors; and
- domain-separated canonical and semantic hashes.

These vectors make later engine, codec/color, reducer, quantizer, approximate-grid, and Mixel experiments comparable. They do not establish aesthetic superiority.

The motivation is documented in the [synthesis experiment order](../SYNTHESIS.md#prioritized-research-experiments), [master-plan Slice A boundary](../../planning/master-plan.md#slice-a--canonical-rgba-geometry-conformance), and [benchmark R0 criteria](../evaluation/benchmark-methodology.md#gate-r0--documentation-to-dependency-clean-research-harness).

## Non-production boundary

This spike is a specification for a future research harness, not authorization to build it. After R0 only, an implementation may:

- accept owned procedural in-memory canonical RGBA8 arrays;
- run headlessly and emit reviewed vectors, hashes, stage traces, metrics, and typed failures; and
- use a neutral reference implementation to establish behavior before comparing candidate engines.

It must not include or select:

- PNG, JPEG, WebP, BMP, GIF, EXIF, ICC, browser Canvas, file pickers, or production encoders;
- Rust/Wasm versus TypeScript, or any production bridge/worker/UI;
- external image assets, remote uploads, telemetry, generative models, or semantic classifiers;
- a production dependency whose license/closure has not been reviewed;
- quantizers, dithering, cleanup, background segmentation, or a Mixel default; or
- a visual-quality claim.

The harness must remain a research artifact documented under `docs/` and must never become an implicit production API. Slice A passing does not authorize `EX-001`, `EX-002`, or product implementation automatically.

## Proposed canonical input and hash contract

The following is a review proposal for R0, not a silently locked production serialization. Any unresolved item blocks execution.

### Canonical buffer

Each input record contains:

```text
schema: "pixilate/canonical-rgba/v1"
width: positive bounded integer
height: positive bounded integer
pixels: width × height × 4 RGBA8 bytes, row-major
```

The input is already oriented, canonical sRGB RGBA8, and alpha-normalized. Slice A does not decide how encoded files reach this representation. The maximum dimensions, pixel count, allocation budget, and work budget must be supplied by the approved R0 policy rather than inferred from the fixture runner.

The strict canonicalization rule is:

```text
if alpha == 0: output RGBA = (0, 0, 0, 0)
otherwise:     preserve the canonical RGBA8 sample
```

RGB beneath zero alpha is therefore not an input signal for Trim, grid evidence, palette statistics, or output identity. Partial alpha remains meaningful coverage; Slice A does not silently binarize it.

### Domain-separated canonical hash proposal

The exact byte serialization must be accepted before vectors are generated. A concrete candidate for review is:

```text
ASCII("pixilate/canonical-rgba/v1")
0x00
u32le(width)
u32le(height)
row-major RGBA8 bytes
```

The fixed tag, NUL separator, fixed-width little-endian dimensions, and checked payload length prevent ambiguity between artifact classes and malformed shapes. The hash is SHA-256 over exactly those bytes. The proposal is intentionally compatible with the existing product contract’s `canonical-rgba-v1` domain while making its field widths and separator explicit; it must not be adopted if R0 review selects a different byte-level schema.

The Slice A vector manifest should also distinguish, without circularity:

```text
canonical_rgba_sha256  = hash of canonical RGBA domain bytes
semantic_result_sha256 = hash of canonical result + effective stage trace
recipe_input_sha256    = hash of input-affecting requested recipe only
recipe_result_sha256   = recipe-input hash + actual trace/warnings/fallbacks + semantic hash
```

`encoded-file/v1` is not part of Slice A because no encoder is present. No hash may include filenames, locale, wall-clock time, elapsed time, host-watchdog outcome, or other volatile environment data. This preserves the separate pixel/file identity defined in the [product hash contract](../../planning/product-requirements.md#142-required-recipe-fields).

### Recipe projection needed for Slice A

The minimal input-affecting projection should contain only fields that can change the canonical result:

```text
schemaVersion
trim: off | alpha-threshold(tau)
fit: Stretch | Contain | Cover
anchor: named deterministic anchor
target: positive W × H
spatial: PRO-NOOP | Nearest | NonnegativeRationalArea
factorization: disabled | enumerate ordered candidates
alpha: PreserveCoverage (other alpha-policy values are outside Slice A)
boundary/rounding policy
work-budget policy version
```

The actual stage trace is recorded separately from requested controls. A disabled or inapplicable stage must not appear to have affected pixels. Canonical JSON ordering, numeric/rational encoding, omission/default rules, and the trace hash are R0 review items.

## Geometry and alpha semantics to vectorize

### Coordinates and target

- Use half-open source and destination rectangles.
- Require positive, checked target `W×H`; zero, negative, non-integer, overflowed, or budget-exceeding requests return stable typed errors before allocation.
- `W` and `H` are independent. A detected source scale or factorization never substitutes for them.
- With Trim off, the basis is the full oriented canonical canvas.
- With Trim on, use the smallest half-open box containing samples with `alpha > tau`; default `tau=0` and strict comparison are serialized.
- An empty visible set returns `empty-visible-region`; it must not silently invent a subject or fallback canvas.

### Aspect and mapping

Vectorize Stretch, Contain+pad, and Cover+crop with the preaccepted rounding, anchor, boundary-extension, and odd-remainder rules from the [geometry contract](../../planning/product-requirements.md#94-aspect-crop-pad-and-stretch). Extreme-aspect cases must exercise the positive-minor-axis Contain clamp, including `8192×1 → 1×1`.

For a selected basis of `w_b × h_b` and target box `W×H`, the nonnegative rational-area baseline assigns destination cell `(i,j)` the source footprint:

```text
x ∈ [i*w_b/W, (i+1)*w_b/W)
y ∈ [j*h_b/H, (j+1)*h_b/H)
```

Overlap weights must be nonnegative, sum to the declared footprint, and be evaluated without cumulative floating-point phase drift. The exact accumulator, color transfer, clamp/gamut, unpremultiply, and output-rounding policy must be accepted as part of the vector contract. Slice A may use nearest and a reference nonnegative area path; it must not silently introduce a negative-lobe kernel.

### Alpha and color diagnostic matrix

Slice A begins from canonical RGBA8, but it must expose the policy boundary needed by later color experiments:

| Case | Required invariant | Boundary of this spike |
|---|---|---|
| Alpha-zero RGB variants | Inputs differing only under `alpha=0` have identical canonical hashes, Trim ROI, factorization evidence, and visible output. | Required Slice A invariant. |
| Partial-alpha edges | Coverage is preserved by the declared alpha aggregation; no implicit binary threshold. | Required for the selected reference area vectors; exact arithmetic policy is an R0 decision. |
| Premultiplied filtering | RGB is weighted through alpha and unpremultiplied only when output alpha is nonzero. | Contract reference; codec/color implementation remains `OD-002`. |
| Linear-light versus legacy gamma | The path is named and recorded; a fidelity path must not silently use straight-alpha gamma-space filtering. | Diagnostic comparison belongs to `EX-003`/Phase 3; no default is selected here. |
| Hidden matte contamination | Black/white/checkerboard composites expose halos in reference vectors. | Fixture/invariant now; full codec/matte policy later. |

The [alpha requirements](../../planning/product-requirements.md#121-transparency-and-alpha) remain normative. This spike must not use a hash pass to claim that an untested color-management path is correct.

## Exact factorization and ambiguity

The reference must enumerate every ordered valid constant-block factorization in the declared fixture domain, including independent X/Y scale and phase. Validity means that the candidate’s declared cell partition satisfies the selected full-coverage/border policy for every observed source sample; the policy itself is serialized rather than inferred.

The output must distinguish:

1. **valid factorization** — the observed pixels satisfy the candidate partition;
2. **instructed lattice** — the user/metadata supplies the intended period/phase; and
3. **original-grid recovery** — allowed only when the lattice is instructed or uniquely identifiable under declared preconditions.

Uniform fields, equal-adjacent logical cells, nested blocks, checkerboards, stripes, and harmonic patterns must return all applicable candidates and an ambiguity result. Choosing the coarsest candidate is not a valid recovery shortcut. This implements the boundary established in [exact-grid research](state-of-the-art.md#51-exact-constant-block-factorization) and [AC-PRO-001](../../planning/product-requirements.md#172-profiles-and-quality-boundaries).

## Bootstrap fixture set and rights boundary

The bootstrap set is deliberately procedural and small. It is not a replacement for the later 64-case Fast CI corpus or the larger release corpus.

The generator source should be Pixilate-owned MIT; emitted vectors, annotations, and manifests should be dedicated under CC0-1.0, following the [benchmark corpus policy](../evaluation/benchmark-methodology.md#31-accepted-corpus-sources). No third-party artwork, AI-service output, recognizable person, trademark, protected character, font, palette, or model asset is needed for Slice A.

| Fixture family | Required cases | Main assertion |
|---|---|---|
| Identity/no-op | Opaque mixed-color native RGBA; repeated calls | `PRO-NOOP` is pixel-identical and hash-stable. |
| Target geometry | Non-square targets; coprime/nondivisible ratios; `1×N`, `N×1`, `1×1`; unequal X/Y source scale | Output is exactly requested `W×H`; no detector changes it. |
| Fit/anchor | Stretch, Contain, Cover; all declared anchors; odd remainder; crop/pad | Rounding, remainder placement, and source rectangles match vectors. |
| Extreme aspect | `8192×1 → 1×1`, tall/narrow analogues, near-limit checked dimensions | Positive intermediate dimensions and typed overflow/budget outcomes are stable. |
| Trim | Asymmetric transparent margins; alpha values `0,1,127,254,255`; threshold equality; optional padding | Trim ROI is exact and recorded; `alpha > tau` is strict. |
| Empty region | All alpha zero with varied hidden RGB | Returns `empty-visible-region`; no invented output. |
| Hidden RGB | Paired visible-identical inputs whose alpha-zero RGB differs | Canonical/result hashes and visible semantics are identical. |
| Alpha edge | Partial-alpha outline, shadow, hole, and matte-contaminated diagnostic variants; black/white/gray/checker composites | No hidden RGB halo; alpha aggregation is named and reproducible. |
| Exact factorization | Instructed/unique constant blocks with independent X/Y periods and phase | Valid factorization set and exact recovery precondition are correct. |
| Ambiguous factorization | Uniform, equal-adjacent, nested, checkerboard, stripe, harmonic patterns | All valid candidates and ambiguity are reported; no false original-grid claim. |
| Thin feature | One-sample line, diagonal, eye/highlight, hole, and connector inside a known cell | Geometry does not silently invoke cleanup or erase the feature. |
| High-color control | Procedural high-color raster with deterministic seed and no claimed grid | No hidden quantization; exact-size output and no-grid status remain explicit. |
| Tie/boundary | Exact half ties, zero/one overlap, boundary-aligned and one-sample footprints | Stable tie order, nonnegative weights, and boundary convention. |
| Limit/error | Invalid dimensions, checked multiplication/stride overflow, candidate/iteration/allocation budgets | Typed failures occur before prohibited allocation and are distinct from cancellation/watchdog outcomes. |

Every manifest entry should record generator version, seed, family ID, split, dimensions, canonical input hash, expected ROI, target, expected output/error, factorization truth, alpha policy, and the vector schema version. Personal creator or account data must never enter a public vector record.

## Measurement and acceptance plan

The reference report must include exact results, failures, deterministic work counts, stage traces, hashes, and noncanonical runtime/environment diagnostics. No aesthetic score is appropriate for this spike.

### Hard invariants

- Dimension error is exactly zero for every valid request.
- Trim ROI, threshold comparison, basis offset, and empty-region behavior match the manifest.
- `PRO-NOOP` is pixel-identical.
- Alpha-zero RGB changes do not affect canonical/result hashes, visible output, Trim, or factorization evidence.
- Rational overlap weights are nonnegative, cover the declared footprint, and do not accumulate phase drift.
- Nearest, area, anchor, crop, pad, rounding, and tie vectors are stable under repetition.
- Every valid factorization is enumerated; ambiguity is not collapsed into an invented original grid.
- Checked dimensions, strides, allocations, candidates, and iterations cannot overflow or exceed the deterministic budget silently.
- `algorithm-budget-exceeded`, invalid input, `empty-visible-region`, `user-cancelled`, and `host-watchdog-timeout` remain distinct result classes; operational interruption never becomes a canonical pixel choice.
- The actual stage trace matches the stages that changed the result.
- Hashes exclude filenames, timestamps, locale, performance, and other volatile metadata.

### Test method

Use exhaustive reduced-domain enumeration for small dimensions, property tests for rational bounds/weights and Trim equivalence, repeated tie-heavy runs, and bounded fuzzing of in-memory shapes/parameters. The future report should retain failed cases and their manifests rather than dropping them from aggregate counts.

The initial repeat protocol should mirror the benchmark policy: at least two fast repetitions for ordinary goldens, a larger tie-heavy subset for research, and a separately documented release repetition count. These are harness protocol values, not product SLOs.

## Failure and stop conditions

Stop for contract review if any of the following remains unresolved:

- Trim threshold, empty-visible semantics, or basis ordering is ambiguous;
- Contain’s zero-minor-axis behavior is not accepted;
- rounding, anchor, crop/pad, boundary, or odd-remainder behavior is not unique;
- canonical and strict-result alpha-zero policies conflict;
- factorization validity cannot be distinguished from original-grid truth;
- a hash domain includes unstable metadata or has ambiguous field boundaries;
- a valid request produces the wrong dimensions;
- repeated canonical outputs diverge; or
- a typed failure is replaced by a partial file, silent correction, or hidden fallback.

Reject scope expansion if the work begins to require a codec, browser runtime, production engine, encoder, external asset, quantizer, Mixel heuristic, cleanup, or background segmenter. Those are separate, later decisions.

## Artifacts and decisions unlocked

After explicit R0 authorization and a passing run, the spike should produce:

1. a reviewed `pixilate/canonical-rgba/v1` and hash/projection specification;
2. the exact Trim, target, aspect, crop/pad, anchor, rounding, and alpha-zero contract;
3. a typed-error and deterministic-work-budget registry;
4. a bootstrap golden/vector manifest and reproducible conformance report;
5. evidence for the geometry/Trim acceptance criteria and the deterministic requirements;
6. neutral vectors needed before `EX-001` compares candidate strict engines; and
7. the canonical reference endpoint needed before `EX-002` compares decoder/color adapters.

The spike does **not** close `OD-001` or `OD-002`, select a production engine, approve a codec, choose a quantizer, calibrate Auto, prove a Mixel profile, or authorize product implementation. Those remain explicitly gated by the [gap matrix](../../reviews/research-gap-matrix.md), [master plan](../../planning/master-plan.md), and [product requirements](../../planning/product-requirements.md).
