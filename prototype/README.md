# Pixilate prototype

An exploratory research prototype (`OWN-002`) of Pixilate's conversion algorithm: it turns an image (often AI "pseudo-pixel art") into pixel art at an exact, user-chosen width and height, fully client-side and deterministically. It is not the product implementation, passes no gate, and selects no production default. The UI is a plain test harness for the algorithm.

## Run

```sh
npm install
npm run dev     # local dev server
npm test        # Vitest unit tests
npm run bench   # synthetic-degradation benchmark
npm run build   # production build into dist/
```

## Using the harness

1. Load an image with the file picker, by dropping it anywhere on the page, or by pasting it. The worker decodes and analyses it and offers the detected size.
2. Enter the target width and height. They are required: they start empty and are only filled from detection when you click "Use detected size W×H" (the detected size is evidence, never applied silently). Lock aspect and the presets help fill them. Converting without them shows the engine's `invalid-input` error.
3. Click Convert. The engine returns a few candidate interpretations; the recommended one is preselected and labelled, and a radio switcher compares the others. Candidates that failed are listed with their error code.
4. Inspect the result at integer zoom (optional pixel grid; detected cut lines over the original) and the report. Download the chosen candidate as a PNG, or nearest-neighbour upscaled at the current zoom (capped at 16.7 MP).

The collapsed **Custom** section holds every other option: trim, fit, route, Clean profile, background (auto or key colour with tolerance and 4/8 connectivity), halo repair, colour cap, and manual grid period. Defaults: trim off, fit `contain`, route `auto`, Clean off, background off, halo off, colours `auto`, no manual period. Picking a route there runs one `convert()` with that route and the cleanup flag instead of the candidate set.

## Engine API

`src/lib/core/pipeline.js`:

- `convert(img, opts, bytes?) -> { image, indexed, report }`. Options:
  - `targetW`, `targetH`: required integers 1..1024.
  - `trim = false`: size from alpha > 0 bounds.
  - `fit = 'contain' | 'stretch' | 'cover'`: contain by default, anchor center.
  - `route = 'auto' | 'grid' | 'raster'`.
  - `cleanup = false`: `true` selects the Clean profile `ai-sprite-crisp/1`, which reports changed cells per rule.
  - `background = false | 'auto' | { key: [r, g, b], tolerance = 0.03, connectivity: 4 | 8 }`, and `halo = false`.
  - `colors = 'auto' | 1..256`, `palette?` (`[[r, g, b], ...]`), `manualPeriod?` (`[px, py]`).
- `convertCandidates(img, opts, bytes?) -> { candidates, recommended, analysis, failed }`. It runs the shared analysis once, then sets route and cleanup per candidate:
  - `original`: identity, only when nothing would change.
  - `grid`: grid route, no cleanup.
  - `clean`: the Clean profile on the grid route, or on the raster route when no grid is found.
  - `smooth`: raster route, no cleanup.

  Identical outputs are deduped. The recommendation follows a rule table on the grid class, not a quality score.
- `analyze(img, opts?, bytes?) -> { grid, generator, suggestedSize }`: targets are optional here.
- `canonicalHash(img)`: SHA-256 over `pixilate/canonical-rgba/v1`.

The engine throws `PixilateError` with one of these codes: `invalid-input`, `empty-visible-region`, `algorithm-budget-exceeded`, or `internal-invariant`.

The report records:

- route and path; the fit geometry and trim box
- background mode, estimate, applied flag, reason, removed cells and removed background specks
- cleanup changes per rule, and the alpha policy (`Binary(128)`)
- the grid class, confidence, exact-factorization candidates, spectral alternatives, ambiguity and suggested size
- the generator provenance, report-only: "file metadata claims", signature not checked
- warnings, timings, and a `recipe` (normalized options plus engine, profile and constant versions)

The design is in [prototype-algorithm-design.md](../docs/planning/prototype-algorithm-design.md). Measured results and known limitations are in [prototype-v1-test-results.md](../docs/reviews/prototype-v1-test-results.md).

## Research behind the design

