# Session Findings — 2026-10-21

> Update 2026-10-22: source and tooling migrated to strict TypeScript under `OWN-010`, preserving UI and engine output. Start with the [stack-standardization review](../reviews/stack-standardization-2026-10-22.md) for current versions, commands and verification. The dated findings below remain historical evidence.

## Purpose

This is the resume point for any agent picking up Pixilate. It summarises the current state and the ranked next steps. It continues the [2026-10-20 session findings](session-findings-2026-10-20.md), which hold the round-by-round history. Where it states a number, the canonical source governs: the [Deviations log](prototype-algorithm-design.md#deviations) (D1–D66), the [engine test results](../reviews/prototype-v1-test-results.md) and the [app test results](../reviews/mvp-app-test-results.md). Evidence labels follow the [research index](../research-spikes/README.md#how-to-read-the-evidence); numbers that include local samples are OBSERVED, local-only, not rights-cleared.

## Current state

- **Focus: release.** The app in [`app/`](../../app/README.md) is the product (`OWN-009`). It is live at <https://shilo.github.io/pixilate/>; every push to `main` runs both test suites, builds the app and publishes it ([workflow](../../.github/workflows/pages.yml)). The repository is public at <https://github.com/Shilo/pixilate> under the MIT License (`OWN-008`).
- **Engine** `0.14.2`, constants 33, synthetic fixtures `pixilate-synth/5`. Since round 5 it gained a manual period that keeps the smooth-upscale path (D65) and a recommendation that trusts a user-set pixel grid (D66).
- **App.** Faithful / Clean / Smooth with one marked Best and a plain reason; a detected size prefilled only for confident grids; optional Remove background, Crop to subject and colour count; a pixel-grid override (columns × rows, "Reset to detected") inside Size; integer zoom, pixel grid, before/after; Save PNG at 1×–16× (4096 cap), Copy, Share and recipe JSON; a production Content Security Policy that blocks every network request. Saved PNGs are byte-identical to the engine's.
- **Tests.** Engine 348 passing (2 expected failures, local-only suites skip on a fresh clone); app 93 passing. Committed and showcase ratchets clean.
- **Comparison** (target mode, common palette cap `_kT`, 450 synthetic cases, in-sample; references are clean-room re-implementations, not the tools): ours 0.978 overall. The best reference overall is the Real-PixelArt fixed-size reference at 0.963. A faithful Retro Diffusion reference scores 0.888 (0.909 with a manual size). Native size-exact: ours 0.780, the best reference 0.569. Ours asserts no grid on no-grid scenes; the references do on 2–4 of 4. Real-PixelArt still leads on stratum M (mixels; 0.872 against 0.835).
- **Retro Diffusion research** refreshed on 2026-10-21 ([spike](../research-spikes/products/retro-diffusion-pixel-art-fixer.md)). Its cell-colour rule was tested on our engine and rejected (net losses, 2.5–4× slower); its manual columns × rows idea became the app's grid override.

## Ranked next steps

Proposals, not decisions. Each engine item must pass the acceptance rules in [AGENTS.md](../../AGENTS.md).

1. **Real-device and real-image testing** (owner): phones and tablets in both orientations, screen readers, and the owner's own AI images ([checklist](testing-todo.md#app-what-the-owner-should-test)). Its failures set the next fixes.
2. **Stratum M gap: palette discovery** (`OD-005`, `OD-007`). The merge under-counts colours (about 13 against a truth of 18). Lattice, cell estimate, merge threshold, Potts relabelling (D64) and the Retro Diffusion colour rule are ruled out. The open lead is a diagonal Potts term at the current merge threshold.
3. **Small targets (16–32 px).** Eyes still read as a dark dash and lose the iris colour; the two `it.fails` straddling-eye fixtures stay open (`EX-011`).
4. **Missed smooth-upscale lattices** (D61). The seamless veto rejects correct lattices on two sprites at bilinear ×8.37, and one bicubic face locks to an octave that is too coarse. Nearest still leads on those smooth presets.
5. **App polish left open:** bottom sheets with a grabber for Size and Tools, a cramped 320 × 568 layout with Size open, section animations, a max content width on ultra-wide screens, and recipe import (FR-013).
6. **Owner decisions:** whether the D62 reduction steps belong in the default output, the Trim basis default (D50), glow and shadow under `Binary(128)` (D51) and the ambiguous-grid policy (`OD-004`).

## How to resume

1. Read [AGENTS.md](../../AGENTS.md), then this page, then the open items in the [testing to-do](testing-todo.md).
2. Install and test: `cd prototype && npm install && npm test`, then `cd ../app && npm install && npm test`.
3. For engine work, measure first: `npm run bench -- --seeds 1` and `node scripts/compare.mjs --seeds 1` in `prototype/`, then add a Deviations row for every behaviour change.
4. For app work, keep `app/test/parity.test.js` green and check phone, tablet and desktop sizes in light and dark.
