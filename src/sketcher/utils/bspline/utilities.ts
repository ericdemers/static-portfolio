// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// ============================================================================
// B-SPLINE UTILITIES
// ============================================================================
//
// Utility functions for B-splines:
// - Curve sampling and path generation
// - Curve creation and conversion
// - Knot vector generation
// ============================================================================

import type { Point2D, WeightedPoint2D, ComplexPoint, Curve, BSplineCurve, ComplexRationalBSplineCurve } from '../../types/curve'
import { evaluateCurve, isPeriodicRepresentation } from './core'
import { decomposeToBernstein, derivativeBD } from '../../optimizer/algebra'
import type { BernsteinDecomposition } from '../../optimizer/algebra'
import { periodicKnotAt } from './periodic'
import { removeKnot } from '../bspline'
import { cpow } from './periodic'
import { cmult } from '../complex'

// ============================================================================
// KNOT VECTOR GENERATION
// ============================================================================

/**
 * Generate uniform knot vector for a periodic curve.
 * Returns n knot values uniformly distributed in [0, 1).
 */
export function uniformPeriodicKnots(numControlPoints: number): number[] {
  const knots: number[] = []
  for (let i = 0; i < numControlPoints; i++) {
    knots.push(i / numControlPoints)
  }
  return knots
}

/**
 * Generate a knot vector for a closed curve with C^0 continuity at t=0.
 * This places coincident knots at 0, allowing a cusp at the junction.
 */
export function periodicKnotsWithJunction(numControlPoints: number, degree: number): number[] {
  const n = numControlPoints
  const knots: number[] = []

  const knotsAtZero = Math.min(degree, n)
  for (let i = 0; i < knotsAtZero; i++) {
    knots.push(0)
  }

  const remaining = n - knotsAtZero
  for (let i = 1; i <= remaining; i++) {
    knots.push(i / (remaining + 1))
  }

  return knots
}

/**
 * Derive periodic knots from an open curve's knot vector when closing.
 */
export function derivePeriodicKnotsFromOpen(
  openKnots: number[],
  degree: number,
  newNumControlPoints: number
): number[] {
  const n = newNumControlPoints
  const extracted = openKnots.slice(degree, -2)

  if (extracted.length === 0) {
    return periodicKnotsWithJunction(n, degree)
  }

  if (extracted.length === n) {
    const minK = extracted[0]
    const maxK = extracted[extracted.length - 1]
    const range = maxK - minK

    if (range < 1e-10) {
      return periodicKnotsWithJunction(n, degree)
    }

    return extracted.map(k => ((k - minK) / range) * 0.9999999)
  }

  return periodicKnotsWithJunction(n, degree)
}

/**
 * Generate uniform knot vector for given degree and number of control points.
 */
export function uniformKnots(degree: number, numControlPoints: number, closed: boolean = false): number[] {
  if (closed) {
    return uniformPeriodicKnots(numControlPoints)
  }

  // Clamped knot vector (open curve)
  const knots: number[] = []

  for (let i = 0; i <= degree; i++) {
    knots.push(0)
  }

  const numInternalKnots = numControlPoints - degree - 1
  for (let i = 1; i <= numInternalKnots; i++) {
    knots.push(i / (numInternalKnots + 1))
  }

  for (let i = 0; i <= degree; i++) {
    knots.push(1)
  }

  return knots
}

/**
 * Convert a closed curve from legacy extended knot representation to periodic representation.
 */
export function convertToPeriodicRepresentation(curve: Curve): Curve {
  if (!curve.closed) return curve
  if (isPeriodicRepresentation(curve)) return curve

  const n = curve.controlPoints.length
  const periodicKnots = uniformPeriodicKnots(n)

  return {
    ...curve,
    knots: periodicKnots,
  }
}

// ============================================================================
// CURVE SAMPLING AND PATH GENERATION
// ============================================================================

/**
 * Sample curve at multiple points for rendering (fixed resolution).
 */
export function sampleCurve(curve: Curve, numSamples: number = 100): Point2D[] {
  const points: Point2D[] = []

  if (curve.closed && isPeriodicRepresentation(curve)) {
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples
      points.push(evaluateCurve(curve, t))
    }
    return points
  }

  const knots = curve.knots
  const tMin = knots[curve.degree]
  const tMax = knots[knots.length - curve.degree - 1]

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * (tMax - tMin)
    points.push(evaluateCurve(curve, t))
  }

  return points
}

/**
 * Viewport bounds for clipping.
 */
export interface ViewportBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Adaptive curve sampling options.
 */
export interface AdaptiveSampleOptions {
  /** Maximum deviation from true curve (in world units). Default: 0.5 */
  tolerance?: number
  /** Minimum parameter step to prevent infinite recursion. Default: 1e-6 */
  minStep?: number
  /** Maximum recursion depth. Default: 12 */
  maxDepth?: number
  /** Viewport bounds for clipping. If provided, segments outside are skipped. */
  viewport?: ViewportBounds
}

