// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * B-Spline Curve Optimization Problem
 *
 * Implements OptimizationProblem interface for optimizing B-spline curves
 * while preserving curvature extrema count.
 *
 * Objective: Minimize distance from control points to target positions
 * Constraints: Curvature derivative numerator control points maintain sign
 *              (this preserves the number of curvature extrema)
 *
 * Uses proper B-spline algebra via Bernstein decomposition for exact
 * constraint computation, leveraging the variation diminishing property.
 */

import {
  type BSpline2D,
  cpToArray,
  cpFromArray,
  knotsToArray,
} from './bsplineTypes'
import {
  computeCurvatureDerivativeNumeratorCPs,
  computeCurvatureDerivativeNumeratorBD,
  computeInflectionCPsFromArrays,
  computeInflectionJacobian,
  precomputeBasisDerivatives,
  computeExplicitJacobian,
  type PrecomputedBasisDerivatives,
} from './algebra'
import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'

// ============================================================================
// B-Spline Curve Problem
// ============================================================================

export class BSplineCurveProblem implements OptimizationProblem {
  private curve: BSpline2D
  private targetX: number[]
  private targetY: number[]
  private weights: number[]

  // Curvature extrema constraint state
  private constraintSigns: number[]
  private inactiveConstraints: Set<number>

  // Inflection constraint state (optional)
  private preserveInflections: boolean
  private inflectionSigns: number[]
  private inflectionInactive: Set<number>

  // When true, the inactive sets are forced empty — sign anchors stay rigid
  // and the sign-change boundary cannot slide. Used by talk demos that want
  // to show the pre-contribution behavior. Default false (sliding enabled).
  private disableSliding: boolean

  // Precomputed basis derivatives for fast Jacobian computation
  private precomputed: PrecomputedBasisDerivatives

  // Cached constraint values and Jacobian
  private cachedConstraints: number[] | null = null
  private cachedJacobian: Matrix | null = null

  // Internal mutable arrays for optimization
  private cpX: number[]
  private cpY: number[]

  constructor(
    curve: BSpline2D,
    targetX: number,
    targetY: number,
    dragIndex: number,
    weights?: number[],
    preserveInflections: boolean = false,
    disableSliding: boolean = false,
  ) {
    this.curve = curve
    this.disableSliding = disableSliding

    // Extract control points to mutable arrays
    this.cpX = cpToArray(curve.controlPointsX)
    this.cpY = cpToArray(curve.controlPointsY)
    const n = this.cpX.length

    // Set up target: only dragged point moves
    this.targetX = [...this.cpX]
    this.targetY = [...this.cpY]
    this.targetX[dragIndex] = targetX
    this.targetY[dragIndex] = targetY

    // Weights (default: uniform)
    this.weights = weights || new Array(n).fill(1)

    // Precompute basis function derivatives (done once per curve)
    const knots = knotsToArray(curve.knots)
    this.precomputed = precomputeBasisDerivatives(knots, n)

    // Initialize curvature extrema constraint state
    const gCPs = this.computeCurvatureDerivativeNumeratorCPs()
    this.constraintSigns = this.computeSigns(gCPs)
    this.inactiveConstraints = this.disableSliding
      ? new Set<number>()
      : this.computeInactiveSet(gCPs)

    // Initialize inflection constraint state
    this.preserveInflections = preserveInflections
    if (preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      this.inflectionSigns = this.computeSigns(hCPs)
      this.inflectionInactive = this.disableSliding
        ? new Set<number>()
        : this.computeInactiveSet(hCPs)
    } else {
      this.inflectionSigns = []
      this.inflectionInactive = new Set()
    }
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    return this.cpX.length * 2
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
    return [...this.cpX, ...this.cpY]
  }

  setVariables(x: number[]): void {
    const n = this.cpX.length
    this.cpX = x.slice(0, n)
    this.cpY = x.slice(n, 2 * n)
    // Update the curve with new control points
    this.curve = {
      ...this.curve,
      controlPointsX: cpFromArray(this.curve.controlPointsX, this.cpX),
      controlPointsY: cpFromArray(this.curve.controlPointsY, this.cpY),
    }
    this.invalidateCache()
  }

  computeObjective(): number {
    const n = this.cpX.length
    let f0 = 0

    for (let i = 0; i < n; i++) {
      const dx = this.cpX[i] - this.targetX[i]
      const dy = this.cpY[i] - this.targetY[i]
      f0 += this.weights[i] * 0.5 * (dx * dx + dy * dy)
    }

    return f0
  }

