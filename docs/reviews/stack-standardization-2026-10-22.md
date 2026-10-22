# Stack standardization — 2026-10-22

Scope: `OWN-010`, architecture/dependencies/versioning/tests only. No design, algorithm, default-setting or serialized-engine-version change.

## Exact toolchain

| Package/tool | Version |
|---|---|
| Node.js / bundled npm | 24.22.1 / 11.19.1 |
| `typescript` | 6.0.3 |
| `svelte` | 5.57.2 |
| `vite` / `@sveltejs/vite-plugin-svelte` | 8.3.4 / 7.3.1 |
| `rolldown` (transitive lockfile resolution) | 1.2.14 |
| `svelte-check` / `@types/node` | 4.7.7 / 24.19.2 |
| `vitest` / `@playwright/test` | 4.1.12 / 1.64.1 |
| `@jungherz-de/glasskit` | 1.22.2, retained to preserve appearance |
| `fast-png` / `jpeg-js` | 8.0.0 / 0.4.4 |

VERIFIED: direct dependencies are exact pins; lockfiles are committed; both packages declare `npm@11.19.1`; `.nvmrc` and CI use Node.js 24.22.1. Engine identifier `pixilate-prototype-js`, version `0.14.2`, constants 33, and committed ratchet baseline are unchanged.

## Migration and challenges resolved

- Product source, workers, Svelte scripts and Vite configurations use strict TypeScript, without `any`, type-check suppression or relaxed strictness. Shared image, cell, grid, option and worker-message contracts erase at runtime. Node benchmark tools import the TypeScript source directly using Node's native type stripping.
- JavaScript procedural fixtures, existing tests and benchmark scripts stay in place. Their engine imports and source-inspection paths now resolve TypeScript; committed quality gates use mandatory static engine imports, so a missing source module cannot silently skip the suite.
- Peer review found the comparison tool's `--engine` path still assumed JavaScript. The small entry resolver now accepts current TypeScript archives and historical JavaScript archives. Two subprocess tests load both from paths containing spaces.
- Peer review required the one-shot export-worker response and request to be typed, alongside the long-lived conversion worker. Browser checks now exercise the actual fresh export worker at 2× as well as the cached 1× PNG.
- The parent and both project peers challenged preserving browser support, CSS and markup, exact engine outputs, test execution and migration scope. GlassKit upgrades and UI changes were rejected for this task. No new runtime library, state manager, router or server was added.

## Verification

All commands used Node.js 24.22.1 and npm 11.19.1.

| Check | Result |
|---|---|
| Baseline engine tests | 324 passed, 2 expected failures, 24 optional local-only skips |
| Migrated engine tests | 326 passed, 2 expected failures, 24 optional local-only skips; the two additional tests cover archive entry resolution |
| App tests | 93 passed before and after; includes engine/worker PNG parity |
| Both `npm run check` commands | Zero errors and zero warnings; app also checks browser-test/config TypeScript |
| Both production builds | Passed |
| Production browser suite | Four passed: conversion/export and rejected-upload recovery at desktop and phone viewports |
| Engine migration snapshot | All 108 candidate sets matched PNG hashes, RGBA hashes, recipes and recommendations before/after |
| Independent source review | Emitted engine code differs only in erased-type/semantically equivalent syntax; all Svelte markup and compiled CSS match after removing TypeScript annotations/source positions; global CSS unchanged |

The snapshot uses six project-authored procedural sprites, six degradation presets and seeds 1, 11 and 29. Seeds 11 and 29 are held out from the committed fixture seed. Comparison includes candidates as well as the recommendation, without timings. No private images or pixels are tracked.

Browser tests generate their own image, run the production CSP and workers, inspect downloaded PNG bytes and decoded pixels against the direct engine, check the recipe fingerprint, test exact nearest-neighbour 2× export, reject external requests and recover from an invalid upload. Playwright-managed Chromium is the default; installed Edge is an optional local channel.

OBSERVED: sandbox temporary-directory rename restrictions initially prevented Vitest from starting. Setting machine-local TEMP/TMP to a writable workspace directory allowed the same tests to run. Playwright needed unsandboxed local browser execution on this Windows host. These are execution-environment limitations, not waived checks.

UNKNOWN: real-device Safari/Android, screen readers and the full cross-browser determinism matrix remain unverified. Existing expected-failure and optional-skip cases remain disclosed; this migration does not claim to fix those pre-existing limitations.
