// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Complex Bernstein Decomposition Algebra for Complex-Rational B-Splines
 *
 * Wraps pairs of real BernsteinDecomposition instances to represent complex-valued
 * B-spline functions. Reuses all existing BD machinery from algebra.ts.
 *
 * The complex curvature derivative numerator is:
 *   g = Im((D1*)² · T)
 *   T = w·(D3·D1 + D1·D21 - 3/2·D2²) + 2·D1·(w'·D2 - w''·D1)
 * where D1, D2, D3, D21 are complex Chen terms and w is the complex weight spline.
 */

import {
  BernsteinDecomposition,
  decomposeToBernstein,
  derivativeBD,
  findZerosBD,
  fromBSpline,
  unrollToOpen,
  decomposeClampedRegion,
  precomputePeriodicRationalBasisDerivatives,
  type PrecomputedPeriodicRationalBasisDerivatives,
  precomputeRationalBasisDerivatives,
} from './algebra'
import { mkPeriodicBSplineWithKnots, mkOpenBSpline, cpToArray, bsplineDomain } from './bsplineTypes'

// ============================================================================
// Complex Bernstein Decomposition
// ============================================================================

export interface ComplexBD {
  re: BernsteinDecomposition
  im: BernsteinDecomposition
}

export interface SimpleBSpline {
  knots: number[]
  controlPoints: number[]
}

function simpleDegree(bs: SimpleBSpline): number {
  return bs.knots.length - bs.controlPoints.length - 1
}

export function simpleDifferentiate(bs: SimpleBSpline): SimpleBSpline {
  const p = simpleDegree(bs)
  if (p === 0) {
    // Derivative of a piecewise constant is zero; return a zero B-spline
    // with the same structure so decomposeToBernstein produces a valid degree-0 BD.
    return { knots: [...bs.knots], controlPoints: bs.controlPoints.map(() => 0) }
  }
  const newKnots = bs.knots.slice(1, -1)
  const newCPs: number[] = []
  for (let i = 0; i < bs.controlPoints.length - 1; i++) {
    const denom = bs.knots[i + p + 1] - bs.knots[i + 1]
    if (Math.abs(denom) > 1e-14) {
      newCPs.push((p * (bs.controlPoints[i + 1] - bs.controlPoints[i])) / denom)
    } else {
      newCPs.push(0)
    }
  }
  return { knots: newKnots, controlPoints: newCPs }
}

// ============================================================================
// ComplexBD Arithmetic
// ============================================================================

export function zeroBD(template: BernsteinDecomposition): BernsteinDecomposition {
  const zeros: number[][] = template.controlPointsArray.map(
    (span) => new Array(span.length).fill(0)
  )
  return new BernsteinDecomposition(zeros, template.distinctKnots)
}

export function complexBDFromReal(bd: BernsteinDecomposition): ComplexBD {
  return { re: bd, im: zeroBD(bd) }
}

export function complexBDAdd(a: ComplexBD, b: ComplexBD): ComplexBD {
  return { re: a.re.add(b.re), im: a.im.add(b.im) }
}

export function complexBDSub(a: ComplexBD, b: ComplexBD): ComplexBD {
  return { re: a.re.subtract(b.re), im: a.im.subtract(b.im) }
}

export function complexBDMul(a: ComplexBD, b: ComplexBD): ComplexBD {
  // (a.re + i*a.im)(b.re + i*b.im) = (a.re*b.re - a.im*b.im) + i*(a.re*b.im + a.im*b.re)
  return {
    re: a.re.multiply(b.re).subtract(a.im.multiply(b.im)),
    im: a.re.multiply(b.im).add(a.im.multiply(b.re)),
  }
}

export function complexBDMulReal(a: ComplexBD, b: BernsteinDecomposition): ComplexBD {
  return { re: a.re.multiply(b), im: a.im.multiply(b) }
}

export function complexBDConj(a: ComplexBD): ComplexBD {
  return { re: a.re, im: a.im.multiplyByScalar(-1) }
}

export function complexBDScale(s: number, a: ComplexBD): ComplexBD {
  return { re: a.re.multiplyByScalar(s), im: a.im.multiplyByScalar(s) }
}

// ============================================================================
// Complex Derivatives for Periodic Complex-Rational B-Splines
// ============================================================================

interface ComplexDerivatives {
  Z: ComplexBD      // Z(u) = z·w complex homogeneous position
  Zu: ComplexBD     // Z'
  Zuu: ComplexBD    // Z''
  Zuuu: ComplexBD   // Z'''
  w: ComplexBD      // w(u) complex weight
  wu: ComplexBD     // w'
  wuu: ComplexBD    // w''
  wuuu: ComplexBD   // w'''
}

interface ComplexChenTerms {
  D1: ComplexBD     // Z'·w - Z·w'
  D2: ComplexBD     // Z''·w - Z·w''
  D3: ComplexBD     // Z'''·w - Z·w'''
  D21: ComplexBD    // Z''·w' - Z'·w''
  w: ComplexBD      // w(u)
  wu: ComplexBD     // w'(u)
  wuu: ComplexBD    // w''(u)
}

function computeOpenComplexDerivativesBD(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): ComplexDerivatives {
  // Build 4 real SimpleBSplines: Z_re, Z_im, w_re, w_im
  const sZre: SimpleBSpline = { knots, controlPoints: cpsZre }
  const sZim: SimpleBSpline = { knots, controlPoints: cpsZim }
  const sWre: SimpleBSpline = { knots, controlPoints: cpsWre }
  const sWim: SimpleBSpline = { knots, controlPoints: cpsWim }

  // Differentiate each 3 times
  const sZre_u = simpleDifferentiate(sZre)
  const sZim_u = simpleDifferentiate(sZim)
  const sWre_u = simpleDifferentiate(sWre)
  const sWim_u = simpleDifferentiate(sWim)

  const sZre_uu = simpleDifferentiate(sZre_u)
  const sZim_uu = simpleDifferentiate(sZim_u)
  const sWre_uu = simpleDifferentiate(sWre_u)
  const sWim_uu = simpleDifferentiate(sWim_u)

  const sZre_uuu = simpleDifferentiate(sZre_uu)
  const sZim_uuu = simpleDifferentiate(sZim_uu)
  const sWre_uuu = simpleDifferentiate(sWre_uu)
  const sWim_uuu = simpleDifferentiate(sWim_uu)

  // Decompose to Bernstein
  return {
    Z: { re: decomposeToBernstein(sZre), im: decomposeToBernstein(sZim) },
    Zu: { re: decomposeToBernstein(sZre_u), im: decomposeToBernstein(sZim_u) },
    Zuu: { re: decomposeToBernstein(sZre_uu), im: decomposeToBernstein(sZim_uu) },
    Zuuu: { re: decomposeToBernstein(sZre_uuu), im: decomposeToBernstein(sZim_uuu) },
    w: { re: decomposeToBernstein(sWre), im: decomposeToBernstein(sWim) },
    wu: { re: decomposeToBernstein(sWre_u), im: decomposeToBernstein(sWim_u) },
    wuu: { re: decomposeToBernstein(sWre_uu), im: decomposeToBernstein(sWim_uu) },
    wuuu: { re: decomposeToBernstein(sWre_uuu), im: decomposeToBernstein(sWim_uuu) },
  }
}

export function computePeriodicComplexDerivativesBD(
  degree: number,
  knots: readonly number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  period: number = 1.0,
  wrapWeight?: { re: number; im: number }
): ComplexDerivatives {
  // Compute complex spiral ratio = wrapWeight / w[0]
  const w0_re = cpsWre[0]
  const w0_im = cpsWim[0]
  const w0_norm2 = w0_re * w0_re + w0_im * w0_im
  let ratio_re = 1, ratio_im = 0
  let hasSpiral = false
  if (wrapWeight !== undefined && w0_norm2 > 1e-20) {
    ratio_re = (wrapWeight.re * w0_re + wrapWeight.im * w0_im) / w0_norm2
    ratio_im = (wrapWeight.im * w0_re - wrapWeight.re * w0_im) / w0_norm2
    hasSpiral = Math.abs(ratio_re - 1.0) > 1e-12 || Math.abs(ratio_im) > 1e-12
  }

  let ZreBD: BernsteinDecomposition, ZimBD: BernsteinDecomposition
  let WreBD: BernsteinDecomposition, WimBD: BernsteinDecomposition

  if (!hasSpiral) {
    // No spiral, use standard periodic approach
    const sZre = mkPeriodicBSplineWithKnots(degree, [...knots], cpsZre, period)
    const sZim = mkPeriodicBSplineWithKnots(degree, [...knots], cpsZim, period)
    const sWre = mkPeriodicBSplineWithKnots(degree, [...knots], cpsWre, period)
    const sWim = mkPeriodicBSplineWithKnots(degree, [...knots], cpsWim, period)
    ZreBD = fromBSpline(sZre)
    ZimBD = fromBSpline(sZim)
    WreBD = fromBSpline(sWre)
    WimBD = fromBSpline(sWim)
  } else {
    // Spiral: unroll, apply complex scaling to wrapped CPs, then decompose
    const sZre = mkPeriodicBSplineWithKnots(degree, [...knots], cpsZre, period)
    const sZim = mkPeriodicBSplineWithKnots(degree, [...knots], cpsZim, period)
    const sWre = mkPeriodicBSplineWithKnots(degree, [...knots], cpsWre, period)
    const sWim = mkPeriodicBSplineWithKnots(degree, [...knots], cpsWim, period)

    const [tMin, tMax] = bsplineDomain(sZre)
    const p = degree
    const n = cpsZre.length

    // Compute complex inverse ratio for negative-period wraps
    const rNorm2 = ratio_re * ratio_re + ratio_im * ratio_im
    const inv_re = ratio_re / rNorm2
    const inv_im = -ratio_im / rNorm2

    // Unroll all 4 B-splines
    const openZre = unrollToOpen(sZre)
    const openZim = unrollToOpen(sZim)
    const openWre = unrollToOpen(sWre)
    const openWim = unrollToOpen(sWim)

    const cZre = cpToArray(openZre.controlPoints)
    const cZim = cpToArray(openZim.controlPoints)
    const cWre = cpToArray(openWre.controlPoints)
    const cWim = cpToArray(openWim.controlPoints)

    // Scale the first p CPs (negative-index wraps) with complex ratio^periods
    for (let i = 0; i < p; i++) {
      const logicalIdx = -p + i
      const periods = Math.floor(logicalIdx / n)
      // Compute ratio^periods (complex)
      let s_re = 1, s_im = 0
      const base_re = periods > 0 ? ratio_re : inv_re
      const base_im = periods > 0 ? ratio_im : inv_im
      const absP = Math.abs(periods)
      for (let k = 0; k < absP; k++) {
        const new_re = s_re * base_re - s_im * base_im
        const new_im = s_re * base_im + s_im * base_re
        s_re = new_re; s_im = new_im
      }

      // Apply complex scaling to Z and W pairs (mixing re/im)
      const zr = cZre[i], zi = cZim[i]
      cZre[i] = zr * s_re - zi * s_im
      cZim[i] = zr * s_im + zi * s_re

      const wr = cWre[i], wi = cWim[i]
      cWre[i] = wr * s_re - wi * s_im
      cWim[i] = wr * s_im + wi * s_re
    }

    const openKnots = (openZre.knots as { tag: 'open'; knots: number[] }).knots
    const modZre = mkOpenBSpline(p, [...openKnots], cZre)
    const modZim = mkOpenBSpline(p, [...openKnots], cZim)
    const modWre = mkOpenBSpline(p, [...openKnots], cWre)
    const modWim = mkOpenBSpline(p, [...openKnots], cWim)

    ZreBD = decomposeClampedRegion(modZre, tMin, tMax)
    ZimBD = decomposeClampedRegion(modZim, tMin, tMax)
    WreBD = decomposeClampedRegion(modWre, tMin, tMax)
    WimBD = decomposeClampedRegion(modWim, tMin, tMax)
  }

  // Differentiate each 3 times in BD domain
  const Zre_u = derivativeBD(ZreBD)
  const Zim_u = derivativeBD(ZimBD)
  const Wre_u = derivativeBD(WreBD)
  const Wim_u = derivativeBD(WimBD)

  const Zre_uu = derivativeBD(Zre_u)
  const Zim_uu = derivativeBD(Zim_u)
  const Wre_uu = derivativeBD(Wre_u)
  const Wim_uu = derivativeBD(Wim_u)

  const Zre_uuu = derivativeBD(Zre_uu)
  const Zim_uuu = derivativeBD(Zim_uu)
  const Wre_uuu = derivativeBD(Wre_uu)
  const Wim_uuu = derivativeBD(Wim_uu)

  return {
    Z: { re: ZreBD, im: ZimBD },
    Zu: { re: Zre_u, im: Zim_u },
    Zuu: { re: Zre_uu, im: Zim_uu },
    Zuuu: { re: Zre_uuu, im: Zim_uuu },
    w: { re: WreBD, im: WimBD },
    wu: { re: Wre_u, im: Wim_u },
    wuu: { re: Wre_uu, im: Wim_uu },
    wuuu: { re: Wre_uuu, im: Wim_uuu },
  }
}

export function computeComplexChenTerms(d: ComplexDerivatives): ComplexChenTerms {
  return {
    D1: complexBDSub(complexBDMul(d.Zu, d.w), complexBDMul(d.Z, d.wu)),
    D2: complexBDSub(complexBDMul(d.Zuu, d.w), complexBDMul(d.Z, d.wuu)),
    D3: complexBDSub(complexBDMul(d.Zuuu, d.w), complexBDMul(d.Z, d.wuuu)),
    D21: complexBDSub(complexBDMul(d.Zuu, d.wu), complexBDMul(d.Zu, d.wuu)),
    w: d.w,
    wu: d.wu,
    wuu: d.wuu,
  }
}

/**
 * Compute the complex curvature derivative numerator g(t).
 *
 * g = Im((D1*)² · T)
 * T = w·(D3·D1 + D1·D21 - 3/2·D2²) + 2·D1·(w'·D2 - w''·D1)
 *
 * Returns the real BD representing g(t).
 */
export function computeComplexGFromChenTerms(ct: ComplexChenTerms): BernsteinDecomposition {
  const { D1, D2, D3, D21, w, wu, wuu } = ct

  // D1conj = conjugate of D1
  const D1conj = complexBDConj(D1)

  // D1conjSq = (D1*)²
  const D1conjSq = complexBDMul(D1conj, D1conj)

  // bracket = D3·D1 + D1·D21 - 3/2·D2²
  const D3D1 = complexBDMul(D3, D1)
  const D1D21 = complexBDMul(D1, D21)
  const D2sq = complexBDMul(D2, D2)
  const bracket = complexBDSub(
    complexBDAdd(D3D1, D1D21),
    complexBDScale(1.5, D2sq)
  )

  // T_part1 = w · bracket
  const T_part1 = complexBDMul(w, bracket)

  // T_part2 = 2 · D1 · (wu·D2 - wuu·D1)
  const wuD2 = complexBDMul(wu, D2)
  const wuuD1 = complexBDMul(wuu, D1)
  const T_part2 = complexBDScale(2, complexBDMul(D1, complexBDSub(wuD2, wuuD1)))

  // T = T_part1 + T_part2
  const T = complexBDAdd(T_part1, T_part2)

  // result = (D1*)² · T · w̄
  // The w̄ factor is needed because the full formula is:
  //   g = Im((D1*)² · T / (w̄⁴·w⁵)) = Im((D1*)² · T · w̄) / |w|¹⁰
  // Since |w|¹⁰ > 0, the zeros of g are the zeros of Im((D1*)² · T · w̄).
  // For real weights w̄ = w is real, so it factors out and doesn't affect zeros.
  // For complex weights, omitting w̄ shifts the zeros.
  const result = complexBDMul(complexBDMul(D1conjSq, T), complexBDConj(w))

  // g = Im(result) — which is a real-valued BD
  return result.im
}

// ============================================================================
// Public API: Curvature Extrema Parameters
// ============================================================================

/**
 * Compute curvature extrema parameters for an open complex-rational B-spline.
 * Returns parameter values where curvature extrema occur.
 */
export function computeOpenComplexCurvatureExtremaParameters(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): number[] {
  const d = computeOpenComplexDerivativesBD(knots, cpsZre, cpsZim, cpsWre, cpsWim)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  return findZerosBD(gBD)
}

/**
 * Compute the constraint state for an open complex-rational curve.
 */
export function computeOpenComplexCurvatureConstraintState(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): ComplexRationalConstraintState {
  const d = computeOpenComplexDerivativesBD(knots, cpsZre, cpsZim, cpsWre, cpsWim)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))
  const inactive = computeOpenInactiveSet(gCPs)
  return { signs, inactiveIndices: Array.from(inactive), gCPs, grevilleAbscissae }
}

