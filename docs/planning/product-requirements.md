# Pixilate product requirements and design contract

**Working title:** Pixilate — temporary and uncertain; product naming is not a release blocker  
**Document type:** research-backed product requirements / design contract  
**Status:** planning baseline; no implementation is authorized by this document  
**Date:** 2026-07-31  
**Amended:** 2026-10-19 — owner decisions `OWN-001`–`OWN-006` are recorded in §25; 2026-10-20 — `OWN-007` (first designed MVP app); earlier text is retained with dated supersession notes  
**License intent:** open source under MIT, subject to dependency and patent review  

## 1. Executive product contract

Pixilate is a local-first web application for turning raster images into exact-size, deliberately pixel-scale assets without generative AI. Its primary use case is converting high-resolution images—including AI-generated pseudo-pixel art—into a requested logical pixel canvas while making grid recovery, spatial reduction, palette reduction, transparency, and cleanup explicit and reproducible.

The name **Pixilate** is a working title only. It is a playful spelling of “pixelate,” but naming, trademark clearance, and final brand selection remain open.

Pixilate will not claim to “perfectly convert every image.” That claim is mathematically and semantically impossible: a small raster cannot preserve every source detail, a background is not always identifiable from pixels alone, and an isolated pixel may be either noise or intentional art. The stronger, testable promise is:

> For fixed input bytes, a supported pinned strict decode path, a complete versioned recipe, and the same engine build, Pixilate provides **end-to-end strict determinism**: exact requested geometry and identical canonical output pixels, or the same deterministic algorithm-budget error. From already canonical RGBA input, the core separately provides **processing determinism**. Automatic mode selects among documented deterministic profiles, reports confidence and fallbacks, and never hides a target-size change or destructive operation. User cancellation and host watchdog termination are operational outcomes, not canonical deterministic results.

The product is organized as three independently usable features:

1. **Resize / Pixelate** — exact target geometry, optional grid recovery, and spatial reconstruction.
2. **Quantize / Palette** — color-count reduction, fixed palette mapping, optional dithering, and palette diagnostics.
3. **Background Removal** — deterministic color-, connectivity-, and seed-based alpha-mask operations.

The tabs are separate in the interface, but their operations can be composed into a visible, versioned pipeline. When composed, background removal writes alpha before Trim is evaluated; geometry precedes final quantization by default; every stage records its actual effective parameters.

This contract is derived from the project-owner statement and the completed research spikes listed in §22. Across the reviewed tools, block size, inferred dimensions, canvas/alpha semantics, palette coupling, cleanup, and replay are exposed under different contracts. PixelLab demonstrates demand through documented cloud/generative workflows; SpriteFusion and Unfaker contain useful deterministic-intent ideas but derive output dimensions from inferred scale. No reviewed tool was documented to combine Pixilate's complete exact-target, alpha-explicit, local, recipe-reproducible workflow.

## 2. Problem statement

Image generators and general illustration tools commonly create large, continuous-tone rasters even when asked for “pixel art.” The output may look pixel-like at normal viewing size while containing:

- irregular or locally inconsistent block sizes;
- pixels that do not align to one logical grid;
- antialiasing, blur, glow, and fractional-alpha edges;
- gradients and thousands of near-duplicate colors;
- JPEG/WebP artifacts and resampling rings;
- accidental one-pixel islands, noisy contours, and misplaced details;
- transparent padding that changes the apparent scale of the subject.

Naive nearest-neighbor or browser-canvas downscaling skips features and depends on sample phase. Smooth resamplers preserve average tone but blur silhouettes and create intermediate colors. Grid-recovery tools can perform well on favorable near-grid sources but may report a lattice on continuous images, choose a harmonic, crop the canvas, or return dimensions not governed by an explicit target. Palette reducers can clean color chatter while erasing rare structural colors. There is no universally correct resolution of these conflicting objectives.

The unmet product need is a deterministic, inspectable converter where the requested logical size is authoritative, the source condition is explicit or confidence-scored, and users can reproduce or tune every material decision without sending image content to an AI service.

## 3. Users and jobs to be done

### 3.1 Primary user segments

| Segment | Job | Typical source | Principal risk |
|---|---|---|---|
| Indie game artist or developer | Turn concept art into a production sprite of an exact size | AI-generated character, icon, prop, portrait | detail displacement, noisy palette, wrong canvas size |
| Pixel artist repairing generated art | Recover a suggested logical grid and remove mixels | pseudo-pixel raster, filtered upscale, compressed sprite | false grid, phase error, thin-detail loss |
| Technical artist / asset-pipeline owner | Produce repeatable outputs in a build or team workflow | batches of source art and saved settings | silent algorithm drift, nondeterministic output, naming collisions |
| Designer converting ordinary raster art | Make a deliberate low-resolution abstraction | illustration, icon, photo, line art | false promise of “recovery,” blur or ringing, palette mismatch |
| Existing pixel-art author | Resize, trim, or remap a clean sprite without damage | native pixel art or integer nearest-neighbor enlargement | unwanted cleanup, palette drift, accidental smoothing |
| Privacy-sensitive creator | Process unpublished art locally | any supported raster | upload, telemetry, or cloud retention |

### 3.2 Representative user stories

- **US-001:** As a game developer, I want a result that is exactly 32×48 logical pixels so I can use it without manual canvas repair.
- **US-002:** As a character artist, I want `Trim` to size the visible subject rather than its transparent padding so differently padded sources produce comparable subject scale.
- **US-003:** As a pixel artist, I want clean enlarged pixel art recovered exactly when its block grid is provable, without quantization or cleanup changing it.
- **US-004:** As a user with AI pseudo-pixel art, I want Auto to show the inferred grid and confidence, then fall back honestly when the grid is ambiguous.
- **US-005:** As an illustrator, I want a no-grid raster profile that creates an exact-size pixel-scale rendition without pretending that it recovered source pixels.
- **US-006:** As a palette artist, I want a maximum visible-color count or an exact imported palette, with locked colors and an explicit transparency policy.
- **US-007:** As an expert, I want to compare reducers, grid hypotheses, dithers, alpha modes, and cleanup rules without hidden constants.
- **US-008:** As a novice, I want a strong deterministic default that asks only for target size, Trim, fit behavior, and optionally a color count.
- **US-009:** As a creator, I want background removal separate from pixelation so selecting a background does not silently alter geometry or colors.
- **US-010:** As a pipeline owner, I want to export and replay a recipe containing engine/profile versions, exact settings, source/output hashes, and warnings.
- **US-011:** As a user of existing pixel art, I want a no-op/identity route and warnings before any destructive cleanup.
- **US-012:** As a keyboard or low-vision user, I want every operation and diagnostic accessible without relying on color or precise pointer placement.

## 4. Vocabulary and normative definitions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **Pixel art:** an image intentionally designed on a discrete logical raster where placement of individual logical pixels is artistically meaningful. A file need not be indexed-color or use a small palette to qualify, though those are common properties.
- **Logical pixel:** one cell in the intended low-resolution output grid. It is distinct from a CSS pixel, display pixel, device pixel, or a source sample.
- **Target logical pixels:** the exact requested native output width and height for the selected sizing basis. Preview enlargement does not change these values.
- **Exact-grid source:** native pixel art or an image formed by uniform, axis-aligned replication of logical pixels, normally with an integer X/Y block size and stable phase. Constant blocks can prove one or more valid factorizations, but cannot reveal boundaries between adjacent identical logical pixels. An exact original-grid claim therefore requires a user/metadata-specified lattice or a unique factorization under declared identifiability preconditions.
- **Mixel / pseudo-pixel source:** an image that visually imitates pixel art but violates a single exact grid through inconsistent cells, resampling, compression, antialiasing, gradients, texture, or mixed local scales.
- **Continuous raster:** an illustration, photograph, or rendered image with no recoverable logical pixel lattice. Converting it is abstraction, not grid recovery.
- **Manual raster / line art:** a continuous or partially discrete source where silhouettes, strokes, and topology deserve more weight than average tone.
- **Spatial reduction:** mapping source coverage into fewer output cells. This is independent of palette quantization.
- **Quantization:** mapping colors to a limited generated or supplied palette. This is independent of output dimensions.
- **Dithering:** spatially distributing palette colors to approximate tones. Dithering intentionally adds texture and is not automatic “quality improvement.”
- **Trim / visible bounds:** selection of the smallest alpha-threshold bounding box used as the geometry basis. Trim is not background detection and does not mean corner-color similarity.
- **Canonical pixels:** oriented RGBA8 pixels in canonical sRGB with fully transparent RGB normalized according to the recipe. Internal filtering may use higher precision and premultiplied linear-light color.
- **Recipe:** a complete, versioned serialization of processing stages, algorithms, parameters, policies, source identity, warnings, and engine identity sufficient for supported replay.
- **Processing determinism:** fixed canonical RGBA input, engine build, and complete processing recipe yield identical canonical result pixels or the same deterministic algorithm-budget error.
- **End-to-end strict determinism:** fixed input bytes, pinned strict decoder/color path, engine build, and complete recipe yield identical canonical result pixels or the same deterministic algorithm-budget error. Byte-identical encoded files are a separate claim requiring a pinned encoder policy.
- **Operational interruption:** user cancellation, worker/process loss, and host watchdog timeout are environment-dependent outcomes. They MUST be reported separately and MUST NOT be cached or marketed as deterministic processing decisions.
- **Alpha policy enum:** exactly one of `PreserveCoverage`, `Binary(threshold)`, or `Matte(color, removalPolicy)`. Alpha aggregation performed by a spatial reducer is a separate algorithm field, not another alpha-policy value.
- **Confidence:** a calibrated score and evidence summary for an inferred input profile or grid hypothesis. Confidence is not a probability of artistic correctness unless calibration data supports that wording.
- **Orphan:** never an aesthetic judgment by default. It is a pixel or connected palette-class component that satisfies a specific serialized connectivity, area, and reassignment rule.

## 5. Product goals, non-goals, and feasibility limits

### 5.1 Goals

- **G-001:** Exact, explicit target logical width and height on every successful Resize / Pixelate operation.
- **G-002:** Deterministic, local, non-generative processing with reproducible recipes.
- **G-003:** Useful support for provable grids, approximate mixel grids, continuous raster art, and manual/line art through honest source-condition profiles.
- **G-004:** First-class full-canvas versus alpha-bounds sizing semantics.
- **G-005:** Independent but composable geometry, palette, and background operations.
- **G-006:** Safe novice defaults plus deep expert controls and diagnostics.
- **G-007:** Exact palette/count contracts and transparent-color semantics.
- **G-008:** An MIT-distributable core with auditable provenance, notices, and dependency closure.
- **G-009:** Browser-local privacy, offline-capable processing, responsive cancellation, and bounded resource use.
- **G-010:** Corpus- and artist-evaluated default profiles whose versions change only through an explicit benchmark gate.

### 5.2 Non-goals

- **NG-001:** Generating new art, using text prompts, or running a generative image model.
- **NG-002:** Claiming semantic understanding of characters, objects, or backgrounds.
- **NG-003:** Guaranteeing preservation of every detail at every target size.
- **NG-004:** Replacing a full pixel editor, drawing application, animation suite, or sprite-sheet packer in the first release.
- **NG-005:** Automatically deleting “ugly” pixels without a formal, inspectable rule.
- **NG-006:** Reproducing proprietary PixelLab, PixelOver, PixaTool, or other closed implementations.
- **NG-007:** Shipping a server fallback merely to widen codec or performance support.
- **NG-008:** Treating a fixed random seed alone as reproducibility.
- **NG-009:** Maintaining byte compatibility with every future profile version; old recipes remain version-addressed instead.

### 5.3 Fundamental limits the product must disclose

1. Downscaling is many-to-one; multiple distinct high-resolution images map to the same output.
2. Preserving average color, silhouette, topology, one-pixel details, low noise, and a small palette are competing objectives.
3. A periodic pattern may be a grid, a texture, a harmonic, or coincidence.
4. A pixel at an image border may be foreground or background; pixels alone do not prove intent.
5. A single isolated output pixel may be noise, a highlight, an eye, a spark, or a required connector.
6. Requested aspect ratio, recovered grid aspect, and a no-crop/no-pad constraint may be mutually incompatible.
7. JPEG and other lossy sources cannot be restored to unknown pre-compression pixels.
8. Strict cross-browser identity is limited to supported codecs, platforms, and the pinned processing path; compatibility decode is a separately labeled mode.

