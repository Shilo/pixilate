// Job control (spec §9) with a stand-in Worker: stale replies are dropped, a busy worker is replaced
// (re-opened without analysis, then the convert), a failed open is recovered, and a dead worker is reported.
import { beforeEach, expect, test } from 'vitest'
import { createClient } from '../src/lib/client.js'

let workers
class FakeWorker {
  constructor() { this.sent = []; this.dead = false; workers.push(this) }
  postMessage(m) { this.sent.push(m) }
  terminate() { this.dead = true }
  reply(m) { this.onmessage?.({ data: m }) }
}
beforeEach(() => { workers = []; globalThis.Worker = FakeWorker })

function setup() {
  const got = [], failed = []
  const c = createClient({ onReply: (m) => got.push(m), onFail: () => failed.push(1) })
  return { c, got, failed }
}
const buf = () => new Uint8Array([1, 2, 3]).buffer

test('open analyses; only the latest job is delivered', () => {
  const { c, got } = setup()
  c.open(buf(), 'image/png')
  const w = workers[0], open = w.sent[0]
  expect(open).toMatchObject({ type: 'open', analyze: true })
  w.reply({ type: 'analysis', jobId: open.jobId })
  expect(got).toHaveLength(1)
  c.convert({ targetW: 8 })
  const conv = w.sent[1]
  expect(workers).toHaveLength(1) // idle worker reused
  w.reply({ type: 'result', jobId: conv.jobId - 1 }) // stale
  expect(got).toHaveLength(1)
  w.reply({ type: 'result', jobId: conv.jobId })
  expect(got.map((m) => m.type)).toEqual(['analysis', 'result'])
})

test('a convert while busy replaces the worker and re-opens without analysis', () => {
  const { c, got } = setup()
  c.open(buf(), 'image/png')
  workers[0].reply({ type: 'analysis', jobId: workers[0].sent[0].jobId })
  c.convert({ targetW: 8 })
  c.convert({ targetW: 16 }) // first still running
  expect(workers[0].dead).toBe(true)
  const w2 = workers[1]
  expect(w2.sent.map((m) => [m.type, m.analyze])).toEqual([['open', false], ['convert', undefined]])
  expect(w2.sent[1].opts).toEqual({ targetW: 16 })
  workers[0].reply({ type: 'result', jobId: workers[0].sent[1].jobId }) // the dead worker's late reply
  expect(got).toHaveLength(1)
})

test('restore re-arms earlier bytes; the next job decodes them', () => {
  const { c } = setup()
  const a = buf()
  c.open(a, 'image/png')
  c.restore(new Uint8Array([9]).buffer, 'image/jpeg')
  expect(workers[0].dead).toBe(true)
  c.convert({ targetW: 8 })
  const w = workers[1]
  expect(w.sent[0]).toMatchObject({ type: 'open', analyze: false, mime: 'image/jpeg' })
  expect(new Uint8Array(w.sent[0].bytes)).toEqual(new Uint8Array([9]))
})

test('a worker that dies before replying is reported once', () => {
  const { c, failed } = setup()
  c.open(buf(), 'image/png')
  workers[0].onerror({ preventDefault() {} })
  expect(failed).toHaveLength(1)
})
