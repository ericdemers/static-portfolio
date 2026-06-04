// Being migrated to core/ incrementally; remove this once a file is on core.
// Farin point computation and weight manipulation for rational B-splines
// Farin points provide a geometric interface for controlling curve weights
//
// For CLOSED curves, Farin positions are the primary data (stored in farinTValues/farinPositions).
// Weights are computed on demand from these positions using the formula from static-portfolio:
//   w_i = w_{i-1} * (q_{i-1} - z_{i-1}) / (z_i - q_{i-1})
// or equivalently for t-values:
//   w_i = w_{i-1} * t_{i-1} / (1 - t_{i-1})
//
// This allows each Farin point to be moved independently.

import type { Point2D, WeightedPoint2D, ComplexPoint, RationalBSplineCurve, ComplexRationalBSplineCurve } from '../types/curve'
import { cadd, csub, cmult, cdiv, cnorm, type Complex } from './complex'

/**
 * Compute weights from Farin t-values for a closed rational curve.
 * Formula: w_i = w_{i-1} * t_{i-1} / (1 - t_{i-1})
 *
 * For closed curves, also computes the "wrap weight" using t_{n-1}.
 * This is the weight for control point 0 when accessed via wrapping.
 *
 * @param controlPoints - Control point positions (x, y only, weights will be computed)
 * @param farinTValues - Array of t-values, one per edge (n values for n control points)
 * @returns Object with points (WeightedPoint2D[]) and wrapWeight (number)
 */
export function computeWeightsFromFarinTValues(
  controlPoints: Point2D[],
  farinTValues: number[]
): { points: WeightedPoint2D[]; wrapWeight: number } {
  const n = controlPoints.length
  const result: WeightedPoint2D[] = []

  // Start with w_0 = 1
  result.push({ x: controlPoints[0].x, y: controlPoints[0].y, w: 1 })

  // Compute w_1 through w_{n-1} using t_0 through t_{n-2}
  for (let i = 1; i < n; i++) {
    const t = farinTValues[i - 1]
    const prevW = result[i - 1].w
    const w = prevW * t / (1 - t)
    result.push({ x: controlPoints[i].x, y: controlPoints[i].y, w })
  }

  // Compute wrap weight using t_{n-1} (the Farin between control points n-1 and 0)
  // wrapWeight = w_{n-1} * t_{n-1} / (1 - t_{n-1})
  const tLast = farinTValues[n - 1]
  const wrapWeight = result[n - 1].w * tLast / (1 - tLast)

  return { points: result, wrapWeight }
}

/**
 * Compute complex weights from Farin positions for a closed complex-rational curve.
 * Formula: w_i = w_{i-1} * (q_{i-1} - z_{i-1}) / (z_i - q_{i-1})
 *
 * For closed curves, also computes the "wrap weight" using the last Farin position.
 *
 * @param controlPoints - Control point positions (re, im only, weights will be computed)
 * @param farinPositions - Array of Farin point positions (n positions for n control points)
 * @returns Object with points (ComplexPoint[]) and wrapWeight (Complex)
 */
export function computeComplexWeightsFromFarinPositions(
  controlPoints: { re: number; im: number }[],
  farinPositions: Point2D[]
): { points: ComplexPoint[]; wrapWeight: { re: number; im: number } } {
  const n = controlPoints.length
  const result: ComplexPoint[] = []

  // Start with w_0 = 1 + 0i
  result.push({
    re: controlPoints[0].re,
    im: controlPoints[0].im,
    w_re: 1,
    w_im: 0
  })

  // Compute w_1 through w_{n-1}
  for (let i = 1; i < n; i++) {
    const q = farinPositions[i - 1] // Farin point between z_{i-1} and z_i
    const z0 = controlPoints[i - 1]
    const z1 = controlPoints[i]
    const prevW: Complex = { re: result[i - 1].w_re, im: result[i - 1].w_im }

    // w_i = w_{i-1} * (q - z_{i-1}) / (z_i - q)
    const qComplex: Complex = { re: q.x, im: q.y }
    const z0Complex: Complex = { re: z0.re, im: z0.im }
    const z1Complex: Complex = { re: z1.re, im: z1.im }

    const num = csub(qComplex, z0Complex)
    const denom = csub(z1Complex, qComplex)

    let w: Complex
    if (cnorm(denom) < 1e-10) {
      w = prevW // Degenerate case, keep previous weight
    } else {
      w = cmult(prevW, cdiv(num, denom))
    }

    result.push({
      re: controlPoints[i].re,
      im: controlPoints[i].im,
      w_re: w.re,
      w_im: w.im
    })
  }

  // Compute wrap weight using the last Farin position (between control points n-1 and 0)
  const qLast = farinPositions[n - 1]
  const zLast = controlPoints[n - 1]
  const zFirst = controlPoints[0]
  const wLast: Complex = { re: result[n - 1].w_re, im: result[n - 1].w_im }

  const qLastComplex: Complex = { re: qLast.x, im: qLast.y }
  const zLastComplex: Complex = { re: zLast.re, im: zLast.im }
  const zFirstComplex: Complex = { re: zFirst.re, im: zFirst.im }

  const numWrap = csub(qLastComplex, zLastComplex)
  const denomWrap = csub(zFirstComplex, qLastComplex)

  let wrapWeight: { re: number; im: number }
  if (cnorm(denomWrap) < 1e-10) {
    wrapWeight = { re: wLast.re, im: wLast.im }
  } else {
    const w = cmult(wLast, cdiv(numWrap, denomWrap))
    wrapWeight = { re: w.re, im: w.im }
  }

  return { points: result, wrapWeight }
}

