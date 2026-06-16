import { describe, it, expect } from 'vitest'
import { useSceneStore } from './sceneStore'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
import type { Curve, Point2D, PHMetadataAny } from '../types/curve'

// Inject a closed polynomial PH curve at a chosen seam continuity (0=C⁰ corner,
// 1=C¹, 2=C² smooth). The generator is a PERIODIC quadratic spline whose seam is
// an ordinary knot of multiplicity (degree+1) − seamContinuity.
function injectClosedPH(seamContinuity = 2): { id: string; gKnots: number[] } {
  const pts: Point2D[] = []
  for (let i = 0; i < 16; i++) { const a = (2 * Math.PI * i) / 16; pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) }) }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots, { seamContinuity })!
  const id = 'closed-ph'
  const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, draggedGenKnot: null, draggedGenSlot: null, selectedKnotIndex: null })
  return { id, gKnots: ph.metadata.uvKnots }
}

const meta = (id: string) => useSceneStore.getState().phMetadata.get(id) as Extract<PHMetadataAny, { kind: 'polynomial' }>
const curveOf = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!
const isFiniteCurve = (id: string) => curveOf(id).controlPoints.every((p) => Number.isFinite((p as Point2D).x) && Number.isFinite((p as Point2D).y))
const isClosedCurve = (id: string) => { const c = curveOf(id); const a = evaluateCurve(c, 0), b = evaluateCurve(c, 1); return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 }
const curveMultAt = (id: string, v: number) => curveOf(id).knots.filter((k) => Math.abs(k - v) < 1e-9).length
const genMultAt = (id: string, v: number) => meta(id).uvKnots.filter((k) => Math.abs(k - v) < 1e-6).length
const firstInteriorGen = (id: string) => meta(id).uvKnots.filter((k) => k > 1e-9 && k < 1 - 1e-9).sort((a, b) => a - b)[0]
// Select the (first) curve knot at the seam value 0, resetting the drag.
const grabSeam = (id: string) => { const i = curveOf(id).knots.findIndex((k) => Math.abs(k) < 1e-9); useSceneStore.getState().selectKnot(i); return i }
const move = (id: string, val: number) => useSceneStore.getState().moveKnotAtCurve(id, useSceneStore.getState().selectedKnotIndex ?? 0, val)

describe('closed PH seam = ordinary periodic knot', () => {
  it('pulling a seam knot off the seam raises continuity (C⁰→C¹→C²)', () => {
    const { id } = injectClosedPH(0) // start a C⁰ corner: seam = generator mult 3
    expect(meta(id).seamContinuity).toBe(0)
    expect(curveMultAt(id, 0)).toBe(5) // curve seam mult = degree − C = 5

    // Pull ONE seam knot inward — plain knot motion, no gesture. It can move into
    // the gap before the first interior knot (clamped to its slot, never crossing).
    grabSeam(id)
    const v1 = firstInteriorGen(id) * 0.5
    move(id, v1)
    expect(meta(id).seamContinuity).toBe(1) // seam dropped to generator mult 2
    expect(curveMultAt(id, 0)).toBe(4)      // C¹ seam
    expect(genMultAt(id, v1)).toBe(1)       // the pulled knot landed inside (a C² triple)
    expect(curveMultAt(id, v1)).toBe(3)
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)

    // Pull a second seam knot off → C².
    grabSeam(id)
    const v2 = firstInteriorGen(id) * 0.5
    move(id, v2)
    expect(meta(id).seamContinuity).toBe(2)
    expect(curveMultAt(id, 0)).toBe(3) // fully smooth seam, just a triple like any join
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)
  })

  it('pushing an interior knot onto the seam lowers continuity (C²→C¹→C⁰)', () => {
    const { id } = injectClosedPH(2) // start smooth: seam = generator mult 1
    expect(meta(id).seamContinuity).toBe(2)
    expect(curveMultAt(id, 0)).toBe(3)

    // Grab the FIRST interior curve knot and shove it toward the seam (its slot's
    // low neighbour IS the seam, so it merges in).
    const interior = [...new Set(curveOf(id).knots.filter((k) => k > 1e-9 && k < 1 - 1e-9))].sort((a, b) => a - b)
    const vi = interior[0]
    const idx = curveOf(id).knots.findIndex((k) => Math.abs(k - vi) < 1e-9)
    useSceneStore.getState().selectKnot(idx)
    move(id, 0) // snaps onto the seam
    expect(meta(id).seamContinuity).toBe(1) // seam grew to generator mult 2 → C¹
    expect(curveMultAt(id, 0)).toBe(4)
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)
  })

  it('colliding then separating two interior knots thickens ONLY that join', () => {
    const { id } = injectClosedPH(2)
    const interior = [...new Set(curveOf(id).knots.filter((k) => k > 1e-9 && k < 1 - 1e-9))].sort((a, b) => a - b)
    const v0 = interior[0], vRight = interior[1]
    const idx = curveOf(id).knots.findIndex((k) => Math.abs(k - v0) < 1e-9)
    useSceneStore.getState().selectKnot(idx)

    // Frame 1: small interior move — the drag pins this knot to its slot.
    move(id, (v0 + vRight) / 2)
    expect(useSceneStore.getState().draggedGenSlot).not.toBeNull()
    expect(isFiniteCurve(id)).toBe(true)

    // Frame 2: try to drag PAST the right neighbour — it clamps to a collision,
    // never crossing.
    move(id, vRight + 0.2)
    expect(genMultAt(id, vRight)).toBe(2) // merged generator knot → mult 2
    expect(curveMultAt(id, vRight)).toBe(4) // curve C¹ there (mult 2 + 2)
    expect(genMultAt(id, interior[2])).toBe(1) // the knot beyond was NOT crossed/pushed
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)

    // Frame 3: SEPARATE back — the dragged knot returns, the neighbour stays put.
    move(id, v0)
    expect(genMultAt(id, v0)).toBe(1)
    expect(genMultAt(id, vRight)).toBe(1) // neighbour unmoved, back to single
    expect(meta(id).seamContinuity).toBe(2) // seam untouched by interior editing
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)
  })

  it('slamming a knot to the boundary never degenerates (seam capped at degree+1)', () => {
    const { id } = injectClosedPH(0) // C⁰: seam already a full mult-3 stack
    const interior = [...new Set(curveOf(id).knots.filter((k) => k > 1e-9 && k < 1 - 1e-9))].sort((a, b) => a - b)
    const idx = curveOf(id).knots.findIndex((k) => Math.abs(k - interior[0]) < 1e-9)
    useSceneStore.getState().selectKnot(idx)
    move(id, 0.999) // try to pile onto an already-full seam
    move(id, 2.0)
    move(id, 1.0)

    // No generator knot exceeds degree+1 multiplicity.
    let maxMult = 0
    for (const v of new Set(meta(id).uvKnots)) maxMult = Math.max(maxMult, genMultAt(id, v))
    expect(maxMult).toBeLessThanOrEqual(meta(id).uvDegree + 1)
    expect(meta(id).seamContinuity).toBeGreaterThanOrEqual(0)
    expect(isFiniteCurve(id)).toBe(true)
    expect(isClosedCurve(id)).toBe(true)
  })
})
