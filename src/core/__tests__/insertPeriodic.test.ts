import { describe, it, expect } from 'vitest'
import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types'
import type { Complex } from '../complex'
import {
  evaluate,
  insertKnotPeriodic,
  plainCoeffs,
  rationalCoeffs,
  complexCoeffs,
  realSpiralRatio,
  complexSpiralRatio,
} from '../index'

const samples = (n: number) => Array.from({ length: n }, (_, i) => i / n) // covers t=0 (seam)
const pointClose = (a: Point2D, b: Point2D, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}

// Degree-2 closed curve: 6 control points, uniform periodic knots in [0,1).
const DEG = 2
const N = 6
const knots = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
// Insertion params spanning the seam (small), interior, near-1, an existing knot.
const INSERTS = [0.05, 0.25, 0.5, 0.8, 0.95, 2 / 6]

const hexagon: Point2D[] = [
  { x: 2, y: 0 },
  { x: 1, y: 1.7 },
  { x: -1, y: 1.7 },
  { x: -2, y: 0 },
  { x: -1, y: -1.7 },
  { x: 1, y: -1.7 },
]

describe('insertKnotPeriodic — shape preservation (closed curve unchanged)', () => {
  it('plain closed curve', () => {
    for (const tBar of INSERTS) {
      const res = insertKnotPeriodic(plainCoeffs, hexagon, DEG, knots, tBar)
      expect(res.controlPoints.length).toBe(N + 1)
      expect(res.knots.length).toBe(N + 1)
      expect(res.knots.every((v) => v >= 0 && v < 1)).toBe(true)
      expect(res.knots.every((v, i) => i === 0 || v >= res.knots[i - 1])).toBe(true)
      for (const t of samples(60)) {
        pointClose(
          evaluate(plainCoeffs, res.controlPoints, DEG, res.knots, t, true),
          evaluate(plainCoeffs, hexagon, DEG, knots, t, true),
        )
      }
    }
  })

  it('rational closed curve (spiral weights, nontrivial wrapWeight)', () => {
    const cps: WeightedPoint2D[] = hexagon.map((p, i) => ({ ...p, w: [1, 1.5, 2, 1, 1.5, 2][i] }))
    const wrapWeight = 1.3
    const ratio = realSpiralRatio(wrapWeight, cps[0].w)
    for (const tBar of INSERTS) {
      const res = insertKnotPeriodic(rationalCoeffs, cps, DEG, knots, tBar, ratio)
      expect(res.controlPoints.length).toBe(N + 1)
      for (const t of samples(60)) {
        pointClose(
          evaluate(rationalCoeffs, res.controlPoints, DEG, res.knots, t, true, ratio),
          evaluate(rationalCoeffs, cps, DEG, knots, t, true, ratio),
        )
      }
    }
  })

  it('complex-rational closed curve (complex spiral, nontrivial wrapWeight)', () => {
    const cps: ComplexPoint[] = hexagon.map((p, i) => ({
      re: p.x,
      im: p.y,
      w_re: [1, 1.1, 0.9, 1, 1.1, 0.9][i],
      w_im: [0, 0.2, -0.1, 0.05, -0.15, 0.1][i],
    }))
    const wrapWeight: Complex = { re: 1.2, im: -0.3 }
    const ratio = complexSpiralRatio(wrapWeight, { re: cps[0].w_re, im: cps[0].w_im })
    for (const tBar of INSERTS) {
      const res = insertKnotPeriodic(complexCoeffs, cps, DEG, knots, tBar, ratio)
      expect(res.controlPoints.length).toBe(N + 1)
      for (const t of samples(60)) {
        pointClose(
          evaluate(complexCoeffs, res.controlPoints, DEG, res.knots, t, true, ratio),
          evaluate(complexCoeffs, cps, DEG, knots, t, true, ratio),
        )
      }
    }
  })

  it('repeated insertion stays shape-preserving (degree 3)', () => {
    const deg3 = 3
    let cps: Point2D[] = hexagon
    let ks = [...knots]
    const before = (t: number) => evaluate(plainCoeffs, hexagon, deg3, knots, t, true)
    for (const tBar of [0.1, 0.45, 0.9]) {
      const res = insertKnotPeriodic(plainCoeffs, cps, deg3, ks, tBar)
      cps = res.controlPoints
      ks = res.knots
    }
    expect(cps.length).toBe(N + 3)
    for (const t of samples(60)) {
      pointClose(evaluate(plainCoeffs, cps, deg3, ks, t, true), before(t))
    }
  })
})
