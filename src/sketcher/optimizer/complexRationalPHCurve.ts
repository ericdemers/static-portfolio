// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Complex Rational PH Curve Support
 *
 * A complex rational PH curve is parameterized by (S, D) where:
 *   S = u + iv is the PH generating function (complex B-spline)
 *   D is the complex denominator (complex B-spline)
 *
 * The hodograph numerator H = S² is PH by construction.
 * The Wronskian condition F'D - FD' = H relates F (numerator) to D.
 * The curve control points are P_i = f_i / d_i with complex weights d_i.
 *
 * For D = constant (e.g., D = 1+0i), this reduces to the polynomial PH case.
 */

import type { ComplexPoint } from '../types/curve'
import { type Complex, cmult, cdiv, cnorm } from '../utils/complex'
import {
  decomposeToBernstein,
  integrateBD,
  recomposeBD,
  derivativeBD,
  BernsteinDecomposition,
} from './algebra'
import {
  type ComplexBD,
  complexBDMul,
  complexBDSub,
} from './complexAlgebra'
import type { ComplexRationalPHCurveResult } from './phCurve'

// ============================================================================
// Forward Pipeline: (S, D) → Curve CPs
// ============================================================================

/**
 * Compute a complex rational PH curve from S and D generating functions.
 *
 * Pipeline:
 * 1. Build S = u + iv as ComplexBD
 * 2. Compute H = S² via complexBDMul (PH by construction)
 * 3. Build D and D' as ComplexBD
 * 4. Solve Wronskian F'D - FD' = H for F via least-squares
 * 5. Recompose F, D to B-spline form
 * 6. Form ComplexPoint[]: P_i = f_i/d_i, W_i = d_i
 */
