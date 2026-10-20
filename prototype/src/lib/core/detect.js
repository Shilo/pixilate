// Report-only input provenance signals (docs/research-spikes/algorithms/input-provenance-signals.md).
// Pure function of the file bytes and decoded pixels; never throws, never required.
// Signatures are NOT checked: every metadata match is a declaration ("declared (unvalidated)"),
// trivially spoofable, never provenance. Privacy: evidence never carries prompt text, usernames,
// job IDs or timestamps from metadata; prompt-bearing keys are reported by key name only.
// Watermarks: masking only (a region excluded from analysis); the mark is never altered.

const latin1 = new TextDecoder('latin1') // 1 char per byte: offsets in strings == byte offsets
const utf8 = new TextDecoder()
const u16 = (b, o) => (b[o] << 8) | b[o + 1]
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const str = (b) => latin1.decode(b)

// ---------------------------------------------------------------- container walk

/**
 * Collect metadata segments without touching image data. seg = {kind:'c2pa'|'xmp'|'exif'|'text', key?, data?, s}.
 * types: every PNG chunk type / WebP chunk FourCC, plus 'ICC' for a JPEG APP2 ICC profile (decode.js warnings).
 */
export function walk(b) {
  const segs = [], types = []
  const add = (kind, data, key) => segs.push({ kind, key, data, s: data ? str(data) : null })
  if (b[0] === 0x89 && str(b.subarray(1, 4)) === 'PNG') {
    for (let p = 8; p + 12 <= b.length;) {
      const len = u32(b, p), type = str(b.subarray(p + 4, p + 8)), d = b.subarray(p + 8, p + 8 + len)
      if (type === 'IEND') break
      types.push(type)
      if (type === 'caBX') add('c2pa', d)
      else if (type === 'eXIf') add('exif', d)
      else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
        const k = d.indexOf(0), key = str(d.subarray(0, k < 0 ? d.length : k))
        let text = null // null = compressed: zTXt/compressed iTXt skipped (synchronous sniffer per contract); keys still identify tools
        if (type === 'tEXt') text = str(d.subarray(k + 1))
        else if (type === 'iTXt' && d[k + 1] === 0) {
          const lang = d.indexOf(0, k + 3), tr = d.indexOf(0, lang + 1)
          if (lang > 0 && tr > 0) text = utf8.decode(d.subarray(tr + 1))
        }
        segs.push({ kind: key === 'XML:com.adobe.xmp' ? 'xmp' : 'text', key, s: text })
      }
      p += 12 + len
    }
    return { format: 'png', lossy: false, segs, types }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    const jumbf = new Map() // En -> box byte chunks (APP11, JPEG XT), concatenated once
    for (let p = 2; p + 4 <= b.length;) {
      if (b[p] !== 0xff) break
      const m = b[p + 1]
      if (m === 0xff) { p++; continue }
      if (m === 0xd9 || m === 0xda) break // EOI / SOS: metadata is over
      if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { p += 2; continue }
      const len = u16(b, p + 2), d = b.subarray(p + 4, p + 2 + len)
      if (m === 0xe1) {
        const head = str(d.subarray(0, 40))
        if (head.startsWith('Exif\0')) add('exif', d.subarray(6))
        else if (head.startsWith('http://ns.adobe.com/')) add('xmp', d)
      } else if (m === 0xe2 && str(d.subarray(0, 12)) === 'ICC_PROFILE\0') {
        if (!types.includes('ICC')) types.push('ICC')
      } else if (m === 0xeb && d[0] === 0x4a && d[1] === 0x50) {
        const en = u16(d, 2), parts = jumbf.get(en)
        // Continuation segments repeat the 8-byte LBox/TBox header; drop it when reassembling.
        if (parts) parts.push(d.subarray(16))
        else jumbf.set(en, [d.subarray(8)])
      }
      p += 2 + len
    }
    for (const parts of jumbf.values()) add('c2pa', concat(parts))
    return { format: 'jpeg', lossy: true, segs, types }
  }
  if (str(b.subarray(0, 4)) === 'RIFF' && str(b.subarray(8, 12)) === 'WEBP') {
    let lossy = false
    for (let p = 12; p + 8 <= b.length;) {
      const cc = str(b.subarray(p, p + 4)), len = u32le(b, p + 4), d = b.subarray(p + 8, p + 8 + len)
      types.push(cc)
      if (cc === 'VP8 ') lossy = true
      else if (cc === 'C2PA') add('c2pa', d)
      else if (cc === 'XMP ') add('xmp', d)
      else if (cc === 'EXIF') add('exif', d)
      p += 8 + len + (len & 1)
    }
    return { format: 'webp', lossy, segs, types }
  }
  return { format: 'other', lossy: false, segs, types }
}

