// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * PH (Pythagorean Hodograph) Curve Support
 *
 * A PH curve has hodograph r'(t) = (u²-v², 2uv) where u,v are B-splines.
 * The PH property is maintained by parameterization: variables are u,v control points
 * and the curve is always PH by construction.
 *
 * This module provides:
 * - computePHCurveFromUV: Build a B-spline curve from u,v generating functions
 * - createDefaultSpiral: Create a nice default PH quintic spiral
 */

import type { Point2D, WeightedPoint2D } from '../types/curve'
import { type Complex, cmult, cdiv, cnorm } from '../utils/complex'
import {
  decomposeToBernstein,
  integrateBD,
  recomposeBD,
} from './algebra'
import type { ABPHMetadata } from './abPHCurve'

// ============================================================================
// Types
// ============================================================================

export interface PHMetadata {
  kind: 'polynomial'
  uvDegree: number
  uControlPoints: number[]
  vControlPoints: number[]
  uvKnots: number[]
  origin: { x: number; y: number }
  /** Closed PH spline: the generator wraps with sign `wrapSign` (w(1)=s·w(0))
   *  and the curve satisfies ∮w²=0. Absent/undefined ⇒ an open PH spline.
   *  `seamContinuity` is the curve's continuity at the seam (0=C⁰ corner … 2=C²),
   *  i.e. the seam-junction multiplicity is degree − seamContinuity. */
  closed?: boolean
  wrapSign?: number
  seamContinuity?: number
}

export interface PHCurveResult {
  controlPoints: Point2D[]
  knots: number[]
  degree: number
  metadata: PHMetadata
}

export interface ComplexRationalPHMetadata {
  kind: 'complex-rational'
  sDegree: number
  sUControlPoints: number[]  // real part of S CPs
  sVControlPoints: number[]  // imaginary part of S CPs
  sKnots: number[]
  dDegree: number
  dReControlPoints: number[] // real part of D CPs
  dImControlPoints: number[] // imaginary part of D CPs
  dKnots: number[]
  origin: { x: number; y: number }
}

export interface ComplexRationalPHCurveResult {
  controlPoints: { re: number; im: number; w_re: number; w_im: number }[]
  knots: number[]
  degree: number
  metadata: ComplexRationalPHMetadata
}

// ============================================================================
// Core PH Curve Computation
// ============================================================================

/**
 * Compute a PH B-spline curve from u,v generating functions.
 *
 * Given u,v B-splines of degree n on the same knot vector:
 *   x'(t) = u(t)² - v(t)²
 *   y'(t) = 2·u(t)·v(t)
 *
 * The curve has degree 2n+1 (product doubles degree, integration adds 1).
 *
 * Steps:
 * 1. Decompose u,v to Bernstein form
 * 2. Compute x' = u²-v² and y' = 2uv via Bernstein multiplication
 * 3. Integrate x' and y' to get x and y
 * 4. Recompose to B-spline form
 */
/**
 * Per-interior-breakpoint CURVE continuity for a polynomial PH curve, aligned
 * with `recomposeBD`'s breakpoint iteration (the BD's interior distinct knots,
 * ascending). At a generator knot of multiplicity m the curve is
 * C^(uvDegree − m + 1). Per breakpoint, so a collided (higher-multiplicity)
 * generator knot only thickens its OWN curve knot, not every interior knot.
 */
export function curveBreakpointContinuities(distinctKnots: number[], uvKnots: number[], uvDegree: number): number[] {
  const conts: number[] = []
  for (let i = 1; i < distinctKnots.length - 1; i++) {
    const v = distinctKnots[i]
    let mult = 0
    for (const k of uvKnots) if (Math.abs(k - v) < 1e-9) mult++
    conts.push(Math.max(0, uvDegree - mult + 1))
  }
  return conts
}

