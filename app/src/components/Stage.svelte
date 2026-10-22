<script lang="ts">
  import type { Candidate, Report, Zoom } from '../lib/types.ts'
  interface Point { x: number; y: number }
  interface Props { candidate?: Candidate | null; source: { url: string; width: number; height: number }; report?: Report | null; gridReport?: Report | null; mode?: string; showGrid?: boolean; zoom?: number | null; fitz?: number; dpr?: number; dim?: boolean; faded?: boolean; label?: string; onpeek: (peek: boolean) => void; onzoom: Zoom; onfit: () => void; onstyle: (index: number) => void; ontoggle: () => void; ongrid: () => void }
// The solid preview (spec §8.4, §8.5): integer device-pixel zoom, own pan and pinch (touch-action: none),
  // Before drawn under the result with beforeRect(), pixel grid, trim/crop outline. No gesture changes a setting.
  import { tick } from 'svelte'
  import { beforeRect, fitZoom } from '../lib/geometry.ts'
  import { T, sourceAlt } from '../lib/copy.ts'

  let {
    candidate = null, source, report = null, gridReport = null, mode = 'after', showGrid = false,
    zoom = null, fitz = $bindable(1), dpr = $bindable(1), dim = false, faded = false, label = '',
    onpeek, onzoom, onfit, onstyle, ontoggle, ongrid,
  }: Props = $props()

  let el = $state<HTMLDivElement>(undefined!)
  let canvas = $state<HTMLCanvasElement>(undefined!)
  let art = $state<HTMLDivElement>(undefined!)
  let stage = $state({ width: 0, height: 0 })

  const w = $derived(candidate?.width ?? 0)
  const h = $derived(candidate?.height ?? 0)
  const z = $derived(zoom ?? fitz)
  const p = $derived(z / dpr) // CSS px per art pixel
  const before = $derived(!!candidate && mode === 'before' && !!report)

  // Before geometry in output pixels: the whole source placed so that src lands on dst.
  const geo = $derived.by(() => {
    if (!candidate || !report) return null
    const { src, dst } = beforeRect(report, source.width, source.height)
    const kx = dst[2] / (src[2] - src[0]), ky = dst[3] / (src[3] - src[1])
    const img = [dst[0] - src[0] * kx, dst[1] - src[1] * ky, source.width * kx, source.height * ky]
    const full = src[0] === 0 && src[1] === 0 && src[2] === source.width && src[3] === source.height
    return { src, dst, img, full, kx, ky }
  })
  // The frame: the art box (After) or its union with the source extent (Before), in output pixels.
  const frame = $derived.by(() => {
    if (!before || !geo) return [0, 0, w, h]
    const [l, t, iw, ih] = geo.img
    return [Math.min(0, l), Math.min(0, t), Math.max(w, l + iw), Math.max(h, t + ih)]
  })
  const cuts = $derived(before && gridReport?.route === 'grid' ? gridReport.grid.cuts : null)

  // Fit: recomputed on stage resize and on a DPR change.
  $effect(() => {
    const measure = () => { stage = { width: el.clientWidth - 16, height: el.clientHeight - 16 } }
    measure() // ResizeObserver waits for a rendering step (none in a hidden tab)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  })
  $effect(() => { if (w) fitz = fitZoom(stage, w, h, dpr) })
  $effect(() => {
    const q = matchMedia(`(resolution: ${dpr}dppx)`)
    const on = () => (dpr = devicePixelRatio || 1)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  })

  $effect(() => {
    if (!canvas || !candidate) return
    canvas.width = candidate.width
    canvas.height = candidate.height
    canvas.getContext('2d')!.putImageData(new ImageData(candidate.rgba as Uint8ClampedArray<ArrayBuffer>, candidate.width, candidate.height), 0, 0)
  })

  // Centre the art on a new result, a view change, or a return to Fit; any other zoom keeps the point under
  // the pointer (Ctrl/⌘ + wheel, pinch) or the stage centre (buttons, keys) where it was.
  const atFit = $derived(zoom == null)
  $effect(() => {
    void [before, candidate, atFit]
    tick().then(() => {
      if (!art || !el) return
      const a = art.getBoundingClientRect(), s = el.getBoundingClientRect()
      el.scrollLeft += a.left + a.width / 2 - (s.left + el.clientWidth / 2)
      el.scrollTop += a.top + a.height / 2 - (s.top + el.clientHeight / 2)
    })
  })
  let anchor: Point | null = null, keep: { fx: number; fy: number; ax: number; ay: number } | null = null
  $effect.pre(() => {
    void z
    if (!el) return
    const ax = anchor?.x ?? el.clientWidth / 2, ay = anchor?.y ?? el.clientHeight / 2
    keep = { fx: (el.scrollLeft + ax) / el.scrollWidth, fy: (el.scrollTop + ay) / el.scrollHeight, ax, ay }
  })
  $effect(() => {
    void z
    const k = keep
    keep = anchor = null
    if (!k || !el) return
    el.scrollLeft = k.fx * el.scrollWidth - k.ax
    el.scrollTop = k.fy * el.scrollHeight - k.ay
  })

  function zoomAt(dir: number, cx: number, cy: number, value?: number | null) {
    const r = el.getBoundingClientRect()
    anchor = { x: cx - r.left, y: cy - r.top }
    onzoom(dir, value)
  }

  // Ctrl/⌘ + wheel zooms at the pointer (non-passive, stage only); a plain wheel scrolls.
  $effect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !candidate) return
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  // Pointer gestures: one-pointer pan, two-pointer pinch, double tap = Fit, press and hold = peek.
  const pts = new Map<number, Point>()
  let hold: ReturnType<typeof setTimeout> | number = 0, peeking = false, pinch: { d: number; z: number } | null = null, lastTap = 0, start: Point | null = null
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
  function down(e: PointerEvent) {
    if (!candidate) return
    try { el.setPointerCapture(e.pointerId) } catch {} // synthetic or already-released pointers
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    clearTimeout(hold)
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY }
      hold = setTimeout(() => { peeking = true; onpeek(true) }, 450)
    } else if (pts.size === 2) {
      pinch = { d: dist(), z }
    }
  }
  function move(e: PointerEvent) {
    const q = pts.get(e.pointerId)
    if (!q) return
    const dx = e.clientX - q.x, dy = e.clientY - q.y
    q.x = e.clientX; q.y = e.clientY
    if (pts.size === 2 && pinch) {
      const s = pinch.z * (dist() / pinch.d)
      const next = s < 1 && fitz < 1 ? null : Math.max(1, Math.min(64, Math.round(s)))
      const [a, b] = [...pts.values()]
      if (next !== zoom) zoomAt(0, (a.x + b.x) / 2, (a.y + b.y) / 2, next)
      return
    }
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clearTimeout(hold)
    el.scrollBy(-dx, -dy)
  }
  function up(e: PointerEvent) {
    if (!pts.has(e.pointerId)) return
    pts.delete(e.pointerId)
    clearTimeout(hold)
    if (peeking) { peeking = false; onpeek(false) }
    if (pts.size < 2) pinch = null
    if (e.type === 'pointerup' && pts.size === 0 && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) {
      const now = performance.now()
      if (now - lastTap < 300) { onfit(); lastTap = 0 } else lastTap = now
    }
    if (pts.size === 0) start = null
  }

  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || !candidate) return
    const k = e.key
    if (k >= '1' && k <= '4') onstyle(+k - 1)
    else if (k === ' ') { e.preventDefault(); if (!e.repeat) onpeek(true) }
    else if (k === 'b' || k === 'B') ontoggle()
    else if (k === 'g' || k === 'G') ongrid()
    else if (k === '+' || k === '=') onzoom(1)
    else if (k === '-' || k === '_') onzoom(-1)
    else if (k === '0') onfit()
    else if (ARROWS[k]) {
      e.preventDefault()
      const s = Math.max(1, p) * (e.shiftKey ? 10 : 1) // one art pixel x zoom
      el.scrollBy(ARROWS[k][0] * s, ARROWS[k][1] * s)
    }
  }
  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  function keyup(e: KeyboardEvent) { if (e.key === ' ') onpeek(false) }

  const px = (v: number) => `${v * p}px`
