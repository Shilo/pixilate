// Worker job handler (spec §9), pure enough to run in Node tests: decode once, cache, analyse, convert,
// export. The engine is imported in place from the prototype ($engine); nothing here changes pixels.
import { decodeImage, encodePng, sniffFormat } from '$engine/decode.js'
import { analyze, canonicalHash, convertCandidates } from '$engine/core/pipeline.js'
import { upscale } from './geometry.js'

function decodeCode(e, u8) {
  if (/Image too large/.test(e?.message)) return 'decode-too-large'
  const f = sniffFormat(u8) // magic bytes only: a renamed text file is 'other', not the MIME hint
  return f === 'png' || f === 'jpeg' ? 'decode-damaged' : 'decode-unsupported'
}

/** One handler per worker; it keeps the decoded image between messages. post(msg, transfer?) replies. */
export function createJobs() {
  let ready = null // Promise<{ u8, img, meta }>

  return async function handle(msg, post) {
    const { type, jobId } = msg
    try {
      if (type === 'open') {
        const u8 = new Uint8Array(msg.bytes)
        ready = decodeImage(u8, msg.mime).then(
          ({ img, format, decode, strict, orientation, warnings }) => ({ u8, img, meta: { format, decode, strict, orientation, warnings } }),
          (e) => { throw Object.assign(new Error(e?.message ?? String(e)), { code: decodeCode(e, u8) }) })
        ready.catch(() => {}) // a convert awaiting it reports the error
        if (!msg.analyze) return
        const { img, meta } = await ready
        const d = img.data
        let hasAlpha = false
        for (let p = 3; p < d.length && !hasAlpha; p += 4) hasAlpha = d[p] < 255
        const a = analyze(img, {}, u8)
        return post({ type: 'analysis', jobId, width: img.width, height: img.height, format: meta.format, decode: meta.decode, warnings: meta.warnings, hasAlpha, ...a })
      }
      if (type === 'convert') {
        if (!ready) throw Object.assign(new Error('no image open'), { code: 'invalid-input' })
        const { u8, img, meta } = await ready
        const res = convertCandidates(img, { ...msg.opts, ...meta }, u8)
        const candidates = [], transfer = []
        for (const { id, image, report } of res.candidates) {
          const png = encodePng(image).slice() // own buffer, exact length
          // the hash needs crypto.subtle, which plain-HTTP pages (a phone on the LAN) lack: then null, shown as unavailable
          const hash = globalThis.crypto?.subtle ? await canonicalHash(image) : null
          candidates.push({ id, width: image.width, height: image.height, rgba: image.data, png, hash, report })
          transfer.push(image.data.buffer, png.buffer)
        }
        return post({ type: 'result', jobId, candidates, recommended: res.recommended, recommendation: res.recommendation, alias: res.alias, analysis: res.analysis, failed: res.failed }, transfer)
      }
      if (type === 'export') {
        const png = encodePng({ width: msg.width * msg.scale, height: msg.height * msg.scale, data: upscale(msg.rgba, msg.width, msg.height, msg.scale) }).slice()
        return post({ type: 'png', jobId, png }, [png.buffer])
      }
      throw new Error(`unknown message ${type}`)
    } catch (e) {
      post({ type: 'error', jobId, code: e?.code ?? null, message: e?.message ?? String(e) })
    }
  }
}