/**
 * Curvature-extrema constraint state for a CLOSED polynomial PH curve, given the
 * curve's CLAMPED homogeneous control points (W ≡ 1). The g (curvature-derivative
 * numerator) coefficients are computed on the clamped chart exactly as for an open
 * curve — but the inactive set is the PERIODIC (wrap-aware) one, so an alternating
 * run may straddle the seam (g[n−1]↔g[0]). That lets a curvature extremum slide
 * across the seam — leave one end and enter the other — while its count is held.
 * No periodic curve fit is needed: the clamped g's two endpoint coefficients are
 * exactly the two sides of the seam, g(1⁻) and g(0⁺).
 */
export function computeClosedPolynomialCurvatureConstraintState(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): ComplexRationalConstraintState {
  const d = computeOpenComplexDerivativesBD(knots, cpsZre, cpsZim, cpsWre, cpsWim)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))
  const inactive = computePeriodicInactiveSet(gCPs)
  return { signs, inactiveIndices: Array.from(inactive), gCPs, grevilleAbscissae }
}

/**
 * Compute curvature extrema parameters for a periodic complex-rational B-spline.
 * Returns parameter values where curvature extrema occur.
 */
export function computeComplexCurvatureExtremaParameters(
  degree: number,
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  period: number = 1.0
): number[] {
  const d = computePeriodicComplexDerivativesBD(degree, knots, cpsZre, cpsZim, cpsWre, cpsWim, period)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  return findZerosBD(gBD)
}

/**
 * Compute curvature extrema parameters for a closed complex-rational B-spline.
 * Handles wrap-around zero detection at the periodic boundary.
 */
export function computeClosedComplexCurvatureExtremaParameters(
  degree: number,
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  period: number = 1.0,
  wrapWeight?: { re: number; im: number }
): number[] {
  if (cpsZre.length < 2) return []

  const d = computePeriodicComplexDerivativesBD(degree, knots, cpsZre, cpsZim, cpsWre, cpsWim, period, wrapWeight)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  const zeros = findZerosBD(gBD)

  // Check for a zero at the periodic wrap-around (t=period ≡ t=0)
  const nSpans = gBD.controlPointsArray.length
  if (nSpans > 0) {
    const lastCoeffs = gBD.controlPointsArray[nSpans - 1]
    const firstCoeffs = gBD.controlPointsArray[0]
    const valEnd = lastCoeffs[lastCoeffs.length - 1]
    const valStart = firstCoeffs[0]

    const hasSignChange = (valEnd > 0 && valStart < 0) || (valEnd < 0 && valStart > 0)
    const avgMagnitude = (Math.abs(valEnd) + Math.abs(valStart)) / 2
    const zeroThreshold = Math.max(avgMagnitude * 1e-6, 1e-10)
    const endNearZero = Math.abs(valEnd) < zeroThreshold
    const startNearZero = Math.abs(valStart) < zeroThreshold

    if (hasSignChange || endNearZero || startNearZero) {
      const tol = 1e-7
      const periodEnd = gBD.distinctKnots[gBD.distinctKnots.length - 1]
      const hasNearStart = zeros.length > 0 && zeros[0] < tol
      const hasNearEnd = zeros.length > 0 && (periodEnd - zeros[zeros.length - 1]) < tol
      if (!hasNearStart && !hasNearEnd) {
        zeros.unshift(0)
      }
    }
  }

  return zeros
}

// ============================================================================
// Constraint State
// ============================================================================

export interface ComplexRationalConstraintState {
  signs: number[]
  inactiveIndices: number[]
  gCPs: number[]
  grevilleAbscissae: number[]
}

/**
 * Compute the constraint state for a closed complex-rational curve.
 */
export function computeComplexCurvatureConstraintState(
  degree: number,
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  period: number = 1.0,
  wrapWeight?: { re: number; im: number }
): ComplexRationalConstraintState {
  const d = computePeriodicComplexDerivativesBD(degree, knots, cpsZre, cpsZim, cpsWre, cpsWim, period, wrapWeight)
  const ct = computeComplexChenTerms(d)
  const gBD = computeComplexGFromChenTerms(ct)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()

  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))
  const inactive = computePeriodicInactiveSet(gCPs)

  return {
    signs,
    inactiveIndices: Array.from(inactive),
    gCPs,
    grevilleAbscissae,
  }
}

// ============================================================================
// Periodic Inactive Set (with wrap-around) — same pattern as PeriodicRationalBSplineCurveProblem
// ============================================================================

function computeOpenInactiveSet(gCPs: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gCPs.length
  if (n === 0) return inactive

  const sequences: { idx: number; absVal: number }[][] = []
  let i = 0
  while (i < n - 1) {
    if (gCPs[i] * gCPs[i + 1] <= 0) {
      const sequence: { idx: number; absVal: number }[] = [
        { idx: i, absVal: Math.abs(gCPs[i]) },
        { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
      ]
      let j = i + 1
      while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
        j++
        sequence.push({ idx: j, absVal: Math.abs(gCPs[j]) })
      }
      sequences.push(sequence)
      i = j + 1
    } else {
      i++
    }
  }

  for (const sequence of sequences) {
    const maxEntry = sequence.reduce((max, entry) => entry.absVal > max.absVal ? entry : max)
    for (const entry of sequence) {
      if (entry.idx !== maxEntry.idx) inactive.add(entry.idx)
    }
  }

  return inactive
}

function computePeriodicInactiveSet(gCPs: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gCPs.length
  if (n === 0) return inactive

  const sequences: { idx: number; absVal: number }[][] = []
  let i = 0
  while (i < n - 1) {
    if (gCPs[i] * gCPs[i + 1] <= 0) {
      const sequence: { idx: number; absVal: number }[] = [
        { idx: i, absVal: Math.abs(gCPs[i]) },
        { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
      ]
      let j = i + 1
      while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
        j++
        sequence.push({ idx: j, absVal: Math.abs(gCPs[j]) })
      }
      sequences.push(sequence)
      i = j + 1
    } else {
      i++
    }
  }

  // Periodic wrap-around
  if (gCPs[n - 1] * gCPs[0] <= 0) {
    const wrapSequence: { idx: number; absVal: number }[] = [
      { idx: n - 1, absVal: Math.abs(gCPs[n - 1]) },
      { idx: 0, absVal: Math.abs(gCPs[0]) },
    ]
    const lastSeq = sequences.length > 0 ? sequences[sequences.length - 1] : null
    if (lastSeq && lastSeq[lastSeq.length - 1].idx === n - 1) {
      for (let k = 0; k < lastSeq.length - 1; k++) wrapSequence.unshift(lastSeq[k])
      sequences.pop()
    }
    const firstSeq = sequences.length > 0 ? sequences[0] : null
    if (firstSeq && firstSeq[0].idx === 0) {
      for (let k = 1; k < firstSeq.length; k++) wrapSequence.push(firstSeq[k])
      sequences.shift()
    }
    sequences.push(wrapSequence)
  }

  for (const sequence of sequences) {
    const maxEntry = sequence.reduce((max, entry) => entry.absVal > max.absVal ? entry : max)
    for (const entry of sequence) {
      if (entry.idx !== maxEntry.idx) inactive.add(entry.idx)
    }
  }

  return inactive
}

// ============================================================================
// Complex Homogeneous Jacobian (Stage 1)
// ============================================================================

/**
 * Compute the Jacobian ∂g/∂(Zre_i, Zim_i, Wre_i, Wim_i) for the complex g(t).
 *
 * This follows the same analytical pattern as computePeriodicRationalExplicitJacobian
 * in algebra.ts, but extended for complex-valued Chen terms.
 *
 * Returns a matrix where jacobian[j][col] = ∂g_j/∂var_col
 * Variables are ordered: [Zre_0..Zre_{n-1}, Zim_0..Zim_{n-1}, Wre_0..Wre_{n-1}, Wim_0..Wim_{n-1}]
 */
export function computeComplexHomogeneousJacobian(
  precomputed: PrecomputedPeriodicRationalBasisDerivatives,
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = precomputed.numControlPoints

  // Build current derivatives and Chen terms using precomputed basis
  const { derivatives, chenTerms } = computeComplexCurveStateFromCache(
    precomputed, cpsZre, cpsZim, cpsWre, cpsWim
  )

  // Compute current g and its degree for indexing
  const gBD = computeComplexGFromChenTerms(chenTerms)
  const gDegree = gBD.degree
  const cpsPerSpan = gDegree + 1

  const numActiveConstraints = activeConstraintIndices.length
  const jacobian: number[][] = []
  for (let j = 0; j < numActiveConstraints; j++) {
    jacobian[j] = new Array(4 * n).fill(0)
  }

  const storeJacobian = (i: number, colOffset: number, dgCPs: number[], start: number) => {
    const localStart = start * cpsPerSpan
    for (let aj = 0; aj < numActiveConstraints; aj++) {
      const globalJ = activeConstraintIndices[aj]
      const localJ = globalJ - localStart
      if (localJ >= 0 && localJ < dgCPs.length) {
        jacobian[aj][colOffset + i] = dgCPs[localJ]
      }
    }
  }

  // For each control point i, compute all 4 partial derivatives
  for (let i = 0; i < n; i++) {
    const [start, end] = precomputed.support[i]

    // Get basis function BDs for this control point
    const Ni = precomputed.basisFunctions[i].subset(start, end)
    const Ni_u = precomputed.dBasisFunctions_du[i].subset(start, end)
    const Ni_uu = precomputed.d2BasisFunctions_du2[i].subset(start, end)
    const Ni_uuu = precomputed.d3BasisFunctions_du3[i].subset(start, end)

    // Current complex quantities (subsetted)
    const Z_re_sub = derivatives.Z.re.subset(start, end)
    const Z_im_sub = derivatives.Z.im.subset(start, end)
    const Zu_re_sub = derivatives.Zu.re.subset(start, end)
    const Zu_im_sub = derivatives.Zu.im.subset(start, end)
    const Zuu_re_sub = derivatives.Zuu.re.subset(start, end)
    const Zuu_im_sub = derivatives.Zuu.im.subset(start, end)
    const Zuuu_re_sub = derivatives.Zuuu.re.subset(start, end)
    const Zuuu_im_sub = derivatives.Zuuu.im.subset(start, end)
    const w_re_sub = derivatives.w.re.subset(start, end)
    const w_im_sub = derivatives.w.im.subset(start, end)
    const wu_re_sub = derivatives.wu.re.subset(start, end)
    const wu_im_sub = derivatives.wu.im.subset(start, end)
    const wuu_re_sub = derivatives.wuu.re.subset(start, end)
    const wuu_im_sub = derivatives.wuu.im.subset(start, end)
    const wuuu_re_sub = derivatives.wuuu.re.subset(start, end)
    const wuuu_im_sub = derivatives.wuuu.im.subset(start, end)

    // Chen terms subsetted
    const D1_re_sub = chenTerms.D1.re.subset(start, end)
    const D1_im_sub = chenTerms.D1.im.subset(start, end)
    const D2_re_sub = chenTerms.D2.re.subset(start, end)
    const D2_im_sub = chenTerms.D2.im.subset(start, end)
    const D3_re_sub = chenTerms.D3.re.subset(start, end)
    const D3_im_sub = chenTerms.D3.im.subset(start, end)
    const D21_re_sub = chenTerms.D21.re.subset(start, end)
    const D21_im_sub = chenTerms.D21.im.subset(start, end)

    // ∂g/∂Zre_i: Ni affects Z_re and thus changes Chen terms in re part
    {
      const dgCPs = computePartialG_Zre(
        Ni, Ni_u, Ni_uu, Ni_uuu,
        w_re_sub, w_im_sub, wu_re_sub, wu_im_sub, wuu_re_sub, wuu_im_sub, wuuu_re_sub, wuuu_im_sub,
        D1_re_sub, D1_im_sub, D2_re_sub, D2_im_sub, D3_re_sub, D3_im_sub, D21_re_sub, D21_im_sub,
        chenTerms, start, end
      )
      storeJacobian(i, 0, dgCPs, start)
    }

    // ∂g/∂Zim_i: Ni affects Z_im and thus changes Chen terms in im part
    {
      const dgCPs = computePartialG_Zim(
        Ni, Ni_u, Ni_uu, Ni_uuu,
        w_re_sub, w_im_sub, wu_re_sub, wu_im_sub, wuu_re_sub, wuu_im_sub, wuuu_re_sub, wuuu_im_sub,
        D1_re_sub, D1_im_sub, D2_re_sub, D2_im_sub, D3_re_sub, D3_im_sub, D21_re_sub, D21_im_sub,
        chenTerms, start, end
      )
      storeJacobian(i, n, dgCPs, start)
    }

    // ∂g/∂Wre_i: Ni affects w_re and thus changes Chen terms and w/wu/wuu in g
    {
      const dgCPs = computePartialG_Wre(
        Ni, Ni_u, Ni_uu, Ni_uuu,
        Z_re_sub, Z_im_sub, Zu_re_sub, Zu_im_sub, Zuu_re_sub, Zuu_im_sub, Zuuu_re_sub, Zuuu_im_sub,
        D1_re_sub, D1_im_sub, D2_re_sub, D2_im_sub, D3_re_sub, D3_im_sub, D21_re_sub, D21_im_sub,
        chenTerms, start, end
      )
      storeJacobian(i, 2 * n, dgCPs, start)
    }

    // ∂g/∂Wim_i: Ni affects w_im
    {
      const dgCPs = computePartialG_Wim(
        Ni, Ni_u, Ni_uu, Ni_uuu,
        Z_re_sub, Z_im_sub, Zu_re_sub, Zu_im_sub, Zuu_re_sub, Zuu_im_sub, Zuuu_re_sub, Zuuu_im_sub,
        D1_re_sub, D1_im_sub, D2_re_sub, D2_im_sub, D3_re_sub, D3_im_sub, D21_re_sub, D21_im_sub,
        chenTerms, start, end
      )
      storeJacobian(i, 3 * n, dgCPs, start)
    }
  }

  return jacobian
}