/**
 * Check if a point is valid (finite and not NaN).
 */
function isValidPoint(p: Point2D): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

/**
 * Check if a point is inside the viewport (with margin).
 */
function isInViewport(p: Point2D, viewport: ViewportBounds, margin: number = 0): boolean {
  return (
    p.x >= viewport.minX - margin &&
    p.x <= viewport.maxX + margin &&
    p.y >= viewport.minY - margin &&
    p.y <= viewport.maxY + margin
  )
}

/**
 * Check if a line segment potentially intersects the viewport.
 */
function segmentMayIntersectViewport(
  p0: Point2D,
  p1: Point2D,
  viewport: ViewportBounds,
  margin: number = 0
): boolean {
  // If either point is in viewport, segment intersects
  if (isInViewport(p0, viewport, margin) || isInViewport(p1, viewport, margin)) {
    return true
  }

  // Check if segment bounding box intersects viewport
  const segMinX = Math.min(p0.x, p1.x)
  const segMaxX = Math.max(p0.x, p1.x)
  const segMinY = Math.min(p0.y, p1.y)
  const segMaxY = Math.max(p0.y, p1.y)

  return !(
    segMaxX < viewport.minX - margin ||
    segMinX > viewport.maxX + margin ||
    segMaxY < viewport.minY - margin ||
    segMinY > viewport.maxY + margin
  )
}

/**
 * Sample curve with adaptive resolution based on curvature.
 * Produces more points where the curve bends sharply, fewer where it's straight.
 * Handles curves that go to infinity (complex rational B-splines with poles).
 *
 * @param curve - The curve to sample
 * @param options - Adaptive sampling options
 * @returns Array of points approximating the curve within tolerance
 */
export function sampleCurveAdaptive(curve: Curve, options: AdaptiveSampleOptions = {}): Point2D[] {
  const {
    tolerance = 0.5,
    minStep = 1e-6,
    maxDepth = 12,
    viewport,
  } = options

  // Margin around viewport for smooth clipping (avoid popping)
  const viewportMargin = viewport ? Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) * 0.1 : 0

  // Determine parameter range
  let tMin: number
  let tMax: number

  if (curve.closed && isPeriodicRepresentation(curve)) {
    tMin = 0
    tMax = 1
  } else {
    tMin = curve.knots[curve.degree]
    tMax = curve.knots[curve.knots.length - curve.degree - 1]
  }

  // Collect path segments (breaks when curve goes through infinity or leaves viewport)
  const segments: Point2D[][] = []
  let currentSegment: Point2D[] = []

  function startNewSegment(): void {
    if (currentSegment.length > 0) {
      segments.push(currentSegment)
      currentSegment = []
    }
  }

  function addPoint(p: Point2D): void {
    currentSegment.push(p)
  }

  // Recursively subdivide
  function subdivide(
    t0: number,
    t1: number,
    p0: Point2D,
    p1: Point2D,
    depth: number
  ): void {
    const p0Valid = isValidPoint(p0)
    const p1Valid = isValidPoint(p1)

    // If both points are invalid, skip entirely
    if (!p0Valid && !p1Valid) {
      startNewSegment()
      return
    }

    // If viewport provided, check if segment is relevant
    if (viewport) {
      const p0InView = p0Valid && isInViewport(p0, viewport, viewportMargin)
      const p1InView = p1Valid && isInViewport(p1, viewport, viewportMargin)

      // If both points are valid but outside viewport, check if segment crosses it
      if (p0Valid && p1Valid && !p0InView && !p1InView) {
        if (!segmentMayIntersectViewport(p0, p1, viewport, viewportMargin)) {
          // Segment is entirely outside viewport - skip but may need to subdivide
          // to find parts that enter the viewport
          if (depth < maxDepth && t1 - t0 >= minStep) {
            const tMid = (t0 + t1) / 2
            const pMid = evaluateCurve(curve, tMid)
            if (isValidPoint(pMid) && isInViewport(pMid, viewport, viewportMargin)) {
              // Midpoint is in viewport - subdivide to capture it
              subdivide(t0, tMid, p0, pMid, depth + 1)
              subdivide(tMid, t1, pMid, p1, depth + 1)
              return
            }
          }
          // Skip this segment
          startNewSegment()
          return
        }
      }
    }

    // Handle invalid start point - try to find where curve becomes valid
    if (!p0Valid) {
      if (depth < maxDepth && t1 - t0 >= minStep) {
        const tMid = (t0 + t1) / 2
        const pMid = evaluateCurve(curve, tMid)
        subdivide(t0, tMid, p0, pMid, depth + 1)
        subdivide(tMid, t1, pMid, p1, depth + 1)
        return
      }
      startNewSegment()
      return
    }

    // Handle invalid end point - try to find where curve becomes invalid
    if (!p1Valid) {
      if (depth < maxDepth && t1 - t0 >= minStep) {
        const tMid = (t0 + t1) / 2
        const pMid = evaluateCurve(curve, tMid)
        subdivide(t0, tMid, p0, pMid, depth + 1)
        subdivide(tMid, t1, pMid, p1, depth + 1)
        return
      }
      startNewSegment()
      return
    }

    // Both points are valid - proceed with normal adaptive subdivision

    // Stop if parameter step is too small
    if (t1 - t0 < minStep || depth >= maxDepth) {
      if (currentSegment.length === 0) {
        addPoint(p0)
      }
      addPoint(p1)
      return
    }

    const tMid = (t0 + t1) / 2
    const pMid = evaluateCurve(curve, tMid)

    // If midpoint is invalid, subdivide to find the discontinuity
    if (!isValidPoint(pMid)) {
      subdivide(t0, tMid, p0, pMid, depth + 1)
      subdivide(tMid, t1, pMid, p1, depth + 1)
      return
    }

    // Compute flatness: distance from curve midpoint to line segment midpoint
    const lineMidX = (p0.x + p1.x) / 2
    const lineMidY = (p0.y + p1.y) / 2
    const error = Math.hypot(pMid.x - lineMidX, pMid.y - lineMidY)

    if (error > tolerance) {
      // Subdivide further
      subdivide(t0, tMid, p0, pMid, depth + 1)
      subdivide(tMid, t1, pMid, p1, depth + 1)
    } else {
      // Flat enough - add points
      if (currentSegment.length === 0) {
        addPoint(p0)
      }
      addPoint(p1)
    }
  }

  const pStart = evaluateCurve(curve, tMin)
  const pEnd = evaluateCurve(curve, tMax)
  subdivide(tMin, tMax, pStart, pEnd, 0)

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  // Flatten segments into a single array for backward compatibility
  // (The curvePathAdaptive function handles the SVG path properly)
  const points: Point2D[] = []
  for (const segment of segments) {
    points.push(...segment)
  }
  return points
}

