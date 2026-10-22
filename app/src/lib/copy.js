// Every user-facing string (spec §7). UI text never uses the engine's jargon (see BANNED); raw engine
// strings appear only under Details › Technical. British spelling; dimensions with a thin-spaced ×.

export const BANNED = ['route', 'raster', 'quantize', 'lattice', 'period', 'factorization', 'alpha', 'profile', 'candidate']

export const MAX = 1024
export const dims = (w, h) => `${w} × ${h}`
export const srDims = (w, h) => `${w} by ${h}`

export const T = {
  app: 'Pixilate',
  skip: 'Skip to Save',
  openImage: 'Open image',
  details: 'Details',
  close: 'Close',
  done: 'Done',
  // The public description (README, GitHub, index.html meta), split into title and lead.
  emptyTitle: 'Every pixel is a true pixel',
  emptyLead: 'Turn AI-generated or handmade images into real pixel art at the exact size you choose, with a clean palette and no generative AI needed.',
  emptyFine: 'Drop an image here, paste it, or choose a file.',
  emptyCoarse: 'Choose a photo or an image file.',
  choose: 'Choose image',
  chooseAnother: 'Choose another',
  dismiss: 'Dismiss',
  example: 'Try an example',
  private: 'Works on your device. Your image is never uploaded.',
  formats: 'PNG, JPEG, WebP or GIF, up to 4096 × 4096.',
  dropHere: 'Drop to make pixel art',
  looking: 'Looking for the pixel grid…',
  analysing: 'Analysing image',
  making: 'Making pixel art…',
  working: 'Working…',
  stop: 'Stop',
  slow: 'Large images take a few seconds on phones.',
  stopped: 'Stopped',
  wait: 'Wait for the new result',
  failedSave: 'Fix the problem above to save.',
  saveFailed: "Couldn't make the PNG. Try a smaller enlargement.",
  shareAgain: 'Ready to share. Tap Share again.',
  enlarge: 'Enlarge',
  square: 'Square',
  bgKept: "This background isn't one plain colour, so it was kept.",
  unavailable: 'unavailable (needs a secure page: HTTPS or localhost)',
  copyNote: 'Copy goes through the system clipboard, which can re-encode the image; Save and Share give the exact file.',
  chooseFirst: 'Choose a size first',
  previous: 'Previous result',
  preview: 'Preview',
  before: 'Before',
  after: 'After',
  view: 'View',
  grid: 'Pixel grid',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomLevel: 'Zoom level: switch between Fit and twice Fit',
  fitShrunk: 'Fit (shrunk)',
  gridZoom: 'Zoom in to see the grid',
  noGrid: 'No pixel grid to show.',
  style: 'Style',
  best: 'Best',
  useBest: 'Use Best',
  size: 'Size',
  width: 'Width',
  height: 'Height',
  keepShape: 'Keep shape',
  detected: 'Detected',
  yourSize: 'Your size',
  chooseSize: 'Choose a size',
  maybe: 'Maybe',
  alsoFits: 'Also fits',
  gridLink: 'Grid looks wrong? Set the pixel grid',
  gridLabel: 'Pixel grid',
  gridHelp: 'How many pixel blocks the original image has across and down.',
  gridAcross: 'Across',
  gridDown: 'Down',
  gridReset: 'Reset to detected',
  matchSprite: 'Match subject',
  subject: 'Subject',
  presets: 'Common sizes (long side)',
  fitMode: 'Fill the size',
  fit: { contain: 'Fit', cover: 'Fill', stretch: 'Stretch' },
  fitHelp: {
    contain: 'Shows the whole picture and adds see-through edges.',
    cover: 'Fills the size and crops the edges.',
    stretch: 'Fills the size and distorts the shape.',
  },
  errWhole: 'Use a whole number from 1 to 1024.',
  errOver: '1024 is the largest size. Use Save at 2× or more for a bigger file.',
  tools: 'Tools',
  bgLabel: 'Remove background',
  bgHelp: 'Makes a plain background around the art see-through.',
  trimLabel: 'Crop to subject',
  trimHelp: 'Sizes the subject itself, not the empty space around it.',
  trimNeeds: 'Needs a see-through background. Turn on Remove background first.',
  colours: 'Colours',
  coloursHelp: 'Auto keeps the colours the art needs.',
  auto: 'Auto',
  allOff: 'Turn all off',
  save: 'Save',
  saveOptions: 'Save options',
  savePng: 'Save PNG',
  scale: 'Scale',
  copy: 'Copy',
  share: 'Share…',
  copyFailed: "Couldn't copy. Use Save instead.",
  saveRecipe: 'Save recipe (.json)',
  copyHash: 'Copy',
  copyDetails: 'Copy error details',
  keys: 'Keyboard shortcuts',
  settings: 'Settings',
  // Details
  dResult: 'Result', dWhy: 'Why this style?', dGrid: 'Pixel grid', dNotes: 'Notes', dTools: 'Tools', dImage: 'Image',
  dOther: 'Other styles', dRepro: 'For reproducibility', technical: 'Technical details',
  yes: 'yes', no: 'no',
  seeThrough: 'See-through', coloursUsed: 'Colours used', coloursAllowed: 'allowed',
  format: 'Format', decodeMode: 'Opened in', exactMode: 'exact mode', compatMode: 'compatibility mode',
  confidence: 'Confidence', blockSize: 'Block size', nativeSize: 'Art size', alternatives: 'Other fits',
  usedGrid: 'Used for this result', engine: 'Engine', hash: 'Image fingerprint (SHA-256)', recipe: 'Settings',
  cleanNone: 'Clean made no changes.', noNotes: 'No notes.', none: 'none',
  gridClass: { exact: 'Exact grid', grid: 'Grid found', weak: 'Faint grid', none: 'No grid' },
  keyRows: [
    ['Ctrl/⌘ + O', 'Open'], ['Ctrl/⌘ + V', 'Paste an image'], ['Ctrl/⌘ + S', 'Save PNG'], ['Ctrl/⌘ + Shift + C', 'Copy PNG'],
    ['Esc', 'Close the dialog or section'], ['1–4', 'Pick a style (preview focused)'], ['Space (hold)', 'Peek at Before (preview focused)'],
    ['B', 'Before / After (preview focused)'], ['G', 'Pixel grid (preview focused)'], ['+ / − / 0', 'Zoom in / out / Fit (preview focused)'],
    ['Arrows (Shift = ×10)', 'Move around (preview focused)'],
  ],
}