/**
 * Initialize Farin t-values from current weights of a rational curve.
 * Use this when converting an existing curve to the Farin-primary representation.
 */
export function initializeFarinTValuesFromWeights(
  controlPoints: WeightedPoint2D[],
  closed: boolean
): number[] {
  const n = controlPoints.length
  const numEdges = closed ? n : n - 1
  const tValues: number[] = []

  for (let i = 0; i < numEdges; i++) {
    const w0 = controlPoints[i].w
    const w1 = controlPoints[(i + 1) % n].w
    tValues.push(w1 / (w0 + w1))
  }

  return tValues
}

/**
 * Initialize Farin positions from current weights of a complex-rational curve.
 */
export function initializeFarinPositionsFromComplexWeights(
  controlPoints: ComplexPoint[],
  closed: boolean
): Point2D[] {
  const n = controlPoints.length
  const numEdges = closed ? n : n - 1
  const positions: Point2D[] = []

  for (let i = 0; i < numEdges; i++) {
    const cp0 = controlPoints[i]
    const cp1 = controlPoints[(i + 1) % n]

    const z0: Complex = { re: cp0.re, im: cp0.im }
    const z1: Complex = { re: cp1.re, im: cp1.im }
    const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
    const w1: Complex = { re: cp1.w_re, im: cp1.w_im }

    // q = (w0 * z0 + w1 * z1) / (w0 + w1)
    const c0 = cmult(w0, z0)
    const c1 = cmult(w1, z1)
    const num = cadd(c0, c1)
    const denom = cadd(w0, w1)
    const q = cdiv(num, denom)

    positions.push({ x: q.re, y: q.im })
  }

  return positions
}

// Farin point for rational B-splines (constrained to control polygon edge)
export interface RationalFarinPoint {
  index: number           // Index of the Farin point (between control points i and i+1)
  position: Point2D       // Current position on the edge
  t: number               // Parameter along the edge [0, 1], where 0 = at control point i, 1 = at control point i+1
  edgeStart: Point2D      // Control point i
  edgeEnd: Point2D        // Control point i+1
}

// Farin point for complex-rational B-splines (free 2D movement)
export interface ComplexFarinPoint {
  index: number           // Index of the Farin point
  position: Point2D       // Current position (free in 2D)
  controlPointBefore: Point2D  // Control point before this Farin point
  controlPointAfter: Point2D   // Control point after this Farin point
}

// Compute Farin points for a rational B-spline curve
// For degree-n curves, there are (n-1) Farin points per span
// For simplicity, we compute one Farin point per edge (between consecutive control points)
export function computeRationalFarinPoints(curve: RationalBSplineCurve): RationalFarinPoint[] {
  const { controlPoints } = curve
  const n = controlPoints.length
  if (n < 2) return []

  const farinPoints: RationalFarinPoint[] = []
  const numEdges = curve.closed ? n : n - 1

  // For closed curves with farinTValues, use those directly as the source of truth
  const useFarinTValues = curve.closed && curve.farinTValues && curve.farinTValues.length === numEdges

  for (let i = 0; i < numEdges; i++) {
    const p0 = controlPoints[i]
    const p1 = controlPoints[(i + 1) % n]

    let t: number
    if (useFarinTValues) {
      // Use stored Farin t-value directly
      t = curve.farinTValues![i]
    } else {
      // Compute from weights
      // Farin point position formula: t = w1 / (w0 + w1)
      const w0 = p0.w
      const w1 = p1.w
      const totalWeight = w0 + w1
      t = totalWeight > 0 ? w1 / totalWeight : 0.5
    }

    const position = {
      x: p0.x + t * (p1.x - p0.x),
      y: p0.y + t * (p1.y - p0.y),
    }

    farinPoints.push({
      index: i,
      position,
      t,
      edgeStart: { x: p0.x, y: p0.y },
      edgeEnd: { x: p1.x, y: p1.y },
    })
  }

  return farinPoints
}

