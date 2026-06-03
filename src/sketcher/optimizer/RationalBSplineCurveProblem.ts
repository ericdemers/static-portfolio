// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Rational B-Spline Curve Optimization Problem (Open Curves)
 *
 * Implements OptimizationProblem interface for optimizing rational B-spline curves
 * while preserving curvature extrema count.
 *
 * Three formulation modes:
 *
 * 1. fixWeights=true (default, for CP dragging):
 *    Variables: [X0..Xn, Y0..Yn] in homogeneous coordinates (2n total).
 *    Objective: Euclidean distance to target in homogeneous space.
 *    Weights are held constant — the user moves (x, y), not w.
 *
 * 2. fixWeights=false:
 *    Variables: [X0..Xn, Y0..Yn, W0..Wn] (3n total).
 *    Objective: Homogeneous distance to target with weight penalty.
 *
 * 3. farinDragMode (for Farin point dragging):
 *    Variables: [x0..xn, y0..yn, t_j] in Euclidean + Farin t-value (2n+1 total).
 *    Only the dragged Farin's t-value is a variable; all others are fixed.
 *    Weights are derived: w_0=1, w_{i+1} = w_i * t_i / (1-t_i).
 *    Jacobian uses chain rule through the homogeneous Jacobian.
 */

import {
  type RationalBSpline2D,
  cpToArray,
  cpFromArray,
  knotsToArray,
} from './bsplineTypes'
import {
  computeRationalCurvatureDerivativeNumeratorCPs,
  computeRationalCurvatureDerivativeNumeratorBD,
  precomputeRationalBasisDerivatives,
  computeRationalExplicitJacobian,
  type PrecomputedRationalBasisDerivatives,
} from './algebra'
import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'

export class RationalBSplineCurveProblem implements OptimizationProblem {
  private curve: RationalBSpline2D
  private targetX: number[]
  private targetY: number[]
  private targetW: number[]

  // Constraint state
  private constraintSigns: number[]
  private inactiveConstraints: Set<number>

  // Precomputed basis derivatives
  private precomputed: PrecomputedRationalBasisDerivatives

  // Cached
  private cachedConstraints: number[] | null = null
  private cachedJacobian: Matrix | null = null

  // Internal mutable arrays (homogeneous)
  private cpX: number[]
  private cpY: number[]
  private cpW: number[]

  // Weight penalty factor (from reference: 0.1)
  private readonly weightFactor = 0.1

  // When true, weights are held constant (2n variables instead of 3n)
  private readonly fixWeights: boolean

  // --- Farin drag mode ---
  private farinDragMode = false
  private draggedFarinIdx = -1
  private tValues: number[] = []     // all Farin t-values
  private eucX: number[] = []        // Euclidean x positions
  private eucY: number[] = []        // Euclidean y positions
  private targetEucX: number[] = []  // target Euclidean x
  private targetEucY: number[] = []  // target Euclidean y
  private targetT = 0                // target t for dragged Farin
  private edgeLengthSq = 1           // for scaling t-objective

  constructor(
    curve: RationalBSpline2D,
    targetX: number,
    targetY: number,
    dragIndex: number,
    fixWeights: boolean = true,
    dragType: 'controlPoint' | 'farinPoint' = 'controlPoint'
  ) {
    this.curve = curve
    this.fixWeights = fixWeights

    this.cpX = cpToArray(curve.controlPointsX)
    this.cpY = cpToArray(curve.controlPointsY)
    this.cpW = cpToArray(curve.controlPointsW)
    const n = this.cpX.length

    // Target: only dragged point moves (in homogeneous coordinates)
    this.targetX = [...this.cpX]
    this.targetY = [...this.cpY]
    this.targetW = [...this.cpW]

    if (dragType === 'farinPoint') {
      this.initFarinDragMode(dragIndex, targetX, targetY)
    } else {
      // CP drag: target in homogeneous coordinates
      this.targetX[dragIndex] = targetX * this.cpW[dragIndex]
      this.targetY[dragIndex] = targetY * this.cpW[dragIndex]
    }

    // Precompute basis derivatives
    const knots = knotsToArray(curve.knots)
    this.precomputed = precomputeRationalBasisDerivatives(knots, n)

    // Initialize constraint state
    const gCPs = this.computeGCPs()
    this.constraintSigns = this.computeSigns(gCPs)
    this.inactiveConstraints = this.computeInactiveSet(gCPs)
  }

