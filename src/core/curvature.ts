import { BernsteinDecomposition, decomposeToBernstein, decomposeToBernsteinPeriodic } from './bernstein'
import { ComplexBD } from './complexBernstein'

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

/**
 * Curvature-extrema numerator g(t) for a CLOSED (periodic) planar B-spline
 * curve — same formula as above, on the periodic Bernstein decomposition.
 * For a closed curve the Bernstein coefficients form a cycle (the bound is the
 * cyclic sign-change count).
 */
export function curvatureExtremaNumeratorPlanarPeriodic(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const x1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const x2 = x1.derivative()
  const y2 = y1.derivative()
  const x3 = x2.derivative()
  const y3 = y2.derivative()
  const crossPrime2 = x1.multiply(y2).subtract(y1.multiply(x2))
  const dot = x1.multiply(x2).add(y1.multiply(y2))
  const crossPrime3 = x1.multiply(y3).subtract(y1.multiply(x3))
  const normSq = x1.multiply(x1).add(y1.multiply(y1))
  return normSq.multiply(crossPrime3).subtract(dot.multiply(crossPrime2).scale(3))
}

/** Inflection numerator f = c′×c″ for a CLOSED (periodic) planar B-spline curve. */
export function inflectionNumeratorPlanarPeriodic(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const x1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const x2 = x1.derivative()
  const y2 = y1.derivative()
  return x1.multiply(y2).subtract(y1.multiply(x2))
}

/** Parameters t ∈ [0,1) of the curvature extrema of a closed curve (zeros of periodic g). */
export function closedCurvatureExtremaParameters(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
  samples = 600,
): number[] {
  const g = curvatureExtremaNumeratorPlanarPeriodic(x, y, knots, degree)
  const f = (t: number) => g.evaluate(((t % 1) + 1) % 1)
  const zeros: number[] = []
  let prevT = 0
  let prevV = f(0)
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const v = f(t)
    if (prevV === 0) zeros.push(prevT)
    else if (prevV * v < 0) {
      let a = prevT
      let b = t
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2
        if (f(a) * f(m) <= 0) b = m
        else a = m
      }
      zeros.push((a + b) / 2)
    }
    prevT = t
    prevV = v
  }
  return zeros
}

/** Parameters t ∈ [0,1) of the inflections of a closed curve (zeros of periodic f = c′×c″). */
export function closedInflectionParameters(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
  samples = 600,
): number[] {
  const f = inflectionNumeratorPlanarPeriodic(x, y, knots, degree)
  const fn = (t: number) => f.evaluate(((t % 1) + 1) % 1)
  const zeros: number[] = []
  let prevT = 0
  let prevV = fn(0)
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const v = fn(t)
    if (prevV === 0) zeros.push(prevT)
    else if (prevV * v < 0) {
      let a = prevT
      let b = t
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2
        if (fn(a) * fn(m) <= 0) b = m
        else a = m
      }
      zeros.push((a + b) / 2)
    }
    prevT = t
    prevV = v
  }
  return zeros
}

// ============================================================================
// Rational and complex-rational curvature numerators (Chen complexity
// reduction). Both work on the homogeneous coordinate functions and produce a
// B-spline FUNCTION whose sign changes still bound the curvature extrema — the
// extra factor relative to the κ′ numerator is a positive power of the weight,
// so the zeros (the extrema) are unchanged. With unit weights both reduce
// exactly to the polynomial g above.
//
// Ref: Xianming Chen, "Complexity Reduction for Symbolic Computation with
// Rational B-Splines."
// ============================================================================

/**
 * Curvature-extrema numerator for a planar RATIONAL B-spline curve
 * c = (X/w, Y/w). Inputs are the Euclidean control points (x, y) and weights w;
 * the homogeneous functions X = w·x, Y = w·y are formed internally.
 */
