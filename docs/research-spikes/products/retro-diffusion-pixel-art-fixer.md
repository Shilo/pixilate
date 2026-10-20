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
