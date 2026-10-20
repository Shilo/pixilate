# Pixel-Art Quality Metrics And Evaluation Protocol

Last reviewed: 2026-10-19. Moved from `prototype-v1/` and aligned with the benchmark methodology on 2026-10-19.

Purpose: define "good pixel art" in measurable, deterministic terms so the client-side pixel downscaler (the owner-requested Vite + Svelte research prototype in `prototype/`, which turns AI-generated pseudo pixel art into true pixel art at an exact requested size) can be tested and tuned objectively. This document turns pixel-art craft rules into automatic metrics with exact definitions, defaults, pseudocode, and known false positives. It then specifies the evaluation protocol: a synthetic ground-truth benchmark, a blind real-image benchmark, a failure-mode taxonomy, regression gates, and fair comparison against existing tools. It defines how results are scored. The companion [AI artifact characterization](ai-artifact-characterization.md) covers the real-world AI artifact patterns, which supply the degradation parameters used here.

**Notice.** Product, company, and model names may be trademarks of their respective owners. Pixilate is independent and is not affiliated with, endorsed by, or sponsored by any generator vendor or tool named here. Licence notes are engineering triage, not legal advice.

Claim labels: **[source]** means a cited reference supports the claim (short name in brackets, full URL under Sources); **[source: PixelLab Pip]** means a finding reported in the separate public [PixelLab Pip](https://github.com/Shilo/pixellab-pip) research repository, not reproduced in Pixilate; **[local-measured]** means measured in this project's prototype harness on named fixtures; **[inferred]** means a design decision or derivation made here; **[unverified]** means plausible but not confirmed. Every numeric threshold is **[inferred]** and is only a starting value until it has been calibrated (see [Threshold Calibration](#threshold-calibration)).

Relationship to Pixilate's methodology: this document proposes prototype metrics. The [benchmark methodology](benchmark-methodology.md) governs corpus rights, strata, splits, truth levels, statistics, goldens, competitor capture and claims; where they differ, the methodology wins. Label mapping to the [shared vocabulary](../README.md#how-to-read-the-evidence): [source] → VERIFIED (or CODE-DERIVED when the source is a pinned code revision); [source: PixelLab Pip] → a cited external observation, INFERRED at most for Pixilate; [local-measured] → OBSERVED (results that involve local-only fixtures are OBSERVED, local-only, not rights-cleared); [inferred] → INFERRED; [unverified] → UNKNOWN. Every numeric threshold here is `PROVISIONAL-PILOT` (methodology §16.2).

## Conventions

| Symbol | Meaning |
|---|---|
| `O` | Converter output, `W×H` RGBA, at the user-requested size. |
| `G` | Ground-truth pixel art, same size as `O` (synthetic benchmark only). |
| `S` | Source AI image (large, pseudo-pixel), when available. |
| `K_req` | Requested palette budget, if the user set one. |
| `idx(p)` | Palette index of pixel `p`. One index per exact opaque RGB value. All fully transparent pixels share one label `T`, whatever their RGB. |
| `opaque(p)` | `alpha(p) >= 128` in binary-alpha mode. Partial alpha is counted separately (Q2). |
| `N4`, `N8` | 4- and 8-neighbourhoods. Pixels outside the image count as transparent (sprites) or as "no pixel" (opaque art). |
| `L, a, b` | OKLab coordinates of a palette entry [source: Ottosson]. |
| `dE(i, j)` | Euclidean OKLab distance, the same measure CSS Color 4 calls deltaEOK [source: CSS Color 4 discussion]. It is a fast diagnostic, not CIEDE2000; any colour-accuracy claim uses a verified CIEDE2000 (methodology §10.4). |
| component | 8-connected set of same-index pixels. 8-connectivity follows the pixel-art convention that diagonal steps continue a line [inferred]. |
| coherent | Pixel in a component of size `>= 4`, following the coherence idea of colour coherence vectors [source: Pass et al.]. |
| `B` | Silhouette boundary: opaque pixels with an `N4` neighbour that is transparent, or that is the background colour when the art is opaque. |

Implementation rules for every metric [inferred]:

- Compute OKLab once per palette entry (at most a few hundred entries), not once per pixel.
- Compare squared distances against squared thresholds, so decisions use only `+ − × ÷`. IEEE 754 rounds these exactly, so they give the same result in every engine. ECMAScript leaves `Math.cbrt` and `Math.pow` *implementation-approximated* [source: CSS WG note on cbrt]. Ship the sRGB-decode table as constants and use a fixed Newton iteration for the cube root, so last-bit differences between engines cannot flip a threshold or a tie.
- Break ties by lowest palette index, then raster order.
- Emit one flat JSON record per output, keyed by metric ID, so regression tests can diff it.
- An inapplicable or empty metric (no GT features, no recoverable cells, empty palette) is `null` with a reason, never 0 or 1 (methodology §10).
- Every metric below is `O(W·H)`, `O(K²)`, or linear in the number of boundary edges.

## Craft Rules → Measurable Proxies

The craft vocabulary below is consistent across the references consulted. Cell text paraphrases each source.

| Concept | Craft definition | Measurable proxy | Metric |
|---|---|---|---|
| Mixels | Pixels of inconsistent size within one piece [source: mixel definitions]. Community posts attribute a "never mix resolutions" rule to *Pixel Logic* [unverified: secondhand]. | Hidden-upscale blocks, duplicated lines, and cell footprints that straddle source seams. | Q13, S1, S2 |
| Orphan / stray pixels, noise | Isolated pixels that add information without adding meaning. They are acceptable only as deliberate details such as specular highlights, small essential features, or AA buffers [source: Pixel Joint tutorial; Wayline]. | Singleton pixels classified as AA, dither, accent, or noise; fragmentation. | Q4, Q5 |
| Jaggies | Steps of uneven length that break a line's flow. Curves need segment lengths that change gradually. Jaggies can be reduced but never removed [source: Derek Yu; Pixel Joint; Les Forges ch. 2]. | Spikes in the run-length sequence along a contour. | Q6 |
| Doubles / pixel-perfect lines | Extra pixels that thicken a 1px line, usually L-shaped corners. "Pixel-perfect" stroke modes remove them [source: Clip Studio tips; Krita GSoC note on Aseprite pixel-perfect]. Clean slopes are 0:1, 1:2, 1:1, 2:1, and 1:0 [source: Les Forges ch. 2]. | Redundant L-corner pixels on 1px strokes. | Q7 |
| Banding | Adjacent segments of different colours that line up their endpoints on a shared axis, or that hug each other in staircases. Banding exposes the grid [source: Pixel Joint; Pixel Fixer thesis]. | Count of aligned and hugging segment pairs between shading tones. | Q9 |
| Pillow shading | A strong form of banding: concentric bands that follow the outline instead of a light direction [source: Pixel Fixer thesis; Pixel Joint]. | Edge-band darkening that does not depend on direction. | Q10 |
| Over-AA vs selective AA | Hand-placed intermediate colours at step corners, using only as much as needed. Too much AA blurs. Outer-edge AA is discouraged when the background is unknown [source: Pixel Joint; Derek Yu; Pixel Parmesan]. | Blend pixels: transition depth across edges, and how often blends sit at step corners. | Q8, Q2 |
| Outline / selout | One-pixel outlines, where selective outlining replaces black with ramp colours and lightens the lit side [source: Derek Yu; Pixel Joint]. | Dark-outline coverage of the silhouette and outline-to-interior contrast. For small icons, PixelLab Pip found that outline coverage tracked perceived quality and orphan count did not ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip]. | Q11 |
| Palette size, ramps, hue shift | Small palettes; 16 or 32 colours are common [source: Derek Yu]. Colours are organised into ramps ordered by lightness. Hue shifts warmer toward highlights, up to about 20° per step in HSB, with even contrast between steps [source: Slynyrd]. | Colour count against budget, near-duplicate pairs, rare colours, palette separation, ramp statistics. | Q3 |
| Dithering | Patterned mixing that bridges two colours. Use it to taper edges rather than fill areas, and use less of it as contrast rises [source: Pixel Joint; Derek Yu]. | Checkerboard regions, how ordered they are, and near-identical pairs that dither for no benefit. | Q12 |
| Readability at 1×, silhouette, contrast | Small art needs value contrast and a recognisable silhouette. Magnification flatters illegible art ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)); the silhouette test fills the sprite with one colour [unverified: glossary seen only in search summaries]. | Silhouette IoU and fragmentation, value spread. Final judgement is human, at 1×. | Q14, G7, rubric |

