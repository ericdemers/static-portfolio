// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Complex Rational B-Spline Curve Optimization Problem
 *
 * Three formulation modes:
 *
 * 1. Geometric (all Farin free) — dragging CP on closed curve:
 *    Variables: [x0..x_{n-1}, y0..y_{n-1}, qx0..qx_{m-1}, qy0..qy_{m-1}]
 *
 * 2. Geometric (single Farin) — dragging a Farin point:
 *    Variables: [x0..x_{n-1}, y0..y_{n-1}, qx_j, qy_j]
 *    Other Farin points maintain fixed relative position on their edge:
 *    r_k = (q_k - z_k) / (z_{k+1} - z_k) is preserved, so weight ratios are fixed.
 *
 * 3. Homogeneous — dragging CP on open curve:
 *    Variables: [Z_re_0..Z_re_{n-1}, Z_im_0..Z_im_{n-1}]
 *    SPARSE Jacobian (each Z_i only affects nearby g(t) CPs).
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import {
  computeGCPsFromGeometric,
  computeGCPsFromHomogeneous,
  computeComplexGeometricJacobianAnalytical,
  computeOpenComplexHomogeneousJacobianZ,
  computeWrapWeightFromChain,
  computeGCPsFromFixedWeightClosed,
  computeFixedWeightClosedJacobian,
  type ComplexRationalConstraintState,
} from './complexAlgebra'
import type { ComplexRationalBSplineCurve, ComplexPoint, Point2D } from '../types/curve'

// ============================================================================
// Complex Rational B-Spline Curve Problem
// ============================================================================

export class ComplexRationalBSplineCurveProblem implements OptimizationProblem {
  // For geometric formulation: coords (x, y, qx, qy) normalized by coordScale
  // For homogeneous formulation: coords (Z_re, Z_im) normalized by coordScale
  private cpX: number[]
  private cpY: number[]
  private fpX: number[]   // Farin point x (geometric only)
  private fpY: number[]   // Farin point y (geometric only)
  private targetCpX: number[]
  private targetCpY: number[]
  private targetFpX: number[]
  private targetFpY: number[]
  private degree: number
  private knots: number[]
  private period: number
  private closed: boolean
  private useGeometric: boolean  // formulation choice (separate from topology)
  private constraintSigns: number[]
  private inactiveConstraints: Set<number>
  // Fixed complex weights for homogeneous formulation
  private fixedWre: number[] | null = null
  private fixedWim: number[] | null = null
  private cachedConstraints: number[] | null = null
  private cachedJacobian: Matrix | null = null
  // Memoized curvature-derivative Bernstein coefficients for the current
  // variable state. computeGCPs() is otherwise recomputed ~2x per inner
  // iteration (once for constraints, once inside the Jacobian build);
  // this caches that pure-of-state result and is cleared in invalidateCache().
  private cachedGCPs: number[] | null = null
  // Constraint scaling for geometric formulation
  private constraintScale: number = 1
  // Coordinate normalization: all variables are stored as value/coordScale
  private coordScale: number = 1
  // Single-Farin mode: only the dragged Farin point is a variable,
  // others maintain fixed relative position r_k = (q_k - z_k) / (z_{k+1} - z_k)
  private singleFarinMode: boolean = false
  private draggedFarinIdx: number = -1
  private fixedRatios: { re: number; im: number }[] = []
  // Fixed-weight closed mode: weights held at their current values, variables
  // are only the control-point positions z (2n). Sparse Jacobian; the spiral
  // (monodromy ρ) is a constant. Used for responsive Bound-mode CP editing on
  // closed complex-rational curves.
  private useFixedWeightClosed: boolean = false
  private fixedWeights: { re: number; im: number }[] = []
  private fixedWrapWeight: { re: number; im: number } = { re: 1, im: 0 }

