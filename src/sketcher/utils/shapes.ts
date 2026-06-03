// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import type { Point2D, Curve, ComplexRationalBSplineCurve } from '../types/curve'
import { createBSpline, generateCurveId } from './bspline'
import { computeComplexWeightsFromFarinPositions } from './farinPoints'

// Create a line as a degree-1 B-spline
export function createLine(start: Point2D, end: Point2D): Curve {
  return createBSpline([start, end], 1)
}

// Create a circular arc using degree-1 complex rational B-spline representation.
// Two control points (start, end) on the circle, with a complex weight on the
// second point encoding the curvature. The Farin point q0 lies on the arc.
export function createCircularArc(
  start: Point2D,
  end: Point2D,
  center: Point2D,
  counterclockwise?: boolean
): ComplexRationalBSplineCurve {
  const r1 = Math.sqrt((start.x - center.x) ** 2 + (start.y - center.y) ** 2)
  const r2 = Math.sqrt((end.x - center.x) ** 2 + (end.y - center.y) ** 2)
  const radius = (r1 + r2) / 2

  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x)

  // Compute sweep angle (handle wrap-around)
  let sweep = endAngle - startAngle
  if (counterclockwise !== undefined) {
    if (counterclockwise) {
      if (sweep > 0) sweep -= 2 * Math.PI
    } else {
      if (sweep < 0) sweep += 2 * Math.PI
    }
  } else {
    if (sweep < -Math.PI) sweep += 2 * Math.PI
    if (sweep > Math.PI) sweep -= 2 * Math.PI
  }

  // Farin point q0 lies on the circle at the midpoint of the arc
  const midAngle = startAngle + sweep / 2
  const q0: Point2D = {
    x: center.x + radius * Math.cos(midAngle),
    y: center.y + radius * Math.sin(midAngle),
  }

  // Complex weight w1 = (q0 - z0) / (z1 - q0) where z0=start, z1=end as complex numbers
  const numRe = q0.x - start.x
  const numIm = q0.y - start.y
  const denRe = end.x - q0.x
  const denIm = end.y - q0.y
  const denNorm2 = denRe * denRe + denIm * denIm
  const w1_re = denNorm2 > 1e-14 ? (numRe * denRe + numIm * denIm) / denNorm2 : 1
  const w1_im = denNorm2 > 1e-14 ? (numIm * denRe - numRe * denIm) / denNorm2 : 0

  return {
    id: generateCurveId(),
    kind: 'complex-rational',
    degree: 1,
    knots: [0, 0, 1, 1],
    controlPoints: [
      { re: start.x, im: start.y, w_re: 1, w_im: 0 },
      { re: end.x, im: end.y, w_re: w1_re, w_im: w1_im },
    ],
    closed: false,
  }
}

// Create a 3-point arc (start, through, end)
// Uses complex rational B-spline for exact representation
export function createThreePointArc(
  start: Point2D,
  through: Point2D,
  end: Point2D
): ComplexRationalBSplineCurve | null {
  // Find the circle center from 3 points
  const center = findCircleCenter(start, through, end)
  if (!center) {
    // Points are collinear, return null or a line
    return null
  }

  return createCircularArc(start, end, center)
}

// Find circle center from 3 points using perpendicular bisectors
function findCircleCenter(p1: Point2D, p2: Point2D, p3: Point2D): Point2D | null {
  const ax = p1.x
  const ay = p1.y
  const bx = p2.x
  const by = p2.y
  const cx = p3.x
  const cy = p3.y

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))

  if (Math.abs(d) < 1e-10) {
    // Points are collinear
    return null
  }

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d

  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d

  return { x: ux, y: uy }
}

// Simple arc tool: given two endpoints, creates an arc with default bulge
export function createSimpleArc(start: Point2D, end: Point2D, bulge: number = 0.3): Curve {
  // Calculate midpoint and perpendicular direction
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  // Direction perpendicular to line
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len < 1e-10) {
    // Start and end are same point, return a point
    return createBSpline([start], 0)
  }

  // Perpendicular unit vector
  const px = -dy / len
  const py = dx / len

  // Third point with bulge
  const through: Point2D = {
    x: midX + px * len * bulge,
    y: midY + py * len * bulge,
  }

  // Try to create exact arc
  const arc = createThreePointArc(start, through, end)
  if (arc) return arc

  // Fallback to B-spline approximation
  return createBSpline([start, through, end], 2)
}

// Create a full circle as a closed degree-2 complex rational B-spline.
// 2 control points on the circle at diametrically opposite positions,
// with Farin points at the arc midpoints between them.
// Degree 2 gives C¹ continuity at the joins.
export function createFullCircle(center: Point2D, radius: number): ComplexRationalBSplineCurve {
  // 2 control points at 0° (right) and 180° (left)
  const rawControlPoints = [
    { re: center.x + radius, im: center.y },
    { re: center.x - radius, im: center.y },
  ]

  // Farin points at the arc midpoints: 90° (bottom) and 270° (top)
  const farinPositions = [
    { x: center.x, y: center.y + radius },
    { x: center.x, y: center.y - radius },
  ]

  // Compute complex weights from Farin positions
  const { points, wrapWeight } = computeComplexWeightsFromFarinPositions(rawControlPoints, farinPositions)

  return {
    id: generateCurveId(),
    kind: 'complex-rational',
    degree: 2,
    knots: [0, 0.5],
    controlPoints: points,
    closed: true,
    farinPositions,
    wrapWeight,
  }
}
