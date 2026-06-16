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
import { findKnotSpan, basisFunctions, evaluateBSpline, findPeriodicKnotSpan, periodicBasisFunctions } from '../utils/bspline/core'
import { evaluatePeriodicBSpline } from '../utils/bspline/core'
import { leastSquares, type Matrix } from './linearAlgebra'
import type { Point2D } from '../types/curve'

/**
 * Re-express an exact clamped closed PH curve in the PERIODIC representation
 * (closed, knots in [0,1) with a real seam junction), so it behaves like every
 * other closed B-spline — movable junction knots and all. The clamped curve
 * already lives in the periodic spline space (same interior breakpoints, the
 * seam differs only in representation), so a linear least-squares fit on the
 * periodic basis recovers it essentially exactly; this avoids fragile
 * clamped→periodic knot surgery.
 *
 * seamContinuity c sets the seam-junction multiplicity = degree − c (C⁰→5,
 * C¹→4, C²→3). Interior joins keep multiplicity 3 (C², from single generator
 * knots).
 */
export function buildPeriodicPHCurve(
  clampedCPs: Point2D[],
  clampedKnots: number[],
  seamContinuity: number,
): { controlPoints: Point2D[]; knots: number[]; degree: number } {
  const degree = 5
  // Distinct interior breakpoints (joins) in (0,1) WITH the curve's own knot
  // multiplicity there (already genMult + 2 from the clamped recomposition). We
  // copy it through — capped at degree — so a collided generator knot (curve C¹,
  // mult 4) keeps its mult-4 join instead of being forced to a smooth mult-3 one.
  const interior: { v: number; mult: number }[] = []
  for (const k of clampedKnots) {
    if (k > 1e-9 && k < 1 - 1e-9) {
      const e = interior.find((x) => Math.abs(x.v - k) < 1e-9)
      if (e) e.mult++; else interior.push({ v: k, mult: 1 })
    }
  }
  interior.sort((a, b) => a.v - b.v)

  // Periodic knot vector (length n = #control points): the seam at 0 carries
  // degree − seamContinuity knots; each interior join keeps its own multiplicity.
  const seamMult = degree - seamContinuity
  const Kp: number[] = []
  for (let r = 0; r < seamMult; r++) Kp.push(0)
  for (const b of interior) { const cm = Math.min(degree, b.mult); for (let r = 0; r < cm; r++) Kp.push(b.v) }
  const n = Kp.length

  // Sample the exact clamped curve over [0,1) and least-squares fit the periodic
  // control points (the periodic basis encodes the wrap).
  const lo = clampedKnots[degree], hi = clampedKnots[clampedKnots.length - degree - 1]
  const m = Math.max(4 * n, 240)
  const A: Matrix = []
  const bx: number[] = [], by: number[] = []
  for (let i = 0; i < m; i++) {
    const tt = i / m
    const p = evaluateBSpline(clampedCPs, degree, clampedKnots, Math.min(lo + tt * (hi - lo), hi - 1e-9))
    const span = findPeriodicKnotSpan(degree, Kp, tt)
    const N = periodicBasisFunctions(span, tt, degree, Kp)
    const row = new Array(n).fill(0)
    for (let j = 0; j <= degree; j++) {
      const idx = (((span - degree + j) % n) + n) % n
      row[idx] += N[j]
    }
    A.push(row); bx.push(p.x); by.push(p.y)
  }
  const sx = leastSquares(A, bx), sy = leastSquares(A, by)
  const controlPoints = sx.x.map((x, i) => ({ x, y: sy.x[i] }))
  return { controlPoints, knots: Kp, degree }
}

/** Closed PH generator degree (a quadratic generator ⇒ a quintic curve). */
export const GEN_DEGREE = 2

/**
 * Reconstruct the generator's PERIODIC knot vector (knots in [0,1)) from the
 * clamped chart + seam continuity. This is the representation in which the seam
 * is an ORDINARY knot: it sits at value 0 with multiplicity
 *   μ_seam = (degree+1) − seamContinuity   (C⁰→3, C¹→2, C²→1),
 * and the interior generator knots keep their value & multiplicity. The clamped
 * storage and this periodic view describe the same closed generator — this is
 * just the chart in which knot editing is natural.
 */
export function periodicGenKnots(clampedKnots: number[], seamContinuity: number): number[] {
  const muSeam = (GEN_DEGREE + 1) - Math.max(0, Math.min(GEN_DEGREE, seamContinuity))
  const interior = clampedKnots.filter((k) => k > 1e-9 && k < 1 - 1e-9)
  const out: number[] = []
  for (let i = 0; i < muSeam; i++) out.push(0)
  out.push(...interior)
  out.sort((a, b) => a - b)
  return out
}

/**
 * Inverse of {@link periodicGenKnots}: derive the clamped chart (genKnots) and
 * seam continuity from a periodic generator knot vector. μ_seam = number of
 * knots at the seam value 0 ⇒ seamContinuity = (degree+1) − μ_seam; the interior
 * knots become the clamped interior (boundary always clamped to degree+1).
 */
export function clampedFromPeriodicGenKnots(periodic: number[]): { genKnots: number[]; seamContinuity: number } {
  const muSeam = periodic.filter((k) => Math.abs(k) < 1e-9).length
  const interior = periodic.filter((k) => k > 1e-9 && k < 1 - 1e-9).sort((a, b) => a - b)
  const seamContinuity = Math.max(0, Math.min(GEN_DEGREE, (GEN_DEGREE + 1) - muSeam))
  const genKnots: number[] = []
  for (let i = 0; i <= GEN_DEGREE; i++) genKnots.push(0)
  genKnots.push(...interior)
  for (let i = 0; i <= GEN_DEGREE; i++) genKnots.push(1)
  return { genKnots, seamContinuity }
}

