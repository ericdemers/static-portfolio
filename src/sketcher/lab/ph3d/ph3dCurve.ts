/**
 * Spatial (3D) Pythagorean-Hodograph quintic — math core.
 *
 * Representation (quaternion / Hopf form):
 *   A(t) = A0·B0²(t) + A1·B1²(t) + A2·B2²(t)   (quadratic quaternion polynomial)
 *   r'(t) = A(t) i A*(t)                         (degree-4 hodograph)
 *   r(t)  = origin + ∫ r'                        (degree-5 Bézier curve)
 *
 * Writing A = u + v·i + p·j + q·k, the hodograph components are
 *   r'_x = u² + v² − p² − q²
 *   r'_y = 2(u q + v p)
 *   r'_z = 2(v q − u p)
 * and the parametric speed is the *polynomial*
 *   σ(t) = |r'(t)| = u² + v² + p² + q²
 * (PH is automatic for ANY quaternion polynomial A — no PH constraint needed.)
 *
 * Because σ is polynomial, arc length s(t) = ∫σ is an exact degree-5 polynomial,
 * and the curvature bound can be written without any square root: since κ ≥ 0,
 *   κ ≤ κ_max  ⟺  κ² ≤ κ_max²  ⟺  P_max(t) = κ_max²·σ⁶ − ‖r'×r''‖² ≥ 0,
 * a degree-24 polynomial whose Bernstein coefficients (all ≥ 0 ⇒ P_max ≥ 0 on
 * [0,1]) become inequality constraints for the interior-point solver.
 */

import {
  BernsteinDecomposition,
  integrateBD,
  derivativeBD,
} from '../../optimizer/algebra'
import type { Matrix } from '../../optimizer/linearAlgebra'

// ============================================================================
// Types
// ============================================================================