// ---- Styles (§7.1) ----
export const STYLE_ORDER = ['original', 'grid', 'clean', 'smooth']
const LABEL = { original: 'Original', grid: 'Faithful', clean: 'Clean', smooth: 'Smooth' }
export const styleLabel = (id) => LABEL[id] ?? id
export function styleDesc(id, route) {
  if (id === 'original') return 'Already pixel art at this size. Nothing changed.'
  if (id === 'grid') return "Keeps the picture's own pixels, as drawn."
  if (id === 'clean') return 'Removes stray pixels.'
  if (id === 'smooth') return 'Redraws the whole picture at your size.'
  return ''
}

// ---- Reason line (§7.2) ----
export const UNKNOWN_REASON = "Pixilate's best match for this image."
export function reason(rec, gridClass) {
  const ev = rec?.evidence ?? ''
  switch (rec?.rule) {
    case 'identity': return "It's already pixel art at this size, so nothing needs changing."
    case 'exact': return 'Found the exact pixel grid, so every pixel is kept as drawn.'
    case 'no-grid': return gridClass === 'weak'
      ? 'The pixel grid is faint, so Smooth redraws the picture at your size.'
      : 'No pixel grid found, so Smooth redraws the picture at your size.'
    case 'manual-grid': return 'Uses the pixel grid you set.'
    case 'grid-failed': return "Faithful couldn't be made at this size, so this is the next best."
    case 'smooth-upscale-off-target': return 'This image was smoothly enlarged, and your size is far from its grid, so Smooth fits better.'
    case 'light-touch-clean': return 'Clean only tidies a few stray pixels and keeps the outlines.'
    case 'noisy-grid-clean': return 'This image has lots of stray-pixel noise, and Clean removes it.'
    case 'grid':
      if (ev.includes('reduction')) return "You're making it smaller, so Faithful keeps the pixels as found."
      if (ev.includes('Clean identical')) return 'Clean made no changes, so Faithful is the same picture.'
      if (ev.includes('d2')) return 'This image was smoothly enlarged; Faithful rebuilds its original pixels.'
      return "Faithful keeps the picture's own pixels; cleaning would change too much."
    default: return UNKNOWN_REASON
  }
}

export function cleanLine(report) {
  const n = Object.values(report?.cleanup?.changed ?? {}).reduce((a, b) => a + b, 0)
  return n ? `Clean tidied ${n} ${n === 1 ? 'pixel' : 'pixels'}.` : T.cleanNone
}

