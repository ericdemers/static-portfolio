// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * 3D B-spline curve evaluation utilities.
 * Reuses findKnotSpan and basisFunctions from bspline/core.ts.
 */

import { findKnotSpan, basisFunctions } from './bspline/core'
import { groupKnotMultiplicities } from './bspline'
import type { Point3D, Curve3D } from '../types/curve'
import type { Curve } from '../types/curve'

/**
 * Evaluate a 3D B-spline curve at parameter t.
 */
export function evaluateCurve3D(
  controlPoints: Point3D[],
  knots: number[],
  degree: number,
  t: number
): Point3D {
  const span = findKnotSpan(degree, knots, t)
  const N = basisFunctions(span, t, degree, knots)

  let x = 0, y = 0, z = 0
  for (let i = 0; i <= degree; i++) {
    const cp = controlPoints[span - degree + i]
    x += N[i] * cp.x
    y += N[i] * cp.y
    z += N[i] * cp.z
  }

  return { x, y, z }
}

/**
 * Evaluate a 3D B-spline curve at evenly spaced parameter values.
 * Returns an array of points for rendering.
 */
export function evaluateCurve3DRange(
  controlPoints: Point3D[],
  knots: number[],
  degree: number,
  numSamples: number = 200
): Point3D[] {
  const tMin = knots[degree]
  const tMax = knots[knots.length - degree - 1]
  const points: Point3D[] = []

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * (tMax - tMin)
    points.push(evaluateCurve3D(controlPoints, knots, degree, t))
  }

  return points
}

/**
 * Evaluate the blossom (polar form) of a 3D B-spline at arbitrary arguments.
 */
function blossomEval3D(
  controlPoints: Point3D[],
  knots: number[],
  degree: number,
  args: number[]
): Point3D {
  if (args.length !== degree) {
    throw new Error(`blossomEval3D: expected ${degree} arguments, got ${args.length}`)
  }

  if (degree === 0) {
    return { ...controlPoints[0] }
  }

  const u1 = args[0]
  const k = findKnotSpan(degree, knots, u1)

  const d: Point3D[] = []
  for (let j = 0; j <= degree; j++) {
    const idx = k - degree + j
    if (idx >= 0 && idx < controlPoints.length) {
      d.push({ ...controlPoints[idx] })
    } else {
      d.push({ ...controlPoints[Math.max(0, Math.min(idx, controlPoints.length - 1))] })
    }
  }

  for (let r = 1; r <= degree; r++) {
    const u = args[r - 1]

    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const ti = knots[i]
      const ti_end = knots[k + 1 - r + j]
      const denom = ti_end - ti

      let alpha: number
      if (Math.abs(denom) < 1e-14) {
        alpha = 0.5
      } else {
        alpha = (u - ti) / denom
      }

      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
        z: (1 - alpha) * d[j - 1].z + alpha * d[j].z,
      }
    }
  }

  return d[degree]
}

/**
 * Elevate the degree of a 3D B-spline curve by 1.
 */
export function elevateDegreeBy1BSpline3D(
  controlPoints: Point3D[],
  knots: number[],
  degree: number
): { controlPoints: Point3D[]; knots: number[] } {
  const p = degree

  const knotGroups = groupKnotMultiplicities(knots)

  const elevatedKnots: number[] = []
  for (const [value, mult] of knotGroups) {
    for (let i = 0; i < mult + 1; i++) {
      elevatedKnots.push(value)
    }
  }

  const newN = elevatedKnots.length - (p + 1) - 1
  const newCPs: Point3D[] = []

  for (let j = 0; j < newN; j++) {
    const args: number[] = []
    for (let i = 0; i <= p; i++) {
      args.push(elevatedKnots[j + 1 + i])
    }

    let sumX = 0
    let sumY = 0
    let sumZ = 0

    for (let k = 0; k <= p; k++) {
      const reducedArgs = [...args.slice(0, k), ...args.slice(k + 1)]
      const blossomVal = blossomEval3D(controlPoints, knots, p, reducedArgs)
      sumX += blossomVal.x
      sumY += blossomVal.y
      sumZ += blossomVal.z
    }

    newCPs.push({
      x: sumX / (p + 1),
      y: sumY / (p + 1),
      z: sumZ / (p + 1),
    })
  }

  return { controlPoints: newCPs, knots: elevatedKnots }
}

let _nextCurveId = 1

/**
 * Convert 2D sketcher curves to 3D curves on the y=0 plane.
 * Only handles bspline curves (not rational or complex-rational).
 */
export function convertSketchCurvesTo3D(curves2D: Curve[]): Curve3D[] {
  return curves2D
    .filter((c) => c.kind === 'bspline')
    .map((c) => ({
      id: `sketch-${_nextCurveId++}-${Date.now()}`,
      controlPoints: c.controlPoints.map((p) => ({
        x: p.x / 500,
        y: 0,
        z: p.y / 500,
      })),
      knots: [...c.knots],
      degree: c.degree,
      closed: c.closed,
    }))
}
