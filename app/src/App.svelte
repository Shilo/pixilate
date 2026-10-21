<script>
  // App shell and state machine (spec §5): EMPTY → ANALYSING → NEEDS_SIZE | CONVERTING → RESULT | FAILED.
  // The worker does all decoding and conversion; this thread only draws, so the output is the engine's bytes.
  import { tick } from 'svelte'
  import Stage from './components/Stage.svelte'
  import ViewBar from './components/ViewBar.svelte'
  import StylePicker from './components/StylePicker.svelte'
  import SizePicker from './components/SizePicker.svelte'
  import Tools from './components/Tools.svelte'
  import Export from './components/Export.svelte'
  import Details from './components/Details.svelte'
  import { createClient } from './lib/client.js'
  import { ICONS } from './lib/icons.js'
  import {
    T, dims, reason, styleLabel, styleDesc, cleanLine, warningLine, errorCopy, fileError, derivation, needsHeading,
    readyStatus, subjectNote, moreLabel, bgLine, trimCaption, savedToast, copiedToast, toolsButton, sizeName, zoomTip, artLabel, topDims, STYLE_ORDER,
  } from './lib/copy.js'
  import {
    DEFAULT_TOOLS, chips, prefill, needsCase, isValid, showsFit, toEngineOpts, baseName, fileName, recipe, deriveH, deriveW,
    clampScale, recoverJob, styleIdOf,
  } from './lib/opts.js'
  import { countColours } from './lib/geometry.js'

  const SIDE_Q = '(min-width: 1024px) and (min-height: 560px), (min-width: 480px) and (max-height: 559px) and (min-aspect-ratio: 3/2)'
  const COARSE_Q = '(pointer: coarse)'
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  const shareFiles = !!navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] })
  const blankSize = (lock = true) => ({ w: null, h: null, lock, fit: 'contain', source: null, chip: null, note: null, derived: null })

  let side = $state(matchMedia(SIDE_Q).matches)
  let coarse = $state(matchMedia(COARSE_Q).matches) // follows a mouse/touch switch (convertibles, docked tablets)
  const canShare = $derived(coarse && shareFiles)
  let status = $state('empty') // empty | analysing | needs | converting | result | failed
  let file = $state.raw(null) // { name, base, bytes, mime, url }
  let info = $state.raw(null) // analysis reply
  let derivationText = $state('')
  let prefilled = $state.raw(null)
  let needs = $state(null)
  let size = $state.raw(blankSize())
  let tools = $state.raw({ ...DEFAULT_TOOLS })
  let result = $state.raw(null) // result reply + settings { size, tools, key }
  let chosen = $state(null) // sticky style override (spec id)
  let error = $state.raw(null) // engine error { code, message }
  let fileErr = $state.raw(null) // a file that couldn't be opened { code, name }
  let bgKept = $state(false) // Remove background was refused and switched back off
  let busy = $state({ pill: false, stop: false, slow: false })
  let looking = $state(false)
  let stoppedFlash = $state(false)
  let mode = $state('after'), peek = $state(false), showGrid = $state(false)
  let zoom = $state(null), fitz = $state(1), dpr = $state(1)
  let exportScale = $state(1)
  let openSection = $state(null)
  let detailsOpen = $state(false)
  let dragging = $state(false)
  let toast = $state(''), live = $state('')
  let picker, dockEl = $state()
  const btns = {}, heads = {}
  let pending = null, lastKey = null, prev = null, timers = [], toastTimer = 0, shareReady = null

  const client = createClient({ onReply, onFail })

  // ---- derived view state ----
  const shown = $derived.by(() => {
    if (!result) return null
    const a = chosen && result.alias[chosen]
    return a && result.candidates.some((c) => c.id === a) ? a : result.recommended
  })
  const cand = $derived(result?.candidates.find((c) => c.id === shown) ?? null)
  const shownStyle = $derived(styleIdOf(cand, result)) // the label the user sees (Clean that changed nothing is Smooth)
  const report = $derived(cand?.report ?? null)
  const gridReport = $derived(report?.route === 'grid' ? report : result?.candidates.find((c) => c.id === result.alias.grid)?.report ?? null)
  const overridden = $derived(!!result && shown !== result.recommended)
  const viewMode = $derived(peek && cand ? 'before' : mode)
  const z = $derived(zoom ?? fitz)
  const gridOk = $derived(viewMode === 'before' ? gridReport?.route === 'grid' : z / dpr >= 6)
  const hasResult = $derived(!!cand)
  const ready = $derived(status === 'result' && !!cand)
  const scale = $derived(clampScale(exportScale, cand?.width, cand?.height)) // the one scale every export path uses
  const toolCount = $derived([tools.background, tools.trim, tools.colors !== 'auto'].filter(Boolean).length)
  const trimBox = $derived(tools.trim && report?.trim?.box ? report.trim.box : null)
  // What the size is fitted to: the lattice in cells (or the sprite's cells with Fit to sprite) when a grid is
  // used, else pixels. Fit/Fill/Stretch appear only when the size's shape differs from it.
  const basis = $derived((gridReport ?? report)?.fit?.basis ?? (prefilled ? [prefilled.w, prefilled.h] : info ? [info.width, info.height] : [1, 1]))
  const fitShown = $derived(isValid(size) && showsFit(size, basis[0], basis[1]))
  const match = $derived.by(() => {
    if (!trimBox || !report || !isValid(size)) return null
    const L = Math.max(size.w, size.h), bw = trimBox[2] - trimBox[0], bh = trimBox[3] - trimBox[1]
    const m = report.route === 'grid' ? report.fit.basis : bw >= bh ? [L, deriveH(L, bw, bh)] : [deriveW(L, bw, bh), L]
    return m[0] <= 1024 && m[1] <= 1024 && (m[0] !== size.w || m[1] !== size.h) ? m : null
  })
  const caption = $derived(report?.trim?.enabled && status !== 'failed' ? trimCaption(report) : null)
  const saveWhy = $derived(status === 'converting' ? T.wait : status === 'failed' ? T.failedSave : !cand ? T.chooseFirst : null)
  const errInfo = $derived(error ? errorCopy(error.code) : null)
  // panel warning line: the "Also fits" hint only when such a chip exists; the colour-metadata note lives in Details
  const warnLine = $derived(report ? warningLine(report.warnings.filter((w) => !w.startsWith('colour metadata') &&
    (!w.startsWith('ambiguous') || chips(info, prefilled).some((c) => c.key.startsWith('also-'))))) : null)
  const colours = $derived(report ? report.output.colors ?? countColours(cand.rgba) : null) // Original: counted here
  const zoomText = $derived(zoom == null && fitz < 1 ? T.fitShrunk : `${Math.round(z)}×`)
  const sizeCaption = $derived(size.source === 'detected' ? T.detected : size.source === 'sprite' ? T.subject : isValid(size) ? T.yourSize : T.chooseSize)

  // ---- layout and viewport ----
  $effect(() => {
    const qs = [[matchMedia(SIDE_Q), (v) => (side = v)], [matchMedia(COARSE_Q), (v) => (coarse = v)]]
    const ons = qs.map(([q, set]) => { const on = () => set(q.matches); q.addEventListener('change', on); return on })
    return () => qs.forEach(([q], i) => q.removeEventListener('change', ons[i]))
  })
  $effect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const set = () => document.activeElement?.matches?.('input') && !side ? root.style.setProperty('--app-h', `${vv.height}px`) : root.style.removeProperty('--app-h')
    vv.addEventListener('resize', set); addEventListener('focusin', set); addEventListener('focusout', set)
    return () => { vv.removeEventListener('resize', set); removeEventListener('focusin', set); removeEventListener('focusout', set) }
  })

  /** Status region: cleared first, so the same message twice is announced twice. */
  function announce(text) {
    live = ''
    setTimeout(() => (live = text), 50)
  }
  const focusStage = () => tick().then(() => document.querySelector('.stage')?.focus({ preventScroll: true }))

  // ---- worker replies ----
  function onReply(m) {
    if (m.type === 'analysis') return onAnalysis(m)
    if (m.type === 'result') return onResult(m)
    if (m.type === 'error') {
      if (status === 'analysing' || m.code?.startsWith('decode-')) return decodeFailed(m)
      stopBusy()
      lastKey = null
      error = { code: m.code, message: m.message }
      status = 'failed'
      announce(errorCopy(m.code).message)
    }
  }
  function onFail() {
    stopBusy()
    error = { code: 'worker', message: 'worker failed to start' }
    status = 'failed'
    announce(errorCopy('worker').message)
  }

  function onAnalysis(m) {
    if (prev) { URL.revokeObjectURL(prev.file.url); prev = null }
    looking = false
    info = m
    derivationText = derivation(m)
    prefilled = prefill(m)
    needs = needsCase(m)
    size = prefilled ?? blankSize()
    if (prefilled) { announce(derivationText); return run() }
    status = 'needs'
    announce(needsHeading(needs, m))
    if (!side) openSection = 'size'
  }

  function onResult(m) {
    stopBusy()
    const first = m.candidates[0], dimsChanged = !cand || first.width !== cand.width || first.height !== cand.height
    result = { ...m, settings: pending }
    error = null
    status = 'result'
    mode = 'after'
    if (dimsChanged) zoom = null
    // A refused Remove background switches itself back off (the result would be the same) and says so.
    if (pending.tools.background && !report.background.applied) {
      bgKept = true
      tools = { ...tools, background: false, trim: info.hasAlpha ? tools.trim : false }
      return run() // announced with the next result
    }
    // Crop to subject on a detected size: switch to the subject's own detected size (a size the user picked stays)
    if (pending.tools.trim && size.source === 'detected' && match && report.route === 'grid') {
      size = { ...size, w: match[0], h: match[1], source: 'sprite', chip: 'sprite', auto: true, note: subjectNote(match[0], match[1]), derived: null }
      return run() // announced with the next result
    }
    const extra = [bgKept && T.bgKept, tools.background && bgLine(report.background), tools.trim && trimCaption(report)].filter(Boolean).join(' ')
    announce(`${readyStatus(cand.width, cand.height, shownStyle, shown === result.recommended)}${extra ? ' ' + extra : ''}`)
  }

  function decodeFailed(m) {
    looking = false
    stopBusy()
    fileErr = { code: m.code ?? 'decode-unsupported', name: file?.name ?? null }
    announce(fileError(fileErr.code, fileErr.name))
    if (file) URL.revokeObjectURL(file.url)
    if (!prev) { file = null; info = null; result = null; status = 'empty'; return }
    ;({ file, info, derivationText, prefilled, needs, size, tools, result, chosen, status } = prev)
    prev = null
    lastKey = result?.settings?.key ?? null
    client.restore(file.bytes, file.mime)
    // the restored state may have been mid-job: post it again, or the app would wait forever
    const job = recoverJob(status)
    if (job === 'analyse') { client.open(file.bytes, file.mime); looking = true }
    else if (job === 'convert') { lastKey = null; status = result ? 'result' : 'needs'; run() }
  }

  // ---- jobs ----
  function run() {
    if (!info || !isValid(size)) return
    const opts = toEngineOpts(size, tools, fitShown), key = JSON.stringify(opts)
    if (key === lastKey && (status === 'result' || status === 'converting')) return
    if (key === result?.settings?.key && status !== 'failed') {
      // back to the settings of the shown result (a tool switched on and off): cancel, never re-convert
      if (status === 'converting') { client.stop(); stopBusy() }
      lastKey = key
      status = 'result'
      return
    }
    lastKey = key
    pending = { size, tools, key }
    error = null
    status = 'converting'
    startBusy()
    client.convert(opts)
  }
  function startBusy() {
    stopBusy()
    const big = info.width * info.height > 8e6
    busy = { pill: big, stop: big, slow: false }
    timers = [setTimeout(() => (busy.pill = true), 300), setTimeout(() => (busy.stop = true), 1500), setTimeout(() => (busy.slow = true), 6000)]
  }
  function stopBusy() {
    timers.forEach(clearTimeout)
    busy = { pill: false, stop: false, slow: false }
  }
  function stop() {
    client.stop()
    stopBusy()
    if (result) {
      size = result.settings.size
      tools = result.settings.tools
      lastKey = result.settings.key
      status = 'result'
      stoppedFlash = true
      setTimeout(() => (stoppedFlash = false), 2000)
    } else {
      lastKey = null
      needs = 'stopped'
      size = blankSize(size.lock)
      status = 'needs'
      if (!side) openSection = 'size'
    }
    announce(T.stopped)
    focusStage()
  }
  // a user change dismisses an engine error only through its replacement job; a refusal note clears at once
  function setSize(s, fromChip) {
    size = { ...s, auto: false } // any size the user sets stays put
    run()
    if (fromChip && !side && openSection === 'size') toggleSection('size')
  }
  function setTools(t) {
    bgKept = false
    // the automatic subject size goes back to the detected size when Crop to subject is turned off
    if (!t.trim && size.auto && prefilled) size = prefilled
    tools = t
    run()
  }

  // ---- open ----
  async function openFile(f, name = f?.name ?? null) {
    if (!f) return
    let bytes
    try { bytes = await f.arrayBuffer() } catch { fileErr = { code: 'decode-damaged', name }; return }
    if (file && !prev) prev = { file, info, derivationText, prefilled, needs, size, tools, result, chosen, status }
    else if (file) URL.revokeObjectURL(file.url)
    file = { name, base: baseName(name), bytes, mime: f.type || '', url: URL.createObjectURL(f) }
    info = null; result = null; chosen = null; error = null; fileErr = null; bgKept = false; size = blankSize(); tools = { ...DEFAULT_TOOLS }
    lastKey = null; zoom = null; fitz = 1; mode = 'after'; showGrid = false; openSection = null; shareReady = null
    stopBusy()
    status = 'analysing'
    announce(T.analysing)
    looking = false
    setTimeout(() => { if (status === 'analysing') looking = true }, 150)
    client.open(bytes, file.mime)
    focusStage()
  }
  function onPick(e) {
    openFile(e.currentTarget.files?.[0])
    e.currentTarget.value = ''
  }
  async function example() {
    const r = await fetch(`${import.meta.env.BASE_URL}example.png`)
    openFile(await r.blob(), 'example.png')
  }

  // ---- export (Save and Share give the exact engine PNG; Copy goes through the clipboard) ----
  const pngFor = (s) => (s === 1 ? Promise.resolve(cand.png) : client.exportPng(cand.rgba, cand.width, cand.height, s))
  const outName = (s) => fileName(file.base, styleLabel(shownStyle).toLowerCase(), cand.width, cand.height, s)
  function say(text) {
    toast = text
    announce(text)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = ''), 2500)
  }
  function download(blob, name) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  async function save() {
    if (!ready) return
    const s = scale, name = outName(s)
    try { download(new Blob([await pngFor(s)], { type: 'image/png' }), name) } catch { return say(T.saveFailed) }
    say(savedToast(name))
  }
  function copyPng() {
    if (!ready || !canCopy) return
    const s = scale, w = cand.width * s, h = cand.height * s
    const blob = pngFor(s).then((b) => new Blob([b], { type: 'image/png' }))
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => say(copiedToast(w, h)), () => say(T.copyFailed))
  }
  async function share() {
    if (!ready) return
    const s = scale, key = `${cand.hash ?? shown}@${s}`
    let f = shareReady?.key === key ? shareReady.file : null
    if (!f && s === 1) f = new File([cand.png], outName(1), { type: 'image/png' }) // no await: keeps the tap's activation
    if (!f) {
      try { f = new File([await pngFor(s)], outName(s), { type: 'image/png' }) } catch { return say(T.saveFailed) }
      shareReady = { key, file: f }
    }
    navigator.share({ files: [f] }).catch((e) => {
      if (e?.name === 'NotAllowedError') say(T.shareAgain) // the export outlived the tap; the file is ready now
    }) // cancelling is silent
  }
  function saveRecipe() {
    const j = recipe({ result, shown, size: result.settings.size, derivation: derivationText, info })
    download(new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' }), `${file.base}-recipe.json`)
    say(savedToast(`${file.base}-recipe.json`))
  }
  const copyText = (t) => navigator.clipboard?.writeText(t).then(() => say(T.copy + ' ✓'), () => say(T.copyFailed))

  // ---- errors: one-tap fixes ----
  function fix(kind) {
    if (kind === 'choose') picker.click()
    else if (kind === 'trim-off') setTools({ ...tools, trim: false })
    else if (kind === 'colours-16') setTools({ ...tools, colors: 16 })
    else if (kind === 'reset-size') {
      lastKey = null
      size = prefilled ?? blankSize()
      if (prefilled) run()
      else { needs = needsCase(info); status = 'needs'; error = null }
    } else if (kind === 'retry') { lastKey = null; run() }
    else if (kind === 'reload') location.reload()
  }

  // ---- styles, zoom, sections ----
  function choose(id) { chosen = id === result.recommended ? null : id }
  function useBest() { chosen = null; focusStage() }
  function styleN(n) {
    const ids = STYLE_ORDER.filter((id) => result?.candidates.some((c) => c.id === id))
    if (ids[n]) choose(ids[n])
  }
  function zoomBy(dir, value) {
    if (value !== undefined) { zoom = value; return }
    const cur = zoom ?? fitz
    if (dir > 0) zoom = cur < 1 ? 1 : Math.min(64, Math.max(Math.floor(cur) + 1, Math.ceil(cur * 1.25)))
    else zoom = cur <= 1 ? (fitz < 1 ? null : 1) : Math.max(1, Math.min(Math.ceil(cur) - 1, Math.floor(cur / 1.25)))
  }
  const level = () => (zoom = zoom == null ? Math.min(64, Math.max(1, Math.floor(fitz)) * 2) : null)
  async function toggleSection(name) {
    const was = openSection
    openSection = was === name ? null : name
    await tick()
    if (openSection) {
      heads[openSection]?.focus({ preventScroll: true })
      heads[openSection]?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    } else btns[was]?.focus()
  }

  // ---- global input ----
  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (mod && !e.shiftKey && k === 'o') { e.preventDefault(); picker.click() }
    else if (mod && !e.shiftKey && k === 's' && ready) { e.preventDefault(); save() }
    else if (mod && e.shiftKey && k === 'c' && ready) { e.preventDefault(); copyPng() }
    else if (e.key === 'Escape' && openSection && !detailsOpen && !side) toggleSection(openSection)
  }
  function onPaste(e) {
    if (e.target?.closest?.('input, textarea, [contenteditable]')) return
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
    if (f) { e.preventDefault(); openFile(f, null) }
  }
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')
  function onDragOver(e) { if (hasFiles(e) && !detailsOpen) { e.preventDefault(); dragging = true } }
  function onDragLeave(e) { if (!e.relatedTarget) dragging = false }
  function onDrop(e) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragging = false
    openFile(e.dataTransfer.files[0])
  }
