/// Strict decoding: PNG via fast-png and JPEG via jpeg-js (pure JS, identical in every engine),
// then EXIF orientation applied as a pixel transform (FMT-002). Other formats fall back to the
// browser decoder, marked strict: false with a warning (never silent). Ignored colour metadata and
// first-frame-only animation are warnings. No DOM access at import time (Web Worker and Node).
import { decode as pngDecode, encode as pngEncode } from 'fast-png'
import jpeg from 'jpeg-js'
import { walk } from './core/detect.js'
import { PixilateError } from './core/canonical.js'

/** Sniff the container by magic bytes only (FMT-001: never the MIME hint or extension); 'other' when none matches. */
export function sniffFormat(b) {
  const at = (o, s) => b.length >= o + s.length && [...s].every((c, i) => b[o + i] === c.charCodeAt(0))
  if (b[0] === 0x89 && at(1, 'PNG')) return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp'
  if (at(0, 'GIF8')) return 'gif'
  if (at(4, 'ftyp') && (at(8, 'avif') || at(8, 'avis'))) return 'avif'
  if (at(0, 'BM')) return 'bmp'
  return 'other'
}

export const MAX_PIXELS = 4096 * 4096 // ~16.7 MP input/output cap
const tooBig = (what) => new Error(`Image too large: ${what} exceeds 16.7 MP (4096x4096 pixels)`)

/** EXIF orientation (IFD0 tag 0x0112) of a TIFF block, or 0 when absent. */
function exifOrientation(t) {
  if (!t || t.length < 8) return 0
  const le = t[0] === 0x49 && t[1] === 0x49
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return 0
  const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1])
  const ifd = le ? (t[4] | (t[5] << 8) | (t[6] << 16) | (t[7] << 24)) >>> 0 : ((t[4] << 24) | (t[5] << 16) | (t[6] << 8) | t[7]) >>> 0
  if (ifd + 2 > t.length) return 0
  for (let i = 0, n = r16(ifd); i < n && ifd + 14 + i * 12 <= t.length; i++) if (r16(ifd + 2 + i * 12) === 0x0112) return r16(ifd + 10 + i * 12)
  return 0
}

// Orientation -> source of display pixel (x, y): sx = a x + b y + c, sy = d x + e y + f (W x H = stored size).
const ORIENT = {
  2: (W) => [-1, 0, W - 1, 0, 1, 0],
  3: (W, H) => [-1, 0, W - 1, 0, -1, H - 1],
  4: (W, H) => [1, 0, 0, 0, -1, H - 1],
  5: () => [0, 1, 0, 1, 0, 0],
  6: (W, H) => [0, 1, 0, -1, 0, H - 1],
  7: (W, H) => [0, -1, W - 1, -1, 0, H - 1],
  8: (W) => [0, -1, W - 1, 1, 0, 0],
}

/** Apply EXIF orientation 2..8 as an exact pixel permutation (5..8 swap width and height); 1 = unchanged. */
export function orient(img, o) {
  if (!ORIENT[o]) return img
  const { width: W, height: H, data: s } = img, [a, b, c, d, e, f] = ORIENT[o](W, H), w = o >= 5 ? H : W, h = o >= 5 ? W : H
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0, q = 0; y < h; y++) {
    for (let x = 0; x < w; x++, q += 4) {
      const p = ((d * x + e * y + f) * W + a * x + b * y + c) * 4
      out[q] = s[p]; out[q + 1] = s[p + 1]; out[q + 2] = s[p + 2]; out[q + 3] = s[p + 3]
    }
  }
  return { width: w, height: h, data: out }
}

/** Image descriptors in a GIF (block walk; stops at the trailer or on malformed data). */
function gifFrames(b) {
  let p = 13 + (b[10] & 0x80 ? 3 << ((b[10] & 7) + 1) : 0), n = 0
  while (p < b.length && b[p] !== 0x3b) {
    if (b[p] === 0x2c) { n++; const f = b[p + 9]; p += 11 + (f & 0x80 ? 3 << ((f & 7) + 1) : 0) } // descriptor, local table, LZW size
    else if (b[p] === 0x21) p += 2 // extension introducer + label
    else break
    while (p < b.length && b[p]) p += b[p] + 1 // data sub-blocks
    p++
  }
  return n
}

const COLOR_META = ['iCCP', 'gAMA', 'cHRM', 'sRGB', 'cICP', 'ICC', 'ICCP'] // PNG chunks, JPEG APP2 ICC, WebP ICCP

/**
 * @returns {Promise<{img:{width:number,height:number,data:Uint8ClampedArray}, format:string,
 *   decode:'js'|'canvas', strict:boolean, orientation:number, warnings:string[]}>}
 * orientation: the EXIF value applied on the strict path (1 = none; the canvas path lets the browser apply it).
 */
