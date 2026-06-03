// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * THIN SLICE — open (clamped) airfoil fit with pinned trailing-edge endpoints.
 *
 * This is the experimental open-curve counterpart of the closed periodic fit
 * (initialFit.ts + footPoint.ts). It exists to measure whether representing an
 * airfoil as an OPEN B-spline from TE-upper around the LE to TE-lower — with
 * both extremities pinned to the trailing edge — fits sharp-TE airfoils more
 * accurately than the closed periodic fit.
 *
 * It deliberately covers ONLY plain least-squares + foot-point reparameterization
 * (no fairness, no curvature-extrema constraints). The point is a fast accuracy
 * delta, not a finished feature.
 *
 * Reuses the existing clamped evaluator (findKnotSpan/basisFunctions/evaluateBSpline)
 * and Cholesky solver. The leading-edge two-pass projection split is copied from
 * the closed footPoint.ts verbatim — it is representation-agnostic.
 */

import { findKnotSpan, basisFunctions, evaluateBSpline } from '../../utils/bspline/core'
import { choleskySolve } from '../../optimizer/linearAlgebra'
import type { Point2D } from '../../types/curve'

/**
 * Clamped (open) uniform knot vector on [0,1] with end multiplicity degree+1.
 * Length = numCPs + degree + 1.
 */
export function uniformClampedKnots(numCPs: number, degree: number): number[] {
  const knots: number[] = []
  const nInterior = numCPs - degree - 1 // interior knots
  for (let i = 0; i <= degree; i++) knots.push(0)
  for (let i = 1; i <= nInterior; i++) knots.push(i / (nInterior + 1))
  for (let i = 0; i <= degree; i++) knots.push(1)
  return knots
}

/**
 * Build the clamped basis matrix B[i][j] = N_j(t_i). Each row sums to 1.
 */
export function buildClampedBasisMatrix(
  t: number[],
  degree: number,
  knots: number[],
  numCPs: number,
): number[][] {
  const m = t.length
  const B: number[][] = []
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(numCPs).fill(0)
    const tv = Math.min(1, Math.max(0, t[i]))
    const span = findKnotSpan(degree, knots, tv)
    const N = basisFunctions(span, tv, degree, knots)
    for (let k = 0; k <= degree; k++) {
      row[span - degree + k] += N[k]
    }
    B.push(row)
  }
  return B
}

export interface OpenFitResult {
  cpX: number[]
  cpY: number[]
  knots: number[]
  degree: number
}

/**
 * Boehm knot insertion for an open (clamped) curve. Inserts the knot value `t`
 * once into both coordinate arrays — shape-preserving (the curve is unchanged),
 * adds one control point. The pinned endpoint control points are untouched for
 * any interior `t`, so the trailing-edge pins survive insertion.
 */
export function insertKnotOpen(
  cpX: number[],
  cpY: number[],
  knots: number[],
  degree: number,
  t: number,
): { cpX: number[]; cpY: number[]; knots: number[] } {
  // Span k: last index with knots[k] <= t.
  let k = 0
  for (let i = 0; i < knots.length - 1; i++) if (knots[i] <= t + 1e-14) k = i
  const newKnots = [...knots.slice(0, k + 1), t, ...knots.slice(k + 1)]

  const insertCoord = (cps: number[]): number[] => {
    const out: number[] = []
    for (let i = 0; i < cps.length + 1; i++) {
      if (i <= k - degree) {
        out.push(cps[i])
      } else if (i >= k + 1) {
        out.push(cps[i - 1])
      } else {
        const denom = knots[i + degree] - knots[i]
        const alpha = Math.abs(denom) > 1e-14 ? (t - knots[i]) / denom : 0
        const left = i > 0 ? cps[i - 1] : 0
        const right = i < cps.length ? cps[i] : 0
        out.push((1 - alpha) * left + alpha * right)
      }
    }
    return out
  }

  return { cpX: insertCoord(cpX), cpY: insertCoord(cpY), knots: newKnots }
}

/**
 * Least-squares fit of an open clamped B-spline with the FIRST and LAST control
 * points pinned to fixed trailing-edge endpoints. Only interior control points
 * are solved.
 *
 * Clamped B-splines interpolate their endpoints (C(0)=P0, C(1)=P_{n-1}), so
 * pinning P0/P_{n-1} pins the curve's two extremities exactly. The known
 * endpoint contribution is moved to the right-hand side, leaving an
 * (n-2)x(n-2) normal-equations solve for the interior CPs.
 */
