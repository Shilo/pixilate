<script>
  // Save PNG at 1x..16x (each side <= 4096), Copy, Share (spec §8.6). `scale` arrives already clamped by App,
  // so the label, Save, Copy and Share always agree. Disabled states keep their label so nothing jumps.
  //   part 'scale': the File size control and the final size line (hidden until a result exists)
  //   part 'save': the primary button      part 'actions': Copy / Share icon buttons
  import { ICONS } from '../lib/icons.js'
  import { T, saveLabel, scaleLine } from '../lib/copy.js'
  import { exportScales } from '../lib/geometry.js'

  let { part, w = 0, h = 0, scale = 1, onscale, disabled = null, onsave, oncopy, onshare, canCopy, canShare, labels = false } = $props()
  const off = $derived(!!disabled || !w)
  const guard = (f) => () => { if (!off) f() }
</script>

{#if part === 'scale' && w}
  <div class="scale">
    <span class="lab" id="scale-label">{T.enlarge}</span>
    <div class="glass-segmented glass-segmented--full" role="group" aria-labelledby="scale-label">
      {#each exportScales(w, h) as k}
        <button class="glass-segmented__item num" aria-pressed={scale === k} onclick={() => onscale(k)}>{k}×</button>
      {/each}
    </div>
    <span class="small muted num">{scaleLine(w * scale, h * scale)}</span>
  </div>
{:else if part === 'actions' && w}
  {#if canCopy}
    <button class={labels ? 'glass-btn glass-btn--tertiary glass-btn--sm' : 'icon-btn act'} aria-label={labels ? undefined : T.copy}
      aria-disabled={off} title={disabled ?? T.copy} onclick={guard(oncopy)}>
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.copy}</svg>{#if labels}{T.copy}{/if}
    </button>
  {/if}
  {#if canShare}
    <button class={labels ? 'glass-btn glass-btn--tertiary glass-btn--sm' : 'icon-btn act'} aria-label={labels ? undefined : T.share}
      aria-disabled={off} title={disabled ?? T.share} onclick={guard(onshare)}>
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.share}</svg>{#if labels}{T.share}{/if}
    </button>
  {/if}
{:else if part === 'save'}
  <button id="save" class="glass-btn glass-btn--primary save num" aria-disabled={off} title={disabled ?? ''} aria-describedby={disabled ? 'save-why' : undefined} onclick={guard(onsave)}>
    <span class="lbl">{w ? saveLabel(w, h, scale) : (disabled ?? T.savePng)}</span>
  </button>
  {#if disabled}<span class="sr-only" id="save-why">{disabled}</span>{/if}
{/if}

<style>
  .scale { display: flex; flex-direction: column; gap: 6px; }
  .lab { font-weight: 500; }
  .scale .glass-segmented { flex-wrap: wrap; }
  .scale .glass-segmented__item { padding-inline: 2px; flex: 1 0 40px; }
  @media (pointer: coarse) { .scale .glass-segmented__item { flex-basis: 44px; } }
  @container (max-width: 260px) { .save { font-size: 14px; padding: 0 6px; } }
  .save { height: 52px; padding: 0 12px; min-width: 0; }
  .lbl { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act { width: 52px; height: 52px; }
</style>
