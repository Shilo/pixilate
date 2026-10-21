<script>
  // Plain functional test harness for the engine: no visual design, the algorithm is the product.
  import { MAX_PIXELS, encodePng } from './lib/decode.js'

  const PRESETS = [16, 24, 32, 48, 64, 96, 128]
  const ZOOMS = Array.from({ length: 16 }, (_, i) => i + 1)

  let file = $state.raw(null) // { name, mime, bytes, url }
  let info = $state.raw(null) // analyze(): { width, height, format, decode, grid, generator, suggestedSize }
  let W = $state(null) // required; never filled from detection without a click
  let H = $state(null)
  let lock = $state(true)
  // Custom (engine defaults: everything off)
  let trim = $state(false)
  let trimCells = $state(false) // trim basis 'cells' (explicit engine option, D50)
  let fit = $state('contain')
  let route = $state('candidates') // 'candidates' = convertCandidates; otherwise one convert() with route/cleanup
  let cleanup = $state(false)
  let bg = $state('off') // off | auto | key
  let key = $state('#ffffff')
  let tolerance = $state(0.03)
  let connectivity = $state(4)
  let halo = $state(false)
  let colors = $state(null) // blank = auto
  let manual = $state(false)
  let px = $state(16)
  let py = $state(16)
  // view
  let zoom = $state(8)
  let showGrid = $state(false)
  let showCuts = $state(true)
  let result = $state.raw(null) // { candidates, recommended, analysis, failed, name }
  let sel = $state(null)
  let error = $state.raw(null) // { code, message }
  let busy = $state(false)
  let canvas = $state()
  let analyzer = null
  let converter = null

  /** One job per worker; the callback gets the worker's single reply. */
  function spawn(msg, done) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data }) => { w.terminate(); done(data) }
    w.onerror = (e) => { w.terminate(); done({ error: { code: null, message: e.message || 'Worker failed to load' } }) }
    w.postMessage(msg)
    return w
  }

  function opts() {
    const rgb = [1, 3, 5].map((i) => parseInt(key.slice(i, i + 2), 16))
    return {
      targetW: W ?? null, targetH: H ?? null, // the engine validates and throws invalid-input
      trim: trim && trimCells ? { basis: 'cells' } : trim, fit, halo,
      background: bg === 'off' ? false : bg === 'auto' ? 'auto' : { key: rgb, tolerance, connectivity },
      colors: colors ?? 'auto',
      ...(manual ? { manualPeriod: [px, py] } : {}),
      ...(route !== 'candidates' ? { route, cleanup } : {}),
    }
  }

  function run() {
    converter?.terminate() // cancel a stale run
    const name = file.name
    busy = true
    error = null
    converter = spawn({ kind: route === 'candidates' ? 'candidates' : 'convert', bytes: file.bytes, mime: file.mime, opts: opts() }, (d) => {
      converter = null
      busy = false
      if (d.error) return (error = d.error)
      result = { ...d, name }
      sel = d.recommended
    })
  }

  async function load(f, name = f?.name) {
    if (!f || (f.type && !f.type.startsWith('image/'))) return (error = { code: null, message: 'Not an image file.' })
    analyzer?.terminate()
    converter?.terminate()
    busy = false
    if (file) URL.revokeObjectURL(file.url)
    result = null
    info = null
    error = null
    file = { name: (name || 'image').replace(/\.[^.]+$/, ''), mime: f.type, bytes: await f.arrayBuffer(), url: URL.createObjectURL(f) }
    analyzer = spawn({ kind: 'analyze', bytes: file.bytes, mime: file.mime }, (d) => {
      analyzer = null
      if (d.error) error = d.error
      else info = d
    })
  }

  const num = (e) => (e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber)
  function setW(v) {
    W = v
    if (lock && info && v > 0) H = Math.max(1, Math.round((v * info.height) / info.width))
  }
  function setH(v) {
    H = v
    if (lock && info && v > 0) W = Math.max(1, Math.round((v * info.width) / info.height))
  }
  function preset(p) {
    if (!lock || !info) [W, H] = [p, p]
    else if (info.width >= info.height) setW(p)
    else setH(p)
  }

  let cand = $derived(result?.candidates.find((c) => c.id === sel) ?? null)
  let report = $derived(cand?.report)
  let an = $derived(result?.analysis)

  // Display only: draw the worker's pixels; never read back from a canvas.
  $effect(() => {
    if (!canvas || !cand) return
    canvas.width = cand.width
    canvas.height = cand.height
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cand.rgba), cand.width, cand.height), 0, 0)
  })

  let cuts = $derived(report?.grid?.cuts?.x?.length ? report.grid.cuts : null)
  let swatches = $derived.by(() => {
    if (!cand) return []
    const d = cand.rgba, seen = new Set()
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
    return [...seen].sort((a, b) => a - b).slice(0, 256).map((v) => '#' + v.toString(16).padStart(6, '0'))
  })
  const json = (v) => JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x), 2)
  const fmt = (v) =>
    v == null ? '—'
    : typeof v === 'number' ? String(+v.toFixed(3))
    : Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v, fmt).join(', ')
    : typeof v === 'object' ? JSON.stringify(v)
    : String(v)

  function save(bytes, name) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const base = () => `${result.name}-${cand.id}-${cand.width}x${cand.height}`

  // Nearest-neighbour upscale on the output pixels (no canvas smoothing involved).
  function saveUpscaled(n) {
    const { width: w, height: h, rgba } = cand
    const ow = w * n, oh = h * n, out = new Uint8ClampedArray(ow * oh * 4)
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const s = (((y / n) | 0) * w + ((x / n) | 0)) * 4
      out.set(rgba.subarray(s, s + 4), (y * ow + x) * 4)
    }
    save(encodePng({ width: ow, height: oh, data: out }), `${base()}-x${n}.png`)
  }

  function onDrop(e) {
    e.preventDefault()
    load(e.dataTransfer?.files?.[0])
  }
  function onPaste(e) {
    const f = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (f) load(f, 'pasted')
  }
