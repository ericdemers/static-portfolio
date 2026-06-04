// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Degree 5 B-spline fitting with jerk energy regularization.
 *
 * The combined objective is quadratic in control points:
 *
 *   f(P) = Σ||C(tᵢ) - Dᵢ||² + λ · ∫||C'''(t)||² dt
 *
 * Both terms are quadratic → the minimum is a linear system:
 *
 *   (BᵀB + λM) · cpX = BᵀDx
 *   (BᵀB + λM) · cpY = BᵀDy
 *
 * Where M[i][j] = ∫ Bᵢ'''(t) · Bⱼ'''(t) dt is the jerk Gram matrix.
 */

import {
  type PrecomputedPeriodicBasisDerivatives,
  type BernsteinDecomposition,
  precomputePeriodicBasisDerivatives,
  integrateBD,
  computeClosedCurvatureExtremaParameters,
} from '../../optimizer/algebra'

export type FairnessEnergyType = 'strain' | 'jerk' | 'snap'
import { buildPeriodicBasisMatrix, uniformPeriodicKnots } from '../pipeline/initialFit'
import { choleskySolve, luSolve } from '../../optimizer/linearAlgebra'
import { computeFootPointMetrics } from '../pipeline/footPoint'

/**
 * Compute the jerk Gram matrix M[i][j] = ∫ Bᵢ'''(t) · Bⱼ'''(t) dt.
 *
 * Uses the precomputed third derivatives of basis functions (BernsteinDecomposition),
 * multiplies each pair, integrates, and evaluates the definite integral over [0, period].
 */
export function computeJerkGramMatrix(
  precomputed: PrecomputedPeriodicBasisDerivatives,
): number[][] {
  const n = precomputed.numControlPoints
  const M: number[][] = []
  for (let i = 0; i < n; i++) {
    M[i] = new Array(n).fill(0)
  }

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const d3i = precomputed.d3BasisFunctions_du3[i]
      const d3j = precomputed.d3BasisFunctions_du3[j]

      // Multiply the two BD representations span-by-span
      const product = d3i.multiply(d3j)

      // Integrate the product
      const antideriv = integrateBD(product, 0)

      // Definite integral: evaluate at end of last span minus start of first span
      const lastSpan = antideriv.controlPointsArray[antideriv.controlPointsArray.length - 1]
      const integralValue = lastSpan[lastSpan.length - 1] // value at period end

      M[i][j] = integralValue
      M[j][i] = integralValue
    }
  }

  return M
}

/** Map energy type to its derivative order */
export function fairnessDerivativeOrder(energyType: FairnessEnergyType): number {
  switch (energyType) {
    case 'strain': return 2
    case 'jerk': return 3
    case 'snap': return 4
  }
}

/**
 * Compute the Gram matrix for a given fairness energy type.
 * M[i][j] = ∫ d^k B_i(t) · d^k B_j(t) dt, where k is the derivative order.
 */
export function computeFairnessGramMatrix(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  energyType: FairnessEnergyType,
): number[][] {
  const n = precomputed.numControlPoints

  let derivatives: BernsteinDecomposition[]
  switch (energyType) {
    case 'strain': derivatives = precomputed.d2BasisFunctions_du2; break
    case 'jerk': derivatives = precomputed.d3BasisFunctions_du3; break
    case 'snap': derivatives = precomputed.d4BasisFunctions_du4; break
  }

  const M: number[][] = []
  for (let i = 0; i < n; i++) {
    M[i] = new Array(n).fill(0)
  }

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const product = derivatives[i].multiply(derivatives[j])
      const antideriv = integrateBD(product, 0)
      const lastSpan = antideriv.controlPointsArray[antideriv.controlPointsArray.length - 1]
      const integralValue = lastSpan[lastSpan.length - 1]

      M[i][j] = integralValue
      M[j][i] = integralValue
    }
  }

  return M
}

/**
 * Solve the fairness-regularized least-squares system:
 *   (BᵀB + λ·M) · cp = Bᵀ·data
 */
export function fairnessLeastSquares(
  t: number[],
  dataX: number[],
  dataY: number[],
  knots: number[],
  degree: number,
  numCPs: number,
  lambda: number,
  jerkGram: number[][],
): { cpX: number[]; cpY: number[] } | null {
  const B = buildPeriodicBasisMatrix(t, degree, knots, numCPs)
  const m = t.length

  // Compute BᵀB
  const BtB: number[][] = []
  for (let i = 0; i < numCPs; i++) BtB[i] = new Array(numCPs).fill(0)
  for (let i = 0; i < numCPs; i++) {
    for (let j = i; j < numCPs; j++) {
      let sum = 0
      for (let k = 0; k < m; k++) sum += B[k][i] * B[k][j]
      BtB[i][j] = sum
      BtB[j][i] = sum
    }
  }

  // Compute BᵀDx and BᵀDy
  const BtDx = new Array(numCPs).fill(0)
  const BtDy = new Array(numCPs).fill(0)
  for (let j = 0; j < numCPs; j++) {
    let sx = 0, sy = 0
    for (let k = 0; k < m; k++) {
      sx += B[k][j] * dataX[k]
      sy += B[k][j] * dataY[k]
    }
    BtDx[j] = sx
    BtDy[j] = sy
  }

  // Form A = BᵀB + λ·M
  const A: number[][] = []
  for (let i = 0; i < numCPs; i++) {
    A[i] = new Array(numCPs)
    for (let j = 0; j < numCPs; j++) {
      A[i][j] = BtB[i][j] + lambda * jerkGram[i][j]
    }
  }

  // Solve using Cholesky (A should be symmetric positive definite)
  const solX = choleskySolve(A, BtDx)
  if (!solX.success) {
    const luX = luSolve(A, BtDx)
    const luY = luSolve(A, BtDy)
    if (!luX.success || !luY.success) return null
    return { cpX: luX.x, cpY: luY.x }
  }

  const solY = choleskySolve(A, BtDy)
  if (!solY.success) {
    const luY = luSolve(A, BtDy)
    if (!luY.success) return null
    return { cpX: solX.x, cpY: luY.x }
  }

  return { cpX: solX.x, cpY: solY.x }
}

/** Compute RMS fit error (fast, no foot-point projection) */
function quickRMS(
  t: number[], dataX: number[], dataY: number[],
  cpX: number[], cpY: number[],
  knots: number[], degree: number, numCPs: number,
): number {
  const B = buildPeriodicBasisMatrix(t, degree, knots, numCPs)
  let sumSq = 0
  for (let i = 0; i < t.length; i++) {
    let cx = 0, cy = 0
    for (let j = 0; j < numCPs; j++) {
      cx += B[i][j] * cpX[j]
      cy += B[i][j] * cpY[j]
    }
    const dx = cx - dataX[i], dy = cy - dataY[i]
    sumSq += dx * dx + dy * dy
  }
  return Math.sqrt(sumSq / t.length)
}

interface FairnessCandidate {
  cpX: number[]
  cpY: number[]
  lambda: number
  numExtrema: number
  rms: number
}

/**
 * Fairness fit: sweep λ to find the best trade-off between fit quality
 * and number of curvature extrema.
 *
 * Strategy: sample λ on a logarithmic scale, track both extrema count and
 * fit quality. As λ increases: extrema may decrease (smoothing), but beyond
 * a point the curve degenerates (RMS explodes). We pick the solution with
 * fewest extrema among those with acceptable fit quality, preferring lower λ.
 */
export function fairnessFit(
  t: number[],
  dataX: number[],
  dataY: number[],
  knots: number[],
  degree: number,
  numCPs: number,
  targetExtrema: number,
  options?: { maxIterations?: number; reparamRounds?: number; energyType?: FairnessEnergyType },
): { cpX: number[]; cpY: number[]; lambda: number; numExtrema: number } {
  const reparamRounds = options?.reparamRounds ?? 5
  const energyType = options?.energyType ?? 'jerk'

  // Precompute once
  const precomputed = precomputePeriodicBasisDerivatives(degree, knots, 1.0)
  const jerkGram = computeFairnessGramMatrix(precomputed, energyType)

  // Phase 1: Pure LS solution (λ=0) — baseline
  const pureLSSol = fairnessLeastSquares(t, dataX, dataY, knots, degree, numCPs, 0, jerkGram)
  if (!pureLSSol) {
    throw new Error('Pure LS solve failed — system is singular')
  }
  const pureExtrema = computeClosedCurvatureExtremaParameters(knots, pureLSSol.cpX, pureLSSol.cpY, degree)
  const pureRMS = quickRMS(t, dataX, dataY, pureLSSol.cpX, pureLSSol.cpY, knots, degree, numCPs)

  let best: FairnessCandidate = {
    cpX: pureLSSol.cpX, cpY: pureLSSol.cpY,
    lambda: 0, numExtrema: pureExtrema.length, rms: pureRMS,
  }

  console.log(`[fairnessFit] λ=0: ${best.numExtrema} extrema, RMS=${pureRMS.toExponential(3)}`)

  // If already at or below target, skip sweep
  if (best.numExtrema <= targetExtrema) {
    return reparameterize(best, knots, degree, numCPs, dataX, dataY, jerkGram, 0, targetExtrema, reparamRounds)
  }

  // Phase 2: Logarithmic sweep of λ
  // Degeneration threshold: RMS more than 10x worse than pure LS means curve is collapsing
  const rmsThreshold = pureRMS * 10

  // Sample λ values on log scale: 1e-6, 1e-5, ..., 1e6 (normalized by Gram scale)
  const gramScale = jerkGram[0][0] || 1
  const lambdaBase = pureRMS * pureRMS / gramScale // normalize so λ=1 roughly balances terms

  const candidates: FairnessCandidate[] = [best]

  for (let exp = -4; exp <= 8; exp += 0.5) {
    const lambda = lambdaBase * Math.pow(10, exp)
    const sol = fairnessLeastSquares(t, dataX, dataY, knots, degree, numCPs, lambda, jerkGram)
    if (!sol) continue

    const extrema = computeClosedCurvatureExtremaParameters(knots, sol.cpX, sol.cpY, degree)
    const rms = quickRMS(t, dataX, dataY, sol.cpX, sol.cpY, knots, degree, numCPs)

    const cand: FairnessCandidate = {
      cpX: sol.cpX, cpY: sol.cpY,
      lambda, numExtrema: extrema.length, rms,
    }
    candidates.push(cand)

    // Stop if curve has degenerated
    if (rms > rmsThreshold) break
  }

  // Phase 3: Pick the best candidate
  // Priority: (1) fewest extrema, (2) lowest RMS among ties
  // Only consider candidates with RMS < threshold (not degenerate)
  const viable = candidates.filter(c => c.rms < rmsThreshold)
  if (viable.length === 0) {
    // All degenerated — use pure LS
    return reparameterize(best, knots, degree, numCPs, dataX, dataY, jerkGram, 0, targetExtrema, reparamRounds)
  }

  // Find minimum extrema count among viable candidates
  const minExtrema = Math.min(...viable.map(c => c.numExtrema))
  // Among those with minimum extrema, pick lowest RMS
  const bestCandidates = viable.filter(c => c.numExtrema === minExtrema)
  best = bestCandidates.reduce((a, b) => a.rms < b.rms ? a : b)

  console.log(`[fairnessFit] best: λ=${best.lambda.toExponential(3)}, ${best.numExtrema} extrema, RMS=${best.rms.toExponential(3)}`)

  // Phase 4: If we found a good λ range, do binary search refinement
  if (best.numExtrema <= targetExtrema && best.lambda > 0) {
    // Binary search between the last λ that was too wiggly and best.lambda
    const tooWiggly = viable
      .filter(c => c.numExtrema > targetExtrema && c.lambda < best.lambda)
      .sort((a, b) => b.lambda - a.lambda)
    const loLambda = tooWiggly.length > 0 ? tooWiggly[0].lambda : 0

    let lo = loLambda, hi = best.lambda
    for (let iter = 0; iter < 15; iter++) {
      const mid = (lo + hi) / 2
      const sol = fairnessLeastSquares(t, dataX, dataY, knots, degree, numCPs, mid, jerkGram)
      if (!sol) break

      const extrema = computeClosedCurvatureExtremaParameters(knots, sol.cpX, sol.cpY, degree)
      const rms = quickRMS(t, dataX, dataY, sol.cpX, sol.cpY, knots, degree, numCPs)

      if (extrema.length <= targetExtrema && rms < rmsThreshold) {
        // This λ works — try lower for better fit
        best = { cpX: sol.cpX, cpY: sol.cpY, lambda: mid, numExtrema: extrema.length, rms }
        hi = mid
      } else {
        lo = mid
      }

      if (hi - lo < lo * 1e-6) break
    }
  }

  console.log(`[fairnessFit] final: λ=${best.lambda.toExponential(3)}, ${best.numExtrema} extrema, RMS=${best.rms.toExponential(3)}`)

  // Phase 5: Reparameterize at the best λ
  return reparameterize(best, knots, degree, numCPs, dataX, dataY, jerkGram, best.lambda, targetExtrema, reparamRounds)
}

/** Reparameterize: alternate foot-point projection + fairness LS solve */
function reparameterize(
  initial: FairnessCandidate,
  knots: number[], degree: number, numCPs: number,
  dataX: number[], dataY: number[],
  jerkGram: number[][],
  lambda: number, targetExtrema: number, rounds: number,
): { cpX: number[]; cpY: number[]; lambda: number; numExtrema: number } {
  let best = initial
  let bestH = Infinity

  for (let round = 0; round < rounds; round++) {
    const fp = computeFootPointMetrics(dataX, dataY, best.cpX, best.cpY, degree, knots)
    if (fp.hausdorff >= bestH) break
    bestH = fp.hausdorff

    const sol = fairnessLeastSquares(fp.projectedT, dataX, dataY, knots, degree, numCPs, lambda, jerkGram)
    if (!sol) break

    const extrema = computeClosedCurvatureExtremaParameters(knots, sol.cpX, sol.cpY, degree)
    const candidate: FairnessCandidate = {
      cpX: sol.cpX, cpY: sol.cpY, lambda,
      numExtrema: extrema.length, rms: 0, // rms not needed here
    }

    // If reparameterization introduced too many extrema, keep previous best
    if (candidate.numExtrema > targetExtrema && best.numExtrema <= targetExtrema) {
      break
    }

    best = candidate
  }

  return { cpX: best.cpX, cpY: best.cpY, lambda: best.lambda, numExtrema: best.numExtrema }
}

/**
 * High-level entry point: create a degree 5 fairness fit from scratch.
 *
 * @param t - Initial parameter values (chord-length parameterization)
 * @param dataX - Data point X coordinates
 * @param dataY - Data point Y coordinates
 * @param numCPs - Number of control points (must be >= 6)
 * @param targetExtrema - Maximum number of curvature extrema allowed
 */
export function fitDegree5WithFairness(
  t: number[],
  dataX: number[],
  dataY: number[],
  numCPs: number,
  targetExtrema: number,
): { cpX: number[]; cpY: number[]; knots: number[]; lambda: number; numExtrema: number } {
  const degree = 5
  if (numCPs < degree + 1) {
    throw new Error(`Need at least ${degree + 1} CPs for degree ${degree}, got ${numCPs}`)
  }

  const knots = uniformPeriodicKnots(numCPs)

  const result = fairnessFit(t, dataX, dataY, knots, degree, numCPs, targetExtrema)
  return { ...result, knots }
}

/**
 * Fairness fit at any degree: solve (BᵀB + λM)·cp = Bᵀd at a given λ,
 * then improve via foot-point reparameterization rounds.
 *
 * @param t - Parameter values
 * @param dataX - Data point X coordinates
 * @param dataY - Data point Y coordinates
 * @param numCPs - Number of control points (>= degree+1)
 * @param lambda - Fairness weight (0 = pure LS, higher = smoother)
 * @param degree - B-spline degree (default 5 for backward compat)
 */
export function fitWithLambda(
  t: number[],
  dataX: number[],
  dataY: number[],
  numCPs: number,
  lambda: number,
  degree: number = 5,
): { cpX: number[]; cpY: number[]; knots: number[]; numExtrema: number } {
  if (numCPs < degree + 1) {
    throw new Error(`Need at least ${degree + 1} CPs for degree ${degree}, got ${numCPs}`)
  }

  const knots = uniformPeriodicKnots(numCPs)
  const precomputed = precomputePeriodicBasisDerivatives(degree, knots, 1.0)
  const jerkGram = computeJerkGramMatrix(precomputed)

  // Normalize λ so that λ=1 roughly balances data and fairness terms
  // First solve pure LS to get baseline RMS
  const pureSol = fairnessLeastSquares(t, dataX, dataY, knots, degree, numCPs, 0, jerkGram)
  if (!pureSol) {
    throw new Error('Pure LS solve failed — system is singular')
  }
  const pureRMS = quickRMS(t, dataX, dataY, pureSol.cpX, pureSol.cpY, knots, degree, numCPs)
  const gramScale = jerkGram[0][0] || 1
  const lambdaBase = pureRMS * pureRMS / gramScale
  const scaledLambda = lambda * lambdaBase

  // Initial solve with scaled λ
  const sol = lambda === 0
    ? pureSol
    : fairnessLeastSquares(t, dataX, dataY, knots, degree, numCPs, scaledLambda, jerkGram)
  if (!sol) {
    throw new Error('Fairness LS solve failed — system is singular')
  }

  let bestCPX = sol.cpX
  let bestCPY = sol.cpY
  let bestH = Infinity

  // Foot-point reparameterization rounds
  const REPARAM_ROUNDS = 10
  for (let round = 0; round < REPARAM_ROUNDS; round++) {
    const fp = computeFootPointMetrics(dataX, dataY, bestCPX, bestCPY, degree, knots)
    if (fp.hausdorff >= bestH) break
    bestH = fp.hausdorff

    const reSol = fairnessLeastSquares(fp.projectedT, dataX, dataY, knots, degree, numCPs, scaledLambda, jerkGram)
    if (!reSol) break

    bestCPX = reSol.cpX
    bestCPY = reSol.cpY
  }

  const extrema = computeClosedCurvatureExtremaParameters(knots, bestCPX, bestCPY, degree)
  return { cpX: bestCPX, cpY: bestCPY, knots, numExtrema: extrema.length }
}

/** Backward-compat wrapper: degree-5 fairness fit. */
export function fitDegree5WithLambda(
  t: number[],
  dataX: number[],
  dataY: number[],
  numCPs: number,
  lambda: number,
): { cpX: number[]; cpY: number[]; knots: number[]; numExtrema: number } {
  return fitWithLambda(t, dataX, dataY, numCPs, lambda, 5)
}
