import { evaluate } from './evaluate'
import { insertKnotOpen } from './insert'
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

/** Insert a knot into an open scalar function (shape-preserving). */
export function insertKnotFunction(f: BSplineFunction, tBar: number): BSplineFunction {
  if (f.closed) throw new Error('periodic function knot insertion is not implemented yet')
  const { controlPoints, knots } = insertKnotOpen(scalarCoeffs, f.coeffs, f.degree, f.knots, tBar)
  return { ...f, coeffs: controlPoints, knots }
}
