import { describe, it, expect } from 'vitest'
import { abPHToLieCurveSpline, lieCurveHomogeneous, compose5, scaling5, translation5, rotation5 } from './lieCurve2D'
import { SHAPE_GENERATORS, liePoint5 } from './lieAlgebra2D'
import type { ABPHMetadata } from '../../optimizer/abPHCurve'
import { fitPHSplineToBSpline } from '../../optimizer/phSplineFit'
import { createBSpline } from '../../utils/bspline/utilities'
import { evaluateCurve } from '../../utils/bspline/core'
import type { Curve, Point2D } from '../../types/curve'

// Lift a polynomial PH spline (fit from a stroke) into AB with denominator ≡ 1.
function liftWavyPHSpline(): { meta: ABPHMetadata; breaks: number[] } {
  const pts: Point2D[] = []
  for (let i = 0; i <= 12; i++) pts.push({ x: i * 25, y: 50 * Math.sin((i / 12) * 2 * Math.PI) })
  const bs = createBSpline(pts, 3) as { controlPoints: Point2D[]; knots: number[] }
  const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!
  const m = ph.metadata
  const cps = ph.controlPoints
  const meta: ABPHMetadata = {
    kind: 'ab-complex-rational',
    degree: ph.degree,
    aReCPs: cps.map((p) => p.x),
    aImCPs: cps.map((p) => p.y),
    bReCPs: cps.map(() => 1),
    bImCPs: cps.map(() => 0),
    sReCPs: m.uControlPoints, sImCPs: m.vControlPoints,
    knots: ph.knots, sKnots: m.uvKnots,
  }
  const breaks = [...new Set(ph.knots)]
  return { meta, breaks }
}

// Relative GEOMETRIC error (one-sided Hausdorff) between the assembled rational
// B-spline and the EXACT transformed curve. We compare shape, not parameter:
// per-span weight normalization is a harmless parameter Möbius (same trace,
// different speed), so a point-wise same-t comparison would penalize the
// reparametrization rather than the geometry the user actually sees.
function maxGeomErr(meta: ABPHMetadata, M: number[][]): number {
  const res = abPHToLieCurveSpline(meta, M)
  const curve: Curve = { id: 't', kind: 'rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false }
  const h = lieCurveHomogeneous(meta, M)
  const exact: Point2D[] = []
  let scale = 1
  for (let k = 0; k <= 2000; k++) {
    const t = k / 2000, w = h.W.evaluate(t)
    const p = { x: h.X.evaluate(t) / w, y: h.Y.evaluate(t) / w }
    exact.push(p)
    scale = Math.max(scale, Math.abs(p.x), Math.abs(p.y))
  }
  const lo = res.knots[res.degree], hi = res.knots[res.controlPoints.length]
  let err = 0
  for (let k = 0; k <= 400; k++) {
    const got = evaluateCurve(curve, lo + ((hi - lo) * k) / 400)
    let best = Infinity
    for (const e of exact) best = Math.min(best, Math.hypot(e.x - got.x, e.y - got.y))
    err = Math.max(err, best)
  }
  return err / scale
}

describe('abPHToLieCurveSpline (multi-segment Lie generate)', () => {
  it('emits a multi-segment rational B-spline (keeps the input segmentation)', () => {
    const { meta, breaks } = liftWavyPHSpline()
    const M = compose5(translation5(15, -10), scaling5(1.3))
    const res = abPHToLieCurveSpline(meta, M)
    const distinct = new Set(res.knots).size - 1
    expect(distinct).toBe(breaks.length - 1) // one output span per input span
    expect(res.controlPoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w))).toBe(true)
  })

  it('reproduces a similarity transform of the spline exactly', () => {
    const { meta } = liftWavyPHSpline()
    const M = compose5(translation5(40, -20), rotation5(0.6), scaling5(1.4))
    expect(maxGeomErr(meta, M)).toBeLessThan(1e-3)
  })

  it('reproduces a Laguerre offset of the spline (rational image)', () => {
    const { meta } = liftWavyPHSpline()
    const offsetIdx = SHAPE_GENERATORS.findIndex((g) => g.key === 'offset')
    const coeffs = new Array(SHAPE_GENERATORS.length).fill(0)
    coeffs[offsetIdx] = 0.25
    const M = liePoint5(coeffs)
    expect(maxGeomErr(meta, M)).toBeLessThan(1e-3)
  })

  it('reproduces an inversive (Möbius) bend of the spline', () => {
    const { meta } = liftWavyPHSpline()
    const idx = SHAPE_GENERATORS.findIndex((g) => g.key === 'sct-x')
    const coeffs = new Array(SHAPE_GENERATORS.length).fill(0)
    coeffs[idx] = 0.12
    // Conjugate by the curve's normalize/denormalize similarity, exactly as the
    // app does — so the inversive generator acts at unit scale (a gentle bend),
    // not an extreme one driven by the raw ~300-unit coordinates.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < meta.aReCPs.length; i++) {
      minX = Math.min(minX, meta.aReCPs[i]); maxX = Math.max(maxX, meta.aReCPs[i])
      minY = Math.min(minY, meta.aImCPs[i]); maxY = Math.max(maxY, meta.aImCPs[i])
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const L = Math.max(1e-6, 0.5 * Math.hypot(maxX - minX, maxY - minY))
    const M = compose5(compose5(translation5(cx, cy), scaling5(L)), liePoint5(coeffs), compose5(scaling5(1 / L), translation5(-cx, -cy)))
    expect(maxGeomErr(meta, M)).toBeLessThan(3e-3)
  })
})
