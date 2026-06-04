// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * B-Spline Algebra - Bernstein Decomposition and Algebraic Operations
 *
 * Key insight: B-splines can be decomposed into Bézier (Bernstein) segments,
 * and algebraic operations on Bernstein polynomials have explicit formulas.
 * This allows exact computation of products, sums, etc.
 *
 * The curvature derivative numerator g(t) is computed as:
 *   g(t) = ||c'||² · (c' × c''') - 3 · (c'·c'') · (c' × c'')
 *
 * Zeros of g(t) correspond to curvature extrema.
 */

import {
  type BSpline,
  type BSpline2D,
  cpToArray,
  knotAt,
  cpAt,
  numCPs,
  mkOpenBSpline,
  mkPeriodicBSplineWithKnots,
  bsplineDomain,
} from './bsplineTypes'

// ============================================================================
// Simple BSpline type for internal computation (raw arrays)
// ============================================================================

interface SimpleBSpline {
  knots: number[]
  controlPoints: number[]
}

function simpleDegree(bs: SimpleBSpline): number {
  return bs.knots.length - bs.controlPoints.length - 1
}

function simpleDifferentiate(bs: SimpleBSpline): SimpleBSpline {
  const p = simpleDegree(bs)
  if (p === 0) {
    // Derivative of a piecewise constant is zero; return a zero B-spline
    // with the same structure so decomposeToBernstein produces a valid degree-0 BD.
    return { knots: [...bs.knots], controlPoints: bs.controlPoints.map(() => 0) }
  }

  const newKnots = bs.knots.slice(1, -1)
  const newCPs: number[] = []

  for (let i = 0; i < bs.controlPoints.length - 1; i++) {
    const denom = bs.knots[i + p + 1] - bs.knots[i + 1]
    if (Math.abs(denom) > 1e-14) {
      newCPs.push((p * (bs.controlPoints[i + 1] - bs.controlPoints[i])) / denom)
    } else {
      newCPs.push(0)
    }
  }

  return { knots: newKnots, controlPoints: newCPs }
}

// ============================================================================
// Binomial Coefficient
// ============================================================================

const binomialCache: number[][] = []

export function binomialCoefficient(n: number, k: number): number {
  if (n < k || k < 0) return 0

  // Check cache
  if (binomialCache[n]?.[k] !== undefined) {
    return binomialCache[n][k]
  }

  // Take advantage of symmetry
  if (k > n - k) {
    k = n - k
  }

  let result = 1
  for (let x = n - k + 1; x <= n; x++) result *= x
  for (let x = 1; x <= k; x++) result /= x

  // Cache result
  if (!binomialCache[n]) binomialCache[n] = []
  binomialCache[n][k] = result

  return result
}

// ============================================================================
// Bernstein Decomposition (Class-based for method chaining)
// ============================================================================

/**
 * A Bernstein decomposition of a B-Spline.
 * Each row is the control points for one Bézier segment.
 */
export class BernsteinDecomposition {
  controlPointsArray: number[][]
  distinctKnots: number[]

  constructor(controlPointsArray: number[][], distinctKnots: number[]) {
    this.controlPointsArray = controlPointsArray
    this.distinctKnots = distinctKnots
  }

  get degree(): number {
    return this.controlPointsArray.length > 0 ? this.controlPointsArray[0].length - 1 : 0
  }

  get numSpans(): number {
    return this.controlPointsArray.length
  }

  /**
   * Add two Bernstein decompositions
   */
  add(other: BernsteinDecomposition): BernsteinDecomposition {
    const result: number[][] = []
    const n = Math.min(this.controlPointsArray.length, other.controlPointsArray.length)

    for (let i = 0; i < n; i++) {
      let a = this.controlPointsArray[i]
      let b = other.controlPointsArray[i]
      const maxDeg = Math.max(a.length, b.length) - 1
      if (a.length - 1 < maxDeg) a = bernsteinDegreeElevate(a, maxDeg)
      if (b.length - 1 < maxDeg) b = bernsteinDegreeElevate(b, maxDeg)
      result[i] = a.map((v, j) => v + b[j])
    }

    return new BernsteinDecomposition(result, this.distinctKnots)
  }

  /**
   * Subtract two Bernstein decompositions
   */
  subtract(other: BernsteinDecomposition): BernsteinDecomposition {
    const result: number[][] = []
    const n = Math.min(this.controlPointsArray.length, other.controlPointsArray.length)

    for (let i = 0; i < n; i++) {
      let a = this.controlPointsArray[i]
      let b = other.controlPointsArray[i]
      const maxDeg = Math.max(a.length, b.length) - 1
      if (a.length - 1 < maxDeg) a = bernsteinDegreeElevate(a, maxDeg)
      if (b.length - 1 < maxDeg) b = bernsteinDegreeElevate(b, maxDeg)
      result[i] = a.map((v, j) => v - b[j])
    }

    return new BernsteinDecomposition(result, this.distinctKnots)
  }

  /**
   * Multiply two Bernstein decompositions
   */
  multiply(other: BernsteinDecomposition): BernsteinDecomposition {
    const result: number[][] = []
    const n = Math.min(this.controlPointsArray.length, other.controlPointsArray.length)

    for (let i = 0; i < n; i++) {
      result[i] = bernsteinMultiply(this.controlPointsArray[i], other.controlPointsArray[i])
    }

    return new BernsteinDecomposition(result, this.distinctKnots)
  }

  /**
   * Multiply by a scalar
   */
  multiplyByScalar(value: number): BernsteinDecomposition {
    const result: number[][] = []

    for (let i = 0; i < this.controlPointsArray.length; i++) {
      result[i] = []
      for (let j = 0; j < this.controlPointsArray[i].length; j++) {
        result[i][j] = this.controlPointsArray[i][j] * value
      }
    }

    return new BernsteinDecomposition(result, this.distinctKnots)
  }

  /**
   * Flatten all control points into a single array
   */
  flattenControlPoints(): number[] {
    return this.controlPointsArray.reduce((acc, val) => acc.concat(val), [])
  }

  /**
   * Evaluate the Bernstein decomposition at a given parameter t.
   * Uses de Casteljau algorithm for numerically stable evaluation.
   */
  evaluate(t: number): number {
    // Find which span t falls into
    let spanIdx = 0
    for (let i = 0; i < this.distinctKnots.length - 1; i++) {
      if (t >= this.distinctKnots[i] && t <= this.distinctKnots[i + 1]) {
        spanIdx = i
        break
      }
    }

    // Handle edge case: t at the end
    if (spanIdx >= this.controlPointsArray.length) {
      spanIdx = this.controlPointsArray.length - 1
    }

    const coeffs = this.controlPointsArray[spanIdx]
    const tA = this.distinctKnots[spanIdx]
    const tB = this.distinctKnots[spanIdx + 1]

    // Map t to local parameter u in [0, 1]
    const u = (t - tA) / (tB - tA)

    // De Casteljau algorithm
    const work = [...coeffs]
    const n = work.length
    for (let r = 1; r < n; r++) {
      for (let i = 0; i < n - r; i++) {
        work[i] = (1 - u) * work[i] + u * work[i + 1]
      }
    }
    return work[0]
  }

  /**
   * Get a subset of spans [start, lessThan)
   */
  subset(start: number, lessThan: number): BernsteinDecomposition {
    const newCPs = this.controlPointsArray.slice(start, lessThan)
    const newKnots = this.distinctKnots.slice(start, lessThan + 1)
    return new BernsteinDecomposition(newCPs, newKnots)
  }

  /**
   * Compute the Greville abscissae (parameter values) for each flattened control point.
   */
  grevilleAbscissae(): number[] {
    const p = this.degree
    if (p === 0) {
      return this.distinctKnots.slice(0, -1).map((a, i) => (a + this.distinctKnots[i + 1]) / 2)
    }
    const result: number[] = []
    for (let span = 0; span < this.numSpans; span++) {
      const a = this.distinctKnots[span]
      const b = this.distinctKnots[span + 1]
      for (let j = 0; j <= p; j++) {
        result.push(a + (j / p) * (b - a))
      }
    }
    return result
  }

  /**
   * Multiply only in range [start, lessThan) - exploits B-spline locality
   */
  multiplyRange(
    other: BernsteinDecomposition,
    start: number,
    lessThan: number
  ): BernsteinDecomposition {
    const result: number[][] = []

    for (
      let i = start;
      i < lessThan && i < this.controlPointsArray.length && i < other.controlPointsArray.length;
      i++
    ) {
      result.push(bernsteinMultiply(this.controlPointsArray[i], other.controlPointsArray[i]))
    }

    const newKnots = this.distinctKnots.slice(start, lessThan + 1)
    return new BernsteinDecomposition(result, newKnots)
  }
}

/**
 * Multiply two Bernstein polynomials (coefficient vectors)
 * Uses the explicit product formula for Bernstein basis functions
 */
function bernsteinMultiply(f: number[], g: number[]): number[] {
  const fDegree = f.length - 1
  const gDegree = g.length - 1
  const resultDegree = fDegree + gDegree

  // Pre-scale coefficients for faster computation
  const fScaled: number[] = []
  const gScaled: number[] = []

  for (let i = 0; i <= fDegree; i++) {
    fScaled[i] = f[i] * binomialCoefficient(fDegree, i)
  }

  for (let i = 0; i <= gDegree; i++) {
    gScaled[i] = g[i] * binomialCoefficient(gDegree, i)
  }

  // Compute convolution
  const result: number[] = []
  for (let k = 0; k <= resultDegree; k++) {
    let cp = 0
    for (let i = Math.max(0, k - gDegree); i <= Math.min(fDegree, k); i++) {
      cp += fScaled[i] * gScaled[k - i]
    }
    result[k] = cp
  }

  // Unscale result
  for (let i = 0; i <= resultDegree; i++) {
    result[i] = result[i] / binomialCoefficient(resultDegree, i)
  }

  return result
}

/**
 * Degree-elevate a Bernstein polynomial from its current degree to targetDegree.
 * Uses the standard formula: c_i = (i/(n+1)) * b_{i-1} + (1 - i/(n+1)) * b_i
 * where b_{-1} = b_{n+1} = 0.
 */
function bernsteinDegreeElevate(coeffs: number[], targetDegree: number): number[] {
  let result = coeffs
  while (result.length - 1 < targetDegree) {
    const n = result.length - 1  // current degree
    const elevated = new Array(n + 2)
    for (let i = 0; i <= n + 1; i++) {
      const alpha = i / (n + 1)
      const bPrev = i > 0 ? result[i - 1] : 0
      const bCurr = i <= n ? result[i] : 0
      elevated[i] = alpha * bPrev + (1 - alpha) * bCurr
    }
    result = elevated
  }
  return result
}

// ============================================================================
// B-Spline to Bernstein Decomposition
// ============================================================================

/**
 * Get distinct knot values from a knot vector
 */
function getDistinctKnots(knots: number[]): number[] {
  const distinct: number[] = []
  let prev: number | undefined

  for (const k of knots) {
    if (prev === undefined || Math.abs(k - prev) > 1e-14) {
      distinct.push(k)
      prev = k
    }
  }

  return distinct
}

/**
 * Decompose a simple B-spline (raw arrays) into Bézier segments (Bernstein form)
 * Based on Piegl & Tiller, "The NURBS Book", p.173
 */
export function decomposeToBernstein(spline: SimpleBSpline): BernsteinDecomposition {
  const knots = spline.knots
  const controlPoints = spline.controlPoints
  const p = simpleDegree(spline)

  // Find distinct knots
  const distinctKnots = getDistinctKnots(knots)
  const numSegments = distinctKnots.length - 1

  if (numSegments <= 0) {
    return new BernsteinDecomposition([], distinctKnots)
  }

  const result: number[][] = []
  for (let i = 0; i < numSegments; i++) {
    result.push([])
  }

  // Initialize first segment
  for (let i = 0; i <= p; i++) {
    result[0][i] = controlPoints[i]
  }

  let a = p
  let b = p + 1
  let segmentIdx = 0
  const alphas: number[] = []

  let iterCount = 0
  const maxIter = 1000

  while (b < knots.length - 1) {
    iterCount++
    if (iterCount > maxIter) {
      console.error('decomposeToBernstein: infinite loop detected!', { b, a, segmentIdx, knotsLength: knots.length })
      break
    }

    let i = b

    // Find multiplicity of knot at b
    while (b < knots.length - 1 && Math.abs(knots[b + 1] - knots[b]) < 1e-14) {
      b++
    }

    const mult = b - i + 1

    if (mult < p) {
      const numer = knots[b] - knots[a]

      // Compute and store alphas
      for (let j = p; j > mult; j--) {
        alphas[j - mult - 1] = numer / (knots[a + j] - knots[a])
      }

      const r = p - mult // Insert knot r times

      for (let j = 1; j <= r; j++) {
        const save = r - j
        const s = mult + j

        for (let k = p; k >= s; k--) {
          const alpha = alphas[k - s]
          result[segmentIdx][k] =
            result[segmentIdx][k] * alpha + result[segmentIdx][k - 1] * (1 - alpha)
        }

        if (b < knots.length && segmentIdx + 1 < numSegments) {
          result[segmentIdx + 1][save] = result[segmentIdx][p]
        }
      }
    }

    segmentIdx++

    if (b < knots.length - 1 && segmentIdx < numSegments) {
      // Initialize next segment
      for (i = Math.max(0, p - mult); i <= p; i++) {
        result[segmentIdx][i] = controlPoints[b - p + i]
      }
      a = b
      b++
    } else {
      // Must increment b to exit the loop eventually
      b++
    }
  }

  return new BernsteinDecomposition(result, distinctKnots)
}

/**
 * Convert a BSpline (with discriminated union types) to Bernstein decomposition
 */
export function fromBSpline(bs: BSpline): BernsteinDecomposition {
  switch (bs.knots.tag) {
    case 'open': {
      const simple: SimpleBSpline = {
        knots: [...bs.knots.knots],
        controlPoints: cpToArray(bs.controlPoints),
      }
      return decomposeToBernstein(simple)
    }
    case 'periodic':
      return decomposePeriodicToBernstein(bs)
  }
}

// ============================================================================
// Periodic Curve Support
// ============================================================================

/**
 * Unroll a periodic B-spline to an open B-spline.
 * The open B-spline covers one full period with extra knots/CPs at boundaries.
 */
export function unrollToOpen(bs: BSpline): BSpline {
  if (bs.knots.tag === 'open') {
    return bs // Already open
  }

  const p = bs.degree
  const n = numCPs(bs.controlPoints)

  // Create extended knot vector: from index -p to n+p
  const openKnots: number[] = []
  for (let i = -p; i <= n + p; i++) {
    openKnots.push(knotAt(bs.knots, i))
  }

  // Create extended control points: from index -p to n-1
  // (n + p control points total)
  const openCPs: number[] = []
  for (let i = -p; i < n; i++) {
    openCPs.push(cpAt(bs.controlPoints, i))
  }

  return mkOpenBSpline(p, openKnots, openCPs)
}

/**
 * Insert a single knot into an open B-spline using Boehm's algorithm.
 * Returns a new B-spline with one more knot and one more control point.
 */
export function insertKnot(bs: BSpline, tBar: number): BSpline {
  if (bs.knots.tag !== 'open') {
    throw new Error('insertKnot only works on open B-splines')
  }

  const knots = [...bs.knots.knots]
  const cps = cpToArray(bs.controlPoints)
  const p = bs.degree
  const n = cps.length - 1

  // Get domain
  const [tLo, tHi] = bsplineDomain(bs)

  // Outside domain - return unchanged
  if (tBar < tLo || tBar > tHi) {
    return bs
  }

  // Find knot span: k such that knots[k] <= tBar < knots[k+1]
  let k = p
  for (let i = p; i <= n; i++) {
    if (tBar >= knots[i] && tBar < knots[i + 1]) {
      k = i
      break
    }
    if (i === n && tBar >= knots[i]) {
      k = i
    }
  }

  // New knot vector
  const newKnots: number[] = [
    ...knots.slice(0, k + 1),
    tBar,
    ...knots.slice(k + 1),
  ]

  // New control points using Boehm's algorithm
  const newCPs: number[] = []

  for (let i = 0; i <= n + 1; i++) {
    if (i <= k - p) {
      // Unchanged (left of affected region)
      newCPs.push(cps[i])
    } else if (i >= k + 1) {
      // Shifted (right of affected region)
      newCPs.push(cps[i - 1])
    } else {
      // Blended (affected region): k - p < i < k + 1
      const cpCurrent = i <= n ? cps[i] : cps[n]
      const cpPrev = i - 1 >= 0 ? cps[i - 1] : cps[0]

      const ti = knots[i]
      const tip = knots[i + p]
      const denom = tip - ti
      const alpha = denom > 0 ? (tBar - ti) / denom : 1.0
      newCPs.push(alpha * cpCurrent + (1 - alpha) * cpPrev)
    }
  }

  return mkOpenBSpline(p, newKnots, newCPs)
}

/**
 * Count the multiplicity of a knot value in an open knot vector.
 */
function knotMultiplicity(knots: readonly number[], t: number, tolerance: number = 1e-10): number {
  return knots.filter(k => Math.abs(k - t) < tolerance).length
}

/**
 * Insert knots at domain boundaries to increase multiplicity to p+1.
 * Used before Bernstein decomposition of periodic curves.
 *
 * This function is smart about existing multiplicity - it only inserts
 * enough knots to reach the target multiplicity (p+1), not blindly
 * insert a fixed number of times.
 */
export function insertBoundaryKnots(bs: BSpline, tMin: number, tMax: number, times: number): BSpline {
  if (times <= 0) return bs
  if (bs.knots.tag !== 'open') {
    throw new Error('insertBoundaryKnots requires open B-spline')
  }

  const p = bs.degree
  const targetMultiplicity = p + 1

  let result = bs

  // Insert at tMin only if needed
  const currentMultMin = knotMultiplicity(result.knots.tag === 'open' ? result.knots.knots : [], tMin)
  const neededAtMin = Math.max(0, targetMultiplicity - currentMultMin)
  for (let i = 0; i < neededAtMin; i++) {
    result = insertKnot(result, tMin)
  }

  // Insert at tMax only if needed
  const currentMultMax = knotMultiplicity(result.knots.tag === 'open' ? result.knots.knots : [], tMax)
  const neededAtMax = Math.max(0, targetMultiplicity - currentMultMax)
  for (let i = 0; i < neededAtMax; i++) {
    result = insertKnot(result, tMax)
  }

  return result
}

/**
 * Decompose a periodic B-spline to Bernstein form.
 *
 * Strategy from Haskell implementation:
 * 1. Unroll to open form (extending from -p to n+p)
 * 2. Insert boundary knots to clamp at domain edges
 * 3. Decompose to Bernstein
 * 4. Extract the portion corresponding to one period
 */
function decomposePeriodicToBernstein(bs: BSpline): BernsteinDecomposition {
  if (bs.knots.tag !== 'periodic') {
    throw new Error('Expected periodic B-spline')
  }

  const p = bs.degree
  const [tMin, tMax] = bsplineDomain(bs)

  // Step 1: Unroll to open form
  let open = unrollToOpen(bs)

  // Step 2: Insert boundary knots (p times each) to reach multiplicity p+1
  // This allows proper Bézier extraction at domain boundaries
  // (original multiplicity is 1, we need p+1, so insert p times)
  open = insertBoundaryKnots(open, tMin, tMax, p)

  // Step 3: Decompose the refined open B-spline
  if (open.knots.tag !== 'open') {
    throw new Error('Expected open B-spline after unroll')
  }
  const refinedKnots = [...open.knots.knots]
  const refinedCPs = cpToArray(open.controlPoints)

  // Step 4: Find and extract the clamped region [tMin, tMax]
  let startKnotIdx = 0
  for (let i = 0; i < refinedKnots.length; i++) {
    if (Math.abs(refinedKnots[i] - tMin) < 1e-10) {
      startKnotIdx = i
      break
    }
  }

  let lastTMinIdx = startKnotIdx
  for (let i = startKnotIdx; i < refinedKnots.length; i++) {
    if (Math.abs(refinedKnots[i] - tMin) < 1e-10) {
      lastTMinIdx = i
    } else {
      break
    }
  }

  let endKnotIdx = refinedKnots.length - 1
  for (let i = refinedKnots.length - 1; i >= 0; i--) {
    if (Math.abs(refinedKnots[i] - tMax) < 1e-10) {
      endKnotIdx = i
      break
    }
  }

  // Extract clamped knots and control points
  const clampedKnots = refinedKnots.slice(startKnotIdx, endKnotIdx + 1)
  const numClampedKnots = clampedKnots.length
  const numClampedCPs = numClampedKnots - p - 1
  const cpStartIdx = lastTMinIdx - p
  const clampedCPs = refinedCPs.slice(cpStartIdx, cpStartIdx + numClampedCPs)

  // Step 5: Decompose the clamped B-spline
  const clamped: SimpleBSpline = { knots: clampedKnots, controlPoints: clampedCPs }
  return decomposeToBernstein(clamped)
}

/**
 * Decompose an open B-spline to Bernstein form, extracting the [tMin, tMax] region.
 * Used for spiral-unrolled periodic B-splines where the CPs have been modified.
 */
export function decomposeClampedRegion(open: BSpline, tMin: number, tMax: number): BernsteinDecomposition {
  if (open.knots.tag !== 'open') {
    throw new Error('Expected open B-spline')
  }

  const p = open.degree

  // Insert boundary knots to reach multiplicity p+1
  const refined = insertBoundaryKnots(open, tMin, tMax, p)

  if (refined.knots.tag !== 'open') {
    throw new Error('Expected open B-spline after knot insertion')
  }
  const refinedKnots = [...refined.knots.knots]
  const refinedCPs = cpToArray(refined.controlPoints)

  // Find and extract the clamped region [tMin, tMax]
  let startKnotIdx = 0
  for (let i = 0; i < refinedKnots.length; i++) {
    if (Math.abs(refinedKnots[i] - tMin) < 1e-10) {
      startKnotIdx = i
      break
    }
  }

  let lastTMinIdx = startKnotIdx
  for (let i = startKnotIdx; i < refinedKnots.length; i++) {
    if (Math.abs(refinedKnots[i] - tMin) < 1e-10) {
      lastTMinIdx = i
    } else {
      break
    }
  }

  let endKnotIdx = refinedKnots.length - 1
  for (let i = refinedKnots.length - 1; i >= 0; i--) {
    if (Math.abs(refinedKnots[i] - tMax) < 1e-10) {
      endKnotIdx = i
      break
    }
  }

  const clampedKnots = refinedKnots.slice(startKnotIdx, endKnotIdx + 1)
  const numClampedKnots = clampedKnots.length
  const numClampedCPs = numClampedKnots - p - 1
  const cpStartIdx = lastTMinIdx - p
  const clampedCPs = refinedCPs.slice(cpStartIdx, cpStartIdx + numClampedCPs)

  const clamped: SimpleBSpline = { knots: clampedKnots, controlPoints: clampedCPs }
  return decomposeToBernstein(clamped)
}

/**
 * Derivative of a Bernstein decomposition
 */
export function derivativeBD(bd: BernsteinDecomposition): BernsteinDecomposition {
  const p = bd.degree
  if (p === 0) {
    const zeroSpans = bd.controlPointsArray.map(() => [0])
    return new BernsteinDecomposition(zeroSpans, bd.distinctKnots)
  }

  const newSpans: number[][] = []

  for (let spanIdx = 0; spanIdx < bd.controlPointsArray.length; spanIdx++) {
    const coeffs = bd.controlPointsArray[spanIdx]
    const tA = bd.distinctKnots[spanIdx]
    const tB = bd.distinctKnots[spanIdx + 1]
    const interval = tB - tA

    const derivCoeffs: number[] = []
    for (let i = 0; i < p; i++) {
      derivCoeffs.push((p * (coeffs[i + 1] - coeffs[i])) / interval)
    }
    newSpans.push(derivCoeffs)
  }

  return new BernsteinDecomposition(newSpans, bd.distinctKnots)
}

/**
 * Integrate a Bernstein decomposition (inverse of derivativeBD).
 *
 * For each Bézier segment on [tA, tB] with CPs c₀..cₚ:
 *   New degree: p+1
 *   C₀ = cumulative (integration constant carried from previous segment)
 *   Cₖ = cumulative + ((tB-tA)/(p+1)) * Σᵢ₌₀ᵏ⁻¹ cᵢ   for k = 1..p+1
 *
 * The cumulative value chains across segments: cumulative = C_{p+1} of previous segment.
 */
export function integrateBD(bd: BernsteinDecomposition, integrationConstant: number = 0): BernsteinDecomposition {
  const p = bd.degree
  const newSpans: number[][] = []
  let cumulative = integrationConstant

  for (let spanIdx = 0; spanIdx < bd.controlPointsArray.length; spanIdx++) {
    const coeffs = bd.controlPointsArray[spanIdx]
    const tA = bd.distinctKnots[spanIdx]
    const tB = bd.distinctKnots[spanIdx + 1]
    const interval = tB - tA
    const scale = interval / (p + 1)

    const intCoeffs: number[] = new Array(p + 2)
    intCoeffs[0] = cumulative
    let partialSum = 0
    for (let k = 1; k <= p + 1; k++) {
      partialSum += coeffs[k - 1]
      intCoeffs[k] = cumulative + scale * partialSum
    }
    newSpans.push(intCoeffs)

    // Carry the last value to the next segment
    cumulative = intCoeffs[p + 1]
  }

  return new BernsteinDecomposition(newSpans, bd.distinctKnots)
}

/**
 * Convert a BernsteinDecomposition back to a B-spline (SimpleBSpline).
 *
 * Builds a clamped knot vector where:
 * - Boundary knots get multiplicity (degree+1) (clamped endpoints)
 * - Interior knots get multiplicity degree (C0 continuity = Bézier segments)
 * - Shared boundary CPs between adjacent segments are merged (one copy kept)
 *
 * This produces a piecewise Bézier B-spline representation.
 */
/**
 * Compute the actual continuity order at an interior breakpoint between two
 * adjacent Bézier segments of degree p.
 *
 * Returns the highest k such that the k-th derivatives match (C^k continuity).
 */
function computeContinuityAtBreakpoint(bd: BernsteinDecomposition, breakpointIndex: number, tol: number = 1e-10): number {
  // Take successive derivatives and compare boundary values
  let current = bd
  let continuity = -1

  for (let k = 0; k < bd.degree; k++) {
    const leftSegment = current.controlPointsArray[breakpointIndex]
    const rightSegment = current.controlPointsArray[breakpointIndex + 1]
    const leftVal = leftSegment[leftSegment.length - 1]
    const rightVal = rightSegment[0]

    // Use a relative tolerance: compare against the magnitude of the values
    const scale = Math.max(Math.abs(leftVal), Math.abs(rightVal), 1)
    if (Math.abs(leftVal - rightVal) > tol * scale) {
      break
    }
    continuity = k
    current = derivativeBD(current)
  }

  return continuity
}

/**
 * Remove a single knot from a 1D B-spline.
 * Uses the same Tiller-Hanson algorithm as bspline.ts removeKnot, adapted for 1D.
 * Returns new CPs and knots, or null if removal error exceeds tolerance.
 */
function removeKnot1DSimple(
  P: number[], knots: number[], degree: number,
  knotIndex: number, tolerance: number
): { controlPoints: number[]; knots: number[] } | null {
  const n = P.length
  const u = knots[knotIndex]
  const ord = degree + 1

  // Find rightmost index r of this knot value
  let r = knotIndex
  while (r < knots.length - 1 && Math.abs(knots[r + 1] - u) < 1e-10) {
    r++
  }

  // Count multiplicity s
  let s = 0
  for (let i = 0; i < knots.length; i++) {
    if (Math.abs(knots[i] - u) < 1e-10) s++
  }

  const first = r - degree
  const last = r - s

  if (first < 0 || last >= n - 1) return null

  const temp: number[] = new Array(last - first + 3)
  temp[0] = P[first - 1 >= 0 ? first - 1 : 0]
  temp[last - first + 2] = P[last + 1 < n ? last + 1 : n - 1]

  let i = first
  let j = last
  let ii = 1
  let jj = last - first + 1

  while (j - i > 0) {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    if (Math.abs(alphaI) < 1e-14) {
      temp[ii] = P[i]
    } else if (Math.abs(alphaI - 1) < 1e-14) {
      temp[ii] = temp[ii - 1]
    } else {
      temp[ii] = (P[i] - (1 - alphaI) * temp[ii - 1]) / alphaI
    }

    const alphaJ = (u - knots[j]) / (knots[j + ord] - knots[j])
    if (Math.abs(1 - alphaJ) < 1e-14) {
      temp[jj] = P[j]
    } else if (Math.abs(alphaJ) < 1e-14) {
      temp[jj] = temp[jj + 1]
    } else {
      temp[jj] = (P[j] - alphaJ * temp[jj + 1]) / (1 - alphaJ)
    }

    i++; ii++; j--; jj--
  }

  let removable = false
  if (j - i < 0) {
    const removalError = Math.abs(temp[ii - 1] - temp[jj + 1])
    if (removalError <= tolerance) removable = true
  } else {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    const interpPt = (1 - alphaI) * temp[ii - 1] + alphaI * temp[jj + 1]
    const removalError = Math.abs(P[i] - interpPt)
    if (removalError <= tolerance) {
      removable = true
      temp[ii] = interpPt
    }
  }

  if (!removable) return null

  const newP: number[] = []
  const tempEnd = last - first + 2

  for (let idx = 0; idx < first; idx++) newP.push(P[idx])
  for (let tempIdx = 1; tempIdx < ii; tempIdx++) newP.push(temp[tempIdx])

  const rightStart = (j === i) ? jj + 1 : jj + 2
  for (let tempIdx = rightStart; tempIdx < tempEnd; tempIdx++) newP.push(temp[tempIdx])

  for (let idx = last + 1; idx < n; idx++) newP.push(P[idx])

  const newKnots = [...knots.slice(0, knotIndex), ...knots.slice(knotIndex + 1)]
  return { controlPoints: newP, knots: newKnots }
}

/**
 * Convert a BernsteinDecomposition back to a B-spline with minimal knot multiplicity.
 *
 * @param bd - The Bernstein decomposition
 * @param maxContinuity - Maximum continuity to detect at interior breakpoints.
 *   Limits how many knots are removed. Use this when the structural continuity
 *   is known to be lower than what the actual values might suggest.
 *   Default: p-1 (detect up to C^(p-1), maximum possible).
 *   Example: For PH curves where u,v have C^1 at a knot, the curve is
 *   structurally C^2, so pass maxContinuity=2 even if values are accidentally C^4.
 */
export function recomposeBD(bd: BernsteinDecomposition, maxContinuity?: number): SimpleBSpline {
  const p = bd.degree
  if (bd.numSpans === 0) {
    return { knots: [], controlPoints: [] }
  }

  if (bd.numSpans === 1) {
    // Single span: just clamped knots
    const knots: number[] = []
    for (let i = 0; i <= p; i++) knots.push(bd.distinctKnots[0])
    for (let i = 0; i <= p; i++) knots.push(bd.distinctKnots[1])
    return { knots, controlPoints: [...bd.controlPointsArray[0]] }
  }

  // Step 1: Build piecewise Bézier form (full multiplicity = C0)
  let knots: number[] = []
  for (let i = 0; i <= p; i++) knots.push(bd.distinctKnots[0])
  for (let s = 1; s < bd.distinctKnots.length - 1; s++) {
    for (let i = 0; i < p; i++) knots.push(bd.distinctKnots[s])
  }
  for (let i = 0; i <= p; i++) knots.push(bd.distinctKnots[bd.distinctKnots.length - 1])

  let controlPoints: number[] = [...bd.controlPointsArray[0]]
  for (let s = 1; s < bd.numSpans; s++) {
    for (let i = 1; i <= p; i++) {
      controlPoints.push(bd.controlPointsArray[s][i])
    }
  }

  // Step 2: At each interior breakpoint, compute actual continuity and
  // remove excess knots via Boehm knot removal
  const maxK = maxContinuity !== undefined ? maxContinuity : p - 1
  for (let s = bd.numSpans - 2; s >= 0; s--) {
    const rawContinuity = computeContinuityAtBreakpoint(bd, s)
    const continuity = Math.min(rawContinuity, maxK)
    if (continuity < 1) continue  // Already minimal (C0 needs multiplicity p)

    // Current multiplicity is p, target is p - continuity
    // Remove (continuity) knots at this breakpoint
    const breakpointValue = bd.distinctKnots[s + 1]

    // Find the first occurrence of this knot in the current knot vector
    const knotIdx = knots.indexOf(breakpointValue)

    for (let r = 0; r < continuity; r++) {
      // Find the last occurrence (remove from the "middle" for stability)
      let lastIdx = knotIdx
      while (lastIdx + 1 < knots.length && knots[lastIdx + 1] === breakpointValue) {
        lastIdx++
      }
      const removeIdx = Math.floor((knotIdx + lastIdx) / 2)

      const result = removeKnot1DSimple(controlPoints, knots, p, removeIdx, 1e-8)
      if (!result) break  // Can't remove more knots
      controlPoints = result.controlPoints
      knots = result.knots
    }
  }

  return { knots, controlPoints }
}

// ============================================================================
// Curvature Derivative Numerator Computation
// ============================================================================

/**
 * Compute the control points of the curvature derivative numerator:
 * g(t) = ||c'||² · (c' × c''') - 3 · (c'·c'') · (c' × c'')
 *
 * Using proper B-spline algebra via Bernstein decomposition.
 *
 * @param knots - Knot vector (raw array)
 * @param controlPointsX - X control points (raw array)
 * @param controlPointsY - Y control points (raw array)
 */