// Compute Farin points for a complex-rational B-spline curve
// These are free to move in 2D and use complex weight ratios
export function computeComplexFarinPoints(curve: ComplexRationalBSplineCurve): ComplexFarinPoint[] {
  const { controlPoints } = curve
  const n = controlPoints.length
  if (n < 2) return []

  const farinPoints: ComplexFarinPoint[] = []
  const numEdges = curve.closed ? n : n - 1

  // For closed curves with farinPositions, use those directly as the source of truth
  const useFarinPositions = curve.closed && curve.farinPositions && curve.farinPositions.length === numEdges

  for (let i = 0; i < numEdges; i++) {
    const cp0 = controlPoints[i]
    const cp1 = controlPoints[(i + 1) % n]

    let position: Point2D
    if (useFarinPositions) {
      // Use stored Farin position directly
      position = curve.farinPositions![i]
    } else {
      // Compute from complex weights
      // q_i = (w_i * z_i + w_{i+1} * z_{i+1}) / (w_i + w_{i+1})
      const z0: Complex = { re: cp0.re, im: cp0.im }
      const z1: Complex = { re: cp1.re, im: cp1.im }
      const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
      // The wrap edge (i = n-1) blends z_{n-1} with z_0 reused ONE LAP
      // around, whose effective weight is wrapWeight = w_0·ρ (ρ = the
      // periodic monodromy), NOT w_0. Using w_0 here puts the last Farin
      // point in the wrong place whenever the curve has a spiral (ρ≠1),
      // e.g. after a control-point drag that holds Farin points fixed.
      const isWrapEdge = curve.closed && i === n - 1
      const w1: Complex =
        isWrapEdge && curve.wrapWeight
          ? { re: curve.wrapWeight.re, im: curve.wrapWeight.im }
          : { re: cp1.w_re, im: cp1.w_im }

      const c0_0 = cmult(w0, z0)
      const c0_1 = cmult(w1, z1)
      const numerator = cadd(c0_0, c0_1)
      const denominator = cadd(w0, w1)
      const q = cdiv(numerator, denominator)
      position = { x: q.re, y: q.im }
    }

    farinPoints.push({
      index: i,
      position,
      controlPointBefore: { x: cp0.re, y: cp0.im },
      controlPointAfter: { x: cp1.re, y: cp1.im },
    })
  }

  return farinPoints
}

/**
 * Update weights when a rational Farin point is moved.
 * For closed curves with farinTValues: updates farinTValues and returns new weights + wrapWeight.
 * For open curves: propagates compensation to keep subsequent Farin points at original positions.
 *
 * @returns Object with newPoints (weights), and for closed curves: newFarinTValues and newWrapWeight
 */
export function updateWeightsFromRationalFarin(
  curve: RationalBSplineCurve,
  farinIndex: number,
  newT: number,
  minDistance: number = 0.01
): { newPoints: WeightedPoint2D[]; newFarinTValues?: number[]; newWrapWeight?: number } {
  const { controlPoints } = curve
  const n = controlPoints.length
  const numEdges = curve.closed ? n : n - 1
  const newPoints = controlPoints.map(p => ({ ...p }))

  // Clamp t to valid range with minimum distance from endpoints
  const clampedT = Math.max(minDistance, Math.min(1 - minDistance, newT))

  if (curve.closed) {
    // For closed curves, farinTValues are the primary data.
    // Each Farin t-value is independent - moving one doesn't affect others.
    //
    // Step 1: Get or initialize farinTValues
    let tValues: number[]
    if (curve.farinTValues && curve.farinTValues.length === numEdges) {
      tValues = [...curve.farinTValues]
    } else {
      // Initialize from current weights
      tValues = []
      for (let i = 0; i < numEdges; i++) {
        const w0 = controlPoints[i].w
        const w1 = controlPoints[(i + 1) % n].w
        tValues.push(w1 / (w0 + w1))
      }
    }

    // Step 2: Update only the moved Farin's t-value
    tValues[farinIndex] = clampedT

    // Step 3: Recompute weights from ALL farinTValues
    // w_0 = 1, w_i = w_{i-1} * t_{i-1} / (1 - t_{i-1})
    newPoints[0].w = 1
    for (let i = 1; i < n; i++) {
      const t = tValues[i - 1]
      newPoints[i].w = newPoints[i - 1].w * t / (1 - t)
    }

    // Step 4: Compute wrap weight using t_{n-1}
    const tLast = tValues[n - 1]
    const newWrapWeight = newPoints[n - 1].w * tLast / (1 - tLast)

    return { newPoints, newFarinTValues: tValues, newWrapWeight }
  } else {
    // For open curves: just update w1, then propagate compensation
    const p0Index = farinIndex
    const p1Index = (farinIndex + 1) % n
    const w0 = newPoints[p0Index].w
    const newW1 = w0 * clampedT / (1 - clampedT)
    newPoints[p1Index].w = newW1

    // Save original Farin point t-values for all points AFTER this one
    const originalTValues: number[] = []
    for (let i = farinIndex + 1; i < numEdges; i++) {
      const idx0 = i
      const idx1 = (i + 1) % n
      const w0Orig = controlPoints[idx0].w
      const w1Orig = controlPoints[idx1].w
      originalTValues.push(w1Orig / (w0Orig + w1Orig))
    }

    // Propagate compensation
    for (let i = farinIndex + 1; i < numEdges; i++) {
      const idx0 = i
      const idx1 = (i + 1) % n
      const originalT = originalTValues[i - farinIndex - 1]
      const wBefore = newPoints[idx0].w

      const wAfter = wBefore * originalT / (1 - originalT)
      newPoints[idx1].w = wAfter
    }
  }

  return { newPoints }
}

