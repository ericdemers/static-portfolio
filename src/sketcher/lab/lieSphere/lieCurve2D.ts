// Planar Lie-sphere transform of an AB-PH curve → an EXACT rational B-spline (NURBS).
//
// Pipeline (per the lab's Legendre lift, one dimension down — oriented circles in
// the plane, the Lie quadric in P⁴, group O(3,2)):
//   1. Lift each contact element (point + oriented tangent) to TWO points on the
//      quadric spanning the contact LINE.
//   2. Apply the transform M ∈ O(3,2) (a 5×5 matrix) to both — linear.
//   3. Read the image point back by intersecting the image line with the point
//      hyperplane {x4 = 0}:  P = n4·q − q4·n.
//
// Because the curve is PH, its unit normal and speed are RATIONAL, so the whole
// thing is rational in t of computed degree. We track it SYMBOLICALLY over the
// Bernstein algebra (no fitting, no interpolation): the cleared-denominator lifts
// are polynomial vectors, M is linear, readback is polynomial products, so the
// transformed homogeneous curve (Xout, Yout, Wout) is an exact rational B-spline.
//
//   q_poly = [W²+X²+Y²,  W²−X²−Y²,  2XW,  2YW,  0]
//   n_poly = [X·ReG+Y·ImG,  −(X·ReG+Y·ImG),  W·ReG,  W·ImG,  W²σ]      G = i·S²·B̄²
// with homogeneous point (X,Y,W)=(Re(A B̄),Im(A B̄),|B|²), σ=|S|², for z=A/B, gen S.
import { decomposeToBernstein } from '../../optimizer/algebra'
import type { BernsteinDecomposition } from '../../optimizer/algebra'
import { fitRealRational, evalRealRational, elevateRealRational, normalizeRealRationalWeights, type RealRationalCurve, type RealSample } from './rationalFit'
import type { ABPHMetadata } from '../../optimizer/abPHCurve'
import type { WeightedPoint2D } from '../../types/curve'

export type Mat5 = number[][] // 5×5, row-major. Index map: [s0, s1, x, y, r].

export function identity5(): Mat5 {
  return Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => (i === j ? 1 : 0)))
}

/** Whether M is the identity (to a small tolerance) — i.e. "no transform". */
export function isIdentityMat5(M: Mat5, tol = 1e-9): boolean {
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++)
      if (Math.abs(M[i][j] - (i === j ? 1 : 0)) > tol) return false
  return true
}

export function matMul5(A: Mat5, B: Mat5): Mat5 {
  const C = Array.from({ length: 5 }, () => new Array(5).fill(0))
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { let s = 0; for (let k = 0; k < 5; k++) s += A[i][k] * B[k][j]; C[i][j] = s }
  return C
}
export function compose5(...mats: Mat5[]): Mat5 { return mats.reduce((a, m) => matMul5(a, m)) }

/** Uniform scaling p → λ·p. */
export function scaling5(l: number): Mat5 {
  const p = (1 + l * l) / 2, m = (1 - l * l) / 2
  return [[p, m, 0, 0, 0], [m, p, 0, 0, 0], [0, 0, l, 0, 0], [0, 0, 0, l, 0], [0, 0, 0, 0, l]]
}
/** Rotation by θ about the origin (acts on the (x,y) block). */
export function rotation5(t: number): Mat5 {
  const c = Math.cos(t), s = Math.sin(t)
  const M = identity5(); M[2][2] = c; M[2][3] = -s; M[3][2] = s; M[3][3] = c; return M
}
/** Euclidean translation by (ax, ay). */
export function translation5(ax: number, ay: number): Mat5 {
  const h = (ax * ax + ay * ay) / 2
  return [[1 + h, h, ax, ay, 0], [-h, 1 - h, -ax, -ay, 0], [ax, ax, 1, 0, 0], [ay, ay, 0, 1, 0], [0, 0, 0, 0, 1]]
}
/** Inversion in the unit circle at the origin (orientation-reversing). */
export function inversionUnitCircle5(): Mat5 { const M = identity5(); M[1][1] = -1; M[4][4] = -1; return M }
/** Inversion in the circle of center c, radius ρ. */
export function inversionInCircle5(cx: number, cy: number, rho: number): Mat5 {
  return compose5(translation5(cx, cy), scaling5(rho), inversionUnitCircle5(), scaling5(1 / rho), translation5(-cx, -cy))
}
/** Laguerre offset (genuinely-Lie: does NOT preserve the point hyperplane). Sign
 *  matches the app's offset convention — offset5(d) ≡ point + d·N (the same N as
 *  computeABPHOffset), so the Generate offset agrees with the Offset tool. */
