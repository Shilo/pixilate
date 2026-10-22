# Retro Diffusion Pixel Art Fixer: product and source audit

**Research snapshot:** 2026-10-19 (hands-on probes from 2026-07-31)  
**Product:** [Retro Diffusion Pixel Art Fixer](https://www.retrodiffusion.ai/tools/pixel-art-fixer/)  
**Repository:** [Retro-Diffusion/pixel-art-fixer](https://github.com/Retro-Diffusion/pixel-art-fixer)  
**Pinned source revision:** [`ef376e57e1c272633ca2dbf5f29ec3fcf6596465`](https://github.com/Retro-Diffusion/pixel-art-fixer/tree/ef376e57e1c272633ca2dbf5f29ec3fcf6596465) (v1.1, 2026-07-15; still `main` HEAD on 2026-10-19)  
**Companion sources:** [pixel-bench at `779cfc25`](https://github.com/Retro-Diffusion/pixel-bench/tree/779cfc2548ac0da5957514e76d77d8f878ecb513) and [api-examples at `5e37712d`](https://github.com/Retro-Diffusion/api-examples/tree/5e37712d0d6c927ba77414c539f2d6c41181ebcc)  
**License:** MIT (fixer and benchmark)  
**Research status:** covers the public repositories, the vendor writeup and API contract, and the bounded 2026-07-31 live-UI probes. The hosted build, the neural engine, and unpublished internals are outside this audit.

## Public comparison and licensing notice

Product and company names may be trademarks of their respective owners. Pixilate is independent and is not affiliated with, endorsed by, or sponsored by Retro Diffusion or Astropulse. This audit evaluates fit against Pixilate's proposed contract, not whether the product is good at its own purpose. License notes are engineering triage, not legal advice. No third-party code, bundle, model, or artwork is incorporated here.

## Evidence vocabulary

- **VERIFIED:** stated in the pinned repository, its writeup (`docs/HOW_IT_WORKS.md`), the vendor's API contract, or the product page. Vendor performance and accuracy figures are labelled **vendor-reported**.
- **CODE-DERIVED:** traced through the pinned source. This revision of the spike makes no new CODE-DERIVED claims. Writeup statements are VERIFIED vendor descriptions, not proof of the code.
- **OBSERVED:** reproduced in the live Standard tool on 2026-07-31 with a named synthetic fixture.
- **INFERRED:** an engineering conclusion that still needs validation.
- **UNKNOWN:** not established by public sources or this pass.

Unless a later date is stated, every **UNKNOWN** remains unresolved as of 2026-10-19.

**Publication boundary:** this report does not inspect, fingerprint, or describe unpublished compiled front-end or WASM assets, network endpoints beyond the vendor's published API contract, or upload mechanics. Implementation claims come from the MIT repositories and vendor documentation. Web claims are limited to the product page and bounded UI/output observations.

## Executive verdict

The Standard engine is the most thoroughly documented open grid-recovery reference in this survey. It is MIT-licensed, and its writeup describes a multi-detector period estimator with explicit harmonic and octave arbitration, JPEG-lattice suppression, and a reconstruction that decides structure and colour separately. It is a strong study, benchmark, and possible adaptation source.

It does not satisfy Pixilate's core contract:

- Output dimensions are inferred, and a manual cell-size override exists only on some surfaces. There is no independent target width and height in the public repository.
- On the 2026-07-31 fixtures, automatic inference missed the true size by one column and asserted a lattice on continuous art that has none.
- Strict repeatability is vendor-described but not independently established.

## Surfaces

| Surface | Finding | Label |
|---|---|---|
| Standard engine (product page) | Free, classical (non-neural) reconstruction, described as running in the browser | VERIFIED vendor-reported |
| Public repository | Python reference implementation plus a Rust core that the README says is "11-24x faster … at 2.5-4x lower memory" | VERIFIED vendor-reported |
| Neural engine | Hosted by the vendor and "trained on real pixel art"; out of scope for Pixilate's deterministic local core | VERIFIED |
| API ([`PIXEL_FIXER.md`](https://github.com/Retro-Diffusion/api-examples/blob/5e37712d0d6c927ba77414c539f2d6c41181ebcc/PIXEL_FIXER.md)) | `/v1/pixel-fixer/standard` and `/v1/pixel-fixer/neural`. Only the neural route accepts optional `width`/`height`. The response is one base64 PNG with no grid metadata | VERIFIED |
| [Aseprite extension](https://astropulse.itch.io/retrodiffusion) | Commercial; its neural operations are hosted | VERIFIED vendor-reported |

**CODE-DERIVED (2026-07-31 landscape audit, same pin):** the repository contains strategies for drift, non-integer cells, JPEG noise, transparency majority, and a manual pixel-size override. That July pass did not record file and line references. The constants below are vendor-writeup statements.

### Input limits

The 2026-07-31 landscape notes recorded a four-megapixel maximum, and a superseded draft recorded 16 MP. Both figures are correct, for different surfaces:

- The repository README states PNG/JPEG, minimum side 16 px, maximum 4 megapixels. **VERIFIED**
- The hosted API contract states decoded input of at least 16×16 and at most 16 megapixels. It also states a base64 request body of at most 900,000 bytes, a response of at most 850,000 bytes, and 10 requests per minute per token. **VERIFIED**

## Detection pipeline (VERIFIED vendor writeup at the pin)

Source: [`docs/HOW_IT_WORKS.md`](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/docs/HOW_IT_WORKS.md). Read through a web-fetch tool with verbatim-quote requests; re-read before porting any constant.

**JPEG lattice suppression.**

- JPEG 8×8 blocks put energy only at multiples of 8 px. A real 4 px art grid puts energy at both 8k and 8k+4.
- When the differential z-score exceeds 5.0, JPEG is assumed present.
- Profile positions within 1 px of a multiple of 8 are then replaced by interpolation.

**Stage 1: three cheap, phase-free detectors** (~1–2 s total in the Python reference).

- **`autocorr`:**
  - The feature includes 0.7 × the absolute first difference of median-filtered, 12-level-rounded luminance.
  - It is summed over bands of 12, 24, and all lines.
- **`runlengths`:**
  - A soft-GCD comb over boundary distances.
  - A comb height S ≥ 0.3 was "always correct" on the vendor's bench; S < 0.1 means no boundary lattice exists.
- **`selfsim`:**
  - Shift self-similarity over gradient-type features.
  - It selects the smallest peak scoring at least max(0.40 × max, 4.0).

**Fast path:** if the three detectors agree on the output size within max(1 cell, 1%), with an aspect check |log((cols/rows)/(w/h))| < 0.35, the result is accepted. Otherwise, the largest aspect-sane group of at least three proposals short-circuits arbitration.

**Stage 2: arbitration** (15–37 s on big images in the Python reference).

- Among candidates scoring at least 0.78 of the best, the **smallest** step wins.
- **Prefer-fine:** if |log(sx/sy)| > 0.45 and the finer step's fused support is at least 0.35, the finer step is used.
- If |log(sx/sy)| < 0.08, both axes snap to their harmonic mean.
- A step above a detail cap is multiplied by 0.35.
- **Drift-aware counting:** at most 8 windows with a ±18% comb re-scan. It is gated at a uniform count of at least 96 cells and an integrated-versus-uniform difference of at least 2.5 cells.

## Reconstruction (VERIFIED vendor writeup at the pin)

- **Lattice:** cell boundaries form an even lattice (`x·cols/w`), with no per-cut snapping.
- **Placement:** an adaptive k-means palette, with K clamped to [16, 48], is "used *only* to decide placement, never for output".
- **Colour:** each cell's colour is a centre-weighted mean of the original, unquantized pixels that carry its winning label.
- **Vendor comparison:** the writeup reports a mean colour error of 4.56 versus 5.51 for its legacy pooling reconstructor (vendor-reported).
- **Palette and dither:** the repository README describes no final palette, colour-count, or dither stage. The product page offers palette and dither controls. Whether those controls exist in the public repository is **UNKNOWN** at this pin.

## Documented failure cases (VERIFIED vendor writeup)

| Case | Writeup description |
|---|---|
| Cottage | Dense "mush" puts a gradient boundary every ~2.6 px on ~8 px pseudo-cells, so no boundary lattice exists |
| Raven | The local vertical pitch measures 6.72–6.73 px while the truth averages 6.542 px; the count is off by ~5 rows |
| Mech | Octave ambiguity from sub-lattice texture; suspected unfixable when both axes carry the sub-lattice |
| Knight sheet | 2.83 px cells barely register |

## Hands-on probes (OBSERVED, 2026-07-31)

These use the synthetic fixtures of the [commercial/web landscape](../landscape/commercial-and-web-tools.md#hands-on-fixture-design).

| Fixture and settings | Result | Interpretation |
|---|---|---|
| Distorted 83×77 grid (truth 8×8), Auto | Reported `9×8 px`, grid `8.79×9.61 px`, 14 colours | Automatic size inference missed by one column |
| Same fixture, manual pixel size 10 | Reported `8×8 px`, nine colours | The manual override recovered the dimensions; the colour count still exceeded the six-colour source |
| Continuous 256×192 illustration, Auto | Reported `17×15 px`, grid `14.82×13.11 px`, 22 colours | A lattice was asserted where none exists; auto-detection needs confidence and refusal |

No repeated-run byte capture was made, so strict determinism remains **UNKNOWN**.

## pixel-bench (VERIFIED methodology; results vendor-reported)

- **Corpus:**
  - The repository ships no image corpus; users supply true 1× pixel art.
  - Suite v1 has 11 distortion categories, including `fractional`, `nonsquare`, `jpeg`, `drift`, `mush`, `painterly`, and `kitchen_sink`.
  - Example results cover 43 distortion types, 100 images, and 4,300 inputs.
- **Metrics:** resolution (`exact`, `within1`, `within5pct`, `rel_err`), colour (ΔE, PSNR), placement (`pixel_match`, and `grid_align` from per-pixel source-coordinate ground truth), and palette (`ncolor_err`, `palette_de`).
- **Results:** published only as charts. They were not reproduced here and are not neutral third-party validation. This spike does not restate per-competitor figures.
- **Caveats:**
  - The "unfake" backend is the third-party `unfake.py` package, not Unfaker/unfake.js. The benchmark's only commit (2026-07-15) also predates unfake.js v1.4.0's fractional grids.
  - "PixelSnapper" is described as a bundled port, not the Rust core.
  - The distortions are synthetic damage applied to true pixel art. Generator outputs whose cells are invented rather than resampled are approximated, not measured.
- **Pixilate relevance (INFERRED):** because Pixilate's user supplies W×H, placement and colour metrics (`grid_align`, `pixel_match`, exact-size ΔE) matter more than `exact`. Source-coordinate ground truth is a strong design for Pixilate's own [benchmark methodology](../evaluation/benchmark-methodology.md).

## Derivative: Pixel Rehab

**VERIFIED vendor-reported (product page, 2026-10-19):** [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html) describes itself as a JavaScript port of the fixer's grid detection and reconstruction, credited "MIT License, © 2026 Astropulse, LLC". It runs in a browser web worker and offers an exact output resolution up to 1024 px or the source size, whichever is smaller. Its source was not audited. It is the only port located that advertises exact output dimensions. Inventory it without double-counting it as independent validation.

## Licensing and reuse

**VERIFIED:** the fixer and pixel-bench are MIT. **INFERRED:** studying, benchmarking, or adapting code is compatible with Pixilate's MIT core if the copyright and licence notice are retained, the exact revision and dependency closure are pinned and audited, and the behaviour is independently re-verified. The hosted neural engine, the product's front end, and the commercial Aseprite extension are not reuse sources.

## Contract differences and Pixilate implications

| Difference | Pixilate response |
|---|---|
| Size is inferred; there is no independent W×H in the repository | Keep exact W×H authoritative; use detected periods only as `suggestedSize` evidence |
| Lattice asserted on continuous art | Report confidence, alternatives, and a no-grid route |
| Even-lattice reconstruction without phase or drift tracking (INFERRED from "even lattice") | Treat phase/drift placement as a separate, testable stage |
| No final palette stage in the public repository | Enforce the palette cap after every colour-producing stage |
| Vendor-only accuracy evidence | Benchmark on Pixilate's own rights-cleared corpus |

## Unresolved questions

1. **UNKNOWN:** Which source commit produced the hosted Standard build? No public build-provenance mapping was found.
2. **UNKNOWN:** Is the Standard engine strictly repeatable across browsers, native, and WASM?
3. **UNKNOWN:** Where are the product page's palette and dither controls implemented?
4. **UNKNOWN:** Do the drift-counting constants in the writeup match the code? They were not re-read in source.
5. **UNKNOWN:** Can the detector be constrained by a requested W×H candidate without changing its arbitration?

## Sources

- [Product page](https://www.retrodiffusion.ai/tools/pixel-art-fixer/)
- [pixel-art-fixer at `ef376e57`](https://github.com/Retro-Diffusion/pixel-art-fixer/tree/ef376e57e1c272633ca2dbf5f29ec3fcf6596465): `README.md`, `docs/HOW_IT_WORKS.md`, `LICENSE`
- [pixel-bench at `779cfc25`](https://github.com/Retro-Diffusion/pixel-bench/tree/779cfc2548ac0da5957514e76d77d8f878ecb513): `README.md`
- [api-examples at `5e37712d`](https://github.com/Retro-Diffusion/api-examples/tree/5e37712d0d6c927ba77414c539f2d6c41181ebcc): `PIXEL_FIXER.md`
- [Retro Diffusion Aseprite extension](https://astropulse.itch.io/retrodiffusion)
- [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html)

## 2026-10-21 refresh

**Access date for every source in this section:** 2026-10-21. Earlier sections are kept as written; where this section corrects or extends them, it governs.

**How the sources were read:**

- A web-fetch tool, with verbatim-quote requests for every constant cited below.
- Nothing was uploaded, no account was used, and no code was downloaded or run.
- The product page is client-rendered, so the fetch returned only its title. Product-page claims below come from the vendor's [`llms.txt`](https://retrodiffusion.ai/llms.txt), its [sitemap](https://retrodiffusion.ai/sitemap.xml) and search-engine snippets of the page, and are labelled accordingly.

### What changed since 2026-10-19

No release, code change or new public description of the Standard engine was found.

| Item | Finding | Label |
|---|---|---|
| [pixel-art-fixer](https://github.com/Retro-Diffusion/pixel-art-fixer) | Still two commits. HEAD is still `ef376e57` (v1.1, 2026-07-15), MIT. There is one open and one closed pull request, both about a peak-memory helper in the Rust build; neither touches detection, size, palette or alpha | VERIFIED (GitHub API) |
| [pixel-bench](https://github.com/Retro-Diffusion/pixel-bench) | Still one commit, `779cfc25`, MIT | VERIFIED (GitHub API) |
| [api-examples](https://github.com/Retro-Diffusion/api-examples) | HEAD still `5e37712d` (2026-10-07). The commits since 2026-09-25 concern other products | VERIFIED (GitHub API) |
| Product page | Sitemap `lastmod` 2026-07-12 | VERIFIED (sitemap) |

### Newly recorded (public before 2026-10-19, not in the earlier sections)

| Item | Finding | Label |
|---|---|---|
| Price | The web tool is "Free, no sign-up, runs in the browser" ([`llms.txt`](https://retrodiffusion.ai/llms.txt)). Fixer API calls "do not spend account balance" ([`PIXEL_FIXER.md` at `5e37712d`](https://github.com/Retro-Diffusion/api-examples/blob/5e37712d0d6c927ba77414c539f2d6c41181ebcc/PIXEL_FIXER.md)). The repository README describes the hosted neural engine as free with no sign-up | VERIFIED vendor-reported |
| Web tool versus API | `PIXEL_FIXER.md` states that the browser tool runs local WASM and sends no image-processing request to the API | VERIFIED vendor-reported |
| API input | A public HTTPS `image_url` is accepted besides base64 (at most three redirects, 20 MB download; private-network targets rejected). Unknown request fields are rejected. Each call is listed in "API Activity", with its output retrievable for 24 hours | VERIFIED |
| [retro-diffusion-mcp](https://github.com/Retro-Diffusion/retro-diffusion-mcp) at `12e66b87` (MIT) | A hosted MCP server documents a free `fix_pixel_art` tool with a standard or a neural engine. Width and height are optional and for the neural engine only. Input is at most **4 MP**, where the API contract states 16 MP | VERIFIED vendor-reported; which limit applies is UNKNOWN |
| Product-page wording | Search snippets of the page say the Standard engine is deterministic and open source and "measures the implied grid and snaps it", and that a pixel size can be forced manually. They say the neural engine reconstructs "detail, palettes, and clean alpha" | VERIFIED vendor-reported (search snippet, not a page read) |
| Palette and dither controls on the web page | Seen in the 2026-07-31 UI probe; could not be re-checked | UNKNOWN whether still present |
| Output palette in the open engine | The writeup says "A final palette-clamp to a clean flat palette is deliberately left as future work", and that the output "keeps every original color on purpose". This answers unresolved question 3 for the repository: there is no output palette stage | VERIFIED (writeup at the pin) |
| Determinism | Neither the README nor the writeup makes a determinism or reproducibility statement; only the product-page snippets say "deterministic" | VERIFIED absence; strict repeatability still UNKNOWN |
| [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html) | Also lists, all in a browser worker: manual columns and rows with "Reset to detected"; a confidence readout, with a low-confidence flag when the detectors disagree; palette reduction; ordered dither; crop presets; WebP input; 2×, 4× and 8× export. No version or date is given | VERIFIED vendor-reported; whether these are new is UNKNOWN |

### Pipeline, step by step (consolidated)

**Sources:** the README and [`docs/HOW_IT_WORKS.md`](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/docs/HOW_IT_WORKS.md) at `ef376e57`. These are VERIFIED vendor descriptions, not traced in code.

1. **Input:** PNG or JPEG, each side at least 16 px, at most 4 MP (repository limits).
2. **Features:**
   - |second difference| of luminance, plus 0.7 × |first difference| of median-filtered, 12-level-quantised luminance.
   - Computed over row bands of 12, 24 and all lines, each power-normalised.
3. **JPEG lattice suppression:** as recorded above (z on 8k against 8k+4, threshold 5.0); the exact statistic is not stated.
4. **Stage 1, four voters:**
   - **`autocorr`:**
     - Comb score: rewards autocorrelation mass at k·s and subtracts anti-comb mass at (k ± 0.5)·s, weighted exp(−k/12).
     - At selection, a subharmonic penalty subtracts 0.5 × the best score over s/2 … s/5.
     - Peak refinement: a parabolic sub-pixel fit, then a robust least-squares fit of peak ≈ k·s.
   - **`runlengths`:**
     - Soft-GCD comb `S(s) = mean_r cos(2π·r/s)`.
     - Peak pick: "the largest peak within 0.70 of the max that has ≥4% run mass at 1·s".
     - S ≥ 0.3 was always correct on the vendor bench; S < 0.1 means no lattice.
   - **`selfsim`:**
     - d(t) = mean |F(x) − F(x+t)|, scored as a comb t-statistic over K harmonics × min(1, (K−1)/3).
     - Selection: the smallest peak with score ≥ max(0.40 × max, 4.0), then a divisor walk.
     - Drift: per-tile votes; a dispersion below 0.015 means uniform.
   - **Fused curve:** the fused curve of Stage 2 is "the fourth voter". The largest aspect-sane group of at least three of the four short-circuits arbitration, with the group median as the counts; "2-of-4 is deliberately not enough".
5. **Candidate pool:**
   - Each method's step plus autocorr's top five, de-duplicated in log space and clamped to (1.2, extent/3).
   - No explicit 2× or ½× candidates are generated.
6. **Stage 2 score:** `fused_at(s) + 0.20·vc_at(s) + 0.25·max(0, agree−1) + 0.6·(recon_at(s)/rmax)`, × 0.35 above the detail cap.
   - **`fused` (core4):** "an equal-weight sum of per-scan max-normalised `{ray_e1, tile_e1, tile_e2, spec_e1}`". `spec_e1` is a Welch power spectrum read at k/step. The tile terms are Rayleigh phase-coherence z-scores on 48–192 px tiles, combined by Stouffer. `ray_e1` is not defined.
   - **`vc` (variance contrast):** `(var_worst − var_best)/(var_best + 0.05·total)`.
   - **`recon` ("distillability"):** `max(er − eb, 0)·max(1 − eb/trend(s), 0)`, used when rmax > 0.005. It is a reconstruction-error test of each candidate step (PCA to two channels plus centred alpha, K = 14).
   - **Detail cap:** the ACF central-peak half-width × 8.
   - **Rules:**
     - The smallest step with at least 0.78 of the best score wins.
     - Prefer-fine applies above 0.45 with `fused_at` ≥ 0.35.
     - Axes within 0.08 snap to their harmonic mean.
     - Cross-axis factor-2/3 promotion is named but not specified.
7. **Drift-aware counting:**
   - Up to eight windows, each re-estimated within ±18 %; cols = Σ widthᵢ/sᵢ.
   - Gated at ≥ 96 uniform cells and |integrated − uniform| ≥ 2.5.
8. **Reconstruction:**
   - Even lattice.
   - Structure palette K = "the coarse (4-bit) color complexity of the opaque pixels, clamped to `[16, 48]`", for placement only.
   - Cell colour: a centre-weighted mean of the un-quantised pixels carrying the winning label; the weighting function is not stated.
   - Transparency is the per-cell majority (README).
9. **Output:**
   - One PNG at the detected size, with no output palette, colour cap, dither, cleanup, outline or background stage in the repository.
   - Detection JSON carries a `consensus` string recording the decision path.
   - The Python CLI has `--extract`, `--overlay` (a grid overlay) and folder batch with `--json`.
   - The Rust binary has `full` and `fast` (cheap detectors only) modes.
10. **Size control:**
    - The Standard engine infers the size.
    - A manual pixel-size override exists on the web UI (OBSERVED 2026-07-31) and, per the July landscape notes, in code.
    - Only the neural API and MCP routes accept width and height.
11. **Generative or not:** Standard is classical, with "no model required" (README). The neural engine is a hosted trained model, outside Pixilate's scope.

**Not in the public material:** outline handling, orphan or jaggy cleanup, background removal, trimming, and alignment to a requested size. These are UNKNOWN for the web build and absent from the repository writeup.

### Fidelity of Pixilate's clean-room reference (`retroDiffusion` in `prototype/test/reference-tools.js`)

The reference was written from the 2026-10-19 sections, which recorded only part of the writeup. Measured against the writeup, it is a **weaker approximation of the Standard detector than its label suggests** (INFERRED). Every "Retro Diffusion ref" number in the [test results](../../reviews/prototype-v1-test-results.md) describes this approximation, not the tool, as those results already state.

| # | Reference behaviour | Writeup at the pin | Kind |
|---|---|---|---|
| R1 | Integer-lag autocorrelation; the smallest local peak ≥ 0.4 max | Comb with anti-comb, exp(−k/12) weights, subharmonic penalty, sub-pixel and least-squares refinement | Wrong assumption. Periods are whole pixels in `autocorr` and `selfsim`, which matters on fractional cells (INFERRED) |
| R2 | Feature 0.7·\|ΔQ\| only | Adds \|second difference\| of luminance | Omission |
| R3 | Tent-tolerance comb max(1, 0.12p), distances < 0.5p ignored, largest peak ≥ 0.85 max; the S < 0.1 gate applied to that [0, 1] score | Cosine comb in [−1, 1]; largest peak within 0.70 of max with ≥ 4 % run mass at 1·s; S thresholds defined on the cosine scale | Wrong assumption. The no-lattice gate is applied on a different scale, which bears on the 0.75 false-grid rate (INFERRED) |
| R4 | `selfsim` = % reduction against the mean over shifts | Comb t-statistic over K harmonics × min(1, (K−1)/3), divisor walk, tile drift votes | Wrong assumption |
| R5 | Three voters; the code comment calls "group of ≥ 3" unreachable | Four voters (the fused curve is the fourth); a 3-of-4 group short-circuits | Omission |
| R6 | Fused support = mean of the three Stage-1 scores | core4 = {ray_e1, tile_e1, tile_e2, spec_e1}, plus 0.20·vc, the agreement bonus and 0.6·distillability | Wrong assumption; most of Stage 2 is missing. `ray_e1` is undefined, so a faithful Stage 2 cannot be rebuilt from the writeup alone |
| R7 | Candidates {p, 2p, p/2} per proposal; lags 2 … min(160, n/4) | Proposals plus autocorr's top five, log-space de-duplication, clamp (1.2, extent/3); no 2× or ½× | Wrong assumption |
| R8 | No detail cap, cross-axis factor-2/3 promotion or drift-aware counting | All three are described | Omission. Drift counting is gated at ≥ 96 cells, so it rarely applies to the bench fixtures (INFERRED) |
| R9 | Structure K = 16 | Adaptive K in [16, 48] | Wrong assumption; measured below as small |
| R10 | No manual pixel-size surface | The web UI and the code have one | Omission in the harness. Target mode compares Pixilate with "detected size + centre-sample adapter", not with what a user who knows W×H could get from the tool |
| R11 | The `compare.mjs` header lists "Retro Diffusion K 16" as a documented palette cap | K is a placement-only structure palette; output colours are uncapped | Documentation error in the harness comment; scoring is unaffected |

These parts are consistent with the writeup: median-filtered 12-level luminance, the JPEG notch at z > 5, the fast-path agreement rule, the 0.78, prefer-fine and harmonic-mean rules, the even lattice, the label-masked centre-weighted mean (tent weights are a stated substitute) and the alpha majority.

### Measured: the reference reconstruction at a user-given size

All numbers here are OBSERVED, local-only and not rights-cleared, because the matrix includes local-only crops and sprites. They are in-sample and exploratory, not a methodology §12 comparison.

**Method:**

- Two gitignored probes re-type the reference's reconstruction block unchanged and drive it at the true W×H instead of its detected size.
- Cases: the same 450 round-5 comparison cases (`--seeds 1`), scored with the `emIn` and common-cap rules of `compare.mjs`.
- Comparators: "Ours" and the detected-size reference are read from the round-5 cache (engine `0.14.0`, recommended candidate).
- Variants:
  - `manual` models the tool's single pixel-size control: cell = w/W, rows = round(h/cell), centre-sample adapted to H when the row count differs.
  - `exact` uses an even W×H lattice.
  - `adaptive K` counts the distinct 4-bit-per-channel opaque colours, clamped to [16, 48] (INFERRED reading; it saturates at 48 on 380 of 450 cases).

**Median `emIn`, all / G / I / M / B.** Wins and losses are against ours at `_kT`, by more than 0.02.

| Method | Common cap `_kT` | Native cap | Wins / losses |
|---|---|---|---|
| Ours (recommended) | **0.978** / 1.000 / **0.960** / 0.835 / **0.860** | **0.976** / 1.000 / **0.956** / 0.835 / 0.831 | — |
| RD ref, detected size + adapter (round 5) | 0.838 / 1.000 / 0.788 / 0.703 / 0.634 | 0.846 / 1.000 / 0.808 / 0.734 / 0.642 | 90 / 223 |
| RD reconstruction, `manual` pixel size, K 16 | 0.911 / 1.000 / 0.908 / 0.809 / 0.772 | 0.935 / 1.000 / 0.932 / 0.823 / 0.801 | 113 / 156 |
| RD reconstruction, `exact` W×H, K 16 | 0.928 / 1.000 / 0.908 / **0.861** / 0.839 | 0.948 / 1.000 / 0.932 / **0.902** / **0.850** | 122 / 137 |
| RD reconstruction, `exact` W×H, adaptive K | 0.925 / 1.000 / 0.909 / 0.846 / 0.832 | 0.944 / 1.000 / 0.939 / 0.874 / 0.852 | 130 / 128 |
| Nearest at W×H (round 5) | 0.916 / 1.000 / 0.904 / 0.782 / 0.756 | 0.929 / 1.000 / 0.938 / 0.792 / 0.781 | — |

**Findings (OBSERVED unless marked):**

1. **The single pixel-size control cannot express every W×H.** It gave the true row count on only 318 of 450 cases, and `manual` trails `exact` by 0.017.
2. **The gap is mostly detection, not reconstruction.** Driven at the true size, the reconstruction moves from 0.838 to 0.928. Most of the round-5 gap between ours and the reference is therefore detection and size, not the cell rule (INFERRED).
3. **Where the RD rule wins, and on what.** On M, `exact` K 16 beats ours: 0.861 against 0.835 at `_kT`, and 0.902 against 0.835 at native cap, where it keeps every colour. The per-preset leads are `jpeg-heavy` (0.940 against 0.885; 13 wins / 3 losses), `gemini-like` (0.900 against 0.873; 16 / 6) and `bicubic-x8-clean` (0.920 against 0.865; 13 / 11). It loses on `nonint-nn` (1 / 16 vs ours), `nonint-bilinear` (1 / 16), `bilinear-x8` (5 / 17) and `bilinear-x8.37` (5 / 17), where an even lattice cannot follow phase or drift.
4. **Count locking (second probe on 270 cases of nine presets).** Ours was run with `manualPeriod = [w/W, h/H]`, background off.
   - **`jpeg-heavy` (colour rule):** ours stays at 0.858, the same as its unlocked `convert`, so the count was already right. The RD rule still leads, 0.940 (12 wins / 2 losses). That lead is the cell-colour rule (global structure labels and a label-masked mean), not the lattice.
   - **`gemini-like` (recommendation):** the single-candidate `convert` gives 0.903, about equal to `exact` (0.900); the recommended candidate gives 0.873. The gap there comes from which candidate is recommended (Clean), not from reconstruction.
   - **Smooth upscales (lock-path regression):** locking the count lowers ours on `bilinear-x8` from 0.937 to 0.436 (29 of 30 cases worse) and on `bicubic-x8-clean` from 0.866 to 0.771. `manualPeriod` goes through `lockGrid` and skips the smooth-upscale (`d2`) fallback. An unexposed engine path that would matter if the override reached users.

### Pixilate coverage of the fixer's capabilities

| Capability | Retro Diffusion Standard (public) | Pixilate (engine `0.14.0`, app) | Evidence |
|---|---|---|---|
| Grid-period detection: fractional, JPEG-aware | Yes; four voters and a Stage-2 evidence stack | Yes; whitened spectrum, octave guard, DP cuts, JPEG 8/16k coherence rule | Round-5 native size-exact rate 0.780 (ours) against 0.233 (reference). The reference is weaker than the tool (R1–R8), so the tool's own rate on these fixtures is UNKNOWN |
| No-grid refusal | Run-length S < 0.1 gate; Pixel Rehab shows a low-confidence flag | Step-ratio gate, class `none`/`weak`, smooth route recommended | No-grid lattice asserted: ours 0 of 4, reference 0.75. The July probe saw the web tool assert one |
| Manual pixel size | Web UI (one value) | Engine `manualPeriod: [px, py]`; **not exposed in the app**; regresses on smooth upscales (above) | `pipeline.js` options; requirements AUTO-008 |
| Exact W×H | Neural API and MCP only | Yes, authoritative (`OWN-006`) | — |
| Structure/colour split | Global structure labels; colour from un-quantised pixels | Per-cell leader clustering, then a trimmed mean (D46). Global labels are open item 6 (`OD-006`, `EX-006`) | Measured above: global labels lead on `jpeg-heavy` at the same count |
| Output palette or cap | None in the repository; web UI palette and dither (2026-07-31; now UNKNOWN) | `colors` auto or a cap, a user `palette`; no dither | — |
| Alpha | Per-cell majority | Binary alpha policy (`OWN-005`); halo and background stages opt-in | — |
| Cleanup, outline, background, trim | Not described | Clean profile (opt-in), D62 outline steps, background stage, Trim | — |
| Decision trace | `consensus` string, `--overlay` | Grid evidence lines and a grid overlay in the app | — |
| Batch | CLI folder, API, MCP | `scripts/live-batch.mjs` (development only); FR-019 deferred to T3 | — |

### Proposals for Pixilate (for owner challenge; nothing implemented)

Ranked by expected benefit over risk. Each states its evidence and its fit with the owner rules: deterministic, client-side, opt-in stages, no recolouring feature, YAGNI.

1. **Make `manualPeriod` route-aware before anything exposes it.**
   - **Evidence:** the count-lock probe (`bilinear-x8` 0.937 → 0.436; `bicubic-x8-clean` 0.866 → 0.771).
   - **Change:** when the period is user-given, run the same `d2` smooth-upscale test and, where it applies, lock on the second-difference profile; or lock the count inside `detectGrid` instead of `lockGrid`.
   - **Benefit:** an override no longer loses to Auto on smooth upscales.
   - **Risk:** low. It is deterministic and client-side, adds no stage, and needs a design-log row.
2. **Expose a grid override in the app: columns × rows, with "Reset to detected".**
   - **Evidence:** the tool's own 2026-07-31 probe, where Auto missed by one column and the manual size recovered 8×8; Pixel Rehab's identical control; requirement AUTO-008; the engine already has the option.
   - **Do it as columns × rows, not one pixel size.** The single-value control reached the true row count on only 318 of 450 cases.
   - **Benefit:** a user recovery path for the roughly 22 % of native-size misses.
   - **Risk:** UI weight, so place it in Details or advanced. It must record the override in the recipe. It depends on proposal 1.
3. **Run `EX-006` (global structure labels before the cell vote) as a bounded experiment, starting with JPEG-heavy inputs.**
   - **Evidence:** at the same locked count on `jpeg-heavy`, the RD rule scored 0.940 against ours 0.858 (12 wins / 2 losses). It led on `bicubic-x8-clean` too.
   - **Benefit:** the M stratum, where ours trails fixed-lattice methods.
   - **Risks:**
     - A global k-means on full-resolution input costs memory and time in the worker.
     - It must stay seeded and deterministic.
     - It is not a recolouring feature, because output colours stay means of source pixels.
     - In-sample evidence only, so it needs held-out seeds.
4. **Check how much the Clean recommendation costs on `gemini-like`.**
   - **Evidence:** 0.903 single-candidate against 0.873 recommended. Not specific to this tool; the probe exposed it.
   - **Risk:** Clean is an owner-decided profile (`OWN-004`), so this is a measurement item, not a default change.
5. **Not proposed:**
   - Output palette or ordered dither: no requirement, and the owner rule excludes recolouring features.
   - Batch: FR-019 is deferred.
   - Distillability or Stage-2 arbitration terms: no measured Pixilate failure that our octave guard misses (YAGNI).
   - A neural engine: generative and server-side.

### Proposed correction of the reference (not applied)

Smallest change first. Each item names the exact change.

1. **`compare.mjs` (R10, R11).**
   - Give `retroDiffusion(img, { manualStep })` a manual surface: when `manualStep` is set, skip detection, set sx = sy = `manualStep`, cols = round(w/step), rows = round(h/step).
   - Add a TARGET entry `['rdManual', 'Retro Diffusion manual pixel size ref ef376e57', (img, tw, th) => R.adapt(R.retroDiffusion(img, { manualStep: img.width / tw }).image, tw, th)]`.
   - Correct the header to say that K 16 is a placement-only structure palette and the output is uncapped.
2. **`runlengths` (R3):**
   - Replace the tent comb with `S(s) = mean over boundary distances r of cos(2π r / s)`.
   - Pick the largest local maximum ≥ 0.70 × max whose run mass at 1·s (the share of distances within ±0.5 px of s; the tolerance is UNKNOWN, so mark it as a substitute) is ≥ 0.04.
   - Keep `S < 0.1 → null` on the cosine scale.
   - Then re-measure the no-grid scenes.
3. **Candidates (R7):** drop the {2p, p/2} expansion; use the proposals plus the five best autocorr peaks, de-duplicated within 2 % in log space (a substitute tolerance), clamped to (1.2, extent/3).
4. **Fourth voter (R5):** add the fused-curve argmax as a proposal, and accept the fast path when at least three of the four agree within max(1 cell, 1 %).
5. **Sub-pixel periods (R1, R2):**
   - Evaluate `autocorr` and `selfsim` at fractional s by interpolation, with a parabolic peak refine.
   - Add |second difference of luminance| to the feature.
   - Apply the subharmonic penalty C(s) − 0.5·max over d = 2…5 of C(s/d).
6. **Labels, not code (R4, R6, R8, R9):** keep these as labelled substitutes in the header's UNKNOWN list. `ray_e1` and the selfsim t-statistic are undefined, and adaptive K showed a small, mixed effect (130 / 128 against ours, against 122 / 137 at K 16). After items 1–5, rename the comparison row "Retro Diffusion ref (partial Stage 2)".

### Unresolved questions, updated

1. Still open: the hosted build's source commit.
2. Still open: repeatability across browser, native and WASM.
3. **Answered for the repository:** there is no output palette stage. Still open for the web page: whether its palette and dither controls still exist, and where they are implemented.
4. Still open: whether the drift constants match the code.
5. Still open: whether the detector can be constrained by a requested W×H.
6. **New:** whether the MCP route's limit is 4 MP or 16 MP.

### Sources (accessed 2026-10-21)

- Vendor site:
  - [`llms.txt`](https://retrodiffusion.ai/llms.txt)
  - [sitemap](https://retrodiffusion.ai/sitemap.xml)
  - [product page](https://retrodiffusion.ai/tools/pixel-art-fixer) (title only)
- GitHub API:
  - [pixel-art-fixer commits](https://api.github.com/repos/Retro-Diffusion/pixel-art-fixer/commits) and [pull requests](https://api.github.com/repos/Retro-Diffusion/pixel-art-fixer/issues?state=all)
  - [pixel-bench commits](https://api.github.com/repos/Retro-Diffusion/pixel-bench/commits)
  - [api-examples commits](https://api.github.com/repos/Retro-Diffusion/api-examples/commits)
  - [organisation repositories](https://api.github.com/orgs/Retro-Diffusion/repos)
- Repository documents:
  - [README](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/README.md) and [`docs/HOW_IT_WORKS.md`](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/docs/HOW_IT_WORKS.md) at `ef376e57`
  - [`PIXEL_FIXER.md` at `5e37712d`](https://github.com/Retro-Diffusion/api-examples/blob/5e37712d0d6c927ba77414c539f2d6c41181ebcc/PIXEL_FIXER.md)
  - [retro-diffusion-mcp README at `12e66b87`](https://github.com/Retro-Diffusion/retro-diffusion-mcp/blob/12e66b876d7e242042beeaf073c95c0626069da8/README.md)
- Other pages:
  - [Pixel Rehab](https://arcade.pirillo.com/pixel-rehab.html)
  - [Aseprite extension devlog](https://astropulse.itch.io/retrodiffusion/devlog): newest post 2026-08-24, no fixer entry
