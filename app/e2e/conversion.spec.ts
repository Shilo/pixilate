import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'
import { convertCandidates, canonicalHash } from '../../prototype/src/lib/core/pipeline.ts'
import { decodeImage, encodePng } from '../../prototype/src/lib/decode.ts'

// Owned procedural art only: a transparent, five-colour 16px sprite enlarged by exact 4px cells.
// No fixture files, user art, network API or random input is needed.
function fixture() {
  const width = 64, height = 64, data = new Uint8ClampedArray(width * height * 4)
  const colours = [[32, 43, 61], [208, 63, 82], [255, 190, 53], [65, 171, 117], [173, 117, 208]]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cx = Math.floor(x / 4), cy = Math.floor(y / 4)
    if ((cx - 7) ** 2 + (cy - 7) ** 2 > 42) continue
    const rgb = colours[(cx * 3 + cy * 5 + (cx * cy) % 7) % colours.length]
    data.set([...rgb, 255], (y * width + x) * 4)
  }
  const image = { width, height, data }
  const png = encodePng(image)
  const result = convertCandidates(image, {
    targetW: 16, targetH: 16, fit: 'contain', trim: false, background: false,
    colors: 'auto', format: 'png', decode: 'js', strict: true, orientation: 1, warnings: [],
  }, png)
  expect(result.candidates, 'the fixture intentionally deduplicates every style to one output').toHaveLength(1)
  const candidate = result.candidates.find(c => c.id === result.alias.grid)
  if (!candidate) throw new Error('Procedural smoke fixture must produce a Faithful candidate')
  return { png: Buffer.from(png), expected: candidate.image, expectedPng: Buffer.from(encodePng(candidate.image)) }
}

async function bytes(download: Download): Promise<Buffer> {
  expect(await download.failure()).toBeNull()
  const path = await download.path()
  if (!path) throw new Error('Browser did not save the requested download')
  return readFile(path)
}

async function openAt16(page: Page, input: Buffer): Promise<void> {
  await page.locator('input[type=file]').setInputFiles({ name: 'procedural.png', mimeType: 'image/png', buffer: input })
  await expect(page.locator('#save')).toHaveAttribute('aria-disabled', 'false')
  const presets = page.getByRole('group', { name: 'Common sizes (long side)', exact: true })
  if (!await presets.isVisible()) await page.getByRole('button', { name: /^Size,/ }).click()
  await presets.getByRole('button', { name: '16', exact: true }).click()
  const faithful = page.getByRole('radio', { name: /^Faithful/ })
  // The existing compact layout omits the style selector when all styles share one result.
  // In that case the labelled preview and downloaded bytes still verify the chosen Faithful output.
  if (await faithful.count()) {
    await faithful.locator('..').click()
    await expect(faithful).toBeChecked()
  }
  await expect(page.getByRole('img', { name: /^Pixel art, 16 by 16 pixels/ })).toBeVisible()
  await expect(page.locator('#save')).toHaveAttribute('aria-disabled', 'false')
}

test('production import, worker conversion and PNG/recipe downloads match the engine', async ({ page }) => {
  const errors: string[] = [], workers: string[] = [], external: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('worker', worker => workers.push(worker.url()))
  page.on('request', request => {
    const url = new URL(request.url())
    if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:5211') external.push(url.href)
  })
  await page.addInitScript(() => {
    const violations: string[] = []
    Object.defineProperty(window, '__smokeCspViolations', { value: violations })
    window.addEventListener('securitypolicyviolation', event => violations.push(`${event.violatedDirective}: ${event.blockedURI}`))
  })
  const input = fixture()
  await page.goto('/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /worker-src 'self'/)
  await openAt16(page, input.png)
  expect(workers.length, 'the image must be processed by a browser worker before export').toBeGreaterThan(0)

  const pngDownload = page.waitForEvent('download')
  await page.locator('#save').click()
  const saved = await pngDownload
  expect(saved.suggestedFilename()).toMatch(/\.png$/)
  const output = await bytes(saved)
  expect(output.equals(input.expectedPng), 'saved PNG must be byte-identical to the direct engine').toBe(true)
  const decoded = await decodeImage(output, 'image/png')
  expect([decoded.img.width, decoded.img.height]).toEqual([16, 16])
  expect(Buffer.from(decoded.img.data).equals(Buffer.from(input.expected.data))).toBe(true)
  expect(new Set(decoded.img.data.filter((_, index) => index % 4 === 3))).toEqual(new Set([0, 255]))

  // A 1x save uses the cached PNG; enlargement must also exercise the one-shot export worker.
  const enlargement = page.getByRole('group', { name: 'Enlarge', exact: true })
  if (!await enlargement.isVisible()) await page.getByRole('button', { name: /^Save options,/ }).click()
  await enlargement.getByRole('button', { name: '2×', exact: true }).click()
  const previousWorkers = workers.length
  const enlargedDownload = page.waitForEvent('download')
  await page.locator('#save').click()
  const enlarged = await bytes(await enlargedDownload)
  const pixels = new Uint8ClampedArray(32 * 32 * 4)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const source = (Math.floor(y / 2) * 16 + Math.floor(x / 2)) * 4
    pixels.set(input.expected.data.subarray(source, source + 4), (y * 32 + x) * 4)
  }
  expect(enlarged.equals(Buffer.from(encodePng({ width: 32, height: 32, data: pixels })))).toBe(true)
  expect(workers.length, 'enlargement must start an export worker').toBeGreaterThan(previousWorkers)

  await page.getByRole('button', { name: 'Details', exact: true }).click()
  const recipeDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save recipe (.json)', exact: true }).click()
  const recipe: unknown = JSON.parse((await bytes(await recipeDownload)).toString('utf8'))
  expect(recipe).toMatchObject({
    options: { targetW: 16, targetH: 16, cleanup: false, background: false },
    output: { width: 16, height: 16, hash: await canonicalHash(input.expected) },
  })
  expect(errors).toEqual([])
  expect(external, 'images must stay on the device').toEqual([])
  expect(await page.evaluate(() => Reflect.get(window, '__smokeCspViolations') as string[])).toEqual([])
})

test('a rejected replacement image restores the previous downloadable result', async ({ page }) => {
  const input = fixture()
  await page.goto('/')
  await openAt16(page, input.png)
  await page.locator('input[type=file]').setInputFiles({
    name: 'unsupported.png', mimeType: 'image/png', buffer: Buffer.from('This is text, not a PNG.'),
  })
  await expect(page.locator('.file-banner[role=alert]')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Pixel art, 16 by 16 pixels/ })).toBeVisible()
  await expect(page.locator('#save')).toHaveAttribute('aria-disabled', 'false')
  const download = page.waitForEvent('download')
  await page.locator('#save').click()
  expect((await bytes(await download)).equals(input.expectedPng)).toBe(true)
})