  constructor(
    curve: ComplexRationalBSplineCurve,
    targetX: number,
    targetY: number,
    dragIndex: number,
    dragType: 'controlPoint' | 'farinPoint',
    initialConstraintState?: ComplexRationalConstraintState,
    forceGeometric?: boolean,
    fixedWeightClosed?: boolean
  ) {
    const n = curve.controlPoints.length
    this.degree = curve.degree
    this.knots = [...curve.knots]
    this.period = 1.0
    this.closed = curve.closed
    // Fixed-weight closed mode: closed curve + CP drag + opt-in. Variables are
    // only z; weights are frozen, giving a sparse Jacobian. Falls back to the
    // dense geometric formulation when not requested.
    this.useFixedWeightClosed =
      fixedWeightClosed === true && curve.closed && dragType === 'controlPoint'
    // Geometric formulation: always for closed curves, and for open curves when
    // dragging Farin points (they're not variables in the homogeneous formulation).
    // Homogeneous formulation: for open curves dragging control points (sparse Jacobian).
    this.useGeometric = curve.closed || dragType === 'farinPoint' || (forceGeometric === true)

    // Compute characteristic length for normalization
    // All coordinates and targets are divided by this so the optimizer sees O(1) variables
    let maxCoord = 0
    for (const p of curve.controlPoints) {
      maxCoord = Math.max(maxCoord, Math.abs(p.re), Math.abs(p.im))
    }
    if (curve.farinPositions) {
      for (const p of curve.farinPositions) {
        maxCoord = Math.max(maxCoord, Math.abs(p.x), Math.abs(p.y))
      }
    }
    this.coordScale = Math.max(maxCoord, 1)  // never scale up, only down

    if (this.useGeometric) {
      this.initGeometric(curve, targetX, targetY, dragIndex, dragType)

      // Single-Farin mode: when dragging a Farin point, only that one Farin is a variable.
      // Other Farin points maintain their relative position on each edge.
      if (dragType === 'farinPoint') {
        this.singleFarinMode = true
        this.draggedFarinIdx = dragIndex
        this.computeFixedRatios()
      }

      // Fixed-weight closed mode: freeze the weights (and the monodromy
      // wrapWeight) at their initial values. Derived from the initial
      // CPs + Farin points; held constant for the whole solve. The Farin
      // points are NOT variables in this mode.
      if (this.useFixedWeightClosed && !this.singleFarinMode) {
        const cps0 = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
        const fps0 = this.fpX.map((x, i) => ({ x, y: this.fpY[i] }))
        this.fixedWeights = this.computeWeightsFromGeometric(cps0, fps0)
        this.fixedWrapWeight = computeWrapWeightFromChain(cps0, fps0, this.fixedWeights)
      } else {
        this.useFixedWeightClosed = false
      }
    } else {
      this.initHomogeneous(curve, targetX, targetY, dragIndex, dragType)
    }

    // Compute constraint state
    if (initialConstraintState) {
      this.constraintSigns = [...initialConstraintState.signs]
      this.inactiveConstraints = new Set(initialConstraintState.inactiveIndices)
    } else {
      const gCPs = this.computeGCPs()
      this.constraintSigns = gCPs.map(g => (g > 0 ? -1 : 1))
      this.inactiveConstraints = this.computeInactiveSet(gCPs)
    }

    // Constraint scaling for geometric formulation
    if (this.useGeometric) {
      const gCPsForScale = this.computeGCPs()
      let maxAbs = 0
      for (let i = 0; i < gCPsForScale.length; i++) {
        if (this.inactiveConstraints.has(i)) continue
        const a = Math.abs(gCPsForScale[i])
        if (a > maxAbs) maxAbs = a
      }
      this.constraintScale = maxAbs > 1e-10 ? maxAbs : 1
    }
  }

  /**
   * Initialize geometric formulation: variables are (x, y, qx, qy)
   * Works for both open and closed curves.
   */
  private initGeometric(
    curve: ComplexRationalBSplineCurve,
    targetX: number, targetY: number,
    dragIndex: number, dragType: 'controlPoint' | 'farinPoint'
  ): void {
    const n = curve.controlPoints.length
    const S = this.coordScale

    this.cpX = curve.controlPoints.map(p => p.re / S)
    this.cpY = curve.controlPoints.map(p => p.im / S)

    const numEdges = this.closed ? n : n - 1
    if (curve.farinPositions && curve.farinPositions.length === numEdges) {
      this.fpX = curve.farinPositions.map(p => p.x / S)
      this.fpY = curve.farinPositions.map(p => p.y / S)
    } else {
      const { computeFarinFromWeights } = this.computeFarinFromCurrentWeights(curve)
      this.fpX = computeFarinFromWeights.map(p => p.x / S)
      this.fpY = computeFarinFromWeights.map(p => p.y / S)
    }

    this.targetCpX = [...this.cpX]
    this.targetCpY = [...this.cpY]
    this.targetFpX = [...this.fpX]
    this.targetFpY = [...this.fpY]

    if (dragType === 'controlPoint') {
      this.targetCpX[dragIndex] = targetX / S
      this.targetCpY[dragIndex] = targetY / S
    } else {
      this.targetFpX[dragIndex] = targetX / S
      this.targetFpY[dragIndex] = targetY / S
    }
  }

