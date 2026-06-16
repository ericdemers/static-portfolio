import { describe, it, expect } from 'vitest'
import { fitClosedPHSpline, closeOpenPHSpline } from './phClosedSplineFit'
import { fitPHSplineToBSpline } from './phSplineFit'
import { moveKnot1D, insertKnot1D } from './phBSplineOps'
import { optimizePHCurve } from './index'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve, isPeriodicRepresentation } from '../utils/bspline/core'
import type { Curve, Point2D } from '../types/curve'

// A closed ellipse stroke (turning number 1 → anti-periodic generator, s = −1).
function ellipseStroke(): { cps: Point2D[]; degree: number; knots: number[] } {
  const pts: Point2D[] = []
  const NP = 16
  for (let i = 0; i < NP; i++) {
    const a = (2 * Math.PI * i) / NP
    pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) })
  }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  return { cps: bs.controlPoints, degree: bs.degree, knots: bs.knots }
}

function asCurve(ph: { controlPoints: Point2D[]; degree: number; knots: number[] }): Curve {
  return { id: 'c', kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
}

describe('fitClosedPHSpline', () => {
  it('produces a closed degree-5 polynomial PH spline (anti-periodic for a loop)', () => {
    const { cps, degree, knots } = ellipseStroke()
    const ph = fitClosedPHSpline(cps, degree, knots)
    expect(ph).not.toBeNull()
    expect(ph!.degree).toBe(5)
    expect(ph!.metadata.kind).toBe('polynomial')
    expect(ph!.metadata.closed).toBe(true)
    expect(Math.abs(ph!.metadata.wrapSign!)).toBe(1)
    expect(ph!.metadata.wrapSign).toBe(-1) // a simple loop has turning number 1
  })

  it('is a periodic representation that closes (eval wraps)', () => {
    const { cps, degree, knots } = ellipseStroke()
    const ph = fitClosedPHSpline(cps, degree, knots)!
    const curve = asCurve(ph)
    expect(isPeriodicRepresentation(curve)).toBe(true) // closed + knots in [0,1)
    const at0 = evaluateCurve(curve, 0), at1 = evaluateCurve(curve, 1)
    expect(Math.hypot(at0.x - at1.x, at0.y - at1.y)).toBeLessThan(1e-6)
  })

  it('is smooth at the seam (tangent matches across t=0)', () => {
    const { cps, degree, knots } = ellipseStroke()
    const ph = fitClosedPHSpline(cps, degree, knots)!
    const curve = asCurve(ph)
    const e = 1e-4
    // Tangent just after the seam vs just before it.
    const aft = evaluateCurve(curve, e), p0 = evaluateCurve(curve, 0)
    const bef = evaluateCurve(curve, 1 - e), p1 = evaluateCurve(curve, 1)
    const tAft = Math.atan2(aft.y - p0.y, aft.x - p0.x)
    const tBef = Math.atan2(p1.y - bef.y, p1.x - bef.x)
    let d = tAft - tBef
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    expect(Math.abs(d)).toBeLessThan(0.05) // tangent continuous at the seam (G¹)
  })

  it('hugs the stroke', () => {
    const { cps, degree, knots } = ellipseStroke()
    const ph = fitClosedPHSpline(cps, degree, knots)!
    const curve = asCurve(ph)
    const stroke = asCurve({ controlPoints: cps, degree, knots }) // periodic stroke
    // Build a dense polyline of the stroke (periodic eval handles closed).
    const dense: Point2D[] = []
    for (let k = 0; k <= 600; k++) dense.push(evaluateCurve(stroke, k / 600))
    let scale = 1
    for (const p of dense) scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y))
    let err = 0
    for (let k = 0; k < 200; k++) {
      const g = evaluateCurve(curve, k / 200)
      let best = Infinity
      for (const e of dense) best = Math.min(best, Math.hypot(e.x - g.x, e.y - g.y))
      err = Math.max(err, best)
    }
    expect(err / scale).toBeLessThan(0.05)
  })
})