export function computeCurvatureDerivativeNumeratorCPsFromArrays(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): number[] {
  // Create scalar B-splines for x and y coordinates
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }

  // Compute derivatives
  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)
  const sxuuu = simpleDifferentiate(sxuu)
  const syuuu = simpleDifferentiate(syuu)

  // Convert to Bernstein decomposition
  const bdsxu = decomposeToBernstein(sxu)
  const bdsyu = decomposeToBernstein(syu)
  const bdsxuu = decomposeToBernstein(sxuu)
  const bdsyuu = decomposeToBernstein(syuu)
  const bdsxuuu = decomposeToBernstein(sxuuu)
  const bdsyuuu = decomposeToBernstein(syuuu)

  // Compute intermediate products
  // cuDOTcu = ||c'||² = x'² + y'²
  const cuDOTcu = bdsxu.multiply(bdsxu).add(bdsyu.multiply(bdsyu))

  // cuXcuuu = c' × c''' = x'·y''' - y'·x'''
  const cuXcuuu = bdsxu.multiply(bdsyuuu).subtract(bdsyu.multiply(bdsxuuu))

  // cuDOTcuu = c'·c'' = x'·x'' + y'·y''
  const cuDOTcuu = bdsxu.multiply(bdsxuu).add(bdsyu.multiply(bdsyuu))

  // cuXcuu = c' × c'' = x'·y'' - y'·x''
  const cuXcuu = bdsxu.multiply(bdsyuu).subtract(bdsyu.multiply(bdsxuu))

  // g = ||c'||²·(c'×c''') - 3·(c'·c'')·(c'×c'')
  const g = cuDOTcu.multiply(cuXcuuu).subtract(cuDOTcuu.multiply(cuXcuu).multiplyByScalar(3))

  return g.flattenControlPoints()
}

