// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * B-Spline Types with Discriminated Unions for Open/Periodic Curves
 *
 * Key design principles:
 * 1. Discriminated unions for open vs periodic (like Haskell's algebraic data types)
 * 2. knotAt/cpAt are THE abstraction boundary - all algorithms use these
 * 3. Periodic representation uses modular arithmetic for seamless wrap-around
 * 4. Algorithms written once work for both open and periodic curves
 */

// =============================================================================
// Knot Vectors - Discriminated Union
// =============================================================================

export type KnotVector = OpenKnots | PeriodicKnots

export interface OpenKnots {
  readonly tag: 'open'
  readonly knots: readonly number[]
}

export interface PeriodicKnots {
  readonly tag: 'periodic'
  readonly baseKnots: readonly number[] // n knot values (one per control point)
  readonly period: number
  readonly offset: number // accumulates after derivatives
}

// =============================================================================
// Control Points - Discriminated Union
// =============================================================================

export type ControlPoints = OpenCPs | PeriodicCPs

export interface OpenCPs {
  readonly tag: 'open'
  readonly cps: readonly number[]
}

export interface PeriodicCPs {
  readonly tag: 'periodic'
  readonly cps: readonly number[] // wraps via modulo access
}

// =============================================================================
// Unified B-Spline Types
// =============================================================================

export interface BSpline {
  readonly degree: number
  readonly knots: KnotVector
  readonly controlPoints: ControlPoints
}

export interface BSpline2D {
  readonly degree: number
  readonly knots: KnotVector
  readonly controlPointsX: ControlPoints
  readonly controlPointsY: ControlPoints
}

export interface RationalBSpline2D {
  readonly degree: number
  readonly knots: KnotVector
  readonly controlPointsX: ControlPoints  // homogeneous x*w
  readonly controlPointsY: ControlPoints  // homogeneous y*w
  readonly controlPointsW: ControlPoints  // weights w
}

// =============================================================================
// Topology Helper
// =============================================================================

export type Topology = 'open' | 'periodic'

export function topology(bs: BSpline): Topology {
  return bs.knots.tag
}

export function topology2D(bs: BSpline2D): Topology {
  return bs.knots.tag
}

// =============================================================================
// Access Functions - THE ABSTRACTION BOUNDARY
// All algorithms use these, never direct index access
// =============================================================================

/**
 * Access knot at index i.
 * For periodic knots, handles wrapping and offset automatically.
 *
 * This is the key abstraction that makes algorithms work for both
 * open and periodic curves without code duplication.
 */
export function knotAt(kv: KnotVector, i: number): number {
  switch (kv.tag) {
    case 'open':
      return kv.knots[i]
    case 'periodic': {
      const n = kv.baseKnots.length
      const q = Math.floor(i / n)
      const r = ((i % n) + n) % n
      return kv.baseKnots[r] + q * kv.period + kv.offset
    }
  }
}

/**
 * Access control point at index i.
 * For periodic control points, handles wrapping automatically.
 *
 * This is the key abstraction that makes algorithms work for both
 * open and periodic curves without code duplication.
 */
export function cpAt(cp: ControlPoints, i: number): number {
  switch (cp.tag) {
    case 'open':
      return cp.cps[i]
    case 'periodic': {
      const n = cp.cps.length
      const r = ((i % n) + n) % n
      return cp.cps[r]
    }
  }
}

/**
 * Number of control points (actual storage, not logical).
 */
export function numCPs(cp: ControlPoints): number {
  return cp.cps.length
}

/**
 * Extract control points as a plain array.
 */
export function cpToArray(cp: ControlPoints): number[] {
  return [...cp.cps]
}

/**
 * Extract knots as a plain array.
 * For periodic knots, returns the base knots (one period).
 */
export function knotsToArray(kv: KnotVector): number[] {
  switch (kv.tag) {
    case 'open':
      return [...kv.knots]
    case 'periodic':
      return [...kv.baseKnots]
  }
}

/**
 * Create ControlPoints from a plain array, preserving topology.
 */
export function cpFromArray(original: ControlPoints, newValues: number[]): ControlPoints {
  switch (original.tag) {
    case 'open':
      return { tag: 'open', cps: newValues }
    case 'periodic':
      return { tag: 'periodic', cps: newValues }
  }
}

/**
 * Number of base knots (actual storage, not logical).
 */
export function numBaseKnots(kv: KnotVector): number {
  switch (kv.tag) {
    case 'open':
      return kv.knots.length
    case 'periodic':
      return kv.baseKnots.length
  }
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Create an open B-spline from arrays.
 */
export function mkOpenBSpline(degree: number, knots: number[], cps: number[]): BSpline {
  return {
    degree,
    knots: { tag: 'open', knots },
    controlPoints: { tag: 'open', cps },
  }
}

/**
 * Create an open 2D B-spline from arrays.
 */
export function mkOpenBSpline2D(
  degree: number,
  knots: number[],
  cpsX: number[],
  cpsY: number[]
): BSpline2D {
  return {
    degree,
    knots: { tag: 'open', knots },
    controlPointsX: { tag: 'open', cps: cpsX },
    controlPointsY: { tag: 'open', cps: cpsY },
  }
}

/**
 * Create a periodic B-spline with uniform integer knots [0, 1, ..., n-1].
 * This creates n uniform spans with period n.
 * For curves with custom knot spacing, use mkPeriodicBSplineWithKnots.
 */
export function mkPeriodicBSpline(degree: number, cps: number[]): BSpline {
  const n = cps.length
  const baseKnots: number[] = []
  for (let i = 0; i < n; i++) {
    baseKnots.push(i)
  }
  return {
    degree,
    knots: { tag: 'periodic', baseKnots, period: n, offset: 0 },
    controlPoints: { tag: 'periodic', cps },
  }
}

/**
 * Create a periodic B-spline with custom knots.
 *
 * @param degree - Polynomial degree
 * @param knots - Array of n knot values (one per control point)
 * @param cps - Control point values
 * @param period - The period of the curve (default: 1.0 for knots in [0, 1))
 */
export function mkPeriodicBSplineWithKnots(
  degree: number,
  knots: number[],
  cps: number[],
  period: number = 1.0
): BSpline {
  if (knots.length !== cps.length) {
    throw new Error('Knots and control points must have same length')
  }
  return {
    degree,
    knots: { tag: 'periodic', baseKnots: [...knots], period, offset: 0 },
    controlPoints: { tag: 'periodic', cps },
  }
}

/**
 * Create a periodic 2D B-spline with uniform integer knots [0, 1, ..., n-1].
 * This creates n uniform spans with period n.
 * For curves with custom knot spacing, use mkPeriodicBSpline2DWithKnots.
 */
export function mkPeriodicBSpline2D(degree: number, cpsX: number[], cpsY: number[]): BSpline2D {
  if (cpsX.length !== cpsY.length) {
    throw new Error('Control point arrays must have same length')
  }
  const n = cpsX.length
  const baseKnots: number[] = []
  for (let i = 0; i < n; i++) {
    baseKnots.push(i)
  }
  return {
    degree,
    knots: { tag: 'periodic', baseKnots, period: n, offset: 0 },
    controlPointsX: { tag: 'periodic', cps: cpsX },
    controlPointsY: { tag: 'periodic', cps: cpsY },
  }
}

/**
 * Create a periodic 2D B-spline with custom knots.
 *
 * @param degree - Polynomial degree
 * @param knots - Array of n knot values (one per control point)
 * @param cpsX - X control point values
 * @param cpsY - Y control point values
 * @param period - The period of the curve (default: 1.0 for knots in [0, 1))
 */
export function mkPeriodicBSpline2DWithKnots(
  degree: number,
  knots: number[],
  cpsX: number[],
  cpsY: number[],
  period: number = 1.0
): BSpline2D {
  if (cpsX.length !== cpsY.length) {
    throw new Error('Control point arrays must have same length')
  }
  if (knots.length !== cpsX.length) {
    throw new Error('Knots and control points must have same length')
  }
  return {
    degree,
    knots: { tag: 'periodic', baseKnots: [...knots], period, offset: 0 },
    controlPointsX: { tag: 'periodic', cps: cpsX },
    controlPointsY: { tag: 'periodic', cps: cpsY },
  }
}

// =============================================================================
// Domain Functions
// =============================================================================

/**
 * Get the parameter domain [tMin, tMax] for a B-spline.
 */
export function bsplineDomain(bs: BSpline): [number, number] {
  switch (bs.knots.tag) {
    case 'open': {
      const p = bs.degree
      const knots = bs.knots.knots
      return [knots[p], knots[knots.length - p - 1]]
    }
    case 'periodic': {
      const offset = bs.knots.offset
      const period = bs.knots.period
      return [offset, offset + period]
    }
  }
}

/**
 * Get the parameter domain [tMin, tMax] for a 2D B-spline.
 */
export function bsplineDomain2D(bs: BSpline2D): [number, number] {
  switch (bs.knots.tag) {
    case 'open': {
      const p = bs.degree
      const knots = bs.knots.knots
      return [knots[p], knots[knots.length - p - 1]]
    }
    case 'periodic': {
      const offset = bs.knots.offset
      const period = bs.knots.period
      return [offset, offset + period]
    }
  }
}

/**
 * Get the period for a periodic B-spline.
 * Returns undefined for open B-splines.
 */
export function bsplinePeriod(bs: BSpline): number | undefined {
  switch (bs.knots.tag) {
    case 'open':
      return undefined
    case 'periodic':
      return bs.knots.period
  }
}

// =============================================================================
// Conversion from Sketcher's Curve type
// =============================================================================

import type { Curve } from '../types/curve'

/**
 * Convert a Sketcher Curve to BSpline2D format.
 * This is the bridge between the existing curve representation
 * and the optimizer's type system.
 */
export function curveToBS2D(curve: Curve): BSpline2D {
  const degree = curve.degree
  const knots = curve.knots

  // Extract X and Y coordinates from control points
  let cpsX: number[]
  let cpsY: number[]

  switch (curve.kind) {
    case 'bspline':
      cpsX = curve.controlPoints.map((p) => p.x)
      cpsY = curve.controlPoints.map((p) => p.y)
      break
    case 'rational':
      // For rational curves, we'd need to handle weights differently
      // For now, just use the x/y coordinates
      cpsX = curve.controlPoints.map((p) => p.x)
      cpsY = curve.controlPoints.map((p) => p.y)
      break
    case 'complex-rational':
      // Complex rational uses re/im as x/y
      cpsX = curve.controlPoints.map((p) => p.re)
      cpsY = curve.controlPoints.map((p) => p.im)
      break
  }

  if (curve.closed) {
    // Use actual knots for proper curve shape.
    // Different knots (e.g., junction knots vs uniform) produce different curve shapes
    // because the basis functions depend on the knot vector.
    // The period is 1.0 since UI knots are in [0, 1).
    return mkPeriodicBSpline2DWithKnots(degree, knots, cpsX, cpsY, 1.0)
  } else {
    return mkOpenBSpline2D(degree, knots, cpsX, cpsY)
  }
}

/**
 * Update a Sketcher Curve with new control points from optimization.
 * Returns a new Curve object (immutable update).
 */
export function updateCurveFromBS2D(curve: Curve, cpsX: number[], cpsY: number[]): Curve {
  switch (curve.kind) {
    case 'bspline':
      return {
        ...curve,
        controlPoints: cpsX.map((x, i) => ({ x, y: cpsY[i] })),
      }
    case 'rational':
      return {
        ...curve,
        controlPoints: cpsX.map((x, i) => ({
          x,
          y: cpsY[i],
          w: curve.controlPoints[i].w,
        })),
      }
    case 'complex-rational':
      return {
        ...curve,
        controlPoints: cpsX.map((re, i) => ({
          re,
          im: cpsY[i],
          w_re: curve.controlPoints[i].w_re,
          w_im: curve.controlPoints[i].w_im,
        })),
      }
  }
}

/**
 * Convert a rational Sketcher Curve to RationalBSpline2D format.
 * Control points are stored in homogeneous form: x*w, y*w, w.
 */
export function curveToRationalBS2D(curve: Curve): RationalBSpline2D {
  if (curve.kind !== 'rational') {
    throw new Error('curveToRationalBS2D requires a rational curve')
  }

  const degree = curve.degree
  const cpsX = curve.controlPoints.map((p) => p.x * p.w) // homogeneous x*w
  const cpsY = curve.controlPoints.map((p) => p.y * p.w) // homogeneous y*w
  const cpsW = curve.controlPoints.map((p) => p.w)

  if (curve.closed) {
    return {
      degree,
      knots: { tag: 'periodic', baseKnots: [...curve.knots], period: 1.0, offset: 0 },
      controlPointsX: { tag: 'periodic', cps: cpsX },
      controlPointsY: { tag: 'periodic', cps: cpsY },
      controlPointsW: { tag: 'periodic', cps: cpsW },
    }
  } else {
    return {
      degree,
      knots: { tag: 'open', knots: [...curve.knots] },
      controlPointsX: { tag: 'open', cps: cpsX },
      controlPointsY: { tag: 'open', cps: cpsY },
      controlPointsW: { tag: 'open', cps: cpsW },
    }
  }
}

/**
 * Update a rational Sketcher Curve from homogeneous optimization results.
 * Converts from homogeneous (x*w, y*w, w) back to Euclidean (x, y, w).
 */
export function updateCurveFromRationalBS2D(
  curve: Curve,
  cpsX: number[],
  cpsY: number[],
  cpsW: number[]
): Curve {
  if (curve.kind !== 'rational') {
    throw new Error('updateCurveFromRationalBS2D requires a rational curve')
  }
  return {
    ...curve,
    controlPoints: cpsX.map((xw, i) => ({
      x: xw / cpsW[i],
      y: cpsY[i] / cpsW[i],
      w: cpsW[i],
    })),
  }
}
