// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * 1D B-spline operations for PH curve u,v generating functions.
 *
 * These wrap the existing 2D B-spline utilities by encoding 1D CPs as Point2D (x=value, y=0).
 */

import type { Point2D, BSplineCurve } from '../types/curve'
import { insertKnot as insertKnot2D, elevateDegree as elevateDegree2D, removeKnot as removeKnot2D } from '../utils/bspline'

// ============================================================================
// 1D B-spline Operations
// ============================================================================

/**
 * Insert a knot into a 1D B-spline.
 * Returns new control points and knots.
 */
export function insertKnot1D(
  cps: number[],
  knots: number[],
  degree: number,
  t: number,
): { controlPoints: number[]; knots: number[] } {
  // Wrap as a BSplineCurve
  const curve: BSplineCurve = {
    id: '__tmp__',
    kind: 'bspline',
    degree,
    knots,
    controlPoints: cps.map(v => ({ x: v, y: 0 })),
    closed: false,
  }

  const result = insertKnot2D(curve, t)
  if (result.kind !== 'bspline') throw new Error('Unexpected curve kind')

  return {
    controlPoints: result.controlPoints.map(p => p.x),
    knots: result.knots,
  }
}

/**
 * Elevate the degree of a 1D B-spline by 1.
 * Returns new control points and knots.
 */
export function elevateDegree1D(
  cps: number[],
  knots: number[],
  degree: number,
): { controlPoints: number[]; knots: number[]; degree: number } {
  // Wrap as a BSplineCurve
  const curve: BSplineCurve = {
    id: '__tmp__',
    kind: 'bspline',
    degree,
    knots,
    controlPoints: cps.map(v => ({ x: v, y: 0 })),
    closed: false,
  }

  const result = elevateDegree2D(curve)
  if (result.kind !== 'bspline') throw new Error('Unexpected curve kind')

  return {
    controlPoints: result.controlPoints.map((p: Point2D) => p.x),
    knots: result.knots,
    degree: result.degree,
  }
}

/**
 * Remove a knot from a 1D B-spline.
 * Returns new control points and knots, or null if removal failed.
 */
export function removeKnot1D(
  cps: number[],
  knots: number[],
  degree: number,
  knotIndex: number,
  tolerance: number = Infinity,
): { controlPoints: number[]; knots: number[] } | null {
  // Wrap as a BSplineCurve
  const curve: BSplineCurve = {
    id: '__tmp__',
    kind: 'bspline',
    degree,
    knots,
    controlPoints: cps.map(v => ({ x: v, y: 0 })),
    closed: false,
  }

  const result = removeKnot2D(curve, knotIndex, tolerance)
  if (!result) return null
  if (result.kind !== 'bspline') throw new Error('Unexpected curve kind')

  return {
    controlPoints: result.controlPoints.map((p: Point2D) => p.x),
    knots: result.knots,
  }
}
