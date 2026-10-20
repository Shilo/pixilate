// Runs decode + engine off the main thread (single-threaded, deterministic). One job per worker;
// the page cancels a stale conversion by terminating its worker.
// Canvas-fallback decode (WebP etc.) relies on OffscreenCanvas, available in workers.
import { decodeImage, encodePng } from './lib/decode.js'
import { analyze, canonicalHash, convert, convertCandidates } from './lib/core/pipeline.js'

// ponytail: outputs are small, so structured-clone copies instead of transfer lists.
const pack = async ({ id, image, report }) => ({
  id, report, width: image.width, height: image.height, rgba: image.data,
  pngBytes: encodePng(image), hash: await canonicalHash(image),
})

self.onmessage = async ({ data: { kind, bytes, mime, opts } }) => {
  try {
    const u8 = new Uint8Array(bytes)
    const { img, format, decode, strict, orientation, warnings } = await decodeImage(u8, mime)
    if (kind === 'analyze') return self.postMessage({ width: img.width, height: img.height, format, decode, ...analyze(img, {}, u8) })
    const o = { ...opts, format, decode, strict, orientation, warnings }
    if (kind === 'convert') { // explicit route/cleanup from Custom: one result instead of candidates
      const r = convert(img, o, u8)
      const { cuts, ...grid } = r.report.grid ?? {}
      return self.postMessage({
        candidates: [await pack({ id: 'custom', ...r })], recommended: 'custom', failed: [],
        analysis: { grid: r.report.grid && grid, generator: r.report.generator, suggestedSize: grid.suggestedSize ?? null },
      })
    }
    const res = convertCandidates(img, o, u8)
    self.postMessage({ ...res, candidates: await Promise.all(res.candidates.map(pack)) })
  } catch (e) {
    self.postMessage({ error: e?.code ? { code: e.code, message: e.message } : { code: null, message: String(e?.stack || e) } })
  }
}
