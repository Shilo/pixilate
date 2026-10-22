# Pixilate app

Every pixel is a true pixel. Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed. Live at <https://shilo.github.io/pixilate/>.

The Pixilate web app (owner decisions OWN-007, OWN-009 and OWN-010): one screen that turns an image into true pixel art at the size you choose. It only downscales and converts; the colour count is its single colour control. Everything runs on your device: decoding and conversion happen in a Web Worker that calls the prototype engine in place (`../prototype/src/lib`, imported through the `$engine` alias), so the saved PNG is byte-for-byte the engine's output for the shown settings. There are no runtime network requests beyond the app's own files, and only system fonts are used. The production build enforces this with a Content Security Policy `<meta>` (FR-021) added by a small plugin in `vite.config.ts`: same-origin scripts, styles, fetches and workers only, `blob:`/`data:` images, and the inline theme script allowed by a sha256 computed at build time. The dev server has no policy, because Vite injects `<style>` elements and an HMR socket there. Component markup must not use static `style="..."` attributes (the policy blocks them); dynamic `style:` directives are fine.

Svelte 5.57.2 + Vite 8.3.4 (not SvelteKit), strict TypeScript 6.0.3, styled with GlassKit.

**Pixel grid override (PRD AUTO-008).** Inside Size, a quiet link "Grid looks wrong? Set the pixel grid" reveals columns × rows of the original's pixel blocks, prefilled with the detected lattice (empty when none was found) and shown open from the start only when detection is faint, absent or ambiguous. It maps to the engine's `manualPeriod = [width / columns, height / rows]` (the engine locks `round(width / period)` blocks, so the counts come back exactly), is recorded in the recipe as `grid` next to `options.manualPeriod`, and draws its cut lines in Before. A detected output size follows the grid counts; a size the user chose stays. "Reset to detected" removes the override.

## Commands

Use Node.js **24.22.1** with npm **11.19.1**. Install the prototype first: the engine's codecs (`fast-png`, `jpeg-js`) resolve from `prototype/node_modules`.

```sh
cd prototype && npm ci
cd ../app && npm ci
npm run dev       # http://localhost:5210
npm run check     # strict TypeScript, Svelte components, build config and browser tests
npm test          # vitest: size logic, copy coverage, Before geometry, hash parity with the engine
npx playwright install chromium # once: managed test browser
npm run e2e:smoke # production-build import/convert/export and failed-upload recovery
npm run build     # dist/
npm run preview   # http://localhost:5211
npm run example   # regenerate public/example.png (procedural, seeded)
```

The browser suite runs the production build at desktop and phone sizes, uses only generated procedural art, and checks actual downloaded PNG bytes against the engine. It needs no image files, API keys or external services. `npm run e2e` runs the same bounded suite; `PLAYWRIGHT_CHANNEL=msedge` optionally selects an installed Edge for an additional local check.

Testing on a phone: open the app over `https://` or on `localhost` (for example through a USB port forward). A plain-HTTP LAN address is not a secure context, so the browser hides `crypto.subtle` (Details then shows the fingerprint as unavailable) and the clipboard; conversion itself still works.

Save and Share hand over the engine's exact PNG. Copy goes through the system clipboard, which can re-encode the image, so it is not guaranteed byte-exact.

## Layout

- `src/App.svelte`: state machine (empty, analysing, needs size, converting, result, failed), shortcuts, layout shell.
- `src/components/`: Stage, ViewBar, StylePicker, SizePicker, GridOverride, Tools, Export, Details, Dialog.
- `src/lib/`: `copy.ts` (every UI string), `opts.ts` (size logic, engine options, recipe), `geometry.ts` (Before mapping, zoom, export scales), `jobs.ts` (worker handler), `client.ts` (job control), `icons.ts`.
- `public/example.png`: a procedural sprite degraded by the seeded generator in `prototype/test` (no third-party pixels), noisy enough that the clean-up is visible.

## Licence and third-party notices

Pixilate is licensed under the [MIT License](../LICENSE).

GlassKit 1.22.2 (`@jungherz-de/glasskit`, pinned exactly), MIT License, Copyright (c) 2026 Jungherz GmbH, <https://github.com/JUNGHERZ/GlassKit>. Only `glasskit.css` is used; the package has no install scripts and the stylesheet has no `@import` or remote `url()`. GlassKit is not affiliated with Pixilate.

Icons are path data from Lucide (ISC). The worker bundles fast-png, iobuffer, fflate (MIT) and jpeg-js (BSD-3-Clause) through the engine. The full licence texts ship as `public/THIRD-PARTY-NOTICES.txt` (copied to `dist/`).

## Known gaps

- Recipe import and replay (FR-013): Save recipe (.json) only.
- Visible bounds and a colour estimate before processing (FR-002, part).
- Offline install and service worker (NFR-PRIV-004); the app works offline once loaded.
- Before/after split slider, side by side, diff overlay and extra backgrounds (PRD §15.1): Before/After toggle and hold to peek only.
- Alpha policy is the engine's Binary(128); no PreserveCoverage.
- Not yet checked on real devices: iPhone Safari (safe areas, keyboard, Share, Copy), Android Chrome, Windows at DPR 1.25, VoiceOver and NVDA, reduced transparency, contrast and forced colours. Performance budgets (spec §12) are not measured on a phone.
- Section expand and refit are instant (no 200 ms animation); `data-density="compact"` is not used.
- Stack sections open inside the dock, not as a draggable sheet with a grabber (kept simple).
- At 320 × 568 with Size open the stage gets small.
- Only Save and Share are byte-exact; Copy re-encodes through the clipboard. A plain-HTTP LAN address has no `crypto.subtle` or clipboard, so Details shows no fingerprint (see Commands).
- Quality at small targets (32 px and below) is an engine limit, not an app one.
- On ultra-wide windows the top bar and view bar span the full width (no max content width); nothing overlaps.