// ============================================================================
// Finite-Difference Jacobian for Complex-Rational Curves
// ============================================================================

/**
 * Compute the Jacobian of g(t) control points w.r.t. geometric variables
 * (control point positions + Farin positions) using central finite differences.
 *
 * Variables: [x0..x_{n-1}, y0..y_{n-1}, qx0..qx_{m-1}, qy0..qy_{m-1}]
 *
 * This is used as the primary Jacobian method, with analytical verification in tests.
 */
export function computeComplexGeometricJacobianFD(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  activeConstraintIndices: number[],
  period: number = 1.0,
  closed: boolean = true
): number[][] {
  const n = controlPoints.length
  const m = farinPositions.length
  const numVars = 2 * n + 2 * m
  const numActive = activeConstraintIndices.length

  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) {
    jacobian[j] = new Array(numVars).fill(0)
  }

  const h = 1e-7

  // Compute g(t) CPs at current state

  // Perturb each variable and compute finite difference
  for (let v = 0; v < numVars; v++) {
    // Create perturbed copies
    const cpPlus = controlPoints.map(p => ({ ...p }))
    const fpPlus = farinPositions.map(p => ({ ...p }))
    const cpMinus = controlPoints.map(p => ({ ...p }))
    const fpMinus = farinPositions.map(p => ({ ...p }))

    if (v < n) {
      // x_i (re part of control point)
      cpPlus[v].re += h
      cpMinus[v].re -= h
    } else if (v < 2 * n) {
      // y_i (im part of control point)
      cpPlus[v - n].im += h
      cpMinus[v - n].im -= h
    } else if (v < 2 * n + m) {
      // qx_j (x part of Farin point)
      fpPlus[v - 2 * n].x += h
      fpMinus[v - 2 * n].x -= h
    } else {
      // qy_j (y part of Farin point)
      fpPlus[v - 2 * n - m].y += h
      fpMinus[v - 2 * n - m].y -= h
    }

    const gPlus = computeGCPsFromGeometric(degree, knots, cpPlus, fpPlus, period, closed)
    const gMinus = computeGCPsFromGeometric(degree, knots, cpMinus, fpMinus, period, closed)

    for (let aj = 0; aj < numActive; aj++) {
      const idx = activeConstraintIndices[aj]
      jacobian[aj][v] = (gPlus[idx] - gMinus[idx]) / (2 * h)
    }
  }

  return jacobian
}

/**
 * Compute g(t) CPs from geometric variables (control points + Farin positions).
 * Reconstructs homogeneous coordinates via the Farin weight chain.
 */
export function computeGCPsFromGeometric(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  period: number = 1.0,
  closed: boolean = true
): number[] {
  const n = controlPoints.length

  // Compute complex weights from Farin positions
  const weights = computeWeightChain(controlPoints, farinPositions)

  // Compute homogeneous coordinates Z = z * w
  const cpsZre: number[] = []
  const cpsZim: number[] = []
  const cpsWre: number[] = []
  const cpsWim: number[] = []

  for (let i = 0; i < n; i++) {
    const z_re = controlPoints[i].re
    const z_im = controlPoints[i].im
    const w_re = weights[i].re
    const w_im = weights[i].im

    // Z = z * w (complex multiply)
    cpsZre.push(z_re * w_re - z_im * w_im)
    cpsZim.push(z_re * w_im + z_im * w_re)
    cpsWre.push(w_re)
    cpsWim.push(w_im)
  }

  let d: ComplexDerivatives
  if (closed) {
    // Compute wrapWeight from the weight chain for proper spiral handling
    const wrapWeight = computeWrapWeightFromChain(controlPoints, farinPositions, weights)
    d = computePeriodicComplexDerivativesBD(degree, knots, cpsZre, cpsZim, cpsWre, cpsWim, period, wrapWeight)
  } else {
    // Open curve: use clamped knot vector directly
    d = computeOpenComplexDerivativesBD([...knots], cpsZre, cpsZim, cpsWre, cpsWim)
  }

  const ct = computeComplexChenTerms(d)
  return computeComplexGFromChenTerms(ct).flattenControlPoints()
}

/**
 * Compute complex weight chain from control points and Farin positions.
 * w_0 = 1+0i, w_{k+1} = w_k * (q_k - z_k) / (z_{k+1} - q_k)
 */
function computeWeightChain(
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[]
): { re: number; im: number }[] {
  const n = controlPoints.length
  const weights: { re: number; im: number }[] = [{ re: 1, im: 0 }]

  for (let i = 1; i < n; i++) {
    const q = farinPositions[i - 1]
    const z0 = controlPoints[i - 1]
    const z1 = controlPoints[i]
    const wPrev = weights[i - 1]

    // num = q - z0 (complex)
    const num_re = q.x - z0.re
    const num_im = q.y - z0.im

    // denom = z1 - q (complex)
    const denom_re = z1.re - q.x
    const denom_im = z1.im - q.y

    // ratio = num / denom
    const d2 = denom_re * denom_re + denom_im * denom_im
    if (d2 < 1e-20) {
      weights.push({ ...wPrev })
      continue
    }
    const ratio_re = (num_re * denom_re + num_im * denom_im) / d2
    const ratio_im = (num_im * denom_re - num_re * denom_im) / d2

    // w = wPrev * ratio
    weights.push({
      re: wPrev.re * ratio_re - wPrev.im * ratio_im,
      im: wPrev.re * ratio_im + wPrev.im * ratio_re,
    })
  }

  return weights
}

/**
 * Compute wrap weight from the last Farin position.
 */
export function computeWrapWeightFromChain(
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  weights: { re: number; im: number }[]
): { re: number; im: number } {
  const n = controlPoints.length
  const qLast = farinPositions[n - 1]
  const zLast = controlPoints[n - 1]
  const zFirst = controlPoints[0]
  const wLast = weights[n - 1]

  const num_re = qLast.x - zLast.re
  const num_im = qLast.y - zLast.im
  const denom_re = zFirst.re - qLast.x
  const denom_im = zFirst.im - qLast.y

  const d2 = denom_re * denom_re + denom_im * denom_im
  if (d2 < 1e-20) {
    return { ...wLast }
  }
  const ratio_re = (num_re * denom_re + num_im * denom_im) / d2
  const ratio_im = (num_im * denom_re - num_re * denom_im) / d2

  return {
    re: wLast.re * ratio_re - wLast.im * ratio_im,
    im: wLast.re * ratio_im + wLast.im * ratio_re,
  }
}

// ============================================================================
// Internal: Compute complex curve state from precomputed basis
// ============================================================================

export function computeComplexCurveStateFromCache(
  precomputed: PrecomputedPeriodicRationalBasisDerivatives | {
    basisFunctions: BernsteinDecomposition[]
    dBasisFunctions_du: BernsteinDecomposition[]
    d2BasisFunctions_du2: BernsteinDecomposition[]
    d3BasisFunctions_du3: BernsteinDecomposition[]
  },
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): { derivatives: ComplexDerivatives; chenTerms: ComplexChenTerms } {
  const n = precomputed.basisFunctions.length
  const numSpans = precomputed.basisFunctions[0].controlPointsArray.length

  const zeroBDRef = precomputed.basisFunctions[0]
  const firstBDRef = precomputed.dBasisFunctions_du[0]
  const secondBDRef = precomputed.d2BasisFunctions_du2[0]
  const thirdBDRef = precomputed.d3BasisFunctions_du3[0]

  const degree0 = zeroBDRef.degree
  const degree1 = firstBDRef.degree
  const degree2 = secondBDRef.degree
  const degree3 = thirdBDRef.degree

  const init = (deg: number) => {
    const spans: number[][] = []
    for (let s = 0; s < numSpans; s++) spans.push(new Array(deg + 1).fill(0))
    return spans
  }

  // 4 components × 4 derivative levels = 16 span arrays
  const ZreSpans = init(degree0), ZimSpans = init(degree0), WreSpans = init(degree0), WimSpans = init(degree0)
  const ZreuSpans = init(degree1), ZimuSpans = init(degree1), WreuSpans = init(degree1), WimuSpans = init(degree1)
  const ZreuuSpans = init(degree2), ZimuuSpans = init(degree2), WreuuSpans = init(degree2), WimuuSpans = init(degree2)
  const ZreuuuSpans = init(degree3), ZimuuuSpans = init(degree3), WreuuuSpans = init(degree3), WimuuuSpans = init(degree3)

  for (let i = 0; i < n; i++) {
    const zr = cpsZre[i], zi = cpsZim[i], wr = cpsWre[i], wi = cpsWim[i]

    for (let s = 0; s < numSpans; s++) {
      const b0 = precomputed.basisFunctions[i].controlPointsArray[s]
      const b1 = precomputed.dBasisFunctions_du[i].controlPointsArray[s]
      const b2 = precomputed.d2BasisFunctions_du2[i].controlPointsArray[s]
      const b3 = precomputed.d3BasisFunctions_du3[i].controlPointsArray[s]

      for (let c = 0; c <= degree0; c++) {
        ZreSpans[s][c] += zr * b0[c]; ZimSpans[s][c] += zi * b0[c]
        WreSpans[s][c] += wr * b0[c]; WimSpans[s][c] += wi * b0[c]
      }
      for (let c = 0; c <= degree1; c++) {
        ZreuSpans[s][c] += zr * b1[c]; ZimuSpans[s][c] += zi * b1[c]
        WreuSpans[s][c] += wr * b1[c]; WimuSpans[s][c] += wi * b1[c]
      }
      for (let c = 0; c <= degree2; c++) {
        ZreuuSpans[s][c] += zr * b2[c]; ZimuuSpans[s][c] += zi * b2[c]
        WreuuSpans[s][c] += wr * b2[c]; WimuuSpans[s][c] += wi * b2[c]
      }
      for (let c = 0; c <= degree3; c++) {
        ZreuuuSpans[s][c] += zr * b3[c]; ZimuuuSpans[s][c] += zi * b3[c]
        WreuuuSpans[s][c] += wr * b3[c]; WimuuuSpans[s][c] += wi * b3[c]
      }
    }
  }

  const mk = (spans: number[][], ref: BernsteinDecomposition) =>
    new BernsteinDecomposition(spans, ref.distinctKnots)

  const derivatives: ComplexDerivatives = {
    Z: { re: mk(ZreSpans, zeroBDRef), im: mk(ZimSpans, zeroBDRef) },
    Zu: { re: mk(ZreuSpans, firstBDRef), im: mk(ZimuSpans, firstBDRef) },
    Zuu: { re: mk(ZreuuSpans, secondBDRef), im: mk(ZimuuSpans, secondBDRef) },
    Zuuu: { re: mk(ZreuuuSpans, thirdBDRef), im: mk(ZimuuuSpans, thirdBDRef) },
    w: { re: mk(WreSpans, zeroBDRef), im: mk(WimSpans, zeroBDRef) },
    wu: { re: mk(WreuSpans, firstBDRef), im: mk(WimuSpans, firstBDRef) },
    wuu: { re: mk(WreuuSpans, secondBDRef), im: mk(WimuuSpans, secondBDRef) },
    wuuu: { re: mk(WreuuuSpans, thirdBDRef), im: mk(WimuuuSpans, thirdBDRef) },
  }

  const chenTerms = computeComplexChenTerms(derivatives)
  return { derivatives, chenTerms }
}

// ============================================================================
// Partial derivative helpers for the complex homogeneous Jacobian
// ============================================================================

/**
 * g = Im((D1*)² · T)
 *
 * We use finite-difference on the complex BD g formula for the homogeneous Jacobian.
 * This is more reliable than the analytical expansion for complex curves.
 */
