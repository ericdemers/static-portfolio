// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Initial fit: unconstrained least-squares fitting of a periodic cubic B-spline
 * to airfoil data points.
 *
 * Given data points D_i at parameters t_i, and a periodic B-spline with n control
 * points and uniform knots, solve:
 *
 *   min_P  0.5 * Σ ||C(t_i) - D_i||²
 *
 * where C(t) = Σ B_j(t) * P_j. This reduces to the normal equations:
 *
 *   (B^T B) P = B^T D
 *
 * solved separately for x and y coordinates.
 */

import {
  findPeriodicKnotSpan,
  periodicBasisFunctions,
} from '../../utils/bspline/core'

import { choleskySolve } from '../../optimizer/linearAlgebra'

export interface InitialFitResult {
  controlPointsX: number[]
  controlPointsY: number[]
  knots: number[]
  degree: number
}

/**
 * Build the periodic basis function matrix B[i][j] = B_j(t_i).
 * Each row sums to 1 (partition of unity).
 */
export function buildPeriodicBasisMatrix(
  t: number[],
  degree: number,
  knots: number[],
  numCPs: number
): number[][] {
  const m = t.length
  const B: number[][] = []

  for (let i = 0; i < m; i++) {
    const row = new Array<number>(numCPs).fill(0)
    const tVal = ((t[i] % 1) + 1) % 1
    const span = findPeriodicKnotSpan(degree, knots, tVal)
    const N = periodicBasisFunctions(span, tVal, degree, knots)

    for (let k = 0; k <= degree; k++) {
      const cpIdx = ((span - degree + k) % numCPs + numCPs) % numCPs
      row[cpIdx] += N[k]
    }

    B.push(row)
  }

  return B
}

/**
 * Compute B^T * B (symmetric n×n matrix).
 */
function computeBtB(B: number[][], n: number): number[][] {
  const m = B.length
  const BtB: number[][] = []
  for (let i = 0; i < n; i++) {
    BtB[i] = new Array<number>(n).fill(0)
  }
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0
      for (let k = 0; k < m; k++) {
        sum += B[k][i] * B[k][j]
      }
      BtB[i][j] = sum
      BtB[j][i] = sum
    }
  }
  return BtB
}

/**
 * Compute B^T * d (n-vector) where d is an m-vector.
 */
function computeBtd(B: number[][], d: number[], n: number): number[] {
  const m = B.length
  const Btd = new Array<number>(n).fill(0)
  for (let j = 0; j < n; j++) {
    let sum = 0
    for (let i = 0; i < m; i++) {
      sum += B[i][j] * d[i]
    }
    Btd[j] = sum
  }
  return Btd
}

/**
 * Create uniform knots for a periodic B-spline with n control points.
 * Knots: [0, 1, 2, ..., n-1] / n  → values in [0, 1).
 */
export function uniformPeriodicKnots(n: number): number[] {
  const knots: number[] = []
  for (let i = 0; i < n; i++) {
    knots.push(i / n)
  }
  return knots
}

/**
 * Solve the unconstrained least-squares problem for a periodic cubic B-spline fit.
 *
 * @param t - Parameter values for data points, in [0, 1)
 * @param dataX - X coordinates of data points
 * @param dataY - Y coordinates of data points
 * @param numCPs - Number of control points (= number of knots for periodic)
 * @returns Initial fit result with control points and knot vector
 */
export function initialFit(
  t: number[],
  dataX: number[],
  dataY: number[],
  numCPs: number = 6,
  degree: number = 3,
): InitialFitResult {
  const knots = uniformPeriodicKnots(numCPs)

  // Build basis matrix
  const B = buildPeriodicBasisMatrix(t, degree, knots, numCPs)

  // Normal equations: (B^T B) P = B^T D
  const BtB = computeBtB(B, numCPs)
  const BtDx = computeBtd(B, dataX, numCPs)
  const BtDy = computeBtd(B, dataY, numCPs)

  // Solve using Cholesky (B^T B is symmetric positive definite)
  const solX = choleskySolve(BtB, BtDx)
  const solY = choleskySolve(BtB, BtDy)

  if (!solX.success || !solY.success) {
    throw new Error('Cholesky solve failed for initial fit — system may be singular')
  }

  return {
    controlPointsX: solX.x,
    controlPointsY: solY.x,
    knots,
    degree,
  }
}