/**
 * Compute inflection numerator h4(t) = x'·y'' - y'·x'' control points for an open curve.
 * Zeros of h4 are the inflection points.
 */
export function computeInflectionCPsFromArrays(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): number[] {
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }

  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)

  const bdsxu = decomposeToBernstein(sxu)
  const bdsyu = decomposeToBernstein(syu)
  const bdsxuu = decomposeToBernstein(sxuu)
  const bdsyuu = decomposeToBernstein(syuu)

  // h4 = x'·y'' - y'·x''
  const h4 = bdsxu.multiply(bdsyuu).subtract(bdsyu.multiply(bdsxuu))
  return h4.flattenControlPoints()
}

/**
 * Compute explicit Jacobian for inflection constraints of an open curve.
 * h4 = x'·y'' - y'·x''
 *   ∂h4/∂xᵢ = Bᵢ'·y'' - y'·Bᵢ''
 *   ∂h4/∂yᵢ = x'·Bᵢ'' - Bᵢ'·x''
 */
export function computeInflectionJacobian(
  precomputed: PrecomputedBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints
  const knots = precomputed.knots

  // Compute derivative BDs for the current control points
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }
  const sxu = decomposeToBernstein(simpleDifferentiate(sx))
  const syu = decomposeToBernstein(simpleDifferentiate(sy))
  const sxuu = decomposeToBernstein(simpleDifferentiate(simpleDifferentiate(sx)))
  const syuu = decomposeToBernstein(simpleDifferentiate(simpleDifferentiate(sy)))

  // h4 = x'·y'' - y'·x''

  const numActive = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) {
    jacobian[j] = new Array(2 * n).fill(0)
  }

  for (let i = 0; i < n; i++) {
    const bi_u = precomputed.dBasisFunctions_du[i]
    const bi_uu = precomputed.d2BasisFunctions_du2[i]

    // ∂h4/∂xᵢ = Bᵢ'·y'' - y'·Bᵢ''
    const dh4_dxi = bi_u.multiply(syuu).subtract(syu.multiply(bi_uu))
    // ∂h4/∂yᵢ = x'·Bᵢ'' - Bᵢ'·x''
    const dh4_dyi = sxu.multiply(bi_uu).subtract(bi_u.multiply(sxuu))

    const dh4dxiCPs = dh4_dxi.flattenControlPoints()
    const dh4dyiCPs = dh4_dyi.flattenControlPoints()

    for (let aj = 0; aj < numActive; aj++) {
      const globalJ = activeConstraintIndices[aj]
      if (globalJ >= 0 && globalJ < dh4dxiCPs.length) {
        jacobian[aj][i] = dh4dxiCPs[globalJ]
        jacobian[aj][n + i] = dh4dyiCPs[globalJ]
      }
    }
  }

  return jacobian
}

/**
 * Compute g(t) control points for a BSpline2D (with discriminated union types).
 * Works for both open and periodic curves.
 */
export function computeCurvatureDerivativeNumeratorCPs(bs: BSpline2D): number[] {
  if (bs.knots.tag === 'periodic') {
    return computePeriodicCurvatureDerivativeNumeratorCPs(bs.degree, bs.knots.baseKnots, cpToArray(bs.controlPointsX), cpToArray(bs.controlPointsY), bs.knots.period)
  }

  // For open curves, use the array-based computation
  const knots = [...bs.knots.knots]
  const cpsX = cpToArray(bs.controlPointsX)
  const cpsY = cpToArray(bs.controlPointsY)

  return computeCurvatureDerivativeNumeratorCPsFromArrays(knots, cpsX, cpsY)
}

/**
 * Compute g(t) control points for a periodic curve.
 * Uses the BD-first approach: convert to Bernstein, then compute derivatives.
 *
 * @param degree - Polynomial degree
 * @param knots - The actual knot vector (n knots for n control points)
 * @param controlPointsX - X coordinates of control points
 * @param controlPointsY - Y coordinates of control points
 * @param period - The period of the curve (default: 1.0)
 */
export function computePeriodicCurvatureDerivativeNumeratorCPs(
  degree: number,
  knots: readonly number[],
  controlPointsX: number[],
  controlPointsY: number[],
  period: number = 1.0
): number[] {
  const sx = mkPeriodicBSplineWithKnots(degree, [...knots], controlPointsX, period)
  const sy = mkPeriodicBSplineWithKnots(degree, [...knots], controlPointsY, period)

  // Convert to BD first (handles periodic correctly via unrolling)
  const sxBD = fromBSpline(sx)
  const syBD = fromBSpline(sy)

  // Compute derivatives using BD.derivative
  const sxu = derivativeBD(sxBD)
  const syu = derivativeBD(syBD)
  const sxuu = derivativeBD(sxu)
  const syuu = derivativeBD(syu)
  const sxuuu = derivativeBD(sxuu)
  const syuuu = derivativeBD(syuu)

  // Compute products
  const h1 = sxu.multiply(sxu).add(syu.multiply(syu))
  const h2 = sxu.multiply(syuuu).subtract(syu.multiply(sxuuu))
  const h3 = sxu.multiply(sxuu).add(syu.multiply(syuu))
  const h4 = sxu.multiply(syuu).subtract(syu.multiply(sxuu))

  // g = h1·h2 - 3·h3·h4 (curvature derivative numerator)
  const g = h1.multiply(h2).subtract(h3.multiply(h4).multiplyByScalar(3))

  return g.flattenControlPoints()
}

/**
 * Compute the Bernstein decomposition of g(t) for a periodic curve.
 *
 * @param degree - Polynomial degree
 * @param knots - Array of n knot values (one per control point, in [0, 1))
 * @param controlPointsX - X coordinates of control points
 * @param controlPointsY - Y coordinates of control points
 * @param period - The period of the curve (default: 1.0)
 * @returns Bernstein decomposition of g(t) in the actual parameter space
 */
export function computePeriodicCurvatureDerivativeNumeratorBDWithKnots(
  degree: number,
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[],
  period: number = 1.0
): BernsteinDecomposition {
  const sx = mkPeriodicBSplineWithKnots(degree, knots, controlPointsX, period)
  const sy = mkPeriodicBSplineWithKnots(degree, knots, controlPointsY, period)

  // Convert to BD first (handles periodic correctly via unrolling)
  const sxBD = fromBSpline(sx)
  const syBD = fromBSpline(sy)

  // Compute derivatives using BD.derivative
  const sxu = derivativeBD(sxBD)
  const syu = derivativeBD(syBD)
  const sxuu = derivativeBD(sxu)
  const syuu = derivativeBD(syu)
  const sxuuu = derivativeBD(sxuu)
  const syuuu = derivativeBD(syuu)

  // Compute products
  const h1 = sxu.multiply(sxu).add(syu.multiply(syu))
  const h2 = sxu.multiply(syuuu).subtract(syu.multiply(sxuuu))
  const h3 = sxu.multiply(sxuu).add(syu.multiply(syuu))
  const h4 = sxu.multiply(syuu).subtract(syu.multiply(sxuu))

  // g = h1·h2 - 3·h3·h4 (curvature derivative numerator)
  return h1.multiply(h2).subtract(h3.multiply(h4).multiplyByScalar(3))
}

/**
 * Compute parameter values where curvature extrema occur for a periodic curve.
 * Returns an array of parameter values t in [0, period) where g(t) = 0.
 *
 * @param degree - Polynomial degree
 * @param knots - Array of n knot values (one per control point)
 * @param controlPointsX - X coordinates of control points
 * @param controlPointsY - Y coordinates of control points
 * @param period - The period of the curve (default: 1.0)
 * @returns Array of parameter values in the actual parameter space
 */
export function computePeriodicCurvatureExtremaParametersWithKnots(
  degree: number,
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[],
  period: number = 1.0
): number[] {
  const gBD = computePeriodicCurvatureDerivativeNumeratorBDWithKnots(
    degree, knots, controlPointsX, controlPointsY, period
  )
  return findZerosBD(gBD)
}

// ============================================================================
// Explicit Jacobian Computation (for speed optimization)
// ============================================================================

/**
 * Precomputed data for fast Jacobian computation.
 * Stores basis function derivatives for each control point.
 */
export interface PrecomputedBasisDerivatives {
  dBasisFunctions_du: BernsteinDecomposition[]
  d2BasisFunctions_du2: BernsteinDecomposition[]
  d3BasisFunctions_du3: BernsteinDecomposition[]
  degree: number
  numControlPoints: number
  knots: number[]
  distinctKnots: number[]
}

/**
 * Precompute basis function derivatives for all control points.
 * This is done once per curve and reused for Jacobian computation.
 */
export function precomputeBasisDerivatives(
  knots: number[],
  numControlPoints: number
): PrecomputedBasisDerivatives {
  const degree = knots.length - numControlPoints - 1
  const distinctKnots = getDistinctKnots(knots)

  const dBasisFunctions_du: BernsteinDecomposition[] = []
  const d2BasisFunctions_du2: BernsteinDecomposition[] = []
  const d3BasisFunctions_du3: BernsteinDecomposition[] = []

  // Create "dirac" splines for each control point
  for (let i = 0; i < numControlPoints; i++) {
    // Dirac basis: 1 at control point i, 0 elsewhere
    const diracCPs = new Array(numControlPoints).fill(0)
    diracCPs[i] = 1

    const basisFunction: SimpleBSpline = { knots, controlPoints: diracCPs }
    const dBasis = simpleDifferentiate(basisFunction)
    const d2Basis = simpleDifferentiate(dBasis)
    const d3Basis = simpleDifferentiate(d2Basis)

    dBasisFunctions_du.push(decomposeToBernstein(dBasis))
    d2BasisFunctions_du2.push(decomposeToBernstein(d2Basis))
    d3BasisFunctions_du3.push(decomposeToBernstein(d3Basis))
  }

  return {
    dBasisFunctions_du,
    d2BasisFunctions_du2,
    d3BasisFunctions_du3,
    degree,
    numControlPoints,
    knots,
    distinctKnots,
  }
}

/**
 * Compute explicit Jacobian of curvature derivative numerator constraints.
 * Uses precomputed basis derivatives and range-based operations for efficiency.
 *
 * Returns a 2D array where jacobian[j][i] = ∂g_j/∂x_i (or ∂g_j/∂y_i for i >= n)
 */
export function computeExplicitJacobian(
  precomputed: PrecomputedBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints
  const degree = precomputed.degree
  const knots = precomputed.knots

  // Compute current curve state
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }

  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)
  const sxuuu = simpleDifferentiate(sxuu)
  const syuuu = simpleDifferentiate(syuu)

  const bdsxu = decomposeToBernstein(sxu)
  const bdsyu = decomposeToBernstein(syu)
  const bdsxuu = decomposeToBernstein(sxuu)
  const bdsyuu = decomposeToBernstein(syuu)
  const bdsxuuu = decomposeToBernstein(sxuuu)
  const bdsyuuu = decomposeToBernstein(syuuu)

  // Intermediate products
  const cuDOTcu = bdsxu.multiply(bdsxu).add(bdsyu.multiply(bdsyu))
  const cuXcuuu = bdsxu.multiply(bdsyuuu).subtract(bdsyu.multiply(bdsxuuu))
  const cuDOTcuu = bdsxu.multiply(bdsxuu).add(bdsyu.multiply(bdsyuu))
  const cuXcuu = bdsxu.multiply(bdsyuu).subtract(bdsyu.multiply(bdsxuu))

  const numSpans = n - degree
  const gDegree = 4 * degree - 6
  const cpsPerSpan = gDegree + 1

  // Initialize Jacobian matrix
  const numActiveConstraints = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActiveConstraints; j++) {
    jacobian[j] = new Array(2 * n).fill(0)
  }

  // For each control point, compute its contribution to the Jacobian
  for (let i = 0; i < n; i++) {
    // Locality: control point i only affects spans [start, lessThan)
    const start = Math.max(0, i - degree)
    const lessThan = Math.min(numSpans, i + 1)

    if (lessThan <= start) continue

    // Get subsets of intermediate products in affected range
    const cuDOTcu_sub = cuDOTcu.subset(start, lessThan)
    const cuXcuuu_sub = cuXcuuu.subset(start, lessThan)
    const cuDOTcuu_sub = cuDOTcuu.subset(start, lessThan)
    const cuXcuu_sub = cuXcuu.subset(start, lessThan)

    // Compute ∂g/∂x_i using product rule
    const bi_u = precomputed.dBasisFunctions_du[i]
    const bi_uu = precomputed.d2BasisFunctions_du2[i]
    const bi_uuu = precomputed.d3BasisFunctions_du3[i]

    // ∂(cuDOTcu)/∂x_i = 2 * x' * B_i'
    const dCuDOTcu_dxi = bi_u.multiplyRange(bdsxu, start, lessThan).multiplyByScalar(2)

    // ∂(cuXcuuu)/∂x_i = B_i' * y''' - y' * B_i'''
    const dCuXcuuu_dxi = bi_u
      .multiplyRange(bdsyuuu, start, lessThan)
      .subtract(bdsyu.multiplyRange(bi_uuu, start, lessThan))

    // ∂(cuDOTcuu)/∂x_i = B_i' * x'' + x' * B_i''
    const dCuDOTcuu_dxi = bi_u
      .multiplyRange(bdsxuu, start, lessThan)
      .add(bdsxu.multiplyRange(bi_uu, start, lessThan))

    // ∂(cuXcuu)/∂x_i = B_i' * y'' - y' * B_i''
    const dCuXcuu_dxi = bi_u
      .multiplyRange(bdsyuu, start, lessThan)
      .subtract(bdsyu.multiplyRange(bi_uu, start, lessThan))

    // ∂g/∂x_i = ∂(cuDOTcu)/∂x_i * cuXcuuu + cuDOTcu * ∂(cuXcuuu)/∂x_i
    //         - 3 * (∂(cuDOTcuu)/∂x_i * cuXcuu + cuDOTcuu * ∂(cuXcuu)/∂x_i)
    const dgdxi = dCuDOTcu_dxi
      .multiply(cuXcuuu_sub)
      .add(cuDOTcu_sub.multiply(dCuXcuuu_dxi))
      .subtract(
        dCuDOTcuu_dxi
          .multiply(cuXcuu_sub)
          .add(cuDOTcuu_sub.multiply(dCuXcuu_dxi))
          .multiplyByScalar(3)
      )

    // Similarly for ∂g/∂y_i
    // ∂(cuDOTcu)/∂y_i = 2 * y' * B_i'
    const dCuDOTcu_dyi = bi_u.multiplyRange(bdsyu, start, lessThan).multiplyByScalar(2)

    // ∂(cuXcuuu)/∂y_i = -B_i' * x''' + x' * B_i'''
    const dCuXcuuu_dyi = bdsxu
      .multiplyRange(bi_uuu, start, lessThan)
      .subtract(bi_u.multiplyRange(bdsxuuu, start, lessThan))

    // ∂(cuDOTcuu)/∂y_i = B_i' * y'' + y' * B_i''
    const dCuDOTcuu_dyi = bi_u
      .multiplyRange(bdsyuu, start, lessThan)
      .add(bdsyu.multiplyRange(bi_uu, start, lessThan))

    // ∂(cuXcuu)/∂y_i = -B_i' * x'' + x' * B_i''
    const dCuXcuu_dyi = bdsxu
      .multiplyRange(bi_uu, start, lessThan)
      .subtract(bi_u.multiplyRange(bdsxuu, start, lessThan))

    const dgdyi = dCuDOTcu_dyi
      .multiply(cuXcuuu_sub)
      .add(cuDOTcu_sub.multiply(dCuXcuuu_dyi))
      .subtract(
        dCuDOTcuu_dyi
          .multiply(cuXcuu_sub)
          .add(cuDOTcuu_sub.multiply(dCuXcuu_dyi))
          .multiplyByScalar(3)
      )

    // Flatten and assign to Jacobian
    const dgdxiCPs = dgdxi.flattenControlPoints()
    const dgdyiCPs = dgdyi.flattenControlPoints()

    // Map to global constraint indices
    const localStart = start * cpsPerSpan

    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart

      if (localJ >= 0 && localJ < dgdxiCPs.length) {
        jacobian[aj][i] = dgdxiCPs[localJ]
        jacobian[aj][n + i] = dgdyiCPs[localJ]
      }
    }
  }

  return jacobian
}