export interface Quat {
  u: number
  v: number
  p: number
  q: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Full analysis of a spatial PH quintic, with everything the lab/solver needs. */
export interface PH3DAnalysis {
  /** The 6 Bézier control points of the degree-5 curve. */
  controlPoints: Vec3[]
  /** Total arc length ∫₀¹ σ dt — exact. */
  arcLength: number
  /** Maximum curvature over a sampling of [0,1] (for the live readout). */
  peakCurvature: number
  /** κ_max sampled as κ(t) at `samples` points. */
  curvatureSamples: number[]
  /** τ(t) sampled at `samples` points (torsion readout). */
  torsionSamples: number[]
  /** Curve points sampled at `samples` points (for rendering). */
  points: Vec3[]
  /** Parameters t of each sample. */
  params: number[]
  /**
   * Bernstein coefficients of P_max(t) = κ_max²·σ⁶ − ‖r'×r''‖² for a given
   * κ_max. All ≥ 0 ⇒ curvature bound certified on [0,1].
   */
  pMaxCoeffs: (kappaMax: number) => number[]
}

// ============================================================================
// Helpers
// ============================================================================

const SPAN: number[] = [0, 1]

/** Build a single-span Bernstein decomposition from raw Bézier coefficients. */
function bd(coeffs: number[]): BernsteinDecomposition {
  return new BernsteinDecomposition([coeffs], SPAN)
}

function sq(b: BernsteinDecomposition): BernsteinDecomposition {
  return b.multiply(b)
}

// ============================================================================
// Core
// ============================================================================

/**
 * Build the polynomial pieces of a spatial PH quintic from its quaternion
 * control values. All returned BDs are single-span on [0,1].
 */
export function ph3dPolynomials(a0: Quat, a1: Quat, a2: Quat) {
  // Quaternion component polynomials (quadratic Bézier in each component).
  const u = bd([a0.u, a1.u, a2.u])
  const v = bd([a0.v, a1.v, a2.v])
  const p = bd([a0.p, a1.p, a2.p])
  const q = bd([a0.q, a1.q, a2.q])

  const uu = sq(u)
  const vv = sq(v)
  const pp = sq(p)
  const qq = sq(q)

  // Hodograph r' = A i A*  (degree 4).
  const hx = uu.add(vv).subtract(pp).subtract(qq)
  const hy = u.multiply(q).add(v.multiply(p)).multiplyByScalar(2)
  const hz = v.multiply(q).subtract(u.multiply(p)).multiplyByScalar(2)

  // Parametric speed σ = |r'| = u²+v²+p²+q²  (degree 4, polynomial).
  const sigma = uu.add(vv).add(pp).add(qq)

  return { hx, hy, hz, sigma }
}

/**
 * Curvature/torsion polynomial terms derived from the hodograph:
 *   crossSq    = ‖r'×r''‖²  (degree 14) — curvature numerator (squared)
 *   sigma6     = σ⁶          (degree 24) — curvature denominator (cubed speed²)
 *   torsionNum = (r'×r'')·r''' (degree 9) — torsion numerator
 */
export function ph3dCurvatureTerms(a0: Quat, a1: Quat, a2: Quat) {
  const { hx, hy, hz, sigma } = ph3dPolynomials(a0, a1, a2)

  // r'' (degree 3) and r''' (degree 2).
  const rxx = derivativeBD(hx)
  const ryy = derivativeBD(hy)
  const rzz = derivativeBD(hz)
  const rxxx = derivativeBD(rxx)
  const ryyy = derivativeBD(ryy)
  const rzzz = derivativeBD(rzz)

  // Cross product r' × r''  (degree 7).
  const cx = hy.multiply(rzz).subtract(hz.multiply(ryy))
  const cy = hz.multiply(rxx).subtract(hx.multiply(rzz))
  const cz = hx.multiply(ryy).subtract(hy.multiply(rxx))

  const crossSq = sq(cx).add(sq(cy)).add(sq(cz))
  const torsionNum = cx.multiply(rxxx).add(cy.multiply(ryyy)).add(cz.multiply(rzzz))

  const s2 = sq(sigma)
  const s3 = s2.multiply(sigma)
  const sigma6 = sq(s3)

  return { sigma, crossSq, sigma6, torsionNum }
}

/** The 6 Bézier control points of the degree-5 curve (cheap; objective hot path). */
export function ph3dControlPoints(a0: Quat, a1: Quat, a2: Quat, origin: Vec3): Vec3[] {
  const { hx, hy, hz } = ph3dPolynomials(a0, a1, a2)
  const xCP = integrateBD(hx, origin.x).controlPointsArray[0]
  const yCP = integrateBD(hy, origin.y).controlPointsArray[0]
  const zCP = integrateBD(hz, origin.z).controlPointsArray[0]
  return xCP.map((x, i) => ({ x, y: yCP[i], z: zCP[i] }))
}

/**
 * Bernstein coefficients of P_max(t) = κ_max²·σ⁶ − ‖r'×r''‖² (cheap; constraint
 * hot path). All coefficients ≥ 0 ⇒ κ ≤ κ_max everywhere on [0,1].
 *
 * The single-span degree-24 certificate is very conservative, so we optionally
 * subdivide [0,1] into `subdivisions` equal Bézier pieces and return the
 * coefficients of every piece — positivity on each piece ⇒ positivity on [0,1],
 * and the certificate tightens quickly with subdivision.
 */
export function ph3dPMaxCoeffs(
  a0: Quat,
  a1: Quat,
  a2: Quat,
  kappaMax: number,
  subdivisions = 1,
): number[] {
  const { crossSq, sigma6 } = ph3dCurvatureTerms(a0, a1, a2)
  const coeffs = sigma6.multiplyByScalar(kappaMax * kappaMax).subtract(crossSq).flattenControlPoints()
  return subdivisions > 1 ? bezierSubdivide(coeffs, subdivisions) : coeffs
}

// ----- Bézier subdivision (de Casteljau) ------------------------------------

/** Control coefficients of the Bézier restricted to [0, t]. */
function splitLeft(c: number[], t: number): number[] {
  const n = c.length
  const w = [...c]
  const left = [w[0]]
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) w[i] = (1 - t) * w[i] + t * w[i + 1]
    left.push(w[0])
  }
  return left
}

