<script>
  // Native radio group (arrow keys for free): a segmented row in Stack, cards with thumbnails in Side (§8.2).
  // Selection is an iOS-style filled segment; the ring is for keyboard focus only.
  import { T, STYLE_ORDER, styleLabel, styleDesc, styleName } from '../lib/copy.js'
  import { styleIdOf } from '../lib/opts.js'

  let { result, shown, onchoose, variant = 'segmented' } = $props()
  const list = $derived(STYLE_ORDER.map((id) => result.candidates.find((c) => c.id === id)).filter(Boolean))

  // Thumbnails show the centre half of the art, so the styles' differences are visible at 40-56 px.
  function thumb(node, c) {
    const draw = (c) => {
      const cw = Math.max(1, c.width >> 1), ch = Math.max(1, c.height >> 1), x0 = (c.width - cw) >> 1, y0 = (c.height - ch) >> 1
      node.width = cw; node.height = ch
      node.getContext('2d').putImageData(new ImageData(c.rgba, c.width, c.height), -x0, -y0, x0, y0, cw, ch)
    }
    draw(c)
    return { update: draw }
  }
</script>

<fieldset class="styles {variant}">
  <legend class={variant === 'segmented' ? 'sr-only' : 'block-title'}>{T.style}</legend>
  <div class="opts">
    {#each list as c (c.id)}
      {@const best = c.id === result.recommended}
      {@const sid = styleIdOf(c, result)}
      <label class:on={c.id === shown}>
        <input
          type="radio" name="style" class="sr-only" value={c.id} checked={c.id === shown}
          aria-label={styleName(sid, c.report.route, best)}
          onchange={() => onchoose(c.id)}
        />
        {#if variant === 'cards'}
          <canvas class="thumb" use:thumb={c} aria-hidden="true"></canvas>
          <span class="txt">
            <span class="name">{styleLabel(sid)} {#if best}<span class="glass-badge glass-badge--primary" aria-hidden="true">{T.best}</span>{/if}</span>
            <span class="desc small">{styleDesc(sid, c.report.route)}</span>
          </span>
        {:else}
          <span class="name">{styleLabel(sid)}</span>
          {#if best}<span class="best" aria-hidden="true">{T.best}</span>{/if}
        {/if}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  .segmented .opts {
    display: flex; gap: 2px; padding: 3px; border-radius: 14px;
    background: var(--seg-track); border: 1px solid var(--gl-border-subtle);
  }
  .segmented label {
    flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0;
    min-height: 44px; padding: 2px 6px; border-radius: 11px; cursor: pointer;
    color: var(--gl-color-text-muted); font-weight: 500; font-size: 14px; line-height: 1.2;
  }
  .segmented label.on { background: var(--seg-on); color: var(--gl-color-text-heading); box-shadow: var(--seg-on-shadow); font-weight: 600; }
  .best { font-size: 11px; font-weight: 600; color: var(--ring); letter-spacing: 0.02em; }
  .name { display: flex; align-items: center; gap: 6px; font-weight: inherit; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cards .opts { display: flex; flex-direction: column; gap: 6px; }
  .cards label {
    display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 16px; cursor: pointer;
    background: var(--gl-surface-1); border: 1.5px solid var(--gl-border-subtle);
  }
  .cards label.on { background: var(--seg-on); border-color: transparent; box-shadow: var(--seg-on-shadow); }
  .cards .name { font-weight: 600; }
  .desc { color: var(--gl-color-text-muted); }
  .cards label.on .desc { color: var(--gl-color-text); }
  .thumb {
    width: 40px; height: 40px; flex: none; image-rendering: pixelated; border-radius: 8px; object-fit: contain;
    background: var(--checker-a); border: 1px solid var(--gl-border-subtle);
  }
  @media (min-height: 800px) { .thumb { width: 56px; height: 56px; } }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  label:has(input:focus-visible) { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (forced-colors: active) { label.on { outline: 2px solid Highlight; } }
  @media (hover: hover) { label:not(.on):hover { color: var(--gl-color-text); } }
</style>
