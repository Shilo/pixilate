# AI Pseudo-Pixel-Art Artifact Characterization

Last reviewed: 2026-10-19. Moved from `prototype-v1/` and aligned with the [benchmark methodology](benchmark-methodology.md) on 2026-10-19; where they differ, the methodology wins.

Purpose: describe how general-purpose image generators (GPT Image / ChatGPT, Gemini / Nano Banana, Midjourney, Stable Diffusion / SDXL / Flux LoRAs, and others) fake pixel art, so the converter (currently the owner-requested research prototype in `prototype/`) can be designed and tested against real failure modes. The document has four parts: an evidence-labelled artifact taxonomy, measured where local samples exist; a deterministic, seeded degradation model that turns true low-resolution sprites into realistic pseudo-pixel HD images with exact ground truth; an inventory of true pixel art and genuine AI pseudo-pixel images available locally (gitignored) for this review; and a sourcing plan for public real-world samples, to be downloaded only after approval. It extends the earlier PixelLab Pip [grid-recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md), which separated Case A (a recoverable grid) from Case B (an illustration with no consistent grid). The [quality metrics](pixel-art-quality-metrics.md) score converters against the degradation model here.

**Notice.** Product, company, and model names may be trademarks of their respective owners. Pixilate is independent and is not affiliated with, endorsed by, or sponsored by any generator vendor or tool named here. Licence notes are engineering triage, not legal advice.

Evidence labels used throughout:

- **[observed-in-source]**: read directly from a source file, README, model card, issue, or embedded metadata.
- **[local-measured]**: measured by this review with NumPy/PIL on a local, gitignored image (scratch scripts, not committed).
- **[community-observed]**: reported by users, tool authors, or vendors in issues, forums, or blogs. Vendor blogs are marked *vendor* because they have a commercial interest.
- **[inferred]**: this review's interpretation of the evidence.
- **[unverified]**: plausible but not confirmed by any source this review could check.

