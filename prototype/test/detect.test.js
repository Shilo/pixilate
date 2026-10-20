import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import jpeg from 'jpeg-js'
import { detectGenerator } from '../src/lib/core/detect.js'
import { decodeImage, encodePng } from '../src/lib/decode.js'

const enc = (s) => new TextEncoder().encode(s)
const cat = (...parts) => {
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { o.set(p, i); i += p.length }
  return o
}
const be32 = (n) => new Uint8Array([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])

/** Tiny CBOR encoder (text, arrays, maps) for synthetic C2PA assertions. */
function cbor(v) {
  const head = (mt, n) => (n < 24 ? [mt << 5 | n] : n < 256 ? [mt << 5 | 24, n] : [mt << 5 | 25, n >> 8, n & 255])
  if (typeof v === 'string') { const b = enc(v); return cat(new Uint8Array(head(3, b.length)), b) }
  if (Array.isArray(v)) return cat(new Uint8Array(head(4, v.length)), ...v.map(cbor))
  const e = Object.entries(v)
  return cat(new Uint8Array(head(5, e.length)), ...e.flatMap(([k, x]) => [cbor(k), cbor(x)]))
}
const box = (type, payload) => cat(be32(8 + payload.length), enc(type), payload)
const jumbf = (label, content) => box('jumb', cat(box('jumd', cat(new Uint8Array(16), new Uint8Array([3]), enc(label + '\0'))), content))

const OPENAI_MANIFEST = jumbf('c2pa', cat(
  jumbf('c2pa.claim.v2', box('cbor', cbor({ claim_generator_info: { name: 'OpenAI Media Service API' } }))),
  jumbf('c2pa.actions.v2', box('cbor', cbor({
    actions: [
      { action: 'c2pa.created', softwareAgent: { name: 'gpt-image', version: '2.0' }, digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' },
      { action: 'c2pa.watermarked.unbound' },
    ],
  }))),
))

/** Valid PNG of img with extra chunks inserted after IHDR. */
function png(img, chunks = []) {
  const base = encodePng(img)
  const raw = chunks.map(([type, data]) => { const body = cat(enc(type), data); return cat(be32(data.length), body, be32(crc32(body))) })
  return cat(base.subarray(0, 33), ...raw, base.subarray(33))
}
const solid = (w, h, v = 40) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v).map((x, i) => (i % 4 === 3 ? 255 : x)) })
const noVerified = (d) => expect(d.evidence.some((e) => /(?<!un)verified/i.test(e))).toBe(false)
const D = 'declared (unvalidated)'

describe('detectGenerator metadata', () => {
  it('PNG caBX with OpenAI markers -> openai declared (unvalidated), model from softwareAgent', () => {
    const img = solid(8, 8)
    const d = detectGenerator(png(img, [['caBX', OPENAI_MANIFEST]]), img)
    expect([d.family, d.model, d.confidence]).toEqual(['openai', 'gpt-image 2.0', D])
    expect(d.evidence.join('\n')).toMatch(/file metadata claims C2PA generator "OpenAI Media Service API"/)
    expect(d.evidence.join('\n')).toMatch(/invisible watermark/)
    expect(d.preset.jpegStrict).toBe(false)
    expect(d.watermarkMask).toBe(null)
    noVerified(d)
  })

  it('PNG tEXt "parameters" -> AUTOMATIC1111 by key only; prompt and settings never reach the result (privacy)', () => {
    const img = solid(8, 8)
    const params = 'secret castle prompt by someuser\nNegative prompt: blurry\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1, Size: 512x512, Model hash: abc123, Model: pixelArtXL'
    const d = detectGenerator(png(img, [['tEXt', enc('parameters\0' + params)]]), img)
    expect([d.family, d.model, d.confidence]).toEqual(['stable-diffusion', null, D])
    expect(d.evidence.join('\n')).toMatch(/AUTOMATIC1111.*"parameters"; content not read/)
    const all = JSON.stringify({ ...d, watermarkMask: null })
    for (const leak of ['secret', 'castle', 'someuser', 'blurry', 'Seed', 'pixelArtXL', 'abc123']) expect(all).not.toContain(leak)
  })

  it('PNG tEXt "prompt" -> ComfyUI by key only', () => {
    const img = solid(8, 8)
    const d = detectGenerator(png(img, [['tEXt', enc('prompt\0{"4":{"inputs":{"ckpt_name":"sdxl.safetensors"},"class_type":"CheckpointLoaderSimple"}}')]]), img)
    expect([d.family, d.model]).toEqual(['stable-diffusion', null])
    expect(JSON.stringify(d.evidence)).not.toContain('sdxl')
  })

  it('JPEG with split APP11 JUMBF and APP1 XMP', () => {
    const jpg = new Uint8Array(jpeg.encode({ width: 8, height: 8, data: new Uint8Array(256).fill(128) }, 90).data)
    // Split the manifest across two APP11 segments; the split lands inside "OpenAI Media Service API".
    const cut = new TextDecoder('latin1').decode(OPENAI_MANIFEST).indexOf('Media Service')
    const seg = (z, payload, repeatHeader) => {
      const body = cat(enc('JP'), new Uint8Array([0, 1]), be32(z), repeatHeader ? OPENAI_MANIFEST.subarray(0, 8) : new Uint8Array(0), payload)
      return cat(new Uint8Array([0xff, 0xeb, (body.length + 2) >> 8, (body.length + 2) & 255]), body)
    }
    const xmp = enc('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>')
    const app1 = cat(new Uint8Array([0xff, 0xe1, (xmp.length + 2) >> 8, (xmp.length + 2) & 255]), xmp)
    const file = cat(jpg.subarray(0, 2), app1, seg(1, OPENAI_MANIFEST.subarray(0, cut), false), seg(2, OPENAI_MANIFEST.subarray(cut), true), jpg.subarray(2))
    const d = detectGenerator(file, { width: 8, height: 8, data: new Uint8ClampedArray(256) })
    expect([d.family, d.model, d.confidence]).toEqual(['openai', 'gpt-image 2.0', D])
    expect(d.evidence.join('\n')).toMatch(/XMP DigitalSourceType trainedAlgorithmicMedia/)
    expect(d.preset.jpegStrict).toBe(true)
    noVerified(d)
  })

  it('XMP-only Midjourney -> declared; description text and job ID are not echoed', () => {
    const img = solid(8, 8)
    const d = detectGenerator(png(img, [['iTXt', enc('XML:com.adobe.xmp\0\0\0\0\0<dc:description>pixel knight Job ID: 123 midjourney</dc:description>')]]), img)
    expect([d.family, d.confidence]).toEqual(['midjourney', D])
    expect(JSON.stringify(d.evidence)).not.toMatch(/knight|Job ID|123/)
  })
})