## 6. Support tiers and honest degradation

| Tier | Input condition | Product claim | Required behavior when preconditions fail |
|---|---|---|---|
| S1 — Proven or instructed exact grid | Native 1:1 art, a user/metadata-specified lattice, or a uniquely identifiable uniform replication | Lossless recovery only under the declared lattice and preconditions, subject to requested crop/pad policy | Return all valid factorizations when ambiguous; request a lattice or offer S2/S3/S4; never present the coarsest valid factor as recovered intent |
| S2 — Approximate recoverable grid | One dominant X/Y period and phase with bounded corruption | Deterministic best-effort reconstruction with calibrated confidence | Show alternatives; low confidence falls back to S4 or requires manual override |
| S3 — Mixel reconstruction | Irregular pseudo-cells, mixed local artifacts, AI-like noise | Experimental deterministic candidate selection evaluated against a corpus | Label experimental; show artifacts and candidate comparison; never claim recovered truth |
| S4 — Continuous raster abstraction | No credible grid | Exact-size deterministic reduction and palette abstraction | State that no grid was recovered; use a no-grid profile |
| S5 — Deterministic background selection | Exact/tolerant key, border connectivity, or explicit user seeds define background | Repeatable mask for the stated rule | If rule is ambiguous, request a sample/seed or preserve pixels; no automatic semantic claim |
| S6 — Compatibility input | Codec/color path outside strict conformance set | Best-effort local processing | Prominent non-reproducibility warning; strict recipe export must record the compatibility path |

Release marketing MUST distinguish “supported,” “experimental,” and “compatibility” cases. “Works with any image” may only mean the no-grid S4 route accepts the supported raster—not that every image becomes artistically ideal.

Vocabulary is reserved as follows: `S1–S6` are input-support classes, `T0–T3` are product-scope stages, and `BG-A–BG-E` are background-operation classes. Unqualified “Tier 1/2” wording is forbidden.

## 7. Feature boundaries and composed pipeline

### 7.1 Resize / Pixelate tab

Owns target W×H, sizing basis, aspect behavior, crop/pad/anchor, source profile, grid hypotheses, spatial reducer, alpha aggregation, and optional geometry cleanup. It MUST NOT silently impose a palette cap or remove a background.

### 7.2 Quantize / Palette tab

Owns palette generation/import, visible-color count, locked colors, palette assignment, alpha-slot policy, palette ordering, and dithering. Used alone, it preserves canvas dimensions. Used after resize, it receives the geometry result.

### 7.3 Background Removal tab

Owns exact/tolerant keying, border flood, connectivity, components, user seeds, matte cleanup, and mask preview. Used alone, it preserves canvas dimensions and writes alpha. In a composed recipe it runs before Trim unless the user explicitly reorders stages in advanced mode and accepts the semantic warning.

### 7.4 Normative default stage order

```text
input bytes
  -> bounded strict decode
  -> EXIF orientation normalization
  -> canonical color conversion and RGBA normalization
  -> optional deterministic background stage
  -> Trim/full-canvas basis selection
  -> aspect/crop/pad geometry
  -> profile-specific spatial reduction
  -> palette construction/import and palette mapping
  -> optional dithering
  -> optional explicit cleanup/topology guard
  -> mandatory final palette/alpha contract validator
  -> canonical pixels and diagnostics
  -> deterministic encoder + recipe/sidecar
```

Tabs MUST show the actual composed order. A stage may be omitted, but a processor MUST NOT consume a different intermediate while the recipe says the named stage supplied the result. Under an exact palette or maximum-color contract, dither and cleanup MUST emit only approved palette entries. The final validator either proves the contract, applies a separately named and serialized corrective remap, or returns a typed failure; it is never an unreported color-producing stage.

## 8. Input, decode, color, and output policy

### 8.1 Input conformance classes

- **Candidate T1 strict static inputs:** PNG (mandatory candidate), JPEG, WebP, and BMP through pinned decoders. A format becomes strict only after `OD-002` admits its exact decoder/color/version tuple to the approved strict matrix. A candidate that fails may be deferred or offered only as S6 Compatibility without blocking a PNG-capable T1 release, unless the owner explicitly changes that minimum. GIF frame support is T2 and MUST serialize the selected frame index.
- **Approved strict matrix:** the versioned allowlist produced by `OD-002`, with one row per format/decoder/color-profile case and an `accept`, `warn`, or `reject` result. The product picker MUST exactly match this matrix for the selected path.
- **Expanded strict inputs:** AVIF may enter only after decoder, patent, security, color, and cross-platform conformance review.
- **Compatibility inputs:** browser-decoded formats MAY be offered separately, but MUST be labeled non-strict and MUST NOT inherit the canonical-pixel identity claim without golden conformance.
- **Initially unsupported:** SVG and other active/vector documents, PSD/project files, HEIC/HEVC, video, and unconstrained animation. They require separate rasterization, licensing, or frame-policy work.

Animation MUST NOT silently become “first frame.” If a multiframe file reaches a supporting decoder, the UI must require or visibly default to a serialized frame index. Sequence-level processing is outside T1.

### 8.2 Decode and normalization requirements

- **FMT-001:** Format detection MUST use validated file signatures, not filename extensions or MIME alone.
- **FMT-002:** Orientation MUST be applied before bounds, grid, aspect, or anchor calculations; the export MUST not retain a tag that rotates pixels twice.
- **FMT-003:** Strict decode MUST produce canonical RGBA through one pinned implementation, not browser canvas behavior.
- **FMT-004:** Valid supported embedded profiles MUST be converted to canonical sRGB through a pinned color-management policy; invalid or unsupported metadata MUST yield a named warning or a hard error, never an invisible fallback.
- **FMT-005:** Filtering MUST use premultiplied alpha and linear-light color for profiles that claim fidelity. Legacy gamma-space behavior MAY exist only as an explicit advanced algorithm.
- **FMT-006:** RGB under alpha zero MUST be ignored in trim, grid, palette, and background statistics and canonicalized to `(0,0,0,0)` in strict output unless a specialized preservation recipe says otherwise.
- **FMT-007:** Decoder and color-management versions are part of the engine identity.

Full ICC support is an open implementation decision (§20). Until it passes the gate, the strict support matrix MUST state exactly which profile/chunk cases are accepted, converted, warned, or rejected.

### 8.3 Output policy

- **OUT-001:** T1 MUST export canonical RGBA PNG and a separate recipe JSON. PNG metadata embedding MAY duplicate a compact non-self-referential recipe reference, but the sidecar is authoritative.
- **OUT-002:** Native output dimensions and preview zoom MUST be separate; enlargement previews use nearest-neighbor and never alter export dimensions.
- **OUT-003:** Indexed PNG, palette files, sprite sheets, SVG, JSON-grid exports, and animation are later scope unless individually promoted.
- **OUT-004:** Hashes use the domain-separated schemas in §14.2. The canonical RGBA hash covers only its domain tag/schema, dimensions, and row-major RGBA8. Palette and semantic metadata are hashed separately. The encoded-file hash is reported separately.
- **OUT-005:** Byte-identical PNG is promised only when encoder version, compression, filter, chunks, chunk order, metadata, and timestamp policy are pinned. Timestamps MUST stay outside canonical data.
- **OUT-006:** Downloads MUST use collision-safe names; batch or repeated exports MUST not silently overwrite.

## 9. Exact geometry and Trim semantics

### 9.1 Geometry invariants

- **GEO-001:** A successful Resize / Pixelate operation emits exactly the effective target width `W` and height `H` for the selected output box. No detector, reducer, or “recommended size” may change them.
- **GEO-002:** `W` and `H` are bounded positive integers. If aspect lock derives one dimension, the derived integer is displayed before processing and becomes part of the recipe.
- **GEO-003:** Source pixel size/grid period is evidence about reconstruction, never a substitute for target dimensions.
- **GEO-004:** All integer rounding, anchor, odd-remainder, and tie behavior is serialized.
- **GEO-005:** Output coordinates are logical pixels. CSS/display scaling is never called resolution.

### 9.2 Formal Trim definition

After orientation, canonicalization, and any preceding background operation, let the oriented source canvas be `C = [0,w) × [0,h)` and let `α(x,y)` be integer alpha in `[0,255]`. For serialized threshold `τ`:

```text
Sτ = {(x,y) in C | α(x,y) > τ}
```

The default is `τ = 0`, meaning any visible coverage participates. This is safer for antialiased edges than interpreting “opaque” as alpha 255. Advanced presets MAY expose `Any visible (τ=0)`, `Fully opaque only (τ=254)`, or a numeric value. The comparison is always strict `>` and recorded.

If `Sτ` is nonempty, the Trim basis is the smallest half-open integer box:

```text
B = [xmin, xmax + 1) × [ymin, ymax + 1)
```

Optional source-side Trim padding is applied afterward and clipped to `C`.

- **TRIM-001:** With Trim **off**, the geometry basis is `C`; transparent margins participate in sizing.
- **TRIM-002:** With Trim **on**, the geometry basis is `B`; target geometry is calculated from that box.
- **TRIM-003:** If there is no alpha channel, decoded alpha is 255 and Trim selects the whole canvas unless a background stage has written transparency.
- **TRIM-004:** If `Sτ` is empty, processing stops with `empty-visible-region`. The UI MAY offer an explicit 1×1 transparent export, but not silently.
- **TRIM-005:** The preview MUST show `B`, its source offset, threshold, and padding.
- **TRIM-006:** Trim is alpha-bounds selection, not color-keying, corner similarity, crop-to-content inference, or background removal.

### 9.3 Trim output canvas and restoration

The target applies to the selected **basis geometry box**, not a guarantee that every outer row/column becomes opaque after filtering. The default Trim output policy is:

- **Tight (default):** process `B` into the exact `W×H` output box; discard the external source margins while recording `B` and its offset. Final canvas is exactly `W×H`.

Advanced mode MAY offer:

- **Restore mapped margins:** process the Trim basis into its `W×H` geometry box, then restore the source canvas outside `B` using the same serialized affine/rational mapping, anchor, and rounding policy. In this mode `W×H` describes the mapped Trim basis; the overall restored canvas can be larger and its dimensions MUST be previewed and recorded before export.
- **Place in custom canvas:** place the processed `W×H` basis box into an explicitly entered output canvas at a serialized anchor/offset. The custom canvas dimensions, not hidden inference, control the final file.

Restoration MUST NOT reintroduce pixels removed by background selection unless the user explicitly supplies a retained pre-mask layer. If mapped margins contain nontransparent pixels because the threshold excluded faint coverage, the UI MUST warn before Tight discards them.

### 9.4 Aspect, crop, pad, and stretch

Given basis dimensions `w_b × h_b` and target box `W×H`:

| Mode | Contract | Required controls / warning |
|---|---|---|
| Stretch | Independent scales `sx=W/w_b`, `sy=H/h_b`; exact box | Warn when aspect changes; no hidden uniform-scale claim |
| Contain + pad | Uniform `s=min(W/w_b,H/h_b)`; entire basis retained; exact `W×H` canvas | Pad color/alpha, anchor, rounding, odd remainder |
| Cover + crop | Uniform `s=max(W/w_b,H/h_b)`; exact box filled | Crop anchor; preview lost source region; crop warning |
| Grid-safe | Recover/map logical cells, then deterministically crop, pad, distribute rational cell widths, or post-resample to exact target | Name the compromise; never label a noninteger remap “lossless” |

The normative center-anchor rounding baseline is round-half-to-even, with an odd leftover pixel assigned to the right/bottom. For a nonempty basis, Contain clamps each rounded resized axis to at least one pixel while never exceeding the target box; the unclamped rational scale, clamped resized dimensions, and resulting pad rectangle are serialized. This resolves extreme cases such as an 8192×1 basis contained in 1×1. Cover likewise MUST produce positive intermediate dimensions and MUST reject checked-arithmetic overflow before allocation. Other anchors and rounding rules are valid only when explicit. Transparent padding is default for sources with alpha; an opaque pad color is a user choice.

For the rational area baseline, output cell `(i,j)` covers:

```text
x ∈ [i*w_b/W, (i+1)*w_b/W)
y ∈ [j*h_b/H, (j+1)*h_b/H)
```

Exact rational overlap or a proven equivalent MUST prevent cumulative phase drift.

## 10. Profiles, Auto, confidence, and fallback

### 10.1 Versioned profiles

- **PRO-EXACT:** Exact Grid Recovery — explicit user/metadata period and phase, native 1:1 identity, or a unique constant-block factorization under declared identifiability preconditions; preserve source palette by default; no dither or cleanup. When more than one factorization is valid, report all candidates and require a choice or non-exact fallback.
- **PRO-MIXEL:** AI Pseudo-Pixel / Mixel — bounded grid/cell candidates, confidence and diagnostics, categorical and coverage-aware reducers, conservative palette defaults; experimental until benchmark gate passes.
- **PRO-RASTER:** HD Illustration / Photo Abstraction — no source-grid claim; scale-aware coverage filtering and subsequent palette policy.
- **PRO-LINE:** Manual Raster / Line Art — silhouette/outline/topology-weighted candidate selection; no automatic majority cleanup. It is T2/experimental until it receives a dedicated acceptance gate and phase owner, so it is not a T1 Simple-mode promise.
- **PRO-NOOP:** Identity / Already Native — preserve canonical pixels and dimensions when no transformation is requested.
- **PRO-BG:** Background Selection — a separately versioned mask recipe, not a Resize profile.

Every profile has an immutable profile ID/version and a declared stage/config schema. Changing defaults or scoring creates a new version.

### 10.2 Auto contract

- **AUTO-001:** Auto uses deterministic measurements only; no AI classifier or remote service.
- **AUTO-002:** Measurements MAY include exact-block proof, X/Y periodicity, phase consistency, tile consensus, palette/color entropy, alpha coverage, edge density, and candidate score margins.
- **AUTO-003:** Auto returns the selected profile, ranked alternatives, evidence, confidence band, warnings, and effective settings.
- **AUTO-004:** Target `W×H`, Trim choice, aspect policy, and user locks always override Auto.
- **AUTO-005:** High-confidence exact proof may select PRO-EXACT. Ambiguous grid evidence MUST NOT force a grid route.
- **AUTO-006:** Low-confidence or conflicting evidence falls back to PRO-RASTER, preserving exact target geometry, and tells the user that no reliable grid was recovered.
- **AUTO-007:** Auto MUST NOT enable background removal, destructive cleanup, alpha binarization, crop, or dithering without a named preset rule and visible warning. The T1 default leaves cleanup and dither off.
- **AUTO-008:** Users can override profile, X/Y period, phase, candidate, reducer, and confidence threshold; the recipe records both the recommendation and override.

Confidence thresholds and the automatic score are benchmark decisions, not values to invent during UI implementation. They enter a profile only after §20 gates.

## 11. Simple mode and advanced settings

### 11.1 Simple mode

Simple mode exposes only decisions users must understand:

1. target width and height, with optional aspect lock;
2. Trim checkbox and visible-bounds preview;
3. Stretch / Contain / Cover (Grid-safe appears only when applicable);
4. profile: Auto, Exact Grid, Mixel, Raster, and Identity when applicable; Line Art appears only in T2 experimental surfaces until promoted;
5. optional maximum visible colors or `PreservePalette`;
6. Process and Export.

It also shows, without requiring edits: effective dimensions, selected profile and confidence, output color count, alpha status, crop/pad warning, and estimated resource use. “Advanced settings unused” means the versioned profile defaults are serialized; it does not mean settings are absent.

### 11.2 Advanced settings taxonomy

| Group | Controls |
|---|---|
| Input interpretation | strict/compat decode, frame index, color metadata policy, alpha-zero sanitation |
| Bounds and geometry | Trim threshold/padding, Tight/restore/custom canvas, fit mode, anchor, pad, rounding, boundary extension |
| Grid evidence | exact/detect/manual, independent X/Y period, phase, orientation/skew experiment, candidate range, confidence threshold, tile consensus |
| Cell/reconstruction | rational area, center/nearest, whole-color mode, perceptual-binned mode, medoid, mean, edge-aware candidate, coverage threshold, tie policy |
| Palette | preserve/extract/import, maximum/exact count, visible-count semantics, color space/metric, locked/protected colors, alpha weight, palette order |
| Dither | none, ordered matrix, fixed audited blue noise, fixed-point error diffusion; strength, phase, scan policy |
| Alpha | `PreserveCoverage`, `Binary(threshold)`, `Matte(color, removalPolicy)`; separate alpha aggregation/level quantization; hidden-RGB policy |
| Cleanup | off, component rule, neighborhood energy, morphology on named masks/classes, connectivity, area, topology guard, protected colors |
| Background | key samples, exact/perceptual tolerance, all vs border-connected, 4/8 connectivity, holes/components, seeds, matte decontamination |
| Diagnostics | grid/cell overlay, candidate comparison, bounds, palette histogram, alpha preview, changed pixels, topology metrics, timing/memory |
| Reproducibility | profile/engine version, seed where required, source hash, encoder policy, recipe import/export |

Hidden method-specific constants are prohibited. If a constant materially changes pixels, it belongs in the versioned algorithm definition and effective recipe even when the UI does not expose it.

## 12. Transparency, palette, dither, cleanup, and background semantics

### 12.1 Transparency and alpha

- **ALPHA-001:** Spatial filtering uses the same weights for alpha and premultiplied linear color; unpremultiply only when output alpha is nonzero.
- **ALPHA-002:** `PreserveCoverage` is the general default. `Binary(threshold)` requires a serialized integer threshold and comparison rule. `Matte(color, removalPolicy)` requires a serialized canonical matte color and removal policy. These are the only alpha-policy enum values.
- **ALPHA-003:** Grid and palette analysis ignore RGB at alpha zero and weight partial coverage according to the versioned profile.
- **ALPHA-004:** Alpha aggregation and palette alpha are separate decisions. A transparent palette entry does not reduce the advertised visible-color count.
- **ALPHA-005:** Preview must composite over checkerboard, black, white, and user-selectable solid color to reveal halos.

### 12.2 Palette contract

- **PAL-001:** “Maximum N visible colors” means the final output contains at most `N` distinct RGB colors among pixels with alpha above the recipe’s visibility threshold. Fully transparent does not consume a visible slot.
- **PAL-002:** “Exact imported palette” means every qualifying output RGB belongs byte-for-byte to the normalized imported palette; violations are a hard error.
- **PAL-003:** If an exact count is requested but the source/result needs fewer unique colors, the UI MUST say “used M of N”; it MUST NOT synthesize unused colors merely to reach N.
- **PAL-004:** Locked colors participate in assignment but are not moved. More unique locks than available slots is a blocking validation error.
- **PAL-005:** Palette import preserves a documented order, removes duplicates through a documented rule, and records normalization.
- **PAL-006:** Final palette enforcement runs after every color-producing stage. No reducer fallback, cleanup, or alpha operation may silently overflow the requested cap.
- **PAL-007:** Quantization algorithm, metric/color space, sample weights, seed, iteration/stopping rule, empty-cluster rule, rounding, and ties are recipe fields or immutable algorithm-version properties.

### 12.3 Dithering

- **DITH-001:** Default is none.
- **DITH-002:** Dither runs only after the palette is fixed unless a separately benchmarked profile says otherwise.
- **DITH-003:** Matrix/kernel, strength, phase, scan direction, serpentine policy, fixed-point error precision, clipping, and transparent-boundary behavior are deterministic and serialized.
- **DITH-004:** Dither preview warns that it intentionally creates isolated/alternating pixels and may conflict with cleanup.
- **DITH-005:** Bundled matrices/noise assets require provenance and license audit.

### 12.4 Cleanup and topology

- **CLEAN-001:** Cleanup is off by default in T1.
- **CLEAN-002:** Every cleanup rule defines palette/color class, 4/8 connectivity, neighborhood, maximum component area, replacement candidates, tie order, and protected masks/colors.
- **CLEAN-003:** Cleanup shows a diff overlay, changed-pixel count, component/hole changes, and undoable before/after state.
- **CLEAN-004:** A topology guard MAY reject changes that alter protected component/hole counts or Euler characteristic under a declared connectivity pair.
- **CLEAN-005:** Per-channel morphology that can synthesize nonexistent colors is not a default. Whole-color or mask/class operations are preferred.
- **CLEAN-006:** Marketing/UI MUST name the rule (“remove 1-pixel isolated components”) rather than promise generic “beautification.”

### 12.5 Deterministic background removal

Background removal changes alpha; it does not resize or quantize unless composed.

- **BG-001:** BG-A exact key removes exact selected RGB/RGBA matches, either globally or only in selected/border-connected regions.
- **BG-002:** BG-B tolerance key uses a named metric, numeric inclusive/exclusive threshold, alpha policy, and one or more sampled colors.
- **BG-003:** BG-C border flood uses fixed seed enumeration, 4/8 connectivity, fixed neighbor order, and explicit handling of enclosed holes and foreground touching the border.
- **BG-004:** BG-D component rules remove only components satisfying serialized border/area/location predicates.
- **BG-005:** BG-E advanced seeded graph cut MAY be added only after deterministic, bundle, license, and quality gates. It requires explicit rectangle/mask/strokes and MUST NOT be marketed as universally automatic.
- **BG-006:** Mask preview, invert, add/subtract seeds, undo, and before/after alpha are required before destructive application.
- **BG-007:** Matte decontamination/edge color repair is a separate toggle with a declared algorithm; transparent RGB is canonicalized at export.
- **BG-008:** When composed, the resulting alpha is the input to Trim. Changing the mask invalidates/recomputes bounds and downstream results.

## 13. Functional requirements

The following requirements have stable IDs. “Tier” references §19.

| ID | Requirement | Priority / tier | Verification |
|---|---|---|---|
| FR-001 | Import a strict supported static raster with signature, dimension, pixel-count, frame, and memory validation. | Must / T1 | format and hostile-fixture tests |
| FR-002 | Display oriented source dimensions, alpha presence, visible bounds, color count estimate, and decode warnings before processing. | Must / T1 | UI/integration tests |
| FR-003 | Accept explicit target W×H and produce it exactly for Tight Trim/full-canvas output. | Must / T1 | property test across bounded W/H |
| FR-004 | Provide Trim off/on using §9.2 alpha-bound semantics and show the selected rectangle. | Must / T1 | golden alpha fixtures |
| FR-005 | Provide Stretch, Contain+pad, and Cover+crop with explicit anchors and deterministic rounding. | Must / T1 | geometry goldens |
| FR-006 | Provide PRO-NOOP, PRO-EXACT, PRO-RASTER, and a clearly experimental provisional PRO-MIXEL candidate behind versioned profiles. PRO-LINE is deferred to T2 until promoted through its own gate. | Must / T1 | profile schema + corpus |
| FR-007 | Auto must expose selected profile, confidence/evidence, fallback, alternatives, and override. | Must / T1 | decision-vector tests |
| FR-008 | Provide native-scale and enlarged-nearest previews with grid, bounds, crop, and alpha overlays. | Must / T1 | visual/accessibility tests |
| FR-009 | Preserve dimensions when Quantize / Palette is used alone. | Must / T1 | dimension invariant |
| FR-010 | Enforce maximum visible-color and exact imported-palette contracts after all color-producing stages. | Must / T1 | palette property tests |
| FR-011 | Offer `PreserveCoverage` and `Binary(threshold)` in T1; `PreserveCoverage` is default. `Matte(color, removalPolicy)` is gated advanced scope. Alpha aggregation is serialized separately. | Must / T1 | alpha/compositing goldens |
| FR-012 | Export canonical PNG, canonical/output hashes, diagnostics, and recipe JSON. | Must / T1 | replay/encoder tests |
| FR-013 | Import a compatible recipe and replay it or identify the unavailable engine/profile without substituting silently. | Must / T1 | round-trip/golden tests |
| FR-014 | Provide exact/tolerance key and border-connected background selection with mask preview. | Must / T2 | mask goldens |
| FR-015 | Compose background → bounds → resize → quantize in a visible reorderable recipe, with safe default order. | Must / T2 | pipeline integration tests |
| FR-016 | Provide generated/imported palettes, locked colors, palette ordering, and no-dither/ordered-dither paths. | Must / T2 | palette/dither goldens |
| FR-017 | Provide optional formal cleanup with diff, counts, and topology diagnostics. | Should / T2 | topology corpus |
| FR-018 | Save named local profiles/recipes without embedding source pixels unless requested. | Should / T2 | storage/privacy tests |
| FR-019 | Process selected animation frames or batches with shared profile/grid/palette locks and collision-safe export. | Could / T3 | sequence/batch tests |
| FR-020 | Offer mapped-margin/custom-canvas Trim restoration with previewed final dimensions. | Should / T2 | geometry goldens |
| FR-021 | Never upload image bytes in the deterministic core; network status and optional telemetry remain separately inspectable. | Must / T1 | automated network audit |
| FR-022 | Cancel work, release buffers, and preserve the last valid preview without corrupt partial exports. | Must / T1 | cancellation/resource tests |
| FR-023 | Report deterministic input-provenance (source-generator) signals read from container metadata, with published output dimensions as weak, advisory evidence only, worded as “file metadata claims (signature not checked)”. The signal is report-only: it never selects a profile, preset, or default by itself. Prompts, workflow text, and usernames found in metadata are never copied into recipes, reports, or exports. Watermark handling is masking-only: a declared or estimated region may be excluded from analysis and is recorded in the recipe; no stage removes, inpaints, or recolors it. Added 2026-10-19 by `OWN-003` (§25); dimension wording amended 2026-10-19 (§25 `OWN-003` note). | Should / T0 experimental, T1 | provenance fixtures and no-prompt-leak test (`AC-PROV-001`) |

