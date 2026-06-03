// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// ============================================================================
// PERIODIC B-SPLINE ABSTRACTIONS
// ============================================================================
//
// This module provides clean abstractions for periodic (closed) B-splines.
//
// Key insight for complex-rational curves with wrapWeight ≠ w₀:
//   - Positions (z) are PERIODIC: z[i+n] = z[i]
//   - Weights (w) SPIRAL: w[i+n] = ratio × w[i]  where ratio = wrapWeight/w₀
//   - Homogeneous coords SPIRAL: c₀[i+n] = ratio × c₀[i], c₁[i+n] = ratio × c₁[i]
//   - But the projected curve CLOSES: z = c₀/c₁, the ratio cancels!
//
// The same pattern applies to rational curves with real weights.
// ============================================================================

import type { Point2D, WeightedPoint2D, ComplexPoint, RationalBSplineCurve, ComplexRationalBSplineCurve } from '../../types/curve'
import { cmult, cdiv, type Complex } from '../complex'

// ============================================================================
// COMPLEX POWER FUNCTION
// ============================================================================

/**
 * Complex power: compute z^n for integer n (positive, negative, or zero)
 */
export function cpow(z: Complex, n: number): Complex {
  if (n === 0) return { re: 1, im: 0 }
  if (n === 1) return z
  if (n === -1) {
    // z^(-1) = conj(z) / |z|²
    const normSq = z.re * z.re + z.im * z.im
    if (normSq < 1e-20) return { re: 0, im: 0 }
    return { re: z.re / normSq, im: -z.im / normSq }
  }

  // For |n| > 1, compute iteratively
  if (n > 0) {
    let result = z
    for (let i = 1; i < n; i++) {
      result = cmult(result, z)
    }
    return result
  } else {
    // n < -1: compute z^|n| then invert
    const pos = cpow(z, -n)
    return cpow(pos, -1)
  }
}

/**
 * Real power: compute r^n for integer n (positive, negative, or zero)
 */
export function rpow(r: number, n: number): number {
  if (n === 0) return 1
  if (n === 1) return r
  if (n === -1) return r !== 0 ? 1 / r : 0
  return Math.pow(r, n)
}

// ============================================================================
// PERIODIC COMPLEX-RATIONAL B-SPLINE
// ============================================================================

/**
 * Periodic complex-rational B-spline with spiral weight structure.
 *
 * Stores one period of data. Provides infinite access via spiral formula.
 */
export interface PeriodicComplexBSpline {
  /** Base knots for one period [0, 1) */
  readonly knots: readonly number[]
  /** Control point positions (complex: z = x + iy) */
  readonly positions: readonly Complex[]
  /** Base weights for period 0 (complex) */
  readonly weights: readonly Complex[]
  /** Curve degree */
  readonly degree: number
  /** Weight ratio for spiral: ratio = wrapWeight / w[0] */
  readonly weightRatio: Complex
}

/**
 * Create a PeriodicComplexBSpline from a ComplexRationalBSplineCurve
 */
export function toPeriodicComplexBSpline(curve: ComplexRationalBSplineCurve): PeriodicComplexBSpline {
  const positions = curve.controlPoints.map(cp => ({ re: cp.re, im: cp.im }))
  const weights = curve.controlPoints.map(cp => ({ re: cp.w_re, im: cp.w_im }))

  // Compute weight ratio
  let weightRatio: Complex = { re: 1, im: 0 }
  if (curve.wrapWeight) {
    const w0 = weights[0]
    weightRatio = cdiv(curve.wrapWeight, w0)
  }

  return {
    knots: curve.knots,
    positions,
    weights,
    degree: curve.degree,
    weightRatio,
  }
}

/**
 * Convert back to ComplexRationalBSplineCurve
 */
