import { describe, it, expect } from 'vitest'
import type { WeightedPoint2D, ComplexPoint } from '../types'
import {
  evaluate,
  rationalCoeffs,
  complexCoeffs,
  curvatureExtremaNumeratorPlanar,
  curvatureExtremaNumeratorRational,
  curvatureExtremaNumeratorComplex,
} from '../index'

const DEG = 3
const knots = [0, 0, 0, 0, 1, 1, 1, 1] // single Bézier → smooth finite differences
const x = [0, 1, 3, 4]
const y = [0, 3, -1, 1]
const ones = [1, 1, 1, 1]
const zeros = [0, 0, 0, 0]
const ts = [0.2, 0.35, 0.5, 0.65, 0.8]

// Planar κ′ numerator from finite differences of an arbitrary planar curve evaluator.
function fdNumerator(c: (t: number) => { x: number; y: number }, t: number, h = 1e-3): number {
  const d1 = { x: (c(t + h).x - c(t - h).x) / (2 * h), y: (c(t + h).y - c(t - h).y) / (2 * h) }
  const d2 = {
    x: (c(t + h).x - 2 * c(t).x + c(t - h).x) / (h * h),
    y: (c(t + h).y - 2 * c(t).y + c(t - h).y) / (h * h),
  }
  const d3 = {
    x: (c(t + 2 * h).x - 2 * c(t + h).x + 2 * c(t - h).x - c(t - 2 * h).x) / (2 * h ** 3),
    y: (c(t + 2 * h).y - 2 * c(t + h).y + 2 * c(t - h).y - c(t - 2 * h).y) / (2 * h ** 3),
  }
  return (
    (d1.x * d1.x + d1.y * d1.y) * (d1.x * d3.y - d1.y * d3.x) -
    3 * (d1.x * d2.x + d1.y * d2.y) * (d1.x * d2.y - d1.y * d2.x)
  )
}

describe('rational curvature numerator', () => {
  it('reduces EXACTLY to the polynomial g when all weights are 1', () => {
    const gRat = curvatureExtremaNumeratorRational(x, y, ones, knots, DEG)
    const gPoly = curvatureExtremaNumeratorPlanar(x, y, knots, DEG)
    for (const t of ts) expect(Math.abs(gRat.evaluate(t) - gPoly.evaluate(t))).toBeLessThan(1e-9)
  })

  it('matches the sign of the curve’s κ′ numerator (nontrivial weights)', () => {
    const w = [1, 2, 0.5, 3]
    const g = curvatureExtremaNumeratorRational(x, y, w, knots, DEG)
    const pts: WeightedPoint2D[] = x.map((xi, i) => ({ x: xi, y: y[i], w: w[i] }))
    const c = (t: number) => evaluate(rationalCoeffs, pts, DEG, knots, t)
    for (const t of ts) {
      const fd = fdNumerator(c, t)
      if (Math.abs(fd) > 1e-3 && Math.abs(g.evaluate(t)) > 1e-9) {
        expect(Math.sign(g.evaluate(t))).toBe(Math.sign(fd))
      }
    }
  })
})

describe('complex-rational curvature numerator', () => {
  it('reduces EXACTLY to the polynomial g when weights are 1 (real)', () => {
    const gCx = curvatureExtremaNumeratorComplex(x, y, ones, zeros, knots, DEG)
    const gPoly = curvatureExtremaNumeratorPlanar(x, y, knots, DEG)
    for (const t of ts) expect(Math.abs(gCx.evaluate(t) - gPoly.evaluate(t))).toBeLessThan(1e-9)
  })

  it('matches the sign of the curve’s κ′ numerator (nontrivial complex weights)', () => {
    const wre = [1, 0.9, 1.1, 1]
    const wim = [0, 0.3, -0.2, 0.1]
    const g = curvatureExtremaNumeratorComplex(x, y, wre, wim, knots, DEG)
    const pts: ComplexPoint[] = x.map((xi, i) => ({
      re: xi,
      im: y[i],
      w_re: wre[i],
      w_im: wim[i],
    }))
    const c = (t: number) => evaluate(complexCoeffs, pts, DEG, knots, t)
    for (const t of ts) {
      const fd = fdNumerator(c, t)
      if (Math.abs(fd) > 1e-2 && Math.abs(g.evaluate(t)) > 1e-9) {
        expect(Math.sign(g.evaluate(t))).toBe(Math.sign(fd))
      }
    }
  })
})
