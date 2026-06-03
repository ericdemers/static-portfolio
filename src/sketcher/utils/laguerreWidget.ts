// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Utility functions for the Laguerre 3-line transform widget.
 */

import type { Point2D } from '../types/curve'
import type { OrientedLine } from '../optimizer/laguerrePH'

// ============================================================================
// Incircle Solver
// ============================================================================

/**
 * Solve for the incircle of 3 oriented lines.
 * Each line has normal (nx, ny) and signed distance d = nx·px + ny·py.
 * The incircle center (cx, cy) and signed radius r satisfy:
 *   nx_i · cx + ny_i · cy - r = d_i  for i = 1,2,3
 *
 * Returns null if the system is degenerate.
 */
export function solveIncircle(
  lines: OrientedLine[],
): { cx: number; cy: number; r: number } | null {
  if (lines.length < 3) return null

  const ld = lines.map((l) => {
    const nx = Math.cos(l.angle)
    const ny = Math.sin(l.angle)
    return { nx, ny, d: nx * l.px + ny * l.py }
  })

  const [l1, l2, l3] = ld
  const A = [
    [l1.nx, l1.ny, -1],
    [l2.nx, l2.ny, -1],
    [l3.nx, l3.ny, -1],
  ]
  const b = [l1.d, l2.d, l3.d]

  // Cramer's rule for 3×3 system
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  if (Math.abs(det) < 1e-10) return null

  const dX =
    b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2]) +
    A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])
  const dY =
    A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2]) -
    b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])
  const dR =
    A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1]) -
    A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0]) +
    b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])

  return { cx: dX / det, cy: dY / det, r: dR / det }
}

// ============================================================================
// Widget Handle Conversion
// ============================================================================

/**
 * Convert widget position handle and rotation handle to an OrientedLine.
 * The rotation handle lies along the line direction (perpendicular to normal),
 * so the normal angle = handle direction angle - π/2.
 */
export function orientedLineFromPoints(pos: Point2D, rotHandle: Point2D): OrientedLine {
  const dirAngle = Math.atan2(rotHandle.y - pos.y, rotHandle.x - pos.x)
  const angle = dirAngle - Math.PI / 2
  return { px: pos.x, py: pos.y, angle }
}

/**
 * Compute the rotation handle position from an OrientedLine.
 * The rotation handle is placed at a fixed distance along the normal direction.
 */
export function rotationHandleFromLine(line: OrientedLine, distance: number = 70): Point2D {
  const nx = Math.cos(line.angle)
  const ny = Math.sin(line.angle)
  // Place the rotation handle along the line direction (perpendicular to normal)
  const dirX = -ny
  const dirY = nx
  return { x: line.px + dirX * distance, y: line.py + dirY * distance }
}

// ============================================================================
// Widget Initialization from Curve Geometry
// ============================================================================

/**
 * Initialize 3 oriented lines from a curve's bounding box.
 * Creates a roughly equilateral arrangement of tangent lines around the curve.
 */
export function laguerreWidgetFromBBox(points: Point2D[]): {
  lines: OrientedLine[]
} {
  if (points.length === 0) {
    return {
      lines: [
        { px: 0, py: 0, angle: Math.PI * 0.4 },
        { px: 100, py: 0, angle: Math.PI * 1.1 },
        { px: 50, py: 80, angle: Math.PI * 1.8 },
      ],
    }
  }

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const r = Math.max(maxX - minX, maxY - minY) / 2 + 20

  // Place 3 lines as tangent lines to the bounding circle
  // at angles 90°, 210°, 330° (equilateral triangle)
  const lines: OrientedLine[] = []
  for (let i = 0; i < 3; i++) {
    const theta = (Math.PI / 2) + (i * 2 * Math.PI / 3)
    lines.push({
      px: cx + r * Math.cos(theta),
      py: cy + r * Math.sin(theta),
      angle: theta, // Normal points outward
    })
  }

  return { lines }
}

/**
 * Convert 3 OrientedLines to flat Point2D array for widget handle storage.
 * Format: [pos0, pos1, pos2, rot0, rot1, rot2]
 */
export function linesToHandlePoints(lines: OrientedLine[], handleDistance: number = 70): Point2D[] {
  const points: Point2D[] = []
  // Position handles (indices 0-2)
  for (const line of lines) {
    points.push({ x: line.px, y: line.py })
  }
  // Rotation handles (indices 3-5)
  for (const line of lines) {
    const rot = rotationHandleFromLine(line, handleDistance)
    points.push(rot)
  }
  return points
}

/**
 * Convert flat Point2D handle array back to 3 OrientedLines.
 */
export function handlePointsToLines(points: Point2D[]): OrientedLine[] {
  if (points.length < 6) return []
  return [
    orientedLineFromPoints(points[0], points[3]),
    orientedLineFromPoints(points[1], points[4]),
    orientedLineFromPoints(points[2], points[5]),
  ]
}
