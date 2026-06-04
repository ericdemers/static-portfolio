// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Transform Math for B-Spline Curve Widget
 *
 * Three transformation groups matching three curve types:
 * - BSpline (polynomial) -> Affine (6 DOF): parallelogram widget
 * - Rational (NURBS) -> Projective (8 DOF): quadrilateral widget
 * - Complex-rational -> Mobius (6 DOF): circle + 3 points widget
 *
 * Key insight: for all 3 types, applying the respective transform to control
 * points in homogeneous coordinates produces the correct transformed curve.
 */

import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types/curve'
import { luSolve } from '../optimizer/linearAlgebra'
import { cmult, cdiv, csub, cadd, type Complex } from './complex'

// ============================================================================
// Types
// ============================================================================

export interface AffineTransform {
  // [a, b, tx; c, d, ty] maps (x,y) -> (a*x + b*y + tx, c*x + d*y + ty)
  a: number; b: number; tx: number
  c: number; d: number; ty: number
}

export interface ProjectiveTransform {
  // 3x3 homography matrix stored row-major
  // [h00, h01, h02; h10, h11, h12; h20, h21, 1]
  h: number[] // length 8, h[8] = 1 implicitly
}

export interface MobiusTransform {
  // f(z) = (a*z + b) / (c*z + d), operating on complex numbers
  a: Complex; b: Complex; c: Complex; d: Complex
}

// ============================================================================
// Bounding Box
// ============================================================================

export function computeBBox(points: Point2D[]): { corners: Point2D[]; center: Point2D } {
  if (points.length === 0) {
    return {
      corners: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }],
      center: { x: 0, y: 0 },
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  // Handle degenerate cases: expand to minimum-size square
  const MIN_SIZE = 0.1
  const width = maxX - minX
  const height = maxY - minY

  if (width < MIN_SIZE && height < MIN_SIZE) {
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const half = MIN_SIZE / 2
    minX = cx - half; maxX = cx + half
    minY = cy - half; maxY = cy + half
  } else if (width < MIN_SIZE) {
    const cx = (minX + maxX) / 2
    const half = height * 0.1
    minX = cx - Math.max(half, MIN_SIZE / 2)
    maxX = cx + Math.max(half, MIN_SIZE / 2)
  } else if (height < MIN_SIZE) {
    const cy = (minY + maxY) / 2
    const half = width * 0.1
    minY = cy - Math.max(half, MIN_SIZE / 2)
    maxY = cy + Math.max(half, MIN_SIZE / 2)
  }

  // Add 10% padding
  const padX = (maxX - minX) * 0.1
  const padY = (maxY - minY) * 0.1
  minX -= padX; maxX += padX
  minY -= padY; maxY += padY

  // Corners: TL, TR, BR, BL (clockwise)
  const corners: Point2D[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]

  return {
    corners,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  }
}

// ============================================================================
// Circle from BBox (for Mobius widget)
// ============================================================================

export function computeCircleFromBBox(points: Point2D[]): {
  center: Point2D; radius: number; handlePoints: Point2D[]
} {
  const { center } = computeBBox(points)

  // Compute radius as max distance from center to any point, with padding
  let maxDist = 0
  for (const p of points) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy))
  }
  const radius = Math.max(maxDist * 1.2, 0.1)

  // 3 evenly-spaced handle points on circle
  const handlePoints: Point2D[] = []
  for (let i = 0; i < 3; i++) {
    const angle = (2 * Math.PI * i) / 3 - Math.PI / 2 // start at top
    handlePoints.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    })
  }

  return { center, radius, handlePoints }
}

// ============================================================================
// Edge Midpoints
// ============================================================================

export function computeEdgeMidpoints(corners: Point2D[]): Point2D[] {
  const n = corners.length
  const midpoints: Point2D[] = []
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    midpoints.push({
      x: (corners[i].x + corners[next].x) / 2,
      y: (corners[i].y + corners[next].y) / 2,
    })
  }
  return midpoints
}

// ============================================================================
// Affine Transform (3 point pairs -> 6 DOF)
// ============================================================================