// ============================================================================
// Periodic Curve Jacobian (precomputed basis derivatives)
// ============================================================================

/**
 * Precomputed data for periodic curve Jacobian computation.
 * Stores basis function derivatives and support ranges for each control point.
 */
export interface PrecomputedPeriodicBasisDerivatives {
  /** First derivative of each basis function B_i: dB_i/du */
  dBasisFunctions_du: BernsteinDecomposition[]
  /** Second derivative of each basis function: d²B_i/du² */
  d2BasisFunctions_du2: BernsteinDecomposition[]
  /** Third derivative of each basis function: d³B_i/du³ */
  d3BasisFunctions_du3: BernsteinDecomposition[]
  /** Fourth derivative of each basis function: d⁴B_i/du⁴ */
  d4BasisFunctions_du4: BernsteinDecomposition[]
  /** Support range for each control point: [spanStart, spanEnd) */
  support: [number, number][]
  /** Polynomial degree */
  degree: number
  /** Number of control points */
  numControlPoints: number
  /** Number of spans */
  numSpans: number
  /** The knots used for this precomputation */
  knots: readonly number[]
  /** The period of the curve */
  period: number
}

/**
 * Create a single basis function B_i for a periodic curve as Bernstein decomposition.
 * This creates a periodic B-spline with dirac control points (1 at index i, 0 elsewhere),
 * then converts to Bernstein decomposition.
 *
 * @param degree - Polynomial degree
 * @param knots - The actual knot vector (n knots for n control points)
 * @param period - The period of the curve
 * @param i - The index of the basis function to create
 */
function singleBasisPeriodic(
  degree: number,
  knots: readonly number[],
  period: number,
  i: number
): BernsteinDecomposition {
  const n = knots.length
  // Create dirac control points: 1 at index i, 0 elsewhere
  const diracCPs: number[] = new Array(n).fill(0)
  diracCPs[i] = 1

  // Create periodic B-spline with actual knots
  const bs = mkPeriodicBSplineWithKnots(degree, [...knots], diracCPs, period)

  // Convert to Bernstein decomposition using proper periodic handling
  return fromBSpline(bs)
}

/**
 * Generate a cache key for precomputed basis derivatives.
 * Includes knots to ensure we don't reuse cached values for different knot configurations.
 */
function basisDerivativesCacheKey(degree: number, knots: readonly number[], period: number): string {
  // Round knots to avoid floating point comparison issues
  const knotsStr = knots.map(k => k.toFixed(10)).join(',')
  return `${degree}-${knots.length}-${period.toFixed(10)}-${knotsStr}`
}

// Cache for precomputed periodic basis derivatives
const periodicBasisDerivativesCache = new Map<string, PrecomputedPeriodicBasisDerivatives>()

/**
 * Precompute basis function derivatives for periodic curves.
 *
 * Key insight from Haskell: For periodic curves, we must convert to BD first,
 * then differentiate using derivativeBD. This ensures correct handling of
 * the periodic wrap-around.
 *
 * Results are cached by (degree, knots, period) for reuse across drag operations.
 *
 * @param degree - Polynomial degree
 * @param knots - The actual knot vector (n knots for n control points)
 * @param period - The period of the curve (default: 1.0)
 */
export function precomputePeriodicBasisDerivatives(
  degree: number,
  knots: readonly number[],
  period: number = 1.0
): PrecomputedPeriodicBasisDerivatives {
  const cacheKey = basisDerivativesCacheKey(degree, knots, period)
  const cached = periodicBasisDerivativesCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const n = knots.length

  // Count distinct knots to determine number of spans
  const distinctKnots = new Set<number>()
  for (const k of knots) {
    distinctKnots.add(k)
  }
  const numSpans = distinctKnots.size

  const dBasisFunctions_du: BernsteinDecomposition[] = []
  const d2BasisFunctions_du2: BernsteinDecomposition[] = []
  const d3BasisFunctions_du3: BernsteinDecomposition[] = []
  const d4BasisFunctions_du4: BernsteinDecomposition[] = []
  const support: [number, number][] = []

  // For each control point, compute its basis function derivatives
  for (let i = 0; i < n; i++) {
    // Create basis function B_i as Bernstein decomposition
    const biBD = singleBasisPeriodic(degree, knots, period, i)

    // Compute derivatives using BD.derivative (not B-spline differentiate!)
    const bi_u = derivativeBD(biBD)
    const bi_uu = derivativeBD(bi_u)
    const bi_uuu = derivativeBD(bi_uu)
    const bi_uuuu = derivativeBD(bi_uuu)

    dBasisFunctions_du.push(bi_u)
    d2BasisFunctions_du2.push(bi_uu)
    d3BasisFunctions_du3.push(bi_uuu)
    d4BasisFunctions_du4.push(bi_uuuu)

    // Compute support range: control point i affects spans i, i+1, ..., i+degree
    // For degree p, basis function B_i is non-zero on p+1 consecutive spans
    const supStart = i % numSpans
    if (supStart + degree + 1 <= numSpans) {
      // No wrapping: contiguous range
      support.push([supStart, supStart + degree + 1])
    } else {
      // Wrapping around period boundary: conservative full range
      support.push([0, numSpans])
    }
  }

  const result: PrecomputedPeriodicBasisDerivatives = {
    dBasisFunctions_du,
    d2BasisFunctions_du2,
    d3BasisFunctions_du3,
    d4BasisFunctions_du4,
    support,
    degree,
    numControlPoints: n,
    numSpans,
    knots,
    period,
  }

  // Cache the result
  periodicBasisDerivativesCache.set(cacheKey, result)

  return result
}

/**
 * Curve state computed using precomputed basis derivatives.
 */
interface PeriodicCurveState {
  sxu: BernsteinDecomposition
  syu: BernsteinDecomposition
  sxuu: BernsteinDecomposition
  syuu: BernsteinDecomposition
  sxuuu: BernsteinDecomposition
  syuuu: BernsteinDecomposition
  h1: BernsteinDecomposition
  h2: BernsteinDecomposition
  h3: BernsteinDecomposition
  h4: BernsteinDecomposition
}

/**
 * Compute curve state using precomputed basis derivatives (LINEAR COMBINATION).
 *
 * Instead of converting B-splines to Bernstein decomposition (expensive),
 * we use linear combinations of precomputed basis function derivatives:
 *   x'(u) = Σᵢ xᵢ · B'ᵢ(u)
 */
function computePeriodicCurveStateFromCache(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[]
): PeriodicCurveState {
  const n = precomputed.numControlPoints
  const numSpans = precomputed.numSpans

  // Get degrees for each derivative level
  const firstBD = precomputed.dBasisFunctions_du[0]
  const secondBD = precomputed.d2BasisFunctions_du2[0]
  const thirdBD = precomputed.d3BasisFunctions_du3[0]

  const degree1 = firstBD.degree
  const degree2 = secondBD.degree
  const degree3 = thirdBD.degree

  // Initialize result arrays for all 6 linear combinations
  const sxuSpans: number[][] = []
  const syuSpans: number[][] = []
  const sxuuSpans: number[][] = []
  const syuuSpans: number[][] = []
  const sxuuuSpans: number[][] = []
  const syuuuSpans: number[][] = []

  for (let spanIdx = 0; spanIdx < numSpans; spanIdx++) {
    sxuSpans.push(new Array(degree1 + 1).fill(0))
    syuSpans.push(new Array(degree1 + 1).fill(0))
    sxuuSpans.push(new Array(degree2 + 1).fill(0))
    syuuSpans.push(new Array(degree2 + 1).fill(0))
    sxuuuSpans.push(new Array(degree3 + 1).fill(0))
    syuuuSpans.push(new Array(degree3 + 1).fill(0))
  }

  // Accumulate linear combinations from each control point
  // Use support to skip zero spans (B-spline locality)
  for (let i = 0; i < n; i++) {
    const xi = controlPointsX[i]
    const yi = controlPointsY[i]

    const bi_u = precomputed.dBasisFunctions_du[i]
    const bi_uu = precomputed.d2BasisFunctions_du2[i]
    const bi_uuu = precomputed.d3BasisFunctions_du3[i]

    const [supStart, supEnd] = precomputed.support[i]
    for (let spanIdx = supStart; spanIdx < supEnd; spanIdx++) {
      const span1 = bi_u.controlPointsArray[spanIdx]
      const span2 = bi_uu.controlPointsArray[spanIdx]
      const span3 = bi_uuu.controlPointsArray[spanIdx]

      for (let c = 0; c <= degree1; c++) {
        sxuSpans[spanIdx][c] += xi * span1[c]
        syuSpans[spanIdx][c] += yi * span1[c]
      }
      for (let c = 0; c <= degree2; c++) {
        sxuuSpans[spanIdx][c] += xi * span2[c]
        syuuSpans[spanIdx][c] += yi * span2[c]
      }
      for (let c = 0; c <= degree3; c++) {
        sxuuuSpans[spanIdx][c] += xi * span3[c]
        syuuuSpans[spanIdx][c] += yi * span3[c]
      }
    }
  }

  // Create BD objects
  const sxu = new BernsteinDecomposition(sxuSpans, firstBD.distinctKnots)
  const syu = new BernsteinDecomposition(syuSpans, firstBD.distinctKnots)
  const sxuu = new BernsteinDecomposition(sxuuSpans, secondBD.distinctKnots)
  const syuu = new BernsteinDecomposition(syuuSpans, secondBD.distinctKnots)
  const sxuuu = new BernsteinDecomposition(sxuuuSpans, thirdBD.distinctKnots)
  const syuuu = new BernsteinDecomposition(syuuuSpans, thirdBD.distinctKnots)

  // Compute products
  const h1 = sxu.multiply(sxu).add(syu.multiply(syu))
  const h2 = sxu.multiply(syuuu).subtract(syu.multiply(sxuuu))
  const h3 = sxu.multiply(sxuu).add(syu.multiply(syuu))
  const h4 = sxu.multiply(syuu).subtract(syu.multiply(sxuu))

  return { sxu, syu, sxuu, syuu, sxuuu, syuuu, h1, h2, h3, h4 }
}

/**
 * Compute constraint Bernstein decomposition using precomputed basis derivatives.
 * This is the fast path for computing g(t) for periodic curves.
 */
export function computePeriodicConstraintBDFromCache(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[]
): BernsteinDecomposition {
  const state = computePeriodicCurveStateFromCache(precomputed, controlPointsX, controlPointsY)

  // g = h1·h2 - 3·h3·h4 (curvature derivative numerator)
  return state.h1.multiply(state.h2).subtract(
    state.h3.multiply(state.h4).multiplyByScalar(3)
  )
}

/**
 * Compute constraint control points using precomputed basis derivatives.
 */
export function computePeriodicConstraintCPsFromCache(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[]
): number[] {
  const g = computePeriodicConstraintBDFromCache(precomputed, controlPointsX, controlPointsY)
  return g.flattenControlPoints()
}

/**
 * Compute the curvature numerator h4 = x'·y'' - y'·x'' as a Bernstein decomposition.
 * Zeros of h4 are the inflection points of the curve.
 */
export function computePeriodicInflectionBDFromCache(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[]
): BernsteinDecomposition {
  const state = computePeriodicCurveStateFromCache(precomputed, controlPointsX, controlPointsY)
  return state.h4
}

/**
 * Compute inflection constraint control points (flattened from h4 Bernstein decomposition).
 */
export function computePeriodicInflectionCPsFromCache(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[]
): number[] {
  return computePeriodicInflectionBDFromCache(precomputed, controlPointsX, controlPointsY)
    .flattenControlPoints()
}

/**
 * Compute explicit Jacobian for inflection constraints (h4 = x'·y'' - y'·x'').
 *
 * Much simpler than the curvature extrema Jacobian since h4 only involves
 * first and second derivatives:
 *   ∂h4/∂xᵢ = Bᵢ'·y'' - y'·Bᵢ''
 *   ∂h4/∂yᵢ = x'·Bᵢ'' - Bᵢ'·x''
 */
export function computePeriodicInflectionJacobian(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints
  const state = computePeriodicCurveStateFromCache(precomputed, controlPointsX, controlPointsY)

  const h4Degree = state.h4.degree
  const cpsPerSpan = h4Degree + 1

  const numActive = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) {
    jacobian[j] = new Array(2 * n).fill(0)
  }

  for (let i = 0; i < n; i++) {
    const [start, end] = precomputed.support[i]

    const bi_u = precomputed.dBasisFunctions_du[i]
    const bi_uu = precomputed.d2BasisFunctions_du2[i]

    // ∂h4/∂xᵢ = Bᵢ'·y'' - y'·Bᵢ''
    const dh4_dxi = bi_u.subset(start, end).multiply(state.syuu.subset(start, end))
      .subtract(state.syu.subset(start, end).multiply(bi_uu.subset(start, end)))

    // ∂h4/∂yᵢ = x'·Bᵢ'' - Bᵢ'·x''
    const dh4_dyi = state.sxu.subset(start, end).multiply(bi_uu.subset(start, end))
      .subtract(bi_u.subset(start, end).multiply(state.sxuu.subset(start, end)))

    const dh4dxiCPs = dh4_dxi.flattenControlPoints()
    const dh4dyiCPs = dh4_dyi.flattenControlPoints()

    const localStart = start * cpsPerSpan

    for (let aj = 0; aj < numActive; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart

      if (localJ >= 0 && localJ < dh4dxiCPs.length) {
        jacobian[aj][i] = dh4dxiCPs[localJ]
        jacobian[aj][n + i] = dh4dyiCPs[localJ]
      }
    }
  }

  return jacobian
}

/**
 * Compute inflection parameters for closed curves.
 * Returns parameter values where h4(t) = x'y'' - y'x'' = 0.
 */
export function computeClosedInflectionParameters(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[],
  degree: number,
): number[] {
  const precomputed = precomputePeriodicBasisDerivatives(degree, knots, 1.0)
  const h4BD = computePeriodicInflectionBDFromCache(precomputed, controlPointsX, controlPointsY)
  const zeros = findZerosBD(h4BD)

  // Check wrap-around zero (same as curvature extrema)
  const nSpans = h4BD.controlPointsArray.length
  if (nSpans > 0) {
    const lastCoeffs = h4BD.controlPointsArray[nSpans - 1]
    const firstCoeffs = h4BD.controlPointsArray[0]
    const valEnd = lastCoeffs[lastCoeffs.length - 1]
    const valStart = firstCoeffs[0]

    const hasSignChange = (valEnd > 0 && valStart < 0) || (valEnd < 0 && valStart > 0)
    if (hasSignChange) {
      const tol = 1e-7
      const period = h4BD.distinctKnots[h4BD.distinctKnots.length - 1]
      const hasNearStart = zeros.length > 0 && zeros[0] < tol
      const hasNearEnd = zeros.length > 0 && (period - zeros[zeros.length - 1]) < tol
      if (!hasNearStart && !hasNearEnd) {
        zeros.unshift(0)
      }
    }
  }

  zeros.sort((a, b) => a - b)
  const mergeTol = 1e-7
  const result: number[] = []
  for (const z of zeros) {
    if (result.length === 0 || z - result[result.length - 1] > mergeTol) {
      result.push(z)
    }
  }
  return result
}

/**
 * Compute curvature extrema parameters for periodic curves using cached basis derivatives.
 * This is much faster than computePeriodicCurvatureExtremaParameters for repeated calls.
 *
 * @param degree - Polynomial degree
 * @param knots - The actual knot vector (n knots for n control points)
 * @param controlPointsX - X coordinates of control points
 * @param controlPointsY - Y coordinates of control points
 * @param period - The period of the curve (default: 1.0)
 * @returns Array of parameter values where curvature extrema occur
 */
export function computePeriodicCurvatureExtremaParametersFast(
  degree: number,
  knots: readonly number[],
  controlPointsX: number[],
  controlPointsY: number[],
  period: number = 1.0
): number[] {
  const precomputed = precomputePeriodicBasisDerivatives(degree, knots, period)
  const gBD = computePeriodicConstraintBDFromCache(precomputed, controlPointsX, controlPointsY)
  return findZerosBD(gBD)
}

/**
 * Compute curvature extrema parameters for closed curves.
 *
 * Uses Bernstein-based zero-finding (via variation diminishing property) for
 * reliable and accurate results. Uses the actual knots for computation.
 *
 * @param knots - The curve's actual knot vector
 * @param controlPointsX - X coordinates of control points
 * @param controlPointsY - Y coordinates of control points
 * @param degree - Polynomial degree of the curve
 * @returns Array of parameter values in [0, 1) where curvature extrema occur
 */
