import { describe, it, expect } from 'vitest'
import { createSpiralFromTwoPoints } from './phCurve'
import { PHCurveProblem } from './PHCurveProblem'
import { phCurvatureBoundCoeffs } from './phCurvatureBound'

// Central finite-difference gradient of a scalar function of the variables.
function fdGradient(f: () => number, get: () => number[], set: (x: number[]) => void): number[] {
  const x = get()
  const g = new Array(x.length).fill(0)
  for (let j = 0; j < x.length; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(x[j]))
    const xj = x[j]
    const xp = [...x]; xp[j] = xj + h; set(xp); const fp = f()
    const xm = [...x]; xm[j] = xj - h; set(xm); const fm = f()
    set(x)
    g[j] = (fp - fm) / (2 * h)
  }
  return g
}

// Central FD Jacobian of a vector function (rows = outputs, cols = variables).
function fdJacobian(f: () => number[], get: () => number[], set: (x: number[]) => void): number[][] {
  const x = get()
  const c0 = f()
  const J = c0.map(() => new Array(x.length).fill(0))
  for (let j = 0; j < x.length; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(x[j]))
    const xj = x[j]
    const xp = [...x]; xp[j] = xj + h; set(xp); const cp = f()
    const xm = [...x]; xm[j] = xj - h; set(xm); const cm = f()
    set(x)
    for (let i = 0; i < c0.length; i++) J[i][j] = (cp[i] - cm[i]) / (2 * h)
  }
  return J
}

const relClose = (a: number, b: number, rel = 2e-3, abs = 1e-4) =>
  Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b))

describe('analytic PH gradients match finite differences', () => {
  const ph = createSpiralFromTwoPoints(-180, 60, 180, 60)
  const dragIndex = 3
  const target = { x: ph.controlPoints[dragIndex].x + 30, y: ph.controlPoints[dragIndex].y - 40 }

  it('objective gradient (no bound)', () => {
    const p = new PHCurveProblem(ph.metadata, ph.controlPoints, target.x, target.y, dragIndex)
    const analytic = p.computeObjectiveGradient()
    const fd = fdGradient(() => p.computeObjective(), () => p.getVariables(), (x) => p.setVariables(x))
    p.setVariables(p.getVariables()) // restore
    analytic.forEach((a, i) => expect(relClose(a, fd[i]), `grad[${i}] ${a} vs ${fd[i]}`).toBe(true))
  })

  it('curvature-bound constraint Jacobian', () => {
    const kappaMax = 0.006
    const p = new PHCurveProblem(ph.metadata, ph.controlPoints, target.x, target.y, dragIndex, {
      curvatureBound: kappaMax, subdivisions: 2, constrained: true,
    })
    const analytic = p.computeConstraintJacobian()
    const fd = fdJacobian(() => p.computeConstraints(), () => p.getVariables(), (x) => p.setVariables(x))
    expect(analytic.length).toBe(fd.length)
    for (let i = 0; i < analytic.length; i++)
      for (let j = 0; j < analytic[i].length; j++)
        expect(relClose(analytic[i][j], fd[i][j], 5e-3, 1e-2), `J[${i}][${j}] ${analytic[i][j]} vs ${fd[i][j]}`).toBe(true)
  })

  it('objective gradient with curvature penalty (snap mode)', () => {
    // Tight bound so the spiral violates and the penalty branch is exercised.
    const peakCoeffMin = Math.min(...phCurvatureBoundCoeffs(ph.metadata.uControlPoints, ph.metadata.vControlPoints, ph.metadata.uvKnots, 0.003, 2))
    expect(peakCoeffMin).toBeLessThan(0) // confirm infeasible → penalty active
    const p = new PHCurveProblem(ph.metadata, ph.controlPoints, target.x, target.y, dragIndex, {
      curvatureBound: 0.003, subdivisions: 2, penaltyWeight: 5,
    })
    const analytic = p.computeObjectiveGradient()
    const fd = fdGradient(() => p.computeObjective(), () => p.getVariables(), (x) => p.setVariables(x))
    p.setVariables(p.getVariables())
    analytic.forEach((a, i) => expect(relClose(a, fd[i], 5e-3, 1e-1), `grad[${i}] ${a} vs ${fd[i]}`).toBe(true))
  })
})
