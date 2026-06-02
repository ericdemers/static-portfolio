import { describe, it, expect } from 'vitest'
import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types'
import type { Complex } from '../complex'
import {
  evaluate,
  elevateDegreePeriodic,
  plainCoeffs,
  rationalCoeffs,
  complexCoeffs,
  realSpiralRatio,
  complexSpiralRatio,
} from '../index'

const samples = (n: number) => Array.from({ length: n }, (_, i) => i / n) // includes the seam
const pointClose = (a: Point2D, b: Point2D, tol = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}

const DEG = 2
const N = 6
const knots = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
const hexagon: Point2D[] = [
  { x: 2, y: 0 },
  { x: 1, y: 1.7 },
  { x: -1, y: 1.7 },
  { x: -2, y: 0 },
  { x: -1, y: -1.7 },
  { x: 1, y: -1.7 },
]

describe('elevateDegreePeriodic — shape preservation (closed curve unchanged)', () => {
  it('plain closed curve', () => {
    const res = elevateDegreePeriodic(plainCoeffs, hexagon, knots, DEG)
    expect(res.degree).toBe(DEG + 1)
    // Simple knots → each multiplicity doubles → 2N knots/control points.
    expect(res.knots.length).toBe(2 * N)
    expect(res.controlPoints.length).toBe(2 * N)
    expect(res.knots.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(res.knots.every((v, i) => i === 0 || v >= res.knots[i - 1])).toBe(true)
    for (const t of samples(72)) {
      pointClose(
        evaluate(plainCoeffs, res.controlPoints, res.degree, res.knots, t, true),
        evaluate(plainCoeffs, hexagon, DEG, knots, t, true),
      )
    }
  })

  it('rational closed curve (real spiral, nontrivial wrapWeight)', () => {
    const cps: WeightedPoint2D[] = hexagon.map((p, i) => ({ ...p, w: [1, 1.5, 2, 1, 1.5, 2][i] }))
    const ratio = realSpiralRatio(1.3, cps[0].w)
    const res = elevateDegreePeriodic(rationalCoeffs, cps, knots, DEG, ratio)
    for (const t of samples(72)) {
      pointClose(
        evaluate(rationalCoeffs, res.controlPoints, res.degree, res.knots, t, true, ratio),
        evaluate(rationalCoeffs, cps, DEG, knots, t, true, ratio),
      )
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
    const res = elevateDegreePeriodic(complexCoeffs, cps, knots, DEG, ratio)
    for (const t of samples(72)) {
      pointClose(
        evaluate(complexCoeffs, res.controlPoints, res.degree, res.knots, t, true, ratio),
        evaluate(complexCoeffs, cps, DEG, knots, t, true, ratio),
      )
    }
  })

  it('degree-3 closed curve elevates and stays shape-preserving', () => {
    const res = elevateDegreePeriodic(plainCoeffs, hexagon, knots, 3)
    expect(res.degree).toBe(4)
    for (const t of samples(72)) {
      pointClose(
        evaluate(plainCoeffs, res.controlPoints, res.degree, res.knots, t, true),
        evaluate(plainCoeffs, hexagon, 3, knots, t, true),
      )
    }
  })
})
