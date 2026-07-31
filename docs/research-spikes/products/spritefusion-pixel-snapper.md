# SpriteFusion Pixel Snapper — product and source audit

**Audit date:** 2026-07-31  
**Product:** [SpriteFusion Pixel Snapper](https://www.spritefusion.com/pixel-snapper)  
**Repository:** [Hugo-Dz/spritefusion-pixel-snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper)  
**Pinned source revision:** [`ae20461f60fb39e75d15f184bab1ebec1219511c`](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/tree/ae20461f60fb39e75d15f184bab1ebec1219511c)  
**Crate version:** `1.0.0`  
**License:** MIT  
**Research status:** Complete for the public MIT Rust core, official product material, and bounded live-UI/output observations; unpublished web/desktop internals remain unknown.

## Evidence vocabulary

This spike deliberately distinguishes facts from interpretation:

- **VERIFIED** — stated by a primary source or directly visible in the pinned repository.
- **CODE-DERIVED** — follows directly from a cited implementation path at the pinned commit.
- **OBSERVED** — reproduced against the live web product on the audit date.
- **INFERRED** — a reasoned consequence of code or observations, but not directly asserted by the product.
- **UNKNOWN** — not established by public sources or this test pass.

Unless a later date is stated, every **UNKNOWN** in this spike remains unresolved as of 2026-07-31.

## Executive verdict

Pixel Snapper is a compact, deterministic **implicit-grid recovery tool**, not a general image-to-pixel-art converter. Its core idea is useful: reduce the source to a small analysis palette, infer regularly spaced horizontal and vertical boundaries from luminance gradients, let each boundary move toward a nearby edge, and replace each inferred cell by its most common RGBA value. That combination can remove anti-aliasing and inconsistent cell widths when a high-resolution image already contains strong, repeated, near-axis-aligned “logical pixel” blocks.

It does not meet Pixilate's general exact-target baseline contract:

1. **It cannot produce an explicit target width and height.** A pixel-size override exists in the CLI and WASM API, but it remains an indirect grid-spacing hint; the public web UI does not expose it, and the elastic walker may still produce a different cell count than `input / pixel-size`. [Processing path](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L241-L305), [WASM arguments](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L307-L337).
2. **Its output dimensions are discovered, not requested.** When evidence is weak, the fallback aims for 64 segments on the smaller axis; local peak selection can therefore return counts and geometry that differ from a known fixture target. [Step fallback](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1025-L1058), [walker](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1131-L1184).
3. **It assumes one square, axis-aligned, canvas-anchored grid.** There is no rotation, skew, perspective, multi-scale, sprite-by-sprite, content-bounds, or grid-phase model.
4. **It has no orphan-pixel or topology cleanup.** Independent per-cell mode selection removes minority detail but never reasons about connected components, silhouettes, line continuity, or neighborhood consistency. [Resampling implementation](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1345-L1397).
5. **It is intentionally scoped to inputs already close to pixel art.** The official docs say this explicitly, and the maintainer describes it as a snapper rather than a pixelation tool. [Official overview](https://www.spritefusion.com/docs/pixel-snapper/overview), [maintainer response on issue #1](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/1#issuecomment-3585902985).

**Recommendation for Pixilate:** reuse the product’s deterministic engineering ideas and offer an optional “recover implicit grid” mode, but do not reuse its estimator/resampler as the default target-size algorithm. Pixilate should make exact target dimensions the governing constraint and treat inferred grid scale/phase as evidence that can inform, never override, that constraint.

## Product and repository snapshot

### Public claims and surfaces

- **VERIFIED:** The product page positions Pixel Snapper as a free, open-source fixer for AI-generated pixel art, with a paid desktop edition. It claims support for hand-drawn and AI-generated inputs, custom palettes, transparency, batch processing in the desktop edition, and PNG download. It also warns in its FAQ that it will not fix every artwork. [Product page and FAQ](https://www.spritefusion.com/pixel-snapper).
- **VERIFIED:** The official docs describe a three-step browser flow: upload, choose a color amount, download PNG. The documented color range is 8–64; imported palette PNGs may contain 1–256 distinct visible colors. The docs also list sprites, tilesets, tilemaps, isometric maps, and textures as intended uses while qualifying that sources should already be close to pixel art. [Official overview](https://www.spritefusion.com/docs/pixel-snapper/overview).
- **OBSERVED:** The live UI default was 16 colors. The range input was `min=8`, `max=64`, `step=8`, `value=16`. The art chooser used `accept="image/*"`, while the nearby copy said “PNG, JPG up to 10MB.” The palette chooser accepted PNG only.
- **VERIFIED:** The current README documents a native CLI, directory batch processing, `--pixel-size`, `--palette`, and a WASM function. [README at the pinned revision](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/README.md).
- **VERIFIED:** The repository has a `v1.0.0` tag but no GitHub release objects. The codebase is very small: one Rust library, a four-line binary entry point, Cargo files, README, license, and marketing images.
- **OBSERVED (2026-07-31):** The [GitHub repository surface](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) reported approximately 2,742 stars, 177 forks, and no open issues. These mutable popularity values were not archived or hashed and are not quality guarantees.

### Public source boundaries

- **VERIFIED:** The public repository contains the Rust core and CLI/WASM bindings. It does **not** contain the live Svelte front end or a desktop UI source tree.
- **VERIFIED:** The maintainer says the desktop edition is a Svelte UI on top of native Pixel Snapper processing. That does not establish where that UI source is published or under what license. [Issue #11 response](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/11#issuecomment-4955288240).
- **PUBLICATION BOUNDARY:** This report does not inspect, fingerprint, or describe unpublished compiled front-end/desktop assets. Claims about implementation behavior come from the cited MIT Rust repository; web claims are limited to official documentation and bounded UI/output observations.

## What the algorithm actually does

### End-to-end pipeline

| Stage | Implementation | Consequence |
|---|---|---|
| Decode | `image::load_from_memory`, compiled with PNG and JPEG features only | PNG/JPEG decode; all inputs become RGBA8. Other browser-selected image formats fail in the core. |
| Validate | Reject zero dimensions and either dimension above 10,000; profile computation later rejects dimensions below 3×3 | The dimensional guard is not a practical memory guard for 100-megapixel RGBA plus k-means allocations. |
| Analysis quantization | Fixed-seed RGB k-means++ over all pixels with alpha > 0, default 16 colors, max 15 iterations | Reduces near-duplicate shades before grid detection; deterministic for a pinned build, but not perceptual and alpha coverage is ignored. |
| Edge profiles | Sum absolute centered luminance derivatives independently by column and row | Detects repeated axis-aligned brightness transitions; misses isoluminant boundaries and non-axis-aligned structure. |
| Step estimate | Strict local maxima above 20% of profile maximum, peaks at least four samples apart, median inter-peak distance | A small number of strong repeated edges can dominate scale; plateaus are not peaks because comparisons are strict. |
| Cross-axis resolution | Average similar X/Y estimates; otherwise use the smaller; copy one axis if the other fails; otherwise target 64 segments | Forces a square nominal step and selects a fallback scale when evidence is absent. |
| Boundary walk | Start at canvas coordinate 0; repeatedly move about one step, snapping each cut to the strongest nearby profile value | Handles modest local drift but allows cumulative warping and has no global phase optimization. |
| Stabilization | Sanitize cuts, borrow the sibling axis or 64-segment fallback when sparse/skewed, locally snap a “uniform” replacement | Limits some large axis disagreements but still returns variable-width cells and non-target-governed counts. |
| Cell reduction | Choose the exact RGBA mode inside each inferred cell; deterministic lexicographic tie-break | Removes blur/noise when the intended color dominates; deletes thin/minority features and does no topology cleanup. |
| Custom palette | After snapping, map each nontransparent pixel to nearest supplied RGB by Euclidean RGB distance | Produces exact palette RGB values without changing detected geometry; alpha is carried through unchanged. |
| Export | Encode the logical-cell image as PNG | Always outputs one pixel per inferred cell, strips source format/metadata, and never returns a requested display scale. |

The orchestration is directly visible in [`process_image_common`](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L241-L305).

### 1. Input, preprocessing, alpha, and background

**CODE-DERIVED:** The public core enables only PNG and JPEG decoders in `image 0.24`; the CLI extension filter likewise admits only `.png`, `.jpg`, and `.jpeg`. Every decoded image is converted to RGBA8. [Cargo features](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/Cargo.toml#L20-L33), [CLI input filter](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L656-L704).

There is no denoise, sharpening, color-management transform, EXIF-orientation correction, background segmentation, alpha threshold, crop, trim, or content-bounds detection. “Background removal” is not part of the product.

Alpha handling is narrower than “transparency aware” suggests:

- Fully transparent pixels are excluded from k-means and preserved byte-for-byte during analysis quantization.
- Every pixel with alpha 1–255 participates equally in RGB clustering; alpha magnitude does not weight the sample.
- The luminance profile treats alpha 0 as black/zero but treats all nonzero alpha as fully present RGB. A 1/255 fringe contributes the same luminance edge as an opaque pixel of the same RGB.
- Cell resampling counts exact four-byte RGBA values. The same RGB at multiple alpha levels becomes multiple competing categories.
- In a frequency tie, candidates are sorted lexicographically by RGBA. This is deterministic, but it is not coverage-aware or artist-aware.

The relevant paths are [analysis quantization](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L721-L859), [luminance profiles](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L939-L979), and [RGBA-mode resampling](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1345-L1397).

**INFERRED:** Transparent margins and alpha fringes can become some of the strongest “grid” evidence even though the user cares about the opaque sprite. This is the opposite of Pixilate’s proposed `Trim` semantics, because Pixel Snapper always analyzes and segments the whole canvas.

### 2. Analysis quantization

**CODE-DERIVED:** Quantization is hand-written k-means++ in gamma-encoded 8-bit RGB:

- Default `k=16`, fixed ChaCha8 seed `42`, 15 iterations.
- Initial centers use weighted k-means++ sampling.
- Assignment and custom-palette matching both use unweighted squared Euclidean RGB distance.
- Empty clusters retain their previous centers.
- If `k` exceeds the number of nontransparent pixels, it is clamped to that pixel count, not to the number of unique colors.
- No dithering is introduced.
- Convergence stops when maximum squared centroid movement is below `0.01` after the first iteration.

[Configuration defaults](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L20-L65), [k-means implementation](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L721-L859).

**Strength:** Quantizing before gradient measurement suppresses tiny AI shade variations that would otherwise create excessive edge peaks. This is a credible reason the product can outperform plain nearest-neighbor downscaling on near-grid AI art.

**Weaknesses:** RGB Euclidean distance is not perceptually uniform, operates on nonlinear channel values, ignores alpha coverage, and gives rare/high-contrast shades the same centroid role as structurally important ramps. It can merge colors across ramps in ways that move the detected edge profile. Quantization is therefore both a cleanup step and an uncontrolled geometry-changing step.

**VERIFIED history:** Custom-palette colors were deliberately separated from analysis quantization in July 2026: geometry is always inferred from the normal k-means result, then a custom palette is applied afterward. This is the correct direction because a four-color destination palette should not redefine the source grid. [Separation commit](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/commit/7616abd123262c3ba7d5d1babf6f696093eb368a).

### 3. Grid and scale estimation

**CODE-DERIVED:** The algorithm creates two one-dimensional projections. For each non-border X location it sums `abs(gray[x+1]-gray[x-1])` over all rows; Y is analogous. It is not Sobel magnitude, autocorrelation, frequency analysis, Hough detection, or a two-dimensional grid likelihood. [Profile code](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L939-L979).

The estimator then:

1. Keeps strict local maxima greater than 20% of the strongest value.
2. Greedily drops peaks within three positions of the previous retained peak.
3. Uses the upper median of consecutive retained-peak distances.
4. Forces X and Y to share one nominal step: average if within a 1.8× ratio, otherwise use the smaller; borrow a successful sibling axis; or fall back to `min(width,height)/64`, clamped to at least one.

[Peak estimator and resolver](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L981-L1058).

This explains several characteristic results:

- A hard edge produces a two-sample plateau under the centered derivative; neither sample is a strict local maximum. Clean nearest-neighbor block boundaries can therefore be weaker evidence than blurred or irregular ones.
- Alternating one-pixel patterns are invisible to the centered two-sample derivative when left and right (or top and bottom) match.
- Edges between different RGB colors of equal luminance are invisible.
- Repeated interior texture can be mistaken for the logical pixel grid.
- The four-sample peak-spacing filter makes native low-resolution structure easy to skip or reinterpret.
- A rectangular/non-square source grid is forced toward square cells.
- There is no confidence score. Complete failure silently becomes a 64-segment target.

**VERIFIED history:** A November 2025 “improve stability” commit added sibling-axis borrowing, the 64-segment fallback, cross-axis stabilization, and a stricter 1.8× skew threshold. The author’s own code comment says a rigid grid performed worse and warns that the retained elastic walker may distort. [Stability commit](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/commit/98af87adf14487a8c6f4f8a9ad36ca1e77226748).

### 4. Coordinate snapping and stabilization

**CODE-DERIVED:** Boundary walking is canvas-anchored at 0. For each expected next cut, it searches within `max(0.35 × step, 2px)` and takes the strongest profile value if it exceeds half the profile mean; otherwise it uses a truncated ideal target. The chosen location becomes the origin for the next step. [Walker](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1131-L1184).

That is an **elastic cumulative walk**, not global grid fitting. It has two useful properties: it can follow modest spacing drift, and it uses the actual image boundary as a hard endpoint. It also has serious consequences:

- A single misleading edge changes the next expected location, so errors can propagate.
- Cell widths vary; the result is “one output pixel per region,” not a mathematically uniform source grid.
- Grid phase is never optimized. The initial cut is always the canvas edge, even if the sprite grid starts inside a margin.
- X and Y walks are independent after only a shared nominal step, so local topology can warp differently in each direction.
- Fractional step overrides are accepted, but integer cut placement introduces truncation/rounding patterns.

Stabilization sanitizes endpoints and duplicates, replaces sparse/skewed axes with nominally uniform cuts locally snapped to profile peaks, and performs a second cross-axis ratio check. It improves survivability but still has no objective function comparing alternate scale/phase hypotheses and no confidence-based refusal. [Stabilization](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1060-L1129), [cut repair](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1186-L1343).

### 5. Cell resampling, orphan pixels, and detail

**CODE-DERIVED:** Each final logical pixel is the most frequent **exact quantized RGBA tuple** in its inferred rectangular region. Equal-frequency candidates are deterministically sorted; the smallest RGBA tuple wins. No neighboring output pixel is consulted. [Resampler](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1345-L1397).

Why this often succeeds:

- Anti-aliased fringe colors typically occupy less area than the intended cell fill.
- Quantization makes near-identical intended colors identical before voting.
- Mode selection never averages two palette colors into a new muddy color.
- A one-pixel logical output is inherently aligned and easy to scale with nearest-neighbor afterward.

Why it becomes impractical:

- Thin highlights, one-cell diagonals, outline corners, small eyes, weapon tips, and intentional dithering can be minority samples and disappear.
- A misplaced boundary transfers area between adjacent votes, moving features even if their colors survive.
- There is no silhouette preservation, connected-component constraint, line continuity, area coverage, center sample, edge-aware weighting, or semantic importance.
- There is no orphan-pixel cleanup at all. Conversely, there is no “protect single pixels” mode; the mode vote may erase them before cleanup would even be possible.
- The website’s claim that dithering is preserved is conditional: it survives only when inferred cells align so each dither element wins its own cell.

This is a useful optional reducer candidate for Pixilate's near-grid profile, not a general reducer for every input stratum.

### 6. Palette application

**CODE-DERIVED:** Custom palettes are comma-separated six-digit RGB values in the CLI/WASM core, deduplicated in encounter order, limited to 256 entries, and applied by nearest Euclidean RGB. Fully transparent pixels retain their original RGBA; all other pixels retain their alpha but receive an exact palette RGB. Ties favor the earliest palette entry because replacement occurs only on strictly smaller distance. [Palette parsing and mapping](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L861-L937).

**OBSERVED public-UI behavior:** The web product accepts a palette PNG and disables the ordinary color-count control while a custom palette is active. The precise unpublished front-end import and bridge behavior is outside this public audit.

**Limitations:** There is no OKLab/Lab option, linear-light option, palette ramp awareness, hue weighting, protected colors, indexed-PNG export, dithering choice, or automatic palette-size selection. The final PNG is RGBA, not a guaranteed indexed image.

### 7. Target dimensions, resizing, trim, and export

**VERIFIED:** There is no target-width or target-height field anywhere in the public core. Output width is `col_cuts.len()-1`; height is `row_cuts.len()-1`. [Output sizing](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L285-L304).

The `--pixel-size`/WASM override:

- accepts one finite floating-point value from 1 to half the smaller source dimension;
- forces the same nominal step on both axes;
- still runs the local walker and stabilization;
- cannot express independent X/Y targets, a crop rectangle, grid phase, or a desired logical canvas;
- was not exposed in the public web UI observed during this dated pass. [Override validation and use](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L241-L283), [WASM API](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L307-L337).

There is no trim mode. Transparent canvas is part of grid inference and output. There is no post-output nearest-neighbor enlargement, scale factor, sprite sheet packing, or metadata sidecar. Export is always a newly encoded PNG.

**Pixilate impact:** “source pixel size” and “requested output dimensions” must be separate concepts. Pixel Snapper conflates them; Pixilate should not.

## Live synthetic test matrix

### Method

**OBSERVED:** On 2026-07-31, synthetic images were generated outside the project workspace with ImageMagick and uploaded to the live web edition at its default 16-color setting. Dimensions were read from the loaded result PNG in the page. Inputs contained no personal or model-generated content. The same 64×64 aligned case was repeated three times and returned the same 57×57 dimensions each time. Pixel-byte identity was not captured, so that repetition confirms stable geometry, not a bitwise hash.

| Case | Construction / intended structure | Input | Expected from a general target-aware grid recovery tool | Live output | Result |
|---|---|---:|---:|---:|---|
| Clean aligned grid | 8×8 black/white checker, nearest-neighbor enlarged; 8×8 source pixels per logical cell | 64×64 | 8×8 if recovering the obvious source-cell grid | **57×57** | Fail. Strict derivative-peak logic does not recognize hard-edge plateaus as the intended grid. |
| Same art, smaller scale | 8×8 checker enlarged to 4×4 source pixels per logical cell | 32×32 | 8×8 | **25×25** | Fail. Shows sensitivity to source scale and peak spacing. |
| Flat field | One opaque RGB color | 64×64 | Ambiguous; a cautious tool should request/obey a target or no-op | **64×64** | Deterministic fallback/no-op at this exact size; no confidence warning. |
| Smooth raster gradient | One vertical 128-shade gradient, no pixel grid | 128×128 | Refuse implicit-grid mode or obey explicit target | **64×66** | Fallback-derived geometry; X/Y mismatch on a symmetric canvas. |
| Non-square source cells | 16×16 checker enlarged to 8×4 rectangular blocks | 128×64 | 16×16 logical cells | **113×49** | Fail. Square-step assumption and strict peaks do not recover the rectangular grid. |
| Blurred near-grid | 16×16 checker enlarged to 128×128 then Gaussian-blurred | 128×128 | About 16×16 | **79×79** | Fail for this controlled blur; local gradients create the wrong scale. |
| Transparent canvas | Four alpha-visible colored 16×16 blocks centered in otherwise transparent 64×64 canvas | 64×64 | Trim-aware result based on 32×32 alpha-visible bounds under the serialized threshold (default `alpha > 0`), or explicit canvas result | **61×61** | Confirms full-canvas processing and no trim semantics. |
| WebP | 32×32 gradient WebP; chooser accepts `image/*` | 32×32 | Either support it or reject before processing with a precise format message | **Failed** | UI acceptance is broader than the Rust decoder. |
| GIF | 32×32 gradient GIF | 32×32 | Same | **Failed** | Same mismatch. |
| BMP | 32×32 gradient BMP | 32×32 | Same | **Failed** | Same mismatch. |

These cases are intentionally simple. They do not say Pixel Snapper never succeeds; they show that “obvious to a human” is not equivalent to “strong strict local maxima in summed centered-luminance profiles.” The product is tuned for a narrower empirical distribution of high-resolution, slightly irregular AI pixel art.

### User reports that match the failure model

- **VERIFIED:** A user reported a 256×256 input becoming 55×55 and a 2048 version becoming about 203×203. The maintainer explained that shrinking to one output pixel per inferred logical pixel is expected and that the sample lacked suitable grid structure. [Issue #1](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/1).
- **VERIFIED:** A noisy 1024×1024 sample produced palette mistakes at 32 colors; the maintainer increased the website maximum but said the tool performed best on standalone assets. [Issue #5](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/5#issuecomment-3665938904).
- **VERIFIED:** A 1024×1024 sheet reportedly became a small white 13×13 result. The maintainer recommended slicing and processing each asset separately. [Issue #7](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/7#issuecomment-3904628697).
- **VERIFIED:** A user fed a native 32×32 sprite with damaged background-removal edges and received an unrecognizable 6×8 result. The maintainer clarified that the tool is meant for high-resolution mixels, not low-resolution edge repair. [Issue #9](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/9).
- **VERIFIED:** Transparency was initially lost and later added through a community PR, showing that current alpha support is an evolution rather than a foundational coverage model. [Issue #4](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/4), [translucency commit](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/commit/c3d3c4c1046d877e95e6ed5e09f8232f04397f4e).

## Failure taxonomy

| Failure class | Trigger | Mechanism | Typical symptom | Pixilate requirement |
|---|---|---|---|---|
| No real grid | Photo, smooth illustration, gradient | Fallback or quantization-created profile peaks stand in for evidence | Dimensions and block placement are not target-governed | Explicit target wins; implicit-grid mode must expose confidence/refuse. |
| Perfect hard-edge plateaus | Nearest-neighbor enlarged blocks | Centered derivative creates equal adjacent responses; strict maxima reject them | Near-no-op or wrong scale | Use autocorrelation/periodicity and plateau-aware peak extraction. |
| Native low-res art | Already 1:1 or small logical pixels | Four-sample peak filter and visual-feature scale replace physical pixel scale | Destructive extra downscale | Detect/no-op mode and require target confirmation. |
| Isoluminant palette boundaries | Different colors with similar luminance | Profiles use grayscale only | Missed grid lines | Combine RGB/OKLab edge energy, alpha, and spatial periodicity. |
| Rectangular pixels | Different X and Y source scale | Resolver forces one square nominal step | Wrong aspect/geometry | Independent X/Y scale and target count. |
| Rotated/skewed grid | Generated art not perfectly axis aligned | Only row/column projections | Smearing, warped cells | Estimate orientation/skew or offer deterministic rectification. |
| Multiple scales | Sprite sheets, UI composites, mixed-detail regions | One global step per image | Tiny/blank or impractical whole-sheet output | Segment regions/sprites or require per-region target. |
| Off-canvas grid phase | Sprite begins inside padding | First cut is always 0 | Phase-shifted votes and moved edges | Explicit phase optimization; content-aware bounds. |
| Transparent margins | Trimmed subject on large canvas | Alpha boundary enters profiles; full canvas sets fallback scale | Output governed by padding | First-class `Trim`/canvas coordinate space. |
| Partial-alpha fringe | Background-removal antialiasing | Any alpha > 0 acts fully present in profiles and exact-alpha modes split votes | Fringe-driven cuts or unstable transparency | Premultiplied/coverage-aware processing and alpha threshold policy. |
| Thin/rare details | Highlights, diagonals, tips, eyes | Per-cell mode erases minority samples | Missing or shifted features | Edge/topology-aware reducers and protected-detail options. |
| Noisy palette | AI raster with many shades | RGB k-means may merge structural colors and shift profiles | Incorrect boundaries/colors | Separate geometry evidence from output quantization; perceptual color spaces. |
| Target-size use | User needs 16×24, 32×32, etc. | No target dimensions | Output cannot be integrated into game requirements | Exact `(W,H)` is a hard invariant. |
| Format mismatch | WebP/GIF/BMP selected by `image/*` | Core compiles PNG/JPEG only | Generic “Failed” item | Keep picker and decoder capabilities identical; validate early. |
| Large image | Up to 10,000×10,000 and high `k` | Full pixel vector plus repeated O(NK) passes | Browser memory/time failure | Pixel-count/memory budgets, sampling, cancellation, progress. |
| Batch name collision | `foo.jpg` and `foo.png` in one CLI batch | Both output to `foo.png`; native jobs run in parallel | Nondeterministic overwrite | Collision-safe names and atomic writes. |

The batch collision is directly implied by [parallel processing](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L510-L610) plus [stem-only output naming](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L692-L705).

## Determinism and reproducibility

### What is deterministic

**CODE-DERIVED:** Within the same pinned build and execution target, the pixel pipeline is designed to be deterministic:

- fixed `k_seed=42` with ChaCha8;
- deterministic row-major pixel collection and assignment;
- deterministic strict comparisons for centroid/color ties;
- deterministic sorting of RGBA mode candidates after `HashMap` counting;
- deterministic custom-palette encounter order and first-entry tie behavior;
- sorted native batch input paths.

This is materially better than opaque model-based or randomized image processing.

### Caveats

- **UNKNOWN:** Bit-for-bit identity between native builds, WASM builds, CPU architectures, compiler versions, or future dependency versions is not guaranteed. Floating-point centroid math can cross rounding/tie boundaries.
- **CODE-DERIVED:** The Cargo lockfile pins dependency versions for repository builds, but `cargo install spritefusion-pixel-snapper` does not by itself promise the same future lock context unless published packaging preserves it.
- **CODE-DERIVED:** Native batch result pixels should remain deterministic, but reporter event order is nondeterministic because Rayon runs files in parallel.
- **CODE-DERIVED:** Two batch inputs with the same stem can race to the same output file, breaking artifact reproducibility despite a deterministic core.
- **OBSERVED:** Three repeated live runs of the clean 64×64 synthetic case returned the same output dimensions. Pixel hashes were not captured.

**Pixilate implication:** determinism needs a versioned processing manifest containing algorithm ID, exact parameter values, color space, alpha policy, trim bounds, target size, palette ordering, and implementation version—not merely a fixed PRNG seed.

## Performance and operational behavior

### Complexity

For `N` nontransparent source pixels, `K` colors, and `I≤15` k-means iterations:

- k-means++ seeding: roughly `O(NK)`;
- clustering: `O(NKI)`;
- final pixel assignment: `O(NK)`;
- profiles and cell traversal: approximately `O(N)` plus per-cell mode sorting;
- memory: original RGBA, analysis RGBA, output, `N` RGB float triplets, `N` distances, and cluster arrays.

At the accepted 10,000×10,000 limit, just one `[f32;3]` vector for all nontransparent pixels is about 1.2 GB before vector/image overhead. The core’s dimension limit therefore permits inputs that are unrealistic in a browser. [Dimension check](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L707-L719), [opaque-pixel allocation](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L721-L745).

### Native versus web

- **CODE-DERIVED:** Native directory batches are parallelized per image with Rayon. Individual image stages are not parallelized. [Batch processor](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L510-L610).
- **UNKNOWN:** Unpublished web/desktop batching, cancellation, and memory behavior are not implementation evidence in this public audit.
- **CODE-DERIVED:** There is no cancellation hook, per-stage progress, sampling mode, pixel-count budget, time budget, or graceful lower-memory path.
- **VERIFIED:** An unmerged optimization PR claims large speedups and proposes modularization/parallel work. It received no review and is not evidence for current performance. [PR #6](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/pull/6).
- **UNKNOWN:** No trustworthy current end-to-end benchmark was found in the repository.

### Test maturity

- **VERIFIED:** The pinned source contains six inline tests, all for CLI argument parsing. There are no algorithm, alpha, grid-estimation, golden-image, WASM, property, fuzz, performance, or batch-collision tests. [Current tests](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/src/lib.rs#L1399-L1460).
- **VERIFIED:** No GitHub Actions workflow is tracked at the pinned revision.
- **UNKNOWN / TEST BLOCKER:** The native crate was not compiled during this spike because Rust/Cargo was not installed in the audit environment. The live deployed WASM was exercised instead. This is an environment limitation, not a reported build failure.

## Privacy, offline behavior, and telemetry

### Public privacy boundary

The product page describes local/browser processing and advertises the desktop edition as offline. This report does not inspect unpublished compiled assets or make stronger network/data-flow claims. The site's current [privacy policy](https://www.spritefusion.com/privacy) remains the authoritative public source for site-level data handling. Pixilate should independently document image processing, analytics, and offline behavior and default to no content capture.

### Offline

- **VERIFIED:** The product explicitly advertises the desktop edition as 100% offline. [Product page](https://www.spritefusion.com/pixel-snapper).
- **OBSERVED:** The web edition needs network access to load the application. The product describes processing as local, but a complete offline-cache guarantee was not established in this public pass.
- **UNKNOWN:** A complete offline-cache/service-worker guarantee was not found or tested for the web edition.

## Licensing and MIT reuse compatibility

### Core repository

**VERIFIED:** The repository is MIT-licensed, copyright 2025 Hugo Duprez. MIT reuse is compatible with Pixilate’s intended MIT license, including commercial use and modification, provided the upstream copyright and license notice are retained in copies or substantial portions. [LICENSE](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/LICENSE).

Practical guidance:

- Reimplementing a general idea does not require copying source, but copied or substantially derived Rust code should retain the upstream MIT notice in Pixilate’s third-party notices and relevant source distribution.
- Do not assume SpriteFusion names, logos, product artwork, or the paid desktop UI are granted for reuse merely because the core repository is MIT. Trademark and separately hosted front-end assets are distinct questions.
- The live Svelte source is not in this public MIT repository. Do not copy minified deployed front-end code.

### Dependency audit

**VERIFIED:** Every package pinned in the audited `Cargo.lock` reported a permissive license expression in crates.io metadata; no GPL/AGPL/LGPL or other copyleft dependency was found. Direct dependencies are:

| Dependency | Audited resolved version | License expression | Role |
|---|---:|---|---|
| [`image`](https://crates.io/crates/image/0.24.9) | 0.24.9 | MIT OR Apache-2.0 | PNG/JPEG decode and PNG encode |
| [`rand`](https://crates.io/crates/rand/0.8.5) | 0.8.5 | MIT OR Apache-2.0 | sampling interfaces |
| [`rand_distr`](https://crates.io/crates/rand_distr/0.4.3) | 0.4.3 | MIT OR Apache-2.0 | weighted centroid sampling |
| [`rand_chacha`](https://crates.io/crates/rand_chacha/0.3.1) | 0.3.1 | MIT OR Apache-2.0 | deterministic PRNG |
| [`rayon`](https://crates.io/crates/rayon/1.12.0) | 1.12.0 | MIT OR Apache-2.0 | native batch parallelism |
| [`wasm-bindgen`](https://crates.io/crates/wasm-bindgen/0.2.105) | 0.2.105 | MIT OR Apache-2.0 | web binding |
| [`getrandom`](https://crates.io/crates/getrandom/0.2.16) | 0.2.16 | MIT OR Apache-2.0 | WASM RNG support |

The transitive license set includes MIT, Apache-2.0, BSD-2-Clause, Zlib, 0BSD, Unlicense, Unicode-3.0, and Apache-2.0 with LLVM exception. These are compatible with an MIT application, subject to preserving their respective notices/terms. Pixilate should automate this with a locked dependency policy and generated third-party notice file rather than relying on this one-time snapshot. [Pinned lockfile](https://github.com/Hugo-Dz/spritefusion-pixel-snapper/blob/ae20461f60fb39e75d15f184bab1ebec1219511c/Cargo.lock).

## Why Pixel Snapper is good when it is good

1. **The input distribution is favorable.** High-resolution AI art already looks like pixel art, uses approximately repeated cell sizes, has strong axis-aligned transitions, and does not mix many scales.
2. **Early quantization suppresses incidental shades.** This converts blur/anti-aliasing into a smaller number of dominant regions before scale inference.
3. **The elastic walker tolerates local drift.** A perfectly rigid sampling grid would cut through inconsistent AI “pixels”; local edge attraction often lands nearer their visual boundaries.
4. **Mode reduction is categorical, not averaging.** It chooses an existing quantized color, so cells remain crisp and palette-consistent.
5. **Cross-axis rescue prevents some blank/collapsed results.** One strong axis can seed the other; the second pass repairs severe X/Y disagreement.
6. **Deterministic tie rules make iteration understandable.** The same build and settings should repeat, making failures debuggable.
7. **Final palette mapping is separate.** Geometry discovery does not depend on a restrictive user palette.
8. **The Worker/CLI surfaces are practical.** Local web processing, native batch processing, and a small WASM API make the core easy to integrate.

These strengths explain why it can feel much better than naive downscaling on selected AI outputs even though the synthetic/general cases are weak.

## Reusable ideas for Pixilate

### Adopt or adapt

- **Separate geometry analysis from final palette mapping.** Destination palette choices must not redefine source geometry.
- **Make deterministic seeds and tie-breaks explicit.** Every ambiguous choice needs a documented stable order.
- **Offer cell-mode reduction as one reducer.** It is useful for removing anti-aliasing when cell geometry is trustworthy; add coverage-, center-, edge-, and topology-aware alternatives.
- **Use cross-axis evidence, but preserve independent X/Y scale.** Let one axis inform confidence without forcing square cells.
- **Run locally in a Worker/WASM.** Keep image bytes off the server and the UI responsive; make telemetry content-free and opt-out/default-off.
- **Return a one-logical-pixel representation.** Then provide a separate exact nearest-neighbor display/export scale.
- **Expose an advanced source-pixel-size override.** Treat it as a hypothesis with independent X/Y values and phase, not a substitute for target dimensions.
- **Validate palettes deterministically.** Preserve input order, deduplicate predictably, and make tie behavior part of the manifest.
- **Report diagnostics.** Pixel Snapper internally has step and cut information but the web API throws it away. Pixilate should return scale, phase, confidence, content bounds, and warnings.

### Avoid

- A silent 64-segment fallback when no grid is detected.
- Strict local maxima as the sole periodicity detector.
- Canvas coordinate 0 as an implicit grid phase.
- One forced square step for both axes.
- A cumulative elastic walk without a global objective or drift bound.
- Exact RGBA mode as the only resampler.
- Gamma-encoded RGB k-means/nearest-palette distance as the only color model.
- Treating every nonzero alpha as equally opaque for geometry.
- Accepting `image/*` when only two decoders exist.
- Converting pixel-size hints into uncontrolled output dimensions.
- Overwriting batch outputs by stem or writing final files non-atomically.
- Marketing “preserves details” without confidence, before/after metrics, or an artifact warning.

## Concrete Pixilate design implications from this spike

1. **Split the job into explicit modes.** At minimum: exact target resize, implicit-grid repair, quantization/palette remap, and background removal. Do not run implicit-grid recovery on every input.
2. **Make target dimensions a hard invariant.** Whether `Trim` uses alpha-visible bounds under its serialized threshold (default `alpha > 0`) or the full canvas, the selected coordinate space must map to exactly `(targetWidth,targetHeight)` unless the user requests aspect preservation with letterbox/crop.
3. **Estimate scale, phase, and confidence globally.** Combine plateau-aware edges, color-edge energy, autocorrelation/frequency evidence, candidate grid phases, and robust scoring. Keep X/Y independent. Refuse or fall back to target-aware resampling when confidence is low.
4. **Use content bounds deliberately.** With `Trim`, calculate deterministic alpha/content bounds first and retain the offset in metadata. Without `Trim`, preserve the full canvas. Never let transparent padding silently change the requested logical size.
5. **Offer deterministic reducers.** Candidate reducers should include center sample, area/mode coverage, median/medoid, edge-aware voting, and silhouette/topology-preserving voting. Each must specify tie rules.
6. **Make cleanup optional and measurable.** Orphan removal should use deterministic connected-component/neighborhood rules with protected-color/detail thresholds, not an unconditional aesthetic pass.
7. **Separate analysis colors from export colors.** Geometry can use a denoised/clustered analysis image; final quantization should use linear/OKLab-aware choices, palette constraints, and optional dithering after geometry is fixed.
8. **Treat already-pixel-art as a first-class case.** Detect aligned 1:1/native grids and offer no-op palette/trim operations. Never infer visual block size as permission to destructively shrink without a requested target.
9. **Budget browser work.** Enforce decoded-pixel and estimated-memory limits, stream/sample analysis when possible, support cancellation, and expose progress by stage.
10. **Build a golden corpus around this failure taxonomy.** Include exact aligned blocks, hard-edge plateaus, blurred AI-like blocks, isoluminant palettes, alpha fringes, transparent padding, rectangular pixels, rotation/skew, mixed-scale sheets, thin diagonals, dithering, low-res originals, smooth raster art, and format/metadata cases.

## Unresolved questions

- **UNKNOWN:** Is the deployed WASM binary built from exactly the pinned public commit? The public behavior and API shape match, but no build provenance/SRI-to-commit mapping was published.
- **UNKNOWN:** Is the complete paid desktop UI source publicly available, and under what license? The Rust core is MIT; the separate Svelte UI was not located in this repository.
- **UNKNOWN:** Are outputs bit-identical across native x86, ARM, and WASM for adversarial centroid/tie cases?
- **UNKNOWN:** How does the current decoder path handle ICC profiles, PNG gamma chunks, and JPEG EXIF orientation in practice? The core does not explicitly manage them.
- **UNKNOWN:** Does the web deployment enforce the displayed 10MB limit elsewhere? The inspected page module filters MIME type but contains no file-size check; the Rust core limits dimensions, not encoded bytes.
- **UNKNOWN:** What analytics/session-recording configuration is active beyond the explicit metadata event? The inspected Pixel Snapper helper did not transmit image bytes, but this was not a full network/privacy audit of every third-party script.
- **UNKNOWN:** What real corpus and metric drove the hard-coded thresholds (`0.2`, `4`, `0.35`, `0.5`, `64`, `1.8`)? No benchmark dataset, evaluation report, or golden-image suite is public.
- **UNKNOWN:** How often does `--pixel-size` produce the intended logical dimensions on real assets? The source proves it is not a hard dimension constraint, but a native executable was unavailable for a broad override sweep.
- **UNKNOWN:** Are RGB-mode PNGs intended, or should custom-palette outputs be indexed PNGs? Current code always writes RGBA.

## Bottom line

Pixel Snapper is valuable prior art for **deterministically collapsing a near-pixel-art raster onto an inferred logical grid**. Its success comes from a pragmatic combination of analysis quantization, locally elastic boundaries, and categorical cell voting. Its most important lesson for Pixilate is also its central limitation: implicit-grid recovery is a specialized hypothesis about the source, not a replacement for exact target-size resizing.

Pixilate should preserve the determinism, local processing, stage separation, and inspectability while replacing non-target-governed output dimensions with an exact target contract, richer confidence-scored geometry, explicit trim/canvas semantics, independent quantization, and topology-aware optional cleanup.
