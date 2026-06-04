// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * (A, B, S) PH Curve Optimization Problem
 *
 * Implements OptimizationProblem for complex rational PH curves
 * using the (A, B, S) parameterization with equality constraints.
 *
 * Variables: [aRe[], aIm[], bRe[1:], bIm[1:], sRe[], sIm[]]
 *   - A (numerator) control points: aRe + i*aIm
 *   - B (denominator) control points: bRe + i*bIm (B₀ pinned as gauge fix)
 *   - S (generating function) control points: sRe + i*sIm
 *
 * Equality constraints: Re(A'B - AB' - S²) = 0 AND Im(A'B - AB' - S²) = 0
 *   for all Bernstein coefficients.
 *
 * Objective: Weighted Σ |A_i/B_i - target_i|²
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import type { ComplexPoint } from '../types/curve'
import {
  type ABPHMetadata,
  computeABPHCurve,
  computePHResidualCoeffs,
} from './abPHCurve'
import {
  computeGCPsFromHomogeneous,
  computeOpenComplexCurvatureConstraintState,
} from './complexAlgebra'

export class ABPHCurveProblem implements OptimizationProblem {
  private targetCPs: { re: number; im: number }[]
  private cpWeights: number[]

  private degree: number
  private knots: number[]
  private sKnots: number[]
  private nAB: number  // number of CPs for A and B
  private nS: number   // number of CPs for S

  // Current variable state
  private aReCPs: number[]
  private aImCPs: number[]
  private bReCPs: number[]
  private bImCPs: number[]
  private sReCPs: number[]
  private sImCPs: number[]

  // Pinned B₀ (gauge fix)
  private b0Re: number
  private b0Im: number

  // Cached equality constraint count
  private _numEqualityConstraints: number

  // ---- Curvature-extrema control (optional) -------------------------------
  // The AB-PH curve is z = A/B, i.e. a complex-rational curve with homogeneous
  // numerator Z = A and weight W = B. So the curvature-derivative numerator
  // g(t) is exactly the open complex-rational g of (A, B) — we reuse that
  // machinery. When enabled, we append inequality constraints s_j·g_j ≥ 0 on
  // the ACTIVE g Bernstein coefficients (the sliding mechanism) AFTER the PH
  // equalities. The sign pattern + inactive (sliding) set are snapshotted from
  // the initial A, B at construction, exactly like the closed complex-rational
  // problem.
  private constrainCurvature: boolean
  private gSigns: number[] = []          // required sign per ACTIVE g coeff
  private gActiveIndices: number[] = []  // active g-coeff indices into the full g vector

  constructor(
    metadata: ABPHMetadata,
    curveCPs: ComplexPoint[],
    targetX: number,
    targetY: number,
    dragIndex: number,
    constrainCurvatureExtrema: boolean = false,
  ) {
    this.degree = metadata.degree
    this.knots = [...metadata.knots]
    this.sKnots = [...metadata.sKnots]

    this.aReCPs = [...metadata.aReCPs]
    this.aImCPs = [...metadata.aImCPs]
    this.bReCPs = [...metadata.bReCPs]
    this.bImCPs = [...metadata.bImCPs]
    this.sReCPs = [...metadata.sReCPs]
    this.sImCPs = [...metadata.sImCPs]

    this.nAB = this.aReCPs.length
    this.nS = this.sReCPs.length

    // Pin B₀ (gauge fix)
    this.b0Re = this.bReCPs[0]
    this.b0Im = this.bImCPs[0]

    // Target CPs: copy current, move dragged one to target
    this.targetCPs = curveCPs.map(cp => ({ re: cp.re, im: cp.im }))
    this.targetCPs[dragIndex] = { re: targetX, im: targetY }

    // Weights: higher weight on dragged CP and endpoints
    const n = curveCPs.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5

    // Compute number of equality constraints from residual
    const residual = computePHResidualCoeffs(this.getMetadata())
    this._numEqualityConstraints = residual.re.length + residual.im.length

    // Snapshot the curvature-extrema sign pattern + inactive (sliding) set
    // from the INITIAL A, B. Held fixed for the whole solve (re-deriving it
    // mid-solve would let the bound drift — same lesson as the closed case).
    this.constrainCurvature = constrainCurvatureExtrema
    if (this.constrainCurvature) {
      try {
        const state = computeOpenComplexCurvatureConstraintState(
          this.knots, this.aReCPs, this.aImCPs, this.bReCPs, this.bImCPs,
        )
        const inactive = new Set(state.inactiveIndices)
        for (let i = 0; i < state.signs.length; i++) {
          if (inactive.has(i)) continue
          this.gActiveIndices.push(i)
          this.gSigns.push(state.signs[i])
        }
      } catch {
        // If g can't be computed, fall back to PH-only (no curvature bound).
        this.constrainCurvature = false
      }
    }
  }

  // Live g Bernstein coefficients of the current (A, B) = (Z, W).
  private computeGCPs(): number[] {
    return computeGCPsFromHomogeneous(
      this.knots, this.aReCPs, this.aImCPs, this.bReCPs, this.bImCPs,
    )
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    // A: 2*nAB (re+im), B: 2*(nAB-1) (B₀ pinned), S: 2*nS
    return 2 * this.nAB + 2 * (this.nAB - 1) + 2 * this.nS
  }