function computePartialG_Zre(
  Ni: BernsteinDecomposition, Ni_u: BernsteinDecomposition,
  Ni_uu: BernsteinDecomposition, Ni_uuu: BernsteinDecomposition,
  w_re: BernsteinDecomposition, w_im: BernsteinDecomposition,
  wu_re: BernsteinDecomposition, wu_im: BernsteinDecomposition,
  wuu_re: BernsteinDecomposition, wuu_im: BernsteinDecomposition,
  wuuu_re: BernsteinDecomposition, wuuu_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number
): number[] {
  // ∂D1/∂Zre_i: ∂(Z'w - Zw')/∂Zre_i = Ni_u·w_re - Ni·wu_re (re part)
  //                                    + i*(Ni_u·w_im - Ni·wu_im) (NO — that's wrong)
  // Actually D1 = Zu*w - Z*wu where Zu, Z, w, wu are all complex.
  // ∂D1_re/∂Zre_i = Ni_u*w_re - Ni*wu_re  (since ∂Zu_re/∂Zre_i = Ni_u, ∂Z_re/∂Zre_i = Ni)
  // ∂D1_im/∂Zre_i = Ni_u*w_im - Ni*wu_im  (cross terms in complex multiply: re*im)

  // Wait — complex multiply: D1 = Zu*w - Z*wu
  // D1_re = Zu_re*w_re - Zu_im*w_im - (Z_re*wu_re - Z_im*wu_im)
  // ∂D1_re/∂Zre_i = Ni_u*w_re - Ni*wu_re (from Zu_re and Z_re terms)
  // D1_im = Zu_re*w_im + Zu_im*w_re - (Z_re*wu_im + Z_im*wu_re)
  // ∂D1_im/∂Zre_i = Ni_u*w_im - Ni*wu_im

  const dD1_re = Ni_u.multiply(w_re).subtract(Ni.multiply(wu_re))
  const dD1_im = Ni_u.multiply(w_im).subtract(Ni.multiply(wu_im))

  const dD2_re = Ni_uu.multiply(w_re).subtract(Ni.multiply(wuu_re))
  const dD2_im = Ni_uu.multiply(w_im).subtract(Ni.multiply(wuu_im))

  const dD3_re = Ni_uuu.multiply(w_re).subtract(Ni.multiply(wuuu_re))
  const dD3_im = Ni_uuu.multiply(w_im).subtract(Ni.multiply(wuuu_im))

  const dD21_re = Ni_uu.multiply(wu_re).subtract(Ni_u.multiply(wuu_re))
  const dD21_im = Ni_uu.multiply(wu_im).subtract(Ni_u.multiply(wuu_im))

  return computePartialG_fromChenPartials(
    dD1_re, dD1_im, dD2_re, dD2_im, dD3_re, dD3_im, dD21_re, dD21_im,
    D1_re, D1_im, D2_re, D2_im, D3_re, D3_im, D21_re, D21_im,
    ct, start, end,
    zeroBD(Ni), zeroBD(Ni), zeroBD(Ni), zeroBD(Ni) // no direct w/wu/wuu change
  )
}

function computePartialG_Zim(
  Ni: BernsteinDecomposition, Ni_u: BernsteinDecomposition,
  Ni_uu: BernsteinDecomposition, Ni_uuu: BernsteinDecomposition,
  w_re: BernsteinDecomposition, w_im: BernsteinDecomposition,
  wu_re: BernsteinDecomposition, wu_im: BernsteinDecomposition,
  wuu_re: BernsteinDecomposition, wuu_im: BernsteinDecomposition,
  wuuu_re: BernsteinDecomposition, wuuu_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number
): number[] {
  // D1 = Zu*w - Z*wu (complex multiply)
  // D1_re = Zu_re*w_re - Zu_im*w_im - Z_re*wu_re + Z_im*wu_im
  // ∂D1_re/∂Zim_i = -Ni_u*w_im + Ni*wu_im (from Zu_im and Z_im terms)
  // D1_im = Zu_re*w_im + Zu_im*w_re - Z_re*wu_im - Z_im*wu_re
  // ∂D1_im/∂Zim_i = Ni_u*w_re - Ni*wu_re

  const neg_w_im = w_im.multiplyByScalar(-1)
  const neg_wu_im = wu_im.multiplyByScalar(-1)
  const neg_wuu_im = wuu_im.multiplyByScalar(-1)
  const neg_wuuu_im = wuuu_im.multiplyByScalar(-1)

  const dD1_re = Ni_u.multiply(neg_w_im).subtract(Ni.multiply(neg_wu_im))
  const dD1_im = Ni_u.multiply(w_re).subtract(Ni.multiply(wu_re))

  const dD2_re = Ni_uu.multiply(neg_w_im).subtract(Ni.multiply(neg_wuu_im))
  const dD2_im = Ni_uu.multiply(w_re).subtract(Ni.multiply(wuu_re))

  const dD3_re = Ni_uuu.multiply(neg_w_im).subtract(Ni.multiply(neg_wuuu_im))
  const dD3_im = Ni_uuu.multiply(w_re).subtract(Ni.multiply(wuuu_re))

  const dD21_re = Ni_uu.multiply(neg_wu_im).subtract(Ni_u.multiply(neg_wuu_im))
  const dD21_im = Ni_uu.multiply(wu_re).subtract(Ni_u.multiply(wuu_re))

  return computePartialG_fromChenPartials(
    dD1_re, dD1_im, dD2_re, dD2_im, dD3_re, dD3_im, dD21_re, dD21_im,
    D1_re, D1_im, D2_re, D2_im, D3_re, D3_im, D21_re, D21_im,
    ct, start, end,
    zeroBD(Ni), zeroBD(Ni), zeroBD(Ni), zeroBD(Ni)
  )
}

function computePartialG_Wre(
  Ni: BernsteinDecomposition, Ni_u: BernsteinDecomposition,
  Ni_uu: BernsteinDecomposition, Ni_uuu: BernsteinDecomposition,
  Z_re: BernsteinDecomposition, Z_im: BernsteinDecomposition,
  Zu_re: BernsteinDecomposition, Zu_im: BernsteinDecomposition,
  Zuu_re: BernsteinDecomposition, Zuu_im: BernsteinDecomposition,
  Zuuu_re: BernsteinDecomposition, Zuuu_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number
): number[] {
  // D1 = Zu*w - Z*wu (complex), ∂/∂Wre_i:
  // D1_re = Zu_re*w_re - Zu_im*w_im - Z_re*wu_re + Z_im*wu_im
  // ∂D1_re/∂Wre_i = Zu_re*Ni - Z_re*Ni_u  (w_re -> Ni, wu_re -> Ni_u)
  // D1_im = Zu_re*w_im + Zu_im*w_re - Z_re*wu_im - Z_im*wu_re
  // ∂D1_im/∂Wre_i = Zu_im*Ni - Z_im*Ni_u

  const dD1_re = Ni.multiply(Zu_re).subtract(Ni_u.multiply(Z_re))
  const dD1_im = Ni.multiply(Zu_im).subtract(Ni_u.multiply(Z_im))

  const dD2_re = Ni.multiply(Zuu_re).subtract(Ni_uu.multiply(Z_re))
  const dD2_im = Ni.multiply(Zuu_im).subtract(Ni_uu.multiply(Z_im))

  const dD3_re = Ni.multiply(Zuuu_re).subtract(Ni_uuu.multiply(Z_re))
  const dD3_im = Ni.multiply(Zuuu_im).subtract(Ni_uuu.multiply(Z_im))

  const dD21_re = Ni_u.multiply(Zuu_re).subtract(Ni_uu.multiply(Zu_re))
  const dD21_im = Ni_u.multiply(Zuu_im).subtract(Ni_uu.multiply(Zu_im))

  // w also appears directly in g formula — dw_re/dWre_i = Ni, dwu_re/dWre_i = Ni_u, etc.
  return computePartialG_fromChenPartials(
    dD1_re, dD1_im, dD2_re, dD2_im, dD3_re, dD3_im, dD21_re, dD21_im,
    D1_re, D1_im, D2_re, D2_im, D3_re, D3_im, D21_re, D21_im,
    ct, start, end,
    Ni, Ni_u, Ni_uu, zeroBD(Ni), // dw_re, dwu_re, dwuu_re, dw_im (0 for Wre)
  )
}

function computePartialG_Wim(
  Ni: BernsteinDecomposition, Ni_u: BernsteinDecomposition,
  Ni_uu: BernsteinDecomposition, Ni_uuu: BernsteinDecomposition,
  Z_re: BernsteinDecomposition, Z_im: BernsteinDecomposition,
  Zu_re: BernsteinDecomposition, Zu_im: BernsteinDecomposition,
  Zuu_re: BernsteinDecomposition, Zuu_im: BernsteinDecomposition,
  Zuuu_re: BernsteinDecomposition, Zuuu_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number
): number[] {
  // D1_re = Zu_re*w_re - Zu_im*w_im - Z_re*wu_re + Z_im*wu_im
  // ∂D1_re/∂Wim_i = -Zu_im*Ni + Z_im*Ni_u
  // D1_im = Zu_re*w_im + Zu_im*w_re - Z_re*wu_im - Z_im*wu_re
  // ∂D1_im/∂Wim_i = Zu_re*Ni - Z_re*Ni_u

  const dD1_re = Ni.multiply(Zu_im).multiplyByScalar(-1).add(Ni_u.multiply(Z_im))
  const dD1_im = Ni.multiply(Zu_re).subtract(Ni_u.multiply(Z_re))

  const dD2_re = Ni.multiply(Zuu_im).multiplyByScalar(-1).add(Ni_uu.multiply(Z_im))
  const dD2_im = Ni.multiply(Zuu_re).subtract(Ni_uu.multiply(Z_re))

  const dD3_re = Ni.multiply(Zuuu_im).multiplyByScalar(-1).add(Ni_uuu.multiply(Z_im))
  const dD3_im = Ni.multiply(Zuuu_re).subtract(Ni_uuu.multiply(Z_re))

  const dD21_re = Ni_u.multiply(Zuu_im).multiplyByScalar(-1).add(Ni_uu.multiply(Zu_im))
  const dD21_im = Ni_u.multiply(Zuu_re).subtract(Ni_uu.multiply(Zu_re))

  // For Wim: dw_im/dWim_i = Ni, dwu_im/dWim_i = Ni_u, dwuu_im/dWim_i = Ni_uu
  // Need to pass these as the imaginary part perturbations of w
  return computePartialG_fromChenPartialsWim(
    dD1_re, dD1_im, dD2_re, dD2_im, dD3_re, dD3_im, dD21_re, dD21_im,
    D1_re, D1_im, D2_re, D2_im, D3_re, D3_im, D21_re, D21_im,
    ct, start, end,
    Ni, Ni_u, Ni_uu,
  )
}

/**
 * Compute ∂g/∂var from the partial derivatives of Chen terms.
 * g = Im((D1*)² · T) where T = w·(D3·D1 + D1·D21 - 3/2·D2²) + 2·D1·(wu·D2 - wuu·D1)
 *
 * dw_re, dwu_re, dwuu_re are the partials of w_re, wu_re, wuu_re w.r.t. the variable.
 * dw_im is the partial of w_im w.r.t. the variable (0 for Zre, Zim, Wre perturbations).
 */