/** Control coefficients of the Bézier restricted to [t, 1]. */
function splitRight(c: number[], t: number): number[] {
  const n = c.length
  const w = [...c]
  const right = [w[n - 1]]
  for (let r = 1; r < n; r++) {
    for (let i = 0; i < n - r; i++) w[i] = (1 - t) * w[i] + t * w[i + 1]
    right.unshift(w[n - 1 - r])
  }
  return right
}

/** Coefficients of the Bézier restricted to [a, b] ⊂ [0,1], reparam to [0,1]. */
function bezierSegment(c: number[], a: number, b: number): number[] {
  let seg = a > 0 ? splitRight(c, a) : c
  if (b < 1) seg = splitLeft(seg, (b - a) / (1 - a))
  return seg
}

/** Split a single Bézier into `k` equal pieces; concatenate their coefficients. */
function bezierSubdivide(c: number[], k: number): number[] {
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(...bezierSegment(c, i / k, (i + 1) / k))
  return out
}

// ============================================================================
// Analytic derivatives (Bernstein algebra; no finite differences)
//
// Variable order matches Spatial3DPHCurveProblem.getVariables:
//   [A0.u,A0.v,A0.p,A0.q, A1.u…, A2.u…, origin.x, origin.y, origin.z]  (15).
// The hodograph r' = A i A* is quadratic in the quaternion components, so all
// derivatives are exact. ∂(hx,hy,hz)/∂(component c) for a unit perturbation B in
// quaternion-control k, with hx=u²+v²−p²−q², hy=2(uq+vp), hz=2(vq−up):
// ============================================================================

/** Per-component partials of (hx,hy,hz): [scalar, which component poly]. */
const HODO_PARTIALS: Record<'u' | 'v' | 'p' | 'q', { x: [number, string]; y: [number, string]; z: [number, string] }> = {
  u: { x: [2, 'u'], y: [2, 'q'], z: [-2, 'p'] },
  v: { x: [2, 'v'], y: [2, 'p'], z: [2, 'q'] },
  p: { x: [-2, 'p'], y: [2, 'v'], z: [-2, 'u'] },
  q: { x: [-2, 'q'], y: [2, 'u'], z: [2, 'v'] },
}
const COMPONENTS = ['u', 'v', 'p', 'q'] as const

function componentBDs(a0: Quat, a1: Quat, a2: Quat): Record<string, BernsteinDecomposition> {
  return {
    u: bd([a0.u, a1.u, a2.u]),
    v: bd([a0.v, a1.v, a2.v]),
    p: bd([a0.p, a1.p, a2.p]),
    q: bd([a0.q, a1.q, a2.q]),
  }
}

export interface Vec3Deriv {
  dx: number[]
  dy: number[]
  dz: number[]
}

/** Exact Jacobian of the 6 control points w.r.t. the 15 variables. */
export function ph3dControlPointJacobian(a0: Quat, a1: Quat, a2: Quat): Vec3Deriv[] {
  const comp = componentBDs(a0, a1, a2)
  const nCP = integrateBD(sq(comp.u), 0).controlPointsArray[0].length
  const out: Vec3Deriv[] = []
  for (let k = 0; k < 3; k++) {
    const e = [0, 0, 0]
    e[k] = 1
    const B = bd(e)
    for (const c of COMPONENTS) {
      const t = HODO_PARTIALS[c]
      const dhx = comp[t.x[1]].multiply(B).multiplyByScalar(t.x[0])
      const dhy = comp[t.y[1]].multiply(B).multiplyByScalar(t.y[0])
      const dhz = comp[t.z[1]].multiply(B).multiplyByScalar(t.z[0])
      out.push({
        dx: integrateBD(dhx, 0).controlPointsArray[0],
        dy: integrateBD(dhy, 0).controlPointsArray[0],
        dz: integrateBD(dhz, 0).controlPointsArray[0],
      })
    }
  }
  // origin shifts every control point uniformly.
  out.push({ dx: new Array(nCP).fill(1), dy: new Array(nCP).fill(0), dz: new Array(nCP).fill(0) })
  out.push({ dx: new Array(nCP).fill(0), dy: new Array(nCP).fill(1), dz: new Array(nCP).fill(0) })
  out.push({ dx: new Array(nCP).fill(0), dy: new Array(nCP).fill(0), dz: new Array(nCP).fill(1) })
  return out
}