describe('closeOpenPHSpline', () => {
  // An open PH spline whose ends nearly meet (≈340° arc) — as after dragging an
  // endpoint onto the other to close.
  function nearlyClosedOpenPH() {
    const pts: Point2D[] = []
    const NP = 14
    for (let i = 0; i < NP; i++) {
      const a = (2 * Math.PI * 0.94 * i) / (NP - 1) // sweep ~340°
      pts.push({ x: 120 * Math.cos(a), y: 120 * Math.sin(a) })
    }
    const bs = createBSpline(pts, 3) as { controlPoints: Point2D[]; knots: number[] }
    return fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
  }

  it('closes an open PH spline at C⁰ (periodic, eval wraps)', () => {
    const open = nearlyClosedOpenPH()
    const closed = closeOpenPHSpline(open.metadata)
    expect(closed).not.toBeNull()
    expect(closed!.metadata.closed).toBe(true)
    expect(closed!.metadata.seamContinuity).toBe(0)
    expect(Math.abs(closed!.metadata.wrapSign!)).toBe(1)
    const curve: Curve = { id: 'c', kind: 'bspline', degree: closed!.degree, knots: closed!.knots, controlPoints: closed!.controlPoints, closed: true }
    expect(isPeriodicRepresentation(curve)).toBe(true)
    const at0 = evaluateCurve(curve, 0), at1 = evaluateCurve(curve, 1)
    expect(Math.hypot(at0.x - at1.x, at0.y - at1.y)).toBeLessThan(1e-6)
  })

  it('is a gentle correction once the endpoint is dragged onto the start', () => {
    const open = nearlyClosedOpenPH()
    // Simulate the user dragging the last endpoint onto the first (gap → 0).
    const cps = open.controlPoints
    const last = cps.length - 1
    const res = optimizePHCurve(open.metadata, cps, cps[0].x, cps[0].y, last)
    const dragged = res.curveResult
    const draggedCurve: Curve = { id: 'd', kind: 'bspline', degree: dragged.degree, knots: dragged.knots, controlPoints: dragged.controlPoints, closed: false }

    const closed = closeOpenPHSpline(dragged.metadata)!
    const closedCurve: Curve = { id: 'c', kind: 'bspline', degree: closed.degree, knots: closed.knots, controlPoints: closed.controlPoints, closed: true }
    // With the gap closed by the drag, the closure projection barely moves the
    // curve — closed ≈ dragged-open over the interior (away from the seam).
    let err = 0, scale = 1
    for (let k = 5; k <= 95; k++) {
      const t = k / 100
      const a = evaluateCurve(draggedCurve, t), b = evaluateCurve(closedCurve, t)
      err = Math.max(err, Math.hypot(a.x - b.x, a.y - b.y))
      scale = Math.max(scale, Math.abs(a.x), Math.abs(a.y))
    }
    expect(err / scale).toBeLessThan(0.05)
  })
})

describe('closed PH seam continuity ladder', () => {
  // Magnitude of the tangent-direction jump across the seam (0 ⇒ G¹/smooth).
  function seamTangentJump(ph: { controlPoints: Point2D[]; degree: number; knots: number[] }): number {
    const curve: Curve = { id: 's', kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
    const e = 1e-4
    const p0 = evaluateCurve(curve, 0)
    const aft = evaluateCurve(curve, e)
    const bef = evaluateCurve(curve, 1 - e)
    let d = Math.atan2(aft.y - p0.y, aft.x - p0.x) - Math.atan2(p0.y - bef.y, p0.x - bef.x)
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    return Math.abs(d)
  }

  it('re-fitting C⁰→C¹→C² progressively smooths the seam (what removing a seam knot does)', () => {
    // A ~330° arc: when closed, the two end tangents differ → a real corner.
    const pts: Point2D[] = []
    const NP = 14
    for (let i = 0; i < NP; i++) {
      const a = (2 * Math.PI * 0.92 * i) / (NP - 1)
      pts.push({ x: 120 * Math.cos(a), y: 120 * Math.sin(a) })
    }
    const bs = createBSpline(pts, 3) as { controlPoints: Point2D[]; knots: number[] }
    const open = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const c0 = closeOpenPHSpline(open.metadata)!
    expect(c0.metadata.seamContinuity).toBe(0)

    const interior = new Set<string>()
    for (const k of open.metadata.uvKnots) if (k > 1e-9 && k < 1 - 1e-9) interior.add(k.toFixed(6))
    const m = interior.size + 1
    const c1 = fitClosedPHSpline(c0.controlPoints, c0.degree, c0.knots, { segments: m, seamContinuity: 1 })!
    const c2 = fitClosedPHSpline(c0.controlPoints, c0.degree, c0.knots, { segments: m, seamContinuity: 2 })!
    expect(c1.metadata.seamContinuity).toBe(1)
    expect(c2.metadata.seamContinuity).toBe(2)

    const j0 = seamTangentJump(c0), j1 = seamTangentJump(c1), j2 = seamTangentJump(c2)
    expect(j0).toBeGreaterThan(0.1) // a real corner at C⁰
    expect(j1).toBeLessThan(j0)     // C¹ closes the tangent gap
    expect(j2).toBeLessThan(0.03)   // C² seam is tangent-continuous
  })
})

describe('closed PH knot move', () => {
  function closedEllipsePH() {
    const pts: Point2D[] = []
    for (let i = 0; i < 16; i++) { const a = (2 * Math.PI * i) / 16; pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) }) }
    const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
    return fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
  }

  it('re-fits on moved generator knots, staying closed + PH', () => {
    const ph = closedEllipsePH()
    const meta = ph.metadata
    const gi = meta.uvDegree + 1 // first interior generator knot
    const oldVal = meta.uvKnots[gi]
    const newVal = (oldVal + meta.uvKnots[gi + 1]) / 2
    const moved = moveKnot1D(meta.uControlPoints, meta.uvKnots, meta.uvDegree, gi, newVal)!
    const refit = fitClosedPHSpline(ph.controlPoints, ph.degree, ph.knots, { genKnots: moved.knots, seamContinuity: 2 })!
    // generator knot relocated
    expect(refit.metadata.uvKnots.some((k) => Math.abs(k - newVal) < 1e-9)).toBe(true)
    expect(refit.metadata.uvKnots.some((k) => Math.abs(k - oldVal) < 1e-9)).toBe(false)
    expect(refit.metadata.closed).toBe(true)
    expect(refit.metadata.seamContinuity).toBe(2)
    // still closed
    const curve: Curve = { id: 'c', kind: 'bspline', degree: refit.degree, knots: refit.knots, controlPoints: refit.controlPoints, closed: true }
    expect(isPeriodicRepresentation(curve)).toBe(true)
    const a = evaluateCurve(curve, 0), b = evaluateCurve(curve, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6)
  })
})

