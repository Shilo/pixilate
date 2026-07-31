# Pixilate public-documentation review

**Review date:** 2026-07-31

**Scope:** every public research and planning document under `docs/`

**Status:** public-safety correction completed; research/planning only

## Outcome

The documentation was reviewed for privacy, proprietary implementation disclosure, comparative fairness, factual scope, copyright/license posture, and public readability.

The public set now:

- contains no credentials, account identifiers, user images, personal contact details, or personal filesystem paths;
- contains no copied third-party source code, proprietary client details, proprietary-file fingerprints, screenshots, artwork, palettes, model files, or binary assets;
- bases the PixelLab comparison only on first-party public documentation, the public API schema, current public policies/terms, and permitted public-surface observations;
- bases open-source implementation analysis on cited public repositories and identified revisions, while treating repository licenses as only the start of artifact-level review;
- distinguishes observed behavior from inference and unknowns;
- describes product differences against Pixilate's proposed contract without judging whether another product is good or bad at its intended purpose;
- treats product/version/activity/policy/license statements as dated snapshots;
- preserves the distinction between MIT-licensed Pixilate-owned code and the separate obligations of any future third-party dependency closure.

## Public-comparison notice

Product and company names may be trademarks of their respective owners. Pixilate is not affiliated with, endorsed by, or sponsored by the products reviewed. Comparisons are independent, dated, scoped to cited public or publicly licensed sources and authorized observations, and intended for engineering planning.

License and patent discussion is engineering triage, not legal advice. A future implementation may use a third-party component only after reviewing the exact version, enabled features, transitive dependencies, assets/data, patents, notices, and distribution method. Public availability does not grant permission to copy code or assets.

## Remaining evidence limits

- Hosted service internals and strict repeatability remain unknown unless a first-party public contract or permitted benchmark establishes them.
- Mutable websites, APIs, pricing, product behavior, terms, privacy policies, repository heads, and dependency licenses must be rechecked before publication updates or implementation adoption.
- Any competitor benchmark must use authorized inputs and comply with applicable terms. Credentials, account identifiers, signed URLs, request identifiers, confidential metadata, and proprietary inputs must never enter public results.
- AI-generated or third-party benchmark images may be committed only after reviewing the specific output terms, depicted intellectual property, privacy/publicity rights, and redistribution grant. Prompts alone are not provenance.
- No document selects a production engine, codec, quantizer, Mixel scorer, cleanup rule, or background segmenter.

## Technical planning status

The corrected research supports continued documentation work. It does not authorize a benchmark harness or web application.

Before Gate A/R0, a documentation-only Slice A specification must freeze byte serialization, deterministic work/error fields, procedural fixture provenance and licensing, mathematical fixture definitions, reference vectors/hashes, and review/change control. Gate B/R1 remains a separate later authorization after measured evidence and dependency closure.

## Validation expectations

Before every public release of the documentation:

1. scan for secrets, personal paths, account metadata, private-client artifacts, and proprietary inputs;
2. validate all local links and internal anchors;
3. recheck decision-bearing external citations and dated product facts;
4. verify evidence labels and neutral comparative language;
5. ensure license claims are scoped to exact reviewed artifacts;
6. confirm every normative requirement, acceptance criterion, open decision, experiment, tier, and phase still resolves through the planning crosswalk;
7. confirm temporary handoff/session files are excluded from the commit.

No executable work follows automatically from this review.