function computePartialG_fromChenPartials(
  dD1_re: BernsteinDecomposition, dD1_im: BernsteinDecomposition,
  dD2_re: BernsteinDecomposition, dD2_im: BernsteinDecomposition,
  dD3_re: BernsteinDecomposition, dD3_im: BernsteinDecomposition,
  dD21_re: BernsteinDecomposition, dD21_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number,
  dw_re: BernsteinDecomposition, dwu_re: BernsteinDecomposition,
  dwuu_re: BernsteinDecomposition, dw_im: BernsteinDecomposition,
): number[] {
  // We need ∂g/∂var where g = Im((D1*)² · T)
  // Use product rule: ∂g = Im( ∂((D1*)²) · T + (D1*)² · ∂T )

  // D1conj = D1_re - i*D1_im
  // D1conjSq = D1conj² = (D1_re² - D1_im²) - 2i·D1_re·D1_im ... wait, more precisely:
  // D1conj = (D1_re, -D1_im), D1conjSq_re = D1_re² - D1_im², D1conjSq_im = -2·D1_re·D1_im

  // ∂D1conj_re = dD1_re, ∂D1conj_im = -dD1_im
  // ∂(D1conj²)_re = 2*(D1conj_re*dD1conj_re - D1conj_im*dD1conj_im)
  //               = 2*(D1_re*dD1_re - D1_im*dD1_im)  (since D1conj_im = -D1_im, dD1conj_im = -dD1_im)
  // Wait let me be more careful.
  // D1conj_re = D1_re, D1conj_im = -D1_im
  // dD1conj_re = dD1_re, dD1conj_im = -dD1_im
  // (D1conj)^2 = D1conj * D1conj
  // ∂(D1conj²) = 2 * D1conj * ∂D1conj (complex multiplication)
  // = 2 * (D1_re - i*D1_im) * (dD1_re - i*(-dD1_im))
  // Wait: ∂D1conj = (dD1_re, -dD1_im)
  // 2 * D1conj * ∂D1conj:
  //   re: 2*(D1_re*dD1_re - (-D1_im)*(-dD1_im)) = 2*(D1_re*dD1_re - D1_im*dD1_im)
  //   im: 2*(D1_re*(-dD1_im) + (-D1_im)*dD1_re) = -2*(D1_re*dD1_im + D1_im*dD1_re)

  const dD1conjSq_re = D1_re.multiply(dD1_re).subtract(D1_im.multiply(dD1_im)).multiplyByScalar(2)
  const dD1conjSq_im = D1_re.multiply(dD1_im).add(D1_im.multiply(dD1_re)).multiplyByScalar(-2)

  // Now compute T and ∂T
  // T = w * bracket + 2*D1*(wu*D2 - wuu*D1)
  // bracket = D3*D1 + D1*D21 - 1.5*D2²

  // ∂bracket = ∂(D3*D1) + ∂(D1*D21) - 1.5*∂(D2²)
  // = dD3*D1 + D3*dD1 + dD1*D21 + D1*dD21 - 1.5*(2*D2*dD2)
  // = dD3*D1 + D3*dD1 + dD1*D21 + D1*dD21 - 3*D2*dD2

  // For complex multiply: all of these are complex BD multiplies
  const D1sub = { re: D1_re, im: D1_im }
  const D2sub = { re: D2_re, im: D2_im }
  const D3sub = { re: D3_re, im: D3_im }
  const D21sub = { re: D21_re, im: D21_im }
  const dD1 = { re: dD1_re, im: dD1_im }
  const dD2 = { re: dD2_re, im: dD2_im }
  const dD3 = { re: dD3_re, im: dD3_im }
  const dD21 = { re: dD21_re, im: dD21_im }

  const dBracket = complexBDAdd(
    complexBDAdd(
      complexBDAdd(complexBDMul(dD3, D1sub), complexBDMul(D3sub, dD1)),
      complexBDAdd(complexBDMul(dD1, D21sub), complexBDMul(D1sub, dD21))
    ),
    complexBDScale(-3, complexBDMul(D2sub, dD2))
  )

  // ∂(w*bracket) = dw*bracket + w*dBracket
  const w_sub = { re: ct.w.re.subset(start, end), im: ct.w.im.subset(start, end) }
  const wu_sub = { re: ct.wu.re.subset(start, end), im: ct.wu.im.subset(start, end) }
  const wuu_sub = { re: ct.wuu.re.subset(start, end), im: ct.wuu.im.subset(start, end) }

  const bracket = complexBDSub(
    complexBDAdd(complexBDMul(D3sub, D1sub), complexBDMul(D1sub, D21sub)),
    complexBDScale(1.5, complexBDMul(D2sub, D2sub))
  )

  const dw = { re: dw_re, im: dw_im }
  const dwu = { re: dwu_re, im: zeroBD(dw_re) } // dwu_im = 0 for Wre perturbation
  const dwuu = { re: dwuu_re, im: zeroBD(dw_re) }

  const dT_part1 = complexBDAdd(
    complexBDMul(dw, bracket),
    complexBDMul(w_sub, dBracket)
  )

  // ∂(2*D1*(wu*D2 - wuu*D1))
  // = 2*(dD1*(wu*D2 - wuu*D1) + D1*(dwu*D2 + wu*dD2 - dwuu*D1 - wuu*dD1))
  const wuD2 = complexBDMul(wu_sub, D2sub)
  const wuuD1 = complexBDMul(wuu_sub, D1sub)
  const innerTerm = complexBDSub(wuD2, wuuD1)

  const dInnerTermActual = complexBDSub(
    complexBDAdd(complexBDMul(dwu, D2sub), complexBDMul(wu_sub, dD2)),
    complexBDAdd(complexBDMul(dwuu, D1sub), complexBDMul(wuu_sub, dD1))
  )

  const dT_part2 = complexBDScale(2, complexBDAdd(
    complexBDMul(dD1, innerTerm),
    complexBDMul(D1sub, dInnerTermActual)
  ))

  const dT = complexBDAdd(dT_part1, dT_part2)

  // ∂g = Im(∂(D1conj²) * T + D1conj² * ∂T)
  // D1conjSq (current)
  const D1conjSq_re = D1_re.multiply(D1_re).subtract(D1_im.multiply(D1_im))
  const D1conjSq_im = D1_re.multiply(D1_im).multiplyByScalar(-2)
  const D1conjSq = { re: D1conjSq_re, im: D1conjSq_im }

  // Compute T (current, subsetted)
  const T = complexBDAdd(
    complexBDMul(w_sub, bracket),
    complexBDScale(2, complexBDMul(D1sub, innerTerm))
  )

  // term1 = dD1conjSq * T
  const dD1conjSqC = { re: dD1conjSq_re, im: dD1conjSq_im }
  const term1 = complexBDMul(dD1conjSqC, T)
  // term2 = D1conjSq * dT
  const term2 = complexBDMul(D1conjSq, dT)

  const result = complexBDAdd(term1, term2)
  return result.im.flattenControlPoints()
}

/**
 * Specialized version for Wim perturbation where dw_im ≠ 0.
 */
function computePartialG_fromChenPartialsWim(
  dD1_re: BernsteinDecomposition, dD1_im: BernsteinDecomposition,
  dD2_re: BernsteinDecomposition, dD2_im: BernsteinDecomposition,
  dD3_re: BernsteinDecomposition, dD3_im: BernsteinDecomposition,
  dD21_re: BernsteinDecomposition, dD21_im: BernsteinDecomposition,
  D1_re: BernsteinDecomposition, D1_im: BernsteinDecomposition,
  D2_re: BernsteinDecomposition, D2_im: BernsteinDecomposition,
  D3_re: BernsteinDecomposition, D3_im: BernsteinDecomposition,
  D21_re: BernsteinDecomposition, D21_im: BernsteinDecomposition,
  ct: ComplexChenTerms, start: number, end: number,
  Ni: BernsteinDecomposition, _Ni_u: BernsteinDecomposition, _Ni_uu: BernsteinDecomposition,
): number[] {
  // Same as computePartialG_fromChenPartials but with dw_im = Ni, dwu_im = Ni_u, dwuu_im = Ni_uu
  return computePartialG_fromChenPartials(
    dD1_re, dD1_im, dD2_re, dD2_im, dD3_re, dD3_im, dD21_re, dD21_im,
    D1_re, D1_im, D2_re, D2_im, D3_re, D3_im, D21_re, D21_im,
    ct, start, end,
    zeroBD(Ni), zeroBD(Ni), zeroBD(Ni), Ni // dw_re=0, dwu_re=0, dwuu_re=0, dw_im=Ni
  )
}

// ============================================================================
// Analytical Geometric Jacobian for Complex-Rational Curves
// ============================================================================

// ============================================================================
// Unrolled-spiral representation (closed curves)
//
// A closed complex-rational curve whose weight chain has nontrivial monodromy
// ρ = wrapWeight/w₀ ≠ 1 is decomposed by UNROLLING the periodic spline to an
// open one of n+p control points (logical indices -p..n-1) and scaling each
// wrapped copy by ρ^periods. The VALUE function computePeriodicComplexDerivativesBD
// does this; the Jacobian must differentiate the SAME representation, which is
// why we rebuild it on an unrolled basis of n+p slots here. Slot j maps to
// logical CP idxMap[j] with power periodsMap[j] (0 ⇒ unscaled).
// ============================================================================

interface UnrolledComplexBasis {
  basisFunctions: BernsteinDecomposition[]
  dBasisFunctions_du: BernsteinDecomposition[]
  d2BasisFunctions_du2: BernsteinDecomposition[]
  d3BasisFunctions_du3: BernsteinDecomposition[]
  idxMap: number[]      // slot j → logical CP index in [0,n)
  periodsMap: number[]  // slot j → integer winding (0 = unscaled)
  numUnrolled: number   // = n + p
  numSpans: number
  n: number
  p: number
}

const unrolledComplexBasisCache = new Map<string, UnrolledComplexBasis>()

export function precomputeUnrolledComplexBasis(
  degree: number,
  knots: readonly number[],
  period: number,
): UnrolledComplexBasis {
  const key = `unr-${degree}-${period}-${knots.join(',')}`
  const cached = unrolledComplexBasisCache.get(key)
  if (cached) return cached

  const n = knots.length
  const p = degree
  const numUnrolled = n + p

  // Unroll a dummy periodic spline to obtain the open knot vector + domain,
  // matching computePeriodicComplexDerivativesBD's spiral branch exactly.
  const sDummy = mkPeriodicBSplineWithKnots(degree, [...knots], new Array(n).fill(0), period)
  const [tMin, tMax] = bsplineDomain(sDummy)
  const openDummy = unrollToOpen(sDummy)
  const openKnots = (openDummy.knots as { tag: 'open'; knots: number[] }).knots

  const idxMap: number[] = []
  const periodsMap: number[] = []
  for (let j = 0; j < numUnrolled; j++) {
    const logicalIdx = -p + j
    idxMap.push(((logicalIdx % n) + n) % n)
    periodsMap.push(Math.floor(logicalIdx / n))
  }

  const basisFunctions: BernsteinDecomposition[] = []
  const dBasisFunctions_du: BernsteinDecomposition[] = []
  const d2BasisFunctions_du2: BernsteinDecomposition[] = []
  const d3BasisFunctions_du3: BernsteinDecomposition[] = []
  for (let j = 0; j < numUnrolled; j++) {
    const cp = new Array(numUnrolled).fill(0)
    cp[j] = 1
    const sUnit = mkOpenBSpline(p, [...openKnots], cp)
    const bd = decomposeClampedRegion(sUnit, tMin, tMax)
    const bd1 = derivativeBD(bd)
    const bd2 = derivativeBD(bd1)
    const bd3 = derivativeBD(bd2)
    basisFunctions.push(bd)
    dBasisFunctions_du.push(bd1)
    d2BasisFunctions_du2.push(bd2)
    d3BasisFunctions_du3.push(bd3)
  }

  const result: UnrolledComplexBasis = {
    basisFunctions,
    dBasisFunctions_du,
    d2BasisFunctions_du2,
    d3BasisFunctions_du3,
    idxMap,
    periodsMap,
    numUnrolled,
    numSpans: basisFunctions[0].controlPointsArray.length,
    n,
    p,
  }
  unrolledComplexBasisCache.set(key, result)
  return result
}

function cMul(a: { re: number; im: number }, b: { re: number; im: number }) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

// Complex integer power ρ^p (handles negative p via reciprocal), matching the
// value function's ratio^periods loop (complexAlgebra.ts:242-250).
function cpowInt(z: { re: number; im: number }, p: number): { re: number; im: number } {
  if (p === 0) return { re: 1, im: 0 }
  let base = z
  let e = p
  if (e < 0) {
    const d = z.re * z.re + z.im * z.im
    base = { re: z.re / d, im: -z.im / d }
    e = -e
  }
  let r = { re: 1, im: 0 }
  for (let k = 0; k < e; k++) r = cMul(r, base)
  return r
}

// ρ = ∏_{k=0}^{n-1} r_k over ALL n edges (wrap edge included). w₀ = 1.
function computeMonodromy(ratios: { re: number; im: number }[]): { re: number; im: number } {
  let rho = { re: 1, im: 0 }
  for (const r of ratios) rho = cMul(rho, r)
  return rho
}

/**
 * Reference implementation of the closed g(t) CPs built on the UNROLLED basis,
 * used to verify the unrolled representation reproduces computeGCPsFromGeometric
 * before differentiating it. Not used in production (the value function stays
 * computeGCPsFromGeometric); this is the differentiable twin.
 */
export function computeGCPsFromGeometricUnrolled(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  period: number = 1.0,
): number[] {
  const n = controlPoints.length
  const m = farinPositions.length
  const weights = computeWeightChain(controlPoints, farinPositions)

  const cpsZre: number[] = [], cpsZim: number[] = []
  const cpsWre: number[] = [], cpsWim: number[] = []
  for (let i = 0; i < n; i++) {
    const z_re = controlPoints[i].re, z_im = controlPoints[i].im
    const w_re = weights[i].re, w_im = weights[i].im
    cpsZre.push(z_re * w_re - z_im * w_im)
    cpsZim.push(z_re * w_im + z_im * w_re)
    cpsWre.push(w_re)
    cpsWim.push(w_im)
  }

  // Ratios over all n edges and the monodromy ρ.
  const ratios: { re: number; im: number }[] = []
  for (let k = 0; k < m; k++) {
    const z0 = controlPoints[k], z1 = controlPoints[(k + 1) % n], q = farinPositions[k]
    const b_re = z1.re - q.x, b_im = z1.im - q.y
    const d2 = b_re * b_re + b_im * b_im
    if (d2 < 1e-20) { ratios.push({ re: 0, im: 0 }); continue }
    const a_re = q.x - z0.re, a_im = q.y - z0.im
    ratios.push({ re: (a_re * b_re + a_im * b_im) / d2, im: (a_im * b_re - a_re * b_im) / d2 })
  }
  const rho = computeMonodromy(ratios)

  const pre = precomputeUnrolledComplexBasis(degree, knots, period)
  const N = pre.numUnrolled
  const uZre = new Array(N), uZim = new Array(N), uWre = new Array(N), uWim = new Array(N)
  for (let j = 0; j < N; j++) {
    const idx = pre.idxMap[j]
    const per = pre.periodsMap[j]
    const Zr = cpsZre[idx], Zi = cpsZim[idx], Wr = cpsWre[idx], Wi = cpsWim[idx]
    if (per === 0) {
      uZre[j] = Zr; uZim[j] = Zi; uWre[j] = Wr; uWim[j] = Wi
    } else {
      const s = cpowInt(rho, per)
      uZre[j] = s.re * Zr - s.im * Zi; uZim[j] = s.re * Zi + s.im * Zr
      uWre[j] = s.re * Wr - s.im * Wi; uWim[j] = s.re * Wi + s.im * Wr
    }
  }

  const { chenTerms } = computeComplexCurveStateFromCache(pre, uZre, uZim, uWre, uWim)
  return computeComplexGFromChenTerms(chenTerms).flattenControlPoints()
}

// ============================================================================
// Fixed-weight CLOSED formulation (sparse)
//
// Bound-mode editing with the WEIGHTS HELD FIXED at their current values.
// The variables are only the control-point positions z_i (2n, vs 2n+2m for
// the geometric formulation). With weights constant:
//   - ∂w_i/∂z_j = 0, so the homogeneous CP Z_i = w_i·z_i depends only on its
//     own z_i (diagonal), and
//   - the monodromy ρ (determined by the weights) is constant, so the spiral
//     derivative term vanishes entirely.
// Each Jacobian column then perturbs a single logical CP through its local
// (wrapped) basis support — recovering the sparse structure the open and
// non-rational periodic optimizers already enjoy. The value still carries the
// constant ρ^periods on the seam CPs, so it is identical to the geometric
// value (verified by the fixed-weight twin test).
// ============================================================================

interface FixedWeightClosedData {
  pre: UnrolledComplexBasis
  rho: { re: number; im: number }
  // per-logical-CP fixed weights
  wRe: number[]
  wIm: number[]
}

