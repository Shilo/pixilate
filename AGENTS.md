# Pixilate

Pixilate is a free, open-source (MIT) web app that turns AI-generated (GPT Image, Gemini, Grok, PixelLab and others), raster or handmade images into true pixel art at the exact width and height the user chooses, without generative AI. Public description: "Every pixel is a true pixel. Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed." Live app: https://shilo.github.io/pixilate/ (every push to main tests, builds and publishes it). Repository: https://github.com/Shilo/pixilate.

AI "pixel art" is usually a large image with fake, drifting, blurred and noisy blocks (mixels) at the wrong size. Pixilate recovers the hidden source grid when one exists (exact factorization, spectral and second-difference detection, deconvolution of smooth upscales) and falls back to a raster reduction when there is none. It offers three named styles, Faithful, Clean and Smooth, recommends one with a plain-language reason, and exports a PNG at exactly the requested size. Output must be crisp: a clean palette, binary alpha, and no orphans, jaggies, mixels, muddy shading or broken silhouettes. Conversion is deterministic (same image and settings give identical pixels) and runs fully client-side in JavaScript; no image leaves the device. Background removal, crop to subject, the colour count and the pixel-grid override are explicit and off unless chosen. There is no recolouring feature: colour options exist only where they improve the converted output.

The product is the app in app/: Vite 8.3.4 + Svelte 5.57.2 (not SvelteKit), strict TypeScript 6.0.3, styled with GlassKit (required), designed in Apple's spirit, easy, intuitive and minimal for casual users, on desktop and mobile at every resolution and orientation. It imports the engine in place from prototype/, so its PNGs are byte-identical to the engine's. prototype/ holds the engine, a plain test harness, the tests and the benchmarks, and is where algorithm work happens.

## Rules

Follow KISS and YAGNI: no architecture, dependency, feature or abstraction without a documented requirement.

Keep work in app/, prototype/ and docs/; anything else needs owner approval (docs/planning/product-requirements.md §25).

Keep the engine deterministic: no Math.random, no transcendental Math (use color.ts), no module-level state.

Record every engine behaviour change as a Deviations row with measured evidence; rewrite baselines only with the baseline script, in a commit of their own.

Accept an engine change only if the committed and showcase ratchets hold, no case gets worse under the per-case loss rule, and the gain survives held-out seeds.

Run parallel benchmark jobs with at most 8 processes, at low priority.

Label evidence VERIFIED, CODE-DERIVED, OBSERVED, INFERRED or UNKNOWN; numbers from local samples are "OBSERVED, local-only, not rights-cleared".

Keep research claims dated and traceable to public sources, and comparisons factual, neutral and reproducible; read docs/research-spikes/README.md and SYNTHESIS.md before adding research.

Treat every tracked file as public: no credentials, personal data, private paths, user images or prompts, copied unlicensed code or unsupported allegations.

.local/ is gitignored machine-local material (private samples by opaque ID, notes, bench output); never copy it into tracked files.

Follow the Conventional Commits standard, for example feat(app): add share sheet.

## Commands

Use Node.js 24.22.1 and npm 11.19.1. Production source is strict TypeScript; the browser executes its compiled JavaScript. Existing JavaScript fixtures and benchmark scripts stay in place. GlassKit remains 1.22.2 to preserve the interface.

Install: cd prototype && npm ci, then cd ../app && npm ci

Engine tests: cd prototype && npm test

One engine test: cd prototype && npx vitest run test/grid.test.js -t "test name"

Type checks: cd prototype && npm run check, then cd ../app && npm run check

App tests: cd app && npm test

Browser smoke: cd app && npm run e2e:smoke (first run: npx playwright install chromium)

App dev server: cd app && npm run dev

App build: cd app && npm run build

Engine test harness: cd prototype && npm run dev

Benchmark: cd prototype && npm run bench -- --seeds 1

Comparison with reference tools: cd prototype && node scripts/compare.mjs --seeds 1

Score one output: cd prototype && node scripts/score.mjs out.png --target 32x32

Live AI-image batch (.local/live/ to .local/live-out/): cd prototype && node scripts/live-batch.mjs

Rewrite baseline: cd prototype && node scripts/update-baseline.mjs

## App

Overview, notices and known gaps: app/README.md

Shell and state machine: app/src/App.svelte

Components: app/src/components/

Conversion worker: app/src/worker.ts

Settings to engine options and recipe: app/src/lib/opts.ts

Every UI string: app/src/lib/copy.ts

Engine import alias and CSP: app/vite.config.ts

App output equals engine output: app/test/parity.test.js

Pages deploy: .github/workflows/pages.yml

## Engine

Entry points (convert, convertCandidates, analyze, recommendation): prototype/src/lib/core/pipeline.ts

Grid detection: prototype/src/lib/core/grid.ts

Grid cells to colours: prototype/src/lib/core/sample.ts

Smooth-upscale kernel fit and deconvolution: prototype/src/lib/core/fitcells.ts

Palette: prototype/src/lib/core/palette.ts

Raster route and reductions: prototype/src/lib/core/resample.ts

Background stage and Clean style: prototype/src/lib/core/cleanup.ts

Orphan-pixel classification: prototype/src/lib/core/orphans.ts

Provenance signals (report only): prototype/src/lib/core/detect.ts

Decoding: prototype/src/lib/decode.ts

Typed errors and canonical hash: prototype/src/lib/core/canonical.ts

Deterministic OKLab maths: prototype/src/lib/core/color.ts

## Tests

Committed quality gates: prototype/test/regression.test.js

Ratchet baseline: prototype/test/baseline.json

Quality metrics: prototype/test/metrics.js

Synthetic AI-artifact generator: prototype/test/synth.js

Fixtures and local samples: prototype/test/fixtures.js

Clean-room reference tools: prototype/test/reference-tools.js

## Docs

Current state, next steps and how to resume: docs/planning/session-findings-2026-10-21.md

Open work and owner test checklist: docs/planning/testing-todo.md

Engine design and Deviations log: docs/planning/prototype-algorithm-design.md

Engine results and limitations: docs/reviews/prototype-v1-test-results.md

App test results and gaps: docs/reviews/mvp-app-test-results.md

Requirements and owner decisions (§25): docs/planning/product-requirements.md

Phases and experiments: docs/planning/master-plan.md

Research index: docs/research-spikes/README.md

Pixel-art quality metrics: docs/research-spikes/evaluation/pixel-art-quality-metrics.md

Benchmark rules: docs/research-spikes/evaluation/benchmark-methodology.md

GitHub description and topics: docs/github-repository.md