function concat(parts) {
  if (parts.length === 1) return parts[0]
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { o.set(p, at); at += p.length }
  return o
}

// ---------------------------------------------------------------- minimal CBOR (C2PA assertions)

/** Decode one CBOR item at p. Returns [value, end]. Throws on malformed input. */
function cbor(b, p, depth = 0) {
  if (depth > 32 || p >= b.length) throw new RangeError('CBOR overrun')
  const ib = b[p], mt = ib >> 5, ai = ib & 31
  let q = p + 1, n
  if (ai < 24) n = ai
  else if (ai === 24) n = b[q++]
  else if (ai === 25) { n = u16(b, q); q += 2 }
  else if (ai === 26) { n = u32(b, q); q += 4 }
  else if (ai === 27) { n = u32(b, q) * 4294967296 + u32(b, q + 4); q += 8 }
  else if (ai === 31) n = -1
  else throw new RangeError('CBOR bad length')
  if (mt === 0) return [n, q]
  if (mt === 1) return [-1 - n, q]
  if (mt === 6) return cbor(b, q, depth + 1) // tag: return the tagged item
  if (mt === 7) return [ai === 20 ? false : ai === 21 ? true : null, q] // floats are irrelevant here
  if (mt === 2 || mt === 3) {
    if (n < 0) { // indefinite string: definite chunks until break
      let s = ''
      while (b[q] !== 0xff) { const [c, e] = cbor(b, q, depth + 1); s += typeof c === 'string' ? c : ''; q = e }
      return [mt === 3 ? s : null, q + 1]
    }
    if (q + n > b.length) throw new RangeError('CBOR overrun')
    return [mt === 3 ? utf8.decode(b.subarray(q, q + n)) : null, q + n]
  }
  const map = mt === 5, out = map ? {} : []
  for (let i = 0; n < 0 ? b[q] !== 0xff : i < n; i++) {
    if (q >= b.length) throw new RangeError('CBOR overrun')
    const [k, e1] = cbor(b, q, depth + 1)
    if (!map) { out.push(k); q = e1; continue }
    const [v, e2] = cbor(b, e1, depth + 1)
    out[String(k)] = v; q = e2
  }
  return [out, n < 0 ? q + 1 : q]
}

/** Decode the value after every CBOR text key `key` found in the latin1 string s of bytes b. */
function valuesOf(b, s, key) {
  const needle = String.fromCharCode(0x60 + key.length) + key // keys here are < 24 chars
  const vals = []
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + 1)) {
    try { vals.push(cbor(b, i + needle.length)[0]) } catch { /* not a real key; skip */ }
  }
  return vals
}

const nameVer = (x) => typeof x === 'string' ? x : x && typeof x === 'object' ? [x.name, x.version].filter((v) => typeof v === 'string').join(' ') : ''

// ---------------------------------------------------------------- vendor markers

// Order = priority when several match (e.g. a Microsoft surface serving an OpenAI model).
const VENDORS = [
  ['openai', /OpenAI|ChatGPT|DALL[-·]E|gpt-image/],
  ['google', /Google (?:C2PA Core Generator Library|Media Processing Services|LLC|Generative AI)|Gemini/],
  ['adobe', /Firefly/],
  ['bfl', /Black Forest Labs|AI generated;(?:txt|img)2img;flux/],
  ['microsoft', /Microsoft|Bing Image Creator/, 'c2pa'], // "Microsoft" appears in ordinary XMP namespaces
  ['meta', /Meta AI|Meta Platforms|Imagined with AI/],
  ['midjourney', /midjourney/i],
  ['xai', /\bGrok\b|\bxAI\b/],
  ['bytedance', /Seedream|ByteDance|Doubao/],
  ['alibaba', /Qwen|Tongyi|Alibaba/],
  ['stable-diffusion', /Stability AI|Stable Diffusion/],
]

function vendorOf(s, where) {
  for (const [family, re, only] of VENDORS) {
    if (only && only !== where) continue
    const m = re.exec(s)
    if (m) return { family, hit: m[0] }
  }
  return null
}

const AI_SOURCE = /digitalsourcetype\/(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|compositeSynthetic)/i

// ---------------------------------------------------------------- dimension table

