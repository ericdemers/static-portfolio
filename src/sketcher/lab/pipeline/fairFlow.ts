// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Linear fairing flow: gradient descent on a quadratic fairness energy.
 *
 * For a fairness energy E(P) = Pᵀ M P (M = strain/jerk/snap Gram matrix, the
 * integral of the k-th basis-derivative products over a window), the gradient
 * is LINEAR: ∇E = 2 M P. So gradient descent
 *
 *     P_F ← P_F − η (M P)_F        (only the free CPs F move; rest fixed)
 *
 * is descent on a CONVEX quadratic — it converges to the unique minimum-energy
 * shape compatible with the fixed (outside) control points. No nonconvex
 * stalling or singularities, unlike the nonlinear g-flatten. This is the linear
 * surrogate: snap (4th-derivative) energy drives the curve toward locally cubic
 * pieces → smoothly varying curvature → curvature extrema merge.
 */

/** Matrix–vector product M·v (M square, length n). */
export function gramTimes(M: number[][], v: number[]): number[] {
  const n = v.length
  const out = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    const Mi = M[i]
    let s = 0
    for (let j = 0; j < n; j++) s += Mi[j] * v[j]
    out[i] = s
  }
  return out
}

/** Quadratic energy vᵀ M v. */
export function fairEnergy(M: number[][], v: number[]): number {
  const Mv = gramTimes(M, v)
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * Mv[i]
  return s
}

/**
 * A stable gradient-descent step size for descent on Pᵀ M P over the rows in F.
 * GD on a convex quadratic is stable for η < 2/λ_max; the Gershgorin bound
 * λ_max ≤ max_i Σ_j |M_ij| gives a safe η = 1/that.
 */
export function stableEta(M: number[][], F: number[]): number {
  let gmax = 0
  for (const i of F) {
    let s = 0
    for (let j = 0; j < M.length; j++) s += Math.abs(M[i][j])
    gmax = Math.max(gmax, s)
  }
  return gmax > 0 ? 1 / gmax : 0
}

/**
 * IMPLICIT fairing step (backward-Euler of dP/dt = −MP), solved directly.
 *
 * The snap Gram is catastrophically ill-conditioned (λ_max ~ 1e10), so explicit
 * gradient descent is hopeless. But the problem is linear, so we solve the
 * implicit step instead — unconditionally stable, a few Cholesky solves:
 *
 *     (M_FF + (1/τ) I) P_F = (1/τ) P_F^old − M_FO P_O      (P_O = fixed CPs)
 *
 * Larger τ = bigger flow step. From the original shape, sweeping τ: 0 → ∞ moves
 * the free CPs from the drawn curve to the minimum-snap shape compatible with
 * the fixed frame. `choleskySolve` is injected to avoid a hard dep here.
 */
export function implicitFairSolve(
  M: number[][],
  x: number[],
  y: number[],
  F: number[],
  tau: number,
  choleskySolve: (A: number[][], b: number[]) => { success: boolean; x: number[] },
): { x: number[]; y: number[] } {
  const m = F.length
  if (m === 0 || tau <= 0) return { x: [...x], y: [...y] }
  const inF = new Array<boolean>(M.length).fill(false)
  for (const f of F) inF[f] = true
  const A: number[][] = []
  for (let a = 0; a < m; a++) {
    A[a] = new Array<number>(m)
    for (let b = 0; b < m; b++) A[a][b] = M[F[a]][F[b]] + (a === b ? 1 / tau : 0)
  }
  const rhsX = new Array<number>(m), rhsY = new Array<number>(m)
  for (let a = 0; a < m; a++) {
    const f = F[a]
    let fixX = 0, fixY = 0
    for (let o = 0; o < M.length; o++) if (!inF[o]) { fixX += M[f][o] * x[o]; fixY += M[f][o] * y[o] }
    rhsX[a] = x[f] / tau - fixX
    rhsY[a] = y[f] / tau - fixY
  }
  const sX = choleskySolve(A, rhsX), sY = choleskySolve(A, rhsY)
  const nx = [...x], ny = [...y]
  if (sX.success) for (let a = 0; a < m; a++) nx[F[a]] = sX.x[a]
  if (sY.success) for (let a = 0; a < m; a++) ny[F[a]] = sY.x[a]
  return { x: nx, y: ny }
}

/** One explicit gradient-descent step; only the free CPs F move. */
export function fairFlowStep(
  M: number[][],
  x: number[],
  y: number[],
  F: number[],
  eta: number,
): { x: number[]; y: number[] } {
  const gx = gramTimes(M, x)
  const gy = gramTimes(M, y)
  const nx = [...x], ny = [...y]
  for (const f of F) { nx[f] -= eta * gx[f]; ny[f] -= eta * gy[f] }
  return { x: nx, y: ny }
}
