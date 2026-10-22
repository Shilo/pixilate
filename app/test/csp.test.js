import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import config from '../vite.config.ts'

const plugin = config.plugins.flat().find((p) => p?.name === 'pixilate-csp')
const script = '\n  globalThis.__lineEndingProbe = true;\n'
const expected = createHash('sha256').update(script).digest('base64')

test.each([['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']])('CSP permits parser-normalized %s inline scripts without editing HTML', (_label, ending) => {
  const encoded = script.replaceAll('\n', ending)
  const html = '<meta charset="UTF-8" /><script>' + encoded + '</script>'
  const output = plugin.transformIndexHtml.handler(html)
  expect(output).toContain("'sha256-" + expected + "'")
  expect(output.match(/<script>([\s\S]*?)<\/script>/)[1]).toBe(encoded)
})
