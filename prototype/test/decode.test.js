import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { encode as fastPngEncode } from 'fast-png'
import jpeg from 'jpeg-js'
import { decodeImage, encodePng, orient, sniffFormat } from '../src/lib/decode.js'

/** Insert a raw chunk directly after IHDR (byte 33). */
function withChunk(png, type, data) {
  const body = new Uint8Array(4 + data.length)
  body.set([...type].map((c) => c.charCodeAt(0))); body.set(data, 4)
  const ch = new Uint8Array(12 + data.length), dv = new DataView(ch.buffer)
  dv.setUint32(0, data.length); ch.set(body, 4); dv.setUint32(8 + data.length, crc32(body))
  return new Uint8Array([...png.subarray(0, 33), ...ch, ...png.subarray(33)])
}

const rgba = (img) => [...img.data]

describe('decodeImage PNG', () => {
  it('RGBA 8-bit round-trips through encodePng', async () => {
    const img = { width: 3, height: 2, data: new Uint8ClampedArray([1, 2, 3, 4, 250, 0, 9, 255, 7, 7, 7, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) }
    const out = await decodeImage(encodePng(img))
    expect(out.format).toBe('png'); expect(out.decode).toBe('js'); expect(out.strict).toBe(true)
    expect(out.img.width).toBe(3); expect(out.img.height).toBe(2)
    expect(out.img.data).toBeInstanceOf(Uint8ClampedArray)
    expect(rgba(out.img)).toEqual(rgba(img))
  })

  it('RGB 8-bit gets opaque alpha', async () => {
    const png = fastPngEncode({ width: 2, height: 1, channels: 3, depth: 8, data: new Uint8Array([1, 2, 3, 4, 5, 6]) })
    expect(rgba((await decodeImage(png)).img)).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
  })

  it('RGB color key (tRNS) becomes transparent', async () => {
    // 4 px: fast-png 8 rejects an RGB tRNS on images under 3 px.
    const png = fastPngEncode({ width: 2, height: 2, channels: 3, depth: 8, data: new Uint8Array([1, 2, 3, 4, 5, 6, 4, 5, 6, 7, 8, 9]) })
    const keyed = withChunk(png, 'tRNS', new Uint8Array([0, 4, 0, 5, 0, 6]))
    expect(rgba((await decodeImage(keyed)).img)).toEqual([1, 2, 3, 255, 4, 5, 6, 0, 4, 5, 6, 0, 7, 8, 9, 255])
  })

  it('8-bit palette with alpha', async () => {
    // Translucent entries first: fast-png 8's encoder writes tRNS for non-opaque entries only.
    const palette = [[0, 255, 0, 128], [0, 0, 255, 0], [255, 0, 0, 255]]
    const png = fastPngEncode({ width: 3, height: 1, channels: 1, depth: 8, palette, data: new Uint8Array([1, 2, 0]) })
    expect(rgba((await decodeImage(png)).img)).toEqual([0, 0, 255, 0, 255, 0, 0, 255, 0, 255, 0, 128])
  })

  it('2-bit packed palette with row padding', async () => {
    const palette = [[0, 0, 0], [10, 20, 30], [40, 50, 60], [70, 80, 90]]
    // 3 px/row at 2 bits = 6 bits -> 1 byte per row. Rows: [1,2,3], [3,0,1]
    const data = new Uint8Array([0b01101100, 0b11000100])
    const png = fastPngEncode({ width: 3, height: 2, channels: 1, depth: 2, palette, data })
    const px = rgba((await decodeImage(png)).img)
    const idx = [1, 2, 3, 3, 0, 1]
    expect(px).toEqual(idx.flatMap((i) => [...palette[i], 255]))
  })

  it('4-bit grayscale scales to 8-bit', async () => {
    const png = fastPngEncode({ width: 3, height: 1, channels: 1, depth: 4, data: new Uint8Array([0x0f, 0x50]) })
    expect(rgba((await decodeImage(png)).img)).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 85, 85, 85, 255])
  })

  it('RGB with a suggested PLTE chunk decodes as RGB, not palette indices', async () => {
    const png = fastPngEncode({ width: 4, height: 1, channels: 3, depth: 8, data: new Uint8Array([1, 2, 3, 40, 50, 60, 0, 0, 0, 200, 100, 7]) })
    const plte = withChunk(png, 'PLTE', new Uint8Array([9, 9, 9, 8, 8, 8, 7, 7, 7]))
    expect(rgba((await decodeImage(plte)).img)).toEqual([1, 2, 3, 255, 40, 50, 60, 255, 0, 0, 0, 255, 200, 100, 7, 255])
  })

  it('rejects a PNG over 16.7 MP from its IHDR, before decoding', async () => {
    const png = encodePng({ width: 1, height: 1, data: new Uint8ClampedArray(4) })
    new DataView(png.buffer, png.byteOffset).setUint32(16, 5000); new DataView(png.buffer, png.byteOffset).setUint32(20, 5000)
    await expect(decodeImage(png)).rejects.toThrow(/Image too large: 5000x5000 exceeds 16.7 MP/)
  })

  it('16-bit RGBA reduces to 8-bit', async () => {
    const data = new Uint16Array([0, 65535, 257 * 128, 65535, 1000, 30000, 65280, 0])
    const png = fastPngEncode({ width: 2, height: 1, channels: 4, depth: 16, data })
    const out = await decodeImage(png)
    expect(rgba(out.img)).toEqual([...data].map((v) => Math.round(v / 257)))
    expect(rgba((await decodeImage(encodePng(out.img))).img)).toEqual(rgba(out.img))
  })
})

