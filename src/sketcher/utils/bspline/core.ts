// Being migrated to core/ incrementally; remove this once a file is on core.
// ============================================================================
// CORE B-SPLINE EVALUATION
// ============================================================================
//
// This module provides core B-spline evaluation functions:
// - Knot span finding
// - Basis function computation
// - Curve evaluation for all curve types
// ============================================================================

import type { Point2D, WeightedPoint2D, ComplexPoint, Curve } from '../../types/curve'
import { periodicKnotAt, periodicControlPointAt, cpow } from './periodic'

// ============================================================================
// PERIODIC CURVE EVALUATION
// ============================================================================

/**
 * Find the knot span for a periodic B-spline.
 * For a periodic curve with n control points, knots are stored in [0, 1).
 */
export function findPeriodicKnotSpan(_degree: number, knots: number[], t: number): number {
  const n = knots.length

  // Normalize t to [0, 1)
  t = ((t % 1) + 1) % 1

  // Check if t is in a wrapping span (before first knot)
  if (t < knots[0]) {
    return n - 1
  }

  // Check if t is at or after the last knot
  if (t >= knots[n - 1]) {
    return n - 1
  }

  // Standard binary search for t in [knots[0], knots[n-1])
  let low = 0
  let high = n - 1

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (knots[mid] <= t) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return low
}

/**
 * Compute basis functions for periodic B-spline at parameter t.
 * Uses modular knot access for wrapping behavior.
 */
export function periodicBasisFunctions(span: number, t: number, degree: number, knots: number[]): number[] {
  const N = new Array(degree + 1).fill(0)
  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)

  N[0] = 1.0

  for (let j = 1; j <= degree; j++) {
    // Use periodicKnotAt for proper wrapping
    left[j] = t - periodicKnotAt(knots, span + 1 - j)
    right[j] = periodicKnotAt(knots, span + j) - t

    let saved = 0.0

    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r]
      const temp = denom === 0 ? 0 : N[r] / denom
      N[r] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }

    N[j] = saved
  }

  return N
}

/**
 * Evaluate a periodic B-spline curve at parameter t.
 */
export function evaluatePeriodicBSpline(
  controlPoints: Point2D[],
  degree: number,
  knots: number[],
  t: number
): Point2D {
  // Normalize t to [0, 1)
  t = ((t % 1) + 1) % 1

  const span = findPeriodicKnotSpan(degree, knots, t)
  const N = periodicBasisFunctions(span, t, degree, knots)

  let x = 0
  let y = 0

  for (let i = 0; i <= degree; i++) {
    const cp = periodicControlPointAt(controlPoints, span - degree + i)
    x += N[i] * cp.x
    y += N[i] * cp.y
  }

  return { x, y }
}

/**
 * Evaluate a periodic rational B-spline (NURBS) at parameter t.
 */
export function evaluatePeriodicRationalBSpline(
  controlPoints: WeightedPoint2D[],
  degree: number,
  knots: number[],
  t: number,
  wrapWeight?: number
): Point2D {
  // Normalize t to [0, 1)
  t = ((t % 1) + 1) % 1

  const span = findPeriodicKnotSpan(degree, knots, t)
  const N = periodicBasisFunctions(span, t, degree, knots)
  const n = controlPoints.length

  let x = 0
  let y = 0
  let w = 0

  for (let i = 0; i <= degree; i++) {
    const rawIdx = span - degree + i
    const idx = ((rawIdx % n) + n) % n
    const cp = controlPoints[idx]

    // Use wrapWeight for wrapped accesses (when rawIdx is outside [0, n))
    let cpWeight = cp.w
    if (wrapWeight !== undefined) {
      const periods = Math.floor(rawIdx / n)
      if (periods !== 0) {
        cpWeight = cp.w * Math.pow(wrapWeight / controlPoints[0].w, periods)
      }
    }

    const nw = N[i] * cpWeight
    x += nw * cp.x
    y += nw * cp.y
    w += nw
  }

  return { x: x / w, y: y / w }
}