export function computeClosedCurvatureExtremaParameters(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[],
  degree: number
): number[] {
  const n = controlPointsX.length

  // Safety check
  if (n < 2) {
    return []
  }

  // Compute g(t) as Bernstein decomposition and find zeros within spans
  const precomputed = precomputePeriodicBasisDerivatives(degree, knots, 1.0)
  const state = computePeriodicCurveStateFromCache(precomputed, controlPointsX, controlPointsY)
  const gBD = state.h1.multiply(state.h2).subtract(
    state.h3.multiply(state.h4).multiplyByScalar(3)
  )
  const zeros = findZerosBD(gBD)

  // Detect discontinuous curvature extrema at C^1 knot boundaries
  // For periodic curves, knots array directly encodes multiplicity
  const c1Boundaries = findC1SpanBoundaries(knots, degree, gBD.distinctKnots)

  if (c1Boundaries.size > 0) {
    // h4 = c'×c'' (curvature numerator)
    const curvatureNumBD = state.h4
    const discontinuousExtrema = findDiscontinuousCurvatureExtrema(curvatureNumBD, gBD, c1Boundaries)

    // Also check the wrap-around boundary (last span → first span)
    // For periodic curves, t=0 is a span boundary too
    const wrapBoundaryIsC1 = c1Boundaries.has(0) || (() => {
      // Check multiplicity of knot at 0
      const knotAtZeroCount = knots.filter(k => Math.abs(k) < 1e-10).length
      return knotAtZeroCount >= degree - 1
    })()

    if (wrapBoundaryIsC1) {
      const nSpans = gBD.controlPointsArray.length
      if (nSpans > 1) {
        const gLastCoeffs = gBD.controlPointsArray[nSpans - 1]
        const gFirstCoeffs = gBD.controlPointsArray[0]
        const gLeft = gLastCoeffs[gLastCoeffs.length - 1]
        const gRight = gFirstCoeffs[0]

        const sameSign = (gLeft > 0 && gRight > 0) || (gLeft < 0 && gRight < 0)
        if (sameSign) {
          const knLastCoeffs = curvatureNumBD.controlPointsArray[nSpans - 1]
          const knFirstCoeffs = curvatureNumBD.controlPointsArray[0]
          const knLeft = knLastCoeffs[knLastCoeffs.length - 1]
          const knRight = knFirstCoeffs[0]

          if ((gLeft > 0 && knLeft > knRight) || (gLeft < 0 && knLeft < knRight)) {
            discontinuousExtrema.push(0)
          }
        }
      }
    }

    if (discontinuousExtrema.length > 0) {
      // Merge before the wrap-around zero check so dedup works correctly
      zeros.push(...discontinuousExtrema)
    }
  }

  // Check for a g zero at the periodic wrap-around (t=1 ≡ t=0).
  // Same logic as findZerosBD's interior-boundary check: only fire on a true
  // sign change, OR when both endpoints are essentially zero relative to the
  // global maximum magnitude.
  const nSpans = gBD.controlPointsArray.length
  if (nSpans > 0) {
    const lastCoeffs = gBD.controlPointsArray[nSpans - 1]
    const firstCoeffs = gBD.controlPointsArray[0]
    const valEnd = lastCoeffs[lastCoeffs.length - 1]
    const valStart = firstCoeffs[0]

    let globalMaxAbsCoeff = 0
    for (const piece of gBD.controlPointsArray) {
      for (const c of piece) {
        const a = Math.abs(c)
        if (a > globalMaxAbsCoeff) globalMaxAbsCoeff = a
      }
    }
    const wrapNearZero = Math.max(globalMaxAbsCoeff * 1e-12, 1e-10)

    const hasSignChange = (valEnd > 0 && valStart < 0) || (valEnd < 0 && valStart > 0)
    const bothEssentiallyZero =
      Math.abs(valEnd) < wrapNearZero && Math.abs(valStart) < wrapNearZero

    if (hasSignChange || bothEssentiallyZero) {
      const tol = 1e-7
      const period = gBD.distinctKnots[gBD.distinctKnots.length - 1]
      const hasNearStart = zeros.length > 0 && zeros[0] < tol
      const hasNearEnd = zeros.length > 0 && (period - zeros[zeros.length - 1]) < tol
      if (!hasNearStart && !hasNearEnd) {
        zeros.unshift(0)
      }
    }
  }

  // Sort and deduplicate
  zeros.sort((a, b) => a - b)
  const mergeTol = 1e-7
  const result: number[] = []
  for (const z of zeros) {
    if (result.length === 0 || z - result[result.length - 1] > mergeTol) {
      result.push(z)
    }
  }
  return result
}
/**
 * Compute explicit Jacobian for periodic curves.
 *
 * Uses precomputed basis derivatives via linear combination.
 */
export function computePeriodicExplicitJacobian(
  precomputed: PrecomputedPeriodicBasisDerivatives,
  controlPointsX: number[],
  controlPointsY: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints

  // Compute curve state using linear combination of precomputed basis derivatives
  const state = computePeriodicCurveStateFromCache(precomputed, controlPointsX, controlPointsY)

  const gDegree = state.h1.multiply(state.h2).degree
  const cpsPerSpan = gDegree + 1

  // Initialize Jacobian matrix
  const numActiveConstraints = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActiveConstraints; j++) {
    jacobian[j] = new Array(2 * n).fill(0)
  }

  // For each control point, compute its contribution to the Jacobian
  for (let i = 0; i < n; i++) {
    // Locality: control point i only affects spans [start, end)
    const [start, end] = precomputed.support[i]

    // Get precomputed basis derivatives for this control point
    const bi_u = precomputed.dBasisFunctions_du[i]
    const bi_uu = precomputed.d2BasisFunctions_du2[i]
    const bi_uuu = precomputed.d3BasisFunctions_du3[i]

    // Compute partial derivatives ∂h/∂xᵢ and ∂h/∂yᵢ
    // ∂h1/∂xᵢ = 2·x'·Bᵢ' (subset)
    const dh1_dxi = state.sxu.subset(start, end).multiply(bi_u.subset(start, end)).multiplyByScalar(2)
    const dh1_dyi = state.syu.subset(start, end).multiply(bi_u.subset(start, end)).multiplyByScalar(2)

    // ∂h2/∂xᵢ = Bᵢ'·y''' - y'·Bᵢ'''
    const dh2_dxi = bi_u.subset(start, end).multiply(state.syuuu.subset(start, end))
      .subtract(state.syu.subset(start, end).multiply(bi_uuu.subset(start, end)))
    const dh2_dyi = state.sxu.subset(start, end).multiply(bi_uuu.subset(start, end))
      .subtract(bi_u.subset(start, end).multiply(state.sxuuu.subset(start, end)))

    // ∂h3/∂xᵢ = Bᵢ'·x'' + x'·Bᵢ''
    const dh3_dxi = bi_u.subset(start, end).multiply(state.sxuu.subset(start, end))
      .add(state.sxu.subset(start, end).multiply(bi_uu.subset(start, end)))
    const dh3_dyi = bi_u.subset(start, end).multiply(state.syuu.subset(start, end))
      .add(state.syu.subset(start, end).multiply(bi_uu.subset(start, end)))

    // ∂h4/∂xᵢ = Bᵢ'·y'' - y'·Bᵢ''
    const dh4_dxi = bi_u.subset(start, end).multiply(state.syuu.subset(start, end))
      .subtract(state.syu.subset(start, end).multiply(bi_uu.subset(start, end)))
    const dh4_dyi = state.sxu.subset(start, end).multiply(bi_uu.subset(start, end))
      .subtract(bi_u.subset(start, end).multiply(state.sxuu.subset(start, end)))

    // ∂g/∂xᵢ = ∂h1/∂xᵢ·h2 + h1·∂h2/∂xᵢ - 3·(∂h3/∂xᵢ·h4 + h3·∂h4/∂xᵢ)
    const h1_sub = state.h1.subset(start, end)
    const h2_sub = state.h2.subset(start, end)
    const h3_sub = state.h3.subset(start, end)
    const h4_sub = state.h4.subset(start, end)

    const dgdxi = dh1_dxi.multiply(h2_sub).add(h1_sub.multiply(dh2_dxi))
      .subtract(dh3_dxi.multiply(h4_sub).add(h3_sub.multiply(dh4_dxi)).multiplyByScalar(3))

    const dgdyi = dh1_dyi.multiply(h2_sub).add(h1_sub.multiply(dh2_dyi))
      .subtract(dh3_dyi.multiply(h4_sub).add(h3_sub.multiply(dh4_dyi)).multiplyByScalar(3))

    const dgdxiCPs = dgdxi.flattenControlPoints()
    const dgdyiCPs = dgdyi.flattenControlPoints()

    // Map local constraint indices to global Jacobian
    const localStart = start * cpsPerSpan

    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart

      if (localJ >= 0 && localJ < dgdxiCPs.length) {
        jacobian[aj][i] = dgdxiCPs[localJ]
        jacobian[aj][n + i] = dgdyiCPs[localJ]
      }
    }
  }

  return jacobian
}

// ============================================================================
// Zero Finding for Bernstein Decompositions
// ============================================================================

/**
 * Split a Bernstein polynomial at u = 0.5 using de Casteljau algorithm.
 * Returns [leftCoeffs, rightCoeffs] for the two halves.
 */
function deCasteljauSplit(coeffs: number[]): [number[], number[]] {
  const n = coeffs.length
  if (n === 0) return [[], []]
  if (n === 1) return [[coeffs[0]], [coeffs[0]]]

  // Build de Casteljau triangle
  const triangle: number[][] = [coeffs]
  let current = coeffs

  while (current.length > 1) {
    const next: number[] = []
    for (let i = 0; i < current.length - 1; i++) {
      next.push((current[i] + current[i + 1]) / 2)
    }
    triangle.push(next)
    current = next
  }

  // Left coefficients: first element of each level
  const leftCoeffs = triangle.map((level) => level[0])

  // Right coefficients: last element of each level (in reverse order)
  const rightCoeffs = triangle.map((level) => level[level.length - 1]).reverse()

  return [leftCoeffs, rightCoeffs]
}

/**
 * Find zeros of a Bernstein polynomial on interval [tA, tB].
 * Uses de Casteljau subdivision with the variation diminishing property:
 * - If all coefficients have the same sign, there's no zero in the interval
 * - If there's a sign change, there's at least one zero
 * - Subdivision narrows down the interval containing zeros
 */
function findBernsteinZeros(
  coeffs: number[],
  tA: number,
  tB: number,
  tol: number,
  maxIter: number
): number[] {
  if (coeffs.length === 0) return []

  const zeros: number[] = []

  // Use a work queue instead of recursion
  const queue: Array<{ coeffs: number[], tA: number, tB: number, depth: number }> = [
    { coeffs, tA, tB, depth: 0 }
  ]

  let iterations = 0
  const maxTotalIter = 10000

  while (queue.length > 0 && iterations < maxTotalIter) {
    iterations++
    const item = queue.pop()!
    const { coeffs: c, tA: a, tB: b, depth } = item

    // Find min and max of coefficients to check for sign changes
    let minCoeff = c[0]
    let maxCoeff = c[0]
    for (let i = 1; i < c.length; i++) {
      if (c[i] < minCoeff) minCoeff = c[i]
      if (c[i] > maxCoeff) maxCoeff = c[i]
    }

    // If all coefficients are extremely small in absolute terms,
    // the polynomial is essentially zero (numerical noise from catastrophic
    // cancellation, e.g. constant-curvature curves) — no meaningful zeros.
    const maxAbsCoeff = Math.max(Math.abs(minCoeff), Math.abs(maxCoeff))
    if (maxAbsCoeff < 1e-10) {
      continue
    }

    // Tolerance for considering a value "near zero"
    // Use relative tolerance based on the range of coefficients
    const range = maxCoeff - minCoeff
    const eps = Math.max(1e-14, range * 1e-10)

    // If all coefficients have the same sign (all positive or all negative), no zero
    if (minCoeff > eps || maxCoeff < -eps) {
      continue // No zero in this interval
    }

    // If the range is small enough that the polynomial is essentially constant near zero,
    // or if the interval is small enough, report a zero
    if (b - a < tol || depth >= maxIter) {
      // Only report if there's actually a sign change or near-zero
      if (minCoeff <= eps && maxCoeff >= -eps) {
        // The interval contains or is near zero
        zeros.push((a + b) / 2)
      }
      continue
    }

    // Subdivide
    const [leftCoeffs, rightCoeffs] = deCasteljauSplit(c)
    const mid = (a + b) / 2
    queue.push({ coeffs: rightCoeffs, tA: mid, tB: b, depth: depth + 1 })
    queue.push({ coeffs: leftCoeffs, tA: a, tB: mid, depth: depth + 1 })
  }

  return zeros.sort((x, y) => x - y)
}

/**
 * Find zeros of a Bernstein decomposition (piecewise Bernstein polynomial).
 *
 * This finds zeros by:
 * 1. For each span: find zeros within the span using de Casteljau subdivision
 * 2. For each knot boundary: check for sign changes between spans
 * 3. Merge nearby zeros to eliminate duplicates from subdivision
 */
export function findZerosBD(bd: BernsteinDecomposition): number[] {
  const tol = 1e-8
  const maxIter = 50
  const nSpans = bd.controlPointsArray.length

  if (nSpans === 0) return []

  // Find zeros within each span
  let zerosInSpans: number[] = []
  for (let spanIdx = 0; spanIdx < nSpans; spanIdx++) {
    const coeffs = bd.controlPointsArray[spanIdx]
    const tA = bd.distinctKnots[spanIdx]
    const tB = bd.distinctKnots[spanIdx + 1]
    const spanZeros = findBernsteinZeros(coeffs, tA, tB, tol, maxIter)
    zerosInSpans = zerosInSpans.concat(spanZeros)
  }

  // Find zeros at knot boundaries.
  // For B-splines with degree < 4, the Bernstein decomposition can be
  // discontinuous at knot boundaries (mathematically correct), so a zero may
  // exist at the boundary even if neither piece evaluates to exactly zero.
  //
  // A zero is reported at a boundary iff EITHER:
  //   - the boundary endpoint values have opposite signs (true crossing), OR
  //   - both endpoint values are essentially zero (tangent / discontinuous zero
  //     at the boundary itself).
  //
  // We measure "essentially zero" against the GLOBAL maximum coefficient
  // magnitude across all BD pieces, with a tight relative tolerance. The
  // previous local-magnitude check was too loose: a single small endpoint
  // value (e.g. 1e+7 next to neighbors of 1e+14) would falsely fire a zero
  // even when the polynomial was clearly bounded away from zero on both
  // sides without a sign change.
  let globalMaxAbsCoeff = 0
  for (const piece of bd.controlPointsArray) {
    for (const c of piece) {
      const a = Math.abs(c)
      if (a > globalMaxAbsCoeff) globalMaxAbsCoeff = a
    }
  }
  const boundaryNearZero = Math.max(globalMaxAbsCoeff * 1e-12, 1e-10)

  const zerosAtBoundaries: number[] = []
  for (let i = 0; i < nSpans - 1; i++) {
    const coeffsI = bd.controlPointsArray[i]
    const coeffsJ = bd.controlPointsArray[i + 1]
    const valRight = coeffsI[coeffsI.length - 1] // value at right end of span i
    const valLeft = coeffsJ[0]                    // value at left end of span i+1

    const hasSignChange = (valRight > 0 && valLeft < 0) || (valRight < 0 && valLeft > 0)
    const bothEssentiallyZero =
      Math.abs(valRight) < boundaryNearZero && Math.abs(valLeft) < boundaryNearZero

    if (hasSignChange || bothEssentiallyZero) {
      zerosAtBoundaries.push(bd.distinctKnots[i + 1])
    }
  }

  // Sort all zeros
  const allZeros = zerosInSpans.concat(zerosAtBoundaries).sort((a, b) => a - b)

  // Merge nearby zeros (within tolerance) to eliminate duplicates
  const mergeTol = tol * 10 // Use a slightly larger tolerance for merging
  const mergedZeros: number[] = []
  for (const z of allZeros) {
    if (mergedZeros.length === 0 || z - mergedZeros[mergedZeros.length - 1] > mergeTol) {
      mergedZeros.push(z)
    }
  }

  return mergedZeros
}

/**
 * Compute the Bernstein decomposition of the curvature derivative numerator g(t).
 * This is needed for finding zeros (curvature extrema locations).
 */
export function computeCurvatureDerivativeNumeratorBD(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): BernsteinDecomposition {
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }

  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)
  const sxuuu = simpleDifferentiate(sxuu)
  const syuuu = simpleDifferentiate(syuu)

  const bdsxu = decomposeToBernstein(sxu)
  const bdsyu = decomposeToBernstein(syu)
  const bdsxuu = decomposeToBernstein(sxuu)
  const bdsyuu = decomposeToBernstein(syuu)
  const bdsxuuu = decomposeToBernstein(sxuuu)
  const bdsyuuu = decomposeToBernstein(syuuu)

  const cuDOTcu = bdsxu.multiply(bdsxu).add(bdsyu.multiply(bdsyu))
  const cuXcuuu = bdsxu.multiply(bdsyuuu).subtract(bdsyu.multiply(bdsxuuu))
  const cuDOTcuu = bdsxu.multiply(bdsxuu).add(bdsyu.multiply(bdsyuu))
  const cuXcuu = bdsxu.multiply(bdsyuu).subtract(bdsyu.multiply(bdsxuu))

  return cuDOTcu.multiply(cuXcuuu).subtract(cuDOTcuu.multiply(cuXcuu).multiplyByScalar(3))
}

/**
 * Compute parameter values where curvature extrema occur.
 * Returns an array of parameter values t where g(t) = 0.
 */
