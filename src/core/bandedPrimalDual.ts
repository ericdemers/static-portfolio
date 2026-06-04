import type { OptimizationProblem, OptimizerConfig, OptimizerResult } from './optimize'
import { symBandZero, symBandAdd, symBandAddDiag, ldlFactorBand, ldlSolveBand } from './banded'

// ============================================================================
// Mehrotra predictor-corrector primal-dual — identical algorithm to the dense
// PrimalDualOptimizer, but the per-iteration KKT is solved BANDED instead of
// dense, so it's linear in the number of control points.
//
// We factor the AUGMENTED KKT directly (not the normal equations):
//
//   K = [ H+δ    Jwᵀ        ]   (H+δ positive-definite, −(W/Y+δ) negative-
//       [ Jw    −(W/Y+δ)    ]    definite ⇒ K is QUASI-DEFINITE)
//
// A quasi-definite matrix has a stable LDLᵀ with no pivoting (D mixes signs),
// which our banded LDLᵀ already does. This avoids the condition-number squaring
// of the normal-equations form (κ(JᵀDJ)=κ(J)²) — so it is bit-identical to the
// dense solver, just structure-exploiting. Variables and constraints are ordered
// by parameter position so K is banded (each g coeff couples only to the d+1
// control points of its span). Factor once per iteration, solve twice
// (predictor + corrector).
//
// Requires: no equality constraints, empty optimizer-inactive set, and a
// control-point problem with a local Jacobian (open planar curvature).
// ============================================================================

const inf = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

export class BandedPrimalDualOptimizer {
  private p: OptimizationProblem
  private cfg: OptimizerConfig

  constructor(problem: OptimizationProblem, config: Partial<OptimizerConfig> = {}) {
    this.p = problem
    this.cfg = {
      maxIterations: config.maxIterations ?? 80,
      tol: config.tol ?? 1e-7,
      sigma: config.sigma ?? 0.2,
      tau: config.tau ?? 0.95,
      reg: config.reg ?? 1e-9,
      returnBestFeasible: config.returnBestFeasible ?? true,
    }
  }

  optimize(): OptimizerResult {
    const p = this.p
    const cfg = this.cfg
    const nVar = p.numVariables
    const nCP = nVar / 2
    const ma = p.numConstraints - p.numEqualityConstraints
    const signs = p.getConstraintSigns()
    const reg = cfg.reg
    const N = nVar + ma // augmented size

    const withLocal = p as OptimizationProblem & {
      computeConstraintJacobianLocal?: () => { vars: number[]; vals: number[] }[] | null
    }
    const jacRows = (): { idx: number[]; val: number[] }[] => {
      const local = withLocal.computeConstraintJacobianLocal?.()
      if (local) return local.map((r) => ({ idx: r.vars, val: r.vals }))
      const J = p.computeConstraintJacobian()
      return J.map((row) => {
        const idx: number[] = []
        const val: number[] = []
        for (let v = 0; v < nVar; v++) if (row[v] !== 0) { idx.push(v); val.push(row[v]) }
        return { idx, val }
      })
    }

    // Sparsity (fixed across the solve) → a position-ordered permutation that
    // makes the augmented KKT banded. Augmented index space: vars 0..nVar−1,
    // constraints nVar..nVar+ma−1. Position of a var = its control point; of a
    // constraint = the mean control point of its support (so it sits among them).
    const rows0 = jacRows()
    const pos = new Array<number>(N)
    for (let v = 0; v < nVar; v++) {
      const cp = v < nCP ? v : v - nCP
      pos[v] = cp + (v < nCP ? 0 : 0.25) // x before y at the same control point
    }
    for (let k = 0; k < ma; k++) {
      const idx = rows0[k].idx
      let s = 0
      for (const v of idx) s += v < nCP ? v : v - nCP
      pos[nVar + k] = (idx.length ? s / idx.length : 0) + 0.5 // among its support CPs
    }
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => pos[a] - pos[b] || a - b)
    const pi = new Array<number>(N) // augmented index → banded index
    order.forEach((augIdx, rank) => (pi[augIdx] = rank))

    // Bandwidth: each constraint couples to its support vars + itself.
    let b = 1
    for (let k = 0; k < ma; k++) {
      let lo = pi[nVar + k]
      let hi = pi[nVar + k]
      for (const v of rows0[k].idx) {
        const q = pi[v]
        if (q < lo) lo = q
        if (q > hi) hi = q
      }
      b = Math.max(b, hi - lo)
    }

    let x = p.getVariables()
    const wOf = (c: number[]) => c.map((ck, k) => -signs[k] * ck)
    const slacksAt = (xx: number[]) => {
      p.setVariables(xx)
      return wOf(p.computeConstraints())
    }
    let w = slacksAt(x)
    const y = w.map(() => 1)

    let best = { x: [...x], f: Infinity }
    let reason: OptimizerResult['terminationReason'] = 'maxIterations'
    let iter = 0