function prepareFixedWeightClosed(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  weights: { re: number; im: number }[],
  wrapWeight: { re: number; im: number },
  period: number,
): FixedWeightClosedData {
  const w0 = weights[0]
  const d = w0.re * w0.re + w0.im * w0.im
  const rho =
    d > 1e-20
      ? {
          re: (wrapWeight.re * w0.re + wrapWeight.im * w0.im) / d,
          im: (wrapWeight.im * w0.re - wrapWeight.re * w0.im) / d,
        }
      : { re: 1, im: 0 }
  void controlPoints
  return {
    pre: precomputeUnrolledComplexBasis(degree, knots, period),
    rho,
    wRe: weights.map((w) => w.re),
    wIm: weights.map((w) => w.im),
  }
}

// Build the unrolled homogeneous CPs (Z = w·z scaled by ρ^periods on the seam)
// for the current z positions, weights fixed.
function fixedWeightUnrolledZ(
  data: FixedWeightClosedData,
  cpRe: number[],
  cpIm: number[],
): { uZre: number[]; uZim: number[]; uWre: number[]; uWim: number[] } {
  const { pre, rho, wRe, wIm } = data
  const N = pre.numUnrolled
  const uZre = new Array<number>(N), uZim = new Array<number>(N)
  const uWre = new Array<number>(N), uWim = new Array<number>(N)
  for (let j = 0; j < N; j++) {
    const idx = pre.idxMap[j], per = pre.periodsMap[j]
    const wr = wRe[idx], wi = wIm[idx]
    const zr = cpRe[idx], zi = cpIm[idx]
    const Zr = wr * zr - wi * zi, Zi = wr * zi + wi * zr
    if (per === 0) {
      uZre[j] = Zr; uZim[j] = Zi; uWre[j] = wr; uWim[j] = wi
    } else {
      const s = cpowInt(rho, per)
      uZre[j] = s.re * Zr - s.im * Zi; uZim[j] = s.re * Zi + s.im * Zr
      uWre[j] = s.re * wr - s.im * wi; uWim[j] = s.re * wi + s.im * wr
    }
  }
  return { uZre, uZim, uWre, uWim }
}

/**
 * Closed g(t) CPs with weights HELD FIXED — value function for the sparse
 * fixed-weight formulation. Identical to computeGCPsFromGeometricUnrolled at
 * the same z positions and weights; this variant takes weights + wrapWeight
 * directly instead of reconstructing them from Farin points.
 */
export function computeGCPsFromFixedWeightClosed(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  weights: { re: number; im: number }[],
  wrapWeight: { re: number; im: number },
  period: number = 1.0,
): number[] {
  const data = prepareFixedWeightClosed(degree, knots, controlPoints, weights, wrapWeight, period)
  const cpRe = controlPoints.map((p) => p.re)
  const cpIm = controlPoints.map((p) => p.im)
  const { uZre, uZim, uWre, uWim } = fixedWeightUnrolledZ(data, cpRe, cpIm)
  const { chenTerms } = computeComplexCurveStateFromCache(data.pre, uZre, uZim, uWre, uWim)
  return computeComplexGFromChenTerms(chenTerms).flattenControlPoints()
}

/**
 * Sparse Jacobian ∂g/∂z for the closed fixed-weight formulation.
 *
 * Variables: [x_0..x_{n-1}, y_0..y_{n-1}] (2n). Weights and ρ are constant,
 * so column v perturbs exactly one logical CP through the (wrapped) basis;
 * buildPerturbBDs skips the zero-perturbation slots automatically, giving a
 * sparse column. Returns rows for activeConstraintIndices, cols 0..2n-1.
 */
export function computeFixedWeightClosedJacobian(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  weights: { re: number; im: number }[],
  wrapWeight: { re: number; im: number },
  activeConstraintIndices: number[],
  period: number = 1.0,
): number[][] {
  const n = controlPoints.length
  const numVars = 2 * n
  const numActive = activeConstraintIndices.length
  const data = prepareFixedWeightClosed(degree, knots, controlPoints, weights, wrapWeight, period)
  const cpRe = controlPoints.map((p) => p.re)
  const cpIm = controlPoints.map((p) => p.im)
  const { pre, rho, wRe, wIm } = data
  const N = pre.numUnrolled
  const numSpans = pre.numSpans

  // Base state on the unrolled basis.
  const base = fixedWeightUnrolledZ(data, cpRe, cpIm)
  const { derivatives: deriv, chenTerms: ct } = computeComplexCurveStateFromCache(
    pre, base.uZre, base.uZim, base.uWre, base.uWim
  )

  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) jacobian[j] = new Array(numVars).fill(0)

  for (let v = 0; v < numVars; v++) {
    const cpIdx = v < n ? v : v - n
    const dzRe = v < n ? 1 : 0
    const dzIm = v < n ? 0 : 1
    // ∂Z_cpIdx/∂v = (dz)·w_cpIdx ; weights fixed ⇒ ∂w = 0.
    const wr = wRe[cpIdx], wi = wIm[cpIdx]
    const dZ = { re: dzRe * wr - dzIm * wi, im: dzRe * wi + dzIm * wr }

    // Per-unrolled-slot perturbation: only slots mapping to cpIdx are nonzero,
    // scaled by the constant ρ^periods (no ∂ρ term — ρ is fixed).
    const duZre = new Array<number>(N).fill(0)
    const duZim = new Array<number>(N).fill(0)
    const duWre = new Array<number>(N).fill(0)
    const duWim = new Array<number>(N).fill(0)
    for (let j = 0; j < N; j++) {
      if (pre.idxMap[j] !== cpIdx) continue
      const per = pre.periodsMap[j]
      if (per === 0) {
        duZre[j] = dZ.re; duZim[j] = dZ.im
      } else {
        const s = cpowInt(rho, per)
        duZre[j] = s.re * dZ.re - s.im * dZ.im
        duZim[j] = s.re * dZ.im + s.im * dZ.re
      }
    }

    const pBDs = buildPerturbBDs(pre, numSpans, duZre, duZim, duWre, duWim)

    const dD1 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zu, deriv.w), complexBDMul(deriv.Zu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wu), complexBDMul(deriv.Z, pBDs.wu))
    )
    const dD2 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuu, deriv.w), complexBDMul(deriv.Zuu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wuu), complexBDMul(deriv.Z, pBDs.wuu))
    )
    const dD3 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuuu, deriv.w), complexBDMul(deriv.Zuuu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wuuu), complexBDMul(deriv.Z, pBDs.wuuu))
    )
    const dD21 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuu, deriv.wu), complexBDMul(deriv.Zuu, pBDs.wu)),
      complexBDAdd(complexBDMul(pBDs.Zu, deriv.wuu), complexBDMul(deriv.Zu, pBDs.wuu))
    )

    const dgCPs = computeDgFromPerts(
      ct.D1, ct.D2, ct.D3, ct.D21, ct.w, ct.wu, ct.wuu,
      dD1, dD2, dD3, dD21, pBDs.w, pBDs.wu, pBDs.wuu,
    )

    for (let aj = 0; aj < numActive; aj++) {
      const idx = activeConstraintIndices[aj]
      if (idx >= 0 && idx < dgCPs.length) jacobian[aj][v] = dgCPs[idx]
    }
  }

  return jacobian
}

/**
 * Introspection (validation only): return the well-conditioned intermediates
 * of the closed unrolled representation — the monodromy ρ and the per-slot
 * unrolled homogeneous CPs (uZ, uW) — so their analytical derivatives can be
 * FD-checked WITHOUT g's catastrophic cancellation.
 */
export function computeUnrolledIntermediates(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  period: number = 1.0,
): { rho: { re: number; im: number }; uZre: number[]; uZim: number[]; uWre: number[]; uWim: number[] } {
  const n = controlPoints.length
  const m = farinPositions.length
  const weights = computeWeightChain(controlPoints, farinPositions)
  const cpsZre: number[] = [], cpsZim: number[] = [], cpsWre: number[] = [], cpsWim: number[] = []
  for (let i = 0; i < n; i++) {
    const w_re = weights[i].re, w_im = weights[i].im
    cpsZre.push(controlPoints[i].re * w_re - controlPoints[i].im * w_im)
    cpsZim.push(controlPoints[i].re * w_im + controlPoints[i].im * w_re)
    cpsWre.push(w_re); cpsWim.push(w_im)
  }
  const ratios: { re: number; im: number }[] = []
  for (let k = 0; k < m; k++) {
    const z0 = controlPoints[k], z1 = controlPoints[(k + 1) % n], q = farinPositions[k]
    const b_re = z1.re - q.x, b_im = z1.im - q.y
    const d2 = b_re * b_re + b_im * b_im
    if (d2 < 1e-20) { ratios.push({ re: 0, im: 0 }); continue }
    const a_re = q.x - z0.re, a_im = q.y - z0.im
    ratios.push({ re: (a_re * b_re + a_im * b_im) / d2, im: (a_im * b_re - a_re * b_im) / d2 })
  }
  const rho = computeMonodromy(ratios)
  const pre = precomputeUnrolledComplexBasis(degree, knots, period)
  const N = pre.numUnrolled
  const uZre = new Array<number>(N), uZim = new Array<number>(N)
  const uWre = new Array<number>(N), uWim = new Array<number>(N)
  for (let j = 0; j < N; j++) {
    const idx = pre.idxMap[j], per = pre.periodsMap[j]
    const Zr = cpsZre[idx], Zi = cpsZim[idx], Wr = cpsWre[idx], Wi = cpsWim[idx]
    if (per === 0) { uZre[j] = Zr; uZim[j] = Zi; uWre[j] = Wr; uWim[j] = Wi }
    else {
      const s = cpowInt(rho, per)
      uZre[j] = s.re * Zr - s.im * Zi; uZim[j] = s.re * Zi + s.im * Zr
      uWre[j] = s.re * Wr - s.im * Wi; uWim[j] = s.re * Wi + s.im * Wr
    }
  }
  return { rho, uZre, uZim, uWre, uWim }
}

/**
 * Introspection (validation only): the analytical derivatives of the
 * intermediates above w.r.t. one geometric variable v — ∂ρ/∂v and the
 * per-slot ∂(uZ,uW)/∂v as built inside the closed Jacobian. Mirrors exactly
 * the per-column construction so a clean FD check here certifies the
 * spiral-derivative math independent of g.
 */
export function computeUnrolledIntermediateDerivatives(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  v: number,
  period: number = 1.0,
): { drho: { re: number; im: number }; duZre: number[]; duZim: number[]; duWre: number[]; duWim: number[] } {
  const n = controlPoints.length
  const m = farinPositions.length
  const weights = computeWeightChain(controlPoints, farinPositions)
  const cpsZre: number[] = [], cpsZim: number[] = [], cpsWre: number[] = [], cpsWim: number[] = []
  for (let i = 0; i < n; i++) {
    const w_re = weights[i].re, w_im = weights[i].im
    cpsZre.push(controlPoints[i].re * w_re - controlPoints[i].im * w_im)
    cpsZim.push(controlPoints[i].re * w_im + controlPoints[i].im * w_re)
    cpsWre.push(w_re); cpsWim.push(w_im)
  }
  const ratios: { re: number; im: number }[] = []
  for (let k = 0; k < m; k++) {
    const z0 = controlPoints[k], z1 = controlPoints[(k + 1) % n], q = farinPositions[k]
    const b_re = z1.re - q.x, b_im = z1.im - q.y
    const d2 = b_re * b_re + b_im * b_im
    if (d2 < 1e-20) { ratios.push({ re: 0, im: 0 }); continue }
    const a_re = q.x - z0.re, a_im = q.y - z0.im
    ratios.push({ re: (a_re * b_re + a_im * b_im) / d2, im: (a_im * b_re - a_re * b_im) / d2 })
  }
  const rho = computeMonodromy(ratios)
  const pre = precomputeUnrolledComplexBasis(degree, knots, period)
  const N = pre.numUnrolled

  const dw = weightChainDerivative(v, n, m, controlPoints, farinPositions, weights, ratios)
  // ∂Z_i/∂v, ∂w_i/∂v per logical CP
  const dZreL: number[] = [], dZimL: number[] = [], dWreL: number[] = [], dWimL: number[] = []
  for (let k = 0; k < n; k++) {
    const z_re = controlPoints[k].re, z_im = controlPoints[k].im
    const w_re = weights[k].re, w_im = weights[k].im
    const dzRe = (v < n && v === k) ? 1 : 0
    const dzIm = (v >= n && v < 2 * n && v - n === k) ? 1 : 0
    dZreL.push(dzRe * w_re - dzIm * w_im + z_re * dw[k].re - z_im * dw[k].im)
    dZimL.push(dzRe * w_im + dzIm * w_re + z_re * dw[k].im + z_im * dw[k].re)
    dWreL.push(dw[k].re); dWimL.push(dw[k].im)
  }
  const drho = monodromyDerivative(v, n, m, controlPoints, farinPositions, ratios)

  const duZre = new Array<number>(N), duZim = new Array<number>(N)
  const duWre = new Array<number>(N), duWim = new Array<number>(N)
  for (let j = 0; j < N; j++) {
    const idx = pre.idxMap[j], per = pre.periodsMap[j]
    const dZi = { re: dZreL[idx], im: dZimL[idx] }
    const dWi = { re: dWreL[idx], im: dWimL[idx] }
    if (per === 0) { duZre[j] = dZi.re; duZim[j] = dZi.im; duWre[j] = dWi.re; duWim[j] = dWi.im }
    else {
      const s = cpowInt(rho, per)
      const rp1 = cpowInt(rho, per - 1)
      const dScale = cMul({ re: per * rp1.re, im: per * rp1.im }, drho)
      const baseZ = { re: cpsZre[idx], im: cpsZim[idx] }
      const baseW = { re: cpsWre[idx], im: cpsWim[idx] }
      const tZ = cMul(s, dZi), sZ = cMul(dScale, baseZ)
      const tW = cMul(s, dWi), sW = cMul(dScale, baseW)
      duZre[j] = tZ.re + sZ.re; duZim[j] = tZ.im + sZ.im
      duWre[j] = tW.re + sW.re; duWim[j] = tW.im + sW.im
    }
  }
  return { drho, duZre, duZim, duWre, duWim }
}