## 14. Determinism, replay, and metadata contract

### 14.1 Canonical determinism requirements

- **DET-001:** One strict processing implementation per engine build. Canvas, GPU, native, JS, SIMD, or compatibility fallbacks may not be swapped invisibly.
- **DET-002:** Row-major/fixed traversal, stable total sorting, explicit neighbor order, lexicographic or serialized ties, and deterministic reduction order are mandatory.
- **DET-003:** Random sampling is avoided where bounded enumeration is practical. Otherwise, PRNG algorithm and seed are fixed and recorded.
- **DET-004:** Decision-critical reductions must not use unordered parallel accumulation. SIMD/threads require golden proof of identical canonical pixels or a distinct engine ID.
- **DET-005:** NaN/infinity are rejected or prevented; relaxed SIMD and fast-math are prohibited for strict decision paths unless proven irrelevant.
- **DET-006:** Iterative algorithms specify initialization, exact iteration maximum, stopping comparison, empty-state behavior, and ties.
- **DET-007:** Golden canonical-pixel hashes pass on the supported Chrome, Firefox, Safari, and Edge matrix across declared x86-64 and ARM64 platforms before strict claims ship.
- **DET-008:** Improvements create a new profile or engine version. Opening an old recipe never silently migrates it to new pixel behavior.

### 14.2 Required recipe fields

All SHA-256 inputs use a fixed UTF-8/byte encoding and a domain tag that cannot collide with another artifact class:

| Hash domain | Canonical bytes | Explicit exclusions |
|---|---|---|
| `pixilate/source-bytes/v1` | original encoded byte length + bytes | filename, MIME claim, timestamps |
| `pixilate/canonical-rgba/v1` | unsigned little-endian width/height + row-major RGBA8 | palette order, recipe, diagnostics, encoder metadata |
| `pixilate/palette/v1` | palette schema + normalized ordered RGBA entries + locks/transparent-slot semantics | output pixels and unused UI state |
| `pixilate/semantic-result/v1` | canonical RGBA hash + optional palette hash + effective stage-trace hash | performance, environment, filename, wall clock |
| `pixilate/recipe-input/v1` | canonical input-affecting recipe projection through requested settings and engine IDs | result hashes, encoded-file hash, performance, warnings discovered only during execution |
| `pixilate/recipe-result/v1` | recipe-input hash + actual stage trace + warnings/fallbacks + semantic-result hash | encoded-file hash and volatile diagnostics |
| `pixilate/encoded-file/v1` | exact encoded output bytes | external sidecar and any self-referential file-hash field |

An encoded file MUST NOT embed its own encoded-file hash. If PNG embeds a compact recipe reference, that reference may contain the recipe-result or semantic-result hash, while the encoded-file hash remains external. “Relevant palette metadata” never silently changes the canonical RGBA hash.

At minimum, the result recipe/manifest contains:

```text
schemaVersion
engineId, engineVersion, buildHash
strictOrCompatibilityPath
decoder/encoder/colorManagement IDs and versions
sourceByteHash, sourceLength, decoded dimensions, orientation action
canonicalSourcePixelHash (when available)
ordered stage list
profile ID/version and Auto evidence/confidence/alternatives
background settings and resulting mask/bounds hashes
Trim threshold, padding, source rectangle, restoration policy
target box, final canvas, aspect mode, anchor, crop/pad/rounding
grid periods/phases/candidates and user overrides
reducer, alpha, palette, dither, cleanup settings
seeds, tie policies, iteration/stopping rules
warnings and fallbacks actually taken
`semantic_result_sha256`, `palette_sha256` when applicable, and external `encoded_file_sha256`
performance diagnostics (noncanonical)
```

Wall-clock timestamps, UI locale, filenames, elapsed time, host watchdog outcomes, and environment descriptions are noncanonical metadata and MUST NOT alter result hashes. Canonical JSON rules define key order, integer/rational encodings, and omission/default behavior; derived result hashes are excluded from `recipe-input` to avoid circular identity.

### 14.3 Replay behavior

If an exact engine/profile is available, replay MUST either match the stored canonical result hash or fail with a diagnostic. If it is unavailable, the UI may offer “reprocess with current engine” only as a new branched recipe with no identity claim. Unsupported compatibility decode may likewise be branched, never substituted silently.

## 15. Preview, warnings, errors, and explanation

### 15.1 Preview requirements

- Native 1:1 logical view and integer nearest-neighbor zoom.
- Before/after split and rapid toggle.
- Checkerboard and multiple solid compositing backgrounds.
- Alpha/Trim bounds, crop, padding, grid period/phase, irregular cells, and candidate overlays.
- Palette swatches/histogram, used versus allowed count, locked colors, and violations.
- Changed-pixel/diff overlay for cleanup and background operations.
- Effective recipe summary, output dimensions, final canvas dimensions, warnings, and estimated processing cost.

Preview and export MUST use the same processing engine and recipe. A reduced-quality preview path must be explicitly labeled and cannot be presented as pixel-identical.

### 15.2 Blocking errors

The product returns stable error codes and actionable text for at least:

- unsupported or signature-mismatched format;
- malformed/truncated data or invalid color metadata under strict policy;
- unsupported animation/frame;
- zero/invalid dimensions, overflow, pixel/memory limit, or allocation failure;
- empty visible region under Trim;
- target outside supported bounds;
- impossible palette request or too many locked colors;
- unavailable recipe engine/profile;
- deterministic conformance failure;
- deterministic `algorithm-budget-exceeded` or internal invariant violation; `host-watchdog-timeout` and `user-cancelled` are separate noncanonical operational outcomes.

No partial file may be offered as successful output after a blocking error.

### 15.3 Nonblocking warnings

Warnings include:

- low/ambiguous grid confidence or conflicting X/Y evidence;
- Auto fallback from grid recovery to raster abstraction;
- aspect distortion, source crop, or restored canvas larger than target;
- faint-alpha pixels excluded by Trim threshold;
- compatibility decode or unverified color profile;
- palette compression likely to remove rare colors;
- cleanup/dither/topology changes;
- source already smaller than target or native art at risk of destructive reduction;
- estimated memory/time near limit;
- requested grid-safe behavior incompatible with exact target without crop/pad/nonuniform cells.

Warnings are serialized. A fallback that changes pixels or semantics may not be a console-only event.

## 16. Nonfunctional requirements

### 16.1 Privacy and offline behavior

- **NFR-PRIV-001:** Image bytes and canonical pixels remain on device for all core operations.
- **NFR-PRIV-002:** No source thumbnail, filename, hash, palette, or recipe leaves the device without an explicit user action naming the destination.
- **NFR-PRIV-003:** Telemetry is off by default for the first public release or strictly opt-in; if later enabled, it is content-free, documented, and independently disableable.
- **NFR-PRIV-004:** After initial installation/cache, the supported core processing experience operates offline. Offline availability and update state are visible.
- **NFR-PRIV-005:** Local recipes do not contain source pixels by default; users can delete local state.

### 16.2 Accessibility

- **NFR-A11Y-001:** Conform to WCAG 2.2 AA for the supported core workflow.
- **NFR-A11Y-002:** Every control and canvas-adjacent action is keyboard operable with visible focus; pointer precision is not required.
- **NFR-A11Y-003:** Status, progress, errors, profile selection, confidence band, dimensions, and warning changes are announced through appropriate semantics without excessive live-region noise.
- **NFR-A11Y-004:** Color is never the only carrier of bounds, diffs, palette locks, or warnings; patterns, labels, outlines, and text equivalents are provided.
- **NFR-A11Y-005:** Zoom, high contrast, reduced motion, and 200% text reflow do not block processing/export.
- **NFR-A11Y-006:** Image diagnostics have textual summaries suitable for screen-reader review.

### 16.3 Performance, size, and cancellation

Numeric lifecycle is normative: `proposed` → `approved blocking budget` → `measured baseline` → `release limit`. Every numeric item records its status, owning decision, reference environment, and approval record. Values below are **proposed / OD-011**, not release limits or measured baselines:

- encoded input ≤64 MiB;
- each dimension ≤8192;
- decoded pixels ≤16 megapixels on the initial desktop conformance path;
- estimated peak engine memory ≤512 MiB;
- output pixels and palette allocations checked with overflow-safe arithmetic.

The product MAY apply a lower device-aware limit, but never a higher unvalidated one. It MUST explain which deterministic work/allocation limit was hit before the prohibited allocation. Mobile ceilings and final public limits are benchmark decisions. Per-parser limits additionally cover metadata bytes, decompressed ICC/profile bytes, chunks, frames, palette entries, recipe JSON bytes/depth/keys/strings, strides, aggregate live JS/Wasm buffers, grid candidates, iterations, graph nodes/edges, and queues.

- **NFR-PERF-001:** **Proposed / OD-011:** Decode and standard raster baseline for a 4 MP input to ≤256×256 output completes p95 within 2.0 seconds on the published reference desktop after engine load. It becomes blocking only after OD-011 approval.
- **NFR-PERF-002:** UI input/progress remains responsive while work runs in a worker.
- **NFR-PERF-003:** **Proposed / OD-011:** Cancellation is acknowledged within 250 ms at defined stage boundaries and releases task-owned large buffers within 1 second after acknowledgement. Cancellation/host watchdog termination is operational and is excluded from canonical deterministic result identity.
- **NFR-PERF-004:** Mixel/experimental profiles publish separate p50/p95 and memory budgets before default eligibility; no unmeasured algorithm inherits the baseline SLO.
- **NFR-PERF-005:** Startup/bundle budgets are set after the engine/codec experiment; **proposed / dependency-intake policy:** any dependency that adds >1 MiB compressed requires explicit justification and a measured alternative.

Reference hardware/browser and corpus must be versioned with benchmark reports. If NFR-PERF-001 proves unrealistic, changing it requires a documented gate decision, not silent relaxation.

### 16.4 Security and resilience

- **NFR-SEC-001:** Bounded decode with checked integer arithmetic, dimension/frame/memory limits, worker isolation, cancellation, and time budgets.
- **NFR-SEC-002:** Fuzz strict decoders, recipe parsers, palette import, and all image-size arithmetic; malformed inputs fail closed.
- **NFR-SEC-003:** Use a restrictive Content Security Policy, no runtime `eval`, no unnecessary remote scripts, and integrity/version control for release assets.
- **NFR-SEC-004:** Recipe import is data only; it cannot fetch code, read arbitrary local paths, or select an untrusted plugin.
- **NFR-SEC-005:** Maintain dependency vulnerability scanning, lockfiles, reproducible release provenance, and an SBOM.
- **NFR-SEC-006:** Export uses atomic in-memory completion before download; failed/cancelled work cannot masquerade as a valid artifact.
- **NFR-SEC-007:** Strict algorithms use deterministic work budgets (bytes, pixels, candidates, iterations, allocations, graph/queue entries), not wall-clock time, to choose canonical success versus typed failure. A host watchdog MAY terminate runaway work for safety but reports `host-watchdog-timeout` as a noncanonical operational outcome distinct from `algorithm-budget-exceeded`.

