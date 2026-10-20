# Algorithm testing to-do

Last reviewed: 2026-10-20.

Purpose: one checklist for proving that the [prototype](../../prototype/README.md) turns any AI-generated "pixel art" into crisp, proper pixel art at the exact requested size: no mixels, unwanted artifacts, jagged lines, orphan pixels, poor shading or broken silhouettes. Items marked **[Human]** are for the owner, using live images from ChatGPT/GPT Image, Gemini, PixelLab and other generators. Items marked **[Agent]** are algorithm and tooling work for coding agents. Thresholds are PROVISIONAL until calibrated under the [benchmark methodology](../research-spikes/evaluation/benchmark-methodology.md); the metric definitions are in [pixel-art quality metrics](../research-spikes/evaluation/pixel-art-quality-metrics.md).

Rights and privacy: live AI images and their outputs stay in the gitignored `.local/` folder under opaque IDs (`live-001`, `live-002`, …). Do not commit them, their prompts or account details; generator output terms are not rights-cleared for this public repository. Results enter tracked docs only as aggregate, labelled "OBSERVED, local-only, not rights-cleared".

## Definition of "acceptable"

An output **fails** on any of these hard checks:

- Wrong size: output is not exactly the requested W×H.
- Semi-transparent pixels: alpha is not binary (only 0 or 255).
- Mixels (Q13): a visible upscaled block or duplicated row/column inside the output.
- Palette over cap: more colours than requested, when a count was set.
- Non-deterministic: converting the same file with the same options twice gives a different canonical hash.
- Missing feature: a subject element obvious in the source (eyes, outline, weapon, hand, text stroke) is absent or cut in two.

If there is no hard fail, score the **recommended** candidate 1–5 on each criterion below:

| Criterion | 5 means | Related metric |
|---|---|---|
| Silhouette | Shape reads instantly at 1×; no ragged or bitten edges | Q11, G7 |
| Outline | Continuous, one consistent pixel thick where the art has an outline | Q11, Q7 |
| Clean regions | Flat colour areas with no speckle or orphan pixels | Q4, Q5 |
| Line quality | Diagonals and curves step regularly; no jaggies or L-corner doubles | Q6, Q7 |
| Shading | Clear ramps; no banding, pillow shading or muddy blends | Q8, Q9, Q10 |
| Palette | Small, coherent colours with no near-duplicates | Q3 |
| Readability | Face, eyes, key details still read at the target size | Q14, G8 |
| Faithfulness | Recognisably the same subject, pose and colours as the source | S3 |

**Pass:** no hard fail, and every criterion ≥ 4. **Usable with one click:** the recommended candidate fails, but another candidate (grid, clean or smooth) passes; record which.

**v1 target (PROVISIONAL):** at least 80 % of live images pass at targets of 32 px and above, at least 60 % at 16–24 px, and every failure has a recorded failure mode.

## 1. Setup

- [ ] [Human] Install and start the prototype: `cd prototype && npm install && npm run dev`, then open the printed local URL.
- [ ] [Human] Create the folder `.local/live/` for input images. `node scripts/live-batch.mjs` (run from `prototype/`) creates `.local/live-out/` with outputs, one contact sheet per image and a pre-filled `results-log.md`.
- [ ] [Human] Confirm the baseline works: `cd prototype && npm test` passes with 0 failures.

## 2. Collect live AI images

Name each file by opaque ID only (`live-001.png`, …) and record its generator and category in the log.

For each generator below, collect at least one image in each category, about 10–15 images per generator.

- [ ] [Human] **ChatGPT / GPT Image:** download the original PNG (do not screenshot). If you have API access, also request a few with a transparent background: GPT Image API output can now be truly transparent, probably with soft edges, which no local sample covers yet.
- [ ] [Human] **Gemini (Nano Banana):** download the original.
- [ ] [Human] **PixelLab:** download the original. PixelLab output is usually true pixel art already; use it for the round-trip checks in §6.
- [ ] [Human] **Grok, Midjourney, Flux / Stable Diffusion** (optional): these are the generators with no sample yet.
- [ ] [Human] **Re-saved copy:** for 3 images per generator, also save a screenshot or JPEG re-save, so metadata is stripped and JPEG artifacts are present.

Categories, with prompts written as a typical user would:

- [ ] Single character sprite, "32x32 pixel art" requested, plain background.
- [ ] Single character sprite, "64x64 pixel art, transparent background". Many generators paint a fake checkerboard; keep it.
- [ ] Item or icon, "16x16 pixel art icon".
- [ ] Sprite sheet or multiple objects in one image.
- [ ] Tile or tileset, "seamless 32x32 pixel art tile".
- [ ] Scene or background, "pixel art landscape, 320x180".
- [ ] UI element or text, for example a pixel-art button or logo with letters.
- [ ] 1-bit or limited palette, for example "1-bit pixel art" or "4-colour Game Boy palette".
- [ ] Art with dithering, glow, soft shadows or gradient shading.
- [ ] Very small details: thin weapon, antennae, sparks, eyes.
- [ ] Pixel art that was smoothly upscaled (bilinear or bicubic), for example a sprite re-posted at a larger size or resized in an editor without nearest-neighbour. Note the original size if known.
- [ ] Non-square request, for example "48x32 pixel art".
- [ ] A clearly non-pixel painting (negative control). It should be reported as no grid and converted approximately.

## 3. Run every image

Fast path: put the images in `.local/live/` and run `cd prototype && node scripts/live-batch.mjs`. It converts each image at its suggested size and at 64, 48, 32 and 16 px, in two option sets (engine defaults, and "sprite" = background auto + Trim). It scores every candidate with the hard checks, verifies the recommended output repeats byte-for-byte, and writes contact sheets plus `results-log.md` with the automatic flags filled in. You then score the rubric columns from the sheets. Use the browser steps below for anything the batch does not cover (non-square sizes, colour caps, key-colour background, manual period). Score any single output with `node scripts/score.mjs <file.png> --target WxH [--colors N]`.

Do these steps for each image.

- [ ] [Human] Load the image. Before entering a size, note what the report shows:
  - grid class and confidence;
  - suggested size;
  - ambiguity;
  - generator guess (labelled "file metadata claims").
- [ ] [Human] Click "Use detected size" and convert. Native-size output should be the cleanest: score it.
- [ ] [Human] Convert at the size you originally asked the generator for, for example 32×32. This is the main test.
- [ ] [Human] Also convert at:
  - 64×64, 48×48, 32×32 and 16×16;
  - one non-square size, for example 48×32;
  - for scenes, 160×90 and 320×180.
- [ ] [Human] For each conversion, compare the grid, clean and smooth candidates.
  - Record the recommended candidate and the best candidate.
  - Note whether they differ.
  - Check "Grid used" for extra evidence lines: "smooth-upscale fallback", "cell deconvolution" and "octave lock" show which new path ran. Note them in the log when an output looks wrong.
- [ ] [Human] For sprites on a plain or checkerboard background, tick "sprite on a plain background" (background auto + Trim in one click) and compare against the defaults. Record whether the shortcut helps.
- [ ] [Human] Under Custom, try each of these once per image:
  - Trim on with fit contain;
  - background auto, on images with a plain or checkerboard background;
  - colours 8 and 16;
  - route raster versus grid.
- [ ] [Human] Download the chosen output and its ×N upscale into `.local/live-out/` as `live-001-32x32-clean.png`, and so on.
- [ ] [Human] Score each output with the hard checks and the rubric, and log it.

## 4. Edge cases

- [ ] [Human] A JPEG or screenshot of a gridded image: are JPEG block artifacts mistaken for the grid? Check the grid evidence lines.
- [ ] [Human] An image with a visible generator watermark: is the corner masked from analysis and left unaltered?
- [ ] [Human] A painted checkerboard "transparent" background: is it removed with background auto, without eating white or grey subject parts?
- [ ] [Human] A sprite touching the image border: background auto should refuse, with the reason shown.
- [ ] [Human] A 256×256 input and a 2048×2048 input: both convert in a few seconds, and nothing is cut off.
- [ ] [Human] A huge target such as 1024, or an input over 16.7 MP: expect a clear typed error, not a hang.
- [ ] [Human] An empty or fully transparent image with Trim on: expect "empty-visible-region".
- [ ] [Human] An animated GIF/WebP: expect a first-frame warning.
- [ ] [Human] A phone photo with EXIF rotation, saved as JPEG: is the output upright?

## 5. Determinism

- [ ] [Human] Convert the same file twice with the same options: the canonical hash is identical.
- [ ] [Human] Convert the same file in Chrome, Firefox and Safari (and Edge if available): record the hashes. Any difference is a bug; report it with the browser versions.
- [ ] [Human] Convert a PNG and its re-saved JPEG: the outputs may differ, but both should pass.

## 6. PixelLab round trips (ground truth)

PixelLab outputs true pixel art at a chosen size, so it can serve as known-good ground truth.

- [ ] [Human] Generate a native 32×32 or 64×64 sprite in PixelLab. Make a 1024×1024 copy with nearest-neighbour scaling, for example in Aseprite or an image editor.
  - Converting it back at the original size must reproduce the sprite exactly (G-EXACT).
