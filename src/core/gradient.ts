import { BernsteinDecomposition, decomposeToBernstein, decomposeToBernsteinPeriodic } from './bernstein'

// ============================================================================
// Exact sparse gradient / Jacobian of the curvature numerator g.
//
// Forward-mode automatic differentiation over the B-spline-function algebra:
// each function is carried as a Dual (value + tangent). The seed tangent is
// ∂c/∂Pᵢ = Nᵢ — a "Dirac" B-spline (control points all zero but one), nonzero on
// only d+1 spans. The product rule on multiply propagates this locality, so the
// Jacobian column for control point i is computed on i's support spans alone —
// the exact, structure-exploiting Jacobian (vs dense autodiff over all spans).
// ============================================================================

/** A function and its derivative w.r.t. one control-point coordinate. */
class Dual {
  readonly v: BernsteinDecomposition
  readonly t: BernsteinDecomposition
  constructor(v: BernsteinDecomposition, t: BernsteinDecomposition) {
    this.v = v
    this.t = t
  }
  add(o: Dual): Dual {
    return new Dual(this.v.add(o.v), this.t.add(o.t))
  }
  sub(o: Dual): Dual {
    return new Dual(this.v.subtract(o.v), this.t.subtract(o.t))
  }
  mul(o: Dual): Dual {
    // product rule: (f·g)′ = f·g′ + f′·g
    return new Dual(this.v.multiply(o.v), this.v.multiply(o.t).add(this.t.multiply(o.v)))
  }
  scale(s: number): Dual {
    return new Dual(this.v.scale(s), this.t.scale(s))
  }
}

/** g = ‖c′‖²(c′×c‴) − 3(c′·c″)(c′×c″), assembled over Duals. */
function gOverDuals(x1: Dual, y1: Dual, x2: Dual, y2: Dual, x3: Dual, y3: Dual): Dual {
  const cross1 = x1.mul(y2).sub(y1.mul(x2)) // c′ × c″
  const dot = x1.mul(x2).add(y1.mul(y2)) // c′ · c″
  const cross2 = x1.mul(y3).sub(y1.mul(x3)) // c′ × c‴
  const normSq = x1.mul(x1).add(y1.mul(y1)) // ‖c′‖²
  return normSq.mul(cross2).sub(dot.mul(cross1).scale(3))
}

const zeroLike = (bd: BernsteinDecomposition): BernsteinDecomposition =>
  new BernsteinDecomposition(bd.coeffs.map((span) => span.map(() => 0)), bd.breaks)

/** Embed a subset result (spans [s0, s0+sub.numSpans)) into a full-width BD. */
function padToFull(
  sub: BernsteinDecomposition,
  s0: number,
  numSpans: number,
  spanDegree: number,
  breaks: number[],
): BernsteinDecomposition {
  const zeros = new Array<number>(spanDegree + 1).fill(0)
  const coeffs: number[][] = []
  for (let s = 0; s < numSpans; s++) {
    coeffs.push(s >= s0 && s < s0 + sub.numSpans ? sub.coeffs[s - s0] : [...zeros])
  }
  return new BernsteinDecomposition(coeffs, breaks)
}

export interface PlanarCurvatureGradient {
  /** The curvature numerator g(t). */
  g: BernsteinDecomposition
  /** ∂g/∂xᵢ for each control point i (full-width; nonzero only on i's support). */
  dx: BernsteinDecomposition[]
  /** ∂g/∂yᵢ for each control point i. */
  dy: BernsteinDecomposition[]
}

/**
 * g and its exact Jacobian w.r.t. the control points of a planar polynomial
 * B-spline curve. Each column is computed only on the perturbed control point's
 * support spans (B-spline locality), not the whole curve.
 */
