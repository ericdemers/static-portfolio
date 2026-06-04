// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * (A, B, S) Parameterization for Complex Rational PH Curves
 *
 * z(t) = A(t)/B(t) is the complex-rational curve (A numerator, B denominator/weights)
 * Full PH condition: A'B - AB' = S² (the Wronskian is a perfect square)
 * This ensures |z'(t)| = |S|²/|B|² which is rational — the actual PH property.
 *
 * Degree analysis: A, B degree p → W = A'B - AB' has effective degree 2p-2
 *   → S has degree p-1 → S² has degree 2(p-1) = 2p-2 ✓
 */

import type { ComplexPoint, Point2D } from '../types/curve'
import type { MobiusTransform } from '../utils/transforms'
import { cadd, cmult, csub } from '../utils/complex'
import { decomposeToBernstein, recomposeBD } from './algebra'
import {
  type ComplexBD,
  type SimpleBSpline,
  complexBDMul,
  complexBDSub,
  simpleDifferentiate,
} from './complexAlgebra'
import { createComplexRationalPHFromTwoPoints } from './complexRationalPHCurve'

// ============================================================================
// Types
// ============================================================================

export interface ABPHMetadata {
  kind: 'ab-complex-rational'
  degree: number          // degree p of A, B
  aReCPs: number[]        // real(A) numerator CPs
  aImCPs: number[]        // imag(A) numerator CPs
  bReCPs: number[]        // real(B) denominator CPs
  bImCPs: number[]        // imag(B) denominator CPs
  sReCPs: number[]        // real(S) generating function CPs
  sImCPs: number[]        // imag(S) generating function CPs
  knots: number[]         // shared knot vector for A, B (degree = this.degree)
  sKnots: number[]        // knot vector for S (degree = sKnots.length - sReCPs.length - 1)
}

export interface ABPHCurveResult {
  controlPoints: ComplexPoint[]
  knots: number[]
  degree: number
  metadata: ABPHMetadata
}

// ============================================================================
// Forward Pipeline: (A, B, S) → Curve CPs
// ============================================================================

/**
 * Compute curve control points from (A, B, S) metadata.
 * position_i = A_i / B_i, weight_i = B_i
 */
export function computeABPHCurve(metadata: ABPHMetadata): ABPHCurveResult {
  const { aReCPs, aImCPs, bReCPs, bImCPs, knots, degree } = metadata
  const n = aReCPs.length

  const controlPoints: ComplexPoint[] = []
  for (let i = 0; i < n; i++) {
    const bNorm2 = bReCPs[i] * bReCPs[i] + bImCPs[i] * bImCPs[i]
    if (bNorm2 < 1e-20) {
      // Degenerate weight, use previous or zero
      controlPoints.push({ re: 0, im: 0, w_re: bReCPs[i], w_im: bImCPs[i] })
      continue
    }
    // P = A / B = A * conj(B) / |B|²
    const re = (aReCPs[i] * bReCPs[i] + aImCPs[i] * bImCPs[i]) / bNorm2
    const im = (aImCPs[i] * bReCPs[i] - aReCPs[i] * bImCPs[i]) / bNorm2
    controlPoints.push({ re, im, w_re: bReCPs[i], w_im: bImCPs[i] })
  }

  return {
    controlPoints,
    knots: [...knots],
    degree,
    metadata: { ...metadata },
  }
}

// ============================================================================
// PH Residual Computation
// ============================================================================

/**
 * Compute PH residual R = A'B - AB' - S² in Bernstein form.
 * Returns the Bernstein coefficients of the real and imaginary parts.
 * If the PH condition holds, all coefficients should be zero.
 */
