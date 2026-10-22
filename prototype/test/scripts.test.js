// Live-testing tools: score.mjs hard checks and a live-batch.mjs smoke run on a procedural sprite.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { scoreImage } from '../scripts/score.mjs'
import { proceduralSprites, writePng } from './fixtures.js'
import { engineEntry } from '../scripts/engine-entry.mjs'

describe('comparison engine archives', () => {
  it.each(['js', 'ts'])('loads a %s engine archive from a path containing spaces', (extension) => {
    const dir = mkdtempSync(join(tmpdir(), 'pixilate engine-'))
    try {
      mkdirSync(join(dir, 'lib', 'core'), { recursive: true })
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}')
      const declaration = extension === 'ts' ? 'marker: string' : 'marker'
      writeFileSync(join(dir, 'lib', 'core', `pipeline.${extension}`), `export const ${declaration} = '${extension}'`)
      const code = `console.log((await import(${JSON.stringify(engineEntry(dir))})).marker)`
      const loaded = execFileSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8' })
      expect(loaded.trim()).toBe(extension)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

const sprite = proceduralSprites(1)[0].img
const nnUp = (im, k) => {
  const w = im.width * k, h = im.height * k, d = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(im.data.subarray((((y / k) | 0) * im.width + ((x / k) | 0)) * 4, (((y / k) | 0) * im.width + ((x / k) | 0)) * 4 + 4), (y * w + x) * 4)
  return { width: w, height: h, data: d }
}

describe('scoreImage', () => {
  it('passes native procedural pixel art at its own size', () => {
    const r = scoreImage(sprite, { targetW: sprite.width, targetH: sprite.height })
    expect(r.hard).toEqual({ size: true, binaryAlpha: true, noMixels: true, paletteCap: null })
  })
  it('flags wrong size, semi-transparent pixels, a palette over cap and hidden 2x upscale', () => {
    const soft = { ...sprite, data: Uint8ClampedArray.from(sprite.data, (v, i) => (i % 4 === 3 && v === 255 ? 200 : v)) }
    expect(scoreImage(soft).hard.binaryAlpha).toBe(false)
    expect(scoreImage(sprite, { targetW: 32, targetH: 32 }).hard.size).toBe(false)
    expect(scoreImage(sprite, { maxColors: 2 }).hard.paletteCap).toBe(false)
    const r = scoreImage(nnUp(sprite, 2))
    expect(r.hard.noMixels).toBe(false)
    expect(r.pass).toBe(false)
  })
})

describe('live-batch.mjs', () => {
  it('converts a folder, scores candidates and writes outputs, a sheet and a results log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixilate-live-'))
    try {
      mkdirSync(join(dir, 'in'))
      writePng(join(dir, 'in', 'live-001.png'), nnUp(sprite, 8))
      const script = fileURLToPath(new URL('../scripts/live-batch.mjs', import.meta.url))
      execFileSync(process.execPath, [script, '--in', join(dir, 'in') + '/', '--out', join(dir, 'out') + '/', '--sizes', '16x16'], { stdio: 'pipe' })
      const outs = readdirSync(join(dir, 'out', 'live-001'))
      expect(outs).toContain('sheet-live-001.png')
      expect(outs.some((f) => f.endsWith('-rec.png'))).toBe(true)
      const log = readFileSync(join(dir, 'out', 'results-log.md'), 'utf8')
      expect(log).toMatch(/\| live-001 \|.*\| 24×28 \| default \| grid \| yes \|/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }, 60000)
})
