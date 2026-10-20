# Pixilate

Pixilate is a local-first web app that converts AI-generated (GPT Image, Gemini, Grok and others), raster or hand-made artwork into true pixel art without generative AI. AI "pixel art" is usually an HD image with fake, drifting, anti-aliased, noisy blocks (mixels) at the wrong size; Pixilate must output crisp pixel art at the exact width and height the user asks for, with a clean palette and no orphans, jaggies, muddy shading or broken silhouettes. Conversion must be deterministic (same input and settings give identical pixels) and fully client-side in JavaScript (Vite + Svelte, not SvelteKit). The core idea is to recover the hidden source grid when one exists, fall back to a raster abstraction when it does not, and offer a few named interpretations (grid, clean, smooth) with one recommended, while trimming, background removal, palette and cleanup stay explicit, composable and off unless chosen. The project is in research and planning; prototype/ is an owner-approved exploratory build of the algorithm (OWN-002), not the product, and the focus is the algorithm and its testing, not UI design. The core is intended to be MIT-licensed (not yet declared: there is no licence file).

## Rules

Keep public work in docs/ and prototype/; implementation beyond the prototype needs explicit owner approval ([master plan §15–16](docs/planning/master-plan.md)).

Follow YAGNI: no architecture, dependencies, features or abstractions without a documented requirement.

Read [docs/research-spikes/README.md](docs/research-spikes/README.md), then [SYNTHESIS.md](docs/research-spikes/SYNTHESIS.md), before adding research; open detailed spikes only when needed.

Label evidence VERIFIED, CODE-DERIVED, OBSERVED, INFERRED or UNKNOWN ([definitions](docs/research-spikes/README.md#how-to-read-the-evidence)); numbers from gitignored local samples are "OBSERVED, local-only, not rights-cleared".

Keep research claims dated, traceable to public sources, and separate observations, inferences and proposals.

Treat every tracked file as public: no credentials, personal data, private paths, user images or prompts, proprietary internals, copied unlicensed code, circumvention instructions or unsupported allegations.

Use only authorized access, public documentation, licensed sources and rights-cleared test assets; respect licences, terms, privacy, attribution, trademarks and IP.

Keep comparisons factual, neutral, dated and reproducible.

.local/ is gitignored machine-local material (private samples by opaque ID, notes, bench output); never copy it into tracked files or use it for unlawfully obtained material.

## Commands

Install: cd prototype && npm install

All tests: cd prototype && npm test

One file or test: cd prototype && npx vitest run test/grid.test.js -t "test name"

Dev server: cd prototype && npm run dev

Build: cd prototype && npm run build

Benchmark: cd prototype && npm run bench -- --seeds 1

Score one output: cd prototype && node scripts/score.mjs out.png --target 32x32

Live AI-image batch (.local/live/ to .local/live-out/): cd prototype && node scripts/live-batch.mjs

Rewrite baseline (commit on its own): cd prototype && node scripts/update-baseline.mjs

## Engine

[prototype/src/lib/core/pipeline.js](prototype/src/lib/core/pipeline.js): entry point; convert, convertCandidates, analyze, routes, trim, fit, report.

[prototype/src/lib/core/grid.js](prototype/src/lib/core/grid.js): exact factorization and approximate grid detection.

[prototype/src/lib/core/sample.js](prototype/src/lib/core/sample.js): grid cells to colours.

[prototype/src/lib/core/fitcells.js](prototype/src/lib/core/fitcells.js): kernel fit and cell-colour deconvolution for smoothly upscaled (second-difference) lattices.

[prototype/src/lib/core/palette.js](prototype/src/lib/core/palette.js): palette building on cells.

[prototype/src/lib/core/resample.js](prototype/src/lib/core/resample.js): raster route and native-to-target reduction.

[prototype/src/lib/core/cleanup.js](prototype/src/lib/core/cleanup.js): background stage and Clean profile passes.

[prototype/src/lib/core/detect.js](prototype/src/lib/core/detect.js): report-only provenance and generator signals.

[prototype/src/lib/decode.js](prototype/src/lib/decode.js): deterministic PNG/JPEG decode.

[prototype/src/lib/core/canonical.js](prototype/src/lib/core/canonical.js): typed errors and canonical RGBA hash.

[prototype/src/lib/core/color.js](prototype/src/lib/core/color.js): deterministic OKLab maths; no transcendental Math anywhere.

[prototype/src/App.svelte](prototype/src/App.svelte): plain test-harness UI; work runs in [worker.js](prototype/src/worker.js).

## Tests

[docs/planning/testing-todo.md](docs/planning/testing-todo.md): live AI-image test plan and open algorithm work.

[prototype/test/regression.test.js](prototype/test/regression.test.js): committed gates on procedural fixtures only.

[prototype/test/synth.js](prototype/test/synth.js): seeded AI-artifact degradation generator.

[prototype/test/metrics.js](prototype/test/metrics.js): quality metrics and ratchet.

[prototype/test/fixtures.js](prototype/test/fixtures.js): procedural sprites and optional local samples.

## Docs

[docs/planning/session-findings-2026-10-19.md](docs/planning/session-findings-2026-10-19.md): current state and ranked next steps; resume here.

[docs/planning/prototype-algorithm-design.md](docs/planning/prototype-algorithm-design.md): prototype design and Deviations log; add a row for every behaviour change.

[docs/reviews/prototype-v1-test-results.md](docs/reviews/prototype-v1-test-results.md): measured results and known limitations.

[docs/planning/product-requirements.md](docs/planning/product-requirements.md): normative requirements; owner decisions in §25.

[docs/planning/master-plan.md](docs/planning/master-plan.md): phases, gates, experiments.

[docs/research-spikes/evaluation/pixel-art-quality-metrics.md](docs/research-spikes/evaluation/pixel-art-quality-metrics.md): what crisp, proper pixel art means as measurable checks.

[docs/research-spikes/evaluation/benchmark-methodology.md](docs/research-spikes/evaluation/benchmark-methodology.md): rules for any quality claim.

## Commits

Use Conventional Commits: type(optional scope): description, for example feat(prototype): add trim.