/**
 * Update weights when a complex Farin point is moved.
 * For closed curves with farinPositions: updates farinPositions and returns new weights + wrapWeight.
 * For open curves: propagates compensation to keep subsequent Farin points at original positions.
 *
 * @returns Object with newPoints (weights), and for closed curves: newFarinPositions and newWrapWeight
 */
export function updateWeightsFromComplexFarin(
  curve: ComplexRationalBSplineCurve,
  farinIndex: number,
  newPosition: Point2D,
  minDistance: number = 5
): { newPoints: ComplexPoint[]; newFarinPositions?: Point2D[]; newWrapWeight?: { re: number; im: number } } {
  const { controlPoints } = curve
  const n = controlPoints.length
  const numEdges = curve.closed ? n : n - 1
  const newPoints = controlPoints.map(p => ({ ...p }))

  const p0Index = farinIndex
  const p1Index = (farinIndex + 1) % n

  const cp0 = controlPoints[p0Index]
  const cp1 = controlPoints[p1Index]

  // Enforce minimum distance from control points
  const z0: Point2D = { x: cp0.re, y: cp0.im }
  const z1: Point2D = { x: cp1.re, y: cp1.im }

  let q = { ...newPosition }

  const dist0 = Math.sqrt((q.x - z0.x) ** 2 + (q.y - z0.y) ** 2)
  if (dist0 < minDistance) {
    const dx = q.x - z0.x
    const dy = q.y - z0.y
    const scale = dist0 > 0 ? minDistance / dist0 : 1
    q = { x: z0.x + dx * scale, y: z0.y + dy * scale }
  }

  const dist1 = Math.sqrt((q.x - z1.x) ** 2 + (q.y - z1.y) ** 2)
  if (dist1 < minDistance) {
    const dx = q.x - z1.x
    const dy = q.y - z1.y
    const scale = dist1 > 0 ? minDistance / dist1 : 1
    q = { x: z1.x + dx * scale, y: z1.y + dy * scale }
  }

  if (curve.closed) {
    // For closed curves, farinPositions are the primary data.
    // Each Farin position is independent - moving one doesn't affect others.

    // Step 1: Get or initialize farinPositions
    let positions: Point2D[]
    if (curve.farinPositions && curve.farinPositions.length === numEdges) {
      positions = curve.farinPositions.map(p => ({ ...p }))
    } else {
      // Initialize from current weights
      positions = initializeFarinPositionsFromComplexWeights(controlPoints, true)
    }

    // Step 2: Update only the moved Farin's position
    positions[farinIndex] = q

    // Step 3: Recompute weights from ALL farinPositions
    // w_0 = 1 + 0i, w_i = w_{i-1} * (q_{i-1} - z_{i-1}) / (z_i - q_{i-1})
    newPoints[0].w_re = 1
    newPoints[0].w_im = 0

    for (let i = 1; i < n; i++) {
      const farin = positions[i - 1]
      const zPrev = controlPoints[i - 1]
      const zCurr = controlPoints[i]

      const qComplex: Complex = { re: farin.x, im: farin.y }
      const zPrevComplex: Complex = { re: zPrev.re, im: zPrev.im }
      const zCurrComplex: Complex = { re: zCurr.re, im: zCurr.im }
      const wPrev: Complex = { re: newPoints[i - 1].w_re, im: newPoints[i - 1].w_im }

      const num = csub(qComplex, zPrevComplex)
      const denom = csub(zCurrComplex, qComplex)

      let wCurr: Complex
      if (cnorm(denom) < 1e-10) {
        wCurr = wPrev // Degenerate case
      } else {
        wCurr = cmult(wPrev, cdiv(num, denom))
      }

      newPoints[i].w_re = wCurr.re
      newPoints[i].w_im = wCurr.im
    }

    // Step 4: Compute wrap weight using the last Farin position
    const qLast = positions[n - 1]
    const zLast = controlPoints[n - 1]
    const zFirst = controlPoints[0]
    const wLast: Complex = { re: newPoints[n - 1].w_re, im: newPoints[n - 1].w_im }

    const qLastComplex: Complex = { re: qLast.x, im: qLast.y }
    const zLastComplex: Complex = { re: zLast.re, im: zLast.im }
    const zFirstComplex: Complex = { re: zFirst.re, im: zFirst.im }

    const numWrap = csub(qLastComplex, zLastComplex)
    const denomWrap = csub(zFirstComplex, qLastComplex)

    let newWrapWeight: { re: number; im: number }
    if (cnorm(denomWrap) < 1e-10) {
      newWrapWeight = { re: wLast.re, im: wLast.im }
    } else {
      const w = cmult(wLast, cdiv(numWrap, denomWrap))
      newWrapWeight = { re: w.re, im: w.im }
    }

    return { newPoints, newFarinPositions: positions, newWrapWeight }
  }

  // For open curves: just update w1, then propagate compensation
  const qComplex: Complex = { re: q.x, im: q.y }
  const zPrev: Complex = { re: cp0.re, im: cp0.im }
  const zNext: Complex = { re: cp1.re, im: cp1.im }

  const wPrev: Complex = { re: cp0.w_re, im: cp0.w_im }
  const num = csub(qComplex, zPrev)
  const denom = csub(zNext, qComplex)

  if (cnorm(denom) < 1e-10) {
    return { newPoints }
  }

  const wNew = cmult(wPrev, cdiv(num, denom))
  newPoints[p1Index].w_re = wNew.re
  newPoints[p1Index].w_im = wNew.im

  // Save original Farin point positions for compensation
  const originalFarinPositions: Point2D[] = []
  for (let i = farinIndex + 1; i < numEdges; i++) {
    const idx0 = i
    const idx1 = (i + 1) % n
    const cpBefore = controlPoints[idx0]
    const cpAfter = controlPoints[idx1]

    const w0: Complex = { re: cpBefore.w_re, im: cpBefore.w_im }
    const w1: Complex = { re: cpAfter.w_re, im: cpAfter.w_im }
    const z0c: Complex = { re: cpBefore.re, im: cpBefore.im }
    const z1c: Complex = { re: cpAfter.re, im: cpAfter.im }

    const c0_0 = cmult(w0, z0c)
    const c0_1 = cmult(w1, z1c)
    const numerator = cadd(c0_0, c0_1)
    const denominator = cadd(w0, w1)
    const farinPos = cdiv(numerator, denominator)

    originalFarinPositions.push({ x: farinPos.re, y: farinPos.im })
  }

  // Propagate compensation
  for (let i = farinIndex + 1; i < numEdges; i++) {
    const idx0 = i
    const idx1 = (i + 1) % n
    const origFarin = originalFarinPositions[i - farinIndex - 1]

    const cpBefore = newPoints[idx0]
    const cpAfter = newPoints[idx1]

    const zBefore: Complex = { re: cpBefore.re, im: cpBefore.im }
    const zAfter: Complex = { re: cpAfter.re, im: cpAfter.im }
    const qOrig: Complex = { re: origFarin.x, im: origFarin.y }

    const wBefore: Complex = { re: cpBefore.w_re, im: cpBefore.w_im }
    const numComp = csub(qOrig, zBefore)
    const denomComp = csub(zAfter, qOrig)

    if (cnorm(denomComp) < 1e-10) {
      continue
    }

    const wAfter = cmult(wBefore, cdiv(numComp, denomComp))
    newPoints[idx1].w_re = wAfter.re
    newPoints[idx1].w_im = wAfter.im
  }

  // Compute updated farinPositions from the new weights so the stored
  // positions stay in sync with the visual display (prevents stale positions
  // from snapping Farin points back when a control point is subsequently moved)
  const newFarinPositions: Point2D[] = []
  for (let i = 0; i < numEdges; i++) {
    if (i === farinIndex) {
      newFarinPositions.push(q)
    } else {
      const idx0 = i
      const idx1 = (i + 1) % n
      const cpBefore = newPoints[idx0]
      const cpAfter = newPoints[idx1]

      const w0: Complex = { re: cpBefore.w_re, im: cpBefore.w_im }
      const w1: Complex = { re: cpAfter.w_re, im: cpAfter.w_im }
      const z0c: Complex = { re: cpBefore.re, im: cpBefore.im }
      const z1c: Complex = { re: cpAfter.re, im: cpAfter.im }

      const c0_0 = cmult(w0, z0c)
      const c0_1 = cmult(w1, z1c)
      const numerator = cadd(c0_0, c0_1)
      const denominator = cadd(w0, w1)
      const farinPos = cdiv(numerator, denominator)

      newFarinPositions.push({ x: farinPos.re, y: farinPos.im })
    }
  }

  return { newPoints, newFarinPositions }
}

