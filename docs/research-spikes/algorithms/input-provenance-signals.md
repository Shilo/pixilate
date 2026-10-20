# Input provenance signals for conversion

**Research snapshot:** 2026-10-19  
**Status:** research input for [`FR-023` / `AC-PROV-001`](../../planning/product-requirements.md) (owner decision `OWN-003`). This document authorizes no default, dependency, or production behaviour.  
**Replaces:** a superseded 2026-10-18 prototype research draft on generator fingerprints. Only conversion-relevant, compliant content was carried forward.

## Public comparison and licensing notice

Product, company, and standard names may be trademarks of their respective owners. Pixilate is independent and is not affiliated with, endorsed by, or sponsored by any generator vendor or standards body named here. Legal and terms questions below are engineering triage, not legal advice. This document contains no third-party code, sample images, prompts, account data, or watermark data.

## Evidence vocabulary

- **VERIFIED:** stated by a cited published standard or controlled vocabulary.
- **OBSERVED:** seen in the dated local research environment. Here every OBSERVED item is **local-only**: the samples are private, gitignored generator outputs that are not rights-cleared and cannot be reproduced by others.
- **INFERRED:** an engineering conclusion that still needs validation.
- **UNKNOWN:** not established.

## Question and verdict

**Question:** which deterministic, local signals inside an input file should change conversion behaviour, and how must they be handled safely?

**Verdict (INFERRED):** most conversion-relevant information comes from **container properties**, not from who made the file. Declared-AI and generator signals are report-only declarations: they are never validated, never authoritative, and never select a preset by themselves (`FR-023`). A declared visible watermark may only become an **analysis mask**. Invisible watermarks are out of scope. Prompts and usernames are never persisted. Whether re-encoded exports should carry provenance forward is an open question.

## 1. Container properties

The decoder already sees these properties, and they bear directly on conversion:

- format: PNG, JPEG, WebP, GIF;
- lossless versus lossy coding;
- a JPEG quality estimate (from the quantization tables) and the chroma subsampling factors;
- alpha presence and actual use;
- bit depth, animation, and dimensions.

Possible uses, all **INFERRED** and benchmark-gated (no default is selected here):