  private initFarinDragMode(farinIndex: number, targetX: number, targetY: number): void {
    this.farinDragMode = true
    this.draggedFarinIdx = farinIndex
    const n = this.cpX.length

    // Compute Euclidean positions from homogeneous
    this.eucX = this.cpX.map((X, i) => X / this.cpW[i])
    this.eucY = this.cpY.map((Y, i) => Y / this.cpW[i])

    // Compute t-values from weights: t_i = w_{i+1} / (w_i + w_{i+1})
    this.tValues = []
    for (let i = 0; i < n - 1; i++) {
      this.tValues.push(this.cpW[i + 1] / (this.cpW[i] + this.cpW[i + 1]))
    }

    // Store target positions (all CPs keep initial positions)
    this.targetEucX = [...this.eucX]
    this.targetEucY = [...this.eucY]

    // Compute target t by projecting mouse position onto the edge
    const j = farinIndex
    const ex = this.eucX[j + 1] - this.eucX[j]
    const ey = this.eucY[j + 1] - this.eucY[j]
    this.edgeLengthSq = ex * ex + ey * ey
    if (this.edgeLengthSq < 1e-20) this.edgeLengthSq = 1
    const dot = (targetX - this.eucX[j]) * ex + (targetY - this.eucY[j]) * ey
    this.targetT = Math.max(0.01, Math.min(0.99, dot / this.edgeLengthSq))
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    if (this.farinDragMode) return this.eucX.length * 2 + 1
    return this.fixWeights ? this.cpX.length * 2 : this.cpX.length * 3
  }

  get numConstraints(): number {
    const gCPs = this.computeGCPs()
    return gCPs.length - this.inactiveConstraints.size
  }

  get numEqualityConstraints(): number {
    return 0
  }

  getVariables(): number[] {
    if (this.farinDragMode) {
      return [...this.eucX, ...this.eucY, this.tValues[this.draggedFarinIdx]]
    }
    if (this.fixWeights) {
      return [...this.cpX, ...this.cpY]
    }
    return [...this.cpX, ...this.cpY, ...this.cpW]
  }

  setVariables(x: number[]): void {
    const n = this.cpX.length

    if (this.farinDragMode) {
      // Extract Euclidean positions and t-value
      this.eucX = x.slice(0, n)
      this.eucY = x.slice(n, 2 * n)
      this.tValues[this.draggedFarinIdx] = x[2 * n]

      // Recompute weights from t-values: w_0 = 1, w_{i+1} = w_i * t_i / (1 - t_i)
      this.cpW[0] = 1
      for (let i = 0; i < n - 1; i++) {
        const t = this.tValues[i]
        this.cpW[i + 1] = this.cpW[i] * t / (1 - t)
      }

      // Recompute homogeneous from Euclidean: X_i = x_i * w_i
      for (let i = 0; i < n; i++) {
        this.cpX[i] = this.eucX[i] * this.cpW[i]
        this.cpY[i] = this.eucY[i] * this.cpW[i]
      }

      this.curve = {
        ...this.curve,
        controlPointsX: cpFromArray(this.curve.controlPointsX, this.cpX),
        controlPointsY: cpFromArray(this.curve.controlPointsY, this.cpY),
        controlPointsW: cpFromArray(this.curve.controlPointsW, this.cpW),
      }
      this.invalidateCache()
      return
    }

    this.cpX = x.slice(0, n)
    this.cpY = x.slice(n, 2 * n)
    if (!this.fixWeights) {
      this.cpW = x.slice(2 * n, 3 * n)
    }
    this.curve = {
      ...this.curve,
      controlPointsX: cpFromArray(this.curve.controlPointsX, this.cpX),
      controlPointsY: cpFromArray(this.curve.controlPointsY, this.cpY),
      controlPointsW: cpFromArray(this.curve.controlPointsW, this.cpW),
    }
    this.invalidateCache()
  }

  computeObjective(): number {
    const n = this.cpX.length

    if (this.farinDragMode) {
      let f0 = 0
      // CP position terms (Euclidean)
      for (let i = 0; i < n; i++) {
        const dx = this.eucX[i] - this.targetEucX[i]
        const dy = this.eucY[i] - this.targetEucY[i]
        f0 += 0.5 * (dx * dx + dy * dy)
      }
      // Farin t-value term (scaled by edge length squared for scale compatibility)
      const dt = this.tValues[this.draggedFarinIdx] - this.targetT
      f0 += 0.5 * this.edgeLengthSq * dt * dt
      return f0
    }

    let f0 = 0
    if (this.fixWeights) {
      for (let i = 0; i < n; i++) {
        const dx = this.cpX[i] - this.targetX[i]
        const dy = this.cpY[i] - this.targetY[i]
        f0 += 0.5 * (dx * dx + dy * dy)
      }
    } else {
      for (let i = 0; i < n; i++) {
        const ratioX = this.targetX[i] / this.targetW[i]
        const ratioY = this.targetY[i] / this.targetW[i]
        const dx = this.cpX[i] - ratioX * this.cpW[i]
        const dy = this.cpY[i] - ratioY * this.cpW[i]
        const dw = this.cpW[i] - this.targetW[i]
        f0 += 0.5 * (dx * dx + dy * dy) + 0.5 * this.weightFactor * dw * dw
      }
    }
    return f0
  }