/**
 * Sample curve with adaptive resolution, returning separate path segments.
 * Use this when you need to handle curves with discontinuities (poles).
 */
export function sampleCurveAdaptiveSegments(curve: Curve, options: AdaptiveSampleOptions = {}): Point2D[][] {
  const {
    tolerance = 0.5,
    minStep = 1e-6,
    maxDepth = 12,
    viewport,
  } = options

  // Margin around viewport for smooth clipping
  const viewportMargin = viewport ? Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) * 0.1 : 0

  // Determine parameter range
  let tMin: number
  let tMax: number

  if (curve.closed && isPeriodicRepresentation(curve)) {
    tMin = 0
    tMax = 1
  } else {
    tMin = curve.knots[curve.degree]
    tMax = curve.knots[curve.knots.length - curve.degree - 1]
  }

  const segments: Point2D[][] = []
  let currentSegment: Point2D[] = []

  function startNewSegment(): void {
    if (currentSegment.length > 0) {
      segments.push(currentSegment)
      currentSegment = []
    }
  }

  function addPoint(p: Point2D): void {
    currentSegment.push(p)
  }

  function subdivide(
    t0: number,
    t1: number,
    p0: Point2D,
    p1: Point2D,
    depth: number
  ): void {
    const p0Valid = isValidPoint(p0)
    const p1Valid = isValidPoint(p1)

    if (!p0Valid && !p1Valid) {
      startNewSegment()
      return
    }

    if (viewport) {
      const p0InView = p0Valid && isInViewport(p0, viewport, viewportMargin)
      const p1InView = p1Valid && isInViewport(p1, viewport, viewportMargin)

      if (p0Valid && p1Valid && !p0InView && !p1InView) {
        if (!segmentMayIntersectViewport(p0, p1, viewport, viewportMargin)) {
          if (depth < maxDepth && t1 - t0 >= minStep) {
            const tMid = (t0 + t1) / 2
            const pMid = evaluateCurve(curve, tMid)
            if (isValidPoint(pMid) && isInViewport(pMid, viewport, viewportMargin)) {
              subdivide(t0, tMid, p0, pMid, depth + 1)
              subdivide(tMid, t1, pMid, p1, depth + 1)
              return
            }
          }
          startNewSegment()
          return
        }
      }
    }

    if (!p0Valid) {
      if (depth < maxDepth && t1 - t0 >= minStep) {
        const tMid = (t0 + t1) / 2
        const pMid = evaluateCurve(curve, tMid)
        subdivide(t0, tMid, p0, pMid, depth + 1)
        subdivide(tMid, t1, pMid, p1, depth + 1)
        return
      }
      startNewSegment()
      return
    }

    if (!p1Valid) {
      if (depth < maxDepth && t1 - t0 >= minStep) {
        const tMid = (t0 + t1) / 2
        const pMid = evaluateCurve(curve, tMid)
        subdivide(t0, tMid, p0, pMid, depth + 1)
        subdivide(tMid, t1, pMid, p1, depth + 1)
        return
      }
      startNewSegment()
      return
    }

    if (t1 - t0 < minStep || depth >= maxDepth) {
      if (currentSegment.length === 0) {
        addPoint(p0)
      }
      addPoint(p1)
      return
    }

    const tMid = (t0 + t1) / 2
    const pMid = evaluateCurve(curve, tMid)

    if (!isValidPoint(pMid)) {
      subdivide(t0, tMid, p0, pMid, depth + 1)
      subdivide(tMid, t1, pMid, p1, depth + 1)
      return
    }

    const lineMidX = (p0.x + p1.x) / 2
    const lineMidY = (p0.y + p1.y) / 2
    const error = Math.hypot(pMid.x - lineMidX, pMid.y - lineMidY)

    if (error > tolerance) {
      subdivide(t0, tMid, p0, pMid, depth + 1)
      subdivide(tMid, t1, pMid, p1, depth + 1)
    } else {
      if (currentSegment.length === 0) {
        addPoint(p0)
      }
      addPoint(p1)
    }
  }

  const pStart = evaluateCurve(curve, tMin)
  const pEnd = evaluateCurve(curve, tMax)
  subdivide(tMin, tMax, pStart, pEnd, 0)

  if (currentSegment.length > 0) {
    segments.push(currentSegment)
  }

  return segments
}

