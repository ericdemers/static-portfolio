// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Periodic B-Spline Curve Optimization Problem
 *
 * Implements OptimizationProblem interface for optimizing periodic (closed)
 * B-spline curves while preserving curvature extrema count.
 *
 * Uses the BD-first approach: convert to Bernstein decomposition,
 * compute derivatives and products in BD form.
 *
 * Always uses the actual knots from the curve for all computations.
 */

import {
  computePeriodicConstraintCPsFromCache,
  computePeriodicCurvatureDerivativeNumeratorCPs,
  computePeriodicCurvatureDerivativeNumeratorBDWithKnots,
  computePeriodicExplicitJacobian,
  computePeriodicInflectionCPsFromCache,
  computePeriodicInflectionJacobian,
  precomputePeriodicBasisDerivatives,
  type PrecomputedPeriodicBasisDerivatives,
} from './algebra'
import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import type { BSpline2D, PeriodicKnots } from './bsplineTypes'
import { cpToArray } from './bsplineTypes'

// ============================================================================
// Constraint State Type (for preserving across optimization steps)
// ============================================================================

export interface PeriodicConstraintState {
  signs: number[]
  inactiveIndices: number[]
}

// ============================================================================
// Periodic B-Spline Curve Problem
// ============================================================================

export class PeriodicBSplineCurveProblem implements OptimizationProblem {
  private controlPointsX: number[]
  private controlPointsY: number[]
  private targetX: number[]
  private targetY: number[]
  private weights: number[]
  private degree: number

  // Actual knots from the curve
  private knots: readonly number[]
  private period: number

  // Curvature extrema constraint state
  private constraintSigns: number[]
  private inactiveConstraints: Set<number>

  // Inflection constraint state (optional)
  private preserveInflections: boolean
  private inflectionSigns: number[]
  private inflectionInactive: Set<number>

  // Precomputed basis derivatives for fast computation
  private precomputed: PrecomputedPeriodicBasisDerivatives

  // Cached constraint values and Jacobian
  private cachedConstraints: number[] | null = null
  private cachedJacobian: Matrix | null = null

  // When true, the inactive sets are forced empty — sign anchors stay rigid
  // and the boundary cannot slide. Default false (sliding enabled).
  private disableSliding: boolean

  constructor(
    curve: BSpline2D,
    targetX: number,
    targetY: number,
    dragIndex: number,
    initialConstraintState?: PeriodicConstraintState,
    preserveInflections: boolean = false,
    anchorCPsX?: number[],
    anchorCPsY?: number[],
    anchorWeight?: number,
    disableSliding: boolean = false,
  ) {
    this.disableSliding = disableSliding
    if (curve.knots.tag !== 'periodic') {
      throw new Error('PeriodicBSplineCurveProblem requires a periodic curve')
    }

    this.controlPointsX = cpToArray(curve.controlPointsX)
    this.controlPointsY = cpToArray(curve.controlPointsY)
    this.degree = curve.degree

    // Store actual knots from curve
    const periodicKnots = curve.knots as PeriodicKnots
    this.knots = periodicKnots.baseKnots
    this.period = periodicKnots.period

    const n = this.controlPointsX.length

    // Set up target and weights
    if (anchorCPsX && anchorCPsY && anchorWeight !== undefined && anchorWeight > 0) {
      // Weighted anchoring mode: undragged CPs are pulled toward their drag-start positions
      this.targetX = [...anchorCPsX]
      this.targetY = [...anchorCPsY]
      this.targetX[dragIndex] = targetX
      this.targetY[dragIndex] = targetY
      this.weights = new Array(n).fill(anchorWeight)
      this.weights[dragIndex] = 1
    } else {
      // Default: only dragged point moves
      this.targetX = [...this.controlPointsX]
      this.targetY = [...this.controlPointsY]
      this.targetX[dragIndex] = targetX
      this.targetY[dragIndex] = targetY
      this.weights = new Array(n).fill(1)
    }

    // Precompute basis function derivatives using actual knots
    this.precomputed = precomputePeriodicBasisDerivatives(this.degree, this.knots, this.period)

    // Initialize curvature extrema constraint state
    if (initialConstraintState) {
      this.constraintSigns = [...initialConstraintState.signs]
      this.inactiveConstraints = this.disableSliding
        ? new Set<number>()
        : new Set(initialConstraintState.inactiveIndices)
    } else {
      const gCPs = this.computeCurvatureDerivativeNumeratorCPs()
      this.constraintSigns = this.computeSigns(gCPs)
      this.inactiveConstraints = this.disableSliding
        ? new Set<number>()
        : this.computeInactiveSet(gCPs)
    }

    // Initialize inflection constraint state
    this.preserveInflections = preserveInflections
    if (preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      this.inflectionSigns = this.computeSigns(hCPs)
      this.inflectionInactive = this.disableSliding
        ? new Set<number>()
        : computePeriodicInactiveSet(hCPs)
    } else {
      this.inflectionSigns = []
      this.inflectionInactive = new Set()
    }
  }