// ---- Warnings (§7.3): first match in this order; HIDDEN ones are never shown as sentences ----
const WARN = [
  ['aspect distortion', 'Stretched to fit, so shapes are distorted.'],
  ['cover crop: kept', 'Filled the size by cropping the edges.'],
  ['target exceeds native resolution', "Your size is bigger than the art's own pixels, so pixels are repeated."],
  ['detail reduced', "Smaller than the art's own pixels, so some detail is merged."],
  ['non-integer ratio', "Your size doesn't divide the art's pixels evenly, so a few pixels are approximate."],
  ['ambiguous exact grid', 'Several grid sizes fit this image. Try the "Also fits" sizes.'],
  ["trim basis 'cells' found no", 'The subject is very faint, so all its visible pixels were kept.'],
  ['palette capped at', 'Up to 64 colours are supported.'],
  ['exact art quantized', 'This art has more than 256 colours, so some were merged.'],
  ['animated', 'Only the first frame is used.'],
  ['colour metadata ignored', 'The embedded colour settings were ignored; colours are treated as standard sRGB.'],
  ['EXIF orientation', "The photo's rotation tag was invalid and was ignored."],
  // beyond the spec table: the canvas decode warning, so no engine warning reaches the UI verbatim
  ['non-strict browser decode', 'This file type was opened in compatibility mode, so colours can differ slightly between browsers.'],
]
const HIDDEN = ['no reliable source grid', 'grid route refused', 'weak grid evidence']
const hidden = (w) => w === 'approximate' || HIDDEN.some((p) => w.startsWith(p))

/** Sentence for one engine warning: mapped, null when hidden, or the raw text when unmapped. */
export function warningSentence(w) {
  if (hidden(w)) return null
  return WARN.find(([p]) => w.startsWith(p))?.[1] ?? w
}
/** The one warning line under the reason (mapped warnings only, first in table order). */
export function warningLine(warnings = []) {
  for (const [p, s] of WARN) if (warnings.some((w) => !hidden(w) && w.startsWith(p))) return s
  return null
}
/** Every warning for Details › Notes, deduplicated. */
export const warningSentences = (warnings = []) => [...new Set(warnings.map(warningSentence).filter(Boolean))]

// ---- Background (§7.4) ----
const BG = [
  ['no background color', "there's no single background colour."],
  ['no background estimate', "there's no single background colour."],
  ['border coverage', "the edges aren't one plain colour."],
  ['border color spread too high', 'the background colour changes too much.'],
  ['subject touches the border', 'the art touches the edge of the picture.'],
  ['no subject', 'nothing would be left.'],
  ['gradient surface refused', 'the background is a gradient.'],
]
export const BG_OTHER = "it isn't a plain background."
export function bgLine(bg) {
  if (!bg || !bg.mode) return null
  if (bg.applied) return `Background removed (${bg.removed} ${bg.removed === 1 ? 'pixel' : 'pixels'}).`
  const r = bg.reason ?? 'no background estimate'
  return `Couldn't remove the background: ${BG.find(([p]) => r.startsWith(p))?.[1] ?? BG_OTHER}`
}

// ---- Fit to sprite (§7.5) ----
export function trimCaption(report) {
  const t = report?.trim
  if (!t?.enabled || !t.box) return null
  const { width: W, height: H } = report.input
  const [x0, y0, x1, y1] = t.box
  if (x0 === 0 && y0 === 0 && x1 === W && y1 === H) return 'Nothing to crop: the picture has no see-through edges.'
  const edge = t.fallback ? 'any visible pixel' : t.basis === 'cells' ? (report.route === 'grid' ? 'solid pixels' : 'pixels more than half visible') : 'any visible pixel'
  const [ox, oy] = report.fit.offset
  return `Subject area ${dims(x1 - x0, y1 - y0)} px at ${x0}, ${y0} · edge: ${edge} · padding ${ox}, ${oy} px`
}

/** A file that couldn't be opened, named (shown in a dismissible banner over the stage). */
export function fileError(code, name) {
  const n = name ?? 'The pasted image'
  if (code === 'decode-too-large') return `${n} is too big (over 4096 × 4096). Try a smaller copy.`
  if (code === 'decode-damaged') return `${n} looks damaged and couldn't be opened.`
  return `Couldn't open ${n}. Try a PNG or JPEG.`
}

// ---- Errors (§7.6): message + one-tap fix id ----
const ERR = {
  'decode-unsupported': ["Pixilate can't open this file. Try a PNG or JPEG.", 'choose', 'Choose another'],
  'decode-too-large': ['This image is too big (over 4096 × 4096). Try a smaller copy.', 'choose', 'Choose another'],
  'decode-damaged': ["This image looks damaged and couldn't be opened.", 'choose', 'Choose another'],
  'empty-visible-region': ['Nothing is left to keep: the image became fully see-through.', 'trim-off', 'Turn off Crop to subject'],
  'algorithm-budget-exceeded': ['That needs more work than this device allows. Try a smaller size or fewer colours.', 'colours-16', 'Use 16 colours'],
  'invalid-input': ["That setting isn't valid.", 'reset-size', 'Reset size'],
  'internal-invariant': ['Something went wrong inside Pixilate. Your image is safe.', 'retry', 'Try again'],
  worker: ["Pixilate couldn't start. Reload the page.", 'reload', 'Reload'],
}
export function errorCopy(code) {
  const [message, fix, label] = ERR[code] ?? ERR['internal-invariant']
  return { message, fix, label }
}

