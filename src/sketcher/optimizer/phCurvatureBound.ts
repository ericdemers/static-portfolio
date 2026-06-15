// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Curvature-value bound for a planar (polynomial) PH curve.
 *
 * For w = u + i·v the hodograph is r' = (u²−v², 2uv) and the SIGNED curvature is
 *   κ(t) = 2(u v' − v u') / (u²+v²)²,
 * which is square-root-free (σ²=(u²+v²)² is polynomial because the curve is PH).
 * Bounding |κ| ≤ κ_max is two polynomial inequalities — no squaring:
 *   P₊ = κ_max·σ² − 2(u v' − v u') ≥ 0     (κ ≤ +κ_max)
 *   P₋ = κ_max·σ² + 2(u v' − v u') ≥ 0     (κ ≥ −κ_max)
 * All Bernstein coefficients ≥ 0 ⇒ the bound holds. Degree 8 for a quintic.
 *
 * Everything here is polynomial in the u,v control points, so the constraint
 * Jacobian is exact via the same Bernstein algebra (no finite differences):
 *   ∂σ²/∂u_j = 4 σ u B_j,  ∂N/∂u_j = 2(B_j v' − v B_j'),  N = 2(u v' − v u').
 */

import { decomposeToBernstein, derivativeBD, type BernsteinDecomposition } from './algebra'
import type { Matrix } from './linearAlgebra'

// ---------------------------------------------------------------------------
// Bézier subdivision (de Casteljau) — tightens the certificate; it is a LINEAR
// map, so it applies identically to the constraint values and their Jacobian.
// ---------------------------------------------------------------------------
function bezierSegment(c: number[], a: number, b: number): number[] {
  const splitRight = (coeffs: number[], t: number): number[] => {
    const n = coeffs.length
    const w = [...coeffs]
    const right = [w[n - 1]]
    for (let r = 1; r < n; r++) {
      for (let i = 0; i < n - r; i++) w[i] = (1 - t) * w[i] + t * w[i + 1]
      right.unshift(w[n - 1 - r])
    }
    return right
  }
  const splitLeft = (coeffs: number[], t: number): number[] => {
    const n = coeffs.length
    const w = [...coeffs]
    const left = [w[0]]
    for (let r = 1; r < n; r++) {
      for (let i = 0; i < n - r; i++) w[i] = (1 - t) * w[i] + t * w[i + 1]
      left.push(w[0])
    }
    return left
  }
  let seg = a > 0 ? splitRight(c, a) : c
  if (b < 1) seg = splitLeft(seg, (b - a) / (1 - a))
  return seg
}

function subdivideSpan(c: number[], k: number): number[] {
  if (k <= 1) return c
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(...bezierSegment(c, i / k, (i + 1) / k))
  return out
}

/** Flatten all spans of a BD, subdividing each span into `k` pieces. */
function flattenSub(bd: BernsteinDecomposition, k: number): number[] {
  const out: number[] = []
  for (const span of bd.controlPointsArray) out.push(...subdivideSpan(span, k))
  return out
}

function unitBD(n: number, j: number, knots: number[]): BernsteinDecomposition {
  const e = new Array(n).fill(0)
  e[j] = 1
  return decomposeToBernstein({ knots, controlPoints: e })
}

// ---------------------------------------------------------------------------
// P₊, P₋ as Bernstein decompositions
// ---------------------------------------------------------------------------
function pPlusMinus(
  uBD: BernsteinDecomposition,
  vBD: BernsteinDecomposition,
  kappaMax: number,
): { pPlus: BernsteinDecomposition; pMinus: BernsteinDecomposition } {
  const up = derivativeBD(uBD)
  const vp = derivativeBD(vBD)
  const N = uBD.multiply(vp).subtract(vBD.multiply(up)).multiplyByScalar(2) // 2(uv'−vu')
  const sigma = uBD.multiply(uBD).add(vBD.multiply(vBD)) // u²+v²
  const bound = sigma.multiply(sigma).multiplyByScalar(kappaMax) // κ_max·σ²
  return { pPlus: bound.subtract(N), pMinus: bound.add(N) }
}