export interface ClosedPHSplineFitOptions {
  /** Generator segments around the loop (defaults to the stroke's CP count). */
  segments?: number
  /** Samples per generator segment for the √h fit (default 8). */
  samplesPerSegment?: number
  /** Seam continuity of the resulting curve: 0 = C⁰ corner, 1 = G¹, 2 = G²
   *  (default 2). It equals the number of generator wrap-derivative matches. */
  seamContinuity?: number
  /** Explicit clamped generator knot vector (overrides `segments`). Used by knot
   *  moving, which preserves the moved — possibly non-uniform — knots. */
  genKnots?: number[]
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
  // Generator segments m: from a custom knot vector if given (knot moving keeps
  // the moved, possibly non-uniform knots), else uniform from the segment count.
  const customKnots = options.genKnots
  const m = customKnots ? customKnots.length - 2 * genDegree - 1 : Math.max(4, options.segments ?? strokeCPs.length)
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

  // Clamped quadratic knot vector over [0,1]: the custom one (knot moving) or
  // uniform with m segments.
  let uvKnots: number[]
  if (customKnots) {
    uvKnots = [...customKnots]
  } else {
    uvKnots = []
    for (let i = 0; i <= genDegree; i++) uvKnots.push(0)
    for (let i = 1; i < m; i++) uvKnots.push(i / m)
    for (let i = 0; i <= genDegree; i++) uvKnots.push(1)
  }

  // Wrap substitution by seam continuity (= number of wrap-derivative matches):
  //   nWrap=0 (C⁰): no constraints, all n control points free.
  //   nWrap=1 (C¹): c_{n-1} = s·c_0           (w continuous across the seam).
  //   nWrap=2 (C²): c_{n-1} = s·c_0,  c_{n-2} = s·(2 c_0 − c_1)  (w, w′).
  // Folding `c_{n-1}`/`c_{n-2}` back onto the free f_0/f_1 keeps the fit linear.
  const nWrap = Math.max(0, Math.min(2, options.seamContinuity ?? 2))
  const K = n - nWrap
  // C² derivative match across the seam: w'(1)=s·w'(0). For a clamped quadratic
  // that is c_{n-2} = s·c_0 − s·ratio·(c_1−c_0), ratio = h_last/h_first (the end
  // knot intervals); ratio=1 for uniform knots. So c_{n-2} = s((1+r)f_0 − r f_1).
  const hFirst = uvKnots[genDegree + 1] - uvKnots[genDegree]
  const hLast = uvKnots[n] - uvKnots[n - 1]
  const ratio = hFirst > 1e-12 ? hLast / hFirst : 1
  const expand = (f: number[]): number[] => {
    const c = f.slice(0, K)
    if (nWrap >= 2) c.push(s * ((1 + ratio) * f[0] - ratio * f[1])) // c_{n-2}
    if (nWrap >= 1) c.push(s * f[0]) // c_{n-1}
    return c
  }
  // Fold the constrained boundary control points onto a row over the K free vars.
  const foldRow = (bRow: number[]): number[] => {
    const row = new Array(K).fill(0)
    for (let i = 0; i < K; i++) row[i] = bRow[i]
    if (nWrap >= 1) row[0] += bRow[n - 1] * s
    if (nWrap >= 2) { row[0] += bRow[n - 2] * s * (1 + ratio); row[1] += bRow[n - 2] * s * (-ratio) }
    return row
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
    M.push(foldRow(bRow))
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
    // d(gap)/d(c_i) over all n control points, then fold through c = S·f (same
    // substitution as the basis matrix, so foldRow does the chain rule).
    const jac = phControlPointJacobian(expand(uFree), expand(vFree), uvKnots, genDegree)
    const dGapUx: number[] = [], dGapUy: number[] = [], dGapVx: number[] = [], dGapVy: number[] = []
    for (let i = 0; i < n; i++) {
      dGapUx.push(jac[2 + i].dx[last] - jac[2 + i].dx[0])
      dGapUy.push(jac[2 + i].dy[last] - jac[2 + i].dy[0])
      dGapVx.push(jac[2 + n + i].dx[last] - jac[2 + n + i].dx[0])
      dGapVy.push(jac[2 + n + i].dy[last] - jac[2 + n + i].dy[0])
    }
    const fUx = foldRow(dGapUx), fUy = foldRow(dGapUy), fVx = foldRow(dGapVx), fVy = foldRow(dGapVy)
    const Jx = [...fUx, ...fVx], Jy = [...fUy, ...fVy] // length 2K

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

  // Express the exact closed curve in the periodic representation, so it behaves
  // like every other closed B-spline. The generator stays clamped (the PH source
  // of truth); the periodic curve is the display geometry.
  const periodic = buildPeriodicPHCurve(curve.controlPoints, curve.knots, nWrap)
  return {
    controlPoints: periodic.controlPoints,
    knots: periodic.knots,
    degree: periodic.degree,
    metadata: { ...curve.metadata, closed: true, wrapSign: s, seamContinuity: nWrap },
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
  // C⁰ closure: express in the periodic representation with a full (degree-mult)
  // seam junction, so the seam is a real movable junction (corner for now).
  const periodic = buildPeriodicPHCurve(cps, curve.knots, 0)
  return {
    controlPoints: periodic.controlPoints,
    knots: periodic.knots,
    degree: periodic.degree,
    metadata: { ...curve.metadata, closed: true, wrapSign: s, seamContinuity: 0 },
  }
}