/**
 * Evaluate a periodic complex-rational B-spline at parameter t.
 */
export function evaluatePeriodicComplexRationalBSpline(
  controlPoints: ComplexPoint[],
  degree: number,
  knots: number[],
  t: number,
  wrapWeight?: { re: number; im: number }
): Point2D {
  // Normalize t to [0, 1)
  t = ((t % 1) + 1) % 1

  const span = findPeriodicKnotSpan(degree, knots, t)
  const basis = periodicBasisFunctions(span, t, degree, knots)
  const n = controlPoints.length

  let c0_re = 0
  let c0_im = 0
  let c1_re = 0
  let c1_im = 0

  for (let i = 0; i <= degree; i++) {
    const rawIdx = span - degree + i
    const idx = ((rawIdx % n) + n) % n
    const cp = controlPoints[idx]
    const N = basis[i]

    // Use wrapWeight for wrapped accesses (spiral weight correction)
    let w_re = cp.w_re
    let w_im = cp.w_im
    if (wrapWeight !== undefined) {
      const periods = Math.floor(rawIdx / n)
      if (periods !== 0) {
        const w0_re = controlPoints[0].w_re
        const w0_im = controlPoints[0].w_im
        // Complex ratio = wrapWeight / w0
        const denom0 = w0_re * w0_re + w0_im * w0_im
        if (denom0 > 1e-20) {
          const ratio_re = (wrapWeight.re * w0_re + wrapWeight.im * w0_im) / denom0
          const ratio_im = (wrapWeight.im * w0_re - wrapWeight.re * w0_im) / denom0

          // ratio^periods handles any integer period (not just ±1)
          const rp = cpow({ re: ratio_re, im: ratio_im }, periods)
          const new_w_re = w_re * rp.re - w_im * rp.im
          const new_w_im = w_re * rp.im + w_im * rp.re
          w_re = new_w_re
          w_im = new_w_im
        }
      }
    }

    const wz_re = w_re * cp.re - w_im * cp.im
    const wz_im = w_re * cp.im + w_im * cp.re

    c0_re += N * wz_re
    c0_im += N * wz_im
    c1_re += N * w_re
    c1_im += N * w_im
  }

  const denom = c1_re * c1_re + c1_im * c1_im
  if (denom < 1e-20) {
    return { x: 0, y: 0 }
  }

  return {
    x: (c0_re * c1_re + c0_im * c1_im) / denom,
    y: (c0_im * c1_re - c0_re * c1_im) / denom,
  }
}

// ============================================================================
// OPEN CURVE EVALUATION
// ============================================================================

/**
 * Find the knot span index for parameter t (open curves).
 */
export function findKnotSpan(degree: number, knots: number[], t: number): number {
  const n = knots.length - degree - 2 // number of control points - 1

  if (t >= knots[n + 1]) {
    let span = n
    while (span > degree && knots[span] >= knots[span + 1]) {
      span--
    }
    return span
  }
  if (t < knots[degree]) return degree

  // Binary search
  let low = degree
  let high = n + 1
  let mid = Math.floor((low + high) / 2)

  while (t < knots[mid] || t >= knots[mid + 1]) {
    if (t < knots[mid]) {
      high = mid
    } else {
      low = mid
    }
    mid = Math.floor((low + high) / 2)
  }

  return mid
}

/**
 * Compute basis functions using Cox-de Boor recursion.
 * Implements Algorithm A2.2 from Piegl & Tiller, The NURBS Book, p.70
 */
export function basisFunctions(span: number, t: number, degree: number, knots: number[]): number[] {
  const N = new Array(degree + 1).fill(0)
  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)

  N[0] = 1.0

  for (let j = 1; j <= degree; j++) {
    left[j] = t - knots[span + 1 - j]
    right[j] = knots[span + j] - t
    let saved = 0.0

    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r]
      const temp = denom === 0 ? 0 : N[r] / denom
      N[r] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }

    N[j] = saved
  }

  return N
}

/**
 * Evaluate B-spline curve at parameter t.
 */