export async function decodeImage(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const format = sniffFormat(b)
  // D56: no known signature is unsupported, whatever the MIME hint claims (a text file named .png is not a PNG)
  if (format === 'other') throw new PixilateError('unsupported-format', 'unsupported or undecodable file: no known image signature')
  const c = walk(b), warnings = []
  const color = COLOR_META.filter((t) => c.types.includes(t))
  if (color.length) warnings.push(`colour metadata ignored, pixels assumed sRGB: ${color.join(', ')}`)
  if (c.types.includes('acTL')) warnings.push('animated PNG: only the default image is decoded')
  if ((format === 'gif' && gifFrames(b) > 1) || (format === 'webp' && c.types.includes('ANIM'))) warnings.push(`animated ${format}: first frame only`)
  let img = null
  if (format === 'png') {
    const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
    if (b.length >= 24 && u32(16) * u32(20) > MAX_PIXELS) throw tooBig(`${u32(16)}x${u32(20)}`) // IHDR, before inflating
    img = pngToRgba(pngDecode(b), b[25] === 3) // IHDR colour type 3 = indexed
  } else if (format === 'jpeg') {
    // 4096x4096 RGBA plus decoder buffers needs ~200 MB. jpeg-js checks the resolution at SOF, before decoding.
    let j
    try {
      j = jpeg.decode(b, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048, maxResolutionInMP: MAX_PIXELS / 1e6 })
    } catch (e) {
      throw /maxResolutionInMP/.test(e.message) ? tooBig('JPEG') : e
    }
    img = { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data.buffer, j.data.byteOffset, j.data.length) }
  }
  if (img) {
    let orientation = exifOrientation(c.segs.find((s) => s.kind === 'exif')?.data) || 1
    if (orientation > 8) { warnings.push(`EXIF orientation ${orientation} is invalid; ignored`); orientation = 1 }
    return { img: orient(img, orientation), format, decode: 'js', strict: true, orientation, warnings }
  }
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    throw new Error(`Cannot decode ${format}: only PNG and JPEG decode without a browser (createImageBitmap/OffscreenCanvas unavailable)`)
  }
  const type = `image/${format}`
  const bmp = await createImageBitmap(new Blob([b], { type }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'from-image' })
  if (bmp.width * bmp.height > MAX_PIXELS) { bmp.close?.(); throw tooBig(`${bmp.width}x${bmp.height}`) }
  const cv = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
  warnings.unshift(`non-strict browser decode (canvas) for ${format}: pixels may differ between browsers`)
  return { img: { width: cv.width, height: cv.height, data }, format, decode: 'canvas', strict: false, orientation: 1, warnings }
}

/** Normalize any fast-png result (1/2/4/8/16-bit, gray/GA/RGB/RGBA/palette, tRNS) to RGBA8. */
function pngToRgba(p, indexed) {
  const { width: w, height: h, depth, channels: ch, data, palette, transparency: trns } = p
  if (depth === 8 && ch === 4) return { width: w, height: h, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }
  const n = w * h
  const out = new Uint8ClampedArray(n * 4)
  const max = (1 << depth) - 1
  const rowBytes = Math.ceil((depth * ch * w) / 8) // packed rows for depth < 8
  // Raw sample value of pixel i, channel c, at the file's bit depth.
  const sample = depth >= 8
    ? (i, c) => data[i * ch + c]
    : (i, c) => {
        const x = i % w, bit = (x * ch + c) * depth
        const byte = data[((i - x) / w) * rowBytes + (bit >> 3)]
        return (byte >> (8 - depth - (bit & 7))) & max
      }
  const to8 = depth === 8 ? (v) => v : depth === 16 ? (v) => ((v * 255 + 32767) / 65535) | 0 : (v) => (v * 255) / max
  const pal = indexed ? palette : null // RGB(A) files may carry a suggested PLTE; only indexed images use it
  const key = trns && trns.length && !pal ? trns : null // gray (1 value) or RGB (3 values) color key
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    if (pal) {
      const e = pal[sample(i, 0)] || [0, 0, 0]
      out[o] = e[0]; out[o + 1] = e[1]; out[o + 2] = e[2]; out[o + 3] = e.length > 3 ? e[3] : 255
      continue
    }
    if (ch <= 2) {
      const g = sample(i, 0)
      out[o] = out[o + 1] = out[o + 2] = to8(g)
      out[o + 3] = ch === 2 ? to8(sample(i, 1)) : key && g === key[0] ? 0 : 255
    } else {
      const r = sample(i, 0), g = sample(i, 1), b = sample(i, 2)
      out[o] = to8(r); out[o + 1] = to8(g); out[o + 2] = to8(b)
      out[o + 3] = ch === 4 ? to8(sample(i, 3)) : key && r === key[0] && g === key[1] && b === key[2] ? 0 : 255
    }
  }
  return { width: w, height: h, data: out }
}

/** RGBA8 image -> PNG bytes. */
export function encodePng(img) {
  return pngEncode({ width: img.width, height: img.height, data: img.data, channels: 4, depth: 8 })
}