- [ ] [Human] Make the same 1024×1024 copy with bilinear or bicubic scaling, and convert it back.
  - The report should show "smooth-upscale fallback" and the native size.
  - Count the pixels that differ from the original. Expect most pixels within a small colour error (about 95 % or more within 12/255 on the local round trips), not an exact match: close true colours are still merged by the palette stage.
  - Also try a small factor such as ×3. It is below the method's floor and may get worse, which is a known limitation.
- [ ] [Human] Give the PixelLab sprite to ChatGPT or Gemini as a reference, and ask for "this exact character as HD pixel art".
  - Convert the HD result at the sprite's size.
  - Compare the output with the PixelLab original (closeness, not exactness).
- [ ] [Human] Keep PixelLab comparisons private. Never publish one tool's output scored against another's: methodology §12 requires recorded capture conditions.

## 7. Report back

- [ ] [Human] After each batch of about 20 images, tell the agent:
  - the path `.local/live-tests.md`;
  - the five worst outputs (IDs and sizes);
  - the most common failure mode.
- [ ] [Human] Mark failing images that should become permanent local regression cases.

## 8. Algorithm work

Each item is linked to the open questions in the [design](prototype-algorithm-design.md#open-questions-and-next-experiments) and the [session findings](session-findings-2026-10-20.md#ranked-next-steps). For every behaviour change, add a Deviations row with evidence.

- [x] [Agent] `scripts/score.mjs <output.png> [--target WxH] [--colors N] [--json]` (2026-10-20). It prints the hard checks (size, binary alpha, mixels via Q13, palette cap) and the intrinsic metrics from `test/metrics.js` (colours, near-duplicates, orphans by class, L-corner doubles, islands, pinholes). Thresholds are the provisional defaults. The noise-orphan flag fires on most real native outputs, so calibrate it against the live rubric scores. Not done: source-referenced faithfulness and showing the numbers in the UI.
- [x] [Agent] `scripts/live-batch.mjs` (2026-10-20). It covers §3 in one command, including the determinism check (3 local samples × 2 modes × 5 sizes in about 26 s).
- [ ] [Agent] **Calibrate the automatic flags** once the first live batch has rubric scores: set the noise-orphan and L-corner ceilings from outputs the human rated 4 or higher.
- [x] [Agent] **Smooth-upscale detection** (2026-10-20; design D37–D41). Committed smooth-upscale fixtures and gate G-SMOOTH, a second-difference fallback, and cell deconvolution on its lattices. Local PixelLab bilinear round trips: lattice found in 8 of 8 (was 1 of 8), and after deconvolution a median 97.3 % of opaque pixels within 12/255. See [test results](../reviews/prototype-v1-test-results.md#2026-10-20-round).
- [x] [Agent] **Mixel stratum: find the cause** (2026-10-20; D46). Forcing true lattices left M unchanged, and centre-weighted colour estimators scored lower, so the gap to the nearest baseline is palette merging, not the cell estimate. The fix is the palette item below.
- [ ] [Agent] **Palette fidelity (top priority).** The Ward merge (τ_merge 0.045) collapses true colours: `local-tileset` 38 → 7 colours after a smooth upscale, and the palette stage costs 0.12–0.17 on clean smooth presets. Every τ_merge change failed the defect ratchet (speckle, near-duplicate doubles) even though colour match rose (D46).
  - Ideas: emit the observed or medoid source RGB for non-pure cells; merge only spatially intermixed pairs; a two-sided gate.
  - Accept only if stratum M closes the gap to nearest, the defect ratchet holds, and real native palettes stay within +20 %.
- [ ] [Agent] **Blurred-art recommendation discriminator.** On heavily blurred pixel art (NN ×8, edge blur σ 3) the fallback fires and the recommendation flips from smooth to clean: 14 of 39 cases worse (means −0.01 to −0.04). Hypothesis: use the kernel-fit residual from `fitcells.js` to choose smooth versus clean.
- [ ] [Agent] **Bilinear ×3 scale floor.** The fallback regresses at ×3 (`local-portrait` within-12 94.4 → 85.5 %). Find the floor (by period or ramp share) below which the fallback must not fire.
- [ ] [Agent] **Wrong first-difference lattice on `proc-ui` ×4.** It blocks the fallback (the D39 replacement rule does not trigger).
- [ ] [Agent] **Seamless veto on gradient art.** Check whether the D8 step-ratio veto rejects smoothly upscaled gradient-shaded pixel art before the fallback can help.
- [ ] [Agent] **Second-difference profile for `manualPeriod`.** A user-given period currently always locks on first differences.
- [ ] [Agent] **Soft-alpha stratum** for GPT Image transparent output: add a synthetic preset with soft model alpha and test `Binary(128)`, the background stage and Trim on it.
- [ ] [Agent] **Count-constrained DP for `lockGrid`** (Real-PixelArt idea, MIT; [state of the art refresh](../research-spikes/algorithms/state-of-the-art.md#2026-10-20-refresh), idea 3): a DP over the interior cuts that cannot miss the fixed count, for the common `grid-locked` rows.
- [ ] [Agent] **Chance-corrected edge support** as a grid-confidence feature (same refresh, idea 1), next to the D8 step ratio, measured on the remaining detection misses.
- [ ] [Agent] **Other detection misses:** the noisy `bicubic-x8` preset (the fallback does not fire on it; the clean bicubic preset is now recovered), the non-integer 1-bit case, and a fractional nearest-neighbour upscale of a local building sprite all fall to the raster route.
  - Try a calibrated grid / mixel / no-grid confidence (a-contrario test, run-length cross-check).
  - Make `route: 'auto'` agree with the candidate recommendation for weak grids.
- [ ] [Agent] **Recommendation on large reductions.** On real samples, Smooth beat the recommended Clean for scenes at strong reductions (`unk-dungeon` 64×48 flattened the floor texture; `gpt-forest` 96×54 broke the title text), while Clean was best for `gemini-mage` at 32×32. Decide the recommendation from evidence (ratio, texture, subject) instead of grid class alone.
- [x] [Agent] **Clean over-darkens thin light features** (2026-10-20; D43). The outline rebuild skips salient ridges on thin protrusions; the `gemini-mage` staff prongs stay light at 32 px (OBSERVED, local-only, not rights-cleared, unblinded), with a few new 1-px artifacts.
- [ ] [Agent] **Eyes lost at 32 px and below.** Partly fixed (2026-10-20; D42): an orphan whose feature covers at least half of its cell is kept, which keeps the eye on `unk-coat` at 48 px. Still open: eyes that straddle output cells (best-cell coverage 0.375 at 24 px, 0.44 at 32 px; two `it.fails` fixtures marked `[open]`). A coverage threshold of 0.3 adds more than 10 % speckle on `gpt-image-like` and `mixel-detail`, so this needs a different rule, measured with G8.
- [x] [Agent] **Sprite workflow is hidden** (2026-10-20; D45). The simple view has a "sprite on a plain background" checkbox (background auto + Trim; engine defaults unchanged, `AUTO-007`), the hint reads "grid class:", and "Grid used" lists the evidence added during conversion.
- [ ] [Agent] **Large reductions (3× or more, e.g. to 16 px):** evaluate PixelOE-style outline expansion and DPID-style weighting on the reduction path.
  - Pass criterion: live 16 px pass rate improves without regressing 32 px and above.
- [ ] [Agent] **Ambiguous exact grids:** implement the owner's decision on `OD-004`: refuse, require an instructed lattice, or offer the candidates.
- [ ] [Agent] **Clean profile safety:** add a components and holes topology guard, and a diff overlay of the pixels Clean changed.
- [ ] [Agent] **Painted checkerboards and white ink:** use the live failures from §4 to fix subject parts that share a checker colour.
- [ ] [Agent] **Sprite sheets:** detect multiple objects with different grids, and either convert them per object or warn.
- [ ] [Agent] **Typed decode errors and colour profiles:** typed codes for decode failures; decide on ICC conversion versus "assumed sRGB".
- [ ] [Agent] **Turn recurring live failures into committed procedural fixtures** that reproduce the failure mode, never the private image itself, so each fix is guarded by a test.

## 9. Owner decisions that unblock testing

- [ ] [Human] Allow agents to download public, licensed sample images for the corpus: see the [sourcing plan](../research-spikes/evaluation/ai-artifact-characterization.md#4-real-sample-sourcing-plan-do-not-download-until-approved).
- [ ] [Human] Decide the ambiguous-grid policy (`OD-004`).
- [ ] [Human] Declare the licence (intended MIT).

## Results log template

Copy this into `.local/live-tests.md`. Add one row per output.

| ID | Generator | Category | Source size | Suggested size | Target | Recommended | Best | Hard fail | Silhouette | Outline | Clean | Lines | Shading | Palette | Readable | Faithful | Pass | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| live-001 | gpt | sprite-32 | 1254×1254 | 126×116 | 32×32 | clean | clean | – | 4 | 5 | 4 | 4 | 4 | 5 | 3 | 4 | no | eyes merge at 32 px |