export function openFitPinned(
  t: number[],
  dataX: number[],
  dataY: number[],
  pinStart: Point2D,
  pinEnd: Point2D,
  numCPs: number,
  degree: number,
): OpenFitResult {
  const knots = uniformClampedKnots(numCPs, degree)
  const B = buildClampedBasisMatrix(t, degree, knots, numCPs)
  const m = t.length
  const last = numCPs - 1
  const nInt = numCPs - 2 // interior unknowns

  // Reduced basis (interior columns only) and endpoint-corrected RHS.
  const Bint: number[][] = []
  const dx = new Array<number>(m)
  const dy = new Array<number>(m)
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(nInt)
    for (let j = 0; j < nInt; j++) row[j] = B[i][j + 1]
    Bint.push(row)
    const kx = B[i][0] * pinStart.x + B[i][last] * pinEnd.x
    const ky = B[i][0] * pinStart.y + B[i][last] * pinEnd.y
    dx[i] = dataX[i] - kx
    dy[i] = dataY[i] - ky
  }

  // Normal equations (B'^T B') P = B'^T d'.
  const BtB: number[][] = []
  for (let i = 0; i < nInt; i++) BtB[i] = new Array<number>(nInt).fill(0)
  for (let i = 0; i < nInt; i++) {
    for (let j = i; j < nInt; j++) {
      let s = 0
      for (let k = 0; k < m; k++) s += Bint[k][i] * Bint[k][j]
      BtB[i][j] = s
      BtB[j][i] = s
    }
  }
  const BtDx = new Array<number>(nInt).fill(0)
  const BtDy = new Array<number>(nInt).fill(0)
  for (let j = 0; j < nInt; j++) {
    let sx = 0, sy = 0
    for (let i = 0; i < m; i++) { sx += Bint[i][j] * dx[i]; sy += Bint[i][j] * dy[i] }
    BtDx[j] = sx; BtDy[j] = sy
  }

  const solX = choleskySolve(BtB, BtDx)
  const solY = choleskySolve(BtB, BtDy)
  if (!solX.success || !solY.success) {
    throw new Error('Cholesky solve failed for open pinned fit — system may be singular')
  }

  const cpX = [pinStart.x, ...solX.x, pinEnd.x]
  const cpY = [pinStart.y, ...solY.x, pinEnd.y]
  return { cpX, cpY, knots, degree }
}

// ---------------------------------------------------------------------------
// Foot-point projection on the open clamped curve (LE split reused verbatim).
// ---------------------------------------------------------------------------

function evalOpenDerivs(
  cps: Point2D[], degree: number, knots: number[], t: number,
): { pos: Point2D; der1: Point2D; der2: Point2D } {
  const h = 1e-6
  const tc = Math.min(1, Math.max(0, t))
  const p0 = evaluateBSpline(cps, degree, knots, Math.max(0, tc - h))
  const p1 = evaluateBSpline(cps, degree, knots, tc)
  const p2 = evaluateBSpline(cps, degree, knots, Math.min(1, tc + h))
  return {
    pos: p1,
    der1: { x: (p2.x - p0.x) / (2 * h), y: (p2.y - p0.y) / (2 * h) },
    der2: { x: (p2.x - 2 * p1.x + p0.x) / (h * h), y: (p2.y - 2 * p1.y + p0.y) / (h * h) },
  }
}

export function projectPointOntoOpenCurve(
  point: Point2D,
  cpX: number[], cpY: number[], degree: number, knots: number[],
  numSamples = 200, tMin = 0, tMax = 1,
): { t: number; dist: number } {
  const cps: Point2D[] = cpX.map((x, i) => ({ x, y: cpY[i] }))
  let bestT = tMin, bestDist = Infinity
  const range = tMax - tMin
  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * range
    const pt = evaluateBSpline(cps, degree, knots, t)
    const d = Math.hypot(pt.x - point.x, pt.y - point.y)
    if (d < bestDist) { bestDist = d; bestT = t }
  }
  let t = bestT
  for (let iter = 0; iter < 20; iter++) {
    const { pos, der1, der2 } = evalOpenDerivs(cps, degree, knots, t)
    const dx = pos.x - point.x, dy = pos.y - point.y
    const fp = 2 * (der1.x * dx + der1.y * dy)
    const fpp = 2 * (der1.x * der1.x + der1.y * der1.y + der2.x * dx + der2.y * dy)
    if (Math.abs(fpp) < 1e-20) break
    const dt = -fp / fpp
    t = Math.max(tMin, Math.min(tMax, t + dt))
    if (Math.abs(dt) < 1e-12) break
  }
  const pt = evaluateBSpline(cps, degree, knots, t)
  return { t, dist: Math.hypot(pt.x - point.x, pt.y - point.y) }
}

