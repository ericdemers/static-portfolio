// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Fit a CLOSED polynomial PH spline to a closed (periodic) B-spline stroke, by
 * the same hodograph-matching idea as the open case (see phSplineFit.ts) plus
 * the two extra conditions a closed PH curve needs:
 *
 *   1. SMOOTH SEAM — the generator must wrap continuously. For a closed loop the
 *      tangent turns by 2π·k (turning number k), so w = √(w²) picks up e^{iπk}:
 *      w(1) = s·w(0) with s = (−1)^k (anti-periodic for a simple loop, k odd).
 *      Either way w² is periodic, so the curve is smooth. For a uniform clamped
 *      QUADRATIC generator, C¹ wrap (⇒ C² curve at the seam) is two linear
 *      conditions on the boundary control points:
 *          c_{n-1} = s·c_0,     c_{n-2} = s·(2 c_0 − c_1).
 *      Baking these in leaves the interior control points free for a plain
 *      linear least-squares fit to √h.
 *
 *   2. CLOSURE — a periodic generator does NOT close the curve on its own;
 *      r(1) − r(0) = ∮ w² must vanish (two real, nonlinear conditions). The √h
 *      fit of a closed stroke already nearly closes (∮ h = 0), so a short
 *      Newton projection on the gap r(1)−r(0) finishes the job. The gap and its
 *      Jacobian come for free: gap = lastCP − firstCP, ∂gap/∂generator from
 *      phControlPointJacobian.
 *
 * Result: a clamped degree-5 B-spline marked closed (evaluated on [0,1], drawn
 * with a closing segment), C² at the seam and interior, carrying 'polynomial' PH
 * metadata for later editing.
 */

import { computePHCurveFromUV, type PHCurveResult, type PHMetadata } from './phCurve'
import { phControlPointJacobian } from './phCurveAnalytic'
import { findKnotSpan, basisFunctions } from '../utils/bspline/core'
import { evaluatePeriodicBSpline } from '../utils/bspline/core'
import { leastSquares, type Matrix } from './linearAlgebra'
import type { Point2D } from '../types/curve'

export interface ClosedPHSplineFitOptions {
  /** Generator segments around the loop (defaults to the stroke's CP count). */
  segments?: number
  /** Samples per generator segment for the √h fit (default 8). */
  samplesPerSegment?: number
}

/**
 * Fit a closed polynomial PH spline to a closed periodic B-spline stroke.
 * Returns a clamped, closed PHCurveResult, or null if the input is too small.
 */