// Move a control point on a complex-rational curve while keeping Farin points fixed
// This is the key difference from rational curves where Farin points move with control points
export function moveComplexControlPointKeepingFarinFixed(
  curve: ComplexRationalBSplineCurve,
  controlPointIndex: number,
  newPosition: Point2D,
  minDistance: number = 5
): { points: ComplexPoint[]; wrapWeight?: { re: number; im: number } } {
  const { controlPoints } = curve
  const n = controlPoints.length
  const numEdges = curve.closed ? n : n - 1
  const newPoints = controlPoints.map(p => ({ ...p }))

  // Use stored farinPositions if available (source of truth for closed curves)
  // Otherwise compute from current weights
  let farinPositions: Point2D[]
  if (curve.farinPositions && curve.farinPositions.length === numEdges) {
    farinPositions = curve.farinPositions
  } else {
    // Compute Farin positions from current weights
    farinPositions = []
    for (let i = 0; i < numEdges; i++) {
      const idx0 = i
      const idx1 = (i + 1) % n
      const cpBefore = controlPoints[idx0]
      const cpAfter = controlPoints[idx1]

      const w0: Complex = { re: cpBefore.w_re, im: cpBefore.w_im }
      const w1: Complex = { re: cpAfter.w_re, im: cpAfter.w_im }
      const z0: Complex = { re: cpBefore.re, im: cpBefore.im }
      const z1: Complex = { re: cpAfter.re, im: cpAfter.im }

      const c0_0 = cmult(w0, z0)
      const c0_1 = cmult(w1, z1)
      const numerator = cadd(c0_0, c0_1)
      const denominator = cadd(w0, w1)
      const farinPos = cdiv(numerator, denominator)

      farinPositions.push({ x: farinPos.re, y: farinPos.im })
    }
  }

  // Check minimum distance from neighboring Farin points
  let constrainedPosition = { ...newPosition }

  // Check Farin point before this control point (if exists)
  if (controlPointIndex > 0 || curve.closed) {
    const farinBefore = farinPositions[curve.closed ? (controlPointIndex - 1 + numEdges) % numEdges : controlPointIndex - 1]
    if (farinBefore) {
      const dist = Math.sqrt((constrainedPosition.x - farinBefore.x) ** 2 + (constrainedPosition.y - farinBefore.y) ** 2)
      if (dist < minDistance) {
        const dx = constrainedPosition.x - farinBefore.x
        const dy = constrainedPosition.y - farinBefore.y
        const scale = dist > 0 ? minDistance / dist : 1
        constrainedPosition = {
          x: farinBefore.x + dx * scale,
          y: farinBefore.y + dy * scale,
        }
      }
    }
  }

  // Check Farin point after this control point (if exists)
  if (controlPointIndex < numEdges) {
    const farinAfter = farinPositions[controlPointIndex]
    const dist = Math.sqrt((constrainedPosition.x - farinAfter.x) ** 2 + (constrainedPosition.y - farinAfter.y) ** 2)
    if (dist < minDistance) {
      const dx = constrainedPosition.x - farinAfter.x
      const dy = constrainedPosition.y - farinAfter.y
      const scale = dist > 0 ? minDistance / dist : 1
      constrainedPosition = {
        x: farinAfter.x + dx * scale,
        y: farinAfter.y + dy * scale,
      }
    }
  }

  // Move the control point
  newPoints[controlPointIndex].re = constrainedPosition.x
  newPoints[controlPointIndex].im = constrainedPosition.y

  // Now recalculate all weights to maintain the original Farin positions
  // Start from the first weight (w0 = 1+0i is fixed) and propagate forward
  // For each Farin point, compute the weight needed to keep it at its original position

  // The formula: w_{i+1} = w_i * (q_i - z_i) / (z_{i+1} - q_i)
  // where q_i is the Farin point position, z_i and z_{i+1} are control points
  //
  // For closed curves: propagate weights for edges 0 to n-2 (updating CPs 1 to n-1)
  // Edge n-1 only computes wrapWeight, does NOT update CP 0's weight (which is the anchor)
  const edgesToPropagate = curve.closed ? numEdges - 1 : numEdges

  for (let i = 0; i < edgesToPropagate; i++) {
    const idx0 = i
    const idx1 = (i + 1) % n
    const farinPos = farinPositions[i]

    const cpBefore = newPoints[idx0]
    const cpAfter = newPoints[idx1]

    const zBefore: Complex = { re: cpBefore.re, im: cpBefore.im }
    const zAfter: Complex = { re: cpAfter.re, im: cpAfter.im }
    const q: Complex = { re: farinPos.x, im: farinPos.y }

    // w_{i+1} = w_i * (q - z_i) / (z_{i+1} - q)
    const wBefore: Complex = { re: cpBefore.w_re, im: cpBefore.w_im }
    const num = csub(q, zBefore)
    const denom = csub(zAfter, q)

    if (cnorm(denom) < 1e-10) {
      continue // Skip if degenerate
    }

    const wAfter = cmult(wBefore, cdiv(num, denom))
    newPoints[idx1].w_re = wAfter.re
    newPoints[idx1].w_im = wAfter.im
  }

  // For closed curves, compute wrapWeight from the last edge (n-1 to 0)
  // This edge's Farin position determines the wrapWeight, not CP 0's weight
  let wrapWeight: { re: number; im: number } | undefined
  if (curve.closed) {
    const qLast = farinPositions[n - 1]
    const zLast = newPoints[n - 1]
    const zFirst = newPoints[0]
    const wLast: Complex = { re: zLast.w_re, im: zLast.w_im }

    const qLastComplex: Complex = { re: qLast.x, im: qLast.y }
    const zLastComplex: Complex = { re: zLast.re, im: zLast.im }
    const zFirstComplex: Complex = { re: zFirst.re, im: zFirst.im }

    const numWrap = csub(qLastComplex, zLastComplex)
    const denomWrap = csub(zFirstComplex, qLastComplex)

    if (cnorm(denomWrap) < 1e-10) {
      wrapWeight = { re: wLast.re, im: wLast.im }
    } else {
      const w = cmult(wLast, cdiv(numWrap, denomWrap))
      wrapWeight = { re: w.re, im: w.im }
    }
  }

  return { points: newPoints, wrapWeight }
}

