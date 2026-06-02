import { BernsteinDecomposition, decomposeToBernstein } from './bernstein'

/**
 * Curvature numerators for a planar polynomial B-spline curve c(t) = (x(t), y(t)),
 * assembled purely from the B-spline-function algebra (add / multiply / derivative
 * on Bernstein decompositions). Both results are themselves B-spline functions;
 * the sign changes of their Bernstein coefficients bound the number of
 * inflections (f) and curvature extrema (g).
 */

/** Per-curve intermediate functions, decomposed once. */
function derivatives(x: readonly number[], y: readonly number[], knots: readonly number[], degree: number) {
  const x1 = decomposeToBernstein(x, knots, degree).derivative()
  const y1 = decomposeToBernstein(y, knots, degree).derivative()
  return {
    x1,
    y1,
    x2: x1.derivative(),
    y2: y1.derivative(),
    x3: x1.derivative().derivative(),
    y3: y1.derivative().derivative(),
  }
}

/**
 * Inflection numerator f(t) = c′ × c″ = x′y″ − y′x″ (degree 2d−3).
 * Its zeros are the inflection points; sign changes of its Bernstein
 * coefficients bound their number.
 */
export function inflectionNumeratorPlanar(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const { x1, y1, x2, y2 } = derivatives(x, y, knots, degree)
  return x1.multiply(y2).subtract(y1.multiply(x2))
}

/**
 * Curvature-derivative numerator g(t) = ‖c′‖²(c′ × c‴) − 3(c′ · c″)(c′ × c″)
 * (degree 4d−6). Its zeros are the curvature extrema; sign changes of its
 * Bernstein coefficients bound their number (the anchor theorem).
 */
export function curvatureExtremaNumeratorPlanar(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const { x1, y1, x2, y2, x3, y3 } = derivatives(x, y, knots, degree)
  const crossPrime2 = x1.multiply(y2).subtract(y1.multiply(x2)) // c′ × c″
  const dot = x1.multiply(x2).add(y1.multiply(y2)) // c′ · c″
  const crossPrime3 = x1.multiply(y3).subtract(y1.multiply(x3)) // c′ × c‴
  const normSq = x1.multiply(x1).add(y1.multiply(y1)) // ‖c′‖²
  return normSq.multiply(crossPrime3).subtract(dot.multiply(crossPrime2).scale(3))
}