PixelLab Pip's icon contract states the jaggy tolerance used here: normal stair-stepped diagonals are fine, and stepping is a failure only when it hurts readability or shape clarity ([icon reference](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/skills/pixellab-pip/references/icon.md)).

## Intrinsic Metrics (Output Only)

These metrics need only `O`. Most craft "defects" are sometimes intentional, so on the synthetic benchmark each Q metric is also reported as a **defect delta** against ground truth (G10). An absolute ceiling is applied only after calibration on real pixel art.

### Q1 — Size And Format Contract

`O` is exactly the requested `W×H` and has no NaN or empty output. In binary-alpha mode the alpha channel holds only 0 and 255. When `K_req` is set, `K_out <= K_req`. Two runs on the same canonical RGBA input give identical canonical RGBA (`pixilate/canonical-rgba/v1` hash); encoded-PNG byte identity is a separate claim (methodology §10.7). This mirrors PixelLab Pip's size and alpha fact checks in [inspect_images.py](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/skills/pixellab-pip/assets/inspect_images.py) (`size`, `alpha_extrema`, `bounds`) [source: PixelLab Pip]. It has no false positives: it is a hard contract.

### Q2 — Alpha Cleanliness

```
partial      = count(p : 0 < alpha(p) < 255)
islands      = opaque components (ignoring colour) with area <= 2 that are not 8-connected to the largest silhouette component
pinholes     = transparent components with area <= 2 that are fully enclosed by opaque pixels
fringe       = count(p in B : dE(p, bg_removed) < 0.05 and the colour of p appears nowhere outside B)
outer_blend  = count(p in B : p is a Q8 blend pixel between the interior and bg_removed)
```

`bg_removed` is the background colour that was keyed out (white, a fake checkerboard, or a detected flat colour). PixelLab Pip's 16px spike reported "anti-aliased (partial-alpha) pixels" as one of its signals ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip].

Defaults [inferred]: `partial = 0` and `fringe = 0` in binary mode. `islands`, `pinholes`, and `outer_blend` are reported, and gated by delta on synthetic data.

False positives: detached particles in VFX sprites (sparks, droplets); intentional holes such as chain links or eyes cut out; legitimate light-coloured rim pixels when the subject really is white.

### Q3 — Palette Count, Near Duplicates, Rare Colours

```
K_out        = number of distinct opaque RGB values
dup_pairs    = pairs (i, j) with dE(i, j) < TAU_DUP
dup_touching = dup_pairs whose colours are N4-adjacent somewhere      # these create muddy, invisible edges
rare         = colours used by <= 2 pixels, or by < 0.1% of opaque pixels
separation   = 10th percentile, over palette entries, of the distance to the nearest other entry
```

Ramps, informational only:

- Cluster chromatic entries (OKLCh chroma `>= 0.03`) by hue, starting a new ramp at any hue gap `>= 30°`. All achromatic entries form one ramp.
- Per ramp, report the member count, the median lightness step between consecutive members, and the hue drift (signed hue change per unit L).

Defaults [inferred]:

- `TAU_DUP = 0.03`. CSS Color 4 uses `0.02` as its deltaEOK gamut-mapping "JND" constant; that is a spec constant, not a measured perceptual threshold [source: CSS Color 4 discussion].
- `dup_touching = 0` for outputs with `K_out <= 32`.
- `K_out <= K_req` is a hard rule (Q1).
- A median ramp lightness step `< 0.04` flags possible over-shading.

PixelLab Pip's Workbench `score` cites "near-duplicate colors and singleton colors" ([Workbench spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-pixelart-workbench-research-spike.md)) [source: PixelLab Pip].

False positives:

- Raw colour count is not a quality proxy. PixelLab Pip found a 9-colour illegible icon and an 81-colour clean one, and readable 283-colour 32px sprites ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip]. Treat `K_out` as a budget contract, never a quality score.
- Near duplicates are deliberate in atmospheric backgrounds and subtle gradients.
- Monochrome or 1-bit styles have no hue shift by design.
- PixelLab Pip's "muddy mid-grey %" signal failed to generalise because grey is the local colour of some subjects. Do not reuse it as a gate [source: PixelLab Pip].

### Q4 — Orphan Pixels, Classified

```
for each opaque p:
    if any N8 neighbour q has idx(q) == idx(p): continue        # not an orphan
    if any N8 neighbour q has dE(p, q) < TAU_DUP: near_orphan += 1; continue   # palette problem, see Q3
    if p is inside a Q12 dither region:                          class = DITHER
    elif p sits at a step corner of a boundary between coherent colours A and B,
         and L(p) lies between L(A) and L(B):                    class = AA
    elif all N8 neighbours are opaque and L(p) is the strict max or min of its 3×3 window:
                                                                 class = ACCENT   # eye, highlight, pupil
    else:                                                        class = NOISE
report counts per class; gate on noise_rate = NOISE / opaque_count
```

Defaults [inferred]: on synthetic data, introduced noise (`NOISE(O) − NOISE(G)`) must be at most `max(1, 0.2%)` of opaque pixels. On real images, report the noise rate and set a ceiling from the 95th percentile of good pixel art (see calibration).

False positives:

