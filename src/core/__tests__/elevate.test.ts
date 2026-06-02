import { describe, it, expect } from 'vitest'
import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types'
import {
  evaluate,
  elevateDegreeOpen,
  plainCoeffs,
  rationalCoeffs,
  complexCoeffs,
  scalarCoeffs,
} from '../index'

const samples = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n)
const pointClose = (a: Point2D, b: Point2D, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}

// Degree-2 open curve WITH interior knots (exercises the general case): 5 cps.
const DEG = 2
const knots = [0, 0, 0, 0.4, 0.7, 1, 1, 1]
const pts: Point2D[] = [
  { x: 0, y: 0 },
  { x: 1, y: 2 },
  { x: 2, y: -1 },
  { x: 3, y: 1 },
  { x: 4, y: 0 },
]

describe('elevateDegreeOpen — shape preservation (curve unchanged, degree +1)', () => {
  it('plain curve (with interior knots)', () => {
    const res = elevateDegreeOpen(plainCoeffs, pts, knots, DEG)
    expect(res.degree).toBe(DEG + 1)
    // Each distinct knot multiplicity raised by 1: 0×4, 0.4×2, 0.7×2, 1×4.
    expect(res.knots.filter((k) => k === 0).length).toBe(4)
    expect(res.knots.filter((k) => k === 0.4).length).toBe(2)
    expect(res.knots.filter((k) => k === 1).length).toBe(4)
    for (const t of samples(50)) {
      pointClose(
        evaluate(plainCoeffs, res.controlPoints, res.degree, res.knots, t),
        evaluate(plainCoeffs, pts, DEG, knots, t),
      )
    }
  })

  it('rational curve (elevated in homogeneous space)', () => {
    const cps: WeightedPoint2D[] = pts.map((p, i) => ({ ...p, w: [1, 2, 0.5, 3, 1][i] }))
    const res = elevateDegreeOpen(rationalCoeffs, cps, knots, DEG)
    for (const t of samples(50)) {
      pointClose(
        evaluate(rationalCoeffs, res.controlPoints, res.degree, res.knots, t),
        evaluate(rationalCoeffs, cps, DEG, knots, t),
      )
    }
  })

  it('complex-rational curve (elevated in homogeneous space)', () => {
    const cps: ComplexPoint[] = pts.map((p, i) => ({
      re: p.x,
      im: p.y,
      w_re: [1, 0.9, 1.1, 1, 0.8][i],
      w_im: [0, 0.2, -0.1, 0.3, 0][i],
    }))
    const res = elevateDegreeOpen(complexCoeffs, cps, knots, DEG)
    for (const t of samples(50)) {
      pointClose(
        evaluate(complexCoeffs, res.controlPoints, res.degree, res.knots, t),
        evaluate(complexCoeffs, cps, DEG, knots, t),
      )
    }
  })

  it('scalar function', () => {
    const coeffs = [1, -2, 3, 0, -1]
    const res = elevateDegreeOpen(scalarCoeffs, coeffs, knots, DEG)
    for (const t of samples(50)) {
      expect(
        Math.abs(
          evaluate(scalarCoeffs, res.controlPoints, res.degree, res.knots, t) -
            evaluate(scalarCoeffs, coeffs, DEG, knots, t),
        ),
      ).toBeLessThan(1e-9)
    }
  })

  it('Bézier segment matches the closed-form elevation formula', () => {
    // Degree-2 Bézier (no interior knots). Q_i = (i/3)·P_{i-1} + (1−i/3)·P_i.
    const bz = [0, 0, 0, 1, 1, 1]
    const P: Point2D[] = [
      { x: 0, y: 0 },
      { x: 1, y: 3 },
      { x: 2, y: 0 },
    ]
    const res = elevateDegreeOpen(plainCoeffs, P, bz, 2)
    expect(res.controlPoints.length).toBe(4)
    pointClose(res.controlPoints[0], P[0])
    pointClose(res.controlPoints[1], { x: (1 / 3) * P[0].x + (2 / 3) * P[1].x, y: (1 / 3) * P[0].y + (2 / 3) * P[1].y })
    pointClose(res.controlPoints[2], { x: (2 / 3) * P[1].x + (1 / 3) * P[2].x, y: (2 / 3) * P[1].y + (1 / 3) * P[2].y })
    pointClose(res.controlPoints[3], P[2])
  })
})