### 16.5 Open source and licensing

- **NFR-LIC-001:** Pixilate-owned source is MIT unless a file clearly states a compatible retained upstream license.
- **NFR-LIC-002:** Every release includes third-party notices and an SBOM generated from the actual bundled artifact.
- **NFR-LIC-003:** Pin exact dependencies/features; scan source, generated Wasm/object inputs, bundled matrices/assets, and codec closure.
- **NFR-LIC-004:** GPL-only code such as current libimagequant is excluded from the MIT core absent a deliberate product-license change or suitable commercial license. LGPL/Wasm static-link paths require counsel and compliance design.
- **NFR-LIC-005:** Do not copy proprietary PixelLab extension/server code, closed front ends, assets, trademarks, or undocumented commercial algorithms.
- **NFR-LIC-006:** Code license does not resolve algorithm patents, codec patents, training/output terms, or asset copyright; each enters the release gate separately. AI-service outputs additionally require recorded service/model/terms, depicted-IP and privacy/publicity review, and an explicit redistribution grant/decision; prompts alone are not provenance.
- **NFR-LIC-007:** Copied/substantially derived MIT code retains upstream copyright and license notices; clean reimplementation still records conceptual provenance where helpful.

This section is engineering policy, not legal advice.

## 17. Acceptance criteria

### 17.1 Core geometry and Trim

- **AC-GEO-001:** Destination construction plus exhaustive reduced-domain/property/boundary tests prove that every successful Tight Resize allocates and writes exactly checked `W×H`; the corpus has zero observed dimension violations or nearby inferred sizes.
- **AC-GEO-002:** Contain, Cover, and Stretch goldens verify source mapping, anchor, round-half-to-even, right/bottom odd remainder, and the positive-minor-axis clamp at extreme aspect ratios.
- **AC-TRIM-001:** With `τ=0`, two fixtures containing identical subject pixels but different fully transparent margins produce identical Tight results under the same recipe and basis target.
- **AC-TRIM-002:** Trim off on those fixtures preserves the effect of different full canvases.
- **AC-TRIM-003:** Fully transparent input produces `empty-visible-region`; a user-selected transparent fallback is a distinct recipe.
- **AC-TRIM-004:** Mapped-margin restoration previews and exports the recorded overall canvas size while the mapped Trim basis remains the declared `W×H` box.

### 17.2 Profiles and quality boundaries

- **AC-PRO-001:** PRO-EXACT returns every valid exact constant-block factorization. It recovers identical logical dimensions, RGBA pixels, and palette only for native 1:1, instructed, or uniquely identifiable fixtures where no conflicting target policy applies. Uniform-color, equal-adjacent-cell, nested-block, and harmonic fixtures MUST report ambiguity rather than invented original dimensions.
- **AC-PRO-002:** One contaminated sample cannot cause Auto to silently crop or change output dimensions; confidence/fallback is recorded.
- **AC-PRO-003:** On no-grid gradients/photos, low confidence routes to PRO-RASTER and the UI states “no reliable source grid detected.”
- **AC-PRO-004:** PRO-MIXEL is not labeled default/stable until it beats declared baselines on held-out objective metrics and blinded artist preference without regression beyond gate thresholds.
- **AC-PRO-005:** PRO-NOOP round-trips supported already-native canonical PNG fixtures pixel-identically when no color/background operation is selected.

### 17.3 Color, alpha, cleanup, and background

- **AC-PAL-001:** For every supported maximum `N` (with 16 as a mandatory regression case), the final output never yields more than `N` qualifying RGB values after reducer fallback, dither, cleanup, matte repair, and the mandatory final validator.
- **AC-PAL-002:** Exact imported palette yields zero qualifying RGB violations after the final validator; duplicate/locked-color handling and any named corrective remap match the recipe.
- **AC-ALPHA-001:** Hidden RGB under alpha zero cannot change Trim, grid confidence, palette, or visible output; halo fixtures pass over black, white, gray, and checkerboard.
- **AC-DITH-001:** None, ordered, and any enabled diffusion algorithm reproduce golden hashes and serialize phase/scan/kernel settings.
- **AC-CLEAN-001:** Cleanup off changes zero pixels. Cleanup on reports changed pixels/components/holes and never introduces a nonpalette RGB when a palette is enforced.
- **AC-BG-001:** Exact border-connected removal preserves an enclosed same-colored foreground region in the connectivity fixture; global exact key removes it by design and shows that semantic difference.
- **AC-BG-002:** The same mask/recipe produces the same alpha hash, and downstream Trim recomputes from that mask.

### 17.4 Reproducibility, privacy, resilience, accessibility

- **AC-DET-001:** 1,000 repeated adversarial tie cases within one engine build produce one canonical hash.
- **AC-DET-002:** Golden hashes match on the published browser/architecture matrix; any divergent optimized build receives a distinct engine ID or is rejected.
- **AC-DET-003:** Recipe export/import replays to the stored canonical result hash; unavailable engines fail without substitution.
- **AC-PRIV-001:** Automated network inspection while importing, processing, previewing, saving locally, and exporting finds no image bytes, filenames, content hashes, palette values, or recipes leaving the origin.
- **AC-OFF-001:** After installation/cache, the complete T1 import-process-export workflow succeeds with the network disabled.
- **AC-SEC-001:** Malformed, decompression-bomb, overflow, oversized, and hostile metadata corpora fail within declared resource limits without UI crash or partial successful export.
- **AC-SEC-002:** Identical inputs that exceed a deterministic algorithm work budget produce the same `algorithm-budget-exceeded` result across the strict matrix; host watchdog termination is reported separately and never accepted as a canonical golden result.
- **AC-CAN-001:** Cancellation meets NFR-PERF-003 on the reference platform.
- **AC-A11Y-001:** An accessibility audit and keyboard-only test complete import, target/Trim setup, processing, warning review, recipe export, and PNG export at WCAG 2.2 AA.
- **AC-LIC-001:** Release CI emits a reviewed SBOM/notices set and fails on unapproved license classes or unpinned dependencies.
- **AC-PROV-001 (added 2026-10-19, `OWN-003`):** Fixtures with known container metadata report the expected provenance signal labelled “file metadata claims (signature not checked)”. Fixtures whose metadata contains prompt, workflow, or username text yield recipes, reports, and exports that contain none of that text. With no watermark mask applied, output pixels are identical whether detection runs or not; a recorded mask only excludes its region from analysis.

## 18. Measurement and benchmark policy

The benchmark corpus is a product dependency, not optional QA. It must be license-safe, provenance-tagged, versioned, and divided by source family to prevent near-duplicate leakage.

Required strata:

1. synthetic reversible grids with X/Y periods, phases, nonuniform replication, filtering, noise, compression, orientation, and alpha corruption;
2. artist-consented true/manual pixel art with one-pixel features, holes, outlines, tiles, and transparency;
3. AI pseudo-pixel/mixel outputs from multiple generators/styles, with redistribution terms recorded;
4. HD illustrations, icons, line art, and photos with no expected grid;
5. alpha/color torture fixtures including hidden RGB, partial alpha, ICC/gamma/orientation cases;
6. background cases with shared colors, border contact, holes, gradients, shadows, and texture.

Metrics must include exact dimension/palette invariants, grid period/phase error, logical-pixel accuracy, alpha IoU/boundary/halo error, perceptual color error, edge displacement, component/hole/topology delta, thin-feature survival, orphan diagnostics, reconstruction error, runtime, peak memory, cancellation, and bundle size. SSIM may supplement but never replace edge/topology/artistic assessment.

Human evaluation asks separately about silhouette, grid cleanliness, palette, important details, noise, and usefulness. Results are stratified by pixel artists, game developers, and general users. Pairwise candidates are shown at native and integer-nearest enlarged scale; evaluator and source-family splits are held out from tuning. Corpus counts, panel sizes, preference cutoffs, and regression margins are `PROVISIONAL-PILOT` until a preregistered power/sensitivity analysis uses observed judge and source-family variance. Confirmatory analysis MUST use a hierarchical paired model or multiway resampling that accounts for crossed judge and asset-family effects, predeclare tie/N/A handling and multiplicity, and define metric-specific practical margins in native units rather than normalizing unrelated metrics to one threshold.

## 19. Scope tiers and phased product boundary

### T0 — Research proof (must precede product defaults)

- Headless canonical decode/geometry test harness.
- License-safe fixture corpus and hash/metric runner.
- Exact-grid proof plus categorical recovery baseline.
- Rational premultiplied-linear area baseline.
- Quantizer bake-off and palette invariants.
- Provisional global-grid/mixel candidates and confidence experiment.
- Cross-runtime determinism probes and license closure.

**Exit:** P0 decisions in §20 meet their gates; hard invariants pass; no UI quality promise is locked before this point.

T0 has two authorization gates:

- **Gate R0 — documentation to research harness:** authorizes only a dependency-clean in-memory canonical-RGBA Slice A after the owner accepts the hash domains, alpha/Trim/geometry formulas (including empty/extreme cases), deterministic work-budget/error taxonomy, procedural-fixture license policy, and test-vector review. Slice A may implement hashing, Trim, Stretch/Contain/Cover, nearest/nonnegative rational area, and exact-factorization ambiguity reporting. It MUST NOT freeze a production codec, engine/Wasm bridge, quantizer, Mixel scorer, background segmenter, or visual default.
- **Gate R1 — research harness to product implementation:** requires the approved strict codec/color matrix, corpus/metric governance, measured/approved resource budgets, cross-runtime evidence for the selected engine, dependency closure, and accepted profile gates. Only R1 authorizes product UI/release implementation.

### T1 — Exact-target local web MVP

- Static import for every format admitted by the approved OD-002 strict matrix; PNG is the minimum mandatory T1 candidate, while JPEG/WebP/BMP may be deferred or S6 Compatibility if their gates fail.
- Resize / Pixelate with exact W×H, Trim Tight, Stretch/Contain/Cover, profiles, Auto diagnostics, preview.
- PRO-NOOP, PRO-EXACT, PRO-RASTER, and clearly experimental PRO-MIXEL. PRO-LINE remains T2/experimental until separately promoted.
- Basic independent Quantize / Palette: preserve, maximum count, imported palette, no dither plus one ordered option.
- Canonical PNG and recipe JSON export/import.
- Worker, cancellation, limits, offline install/cache, accessibility, privacy, security, SBOM/notices.

### T2 — Composable expert workflow

- Deterministic Background Removal BG-A–BG-D.
- Visible composed pipeline and mapped-margin/custom-canvas restoration.
- Palette locks, broader quantizers/dithers, diagnostics, optional cleanup/topology guard.
- Named local recipes/profiles and richer candidate comparison.
- Expanded strict GIF-frame/color-profile support if gates pass.

### T3 — Production pipeline expansion

- Batch and animation with shared grid/palette locks and collision-safe outputs.
- Indexed PNG/palette formats, structured grid exports, CLI/library integration.
- Additional codecs after deterministic/security/license gates.
- Seeded graph cut or segmentation only if measured value justifies complexity.

Tiers do not authorize implementation; they define planning boundaries and exit conditions.

## 20. Open implementation decisions with entry/exit criteria

No item below is selected merely because research found a promising library or attractive sample.