/**
 * Exact Jacobian of the P_max bound coefficients w.r.t. the 15 variables (the
 * origin columns are zero). Row order matches ph3dPMaxCoeffs.
 */
export function ph3dPMaxJacobian(
  a0: Quat,
  a1: Quat,
  a2: Quat,
  kappaMax: number,
  subdivisions = 1,
): Matrix {
  const comp = componentBDs(a0, a1, a2)
  const { u, v, p, q } = comp
  const hx = sq(u).add(sq(v)).subtract(sq(p)).subtract(sq(q))
  const hy = u.multiply(q).add(v.multiply(p)).multiplyByScalar(2)
  const hz = v.multiply(q).subtract(u.multiply(p)).multiplyByScalar(2)
  const rxx = derivativeBD(hx)
  const ryy = derivativeBD(hy)
  const rzz = derivativeBD(hz)
  const cx = hy.multiply(rzz).subtract(hz.multiply(ryy))
  const cy = hz.multiply(rxx).subtract(hx.multiply(rzz))
  const cz = hx.multiply(ryy).subtract(hy.multiply(rxx))
  const sigma = sq(u).add(sq(v)).add(sq(p)).add(sq(q))
  const s5 = sq(sq(sigma)).multiply(sigma) // σ⁵
  const km2 = kappaMax * kappaMax

  const flat = (b: BernsteinDecomposition): number[] => {
    const c = b.flattenControlPoints()
    return subdivisions > 1 ? bezierSubdivide(c, subdivisions) : c
  }

  const cols: number[][] = []
  for (let k = 0; k < 3; k++) {
    const e = [0, 0, 0]
    e[k] = 1
    const B = bd(e)
    for (const c of COMPONENTS) {
      const t = HODO_PARTIALS[c]
      const dhx = comp[t.x[1]].multiply(B).multiplyByScalar(t.x[0])
      const dhy = comp[t.y[1]].multiply(B).multiplyByScalar(t.y[0])
      const dhz = comp[t.z[1]].multiply(B).multiplyByScalar(t.z[0])
      const drxx = derivativeBD(dhx)
      const dryy = derivativeBD(dhy)
      const drzz = derivativeBD(dhz)
      // d(cross) by the product rule on cx=hy·rzz−hz·ryy, etc.
      const dcx = dhy.multiply(rzz).add(hy.multiply(drzz)).subtract(dhz.multiply(ryy)).subtract(hz.multiply(dryy))
      const dcy = dhz.multiply(rxx).add(hz.multiply(drxx)).subtract(dhx.multiply(rzz)).subtract(hx.multiply(drzz))
      const dcz = dhx.multiply(ryy).add(hx.multiply(dryy)).subtract(dhy.multiply(rxx)).subtract(hy.multiply(drxx))
      // d‖cross‖² = 2(cx dcx + cy dcy + cz dcz)
      const dCrossSq = cx.multiply(dcx).add(cy.multiply(dcy)).add(cz.multiply(dcz)).multiplyByScalar(2)
      // dσ = 2·comp_c·B ; d(σ⁶) = 6σ⁵·dσ
      const dSigma = comp[c].multiply(B).multiplyByScalar(2)
      const dSigma6 = s5.multiply(dSigma).multiplyByScalar(6)
      const dPmax = dSigma6.multiplyByScalar(km2).subtract(dCrossSq)
      cols.push(flat(dPmax))
    }
  }
  const numC = cols[0].length
  cols.push(new Array(numC).fill(0)) // origin.x
  cols.push(new Array(numC).fill(0)) // origin.y
  cols.push(new Array(numC).fill(0)) // origin.z

  const numVars = cols.length
  const J: Matrix = []
  for (let i = 0; i < numC; i++) {
    const row = new Array(numVars)
    for (let vIdx = 0; vIdx < numVars; vIdx++) row[vIdx] = cols[vIdx][i]
    J.push(row)
  }
  return J
}

