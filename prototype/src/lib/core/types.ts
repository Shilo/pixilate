/** Pixel and numeric contracts shared by the deterministic engine. Types erase at build time. */
export interface Image {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type Numbers = number[] | Float64Array | Float32Array | Int32Array | Int16Array | Uint32Array | Uint8Array | Uint8ClampedArray
export type Pair = [number, number]
export type Box = [number, number, number, number]

export interface BackgroundResult {
  applied: boolean
  reason: string | null
  removed: number
  specks: number
  haloChanged: number
}

export interface Cells {
  w: number
  h: number
  lab: Float32Array
  alpha: Uint8Array
  dominance: Float32Array
  masked?: Uint8Array
  pure?: Uint8Array
  rgb?: Int32Array
  removed?: Uint8Array
  background?: BackgroundResult
}

export interface Indexed {
  w: number
  h: number
  index: Int16Array
  palette: Float32Array
  rgb: Uint8Array
  dominance?: Float32Array
  warnings?: string[]
  changed?: Record<string, number>
  steps?: Record<string, number>
}

export interface Axis {
  period: number
  phase: number
  cuts: Float64Array
  count: number
  elastic: boolean
  prominence: number
  coherence: number
  agreement?: number
  gain?: number
  support?: number | null
  countDP?: boolean
}

export interface GridCandidate {
  sx: number
  sy: number
  phaseX: number
  phaseY: number
  countX: number
  countY: number
}

export interface Grid {
  x: Axis
  y: Axis
  class: 'none' | 'weak' | 'grid' | 'exact'
  confidence: number
  evidence: string[]
  profile?: string
  candidates?: GridCandidate[]
  ambiguous?: boolean
  suggestedSize?: Pair | null
  alternatives?: Record<'x' | 'y', { period: number; count: number; score: number }[]>
}

export interface Surface { coef: Float64Array }
export interface Kernel {
  a: number | null
  b: number | null
  rms: number | null
  keys?: number
}

export interface BackgroundOptions {
  mode?: 'auto' | 'key'
  key?: number[]
  tolerance?: number
  connectivity?: 4 | 8
}

/** Runtime validation remains authoritative at the public API boundary. */
export interface Options {
  targetW?: number | null
  targetH?: number | null
  trim?: boolean | { basis?: 'pixels' | 'cells'; tau?: 0; comparison?: '>' }
  fit?: 'contain' | 'cover' | 'stretch'
  route?: 'auto' | 'grid' | 'raster'
  cleanup?: boolean
  background?: false | 'auto' | BackgroundOptions
  halo?: boolean
  colors?: 'auto' | number
  palette?: Numbers | number[][] | null
  manualPeriod?: number[] | null
  warnings?: string[]
  format?: string
  decode?: string
  strict?: boolean
  orientation?: number
}
