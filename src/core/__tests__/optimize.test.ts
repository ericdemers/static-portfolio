import { describe, it, expect } from 'vitest'
import type { Matrix } from '../linalg'
import type { OptimizationProblem } from '../optimize'
import {
  PrimalDualOptimizer,
  clampedUniformKnots,
  curvatureExtremaNumeratorPlanar,
  slideCurve,
} from '../index'

// A tiny QP with a known active-constraint solution:
//   min ½‖x − (3,4)‖²  s.t.  x₀ ≤ 1   →   x* = (1, 4)
class BoxQP implements OptimizationProblem {
  x = [0, 0]
  readonly numEqualityConstraints = 0
  get numVariables() {
    return 2
  }
  getVariables() {
    return [...this.x]
  }
  setVariables(v: number[]) {
    this.x = [...v]
  }
  computeObjective() {
    return 0.5 * ((this.x[0] - 3) ** 2 + (this.x[1] - 4) ** 2)
  }
  computeObjectiveGradient() {
    return [this.x[0] - 3, this.x[1] - 4]
  }
  computeObjectiveHessian(): Matrix {
    return [
      [1, 0],
      [0, 1],
    ]
  }
  get numConstraints() {
    return 1
  }
  computeConstraints() {
    return [this.x[0] - 1] // c < 0 feasible ⇒ x₀ < 1
  }
  computeConstraintJacobian(): Matrix {
    return [[1, 0]]
  }
  getConstraintSigns() {
    return [1] // c₀ starts negative ⇒ +1
  }
  getInactiveConstraints() {
    return new Set<number>()
  }
  updateConstraintState() {}
}

describe('PrimalDualOptimizer', () => {
  it('solves a QP with an active inequality to the known optimum', () => {
    const p = new BoxQP()
    const res = new PrimalDualOptimizer(p, { maxIterations: 200, tol: 1e-9 }).optimize()
    expect(res.converged).toBe(true)
    expect(Math.abs(res.variables[0] - 1)).toBeLessThan(1e-5)
    expect(Math.abs(res.variables[1] - 4)).toBeLessThan(1e-5)
    expect(res.constraintViolation).toBeLessThan(1e-6)
  })
})

describe('curvature sliding mechanism', () => {
  const degree = 3
  const cpX = [70, 210, 350, 500, 650, 790]
  const cpY = [300, 70, 300, 80, 300, 150]
  const knots = clampedUniformKnots(cpX.length, degree)
  const boundOf = (x: number[], y: number[]) =>
    curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

  it('keeps the curvature-extrema bound non-increasing while following the drag', () => {
    const before = boundOf(cpX, cpY)
    const tx = 420
    const ty = 250
    const { x, y } = slideCurve(cpX, cpY, knots, degree, 3, tx, ty)
    const after = boundOf(x, y)
    expect(after).toBeLessThanOrEqual(before)

    // the dragged point moved toward its target
    const distBefore = Math.hypot(cpX[3] - tx, cpY[3] - ty)
    const distAfter = Math.hypot(x[3] - tx, y[3] - ty)
    expect(distAfter).toBeLessThan(distBefore)
  })

  it('rigid mode (no sliding) preserves the exact sign pattern of g', () => {
    const before = boundOf(cpX, cpY)
    const { x, y } = slideCurve(cpX, cpY, knots, degree, 3, 430, 240, { disableSliding: true })
    expect(boundOf(x, y)).toBe(before) // every g coefficient kept its sign
  })
})
