// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Low-degree curvature-extrema numerator for a POLYNOMIAL Pythagorean-hodograph
 * curve, computed directly from the generator — a port of Rust ne-core
 * `ph::curvature_numerator` (`crates/ne-core/src/ph.rs`, `complex.rs`).
 *
 * A planar PH curve has hodograph c′(t) = w(t)², where w = u + i·v is the complex
 * preimage (degree-m generator with control coefficients uᵢ + i·vᵢ). Because c′ is
 * a perfect square in w, the curvature-extrema numerator collapses to the cheap
 * POLYNOMIAL complex form applied to a = w² (NOT the complex-rational Chen/`G_c`
 * machinery, which inflates g to ~degree 44 / ~700 coeffs for the same curve):
 *
 *     g = Im( ā² · (a·a″ − 3/2·a′²) ),   a = w²  (the hodograph, degree 2m).
 *
 * Here a′ = c″ and a″ = c‴. g is a real polynomial of degree 8m−2 in the curve
 * parameter (e.g. 14 for the default m=2 quintic) — far smaller than the rational
 * path, so the constraint eval AND any Jacobian over it are cheap. The zeros of g
 * are the curvature extrema (κ′ = 0); its Bernstein sign-change count is the
 * extrema count the drag preserves (variation-diminishing bound).
 */

import { decomposeToBernstein, derivativeBD, type BernsteinDecomposition } from './algebra'
import {
  complexBDMul, complexBDSub, complexBDScale, complexBDConj, type ComplexBD,
  computeOpenInactiveSet, computePeriodicInactiveSet, type ComplexRationalConstraintState,
} from './complexAlgebra'

/** Differentiate a complex Bernstein decomposition component-wise. */
function complexDerivativeBD(a: ComplexBD): ComplexBD {
  return { re: derivativeBD(a.re), im: derivativeBD(a.im) }
}

/** The complex hodograph a = w² = c′ from the (u, v) generator control points. */
export function phHodograph(uCPs: number[], vCPs: number[], uvKnots: number[]): ComplexBD {
  const w: ComplexBD = {
    re: decomposeToBernstein({ knots: uvKnots, controlPoints: uCPs }),
    im: decomposeToBernstein({ knots: uvKnots, controlPoints: vCPs }),
  }
  return complexBDMul(w, w)
}

/**
 * g(t) = Im( ā²·(a·a″ − 3/2·a′²) ), a = w². Returns the real Bernstein
 * decomposition; use `.flattenControlPoints()` for the per-span coefficient array
 * and `.grevilleAbscissae()` for the matching parameter positions (the same flat
 * layout the curvature-extrema active-set machinery expects).
 */
export function phCurvatureExtremaNumerator(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
): BernsteinDecomposition {
  const a = phHodograph(uCPs, vCPs, uvKnots) // c′
  const a1 = complexDerivativeBD(a)          // c″
  const a2 = complexDerivativeBD(a1)         // c‴
  // inner = a·a″ − 3/2·a′²
  const inner = complexBDSub(complexBDMul(a, a2), complexBDScale(1.5, complexBDMul(a1, a1)))
  // g = Im(ā²·inner)
  const abar = complexBDConj(a)
  const abar2 = complexBDMul(abar, abar)
  return complexBDMul(abar2, inner).im
}

/**
 * Curvature-extrema constraint state for a PH curve, built from the low-degree
 * generator-side g — the drop-in replacement for the rational-path
 * computeOpenComplexCurvatureConstraintState / computeClosedPolynomialCurvature-
 * ConstraintState. Returns the SAME ComplexRationalConstraintState contract
 * (parallel arrays indexed by flat g-coefficient position): `signs[i] = g>0?-1:1`,
 * `inactiveIndices` = the sliding (non-anchor) coefficients, `gCPs` = flat g,
 * `grevilleAbscissae` = matching parameters.
 *
 * `closed` selects the wrap-aware (periodic) inactive set so an extremum may slide
 * across the seam (g[n−1]↔g[0]); the generator/curve is in the clamped chart, so
 * the two endpoint coefficients are the seam's two sides g(1⁻), g(0⁺) — exactly as
 * the rational closed path treated them.
 */
export function phCurvatureConstraintState(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  closed: boolean,
): ComplexRationalConstraintState {
  const gBD = phCurvatureExtremaNumerator(uCPs, vCPs, uvKnots)
  const gCPs = gBD.flattenControlPoints()
  const grevilleAbscissae = gBD.grevilleAbscissae()
  const signs = gCPs.map((g) => (g > 0 ? -1 : 1))
  const inactive = closed ? computePeriodicInactiveSet(gCPs) : computeOpenInactiveSet(gCPs)
  return { signs, inactiveIndices: Array.from(inactive), gCPs, grevilleAbscissae }
}