/**
 * Compute affine transform from 3 corresponding point pairs.
 * Solves two 3x3 systems:
 *   [x0 y0 1] [a]   [x0']        [x0 y0 1] [c]   [y0']
 *   [x1 y1 1] [b] = [x1']   and  [x1 y1 1] [d] = [y1']
 *   [x2 y2 1] [tx]  [x2']        [x2 y2 1] [ty]  [y2']
 */
export function computeAffineTransform(
  originals: Point2D[],
  targets: Point2D[]
): AffineTransform | null {
  if (originals.length < 3 || targets.length < 3) return null

  const A = [
    [originals[0].x, originals[0].y, 1],
    [originals[1].x, originals[1].y, 1],
    [originals[2].x, originals[2].y, 1],
  ]

  const bx = [targets[0].x, targets[1].x, targets[2].x]
  const by = [targets[0].y, targets[1].y, targets[2].y]

  const solX = luSolve(A, bx)
  const solY = luSolve(A, by)

  if (!solX.success || !solY.success) return null

  return {
    a: solX.x[0], b: solX.x[1], tx: solX.x[2],
    c: solY.x[0], d: solY.x[1], ty: solY.x[2],
  }
}

export function applyAffineToPoint(t: AffineTransform, p: Point2D): Point2D {
  return {
    x: t.a * p.x + t.b * p.y + t.tx,
    y: t.c * p.x + t.d * p.y + t.ty,
  }
}

export function applyAffineToBSpline(
  transform: AffineTransform,
  controlPoints: Point2D[]
): Point2D[] {
  return controlPoints.map(p => applyAffineToPoint(transform, p))
}

// ============================================================================
// Projective Transform (4 point pairs -> 8 DOF, DLT)
// ============================================================================

/**
 * Compute projective transform from 4 corresponding point pairs using DLT.
 * The homography maps (x,y,1) -> (x',y',1) in homogeneous coordinates.
 *
 * For each pair (xi,yi) -> (xi',yi'), two equations:
 *   xi*h00 + yi*h01 + h02 - xi'*xi*h20 - xi'*yi*h21 = xi'
 *   xi*h10 + yi*h11 + h12 - yi'*xi*h20 - yi'*yi*h21 = yi'
 *
 * This gives an 8x8 system for [h00,h01,h02,h10,h11,h12,h20,h21].
 */
export function computeProjectiveTransform(
  originals: Point2D[],
  targets: Point2D[]
): ProjectiveTransform | null {
  if (originals.length < 4 || targets.length < 4) return null

  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const { x, y } = originals[i]
    const { x: xp, y: yp } = targets[i]

    // First equation: x*h00 + y*h01 + h02 + 0 + 0 + 0 - xp*x*h20 - xp*y*h21 = xp
    A.push([x, y, 1, 0, 0, 0, -xp * x, -xp * y])
    b.push(xp)

    // Second equation: 0 + 0 + 0 + x*h10 + y*h11 + h12 - yp*x*h20 - yp*y*h21 = yp
    A.push([0, 0, 0, x, y, 1, -yp * x, -yp * y])
    b.push(yp)
  }

  const sol = luSolve(A, b)
  if (!sol.success) return null

  return { h: sol.x }
}

export function applyProjectiveToPoint(
  t: ProjectiveTransform,
  x: number, y: number
): { x: number; y: number; w: number } {
  const h = t.h
  const wx = h[0] * x + h[1] * y + h[2]
  const wy = h[3] * x + h[4] * y + h[5]
  const w = h[6] * x + h[7] * y + 1
  return { x: wx, y: wy, w }
}

/**
 * Apply projective transform to rational B-spline control points.
 * Works in homogeneous coordinates (wx, wy, w).
 */
export function applyProjectiveToRational(
  transform: ProjectiveTransform,
  controlPoints: WeightedPoint2D[]
): WeightedPoint2D[] {
  return controlPoints.map(p => {
    // The point in Euclidean coordinates
    const result = applyProjectiveToPoint(transform, p.x, p.y)
    // New weight = old_weight * result.w
    const newW = p.w * result.w
    // New position = result.(x,y) / result.w (but store as Euclidean + weight)
    return {
      x: result.x / result.w,
      y: result.y / result.w,
      w: newW,
    }
  })
}