export function computeCurvatureExtremaParameters(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): number[] {
  const gBD = computeCurvatureDerivativeNumeratorBD(knots, controlPointsX, controlPointsY)
  const zeros = findZerosBD(gBD)

  // Detect discontinuous curvature extrema at C^1 knot boundaries
  const degree = knots.length - controlPointsX.length - 1
  const c1Boundaries = findC1SpanBoundaries(knots, degree, gBD.distinctKnots)
  if (c1Boundaries.size > 0) {
    const curvatureNumBD = computeCurvatureNumeratorBD(knots, controlPointsX, controlPointsY)
    const discontinuousExtrema = findDiscontinuousCurvatureExtrema(curvatureNumBD, gBD, c1Boundaries)
    if (discontinuousExtrema.length > 0) {
      const merged = zeros.concat(discontinuousExtrema).sort((a, b) => a - b)
      const mergeTol = 1e-7
      const result: number[] = []
      for (const z of merged) {
        if (result.length === 0 || z - result[result.length - 1] > mergeTol) {
          result.push(z)
        }
      }
      return result
    }
  }

  return zeros
}

/**
 * Compute the Bernstein decomposition of the curvature numerator c'×c'' = x'·y'' - y'·x''.
 * For degree-2 B-splines, c'' is piecewise constant so this quantity has jump discontinuities
 * at internal knots. Used to detect discontinuous curvature extrema.
 */
export function computeCurvatureNumeratorBD(
  knots: number[],
  controlPointsX: number[],
  controlPointsY: number[]
): BernsteinDecomposition {
  const sx: SimpleBSpline = { knots, controlPoints: controlPointsX }
  const sy: SimpleBSpline = { knots, controlPoints: controlPointsY }

  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)

  const bdsxu = decomposeToBernstein(sxu)
  const bdsyu = decomposeToBernstein(syu)
  const bdsxuu = decomposeToBernstein(sxuu)
  const bdsyuu = decomposeToBernstein(syuu)

  return bdsxu.multiply(bdsyuu).subtract(bdsyu.multiply(bdsxuu))
}

/**
 * Compute the set of span boundary indices where curvature is discontinuous.
 *
 * A knot with multiplicity m in a degree-p curve has C^(p-m) continuity.
 * Curvature is discontinuous when p - m <= 1, i.e., m >= p - 1.
 *
 * @param knots - The full knot vector (with repeated values for multiplicity)
 * @param degree - The curve degree
 * @param distinctKnots - The distinct knot values (span boundaries from BernsteinDecomposition)
 * @returns Set of span boundary indices (into distinctKnots) where curvature is discontinuous
 */
export function findC1SpanBoundaries(
  knots: number[],
  degree: number,
  distinctKnots: number[]
): Set<number> {
  const result = new Set<number>()

  // Build multiplicity map from the full knot vector
  const multiplicities = new Map<number, number>()
  for (const k of knots) {
    const rounded = Math.round(k * 1e10) / 1e10
    multiplicities.set(rounded, (multiplicities.get(rounded) || 0) + 1)
  }

  // Check each interior span boundary
  for (let i = 1; i < distinctKnots.length - 1; i++) {
    const rounded = Math.round(distinctKnots[i] * 1e10) / 1e10
    const m = multiplicities.get(rounded) || 1
    if (m >= degree - 1) {
      result.add(i)
    }
  }

  return result
}

/**
 * Find discontinuous curvature extrema at C^1 knot boundaries.
 *
 * At C^1 points (where curvature is discontinuous), κ can have a jump that
 * creates a local extremum not detected by findZerosBD. This happens when
 * g (curvature derivative numerator) has the same sign on both sides of the
 * knot, but κ jumps in the opposite direction.
 *
 * @param curvatureNumeratorBD - Bernstein decomposition of c'×c'' (curvature numerator)
 * @param gBD - Bernstein decomposition of the curvature derivative numerator g(t)
 * @param c1Boundaries - Set of span boundary indices where curvature is discontinuous
 * @returns Array of parameter values at knot boundaries where discontinuous extrema occur
 */
export function findDiscontinuousCurvatureExtrema(
  curvatureNumeratorBD: BernsteinDecomposition,
  gBD: BernsteinDecomposition,
  c1Boundaries?: Set<number>
): number[] {
  const result: number[] = []
  const nSpans = gBD.controlPointsArray.length

  if (nSpans <= 1) return result

  for (let i = 0; i < nSpans - 1; i++) {
    // Only check span boundaries where curvature is actually discontinuous
    if (c1Boundaries && !c1Boundaries.has(i + 1)) continue

    const gCoeffsI = gBD.controlPointsArray[i]
    const gCoeffsJ = gBD.controlPointsArray[i + 1]
    const gLeft = gCoeffsI[gCoeffsI.length - 1]
    const gRight = gCoeffsJ[0]

    // Only check when g has the same sign on both sides (no sign change)
    const sameSign = (gLeft > 0 && gRight > 0) || (gLeft < 0 && gRight < 0)
    if (!sameSign) continue

    const knCoeffsI = curvatureNumeratorBD.controlPointsArray[i]
    const knCoeffsJ = curvatureNumeratorBD.controlPointsArray[i + 1]
    const knLeft = knCoeffsI[knCoeffsI.length - 1]
    const knRight = knCoeffsJ[0]

    // g > 0 means curvature is increasing; if κ jumps down → discontinuous max
    // g < 0 means curvature is decreasing; if κ jumps up → discontinuous min
    if (gLeft > 0 && knLeft > knRight) {
      result.push(gBD.distinctKnots[i + 1])
    } else if (gLeft < 0 && knLeft < knRight) {
      result.push(gBD.distinctKnots[i + 1])
    }
  }

  return result
}

// ============================================================================
// Rational B-Spline Curvature Derivative Numerator
// Uses Chen's complexity reduction for rational curves.
// ============================================================================

/**
 * Derivatives of homogeneous B-spline components as Bernstein decompositions.
 */
interface RationalDerivatives {
  x: BernsteinDecomposition
  y: BernsteinDecomposition
  w: BernsteinDecomposition
  xu: BernsteinDecomposition
  yu: BernsteinDecomposition
  wu: BernsteinDecomposition
  xuu: BernsteinDecomposition
  yuu: BernsteinDecomposition
  wuu: BernsteinDecomposition
  xuuu: BernsteinDecomposition
  yuuu: BernsteinDecomposition
  wuuu: BernsteinDecomposition
}

/**
 * Chen terms for complexity reduction of rational B-spline curvature formulas.
 * Reference: Xianming Chen, "Complexity Reduction for Symbolic Computation with Rational B-Splines"
 */
interface ChenTerms {
  w: BernsteinDecomposition
  wu: BernsteinDecomposition
  D1x: BernsteinDecomposition
  D1y: BernsteinDecomposition
  D2x: BernsteinDecomposition
  D2y: BernsteinDecomposition
  D3x: BernsteinDecomposition
  D3y: BernsteinDecomposition
  D21x: BernsteinDecomposition
  D21y: BernsteinDecomposition
}

/**
 * Compute derivatives of homogeneous B-spline components as Bernstein decompositions.
 * For open B-splines (raw arrays).
 */
function computeRationalDerivativesBDFromArrays(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): RationalDerivatives {
  const sx: SimpleBSpline = { knots, controlPoints: cpsX }
  const sy: SimpleBSpline = { knots, controlPoints: cpsY }
  const sw: SimpleBSpline = { knots, controlPoints: cpsW }

  const sxu = simpleDifferentiate(sx)
  const syu = simpleDifferentiate(sy)
  const swu = simpleDifferentiate(sw)
  const sxuu = simpleDifferentiate(sxu)
  const syuu = simpleDifferentiate(syu)
  const swuu = simpleDifferentiate(swu)
  const sxuuu = simpleDifferentiate(sxuu)
  const syuuu = simpleDifferentiate(syuu)
  const swuuu = simpleDifferentiate(swuu)

  return {
    x: decomposeToBernstein(sx),
    y: decomposeToBernstein(sy),
    w: decomposeToBernstein(sw),
    xu: decomposeToBernstein(sxu),
    yu: decomposeToBernstein(syu),
    wu: decomposeToBernstein(swu),
    xuu: decomposeToBernstein(sxuu),
    yuu: decomposeToBernstein(syuu),
    wuu: decomposeToBernstein(swuu),
    xuuu: decomposeToBernstein(sxuuu),
    yuuu: decomposeToBernstein(syuuu),
    wuuu: decomposeToBernstein(swuuu),
  }
}

/**
 * Compute Chen terms from rational derivatives.
 */
function computeChenTermsFromDerivatives(d: RationalDerivatives): ChenTerms {
  return {
    w: d.w,
    wu: d.wu,
    D1x: d.xu.multiply(d.w).subtract(d.x.multiply(d.wu)),
    D1y: d.yu.multiply(d.w).subtract(d.y.multiply(d.wu)),
    D2x: d.xuu.multiply(d.w).subtract(d.x.multiply(d.wuu)),
    D2y: d.yuu.multiply(d.w).subtract(d.y.multiply(d.wuu)),
    D3x: d.xuuu.multiply(d.w).subtract(d.x.multiply(d.wuuu)),
    D3y: d.yuuu.multiply(d.w).subtract(d.y.multiply(d.wuuu)),
    D21x: d.xuu.multiply(d.wu).subtract(d.xu.multiply(d.wuu)),
    D21y: d.yuu.multiply(d.wu).subtract(d.yu.multiply(d.wuu)),
  }
}

/**
 * Compute the curvature derivative numerator g(t) for a rational B-spline (Bernstein decomposition).
 *
 * g = (D1xD3 + D1xD21)·D1dotD1·w + 2·wu·D1xD2·D1dotD1 - 3·D1dotD2·D1xD2·w
 *
 * where D1xD3 = D1x·D3y - D1y·D3x (determinant), etc.
 */
function computeRationalGFromChenTerms(ct: ChenTerms): BernsteinDecomposition {
  const D1dotD1 = ct.D1x.multiply(ct.D1x).add(ct.D1y.multiply(ct.D1y))
  const D1xD3 = ct.D1x.multiply(ct.D3y).subtract(ct.D1y.multiply(ct.D3x))
  const D1xD21 = ct.D1x.multiply(ct.D21y).subtract(ct.D1y.multiply(ct.D21x))
  const D1xD2 = ct.D1x.multiply(ct.D2y).subtract(ct.D1y.multiply(ct.D2x))
  const D1dotD2 = ct.D1x.multiply(ct.D2x).add(ct.D1y.multiply(ct.D2y))

  // g = (D1xD3 + D1xD21) * D1dotD1 * w + 2 * wu * D1xD2 * D1dotD1 - 3 * D1dotD2 * D1xD2 * w
  const term1 = D1xD3.add(D1xD21).multiply(D1dotD1).multiply(ct.w)
  const term2 = ct.wu.multiplyByScalar(2).multiply(D1xD2).multiply(D1dotD1)
  const term3 = D1dotD2.multiplyByScalar(3).multiply(D1xD2).multiply(ct.w)

  return term1.add(term2).subtract(term3)
}

/**
 * Compute curvature derivative numerator CPs for an open rational B-spline.
 */
export function computeRationalCurvatureDerivativeNumeratorCPs(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): number[] {
  const d = computeRationalDerivativesBDFromArrays(knots, cpsX, cpsY, cpsW)
  const ct = computeChenTermsFromDerivatives(d)
  return computeRationalGFromChenTerms(ct).flattenControlPoints()
}

/**
 * Compute curvature derivative numerator BD for an open rational B-spline.
 */
export function computeRationalCurvatureDerivativeNumeratorBD(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): BernsteinDecomposition {
  const d = computeRationalDerivativesBDFromArrays(knots, cpsX, cpsY, cpsW)
  const ct = computeChenTermsFromDerivatives(d)
  return computeRationalGFromChenTerms(ct)
}

/**
 * Compute curvature extrema parameters for an open rational B-spline.
 */
export function computeRationalCurvatureExtremaParameters(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): number[] {
  const gBD = computeRationalCurvatureDerivativeNumeratorBD(knots, cpsX, cpsY, cpsW)
  return findZerosBD(gBD)
}

// ============================================================================
// Periodic Rational B-Spline Support
// ============================================================================

/**
 * Compute derivatives of periodic rational B-spline components as Bernstein decompositions.
 * When wrapWeight is provided and differs from cpsW[0], uses spiral-aware unrolling
 * to correctly handle weight spiraling at the periodic boundary.
 */
function computePeriodicRationalDerivativesBD(
  degree: number,
  knots: readonly number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  period: number = 1.0,
  wrapWeight?: number
): RationalDerivatives {
  // Compute spiral ratio
  const ratio = (wrapWeight !== undefined && Math.abs(cpsW[0]) > 1e-20)
    ? wrapWeight / cpsW[0]
    : 1.0

  let sxBD!: BernsteinDecomposition, syBD!: BernsteinDecomposition, swBD!: BernsteinDecomposition

  if (Math.abs(ratio - 1.0) < 1e-12) {
    // No spiral, use standard periodic approach
    const sx = mkPeriodicBSplineWithKnots(degree, [...knots], cpsX, period)
    const sy = mkPeriodicBSplineWithKnots(degree, [...knots], cpsY, period)
    const sw = mkPeriodicBSplineWithKnots(degree, [...knots], cpsW, period)
    sxBD = fromBSpline(sx)
    syBD = fromBSpline(sy)
    swBD = fromBSpline(sw)
  } else {
    // Spiral: unroll, apply scaling to wrapped CPs, then decompose clamped region
    const sx = mkPeriodicBSplineWithKnots(degree, [...knots], cpsX, period)
    const sy = mkPeriodicBSplineWithKnots(degree, [...knots], cpsY, period)
    const sw = mkPeriodicBSplineWithKnots(degree, [...knots], cpsW, period)

    const [tMin, tMax] = bsplineDomain(sx)
    const p = degree
    const n = cpsX.length

    // Unroll each, scale first p CPs (negative-index wraps), then decompose
    for (const [bs, setBD] of [
      [sx, (bd: BernsteinDecomposition) => { sxBD = bd }],
      [sy, (bd: BernsteinDecomposition) => { syBD = bd }],
      [sw, (bd: BernsteinDecomposition) => { swBD = bd }],
    ] as [BSpline, (bd: BernsteinDecomposition) => void][]) {
      const open = unrollToOpen(bs)
      const cps = cpToArray(open.controlPoints)
      // Scale the first p CPs (indices -p to -1, which wrap from previous period)
      for (let i = 0; i < p; i++) {
        const logicalIdx = -p + i
        const periods = Math.floor(logicalIdx / n)
        cps[i] *= Math.pow(ratio, periods)
      }
      const modified = mkOpenBSpline(p, [...(open.knots as { tag: 'open'; knots: number[] }).knots], cps)
      setBD(decomposeClampedRegion(modified, tMin, tMax))
    }
  }

  const sxu = derivativeBD(sxBD)
  const syu = derivativeBD(syBD)
  const swu = derivativeBD(swBD)
  const sxuu = derivativeBD(sxu)
  const syuu = derivativeBD(syu)
  const swuu = derivativeBD(swu)
  const sxuuu = derivativeBD(sxuu)
  const syuuu = derivativeBD(syuu)
  const swuuu = derivativeBD(swuu)

  return {
    x: sxBD, y: syBD, w: swBD,
    xu: sxu, yu: syu, wu: swu,
    xuu: sxuu, yuu: syuu, wuu: swuu,
    xuuu: sxuuu, yuuu: syuuu, wuuu: swuuu,
  }
}

/**
 * Compute curvature derivative numerator CPs for a periodic rational B-spline.
 */
export function computePeriodicRationalCurvatureDerivativeNumeratorCPs(
  degree: number,
  knots: readonly number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  period: number = 1.0,
  wrapWeight?: number
): number[] {
  const d = computePeriodicRationalDerivativesBD(degree, knots, cpsX, cpsY, cpsW, period, wrapWeight)
  const ct = computeChenTermsFromDerivatives(d)
  return computeRationalGFromChenTerms(ct).flattenControlPoints()
}

/**
 * Compute curvature derivative numerator BD for a periodic rational B-spline.
 */
export function computePeriodicRationalCurvatureDerivativeNumeratorBD(
  degree: number,
  knots: readonly number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  period: number = 1.0,
  wrapWeight?: number
): BernsteinDecomposition {
  const d = computePeriodicRationalDerivativesBD(degree, knots, cpsX, cpsY, cpsW, period, wrapWeight)
  const ct = computeChenTermsFromDerivatives(d)
  return computeRationalGFromChenTerms(ct)
}

/**
 * Compute curvature extrema parameters for a periodic rational B-spline.
 */
export function computePeriodicRationalCurvatureExtremaParameters(
  degree: number,
  knots: readonly number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  period: number = 1.0
): number[] {
  const gBD = computePeriodicRationalCurvatureDerivativeNumeratorBD(degree, knots, cpsX, cpsY, cpsW, period)
  return findZerosBD(gBD)
}

/**
 * Compute curvature extrema parameters for a closed rational B-spline curve.
 * Handles wrap-around zero detection at the periodic boundary.
 */
