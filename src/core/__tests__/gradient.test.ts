import { describe, it, expect } from 'vitest'
import {
  curvatureExtremaNumeratorPlanar,
  curvatureExtremaGradientPlanar,
  decomposeToBernstein,
} from '../index'

const DEG = 3
const knots = [0, 0, 0, 0, 0.5, 1, 1, 1, 1] // interior knot → locality is non-trivial
const x = [0, 1, 3, 4, 5]
const y = [0, 2, -1, 1, 0]

// g with one control-point coordinate perturbed.
const gWith = (xs: number[], ys: number[]) => curvatureExtremaNumeratorPlanar(xs, ys, knots, DEG)
const perturb = (a: readonly number[], i: number, h: number) => a.map((v, j) => (j === i ? v + h : v))

describe('exact sparse Jacobian of g', () => {
  const grad = curvatureExtremaGradientPlanar(x, y, knots, DEG)
  const n = x.length
  const h = 1e-5
  const ts = [0.15, 0.35, 0.5, 0.65, 0.85]

  it('∂g/∂xᵢ matches central finite differences', () => {
    for (let i = 0; i < n; i++) {
      const gPlus = gWith(perturb(x, i, h), y)
      const gMinus = gWith(perturb(x, i, -h), y)
      for (const t of ts) {
        const fd = (gPlus.evaluate(t) - gMinus.evaluate(t)) / (2 * h)
        const analytic = grad.dx[i].evaluate(t)
        expect(Math.abs(fd - analytic)).toBeLessThan(1e-4 * (1 + Math.abs(analytic)))
      }
    }
  })

  it('∂g/∂yᵢ matches central finite differences', () => {
    for (let i = 0; i < n; i++) {
      const gPlus = gWith(x, perturb(y, i, h))
      const gMinus = gWith(x, perturb(y, i, -h))
      for (const t of ts) {
        const fd = (gPlus.evaluate(t) - gMinus.evaluate(t)) / (2 * h)
        const analytic = grad.dy[i].evaluate(t)
        expect(Math.abs(fd - analytic)).toBeLessThan(1e-4 * (1 + Math.abs(analytic)))
      }
    }
  })

  it('each column is sparse: ∂g/∂Pᵢ vanishes outside control point i support', () => {
    for (let i = 0; i < n; i++) {
      // Support spans of basis function i.
      const e = x.map((_, j) => (j === i ? 1 : 0))
      const Ni = decomposeToBernstein(e, knots, DEG)
      for (let s = 0; s < Ni.numSpans; s++) {
        const inSupport = Ni.coeffs[s].some((c) => Math.abs(c) > 1e-14)
        if (!inSupport) {
          expect(grad.dx[i].coeffs[s].every((c) => Math.abs(c) < 1e-12)).toBe(true)
          expect(grad.dy[i].coeffs[s].every((c) => Math.abs(c) < 1e-12)).toBe(true)
        }
      }
    }
  })

  it('the primal g equals the standalone curvature numerator', () => {
    const gStandalone = curvatureExtremaNumeratorPlanar(x, y, knots, DEG)
    for (const t of ts) {
      expect(Math.abs(grad.g.evaluate(t) - gStandalone.evaluate(t))).toBeLessThan(1e-9)
    }
  })
})
