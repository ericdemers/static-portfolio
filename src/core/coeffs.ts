import type { Point2D, WeightedPoint2D, ComplexPoint } from './types'
import { type Complex, cadd, cmul, cscale, cdiv, cpow } from './complex'

/**
 * A coefficient field for B-spline operations. It captures everything that
 * differs between a scalar B-spline *function* and plain / rational /
 * complex-rational *curves*, so the generic evaluator and knot-insertion work
 * for all of them, open or periodic.
 *
 *   CP  — control-point / coefficient shape (input & output of insertion)
 *   H   — homogeneous-coordinate carrier (accumulated; insertion happens here)
 *   S   — scalar ring for weights and the periodic spiral ratio
 *   Out — value space of evaluation (number for a function, Point2D for a curve)
 *
 * `lift`/`unlift` are inverses: insertion lifts to homogeneous coords, blends
 * affinely there (the only correct space for rational/complex), then unlifts.
 * `project` is the (possibly lossy) map to the value space for drawing/plotting.
 */
export interface Coeffs<CP, H, S, Out> {
  /** Multiplicative identity of S (a no-op spiral). */
  readonly one: S
  /** Lift a control point to homogeneous coordinates. */
  lift(cp: CP): H
  /** Recover a control point (with its weight) from homogeneous coordinates. */
  unlift(h: H): CP
  /** Additive identity (accumulator seed). */
  zero(): H
  /** acc + n·h, where n is a real basis value. */
  madd(acc: H, n: number, h: H): H
  /** Multiply homogeneous coordinates by a scalar (the periodic spiral). */
  scale(h: H, s: S): H
  /** Project homogeneous coordinates to the value space. */
  project(h: H): Out
  /** Integer power s^q of a scalar (spiral across q periods). */
  spow(s: S, q: number): S
}

// --- scalar B-spline function: f(t) = Σ bᵢ Nᵢ(t), ℝ → ℝ -------------------
export const scalarCoeffs: Coeffs<number, number, number, number> = {
  one: 1,
  lift: (b) => b,
  unlift: (h) => h,
  zero: () => 0,
  madd: (a, n, h) => a + n * h,
  scale: (h) => h,
  project: (h) => h,
  spow: () => 1,
}

// --- plain B-spline curve: weight ≡ 1, no projection, no spiral ------------
export const plainCoeffs: Coeffs<Point2D, Point2D, number, Point2D> = {
  one: 1,
  lift: (p) => ({ x: p.x, y: p.y }),
  unlift: (h) => ({ x: h.x, y: h.y }),
  zero: () => ({ x: 0, y: 0 }),
  madd: (a, n, h) => ({ x: a.x + n * h.x, y: a.y + n * h.y }),
  scale: (h) => h,
  project: (h) => h,
  spow: () => 1,
}

// --- rational B-spline curve (NURBS): homogeneous (wx, wy, w) --------------
interface RatH {
  wx: number
  wy: number
  w: number
}
export const rationalCoeffs: Coeffs<WeightedPoint2D, RatH, number, Point2D> = {
  one: 1,
  lift: (p) => ({ wx: p.w * p.x, wy: p.w * p.y, w: p.w }),
  unlift: (h) => ({ x: h.wx / h.w, y: h.wy / h.w, w: h.w }),
  zero: () => ({ wx: 0, wy: 0, w: 0 }),
  madd: (a, n, h) => ({ wx: a.wx + n * h.wx, wy: a.wy + n * h.wy, w: a.w + n * h.w }),
  scale: (h, s) => ({ wx: s * h.wx, wy: s * h.wy, w: s * h.w }),
  project: (h) => ({ x: h.wx / h.w, y: h.wy / h.w }),
  spow: (s, q) => s ** q,
}

// --- complex-rational B-spline curve: homogeneous (c0, c1) over ℂ ----------
interface CxH {
  c0: Complex
  c1: Complex
}
export const complexCoeffs: Coeffs<ComplexPoint, CxH, Complex, Point2D> = {
  one: { re: 1, im: 0 },
  lift: (p) => {
    const w: Complex = { re: p.w_re, im: p.w_im }
    return { c0: cmul(w, { re: p.re, im: p.im }), c1: w }
  },
  unlift: (h) => {
    const z = cdiv(h.c0, h.c1)
    return { re: z.re, im: z.im, w_re: h.c1.re, w_im: h.c1.im }
  },
  zero: () => ({ c0: { re: 0, im: 0 }, c1: { re: 0, im: 0 } }),
  madd: (a, n, h) => ({
    c0: cadd(a.c0, cscale(h.c0, n)),
    c1: cadd(a.c1, cscale(h.c1, n)),
  }),
  scale: (h, s) => ({ c0: cmul(s, h.c0), c1: cmul(s, h.c1) }),
  project: (h) => {
    const d = h.c1.re * h.c1.re + h.c1.im * h.c1.im
    if (d < 1e-20) return { x: 0, y: 0 }
    const z = cdiv(h.c0, h.c1)
    return { x: z.re, y: z.im }
  },
  spow: (s, q) => cpow(s, q),
}

// --- spiral-ratio helpers (ratio = wrapWeight / w₀) ------------------------
export const realSpiralRatio = (wrapWeight: number, w0: number): number =>
  w0 !== 0 ? wrapWeight / w0 : 1

export const complexSpiralRatio = (wrapWeight: Complex, w0: Complex): Complex =>
  cdiv(wrapWeight, w0)