export function offset5(d: number): Mat5 {
  const h = (d * d) / 2
  return [[1 - h, -h, 0, 0, d], [h, 1 + h, 0, 0, -d], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [-d, -d, 0, 0, 1]]
}

// --- Generate sliders → composed transform ---
export interface GenerateSliders {
  scale: number // λ (1 = identity)
  rotation: number // θ radians (0 = identity)
  offset: number // Laguerre distance d (0 = identity)
}
export const IDENTITY_SLIDERS: GenerateSliders = { scale: 1, rotation: 0, offset: 0 }

/** Compose the live slider transform (scale ∘ rotation ∘ offset). */
export function slidersToMat5(s: GenerateSliders): Mat5 {
  return compose5(scaling5(s.scale), rotation5(s.rotation), offset5(s.offset))
}

// --- Bernstein Vec5 helpers ---
function elevateAll(bds: BernsteinDecomposition[]) {
  let maxDeg = 0
  for (const b of bds) maxDeg = Math.max(maxDeg, b.degree)
  const zero = bds.find((b) => b.degree === maxDeg)!.multiplyByScalar(0)
  return bds.map((b) => zero.add(b)) // .add elevates the lower-degree operand
}
function applyMat5BD(M: Mat5, v: BernsteinDecomposition[]) {
  const out = []
  for (let i = 0; i < 5; i++) {
    let acc = v[0].multiplyByScalar(0)
    for (let j = 0; j < 5; j++) if (M[i][j] !== 0) acc = acc.add(v[j].multiplyByScalar(M[i][j]))
    out[i] = acc
  }
  return out
}

/**
 * The transformed curve in EXACT homogeneous Bernstein form (X, Y, W) — the
 * planar point is (X/W, Y/W). Split out so the math can be tested by direct BD
 * evaluation, independent of the recompose-to-B-spline step.
 */
export function lieCurveHomogeneous(meta: ABPHMetadata, M: Mat5): { X: BernsteinDecomposition; Y: BernsteinDecomposition; W: BernsteinDecomposition } {
  const aRe = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aIm = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bRe = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs })
  const bIm = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs })
  const u = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const v = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })

  const W = bRe.multiply(bRe).add(bIm.multiply(bIm)) // |B|²
  const X = aRe.multiply(bRe).add(aIm.multiply(bIm)) // Re(A B̄)
  const Y = aIm.multiply(bRe).subtract(aRe.multiply(bIm)) // Im(A B̄)
  const sigma = u.multiply(u).add(v.multiply(v)) // |S|²
  const Sr = u.multiply(u).subtract(v.multiply(v)) // Re(S²) = u²−v²
  const Si = u.multiply(v).multiplyByScalar(2) // Im(S²) = 2uv
  const Br2 = bRe.multiply(bRe).subtract(bIm.multiply(bIm)) // Re(B̄²) = bRe²−bIm²
  const Bi2 = bRe.multiply(bIm).multiplyByScalar(-2) // Im(B̄²) = −2 bRe bIm
  // G = i·S²·B̄²:  ReG = −(Sr·Bi2 + Si·Br2),  ImG = Sr·Br2 − Si·Bi2
  const ReG = Sr.multiply(Bi2).add(Si.multiply(Br2)).multiplyByScalar(-1)
  const ImG = Sr.multiply(Br2).subtract(Si.multiply(Bi2))

  const W2 = W.multiply(W)
  const X2 = X.multiply(X), Y2 = Y.multiply(Y)
  const qpoly = elevateAll([
    W2.add(X2).add(Y2),
    W2.subtract(X2).subtract(Y2),
    X.multiply(W).multiplyByScalar(2),
    Y.multiply(W).multiplyByScalar(2),
    W.multiplyByScalar(0),
  ])
  const XReG_YImG = X.multiply(ReG).add(Y.multiply(ImG))
  const npoly = elevateAll([
    XReG_YImG,
    XReG_YImG.multiplyByScalar(-1),
    W.multiply(ReG),
    W.multiply(ImG),
    W2.multiply(sigma),
  ])

  const q = applyMat5BD(M, qpoly)
  const n = applyMat5BD(M, npoly)

  // readback: P[i] = n4·q[i] − q4·n[i]
  const P = []
  for (let i = 0; i < 4; i++) P[i] = n[4].multiply(q[i]).subtract(q[4].multiply(n[i]))
  return { X: P[2], Y: P[3], W: P[0].add(P[1]) }
}