- Stars, snow, sparks, sparkle VFX, and texture noise in grass or gravel. These are singletons by design.
- The dots on `i` and on punctuation in pixel fonts.
- Mid-tone accents that are neither the max nor the min of their window.

PixelLab Pip found that orphan count alone did not track perceived quality: guardrailed 32px Pro icons had more orphans than 16px ones yet looked far cleaner, because outline coverage dominated ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip]. Never use Q4 alone, and always check it against G8 small-feature recall: cleanup that deletes eyes or highlights is a failure even if it lowers Q4. Report Q4 alongside the six orphan/noise diagnostics of methodology §10.3, per 1,000 visible pixels.

### Q5 — Fragmentation And Local Noise

```
frag      = components per 100 opaque pixels
coherence = fraction of opaque pixels that are coherent (component size >= 4)
speckle   = fraction of opaque pixels whose 3×3 window holds >= 5 distinct indices
```

These are the "region fragmentation" and "per-colour coherence" signals PixelLab Pip used to diagnose 16px icons ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip]. Coherence follows colour coherence vectors [source: Pass et al.].

Defaults [inferred]: gate as a delta on synthetic data (`speckle(O) − speckle(G) <= 0.01`). Report only on real images until calibrated.

False positives: dense detailed scenes, dithered areas, intentionally textured surfaces, and very small sprites, which fragment naturally.

### Q6 — Jaggy Score (Line-Step Regularity)

Contours are boundaries between two colours with `dE >= 0.08` where both components have area `>= 6`, plus the silhouette boundary. This excludes subtle shading-tone edges and dither interiors.

```
for each contour, trace it as an 8-connected chain of boundary pixels
split the chain into pieces whose moves use only one axial direction and one adjacent diagonal
    (two consecutive orthogonal axial moves end the piece; Q7 counts them separately)
for each piece with >= 4 runs:
    r[1..n] = lengths of runs along the piece's dominant direction; drop r[1] and r[n] (truncated)
    for i in 2..n-1:
        d1 = r[i] - r[i-1];  d2 = r[i+1] - r[i]
        if d1 * d2 < 0 and |d1| + |d2| >= 3: jaggies += 1     # e.g. 3,1,3 or 4,2,3
    steps += n - 2
jaggy_rate = jaggies / steps
```

This rule tolerates normal line stepping: Bresenham alternation such as `2,3,2,3` (sum 2) and gradual curve progressions. It flags the uneven steps the craft sources call jaggies. Defaults [inferred]: synthetic gate `jaggy_rate(O) − jaggy_rate(G) <= 0.01`.

False positives: intentionally angular or organic forms (fur, hair tufts, flames, foliage, rock), sword tips and pommels [source: Les Forges ch. 2], pixel-font glyphs, and very short pieces (skipped below 4 runs).

### Q7 — L-Corner Doubles

```
thin(p) = no 2×2 window containing p is entirely idx(p)              # p is on a 1px stroke
for each opaque p with thin(p), and each perpendicular neighbour pair (a, b) in {(E,S), (S,W), (W,N), (N,E)}:
    if idx(a) == idx(b) == idx(p)
       and p's same-index N8 neighbours are exactly {a, b}           # p is redundant: a and b touch diagonally
       and not (pixel beyond a, along p→a, has idx(p) and pixel beyond b, along p→b, has idx(p)):
                                                                     # two straight arms = true right-angle corner, keep
        doubles += 1
double_rate = doubles per 100 thin pixels
```

This counts the corner pixels that pixel-perfect stroke modes remove [source: Krita GSoC note on Aseprite pixel-perfect]. Defaults [inferred]: synthetic gate `double_rate(O) − double_rate(G) <= 0.5`.

False positives: deliberate line-weight variation, tapered strokes, L-shaped eyes and mouths, pixel fonts, and 1px shading clusters that are not lines.

### Q8 — Edge Blur And AA Selectivity (Muddy AA)

```
blend(p) = p is not coherent and, for some opposite neighbour pair (left/right, up/down, or a diagonal pair)
           with coherent colours A != B:
           the distance from p to segment AB in OKLab is < 0.03, and the projection parameter t is in (0.15, 0.85)
for each boundary between coherent regions, walk along the boundary normal (the nearest axis):
    depth = number of consecutive blend pixels whose t moves monotonically from A to B
blur_coverage = boundary length with depth >= 2 / total boundary length
selectivity   = depth-1 blend pixels at step corners (where the boundary changes row or column)
                / all depth-1 blend pixels
```

Interpretation [inferred]:

- Hand AA is mostly depth 1 and sits at step corners, so selectivity is high.
- Resampling blur from AI images or bilinear downscales gives depth `>= 2` and an even halo along straight edges, so selectivity is low.

Defaults [inferred]: synthetic gate `blur_coverage(O) − blur_coverage(G) <= 0.01`. Real-image starting ceiling `blur_coverage <= 0.05`. Selectivity is informational.

False positives: intentional gradients (skies, glows, VFX), stacked AA on long segments [source: Pixel Parmesan], and painterly high-colour pixel art.

### Q9 — Banding Pairs

Banding matters here even though it is an artistic issue: quantising a smooth AI gradient posterises it into parallel contour bands, so a converter can *introduce* banding [inferred].

```
for each pair of adjacent rows (then repeat for columns):
    runs = maximal same-index horizontal runs of length >= 2, excluding outline-class colours
    for each vertically adjacent run pair (a, b) with idx(a) != idx(b) and 0.03 < dE(a, b) < 0.25:   # shading tones
        if a.start == b.start and a.end == b.end:               aligned += 1
        elif a.start - b.start == a.end - b.end and |a.start - b.start| == 1:
                                                               hugging += 1   # staircase shifted by one
band_rate = (aligned + hugging) / adjacent shading-tone run pairs examined
```

Outline class = colours with `>= 50%` of their pixels in `B` or on thin strokes, and with mean L below the image's median L [inferred]. The metric follows the Pixel Fixer thesis, which evaluated with an error count of banded segment pairs [source: Pixel Fixer thesis]. Defaults [inferred]: synthetic delta `<= 0.02`; real images informational.

False positives: architecture, UI, tiles, and other rectilinear art, where aligned runs are correct.

### Q10 — Pillow Index (Informational)

```
for each silhouette component with area >= 64:
    d(p)       = chessboard distance to the nearest pixel outside the component; outline-class pixels removed first
    edge_band  = { p : d(p) <= 2 };  core = { p : d(p) >= 3 }
    darkening  = mean L(core) − mean L(edge_band)
    sectors    = 8 angular sectors of edge_band around the component centroid
    direction  = max(sector mean L) − min(sector mean L)
    pillow     = darkening > 0.05 and direction < 0.5 · darkening
```

Removing the outline first matters: a uniform dark outline would otherwise always look pillowed [inferred]. Report this metric only; it is not a gate.