</script>

<svelte:window ondragover={(e) => e.preventDefault()} ondrop={onDrop} onpaste={onPaste} />

<main>
  <h1>Pixilate prototype</h1>
  <p>Research test harness: converts an image to pixel art at an exact W×H, deterministically, in your browser.</p>

  <label class="drop">
    Image (PNG, JPEG, WebP) — choose a file, drop it anywhere, or paste it:
    <input type="file" accept="image/*" onchange={(e) => load(e.currentTarget.files[0])} />
  </label>

  <fieldset>
    <legend>Target size (required)</legend>
    <label>Width <input type="number" min="1" max="1024" placeholder="W" value={W ?? ''} oninput={(e) => setW(num(e))} /></label>
    <label>Height <input type="number" min="1" max="1024" placeholder="H" value={H ?? ''} oninput={(e) => setH(num(e))} /></label>
    <label><input type="checkbox" bind:checked={lock} /> lock aspect</label>
    <span role="group" aria-label="Size presets">
      {#each PRESETS as p}<button type="button" onclick={() => preset(p)}>{p}</button> {/each}
    </span>
    <p>
      <!-- Shortcut for the common sprite case; only sets the two explicit Custom options (engine defaults stay off, AUTO-007). -->
      <label><input type="checkbox" checked={bg === 'auto' && trim && trimCells} onchange={(e) => { const on = e.currentTarget.checked; bg = on ? 'auto' : 'off'; trim = on; trimCells = on }} />
        sprite on a plain background (remove background + trim to the sprite's opaque cells)</label>
    </p>
    <p>
      {#if !file}Load an image to see a detected size.
      {:else if !info}Analysing…
      {:else if info.suggestedSize}
        <button type="button" onclick={() => ([W, H] = info.suggestedSize)}>Use detected size {info.suggestedSize[0]}×{info.suggestedSize[1]}</button>
        (grid class: {info.grid.class}, confidence {fmt(info.grid.confidence)}; evidence only)
      {:else}No size suggested (grid class: {info.grid.class}).
      {/if}
    </p>
  </fieldset>

  <details>
    <summary>Custom</summary>
    <fieldset>
      <legend>Options (defaults off)</legend>
      <p>
        <label><input type="checkbox" bind:checked={trim} /> trim (alpha &gt; 0 bounds)</label>
        <label><input type="checkbox" bind:checked={trimCells} disabled={!trim} /> to opaque cells (grid route; raster: alpha &gt; 127)</label>
        <label>Fit <select bind:value={fit}><option>contain</option><option>stretch</option><option>cover</option></select></label>
        <label>Colours <input type="number" min="1" max="256" placeholder="auto" bind:value={colors} /></label>
      </p>
      <p>
        <label>Route
          <select bind:value={route}>
            <option value="candidates">candidates (default)</option><option>auto</option><option>grid</option><option>raster</option>
          </select>
        </label>
        <label><input type="checkbox" bind:checked={cleanup} disabled={route === 'candidates'} /> Clean profile (cleanup)</label>
        {#if route === 'candidates'}<small>candidates set route and cleanup themselves; pick a route for one custom result</small>{/if}
      </p>
      <p>
        <label>Background
          <select bind:value={bg}><option>off</option><option>auto</option><option value="key">key colour</option></select>
        </label>
        {#if bg === 'key'}
          <label>key <input type="color" bind:value={key} /></label>
          <label>tolerance <input type="number" min="0" max="1" step="0.005" bind:value={tolerance} /></label>
          <label>connectivity <select bind:value={connectivity}><option value={4}>4</option><option value={8}>8</option></select></label>
        {/if}
        <label><input type="checkbox" bind:checked={halo} /> halo repair</label>
      </p>
      <p>
        <label><input type="checkbox" bind:checked={manual} /> manual period</label>
        {#if manual}
          <label>x <input type="number" min="1" step="any" bind:value={px} /></label>
          <label>y <input type="number" min="1" step="any" bind:value={py} /></label>
        {/if}
      </p>
    </fieldset>
  </details>

  <p>
    <button type="button" onclick={run} disabled={!file}>Convert</button>
    <span role="status" aria-live="polite">{#if busy}Converting…{:else if result}Done: {result.candidates.length} candidate(s).{/if}</span>
  </p>
  {#if error}<p class="error" role="alert">{error.code ? '' : 'Unexpected error: '}{error.message}</p>{/if}

  {#if result}
    <fieldset>
      <legend>Candidates</legend>
      {#each result.candidates as c}
        <label>
          <input type="radio" name="cand" value={c.id} bind:group={sel} />
          <b>{c.id}</b>{c.id === result.recommended ? ` (Recommended${result.recommendation ? `: ${result.recommendation.evidence}` : ""})` : ""}
          — {c.width}×{c.height}, {fmt(c.report.output?.colors)} colours, {c.report.warnings.length} warning(s)
        </label>
      {/each}
      {#each result.failed as f}<p class="error">{f.id} failed: {f.code} — {f.message}</p>{/each}
    </fieldset>
  {/if}

  <div class="panes">
    <section aria-label="Original">
      <h2>Original</h2>
      {#if file}
        <div class="frame">
          <img src={file.url} alt="Original input" />
          {#if cuts && showCuts && info}
            <svg viewBox="0 0 {info.width} {info.height}" preserveAspectRatio="none" aria-hidden="true">
              {#each cuts.x as c}<line x1={c} x2={c} y1="0" y2={info.height} stroke="magenta" vector-effect="non-scaling-stroke" />{/each}
              {#each cuts.y as c}<line y1={c} y2={c} x1="0" x2={info.width} stroke="magenta" vector-effect="non-scaling-stroke" />{/each}
            </svg>
          {/if}
        </div>
        <p>{info ? `${info.width}×${info.height}, ${info.format}, decode: ${info.decode}` : ''}
          {#if cuts}<label><input type="checkbox" bind:checked={showCuts} /> show cut lines</label>{/if}
        </p>
      {:else}
        <p>No image loaded.</p>
      {/if}
    </section>

    <section aria-label="Result">
      <h2>Result{#if cand}: {cand.id}{/if}</h2>
      {#if cand}
        <p>
          <label>Zoom <select bind:value={zoom}>{#each ZOOMS as z}<option value={z}>{z}×</option>{/each}</select></label>
          <label><input type="checkbox" bind:checked={showGrid} /> pixel grid</label>
        </p>
        <div class="scroll">
          <div class="frame checker">
            <canvas bind:this={canvas} class="pix" style:width="{cand.width * zoom}px" style:height="{cand.height * zoom}px">Converted {cand.width} by {cand.height} pixel art</canvas>
            {#if showGrid && zoom >= 3}<div class="gridlines" style:background-size="{zoom}px {zoom}px"></div>{/if}
          </div>
        </div>
        <p>{cand.width}×{cand.height}, {fmt(report.output?.colors)} colours. Warnings:{#if !report.warnings.length} none{/if}</p>
        {#if report.warnings.length}<ul>{#each report.warnings as w}<li>{w}</li>{/each}</ul>{/if}
        <p>
          <button type="button" onclick={() => save(cand.pngBytes, `${base()}.png`)}>Download PNG</button>
          <button type="button" onclick={() => saveUpscaled(zoom)} disabled={zoom < 2 || cand.width * cand.height * zoom * zoom > MAX_PIXELS}>Download ×{zoom} upscaled</button>
        </p>
      {:else}
        <p>No result yet.</p>
      {/if}
    </section>
  </div>

  {#if report}
    <section aria-label="Report">
      <h2>Report ({cand.id})</h2>
      <dl>
        <dt>Input</dt>
        <dd>{fmt(report.input?.width)}×{fmt(report.input?.height)}, {fmt(report.input?.format)}, decode: {fmt(report.input?.decode)}</dd>
        <dt>Grid (shared analysis)</dt>
        <dd>
          {#if an?.grid}
            class {fmt(an.grid.class)}, confidence {fmt(an.grid.confidence)}, suggested size {fmt(an.suggestedSize)},
            ambiguous {fmt(an.grid.ambiguous)}
            {#if an.grid.candidates?.length}
              <br />alternative exact factorizations:
              {an.grid.candidates.map((c) => `${c.sx}×${c.sy} px → ${c.countX}×${c.countY}`).join('; ')}
            {/if}
            {#if an.grid.evidence?.length}<ul>{#each an.grid.evidence as e}<li>{e}</li>{/each}</ul>{/if}
          {:else}—{/if}
        </dd>
        <dt>Grid used</dt>
        <dd>{#if report.grid}native {fmt(report.grid.native)}, period {fmt(report.grid.period)}, phase {fmt(report.grid.phase)}, elastic {fmt(report.grid.elastic)}
          <!-- evidence added during conversion (kernel fit, octave lock), beyond the shared analysis lines -->
          {@const extra = (report.grid.evidence ?? []).filter((e) => !(an?.grid?.evidence ?? []).includes(e))}
          {#if extra.length}<ul>{#each extra as e}<li>{e}</li>{/each}</ul>{/if}
        {:else}—{/if}</dd>
        <dt>Generator</dt>
        <dd>
          {#if an?.generator}
            {fmt(an.generator.family)} {an.generator.model ?? ''} ({fmt(an.generator.confidence)}; file metadata claims only, signature not checked; report-only)
            {#if an.generator.evidence?.length}<ul>{#each an.generator.evidence as e}<li>{e}</li>{/each}</ul>{/if}
          {:else}—{/if}
        </dd>
        <dt>Route / path</dt>
        <dd>{fmt(report.route)} / {fmt(report.path)}</dd>
        <dt>Fit</dt>
        <dd>{fmt(report.fit)}</dd>
        <dt>Trim</dt>
        <dd>{report.trim?.enabled ? `box ${fmt(report.trim.box)} (alpha ${report.trim.comparison} ${report.trim.tau}${report.trim.basis ? `, basis ${report.trim.basis}` : ''})` : 'off'}</dd>
        <dt>Background</dt>
        <dd>
          mode {fmt(report.background?.mode)}, applied {fmt(report.background?.applied)}, reason {fmt(report.background?.reason)},
          removed {fmt(report.background?.removed)}, estimate {fmt(report.background?.estimate)}, tolerance {fmt(report.background?.tolerance)},
          connectivity {fmt(report.background?.connectivity)}, halo changed {fmt(report.background?.halo?.changed)}
        </dd>
        <dt>Cleanup</dt>
        <dd>profile {fmt(report.cleanup?.profile)}, changed {fmt(report.cleanup?.changed)}</dd>
        <dt>Alpha policy</dt>
        <dd>{fmt(report.alphaPolicy)}</dd>
        <dt>Output</dt>
        <dd>
          {fmt(report.output?.width)}×{fmt(report.output?.height)}, {fmt(report.output?.colors)} colours (allowed {fmt(report.output?.colorsAllowed)}),
          transparency: {report.output?.transparent ? 'yes' : 'no'}
          <div>{#each swatches as s}<span class="swatch" style:background={s} title={s}></span>{/each}</div>
        </dd>
        <dt>Canonical hash</dt>
        <dd><code>{cand.hash}</code></dd>
        <dt>Timings (ms)</dt>
        <dd>{Object.entries(report.timingsMs ?? {}).map(([k, v]) => `${k}: ${fmt(v)}`).join(', ') || '—'}</dd>
      </dl>
      <details><summary>Recipe</summary><pre>{json(report.recipe)}</pre></details>
      <details><summary>Raw report JSON</summary><pre>{json(report)}</pre></details>
    </section>
  {/if}
</main>
