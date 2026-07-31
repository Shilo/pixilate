# PixelLab public product spike

**Research snapshot:** 2026-07-31

**Product:** [PixelLab](https://www.pixellab.ai/)

**Question:** can PixelLab serve as a behavioral or implementation reference for a local, deterministic, exact-target, non-generative raster-to-pixel workflow?

## Public-source boundary

This public report uses only PixelLab's first-party website, public documentation, public OpenAPI schema, privacy policy, terms, and unauthenticated product surfaces. It contains no installed-extension source analysis, private-client filenames, local filesystem paths, proprietary file fingerprints, credentials, account identifiers, unpublished endpoints, or reverse-engineered implementation details.

The report evaluates fit against Pixilate's proposed contract; it does not grade PixelLab against goals PixelLab does not claim. Product behavior, API schemas, pricing, policies, and terms can change. Recheck the live sources before relying on a dated statement.

Evidence labels:

- **VERIFIED:** stated by a cited current first-party public source or public schema.
- **OBSERVED:** visible on a public product surface in the dated research pass.
- **INFERRED:** a project-planning conclusion from verified facts.
- **UNKNOWN:** not established by the public evidence reviewed.

## Executive verdict

PixelLab is a useful workflow and product-design comparator, but it is not an implementation reference for Pixilate's proposed deterministic core. PixelLab documents cloud-based AI workflows for relevant generation/conversion operations, while Pixilate requires a local non-generative processor with versioned algorithms, exact recipes, and canonical output hashes. PixelLab's server-side implementation is not publicly specified at the level required to reproduce its pixels independently. ([FAQ](https://www.pixellab.ai/docs/faq), [general options](https://www.pixellab.ai/docs/options/general), [terms](https://www.pixellab.ai/termsofservice))

The original hypothesis that PixelLab lacks target-size controls needs qualification:

- **Resize** accepts a requested target size for an existing pixel-art reference. PixelLab describes it as an AI redraw, not conventional deterministic resampling. ([Resize](https://www.pixellab.ai/docs/tools/resize), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))
- **Image to pixel art (standard)** accepts an output size in the public API. ([Image to pixel art](https://www.pixellab.ai/docs/tools/image-to-pixel-art), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))
- **Unzoom** is documented as detecting an original/native pixel scale rather than accepting an independent output `W×H`. ([Unzoom](https://www.pixellab.ai/docs/tools/unzoom-pixelart))
- **Image to pixel art Pro** is represented in the public API as a server-selected native-resolution workflow rather than an independent exact-target resizer. ([public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

The differentiated opportunity is therefore not merely adding width and height fields. It is making target geometry authoritative while keeping decode, Trim, spatial reduction, palette enforcement, alpha policy, and replay semantics explicit and deterministic.

### Compact requirements scorecard

| Pixilate requirement | Publicly documented PixelLab fit | Evidence status |
|---|---|---|
| Independent target width and height | Partial: documented for Resize and standard Image to pixel art; not documented as the authority for Unzoom/Pro | VERIFIED |
| Target basis switches between full canvas and alpha-visible bounds | No equivalent public control located | UNKNOWN / not located |
| Local/offline core processing | Relevant services are documented as cloud-backed | VERIFIED |
| Non-generative processing | Relevant Resize/conversion workflows are described as AI/model operations | VERIFIED |
| Canonical pixel replay across a pinned engine matrix | No such public contract located | UNKNOWN |
| Explicit palette controls | Available in several workflows, including reduction/target-palette surfaces | VERIFIED, exact enforcement semantics UNKNOWN |
| Separate background-removal workflow | Yes | VERIFIED |
| Deterministic key/flood/component background rules | No such public contract located | UNKNOWN / not located |
| Public implementation reuse grant for the service algorithms | No public reuse grant located in the reviewed sources | VERIFIED as a search result, not proof that no private license exists |

## Public product surfaces

PixelLab publicly presents multiple interfaces and tools. This spike treats the live website/documentation and current `/v2` OpenAPI schema as separate, mutable surfaces. A control documented for one surface is not assumed to exist on every other surface. ([documentation](https://www.pixellab.ai/docs), [interface selector](https://www.pixellab.ai/select-interface), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

### Unzoom

PixelLab describes Unzoom as finding the original pixel size of upscaled pixel art and reducing it accordingly. Public controls include color-reduction choices. The page does not document independent target width/height, grid phase, confidence, ranked lattice alternatives, or a canonical deterministic recipe. ([Unzoom](https://www.pixellab.ai/docs/tools/unzoom-pixelart))

Public-safe Pixilate lesson: inferred native scale is valuable as a suggestion, but it should not replace the user's target size. An inferred grid should have confidence, alternatives, and a conservative no-grid fallback.

### Resize

PixelLab describes Resize as regenerating/redrawing pixel art at a requested size. The public API includes reference and target dimensions and may expose other creative controls. That makes it relevant to the user's workflow, but its stated task differs from deterministic resampling: an AI redraw may intentionally reinterpret shapes or details. ([Resize](https://www.pixellab.ai/docs/tools/resize), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

Public-safe Pixilate lesson: exact target geometry and artistic redraw are different contracts. Pixilate should provide the former without silently performing the latter.

### Image to pixel art

The standard converter accepts a regular image and a requested output size in the public API. The documentation presents a generative conversion workflow and offers creative controls. Public sources do not specify a reproducible raster kernel, palette objective, topology rule, grid-fitting rule, cleanup algorithm, or cross-runtime output-hash guarantee. ([Image to pixel art](https://www.pixellab.ai/docs/tools/image-to-pixel-art), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

Public-safe Pixilate lesson: exposing `W×H` is necessary but not sufficient. A deterministic tool also needs a declared target basis, fit/crop/pad policy, alpha behavior, palette contract, and versioned engine.

### Image to pixel art Pro

The public API describes a workflow in which the service selects a native-looking result resolution, with optional text/seed inputs. A seed is useful for creative repeatability, but the reviewed public sources do not promise canonical pixel equality across service versions or runtimes. ([public OpenAPI](https://api.pixellab.ai/v2/openapi.json), [general options](https://www.pixellab.ai/docs/options/general))

Public-safe Pixilate lesson: server-selected native resolution can be a candidate or recommendation, not the authority when a production asset must be exactly `W×H`.

### Reduce Colors

PixelLab documents Reduce Colors as a separate color-reduction tool with automatic, requested-count, or palette-oriented controls and dithering options. The separation of geometry from palette work is aligned with Pixilate's proposed product structure. The reviewed public sources do not define the quantizer, color space, alpha weighting, tie rules, transparent-pixel policy, or canonical repeatability. ([Reduce Colors](https://www.pixellab.ai/docs/tools/reduce-colors), [color options](https://www.pixellab.ai/docs/options/color))

Public-safe Pixilate lesson: retain the separate feature, but serialize the exact quantizer/palette/dither/alpha policy and validate the final palette after every color-producing stage.

### Remove background

PixelLab documents Simple and Complex background-removal workflows. The public API describes a transparent result and exposes task-specific inputs. These are useful UX references, but they do not establish the explicit color-key, tolerance, connectivity, seed ordering, component, matte, and deterministic replay semantics Pixilate proposes. ([Remove background](https://www.pixellab.ai/docs/tools/remove-background), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

Public-safe Pixilate lesson: keep background work separate and begin with inspectable deterministic primitives. More semantic segmentation can be a later, clearly scoped option only if its implementation and repeatability meet the project gate.

## Network and server dependency

PixelLab's FAQ describes cloud GPU costs and cloud-backed model operation. The public documentation therefore supports classifying these workflows as remote services rather than local/offline image processors. This is not a criticism of PixelLab's intended service; it is a contract difference from Pixilate's local/offline requirement. ([FAQ](https://www.pixellab.ai/docs/faq))

No claim is made here about undocumented transport, private endpoints, internal storage, server architecture, model implementation, or service security.

## Determinism assessment

PixelLab exposes seeds for some public API operations and documents seed-related similarity behavior. That is not the same claim Pixilate proposes. A public strict-replay claim would need, at minimum, a pinned implementation/model identity, full preprocessing and decode policy, fixed numeric/tie behavior, canonical result hashing, and a declared service-version retention policy. Those guarantees were not located in the reviewed public sources. ([general options](https://www.pixellab.ai/docs/options/general), [public OpenAPI](https://api.pixellab.ai/v2/openapi.json))

Accordingly:

- PixelLab repeatability under its own documented seed semantics may be useful for creative workflows.
- Canonical byte/pixel repeatability under Pixilate's stricter definition is **UNKNOWN**, not disproved.
- Pixilate should not represent a fixed seed as sufficient proof of deterministic processing.

## Quality failure-mode analysis

These are general hypotheses for any target-size generative or inferred-grid workflow; they are not allegations about undisclosed PixelLab implementation:

- inferred scale can be ambiguous for mixed cell sizes, antialiasing, texture, glow, compression, or continuous artwork;
- server-selected dimensions may not match a required production asset contract;
- generative redraw can trade source identity for stylistic coherence;
- a color-count control does not by itself define exact membership, transparency, protected colors, or post-processing enforcement;
- automatic background interpretation can be semantically ambiguous where foreground and background share colors.

The benchmark plan should test these risks on authorized fixtures and publish failures as well as successes. Until native outputs are captured under permitted conditions, PixelLab's relative quality on those strata remains unmeasured here.

## Strengths worth learning from

- Clear task separation between generation/conversion, resizing, color reduction, and background removal.
- Direct size controls where the task supports them.
- Accessible creative controls for palettes, descriptions, and variants.
- Native-scale detection as a useful user-facing concept.
- Product documentation that explains intended source types and operational constraints.

These are workflow lessons, not permission to reproduce service algorithms, branding, client code, or assets.

## Contract differences and Pixilate requirements

| Publicly documented difference | Pixilate planning response |
|---|---|
| Some tasks infer or select native dimensions | Keep explicit target `W×H` authoritative; show inference as evidence only. |
| Relevant processing is cloud/model-backed | Keep Pixilate's core local, offline-capable, and non-generative. |
| Strict canonical replay is not publicly promised | Pin/version every stage and define processing versus end-to-end determinism. |
| Palette implementation details are not public | Serialize quantizer, metric, alpha, ties, palette order, and final validation. |
| Alpha-visible target-basis control was not located | Define Trim mathematically and keep it separate from background recognition. |
| Background tools are task/model oriented | Start with explicit deterministic key/connectivity/component rules. |

## Reproducible public black-box test matrix

Any future PixelLab comparison should use only inputs the project is authorized to upload and outputs the applicable terms permit it to retain or publish. Record the public product/API version, retrieval date, account/region context where relevant, complete visible settings, returned dimensions, canonical decoded-pixel hash, encoded-file hash, cost, and failure status. Never publish credentials, account identifiers, signed URLs, request identifiers, private client artifacts, or proprietary inputs.

Minimum public-safe probes:

| Tool | Public question | Measurements |
|---|---|---|
| Unzoom | Does the returned size match an instructed clean grid, and how does it respond to ambiguous/no-grid sources? | returned dimensions, logical recovery where truth exists, no-grid behavior |
| Resize | Does a requested size remain exact, and what source details change? | dimensions, silhouette/topology, palette, repeated-run hashes where permitted |
| Standard converter | How does exact target behavior vary by source stratum and target? | dimensions, alpha, palette count, edges, human usefulness |
| Pro | What dimensions are selected and how stable are outputs under documented seed semantics? | dimensions, canonical hashes, disclosed settings/version context |
| Reduce Colors | Are count/palette/alpha expectations met? | visible-color cap, membership, alpha/halo, repeated hashes |
| Remove background | How predictable is the mask on authorized ground truth? | alpha IoU/boundary, holes, shared-color cases, repeated hashes |

This spike does not contain such benchmark results and therefore makes no comparative quality ranking.

## Privacy and licensing

### Privacy/data handling

PixelLab's current privacy policy, terms, and FAQ are the authoritative sources for service data handling. This report does not offer legal advice or infer behavior beyond those public statements. Anyone running a benchmark must review the current policies, use only authorized inputs, minimize account/response metadata, and avoid publishing personal or confidential data. ([privacy policy](https://www.pixellab.ai/privacypolicy), [terms](https://www.pixellab.ai/termsofservice), [FAQ](https://www.pixellab.ai/docs/faq))

### License and reuse evidence

No public reuse grant for PixelLab's hosted algorithms or proprietary clients was located in the reviewed sources. That means they are not implementation inputs for Pixilate under current evidence; it does not prove that no separate/private license exists. Public documentation and authorized black-box behavior may be cited for interoperability, comparison, and product planning, subject to applicable terms. No PixelLab code, artwork, model, brand asset, or private client artifact is incorporated into this repository.

## Unresolved public questions

1. What strict repeatability, if any, is promised for identical API inputs across service/model updates?
2. What exact palette-membership and alpha semantics apply to color reduction and target-palette workflows?
3. How are dimensions selected for native-resolution workflows, and is confidence exposed anywhere publicly?
4. Are there public version identifiers sufficient to reproduce preprocessing and result pixels?
5. Which outputs/settings may be retained and redistributed in an open comparative corpus under the current terms?

Until first-party public sources answer these questions or an authorized black-box benchmark measures them, they remain **UNKNOWN**.

## Recommendation for the Pixilate plan

Use PixelLab as a dated workflow comparator, not as a code or algorithm source. Preserve the useful separation of tasks and approachable controls. Differentiate Pixilate through authoritative exact target geometry, formal Trim, local processing, canonical recipes/hashes, explicit palette and alpha semantics, and honest confidence/fallback reporting.

## Primary sources

- [PixelLab documentation](https://www.pixellab.ai/docs)
- [Unzoom](https://www.pixellab.ai/docs/tools/unzoom-pixelart)
- [Resize](https://www.pixellab.ai/docs/tools/resize)
- [Image to pixel art](https://www.pixellab.ai/docs/tools/image-to-pixel-art)
- [Reduce Colors](https://www.pixellab.ai/docs/tools/reduce-colors)
- [Remove background](https://www.pixellab.ai/docs/tools/remove-background)
- [General options and seeds](https://www.pixellab.ai/docs/options/general)
- [Color options](https://www.pixellab.ai/docs/options/color)
- [FAQ](https://www.pixellab.ai/docs/faq)
- [Public v2 OpenAPI schema](https://api.pixellab.ai/v2/openapi.json)
- [Privacy policy](https://www.pixellab.ai/privacypolicy)
- [Terms of service](https://www.pixellab.ai/termsofservice)