False positives: emissive orbs, front-lit or ambient-lit spheres, and glow effects.

### Q11 — Outline Coverage And Contrast

```
for p in B:
    q = mean of p's opaque N4 neighbours that are not in B          # inward sample
    is_outline(p) = L(p) <= L(q) − 0.05 or idx(p) is in the outline class
coverage = |{p in B : is_outline(p)}| / |B|
gaps     = maximal runs of non-outline pixels along the traced boundary
contrast = median over B of |L(p) − L(q)|
bg_contrast[bg] = 10th percentile over B of |L(p) − L(bg)|, for bg in {black, white, mid-grey} (transparent art)
                  or for the actual background (opaque art)
```

This generalises PixelLab Pip's "boundary that is dark outline" / "dark-outline coverage" signal, which measured 93–100% on clean Pixen icons against 56–62% on muddy 16px Pro icons ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip]. Defaults [inferred]: synthetic delta `coverage(O) >= coverage(G) − 0.03`.

False positives: selout lightens the lit side by design and lowers coverage [source: Derek Yu]. Lineless or flat styles have no outline at all. Use the delta, never an absolute floor, unless the user asked for an outline.

### Q12 — Dither Order (Informational, One Gate)

```
checker(p)    = all four N4 neighbours share one index j != idx(p), and all four diagonals equal idx(p)
regions       = 8-connected clusters of checker pixels with size >= 6
dither_area   = sum of region sizes / opaque_count
weak_dither   = regions whose two colours have dE < TAU_DUP              # pointless; reads as noise
order(region) = fraction of 2×2 windows in the region's bounding box that match a checkerboard or a 1:3 ordered pattern
```

Default [inferred]: `weak_dither = 0`. On synthetic data, GT dither must be preserved (G8).

False positives: 1-bit art and fabric or mesh textures, where checkerboards are content.

### Q13 — Mixel Detector, Output Only (Hidden Upscale, Duplicated Lines)

A wrong scale estimate leaves blocks larger than one pixel inside a supposedly 1× output. A non-integer resample stretches some source cells across two output pixels.

```
for k in {2, 3, 4}:
    for each phase (ox, oy) in [0, k)²:
        u[ox, oy] = fraction of k×k blocks aligned at (ox, oy) that hold a single index
    hidden_upscale[k] = max(u) − median(u)          # genuine 1× art is roughly phase-invariant
dup_cols = count of x where column x equals column x+1 and column x has >= 2 index transitions
dup_rows = the same for rows
dup_ratio = (dup_cols + dup_rows) / (W + H)
also report: the dominant period of the duplicate-line indicator (via autocorrelation), which reveals the scale error
```

Defaults [inferred]: flag `hidden_upscale[2] > 0.3` and `dup_ratio > 0.05`. Gate on both as a delta on synthetic data.

False positives: chunky deliberate styles (art drawn at 2× on purpose), symmetric sprites with repeated mirrored columns, and flat UI panels.

### Q14 — Value Contrast And Readability Proxies (Informational)

```
value_range = L at 95th percentile − L at 5th percentile, over opaque pixels
value_bands = number of clusters of palette L values separated by gaps >= 0.05
sil_parts   = number of opaque components, ignoring colour
sil_holes   = number of enclosed transparent components
```

Readability is ultimately a human 1× judgement. These proxies only flag collapses, such as a value range that shrinks relative to the source or a silhouette that splits. Report them only; they are not gates.

False positives: deliberately low-contrast styles (fog, night scenes, pastel palettes), and multi-part sprites (detached weapons, particles) that split by design.

## Source-Referenced Metrics (No Ground Truth)

These use `S` and each output pixel's footprint rectangle in source coordinates: the converter's detected grid, or a uniform `W×H` division.

### S1 — Seam Alignment (Intra-Cell Edge Energy)

```
g(x, y) = dE(S(x,y), S(x+1,y)) + dE(S(x,y), S(x,y+1))           # source edge strength in OKLab
for each output cell c with footprint F_c:
    I_c = F_c eroded by m = max(1, floor(0.15 · cell size))
    E_in += sum of g over I_c;   E_all += sum of g over F_c
ise = E_in / E_all          # low = source seams fall on cell borders
keep ise per cell as a heatmap; untracked drift shows as a band of high values
```

S1 directly measures the root cause of mixels: cells that straddle source blocks. It is the scoring counterpart of the grid-recovery spike's "quantize last on eroded cell interiors" recommendation ([grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md)) [source: PixelLab Pip].

Default [inferred]: report only, plus the G-RATCHET check. False positives: off-native targets, where every cell legitimately merges several source blocks so `ise` rises; heavy source noise or JPEG ringing, which adds interior energy that no grid can avoid; and Case B sources with no grid at all.

### S2 — Cell Purity

For each cell, purity is the fraction of its eroded-interior source pixels within `dE < 0.05` of the output colour. Report the median and the 10th percentile. Low purity marks noise, cell straddling, or a poor representative colour. Report only. False positives: intra-cell gradients or dithering in the source, which a single output colour can never match, and off-native targets.

### S3 — Reconstruction Fidelity

Nearest-neighbour upscale `O` onto `S` through the cell footprints, then report:

- mean and 95th-percentile `dE` over opaque cell interiors;
- SSIM on the L channel [source: Wang et al.];
- mean signed `ΔL`, `Δa`, and `Δb`, which detect global colour shift.

This is a deterministic, simplified version of rate-distortion downscaling assessment, which scores a downscaler by how well its low-resolution result reconstructs the original [source: IDA-RD]. Caveat [inferred]: S3 rewards copying AI blur and noise into the output, so it conflicts with Q4, Q5, and Q8. Report S3 alongside a cleanliness score as a trade-off (a Pareto plot) and never gate on S3 alone. Its job is to catch "clean but wrong" outputs: flattened detail, wrong colours, or shifted features.

## Ground-Truth Fidelity Metrics (Synthetic Benchmark)