| Decision | Entry criteria | Candidates / experiment | Exit criteria |
|---|---|---|---|
| OD-001 strict engine — **closed 2026-10-19 by owner decision `OWN-001` (§25)**; no comparative evidence was produced and `EX-001` was not run; the exit criteria remain verification obligations for the selected JavaScript engine | T0 harness and reference fixtures exist | Rust/Wasm single core vs constrained TypeScript; scalar vs proven SIMD | canonical hash conformance, performance/memory budget, small auditable bundle, MIT-compatible closure |
| OD-002 codecs/color | hostile/color/orientation fixtures and policy table exist | `image` family, focused C/Wasm codecs, optional Little CMS | correct fixture pixels, fuzz/security pass, explicit profile behavior, browser matrix identity, license/patent review |
| OD-003 raster reducer default | geometry/alpha metrics implemented | rational area, box, Mitchell, Lanczos3, Catmull-Rom, medoid candidates | Pareto result on halo/edge/color/human preference; deterministic hash; runtime budget |
| OD-004 exact/approx grid | synthetic period/phase and ambiguity corpus exists | exact factorization set, instructed/unique recovery, runs, edge/autocorrelation/FFT, tile consensus | 100% valid-factorization enumeration; 100% original recovery only on instructed/uniquely identifiable cases; ambiguity fixtures never invent authority; calibrated contamination behavior |
| OD-005 mixel candidate/scorer | held-out multi-generator corpus and artist panel exist | global grid cells, nearby hypotheses, rational medoid, irregular-boundary DP, optional segmentation advisory | held-out rank correlation and pairwise win versus baselines; bounded regressions; acceptable runtime; explainable confidence |
| OD-006 cell representative | cells/ground truth available | mean, whole-color mode, perceptual-binned mode, medoid, center, edge-aware | best stratum-specific edge/detail/topology and artist preference; stable ties |
| OD-007 quantizer | palette metrics, locked colors, alpha cases exist | Wu, quantette, Wu+fixed Lloyd in Oklab, ExoQuant, image-q, modern libimagequant as an isolated GPL/commercial research oracle not approved for the current production bundle | exact caps/locks, perceptual and artist results, deterministic decisions, runtime, approved distribution provenance |
| OD-008 dither set | palette baseline stable | none, Bayer, audited fixed blue noise, fixed-point FS/Sierra/Atkinson | deliberate style benefit, no default orphan regression, provenance and deterministic goldens |
| OD-009 cleanup | protected-feature/topology corpus exists | component energy, neighborhood reassignment, named morphology, none | blinded preference improves; protected topology regression below declared threshold; remains off by default until proven |
| OD-010 background advanced | key/flood baseline measured | components, custom deterministic graph cut, constrained OpenCV build | material mask-quality gain, deterministic goldens, acceptable bundle/memory, license/build/security closure |
| OD-011 public size/SLO | representative desktop/mobile devices selected | 4/10/16MP benchmarks, deterministic work budgets, allocator/parser limits, and memory instrumentation | promote proposed values to approved budgets/release limits only where p95/cancellation/memory pass; graceful lower-device policy |
| OD-012 recipe/PNG encoding | canonical pixel schema stable | sidecar only vs compact PNG chunks; encoder choices | round-trip, byte identity where promised, metadata privacy, stable versioning |

## 21. Unresolved product questions and planning defaults

Reasonable defaults below let planning proceed; each can change only through a documented product decision.

| Question | Planning default | What would change it |
|---|---|---|
| Final name? | “Pixilate” marked working title everywhere | trademark/domain/user research and owner decision |
| What does Trim mean? | Any-visible alpha bounds (`α>0`), Tight `W×H` output | user evidence favoring another threshold; advanced threshold remains |
| Does background removal run automatically? | No; separate explicit stage | never changed without explicit user action |
| What does Auto do at low grid confidence? | Fall back to PRO-RASTER and explain | calibrated evidence for a better safe policy |
| Default dither/cleanup? | Both off | benchmark plus user study; versioned new profile only |
| Palette default? | `PreservePalette` for exact/native art; profile-selected maximum only when user asks or a named raster preset declares it | corpus-backed profile decision |
| Target fields and aspect? | Independent W/H with aspect lock optional; Contain default when aspect differs | usability testing |
| Alpha default? | `PreserveCoverage`, premultiplied linear filtering | profile-specific measured exception |
| Strict supported formats? | Candidates: PNG mandatory minimum; JPEG/WebP/BMP gated | OD-002 approved decoder/color/version matrix |
| Full ICC in T1? | Desired but gated; unsupported cases warn/reject under strict path | OD-002 result |
| Is Mixel stable in T1? | Experimental and opt-in/clearly labeled within Auto results | OD-005 exit |
| Margin restoration default? | Tight; restoration advanced | demonstrated dominant workflow need |
| Recipe source embedding? | No, hash/reference only | explicit portable-project feature with privacy controls |
| Browser-only forever? | Core is browser-local; shared CLI later is allowed from same engine | production pipeline demand; never a hidden server fallback |

## 22. Research traceability

### 22.1 Evidence keys

- **[OWNER]** Internal product authority from the initiating request, not a public evidence citation: exact target dimensions; Trim uses opaque/visible pixels versus full canvas; broad raster/mixel support; deterministic non-AI processing; separate resizing, quantization, and background features; customizable algorithms; MIT/open source; heavy competitor research. **2026-10-19 directives (§25):** a deterministic, fully client-side, JavaScript-only single-page application (Vite + Svelte, not SvelteKit); focus on the conversion algorithm and its tests rather than UI design; output at the exact user-requested size; detect the source generator where possible; crisp pixel art without mixels, orphan pixels, jaggies, or muddy anti-aliasing. Public claims require independent support from the other evidence keys.
- **[SYN]** `docs/research-spikes/SYNTHESIS.md` — reconciled cross-spike feasibility, locked decisions, benchmark-gated decisions, product gap, risks, and falsification conditions.
- **[BENCH]** `docs/research-spikes/evaluation/benchmark-methodology.md` — corpus governance, truth levels, metric semantics, statistical design, determinism/performance protocols, and claim-to-gate policy.
- **[ALG]** `docs/research-spikes/algorithms/state-of-the-art.md` — especially “Why a universal best algorithm is impossible,” “End-to-end deterministic processing model,” §§1–2, §§5–10, “Cross-browser determinism contract,” “Recommended profiles,” and “Benchmark and validation plan.”
- **[PXL]** `docs/research-spikes/products/pixellab.md` — public-source executive verdict, tool contracts, determinism assessment, public black-box test matrix, privacy/license boundary, and recommendation.
- **[SFS]** `docs/research-spikes/products/spritefusion-pixel-snapper.md` — “Executive verdict,” algorithm pipeline, target/Trim section, live tests, failure taxonomy, determinism, and design implications.
- **[UNF]** `docs/research-spikes/products/unfake-js.md` — “Executive verdict,” exact pipeline, detectors/reducers, alpha/cleanup, determinism, tests, advanced-control mapping, and avoid/redesign list.
- **[COM]** `docs/research-spikes/landscape/commercial-and-web-tools.md` — executive gap, inventory/mini-spikes, “Product gaps Pixilate should explicitly own,” licensing, benchmark, and planning implications.
- **[OSS]** `docs/research-spikes/landscape/open-source-ecosystem.md` — ecosystem result, verification dimensions, source audits, dependency/license findings, and reusable primitive assessment.

### 22.2 Major requirement trace matrix

| Requirement area | Source rationale |
|---|---|
| Exact W×H is authoritative (G-001, GEO-001–005, FR-003) | [OWNER]; [PXL] finds only partial target support and generative resizing; [SFS] Target dimensions; [UNF] exact-size gap/tests; [COM] exact-target gap; [ALG] §2.2 |
| Formal Trim/full-canvas behavior and restoration (TRIM-001–006, FR-004/020) | [OWNER]; [PXL] Input composition and Trim; [SFS] transparent-margin failure; [UNF] proposed U-10 and UI mapping; [COM] Trim ambiguity; [ALG] §2.1 |
| Separate but composable tabs (§7, FR-009/014/015) | [OWNER]; [PXL] workflow strengths; [COM] palette/background coupling gaps; [ALG] product implications |
| Profiles and honest support tiers (§6, §10) | [OWNER] widest support aspiration; [SFS] narrow implicit-grid scope; [UNF] input-class failures; [COM]/[ALG] no universal algorithm and route-by-class conclusions |
| Auto confidence, fallback, override (AUTO-001–008) | [SFS] no exposed confidence and non-target fallback behavior; [UNF] detector limitations/harmonics; [PXL] native-scale as diagnostic; [COM] grid-confidence risks; [ALG] §§5.2–5.5 |
| Canonical color/alpha (FMT-002–007, ALPHA-001–005) | [ALG] §1; [SFS] nonzero-alpha/hidden-RGB weaknesses; [UNF] alpha audit; [COM]/[OSS] alpha underspecification |
| Palette exactness and dither separation (§12.2–12.3) | [OWNER]; [PXL] Reduce Colors unknowns; [SFS] palette limitations; [UNF] hidden QVote/cap behavior; [ALG] §§7–8; [OSS] quantizer audits |
| Cleanup off/default formal rules (§12.4) | [OWNER] orphan/noise concern; [UNF] morphology/jaggy risk; [SFS] minority-detail loss; [COM] “Clean Orphans” gap; [ALG] §10 |
| Deterministic background tiers (§12.5) | [OWNER]; [PXL] remote nondeterministic removal; [UNF] absence/proposal; [COM] separate background gap; [ALG] §9; [OSS] magic-wand/GrabCut assessment |
| Versioned deterministic replay (§14, FR-012/013) | [OWNER]; [PXL] service/model unpinned; [SFS] floating/build caveats; [UNF] hash/decode/timestamp caveats; [ALG] §12; [COM] recipe gap |
| Local privacy/offline (§16.1, FR-021) | [OWNER] web/no-AI intent; [PXL] cloud contrast; [SFS]/[UNF] local worker findings and telemetry caveats; [ALG] initial stack/product implications |
| Strict format and limits (§8, §16.3–16.4) | [SFS] picker mismatch and unrealistic memory guard; [UNF] 10MP/memory analysis; [ALG] §1.1 and complexity; [OSS] browser/Wasm audits |
| MIT dependency closure (§16.5) | [OWNER]; [PXL] proprietary extension/server; [UNF] libimagequant GPL conflict; [SFS] reusable MIT core; [COM]/[OSS]/[ALG] license matrices |
| Benchmark-gated implementation (§18, §20) | [OWNER] “best algorithms possible”; [SYN] locked/gated split; [BENCH] §§13–19; [PXL]/[SFS]/[UNF] proposed matrices and missing corpora; [COM] competitive suite; [ALG] §15 |
| Accessibility and explainable preview (§15, §16.2) | [OWNER] web app scope; [COM] diagnostics/diff recommendation; [SFS]/[UNF] need for overlays and warnings; WCAG requirement is product policy |

## 23. Definition of product-ready planning

Planning may advance to **R0 research-harness authorization** when:

1. the owner accepts or amends normative Trim/target/aspect semantics, including the positive Contain-axis policy;
2. the domain-separated hash and noncircular recipe projections are accepted;
3. procedural Slice A fixture licensing, expected vectors, deterministic work budgets, and typed errors are documented;
4. Slice A begins from canonical in-memory RGBA and remains neutral on production codecs, engine language/Wasm, quantizer, Mixel/background algorithms, and UI;
5. every R0 requirement has an acceptance and phase owner in §24.

Planning may advance from the research harness to **R1 product implementation** only when:

1. the OD-002 approved strict codec/color support matrix is explicit;
2. corpus governance, metric applicability/empty cases, statistical analysis, and regression margins are approved;
3. each release-blocking open decision has an experiment owner, metric, decision record, and scheduled closure;
4. release claims use S1–S6 and T0–T3 without tier ambiguity;
5. no stable Mixel/default claim precedes its benchmark gate;
6. the selected architecture preserves one local deterministic engine and recipe schema;
7. measured resource limits and the MIT-owned/third-party distribution policy pass review.

## 24. Authoritative requirement, acceptance, phase, and scope crosswalk

This section is the normalized source of truth for ownership. Each shipped normative ID has a phase and acceptance route. `Direct` means a named acceptance criterion proves it; `indirect` means the criterion proves it together with a phase gate; `policy` is reviewed governance rather than pixel behavior; `deferred` is explicitly outside the T1 release. Phase numbers refer to the master plan and must be kept synchronized without slash shorthand.

`US-001–US-012` are rationale/user-story IDs, not independently shippable requirements. `NG-001–NG-009` are governance constraints reviewed in Phase 0 and at every release claim gate; they do not require separate executable acceptance unless a mapped normative requirement invokes them.

### 24.1 Goals, profiles, format, output, geometry, and Trim

