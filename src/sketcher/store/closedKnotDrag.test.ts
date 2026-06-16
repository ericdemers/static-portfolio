import { describe, it, expect } from 'vitest'
import { useSceneStore } from './sceneStore'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
import type { Curve, Point2D, PHMetadataAny } from '../types/curve'

function injectClosedPH(): { id: string; gKnots: number[] } {
  const pts: Point2D[] = []
  for (let i = 0; i < 16; i++) { const a = (2 * Math.PI * i) / 16; pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) }) }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
  const id = 'closed-ph'
  const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, draggedGenKnot: null, selectedKnotIndex: null })
  return { id, gKnots: ph.metadata.uvKnots }
}

const meta = (id: string) => useSceneStore.getState().phMetadata.get(id) as Extract<PHMetadataAny, { kind: 'polynomial' }>
const curveOf = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!
const isFiniteCurve = (id: string) => curveOf(id).controlPoints.every((p) => Number.isFinite((p as Point2D).x) && Number.isFinite((p as Point2D).y))

describe('closed PH knot drag: collide then separate', () => {
  it('keeps dragging the SAME generator knot through a collision', () => {
    const { id, gKnots } = injectClosedPH()
    const g = 3 // first interior generator knot (uvKnots[3]); curve image is the triple at its value
    const v0 = gKnots[g], vRight = gKnots[g + 1]

    // Grab the interior curve knot at the generator knot's value (drag start).
    const curveIdx = curveOf(id).knots.findIndex((k) => Math.abs(k - v0) < 1e-9)
    useSceneStore.getState().selectKnot(curveIdx)
    expect(useSceneStore.getState().draggedGenKnot).toBeNull()

    const move = (val: number) => useSceneStore.getState().moveKnotAtCurve(id, useSceneStore.getState().selectedKnotIndex ?? curveIdx, val)

    // Frame 1: small move → the generator knot g is now tracked.
    move((v0 + vRight) / 2)
    expect(useSceneStore.getState().draggedGenKnot).toBe(g)
    expect(meta(id).uvKnots[g]).toBeCloseTo((v0 + vRight) / 2, 6)

    // Frame 2: COLLIDE with the right neighbour (same value).
    move(vRight)
    expect(useSceneStore.getState().draggedGenKnot).toBe(g) // still the same knot
    expect(meta(id).uvKnots[g]).toBeCloseTo(vRight, 6)
    expect(meta(id).uvKnots[g + 1]).toBeCloseTo(vRight, 6) // merged → mult 2
    expect(isFiniteCurve(id)).toBe(true)

    // Frame 3: SEPARATE back — the dragged knot moves, the neighbour stays put.
    move(v0)
    expect(useSceneStore.getState().draggedGenKnot).toBe(g)
    expect(meta(id).uvKnots[g]).toBeCloseTo(v0, 6) // dragged knot came back
    expect(meta(id).uvKnots[g + 1]).toBeCloseTo(vRight, 6) // neighbour unmoved
    expect(isFiniteCurve(id)).toBe(true)

    // Still a valid closed curve throughout.
    const c = curveOf(id)
    const a = evaluateCurve(c, 0), b = evaluateCurve(c, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6)
  })
})
