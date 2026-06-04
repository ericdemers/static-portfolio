// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Real Rational PH Curve Support
 *
 * A real rational PH curve uses the (A, B, S) parameterization with B real-only:
 *   z(t) = A(t)/B(t) where A is complex, B is real, S is complex
 *   PH condition: A'B - AB' = S²
 *
 * Advantages over complex-rational PH:
 *   - Fewer variables (no bIm control points)
 *   - Simpler constraints (B real simplifies Wronskian)
 *   - Offset produces real rational curves (real weights)
 *   - Normal direction same as polynomial PH (real B² doesn't rotate tangent)
 */

import type { ComplexPoint, Point2D, WeightedPoint2D } from '../types/curve'
import { decomposeToBernstein, recomposeBD } from './algebra'
import {
  type ABPHMetadata,
  computeABPHCurve,
} from './abPHCurve'
import { createABPHFromTwoPoints } from './abPHCurve'

// ============================================================================
// Types
// ============================================================================

export interface RealRationalPHMetadata {
  kind: 'real-rational'
  degree: number        // degree p of A, B
  aReCPs: number[]      // real(A) numerator CPs
  aImCPs: number[]      // imag(A) numerator CPs
  bCPs: number[]        // B denominator CPs (real only!)
  sReCPs: number[]      // real(S) generating function CPs
  sImCPs: number[]      // imag(S) generating function CPs
  knots: number[]       // shared knot vector for A, B
  sKnots: number[]      // knot vector for S (degree p-1)
}

export interface RealRationalPHCurveResult {
  controlPoints: WeightedPoint2D[]
  knots: number[]
  degree: number
  metadata: RealRationalPHMetadata
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/** Convert RealRationalPHMetadata → ABPHMetadata for reusing AB functions. */
export function toABMetadata(meta: RealRationalPHMetadata): ABPHMetadata {
  return {
    kind: 'ab-complex-rational',
    degree: meta.degree,
    aReCPs: meta.aReCPs,
    aImCPs: meta.aImCPs,
    bReCPs: meta.bCPs,
    bImCPs: meta.bCPs.map(() => 0),
    sReCPs: meta.sReCPs,
    sImCPs: meta.sImCPs,
    knots: meta.knots,
    sKnots: meta.sKnots,
  }
}

/** Convert ComplexPoint (with w_im≈0) to WeightedPoint2D. */
function complexToWeighted(cp: ComplexPoint): WeightedPoint2D {
  return { x: cp.re, y: cp.im, w: cp.w_re }
}

// ============================================================================
// Creation
// ============================================================================

/**
 * Create a real rational PH curve from two points.
 * Bootstraps via AB pipeline (which starts with D=1+0i, i.e. real B).
 */
export function createRealRationalPHFromTwoPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): RealRationalPHCurveResult {
  const abResult = createABPHFromTwoPoints(startX, startY, endX, endY)
  const meta = abResult.metadata

  const rrMeta: RealRationalPHMetadata = {
    kind: 'real-rational',
    degree: meta.degree,
    aReCPs: meta.aReCPs,
    aImCPs: meta.aImCPs,
    bCPs: meta.bReCPs,  // bIm is already all zeros from bootstrap
    sReCPs: meta.sReCPs,
    sImCPs: meta.sImCPs,
    knots: meta.knots,
    sKnots: meta.sKnots,
  }

  return {
    controlPoints: abResult.controlPoints.map(complexToWeighted),
    knots: abResult.knots,
    degree: abResult.degree,
    metadata: rrMeta,
  }
}

// ============================================================================
// Forward Pipeline
// ============================================================================

/**
 * Compute curve control points from real-rational PH metadata.
 * Delegates to AB pipeline then converts to WeightedPoint2D.
 */
export function computeRealRationalPHCurve(
  metadata: RealRationalPHMetadata,
): RealRationalPHCurveResult {
  const abResult = computeABPHCurve(toABMetadata(metadata))
  return {
    controlPoints: abResult.controlPoints.map(complexToWeighted),
    knots: abResult.knots,
    degree: abResult.degree,
    metadata: { ...metadata },
  }
}

// ============================================================================
// Evaluation and Normal
// ============================================================================

/**
 * Evaluate the real rational PH curve at parameter t.
 * z(t) = A(t)/B(t) with real B.
 */
export function evaluateRealRationalPHCurveAtParam(
  meta: RealRationalPHMetadata,
  t: number,
): Point2D {
  const aReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bCPs })

  const aRe = aReBD.evaluate(t)
  const aIm = aImBD.evaluate(t)
  const b = bBD.evaluate(t)

  if (Math.abs(b) < 1e-20) return { x: 0, y: 0 }

  return { x: aRe / b, y: aIm / b }
}