  computeObjectiveGradient(): number[] {
    const n = this.cpX.length

    if (this.farinDragMode) {
      const gradient: number[] = new Array(2 * n + 1)
      // ∂f0/∂x_i = x_i - target_x_i
      for (let i = 0; i < n; i++) {
        gradient[i] = this.eucX[i] - this.targetEucX[i]
      }
      // ∂f0/∂y_i = y_i - target_y_i
      for (let i = 0; i < n; i++) {
        gradient[n + i] = this.eucY[i] - this.targetEucY[i]
      }
      // ∂f0/∂t_j = S^2 * (t_j - target_t)
      gradient[2 * n] = this.edgeLengthSq * (this.tValues[this.draggedFarinIdx] - this.targetT)
      return gradient
    }

    const gradient: number[] = []
    if (this.fixWeights) {
      for (let i = 0; i < n; i++) {
        gradient.push(this.cpX[i] - this.targetX[i])
      }
      for (let i = 0; i < n; i++) {
        gradient.push(this.cpY[i] - this.targetY[i])
      }
    } else {
      for (let i = 0; i < n; i++) {
        const ratioX = this.targetX[i] / this.targetW[i]
        gradient.push(this.cpX[i] - ratioX * this.cpW[i])
      }
      for (let i = 0; i < n; i++) {
        const ratioY = this.targetY[i] / this.targetW[i]
        gradient.push(this.cpY[i] - ratioY * this.cpW[i])
      }
      for (let i = 0; i < n; i++) {
        const ratioX = this.targetX[i] / this.targetW[i]
        const ratioY = this.targetY[i] / this.targetW[i]
        const dx = this.cpX[i] - ratioX * this.cpW[i]
        const dy = this.cpY[i] - ratioY * this.cpW[i]
        const dw = this.cpW[i] - this.targetW[i]
        gradient.push(dx * (-ratioX) + dy * (-ratioY) + this.weightFactor * dw)
      }
    }

    return gradient
  }

  computeConstraints(): number[] {
    if (this.cachedConstraints) return this.cachedConstraints

    const gCPs = this.computeGCPs()
    const constraints: number[] = []
    for (let i = 0; i < gCPs.length; i++) {
      if (this.inactiveConstraints.has(i)) continue
      constraints.push(gCPs[i])
    }
    this.cachedConstraints = constraints
    return constraints
  }

  computeConstraintJacobian(): Matrix {
    if (this.cachedJacobian) return this.cachedJacobian

    const gCPs = this.computeGCPs()
    const activeIndices: number[] = []
    for (let i = 0; i < gCPs.length; i++) {
      if (!this.inactiveConstraints.has(i)) activeIndices.push(i)
    }

    // Get full homogeneous Jacobian: m × 3n, columns = [X_0..X_{n-1}, Y_0..Y_{n-1}, W_0..W_{n-1}]
    const fullJacobian = computeRationalExplicitJacobian(
      this.precomputed, this.cpX, this.cpY, this.cpW, activeIndices
    )

    if (this.farinDragMode) {
      const jacobian = this.transformJacobianToFarinMode(fullJacobian)
      this.cachedJacobian = jacobian
      return jacobian
    }

    if (this.fixWeights) {
      const n = this.cpX.length
      const jacobian = fullJacobian.map(row => row.slice(0, 2 * n))
      this.cachedJacobian = jacobian
      return jacobian
    }

    this.cachedJacobian = fullJacobian
    return fullJacobian
  }

  /**
   * Transform homogeneous Jacobian (m × 3n) to Farin mode Jacobian (m × (2n+1)).
   *
   * Chain rule:
   *   ∂g/∂x_i = ∂g/∂X_i * w_i          (since X_i = x_i * w_i)
   *   ∂g/∂y_i = ∂g/∂Y_i * w_i
   *   ∂g/∂t_j = Σ_{k>j} [∂g/∂X_k * x_k + ∂g/∂Y_k * y_k + ∂g/∂W_k] * w_k / (t_j * (1-t_j))
   */
  private transformJacobianToFarinMode(homJacobian: Matrix): Matrix {
    const n = this.cpX.length
    const m = homJacobian.length
    const j = this.draggedFarinIdx
    const tj = this.tValues[j]
    const tjFactor = 1 / (tj * (1 - tj))

    const jacobian: Matrix = []
    for (let r = 0; r < m; r++) {
      const row = new Array(2 * n + 1)
      const homRow = homJacobian[r]

      // ∂g/∂x_i = ∂g/∂X_i * w_i
      for (let i = 0; i < n; i++) {
        row[i] = homRow[i] * this.cpW[i]
      }
      // ∂g/∂y_i = ∂g/∂Y_i * w_i
      for (let i = 0; i < n; i++) {
        row[n + i] = homRow[n + i] * this.cpW[i]
      }

      // ∂g/∂t_j = Σ_{k>j} [∂g/∂X_k * x_k + ∂g/∂Y_k * y_k + ∂g/∂W_k] * dw_k/dt_j
      // where dw_k/dt_j = w_k / (t_j * (1 - t_j))
      let dtj = 0
      for (let k = j + 1; k < n; k++) {
        const D_k = homRow[k] * this.eucX[k] + homRow[n + k] * this.eucY[k] + homRow[2 * n + k]
        dtj += D_k * this.cpW[k]
      }
      row[2 * n] = dtj * tjFactor

      jacobian.push(row)
    }
    return jacobian
  }

