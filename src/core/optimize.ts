import { type Matrix, type LU, luFactor, luSolve } from './linalg'

// ============================================================================
// Primal-dual interior-point optimizer (Mehrotra predictor-corrector) on the
// augmented/unreduced KKT system. Solving the unreduced system avoids squaring
// the conditioning near active constraints (the 1/g² blow-up of a plain
// barrier) — the ill-conditioning moves into the benign −W/Y block. Ported and
// cleaned from the sketcher's PrimalDualOptimizer; uses a dense LU solve.
// ============================================================================

export type TerminationReason = 'converged' | 'maxIterations' | 'numericalError'

/**
 * A constrained optimization problem:
 *   minimize f(x)  s.t.  c_i(x) < 0   (feasible side)
 * with per-constraint signs that keep each constraint on its original side
 * (for the curvature problem this preserves every g Bernstein-coefficient sign).
 */
export interface OptimizationProblem {
  readonly numVariables: number
  getVariables(): number[]
  setVariables(x: number[]): void

  computeObjective(): number
  computeObjectiveGradient(): number[]
  computeObjectiveHessian?(): Matrix

  readonly numConstraints: number
  /** First `numEqualityConstraints` constraints are equalities h(x)=0; rest are inequalities. */
  readonly numEqualityConstraints: number
  computeConstraints(): number[]
  computeConstraintJacobian(): Matrix

  /** sign[i] = −1 if c_i was positive initially, +1 if negative (keeps the side). */
  getConstraintSigns(): number[]
  /** Indices of constraints to ignore (allowed to slide). */
  getInactiveConstraints(): Set<number>
  /** Recompute signs / inactive set from the current state (between drag steps). */
  updateConstraintState(): void
}

export interface OptimizerConfig {
  maxIterations: number
  tol: number
  sigma: number
  tau: number
  reg: number
  returnBestFeasible: boolean
}

export interface OptimizerResult {
  variables: number[]
  objective: number
  constraintViolation: number
  iterations: number
  converged: boolean
  terminationReason: TerminationReason
}

const inf = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

export class PrimalDualOptimizer {
  private p: OptimizationProblem
  private cfg: OptimizerConfig

  constructor(problem: OptimizationProblem, config: Partial<OptimizerConfig> = {}) {
    this.p = problem
    this.cfg = {
      maxIterations: config.maxIterations ?? 200,
      tol: config.tol ?? 1e-7,
      sigma: config.sigma ?? 0.2,
      tau: config.tau ?? 0.95,
      reg: config.reg ?? 1e-9,
      returnBestFeasible: config.returnBestFeasible ?? false,
    }
  }

