import { describe, it, expect } from 'vitest'
import { useSceneStore } from './sceneStore'
import { fitPHSplineToBSpline } from '../optimizer/phSplineFit'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
import type { Curve, Point2D, PHMetadataAny } from '../types/curve'

const meta = (id: string) => useSceneStore.getState().phMetadata.get(id) as Extract<PHMetadataAny, { kind: 'polynomial' }>
const curveOf = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!
const isFiniteCurve = (id: string) => curveOf(id).controlPoints.every((p) => Number.isFinite((p as Point2D).x) && Number.isFinite((p as Point2D).y))
const genInteriorCount = (id: string) => meta(id).uvKnots.filter((k) => k > 1e-9 && k < 1 - 1e-9).length

// A wavy open stroke → a multi-segment generator (several interior knots).
function wavy(): Point2D[] {
  const pts: Point2D[] = []
  for (let i = 0; i < 12; i++) { const t = i / 11; pts.push({ x: t * 300, y: 60 * Math.sin(t * 2 * Math.PI) }) }
  return pts
}

describe('delete knot on PH curves', () => {
  it('removes ONE generator knot for an open PH curve (curve recomputes, stays finite)', () => {
    const bs = createBSpline(wavy(), 3) as { controlPoints: Point2D[]; degree: number; knots: number[] }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const id = 'open-ph'
    const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: false }
    useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, selectedKnotIndex: null })

    const gen0 = genInteriorCount(id)
    expect(gen0).toBeGreaterThan(1) // multi-segment → has interior knots to delete

    // Pick an interior CURVE knot (value strictly inside the domain) and delete it.
    const lo = curveOf(id).knots[curveOf(id).degree]
    const hi = curveOf(id).knots[curveOf(id).knots.length - curveOf(id).degree - 1]
    const idx = curveOf(id).knots.findIndex((k) => k > lo + 1e-9 && k < hi - 1e-9)
    expect(idx).toBeGreaterThanOrEqual(0)

    useSceneStore.getState().removeKnotFromCurve(id, idx)

    expect(genInteriorCount(id)).toBe(gen0 - 1) // exactly one generator knot gone
    expect(isFiniteCurve(id)).toBe(true)
    // Still a valid, evaluable curve.
    const p = evaluateCurve(curveOf(id), 0.5)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
  })

  it('removes an interior generator knot for a closed PH curve (stays closed)', () => {
    const pts: Point2D[] = []
    for (let i = 0; i < 12; i++) { const a = (2 * Math.PI * i) / 12; pts.push({ x: 150 * Math.cos(a), y: 100 * Math.sin(a) }) }
    const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
    const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
    const id = 'closed-ph'
    const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
    useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, selectedKnotIndex: null })

    const gen0 = genInteriorCount(id)
    expect(gen0).toBeGreaterThan(1)
    // Delete an interior curve knot (value strictly inside (0,1)).
    const idx = curveOf(id).knots.findIndex((k) => k > 1e-9 && k < 1 - 1e-9)
    expect(idx).toBeGreaterThanOrEqual(0)

    useSceneStore.getState().removeKnotFromCurve(id, idx)

    expect(genInteriorCount(id)).toBe(gen0 - 1)
    expect(isFiniteCurve(id)).toBe(true)
    const a = evaluateCurve(curveOf(id), 0), b = evaluateCurve(curveOf(id), 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6) // still closed
  })
})