- [Research spikes index](../docs/research-spikes/README.md)
- [State of the art](../docs/research-spikes/algorithms/state-of-the-art.md)
- [Input provenance signals](../docs/research-spikes/algorithms/input-provenance-signals.md)
- [Pixel-art quality metrics](../docs/research-spikes/evaluation/pixel-art-quality-metrics.md)
- [AI artifact characterization](../docs/research-spikes/evaluation/ai-artifact-characterization.md)
- Product notes: [PixelLab](../docs/research-spikes/products/pixellab.md), [Retro Diffusion pixel-art fixer](../docs/research-spikes/products/retro-diffusion-pixel-art-fixer.md), [SpriteFusion Pixel Snapper](../docs/research-spikes/products/spritefusion-pixel-snapper.md), [unfake.js](../docs/research-spikes/products/unfake-js.md)

## Determinism

The design aims for byte-identical output from the same file bytes and options. It uses JS decoders instead of reading pixels back from a canvas, avoids `Math.random` and engine-approximated math on decision paths, breaks ties by lowest index, and runs single-threaded in a Web Worker. The canvas only displays results.

Scope of the evidence: output was observed byte-identical between Chromium and Node on one sample. Other engines are unverified.

## Limitations

- WebP and other non-PNG/JPEG inputs use canvas decode, which is not guaranteed deterministic; the report says so.
- Images without a detectable grid go through the approximate raster route.
- Non-integer ratios between the native grid and the target are approximate.
- Alpha is binary only (`Binary(128)`); coverage-preserving alpha is unsupported.
- One image at a time; no batch mode.
- Inputs are capped at 16.7 MP (4096×4096) and targets at 1024 px per side.
- Thresholds are starting values until the benchmark calibrates them.

## Licences and credits

Pixilate-owned code is intended to be MIT-licensed; no licence is declared in the repository yet (owner decision pending), so nothing here is licensed for reuse until it is.

Dependencies (versions from `package-lock.json`, licences from each package's `package.json`):

| Package | Version | Licence | Use |
|---|---|---|---|
| `fast-png` | 8.0.0 | MIT | runtime: PNG decode and encode |
| `fflate` | 0.8.3 | MIT | runtime: dependency of `fast-png` |
| `iobuffer` | 6.0.1 | MIT | runtime: dependency of `fast-png` |
| `jpeg-js` | 0.4.4 | BSD-3-Clause | runtime: JPEG decode (notice retention required) |
| `svelte` | 5.57.2 | MIT | dev dependency; its runtime is compiled into the bundle |
| `vite` | 8.3.4 | MIT | dev only: dev server and build |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | MIT | dev only |
| `vitest` | 4.1.12 | MIT | dev only: tests |

A distributed build must retain the copyright and licence notices of the shipped packages. The lockfile's development tree also contains Apache-2.0, ISC, BSD-3-Clause and MPL-2.0 packages, none shipped in `dist/`. Engineering triage, not legal advice.

Algorithm credits. The prototype adapts published ideas and constants from these sources; the constants it adopts are cited in the [design document](../docs/planning/prototype-algorithm-design.md):

- [unfake.js](../docs/research-spikes/products/unfake-js.md) v1.4.0 at `66368689` (MIT): fractional-grid detector, integer lock, JPEG 16/k guard, elastic cuts, inset sampling.
- [Retro Diffusion pixel-art fixer](../docs/research-spikes/products/retro-diffusion-pixel-art-fixer.md) writeup and repository at `ef376e57` (MIT): the smallest-qualified 0.78 period rule.
- [PixelOE](https://github.com/KohakuBlueleaf/PixelOE) (Apache-2.0): the raster contrast pick.
- Papers and public descriptions: Wu's colour quantizer, Lloyd refinement and Ward merging (palette); the Kuwahara filter on summed-area tables (raster route); Ottosson's OKLab and Okhsl toe (colour distances); the pixel-perfect stroke rule as publicly described for Aseprite (its EULA source is not used). See [state of the art](../docs/research-spikes/algorithms/state-of-the-art.md).

To the best of the team's knowledge the prototype contains no copied third-party code: its modules were written from the published descriptions, with the adopted constants cited. A production artifact needs the full licence review required by `NFR-LIC` before any release.