  /**
   * Get the current constraint state for reuse in subsequent optimization steps.
   * This should be called once at drag start and passed to all subsequent steps.
   */
  getConstraintState(): PeriodicConstraintState {
    return {
      signs: [...this.constraintSigns],
      inactiveIndices: Array.from(this.inactiveConstraints),
    }
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    return this.controlPointsX.length * 2
  }

  get numConstraints(): number {
    const gCPs = this.computeCurvatureDerivativeNumeratorCPs()
    let count = gCPs.length - this.inactiveConstraints.size
    if (this.preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      count += hCPs.length - this.inflectionInactive.size
    }
    return count
  }

  get numEqualityConstraints(): number {
    return 0
  }

  getVariables(): number[] {
    return [...this.controlPointsX, ...this.controlPointsY]
  }

  setVariables(x: number[]): void {
    const n = this.controlPointsX.length
    this.controlPointsX = x.slice(0, n)
    this.controlPointsY = x.slice(n, 2 * n)
    this.invalidateCache()
  }

  computeObjective(): number {
    const n = this.controlPointsX.length
    let f0 = 0

    for (let i = 0; i < n; i++) {
      const dx = this.controlPointsX[i] - this.targetX[i]
      const dy = this.controlPointsY[i] - this.targetY[i]
      f0 += this.weights[i] * 0.5 * (dx * dx + dy * dy)
    }

    return f0
  }

  computeObjectiveGradient(): number[] {
    const n = this.controlPointsX.length
    const gradient: number[] = []

    for (let i = 0; i < n; i++) {
      gradient.push(this.weights[i] * (this.controlPointsX[i] - this.targetX[i]))
    }
    for (let i = 0; i < n; i++) {
      gradient.push(this.weights[i] * (this.controlPointsY[i] - this.targetY[i]))
    }

    return gradient
  }

  computeConstraints(): number[] {
    if (this.cachedConstraints) {
      return this.cachedConstraints
    }

    const gCPs = this.computeCurvatureDerivativeNumeratorCPs()
    const constraints: number[] = []

    for (let i = 0; i < gCPs.length; i++) {
      if (this.inactiveConstraints.has(i)) continue
      constraints.push(gCPs[i])
    }

    // Append inflection constraints
    if (this.preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      for (let i = 0; i < hCPs.length; i++) {
        if (this.inflectionInactive.has(i)) continue
        constraints.push(hCPs[i])
      }
    }

    this.cachedConstraints = constraints
    return constraints
  }