</script>

<!-- The preview is a focusable scroll region with its own gestures and keys (spec §8.4, §11). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={el}
  class="stage"
  tabindex="0"
  role="group"
  aria-label={T.preview}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onkeydown={key}
  onkeyup={keyup}
>
  <div class="wrap">
    {#if candidate}
      <div class="frame" class:dim style:width={px(frame[2] - frame[0])} style:height={px(frame[3] - frame[1])}>
        <div
          bind:this={art}
          class="art"
          class:checker={report?.output?.transparent}
          style:left={px(-frame[0])} style:top={px(-frame[1])} style:width={px(w)} style:height={px(h)}
        >
          <div class="pic" role="img" aria-label={label} aria-hidden={before}><canvas bind:this={canvas} class:hidden={before}></canvas></div>
          {#if showGrid && !before && p >= 6}
            <div class="pixgrid" style:background-size="{p}px {p}px" aria-hidden="true"></div>
          {/if}
        </div>
        {#if before && geo}
          <img
            class="src"
            src={source.url}
            alt={sourceAlt(source.width, source.height)}
            draggable="false"
            style:left={px(geo.img[0] - frame[0])} style:top={px(geo.img[1] - frame[1])}
            style:width={px(geo.img[2])} style:height={px(geo.img[3])}
          />
          {#if showGrid && cuts}
            <svg
              class="cuts" aria-hidden="true" viewBox="0 0 {source.width} {source.height}" preserveAspectRatio="none"
              style:left={px(geo.img[0] - frame[0])} style:top={px(geo.img[1] - frame[1])}
              style:width={px(geo.img[2])} style:height={px(geo.img[3])}
            >
              {#each cuts.x as x}<line x1={x} x2={x} y1={cuts.y[0]} y2={cuts.y[cuts.y.length - 1]} />{/each}
              {#each cuts.y as y}<line y1={y} y2={y} x1={cuts.x[0]} x2={cuts.x[cuts.x.length - 1]} />{/each}
            </svg>
          {/if}
          {#if !geo.full}
            <div
              class="outline" aria-hidden="true"
              style:left={px(geo.dst[0] - frame[0])} style:top={px(geo.dst[1] - frame[1])}
              style:width={px(geo.dst[2])} style:height={px(geo.dst[3])}
            ></div>
          {/if}
        {/if}
      </div>
    {:else if source}
      <img class="whole" class:faded src={source.url} alt={sourceAlt(source.width, source.height)} draggable="false" />
    {/if}
  </div>
</div>

<style>
  .stage {
    position: absolute; inset: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left); overflow: auto; touch-action: none; overscroll-behavior: contain;
    background: var(--stage-bg); outline-offset: -3px; user-select: none; -webkit-user-select: none;
    container-type: size;
  }
  .wrap {
    display: grid; place-items: center; min-width: 100%; min-height: 100%; width: max-content;
    padding: 8px; box-sizing: border-box;
  }
  .frame { position: relative; }
  .frame.dim { opacity: 0.4; }
  .art, .src, .cuts, .outline { position: absolute; }
  .pic { width: 100%; height: 100%; }
  .art canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
  .art canvas.hidden { visibility: hidden; }
  .checker {
    background-color: var(--checker-a);
    background-image: conic-gradient(var(--checker-b) 25%, transparent 0 50%, var(--checker-b) 0 75%, transparent 0);
    background-size: 16px 16px;
  }
  .pixgrid {
    position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(to right, color-mix(in srgb, CanvasText 35%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, CanvasText 35%, transparent) 1px, transparent 1px);
  }
  .src { image-rendering: auto; max-width: none; pointer-events: none; }
  .cuts { pointer-events: none; overflow: visible; }
  .cuts line { stroke: color-mix(in srgb, CanvasText 35%, transparent); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .outline { outline: 2px dashed #fff; box-shadow: 0 0 0 2px #000; pointer-events: none; }
  .whole { display: block; max-width: calc(100cqw - 16px); max-height: calc(100cqh - 16px); object-fit: contain; }
  .whole.faded { opacity: 0.6; }
</style>