export function computePHResidualCoeffs(metadata: ABPHMetadata): { re: number[]; im: number[] } {
  const { aReCPs, aImCPs, bReCPs, bImCPs, sReCPs, sImCPs, knots, sKnots } = metadata

  // Build SimpleBSplines for A and B
  const aRe: SimpleBSpline = { knots: [...knots], controlPoints: [...aReCPs] }
  const aIm: SimpleBSpline = { knots: [...knots], controlPoints: [...aImCPs] }
  const bRe: SimpleBSpline = { knots: [...knots], controlPoints: [...bReCPs] }
  const bIm: SimpleBSpline = { knots: [...knots], controlPoints: [...bImCPs] }

  // Differentiate A and B
  const aPrimeRe = simpleDifferentiate(aRe)
  const aPrimeIm = simpleDifferentiate(aIm)
  const bPrimeRe = simpleDifferentiate(bRe)
  const bPrimeIm = simpleDifferentiate(bIm)

  // Decompose all to Bernstein form
  const ABD = decomposeToBernstein(aRe)
  const AIBD = decomposeToBernstein(aIm)
  const BBD = decomposeToBernstein(bRe)
  const BIBD = decomposeToBernstein(bIm)
  const APBD = decomposeToBernstein(aPrimeRe)
  const APIBD = decomposeToBernstein(aPrimeIm)
  const BPBD = decomposeToBernstein(bPrimeRe)
  const BPIBD = decomposeToBernstein(bPrimeIm)

  const A: ComplexBD = { re: ABD, im: AIBD }
  const B: ComplexBD = { re: BBD, im: BIBD }
  const Ap: ComplexBD = { re: APBD, im: APIBD }
  const Bp: ComplexBD = { re: BPBD, im: BPIBD }

  // Build S as ComplexBD
  const sReBs: SimpleBSpline = { knots: [...sKnots], controlPoints: [...sReCPs] }
  const sImBs: SimpleBSpline = { knots: [...sKnots], controlPoints: [...sImCPs] }
  const SBD: ComplexBD = { re: decomposeToBernstein(sReBs), im: decomposeToBernstein(sImBs) }

  // W = A'B - AB'
  const ApB = complexBDMul(Ap, B)
  const ABp = complexBDMul(A, Bp)
  const W = complexBDSub(ApB, ABp)

  // S² = S * S
  const S2 = complexBDMul(SBD, SBD)

  // R = W - S²
  const R = complexBDSub(W, S2)

  // Flatten all span coefficients
  const reCoeffs: number[] = []
  const imCoeffs: number[] = []
  for (let s = 0; s < R.re.controlPointsArray.length; s++) {
    reCoeffs.push(...R.re.controlPointsArray[s])
    imCoeffs.push(...R.im.controlPointsArray[s])
  }

  return { re: reCoeffs, im: imCoeffs }
}

// ============================================================================
// Creation from Two Points
// ============================================================================

/**
 * Create an (A, B, S) PH curve from two points.
 * Bootstraps via the existing (S, D) pipeline, then converts to (A, B, S).
 */
export function createABPHFromTwoPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ABPHCurveResult {
  // Bootstrap via existing pipeline
  const sdResult = createComplexRationalPHFromTwoPoints(startX, startY, endX, endY)
  const sdMeta = sdResult.metadata

  // Convert ComplexPoint[] to A, B representation
  // B_i = {w_re, w_im} (weight), A_i = position × weight
  const n = sdResult.controlPoints.length
  const aReCPs: number[] = []
  const aImCPs: number[] = []
  const bReCPs: number[] = []
  const bImCPs: number[] = []

  for (let i = 0; i < n; i++) {
    const cp = sdResult.controlPoints[i]
    bReCPs.push(cp.w_re)
    bImCPs.push(cp.w_im)
    // A = position * B (homogeneous numerator)
    // A = (re + i*im) * (w_re + i*w_im) = (re*w_re - im*w_im) + i*(re*w_im + im*w_re)
    aReCPs.push(cp.re * cp.w_re - cp.im * cp.w_im)
    aImCPs.push(cp.re * cp.w_im + cp.im * cp.w_re)
  }

  // Extract S CPs from the existing metadata
  const sReCPs = [...sdMeta.sUControlPoints]
  const sImCPs = [...sdMeta.sVControlPoints]
  const sKnots = [...sdMeta.sKnots]

  const metadata: ABPHMetadata = {
    kind: 'ab-complex-rational',
    degree: sdResult.degree,
    aReCPs,
    aImCPs,
    bReCPs,
    bImCPs,
    sReCPs,
    sImCPs,
    knots: [...sdResult.knots],
    sKnots,
  }

  return {
    controlPoints: sdResult.controlPoints,
    knots: [...sdResult.knots],
    degree: sdResult.degree,
    metadata,
  }
}

