import type { PHMetadata, ComplexRationalPHMetadata } from '../optimizer/phCurve'
import type { ABPHMetadata } from '../optimizer/abPHCurve'
import type { RealRationalPHMetadata } from '../optimizer/realRationalPHCurve'

// Point types
export interface Point2D {
  x: number
  y: number
}

export interface Point3D {
  x: number
  y: number
  z: number
}

// 3D B-spline curve (spatial)
export interface Curve3D {
  id: string
  controlPoints: Point3D[]
  knots: number[]
  degree: number
  closed: boolean
}

export interface WeightedPoint2D extends Point2D {
  w: number // weight for rational B-splines
}

export interface ComplexPoint {
  re: number
  im: number
  w_re: number // real part of complex weight
  w_im: number // imaginary part of complex weight
}

// Curve types
export type CurveKind = 'bspline' | 'rational' | 'complex-rational'

// Base curve interface
interface BaseCurve {
  id: string
  degree: number
  knots: number[] // knot vector
  closed: boolean // periodic/closed curve
}

// Standard B-spline (non-rational)
export interface BSplineCurve extends BaseCurve {
  kind: 'bspline'
  controlPoints: Point2D[]
}

// Rational B-spline (NURBS)
export interface RationalBSplineCurve extends BaseCurve {
  kind: 'rational'
  controlPoints: WeightedPoint2D[]
  // For closed curves: Farin t-values are the primary data (one per edge)
  // Each t-value represents the position of Farin point along the edge [0, 1]
  // Weights are computed on demand from these t-values
  farinTValues?: number[]
  // For closed curves: weight for the "wrapped" control point 0 when accessed via wrapping
  // This is computed from t_{n-1}: wrapWeight = w_{n-1} * t_{n-1} / (1 - t_{n-1})
  wrapWeight?: number
}

// Complex rational B-spline (for circle arcs)
export interface ComplexRationalBSplineCurve extends BaseCurve {
  kind: 'complex-rational'
  controlPoints: ComplexPoint[]
  // For closed curves: Farin positions are the primary data (one per edge)
  // Each position is a 2D point representing the Farin point location
  // Complex weights are computed on demand from these positions
  farinPositions?: Point2D[]
  // For closed curves: complex weight for the "wrapped" control point 0
  wrapWeight?: { re: number; im: number }
}

// Union type for all curve types
export type Curve = BSplineCurve | RationalBSplineCurve | ComplexRationalBSplineCurve

// Drawing tool types
export type DrawingTool = 'none' | 'draw' | 'line' | 'circle' | 'spiral' | 'rational-spiral' | 'complex-spiral' | 'offset'

// Editor state types
export interface EditorState {
  curves: Curve[]
  selectedCurveId: string | null
  selectedControlPointIndex: number | null
  activeTool: DrawingTool
}

/** The defining coefficients for a PH / AB / rational / complex-rational curve,
 *  held in a side-map keyed by curve id (sceneStore.phMetadata). */
export type PHMetadataAny =
  | PHMetadata
  | ComplexRationalPHMetadata
  | ABPHMetadata
  | RealRationalPHMetadata

// History entry for undo/redo
export interface HistoryEntry {
  curves: Curve[]
  spatialCurves: Curve3D[]
  selectedCurveId: string | null
  // Snapshotted alongside geometry so undo/redo can't desync a curve's defining
  // coefficients from its control points. (TODO: co-locate onto the curve during
  // the sceneStore typing pass — see the design review.)
  phMetadata: Map<string, PHMetadataAny>
}
