<script lang="ts">
  import type { Size, Info } from '../lib/types.ts'
  interface Props { size: Size; W: number; H: number; info: Info; prefilled: Size | null; heading?: string | null; derivation: string; fitShown?: boolean; match?: number[] | null; onchange: (size: Size, fromChip?: boolean) => void }
// Output size (spec §8.1): chips apply at once; typed values commit on Enter, blur, or 400 ms after the
  // last valid keystroke. With Keep shape on, the other side is derived (half-even) and shown before any job.
  import { ICONS } from '../lib/icons.ts'
  import { T, dims } from '../lib/copy.ts'
  import { PRESETS, applyPreset, chips, typed, validate } from '../lib/opts.ts'

  // onchange(size, fromChip): chips and presets pass true so Stack can close the section after a tap
  let { size, W, H, info, prefilled, heading = null, derivation, fitShown = false, match = null, onchange }: Props = $props()

  let dw = $state(''), dh = $state(''), errors = $state<Partial<Record<"w" | "h", string>>>({}), derivedBad = $state<"w" | "h" | null>(null)
  let pending: Size | null = null, timer: ReturnType<typeof setTimeout> | number = 0

  $effect(() => {
    dw = size.w == null ? '' : String(size.w)
    dh = size.h == null ? '' : String(size.h)
    errors = {}
    derivedBad = null
  })

  const list = $derived(chips(info, prefilled))
  const note = $derived(size.note ?? (size.source && size.source !== 'detected' ? `${T.yourSize}.` : null))
  const squareN = $derived(Math.max(size.w ?? 0, size.h ?? 0) || 64)

  function input(field: "w" | "h", raw: string) {
    const v = raw.trim() === '' ? NaN : Number(raw)
    const s = typed(size, field, v, W, H)
    if (field === 'w') { dw = raw; if (s.derived) dh = String(s.h) } else { dh = raw; if (s.derived) dw = String(s.w) }
    errors = validate(s)
    derivedBad = s.derived && s[s.derived]! > 1024 ? s.derived : null // the derived field is invalid too
    pending = s
    clearTimeout(timer)
    if (!Object.keys(errors).length) timer = setTimeout(commit, 400)
  }
  function commit() {
    clearTimeout(timer)
    if (pending && !Object.keys(validate(pending)).length) onchange(pending)
    pending = null
  }
  const pick = (c: { key: string; w: number | null; h: number | null; source: string }) => onchange({ ...size, w: c.w, h: c.h, source: c.source, chip: c.key, note: null, derived: null }, true)
  const square = () => onchange({ ...size, lock: false, w: squareN, h: squareN, source: 'typed', chip: 'square', note: null, derived: null }, true)
  function lockToggle() {
    const s = { ...size, lock: !size.lock }
    if (s.lock && Number.isInteger(size.w)) onchange(typed(s, 'w', size.w!, W, H))
    else onchange(s)
  }
  const focusIn = (e: FocusEvent & { currentTarget: HTMLInputElement }) => e.currentTarget.scrollIntoView({ block: 'nearest' })
</script>

<div class="size">
  {#if heading}<p class="heading">{heading}</p>{/if}

  <div class="chips" role="group" aria-label={T.size}>
    {#each list as c (c.key)}
      <button class="glass-badge glass-badge--interactive" class:glass-badge--selected={size.chip === c.key} aria-pressed={size.chip === c.key} onclick={() => pick(c)}>
        {c.label} <span class="num">{dims(c.w, c.h)}</span>
      </button>
    {/each}
    {#if match}
      <button class="glass-badge glass-badge--interactive" class:glass-badge--selected={size.chip === 'sprite'} aria-pressed={size.chip === 'sprite'}
        onclick={() => pick({ key: 'sprite', w: match[0], h: match[1], source: 'sprite' })}>{T.matchSprite}: <span class="num">{dims(match[0], match[1])}</span></button>
    {/if}
  </div>
  <div class="chips presets" class:pulse={!!heading} role="group" aria-label={T.presets}>
    {#each PRESETS as n}
      <button class="glass-badge glass-badge--interactive num" class:glass-badge--selected={size.chip === `preset-${n}`} aria-pressed={size.chip === `preset-${n}`}
        onclick={() => onchange(applyPreset(size, n, W, H), true)}>{n}</button>
    {/each}
    {#if W !== H}
      <button class="glass-badge glass-badge--interactive" class:glass-badge--selected={size.chip === 'square'} aria-pressed={size.chip === 'square'} onclick={square}>{T.square}</button>
    {/if}
  </div>

  <div class="fields">
    {#each [['w', T.width, dw], ['h', T.height, dh]] as const as [f, lab, val]}
      <div class="glass-input-group field">
        <label class="glass-label" for="size-{f}">{lab}</label>
        <div class="glass-input-wrap glass-input-wrap--suffix suffix-22">
          <input
            id="size-{f}" class="glass-input num" class:glass-input--error={errors[f]}
            type="number" inputmode="numeric" min="1" max="1024" step="1" value={val}
            aria-invalid={!!errors[f] || derivedBad === f} aria-describedby="size-{f}-err"
            oninput={(e) => input(f, e.currentTarget.value)}
            onkeydown={(e) => e.key === 'Enter' && commit()}
            onblur={commit} onfocus={focusIn}
          />
          <span class="glass-input-wrap__suffix muted">px</span>
        </div>
        <span class="glass-hint glass-hint--error" id="size-{f}-err" aria-live="polite">{errors[f] ?? ''}</span>
      </div>
    {/each}
  </div>
  <button class="keep" aria-pressed={size.lock} onclick={lockToggle}>
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html size.lock ? ICONS.link : ICONS.unlink}</svg>{T.keepShape}
  </button>

  {#if fitShown}
    <div class="glass-segmented glass-segmented--full" role="group" aria-label={T.fitMode}>
      {#each ['contain', 'cover', 'stretch'] as const as m}
        <button class="glass-segmented__item" aria-pressed={size.fit === m} onclick={() => onchange({ ...size, fit: m })}>{T.fit[m]}</button>
      {/each}
    </div>
    <p class="small muted">{T.fitHelp[size.fit]}</p>
  {/if}

  {#if !heading}<p class="small muted num">{derivation}</p>{/if}
  {#if note}<p class="small num">{note}</p>{/if}
</div>

<style>
  .size { display: flex; flex-direction: column; gap: 10px; }
  .heading { font-weight: 600; font-size: 16px; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: start; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .suffix-22 { --gl-input-suffix-size: 22px; }
  .field input { font-size: 16px; } /* 16 px: no iOS zoom on focus */
  .keep {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 14px 0 10px;
    border-radius: 999px; border: 1.5px solid var(--gl-border-medium); background: var(--gl-surface-2); cursor: pointer; font-weight: 500;
  }
  .keep[aria-pressed="true"] { background: var(--seg-on); box-shadow: var(--seg-on-shadow); border-color: transparent; }
  @media (pointer: coarse) { .keep { min-height: 44px; } }
  .pulse button { animation: pulse 0.9s ease-out 1; }
  @keyframes pulse { 40% { transform: scale(1.08); } }
  @container (max-width: 279px) { .fields { grid-template-columns: minmax(0, 1fr); } }
</style>
