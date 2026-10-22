import type { Image, Options } from './lib/core/types.ts'
type ErrorDetails = { code?: string; message?: string; stack?: string }
// Runs decode + engine off the main thread (single-threaded, deterministic). One job per worker;
// the page cancels a stale conversion by terminating its worker.
// Canvas-fallback decode (WebP etc.) relies on OffscreenCanvas, available in workers.
import { decodeImage, encodePng } from './lib/decode.ts'
import { analyze, canonicalHash, convert, convertCandidates } from './lib/core/pipeline.ts'

// ponytail: outputs are small, so structured-clone copies instead of transfer lists.
const pack = async ({ id, image, report }: { id: string; image: Image; report: ReturnType<typeof convert>["report"] }) => ({
  id, report, width: image.width, height: image.height, rgba: image.data,
  pngBytes: encodePng(image), hash: await canonicalHash(image),
})

self.onmessage = async ({ data: { kind, bytes, mime, opts } }: MessageEvent<{ kind: string; bytes: ArrayBuffer; mime: string; opts: Options }>) => {
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
        analysis: { grid: r.report.grid && grid, generator: r.report.generator, suggestedSize: (grid as NonNullable<ReturnType<typeof convert>["report"]["grid"]>).suggestedSize ?? null },
      })
    }
    const res = convertCandidates(img, o, u8)
    self.postMessage({ ...res, candidates: await Promise.all(res.candidates.map(pack)) })
  } catch (e) {
    self.postMessage({ error: (e as ErrorDetails)?.code ? { code: (e as ErrorDetails).code, message: (e as ErrorDetails).message } : { code: null, message: String((e as ErrorDetails)?.stack || e) } })
  }
}