export function computePHCurveFromUV(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  uvDegree: number,
  x0: number,
  y0: number,
): PHCurveResult {
  // Step 1: Decompose u and v to Bernstein form
  const uBD = decomposeToBernstein({ knots: uvKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: uvKnots, controlPoints: vCPs })

  // Step 2: Compute hodograph components
  // x' = u² - v²
  const u2 = uBD.multiply(uBD)
  const v2 = vBD.multiply(vBD)
  const xPrime = u2.subtract(v2)

  // y' = 2uv
  const uv = uBD.multiply(vBD)
  const yPrime = uv.multiplyByScalar(2)

  // Step 3: Integrate to get curve coordinates
  const xBD = integrateBD(xPrime, x0)
  const yBD = integrateBD(yPrime, y0)

  // Step 4: Recompose to B-spline form.
  // The curve's continuity is set PER interior breakpoint by that knot's
  // generator multiplicity m: curve is C^(uvDegree − m + 1) there (the product
  // u²,uv keeps the generator's C^(uvDegree−m); integration adds one). Using a
  // single global value (the minimum) would force EVERY knot to the lowest
  // continuity — so colliding two generator knots would wrongly thicken all
  // interior knots, not just the merged pair.
  const conts = uBD.numSpans > 1 ? curveBreakpointContinuities(xBD.distinctKnots, uvKnots, uvDegree) : undefined
  const xSpline = recomposeBD(xBD, conts)
  const ySpline = recomposeBD(yBD, conts)

  // Build Point2D control points
  const controlPoints: Point2D[] = []
  for (let i = 0; i < xSpline.controlPoints.length; i++) {
    controlPoints.push({ x: xSpline.controlPoints[i], y: ySpline.controlPoints[i] })
  }

  // Curve degree = 2*uvDegree + 1
  const degree = 2 * uvDegree + 1

  return {
    controlPoints,
    knots: xSpline.knots,
    degree,
    metadata: {
      kind: 'polynomial',
      uvDegree,
      uControlPoints: [...uCPs],
      vControlPoints: [...vCPs],
      uvKnots: [...uvKnots],
      origin: { x: x0, y: y0 },
    },
  }
}

// ============================================================================
// Default Spiral
// ============================================================================

/**
 * Create a default PH quintic spiral centered at (centerX, centerY).
 *
 * Uses complex representation: w(t) = u(t) + i·v(t) is a quadratic Bézier.
 * The hodograph is h(t) = w(t)², and the curve is the integral of h.
 *
 * Complex control points for a nice spiral:
 *   w₀ = 1                    (angle 0)
 *   w₁ = e^{iπ/4}            (angle π/4)
 *   w₂ = e^{iπ/2} = i        (angle π/2)
 *
 * The quintic hodograph CPs (in complex form) are:
 *   h₀ = w₀²
 *   h₁ = w₀·w₁
 *   h₂ = (2w₁² + w₀·w₂) / 3
 *   h₃ = w₁·w₂
 *   h₄ = w₂²
 *
 * Then integrate: p_{i+1} = p_i + (1/5)·h_i
 */
export function createDefaultSpiral(centerX: number, centerY: number): PHCurveResult {
  // Complex control points for the quadratic generating function w(t)
  const w0: Complex = { re: 1, im: 0 }                         // angle 0
  const w1: Complex = { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }  // angle π/4
  const w2: Complex = { re: 0, im: 1 }                         // angle π/2

  // Compute quintic hodograph CPs: h = w²
  const h0 = cmult(w0, w0)
  const h1 = cmult(w0, w1)
  const w1sq = cmult(w1, w1)
  const w0w2 = cmult(w0, w2)
  const h2: Complex = {
    re: (2 * w1sq.re + w0w2.re) / 3,
    im: (2 * w1sq.im + w0w2.im) / 3,
  }
  const h3 = cmult(w1, w2)
  const h4 = cmult(w2, w2)

  const hCPs = [h0, h1, h2, h3, h4]

  // Integrate: p_{k+1} = p_k + (1/5) * h_k
  // Curve parameter on [0, 1], degree 5, so scale = 1/5
  const scale = 1.0 / 5.0
  const points: Point2D[] = [{ x: centerX, y: centerY }]

  let px = centerX
  let py = centerY
  for (const h of hCPs) {
    px += scale * h.re
    py += scale * h.im
    points.push({ x: px, y: py })
  }

  // Extract u,v CPs from w0, w1, w2
  const uCPs = [w0.re, w1.re, w2.re]
  const vCPs = [w0.im, w1.im, w2.im]
  const uvKnots = [0, 0, 0, 1, 1, 1]
  const uvDegree = 2

  return {
    controlPoints: points,
    knots: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    degree: 5,
    metadata: {
      kind: 'polynomial',
      uvDegree,
      uControlPoints: uCPs,
      vControlPoints: vCPs,
      uvKnots,
      origin: { x: centerX, y: centerY },
    },
  }
}

// ============================================================================
// Two-Point Spiral
// ============================================================================

