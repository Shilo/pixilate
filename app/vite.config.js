import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// FR-021 zero-network promise as a Content Security Policy, build only: the dev server injects
// <style> elements and an HMR socket that a strict policy would block. Inline scripts are allowed
// by their sha256, computed from the final HTML so the hash cannot go stale.
const csp = {
  name: 'pixilate-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
      const policy = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`,
        "style-src 'self'",
        "img-src 'self' blob: data:",
        "connect-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ')
      return html.replace(/<meta charset="UTF-8" \/>/, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  },
}

// The engine is the prototype's lib, imported in place (never copied): $engine -> ../prototype/src/lib.
// Its codecs (fast-png, jpeg-js) resolve from prototype/node_modules, so install prototype first.
export default defineConfig({
  plugins: [svelte(), csp],
  resolve: { alias: { $engine: fileURLToPath(new URL('../prototype/src/lib', import.meta.url)) } },
  server: { port: 5210, strictPort: true, fs: { allow: ['.', '../prototype/src/lib', '../prototype/node_modules'] } },
  preview: { port: 5211, strictPort: true },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
})