/**
 * Full analysis of a spatial PH quintic.
 *
 * @param a0,a1,a2 quaternion control values of A(t)
 * @param origin   integration constant r(0)
 * @param samples  number of sample points for readouts/rendering
 */
export function analyzePH3D(
  a0: Quat,
  a1: Quat,
  a2: Quat,
  origin: Vec3,
  samples = 200,
): PH3DAnalysis {
  const { hx, hy, hz } = ph3dPolynomials(a0, a1, a2)
  const { sigma, crossSq, sigma6: s6, torsionNum } = ph3dCurvatureTerms(a0, a1, a2)

  // Curve coordinates r(t) = origin + ∫ r'  (degree 5).
  const xBD = integrateBD(hx, origin.x)
  const yBD = integrateBD(hy, origin.y)
  const zBD = integrateBD(hz, origin.z)

  const xCP = xBD.controlPointsArray[0]
  const yCP = yBD.controlPointsArray[0]
  const zCP = zBD.controlPointsArray[0]
  const controlPoints: Vec3[] = xCP.map((x, i) => ({ x, y: yCP[i], z: zCP[i] }))

  // Exact arc length s(t) = ∫σ.
  const sIntegral = integrateBD(sigma, 0)
  const arcLength = sIntegral.evaluate(1)

  // Sample κ(t) = ‖r'×r''‖ / σ³ and τ(t) = (r'×r'')·r''' / ‖r'×r''‖².
  const params: number[] = []
  const points: Vec3[] = []
  const curvatureSamples: number[] = []
  const torsionSamples: number[] = []
  let peakCurvature = 0
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    params.push(t)
    points.push({ x: xBD.evaluate(t), y: yBD.evaluate(t), z: zBD.evaluate(t) })

    const csq = crossSq.evaluate(t)
    const sig = sigma.evaluate(t)
    const kappa = sig > 1e-12 ? Math.sqrt(Math.max(0, csq)) / (sig * sig * sig) : 0
    curvatureSamples.push(kappa)
    if (kappa > peakCurvature) peakCurvature = kappa

    const tau = csq > 1e-12 ? torsionNum.evaluate(t) / csq : 0
    torsionSamples.push(tau)
  }

  const pMaxCoeffs = (kappaMax: number): number[] =>
    s6.multiplyByScalar(kappaMax * kappaMax).subtract(crossSq).flattenControlPoints()

  return {
    controlPoints,
    arcLength,
    peakCurvature,
    curvatureSamples,
    torsionSamples,
    points,
    params,
    pMaxCoeffs,
  }
}

// ============================================================================
// A pleasant non-planar default curve
// ============================================================================

/**
 * A default gently-curved PH quintic. It uses only the u,p quaternion components
 * (v = q = 0), which makes r'_y = 2(uq+vp) = 0 — so the curve lies flat in the
 * xz-plane (hodograph (u²−p², 0, −2up), the 2D spiral shape). The lab views it
 * face-on so dragging starts in-plane; rotate the view to bend out of plane.
 */
export function defaultPH3D(): { a0: Quat; a1: Quat; a2: Quat; origin: Vec3 } {
  return {
    a0: { u: 1.0, v: 0.0, p: 0.0, q: 0.0 },
    a1: { u: 0.9, v: 0.0, p: 0.3, q: 0.0 },
    a2: { u: 0.7, v: 0.0, p: 0.55, q: 0.0 },
    origin: { x: 0, y: 0, z: 0 },
  }
}

/**
 * A straight horizontal segment (constant quaternion ⇒ constant hodograph ⇒
 * zero curvature everywhere). Always feasible for any bound — a clean starting
 * point that the user bends by dragging control points.
 */
export function straightLine(): { a0: Quat; a1: Quat; a2: Quat; origin: Vec3 } {
  const a: Quat = { u: 1, v: 0, p: 0, q: 0 } // r' = (1,0,0), |r'| = 1
  return { a0: { ...a }, a1: { ...a }, a2: { ...a }, origin: { x: -0.5, y: 0, z: 0 } }
}