export interface OpenFootPointResult {
  hausdorff: number
  rms: number
  projectedT: number[]
}

/**
 * Project every data point onto the open curve, with the LE two-pass split:
 * upper-surface points search [0, t_LE], lower-surface points search [t_LE, 1].
 */
export function computeOpenFootPointMetrics(
  dataX: number[], dataY: number[],
  cpX: number[], cpY: number[], degree: number, knots: number[],
  leIndex: number,
): OpenFootPointResult {
  const m = dataX.length
  const projectedT = new Array<number>(m)
  let maxErr = 0, sumSq = 0

  const leProj = projectPointOntoOpenCurve({ x: dataX[leIndex], y: dataY[leIndex] }, cpX, cpY, degree, knots)
  const tLE = leProj.t
  projectedT[leIndex] = tLE
  maxErr = Math.max(maxErr, leProj.dist); sumSq += leProj.dist ** 2

  for (let i = 0; i < m; i++) {
    if (i === leIndex) continue
    const tMin = i < leIndex ? 0 : tLE
    const tMax = i < leIndex ? tLE : 1
    const proj = projectPointOntoOpenCurve({ x: dataX[i], y: dataY[i] }, cpX, cpY, degree, knots, 200, tMin, tMax)
    projectedT[i] = proj.t
    maxErr = Math.max(maxErr, proj.dist); sumSq += proj.dist ** 2
  }
  return { hausdorff: maxErr, rms: Math.sqrt(sumSq / m), projectedT }
}

export interface OpenContour {
  dataX: number[]
  dataY: number[]
  t: number[]
  leIndex: number
  pinStart: Point2D
  pinEnd: Point2D
}

/**
 * Build the open contour from a parsed (closed) airfoil polygon: drop the
 * appended closure duplicate, chord-length parameterize on the CLOSED interval
 * [0,1] (endpoints included), and identify the LE (min-x) and the pinned TE
 * endpoints (the two extremities of the ordered contour).
 */
export function buildOpenContour(points: Point2D[]): OpenContour {
  // points[] is the closed polygon (last == copy of first); drop the duplicate.
  const c = points.slice(0, -1)
  const n = c.length
  const dataX = c.map(p => p.x)
  const dataY = c.map(p => p.y)

  // CENTRIPETAL parameterization (segment length^0.5). A clamped B-spline with
  // N control points has only N-d knot spans (vs N for a periodic one), so the
  // open fit is coarser per CP. Centripetal spacing concentrates parameter
  // resolution where points bunch up — the high-curvature leading edge and the
  // converging trailing edge — which roughly halves the fit error vs plain
  // chord-length and keeps the curve from bulging across the TE.
  const cum = new Array<number>(n)
  cum[0] = 0
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.sqrt(Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y))
  }
  const total = cum[n - 1]
  const t = cum.map(v => v / total) // t[0]=0, t[n-1]=1

  let leIndex = 0
  for (let i = 1; i < n; i++) if (dataX[i] < dataX[leIndex]) leIndex = i

  return { dataX, dataY, t, leIndex, pinStart: c[0], pinEnd: c[n - 1] }
}

/**
 * Open fit with PDM (alternating fit / foot-point reparameterization). Returns
 * the best (lowest foot-point Hausdorff) iterate's metrics.
 */
export function openFitPDM(
  contour: OpenContour, numCPs: number, degree: number, rounds = 6,
): { hausdorff: number; rms: number; cpX: number[]; cpY: number[]; knots: number[] } {
  const { dataX, dataY, leIndex, pinStart, pinEnd } = contour
  let t = [...contour.t]
  let best: { hausdorff: number; rms: number; cpX: number[]; cpY: number[]; knots: number[] } | null = null
  for (let r = 0; r < rounds; r++) {
    const fit = openFitPinned(t, dataX, dataY, pinStart, pinEnd, numCPs, degree)
    const fp = computeOpenFootPointMetrics(dataX, dataY, fit.cpX, fit.cpY, degree, fit.knots, leIndex)
    if (!best || fp.hausdorff < best.hausdorff) {
      best = { hausdorff: fp.hausdorff, rms: fp.rms, cpX: fit.cpX, cpY: fit.cpY, knots: fit.knots }
    }
    t = fp.projectedT
  }
  return best!
}
