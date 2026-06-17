import { describe, it, expect } from 'vitest'
import { serializeScene, parseScene } from './sceneFile'
import { fitPHSplineToBSpline } from '../optimizer/phSplineFit'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from './bspline/utilities'
import { evaluateCurve } from './bspline/core'
import type { Curve, Curve3D, Point2D, PHMetadataAny } from '../types/curve'

function openPH(id: string): { curve: Curve; meta: PHMetadataAny } {
  const pts: Point2D[] = []
  for (let i = 0; i < 12; i++) { const t = i / 11; pts.push({ x: t * 300, y: 60 * Math.sin(t * 2 * Math.PI) }) }
  const bs = createBSpline(pts, 3) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
  return { curve: { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: false }, meta: ph.metadata }
}

function closedPH(id: string): { curve: Curve; meta: PHMetadataAny } {
  const pts: Point2D[] = []
  for (let i = 0; i < 12; i++) { const a = (2 * Math.PI * i) / 12; pts.push({ x: 150 * Math.cos(a), y: 90 * Math.sin(a) }) }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
  return { curve: { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }, meta: ph.metadata }
}

describe('PH spline scene round-trip (save → JSON → load)', () => {
  it('preserves open and closed PH curves and their metadata exactly', () => {
    const o = openPH('open'), c = closedPH('closed')
    const curves: Curve[] = [o.curve, c.curve]
    const phMetadata = new Map<string, PHMetadataAny>([['open', o.meta], ['closed', c.meta]])
    const spatial: Curve3D[] = []

    const json = serializeScene(curves, phMetadata, spatial)
    const back = parseScene(json)

    // Curves and metadata survive the JSON round-trip byte-for-byte.
    expect(back.curves).toEqual(curves)
    expect(back.phMetadata).toEqual(phMetadata)

    // The restored metadata is still recognized as PH and carries the generator.
    const ro = back.phMetadata.get('open') as Extract<PHMetadataAny, { kind: 'polynomial' }>
    const rc = back.phMetadata.get('closed') as Extract<PHMetadataAny, { kind: 'polynomial' }>
    expect(ro.kind).toBe('polynomial')
    expect(ro.uControlPoints.length).toBeGreaterThan(0)
    expect(rc.closed).toBe(true)
    expect(rc.seamContinuity).toBe(c.meta && (c.meta as { seamContinuity?: number }).seamContinuity)
    expect(typeof rc.wrapSign).toBe('number')

    // The restored geometry evaluates identically to the original.
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const a = evaluateCurve(o.curve, t), b = evaluateCurve(back.curves[0], t)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9)
      const ca = evaluateCurve(c.curve, t), cb = evaluateCurve(back.curves[1], t)
      expect(Math.hypot(ca.x - cb.x, ca.y - cb.y)).toBeLessThan(1e-9)
    }
  })

  it('a freshly parsed scene exposes the same store-ready Map shape loadScene expects', () => {
    const o = openPH('open')
    const json = serializeScene([o.curve], new Map([['open', o.meta]]), [])
    const back = parseScene(json)
    expect(back.phMetadata instanceof Map).toBe(true)
    expect(back.phMetadata.has('open')).toBe(true) // id ↔ metadata key alignment kept
  })
})
