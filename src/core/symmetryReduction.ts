import type { Matrix } from './linalg'
import type { OptimizationProblem } from './optimize'

// ============================================================================
// Symmetry as variable reduction. The optimizer searches only the symmetric
// subspace: the free degrees of freedom are a fundamental domain of control
// points, and the full polygon is reconstructed from them by the mirror maps
// each step. So the solution is symmetric AND satisfies the hard curvature /
// inflection constraints simultaneously — no post-projection that could break
// the bound. (Cleaner and more robust than redundant symmetry equalities,
// which would make the KKT singular.)
// ============================================================================

export interface SymmetryReduction {
  numFree: number
  /** For each full variable index (2n), the free DOF it equals, or -1 if forced to 0. */
  coordDof: number[]
  /** Sign relating the full variable to its free DOF. */
  coordSign: number[]
}

/**
 * Build the reduction from per-axis mirror maps. Variables are laid out as
 * [x₀..x_{n-1}, y₀..y_{n-1}]. Relations: σx preserves x, negates y; σy negates
 * x, preserves y. A coordinate on the opposite axis is forced to 0.
 */
export function buildSymmetryReduction(
  n: number,
  mapX: number[] | null,
  mapY: number[] | null,
): SymmetryReduction {
  const coordDof = new Array<number>(2 * n).fill(-2) // -2 unassigned, -1 forced zero
  const coordSign = new Array<number>(2 * n).fill(1)
  let numFree = 0

  // isX=true → x-coords (offset 0); forced-zero when on the Y-axis (mapY[i]===i).
  // Relations: same-sign via mapX, opposite-sign via mapY.
  const assign = (isX: boolean) => {
    const off = isX ? 0 : n
    const zeroMap = isX ? mapY : mapX
    const sameMap = isX ? mapX : mapY
    const oppMap = isX ? mapY : mapX
    for (let i = 0; i < n; i++) {
      if (coordDof[off + i] !== -2) continue
      if (zeroMap && zeroMap[i] === i) {
        coordDof[off + i] = -1
        continue
      }
      const dof = numFree++
      const stack: Array<[number, number]> = [[i, 1]]
      coordDof[off + i] = dof
      coordSign[off + i] = 1
      while (stack.length) {
        const [a, sgn] = stack.pop()!
        const neighbors: Array<[number, number]> = []
        if (sameMap && sameMap[a] >= 0) neighbors.push([sameMap[a], sgn])
        if (oppMap && oppMap[a] >= 0) neighbors.push([oppMap[a], -sgn])
        for (const [b, s] of neighbors) {
          if (b === a) continue
          if (coordDof[off + b] === -2) {
            coordDof[off + b] = dof
            coordSign[off + b] = s
            stack.push([b, s])
          }
        }
      }
    }
  }
  assign(true)
  assign(false)
  return { numFree, coordDof, coordSign }
}

/** Wrap an OptimizationProblem so the optimizer works in the reduced (symmetric) space. */
export class SymmetryReducedProblem implements OptimizationProblem {
  private base: OptimizationProblem
  private red: SymmetryReduction
  readonly numEqualityConstraints: number

  constructor(base: OptimizationProblem, red: SymmetryReduction) {
    this.base = base
    this.red = red
    this.numEqualityConstraints = base.numEqualityConstraints
  }

  get numVariables(): number {
    return this.red.numFree
  }
  get numConstraints(): number {
    return this.base.numConstraints
  }

  /** Read the free DOF values (the +1 representative of each class) from the base. */
  getVariables(): number[] {
    const full = this.base.getVariables()
    const r = new Array<number>(this.red.numFree).fill(0)
    for (let f = 0; f < full.length; f++) {
      const d = this.red.coordDof[f]
      if (d >= 0 && this.red.coordSign[f] === 1) r[d] = full[f]
    }
    return r
  }
  setVariables(reduced: number[]): void {
    this.base.setVariables(this.expand(reduced))
  }
  private expand(reduced: number[]): number[] {
    const full = new Array<number>(this.red.coordDof.length).fill(0)
    for (let f = 0; f < full.length; f++) {
      const d = this.red.coordDof[f]
      full[f] = d >= 0 ? this.red.coordSign[f] * reduced[d] : 0
    }
    return full
  }
  /** Sᵀ·v : project a full-space vector (gradient / Jacobian row) to reduced space. */
  private reduceVec(v: number[]): number[] {
    const r = new Array<number>(this.red.numFree).fill(0)
    for (let f = 0; f < v.length; f++) {
      const d = this.red.coordDof[f]
      if (d >= 0) r[d] += this.red.coordSign[f] * v[f]
    }
    return r
  }

  computeObjective(): number {
    return this.base.computeObjective()
  }
  computeObjectiveGradient(): number[] {
    return this.reduceVec(this.base.computeObjectiveGradient())
  }
  computeObjectiveHessian(): Matrix {
    const N = this.red.coordDof.length
    const baseH = this.base.computeObjectiveHessian
      ? this.base.computeObjectiveHessian()
      : Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)))
    const nf = this.red.numFree
    // SᵀHS
    const HS = Array.from({ length: N }, () => new Array<number>(nf).fill(0))
    for (let i = 0; i < N; i++) {
      for (let f = 0; f < N; f++) {
        const d = this.red.coordDof[f]
        if (d >= 0) HS[i][d] += baseH[i][f] * this.red.coordSign[f]
      }
    }
    const out = Array.from({ length: nf }, () => new Array<number>(nf).fill(0))
    for (let a = 0; a < N; a++) {
      const da = this.red.coordDof[a]
      if (da < 0) continue
      const sa = this.red.coordSign[a]
      for (let d = 0; d < nf; d++) out[da][d] += sa * HS[a][d]
    }
    return out
  }

  computeConstraints(): number[] {
    return this.base.computeConstraints()
  }
  computeConstraintJacobian(): Matrix {
    return this.base.computeConstraintJacobian().map((row) => this.reduceVec(row))
  }
  getConstraintSigns(): number[] {
    return this.base.getConstraintSigns()
  }
  getInactiveConstraints(): Set<number> {
    return this.base.getInactiveConstraints()
  }
  updateConstraintState(): void {
    this.base.updateConstraintState()
  }
}