export function fitClosedPHSpline(
  strokeCPs: Point2D[],
  strokeDegree: number,
  strokeKnots: number[],
  options: ClosedPHSplineFitOptions = {},
): PHCurveResult | null {
  if (strokeCPs.length < 3) return null
  const genDegree = 2
  const m = Math.max(4, options.segments ?? strokeCPs.length) // generator segments
  const n = m + genDegree // generator control points (clamped quadratic)
  const samples = Math.max(8 * m, options.samplesPerSegment ? options.samplesPerSegment * m : 8 * m)

  // Periodic hodograph h(t) = C'(t) by central differences (the stroke wraps).
  const evalStroke = (t: number) => evaluatePeriodicBSpline(strokeCPs, strokeDegree, strokeKnots, t)
  const eps = 1e-4
  const hAt = (t: number): { re: number; im: number } => {
    const a = evalStroke(t - eps), b = evalStroke(t + eps)
    return { re: (b.x - a.x) / (2 * eps), im: (b.y - a.y) / (2 * eps) }
  }

  // Turning number parity → wrap sign s. Sum signed angle steps of h around the
  // full loop (including the wrap back to the start).
  const NS = samples
  let winding = 0
  const h0 = hAt(0)
  let prevAng = Math.atan2(h0.im, h0.re)
  for (let k = 1; k <= NS; k++) {
    const t = k / NS // includes t = 1 (== h(0)) to close the loop
    const h = hAt(t % 1)
    const ang = Math.atan2(h.im, h.re)
    let d = ang - prevAng
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    winding += d
    prevAng += d
  }
  const k = Math.round(winding / (2 * Math.PI))
  const s = (k % 2 === 0) ? 1 : -1

  // √h samples with a continuously unwrapped half-angle (the sign is then
  // consistent with the wrap substitution below).
  const ts: number[] = [], gRe: number[] = [], gIm: number[] = []
  {
    let ang = Math.atan2(hAt(0).im, hAt(0).re)
    let prevA = ang
    for (let i = 0; i < NS; i++) {
      const t = (i + 0.5) / NS
      const h = hAt(t)
      const a = Math.atan2(h.im, h.re)
      let d = a - prevA
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      ang += d; prevA = a
      const half = ang / 2
      const r = Math.sqrt(Math.hypot(h.re, h.im))
      ts.push(t); gRe.push(r * Math.cos(half)); gIm.push(r * Math.sin(half))
    }
  }

  // Uniform clamped quadratic knot vector over [0,1] with m segments.
  const uvKnots: number[] = []
  for (let i = 0; i <= genDegree; i++) uvKnots.push(0)
  for (let i = 1; i < m; i++) uvKnots.push(i / m)
  for (let i = 0; i <= genDegree; i++) uvKnots.push(1)

  // Wrap substitution: full control points c (length n) from K = n−2 free ones,
  //   c_i = f_i (i < n−2),  c_{n-2} = s(2 f_0 − f_1),  c_{n-1} = s f_0.
  const K = n - 2
  const expand = (f: number[]): number[] => {
    const c = f.slice(0, K)
    c.push(s * (2 * f[0] - f[1])) // c_{n-2}
    c.push(s * f[0]) // c_{n-1}
    return c
  }

  // Basis matrix B (samples × n) then M = B·S (samples × K) via the substitution.
  const tHi = 1 - 1e-9
  const M: Matrix = []
  for (const t of ts) {
    const tc = Math.min(t, tHi)
    const span = findKnotSpan(genDegree, uvKnots, tc)
    const N = basisFunctions(span, tc, genDegree, uvKnots)
    const bRow = new Array(n).fill(0)
    for (let j = 0; j <= genDegree; j++) bRow[span - genDegree + j] = N[j]
    // Fold the substitution: contributions of c_{n-2}, c_{n-1} land on f_0, f_1.
    const row = new Array(K).fill(0)
    for (let i = 0; i < K; i++) row[i] = bRow[i]
    row[0] += bRow[n - 2] * s * 2 + bRow[n - 1] * s
    row[1] += bRow[n - 2] * s * -1
    M.push(row)
  }

  const solU = leastSquares(M, gRe)
  const solV = leastSquares(M, gIm)
  if (!solU.success || !solV.success) return null
  const uFree = solU.x, vFree = solV.x

  // Origin = the loop's start point, so the curve passes through it.
  const o = evalStroke(0)

  // Newton projection to close the gap r(1) − r(0) = ∮ w².
  const buildCurve = () => computePHCurveFromUV(expand(uFree), expand(vFree), uvKnots, genDegree, o.x, o.y)
  let curve = buildCurve()
  for (let iter = 0; iter < 8; iter++) {
    const cps = curve.controlPoints
    const last = cps.length - 1
    const gapX = cps[last].x - cps[0].x, gapY = cps[last].y - cps[0].y
    if (Math.hypot(gapX, gapY) < 1e-7) break

    // Jacobian of the gap w.r.t. the free variables [uFree, vFree] (2 × 2K).
    const jac = phControlPointJacobian(expand(uFree), expand(vFree), uvKnots, genDegree)
    // jac index: 0,1 = x0,y0; 2+i = u_i; 2+n+i = v_i. d(gap)/d(c_i) = jac[...].(last − 0).
    const dGapU = (i: number) => ({ x: jac[2 + i].dx[last] - jac[2 + i].dx[0], y: jac[2 + i].dy[last] - jac[2 + i].dy[0] })
    const dGapV = (i: number) => ({ x: jac[2 + n + i].dx[last] - jac[2 + n + i].dx[0], y: jac[2 + n + i].dy[last] - jac[2 + n + i].dy[0] })
    // Chain through the substitution c = S f (same fold as the basis matrix).
    const Jx = new Array(2 * K).fill(0), Jy = new Array(2 * K).fill(0)
    const accU: { x: number; y: number }[] = []
    const accV: { x: number; y: number }[] = []
    for (let i = 0; i < n; i++) { accU.push(dGapU(i)); accV.push(dGapV(i)) }
    for (let i = 0; i < K; i++) { Jx[i] = accU[i].x; Jy[i] = accU[i].y; Jx[K + i] = accV[i].x; Jy[K + i] = accV[i].y }
    // c_{n-2}, c_{n-1} contributions onto f_0, f_1:
    Jx[0] += accU[n - 2].x * s * 2 + accU[n - 1].x * s; Jy[0] += accU[n - 2].y * s * 2 + accU[n - 1].y * s
    Jx[1] += accU[n - 2].x * s * -1; Jy[1] += accU[n - 2].y * s * -1
    Jx[K + 0] += accV[n - 2].x * s * 2 + accV[n - 1].x * s; Jy[K + 0] += accV[n - 2].y * s * 2 + accV[n - 1].y * s
    Jx[K + 1] += accV[n - 2].x * s * -1; Jy[K + 1] += accV[n - 2].y * s * -1

    // Least-norm step Δf = −Jᵀ (J Jᵀ)⁻¹ gap, with J = [Jx; Jy] (2 × 2K).
    const a = Jx.reduce((s2, v) => s2 + v * v, 0), b = Jx.reduce((s2, v, idx) => s2 + v * Jy[idx], 0), c2 = Jy.reduce((s2, v) => s2 + v * v, 0)
    const det = a * c2 - b * b
    if (Math.abs(det) < 1e-20) break
    // (J Jᵀ)⁻¹ gap
    const l0 = (c2 * gapX - b * gapY) / det, l1 = (-b * gapX + a * gapY) / det
    for (let j = 0; j < 2 * K; j++) {
      const step = -(Jx[j] * l0 + Jy[j] * l1)
      if (j < K) uFree[j] += step; else vFree[j - K] += step
    }
    curve = buildCurve()
  }

  // Snap the last control point exactly onto the first for a watertight loop.
  const cps = curve.controlPoints
  cps[cps.length - 1] = { x: cps[0].x, y: cps[0].y }

  return {
    controlPoints: cps,
    knots: curve.knots,
    degree: curve.degree,
    metadata: { ...curve.metadata, closed: true, wrapSign: s },
  }
}