/**
 * A STRAIGHT-LINE AB-PH curve from start→end (degree 5). A line is the simplest
 * PH curve: z(t) = (1−t)·P₀ + t·P₁, so z' = P₁−P₀ is constant and the PH
 * condition gives S = √(P₁−P₀) (also constant). We use it as the freshly-drawn
 * PH curve — draw a line, then bend it via dragging / Generate.
 *   A = collinear, evenly-spaced control points (⇒ A is the straight line)
 *   B ≡ 1
 *   S ≡ √(P₁−P₀)   (so S² = P₁−P₀ = A')
 */
export function createStraightABPH(startX: number, startY: number, endX: number, endY: number): ABPHCurveResult {
  const degree = 5
  const dx = endX - startX, dy = endY - startY
  const aReCPs: number[] = [], aImCPs: number[] = [], bReCPs: number[] = [], bImCPs: number[] = []
  const controlPoints: ComplexPoint[] = []
  for (let i = 0; i <= degree; i++) {
    const t = i / degree
    const x = startX + t * dx, y = startY + t * dy
    aReCPs.push(x); aImCPs.push(y) // A_i = point_i (since B = 1)
    bReCPs.push(1); bImCPs.push(0)
    controlPoints.push({ re: x, im: y, w_re: 1, w_im: 0 })
  }
  // S = √(P₁−P₀) (principal complex square root), constant ⇒ S² = P₁−P₀ = A'.
  const mag = Math.hypot(dx, dy)
  const sr = Math.sqrt(Math.max(0, (mag + dx) / 2))
  const si = (dy >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, (mag - dx) / 2))
  const sReCPs = [sr, sr, sr], sImCPs = [si, si, si]
  const knots = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
  const sKnots = [0, 0, 0, 1, 1, 1]
  const metadata: ABPHMetadata = {
    kind: 'ab-complex-rational', degree, aReCPs, aImCPs, bReCPs, bImCPs, sReCPs, sImCPs, knots, sKnots,
  }
  return { controlPoints, knots, degree, metadata }
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Convert ComplexPoint[] to A, B arrays.
 * A_i = position_i * B_i (homogeneous numerator)
 * B_i = weight_i
 */
export function convertComplexPointsToAB(cps: ComplexPoint[]): {
  aRe: number[]; aIm: number[]; bRe: number[]; bIm: number[]
} {
  const aRe: number[] = []
  const aIm: number[] = []
  const bRe: number[] = []
  const bIm: number[] = []

  for (const cp of cps) {
    bRe.push(cp.w_re)
    bIm.push(cp.w_im)
    aRe.push(cp.re * cp.w_re - cp.im * cp.w_im)
    aIm.push(cp.re * cp.w_im + cp.im * cp.w_re)
  }

  return { aRe, aIm, bRe, bIm }
}

/**
 * Convert A, B arrays to ComplexPoint[].
 * position_i = A_i / B_i, weight_i = B_i
 */
export function convertABToComplexPoints(
  aRe: number[], aIm: number[], bRe: number[], bIm: number[]
): ComplexPoint[] {
  const n = aRe.length
  const result: ComplexPoint[] = []

  for (let i = 0; i < n; i++) {
    const bNorm2 = bRe[i] * bRe[i] + bIm[i] * bIm[i]
    if (bNorm2 < 1e-20) {
      result.push({ re: 0, im: 0, w_re: bRe[i], w_im: bIm[i] })
      continue
    }
    const re = (aRe[i] * bRe[i] + aIm[i] * bIm[i]) / bNorm2
    const im = (aIm[i] * bRe[i] - aRe[i] * bIm[i]) / bNorm2
    result.push({ re, im, w_re: bRe[i], w_im: bIm[i] })
  }

  return result
}

// ============================================================================
// AB PH Curve Evaluation and Offset
// ============================================================================

/**
 * Evaluate the AB PH curve position z(t) = A(t)/B(t) at parameter t.
 */
export function evaluateABPHCurveAtParam(
  meta: ABPHMetadata,
  t: number,
): Point2D {
  const aReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs })
  const bImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs })

  const aRe = aReBD.evaluate(t)
  const aIm = aImBD.evaluate(t)
  const bRe = bReBD.evaluate(t)
  const bIm = bImBD.evaluate(t)

  const bNorm2 = bRe * bRe + bIm * bIm
  if (bNorm2 < 1e-20) return { x: 0, y: 0 }

  return {
    x: (aRe * bRe + aIm * bIm) / bNorm2,
    y: (aIm * bRe - aRe * bIm) / bNorm2,
  }
}