/**
 * Create a PH quintic spiral stretching from (startX, startY) to (endX, endY).
 *
 * Strategy: compute the default spiral at the origin, then find a complex
 * scale factor `c` such that multiplying all w CPs by `c` rotates and scales
 * the spiral so its chord matches the desired chord.
 *
 * Since the hodograph h = w², scaling w by c scales h by c². After integration,
 * the curve CPs scale by c² as well (plus translation for the origin).
 * So: c = sqrt(desired / defaultChord) as a complex number.
 *
 * Falls back to a small default spiral if the two points are nearly coincident.
 */
export function createSpiralFromTwoPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): PHCurveResult {
  const DEGENERATE_THRESHOLD = 1e-10

  // Desired chord as a complex number
  const desired: Complex = { re: endX - startX, im: endY - startY }
  const desiredLen = cnorm(desired)

  // Degenerate case: start ≈ end → small default spiral
  if (desiredLen < DEGENERATE_THRESHOLD) {
    return createDefaultSpiral(startX, startY)
  }

  // Default spiral w CPs
  const w0: Complex = { re: 1, im: 0 }
  const w1: Complex = { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }
  const w2: Complex = { re: 0, im: 1 }

  // Compute the default spiral's chord (last CP - first CP)
  // The default spiral starts at (0,0), so the chord is just the last CP.
  const defaultSpiral = createDefaultSpiral(0, 0)
  const lastCP = defaultSpiral.controlPoints[defaultSpiral.controlPoints.length - 1]
  const defaultChord: Complex = { re: lastCP.x, im: lastCP.y }

  // Complex scale factor: c² = desired / defaultChord, so c = sqrt(desired / defaultChord)
  const ratio = cdiv(desired, defaultChord)

  // Complex square root: sqrt(r * e^{iθ}) = r^{1/2} * e^{iθ/2}
  const r = cnorm(ratio)
  const theta = Math.atan2(ratio.im, ratio.re)
  const c: Complex = {
    re: Math.sqrt(r) * Math.cos(theta / 2),
    im: Math.sqrt(r) * Math.sin(theta / 2),
  }

  // Scale w CPs by c
  const w0s = cmult(c, w0)
  const w1s = cmult(c, w1)
  const w2s = cmult(c, w2)

  // Extract u,v CPs from scaled w
  const uCPs = [w0s.re, w1s.re, w2s.re]
  const vCPs = [w0s.im, w1s.im, w2s.im]
  const uvKnots = [0, 0, 0, 1, 1, 1]
  const uvDegree = 2

  // Build the curve using computePHCurveFromUV with the start point as origin
  return computePHCurveFromUV(uCPs, vCPs, uvKnots, uvDegree, startX, startY)
}

// ============================================================================
// PH Curve Offset
// ============================================================================

/**
 * Evaluate the left unit normal of a PH curve at parameter t.
 *
 * For w(t) = u(t) + i·v(t), the hodograph is h(t) = w(t)²:
 *   x'(t) = u² - v²
 *   y'(t) = 2uv
 *
 * The parametric speed is σ(t) = u² + v².
 * The left unit normal is (-y'/σ, x'/σ) = (-2uv/σ, (u²-v²)/σ).
 */
export function evaluatePHNormal(
  metadata: PHMetadata,
  t: number,
): { nx: number; ny: number } {
  const uBD = decomposeToBernstein({
    knots: metadata.uvKnots,
    controlPoints: metadata.uControlPoints,
  })
  const vBD = decomposeToBernstein({
    knots: metadata.uvKnots,
    controlPoints: metadata.vControlPoints,
  })

  const uVal = uBD.evaluate(t)
  const vVal = vBD.evaluate(t)

  const sigma = uVal * uVal + vVal * vVal
  if (sigma < 1e-14) return { nx: 0, ny: 0 }

  return {
    nx: -2 * uVal * vVal / sigma,
    ny: (uVal * uVal - vVal * vVal) / sigma,
  }
}

/**
 * Find the parameter t of the nearest point on a PH curve to a given point.
 *
 * Uses uniform sampling for simplicity (no Newton refinement needed for
 * interactive drag start — coarse t is fine).
 */
export function findNearestPointParam(
  curveResult: PHCurveResult,
  point: Point2D,
  numSamples: number = 200,
): number {
  const xBD = decomposeToBernstein({
    knots: curveResult.knots,
    controlPoints: curveResult.controlPoints.map((p) => p.x),
  })
  const yBD = decomposeToBernstein({
    knots: curveResult.knots,
    controlPoints: curveResult.controlPoints.map((p) => p.y),
  })

  const degree = curveResult.degree
  const knots = curveResult.knots
  const tMin = knots[degree]
  const tMax = knots[knots.length - degree - 1]

  let bestT = tMin
  let bestDist2 = Infinity

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * (tMax - tMin)
    const cx = xBD.evaluate(t)
    const cy = yBD.evaluate(t)
    const dx = cx - point.x
    const dy = cy - point.y
    const dist2 = dx * dx + dy * dy
    if (dist2 < bestDist2) {
      bestDist2 = dist2
      bestT = t
    }
  }

  return bestT
}

