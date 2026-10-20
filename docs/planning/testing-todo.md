# Algorithm testing to-do

Last reviewed: 2026-10-19.

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
- [ ] [Human] Create the folders `.local/live/` (inputs), `.local/live-out/` (outputs) and `.local/live-tests.md` (results log, template at the end).
- [ ] [Human] Confirm the baseline works: `cd prototype && npm test` passes with 0 failures.

## 2. Collect live AI images

Name each file by opaque ID only (`live-001.png`, …) and record its generator and category in the log.

For each generator below, collect at least one image in each category, about 10–15 images per generator.

- [ ] [Human] **ChatGPT / GPT Image:** download the original PNG (do not screenshot).
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
- [ ] Non-square request, for example "48x32 pixel art".
- [ ] A clearly non-pixel painting (negative control). It should be reported as no grid and converted approximately.

## 3. Run every image

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
  - Count the pixels that differ from the original.
  - Expect a near-exact match.
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

Each item is linked to the open questions in the [design](prototype-algorithm-design.md#open-questions-and-next-experiments) and the [session findings](session-findings-2026-10-19.md#recommended-next-steps). For every behaviour change, add a Deviations row with evidence.

- [ ] [Agent] Add `scripts/score.mjs <output.png> [source.png]`.
  - It prints the hard checks and the intrinsic metrics already in `test/metrics.js` (Q3, Q4, Q7, Q13, plus size and alpha), so the human scores are backed by numbers.
  - Optionally show the same numbers in the UI report.
- [ ] [Agent] Add `scripts/live-batch.mjs`.
  - It converts every image in `.local/live/` at its suggested size and the standard target list, writes the outputs and a contact sheet to `.local/live-out/`, and logs the hashes.
  - This makes §3 one command, with the human doing only the scoring.
- [ ] [Agent] **Smooth-upscale detection (highest priority, 2026-10-20 browser check).** Bilinear upscales of true pixel art are not recognised as gridded: 7 of 8 local PixelLab round trips were classed `none`, and the eighth only `weak` on a wrong lattice, giving 0–89 % exact. Nearest-neighbour upscales were 100 % exact in 7 of 8.
  - Add the second-difference channel: a bilinear upscale has kinks at cell centres, not edges.
  - First add a committed procedural plain-bilinear ×8 fixture that fails today. The synthetic `nonint-bilinear` preset has sharper edges and does not reproduce the miss.
- [ ] [Agent] **Mixel stratum:** the engine loses to a plain nearest baseline (0.78 against 0.84).
  - Investigate the trimmed-mean colour estimate (D18), the inset size and palette merging.
  - Accept a change only if it beats nearest on M without regressing strata G, I or B.
- [ ] [Agent] **Other detection misses:** `bicubic-x8`, the non-integer 1-bit case, and a fractional nearest-neighbour upscale of a local building sprite all fall to the raster route.
  - Try a calibrated grid / mixel / no-grid confidence (a-contrario test, run-length cross-check).
  - Make `route: 'auto'` agree with the candidate recommendation for weak grids.
- [ ] [Agent] **Recommendation on large reductions.** On real samples, Smooth beat the recommended Clean for scenes at strong reductions (`unk-dungeon` 64×48 flattened the floor texture; `gpt-forest` 96×54 broke the title text), while Clean was best for `gemini-mage` at 32×32. Decide the recommendation from evidence (ratio, texture, subject) instead of grid class alone.
- [ ] [Agent] **Clean over-darkens thin light features.** The outline rebuild turned `gemini-mage`'s silver staff solid black. Restrict the rebuild to the real outer silhouette and keep interior thin features in their own colour.
- [ ] [Agent] **Eyes lost at 32 px and below.** `unk-coat` Clean at 32×32 and both coats at 24×24 and 16×16 lost the eyes. Protect small high-contrast facial features in the reduction, as G8 measures.
- [ ] [Agent] **Sprite workflow is hidden.** With the defaults (background and Trim off), a sprite on a plain background stays small inside the canvas and degrades at small targets. With background `auto` and Trim on, 64/48/32 px results were clearly better. Surface this in the UI as one visible option, without changing engine defaults (`AUTO-007`). Also fix the "grid grid" wording in the detected-size hint.
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