export function curvatureExtremaNumeratorRational(
  x: readonly number[],
  y: readonly number[],
  w: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const X = decomposeToBernstein(x.map((xi, i) => xi * w[i]), knots, degree)
  const Y = decomposeToBernstein(y.map((yi, i) => yi * w[i]), knots, degree)
  const W = decomposeToBernstein([...w], knots, degree)
  const Xu = X.derivative(), Xuu = Xu.derivative(), Xuuu = Xuu.derivative()
  const Yu = Y.derivative(), Yuu = Yu.derivative(), Yuuu = Yuu.derivative()
  const Wu = W.derivative(), Wuu = Wu.derivative(), Wuuu = Wuu.derivative()

  // Chen terms Dk = (homogeneous k-th derivative)·w − (homogeneous)·w^(k).
  const D1x = Xu.multiply(W).subtract(X.multiply(Wu))
  const D1y = Yu.multiply(W).subtract(Y.multiply(Wu))
  const D2x = Xuu.multiply(W).subtract(X.multiply(Wuu))
  const D2y = Yuu.multiply(W).subtract(Y.multiply(Wuu))
  const D3x = Xuuu.multiply(W).subtract(X.multiply(Wuuu))
  const D3y = Yuuu.multiply(W).subtract(Y.multiply(Wuuu))
  const D21x = Xuu.multiply(Wu).subtract(Xu.multiply(Wuu))
  const D21y = Yuu.multiply(Wu).subtract(Yu.multiply(Wuu))

  const D1dotD1 = D1x.multiply(D1x).add(D1y.multiply(D1y))
  const D1xD3 = D1x.multiply(D3y).subtract(D1y.multiply(D3x))
  const D1xD21 = D1x.multiply(D21y).subtract(D1y.multiply(D21x))
  const D1xD2 = D1x.multiply(D2y).subtract(D1y.multiply(D2x))
  const D1dotD2 = D1x.multiply(D2x).add(D1y.multiply(D2y))

  const term1 = D1xD3.add(D1xD21).multiply(D1dotD1).multiply(W)
  const term2 = Wu.scale(2).multiply(D1xD2).multiply(D1dotD1)
  const term3 = D1dotD2.scale(3).multiply(D1xD2).multiply(W)
  return term1.add(term2).subtract(term3)
}

/**
 * Curvature-extrema numerator for a planar COMPLEX-RATIONAL B-spline curve
 * z = Z/W (Z, W complex). Inputs are the Euclidean complex control points
 * (zre, zim) and complex weights (wre, wim); Z = w·z is formed internally.
 * Returns g = Im((D1*)²·T·w̄), a real B-spline function.
 */
export function curvatureExtremaNumeratorComplex(
  zre: readonly number[],
  zim: readonly number[],
  wre: readonly number[],
  wim: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  // Homogeneous Z = w · z (complex multiply).
  const Zre = zre.map((zr, i) => zr * wre[i] - zim[i] * wim[i])
  const Zim = zre.map((zr, i) => zr * wim[i] + zim[i] * wre[i])
  const Z = new ComplexBD(
    decomposeToBernstein(Zre, knots, degree),
    decomposeToBernstein(Zim, knots, degree),
  )
  const W = new ComplexBD(
    decomposeToBernstein([...wre], knots, degree),
    decomposeToBernstein([...wim], knots, degree),
  )
  const Zu = Z.derivative(), Zuu = Zu.derivative(), Zuuu = Zuu.derivative()
  const Wu = W.derivative(), Wuu = Wu.derivative(), Wuuu = Wuu.derivative()

  const D1 = Zu.mul(W).sub(Z.mul(Wu))
  const D2 = Zuu.mul(W).sub(Z.mul(Wuu))
  const D3 = Zuuu.mul(W).sub(Z.mul(Wuuu))
  const D21 = Zuu.mul(Wu).sub(Zu.mul(Wuu))

  const D1conjSq = D1.conj().mul(D1.conj())
  const bracket = D3.mul(D1).add(D1.mul(D21)).sub(D2.mul(D2).scale(1.5))
  const T = W.mul(bracket).add(D1.mul(Wu.mul(D2).sub(Wuu.mul(D1))).scale(2))
  return D1conjSq.mul(T).mul(W.conj()).im
}