// ---- Size: derivation sentence (§5.3), headings (§5.2), validation (§8.1) ----
const n1 = (v) => String(Math.round(v * 100) / 100) // the engine reports blocks to 0.01 px
const per = ([px, py]) => (px === py ? n1(px) : `${n1(px)} × ${n1(py)}`)

export function derivation(info) {
  const g = info.grid, s = g.suggestedSize, W = info.width, H = info.height
  if (s && (s[0] > MAX || s[1] > MAX)) return `Found ${dims(s[0], s[1])}, over the 1024 limit.`
  if (g.class === 'exact' && s) {
    if (g.period[0] === 1 && g.period[1] === 1) return `This already looks like pixel art at ${dims(s[0], s[1])}.`
    return `Found a ${dims(s[0], s[1])} pixel grid (blocks of ${per(g.period)} px) in this ${dims(W, H)} image.`
  }
  if (g.class === 'grid' && s) return `Found a pixel grid of about ${per(g.period)} px blocks, ${s[0]} wide and ${s[1]} high.`
  if (g.class === 'exact') return 'Several pixel grid sizes fit, so there is no detected size.'
  if (g.class === 'weak') return 'The grid is faint, so there is no detected size.'
  return 'No clear pixel grid found.'
}

export function needsHeading(kase, info) {
  const s = info?.grid?.suggestedSize
  switch (kase) {
    case 'weak': return 'The pixel grid is faint. Pick the size you want.'
    case 'over': return `This looks like pixel art at ${dims(s[0], s[1])}, which is bigger than the 1024 limit. Pick the size you want.`
    case 'stopped': return 'Stopped. Pick a size to try again.'
    case 'ambiguous': return 'Several pixel grid sizes fit. Pick the size you want.'
    default: return "Couldn't find a clear pixel grid. Pick the size you want."
  }
}

export const derivedNote = (field, value, W, H) => `${field === 'h' ? 'Height' : 'Width'} ${value} keeps the ${dims(W, H)} shape.`
export const derivedTooBig = (field, value) => `That makes the ${field === 'h' ? 'height' : 'width'} ${value}. The largest is 1024, so use a smaller ${field === 'h' ? 'width' : 'height'}.`

// ---- Status and toasts ----
export const readyStatus = (w, h, id, best) => `Pixel art ready. ${srDims(w, h)} pixels, ${styleLabel(id)}${best ? ', best match' : ''}.`
export const savedToast = (name) => `Saved ${name}.`
export const copiedToast = (w, h) => `Copied ${dims(w, h)} PNG.`
export const saveLabel = (w, h, s = 1) => `Save PNG · ${dims(w, h)}${s > 1 ? ` at ${s}×` : ''}`
export const scaleLine = (w, h) => `→ ${dims(w, h)} px`
export const coloursUsed = (used, allowed) => `${used} ${used === 1 ? 'colour' : 'colours'} used${allowed ? ` of ${allowed} allowed` : ''}`
export const toolsButton = (n) => (n ? `Tools · ${n}` : 'Tools')
export const sizeName = (w, h, caption) => `Size, ${srDims(w, h)} pixels, ${caption.toLowerCase()}`
export const zoomTip = (z) => `Each pixel is ${z} screen pixels`
export const artLabel = (w, h, colors, id, z) => `Pixel art, ${srDims(w, h)} pixels${colors ? `, ${colors} colours` : ''}, ${styleLabel(id)}, zoom ${Math.round(z * 100) / 100} times`
export const sourceAlt = (w, h) => `Original image, ${srDims(w, h)} pixels`
export const topDims = (name, w, h) => `${name} · ${dims(w, h)}`
export const failedStyle = (id, code) => `${styleLabel(id)} couldn't be made: ${errorCopy(code).message}`
export const metaClaim = (family) => `File metadata claims: ${family} (signature not checked).`
export const gridError = (max) => `Use a whole number from 1 to ${max}.`
export const gridNote = (c, r) => `Follows your pixel grid: ${dims(c, r)} blocks.`
export const subjectNote = (w, h) => `The subject's own pixels: ${dims(w, h)}.`
export const moreLabel = (k) => `${T.saveOptions}, enlarge ${k} times`
export const bestIs = (label, why) => `Best is ${label}: ${why}`
export const styleName = (id, route, best) => `${styleLabel(id)}${best ? ', best match' : ''}. ${styleDesc(id, route)}`