/**
 * Compute the Jacobian of g(t) CPs w.r.t. geometric variables analytically.
 *
 * For each geometric variable v in [x_0..x_{n-1}, y_0..y_{n-1}, qx_0..qx_{m-1}, qy_0..qy_{m-1}]:
 * 1. Forward sweep: ∂w_k/∂v via the weight chain
 * 2. Product rule: ∂Z_k/∂v from Z_k = z_k · w_k
 * 3. Linear combination with precomputed basis → BD perturbations
 * 4. Chen term perturbations → ∂g (including w̄ factor)
 */
export function computeComplexGeometricJacobianAnalytical(
  degree: number,
  knots: readonly number[],
  controlPoints: { re: number; im: number }[],
  farinPositions: { x: number; y: number }[],
  activeConstraintIndices: number[],
  period: number = 1.0,
  closed: boolean = true
): number[][] {
  const n = controlPoints.length
  const m = farinPositions.length
  const numVars = 2 * n + 2 * m
  const numActive = activeConstraintIndices.length

  // 1. Weight chain and homogeneous coordinates (per logical CP)
  const weights = computeWeightChain(controlPoints, farinPositions)
  const cpsZre: number[] = [], cpsZim: number[] = []
  const cpsWre: number[] = [], cpsWim: number[] = []
  for (let i = 0; i < n; i++) {
    const z_re = controlPoints[i].re, z_im = controlPoints[i].im
    const w_re = weights[i].re, w_im = weights[i].im
    cpsZre.push(z_re * w_re - z_im * w_im)
    cpsZim.push(z_re * w_im + z_im * w_re)
    cpsWre.push(w_re)
    cpsWim.push(w_im)
  }

  // 2. Precompute weight chain ratios r_k = (q_k - z_k) / (z_{k+1} - q_k)
  const ratios: { re: number; im: number }[] = []
  for (let k = 0; k < m; k++) {
    const z0 = controlPoints[k]
    const z1 = controlPoints[(k + 1) % n]
    const q = farinPositions[k]
    const b_re = z1.re - q.x, b_im = z1.im - q.y
    const d2 = b_re * b_re + b_im * b_im
    if (d2 < 1e-20) { ratios.push({ re: 0, im: 0 }); continue }
    const a_re = q.x - z0.re, a_im = q.y - z0.im
    ratios.push({
      re: (a_re * b_re + a_im * b_im) / d2,
      im: (a_im * b_re - a_re * b_im) / d2,
    })
  }

  // Initialize Jacobian
  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) {
    jacobian[j] = new Array(numVars).fill(0)
  }

  // Per-logical-CP homogeneous perturbation ∂Z_i/∂v, ∂w_i/∂v for variable v.
  const logicalPerturb = (v: number, dw: { re: number; im: number }[]) => {
    const dZre: number[] = [], dZim: number[] = [], dWre: number[] = [], dWim: number[] = []
    for (let k = 0; k < n; k++) {
      const z_re = controlPoints[k].re, z_im = controlPoints[k].im
      const w_re = weights[k].re, w_im = weights[k].im
      const dzRe = (v < n && v === k) ? 1 : 0
      const dzIm = (v >= n && v < 2 * n && v - n === k) ? 1 : 0
      // Z = z·w → dZ = dz·w + z·dw
      dZre.push(dzRe * w_re - dzIm * w_im + z_re * dw[k].re - z_im * dw[k].im)
      dZim.push(dzRe * w_im + dzIm * w_re + z_re * dw[k].im + z_im * dw[k].re)
      dWre.push(dw[k].re)
      dWim.push(dw[k].im)
    }
    return { dZre, dZim, dWre, dWim }
  }

  // ----- CLOSED: differentiate the spiral-unrolled representation -----------
  // The VALUE (computeGCPsFromGeometric) decomposes via unroll + ρ^periods
  // scaling of the wrapped seam CPs. We differentiate that SAME map, so the
  // Jacobian carries ∂ρ/∂v (the spiral derivative), which a plain-periodic
  // basis omits. Verified twin: computeGCPsFromGeometricUnrolled.
  if (closed) {
    const pre = precomputeUnrolledComplexBasis(degree, knots, period)
    const N = pre.numUnrolled
    const numSpans = pre.numSpans
    const rho = computeMonodromy(ratios)

    // Base unrolled homogeneous CPs (ρ^periods scaled), and the per-slot
    // base homogeneous values used by the spiral-derivative term.
    const uZre = new Array<number>(N), uZim = new Array<number>(N)
    const uWre = new Array<number>(N), uWim = new Array<number>(N)
    const baseZ: { re: number; im: number }[] = []
    const baseW: { re: number; im: number }[] = []
    const scale: { re: number; im: number }[] = [] // ρ^periods per slot
    for (let j = 0; j < N; j++) {
      const idx = pre.idxMap[j], per = pre.periodsMap[j]
      const Zr = cpsZre[idx], Zi = cpsZim[idx], Wr = cpsWre[idx], Wi = cpsWim[idx]
      baseZ.push({ re: Zr, im: Zi })
      baseW.push({ re: Wr, im: Wi })
      if (per === 0) {
        scale.push({ re: 1, im: 0 })
        uZre[j] = Zr; uZim[j] = Zi; uWre[j] = Wr; uWim[j] = Wi
      } else {
        const s = cpowInt(rho, per)
        scale.push(s)
        uZre[j] = s.re * Zr - s.im * Zi; uZim[j] = s.re * Zi + s.im * Zr
        uWre[j] = s.re * Wr - s.im * Wi; uWim[j] = s.re * Wi + s.im * Wr
      }
    }

    // Base state on the unrolled basis (matches the value to ~1e-14).
    const { derivatives: deriv, chenTerms: ct } = computeComplexCurveStateFromCache(
      pre, uZre, uZim, uWre, uWim
    )

    for (let v = 0; v < numVars; v++) {
      const dw = weightChainDerivative(v, n, m, controlPoints, farinPositions, weights, ratios)
      const { dZre: dZreL, dZim: dZimL, dWre: dWreL, dWim: dWimL } = logicalPerturb(v, dw)
      const drho = monodromyDerivative(v, n, m, controlPoints, farinPositions, ratios)

      // Per-slot unrolled perturbation: ∂(ρ^per · Z_idx)/∂v
      //   = ρ^per·∂Z_idx/∂v + (per·ρ^{per-1}·∂ρ)·Z_idx
      const duZre = new Array<number>(N), duZim = new Array<number>(N)
      const duWre = new Array<number>(N), duWim = new Array<number>(N)
      for (let j = 0; j < N; j++) {
        const idx = pre.idxMap[j], per = pre.periodsMap[j]
        const dZi = { re: dZreL[idx], im: dZimL[idx] }
        const dWi = { re: dWreL[idx], im: dWimL[idx] }
        if (per === 0) {
          duZre[j] = dZi.re; duZim[j] = dZi.im
          duWre[j] = dWi.re; duWim[j] = dWi.im
        } else {
          const s = scale[j]
          // dScale = per · ρ^{per-1} · ∂ρ
          const rp1 = cpowInt(rho, per - 1)
          const dScale = cMul({ re: per * rp1.re, im: per * rp1.im }, drho)
          const tZ = cMul(s, dZi)
          const sZ = cMul(dScale, baseZ[j])
          const tW = cMul(s, dWi)
          const sW = cMul(dScale, baseW[j])
          duZre[j] = tZ.re + sZ.re; duZim[j] = tZ.im + sZ.im
          duWre[j] = tW.re + sW.re; duWim[j] = tW.im + sW.im
        }
      }

      const pBDs = buildPerturbBDs(pre, numSpans, duZre, duZim, duWre, duWim)

      const dD1 = complexBDSub(
        complexBDAdd(complexBDMul(pBDs.Zu, deriv.w), complexBDMul(deriv.Zu, pBDs.w)),
        complexBDAdd(complexBDMul(pBDs.Z, deriv.wu), complexBDMul(deriv.Z, pBDs.wu))
      )
      const dD2 = complexBDSub(
        complexBDAdd(complexBDMul(pBDs.Zuu, deriv.w), complexBDMul(deriv.Zuu, pBDs.w)),
        complexBDAdd(complexBDMul(pBDs.Z, deriv.wuu), complexBDMul(deriv.Z, pBDs.wuu))
      )
      const dD3 = complexBDSub(
        complexBDAdd(complexBDMul(pBDs.Zuuu, deriv.w), complexBDMul(deriv.Zuuu, pBDs.w)),
        complexBDAdd(complexBDMul(pBDs.Z, deriv.wuuu), complexBDMul(deriv.Z, pBDs.wuuu))
      )
      const dD21 = complexBDSub(
        complexBDAdd(complexBDMul(pBDs.Zuu, deriv.wu), complexBDMul(deriv.Zuu, pBDs.wu)),
        complexBDAdd(complexBDMul(pBDs.Zu, deriv.wuu), complexBDMul(deriv.Zu, pBDs.wuu))
      )

      const dgCPs = computeDgFromPerts(
        ct.D1, ct.D2, ct.D3, ct.D21, ct.w, ct.wu, ct.wuu,
        dD1, dD2, dD3, dD21, pBDs.w, pBDs.wu, pBDs.wuu,
      )

      for (let aj = 0; aj < numActive; aj++) {
        const idx = activeConstraintIndices[aj]
        if (idx >= 0 && idx < dgCPs.length) jacobian[aj][v] = dgCPs[idx]
      }
    }

    return jacobian
  }

  // ----- OPEN: plain clamped basis, no wrap/spiral --------------------------
  const precomputed = precomputeRationalBasisDerivatives([...knots] as number[], n)
  const numSpans = precomputed.basisFunctions[0].controlPointsArray.length

  // Current state
  const { derivatives: deriv, chenTerms: ct } = computeComplexCurveStateFromCache(
    precomputed, cpsZre, cpsZim, cpsWre, cpsWim
  )

  // For each variable, compute one Jacobian column
  for (let v = 0; v < numVars; v++) {
    // a) Weight chain derivatives: ∂w_k/∂v for k=0..n-1
    const dw = weightChainDerivative(v, n, m, controlPoints, farinPositions, weights, ratios)

    // b) Homogeneous CP perturbations: ∂Z_k/∂v, ∂w_k/∂v
    const { dZre, dZim, dWre, dWim } = logicalPerturb(v, dw)

    // c) Build BD perturbations via linear combination
    const pBDs = buildPerturbBDs(precomputed, numSpans, dZre, dZim, dWre, dWim)

    // d) Chen term perturbations
    const dD1 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zu, deriv.w), complexBDMul(deriv.Zu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wu), complexBDMul(deriv.Z, pBDs.wu))
    )
    const dD2 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuu, deriv.w), complexBDMul(deriv.Zuu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wuu), complexBDMul(deriv.Z, pBDs.wuu))
    )
    const dD3 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuuu, deriv.w), complexBDMul(deriv.Zuuu, pBDs.w)),
      complexBDAdd(complexBDMul(pBDs.Z, deriv.wuuu), complexBDMul(deriv.Z, pBDs.wuuu))
    )
    const dD21 = complexBDSub(
      complexBDAdd(complexBDMul(pBDs.Zuu, deriv.wu), complexBDMul(deriv.Zuu, pBDs.wu)),
      complexBDAdd(complexBDMul(pBDs.Zu, deriv.wuu), complexBDMul(deriv.Zu, pBDs.wuu))
    )

    // e) ∂g = Im(∂R) where R = (D1*)²·T·w̄
    const dgCPs = computeDgFromPerts(
      ct.D1, ct.D2, ct.D3, ct.D21, ct.w, ct.wu, ct.wuu,
      dD1, dD2, dD3, dD21, pBDs.w, pBDs.wu, pBDs.wuu,
    )

    // f) Store into Jacobian
    for (let aj = 0; aj < numActive; aj++) {
      const idx = activeConstraintIndices[aj]
      if (idx >= 0 && idx < dgCPs.length) {
        jacobian[aj][v] = dgCPs[idx]
      }
    }
  }

  return jacobian
}

/**
 * Derivative ∂r_k/∂v of a single edge ratio r_k = (q_k - z_k)/(z_{k+1} - q_k)
 * w.r.t. geometric variable v. Edge k connects z_k → z_{k+1} (mod n) via Farin
 * point q_k. Returns {re:0, im:0} when v does not touch this edge.
 */
function edgeRatioDerivative(
  v: number, k: number, n: number, m: number,
  cps: { re: number; im: number }[],
  fps: { x: number; y: number }[],
): { re: number; im: number } {
  const z0 = cps[k], z1 = cps[(k + 1) % n], q = fps[k]
  const b_re = z1.re - q.x, b_im = z1.im - q.y
  const d2 = b_re * b_re + b_im * b_im
  if (d2 <= 1e-20) return { re: 0, im: 0 }

  const bsq_re = b_re * b_re - b_im * b_im, bsq_im = 2 * b_re * b_im
  const bsq_d2 = bsq_re * bsq_re + bsq_im * bsq_im

  if (v < n) {
    const i = v
    if (i === k) {
      // ∂r/∂z_k = -1/b
      return { re: -b_re / d2, im: b_im / d2 }
    } else if (i === (k + 1) % n) {
      // ∂r/∂z_{k+1} = -a/b²
      if (bsq_d2 <= 1e-30) return { re: 0, im: 0 }
      const a_re = q.x - z0.re, a_im = q.y - z0.im
      return {
        re: (-a_re * bsq_re - a_im * bsq_im) / bsq_d2,
        im: (-a_im * bsq_re + a_re * bsq_im) / bsq_d2,
      }
    }
  } else if (v < 2 * n) {
    const i = v - n
    if (i === k) {
      // ∂r/∂(i·z_k) = -i/b
      return { re: -b_im / d2, im: -b_re / d2 }
    } else if (i === (k + 1) % n) {
      // ∂r/∂(i·z_{k+1}) = -i·a/b²
      if (bsq_d2 <= 1e-30) return { re: 0, im: 0 }
      const a_re = q.x - z0.re, a_im = q.y - z0.im
      const c_re = a_im, c_im = -a_re
      return {
        re: (c_re * bsq_re + c_im * bsq_im) / bsq_d2,
        im: (c_im * bsq_re - c_re * bsq_im) / bsq_d2,
      }
    }
  } else if (v < 2 * n + m) {
    if (v - 2 * n === k) {
      // ∂r/∂qx = (z_{k+1} - z_k)/b²
      if (bsq_d2 <= 1e-30) return { re: 0, im: 0 }
      const diff_re = z1.re - z0.re, diff_im = z1.im - z0.im
      return {
        re: (diff_re * bsq_re + diff_im * bsq_im) / bsq_d2,
        im: (diff_im * bsq_re - diff_re * bsq_im) / bsq_d2,
      }
    }
  } else {
    if (v - 2 * n - m === k) {
      // ∂r/∂qy = i·(z_{k+1} - z_k)/b²
      if (bsq_d2 <= 1e-30) return { re: 0, im: 0 }
      const diff_re = z1.re - z0.re, diff_im = z1.im - z0.im
      const c_re = -diff_im, c_im = diff_re
      return {
        re: (c_re * bsq_re + c_im * bsq_im) / bsq_d2,
        im: (c_im * bsq_re - c_re * bsq_im) / bsq_d2,
      }
    }
  }
  return { re: 0, im: 0 }
}