/**
 * Create a geometric initial guess for a periodic B-spline with 6 CPs
 * that naturally has exactly 4 curvature extrema (like an ellipse).
 *
 * The 6 CPs are placed at key positions of the airfoil:
 * - CP0: trailing edge (upper departure)
 * - CP1: upper surface apex
 * - CP2: leading edge approach (upper)
 * - CP3: leading edge approach (lower)
 * - CP4: lower surface nadir
 * - CP5: trailing edge (lower departure)
 *
 * This "ellipse-like" layout naturally produces 4 curvature extrema:
 * max at LE, max at TE, min on upper, min on lower.
 *
 * After geometric placement, we refine CPs using one round of least-squares
 * projection that keeps the knot positions matched to data parameterization.
 */
export function geometricInitialFit(
  t: number[],
  dataX: number[],
  dataY: number[],
  numCPs: number = 6
): InitialFitResult {
  const degree = 3

  // Identify key airfoil landmarks from data
  const m = t.length
  let leIdx = 0 // leading edge: min x
  let teIdx = 0 // trailing edge: max x
  let upperIdx = 0 // upper surface: max y
  let lowerIdx = 0 // lower surface: min y

  for (let i = 0; i < m; i++) {
    if (dataX[i] < dataX[leIdx]) leIdx = i
    if (dataX[i] > dataX[teIdx]) teIdx = i
    if (dataY[i] > dataY[upperIdx]) upperIdx = i
    if (dataY[i] < dataY[lowerIdx]) lowerIdx = i
  }

  // Parameter positions of landmarks
  const tLE = t[leIdx]
  const tTE = t[teIdx] || 0 // trailing edge is usually at t ≈ 0
  const tUpper = t[upperIdx]
  const tLower = t[lowerIdx]

  // Place knots at landmark parameters (approximately)
  // For 6 CPs: knots at t_TE, between TE-upper, t_upper, t_LE, t_lower, between lower-TE
  const knots = placeKnotsAtLandmarks(numCPs, tTE, tUpper, tLE, tLower)

  // Now solve least-squares with these custom knots
  const B = buildPeriodicBasisMatrix(t, degree, knots, numCPs)
  const BtB = computeBtB(B, numCPs)
  const BtDx = computeBtd(B, dataX, numCPs)
  const BtDy = computeBtd(B, dataY, numCPs)

  const solX = choleskySolve(BtB, BtDx)
  const solY = choleskySolve(BtB, BtDy)

  if (!solX.success || !solY.success) {
    // Fallback to uniform knots
    return initialFit(t, dataX, dataY, numCPs)
  }

  return {
    controlPointsX: solX.x,
    controlPointsY: solY.x,
    knots,
    degree,
  }
}

/**
 * Place knots so they align with the airfoil's geometric landmarks.
 * This helps the B-spline's natural shape match the airfoil topology.
 */
function placeKnotsAtLandmarks(
  numCPs: number,
  tTE: number,
  tUpper: number,
  tLE: number,
  tLower: number
): number[] {
  if (numCPs === 6) {
    // 6 knots placed to align CPs with landmarks:
    // We want CP support regions centered on TE, upper, LE, lower
    // Knots: spread evenly around the key parameters
    const landmarks = [tTE, tUpper, tLE, tLower].sort((a, b) => a - b)

    // Insert midpoints to get 6 knots from 4 landmarks
    const knots: number[] = []
    for (let i = 0; i < 4; i++) {
      knots.push(landmarks[i])
      if (knots.length < 6) {
        const next = landmarks[(i + 1) % 4]
        const mid = next > landmarks[i]
          ? (landmarks[i] + next) / 2
          : ((landmarks[i] + next + 1) / 2) % 1
        knots.push(mid)
      }
    }

    // Take first 6, sort, ensure in [0, 1)
    return knots.slice(0, numCPs).sort((a, b) => a - b)
  }

  // General case: uniform
  return uniformPeriodicKnots(numCPs)
}