/**
 * Close an EXISTING open polynomial PH spline at C⁰ — preserving its shape and
 * the corner where the two ends meet. The endpoint drag has already brought the
 * last point onto the first, so r(1)−r(0) = ∮w² is already small; a short
 * least-norm Newton projection (moving the generator control points, origin
 * held) drives it to zero. No wrap constraint is imposed, so the seam stays C⁰
 * (a corner) — the "smooth seam" step raises continuity later.
 */
export function closeOpenPHSpline(meta: PHMetadata): PHCurveResult | null {
  const u = [...meta.uControlPoints]
  const v = [...meta.vControlPoints]
  const knots = meta.uvKnots, p = meta.uvDegree, ox = meta.origin.x, oy = meta.origin.y
  const n = u.length
  if (n < 3) return null

  const dot = (a: number[], b: number[]) => a.reduce((s, v2, i) => s + v2 * b[i], 0)
  const build = () => computePHCurveFromUV(u, v, knots, p, ox, oy)
  let curve = build()
  for (let iter = 0; iter < 10; iter++) {
    const cps = curve.controlPoints
    const last = cps.length - 1
    const gapX = cps[last].x - cps[0].x, gapY = cps[last].y - cps[0].y
    if (Math.hypot(gapX, gapY) < 1e-7) break
    const jac = phControlPointJacobian(u, v, knots, p)
    // Variables: u_i = jac[2+i], v_i = jac[2+n+i]; gap rows only (origin held).
    const Jx = new Array(2 * n).fill(0), Jy = new Array(2 * n).fill(0)
    for (let i = 0; i < n; i++) {
      Jx[i] = jac[2 + i].dx[last] - jac[2 + i].dx[0]
      Jy[i] = jac[2 + i].dy[last] - jac[2 + i].dy[0]
      Jx[n + i] = jac[2 + n + i].dx[last] - jac[2 + n + i].dx[0]
      Jy[n + i] = jac[2 + n + i].dy[last] - jac[2 + n + i].dy[0]
    }
    const a = dot(Jx, Jx), b = dot(Jx, Jy), c2 = dot(Jy, Jy)
    const det = a * c2 - b * b
    if (Math.abs(det) < 1e-20) break
    const l0 = (c2 * gapX - b * gapY) / det, l1 = (-b * gapX + a * gapY) / det
    for (let j = 0; j < 2 * n; j++) {
      const step = -(Jx[j] * l0 + Jy[j] * l1)
      if (j < n) u[j] += step; else v[j - n] += step
    }
    curve = build()
  }
  const cps = curve.controlPoints
  cps[cps.length - 1] = { x: cps[0].x, y: cps[0].y }
  // Wrap sign from the generator end tangents (√ of the curve's end tangents).
  const s = u[0] * u[n - 1] + v[0] * v[n - 1] < 0 ? -1 : 1
  return {
    controlPoints: cps,
    knots: curve.knots,
    degree: curve.degree,
    metadata: { ...curve.metadata, closed: true, wrapSign: s },
  }
}
