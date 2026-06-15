import { describe, it, expect } from 'vitest'
import { defaultPH3D, ph3dPMaxCoeffs } from './ph3dCurve'
import { Spatial3DPHCurveProblem } from './ph3dProblem'

function fdGradient(f: () => number, get: () => number[], set: (x: number[]) => void): number[] {
  const x = get()
  const g = new Array(x.length).fill(0)
  for (let j = 0; j < x.length; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]))
    const xp = [...x]; xp[j] = x[j] + h; set(xp); const fp = f()
    const xm = [...x]; xm[j] = x[j] - h; set(xm); const fm = f()
    set(x)
    g[j] = (fp - fm) / (2 * h)
  }
  return g
}

function fdJacobian(f: () => number[], get: () => number[], set: (x: number[]) => void): number[][] {
  const x = get()
  const c0 = f()
  const J = c0.map(() => new Array(x.length).fill(0))
  for (let j = 0; j < x.length; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]))
    const xp = [...x]; xp[j] = x[j] + h; set(xp); const cp = f()
    const xm = [...x]; xm[j] = x[j] - h; set(xm); const cm = f()
    set(x)
    for (let i = 0; i < c0.length; i++) J[i][j] = (cp[i] - cm[i]) / (2 * h)
  }
  return J
}

const relClose = (a: number, b: number, rel = 3e-3, abs = 1e-4) =>
  Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b))

describe('analytic 3D PH gradients match finite differences', () => {
  const s = defaultPH3D()
  const target = { x: 0.4, y: 0.6, z: -0.3 }
  const dragIndex = 3

  it('objective gradient (no bound)', () => {
    const p = new Spatial3DPHCurveProblem(s, dragIndex, target)
    const analytic = p.computeObjectiveGradient()
    const fd = fdGradient(() => p.computeObjective(), () => p.getVariables(), (x) => p.setVariables(x))
    analytic.forEach((a, i) => expect(relClose(a, fd[i]), `grad[${i}] ${a} vs ${fd[i]}`).toBe(true))
  })

  it('P_max constraint Jacobian', () => {
    const kappaMax = 2.0
    const p = new Spatial3DPHCurveProblem(s, dragIndex, target, { constrained: true, kappaMax, subdivisions: 2 })
    const analytic = p.computeConstraintJacobian()
    const fd = fdJacobian(() => p.computeConstraints(), () => p.getVariables(), (x) => p.setVariables(x))
    expect(analytic.length).toBe(fd.length)
    for (let i = 0; i < analytic.length; i++)
      for (let j = 0; j < analytic[i].length; j++)
        expect(relClose(analytic[i][j], fd[i][j], 6e-3, 1e-2), `J[${i}][${j}] ${analytic[i][j]} vs ${fd[i][j]}`).toBe(true)
  })

  it('objective gradient with curvature penalty (snap mode)', () => {
    const kappaMax = 1.0 // tight → violating → penalty active
    expect(Math.min(...ph3dPMaxCoeffs(s.a0, s.a1, s.a2, kappaMax, 2))).toBeLessThan(0)
    const p = new Spatial3DPHCurveProblem(s, dragIndex, target, { enforce: true, kappaMax, subdivisions: 2, penaltyWeight: 3 })
    const analytic = p.computeObjectiveGradient()
    const fd = fdGradient(() => p.computeObjective(), () => p.getVariables(), (x) => p.setVariables(x))
    analytic.forEach((a, i) => expect(relClose(a, fd[i], 6e-3, 1e-1), `grad[${i}] ${a} vs ${fd[i]}`).toBe(true))
  })
})