| ID | Metric | Definition |
|---|---|---|
| G1 | Exact match | `EM_all` = fraction of pixels with identical RGBA (transparent equals transparent). `EM_opaque` is the same fraction over the union of both opaque masks, so a large transparent background does not inflate the score; **gate on `EM_opaque`**. `EM_interior` excludes the outer row and column. `EM_shift` is the best EM over shifts in `{−1, 0, 1}²`: a diagnostic for off-by-one phase errors, never a gate. `EM_snap` (the harness `emSnap`) is `EM_opaque` after each output colour is replaced by its nearest GT colour within 0.05; synthetic inputs perturb every colour, so exact-RGB EM is near 0 by construction. `EM_snap_rec` (`emSnapRec`) is `EM_snap` over the cells the generator marks recoverable (its `ambiguous` mask is 0), reported next to the ambiguous share. On mixel-like (stratum M) presets, gate and report `EM_snap_rec`; raw pixel accuracy is not reported for ambiguous cells (methodology §5.3, §10.3). |
| G2 | Palette-aware colour error | Mean and 95th-percentile `dE(O(p), G(p))` over the opaque union. An alpha mismatch costs `1.0`, about the OKLab black-to-white distance [inferred]. |
| G3 | Palette recovery | Precision: share of output colours within `TAU_DUP` of some GT colour. Recall: the reverse. Both also pixel-weighted. Count error `K_out − K_gt`. |
| G4 | Structure agreement | Adjusted Rand Index between the index maps of `O` and `G`, with transparent as its own label. It scores "same regions, possibly recoloured" separately from colour accuracy [inferred]. |
| G5 | Edge F1 | Unit-edge sets: every 4-adjacent pair whose labels differ. F1 at tolerance 0 (exact set match) and at tolerance 1 (same-orientation edge within 1px, deterministic greedy one-to-one matching in raster order). A strong-edge variant uses only GT edges with `dE >= 0.1`, so shading-tone edges do not dominate. Precision, recall, and F-measure follow the boundary benchmark convention [source: Martin et al.]. The lattice is identical to the boundary map of any integer nearest-neighbour upscale, so no upscale is needed. |
| G6 | SSIM on nearest-neighbour upscales | Upscale both images ×8 (or until the short side is `>= 256`), take OKLab L in [0, 1], and use an 11×11 Gaussian window with σ = 1.5, `K1 = 0.01`, `K2 = 0.03` [source: Wang et al.]. Kept for comparability with the literature. On tiny images it largely duplicates G1 and G2. |
| G7 | Silhouette | IoU of the opaque masks, plus silhouette-boundary F1 at tolerance 1. |
| G8 | Small-feature recall | GT features are GT orphans (Q4 accents and AA), thin-stroke pixels (Q7 `thin`), and dither pixels. Recall is the share reproduced at the same position within `TAU_DUP`. `breaks` counts GT thin-stroke components that split into more than one component in `O`. This catches over-cleaning. |
| G9 | Grid estimation | Cell-size error `|ŝ − s| / s` per axis. Phase error modulo `s`. Per-seam position error at the 50th and 95th percentile, in cell units, against the generator's true seams. In auto-size mode, also `|Ŵ − W|` and `|Ĥ − H|`. **Half-cell phase:** when the true phase on an axis is within 0.05 cell of 0.5, the border cells are half cells and the cell count (N or N + 1) and a whole-axis one-cell shift are ambiguous. Both alignments are scored and the better one is kept (G1–G8 against the GT shifted by −1, 0 or +1 cell; a count error of exactly ±1 counts as 0), and the number of cases resolved this way is reported. Seam and phase errors are already invariant to whole-cell shifts. |
| G10 | Defect delta | `m(O) − m(G)` for each Q metric. A positive value means the converter *introduced* the defect. This neutralises intentional orphans, dither, and selout in the GT. |

**Same-colour tolerance uses toe-corrected L.** `EM_snap`, G3 and G8 decide "same colour" with OKLab distance where L is replaced by Ottosson's toe `L_r` (`color.js` `toeL`), the same space the converter clusters in ([design D1](../../planning/prototype-algorithm-design.md#deviations)). Reason: raw OKLab L is steep near black, so sRGB `(1,1,1)` is 0.067 from `#000` and any non-zero estimate of a black outline failed the 0.05 test although no viewer can tell them apart. The toe is stricter above L ≈ 0.3 (slope 1.12–1.16), so light colours are judged slightly harder; it is a consistency fix, not a looser gate. G2 stays raw OKLab (an error magnitude, not a match test). Measured on the AI-like synthetic presets (6 sprites × 6 presets × 2 seeds; the sprites include local-only showcase crops, so this is OBSERVED, local-only, not rights-cleared), the change alone moved `EM_snap` by −0.3 to +3.4 points per preset (largest on `drift-heavy`, dark outlines) [local-measured].

## Evaluation Protocol

### A. Synthetic Ground-Truth Benchmark

**Ground-truth corpus.** Use sources in methodology §3.1 order; AI outputs, including CC0-dedicated generator showcases, need a §3.2 admission record. Committed tests use project-owned procedural fixtures only; other sets stay local (gitignored `.local/`) and optional. Tag every case with its primary methodology stratum (§4). Stratify by:

- size: 16, 24, 32, 48, 64, 128, and 256 px;
- content: character with alpha, item icon, opaque tile, scene/background, UI and pixel font, 1-bit and dithered art, high-colour painterly pixel art, glow VFX;
- feature tags: 1px lines, dither, selective AA, outline or selout, single-pixel accents.

Include "trap" images whose correct output contains things naive cleanup would destroy: single-pixel eyes, starfields, checkerboard dither, and 1px text [inferred].

**Degradation.** Apply seeded, recorded operators in a fixed order, so every benchmark case is reproducible from `(gt_id, level, seed)`. The operator set and real-world parameter ranges come from the companion AI-artifact research. The generic families are:

- integer and non-integer upscale, with independent per-axis scale;
- sub-cell phase offset and partial border cells (crop or pad);
- cell drift: a linear ramp of cell size, or a random-walk jitter of seam positions;
- resampling-kernel blur (bilinear, bicubic, Lanczos) and Gaussian blur in cell units;
- JPEG compression, additive noise, per-cell colour jitter, intra-cell gradients;
- edge halo and AA bleed;
- fake backgrounds for alpha GT (white, checkerboard, gradient);
- small rotation and local warp.

| Level | Content | Expected behaviour |
|---|---|---|
| L0 | Clean integer nearest-neighbour upscale, phase 0. | Exact recovery. |
| L0b | L0 plus phase offset and partial border cells. | Exact interior recovery. |
| L1 | Non-integer scale plus phase. | Near-exact. |
| L2 | L1 plus drift ≤ 2%, mild blur, and JPEG quality ≥ 85. | Near-exact. |
| L3 | L2 plus JPEG 70–85, colour jitter, and halo. | High fidelity. |
| L4 | AI-like composite, parameters from the companion research. | Best effort; tracked by ratchet. |
| L5 | Warped or off-grid input: "Case B" in the [grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md). | Must not produce confident garbage. The griddiness signal should flag it. |

**Runs.** Run each GT image at each level with three seeds, in two modes:

- *known size*: target = GT size; this is the main mode, because the app is target-size driven;
- *auto size*: the converter estimates native dimensions, scored by G9.

Split by source family 60/20/20 into development, validation and release test (methodology §6.2); crops of one sheet and all derivatives of one image are one family. Tune only on development. Until such a split exists, every result is "development split, exploratory".

**Scoring.**

- Per level and stratum, report the median and 10th percentile of G1, G5, and G7, and the 90th percentile of every G10 delta.
- Report the gate failure rate per level.
- Plot breakdown curves of `EM_opaque` against each degradation parameter. The breakdown point is the severity at which the median drops below the L3 gate.
- Report 95% bootstrap confidence intervals clustered by source family, not over seeds or crops [inferred]; report the family count `n_families` beside every summary.

