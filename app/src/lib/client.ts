import type { Job, Reply } from './types.ts'
import type { Options } from '$engine/core/types.ts'
declare global { var __pixilatePosts: string[] | undefined }
// Main-thread job control (spec §9): one long-lived worker that caches the decode; a newer job always wins.
// ponytail: cancelling a busy job terminates the worker, so the next job re-decodes (hundreds of ms on big
// photos, INFERRED); the upgrade path is cooperative cancel points in the engine.
const DEV = import.meta.env?.DEV
const spawnWorker = () => new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })

/** onReply(msg) gets only replies to the latest job; onFail() fires when a worker dies before any reply. */
export function createClient({ onReply, onFail }: { onReply: (reply: Reply) => void; onFail: () => void }) {
  let worker: Worker|null = null, busy = false, bytes: ArrayBuffer | null = null, mime = '', seq = 0, latest = 0, t0 = 0

  function post(msg: Job, transfer?: Transferable[]) {
    if (DEV) (globalThis.__pixilatePosts ??= []).push(msg.type) // spied by the browser checks (F3, F8)
    worker!.postMessage(msg, transfer as Transferable[])
  }

  function spawn(analyze: boolean) {
    worker?.terminate()
    const w = (worker = spawnWorker())
    let replied = false
    w.onmessage = ({ data }: MessageEvent<Reply>) => {
      replied = true
      if (w !== worker || data.jobId !== latest) return // stale
      busy = false
      if (DEV) console.debug(`${data.type === 'analysis' ? 'analysis' : 'convert'} ms`, Math.round(performance.now() - t0))
      onReply(data)
    }
    w.onerror = (e) => {
      e.preventDefault?.()
      if (w === worker && !replied) { worker = null; busy = false; onFail() }
    }
    const copy = bytes!.slice(0)
    post({ type: 'open', jobId: analyze ? (latest = ++seq) : ++seq, bytes: copy, mime, analyze }, [copy])
    if (analyze) { busy = true; t0 = performance.now() }
  }

  return {
    /** A new image: terminate, spawn, analyse. The caller keeps `buf`; each spawn sends a copy. */
    open(buf: ArrayBuffer, type: string) {
      bytes = buf; mime = type
      spawn(true)
    },
    convert(opts: Options) {
      if (!worker || busy) spawn(false)
      latest = ++seq
      busy = true
      t0 = performance.now()
      post({ type: 'convert', jobId: latest, opts })
    },
    /** Back to earlier bytes (a failed open restores the previous image); the next job re-decodes them. */
    restore(buf: ArrayBuffer, type: string) {
      worker?.terminate()
      worker = null; busy = false; latest = ++seq; bytes = buf; mime = type
    },
    stop() {
      worker?.terminate()
      worker = null; busy = false; latest = ++seq
    },
    /** One-shot export worker: nearest-neighbour ×scale and PNG encode, off the main thread. */
    exportPng(rgba: Uint8ClampedArray, width: number, height: number, scale: number) {
      return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
        const w = spawnWorker(), t = performance.now()
        w.onmessage = ({ data }: MessageEvent<Extract<Reply, {type: "png" | "error"}>>) => {
          w.terminate()
          if (DEV) console.debug('export ms', Math.round(performance.now() - t))
          data.type === 'png' ? resolve(data.png) : reject(new Error((data as Extract<Reply, {type: "error"}>).message))
        }
        w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'export failed')) }
        w.postMessage({ type: 'export', jobId: 0, rgba: rgba.slice(), width, height, scale } satisfies Job)
      })
    },
  }
}
