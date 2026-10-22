import type { Image } from './types.ts'
// Canonical RGBA contract helpers (docs/research-spikes/algorithms/canonical-rgba-geometry-spike.md):
// typed errors, alpha-0 canonicalization, the `pixilate/canonical-rgba/v1` hash, half-even rounding.

/** Typed engine error; `code` is one of the canonical spike's stable codes. */
export class PixilateError extends Error {
  declare code: string
  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = 'PixilateError'
    this.code = code
  }
}

/** RGB under alpha 0 -> (0,0,0,0). Returns `img` itself when it is already canonical. */
export function canonicalize(img: Image) {
  const d = img.data
  let dirty = false
  for (let p = 3; p < d.length && !dirty; p += 4) dirty = d[p] === 0 && (d[p - 3] | d[p - 2] | d[p - 1]) !== 0
  if (!dirty) return img
  const data = new Uint8ClampedArray(d)
  for (let p = 3; p < data.length; p += 4) if (data[p] === 0) data[p - 3] = data[p - 2] = data[p - 1] = 0
  return { width: img.width, height: img.height, data }
}

const TAG = 'pixilate/canonical-rgba/v1'

/**
 * SHA-256 hex over ASCII(TAG) 0x00 u32le(W) u32le(H) row-major RGBA8, alpha-0 RGB canonicalized
 * (Web Crypto: browsers and Node >= 19).
 */
export async function canonicalHash(img: Image) {
  const { width: W, height: H } = img, head = TAG.length + 9, bytes = new Uint8Array(head + W * H * 4)
  for (let i = 0; i < TAG.length; i++) bytes[i] = TAG.charCodeAt(i)
  const dv = new DataView(bytes.buffer)
  dv.setUint32(TAG.length + 1, W, true)
  dv.setUint32(TAG.length + 5, H, true)
  bytes.set(canonicalize(img).data, head)
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** round(num / den) with ties to even, for nonnegative integers (den > 0). */
export function roundHalfEven(num: number, den: number) {
  const q = Math.floor(num / den), r = num - q * den
  return 2 * r > den || (2 * r === den && q % 2 === 1) ? q + 1 : q
}
