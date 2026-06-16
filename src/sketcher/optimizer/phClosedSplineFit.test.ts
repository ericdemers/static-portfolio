import { describe, it, expect } from 'vitest'
import { fitClosedPHSpline, closeOpenPHSpline } from './phClosedSplineFit'
import { fitPHSplineToBSpline } from './phSplineFit'
import { optimizePHCurve } from './index'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
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

  it('closes: first and last control points coincide', () => {
    const { cps, degree, knots } = ellipseStroke()
    const ph = fitClosedPHSpline(cps, degree, knots)!
    const p0 = ph.controlPoints[0], pN = ph.controlPoints[ph.controlPoints.length - 1]
    expect(Math.hypot(p0.x - pN.x, p0.y - pN.y)).toBeLessThan(1e-6)
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

  it('closes an open PH spline at C⁰ (first = last control point)', () => {
    const open = nearlyClosedOpenPH()
    const closed = closeOpenPHSpline(open.metadata)
    expect(closed).not.toBeNull()
    expect(closed!.metadata.closed).toBe(true)
    expect(Math.abs(closed!.metadata.wrapSign!)).toBe(1)
    const p0 = closed!.controlPoints[0], pN = closed!.controlPoints[closed!.controlPoints.length - 1]
    expect(Math.hypot(p0.x - pN.x, p0.y - pN.y)).toBeLessThan(1e-6)
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