/**
 * ∂ρ/∂v where ρ = ∏_{k=0}^{n-1} r_k (ALL n edges incl. the wrap edge n-1).
 * Product rule: ∂ρ/∂v = Σ_k (∏_{j≠k} r_j) · ∂r_k/∂v.
 */
function monodromyDerivative(
  v: number, n: number, m: number,
  cps: { re: number; im: number }[],
  fps: { x: number; y: number }[],
  ratios: { re: number; im: number }[],
): { re: number; im: number } {
  let drho = { re: 0, im: 0 }
  for (let k = 0; k < m; k++) {
    const dr = edgeRatioDerivative(v, k, n, m, cps, fps)
    if (dr.re === 0 && dr.im === 0) continue
    // prod of all ratios except k
    let prod = { re: 1, im: 0 }
    for (let j = 0; j < m; j++) {
      if (j === k) continue
      prod = cMul(prod, ratios[j])
    }
    const term = cMul(prod, dr)
    drho = { re: drho.re + term.re, im: drho.im + term.im }
  }
  return drho
}

/**
 * Forward sweep: compute ∂w_k/∂v for a single geometric variable v.
 */
function weightChainDerivative(
  v: number, n: number, m: number,
  cps: { re: number; im: number }[],
  fps: { x: number; y: number }[],
  weights: { re: number; im: number }[],
  ratios: { re: number; im: number }[],
): { re: number; im: number }[] {
  const dw: { re: number; im: number }[] = [{ re: 0, im: 0 }]

  const numEdges = Math.min(m, n - 1)
  for (let k = 0; k < numEdges; k++) {
    const r = ratios[k], wk = weights[k]

    // Compute ∂r_k/∂v (complex)
    const dr = edgeRatioDerivative(v, k, n, m, cps, fps)
    const dr_re = dr.re, dr_im = dr.im

    // ∂w_{k+1}/∂v = ∂w_k/∂v · r_k + w_k · ∂r_k/∂v
    const dwk = dw[k]
    dw.push({
      re: (dwk.re * r.re - dwk.im * r.im) + (wk.re * dr_re - wk.im * dr_im),
      im: (dwk.re * r.im + dwk.im * r.re) + (wk.re * dr_im + wk.im * dr_re),
    })
  }

  while (dw.length < n) dw.push({ re: 0, im: 0 })
  return dw
}

/**
 * Build BD perturbations from scalar CP perturbations via precomputed basis.
 */
export function buildPerturbBDs(
  pre: {
    basisFunctions: BernsteinDecomposition[]
    dBasisFunctions_du: BernsteinDecomposition[]
    d2BasisFunctions_du2: BernsteinDecomposition[]
    d3BasisFunctions_du3: BernsteinDecomposition[]
  },
  numSpans: number,
  dZre: number[], dZim: number[], dWre: number[], dWim: number[]
): {
  Z: ComplexBD; Zu: ComplexBD; Zuu: ComplexBD; Zuuu: ComplexBD
  w: ComplexBD; wu: ComplexBD; wuu: ComplexBD; wuuu: ComplexBD
} {
  const n = dZre.length
  const d0 = pre.basisFunctions[0].degree
  const d1 = pre.dBasisFunctions_du[0].degree
  const d2 = pre.d2BasisFunctions_du2[0].degree
  const d3 = pre.d3BasisFunctions_du3[0].degree

  const init = (deg: number) => {
    const s: number[][] = []
    for (let i = 0; i < numSpans; i++) s.push(new Array(deg + 1).fill(0))
    return s
  }

  const ZreS = init(d0), ZimS = init(d0), WreS = init(d0), WimS = init(d0)
  const ZreuS = init(d1), ZimuS = init(d1), WreuS = init(d1), WimuS = init(d1)
  const ZreuuS = init(d2), ZimuuS = init(d2), WreuuS = init(d2), WimuuS = init(d2)
  const ZreuuuS = init(d3), ZimuuuS = init(d3), WreuuuS = init(d3), WimuuuS = init(d3)

  for (let i = 0; i < n; i++) {
    const zr = dZre[i], zi = dZim[i], wr = dWre[i], wi = dWim[i]
    if (Math.abs(zr) < 1e-30 && Math.abs(zi) < 1e-30 && Math.abs(wr) < 1e-30 && Math.abs(wi) < 1e-30) continue

    for (let s = 0; s < numSpans; s++) {
      const b0 = pre.basisFunctions[i].controlPointsArray[s]
      const b1 = pre.dBasisFunctions_du[i].controlPointsArray[s]
      const b2 = pre.d2BasisFunctions_du2[i].controlPointsArray[s]
      const b3 = pre.d3BasisFunctions_du3[i].controlPointsArray[s]
      for (let c = 0; c <= d0; c++) {
        ZreS[s][c] += zr * b0[c]; ZimS[s][c] += zi * b0[c]
        WreS[s][c] += wr * b0[c]; WimS[s][c] += wi * b0[c]
      }
      for (let c = 0; c <= d1; c++) {
        ZreuS[s][c] += zr * b1[c]; ZimuS[s][c] += zi * b1[c]
        WreuS[s][c] += wr * b1[c]; WimuS[s][c] += wi * b1[c]
      }
      for (let c = 0; c <= d2; c++) {
        ZreuuS[s][c] += zr * b2[c]; ZimuuS[s][c] += zi * b2[c]
        WreuuS[s][c] += wr * b2[c]; WimuuS[s][c] += wi * b2[c]
      }
      for (let c = 0; c <= d3; c++) {
        ZreuuuS[s][c] += zr * b3[c]; ZimuuuS[s][c] += zi * b3[c]
        WreuuuS[s][c] += wr * b3[c]; WimuuuS[s][c] += wi * b3[c]
      }
    }
  }

  const mk = (spans: number[][], ref: BernsteinDecomposition) =>
    new BernsteinDecomposition(spans, ref.distinctKnots)
  const r0 = pre.basisFunctions[0], r1 = pre.dBasisFunctions_du[0]
  const r2 = pre.d2BasisFunctions_du2[0], r3 = pre.d3BasisFunctions_du3[0]

  return {
    Z: { re: mk(ZreS, r0), im: mk(ZimS, r0) },
    Zu: { re: mk(ZreuS, r1), im: mk(ZimuS, r1) },
    Zuu: { re: mk(ZreuuS, r2), im: mk(ZimuuS, r2) },
    Zuuu: { re: mk(ZreuuuS, r3), im: mk(ZimuuuS, r3) },
    w: { re: mk(WreS, r0), im: mk(WimS, r0) },
    wu: { re: mk(WreuS, r1), im: mk(WimuS, r1) },
    wuu: { re: mk(WreuuS, r2), im: mk(WimuuS, r2) },
    wuuu: { re: mk(WreuuuS, r3), im: mk(WimuuuS, r3) },
  }
}

/**
 * Compute ∂g CPs from Chen term perturbations.
 *
 * g = Im((D1*)² · T · w̄)  where T = w·bracket + 2·D1·(wu·D2 - wuu·D1)
 * ∂g = Im(∂((D1*)²)·T·w̄ + (D1*)²·∂T·w̄ + (D1*)²·T·∂(w̄))
 */
export function computeDgFromPerts(
  D1: ComplexBD, D2: ComplexBD, D3: ComplexBD, D21: ComplexBD,
  w: ComplexBD, wu: ComplexBD, wuu: ComplexBD,
  dD1: ComplexBD, dD2: ComplexBD, dD3: ComplexBD, dD21: ComplexBD,
  dw: ComplexBD, dwu: ComplexBD, dwuu: ComplexBD,
): number[] {
  // Current quantities
  const D1conj = complexBDConj(D1)
  const D1conjSq = complexBDMul(D1conj, D1conj)

  const bracket = complexBDSub(
    complexBDAdd(complexBDMul(D3, D1), complexBDMul(D1, D21)),
    complexBDScale(1.5, complexBDMul(D2, D2))
  )
  const innerTerm = complexBDSub(complexBDMul(wu, D2), complexBDMul(wuu, D1))
  const T = complexBDAdd(
    complexBDMul(w, bracket),
    complexBDScale(2, complexBDMul(D1, innerTerm))
  )
  const wConj = complexBDConj(w)

  // ∂(D1*) = conj(∂D1) = {re: dD1.re, im: -dD1.im}
  const dD1conj = complexBDConj(dD1)
  // ∂((D1*)²) = 2·D1*·∂(D1*)
  const dD1conjSq = complexBDScale(2, complexBDMul(D1conj, dD1conj))

  // ∂bracket = dD3·D1 + D3·dD1 + dD1·D21 + D1·dD21 - 3·D2·dD2
  const dBracket = complexBDAdd(
    complexBDAdd(
      complexBDAdd(complexBDMul(dD3, D1), complexBDMul(D3, dD1)),
      complexBDAdd(complexBDMul(dD1, D21), complexBDMul(D1, dD21))
    ),
    complexBDScale(-3, complexBDMul(D2, dD2))
  )

  // ∂T_part1 = dw·bracket + w·dBracket
  const dT_part1 = complexBDAdd(complexBDMul(dw, bracket), complexBDMul(w, dBracket))

  // ∂innerTerm = dwu·D2 + wu·dD2 - dwuu·D1 - wuu·dD1
  const dInnerTerm = complexBDSub(
    complexBDAdd(complexBDMul(dwu, D2), complexBDMul(wu, dD2)),
    complexBDAdd(complexBDMul(dwuu, D1), complexBDMul(wuu, dD1))
  )

  // ∂T_part2 = 2·(dD1·innerTerm + D1·dInnerTerm)
  const dT_part2 = complexBDScale(2, complexBDAdd(
    complexBDMul(dD1, innerTerm),
    complexBDMul(D1, dInnerTerm)
  ))

  const dT = complexBDAdd(dT_part1, dT_part2)

  // ∂(w̄) = conj(∂w)
  const dwConj = complexBDConj(dw)

  // ∂R = ∂(D1conjSq)·T·w̄ + D1conjSq·∂T·w̄ + D1conjSq·T·∂(w̄)
  const term1 = complexBDMul(complexBDMul(dD1conjSq, T), wConj)
  const term2 = complexBDMul(complexBDMul(D1conjSq, dT), wConj)
  const term3 = complexBDMul(complexBDMul(D1conjSq, T), dwConj)

  const dR = complexBDAdd(complexBDAdd(term1, term2), term3)
  return dR.im.flattenControlPoints()
}

// ============================================================================
// Homogeneous-Variable Functions for Open Complex-Rational Curves
// ============================================================================

/**
 * Compute g(t) control points directly from homogeneous coordinates.
 * For open curves where Z_re, Z_im, w_re, w_im are given directly
 * (no Farin weight chain reconstruction).
 */
export function computeGCPsFromHomogeneous(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[]
): number[] {
  const d = computeOpenComplexDerivativesBD([...knots], cpsZre, cpsZim, cpsWre, cpsWim)
  const ct = computeComplexChenTerms(d)
  return computeComplexGFromChenTerms(ct).flattenControlPoints()
}

/**
 * Compute the Jacobian of g(t) control points w.r.t. homogeneous Z variables
 * (Z_re, Z_im) with fixed weights, using central finite differences.
 *
 * Variables: [Z_re_0..Z_re_{n-1}, Z_im_0..Z_im_{n-1}] (2n total).
 *
 * The Jacobian is SPARSE because each Z_i only affects nearby spans
 * through the local B-spline basis support. This is unlike the geometric
 * Jacobian which is dense due to the Farin weight chain.
 */
export function computeOpenComplexHomogeneousJacobianZ(
  knots: number[],
  cpsZre: number[],
  cpsZim: number[],
  cpsWre: number[],
  cpsWim: number[],
  activeConstraintIndices: number[]
): number[][] {
  const n = cpsZre.length
  const numVars = 2 * n
  const numActive = activeConstraintIndices.length

  const jacobian: number[][] = []
  for (let j = 0; j < numActive; j++) {
    jacobian[j] = new Array(numVars).fill(0)
  }

  const h = 1e-7

  for (let v = 0; v < numVars; v++) {
    const Zre_plus = [...cpsZre]
    const Zim_plus = [...cpsZim]
    const Zre_minus = [...cpsZre]
    const Zim_minus = [...cpsZim]

    if (v < n) {
      Zre_plus[v] += h
      Zre_minus[v] -= h
    } else {
      Zim_plus[v - n] += h
      Zim_minus[v - n] -= h
    }

    const g_plus = computeGCPsFromHomogeneous(knots, Zre_plus, Zim_plus, cpsWre, cpsWim)
    const g_minus = computeGCPsFromHomogeneous(knots, Zre_minus, Zim_minus, cpsWre, cpsWim)

    for (let aj = 0; aj < numActive; aj++) {
      const idx = activeConstraintIndices[aj]
      jacobian[aj][v] = (g_plus[idx] - g_minus[idx]) / (2 * h)
    }
  }

  return jacobian
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export { precomputePeriodicRationalBasisDerivatives }
export type { PrecomputedPeriodicRationalBasisDerivatives }