### B. Real-Image Benchmark (Blind Side-By-Side)

**Corpus.**

- AI pseudo-pixel images from the target generators (GPT Image, Gemini/Nano Banana, Grok, Midjourney, Flux, Stable Diffusion), spread across PixelLab Pip's benchmark categories: character, item, object, background, scene, and transparent band ([model benchmark](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-benchmark-results.md)).
- Admit an image only with a methodology §3.2 record (service, model/version, date, account tier and terms snapshot, input provenance, duplicate and trademark/likeness review); prompts alone are not provenance. Anything uncertain stays a nonredistributable local reference in a gitignored folder: no pixels in reports, never required by CI.
- Give each image two target sizes:
  - a *native guess*: a human counts the visible grid beforehand; this also serves as weak G9 ground truth;
  - one *off-native* size, for example half the native guess.

**Presentation.**

- One screen per image: the source fitted to view, then each candidate at 1× and at the largest integer nearest-neighbour zoom that fits, with no smoothing.
- Show transparent outputs on mid-grey, black, and white.
- Shuffle candidate order independently per image and keep the mapping hidden until scoring closes. This reuses PixelLab Pip's blind protocol: shuffled grids, a hidden mapping file, and rank-only review ([model benchmark](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-benchmark-results.md)) [source: PixelLab Pip].
- Reviewers judge at 1× first, because magnification flatters illegible art ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip].

**Rubric** (per image):

1. **Overall rank**, best to worst, scored as `(N − rank) / (N − 1)`: 1.0 is best and 0.0 worst, which stays comparable across different candidate counts [source: PixelLab Pip].
2. **Defect checklist**, yes/no per candidate: visible mixels or doubled cells; stray noise pixels; jaggy or broken lines; muddy or blurred edges; palette too busy or muddy; lost important detail (eyes, small features); wrong, cropped, or haloed silhouette; colour shift from the source. These reuse the style-fingerprint "cons" idea, such as `bad-low-quality-muddy` and `bad-high-detail` ([style fingerprint](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-style-fingerprint.md)) [source: PixelLab Pip].
3. **Ship-as-is score**, 1 to 5: "would use in a game without touch-up."

Comparing against naive downsampling and against hand-made pixel art in a formal user study is established practice for pixelisation methods [source: Gerstner et al.].

**Reviewers and statistics.** Everything in this list is exploratory unless preregistered under methodology §11.2 and §13.1, whose hierarchical judge × family models govern release decisions.

- Use at least three reviewers, ideally including a practising pixel artist, and let each review independently. PixelLab Pip's fingerprint pass showed that editing an agent's pre-fill anchors reviewers ([style fingerprint](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-style-fingerprint.md)) [source: PixelLab Pip].
- Measure agreement with Kendall's W on ranks and Krippendorff's α on the checklist [inferred].
- Report per-tool mean normalised rank with bootstrap confidence intervals and pairwise win rates.
- With many tools, fit a Bradley–Terry model to the pairwise outcomes. This is standard forced-choice analysis [source: BT.500 / pair-comparison summaries].
- State sample size and confidence limits the way PixelLab Pip's benchmark does ([model benchmark](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-benchmark-results.md)).

**Metric validation (required before any intrinsic metric gates real images).**

- For each Q or S metric, compute Spearman ρ against human rank and the AUC for separating checklist-flagged from unflagged candidates.
- A metric may become a real-image gate only if AUC ≥ 0.75 (`PROVISIONAL-PILOT`) [inferred]. Otherwise it stays informational.
- This rule exists because two PixelLab Pip signals looked sound and failed in practice: orphan count, and grey % ([16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md)) [source: PixelLab Pip].

### C. Failure-Mode Taxonomy

| ID | Failure mode | Typical cause | Primary metric | Secondary |
|---|---|---|---|---|
| F01 | Wrong output size or format | Contract bug | Q1 | — |
| F02 | Over-downscale: details merged, too few cells | Scale overestimated; median peak spacing hit a multiple of the true scale ([grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md)) | G9, G5 recall | S3, G8 |
| F03 | Hidden upscale: k×k blocks in the output | Scale underestimated | Q13 `hidden_upscale` | G9 |
| F04 | Phase misalignment: split or doubled lines, mixed colours | Grid offset wrong | S1, G1 `EM_shift` > `EM_opaque` | S2 |
| F05 | Untracked drift: local misalignment band | Uniform grid on a drifting source | S1 heatmap, G9 seam p95 | Q13 `dup_ratio` |
| F06 | Stretched or dropped cells | Non-integer resample to the target | Q13 `dup_ratio` and period | S1 |
| F07 | Quantisation speckle | Per-pixel or early quantisation; coin-flips between near colours ([grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md)) | Q4 NOISE, Q5 | Q3 `dup_touching` |
| F08 | Palette bloat or near duplicates | No merge step, or `k` too high | Q3 | G3 precision |
| F09 | Palette collapse: distinct regions merged | `k` too low, or merge threshold too high | G3 recall, G4 | S3 colour shift |
| F10 | Muddy AA or edge blur | Cell sampling includes the AA halo | Q8 `blur_coverage` | S2 |
| F11 | Jaggies or broken lines | Seam noise, a thin line lost in one cell | Q6, G8 `breaks` | G5 |
| F12 | Doubles or thickened lines | A line straddling two cells | Q7 | Q13 |
| F13 | Alpha defects: partial alpha, halo, islands, pinholes, erosion | Background keying or thresholding | Q2, G7 | Q11 |
| F14 | Introduced banding or pillow shading | Posterised AI gradients | Q9, Q10 | G10 |
| F15 | Over-cleaning: eyes, highlights, or dither removed | Aggressive orphan or despeckle cleanup | G8 | Q4 ACCENT drop |
| F16 | Global colour shift | Palette fitting bias | S3 signed ΔLab, G2 | G3 |
| F17 | Confident output on an off-grid input | Missing griddiness gate (Case B) | L5 flag rate | Human review |
| F18 | Non-determinism | Engine math, unordered iteration, random init | Q1 repeat hash | Cross-engine hash |

### D. Pass/Fail Gates For Automated Regression Tests

All values are initial **[inferred]**, `PROVISIONAL-PILOT` settings and are revised by calibration. Gates apply per image unless marked as medians. Committed hard gates (`G-*`) run on committed procedural fixtures only and must fail, not pass vacuously, when their case set is empty; local-only showcase and private samples run in separately skipped suites with their own gitignored baseline (methodology §3.2, §6.2). These gates are prototype regression checks, not the methodology's §16 release gates.

