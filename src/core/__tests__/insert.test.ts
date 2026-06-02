import { describe, it, expect } from 'vitest'
import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types'
import {
  evaluate,
  insertKnotOpen,
  plainCoeffs,
  rationalCoeffs,
  complexCoeffs,
  type BSplineFunction,
  evalFunction,
  insertKnotFunction,
} from '../index'

const samples = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n)
const pointClose = (a: Point2D, b: Point2D, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}

// Degree-3 clamped knot vector with two interior knots → 6 control points.
const DEG = 3
const knots = [0, 0, 0, 0, 0.3, 0.7, 1, 1, 1, 1]
const knotsAreSorted = (ks: number[]) => ks.every((k, i) => i === 0 || k >= ks[i - 1])

// Insertion at: a fresh interior value, a value inside another span, and a
// value equal to an existing knot (multiplicity bump). All must be shape-
// preserving — the defining property of knot insertion.
const INSERTS = [0.5, 0.85, 0.3]

describe('insertKnotOpen — shape preservation (the curve does not change)', () => {
  it('plain curve', () => {
    const cps: Point2D[] = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: -1 },
      { x: 3, y: 2 },
      { x: 4, y: 0 },
      { x: 5, y: 1 },
    ]
    for (const tBar of INSERTS) {
      const res = insertKnotOpen(plainCoeffs, cps, DEG, knots, tBar)
      expect(res.controlPoints.length).toBe(cps.length + 1)
      expect(res.knots.length).toBe(knots.length + 1)
      expect(knotsAreSorted(res.knots)).toBe(true)
      for (const t of samples(40)) {
        pointClose(
          evaluate(plainCoeffs, res.controlPoints, DEG, res.knots, t),
          evaluate(plainCoeffs, cps, DEG, knots, t),
        )
      }
    }
  })

  it('rational curve (blended in homogeneous space)', () => {
    const cps: WeightedPoint2D[] = [
      { x: 0, y: 0, w: 1 },
      { x: 1, y: 2, w: 2 },
      { x: 2, y: -1, w: 0.5 },
      { x: 3, y: 2, w: 3 },
      { x: 4, y: 0, w: 1 },
      { x: 5, y: 1, w: 1.5 },
    ]
    for (const tBar of INSERTS) {
      const res = insertKnotOpen(rationalCoeffs, cps, DEG, knots, tBar)
      expect(res.controlPoints.length).toBe(cps.length + 1)
      for (const t of samples(40)) {
        pointClose(
          evaluate(rationalCoeffs, res.controlPoints, DEG, res.knots, t),
          evaluate(rationalCoeffs, cps, DEG, knots, t),
        )
      }
    }
  })

  it('complex-rational curve (blended in homogeneous space)', () => {
    const cps: ComplexPoint[] = [
      { re: 0, im: 0, w_re: 1, w_im: 0 },
      { re: 1, im: 2, w_re: 0.9, w_im: 0.2 },
      { re: 2, im: -1, w_re: 1.1, w_im: -0.1 },
      { re: 3, im: 2, w_re: 1, w_im: 0.3 },
      { re: 4, im: 0, w_re: 0.8, w_im: 0 },
      { re: 5, im: 1, w_re: 1.2, w_im: -0.2 },
    ]
    for (const tBar of INSERTS) {
      const res = insertKnotOpen(complexCoeffs, cps, DEG, knots, tBar)
      expect(res.controlPoints.length).toBe(cps.length + 1)
      for (const t of samples(40)) {
        pointClose(
          evaluate(complexCoeffs, res.controlPoints, DEG, res.knots, t),
          evaluate(complexCoeffs, cps, DEG, knots, t),
        )
      }
    }
  })

  it('scalar function', () => {
    const f: BSplineFunction = {
      degree: DEG,
      knots: [...knots],
      coeffs: [1, -2, 3, 0, -1, 2],
      closed: false,
    }
    for (const tBar of INSERTS) {
      const g = insertKnotFunction(f, tBar)
      expect(g.coeffs.length).toBe(f.coeffs.length + 1)
      for (const t of samples(40)) {
        expect(Math.abs(evalFunction(g, t) - evalFunction(f, t))).toBeLessThan(1e-9)
      }
    }
  })

  it('inserting at the de Boor / Bézier midpoint matches the analytic blend', () => {
    // Degree-3 single Bézier segment; inserting t=0.5 yields midpoint blends.
    const bz = [0, 0, 0, 0, 1, 1, 1, 1]
    const cps = [0, 4, 4, 0].map((y, i) => ({ x: i, y }))
    const res = insertKnotOpen(plainCoeffs, cps, 3, bz, 0.5)
    // Q1 = (P0+P1)/2, Q2 = (P1+P2)/2, Q3 = (P2+P3)/2; ends unchanged.
    pointClose(res.controlPoints[1], { x: 0.5, y: 2 })
    pointClose(res.controlPoints[2], { x: 1.5, y: 4 })
    pointClose(res.controlPoints[3], { x: 2.5, y: 2 })
    pointClose(res.controlPoints[0], { x: 0, y: 0 })
    pointClose(res.controlPoints[4], { x: 3, y: 0 })
  })
})