describe('decodeImage other formats', () => {
  it('decodes JPEG', async () => {
    const w = 16, h = 8, data = new Uint8Array(w * h * 4).fill(200)
    const jpg = jpeg.encode({ width: w, height: h, data }, 95).data
    const out = await decodeImage(new Uint8Array(jpg))
    expect(out.format).toBe('jpeg'); expect(out.decode).toBe('js')
    expect([out.img.width, out.img.height]).toEqual([w, h])
    expect(Math.abs(out.img.data[0] - 200)).toBeLessThan(4)
    expect(out.img.data[3]).toBe(255)
  })

  it('rejects a JPEG over 16.7 MP at its SOF', async () => {
    const jpg = new Uint8Array(jpeg.encode({ width: 8, height: 8, data: new Uint8Array(256) }, 90).data)
    const sof = jpg.findIndex((v, i) => v === 0xff && jpg[i + 1] === 0xc0)
    new DataView(jpg.buffer, jpg.byteOffset).setUint16(sof + 5, 5000); new DataView(jpg.buffer, jpg.byteOffset).setUint16(sof + 7, 5000)
    await expect(decodeImage(jpg)).rejects.toThrow(/Image too large: JPEG exceeds 16.7 MP/)
  })

  it('sniffs by magic bytes only, never the MIME hint (FMT-001)', () => {
    const riff = new Uint8Array([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)))
    expect(sniffFormat(riff)).toBe('webp')
    expect(sniffFormat(new Uint8Array(4), 'image/jpg')).toBe('other')
  })

  it('a text file declared image/png is a typed unsupported-format error, not "too large" (D56)', async () => {
    for (const text of ['not a png, just text!', 'a text file named fake.png with well over thirty bytes in it']) {
      const err = await decodeImage(new TextEncoder().encode(text), 'image/png').catch((e) => e)
      expect([err.code, err.message]).toEqual(['unsupported-format', 'unsupported-format: unsupported or undecodable file: no known image signature'])
    }
  })

  it('rejects canvas-only formats clearly in Node', async () => {
    const riff = new Uint8Array([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)))
    await expect(decodeImage(riff)).rejects.toThrow(/Cannot decode webp/)
  })
})

/** Big-endian TIFF block with one IFD0 entry: Orientation (0x0112, SHORT) = o. */
const tiff = (o) => new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0])
/** JPEG with an APPn segment (payload) inserted after SOI. */
const withApp = (jpg, marker, payload) => new Uint8Array([0xff, 0xd8, 0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload, ...jpg.subarray(2)])
const ascii = (s) => [...s].map((c) => c.charCodeAt(0))
// 3x2 image whose R channel is the pixel id A..F = 1..6 (rows ABC / DEF).
const ids = { width: 3, height: 2, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6].flatMap((v) => [v, 0, 0, 255])) }
const red = (img) => Array.from({ length: img.height }, (_, y) => Array.from({ length: img.width }, (_, x) => img.data[(y * img.width + x) * 4]))

