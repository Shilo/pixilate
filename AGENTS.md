# Repository Guidelines

## Project Structure

Pixilate is currently in research and planning. Keep public work in `docs/` until an implementation phase is explicitly approved.

- `docs/research-spikes/`: product, algorithm, ecosystem, and evaluation research
- `docs/planning/`: requirements and implementation planning
- `docs/reviews/`: public-readiness and cross-document reviews
- `.local/`: ignored, machine-local research that must never be committed

Read `docs/research-spikes/README.md`, then `SYNTHESIS.md`, and open detailed spikes only when needed. Follow YAGNI: do not add architecture, dependencies, features, or abstractions without a documented requirement.

## Build, Test, and Development Commands

No application toolchain exists yet. Do not invent build commands or introduce a framework during documentation work. Useful repository checks are:

- `git diff --check`: find whitespace errors
- `rg --files docs`: list public documentation
- `git status --short`: verify intended changes and confirm `.local/` remains absent

Document new build, test, lint, and development commands here when their tooling is introduced.

## Style and Naming

Write concise Markdown with descriptive headings, short paragraphs, and repository-relative paths. Use lowercase kebab-case filenames, such as `benchmark-methodology.md`. Define terms once and preserve requirement identifiers used by the planning documents. Prefer explicit behavior and measurable acceptance criteria over speculative design.

For future code, follow the formatter and linter selected by the approved implementation plan. Avoid unrelated refactors and premature generalization.

## Testing and Evidence

Research claims need dated, traceable public sources. Label observations, inferences, and proposals distinctly. When implementation begins, add deterministic fixtures for exact dimensions, trim behavior, alpha, palette limits, and repeated-output equality. Name tests by observable behavior rather than internal method.

## Commits and Pull Requests

Use focused imperative commits with a scope, following the existing pattern: `docs: research spikes and planning`. Pull requests should summarize intent, list affected requirements, describe verification, and include visual comparisons when image output changes. Do not combine unrelated cleanup.

## Public, Ethical, and Legal Conduct

Assume every tracked file will be public. Use only authorized access, public documentation, licensed source, and rights-cleared test assets. Respect licenses, terms, privacy, attribution, trademarks, and intellectual-property rights. Do not publish credentials, personal data, proprietary internals, copied unlicensed code, circumvention instructions, or unsupported allegations. Keep comparisons factual, neutral, dated, and reproducible. Place legitimate machine-local notes in `.local/`; never use it to retain unlawfully obtained material.
