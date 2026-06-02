import { evaluate } from './evaluate'
import { insertKnot } from './insert'
import { scalarCoeffs } from './coeffs'

/**
 * A scalar B-spline function f(t) = Σ bᵢ Nᵢ(t), ℝ → ℝ.
 *
 * This is the primitive behind the curvature/inflection numerators (g, f) and
 * the basis-function plots — the object whose Bernstein sign changes bound the
 * curvature extrema. A curve is, in this view, a tuple of such functions
 * sharing one knot vector; here we provide the scalar object directly.
 */
export interface BSplineFunction {
  degree: number
  knots: number[]
  coeffs: number[]
  closed: boolean
}

/** Evaluate the scalar function at parameter t. */
export const evalFunction = (f: BSplineFunction, t: number): number =>
  evaluate(scalarCoeffs, f.coeffs, f.degree, f.knots, t, f.closed)

/** Insert a knot into a scalar function (open or periodic; shape-preserving). */
export function insertKnotFunction(f: BSplineFunction, tBar: number): BSplineFunction {
  const { controlPoints, knots } = insertKnot(
    scalarCoeffs,
    f.coeffs,
    f.degree,
    f.knots,
    tBar,
    f.closed,
  )
  return { ...f, coeffs: controlPoints, knots }
}