| Normative ID | Acceptance | Phase | Scope / status |
|---|---|---:|---|
| G-001 | AC-GEO-001, AC-GEO-002 | 3 | T1 / direct |
| G-002 | AC-DET-001, AC-DET-002, AC-PRIV-001 | 2, 9 | T0→T1 / direct |
| G-003 | AC-PRO-001, AC-PRO-003, AC-PRO-004 | 4, 6, 7 | T0 research; T1 by profile |
| G-004 | AC-TRIM-001, AC-TRIM-002, AC-TRIM-003 | 3 | T1 / direct |
| G-005 | AC-PAL-001, AC-BG-002 | 5, 8, 10 | T1 independent; T2 composition |
| G-006 | AC-A11Y-001, AC-PRO-003 | 10 | T1 / indirect |
| G-007 | AC-PAL-001, AC-PAL-002 | 5 | T1 / direct |
| G-008 | AC-LIC-001 | 0, 1, 14 | release policy |
| G-009 | AC-CAN-001, AC-OFF-001, AC-PRIV-001, AC-SEC-001 | 9, 12 | T1 / direct |
| G-010 | AC-PRO-004 | 1, 7, 13 | T0 evidence / release policy |
| NG-001 | policy review | 0, 14 | all scopes / generative processing excluded |
| NG-002 | policy review | 0, 14 | all scopes / no semantic-understanding claim |
| NG-003 | policy review | 0, 14 | all scopes / no impossible detail guarantee |
| NG-004 | policy review | 0, 14 | T1 scope boundary; editor/suite features deferred |
| NG-005 | AC-CLEAN-001 plus policy review | 0, 10, 14 | all scopes / formal cleanup rule required |
| NG-006 | AC-LIC-001 plus policy review | 0, 14 | all scopes / no proprietary reproduction |
| NG-007 | AC-OFF-001, AC-PRIV-001 | 9, 14 | all scopes / server fallback excluded |
| NG-008 | AC-DET-001, AC-DET-002 | 2, 14 | all scopes / fixed seed alone is insufficient |
| NG-009 | AC-DET-003 | 11, 14 | all scopes / version-addressed replay policy |
| PRO-NOOP | AC-PRO-005 | 4 | T1 / direct |
| PRO-EXACT | AC-PRO-001, AC-PRO-002 | 4 | T1 / direct within identifiable/instructed scope |
| PRO-RASTER | AC-PRO-003 | 4, 6 | T1 / direct |
| PRO-MIXEL | AC-PRO-004 | 7 | T1 experimental; stable status gated |
| PRO-LINE | none yet | post-MVP | T2 experimental / deferred until new AC |
| PRO-BG | AC-BG-001, AC-BG-002 | 8 | T2 mask recipe; not Auto Resize |
| FMT-001 | AC-SEC-001 | 3, 12 | T1 approved matrix / indirect |
| FMT-002 | AC-GEO-002, AC-TRIM-001 | 3 | T1 / indirect |
| FMT-003 | AC-DET-002 | 3 | T1 approved matrix / indirect |
| FMT-004 | AC-DET-002, AC-SEC-001 | 3, 12 | OD-002 gated / indirect |
| FMT-005 | AC-ALPHA-001 | 3, 4 | T1 / indirect |
| FMT-006 | AC-ALPHA-001 | 3 | T1 / direct |
| FMT-007 | AC-DET-002, AC-DET-003 | 2, 11 | T1 / indirect |
| OUT-001 | AC-DET-003 | 11 | T1 / direct |
| OUT-002 | AC-A11Y-001 | 10 | T1 / indirect |
| OUT-003 | none | post-MVP | T2/T3 / deferred |
| OUT-004 | AC-DET-001, AC-DET-003 | 2, 11 | R0→T1 / direct |
| OUT-005 | AC-DET-003 | 11 | OD-012 gated / indirect |
| OUT-006 | AC-SEC-001 | 11, 12 | T1 / indirect |
| GEO-001 | AC-GEO-001 | 3 | R0→T1 / direct |
| GEO-002 | AC-GEO-001, AC-GEO-002 | 3 | T1 / direct |
| GEO-003 | AC-PRO-002 | 3, 4 | T1 / direct |
| GEO-004 | AC-GEO-002, AC-DET-003 | 3, 11 | T1 / direct |
| GEO-005 | AC-GEO-001, AC-A11Y-001 | 3, 10 | T1 / indirect |
| TRIM-001 | AC-TRIM-002 | 3 | R0→T1 / direct |
| TRIM-002 | AC-TRIM-001 | 3 | R0→T1 / direct |
| TRIM-003 | AC-TRIM-001 | 3 | T1 / indirect |
| TRIM-004 | AC-TRIM-003 | 3 | R0→T1 / direct |
| TRIM-005 | AC-A11Y-001 | 10 | T1 / indirect |
| TRIM-006 | AC-TRIM-001, AC-BG-002 | 3, 8 | T1/T2 / indirect |

### 24.2 Auto, alpha, palette, dither, cleanup, and background

| Normative ID | Acceptance | Phase | Scope / status |
|---|---|---:|---|
| AUTO-001 | AC-PRIV-001, AC-DET-001 | 6, 9 | T1 / indirect |
| AUTO-002 | AC-PRO-002, AC-PRO-003 | 6 | T1 / indirect |
| AUTO-003 | AC-PRO-003 | 6, 10 | T1 / direct |
| AUTO-004 | AC-GEO-001, AC-PRO-002 | 6 | T1 / direct |
| AUTO-005 | AC-PRO-001, AC-PRO-002 | 4, 6 | T1 / direct |
| AUTO-006 | AC-PRO-003 | 6 | T1 / direct |
| AUTO-007 | AC-CLEAN-001, AC-DITH-001 | 5, 10 | T1 safe-default gate / direct |
| AUTO-008 | AC-DET-003, AC-PRO-003 | 6, 11 | T1 / indirect |
| ALPHA-001 | AC-ALPHA-001 | 3, 4 | R0→T1 / direct |
| ALPHA-002 | AC-ALPHA-001 | 3 | T1 enum / direct |
| ALPHA-003 | AC-ALPHA-001 | 3, 5 | T1 / direct |
| ALPHA-004 | AC-PAL-001, AC-ALPHA-001 | 5 | T1 / indirect |
| ALPHA-005 | AC-ALPHA-001, AC-A11Y-001 | 10 | T1 / direct |
| PAL-001 | AC-PAL-001 | 5 | T1 / direct |
| PAL-002 | AC-PAL-002 | 5 | T1 / direct |
| PAL-003 | AC-PAL-001 | 5, 10 | T1 / indirect |
| PAL-004 | AC-PAL-002 | 5 | T2 locks / direct |
| PAL-005 | AC-PAL-002 | 5 | T1 import / direct |
| PAL-006 | AC-PAL-001, AC-PAL-002, AC-CLEAN-001 | 5 | T1 final validator / direct |
| PAL-007 | AC-DET-001, AC-PAL-002 | 5 | T1 / indirect |
| DITH-001 | AC-DITH-001 | 5 | T1 / direct |
| DITH-002 | AC-DITH-001, AC-PAL-001 | 5 | T1 / indirect |
| DITH-003 | AC-DITH-001, AC-DET-001 | 5 | T1 / direct |
| DITH-004 | AC-A11Y-001 | 10 | T1 / indirect |
| DITH-005 | AC-LIC-001 | 1, 14 | release policy |
| CLEAN-001 | AC-CLEAN-001 | post-MVP | T2 / deferred, default-off applies in T1 |
| CLEAN-002 | AC-CLEAN-001 | post-MVP | T2 / deferred to EX-011 phase |
| CLEAN-003 | AC-CLEAN-001, AC-A11Y-001 | post-MVP | T2 / deferred to EX-011 phase |
| CLEAN-004 | AC-CLEAN-001 | post-MVP | T2 / deferred to EX-011 phase |
| CLEAN-005 | AC-CLEAN-001, AC-PAL-001 | post-MVP | T2 / deferred to EX-011 phase |
| CLEAN-006 | AC-CLEAN-001 | post-MVP | T2 / deferred to EX-011 phase |
| BG-001 | AC-BG-001 | 8 | T2 exploratory/nonshipping before T1 cut |
| BG-002 | AC-BG-002 | 8 | T2 exploratory/nonshipping before T1 cut |
| BG-003 | AC-BG-001 | 8 | T2 exploratory/nonshipping before T1 cut |
| BG-004 | AC-BG-001 | 8 | T2 exploratory/nonshipping before T1 cut |
| BG-005 | AC-BG-002, AC-DET-002 | post-MVP | T3 conditional / deferred |
| BG-006 | AC-A11Y-001, AC-BG-002 | 8, 10 | T2 / direct when shipped |
| BG-007 | AC-ALPHA-001, AC-BG-002 | 8 | T2 gated / indirect |
| BG-008 | AC-BG-002, AC-TRIM-001 | 8 | T2 / direct |

### 24.3 Functional, determinism, and nonfunctional requirements

| Normative ID | Acceptance | Phase | Scope / status |
|---|---|---:|---|
| FR-001 | AC-SEC-001, AC-DET-002 | 3, 12 | T1 approved strict matrix |
| FR-002 | AC-A11Y-001 | 10 | T1 / direct |
| FR-003 | AC-GEO-001 | 3 | T1 / direct |
| FR-004 | AC-TRIM-001, AC-TRIM-002, AC-TRIM-003 | 3, 10 | T1 / direct |
| FR-005 | AC-GEO-002 | 3 | T1 / direct |
| FR-006 | AC-PRO-001, AC-PRO-003, AC-PRO-004, AC-PRO-005 | 4, 6, 7 | T1 by profile |
| FR-007 | AC-PRO-002, AC-PRO-003 | 6, 10 | T1 / direct |
| FR-008 | AC-A11Y-001, AC-ALPHA-001 | 10 | T1 / indirect |
| FR-009 | AC-GEO-001 | 5 | T1 / indirect |
| FR-010 | AC-PAL-001, AC-PAL-002 | 5 | T1 / direct |
| FR-011 | AC-ALPHA-001 | 3 | T1 / direct |
| FR-012 | AC-DET-003 | 11 | T1 / direct |
| FR-013 | AC-DET-003 | 11 | T1 / direct |
| FR-014 | AC-BG-001, AC-BG-002 | 8 | T2 / deferred from T1 cut |
| FR-015 | AC-BG-002, AC-TRIM-001 | 8, 10 | T2 / deferred from T1 cut |
| FR-016 | AC-PAL-002, AC-DITH-001 | 5, 10 | T2 locks/broader paths |
| FR-017 | AC-CLEAN-001 | post-MVP | T2 / deferred to EX-011 phase |
| FR-018 | AC-DET-003 | 10, 11 | T2 named recipes / deferred from T1 cut |
| FR-019 | none | post-MVP | T3 batch/animation / explicitly deferred |
| FR-020 | AC-TRIM-004 | 3, 10 | T2 restoration / deferred from T1 cut |
| FR-021 | AC-OFF-001, AC-PRIV-001 | 9 | T1 / direct |
| FR-022 | AC-CAN-001 | 9, 12 | T1 / direct |
| FR-023 | AC-PROV-001 | 3, 11 | T0 experimental, then T1 Should / direct (added 2026-10-19, `OWN-003`) |
| DET-001 | AC-DET-002 | 2, 9 | T0→T1 / direct |
| DET-002 | AC-DET-001 | 2 | R0→T1 / direct |
| DET-003 | AC-DET-001 | 2 | T0→T1 / direct |
| DET-004 | AC-DET-001, AC-DET-002 | 2 | T0→T1 / direct |
| DET-005 | AC-DET-001, AC-DET-002 | 2 | T0→T1 / direct |
| DET-006 | AC-DET-001 | 2 | T0→T1 / direct |
| DET-007 | AC-DET-002 | 2, 9 | R1/T1 / direct |
| DET-008 | AC-DET-003 | 11 | T1 / direct |
| NFR-PRIV-001 | AC-PRIV-001 | 9 | T1 / direct |
| NFR-PRIV-002 | AC-PRIV-001 | 9 | T1 / direct |
| NFR-PRIV-003 | AC-PRIV-001 | 9, 14 | T1 / indirect |
| NFR-PRIV-004 | AC-OFF-001 | 9 | T1 / direct |
| NFR-PRIV-005 | AC-PRIV-001 | 11 | T1 / indirect |
| NFR-A11Y-001 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-A11Y-002 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-A11Y-003 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-A11Y-004 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-A11Y-005 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-A11Y-006 | AC-A11Y-001 | 10, 12 | T1 / direct |
| NFR-PERF-001 | AC-CAN-001 plus OD-011 performance report | 12 | T1 / proposed until approved |
| NFR-PERF-002 | AC-CAN-001 | 9 | T1 / direct |
| NFR-PERF-003 | AC-CAN-001 | 9, 12 | T1 / proposed until approved |
| NFR-PERF-004 | AC-PRO-004 | 7, 12 | T1 experimental / direct |
| NFR-PERF-005 | AC-LIC-001 plus OD-001/002 report | 0, 12 | policy / proposed threshold |
| NFR-SEC-001 | AC-SEC-001, AC-SEC-002 | 1, 12 | T1 / direct |
| NFR-SEC-002 | AC-SEC-001 | 2, 12 | T1 / direct |
| NFR-SEC-003 | AC-PRIV-001, AC-SEC-001 | 9, 12 | T1 / indirect |
| NFR-SEC-004 | AC-DET-003, AC-SEC-001 | 11, 12 | T1 / indirect |
| NFR-SEC-005 | AC-LIC-001 | 12, 14 | release policy |
| NFR-SEC-006 | AC-SEC-001 | 11, 12 | T1 / direct |
| NFR-SEC-007 | AC-SEC-002 | 2, 12 | R0→T1 / direct |
| NFR-LIC-001 | AC-LIC-001 | 0, 14 | release policy |
| NFR-LIC-002 | AC-LIC-001 | 14 | release policy |
| NFR-LIC-003 | AC-LIC-001 | 0, 14 | release policy |
| NFR-LIC-004 | AC-LIC-001 | 0, 14 | release policy |
| NFR-LIC-005 | AC-LIC-001 | 0, 14 | release policy |
| NFR-LIC-006 | AC-LIC-001 plus qualified review | 0, 14 | release policy |
| NFR-LIC-007 | AC-LIC-001 | 0, 14 | release policy |

