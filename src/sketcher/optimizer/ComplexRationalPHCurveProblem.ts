// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Complex Rational PH Curve Optimization Problem
 *
 * Implements OptimizationProblem interface for optimizing complex rational PH curves.
 *
 * Variables: [x₀, y₀, u₀..uₛ, v₀..vₛ]
 *   - x₀, y₀: integration origin
 *   - u₀..uₛ: real part of S generating function CPs
 *   - v₀..vₛ: imaginary part of S generating function CPs
 *
 * D (denominator) is kept fixed during optimization. Changing D globally
 * scales/rotates all CPs, conflicting with the per-CP fidelity objective.
 * With D fixed, the problem reduces to the polynomial PH case and the
 * optimizer converges well.
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import type { ComplexPoint } from '../types/curve'
import type { ComplexRationalPHMetadata } from './phCurve'
import { computeComplexRationalPHFromSD } from './complexRationalPHCurve'
import {
  computeGCPsFromHomogeneous,
  computeOpenComplexCurvatureConstraintState,
} from './complexAlgebra'

export class ComplexRationalPHCurveProblem implements OptimizationProblem {
  private targetCPs: { re: number; im: number }[]
  private cpWeights: number[]

  private sDegree: number
  private sKnots: number[]
  private numU: number
  private numV: number

  // D is fixed during optimization
  private dDegree: number
  private dKnots: number[]
  private dReCPs: number[]
  private dImCPs: number[]

  private x0: number
  private y0: number
  private uCPs: number[]
  private vCPs: number[]

  // ---- Curvature-extrema control (optional) -------------------------------
  // PH is exact BY CONSTRUCTION here (the curve is built by integrating S²),
  // so there are no PH equality constraints to fight. Bounding curvature
  // extrema is therefore a pure inequality problem: s_j·g_j ≥ 0 on the ACTIVE
  // Bernstein coefficients of g, where g is the open complex-rational
  // curvature-derivative numerator of the curve's homogeneous (Z = F, W = D)
  // control points. Sign pattern + inactive (sliding) set are snapshotted from
  // the initial generator state and held fixed for the solve.
  private constrainCurvature: boolean
  private gSigns: number[] = []
  private gActiveIndices: number[] = []

  constructor(
    metadata: ComplexRationalPHMetadata,
    curveCPs: ComplexPoint[],
    targetX: number,
    targetY: number,
    dragIndex: number,
    constrainCurvatureExtrema: boolean = false,
  ) {
    this.sDegree = metadata.sDegree
    this.sKnots = [...metadata.sKnots]
    this.uCPs = [...metadata.sUControlPoints]
    this.vCPs = [...metadata.sVControlPoints]
    this.numU = this.uCPs.length
    this.numV = this.vCPs.length

    // D is fixed — not part of optimization variables
    this.dDegree = metadata.dDegree
    this.dKnots = [...metadata.dKnots]
    this.dReCPs = [...metadata.dReControlPoints]
    this.dImCPs = [...metadata.dImControlPoints]

    this.x0 = metadata.origin.x
    this.y0 = metadata.origin.y

    // Target CPs: copy current, move dragged one to target
    this.targetCPs = curveCPs.map(cp => ({ re: cp.re, im: cp.im }))
    this.targetCPs[dragIndex] = { re: targetX, im: targetY }

    // Weights: higher weight on dragged CP and endpoints
    const n = curveCPs.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5

    // Snapshot the curvature-extrema sign pattern + inactive (sliding) set from
    // the INITIAL generator state. Held fixed for the solve.
    this.constrainCurvature = constrainCurvatureExtrema
    if (this.constrainCurvature) {
      try {
        const { knots, Zre, Zim, Wre, Wim } = this.curveHomogeneous()
        const state = computeOpenComplexCurvatureConstraintState(knots, Zre, Zim, Wre, Wim)
        const inactive = new Set(state.inactiveIndices)
        for (let i = 0; i < state.signs.length; i++) {
          if (inactive.has(i)) continue
          this.gActiveIndices.push(i)
          this.gSigns.push(state.signs[i])
        }
      } catch {
        this.constrainCurvature = false
      }
    }
  }