describe('closed PH control-point drag (re-fit)', () => {
  it('moves the curve toward the dragged target and stays closed', () => {
    const pts: Point2D[] = []
    for (let i = 0; i < 16; i++) { const a = (2 * Math.PI * i) / 16; pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) }) }
    const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
    const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
    const idx = Math.floor(ph.controlPoints.length / 2)
    const before = ph.controlPoints[idx]
    const target = { x: before.x + 35, y: before.y + 35 }
    const edited = ph.controlPoints.map((p, i) => (i === idx ? { x: target.x, y: target.y } : { x: p.x, y: p.y }))
    const refit = fitClosedPHSpline(edited, ph.degree, ph.knots, { genKnots: ph.metadata.uvKnots, seamContinuity: 2 })!
    expect(refit.controlPoints.length).toBe(ph.controlPoints.length)
    const after = refit.controlPoints[idx]
    const dBefore = Math.hypot(before.x - target.x, before.y - target.y)
    const dAfter = Math.hypot(after.x - target.x, after.y - target.y)
    expect(dAfter).toBeLessThan(dBefore) // the control point follows the drag
    const curve: Curve = { id: 'c', kind: 'bspline', degree: refit.degree, knots: refit.knots, controlPoints: refit.controlPoints, closed: true }
    const a = evaluateCurve(curve, 0), b = evaluateCurve(curve, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6) // still closed
  })
})

describe('closed PH seam knot pull-out (motion → continuity)', () => {
  function tangentJump(ph: { controlPoints: Point2D[]; degree: number; knots: number[] }): number {
    const curve: Curve = { id: 's', kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
    const e = 1e-4
    const p0 = evaluateCurve(curve, 0), aft = evaluateCurve(curve, e), bef = evaluateCurve(curve, 1 - e)
    let d = Math.atan2(aft.y - p0.y, aft.x - p0.x) - Math.atan2(p0.y - bef.y, p0.x - bef.x)
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    return Math.abs(d)
  }

  it('pulling the seam knot to p raises continuity and drops a join at p', () => {
    const pts: Point2D[] = []
    const NP = 14
    for (let i = 0; i < NP; i++) { const a = (2 * Math.PI * 0.92 * i) / (NP - 1); pts.push({ x: 120 * Math.cos(a), y: 120 * Math.sin(a) }) }
    const bs = createBSpline(pts, 3) as { controlPoints: Point2D[]; knots: number[] }
    const open = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const c0 = closeOpenPHSpline(open.metadata)!
    expect(c0.metadata.seamContinuity).toBe(0)

    const p = 0.4
    const ins = insertKnot1D(c0.metadata.uControlPoints, c0.metadata.uvKnots, c0.metadata.uvDegree, p)
    const refit = fitClosedPHSpline(c0.controlPoints, c0.degree, c0.knots, { genKnots: ins.knots, seamContinuity: 1 })!

    expect(refit.metadata.seamContinuity).toBe(1) // continuity raised
    expect(refit.metadata.uvKnots.some((k) => Math.abs(k - p) < 1e-9)).toBe(true) // join dropped at p
    expect(tangentJump(refit)).toBeLessThan(tangentJump(c0)) // seam smoother
    const curve: Curve = { id: 'c', kind: 'bspline', degree: refit.degree, knots: refit.knots, controlPoints: refit.controlPoints, closed: true }
    const a = evaluateCurve(curve, 0), b = evaluateCurve(curve, 1)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6) // still closed
  })
})
