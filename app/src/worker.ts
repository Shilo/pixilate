import type { Job } from './lib/types.ts'
const scope = self as unknown as DedicatedWorkerGlobalScope
import { createJobs } from './lib/jobs.ts'

const handle = createJobs()
scope.onmessage = (e: MessageEvent<Job>) => handle(e.data, (msg, transfer) => scope.postMessage(msg, transfer ?? []))