export function curvatureExtremaGradientPlanar(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  const X1 = decomposeToBernstein(x, knots, degree).derivative()
  const Y1 = decomposeToBernstein(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  // Primal g (value only) — full width, computed once.
  const g = gOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
    new Dual(X3, zeroLike(X3)),
    new Dual(Y3, zeroLike(Y3)),
  ).v

  const n = x.length
  const numSpans = g.numSpans
  const gDeg = g.degree
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []

  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernstein(e, knots, degree) // the Dirac B-spline Nᵢ

    // Support spans of Nᵢ (contiguous).
    let s0 = -1
    let s1 = -1
    for (let s = 0; s < Ni.numSpans; s++) {
      if (Ni.coeffs[s].some((c) => Math.abs(c) > 1e-14)) {
        if (s0 < 0) s0 = s
        s1 = s
      }
    }
    if (s0 < 0) {
      const z = padToFull(new BernsteinDecomposition([], []), 0, numSpans, gDeg, g.breaks)
      dx.push(z)
      dy.push(z)
      continue
    }
    s1 += 1

    // Cached basis derivatives, restricted to the support spans.
    const Ni1 = Ni.derivative().subset(s0, s1)
    const Ni2 = Ni.derivative().derivative().subset(s0, s1)
    const Ni3 = Ni.derivative().derivative().derivative().subset(s0, s1)
    const x1 = X1.subset(s0, s1)
    const y1 = Y1.subset(s0, s1)
    const x2 = X2.subset(s0, s1)
    const y2 = Y2.subset(s0, s1)
    const x3 = X3.subset(s0, s1)
    const y3 = Y3.subset(s0, s1)

    // ∂g/∂xᵢ: seed the x-function tangents with Nᵢ derivatives, y with zeros.
    const gx = gOverDuals(
      new Dual(x1, Ni1),
      new Dual(y1, zeroLike(y1)),
      new Dual(x2, Ni2),
      new Dual(y2, zeroLike(y2)),
      new Dual(x3, Ni3),
      new Dual(y3, zeroLike(y3)),
    ).t
    // ∂g/∂yᵢ: tangents on the y-functions.
    const gy = gOverDuals(
      new Dual(x1, zeroLike(x1)),
      new Dual(y1, Ni1),
      new Dual(x2, zeroLike(x2)),
      new Dual(y2, Ni2),
      new Dual(x3, zeroLike(x3)),
      new Dual(y3, Ni3),
    ).t

    dx.push(padToFull(gx, s0, numSpans, gDeg, g.breaks))
    dy.push(padToFull(gy, s0, numSpans, gDeg, g.breaks))
  }

  return { g, dx, dy }
}

/**
 * g and its Jacobian for a CLOSED (periodic) planar B-spline curve. Same
 * forward-AD assembly; the seed is the periodic Dirac B-spline Nᵢ. Computed on
 * full periodic decompositions (periodic support wraps, so no span subsetting).
 */
export function curvatureExtremaGradientPlanarPeriodic(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  const X1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const Y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  const g = gOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
    new Dual(X3, zeroLike(X3)),
    new Dual(Y3, zeroLike(Y3)),
  ).v

  const n = x.length
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernsteinPeriodic(e, knots, degree)
    const Ni1 = Ni.derivative()
    const Ni2 = Ni1.derivative()
    const Ni3 = Ni2.derivative()
    dx.push(
      gOverDuals(
        new Dual(X1, Ni1),
        new Dual(Y1, zeroLike(Y1)),
        new Dual(X2, Ni2),
        new Dual(Y2, zeroLike(Y2)),
        new Dual(X3, Ni3),
        new Dual(Y3, zeroLike(Y3)),
      ).t,
    )
    dy.push(
      gOverDuals(
        new Dual(X1, zeroLike(X1)),
        new Dual(Y1, Ni1),
        new Dual(X2, zeroLike(X2)),
        new Dual(Y2, Ni2),
        new Dual(X3, zeroLike(X3)),
        new Dual(Y3, Ni3),
      ).t,
    )
  }
  return { g, dx, dy }
}