| Gate | Inputs | Rule |
|---|---|---|
| G-CONTRACT | Every test output | Q1 passes (exact dims, binary alpha, `K_out <= K_req`, canonical-RGBA repeat identity). Q2 `partial = 0` and `fringe = 0` in binary mode. No unexpected exception. |
| G-EXACT | L0 on identifiable fixtures (no larger valid factorization, methodology §5.1) | `EM_all = 100%`. Cell size and phase exact. `K_out = K_gt`. Every G10 delta = 0. |
| G-EXACT, offset | L0b | `EM_interior = 100%` and `EM_all >= 99%`. |
| G-TRAP | Procedural trap fixtures (thin 1-bit lines, sparse 1-px sparks, right-angle UI frame) | G8 recall `>= 0.95`, `breaks = 0`, trap set non-empty. |
| Mild (informational) | L1–L2 | `EM_opaque >= 98%`; G2 mean `<= 0.01`; G5 F1 at tolerance 0 `>= 0.95`; G7 IoU `>= 0.99`; cell-size error `<= 0.5%`; seam error p95 `<= 0.2` cell; G8 recall `>= 0.95`, `breaks = 0`. Deltas: NOISE `<= max(1, 0.2%)` of opaque, jaggy `<= 0.01`, doubles `<= 0.5`/100 thin, blur `<= 0.01`, `dup_touching = 0`, `hidden_upscale[2] <= 0.1`. |
| Moderate (informational) | L3 | Median `EM_opaque >= 90%`, each image `>= 80%`. G5 F1 at tolerance 1 `>= 0.90`. G7 IoU `>= 0.97`. Cell-size error `<= 1%`. Auto-size dims within ±1 cell per axis. Mild deltas at 2× their limits. |
| G-RATCHET | L4 on committed procedural fixtures | Ratchet against a baseline computed from committed procedural fixtures only. No median may regress more than: `EM_opaque` −1 pp, F1 −0.01, IoU −0.005, any defect metric +10% relative, S1 `ise` +0.02. G-CONTRACT still applies. A missing baseline fails; it is never written by the test run. |
| Off-grid (informational) | L5, plus a procedural true no-grid fixture (methodology §5.4) | No crash. G-CONTRACT holds. The griddiness or low-confidence flag is raised on `>= 90%` of cases. |
| Golden | Exact-truth, no-op, tie and mask cases only (methodology §15.1) | Stored canonical-RGBA hash. Ambiguous outputs use invariant goldens and metric envelopes instead. Any change fails. |

Golden and ratchet-baseline updates follow methodology §15.2: rewritten only by an explicit script (never by a test run or a routine "update snapshots"), committed separately from code and threshold changes with a golden-change note (old and new medians, reason), and reviewed independently.

Run G-CONTRACT, G-EXACT, G-TRAP and Golden on every commit. Run G-RATCHET and the informational tiers on algorithm changes. Re-run the human benchmark (B) when ratchet medians move beyond their limits, or before a release [inferred].

### E. Fair Comparison Against Existing Tools

**Candidates.**

- Astropulse `pixeldetector` and SpriteFusion `pixel-snapper`, whose algorithms PixelLab Pip has analysed ([grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md)).
- `unfake.js` and its Python port [source: unfake listings].
- Naive baselines: nearest-neighbour resize to target; box average plus median-cut or k-means quantisation.
- An oracle row (GT), as the upper bound.
- PixelLab `unzoom` / `correct-pixelart`, with three caveats:
  - they are remote services: use only approved CC0 or synthetic non-sensitive fixtures and a complete methodology §12.1 capture record;
  - they consume paid credits, so run them only with explicit owner approval and a budget cap;
  - they may re-synthesise rather than snap, and PixelLab Pip's spike left this open. Score them on intrinsic metrics and human review, and do not present them as a like-for-like snapper.

**Rules.**

1. **Pin and record.** Every run carries a methodology §12.1 capture record (product, surface, version or commit, date, every setting, cost, input hash, whether pixels left the device, repeats). Run local tools offline on identical inputs.
2. **Same contract.** Give every tool the same target size and palette budget where it supports them. If a tool cannot hit the exact size:
   - record `UNSUPPORTED` in the capability table (a service failure is `ERROR`, a refusal `REFUSED`; none becomes 0);
   - also score its native output against GT when the dimensions match;
   - otherwise label any nearest-neighbour resize to target as `adapted` (methodology §12.3) and never mix those rows with native ones.
3. **Same alpha.** Give opaque-only tools the same pre-composited background. Score alpha metrics only for tools that output transparency.
4. **Equal tuning budget.** Run each tool at its documented defaults, plus one configuration tuned on the dev split with the same search budget (for example, at most 20 configurations each). This follows PixelLab Pip's benchmark fairness rule: documented defaults plus native controls, no hand-tuning per model ([model benchmark](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-benchmark-results.md)).
5. **Non-deterministic tools.** For tools with random initialisation, such as k-means, run three or more seeds and report the mean and spread. Report determinism as its own column.
6. **No single composite score.** Report per-tier and per-stratum tables of the component metrics. Exploratory analysis may use paired statistics, because every tool sees the same images: Wilcoxon signed-rank on per-image metrics and family-clustered bootstrap confidence intervals, with Holm correction across metrics [inferred]. Decision statistics follow methodology §11.2 and §13.1.
7. **Guard against home-metric bias.** These metrics were designed alongside the app, so the app may overfit them. Keep the frozen test split, include S3, which favours other tools' fidelity, and treat the blind human benchmark as the final arbiter.

## Threshold Calibration

1. Run every Q metric on the clean GT corpus. Real good pixel art defines each intrinsic metric's false-positive floor. Set the real-image ceilings at the GT 95th percentile per stratum, and drop or demote any metric whose GT distribution overlaps heavily with degraded outputs [inferred].
2. On the synthetic benchmark, set the Mild and Moderate numbers at the first accepted version's observed 10th-percentile performance minus a small margin, then only ratchet them tighter. Numbers stay `PROVISIONAL-PILOT` until promoted through the methodology §16.2 lifecycle.
3. Revalidate on the real-image set (B) whenever a metric definition or threshold changes.

## Vocabulary Reused From PixelLab Pip

