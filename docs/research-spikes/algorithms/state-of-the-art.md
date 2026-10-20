# State of the art: deterministic raster-to-pixel-art processing

**Project:** Pixilate (working name)  
**Document type:** research spike / technical landscape  
**Status:** planning evidence, not an implementation specification  
**Research date:** 2026-07-31

## Executive conclusion

There is no single mathematically correct way to turn an arbitrary raster image into small pixel art. Downscaling is many-to-one, foreground/background is a semantic distinction that is not always encoded in the pixels, and the objectives people call “accurate” conflict: preserve average color, preserve the silhouette, preserve one-pixel details, preserve an existing grid, avoid stray pixels, and use a small palette cannot all be maximized at once.

Pixilate should therefore not promise a universal best result. It can make a stronger and testable promise:

> For fixed input bytes, a versioned processing profile, and explicit settings, Pixilate produces the same exact target dimensions, normalized pixels, palette decisions, and processing metadata on every supported browser. Its automatic mode chooses among documented deterministic candidates using a fixed score, while advanced mode exposes the decisions that are genuinely subjective.

The technical recommendation is a single Rust-to-WebAssembly processing engine, with the browser canvas used only for display. Decode into a canonical oriented RGBA representation; make trim and aspect behavior precise; filter color in linear light with premultiplied alpha; keep “recover an existing pixel grid” separate from “invent a new pixel abstraction”; and quantize only after spatial reduction unless a profile has evidence for a different order. A promising permissively licensed baseline is `image` plus `fast_image_resize`, small custom fixed-order grid/block primitives, and `quantette` or a Wu-initialized fixed Lloyd refinement in Oklab. Native browser decode and `createImageBitmap()` should not be part of the strict processing path because the HTML standard leaves some conversion behavior implementation-dependent.

The default should be profile-driven:

1. **Exact grid recovery** for genuinely block-upscaled pixel art.
2. **AI pseudo-pixel / mixel reconstruction** for images that imitate pixels but have irregular cells, antialiasing, gradients, and texture.
3. **HD illustration / photo abstraction** when there is no source grid to recover.
4. **Line-art / manual-raster preservation** when topology and outlines dominate.
5. **Background removal** as a separate, explicitly seeded or color-based operation that writes alpha before Trim is evaluated.

The mixel profile is the research-heavy differentiator. No published method discovered in this spike establishes a universal solution for it. The recommended candidate ensemble and irregular-boundary dynamic program below are engineering hypotheses and must earn their place through a benchmark, not through aesthetic intuition.

## Scope and vocabulary

This spike covers deterministic, non-generative processing of decoded raster pixels. It does not propose an image-generation model, an AI semantic segmenter, or a vector drawing editor.

- **True pixel art:** each logical pixel is represented by one raster sample, or by a uniform integer-sized block of samples after deliberate nearest-neighbor enlargement.
- **Mixel:** a source that visually imitates pixel art but violates a single global grid—for example, AI-generated pseudo-pixel art, antialiased exports, JPEG-compressed sprites, or manually painted blocks of inconsistent size.
- **Logical grid:** the intended low-resolution cell lattice, which may or may not be recoverable from the source.
- **Spatial reduction:** mapping source coverage into fewer output cells.
- **Quantization:** mapping colors to a limited palette. This is independent of spatial size.
- **Determinism:** fixed input bytes, engine version, and complete configuration produce identical canonical decoded output pixels and metadata. Byte-identical encoded files require the encoder and its chunk/compression policy to be pinned too.

## Why a universal “best algorithm” is impossible

For an output cell covering red and blue source samples equally, an area average produces purple, a mode must choose red or blue, a median depends on the representation, and an edge-preserving method may move the boundary. None is universally more accurate. Likewise, a lone pixel can be compression noise, an important eye highlight, a star, or an intentional break in an outline. The raster alone does not identify the artist’s intent.

Several ambiguities are information-theoretic rather than implementation defects:

- Many high-resolution images collapse to the same low-resolution image; inversion has no unique answer.
- A flat color at the border may be a removable background or part of the subject.
- A periodic edge pattern can imply a fundamental grid, a harmonic, a repeated texture, or no intended grid.
- Exact target dimensions may be incompatible with the recovered logical grid and aspect ratio.
- Palette fidelity, edge fidelity, topology, and low noise can require different color assignments.

Pixilate should present deterministic alternatives and sensible profiles, not hide these conflicts behind a vague “AI quality” claim.

## End-to-end deterministic processing model

The order of operations is observable. It must be specified, versioned, and recorded in export metadata.

```text
input bytes
  -> format sniff and bounded decode
  -> orientation normalization
  -> embedded color-profile conversion to canonical sRGB
  -> canonical unassociated RGBA buffer
  -> optional background operation (separate feature)
  -> Trim ROI selection
  -> aspect/crop/pad geometry
  -> profile-specific spatial reduction
  -> palette construction/locks and palette mapping
  -> optional dithering
  -> optional conservative cleanup/topology guard
  -> final palette/alpha contract validation (or serialized correction/typed failure)
  -> canonical RGBA result + palette + provenance
  -> pinned deterministic encoder
```

Changing this sequence changes results. In particular, quantizing before resize can make averages and edges depend on early palette errors; resizing straight RGB without alpha premultiplication creates halos; trimming before orientation selects the wrong region; and background removal after Trim cannot influence the target-size interpretation the user requested.

## 1. Decode, orientation, color, and alpha

### 1.1 Format decode is part of the algorithm

The browser should not silently choose the processor’s pixels. The HTML `createImageBitmap()` algorithm exposes `imageOrientation`, `premultiplyAlpha`, and `colorSpaceConversion`, and the standard permits implementation-dependent behavior in relevant conversion paths ([HTML Living Standard](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)). Browser canvas decode also obscures decoder versions and metadata handling. It is suitable for previews, not for a cross-browser pixel hash contract.

The candidate T1 static set should be narrow and explicit: PNG is the minimum candidate, with JPEG, WebP, and BMP admitted only if the codec/color experiment passes. GIF is T2 because it requires explicit frame selection and serialized frame identity. AVIF can be considered after a codec/version audit. HEIC/HEVC should not be promised initially because decoder availability and patent/licensing obligations vary. Animation must either be rejected or require an explicit frame; “first frame” must never be an undocumented accident.

