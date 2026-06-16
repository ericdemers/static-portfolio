// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Fit a polynomial PH spline to an ordinary B-spline by **hodograph matching**.
 *
 * The PH constraint lives on the hodograph: r'(t) must be a perfect square w(t)².
 * So given a freehand B-spline C(t), we match its hodograph h(t) = C'(t) (which
 * carries both the stroke's direction *and* speed) with w², then integrate:
 *   r(t) = C(t₀) + ∫ w².
 * Integration is smoothing, so a good hodograph match yields a curve that hugs
 * the stroke — and it is PH by construction, hence automatically C^genDegree at
 * the joins (C² for a quadratic generator).
 *
 * The trick that makes the fit *linear*: minimizing ∫|w² − h|² directly is
 * quartic in w, but taking the pointwise complex square root of the target first
 *   g(t) = √|h(t)| · exp(i·½·arg h(t))   (arg h continuously unwrapped)
 * turns it into an ordinary linear least-squares fit of the complex B-spline w to
 * the samples g — real and imaginary parts solve independently on the same basis.
 *
 * The result is the existing 'polynomial' PH metadata, so the fitted curve plugs
 * straight into the normal polynomial-PH drag/render machinery (and can later
 * carry the curvature-value bound).
 */

import { decomposeToBernstein, derivativeBD } from './algebra'
import { computePHCurveFromUV, type PHCurveResult } from './phCurve'
import { findKnotSpan, basisFunctions } from '../utils/bspline/core'
import { leastSquares, type Matrix } from './linearAlgebra'
import type { Point2D } from '../types/curve'

export interface PHSplineFitOptions {
  /** Generator degree: 2 → quintic PH, C² joins (default). 3 → degree-7, C³. */
  generatorDegree?: number
  /** Samples per stroke span for the √h least-squares fit (default 12). */
  samplesPerSpan?: number
}

/**
 * Fit a polynomial PH spline to an open B-spline `{controlPoints, knots}`.
 * The generator inherits the B-spline's segmentation (one generator span per
 * stroke span, single interior knots → C^(genDegree-1) generator → C^genDegree
 * curve). Returns null if the input is too small or the linear solve fails.
 */
export function fitPHSplineToBSpline(
  controlPoints: Point2D[],
  knots: number[],
  options: PHSplineFitOptions = {},
): PHCurveResult | null {
  const genDegree = options.generatorDegree ?? 2
  const samplesPerSpan = options.samplesPerSpan ?? 12

  if (controlPoints.length < 2) return null

  // 1. Target hodograph h = C' (per coordinate) as Bernstein decompositions.
  const xs = controlPoints.map((p) => p.x)
  const ys = controlPoints.map((p) => p.y)
  const hx = derivativeBD(decomposeToBernstein({ knots, controlPoints: xs }))
  const hy = derivativeBD(decomposeToBernstein({ knots, controlPoints: ys }))

  const breaks = hx.distinctKnots
  const numSpans = breaks.length - 1
  if (numSpans < 1) return null

  // 2. Generator knot vector: degree genDegree, clamped, single interior knots
  //    at the stroke's breakpoints.
  const genKnots: number[] = []
  for (let i = 0; i <= genDegree; i++) genKnots.push(breaks[0])
  for (let i = 1; i < numSpans; i++) genKnots.push(breaks[i])
  for (let i = 0; i <= genDegree; i++) genKnots.push(breaks[numSpans])
  const numGenCPs = genKnots.length - genDegree - 1 // = numSpans + genDegree

  // 3. Sample g = √h with a continuously unwrapped angle (the half-angle √).
  //    w and −w both square to h, so the sign is free; unwrapping the *full*
  //    angle keeps the half-angle (and hence w) continuous along the stroke.
  const tHi = breaks[numSpans]
  const ts: number[] = []
  const reTarget: number[] = []
  const imTarget: number[] = []
  let prevAngle = 0
  let started = false
  for (let s = 0; s < numSpans; s++) {
    const a = breaks[s]
    const b = breaks[s + 1]
    for (let k = 0; k < samplesPerSpan; k++) {
      const t = a + ((k + 0.5) / samplesPerSpan) * (b - a)
      const re = hx.evaluate(t)
      const im = hy.evaluate(t)
      const mag = Math.hypot(re, im)
      let angle: number
      if (mag < 1e-9) {
        angle = prevAngle // direction undefined (near-zero speed) — hold previous
      } else {
        angle = Math.atan2(im, re)
        if (started) {
          while (angle - prevAngle > Math.PI) angle -= 2 * Math.PI
          while (angle - prevAngle < -Math.PI) angle += 2 * Math.PI
        }
      }
      prevAngle = angle
      started = true
      const r = Math.sqrt(mag)
      const half = angle / 2
      ts.push(t)
      reTarget.push(r * Math.cos(half))
      imTarget.push(r * Math.sin(half))
    }
  }

  // 4. Linear least-squares fit of the complex generator w = u + iv to √h.
  const A: Matrix = []
  for (const t of ts) {
    const tc = Math.min(t, tHi - 1e-9)
    const span = findKnotSpan(genDegree, genKnots, tc)
    const N = basisFunctions(span, tc, genDegree, genKnots)
    const row = new Array(numGenCPs).fill(0)
    for (let j = 0; j <= genDegree; j++) row[span - genDegree + j] = N[j]
    A.push(row)
  }
  const solU = leastSquares(A, reTarget)
  const solV = leastSquares(A, imTarget)
  if (!solU.success || !solV.success) return null

  // 5. Integrate w² from the stroke's start point → the PH spline.
  return computePHCurveFromUV(
    solU.x, solV.x, genKnots, genDegree, controlPoints[0].x, controlPoints[0].y,
  )
}