  optimize(): OptimizerResult {
    const p = this.p
    const cfg = this.cfg
    const n = p.numVariables
    const me = p.numEqualityConstraints
    const inactive = p.getInactiveConstraints()
    const ineq: number[] = []
    for (let i = me; i < p.numConstraints; i++) if (!inactive.has(i)) ineq.push(i)
    const ma = ineq.length
    const N = n + me + ma

    let x = p.getVariables()
    const signs = p.getConstraintSigns()
    const wOf = (cAll: number[]) => ineq.map((gi) => -signs[gi] * cAll[gi])
    p.setVariables(x)
    let cAll = p.computeConstraints()
    let w = wOf(cAll)
    let y = w.map(() => 1)
    const lam = new Array<number>(me).fill(0)

    let best = { x: [...x], f: Infinity }
    let reason: TerminationReason = 'maxIterations'
    let iter = 0

    for (; iter < cfg.maxIterations; iter++) {
      p.setVariables(x)
      cAll = p.computeConstraints()
      const Jall = p.computeConstraintJacobian()
      const gradf = p.computeObjectiveGradient()
      const H = p.computeObjectiveHessian ? p.computeObjectiveHessian() : null
      const h = cAll.slice(0, me)
      const Jh = Jall.slice(0, me)
      w = wOf(cAll)
      const Jw = ineq.map((gi) => Jall[gi].map((v) => -signs[gi] * v))

      const rd = gradf.slice()
      for (let e = 0; e < me; e++) for (let a = 0; a < n; a++) rd[a] -= lam[e] * Jh[e][a]
      for (let k = 0; k < ma; k++) for (let a = 0; a < n; a++) rd[a] -= y[k] * Jw[k][a]

      const dualFeas = inf(rd)
      const priFeas = me ? inf(h) : 0
      const comp = ma ? w.reduce((s, wi, i) => s + wi * y[i], 0) / ma : 0
      const feasible = ma === 0 || Math.min(...w) > 0
      const fval = p.computeObjective()
      if (feasible && fval < best.f) best = { x: [...x], f: fval }
      if (dualFeas < cfg.tol && priFeas < cfg.tol && comp < cfg.tol) {
        reason = 'converged'
        iter++
        break
      }

      // Augmented KKT matrix: [ H+δ  Jhᵀ  Jwᵀ ; Jh  -δ  0 ; Jw  0  -W/Y-δ ]
      const M: Matrix = Array.from({ length: N }, () => new Array<number>(N).fill(0))
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) M[a][b] = H ? H[a][b] : a === b ? 1 : 0
      for (let a = 0; a < n; a++) M[a][a] += cfg.reg
      for (let e = 0; e < me; e++) for (let a = 0; a < n; a++) { M[a][n + e] = Jh[e][a]; M[n + e][a] = Jh[e][a] }
      for (let k = 0; k < ma; k++) for (let a = 0; a < n; a++) { M[a][n + me + k] = Jw[k][a]; M[n + me + k][a] = Jw[k][a] }
      for (let e = 0; e < me; e++) M[n + e][n + e] = -cfg.reg
      for (let k = 0; k < ma; k++) M[n + me + k][n + me + k] = -w[k] / y[k] - cfg.reg

      const fact: LU | null = luFactor(M)
      if (!fact) { reason = 'numericalError'; iter++; break }

      const baseRhs = new Array<number>(N).fill(0)
      for (let a = 0; a < n; a++) baseRhs[a] = -rd[a]
      for (let e = 0; e < me; e++) baseRhs[n + e] = -h[e]

      // predictor (affine, μ=0)
      const rhsAff = [...baseRhs]
      for (let k = 0; k < ma; k++) rhsAff[n + me + k] = -w[k]
      const zAff = luSolve(fact, rhsAff)
      const dxA = zAff.slice(0, n)
      const dyA = zAff.slice(n + me).map((v) => -v)
      const dwA = Jw.map((row) => row.reduce((s, v, a) => s + v * dxA[a], 0))
      let apA = 1
      let adA = 1
      for (let k = 0; k < ma; k++) {
        if (dwA[k] < 0) apA = Math.min(apA, -w[k] / dwA[k])
        if (dyA[k] < 0) adA = Math.min(adA, -y[k] / dyA[k])
      }
      let muAff = 0
      for (let k = 0; k < ma; k++) muAff += (w[k] + apA * dwA[k]) * (y[k] + adA * dyA[k])
      muAff = ma ? muAff / ma : 0
      const sigma = comp > 0 ? Math.min(1, Math.max(0, (muAff / comp) ** 3)) : 0

      // corrector
      const rhs = [...baseRhs]
      for (let k = 0; k < ma; k++) rhs[n + me + k] = -(w[k] - (sigma * comp) / y[k] + (dwA[k] * dyA[k]) / y[k])
      const z = luSolve(fact, rhs)

      const dx = z.slice(0, n)
      const dlam = z.slice(n, n + me).map((v) => -v)
      const dy = z.slice(n + me).map((v) => -v)

      // fraction-to-boundary
      let ap = 1
      let ad = 1
      for (let k = 0; k < ma; k++) {
        const dw = Jw[k].reduce((s, v, a) => s + v * dx[a], 0)
        if (dw < 0) ap = Math.min(ap, (-cfg.tau * w[k]) / dw)
        if (dy[k] < 0) ad = Math.min(ad, (-cfg.tau * y[k]) / dy[k])
      }
      // nonlinear safeguard: keep all slacks > 0 at the actual trial point
      let acc = false
      for (let t = 0; t < 40; t++) {
        const xn = x.map((v, i) => v + ap * dx[i])
        p.setVariables(xn)
        const wn = wOf(p.computeConstraints())
        if (ma === 0 || Math.min(...wn) > 0) { x = xn; acc = true; break }
        ap *= 0.5
      }
      if (!acc) { reason = 'numericalError'; iter++; break }
      for (let e = 0; e < me; e++) lam[e] += ad * dlam[e]
      for (let k = 0; k < ma; k++) y[k] = Math.max(1e-12, y[k] + ad * dy[k])
      if (ap * inf(dx) < 1e-12 && dualFeas < 1e-3) { reason = 'converged'; iter++; break }
    }

    const useBest = cfg.returnBestFeasible && best.f < Infinity
    const finalX = useBest ? best.x : x
    p.setVariables(finalX)
    const cFinal = p.computeConstraints()
    const sg = p.getConstraintSigns()
    let viol = 0
    for (let i = me; i < p.numConstraints; i++) if (!inactive.has(i)) viol = Math.max(viol, sg[i] * cFinal[i])
    for (let i = 0; i < me; i++) viol = Math.max(viol, Math.abs(cFinal[i]))
    return {
      variables: [...finalX],
      objective: p.computeObjective(),
      constraintViolation: viol,
      iterations: iter,
      converged: reason === 'converged',
      terminationReason: reason,
    }
  }
}