Label mapping to the [shared vocabulary](../README.md#how-to-read-the-evidence): [observed-in-source] → VERIFIED (or CODE-DERIVED for a pinned code revision); [local-measured] → OBSERVED on local fixtures named by opaque ID, which are local-only and not rights-cleared, so no number here is public benchmark evidence; [community-observed] → a third-party claim, INFERRED at most; [inferred] → INFERRED; [unverified] → UNKNOWN. Metadata read from the gitignored local samples (C2PA manifests, dimensions) is [local-measured], not [observed-in-source].

## Key Findings

1. **Every measured AI sample uses a non-integer block size, and the size varies locally.** Five genuine local samples (two ChatGPT gpt-image 2.0, one Google Gemini, two of unknown origin) measured 5.2 to 15.6 px per apparent pixel. Within one image the block size varies by ±0.7 % to ±8 % between windows, x and y differ by up to 8 %, and the grid phase wanders by 0.2 to 2 cells across the canvas. [local-measured]
2. **Edge energy is smeared by about a quarter of a cell.** For each measured sample, the RMS distance between edge energy and the best-fit uniform lattice was 0.21–0.27 of a cell. A clean nearest-neighbour upscale gives about 0.05. The seeded prototype of the degradation model in §2 reproduces 0.25–0.28 with the `gpt-image-like` and `gemini-like` presets. [local-measured]
3. **The colour count explodes.** The samples contain 25,000–293,000 unique colours, which collapse to 216–1,238 after 4-bit-per-channel rounding. Cells that should share one colour differ by a standard deviation of about 1.5–3 levels, and some cells carry gradients of up to about 24 luma levels across a single cell. [local-measured]
4. **Backgrounds are near-flat, not flat, and never truly transparent.** All local AI samples are opaque, including the Gemini file saved as RGBA, where alpha is 255 everywhere. White backgrounds sit at 247–255 with a standard deviation of 0.6–1.0. Users report ChatGPT drawing the transparency checkerboard into the RGB pixels. [local-measured], [community-observed]
5. **Platform resizing adds its own layer.** The Gemini sample's C2PA manifest says "Resized by Google Generative AI" (2048×2048 output, about 7 px blocks at 1024 scale). Both ChatGPT samples use a fixed pixel budget of about 1.573 MP, matching 1536×1024, at non-standard dimensions (1672×941 and 1254×1254). [local-measured], [inferred]
6. **The requested resolution is not the drawn resolution.** One vendor measurement found a "32×32" GPT Image 2 request drawn at roughly 70 logical pixels across, with blocks of 26–32 px. Other reports say Nano Banana honours "32x32" or "64x64" only sometimes. The converter must treat the target size as a user decision, separate from the detected grid. [community-observed, vendor]
7. **A periodicity test separates gridded art from illustrations.** The normalized DFT strength of the edge profile at the best period was 0.21–0.54 on gridded AI samples and 0.08–0.13 on a non-pixel illustration (the Case B negative control). [local-measured]

## 1. Artifact Taxonomy

### 1.1 Measured Local Real Samples [local-measured]

The local gitignored folders contain five genuine AI pseudo-pixel images and one non-pixel AI illustration, referenced here only by opaque ID. Provenance comes from embedded C2PA manifests (`caBX` PNG chunks), which name the signer and the software agent. Inventory details are in §3.4.

Measurement method (scratch analysis, not committed):

- **Edge profile:** sum of absolute RGB differences between adjacent pixels, summed per column (x) and per row (y).
- **Block size:** the period P in the range 2.5–48 px (step 0.005) that maximizes the edge profile's DFT magnitude, normalized by the profile's total absolute deviation (the "strength").
- **Lattice phase:** taken from the DFT angle at P.
- **Local block size:** the same estimate inside 256 px windows at 50 % overlap.
- **Phase drift:** the lattice phase inside windows of about 12 cells, relative to the global lattice. This figure is approximate.
- **Edge spread:** the RMS distance from edge energy to the nearest lattice line, plus the fraction of edge energy within 0.5 px of a line.
- **Interior statistics:** per-cell colour standard deviation after eroding 1 px from each side.
- **Cell jitter:** the standard deviation of cell means within 12-level colour bins. This is an upper bound.
- **In-cell gradient:** a plane fit across each near-flat cell.
- **Autocorrelation pitch (cross-check):** the strongest early peak of the edge profile's normalized autocorrelation (lag 3–40 px), refined by a parabola and the median of its first multiples; repeated in 256 px windows for the local range.
- **Edge blur width:** the 10–90 % rise distance across monotonic luma steps of at least 60 levels, sampled every 7th row or column.
- **JPEG blockiness:** for adjacent-pixel pairs in flat areas (difference < 6), the mean difference at the best phase of period 8 divided by the mean at all other phases. Periods 7 and 9 serve as controls; a clean image scores about 1.01–1.06 on all three.
- **Background:** mean and standard deviation of a border strip 1/40 of the short side wide.

| Metric | `gpt-forest` | `gpt-oni` | `gemini-mage` | `unk-dungeon` | `unk-coat` | `ai-wizard` (negative) |
|---|---|---|---|---|---|---|
| Provenance (C2PA, declared; signature not checked) | OpenAI, `gpt-image` v2.0 | OpenAI, `gpt-image` v2.0 | Google Generative AI, "resized" | none | none | none |
| Size | 1672×941 RGB | 1254×1254 RGB | 2048×2048 RGBA (opaque) | 1280×960 RGB | 934×934 RGB | 1024×1024 RGBA (opaque) |
| Content class | scene | character on flat background | character on flat background | scene | character on flat background | no-grid illustration |
| Global block x / y (px) | 6.70 / 6.60 | 10.00 / 10.77 | 14.15 / 14.24 | 5.23 / 5.37 | 15.60 / 14.46 | no grid |
| Local block range x | 6.65–6.74 | 9.43–10.38 | 12.79–14.70 | 5.21–5.48 | 14.85–15.72 | n/a |
| Local block range y | 6.59–6.67 | 9.83–11.47 | 14.02–14.50 | 5.22–5.56 | 14.51–15.10 | n/a |
| Autocorrelation pitch x / y (px) | 6.69 / 6.58 | 9.96 / 10.74 | 14.01 / 14.27 | 5.31 / 5.40 | 15.27 / 14.54 | x none; y unstable (7.4–23.9 across windows) |
| Autocorrelation local range x / y | 4.0–13.4 / 3.6–19.8 (fine-detail windows lock to half or double pitch) | 9.82–10.58 / 10.05–11.39 | 4.0–14.6 / 12.7–14.5 (white-margin windows lock to 4 px) | 5.26–5.41 / 5.23–5.42 | 8.0–15.4 / 14.45–15.05 (margin windows lock to the 8 px JPEG grid) | n/a |
| Implied logical grid | about 250×142 | about 125×116 | about 145×144 | about 245×179 | about 60×65 | n/a |
| Periodicity strength x / y | 0.29 / 0.23 | 0.24 / 0.32 | 0.21 / 0.54 | 0.30 / 0.27 | 0.39 / 0.34 | 0.13 / 0.08 |
| Phase drift x / y (cells) | 0.43 / 0.55 | 0.68 / 0.97 | 1.0 / 0.19 | 2.1 / 1.5 | 0.36 / 0.46 | n/a |
| Edge spread RMS (fraction of cell) | 0.27 / 0.27 | 0.24 / 0.23 | 0.26 / 0.22 | 0.24 / 0.24 | 0.21 / 0.23 | n/a |
| Edge energy within 0.5 px of the lattice | 0.18 / 0.17 | 0.18 / 0.18 | 0.10 / 0.18 | 0.31 / 0.27 | 0.14 / 0.12 | 0.02 / 0.03 |
| Cell interior std, median / p90 | 3.3 / 16.0 | 0.56 / 7.9 | 0.95 / 20.9 | 0.48 / 5.3 | 0.60 / 5.8 | 20.2 / 50.8 |
| Fraction of near-flat cells (std < 2) | 0.37 | 0.82 | 0.72 | 0.82 | 0.82 | 0.19 |
| Cell jitter (std of same-colour cell means) | ≤ 2.8 | ≤ 1.8 | ≤ 2.4 | ≤ 1.5 | ≤ 1.7 | n/a |
| In-cell luma gradient, median / p90 (levels) | 7.1 / 24.0 | 1.1 / 4.8 | 0.8 / 4.5 | 2.1 / 12.4 | 0.8 / 3.1 | n/a |
| Unique colours (after 4-bit rounding) | 293,193 (1,238) | 77,696 (392) | 189,781 (1,186) | 59,333 (216) | 25,293 (321) | 212,966 (517) |
| Background | none (scene) | near-white, mean 253.9, std 0.56 | near-white, std 0.8–1.0, 2-px periodic pattern | none (scene) | flat grey 118.6, std 0.66, 8×8 JPEG blocking | n/a |
| Global rotation or shear | 0.02° | 0.10° | −0.08° | 0.004° | not measured | n/a |
| Edge 10–90 % width, median / p90 (px) | 8 / 15 (x), 8 / 14 (y) | 2 / 8, 2 / 7 | 2 / 4, 2 / 3 | 7 / 11, 6 / 10 | 2 / 3, 2 / 3 | 6 / 14 |
| Flat-area blockiness, period 8 (controls 7 / 9), x; y | 1.01 (1.01 / 1.01); 1.01 | 1.02 (1.02 / 1.03); 1.02 | 1.10 (1.01 / 1.01); 1.09 | 1.03 (1.01 / 1.04); 1.04 | 1.59 (1.04 / 1.04) at the image-origin phase; 1.55 | 1.02; 1.03 |
| Border strip mean / std | scene (std 24) | 254.0 / 0.56 | 253.8 / 0.92 | scene (std 35) | 118.7 / 0.81 | painted frame (std 37) |

Observations from zoomed crops of the same files [local-measured]:

- **`gpt-forest`:** Blocks have soft edges; most transitions pass through an intermediate-colour cell, hence the 8 px 10–90 % width. Grain and painterly texture appear inside cells. Dark specks smaller than one cell appear inside fine detail (mixels), and thin strokes vary in width.
- **`gpt-oni`:** Interiors are mostly flat, with crisp-to-soft edges of about 1 px. Neighbouring blocks visibly differ in width. Some regions carry a vertical gradient inside a block run.
- **`gemini-mage`:** Edges are crisp but about 2 px soft, consistent with a 2× platform resize. Rectangles overlap at sub-cell offsets, so there is no single common lattice locally, and some cells are split into half-cells. The white background shows a 2 px alternating pattern, the signature of the resize.
- **`unk-dungeon`:** Heavy, roughly 2 px blur. Speckled dither-like grain appears in lit areas. Dark halos surround small sprites in the scene. Diagonal stair-steps are irregular. Transitions also pass through an intermediate shade, so the 10–90 % width (6–7 px) exceeds one cell (5.3 px). No JPEG evidence.
- **`unk-coat`:** The cleanest Case A candidate: highest autocorrelation peak (0.84 / 0.67), 2 px edges, and the most stable y pitch. Anti-aliased diagonals still run *inside* single blocks. Strong 8×8 JPEG blocking (1.55–1.59 against 1.01–1.04 controls) sits on block boundaries aligned to the image origin, so the file was JPEG-encoded at this size rather than cropped afterwards. Windows dominated by the flat margin lock onto the 8 px JPEG grid instead of the art grid.
- **`gemini-mage`:** Weak 8 px blockiness (1.09–1.10 against 1.01 controls) points to mild lossy compression somewhere in the pipeline [inferred].
- **`ai-wizard`:** Illustration with no lattice: the Case B negative control.

**PixelLab reference output (`unk-dungeon`).** A locally stored PixelLab `unzoom_image` output exists for this sample. It was not captured under the competitor protocol (methodology §12), so it is not measured, compared or scored here.

Autocorrelation peak height alone does not separate the cases: the wizard's spurious y peak (0.82) is as high as real ones. What separates them is instability across windows and the DFT strength above. [local-measured]

### 1.2 Apparent Block Size by Generator and Output Size

| Generator / route | Output size | Apparent block size | Logical grid | Integer? | Evidence |
|---|---|---|---|---|---|
| ChatGPT, gpt-image 2.0 (C2PA) | 1672×941 | 6.60–6.74 px | about 250×142 | No | [local-measured] `gpt-forest` |
| ChatGPT, gpt-image 2.0 (C2PA) | 1254×1254 | 9.4–11.5 px, anisotropic | about 125×116 | No | [local-measured] `gpt-oni` |
| GPT, version not stated | 1024×1024 | about 6.9 px | 148–149 cells | No | [observed-in-source] fast-pixelizer eval doc (`3.gpt.png`) |
| GPT, version not stated | not stated | not stated | 97×97 | not stated | [observed-in-source] fast-pixelizer README (`4.gpt.png`) |
| GPT Image 2 (`gpt-image-2.png` in MonoPix) | 1448×1097 | not stated | not stated | not stated | [observed-in-source] fast-pixelizer eval doc |
| GPT Image 2, "2K", 32×32 requested | not stated | 26–32 px, varying | about 70 across | No | [community-observed, vendor] Rangy |
| Gemini / Nano Banana (C2PA "resized") | 2048×2048 | 12.8–14.7 px (about 7 px at 1024 scale) | about 145×144 | No | [local-measured] `gemini-mage` |
| Nano Banana 2 | about 1024×1024 | "some 6 px, others 7 px" | about 64×64 claimed | No | [community-observed, vendor] SpriteCook |
| Gemini, model not stated | not stated | not stated | 200×200 | not stated | [observed-in-source] fast-pixelizer README (`1.gemini.png`) |
| Nano Banana | 256×256 (and a 2048 version) | poor grid | Pixel Snapper returned 49×58 (and about 203) | No | [community-observed] Pixel Snapper issue #1 |
| Midjourney v5 | 1024×1024 | treated as 8 px by the tool author | 128×128 | Assumed | [community-observed] fixelart blog |
| SDXL + Pixel Art XL LoRA | 1024×1024 | 8 px by design ("downscale 8 times", nearest neighbour) | 128×128 | Intended | [observed-in-source] model card |
| SDXL pixel-icon LoRA | 512×512 | 32 px by design | 16×16 | Intended | [observed-in-source] model card |
| Krea 2 Turbo + 16×16 LoRA | 512×512 | 32 px; renders filtered for grid purity ≥ 0.97 | 16×16 | Intended | [observed-in-source] dataset card |
| FLUX.1 "Hard Edge Pixel Art" LoRA | not stated | "downscale 4X" | not stated | Intended | [community-observed] model page |
| Unknown | 1280×960 | 5.2–5.6 px | about 245×179 | No | [local-measured] `unk-dungeon` |
| Unknown (JPEG re-save) | 934×934 | 14.5–15.7 px | about 60×65 | No | [local-measured] `unk-coat` |

No sample at 1536×1024, 1024×1536, or 1344×768 was available. ChatGPT appears to keep a fixed pixel budget of about 1.573 MP and choose dimensions per aspect ratio: 1672×941 has 1,573,352 pixels, 1254×1254 has 1,572,516, and 1536×1024 has 1,572,864. The block size therefore follows how many logical pixels the model decides to draw, not the canvas size [inferred]. Third-party docs say the gpt-image-2 API's custom sizes are multiples of 16 with a 3:1 maximum aspect ratio. The ChatGPT-app files measured here are not multiples of 16, so app delivery differs from API presets [observed-in-source], [community-observed]. Purpose-trained SD, SDXL, Flux, and Krea LoRAs target integer factors (4×, 8×, 32×), but at least one older model's README says its output is "not pixel perfect" [community-observed].

### 1.3 Taxonomy

| # | Artifact | What it looks like | Evidence | Where seen | Degradation-model knob (§2) |
|---|---|---|---|---|---|
| 1 | Non-integer block size | Cell size such as 6.70 or 10.77 px, so no integer downscale fits | [local-measured] all five local samples; [community-observed] Pixel Snapper README, perfectpixel README, MonoPix README | GPT, Gemini, unknown | `cellSize` |
| 2 | Anisotropic cells | x and y periods differ by up to 8 % | [local-measured] `gpt-oni` (10.0 vs 10.77), `unk-coat` (15.6 vs 14.5); perfectpixel "non-square grids"; MonoPix "uneven cell widths, uneven cell heights" | GPT, unknown | `aniso` (excluded from admission) |
| 3 | Local block-size variation and drift | Cell size changes across the image (±0.7–8 %), and the lattice phase wanders 0.2–2 cells | [local-measured] window estimates; [observed-in-source] Pixel Snapper README ("grid resolution can drift"); [community-observed] SpriteCook "6 px … 7 px", Rangy 26–32 px | All non-LoRA generators | `driftAmp`, `driftWavelength`, `maxLocalScaleVar` (excluded from admission) |
| 4 | Grid phase offset | Lattice origin not at pixel 0, so cells are cut at the canvas edge | [local-measured] measured phases are arbitrary; [observed-in-source] fast-pixelizer adds a partial-edge-crop fixture and a phase-alignment metric | All | `phaseX`, `phaseY`, `cropOffset` |
| 5 | Mixels (sub-cell detail) | Details drawn with smaller "pixels", such as eyes, specks in letters, or half-cell steps on diagonals | [local-measured] `gpt-forest`, `gemini-mage` crops; [community-observed] SpriteCook ("soft blocks at odd sizes"), Pixel Snapper maintainer ("snapping mixels"), community detection guides | GPT, Gemini | `mixelRegions`, `mixelRadius`, `mixelFactor` |
| 6 | Soft, anti-aliased block edges | 1–3 px ramps at block edges; edge RMS of about 0.25 of a cell | [local-measured] all samples (edge 10–90 % width median 2 px on characters, 6–8 px on scenes); [community-observed] unfake.js (pixels "bleed over, blur at the edges"), Pixel Snapper (mixed intermediate colours) | All | `supersample`, `edgeBlurSigma`, `resampleKernel` |
| 7 | Gradient shading inside a "pixel" | One logical cell holds a luma ramp of about 1–24 levels | [local-measured] in-cell gradient p90 of 3–24 levels; [community-observed] SpriteCook ("subtle color variations and gradients"), Rangy | All, strongest in painterly scenes | `cellGradient` |
| 8 | Grain, texture, dither-like noise | Speckle or "snow" inside flat areas; chaotic pseudo-dither | [local-measured] `gpt-forest`, `unk-dungeon`; background std 0.56–1.04; [community-observed] SpriteCook ("sub-pixel noise throughout"), community guides ("chaotic dithering") | All | `textureAmp`, `textureScale`, `noiseSigma` |
| 9 | JPEG/WebP compression | 8×8 luma blocking and 16×16 chroma (4:2:0) blocking, misaligned with the art grid | [local-measured] `unk-coat` (strong 8×8 blocking aligned to the image origin), `gemini-mage` (weak 8 px blocking); [observed-in-source] pixeldetector was "primarily created to fix compression issues"; fast-pixelizer JPEG q45 fixture; ComfyUI-PixelArt-Detector saves WebP/JPEG | Re-shared, screenshotted, or WebP-saved outputs | `encode`, `jpegQuality`, `jpegGenerations`, `cropOffset` |
| 10 | Colour explosion and palette drift | Tens to hundreds of thousands of unique colours; same-colour cells differ by about 1.5–3 levels; near-duplicate shades | [local-measured] 25k–293k colours locally; [community-observed] Rangy (44,725 colours for a 12-colour request), pixel-icon LoRA card ("thousands of colours and no real lattice"), community guides (more than 200 colours in a 32×32 sprite is a tell) | All | `cellJitter`, `paletteDrift`, `toneDrift` |
| 11 | Soft drop shadows and glows | Blurred dark ellipse under a sprite; halo around bright effects; dark halos around outlines | [local-measured] `unk-dungeon` halos, `gpt-forest` glowing effects; [community-observed] community guides ("floating shadows") | GPT, unknown | `shadow*`, `glow*` (excluded from admission) |
| 12 | Non-flat backgrounds | Near-white 247–255 with noise; gradients; scene backgrounds | [local-measured] `gpt-oni`, `gemini-mage`, `unk-coat` | All | `bgMode`, `noiseSigma` (excluded from admission) |
| 13 | Fake checkerboard "transparency" | Grey/white checkerboard painted into RGB, alpha 255 everywhere | [community-observed] OpenAI developer-forum reports for ChatGPT images; third-party guides on detecting a painted checkerboard; [unverified] claim that Gemini and Imagen do the same | ChatGPT (reported), Gemini (unverified) | `bgMode: "checker"`, `checkerSize`, `checkerColors` |
| 14 | No real alpha | Output opaque even when a transparent background is requested | [local-measured] all six local AI files are opaque; [observed-in-source] proper-pixel-art notes GPT-4o "not giving a perfectly transparent background". The gpt-image-2 API has a `background: transparent` preview setting [community-observed]. | All consumer apps | `bgMode` (anything other than `keep-alpha`) |
| 15 | Irregular diagonals and curves | Stair-steps with an inconsistent rhythm; anti-aliased diagonals inside single blocks; "mushy" rounded corners | [local-measured] `unk-dungeon`, `unk-coat`; [community-observed] community guides ("tilted pixels", "rounded corners") | All | Emerges from `supersample` + `edgeBlurSigma` + mixels |
| 16 | Varying outline thickness | A 1-cell outline rendered 1–1.5 cells wide in places; strokes of 2 and 3 px within one glyph | [community-observed] community guides (a 1-pixel line becoming about 1.5 pixels thick); [local-measured] `gpt-forest` | GPT | Emerges from `drift*` + `aniso` + mixels |
| 17 | Geometric warp or rotation | Off-axis boundaries; per-band lattice offsets | [community-observed] MonoPix and fast-pixelizer READMEs ("off-axis boundaries" for ChatGPT); [local-measured] global rotation ≤ 0.1° locally, but per-band phase wobble up to 0.3 cell | GPT | `rotationDeg` (default 0), warp field |
| 18 | Text, watermarks, metadata | Pseudo-pixel lettering with uneven strokes; C2PA manifests; SynthID invisible watermark | [local-measured] C2PA chunks in the GPT and Gemini files; Google docs say all generated images carry SynthID; [unverified] visible corner watermark in consumer Gemini apps | GPT, Gemini | `watermark` (optional) |
| 19 | Resolution not honoured | Drawn grid much finer or coarser than requested | [community-observed, vendor] Rangy (about 70 vs 32), SpriteCook ("sometimes gets ignored") | GPT, Gemini | Target-size scenarios (§2.6) |
| 20 | Platform resize | Whole image rescaled after generation, adding a periodic resampling pattern and softness | [local-measured] Gemini C2PA "c2pa.resized", 2 px background pattern, and the ChatGPT pixel budget on two samples [inferred as a rule] | Gemini, ChatGPT | `internalScale`, `resampleKernel`, `finalRescale` |
| 21 | Multi-sprite sheets with per-sprite grids | Sheets where each sprite has its own cell size and phase; global snapping fails | [community-observed] Pixel Snapper issue #7 (a 1024×1024 Nano Banana sheet snapped to a 13×13 blank; the maintainer advised slicing first) | Gemini, GPT | `fake-alpha-sheet` preset (excluded from admission) |

### 1.4 Converter Implications

These points are evidence for the converter design, not decisions.

- **Detect per axis and allow drift.** A single global integer factor fails on every measured AI sample. Estimate P to sub-pixel precision separately for x and y, then refine cell boundaries locally within ±0.35 cell, as Pixel Snapper's walker does [observed-in-source].
- **Sample cell interiors.** Edge energy spreads about 0.25 cell from the lattice, so a cell's colour should come from its central about 50 % (a mode or median), not from the full cell or its centre pixel alone [inferred].
- **Gate on periodicity strength.** Gridded samples scored 0.21–0.54 and the illustration 0.08–0.13. A threshold near 0.17–0.18, validated on the synthetic benchmark, is a starting point for the Case A/B gate from the earlier spike [inferred].
- **Make the target size explicit.** Detected grids (60–250 cells) rarely match requested sizes, so the user-requested size must be an explicit second step, resampling from the recovered grid to the target [inferred].
- **Handle JPEG blocking.** On JPEG inputs, 8 px blocking can be mistaken for the art grid near flat regions, as in `unk-coat`. The period search should down-weight exactly 8 and 16 px when blocking is detected [inferred].

## 2. Parametric Degradation Model (Synthetic Benchmark Generator)

### 2.1 Goals

- **Input and outputs:** take one true low-resolution sprite (the ground truth, GT, `w×h` RGBA with ≤ 256 colours and binary alpha) and produce one pseudo-pixel HD image plus exact ground-truth metadata.
- **Determinism:** the same `(GT, params, seed, generatorVersion)` must produce byte-identical output in one JS engine. Stage sub-seeds keep toggling one stage from changing another stage's random draws.
- **Realism:** each parameter maps to an artifact in §1.3. Defaults come from the local measurements. Values that come only from community evidence are marked [inferred].
- **Implementation:** pure JavaScript typed-array code with no canvas resampling and no browser codecs (see §2.5).

### 2.2 Parameters

Units: px are output pixels unless marked *internal*. Cell means one GT pixel. Levels are 0–255 values.

| Group | Parameter | Range | Default | Evidence or basis |
|---|---|---|---|---|
| Layout | `canvas` | `{w,h}`, or `{pixelBudget, aspect}`; common values 1024², 1536×1024, 1024×1536, 1344×768, 768×1344, 1254², 1672×941, 2048² | `{pixelBudget: 1572864}` at GT aspect | ChatGPT budget [local-measured] on two samples, [inferred] as a rule; the other sizes are common generator sizes [unverified for 1344×768 and 768×1344] |
| Layout | `fit` | `contain`, `cover`, `cell` | `contain` for sprites, `cover` for opaque scenes | [inferred] |
| Layout | `marginFrac` | 0.05–0.30 of the canvas | 0.12 | The local character samples fill about 65–80 % of the canvas [local-measured] |
| Layout | `cellSize` | 4–32 px (derived from canvas and fit when not set) | derived | 5.2–15.6 measured [local-measured]; 26–32 vendor-reported [community-observed] |
| Layout | `aniso` (cy/cx − 1) | −0.08 to +0.08 | 0.015 | 0.6–7.7 % measured [local-measured] |
| Layout | `phaseX`, `phaseY` | 0–1 cell | uniform random | [local-measured] |
| Layout | `placeJitter` | 0–0.5 × the margin | 0.25 | [inferred] |
| Warp | `driftAmp` | 0–1.0 cell (peak) | 0.3 | Peak-to-peak drift 0.2–2.1 cells measured [local-measured] |
| Warp | `driftWavelength` | 15–80 cells | 30 | [inferred] from the window-scale variation |
| Warp | `driftComponents` | 1–4 sinusoids per axis | 3 | [inferred] |
| Warp | `maxLocalScaleVar` | 0–0.10 | 0.06 | Local block size ±0.7–8 % measured [local-measured] |
| Warp | `driftAxisRatio` (y amplitude ÷ x amplitude) | 0.2–1.0 | 1.0 | Gemini x drift about 5× its y drift [local-measured] |
| Warp | `rotationDeg` | 0–0.1 | 0 | ≤ 0.1° measured [local-measured] |
| Mixels | `mixelRegions` | 0–12 | 2 | [inferred] count; the effect is [local-measured] |
| Mixels | `mixelRadius` | 3–14 cells | 6 | [inferred] |
| Mixels | `mixelFactor` | 2 (half cells); 3 is optional | 2 | [inferred] |
| Mixels | `mixelMaxFrac` | 0–1 of the opaque GT cells | 0.25 | [inferred] cap: above it the image is genuinely drawn at half resolution and the GT is no longer the answer (a 16-cell tile with `mixel-detail` disks was 60–100 % covered); cells nearest a region centre are kept |
| Render | `supersample` | 1 (hard NN) or 4×4 coverage AA | 4 | [inferred] |
| Render | `internalScale` | 1, 1.25, 1.5, 2 (render smaller, then resample up) | 1 | Gemini 2× resize [local-measured] |
| Render | `resampleKernel` | `nearest`, `bilinear`, `bicubic` (Keys a = −0.5), `lanczos3` | `bicubic` | [inferred] |
| Render | `edgeBlurSigma` | 0–1.6 px *internal* | 0.5 (was 0.8) | Calibrated to the measured edge 10–90 % width (§2.7) [local-measured] |
| Cell look | `cellJitter` | 0–4 levels std per channel, per cell | 2 | ≤ 1.5–2.8 measured [local-measured] |
| Cell look | `paletteDrift` | 0–4 levels std per palette entry, applied globally | 1.5 | [inferred] (near-duplicate shades) |
| Cell look | `cellGradient` | 0–24 levels across a cell | 4 | Median 0.8–7, p90 3–24 measured [local-measured] |
| Cell look | `gradientMode` | `random` (per-cell direction) or `light` (global direction plus 30° per-cell noise) | `light` | [inferred] |
| Texture | `textureAmp` | 0–8 levels std | 2 | [inferred]; the `gpt-forest` interior std of 3.3 bounds it |
| Texture | `textureScale` | 1–3 px Gaussian | 1.5 | [inferred] |
| Texture | `noiseSigma` | 0–2 levels | 0.7 | Background std 0.56–1.04 measured [local-measured] |
| Texture | `toneDrift` | gain 1 ± 0.05 per channel; gamma 0.95–1.05 | off | [inferred] |
| Background | `bgMode` | `keep-alpha`, `flat`, `near-white`, `gradient`, `checker`, `scene` | `near-white` | [observed-in-source], [community-observed] |
| Background | `nearWhiteRange` | 247–255 | 252–255 | [local-measured] |
| Background | `checkerSize`, `checkerColors` | 8–32 px, light and mid grey | 16 px, (255, 204) | [unverified] exact values |
| Background | `shadowOpacity`, `shadowBlur`, `shadowOffset` | 0–0.5; 4–24 px; (0–1, 0–1.5) cells | off | [inferred] |
| Background | `glowOpacity`, `glowBlur`, `glowColor` | 0–0.6; 4–32 px; brightest palette colour | off | [inferred] |
| Encode | `encode` | `png` or `jpeg` | `png` | [local-measured] (both clean PNG and JPEG-blocked inputs exist) |
| Encode | `jpegQuality` | 45–95 | 80 when JPEG (was 75) | q80 reproduces `unk-coat` blockiness (§2.7) [local-measured]; fast-pixelizer fixture q45 [observed-in-source] |
| Encode | `jpegChroma` | `420` or `444` | `420` | [inferred] |
| Encode | `jpegGenerations` | 1–3 | 1 | [inferred] |
| Encode | `cropOffset` | 0–7 px per axis (applied before encoding) | 0 | `unk-coat` JPEG grid is aligned to the image origin [local-measured]; non-zero offsets model cropped screenshots [inferred] |
| Encode | `finalRescale` | 0.85–1.15 (bilinear) | 1 | [inferred] (screenshot or platform resize) |
| Extras | `watermark` | `none` or a corner glyph | `none` | [unverified] |

### 2.3 Ground-Truth Bundle Emitted Per Sample

- `input.png`: the degraded image. A JPEG-stage sample is decoded back to PNG so consumers read one format; the JPEG bytes are kept for reproducibility.
- `gt.png`: the GT at `w×h`, with binary alpha.
- `labels.u32`: one value per output pixel, holding the GT cell index (`v*w + u`) of the centre supersample, or `0xFFFFFFFF` for background. This gives exact per-pixel ownership even with drift, mixels, and rotation. It is resampled with nearest neighbour through `internalScale` and `finalRescale`.
- `meta.json`: generator version, seed, preset, every resolved parameter, canvas size, `cx`, `cy`, sprite origin, phases, warp coefficients, mixel regions (centre and radius in cell units), crop offset, rescale factor, target sizes (§2.6), and two quick-look arrays: `edgesX` (cell boundaries along the canvas's centre row) and `edgesY` (along its centre column).
- `ambiguous` (harness truth): one flag per GT cell, set when the GT colour is not the strict plurality of a 4×4 sub-cell sample of the cell as rendered (mixel source, shading, palette and cell shifts, nearest GT palette colour per sample). Such cells cannot be recovered by any converter; metrics report fidelity both raw and on the recoverable cells only.
- `phaseAmbiguous` (harness truth), per axis: the first true cut lies within 0.05 cell of a half cell. At phase ≈ ±0.5 both border cells are half cells, so N and N + 1 cells, and a whole-axis one-cell shift of the answer, are equally valid. Scoring treats either alignment as correct (see the metrics document, G9).

### 2.4 Generation Algorithm

Notation: `rng(stage)` is a mulberry32 generator seeded with `hash32(seed, stageName)`, using FNV-1a over the stage name mixed with the seed. `gauss(r)` is Box–Muller with a cached second value. Colours are linear in sRGB code values, with no gamma conversion, to match how generators' outputs measure. Alpha is premultiplied during filtering.

1. **Normalize the GT.** Decode to RGBA8 and binarize alpha (`a = a >= 128 ? 255 : 0`). Extract the palette as the unique opaque RGB values. Reject inputs with more than 256 colours or any side over 512.
2. **Resolve the layout** (`rng("layout")`).
   - Build the canvas: if `pixelBudget` is set, `W = round(sqrt(B*aspect))` and `H = round(B/W)`, where `aspect = w/h` (sprites use their content bounding box). Otherwise use the given `{w,h}`.
   - Set the cell size: `cx = cellSize ?? min(W*(1-2m)/w, H*(1-2m)/(h*(1+aniso)))` for `contain`, or `max(W/w, H/(h*(1+aniso)))` for `cover`. Then `cy = cx*(1+aniso)`.
   - Place the sprite: origin `ox = (W - w*cx)/2 + jx`, `oy = (H - h*cy)/2 + jy`, where `jx, jy ~ U(-1,1) * placeJitter * margin`. Add the phase: `ox += phaseX*cx`, `oy += phaseY*cy`, wrapped so the sprite stays inside the canvas for `contain`.
   - Size the internal canvas: `Wi = round(W/internalScale)`, `Hi = round(H/internalScale)`. Divide every length in this step by `internalScale` for internal-space use.
3. **Build the warp field** (`rng("warp")`). For each axis `a ∈ {x, y}` and `k = 1..driftComponents`:
   - Draw a direction `θ ~ U(0,2π)`, a wavelength `λ = driftWavelength*cx*U(0.6,1.4)`, a phase `φ ~ U(0,2π)`, and an amplitude `A = driftAmp*cx/sqrt(K)*U(0.5,1.5)`. For y, multiply `A` by `driftAxisRatio`.
   - Each component is `A*sin(2π(cosθ*X + sinθ*Y)/λ + φ)`.
   - Compute `S = Σ 2πA/λ` per axis. If `S > maxLocalScaleVar`, scale that axis's amplitudes by `maxLocalScaleVar/S`. This keeps the mapping monotonic and local cell sizes within ±`maxLocalScaleVar`.
4. **Set per-cell and per-palette attributes** (`rng("cells")`).
   - Draw `paletteShift[p] ~ N(0, paletteDrift²)` per channel.
   - Draw `jitter[v][u] ~ N(0, cellJitter²)` per channel.
   - Draw the gradient direction `g[v][u]`: for `light`, a global angle `α ~ U(0,2π)` plus `N(0, (π/6)²)` per cell; for `random`, `U(0,2π)` per cell. The magnitude is `cellGradient * U(0.5, 1.5)`.
5. **Add mixel regions** (`rng("mixels")`).
   - Draw `mixelRegions` centres uniformly over opaque GT cells, each with radius `mixelRadius*U(0.6,1.4)` in cell units.
   - Build `GT2`: a `mixelFactor×` bilinear upsample of the premultiplied GT, with each texel snapped to the nearest GT palette colour (squared RGB distance; ties go to the lower palette index) and alpha thresholded at 0.5. This creates genuine half-cell stair-steps without inventing colours.
6. **Render with supersampling** at internal resolution (`supersample = s`). For each internal pixel `(X,Y)` and each subsample `(i,j)`:
   - Set `Xs = X + (i+0.5)/s`, `Ys = Y + (j+0.5)/s`, and rotate about the canvas centre by `-rotationDeg`.
   - Compute `u = (Xs - ox - Dx(Xs,Ys))/cx` and `v = (Ys - oy - Dy(Xs,Ys))/cy`, with `iu = floor(u)`, `iv = floor(v)`, `fu = u - iu - 0.5`, `fv = v - iv - 0.5`.
   - Outside the GT, the subsample is transparent. Inside a mixel region, `c = GT2[floor(v*f)][floor(u*f)]`; otherwise `c = GT[iv][iu]`.
   - If `c` is opaque, `rgb = c.rgb + paletteShift[c] + jitter[iv][iu] + gmag*(fu*cos(gdir) + fv*sin(gdir))`.
   - Accumulate premultiplied RGBA and average over `s²` subsamples. With `s = 1` and integer `cx`, phases, and placement, this is an exact nearest-neighbour upscale (the control preset).
   - Record `labels` from the centre subsample.
7. **Composite the background** (`rng("bg")`) at internal resolution.
   - Build the background: `flat` uses one palette-derived colour; `near-white` is `U(nearWhiteRange)` per image; `gradient` is a vertical linear blend of two colours; `checker` uses squares of `checkerSize` px with an origin offset `U(0, checkerSize)`, deliberately unaligned to the cells; `scene` means an opaque GT with no background; `keep-alpha` skips compositing.
   - For a shadow, blur the sprite alpha with a separable Gaussian of σ = `shadowBlur`, shift it by `shadowOffset*cell`, and composite black at `shadowOpacity`.
   - For a glow, blur with σ = `glowBlur`, apply no offset, and composite `glowColor` at `glowOpacity`, additive-clamped, under the sprite.
   - Composite the sprite over the result.
8. **Blur and resample.**
   - Apply a separable Gaussian with σ = `edgeBlurSigma`, radius `ceil(3σ)`, clamp-to-edge, on premultiplied RGBA.
   - If `internalScale ≠ 1`, resample to `W×H` with the chosen separable kernel, using precomputed floating-point weights per output row and column (support scaled for downscaling).
   - Scale `labels` by nearest neighbour.
9. **Add texture, noise, and tone** (`rng("noise")`).
   - Texture: Gaussian white noise at `W×H`, blurred with σ = `textureScale`, normalized to unit std (two-pass mean and variance in float64), multiplied by `textureAmp`. Add it equally to R, G, and B, plus 30 % independent chroma noise per channel.
   - Noise: add per-channel Gaussian noise with σ = `noiseSigma`.
   - Tone: apply `toneDrift` gains and gamma.
   - Clamp and round to 8 bits with `Math.round`. Pixels that were fully transparent under `keep-alpha` stay `(0,0,0,0)`.
10. **Add a watermark** (optional). Stamp a built-in bitmap glyph (no system fonts) in the bottom-right corner at 50 % opacity, and record its region in `meta`. This only tests masking: a converter excludes a declared or estimated watermark region from analysis and never alters or removes the mark.
11. **Encode** (`rng("encode")`).
    - Crop `cropOffset` px from the top-left, so the JPEG 8×8 and 16×16 grids misalign with the art lattice, and shift `labels`, `edgesX`, and `edgesY` to match.
    - If `encode = jpeg`, run `jpegGenerations` rounds of pure-JS baseline JPEG encode and decode at `jpegQuality` with `jpegChroma` subsampling.
    - Apply `finalRescale` with bilinear resampling and scale `labels` by nearest neighbour.
12. **Emit the bundle** (§2.3), including a SHA-256 of `input.png` and `gt.png` in `meta.json` for golden tests.

Skeleton (illustrative):

```js
function degrade(gt, params, seed) {
  const P = resolvePreset(params);          // fills defaults
  const L = layout(gt, P, rng(seed, "layout"));
  const warp = buildWarp(L, P, rng(seed, "warp"));
  const cells = cellAttributes(gt, P, rng(seed, "cells"));
  const mix = mixels(gt, P, rng(seed, "mixels"));
  let { rgba, labels } = render(gt, L, warp, cells, mix, P);   // internal res
  rgba = composite(rgba, L, P, rng(seed, "bg"));
  rgba = gaussian(rgba, P.edgeBlurSigma);
  ({ rgba, labels } = resampleTo(rgba, labels, L.W, L.H, P.resampleKernel));
  rgba = addTextureNoiseTone(rgba, P, rng(seed, "noise"));
  ({ rgba, labels } = encodeStage(rgba, labels, P, rng(seed, "encode")));
  return { input: rgba, gt, labels, meta: { seed, P, L, warp, mix } };
}
```

### 2.5 Determinism Notes

- **Randomness:** never use `Math.random`. Use one 32-bit PRNG per stage, so disabling mixels (for example) does not change the noise field.
- **Resampling and codecs:** do not use `CanvasRenderingContext2D.drawImage` scaling or `canvas.toBlob("image/jpeg")`. Their filters and encoders differ between browsers. Use JS resampling and a pure-JS JPEG encoder and decoder. WebP is left out of v1 because no small deterministic pure-JS lossy WebP path is assumed. JPEG 4:2:0 already covers 8×8 and 16×16 blocking [inferred].
- **Floating point:** transcendental functions (`Math.sin`, `Math.exp`) can differ in the last ulp across engines, which can flip a rounding by one level. Golden tests should compare cross-engine output with a ±1-level tolerance. Ground-truth geometry (`labels`, `edgesX`, `edgesY`) is computed from parameters and must match exactly [inferred].

### 2.6 Target-Size Scenarios

Real users may request a size that differs from the drawn grid (§1.3 row 19). The benchmark therefore records three targets per sample:

- `native`: target = `w×h`. The GT is exact and this is the primary score.
- `half`: target = `ceil(w/2)×ceil(h/2)`. The reference is the GT mode-pooled over 2×2 blocks, with ties going to the darker colour. The reference is approximate and is flagged in `meta`.
- `free`: no target given; the converter must report its detected grid, scored as grid-size error against `w×h`.

### 2.7 Calibration Check

A seeded NumPy prototype of steps 2–9 ran in a scratch session; it was not committed. It rendered a 128×128 crop of the first frame of a local-only showcase cinematic (excluded from corpus admission, §3.1) and measured the result with the §1.1 method:

| Configuration | Output | Block x / y | Edge RMS (cells) | Edge energy within 0.5 px | Unique colours |
|---|---|---|---|---|---|
| Integer NN ×8, phase 0.3/0.6 cell, supersample 4 | 1024² | 8.00 / 8.00 | 0.05–0.06 | 0.50–0.75 | 4,740 |
| Non-integer NN 6.7, supersample 4 | 858² | 6.70 / 6.70 | 0.06 | 0.75 | 3,583 |
| `gpt-image-like` scene values (6.7, aniso −0.015, drift 0.25, blur 0.9, gradient 8, jitter 3, noise 1.5, mixels 12) | 858×845 | 6.70 / 6.60 | 0.25 | 0.20–0.21 | 247,936 |
| `gpt-image-like` character values, pre-recalibration (10.0, aniso 0.07, drift 0.4, λ 20, blur 0.8, mixels 4) | 1280×1370 | 10.55 / 10.97 | 0.27 | 0.11–0.12 | 198,630 |
| `gemini-like`, pre-recalibration (internal 7.1 → ×2 bicubic, drift 0.5, λ 20, blur 0.6) | 1818² | 13.49 / 13.82 | 0.27–0.28 | 0.08–0.09 | 308,928 |
| NN ×8 + Gaussian σ 1.5 | 1024² | 8.00 / 8.00 | 0.19 | 0.23–0.25 | 81,160 |
| NN ×8 + JPEG q70 | 1024² | 8.00 / 8.00 | 0.19–0.20 | 0.32–0.45 | 154,175 |

Real samples sit at 0.21–0.27 RMS and 0.10–0.31 energy within 0.5 px, so the `gpt-image-like` and `gemini-like` values land in the measured band. Periodicity strength depends on content: the synthetic scene scored 0.43–0.47, against 0.23–0.29 for `gpt-forest`. The real scene has more off-lattice texture and lettering, so `textureAmp` and `mixelRegions` should be raised for scene presets. Even 8 levels of texture moved the strength only to 0.43–0.46, so the strength gate must be validated on the local real samples (§1.1) as well as synthetic ones [local-measured], [inferred].

**Recalibration against the §1.1 edge-width and blockiness measurements** [local-measured]. The same prototype was re-run with the new metrics:

| Configuration | Edge 10–90 % median / p90 (px) | Flat-area blockiness, period 8 (control 9) | Measured target |
|---|---|---|---|
| Character, `edgeBlurSigma` 0.8, supersample 4 (old default) | 3 / 9–10 | 1.02–1.03 (1.03–1.12) | `gpt-oni`: 2 / 7–8 |
| Character, `edgeBlurSigma` 0.5, supersample 4 | 2 / 8–10 | 1.02–1.03 | `gpt-oni`: 2 / 7–8 |
| Scene, `edgeBlurSigma` 0.9 | 6–8 / 12–14 | 1.01 | `gpt-forest`: 8 / 14–15 |
| `gemini-like`, supersample 4, internal blur 0.6 (old) | 4 / 5 | n/a | `gemini-mage`: 2 / 3–4 |
| `gemini-like`, supersample 4, internal blur 0 | 4 / 4 | n/a | `gemini-mage`: 2 / 3–4 |
| `gemini-like`, supersample 1 (hard NN), internal blur 0 | 3 / 3 | n/a | `gemini-mage`: 2 / 3–4 |
| `gemini-like` + JPEG q95 at output | 4 / 5 | 1.43 (1.04) | `gemini-mage`: 1.09–1.10 (1.01) |
| Coat-like, cell 15, JPEG q60 | 2 / 3 | 2.96–2.99 (1.08) | `unk-coat`: 1.55–1.59 (1.04) |
| Coat-like, cell 15, JPEG q80 | 2 / 3 | 1.50–1.52 (1.04) | `unk-coat`: 1.55–1.59 (1.04) |

Values changed as a result:

- Global `edgeBlurSigma` default: 0.8 → 0.5.
- `gpt-image-like`: character `edgeBlurSigma` 0.8 → 0.5. Scenes keep 0.9.
- `gemini-like`: `supersample` 4 → 1 and internal `edgeBlurSigma` 0.6 → 0. The 2× bicubic resize alone supplies the softness.
- `jpeg-heavy`: default quality 60 → 80 (range widened to 50–85), and default `cropOffset` (5,5) → (0,0). The earlier "phase 5" reading came from measuring a background patch offset by 10 px.
- `gemini-like`'s weak 8 px blockiness stays unmodelled: even q95 at the output overshoots it (1.43 against 1.10). Add a pre-resize JPEG stage only if a converter test shows this matters [inferred].

Unchanged and confirmed: block sizes, anisotropy, drift, jitter, gradient, and background values. The autocorrelation pitches agree with the DFT pitches within 0.1–0.3 px (2 %).

### 2.8 Preset Profiles

Unlisted parameters keep their §2.2 defaults. "Scene" means an opaque GT rendered with `fit: cover` and `bgMode: scene`. The generator-named presets (`gpt-image-like`, `gemini-like`) are parameterised from one or two local samples per generator (§1.1); they are in-sample fits, not validated generator models, and results on them are synthetic evidence only (methodology §17). `illustration-no-grid` is a bicubic upscale of pixel art (methodology stratum I), not a true no-grid illustration; a procedural no-grid fixture (methodology §5.4) is still missing.

| Preset | Key values | Justification | Label |
|---|---|---|---|
| `clean-nn-integer` | `cellSize` integer in {4,6,8,10,12,16}, default 8; integer phases and placement; `supersample` 1; drift, mixels, blur, jitter, gradient, texture, noise 0; `bgMode: keep-alpha`; PNG | Case A upper bound and control. Matches SDXL Pixel Art XL's 8× design and fast-pixelizer's NN fixtures. Must round-trip exactly. | [observed-in-source] |
| `nonint-nn` | `cellSize` U(4.5,16), default 6.7; random phase; `supersample` 4; no blur, drift, or noise; `bgMode: flat` | Non-integer scale alone (every measured AI sample). fast-pixelizer has 7.5× and 8/6× fixtures. | [observed-in-source] |
| `nonint-bilinear` | `cellSize` about 9.6 (6.4 internal); `internalScale` 1.5; `resampleKernel: bilinear`; `edgeBlurSigma` 0; jitter and noise 0 | A classically resized sprite: pixeldetector targets "resized or corrupted" art, fast-pixelizer has a cubic fixture, and Gemini outputs carry a platform resize | [observed-in-source], values [inferred] |
| `gpt-image-like` | `pixelBudget` 1,572,864; cell from layout (6.6–10.8); `aniso` U(−0.02, 0.08), default 0.03; `driftAmp` 0.3, λ 30; `maxLocalScaleVar` 0.06; `mixelRegions` 4, radius 6; `edgeBlurSigma` 0.5 for characters (was 0.8), 0.9 for scenes; `cellJitter` 2; `paletteDrift` 1.5; `cellGradient` 4 (scene 8); `textureAmp` 3 (scene 4); `noiseSigma` 0.6; `bgMode` near-white 252–255 (or scene); PNG | Matches `gpt-forest` and `gpt-oni` block sizes, anisotropy, drift, edge spread, jitter, and background. Supported by Rangy (varying 26–32 px blocks) and the MonoPix and fast-pixelizer READMEs ("uneven cell widths, uneven cell heights, soft edges, and off-axis boundaries"). | [observed-in-source], [community-observed] |
| `gemini-like` | canvas 2048² from a 1024² internal canvas (`internalScale` 2, `bicubic`); internal cell about 7.1; `aniso` 0.005; `driftAmp` 0.35, λ 20, `driftAxisRatio` 0.3; `mixelRegions` 3; `supersample` 1 (was 4); `edgeBlurSigma` 0 (was 0.6); `cellJitter` 2; `cellGradient` 1; `textureAmp` 1.5; `noiseSigma` 0.8; `bgMode` near-white 247–255; PNG | Matches `gemini-mage`: the C2PA "resized" note, about 14.2 px output blocks, drift mostly along x, edge RMS 0.22–0.26, and the 2 px background pattern. SpriteCook reports 6–7 px blocks at 1024. | [observed-in-source], [community-observed, vendor] |
| `drift-heavy` | `cellSize` U(5.2,10); `aniso` 0.08; `driftAmp` 0.9, λ 15; `maxLocalScaleVar` 0.10; otherwise `gpt-image-like` | Stress case: `unk-dungeon` drifts 1.5–2.1 cells and `gpt-oni` about 1 cell, with ±8 % local size. Pixel Snapper says "grid resolution can drift". | [observed-in-source] |
| `mixel-detail` | `gpt-image-like` plus `mixelRegions` 10, radius U(8,14), `mixelFactor` 2, `textureAmp` 4 | Sub-cell detail in `gpt-forest` and in `gemini-mage` split cells; the community defines "mixels" as mixed-size pixels. The count and radius are guesses. | [observed-in-source], [community-observed], values [inferred] |
| `jpeg-heavy` | `nonint-nn` plus `edgeBlurSigma` 0.4; JPEG q U(50,85), default 80 (was 60); `jpegChroma` 420; `jpegGenerations` 2; `cropOffset` U{0..7}, default (0,0) (was (5,5)); `finalRescale` U(0.9,1.1) | `unk-coat` shows origin-aligned 8×8 blocking that q80 reproduces; pixeldetector's stated purpose is JPEG repair; fast-pixelizer has a q45 fixture | [observed-in-source], values [inferred] |
| `fake-alpha-sheet` | 2–16 GT sprites in a grid, each with its own `cellSize` (base × U(0.95,1.05)) and phase; `bgMode: checker` (16 px, origin unaligned); shadow opacity 0.3, blur 8 px, offset (0.5, 0.8) cell; otherwise `gpt-image-like`. GT bundle per sprite plus sheet rectangles. | ChatGPT painting checkerboards into RGB (OpenAI forum); Nano Banana sheets breaking global snapping (Pixel Snapper #7); community "floating shadows" | [community-observed], values [inferred] |
| `illustration-no-grid` | GT upsampled with `bicubic` straight to the canvas (no NN stage); `edgeBlurSigma` 0.35 × cell; `cellGradient` 24; `textureAmp` 8 at 3 px; `noiseSigma` 1.5; `bgMode: gradient`. Expected outcome: the converter reports "no grid / Case B". | Negative control matching `ai-wizard` (strength 0.08–0.13) and the spike's Case B | [observed-in-source], values [inferred] |

## 3. Local Corpus Inventory

### 3.1 External PixelLab Showcase Images (Local Copy, Not Tracked Here)

These are PixelLab AI outputs from the public PixelLab Pip repository's `docs/showcase/` (commit `b590d66`, 2026-09-07), dedicated under [CC0 1.0](https://github.com/Shilo/pixellab-pip/blob/b590d6624627453a196e3e513738700e27429d46/docs/showcase/LICENSE.md) by their creator; that licence itself warns that third-party rights in depicted content are not waived. A local copy is in the gitignored `.local/fixtures/showcase/`; Pixilate tracks none of them. They are not admitted to a Pixilate corpus: methodology §3.2 needs a per-asset record (model and date, terms snapshot, inputs, duplicate and trademark/likeness review), and prompts alone are not provenance. Until then they are local exploratory references only: not committed, never required by CI, no pixels in reports. `tiles/minecraft-*`, `rpg-maker-characters/*` and `cinematic/*` are excluded from any future admission (third-party trademarks, styles or characters). All of them come from one generator and one creator series, so they form one source family for splits (methodology §6.2).

Every file was measured with PIL. *Transp.* is the fraction of fully transparent pixels. *Colours* counts unique opaque RGB values in the whole file (first frame for GIFs). *NN* is the largest integer k for which the file is an exact k× nearest-neighbour upscale. Every file is NN = 1 (native 1:1) with no semi-transparent pixels. Paths are relative to the showcase folder.

| File | Size | Mode | Frames | Transp. | Colours | NN |
|---|---|---|---|---|---|---|
| `cinematic/hoverboard-dusk-cinematic.gif` | 256x128 | P | 97 | 0.00 | 64 | 1 |
| `gameplay-gui/gameplay-gui-component-specific-688x384.png` | 688x384 | RGBA | 1 | 0.32 | 28136 | 1 |
| `gameplay-gui/gameplay-gui-fantasy-mmo-688x384.png` | 688x384 | RGBA | 1 | 0.35 | 42702 | 1 |
| `gameplay-gui/gameplay-gui-mood-only-344x192.png` | 344x192 | RGBA | 1 | 0.69 | 6945 | 1 |
| `gameplay-gui/modular-mmorpg-gui-compass-688x384.png` | 688x384 | RGBA | 1 | 0.47 | 31 | 1 |
| `gameplay-gui/modular-mmorpg-gui-textless-688x384.png` | 688x384 | RGBA | 1 | 0.37 | 49 | 1 |
| `gui-icons/animal-face-emoji-5x5-16px.png` | 80x80 | P | 1 | 0.46 | 161 | 1 |
| `item-icons/candy-sweets-treats-8x8-32px.png` | 256x256 | RGBA | 1 | 0.53 | 64 | 1 |
| `item-icons/candy-sweets-treats-glossy-8x8-32px.png` | 256x256 | RGBA | 1 | 0.55 | 64 | 1 |
| `item-icons/fantasy-rpg-armor-8x8-32px.png` | 256x256 | RGBA | 1 | 0.49 | 61 | 1 |
| `item-icons/fantasy-rpg-consumables-8x8-32px.png` | 256x256 | RGBA | 1 | 0.60 | 64 | 1 |
| `item-icons/fantasy-rpg-inventory-64px-4x4.png` | 256x256 | RGBA | 1 | 0.73 | 256 | 1 |
| `item-icons/fantasy-rpg-inventory-64px-8x8.png` | 512x512 | RGBA | 1 | 0.64 | 49 | 1 |
| `item-icons/fantasy-rpg-inventory-bgremoved-8x8-32px.png` | 256x256 | RGBA | 1 | 0.59 | 60 | 1 |
| `item-icons/fantasy-rpg-items-8x8-32px.png` | 256x256 | RGBA | 1 | 0.68 | 256 | 1 |
| `item-icons/fantasy-rpg-materials-8x8-32px.png` | 256x256 | RGBA | 1 | 0.56 | 63 | 1 |
| `item-icons/fantasy-rpg-weapons-8x8-32px.png` | 256x256 | RGBA | 1 | 0.78 | 60 | 1 |
| `pip/pip.gif` | 34x54 | P | 9 | 0.31 | 29 | 1 |
| `pip/pip.png` | 34x54 | P | 1 | 0.31 | 29 | 1 |
| `rpg-maker-characters/rpg-maker-mv-character.gif` | 48x192 | P | 4 | 0.69 | 47 | 1 |
| `rpg-maker-characters/rpg-maker-mv-character.png` | 144x192 | RGBA | 1 | 0.71 | 80 | 1 |
| `rpg-maker-characters/rpg-maker-mz-character.gif` | 48x192 | P | 4 | 0.60 | 60 | 1 |
| `rpg-maker-characters/rpg-maker-mz-character.png` | 144x192 | RGBA | 1 | 0.63 | 118 | 1 |
| `rpg-maker-characters/rpg-maker-vx-ace-character.gif` | 32x128 | P | 4 | 0.63 | 42 | 1 |
| `rpg-maker-characters/rpg-maker-vx-ace-character.png` | 96x128 | RGBA | 1 | 0.66 | 67 | 1 |
| `skill-icons/create-image-pro-borderless-mosaic-8x8-32px.png` | 256x256 | RGBA | 1 | 0.00 | 63 | 1 |
| `skill-icons/create-image-pro-fire-magic-sheet-8x8-32px.png` | 256x256 | RGBA | 1 | 0.00 | 53 | 1 |
| `skill-icons/create-image-pro-original-strict-grid-8x8-32px.png` | 256x256 | RGBA | 1 | 0.00 | 62 | 1 |
| `skill-icons/create-image-pro-rich-background-8x8-32px.png` | 256x256 | RGBA | 1 | 0.00 | 63 | 1 |
| `skill-icons/fantasy-rpg-skill-64px-4x4.png` | 256x256 | RGBA | 1 | 0.00 | 256 | 1 |
| `skill-icons/fantasy-rpg-skill-64px-8x8-curated.png` | 512x512 | RGBA | 1 | 0.00 | 410 | 1 |
| `tiles/minecraft-block-face-64px-4x4.png` | 256x256 | RGBA | 1 | 0.00 | 256 | 1 |
| `tiles/minecraft-block-face-64px-8x8-atlas.png` | 512x512 | RGBA | 1 | 0.00 | 862 | 1 |
| `tiles/minecraft-inspired-generate-image-v2-16x16-atlas.png` | 256x256 | RGBA | 1 | 0.00 | 64 | 1 |
| `tiles/minecraft-mod-generate-image-v2-8x8-32px-sheet.png` | 256x256 | RGBA | 1 | 0.00 | 256 | 1 |
| `tilesets/one-bit-black-green-topdown-tileset.png` | 128x64 | RGBA | 1 | 0.00 | 4 | 1 |
| `tilesets/one-bit-sidescroller-icy-cap-bw-gameboy.png` | 256x128 | RGBA | 1 | 0.48 | 4 | 1 |
| `tilesets/sidescroller-dirt-grass-medium-single-color-outline.png` | 64x64 | RGBA | 1 | 0.55 | 58 | 1 |
| `tilesets/tileset-showcase-16px-sidescroller-atlas.png` | 256x64 | RGBA | 1 | 0.55 | 108 | 1 |
| `tilesets/tileset-showcase-16px-topdown-atlas.png` | 256x192 | RGBA | 1 | 0.00 | 52 | 1 |
| `tilesets/tileset-showcase-32px-sidescroller-atlas.png` | 384x128 | RGBA | 1 | 0.51 | 20 | 1 |
| `tilesets/topdown-dirt-grass-low-single-color-outline.png` | 64x64 | RGBA | 1 | 0.00 | 27 | 1 |
| `visual-effects/fantasy-aura-effects.gif` | 256x256 | P | 9 | 0.46 | 172 | 1 |
| `visual-effects/fantasy-aura-effects.png` | 256x256 | RGBA | 1 | 0.46 | 256 | 1 |
| `visual-effects/fire-explosion.gif` | 256x256 | P | 9 | 0.63 | 247 | 1 |
| `visual-effects/fire-explosion.png` | 256x256 | RGBA | 1 | 0.62 | 256 | 1 |
| `visual-effects/spark-explosion.gif` | 256x256 | P | 8 | 0.77 | 161 | 1 |
| `visual-effects/spark-explosion.png` | 256x256 | P | 1 | 0.78 | 162 | 1 |
| `visual-effects/toxic-explosion.gif` | 256x256 | P | 10 | 0.63 | 186 | 1 |
| `visual-effects/toxic-explosion.png` | 256x256 | RGBA | 1 | 0.63 | 256 | 1 |
| `visual-effects/void-implosion.gif` | 256x256 | P | 7 | 0.59 | 191 | 1 |
| `visual-effects/void-implosion.png` | 256x256 | RGBA | 1 | 0.59 | 256 | 1 |

Layout notes for cropping:

- **Grid sheets:** `*-8x8-32px` sheets are 8×8 grids of 32 px cells. `*-64px-4x4` sheets are 4×4 grids of 64 px. `animal-face-emoji-5x5-16px.png` is 5×5 of 16 px. `minecraft-inspired-…-16x16-atlas.png` is 16×16 of 16 px.
- **Visual effects:** each VFX PNG is an 8×8 grid of 32 px effect sprites.
- **RPG Maker sheets:** MV and MZ sheets are 3×4 frames of 48 px; VX Ace is 3×4 of 32 px.
- **1-bit tilesets:** each holds two palette variants side by side. The left half is black and white.
- **Excluded files:** `gameplay-gui-component-specific`, `gameplay-gui-fantasy-mmo`, and `gameplay-gui-mood-only` contain 6,945–42,702 colours and are not palette-clean ground truth.

### 3.2 Candidate Local Ground-Truth Set (Local-Only, Not Corpus-Admitted)

Crop boxes are `(x0, y0, x1, y1)` in source pixels with exclusive ends; "none" means use the whole file. Every crop was re-measured after cropping. Rows #2, #3, #11, #12 and #21 are excluded from admission (§3.1). Committed tests must not depend on this set; they use procedural fixtures only.

| # | Path (relative to the showcase folder) | Crop box | Size | Colours | Transp. | Category |
|---|---|---|---|---|---|---|
| 1 | `pip/pip.png` | none | 34×54 | 29 | 0.31 | Character, odd size |
| 2 | `rpg-maker-characters/rpg-maker-mz-character.png` | (48, 0, 96, 48) | 48×48 | 45 | 0.55 | Character, front (excluded from admission) |
| 3 | `rpg-maker-characters/rpg-maker-vx-ace-character.png` | (32, 64, 64, 96) | 32×32 | 29 | 0.68 | Character, side (excluded from admission) |
| 4 | `item-icons/fantasy-rpg-inventory-bgremoved-8x8-32px.png` | (0, 0, 32, 32) | 32×32 | 13 | 0.76 | Icon, diagonal blade |
| 5 | `item-icons/fantasy-rpg-inventory-bgremoved-8x8-32px.png` | (0, 128, 32, 160) | 32×32 | 20 | 0.64 | Icon, round potion |
| 6 | `item-icons/candy-sweets-treats-glossy-8x8-32px.png` | (0, 0, 32, 32) | 32×32 | 24 | 0.59 | Icon, spiral and glossy highlights |
| 7 | `item-icons/fantasy-rpg-inventory-64px-4x4.png` | (0, 0, 64, 64) | 64×64 | 53 | 0.71 | Icon, 64 px |
| 8 | `gui-icons/animal-face-emoji-5x5-16px.png` | (0, 0, 16, 16) | 16×16 | 7 | 0.47 | Icon, 16 px, low palette |
| 9 | `skill-icons/create-image-pro-rich-background-8x8-32px.png` | (0, 0, 32, 32) | 32×32 | 14 | 0.00 | Opaque icon |
| 10 | `skill-icons/fantasy-rpg-skill-64px-4x4.png` | (0, 0, 64, 64) | 64×64 | 38 | 0.00 | Opaque icon, 64 px |
| 11 | `tiles/minecraft-inspired-generate-image-v2-16x16-atlas.png` | (48, 0, 64, 16) | 16×16 | 8 | 0.00 | Opaque tile, noisy texture (excluded from admission) |
| 12 | `tiles/minecraft-block-face-64px-4x4.png` | (0, 0, 64, 64) | 64×64 | 14 | 0.00 | Opaque texture, 64 px (excluded from admission) |
| 13 | `tilesets/one-bit-black-green-topdown-tileset.png` | (0, 0, 64, 64) | 64×64 | 2 | 0.00 | 1-bit, opaque, thin lines |
| 14 | `tilesets/one-bit-sidescroller-icy-cap-bw-gameboy.png` | (0, 0, 128, 128) | 128×128 | 2 | 0.48 | 1-bit with alpha |
| 15 | `tilesets/topdown-dirt-grass-low-single-color-outline.png` | none | 64×64 | 27 | 0.00 | Opaque terrain tileset |
| 16 | `tilesets/tileset-showcase-32px-sidescroller-atlas.png` | (0, 0, 128, 128) | 128×128 | 16 | 0.56 | Platformer tiles with alpha |
| 17 | `visual-effects/fire-explosion.png` | (32, 0, 64, 32) | 32×32 | 52 | 0.56 | VFX, dense colour ramp |
| 18 | `visual-effects/spark-explosion.png` | (0, 0, 32, 32) | 32×32 | 14 | 0.90 | VFX, sparse 1 px sparks |
| 19 | `gameplay-gui/modular-mmorpg-gui-textless-688x384.png` | (116, 294, 190, 367) | 74×73 | 25 | 0.21 | UI ring frame, curves |
| 20 | `gameplay-gui/modular-mmorpg-gui-textless-688x384.png` | (16, 239, 214, 267) | 198×28 | 25 | 0.01 | UI bar, extreme aspect |
| 21 | `cinematic/hoverboard-dusk-cinematic.gif` (frame 0) | (64, 0, 192, 128) | 128×128 | 64 | 0.00 | Opaque scene, 128 px (excluded from admission) |

The set spans 16–198 px, 2–64 colours, opaque and transparent sprites, 1-bit art, thin features (#13, #18), curves (#19), and extreme aspect (#20). Alternative crops within the same files:

- the panda emoji `(48, 0, 64, 16)`
- the treasure chest `(128, 224, 160, 256)` in the inventory sheet
- the void-implosion sprite `(0, 0, 32, 32)` (43 colours)
- the hexagon UI frame `(304, 284, 385, 375)`

Avoid the ornate UI ring at `(474, 271, 580, 377)`: its box includes a sliver of the neighbouring triangle.

### 3.3 Supplementary Ground Truth (Local-Only, Gitignored)

Four owner-provided private sprites, provenance unrecorded, usable only on a local machine. All are native 1:1 with binary alpha. Tracked test code refers to them only by opaque path (`.local/samples/<id>.png`); no original filename or folder is tracked. Like §3.4, they are nonredistributable local evaluation references (methodology §3.2): no pixels in reports, never required by CI.

| ID | Crop box | Size | Colours | Notes |
|---|---|---|---|---|
| `local-portrait` | none | 128×128 | 42 | Opaque sprite on a dark background |
| `local-creature` | (37, 31, 88, 92) content box | 124×124 canvas | 60 | Sprite, 88 % transparent canvas |
| `local-building` | (36, 22, 92, 112) content box | 128×128 canvas | 25 | Sprite with flat shading |
| `local-tileset` | none | 128×128 | 38 | Opaque tileset |

An external CC0 option is the Krea 2 16×16 icon dataset (550 sprites). Its `images/` files are NN-upscaled after snapping, so they serve as extra 16×16 ground truth, not as real pseudo-pixel samples [observed-in-source]. It is AI output, so it too needs a methodology §3.2 admission record before any corpus use.

### 3.4 Genuine AI HD Pseudo-Pixel Images Present Locally (Gitignored)

Tracked test code refers to them only by opaque path (`.local/samples/<id>.png`); no original filename or folder is tracked. These are nonredistributable local evaluation references (methodology §3.2): no pixels in reports, never required by CI, and not admitted to any corpus.

| ID | Size | Provenance (file metadata claims, signature not checked) | Use |
|---|---|---|---|
| `gpt-forest` | 1672×941 RGB | C2PA: OpenAI, `gpt-image` v2.0 | Real scene; strongest texture and mixels |
| `gpt-oni` | 1254×1254 RGB | C2PA: OpenAI, `gpt-image` v2.0 | Real character; anisotropic, drifting grid |
| `gemini-mage` | 2048×2048 RGBA (opaque) | C2PA: Google Generative AI, resized | Real character; 2× platform resize |
| `unk-dungeon` | 1280×960 RGB | Owner-provided, provenance unrecorded, no metadata | Real scene with heavy blur; a local PixelLab output for it is not a reference, ground truth, or competitor capture (§1.1). |
| `unk-coat` | 934×934 RGB | Owner-provided, provenance unrecorded, no metadata | Real JPEG-blocked sample |
| `ai-wizard` | 1024×1024 RGBA (opaque) | Owner-provided, provenance unrecorded, no metadata | Case B negative control (not pixel art) |

None of these files has a ground truth. They are for qualitative checks and for validating the gate and calibration, and they stay gitignored.

## 4. Real-Sample Sourcing Plan (Do Not Download Until Approved)

Download permission has not been granted. This section is a plan only: nothing in it was downloaded, and all measurements in this document come from the local samples in §1.1 and §3.4.

Sizes are repository byte counts from the GitHub tree API or listed dimensions; "n/s" means not stated. Pixel dimensions are given only where a source states them. If downloads are approved, store files under the gitignored `.local/` folder with a manifest that records the URL, licence, and SHA-256, and never commit them.

| # | Source | URL | File | Approx. size | Generator (as stated) | Licence or terms |
|---|---|---|---|---|---|---|
| 1 | proper-pixel-art | <https://github.com/KennethJAllen/proper-pixel-art/blob/main/assets/bat/bat.png> | `bat.png` | 227 KB | GPT-4o | MIT (repository) |
| 2 | proper-pixel-art | <https://github.com/KennethJAllen/proper-pixel-art/blob/main/assets/demon/demon.png> | `demon.png` | 483 KB | GPT-4o | MIT (excluded from admission) |
| 3 | proper-pixel-art | <https://github.com/KennethJAllen/proper-pixel-art/blob/main/assets/blob/blob.png> | `blob.png` | 256 KB | GPT-4o (noisy, imperfect transparency) | MIT (excluded from admission) |
| 4 | proper-pixel-art | <https://github.com/KennethJAllen/proper-pixel-art/blob/main/assets/mountain/mountain.png> | `mountain.png` | 773 KB | GPT-4o pixelation of `real.jpg` | MIT |
| 5 | proper-pixel-art | <https://github.com/KennethJAllen/proper-pixel-art/blob/main/assets/anchor/anchor.png> | `anchor.png` | 41 KB | n/s | MIT |
| 6 | fast-pixelizer | <https://github.com/handsupmin/fast-pixelizer/blob/main/examples/3.gpt.png> | `3.gpt.png` | 1.69 MB | GPT (1024×1024, about 149 cells) | MIT (LICENSE file) |
| 7 | fast-pixelizer | <https://github.com/handsupmin/fast-pixelizer/blob/main/examples/4.gpt.png> | `4.gpt.png` | 1.67 MB | GPT (about 97 cells) | MIT |
| 8 | fast-pixelizer | <https://github.com/handsupmin/fast-pixelizer/blob/main/examples/1.gemini.png> | `1.gemini.png` | 6.35 MB | Gemini (about 200 cells) | MIT |
| 9 | fast-pixelizer | <https://github.com/handsupmin/fast-pixelizer/blob/main/examples/example-snap-before.png> | `example-snap-before.png` | 356 KB | n/s (README "before") | MIT |
| 10 | MonoPix | <https://github.com/handsupmin/mono-pix/blob/main/src/assets/examples/gpt-image-2.png> | `gpt-image-2.png` | 3.00 MB | GPT Image 2 (1448×1097) | README says MIT; no LICENSE file |
| 11 | MonoPix | <https://github.com/handsupmin/mono-pix/blob/main/src/assets/examples/gemini-nano-banana-2.png> | `gemini-nano-banana-2.png` | 2.43 MB | Gemini Nano Banana 2 | README says MIT; no LICENSE file (excluded from admission) |
| 12 | MonoPix | <https://github.com/handsupmin/mono-pix/blob/main/src/assets/examples/nano-banana-2.png> | `nano-banana-2.png` | 2.11 MB | Nano Banana 2 | README says MIT; no LICENSE file (excluded from admission) |
| 13 | MonoPix | <https://github.com/handsupmin/mono-pix/blob/main/src/assets/examples/midjourney.png> | `midjourney.png` | 1.43 MB | Midjourney | README says MIT; no LICENSE file |
| 14 | MonoPix | <https://github.com/handsupmin/mono-pix/blob/main/src/assets/examples/seedream-4.5.png> | `seedream-4.5.png` | 0.89 MB | Seedream 4.5 | README says MIT; no LICENSE file |
| 15 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/avatar.png> | `avatar.png` | 238 KB | ChatGPT (1024×1024; same bytes as `assets/generated.png`) | Ambiguous: README badge says MIT; the maintainer says MIT applies to open-source/non-commercial use with a separate commercial licence; no LICENSE file |
| 16 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/pig.png> | `pig.png` | 89 KB | n/s ("AI-generated pixel image with extremely fine-grained pixels"; 488×502; a deliberate failure case) | Ambiguous (as #15) |
| 17 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/skull.png> | `skull.png` | 1.09 MB | n/s | Ambiguous |
| 18 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/rika.png> | `rika.png` | 953 KB | n/s | Ambiguous |
| 19 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/car.png> | `car.png` | 473 KB | n/s | Ambiguous |
| 20 | perfectpixel | <https://github.com/theamusing/perfectpixel/blob/main/images/robot.jpeg> | `robot.jpeg` | 117 KB | n/s (JPEG) | Ambiguous |
| 21 | ComfyUI-Unfake-Pixels | <https://github.com/tauraloke/ComfyUI-Unfake-Pixels/blob/main/examples/original.png> | `original.png` | 2.39 MB | n/s | MIT (excluded from admission) |
| 22 | ComfyUI-PixelArt-Detector | <https://github.com/dimtoneff/ComfyUI-PixelArt-Detector/blob/main/examples/Image_Upscaled_00004_.webp> | `Image_Upscaled_00004_.webp` | 41 KB | SDXL + Pixel Art XL workflow (lossy WebP) | MIT |
| 23 | ComfyUI-PixelArt-Detector | <https://github.com/dimtoneff/ComfyUI-PixelArt-Detector/blob/main/examples/Image_00005_.webp> | `Image_00005_.webp` | 30 KB | SDXL + Pixel Art XL workflow (lossy WebP; may be post-processed) | MIT |
| 24 | UmeAiRT FLUX.1-dev Modern Pixel Art LoRA | <https://huggingface.co/UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art/blob/main/images/Flux_00189_.png> | `Flux_00189_.png` | n/s | FLUX.1-dev + LoRA | MIT (model card) |
| 25 | UmeAiRT (as #24) | <https://huggingface.co/UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art/blob/main/images/Depth_00003_.png> | `Depth_00003_.png` | n/s | FLUX.1-dev + LoRA (depth workflow) | MIT |
| 26 | UmeAiRT (as #24) | <https://huggingface.co/UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art/blob/main/images/89af1674-e4df-489a-8a5f-07626fc10b1e.jpeg> | `89af1674-….jpeg` | n/s | FLUX.1-dev + LoRA (JPEG) | MIT |
| 27 | prithivMLmods Retro-Pixel-Flux-LoRA | <https://huggingface.co/prithivMLmods/Retro-Pixel-Flux-LoRA/blob/main/images/RP1.png> | `RP1.png` | n/s | FLUX.1-dev + LoRA | creativeml-openrail-m |
| 28 | prithivMLmods (as #27) | <https://huggingface.co/prithivMLmods/Retro-Pixel-Flux-LoRA/blob/main/images/RP2.png> | `RP2.png` | n/s | FLUX.1-dev + LoRA | creativeml-openrail-m |
| 29 | Shakker-Labs FLUX.1-Kontext Pixel-Style LoRA | <https://huggingface.co/Shakker-Labs/FLUX.1-Kontext-dev-LoRA-Pixel-Style/blob/main/images/example1.png> | `example1.png` | n/s | FLUX.1-Kontext-dev + LoRA (image-to-image) | FLUX.1-dev non-commercial licence |
| 30 | Kontext-Style Pixel_lora | <https://huggingface.co/Kontext-Style/Pixel_lora/blob/main/example-1.png> | `example-1.png` | n/s | FLUX.1-Kontext-dev + LoRA | `LICENSE.md` present, terms not verified |
| 31 | unfake.py README | <https://github.com/user-attachments/assets/f48d09a6-991e-4c51-b881-f75ddfc45e86> | comparison grid | 4156×1054 | Pixel Art XL / FLUX pixel LoRA examples (first panel is the original) | Repository MIT; image hosted as a GitHub attachment; crop the first panel |
| 32 | unfake.py README | <https://github.com/user-attachments/assets/9f37e1f7-68aa-4173-90d7-1fbfbcad5895> | comparison grid | 7212×2328 | As #31 | As #31 |
| 33 | fixelart tests | <https://github.com/golota60/fixelart/blob/master/tests/assets/test-face.png> | `test-face.png` | 460 KB | Midjourney v5 (1024×1024) | No licence (all rights reserved); view only or ask the author |
| 34 | fixelart tests | <https://github.com/golota60/fixelart/blob/master/tests/assets/test1.png> | `test1.png` | 394 KB | Midjourney (version n/s) | No licence |
| 35 | Pixel Snapper issue #7 | <https://github.com/user-attachments/assets/3f118410-4767-4ea8-849e-74655c68a24c> | issue attachment | 1024×1024 | Nano Banana multi-sprite sheet | No licence; GitHub terms only; qualitative viewing only |
| 36 | Pixel Snapper issue #1 | <https://github.com/user-attachments/assets/7ce40712-cfb3-4ff6-888b-3d02bb4e7abf> | issue attachment | 256×256 | Nano Banana | No licence; GitHub terms only |
| 37 | PythonPixelArtTransformer | <https://github.com/Zero-AI-Hub/PythonPixelArtTransformer/blob/main/examples/mask_original.jpg> | `mask_original.jpg` | 66 KB | n/s (README: AI "fake pixel art") | MIT |

Coverage (37 candidates): GPT/OpenAI 8 (#1–4, 6, 7, 10, 15), Gemini/Nano Banana 5 (#8, 11, 12, 35, 36), Midjourney 3 (#13, 33, 34), Seedream 1 (#14), SD/SDXL/Flux 11 (#22–32), and generator not stated 9 (#5, 9, 16–21, 37).

Negative controls (illustrations with no grid): PixelOE's `img/house.webp` (514 KB) and `img/horse-girl.webp` (1.13 MB), Apache-2.0, at <https://github.com/KohakuBlueleaf/PixelOE>.

Excluded:

- proper-pixel-art's `ash.png` and `pumpkin.png`, which are screenshots of Pokémon and Stardew Valley assets (third-party IP).
- Pixel Snapper's `static/hero.png` and `details.png`, and unfake.js's `demo-pixel.png`, which are before/after composites with little test value.
- MonoPix's `docs/4.snap-before.png`, which has the same byte size as #9 and is likely a duplicate.

Gaps:

- **Grok / xAI:** no verifiable, licensed sample was found. CC0 asset-store listings did not state the generator.
- **Gemini sizes:** no sample at Gemini 2.5 Flash Image's native 16:9 size (1344×768, [unverified]) was found.
- **Midjourney:** no Midjourney sample with a clear open licence was found.
- **Workaround:** if needed, the owner can generate a small set from their own accounts, where providers' terms generally assign outputs to the user [unverified per provider], and record the C2PA provenance as in §3.4.

Licensing caveats:

1. A repository licence covers what the repository owner can license. Purely AI-generated images may carry limited or no copyright in some jurisdictions, and generator terms vary [unverified]. Treat every external sample as test data, not as redistributable content. A repository licence does not license each asset (methodology §2.9, §3.1); no-licence, ambiguous and GitHub-attachment files are excluded from any corpus, not only from commits.
2. Files with no licence (#33–36) and non-commercial or ambiguous terms (#15–20, #29) are for internal qualitative testing only. Never bundle them in the app or commit them.
3. GitHub `user-attachments` URLs are governed by GitHub's terms, not the repository licence.
4. Even permissive samples (MIT, CC0, Apache-2.0) should stay in `.local/` until the owner decides on redistribution and the asset passes methodology §3.1–§3.3 intake. Record attribution in the manifest.

## Sources

Local files (measured by this review; paths in §3):

- PixelLab Pip `docs/showcase/` at `b590d66` (external, [CC0 1.0](https://github.com/Shilo/pixellab-pip/blob/b590d6624627453a196e3e513738700e27429d46/docs/showcase/LICENSE.md) dedication; local copy only) and the gitignored private samples listed by ID in §3.3 and §3.4.
- [AI-image downscale / grid-recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md).

Tools and repositories:

- Sprite Fusion Pixel Snapper — README and issues #1, #7, #9: <https://github.com/Hugo-Dz/spritefusion-pixel-snapper>, <https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/1>, <https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/7>, <https://github.com/Hugo-Dz/spritefusion-pixel-snapper/issues/9>
- unfake.js: <https://github.com/jenissimo/unfake.js>
- unfake.py: <https://github.com/painebenjamin/unfake.py>
- proper-pixel-art (README, assets, PR #64 diagnostics): <https://github.com/KennethJAllen/proper-pixel-art>, <https://github.com/KennethJAllen/proper-pixel-art/pull/64>
- perfectpixel (README, issues #3 and #12): <https://github.com/theamusing/perfectpixel>, <https://github.com/theamusing/perfectpixel/issues/3>, <https://github.com/theamusing/perfectpixel/issues/12>
- Astropulse pixeldetector: <https://github.com/Astropulse/pixeldetector>
- ComfyUI-PixelArt-Detector: <https://github.com/dimtoneff/ComfyUI-PixelArt-Detector>
- ComfyUI-Unfake-Pixels: <https://github.com/tauraloke/ComfyUI-Unfake-Pixels>
- MonoPix: <https://github.com/handsupmin/mono-pix>
- fast-pixelizer (README, `scripts/snap-quality/synthetic.mjs`, `docs/2026-06-08-snap-quality-eval.md`): <https://github.com/handsupmin/fast-pixelizer>
- TachiSnap: <https://github.com/tachikomared/TachiSnap>
- fixelart: <https://github.com/golota60/fixelart>
- PythonPixelArtTransformer: <https://github.com/Zero-AI-Hub/PythonPixelArtTransformer>
- PixelOE: <https://github.com/KohakuBlueleaf/PixelOE>

Model cards and datasets:

- Pixel Art XL: <https://huggingface.co/nerijs/pixel-art-xl>
- Pixel icon LoRA (SDXL): <https://huggingface.co/lizozom/pixel-icon-lora-sdxl>
- FLUX.1-dev Modern Pixel Art LoRA: <https://huggingface.co/UmeAiRT/FLUX.1-dev-LoRA-Modern_Pixel_art>
- Retro-Pixel-Flux-LoRA: <https://huggingface.co/prithivMLmods/Retro-Pixel-Flux-LoRA>
- FLUX.1-Kontext Pixel-Style LoRA: <https://huggingface.co/Shakker-Labs/FLUX.1-Kontext-dev-LoRA-Pixel-Style>
- Kontext-Style Pixel_lora: <https://huggingface.co/Kontext-Style/Pixel_lora>
- Krea 2 pixel-art 16×16 synthetic dataset: <https://huggingface.co/datasets/Angais/krea-2-pixelart-16x16-synthetic>
- PixelParti128: <https://huggingface.co/datasets/nerijs/pixelparti-128-v0.1>
- DiffusionDB pixel-art subset: <https://huggingface.co/datasets/jainr3/diffusiondb-pixelart>

Articles, forums, and vendor pages:

- Rangy, "AI Pixel Art: Why It Isn't Really Pixel Art" (vendor): <https://rangy.ai/blog/ai-pixel-art>
- jenissimo, "How to tame your AI pixel art": <https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5>
- golota60, "Fixing AI-generated pixelart": <https://dev.to/golota60/fixing-ai-generated-pixelart-32mg>, <https://szymon.codes/blog/fixing-ai-pixelart>
- SpriteCook Nano Banana pixel art (vendor): <https://www.spritecook.ai/blog/nanobanana-pixel-art-for-games>
- SpriteCook pixel grid detector (vendor): <https://spritecook.ai/pixel-grid-detector>
- "The grid never lies" (community guide): <https://discover.oreateai.com/discover/the-grid-never-lies-how-to-spot-ai-in-pixel-art-and-digital-sprites>
- GIGAZINE on Pixel Snapper: <https://www.gigazine.net/gsc_news/en/20260516-spritefusion-pixel-snapper>
- OpenAI developer forum, transparent backgrounds in ChatGPT images: <https://community.openai.com/t/having-trouble-getting-transparent-backgrounds-in-chatgpt-images/1380143/2>
- OpenAI developer forum, GPT-Image-2 transparent-background preview: <https://community.openai.com/t/transparent-backgrounds-are-now-available-in-preview-for-gpt-image-2-in-the-api/1391541>
- Fake checkerboard detection guide (third party): <https://blog.laozhang.ai/en/posts/gpt-image-transparent-background-checkerboard>
- gpt-image-2 size constraints (third-party docs): <https://docs.leonardo.ai/v1.0/docs/gpt-image-2>, <https://docs.apiyi.com/en/news/gpt-image-2-launch>
- Google Gemini image generation docs (SynthID, resolution tiers): <https://ai.google.dev/gemini-api/docs/image-generation>
- Gemini 2.5 Flash Image aspect ratios: <https://developers.googleblog.com/gemini-2-5-flash-image-now-ready-for-production-with-new-aspect-ratios/>
- r/PixelArt discussion of AI tells: <https://www.reddit.com/r/PixelArt/comments/1k26vck/i_dont_use_ai/mo94hc7/?context=3>
