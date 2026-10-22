<script lang="ts">
  import type { Snippet } from 'svelte'
  interface Props { open: boolean; labelledby: string; variant?: string; onclose: () => void; children: Snippet }
// Native modal <dialog> styled as a GlassKit modal: showModal() traps focus, makes the page inert and
  // returns focus to the trigger on close. Escape fades out like the Close button. A solid surface keeps
  // muted text readable over any art behind it.
  let { open, labelledby, variant = 'center', onclose, children }: Props = $props()
  let el = $state<HTMLDialogElement>(undefined!)
  let active = $state(false)
  let closing: ReturnType<typeof setTimeout> | number = 0
  const instant = () => matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    if (!el) return
    if (open) {
      clearTimeout(closing) // reopened while fading out: keep the same dialog open
      if (!el.open) { el.showModal(); void el.offsetHeight }
      active = true
    } else if (el.open) {
      active = false
      const d = el
      if (instant()) d.close()
      else closing = setTimeout(() => d.close(), 150)
    }
  })
</script>

<dialog
  bind:this={el}
  class="glass-modal-overlay dlg {variant}"
  class:is-active={active}
  aria-labelledby={labelledby}
  oncancel={(e) => { e.preventDefault(); onclose() }}
  onclick={(e) => { if (e.target === el) onclose() }}
>
  <div class="glass-modal">
    {#if variant === 'sheet'}<div class="grabber" aria-hidden="true"></div>{/if}
    {@render children()}
  </div>
</dialog>

<style>
  .dlg { transition-duration: 150ms; }
  .dlg :global(.glass-modal) {
    --gl-modal-max-width: 560px;
    max-height: calc(100dvh - 32px); overflow: hidden; display: flex; flex-direction: column; text-align: start;
    background: var(--surface-solid); backdrop-filter: none; -webkit-backdrop-filter: none;
    box-shadow: var(--gl-shadow-modal); transition-duration: 150ms;
  }
  .dlg.sheet { align-items: flex-end; padding: 0; }
  .dlg.sheet :global(.glass-modal) {
    max-width: 720px; max-height: 88dvh; border-radius: 24px 24px 0 0; border-bottom: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .grabber { width: 36px; height: 5px; border-radius: 3px; margin: 8px auto 0; background: var(--gl-border-strong); flex: none; }
</style>
