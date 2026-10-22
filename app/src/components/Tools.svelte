<script lang="ts">
  import type { Tools as ToolSettings, Report } from '../lib/types.ts'
  interface Props { tools: ToolSettings; hasAlpha: boolean; report?: Report | null; bgKept?: boolean; onchange: (tools: ToolSettings) => void }
// Explicit, composable stages, all off by default (spec §8.3): background, trim (basis 'cells'), colours.
  // iOS layout: label and help on the left, the switch on the right.
  import { T, bgLine, trimCaption, coloursUsed } from '../lib/copy.ts'
  import { COLOURS, DEFAULT_TOOLS } from '../lib/opts.ts'

  let { tools, hasAlpha, report = null, bgKept = false, onchange }: Props = $props()
  const canTrim = $derived(hasAlpha || tools.background)
  const set = (k: keyof ToolSettings, v: ToolSettings[keyof ToolSettings]) => {
    const t = { ...tools, [k]: v }
    if (k === 'background' && !v && !hasAlpha) t.trim = false // Fit to sprite needs see-through edges
    onchange(t)
  }
  const anyOn = $derived(tools.background || tools.trim || tools.colors !== 'auto')
  const removed = $derived(tools.background && report?.background?.applied ? report.background.removed : null)
  const cap = $derived(tools.trim && report ? trimCaption(report) : null)
</script>

{#snippet toggle(key: "background" | "trim", label: string, help: string, disabled: boolean)}
  <label class="glass-toggle row-toggle" class:off={disabled}>
    <span class="txt">
      <span class="glass-toggle__label">{label}</span>
      <span class="small muted" id="{key}-help">{help}</span>
    </span>
    <input class="glass-toggle__input" type="checkbox" role="switch" checked={tools[key]} {disabled} aria-describedby="{key}-help"
      onchange={(e) => set(key, e.currentTarget.checked)} />
    <span class="glass-toggle__track"><span class="glass-toggle__thumb"></span></span>
  </label>
{/snippet}

<div class="tools">
  <div class="item">
    {@render toggle('background', T.bgLabel, T.bgHelp, false)}
    {#if bgKept}<p class="small warn">{T.bgKept}</p>{:else if removed != null}<p class="small">{bgLine(report!.background)}</p>{/if}
  </div>

  <div class="item">
    {@render toggle('trim', T.trimLabel, canTrim ? T.trimHelp : T.trimNeeds, !canTrim)}
    {#if cap}<p class="small num">{cap}</p>{/if}
  </div>

  <div class="item">
    <span class="lab" id="colours-label">{T.colours}</span>
    <div class="glass-segmented colours" role="group" aria-labelledby="colours-label">
      {#each COLOURS as c}
        <button class="glass-segmented__item num" aria-pressed={tools.colors === c} onclick={() => set('colors', c)}>{c === 'auto' ? T.auto : c}</button>
      {/each}
    </div>
    <p class="small muted">{report?.output?.colors != null ? coloursUsed(report.output.colors, report.output.colorsAllowed) : T.coloursHelp}</p>
  </div>

  {#if anyOn}<button class="linkish allOff" onclick={() => onchange({ ...DEFAULT_TOOLS })}>{T.allOff}</button>{/if}
</div>

<style>
  .tools { display: flex; flex-direction: column; gap: 14px; }
  .item { display: flex; flex-direction: column; gap: 4px; }
  .row-toggle { position: relative; display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 12px; min-height: 32px; }
  .row-toggle .txt { display: flex; flex-direction: column; min-width: 0; }
  .row-toggle .glass-toggle__label { font-weight: 500; }
  /* the invisible input sits on the switch, which is now at the end */
  .row-toggle .glass-toggle__input { inset-inline-end: 0; top: 50%; margin: 0; transform: translateY(-50%); }
  .row-toggle .glass-toggle__track { margin-top: 0; }
  .glass-toggle.off { opacity: 0.55; cursor: not-allowed; }
  .lab { font-weight: 500; }
  .warn { color: var(--gl-color-warning-on-surface); }
  .allOff { align-self: flex-start; }
  .colours { display: flex; flex-wrap: wrap; width: 100%; }
  .colours .glass-segmented__item { flex: 1 0 40px; padding-inline: 4px; }
  .glass-toggle:has(input:focus-visible) .glass-toggle__track { outline: 2px solid var(--ring); outline-offset: 2px; }
  @media (pointer: coarse) { .row-toggle { min-height: 44px; } .colours .glass-segmented__item { flex-basis: 44px; } }
</style>
