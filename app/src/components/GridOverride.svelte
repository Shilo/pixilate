<script lang="ts">
  import type { GridOverride } from '../lib/types.ts'
  interface Props { grid?: GridOverride | null; detected?: GridOverride | null; W: number; H: number; open?: boolean; ontoggle: () => void; onchange: (grid: GridOverride | null) => void }
// Pixel grid override (PRD AUTO-008): progressive disclosure inside Size. Columns x rows of the source's
  // pixel blocks; "Reset to detected" drops the override. Values commit on Enter, blur, or 400 ms after a
  // valid keystroke, like the size fields.
  import { T } from '../lib/copy.ts'
  import { validateGrid } from '../lib/opts.ts'

  let { grid = null, detected = null, W, H, open = false, ontoggle, onchange }: Props = $props()

  let dc = $state(''), dr = $state(''), errors = $state<Partial<Record<string, string>>>({})
  let timer: ReturnType<typeof setTimeout> | number = 0
  $effect(() => {
    const g = grid ?? detected
    dc = g ? String(g.cols) : ''
    dr = g ? String(g.rows) : ''
    errors = {}
  })

  const draft = () => ({ cols: dc.trim() === '' ? NaN : Number(dc), rows: dr.trim() === '' ? NaN : Number(dr) })
  function input(k: string, raw: string) {
    if (k === 'cols') dc = raw; else dr = raw
    errors = validateGrid(draft(), W, H)
    clearTimeout(timer)
    if (!Object.keys(errors).length) timer = setTimeout(commit, 400)
  }
  function commit() {
    clearTimeout(timer)
    const g = draft()
    if (Object.keys(validateGrid(g, W, H)).length) return
    if (grid && g.cols === grid.cols && g.rows === grid.rows) return
    if (!grid && detected && g.cols === detected.cols && g.rows === detected.rows) return // same as detected: no override
    onchange(g)
  }
</script>

{#if !open}
  <button class="linkish" aria-expanded="false" aria-controls="grid-override" onclick={ontoggle}>{T.gridLink}</button>
{:else}
  <div class="grid-override" id="grid-override" role="group" aria-labelledby="grid-label">
    <span class="lab" id="grid-label">{T.gridLabel}</span>
    <p class="small muted" id="grid-help">{T.gridHelp}</p>
    <div class="fields">
      {#each [['cols', T.gridAcross, dc], ['rows', T.gridDown, dr]] as [k, lab, val], i}
        {#if i === 1}<span class="times" aria-hidden="true">×</span>{/if}
        <div class="glass-input-group field">
          <label class="glass-label" for="grid-{k}">{lab}</label>
          <input
            id="grid-{k}" class="glass-input num" class:glass-input--error={errors[k]}
            type="number" inputmode="numeric" min="1" max={Math.min(1024, k === 'cols' ? W : H)} step="1" value={val}
            aria-invalid={!!errors[k]} aria-describedby="grid-help grid-{k}-err"
            oninput={(e) => input(k, e.currentTarget.value)}
            onkeydown={(e) => e.key === 'Enter' && commit()}
            onblur={commit}
          />
          <span class="glass-hint glass-hint--error" id="grid-{k}-err" aria-live="polite">{errors[k] ?? ''}</span>
        </div>
      {/each}
    </div>
    {#if grid}
      <button class="pill-btn reset" onclick={() => onchange(null)}>{T.gridReset}</button>
    {/if}
  </div>
{/if}

<style>
  .grid-override { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; border-top: 1px solid var(--gl-border-subtle); }
  .lab { font-weight: 500; margin-top: 6px; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; align-items: start; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field input { font-size: 16px; }
  .times { margin-top: 36px; color: var(--gl-color-text-muted); }
  .reset { align-self: flex-start; }
  .linkish { align-self: flex-start; text-align: start; }
  @media (pointer: coarse) { .linkish { min-height: 44px; } }
</style>
