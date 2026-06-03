import type { OptimizationProblem, OptimizerConfig, OptimizerResult } from './optimize'
import { symBandZero, symBandAdd, symBandAddDiag, ldlFactorBand, ldlSolveBand } from './banded'

// ============================================================================
// Log-barrier interior-point optimizer with a BANDED Newton solve.
//
//   minimize f(p) − μ Σ_j log(w_j),   w_j = −sign_j · c_j(p) > 0   (the slacks)
//
// Gauss-Newton Hessian: M = H + Σ_j (μ/w_j²) ∇c_j ∇c_jᵀ. H is diagonal and each
// ∇c_j is local (B-spline support), so in the INTERLEAVED variable ordering
// [x₀,y₀,x₁,y₁,…] every constraint touches a contiguous block of variables and
// M is symmetric-banded with half-width ≈ 2(d+1). Factorizing it costs O(n·b²)
// — linear in the number of control points — versus the dense O(n³) KKT.
//
// Same OptimizationProblem interface and OptimizerResult as PrimalDualOptimizer,
// so the two are interchangeable behind slideCurve.
// ============================================================================

const inf = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)

export class BarrierOptimizer {
  private p: OptimizationProblem
  private cfg: OptimizerConfig

  constructor(problem: OptimizationProblem, config: Partial<OptimizerConfig> = {}) {
    this.p = problem
    this.cfg = {
      maxIterations: config.maxIterations ?? 20,
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
    const inactive = p.getInactiveConstraints()
    const me = p.numEqualityConstraints
    const ineq: number[] = []
    for (let i = me; i < p.numConstraints; i++) if (!inactive.has(i)) ineq.push(i)
    const ma = ineq.length
    const signs = p.getConstraintSigns()

    // Interleave [x_i, y_i] so each constraint's variable footprint is contiguous.
    // Problem var v: v<nCP → x_v → 2v ; v≥nCP → y_{v−nCP} → 2(v−nCP)+1.
    const perm = (v: number) => (v < nCP ? 2 * v : 2 * (v - nCP) + 1)

    let x = p.getVariables()
    // Slacks at a GIVEN point (sets the problem to it). Must take the point as
    // an argument — a closure over `x` would evaluate the line-search trial at
    // the wrong (old) point.
    const slacksAt = (xx: number[]) => {
      p.setVariables(xx)
      const c = p.computeConstraints()
      return ineq.map((j) => -signs[j] * c[j])
    }
    let w = slacksAt(x)
    if (ma > 0 && Math.min(...w) <= 0) {
      // Start not strictly feasible (a constraint sits on the boundary). Nothing
      // safe to do from here; hand back the start.
      return result(p, x, 'numericalError', false, me, ineq, signs)
    }

    // Per-active-constraint sparse rows {idx, val} at the current point. Uses the
    // O(n·d²) LOCAL Jacobian when the problem provides it (linear assembly); else
    // gathers nonzeros from the full-width Jacobian (quadratic fallback).
    const withLocal = p as OptimizationProblem & {
      computeConstraintJacobianLocal?: () => { vars: number[]; vals: number[] }[] | null
    }
    const jacRows = (): { idx: number[]; val: number[] }[] => {
      const local = withLocal.computeConstraintJacobianLocal?.()
      if (local) return local.map((r) => ({ idx: r.vars, val: r.vals }))
      const J = p.computeConstraintJacobian()
      return ineq.map((j) => {
        const idx: number[] = []
        const val: number[] = []
        const row = J[j]
        for (let v = 0; v < nVar; v++) if (row[v] !== 0) { idx.push(v); val.push(row[v]) }
        return { idx, val }
      })
    }

    // Bandwidth from the Jacobian sparsity (max interleaved spread within a row).
    let b = 1
    {
      p.setVariables(x)
      for (const r of jacRows()) {
        let lo = Infinity
        let hi = -Infinity
        for (const v of r.idx) {
          const q = perm(v)
          if (q < lo) lo = q
          if (q > hi) hi = q
        }
        if (hi >= lo) b = Math.max(b, hi - lo)
      }
    }

    let best = { x: [...x], f: Infinity }
    const recordBest = () => {
      p.setVariables(x)
      const wv = slacksAt(x)
      if (ma === 0 || Math.min(...wv) > 0) {
        const f = p.computeObjective()
        if (f < best.f) best = { x: [...x], f }
      }
    }
    recordBest()

    // μ schedule: start near the average complementarity, drive toward 0.
    let mu = ma > 0 ? Math.max(1e-3, w.reduce((s, wi) => s + wi, 0) / ma) : 0
    let iter = 0
    let reason: OptimizerResult['terminationReason'] = 'maxIterations'

    for (; iter < cfg.maxIterations; iter++) {
      p.setVariables(x)
      const gradf = p.computeObjectiveGradient()
      const H = p.computeObjectiveHessian ? p.computeObjectiveHessian() : null
      const rows = jacRows()
      w = slacksAt(x)
      if (ma > 0 && Math.min(...w) <= 0) break

      // Floor the slack used in the barrier WEIGHT only (not the feasibility
      // test). A near-zero slack from a noise-level / near-binding coefficient
      // would otherwise make μ/w² astronomically large and pin the point; the
      // floor caps that stiffness, and the fraction-to-boundary line search
      // (which uses the true slack) still keeps every constraint feasible.
      const maxW = Math.max(...w, 1e-12)
      const wFloor = 1e-3 * maxW
      const wEff = w.map((wi) => Math.max(wi, wFloor))

      // M = H + Σ_j (μ/w̃_j²) J[j] J[j]ᵀ  (banded, interleaved order).
      const M = symBandZero(nVar, b)
      for (let v = 0; v < nVar; v++) {
        const hv = H ? H[v][v] : 1
        symBandAddDiag(M, perm(v), hv + cfg.reg)
      }
      // rhs = −gradf − μ Σ_j (sign_j / w̃_j) J[j]   (negated barrier gradient)
      const rhs = new Array<number>(nVar).fill(0)
      for (let v = 0; v < nVar; v++) rhs[perm(v)] = -gradf[v]

      for (let k = 0; k < ma; k++) {
        const j = ineq[k]
        const idx = rows[k].idx
        const val = rows[k].val
        const Dj = mu / (wEff[k] * wEff[k])
        const gj = mu * (signs[j] / wEff[k])
        for (let a = 0; a < idx.length; a++) {
          rhs[perm(idx[a])] -= gj * val[a]
          for (let bb = 0; bb < idx.length; bb++) {
            symBandAdd(M, perm(idx[a]), perm(idx[bb]), Dj * val[a] * val[bb])
          }
        }
      }

      if (!ldlFactorBand(M)) { reason = 'numericalError'; iter++; break }
      const dPerm = ldlSolveBand(M, rhs)
      const dx = new Array<number>(nVar)
      for (let v = 0; v < nVar; v++) dx[v] = dPerm[perm(v)]

      // Barrier objective B = f − μ Σ log(w_j). Line search backtracks α until
      // the trial is feasible AND B decreases — so an overshoot into a boundary
      // is rejected and a smaller step that makes progress is taken (a pure
      // feasibility check would accept a no-progress step and stall).
      const bMu = mu
      const Bof = (wv: number[]) => p.computeObjective() - bMu * wv.reduce((s, wi) => s + Math.log(wi), 0)
      const Bcur = Bof(w)
      let alpha = 1
      let accepted = false
      for (let t = 0; t < 50; t++) {
        const xn = x.map((v, i) => v + alpha * dx[i])
        p.setVariables(xn)
        const wn = slacksAt(xn)
        if ((ma === 0 || Math.min(...wn) > 0) && Bof(wn) <= Bcur + 1e-9 * Math.abs(Bcur)) {
          x = xn
          accepted = true
          break
        }
        alpha *= 0.5
      }
      if (!accepted) {
        // Centered for this μ (no improving step) → tighten the barrier.
        if (mu < cfg.tol) { reason = 'converged'; iter++; break }
        mu *= cfg.sigma
        continue
      }
      recordBest()
      // Reduce μ once the step is small (≈ centered on the current path).
      if (alpha * inf(dx) < 1e-6 * (1 + inf(x))) mu *= cfg.sigma
      if (mu < cfg.tol && alpha * inf(dx) < 1e-9 * (1 + inf(x))) { reason = 'converged'; iter++; break }
    }

    const finalX = cfg.returnBestFeasible && best.f < Infinity ? best.x : x
    return result(p, finalX, reason, reason === 'converged', me, ineq, signs)
  }
}

function result(
  p: OptimizationProblem,
  x: number[],
  reason: OptimizerResult['terminationReason'],
  converged: boolean,
  me: number,
  ineq: number[],
  signs: number[],
): OptimizerResult {
  p.setVariables(x)
  const c = p.computeConstraints()
  let viol = 0
  for (const j of ineq) viol = Math.max(viol, signs[j] * c[j])
  for (let i = 0; i < me; i++) viol = Math.max(viol, Math.abs(c[i]))
  return {
    variables: [...x],
    objective: p.computeObjective(),
    constraintViolation: viol,
    iterations: 0,
    converged,
    terminationReason: reason,
  }
}