// Project a point onto a line segment and return the parameter t [0, 1]
export function projectPointOntoEdge(
  point: Point2D,
  edgeStart: Point2D,
  edgeEnd: Point2D,
  minT: number = 0.01,
  maxT: number = 0.99
): { t: number; position: Point2D } {
  const dx = edgeEnd.x - edgeStart.x
  const dy = edgeEnd.y - edgeStart.y
  const len2 = dx * dx + dy * dy

  if (len2 < 1e-10) {
    // Edge is degenerate (start == end)
    return { t: 0.5, position: { ...edgeStart } }
  }

  // Project point onto line
  const t = ((point.x - edgeStart.x) * dx + (point.y - edgeStart.y) * dy) / len2

  // Clamp to valid range
  const clampedT = Math.max(minT, Math.min(maxT, t))

  const position = {
    x: edgeStart.x + clampedT * dx,
    y: edgeStart.y + clampedT * dy,
  }

  return { t: clampedT, position }
}

// Compute perpendicular direction for the Farin point marker
export function computeEdgePerpendicular(edgeStart: Point2D, edgeEnd: Point2D): { px: number; py: number } {
  const dx = edgeEnd.x - edgeStart.x
  const dy = edgeEnd.y - edgeStart.y
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len < 1e-10) {
    return { px: 0, py: 1 }
  }

  // Perpendicular direction (rotated 90 degrees)
  return {
    px: -dy / len,
    py: dx / len,
  }
}