  get numConstraints(): number {
    // PH equalities + active curvature-extrema inequalities.
    return this._numEqualityConstraints + (this.constrainCurvature ? this.gActiveIndices.length : 0)
  }

  get numEqualityConstraints(): number {
    return this._numEqualityConstraints
  }

  getVariables(): number[] {
    // Pack: [aRe, aIm, bRe[1:], bIm[1:], sRe, sIm]
    return [
      ...this.aReCPs,
      ...this.aImCPs,
      ...this.bReCPs.slice(1),
      ...this.bImCPs.slice(1),
      ...this.sReCPs,
      ...this.sImCPs,
    ]
  }

  setVariables(x: number[]): void {
    let offset = 0
    const nAB = this.nAB
    const nS = this.nS

    this.aReCPs = x.slice(offset, offset + nAB); offset += nAB
    this.aImCPs = x.slice(offset, offset + nAB); offset += nAB
    this.bReCPs = [this.b0Re, ...x.slice(offset, offset + nAB - 1)]; offset += nAB - 1
    this.bImCPs = [this.b0Im, ...x.slice(offset, offset + nAB - 1)]; offset += nAB - 1
    this.sReCPs = x.slice(offset, offset + nS); offset += nS
    this.sImCPs = x.slice(offset, offset + nS); offset += nS
  }

  computeObjective(): number {
    const result = computeABPHCurve(this.getMetadata())
    const cps = result.controlPoints

    let f0 = 0
    const n = Math.min(cps.length, this.targetCPs.length)
    for (let i = 0; i < n; i++) {
      const dre = cps[i].re - this.targetCPs[i].re
      const dim = cps[i].im - this.targetCPs[i].im
      f0 += this.cpWeights[i] * 0.5 * (dre * dre + dim * dim)
    }
    return f0
  }

  computeObjectiveGradient(): number[] {
    const numVars = this.numVariables
    const gradient = new Array(numVars).fill(0)
    const eps = 1e-7

    const vars = this.getVariables()
    const f0 = this.computeObjective()

    for (let j = 0; j < numVars; j++) {
      const saved = vars[j]
      vars[j] = saved + eps
      this.setVariables(vars)
      const fPlus = this.computeObjective()
      vars[j] = saved
      this.setVariables(vars)
      gradient[j] = (fPlus - f0) / eps
    }

    return gradient
  }

  computeConstraints(): number[] {
    // First: PH equality constraints (Re and Im parts of the PH residual).
    const residual = computePHResidualCoeffs(this.getMetadata())
    const constraints = [...residual.re, ...residual.im]
    // Then: active curvature-extrema inequalities g_j (the optimizer applies
    // the required sign via getConstraintSigns; here we hand it the raw g_j).
    if (this.constrainCurvature) {
      const g = this.computeGCPs()
      for (const idx of this.gActiveIndices) constraints.push(g[idx] ?? 0)
    }
    return constraints
  }

  computeConstraintJacobian(): Matrix {
    const numVars = this.numVariables
    const vars = this.getVariables()
    const c0 = this.computeConstraints()
    const numC = c0.length
    const eps = 1e-7

    const jacobian: Matrix = []
    for (let i = 0; i < numC; i++) {
      jacobian.push(new Array(numVars).fill(0))
    }

    for (let j = 0; j < numVars; j++) {
      const saved = vars[j]
      vars[j] = saved + eps
      this.setVariables(vars)
      const cPlus = this.computeConstraints()
      vars[j] = saved
      this.setVariables(vars)

      for (let i = 0; i < numC; i++) {
        jacobian[i][j] = (cPlus[i] - c0[i]) / eps
      }
    }

    return jacobian
  }

  getConstraintSigns(): number[] {
    // Equality constraints are sign-free (use +1); curvature-extrema
    // inequalities carry their required sign s_j (so s_j·g_j ≥ 0).
    const signs = new Array(this._numEqualityConstraints).fill(1)
    if (this.constrainCurvature) signs.push(...this.gSigns)
    return signs
  }

  getInactiveConstraints(): Set<number> {
    // We already pre-filter to ACTIVE g coefficients (gActiveIndices), so the
    // optimizer sees no inactive constraints — same contract as the
    // complex-rational problem.
    return new Set()
  }

  updateConstraintState(): void {
    // Sign pattern + active set are snapshotted at construction and held
    // fixed for the solve (re-deriving mid-solve would let the bound drift).
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  getMetadata(): ABPHMetadata {
    return {
      kind: 'ab-complex-rational',
      degree: this.degree,
      aReCPs: [...this.aReCPs],
      aImCPs: [...this.aImCPs],
      bReCPs: [...this.bReCPs],
      bImCPs: [...this.bImCPs],
      sReCPs: [...this.sReCPs],
      sImCPs: [...this.sImCPs],
      knots: [...this.knots],
      sKnots: [...this.sKnots],
    }
  }
}
