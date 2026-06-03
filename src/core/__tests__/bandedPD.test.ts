import { describe, it, expect } from 'vitest'
import { PlanarCurvatureProblem, PrimalDualOptimizer, BandedPrimalDualOptimizer, curvatureExtremaNumeratorPlanar } from '../index'

// The banded primal-dual factors the AUGMENTED (quasi-definite) KKT banded —
// the same matrix and Mehrotra step as the dense solver, just structure-
// exploiting. So it must produce the SAME iterate as the dense primal-dual to
// numerical precision, while preserving the curvature-extrema bound.

const degree = 3
function clampedKnots(n: number) {
  const k: number[] = []
  for (let i = 0; i <= degree; i++) k.push(0)
  const internal = n - degree - 1
  for (let i = 1; i <= internal; i++) k.push(i / (internal + 1))
  for (let i = 0; i <= degree; i++) k.push(1)
  return k
}
const sc = (x: number[], y: number[], knots: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

const cases = [
  { name: 'wavy 9', x: Array.from({ length: 9 }, (_, i) => i * 50), y: Array.from({ length: 9 }, (_, i) => 120 * Math.sin(i * 1.1)) },
  { name: 'arc 7', x: [262, -104, -277, -508, -320, 10, 260], y: [119, 128, 141, 57, -195, -190, -55] },
  { name: 'wavy 20', x: Array.from({ length: 20 }, (_, i) => i * 35), y: Array.from({ length: 20 }, (_, i) => 100 * Math.sin(i * 0.8)) },
]

describe('banded primal-dual ≡ dense primal-dual (augmented, quasi-definite)', () => {
  for (const c of cases) {
    const knots = clampedKnots(c.x.length)
    const before = sc(c.x, c.y, knots)
    const idx = 3
    const tx = c.x[idx] + 80
    const ty = c.y[idx] - 60
    const run = (Opt: typeof PrimalDualOptimizer | typeof BandedPrimalDualOptimizer, iters: number) => {
      const prob = new PlanarCurvatureProblem(c.x, c.y, knots, degree, idx, tx, ty, { dragWeight: 25 })
      const opt = new Opt(prob, { maxIterations: iters, returnBestFeasible: true })
      const r = opt.optimize()
      prob.setVariables(r.variables)
      return { x: prob.cpX.slice(), y: prob.cpY.slice() }
    }
    const diff = (a: { x: number[]; y: number[] }, b: { x: number[]; y: number[] }) => {
      let e = 0
      for (let i = 0; i < a.x.length; i++) e = Math.max(e, Math.abs(a.x[i] - b.x[i]), Math.abs(a.y[i] - b.y[i]))
      return e
    }

    it(`${c.name}: one step is bit-identical to dense PD (≤1e-9)`, () => {
      expect(diff(run(PrimalDualOptimizer, 1), run(BandedPrimalDualOptimizer, 1))).toBeLessThan(1e-9)
    })

    it(`${c.name}: full solve matches dense to float precision (≤1e-3)`, () => {
      // Same K and step as dense; the tiny residual is float amplification over
      // 60 iterations near the non-convex manifold (was ~55 with normal equations).
      expect(diff(run(PrimalDualOptimizer, 60), run(BandedPrimalDualOptimizer, 60))).toBeLessThan(1e-3)
    })

    it(`${c.name}: preserves the bound`, () => {
      const band = run(BandedPrimalDualOptimizer, 60)
      expect(sc(band.x, band.y, knots)).toBeLessThanOrEqual(before)
    })
  }
})
