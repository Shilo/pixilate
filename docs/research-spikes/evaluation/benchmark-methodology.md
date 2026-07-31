# Pixilate benchmark and evaluation methodology

**Project:** Pixilate (working name)  
**Document type:** research spike / validation plan  
**Status:** correction-complete planning methodology; Gate R0 may authorize only the dependency-clean research harness defined in §19; no benchmark artifacts have been created yet  
**Research date:** 2026-07-31  
**Scope:** deterministic raster resizing/pixelation, palette quantization, and deterministic background removal

## Executive decision

Pixilate cannot prove that one output is the uniquely “most accurate” pixel-art interpretation of every raster. That output often does not exist: a one-pixel highlight can be either important detail or noise, and a continuous illustration has no original low-resolution grid to recover. The benchmark must therefore separate three kinds of evidence:

1. **Hard conformance:** exact dimensions, Trim geometry, palette constraints, canonical alpha, bounded failure, and deterministic hashes. These are binary product contracts.
2. **Ground-truth recovery:** exact logical cells, grid boundaries, masks, topology, and palettes for mathematically generated or deliberately paired fixtures.
3. **Usefulness under ambiguity:** a vector of objective diagnostics plus blinded human judgments for AI mixels, illustrations, photos, and other sources with several valid outputs.

The release benchmark must not collapse these into a single “quality score.” A method can be excellent at exact-grid recovery and poor at photo abstraction; a clean, sparse result can intentionally score worse on high-resolution reconstruction error than a blurry one. Results must be reported by input stratum, task, target geometry, and profile.

The initial product claim should be narrower and stronger than “works perfectly on every image”:

> For every valid input admitted by the approved strict format/resource matrix, Pixilate either returns exact requested geometry and constraints or a stable deterministic algorithm-budget error. **Processing determinism** fixes canonical RGBA input; **end-to-end strict determinism** additionally fixes encoded input bytes and the pinned decoder/color path. User cancellation and host watchdog termination are operational outcomes, not canonical deterministic results. Quality profiles are validated separately on the source conditions they claim to support.

This methodology extends the benchmark outline in the [algorithm landscape spike](../algorithms/state-of-the-art.md) and incorporates the concrete failure cases in the [PixelLab](../products/pixellab.md), [SpriteFusion Pixel Snapper](../products/spritefusion-pixel-snapper.md), and [Unfaker](../products/unfake-js.md) audits.

## 1. Claims, tasks, and terms

### 1.1 Evaluate tasks independently

| Task ID | Task | Required input to the evaluator | Required output | What is not implied |
|---|---|---|---|---|
| `resize` | Resize/pixelate to an explicit logical size | source, target `W×H`, sizing basis, fit policy, profile | exactly `W×H` canonical RGBA | palette reduction or background removal |
| `recover-grid` | Recover a latent logical grid | source and optional period/phase hints | grid/cell model and logical raster | arbitrary target-size support |
| `quantize` | Limit or replace palette | source, count or supplied palette, alpha/dither policy | same geometry unless explicitly chained | spatial resizing |
| `background` | Produce/remove a deterministic background mask | source, seeds/key/tolerance/connectivity policy | mask or changed alpha at unchanged geometry | semantic automatic subject recognition |
| `pipeline` | Run an explicit composition of tasks | complete ordered recipe | final output plus stage metadata | permission for a stage to change another stage’s contract |

Competitors are evaluated only on tasks they expose. “Unsupported” is a capability result, not a zero-quality output. In particular, SpriteFusion and Unfaker discover dimensions rather than accepting an exact target; their grid recovery can be evaluated fairly in `recover-grid`, but they cannot pass Pixilate’s `resize` conformance gate. PixelLab’s different tools must be treated as different systems because Unzoom, Resize, standard Image-to-Pixel-Art, Pro, Reduce Colors, and Remove Background expose materially different contracts.

### 1.2 Operational definitions

- **Canonical input:** oriented, color-normalized, decoded RGBA samples plus width and height produced by the pinned strict decoder policy.
- **Target:** the exact output raster dimensions `(W,H)`, not an approximate scale or desired source-pixel size.
- **Trim:** select the smallest source rectangle containing samples with `alpha > tau`, after orientation and any explicitly prior background stage. `tau` is part of the recipe. Trim does not mean background inference.
- **Logical cell:** one intended target sample and its source footprint or recovered source region.
- **True pixel art:** native logical pixels or exact integer/nonuniform replication of them. Adjacent equal logical pixels can make the original lattice unidentifiable from raster samples alone.
- **Mixel / fake-pixel art:** raster that visually suggests pixel cells but does not obey one clean global grid.
- **Palette size:** number of distinct canonical output colors under an explicit counting policy. The benchmark reports opaque RGB count, nonzero-alpha RGBA count, and total RGBA count separately.
- **Processing determinism:** identity of canonical output pixels and required semantic metadata for fixed canonical RGBA input, processing recipe, and engine build.
- **End-to-end strict determinism:** processing determinism plus fixed encoded input bytes and pinned decoder/color path. Byte-identical encoded PNG is a stronger, separate encoder claim.
- **Operational interruption:** cancellation, worker/process loss, or a host watchdog timeout is recorded outside canonical result identity. Deterministic strict failure uses input-derived work limits, not elapsed time.
- **No-op:** exact preservation of canonical RGBA and geometry; preserving only visual appearance is not a no-op.

### 1.3 Candidate versus approved codec/color matrix

PNG, JPEG, WebP, and BMP are **candidates**, not automatically strict formats. PNG is the minimum mandatory T1 candidate. Each evaluated tuple records format, decoder/version/features, orientation behavior, accepted color/profile metadata, invalid-metadata response, frame policy, deterministic work limits, security/fuzz result, license/patent review, and cross-runtime canonical hashes. `OD-002` promotes only passing tuples to the versioned **approved strict matrix**. Failed candidates are `DEFERRED`, `REJECTED`, or S6 `COMPATIBILITY`; benchmark reports never infer strict coverage from a file picker or decoder library’s general format list.

## 2. Benchmark principles