export function fromPeriodicComplexBSpline(
  pbs: PeriodicComplexBSpline,
  originalCurve: ComplexRationalBSplineCurve
): ComplexRationalBSplineCurve {
  const controlPoints: ComplexPoint[] = pbs.positions.map((z, i) => ({
    re: z.re,
    im: z.im,
    w_re: pbs.weights[i].re,
    w_im: pbs.weights[i].im,
  }))

  // Compute wrapWeight from ratio
  const w0 = pbs.weights[0]
  const wrapWeight = cmult(w0, pbs.weightRatio)

  return {
    ...originalCurve,
    knots: [...pbs.knots],
    controlPoints,
    wrapWeight: { re: wrapWeight.re, im: wrapWeight.im },
  }
}

// ============================================================================
// COMPLEX SPIRAL ACCESSORS
// ============================================================================

/**
 * Get knot value at any index (spiral formula for knots).
 * Knots are truly periodic: knotAt(i+n) = knotAt(i) + period
 */
export function bsKnotAt(pbs: PeriodicComplexBSpline, i: number, period: number = 1): number {
  const n = pbs.knots.length
  const q = Math.floor(i / n)  // Which period
  const r = ((i % n) + n) % n  // Position within period
  return pbs.knots[r] + q * period
}

/**
 * Get position at any index (positions are periodic - just wrap).
 * positionAt(i+n) = positionAt(i)
 */
export function bsPositionAt(pbs: PeriodicComplexBSpline, i: number): Complex {
  const n = pbs.positions.length
  const r = ((i % n) + n) % n
  return pbs.positions[r]
}

/**
 * Get weight at any index (weights spiral).
 * weightAt(i+n) = ratio × weightAt(i)
 */
export function bsWeightAt(pbs: PeriodicComplexBSpline, i: number): Complex {
  const n = pbs.weights.length
  const q = Math.floor(i / n)  // Which period
  const r = ((i % n) + n) % n  // Position within period

  const baseWeight = pbs.weights[r]

  if (q === 0) return baseWeight

  // Apply spiral: w[i] = w[r] × ratio^q
  const ratioQ = cpow(pbs.weightRatio, q)
  return cmult(baseWeight, ratioQ)
}

/**
 * Get homogeneous coordinates at any index.
 * c₀ = w × z (both spiral together)
 * c₁ = w
 */
export function bsHomogeneousAt(pbs: PeriodicComplexBSpline, i: number): { c0: Complex; c1: Complex } {
  const z = bsPositionAt(pbs, i)
  const w = bsWeightAt(pbs, i)
  return {
    c0: cmult(w, z),
    c1: w,
  }
}

/**
 * Get the number of control points in one period.
 */
export function bsNumCPs(pbs: PeriodicComplexBSpline): number {
  return pbs.positions.length
}

// ============================================================================
// PERIODIC RATIONAL B-SPLINE (REAL WEIGHTS)
// ============================================================================

/**
 * Periodic rational B-spline with spiral weight structure.
 *
 * Stores one period of data. Provides infinite access via spiral formula.
 */
export interface PeriodicRationalBSpline {
  /** Base knots for one period [0, 1) */
  readonly knots: readonly number[]
  /** Control point positions (2D points) */
  readonly positions: readonly Point2D[]
  /** Base weights for period 0 (real) */
  readonly weights: readonly number[]
  /** Curve degree */
  readonly degree: number
  /** Weight ratio for spiral: ratio = wrapWeight / w[0] */
  readonly weightRatio: number
}

/**
 * Create a PeriodicRationalBSpline from a RationalBSplineCurve
 */
export function toPeriodicRationalBSpline(curve: RationalBSplineCurve): PeriodicRationalBSpline {
  const positions = curve.controlPoints.map(cp => ({ x: cp.x, y: cp.y }))
  const weights = curve.controlPoints.map(cp => cp.w)

  // Compute weight ratio
  let weightRatio = 1
  if (curve.wrapWeight !== undefined && weights[0] !== 0) {
    weightRatio = curve.wrapWeight / weights[0]
  }

  return {
    knots: curve.knots,
    positions,
    weights,
    degree: curve.degree,
    weightRatio,
  }
}

