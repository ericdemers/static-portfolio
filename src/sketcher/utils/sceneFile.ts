// Save / load a sketcher scene as a portable JSON file. The scene is the curves
// plus their defining PH/AB/rational metadata (the side-map keyed by curve id)
// and any 3D spatial curves — everything needed to reconstruct what's on screen.
import type { Curve, Curve3D, PHMetadataAny } from '../types/curve'

export const SCENE_VERSION = 1

export interface SceneFile {
  version: number
  curves: Curve[]
  // phMetadata Map serialized as [id, meta] entries (JSON has no Map type).
  phMetadata: [string, PHMetadataAny][]
  spatialCurves: Curve3D[]
}

export interface ParsedScene {
  curves: Curve[]
  phMetadata: Map<string, PHMetadataAny>
  spatialCurves: Curve3D[]
}

/** Serialize the live scene to a pretty-printed JSON string. */
export function serializeScene(
  curves: Curve[],
  phMetadata: Map<string, PHMetadataAny>,
  spatialCurves: Curve3D[],
): string {
  const file: SceneFile = {
    version: SCENE_VERSION,
    curves,
    phMetadata: [...phMetadata.entries()],
    spatialCurves,
  }
  return JSON.stringify(file, null, 2)
}

/** Parse a scene file back into store-ready values. Throws on malformed input. */
export function parseScene(text: string): ParsedScene {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  if (!data || typeof data !== 'object') throw new Error('Not a sketcher scene file.')
  const file = data as Partial<SceneFile>
  if (!Array.isArray(file.curves)) throw new Error('Scene file is missing its curves.')
  return {
    curves: file.curves,
    phMetadata: new Map(Array.isArray(file.phMetadata) ? file.phMetadata : []),
    spatialCurves: Array.isArray(file.spatialCurves) ? file.spatialCurves : [],
  }
}

/** Trigger a browser download of the given text as `filename`. */
export function downloadScene(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** A timestamped default file name, e.g. numericelements-sketch-2026-06-04.json */
export function defaultSceneFilename(now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  return `numericelements-sketch-${date}.json`
}

/** Read a chosen file, parse it, and hand the scene to `onScene`; alert on error. */
export function loadSceneFromFile(file: File, onScene: (scene: ParsedScene) => void): void {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      onScene(parseScene(String(reader.result)))
    } catch (err) {
      alert(`Couldn't load scene: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }
  reader.readAsText(file)
}

/** Open a file picker and load the chosen scene (used by the Cmd/Ctrl+O shortcut). */
export function pickAndLoadScene(onScene: (scene: ParsedScene) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) loadSceneFromFile(file, onScene)
  }
  input.click()
}