// ============================================================================
// Mobius Transform (3 complex point pairs -> cross-ratio)
// ============================================================================

/**
 * Compute Mobius transform from 3 corresponding complex point pairs.
 * Uses the cross-ratio formula:
 *   f(z) = (a*z + b) / (c*z + d)
 * where f maps z1->w1, z2->w2, z3->w3.
 *
 * The formula uses:
 *   f(z) = [(w1-w3)(w2-w1)^{-1}(z-z1)(z2-z3) - (w2-w3)(z-z3)(z2-z1)] /
 *          [  ... terms to make z1->w1, z2->w2, z3->w3 ... ]
 *
 * More directly, we solve for a,b,c,d from:
 *   a*z1 + b = w1*(c*z1 + d)
 *   a*z2 + b = w2*(c*z2 + d)
 *   a*z3 + b = w3*(c*z3 + d)
 * with normalization ad - bc = 1 (or just d=1 for simplicity when possible).
 */
export function computeMobiusTransform(
  originals: Complex[],
  targets: Complex[]
): MobiusTransform | null {
  if (originals.length < 3 || targets.length < 3) return null

  // Use the explicit cross-ratio formula for Mobius transforms.
  // f(z) = (a*z + b) / (c*z + d) mapping z1->w1, z2->w2, z3->w3.
  //
  // From cross-ratio preservation:
  // a = w1*(z2 - z3)*w32 - w3*(z2 - z1)*w12  (where w32 = w3 - w2, etc.)
  // ...but it's easier to build it from the standard formula:
  //
  // f(z) sends z1->w1, z2->w2, z3->w3 iff
  //   (f(z)-w1)(w2-w3)     (z-z1)(z2-z3)
  //   ───────────────── = ─────────────────
  //   (f(z)-w3)(w2-w1)     (z-z3)(z2-z1)
  //
  // Rearranging for f(z) = (Az + B) / (Cz + D):
  //   A = w1*(z2-z3)*(w2-w3) - w3*(z2-z1)*(w2-w1)  ... not quite, let me derive properly.
  //
  // Let R = (w2-w3)/(w2-w1), S = (z2-z3)/(z2-z1)
  // Then: (f-w1)/(f-w3) = R_inv * S * (z-z1)/(z-z3)  ... where R_inv is not needed.
  //
  // Actually, expand directly:
  //   f(z)*(w2-w3)*(z-z3)*(z2-z1) - w1*(w2-w3)*(z-z3)*(z2-z1)
  //     = f(z)*(w2-w1)*(z-z1)*(z2-z3) - w3*(w2-w1)*(z-z1)*(z2-z3)
  //
  //   f(z) * [(w2-w3)(z2-z1)(z-z3) - (w2-w1)(z2-z3)(z-z1)]
  //     = w1*(w2-w3)*(z2-z1)*(z-z3) - w3*(w2-w1)*(z2-z3)*(z-z1)
  //
  // f(z) = [w1*A21*A03 - w3*B21*B01] / [A21*A03 - B21*B01]
  //   where A21=(w2-w3)(z2-z1), A03=(z-z3), B21=(w2-w1)(z2-z3), B01=(z-z1)
  //
  // Numerator = w1*(w2-w3)*(z2-z1)*(z-z3) - w3*(w2-w1)*(z2-z3)*(z-z1)
  //   = z*[w1*(w2-w3)*(z2-z1) - w3*(w2-w1)*(z2-z3)]
  //     + [-z3*w1*(w2-w3)*(z2-z1) + z1*w3*(w2-w1)*(z2-z3)]
  //
  // Denominator = (w2-w3)*(z2-z1)*(z-z3) - (w2-w1)*(z2-z3)*(z-z1)
  //   = z*[(w2-w3)*(z2-z1) - (w2-w1)*(z2-z3)]
  //     + [-z3*(w2-w3)*(z2-z1) + z1*(w2-w1)*(z2-z3)]
  //
  // So a = w1*P - w3*Q, b = -z3*w1*P + z1*w3*Q, c = P - Q, d = -z3*P + z1*Q
  // where P = (w2-w3)*(z2-z1), Q = (w2-w1)*(z2-z3)

  const [z1, z2, z3] = originals
  const [w1, w2, w3] = targets

  const w2mw3 = csub(w2, w3)
  const w2mw1 = csub(w2, w1)
  const z2mz1 = csub(z2, z1)
  const z2mz3 = csub(z2, z3)

  const P = cmult(w2mw3, z2mz1)
  const Q = cmult(w2mw1, z2mz3)

  const a = csub(cmult(w1, P), cmult(w3, Q))
  const b = cadd(cmult({ re: -z3.re, im: -z3.im }, cmult(w1, P)),
                 cmult(z1, cmult(w3, Q)))
  const c = csub(P, Q)
  const d = cadd(cmult({ re: -z3.re, im: -z3.im }, P),
                 cmult(z1, Q))

  // Check if the transform is degenerate (ad - bc = 0)
  const det = csub(cmult(a, d), cmult(b, c))
  const detNorm = Math.sqrt(det.re * det.re + det.im * det.im)
  if (detNorm < 1e-14) return null

  return { a, b, c, d }
}

