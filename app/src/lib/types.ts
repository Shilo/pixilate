import type { analyze, convert, convertCandidates } from '$engine/core/pipeline.ts'
import type { Options } from '$engine/core/types.ts'

export type Report = ReturnType<typeof convert>['report']
export type Recommendation = ReturnType<typeof convertCandidates>['recommendation']
export interface Size {
  w: number | null
  h: number | null
  lock: boolean
  fit: NonNullable<Options['fit']>
  source: string | null
  chip: string | null
  note: string | null
  derived: 'w' | 'h' | null
  auto?: boolean
}
export interface Tools { background: boolean; trim: boolean; colors: 'auto' | number }
export interface GridOverride { cols: number; rows: number }
export interface Settings { size: Size; tools: Tools; grid: GridOverride | null; key: string }
export interface OpenFile { name: string | null; base: string; bytes: ArrayBuffer; mime: string; url: string }
export interface Candidate {
  id: string
  width: number
  height: number
  rgba: Uint8ClampedArray
  png: Uint8Array<ArrayBuffer>
  hash: string | null
  report: Report
}
export interface Info extends ReturnType<typeof analyze> {
  type: 'analysis'
  jobId: number
  width: number
  height: number
  format: string
  decode: string
  warnings: string[]
  hasAlpha: boolean
}
export interface ResultReply extends Omit<ReturnType<typeof convertCandidates>, 'candidates'> {
  type: 'result'
  jobId: number
  candidates: Candidate[]
}
export interface Result extends ResultReply { settings: Settings }
export interface ErrorReply { type: 'error'; jobId: number; code: string | null; message: string }
export interface PngReply { type: 'png'; jobId: number; png: Uint8Array<ArrayBuffer> }
export type Reply = Info | ResultReply | ErrorReply | PngReply
export type Job =
  | { type: 'open'; jobId: number; bytes: ArrayBuffer; mime: string; analyze: boolean }
  | { type: 'convert'; jobId: number; opts: Options }
  | { type: 'export'; jobId: number; rgba: Uint8ClampedArray; width: number; height: number; scale: number }
export type Status = 'empty' | 'analysing' | 'needs' | 'converting' | 'result' | 'failed'
export interface Previous {
  file: OpenFile; info: Info | null; derivationText: string; prefilled: Size | null; needs: string | null
  size: Size; tools: Tools; grid: GridOverride | null; gridOpen: boolean; result: Result | null; chosen: string | null; status: Status
}
export type Zoom = (direction: number, value?: number | null) => void
