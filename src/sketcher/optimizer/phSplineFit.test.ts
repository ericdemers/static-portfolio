import { describe, it, expect } from 'vitest'
import { fitPHSplineToBSpline } from './phSplineFit'
import { optimizePHCurve } from './index'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateBSpline } from '../utils/bspline/core'
import { computeOpenComplexCurvatureExtremaParameters } from './complexAlgebra'
import { moveKnot1D } from './phBSplineOps'
import { computePHCurveFromUV } from './phCurve'
import type { Point2D } from '../types/curve'

// A gentle S-shaped stroke (no cusps, speed bounded away from zero).
function makeStrokePoints(): Point2D[] {
  const pts: Point2D[] = []
  for (let i = 0; i <= 10; i++) {
    const x = i * 30
    const y = 60 * Math.sin((i / 10) * Math.PI)
    pts.push({ x, y })
  }
  return pts
}

// A wavy stroke (full sine period) → several curvature extrema.
function makeWavyStrokePoints(): Point2D[] {
  const pts: Point2D[] = []
  for (let i = 0; i <= 12; i++) {
    const x = i * 25
    const y = 50 * Math.sin((i / 12) * 2 * Math.PI)
    pts.push({ x, y })
  }
  return pts
}

// Count curvature extrema of a non-rational curve (homogeneous weight = 1).
function countExtrema(cps: Point2D[], knots: number[]): number {
  const Zre = cps.map((p) => p.x)
  const Zim = cps.map((p) => p.y)
  const Wre = cps.map(() => 1)
  const Wim = cps.map(() => 0)
  return computeOpenComplexCurvatureExtremaParameters(knots, Zre, Zim, Wre, Wim).length
}

describe('fitPHSplineToBSpline', () => {
  it('produces a multi-segment quintic PH curve from a freehand B-spline', () => {
    const bs = createBSpline(makeStrokePoints(), 3)
    const xs = (bs as { controlPoints: Point2D[] }).controlPoints
    const ph = fitPHSplineToBSpline(xs, bs.knots, { generatorDegree: 2 })
    expect(ph).not.toBeNull()
    expect(ph!.degree).toBe(5) // 2*genDegree + 1
    expect(ph!.metadata.kind).toBe('polynomial')
    // Generator inherits the stroke's segmentation → more than one segment.
    const distinct = new Set(ph!.knots).size - 1
    expect(distinct).toBeGreaterThan(1)
  })

  it('hugs the original stroke (hodograph match → small position error)', () => {
    const bs = createBSpline(makeStrokePoints(), 3) as {
      controlPoints: Point2D[]; degree: number; knots: number[]
    }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const lo = bs.knots[bs.degree]
    const hi = bs.knots[bs.controlPoints.length]
    let maxErr = 0
    for (let k = 0; k <= 40; k++) {
      const t = lo + ((hi - lo) * k) / 40
      const a = evaluateBSpline(bs.controlPoints, bs.degree, bs.knots, t)
      const b = evaluateBSpline(ph.controlPoints, ph.degree, ph.knots, t)
      maxErr = Math.max(maxErr, Math.hypot(a.x - b.x, a.y - b.y))
    }
    // Stroke spans ~300 units; a good hodograph match stays well within 10%.
    expect(maxErr).toBeLessThan(30)
  })

  it('survives a control-point drag (multi-segment generator optimizes)', () => {
    const bs = createBSpline(makeStrokePoints(), 3) as {
      controlPoints: Point2D[]; degree: number; knots: number[]
    }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const meta = ph.metadata
    const idx = Math.floor(ph.controlPoints.length / 2)
    const before = ph.controlPoints[idx]
    const target = { x: before.x + 40, y: before.y + 40 }
    const res = optimizePHCurve(meta, ph.controlPoints, target.x, target.y, idx)
    expect(res.iterations).toBeGreaterThan(0)
    // The dragged CP should move toward the target, not blow up.
    const after = res.curveResult.controlPoints[idx]
    const distBefore = Math.hypot(before.x - target.x, before.y - target.y)
    const distAfter = Math.hypot(after.x - target.x, after.y - target.y)
    expect(distAfter).toBeLessThan(distBefore)
  })
})

describe('PH spline curvature-extrema preservation', () => {
  it('preserves the curvature-extrema count under a drag', () => {
    const bs = createBSpline(makeWavyStrokePoints(), 3) as {
      controlPoints: Point2D[]; degree: number; knots: number[]
    }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const n0 = countExtrema(ph.controlPoints, ph.knots)
    expect(n0).toBeGreaterThanOrEqual(2) // a wavy curve really has extrema to preserve

    // Drag a mid control point with extrema preservation ON.
    const idx = Math.floor(ph.controlPoints.length / 2)
    const before = ph.controlPoints[idx]
    const target = { x: before.x + 25, y: before.y - 25 }
    const res = optimizePHCurve(ph.metadata, ph.controlPoints, target.x, target.y, idx, {
      preserveCurvatureExtrema: true,
      maxIterations: 24,
      enableBFGS: false,
    })
    expect(res.iterations).toBeGreaterThan(0)
    const n1 = countExtrema(res.curveResult.controlPoints, res.curveResult.knots)
    expect(n1).toBe(n0)
  })
})

describe('PH spline knot move (generator knot ↔ curve triple)', () => {
  it('moving a generator knot carries the curve triple together', () => {
    const bs = createBSpline(makeStrokePoints(), 3) as { controlPoints: Point2D[]; knots: number[] }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
    const meta = ph.metadata
    const gi = meta.uvDegree + 1 // first interior generator knot
    const oldVal = meta.uvKnots[gi]
    expect(oldVal).toBeGreaterThan(0)
    expect(oldVal).toBeLessThan(1)
    // In the curve this generator knot appears as a triple (degree 5, C²).
    expect(ph.knots.filter((k) => Math.abs(k - oldVal) < 1e-9).length).toBe(3)

    // Move the generator knot toward its right neighbour.
    const newVal = (oldVal + meta.uvKnots[gi + 1]) / 2
    const moved = moveKnot1D(meta.uControlPoints, meta.uvKnots, meta.uvDegree, gi, newVal)!
    const recomputed = computePHCurveFromUV(
      meta.uControlPoints, meta.vControlPoints, moved.knots, meta.uvDegree, meta.origin.x, meta.origin.y,
    )
    // The whole triple moved to the new value — together.
    expect(recomputed.knots.filter((k) => Math.abs(k - oldVal) < 1e-9).length).toBe(0)
    expect(recomputed.knots.filter((k) => Math.abs(k - newVal) < 1e-9).length).toBe(3)
    expect(recomputed.degree).toBe(5)
    expect(recomputed.controlPoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })
})
