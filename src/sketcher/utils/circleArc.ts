// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import type { Point2D } from '../types/curve'

export interface CircleArcGeometry {
  xc: number
  yc: number
  r: number
  startAngle: number
  endAngle: number
  counterclockwise: boolean
}

/**
 * Signed bending angle between vectors (q0-z0) and (z1-q0).
 * Uses atan2(cross, dot).
 */
export function cphi(z0: Point2D, z1: Point2D, q0: Point2D): number {
  const v0x = q0.x - z0.x
  const v0y = q0.y - z0.y
  const v1x = z1.x - q0.x
  const v1y = z1.y - q0.y
  const cross = v0x * v1y - v0y * v1x
  const dot = v0x * v1x + v0y * v1y
  return -Math.atan2(cross, dot)
}

/**
 * Weighted average of phi across interior points.
 * Weight for each interior point is the sum of squared distances to the endpoints.
 */
export function weightedAveragePhi(points: Point2D[]): number {
  if (points.length < 3) return 0

  const z0 = points[0]
  const z1 = points[points.length - 1]

  let totalWeight = 0
  let totalPhi = 0

  for (let i = 1; i < points.length - 1; i++) {
    const q = points[i]
    const d0sq = (q.x - z0.x) ** 2 + (q.y - z0.y) ** 2
    const d1sq = (q.x - z1.x) ** 2 + (q.y - z1.y) ** 2
    const w = d0sq + d1sq
    totalWeight += w
    totalPhi += w * cphi(z0, z1, q)
  }

  if (totalWeight < 1e-14) return 0
  return totalPhi / totalWeight
}

/**
 * Compute middle control point from phi.
 * q0 = (z0 + w1*z1) / (1 + w1) where w1 = e^(i*phi).
 * This uses complex arithmetic to find the point on the arc.
 */
export function q0FromPhi(phi: number, z0: Point2D, z1: Point2D): Point2D {
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  // w1 = e^(i*phi) = cos(phi) + i*sin(phi)
  // Multiply w1 * z1 in complex: (cosPhi + i*sinPhi) * (z1.x + i*z1.y)
  const w1z1x = cosPhi * z1.x - sinPhi * z1.y
  const w1z1y = sinPhi * z1.x + cosPhi * z1.y
  // denom = 1 + w1 = (1 + cosPhi) + i*sinPhi
  const denomRe = 1 + cosPhi
  const denomIm = sinPhi
  // num = z0 + w1*z1
  const numRe = z0.x + w1z1x
  const numIm = z0.y + w1z1y
  // q0 = num / denom (complex division)
  const denomNorm2 = denomRe * denomRe + denomIm * denomIm
  if (denomNorm2 < 1e-14) {
    // phi near +/- pi, degenerate
    return { x: (z0.x + z1.x) / 2, y: (z0.y + z1.y) / 2 }
  }
  return {
    x: (numRe * denomRe + numIm * denomIm) / denomNorm2,
    y: (numIm * denomRe - numRe * denomIm) / denomNorm2,
  }
}

/**
 * Compute circle geometry from 3 points on the circle.
 */
export function circleArcFromThreePoints(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D
): CircleArcGeometry | null {
  const center = findCircleCenterFromThreePoints(p0, p1, p2)
  if (!center) return null

  const r = Math.sqrt((p0.x - center.x) ** 2 + (p0.y - center.y) ** 2)
  const startAngle = Math.atan2(p0.y - center.y, p0.x - center.x)
  const midAngle = Math.atan2(p1.y - center.y, p1.x - center.x)
  const endAngle = Math.atan2(p2.y - center.y, p2.x - center.x)

  // Determine direction from the cross product of the three points.
  // In SVG/Canvas coordinates (Y-down): positive cross = clockwise, negative = counterclockwise
  const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x)
  const counterclockwise = cross < 0

  return { xc: center.x, yc: center.y, r, startAngle, endAngle, counterclockwise }
}

/**
 * Find circle center from 3 points using perpendicular bisectors.
 */
function findCircleCenterFromThreePoints(p1: Point2D, p2: Point2D, p3: Point2D): Point2D | null {
  const ax = p1.x, ay = p1.y
  const bx = p2.x, by = p2.y
  const cx = p3.x, cy = p3.y

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-10) return null

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) / d

  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) / d

  return { x: ux, y: uy }
}

/**
 * Clean noisy drawn points into 3 well-distributed arc points.
 * Returns [start, middle, end] points chosen from the noisy input.
 */
export function threeArcPointsFromNoisyPoints(points: Point2D[]): [Point2D, Point2D, Point2D] {
  if (points.length < 3) {
    return [points[0], points[Math.floor(points.length / 2)] || points[0], points[points.length - 1]]
  }

  const z0 = points[0]
  const z1 = points[points.length - 1]
  const phi = weightedAveragePhi(points)
  const q0 = q0FromPhi(phi, z0, z1)

  return [z0, q0, z1]
}
