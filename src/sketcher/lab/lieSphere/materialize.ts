/**
 * Materialize the transformed surface as an exact rational NURBS, by sample-and-
 * solve. The full revolution is covered by four θ-quadrant rational-Bézier patches
 * (v = the rational-quadratic circle parameter, degree 2); the u-degree is detected
 * from the residual drop. See DESIGN.md / surfaceFit.ts.
 */

import {
  type Mat6,
  type Vec3,
  applyMat6,
  liftPointSphere,
  liftTangentPlane,
  readbackPoint,
} from './lieTransform'

/**
 * Meridian evaluator: given a normalized parameter u ∈ [0,1], return the
 * planar meridian point (X, Y) in editor units and its unit normal (nx, ny).
 * Representation-agnostic — any PH (or other) meridian can be materialized by
 * supplying this. The fit recovers the EXACT surface coefficients when degU is
 * the surface's true degree (least-squares on a degree-d rational reproduces
 * it with zero residual).
 */
export type MeridianEval = (u: number) => { X: number; Y: number; nx: number; ny: number }
import {
  type RationalPatch,
  type SurfaceSample,
  evalRationalPatch,
  fitRationalPatch,
} from './surfaceFit'

const DEG_V = 2 // parallels map to conics
const QUADRANT = Math.PI / 2

/** First-quadrant unit circle as a rational quadratic Bézier → angle for param v. */
function arcThetaLocal(v: number): number {
  const w1 = Math.SQRT1_2
  const b0 = (1 - v) * (1 - v)
  const b1 = 2 * v * (1 - v)
  const b2 = v * v
  const W = b0 + w1 * b1 + b2
  return Math.atan2((w1 * b1 + b2) / W, (b0 + w1 * b1) / W)
}

function surfacePoint(merid: MeridianEval, M: Mat6, scale: number, u: number, theta: number): Vec3 {
  const { X, Y, nx, ny } = merid(u)
  const r = X / scale
  const z = Y / scale
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const p: Vec3 = [r * c, r * s, z]
  const N: Vec3 = [nx * c, nx * s, ny]
  return readbackPoint(applyMat6(M, liftPointSphere(p)), applyMat6(M, liftTangentPlane(p, N)))!
}

function patchSamples(
  merid: MeridianEval,
  M: Mat6,
  scale: number,
  quadrant: number,
  nu: number,
  nv: number,
  jit: number,
): SurfaceSample[] {
  const out: SurfaceSample[] = []
  for (let a = 0; a < nu; a++) {
    for (let b = 0; b < nv; b++) {
      const u = Math.min(0.999, Math.max(0.001, a / (nu - 1) + jit))
      const v = Math.min(0.999, Math.max(0.001, b / (nv - 1) + jit))
      const theta = quadrant * QUADRANT + arcThetaLocal(v)
      out.push({ u, v, p: surfacePoint(merid, M, scale, u, theta) })
    }
  }
  return out
}

export interface SurfaceNurbs {
  degU: number
  degV: number
  /** Four θ-quadrant rational-Bézier patches covering the full surface. */
  patches: RationalPatch[]
  /** True if degU was found by a clean residual drop; false = best-effort. */
  exact: boolean
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Detect the minimal u-degree on quadrant 0 by the residual drop to ~roundoff. */
function detectDegU(merid: MeridianEval, M: Mat6, scale: number): { degU: number; exact: boolean } {
  const train = patchSamples(merid, M, scale, 0, 30, 9, 0)
  const test = patchSamples(merid, M, scale, 0, 13, 7, 0.011)
  let best = { degU: 13, err: Infinity }
  for (let d = 4; d <= 13; d++) {
    const patch = fitRationalPatch(train, d, DEG_V)
    let m = 0
    for (const s of test) m = Math.max(m, dist(evalRationalPatch(patch, s.u, s.v), s.p))
    if (m < best.err) best = { degU: d, err: m }
    if (m < 1e-11) return { degU: d, exact: true }
  }
  return { degU: best.degU, exact: false }
}

export function materializeLieSurface(merid: MeridianEval, M: Mat6, scale: number): SurfaceNurbs {
  const { degU, exact } = detectDegU(merid, M, scale)
  const nu = Math.max(2 * (degU + 1), 24)
  const patches: RationalPatch[] = []
  for (let q = 0; q < 4; q++) {
    patches.push(fitRationalPatch(patchSamples(merid, M, scale, q, nu, 9, 0), degU, DEG_V))
  }
  return { degU, degV: DEG_V, patches, exact }
}

/** Euclidean control points of a patch: cp[i][j] = (X/W, Y/W, Z/W). */
export function patchControlPoints(patch: RationalPatch): Vec3[][] {
  return patch.ctrl.map((row) =>
    row.map((cp) => [cp[0] / cp[3], cp[1] / cp[3], cp[2] / cp[3]] as Vec3),
  )
}
