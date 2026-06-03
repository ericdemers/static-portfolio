// @ts-nocheck — ported from ../sketcher Lie Sphere lab (engine intact)
/**
 * Lie sphere transformations via the Legendre lift ("Picture 1").
 *
 * Oriented spheres / points / planes of R^3 are lifted to the Lie quadric
 * Q^4 = { <x,x> = 0 } in P^5, with the (4,2) inner product
 *     <x,y> = -x0 y0 + x1 y1 + x2 y2 + x3 y3 + x4 y4 - x5 y5.
 * Lie coordinates of an oriented sphere (center c, signed radius r):
 *     [ (1+|c|^2-r^2)/2 : (1-|c|^2+r^2)/2 : c1 : c2 : c3 : r ].
 * Point spheres have x5 = 0 (the hyperplane of points); planes have x0+x1 = 0.
 *
 * A surface point p with unit normal N gives a contact element = the line on Q
 * through the point-sphere p̂ and the tangent-plane N̂. A Lie transformation is a
 * linear map M in O(4,2); the transformed surface point is the point-sphere on
 * the image line, i.e. the line's intersection with { x5 = 0 }. See DESIGN.md.
 */

export type Vec3 = [number, number, number]
export type Vec6 = [number, number, number, number, number, number]
export type Mat6 = number[][] // 6x6, row-major

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Point sphere (radius 0) for a point p: lives in { x5 = 0 }. */
export function liftPointSphere(p: Vec3): Vec6 {
  const n2 = dot3(p, p)
  return [(1 + n2) / 2, (1 - n2) / 2, p[0], p[1], p[2], 0]
}

/** Oriented tangent plane <x,N> = <p,N> with unit normal N (an "infinite-radius" sphere). */
export function liftTangentPlane(p: Vec3, N: Vec3): Vec6 {
  const h = dot3(p, N)
  return [h, -h, N[0], N[1], N[2], 1]
}

export function applyMat6(M: Mat6, x: Vec6): Vec6 {
  const y: Vec6 = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < 6; i++) {
    let s = 0
    for (let j = 0; j < 6; j++) s += M[i][j] * x[j]
    y[i] = s
  }
  return y
}

export function matMul6(A: Mat6, B: Mat6): Mat6 {
  const C: Mat6 = Array.from({ length: 6 }, () => new Array(6).fill(0))
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      let s = 0
      for (let k = 0; k < 6; k++) s += A[i][k] * B[k][j]
      C[i][j] = s
    }
  return C
}

/** Compose transforms; rightmost is applied first (matrix product order). */
export function compose6(...mats: Mat6[]): Mat6 {
  return mats.reduce((acc, m) => matMul6(acc, m))
}

/**
 * Back-map: the point-sphere on the line spanned by (transformed) point sphere q
 * and tangent plane n. P = n5·q − q5·n kills the x5 component, then dehomogenize.
 * Returns null where the contact element maps to infinity (x0+x1 ≈ 0).
 */
export function readbackPoint(q: Vec6, n: Vec6): Vec3 | null {
  const P: Vec6 = [0, 0, 0, 0, 0, 0]
  for (let i = 0; i < 6; i++) P[i] = n[5] * q[i] - q[5] * n[i]
  const w = P[0] + P[1]
  if (Math.abs(w) < 1e-14) return null
  return [P[2] / w, P[3] / w, P[4] / w]
}

// ============================================================================
// Transform builders (elements of O(4,2))
// ============================================================================

export function identity6(): Mat6 {
  const M: Mat6 = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => (i === j ? 1 : 0)),
  )
  return M
}

/** Euclidean translation by a. */
export function translation6(a: Vec3): Mat6 {
  const h = dot3(a, a) / 2
  const [a0, a1, a2] = a
  return [
    [1 + h, h, a0, a1, a2, 0],
    [-h, 1 - h, -a0, -a1, -a2, 0],
    [a0, a0, 1, 0, 0, 0],
    [a1, a1, 0, 1, 0, 0],
    [a2, a2, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 1],
  ]
}

/** Uniform scaling p -> λ p (λ > 0). */
export function scaling6(lambda: number): Mat6 {
  const p = (1 + lambda * lambda) / 2
  const m = (1 - lambda * lambda) / 2
  return [
    [p, m, 0, 0, 0, 0],
    [m, p, 0, 0, 0, 0],
    [0, 0, lambda, 0, 0, 0],
    [0, 0, 0, lambda, 0, 0],
    [0, 0, 0, 0, lambda, 0],
    [0, 0, 0, 0, 0, lambda],
  ]
}

/** Inversion in the unit sphere centered at the origin: p -> p/|p|^2 (orientation reversed). */
export function inversionUnitSphere6(): Mat6 {
  const M = identity6()
  M[1][1] = -1
  M[5][5] = -1
  return M
}

/** Inversion in the sphere of center c and radius ρ: p -> c + ρ^2 (p-c)/|p-c|^2. */
export function inversionInSphere6(c: Vec3, rho: number): Mat6 {
  const negC: Vec3 = [-c[0], -c[1], -c[2]]
  return compose6(
    translation6(c),
    scaling6(rho),
    inversionUnitSphere6(),
    scaling6(1 / rho),
    translation6(negC),
  )
}

/**
 * Laguerre offset: add d to every signed radius (r -> r + d). Unlike the Möbius
 * builders above this does NOT preserve the point hyperplane { x5 = 0 } — point
 * spheres become radius-d spheres — so the tangent-plane part of the contact
 * element is essential to the readback. This is the genuinely-Lie test case and
 * the surface-level offset of the restricted Laguerre track.
 */
export function offset6(d: number): Mat6 {
  const h = (d * d) / 2
  return [
    [1 - h, -h, 0, 0, 0, -d],
    [h, 1 + h, 0, 0, 0, d],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 1, 0],
    [d, d, 0, 0, 0, 1],
  ]
}
