<script>
  // Solid bar under the stage: Before | After, pixel grid, zoom (spec §8.4). The controls appear with the
  // first result; the bar keeps its height so nothing moves when they do. Progress lives on the stage.
  import { ICONS } from '../lib/icons.js'
  import { T } from '../lib/copy.js'

  let { hasResult, mode, onmode, showGrid, ongrid, gridOk, gridWhy, zoomText, zoomTitle, onzoom, onlevel, caption } = $props()
</script>

<div class="bar">
  {#if hasResult}
    <div class="glass-segmented" role="group" aria-label={T.view}>
      {#each ['before', 'after'] as m}
        <button class="glass-segmented__item" aria-pressed={mode === m} onclick={() => onmode(m)}>{T[m]}</button>
      {/each}
    </div>
    <button
      class="icon-btn"
      aria-label={T.grid}
      aria-pressed={showGrid}
      aria-disabled={!gridOk}
      title={gridOk ? T.grid : gridWhy}
      onclick={() => gridOk && ongrid()}
    ><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS['grid-3x3']}</svg></button>

    <div class="zoom">
      <button class="icon-btn" aria-label={T.zoomOut} onclick={() => onzoom(-1)}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.minus}</svg></button>
      <button class="level num" title={zoomTitle} aria-label="{T.zoomLevel}, {zoomText}" onclick={onlevel}>{zoomText}</button>
      <button class="icon-btn" aria-label={T.zoomIn} onclick={() => onzoom(1)}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.plus}</svg></button>
    </div>
  {/if}
</div>
{#if caption}<p class="note small muted num">{caption}</p>{/if}

<style>
  .bar {
    display: flex; align-items: center; gap: 8px; min-height: 60px; max-width: 960px; margin-inline: auto;
    padding: 4px max(8px, env(safe-area-inset-right)) 4px max(8px, env(safe-area-inset-left));
  }
  .zoom { display: flex; align-items: center; gap: 4px; margin-inline-start: auto; }
  .level {
    min-width: 56px; height: 44px; border: 0; border-radius: 12px; background: transparent; cursor: pointer;
    font-weight: 600; white-space: nowrap;
  }
  .note { padding: 0 12px 6px; max-width: 960px; margin-inline: auto; }
  /* a narrow bar (phone, phone-landscape stage) drops the zoom-level text so it stays one row;
     double tap and the 0 key still toggle Fit */
  @container view (max-width: 380px) {
    .level { display: none; }
    .bar { gap: 4px; }
  }
</style>