/**
 * Transform an AB-PH curve by a planar Lie-sphere transform M (5×5, O(3,2)) and
 * return a COMPACT rational B-spline (NURBS). The symbolic homogeneous form is
 * exact but degree-inflated (~10·n) with astronomically large coefficients, so
 * we don't recompose it directly — instead we sample its (numerically stable)
 * point ratios and re-fit a rational Bézier of degree 2n. Since every Lie
 * transform of a degree-n PH curve is representable at degree ≤ 2n (the classic
 * PH-offset bound, verified in lieDegree.test.ts), the fit is exact at 2n —
 * recovering a clean, well-conditioned, minimal-ish curve. The image points are
 * real, so we fit a REAL rational curve (real weights) — a clean NURBS, not a
 * complex-weight curve with a strange control polygon.
 */
export function abPHToLieCurve(meta: ABPHMetadata, M: Mat5): { controlPoints: WeightedPoint2D[]; knots: number[]; degree: number } {
  const h = lieCurveHomogeneous(meta, M)
  const evalPt = (u: number) => { const w = h.W.evaluate(u); return { x: h.X.evaluate(u) / w, y: h.Y.evaluate(u) / w } }
  const target = 2 * meta.degree // the worst-case (PH-offset) degree bound

  // Fit at degree d from point + central-difference unit-tangent samples (the G¹
  // constraints + minimal degree give a unique, well-conditioned, positive-weight
  // fit). FD is plenty for a tangent DIRECTION (the analytic BD has no derivative
  // accessor here).
  const fd = 1e-5
  const fitAt = (d: number): RealRationalCurve => {
    const m = Math.max(2 * d + 6, 16)
    const samples: RealSample[] = []
    for (let k = 0; k < m; k++) {
      const u = (k + 0.5) / m
      const p = evalPt(u)
      const pa = evalPt(Math.max(0, u - fd)), pb = evalPt(Math.min(1, u + fd))
      const tx0 = pb.x - pa.x, ty0 = pb.y - pa.y
      const tn = Math.hypot(tx0, ty0) || 1
      samples.push({ u, x: p.x, y: p.y, tx: tx0 / tn, ty: ty0 / tn })
    }
    return fitRealRational(samples, d)
  }
  const relResidual = (c: RealRationalCurve): number => {
    let r = 0, scale = 1
    for (let k = 0; k <= 50; k++) {
      const u = k / 50, t = evalPt(u), f = evalRealRational(c, u)
      r = Math.max(r, Math.hypot(t.x - f.x, t.y - f.y))
      scale = Math.max(scale, Math.abs(t.x), Math.abs(t.y))
    }
    return r / scale
  }

  // Detect the MINIMAL degree (residual drop). The Lie image is usually well below
  // 2n (n for conformal transforms, ~7 for a Laguerre offset). Fitting AT the
  // minimal degree is unique with positive weights; a direct fit at the inflated
  // 2n is non-unique (an arbitrary common factor → negative weights). Then
  // degree-ELEVATE back to 2n — unique and positivity-preserving — so we keep the
  // 2n contract with a clean polygon. Finally normalize the weights toward uniform.
  let fit = fitAt(target)
  for (let d = 2; d <= target; d++) {
    const f = fitAt(d)
    if (relResidual(f) < 1e-7) { fit = f; break }
  }
  fit = normalizeRealRationalWeights(elevateRealRational(fit, target))

  const controlPoints: WeightedPoint2D[] = []
  for (let i = 0; i <= target; i++) {
    const w = fit.den[i]
    controlPoints.push({
      x: Math.abs(w) > 1e-300 ? fit.numX[i] / w : 0,
      y: Math.abs(w) > 1e-300 ? fit.numY[i] / w : 0,
      w,
    })
  }
  const knots = []
  for (let i = 0; i <= target; i++) knots.push(0)
  for (let i = 0; i <= target; i++) knots.push(1)
  return { controlPoints, knots, degree: target }
}

/**
 * Multi-segment Lie-sphere transform of an AB-PH *spline* (e.g. the polynomial PH
 * spline lifted with B≡1). The single-Bézier `abPHToLieCurve` collapses every
 * segment into one degree-2n Bézier, which smears a wiggly multi-segment input;
 * here we fit EACH input span to its own rational Bézier and assemble a clamped
 * piecewise-Bézier rational B-spline. The exact homogeneous form is degree-
 * inflated, so (as in the single-segment case) we sample its stable point ratios
 * and re-fit per span. The minimal image degree is set by the transform M — the
 * same for every span — so we detect it once and fit all spans at that degree
 * (unique, positive-weight). `normalizeRealRationalWeights` pins each span's end
 * weights to 1, so consecutive spans meet with a consistent weight at the joins.
 */