/**
 * Convert back to RationalBSplineCurve
 */
export function fromPeriodicRationalBSpline(
  pbs: PeriodicRationalBSpline,
  originalCurve: RationalBSplineCurve
): RationalBSplineCurve {
  const controlPoints: WeightedPoint2D[] = pbs.positions.map((p, i) => ({
    x: p.x,
    y: p.y,
    w: pbs.weights[i],
  }))

  // Compute wrapWeight from ratio
  const wrapWeight = pbs.weights[0] * pbs.weightRatio

  return {
    ...originalCurve,
    knots: [...pbs.knots],
    controlPoints,
    wrapWeight,
  }
}

// ============================================================================
// RATIONAL SPIRAL ACCESSORS
// ============================================================================

/**
 * Get knot value at any index (spiral formula for knots).
 * Knots are truly periodic: knotAt(i+n) = knotAt(i) + period
 */
export function rbsKnotAt(pbs: PeriodicRationalBSpline, i: number, period: number = 1): number {
  const n = pbs.knots.length
  const q = Math.floor(i / n)  // Which period
  const r = ((i % n) + n) % n  // Position within period
  return pbs.knots[r] + q * period
}

/**
 * Get position at any index (positions are periodic - just wrap).
 * positionAt(i+n) = positionAt(i)
 */
export function rbsPositionAt(pbs: PeriodicRationalBSpline, i: number): Point2D {
  const n = pbs.positions.length
  const r = ((i % n) + n) % n
  return pbs.positions[r]
}

/**
 * Get weight at any index (weights spiral).
 * weightAt(i+n) = ratio × weightAt(i)
 */
export function rbsWeightAt(pbs: PeriodicRationalBSpline, i: number): number {
  const n = pbs.weights.length
  const q = Math.floor(i / n)  // Which period
  const r = ((i % n) + n) % n  // Position within period

  const baseWeight = pbs.weights[r]

  if (q === 0) return baseWeight

  // Apply spiral: w[i] = w[r] × ratio^q
  const ratioQ = rpow(pbs.weightRatio, q)
  return baseWeight * ratioQ
}

/**
 * Get homogeneous coordinates at any index.
 * (wx, wy, w) - all components spiral together
 */
export function rbsHomogeneousAt(pbs: PeriodicRationalBSpline, i: number): { wx: number; wy: number; w: number } {
  const p = rbsPositionAt(pbs, i)
  const w = rbsWeightAt(pbs, i)
  return {
    wx: w * p.x,
    wy: w * p.y,
    w: w,
  }
}

/**
 * Get the number of control points in one period.
 */
export function rbsNumCPs(pbs: PeriodicRationalBSpline): number {
  return pbs.positions.length
}

// ============================================================================
// GENERIC PERIODIC UTILITIES
// ============================================================================

/**
 * For periodic curves with n knots stored in [0, 1), get the effective knot value
 * at any index using modular arithmetic. Knots wrap with period 1.
 *
 * @param knots - Array of n knot values in [0, 1), sorted
 * @param i - Index (can be negative or >= n)
 * @param period - The period of the curve (default 1)
 * @returns The effective knot value at index i
 */
export function periodicKnotAt(knots: number[], i: number, period: number = 1): number {
  const n = knots.length
  const q = Math.floor(i / n) // Which period?
  const r = ((i % n) + n) % n // Position in period (modular)
  return knots[r] + q * period
}

/**
 * For periodic curves, get control point at any index using modular indexing.
 *
 * @param controlPoints - Array of control points
 * @param i - Index (can be negative or >= n)
 * @returns The control point at modular index i
 */
export function periodicControlPointAt<T>(controlPoints: T[], i: number): T {
  const n = controlPoints.length
  const r = ((i % n) + n) % n
  return controlPoints[r]
}