  /**
   * Initialize homogeneous formulation: variables are (Z_re, Z_im)
   * with fixed complex weights. This gives a sparse Jacobian.
   */
  private initHomogeneous(
    curve: ComplexRationalBSplineCurve,
    targetX: number, targetY: number,
    dragIndex: number, dragType: 'controlPoint' | 'farinPoint'
  ): void {
    const n = curve.controlPoints.length
    const S = this.coordScale

    // Compute weights from curve data
    const weights = this.computeWeightsFromCurve(curve)
    this.fixedWre = weights.map(w => w.re)
    this.fixedWim = weights.map(w => w.im)

    // Compute homogeneous coordinates Z = z * w, then normalize by S
    const homoZre: number[] = []
    const homoZim: number[] = []
    for (let i = 0; i < n; i++) {
      const z_re = curve.controlPoints[i].re
      const z_im = curve.controlPoints[i].im
      const w_re = weights[i].re
      const w_im = weights[i].im
      homoZre.push((z_re * w_re - z_im * w_im) / S)
      homoZim.push((z_re * w_im + z_im * w_re) / S)
    }

    // Store normalized homogeneous coords
    this.cpX = homoZre
    this.cpY = homoZim
    this.fpX = []
    this.fpY = []

    // Targets in normalized homogeneous space
    this.targetCpX = [...homoZre]
    this.targetCpY = [...homoZim]
    this.targetFpX = []
    this.targetFpY = []

    if (dragType === 'controlPoint') {
      // target_Z = target_z * w_i / S (complex multiply, normalized)
      const wi = weights[dragIndex]
      this.targetCpX[dragIndex] = (targetX * wi.re - targetY * wi.im) / S
      this.targetCpY[dragIndex] = (targetX * wi.im + targetY * wi.re) / S
    } else {
      // Farin point drag: convert to Z targets (normalized)
      const k = dragIndex
      const sumW_re = weights[k].re + weights[k + 1].re
      const sumW_im = weights[k].im + weights[k + 1].im
      const target_sumZ_re = (targetX * sumW_re - targetY * sumW_im) / S
      const target_sumZ_im = (targetX * sumW_im + targetY * sumW_re) / S
      const curr_sumZ_re = homoZre[k] + homoZre[k + 1]
      const curr_sumZ_im = homoZim[k] + homoZim[k + 1]
      const delta_re = (target_sumZ_re - curr_sumZ_re) / 2
      const delta_im = (target_sumZ_im - curr_sumZ_im) / 2
      this.targetCpX[k] += delta_re
      this.targetCpY[k] += delta_im
      this.targetCpX[k + 1] += delta_re
      this.targetCpY[k + 1] += delta_im
    }
  }

  getConstraintState(): ComplexRationalConstraintState {
    return {
      signs: [...this.constraintSigns],
      inactiveIndices: Array.from(this.inactiveConstraints),
      gCPs: this.computeGCPs(),
    }
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    // Fixed-weight closed: only z (Farin points are not variables).
    if (this.useFixedWeightClosed) return 2 * this.cpX.length
    if (this.useGeometric) {
      if (this.singleFarinMode) {
        return 2 * this.cpX.length + 2  // CPs + one Farin point
      }
      return 2 * this.cpX.length + 2 * this.fpX.length
    }
    // Homogeneous: only Z_re and Z_im
    return 2 * this.cpX.length
  }

  get numConstraints(): number {
    const gCPs = this.computeGCPs()
    return gCPs.length - this.inactiveConstraints.size
  }

  get numEqualityConstraints(): number {
    return 0
  }

  getVariables(): number[] {
    // Fixed-weight closed: only z (same layout as homogeneous).
    if (this.useFixedWeightClosed) return [...this.cpX, ...this.cpY]
    if (this.useGeometric) {
      if (this.singleFarinMode) {
        const j = this.draggedFarinIdx
        return [...this.cpX, ...this.cpY, this.fpX[j], this.fpY[j]]
      }
      return [...this.cpX, ...this.cpY, ...this.fpX, ...this.fpY]
    }
    return [...this.cpX, ...this.cpY]
  }