export function abPHToLieCurveSpline(meta: ABPHMetadata, M: Mat5): { controlPoints: WeightedPoint2D[]; knots: number[]; degree: number } {
  // Distinct breakpoints of the AB curve = the input segmentation.
  const breaks: number[] = []
  for (let i = 0; i < meta.knots.length; i++) {
    if (i === 0 || meta.knots[i] !== meta.knots[i - 1]) breaks.push(meta.knots[i])
  }
  const numSpans = breaks.length - 1
  if (numSpans <= 1) return abPHToLieCurve(meta, M) // single segment → existing path

  const h = lieCurveHomogeneous(meta, M)
  const evalPt = (u: number) => { const w = h.W.evaluate(u); return { x: h.X.evaluate(u) / w, y: h.Y.evaluate(u) / w } }
  const target = 2 * meta.degree
  const fd = 1e-5

  // Fit span [a,b] at degree d, sampling in the global parameter but expressing
  // the fit on the local [0,1] (the tangent DIRECTION is reparametrization-free).
  const fitSpan = (a: number, b: number, d: number): RealRationalCurve => {
    const m = Math.max(2 * d + 6, 16)
    const span = b - a
    const samples: RealSample[] = []
    for (let k = 0; k < m; k++) {
      const uloc = (k + 0.5) / m
      const u = a + uloc * span
      const p = evalPt(u)
      const pa = evalPt(Math.max(a, u - fd * span)), pb = evalPt(Math.min(b, u + fd * span))
      const tx = pb.x - pa.x, ty = pb.y - pa.y, tn = Math.hypot(tx, ty) || 1
      samples.push({ u: uloc, x: p.x, y: p.y, tx: tx / tn, ty: ty / tn })
    }
    return fitRealRational(samples, d)
  }
  const relResidualSpan = (c: RealRationalCurve, a: number, b: number): number => {
    let r = 0, scale = 1
    for (let k = 0; k <= 50; k++) {
      const uloc = k / 50, u = a + uloc * (b - a)
      const t = evalPt(u), f = evalRealRational(c, uloc)
      r = Math.max(r, Math.hypot(t.x - f.x, t.y - f.y))
      scale = Math.max(scale, Math.abs(t.x), Math.abs(t.y))
    }
    return r / scale
  }

  // Fit each span at its own minimal degree (a short/flat span needs fewer
  // degrees than the curve's true image degree), then elevate all to the common
  // max — fitting AT the minimal degree is unique + positive-weight, elevation
  // keeps it so, whereas fitting directly above the minimal is non-unique.
  const fits: RealRationalCurve[] = []
  let T = 2
  for (let s = 0; s < numSpans; s++) {
    const a = breaks[s], b = breaks[s + 1]
    let fit = fitSpan(a, b, target), d = target
    for (let dd = 2; dd <= target; dd++) {
      const f = fitSpan(a, b, dd)
      if (relResidualSpan(f, a, b) < 1e-7) { fit = f; d = dd; break }
    }
    fits.push(fit)
    if (d > T) T = d
  }
  const spans = fits.map((c) => normalizeRealRationalWeights(elevateRealRational(c, T)))

  // Assemble: clamped, interior breakpoints at multiplicity T (C⁰ piecewise
  // Bézier). Consecutive spans share the join control point (end weights are 1).
  const controlPoints: WeightedPoint2D[] = []
  for (let s = 0; s < numSpans; s++) {
    const c = spans[s]
    for (let i = s === 0 ? 0 : 1; i <= T; i++) {
      const w = c.den[i]
      controlPoints.push({ x: Math.abs(w) > 1e-300 ? c.numX[i] / w : 0, y: Math.abs(w) > 1e-300 ? c.numY[i] / w : 0, w })
    }
  }
  const knots: number[] = []
  for (let i = 0; i <= T; i++) knots.push(breaks[0])
  for (let s = 1; s < numSpans; s++) for (let i = 0; i < T; i++) knots.push(breaks[s])
  for (let i = 0; i <= T; i++) knots.push(breaks[numSpans])
  return { controlPoints, knots, degree: T }
}