  getConstraintSigns(): number[] {
    const activeSigns: number[] = []
    for (let i = 0; i < this.constraintSigns.length; i++) {
      if (!this.inactiveConstraints.has(i)) {
        activeSigns.push(this.constraintSigns[i])
      }
    }
    return activeSigns
  }

  getInactiveConstraints(): Set<number> {
    return new Set<number>()
  }

  updateConstraintState(): void {
    const gCPs = this.computeGCPs()
    this.constraintSigns = this.computeSigns(gCPs)
    this.inactiveConstraints = this.computeInactiveSet(gCPs)
    this.invalidateCache()
  }

  /** Get current weight values (useful when fixWeights=true to retrieve the constant weights) */
  getWeights(): number[] {
    return [...this.cpW]
  }

  /** Get Euclidean positions (for farin drag mode result extraction) */
  getEuclideanPositions(): { x: number[]; y: number[] } {
    if (this.farinDragMode) {
      return { x: [...this.eucX], y: [...this.eucY] }
    }
    // Convert from homogeneous
    const n = this.cpX.length
    return {
      x: this.cpX.map((X, i) => X / this.cpW[i]),
      y: this.cpY.map((Y, i) => Y / this.cpW[i]),
    }
  }

  /** Check if in farin drag mode */
  isFarinDragMode(): boolean {
    return this.farinDragMode
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private computeGCPs(): number[] {
    const knots = knotsToArray(this.curve.knots)
    return computeRationalCurvatureDerivativeNumeratorCPs(knots, this.cpX, this.cpY, this.cpW)
  }

  private computeSigns(gCPs: number[]): number[] {
    return gCPs.map((g) => (g > 0 ? -1 : 1))
  }

  private computeInactiveSet(gCPs: number[]): Set<number> {
    const inactive = new Set<number>()
    const n = gCPs.length
    let i = 0
    while (i < n - 1) {
      if (gCPs[i] * gCPs[i + 1] <= 0) {
        const sequence: { idx: number; absVal: number }[] = [
          { idx: i, absVal: Math.abs(gCPs[i]) },
          { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
        ]
        let j = i + 1
        while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
          j++
          sequence.push({ idx: j, absVal: Math.abs(gCPs[j]) })
        }
        const maxEntry = sequence.reduce((max, entry) => (entry.absVal > max.absVal ? entry : max))
        for (const entry of sequence) {
          if (entry.idx !== maxEntry.idx) inactive.add(entry.idx)
        }
        i = j + 1
      } else {
        i++
      }
    }
    return inactive
  }

  private invalidateCache(): void {
    this.cachedConstraints = null
    this.cachedJacobian = null
  }
}

// ============================================================================
// Constraint State Interface and Helper
// ============================================================================

export interface RationalCurveConstraintState {
  signs: number[]
  inactiveIndices: number[]
  gCPs: number[]
  grevilleAbscissae: number[]
}

export function computeRationalCurveConstraintState(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): RationalCurveConstraintState {
  const gBD = computeRationalCurvatureDerivativeNumeratorBD(knots, cpsX, cpsY, cpsW)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))

  const inactive = new Set<number>()
  const n = gCPs.length
  let i = 0
  while (i < n - 1) {
    if (gCPs[i] * gCPs[i + 1] <= 0) {
      const sequence: { idx: number; absVal: number }[] = [
        { idx: i, absVal: Math.abs(gCPs[i]) },
        { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
      ]
      let j = i + 1
      while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
        j++
        sequence.push({ idx: j, absVal: Math.abs(gCPs[j]) })
      }
      const maxEntry = sequence.reduce((max, entry) => (entry.absVal > max.absVal ? entry : max))
      for (const entry of sequence) {
        if (entry.idx !== maxEntry.idx) inactive.add(entry.idx)
      }
      i = j + 1
    } else {
      i++
    }
  }

  return {
    signs,
    inactiveIndices: Array.from(inactive).sort((a, b) => a - b),
    gCPs,
    grevilleAbscissae,
  }
}
