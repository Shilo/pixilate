import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// The engine is the prototype's lib, imported in place (never copied): $engine -> ../prototype/src/lib.
// Its codecs (fast-png, jpeg-js) resolve from prototype/node_modules, so install prototype first.
export default defineConfig({
  plugins: [svelte()],
  resolve: { alias: { $engine: fileURLToPath(new URL('../prototype/src/lib', import.meta.url)) } },
  server: { port: 5210, strictPort: true, fs: { allow: ['.', '../prototype/src/lib', '../prototype/node_modules'] } },
  preview: { port: 5211, strictPort: true },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
})