/**
 * Evaluate the left unit normal of a real rational PH curve at parameter t.
 *
 * Since B is real, B² is real positive, so the tangent direction of
 * z'(t) = S²/B² is the same as S². This is identical to the polynomial
 * PH normal formula using S as the generating function.
 */
export function evaluateRealRationalPHNormal(
  meta: RealRationalPHMetadata,
  t: number,
): { nx: number; ny: number } {
  const uBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const vBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })

  const u = uBD.evaluate(t)
  const v = vBD.evaluate(t)

  const sigma = u * u + v * v
  if (sigma < 1e-14) return { nx: 0, ny: 0 }

  // Left unit normal from S² direction (same as polynomial PH)
  return {
    nx: -2 * u * v / sigma,
    ny: (u * u - v * v) / sigma,
  }
}

/**
 * Find the parameter t of the nearest point on a real rational PH curve.
 */
export function findNearestPointParamRealRational(
  meta: RealRationalPHMetadata,
  point: Point2D,
  numSamples: number = 200,
): number {
  const degree = meta.degree
  const knots = meta.knots
  const tMin = knots[degree]
  const tMax = knots[knots.length - degree - 1]

  let bestT = tMin
  let bestDist2 = Infinity

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * (tMax - tMin)
    const pt = evaluateRealRationalPHCurveAtParam(meta, t)
    const dx = pt.x - point.x
    const dy = pt.y - point.y
    const dist2 = dx * dx + dy * dy
    if (dist2 < bestDist2) {
      bestDist2 = dist2
      bestT = t
    }
  }

  return bestT
}

// ============================================================================
// Offset
// ============================================================================

/**
 * Compute the exact rational offset of a real rational PH curve at distance d.
 *
 * Since B is real, the offset formula simplifies to real weights:
 *   X_offset = aRe·σ - d·(2uv)·B
 *   Y_offset = aIm·σ + d·(u²-v²)·B
 *   W_offset = B·σ
 *
 * where σ = u² + v². Result is a real rational curve (WeightedPoint2D).
 */
export function computeRealRationalPHOffset(
  meta: RealRationalPHMetadata,
  distance: number,
): { controlPoints: WeightedPoint2D[]; knots: number[]; degree: number } {
  // Decompose S components
  const uBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const vBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })

  // σ = u² + v²
  const sigmaBD = uBD.multiply(uBD).add(vBD.multiply(vBD))

  // S² components
  const xPrimeBD = uBD.multiply(uBD).subtract(vBD.multiply(vBD)) // u² - v²
  const yPrimeBD = uBD.multiply(vBD).multiplyByScalar(2)          // 2uv

  // Decompose A and B
  const aReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bCPs })

  // X_offset = aRe·σ - d·(2uv)·B
  const nxBD = aReBD.multiply(sigmaBD).subtract(
    yPrimeBD.multiply(bBD).multiplyByScalar(distance)
  )

  // Y_offset = aIm·σ + d·(u²-v²)·B
  const nyBD = aImBD.multiply(sigmaBD).add(
    xPrimeBD.multiply(bBD).multiplyByScalar(distance)
  )

  // W_offset = B·σ (degree-elevated to match numerator)
  const wBD = nxBD.multiplyByScalar(0).add(bBD.multiply(sigmaBD))

  // Recompose to B-spline form
  const nxSpline = recomposeBD(nxBD)
  const nySpline = recomposeBD(nyBD)
  const wSpline = recomposeBD(wBD)

  // Form WeightedPoint2D control points
  const controlPoints: WeightedPoint2D[] = []
  for (let i = 0; i < nxSpline.controlPoints.length; i++) {
    const w = wSpline.controlPoints[i]
    controlPoints.push({
      x: nxSpline.controlPoints[i] / w,
      y: nySpline.controlPoints[i] / w,
      w,
    })
  }

  const degree = nxSpline.knots.length - nxSpline.controlPoints.length - 1

  return { controlPoints, knots: nxSpline.knots, degree }
}
