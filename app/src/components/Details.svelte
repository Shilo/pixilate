<script>
  // Plain report of the shown result (spec §8.7). Raw engine text appears only in the one Technical
  // disclosure at the end.
  import Dialog from './Dialog.svelte'
  import { ICONS } from '../lib/icons.js'
  import { T, dims, styleLabel, styleDesc, reason, warningSentences, bgLine, trimCaption, failedStyle, metaClaim, cleanLine, bestIs } from '../lib/copy.js'
  import { styleIdOf } from '../lib/opts.js'
  import { countColours } from '../lib/geometry.js'

  let { open, onclose, variant, info, result, shown, onrecipe, oncopyhash } = $props()

  const c = $derived(result?.candidates.find((x) => x.id === shown) ?? null)
  const r = $derived(c?.report ?? null)
  const g0 = $derived(info?.grid ?? null)
  const label = $derived(c ? styleLabel(styleIdOf(c, result)) : '')
  const best = $derived(!!c && c.id === result.recommended)
  const bestCand = $derived(result?.candidates.find((x) => x.id === result.recommended) ?? null)
  const swatches = $derived.by(() => {
    if (!c || r?.output?.colors == null) return []
    const seen = new Set(), d = c.rgba
    for (let p = 0; p < d.length && seen.size <= 64; p += 4) if (d[p + 3]) seen.add(((d[p] << 16) | (d[p + 1] << 8) | d[p + 2]) >>> 0)
    return [...seen].slice(0, 64).map((v) => '#' + v.toString(16).padStart(6, '0'))
  })
  const per = (p) => (p[0] === p[1] ? `${p[0]} px` : `${p[0]} × ${p[1]} px`)
  const convGridDiffers = $derived(!!(r?.grid && g0 && (r.grid.native[0] !== g0.native[0] || r.grid.native[1] !== g0.native[1])))
  // decode warnings are listed once, under Image
  const notes = $derived(r ? warningSentences(r.warnings.filter((w) => !(info?.warnings ?? []).includes(w))) : [])
  const technical = $derived.by(() => {
    const out = []
    if (result) out.push(`Recommendation: ${result.recommendation.rule}: ${result.recommendation.evidence}`)
    if (r || g0) out.push('Grid evidence:', ...(r?.grid?.evidence ?? g0.evidence))
    if (r?.warnings.length) out.push('Warnings:', ...r.warnings)
    if (r) out.push('Stages: ' + JSON.stringify({ background: r.background, trim: r.trim, cleanup: r.cleanup }))
    for (const f of result?.failed ?? []) out.push(`Failed ${f.id}: ${f.message}`)
    if (r) out.push('Options: ' + JSON.stringify(r.recipe.options))
    return out.join('\n')
  })
</script>