/**
 * Viewport bounds for clipping arcs.
 */
export interface ArcViewportBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Check if a point is valid (finite).
 */
function isValidArcPoint(p: Point2D): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

/**
 * Check if a point is inside the viewport (with margin).
 */
function isPointInViewport(p: Point2D, viewport: ArcViewportBounds, margin: number): boolean {
  return (
    p.x >= viewport.minX - margin &&
    p.x <= viewport.maxX + margin &&
    p.y >= viewport.minY - margin &&
    p.y <= viewport.maxY + margin
  )
}

/**
 * Compute arc center and radius from three points.
 * Returns null if points are collinear.
 */
function computeArcGeometry(start: Point2D, through: Point2D, end: Point2D): {
  centerX: number
  centerY: number
  radius: number
  sweepFlag: number
  largeArcFlag: number
} | null {
  const v1x = through.x - start.x
  const v1y = through.y - start.y
  const v2x = end.x - start.x
  const v2y = end.y - start.y
  const cross = v1x * v2y - v1y * v2x

  if (Math.abs(cross) < 1e-10) {
    return null
  }

  const ax = start.x, ay = start.y
  const bx = through.x, by = through.y
  const cx = end.x, cy = end.y

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))

  if (Math.abs(d) < 1e-10) {
    return null
  }

  const aSq = ax * ax + ay * ay
  const bSq = bx * bx + by * by
  const cSq = cx * cx + cy * cy

  const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d
  const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d
  const radius = Math.sqrt((ax - centerX) ** 2 + (ay - centerY) ** 2)

  const sweepFlag = cross > 0 ? 1 : 0
  const centerCross = (centerX - start.x) * v2y - (centerY - start.y) * v2x
  const largeArcFlag = (cross > 0) === (centerCross > 0) ? 1 : 0

  return { centerX, centerY, radius, sweepFlag, largeArcFlag }
}

/**
 * Sample a circular arc adaptively, returning points along the arc.
 * Used when the arc is very large or goes outside the viewport.
 */
function sampleArcAdaptive(
  start: Point2D,
  through: Point2D,
  end: Point2D,
  viewport: ArcViewportBounds | undefined,
  tolerance: number
): Point2D[] {
  const points: Point2D[] = [start]
  const viewportMargin = viewport
    ? Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) * 0.1
    : 0

  // Recursively subdivide the arc
  function subdivide(p0: Point2D, pMid: Point2D, p1: Point2D, depth: number): void {
    if (depth > 10) {
      points.push(p1)
      return
    }

    // Check if any point is invalid
    if (!isValidArcPoint(p0) || !isValidArcPoint(pMid) || !isValidArcPoint(p1)) {
      points.push(p1)
      return
    }

    // Check if segment is outside viewport
    if (viewport) {
      const p0In = isPointInViewport(p0, viewport, viewportMargin)
      const pMidIn = isPointInViewport(pMid, viewport, viewportMargin)
      const p1In = isPointInViewport(p1, viewport, viewportMargin)

      if (!p0In && !pMidIn && !p1In) {
        // All points outside - just connect with line
        points.push(p1)
        return
      }
    }

    // Check flatness: distance from midpoint to chord midpoint
    const chordMidX = (p0.x + p1.x) / 2
    const chordMidY = (p0.y + p1.y) / 2
    const error = Math.hypot(pMid.x - chordMidX, pMid.y - chordMidY)

    if (error <= tolerance) {
      points.push(p1)
      return
    }

    // Subdivide: compute arc midpoints for each half
    const geom1 = computeArcGeometry(p0, pMid, p1)
    if (!geom1) {
      points.push(p1)
      return
    }

    // Compute midpoint of first half arc (between p0 and pMid)
    const angle0 = Math.atan2(p0.y - geom1.centerY, p0.x - geom1.centerX)
    const angleMid = Math.atan2(pMid.y - geom1.centerY, pMid.x - geom1.centerX)
    const angle1 = Math.atan2(p1.y - geom1.centerY, p1.x - geom1.centerX)

    // Compute intermediate angles (handling wrap-around)
    const halfAngle1 = interpolateAngle(angle0, angleMid, 0.5, geom1.sweepFlag)
    const halfAngle2 = interpolateAngle(angleMid, angle1, 0.5, geom1.sweepFlag)

    const mid1: Point2D = {
      x: geom1.centerX + geom1.radius * Math.cos(halfAngle1),
      y: geom1.centerY + geom1.radius * Math.sin(halfAngle1),
    }
    const mid2: Point2D = {
      x: geom1.centerX + geom1.radius * Math.cos(halfAngle2),
      y: geom1.centerY + geom1.radius * Math.sin(halfAngle2),
    }

    subdivide(p0, mid1, pMid, depth + 1)
    subdivide(pMid, mid2, p1, depth + 1)
  }

  subdivide(start, through, end, 0)
  return points
}

