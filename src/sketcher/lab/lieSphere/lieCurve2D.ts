// @ts-nocheck
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
import { decomposeToBernstein, recomposeBD } from '../../optimizer/algebra'

export type Mat5 = number[][] // 5×5, row-major. Index map: [s0, s1, x, y, r].

export function identity5(): Mat5 {
  return Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => (i === j ? 1 : 0)))
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

// --- Bernstein Vec5 helpers ---
function elevateAll(bds) {
  let maxDeg = 0
  for (const b of bds) maxDeg = Math.max(maxDeg, b.degree)
  const zero = bds.find((b) => b.degree === maxDeg).multiplyByScalar(0)
  return bds.map((b) => zero.add(b)) // .add elevates the lower-degree operand
}
function applyMat5BD(M: Mat5, v) {
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
export function lieCurveHomogeneous(meta, M: Mat5): { X; Y; W } {
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
 * Transform an AB-PH curve by a planar Lie-sphere transform M (5×5, O(3,2)).
 * Returns an exact rational B-spline (real weights): ComplexPoint[] with w_im = 0.
 */
export function abPHToLieCurve(meta, M: Mat5): { controlPoints; knots: number[]; degree: number } {
  const h = lieCurveHomogeneous(meta, M)
  const Xout = recomposeBD(h.X)
  const Yout = recomposeBD(h.Y)
  const Wout = recomposeBD(h.W)

  const controlPoints = []
  for (let i = 0; i < Wout.controlPoints.length; i++) {
    const w = Wout.controlPoints[i]
    controlPoints.push({
      re: Math.abs(w) > 1e-300 ? Xout.controlPoints[i] / w : 0,
      im: Math.abs(w) > 1e-300 ? Yout.controlPoints[i] / w : 0,
      w_re: w,
      w_im: 0,
    })
  }
  const degree = Wout.knots.length - Wout.controlPoints.length - 1
  return { controlPoints, knots: Wout.knots, degree }
}