export function applyMobiusToComplex(t: MobiusTransform, z: Complex): Complex {
  const num = cadd(cmult(t.a, z), t.b)
  const den = cadd(cmult(t.c, z), t.d)
  return cdiv(num, den)
}

/**
 * Apply Mobius transform to complex-rational B-spline control points.
 * Works in complex homogeneous coordinates (w*z, w):
 *   new_wz = a*(w*z) + b*w
 *   new_w  = c*(w*z) + d*w
 */
export function applyMobiusToComplexRational(
  transform: MobiusTransform,
  controlPoints: ComplexPoint[]
): ComplexPoint[] {
  return controlPoints.map(p => {
    const w: Complex = { re: p.w_re, im: p.w_im }
    const z: Complex = { re: p.re, im: p.im }
    const wz = cmult(w, z)

    // new_wz = a*wz + b*w
    const new_wz = cadd(cmult(transform.a, wz), cmult(transform.b, w))
    // new_w = c*wz + d*w
    const new_w = cadd(cmult(transform.c, wz), cmult(transform.d, w))

    // Extract new position: new_z = new_wz / new_w
    const new_z = cdiv(new_wz, new_w)

    return {
      re: new_z.re,
      im: new_z.im,
      w_re: new_w.re,
      w_im: new_w.im,
    }
  })
}

// ============================================================================
// Parallelogram Constraint
// ============================================================================

/**
 * Constrain a quadrilateral to remain a parallelogram when dragging a corner.
 * Corners are [TL, TR, BR, BL]. Opposite sides must stay parallel.
 *
 * When corner i is dragged to newPos:
 * - The two adjacent corners are fixed
 * - The opposite corner moves to maintain the parallelogram shape
 *
 * For a parallelogram: P0 + P2 = P1 + P3 (diagonals bisect)
 */
export function constrainParallelogram(
  corners: Point2D[],
  draggedIndex: number,
  newPos: Point2D
): Point2D[] {
  const result = [...corners.map(p => ({ ...p }))]
  result[draggedIndex] = { ...newPos }

  // The opposite corner index: 0<->2, 1<->3
  const oppositeIndex = (draggedIndex + 2) % 4

  // For a parallelogram: the center (intersection of diagonals) = midpoint of any diagonal
  // Move the opposite corner so the parallelogram constraint holds:
  // P[i] + P[opposite] = P[adj1] + P[adj2]
  const adj1 = (draggedIndex + 1) % 4
  const adj2 = (draggedIndex + 3) % 4

  result[oppositeIndex] = {
    x: result[adj1].x + result[adj2].x - newPos.x,
    y: result[adj1].y + result[adj2].y - newPos.y,
  }

  return result
}

/**
 * Handle dragging an edge midpoint on a parallelogram.
 * Midpoint i sits between corner i and corner (i+1)%4.
 * Dragging it translates that edge while keeping the parallelogram constraint.
 */