describe('detectGenerator without metadata', () => {
  it('1024x1024 -> dimension-based possible with several candidates', () => {
    const img = solid(1024, 1024)
    const d = detectGenerator(encodePng(img), img)
    expect(d.confidence).toBe('possible')
    expect(d.family).toBe('unknown')
    expect(d.candidates).toEqual(expect.arrayContaining(['openai', 'google', 'midjourney', 'stable-diffusion']))
    expect(d.watermarkMask).toBe(null) // dimensions alone never mask
  })

  it('random 1000x1000 -> unknown', () => {
    const img = { width: 1000, height: 1000, data: new Uint8ClampedArray(4e6) }
    let s = 12345
    for (let i = 0; i < img.data.length; i++) { s = (s * 1103515245 + 12345) >>> 0; img.data[i] = i % 4 === 3 ? 255 : s >>> 24 }
    const d = detectGenerator(encodePng(img), img)
    expect([d.family, d.confidence, d.candidates, d.watermarkMask]).toEqual(['unknown', 'unknown', [], null])
  })

  it('bright corner mark without a declaration -> no mask, no family (no pixel test)', () => {
    const img = solid(1024, 1024, 30)
    for (let y = 950; y < 1000; y++) for (let x = 950; x < 1000; x++) { const o = (y * 1024 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 200 }
    const d = detectGenerator(null, img)
    expect([d.family, d.watermarkMask]).toEqual(['unknown', null])
  })

  it('declared visible watermark -> generic bottom-right 8% corner mask, pixels unchanged', () => {
    const img = solid(100, 50)
    const before = img.data.slice()
    const manifest = jumbf('c2pa', jumbf('c2pa.actions.v2', box('cbor', cbor({ actions: [{ action: 'c2pa.edited', description: 'Added visible watermark' }] }))))
    const d = detectGenerator(png(img, [['caBX', manifest]]), img)
    expect(d.watermarkMask.length).toBe(100 * 50)
    expect(d.watermarkMask.reduce((n, v) => n + v, 0)).toBe(8 * 4) // x >= 92, y >= 46
    expect([d.watermarkMask[49 * 100 + 99], d.watermarkMask[45 * 100 + 99], d.watermarkMask[49 * 100 + 91]]).toEqual([1, 0, 0])
    expect(d.evidence.join(' | ')).toMatch(/analysis mask only, pixels unchanged/)
    expect(img.data).toEqual(before)
  })

  it('never throws on garbage and is fast on a 3 MB PNG', () => {
    expect(detectGenerator(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 255, 255, 255, 255]), null).family).toBe('unknown')
    const big = png(solid(8, 8), Array.from({ length: 48 }, () => ['IDAT', new Uint8Array(65536)]))
    const t = performance.now()
    detectGenerator(big, null)
    expect(performance.now() - t).toBeLessThan(20)
  })
})

const samples = [
  ['gpt-oni.png', 'openai'],
  ['gpt-forest.png', 'openai'],
  ['gemini-mage.png', 'google'],
]
describe('real local samples (skipped when absent)', () => {
  for (const [rel, family] of samples) {
    const url = new URL(`../../.local/samples/${rel}`, import.meta.url)
    it.skipIf(!existsSync(url))(`${rel.split('/').pop()} -> ${family}`, async () => {
      const bytes = new Uint8Array(readFileSync(url))
      const { img } = await decodeImage(bytes)
      const t = performance.now()
      const d = detectGenerator(bytes, img)
      expect(performance.now() - t).toBeLessThan(20)
      expect(d.family).toBe(family)
      expect(d.confidence).toBe(D)
      if (family === 'openai') expect(d.model).toMatch(/gpt-image/)
      if (family === 'google') expect(d.watermarkMask).not.toBe(null) // manifest declares a visible mark
      noVerified(d)
    })
  }
})