/**
 * Evaluate the left unit normal of an AB PH curve at parameter t.
 *
 * For z(t) = A(t)/B(t) with PH condition A'B - AB' = S²:
 *   z'(t) = S(t)² / B(t)²
 *
 * The tangent direction includes the rotation from B². When B is real,
 * this reduces to the polynomial PH normal. When B has imaginary parts,
 * B² introduces additional rotation that must be accounted for.
 */
export function evaluateABPHNormal(
  meta: ABPHMetadata,
  t: number,
): { nx: number; ny: number } {
  // S(t) = u(t) + iv(t)
  const uBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const vBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })
  // B(t) = p(t) + iq(t)
  const pBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs })
  const qBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs })

  const u = uBD.evaluate(t)
  const v = vBD.evaluate(t)
  const p = pBD.evaluate(t)
  const q = qBD.evaluate(t)

  // S² = (u²-v²) + i(2uv)
  const s2Re = u * u - v * v
  const s2Im = 2 * u * v

  // B² = (p²-q²) + i(2pq)
  const b2Re = p * p - q * q
  const b2Im = 2 * p * q

  // z'(t) = S²/B² = S² · conj(B²) / |B²|²
  const b2Norm2 = b2Re * b2Re + b2Im * b2Im
  if (b2Norm2 < 1e-20) return { nx: 0, ny: 0 }

  const xPrime = (s2Re * b2Re + s2Im * b2Im) / b2Norm2
  const yPrime = (s2Im * b2Re - s2Re * b2Im) / b2Norm2

  const speed = Math.sqrt(xPrime * xPrime + yPrime * yPrime)
  if (speed < 1e-14) return { nx: 0, ny: 0 }

  // Left unit normal = (-y', x') / speed
  return {
    nx: -yPrime / speed,
    ny: xPrime / speed,
  }
}

/**
 * Find the parameter t of the nearest point on an AB PH curve to a given point.
 */
export function findNearestPointParamAB(
  meta: ABPHMetadata,
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
    const pt = evaluateABPHCurveAtParam(meta, t)
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

/**
 * Compute the exact rational offset of an AB PH curve at distance d.
 *
 * For z = A/B with A'B - AB' = S², the offset in homogeneous complex form:
 *   Numerator = A·σ + d·i·S²·conj(B)
 *   Weight    = B·σ
 * where σ = |S|² = u² + v² (real polynomial).
 *
 * The result is a complex-rational curve of degree 3p-2 (where p = curve degree).
 */
export function computeABPHOffset(
  meta: ABPHMetadata,
  distance: number,
): { controlPoints: ComplexPoint[]; knots: number[]; degree: number } {
  // Decompose S components (degree p-1)
  const uBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const vBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })

  // σ = u² + v² (real, degree 2(p-1))
  const sigmaBD = uBD.multiply(uBD).add(vBD.multiply(vBD))

  // S² components (degree 2(p-1))
  const xPrimeBD = uBD.multiply(uBD).subtract(vBD.multiply(vBD)) // u² - v²
  const yPrimeBD = uBD.multiply(vBD).multiplyByScalar(2)          // 2uv

  // Decompose A and B (degree p)
  const aReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs })
  const bImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs })

  // i·S²·conj(B):
  //   real part: (u²-v²)·b_im - 2uv·b_re
  //   imag part: (u²-v²)·b_re + 2uv·b_im
  const iS2conjB_re = xPrimeBD.multiply(bImBD).subtract(yPrimeBD.multiply(bReBD))
  const iS2conjB_im = xPrimeBD.multiply(bReBD).add(yPrimeBD.multiply(bImBD))

  // Numerator = A·σ + d·i·S²·conj(B)
  const nReBD = aReBD.multiply(sigmaBD).add(iS2conjB_re.multiplyByScalar(distance))
  const nImBD = aImBD.multiply(sigmaBD).add(iS2conjB_im.multiplyByScalar(distance))

  // Weight = B·σ (degree-elevated to match numerator)
  const wReBD = nReBD.multiplyByScalar(0).add(bReBD.multiply(sigmaBD))
  const wImBD = nReBD.multiplyByScalar(0).add(bImBD.multiply(sigmaBD))

  // Recompose to B-spline form
  const nReSpline = recomposeBD(nReBD)
  const nImSpline = recomposeBD(nImBD)
  const wReSpline = recomposeBD(wReBD)
  const wImSpline = recomposeBD(wImBD)

  // Form ComplexPoint control points: position = numerator / weight
  const controlPoints: ComplexPoint[] = []
  for (let i = 0; i < nReSpline.controlPoints.length; i++) {
    const wRe = wReSpline.controlPoints[i]
    const wIm = wImSpline.controlPoints[i]
    const wNorm2 = wRe * wRe + wIm * wIm
    if (wNorm2 < 1e-20) {
      controlPoints.push({ re: 0, im: 0, w_re: wRe, w_im: wIm })
      continue
    }
    const nRe = nReSpline.controlPoints[i]
    const nIm = nImSpline.controlPoints[i]
    controlPoints.push({
      re: (nRe * wRe + nIm * wIm) / wNorm2,
      im: (nIm * wRe - nRe * wIm) / wNorm2,
      w_re: wRe,
      w_im: wIm,
    })
  }

  const degree = nReSpline.knots.length - nReSpline.controlPoints.length - 1

  return { controlPoints, knots: nReSpline.knots, degree }
}