export function computeClosedRationalCurvatureExtremaParameters(
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  degree: number,
  wrapWeight?: number
): number[] {
  if (cpsX.length < 2) return []

  const gBD = computePeriodicRationalCurvatureDerivativeNumeratorBD(degree, knots, cpsX, cpsY, cpsW, 1.0, wrapWeight)
  const zeros = findZerosBD(gBD)

  // Check for a zero at the periodic wrap-around (t=1 ≡ t=0)
  const nSpans = gBD.controlPointsArray.length
  if (nSpans > 0) {
    const lastCoeffs = gBD.controlPointsArray[nSpans - 1]
    const firstCoeffs = gBD.controlPointsArray[0]
    const valEnd = lastCoeffs[lastCoeffs.length - 1]
    const valStart = firstCoeffs[0]

    const hasSignChange = (valEnd > 0 && valStart < 0) || (valEnd < 0 && valStart > 0)
    const avgMagnitude = (Math.abs(valEnd) + Math.abs(valStart)) / 2
    const zeroThreshold = Math.max(avgMagnitude * 1e-6, 1e-10)
    const endNearZero = Math.abs(valEnd) < zeroThreshold
    const startNearZero = Math.abs(valStart) < zeroThreshold

    if (hasSignChange || endNearZero || startNearZero) {
      const tol = 1e-7
      const period = gBD.distinctKnots[gBD.distinctKnots.length - 1]
      const hasNearStart = zeros.length > 0 && zeros[0] < tol
      const hasNearEnd = zeros.length > 0 && (period - zeros[zeros.length - 1]) < tol
      if (!hasNearStart && !hasNearEnd) {
        zeros.unshift(0)
      }
    }
  }

  return zeros
}

// ============================================================================
// Rational B-Spline Explicit Jacobian Computation
// ============================================================================

/**
 * Precomputed data for fast rational Jacobian computation.
 * Includes zeroth-order basis functions needed for weight partials.
 */
export interface PrecomputedRationalBasisDerivatives {
  basisFunctions: BernsteinDecomposition[]
  dBasisFunctions_du: BernsteinDecomposition[]
  d2BasisFunctions_du2: BernsteinDecomposition[]
  d3BasisFunctions_du3: BernsteinDecomposition[]
  degree: number
  numControlPoints: number
  knots: number[]
  distinctKnots: number[]
}

/**
 * Precompute basis function derivatives for rational curves (open).
 * Includes zeroth-order basis functions needed for weight partials.
 */
export function precomputeRationalBasisDerivatives(
  knots: number[],
  numControlPoints: number
): PrecomputedRationalBasisDerivatives {
  const degree = knots.length - numControlPoints - 1
  const distinctKnots = getDistinctKnots(knots)

  const basisFunctions: BernsteinDecomposition[] = []
  const dBasisFunctions_du: BernsteinDecomposition[] = []
  const d2BasisFunctions_du2: BernsteinDecomposition[] = []
  const d3BasisFunctions_du3: BernsteinDecomposition[] = []

  for (let i = 0; i < numControlPoints; i++) {
    const diracCPs = new Array(numControlPoints).fill(0)
    diracCPs[i] = 1

    const basisFunction: SimpleBSpline = { knots, controlPoints: diracCPs }
    const dBasis = simpleDifferentiate(basisFunction)
    const d2Basis = simpleDifferentiate(dBasis)
    const d3Basis = simpleDifferentiate(d2Basis)

    basisFunctions.push(decomposeToBernstein(basisFunction))
    dBasisFunctions_du.push(decomposeToBernstein(dBasis))
    d2BasisFunctions_du2.push(decomposeToBernstein(d2Basis))
    d3BasisFunctions_du3.push(decomposeToBernstein(d3Basis))
  }

  return {
    basisFunctions,
    dBasisFunctions_du,
    d2BasisFunctions_du2,
    d3BasisFunctions_du3,
    degree,
    numControlPoints,
    knots,
    distinctKnots,
  }
}

/**
 * Compute explicit Jacobian of curvature derivative numerator for a rational B-spline.
 * Returns a 2D array where jacobian[j][i] = ∂g_j/∂var_i
 * Variables are ordered: [X0..Xn, Y0..Yn, W0..Wn] (3n total).
 *
 * Follows the reference implementation in OpRationalBSplineR1toR2.ts.
 */
export function computeRationalExplicitJacobian(
  precomputed: PrecomputedRationalBasisDerivatives,
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints
  const degree = precomputed.degree
  const knots = precomputed.knots

  // Compute current derivatives
  const d = computeRationalDerivativesBDFromArrays(knots, cpsX, cpsY, cpsW)
  const ct = computeChenTermsFromDerivatives(d)

  // Precomputed global terms
  const D1dotD1 = ct.D1x.multiply(ct.D1x).add(ct.D1y.multiply(ct.D1y))
  const D1xD3 = ct.D1x.multiply(ct.D3y).subtract(ct.D1y.multiply(ct.D3x))
  const D1xD21 = ct.D1x.multiply(ct.D21y).subtract(ct.D1y.multiply(ct.D21x))
  const D1xD2 = ct.D1x.multiply(ct.D2y).subtract(ct.D1y.multiply(ct.D2x))
  const D1dotD2 = ct.D1x.multiply(ct.D2x).add(ct.D1y.multiply(ct.D2y))

  const numSpans = n - degree
  const g = computeRationalGFromChenTerms(ct)
  const gDegree = g.degree
  const cpsPerSpan = gDegree + 1

  // Initialize Jacobian matrix
  const numActiveConstraints = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActiveConstraints; j++) {
    jacobian[j] = new Array(3 * n).fill(0)
  }

  // ∂g/∂Xi loop: changing X_i affects only the x-component via Chen terms
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - degree)
    const lessThan = Math.min(numSpans, i + 1)
    if (lessThan <= start) continue

    // dD1 = N'i·w - Ni·wu (partial of D1x w.r.t. Xi)
    const dD1 = precomputed.dBasisFunctions_du[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wu, start, lessThan))
    const dD2 = precomputed.d2BasisFunctions_du2[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wuu, start, lessThan))
    const dD3 = precomputed.d3BasisFunctions_du3[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wuuu, start, lessThan))
    const dD21 = precomputed.d2BasisFunctions_du2[i].multiplyRange(d.wu, start, lessThan)
      .subtract(precomputed.dBasisFunctions_du[i].multiplyRange(d.wuu, start, lessThan))

    // ∂(D1xD3)/∂Xi = dD1·D3y - dD3·D1y (only x component changes)
    const dD1xD3_sub = dD1.multiply(ct.D3y.subset(start, lessThan))
      .subtract(dD3.multiply(ct.D1y.subset(start, lessThan)))
    const dD1xD21_sub = dD1.multiply(ct.D21y.subset(start, lessThan))
      .subtract(dD21.multiply(ct.D1y.subset(start, lessThan)))
    const dD1xD2_sub = dD1.multiply(ct.D2y.subset(start, lessThan))
      .subtract(dD2.multiply(ct.D1y.subset(start, lessThan)))
    const dD1dotD1_sub = dD1.multiply(ct.D1x.subset(start, lessThan)).multiplyByScalar(2)
    const dD1dotD2_sub = dD1.multiply(ct.D2x.subset(start, lessThan))
      .add(dD2.multiply(ct.D1x.subset(start, lessThan)))

    const D1dotD1_sub = D1dotD1.subset(start, lessThan)
    const D1xD3_sub = D1xD3.subset(start, lessThan)
    const D1xD21_sub = D1xD21.subset(start, lessThan)
    const D1xD2_sub = D1xD2.subset(start, lessThan)
    const D1dotD2_sub = D1dotD2.subset(start, lessThan)
    const w_sub = d.w.subset(start, lessThan)
    const wu_sub = d.wu.subset(start, lessThan)

    // t1 = (dD1xD3·D1dotD1 + dD1dotD1·D1xD3) * w
    const t1 = dD1xD3_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD3_sub)).multiply(w_sub)
    // t2 = (dD1xD21·D1dotD1 + dD1dotD1·D1xD21) * w
    const t2 = dD1xD21_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD21_sub)).multiply(w_sub)
    // t3 = (dD1xD2·D1dotD1 + dD1dotD1·D1xD2) * wu * 2
    const t3 = dD1xD2_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD2_sub)).multiply(wu_sub).multiplyByScalar(2)
    // t4 = -(dD1xD2·D1dotD2 + dD1dotD2·D1xD2) * w * 3
    const t4 = dD1xD2_sub.multiply(D1dotD2_sub).add(dD1dotD2_sub.multiply(D1xD2_sub)).multiply(w_sub).multiplyByScalar(-3)

    const dgdxi = t1.add(t2).add(t3).add(t4)
    const dgdxiCPs = dgdxi.flattenControlPoints()

    const localStart = start * cpsPerSpan
    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart
      if (localJ >= 0 && localJ < dgdxiCPs.length) {
        jacobian[aj][i] = dgdxiCPs[localJ]
      }
    }
  }

  // ∂g/∂Yi loop: same structure but with Y-component (flipped signs in determinants)
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - degree)
    const lessThan = Math.min(numSpans, i + 1)
    if (lessThan <= start) continue

    const dD1 = precomputed.dBasisFunctions_du[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wu, start, lessThan))
    const dD2 = precomputed.d2BasisFunctions_du2[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wuu, start, lessThan))
    const dD3 = precomputed.d3BasisFunctions_du3[i].multiplyRange(d.w, start, lessThan)
      .subtract(precomputed.basisFunctions[i].multiplyRange(d.wuuu, start, lessThan))
    const dD21 = precomputed.d2BasisFunctions_du2[i].multiplyRange(d.wu, start, lessThan)
      .subtract(precomputed.dBasisFunctions_du[i].multiplyRange(d.wuu, start, lessThan))

    // For Yi: dD1xD3 = dD3·D1x - dD1·D3x (y changes, flipped from x)
    const dD1xD3_sub = dD3.multiply(ct.D1x.subset(start, lessThan))
      .subtract(dD1.multiply(ct.D3x.subset(start, lessThan)))
    const dD1xD21_sub = dD21.multiply(ct.D1x.subset(start, lessThan))
      .subtract(dD1.multiply(ct.D21x.subset(start, lessThan)))
    const dD1xD2_sub = dD2.multiply(ct.D1x.subset(start, lessThan))
      .subtract(dD1.multiply(ct.D2x.subset(start, lessThan)))
    const dD1dotD1_sub = dD1.multiply(ct.D1y.subset(start, lessThan)).multiplyByScalar(2)
    const dD1dotD2_sub = dD1.multiply(ct.D2y.subset(start, lessThan))
      .add(dD2.multiply(ct.D1y.subset(start, lessThan)))

    const D1dotD1_sub = D1dotD1.subset(start, lessThan)
    const D1xD3_sub = D1xD3.subset(start, lessThan)
    const D1xD21_sub = D1xD21.subset(start, lessThan)
    const D1xD2_sub = D1xD2.subset(start, lessThan)
    const D1dotD2_sub = D1dotD2.subset(start, lessThan)
    const w_sub = d.w.subset(start, lessThan)
    const wu_sub = d.wu.subset(start, lessThan)

    const t1 = dD1xD3_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD3_sub)).multiply(w_sub)
    const t2 = dD1xD21_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD21_sub)).multiply(w_sub)
    const t3 = dD1xD2_sub.multiply(D1dotD1_sub).add(dD1dotD1_sub.multiply(D1xD2_sub)).multiply(wu_sub).multiplyByScalar(2)
    const t4 = dD1xD2_sub.multiply(D1dotD2_sub).add(dD1dotD2_sub.multiply(D1xD2_sub)).multiply(w_sub).multiplyByScalar(-3)

    const dgdyi = t1.add(t2).add(t3).add(t4)
    const dgdyiCPs = dgdyi.flattenControlPoints()

    const localStart = start * cpsPerSpan
    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart
      if (localJ >= 0 && localJ < dgdyiCPs.length) {
        jacobian[aj][n + i] = dgdyiCPs[localJ]
      }
    }
  }

  // ∂g/∂Wi loop: weight partials affect all Chen terms differently
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - degree)
    const lessThan = Math.min(numSpans, i + 1)
    if (lessThan <= start) continue

    // For Wi: dD1x = Ni·xu - N'i·x (sign flip from x/y loops!)
    const dD1x = precomputed.basisFunctions[i].multiplyRange(d.xu, start, lessThan)
      .subtract(precomputed.dBasisFunctions_du[i].multiplyRange(d.x, start, lessThan))
    const dD1y = precomputed.basisFunctions[i].multiplyRange(d.yu, start, lessThan)
      .subtract(precomputed.dBasisFunctions_du[i].multiplyRange(d.y, start, lessThan))
    const dD2x = precomputed.basisFunctions[i].multiplyRange(d.xuu, start, lessThan)
      .subtract(precomputed.d2BasisFunctions_du2[i].multiplyRange(d.x, start, lessThan))
    const dD2y = precomputed.basisFunctions[i].multiplyRange(d.yuu, start, lessThan)
      .subtract(precomputed.d2BasisFunctions_du2[i].multiplyRange(d.y, start, lessThan))
    const dD3x = precomputed.basisFunctions[i].multiplyRange(d.xuuu, start, lessThan)
      .subtract(precomputed.d3BasisFunctions_du3[i].multiplyRange(d.x, start, lessThan))
    const dD3y = precomputed.basisFunctions[i].multiplyRange(d.yuuu, start, lessThan)
      .subtract(precomputed.d3BasisFunctions_du3[i].multiplyRange(d.y, start, lessThan))
    const dD21x = precomputed.dBasisFunctions_du[i].multiplyRange(d.xuu, start, lessThan)
      .subtract(precomputed.d2BasisFunctions_du2[i].multiplyRange(d.xu, start, lessThan))
    const dD21y = precomputed.dBasisFunctions_du[i].multiplyRange(d.yuu, start, lessThan)
      .subtract(precomputed.d2BasisFunctions_du2[i].multiplyRange(d.yu, start, lessThan))

    // Both D1x and D1y change → full chain rule for determinants
    const D1x_sub = ct.D1x.subset(start, lessThan)
    const D1y_sub = ct.D1y.subset(start, lessThan)
    const D3x_sub = ct.D3x.subset(start, lessThan)
    const D3y_sub = ct.D3y.subset(start, lessThan)
    const D21x_sub = ct.D21x.subset(start, lessThan)
    const D21y_sub = ct.D21y.subset(start, lessThan)
    const D2x_sub = ct.D2x.subset(start, lessThan)
    const D2y_sub = ct.D2y.subset(start, lessThan)

    const dD1xD3_sub = dD1x.multiply(D3y_sub).subtract(dD1y.multiply(D3x_sub))
      .add(dD3y.multiply(D1x_sub).subtract(dD3x.multiply(D1y_sub)))
    const dD1xD21_sub = dD1x.multiply(D21y_sub).subtract(dD1y.multiply(D21x_sub))
      .add(dD21y.multiply(D1x_sub).subtract(dD21x.multiply(D1y_sub)))
    const dD1xD2_sub = dD1x.multiply(D2y_sub).subtract(dD1y.multiply(D2x_sub))
      .add(dD2y.multiply(D1x_sub).subtract(dD2x.multiply(D1y_sub)))
    const dD1dotD1_sub = dD1x.multiply(D1x_sub).add(dD1y.multiply(D1y_sub)).multiplyByScalar(2)
    const dD1dotD2_sub = dD1x.multiply(D2x_sub).add(dD2x.multiply(D1x_sub))
      .add(dD1y.multiply(D2y_sub).add(dD2y.multiply(D1y_sub)))

    const D1dotD1_sub = D1dotD1.subset(start, lessThan)
    const D1xD3_sub = D1xD3.subset(start, lessThan)
    const D1xD21_sub = D1xD21.subset(start, lessThan)
    const D1xD2_sub = D1xD2.subset(start, lessThan)
    const D1dotD2_sub = D1dotD2.subset(start, lessThan)
    const w_sub = d.w.subset(start, lessThan)
    const wu_sub = d.wu.subset(start, lessThan)

    // Extra terms from w appearing directly in g: Ni for w, N'i for wu
    const Ni = precomputed.basisFunctions[i].subset(start, lessThan)
    const Ni_u = precomputed.dBasisFunctions_du[i].subset(start, lessThan)

    // t1 = dD1xD3·D1dotD1·w + dD1dotD1·D1xD3·w + Ni·D1xD3·D1dotD1  (∂/∂wi of (D1xD3)*D1dotD1*w)
    const t1a = dD1xD3_sub.multiply(D1dotD1_sub).multiply(w_sub)
    const t1b = dD1dotD1_sub.multiply(D1xD3_sub).multiply(w_sub)
    const t1c = Ni.multiply(D1xD3_sub).multiply(D1dotD1_sub)
    const t1 = t1a.add(t1b).add(t1c)

    // t2 = same structure for D1xD21
    const t2a = dD1xD21_sub.multiply(D1dotD1_sub).multiply(w_sub)
    const t2b = dD1dotD1_sub.multiply(D1xD21_sub).multiply(w_sub)
    const t2c = Ni.multiply(D1xD21_sub).multiply(D1dotD1_sub)
    const t2 = t2a.add(t2b).add(t2c)

    // t3 = (dD1xD2·D1dotD1 + dD1dotD1·D1xD2)·wu + N'i·D1xD2·D1dotD1  * 2
    const t3a = dD1xD2_sub.multiply(D1dotD1_sub).multiply(wu_sub)
    const t3b = dD1dotD1_sub.multiply(D1xD2_sub).multiply(wu_sub)
    const t3c = Ni_u.multiply(D1xD2_sub).multiply(D1dotD1_sub)
    const t3 = t3a.add(t3b).add(t3c).multiplyByScalar(2)

    // t4 = -(dD1xD2·D1dotD2 + dD1dotD2·D1xD2)·w + Ni·D1xD2·D1dotD2  * -3
    const t4a = dD1xD2_sub.multiply(D1dotD2_sub).multiply(w_sub)
    const t4b = dD1dotD2_sub.multiply(D1xD2_sub).multiply(w_sub)
    const t4c = Ni.multiply(D1xD2_sub).multiply(D1dotD2_sub)
    const t4 = t4a.add(t4b).add(t4c).multiplyByScalar(-3)

    const dgdwi = t1.add(t2).add(t3).add(t4)
    const dgdwiCPs = dgdwi.flattenControlPoints()

    const localStart = start * cpsPerSpan
    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart
      if (localJ >= 0 && localJ < dgdwiCPs.length) {
        jacobian[aj][2 * n + i] = dgdwiCPs[localJ]
      }
    }
  }

  return jacobian
}

