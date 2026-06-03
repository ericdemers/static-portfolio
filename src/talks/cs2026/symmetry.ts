import type { Point2D } from '../../core'

/**
 * Symmetry constraint system for closed B-spline curves.
 *
 * Assumptions:
 * 1. The initial control points are positioned symmetrically (within tolerance)
 *    with respect to the active symmetry axes.
 * 2. The symmetry axes pass through the origin (0, 0) and are aligned with
 *    the coordinate axes (X-axis = horizontal, Y-axis = vertical).
 * 3. The knot vector is uniform periodic, so it does not break the symmetry.
 *    (A non-uniform knot vector could make the curve asymmetric even with
 *    symmetric control points.)
 * 4. No assumption is made about the number of control points (does not need
 *    to be divisible by 4) or the B-spline degree.
 * 5. Control points may lie on an axis. Such points are their own mirror —
 *    when that axis's symmetry is active, the point is constrained to stay
 *    on the axis.
 *
 * Mirror pairs are detected at initialization by matching control point
 * positions: two CPs are an X-axis mirror pair if they share (approximately)
 * the same x-coordinate and have opposite y-coordinates. Similarly for Y-axis.
 */

const TOLERANCE = 1e-3

/**
 * For a given axis, find the mirror index for each control point.
 * Returns an array where mirrorMap[i] = j means CP i mirrors CP j.
 * If a CP lies on the axis, mirrorMap[i] = i (self-mirror).
 * If no mirror is found, mirrorMap[i] = -1.
 */
export function buildMirrorMap(
  controlPoints: Point2D[],
  axis: 'x' | 'y'
): number[] {
  const n = controlPoints.length
  const map = new Array<number>(n).fill(-1)

  for (let i = 0; i < n; i++) {
    if (map[i] !== -1) continue

    const p = controlPoints[i]

    // Check if this point lies on the axis
    if (axis === 'x' && Math.abs(p.y) < TOLERANCE) {
      map[i] = i // on X-axis → self-mirror
      continue
    }
    if (axis === 'y' && Math.abs(p.x) < TOLERANCE) {
      map[i] = i // on Y-axis → self-mirror
      continue
    }

    // Find the mirror partner
    for (let j = i + 1; j < n; j++) {
      if (map[j] !== -1) continue
      const q = controlPoints[j]

      if (axis === 'x') {
        // X-axis mirror: same x, opposite y
        if (Math.abs(p.x - q.x) < TOLERANCE && Math.abs(p.y + q.y) < TOLERANCE) {
          map[i] = j
          map[j] = i
          break
        }
      } else {
        // Y-axis mirror: same y, opposite x
        if (Math.abs(p.y - q.y) < TOLERANCE && Math.abs(p.x + q.x) < TOLERANCE) {
          map[i] = j
          map[j] = i
          break
        }
      }
    }
  }

  return map
}

/**
 * Given a dragged control point and its new position, compute the
 * updated positions for all control points that are linked by symmetry.
 *
 * Returns an array of { index, position } updates to apply.
 */
export function computeSymmetricMoves(
  draggedIndex: number,
  newPosition: Point2D,
  mirrorMapX: number[] | null,
  mirrorMapY: number[] | null,
): { index: number; position: Point2D }[] {
  const updates: Map<number, Point2D> = new Map()
  updates.set(draggedIndex, { ...newPosition })

  // Apply X-axis symmetry: mirror across X-axis (negate y)
  if (mirrorMapX) {
    const mirrorIdx = mirrorMapX[draggedIndex]
    if (mirrorIdx !== -1 && mirrorIdx !== draggedIndex) {
      updates.set(mirrorIdx, { x: newPosition.x, y: -newPosition.y })
    } else if (mirrorIdx === draggedIndex) {
      // Self-mirror: constrain to X-axis
      updates.set(draggedIndex, { x: newPosition.x, y: 0 })
    }
  }

  // Apply Y-axis symmetry: mirror across Y-axis (negate x)
  if (mirrorMapY) {
    // Mirror the dragged point
    const mirrorIdx = mirrorMapY[draggedIndex]
    if (mirrorIdx !== -1 && mirrorIdx !== draggedIndex) {
      const draggedPos = updates.get(draggedIndex)!
      updates.set(mirrorIdx, { x: -draggedPos.x, y: draggedPos.y })
    } else if (mirrorIdx === draggedIndex) {
      // Self-mirror: constrain to Y-axis
      const draggedPos = updates.get(draggedIndex)!
      updates.set(draggedIndex, { x: 0, y: draggedPos.y })
    }

    // Also mirror any X-axis mirror that was already added
    if (mirrorMapX) {
      const xMirrorIdx = mirrorMapX[draggedIndex]
      if (xMirrorIdx !== -1 && xMirrorIdx !== draggedIndex) {
        const xMirrorPos = updates.get(xMirrorIdx)!
        const yOfXMirror = mirrorMapY[xMirrorIdx]
        if (yOfXMirror !== -1 && yOfXMirror !== xMirrorIdx) {
          updates.set(yOfXMirror, { x: -xMirrorPos.x, y: xMirrorPos.y })
        } else if (yOfXMirror === xMirrorIdx) {
          updates.set(xMirrorIdx, { x: 0, y: xMirrorPos.y })
        }
      }
    }
  }

  return Array.from(updates.entries()).map(([index, position]) => ({ index, position }))
}

/**
 * Project control points onto the symmetric subspace defined by the mirror maps
 * (orbit averaging, with on-axis points pinned to their axis). Idempotent on
 * already-symmetric configurations — used to keep the oval exactly symmetric
 * after each optimizer step.
 */
export function projectSymmetric(
  cps: Point2D[],
  mirrorMapX: number[] | null,
  mirrorMapY: number[] | null,
): Point2D[] {
  const n = cps.length
  const out = cps.map((p) => ({ x: p.x, y: p.y }))
  for (let i = 0; i < n; i++) {
    let sx = cps[i].x
    let sy = cps[i].y
    let cnt = 1
    const jx = mirrorMapX ? mirrorMapX[i] : -1
    const jy = mirrorMapY ? mirrorMapY[i] : -1
    if (jx >= 0 && jx !== i) {
      sx += cps[jx].x
      sy += -cps[jx].y
      cnt++
    }
    if (jy >= 0 && jy !== i) {
      sx += -cps[jy].x
      sy += cps[jy].y
      cnt++
    }
    if (jx >= 0 && jx !== i && mirrorMapY) {
      const jxy = mirrorMapY[jx]
      if (jxy >= 0 && jxy !== i) {
        sx += -cps[jxy].x
        sy += -cps[jxy].y
        cnt++
      }
    }
    out[i] = { x: sx / cnt, y: sy / cnt }
  }
  if (mirrorMapX) for (let i = 0; i < n; i++) if (mirrorMapX[i] === i) out[i].y = 0
  if (mirrorMapY) for (let i = 0; i < n; i++) if (mirrorMapY[i] === i) out[i].x = 0
  return out
}