/**
 * Interpolate between two angles, respecting sweep direction.
 */
function interpolateAngle(a0: number, a1: number, t: number, sweepFlag: number): number {
  let delta = a1 - a0

  // Normalize delta based on sweep direction
  if (sweepFlag === 1) {
    // Counter-clockwise: want positive delta
    while (delta < 0) delta += 2 * Math.PI
    while (delta > 2 * Math.PI) delta -= 2 * Math.PI
  } else {
    // Clockwise: want negative delta
    while (delta > 0) delta -= 2 * Math.PI
    while (delta < -2 * Math.PI) delta += 2 * Math.PI
  }

  return a0 + t * delta
}

// Compute circular arc SVG path through three points (start, through, end)
// Returns an SVG path string for the arc, or a line if points are collinear
export function computeArcPath(start: Point2D, through: Point2D, end: Point2D): string {
  const geom = computeArcGeometry(start, through, end)

  if (!geom) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }

  return `M ${start.x} ${start.y} A ${geom.radius} ${geom.radius} 0 ${geom.largeArcFlag} ${geom.sweepFlag} ${end.x} ${end.y}`
}

/**
 * Compute arc path with viewport clipping and adaptive sampling for large arcs.
 * Falls back to polyline when arc is too large or goes outside viewport.
 */
export function computeArcPathAdaptive(
  start: Point2D,
  through: Point2D,
  end: Point2D,
  viewport?: ArcViewportBounds,
  tolerance: number = 0.5
): string {
  // Check for invalid points
  if (!isValidArcPoint(start) || !isValidArcPoint(through) || !isValidArcPoint(end)) {
    // Skip invalid arcs entirely
    if (isValidArcPoint(start) && isValidArcPoint(end)) {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
    }
    return ''
  }

  const geom = computeArcGeometry(start, through, end)

  if (!geom) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }

  // For very large radii or when arc goes far outside viewport, use adaptive sampling
  const maxReasonableRadius = viewport
    ? Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) * 10
    : 10000

  if (geom.radius > maxReasonableRadius || !Number.isFinite(geom.radius)) {
    // Arc is nearly a straight line or goes to infinity
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }

  // Check if the arc center is very far from viewport
  if (viewport) {
    const viewportSize = Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY)
    const centerDist = Math.max(
      Math.abs(geom.centerX - (viewport.minX + viewport.maxX) / 2),
      Math.abs(geom.centerY - (viewport.minY + viewport.maxY) / 2)
    )

    // If center is very far and radius is large, sample adaptively
    if (centerDist > viewportSize * 5 && geom.radius > viewportSize) {
      const points = sampleArcAdaptive(start, through, end, viewport, tolerance)
      if (points.length < 2) return ''

      let path = `M ${points[0].x} ${points[0].y}`
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`
      }
      return path
    }
  }

  // Standard SVG arc
  return `M ${start.x} ${start.y} A ${geom.radius} ${geom.radius} 0 ${geom.largeArcFlag} ${geom.sweepFlag} ${end.x} ${end.y}`
}

// Generate full control polygon path for complex-rational curves with arc segments
export function computeComplexControlPolygonPath(
  controlPoints: Point2D[],
  farinPoints: ComplexFarinPoint[],
  closed: boolean,
  viewport?: ArcViewportBounds,
  tolerance: number = 0.5
): string {
  if (controlPoints.length < 2) return ''

  const segments: string[] = []
  const numEdges = closed ? controlPoints.length : controlPoints.length - 1

  for (let i = 0; i < numEdges; i++) {
    const p0 = controlPoints[i]
    const p1 = controlPoints[(i + 1) % controlPoints.length]
    const farin = farinPoints[i]

    if (farin && isValidArcPoint(farin.position)) {
      const arcPath = computeArcPathAdaptive(p0, farin.position, p1, viewport, tolerance)
      if (arcPath) {
        segments.push(arcPath)
      }
    } else if (isValidArcPoint(p0) && isValidArcPoint(p1)) {
      // Fallback to line if no Farin point or invalid
      segments.push(`M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`)
    }
  }

  return segments.join(' ')
}
