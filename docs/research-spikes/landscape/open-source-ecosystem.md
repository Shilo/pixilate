# Open-source ecosystem for deterministic raster-to-pixel conversion

**Research snapshot:** 2026-07-31  
**Addendum:** 2026-10-19 inventory additions and corrections ([addendum](#addendum--2026-10-19-inventory-additions)); where it differs from the July text, the addendum governs.  
**Scope:** source-level engineering survey for Pixilate; no application implementation  
**License note:** this is engineering research, not legal advice. SPDX identifiers and repository license files are useful screening inputs, not a substitute for counsel or a complete provenance audit.

## Executive result

There is no open-source project in this survey that already provides Pixilate's complete intended contract:

1. accept arbitrary raster, AI “mixel,” or already-pixelated input;
2. infer a latent pixel grid when one exists, including non-integer scale, independent X/Y scale, and phase offset;
3. resize to an **exact** target width and height, optionally measured from alpha-visible bounds under a serialized threshold (default `alpha > 0`);
4. preserve alpha correctly, in an explicit color space, without hidden-RGB halos;
5. suppress isolated pixels and unstable topology without erasing intentional one-pixel features;
6. generate or apply an exact-size palette with deterministic tie-breaking; and
7. reproduce canonical output pixels from a declared engine/version/settings tuple; byte-identical encoded files are a separate conditional claim requiring a pinned encoder policy.

The most relevant reusable foundations in this survey are narrower:

- **Resampling:** [Pica](https://github.com/nodeca/pica) is a focused browser-native JavaScript baseline; [fast_image_resize](https://github.com/Cykooz/fast_image_resize) is a relevant permissive Rust/Wasm-oriented candidate; the [libvips](https://github.com/libvips/libvips) family is a feature-rich native/Wasm processing stack but introduces LGPL and substantial dependency-closure obligations.
- **Palette quantization:** [image-q](https://github.com/ibezkrovnyi/image-quantization) is the most reusable pure TypeScript option; [ExoQuant](https://github.com/exoticorn/exoquant) is a compact alpha-aware MIT C reference; the old [lovell/libimagequant](https://github.com/lovell/libimagequant) v2.4.1 fork is BSD-2-Clause and technically attractive, while the current [ImageOptim/libimagequant](https://github.com/ImageOptim/libimagequant) is GPL-3.0-or-later/commercial and is not approved for the planned production bundle absent a deliberate GPL-compliance or commercial-license path.
- **Foreground selection:** [magic-wand-js](https://github.com/Tamersoul/magic-wand-js) is a deterministic, tiny color-connected selector; [OpenCV GrabCut](https://github.com/opencv/opencv/blob/e35ad60e4e1db55be854df5770f706af65803690/modules/imgproc/src/grabcut.cpp) is much more capable but requires a user seed/rectangle or mask, an explicit RNG seed, a large build, and still cannot infer the intended foreground in every image.
- **Direct “image to pixel art” projects:** useful as behavioral references, not as a production core. They generally downsample with browser canvas, nearest-neighbor, local mode, or a single fragile grid heuristic. None combines exact sizing, robust grid inference, linear-light premultiplied-alpha reduction, topology control, and strong reproducibility tests.

The likely architecture is therefore a small Pixilate-owned deterministic pipeline, with selected permissive primitives behind stable internal interfaces. The product should not promise “works perfectly for every image”; foreground/background intent and one-pixel artistic intent are information-theoretically ambiguous. It can promise a deterministic result, explicit modes, confidence reporting, reversible settings, and no hidden AI processing.

## Relationship to the dedicated product spikes

The following projects have their own deeper product audits and are intentionally not duplicated here:

- [PixelLab](../products/pixellab.md)
- [SpriteFusion Pixel Snapper](../products/spritefusion-pixel-snapper.md)
- [Unfake.js](../products/unfake-js.md)

This document cross-references SpriteFusion and Unfake in the inventory and reuse conclusions, but focuses on the surrounding open-source ecosystem and reusable primitives.

## Bounded search and verification method

### Search boundary

The survey was deliberately broad but finite:

- repositories and packages discoverable through GitHub, npm/crates package metadata, upstream documentation, and source references in related projects;
- pixelation/conversion, latent-grid detection, image resize/downscale, palette extraction/quantization, dithering, alpha-aware filtering, deterministic selection/matting, and relevant browser/Wasm ports;
- active and historically influential projects, including candidates whose license or design makes them unsuitable;
- source available on 2026-07-31, with the most relevant repositories pinned to the exact default-branch HEAD inspected below.

The survey did **not** attempt to enumerate every one-file tutorial, shader toy, closed desktop product, model checkpoint, or thin UI wrapper. A candidate entered the inventory only if it had identifiable source, a reusable algorithm or instructive failure mode, and a repository/package that could be verified. Marketing-only sites and projects without a license are flagged rather than treated as open-source dependencies.

### What “source-derived” and “inference” mean

- **Source-derived fact** means the statement follows directly from the pinned source, manifest, tests, or license text linked nearby.
- **Engineering inference** means a consequence inferred from that code, such as likely cross-browser variation or insufficient topology preservation. Inferences are labeled.
- In the shared project taxonomy, **Source-derived fact** maps to **CODE-DERIVED** and **Engineering inference** maps to **INFERRED**. Unprefixed license/status cells in the inventory are explicitly surface signals, not evidence that a distributed artifact is closed for reuse.
- No candidate was assumed deterministic merely because it has no obvious call to `random()`. Floating-point evaluation, parallel reduction order, decoder versions, browser canvas implementations, SIMD dispatch, unstable sorting, and unspecified tie-breaking can all change bits.

### Verification dimensions

For the deep set, the audit checked:

- exact target-dimension semantics and aspect/crop behavior;
- algorithm and tie-breaking visible in source;
- treatment of alpha and hidden RGB;
- color-space/gamma assumptions;
- tests and golden-output coverage;
- browser/Wasm feasibility and performance posture;
- randomness, concurrency, and cross-runtime reproducibility risks;
- repository maintenance signal at the pinned revision; and
- top-level SPDX/license plus direct dependency-closure risks.

No third-party code was copied into Pixilate, no third-party build was vendored, and no application artifact was created. Source archives were inspected read-only and in memory.

## Pinned source-audit ledger

“HEAD date” is the commit date of the exact revision inspected, not a claim about release cadence. “Active” only means recent default-branch activity at this snapshot.

| Candidate | Pinned revision | HEAD date / posture | Declared license |
|---|---|---:|---|
| [Astropulse/pixeldetector](https://github.com/Astropulse/pixeldetector/tree/6267db449241135515a6252f46db119f446683b0) | `6267db449241135515a6252f46db119f446683b0` | 2023-07-19; small/stale | MIT |
| [giventofly/pixelit](https://github.com/giventofly/pixelit/tree/9c53dfa191fcb2f4a4507c21f40647c29e352939) | `9c53dfa191fcb2f4a4507c21f40647c29e352939` | 2025-11-05; maintained | MIT |
| [Tezumie/Image-to-Pixel](https://github.com/Tezumie/Image-to-Pixel/tree/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78) | `b0d5b7422db309dae22c2a69d4ebca0ce8c14b78` | 2025-08-16; recent small project | library MIT template; app Apache-2.0 |
| [gametorch/image_to_pixel_art_wasm](https://github.com/gametorch/image_to_pixel_art_wasm/tree/4cf0fff2dfbba410cbabcc67fb638a3032af76b5) | `4cf0fff2dfbba410cbabcc67fb638a3032af76b5` | 2025-07-23; young | MIT |
| [image-q](https://github.com/ibezkrovnyi/image-quantization/tree/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q) | `d1a4ac4a3b00c456737a03909b1bb523c569da25` | 2022-01-08; mature/stale | MIT |
| [RgbQuant.js](https://github.com/leeoniya/RgbQuant.js/tree/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988) | `dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988` | 2018-07-08; mature/stale | MIT |
| [ExoQuant](https://github.com/exoticorn/exoquant/tree/4ec54abaa078e948d52ab23d0457b56f8c96ba47) | `4ec54abaa078e948d52ab23d0457b56f8c96ba47` | 2018-02-20; dormant | MIT text in source/README |
| [rscolorq](https://github.com/okaneco/rscolorq/tree/220a506c6b18c1daacbf763ca72a7819ea982321) | `220a506c6b18c1daacbf763ca72a7819ea982321` | 2021-03-30; dormant | MIT OR Apache-2.0 |
| [ImageOptim/libimagequant](https://github.com/ImageOptim/libimagequant/tree/9388d26902c53854c4f666dc3f07db6504b16924) | `9388d26902c53854c4f666dc3f07db6504b16924` | 2026-06-21; active | GPL-3.0-or-later / commercial |
| [lovell/libimagequant](https://github.com/lovell/libimagequant/tree/ce5fdeb1ccd9db288950faa21fd09c42c0a59bbb) | `ce5fdeb1ccd9db288950faa21fd09c42c0a59bbb` | 2026-07-09; active fork | BSD-2-Clause plus retained notices |
| [Pica](https://github.com/nodeca/pica/tree/60c713882f4b8262fff8146fd1b137bf6e2d1c9b) | `60c713882f4b8262fff8146fd1b137bf6e2d1c9b` | 2026-06-26; active | MIT |
| [fast_image_resize](https://github.com/Cykooz/fast_image_resize/tree/6dc1fe2750a3f41a047ee69ca6fa4517d752d017) | `6dc1fe2750a3f41a047ee69ca6fa4517d752d017` | 2026-07-21; active | MIT OR Apache-2.0 |
| [image-rs/image](https://github.com/image-rs/image/tree/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f) | `034a1585dfec1b3eb2aa7489cf7d5825a98bf89f` | 2026-07-26; active development branch | MIT OR Apache-2.0 |
| [Photon](https://github.com/silvia-odwyer/photon/tree/139038385b0cca7a743a2e5dd451c9e626b6b880) | `139038385b0cca7a743a2e5dd451c9e626b6b880` | 2026-07-02; active | Apache-2.0 |
| [libvips](https://github.com/libvips/libvips/tree/2ff898f0a1637c45d15db532a7fbe2d30cc99aac) | `2ff898f0a1637c45d15db532a7fbe2d30cc99aac` | 2026-07-29; active | LGPL-2.1-or-later |
| [sharp](https://github.com/lovell/sharp/tree/3e0ac1412e8c9570b111de55b614ab72c5f4024b) | `3e0ac1412e8c9570b111de55b614ab72c5f4024b` | 2026-07-21; active | Apache-2.0 wrapper; libvips closure applies |
| [wasm-vips](https://github.com/kleisauke/wasm-vips/tree/0ae82018672c6a3694b563fd2cbb5158992ca936) | `0ae82018672c6a3694b563fd2cbb5158992ca936` | 2026-07-30; active/early | MIT wrapper; bundled LGPL and other notices |
| [OpenCV](https://github.com/opencv/opencv/tree/e35ad60e4e1db55be854df5770f706af65803690) | `e35ad60e4e1db55be854df5770f706af65803690` | 2026-07-17; active | Apache-2.0 |
| [magic-wand-js](https://github.com/Tamersoul/magic-wand-js/tree/a3b0903f3db031b431caf24e6b2d28f26413e7de) | `a3b0903f3db031b431caf24e6b2d28f26413e7de` | 2020-10-13; dormant | MIT |

## Deep source audits

### 1. Astropulse `pixeldetector`: instructive grid heuristic, not a robust detector

**Source-derived facts**

- The detector converts the image to a NumPy array, computes adjacent RGB differences, sums them per axis, finds all positive peaks with SciPy, and estimates source pixel scale as the median spacing between peaks. It then derives an output size by dividing image dimensions by those medians ([detector source](https://github.com/Astropulse/pixeldetector/blob/6267db449241135515a6252f46db119f446683b0/pixeldetector.py#L41-L65)).
- Each destination cell is cropped from the original, locally quantized to two colors with Pillow, and replaced by the most frequent of those two colors ([tile reducer](https://github.com/Astropulse/pixeldetector/blob/6267db449241135515a6252f46db119f446683b0/pixeldetector.py#L14-L39)).
- Optional palette-size selection repeatedly quantizes from 1 through `max_k`, computes distortion, and chooses an “elbow” from the largest relative distortion change ([palette selection](https://github.com/Astropulse/pixeldetector/blob/6267db449241135515a6252f46db119f446683b0/pixeldetector.py#L67-L96)).
- The command opens and returns RGB, so alpha is discarded ([I/O](https://github.com/Astropulse/pixeldetector/blob/6267db449241135515a6252f46db119f446683b0/pixeldetector.py#L98-L121)). There is no automated test suite in the pinned tree.

**Engineering inference**

- `npim` is `uint8`; subtracting adjacent channels before squaring can wrap modulo 256. That makes the edge-energy signal mathematically wrong for many transitions unless NumPy happens to upcast at an expression boundary, which this expression does not request.
- `find_peaks(... height=0.0, distance=1)` admits almost every local gradient peak. On textured AI art, peak spacings tend toward 1, so the median is usually not the latent block size. It also has no phase estimate, confidence score, harmonic rejection, or protection against empty peak-spacing arrays.
- Local two-color mode can preserve dark outlines better than a plain average, but it is separable from any global palette and can create inconsistent colors and orphan pixels across cell boundaries.

**Verdict:** study only. Reimplementing its concept as a multi-signal lattice estimator may be useful; the source itself should not become Pixilate's detector.

### 2. Pixel It!: simple browser effect, not deterministic raster reduction

**Source-derived facts**

- Pixel It! draws the source into a small temporary canvas using the browser's default `drawImage` interpolation, disables smoothing only for the enlargement back to the original canvas, and uses a fractional `scale` rather than an exact latent-grid target ([pixelate path](https://github.com/giventofly/pixelit/blob/9c53dfa191fcb2f4a4507c21f40647c29e352939/src/pixelit.js#L167-L239)).
- Its palette conversion performs nearest-color matching with Euclidean distance in stored RGB values. Exact ties select the **later** palette entry because the comparison is `<=` ([palette match](https://github.com/giventofly/pixelit/blob/9c53dfa191fcb2f4a4507c21f40647c29e352939/src/pixelit.js#L126-L161)).
- The palette mapper changes RGB but leaves alpha bytes untouched ([palette application](https://github.com/giventofly/pixelit/blob/9c53dfa191fcb2f4a4507c21f40647c29e352939/src/pixelit.js#L260-L275)).
- `resizeImage` supports max width/max height, not an unconditional exact output box; height takes precedence if both constraints are exceeded, and canvas dimension conversion performs implicit integer conversion ([resize path](https://github.com/giventofly/pixelit/blob/9c53dfa191fcb2f4a4507c21f40647c29e352939/src/pixelit.js#L278-L317)). The package has no runtime dependencies and is MIT.

**Engineering inference**

- The downsample is browser-canvas-defined, not bit-stable across browser engines/versions. Canvas commonly performs premultiplied-alpha filtering, but the exact filter and color-space behavior are not controlled here.
- Mapping transparent pixels' hidden RGB while retaining alpha can make later unpremultiplication or compositing behavior surprising.
- The files named “tests” are demonstration/performance pages, not a golden-output or assertion-based regression suite.

**Verdict:** study only. The UX simplicity is useful; the raster core is insufficient for Pixilate.

### 3. Tezumie `Image-to-Pixel`: useful explicit-width/dither reference with canvas and license caveats

**Source-derived facts**

- The library takes an explicit pixel width, calculates height by rounded aspect ratio, and downsamples through `CanvasRenderingContext2D.drawImage` ([dimension and resize path](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/image-to-pixel.js#L43-L82)). It cannot independently set exact width and exact height.
- It provides fixed Floyd–Steinberg, Atkinson, Bayer/ordered, and clustered matrices, then finds the nearest palette entry using squared Euclidean RGB distance. Exact ties retain the **earlier** palette entry ([dither dispatch](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/image-to-pixel.js#L84-L108), [nearest color](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/image-to-pixel.js#L465-L486)).
- Error diffusion uses a `Float32Array` and a fixed left-to-right scan; ordered matrices are fixed, so post-resize mapping has explicit ordering ([Floyd–Steinberg](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/image-to-pixel.js#L389-L426)).
- RGB is quantized while alpha is left untouched; neither nearest-color matching nor diffusion weights alpha. Palette lookup by Lospec slug introduces a network dependency ([palette fetch](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/image-to-pixel.js#L308-L345)).
- The app is Apache-2.0, while the standalone library claims MIT. The library license file still contains `[YEAR] [YOUR NAME]` placeholders ([license file](https://github.com/Tezumie/Image-to-Pixel/blob/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78/LICENSE-library.txt#L1-L13)).

**Engineering inference**

- The controlled dither stage is deterministic within a JavaScript runtime, but the preceding browser-canvas downsample prevents an end-to-end bit-exact guarantee.
- Straight RGB error diffusion across nearly transparent pixels can leak irrelevant hidden color into the palette result.
- The incomplete copyright attribution makes direct reuse legally untidy even though the intended license is permissive. Ask the maintainer to correct it or independently implement the standard algorithms.

**Verdict:** study only; reimplement the small standard dither kernels with explicit alpha/color-space policy.

### 4. GameTorch `image_to_pixel_art_wasm`: closest small converter, but young and internally inconsistent

**Source-derived facts**

- Opaque/nonzero-alpha pixels are converted from sRGB to Lab and clustered by `kmeans_colors` with 20 iterations, tolerance `1e-4`, and seed `0` ([quantization call](https://github.com/gametorch/image_to_pixel_art_wasm/blob/4cf0fff2dfbba410cbabcc67fb638a3032af76b5/src/lib.rs#L37-L93)). Custom palettes use nearest RGB rather than Lab. Alpha is preserved per source pixel during recoloring.
- Contrary to the README's nearest-neighbor downsample description, the current source first quantizes and then uses a two-pass histogram reducer. Each pass chooses the most frequent RGBA value with a configurable dark-color weighting and darkest-luminance tie-break ([histogram reducer](https://github.com/gametorch/image_to_pixel_art_wasm/blob/4cf0fff2dfbba410cbabcc67fb638a3032af76b5/src/lib.rs#L196-L357)). Enlargement is nearest-neighbor.
- Output dimensions preserve aspect ratio with a “longest side” scale; `output_size` is also a longest-side concept, not an exact independent width/height contract ([public API and stated behavior](https://github.com/gametorch/image_to_pixel_art_wasm/blob/4cf0fff2dfbba410cbabcc67fb638a3032af76b5/README.md#L10-L32)).
- The histogram is a fixed 64-entry array. New distinct RGBA values are ignored after `min(n_colors, 64)` entries, in scan order ([cap behavior](https://github.com/gametorch/image_to_pixel_art_wasm/blob/4cf0fff2dfbba410cbabcc67fb638a3032af76b5/src/lib.rs#L219-L256)).
- The MIT crate depends directly on `image`, `kmeans_colors`, `palette`, `wasm-bindgen`, `getrandom`, and `js-sys`; native CLI dependencies are optional ([manifest](https://github.com/gametorch/image_to_pixel_art_wasm/blob/4cf0fff2dfbba410cbabcc67fb638a3032af76b5/Cargo.toml#L1-L27)). No automated tests are present in the pinned tree.

**Engineering inference**

- Seed `0` makes the clustering path intentionally repeatable, but float math and dependency-version drift still prevent an unqualified cross-platform byte-identity claim.
- Treating different alpha values as different histogram colors can consume the 64-entry cap and select an RGBA sample for the whole cell rather than a coverage-correct premultiplied result.
- The separable vertical-then-horizontal mode is not equivalent to a 2D cell histogram and is directionally biased.
- The “first 64 encountered” behavior means the effective candidate set can diverge from a caller's requested `n_colors`; Pixilate must not adopt that API behavior without an explicit cap contract.

**Verdict:** useful MIT study/reference, especially quantize-before-mode reduction. Do not adopt unchanged; add exact geometry, 2D coverage, bounds checking, premultiplied alpha, tests, and a locked dependency graph.

### 5. `image-q`: broad pure TypeScript palette laboratory

**Source-derived facts**

- `image-q` implements Wu quantization, NeuQuant, and an RgbQuant variant; nearest-color and several error-diffusion/Riemersma image quantizers; and Euclidean, Manhattan, CMetric, pngquant-style, CIE94, and CIEDE2000 distance functions. The package is MIT and emits browser-neutral ESM/CJS bundles ([manifest](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/package.json#L1-L60)).
- Wu quantization is four-dimensional RGBA: alpha is histogrammed, included in moments, distance matching, and generated palette colors ([Wu RGBA model](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/src/palette/wu/wuQuant.ts#L88-L140), [RGBA accumulation](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/src/palette/wu/wuQuant.ts#L293-L310)).
- NeuQuant initialization and traversal are fixed and prime-step-based, not randomly seeded ([learning order](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/src/palette/neuquant/neuquant.ts#L197-L288)).
- Ties in Wu nearest-centroid assignment keep the earlier lookup because the comparison is strict `<` ([assignment](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/src/palette/wu/wuQuant.ts#L253-L289)).
- The repository contains conversion/distance unit tests and golden snapshots over many quantizer/distance/dither combinations ([sample tests](https://github.com/ibezkrovnyi/image-quantization/tree/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/tests)). It does not resize images.
- Its license file preserves the upstream NeuQuant notice and RgbQuant attribution in addition to MIT ([license/provenance](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/LICENSE#L1-L49)).

**Engineering inference**

- This is the most useful browser-side experiment platform because Pixilate can compare palette algorithms and metrics behind one API without native/Wasm startup cost.
- Alpha in a four-dimensional distance is not automatically “correct” for sprites. Fully transparent hidden RGB should usually be canonicalized or excluded, and alpha coverage may deserve a separate weight or palette slot policy.
- CIE conversions improve perceptual options, but the pipeline still needs an explicit declaration of whether clustering/diffusion is performed in encoded sRGB, Lab, or linear light.
- Repository inactivity since 2022 increases maintenance risk, but the test corpus and small dependency surface make an audited fork plausible.

**Verdict:** permissively licensed production candidate after dependency locking, alpha-policy tests, and cross-engine golden hashes.

### 6. `RgbQuant.js`: deterministic and compact, but obsolete alpha behavior

**Source-derived facts**

- RgbQuant builds either a global 1D color histogram or a local-box 2D histogram, prunes similar colors by an increasing distance threshold, supports fixed palettes, and provides multiple error-diffusion kernels ([construction/options](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/src/rgbquant.js#L9-L79), [palette reduction](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/src/rgbquant.js#L399-L489)).
- Fully transparent pixels are excluded from histogramming and map to transparent black ([histogram](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/src/rgbquant.js#L507-L527), [nearest lookup](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/src/rgbquant.js#L605-L639)). Semi-transparent pixels do not get equivalent treatment; palette/dither output writes alpha as 255 in the relevant packed colors.
- Nearest-color ties retain the earlier palette entry (`dist < min`). The project explicitly tests whether the host engine has stable `Array.sort` and substitutes its own stable sort if not ([stable-sort fallback](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/src/rgbquant.js#L798-L832)).
- Version 1.1.2 has no runtime dependencies and is MIT ([package](https://github.com/leeoniya/RgbQuant.js/blob/dd80ef94c2256eb0af4b8451b3f5c4e1b5a70988/package.json)). The default branch has not changed since 2018 and lacks a modern assertion/golden test harness.

**Engineering inference**

- Its explicit stable-sort handling and lack of RNG are unusually good determinism signals for an older JS quantizer.
- The local-box histogram's own comment says it can over-reduce rare colors. This maps directly to Pixilate's risk of losing eyes, highlights, or single-pixel accents.
- Semi-transparent output is not suitable for a general alpha-preserving web tool without substantial changes.

**Verdict:** study and benchmark against `image-q`; do not use unchanged.

### 7. ExoQuant: strong compact alpha-aware C reference

**Source-derived facts**

- ExoQuant builds a histogram in RGBA, premultiplies RGB by alpha by default, recursively splits color clusters, and optionally performs palette optimization. It supports a shared palette across images and fixed or generated palettes ([API and data model](https://github.com/exoticorn/exoquant/blob/4ec54abaa078e948d52ab23d0457b56f8c96ba47/exoquant.h#L58-L120), [feed/premultiply](https://github.com/exoticorn/exoquant/blob/4ec54abaa078e948d52ab23d0457b56f8c96ba47/exoquant.c#L92-L135)).
- It includes nearest mapping and a deterministic four-phase ordered dither matrix. The function named `exq_map_image_random` selects the non-ordered variant, but the inspected source does not use a random-number generator in palette creation or ordered mapping ([dither path](https://github.com/exoticorn/exoquant/blob/4ec54abaa078e948d52ab23d0457b56f8c96ba47/exoquant.c#L481-L579)).
- The source and README contain the full MIT grant and copyright notice ([license](https://github.com/exoticorn/exoquant/blob/4ec54abaa078e948d52ab23d0457b56f8c96ba47/README.md#L62-L84)). It is two C source/header files with no external runtime dependency beyond the C environment.
- There is no automated test suite in the pinned repository, and default-branch development stopped in 2018.

**Engineering inference**

- Premultiplying color before RGBA clustering is closer to correct sprite behavior than most JavaScript quantizers, although it still needs a declared gamma/linear-light policy.
- A small C implementation is straightforward to compile to Wasm, but the absence of golden tests and dormant maintenance means Pixilate would effectively own validation and security hardening.
- Recursive floating-point cluster calculations can be repeatable in one build without being guaranteed bit-identical across compilers/architectures.

**Verdict:** permissive and valuable as an algorithm/reference candidate. Prefer an independently tested port or an isolated Wasm module with golden vectors.

### 8. `rscolorq`: high-quality spatial quantization with an explicit determinism switch

**Source-derived facts**

- `rscolorq` is a Rust port of `scolorq` implementing spatial color quantization through multiscale simulated annealing. It can create a palette or dither to a supplied palette; filters are 1×1, 3×3, or 5×5 ([parameters](https://github.com/okaneco/rscolorq/blob/220a506c6b18c1daacbf763ca72a7819ea982321/src/quant.rs#L9-L140)).
- Random initialization and random pixel permutations use `rand_pcg`. `Params.seed` is optional; when omitted the generator is entropy-seeded, while a supplied `u64` seed makes the random sequence reproducible ([RNG construction and initialization](https://github.com/okaneco/rscolorq/blob/220a506c6b18c1daacbf763ca72a7819ea982321/src/quant.rs#L192-L240), [random permutation](https://github.com/okaneco/rscolorq/blob/220a506c6b18c1daacbf763ca72a7819ea982321/src/quant/utility.rs#L19-L35)).
- The crate is MIT OR Apache-2.0 and has a checked-in `Cargo.lock`; direct dependencies are `rand`, `rand_pcg`, and optional `image`, `palette`, and `structopt` ([manifest](https://github.com/okaneco/rscolorq/blob/220a506c6b18c1daacbf763ca72a7819ea982321/Cargo.toml)).
- The last release change in the pinned tree is 0.2.0 from March 2021 ([changelog](https://github.com/okaneco/rscolorq/blob/220a506c6b18c1daacbf763ca72a7819ea982321/CHANGELOG.md)). It does not handle resizing or alpha as an independent channel in the surveyed RGB/Lab paths.

**Engineering inference**

- A mandatory seed and pinned crate graph would make runs repeatable, but annealing plus floating-point math is expensive for live browser previews and still needs cross-target proof.
- Spatial quantization is designed to trade local color choices for perceived mixtures. At very small pixel-art targets, that may intentionally create the “noise” and isolated pixels Pixilate often wants to suppress.
- Its primary value here is as an offline quality oracle or advanced optional mode, not the default 16–32-color sprite quantizer.

**Verdict:** study/optional advanced component. Never expose an unseeded path in a deterministic product.

### 9. The two `libimagequant` lines must not be conflated

#### Current ImageOptim/libimagequant v4

**Source-derived facts**

- The current Rust library combines repeated median-cut trials, K-means refinement, gamma-aware RGBA palette generation, quality targets, importance maps, and edge/noise-aware Floyd–Steinberg dithering ([palette search](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/src/quant.rs#L383-L469), [dither map and remap](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/src/remap.rs#L108-L239)).
- Median-cut source explicitly adds secondary sort keys so repeated trials do not depend on sorting randomness ([median-cut ordering](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/src/mediancut.rs#L79-L105)). No RNG call exists in the inspected palette source.
- RGBA, transparency, background-aware remapping, output gamma, and posterization are first-class. It does not decode/encode or resize images.
- Default builds use Rayon threads; Wasm builds are expected to disable threads unless special support is configured ([features/Wasm note](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/Cargo.toml#L17-L50), [README](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/README.md#L101-L114)).
- The crate is explicitly `GPL-3.0-or-later`; a commercial license is offered for non-GPL uses ([license declaration](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/Cargo.toml#L1-L12), [terms](https://github.com/ImageOptim/libimagequant/blob/9388d26902c53854c4f666dc3f07db6504b16924/README.md#L32-L41)).

**Engineering inference**

- This is the quality benchmark to beat for general RGBA quantization. Its edge-aware dither suppression and importance maps align strongly with Pixilate.
- Parallel floating-point reductions and target-specific floating behavior require golden tests before claiming cross-platform byte identity; disable threading for the strict mode.
- Under the current plan, GPL embedding is not approved for the production bundle. A compliant alternative would require deliberately distributing under GPL-compatible terms, establishing an appropriate component/process boundary, or obtaining a commercial license; the MIT license on Pixilate-owned files would not relicense the dependency.

#### lovell/libimagequant v2.4.1 fork

**Source-derived facts**

- The fork identifies itself as the BSD-2-Clause licensed v2.4.1 line, retains historical notices, has C source plus tests, and is actively maintained for the sharp/wasm-vips ecosystem ([README](https://github.com/lovell/libimagequant/blob/ce5fdeb1ccd9db288950faa21fd09c42c0a59bbb/README.md), [copyright/license](https://github.com/lovell/libimagequant/blob/ce5fdeb1ccd9db288950faa21fd09c42c0a59bbb/COPYRIGHT), [build/test declaration](https://github.com/lovell/libimagequant/blob/ce5fdeb1ccd9db288950faa21fd09c42c0a59bbb/meson.build#L1-L60)).
- It is the version statically included by the inspected wasm-vips build, whose third-party notice reports it as BSD-2-Clause ([wasm-vips notices](https://github.com/kleisauke/wasm-vips/blob/0ae82018672c6a3694b563fd2cbb5158992ca936/THIRD-PARTY-NOTICES.md#L7-L27)).

**Engineering inference**

- This is a relevant permissive native quantizer candidate, but the license history warrants a provenance review of the exact fork and every retained file before adoption.
- It is older than v4 and should be benchmarked for palette quality, alpha edges, and deterministic single-thread behavior rather than assumed equivalent.

**Verdict:** current v4 is study/oracle-only under the current production-distribution plan unless a GPL-compliant or commercial-license path is deliberately selected; the BSD fork is a conditional reuse candidate after legal/provenance and golden-output review.

### 10. Pica: focused browser resampler with explicit limits

**Source-derived facts**

- Pica accepts exact `toWidth` and `toHeight` for an RGBA buffer and provides box, Hamming, Lanczos2, Lanczos3, and default Magic Kernel Sharp 2013 filters ([API](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/README.md#L197-L210), [filter definitions](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/src/mm_resize/resize_filter_info.ts)).
- Filter weights are generated into signed 14-bit fixed-point tables with a normalization-error correction, then applied in separable convolution ([filter generation](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/src/mm_resize/resize_filter_gen.ts#L13-L119)).
- It detects non-opaque input and uses premultiplied-alpha horizontal and vertical paths, unpremultiplying the result ([alpha dispatch](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/src/mm_resize/resize.ts#L1-L46), [premultiplied convolution](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/src/mm_resize/convolve.ts#L138-L264)).
- The library contains matching JavaScript and Wasm math backends, web-worker tiling, unit tests, browser tests, and fixture-based output comparison. Its normal browser feature set is JS/Wasm/workers; the optional `createImageBitmap` path is documented as browser-dependent and disabled by default ([feature warning](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/README.md#L133-L154), [test tree](https://github.com/nodeca/pica/tree/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/test)).
- Pica explicitly states that browser canvas does not expose gamma information and that its 8-bit pipeline is not a professional color-managed resizer ([quality limitation](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/README.md#L65-L72)).
- It is MIT. Direct runtime dependencies are `glur` and `multimath`; the manifest uses semver ranges and the repository snapshot has no committed package lock, so a consumer must create and audit its own exact closure ([manifest](https://github.com/nodeca/pica/blob/60c713882f4b8262fff8146fd1b137bf6e2d1c9b/package.json#L1-L99)).

**Engineering inference**

- Fixed-point filters and matched JS/Wasm paths make Pica more reproducibility-friendly than Canvas2D resizing.
- It is still a photographic resampler. None of its filters performs grid inference, dominant-cell selection, topology cleanup, or rare-feature preservation.
- Pica's `box` label is nearest-neighbor at a 0.5 window in this filter table, not a full area-coverage reducer; Pixilate should not infer “box” means alpha-weighted pixel-area integration without testing.
- Strict mode should disable `createImageBitmap`, pin backend choice, pin versions, and hash fixture outputs per browser engine.

**Verdict:** strong safe reuse candidate for browser previews and conventional resampling. Pixilate still needs its own pixel-art reducers and color-management contract.

### 11. `fast_image_resize`: relevant permissive foundation for a strict resize kernel

**Source-derived facts**

- The Rust crate accepts caller-sized destination views and implements nearest-neighbor, convolution, interpolation, and supersampling algorithms. Its standard convolution choices are Box, Bilinear, Hamming, Catmull–Rom, Mitchell–Netravali, Gaussian, and Lanczos3, with a custom-filter API ([algorithm declarations](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/src/resizer.rs#L10-L57), [filter functions](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/src/convolution/filters.rs#L80-L173)).
- Alpha premultiplication and unpremultiplication are enabled by default for supported multi-channel pixel types. They may be disabled explicitly ([resizer options](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/src/resizer.rs#L42-L57), [alpha-aware dispatch](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/src/resizer.rs#L318-L351)).
- Color-space conversion is not automatic. The README demonstrates explicit gamma 2.2 and sRGB mapping before resize and reverse mapping afterward ([color-space examples](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/README.md#L7-L56), [alpha example](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/README.md#L92-L116)).
- It contains scalar, SSE4.1, AVX2, NEON, and wasm32 SIMD implementations. `CpuExtensions::None` forces the scalar path. The repository has checksum-based resize tests, alpha tests, and architecture-specific test modules ([test tree](https://github.com/Cykooz/fast_image_resize/tree/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/tests)).
- The crate is dual MIT/Apache-2.0; Rayon is optional rather than mandatory ([manifest](https://github.com/Cykooz/fast_image_resize/blob/6dc1fe2750a3f41a047ee69ca6fa4517d752d017/Cargo.toml#L7-L58)). The pinned revision was current on 2026-07-21.

**Engineering inference**

- This is a relevant surveyed permissive base for an exact-dimension Rust/Wasm resize module because alpha handling, color conversion, CPU dispatch, and tests are explicit rather than delegated to Canvas2D.
- SIMD and scalar paths may differ at rounding boundaries unless proven otherwise. A byte-identical strict mode should select one path—initially scalar—and test every enabled Wasm/browser target before relaxing that rule.
- Its general resamplers still cannot infer an intended pixel grid or preserve small semantic details automatically.

**Verdict:** adopt or wrap as the conventional resampling substrate, subject to pinned dependencies and cross-backend golden tests. Build pixel-aware reducers above it.

### 12. `image-rs/image`: broad codec ecosystem, insufficient resize semantics by itself

**Source-derived facts**

- `image` provides exact output dimensions and Nearest, Triangle, Catmull–Rom, Gaussian, and Lanczos3 filters ([filter API](https://github.com/image-rs/image/blob/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f/src/imageops/sample.rs#L100-L192), [resize implementation](https://github.com/image-rs/image/blob/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f/src/imageops/sample.rs#L958-L1018)).
- Its own documentation says callers should typically supply scene-linear samples and that alpha is assumed to have been premultiplied. The operation does not perform either transformation for the caller ([contract](https://github.com/image-rs/image/blob/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f/src/imageops/sample.rs#L960-L978)).
- The repository has extensive inline resize tests and a broad codec test suite ([resize tests](https://github.com/image-rs/image/blob/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f/src/imageops/sample.rs#L1656-L1917)).
- It is MIT OR Apache-2.0, but default features pull a wide codec graph. The audited head is a development manifest rather than a published fixed release, so a consumer should select a released version and only the required formats ([manifest/features](https://github.com/image-rs/image/blob/034a1585dfec1b3eb2aa7489cf7d5825a98bf89f/Cargo.toml#L1-L107)).

**Engineering inference**

- The crate is most useful to Pixilate for controlled decoding/encoding and pixel buffers, not as the only resize engine. Calling `resize` directly on ordinary straight-alpha sRGB input can produce dark/bright edge contamination.
- Minimal codec features reduce license, security, download-size, and reproducibility surface. Image orientation, ICC profiles, animation frames, and malformed-input limits remain application responsibilities.

**Verdict:** conditional infrastructure candidate with minimal features. Do not expose its raw resize helper as the product algorithm.

### 13. Photon: convenient browser/Wasm facade over the same unresolved fundamentals

**Source-derived facts**

- Photon exposes a Wasm image API and wraps `image` crate resize filters. It accepts explicit width and height and maps numeric sampling codes to nearest, triangle, Catmull–Rom, Gaussian, and Lanczos3 ([resize wrapper](https://github.com/silvia-odwyer/photon/blob/139038385b0cca7a743a2e5dd451c9e626b6b880/crate/src/transform.rs#L182-L289)).
- Its crate snapshot depends on `image = 0.24.8`, `wasm-bindgen`, `web-sys`, and a broad set of image-processing crates ([manifest](https://github.com/silvia-odwyer/photon/blob/139038385b0cca7a743a2e5dd451c9e626b6b880/crate/Cargo.toml#L1-L96)).
- The inspected resize tests mainly verify dimensions and API behavior rather than alpha-edge, color-space, or byte-stability goldens ([tests](https://github.com/silvia-odwyer/photon/blob/139038385b0cca7a743a2e5dd451c9e626b6b880/crate/src/tests.rs#L337-L409)).
- Photon is Apache-2.0 and active, with the pinned head dated 2026-07-02.

**Engineering inference**

- Photon saves integration work but inherits `image`'s caller-managed linear-light and premultiplied-alpha contract while adding a larger dependency surface.
- It is a general effects library, not a pixel-grid detector, cell reducer, palette optimizer, or topology cleaner. Reusing it would not solve Pixilate's differentiating problems.

**Verdict:** do not adopt for the core pipeline. Use as a comparison implementation only.

### 14. `libvips`, Sharp, and `wasm-vips`: powerful deployment families, not one licensing answer

**Source-derived facts**

- `libvips` is a demand-driven, streaming image-processing library with resize and thumbnail operators, color-management operations, premultiply/unpremultiply operations, and broad codec support ([resize source](https://github.com/libvips/libvips/blob/2ff898f0a1637c45d15db532a7fbe2d30cc99aac/libvips/resample/resize.c), [license](https://github.com/libvips/libvips/blob/2ff898f0a1637c45d15db532a7fbe2d30cc99aac/LICENSE)). Upstream declares LGPL-2.1-or-later.
- Sharp is an Apache-2.0 Node wrapper around libvips. Its own license does not replace the licenses of the native libraries it distributes or loads ([package manifest](https://github.com/lovell/sharp/blob/3e0ac1412e8c9570b111de55b614ab72c5f4024b/package.json#L1-L40), [dependency declaration](https://github.com/lovell/sharp/blob/3e0ac1412e8c9570b111de55b614ab72c5f4024b/package.json#L160-L205)). It is a server/Node option, not a browser core.
- `wasm-vips` exposes libvips in browsers and workers. It requires modern Wasm features; multithreading requires `SharedArrayBuffer` plus cross-origin isolation headers ([browser requirements](https://github.com/kleisauke/wasm-vips/blob/0ae82018672c6a3694b563fd2cbb5158992ca936/README.md#L13-L66)).
- Although the wrapper package is MIT, the inspected distributed bundle's notices elect LGPLv3 for several components whose upstream terms allow “or later,” including GLib, libexif, libheif, and libvips, and list multiple other licenses ([third-party closure](https://github.com/kleisauke/wasm-vips/blob/0ae82018672c6a3694b563fd2cbb5158992ca936/THIRD-PARTY-NOTICES.md#L7-L32)). Record both each upstream license and the election made by the exact distributed build; satisfy notices, corresponding-source/relinking, and other applicable obligations. The static build downloads and compiles a large native stack ([build recipe](https://github.com/kleisauke/wasm-vips/blob/0ae82018672c6a3694b563fd2cbb5158992ca936/build.sh#L145-L190)).

**Engineering inference**

- Native libvips/Sharp are relevant to an optional user-controlled batch path because they handle large images efficiently. Matching them byte-for-byte to a smaller browser engine is a separate engineering problem; a server path is not part of Pixilate's local core.
- `wasm-vips` provides the widest toolbox but imposes a large download, deployment-header requirements, a large vulnerability surface, and LGPL compliance obligations. An MIT wrapper label does not describe or relicense the complete distributed static bundle.
- None of the three adds intended-grid inference or pixel-art topology controls.

**Verdict:** optional, separately packaged power backend after legal review. Do not make it the default client core or label the complete Wasm bundle MIT; retain component licenses and satisfy the obligations of the exact build.

### 15. Deterministic background selection: OpenCV GrabCut versus `magic-wand-js`

#### OpenCV GrabCut

**Source-derived facts**

- GrabCut requires an initial rectangle or foreground/background mask. It fits Gaussian-mixture foreground/background models, constructs a graph, computes a min-cut, and iterates ([initialization and GMM assignment](https://github.com/opencv/opencv/blob/e35ad60e4e1db55be854df5770f706af65803690/modules/imgproc/src/grabcut.cpp#L366-L412), [iteration](https://github.com/opencv/opencv/blob/e35ad60e4e1db55be854df5770f706af65803690/modules/imgproc/src/grabcut.cpp#L545-L596)).
- GMM component initialization calls OpenCV K-means with `KMEANS_PP_CENTERS`. OpenCV's own repeatability test fixes the global RNG state before calling GrabCut ([test seed](https://github.com/opencv/opencv/blob/e35ad60e4e1db55be854df5770f706af65803690/modules/imgproc/test/test_grabcut.cpp#L146-L174)).
- OpenCV is Apache-2.0 and builds to JavaScript/Wasm, but a useful browser build must be custom-pruned to avoid shipping the full library.

**Engineering inference**

- GrabCut can be reproducible only if Pixilate fixes the RNG state, input color conversion, iteration count, implementation build, and tie behavior. “Uses K-means++” is not evidence of determinism.
- It is deterministic interactive segmentation, not deterministic one-click background recognition. The user must supply a rectangle/mask or accept heuristic initialization failures.

#### `magic-wand-js`

**Source-derived facts**

- The library implements a scanline flood fill from a seed point, accepting pixels whose RGB channel distance from the seed remains below a supplied threshold ([flood-fill source](https://github.com/Tamersoul/magic-wand-js/blob/a3b0903f3db031b431caf24e6b2d28f26413e7de/src/MagicWand.js#L1-L119)). It also includes mask blur and contour tracing.
- The comparison path ignores alpha; the caller supplies raw image bytes, dimensions, and channel count. There is no semantic model, automatic subject selection, or matting.
- It is MIT, dependency-free at runtime, dormant since 2020, and has no automated test suite in the pinned tree.

**Engineering inference**

- A seeded integer flood fill is small, auditable, and highly reproducible. It is a strong primitive for click-to-remove flat or near-flat backgrounds, provided alpha is normalized explicitly.
- Thresholding in encoded RGB is not perceptually uniform. Gradients, shadows, hair, holes, antialiasing, and foreground colors close to the background require additional policy or manual repair.

**Verdict:** use a small independently tested flood-fill/connected-component implementation for the basic tool; consider seeded GrabCut as an explicitly optional advanced mode. There is no surveyed non-AI algorithm that can automatically remove every background correctly.

### 16. `perfectPixel`: the most relevant newly found grid-recovery reference

**Source-derived facts**

- `perfectPixel` is a small Python package specifically for distorted AI “pixel-style” input. It estimates horizontal and vertical grid counts from FFT magnitude, falls back to projected Sobel gradients, refines nominal grid boundaries toward strong gradient peaks, and samples each resulting cell ([algorithm description](https://github.com/theamusing/perfectPixel/blob/72096de5cf1bff9102687c4f89af6f62c4273a86/readme.md#L84-L90), [FFT and refinement implementation](https://github.com/theamusing/perfectPixel/blob/72096de5cf1bff9102687c4f89af6f62c4273a86/src/perfect_pixel/perfect_pixel_noCV2.py#L268-L330)).
- Users can override the detected `(grid_w, grid_h)` and choose center, median, or “majority” cell sampling. “Majority” is actually a seeded two-centroid color clustering procedure; for large cells it samples 128 pixels with NumPy RNG seed 0 and selects the larger cluster centroid ([sampling implementation](https://github.com/theamusing/perfectPixel/blob/72096de5cf1bff9102687c4f89af6f62c4273a86/src/perfect_pixel/perfect_pixel_noCV2.py#L178-L266), [public API](https://github.com/theamusing/perfectPixel/blob/72096de5cf1bff9102687c4f89af6f62c4273a86/src/perfect_pixel/perfect_pixel_noCV2.py#L396-L483)).
- It has OpenCV+NumPy and NumPy-only backends. It is RGB-only: no alpha-aware cell coverage, palette budget, topology cleanup, or arbitrary caller-requested output dimensions appear in the API.
- The package metadata declares MIT and requires NumPy; OpenCV is optional ([manifest](https://github.com/theamusing/perfectPixel/blob/72096de5cf1bff9102687c4f89af6f62c4273a86/pyproject.toml)). The root tree contains no standalone license text and no automated tests at the pinned 31-commit revision.

**Engineering inference**

- FFT periodicity plus edge-aligned nonuniform cells is a materially better starting model for warped AI mixels than a single median run length. It is the closest surveyed open-source reference to Pixilate's intended-grid problem.
- Its center sampling can erase thin details; per-channel median can synthesize a color absent from the cell; and two-cluster “majority” is neither an exact mode nor alpha-aware. Grid lines are chained outward from the image centre, and each line is snapped near the previous snapped line, so snapping errors can accumulate, bunch, or follow subject edges instead of the latent grid *(walk description corrected 2026-10-19 at the pinned revision)*.
- NumPy FFT and floating-point peak logic should not be assumed byte-stable across browser ports or native backends. The fixed seed only stabilizes one sampling mode within a fixed implementation.
- A metadata string is weaker reuse evidence than a repository license grant. Obtain a conventional MIT `LICENSE` file or author clarification before copying code; independently reimplementing the documented method remains available.

**Verdict:** highest-priority study/reference for grid inference and benchmark design, but not drop-in production code. Reimplement the ideas with confidence scoring, phase search, monotonic-boundary constraints, alpha support, exact target-size override, and goldens.

## Broader ecosystem inventory

This is an exhaustive-but-bounded inventory, not a claim that every GitHub experiment has been found. Search stopped after the major result families repeated: Canvas nearest-neighbor demos, palette/dither packages, conventional resizers, FFT/edge grid detectors, editor tools, and model-based background removers. “Surface scan” means the project was classified from its repository, manifest, and documentation but did not receive the same line-by-line audit as the sixteen entries above. Dates and activity are a July 31, 2026 snapshot.

**Inventory convention:** unprefixed license/status cells below are repository/manifest **surface signals**, not artifact-level dependency-closure conclusions. The pinned ledger and deep audits above are canonical wherever they cover the same project. An inventory row cannot authorize implementation adoption: before any experiment enters the package graph, pin an exact revision/release, lock features and transitive dependencies, and audit the produced artifact and notices. `UNKNOWN`, “surface scan,” and unresolved closure remain dated **2026-07-31** findings.

### Pixel/mixel conversion and editor projects

| Project | What it actually contributes | Important limitation | License/status signal | Pixilate disposition |
|---|---|---|---|---|
| [SpriteFusion Pixel Snapper](https://github.com/Hugo-Dz/spritefusion-pixel-snapper) | AI-mixel grid estimation, region walking, sampling, browser/Wasm workflow | Dedicated spike; heuristic limitations and non-target-governed outputs remain | Source-audited separately | Benchmark and selectively reuse only after dedicated conclusions |
| [Unfake.js](https://github.com/jenissimo/unfake.js) / [Unfaker](https://jenissimo.itch.io/unfaker) | Highly adjustable grid cleanup/downsample controls | Dedicated spike; manual parameter search rather than universal default | Source-audited separately | UX and advanced-control reference |
| [Astropulse/pixeldetector](https://github.com/Astropulse/pixeldetector) | Adjacent-difference grid-period estimate, tile mode, palette elbow | RGB-only, fragile unsigned arithmetic, no tests | MIT; dormant | Study only |
| [ComfyUI PixelArt Detector](https://github.com/dimtoneff/ComfyUI-PixelArt-Detector) | ComfyUI packaging of Astropulse-style operations | Inherits core weaknesses; some documentation overstates consistency | MIT; active fork/integration | Test corpus/reference, not core |
| [Pixel It](https://github.com/giventofly/pixelit) | Tiny Canvas pixelation and palette remap library | Canvas-dependent downsample; no intended-grid inference | MIT; active | Demo/UX reference |
| [Image-to-Pixel](https://github.com/Tezumie/Image-to-Pixel) | Browser filters, supplied palettes, multiple dithers | Canvas downsample, width-only target, alpha ignored by palette logic | Mixed/unclear app-vs-library licensing | Study only until licensing fixed |
| [image_to_pixel_art_wasm](https://github.com/gametorch/image_to_pixel_art_wasm) | Seeded Lab K-means plus histogram cell reduction in Rust/Wasm | Longest-side scale, 64-color internal cap, direction/scan-order biases | MIT; young/active | Mine patterns; do not adopt unchanged |
| [perfectPixel](https://github.com/theamusing/perfectPixel) | FFT grid counts, Sobel boundary refinement, cell sampling | RGB Python, no tests, no arbitrary target, fragile local-boundary walks | Metadata says MIT but no license file | Reimplement/benchmark after clarification |
| [SpriteBrew](https://github.com/GAlbanese09/spritebrew) | Product workflow, contour crop, threshold background tool, nearest 64×64 resize | “Pixel-perfect” resize is nearest-neighbor; AI product scope is broader | Active product; surface scan | UX/market reference, not an algorithm answer |
| [Dithertron](https://github.com/sehugg/dithertron) | Browser palette conversion with many retro machine constraints | Palette/dither studio, not grid recovery; GPL affects embedding | GPL-3.0; active | Study or separately hosted tool |
| [pixel-artify](https://github.com/marcusrprojects/pixel-artify) | Small Python pixelation experiment | No repository license grant; not alpha/grid robust | No license file; dormant | Reject code reuse |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | Mature pixel editor, palettes, indexed workflows, sprite UX | Manual editor rather than automatic mixel recovery | MIT; active | UX/file-format reference |
| [Aseprite](https://github.com/aseprite/aseprite) | Industry-standard pixel editor behavior and transformation reference | Source-available EULA is not a permissive implementation reuse grant | Active; custom license | Behavioral reference only |

### Quantization and dithering components

| Project | Algorithm/scope | Alpha, determinism, and browser note | License/status | Pixilate disposition |
|---|---|---|---|---|
| [image-q](https://github.com/ibezkrovnyi/image-quantization) | Wu RGBA, NeuQuant, RgbQuant-style palettes; many distances and dithers | Pure TypeScript, deterministic inspected paths, RGBA, tests; no resize | MIT; mature but quiet | Primary browser quantizer candidate after goldens |
| [RgbQuant.js](https://github.com/leeoniya/RgbQuant.js) | Histogram pruning, palette mapping, optional dithering | Transparent pixels skipped; semi-alpha output behavior is unsuitable | MIT; dormant | Reference only |
| [Color Thief / quantize.js](https://github.com/lokesh/color-thief) | Modified median-cut representative palette extraction | Browser-capable; palette extraction is not a complete RGBA remap pipeline | MIT; active | Simple palette-preview reference |
| [ExoQuant](https://github.com/exoticorn/exoquant) | RGBA clustering, K-means refinement, ordered dither | Premultiplies color by alpha; compact C/Wasm candidate; no tests | MIT; dormant | Conditional candidate with Pixilate-owned tests |
| [rscolorq](https://github.com/okaneco/rscolorq) | Spatial color quantization by simulated annealing | Seed must be set; costly/noisy for tiny sprites; Rust-to-Wasm possible | MIT OR Apache-2.0; dormant | Advanced/offline oracle |
| [ImageOptim/libimagequant](https://github.com/ImageOptim/libimagequant) | High-quality RGBA palette search and edge/noise-aware dithering | Strong alpha/gamma handling; no resize; threading needs strict policy | GPL-3.0-or-later/commercial; active | Quality oracle; production use requires a selected GPL-compliant or commercial path |
| [lovell/libimagequant](https://github.com/lovell/libimagequant) | Older v2.4.1 C quantizer maintained for Sharp | RGBA and native/Wasm potential; exact provenance needs review | BSD-2-Clause claim; active | Conditional candidate after legal audit |
| [pngquant](https://github.com/kornelski/pngquant) | PNG CLI around modern libimagequant | Deterministic-quality reference, not an embeddable MIT dependency | GPL-3.0-or-later/commercial; active | Benchmark only |
| [nQuantCpp](https://github.com/mcychan/nQuantCpp) | Multiple color quantizers/dithers in C++ | Broad formats/algorithms; browser requires port; closure is copyleft | GPL-3.0; active | Study only |
| [joshdk/quantize](https://github.com/joshdk/quantize) | Small Go median-cut package | No alpha-specific product policy; native/Go-Wasm possible | MIT; dormant since 2017 | Reference, not preferred |
| [makew0rld/dither](https://github.com/makew0rld/dither) | Corrected linear-light Go dithering, many diffusion/ordered modes | Preserves alpha; Go/Wasm possible; spatial noise often harms sprites | MPL-2.0; active | Optional separate component/reference |
| [didder](https://github.com/makew0rld/didder) | Rich image-dithering CLI using Go imaging/quantization packages | Great batch oracle; GPL closure and CLI/native deployment | GPL-3.0; active | Golden/reference generator only |
| [esimov/dithergo](https://github.com/esimov/dithergo) | Go error-diffusion and ordered dithering | General image effect; no grid inference or palette optimizer | License/status surface scan | Algorithm catalogue only |
| [image-rs/color_quant](https://github.com/image-rs/color_quant) | Small NeuQuant implementation | Rust/Wasm capable; no resize and limited product-level alpha policy | MIT; maintained | Small conditional palette candidate |
| [dithr](https://crates.io/crates/dithr) | Rust typed-buffer ordered, diffusion, stochastic, and halftone families | Advertises deterministic modes; stochastic modes require explicit seed audit | New/active; closure not deep-audited | Revisit for advanced dither phase |
| [dithereens](https://crates.io/crates/dithereens) | Hash-based deterministic dithering | Narrow dither primitive, not palette/grid pipeline | New; surface scan | Possible deterministic-noise reference |
| [epdoptimize](https://github.com/Utzel-Butzel/epdoptimize) | Browser JavaScript quantization/dither for e-ink palettes | Useful fixed-palette UX; display-specific objectives | Active; closure not deep-audited | UX/test reference |

### Resize, decode, and export components

| Project | Actual strength | Critical caveat | License/status | Pixilate disposition |
|---|---|---|---|---|
| [Pica](https://github.com/nodeca/pica) | Small browser JS/Wasm fixed-point resampling with alpha paths | No color management or grid intelligence; pin backend/deps | MIT; active | Safe preview/conventional-resize candidate |
| [fast_image_resize](https://github.com/Cykooz/fast_image_resize) | Exact-size Rust scalar/SIMD filters, explicit alpha/color helpers | Strict mode must lock execution path and conversions | MIT OR Apache-2.0; active | Preferred core resize substrate |
| [image-rs/image](https://github.com/image-rs/image) | Rust codec/pixel-buffer ecosystem and standard filters | Resize assumes caller-linearized, premultiplied samples | MIT OR Apache-2.0; active | Minimal-feature codec layer |
| [Photon](https://github.com/silvia-odwyer/photon) | Friendly browser/Wasm image-effects API | Larger graph and inherits `image` resize caveats | Apache-2.0; active | Comparison only |
| [libvips](https://github.com/libvips/libvips) | Streaming native processing for huge images | Native stack, LGPL obligations, no browser-native small core | LGPL-2.1-or-later; active | Optional server batch backend |
| [Sharp](https://github.com/lovell/sharp) | Mature Node/libvips deployment and format handling | Apache wrapper does not erase native dependency licenses | Apache-2.0 wrapper; active at snapshot | Optional user-controlled batch adapter; not core |
| [wasm-vips](https://github.com/kleisauke/wasm-vips) | Very broad libvips feature set in modern browsers | Large static LGPL-containing bundle; Wasm/SAB header requirements | MIT wrapper; exact audited bundle elects LGPLv3 for several “or later” components and includes other licenses | Optional separate power build with per-build notices/source/relinking review |
| [Jimp](https://github.com/jimp-dev/jimp) | Pure JavaScript decode/manipulation/resize convenience | General JS pipeline, not strict image-science or grid recovery | MIT; active | Prototype/reference only |
| [Squoosh](https://github.com/GoogleChromeLabs/squoosh) | Browser codec/Wasm integration patterns | App repository is archived and brings many codec modules | Apache-2.0; archived | Architecture/reference only |
| [ImageMagick](https://github.com/ImageMagick/ImageMagick) | Large native CLI filter/quantization/color-management oracle | Native and dependency-heavy; output parity requires an exact release plus pinned delegates | ImageMagick License; active at snapshot | Offline benchmark/golden tool |
| [PistonDevelopers/resize](https://github.com/PistonDevelopers/resize) | Focused Rust separable convolution, exact sizes | General resampling; alpha/color contract still caller concern | MIT; active | Secondary Rust comparison |

### Background segmentation and cleanup candidates

| Project | Technique | Why it does or does not fit | License/status | Pixilate disposition |
|---|---|---|---|---|
| [OpenCV GrabCut](https://github.com/opencv/opencv) | Seeded rectangle/mask + GMM + graph cut | Useful interactive segmentation; RNG must be fixed; custom Wasm build is large | Apache-2.0; active | Optional advanced mode |
| [magic-wand-js](https://github.com/Tamersoul/magic-wand-js) | Seeded RGB threshold flood fill, blur, contours | Small/deterministic, but not automatic and not alpha/perceptual | MIT; dormant | Reimplement and test small primitive |
| [scikit-image segmentation](https://github.com/scikit-image/scikit-image) | Graph, watershed, active contour, morphology toolbox | Broad offline oracle; Python/native browser mismatch | BSD-3-Clause with per-file notices; active at snapshot | Research/test oracle |
| [PyMaxflow](https://github.com/pmneila/PyMaxflow) | Python graph-cut bindings | Embeds GPL maxflow code; not browser-ready | GPL-containing closure; active | Not approved for current production bundle |
| [rembg](https://github.com/danielgatis/rembg) | Neural foreground segmentation/matting | Model-based, nontrivial weights/runtime, contrary to no-AI processing goal | MIT code plus model/dependency terms; active | Out of scope |
| [IMG.LY background-removal-js](https://github.com/imgly/background-removal-js) | Browser neural segmentation | Convenient client inference, but model-based and hardware/backend variability matters | AGPL/commercial terms require exact review; active | Out of scope |
| [withoutbg](https://github.com/withoutbg/withoutbg) | Local/API neural background models | Roughly 320 MB weights and ~2 GB RAM per its docs; explicitly AI | Mixed code/model/service terms; active | Out of scope |

**Inventory count:** 48 named projects/components, of which 16 received deep source audits here and the three user-priority products receive dedicated spikes elsewhere. The count deliberately excludes dozens of functionally identical one-file nearest-neighbor Canvas demos.

## Reuse and license decision matrix

License conclusions below are engineering triage, not legal advice. Before distribution, preserve notices, produce a software bill of materials, scan the exact locked dependency graph, and have counsel review ambiguous provenance and any dynamic/static copyleft boundary.

| Component or idea | Planned production browser bundle | Optional separately distributed backend/tool | Study/benchmark only | Reason and condition |
|---|:---:|:---:|:---:|---|
| `fast_image_resize` | **Yes, preferred** | — | — | MIT/Apache; force scalar strict mode initially, make alpha/color transforms explicit, pin graph |
| Pica | **Yes, conditional** | — | — | MIT; useful conventional preview path, but disable browser-dependent decode/resize accelerators in strict mode |
| `image-rs/image` | **Yes, conditional** | — | — | MIT/Apache; minimal codecs only; caller owns orientation, ICC, linearization, alpha, and limits |
| `image-q` | **Yes, conditional** | — | — | MIT; RGBA-aware algorithms and tests; pin one algorithm/distance/tie policy and add Pixilate goldens |
| ExoQuant | **Possible** | — | — | MIT and compact; no upstream tests, dormant, floating behavior needs validation |
| `image-rs/color_quant` | **Possible** | — | — | MIT and small; compare quality/alpha semantics before selection |
| lovell/libimagequant v2.4.1 | **Hold** | **Possible** | — | BSD-2 claim but unusual fork/version provenance; legal/file-level audit first |
| `magic-wand-js` algorithm | **Reimplement** | — | — | MIT; tiny deterministic primitive, but upstream lacks tests and alpha/perceptual policy |
| `perfectPixel` method | **Independent implementation from identified public papers/specifications only for now** | — | **Yes** | Highly relevant FFT/Sobel method; metadata says MIT but repository lacks license text/tests; do not copy source without a reuse grant |
| GameTorch Wasm methods | **Patterns only** | — | **Yes** | MIT; source has scan-order, cap, alpha, and target-size weaknesses |
| SpriteFusion methods | Await dedicated spike | Await dedicated spike | **Yes** | Do not decide until its license/dependency/source findings are merged |
| Unfake.js methods | Await dedicated spike | Await dedicated spike | **Yes** | Do not decide until its dedicated findings are merged |
| Native libvips / Sharp | No default | **Yes** | **Yes** | Appropriate for server batch jobs; retain LGPL/native closure compliance and do not promise browser parity |
| `wasm-vips` bundle | No default | **Yes, legal review** | **Yes** | MIT wrapper statically bundles LGPL and other components; record the exact build's license election and satisfy notices/source/relinking obligations |
| OpenCV GrabCut | No default | **Yes, advanced** | **Yes** | Apache; require user seeds/masks, fixed RNG/build, and pruned Wasm or server boundary |
| `rscolorq` | No default | **Possible, seeded** | **Yes** | Permissive but stochastic unless seeded; costly/noisy for small sprites |
| makew0rld/dither | No | **Possible** | **Yes** | MPL-2.0 file-level obligations; useful linear-light reference |
| modern libimagequant / pngquant | **Not approved for current bundle** | GPL process/service only if consciously accepted | **Yes, primary oracle** | GPL-3.0-or-later or commercial license; shippable only under a consciously selected compliant path |
| didder, nQuantCpp, Dithertron, PyMaxflow | **Not approved for current bundle** | GPL tool/process only if consciously accepted | **Yes** | Current production-distribution plan does not accept the GPL obligations; this is a project posture, not an assertion that compliant distribution is impossible |
| `pixel-artify` | **No** | No | Limited | No license grant means all rights reserved by default |
| rembg, IMG.LY, withoutbg | **No** | No for stated product goal | Comparison only | Neural/model-based processing violates the deterministic no-AI scope; model licenses also need separate review |
| Aseprite source | **No** | No | **Behavior only** | Source-available license is not an MIT reuse grant |

### Dependency-closure rules for planning

1. “MIT wrapper” is never accepted as closure evidence. Audit the shipped Wasm/native archive, codecs, model/data files, fonts, palettes, and build downloads.
2. Pin a released source revision and every transitive package; record source URLs and checksums. A Git commit alone does not pin semver-resolved JavaScript dependencies or network downloads in build scripts.
3. Keep GPL/AGPL and ambiguous-license experiments out of the current production package graph, dev fixtures, generated source, and copied snippets unless the project intentionally selects and satisfies those terms.
4. Generated Wasm must carry the same notices and corresponding-source obligations as the sources linked into it. Dynamic linking in a web download is not a safe assumption.
5. Treat built-in named palettes as data with provenance. Prefer original, public-domain, or clearly licensed palettes with attribution metadata.
6. Re-run a license/SBOM check on every release lockfile; repository license badges are insufficient.

## Common scope and licensing misconceptions

- **“Pixel-perfect” often means nearest-neighbor enlargement.** That preserves an existing clean grid; it does not recover a latent grid from AI mixels, choose representative cell colors, or prevent detail loss while shrinking.
- **“Box” does not guarantee area integration.** Pica's named box kernel is a 0.5-support nearest-style filter. Test the implementation rather than infer semantics from a filter name.
- **Palette extraction is not quantized output.** Color Thief-like tools find representative colors; Pixilate still needs deterministic nearest mapping, alpha policy, perceptual distance, ties, dithering, and export ordering.
- **Quantization is not pixelation.** `image-q`, libimagequant, ExoQuant, and `rscolorq` reduce colors but do not infer or snap a source grid.
- **Dithering can conflict with the target style.** General photographic quantizers intentionally distribute error as isolated high-frequency pixels. Pixel art frequently needs flat regions, connected outlines, and explicit no-dither zones.
- **“Consistent K-means++” is not deterministic by itself.** OpenCV's GrabCut tests set the global RNG; any K-means implementation needs a fixed initializer/seed, iterations, tie handling, and execution backend.
- **Canvas2D output is not a reproducibility contract.** `drawImage`, `createImageBitmap`, color conversion, decoding, and browser/GPU paths may differ. Canvas is suitable for display, not the normative processing engine.
- **A Wasm build is not automatically bit-identical.** SIMD versus scalar rounding, threads, floating-point reductions, compiler versions, and imported browser decoders still vary.
- **An MIT package can ship a non-MIT bundle.** `wasm-vips` is the clearest surveyed example: its wrapper is MIT while statically included native components carry LGPL and other licenses.
- **There are two materially different libimagequant families.** Current v4 is GPL-3.0-or-later/commercial; the actively maintained lovell fork is an older BSD-2 line. Do not transfer license or feature claims between them.
- **xBRZ, HQx, Scale2x, RotSprite, and similar pixel scalers solve enlargement/rotation.** They assume a clean low-resolution grid and are not latent-grid downscalers.
- **Automatic non-AI background removal is an underspecified promise.** Flood fill needs a seed and threshold; GrabCut needs a rectangle/mask; semantic one-click tools use learned models. A deterministic algorithm cannot infer user intent for every scene.

## Missing primitives: what Pixilate must own

No surveyed project supplies this combination. These are product algorithms/contracts, not glue work:

1. **Canonical decode contract.** Apply EXIF orientation, cap dimensions/decompression, define animation-frame policy, normalize ICC/gamma to a declared working space, canonicalize straight/premultiplied alpha, clear RGB under zero alpha, and record the normalized input hash.
2. **Exact sizing semantics.** Independently requested output width and height; fit/fill/stretch policies; deterministic rounding; and the user's Trim rule where the measurement box is either the alpha-defined content bounds or the full canvas. Trimming and resampling must remain separate operations.
3. **Latent-grid inference with confidence.** Estimate cell pitch in both axes, phase/offset, possible perspective/nonuniform distortion, and ambiguity. Fuse spectral periodicity, autocorrelation, projected edges, run-lengths, and candidate reconstruction error. Never silently treat a low-confidence guess as truth.
4. **Constrained grid refinement.** Edge-aligned boundaries must remain ordered, maintain minimum spacing, resist following subject outlines, support transparent margins, and expose manual target/phase override.
5. **Multiple deterministic cell reducers.** Center/median/mode alone are inadequate. Add alpha-weighted area color, robust medoid, bounded two-cluster choice, edge/feature preservation, and fixed tie rules. Never synthesize accidental RGB beneath transparent output.
6. **Candidate generation plus scoring.** For messy input, compare a fixed finite set of grid phases/reducers rather than claim one universal filter. Score grid alignment, reconstruction error, palette compactness, edge continuity, isolated components, silhouette preservation, and small-feature retention with integer or tightly specified arithmetic.
7. **Pixel-art-aware topology policy.** Optional removal of single-pixel noise, hole filling, outline continuity, connected-component thresholds, and protected rare features. Every cleanup must be previewable and reversible because a one-pixel eye can be intentional.
8. **RGBA-aware palette optimization.** Palette learning and mapping must define transparency thresholds, semi-alpha behavior, premultiplication, working color space, distance metric, reserved colors, exact palette order, tie resolution, and whether dither may cross alpha/region boundaries.
9. **Deterministic background-selection suite.** Separate tools for exact-color removal, threshold flood fill, border-connected removal, chroma-key distance, component selection, and optional seeded GrabCut. Include mask grow/shrink, feather off by default for pixel art, hole/contour inspection, and manual repair.
10. **Reproducibility manifest.** Embed or accompany each export with algorithm version, normalized input hash, target/trim box, all settings, palette bytes/order, seed where relevant, engine/backend ID, build hash, and output hash. “Same settings” is otherwise unverifiable.

## Recommended open-source architecture

The evidence supports a small auditable core rather than one large dependency:

```text
controlled decoder -> canonical RGBA/working space
                   -> trim/measurement box
                   -> input classifier + grid candidates
                   -> exact-size reducers/resamplers
                   -> RGBA palette optimizer/mapper
                   -> optional topology cleanup
                   -> deterministic encoder + manifest

separate selection tab: exact/chroma -> flood fill -> seeded GrabCut (optional)
```

- Use Rust/Wasm for the normative processing engine, fixed-width integer math where practical, one pinned scalar execution path for strict mode, and a pure display Canvas. `fast_image_resize` is the leading conventional-resize dependency.
- Implement Pixilate's latent-grid detector, cell reducers, topology scorer, trim semantics, and manifest in-project. Study `perfectPixel`, SpriteFusion, Astropulse, and GameTorch, but do not inherit their assumptions wholesale.
- Start quantizer bake-offs with `image-q`, ExoQuant, `image-rs/color_quant`, and—only after provenance review—the BSD libimagequant fork. Use current GPL libimagequant/pngquant as quality oracles, not dependencies.
- Make deterministic output a named **Strict** mode. Faster SIMD/threaded or browser-native preview modes may exist only if clearly labeled and checked against an accepted tolerance; exported strict bytes must not depend on preview backend.
- Keep background removal a separate feature as proposed. A resize should preserve the supplied alpha; segmentation mutates the mask and requires different controls, confidence, undo, and evaluation data.

## Required evaluation before implementation selection

Build a redistributable corpus with at least these strata: clean integer-grid sprites; non-integer scaled sprites; bilinear/bicubic-blurred sprites; JPEG/WebP artifacts; warped/unequal grids; AI mixels; hand-painted raster art; photos; transparent antialiased edges; opaque solid backgrounds; gradients/shadows; very small semantic details; empty/all-transparent images; and adversarial huge/malformed inputs.

For every candidate setting, record exact-output hashes across Chromium, Firefox, Safari-equivalent WebKit, x86-64, ARM64, scalar Wasm, and any enabled SIMD path. Measure:

- exact dimension/trim contract and byte repeatability;
- alpha-edge contamination and RGB-under-zero-alpha invariants;
- grid pitch/phase accuracy and explicit low-confidence rejection;
- palette count, perceptual/reconstruction error, and stable palette ordering;
- connected-component/orphan-pixel changes and protected-detail survival;
- background mask precision/recall on user-defined ground truth;
- runtime, peak memory, Wasm/download size, and denial-of-service limits.

Acceptance must be per input class. A leading average score is not a universal default if a method removes a one-pixel eye, merges an outline, or introduces an unsupported background boundary. The default should select among deterministic, class-appropriate pipelines and expose the chosen pipeline/settings to the user.

## Residual follow-up candidates

Discovery was intentionally stopped after saturation. If later benchmarks expose a gap, investigate the newer Rust `dithr`/`dithereens` crates, the emerging Pixelloid/Pixel Extractor project, e-ink quantizers, classic depixelization research implementations, and custom minimal OpenCV.js builds. None presently changes the core architectural conclusion above.

## Addendum — 2026-10-19 inventory additions

**Snapshot:** 2026-10-19.

**Method:** public GitHub API metadata and raw files at the pinned revisions below, read through a web-fetch tool. The tool returns a model-mediated reading, so constants were requested as verbatim quotes. They are CODE-DERIVED for the pinned revision only and must be re-read before any port. Nothing was cloned, installed, or run. Rows marked *draft-reported* come from a superseded 2026-10-18 survey draft, were not re-checked, and stay surface signals (**UNKNOWN** until verified).

### Coverage correction

The July inventory missed the grid-recovery and pixelization projects below, although at least five already existed before 2026-07-31. By GitHub `created_at`:

- pyxelate (2020-01)
- PixelOE (2024-03)
- proper-pixel-art (2024-09)
- PixelRefiner (2026-02)
- fast-pixelizer (2026-03)

The July claim that "search stopped after saturation" therefore missed relevant families: candidate-grid model selection, and complete client-side TypeScript converters. The bounded-exhaustive caveat stands, with this gap recorded.

### Pinned ledger additions

| Candidate | Pinned revision | HEAD date | Declared license (GitHub API) |
|---|---|---:|---|
| [KennethJAllen/proper-pixel-art](https://github.com/KennethJAllen/proper-pixel-art/tree/4de0dda5ba066491b5b5fac3500365db4dfd665e) | `4de0dda5ba066491b5b5fac3500365db4dfd665e` | 2026-10-10 | MIT |
| [KohakuBlueleaf/PixelOE](https://github.com/KohakuBlueleaf/PixelOE/tree/7ce444b36d3876a151d845d4493240e904454d89) | `7ce444b36d3876a151d845d4493240e904454d89` | 2026-09-28 | Apache-2.0 |
| [sedthh/pyxelate](https://github.com/sedthh/pyxelate/tree/f4a046b8b148370a20ab7681fce160551e5fc49b) | `f4a046b8b148370a20ab7681fce160551e5fc49b` | 2026-01-18 | MIT |
| [HappyOnigiri/PixelRefiner](https://github.com/HappyOnigiri/PixelRefiner/tree/c32659f350705f5f497fcc0737902f32915d2ef3) | `c32659f350705f5f497fcc0737902f32915d2ef3` | 2026-09-21 | MIT |
| [dolphinep/breakfastz-pixel-truth](https://github.com/dolphinep/breakfastz-pixel-truth/tree/a1a3961c23d617b1cd7cda78b6051d9cde9ea401) | `a1a3961c23d617b1cd7cda78b6051d9cde9ea401` | 2026-10-11 | MIT |
| [handsupmin/fast-pixelizer](https://github.com/handsupmin/fast-pixelizer/tree/5c041fceedab042973502e0dfa2e9f90e2fa9063) | `5c041fceedab042973502e0dfa2e9f90e2fa9063` | 2026-07-22 | MIT |

### Grid-size model selection (CODE-DERIVED at the pins)

- **proper-pixel-art** ([`mesh.py`](https://github.com/KennethJAllen/proper-pixel-art/blob/4de0dda5ba066491b5b5fac3500365db4dfd665e/proper_pixel_art/mesh.py), [`config.py`](https://github.com/KennethJAllen/proper-pixel-art/blob/4de0dda5ba066491b5b5fac3500365db4dfd665e/proper_pixel_art/config.py)):
  - Each candidate pixel width builds a full mesh, scored by pixel-weighted mean within-cell grey variance.
  - The current estimate is kept if its score is within (1 + 1.5) × best.
  - Otherwise the largest eligible width within (1 + 0.2) × best is adopted.
- **breakfastz-pixel-truth** ([`grid.ts`](https://github.com/dolphinep/breakfastz-pixel-truth/blob/a1a3961c23d617b1cd7cda78b6051d9cde9ea401/src/lib/pixel/grid.ts)):
  - Candidates are each axis period × {1, 2, 3, ½, ⅓}, from 3 px up to a size limit.
  - Interior noise is the 90th percentile of per-cell RGB standard deviation over cell centres, with a 25% margin trimmed.
  - The largest candidate with noise ≤ 1.35 × best + 2 is chosen.
  - Confidence is the smaller per-axis ratio of the final period's score to the median candidate score. A grid counts as detected above 1.4.
- **PixelRefiner** ([`grid-search.ts`](https://github.com/HappyOnigiri/PixelRefiner/blob/c32659f350705f5f497fcc0737902f32915d2ef3/src/core/grid-search.ts)):
  - Axis score = 0.75 × grid alignment + 0.15 × autocorrelation + 0.1 × local phase stability, scaled by a periodicity confidence.
  - Pair score (lower is better) = reconstruction × 255 + 2·√(outW·outH) − (sx + sy) × 12. The area term explicitly favours coarser grids.
  - Harmonic penalties live in a separate module that was not re-read (UNKNOWN constants).

**INFERRED:** these tools converge on one rule. Score full candidate grids by within-cell residual, then prefer the **largest** cell size whose residual is within a tolerance of the best. Pure residual minimization always prefers smaller cells, and pure periodicity strength locks onto harmonics. This complements [state of the art §5.2](../algorithms/state-of-the-art.md#52-period-and-phase-evidence) as a benchmark hypothesis, not a selected default.

### Other additions

| Project | Contribution | License/status | Pixilate disposition |
|---|---|---|---|
| PixelRefiner | Client-side TypeScript converter (live at pixel-refiner.app) with an input classifier (refine, convert, preserve), inset-core medoid cell sampling, deterministic OKLab k-means, background tools, and a quality-baseline CI; mechanism details beyond the scoring above not re-read | MIT (pinned) | Highest-priority study and benchmark target; adapt specific functions only with notice after a pinned file-level review |
| proper-pixel-art | Edge-anchored mesh, per-gap subdivision, and the width validation above | MIT (pinned) | Study and benchmark; adapt with notice |
| breakfastz-pixel-truth | Fractional comb grid, offset carry-forward, size selection above, guarded cleanup rules | MIT (pinned); created 2026-10-11 | Study and benchmark; adapt with notice |
| PixelOE | Continuous-tone pixelizer (no source-grid detection) with contrast-aware outline expansion before downscale; details draft-reported | Apache-2.0 (pinned) | Study; retain the Apache-2.0 licence and NOTICE terms if any code is adapted |
| pyxelate | Continuous-tone pixelizer with exact target size and seeded palette fitting; details draft-reported | MIT (pinned) | Study only |
| fast-pixelizer | Zero-dependency TypeScript snapper; reportedly the engine behind mono-pix; details draft-reported | MIT (pinned) | Benchmark baseline |
| [ComfyUI-PixelArt-Detector](https://github.com/dimtoneff/ComfyUI-PixelArt-Detector) | Draft-reported: unseeded OpenCV k-means paths; coverage-threshold palette shrinking | MIT (July row) | July disposition stands; treat as nondeterministic |
| painebenjamin/unfake.py | Third-party Python package (not Unfaker/unfake.js); the "unfake" backend of pixel-bench | MIT, draft-reported | Inventory only; never attribute its behaviour to Unfaker |
| CalaKuad1/ComfyUI-PixelArt-Unfaker | Draft-reported: crops or pads an unfake result to a requested W×H | MIT, draft-reported | Inventory; post-hoc crop/pad is not target-constrained fitting |
| tauraloke/ComfyUI-Unfake-Pixels; x0x0b/ComfyUI-spritefusion-pixel-snapper and other Pixel Snapper forks | Wrappers and ports | MIT, draft-reported | Derivatives; do not double-count |
| Pixel Rehab | JavaScript port of the Retro Diffusion fixer | See the [Retro Diffusion spike](../products/retro-diffusion-pixel-art-fixer.md#derivative-pixel-rehab) | Derivative |
| vardirhq/sindri-pixel (PR #13) | Draft-reported: global dynamic-programming line fit and residual-knee size selection | No licence, draft-reported | Ideas only |
| Danamir/pixelart-cleaner | Draft-reported: irregular-span grid cleaner | GPL-3.0, draft-reported | Not approved for the current bundle |
| Ign1s-Reiga/pixelfit, duniul/pixel-scale, Teo2/pixel-art-downscaler, wjhrdy/pixel-art-scaler, andreasjansson/pixel-art-downscaler | Small grid or scale tools | Mixed or no licence, draft-reported | Inventory only |
| A1111 Pixelization extension | Neural pixelization | MIT wrapper; model weights under a non-commercial licence, draft-reported | Out of scope (model-based) |
| Astropulse/sd-palettize, mrreplicart/sd-webui-pixelart, MidFord/BetterPixelArtDownscale, golota60/fixelart | Pixelization and downscale scripts | No licence stated, draft-reported | Ideas only |
| gskaggs/Pyxeled | Implementation of Gerstner et al. 2012, "Pixelated Image Abstraction" | Draft-reported | Literature reference |
| Astropulse K-Centroid (Aseprite script) | Tile 2-colour centroid resize | MIT, draft-reported | Study only |
| olivierlesnicki/quantize (MMCQ), mattdesl/gifenc, mcychan/PnnQuant.js | Small quantizers | MIT, MIT, MPL-2.0, draft-reported | Quantizer bake-off candidates; MPL-2.0 has file-level obligations |
| LibreSprite | GPL-2.0 editor fork | GPL-2.0, draft-reported | Behaviour reference only |

### Conflicts resolved

- **image-q licence (re-checked 2026-10-19):** [`packages/image-q/LICENSE`](https://github.com/ibezkrovnyi/image-quantization/blob/d1a4ac4a3b00c456737a03909b1bb523c569da25/packages/image-q/LICENSE) exists at the July pin. It carries MIT plus the NeuQuant and RgbQuant notices. A claim that "the repo has no license file" checked only the repository root. The July row stands.
- **libimagequant:** the two-line distinction in §9 stands. Current v4 is GPL-3.0-or-later or commercial; the lovell v2.4.1 fork is BSD-2-Clause. A generalization that "every libimagequant WASM port is GPL-3" is incorrect.
- **perfectPixel (re-checked at `72096de`):** grid refinement is chained outward from the centre in both directions. Each line is searched within ±`refine_intensity` (default 0.25) cell of the previous snapped line plus one cell. The §16 text is corrected. The licence posture (metadata MIT, no licence file) is unchanged.
- **pixeldetector and Pixel It dates:** later "last push" dates are GitHub `pushed_at`. The ledger records the commit date of the pinned revision. There is no conflict.
- **Unfaker licence wording:** see the [Unfaker addendum](../products/unfake-js.md#licence-unchanged). The distribution's licence path is not publicly stated; nothing here asserts a GPL obligation.
- **Defect claims:** claims of implementation defects in named projects, made in the superseded draft from paraphrased reads without pinned revisions, were not re-verified and are not carried forward. The July pixeldetector `uint8` inference (§1) is unchanged.

## 2026-10-20 refresh

**Snapshot:** 2026-10-20. **Method:** web search, GitHub search API (`created:>2026-06-30`), API metadata and raw files at the pinned revisions below, read through a web-fetch tool (a model-mediated reading; constants were requested verbatim and must be re-read at the pin before any port). Nothing was cloned, installed, built or run. No hosted-build asset was inspected.

### HEAD re-checks: no algorithm change since 2026-10-19

VERIFIED (commit metadata, 2026-10-20): Pixel Snapper `e6d81463` (README only), unfake.js `66368689` (v1.4.0), Retro Diffusion pixel-art-fixer `ef376e57` (v1.1, 2026-07-15) and pixel-bench `779cfc25`, PixelRefiner `c32659f3` (v1.1.1), fast-pixelizer `5c041fce`, proper-pixel-art `4de0dda5`, breakfastz-pixel-truth `a1a3961c` and PixelOE `7ce444b3` are still HEAD. perfectPixel (last push 2026-02-01) still has no licence file (`license: null`). The pinned findings above stand.

### New projects

| Candidate | Pinned revision | Created | Licence | Disposition |
|---|---|---|---|---|
| [Bocchi-The-Glock/Real-PixelArt](https://github.com/Bocchi-The-Glock/Real-PixelArt/tree/17ce487597dbc6c04c630226a0f499108a0e20ac) | `17ce4875` (2026-10-08) | 2026-09-16 | MIT (`LICENSE` file at the pin); the README badge says "Not specified" | Study and benchmark target; see below |
| [wjhrdy/pixel-pusher](https://github.com/wjhrdy/pixel-pusher/tree/d8b49b3563d6381fb1d9f55589e33623c3896d55) | `d8b49b35` (2026-08-15, v0.0.7) | 2026-08-09 | No licence file (full tree listed); `THIRD_PARTY_NOTICES.md` credits proper-pixel-art (MIT) | Ideas only; see below |
| [Ign1s-Reiga/pixelfit](https://github.com/Ign1s-Reiga/pixelfit/tree/fd1fb55ae95d1dbf3e91b28ecf9595b1d98487f5) | `fd1fb55a` (2026-08-26) | 2026-08-24 | MIT | Report-idea source (PaletteLens) |
| [flores666/asepix](https://github.com/flores666/asepix) | not pinned | 2026-09-13 | None | Inventory: C#; fractional grid, inset 0.25 majority vote, per-tile sheet resize that drops whole art pixels (README) |
| [envy-ai/ComfyUI-Krea2-Pixel-Art-Refiner](https://github.com/envy-ai/ComfyUI-Krea2-Pixel-Art-Refiner) | not pinned | 2026-09-16 | None | Inventory: per-cell 8-bit RGB mode with OKLab tie-break to the centre pixel; mesh detector adapted from proper-pixel-art (README) |
| [See-Sol-Lab/Picxel](https://github.com/See-Sol-Lab/Picxel) | not pinned | 2026-09-12 | GPL-3.0-only | Out of scope: generative redraw, then local voting |
| codecodecode333/PixelGridRecovery; PeaarLi/ComfyUI-PixelPipeline; comfyrob/comfyui-pixel-snapper | not pinned | 2026-07 to 2026-09 | None or NOASSERTION | Inventory only (search-API metadata) |
| [imazen/zenquant](https://docs.rs/zenquant) 0.1.3 | crate, 2026-09-22 | — | AGPL-3.0-only or commercial | Not bundle-compatible; OKLab 256-colour quantizer with butteraugli-style weights |

**Real-PixelArt (CODE-DERIVED at `17ce4875`, [`web/core/grid.js`](https://github.com/Bocchi-The-Glock/Real-PixelArt/blob/17ce487597dbc6c04c630226a0f499108a0e20ac/web/core/grid.js); README and [`EVALUATION.md`](https://github.com/Bocchi-The-Glock/Real-PixelArt/blob/17ce487597dbc6c04c630226a0f499108a0e20ac/EVALUATION.md)).** A JavaScript web core with a Python twin, kept pixel-identical by shared regression cases (vendor-stated). The README credits perfectPixel (no licence file) as inspiration for spacing, refinement and sampling, so code provenance needs a file-level check before any adaptation.

- *Proposals, not decisions:* edge-gap kernel peaks, edge-profile FFT peaks and image-spectrum troughs, each expanded ×1, ×½ and ×2, are all fitted and scored. Ties go to the larger spacing.
- *Score per axis* = 0.48 · units + 0.42 · explained + 0.10 · periodic. *explained* is the weighted share of edge mass within `tol = max(0.65, 0.14·p)` of a cut, **corrected for chance**: `chance = min(0.85, 2.5066·tol/p)` and `support = clip((obs − chance)/(1 − chance), 0, 1)`. Accept at score ≥ 0.30 with unit-gap support ≥ 0.10 on both axes.
- *Segment validation* for weak candidates (support < 0.45): over patches, the share of edges forming continuous horizontal or vertical segments. A candidate is rejected when at least 75 % of the active patches are weak and the segment and axis fractions are low (< 0.25 and < 0.75). Inconclusive cases keep the candidate.
- *Fixed size* (`targetAxis`, commit "Add fixed-size adaptive grid output"): the cell count is fixed and the endpoints cover the full image. Each interior cut moves within ±0.45 p of a phase-searched regular cut (17 shifts). A DP minimizes `−evidence + 0.12·(Δ/p)²` per node plus `0.35·((gap − p)/p)²` per gap. The count therefore holds by construction. The README calls this "a user-constrained grid, not proof of the original grid".
- *Native preservation:* sharp, detailed art is returned 1:1 (`native_preserved`), and an exact GCD of gradient positions is a protected result.
- *Determinism:* EVALUATION.md reports pixel-identical repeat runs and a Chrome-to-Python match on its cases, and notes that JPEG decode differs across Pillow versions (vendor-reported). The rights status of its test inputs is not established here, so they are not corpus candidates.

**pixel-pusher (CODE-DERIVED at `d8b49b35`, [`src/grid.rs`](https://github.com/wjhrdy/pixel-pusher/blob/d8b49b3563d6381fb1d9f55589e33623c3896d55/src/grid.rs), [`src/lattice.rs`](https://github.com/wjhrdy/pixel-pusher/blob/d8b49b3563d6381fb1d9f55589e33623c3896d55/src/lattice.rs); no licence, so ideas only).**

- *Search:* exhaustive over integer cell width × height × every integer phase, with summed-area tables of RGB and RGB², so a candidate costs O(cells). The top 32 get fractional phase and size refinement.
- *Auto score* = `normalized_residual / edge_alignment² + 1/(w·h) + 0.03·|ln(w/h)|`. The terms are the within-cell variance over global variance, the edge-energy enrichment within a band around predicted lines (clamped 0.1–20), a coarser-cell preference, and a mild square-cell prior. There is no explicit harmonic rule; a test checks that a 9-px grid beats its divisors.
- *Deformable lattice:* a **2-D junction mesh**, in which every junction moves independently and cells are bilinear quads with shared edges. It is not separable per-axis cuts. Line-first initialization comes from coherent boundary runs. Then a joint corner snap within ±radius scores local cell variance, plus regularization (self-displacement × 0.2 plus 4-neighbour displacement differences), minus a corner reward (geometric mean of vertical and horizontal evidence). A move must not weaken corner strength. Non-corner junctions follow anchors in the same row or column, weighted by 1/lattice distance with confidence capped at 2. Flat or low-contrast regions keep the seed. Test values: radius 2, step 0.25, regularization 0.002, edge weight 0.08, minimum edge 0.04, 3 iterations.

**pixelfit PaletteLens (VERIFIED README at `fd1fb55a`).** Report-only palette checks: non-monotonic lightness in a ramp, uneven lightness steps (σ), near-duplicate entries, greyscale collision (different chroma, same lightness), hue shift as direction and magnitude, and unused entries. It never modifies the image. The first, fourth and sixth checks are not in the [quality-metrics ramp report](../evaluation/pixel-art-quality-metrics.md).

### Conflicts resolved

- **pixelfit licence:** the 2026-10-19 "mixed or no licence, draft-reported" row is superseded for pixelfit. The GitHub API and README state MIT (VERIFIED 2026-10-20).

**Pixilate implication (INFERRED).** None of these projects changes the reuse matrix. Real-PixelArt is the only new MIT, client-side, fixed-W×H grid fitter, so it joins PixelRefiner as a benchmark target. Algorithm ideas are ranked in [state of the art, 2026-10-20 refresh](../algorithms/state-of-the-art.md#2026-10-20-refresh).
