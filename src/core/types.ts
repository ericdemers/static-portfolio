// Canonical control-point representations for the B-spline core.

export interface Point2D {
  x: number
  y: number
}

/** A control point of a rational B-spline (NURBS): position + real weight. */
export interface WeightedPoint2D {
  x: number
  y: number
  w: number
}

/** A control point of a complex-rational B-spline: complex position + complex weight. */
export interface ComplexPoint {
  re: number
  im: number
  w_re: number
  w_im: number
}
