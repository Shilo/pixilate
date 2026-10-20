# Pixilate — AI Art Conversion Research & UX Findings

**Session date:** 2026-10-18
**Project:** Pixilate
**Recommended path:** `docs/planning/ai-art-conversion-session-findings.md`
**Status:** Research / planning only
**Implementation authorization:** None implied by this document

---

## 1. Purpose

This document records the conclusions reached during a focused discussion about Pixilate's core conversion goal:

> Convert AI-generated artwork from services such as ChatGPT, Gemini, and other image generators into clean, native-resolution pixel art at an exact user-requested width and height, while requiring little or no technical tuning from the user.

The discussion intentionally ignored most broader workflow concerns and concentrated on the conversion problem itself:

- whether arbitrary AI artwork can be converted reliably;
- whether grid recovery is sufficient;
- whether target-first abstraction is required;
- how exact-grid, near-grid, and no-grid approaches should coexist;
- why SpriteFusion Pixel Snapper and Unfaker are inconsistent on AI-generated images;
- whether Pixilate could materially improve on those tools;
- how to expose multiple sophisticated algorithms through an extremely simple interface.

---

# 2. Main feasibility conclusion

Pixilate may be able to offer a better conversion experience than existing grid-recovery-focused tools for some classes of AI-generated artwork (INFERRED, unmeasured; see the status reminder at the end of this document).

However, the product must not promise:

> Perfect pixel-art reconstruction from every AI-generated image.

That is not technically defensible.

Pixilate can guarantee hard engineering properties such as:

- exact requested output width and height;
- one native output pixel per logical output pixel;
- no accidental mixed-size pseudo-pixels;
- deterministic output under a pinned processing recipe;
- explicit palette constraints;
- no unintended antialiasing in the final raster;
- bounded and repeatable processing.

It cannot universally guarantee that every artistic decision will match what a skilled pixel artist would have chosen.

The difficult problem is not simply calculating output pixels. It is deciding:

- which small details are important;
- which details should disappear;
- which thin features should be widened to survive;
- whether a dark area is an outline, shadow, hole, or separate object;
- whether a highlight should remain;
- which contours should move slightly to improve readability;
- whether fidelity or cleaner pixel clustering is more important.

Those decisions are inherently ambiguous when reducing a high-resolution image into a much smaller raster.

---

# 3. Why arbitrary AI-generated images are difficult

AI image generators do not consistently produce genuine pixel art internally.

An output that visually resembles pixel art may contain:

- inconsistent apparent pixel sizes;
- local grid drift;
- antialiased curves;
- soft shading;
- gradients;
- differently sized clusters;
- isolated texture marks;
- subpixel-looking details;
- fake pixel boundaries;
- locally warped cells;
- conventional raster illustration beneath a pixel-art aesthetic.

Therefore, two images generated with the same prompt or even by the same model may require fundamentally different processing strategies.

The originating model is less important than the actual resulting image structure.

A ChatGPT-generated image might contain a recoverable grid.

Another ChatGPT-generated image might contain no coherent grid whatsoever.

The same applies to Gemini and other image generators.

Therefore Pixilate should classify the **image structure**, not the image-generator brand.

---

# 4. Grid recovery versus abstraction

## 4.1 Grid recovery

Grid recovery assumes that some coherent logical pixel lattice already exists in the source.

Its question is approximately:

> What logical pixels produced this enlarged, distorted, blurred, or noisy image?

This is ideal for:

- actual pixel art enlarged with nearest-neighbor;
- pixel art that has been compressed;
- slightly blurred pixel art;
- resized pixel art;
- AI-generated imagery with strong repeated cell structure;
- images where an approximate underlying lattice clearly exists.

When the grid is genuinely recoverable, grid recovery is preferable to abstraction because it can reconstruct information rather than reinterpret it.

In favorable cases it can approach lossless reconstruction.

---

## 4.2 Target-first abstraction

Abstraction solves a different problem.

Its question is:

> Given this image and a requested output of exactly `W × H`, what arrangement of those `W × H` pixels best represents the source?

It does not require any original grid to exist.

This is appropriate for:

- smooth AI illustrations;
- fake pixel art without a consistent grid;
- highly irregular pseudo-pixel imagery;
- images with gradients and antialiasing;
- painted or illustrated artwork;
- images where the user wants a different logical resolution from the apparent source grid.