1. **Conformance before aesthetics.** A beautiful 33×31 result fails a requested 32×32 contract.
2. **Target-first comparisons.** If a method cannot accept a target, do not resize its discovered result afterward and present that as native target support. A clearly labeled adapter experiment may be reported separately.
3. **Alpha-aware evaluation.** Hidden RGB, premultiplication, compositing, and partial coverage are part of correctness. PNG uses unassociated alpha, and conversion from premultiplied samples requires special handling at alpha zero ([PNG Third Edition](https://www.w3.org/TR/png-3/)).
4. **No universal scalar.** Preserve metric vectors and Pareto trade-offs. Any composite score is profile-specific, preregistered, and secondary.
5. **Stratify by source condition.** Never average exact grid, mixel, line-art, and photo cases into one headline number.
6. **Cluster by progenitor.** Corrupted variants of one sprite are not independent observations. Splits and confidence intervals operate on source families, not individual derivatives.
7. **Pin everything observable.** Input hash, fixture generator version, recipe, code revision, dependency lock, browser/runtime, OS, CPU, threads, and output hash belong in the result.
8. **Preserve failures.** Rejections, crashes, deterministic algorithm-budget errors, host watchdog timeouts, unsupported controls, and remote service errors are results, not rows to omit; canonical failures and operational interruptions remain separately typed.
9. **License the corpus, not merely its manifest.** A GitHub repository license does not automatically license every artwork, font, photograph, model output, or trademark in it.
10. **Keep the held-out decision honest.** Explore on the development split, select on validation, and run the frozen release test only after profiles and thresholds are fixed.

## 3. Corpus governance and legal use

This is an engineering policy, not legal advice. Any uncertain asset or algorithm license requires a qualified review before redistribution or product adoption.

### 3.1 Accepted corpus sources

The redistributable benchmark should use, in order of preference:

1. **Procedural fixtures authored by this project.** Generator source is MIT; emitted fixture images, annotations, and manifests should be dedicated under CC0-1.0.
2. **Commissioned original assets.** The contract must state that the artist owns the work, has not incorporated third-party assets, and dedicates the source, targets, annotations, and derivatives under CC0-1.0, or uses separately specified public terms when a CC0 dedication is not suitable. Pay separately for benchmark rights; keep signed provenance outside the public repository if it contains personal data.
3. **Assets explicitly dedicated by the rightsholder under CC0-1.0.** Capture the asset page, exact file hash, author/rightsholder, license text/URL, and retrieval date.
4. **Works reliably marked worldwide public domain.** Require a provenance review rather than assuming age, “free,” government origin, or a Public Domain Mark is conclusive in every jurisdiction. Creative Commons distinguishes a rightsholder’s CC0 dedication from the informational Public Domain Mark and warns that public-domain status can vary by jurisdiction ([CC public-domain guidance](https://creativecommons.org/public-domain/)).

CC0 is preferred because it is designed to waive copyright and related rights as fully as possible, with a public-license fallback, but it does not eliminate privacy, publicity, trademark, patent, or third-party rights ([CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)). Therefore:

- exclude recognizable private people unless releases cover this use;
- exclude unlicensed trademarks, famous characters, proprietary game sprites, and copied style sheets;
- exclude fonts unless the exact font license permits redistribution and raster derivatives in the corpus;
- do not infer a license from search filters, README prose, or the ability to download;
- do not scrape or redistribute competitor examples unless the terms and asset license permit it;
- preserve attribution voluntarily even for CC0 when known, but do not make missing attribution break machine use;
- assign a per-file SPDX expression and provenance record. The REUSE specification is a useful model for unambiguous, machine-readable per-file licensing ([REUSE 3.3](https://reuse.software/spec/)).

### 3.2 AI-generated inputs

AI-mixel coverage is important, but service terms, user rights, retention policies, and output restrictions change. Do not assume that “the user generated it” grants a redistributable benchmark license.

An AI output may enter the public corpus only when all of the following are recorded and approved:

- service/model name and version or date;
- account tier and governing terms snapshot;
- complete prompt and input-image provenance;
- confirmation that every input image was corpus-safe;
- uploader’s representation that they may dedicate the output/annotations under CC0;
- model/output restrictions and any required provenance labels;
- a perceptual-duplicate check against other corpus assets;
- no recognizable person, trademark, or protected character.

If any condition is uncertain, keep only a nonredistributable local evaluation reference outside the public repository, store no pixels in benchmark reports, and never make it required for reproducible CI. Prefer commissioned artists to create “AI-like mixels” manually and procedurally transformed CC0 sprites for the permanent corpus. Synthetic corruption cannot fully represent generator behavior, so release qualification should contain both procedural and rights-cleared real examples.

### 3.3 Asset manifest

Every base asset and generated derivative needs:

```text
asset_id, family_id, derivative_of, split, primary_stratum, secondary_tags
source_uri, retrieval_utc, source_sha256, canonical_rgba_sha256
creator_or_generator, creation_method, generator_version, generator_seed
copyright_holder, license_spdx, license_uri, license_evidence_uri_or_record
third_party_content_review, privacy_publicity_review, trademark_review
allowed_uses, redistribution_allowed, modification_allowed
width, height, format, color_profile, orientation, alpha_characteristics
ground_truth_type, annotation_version, reviewer, review_date, notes
```

Keep a datasheet describing motivation, composition, collection, preprocessing, recommended uses, and limitations; the structure follows the transparency goal of [Datasheets for Datasets](https://www.microsoft.com/en-us/research/publication/datasheets-for-datasets/). Removing an asset for rights or privacy reasons increments the corpus version and records a tombstone so old report IDs remain interpretable.

## 4. Input strata

Each asset has one primary stratum for balanced reporting and any number of secondary tags. Do not double-count one asset in macro averages.

| ID | Primary stratum | Required variation | Principal questions |
|---|---|---|---|
| `G` | Exact integer-grid pixel art | 1–64 colors; scales 2–16; X/Y equal and unequal; phase/padding; native 1×; transparent and opaque | Can the exact profile recover cells, palette, alpha, period, and phase without inventing edits? |
| `I` | Upscaled/interpolated pixel art | nearest, box, triangle, bicubic/Catmull, Mitchell, Lanczos, blur, sharpen, JPEG/WebP artifacts, fractional scale | How robust is recovery after known nonideal resampling and compression? |
| `M` | Irregular AI mixels/fake-pixel art | locally varying cell sizes, drifting phase, pseudo-outlines, glow, texture, noisy near-colors, mixed resolutions | Does a mixel profile produce useful exact-target art without pretending a unique truth? |
| `H` | Continuous HD character illustration | flat/cel shaded, painterly, textured, multiple subjects, simple/complex silhouette | How well does target abstraction retain identity, silhouette, and important details? |
| `L` | Line art | 1–8 source-pixel strokes, curves, intersections, open/closed loops, light/dark lines, antialiasing | Are line continuity, junctions, holes, and stroke hierarchy retained? |
| `P` | Gradients and photographs | ramps, radial gradients, skin/foliage/fabric, high/low frequency, high dynamic range mapped to SDR | Do resize and quantize avoid banding, aliasing, halos, and meaningless grid claims? |
| `A` | Transparency/alpha torture | hidden RGB at alpha zero, partial-alpha outlines, matte contamination, shadows/glow, indexed transparency, all-transparent | Are filtering, Trim, palette counting, canonicalization, and compositing correct? |
| `S` | Spritesheets/tilemaps | gutters, edge-to-edge cells, unequal frame content, multiple scales, animation, isometric tiles | Does whole-sheet processing leak across cells or create frame-to-frame geometry/palette jitter? |
| `T` | Tiny/thin critical features | eyes, highlights, antennae, one-cell diagonals, limbs, gaps, one-cell holes, single-pixel particles | Which features survive, move, merge, or become false “orphans”? |
| `O` | Outlines and silhouette styles | one/two-color outlines, selective outlines, colored outlines, broken contours, internal outlines | Are outline continuity, thickness, corners, and subject separation retained? |
| `U` | UI icons and glyph-like graphics | 8–64 px targets, symmetry, crisp axes, badges, notification dots, monochrome/multicolor | Are alignment, symmetry, stroke weight, negative space, and readability retained? |
| `B` | Background-removal cases | flat, gradient, compressed, textured; shared foreground color; holes; subject touches border; shadows; multiple seeds | Does the declared deterministic mask operation do exactly what its topology/tolerance policy says? |
| `F` | Format/color metadata | PNG variants, JPEG/WebP/GIF/BMP as supported; ICC, sRGB/gAMA/cICP conflicts, EXIF orientations, animation policy | Are decode, orientation, color, frame selection, and rejection canonical and documented? |
| `X` | Hostile/corrupt/huge inputs | truncation, bad lengths/chunks, absurd dimensions, many frames, metadata bombs, near-limit allocations, wrong MIME/extension | Does processing reject safely, quickly, and consistently without unbounded allocation or stale output? |

Cross-cut every aesthetic stratum with light/dark palette, low/high contrast, centered/off-center subject, small/large transparent margins, square/non-square canvas, and target sizes both compatible and incompatible with source aspect/grid.

## 5. Mathematical synthetic fixtures

Synthetic fixtures must be generated from a versioned declarative specification. The generator emits source pixels, target truth, masks, palette, logical cell IDs, protected-feature masks, region labels, grid boundaries, and transformation provenance. Use integer/rational arithmetic where practical; any floating operation specifies precision, rounding, and reference test vectors.

### 5.1 Exact grid family

Let logical art be `P(i,j) ∈ RGBA8` for `0 ≤ i < w`, `0 ≤ j < h`. Let monotone integer boundaries be:

```text
b[0] = x0, b[w] = x0 + sourceContentWidth
c[0] = y0, c[h] = y0 + sourceContentHeight
```

For uniform integer scale, `b[i]=x0+i*sx` and `c[j]=y0+j*sy`. For deterministic nonuniform replication, distribute a rational scale `r=n/d` with an error accumulator:

```text
b[i] = x0 + floor((i*n + phaseNumerator) / d)
```

and analogously for `c`. Inside each half-open cell `[b[i],b[i+1]) × [c[j],c[j+1])`, assign exactly `P(i,j)`. Padding has an explicit RGBA value. Fixtures vary `sx≠sy`, offsets, incomplete border cells, native `s=1`, constant fields, harmonics such as checkerboards/stripes, and isoluminant palette boundaries.

Fixture truth records the authored logical raster, boundaries, content offset, palette order, alpha, and the complete set of constant-block factorizations observable in the rendered pixels. A detector can prove a **valid factorization**, but cannot infer an invisible boundary between equal adjacent logical pixels. Exact original-grid recovery is scored only when the lattice is instructed by user/metadata or uniquely identifiable under declared preconditions. Constant fields, equal-adjacent cells, nested blocks, and harmonic patterns are ambiguity fixtures: a compliant result enumerates valid candidates and refuses false authority rather than choosing the coarsest factor as truth.

### 5.2 Interpolated and compressed derivatives

Starting from exact-grid source `E`, create derivatives with a declared transform chain:

```text
D = EncodeDecode_q( ClampRGBA8( K( Warp(E) ) + Noise_seed ) )
```

- `Warp` applies rational scale, subpixel translation, optional small rotation/skew, and separately bounded X/Y phase drift.
- `K` is a pinned nearest, box/area, triangle, cubic, Mitchell-Netravali, Gaussian, or Lanczos kernel operating in either deliberately correct linear-premultiplied space or a tagged legacy gamma/straight-alpha path.
- `Noise_seed` includes bounded channel jitter, salt/pepper contamination, and palette-neighbor replacement from a fixed PRNG and seed.
- `EncodeDecode_q` uses a pinned codec/version and quality/subsampling parameters.

The original `P` remains categorical truth, while the transform metadata supplies expected source-space boundaries. Corruption sweeps use increasing severity so the report shows a failure curve rather than one cherry-picked threshold.

### 5.3 Procedural mixel family

Mixel fixtures deliberately weaken exact truth without losing known semantics. Begin with a logical label map `R(i,j)` and boundaries:

```text
b[i] = round(i*s + A*sin(2*pi*i/T + phi) + Jx[i])
c[j] = round(j*s + B*sin(2*pi*j/U + psi) + Jy[j])
```

where seeded `Jx/Jy` are bounded and boundaries are projected to a strictly increasing sequence. Then apply some of:

- local boundary displacement in selected regions;
- different nominal scales for subject, outline, and background texture;
- signed-distance antialiasing of region boundaries;
- Oklab-bounded palette jitter and within-cell gradients;
- small edge highlights, glow, texture strokes, and false cell boundaries;
- blur/sharpen/compression and noninteger resize;
- rotated/skewed subregions.

Truth includes semantic region masks, protected features, topology, an intended target size, and the clean progenitor, but not one mandatory output pixel for ambiguous cells. Evaluation uses the multiple-valid-output policy in section 7.

### 5.4 Continuous shapes, line art, gradients, and photos

Render analytic vector scenes at high supersampling and downsample once with a pinned reference integrator. Scene primitives include rectangles, circles, ellipses, polygons, cubic Béziers, strokes with cap/join variants, holes, nested components, symmetry pairs, and occlusion. Color fields include constant fills, linear/radial gradients, controlled-frequency sinusoids, and deterministic texture. Store exact vector geometry and semantic feature masks.

Line width must sweep from `<0.5` to `>4` target cells after mapping. Include pairs whose source geometry differs only in subpixel phase. For photographs, use CC0/commissioned sources and author masks for a small set of semantically important features; no synthetic “ground truth pixel art” is claimed.

### 5.5 Alpha and matte family

For a foreground color `Cf`, background/matte `Cb`, and coverage `a`, construct straight RGBA truth and a contaminated visible color:

```text
Ccomposite = a*Cf + (1-a)*Cb
```

Generate variants stored as correct straight alpha, premultiplied-like malformed values, and matte-contaminated straight values. At `a=0`, fill RGB with zero, white, checkerboard, random seeded bytes, or a copy of nearby foreground. These images must be visually identical when composited correctly but must not influence Trim, grid evidence, palette count, or filtered edges through hidden RGB.

Alpha masks cover exact 0/255, ramps, one-sample fringes, shadows, holes, and an all-zero image. Composite-reference images are generated over black, white, 50% gray, saturated colors, and checkerboard.

### 5.6 Spritesheets and temporal fixtures

Compose independently annotated cells into sheets with gutters of `0,1,2,8` samples; shared and per-sprite palettes; aligned and conflicting grid phases; uniform and mixed source scales. Provide both whole-sheet and per-cell truth. Animation sequences keep stable identity while moving one-cell features, changing alpha-visible bounds under the serialized threshold, or exposing different palette colors. Measure frame geometry, phase, palette assignment, and centroid jitter.

### 5.7 Hostile fixtures

Generate malformed files from owned minimal fixtures: truncated headers/data, invalid chunk order/length/CRC, integer-overflow dimensions, excessive metadata/profile size, many tiny frames, enormous decoded-to-encoded ratio, unsupported bit depths/modes, mismatched extension/MIME/magic, and valid images immediately below/at/above each resource limit. Never commit a dangerous general-purpose bomb; use bounded test cases with declared maximum expansion and run them in an isolated harness. File-upload guidance explicitly calls for post-decompression limits and hardened parsing ([OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)).

The limit matrix is per parser and aggregate, not only headline megapixels: encoded bytes; decompressed image/profile/metadata bytes; chunk/frame/palette counts; JSON bytes/depth/keys/string lengths; checked dimensions/strides; simultaneous JS and Wasm buffers; candidate/iteration/queue/graph caps; and allocator high-water marks. A Worker is a responsiveness/concurrency boundary, not a separate security origin. Tests also cover service-worker/update integrity policy, same-origin release assets, object-URL cleanup, and cross-origin-isolation/header consequences if threads are enabled.

## 6. Corpus tiers and data splits

### 6.1 Provisional primary-stratum counts

All counts in this table are `PROVISIONAL-PILOT`. They are workload-planning targets, not statistical justification. The human pilot and source-family variance analysis may change them through a recorded corpus-version decision before release qualification.

| Stratum | Fast CI | Release qualification | Research sweep |
|---|---:|---:|---:|
| G exact grid | 8 | 48 | 120 |
| I interpolated grid | 6 | 36 | 120 |
| M mixel | 6 | 72 | 320 |
| H HD illustration | 4 | 48 | 180 |
| L line art | 4 | 36 | 100 |
| P gradient/photo | 4 | 36 | 140 |
| A alpha torture | 6 | 36 | 100 |
| S spritesheets | 4 | 24 | 80 |
| T tiny/thin | 4 | 36 | 100 |
| O outlines | 4 | 24 | 80 |
| U UI icons | 4 | 24 | 80 |
| B background | 4 | 36 | 100 |
| F format/color | 2 | 12 | 40 |
| X hostile/huge | 4 | 12 | 40 |
| **Total base cases** | **64** | **480** | **1,600** |

“Base case” means one statistically clustered progenitor. Target, palette, corruption, and settings variants expand this into many jobs but do not increase the independent sample count.

### 6.2 Tier purpose

- **Fast CI:** deterministic generated/CC0 fixtures only; one canonical strict configuration plus focused boundary cases; target under two minutes for native core tests and under ten minutes for the browser subset on reference CI hardware. It blocks every change on hard invariants.
- **Release qualification:** all supported tasks and profiles, the full cross-runtime determinism subset, performance sizes, competitor snapshots when available, and blinded review for changed visual defaults. It is frozen for a release candidate.
- **Research sweep:** broad parameter screening, ablations, failure curves, isolated research oracles not approved for the current production bundle, and new source families. It informs decisions but cannot itself certify a release.

Split base families approximately 60% development, 20% validation, and 20% release test. All derivatives, adjacent animation frames, prompt variants, one artist’s series, and near-duplicates remain in one split. Because the project is open source, secrecy is not a reliable defense against overfitting: timestamp and hash the frozen split before a decision, report how often it was inspected, use leave-one-artist/source-family-out analysis, and refresh only under the golden update policy.

## 7. Ground truth and multiple valid outputs

### 7.1 Truth levels

| Level | Applicable cases | Allowed assertions |
|---|---|---|
| `exact` | identity, instructed/uniquely identifiable grid, known masks/palettes, format conformance | pixel equality, exact boundaries where identifiable/instructed, exact palette/alpha/topology |
| `factorization-set` | procedural grids with equal-adjacent, constant, nested, or harmonic ambiguity | completeness of valid factors, no invalid factors, calibrated ambiguity/refusal; authored lattice is retained for provenance but is not observable truth |
| `paired-reference` | commissioned source plus one or more artist-made target sprites/masks | distance to each reference; reference agreement; protected-feature survival |
| `constraint-only` | analytic continuous scenes and controlled mixels | dimensions, masks/features, topology bounds, palette/alpha constraints; no unique pixel truth |
| `multi-reference` | ambiguous art with at least three independent acceptable targets or masks | distance to nearest/all references, coverage of acceptable region, human preference |
| `no-reference` | real mixels/photos without authored targets | conformance, diagnostics, blind judgments only |

Never designate a Pixilate version, competitor output, nearest resize, or researcher’s favorite as “ground truth” merely because it is convenient.

### 7.2 Multiple-valid-output protocol

For ambiguous base assets, commission at least three qualified pixel artists independently. Give them the same source, target dimensions, palette budget, alpha/background policy, and intended use, but do not show algorithm outputs. Record time spent and any interpretation notes. The reference set is descriptive, not exhaustive.

Report:

- metric distance from a candidate to every reference;
- nearest-reference distance, median-reference distance, and spread among references;
- whether hard constraints and protected semantic features are satisfied;
- blind preference/acceptability against references and baselines.

If references disagree on topology, feature presence, or palette family, mark that element ambiguous and remove it from binary ground-truth scoring. For background masks, use multiple annotations and an explicit “uncertain” band; score definite foreground/background separately and report boundary disagreement. Do not majority-vote away legitimate interpretations.

## 8. Test axes

### 8.1 Target geometry and Trim

| Axis | Required levels |
|---|---|
| Target | identity; exact logical truth; 1×1; 1×N/N×1 if supported; tiny 8–16 px; common 16/24/32/48/64; coprime/nondivisible ratios; non-square; one dimension larger while other shrinks; documented maximum; extreme-aspect cases whose Contain minor axis rounds below one before the normative clamp |
| Aspect | exact same aspect; slight mismatch; severe mismatch |
| Fit | stretch; contain+pad; cover+crop; grid-safe crop/pad/distribution; explicit refusal where profile forbids distortion |
| Anchor | 9-point anchors; odd remainders; custom offset if supported |
| Trim | off; `alpha>0`; `alpha>127`; `alpha=255` expressed as threshold; numeric boundary equality; padded trim; empty visible set |
| Canvas content | tight; asymmetric transparent margins; hidden RGB only; subject touches one/all borders; multiple disjoint subjects |
| Stage order | Trim before resize; background then Trim then resize; quantize independent; invalid order rejected |

Assertions include exact output `W,H`; recorded oriented canvas, ROI, threshold, rational fit scale, positive clamped Contain intermediate dimensions, crop/pad rectangles, and anchor remainders; same Trim ROI for images differing only in alpha-zero RGB; and a stable named result for an empty visible set.

### 8.2 Palette and quantization

Test requested caps `1,2,3,4,8,16,24,32,64,128,256` where supported; source counts below/equal/above cap; exact supplied palettes with duplicates and alpha variants; locked colors; transparent reservation; palette order changes; source colors equidistant from two entries; empty clusters; grayscale and isoluminant colors; no dither, ordered dither, and fixed error diffusion; quantize-before/after-resize as separate recipes.

Required semantics:

- distinguish “at most K” from “exactly K when possible”;
- count colors after every color-producing stage;
- run the mandatory final palette/alpha contract validator after dither, cleanup, and matte repair; record whether it proved, corrected through a named remap, or rejected the result;
- supplied palette means zero forbidden opaque RGB values unless the recipe says colors are advisory;
- deterministic ties use a documented order;
- transparency is not silently counted as an RGB palette slot;
- impossible requests produce a clear result, not hidden clamping.

### 8.3 Background removal

Test exact key versus perceptual tolerance; compare RGB versus RGBA; all-match versus border-connected; 4- versus 8-connectivity; one/multiple explicit seeds; inclusive threshold boundary; subject sharing background color; foreground touching border; enclosed background holes; disconnected shadows; compression fringes; gradient/texture; partial alpha; matte decontamination on/off; “remove islands/fill holes” thresholds; no matching pixels; and all matching pixels.

Background operations are scored as masks at original geometry before any resize. Resized mask quality is a separate pipeline test.

### 8.4 Alpha-policy enum

Test exactly `PreserveCoverage`, `Binary(threshold)`, and `Matte(color, removalPolicy)`. Record spatial alpha aggregation separately. Cover threshold equality, alpha 0/1/127/128/254/255, hidden RGB, partial-alpha palette entries, matte decontamination, and compositing over every required background. Unknown enum strings fail schema validation rather than aliasing another policy.

## 9. Algorithm and settings matrix

Do not run an uncontrolled full Cartesian product. Use three stages:

1. **Screening:** fractional-factorial or bounded Latin-hypercube-like coverage of numeric parameters on the development split.
2. **Ablation:** change one stage from a fixed candidate profile to attribute gains and failures.
3. **Finalist comparison:** complete target/stratum matrix on validation, then one frozen run on release test.

Blocking and within-block randomization reduce nuisance effects; NIST summarizes the principle as controlling important nuisance factors through blocks and randomizing remaining run order ([NIST randomized block designs](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm)).

| Stage | Baselines/candidates | Required settings coverage |
|---|---|---|
| Decode/color | candidate decoder/color tuples; approved strict-matrix entries; browser-native S6 diagnostic | format, orientation, profile precedence, invalid metadata, frame policy; a candidate receives no strict claim before OD-002 approval |
| Sizing basis | canvas; Trim threshold | thresholds, empty ROI, padding |
| Geometry | stretch; contain; cover; grid-safe | anchor, rounding, boundary extension |
| Conventional resize | nearest; exact area/box; triangle; Catmull-Rom; Mitchell; Lanczos3; Gaussian prefilter | linear vs gamma diagnostic; premultiplied vs straight diagnostic; kernel support |
| Grid detection | exact factorization-set enumeration; instructed/unique recovery; runs/GCD; edge periodicity; autocorrelation; global ensemble; target-constrained irregular boundaries | X/Y independent, phase, confidence, equal-adjacent/invisible boundaries, harmonics, manual hint, ambiguity/refusal |
| Cell representative | center; coverage mean; exact mode; perceptual-binned mode; vector medoid; median; edge-aware vote | alpha weighting, tie rule, rare-feature protection |
| Quantizer | median cut; octree; Wu; deterministic Wu+Lloyd/Oklab; permissive library candidates | K, seed/init, iterations, empty cluster, weights, final cap |
| Dither | none; Bayer; fixed licensed blue-noise asset; fixed-point Floyd–Steinberg/Sierra/Atkinson candidates | phase, strength, scan direction, alpha boundaries |
| Cleanup | none; component relabel; conservative majority; morphology; topology-guarded alternatives | connectivity, area, protected masks, iteration count |
| Background | exact key; tolerance key; border flood; component policy; optional seeded graph cut research | metric, tolerance, connectivity, seeds, matte policy |

Each Pixilate profile has a single canonical default recipe evaluated untouched. “Best per image” may be reported only as a clearly labeled oracle upper bound and never as normal product performance. Manual/expert tuning gets a fixed time or action budget and is reported separately from defaults.

## 10. Objective metrics

Every metric declares direction, range, units, masks, color space, alignment, empty-set behavior, and applicability. Inapplicable metrics are `null` with a reason, never zero.

### 10.1 Conformance

- **Dimension error:** `|wout-W| + |hout-H|`; release requirement is exactly zero.
- **ROI error:** coordinate-wise difference between observed and declared Trim ROI; exact on synthetic/alpha fixtures.
- **Palette overflow:** `max(0, distinctCount-K)` under each declared count policy.
- **Forbidden palette mass:** alpha-weighted fraction of output samples whose RGB is not in a supplied exact palette.
- **Locked-color retention:** exact presence and assignment of locked colors at annotated regions.
- **No-op mismatch:** count and maximum channel difference against canonical input.
- **Unexpected fallback:** output stage trace differs from recipe without a typed, documented fallback result.
- **Failure correctness:** typed error code, bounded elapsed time/memory, no partial download or stale previous result.

### 10.2 Grid and cell geometry

On synthetic truth with boundaries `b,c` and estimate `b',c'`, report:

- logical width/height error;
- period error and phase error independently for X/Y;
- boundary mean absolute error, RMSE, p95, and maximum in source samples and normalized by true median cell size;
- exact-boundary rate and cell intersection-over-union;
- missed, extra, and reordered boundaries;
- confidence calibration: accuracy versus declared confidence bins, including refusal rate.

For irregular boundaries, match monotone boundary index only when candidate and truth cell counts agree; otherwise report count error before positional error. A low positional error with the wrong number of cells is misleading.

**Pixel-cell uniformity** applies only to a high-resolution result or a source partitioned by an alleged target grid. For each proposed cell, compute alpha-weighted within-cell color variance and the fraction of cell area assigned to its dominant/medoid color; aggregate median and worst decile. Normalize against contrast across adjacent cells. For a native `W×H` output where each pixel is already one cell, uniformity is tautologically perfect and must be `N/A`, not a quality win.

### 10.3 Pixel, region, noise, and topology

On exact truth, report canonical RGBA accuracy, channel absolute errors, and palette-label accuracy after an explicit optimal/locked color correspondence. On ambiguous art, do not report raw “pixel accuracy.”

For each exact palette label, alpha foreground mask, or annotated semantic mask:

- 4- and 8-connected component counts and size distributions;
- hole count using paired foreground/background connectivity;
- Euler characteristic `components - holes`;
- split/merge count under overlap matching;
- centroid and area error;
- protected-feature precision/recall and survival;
- line-junction and endpoint survival for line fixtures;
- symmetry error for designated icons.

**Orphan/noise diagnostics must remain plural:**

1. exact-color component area `1` under 4-connectivity;
2. exact-color component area below a configured threshold under 8-connectivity;
3. perceptually merged component area below threshold;
4. isolated alpha-foreground components;
5. introduced microcomponents not matched to truth;
6. deleted annotated microfeatures.

Report counts per 1,000 visible pixels and deltas from reference/source. Never interpret “fewer orphans” as automatically better: dithering, stars, eyes, sparks, and highlights can be intentional. The primary cleanup metric is introduced-noise precision versus protected-detail recall, not raw isolated-pixel count.

### 10.4 Palette and color

- distinct opaque RGB, visible RGBA, and total RGBA counts;
- source/reference color coverage weights;
- exact palette membership and locked palette order where contractual;
- corresponding-pixel mean, median, p95, and maximum CIEDE2000 on aligned truth;
- weighted palette-set transport or minimum-cost matching using color distance plus usage weights;
- rare-color recall for annotated accents/outlines;
- lightness/chroma/hue bias by region;
- gradient band count and monotonicity for ramps.

Use a verified CIEDE2000 implementation with the supplementary test pairs from Sharma, Wu, and Dalal, because the formula has implementation traps and discontinuities ([paper and test-data reference](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/)). Oklab Euclidean distance is useful for internal fast diagnostics, but label it separately; do not call it Delta E 2000. Evaluate color only after canonical color conversion and in visible/premultiplied-aware regions.

### 10.5 Alpha, mask, and halo

- alpha MAE and exact-match rate;
- foreground IoU at preregistered thresholds, plus continuous-alpha error;
- boundary precision/recall/F1 with tolerances of `0`, `0.5`, and `1` target cell as appropriate;
- symmetric Chamfer distance and p95 boundary distance; use Hausdorff maximum only as a worst-outlier diagnostic;
- hidden-RGB invariance: identical visible output for inputs differing only where alpha is zero;
- alpha-zero canonical RGB violations;
- composited CIEDE2000/absolute error over black, white, gray, saturated, and checker backgrounds;
- fringe/halo energy in a narrow band around truth alpha boundary;
- matte-color residual after decontamination.

Boundary precision/recall is preferable to plain IoU for thin structures; Berkeley’s segmentation benchmark formalizes matching boundaries and precision/recall rather than treating all pixels as interchangeable ([Martin et al. benchmark report](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2003/CSD-03-1268.pdf)).

### 10.6 Edge, shape, and reconstruction

- boundary F1 and symmetric Chamfer after mapping output cells into source coordinates;
- silhouette IoU, area, centroid, principal-axis, and bounding-box error;
- thin-feature/endpoint/junction recall;
- outline continuity, thickness distribution, and corner displacement;
- nearest-enlarged reconstruction error against a declared aligned source;
- optional multiscale SSIM for continuous-tone strata only.

SSIM is supplementary: it measures structural similarity under its model and can reward blur or continuous tones that are undesirable in pixel art ([original SSIM paper](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf)). PSNR, MSE, and round-trip error are also diagnostic, not aesthetic rankings. Always show source, native-size output, and nearest-enlarged output alongside numeric summaries.

### 10.7 Determinism and artifact hashes

Record SHA-256 using the same domain-separated schemas as PRD §14.2:

| Domain | Canonical content |
|---|---|
| `pixilate/source-bytes/v1` | encoded byte length + original bytes |
| `pixilate/canonical-rgba/v1` | unsigned little-endian dimensions + row-major RGBA8 |
| `pixilate/palette/v1` | normalized ordered RGBA palette plus lock/transparent-slot semantics |
| `pixilate/semantic-result/v1` | canonical RGBA hash + optional palette hash + effective stage-trace hash |
| `pixilate/recipe-input/v1` | input-affecting requested recipe, excluding result/file hashes and runtime diagnostics |
| `pixilate/recipe-result/v1` | recipe-input hash + actual stage trace/warnings/fallbacks + semantic-result hash |
| `pixilate/encoded-file/v1` | exact encoded output bytes |

The canonical RGBA hash never includes palette order or recipe metadata. An encoded file never embeds its own encoded-file hash; embedded compact references may contain semantic-result or recipe-result hashes. A byte-different PNG with the same canonical RGBA hash is an encoder/metadata reproducibility difference, not a pixel-determinism failure. Conversely, identical file size or visual appearance is not determinism.

Test processing determinism from the exact same canonical RGBA buffer, and test end-to-end strict determinism separately from the exact same encoded input bytes through every approved decoder/color tuple. For each claim, test:

- repeated calls in one process and new processes;
- worker counts `1,2,4` and supported SIMD/scalar paths;
- Chrome, Firefox, and Safari current supported versions;
- Windows/Linux/macOS as applicable;
- x86-64 and arm64 reference hosts;
- cold and warm module instantiation;
- native versus Wasm if both are shipped;
- compiler optimization profiles and pinned release toolchain.

Fast CI runs each golden twice and a tie-heavy subset 100 times. Release qualification runs each strict golden at least 10 times per environment and adversarial tie/numeric cases 1,000 times across the matrix. Any canonical RGBA hash divergence fails the named processing or end-to-end claim. WebAssembly now defines deterministic behavior profiles for otherwise variable numeric cases, but the application still must control decoder, JS/browser paths, toolchain, relaxed SIMD choices, reductions, and encoding ([WebAssembly Core Specification](https://www.w3.org/TR/wasm-core/)).

### 10.8 Performance and memory

Measure decode, color normalization, analysis, resize, quantize, cleanup/background, encode, and end-to-end separately. For remote products, report client time, network/service time, queue time, and end-to-end wall time; do not compare network latency directly with local compute.

Workloads: tiny sprite, `256²`, `1024²`, 4 MP, 10 MP, documented maximum, high-color noise, mostly transparent, spritesheet, and rejection just above limit. Record source/target pixels and colors because megapixels alone do not explain quantizer cost.

Protocol:

- fixed reference machines with CPU, RAM, OS, browser/runtime, power mode, thermal state, and battery/charger recorded;
- no unrelated foreground workload; network fixed or excluded for local core;
- one cold run in a fresh process; at least 3 unmeasured warmups; then a preregistered minimum (initial planning value 30) and adaptive continuation until the CI-width/stability target or maximum run count is reached;
- randomized algorithm order within device/input blocks;
- raw samples retained; report median, p90, p95, MAD/IQR, and bootstrap confidence intervals clustered by base asset;
- Wasm linear-memory high-water mark, process peak resident memory where comparable, major allocations, output bytes, and bundle/compressed bytes;
- cancellation latency, progress behavior, deterministic work-budget failures, noncanonical host-watchdog timeout, and recovery after each outcome;
- never mix debug/instrumented and release-optimized builds in a speed table.

Browser memory APIs are not identical across engines. Use engine-specific measurements only with clear labels; cross-browser claims should rely on a common external process metric plus Wasm allocator instrumentation, not pretend unlike APIs are equivalent.

Strict success versus failure uses deterministic limits on encoded/decompressed metadata bytes, dimensions/pixels/frames, aggregate live bytes, candidates, iterations, queues, and graph nodes/edges. A wall-clock watchdog is a safety backstop only; its result is environment-dependent and never a deterministic golden. The harness must distinguish `algorithm-budget-exceeded`, `allocation-limit`, `user-cancelled`, and `host-watchdog-timeout`.

## 11. Subjective blind evaluation

Aesthetics and production usefulness require people, but a human score is not objective truth.

### 11.1 Panel and display

- **PROVISIONAL-PILOT planning values:** recruit approximately 12 experienced pixel artists/game-art practitioners for a pilot. The release-study judge and comparison counts are set only after simulation/power/sensitivity analysis using pilot effect sizes, judge disagreement, asset-family variance, attrition, and the chosen practical margin; 24 is a workload estimate, not an automatic adequacy proof. General users form a separate secondary panel.
- Obtain consent and compensate participants. Do not expose proprietary inputs outside their approved use.
- Show outputs at native target size and a standardized integer nearest-neighbor enlargement. Use the same checker/black/white backgrounds for alpha cases.
- Disable browser smoothing and variable page zoom. Record display scale; for color-critical study, use calibrated sRGB displays or treat color judgments as non-colorimetric.
- Strip filenames, metadata, method order, watermarks, and UI chrome. Recognizable method artifacts are an unavoidable limitation and must be acknowledged.

### 11.2 Balanced comparisons

Use randomized, counterbalanced pairwise comparisons within the same base asset, target, palette/alpha constraints, and task. A balanced incomplete block design avoids asking every judge to rate every pair. Reverse left/right placement and include duplicated attention/repeatability trials. Do not compare an exact-palette output with an unrestricted output without showing that constraint.

Collect a forced choice with `A`, `tie/equivalent`, `B`, plus independent 1–5 anchored ratings where applicable:

1. silhouette/shape fidelity;
2. important-feature retention;
3. intentional pixel placement and grid cleanliness;
4. palette coherence/readability;
5. outline/line continuity;
6. absence of accidental noise/halos;
7. production readiness without manual repair.

Allow `N/A` and short failure annotations. Do not average dimensions into one number unless weights were preregistered for a named profile. Confirmatory analysis uses a hierarchical paired-comparison model or a multiway bootstrap that accounts for crossed judge and asset-family effects; a one-way derivative-image bootstrap is insufficient. Predeclare tie splitting/modeling, missing/N/A handling, judge/asset exclusions, one primary preference estimand per profile, subgroup status, and multiplicity correction. Bradley–Terry-style models summarize preference rather than establish objective correctness ([paired-comparison review](https://arxiv.org/abs/1210.1016)). Also publish raw win/tie/loss, rating distributions, disagreement, and inter/intra-rater agreement.

### 11.3 Decision thresholds

- **PROVISIONAL-PILOT sensitivity rules, not release gates:** explore whether a tie-split preference lower 95% multiway/hierarchical bound near 45% is a useful noninferiority margin and whether lower-bound >50% plus point preference near 55% is sufficiently persuasive for a default change.
- Freeze final preference margins, model, alpha/interval policy, and comparison count only after pilot power/sensitivity analysis and before opening the release split. A hard-contract fix still requires a preregistered no-meaningful-regression margin.
- If judges strongly disagree by source stratum or style, ship separate named profiles or preserve the user choice; do not hide heterogeneity in an overall mean.

These are project hypotheses, not universal psychometric constants. They cannot promote a default until the pilot decision record freezes the estimand, practical margin, panel/comparison count, and uncertainty method.

## 12. Competitor and baseline protocol

### 12.1 Common capture rules

For every product/tool run, record:

- product name, surface (web/desktop/CLI/API), displayed version, source commit/tag if public, URL, access date/time, and archived documentation URLs;
- browser/app/OS, account tier, region, network, and paid credit cost;
- original input hash and whether pixels left the device;
- every visible setting, hidden/default setting established by source, exact prompt, palette file/order, seed, target, and manual action;
- request/response IDs and sanitized response metadata where terms permit; never store credentials;
- returned dimensions, decoded pixel hash, file hash, elapsed/queue time, error, and screenshots of settings/result;
- whether the run is default, documented recommended, fixed expert recipe, or per-image tuning.

Use only approved CC0/synthetic non-sensitive fixtures with remote services. Recheck terms and privacy immediately before uploading. Do not automate a site against its terms, bypass authentication/rate limits, or send hostile/corrupt files to a third-party service. Competitor reports are factual interoperability/quality observations, not copied implementations.

Run order is randomized within a short time block. For remote systems, repeat identical requests at least 5 times in exploratory work and 10 times for any repeatability claim; repeat a smaller fixed sentinel set after 24 hours and 7 days to detect silent backend drift. Capture fixed-seed and documented random/default behavior separately. Pixel variance, dimension variance, and hash cardinality are reported; no failed call is silently retried out of the denominator.

### 12.2 Required systems

| System | Frozen comparator | Native tasks/settings | Fairness notes |
|---|---|---|---|
| PixelLab | current public service/API surface only | Publicly exposed Unzoom, Resize, standard/Pro conversion, Reduce Colors, and background-removal settings | Remote generative/service tools. Use an approved account and upload-authorized fixtures; fixed seed does not imply canonical identity; do not publish private account/request metadata. Follow the public-safe matrix in the [PixelLab spike](../products/pixellab.md). |
| SpriteFusion Pixel Snapper | pinned core `ae20461…`, crate 1.0.0, and dated live web surface | web default 16 and allowed palette counts; CLI/Wasm default; manual pixel-size hint; custom palette | Evaluate native `recover-grid`; exact target is unsupported. Report web and pinned core separately. Include clean hard-edge, gradient, non-square cells, transparent canvas, sheet, and format mismatch cases from the [source audit](../products/spritefusion-pixel-snapper.md). |
| Unfaker | source `b2bee10…`, live 1.2.0, shared core/CLI where buildable | default; each detector; manual scale; snap on/off; reducers; QVote; max colors; alpha; cleanup; content-adaptive | Native target is scale-derived, not requested. Capture phase cropping and actual final palette. Keep libimagequant output as comparison evidence, not MIT-reusable implementation; see the [Unfaker audit](../products/unfake-js.md). |
| Conventional resizers | pinned ImageMagick and/or libvips/Pillow reference plus Pixilate-owned math reference | nearest, box/area, triangle, Catmull/bicubic, Mitchell, Lanczos3; explicit color/alpha path | Version, filter support, virtual pixels, gamma/ICC, alpha association, and rounding must be explicit. Browser canvas is a separate platform diagnostic, not a strict oracle. |
| Quantization baselines | pinned permissive candidates plus isolated research oracles not approved for the current production bundle | median cut, octree, Wu, deterministic Lloyd/Oklab, exoquant/image-q; modern libimagequant under its applicable GPL/commercial terms | Compare output quality, exact caps, determinism, speed, and distribution posture. Never copy or link GPL code into the MIT-owned production core without an approved licensing change/commercial path. |
| Landscape candidates | any newly discovered pixelizer/grid snapper/resizer passing intake | native default and documented controls | Complete intake sheet first; classify task/capability; pin version/date; add to a preregistered next sweep rather than mid-run. |

### 12.3 Capability and quality tables are separate

The capability table answers: target accepted, exact output, Trim, palette cap/palette import, alpha, local/offline, background, settings, deterministic contract, source/license. The quality table contains only systems that produced a comparable result under the same task constraints. An unsupported cell is `UNSUPPORTED`; a service failure is `ERROR`; a refusal is `REFUSED`; none becomes a numeric zero.

For auto-size/grid recovery products, compare recovered dimensions and latent-grid truth. Optionally run a two-stage “product output then pinned nearest/area adapter to target” workflow, but label it `adapted`, include adapter cost/artifacts, and never attribute exact-target support to the product.

## 13. Experimental design and confounds

### 13.1 Reproducible run plan

Before a finalist/release sweep, freeze a run specification containing hypotheses, primary metrics by stratum, exclusions, profile versions, parameter ranges, baselines, sample sizes, statistical model, regression margins, and report template. Hash it. Store raw artifacts and scripts needed to regenerate tables; reproducibility guidance in computing similarly treats code, data, measurements, and analysis scripts as first-class artifacts ([ACM artifact guidance](https://www.sigops.org/2023/artifact-evaluation-theory-and-practice/)).

Required controls:

- every stochastic algorithm receives a fixture-derived fixed seed and records PRNG algorithm/version; “no randomness” records `seed:null`;
- seed sweeps use a fixed published list, never rerun until an attractive result appears;
- tie order, map iteration, parallel reduction, and thread scheduling are explicit test factors;
- randomize method order inside input/device/time blocks;
- include cold and warm measurements but never pool them;
- tune only on development, select on validation, and open release test once per candidate decision;
- use a hierarchical model or multiway resampling with crossed judge and asset-family effects; never resample derivative images as independent observations;
- report confidence intervals and raw distributions, not only p-values;
- preregister multiplicity control for confirmatory method/rubric/subgroup claims; clearly label all uncorrected analyses exploratory;
- include every valid case in macro-by-stratum results and publish exclusion reasons.

### 13.2 Major confounds to record or eliminate

- decoder/color-management differences before the algorithm starts;
- source aspect versus target aspect and hidden crop/pad behavior;
- alpha threshold, matte, and preview background;
- palette budget, transparent reservation, and whether dithering is allowed;
- hidden automatic preprocessing, cleanup, or server model updates;
- expert per-image tuning time and prior knowledge of the reference;
- source-family leakage and multiple variants treated as independent;
- target size, source megapixels, palette entropy, and visible coverage in performance;
- browser JIT/Wasm compilation, cache, SIMD, threads, power/thermal throttling;
- remote queue/network/region/time of day and credit failures;
- display interpolation, zoom, color calibration, left/right/order effects in human review;
- saving/encoding metadata mistaken for pixel differences;
- choosing favorable examples after seeing outputs.

## 14. Result schema

Use newline-delimited JSON for one immutable attempt per record and a normalized columnar export for analysis. Store large images separately by content hash. Required logical shape:

```json
{
  "schema_version": "pixilate-benchmark-result/1",
  "run_id": "uuid",
  "attempt": 1,
  "suite": {"corpus_version": "1.0.0", "tier": "release", "plan_sha256": "..."},
  "case": {
    "asset_id": "G-0001",
    "family_id": "family-001",
    "stratum": "G",
    "tags": ["exact-grid", "alpha", "thin-feature"],
    "source_bytes_sha256": "...",
    "canonical_input_rgba_sha256": "...",
    "license_spdx": "CC0-1.0",
    "ground_truth_type": "exact"
  },
  "task": "resize",
  "axes": {
    "target": [32, 24],
    "trim": {"enabled": true, "alpha_threshold_exclusive": 0},
    "fit": "contain",
    "palette": {"mode": "at-most", "count": 16},
    "background_stage": null
  },
  "system": {
    "name": "pixilate",
    "surface": "wasm",
    "version": "0.1.0",
    "source_revision": "...",
    "build_sha256": "...",
    "dependency_lock_sha256": "..."
  },
  "recipe": {"schema": "pixilate-recipe/1", "recipe_input_sha256": "...", "recipe_result_sha256": "...", "parameters": {}},
  "environment": {
    "utc": "...",
    "os": "...",
    "arch": "x86_64",
    "cpu": "...",
    "ram_bytes": 0,
    "browser_or_runtime": "...",
    "threads": 1,
    "simd": false,
    "power_profile": "..."
  },
  "outcome": {
    "status": "ok",
    "error_code": null,
    "width": 32,
    "height": 24,
    "canonical_rgba_sha256": "...",
    "palette_sha256": null,
    "semantic_result_sha256": "...",
    "encoded_sha256": "...",
    "artifact_uri": "sha256/...",
    "warnings": [],
    "operational_outcome": null,
    "actual_stage_trace": []
  },
  "metrics": {
    "dimension_error": {"value": 0, "unit": "pixels"},
    "rgba_accuracy": {"value": 1.0, "applicable": true},
    "ssim": {"value": null, "applicable": false, "reason": "exact-grid categorical case"}
  },
  "performance": {
    "cold": false,
    "wall_ms": 0.0,
    "stage_ms": {},
    "peak_wasm_bytes": 0,
    "peak_process_bytes": null
  },
  "competitor_capture": null,
  "subjective_batch_id": null
}
```

Schema validation rejects unknown status values, missing applicability reasons, nonfinite numbers, volatile fields inside either the `recipe-input` or `recipe-result` projection, or artifacts whose hashes do not verify. Secrets, account IDs, personal reviewer identities, and signed contracts never enter public result records.

## 15. Golden files and version policy

### 15.1 What may be golden

Golden pixels are appropriate for exact mathematical truth, canonical decode conformance, identity/no-op, deterministic tie cases, and explicit mask operations. Ambiguous visual outputs use invariant goldens, metric envelopes, and multi-reference/human evidence—not a frozen picture selected from the current implementation.

Each golden directory in the future benchmark will bind:

- corpus/fixture generator version and source hash;
- input and truth hashes;
- recipe schema and profile version;
- expected dimensions, ROI, palette/mask constraints, pixel/metadata hashes where exact;
- metric implementation version and test vectors;
- rationale and scope/preconditions.

### 15.2 Updating goldens

1. A failing golden is never overwritten by a routine “update snapshots” command.
2. Submit a separate golden-change record with old/new visual diff, metric delta, reason, affected claim, and whether behavior is bug fix, intentional profile change, decoder change, or fixture correction.
3. Require independent review by someone who did not author the algorithm change; ambiguous visual changes require pixel-artist review.
4. Algorithm behavior changes increment the profile/engine behavior version. Saved recipes continue to name the old version or return an explicit unsupported-version error.
5. Fixture corrections increment corpus version and preserve a tombstone/migration note. Never rewrite a published asset under the same ID/hash.
6. Decoder, color, metric, or encoder changes trigger the entire affected conformance suite, not only snapshots that visibly changed.
7. Do not change code, thresholds, corpus, and expected goldens in one opaque commit/review unit.

## 16. Regression thresholds and release gates

### 16.1 Universal hard gates

A release fails if any supported valid case has:

- nonzero requested dimension error;
- undocumented crop/pad/Trim ROI or fallback;
- palette overflow or forbidden colors under an exact palette contract;
- missing/failed mandatory final palette/alpha validation after any color-producing late stage;
- hidden RGB affecting visible strict output or alpha-zero RGB violating canonical policy;
- canonical pixel hash divergence in the supported strict environment matrix;
- invalid exact-factorization enumeration, or original-grid recovery mismatch inside instructed/uniquely identifiable exact-profile preconditions;
- crash, trap, stale result, unbounded allocation, or generic error where a typed bounded rejection is required;
- missing license/provenance for a redistributed benchmark asset or production dependency.

Zero valid-case crashes is not negotiable. Unsupported formats/settings must be rejected before processing with stable typed errors.

### 16.2 Profile quality gates

Numeric lifecycle is `proposed` → `approved blocking budget` → `measured baseline` → `release limit`. Before the pilot/baseline decision records, every quality, performance, corpus-size, and preference number is `PROVISIONAL-PILOT` or `TBD-BLOCKING`, not an implicit gate. Establish metric-specific practical margins in native units on development/pilot evidence, approve them before validation selection, then freeze them before release-test access.

The following are sensitivity-analysis starting points only: normalized-metric median loss 0.5 percentage point, worst-decile loss 1 point, protected-feature/topology loss 5 points, warm median runtime regression 10%, p95 15%, and peak-memory 10%. They MUST NOT be applied across unrelated normalized metrics or treated as approved release gates without an OD-011/profile decision record. Approved gates require:

- a named primary metric/estimand and native-unit practical margin per profile/stratum;
- multiway/hierarchical 95% uncertainty that does not cross the negative practical margin;
- the frozen subjective rule from §11 for a visual-default change;
- absolute latency, memory, bundle, deterministic work-budget, cancellation, and maximum-input limits on the minimum supported device; relative improvement over a slow baseline is insufficient;
- a documented exception only for an approved quality/security gain that also versions the affected budget and claim.

Do not average improvements in photos against regressions in exact grid. Each claimed profile/stratum passes independently.

### 16.3 Claim-to-gate matrix

| Product claim | Mandatory evidence before claim |
|---|---|
| “Exact target size” | destination-by-construction proof, exhaustive reduced-domain/property/boundary tests, and zero observed dimension errors across the declared corpus/matrix |
| “Processing deterministic” | canonical RGBA hash identity from fixed canonical input across declared runs/runtime/CPU matrix; pinned processing recipe/build |
| “End-to-end strict deterministic” | processing evidence plus fixed input bytes and approved pinned decoder/color tuple; identical canonical RGBA and typed deterministic work-budget behavior |
| “Exact grid recovery” | all valid factorizations enumerated; 100% authored-grid recovery only for instructed/uniquely identifiable G fixtures; ambiguity fixtures refuse false authority; published corruption curves |
| “AI mixel profile” | conformance plus held-out M noninferiority over conventional and specialist baselines; expert preference; published failure taxonomy |
| “Works on HD art/photos” | exact target plus H/P edge/color/feature metrics and blind usefulness; no grid-recovery language |
| “Preserves outlines/thin features” | O/T/L protected-feature recall, topology, endpoints/junctions, and artist review at declared targets |
| “Exact palette” | mandatory final validator passes after dither/cleanup/matte; zero forbidden colors/overflow; locked-color and tie conformance |
| “Deterministic background removal” | repeatable mask, exact primitive semantics, B mask/boundary metrics; no claim of universally correct automatic subject recognition |
| “Wide input support” | format/color/orientation/frame conformance and safe hostile rejection for each named format; documented byte/pixel/dimension limits |
| “Pixel-perfect” | use only with a precise contract such as exact-grid recovery or exact target/palette; never as a general aesthetic slogan |

Mixel/HD/background profiles remain Beta if their human or failure-boundary gates are incomplete, even if the core is deterministic.

## 17. Impossible or misleading metrics and claims

- **One universal accuracy percentage:** no unique target exists for arbitrary HD or mixel inputs.
- **“Best algorithm for every image”:** objectives conflict and no corpus covers every artistic intent.
- **Raw similarity to the HD source:** often rewards blur, gradients, excess colors, and antialiasing that the product is meant to remove.
- **SSIM/PSNR as pixel-art quality:** useful diagnostics for aligned continuous tones, not production-readiness or intentional pixel placement.
- **Output grid alignment at native resolution:** every raster sample lies on its own grid, so this is tautological unless testing recovered source cells/boundaries.
- **Low orphan count:** can reward deletion of eyes, stars, particles, dithering, and one-pixel accents.
- **Low palette count:** says nothing about palette choice, contrast, or feature preservation.
- **Palette Delta E without correspondence/weights:** can match unused colors and ignore where colors occur.
- **Euler characteristic alone:** different wrong shapes can share components-minus-holes.
- **Hausdorff maximum alone:** one outlier dominates; pair it with distributions and feature measures.
- **Byte-identical PNG as pixel identity:** metadata and compression can differ; pixel hash must be separate. The reverse matters if byte identity is claimed.
- **Five identical remote outputs as proof of future determinism:** only evidence for that service window/settings; backend version is usually uncontrolled.
- **Seeded equals deterministic:** floating reductions, unordered ties, decoders, server changes, and encoders can still diverge.
- **Remote end-to-end time versus local compute:** network/queue confounds make the ranking meaningless without decomposition.
- **Average score across all strata:** allows one easy/high-volume class to hide catastrophic failures in another.
- **Per-image hand-tuned best versus another tool’s default:** different labor/knowledge budgets.
- **Synthetic-only success:** procedural mixels validate known perturbations, not the full distribution of generated art.
- **A single artist reference as truth:** it encodes one valid interpretation.
- **Background IoU on ambiguous edges as exact truth:** partial alpha and annotation disagreement require uncertain bands and multiple views.
- **“Works on every input”:** corrupt, unsupported, semantically ambiguous, and adversarial images make this impossible. Promise safe deterministic handling within explicit scope instead.

## 18. Prioritized validation backlog

| Priority | Validation item | Deliverable | Exit condition |
|---:|---|---|---|
| P0 | Approve R0 canonical-RGBA contract | alpha enum, target/Trim/extreme-aspect formulas, domain-separated recipe/hash projections, deterministic work/error taxonomy | no `TBD` in Slice A hard invariants; no production codec/engine selected |
| P0 | Corpus legal/governance review | CC0/commission template, manifest/schema, rights checklist, removal process | every proposed source route approved; uncertain assets excluded |
| P0 | Slice A fixture specification review | versioned in-memory math for G/A geometry, alpha, ambiguity, and boundary/error vectors | independent implementation can reproduce declared canonical-RGBA hashes |
| P0 | Metric specification and test vectors | definitions, applicability, empty-set behavior, verified CIEDE2000/topology/boundary cases | two implementations agree on reference vectors |
| P0 | Competitor intake freeze | dated version/setting/capability sheets for PixelLab, SpriteFusion, Unfaker, conventional baselines | each task comparison is fair or explicitly unsupported/blocked |
| P0 | R1 determinism feasibility matrix | processing versus end-to-end claims; browser/OS/CPU/toolchain; scalar/SIMD/thread; candidate/approved codec tuples | selected strict matrix and divergence response approved before product implementation |
| P0 | Resource/security budgets | encoded/decompressed metadata bytes, dimensions, pixels, frames, aggregate memory, candidates/iterations/queues/graphs, host watchdog, cancellation | deterministic work limits and noncanonical operational outcomes have distinct typed expectations |
| P1 | Seed the 64-case CI corpus | licensed base cases and annotations | all strata/counts present; provenance complete; no family leakage |
| P1 | Conventional baseline sweep | target/alpha-correct resize and basic quantizer results | Pareto baselines and provisional budgets fixed |
| P1 | Specialist competitor sweep | native grid/palette tests and remote repeat sets | raw outputs/settings/hashes retained; drift/cost/privacy reported |
| P1 | Exact-grid detector/reducer bake-off | factorization-set, identifiability, ambiguity, and severity-curve report | valid factors complete; instructed/unique recovery exact; ambiguity/refusal calibrated |
| P1 | Quantizer/dither bake-off | quality/determinism/runtime/license report | finalist has an approved distribution/license posture; exact-cap gate met |
| P1 | Mixel candidate/ablation sweep | held-out M metric vectors and failure gallery | finalist beats or complements simple baselines; no universal claim |
| P1 | Human-evaluation pilot | rubric reliability, effect sizes, workload/power plan | anchors understood; panel size and decision margin frozen |
| P1 | Background primitive validation | exact/tolerance/flood/component mask report | semantics exact; ambiguous limitations documented |
| P2 | 480-case release corpus | frozen corpus datasheet and hashes | balance, licenses, annotations, family split, and review complete |
| P2 | Performance/device qualification | cold/warm raw data and memory/cancellation report | absolute budgets pass on minimum supported devices |
| P2 | Default-selection release study | preregistered objective + blind comparison report | claim-to-gate matrix passes by profile |
| P3 | Research-only expansion | 1,600-case sweep, extra codecs/segmentation/cleanup | evidence justifies scope/bundle/license complexity before adoption |

## 19. Two-stage authorization criteria

Promising algorithms do not authorize product implementation. The earlier single gate was circular because it required completed corpus/metric/codec evidence before permitting the harness needed to produce that evidence. The authoritative split is:

### Gate R0 — documentation to dependency-clean research harness

R0 may authorize only an in-memory canonical-RGBA **Slice A** when:

1. the owner approves bounded claims and profile scope, with universal aesthetic accuracy removed;
2. canonical RGBA bytes, alpha enum, target, Trim, extreme-aspect Contain clamp, nonnegative rational-area/nearest behavior, exact-factorization ambiguity, domain-separated hashes, and typed deterministic work errors have no blocking ambiguity;
3. the procedural Slice A fixture license policy and expected reference vectors are approved;
4. destination-size, allocation, iteration/candidate, and hostile in-memory limits are explicit;
5. Slice A is prohibited from freezing a production codec/color path, Rust/Wasm versus TypeScript, quantizer, Mixel scorer, advanced filter, background segmenter, UI framework, or visual default.

R0 output is a reproducible conformance report for hashing, alpha/Trim, Stretch/Contain/Cover, nearest/nonnegative rational area, typed bounds/errors, and factorization ambiguity. It is not a product demo or release claim.

### Gate R1 — research harness to product implementation

R1 requires:

1. candidate codec/color tuples evaluated and an OD-002 approved strict matrix frozen;
2. corpus license/commission/manifest/privacy/trademark governance approved, with reproducible specifications for every required synthetic family;
3. every release metric mapped to claims/strata with applicability and empty-set semantics;
4. Fast/Release/Research corpus counts and splits revised from `PROVISIONAL-PILOT` as needed, then accepted with golden governance and result schema;
5. processing and end-to-end runtime matrices, dependency closure, parser/allocator/work limits, and operational watchdog behavior approved;
6. human/statistical pilot complete; estimands, multiway/hierarchical model, power, multiplicity, and metric-specific practical margins frozen before release-test access;
7. competitor comparisons frozen fairly, including upload authorization and repeat costs;
8. the product plan keeps simple falsification baselines before automatic-profile tuning or full UI work.

No default Mixel algorithm, “best” marketing claim, production codec matrix, or destructive cleanup is locked at R0. A simpler exact-target area/nearest baseline with honest limits remains the required falsification route.

## 20. Report template

Every release or research decision report should use this structure:

```markdown
# <Experiment/release> evaluation

## Decision and claims evaluated
- decision requested
- supported task/profile claims
- preregistration hash and deviations

## Systems and versions
- Pixilate build/profile/recipe versions
- competitor surfaces, versions/dates, settings, access blockers
- dependency/license status

## Corpus
- corpus version and split
- primary-stratum counts and family counts
- provenance/license exclusions and missing coverage

## Environments and protocol
- hardware/OS/browser/runtime matrix
- seeds, repetitions, warmup, run order, performance protocol
- subjective panel/display/blinding protocol

## Hard conformance
- dimensions, Trim/ROI, palette, alpha, errors, determinism
- failures with case IDs and artifacts

## Quality by stratum
- metric vectors with confidence intervals
- win/tie/loss and rubric distributions
- Pareto plots; never only an overall average

## Performance and operational limits
- cold/warm stage timing, memory, bundle, cancellation
- remote latency/queue/cost separated

## Failure gallery
- representative and worst-decile outputs at native and nearest-enlarged scale
- protected-detail/topology/halo overlays

## Regressions and trade-offs
- baseline deltas against frozen margins
- individual catastrophic cases
- known confounds and uncertainty

## Decision
- pass/fail/Beta by claim
- selected profile/settings or reason no selection is justified
- follow-up experiments and owner

## Reproduction manifest
- raw result/artifact hashes
- scripts/commands and schema versions
- golden changes, if any
```

## 21. Reference set

- W3C, [PNG Specification, Third Edition](https://www.w3.org/TR/png-3/) — alpha, color metadata, format semantics.
- W3C, [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) — sRGB transfer and color conversions.
- W3C, [Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/) — alpha compositing model.
- W3C, [WebAssembly Core Specification](https://www.w3.org/TR/wasm-core/) — numeric execution/determinism constraints.
- Sharma, Wu, and Dalal, [CIEDE2000 implementation notes and test data](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/).
- Martin et al., [A Database of Human Segmented Natural Images and its Application to Evaluating Segmentation Algorithms and Measuring Ecological Statistics](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2003/CSD-03-1268.pdf).
- Wang et al., [Image Quality Assessment: From Error Visibility to Structural Similarity](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf).
- Creative Commons, [CC0 1.0 Universal legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en) and [public-domain guidance](https://creativecommons.org/public-domain/).
- REUSE, [Specification 3.3](https://reuse.software/spec/) — per-file machine-readable licensing practice.
- Gebru et al., [Datasheets for Datasets](https://www.microsoft.com/en-us/research/publication/datasheets-for-datasets/).
- NIST/SEMATECH, [Randomized block designs](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm).
- OWASP, [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