  setVariables(x: number[]): void {
    const n = this.cpX.length
    this.cpX = x.slice(0, n)
    this.cpY = x.slice(n, 2 * n)
    // Fixed-weight closed: only z changes; Farin points are derived (not vars).
    if (this.useGeometric && !this.useFixedWeightClosed) {
      if (this.singleFarinMode) {
        const j = this.draggedFarinIdx
        this.fpX[j] = x[2 * n]
        this.fpY[j] = x[2 * n + 1]
        // Reconstruct non-dragged Farin positions from fixed ratios + current CPs
        this.reconstructFarinPositions()
      } else {
        const m = this.fpX.length
        this.fpX = x.slice(2 * n, 2 * n + m)
        this.fpY = x.slice(2 * n + m, 2 * n + 2 * m)
      }
    }
    this.invalidateCache()
  }

  computeObjective(): number {
    const n = this.cpX.length
    let f0 = 0
    // Simple Euclidean distance to target (in whatever space: geometric or homogeneous)
    for (let i = 0; i < n; i++) {
      const dx = this.cpX[i] - this.targetCpX[i]
      const dy = this.cpY[i] - this.targetCpY[i]
      f0 += 0.5 * (dx * dx + dy * dy)
    }
    if (this.useGeometric && !this.useFixedWeightClosed) {
      if (this.singleFarinMode) {
        // Only the dragged Farin point contributes to the objective
        const j = this.draggedFarinIdx
        const dx = this.fpX[j] - this.targetFpX[j]
        const dy = this.fpY[j] - this.targetFpY[j]
        f0 += 0.5 * (dx * dx + dy * dy)
      } else {
        const m = this.fpX.length
        for (let i = 0; i < m; i++) {
          const dx = this.fpX[i] - this.targetFpX[i]
          const dy = this.fpY[i] - this.targetFpY[i]
          f0 += 0.5 * (dx * dx + dy * dy)
        }
      }
    }
    return f0
  }

  computeObjectiveGradient(): number[] {
    const n = this.cpX.length
    const gradient: number[] = []

    for (let i = 0; i < n; i++) {
      gradient.push(this.cpX[i] - this.targetCpX[i])
    }
    for (let i = 0; i < n; i++) {
      gradient.push(this.cpY[i] - this.targetCpY[i])
    }
    if (this.useGeometric && !this.useFixedWeightClosed) {
      if (this.singleFarinMode) {
        const j = this.draggedFarinIdx
        gradient.push(this.fpX[j] - this.targetFpX[j])
        gradient.push(this.fpY[j] - this.targetFpY[j])
      } else {
        const m = this.fpX.length
        for (let i = 0; i < m; i++) {
          gradient.push(this.fpX[i] - this.targetFpX[i])
        }
        for (let i = 0; i < m; i++) {
          gradient.push(this.fpY[i] - this.targetFpY[i])
        }
      }
    }
    return gradient
  }