Abstraction is necessarily interpretive.

It may consider:

- color coverage;
- dominant colors;
- silhouettes;
- edges;
- topology;
- local contrast;
- thin features;
- connected components;
- symmetry;
- palette limits.

---

# 5. Is abstraction better than grid recovery?

Neither is universally better.

They solve different input conditions.

## Grid recovery is superior when:

- a real grid exists;
- the grid is confidently identifiable;
- preserving original logical pixels is important;
- the requested target matches the recovered logical dimensions or can use them as an intermediate representation.

## Abstraction is superior when:

- no meaningful original grid exists;
- the apparent grid varies locally;
- the source is normal raster artwork;
- AI-generated pseudo-pixels are inconsistent;
- the requested output dimensions differ substantially from the source's apparent logical structure.

Therefore Pixilate should not choose between grid recovery and abstraction globally.

The correct architecture is hybrid.

---

# 6. Recommended hybrid conversion model

The conversion system should support three major source conditions.

## Route A — Exact or strong grid recovery

Use when evidence strongly supports a coherent lattice.

Conceptually corresponds to:

`PRO-EXACT`

Possible inputs:

- real enlarged pixel art;
- clean AI-generated pixel grids;
- compressed or lightly distorted grid art.

Behavior:

1. detect or accept the logical grid;
2. recover categorical source cells;
3. preserve existing structure whenever possible;
4. if recovered dimensions equal requested dimensions, return the recovered raster;
5. if dimensions differ, use the recovered logical image as a cleaner intermediate representation for the requested conversion.

---

## Route B — Near-grid / Mixel processing

Use when pixel-like structure exists, but the grid is inconsistent.

Conceptually corresponds to:

`PRO-MIXEL`

Possible issues:

- cell sizes vary slightly;
- local boundaries drift;
- generated clusters are incomplete;
- antialiasing obscures boundaries;
- some areas resemble a grid while others do not.

This route should not rely on one recovered lattice.

Candidate approaches may include:

- strongest global period/phase;
- nearby alternative grids;
- locally adjusted cell boundaries;
- categorical reducers;
- medoid reduction;
- direct no-grid abstraction;
- edge-aware alternatives.

The system may compare a bounded set of candidates.

This remains the most experimental part of Pixilate.

---

## Route C — No-grid target abstraction

Use when there is no credible lattice.

Conceptually corresponds to:

`PRO-RASTER`

The algorithm directly creates the requested logical raster.

It should optimize for low-resolution readability rather than pretending to recover nonexistent source pixels.

---

# 7. Target dimensions remain authoritative

Grid detection must never silently replace the user's requested output dimensions.

Example:

Source:

`1024 × 1024`

Detected logical structure:

`64 × 64`

Requested result:

`32 × 32`

Pixilate should not simply return `64 × 64`.

Instead:

`1024×1024 source`
→ recover useful `64×64` logical structure
→ simplify that representation into the requested `32×32`

This is an important distinction from many scale-first tools.

The recovered grid is evidence and possibly an intermediate representation.

The requested output resolution remains the final contract.

---

# 8. Why SpriteFusion Pixel Snapper is unreliable for this goal

SpriteFusion Pixel Snapper is fundamentally a grid-recovery system.

Its general strategy includes:

- analysis quantization;
- horizontal/vertical edge analysis;
- estimating repeating pixel spacing;
- walking boundaries along detected edges;
- collapsing inferred cells into representative colors.

This works well when a relatively coherent source lattice exists.

It becomes unreliable when:

- AI pixels vary in size;
- grid phase changes locally;
- strong subject edges look like cell boundaries;
- textures produce false periodic signals;
- transparent margins interfere with analysis;
- no underlying grid exists.

A particularly important failure mode is that a grid detector can still return a plausible lattice for a source that was never created from one.

Therefore improving the detector alone cannot solve arbitrary AI-generated artwork.

---

# 9. Why Unfaker exposes many technical controls

Unfaker uses multiple strategies because different images need different compromises.

Its available processing concepts include variants of:

- scale detection;
- manual scale override;
- dominant reduction;
- mean;
- median;
- mode;
- QVote;
- content-adaptive processing;
- palette quantization;
- morphology;
- jaggy cleanup;
- alpha operations.

