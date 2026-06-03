// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Real Rational PH Curve Optimization Problem
 *
 * Like ABPHCurveProblem but with B constrained to be real (no bIm variables).
 *
 * Variables: [aRe[], aIm[], bRe[1:], sRe[], sIm[]]
 *   - A (numerator) control points: aRe + i*aIm
 *   - B (denominator) control points: bRe only (B₀ pinned as gauge fix)
 *   - S (generating function) control points: sRe + i*sIm
 *
 * Equality constraints: Re(A'B - AB' - S²) = 0 AND Im(A'B - AB' - S²) = 0
 *   (same PH condition, but with real B the Wronskian is simpler)
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import type { WeightedPoint2D } from '../types/curve'
import { computePHResidualCoeffs } from './abPHCurve'
import {
  type RealRationalPHMetadata,
  computeRealRationalPHCurve,
  toABMetadata,
} from './realRationalPHCurve'

export class RealRationalPHCurveProblem implements OptimizationProblem {
  private targetCPs: { x: number; y: number }[]
  private cpWeights: number[]

  private degree: number
  private knots: number[]
  private sKnots: number[]
  private nAB: number  // number of CPs for A and B
  private nS: number   // number of CPs for S

  // Current variable state
  private aReCPs: number[]
  private aImCPs: number[]
  private bCPs: number[]   // real only
  private sReCPs: number[]
  private sImCPs: number[]

  // Pinned B₀ (gauge fix)
  private b0: number

  // Cached equality constraint count
  private _numEqualityConstraints: number

  constructor(
    metadata: RealRationalPHMetadata,
    curveCPs: WeightedPoint2D[],
    targetX: number,
    targetY: number,
    dragIndex: number,
  ) {
    this.degree = metadata.degree
    this.knots = [...metadata.knots]
    this.sKnots = [...metadata.sKnots]

    this.aReCPs = [...metadata.aReCPs]
    this.aImCPs = [...metadata.aImCPs]
    this.bCPs = [...metadata.bCPs]
    this.sReCPs = [...metadata.sReCPs]
    this.sImCPs = [...metadata.sImCPs]

    this.nAB = this.aReCPs.length
    this.nS = this.sReCPs.length

    // Pin B₀ (gauge fix)
    this.b0 = this.bCPs[0]

    // Target CPs: copy current, move dragged one to target
    this.targetCPs = curveCPs.map(cp => ({ x: cp.x, y: cp.y }))
    this.targetCPs[dragIndex] = { x: targetX, y: targetY }

    // Weights: higher weight on dragged CP and endpoints
    const n = curveCPs.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5

    // Compute number of equality constraints from residual
    const residual = computePHResidualCoeffs(toABMetadata(this.getMetadata()))
    this._numEqualityConstraints = residual.re.length + residual.im.length
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    // A: 2*nAB (re+im), B: (nAB-1) (B₀ pinned, real only), S: 2*nS
    return 2 * this.nAB + (this.nAB - 1) + 2 * this.nS
  }

  get numConstraints(): number {
    return this._numEqualityConstraints
  }

  get numEqualityConstraints(): number {
    return this._numEqualityConstraints
  }

  getVariables(): number[] {
    // Pack: [aRe, aIm, bRe[1:], sRe, sIm]  (no bIm!)
    return [
      ...this.aReCPs,
      ...this.aImCPs,
      ...this.bCPs.slice(1),
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
    this.bCPs = [this.b0, ...x.slice(offset, offset + nAB - 1)]; offset += nAB - 1
    // No bIm — stays zero
    this.sReCPs = x.slice(offset, offset + nS); offset += nS
    this.sImCPs = x.slice(offset, offset + nS); offset += nS
  }

  computeObjective(): number {
    const result = computeRealRationalPHCurve(this.getMetadata())
    const cps = result.controlPoints

    let f0 = 0
    const n = Math.min(cps.length, this.targetCPs.length)
    for (let i = 0; i < n; i++) {
      const dx = cps[i].x - this.targetCPs[i].x
      const dy = cps[i].y - this.targetCPs[i].y
      f0 += this.cpWeights[i] * 0.5 * (dx * dx + dy * dy)
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
    // Reuse AB PH residual with bIm = 0
    const residual = computePHResidualCoeffs(toABMetadata(this.getMetadata()))
    return [...residual.re, ...residual.im]
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
    return new Array(this._numEqualityConstraints).fill(1)
  }

  getInactiveConstraints(): Set<number> {
    return new Set()
  }

  updateConstraintState(): void {
    // No state to update for equality constraints
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  getMetadata(): RealRationalPHMetadata {
    return {
      kind: 'real-rational',
      degree: this.degree,
      aReCPs: [...this.aReCPs],
      aImCPs: [...this.aImCPs],
      bCPs: [...this.bCPs],
      sReCPs: [...this.sReCPs],
      sImCPs: [...this.sImCPs],
      knots: [...this.knots],
      sKnots: [...this.sKnots],
    }
  }
}