<Dialog {open} {onclose} {variant} labelledby="details-title">
  <div class="head">
    <h2 class="glass-modal__title" id="details-title">{T.details}</h2>
    <button class="icon-btn close" aria-label={T.close} onclick={onclose}><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS.x}</svg></button>
  </div>
  <div class="body">
    {#if c && r}
      <section>
        <h3>{T.dResult}</h3>
        <dl>
          <dt>{T.style}</dt><dd>{label}{best ? ` · ${T.best}` : ''}</dd>
          <dt>{T.size}</dt><dd class="num">{dims(c.width, c.height)}</dd>
          <dt>{T.coloursUsed}</dt><dd class="num">{r.output.colors ?? countColours(c.rgba)}{r.output.colorsAllowed ? ` (${r.output.colorsAllowed} ${T.coloursAllowed})` : ''}</dd>
          <dt>{T.seeThrough}</dt><dd>{r.output.transparent ? T.yes : T.no}</dd>
        </dl>
        {#if swatches.length}
          <ul class="sw" aria-label={T.coloursUsed}>
            {#each swatches as s}<li style:background={s} aria-label={s} title={s}></li>{/each}
          </ul>
        {/if}
      </section>

      <section>
        <h3>{T.dWhy}</h3>
        {#if best}
          <p>{reason(result.recommendation, g0?.class)}</p>
        {:else}
          <p>{label}: {styleDesc(styleIdOf(c, result), r.route)}</p>
          {#if bestCand}<p class="muted">{bestIs(styleLabel(styleIdOf(bestCand, result)), reason(result.recommendation, g0?.class))}</p>{/if}
        {/if}
      </section>
    {/if}

    {#if g0}
      <section>
        <h3>{T.dGrid}</h3>
        <dl>
          <dt>{T.dGrid}</dt><dd>{T.gridClass[g0.class]}</dd>
          {#if g0.confidence > 0}<dt>{T.confidence}</dt><dd class="num">{Math.round(g0.confidence * 100)} %</dd>{/if}
          {#if g0.class !== 'none'}
            <dt>{T.blockSize}</dt><dd class="num">{per(g0.period)}</dd>
            <dt>{T.nativeSize}</dt><dd class="num">{dims(g0.native[0], g0.native[1])}</dd>
          {/if}
          {#if g0.candidates?.filter((k) => k.sx > 1 && k.sx === k.sy).length > 1}
            <dt>{T.alternatives}</dt><dd class="num">{g0.candidates.filter((k) => k.sx > 1 && k.sx === k.sy).slice(1, 5).map((k) => dims(k.countX, k.countY)).join(', ')}</dd>
          {/if}
          {#if convGridDiffers}<dt>{T.usedGrid}</dt><dd class="num">{dims(r.grid.native[0], r.grid.native[1])}</dd>{/if}
        </dl>
      </section>
    {/if}

    {#if r}
      <section>
        <h3>{T.dNotes}</h3>
        {#each notes as s}<p>{s}</p>{:else}<p class="muted">{T.noNotes}</p>{/each}
      </section>

      {#if r.background?.mode || r.trim?.enabled || c.id === 'clean'}
        <section>
          <h3>{T.dTools}</h3>
          {#if r.background?.mode}<p>{bgLine(r.background)}</p>{/if}
          {#if r.trim?.enabled}<p class="num">{trimCaption(r)}</p>{/if}
          {#if c.id === 'clean'}<p>{cleanLine(r)}</p>{/if}
        </section>
      {/if}
    {/if}

    {#if info}
      <section>
        <h3>{T.dImage}</h3>
        <dl>
          <dt>{T.size}</dt><dd class="num">{dims(info.width, info.height)}</dd>
          <dt>{T.format}</dt><dd>{info.format?.toUpperCase()}</dd>
          <dt>{T.decodeMode}</dt><dd>{info.decode === 'js' ? T.exactMode : T.compatMode}</dd>
          <dt>{T.seeThrough}</dt><dd>{info.hasAlpha ? T.yes : T.no}</dd>
        </dl>
        {#each warningSentences(info.warnings) as s}<p>{s}</p>{/each}
        {#if info.generator?.confidence?.startsWith('declared')}<p>{metaClaim(info.generator.family)}</p>{/if}
      </section>
    {/if}

    {#if result && ((result.alias.clean && result.alias.clean !== 'clean') || result.failed.length)}
      <section>
        <h3>{T.dOther}</h3>
        {#if result.alias.clean && result.alias.clean !== 'clean'}<p>{T.cleanNone}</p>{/if}
        {#each result.failed as f}<p>{failedStyle(f.id, f.code)}</p>{/each}
      </section>
    {/if}

    {#if c && r}
      <section>
        <h3>{T.dRepro}</h3>
        <dl>
          <dt>{T.engine}</dt><dd class="num">{r.recipe.engine.id} {r.recipe.engine.version}</dd>
          <dt>{T.hash}</dt>
          <dd class="hash">
            {#if c.hash}<code>{c.hash}</code> <button class="glass-badge glass-badge--interactive tap" onclick={() => oncopyhash(c.hash)}>{T.copyHash}</button>
            {:else}<span class="muted">{T.unavailable}</span>{/if}
          </dd>
        </dl>
        <p class="small muted">{T.copyNote}</p>
        <button class="glass-btn glass-btn--secondary glass-btn--sm" onclick={onrecipe}>{T.saveRecipe}</button>
      </section>
    {/if}

    <section>
      <details>
        <summary>{T.keys}</summary>
        <table>
          <tbody>{#each T.keyRows as [k, a]}<tr><th scope="row"><kbd>{k}</kbd></th><td>{a}</td></tr>{/each}</tbody>
        </table>
      </details>
      {#if technical}
        <details>
          <summary>{T.technical}</summary>
          <pre>{technical}</pre>
        </details>
      {/if}
    </section>
  </div>
</Dialog>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px 8px 20px; flex: none; }
  .close { flex: none; }
  .body { padding: 0 20px 20px; display: flex; flex-direction: column; gap: 18px; overflow: auto; min-height: 0; overscroll-behavior: contain; }
  .body > * { max-width: 60ch; }
  section { display: flex; flex-direction: column; gap: 6px; }
  h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gl-color-text-muted); margin: 0; }
  dl { display: grid; grid-template-columns: 11em minmax(0, 1fr); gap: 4px 12px; margin: 0; }
  dt { color: var(--gl-color-text-muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .hash code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; margin: 6px 0 0; max-height: 280px; overflow: auto; }
  summary { cursor: pointer; font-weight: 500; min-height: 32px; display: flex; align-items: center; }
  .sw { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
  .sw li { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--gl-border-subtle); }
  table { border-collapse: collapse; font-size: 14px; }
  th, td { text-align: start; padding: 4px 12px 4px 0; vertical-align: top; }
  th { font-weight: 500; white-space: nowrap; }
  kbd { font-family: inherit; font-size: 13px; padding: 1px 6px; border-radius: 6px; border: 1px solid var(--gl-border-medium); }
  .glass-btn--sm { align-self: flex-start; width: auto; padding: 0 16px; }
  @media (pointer: coarse) {
    summary, .tap { min-height: 44px; }
    .close { width: 44px; height: 44px; }
  }
  @media (max-width: 420px) { dl { grid-template-columns: 9em minmax(0, 1fr); } }
</style>
