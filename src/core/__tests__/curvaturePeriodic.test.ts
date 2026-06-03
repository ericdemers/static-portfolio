import { describe, it, expect } from 'vitest'
import type { Point2D } from '../types'
import {
  evaluate,
  scalarCoeffs,
  plainCoeffs,
  decomposeToBernsteinPeriodic,
  curvatureExtremaNumeratorPlanarPeriodic,
} from '../index'

const knots = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] // periodic, n = 6
const DEG = 3
const samples = (n: number) => Array.from({ length: n }, (_, i) => i / n)

describe('periodic Bernstein decomposition', () => {
  it('reproduces a closed scalar B-spline (vs periodic Cox–de Boor)', () => {
    const coeffs = [1, -2, 3, 0, -1, 2]
    const bd = decomposeToBernsteinPeriodic(coeffs, knots, DEG)
    for (const t of samples(60)) {
      const a = bd.evaluate(t)
      const b = evaluate(scalarCoeffs, coeffs, DEG, knots, t, true)
      expect(Math.abs(a - b)).toBeLessThan(1e-9)
    }
  })
})

describe('periodic curvature numerator g', () => {
  it('matches finite differences of the closed curve’s κ′ numerator', () => {
    const hexagon: Point2D[] = [
      { x: 2, y: 0 },
      { x: 1, y: 1.7 },
      { x: -1, y: 1.7 },
      { x: -2, y: 0 },
      { x: -1, y: -1.7 },
      { x: 1, y: -1.7 },
    ]
    const x = hexagon.map((p) => p.x)
    const y = hexagon.map((p) => p.y)
    const g = curvatureExtremaNumeratorPlanarPeriodic(x, y, knots, DEG)
    const c = (t: number) => evaluate(plainCoeffs, hexagon, DEG, knots, ((t % 1) + 1) % 1, true)
    const h = 1e-3
    const d = (f: (t: number) => number, t: number) => (f(t + h) - f(t - h)) / (2 * h)
    const d2 = (f: (t: number) => number, t: number) => (f(t + h) - 2 * f(t) + f(t - h)) / (h * h)
    const d3 = (f: (t: number) => number, t: number) =>
      (f(t + 2 * h) - 2 * f(t + h) + 2 * f(t - h) - f(t - 2 * h)) / (2 * h ** 3)
    const cx = (t: number) => c(t).x
    const cy = (t: number) => c(t).y

    for (const t of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
      const x1 = d(cx, t), y1 = d(cy, t)
      const x2 = d2(cx, t), y2 = d2(cy, t)
      const x3 = d3(cx, t), y3 = d3(cy, t)
      const num =
        (x1 * x1 + y1 * y1) * (x1 * y3 - y1 * x3) - 3 * (x1 * x2 + y1 * y2) * (x1 * y2 - y1 * x2)
      const rel = Math.abs(g.evaluate(t) - num) / (1 + Math.abs(num))
      expect(rel).toBeLessThan(1e-2)
    }
  })
})