// ============================================================================
// Möbius Transform on AB PH Curves
// ============================================================================

/**
 * Apply a Möbius transform f(z) = (a·z + b)/(c·z + d) to an AB PH curve.
 *
 * Since z(t) = A(t)/B(t):
 *   f(z(t)) = (a·A + b·B) / (c·A + d·B)
 *
 * The PH condition is preserved:
 *   A_new'·B_new - A_new·B_new' = (ad - bc)·(A'B - AB') = (ad - bc)·S²
 *   → S_new = √(ad - bc) · S
 */
export function applyMobiusToABPH(
  transform: MobiusTransform,
  meta: ABPHMetadata,
): ABPHMetadata {
  // Normalize so ad - bc = 1 to avoid large coefficients from cross-ratio formula
  const det = csub(cmult(transform.a, transform.d), cmult(transform.b, transform.c))
  const detNorm = Math.sqrt(det.re * det.re + det.im * det.im)
  if (detNorm < 1e-14) return { ...meta }

  // √(ad-bc) for normalization: divide a,b,c,d by this so new det = 1
  const sqrtDet = {
    re: Math.sqrt((detNorm + det.re) / 2),
    im: (det.im >= 0 ? 1 : -1) * Math.sqrt((detNorm - det.re) / 2),
  }
  // 1/√(ad-bc)
  const sqrtDetNorm2 = sqrtDet.re * sqrtDet.re + sqrtDet.im * sqrtDet.im
  const invSqrtDet = { re: sqrtDet.re / sqrtDetNorm2, im: -sqrtDet.im / sqrtDetNorm2 }

  const a = cmult(transform.a, invSqrtDet)
  const b = cmult(transform.b, invSqrtDet)
  const c = cmult(transform.c, invSqrtDet)
  const d = cmult(transform.d, invSqrtDet)
  // Now ad - bc = 1, so S_new = S (unchanged)

  const n = meta.aReCPs.length

  // A_new = a·A + b·B,  B_new = c·A + d·B  (complex arithmetic per CP)
  const newARe: number[] = []
  const newAIm: number[] = []
  const newBRe: number[] = []
  const newBIm: number[] = []

  for (let i = 0; i < n; i++) {
    const Ai = { re: meta.aReCPs[i], im: meta.aImCPs[i] }
    const Bi = { re: meta.bReCPs[i], im: meta.bImCPs[i] }

    const newA = cadd(cmult(a, Ai), cmult(b, Bi))
    const newB = cadd(cmult(c, Ai), cmult(d, Bi))

    newARe.push(newA.re)
    newAIm.push(newA.im)
    newBRe.push(newB.re)
    newBIm.push(newB.im)
  }

  return {
    ...meta,
    aReCPs: newARe,
    aImCPs: newAIm,
    bReCPs: newBRe,
    bImCPs: newBIm,
    // S is unchanged since we normalized ad-bc = 1
  }
}