  computeConstraints(): number[] {
    if (this.cachedConstraints) return this.cachedConstraints

    const gCPs = this.computeGCPs()
    const constraints: number[] = []
    const scale = this.useGeometric ? this.constraintScale : 1
    for (let i = 0; i < gCPs.length; i++) {
      if (this.inactiveConstraints.has(i)) continue
      constraints.push(gCPs[i] / scale)
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

    let jacobian: Matrix
    if (this.useFixedWeightClosed) {
      const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
      jacobian = computeFixedWeightClosedJacobian(
        this.degree, this.knots, controlPoints,
        this.fixedWeights, this.fixedWrapWeight, activeIndices, this.period
      )
      const s = this.constraintScale
      for (let j = 0; j < jacobian.length; j++) {
        for (let v = 0; v < jacobian[j].length; v++) jacobian[j][v] /= s
      }
    } else if (this.useGeometric) {
      const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
      const farinPositions = this.fpX.map((x, i) => ({ x, y: this.fpY[i] }))
      const fullJacobian = computeComplexGeometricJacobianAnalytical(
        this.degree, this.knots, controlPoints, farinPositions,
        activeIndices, this.period, this.closed
      )
      // Apply constraint scaling
      const s = this.constraintScale
      for (let j = 0; j < fullJacobian.length; j++) {
        for (let v = 0; v < fullJacobian[j].length; v++) {
          fullJacobian[j][v] /= s
        }
      }
      // In single-Farin mode, project to reduced variable space
      jacobian = this.singleFarinMode
        ? this.projectJacobianToSingleFarin(fullJacobian)
        : fullJacobian
    } else {
      // Homogeneous: sparse Jacobian
      jacobian = computeOpenComplexHomogeneousJacobianZ(
        this.knots, this.cpX, this.cpY,
        this.fixedWre!, this.fixedWim!,
        activeIndices
      )
    }

    this.cachedJacobian = jacobian
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
    this.constraintSigns = gCPs.map(g => (g > 0 ? -1 : 1))
    this.inactiveConstraints = this.computeInactiveSet(gCPs)
    this.invalidateCache()
  }

  // ==========================================================================
  // Result Extraction
  // ==========================================================================

  getControlPoints(): ComplexPoint[] {
    if (this.useFixedWeightClosed) {
      // Weights are frozen; only z moved. Pair the new z with the fixed weights.
      const S = this.coordScale
      return this.cpX.map((x, i) => ({
        re: x * S,
        im: this.cpY[i] * S,
        w_re: this.fixedWeights[i].re,
        w_im: this.fixedWeights[i].im,
      }))
    }
    if (this.useGeometric) {
      return this.getControlPointsGeometric()
    }
    return this.getControlPointsHomogeneous()
  }

  getFarinPositions(): Point2D[] {
    if (this.useFixedWeightClosed) {
      // Farin points are derived from the (frozen) weights and the moved z.
      const S = this.coordScale
      const cps = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
      const out = this.farinFromFixedWeights(cps)
      return out.map((p) => ({ x: p.x * S, y: p.y * S }))
    }
    if (this.useGeometric) {
      const S = this.coordScale
      return this.fpX.map((x, i) => ({ x: x * S, y: this.fpY[i] * S }))
    }
    return this.getFarinPositionsHomogeneous()
  }

  getWrapWeight(): { re: number; im: number } {
    // Fixed-weight closed: the monodromy is frozen.
    if (this.useFixedWeightClosed) return { ...this.fixedWrapWeight }
    if (!this.closed || !this.useGeometric) return { re: 1, im: 0 }
    const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
    const farinPositions = this.fpX.map((x, i) => ({ x, y: this.fpY[i] }))
    const weights = this.computeWeightsFromGeometric(controlPoints, farinPositions)
    return computeWrapWeightFromChain(controlPoints, farinPositions, weights)
  }

  // Farin positions from the frozen weights + current z: the wrap edge (n-1)
  // blends with the fixed wrapWeight, interior edges with adjacent weights.
  private farinFromFixedWeights(cps: { re: number; im: number }[]): Point2D[] {
    const n = cps.length
    const numEdges = this.closed ? n : n - 1
    const cmul = (a: { re: number; im: number }, b: { re: number; im: number }) =>
      ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
    const out: Point2D[] = []
    for (let i = 0; i < numEdges; i++) {
      const i1 = (i + 1) % n
      const w0 = this.fixedWeights[i]
      const w1 = this.closed && i === n - 1 ? this.fixedWrapWeight : this.fixedWeights[i1]
      const z0 = cps[i], z1 = cps[i1]
      const num = { re: cmul(w0, z0).re + cmul(w1, z1).re, im: cmul(w0, z0).im + cmul(w1, z1).im }
      const den = { re: w0.re + w1.re, im: w0.im + w1.im }
      const d2 = den.re * den.re + den.im * den.im
      if (d2 < 1e-20) { out.push({ x: (z0.re + z1.re) / 2, y: (z0.im + z1.im) / 2 }); continue }
      out.push({
        x: (num.re * den.re + num.im * den.im) / d2,
        y: (num.im * den.re - num.re * den.im) / d2,
      })
    }
    return out
  }

  // ==========================================================================
  // Internal — gCPs
  // ==========================================================================

  private computeGCPs(): number[] {
    if (this.cachedGCPs) return this.cachedGCPs
    if (this.useFixedWeightClosed) {
      const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
      return (this.cachedGCPs = computeGCPsFromFixedWeightClosed(
        this.degree, this.knots, controlPoints, this.fixedWeights, this.fixedWrapWeight, this.period
      ))
    }
    if (this.useGeometric) {
      const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
      const farinPositions = this.fpX.map((x, i) => ({ x, y: this.fpY[i] }))
      return (this.cachedGCPs = computeGCPsFromGeometric(this.degree, this.knots, controlPoints, farinPositions, this.period, this.closed))
    }
    // Homogeneous: compute directly from Z coords
    return (this.cachedGCPs = computeGCPsFromHomogeneous(
      this.knots, this.cpX, this.cpY, this.fixedWre!, this.fixedWim!
    ))
  }

  // ==========================================================================
  // Internal — Result extraction helpers
  // ==========================================================================

  private getControlPointsGeometric(): ComplexPoint[] {
    const S = this.coordScale
    // Weights are computed from normalized coords (S cancels in ratios)
    const controlPoints = this.cpX.map((x, i) => ({ re: x, im: this.cpY[i] }))
    const farinPositions = this.fpX.map((x, i) => ({ x, y: this.fpY[i] }))
    const weights = this.computeWeightsFromGeometric(controlPoints, farinPositions)
    // Scale back to original coordinate space
    return controlPoints.map((cp, i) => ({
      re: cp.re * S,
      im: cp.im * S,
      w_re: weights[i].re,
      w_im: weights[i].im,
    }))
  }

  private getControlPointsHomogeneous(): ComplexPoint[] {
    const n = this.cpX.length
    const S = this.coordScale
    const wRe = this.fixedWre!
    const wIm = this.fixedWim!
    const result: ComplexPoint[] = []

    for (let i = 0; i < n; i++) {
      // Z_actual = Z_normalized * S, then z = Z_actual / w
      const Zre = this.cpX[i] * S
      const Zim = this.cpY[i] * S
      const d2 = wRe[i] * wRe[i] + wIm[i] * wIm[i]
      const z_re = d2 > 1e-20 ? (Zre * wRe[i] + Zim * wIm[i]) / d2 : Zre
      const z_im = d2 > 1e-20 ? (Zim * wRe[i] - Zre * wIm[i]) / d2 : Zim
      result.push({ re: z_re, im: z_im, w_re: wRe[i], w_im: wIm[i] })
    }
    return result
  }

  private getFarinPositionsHomogeneous(): Point2D[] {
    const n = this.cpX.length
    const S = this.coordScale
    const wRe = this.fixedWre!
    const wIm = this.fixedWim!
    const positions: Point2D[] = []

    for (let k = 0; k < n - 1; k++) {
      // Scale Z back before computing Farin position
      const sumZ_re = (this.cpX[k] + this.cpX[k + 1]) * S
      const sumZ_im = (this.cpY[k] + this.cpY[k + 1]) * S
      const sumW_re = wRe[k] + wRe[k + 1]
      const sumW_im = wIm[k] + wIm[k + 1]
      const d2 = sumW_re * sumW_re + sumW_im * sumW_im
      if (d2 > 1e-20) {
        positions.push({
          x: (sumZ_re * sumW_re + sumZ_im * sumW_im) / d2,
          y: (sumZ_im * sumW_re - sumZ_re * sumW_im) / d2,
        })
      } else {
        positions.push({ x: sumZ_re / 2, y: sumZ_im / 2 })
      }
    }
    return positions
  }

  // ==========================================================================
  // Internal — Weight computation
  // ==========================================================================

  private computeWeightsFromCurve(curve: ComplexRationalBSplineCurve): { re: number; im: number }[] {
    const n = curve.controlPoints.length
    const numEdges = curve.closed ? n : n - 1

    // Use Farin positions if available
    if (curve.farinPositions && curve.farinPositions.length === numEdges) {
      const controlPoints = curve.controlPoints.map(p => ({ re: p.re, im: p.im }))
      return this.computeWeightsFromGeometric(controlPoints, curve.farinPositions)
    }

    // Otherwise use the curve's stored weights
    return curve.controlPoints.map(p => ({ re: p.w_re, im: p.w_im }))
  }

  private computeWeightsFromGeometric(
    controlPoints: { re: number; im: number }[],
    farinPositions: { x: number; y: number }[]
  ): { re: number; im: number }[] {
    const n = controlPoints.length
    const weights: { re: number; im: number }[] = [{ re: 1, im: 0 }]

    for (let i = 1; i < n; i++) {
      const q = farinPositions[i - 1]
      const z0 = controlPoints[i - 1]
      const z1 = controlPoints[i]
      const wPrev = weights[i - 1]

      const num_re = q.x - z0.re
      const num_im = q.y - z0.im
      const denom_re = z1.re - q.x
      const denom_im = z1.im - q.y

      const d2 = denom_re * denom_re + denom_im * denom_im
      if (d2 < 1e-20) {
        weights.push({ ...wPrev })
        continue
      }
      const ratio_re = (num_re * denom_re + num_im * denom_im) / d2
      const ratio_im = (num_im * denom_re - num_re * denom_im) / d2

      weights.push({
        re: wPrev.re * ratio_re - wPrev.im * ratio_im,
        im: wPrev.re * ratio_im + wPrev.im * ratio_re,
      })
    }
    return weights
  }

  // ==========================================================================
  // Internal — Inactive set computation
  // ==========================================================================

  private computeInactiveSet(gCPs: number[]): Set<number> {
    const inactive = new Set<number>()
    const n = gCPs.length
    if (n === 0) return inactive

    const sequences: { idx: number; absVal: number }[][] = []
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
        sequences.push(sequence)
        i = j + 1
      } else {
        i++
      }
    }

