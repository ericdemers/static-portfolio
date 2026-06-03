// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Foot-point projection: find the closest point on a periodic B-spline
 * for each data point, yielding reparameterized parameter values.
 *
 * This implements Point Distance Minimization (PDM): after fitting CPs
 * with fixed parameters, project every data point onto the curve to get
 * updated parameters, then re-solve. Alternating fit/project converges
 * much better than fixed chord-length parameterization, especially at
 * low control-point counts.
 */

import { evaluatePeriodicBSpline } from '../../utils/bspline/core'
import type { Point2D } from '../../types/curve'

/**
 * Evaluate curve position and first/second derivatives via finite differences.
 * Uses central differences with step h = 1e-6.
 */
function evaluateBSplineDerivatives(
  cps: Point2D[], degree: number, knots: number[], t: number,
): { pos: Point2D; der1: Point2D; der2: Point2D } {
  const h = 1e-6
  const p0 = evaluatePeriodicBSpline(cps, degree, knots, ((t - h) % 1 + 1) % 1)
  const p1 = evaluatePeriodicBSpline(cps, degree, knots, ((t) % 1 + 1) % 1)
  const p2 = evaluatePeriodicBSpline(cps, degree, knots, ((t + h) % 1 + 1) % 1)
  return {
    pos: p1,
    der1: { x: (p2.x - p0.x) / (2 * h), y: (p2.y - p0.y) / (2 * h) },
    der2: { x: (p2.x - 2 * p1.x + p0.x) / (h * h), y: (p2.y - 2 * p1.y + p0.y) / (h * h) },
  }
}

/**
 * Project a single point onto a periodic B-spline curve.
 *
 * Phase 1: Dense sampling (numSamples points) to find initial guess.
 * Phase 2: Newton refinement on f(t) = ||C(t) - D||² until convergence.
 *
 * @returns Closest parameter t, distance, and curve point
 */
export function projectPointOntoCurve(
  point: Point2D,
  cpX: number[],
  cpY: number[],
  degree: number,
  knots: number[],
  numSamples: number = 200,
  tMin: number = 0,
  tMax: number = 1,
): { t: number; dist: number; pos: Point2D } {
  const cps: Point2D[] = cpX.map((x, i) => ({ x, y: cpY[i] }))

  // Phase 1: Dense sampling within [tMin, tMax] to find initial guess
  let bestT = tMin, bestDist = Infinity
  const range = tMax - tMin
  for (let i = 0; i < numSamples; i++) {
    const t = tMin + (i / numSamples) * range
    const pt = evaluatePeriodicBSpline(cps, degree, knots, ((t) % 1 + 1) % 1)
    const dist = Math.sqrt((pt.x - point.x) ** 2 + (pt.y - point.y) ** 2)
    if (dist < bestDist) { bestDist = dist; bestT = t }
  }

  // Phase 2: Newton refinement on f(t) = ||C(t) - D||²
  // f'(t) = 2 * C'(t) · (C(t) - D)
  // f''(t) = 2 * (||C'(t)||² + C''(t) · (C(t) - D))
  let t = bestT
  for (let iter = 0; iter < 20; iter++) {
    const { pos, der1, der2 } = evaluateBSplineDerivatives(cps, degree, knots, t)
    const dx = pos.x - point.x, dy = pos.y - point.y
    const fp = 2 * (der1.x * dx + der1.y * dy)
    const fpp = 2 * (der1.x * der1.x + der1.y * der1.y + der2.x * dx + der2.y * dy)
    if (Math.abs(fpp) < 1e-20) break
    const dt = -fp / fpp
    t = Math.max(tMin, Math.min(tMax, t + dt)) // clamp to [tMin, tMax]
    if (Math.abs(dt) < 1e-12) break
  }

  const finalPt = evaluatePeriodicBSpline(cps, degree, knots, ((t) % 1 + 1) % 1)
  const finalDist = Math.sqrt((finalPt.x - point.x) ** 2 + (finalPt.y - point.y) ** 2)
  return { t, dist: finalDist, pos: finalPt }
}

export interface FootPointResult {
  /** True (foot-point) Hausdorff distance */
  hausdorff: number
  /** True RMS distance */
  rms: number
  /** Reparameterized parameter values, one per data point */
  projectedT: number[]
  /** Per-point distances */
  errors: number[]
  /** Index of the worst-error data point */
  worstIdx: number
}

/**
 * Compute true Hausdorff distance by projecting every data point onto the curve.
 * Returns updated parameter values (foot-point reparameterization).
 */
export function computeFootPointMetrics(
  dataX: number[],
  dataY: number[],
  cpX: number[],
  cpY: number[],
  degree: number,
  knots: number[],
  leIndex?: number,
): FootPointResult {
  const m = dataX.length
  const projectedT = new Array<number>(m)
  const errors = new Array<number>(m)
  let maxErr = 0, worstIdx = 0
  let sumSq = 0

  if (leIndex !== undefined && leIndex >= 0 && leIndex < m) {
    // Two-pass scheme: first project LE point unconstrained to get t_LE
    const leProj = projectPointOntoCurve(
      { x: dataX[leIndex], y: dataY[leIndex] }, cpX, cpY, degree, knots
    )
    const tLE = leProj.t
    projectedT[leIndex] = tLE
    errors[leIndex] = leProj.dist
    sumSq += leProj.dist * leProj.dist
    if (leProj.dist > maxErr) { maxErr = leProj.dist; worstIdx = leIndex }

    // Extrados points (indices 0..leIndex-1): search [0, t_LE]
    for (let i = 0; i < leIndex; i++) {
      const proj = projectPointOntoCurve(
        { x: dataX[i], y: dataY[i] }, cpX, cpY, degree, knots, 200, 0, tLE
      )
      projectedT[i] = proj.t
      errors[i] = proj.dist
      sumSq += proj.dist * proj.dist
      if (proj.dist > maxErr) { maxErr = proj.dist; worstIdx = i }
    }

    // Intrados points (indices leIndex+1..end): search [t_LE, 1)
    for (let i = leIndex + 1; i < m; i++) {
      const proj = projectPointOntoCurve(
        { x: dataX[i], y: dataY[i] }, cpX, cpY, degree, knots, 200, tLE, 1
      )
      projectedT[i] = proj.t
      errors[i] = proj.dist
      sumSq += proj.dist * proj.dist
      if (proj.dist > maxErr) { maxErr = proj.dist; worstIdx = i }
    }
  } else {
    // Unconstrained: search entire curve
    for (let i = 0; i < m; i++) {
      const proj = projectPointOntoCurve(
        { x: dataX[i], y: dataY[i] }, cpX, cpY, degree, knots
      )
      projectedT[i] = proj.t
      errors[i] = proj.dist
      sumSq += proj.dist * proj.dist
      if (proj.dist > maxErr) { maxErr = proj.dist; worstIdx = i }
    }
  }

  return {
    hausdorff: maxErr,
    rms: Math.sqrt(sumSq / m),
    projectedT,
    errors,
    worstIdx,
  }
}