| PixelLab Pip term | Where | Used here as |
|---|---|---|
| Case A / Case B, griddiness gate, eroded-interior mode, quantise last | [grid recovery spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-ai-image-downscale-grid-recovery-spike.md) | L5 level, F17, Off-grid tier, S1/S2 |
| dark-outline coverage, orphans/img, colors/img, opaque%, partial-alpha pixels | [16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md) | Q11, Q4, Q3, G7, Q2 |
| raw colour count, orphan-colour distance, region fragmentation, per-colour coherence; "judge at 1×" | [16px spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-16px-item-sprite-generation-spike.md) | Q3, Q4, Q5; rubric |
| lint names (outline gaps, orphan pixels/clusters, jaggies, banding, pillow shading, palette mismatch); `score` near-duplicate and singleton colours | [Workbench spike](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab/pixellab-pixelart-workbench-research-spike.md) | Q11 `gaps`, Q4, Q6, Q9, Q10, Q3 |
| blind shuffled rank-only review, `(N−rank)/(N−1)`, hidden mapping, confidence caveats | [model benchmark](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-benchmark-results.md) | Protocol B |
| style "cons" tags, reviewer anchoring caveat | [style fingerprint](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/docs/pixellab-image-model-style-fingerprint.md) | Rubric checklist, reviewer independence |
| size, `alpha_extrema`, `bounds` facts | [inspect_images.py](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/skills/pixellab-pip/assets/inspect_images.py) | Q1, Q2 |
| "normal stair-stepped diagonals are fine" | [icon reference](https://github.com/Shilo/pixellab-pip/blob/293c2f57cfec249dd2052d9c948cff64246671c1/skills/pixellab-pip/references/icon.md) | Q6 Bresenham tolerance |

## Open Questions

- **Alpha policy.** Is binary alpha always required, or may the user opt into partial alpha for glows and VFX? Q2 and G-CONTRACT assume binary; the prototype records this as the named alpha policy `Binary(128)`.
- **Colour-difference measure.** Is Euclidean OKLab adequate at the small distances these thresholds use, or should near-duplicate decisions use CIEDE2000? The OKLab author tuned scaling against CIEDE2000 only near mid-grey [source: Ottosson].
- **Cross-engine determinism.** Should CI hash outputs on more than one browser engine, and must the conversion pipeline avoid `Math.cbrt`, `Math.pow`, and `Math.exp` in decision paths? Recommended: yes, with fixed-point or Newton replacements [inferred].
- **"Correct" at off-native sizes.** When the requested size is not the latent grid, no ground truth exists. Options: artist-made references at several sizes, or intrinsic plus human scoring only.
- **Corpus licensing and size.** Which CC0 or owned sets to use, and how large a committed fixture set Pixilate accepts.
- **Reviewer pool.** Who reviews, and whether a practising pixel artist is available for protocol B.
- **PixelLab baselines.** Whether to spend credits benchmarking `unzoom` / `correct-pixelart`, and with what cap.
- **Metrics in the app.** Whether the app should show any metric to users (for example, a "possible off-grid input" warning), or keep metrics test-only.
- **Q8 and Q9 constants.** The blend segment tolerance and the band ΔE window need calibration on the companion artifact data.

## Sources

Pixel-art craft:

- Derek Yu — Pixel Art Tutorial: <https://www.derekyu.com/makegames/pixelart.html>
- Pixel Joint — "Pixel Art Tutorial" consolidated thread (cure, 2010): <https://pixeljoint.com/forum/forum_posts.asp?TID=11299>
- Pixel Parmesan — Anti-Aliasing Fundamentals for Pixel Artists: <https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists>
- Slynyrd (Raymond Schlitter) — Pixelblog 1, Color Palettes: <https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes>
- Les Forges pixel-art course, chapter 2, Lines and Curves (OpenGameArt): <https://opengameart.org/content/chapter-2-lines-and-curves>
- Lospec tutorial index (MortMort, Helm, mondayjoker, and others; listing pages only, videos not reviewed): <https://lospec.com/pixel-art-tutorials/basic-anti-aliasing-for-beginners-by-mortmort>
- Pixel Logic (Michael Azzi), table of contents and reviews: <https://80.lv/articles/pixel-logic-a-pixel-art-tutorial-book/>, <https://michafrar.gumroad.com/l/pixel-logic>
- Wayline — Pixel Art for Games, Lesson 2 (jaggies, doubles, orphans): <https://www.wayline.io/learn/pixel-art/1>
- Clip Studio Tips — Pixel Art Practices Explained Simply (doubles): <https://tips.clip-studio.com/de-de/articles/5360?org=1>
- Mixel definitions: <https://ozdic.com/word/mixel>, <https://community.flowlab.io/t/mini-rant-stop-using-mixels/38287>
- Pixel-art glossary (silhouette test, banding): <https://pixnote.net/en/learn/glossary>
- Saint11 (Pedro Medeiros) tutorial index (titles only; content not reviewed): <https://saint11.art/blog/pixel-art-tutorials/>
- Not consulted in depth: AdamCYounis and Brandon James Greer (video courses), and the r/PixelArt wiki (not reached).

Research and metrics:

- Bites, R. (2025). *Pixel Fixer: Semi-Automated Techniques for Correcting Pixel Art*, TU Delft BSc thesis; supplementary data: <https://data.4tu.nl/datasets/11446578-c1f3-474c-9cc4-6978a79b675b>
- Krita GSoC 2024 notes on Aseprite and LibreSprite pixel-perfect corner removal: <https://planet.kde.org/ken-lo-2024-06-10-week-2-recap-aseprite-s-pixel-perfect>, <https://community.kde.org/GSoC/2024/StatusReports/KenLo>
- Ottosson, B. — A perceptual color space for image processing (OKLab): <https://bottosson.github.io/posts/oklab/>
- CSS Color 4 gamut-mapping discussion (deltaEOK, JND constant 0.02): <https://lists.w3.org/Archives/Public/public-css-archive/2023Mar/1227.html>
- CSS WG note on `Math.cbrt` being implementation-approximated: <https://lists.w3.org/Archives/Public/public-css-archive/2023Oct/0538.html>
- Wang, Bovik, Sheikh, Simoncelli (2004), SSIM: <https://ece.uwaterloo.ca/~z70wang/publications/ssim.html>
- Martin, Fowlkes, Malik (2004), boundary detection with precision/recall/F evaluation: <https://vision.ics.uci.edu/papers/MartinFM_PAMI_2003>
- Pass, Zabih, Miller (1996), Comparing Images Using Color Coherence Vectors: <https://dblp1.uni-trier.de/rec/conf/mm/PassZM96.html>
- Liang et al. (2024), rate-distortion image downscaling assessment (IDA-RD): <https://arxiv.org/html/2403.15139v1>
- Gerstner et al. (2012), Pixelated Image Abstraction (user-study precedent): <https://pixl.cs.princeton.edu/pubs/Gerstner_2012_PIA/index.php>
- ITU-R BT.500 and pair-comparison summaries: <https://itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.500-12-200909-S!!TOC-HTM-E.htm>, <https://www.forasoft.com/learn/video-quality/glossary/terms-vqm/pair-comparison>
- BAND-2k banding database (general-image banding, for contrast): <https://arxiv.org/pdf/2311.17752>

Existing tools:

- Astropulse pixeldetector: <https://github.com/Astropulse/pixeldetector>
- SpriteFusion pixel-snapper: <https://github.com/Hugo-Dz/spritefusion-pixel-snapper>
- unfake (Python port listing; the JavaScript original is jenissimo/unfake.js): <https://pypi.org/project/unfake/>, <https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5>