export function applyParallelogramMidpointDrag(
  corners: Point2D[],
  midpointIdx: number,
  newPos: Point2D
): Point2D[] {
  const c0 = midpointIdx
  const c1 = (midpointIdx + 1) % 4

  // Current midpoint
  const currentMid = {
    x: (corners[c0].x + corners[c1].x) / 2,
    y: (corners[c0].y + corners[c1].y) / 2,
  }

  // Displacement
  const dx = newPos.x - currentMid.x
  const dy = newPos.y - currentMid.y

  // Move both endpoints of this edge
  const result = corners.map(p => ({ ...p }))
  result[c0] = { x: corners[c0].x + dx, y: corners[c0].y + dy }
  result[c1] = { x: corners[c1].x + dx, y: corners[c1].y + dy }

  // Move the opposite edge's endpoints to maintain parallelogram
  // In a parallelogram, opposite sides are parallel and equal length
  // The opposite edge is (c0+2)%4 -- (c1+2)%4, but it should NOT move
  // Actually, for a parallelogram midpoint drag, we want to scale/shear:
  // The two adjacent corners (c0, c1) move with the drag.
  // The opposite two corners stay fixed.
  // This may break the parallelogram constraint, so we need to re-enforce it.
  //
  // Actually, a simpler approach: the midpoint drag shifts that side,
  // and the parallelogram constraint means the opposite side stays fixed.
  // This naturally gives a shear/scale of the parallelogram.

  return result
}

/**
 * Handle dragging an edge midpoint on a free quadrilateral.
 * Midpoint i sits between corner i and corner (i+1)%4.
 * Both corners of that edge move equally.
 */
export function applyQuadrilateralMidpointDrag(
  corners: Point2D[],
  midpointIdx: number,
  newPos: Point2D
): Point2D[] {
  const c0 = midpointIdx
  const c1 = (midpointIdx + 1) % 4

  // Current midpoint
  const currentMid = {
    x: (corners[c0].x + corners[c1].x) / 2,
    y: (corners[c0].y + corners[c1].y) / 2,
  }

  // Displacement
  const dx = newPos.x - currentMid.x
  const dy = newPos.y - currentMid.y

  // Move both endpoints of this edge
  const result = corners.map(p => ({ ...p }))
  result[c0] = { x: corners[c0].x + dx, y: corners[c0].y + dy }
  result[c1] = { x: corners[c1].x + dx, y: corners[c1].y + dy }

  return result
}

// ============================================================================
// Circle through 3 points
// ============================================================================

export function circleThrough3Points(
  p1: Point2D, p2: Point2D, p3: Point2D
): { center: Point2D; radius: number } | null {
  // Solve for the circumscribed circle.
  // The center is equidistant from all 3 points.
  // 2*(x2-x1)*cx + 2*(y2-y1)*cy = x2^2 + y2^2 - x1^2 - y1^2
  // 2*(x3-x1)*cx + 2*(y3-y1)*cy = x3^2 + y3^2 - x1^2 - y1^2

  const ax = 2 * (p2.x - p1.x)
  const ay = 2 * (p2.y - p1.y)
  const bx = 2 * (p3.x - p1.x)
  const by = 2 * (p3.y - p1.y)

  const c1 = p2.x * p2.x + p2.y * p2.y - p1.x * p1.x - p1.y * p1.y
  const c2 = p3.x * p3.x + p3.y * p3.y - p1.x * p1.x - p1.y * p1.y

  const det = ax * by - ay * bx
  if (Math.abs(det) < 1e-10) return null // Collinear

  const cx = (c1 * by - c2 * ay) / det
  const cy = (ax * c2 - bx * c1) / det

  const radius = Math.sqrt((cx - p1.x) ** 2 + (cy - p1.y) ** 2)

  return { center: { x: cx, y: cy }, radius }
}

// ============================================================================
// Affine transform helpers for the widget
// ============================================================================

/**
 * Get 3 reference points from 4 corners for affine transform computation.
 * We use corners [0, 1, 3] (TL, TR, BL) as the reference triangle.
 */
export function getAffineReferencePoints(corners: Point2D[]): Point2D[] {
  return [corners[0], corners[1], corners[3]]
}

/**
 * Get 4 reference points from 4 corners for projective transform computation.
 */
export function getProjectiveReferencePoints(corners: Point2D[]): Point2D[] {
  return [corners[0], corners[1], corners[2], corners[3]]
}
