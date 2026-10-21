// Stage geometry (spec §8.4, §8.5, §8.6). Pure; tested in test/geometry.test.js.

/**
 * Where the source sits under the result: { src: [x0, y0, x1, y1] in source px, dst: [ox, oy, fw, fh] in output px }.
 * Grid route: the lattice used (already cropped by trim and cover). Raster route: the trim box offset by the
 * cover crop. Identity: the whole image.
 */
export function beforeRect(report, W, H) {
  const dst = [...report.fit.offset, ...report.fit.resized]
  if (report.route === 'grid') {
    const { x, y } = report.grid.cuts
    return { src: [x[0], y[0], x[x.length - 1], y[y.length - 1]], dst }
  }
  const b = report.trim?.box ?? [0, 0, W, H], c = report.fit.crop
  return { src: c ? [b[0] + c[0], b[1] + c[1], b[0] + c[2], b[1] + c[3]] : [...b], dst }
}

/** Device pixels per art pixel that fit the stage: an integer 1..64, or the fractional shrink below 1. */
export function fitZoom(stage, w, h, dpr = 1) {
  const s = Math.min((stage.width * dpr) / w, (stage.height * dpr) / h)
  if (!(s > 0)) return 1
  return s < 1 ? s : Math.min(64, Math.floor(s))
}

export const SCALES = [1, 2, 4, 8, 16]
/** Export scales whose result stays within 4096 px on each side. */
export const exportScales = (w, h) => SCALES.filter((s) => w * s <= 4096 && h * s <= 4096)

/** Nearest-neighbour integer upscale of RGBA8. */
export function upscale(rgba, w, h, k) {
  if (k === 1) return rgba
  if (rgba.byteOffset % 4) rgba = rgba.slice()
  const W = w * k, out = new Uint8ClampedArray(W * h * k * 4), src = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h), dst = new Uint32Array(out.buffer)
  for (let y = 0; y < h * k; y++) {
    const row = ((y / k) | 0) * w
    for (let x = 0; x < W; x++) dst[y * W + x] = src[row + ((x / k) | 0)]
  }
  return out
}