</script>

<svelte:window onkeydown={onKey} onpaste={onPaste} ondragover={onDragOver} ondragenter={onDragOver} ondragleave={onDragLeave} ondrop={onDrop} />

<input bind:this={picker} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange={onPick} />
<div class="sr-only" role="status" aria-live="polite">{live}</div>
{#if status !== 'empty'}<a class="skip" href="#save">{T.skip}</a>{/if}

<header class="top">
  <h1 class="brand">{T.app}</h1>
  <span class="file-meta num">{file && info ? topDims(file.name ?? 'pasted', info.width, info.height) : ''}</span>
  <button class="glass-pill" aria-label={T.openImage} title={T.openImage} onclick={() => picker.click()}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{@html ICONS['image-plus']}</svg>
  </button>
  {#if status !== 'empty'}
    <button class="glass-pill" aria-label={T.details} title={T.details} onclick={() => (detailsOpen = true)} disabled={!info}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.info}</svg>
    </button>
  {/if}
</header>

<main class="stage-area" class:working={busy.pill}>
  {#if status === 'empty'}
    <div class="empty">
      <div class="drop-zone">
        <span class="glass-empty__icon"><svg viewBox="0 0 24 24" aria-hidden="true">{@html ICONS['image-plus']}</svg></span>
        <h2 class="title">{T.emptyTitle}</h2>
        <p class="muted">{coarse ? T.emptyCoarse : T.emptyFine}</p>
        <div class="actions">
          <button class="glass-btn glass-btn--primary glass-btn--auto" onclick={() => picker.click()}>{T.choose}</button>
          <button class="glass-btn glass-btn--tertiary glass-btn--auto" onclick={example}>{T.example}</button>
        </div>
        <p class="small">{T.private}</p>
        <p class="small muted">{T.formats}</p>
      </div>
    </div>
  {:else if file}
    <Stage
      candidate={cand}
      source={{ url: file.url, width: info?.width ?? 0, height: info?.height ?? 0 }}
      {report} {gridReport} mode={viewMode} {showGrid} {zoom} bind:fitz bind:dpr
      dim={status === 'failed'} faded={status === 'analysing'}
      label={cand ? artLabel(cand.width, cand.height, colours, shownStyle, z) : ''}
      onpeek={(v) => (peek = v)} onzoom={zoomBy} onfit={() => (zoom = null)} onstyle={styleN}
      ontoggle={() => (mode = mode === 'after' ? 'before' : 'after')} ongrid={() => gridOk && (showGrid = !showGrid)}
    />
    {#if viewMode === 'before' && cand}<div class="tag">{T.before}</div>{/if}
    {#if status === 'failed' && cand}<div class="tag right">{T.previous}</div>{/if}
  {/if}
  {#if (looking && status === 'analysing') || busy.pill}
    <div class="progress" role="presentation">
      <div class="pill">
        <span class="spinner" aria-hidden="true"></span><span class="static-working">{T.working}</span>
        <span>{status === 'analysing' ? T.looking : T.making}</span>
        {#if busy.stop && status === 'converting'}<button class="stopbtn" onclick={stop}>{T.stop}</button>{/if}
      </div>
      {#if busy.slow}<p class="small slow">{T.slow}</p>{/if}
    </div>
  {/if}
  {#if error && status === 'failed'}
    <div class="file-banner" role="alert">
      <p>⚠ {errInfo.message}</p>
      <div class="row">
        <button class="glass-btn glass-btn--secondary glass-btn--sm glass-btn--auto" onclick={() => fix(errInfo.fix)}>{errInfo.label}</button>
        {#if errInfo.fix === 'retry'}<button class="linkish" onclick={() => copyText(`${error.code}: ${error.message}`)}>{T.copyDetails}</button>{/if}
      </div>
    </div>
  {:else if fileErr}
    <div class="file-banner" role="alert">
      <p>⚠ {fileError(fileErr.code, fileErr.name)}</p>
      <div class="row">
        <button class="glass-btn glass-btn--secondary glass-btn--sm glass-btn--auto" onclick={() => picker.click()}>{T.chooseAnother}</button>
        <button class="icon-btn" aria-label={T.dismiss} onclick={() => (fileErr = null)}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.x}</svg></button>
      </div>
    </div>
  {/if}
</main>

{#if status !== 'empty'}
  <div class="view">
    <ViewBar
      {hasResult} mode={viewMode} onmode={(m) => (mode = m)} {showGrid} ongrid={() => (showGrid = !showGrid)}
      {gridOk} gridWhy={viewMode === 'before' ? T.noGrid : T.gridZoom}
      {zoomText} zoomTitle={zoomTip(Math.round(z * 100) / 100)} onzoom={zoomBy} onlevel={level}
      {caption}
    />
  </div>

  {#snippet notes()}
    <div class="notes">
      {#if stoppedFlash}<p class="muted">{T.stopped}</p>{/if}
      {#if result && status !== 'failed'}
        {#if overridden}
          <p>{styleDesc(shownStyle, report.route)} <button class="linkish" onclick={useBest}>{T.useBest}</button></p>
        {:else}
          <button class="reason" onclick={() => (detailsOpen = true)}><b>{T.best}:</b> {reason(result.recommendation, info.grid.class)}</button>
        {/if}
        {#if shownStyle === 'clean'}<p class="small">{cleanLine(report)}</p>{/if}
        {#if warnLine}<p class="small muted">{warnLine}</p>{/if}
      {:else if !result && (status === 'analysing' || status === 'converting')}
        <div class="reason-slot" aria-hidden="true"></div>
      {/if}
    </div>
  {/snippet}

  {#snippet sizePicker()}
    {#if info}
      <SizePicker
        {size} W={info.width} H={info.height} {info} {prefilled}
        heading={status === 'needs' ? needsHeading(needs, info) : null}
        derivation={derivationText} {fitShown} {match} onchange={setSize}
      />
    {:else}
      <div class="glass-skeleton" aria-busy="true" aria-label={T.analysing}>
        <div class="glass-skeleton__line glass-skeleton__line--title" style="width:45%"></div>
        <div class="glass-skeleton__line" style="width:80%"></div>
      </div>
    {/if}
  {/snippet}

  {#snippet tools_()}
    <Tools {tools} hasAlpha={info?.hasAlpha} report={result && status !== 'failed' ? report : null} {bgKept} onchange={setTools} />
  {/snippet}

  {#snippet styles(variant)}
    {#if result && (variant === 'cards' || result.candidates.length > 1)}
      <section aria-labelledby="h-style-{variant}">
        <h2 class="sr-only" id="h-style-{variant}">{T.style}</h2>
        <StylePicker {result} {shown} onchoose={choose} {variant} />
      </section>
    {:else if !result && (status === 'analysing' || status === 'converting') && variant === 'segmented'}
      <div class="style-slot" aria-hidden="true"></div>
    {/if}
  {/snippet}

  <aside class="dock glass-card" aria-label={T.settings} bind:this={dockEl}>
    {#if side}
      {@render styles('cards')}
      {@render notes()}
      <section class="block" aria-labelledby="h-size">
        <h2 class="block-title" id="h-size">{T.size}</h2>
        {@render sizePicker()}
      </section>
      {#if status !== 'needs' && info}
        <section class="block" aria-labelledby="h-tools">
          <h2 class="block-title" id="h-tools">{T.tools}</h2>
          {@render tools_()}
        </section>
      {/if}
      {#if cand}
        <section class="block" aria-labelledby="h-save">
          <h2 class="block-title" id="h-save">{T.save}</h2>
          <Export part="scale" w={cand.width} h={cand.height} {scale} onscale={(s) => (exportScale = s)} />
        </section>
      {/if}
      <div class="export-bar row">
        {#if !cand}<h2 class="sr-only">{T.save}</h2>{/if}
        <div class="grow"><Export part="save" w={cand?.width} h={cand?.height} {scale} disabled={saveWhy} onsave={save} /></div>
        <Export part="actions" w={cand?.width} h={cand?.height} {scale} disabled={saveWhy} oncopy={copyPng} onshare={share} {canCopy} {canShare} />
      </div>
    {:else}
      <div class="dock-scroll">
        {@render styles('segmented')}
        {@render notes()}
        {#if openSection}
          <section class="section" aria-labelledby="sec-head">
            <div class="section-head">
              <h2 id="sec-head" tabindex="-1" bind:this={heads[openSection]}>{openSection === 'size' ? T.size : openSection === 'tools' ? T.tools : T.saveOptions}</h2>
              <button class="pill-btn" onclick={() => toggleSection(openSection)}>{T.done}</button>
            </div>
            {#if openSection === 'size'}{@render sizePicker()}
            {:else if openSection === 'tools'}{@render tools_()}
            {:else if cand}
              <Export part="scale" w={cand.width} h={cand.height} {scale} onscale={(s) => (exportScale = s)} />
              <div class="row"><Export part="actions" labels w={cand.width} h={cand.height} {scale} disabled={saveWhy} oncopy={copyPng} onshare={share} {canCopy} {canShare} /></div>
            {/if}
          </section>
        {/if}
      </div>
      <div class="row buttons">
        <div class="grow">
          {#if openSection !== 'size'}<h2 class="sr-only">{T.size}</h2>{/if}
          <button class="section-btn" bind:this={btns.size} aria-expanded={openSection === 'size'} disabled={!info}
            aria-label={isValid(size) ? sizeName(size.w, size.h, sizeCaption) : T.chooseSize} onclick={() => toggleSection('size')}>
            <b class="num">{isValid(size) ? dims(size.w, size.h) : T.chooseSize}</b><span class="cap">{isValid(size) ? sizeCaption : T.size}</span>
          </button>
        </div>
        {#if status !== 'needs' && info}
          <div>
            {#if openSection !== 'tools'}<h2 class="sr-only">{T.tools}</h2>{/if}
            <button class="section-btn" bind:this={btns.tools} aria-expanded={openSection === 'tools'} onclick={() => toggleSection('tools')}>
              <b class="row"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS['sliders-horizontal']}</svg>{toolsButton(toolCount)}</b>
            </button>
          </div>
        {/if}
      </div>
      <div class="row export-row">
        <h2 class="sr-only">{T.save}</h2>
        <div class="grow"><Export part="save" w={cand?.width} h={cand?.height} {scale} disabled={saveWhy} onsave={save} /></div>
        {#if cand}
          <!-- shows the enlargement in use, so the choice is visible without opening the section -->
          <button class="icon-btn more num" bind:this={btns.export} aria-label={moreLabel(scale)} aria-expanded={openSection === 'export'} onclick={() => toggleSection('export')}>
            {scale}×
          </button>
        {/if}
      </div>
    {/if}
  </aside>
{/if}

<Details open={detailsOpen} onclose={() => (detailsOpen = false)} variant={side ? 'center' : 'sheet'}
  {info} {result} {shown} onrecipe={saveRecipe} oncopyhash={copyText} />

<div class="toast" class:on={!!toast} aria-hidden="true"><span class="num">{toast}</span></div>
{#if dragging}<div class="drop" aria-hidden="true"><p>{T.dropHere}</p></div>{/if}

<style>
  .empty { position: absolute; inset: 0; overflow: auto; display: flex; padding: 16px; }
  .drop-zone {
    flex: 1; min-height: min-content; margin: 0 auto; align-self: stretch; display: flex; flex-direction: column; align-items: center; justify-content: safe center;
    gap: 10px; padding: 32px 20px; text-align: center; border: 2px dashed var(--gl-border-medium); border-radius: 24px; max-width: 880px;
  }
  .drop-zone p { max-width: 40ch; }
  .title { font-size: 22px; line-height: 1.3; font-weight: 650; }
  .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 6px 0; }
  .tag {
    position: absolute; top: 8px; left: 8px; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 600;
    background: var(--surface-solid); border: 1px solid var(--gl-border-subtle); pointer-events: none;
  }
  .tag.right { left: auto; right: 8px; }
  .progress {
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
    pointer-events: none;
  }
  .pill {
    display: flex; align-items: center; gap: 10px; padding: 6px 6px 6px 16px; min-height: 44px; border-radius: 999px; pointer-events: auto;
    background: var(--surface-solid); border: 1px solid var(--gl-border-subtle); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25); font-weight: 500;
  }
  .pill:not(:has(.stopbtn)) { padding-right: 16px; }
  .stopbtn {
    min-height: 36px; padding: 0 16px; border-radius: 999px; border: 1.5px solid var(--gl-border-medium);
    background: var(--stage-bg); cursor: pointer; font-weight: 600;
  }
  @media (pointer: coarse) { .stopbtn { min-height: 44px; } }
  .slow { padding: 4px 12px; border-radius: 999px; background: var(--surface-solid); }
  .stage-area.working :global(.frame), .stage-area.working :global(.whole) { opacity: 0.55; }
  .file-banner {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: min(calc(100% - 24px), 520px);
    display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 8px 8px 8px 16px;
    border-radius: 16px; background: var(--surface-solid); border: 1px solid var(--gl-color-error-border); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  }
  .file-banner p { flex: 1 1 220px; }
  .reason { background: none; border: 0; padding: 0; text-align: start; cursor: pointer; line-height: 1.4; min-height: 24px; }
  @media (pointer: coarse) { .reason { min-height: 44px; } }
  .reason b { color: var(--ring); }
  /* the first result's style row and two-line reason plus one note, so the dock doesn't grow when it lands */
  .style-slot { min-height: 56px; }
  .reason-slot { min-height: 66px; }
  .alert { display: flex; flex-direction: column; gap: 6px; }
  .buttons { margin-top: 10px; align-items: stretch; }
  .buttons .section-btn { width: 100%; height: 100%; }
  .export-row { margin-top: 8px; }
  .more { width: 52px; height: 52px; font-weight: 600; }
  .toast {
    position: fixed; z-index: 1100; left: 50%; top: calc(env(safe-area-inset-top) + 64px); transform: translate(-50%, -8px);
    max-width: calc(100vw - 32px); padding: 10px 16px; border-radius: 14px; pointer-events: none; opacity: 0;
    background: var(--surface-solid); color: var(--gl-color-text); border: 1px solid var(--gl-border-medium);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3); font-size: 14px; font-weight: 500; transition: opacity 150ms, transform 150ms;
  }
  .toast.on { opacity: 1; transform: translate(-50%, 0); }
  .drop {
    position: fixed; inset: 8px; z-index: 1500; border: 3px dashed var(--ring); border-radius: 24px;
    display: grid; place-items: center; font-size: 20px; font-weight: 600;
    background: color-mix(in srgb, var(--surface-solid) 80%, transparent);
    backdrop-filter: blur(var(--gl-blur-soft)); -webkit-backdrop-filter: blur(var(--gl-blur-soft));
  }
</style>