/**
 * Create SVG path data from curve (fixed resolution).
 */
export function curvePath(curve: Curve, numSamples: number = 100): string {
  const points = sampleCurve(curve, numSamples)
  if (points.length === 0) return ''

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }

  if (curve.closed) {
    d += ' Z'
  }

  return d
}

/**
 * Create SVG path data from curve with adaptive resolution.
 * Handles curves with discontinuities (poles) by creating multiple path segments.
 */
export function curvePathAdaptive(curve: Curve, options: AdaptiveSampleOptions = {}): string {
  const segments = sampleCurveAdaptiveSegments(curve, options)
  if (segments.length === 0) return ''

  let d = ''

  for (const segment of segments) {
    if (segment.length === 0) continue

    d += `M ${segment[0].x} ${segment[0].y}`
    for (let i = 1; i < segment.length; i++) {
      d += ` L ${segment[i].x} ${segment[i].y}`
    }
  }

  // Only close if curve is closed and we have a single continuous segment
  if (curve.closed && segments.length === 1) {
    d += ' Z'
  }

  return d
}

// ============================================================================
// CURVE CREATION AND CONVERSION
// ============================================================================

/**
 * Generate unique ID for curves.
 */
export function generateCurveId(): string {
  return `curve-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a new B-spline curve from control points.
 */
export function createBSpline(controlPoints: Point2D[], degree: number = 3, closed: boolean = false): Curve {
  const actualDegree = Math.min(degree, controlPoints.length - 1)
  return {
    id: generateCurveId(),
    kind: 'bspline',
    degree: actualDegree,
    knots: uniformKnots(actualDegree, controlPoints.length, closed),
    controlPoints: [...controlPoints],
    closed,
  }
}

/**
 * Convert control points to weighted points (weight = 1).
 */
export function toWeightedPoints(points: Point2D[]): WeightedPoint2D[] {
  return points.map(p => ({ ...p, w: 1 }))
}

/**
 * Boehm knot insertion for a scalar (1D) B-spline.
 * Inserts knot value t once, returning new knots and CPs.
 */
function boehmInsert1D(
  knots: number[],
  cps: number[],
  degree: number,
  t: number,
): { knots: number[]; cps: number[] } {
  // Find span k: last index where knots[k] <= t and knots[k+1] > t
  let k = 0
  for (let i = 0; i < knots.length - 1; i++) {
    if (knots[i] <= t + 1e-14) k = i
  }

  const newKnots = [...knots.slice(0, k + 1), t, ...knots.slice(k + 1)]
  const newCPs: number[] = []

  for (let i = 0; i < cps.length + 1; i++) {
    if (i <= k - degree) {
      newCPs.push(cps[i])
    } else if (i >= k + 1) {
      newCPs.push(cps[i - 1])
    } else {
      const denom = knots[i + degree] - knots[i]
      const alpha = Math.abs(denom) > 1e-14 ? (t - knots[i]) / denom : 0
      const left = i > 0 ? cps[i - 1] : 0
      const right = i < cps.length ? cps[i] : 0
      newCPs.push((1 - alpha) * left + alpha * right)
    }
  }

  return { knots: newKnots, cps: newCPs }
}

/**
 * Clamp a non-clamped B-spline at [tMin, tMax] by inserting boundary knots
 * to multiplicity degree+1, then extract the sub-spline on [tMin, tMax].
 */
function clampAndTrim1D(
  knots: number[],
  cps: number[],
  degree: number,
  tMin: number,
  tMax: number,
): { knots: number[]; controlPoints: number[] } {
  let k = [...knots]
  let c = [...cps]

  // Clamp at tMin: insert until multiplicity = degree + 1
  let multMin = k.filter(v => Math.abs(v - tMin) < 1e-14).length
  while (multMin < degree + 1) {
    const result = boehmInsert1D(k, c, degree, tMin)
    k = result.knots
    c = result.cps
    multMin++
  }

  // Clamp at tMax: insert until multiplicity = degree + 1
  let multMax = k.filter(v => Math.abs(v - tMax) < 1e-14).length
  while (multMax < degree + 1) {
    const result = boehmInsert1D(k, c, degree, tMax)
    k = result.knots
    c = result.cps
    multMax++
  }

  // Extract sub-spline [tMin, tMax]
  const s = k.findIndex(v => Math.abs(v - tMin) < 1e-14)
  let e = 0
  for (let i = k.length - 1; i >= 0; i--) {
    if (Math.abs(k[i] - tMax) < 1e-14) { e = i; break }
  }

  return {
    knots: k.slice(s, e + 1),
    controlPoints: c.slice(s, e - degree),
  }
}

/**
 * Compute the minimum continuity across multiple BDs at a given breakpoint.
 * This ensures all components get the same knot structure when recomposed.
 */
function minContinuityAtBreakpoint(bds: BernsteinDecomposition[], breakpointIndex: number, tol: number = 1e-10): number {
  let minCont = Infinity
  for (const bd of bds) {
    let current: BernsteinDecomposition = bd
    let continuity = -1
    for (let k = 0; k < bd.degree; k++) {
      const leftSeg = current.controlPointsArray[breakpointIndex]
      const rightSeg = current.controlPointsArray[breakpointIndex + 1]
      const leftVal = leftSeg[leftSeg.length - 1]
      const rightVal = rightSeg[0]
      const scale = Math.max(Math.abs(leftVal), Math.abs(rightVal), 1)
      if (Math.abs(leftVal - rightVal) > tol * scale) break
      continuity = k
      current = derivativeBD(current)
    }
    minCont = Math.min(minCont, continuity)
  }
  return minCont === Infinity ? -1 : minCont
}

/**
 * Recompose multiple Bernstein decompositions jointly, using the minimum
 * continuity across all components at each breakpoint. This ensures all
 * output B-splines share the same knot vector.
 */
function jointRecomposeBDs(bds: BernsteinDecomposition[]): { knots: number[]; cpsArrays: number[][] } {
  const bd0 = bds[0]
  const p = bd0.degree

  if (bd0.numSpans === 0) return { knots: [], cpsArrays: bds.map(() => []) }

  if (bd0.numSpans === 1) {
    const knots: number[] = []
    for (let i = 0; i <= p; i++) knots.push(bd0.distinctKnots[0])
    for (let i = 0; i <= p; i++) knots.push(bd0.distinctKnots[1])
    return { knots, cpsArrays: bds.map(bd => [...bd.controlPointsArray[0]]) }
  }

  // Build piecewise Bézier form (full multiplicity = C^0)
  let knots: number[] = []
  for (let i = 0; i <= p; i++) knots.push(bd0.distinctKnots[0])
  for (let s = 1; s < bd0.distinctKnots.length - 1; s++) {
    for (let i = 0; i < p; i++) knots.push(bd0.distinctKnots[s])
  }
  for (let i = 0; i <= p; i++) knots.push(bd0.distinctKnots[bd0.distinctKnots.length - 1])

  const buildCPs = (bd: BernsteinDecomposition): number[] => {
    const cps = [...bd.controlPointsArray[0]]
    for (let s = 1; s < bd.numSpans; s++) {
      for (let i = 1; i <= p; i++) {
        cps.push(bd.controlPointsArray[s][i])
      }
    }
    return cps
  }

  let cpsArrays = bds.map(bd => buildCPs(bd))

  // At each interior breakpoint, compute minimum continuity across all BDs
  // and remove excess knots from ALL components consistently
  for (let s = bd0.numSpans - 2; s >= 0; s--) {
    const continuity = minContinuityAtBreakpoint(bds, s)
    if (continuity < 1) continue

    const breakpointValue = bd0.distinctKnots[s + 1]
    const knotIdx = knots.indexOf(breakpointValue)

    for (let r = 0; r < continuity; r++) {
      // Find the range of this knot value
      let lastIdx = knotIdx
      while (lastIdx + 1 < knots.length && knots[lastIdx + 1] === breakpointValue) lastIdx++
      const removeIdx = Math.floor((knotIdx + lastIdx) / 2)

      // Try to remove from all components
      const results = cpsArrays.map(cps => removeKnotFromAll(cps, knots, p, removeIdx, 1e-8))
      if (results.some(r => r === null)) break

      // All succeeded - apply the removal
      knots = results[0]!.knots
      cpsArrays = results.map(r => r!.controlPoints)
    }
  }

  return { knots, cpsArrays }
}

/**
 * Remove a single knot from a 1D B-spline (Tiller-Hanson algorithm).
 */
function removeKnotFromAll(
  P: number[], knots: number[], degree: number,
  knotIndex: number, tolerance: number
): { controlPoints: number[]; knots: number[] } | null {
  const n = P.length
  const u = knots[knotIndex]
  const ord = degree + 1

  let r = knotIndex
  while (r < knots.length - 1 && Math.abs(knots[r + 1] - u) < 1e-10) r++

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

  let i = first, j = last, ii = 1, jj = last - first + 1

  while (j - i > 0) {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    if (Math.abs(alphaI) < 1e-14) temp[ii] = P[i]
    else if (Math.abs(alphaI - 1) < 1e-14) temp[ii] = temp[ii - 1]
    else temp[ii] = (P[i] - (1 - alphaI) * temp[ii - 1]) / alphaI

    const alphaJ = (u - knots[j]) / (knots[j + ord] - knots[j])
    if (Math.abs(1 - alphaJ) < 1e-14) temp[jj] = P[j]
    else if (Math.abs(alphaJ) < 1e-14) temp[jj] = temp[jj + 1]
    else temp[jj] = (P[j] - alphaJ * temp[jj + 1]) / (1 - alphaJ)

    i++; ii++; j--; jj--
  }

  let removable = false
  if (j - i < 0) {
    const err = Math.abs(temp[ii - 1] - temp[jj + 1])
    if (err <= tolerance) removable = true
  } else {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    const val = alphaI * temp[jj + 1] + (1 - alphaI) * temp[ii - 1]
    if (Math.abs(val - P[i]) <= tolerance) removable = true
  }

  if (!removable) return null

  // Apply removal
  i = first; j = last; ii = 1; jj = last - first + 1
  const newP = [...P]
  while (j - i > 0) {
    newP[i] = temp[ii]; newP[j] = temp[jj]
    i++; ii++; j--; jj--
  }

  const newKnots = [...knots.slice(0, knotIndex), ...knots.slice(knotIndex + 1)]
  const newCPs = [...newP.slice(0, last), ...newP.slice(last + 1)]

  return { controlPoints: newCPs, knots: newKnots }
}

/**
 * Convert a complex-rational B-spline to an exact real rational B-spline.
 *
 * Uses the identity C(t) = N(t)·conj(D(t)) / |D(t)|² where N = w·z and D = w.
 * The degree doubles (e.g. 2 → 4) and the result exactly represents the curve.
 */
function complexRationalToRational(curve: ComplexRationalBSplineCurve): Curve {
  const p = curve.degree
  const n = curve.controlPoints.length
  const isPeriodic = curve.closed

  // Build the 4 scalar component arrays: nx, ny (numerator), dx, dy (denominator)
  // In homogeneous form: N = w·z = (w_re + i·w_im)(re + i·im)
  //   nx = w_re·re - w_im·im,  ny = w_im·re + w_re·im
  //   dx = w_re,  dy = w_im

  if (isPeriodic) {
    // Compute weight ratio for spiral wrapping
    const w0 = { re: curve.controlPoints[0].w_re, im: curve.controlPoints[0].w_im }
    let weightRatio = { re: 1, im: 0 }
    if (curve.wrapWeight) {
      const normSq = w0.re * w0.re + w0.im * w0.im
      if (normSq > 1e-20) {
        weightRatio = {
          re: (curve.wrapWeight.re * w0.re + curve.wrapWeight.im * w0.im) / normSq,
          im: (curve.wrapWeight.im * w0.re - curve.wrapWeight.re * w0.im) / normSq,
        }
      }
    }

    // Build extended open B-spline from periodic data
    // We extend by 2p on each side (instead of just p) so that Boehm knot insertion
    // at the boundaries [0, period] has enough room in the knot/CP arrays.
    const period = 1
    const ext = 2 * p  // extra extension on each side
    const extKnots: number[] = []
    for (let i = -ext; i <= n + ext; i++) {
      extKnots.push(periodicKnotAt(curve.knots as number[], i, period))
    }

    const extNx: number[] = []
    const extNy: number[] = []
    const extDx: number[] = []
    const extDy: number[] = []

    for (let i = -ext; i < n + ext - p; i++) {
      const r = ((i % n) + n) % n
      const q = Math.floor(i / n)
      const cp = curve.controlPoints[r]
      let w_re = cp.w_re
      let w_im = cp.w_im

      // Apply spiral: w[i] = w[r] * ratio^q
      if (q !== 0) {
        const ratioQ = cpow(weightRatio, q)
        const w = cmult({ re: w_re, im: w_im }, ratioQ)
        w_re = w.re
        w_im = w.im
      }

      extNx.push(w_re * cp.re - w_im * cp.im)
      extNy.push(w_im * cp.re + w_re * cp.im)
      extDx.push(w_re)
      extDy.push(w_im)
    }

    // Clamp and trim each scalar B-spline to [0, 1] (decomposeToBernstein requires clamped knots)
    const clNx = clampAndTrim1D(extKnots, extNx, p, 0, period)
    const clNy = clampAndTrim1D(extKnots, extNy, p, 0, period)
    const clDx = clampAndTrim1D(extKnots, extDx, p, 0, period)
    const clDy = clampAndTrim1D(extKnots, extDy, p, 0, period)

    // Decompose each clamped B-spline to Bernstein form
    const bdNx = decomposeToBernstein(clNx)
    const bdNy = decomposeToBernstein(clNy)
    const bdDx = decomposeToBernstein(clDx)
    const bdDy = decomposeToBernstein(clDy)

    // Compute products: X = nx·dx + ny·dy, Y = ny·dx - nx·dy, W = dx² + dy²
    const bdX = bdNx.multiply(bdDx).add(bdNy.multiply(bdDy))
    const bdY = bdNy.multiply(bdDx).subtract(bdNx.multiply(bdDy))
    const bdW = bdDx.multiply(bdDx).add(bdDy.multiply(bdDy))

    // Joint recomposition: remove knots consistently across X, Y, W
    // so all three share the exact same knot vector
    const { knots: clampedKnots, cpsArrays } = jointRecomposeBDs([bdX, bdY, bdW])
    const clampedCPsX = cpsArrays[0]
    const clampedCPsY = cpsArrays[1]
    const clampedCPsW = cpsArrays[2]
    const newDeg = clampedKnots.length - clampedCPsW.length - 1

    // Build the clamped rational control points
    const clampedCPs: WeightedPoint2D[] = []
    for (let i = 0; i < clampedCPsW.length; i++) {
      const w = clampedCPsW[i]
      clampedCPs.push({
        x: w !== 0 ? clampedCPsX[i] / w : 0,
        y: w !== 0 ? clampedCPsY[i] / w : 0,
        w,
      })
    }

    // Close the curve: remove first CP (endpoints coincide) and derive periodic knots
    // from the clamped interior structure, preserving knot multiplicities.
    const closedCPs = clampedCPs.slice(1)
    const nClosed = closedCPs.length

    // Extract interior knots from clamped form (between the boundary clamps)
    const interiorKnots: number[] = []
    for (let i = newDeg + 1; i < clampedKnots.length - newDeg - 1; i++) {
      interiorKnots.push(clampedKnots[i])
    }

    // Build periodic knots: C^0 junction at 0 + interior knots
    const numJunctionKnots = nClosed - interiorKnots.length
    const closedKnots: number[] = []
    for (let i = 0; i < numJunctionKnots; i++) closedKnots.push(0)
    for (const k of interiorKnots) closedKnots.push(k)

    let result: Curve = {
      id: curve.id,
      kind: 'rational',
      degree: newDeg,
      knots: closedKnots,
      controlPoints: closedCPs,
      closed: true,
    }

    // Reduce junction multiplicity by removing knots at 0 to increase continuity
    // The curve is naturally C^1 at the junction (from the original periodic structure),
    // so removing junction knots until multiplicity matches the interior is exact.
    const targetMult = interiorKnots.length > 0
      ? interiorKnots.filter(k => Math.abs(k - interiorKnots[0]) < 1e-10).length
      : 1
    while (true) {
      const junctionMult = result.knots.filter((k: number) => Math.abs(k) < 1e-10).length
      if (junctionMult <= targetMult) break
      const removed = removeKnot(result, 0)
      if (!removed) break
      result = removed
    }

    return result
  } else {
    // Non-periodic (open) curve: straightforward
    const nx: number[] = []
    const ny: number[] = []
    const dx: number[] = []
    const dy: number[] = []

    for (const cp of curve.controlPoints) {
      nx.push(cp.w_re * cp.re - cp.w_im * cp.im)
      ny.push(cp.w_im * cp.re + cp.w_re * cp.im)
      dx.push(cp.w_re)
      dy.push(cp.w_im)
    }

    const knots = [...curve.knots]
    const bdNx = decomposeToBernstein({ knots, controlPoints: nx })
    const bdNy = decomposeToBernstein({ knots, controlPoints: ny })
    const bdDx = decomposeToBernstein({ knots, controlPoints: dx })
    const bdDy = decomposeToBernstein({ knots, controlPoints: dy })

    const bdX = bdNx.multiply(bdDx).add(bdNy.multiply(bdDy))
    const bdY = bdNy.multiply(bdDx).subtract(bdNx.multiply(bdDy))
    const bdW = bdDx.multiply(bdDx).add(bdDy.multiply(bdDy))

    // Build piecewise Bézier form to ensure X, Y, W share the same knot vector
    const newDeg = bdW.controlPointsArray[0].length - 1
    const bpts = bdW.distinctKnots
    const openKnots: number[] = []
    for (let i = 0; i <= newDeg; i++) openKnots.push(bpts[0])
    for (let s = 1; s < bpts.length - 1; s++) {
      for (let i = 0; i < newDeg; i++) openKnots.push(bpts[s])
    }
    for (let i = 0; i <= newDeg; i++) openKnots.push(bpts[bpts.length - 1])

    const buildOpenCPs = (bd: { controlPointsArray: number[][] }): number[] => {
      const cps = [...bd.controlPointsArray[0]]
      for (let s = 1; s < bd.controlPointsArray.length; s++) {
        for (let i = 1; i <= newDeg; i++) {
          cps.push(bd.controlPointsArray[s][i])
        }
      }
      return cps
    }

    const cpsX = buildOpenCPs(bdX)
    const cpsY = buildOpenCPs(bdY)
    const cpsW = buildOpenCPs(bdW)

    const controlPoints: WeightedPoint2D[] = []
    for (let i = 0; i < cpsW.length; i++) {
      const w = cpsW[i]
      controlPoints.push({
        x: w !== 0 ? cpsX[i] / w : 0,
        y: w !== 0 ? cpsY[i] / w : 0,
        w,
      })
    }

    return {
      id: curve.id,
      kind: 'rational',
      degree: newDeg,
      knots: openKnots,
      controlPoints,
      closed: false,
    }
  }
}

/**
 * Convert B-spline to rational B-spline.
 */
export function toRationalBSpline(curve: Curve): Curve {
  if (curve.kind === 'rational') return curve
  if (curve.kind === 'complex-rational') {
    return complexRationalToRational(curve)
  }
  return {
    id: curve.id,
    kind: 'rational',
    degree: curve.degree,
    knots: [...curve.knots],
    controlPoints: toWeightedPoints(curve.controlPoints),
    closed: curve.closed,
  }
}

/**
 * Convert any curve to complex-rational B-spline.
 */
export function toComplexRationalBSpline(curve: Curve): ComplexRationalBSplineCurve {
  if (curve.kind === 'complex-rational') return curve

  if (curve.kind === 'rational') {
    const controlPoints: ComplexPoint[] = curve.controlPoints.map(p => ({
      re: p.x,
      im: p.y,
      w_re: p.w,
      w_im: 0,
    }))

    // Compute Farin point positions matching the rational curve's Farin points
    const n = curve.controlPoints.length
    const numEdges = curve.closed ? n : n - 1
    const farinPositions: Point2D[] = []
    for (let i = 0; i < numEdges; i++) {
      const p0 = curve.controlPoints[i]
      const p1 = curve.controlPoints[(i + 1) % n]
      let t: number
      if (curve.closed && curve.farinTValues && curve.farinTValues.length === numEdges) {
        t = curve.farinTValues[i]
      } else {
        const totalWeight = p0.w + p1.w
        t = totalWeight > 0 ? p1.w / totalWeight : 0.5
      }
      farinPositions.push({
        x: p0.x + t * (p1.x - p0.x),
        y: p0.y + t * (p1.y - p0.y),
      })
    }

    // Convert wrapWeight for closed curves
    const wrapWeight = curve.closed && curve.wrapWeight !== undefined
      ? { re: curve.wrapWeight, im: 0 }
      : undefined

    return {
      id: curve.id,
      kind: 'complex-rational',
      degree: curve.degree,
      knots: [...curve.knots],
      controlPoints,
      closed: curve.closed,
      farinPositions,
      ...(wrapWeight ? { wrapWeight } : {}),
    }
  }

  const controlPoints: ComplexPoint[] = curve.controlPoints.map(p => ({
    re: p.x,
    im: p.y,
    w_re: 1,
    w_im: 0,
  }))
  return {
    id: curve.id,
    kind: 'complex-rational',
    degree: curve.degree,
    knots: [...curve.knots],
    controlPoints,
    closed: curve.closed,
  }
}

/**
 * Convert any curve to polynomial B-spline (loses weight information).
 */
export function toBSpline(curve: Curve): BSplineCurve {
  if (curve.kind === 'bspline') return curve

  if (curve.kind === 'rational') {
    const controlPoints: Point2D[] = curve.controlPoints.map(p => ({
      x: p.x,
      y: p.y,
    }))
    return {
      id: curve.id,
      kind: 'bspline',
      degree: curve.degree,
      knots: [...curve.knots],
      controlPoints,
      closed: curve.closed,
    }
  }

  const controlPoints: Point2D[] = curve.controlPoints.map(p => ({
    x: p.re,
    y: p.im,
  }))
  return {
    id: curve.id,
    kind: 'bspline',
    degree: curve.degree,
    knots: [...curve.knots],
    controlPoints,
    closed: curve.closed,
  }
}

/**
 * Get control points as Point2D (for rendering).
 */
export function getControlPointsAsPoints(curve: Curve): Point2D[] {
  switch (curve.kind) {
    case 'bspline':
      return curve.controlPoints
    case 'rational':
      return curve.controlPoints.map(p => ({ x: p.x, y: p.y }))
    case 'complex-rational':
      return curve.controlPoints.map(p => ({ x: p.re, y: p.im }))
  }
}