describe('EXIF orientation (FMT-002)', () => {
  it('orient() applies all 8 values as exact pixel permutations', () => {
    const want = {
      1: [[1, 2, 3], [4, 5, 6]], 2: [[3, 2, 1], [6, 5, 4]], 3: [[6, 5, 4], [3, 2, 1]], 4: [[4, 5, 6], [1, 2, 3]],
      5: [[1, 4], [2, 5], [3, 6]], 6: [[4, 1], [5, 2], [6, 3]], 7: [[6, 3], [5, 2], [4, 1]], 8: [[3, 6], [2, 5], [1, 4]],
    }
    for (const [o, rows] of Object.entries(want)) expect(red(orient(ids, Number(o)))).toEqual(rows)
  })

  it('PNG eXIf orientation 6 is applied losslessly before anything else', async () => {
    const out = await decodeImage(withChunk(encodePng(ids), 'eXIf', tiff(6)))
    expect([out.orientation, out.img.width, out.img.height, out.strict]).toEqual([6, 2, 3, true])
    expect(red(out.img)).toEqual([[4, 1], [5, 2], [6, 3]])
  })

  it('JPEG APP1 Exif orientation 8 swaps the axes; an invalid value is a warning', async () => {
    const w = 16, h = 8, data = new Uint8Array(w * h * 4).fill(128)
    const jpg = new Uint8Array(jpeg.encode({ width: w, height: h, data }, 95).data)
    const out = await decodeImage(withApp(jpg, 0xe1, [...ascii('Exif\0\0'), ...tiff(8)]))
    expect([out.orientation, out.img.width, out.img.height]).toEqual([8, 8, 16])
    const bad = await decodeImage(withApp(jpg, 0xe1, [...ascii('Exif\0\0'), ...tiff(9)]))
    expect([bad.orientation, bad.img.width]).toEqual([1, 16])
    expect(bad.warnings).toContain('EXIF orientation 9 is invalid; ignored')
  })
})

describe('decode warnings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ignored PNG colour chunks and APNG are reported; a plain PNG has none', async () => {
    expect((await decodeImage(encodePng(ids))).warnings).toEqual([])
    let png = withChunk(encodePng(ids), 'gAMA', new Uint8Array([0, 0, 0xb1, 0x8f]))
    png = withChunk(png, 'sRGB', new Uint8Array([0]))
    png = withChunk(png, 'acTL', new Uint8Array([0, 0, 0, 2, 0, 0, 0, 0]))
    const out = await decodeImage(png)
    expect(out.warnings).toEqual(['colour metadata ignored, pixels assumed sRGB: gAMA, sRGB', 'animated PNG: only the default image is decoded'])
    expect(red(out.img)).toEqual([[1, 2, 3], [4, 5, 6]])
  })

  it('JPEG ICC profile is reported as ignored', async () => {
    const jpg = new Uint8Array(jpeg.encode({ width: 8, height: 8, data: new Uint8Array(256).fill(90) }, 90).data)
    const out = await decodeImage(withApp(jpg, 0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, 0, 0]))
    expect(out.warnings).toEqual(['colour metadata ignored, pixels assumed sRGB: ICC'])
  })

  it('canvas fallback is never silent: decode canvas, strict false, animated GIF first frame', async () => {
    const px = new Uint8ClampedArray([9, 8, 7, 255])
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1, height: 1, close() {} }))
    vi.stubGlobal('OffscreenCanvas', class { constructor(w, h) { this.width = w; this.height = h } getContext() { return { drawImage() {}, getImageData: () => ({ data: px }) } } })
    const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x4c, 0x01, 0]
    const gif = new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x21, 0xf9, 4, 0, 0, 0, 0, 0, ...frame, ...frame, 0x3b])
    const out = await decodeImage(gif)
    expect([out.decode, out.strict, out.format]).toEqual(['canvas', false, 'gif'])
    expect(out.warnings).toEqual(['non-strict browser decode (canvas) for gif: pixels may differ between browsers', 'animated gif: first frame only'])
    const still = await decodeImage(new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...frame, 0x3b]))
    expect(still.warnings).toHaveLength(1)
  })
})

const samples = [
  ['gpt-oni.png', 1254, 1254],
  ['gpt-forest.png', 1672, 941],
  ['gemini-mage.png', 2048, 2048],
]
describe('real local samples (skipped when absent)', () => {
  for (const [rel, w, h] of samples) {
    const url = new URL(`../../.local/samples/${rel}`, import.meta.url)
    it.skipIf(!existsSync(url))(`decodes ${rel.split('/').pop()}`, async () => {
      const { img } = await decodeImage(new Uint8Array(readFileSync(url)))
      expect([img.width, img.height, img.data.length]).toEqual([w, h, w * h * 4])
    })
  }
})
