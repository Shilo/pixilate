# Product research spike: Unfaker / unfake.js

Research date: 2026-07-31  
Product: [Unfaker on itch.io](https://jenissimo.itch.io/unfaker)  
Authoritative source: [`jenissimo/unfake.js`](https://github.com/jenissimo/unfake.js)  
Source snapshot audited: [`b2bee10c1c3b211a2532baca9088857b19480dca`](https://github.com/jenissimo/unfake.js/tree/b2bee10c1c3b211a2532baca9088857b19480dca) (current `master` when researched)  
Live application version observed: 1.2.0

## Evidence labels

- **VERIFIED** — stated by the author in the product page, repository, source comments, release notes, or dependency documentation.
- **CODE-DERIVED** — traced through the pinned source snapshot. This is stronger than product copy, but was not necessarily documented as a public contract.
- **OBSERVED** — reproduced in the live itch.io build or with a local synthetic input.
- **INFERRED** — a consequence of the code or observations which has not been confirmed by the author.
- **UNKNOWN** — could not be established from public material or the available test environment.

Unless a later date is stated, every **UNKNOWN** in this spike remains unresolved as of 2026-07-31.

These labels matter because the product page and downloadable labels differ from the 1.2 controls and Rust/WASM engine described in the [1.2.0 release notes](https://jenissimo.itch.io/unfaker/devlog/1548922/v120-rustwebassembly-core). Public implementation conclusions below come from the pinned MIT repository revision. Live-deployment claims are limited to bounded UI/output observations; this report does not fingerprint or analyze unpublished compiled deployment assets.

## Executive verdict

Among the small tools reviewed, Unfaker exposes a particularly broad *algorithm workbench*: it is local/client-side and provides grid detection, phase snapping, multiple block reducers, palette reduction, alpha binarization, cleanup, presets, and a pixel-level manifest. Its `QVote` option is relevant to AI-generated “mixels,” and its run- and edge-based scale detectors contain ideas worth evaluating.

It does **not** satisfy Pixilate's central sizing requirement. There is no target width or height, no alpha-visible-bounds/Trim sizing with a serialized threshold, no fit policy, and no preservation policy for a non-divisible canvas. The user supplies or detects a single integer “pixel size”; the result is `floor(width / scale) × floor(height / scale)`, often after additional phase cropping. Pixels outside that selected divisible region are omitted under the audited revision.

Strict repeatability under Pixilate's definition is not established for the audited revision. The default dominant-color reducer uses Rust `HashMap` iteration for equal-count cases, browser decoding and color management are not canonicalized, and the manifest contains a timestamp. Several effective behaviors are not fully surfaced in the UI: `QVote` uses an internal 24-color quantization, values from 257–1023 on the color slider are clamped to 256 inside the core, and content-adaptive downscaling consumes a different intermediate than the snapped/morphologically processed route while the manifest can still report snapping settings.

Finally, directly reusing the current quantizer is not approved under Pixilate's current production-distribution plan. The repository's own code is MIT-licensed, but its Rust core statically depends on `imagequant 4.4.x`. The [libimagequant licensing page](https://pngquant.org/licensing.html) says the library is GPLv3+ for free/open-source use and otherwise requires a commercial license. Pixilate-owned files may remain MIT, but a distributed combined artifact must also satisfy every incorporated dependency's terms. This is a high-priority legal/design dependency decision, not a minor attribution task. This document is technical research, not legal advice.

## Product and build snapshot

| Area | Finding |
|---|---|
| Implementation | **VERIFIED:** Version 1.2 replaced the older OpenCV/image-q processing path with a shared Rust core compiled to WebAssembly; the same core is also used by the CLI. See the [1.2.0 release notes](https://jenissimo.itch.io/unfaker/devlog/1548922/v120-rustwebassembly-core) and [workspace manifest](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/Cargo.toml). |
| Hosting | **OBSERVED:** The product is an HTML application embedded by itch.io. Processing happens in a module worker and WASM, not in a remote inference service. |
| Repository license | **VERIFIED:** Top-level source is [MIT licensed](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/LICENSE); the core crate also declares MIT in its [Cargo manifest](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/Cargo.toml). Dependency licensing is a separate issue discussed below. |
| Product modes | **VERIFIED/OBSERVED:** Pixel Art, Vector, and Layers modes, plus magnification, palette editing, presets, paste/drop/upload, PNG download, clipboard copy, and nearest-neighbor “upscaled” export. This spike concentrates on Pixel Art mode because it is the relevant raster-to-pixel pipeline. |
| Network model | **CODE-DERIVED:** Source pixels are decoded into a browser canvas and transferred to a worker. The processing code contains no upload request. **Caveat:** hosting/analytics requests and the initial application download still go to itch.io/CDNs. |
| AI use | **VERIFIED:** No AI/ML model is used for image processing. Detection, resampling, quantization, and cleanup are conventional deterministic-intent algorithms. |

The similarly named third-party Python package `unfake.py` is not the upstream application and is excluded from this audit. Claims made by that package, including background removal, must not be attributed to Unfaker/unfake.js.

## Inputs, outputs, and operational limits

### Inputs

- **VERIFIED:** The UI advertises PNG, JPEG/JPG, and WebP.
- **CODE-DERIVED:** The file input uses `accept="image/*"`, validation accepts any MIME beginning with `image/`, and decoding uses `createImageBitmap` plus canvas `getImageData`. A browser may therefore decode additional formats, but they are not a stable product contract.
- **CODE-DERIVED:** Click/upload, drag-and-drop, and clipboard paste reach the same decode path.
- **CODE-DERIVED:** The live UI rejects files above 10 MB. The shared utility has a 50 MB ceiling, so different entry points do not share one limit.
- **CODE-DERIVED:** Either dimension above 8,000 pixels or more than 10,000,000 pixels total is rejected by the pixel pipeline.
- **UNKNOWN:** Animated/multiframe inputs are not documented. Browser bitmap decoding will likely select one frame, but this was not validated and must not be advertised.
- **UNKNOWN:** There is no explicit ICC-profile, EXIF-orientation, HDR, or wide-gamut policy. Browser decoder/canvas behavior supplies the effective policy.

### Outputs

- **VERIFIED/CODE-DERIVED:** Pixel output is encoded as an RGBA8 PNG by the Rust core. Metadata, DPI, profiles, and EXIF are not preserved.
- **OBSERVED:** “Download Upscaled” scales the processed low-resolution result by the detected/manual integer scale using canvas image smoothing disabled. It is not a target-size export and may not match the original canvas after snapping/cropping.
- **OBSERVED:** Clipboard copy is exposed. The author reports that clipboard permissions can fail inside the itch.io iframe because of browser security restrictions; see the [bug thread](https://itch.io/t/5211402/some-bugs).
- **CODE-DERIVED:** A processing manifest records dimensions, detected scale, method, options, and a timestamp. The timestamp makes the manifest itself nondeterministic even if the pixel bytes repeat.

## Live controls and defaults

The following table combines the live 1.2 UI with the pinned [application settings code](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/browser-tool/js/app.js).

| Control | Default | Range/options | Important behavior |
|---|---:|---|---|
| Auto-detect Colors | Off | Boolean | If enabled, estimates 2–32 colors; it does not infer an arbitrary natural palette size. |
| Max Colors | 16 | 2–1024, step 1 | 1024 is treated as “skip palette reduction.” Core quantization clamps an active request to 256, so 257–1023 do not mean what the UI suggests. |
| Snap to Grid | On | Boolean | Detects a phase and **crops** to complete cells; it does not pad or preserve the canvas. |
| Downscaling method | Dominant | Dominant, QVote, Nearest, Content-adaptive (experimental), Median, Mean | `mode` exists in the core/library but is not offered in the browser menu. |
| Grid algorithm | Complex Grid (Edge) | Complex Edge/tiled, Simple Edge/legacy, Auto (runs → edge) | Pure Runs is supported by the library but not directly exposed in this menu. Autocorrelation peak detection is CLI/core-only. |
| Dominant Threshold | 0.15 | 0.01–0.50, step 0.01 | Fraction of opaque samples in a block required for its most common exact RGB to win; it is not a “winner over runner-up” margin. |
| Auto-detect size | On | Boolean | Detects one scalar integer scale shared by X and Y. |
| Manual Pixel Size | 4 | 1–32, step 1 | Only active when size auto-detection is off. There is no manual X/Y split. |
| Morphological cleanup | On | Boolean | Per-channel 2×2 opening followed by closing; can destroy thin details and synthesize colors. |
| Jaggy cleanup | On | Boolean | Deletes a specific isolated/diagonal opaque-pixel pattern; can remove deliberate single-pixel detail. |
| Alpha binarization | On | Boolean | Makes alpha fully transparent or fully opaque before most processing. |
| Alpha threshold | 128 | 0–255 | Initial comparison is `>= threshold`; later block/finalization comparisons are not expressed identically throughout the pipeline. |

**CODE-DERIVED:** The reusable `processImage` function has slightly different defaults (`maxColors: 32`, morphology and jaggy cleanup off) from the browser application. A future product should have one canonical defaults schema used by UI, library, CLI, tests, and manifests.

Controls that do **not** exist are equally important: target width, target height, aspect/fit mode, alpha-visible-bounds Trim and threshold, crop anchor, padding, non-square cells, grid confidence, manual grid phase, partial-cell policy, color-distance model, quantizer choice, dither amount, transparent-color reservation, background removal, and preservation of soft alpha.

### Other-mode defaults (not part of the pixel reducer)

The application also exposes Vector and Layers tools. These are not substitutes for target-size pixelation, but matter when comparing the complete product surface.

- **CODE-DERIVED:** Vector preprocessing defaults to enabled bilateral filtering at value 30, morphology off; quantization is enabled with automatic color count and a nominal 16-color value; postprocessing uses a median filter of size 3. ImageTracer defaults include line threshold 2, quadratic threshold 2, path omission 30, right-angle enhancement on, stroke width 1.5, line filtering on, two-digit coordinate rounding, and a `viewBox`.
- **CODE-DERIVED:** Layers defaults include “pixel art first,” alpha threshold 1, average brightness, and detail boost 1.0. This extracts masks/details; it is not an edge-connected deterministic background-removal feature.
- **CODE-DERIVED:** Magnifier defaults are 4× zoom, 200 px, crosshair on, crisp rendering on, and debug off.

## Exact pixel pipeline

The main path in [`browser-tool/lib/pixel.js`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/browser-tool/lib/pixel.js) runs in this order:

1. **Decode** the browser bitmap to RGBA canvas pixels and enforce dimension/pixel limits.
2. **Binarize alpha** if enabled: values at or above the selected threshold become 255; others become 0.
3. **Select a scale** from the manual scalar or run/edge detector.
4. **Snap and crop** when enabled and scale > 1: calculate X/Y phase from Sobel edge energy, drop the leading phase offset, then truncate the right/bottom remainder until both dimensions divide by the scale.
5. **Morphological cleanup** if enabled.
6. **Count colors** among pixels with alpha > 128.
7. **Estimate an automatic color target** if enabled.
8. **Pre-quantize** when the effective maximum is below 1024 and the counted colors exceed it, except for content-adaptive mode.
9. **Downscale** by the selected reducer when scale > 1.
10. **Finalize alpha** as binary and zero the RGB channels of transparent pixels.
11. **Post-quantize** for QVote, content-adaptive, median, mode, mean, and nearest when requested. Dominant mode is excluded.
12. **Jaggy cleanup** if enabled.
13. **Encode PNG**, calculate the palette, and emit the manifest.

### Pipeline inconsistency: content-adaptive bypass

**CODE-DERIVED:** Content-adaptive mode receives the alpha-binarized original and a target of `floor(originalWidth / scale) × floor(originalHeight / scale)`. It does not receive the phase-snapped/cropped or morphologically cleaned buffer produced in steps 4–5. Nevertheless, the manifest can record snapping as applied. In practice, Snap and Morphology can be inert for this method while the state/manifest implies otherwise.

This is a pipeline/manifest inconsistency in the audited revision or an undocumented special case. Pixilate should make all algorithms consume a named, inspectable pipeline stage, and the manifest should record the stages that actually supplied the output.

## Scale and grid detection

### Runs detector

[`detect/runs.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/detect/runs.rs) scans exact RGBA runs horizontally and vertically, keeps run lengths greater than one, requires at least ten runs, and returns their greatest common divisor.

- **Strength:** Well suited to clean pixel art enlarged by an exact nearest-neighbor integer factor.
- **Failure:** A blur, JPEG ringing, subpixel transform, antialiasing, or a single irregular run can collapse the GCD to 1. That makes it poorly suited to most AI-generated mixels.
- **Design lesson:** Keep an exact-run detector as a high-confidence fast path, but never use it as the only general detector. Report evidence count and confidence.

### Complex Edge / tiled detector (browser default)

[`detect/edge.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/detect/edge.rs) converts pixels to Rec.601-style grayscale, divides the image into a 3×3 set of regions with 25% overlap, skips regions with grayscale standard deviation below 5, forms horizontal and vertical absolute Sobel-energy profiles, and autocorrelates each profile over lags 2 through `min(profileLength / 8, 128)`. It chooses the first local peak at least 60% as strong as the global maximum, gathers X and Y candidates greater than one, then selects their mode. If no tile yields a candidate, it falls back to the central 75% region.

- **Strength:** More tolerant of gradients and imperfect edges than exact runs; tiled voting is less hostage to one empty or noisy region.
- **Failure:** Repeated textures, outlines, checker patterns, and harmonics can produce a plausible but incorrect period. The first sufficiently strong local peak favors a sub-harmonic. The maximum detectable period is 128.
- **Failure:** Horizontal and vertical evidence is combined into one scalar. Non-square source pixels and unequal X/Y transforms are unsupported.
- **Failure:** Alpha is ignored in grayscale formation. Hidden RGB in transparent pixels can drive scale detection.
- **Failure:** No confidence is returned. A weak/ambiguous guess is operationally indistinguishable from a certain one.

The author's earlier article, [“How to Tame Your AI Pixel Art”](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5), is useful background but does not exactly describe the current 1.2 implementation. It discusses earlier peak-distance/tile heuristics and a Wu quantizer. Current source uses autocorrelation and libimagequant; the code snapshot is authoritative for current behavior.

### Simple Edge / legacy detector

**CODE-DERIVED:** The legacy path analyzes only the central 75% ROI. When horizontal and vertical candidates differ by no more than two it combines them; otherwise it takes the larger. It is easier to understand but more sensitive to the content in that one region.

### Auto detector

**CODE-DERIVED:** Auto attempts Runs and falls back to tiled Edge when Runs returns no usable scale. This is a reasonable ordering for clean enlarged sprites versus noisy images, but it does not compare scores or detect a confidently wrong Runs result.

### Grid phase snapping

[`snap.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/snap.rs) builds Sobel edge profiles, tests each phase from 0 to `scale - 1`, and selects the phase whose repeated samples have the highest total edge strength. Equal maxima resolve to the first phase encountered. It then crops the phase offset from top/left and truncates bottom/right to full cells.

This is phase *cropping*, not just “snap to grid.” It has no padding option, crop anchor, preview/confidence, or manual phase. Transparent RGB again participates. A target-first tool should preserve canvas and make Crop, Pad, and Partial Coverage explicit boundary policies.

## Downscale/reconstruction algorithms

The block reducers are implemented in [`downscale.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/downscale.rs).

| Method | Exact behavior | Strength | Important failure |
|---|---|---|---|
| Nearest | Center sample of each scale-sized block. | Preserves an existing palette; ideal when phase is known and the input is true nearest-upscaled pixel art. | A one-pixel phase error or antialiased edge can select the wrong sample. |
| Dominant (default) | Count exact packed RGB among samples whose alpha is >128. Use the most common color if its count / opaque count meets the threshold; otherwise use integer mean RGB. Output alpha is derived from median block alpha. | Strong, understandable majority reconstruction after quantization; avoids averaging many blocks. | Equal winners are nondeterministic due to Rust `HashMap` iteration. Mean fallback can create a color after pre-quantization, and dominant mode is not post-quantized, so final colors may exceed the requested cap. |
| QVote | Internally quantize the image to a fixed 24 colors with no dithering, then choose **per-channel** modes within each block. The outer pipeline may quantize before and after as well. | Often removes high-frequency AI color noise and prevents muddy area averages. | Hidden fixed palette size; rare details disappear; per-channel voting can synthesize RGB tuples that never occurred; up to three quantization stages complicate prediction. |
| Median | Median R, G, and B independently among opaque samples; median alpha over the block. | Robust against sparse extreme samples. | Independent channels can combine into a nonexistent color; it does not respect palette identity. |
| Mode | Mode of each channel independently, ties favor first encountered. | Simple and deterministic for ordered input. | Can synthesize nonexistent colors. Available in the core/library, not the browser menu. |
| Mean | Integer average of opaque RGB; median alpha. | Smooth representation of continuous imagery. | Creates new colors and usually looks muddy for pixel art until requantized. |
| Content-adaptive | Öztireli–Gross-style iterative reconstruction in CIE Lab, five fixed iterations; area pre-shrinks to at most about 3× the target ratio; alpha is area-resized separately. | Relevant candidate in this product for painterly, irregular, or gradient-heavy inputs with no stable exact cell color. | Can soften edges/halos, mixes colors, consumes the unsnapped original, and has no exact-pixel preservation guarantee. |

All block methods use a scalar integer scale. Without snapping, incomplete right/bottom blocks are discarded. With snapping, leading X/Y phase and trailing remainders are discarded. There is no way to request, for example, exactly 32×32 pixels unless the input dimensions and inferred scale happen to produce it.

### Default dominant threshold semantics

The 0.15 default means a color wins if it occupies at least 15% of the *opaque samples* in a block. It is not compared to the runner-up and is much lower than a majority. After pre-quantization this frequently selects a palette color, but in highly mixed blocks the result can hinge on a small plurality. The current UI label does not communicate this.

## Quantization and palette behavior

The current core uses [`imagequant`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/quantize.rs), configured at speed 1 and dithering level 0. The exact resolved crate version in the audited lockfile is 4.4.1.

- **CODE-DERIVED:** Active color requests are clamped to 2–256 by the core. The browser slider extends to 1024; 1024 is special-cased to skip reduction, while 257–1023 are active requests that collapse to 256.
- **CODE-DERIVED:** QVote always performs its own fixed 24-color quantization before block voting, independent of the user's chosen maximum.
- **CODE-DERIVED:** A fixed/imported palette API exists and maps each pixel to the closest palette member by unweighted squared RGBA distance, with ties favoring the first palette entry. It is not exposed as a primary browser input workflow.
- **OBSERVED:** The post-process palette editor changes exact final colors globally. It can assign transparency to a color, but this is not background segmentation: matching foreground pixels change too.
- **CODE-DERIVED:** Final transparent pixels have RGB zeroed, which is good for canonical PNG output but prevents preservation of hidden RGB.

### Automatic color count

[`color_count.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/color_count.rs) area-resizes to 64 pixels wide while preserving aspect ratio, applies a per-channel 5-sample median and 5-sample Gaussian smoothing, bins RGB in steps of 48, ignores alpha below 200, and counts bins occupying at least `max(3 pixels, 1.5% of the resized image)`. If that exceeds the cap it retries at 2%, then clamps the result to 2–32.

The percentage denominator includes the full resized canvas, including transparent pixels. **INFERRED:** A small opaque sprite in a large transparent canvas can therefore undercount its meaningful colors. Auto Colors is interpreted here as a coarse dominant-color estimate, not a palette-faithfulness analysis.

## Alpha, transparency, cleanup, and background removal

### Alpha

- **CODE-DERIVED:** Default alpha binarization destroys soft shadows, translucent antialiasing, glow, and partial coverage before grid reconstruction.
- **CODE-DERIVED:** Initial alpha exactly equal to 128 becomes opaque at the default threshold. Reducers and finalization use their own `>128`/`<128` comparisons, which makes threshold-edge reasoning unnecessarily difficult.
- **CODE-DERIVED:** Content-adaptive RGB calculations do not premultiply or mask hidden transparent RGB, while alpha is resized separately. Hidden edge colors can therefore influence visible RGB before final transparency cleanup.
- **CODE-DERIVED:** Edge/phase analysis likewise ignores alpha.

Pixilate should expose Preserve, Binary Threshold, Coverage, and Matte alpha policies, define all comparison boundaries once, and sanitize or deliberately premultiply hidden RGB before structure/color analysis.

### Morphological cleanup

[`morphology.rs`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/src/morphology.rs) performs a 2×2 per-channel minimum/maximum opening and closing with a top-left anchor and replicated border handling.

This can remove one-pixel details and narrow lines, fill small gaps, shift edges, and create channel combinations that were never an input color. It is especially risky as an enabled-by-default step for clean/manual pixel art. Morphology intended for sprite structure should operate on a mask, labeled palette regions, or perceptual whole-color samples—not independently on R, G, B, and A.

### Jaggy cleanup

**CODE-DERIVED:** The jaggy cleaner removes an interior opaque pixel when all four orthogonal neighbors are transparent and exactly one diagonal neighbor is opaque. It does not know whether that pixel is noise, a star, an eye highlight, a deliberate diagonal connector, or a one-pixel appendage. This should be off by default or exposed as a very explicit orphan-rule operation with a preview/diff.

### Background removal

Unfaker has no deterministic background-removal algorithm. Existing transparency can be binarized and final colors can be edited globally; neither identifies a background. The Layers mode is not a background remover.

For Pixilate, background removal belongs in a separate feature/tab as proposed by the project brief. A deterministic design should start with edge-connected flood selection plus exact/perceptual tolerance, optional alpha/matte decontamination, hole/island controls, manual seeds, and mask preview. Any shared settings with resize/pixelate must be explicit and serialized.

## Determinism audit

| Layer | Assessment | Evidence and implication |
|---|---|---|
| Same loaded RGBA buffer, nearest/mean/median/mode | Mostly deterministic-intent | **CODE-DERIVED:** Fixed loops and integer operations dominate. Mode ties use scan order. Add golden tests before claiming byte-exactness. |
| Dominant method | **Not strictly deterministic** | **CODE-DERIVED:** Equal-count color winners are selected through randomized Rust `HashMap` iteration. JS fallback insertion order can choose a different tie winner. Replace with packed-color counts plus an explicit stable tie rule. |
| Quantizer | Deterministic-intent, not an established cross-platform contract | **CODE-DERIVED:** Dithering is disabled and the v1.2 release says native/WASM golden tests agree. Histogram/palette construction still includes hash-backed structures in some paths, and dependency/version changes could alter output. Pin engine and golden vectors. |
| Content-adaptive | Likely repeatable for a fixed engine, not proven bit-exact across runtimes | **CODE-DERIVED:** Fixed iteration count, but floating-point Lab/EM calculations are used. No cross-browser corpus evidence was found. |
| Decode | Not canonical | **CODE-DERIVED/UNKNOWN:** `createImageBitmap` and canvas control orientation/color conversion at browser discretion. ICC, EXIF, premultiplication, and browser-version parity are not specified. |
| PNG encode | Strong within pinned core | **CODE-DERIVED:** The Rust PNG path is shared and simple RGBA8. Pin encoder/version and remove incidental metadata for reproducible bytes. |
| Manifest | Nondeterministic | **CODE-DERIVED:** Includes wall-clock timestamp. Keep timestamp outside the canonical processing recipe/hash. |
| Product version | Not self-evident | **OBSERVED:** itch copy/download labels differed from the live build observed. A deterministic product must surface exact engine/build IDs in output and UI. |

The repository includes [Rust golden tests](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/tests/golden.rs), a [JavaScript core smoke test](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/scripts/test-core.mjs), and [CI](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/.github/workflows/ci.yml). The checked-in golden cases are small synthetic checker-like images. No representative AI-mixel corpus is checked into the repository, and the CLI evaluation command refers to an external/omitted corpus. These tests support regression confidence in the core; they do not validate general input accuracy.

## Privacy, offline use, and performance

### Privacy/offline

- **CODE-DERIVED:** Processing is local: browser decode → canvas RGBA → worker/WASM → local PNG. No image upload path was found.
- **INFERRED:** A downloaded/self-hosted copy should operate after its static assets are available over HTTP. ES modules/WASM may not work directly from `file://`.
- **UNKNOWN:** No service worker or explicit offline/PWA cache was found, so the itch-hosted experience should not be called offline-first.
- **CAUTION:** “Local processing” does not mean “no network traffic”; itch hosting, page assets, and possible platform telemetry remain external.

### Performance

The [1.2.0 notes](https://jenissimo.itch.io/unfaker/devlog/1548922/v120-rustwebassembly-core) report removal of roughly 10 MB of OpenCV payload and estimate content-adaptive processing at approximately 16× less work for scale 12 because of the pre-shrink. The older [1.1.0 notes](https://jenissimo.itch.io/unfaker/devlog/1547707/unfaker-update-v110) describe the previous OpenCV worker and color-limit changes; those timings/architecture are historical.

**CODE-DERIVED:** Most passes are linear in source pixels, but the pipeline creates several full RGBA copies across canvas, worker transfer, WASM buffers, quantization, cleanup, and PNG output. A 10-megapixel RGBA frame is about 40 MB before duplicate buffers and allocator overhead, so peak memory can plausibly reach hundreds of MB. The worker has a 30-second initialization guard and bitmap load has a timeout, but there is no visible per-operation cancellation/timeout contract after processing begins.

**UNKNOWN:** No authoritative desktop/mobile 10 MP benchmark, peak-memory measurement, or quality-versus-time suite is published. Tiny synthetic tests completed interactively without noticeable delay, which is not a meaningful performance benchmark. Rust tests could not be run in this environment because the Rust toolchain was unavailable.

## Hands-on synthetic tests

Three generated test images were used against the live 1.2 build. These were diagnostic probes, not a quality benchmark. Temporary files were kept outside the repository and removed after testing.

| ID | Input | Live settings | Observed result | Interpretation |
|---|---|---|---|---|
| U-01 | 13×11, four opaque colors plus transparency, enlarged exactly 8× nearest to 104×88 | Defaults: Complex Edge, Snap, Dominant 0.15, 16 colors, cleanup on | **OBSERVED:** detected scale 8 and returned 13×11 with four opaque colors | Strong clean-integer-upscale case. Demonstrates the intended happy path. It does not test whether default cleanup preserved every source pixel byte. |
| U-02 | Same source transformed to 101×85 with Mitchell resize plus color noise; 1,192 colors | Defaults | **OBSERVED:** detected scale 8, returned 11×9, 16 reported colors | The scale estimate was plausible, but snap/remainder cropping reduced the logical canvas substantially versus the intended ~13×11. Target sizing would prevent this silent semantic loss. |
| U-03 | U-02 with QVote | QVote, otherwise defaults | **OBSERVED:** 11×9, detected scale 8, seven colors | QVote reduced color noise but did not fix scale/phase/canvas inference. Palette cleanup and geometry reconstruction are separate problems. |
| U-04 | 33×29 transparent canvas with two opaque colors and non-divisible content | Defaults | **OBSERVED:** detected scale 1 and returned 33×29, two colors | When no scale is detected, Unfaker is not an arbitrary image-to-small-pixel-art resizer. Cleanup/quantization may still alter pixels even without resizing. |

The U-02 result is the product's core limitation in miniature: it optimizes “infer the historical nearest-neighbor upscale factor,” while Pixilate must optimize “produce exactly the requested logical dimensions with a declared canvas/alpha-visible-bounds policy and serialized alpha threshold.”

## Proposed reproducible evaluation matrix for Pixilate

The first four rows correspond to the live probes above. Remaining rows should become a checked-in, license-clean reference corpus with input hashes, exact expected geometry, objective metrics, and visual goldens.

| Case | Input regime | What it isolates | Expected assertions |
|---|---|---|---|
| U-01 | Exact nearest-upscaled clean sprite | Runs/edge scale and phase | Exact source dimensions, palette, alpha, and pixel hash recovered. |
| U-02 | AI-like blur/noise/mixel transform | Robust scale versus required target | Requested target dimensions always win; detector affects reconstruction only, never output geometry. |
| U-03 | Same mixel, palette-vote path | Palette noise suppression | Palette count cap is exact; detail-retention and region-boundary metrics improve without geometry changes. |
| U-04 | Transparent, non-divisible canvas | No-grid behavior | Declared Canvas/Trim and Crop/Pad/Partial policy produces predictable exact dimensions. |
| U-05 | Two colors tied 50/50 in many blocks | Deterministic ties | Same output hash across 1,000 runs, WASM/native, browsers, threads, and CPU architectures; documented tie rule. |
| U-06 | Different horizontal/vertical upscale factors | Non-square cells | Correct X/Y scale or explicit unsupported/low-confidence result; never average into one wrong scalar. |
| U-07 | Checkerboard/brick/stripe harmonics | Detector aliases | Return ranked candidates and confidence; target-aware scoring chooses the correct fundamental or asks for manual input. |
| U-08 | One-pixel diagonals, highlights, holes, thin limbs | Cleanup safety | Clean-pixel preset is exact/no-op; optional cleanup differences are visible and reversible. |
| U-09 | Soft alpha, glow, hidden RGB, matte fringe | Alpha correctness | Preserve/coverage/binary policies have golden alpha; transparent RGB cannot skew geometry or bleed unexpectedly. |
| U-10 | Small opaque sprite on huge transparent canvas | Trim and auto palette | Opaque-bounds target produces exact result; palette estimator denominator excludes irrelevant transparent area. |
| U-11 | JPEG/WebP with ringing and ICC/EXIF | Canonical decode | Same canonical RGBA and output hash across supported runtimes, or explicitly document platform variance. |
| U-12 | Opaque flat background matching a foreground color | Background removal safety | Edge-connected selection removes only background-connected pixels; global color replacement fails this test by design. |
| U-13 | 2, 16, 32, 64, 256 requested colors | Cap semantics | Actual final distinct colors never exceed cap; no hidden method-specific palette size. |
| U-14 | 10 MP desktop and mobile-class hardware | Memory/performance | Peak memory, p50/p95 time, cancellation, and out-of-memory behavior meet declared budgets. |
| U-15 | Already-correct low-resolution pixel art | No-op fidelity | Identity preset returns exact RGBA/geometry; processing never “improves” it without explicit opt-in. |
| U-16 | Continuous photo/illustration with no grid | General raster support | Target dimensions exact; content-aware/palette reconstruction is evaluated without pretending a source cell size exists. |

Useful metrics should include exact hash for identity/golden cases, output dimension error (must be zero), palette overflow (must be zero), alpha disagreement, edge displacement, connected-component survival, rare-detail recall, perceptual color error, and expert pairwise preference. No single perceptual metric can stand in for sprite readability.

## Strengths by input class

| Input | What works well |
|---|---|
| Clean pixel art enlarged by an integer | Exact-run and edge detection plus phase snap and nearest/dominant can recover the logical sprite. |
| AI mixels with a roughly periodic pseudo-grid | Tiled edge autocorrelation can find a useful scale; prequantization and QVote often suppress color chatter better than a plain area/mean resize. |
| Painterly or irregular raster | Content-adaptive reconstruction is a relevant optional expert algorithm when exact palette-cell recovery is impossible. |
| Transparent sprites | The output is canonical binary-alpha PNG, and transparent RGB is zeroed at the end. |
| Local/privacy-conscious workflow | Worker/WASM processing does not upload source pixels; source and CLI are available. |
| Experimentation | Several reducers, detectors, thresholds, cleanup toggles, preset storage, palette editing, magnifier, before/after views, and a manifest make comparison practical. |

## Failure modes by input class

| Input | Likely failure |
|---|---|
| Arbitrary photo/painting with no latent grid | Scale may be 1 or a texture period; scale 1 means no resizing, so the tool does not satisfy arbitrary target-size pixelation. |
| AI image with irregular pseudo-pixels | A harmonic/texture may become the scale; phase snap can crop content; QVote fixes colors, not geometry. |
| Already-correct/manual pixel art | Default morphology and jaggy cleanup can delete or mutate intentional one-pixel design. |
| JPEG/WebP or antialiased input | Exact Runs fails; artifacts inflate color counts and can move edge evidence. |
| Thin line art/detail | Morphology, dominant plurality, quantization, and jaggy cleanup can erase semantic details. |
| Transparent/soft-edged art | Alpha is binary by default; hidden RGB can bias detection/content-adaptive color; soft effects are lost. |
| Non-divisible canvas | Leading phase and trailing remainder are cropped; there is no padding/coverage/anchor choice. |
| Non-square pixels or unequal transforms | One scalar scale cannot represent the source. |
| Large image/mobile browser | Multiple full-size buffers plus WASM/quantization pressure memory; 10 MP hard limit does not guarantee mobile viability. |

## Licensing and open-source reuse

### Findings

1. **VERIFIED:** The Unfaker repository and core crate declare MIT.
2. **VERIFIED:** The core depends on `imagequant = 4.4` with default features disabled in [`crates/unfake-core/Cargo.toml`](https://github.com/jenissimo/unfake.js/blob/b2bee10c1c3b211a2532baca9088857b19480dca/crates/unfake-core/Cargo.toml); the lockfile resolves 4.4.1.
3. **VERIFIED:** The [libimagequant site](https://pngquant.org/lib/) and [licensing page](https://pngquant.org/licensing.html) state GPLv3+ terms for free/open-source use and offer commercial licensing for non-GPL distribution.
4. **CODE-DERIVED:** The quantizer is part of the compiled core, not an optional server-side utility outside the distributed application.
5. **INFERRED:** Distributing a combined WASM/browser application that statically incorporates GPL code requires a consciously selected GPL-compliant or commercial-license path and cannot be solved with an attribution line alone. The repository's MIT declaration covers its own code; it does not relicense a dependency.

### Pixilate decision

Do not copy the quantization implementation/dependency into Pixilate's planned production bundle until counsel or a qualified license review confirms a compliant path. Planning options are:

- choose a permissively licensed quantizer, preserve its own notices, and validate it against the corpus;
- independently implement a deterministic quantizer from identified public papers/specifications, without copying restricted source and with careful patent/license review;
- isolate an optional GPL-compliant build/distribution clearly while keeping GPL code out of the current permissively distributed bundle; or
- obtain an appropriate commercial libimagequant license if product/distribution goals support it.

The algorithmic idea “quantize without dithering, then palette-vote per target cell” is general and reusable. Source code from an incompatibly licensed implementation is not.

ImageTracer's vendored header identifies it as Unlicense/public-domain, and Tweakpane is MIT. Those dependencies are not the critical license blocker for the pixel pipeline.

## Mapping Unfaker controls to Pixilate's future advanced UI

| Pixilate section | Proposed controls | Relationship to Unfaker |
|---|---|---|
| Output geometry | Target width/height; lock aspect; sizing basis **Canvas / Alpha-visible Bounds (Trim)**; serialized Trim threshold defaulting to `alpha > 0`; Contain/Cover/Stretch; anchor; padding | New and mandatory. Output geometry must never be an incidental quotient of detected scale. |
| Input regime | Auto, Exact Pixel Grid, Mixel/AI Raster, Continuous Raster | Makes safe defaults possible without AI processing. Classification can be deterministic measurements with confidence. |
| Grid evidence | Scale source Target-derived/Detect/Manual; X and Y scales; Runs/Edge/Ensemble; ranked candidates; confidence; max period | Generalizes Unfaker's Runs/Edge/manual scalar and fixes non-square/uncertainty gaps. |
| Grid phase/bounds | Auto/manual X/Y phase; visual overlay; Crop/Pad/Partial Coverage; crop anchor; preserve canvas | Replaces destructive implicit Snap. |
| Reconstruction | Palette vote, nearest, whole-color medoid, median, mean/area, content-adaptive; coverage threshold; deterministic tie rule | Retains useful reducers but avoids per-channel synthetic colors by default. |
| Palette | Exact cap; quantizer; perceptual space/distance; fixed/imported palette; before/after/both timing; dithering; reserve transparent; rare-color protection | Makes QVote's hidden 24 and core's hidden 256 cap explicit or removes them. |
| Alpha | Preserve, Binary, Coverage, Matte; threshold; premultiply policy; hidden-RGB sanitation | Replaces unconditional binary finalization. |
| Cleanup | Off by default; mask morphology; connected-component/orphan area; diagonal preservation; preview diff | Replaces destructive per-channel morphology and semantic-blind jaggy rule. |
| Background tab | Edge-connected exact/tolerance flood; multiple seed points; holes/islands; matte decontamination; mask preview | New, deterministic, and separate from resize/quantize. |
| Reproducibility | Engine/recipe version; canonical input hash; output hash; seed/tie rules; actual stages; benchmark/debug trace | Improves Unfaker's manifest; timestamps remain noncanonical metadata. |

### Recommended no-advanced-settings routing

1. The user's requested target geometry and Canvas/Trim basis are authoritative.
2. Canonicalize orientation/color/alpha into a documented internal RGBA representation.
3. Measure exact runs, edge periodicity, X/Y agreement, palette entropy, and alpha coverage.
4. If an exact grid has high confidence, use target-aware phase plus whole-color palette voting/nearest reconstruction and disable cleanup.
5. If mixel evidence is present, use robust target-cell coverage with perceptual palette clustering and a deterministic whole-color winner/medoid.
6. If no grid is credible, use a general raster reducer/content-adaptive option directly to the requested target—not a fictitious detected cell size.
7. Apply the exact palette cap after all color-producing operations.
8. Never crop, delete details, binarize alpha, or remove background unless the selected preset/policy says so.

This is still a conventional, deterministic decision tree. It does not require AI inference.

## Reusable ideas

- Exact-run detection as a high-confidence fast path for nearest-upscaled sprites.
- Tiled edge autocorrelation, extended to X/Y candidates, confidence, harmonic analysis, alpha-aware profiles, and target-aware ranking.
- The QVote *concept*: reduce color noise, then vote within logical target cells.
- Worker/WASM isolation and a shared browser/CLI core.
- Explicit manual fallback, before/after comparison, grid overlay/magnifier, presets, palette inspection/editor, and downloadable recipe manifest.
- Dithering disabled by default for crisp small sprites, while exposing it as an expert option for deliberate styles.
- Canonical zero RGB under fully transparent output—provided hidden RGB policy is explicit earlier in the pipeline.

## Avoid or redesign

- Do not call destructive phase cropping merely “Snap to Grid.”
- Do not infer output dimensions only from source dimensions divided by a scale.
- Do not combine X/Y evidence into one scalar.
- Do not use unordered hash iteration to settle output pixels; specify stable tie rules.
- Do not vote/morph R, G, and B independently when palette identity matters.
- Do not let hidden transparent RGB influence grid evidence or edge colors by accident.
- Do not enable morphology or orphan deletion by default for unknown/manual art.
- Do not hide method-specific constants such as QVote's 24 colors.
- Do not expose a 1024-color slider around a 256-color quantizer without precise semantics.
- Do not skip final cap enforcement after any color-producing operation. Dominant mean fallback demonstrates why.
- Do not let a manifest claim a stage affected output when an algorithm bypassed that stage.
- Do not mix background removal into quantization or global palette replacement.
- Do not claim strict determinism while browser decoding, dependency versions, floating math, ties, and build identity are unspecified.
- Do not adopt a GPL dependency into the planned permissive production bundle without consciously selecting and satisfying the applicable obligations.

## Unresolved questions and follow-up experiments

1. **UNKNOWN:** Which exact source commit produced every hosted JavaScript asset? The live WASM matched the current repository snapshot, while selected JavaScript did not byte-match.
2. **UNKNOWN / legal review required:** Is the current Unfaker distribution relying on GPL compliance, a commercial libimagequant license, or another exception? No public clarification was found.
3. **UNKNOWN:** Is content-adaptive's bypass of snapping and morphology intentional? If so, why does state/manifest presentation not disclose it?
4. **CODE-DERIVED, needs golden reproduction:** Can dominant mean fallback cause actual final palette count to exceed Max Colors? The pipeline strongly indicates yes; add a constructed block corpus and assert actual output palette.
5. **CODE-DERIVED, needs cross-runtime reproduction:** How frequently does the dominant `HashMap` tie choose different pixels across WASM instances, browsers, or native runs?
6. **UNKNOWN:** What accuracy does tiled Edge/QVote achieve on a representative, redistributable AI-mixel corpus? The referenced evaluation corpus is absent.
7. **UNKNOWN:** Are browser ICC/EXIF/premultiplication results identical across Chrome, Firefox, Safari, and WebView versions?
8. **UNKNOWN:** What are p50/p95 time and peak memory at 1, 4, and 10 MP on desktop and mobile-class hardware?
9. **UNKNOWN:** Is the fixed-palette API intentionally library-only, or planned for the browser UI?
10. **UNKNOWN:** Is target width/height on the Unfaker roadmap? No public target-sizing design was found.
11. **UNKNOWN:** Is offline caching/PWA installation intended? No service worker was found.
12. **UNKNOWN:** What is the intended first-frame/animation behavior for GIF/WebP/AVIF inputs?

## Bottom line for Pixilate

Unfaker validates that a non-AI, browser-local tool can recover clean integer-upscaled sprites and improve many AI mixels. It also exposes why Pixilate must be target-first rather than scale-first. Geometry, grid evidence, phase, reconstruction, palette, alpha, cleanup, and background removal should be separate stages with explicit contracts. Every stage needs a deterministic tie/boundary rule, canonical inputs, exact postconditions, a truthful recipe, and corpus-backed routing defaults.

The primary idea to carry forward is not one reducer. It is a staged workbench with useful detectors and reducers—rebuilt around exact requested dimensions, non-destructive bounds policies, whole-color deterministic voting, final palette enforcement, alpha-aware analysis, conservative defaults, and an audited dependency set whose individual licenses are honored alongside MIT-licensed Pixilate code.