export function computeComplexRationalPHFromSD(
  uCPs: number[],
  vCPs: number[],
  sKnots: number[],
  sDegree: number,
  dReCPs: number[],
  dImCPs: number[],
  dKnots: number[],
  dDegree: number,
  x0: number,
  y0: number,
): ComplexRationalPHCurveResult {
  // Step 1: Build S = u + iv as ComplexBD
  const uBD = decomposeToBernstein({ knots: sKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: sKnots, controlPoints: vCPs })
  const S: ComplexBD = { re: uBD, im: vBD }

  // Step 2: H = S² (PH hodograph numerator)
  const H = complexBDMul(S, S)
  // H.re = u²-v² (x component of hodograph)
  // H.im = 2uv   (y component of hodograph)

  // Step 3: Build D as ComplexBD
  const dReBD = decomposeToBernstein({ knots: dKnots, controlPoints: dReCPs })
  const dImBD = decomposeToBernstein({ knots: dKnots, controlPoints: dImCPs })

  // Check if D is constant (all CPs equal) — use simplified polynomial path
  const isConstantD = isConstantComplex(dReCPs, dImCPs)

  if (isConstantD) {
    // D is constant: F'D - FD' = H simplifies to F' = H/D_const
    // Since D' = 0, we get F' = H / D
    // This is just a scaled polynomial PH curve
    const dConst: Complex = { re: dReCPs[0], im: dImCPs[0] }

    // Scale H by 1/D
    const dNorm2 = dConst.re * dConst.re + dConst.im * dConst.im
    // H/D = H * conj(D) / |D|²
    const dConjRe = dConst.re / dNorm2
    const dConjIm = -dConst.im / dNorm2

    // F' = (H.re * dConjRe - H.im * dConjIm) + i*(H.re * dConjIm + H.im * dConjRe)
    const fPrimeRe = H.re.multiplyByScalar(dConjRe).subtract(H.im.multiplyByScalar(dConjIm))
    const fPrimeIm = H.re.multiplyByScalar(dConjIm).add(H.im.multiplyByScalar(dConjRe))

    // Step 4: Integrate F' to get F
    const fReBD = integrateBD(fPrimeRe, x0)
    const fImBD = integrateBD(fPrimeIm, y0)

    // Step 5: Recompose to B-spline
    const fReSpline = recomposeBD(fReBD)
    const fImSpline = recomposeBD(fImBD)

    // Step 6: Form ComplexPoint[] with constant D weights
    const controlPoints: ComplexPoint[] = []
    for (let i = 0; i < fReSpline.controlPoints.length; i++) {
      controlPoints.push({
        re: fReSpline.controlPoints[i] / dNorm2 * dConst.re + fImSpline.controlPoints[i] / dNorm2 * dConst.im,
        im: fImSpline.controlPoints[i] / dNorm2 * dConst.re - fReSpline.controlPoints[i] / dNorm2 * dConst.im,
        w_re: dConst.re,
        w_im: dConst.im,
      })
    }

    // Actually, for D=constant, P_i = F_i / D, and we store Euclidean positions.
    // Let's simplify: since F = z*D for homogeneous, P_i = F_i/D_i where F_i are numerator CPs.
    // With constant D, all weights are the same.
    const controlPoints2: ComplexPoint[] = []
    for (let i = 0; i < fReSpline.controlPoints.length; i++) {
      // Euclidean position: F_i / D
      const fi: Complex = { re: fReSpline.controlPoints[i], im: fImSpline.controlPoints[i] }
      const pi = cdiv(fi, dConst)
      controlPoints2.push({
        re: pi.re,
        im: pi.im,
        w_re: dConst.re,
        w_im: dConst.im,
      })
    }

    const degree = fReSpline.knots.length - fReSpline.controlPoints.length - 1

    return {
      controlPoints: controlPoints2,
      knots: fReSpline.knots,
      degree,
      metadata: {
        kind: 'complex-rational',
        sDegree,
        sUControlPoints: [...uCPs],
        sVControlPoints: [...vCPs],
        sKnots: [...sKnots],
        dDegree,
        dReControlPoints: [...dReCPs],
        dImControlPoints: [...dImCPs],
        dKnots: [...dKnots],
        origin: { x: x0, y: y0 },
      },
    }
  }

  // General case: D is not constant
  // Solve Wronskian F'D - FD' = H via least-squares on Bernstein coefficients
  const dBD: ComplexBD = { re: dReBD, im: dImBD }
  const dPrimeRe = derivativeBD(dReBD)
  const dPrimeIm = derivativeBD(dImBD)
  const dPrimeBD: ComplexBD = { re: dPrimeRe, im: dPrimeIm }

  // H has degree 2*sDegree, D has degree dDegree, D' has degree dDegree-1
  // F'D has degree (fDegree-1) + dDegree, FD' has degree fDegree + (dDegree-1)
  // For these to equal H (degree 2*sDegree), we need:
  //   fDegree - 1 + dDegree = 2*sDegree  =>  fDegree = 2*sDegree - dDegree + 1
  const fDegree = 2 * sDegree - dDegree + 1
  const numFCPs = fDegree + 1

  // We solve for F's Bernstein coefficients using least-squares
  // For a single Bézier span on [0,1], the Wronskian system is:
  //   F'D - FD' = H
  // where F' has degree fDegree-1, and products are computed via Bernstein multiplication.

  // Get the Bernstein coefficients of H, D, D' on each span
  const numSpans = H.re.numSpans

  // Build F via least-squares on each span, then chain integration constants
  const fReSpans: number[][] = []
  const fImSpans: number[][] = []

  for (let spanIdx = 0; spanIdx < numSpans; spanIdx++) {
    const hReCoeffs = H.re.controlPointsArray[spanIdx]
    const hImCoeffs = H.im.controlPointsArray[spanIdx]
    const dReCoeffs = dBD.re.controlPointsArray[spanIdx]
    const dImCoeffs = dBD.im.controlPointsArray[spanIdx]

    // Degree-elevate D coefficients if needed to match
    const dPReCoeffs = spanIdx < dPrimeBD.re.controlPointsArray.length
      ? dPrimeBD.re.controlPointsArray[spanIdx] : [0]
    const dPImCoeffs = spanIdx < dPrimeBD.im.controlPointsArray.length
      ? dPrimeBD.im.controlPointsArray[spanIdx] : [0]

    // For single-span case, solve the linear system directly
    // Use integration approach: F' = (H + FD') / D
    // Start with initial guess F(0) = origin, then iterate
    const fRe = solveFBernsteinCoeffs(
      hReCoeffs, hImCoeffs, dReCoeffs, dImCoeffs,
      dPReCoeffs, dPImCoeffs, numFCPs,
      spanIdx === 0 ? x0 : fReSpans[spanIdx - 1][fReSpans[spanIdx - 1].length - 1],
      spanIdx === 0 ? y0 : fImSpans[spanIdx - 1][fImSpans[spanIdx - 1].length - 1],
    )
    fReSpans.push(fRe.re)
    fImSpans.push(fRe.im)
  }

  const fReBD = new BernsteinDecomposition(fReSpans, H.re.distinctKnots)
  const fImBD = new BernsteinDecomposition(fImSpans, H.im.distinctKnots)

  const fReSpline = recomposeBD(fReBD)
  const fImSpline = recomposeBD(fImBD)

  // Build D with matching knot vector — degree-elevate D to match F's degree for the curve

  // The curve degree is fDegree (since F and D may have different degrees,
  // the complex rational curve degree is max(fDegree, dDegree))
  // But for ComplexPoint representation, we need matching knot vectors.
  // Use the F knot vector and degree-elevate D to match.
  const fNumCPs = fReSpline.controlPoints.length

  // For now, use the simpler approach: evaluate F/D at the F knot spans
  const controlPoints: ComplexPoint[] = []
  const n = Math.min(fNumCPs, fReSpline.controlPoints.length)

  // Evaluate D at Greville abscissae of F's knot vector to get matching weights
  const curveKnots = fReSpline.knots
  const curveDegree = curveKnots.length - n - 1

  for (let i = 0; i < n; i++) {
    const fi: Complex = { re: fReSpline.controlPoints[i], im: fImSpline.controlPoints[i] }
    // For the weight, evaluate D at the Greville abscissa
    const greville = grevilleAbscissa(curveKnots, curveDegree, i)
    const dReVal = dBD.re.evaluate(greville)
    const dImVal = dBD.im.evaluate(greville)
    const di: Complex = { re: dReVal, im: dImVal }
    const pi = cdiv(fi, di)
    controlPoints.push({
      re: pi.re,
      im: pi.im,
      w_re: di.re,
      w_im: di.im,
    })
  }

  return {
    controlPoints,
    knots: curveKnots,
    degree: curveDegree,
    metadata: {
      kind: 'complex-rational',
      sDegree,
      sUControlPoints: [...uCPs],
      sVControlPoints: [...vCPs],
      sKnots: [...sKnots],
      dDegree,
      dReControlPoints: [...dReCPs],
      dImControlPoints: [...dImCPs],
      dKnots: [...dKnots],
      origin: { x: x0, y: y0 },
    },
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function isConstantComplex(reCPs: number[], imCPs: number[]): boolean {
  if (reCPs.length === 0) return true
  const re0 = reCPs[0]
  const im0 = imCPs[0]
  for (let i = 1; i < reCPs.length; i++) {
    if (Math.abs(reCPs[i] - re0) > 1e-12 || Math.abs(imCPs[i] - im0) > 1e-12) {
      return false
    }
  }
  return true
}

function grevilleAbscissa(knots: number[], degree: number, i: number): number {
  let sum = 0
  for (let j = 1; j <= degree; j++) {
    sum += knots[i + j]
  }
  return degree > 0 ? sum / degree : knots[i]
}

/**
 * Solve for F's Bernstein coefficients on a single span given the Wronskian.
 * Uses integration approach: since F'D - FD' = H, and we know F(0),
 * we integrate F' = (H + FD') / D stepwise.
 *
 * For the Bézier case on [0,1], use recursive forward computation.
 */
function solveFBernsteinCoeffs(
  hReCoeffs: number[],
  hImCoeffs: number[],
  dReCoeffs: number[],
  dImCoeffs: number[],
  dPrimeReCoeffs: number[],
  dPrimeImCoeffs: number[],
  numFCPs: number,
  f0Re: number,
  f0Im: number,
): { re: number[]; im: number[] } {
  // For the constant D case, this is just integration of H/D.
  // For the general case, use forward Euler on Bernstein coefficients.
  //
  // Bernstein integration: f_{k+1} = f_k + (1/n) * h_k  (for single span [0,1])
  // where n = degree of F, and h are the hodograph numerator coefficients after dividing by D.

  const n = numFCPs - 1 // degree of F
  const fRe: number[] = [f0Re]
  const fIm: number[] = [f0Im]

  // Evaluate D at equispaced parameter values for Bernstein coefficient computation

  for (let k = 0; k < n; k++) {
    // Parameter at Bernstein node k
    const t = n > 0 ? k / n : 0

    // Evaluate D at t
    const dRe = evaluateBernstein(dReCoeffs, t)
    const dIm = evaluateBernstein(dImCoeffs, t)
    const dNorm2 = dRe * dRe + dIm * dIm

    if (dNorm2 < 1e-20) {
      // D ≈ 0, just propagate
      fRe.push(fRe[k])
      fIm.push(fIm[k])
      continue
    }

    // Evaluate H at t
    const hRe = evaluateBernstein(hReCoeffs, t)
    const hIm = evaluateBernstein(hImCoeffs, t)

    // Evaluate D' at t
    const dpRe = evaluateBernstein(dPrimeReCoeffs, t)
    const dpIm = evaluateBernstein(dPrimeImCoeffs, t)

    // F'*D = H + F*D'  =>  F' = (H + F*D') / D
    // F*D' (complex): (fRe + i*fIm)(dpRe + i*dpIm)
    const fdpRe = fRe[k] * dpRe - fIm[k] * dpIm
    const fdpIm = fRe[k] * dpIm + fIm[k] * dpRe

    // numerator = H + F*D'
    const numRe = hRe + fdpRe
    const numIm = hIm + fdpIm

    // F' = numerator / D = numerator * conj(D) / |D|²
    const fpRe = (numRe * dRe + numIm * dIm) / dNorm2
    const fpIm = (numIm * dRe - numRe * dIm) / dNorm2

    // Bernstein integration step: f_{k+1} = f_k + (1/n) * f'_k
    fRe.push(fRe[k] + fpRe / n)
    fIm.push(fIm[k] + fpIm / n)
  }

  return { re: fRe, im: fIm }
}

function evaluateBernstein(coeffs: number[], t: number): number {
  const n = coeffs.length - 1
  if (n < 0) return 0
  if (n === 0) return coeffs[0]

  // De Casteljau
  const work = [...coeffs]
  for (let r = 1; r <= n; r++) {
    for (let i = 0; i <= n - r; i++) {
      work[i] = (1 - t) * work[i] + t * work[i + 1]
    }
  }
  return work[0]
}

// ============================================================================
// Wronskian Residual
// ============================================================================

/**
 * Compute the Wronskian residual ||F'D - FD' - H||² at sample points.
 * This measures how well the curve satisfies the PH Wronskian condition.
 */
export function computeWronskianResidual(
  uCPs: number[],
  vCPs: number[],
  sKnots: number[],
  _sDegree: number,
  dReCPs: number[],
  dImCPs: number[],
  dKnots: number[],
  _dDegree: number,
  fReCPs: number[],
  fImCPs: number[],
  fKnots: number[],
): number {
  // Build BDs
  const uBD = decomposeToBernstein({ knots: sKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: sKnots, controlPoints: vCPs })
  const S: ComplexBD = { re: uBD, im: vBD }
  const H = complexBDMul(S, S)

  const fReBD = decomposeToBernstein({ knots: fKnots, controlPoints: fReCPs })
  const fImBD = decomposeToBernstein({ knots: fKnots, controlPoints: fImCPs })
  const fPrimeReBD = derivativeBD(fReBD)
  const fPrimeImBD = derivativeBD(fImBD)

  const dReBD = decomposeToBernstein({ knots: dKnots, controlPoints: dReCPs })
  const dImBD = decomposeToBernstein({ knots: dKnots, controlPoints: dImCPs })
  const dPrimeReBD = derivativeBD(dReBD)
  const dPrimeImBD = derivativeBD(dImBD)

  // Compute F'D - FD' - H at sample points
  const F: ComplexBD = { re: fReBD, im: fImBD }
  const Fp: ComplexBD = { re: fPrimeReBD, im: fPrimeImBD }
  const D: ComplexBD = { re: dReBD, im: dImBD }
  const Dp: ComplexBD = { re: dPrimeReBD, im: dPrimeImBD }

  // Wronskian = F'D - FD' - H
  const FpD = complexBDMul(Fp, D)
  const FDp = complexBDMul(F, Dp)
  const W = complexBDSub(complexBDSub(FpD, FDp), H)

  // Sample and compute L2 residual
  let residual = 0
  const numSamples = 20
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples
    const wRe = W.re.evaluate(t)
    const wIm = W.im.evaluate(t)
    residual += wRe * wRe + wIm * wIm
  }

  return residual / (numSamples + 1)
}

// ============================================================================
// Two-Point Creation
// ============================================================================

/**
 * Create a complex rational PH curve from two points.
 *
 * Same strategy as polynomial createSpiralFromTwoPoints:
 * 1. Default spiral S: w₀=1, w₁=e^{iπ/4}, w₂=i (quadratic)
 * 2. D = 1+0i (constant — produces polynomial PH initially)
 * 3. Scale S by complex c = √(desired/defaultChord)
 * 4. Run forward pipeline → ComplexRationalPHCurveResult
 */
export function createComplexRationalPHFromTwoPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ComplexRationalPHCurveResult {
  const DEGENERATE_THRESHOLD = 1e-10

  const desired: Complex = { re: endX - startX, im: endY - startY }
  const desiredLen = cnorm(desired)

  if (desiredLen < DEGENERATE_THRESHOLD) {
    return createDefaultComplexRationalPH(startX, startY)
  }

  // Default spiral w CPs
  const w0: Complex = { re: 1, im: 0 }
  const w1: Complex = { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }
  const w2: Complex = { re: 0, im: 1 }

  // Compute the default spiral's chord
  const defaultResult = createDefaultComplexRationalPH(0, 0)
  const lastCP = defaultResult.controlPoints[defaultResult.controlPoints.length - 1]
  const defaultChord: Complex = { re: lastCP.re, im: lastCP.im }

  // Complex scale factor: c² = desired / defaultChord, so c = sqrt(desired / defaultChord)
  const ratio = cdiv(desired, defaultChord)
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

  const uCPs = [w0s.re, w1s.re, w2s.re]
  const vCPs = [w0s.im, w1s.im, w2s.im]
  const sKnots = [0, 0, 0, 1, 1, 1]
  const sDegree = 2

  // D = 1+0i (constant, single CP)
  const dReCPs = [1]
  const dImCPs = [0]
  const dKnots = [0, 1]
  const dDegree = 0

  return computeComplexRationalPHFromSD(
    uCPs, vCPs, sKnots, sDegree,
    dReCPs, dImCPs, dKnots, dDegree,
    startX, startY,
  )
}

/**
 * A STRAIGHT-LINE complex-rational PH curve in the (S, D) parameterization.
 * A line is the simplest PH curve: z(t) = (1−t)·P₀ + t·P₁, so the hodograph
 * z' = P₁−P₀ is constant. Choosing S ≡ √(P₁−P₀) gives H = S² = P₁−P₀ and a
 * constant denominator D ≡ 1, the Wronskian collapses to F' = S², so
 * F = (P₁−P₀)t + P₀ — the straight line. We use it as the freshly-drawn PH
 * curve: draw a line, then bend it via dragging (the (S,D) optimizer) or
 * Generate. This mirrors the Lie-sphere lab's construction (PH by construction,
 * no equality constraints), giving smooth control-point motion while editing.
 */
export function createStraightComplexRationalPH(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ComplexRationalPHCurveResult {
  const dx = endX - startX, dy = endY - startY
  const mag = Math.hypot(dx, dy)
  // S ≡ √(P₁−P₀) (principal complex square root), constant ⇒ S² = P₁−P₀.
  const sr = Math.sqrt(Math.max(0, (mag + dx) / 2))
  const si = (dy >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, (mag - dx) / 2))
  // S as a degree-2 complex B-spline (3 equal CPs) — same DOF as the lab, so
  // dragging has room to bend the line into a curve.
  const uCPs = [sr, sr, sr], vCPs = [si, si, si]
  const sKnots = [0, 0, 0, 1, 1, 1], sDegree = 2
  // D ≡ 1 (constant) ⇒ a polynomial PH curve (unit weights), degree 5.
  const dReCPs = [1], dImCPs = [0], dKnots = [0, 1], dDegree = 0
  return computeComplexRationalPHFromSD(
    uCPs, vCPs, sKnots, sDegree,
    dReCPs, dImCPs, dKnots, dDegree,
    startX, startY,
  )
}

function createDefaultComplexRationalPH(
  centerX: number,
  centerY: number,
): ComplexRationalPHCurveResult {
  const w0: Complex = { re: 1, im: 0 }
  const w1: Complex = { re: Math.cos(Math.PI / 4), im: Math.sin(Math.PI / 4) }
  const w2: Complex = { re: 0, im: 1 }

  const uCPs = [w0.re, w1.re, w2.re]
  const vCPs = [w0.im, w1.im, w2.im]
  const sKnots = [0, 0, 0, 1, 1, 1]
  const sDegree = 2

  const dReCPs = [1]
  const dImCPs = [0]
  const dKnots = [0, 1]
  const dDegree = 0

  return computeComplexRationalPHFromSD(
    uCPs, vCPs, sKnots, sDegree,
    dReCPs, dImCPs, dKnots, dDegree,
    centerX, centerY,
  )
}
