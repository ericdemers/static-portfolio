import { describe, it, expect } from 'vitest'
import { phHodograph, phCurvatureExtremaNumerator } from '../optimizer/phCurvatureExtrema'
import { decomposeToBernstein, derivativeBD, findZerosBD } from '../optimizer/algebra'
import { computeOpenComplexCurvatureExtremaParameters } from '../optimizer/complexAlgebra'
import { fitPHSplineToBSpline } from '../optimizer/phSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import type { Point2D } from '../types/curve'

/**
 * Correctness gate for the low-degree PH curvature-extrema numerator (a port of
 * Rust ne-core ph::curvature_numerator). Mirrors that crate's oracle test
 * `ph_curvature_matches_generic_g_of_hodograph`: the closed-form complex numerator
 *     g = Im( ā²·(a·a″ − 3/2·a′²) ),  a = w²
 * must equal the GENERIC planar curvature-extrema numerator of the hodograph,
 *     g_generic = ‖c′‖²·(c′×c‴) − 3·(c′·c″)·(c′×c″),
 * evaluated by sampling c′ = a, c″ = a′, c‴ = a″. If these agree, the complex
 * algebra (square / conj / the 3/2 factor / Im extraction) is correct.
 */

// Degree-2 open generator, 5 control points, multi-span domain [0,3] (matches the
// Rust test's knot vector so the same code path — repeated interior knots — runs).
const UVKNOTS = [0, 0, 0, 1, 2, 3, 3, 3]
const U = [1.0, 0.5, -0.3, 0.8, 1.2]
const V = [0.2, 1.1, 0.6, -0.4, 0.9]

function genericG(t: number): number {
  // c′ = a (hodograph), c″ = a′, c‴ = a″.
  const a = phHodograph(U, V, UVKNOTS)
  const a1 = { re: derivativeBD(a.re), im: derivativeBD(a.im) }
  const a2 = { re: derivativeBD(a1.re), im: derivativeBD(a1.im) }
  const c1 = { re: a.re.evaluate(t), im: a.im.evaluate(t) }
  const c2 = { re: a1.re.evaluate(t), im: a1.im.evaluate(t) }
  const c3 = { re: a2.re.evaluate(t), im: a2.im.evaluate(t) }
  const nsq = c1.re * c1.re + c1.im * c1.im          // ‖c′‖²
  const cr1 = c1.re * c2.im - c1.im * c2.re          // c′×c″
  const dt = c1.re * c2.re + c1.im * c2.im           // c′·c″
  const cr2 = c1.re * c3.im - c1.im * c3.re          // c′×c‴
  return nsq * cr2 - 3 * dt * cr1
}

describe('PH low-degree curvature-extrema numerator', () => {
  it('matches the generic planar g of the hodograph (Rust ph.rs oracle)', () => {
    const g = phCurvatureExtremaNumerator(U, V, UVKNOTS)
    let maxAbsErr = 0
    let scale = 1e-9
    for (let k = 0; k <= 40; k++) {
      const t = (3 * k) / 40
      const got = g.evaluate(t)
      const want = genericG(t)
      maxAbsErr = Math.max(maxAbsErr, Math.abs(got - want))
      scale = Math.max(scale, Math.abs(want))
    }
    expect(maxAbsErr / scale).toBeLessThan(1e-9)
  })

  it('has degree 8m−2 (=14 for the default quintic, m=2)', () => {
    const g = phCurvatureExtremaNumerator(U, V, UVKNOTS)
    expect(g.degree).toBe(14)
  })

  it('is far smaller than the rational g (sanity: coeff count is modest)', () => {
    // Multi-span (3 spans) × (degree 14 ⇒ 15 coeffs/span) = 45, vs the rational
    // path's ~hundreds. Just a guard that we are on the low-degree path.
    const g = phCurvatureExtremaNumerator(U, V, UVKNOTS)
    const flat = g.flattenControlPoints()
    expect(flat.length).toBeLessThan(60)
    // also: the flattened layout and greville are parallel (the active-set contract)
    expect(g.grevilleAbscissae().length).toBe(flat.length)
    void decomposeToBernstein
  })
})

/**
 * BRIDGE oracle (de-risks swapping the new g into the drag): on a REAL fitted PH
 * curve, the new generator-side g must locate the SAME curvature extrema as the
 * existing rational path (computeOpenComplexCurvatureExtremaParameters) — both are
 * κ′-numerators of the same curve, so identical zeros up to a positive factor.
 */
describe('PH low-degree g vs the existing rational path (same extrema)', () => {
  it('finds the same curvature-extrema parameters on a fitted PH curve', () => {
    const pts: Point2D[] = [
      { x: -152, y: 17 }, { x: -180, y: -79 }, { x: -120, y: -184 },
      { x: 40, y: -235 }, { x: 150, y: -180 }, { x: 207, y: -60 }, { x: 180, y: 80 },
    ]
    const bs = createBSpline(pts, 3, false) as { controlPoints: Point2D[]; knots: number[] }
    const ph = fitPHSplineToBSpline(bs.controlPoints, bs.knots, { generatorDegree: 2 })!

    // New low-degree g (generator side).
    const g = phCurvatureExtremaNumerator(
      ph.metadata.uControlPoints, ph.metadata.vControlPoints, ph.metadata.uvKnots,
    )
    const zerosNew = findZerosBD(g).sort((a, b) => a - b)

    // Existing rational path (curve side, W ≡ 1).
    const Zre = ph.controlPoints.map((p) => p.x)
    const Zim = ph.controlPoints.map((p) => p.y)
    const Wre = Zre.map(() => 1), Wim = Zre.map(() => 0)
    const zerosOld = computeOpenComplexCurvatureExtremaParameters(ph.knots, Zre, Zim, Wre, Wim)
      .sort((a, b) => a - b)

    expect(zerosNew.length).toBe(zerosOld.length)
    for (let i = 0; i < zerosNew.length; i++) {
      expect(Math.abs(zerosNew[i] - zerosOld[i])).toBeLessThan(1e-4)
    }
  })
})
