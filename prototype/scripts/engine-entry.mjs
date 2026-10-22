// --engine accepts a source directory, including historical JavaScript git archives.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function engineEntry(sourceRoot) {
  if (!sourceRoot) return new URL('../src/lib/core/pipeline.ts', import.meta.url).href
  const typed = resolve(sourceRoot, 'lib/core/pipeline.ts')
  return pathToFileURL(existsSync(typed) ? typed : resolve(sourceRoot, 'lib/core/pipeline.js')).href
}