    for (; iter < cfg.maxIterations; iter++) {
      p.setVariables(x)
      w = wOf(p.computeConstraints())
      const gradf = p.computeObjectiveGradient()
      const H = p.computeObjectiveHessian ? p.computeObjectiveHessian() : null
      const rows = jacRows()

      // rd = ∇f − Σ_k y_k Jw_k,  Jw_k[v] = −sign_k · val.
      const rd = gradf.slice()
      for (let k = 0; k < ma; k++) {
        const { idx, val } = rows[k]
        const c = y[k] * signs[k]
        for (let a = 0; a < idx.length; a++) rd[idx[a]] += c * val[a]
      }
      const dualFeas = inf(rd)
      const comp = ma ? w.reduce((s, wi, i) => s + wi * y[i], 0) / ma : 0
      const feasible = ma === 0 || Math.min(...w) > 0
      const fval = p.computeObjective()
      if (feasible && fval < best.f) best = { x: [...x], f: fval }
      if (dualFeas < cfg.tol && comp < cfg.tol) { reason = 'converged'; iter++; break }

      // Assemble the augmented KKT, banded via π.
      const K = symBandZero(N, b)
      for (let v = 0; v < nVar; v++) symBandAddDiag(K, pi[v], (H ? H[v][v] : 1) + reg)
      for (let k = 0; k < ma; k++) {
        symBandAddDiag(K, pi[nVar + k], -w[k] / y[k] - reg)
        const { idx, val } = rows[k]
        for (let a = 0; a < idx.length; a++) {
          symBandAdd(K, pi[idx[a]], pi[nVar + k], -signs[k] * val[a]) // Jw_k[v]
        }
      }
      if (!ldlFactorBand(K)) { reason = 'numericalError'; iter++; break }

      // Solve K z = rhs (rhs in augmented order, permuted in/out).
      const solveAug = (rConstraint: number[]): { dx: number[]; dy: number[] } => {
        const rhsP = new Array<number>(N).fill(0)
        for (let v = 0; v < nVar; v++) rhsP[pi[v]] = -rd[v]
        for (let k = 0; k < ma; k++) rhsP[pi[nVar + k]] = rConstraint[k]
        const zP = ldlSolveBand(K, rhsP)
        const dx = new Array<number>(nVar)
        for (let v = 0; v < nVar; v++) dx[v] = zP[pi[v]]
        const dy = new Array<number>(ma)
        for (let k = 0; k < ma; k++) dy[k] = -zP[pi[nVar + k]]
        return { dx, dy }
      }
      const Jdot = (k: number, dx: number[]): number => {
        const { idx, val } = rows[k]
        let s = 0
        for (let a = 0; a < idx.length; a++) s += -signs[k] * val[a] * dx[idx[a]]
        return s
      }

      // Predictor (affine, μ=0): constraint rhs = −w.
      const pred = solveAug(w.map((wi) => -wi))
      const dxA = pred.dx
      const dyA = pred.dy
      const dwA = new Array<number>(ma)
      for (let k = 0; k < ma; k++) dwA[k] = Jdot(k, dxA)
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

      // Corrector: constraint rhs = −(w − σμ/y + dwA·dyA/y).
      const rCorr = new Array<number>(ma)
      for (let k = 0; k < ma; k++) rCorr[k] = -(w[k] - (sigma * comp) / y[k] + (dwA[k] * dyA[k]) / y[k])
      const corr = solveAug(rCorr)
      const dx = corr.dx
      const dy = corr.dy
      const dw = new Array<number>(ma)
      for (let k = 0; k < ma; k++) dw[k] = Jdot(k, dx)

      // Fraction-to-boundary.
      let ap = 1
      let ad = 1
      for (let k = 0; k < ma; k++) {
        if (dw[k] < 0) ap = Math.min(ap, (-cfg.tau * w[k]) / dw[k])
        if (dy[k] < 0) ad = Math.min(ad, (-cfg.tau * y[k]) / dy[k])
      }
      // Nonlinear safeguard: keep all slacks > 0 at the actual trial point.
      let acc = false
      for (let t = 0; t < 40; t++) {
        const xn = x.map((v, i) => v + ap * dx[i])
        if (ma === 0 || Math.min(...slacksAt(xn)) > 0) { x = xn; acc = true; break }
        ap *= 0.5
      }
      if (!acc) { reason = 'numericalError'; iter++; break }
      for (let k = 0; k < ma; k++) y[k] = Math.max(1e-12, y[k] + ad * dy[k])
      if (ap * inf(dx) < 1e-12 && dualFeas < 1e-3) { reason = 'converged'; iter++; break }
    }

    const useBest = cfg.returnBestFeasible && best.f < Infinity
    const finalX = useBest ? best.x : x
    p.setVariables(finalX)
    const cFinal = p.computeConstraints()
    let viol = 0
    for (let k = 0; k < ma; k++) viol = Math.max(viol, signs[k] * cFinal[k])
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