  computeConstraintJacobian(): Matrix {
    if (this.cachedJacobian) {
      return this.cachedJacobian
    }

    const gCPs = this.computeCurvatureDerivativeNumeratorCPs()

    // Build list of active curvature extrema constraint indices
    const activeIndices: number[] = []
    for (let i = 0; i < gCPs.length; i++) {
      if (!this.inactiveConstraints.has(i)) {
        activeIndices.push(i)
      }
    }

    const jacobian = computePeriodicExplicitJacobian(
      this.precomputed,
      this.controlPointsX,
      this.controlPointsY,
      activeIndices
    )

    // Append inflection Jacobian rows
    if (this.preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      const activeInflectionIndices: number[] = []
      for (let i = 0; i < hCPs.length; i++) {
        if (!this.inflectionInactive.has(i)) {
          activeInflectionIndices.push(i)
        }
      }

      const inflectionJacobian = computePeriodicInflectionJacobian(
        this.precomputed,
        this.controlPointsX,
        this.controlPointsY,
        activeInflectionIndices
      )

      jacobian.push(...inflectionJacobian)
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
    if (this.preserveInflections) {
      for (let i = 0; i < this.inflectionSigns.length; i++) {
        if (!this.inflectionInactive.has(i)) {
          activeSigns.push(this.inflectionSigns[i])
        }
      }
    }
    return activeSigns
  }

  getInactiveConstraints(): Set<number> {
    // Return empty set since we already filter in getConstraintSigns and computeConstraints
    return new Set<number>()
  }

  updateConstraintState(): void {
    const gCPs = this.computeCurvatureDerivativeNumeratorCPs()
    this.constraintSigns = this.computeSigns(gCPs)
    this.inactiveConstraints = this.disableSliding
      ? new Set<number>()
      : this.computeInactiveSet(gCPs)
    if (this.preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      this.inflectionSigns = this.computeSigns(hCPs)
      this.inflectionInactive = this.disableSliding
        ? new Set<number>()
        : computePeriodicInactiveSet(hCPs)
    }
    this.invalidateCache()
  }

  // ==========================================================================
  // Curvature Derivative Numerator
  // ==========================================================================

  /**
   * Compute control points of the curvature derivative numerator:
   * g(t) = (c'·c') * (c' × c''') - 3 * (c'·c'') * (c' × c'')
   *
   * Uses the precomputed basis derivatives (which use actual knots).
   */
  private computeCurvatureDerivativeNumeratorCPs(): number[] {
    return computePeriodicConstraintCPsFromCache(
      this.precomputed,
      this.controlPointsX,
      this.controlPointsY
    )
  }

  // ==========================================================================
  // Inflection (Curvature Numerator)
  // ==========================================================================

  /**
   * Compute control points of the curvature numerator:
   * h4(t) = x'·y'' - y'·x''
   * Zeros of h4 are inflection points.
   */
  private computeInflectionCPs(): number[] {
    return computePeriodicInflectionCPsFromCache(
      this.precomputed,
      this.controlPointsX,
      this.controlPointsY
    )
  }

  // ==========================================================================
  // Sign and Inactive Constraint Computation
  // ==========================================================================

  private computeSigns(gCPs: number[]): number[] {
    return gCPs.map(g => (g > 0 ? -1 : 1))
  }

  private computeInactiveSet(gCPs: number[]): Set<number> {
    return computePeriodicInactiveSet(gCPs)
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private invalidateCache(): void {
    this.cachedConstraints = null
    this.cachedJacobian = null
  }
}

// ============================================================================
// Periodic Inactive Set Computation
// ============================================================================

/**
 * Compute the inactive constraint set for periodic curves.
 * Handles wrap-around: sign-change sequences that cross the boundary
 * between the last and first control point are merged into one sequence,
 * allowing the zero to slide across the periodic boundary.
 */
function computePeriodicInactiveSet(gCPs: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gCPs.length
  if (n === 0) return inactive

  // Collect all interior sign-changing sequences
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

  // PERIODIC WRAP-AROUND: Check for sign change between last and first CP
  if (gCPs[n - 1] * gCPs[0] <= 0) {
    const wrapSequence: { idx: number; absVal: number }[] = [
      { idx: n - 1, absVal: Math.abs(gCPs[n - 1]) },
      { idx: 0, absVal: Math.abs(gCPs[0]) },
    ]

    // Merge with the last interior sequence if it touches index n-1
    const lastSeq = sequences.length > 0 ? sequences[sequences.length - 1] : null
    if (lastSeq && lastSeq[lastSeq.length - 1].idx === n - 1) {
      for (let k = 0; k < lastSeq.length - 1; k++) {
        wrapSequence.unshift(lastSeq[k])
      }
      sequences.pop()
    }

    // Merge with the first interior sequence if it touches index 0
    const firstSeq = sequences.length > 0 ? sequences[0] : null
    if (firstSeq && firstSeq[0].idx === 0) {
      for (let k = 1; k < firstSeq.length; k++) {
        wrapSequence.push(firstSeq[k])
      }
      sequences.shift()
    }

    sequences.push(wrapSequence)
  }

  // For each sequence, keep the largest |g| active and mark the rest inactive
  for (const sequence of sequences) {
    const maxEntry = sequence.reduce((max, entry) =>
      entry.absVal > max.absVal ? entry : max
    )
    for (const entry of sequence) {
      if (entry.idx !== maxEntry.idx) {
        inactive.add(entry.idx)
      }
    }
  }

  return inactive
}

// ============================================================================
// Convenience functions for optimization
// ============================================================================

/**
 * Compute the initial constraint state for a periodic B-spline curve.
 * Call this once at drag start and pass the result to all subsequent optimization steps.
 */
export function computePeriodicConstraintState(
  curve: BSpline2D
): PeriodicConstraintState {
  if (curve.knots.tag !== 'periodic') {
    throw new Error('computePeriodicConstraintState requires a periodic curve')
  }

  // Create a temporary problem to compute constraint state
  // Using index 0 and same position as target (no-op optimization target)
  const cpsX = cpToArray(curve.controlPointsX)
  const problem = new PeriodicBSplineCurveProblem(
    curve,
    cpsX[0],
    cpToArray(curve.controlPointsY)[0],
    0
  )
  return problem.getConstraintState()
}

// ============================================================================
// Closed Curve Constraint State (with gCPs for visualization)
// ============================================================================

export interface ClosedCurveConstraintState {
  signs: number[]
  inactiveIndices: number[]
  gCPs: number[]
  grevilleAbscissae: number[]
}

/**
 * Compute constraint state for a closed B-spline curve including gCPs.
 * This is used for visualization in the BottomPanel.
 *
 * Uses actual knots from the curve for correct Bernstein decomposition.
 */
export function computeClosedCurveConstraintState(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[],
  degree: number,
  period: number = 1.0
): ClosedCurveConstraintState {
  // Compute curvature derivative numerator via Bernstein decomposition
  const gBD = computePeriodicCurvatureDerivativeNumeratorBDWithKnots(degree, knots, controlPointsX, controlPointsY, period)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()

  // Compute signs (same logic as PeriodicBSplineCurveProblem)
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))

  // Compute inactive set with periodic wrap-around (same logic as PeriodicBSplineCurveProblem)
  const inactive = computePeriodicInactiveSet(gCPs)

  return {
    signs,
    inactiveIndices: Array.from(inactive),
    gCPs,
    grevilleAbscissae,
  }
}
