// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Wraps an OptimizationProblem to fix certain variables at their current values.
 *
 * Fixed variables are removed from the optimization — the optimizer only sees
 * the free variables. Gradients and Jacobians are projected to the free subspace.
 *
 * Use cases:
 * - Fix endpoint positions (CP0, CP_{n-1})
 * - Fix tangent directions (constrain CP1.x = CP0.x for vertical tangent)
 * - Any variable that should not change during optimization
 *
 * Variable layout (inner problem): [x_0..x_{n-1}, y_0..y_{n-1}]
 * A "fixed index" refers to an index in this full variable vector.
 */

import type { OptimizationProblem, Matrix } from './types'

export class FixedVariableWrapper implements OptimizationProblem {
  private readonly inner: OptimizationProblem
  private readonly fixedIndices: Set<number>
  private readonly freeToFull: number[]   // freeToFull[k] = full index of free variable k
  private readonly fixedValues: number[]  // full variable vector with fixed values

  constructor(inner: OptimizationProblem, fixedIndices: number[]) {
    this.inner = inner
    this.fixedIndices = new Set(fixedIndices)

    // Build mapping from free variable indices to full indices
    const nFull = inner.numVariables
    this.freeToFull = []
    for (let i = 0; i < nFull; i++) {
      if (!this.fixedIndices.has(i)) {
        this.freeToFull.push(i)
      }
    }

    // Snapshot fixed values
    this.fixedValues = inner.getVariables()
  }

  get numVariables(): number {
    return this.freeToFull.length
  }

  get numConstraints(): number {
    return this.inner.numConstraints
  }

  get numEqualityConstraints(): number {
    return this.inner.numEqualityConstraints
  }

  getVariables(): number[] {
    const full = this.inner.getVariables()
    return this.freeToFull.map((i) => full[i])
  }

  setVariables(x: number[]): void {
    this.inner.setVariables(this.expandToFull(x))
  }

  /** Expand free variables to full variable vector (fixed values filled in). */
  expandToFull(free: number[]): number[] {
    const full = [...this.fixedValues]
    for (let k = 0; k < free.length; k++) {
      full[this.freeToFull[k]] = free[k]
    }
    return full
  }

  computeObjective(): number {
    return this.inner.computeObjective()
  }

  computeObjectiveGradient(): number[] {
    const fullGrad = this.inner.computeObjectiveGradient()
    // Project: keep only free variable components
    return this.freeToFull.map((i) => fullGrad[i])
  }

  computeConstraints(): number[] {
    return this.inner.computeConstraints()
  }

  computeConstraintJacobian(): Matrix {
    const fullJ = this.inner.computeConstraintJacobian()
    const m = fullJ.length
    const nFree = this.freeToFull.length
    const J: number[][] = new Array(m)
    for (let i = 0; i < m; i++) {
      const row = new Array(nFree)
      for (let k = 0; k < nFree; k++) {
        row[k] = fullJ[i][this.freeToFull[k]]
      }
      J[i] = row
    }
    return J
  }

  getConstraintSigns(): number[] {
    return this.inner.getConstraintSigns()
  }

  getInactiveConstraints(): Set<number> {
    return this.inner.getInactiveConstraints()
  }

  updateConstraintState(): void {
    this.inner.updateConstraintState()
  }
}