- Lossy input can enable a JPEG 8×8 lattice guard in grid analysis. Precedents: the [Retro Diffusion lattice notch](../products/retro-diffusion-pixel-art-fixer.md#detection-pipeline-verified-vendor-writeup-at-the-pin) and the stricter coherence near 16/k periods in [unfake.js v1.4.0](../products/unfake-js.md#new-at-v140-code-derived-at-the-pin). It can also make a denoise candidate eligible.
- With 4:2:0 subsampling, luma edges are more trustworthy than chroma at block edges.
- Alpha handling follows the [canonical RGBA contract](canonical-rgba-geometry-spike.md), not provenance.

Any container fact that influences a stage must be recorded in the recipe. Metadata exists only in the original file bytes. Clipboard paste and canvas round-trips re-encode the image and drop it, so absence of metadata proves nothing.

## 2. Declared-AI signals

### Where declarations live (VERIFIED)

- **C2PA 2.2** ([specification](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html)):
  - The manifest store is a JUMBF structure, and the active manifest is the last manifest in the store.
  - Claims carry `claim_generator_info`.
  - Embedding by format:
    - PNG: an ancillary `caBX` chunk, recommended before `IDAT`.
    - JPEG: APP11 marker segments, usually several because of the 64 KB segment limit.
    - WebP: a RIFF chunk `C2PA` at the end of the file.
    - GIF: an application extension identified as `C2PA_GIF`, placed before the first image descriptor.
  - The specification has a manifest consumer validate the signature and its credential before trusting a claim.
- **IPTC Digital Source Type** ([vocabulary](https://cv.iptc.org/newscodes/digitalsourcetype/)):
  - `trainedAlgorithmicMedia` ("Created using Generative AI");
  - `compositeWithTrainedAlgorithmicMedia` ("Edited using Generative AI");
  - `compositeSynthetic`;
  - `algorithmicMedia`.
  - These terms can appear in XMP or inside C2PA actions. They declare "AI", not which system.
- **Tool text chunks:** some local generation tools write PNG text chunks such as `parameters`, `prompt`, or `workflow`. Their key names are tool conventions, not a standard (**UNKNOWN** stability). These chunks typically contain prompts, so §5 applies.

### Handling rule

The local sniffer does not validate signatures. A structural or substring match is therefore a **declaration (unvalidated)**, and copying or forging it is trivial. It must never be reported as verified or at high confidence. The required wording is "file metadata claims … (signature not checked)". A declared family name may be displayed in the report. It must never override measured grid evidence, and it must never select a profile, preset, or default (`FR-023`). Showing *validated* Content Credentials, for example through the MIT `c2pa-web` reader, is a separate, later requirement-gated choice. Its runtime size and trust-list maintenance would need their own review.

## 3. Dimension evidence

Matching exact `(width, height)` against generators' published sizes is weak evidence. Many tools share sizes, users crop and resize, and published tables drift between releases. **INFERRED:**

- A dimension match may at most narrow a search window. The expected cell size comes first from canvas ÷ the user's required W×H (`OWN-006`).
- Measured evidence, such as an exact 1-px grid or a perfect integer nearest-neighbour upscale ([state of the art §5.1](state-of-the-art.md#51-exact-constant-block-factorization)), outranks any table.

This document deliberately keeps no per-vendor size or model catalogue. Such tables go stale quickly, and none is needed for a mask-only, report-only design.

## 4. Declared visible watermarks: masking only

Some services add visible marks, and some C2PA manifests declare that a visible watermark was added. The only permitted handling is:

1. **Mask:** exclude a declared region, or a conservatively estimated corner region, from grid, palette, and background **analysis**.
2. **Never alter:** no stage removes, inpaints, recolours, reconstructs, or inverts the mark. Output pixels in the region come from the normal pipeline, and the mask itself is recorded in the recipe.
3. **No vendor geometry:** the estimated region is a conservative fixed fraction of a corner. Exact mark geometry and blend data published by third-party removal projects are not used.

**Rationale (INFERRED):** provider terms can prohibit removing or obscuring marks, and AI-content labelling rules in some jurisdictions apply. Masking keeps a mark from distorting grid and palette estimates without altering it. When a manifest declares a mark, the mask applies even if no mark is measurable (for example, a mark on a near-white background). With no mask applied, output is identical whether or not detection runs (`AC-PROV-001`).

## 5. Invisible watermarks

Out of scope. Public information does not provide a client-side decoder for the major invisible watermarks, and Pixilate attempts none. A manifest action may *declare* that an invisible watermark exists, and that declaration may be reported as such. It is not decoded, validated, or acted on.

## 6. Privacy rule

- Metadata is parsed locally, with no network request.
- Prompts, negative prompts, workflow graphs, seeds, usernames or author fields, job IDs, and any embedded payload text are **never** written into recipes, reports, telemetry, logs, or exported files. They may be shown only transiently, on explicit user request.
- Report fields are limited to:
  - container properties;
  - "AI declared (unvalidated)";
  - a declared family or tool label;
  - visible- and invisible-watermark *declared* flags;
  - the analysis mask applied, if any.

## 7. Provenance on re-encode (open question)

Pixilate's canonical PNG encoder drops the input's C2PA, XMP, IPTC, and text chunks, including any declared AI label. Several options exist:

- carry the provenance forward or declare it, for example as a C2PA manifest with the input as an ingredient and a `c2pa.converted` action;
- warn the user;
- drop it silently.

Which option is right is **UNKNOWN** and may depend on jurisdiction and on the input's terms. This is flagged for the product requirements and not decided here. Not legal advice.

## 8. Local sample findings (OBSERVED, local-only)

Three private, gitignored generator outputs were inspected byte-level in the local environment on 2026-10-18: two PNGs carrying OpenAI-signed manifests and one carrying a Google-signed manifest. They are not rights-cleared, not committed, and not reproducible by others. They are identified only by role:

- All three carried a C2PA store in a PNG `caBX` chunk directly after `IHDR` and before `IDAT`. None had `tEXt`, `iTXt`, `zTXt`, `eXIf`, or an XMP packet.
- The digital source type appeared only inside C2PA actions, never in XMP.
- The OpenAI-signed manifests included an action declaring an invisible watermark (`c2pa.watermarked.unbound`).
- The Google-signed manifest included an edit action described as adding a visible watermark. In that sample, the bottom-right corner was near-white, and no mark was measurable.
- Two samples had dimensions that matched no published size table. The third had a size shared by several generators.

**Implications (INFERRED):** declared flags must drive the mask without requiring a pixel match, dimension tables are weak, and a structure-aware sniffer for PNG is small. **Follow-up:** acquire rights-cleared samples, including JPEG and WebP containers and files without metadata, before any `AC-PROV-001` fixture is fixed.

## Sources

- [C2PA Technical Specification 2.2](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html): active manifest, `claim_generator_info`, validation, and Appendix A embedding.
- [IPTC Digital Source Type vocabulary](https://cv.iptc.org/newscodes/digitalsourcetype/)