  computeObjectiveGradient(): number[] {
    const n = this.cpX.length
    const gradient: number[] = []

    for (let i = 0; i < n; i++) {
      gradient.push(this.weights[i] * (this.cpX[i] - this.targetX[i]))
    }
    for (let i = 0; i < n; i++) {
      gradient.push(this.weights[i] * (this.cpY[i] - this.targetY[i]))
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

    // Use explicit Jacobian computation (much faster than finite differences)
    const jacobian = computeExplicitJacobian(this.precomputed, this.cpX, this.cpY, activeIndices)

    // Append inflection Jacobian rows
    if (this.preserveInflections) {
      const hCPs = this.computeInflectionCPs()
      const activeInflectionIndices: number[] = []
      for (let i = 0; i < hCPs.length; i++) {
        if (!this.inflectionInactive.has(i)) {
          activeInflectionIndices.push(i)
        }
      }

      const inflectionJacobian = computeInflectionJacobian(
        this.precomputed,
        this.cpX,
        this.cpY,
        activeInflectionIndices
      )

      jacobian.push(...inflectionJacobian)
    }

    this.cachedJacobian = jacobian
    return jacobian
  }

  getConstraintSigns(): number[] {
    // Only return signs for active constraints (matching computeConstraints order)
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
    // The optimizer doesn't need to know about inactive constraints
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
        : this.computeInactiveSet(hCPs)
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
   * where c' = dc/dt, c'' = d²c/dt², c''' = d³c/dt³
   *
   * The zeros of g(t) correspond to curvature extrema.
   * We want to preserve the sign pattern of g's control points.
   *
   * Uses proper B-spline algebra via Bernstein decomposition for exact
   * computation, leveraging the variation diminishing property.
   */
  private computeCurvatureDerivativeNumeratorCPs(): number[] {
    return computeCurvatureDerivativeNumeratorCPs(this.curve)
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
    const knots = knotsToArray(this.curve.knots)
    return computeInflectionCPsFromArrays(knots, this.cpX, this.cpY)
  }

  // ==========================================================================
  // Sign and Inactive Constraint Computation
  // ==========================================================================

  private computeSigns(gCPs: number[]): number[] {
    return gCPs.map((g) => (g > 0 ? -1 : 1))
  }

  private computeInactiveSet(gCPs: number[]): Set<number> {
    // Find sign-changing sequences and mark all but the largest |g| as inactive
    const inactive = new Set<number>()
    const n = gCPs.length

    let i = 0
    while (i < n - 1) {
      // Check for sign change
      if (gCPs[i] * gCPs[i + 1] <= 0) {
        // Found a sign-changing sequence, collect it
        const sequence: { idx: number; absVal: number }[] = [
          { idx: i, absVal: Math.abs(gCPs[i]) },
          { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
        ]

        // Extend sequence while signs keep changing
        let j = i + 1
        while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
          j++
          sequence.push({ idx: j, absVal: Math.abs(gCPs[j]) })
        }

        // Find the index with largest |g|
        const maxEntry = sequence.reduce((max, entry) => (entry.absVal > max.absVal ? entry : max))

        // Mark all others as inactive
        for (const entry of sequence) {
          if (entry.idx !== maxEntry.idx) {
            inactive.add(entry.idx)
          }
        }

        i = j + 1
      } else {
        i++
      }
    }

    return inactive
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
// Constraint State Interface and Helper
// ============================================================================

export interface OpenCurveConstraintState {
  signs: number[]
  inactiveIndices: number[]
  gCPs: number[]
  grevilleAbscissae: number[]
}

/**
 * Compute constraint state for an open B-spline curve.
 * This is useful for capturing curve data for unit tests.
 */
export function computeOpenCurveConstraintState(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): OpenCurveConstraintState {
  // Compute curvature derivative numerator via Bernstein decomposition
  const gBD = computeCurvatureDerivativeNumeratorBD(knots, controlPointsX, controlPointsY)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()

  // Compute signs (same logic as BSplineCurveProblem)
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))

  // Compute inactive set (same logic as BSplineCurveProblem)
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
        if (entry.idx !== maxEntry.idx) {
          inactive.add(entry.idx)
        }
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
