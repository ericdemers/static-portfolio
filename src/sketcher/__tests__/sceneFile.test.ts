import { describe, it, expect } from 'vitest'
import { serializeScene, parseScene, defaultSceneFilename } from '../utils/sceneFile'
import type { Curve, PHMetadataAny } from '../types/curve'

describe('scene file save/load round-trip', () => {
  const curves: Curve[] = [
    { id: 'a', kind: 'bspline', degree: 3, closed: false, controlPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }], knots: [0, 0, 0, 0, 1, 1, 1, 1] },
    { id: 'b', kind: 'complex-rational', degree: 2, closed: false, controlPoints: [{ re: 1, im: 0, w_re: 1, w_im: 0 }], knots: [0, 0, 0, 1, 1, 1] },
  ]
  const meta: PHMetadataAny = {
    kind: 'polynomial', uvDegree: 1, uControlPoints: [1, 2], vControlPoints: [3, 4], uvKnots: [0, 0, 1, 1], origin: { x: 0, y: 0 },
  }
  const phMetadata = new Map<string, PHMetadataAny>([['a', meta]])

  it('serialize → parse preserves curves and phMetadata exactly', () => {
    const parsed = parseScene(serializeScene(curves, phMetadata, []))
    expect(parsed.curves).toEqual(curves)
    expect(parsed.spatialCurves).toEqual([])
    expect(parsed.phMetadata.size).toBe(1)
    expect(parsed.phMetadata.get('a')).toEqual(meta)
  })

  it('rejects non-JSON and non-scene input', () => {
    expect(() => parseScene('not json at all')).toThrow()
    expect(() => parseScene('{"version":1}')).toThrow() // no curves
  })

  it('tolerates a missing phMetadata/spatialCurves section', () => {
    const parsed = parseScene(JSON.stringify({ version: 1, curves }))
    expect(parsed.curves).toEqual(curves)
    expect(parsed.phMetadata.size).toBe(0)
    expect(parsed.spatialCurves).toEqual([])
  })

  it('default filename is dated', () => {
    expect(defaultSceneFilename(new Date('2026-06-04T12:00:00Z'))).toBe('numericelements-sketch-2026-06-04.json')
  })
})
