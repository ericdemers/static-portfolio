// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * PH Curve Optimization Problem
 *
 * Implements OptimizationProblem interface for optimizing PH curves.
 * No constraints — just an objective function that matches PH curve CPs to targets.
 *
 * Variables: [x₀, y₀, u₀, ..., u_m, v₀, ..., v_m]
 *   - x₀, y₀: integration origin
 *   - u₀..u_m: u generating function control points
 *   - v₀..v_m: v generating function control points
 *
 * The PH property is maintained by construction: the curve is always computed
 * from u,v via r'(t) = (u²-v², 2uv).
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import { computePHCurveFromUV, type PHMetadata } from './phCurve'
import type { Point2D } from '../types/curve'

export class PHCurveProblem implements OptimizationProblem {
  private targetCPs: Point2D[]
  private cpWeights: number[]

  private uvDegree: number
  private uvKnots: number[]
  private numU: number
  private numV: number

  // Current variable state
  private x0: number
  private y0: number
  private uCPs: number[]
  private vCPs: number[]

  constructor(
    metadata: PHMetadata,
    curveCPs: Point2D[],
    targetX: number,
    targetY: number,
    dragIndex: number,
  ) {
    this.uvDegree = metadata.uvDegree
    this.uvKnots = [...metadata.uvKnots]
    this.uCPs = [...metadata.uControlPoints]
    this.vCPs = [...metadata.vControlPoints]
    this.numU = this.uCPs.length
    this.numV = this.vCPs.length
    this.x0 = metadata.origin.x
    this.y0 = metadata.origin.y

    // Target CPs: copy current, move dragged one to target
    this.targetCPs = curveCPs.map(p => ({ ...p }))
    this.targetCPs[dragIndex] = { x: targetX, y: targetY }

    // Weights: higher weight on dragged CP and endpoints
    const n = curveCPs.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    return 2 + this.numU + this.numV
  }

  get numConstraints(): number {
    return 0
  }

  get numEqualityConstraints(): number {
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
    const phResult = computePHCurveFromUV(
      this.uCPs, this.vCPs, this.uvKnots, this.uvDegree, this.x0, this.y0
    )
    const cps = phResult.controlPoints

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

    // Finite difference gradient
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

  // No constraints
  computeConstraints(): number[] {
    return []
  }

  computeConstraintJacobian(): Matrix {
    return []
  }

  getConstraintSigns(): number[] {
    return []
  }

  getInactiveConstraints(): Set<number> {
    return new Set()
  }

  updateConstraintState(): void {
    // No constraints to update
  }
}