export function evaluateBSpline(
  controlPoints: Point2D[],
  degree: number,
  knots: number[],
  t: number
): Point2D {
  const span = findKnotSpan(degree, knots, t)
  const N = basisFunctions(span, t, degree, knots)

  let x = 0
  let y = 0

  for (let i = 0; i <= degree; i++) {
    const cp = controlPoints[span - degree + i]
    x += N[i] * cp.x
    y += N[i] * cp.y
  }

  return { x, y }
}

/**
 * Evaluate rational B-spline (NURBS) at parameter t.
 */
export function evaluateRationalBSpline(
  controlPoints: WeightedPoint2D[],
  degree: number,
  knots: number[],
  t: number
): Point2D {
  const span = findKnotSpan(degree, knots, t)
  const N = basisFunctions(span, t, degree, knots)

  let x = 0
  let y = 0
  let w = 0

  for (let i = 0; i <= degree; i++) {
    const cp = controlPoints[span - degree + i]
    const nw = N[i] * cp.w
    x += nw * cp.x
    y += nw * cp.y
    w += nw
  }

  return { x: x / w, y: y / w }
}

/**
 * Evaluate complex rational B-spline at parameter t.
 */
export function evaluateComplexRationalBSpline(
  controlPoints: ComplexPoint[],
  degree: number,
  knots: number[],
  t: number
): Point2D {
  const span = findKnotSpan(degree, knots, t)
  const basis = basisFunctions(span, t, degree, knots)

  let c0_re = 0
  let c0_im = 0
  let c1_re = 0
  let c1_im = 0

  for (let i = 0; i <= degree; i++) {
    const cp = controlPoints[span - degree + i]
    const N = basis[i]

    const wz_re = cp.w_re * cp.re - cp.w_im * cp.im
    const wz_im = cp.w_re * cp.im + cp.w_im * cp.re

    c0_re += N * wz_re
    c0_im += N * wz_im
    c1_re += N * cp.w_re
    c1_im += N * cp.w_im
  }

  const denom = c1_re * c1_re + c1_im * c1_im
  if (denom < 1e-20) {
    return { x: 0, y: 0 }
  }

  return {
    x: (c0_re * c1_re + c0_im * c1_im) / denom,
    y: (c0_im * c1_re - c0_re * c1_im) / denom,
  }
}

// ============================================================================
// GENERIC CURVE EVALUATION
// ============================================================================

/**
 * Check if a curve uses periodic representation (knots in [0, 1)).
 */
export function isPeriodicRepresentation(curve: Curve): boolean {
  if (!curve.closed) return false

  const knots = curve.knots
  if (knots.length === 0) return false

  return knots.every(k => k >= 0 && k < 1)
}

/**
 * Generic curve evaluation - handles all curve types and representations.
 */
export function evaluateCurve(curve: Curve, t: number): Point2D {
  // Use periodic evaluation for closed curves with periodic representation
  if (curve.closed && isPeriodicRepresentation(curve)) {
    switch (curve.kind) {
      case 'bspline':
        return evaluatePeriodicBSpline(curve.controlPoints, curve.degree, curve.knots, t)
      case 'rational':
        return evaluatePeriodicRationalBSpline(
          curve.controlPoints,
          curve.degree,
          curve.knots,
          t,
          curve.wrapWeight
        )
      case 'complex-rational':
        return evaluatePeriodicComplexRationalBSpline(
          curve.controlPoints,
          curve.degree,
          curve.knots,
          t,
          curve.wrapWeight
        )
    }
  }

  // Standard evaluation for open curves or legacy closed curves
  switch (curve.kind) {
    case 'bspline':
      return evaluateBSpline(curve.controlPoints, curve.degree, curve.knots, t)
    case 'rational':
      return evaluateRationalBSpline(curve.controlPoints, curve.degree, curve.knots, t)
    case 'complex-rational':
      return evaluateComplexRationalBSpline(curve.controlPoints, curve.degree, curve.knots, t)
  }
}
