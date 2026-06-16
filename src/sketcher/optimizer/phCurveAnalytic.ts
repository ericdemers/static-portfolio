// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Exact (analytic) derivatives of a polynomial PH curve's control points w.r.t.
 * the optimizer variables [x₀, y₀, u₀…, v₀…], via Bernstein algebra — no finite
 * differences. The curve control points are
 *   P = origin + ∫ r',   r' = (u²−v², 2uv),
 * a quadratic map of (u,v); integration and recomposition are linear, so each
 * directional derivative is exact:
 *   ∂(u²−v²)/∂u_j = 2 u B_j,   ∂(2uv)/∂u_j = 2 v B_j,
 *   ∂(u²−v²)/∂v_j = −2 v B_j,  ∂(2uv)/∂v_j = 2 u B_j,
 *   ∂P/∂x₀ = (1,0),  ∂P/∂y₀ = (0,1).
 */

import {
  decomposeToBernstein,
  integrateBD,
  recomposeBD,
  type BernsteinDecomposition,
} from './algebra'
import { curveBreakpointContinuities } from './phCurve'

/** Per-variable derivative of the curve's control points. */
export interface CPDerivative {
  dx: number[]
  dy: number[]
}

function unitBD(n: number, j: number, knots: number[]): BernsteinDecomposition {
  const e = new Array(n).fill(0)
  e[j] = 1
  return decomposeToBernstein({ knots, controlPoints: e })
}

/**
 * Jacobian of the control points w.r.t. [x₀, y₀, u₀…, v₀…] (same order as
 * PHCurveProblem.getVariables). Returns one {dx,dy} per variable.
 */
export function phControlPointJacobian(
  uCPs: number[],
  vCPs: number[],
  uvKnots: number[],
  uvDegree: number,
): CPDerivative[] {
  const uBD = decomposeToBernstein({ knots: uvKnots, controlPoints: uCPs })
  const vBD = decomposeToBernstein({ knots: uvKnots, controlPoints: vCPs })
  // Per-breakpoint curve continuity (same rule as computePHCurveFromUV), so the
  // recomposition — and hence the derivative — lines up with the curve itself,
  // even when generator knots have mixed multiplicity.
  const mc = uBD.numSpans > 1 ? curveBreakpointContinuities(uBD.distinctKnots, uvKnots, uvDegree) : undefined
  const recomp = (bd: BernsteinDecomposition) => recomposeBD(bd, mc).controlPoints

  // Number of control points (from the actual hodograph integration).
  const nCP = recomp(integrateBD(uBD.multiply(uBD).subtract(vBD.multiply(vBD)), 0)).length
  const nu = uCPs.length
  const nv = vCPs.length

  const out: CPDerivative[] = []
  // x₀, y₀ shift every control point uniformly.
  out.push({ dx: new Array(nCP).fill(1), dy: new Array(nCP).fill(0) })
  out.push({ dx: new Array(nCP).fill(0), dy: new Array(nCP).fill(1) })

  for (let j = 0; j < nu; j++) {
    const B = unitBD(nu, j, uvKnots)
    const dxPrime = uBD.multiply(B).multiplyByScalar(2) // ∂(u²−v²)/∂u_j = 2 u B_j
    const dyPrime = B.multiply(vBD).multiplyByScalar(2) // ∂(2uv)/∂u_j   = 2 v B_j
    out.push({ dx: recomp(integrateBD(dxPrime, 0)), dy: recomp(integrateBD(dyPrime, 0)) })
  }
  for (let j = 0; j < nv; j++) {
    const B = unitBD(nv, j, uvKnots)
    const dxPrime = vBD.multiply(B).multiplyByScalar(-2) // ∂(−v²)/∂v_j = −2 v B_j
    const dyPrime = uBD.multiply(B).multiplyByScalar(2) //  ∂(2uv)/∂v_j =  2 u B_j
    out.push({ dx: recomp(integrateBD(dxPrime, 0)), dy: recomp(integrateBD(dyPrime, 0)) })
  }
  return out
}
