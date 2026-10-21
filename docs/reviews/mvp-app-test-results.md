# MVP app design and test results

Last reviewed: 2026-10-21.

Purpose: record how the first designed MVP app in [`app/`](../../app/README.md) (owner decision [`OWN-007`](../planning/product-requirements.md#own-007--first-designed-mvp-application-2026-10-20)) was designed and tested, what was measured, and what is still open. The engine's own measurements are in the [prototype v1 test results](prototype-v1-test-results.md); engine changes made for the app are row D56 of the [prototype design](../planning/prototype-algorithm-design.md#deviations).

Product and company names may be trademarks of their respective owners; Pixilate is not affiliated with, endorsed by, or sponsored by them.

## Evidence class

| Item | Value |
|---|---|
| Class | Design and functional verification of one build. Not a usability study, not a quality benchmark. |
| Code revision | App `40965e4` (first build) and `b240cc6` (verifier round 2 fixes); engine fixes `f83c379` (engine `0.10.1`, D56) |
| Devices | One development desktop, using the built-in browser pane with emulated viewports. No real phone, tablet or screen reader yet. |
| Decisions closed | None: no `OD-*` or `EX-*` item, no gate |
| Labels | VERIFIED, CODE-DERIVED, OBSERVED, INFERRED, UNKNOWN as in the [research index](../research-spikes/README.md#how-to-read-the-evidence) |

Parity and layout checks used procedural, seeded inputs from `prototype/test` and are OBSERVED. Timings on real AI samples are **OBSERVED, local-only, not rights-cleared**: they cannot be reproduced from the repository and back no public claim.

## Summary

- The app converts live on one screen, offers Faithful, Clean and Smooth with one marked Best and a plain reason, and leaves every tool off by default.
- **Output parity (OBSERVED, procedural).** Saved PNGs are byte-identical to the engine's output across 8 setting combinations, including the ×4 and ×16 exports. Since `f83c379`, every saved recipe replays to the same pixels.
- **Verification.** Five test passes found issues, which were fixed. An independent re-verification then passed all 25 checklist items, with clean layout invariants at 9 viewports in light and dark. The app has 84 passing unit tests.
- **Performance (OBSERVED, desktop).** A 4096 × 4096 image converts in about 2 s with no long tasks. Real samples take 0.3–2.4 s (OBSERVED, local-only, not rights-cleared).
- **Bundle (OBSERVED, gzip).** App JS 41.3 KB, CSS 16.1 KB, worker 59.4 KB. All three are within the spec budgets.
- **Open.** No real-device or screen-reader testing yet. Recipe import (FR-013) is deferred. Small targets (32 px) are an engine limit. See [Known gaps and limits](#known-gaps-and-limits).

## Design process

1. **Two independent specs.** Spec A ("one screen, zero jargon") and spec B ("Photos edit mode") were written separately from the same inputs: the PRD, the engine contract (CODE-DERIVED, engine `0.10.0`), GlassKit notes and the owner's UI inspiration (the colorfetti app, for UI and UX only).
2. **A critique.** Five reviewer roles (Apple HIG, first-time phone user, WCAG 2.2 AA, engineering and PRD) raised 30 findings against both specs. Examples: floating glass over the moving art, layout breakpoints with gaps, prefilling a weak grid guess, missing states (suggested size over 1024, Stop with changed controls), global single-key shortcuts (WCAG 2.1.4), white ink on the orange accent (2.03–3.77:1, failing AA), and pinch breaking under native panning.
3. **A merged spec.** The merged spec resolved each finding and took the stronger parts of A and B.

### Key decisions

| Decision | Detail |
|---|---|
| Live conversion | No Convert button. Taps commit at once, and typed sizes commit on Enter, on blur or after a short pause. Changing style, view or zoom never re-runs the engine. |
| Faithful, Clean, Smooth | These map to the engine candidates `grid`, `clean` and `smooth`, plus Original when nothing changes. The recommended one carries a **Best** tag and one plain sentence per recommendation rule. Clean always shows how many pixels it tidied. A chosen non-Best style sticks, with a "Use Best" link. |
| Prefill only for confident grids | The detected size is prefilled and converted at once only for grid class `exact` or `grid` with both sides ≤ 1024. A `weak` or `none` grid shows "Choose a size" with presets, so a faint grid never sets the size by default (`AUTO-005`). The `GEO-002` derivation is always shown, for example "Found a pixel grid of about 15.9 px blocks: 1018 ÷ 15.9 ≈ 64 wide, 64 high." |
| Tools off by default | Remove background (`'auto'`), Crop to subject and colour count (Auto · 4 · 8 · 16 · 32 · 64; the engine caps at 64) are all off until chosen (`OWN-004`). |
| Crop to subject | Sends Trim `{ basis: 'cells' }`, an existing engine option (D50). It is disabled with a reason on opaque images unless Remove background is on. It was named "Fit to sprite" before `b240cc6`. |
| Stack and Side layouts | Two layouts from complementary media queries (Stack for phones and narrow windows, Side for desktops and landscape), plus a scroll fallback for short heights and 400 % zoom reflow. |
| Glass only on controls | The top bar, dock, panel, dialog and toasts are glass. The stage is solid, so no blur sits over moving pixels. Reduced transparency, increased contrast and forced colours turn the blur off. |
| GlassKit 1.22.2, pinned | VERIFIED (npm registry, read 2026-10-20): 1.22.2 was the newest version published at least 7 days earlier. The newest release, 1.29.0, came out that same day and failed the 7-day rule. MIT, no dependencies, no install scripts. Only the stylesheet is used. |
| System fonts | No web fonts, CDN or third-party requests at runtime (FR-021). |
| No recolouring | By owner rule (2026-10-20), the app converts to pixel art and has no colouring tools: no palette swapping, preset palettes, dithering or colour editing. Colour count is the only colour control, and it is part of conversion. Swatches in Details are read-only. |

## Test passes

The first build went through five independent passes. Their findings were fixed before the first commit (`40965e4`). Round 2 fixes are in `b240cc6`, and the engine findings in `f83c379` (D56).

| Pass | What it checked | Main findings, all fixed in `40965e4` unless noted |
|---|---|---|
| Layout | 20 viewports from phone to ultra-wide, in portrait and landscape, using a scripted check of the layout invariants: no horizontal scroll, controls never overlap the stage, Save is visible, targets are at least 24 px (44 px on coarse pointers), and no text is clipped or off-screen | 14 of 20 viewports passed. The empty card was clipped at short heights; the Colours row spilled out of narrow panels; the phone-landscape Save area took up to 54 % of the height; toggles were 32 px on touch; an opened section landed below the fold; the "Best" badge overflowed at 320 px; the notch inset missed the stage |
| UX critique | First-time flow, wording and controls, played as three users (phone casual, desktop icon, pixel artist) | The no-grid notice was repeated three times; the style name contradicted its reason after dedupe; a square size from a non-square image took trial and error; the phone dock jumped; the view didn't return to After; progress was easy to miss; a refused Remove background stayed on; Save showed the enlarged size; noisy Details; a weak empty state |
| WCAG 2.2 AA audit | WCAG 2.2 AA success criteria, including contrast, focus, keyboard paths, target size and headings | Muted text in the dark Details dialog measured 3.9–4.3:1; the selected style description 3.94:1; the toast overlapped Save; the empty state was unreachable at 400 % zoom; Colours was clipped; status messages were missed; there were no headings; focus was lost after opening a file; forced colours had no selected-style mark |
| Functionality and output parity | Every state and control. App downloads and recipes compared with the engine in Node (see [Output parity](#output-parity)). | Ctrl+S ignored the 4096 cap (4800 × 4800 saved); a stale live status after errors; a needless re-convert when a tool was toggled back; four engine issues (below) |
| Code review | The `app/` source | A decode error during analysis left the app stuck; the export scale was unclamped on shortcuts; no hash without `crypto.subtle`; Ctrl+wheel re-centred; a hidden Fit setting reached the engine; a 150 ms Dialog reopen race; overlapping media queries; dead code |

**App fixes in `b240cc6`:**
- Engine errors show as a banner on the stage.
- Crop to subject (renamed from Fit to sprite) switches a detected size to the subject's own size.
- Original shows its colour count.
- "Enlarge" replaces "File size".
- The size sentence gives the real block size.
- The coarse-pointer check is live, so target sizes follow the current pointer.
- There are no duplicate hidden headings.
- The phone dock keeps its height.

**Engine fixes in `f83c379` (D56).** The functionality pass found four engine issues:
- Remove background made the saved recipe unreplayable.
- A text file named `.png` reported "too big" instead of an unsupported format.
- A fully transparent image reported an exact 1 × 1 grid.
- Clean exact upscales warned that several sizes fit.

The first three were fixed: recipes replay, format sniffing uses signature bytes only, and an empty image reports no grid. The fourth is by design (nested-block ambiguity) and was left unchanged. No pixels changed on any non-empty input: the bench and ratchet are byte-identical.

**Independent re-verification (OBSERVED).** A separate verifier re-ran the acceptance checklist on `b240cc6` with the engine fixes:
- All 25 checklist items pass.
- The layout invariant check is empty at 9 representative viewports in both light and dark.
- `cd app && npm test` passes 84 tests in 5 files: size logic, copy coverage, Before geometry, and hash parity with the engine. These were re-run on 2026-10-21.

## Output parity

OBSERVED, procedural (seeded inputs from `prototype/test/synth.js` and `fixtures.js`). The verifier saved the app's PNGs and recipes, then compared them with the engine in Node:

- **Byte-identical PNGs** across 8 setting combinations: the default grid route, Crop to subject (`basis: 'cells'`), Smooth on the raster route, a colour count of 8, Remove background, Fill (`cover`), Stretch, and Clean.
- The **×4 and ×16 exports** are byte-identical to the engine output upscaled by the same integer factor and encoded in Node.
- **Recipe replay.** After `f83c379`, `convert(image, recipe.options)` reproduces the same canonical hash and PNG bytes for every saved recipe, Remove background included. The engine test "every recorded recipe.options replays through convert() to identical pixels (D56)" guards this across 13 option combinations.

Only Save and Share hand over the exact bytes. Copy goes through the system clipboard, which can re-encode the image.

## Performance

| Measurement | Result | Label |
|---|---|---|
| 4096 × 4096 image, open to first result | About 2 s, with no main-thread long tasks (the engine runs in the worker) | OBSERVED, desktop, procedural |
| Real AI samples, open to first result | 0.3–2.4 s | OBSERVED, local-only, not rights-cleared |
| Phone budgets (spec: ≤ 4 s first result on a mid-range phone) | Not measured | UNKNOWN |

## Bundle sizes

OBSERVED from `npm run build` in `app/` (gzip):

| Chunk | Size | Spec budget |
|---|---|---|
| App JS (shell, without the engine) | 41.3 KB | ≤ 60 KB |
| CSS (GlassKit + app) | 16.1 KB | ≤ 30 KB |
| Worker (engine + codecs) | 59.4 KB | ≤ 90 KB |

## Known gaps and limits

- **No real-device testing yet.** Not yet tested on iPhone Safari (safe areas, keyboard, Share, Copy), Android Chrome, Windows at 125 % scaling (DPR 1.25 device-pixel zoom is INFERRED to snap correctly), or with screen readers (VoiceOver, NVDA).
- **Recipe import (FR-013) is deferred.** The app saves a recipe (.json) but cannot load one.
- **No bottom-sheet grabber.** In Stack, the Size and Tools sections open inside the dock, not as a draggable sheet.
- **320 × 568 with Size open is cramped.** The stage gets small.
- **No section animation.** Sections expand and refit instantly.
- **Only Save and Share are byte-exact.** Copy re-encodes through the clipboard.
- **Plain-HTTP LAN dev has no hash.** A plain-HTTP LAN address is not a secure context, so `crypto.subtle` and the clipboard are unavailable. Details then shows the fingerprint as unavailable. Use HTTPS or `localhost`.
- **Small targets are an engine limit.** Quality at small targets (32 px and below) is limited by the engine, not the app. See the [prototype test results](prototype-v1-test-results.md) and the [testing to-do §8](../planning/testing-todo.md#8-algorithm-work).
- Other gaps are listed in the [app README](../../app/README.md#known-gaps):
  - FR-002 visible bounds and colour estimate;
  - offline install (NFR-PRIV-004);
  - the PRD §15.1 split slider and backgrounds;
  - only `Binary(128)` alpha.

## How to reproduce

```sh
cd prototype && npm install
cd ../app && npm install
npm test        # 84 tests
npm run build   # bundle sizes are printed by Vite
npm run dev     # http://localhost:5210
```

The viewport invariant snippet and the parity scripts were run from the gitignored `.local/` folder and are not committed. `app/test/parity.test.js` covers hash parity in the committed suite.