JPEG is intrinsically lossy and permits implementation choices in IDCT/scaling paths ([JPEG overview](https://jpeg.org/jpeg/)). Pixilate cannot recover pre-JPEG pixels, but it can pin one decoder implementation and settings so its decoded pixels are stable. Decoder, crate, and codec versions belong in the engine version and reproducibility tests.

Defensive decode limits are required even in a browser:

- maximum encoded bytes;
- maximum width, height, total decoded pixels, and frame count;
- checked integer arithmetic for strides and allocations;
- deterministic work/allocation budgets inside the algorithm, plus separate user cancellation and host-watchdog handling in a worker;
- rejection of malformed or unsupported profiles rather than an unreported fallback.

### 1.2 Normalize orientation first

EXIF orientation affects both dimensions and coordinates. Apply it before Trim, grid analysis, crop anchors, or target aspect calculations. The current CIPA Exif family is the authoritative metadata reference ([CIPA Exif standards](https://www.cipa.jp/e/std/std-sec.html)). Once applied, discard or rewrite the tag so export consumers do not rotate the result again.

### 1.3 Canonical color policy

Use a canonical output interpretation: unassociated RGBA8 in sRGB for storage and interchange, with higher-precision linear values internally when filtering. The PNG specification defines color-space chunk precedence and explicitly distinguishes unassociated PNG alpha from premultiplied representations ([PNG Third Edition](https://www.w3.org/TR/png-3/)). A deterministic decoder must define how it handles, in precedence order, `cICP`, `iCCP`, `sRGB`, and `cHRM` plus `gAMA`; conflicting or invalid metadata needs a fixed reject/warn/fallback policy.

A practical SDR policy is:

1. Honor a valid embedded ICC or recognized standard color-space declaration through a pinned color-management implementation.
2. Otherwise apply the file format’s declared/default transfer behavior.
3. Convert accepted SDR inputs to canonical sRGB using fixed rendering intent and black-point policy.
4. Record warnings when metadata is invalid or discarded.

`cICP` can describe HDR transfer functions and narrow/full range, so strict T1 must use an explicit accept/warn/reject matrix. Until a versioned tone-map and range transform exists, reject unsupported HDR or narrow-range combinations with a typed error rather than silently treating them as ordinary ICC-managed SDR.

The sRGB transfer equations and Oklab conversion matrices can be taken from [CSS Color 4](https://www.w3.org/TR/css-color-4/). CIELAB is standardized by [ISO/CIE 11664-4:2019](https://www.iso.org/standard/74166.html). Do not average gamma-encoded sRGB channel bytes for the fidelity profile: decode them to linear-light values first.

### 1.4 Correct alpha filtering

PNG stores unassociated color, including possibly arbitrary RGB under zero alpha. A convolution or area reducer should operate on premultiplied linear color:

```text
a = alpha / alphaMax
p = a * linear_sRGB(rgb)

p_out = sum(w_i * p_i)
a_out = sum(w_i * a_i)

if a_out > epsilon:
    rgb_out = sRGB_encode(p_out / a_out)
else:
    rgba_out = (0, 0, 0, 0)
```

Color and alpha must use the same spatial weights. For nonnegative exact-area paths, zero coverage is exact. Negative-lobe kernels additionally require a versioned boundary rule, coefficient normalization, accumulator width, alpha/premultiplied-color clamp order, unpremultiply threshold, gamut handling, transfer function, and final rounding before they can enter strict mode. This prevents invisible RGB from leaking into edge colors and avoids dark/light fringes. The PNG recommendation to write black when converting a fully transparent premultiplied sample back to unassociated form supports canonicalizing alpha-zero RGB ([PNG Third Edition](https://www.w3.org/TR/png-3/)); Porter-Duff compositing equations are specified by [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/).

Palette sampling, grid scores, trim tests, and background-color statistics must ignore RGB at alpha zero. Tests should composite output over black, white, mid-gray, and a checkerboard to detect halos invisible on one preview background.

## 2. Trim, exact target size, and aspect policy

### 2.1 Trim must have a mathematical definition

After orientation and optional background removal, define the visible set for threshold `tau`:

```text
S_tau = {(x, y) | alpha(x, y) > tau}
```

The recommended default is `tau = 0`, meaning any nonzero coverage participates. This is less likely to clip antialiased edges than interpreting “opaque” as alpha 255. Advanced controls may offer “any visible,” “fully opaque,” or a numeric threshold, but the effective numeric comparison must be recorded.

If `S_tau` is nonempty, Trim selects the smallest half-open box:

```text
[xmin, xmax + 1) x [ymin, ymax + 1)
```

Optional integer padding is applied after finding the box and is clipped to the oriented canvas. If the set is empty, return an explicit `empty-visible-region` outcome; the UI can offer a 1×1 transparent export, but silently inventing a subject is undesirable.

- **Trim checked:** target sizing is based on this ROI.
- **Trim unchecked:** target sizing is based on the complete oriented canvas.
- **No alpha channel:** decoded alpha is fully opaque, so the trim box is the entire canvas unless background removal has written transparency.

### 2.2 Exact output dimensions are a hard invariant

Every successful resize operation must emit exactly `W x H`, never a nearby algorithm-selected size. Width and height must be positive bounded integers. There are three conventional aspect behaviors:

| Mode | Scale | Remaining decision | Principal failure |
|---|---:|---|---|
| Stretch | `sx=W/w`, `sy=H/h` | none | geometric distortion |
| Contain + pad | `s=min(W/w,H/h)` | rounding, pad color, anchor | unused canvas |
| Cover + crop | `s=max(W/w,H/h)` | rounding, crop anchor | content loss |

For contain/cover, specify the integer rounding rule, minimum resized dimension, anchor, and odd-pixel remainder. The recommended normative policy is round-half-to-even, then clamp every resized axis of a nonempty source to at least `1` without exceeding the relevant box; compute pad/crop rectangles from those clamped integers and assign an odd remainder to the right/bottom for a center anchor. Other anchors are valid, but they must be settings, not hidden heuristics. Extreme-aspect vectors around the zero-rounding boundary are mandatory.

For exact area reduction, output cell `(i,j)` corresponds to a rational source footprint:

```text
x in [i*w/W, (i+1)*w/W)
y in [j*h/H, (j+1)*h/H)
```

Integer/rational overlap weights avoid phase drift and guarantee exact dimensions. They also define a useful non-grid baseline.

### 2.3 Grid-safe sizing is a fourth mode

If a true logical grid is recovered, nearest-neighbor replication or categorical block reduction preserves it. However, the requested `W x H` may not share its aspect or integer factors. Pixilate must expose that conflict. Deterministic policies include:

- crop/pad logical cells to the target;
- distribute nonuniform cell widths/heights by a fixed rational-error schedule;
- apply a conventional resampler after grid recovery;
- refuse “grid-perfect” mode and explain why.

The first three are useful, but none is lossless. The UI should label the chosen compromise.

## 3. Conventional resampling kernels

For a scale-aware separable filter, each destination sample integrates the reconstruction kernel over the source footprint. A naive point sample, bilinear call, or browser draw without a shrink prefilter aliases high frequencies. The [ImageMagick filter documentation](https://usage.imagemagick.org/filter/) and [resize guide](https://usage.imagemagick.org/resize/) give a useful practical taxonomy; the audited `image` source exposes representative `Nearest`, `Triangle`, `CatmullRom`, `Gaussian`, and `Lanczos3` choices ([pinned `image` source audit](../landscape/open-source-ecosystem.md#12-image-rsimage-broad-codec-ecosystem-insufficient-resize-semantics-by-itself)).

| Method | Core behavior | Strengths | Typical pixel-art failure | Useful role |
|---|---|---|---|---|
| Nearest / point | select one source sample | exact colors, crisp, very fast | aliases; drops thin features; bad phase dominates | known grid or intentional hard style |
| Box / area | coverage-weighted average | correct energy for shrinking; stable baseline | blur; invents colors; thins contrast | HD/photo reduction and benchmark baseline |
| Triangle / bilinear | linear tent | cheap and smooth | insufficient antialiasing for large shrink; softness | preview, modest scales |
| Bicubic / Catmull-Rom | cubic reconstruction | sharper edges | overshoot/ringing; new colors | illustration candidate |
| Mitchell-Netravali | tunable cubic compromise | balances ringing and blur | still continuous-tone, not categorical | high-quality general candidate |
| Gaussian | low-pass | strong anti-aliasing | excessive blur | prefilter or noisy sources |
| Lanczos | windowed sinc | high detail retention | negative-lobe ringing and halos near hard edges | photo/illustration candidate, not default grid recovery |

Mitchell and Netravali describe the cubic filter family and the tradeoff between blur, anisotropy, and ringing in their original paper ([Reconstruction Filters in Computer Graphics](https://www.cs.utexas.edu/~fussell/courses/cs384g-fall2013/lectures/mitchell/Mitchell.pdf)).

Implementation requirements:

- scale the kernel support for minification;
- precompute fixed-order coefficients;
- define boundary extension (recommended clamp for sprites, with transparent extension as an explicit option);
- use linear-light premultiplied color;
- state accumulator precision and rounding;
- do not select a SIMD/scalar/browser path at runtime unless cross-path identity has been proven.

Conventional filters are important baselines and correct for sources without a recoverable pixel grid. They do not solve pseudo-pixel structure by themselves.

## 4. Block and cell reducers

Once an output cell or inferred grid cell has a source footprint, its representative can be chosen categorically rather than by convolution.

### Coverage mean

Compute the exact coverage-weighted premultiplied linear mean. This conserves color/alpha energy and is robust to phase, but it creates intermediate colors and soft edges. Complexity is `O(N + WH)` with summed-area tables for aligned boxes, or proportional to footprint intersections for exact rational weights.

### Weighted mode

Accumulate covered source colors, optionally after a small perceptual binning step, and select the greatest coverage. It preserves existing colors and large flat regions. It fails when antialiasing splits a conceptual color across many near-colors, and it can erase a narrow feature that occupies less than half a cell.

Tie policy must be explicit. A useful order is greatest alpha-weighted coverage, lowest perceptual distance to the cell mean, then lexicographically smallest canonical RGBA.

### Scalar median and vector medoid

Per-channel medians reject outliers but can assemble an RGB triplet that never existed. A vector medoid selects the observed color minimizing weighted perceptual distance to all samples and therefore preserves an actual source color. Exact medoids are quadratic in the number of distinct colors per cell; a histogram and bounded candidate set can make them practical. Again, candidate order and ties must be fixed.

### Center/nearest sample

This is ideal only if phase and grid are correct. It is the highest-aliasing option otherwise.

### Edge-aware representative

For a cell straddling a strong boundary, choose between region representatives rather than averaging across it. A deterministic version can split the footprint by a locally fitted line or segmentation label, then select the region covering the output cell center. This preserves contrast but can move edges and needs a fixed fallback when evidence is weak. It belongs in an experimental mixel profile, not the universal base.

## 5. Detecting a real or approximate pixel grid

### 5.1 Exact constant-block factorization

For integer-upscaled true pixel art, a safe proof primitive tests divisors, phases, and independent X/Y factors and verifies that every aligned block is constant. It must return the full ordered set of valid `(sx, sy, phase_x, phase_y)` factorizations, not silently choose the largest block. A recent structure-aware scaling paper formalizes the basic block-size approach and its reversible nearest-neighbor behavior ([Structure-Aware Pixel Art Scaling via Block Size Detection](https://doi.org/10.3390/app16052314)).

This primitive proves valid constant-block factorizations, not necessarily the original logical grid. Equal neighboring logical cells erase their boundary; a uniform image and repeated/nested motifs can support many harmonic factorizations. Original-grid identification is exact only when source dimensions/scale are supplied or a stated identifiability precondition leaves one candidate. Otherwise report ambiguity and require a user choice or conservative no-op. Antialiasing, compression, texture, different cell sizes, or one contaminated sample usually leave only the trivial factorization. It should power the Exact Grid profile, not serve as the only automatic detector.

### 5.2 Period and phase evidence

For approximate grids, derive robust one-dimensional edge-energy signals. For example:

```text
Ex[x] = robust_aggregate_y distance(color[x,y], color[x-1,y])
Ey[y] = robust_aggregate_x distance(color[x,y], color[x,y-1])
```

Ignore fully transparent comparisons and alpha-weight partially visible ones. Oklab Euclidean distance is a reasonable efficient signal; CIEDE2000 is more expensive and not required for every edge sample.

For candidate period `p` and phase `phi`, compare energy at expected cell boundaries to interior energy:

```text
S(p, phi) = median(edge at positions congruent to phi mod p)
            - median(edge at other positions)
```

Normalize by median absolute deviation and require minimum coverage. Evaluate horizontal and vertical periods separately because cells may be rectangular.

Corroborate, but do not blindly trust, three signals:

- **autocorrelation:** good for repeated periods but exhibits strong multiples and harmonics;
- **FFT/periodogram:** efficient global periodicity, but leakage, cropping, and content edges can dominate;
- **run-length statistics/GCD:** excellent for exact flat art, but strongly biased by the drawing’s shapes and degenerates under noise.

Frequency plus autocorrelation has been used to make period detection more robust under contamination ([Robust Period Detection Based on Time-Frequency Analysis and Surrogates](https://doi.org/10.1145/1183614.1183774)); robust autocorrelation/periodograms also motivate downweighting outliers ([Huber periodogram and autocorrelation](https://arxiv.org/abs/2002.09535)). These are general periodicity sources, not proof that the proposed image-grid score is optimal.

Candidate selection should penalize unsupported harmonics and prefer the shortest plausible fundamental only when it explains comparable evidence. Report a confidence based on peak separation, phase consistency, and image coverage. If confidence is low, do not claim a grid.

### 5.3 Tile consensus

A global signal is confused by large empty backgrounds and nonperiodic subject content. Compute candidate period/phase on overlapping tiles with enough edges, then combine them with a deterministic weighted median or RANSAC-like enumeration. Enumeration should be sorted and exhaustive over a bounded candidate list—no unseeded random sampling. Consensus dispersion is part of the confidence.

### 5.4 Irregular grid snapping: experimental design

AI pseudo-pixel art often has locally shifted or stretched cells. A single period/phase cannot describe it. One possible deterministic formulation is to solve for monotone vertical boundary coordinates `b_0...b_W` and horizontal coordinates `c_0...c_H` that guarantee the requested logical cell count. Minimize:

```text
E(boundaries) =
    - lambda_edge * boundary-edge evidence
    + lambda_size * deviation from rational ideal cell size
    + lambda_smooth * second-difference curvature
    + lambda_gap * penalties for illegal/minimum gaps
```

Dynamic programming can optimize each axis over a bounded displacement band around rational ideal positions only when the target cell count does not exceed the corresponding basis length and every gap is at least one source sample. Upscaling occurs after reconstruction through an explicit route; zero-width cells are forbidden. With basis length `L`, target cells `C`, and displacement band `D`, bound work to `O(L*C*D)` and memory to a declared rolling-table budget; otherwise use a typed fallback. A two-dimensional refinement can alternate axes or optimize tiled phase fields with continuity penalties. Tie-break by lexicographically smallest boundary sequence. Each resulting cell is then reduced by weighted mode, medoid, mean, or edge-aware selection.

This method has valuable properties: exact target cell count, monotonic nonoverlapping cells, controllable regularity, and deterministic selection. It also has serious risks: independent x/y boundaries cannot express curved cells; strong subject edges can masquerade as grid lines; the target dimension may force boundaries unrelated to the source; and alternating optimization may settle in a poor local solution. It is an **experiment proposal**, not a state-of-the-art claim.

### 5.5 Candidate-ensemble recommendation for mixels

Instead of betting on one detector, generate a small bounded set:

1. rational area mean baseline;
2. rational perceptual medoid baseline;
3. best global period/phase with categorical cells;
4. nearby period/phase alternatives;
5. irregular-boundary DP cells;
6. optional superpixel-assisted representative.

Score each with fixed weights on grid regularity, source edge alignment, silhouette/topology change, orphan count, palette error, and reconstruction error after nearest enlargement. Select the lowest score; ties resolve by candidate type/version then serialized parameters. Profile/version metadata must include all score weights. Whether this ensemble correlates with artist preference is a benchmark question.

## 6. Segmentation and content-aware methods

### Superpixels

SLIC clusters in color/position space and produces compact, approximately uniform superpixels; controls include region size, compactness/ruler, and iteration count ([OpenCV SLIC documentation](https://docs.opencv.org/3.4.20/df/d6c/group__ximgproc__superpixel.html)). It can stabilize representatives inside coherent areas and prevent averaging across a strong edge. However, its irregular regions do not directly match square output pixels, and initialization, connectivity enforcement, color space, iterations, and tie handling must be pinned.

Felzenszwalb-Huttenlocher graph segmentation is near-linear and merges regions using evidence relative to internal variation ([Efficient Graph-Based Image Segmentation](https://www.cs.cornell.edu/dph/papers/seg-ijcv.pdf)). It is attractive for region-aware voting and cleanup, but its scale parameter changes the meaning of a region and it does not solve exact rectangular output geometry.

The recommended role for segmentation is advisory: constrain which colors may represent a cell, protect a silhouette/outline, or produce an edge map. Do not emit irregular superpixels as if they were a pixel grid.

### Seam carving

Seam carving removes or inserts connected low-energy seams and therefore reaches exact dimensions while trying to preserve salient content ([Seam Carving for Content-Aware Image Resizing](https://cs.brown.edu/courses/cs016/static/files/docs/seamcarving_original_paper.pdf)). For sprites it can change proportions, move limbs, break outlines, duplicate seams, and destroy topology. It is the wrong default for faithful pixel-art conversion.

It also has a legal risk independent of code license: US7477800B2 covers content-aware image resizing and is listed with an anticipated 2027-03-06 expiration ([Google Patents record](https://patents.google.com/patent/US7477800B2/en)). Jurisdiction, claims, and expiration require counsel before shipping any seam-carving feature. Exclude it from the initial MIT core.

### Vectorization/depixelization

Kopf and Lischinski’s method infers topology and spline contours to magnify existing pixel art ([Depixelizing Pixel Art](https://doi.org/10.1145/1964921.1964994)). It is important evidence that diagonal connectivity and topology matter, but its goal is smooth/vector enlargement, not reducing arbitrary art into a square grid. Its topology ideas may inform guards; it should not be transplanted as the default pipeline.

## 7. Color quantization landscape

Quantization has four separable decisions: sample weighting, palette construction, mapping to the palette, and optional dithering. Paul Heckbert’s median-cut work already describes the pipeline in these terms ([Color Image Quantization for Frame Buffer Display](https://publications.ri.cmu.edu/color-image-quantization-for-frame-buffer-display)).

### 7.1 Sample representation and weights

- Ignore RGB when alpha is zero.
- Weight visible samples by a documented alpha function, for example `w=(alpha/255)^gamma`; default `gamma=1`.
- Convert to the chosen metric space before clustering. Oklab is simple and modern ([Oklab derivation](https://bottosson.github.io/posts/oklab/)); CIELAB and CIEDE2000 remain useful for final reporting ([CIEDE2000 implementation notes and test pairs](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/)).
- Treat alpha separately by default. Reserve a transparent palette index for indexed output, and expose alpha-level quantization only as an advanced option.
- Reserve slots for user-locked colors. Locked centers participate in assignment but are never moved; if there are more unique locks than slots, fail clearly.

### 7.2 Algorithm comparison

| Algorithm | Deterministic form | Cost | Strengths | Failure modes / controls |
|---|---|---:|---|---|
| Median cut / MMCQ | integer histogram, fixed split and tie rules | roughly `O(B log B + N)` | simple, fast, explainable | allocates by box range/count rather than final perceptual error; weak on rare accents |
| Octree | fixed traversal and collapse ties | `O(N * depth)` | streaming, bounded memory | order/collapse bias; RGB geometry; abrupt palette changes |
| Wu | integer 3-D moments, fixed box-choice ties | near histogram-linear plus box splits | fast variance-oriented global palette; strong initializer | RGB-bin resolution; alpha/perceptual adaptation required |
| k-means / Lloyd | fixed seeds, traversal, reductions, empty-cluster rule, max iterations | `O(N*K*I)` | refines directly for selected metric; supports locks | local minima; randomized k-means++; floating reduction/order divergence |
| NeuQuant | fixed sampling order, schedule, and seed | training-dependent | can cover gradients with a compact network | input-order/training sensitivity; implementation provenance varies |
| libimagequant | library pins its algorithm/version | optimized | very strong practical PNG quantization and dithering | GPL/commercial terms are not approved for the current production artifact without a distribution decision or commercial arrangement |
| spatial color quantization | fixed initialization/order | high | jointly optimizes palette and perceived halftone | deliberately introduces texture; expensive; poor clean-pixel default |

Heckbert is the primary median-cut reference. Purgathofer and Prikryl describe a simple octree method ([A Simple Method for Color Quantization](https://www.cg.tuwien.ac.at/research/publications/1988/purgathofer-1988-simple/)). Xiaolin Wu’s variance-minimizing orthogonal bipartition is represented online by a widely mirrored C implementation whose header identifies Wu as author ([mirrored Wu color quantizer source](https://gist.github.com/bert/1192520)); provenance and license still require review before copying code. k-means++ improves seed choice but is randomized unless the seed and sampler are fixed ([k-means++ publication](https://research.google/pubs/k-means-the-advantages-of-careful-seeding/)). Spatial color quantization optimizes a spatially perceived result rather than clean categorical pixels ([On Spatial Quantization of Color Images](https://doi.org/10.1109/83.841942)).

### 7.3 Recommended palette candidate

A promising initial algorithm is:

1. Build a deterministic alpha-weighted histogram.
2. Insert user-locked centers and reserve their slots.
3. Use Wu partitions to initialize remaining centers.
4. Convert centers/samples to Oklab and run a fixed number of weighted Lloyd iterations.
5. Resolve equal distances by locked status, lower palette index, then lexicographic RGBA.
6. For empty clusters, select the currently highest weighted-error histogram bin, with lexicographic ties.
7. Convert centers to canonical sRGB using a fixed rounding policy; merge duplicates deterministically and refill if required.

This combines Wu’s speed/stability with direct perceptual refinement and lock support. It is not yet proven superior to `quantette`’s built-in Wu/k-means variants. Benchmark both before implementation selection. For the strictest cross-platform contract, consider fixed-point Oklab tables or prove that the pinned Wasm scalar floating path produces identical discrete decisions on the support matrix.

### 7.4 Palette-size semantics

State whether transparency counts. Recommended UI wording: “visible colors” excludes the fully transparent entry, while export metadata reports both visible and total entries. “Maximum 16 colors” should not unexpectedly mean 15 visible colors plus transparency.

## 8. Dithering

Dithering is not synonymous with quality. In small pixel art it frequently creates the exact orphan noise the product is meant to avoid. Default to **none**, and make dithering a separate mapping option after the palette is fixed.

| Family | Determinism requirements | Advantages | Pixel-art risks |
|---|---|---|---|
| Ordered Bayer | fixed threshold matrix, scale, phase | parallel, exact, compact, controllable | visible periodic crosshatch |
| Fixed blue-noise threshold | bundled matrix with audited license, fixed phase/rotation | less obvious low-frequency pattern | asset provenance; still introduces isolated pixels |
| Floyd-Steinberg | scan direction, serpentine policy, fixed-point error, boundary policy | classic good average-tone preservation | directional worms and speckle; serial |
| JJN / Stucki / Sierra / Atkinson | exact coefficients/divisors and scan | selectable texture/spread | more neighbors and noise; style-specific |
| Riemersma/Hilbert traversal | precise curve, padding, orientation, error queue | reduces obvious scan-line direction | complexity; implementation/provenance audit required |

The original Floyd-Steinberg citation is cataloged at [An Adaptive Algorithm for Spatial Greyscale](https://isgwww.cs.uni-magdeburg.de/~stefans/npr/entry-Floyd-1976-AAS.html). Bayer’s ordered approach is cataloged with the original publication at [NDL Search](https://ndlsearch.ndl.go.jp/en/books/R100000136-I1570009749134624128). Variable-coefficient error diffusion is a further research option, but code/coefficients must receive a patent and license review before adoption ([Ostromoukhov paper](https://perso.liris.cnrs.fr/victor.ostromoukhov/publications/pdf/SIGGRAPH01_varcoeffED.pdf)).

For all error diffusion, use fixed-point error buffers, define clipping, and prevent error carried from alpha-zero samples from coloring transparent output. An optional edge-gated ordered dither at low strength is a better first advanced control than enabling full diffusion automatically.

## 9. Deterministic background removal

Background removal is appropriately a separate tab because it changes alpha and requires different user intent from resize. The feature can be deterministic without being universally semantically correct.

### BG-A: exact color key

Remove pixels whose canonical RGBA or RGB equals a selected key. This is `O(N)`, exact, and excellent for flat exported backgrounds. It leaves antialiased fringes and can remove same-colored subject pixels. Controls: compare RGB or RGBA, affect connected border only or all matches, replacement alpha.

### BG-B: perceptual tolerance key

Remove pixels within an Oklab or CIEDE2000 threshold of one or more sampled colors, optionally modulated by alpha. This handles compression and gradients but can erase subject colors. The threshold, metric, and inclusive/exclusive comparison must be settings.

### BG-C: border flood fill

Seed all border pixels that match a key/tolerance and traverse with explicit 4- or 8-connectivity. Fix seed ordering and neighbor order. Border connectivity avoids deleting enclosed same-color subject areas, but it cannot remove enclosed background holes and fails when foreground touches the canvas edge. Offer “remove enclosed matching regions” separately.

### BG-D: connected-component rules

Label candidate background components, then remove those touching selected borders or satisfying a size/location policy. Define connectivity and component ties. This is valuable cleanup around a key, not a semantic detector.

### BG-E: seeded graph cut / GrabCut

GrabCut iteratively fits foreground/background Gaussian mixture models and solves graph cuts from a rectangle or mask of sure/probable classes ([original GrabCut paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2004/08/siggraph04-grabcut.pdf), [OpenCV tutorial](https://docs.opencv.org/4.10.0/d8/d83/tutorial_py_grabcut.html)). With explicit user seeds, fixed initialization, iteration count, graph ordering, numeric path, and tie rules it can be made operationally deterministic. It handles textured backgrounds better but is much heavier and can still be wrong.

Fully automatic non-AI removal cannot decide every image: the same pixel pattern can be foreground under one intent and background under another. The product should ask for a sampled color, border assumption, rectangle, or foreground/background strokes when ambiguity matters.

## 10. Orphan cleanup, morphology, and topology

“Remove orphan pixels” is unsafe until “orphan” is defined. A deterministic definition might be a same-color connected component smaller than `A_min` under 4-connectivity, or a pixel with no same-color 4-neighbor. Both classify legitimate eyes, sparks, and highlights as noise.

Available operations include:

- majority/rank filter in a fixed neighborhood;
- connected-component removal/reassignment below a size threshold;
- morphological opening/closing on alpha or palette classes;
- palette-label energy minimization using color error plus neighbor disagreement;
- edge-aware reassignment that protects strong silhouettes and outlines.

A conservative reassignment can evaluate each candidate palette label:

```text
E(label) = lambda_color * perceptual_error
         + lambda_neighbor * disagreeing_neighbors
         + lambda_edge * crossed_protected_edges
```

Tie-break by current label, then palette index. Before committing a relabel, compare topology of protected masks. Euler characteristic—components minus holes—provides a compact guard, but connectivity must be paired consistently (for example 4-connected foreground with 8-connected background). Also track component and hole counts directly.

Cleanup should be off by default. Automatic mode may propose it only at high confidence and should retain an undoable before/after. A one-pixel feature is not noise merely because a statistic calls it unusual.

## 11. Browser and WebAssembly implementation landscape

The table reports declared upstream licensing, not legal advice. Every selected release and all enabled transitive features still require an SBOM and source/license-notice audit.

| Component | Role | Declared license / SPDX | Fit and risk |
|---|---|---|---|
| [`image`](https://github.com/image-rs/image) | Rust decoding/encoding/basic resize | `MIT OR Apache-2.0` | good core for common formats; pin features/codecs; not a complete ICC color-management system |
| [`fast_image_resize`](https://github.com/Cykooz/fast_image_resize) | high-performance Rust/Wasm resize | `MIT OR Apache-2.0` | strong SIMD support and explicit alpha/color helpers; it does not linearize automatically; current repository notes a Rust/LLVM Wasm SIMD alpha-divide regression, so pin/test scalar and SIMD |
| [`quantette`](https://github.com/ivordir/quantette) | Wu and k-means quantization; RGB/Lab/Oklab | `MIT OR Apache-2.0` | promising modern candidate; optional SIMD/parallel paths need determinism tests and pinned settings |
| [`exoquant`](https://github.com/exoticorn/exoquant) | quantization/dithering | `MIT` | useful benchmark/reference; old and its gamma story needs review before production |
| [`rscolorq`](https://github.com/okaneco/rscolorq) | spatial color quantization | `MIT OR Apache-2.0` | experimental high-quality halftone profile; expensive and intentionally noisy; audit provenance of ported algorithms |
| [`image-q`](https://www.npmjs.com/package/image-q) | TypeScript quantizers/distances/dithers | `MIT` | excellent browser benchmark surface; older release and inherited algorithm notices/provenance should be audited |
| [`pica`](https://github.com/nodeca/pica) | browser resize | `MIT` | polished baseline, but runtime selection among JS/Wasm/worker/browser paths conflicts with strict identity unless one path is forced |
| [Little CMS](https://github.com/mm2/Little-CMS) | ICC transforms | `MIT` | mature color management; C-to-Wasm integration and profile attack surface add size/complexity |
| [libpng](https://github.com/pnggroup/libpng) | PNG codec | `Libpng-2.0` | focused mature decoder; brings zlib and C/Wasm build work |
| [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) | JPEG codec | file/component-specific `IJG`, `BSD-3-Clause`, and `Zlib` terms | fast and mature, but do not flatten its multi-license notices into one casual “BSD” label |
| [libwebp](https://github.com/webmproject/libwebp) | WebP codec | `BSD-3-Clause` plus patent grant | mature; pin decoder path/options and retain notices |
| [OpenCV](https://github.com/opencv/opencv) | GrabCut, segmentation, morphology; custom OpenCV.js | `Apache-2.0` for modern releases | feature-rich but very large; SLIC is in contrib and may require custom build; algorithm patents remain separate from code license |
| [Leptonica](https://www.leptonica.org/) | quantization, morphology, components | current `BSD-2-Clause`; old SPDX identifier/history should be checked per release | broad C toolkit; custom Wasm and a larger surface than bespoke primitives |
| [ImageMagick](https://imagemagick.org/license/) | comprehensive codec/resize reference or server tool | `ImageMagick` | permissive custom license, huge dependency and security surface for browser Wasm |
| [GraphicsMagick](https://graphicsmagick.sourceforge.io/index.html) | image processing reference | project describes MIT/X11-style terms | similarly broad/heavy; audit the exact release and bundled codecs |
| [`wasm-vips`](https://github.com/kleisauke/wasm-vips) / [libvips](https://github.com/libvips/libvips) | high-throughput image pipeline | wrapper `MIT`; libvips repository LGPL-2.1 family | fast, but static Wasm replacement/relinking, source, and notice obligations complicate the current distribution plan; exact bundle election must be audited; may need cross-origin isolation |
| [libimagequant/pngquant](https://pngquant.org/lib/) | premium quantizer/dither | `GPL-3.0-or-later OR LicenseRef-Commercial` | excellent quality, but not approved for the current production artifact unless the project adopts a GPL-compatible distribution or commercial arrangement ([licensing](https://pngquant.org/licensing.html)) |

### Recommended initial stack

Leading hypothesis, subject to the engine bake-off: use a small single Rust/Wasm engine:

- `image` for a deliberately limited codec set;
- `fast_image_resize` for conventional filter candidates, with explicit linearization/premultiplication outside the library;
- `quantette` for benchmarked quantizer paths or a small owned Wu/Lloyd implementation if its determinism contract is easier to guarantee;
- owned rational-area, block mode/medoid, trim, flood-fill, component, and grid-analysis primitives;
- Little CMS only if the product commits to full embedded ICC support in v1.

Keep OpenCV/Leptonica/ImageMagick/libvips out of the first client bundle unless an experiment proves their unique value. Their breadth increases download size, build variance, security surface, and transitive-license work. A native server path would undermine offline/local privacy and create another determinism target; do not add one merely for convenience.

### MIT-owned-code distribution discipline

Pixilate-owned code is intended to be MIT. That does not require every third-party byte to use MIT; it requires the exact distributed combination to retain and satisfy every approved third-party term, notice, source/relink, patent, asset, and codec obligation.

- Pin exact releases and enabled features in a lockfile.
- Generate an SBOM and third-party notices from the actual release artifact.
- Scan source and generated Wasm/object inputs, not only package manifest labels.
- Preserve attribution/license text required by permissive dependencies.
- Treat algorithm patents and data/threshold-matrix copyright separately from code license.
- Pixilate-owned code remains MIT; reject dependencies whose combination/distribution obligations are incompatible with the currently approved production bundle unless the project deliberately changes release terms or obtains a suitable commercial license.
- Obtain legal review for LGPL static/Wasm distribution, codec patents, seam carving, and copied reference code.

## 12. Cross-browser determinism contract

WebAssembly improves portability but does not automatically make every program bit-identical. The core spec defines IEEE-754 operations, while NaN payload/sign choices can be nondeterministic; relaxed SIMD explicitly permits implementation variation ([WebAssembly Core Specification](https://www.w3.org/TR/wasm-core/)). Toolchains can also change code generation.

The engine contract should require:

1. **Canonical configuration.** Serialize a versioned config with sorted fields: engine version, decoder set/version, profile ID/version, orientation/color policy, trim threshold, target geometry, algorithm parameters, seed, tie policy, and encoder version.
2. **One processing implementation.** Do not silently switch among canvas, JS, scalar Wasm, SIMD, GPU, and native codecs. If SIMD is enabled, prove identical pixel hashes or version it as a distinct engine.
3. **Stable traversal and sorts.** Row-major iteration, stable total ordering, explicit neighbor order, and lexicographic ties.
4. **Deterministic randomness.** Prefer exhaustive bounded choices. Where sampling is necessary, use a specified PRNG and seed stored in metadata.
5. **Deterministic reductions.** Avoid unordered thread/atomic reductions. Use fixed trees or serial sums. Integer histograms and fixed-point accumulators are preferable at decision boundaries.
6. **Finite numeric domain.** Reject/avoid NaN and infinity; do not compile decision-critical code with fast-math or relaxed SIMD.
7. **Fixed stopping.** Specify iteration counts or exact convergence thresholds plus maximums; specify empty-cluster and graph-cut ties.
8. **Domain-separated identity.** Define byte schemas for `pixilate/source-bytes/v1`, `pixilate/canonical-rgba/v1` (tag, dimensions, row-major RGBA8 only), `pixilate/palette/v1`, `pixilate/semantic-result/v1`, `pixilate/recipe-input/v1`, `pixilate/recipe-result/v1`, and `pixilate/encoded-file/v1`. Palette identity is separate from RGBA identity; recipe-input identity omits derived result/file hashes. Never embed an encoded-file hash inside the file it hashes. Promise byte-identical PNG only after pinning filter selection, compression library/version/level, chunk set/order, timestamps, and metadata.
9. **Versioned evolution.** Better algorithms create a new profile/engine version. Old versions remain selectable or reproducible from metadata where practical.
10. **Conformance matrix.** Golden hashes on Chrome, Firefox, Safari, and Edge across x86-64 and ARM64; compare scalar and any SIMD build; include alpha/color-profile fixtures.

If strict identity is more important than availability, an unsupported browser should fail with a clear message instead of quietly falling back to a different algorithm.

## 13. Complexity, artifacts, and user-control matrix

Let `N` be decoded source pixels, `M=W*H` output cells, `K` palette size, `I` iteration count, and `B` nonempty histogram bins.

| Stage / method | Typical time | Extra memory | Characteristic artifact | Essential control |
|---|---:|---:|---|---|
| exact trim scan | `O(N)` | `O(1)` | clips faint alpha if threshold high | alpha threshold, padding |
| rational area resize | `O(N+M)` to footprint-dependent | rows/coefficients | blur/new colors | boundary, linear-light toggle only as expert legacy option |
| separable cubic/Lanczos | `O(N + M*r)` | coefficient tables/rows | ringing or softness | kernel, radius where valid |
| exact block proof | `O(N*d)` worst over tested divisors | small | returns no grid under one contaminated sample | equality/tolerance mode |
| edge/autocorr/FFT grid | roughly `O(N + L log L)` | edge signals | harmonic/wrong texture lock | period range, confidence threshold, phase |
| irregular boundary DP | `O((W+H)*L*band^2)` design-dependent | DP tables | warped cells/content-edge attraction | regularity, displacement band |
| weighted mode | `O(N)` plus histograms | per-cell bins | loses minority thin detail | perceptual bin radius, tie mode |
| medoid | up to `O(M*q^2)` distinct samples | candidate bins | may retain noisy observed colors | candidate cap, metric |
| SLIC advisory | about `O(N*I)` | labels/centers | region boundary bias | region size, compactness, iterations |
| seam carving | roughly seams × pixels | energy/backpointers | geometric/topological distortion | intentionally excluded initially |
| Wu quantizer | histogram/moment dominated | fixed 3-D moments | binning bias | bins, metric adaptation |
| Lloyd refinement | `O(B*K*I)` | centers/assignments | local minimum | iterations, seed, locked colors |
| ordered dither | `O(M*K)` mapping-dependent | matrix | repeated pattern | matrix, strength, phase |
| error diffusion | `O(M*K)` mapping-dependent | error rows | worms/orphans/directionality | kernel, scan, strength |
| flood-fill background | `O(N)` | visited/queue | misses enclosed background | tolerance, connectivity, seeds |
| components/morphology | `O(N)` | labels/queue | destroys small intentional features | connectivity, min area, guard |
| GrabCut | iterative GMM + min-cut | graph/models | seed/model failure | rect/mask, iterations |

Controls should be progressive. Basic mode needs target width/height, Trim, aspect behavior, palette count/preset, and profile. Advanced mode can expose grid period/phase/confidence override, reducer, kernel, perceptual metric, alpha weight, locked colors, dither, cleanup, and background connectivity. Debug mode should display inferred grid/cells, score components, palette assignments, and warnings.

## 14. Recommended profiles

### A. Exact Grid Recovery

Use when the source was nearest-neighbor enlarged or already true pixel art.

1. Normalize decode/color/alpha.
2. Enumerate exact constant-block factorizations; accept supplied logical dimensions/scale or a user period/phase choice.
3. Recover one logical sample per uniquely identified or explicitly selected block; otherwise report ambiguity and conservatively no-op/refuse the recovery claim.
4. Crop/pad/replicate with an explicit grid-safe target policy.
5. Preserve the existing palette unless the user requests quantization.
6. No dither, no cleanup.

This profile should be lossless for instructed or uniquely identifiable reversible fixtures. A valid factorization is not evidence that invisible original boundaries were identified.

### B. AI Pseudo-Pixel / Mixel Reconstruction

Use when cells are suggested but inconsistent.

1. Estimate global/tiled periods and phase with confidence.
2. Generate bounded spatial candidates: area, medoid, global-grid categorical, irregular DP, optional segmentation-assisted.
3. Score with a versioned multiobjective function.
4. Select deterministically and show the inferred grid overlay.
5. Quantize with a perceptual palette only after spatial selection.
6. Default no dither and no destructive cleanup; offer guarded orphan cleanup separately.

This is Pixilate’s main research frontier. The score and candidates need a labeled corpus and artist evaluation.

### C. HD Illustration / Photo Abstraction

Use when no source grid is credible.

1. Linear-premultiplied scale-aware area/Mitchell/Lanczos candidates.
2. Exact target geometry.
3. Wu-initialized Oklab Lloyd palette with locks.
4. No dither by default; optional ordered or fixed-point diffusion.

This does not “recover pixels”; it deliberately creates a pixel-scale rendition.

### D. Manual Raster / Line Art

Use edge-aware medoid/mode cells, protect alpha silhouettes and likely outline classes, and heavily penalize topology changes. No automatic majority filter. Allow the artist to lock outline/background colors.

### E. Background Removal

Run independently: exact/tolerance key, border flood, component rules, then seeded GrabCut as increasing tiers. It writes alpha. Trim subsequently uses the new alpha mask.

## 15. Benchmark and validation plan

### 15.1 Corpus strata

Build a license-safe, redistributable corpus with provenance:

1. **Synthetic reversible:** authored low-resolution sprites enlarged by known integer factors, phases, nonuniform replication, rotations/orientation tags, controlled antialiasing, blur, JPEG/WebP compression, noise, and gradients. Ground-truth cells and palette are exact.
2. **True/manual pixel art:** artist-consented sprites across outline styles, transparency, one-pixel features, tiles, and non-square cells.
3. **AI pseudo-pixel/mixels:** outputs from multiple generators and prompts, including grid-like, painterly, and substantially inconsistent cases. Store exact service/model/terms/provenance; prompts alone are not provenance. Do not commit or redistribute an output unless its specific output terms, depicted intellectual property, privacy/publicity rights, and redistribution grant have been reviewed and recorded.
4. **HD illustration/photo:** characters, icons, line art, painted art, photographs, and UI graphics with no expected grid.
5. **Alpha/color torture:** hidden RGB, semitransparent outlines, ICC profiles, gamma chunks, EXIF orientations, indexed transparency, fully transparent images.
6. **Background cases:** flat, antialiased, compressed, textured, foreground touching border, holes, shadows, and foreground sharing background colors.

Split development and held-out test sets by source image and artist/prompt family to prevent parameter tuning on near-duplicates.

### 15.2 Hard invariants

Every output must satisfy:

- exact requested dimensions;
- palette size semantics and locked colors;
- alpha-zero canonical RGB policy;
- no out-of-bounds/overflow on hostile sizes;
- reproducible normalized-pixel hash across supported platforms;
- exact round-trip recovery on instructed/uniquely identifiable block-enlarged fixtures where the profile claims it, plus complete ordered factorization and ambiguity reporting on uniform/equal-adjacent/harmonic fixtures;
- no unreported fallback or profile change.

### 15.3 Quality metrics

No one metric is sufficient.

- logical-pixel accuracy and grid period/phase error on synthetic truth;
- palette assignment accuracy and locked-color retention;
- Oklab and CIEDE2000 mean/percentile/max color error;
- alpha IoU, boundary F1, and halo error after compositing on multiple backgrounds;
- gradient/edge precision-recall or symmetric Chamfer distance;
- components, holes, Euler-characteristic delta, and thin-feature survival;
- orphan-component count and same-color run-length regularity;
- reconstruction error after nearest-enlarging the result to the aligned source;
- SSIM only as a supplementary aligned continuous-tone metric; it can reward blur ([original SSIM paper](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf));
- runtime median/p95, peak memory, Wasm bundle bytes, and cancellation latency;
- pairwise human preference, stratified by professional pixel artists, game developers, and general users.

Human evaluation should ask separate questions—silhouette, grid cleanliness, palette, important details, and overall usefulness—rather than one unexplained score. Record whether evaluators see target-size output at native scale and enlarged nearest-neighbor scale.

### 15.4 Experiment backlog, in decision order

| Priority | Experiment | Candidates | Decision gate |
|---:|---|---|---|
| P0 | Decode/color/alpha conformance | `image`; C decoders; optional Little CMS | identical canonical fixture hashes and correct orientation/profile/alpha behavior |
| P0 | Conventional resize baseline | exact area, Mitchell, Lanczos3, Catmull-Rom, nearest | quality/runtime/halo Pareto set; no cross-platform hash drift |
| P0 | Constant-block factorization | divisor/phase proof, instructed scale, ambiguity cases; tolerance and run-length methods are approximate comparators | 100% valid-factorization enumeration; 100% original-grid identification only on instructed/uniquely identifiable cases; characterized contamination threshold |
| P0 | Quantizer bake-off | Wu, quantette Wu/k-means, custom Wu+Lloyd, exoquant, image-q, libimagequant as research oracle under applicable terms | perceptual/palette/human score vs runtime, reproducibility, license |
| P1 | Global approximate grid | edge-boundary score, autocorrelation, FFT, run lengths, ensemble | period/phase accuracy and calibrated confidence on synthetic corruptions |
| P1 | Cell representative | mean, exact-color mode, perceptual-binned mode, medoid, center | edge/detail/topology and artist preference by corpus stratum |
| P1 | Mixel candidate scorer | weighted sum versus lexicographic constraints; reconstruction score | held-out human rank correlation without systematic profile regressions |
| P1 | Irregular-boundary DP | bands, regularity/curvature weights, axis alternation | beats global-grid and rational baselines on held-out mixels at acceptable cost |
| P1 | Dither | none, Bayer, fixed licensed blue noise, fixed-point FS/Sierra/Atkinson | explicit style benefits; no default orphan regression |
| P1 | Background primitives | exact/tolerance key, border flood, components | alpha IoU/boundary and predictable failure messaging |
| P2 | Segmentation advisory | SLIC, graph segmentation, none | material mixel/line-art improvement justifies size/complexity |
| P2 | Cleanup/topology guard | component energy, majority, morphology | artists prefer it, topology regressions bounded, default remains conservative |
| P2 | Seeded GrabCut | OpenCV/custom graph cut | quality gain justifies bundle/license/build cost |
| P3 | Expanded codecs | AVIF then HEIC research | deterministic decoder and acceptable patent/license/security review |

Every experiment should save the full configuration, engine build hash, candidate outputs, component scores, pixel hashes, runtime, and corpus license/provenance. Do not tune against only attractive examples.

## 16. Product and architecture implications

- Keep Resize/Pixelate, Quantize/Palette, and Background Removal separate but composable. The processing recipe can chain them explicitly.
- Always ask for or show exact target dimensions. This is a core invariant, not an advanced feature.
- Make Trim’s alpha threshold inspectable and preview its ROI.
- Name profiles by source condition, not mysterious quality tiers.
- Show grid overlays and confidence; low confidence should fall back to the no-grid profile or ask the user.
- Preserve nondestructive recipes and source bytes; exports include engine/profile metadata where the format permits.
- Let users lock colors, import a palette, preserve source palette, and define whether transparency counts.
- Keep automatic cleanup and dithering conservative.
- Prefer one local Wasm engine for privacy, reproducibility, and offline use.
- Version results. An algorithm improvement should not silently change an old saved recipe.

## 17. Open research questions

1. Does a boundary-energy DP actually outperform rational-cell medoids and global-grid snapping on AI mixels?
2. Which automatic score correlates with pixel-artist judgments without overfitting a generator or style?
3. Should spatial reduction precede quantization for every profile, or do jointly optimized categorical colors preserve small features better?
4. Is Oklab Euclidean distance adequate at 16–32 colors, or does CIEDE2000 improve choices enough to justify cost and complexity?
5. Can fixed-point Oklab and filter coefficient tables preserve quality while making strict determinism easier to audit?
6. What confidence threshold should distinguish recoverable grid, mixel, and no-grid input?
7. Which topology masks—alpha silhouette, dark outline, palette classes—best protect intentional one-pixel features?
8. Can a small owned seeded graph-cut implementation outperform the bundle cost of OpenCV.js?
9. Which input formats and ICC cases are necessary for “widest support” in the first release without compromising the determinism contract?
10. What output metadata schema will make a result reproducible years later when browsers and codecs have changed?

## Recommended next planning decision

Before designing the complete application, build a headless research harness around three vertical baselines:

1. exact grid proof plus categorical reduction;
2. rational linear-premultiplied area reduction plus Wu/Oklab palette;
3. global-grid and irregular-boundary mixel candidates with a provisional score.

Run them on the synthetic corpus first, then a blinded artist-rated mixel subset. This establishes whether Pixilate’s differentiator is algorithmically real. Only after that evidence should the project lock the default profile, advanced settings, or any claim that its automatic mode is “the most accurate.”

## Primary references

- W3C, [Portable Network Graphics (PNG) Specification, Third Edition](https://www.w3.org/TR/png-3/).
- WHATWG, [HTML Living Standard: ImageBitmap](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html).
- W3C, [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/).
- W3C, [Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/).
- W3C, [WebAssembly Core Specification](https://www.w3.org/TR/wasm-core/).
- Mitchell and Netravali, [Reconstruction Filters in Computer Graphics](https://www.cs.utexas.edu/~fussell/courses/cs384g-fall2013/lectures/mitchell/Mitchell.pdf).
- Heckbert, [Color Image Quantization for Frame Buffer Display](https://publications.ri.cmu.edu/color-image-quantization-for-frame-buffer-display).
- Purgathofer and Prikryl, [A Simple Method for Color Quantization](https://www.cg.tuwien.ac.at/research/publications/1988/purgathofer-1988-simple/).
- Arthur and Vassilvitskii, [k-means++: The Advantages of Careful Seeding](https://research.google/pubs/k-means-the-advantages-of-careful-seeding/).
- Achanta et al., [SLIC Superpixels Compared to State-of-the-Art Superpixel Methods](https://pzs.dstu.dp.ua/ComputerGraphics/bibl/superpixel.pdf).
- Felzenszwalb and Huttenlocher, [Efficient Graph-Based Image Segmentation](https://www.cs.cornell.edu/dph/papers/seg-ijcv.pdf).
- Rother, Kolmogorov, and Blake, [GrabCut](https://www.microsoft.com/en-us/research/wp-content/uploads/2004/08/siggraph04-grabcut.pdf).
- Avidan and Shamir, [Seam Carving for Content-Aware Image Resizing](https://cs.brown.edu/courses/cs016/static/files/docs/seamcarving_original_paper.pdf).
- Kopf and Lischinski, [Depixelizing Pixel Art](https://doi.org/10.1145/1964921.1964994).
- Wang et al., [Image Quality Assessment: From Error Visibility to Structural Similarity](https://ece.uwaterloo.ca/~z70wang/publications/ssim.pdf).

## 2026-10-19 addendum: prototype evidence and literature

This addendum leaves the 2026-07-31 text above unchanged. It adds two things: evidence from the owner-requested JavaScript research prototype in `prototype/`, and the unique content of a 2026-10-19 literature review that was folded in here and then removed.

**Engine.** The owner selected a deterministic, client-side, JavaScript-only engine (Vite + Svelte); see `OWN-001` in [product requirements §25](../../planning/product-requirements.md). That is an owner decision, not a result of the §11 comparison, and the Rust-to-WebAssembly recommendation above is superseded for the prototype, not refuted. The §12 rules still apply. JavaScript `Number` arithmetic is IEEE-754 binary64 with correctly rounded `+ − × ÷ √` and no fused multiply-add contraction, so "no transcendental `Math` in decision paths, table-driven sRGB decode, fixed Newton iterations" is the JavaScript form of §12 item 6 (INFERRED). OBSERVED (2026-10-19 probe, procedural): the prototype's sRGB → Oklab → sRGB round trip was exact on 636,056 sampled colours, also through `Float32` storage, and repeat runs were pixel-identical. Cross-engine identity is not established.

**How to read the evidence.** `D`-numbers refer to the Deviations table in the [prototype design](../../planning/prototype-algorithm-design.md#deviations); D-numbers identify decisions, not stable section IDs; D23–D36 record the 2026-10-19 revision. Every observation below is in-sample: thresholds were tuned on the fixtures that measured them, there is no held-out split or blinded panel, and none of it is benchmark evidence under the [methodology](../evaluation/benchmark-methodology.md). Fixture classes:

- *procedural*: seeded fixtures generated by `prototype/test/` (`proc-blob`, `proc-tile`, `proc-icon`, and synthetic grid, wave and palette unit fixtures). OBSERVED and reproducible from the repository.
- *showcase crop*: synthetic degradations of crops of external CC0-dedicated PixelLab showcase images (`onebit-td`, `sparks`, `ui-ring`, `mz-front`). OBSERVED, local-only, not rights-cleared, not corpus-admitted; `mz-front` is also excluded from any future admission ([artifact characterization §3.1](../evaluation/ai-artifact-characterization.md#31-external-pixellab-showcase-images-local-copy-not-tracked-here)).
- *private sample*: owner-provided AI images named only by opaque ID (`gpt-oni`, `gemini-mage`, `gpt-forest`, `unk-dungeon`, `unk-coat`, `ai-wizard`). OBSERVED, local-only, not rights-cleared.

### Prototype evidence by spike section

| Spike section | Prototype decision | What was observed | Label and caveat |
|---|---|---|---|
| §7.1, §7.3; open question 4 | D1: every decision distance uses Oklab with Ottosson's toe-corrected lightness `L_r` on a working copy; stored colours stay Oklab. | A pure-black outline with ±6 sRGB noise split into 3 palette entries in raw Oklab and 1 with `L_r` (palette unit test). Raw Oklab L is steep near black. | OBSERVED, procedural. "Toe-L is better in general" is INFERRED. This bears on open question 4 only for near-black clustering; it is not an Oklab-versus-CIEDE2000 comparison. |
| §5.2 harmonic penalty | D6: harmonic sum on a whitened line spectrum (magnitude over a local mean), weighted 1/h. | A raw harmonic sum rated multiples of the period at least as high as the period and picked 3p–4p. | OBSERVED, procedural grid tests. A concrete method for the existing "penalize unsupported harmonics" requirement. |
| §5.2 candidate selection | D7: octave guard comparing cell uniformity on each candidate's own elastic cuts; doubling also needs the doubled period spectrally qualified. | True-period line ratio ≥ 0.88 versus doubled ≤ 0.32; without the guard one soft scene doubled its period and one fine-grid sample locked an axis to half its pitch. | OBSERVED; the ratio bounds are partly from private samples (local-only, not rights-cleared). |
| §5.2 confidence; open question 6 | D8: cell step ratio (in-cell slope over one cell ÷ neighbour contrast) ≥ 0.85 → no grid. | Gridded private samples 0.12–0.69; painted control `ai-wizard` 1.00; a synthetic wave field 1.32. A smooth periodic synthetic field passed the spectral purity test alone (purity 0.34) and was rejected only by the step ratio. | Procedural part OBSERVED; real-sample part OBSERVED, local-only. Partial answer to open question 6: spectral evidence alone cannot separate grid from smooth periodic texture, and a within-cell smoothness feature can. The 0.85 cut is in-sample and `PROVISIONAL-PILOT`; three-way grid / mixel / no-grid calibration remains open. |
| §5.3 tile consensus | D10: a window counts toward agreement when the period is still qualified there; skipped below 256 px. | Mixel windows lock to half cells; small images have too few windows. | OBSERVED. A minimal tile consensus, not the full design. |
| §5.1 exact factorization | The prototype's exact fast path scanned square factors from large to small and took the first. | A uniform 128² input was reported as "native 2×2"; 2×2 equal-adjacent art upscaled ×2 was reported as factor 4; independent sx = 2 / sy = 3 was not found. | OBSERVED, procedural probe (2026-10-19). Negative evidence that confirms §5.1: the coarsest valid factor is not a recovery. Replaced by separable per-axis enumeration with an ambiguity flag (design D26). |
| §10 topology guard | D13: a cell whose inset pixels share one exact RGB (or is fully transparent) is `pure`, and cleanup never changes a pure cell. | Clean nearest-neighbour inputs were 100 % pure, AI-like presets 0–4 %. Sparse-spark recall (G8) 0.73 → 1.00; UI ring 0.92 → 0.99. | OBSERVED on synthetic presets that include showcase crops (`sparks`, `ui-ring`), local-only. A cheap exact protected-feature mask. It guards exact evidence; it does not check Euler number, holes or components, so it complements rather than replaces a topology guard. |
| §9 BG-B tolerance | D15: border-background match tightened from ΔEOK 0.06 to 0.03; a drop-shadow allowance was tried and reverted. | 0.06 removed pale subject ink (`proc-icon` IoU 0.64 → 1.00 at 0.03). The shadow allowance deleted light-grey hair on a private GPT sample. | OBSERVED (procedural; the hair case local-only). Negative result: "darker than background" is not a safe shadow rule. |
| §9 BG-C, failure taxonomy | D16: refuse automatic border removal when more than 2 % of border cells stay opaque after the fill (floating-subject check). | Automatic removal keyed out opaque tiles and 1-bit art; with the check, `onebit-td` IoU 0.129 → 1.000. | OBSERVED on a showcase crop, local-only. A concrete refusal rule for "subject touches the border"; the refusal must be reported, never silent (§15.2). |
| §2.3 grid-safe sizing; §4 edge-aware representative | D17: reduce native cells to the target by exact fractional coverage of native palette indices, with tone groups, a salience claim for high-contrast thin features (one cell per crossing), and gap bridging. | On unblinded author-side contact sheets of private samples, 16 of 18 cases looked better than the previous rows (orphans on one 32 px case 42 → 9; outline coverage 0.39 → 0.76 on another). | OBSERVED, local-only, not rights-cleared, unblinded. A candidate method for §2.3, not evidence of superiority. Its closed 1-px outline rebuild is a separable style pass (§10 and the [background cleanup spike](border-connected-background-cleanup-spike.md) Candidate C) and must be split out, switchable and reported before promotion. |
| §4 mean versus medoid | D18: trimmed mean (top and bottom 20 % by L dropped) of the heaviest leader cluster instead of its medoid; pure cells keep their exact colour. | Palette-collapse cells 9.2 % → 6.4 % on `gpt-image-like`; snapped exact match −0.4 to +4.3 points per AI-like preset. | OBSERVED on synthetic presets over procedural and showcase sprites (local-only). An Oklab mean is a categorical mixel reducer, not the linear-light fidelity reducer of §1.4. |
| §7.3 merge threshold | D19 (negative): a noise-adaptive merge radius `clamp(2.5σ, 0.03, 0.045)` was tried and reverted; τ_merge stays 0.045. | Synthetic scores rose (`jpeg-heavy` 0.902 → 0.984, `gemini-like` 0.679 → 0.778) while private-sample palettes bloated (`unk-dungeon` 17 → 33, `gpt-oni` 32 → 42, `gemini-mage` 41 → 57 colours). | Synthetic part OBSERVED; real part OBSERVED, local-only. Lesson: AI-like synthetic presets can reward a change that degrades real inputs, so they cannot alone select palette defaults. |
| §9; methodology strata A/B | D20: painted-checkerboard backgrounds use ΔEOK 0.035 with chroma weighted ×2 for the checker pair, and a cell between the two checker colours is background only when all four neighbours are. | Without it the floating-subject check left whole checkerboards opaque (`proc-blob` IoU 0.219). Fake-alpha preset median IoU 0.807 → 0.869, snapped match 0.523 → 0.682; other presets unchanged. | OBSERVED on procedural and showcase sprites (local-only). Proposed new fixture stratum: transparency checkerboards painted into RGB, which users report in AI "transparent" outputs ([artifact characterization §1.3](../evaluation/ai-artifact-characterization.md#13-taxonomy)). |
| §1.1 budgets; [canonical spike](canonical-rgba-geometry-spike.md) limit fixtures | D22 caps: 16.7 MP decode limit read from PNG IHDR / JPEG SOF before decoding, target ≤ 1024, exact-palette path only at ≤ 256 colours. | 22,500 unique colours overflowed `Int16` indices and allocated K×K tables (about 4 GB); solid and 1×1 inputs came out fully transparent. A 1024² 256-colour input reduced to 1000² allocated two ~1 GB arrays (7.6 s, 2.2 GB resident). | OBSERVED, procedural. Real limit evidence for the work-budget registry; the caps are prototype values, not product limits. |

### Determinism hazards in a JavaScript engine

These extend §12 for the owner-selected engine.

- **Canvas readback is not trustworthy.** Brave adds noise to `getImageData` reads ("farbling"; [brave-browser issue 10000](https://github.com/brave/brave-browser/issues/10000)), and Firefox randomizes canvas extraction under `resistFingerprinting` ([Mozilla bug 1816189](https://bugzilla.mozilla.org/show_bug.cgi?id=1816189)). VERIFIED from the trackers, 2026-10-19. Decode PNG and JPEG with a pinned JS or Wasm decoder; a canvas decode path must be labelled non-strict (§1.1).
- **Transcendental `Math` functions are implementation-approximated.** ECMAScript leaves `Math.exp`, `Math.pow`, `Math.cbrt` and similar results implementation-dependent ([tc39 bug archive](https://tc39.es/archives/bugzilla/126/)); Firefox pinned `pow` to fdlibm after a one-ulp platform difference ([test](https://searchfox.org/firefox-main/source/js/src/jit-test/tests/basic/fdlibm-for-pow.js)). VERIFIED. Ship lookup tables as constants and compute cube roots by a fixed Newton iteration; Wasm with a bundled libm is the alternative.
- **Worker partitioning must not depend on `navigator.hardwareConcurrency`.** Floating-point sums are not associative, so use a fixed tile layout and a fixed reduction order (INFERRED; consistent with §12 item 5).
- **Budget model.** Single-threaded typed-array JavaScript runs roughly 1e8–3e8 simple operations per second, so a few-operation full-resolution pass over 1 MP costs about 5–20 ms and an r² window multiplies that (INFERRED, not benchmarked). Heavy stages belong on a reduced working image or on the recovered cell grid.

### Grid detection literature

- **Differentiate first.** Resampling forensics shows formally that a derivative prefilter strengthens the spectral lines that reveal resampling ([Dalgaard, Mosquera and Pérez-González, ICIP 2010](https://gpsc.uvigo.es/wp-content/uploads/2012/04/ON-THE-ROLE-OF-DIFFERENTIATION-FOR-RESAMPLING-DETECTION.pdf); VERIFIED). This supports the §5.2 edge profiles. The heavier forensic estimators (Popescu and Farid 2005; Kirchner 2008) target weak interpolation traces in photographs; in pseudo-pixel art the periodic signal is strong, so they add cost without new information (INFERRED).
- **A-contrario confidence.** Nikoukhah et al. validate JPEG grid votes with a number of false alarms, `NFA = N_tests · P_H0(event)`, accepting when NFA < 1 ([2018](https://mcolom.perso.math.cnrs.fr/download/articles/JPEG_grid_detection.pdf); framework VERIFIED). Applied to pixel grids (INFERRED): reduce the edge profile to seam events, count events within ±δ of each hypothesis's predicted boundaries, and use a binomial tail with `q ≈ (2δ + 1)/p`. It needs no training data and yields a calibrated "periodic beyond chance" statement for §5.2 and open question 6. Caveat: it tests periodicity, not griddedness, so brickwork and other periodic texture pass; it complements D8 rather than replacing it. JPEG grids (period 8 and its divisors) are the main false-positive source.
- **Period from incomplete events and drift.** Estimating a period from noisy event times with missing events is a studied problem with estimators near the Cramér–Rao bound ([Sidiropoulos, Swami and Sadler 2005](https://experts.umn.edu/en/publications/quasi-ml-period-estimation-from-incomplete-timing-data/)), and dynamic-programming beat tracking ([Ellis 2007](https://hajim.rochester.edu/ece/sites/zduan/teaching/ece472/reading/Ellis_2007.pdf)) has the same structure as the §5.4 irregular-boundary DP (both VERIFIED at abstract level).
- **Bias directions.** Autocorrelation and spectra favour multiples of the period; a run-length comb favours fractions of it, because runs of length kp are also multiples of p/2. Running both brackets the answer (INFERRED). Never round p before the phase search: a 0.4 % period error accumulates to half a cell over about 125 cells (arithmetic).
- **Exact divisor test.** Seo et al. ([MDPI Applied Sciences 2026](https://doi.org/10.3390/app16052314)) detect a block size n that divides the image with uniform n×n blocks; only the abstract and excerpts were readable (full text returned HTTP 403), so the procedure is UNKNOWN beyond that. It is consistent with §5.1 as an O(N) early exit and fails on any noise or non-integer size.

### Downscaling and abstraction literature

- **Content-adaptive downscaling** ([Kopf, Shamir and Peers 2013](https://www.johanneskopf.de/publications/downscaling); [pseudocode](https://johanneskopf.de/publications/downscaling/paper/pseudocode.pdf); VERIFIED from the paper and pseudocode). One kernel per output pixel: a spatial Gaussian times a colour Gaussian, fitted by constrained EM with fixed initialization (mean at the cell centre, Σ = diag(r/3)), a correction step that moves each mean halfway toward its four neighbours' mean and clamps it to ±r/4 of the centre, eigenvalue clamping of Σ, and a colour-variance increase when a dominant-kernel or staircasing test fires. The authors disabled the edge-orientation constraint for blocky pixel art and reduced palettes afterwards with mean shift. Stated limitations: symmetry is lost, aliasing is not always prevented, and it does not match hand downscaling. Deterministic, but seconds at full resolution; pre-shrinking to 3–4× the target bounds the cost (INFERRED). A candidate for §14 C, not a default.
- **Rapid detail-preserving downscaling (DPID)** ([Weber et al. 2016](https://history.siggraph.org/?p=210590)). Each output pixel averages its footprint with weights `‖I(q) − Ĩ(p)‖^λ` against a smoothed box-downscaled guide, rewarding deviation (the reverse of a bilateral filter); λ moves from a box filter (λ = 0) toward "only the most distinct pixels". The method facts come from secondary descriptions and the [BSD-3 VapourSynth plugin](https://github.com/WolframRhodium/VapourSynth-dpid/) documentation, so they are INFERRED. O(N) and deterministic; a natural "detail" control for §4 salience weighting.
- **Perceptually based downscaling** ([Öztireli and Gross 2015](https://www.cl.cam.ac.uk/~aco41/imageDownscaling.htm)) matches local mean and variance in closed form at near-linear-filter cost (abstract VERIFIED). **Patent note:** [US10325346B2](https://patents.google.com/patent/US10325346B2/en) (ETH Zurich), granted 2019-06-18, anticipated expiry 2036-07-25, status "Active" per Google Patents as read on 2026-10-19. Keep it out of any shipped engine without legal review (engineering triage, not legal advice; same posture as seam carving in §6).
- **Pixelated image abstraction** ([Gerstner et al. 2012](https://pixl.cs.princeton.edu/pubs/Gerstner_2012_PIA/index.php); VERIFIED). Alternates a modified SLIC (positional weight m = 45 instead of 10, centres moved 40 % toward their four neighbours' mean, bilateral filtering of superpixel colours on the output grid) with mass-constrained deterministic annealing of the palette in CIELAB: start from one colour at T = 1.1·T_c, cool by 0.7 per convergence, split clusters along the principal axis, stop at T_f = 1. Fully deterministic; under a minute per image on 2012 hardware, and the paper's study found artists preferred it to naive downscaling. A §6 superpixel candidate with a softer, abstracted look; selective dithering is listed as future work.
- **Thin features at small targets** (mechanism INFERRED). A one-native-pixel line covering less than half a target cell vanishes under mode or median voting, and one straddling two cells doubles under min/max pooling; both depend on phase. A top-hat ridge step that assigns exactly one output cell per line crossing removes both, but cannot keep two parallel lines closer than one target cell apart. The prototype implements this before its smoothing filter (D3); OBSERVED, procedural: without it, a 48 → 32 cell reduction and a half-cell outline left gaps in an outline ring. Contrast-aware patch selection (PixelOE, Apache-2.0) and DPID's weighting address the same failure.
- **Flattening filters** (cost INFERRED). The guided filter ([He, Sun and Tang](https://people.csail.mit.edu/kaiming/publications/pami12guidedfilter.pdf)) and a summed-area Kuwahara run in linear time regardless of radius; L0 gradient smoothing ([Xu et al. 2011](https://www.cse.cuhk.edu.hk/~leojia/projects/L0smoothing/)) yields flat regions but needs about 20 FFT iterations, so it belongs on a reduced image only. A bilateral filter at radius 5 over 1 MP is about 120 M taps and exceeds a sub-second budget.

### Palette and cleanup literature

- **Quantizer evidence.** In [Celebi 2011](https://ar5iv.labs.arxiv.org/html/1101.0395) (VERIFIED), Wu initialization of k-means gave the lowest mean MSE rank of the variants tested and was among the fastest; median cut was fastest but worst among the baselines and gained most from refinement. This supports the §7.3 Wu + fixed Lloyd candidate.
- **Automatic palette size.** Pairwise-nearest-neighbour / Ward merging ([Equitz 1989](https://research.ibm.com/publications/a-new-vector-quantization-clustering-algorithm); [Xiang and Joy 1994](https://brunl01.users.greyc.fr/GFINC/bibtex_entries/Xiang94.html?lang=fr)) is deterministic and gives a natural perceptual stop: merge while the closest pair is below τ_merge in Oklab. Elbow, silhouette, gap-statistic and BIC criteria need random resampling, quadratic cost or Gaussian clusters that pixel-art ramps are not (INFERRED). Oklab distances are about 100× smaller than CIELAB ΔE values, so thresholds must not be copied across spaces. Protect small, high-contrast clusters (eye whites, glints) from merging by distance, not size (INFERRED).
- **Fixed-palette snapping.** Mapping each cell to its nearest palette entry can collapse two source colours onto one entry and erase an outline against its fill; mapping clusters instead, with a minimum-cost assignment (Hungarian, O(K³)) and a penalty for reversing lightness order, avoids that (INFERRED).
- **Diagonal connectivity.** [Kopf and Lischinski 2011](https://johanneskopf.de/publications/pixelart) resolve crossing diagonals in 2×2 blocks with curve, sparse-pixel and island heuristics, using YUV similarity thresholds 48/255, 7/255 and 6/255 (VERIFIED). These votes can decide which diagonal survives a §10 cleanup.
- **Order independence.** Cleanup passes should read the old grid and write a new one (Jacobi-style); in-place updates make results depend on scan order, and running orphan removal before dither detection erases dithers (INFERRED).
- **Craft-aware detection, report only.** Pixel-art line rasterization conventions were studied by [Inglis and Kaplan 2012](https://diglib.eg.org/items/3468d785-2fb6-498f-8947-e1fc587f6675), and banding and pillow shading were defined and counted in [Bites 2025](https://data.4tu.nl/datasets/11446578-c1f3-474c-9cc4-6978a79b675b) (both VERIFIED at abstract level). Re-rasterizing jaggies is high-risk and belongs off by default; banding and pillow shading need artistic intent to correct (INFERRED).
- **Licences seen in this review** (engineering triage, recheck before reuse). Aseprite's source is under an EULA, so its pixel-perfect stroke rule may be described but not copied; PixelOE is Apache-2.0; libimagequant is GPL-3.0-or-later or commercial (see §11).

Learned models (Han et al. 2018, Wu et al. 2022, SD-πXL 2024) are excluded by the no-generative-AI scope; their split into cell-structure, aliasing and colour stages is a useful model for the deterministic stages only.

## 2026-10-20 refresh

**Snapshot:** 2026-10-20, web search only. The sources are in the [open-source refresh](../landscape/open-source-ecosystem.md#2026-10-20-refresh) and the [commercial refresh](../landscape/commercial-and-web-tools.md#2026-10-20-refresh).

### Literature: nothing material

Searches of arXiv, SIGGRAPH 2026, Eurographics 2026 and general paper indexes found no 2025–2026 paper on pixel-art grid recovery, pseudo-pixel repair or pixel-art downscaling beyond those already cited (Seo et al. 2026 is in the 2026-10-19 addendum).

- **General downscalers.** [arXiv:2510.22551](https://arxiv.org/abs/2510.22551) (edge-guided interpolation) and [arXiv:2510.24334](https://arxiv.org/abs/2510.24334) (learned co-occurrence) are general photo downscalers, and the second is learned. Neither adds to §3 or §14 C (INFERRED from the abstracts).
- **Prior art, not a method gain.** Mhatre et al., ["Deterministic Palette Quantization Using Resolution-Adaptive Spatial Partitioning"](https://www.tdcommons.org/dpubs_series/10979) (Technical Disclosure Commons, 2026-07-15, CC BY 4.0) discloses block partitioning, a modal colour per block, the dominant background colour added to a fixed palette, and k-d-tree nearest mapping for AI-image artefacts. That is already §4 weighted mode plus a palette snap (VERIFIED abstract). Its value is as dated public prior art for that combination (engineering triage, not legal advice).

### Algorithm ideas from new public code, ranked by expected value

Each idea is a candidate experiment, not a selected default. Labels follow the cited pins.

1. **Chance-corrected edge support as a grid-confidence feature** (Real-PixelArt; CODE-DERIVED). Count the edge mass within `tol = max(0.65, 0.14p)` of the cuts and subtract the share that uniform edges would land there by chance (`min(0.85, 2.5066·tol/p)`; 2.5066 ≈ √(2π), a Gaussian-window width). Then rescale to [0, 1]. It is the cheap, closed-form cousin of the 2026-10-19 a-contrario NFA idea. It targets the prototype's detection misses ([session findings](../../planning/session-findings-2026-10-19.md#recommended-next-steps) step 2). Add it next to D8's step ratio and measure the `bicubic-x8` and non-integer 1-bit misses (INFERRED). Its companion, rejecting weak candidates whose edges form few continuous axis-aligned segments, addresses the periodic-texture false positives that NFA alone admits.
2. **Non-separable 2-D junction mesh for drift** (pixel-pusher; CODE-DERIVED, no licence, ideas only). The prototype's elastic cuts (design §Approximate grid detector, step 8) are per-axis, so one x-cut serves the whole image height. Sub-cell offsets that differ by region ([artifact characterization](../evaluation/ai-artifact-characterization.md), `gemini-mage`; drift 0.2–2 cells) cannot be followed. A junction mesh with corner-anchored moves, neighbour-difference regularization and a "flat stays on the seed" rule can follow them. That bears on the weakest stratum (M) (INFERRED). Cost: about 9–16 local cell-variance evaluations per junction per step over 3 iterations, which fits on the cell grid. Determinism needs a fixed junction visiting order (Jacobi-style; see the 2026-10-19 order-independence note).
3. **Count-constrained DP for `lockGrid`** (Real-PixelArt `targetAxis`; CODE-DERIVED, MIT). The prototype falls back to regular cuts when its elastic DP misses the fixed count. A DP over N − 1 interior cuts with a displacement anchor cost (0.12) and a gap cost (0.35) cannot miss the count. It is a direct swap candidate for the `grid-locked` rows, which `OWN-006` makes common. Report it as "user-constrained lattice", as the source does.
4. **Exhaustive summed-area-table search as a cross-check** (pixel-pusher). Score every integer (w, h, phase) in O(cells) by normalized within-cell variance, with a `1/(w·h)` coarseness term and a mild anisotropy prior. It is a fourth instance of the "largest cell within tolerance of best" rule (2026-10-19 open-source addendum), and an independent second opinion for octave-guard disputes (INFERRED). The `ln` in its prior must become a table or a rational form under the no-transcendental rule.
5. **Report-only palette structure checks** (pixelfit PaletteLens; VERIFIED README). Non-monotonic ramp lightness, greyscale collisions and unused entries are cheap additions to the report and to the [quality metrics](../evaluation/pixel-art-quality-metrics.md) ramp section. They are not corrections.

### Effect on the prototype design

No finding contradicts a Deviations row. Ideas 1–3 are new experiments for `AUTO-005`/`AUTO-006`, `EX-005`/`EX-009` and the `grid-locked` path; none has run. Later the same day the prototype gained a second-difference fallback for smooth upscales (design D38–D41), which recovers the clean bicubic preset but not the noisy `bicubic-x8` preset, so idea 1 still targets the remaining misses.
