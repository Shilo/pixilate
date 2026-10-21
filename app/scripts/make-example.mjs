// Writes public/example.png: a procedural sprite (project-authored, rights-clean) degraded by the seeded
// generator's 'mixel-detail' preset (AI-style mixels, texture and drift) from prototype/test. It must detect as exact or grid at its true lattice size (sprite plus margins),
// so "Try an example" shows the confident path; otherwise the next seed is tried.
import { writeFileSync } from 'node:fs'
import { proceduralSprites } from '../../prototype/test/fixtures.js'
import { degrade, PRESETS } from '../../prototype/test/synth.js'
import { analyze } from '../../prototype/src/lib/core/pipeline.js'
import { encodePng } from '../../prototype/src/lib/decode.js'

const sprite = proceduralSprites(1).find((s) => s.id === 'proc-blob').img
// stronger than the preset so the messy-to-crisp change is visible at a glance: blurred edges, shading drift,
// texture and noise inside the blocks
const PARAMS = { ...PRESETS['mixel-detail'], edgeBlurSigma: 0.9, cellJitter: 6, cellGradient: 14, textureAmp: 6, noiseSigma: 2.2 }
for (let seed = 1; seed <= 50; seed++) {
  const { img, truth } = degrade(sprite, PARAMS, seed) // truth: the full lattice, margins included
  const a = analyze(img)
  const [w, h] = a.grid.suggestedSize ?? []
  if (['exact', 'grid'].includes(a.grid.class) && w === truth.cellsX && h === truth.cellsY) {
    writeFileSync(new URL('../public/example.png', import.meta.url), encodePng(img))
    console.log(`example.png: seed ${seed}, ${img.width}x${img.height}, ${a.grid.class} ${w}x${h}`)
    process.exit(0)
  }
}
throw new Error('no seed in 1..50 detects at the true lattice size')
