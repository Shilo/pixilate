import { createJobs } from './lib/jobs.js'

const handle = createJobs()
self.onmessage = (e) => handle(e.data, (msg, transfer) => self.postMessage(msg, transfer ?? []))