/**
 * Bernstein coefficients of P₊ and P₋ (concatenated). All ≥ 0 ⇒ |κ| ≤ κ_max.
 */
export function phCurvatureBoundCoeffs(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  kappaMax: number,
  subdivisions = 1,
): number[] {
  const uBD = decomposeToBernstein({ knots: uvKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: uvKnots, controlPoints: vCPs })
  const { pPlus, pMinus } = pPlusMinus(uBD, vBD, kappaMax)
  return [...flattenSub(pPlus, subdivisions), ...flattenSub(pMinus, subdivisions)]
}

/** Smallest bound coefficient; ≥ 0 ⇒ |κ| ≤ κ_max is certified on the domain. */
export function phCurvatureMargin(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  kappaMax: number,
  subdivisions = 1,
): number {
  return phCurvatureBoundCoeffs(uCPs, vCPs, uvKnots, kappaMax, subdivisions).reduce(
    (m, c) => Math.min(m, c),
    Infinity,
  )
}

/**
 * Exact Jacobian of the bound coefficients w.r.t. the optimizer variables
 * [x₀, y₀, u₀…, v₀…]. P± depend only on (u,v), so the x₀,y₀ columns are zero.
 * Row order matches phCurvatureBoundCoeffs: P₊ coefficients then P₋.
 */
export function phCurvatureBoundJacobian(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  kappaMax: number,
  subdivisions = 1,
): Matrix {
  const nu = uCPs.length
  const nv = vCPs.length
  const numVars = 2 + nu + nv

  const uBD = decomposeToBernstein({ knots: uvKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: uvKnots, controlPoints: vCPs })
  const up = derivativeBD(uBD)
  const vp = derivativeBD(vBD)
  const sigma = uBD.multiply(uBD).add(vBD.multiply(vBD))

  // One column = ∂(P₊‖P₋ coeffs)/∂var, built from ∂σ²/∂var and ∂N/∂var.
  const column = (dSigma2: BernsteinDecomposition, dN: BernsteinDecomposition): number[] => {
    const bound = dSigma2.multiplyByScalar(kappaMax)
    return [...flattenSub(bound.subtract(dN), subdivisions), ...flattenSub(bound.add(dN), subdivisions)]
  }

  const numC = column(sigma.multiply(sigma).multiplyByScalar(0), uBD.multiply(vp).multiplyByScalar(0)).length
  const cols: number[][] = []
  // x₀, y₀ — zero
  cols.push(new Array(numC).fill(0))
  cols.push(new Array(numC).fill(0))

  for (let j = 0; j < nu; j++) {
    const B = unitBD(nu, j, uvKnots)
    const Bp = derivativeBD(B)
    // ∂σ²/∂u_j = 4 σ u B_j ; ∂N/∂u_j = 2(B_j v' − v B_j')
    const dSigma2 = sigma.multiply(uBD).multiply(B).multiplyByScalar(4)
    const dN = B.multiply(vp).subtract(vBD.multiply(Bp)).multiplyByScalar(2)
    cols.push(column(dSigma2, dN))
  }
  for (let j = 0; j < nv; j++) {
    const B = unitBD(nv, j, uvKnots)
    const Bp = derivativeBD(B)
    // ∂σ²/∂v_j = 4 σ v B_j ; ∂N/∂v_j = 2(u B_j' − B_j u')
    const dSigma2 = sigma.multiply(vBD).multiply(B).multiplyByScalar(4)
    const dN = uBD.multiply(Bp).subtract(B.multiply(up)).multiplyByScalar(2)
    cols.push(column(dSigma2, dN))
  }

  // Transpose columns → Matrix[constraint][variable].
  const J: Matrix = []
  for (let i = 0; i < numC; i++) {
    const row = new Array(numVars)
    for (let v = 0; v < numVars; v++) row[v] = cols[v][i]
    J.push(row)
  }
  return J
}