    // Periodic wrap-around (closed curves only)
    if (this.closed && gCPs[n - 1] * gCPs[0] <= 0) {
      const wrapSequence: { idx: number; absVal: number }[] = [
        { idx: n - 1, absVal: Math.abs(gCPs[n - 1]) },
        { idx: 0, absVal: Math.abs(gCPs[0]) },
      ]
      const lastSeq = sequences.length > 0 ? sequences[sequences.length - 1] : null
      if (lastSeq && lastSeq[lastSeq.length - 1].idx === n - 1) {
        for (let k = 0; k < lastSeq.length - 1; k++) wrapSequence.unshift(lastSeq[k])
        sequences.pop()
      }
      const firstSeq = sequences.length > 0 ? sequences[0] : null
      if (firstSeq && firstSeq[0].idx === 0) {
        for (let k = 1; k < firstSeq.length; k++) wrapSequence.push(firstSeq[k])
        sequences.shift()
      }
      sequences.push(wrapSequence)
    }

    for (const sequence of sequences) {
      const maxEntry = sequence.reduce((max, entry) => entry.absVal > max.absVal ? entry : max)
      for (const entry of sequence) {
        if (entry.idx !== maxEntry.idx) inactive.add(entry.idx)
      }
    }

    return inactive
  }

  private computeFarinFromCurrentWeights(curve: ComplexRationalBSplineCurve): { computeFarinFromWeights: Point2D[] } {
    const n = curve.controlPoints.length
    const numEdges = curve.closed ? n : n - 1
    const positions: Point2D[] = []

    for (let i = 0; i < numEdges; i++) {
      const cp0 = curve.controlPoints[i]
      const cp1 = curve.controlPoints[(i + 1) % n]

      const w0_re = cp0.w_re, w0_im = cp0.w_im
      // On the wrap edge (i = n-1) the reused control point 0 carries its
      // weight one lap around the loop — wrapWeight = w₀·ρ, not w₀. Using
      // the plain w₀ would lose the periodic monodromy (ρ≠1 after a drag),
      // mirroring the same fix in computeComplexFarinPoints. Only matters
      // on the fallback path where farinPositions is absent.
      const isWrapEdge = curve.closed && i === n - 1
      const w1_re = isWrapEdge && curve.wrapWeight ? curve.wrapWeight.re : cp1.w_re
      const w1_im = isWrapEdge && curve.wrapWeight ? curve.wrapWeight.im : cp1.w_im

      const num_re = (w0_re * cp0.re - w0_im * cp0.im + w1_re * cp1.re - w1_im * cp1.im)
      const num_im = (w0_re * cp0.im + w0_im * cp0.re + w1_re * cp1.im + w1_im * cp1.re)
      const denom_re = w0_re + w1_re
      const denom_im = w0_im + w1_im
      const d2 = denom_re * denom_re + denom_im * denom_im
      if (d2 < 1e-20) {
        positions.push({ x: (cp0.re + cp1.re) / 2, y: (cp0.im + cp1.im) / 2 })
      } else {
        positions.push({
          x: (num_re * denom_re + num_im * denom_im) / d2,
          y: (num_im * denom_re - num_re * denom_im) / d2,
        })
      }
    }

    return { computeFarinFromWeights: positions }
  }

  // ==========================================================================
  // Internal — Single-Farin mode
  // ==========================================================================

  /**
   * Compute fixed complex ratios r_k = (q_k - z_k) / (z_{k+1} - z_k)
   * for all non-dragged Farin points. These ratios are preserved when CPs move.
   * Property: weight ratio w_{k+1}/w_k = r_k / (1 - r_k) depends only on r_k.
   */
  private computeFixedRatios(): void {
    const n = this.cpX.length
    const m = this.fpX.length
    this.fixedRatios = []

    for (let k = 0; k < m; k++) {
      if (k === this.draggedFarinIdx) {
        this.fixedRatios.push({ re: 0, im: 0 }) // placeholder, not used
        continue
      }
      const k1 = (k + 1) % n
      const dx = this.cpX[k1] - this.cpX[k]
      const dy = this.cpY[k1] - this.cpY[k]
      const d2 = dx * dx + dy * dy
      if (d2 < 1e-20) {
        this.fixedRatios.push({ re: 0.5, im: 0 })
        continue
      }
      const num_re = this.fpX[k] - this.cpX[k]
      const num_im = this.fpY[k] - this.cpY[k]
      // r = (q - z_k) / (z_{k+1} - z_k) as complex division
      this.fixedRatios.push({
        re: (num_re * dx + num_im * dy) / d2,
        im: (num_im * dx - num_re * dy) / d2,
      })
    }
  }

  /**
   * Reconstruct non-dragged Farin positions from fixed ratios and current CPs.
   * q_k = z_k + r_k · (z_{k+1} - z_k)
   */
  private reconstructFarinPositions(): void {
    const n = this.cpX.length
    const m = this.fpX.length
    for (let k = 0; k < m; k++) {
      if (k === this.draggedFarinIdx) continue
      const r = this.fixedRatios[k]
      const k1 = (k + 1) % n
      const dx = this.cpX[k1] - this.cpX[k]
      const dy = this.cpY[k1] - this.cpY[k]
      this.fpX[k] = this.cpX[k] + r.re * dx - r.im * dy
      this.fpY[k] = this.cpY[k] + r.im * dx + r.re * dy
    }
  }

  /**
   * Project full geometric Jacobian to reduced single-Farin variable space.
   * Uses chain rule: dg/dx_i = ∂g/∂x_i + Σ_{k≠j} (∂g/∂qx_k · ∂qx_k/∂x_i + ∂g/∂qy_k · ∂qy_k/∂x_i)
   */
  private projectJacobianToSingleFarin(fullJacobian: Matrix): Matrix {
    const n = this.cpX.length
    const m = this.fpX.length
    const j = this.draggedFarinIdx
    const numRows = fullJacobian.length
    const reducedCols = 2 * n + 2

    const reduced: Matrix = []
    for (let c = 0; c < numRows; c++) {
      const row = new Array(reducedCols).fill(0)
      const full = fullJacobian[c]

      // Start with partial derivatives w.r.t. CP variables
      for (let i = 0; i < n; i++) {
        row[i] = full[i]           // ∂g/∂x_i
        row[n + i] = full[n + i]   // ∂g/∂y_i
      }

      // Add chain rule contributions from non-dragged Farin points
      for (let k = 0; k < m; k++) {
        if (k === j) continue

        const r = this.fixedRatios[k]
        const a = r.re, b = r.im
        const dg_dqx = full[2 * n + k]       // ∂g/∂qx_k
        const dg_dqy = full[2 * n + m + k]   // ∂g/∂qy_k

        const iStart = k
        const iEnd = (k + 1) % n

        // q_k = z_k·(1-r) + z_{k+1}·r  in complex arithmetic
        // ∂qx_k/∂x_{start} = 1-a,  ∂qy_k/∂x_{start} = -b
        row[iStart]     += dg_dqx * (1 - a) + dg_dqy * (-b)
        // ∂qx_k/∂y_{start} = b,    ∂qy_k/∂y_{start} = 1-a
        row[n + iStart] += dg_dqx * b + dg_dqy * (1 - a)

        // ∂qx_k/∂x_{end} = a,      ∂qy_k/∂x_{end} = b
        row[iEnd]       += dg_dqx * a + dg_dqy * b
        // ∂qx_k/∂y_{end} = -b,     ∂qy_k/∂y_{end} = a
        row[n + iEnd]   += dg_dqx * (-b) + dg_dqy * a
      }

      // Dragged Farin columns (direct, no chain rule)
      row[2 * n]     = full[2 * n + j]       // ∂g/∂qx_j
      row[2 * n + 1] = full[2 * n + m + j]   // ∂g/∂qy_j

      reduced.push(row)
    }

    return reduced
  }

  private invalidateCache(): void {
    this.cachedConstraints = null
    this.cachedJacobian = null
    this.cachedGCPs = null
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function computeComplexRationalConstraintState(
  curve: ComplexRationalBSplineCurve
): ComplexRationalConstraintState {
  const cpX = curve.controlPoints.map(p => p.re)
  const cpY = curve.controlPoints.map(p => p.im)

  const problem = new ComplexRationalBSplineCurveProblem(
    curve,
    cpX[0], cpY[0],
    0, 'controlPoint'
  )
  return problem.getConstraintState()
}