// [family, sizes, format?]; every size also matches transposed. Published output sizes as collected from vendor docs and
// community sources (UNKNOWN freshness). Weak, advisory evidence only (FR-023; input-provenance-signals.md §3).
const gem3 = [[1024, 1024], [848, 1264], [896, 1200], [928, 1152], [768, 1376], [1584, 672]]
const DIMS = [
  ['openai', [[1792, 1024], [1536, 1024], [1024, 1024]]],
  ['google', [...gem3, ...gem3.map(([w, h]) => [w * 2, h * 2]), ...gem3.map(([w, h]) => [w * 4, h * 4]),
    [832, 1248], [864, 1184], [896, 1152], [768, 1344], [1536, 672], // Gemini 2.5 Flash
    [1408, 768], [1280, 896], [2816, 1536], [2560, 1792]]], // Imagen 3/4
  ['midjourney', [[1024, 1024], [1232, 928], [1456, 816], [896, 1344], [2048, 2048], [2464, 1856], [2912, 1632], [1792, 2688]]],
  ['stable-diffusion', [[1024, 1024], [1152, 896], [1216, 832], [1344, 768], [1536, 640]]], // SDXL buckets
  ['bfl', [[1024, 1024], [1536, 1024], [2048, 2048]]],
  ['recraft', [[1536, 1024], [1365, 1024], [1820, 1024], [1434, 1024], [1707, 1024], [2048, 1024]]],
  ['adobe', [[1344, 768], [2688, 1536]]],
  ['alibaba', [[1328, 1328], [1664, 928], [1472, 1140], [1584, 1056]]],
  ['xai', [[1024, 768]], 'jpeg'],
  ['meta', [[1280, 1280]], 'jpeg'],
]

function dimCandidates(w, h, format) {
  const out = []
  for (const [family, sizes, fmt] of DIMS) {
    if (fmt && fmt !== format) continue
    if (sizes.some(([a, b]) => (a === w && b === h) || (a === h && b === w))) out.push(family)
  }
  return out
}

// ---------------------------------------------------------------- declared visible watermark

// ponytail: generic conservative corner (bottom-right 8% x 8%, INFERRED), no vendor geometry
// (input-provenance-signals.md §4 rule 3). Used only when the container declares a visible mark.
function cornerMask(w, h, f = 0.08) {
  const m = new Uint8Array(w * h), x0 = Math.floor(w * (1 - f)), y0 = Math.floor(h * (1 - f))
  for (let y = y0; y < h; y++) m.fill(1, y * w + x0, (y + 1) * w)
  return m
}

// ---------------------------------------------------------------- main

/**
 * @param {Uint8Array|ArrayBuffer|null} bytes original file bytes (null when pasted / unknown)
 * @param {{width:number,height:number,data:Uint8ClampedArray}|null} img decoded RGBA
 * @returns {{family:string, model:string|null, confidence:'declared (unvalidated)'|'possible'|'unknown',
 *   candidates:string[], evidence:string[], preset:{jpegStrict:boolean},
 *   watermarkMask:Uint8Array|null}}
 */
