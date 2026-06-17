import { describe, it, expect } from 'vitest'
import { useSceneStore } from './sceneStore'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
import { computeClosedComplexCurvatureExtremaParameters } from '../optimizer/complexAlgebra'
import type { Curve, Point2D, PHMetadataAny } from '../types/curve'

function injectClosedPH(): string {
  // A squashed ellipse → 4 curvature vertices (extrema).
  const pts: Point2D[] = []
  for (let i = 0; i < 10; i++) { const a = (2 * Math.PI * i) / 10; pts.push({ x: 170 * Math.cos(a), y: 80 * Math.sin(a) }) }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
  const id = 'closed-ph'
  const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, preserveCurvatureExtrema: false })
  return id
}

const curveOf = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!
const isFiniteCurve = (id: string) => curveOf(id).controlPoints.every((p) => Number.isFinite((p as Point2D).x) && Number.isFinite((p as Point2D).y))
const closes = (id: string) => { const c = curveOf(id); const a = evaluateCurve(c, 0), b = evaluateCurve(c, 1); return Math.hypot(a.x - b.x, a.y - b.y) }

function extremaCount(id: string): number {
  const c = curveOf(id)
  const Zre = c.controlPoints.map((p) => (p as Point2D).x)
  const Zim = c.controlPoints.map((p) => (p as Point2D).y)
  const Wre = c.controlPoints.map(() => 1)
  const Wim = c.controlPoints.map(() => 0)
  return computeClosedComplexCurvatureExtremaParameters(c.degree, c.knots, Zre, Zim, Wre, Wim).length
}

// Nudge a control point by a fixed offset over a few ticks (like a live drag).
function nudge(id: string, idx: number, dx: number, dy: number, ticks = 3) {
  const start = { ...(curveOf(id).controlPoints[idx] as Point2D) }
  for (let k = 1; k <= ticks; k++) {
    const f = k / ticks
    useSceneStore.getState().moveControlPoint(id, idx, { x: start.x + dx * f, y: start.y + dy * f })
  }
}

describe('closed PH curvature-extrema preservation', () => {
  it('holds the extrema count through a drag and stays closed', () => {
    const id = injectClosedPH()
    const count0 = extremaCount(id)
    expect(count0).toBeGreaterThanOrEqual(4) // an ellipse has 4 vertices

    useSceneStore.getState().setPreserveCurvatureExtrema(true)
    nudge(id, 2, 28, -28)

    expect(extremaCount(id)).toBe(count0) // count preserved by the sliding constraint
    expect(isFiniteCurve(id)).toBe(true)
    // Periodic representation closes by construction; evaluate-wrap confirms it.
    expect(closes(id)).toBeLessThan(1e-6)
  })

  it('the plain (unconstrained) drag still produces a valid closed curve', () => {
    const id = injectClosedPH()
    const count0 = extremaCount(id)
    nudge(id, 2, 40, -40)
    expect(isFiniteCurve(id)).toBe(true)
    expect(closes(id)).toBeLessThan(1e-6)
    expect(count0).toBeGreaterThanOrEqual(4)
  })
})
