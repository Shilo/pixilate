import type { analyze, convert, convertCandidates } from './core/pipeline.ts'
import type { Options } from './core/types.ts'

export interface HarnessCandidate {
  id: string
  report: ReturnType<typeof convert>['report']
  width: number
  height: number
  rgba: Uint8ClampedArray
  pngBytes: Uint8Array
  hash: string
}
export interface HarnessInfo extends ReturnType<typeof analyze> {
  width: number
  height: number
  format: string
  decode: string
}
export interface HarnessResult extends Omit<ReturnType<typeof convertCandidates>, 'candidates'> {
  candidates: HarnessCandidate[]
  name: string
}
export interface HarnessJob { kind: string; bytes: ArrayBuffer; mime: string; opts?: Options }
export interface HarnessError { code: string | null; message: string }
export type HarnessReply<T> = (T & { error?: undefined }) | ({ error: HarnessError } & Partial<Record<keyof T, never>>)