### 24.4 Reverse acceptance map

| Acceptance ID | Normative IDs proved |
|---|---|
| AC-GEO-001 | G-001, GEO-001–003, FR-003, FR-009 |
| AC-GEO-002 | GEO-002, GEO-004, FMT-002, FR-005 |
| AC-TRIM-001 | G-004, TRIM-002/003/006, FR-004, FR-015 |
| AC-TRIM-002 | TRIM-001, FR-004 |
| AC-TRIM-003 | TRIM-004, FR-004 |
| AC-TRIM-004 | FR-020 |
| AC-PRO-001 | G-003, PRO-EXACT, AUTO-005, FR-006 |
| AC-PRO-002 | PRO-EXACT, GEO-003, AUTO-002/004/005, FR-007 |
| AC-PRO-003 | G-003/G-006, PRO-RASTER, AUTO-002/003/006/008, FR-006/007 |
| AC-PRO-004 | G-003/G-010, PRO-MIXEL, FR-006, NFR-PERF-004 |
| AC-PRO-005 | PRO-NOOP, FR-006 |
| AC-PAL-001 | G-005/G-007, ALPHA-004, PAL-001/003/006, DITH-002, CLEAN-005, FR-010 |
| AC-PAL-002 | G-007, PAL-002/004/005/006/007, FR-010/016 |
| AC-ALPHA-001 | FMT-005/006, ALPHA-001–005, BG-007, FR-008/011 |
| AC-DITH-001 | AUTO-007, DITH-001–004, FR-016 |
| AC-CLEAN-001 | NG-005, AUTO-007, PAL-006, CLEAN-001–006, FR-017 |
| AC-BG-001 | PRO-BG, BG-001/003/004, FR-014 |
| AC-BG-002 | G-005, PRO-BG, BG-002/005–008, FR-014/015 |
| AC-DET-001 | G-002, NG-008, OUT-004, AUTO-001, PAL-007, DITH-003, DET-002–006 |
| AC-DET-002 | G-002, NG-008, FMT-003/004/007, DET-001/004/005/007, BG-005, FR-001 |
| AC-DET-003 | NG-009, OUT-001/004/005, GEO-004, AUTO-008, DET-008, FR-012/013/018, NFR-SEC-004 |
| AC-PRIV-001 | G-002/G-009, NG-007, AUTO-001, NFR-PRIV-001/002/003/005, NFR-SEC-003, FR-021 |
| AC-OFF-001 | G-009, NG-007, NFR-PRIV-004, FR-021 |
| AC-SEC-001 | G-009, FMT-001/004, OUT-006, NFR-SEC-001–006, FR-001 |
| AC-SEC-002 | NFR-SEC-001/007 |
| AC-CAN-001 | G-009, NFR-PERF-001–003, FR-022 |
| AC-A11Y-001 | G-006, OUT-002, TRIM-005, ALPHA-005, DITH-004, CLEAN-003, BG-006, FR-002/004/008, NFR-A11Y-001–006 |
| AC-LIC-001 | G-008, NG-006, DITH-005, NFR-PERF-005, NFR-SEC-005, NFR-LIC-001–007 |
| AC-PROV-001 | FR-023 |

Until those conditions are met, “best algorithm” remains a research question, not a product requirement. The invariant that can be planned immediately is exact geometry plus explicit, reproducible choices.

## 25. Owner decision log

These entries are the documented product decisions that §21 requires before a default changes. They record owner authority (`[OWNER]`), not research evidence: none of them produces an experiment result or satisfies an experiment's exit criteria. Superseded text elsewhere is kept and carries a dated note that points here.

### OWN-001 — Engine and application stack (2026-10-19)

- **Decision:** a deterministic, fully client-side, JavaScript-only single-page application built with Vite and Svelte (not SvelteKit). This closes `OD-001` by owner decision in favour of the documented constrained TypeScript/JavaScript alternative, implemented in JavaScript.
- **Rationale:** owner direction for the simplest web delivery and debugging path, the benefit already recorded for that alternative in master plan §4.2. **INFERRED, unmeasured:** JavaScript arithmetic is IEEE-754 double precision without fused contraction and `Math.sqrt` is correctly rounded, so cross-engine pixel identity is plausible when transcendental functions stay off decision paths.
- **Supersedes:** the Rust/Wasm leading hypothesis in master plan §2 and §4.1 and in the synthesis architecture hypothesis, and the open status of `OD-001` in §20. The Rust/Wasm text is retained as the record of the alternative. No comparative evidence was produced and `EX-001` was not run.
- **Remaining verification obligations:** the `OD-001` exit criteria (canonical hash conformance, performance and memory budget, small auditable bundle, MIT-compatible closure) now verify the selected engine; `DET-001`–`DET-008`, including the `DET-007` browser/architecture matrix and `AC-DET-002`, precede any strict-determinism claim; `NFR-PERF-005` applies to every dependency; product implementation still requires Gate B/R1.

### OWN-002 — Exploratory prototype authorization (2026-10-19)

- **Decision:** `prototype/` is an owner-requested exploratory JavaScript research prototype of the conversion algorithm and its test harness. It sits outside the Gate A/R0 Slice A and Gate B/R1 sequence.
- **Rationale:** owner direction to explore the conversion algorithm and its tests directly.
- **Supersedes:** for `prototype/` only, the master plan §16 statement that work remains documentation-only under `docs/`, and the matching scope statements in the research index and the repository agent guide.
- **Remaining verification obligations:** the prototype is neither Slice A nor a Gate B product and passes no gate. It does not satisfy the Gate A preconditions in master plan §15, closes no `OD-*` or `EX-*` item, and selects no production profile or default. Its results are exploratory evidence under the research evidence labels, and its committed tests use project-owned procedural fixtures only (benchmark methodology §3).

### OWN-003 — Source-generator detection as a provenance report (2026-10-19)

- **Decision:** add `FR-023` (§13) and `AC-PROV-001` (§17.4): a report-only provenance signal read from container metadata only, worded as “file metadata claims (signature not checked)”; prompts, workflow text, and usernames are never persisted in recipes, reports, or exports; watermark handling is masking-only (a declared or estimated region is excluded from analysis and recorded, never altered).
- **Rationale:** owner directive to detect the source generator where possible. A deterministic metadata reader is not a classifier, so it stays within `AUTO-001` and `NG-002`. Background: [input provenance signals](../research-spikes/algorithms/input-provenance-signals.md).
- **Supersedes:** nothing; it adds requirements.
- **Remaining verification obligations:** `AC-PROV-001`; the §16.1 privacy contract (no metadata text leaves the device); no authenticity claim while signatures are not checked; no watermark-removal behavior.
- **Note (2026-10-19):** `FR-023` now reads “container metadata, with published output dimensions as weak, advisory evidence only”, matching [input provenance signals §3](../research-spikes/algorithms/input-provenance-signals.md#3-dimension-evidence). A dimension match is never a declaration and never selects a profile, preset, or default. An estimated watermark region is a generic corner fraction applied only when the container declares a visible mark; no pixel test and no vendor geometry ([§4](../research-spikes/algorithms/input-provenance-signals.md#4-declared-visible-watermarks-masking-only)).

### OWN-004 — Crisp output through a named Clean profile (2026-10-19)

- **Decision:** crisp output (no mixels, orphan pixels, jaggies, or muddy anti-aliasing) is delivered through a named, versioned, user-visible profile, “Clean” (for example the cleanup preset `ai-sprite-crisp/1`), which the user selects and which reports changed pixels per rule. It is not an engine default: engine defaults keep cleanup off and background removal off.
- **Rationale:** meets the owner directive inside the existing contract. `AUTO-007` already allows destructive steps only through a named preset rule with a visible warning.
- **Supersedes:** nothing. `CLEAN-001`, `AUTO-007`, `AC-CLEAN-001`, and the §21 background and dither/cleanup defaults stand.
- **Remaining verification obligations:** each Clean rule is a formal serialized rule (`CLEAN-002`–`CLEAN-006`) with changed-pixel counts; `OD-009`/`EX-011` still gate promotion into any shipped profile; “Clean” is not a “pixel-perfect” claim under the benchmark claim gates.

### OWN-005 — Prototype alpha policy (2026-10-19)

- **Decision:** the prototype outputs binary alpha under the named policy `Binary(128)`, recorded in its report; `PreserveCoverage` is reported as unsupported in the prototype.
- **Rationale:** owner directive against muddy anti-aliasing; naming the policy keeps the binarization visible instead of implicit (`ALPHA-002`).
- **Supersedes:** nothing in the product contract. `FR-011`, `ALPHA-002`, and the §21 alpha default (`PreserveCoverage`) are unchanged; the prototype records a deviation, not a T1 conformance claim.
- **Remaining verification obligations:** changing the product alpha default needs its own dated decision with evidence; `AC-ALPHA-001` still applies to the product.

### OWN-006 — Exact requested size (2026-10-19)

- **Decision:** target `W×H` is always required. A detected native size is reported only as `suggestedSize` evidence and never becomes the target.
- **Rationale:** owner directive for the exact user-requested size; it reaffirms `G-001`, `GEO-001`, `GEO-003`, and `AUTO-004`.
- **Supersedes:** the prototype's earlier automatic target sizing; no requirement text here.
- **Remaining verification obligations:** `AC-GEO-001`; `GEO-002` applies if an interface copies `suggestedSize` into `W×H` (the derived value is shown before processing and recorded).

### OWN-007 — First designed MVP application (2026-10-20)

- **Decision:** build a first designed MVP application in `app/`: a Vite + Svelte single-page app (not SvelteKit), in JavaScript or TypeScript, themed with the GlassKit library (a requirement), following an Apple-like philosophy (easy, intuitive, minimal, for casual users), working on desktop and mobile at every resolution and orientation. It reuses the prototype engine and must keep its determinism and client-side guarantees (`OWN-001`).
- **Rationale:** owner direction to move from the research harness to a usable, tested product-quality interface.
- **Supersedes:** for `app/` only, the rule that implementation beyond the prototype needs separate approval (master plan §15–16) and `OWN-002`'s "not product work" scope. It closes no `OD-*` or `EX-*` and passes no gate.
- **Remaining verification obligations:** GlassKit licence and dependency review (`NFR-PERF-005`); interface requirements in this document (Trim preview, recorded recipe, explicit opt-in stages, `GEO-002` for a suggested size); design and usability testing across viewports; the `DET-*` obligations before any strict-determinism claim.