// ============================================================================
// Periodic Rational Jacobian
// ============================================================================

/**
 * Precomputed data for periodic rational curve Jacobian computation.
 */
export interface PrecomputedPeriodicRationalBasisDerivatives {
  basisFunctions: BernsteinDecomposition[]
  dBasisFunctions_du: BernsteinDecomposition[]
  d2BasisFunctions_du2: BernsteinDecomposition[]
  d3BasisFunctions_du3: BernsteinDecomposition[]
  support: [number, number][]
  degree: number
  numControlPoints: number
  numSpans: number
  knots: readonly number[]
  period: number
}

// Cache for precomputed periodic rational basis derivatives
const periodicRationalBasisDerivativesCache = new Map<string, PrecomputedPeriodicRationalBasisDerivatives>()

/**
 * Precompute basis function derivatives for periodic rational curves.
 * Includes zeroth-order basis functions needed for weight partials.
 */
export function precomputePeriodicRationalBasisDerivatives(
  degree: number,
  knots: readonly number[],
  period: number = 1.0
): PrecomputedPeriodicRationalBasisDerivatives {
  const cacheKey = `rat-${basisDerivativesCacheKey(degree, knots, period)}`
  const cached = periodicRationalBasisDerivativesCache.get(cacheKey)
  if (cached) return cached

  const n = knots.length
  const distinctKnots = new Set<number>()
  for (const k of knots) distinctKnots.add(k)
  const numSpans = distinctKnots.size

  const basisFunctions: BernsteinDecomposition[] = []
  const dBasisFunctions_du: BernsteinDecomposition[] = []
  const d2BasisFunctions_du2: BernsteinDecomposition[] = []
  const d3BasisFunctions_du3: BernsteinDecomposition[] = []
  const support: [number, number][] = []

  for (let i = 0; i < n; i++) {
    const biBD = singleBasisPeriodic(degree, knots, period, i)
    const bi_u = derivativeBD(biBD)
    const bi_uu = derivativeBD(bi_u)
    const bi_uuu = derivativeBD(bi_uu)

    basisFunctions.push(biBD)
    dBasisFunctions_du.push(bi_u)
    d2BasisFunctions_du2.push(bi_uu)
    d3BasisFunctions_du3.push(bi_uuu)
    support.push([0, numSpans])
  }

  const result: PrecomputedPeriodicRationalBasisDerivatives = {
    basisFunctions,
    dBasisFunctions_du,
    d2BasisFunctions_du2,
    d3BasisFunctions_du3,
    support,
    degree,
    numControlPoints: n,
    numSpans,
    knots,
    period,
  }

  periodicRationalBasisDerivativesCache.set(cacheKey, result)
  return result
}

/**
 * Compute rational curve state from cached basis derivatives using linear combination.
 */
function computePeriodicRationalCurveStateFromCache(
  precomputed: PrecomputedPeriodicRationalBasisDerivatives,
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): { derivatives: RationalDerivatives; chenTerms: ChenTerms } {
  const n = precomputed.numControlPoints
  const numSpans = precomputed.numSpans

  const zeroBD = precomputed.basisFunctions[0]
  const firstBD = precomputed.dBasisFunctions_du[0]
  const secondBD = precomputed.d2BasisFunctions_du2[0]
  const thirdBD = precomputed.d3BasisFunctions_du3[0]

  const degree0 = zeroBD.degree
  const degree1 = firstBD.degree
  const degree2 = secondBD.degree
  const degree3 = thirdBD.degree

  // Initialize arrays for all 12 linear combinations
  const init = (deg: number) => {
    const spans: number[][] = []
    for (let s = 0; s < numSpans; s++) spans.push(new Array(deg + 1).fill(0))
    return spans
  }

  const xSpans = init(degree0), ySpans = init(degree0), wSpans = init(degree0)
  const xuSpans = init(degree1), yuSpans = init(degree1), wuSpans = init(degree1)
  const xuuSpans = init(degree2), yuuSpans = init(degree2), wuuSpans = init(degree2)
  const xuuuSpans = init(degree3), yuuuSpans = init(degree3), wuuuSpans = init(degree3)

  for (let i = 0; i < n; i++) {
    const xi = cpsX[i], yi = cpsY[i], wi = cpsW[i]

    for (let s = 0; s < numSpans; s++) {
      const b0 = precomputed.basisFunctions[i].controlPointsArray[s]
      const b1 = precomputed.dBasisFunctions_du[i].controlPointsArray[s]
      const b2 = precomputed.d2BasisFunctions_du2[i].controlPointsArray[s]
      const b3 = precomputed.d3BasisFunctions_du3[i].controlPointsArray[s]

      for (let c = 0; c <= degree0; c++) {
        xSpans[s][c] += xi * b0[c]; ySpans[s][c] += yi * b0[c]; wSpans[s][c] += wi * b0[c]
      }
      for (let c = 0; c <= degree1; c++) {
        xuSpans[s][c] += xi * b1[c]; yuSpans[s][c] += yi * b1[c]; wuSpans[s][c] += wi * b1[c]
      }
      for (let c = 0; c <= degree2; c++) {
        xuuSpans[s][c] += xi * b2[c]; yuuSpans[s][c] += yi * b2[c]; wuuSpans[s][c] += wi * b2[c]
      }
      for (let c = 0; c <= degree3; c++) {
        xuuuSpans[s][c] += xi * b3[c]; yuuuSpans[s][c] += yi * b3[c]; wuuuSpans[s][c] += wi * b3[c]
      }
    }
  }

  const mk = (spans: number[][], ref: BernsteinDecomposition) =>
    new BernsteinDecomposition(spans, ref.distinctKnots)

  const derivatives: RationalDerivatives = {
    x: mk(xSpans, zeroBD), y: mk(ySpans, zeroBD), w: mk(wSpans, zeroBD),
    xu: mk(xuSpans, firstBD), yu: mk(yuSpans, firstBD), wu: mk(wuSpans, firstBD),
    xuu: mk(xuuSpans, secondBD), yuu: mk(yuuSpans, secondBD), wuu: mk(wuuSpans, secondBD),
    xuuu: mk(xuuuSpans, thirdBD), yuuu: mk(yuuuSpans, thirdBD), wuuu: mk(wuuuSpans, thirdBD),
  }

  const chenTerms = computeChenTermsFromDerivatives(derivatives)
  return { derivatives, chenTerms }
}

/**
 * Compute constraint CPs for periodic rational curves using cached basis derivatives.
 */
export function computePeriodicRationalConstraintCPsFromCache(
  precomputed: PrecomputedPeriodicRationalBasisDerivatives,
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): number[] {
  const { chenTerms } = computePeriodicRationalCurveStateFromCache(precomputed, cpsX, cpsY, cpsW)
  return computeRationalGFromChenTerms(chenTerms).flattenControlPoints()
}

/**
 * Compute explicit Jacobian for periodic rational curves.
 */
export function computePeriodicRationalExplicitJacobian(
  precomputed: PrecomputedPeriodicRationalBasisDerivatives,
  cpsX: number[],
  cpsY: number[],
  cpsW: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints
  const { derivatives: d, chenTerms: ct } = computePeriodicRationalCurveStateFromCache(precomputed, cpsX, cpsY, cpsW)

  const D1dotD1 = ct.D1x.multiply(ct.D1x).add(ct.D1y.multiply(ct.D1y))
  const D1xD3 = ct.D1x.multiply(ct.D3y).subtract(ct.D1y.multiply(ct.D3x))
  const D1xD21 = ct.D1x.multiply(ct.D21y).subtract(ct.D1y.multiply(ct.D21x))
  const D1xD2 = ct.D1x.multiply(ct.D2y).subtract(ct.D1y.multiply(ct.D2x))
  const D1dotD2 = ct.D1x.multiply(ct.D2x).add(ct.D1y.multiply(ct.D2y))

  const g = computeRationalGFromChenTerms(ct)
  const gDegree = g.degree
  const cpsPerSpan = gDegree + 1

  const numActiveConstraints = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActiveConstraints; j++) {
    jacobian[j] = new Array(3 * n).fill(0)
  }

  // Helper to compute dgdxi/dgdyi/dgdwi and store into jacobian column
  const storeJacobian = (i: number, colOffset: number, dgCPs: number[], start: number) => {
    const localStart = start * cpsPerSpan
    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart
      if (localJ >= 0 && localJ < dgCPs.length) {
        jacobian[aj][colOffset + i] = dgCPs[localJ]
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const [start, end] = precomputed.support[i]

    // Shared subsets
    const D1dotD1_sub = D1dotD1.subset(start, end)
    const D1xD3_sub = D1xD3.subset(start, end)
    const D1xD21_sub = D1xD21.subset(start, end)
    const D1xD2_sub = D1xD2.subset(start, end)
    const D1dotD2_sub = D1dotD2.subset(start, end)
    const w_sub = d.w.subset(start, end)
    const wu_sub = d.wu.subset(start, end)

    // --- ∂g/∂Xi ---
    {
      const dD1 = precomputed.dBasisFunctions_du[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wu.subset(start, end)))
      const dD2 = precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wuu.subset(start, end)))
      const dD3 = precomputed.d3BasisFunctions_du3[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wuuu.subset(start, end)))
      const dD21 = precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.wu.subset(start, end))
        .subtract(precomputed.dBasisFunctions_du[i].subset(start, end).multiply(d.wuu.subset(start, end)))

      const dD1xD3 = dD1.multiply(ct.D3y.subset(start, end)).subtract(dD3.multiply(ct.D1y.subset(start, end)))
      const dD1xD21 = dD1.multiply(ct.D21y.subset(start, end)).subtract(dD21.multiply(ct.D1y.subset(start, end)))
      const dD1xD2 = dD1.multiply(ct.D2y.subset(start, end)).subtract(dD2.multiply(ct.D1y.subset(start, end)))
      const dD1dotD1 = dD1.multiply(ct.D1x.subset(start, end)).multiplyByScalar(2)
      const dD1dotD2 = dD1.multiply(ct.D2x.subset(start, end)).add(dD2.multiply(ct.D1x.subset(start, end)))

      const t1 = dD1xD3.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD3_sub)).multiply(w_sub)
      const t2 = dD1xD21.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD21_sub)).multiply(w_sub)
      const t3 = dD1xD2.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD2_sub)).multiply(wu_sub).multiplyByScalar(2)
      const t4 = dD1xD2.multiply(D1dotD2_sub).add(dD1dotD2.multiply(D1xD2_sub)).multiply(w_sub).multiplyByScalar(-3)

      storeJacobian(i, 0, t1.add(t2).add(t3).add(t4).flattenControlPoints(), start)
    }

    // --- ∂g/∂Yi ---
    {
      const dD1 = precomputed.dBasisFunctions_du[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wu.subset(start, end)))
      const dD2 = precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wuu.subset(start, end)))
      const dD3 = precomputed.d3BasisFunctions_du3[i].subset(start, end).multiply(d.w.subset(start, end))
        .subtract(precomputed.basisFunctions[i].subset(start, end).multiply(d.wuuu.subset(start, end)))
      const dD21 = precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.wu.subset(start, end))
        .subtract(precomputed.dBasisFunctions_du[i].subset(start, end).multiply(d.wuu.subset(start, end)))

      const dD1xD3 = dD3.multiply(ct.D1x.subset(start, end)).subtract(dD1.multiply(ct.D3x.subset(start, end)))
      const dD1xD21 = dD21.multiply(ct.D1x.subset(start, end)).subtract(dD1.multiply(ct.D21x.subset(start, end)))
      const dD1xD2 = dD2.multiply(ct.D1x.subset(start, end)).subtract(dD1.multiply(ct.D2x.subset(start, end)))
      const dD1dotD1 = dD1.multiply(ct.D1y.subset(start, end)).multiplyByScalar(2)
      const dD1dotD2 = dD1.multiply(ct.D2y.subset(start, end)).add(dD2.multiply(ct.D1y.subset(start, end)))

      const t1 = dD1xD3.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD3_sub)).multiply(w_sub)
      const t2 = dD1xD21.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD21_sub)).multiply(w_sub)
      const t3 = dD1xD2.multiply(D1dotD1_sub).add(dD1dotD1.multiply(D1xD2_sub)).multiply(wu_sub).multiplyByScalar(2)
      const t4 = dD1xD2.multiply(D1dotD2_sub).add(dD1dotD2.multiply(D1xD2_sub)).multiply(w_sub).multiplyByScalar(-3)

      storeJacobian(i, n, t1.add(t2).add(t3).add(t4).flattenControlPoints(), start)
    }

    // --- ∂g/∂Wi ---
    {
      const Ni = precomputed.basisFunctions[i].subset(start, end)
      const Ni_u = precomputed.dBasisFunctions_du[i].subset(start, end)

      const dD1x = Ni.multiply(d.xu.subset(start, end)).subtract(Ni_u.multiply(d.x.subset(start, end)))
      const dD1y = Ni.multiply(d.yu.subset(start, end)).subtract(Ni_u.multiply(d.y.subset(start, end)))
      const dD2x = Ni.multiply(d.xuu.subset(start, end))
        .subtract(precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.x.subset(start, end)))
      const dD2y = Ni.multiply(d.yuu.subset(start, end))
        .subtract(precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.y.subset(start, end)))
      const dD3x = Ni.multiply(d.xuuu.subset(start, end))
        .subtract(precomputed.d3BasisFunctions_du3[i].subset(start, end).multiply(d.x.subset(start, end)))
      const dD3y = Ni.multiply(d.yuuu.subset(start, end))
        .subtract(precomputed.d3BasisFunctions_du3[i].subset(start, end).multiply(d.y.subset(start, end)))
      const dD21x = Ni_u.multiply(d.xuu.subset(start, end))
        .subtract(precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.xu.subset(start, end)))
      const dD21y = Ni_u.multiply(d.yuu.subset(start, end))
        .subtract(precomputed.d2BasisFunctions_du2[i].subset(start, end).multiply(d.yu.subset(start, end)))

      const D1x_sub = ct.D1x.subset(start, end)
      const D1y_sub = ct.D1y.subset(start, end)

      const dD1xD3 = dD1x.multiply(ct.D3y.subset(start, end)).subtract(dD1y.multiply(ct.D3x.subset(start, end)))
        .add(dD3y.multiply(D1x_sub).subtract(dD3x.multiply(D1y_sub)))
      const dD1xD21 = dD1x.multiply(ct.D21y.subset(start, end)).subtract(dD1y.multiply(ct.D21x.subset(start, end)))
        .add(dD21y.multiply(D1x_sub).subtract(dD21x.multiply(D1y_sub)))
      const dD1xD2 = dD1x.multiply(ct.D2y.subset(start, end)).subtract(dD1y.multiply(ct.D2x.subset(start, end)))
        .add(dD2y.multiply(D1x_sub).subtract(dD2x.multiply(D1y_sub)))
      const dD1dotD1 = dD1x.multiply(D1x_sub).add(dD1y.multiply(D1y_sub)).multiplyByScalar(2)
      const dD1dotD2 = dD1x.multiply(ct.D2x.subset(start, end)).add(dD2x.multiply(D1x_sub))
        .add(dD1y.multiply(ct.D2y.subset(start, end)).add(dD2y.multiply(D1y_sub)))

      const t1a = dD1xD3.multiply(D1dotD1_sub).multiply(w_sub)
      const t1b = dD1dotD1.multiply(D1xD3_sub).multiply(w_sub)
      const t1c = Ni.multiply(D1xD3_sub).multiply(D1dotD1_sub)
      const t2a = dD1xD21.multiply(D1dotD1_sub).multiply(w_sub)
      const t2b = dD1dotD1.multiply(D1xD21_sub).multiply(w_sub)
      const t2c = Ni.multiply(D1xD21_sub).multiply(D1dotD1_sub)
      const t3a = dD1xD2.multiply(D1dotD1_sub).multiply(wu_sub)
      const t3b = dD1dotD1.multiply(D1xD2_sub).multiply(wu_sub)
      const t3c = Ni_u.multiply(D1xD2_sub).multiply(D1dotD1_sub)
      const t4a = dD1xD2.multiply(D1dotD2_sub).multiply(w_sub)
      const t4b = dD1dotD2.multiply(D1xD2_sub).multiply(w_sub)
      const t4c = Ni.multiply(D1xD2_sub).multiply(D1dotD2_sub)

      const dgdwi = t1a.add(t1b).add(t1c)
        .add(t2a.add(t2b).add(t2c))
        .add(t3a.add(t3b).add(t3c).multiplyByScalar(2))
        .add(t4a.add(t4b).add(t4c).multiplyByScalar(-3))

      storeJacobian(i, 2 * n, dgdwi.flattenControlPoints(), start)
    }
  }

  return jacobian
}