export function detectGenerator(bytes, img) {
  const r = { family: 'unknown', model: null, confidence: 'unknown', candidates: [], evidence: [], watermarkMask: null }
  let format = 'other', lossy = false, visibleDeclared = false
  const DECLARED = 'declared (unvalidated)' // metadata substring/key match, signature not checked
  const claim = (family, confidence, line) => {
    r.evidence.push(line)
    if (r.family === 'unknown') { r.family = family; r.confidence = confidence }
  }
  try {
    if (bytes) {
      const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      const c = walk(b)
      format = c.format; lossy = c.lossy
      r.evidence.push(`container: ${format}${lossy ? ' (lossy)' : ''}; metadata segments: ${c.segs.map((s) => s.key || s.kind).join(', ') || 'none'}`)

      // Stage 1: C2PA manifests.
      for (const seg of c.segs.filter((s) => s.kind === 'c2pa')) {
        const s = seg.s
        try {
          const gens = [...valuesOf(seg.data, s, 'claim_generator_info').flatMap((v) => (Array.isArray(v) ? v : [v]).map(nameVer)),
            ...valuesOf(seg.data, s, 'claim_generator').filter((v) => typeof v === 'string')].filter(Boolean)
          for (const g of new Set(gens)) r.evidence.push(`file metadata claims C2PA generator "${g}" (signature not checked)`)
          const actions = valuesOf(seg.data, s, 'actions').flatMap((v) => (Array.isArray(v) ? v : []))
          const created = actions.find((a) => a && a.action === 'c2pa.created' && a.softwareAgent)
          if (created && !r.model) {
            r.model = nameVer(created.softwareAgent) || null
            if (r.model) r.evidence.push(`file metadata claims model "${r.model}" (C2PA c2pa.created softwareAgent)`)
          }
        } catch (e) {
          r.evidence.push(`C2PA structure not decoded (${e.message}); using string markers only`)
        }
        const v = vendorOf(s, 'c2pa')
        if (v) claim(v.family, DECLARED, `file metadata claims ${v.family} ("${v.hit}" in C2PA manifest)`)
        if (AI_SOURCE.test(s)) r.evidence.push('file metadata claims AI generation (C2PA digitalSourceType trainedAlgorithmicMedia-type)')
        if (s.includes('c2pa.watermarked.unbound')) r.evidence.push('file metadata declares an invisible watermark (c2pa.watermarked.unbound; not readable client-side)')
        if (s.includes('Added visible watermark')) { visibleDeclared = true; r.evidence.push('file metadata declares a visible watermark ("Added visible watermark")') }
      }

      // Stage 2: local tool text keys (PNG text chunks; EXIF strings for JPEG/WebP).
      for (const { kind, key, s } of c.segs) {
        if (kind !== 'text') continue
        const v = s || ''
        // Prompt-bearing keys: report that the key exists; never parse or echo their content.
        if (key === 'parameters') {
          claim('stable-diffusion', DECLARED, 'file metadata claims AUTOMATIC1111/Forge/Fooocus (PNG text key "parameters"; content not read)')
        } else if (key === 'prompt' || key === 'workflow') {
          claim('stable-diffusion', DECLARED, `file metadata claims ComfyUI (PNG text key "${key}"; content not read)`)
        } else if (/^(invokeai_|sd-metadata$|Dream$)/.test(key)) {
          claim('stable-diffusion', DECLARED, `file metadata claims InvokeAI (PNG text key "${key}")`)
        } else if (/^(Software|Source|Title|Comment)$/.test(key) && v.includes('NovelAI')) {
          claim('novelai', DECLARED, `file metadata claims NovelAI (PNG text key "${key}")`)
        } else if (s && key !== 'Comment') {
          const vv = vendorOf(s, 'text')
          if (vv) claim(vv.family, DECLARED, `file metadata claims ${vv.family} ("${vv.hit}" in PNG text "${key}")`)
        }
      }
      for (const seg of c.segs.filter((s) => s.kind === 'exif')) {
        const s = seg.s.replace(/\0/g, '') // also matches UTF-16 UserComment ("UNICODE\0" prefix)
        if (/Steps: \d+, Sampler: /.test(s)) claim('stable-diffusion', DECLARED, 'file metadata claims AUTOMATIC1111/Forge (EXIF UserComment parameters)')
        if (/(?:prompt|workflow):\{/.test(s)) claim('stable-diffusion', DECLARED, 'file metadata claims ComfyUI (EXIF prompt/workflow)')
        const v = vendorOf(s, 'exif')
        if (v) claim(v.family, DECLARED, `file metadata claims ${v.family} ("${v.hit}" in EXIF)`)
      }

      // Stage 3: XMP / IPTC.
      for (const seg of c.segs.filter((s) => s.kind === 'xmp' && s.s)) {
        const v = vendorOf(seg.s, 'xmp')
        if (v) claim(v.family, DECLARED, `file metadata claims ${v.family} ("${v.hit}" in XMP)`)
        const ai = AI_SOURCE.exec(seg.s)
        if (ai) r.evidence.push(`file metadata claims AI generation (XMP DigitalSourceType ${ai[1]})`)
        if (seg.s.includes('tc260.org.cn/ns/AIGC')) r.evidence.push('file metadata carries a China AIGC implicit label (TC260 XMP)')
      }
    }

    const w = img?.width ?? 0, h = img?.height ?? 0

    // Stage 4: published output dimensions (weak, advisory: shared sizes, crops, resizes).
    if (img && r.family === 'unknown') {
      r.candidates = dimCandidates(w, h, format)
      if (r.candidates.length) {
        r.confidence = 'possible'
        if (r.candidates.length === 1) r.family = r.candidates[0]
        r.evidence.push(`dimensions ${w}x${h} match published sizes for: ${r.candidates.join(', ')} (weak signal)`)
      }
    }

    // Stage 5: declared visible watermark -> analysis mask only (no pixel test).
    if (img && visibleDeclared && w > 0 && h > 0) {
      r.watermarkMask = cornerMask(w, h)
      r.evidence.push('masking bottom-right 8% x 8% corner (visible watermark declared in metadata; generic region, analysis mask only, pixels unchanged)')
    }
  } catch (e) {
    r.evidence.push(`metadata parse failed: ${e.message}`)
  }

  // Advisory preset: priors only, never overrides measured grid evidence.
  return { ...r, preset: { jpegStrict: lossy } }
}