Each method solves one class of artifact while potentially damaging another.

Examples:

### Mode

Can preserve dominant source colors.

But:

- small eyes;
- highlights;
- thin connectors;
- rare detail pixels

may disappear because they occupy less area.

### Mean

Preserves average color energy.

But it can introduce muddy intermediate colors that did not exist in the source.

### Median

Can suppress noise.

But it may also suppress intentionally rare details.

### Cleanup / morphology

Can remove isolated artifacts.

But it can also destroy intentional one-pixel features.

The many settings are therefore not simply an interface problem.

They expose genuine ambiguity in the conversion task.

Pixilate should attempt to hide this complexity without pretending that the ambiguity does not exist.

---

# 10. Can Pixilate outperform SpriteFusion and Unfaker?

Potentially yes.

But the goal must be framed correctly.

A realistic goal is:

> Produce clean, exact-resolution pixel-art interpretations from broad classes of AI-generated imagery with substantially less manual tuning than current tools.

A non-defensible goal is:

> Perfectly convert every AI-generated image into ideal pixel art.

Pixilate has a meaningful opportunity because it can avoid assuming that every input contains a recoverable grid.

It can instead select among:

- exact grid recovery;
- approximate grid reconstruction;
- direct target-size abstraction.

That gives it a broader input domain than tools that are fundamentally scale-first.

---

# 11. The hardest unsolved problem

The major unresolved problem is not generating candidates.

It is determining which candidate is artistically preferable.

Suppose one candidate preserves:

- more fine detail;

while another produces:

- cleaner clusters;
- better silhouette;
- fewer isolated pixels.

There may be no mathematically correct winner.

A scorer can measure:

- edge alignment;
- topology changes;
- reconstruction error;
- grid regularity;
- palette error;
- isolated components.

But those metrics cannot perfectly infer artist intent.

This makes fully automatic candidate selection risky.

---

# 12. Key UX conclusion: expose candidate interpretations visually

A major conclusion from this session is that Pixilate does **not** need to solve automatic aesthetic selection perfectly.

Instead, it can generate a small number of meaningfully different high-quality interpretations and let the user compare them visually.

The interaction should resemble switching camera modes or photographic looks in an Apple-style interface.

These are not literally image filters.

Each visible option represents an entire conversion strategy or algorithm bundle.

---

# 13. Recommended Apple-style interaction

The main UI should remain extremely simple.

Conceptually:

```text
┌───────────────────────────────┐
│                               │
│       PIXEL ART PREVIEW       │
│                               │
└───────────────────────────────┘

             32 × 32

      Clean   Auto   Detailed
                ●

           ← swipe →
```

The user moves horizontally between conversion interpretations.

The preview updates immediately.

The user does not need to understand:

- reducers;
- phase;
- periods;
- quantizers;
- medoids;
- morphology;
- topology scoring;
- grid detection.

They only answer:

> Which result looks best?

---

# 14. Visible conversion profiles

The exact naming requires product testing, but a good starting set is:

- Auto
- Clean
- Detailed
- Grid
- Custom

These names describe expected visual outcomes or intent rather than mathematical implementation.

---

## Auto

Pixilate's recommended result.

Internally Auto may inspect:

- grid confidence;
- edge structure;
- detail density;
- palette characteristics;
- topology;
- source size;
- requested target size.

It selects one of the known profile strategies.

The recommendation does not need to be perfect because alternatives remain one swipe away.

---

## Clean

Prioritizes:

- strong readable clusters;
- lower noise;
- coherent shapes;
- fewer accidental isolated pixels;
- simplified palette relationships.

Possible tradeoff:

- some subtle details may disappear.

Internally this might favor stronger abstraction or categorical simplification.

---

## Detailed

Prioritizes:

- tiny features;
- thin edges;
- highlights;
- local contrast;
- texture;
- feature preservation.

Possible tradeoff:

- noisier-looking output;
- more isolated clusters;
- less traditionally clean pixel-art structure.

---

## Grid

Prioritizes:

- exact grid recovery;
- near-grid recovery;
- preservation of existing logical cell structure.

This is especially useful when an AI image already resembles enlarged pixel art.

It should gracefully fall back or report weak evidence instead of pretending a grid was confidently recovered.

---

## Custom

Custom exposes expert processing controls.

Possible controls include:

- processing route;
- grid period;
- grid phase;
- manual source grid;
- cell reducer;
- edge preservation;
- detail preservation;
- palette count;
- imported palette;
- dither;
- cleanup;
- alpha handling;
- candidate selection.

Custom must not be required for normal successful operation.

Its purpose is:

- expert experimentation;
- unusual sources;
- debugging;
- creating reusable personal presets.

---

# 15. Profiles should be algorithm bundles

A visible profile must not correspond to one low-level algorithm.

Example:

## Clean

Could internally combine:

- no-grid or weak-grid abstraction;
- area or categorical reduction;
- stronger cluster consolidation;
- conservative palette reduction.

## Detailed

Could internally combine:

- medoid representation;
- edge weighting;
- thin-feature preservation;
- weaker cleanup.

## Grid

Could internally combine:

- grid candidate generation;
- phase search;
- categorical cell voting;
- nearby-grid alternatives.

This allows Pixilate to retain sophisticated processing while exposing only simple user-facing choices.

---

# 16. Why this design may improve quality

Hiding technical settings does not necessarily reduce quality.

If each profile is benchmarked carefully, Pixilate can expose curated combinations that cover common visual priorities.

This is preferable to asking users to understand dozens of parameters.

It also reduces dependence on a universal automatic scorer.

Instead of:

```text
generate candidates
→ algorithm must perfectly choose winner
```

Pixilate can use:

```text
generate several strong candidates
→ recommend one
→ allow instant user comparison
```

The user becomes the final aesthetic judge.

This is especially appropriate because artistic preference cannot always be reduced to a scalar metric.

---

# 17. Instant-preview strategy

The interface should feel immediate.

Pixilate should avoid fully recomputing every profile whenever the user swipes.

Reusable analysis can be computed once.

Examples:

- canonical decoded pixels;
- alpha bounds;
- edge maps;
- histograms;
- grid evidence;
- connected-component information;
- source statistics.

Then profile-specific results can reuse these intermediates.

Because final output sizes may often be very small:

- `16×16`;
- `32×32`;
- `64×64`;
- `128×128`;

storing several finished candidate rasters is inexpensive.

Recommended behavior:

1. calculate Auto first;
2. calculate adjacent profile candidates;
3. cache completed results;
4. precompute remaining profiles opportunistically;
5. switch instantly among cached results;
6. invalidate affected results when target size or crop changes.

The project has not yet measured enough performance data to promise universal instant rendering, so responsiveness must be benchmarked rather than assumed.

---

# 18. Avoid combinatorial candidate explosion

Pixilate should not blindly try every combination.

For example:

```text
6 reducers
× 5 grid candidates
× 4 quantizers
× 3 cleanup modes
= 360 candidates
```

This would hurt:

- latency;
- memory;
- determinism;
- maintainability;
- explainability.

Instead, each visible profile should have a bounded recipe.

Example:

## Clean

Candidate A:

- area abstraction;
- strong cluster consolidation.

Candidate B:

- categorical abstraction;
- conservative palette reduction.

Choose between two using a narrow Clean-specific score.

## Detailed

Candidate A:

- medoid reduction.

Candidate B:

- edge-weighted reduction.

Choose using detail-survival criteria.

## Grid

Candidate A:

- strongest global grid.

Candidate B:

- strongest nearby alternative.

Choose using grid-evidence criteria.

A small targeted ensemble is preferable to brute-force search.

---

# 19. Recommended simple user workflow

The normal Pixilate conversion experience could effectively be:

## Step 1

Drop or paste an image.

## Step 2

Choose output size.

Example:

`32 × 32`

## Step 3

Swipe among results.

Example:

`Auto · Clean · Detailed · Grid · Custom`

## Step 4

Export the chosen result.

No understanding of image-processing terminology should be required.

---

# 20. Controls that should remain independent of profiles

Some settings should not unexpectedly change when switching profile.

Most importantly:

- target width;
- target height;
- crop/framing;
- Canvas versus Trim;
- transparency requirements;
- explicitly selected imported palette.

A profile determines **how** the source is converted.

It should not silently change the fundamental output contract.

---

# 21. Recommended research direction

The research program should no longer focus solely on finding:

> one universally superior conversion algorithm.

A better research question is:

> Can a small set of clearly differentiated conversion profiles collectively cover AI-generated image classes substantially better than existing tools while requiring almost no technical configuration?

That is both more realistic and more aligned with the proposed interface.

---

# 22. Required validation against existing tools

Pixilate should not claim superiority until measured.

A useful benchmark should include generated imagery from multiple services and multiple structural classes.

Generator sources should include, where redistribution and test rights allow:

- ChatGPT image generation;
- Gemini image generation;
- other commonly used image generators.

The important factor is not only model identity.

Inputs should also be classified by structure.

---

## Suggested AI-image strata

### A. Strong pseudo-grid

Looks close to genuine enlarged pixel art.

Expected best route:

- exact or approximate grid recovery.

### B. Grid with local drift

Mostly grid-like but inconsistent.

Expected best route:

- near-grid / Mixel processing.

### C. Irregular pseudo-pixel art

Pixel-like clusters without one coherent lattice.

Expected best route:

- Mixel or abstraction.

### D. Smooth pixel-art-styled illustration

Looks retro but is fundamentally normal raster artwork.

Expected best route:

- abstraction.

### E. Conventional illustration

No intended pixel grid.

Expected best route:

- abstraction.

### F. Thin-feature artwork

Weapons, antennae, hair strands, tails, connectors, outlines.

Useful for testing feature preservation.

### G. High-detail characters

Useful for testing faces, eyes, accessories, and silhouettes.

### H. Small icons and objects

Useful for measuring readability at extremely small target sizes.

### I. Background-heavy scenes

Useful for testing subject versus environment simplification.

---

# 23. Comparison tools

At minimum, evaluation should compare Pixilate against:

- SpriteFusion Pixel Snapper;
- Unfaker;
- ordinary high-quality downsampling;
- simple nearest-neighbor or area baselines.

Additional competitors can be included as research evolves.

---

# 24. Evaluation dimensions

Pixilate should be evaluated separately for:

## Exact requirements

- correct target width;
- correct target height;
- deterministic output;
- palette compliance;
- no accidental antialiasing.

## Structural quality

- silhouette preservation;
- topology preservation;
- connected thin-feature survival;
- important feature retention;
- outline continuity;
- cluster cleanliness.

## Visual quality

Artist/user judgment of:

- readability;
- recognizability;
- pixel-art appearance;
- detail preservation;
- visual noise;
- palette coherence;
- production readiness.

## Ease of use

Measure:

- whether users achieve a satisfactory result without Custom;
- number of profile switches;
- number of advanced adjustments;
- time to acceptable result;
- preference versus Unfaker manual tuning.

---

# 25. Most important success criterion

The most meaningful product-level test is not:

> Did Pixilate's Auto algorithm win every time?

It should be:

> Could users obtain a satisfactory exact-resolution result from one of the small visible profiles without needing technical settings?

For example, a strong result would be:

- Auto preferred frequently;
- when Auto is not preferred, another swipeable profile usually is;
- Custom is rarely required;
- users need substantially less tuning than in Unfaker;
- failure cases are clearly identifiable.

This better matches the proposed product experience.

---

# 26. Possible long-term quality target

A defensible long-term product claim might be:

> Pixilate converts broad classes of AI-generated raster artwork into exact-resolution pixel art using multiple target-aware conversion strategies, with several instantly comparable interpretations and minimal technical configuration.

A stronger claim could eventually be supported if benchmark evidence justifies it:

> Pixilate produces satisfactory one-click or one-swipe results on substantially more AI-generated image classes than grid-recovery-only approaches.

The following claim should be avoided:

> Pixilate perfectly converts any AI image into pixel art.

---

# 27. Open technical questions

The following questions remain unresolved.

## Grid confidence

How reliably can Pixilate distinguish:

- real grids;
- approximate grids;
- harmonics;
- repeated textures;
- subject edges;
- no-grid artwork?

## Near-grid reconstruction

Can local boundary adjustment materially improve irregular AI pseudo-pixels without moving important features incorrectly?

## Abstraction algorithms

Which methods best preserve:

- silhouette;
- eyes;
- thin features;
- important outlines;
- topology?

Potential candidates include:

- rational area;
- medoid;
- edge-aware reduction;
- categorical voting;
- structure-aware optimization.

## Candidate scoring

Can narrow profile-specific scorers select good candidates more reliably than one global quality metric?

