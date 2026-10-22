# Commercial and web image-to-pixel-art landscape

**Research date:** 2026-07-31  
**Addendum:** 2026-10-19 inventory additions ([addendum](#addendum--2026-10-19-inventory-additions)); where it differs from the July text, the addendum governs.  
**Scope:** user-facing converters, grid-recovery tools, general image processors, and adjacent AI products  
**Project constraint:** Pixilate is intended to be open source under MIT and deterministic; this report does not recommend copying code merely because a product is publicly accessible.

## Executive conclusion

No tool in this bounded, dated review was documented to combine all of the following:

1. independent, explicit native output width and height;
2. a choice between sizing the full canvas and sizing the alpha-visible bounding box under a serialized threshold (default `alpha > 0`);
3. automatic recovery of an intended pixel lattice from mis-scaled or filtered pixel art;
4. high-quality reduction of continuous-tone or AI-generated raster art;
5. explicit, independently controllable palette extraction/remapping and dithering;
6. deterministic, reproducible output with a saved processing recipe;
7. explainable artifact cleanup rather than opaque generative repair;
8. local browser processing and a license-compliant implementation path compatible with MIT-licensed Pixilate-owned code.

That gap is real, but it is not solved by selecting one universally “best” resize algorithm. The input classes are materially different. Clean grid art, distorted grid art, mixed-resolution “mixels,” anti-aliased illustration, and photographic input require different objectives. Pixilate should classify or let the user select the input mode, expose an exact target contract, and run a deterministic pipeline with separately testable stages.

Selected implementation and workflow references from the review are:

- **Retro Diffusion Pixel Art Fixer Standard** for grid-period estimation and reconstruction of distorted pixel art. It is MIT and unusually well documented, but its inferred size can be wrong and its own manual pixel-size override remains important. See the dedicated [Retro Diffusion spike](../products/retro-diffusion-pixel-art-fixer.md).
- **SpriteFusion Pixel Snapper** for a small, browser-native grid-snapping reference. See the dedicated [SpriteFusion spike](../products/spritefusion-pixel-snapper.md).
- **Unfake.js** for user-visible recovery controls. See the dedicated [Unfake.js spike](../products/unfake-js.md).
- **GameTorch image_to_pixel_art_wasm** for a compact MIT Rust/WASM palette-and-downsample baseline.
- **Tezumie Image-to-Pixel** for a broad MIT JavaScript dithering/palette API and a useful browser UX reference.
- **Pixel It** for a minimal MIT browser baseline whose limitations are easy to understand and benchmark.
- **ImageMagick** for mature deterministic primitives and a permissive linking/redistribution model that can coexist with MIT-licensed Pixilate-owned code while retaining ImageMagick's own license and attribution obligations.

Commercial tools such as PixelOver and PixaTool are useful behavior and UX references, not code sources. Generic “pixelate” filters from Adobe, Canva, LunaPic, and similar products mostly create a mosaic effect; they do not reconstruct a native pixel grid or enforce a palette budget.

## Evidence policy

Every material claim in this report should be read with one of these labels:

- **VERIFIED:** stated in an official product page, official documentation, or the project’s own repository/license.
- **CODE-DERIVED:** directly established from public source code. This establishes current implementation, not necessarily authorial intent or future behavior.
- **OBSERVED:** seen in a hands-on browser session on 2026-07-31. It is one environment and fixture, not a comprehensive benchmark.
- **INFERRED:** a reasoned conclusion from the above evidence; it needs validation before becoming a product requirement or technical decision.
- **UNKNOWN:** not disclosed, not accessible, or not established to an acceptable confidence level.

Vendor benchmark results are reported as **vendor-reported**, even where the benchmark repository itself is verified. Prices and commercial entitlements are snapshots and must be rechecked before purchasing or publishing comparisons.

**Inventory-table convention:** unprefixed product-surface entries are **VERIFIED vendor-reported**, not independent validation. Rows say **OBSERVED** or **CODE-DERIVED** when based on this audit's live probes or pinned public source. “Local” means the vendor says processing is local unless the row explicitly reports a network audit. Determinism remains **UNKNOWN** unless output bytes were captured repeatedly under a pinned build; marketing words such as “deterministic” are not sufficient.

## Method and bounded-exhaustive caveat

This was a bounded-exhaustive landscape search, not proof that no obscure tool exists. It covered products discoverable through English-language web search, official documentation, GitHub, itch.io, and cross-links from the products themselves as of the research date. Products hidden behind regional indexes, mobile app stores, private communities, abandoned binaries, or non-indexed repositories may be absent.

Search families included:

- exact product names and historical names;
- `image to pixel art converter target width height palette dithering`;
- `AI pixel art fixer grid detector open source`;
- `pixel art downscale orphan pixel cleanup`;
- `pixel grid recovery non integer scale`;
- `site:github.com image to pixel art wasm` and related source/license queries;
- `site:itch.io pixelate image palette dither`;
- official documentation queries for resize geometry, alpha, indexed color, trim, and licensing;
- redirect/status checks for products that have changed ownership or positioning.

Official pages, documentation, source, and license files were preferred over blogs and aggregator descriptions. Marketing language such as “AI,” “smart,” “pixel perfect,” and “custom resolution” was not treated as an algorithm specification.

The three tools named by the project owner have dedicated deep spikes and are not duplicated here. Since 2026-10-19, Retro Diffusion Pixel Art Fixer has one too:

- [PixelLab](../products/pixellab.md)
- [SpriteFusion Pixel Snapper](../products/spritefusion-pixel-snapper.md)
- [Unfake.js](../products/unfake-js.md)
- [Retro Diffusion Pixel Art Fixer](../products/retro-diffusion-pixel-art-fixer.md)

## Hands-on fixture design

Four synthetic fixtures were generated outside the repository so dimensions, palette size, and alpha behavior were known:

| Fixture | Ground truth | Purpose |
|---|---:|---|
| Clean grid source | 8×8, six RGBA colors | Baseline for exact lattice and palette recovery. |
| Distorted grid | 83×77, 2,426 RGBA values | The 8×8 source was stretched to a non-integer, nonuniform size with Lanczos filtering. Tests period inference, phase, blur, and reconstruction. |
| Continuous illustration | 256×192, 2,014 RGBA values | Gradient and vector-like shapes with no true pixel lattice. Tests ordinary raster reduction and false-positive grid detection. |
| Transparent-border sprite | 128×96, 57 RGBA values | Alpha-visible subject surrounded by transparent margins. Tests whether “target size” applies to the canvas or the bounds selected by an explicit alpha threshold (default `alpha > 0`). |

Desired measurements were exact native output dimensions, opaque bounding box, unique RGBA count, alpha preservation, repeated-run byte equality, and recovery error against known ground truth. Most hosted tools did not expose downloadable results or all necessary controls during this pass, so the results below report only measurements actually available. A future comparative benchmark should automate downloads and compute these metrics from the output files.

## Hands-on results

| Tool | Fixture and settings | Result | Interpretation |
|---|---|---|---|
| [Retro Diffusion Pixel Art Fixer Standard](https://www.retrodiffusion.ai/tools/pixel-art-fixer/) | Distorted grid (Auto and manual size 10); continuous illustration (Auto) | **OBSERVED:** auto missed the 8×8 truth by one column; manual size 10 recovered 8×8; a 17×15 lattice was asserted on continuous art. Full results are in the [dedicated spike](../products/retro-diffusion-pixel-art-fixer.md#hands-on-probes-observed-2026-07-31). | Auto-detection needs confidence, alternatives, and refusal; it must not have silent authority. |
| [Pixel It](https://giventofly.github.io/pixelit/) | Distorted grid, default scale 7 | **OBSERVED:** preview canvas remained 83×77 while pixels were visually enlarged into blocks. | Its primary operation is a pixelation effect rendered at source canvas size, not an exact native low-resolution export contract. |
| Pixel It | Entered Max Width 32 and reloaded the fixture | **OBSERVED:** the session did not show a native canvas change. **CODE-DERIVED:** the library does contain a separate proportional `resizeImage()` path. | The UX path was not reliable enough here to score; the code establishes max-bound support, not arbitrary exact W×H. |
| [Tezumie Image-to-Pixel](https://tezumie.github.io/Image-to-Pixel/) | Continuous illustration, pixel width 16, PICO-8, no dither | **OBSERVED:** processing completed and controls remained responsive. | It offers a true pixel-width workflow and broad palette/dither control. Height remains aspect-derived; displayed canvas dimensions were UI dimensions and were not treated as export dimensions. |
| [SimplePixelArt](https://simplepixelart.com/convert) | Continuous illustration, size 16, four colors | **OBSERVED:** the UI accepted both settings and displayed exactly four editable palette entries. | Strong approachable controls and cleanup UX, but square size presets and undisclosed source/algorithm limit its value as an implementation reference. |
| [Palettely](https://palettely.app/image-to-pixel-art) | Transparent-border fixture, 16×16, eight colors | **OBSERVED:** conversion accepted; available fit modes were Fit whole, Fill square, and Stretch. No opaque-bound Trim option was present. | Transparent margins participate in the fit decision, so the subject can occupy fewer than the requested pixels. This is the exact semantic gap Pixilate’s Trim contract should close. |
| [GameTorch](https://gametorch.app/image-to-pixel-art) | Attempted live test | **OBSERVED:** page timed out in the research browser. | Source and documentation were still auditable, but runtime behavior was not independently tested in this pass. |

None of these observations establishes repeated-run determinism. That requires captured output bytes, normalized metadata, multiple runs, and preferably multiple browser/CPU targets.

## Master inventory

Legend: **Exact W×H** means independent native output dimensions, not a block-size slider, a longest-side target, or square presets. “Local” means the product says processing runs in the browser; that claim was not network-audited in this pass.

### Core converters and recovery tools

| Product | Status/platform | Sizing and grid behavior | Palette/dither/cleanup | Source/license | Fit for Pixilate |
|---|---|---|---|---|---|
| PixelLab Unzoom / Resize / Image to Pixel | Hosted AI product | Dedicated spike | Dedicated spike | Proprietary/hosted | Research reference; see [spike](../products/pixellab.md). |
| SpriteFusion Pixel Snapper | Web/vendor-reported local | Infers/snap-recovers a grid; limitations in dedicated spike | Grid-oriented rather than a complete palette lab | MIT core repository | Focused public-code reference; see [spike](../products/spritefusion-pixel-snapper.md). |
| Unfake.js | Web/local | Flexible manual grid recovery | Extensive recovery controls | See dedicated license analysis | Strong UX/algorithm reference; see [spike](../products/unfake-js.md). |
| [Retro Diffusion Pixel Art Fixer Standard](https://www.retrodiffusion.ai/tools/pixel-art-fixer/) | Web/vendor-reported local; active at snapshot | Auto period/phase recovery or manual pixel size; result dimensions inferred, not independently requested W×H | Auto/explicit/custom palette; Bayer 2/4/8 and strength | [MIT at audited revision](https://github.com/Retro-Diffusion/pixel-art-fixer/tree/ef376e57e1c272633ca2dbf5f29ec3fcf6596465) | Thoroughly documented open grid-recovery reference; see [spike](../products/retro-diffusion-pixel-art-fixer.md). |
| [Pixel It](https://giventofly.github.io/pixelit/) | Web/local; active repo | Block effect at source canvas size; max width/height proportional helper | Default/custom palette; nearest RGB remap | [MIT at audited revision](https://github.com/giventofly/pixelit/tree/9c53dfa191fcb2f4a4507c21f40647c29e352939) | Useful minimal baseline, insufficient target contract. |
| [Tezumie Image-to-Pixel](https://tezumie.github.io/Image-to-Pixel/) | Web/local; v2 | Exact pixel width; aspect-derived height; download native pixel or original resolution | Custom/Lospec palettes; Floyd–Steinberg, Atkinson, Bayer, ordered, clustered | [MIT library template and Apache-2.0 app at audited revision](https://github.com/Tezumie/Image-to-Pixel/tree/b0d5b7422db309dae22c2a69d4ebca0ce8c14b78) | Strong browser palette/dither reference; no grid recovery or independent W×H. Library-license placeholder needs resolution before reuse. |
| [GameTorch](https://gametorch.app/image-to-pixel-art) | Web/local + Rust CLI | Longest-side target; aspect-derived other side; optional longest-side upscale | Lab k-means or fixed palette; histogram resampling; no published dither | [MIT at audited revision](https://github.com/gametorch/image_to_pixel_art_wasm/tree/4cf0fff2dfbba410cbabcc67fb638a3032af76b5) | Strong compact Rust/WASM baseline; exact W×H, trim, and grid recovery absent. |
| [SimplePixelArt](https://simplepixelart.com/convert) | Web/vendor-reported local; current at snapshot | Square size presets 8–64; page also claims aspect preservation, so exact native semantics need output-file verification | 4–64 colors, median-cut claim, adjustments, palette editing, Clean Orphans | Source/license UNKNOWN | Approachable UX reference; implementation cannot be assumed reusable. |
| [Palettely](https://palettely.app/image-to-pixel-art) | Web/local conversion; freemium | Square 16/32/64 free, larger paid; fit/fill/stretch | Extract/remap, 8/16/32 colors, soft dither, editor; paid AI background cleanup | Proprietary/UNKNOWN | Structured exports are interesting; square-only and no alpha trim. |
| [PixelOver](https://pixelover.io/) | Desktop; active at snapshot; paid/demo | Exact canvas/object sizing, resampling, alignment; designed for animation and 2D/3D workflows | Palette indexation, dithering, adjustments, opacity threshold, short-edge cleanup | Closed EULA; [docs](https://docs.pixelover.io/manual/introduction/) | Mature deterministic-editor benchmark; behavior/UX reference only. |
| [PixaTool](https://kronbits.itch.io/pixatool) | Windows desktop; v1.58; last visible devlog 2021 | Pixelation factor up to 12 with separate X/Y; no arbitrary native target found | Palettes up to 192, Bayer/dither blends, adjustments, erosion/dilation, batch | Proprietary | Rich effects reference, not grid recovery or exact native sizing. |
| [Pixelator](https://ronenness.itch.io/pixelator) | Windows desktop; v1.0.8 | “Smart” conversion but exact algorithm/target semantics UNKNOWN | Automatic palettes attributed by author to PIL; color reduction can be disabled | Closed; personal/commercial terms restrict service use | License explicitly makes it unsuitable as Pixilate’s backend/code source. |
| [Scenario Pixelate](https://www.scenario.com/features/pixelate/) (formerly Pixelicious) | Hosted/account product | Square presets 16/32/64/128/256, not arbitrary W×H | Extract/custom palette, Remove Noise, Remove Background | Proprietary | Useful workflow reference; algorithm, determinism, and alpha semantics UNKNOWN. |
| [Lospec Pixel Art Scaler](https://lospec.com/pixel-art-scaler/) | Web/local | Up/downscaling with nearest, cleanEdge, hqx, xBR and scale warnings | Optional restriction to existing colors; no palette extraction | Scaler license/source UNKNOWN | Good only for already-clean pixel art; not an AI-art converter or grid detector. |
| [Online Tools House converter](https://onlinetoolshouse.com/image-to-pixel-art/) | Web; claims local/no AI | Pixel-size control, not confirmed exact W×H | Lospec/Pixilart palettes and multiple combinable dithers | UNKNOWN | Broad UX reference; no auditable implementation. |
| [Photo2PixelArt](https://photo2pixelart.com/) | Web; vendor claims local; live page unreachable in this audit on 2026-07-31 | Vendor-reported pixel-size control, not independently revalidated | Vendor-reported color count, Game Boy/PICO-8/NES palettes, and dither | UNKNOWN | Commodity converter; target, trim, and code provenance absent. |
| [MakePixelArt](https://makepixelart.app/) | Web; claims client-only | Pixel-size control | Retro/automatic palettes | UNKNOWN | Commodity converter. |
| [image-to-pixel-art.com](https://image-to-pixel-art.com/) | Web; claims client-only | Pixel-size/algorithm controls | Palette and dither controls | UNKNOWN | Commodity converter; no exact W×H or grid recovery established. |
| [PixelForge at ImageToPix](https://imagetopix.com/converter) | Web; claims local | Pixel block size, grid overlay | Palette, dither; PNG/SVG/PDF/JSON | UNKNOWN | Interesting export surface, but name collision and provenance require care. |
| [Pixel Art Village converter](https://pixelartvillage.org/) | Web; claims local | Pixel-size control | Custom palette, dithering, adjustments | UNKNOWN | Commodity converter. |
| [Img2Pixel](https://img2pixel.com/) | Web | Block-size style control | Palette and dither | UNKNOWN | Commodity converter. |

### Adjacent, generic, AI, and desktop workflows

| Product | What it actually contributes | Critical limitation for Pixilate | Source/license |
|---|---|---|---|
| [Aseprite](https://www.aseprite.org/docs/resize/) | Exact sprite W×H, indexed conversion, palettes, ordered dithering, CLI `--trim` and export automation | General editor; no automatic recovery of a distorted grid. CLI `--scale` is a factor, while exact size is primarily a UI/API workflow | Source-available under Aseprite EULA; not MIT code |
| [GIMP 3](https://docs.gimp.org/3.0/en_GB/gimp-image-scale.html) | Exact W×H, multiple interpolation modes, indexed palette conversion and several dithers | Operations are separate and require expert ordering; no lattice inference or pixel-art-specific cleanup contract | GPL |
| [Krita](https://docs.krita.org/en/reference_manual/main_menu/image_menu.html) | Exact image/canvas sizing, trim-to-layer/selection, palette and filter workflows | No first-class deterministic “recover and reduce” pipeline identified | GPL |
| [ImageMagick](https://imagemagick.org/script/command-line-options.php) | Scriptable exact geometry, filters, nearest `-sample`, `-colors`, `-remap`, dithering, `-trim` | Primitives, not a pixel-art decision system; ordinary `-trim` is corner-color based and can over-trim | Permissive [ImageMagick License](https://imagemagick.org/license/), compatible with differently licensed work with attribution |
| [Adobe Photoshop Mosaic](https://www.adobe.com/creativecloud/photography/discover/pixelate-image.html) | Mature manual resize/indexed-color ecosystem; Mosaic cell-size visual effect | Proprietary; Mosaic is a censorship/aesthetic effect, not native pixel-grid reconstruction | Proprietary |
| [Canva Pixelate](https://www.canva.com/features/pixelate-image/) | Easy creative pixelation and background-removal ecosystem | Hosted/account apps; effect scale rather than auditable exact-pixel pipeline | Proprietary |
| [PineTools Pixelate](https://pinetools.com/pixelate-effect-image) | Simple upload and block-size mosaic | No native target, palette budget, grid recovery, or disclosed algorithm | UNKNOWN |
| [LunaPic Pixelate](https://www2.lunapic.com/editor/?action=pixels) | Simple hosted pixelate effect | Hosted generic effect; algorithm and determinism UNKNOWN | Proprietary/UNKNOWN |
| [Rosebud PixelVibe](https://rosebud.ai/ai-game-assets) | AI asset generation/transformation and background removal | Generative and hosted; strict repeatability is not guaranteed or established, so it is outside the core processing constraint | Proprietary |
| [Retro Diffusion Aseprite extension](https://astropulse.itch.io/retrodiffusion) | Neural Pixelate/Resize plus non-neural helper scripts | Neural operations are hosted; strict repeatability is unverified and they are distinct from the MIT Standard fixer | Commercial extension |
| [Ditther](https://ditther.com/), [Ditter](https://ditterstudio.com/), [Ditho](https://loveforretro.itch.io/ditho), [Ditherdragon](https://winterveil.itch.io/ditherdragon) | Large menus of artistic dithering styles and animation-oriented effects | Dither aesthetics do not solve exact target sizing or grid alignment | Mixed proprietary/UNKNOWN |
| [Pixora](https://pixora.cloud/) | Browser pixelator and nearest-neighbor upscaler | Generic effect workflow; exact native target and source UNKNOWN | UNKNOWN |
| [Photo2Pixel](https://coding.tools/photo2pixel.html) | Local browser photo conversion | Algorithm, license, target semantics UNKNOWN | UNKNOWN |
| [image2pixel.online](https://image2pixel.online/en), [imagetopixel.org](https://imagetopixel.org/en) | Additional hosted/web converter variants | The review did not establish implementation details or strict replay; one describes server rendering for high-resolution files | UNKNOWN |

## Individual mini-spikes

### 1. Retro Diffusion Pixel Art Fixer Standard

Moved on 2026-10-19 to the dedicated [Retro Diffusion Pixel Art Fixer spike](../products/retro-diffusion-pixel-art-fixer.md), including the 2026-07-31 OBSERVED probes and the pixel-bench caveats.

### 2. Pixel It

**VERIFIED:** [Pixel It](https://giventofly.github.io/pixelit/) is a lightweight browser converter whose [source is MIT](https://github.com/giventofly/pixelit).

**CODE-DERIVED:** Its core pixelation draws a reduced intermediate and then enlarges back onto a source-sized canvas with image smoothing disabled. Palette conversion chooses the nearest entry by Euclidean RGB distance. Its resize helper accepts maximum width/height and preserves aspect; it is not an independent exact W×H contract. The default palette contains 16 colors.

**Consequence:** It is a reproducible baseline for “block pixelation + nearest palette,” but it does not exercise grid-phase recovery, alpha-visible-bounds target sizing, protected thin features, or orphan-pixel cleanup.

### 3. Tezumie Image-to-Pixel

**VERIFIED:** The [live editor](https://tezumie.github.io/Image-to-Pixel/) and [repository](https://github.com/Tezumie/Image-to-Pixel) expose a pixel-width parameter, original-resolution versus native-pixel download, custom palettes, Lospec palette slugs, and Floyd–Steinberg, Atkinson, Bayer, ordered, and clustered dithers. The standalone JavaScript library is MIT; the application is Apache-2.0.

**OBSERVED:** Width 16, no dither, and the PICO-8 palette processed the continuous fixture successfully. Height is derived from aspect ratio; independent W×H and alpha-visible-bounds Trim were not present.

**Takeaway:** This is a broad browser reference for palette/dither choices, but its library API is described by its author as still a work in progress. Pinning a reviewed revision is preferable to tracking `main` through a CDN.

### 4. GameTorch image_to_pixel_art_wasm

**VERIFIED:** The [MIT Rust/WASM repository](https://github.com/gametorch/image_to_pixel_art_wasm) provides browser and CLI paths. It preserves fully transparent pixels, accepts a fixed palette or extracts one, and sizes the longest side to a requested value while deriving the other dimension.

**CODE-DERIVED:** Current code gathers nontransparent pixels in Lab, calls k-means with a fixed seed argument of `0`, remaps pixels, downsamples using a histogram-based cell strategy, and optionally nearest-neighbor upscales. Supplying a custom palette uses nearest Euclidean RGB mapping. The README summarizes the downsample as nearest-neighbor, but the active call in source is the histogram routine; this documentation/code mismatch should be resolved before adopting behavior as a contract. A fixed seed strongly supports repeatability within a build, but bit-for-bit cross-platform determinism remains **UNKNOWN** because floating-point, dependency, encoder, and runtime behavior were not tested across targets.

**OBSERVED:** The public app timed out in the research browser, so no output benchmark was captured.

**Takeaway:** A useful Rust/WASM foundation and test oracle, especially for histogram-based feature preservation. It still lacks exact independent dimensions, grid inference, trim semantics, dither choices, and artifact cleanup.

### 5. SimplePixelArt

**VERIFIED:** [SimplePixelArt](https://simplepixelart.com/convert) presents target size presets, 4–64 colors, palette editing, brightness/contrast/saturation, PNG/SVG/JSON exports, an editor handoff, and a `Clean Orphans` option described as replacing isolated dots using neighboring colors. It says processing is local and identifies median-cut quantization.

**OBSERVED:** Selecting size 16 and four colors produced four editable palette swatches.

**UNKNOWN:** The source and license were not located. The relationship between square labels such as 16×16 and the site’s claim of aspect preservation needs exported-file inspection.

**Takeaway:** `Clean Orphans` is a compelling, understandable advanced option. Pixilate should go further by defining connectivity, neighborhood, maximum component size, edge protection, before/after counts, and whether cleanup can introduce or only reuse palette colors.

### 6. Palettely

**VERIFIED:** [Palettely](https://palettely.app/image-to-pixel-art) turns an image into a square palette-indexed grid. Free conversion covers 16, 32, and 64; larger sizes and batch features use credits. It offers extracted or known palettes, 8/16/32 colors, soft dithering, Fit/Fill/Stretch, an editor, and PNG/SVG/JSON/CSS/Tailwind outputs. AI background cleanup is a separate paid feature.

**OBSERVED:** The transparent-border fixture was accepted at 16×16/eight colors, but there was no opaque-bound Trim switch. Fit whole necessarily lets transparent margins shrink the visible subject relative to the requested grid.

**Takeaway:** Structured palette-index exports and a post-conversion editor are valuable. Square-only output, commercial credits, AI cleanup, and undisclosed algorithms are mismatched with the core requirements.

### 7. PixelOver

**VERIFIED:** [PixelOver](https://pixelover.io/) is an actively developed desktop application; official pages showed v0.18.4 in this research pass. Its [manual](https://docs.pixelover.io/manual/introduction/) documents deterministic/non-AI processing, exact canvas/object sizing, image and pixel resampling, palette indexation, dithering, opacity threshold, alignment, animation, and 2D/3D inputs. Export includes PNG/GIF/spritesheet/Aseprite workflows. The demo disables export.

**VERIFIED:** Its closed EULA does not make its implementation a source for an MIT project.

**Takeaway:** Treat it as a mature deterministic-editor UX benchmark. Useful references include an explicit opacity threshold, resampling choices, saved project settings, animation consistency, and separation of canvas size from object transform. No documented automatic alpha-visible-bounds target contract or distorted-grid inference was found.

### 8. PixaTool

**VERIFIED:** [PixaTool](https://kronbits.itch.io/pixatool) is a proprietary Windows desktop effects tool. The page lists v1.58, high-resolution input, palettes up to 192 entries, separate X/Y pixelation controls, Bayer matrices/dither blends, color adjustments, erosion/dilation, batch conversion, and presets. Its visible development history is much older than PixelOver’s.

**Takeaway:** It demonstrates how deep advanced controls can be packaged as presets. Its controls are primarily effect-scale based, not exact native W×H, and it does not disclose a grid recovery algorithm.

### 9. Pixelator by Ronen Ness

**VERIFIED:** [Pixelator](https://ronenness.itch.io/pixelator) is a Windows desktop “smart conversion” tool. Author comments attribute automatic palette generation to PIL and state that its own pixel algorithms are not machine learning. Personal use is noncommercial; commercial use requires a paid tier, and terms prohibit offering Pixelator itself as an online service/backend.

**Takeaway:** Even if its output were attractive, the product’s closed source and service restrictions rule out incorporation. Its undocumented “smart” behavior is not a specification.

### 10. Pixelicious → Scenario Pixelate

**OBSERVED:** `pixelicious.xyz` now redirects to [Scenario Pixelate](https://www.scenario.com/features/pixelate/); comparisons that describe Pixelicious as an independent current tool are stale.

**VERIFIED:** Scenario advertises square grid presets from 16 through 256, extracted/custom palettes, Remove Noise, Remove Background, and reusable settings. It is a hosted commercial creative platform.

**UNKNOWN:** Exact algorithms, repeatability, whether background removal is generative, and alpha/trim semantics.

**Takeaway:** Noise cleanup and reusable recipes are competitive expectations, but “customizable resolution” should not be copied as wording when only square presets exist.

### 11. Lospec Pixel Art Scaler

**VERIFIED:** The [Lospec scaler](https://lospec.com/pixel-art-scaler/) runs client-side and supports nearest neighbor plus edge-aware upscalers such as cleanEdge, hqx, and xBR. It warns about non-pixel-perfect scale relationships and can restrict output to original colors.

**Takeaway:** These algorithms answer “how should already-clean pixel art be displayed larger or smaller?” They do not answer “what was the intended grid?” or “how should a continuous AI illustration become a 32×32 asset?” Keep clean-grid scaling as a separate mode. The scaler’s own source/license was **UNKNOWN**; do not infer it from the separate GPL Lospec Pixel Editor.

### 12. Aseprite

**VERIFIED:** [Resize Sprite](https://www.aseprite.org/docs/resize/) supports explicit width/height. The [CLI](https://www.aseprite.org/docs/cli/) supports palette changes, RGB-to-indexed conversion, none/ordered/old dithering, Bayer 2/4/8 matrices, `--trim`, `--trim-by-grid`, and explicit crop; its `--scale` operation is factor-based. The [pixel-format API](https://www.aseprite.org/api/command/ChangePixelFormat) exposes quantization and color-fit options.

**Takeaway:** Aseprite demonstrates that exact sizing, trimming, palette conversion, and deterministic scripting can coexist. It still requires the user to choose the operations and does not automatically reconstruct an inconsistent AI-emulated grid. Its source-available EULA is not a permissive implementation reuse grant.

### 13. ImageMagick

**VERIFIED:** [ImageMagick options](https://imagemagick.org/script/command-line-options.php) cover exact geometry, rich filters, `-sample`/point selection, color reduction, remapping, posterization, error-diffusion/ordered dithering, and trim. Its [resize guide](https://usage.imagemagick.org/resize/) explicitly explains that nearest sampling can skip rows/columns and that gamma/color-space choices change downscale results.

**VERIFIED:** `-trim` is based on corner/background similarity (with optional fuzz), not inherently “alpha bounding box.” Its own [crop guide](https://usage.imagemagick.org/crop/) warns that automatic trim can remove more than expected. Pixilate’s checkbox should instead compute a clear alpha-threshold bounding box, record the rectangle, and make background-color trimming a different operation.

**VERIFIED:** The [ImageMagick License](https://imagemagick.org/license/) permits use, linking, merging into differently licensed work, and commercial redistribution with license/attribution obligations. Call it the ImageMagick License, not Apache-2.0.

**Takeaway:** Useful reference and possible backend/test oracle. Browser deployment would still require an appropriate WASM build or reimplementation, and a general-purpose CLI does not supply Pixilate’s mode selection or quality policy.

### 14. GIMP and Krita

**VERIFIED:** [GIMP Scale Image](https://docs.gimp.org/3.0/en_GB/gimp-image-scale.html) supports exact dimensions, aspect linking/unlinking, and selectable interpolation. [Indexed conversion](https://docs.gimp.org/3.0/en/gimp-image-convert-indexed.html) supports an optimized maximum-color palette, custom palettes, and multiple dithering modes. [Crop to Content](https://docs.gimp.org/3.0/en/gimp-image-crop.html) is a general border/content crop, not the same contract as alpha-only bounds.

**VERIFIED:** [Krita’s image menu](https://docs.krita.org/en/reference_manual/main_menu/image_menu.html) separates scale, canvas resize, and trim-to-layer/selection operations.

**Takeaway:** Mature editors expose the necessary primitives but not a single safe automatic route. Their GPL code should not be copied into an MIT browser application; interoperability or independent implementation requires separate legal/technical review.

### 15. Generic local web converters

Online Tools House, Photo2PixelArt, MakePixelArt, image-to-pixel-art.com, PixelForge/ImageToPix, Pixel Art Village, Img2Pixel, Photo2Pixel, and Pixora occupy a crowded commodity layer. Their common control surface is block/pixel size + color count/preset palette + optional dithering + PNG download. Several claim client-only processing.

**UNKNOWN:** Most do not publish source, licenses, exact dimension semantics, palette color space, alpha policy, stable versioning, or deterministic test vectors.

**Takeaway:** Pixilate cannot differentiate on “upload, choose pixel size, choose colors.” It can differentiate on an exact output contract, grid-aware modes, transparency semantics, explainable cleanup, recipe export, regression fixtures, and open algorithms.

### 16. Generic hosted mosaic filters

[PineTools](https://pinetools.com/pixelate-effect-image), [LunaPic](https://www2.lunapic.com/editor/?action=pixels), [Canva](https://www.canva.com/features/pixelate-image/), and [Adobe’s Mosaic guidance](https://www.adobe.com/creativecloud/photography/discover/pixelate-image.html) treat pixelation primarily as a visual effect or privacy blur. Their main parameter is cell/block size.

**Takeaway:** A block mosaic can retain a high-resolution canvas, arbitrary intermediate colors, wrong phase, and no native palette-index representation. It should not be accepted as a pixel-art conversion baseline.

### 17. AI converters and neural repair

[Rosebud PixelVibe](https://rosebud.ai/ai-game-assets), Scenario’s AI ecosystem, and [Retro Diffusion’s neural extension](https://astropulse.itch.io/retrodiffusion) may produce appealing assets, but generative transformation can change identity, silhouette, texture, and details. Repeatability may depend on model version, seed support, server state, and hidden preprocessing.

**Takeaway:** They are outside Pixilate’s deterministic processing core. Pixilate may accept their images as inputs, but should never require a model, account, or remote service to resize/quantize them.

### 18. Derivatives and provenance traps

[Roberin’s pixel-art tool](https://roberin.com/en/pixel-art-tool/) states that it reimplements the SpriteFusion Pixel Snapper approach; [uWarp’s Image Pixelator](https://www.uwarp.design/image-to-pixel-art) identifies Pixel It as its basis. These are useful evidence that permissive projects spread, but they do not constitute distinct algorithm families.

**Takeaway:** Inventory derivatives without double-counting them as independent validation. Preserve attribution and license notices, pin upstream revisions, and maintain a software-bill-of-materials entry for any incorporated code.

## Product gaps Pixilate should explicitly own

| Gap | Market pattern | Pixilate requirement implication |
|---|---|---|
| Exact target ambiguity | “Resolution” often means block size, longest side, square preset, or source-sized mosaic | Define output native `width × height`. If one field is auto, show the derived integer before processing. Never label block size as output resolution. |
| Trim ambiguity | Fit usually includes transparent margins; generic trim often means corner-color similarity | `Trim off`: target applies to full decoded canvas. `Trim on`: compute alpha-threshold bounds first, then target applies to that rectangle. Preserve or explicitly discard offsets. |
| One algorithm for incompatible inputs | Most tools run one pipeline regardless of clean grid, distorted grid, or continuous art | Provide explicit modes: Clean Pixel Art, Recover Grid/Mixels, Raster Illustration, and optionally Auto with confidence and alternatives. |
| Grid inference overconfidence | Detectors can be off by one or report a lattice on continuous art | Show inferred cell size, phase, confidence, competing candidates, and preview. User target takes precedence. |
| Palette coupled to resize | Many tools entangle scale and quantization | Separate Resize/Pixelate and Palette/Quantize tabs, while allowing an optional composed recipe with visible stage order. |
| Alpha underspecified | Products say “transparency preserved” without threshold/aggregation rules | Define alpha mode, threshold, premultiplication, cell voting, transparent RGB canonicalization, and edge behavior. |
| Orphan/noise cleanup as a magic toggle | “Remove Noise” or “Clean Orphans” rarely defines what changes | Use deterministic component/morphology rules with thresholds, edge protection, a difference overlay, and a changed-pixel count. |
| No reproducibility artifact | Hosted tools may change behavior silently | Export/import a versioned JSON recipe containing algorithm IDs, parameters, palette, color space, alpha policy, source hash, and engine version. |
| No objective diagnostics | Users guess from a preview | Report output dimensions, alpha-visible bounds under the serialized Trim threshold (default `alpha > 0`), unique color count, alpha levels, detected grid statistics, changed-pixel count, and warnings. |
| Weak open-source provenance | Many attractive converters disclose no code/license | Build from owned code and explicitly compatible dependencies; include notices and an SBOM. |
| Background removal conflated with pixelation | Hosted products use AI removal as an upsell | Keep background removal separate. Deterministic options should include exact-color/fuzz, flood-fill from edges, chroma key, and alpha-mask tools; semantic removal cannot honestly promise universal deterministic success. |

## Licensing and MIT compatibility

This is engineering research, not legal advice. Pixilate-owned code may be MIT while bundled third-party components retain different licenses. “Plausible” below means the current research found a potential compliant distribution path if the exact dependency closure, notices, source obligations, and relinking requirements are satisfied; counsel or a maintainer review should confirm release decisions.

| Candidate | License evidence | MIT project posture |
|---|---|---|
| Retro Diffusion Pixel Art Fixer Standard | MIT at pinned audited revision | See the [dedicated spike](../products/retro-diffusion-pixel-art-fixer.md#licensing-and-reuse). |
| SpriteFusion Pixel Snapper | Repository MIT; see dedicated spike | Candidate with exact-revision notice, provenance, and dependency review. |
| Pixel It | Repository MIT | Suitable baseline with notice. |
| GameTorch image_to_pixel_art_wasm | Repository MIT | Suitable with notice; audit Rust crate licenses and deterministic behavior. |
| Tezumie Image-to-Pixel | Library MIT; app Apache-2.0 | Library is simplest to reuse. Apache app code can coexist with an MIT project if its Apache notices/terms are retained; do not relabel Apache files as MIT. |
| ImageMagick | ImageMagick License | Permissive and explicitly allows linking/merging with differently licensed work, subject to attribution/license obligations. Maintain a notices entry. |
| PixelOver, PixaTool, Pixelator, Scenario, Palettely | Closed/proprietary or undisclosed | UX/behavior reference only. Do not copy code/assets. Pixelator also restricts service use. |
| Aseprite | Source-available EULA | Interoperate with a user-installed copy only after reviewing terms; do not incorporate source into MIT. |
| GIMP/Krita | GPL | Not approved for the planned production bundle unless the project deliberately accepts and satisfies GPL obligations. Independent process/CLI interoperability is a separate architecture/legal question. |
| Lospec scaler and most small web converters | UNKNOWN | Treat as unavailable for reuse until a license is located and authorship/provenance verified. Public JavaScript is still copyrighted. |

## Recommended competitive benchmark suite

Before implementation choices are locked, capture outputs from open tools and any legally accessible commercial demos using a versioned fixture corpus. At minimum include:

1. clean pixel art enlarged by integer nearest-neighbor;
2. clean pixel art enlarged by noninteger nearest-neighbor;
3. bilinear, bicubic, and Lanczos distortions at independent X/Y scales and fractional offsets;
4. JPEG/WebP compression, blur, ringing, chromatic noise, and mixed pipelines;
5. deliberate mixels: two pixel scales in one image;
6. one-pixel lines, diagonals, checkerboards, outlines, holes, and isolated intentional highlights;
7. anti-aliased vector/AI illustration at portrait, landscape, and square aspects;
8. photo-like material with texture and gradients;
9. transparent sprites with zero-alpha RGB garbage, soft alpha, shadows, and large margins;
10. palette edge cases: fewer colors than requested, duplicate palette entries, equal-distance ties, grayscale, and alpha-only variation.

For each recipe, record:

- native output and opaque-bound dimensions;
- deterministic hash across repeated runs, browser engines, worker counts, and CPU architectures;
- unique RGB/RGBA/palette-index counts;
- grid-size and phase error where ground truth exists;
- per-pixel exact accuracy and perceptual error against reference;
- silhouette IoU and connected-component changes;
- thin-feature recall, orphan additions/removals, and topology changes;
- runtime and peak memory;
- complete versioned recipe and engine/dependency versions.

The first benchmark should include Retro Fixer Standard, SpriteFusion, Unfake.js, Pixel It, Tezumie, GameTorch, ImageMagick recipes, and a simple area/box/Lanczos/nearest baseline. PixelOver, PixaTool, and proprietary web tools can be included only when their demo/terms permit output capture.

## Research-backed planning implications

1. **Do not promise “works perfectly for every image.”** No deterministic reduction can preserve every semantic detail at arbitrary targets, and no grid detector can infer a nonexistent or ambiguous lattice. Promise explicit contracts, explainable modes, reproducibility, and a strong default backed by tests.
2. **Make exact target dimensions the invariant.** Every processing route must end at the requested native W×H; preview zoom is display-only and nearest-neighbor.
3. **Treat Trim as coordinate semantics, not an aesthetic crop.** Alpha-bound sizing should be computed before resize, with the source rectangle and offsets shown. Background-color removal belongs to a separate feature.
4. **Route by input class.** Clean grid art should avoid unnecessary quantization; distorted grid art should estimate/reconstruct its lattice; continuous art should use area/coverage-aware downsampling plus palette policy. Auto may recommend a route but must expose confidence.
5. **Keep stages orthogonal.** Decode/color-manage → establish bounds → choose geometry/grid strategy → resample/reconstruct → quantize/remap → optional dither → optional deterministic cleanup → canonical encode.
6. **Give the default pipeline a documented version.** “Best” should mean a tested preset such as `default-v1`, not mutable hidden heuristics. Changing it requires benchmark evidence and a new recipe version.
7. **Offer an artifact difference view.** Grid overlay, palette histogram, alpha bounds, changed pixels, and alternate candidates will outperform unexplained “smart” toggles for expert trust.
8. **Use open tools as test oracles, not unquestioned dependencies.** Reimplement only when justified, retain notices when incorporating code, and test all transitive libraries for licensing and deterministic behavior.

## Open questions remaining after this spike

- Can Retro Fixer’s detector be cleanly separated from its reconstruction stage and constrained by a user-requested W×H candidate?
- Does GameTorch produce byte-identical normalized PNG pixels across native Rust and WASM/browser targets with its fixed seed?
- What exact native files do SimplePixelArt and Palettely export for nonsquare transparent input?
- What is Unfake.js’s precise license and dependency posture? See its dedicated spike.
- Which palette extraction family performs best for 16–32 colors across sprite-like versus continuous inputs: median cut, octree, Wu, deterministic k-means/k-means++, neuquant, libimagequant, or a hybrid?
- Which cleanup metrics distinguish accidental orphan pixels from intentional highlights and texture without destructive heuristics?
- How should partial alpha participate in palette budgets and cell aggregation?
- What browser limits are acceptable for megapixel inputs, and when should work move to Web Workers/WASM?

## Primary source index

All links were checked or discovered during the 2026-07-31 research pass.

- Retro Diffusion: [Standard tool](https://www.retrodiffusion.ai/tools/pixel-art-fixer/), [source](https://github.com/Retro-Diffusion/pixel-art-fixer), [benchmark](https://github.com/Retro-Diffusion/pixel-bench), [commercial/neural extension](https://astropulse.itch.io/retrodiffusion)
- Pixel It: [app](https://giventofly.github.io/pixelit/), [source](https://github.com/giventofly/pixelit)
- Tezumie: [app](https://tezumie.github.io/Image-to-Pixel/), [source and licenses](https://github.com/Tezumie/Image-to-Pixel)
- GameTorch: [app](https://gametorch.app/image-to-pixel-art), [source](https://github.com/gametorch/image_to_pixel_art_wasm)
- Commercial/browser tools: [SimplePixelArt](https://simplepixelart.com/convert), [Palettely](https://palettely.app/image-to-pixel-art), [PixelOver](https://pixelover.io/), [PixelOver manual](https://docs.pixelover.io/manual/introduction/), [PixaTool](https://kronbits.itch.io/pixatool), [Pixelator](https://ronenness.itch.io/pixelator), [Scenario Pixelate](https://www.scenario.com/features/pixelate/), [Lospec scaler](https://lospec.com/pixel-art-scaler/)
- Editor/tool primitives: [Aseprite resize](https://www.aseprite.org/docs/resize/), [Aseprite CLI](https://www.aseprite.org/docs/cli/), [Aseprite pixel format API](https://www.aseprite.org/api/command/ChangePixelFormat), [GIMP scale](https://docs.gimp.org/3.0/en_GB/gimp-image-scale.html), [GIMP indexed conversion](https://docs.gimp.org/3.0/en/gimp-image-convert-indexed.html), [Krita image menu](https://docs.krita.org/en/reference_manual/main_menu/image_menu.html), [ImageMagick options](https://imagemagick.org/script/command-line-options.php), [ImageMagick resize guide](https://usage.imagemagick.org/resize/), [ImageMagick license](https://imagemagick.org/license/)
- Additional web tools: [Online Tools House](https://onlinetoolshouse.com/image-to-pixel-art/), [Photo2PixelArt](https://photo2pixelart.com/), [MakePixelArt](https://makepixelart.app/), [image-to-pixel-art.com](https://image-to-pixel-art.com/), [ImageToPix](https://imagetopix.com/converter), [Pixel Art Village](https://pixelartvillage.org/), [Img2Pixel](https://img2pixel.com/), [Photo2Pixel](https://coding.tools/photo2pixel.html), [Pixora](https://pixora.cloud/)
- Generic/AI references: [PineTools](https://pinetools.com/pixelate-effect-image), [LunaPic](https://www2.lunapic.com/editor/?action=pixels), [Canva](https://www.canva.com/features/pixelate-image/), [Adobe](https://www.adobe.com/creativecloud/photography/discover/pixelate-image.html), [Rosebud](https://rosebud.ai/ai-game-assets)

## Addendum — 2026-10-19 inventory additions

**Snapshot:** 2026-10-19. These rows come from a superseded 2026-10-18 ecosystem draft that was not part of this canonical set, merged here and re-labelled. Only cells marked **re-checked 2026-10-19** were re-read in public sources for this addendum. Every other cell is an unverified surface signal (**UNKNOWN** until checked) and must not be cited as a product fact. The July coverage boundary still applies, and these additions show that it missed some current web converters.

### Additional web converters and editors

| Product | What it contributes | Source/license signal | Fit for Pixilate |
|---|---|---|---|
| [pixel-refiner.app](https://pixel-refiner.app) | Client-side grid recovery with input-class routes (refine, convert, preserve), background tools, and palettes | Repository MIT (re-checked 2026-10-19); see the [open-source addendum](open-source-ecosystem.md#addendum--2026-10-19-inventory-additions) | Strong study and benchmark candidate |
| [mono-pix.com](https://mono-pix.com) | "Snap" grid recovery, reportedly built on the `fast-pixelizer` engine (not re-checked) | Engine package MIT (re-checked 2026-10-19); app repository licence UNKNOWN | Benchmark baseline |
| [perfectPixel web demo](https://theamusing.github.io/perfectPixel_webdemo/) | Browser demo of the FFT grid method | No licence file (see [perfectPixel](open-source-ecosystem.md#16-perfectpixel-the-most-relevant-newly-found-grid-recovery-reference)) | Ideas and benchmark only |
| [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html) | Browser port of the Retro Diffusion fixer with exact output size up to 1024 px | Credits MIT (re-checked 2026-10-19); see the [Retro Diffusion spike](../products/retro-diffusion-pixel-art-fixer.md#derivative-pixel-rehab) | Derivative; benchmark, not independent validation |
| PixelMe (iOS) | AI photo-to-pixel subscription app | Proprietary; hosted AI | Out of scope (generative, hosted) |
| Pic2Dot, Wayline, DigitalCoding, Jukeboxprint, insMind converters | Commodity downscale plus palette | UNKNOWN | Same commodity layer as §15 |
| [Pixel Composer](https://github.com/Ttanasart-pt/Pixel-Composer) | Node-based VFX editor with posterize and palette nodes | Code licence UNKNOWN (not re-checked); binary sold separately | Not an AI-grid tool; UX reference only |

### Cleanup tools

| Product | Stated function | Signal | Disposition |
|---|---|---|---|
| Adopt Pixels (Astropulse, Aseprite extension) | Replaces orphans with the most common surrounding colour, with a user-set threshold and iteration count | Commercial; vendor-described, not re-checked | Orphan-rule UX reference |
| ClusterSweep | Offline despeckle that merges isolated 1×1 pixels | UNKNOWN | Inventory only |
| Orphan Pixel Corrector (itch.io) | Orphan cleanup | UNKNOWN | Inventory only |
| AB16 (Aseprite extension) | Up/downscale; method UNKNOWN | UNKNOWN | Inventory only |

### Conflicts resolved

- **Pixelicious (re-checked 2026-10-19):** `pixelicious.xyz` still returns a 301 redirect to [Scenario Pixelate](https://www.scenario.com/features/pixelate/). The [itch.io listing](https://hugo-dz.itch.io/image-to-pixel-art-converter) "Online image to Pixel Art converter" by Hugo-Dz (the SpriteFusion author) links to that domain. Both names therefore point to one domain lineage, not two current products. The commercial relationship between the listing and Scenario is **UNKNOWN**. §10 stands.
- **Lospec Pixel Art Scaler:** source and licence remain **UNKNOWN**. Failing to locate a source does not establish that it is closed.
- **PixaTool, PixelOver, GIMP:** the July rows stand. Prices are not recorded (no decision value), and GIMP is cited from the 3.0 documentation.

## 2026-10-20 refresh

**Snapshot:** 2026-10-20. Public pages read through a web-fetch tool. Nothing was uploaded, and no account was used.

### Generator changes that affect pseudo-pixel inputs

| Generator | Change | Label | Bearing on Pixilate |
|---|---|---|---|
| OpenAI `gpt-image-2.5-flare` / `-sunburst` (snapshots 2026-09-08) | The [image generation guide](https://developers.openai.com/api/docs/guides/image-generation) documents `background: "transparent"` with PNG or WebP for both models, without a preview label. Custom `WIDTHxHEIGHT`: multiples of 16, aspect 1:3 to 3:1, edge ≤ 3840, 655,360–8,294,400 px; above 2560×1440 is "experimental". The edit reference marks `gpt-image-2` transparency as preview, and a [community thread](https://community.openai.com/t/is-transparent-background-support-broken-in-gpt-image-2/1402707) reports rejections. | VERIFIED (vendor docs, 2026-10-20); behaviour of real alpha edges UNKNOWN | (a) The "never truly transparent" observation ([artifact characterization](../evaluation/ai-artifact-characterization.md) finding 4) no longer holds for API output. A stratum with real, probably soft, model alpha is needed beside the painted-checkerboard stratum (D20), along with a test of the `Binary(128)` alpha policy on it (INFERRED). (b) Free sizes on a 16-px step make the OpenAI rows of the provenance dimension table near-meaningless. (c) With multiple-of-16 canvases, the 16×16 JPEG/WebP chroma blocks align with the canvas origin (arithmetic). The ChatGPT samples (1672×941, 1254×1254) are not multiples of 16, so the ChatGPT surface does not follow the API size rule (INFERRED). |
| Google Nano Banana family | The [Gemini API guide](https://ai.google.dev/gemini-api/docs/image-generation) lists `gemini-2.5-flash-image`, `gemini-3.1-flash-image` (Nano Banana 2), `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` and `gemini-nano-banana-2.1`. Gemini 3.1 Flash Image adds a 512 px (about 0.25 MP) tier; Flash Lite is 1K only. There is no transparency parameter, and every output carries SynthID. A [forum thread](https://discuss.ai.google.dev/t/imagesize-512px-not-applied-in-gemini-3-1-flash-image-preview-always-returns-1k-resolution/127332) reports that "512" works and "512px" is ignored. | VERIFIED (vendor docs); per-ratio pixel tables not read | The 512 tier yields smaller canvases and fewer pixels per art cell, which the period floor (2.1 px) still covers (INFERRED). Painted checkerboards remain the Gemini transparency failure mode. |
| xAI `grok-imagine-image-2.0` | [xAI docs](https://docs.x.ai/developers/model-capabilities/images/generation): `1k` (default) and `2k`, 15 aspect ratios plus `auto`; no transparency, watermark or C2PA statement. | VERIFIED (vendor docs) | No Grok sample has been measured; there are no exact pixel sizes for the dimension table. |
| Midjourney V8.x | Per the vendor docs index: HD output 2048×2048 (SD 1024×1024), with HD sizes such as 2464×1856, 1792×2688 and 2912×1632. These sizes are already in `detect.js`. | UNKNOWN (docs returned HTTP 403 to fetch; search-index text only) | No change. |

### Web converters

| Product | Finding | Label | Disposition |
|---|---|---|---|
| [Pixelmade Pixel Art Converter](https://www.pixelmade.ai/tools/pixel-art-converter) | "Recover hidden grid" mode votes one colour per cell, is described as "deterministic computer vision", and falls back to a photo mode. Output size comes from the detected lattice (no W×H). Photo mode offers 8–256 columns and a DMC floss palette. The page implies upload or server processing but does not say so; updated 2026-09-01. | VERIFIED vendor page; processing location UNKNOWN | Commodity layer; benchmark only if captured under methodology §12 |
| [SpriteCook Pixel Grid Detector](https://www.spritecook.ai/pixel-grid-detector) | Detects "true resolution" and offers a colour cap. Method, processing location and licence are not stated. | VERIFIED vendor page | Inventory |

No new release of Retro Diffusion's fixer, Pixel Snapper or PixelLab's Unzoom was found (see the [open-source refresh](open-source-ecosystem.md#2026-10-20-refresh) for the repository checks). Aseprite 1.3.17–1.3.18 and the Pixelorama 1.2 betas add no pixel-art downscale or grid-recovery feature (VERIFIED from release-note summaries, not re-read in full).

## 2026-10-21 addendum: Retro Diffusion

**Snapshot:** 2026-10-21. Details are in the [Retro Diffusion spike's 2026-10-21 refresh](../products/retro-diffusion-pixel-art-fixer.md#2026-10-21-refresh).

- There is still no new fixer release; HEAD remains `ef376e57` (VERIFIED, GitHub API).
- Newly inventoried surface: the hosted [retro-diffusion-mcp](https://github.com/Retro-Diffusion/retro-diffusion-mcp) server (MIT docs at `12e66b87`). It documents a free `fix_pixel_art` tool with a standard or neural engine; width and height apply to the neural engine only, and input is limited to 4 MP. The fixer API does not spend account balance (VERIFIED vendor-reported).
- The open engine's writeup leaves an output palette clamp "as future work". The palette and dither controls in the [competitor matrix](../SYNTHESIS.md) therefore describe the 2026-07-31 web UI, not the MIT repository (VERIFIED writeup; current web UI UNKNOWN).
- [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html) now lists manual columns and rows with "Reset to detected", a confidence readout, a low-confidence flag when the detectors disagree, palette reduction and ordered dither (VERIFIED vendor page; dates UNKNOWN).