  // Build the curve from the current generator (S, fixed D) and return its
  // homogeneous (Z = F numerator, W = D weight) coefficients + knots. These
  // are what the curvature-derivative numerator g(t) is computed from.
  private curveHomogeneous(): {
    knots: number[]; Zre: number[]; Zim: number[]; Wre: number[]; Wim: number[]
  } {
    const res = computeComplexRationalPHFromSD(
      this.uCPs, this.vCPs, this.sKnots, this.sDegree,
      this.dReCPs, this.dImCPs, this.dKnots, this.dDegree,
      this.x0, this.y0,
    )
    const cps = res.controlPoints
    const Zre: number[] = [], Zim: number[] = [], Wre: number[] = [], Wim: number[] = []
    for (const cp of cps) {
      // homogeneous numerator Z = position · weight (Euclidean → homogeneous)
      Zre.push(cp.re * cp.w_re - cp.im * cp.w_im)
      Zim.push(cp.re * cp.w_im + cp.im * cp.w_re)
      Wre.push(cp.w_re)
      Wim.push(cp.w_im)
    }
    return { knots: res.knots, Zre, Zim, Wre, Wim }
  }

  // Live g Bernstein coefficients for the current generator state.
  private computeGCPs(): number[] {
    const { knots, Zre, Zim, Wre, Wim } = this.curveHomogeneous()
    return computeGCPsFromHomogeneous(knots, Zre, Zim, Wre, Wim)
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    return 2 + this.numU + this.numV
  }

  get numConstraints(): number {
    return this.constrainCurvature ? this.gActiveIndices.length : 0
  }

  get numEqualityConstraints(): number {
    // PH is exact by construction — all constraints (if any) are curvature
    // inequalities.
    return 0
  }

  getVariables(): number[] {
    return [this.x0, this.y0, ...this.uCPs, ...this.vCPs]
  }

  setVariables(x: number[]): void {
    this.x0 = x[0]
    this.y0 = x[1]
    this.uCPs = x.slice(2, 2 + this.numU)
    this.vCPs = x.slice(2 + this.numU, 2 + this.numU + this.numV)
  }

  computeObjective(): number {
    const phResult = computeComplexRationalPHFromSD(
      this.uCPs, this.vCPs, this.sKnots, this.sDegree,
      this.dReCPs, this.dImCPs, this.dKnots, this.dDegree,
      this.x0, this.y0,
    )
    const cps = phResult.controlPoints

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
    if (!this.constrainCurvature) return []
    const g = this.computeGCPs()
    return this.gActiveIndices.map((idx) => g[idx] ?? 0)
  }

  computeConstraintJacobian(): Matrix {
    if (!this.constrainCurvature) return []
    const numVars = this.numVariables
    const vars = this.getVariables()
    const c0 = this.computeConstraints()
    const numC = c0.length
    const eps = 1e-7
    const jacobian: Matrix = []
    for (let i = 0; i < numC; i++) jacobian.push(new Array(numVars).fill(0))
    for (let j = 0; j < numVars; j++) {
      const saved = vars[j]
      vars[j] = saved + eps
      this.setVariables(vars)
      const cPlus = this.computeConstraints()
      vars[j] = saved
      this.setVariables(vars)
      for (let i = 0; i < numC; i++) jacobian[i][j] = (cPlus[i] - c0[i]) / eps
    }
    return jacobian
  }

  getConstraintSigns(): number[] {
    // Required sign s_j so that s_j·g_j ≥ 0 keeps each active coefficient on
    // its side of zero (the sliding-mechanism bound).
    return this.constrainCurvature ? [...this.gSigns] : []
  }

  getInactiveConstraints(): Set<number> {
    // Pre-filtered to active g coefficients, so the optimizer sees none.
    return new Set()
  }

  updateConstraintState(): void {
    // Sign pattern + active set are snapshotted at construction and held fixed.
  }
}
