# Pixilate

## Goal

Pixilate is a planned local-first web application for converting raster, AI-generated, or manually created artwork into accurate pixel art without generative AI. It targets common conversion failures including mixels, misaligned or inconsistent grids, excessive and incoherent colors, noisy downscaling, orphan pixels, and lost thin features. Its central goal is a capability not found as a complete workflow in the tools reviewed so far: deterministic conversion to an exact user-selected pixel width and height while recovering or preserving meaningful structure. It will combine explicit canvas or opaque-bounds trimming, configurable grid recovery and resampling, palette quantization, and deterministic background removal as separate composable tools, with approachable defaults, advanced controls, replayable settings, and an open-source core intended to be MIT-licensed (not yet declared: the repository has no licence file).

## Structure

Pixilate is currently in research and planning. Keep public work in `docs/` until an implementation phase is explicitly approved, except the owner-authorized exploratory research prototype in `prototype/` (2026-10-19, `OWN-002` in `docs/planning/product-requirements.md` §25).

- `docs/research-spikes/`: product, algorithm, ecosystem, and evaluation research
- `docs/planning/`: requirements and implementation planning
- `docs/reviews/`: public-readiness and cross-document reviews
- `prototype/`: owner-requested JavaScript (Vite + Svelte) research prototype of the conversion algorithm; run `npm install` and `npm test` inside it. It is exploratory (`OWN-002`): it is not the product implementation, passes no gate, and selects no production default. The engine and stack choice is `OWN-001`
- `.local/`: ignored, machine-local research that must never be committed

Read `docs/research-spikes/README.md`, then `SYNTHESIS.md`, before adding research. Open detailed spikes only when needed. Follow YAGNI: do not add architecture, dependencies, features, or abstractions without a documented requirement.

## Public Research and Legal Conduct

- Keep research claims dated and traceable to public sources.
- Distinguish observations, inferences, and proposals.
- Label evidence VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, or UNKNOWN as defined in `docs/research-spikes/README.md`; numbers from gitignored local samples are "OBSERVED, local-only, not rights-cleared".
- Treat every tracked file as public.
- Use only authorized access, public documentation, licensed sources, and rights-cleared test assets.
- Respect licenses, terms, privacy, attribution, trademarks, and intellectual property.
- Do not publish credentials, personal data, proprietary internals, copied unlicensed code, circumvention instructions, or unsupported allegations.
- Keep comparisons factual, neutral, dated, and reproducible.
- Keep legitimate machine-local notes in `.local/`; do not use it to retain unlawfully obtained material.

## Commit Style: Conventional Commits

```
<type>[optional scope]: <description>

[optional body]
```