## Profile coverage

How many visible profiles are actually necessary?

Possible answer:

- three plus Auto and Custom.

This must be validated rather than assumed.

## Performance

Can all primary candidate profiles be generated quickly enough for a camera-like swipe experience on typical desktop and mobile hardware?

## Cache invalidation

Which source-analysis stages can remain reusable when changing:

- output size;
- profile;
- palette;
- Trim;
- crop?

---

# 28. Recommended experiments

## Experiment A — Grid versus abstraction routing

Create a corpus containing:

- exact grids;
- distorted grids;
- irregular pseudo-pixels;
- smooth generated artwork.

Measure whether a deterministic detector can safely distinguish strong grid cases from weak/no-grid cases.

Important output:

- false-grid rate.

A false confident grid is potentially worse than simply using abstraction.

---

## Experiment B — Abstraction baseline

Compare:

- area reduction;
- medoid reduction;
- mode;
- edge-weighted reduction;
- structure-aware candidates.

Use exact target sizes such as:

- 16×16;
- 24×24;
- 32×32;
- 48×48;
- 64×64.

---

## Experiment C — Near-grid reconstruction

Test whether approximate-grid processing materially improves:

- grid cleanliness;
- detail retention;
- silhouette preservation

over direct abstraction.

---

## Experiment D — Profile bundles

Create initial experimental versions of:

- Clean;
- Detailed;
- Grid.

Test whether they produce visually distinct and useful tradeoffs.

Remove redundant profiles.

---

## Experiment E — Auto ranking

Use the same candidate set.

Compare:

- Auto's top choice;
- artist/user preference.

Auto does not need perfect accuracy.

Measure whether the preferred output is at least present among the visible swipeable choices.

---

## Experiment F — UX study

Give users:

- Pixilate profile-switching interface;
- Unfaker;
- SpriteFusion.

Ask them to convert the same AI-generated images to exact target dimensions.

Measure:

- success rate;
- time;
- number of settings changed;
- satisfaction;
- final-output preference.

This experiment directly tests Pixilate's intended advantage.

---

# 29. Key strategic conclusion

Pixilate's strongest opportunity is not merely:

> better grid detection.

Nor is it:

> one perfect abstraction algorithm.

The more promising system is:

```text
strong-grid recovery
+
near-grid reconstruction
+
no-grid abstraction
+
a small number of curated conversion profiles
+
instant visual comparison
```

This turns a difficult automatic artistic-choice problem into something users can resolve visually with almost no technical knowledge.

---

# 30. Product design conclusion

The desired product experience should be closer to an Apple camera control than an image-processing laboratory.

The main interface should feel:

- visual;
- direct;
- responsive;
- low terminology;
- low configuration;
- reversible;
- immediately understandable.

Sophisticated algorithms may exist internally.

They should not dominate the normal interface.

The normal question for the user should remain:

> Which version looks best?

Not:

> Which reducer, grid phase, period estimator, quantizer, and topology threshold should I use?

Custom can preserve that power for expert users without forcing complexity on everyone else.

---

# 31. Final session conclusion

The project should retain support for all three major conversion conditions:

1. exact grid recovery;
2. near-grid / Mixel reconstruction;
3. target-first no-grid abstraction.

None should globally replace the others.

For arbitrary ChatGPT, Gemini, and other AI-generated images, this hybrid approach is considerably more defensible than relying entirely on grid recovery.

The most promising UX is to expose a small set of complete processing profiles that the user can switch between instantly.

This also reduces the burden on the still-unproven automatic candidate scorer.

Pixilate does not need to mathematically determine the perfect artistic interpretation every time.

It needs to generate a small set of genuinely good, meaningfully different interpretations and make choosing among them effortless.

That is a realistic and differentiated research target.

---

## Status reminder

These conclusions refine the research direction.

They do not establish that Pixilate currently outperforms SpriteFusion, Unfaker, or other competitors.

No corresponding benchmark has yet been executed.

The following remain hypotheses requiring evidence:

- reliable grid/no-grid routing;
- superior near-grid reconstruction;
- superior target-first abstraction;
- useful profile bundling;
- good Auto ranking;
- sufficiently fast multi-profile previews;
- materially lower tuning requirements than Unfaker.

Those should be validated before public superiority claims are made.