/**
 * Compute the exact rational B-spline offset of a PH curve at distance d.
 *
 * For a PH curve with generating function w(t) = u(t) + i·v(t):
 *   σ(t) = u² + v²        (parametric speed)
 *   x'(t) = u² - v²
 *   y'(t) = 2uv
 *
 * The offset at distance d in rational homogeneous form:
 *   NX(t) = x(t)·σ(t) - d·y'(t)   (numerator for x)
 *   NY(t) = y(t)·σ(t) + d·x'(t)   (numerator for y)
 *   W(t)  = σ(t)                    (weight)
 *
 * W is degree-elevated to match NX/NY via BD.multiplyByScalar(0).add(σ_BD).
 */
export function computePHOffset(
  metadata: PHMetadata,
  curveResult: PHCurveResult,
  distance: number,
): { controlPoints: WeightedPoint2D[]; knots: number[]; degree: number } {
  // Step 1: Decompose u, v
  const uBD = decomposeToBernstein({
    knots: metadata.uvKnots,
    controlPoints: metadata.uControlPoints,
  })
  const vBD = decomposeToBernstein({
    knots: metadata.uvKnots,
    controlPoints: metadata.vControlPoints,
  })

  // Step 2: σ_BD = u² + v²
  const sigmaBD = uBD.multiply(uBD).add(vBD.multiply(vBD))

  // Step 3: Hodograph components in BD
  const xPrimeBD = uBD.multiply(uBD).subtract(vBD.multiply(vBD)) // u² - v²
  const yPrimeBD = uBD.multiply(vBD).multiplyByScalar(2) // 2uv

  // Step 4: Decompose curve x,y
  const xBD = decomposeToBernstein({
    knots: curveResult.knots,
    controlPoints: curveResult.controlPoints.map((p) => p.x),
  })
  const yBD = decomposeToBernstein({
    knots: curveResult.knots,
    controlPoints: curveResult.controlPoints.map((p) => p.y),
  })

  // Step 5: Numerators
  // NX = x·σ - d·y'
  const nxBD = xBD.multiply(sigmaBD).subtract(yPrimeBD.multiplyByScalar(distance))
  // NY = y·σ + d·x'
  const nyBD = yBD.multiply(sigmaBD).add(xPrimeBD.multiplyByScalar(distance))

  // Step 6: Degree-elevate σ to match NX/NY degree
  // Use the trick: nxBD.multiplyByScalar(0).add(sigmaBD) auto-elevates via add()
  const wBD = nxBD.multiplyByScalar(0).add(sigmaBD)

  // Step 7: Recompose to B-spline form
  const nxSpline = recomposeBD(nxBD)
  const nySpline = recomposeBD(nyBD)
  const wSpline = recomposeBD(wBD)

  // Step 8: Form weighted control points
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

// ============================================================================
// AB PH → Polynomial PH Conversion
// ============================================================================

/**
 * Convert ABPHMetadata to PHMetadata for offset computation.
 *
 * The S generating function in ABPHMetadata (sReCPs/sImCPs) plays the same role
 * as u/v in polynomial PH: w(t) = u(t) + i·v(t) = S(t).
 * The origin is taken from the first control point position: A₀/B₀.
 */
export function abMetadataToPolynomialPH(meta: ABPHMetadata): PHMetadata {
  // Origin = first control point position = A₀ / B₀
  const b0Norm2 = meta.bReCPs[0] * meta.bReCPs[0] + meta.bImCPs[0] * meta.bImCPs[0]
  let originX = 0
  let originY = 0
  if (b0Norm2 > 1e-20) {
    originX = (meta.aReCPs[0] * meta.bReCPs[0] + meta.aImCPs[0] * meta.bImCPs[0]) / b0Norm2
    originY = (meta.aImCPs[0] * meta.bReCPs[0] - meta.aReCPs[0] * meta.bImCPs[0]) / b0Norm2
  }

  return {
    kind: 'polynomial',
    uvDegree: meta.degree - 1,
    uControlPoints: [...meta.sReCPs],
    vControlPoints: [...meta.sImCPs],
    uvKnots: [...meta.sKnots],
    origin: { x: originX, y: originY },
  }
}
