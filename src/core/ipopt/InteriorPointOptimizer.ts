/**
 * Interior Point Optimizer with IPOPT-inspired features
 *
 * This optimizer implements the barrier method with trust region,
 * enhanced with key techniques from IPOPT:
 *
 * 1. Second-Order Correction (SOC):
 *    When Newton step violates constraints, project back to feasibility
 *    using the constraint Jacobian.
 *
 * 2. Feasibility Restoration:
 *    When stuck, switch to minimizing constraint violation to find
 *    a feasible direction.
 *
 * 3. Filter Method:
 *    Accept steps that improve either objective OR constraint violation,
 *    rather than requiring improvement in a merit function.
 *
 * 4. Watchdog Technique:
 *    Allow occasional non-monotone steps to escape local minima.
 *
 * References:
 * - Wächter & Biegler, "On the Implementation of an Interior-Point Filter
 *   Line-Search Algorithm for Large-Scale Nonlinear Programming", 2006
 * - Nocedal & Wright, "Numerical Optimization", 2nd edition
 * - Boyd & Vandenberghe, "Convex Optimization"
 */

import {
  zeros,
  clone,
  add,
  subtract,
  scale,
  dot,
  norm2,
  type Matrix,
  identityMatrix,
  matScale,
  matVec,
  atDiagA,
  choleskySolve,
  solveTrustRegion,
  minNormSolve,
} from './linearAlgebra'
import { minNormSolveSparse } from './sparseSym'

import type {
  OptimizationProblem,
  OptimizerConfig,
  OptimizerResult,
  OptimizationState,
} from './types'

import { TerminationReason, defaultConfig } from './types'

/** When enabled, accumulate the inequality barrier-Hessian term J^T·diag(1/f²)·J
 *  by each constraint's local support block (symmetric: lower then mirror) instead
 *  of the dense atDiagA — O(active·d²) vs O(active·n²). Provably BIT-IDENTICAL to
 *  atDiagA (verified: Hessian Δ=0 and 0 diff over 24 real drags), so it's purely a
 *  speedup (~4× at larger CP counts). */
export const IP_LOCALITY = { enabled: true }

/** When enabled, the Second-Order Correction's min-norm projection
 *  x = Aᵀ(A·Aᵀ + reg·I)⁻¹·b is solved with a banded LDLᵀ on the constraint Gram
 *  A·Aᵀ (compact-support constraints ⇒ banded) instead of dense matMat+Cholesky.
 *  SOC was measured at ~97% of a high-CP drag (O(N³)); this brings it to O(N·band²).
 *  Numerically equal to minNormSolve (same regularized normal equations). */
export const IP_SPARSE_SOC = { enabled: true }

// ============================================================================
// Interior Point Optimizer
// ============================================================================

export class InteriorPointOptimizer {
  private config: OptimizerConfig
  private problem: OptimizationProblem
  private state: OptimizationState
  /** Adaptive trust radius scaled by initial variable magnitude */
  private adaptiveInitialTR: number
  private adaptiveMaxTR: number

  // BFGS state for Lagrangian Hessian approximation
  private bfgsHessian: Matrix = []
  private prevX: number[] | null = null
  private prevObjGrad: number[] | null = null
  private prevJacobian: Matrix | null = null
  private prevSigns: number[] | null = null

  constructor(problem: OptimizationProblem, config: Partial<OptimizerConfig> = {}) {
    this.problem = problem
    this.config = { ...defaultConfig, ...config }

    // Compute adaptive trust radius: scale by ||x₀||_∞
    // For normalized problems (variables ~O(1)), this gives ~1.0 (same as default).
    // For unnormalized problems (variables ~O(100)), this scales up proportionally.
    const x0 = problem.getVariables()
    let xInfNorm = 1
    for (let i = 0; i < x0.length; i++) {
      const abs = Math.abs(x0[i])
      if (abs > xInfNorm) xInfNorm = abs
    }
    this.adaptiveInitialTR = this.config.initialTrustRadius * xInfNorm
    this.adaptiveMaxTR = this.config.maxTrustRadius * xInfNorm

    this.state = this.initializeState()

    if (this.config.enableBFGS) {
      this.resetBFGS()
      // Store initial point data for first BFGS update
      this.prevX = clone(this.state.x)
      this.prevObjGrad = problem.computeObjectiveGradient()
      this.prevJacobian = problem.computeConstraintJacobian()
      this.prevSigns = clone(this.state.signs)
    }
  }

  // ==========================================================================
  // Main Optimization Loop
  // ==========================================================================

  optimize(): OptimizerResult {
    const { config, state } = this

    if (config.verbose) {
      console.log('Starting Interior Point Optimization')
      console.log(`Variables: ${this.problem.numVariables}, Constraints: ${this.problem.numConstraints}`)
    }

    // Outer loop: decrease barrier parameter until convergence
    while (10 / state.t > config.barrierTolerance) {
      if (state.iteration >= config.maxIterations) {
        return this.makeResult(TerminationReason.MaxIterations)
      }

      // Inner loop: optimize for fixed t
      const innerResult = this.innerLoop()

      if (innerResult === 'trust_radius_too_small') {
        // Try feasibility restoration
        if (config.enableFeasibilityRestoration) {
          const restored = this.feasibilityRestoration()
          if (restored) {
            // Reset and continue
            if (config.enableBFGS) this.resetBFGS()
            state.delta = this.adaptiveInitialTR * 0.1
            state.t = this.computeInitialT() * 0.1
            state.phi = this.computeBarrierObjective(state.f, state.c, state.t, state.signs, state.inactiveSet)
            continue
          }
        }
        return this.makeResult(TerminationReason.TrustRadiusTooSmall)
      }

      if (innerResult === 'numerical_error') {
        return this.makeResult(TerminationReason.NumericalError)
      }

      // Opt-in: re-anchor the sliding constraint set to the current curve
      // before the next outer iteration. The author's original comment in
      // acceptStep warned against per-step refresh (mid-Newton sign flips
      // destabilize the log-barrier and can let the extrema count drift);
      // doing it once per outer iteration is the gentler re-linearization
      // point and is gated by the count-preservation check in constrainedFit.
      if (config.dynamicConstraints) {
        this.refreshConstraints()
      }

      // Increase barrier parameter
      if (state.delta > 0.001) {
        state.t *= config.barrierMu
      } else {
        // Trust radius is small, increase t faster
        state.t *= 10 * config.barrierMu
      }
      // Recompute barrier objective with new t
      state.phi = this.computeBarrierObjective(state.f, state.c, state.t, state.signs, state.inactiveSet)

      // Reset BFGS when barrier parameter changes (new outer iteration)
      if (config.enableBFGS) {
        this.resetBFGS()
      }
    }

    return this.makeResult(TerminationReason.Converged)
  }

  // ==========================================================================
  // Inner Loop (Fixed Barrier Parameter)
  // ==========================================================================

  private innerLoop(): 'converged' | 'trust_radius_too_small' | 'numerical_error' {
    const { config, state } = this
    let innerIter = 0

    while (innerIter < config.maxInnerIterations && state.iteration < config.maxIterations) {
      state.iteration++
      innerIter++

      // Check trust radius
      if (state.delta < config.minTrustRadius) {
        return 'trust_radius_too_small'
      }

      // Compute barrier gradient and Hessian
      const barrier = this.computeBarrier()
      if (!barrier) {
        return 'numerical_error'
      }

      const { gradient, hessian, newtonDecrementSq } = barrier

      // Check inner convergence
      if (newtonDecrementSq < config.newtonTolerance) {
        return 'converged'
      }

      // Compute Newton step using trust region
      const trustResult = solveTrustRegion(gradient, hessian, state.delta, config.hessianRegularization)
      let step = trustResult.step

      // Fraction-to-boundary rule: scale step to maintain strict feasibility.
      // Only applied to inequality constraints (skip first numEq equality constraints).
      // For each constraint, compute max alpha such that sign*c(x + alpha*step) < 0
      // using the linear approximation c(x + alpha*step) ≈ c(x) + alpha * J * step.
      {
        const jacobian = this.problem.computeConstraintJacobian()
        const constraints = state.c
        const signs = state.signs
        const numEq = this.problem.numEqualityConstraints
        const tau = 0.995 // fraction-to-boundary parameter
        let alphaMax = 1.0

        for (let i = numEq; i < constraints.length; i++) {
          if (state.inactiveSet.has(i)) continue
          const fi = signs[i] * constraints[i] // fi < 0 (feasible)
          // Compute directional derivative: sign * J_i · step
          let Jd = 0
          for (let j = 0; j < step.length; j++) {
            Jd += signs[i] * jacobian[i][j] * step[j]
          }
          if (Jd > 0) {
            // Step pushes toward constraint boundary
            const alpha_i = (-fi) / Jd // how far until fi = 0
            alphaMax = Math.min(alphaMax, tau * alpha_i)
          }
        }

        if (alphaMax < 1.0) {
          if (config.verbose) {
            console.log(`  Fraction-to-boundary: alphaMax=${alphaMax.toExponential(3)}, delta=${state.delta.toExponential(3)}`)
          }
          step = step.map(s => s * alphaMax)
        }
      }

      // Evaluate step
      const stepResult = this.evaluateStep(step)

      // Apply Second-Order Correction if needed
      if (config.enableSOC && stepResult.violatesConstraints) {
        const socStep = this.secondOrderCorrection(step, stepResult.constraints)
        if (socStep) {
          step = socStep.step
          const socResult = this.evaluateStep(step)
          if (!socResult.violatesConstraints) {
            // SOC fixed the constraints
            this.acceptStep(step, socResult, true)
            continue
          }
        }
      }

      // Check step acceptance
      if (stepResult.violatesConstraints) {
        // Constraint violated, reject and shrink
        if (config.verbose) {
          console.log(`  Step rejected: violates constraints, theta=${stepResult.constraintViolation.toExponential(3)}, delta=${state.delta.toExponential(3)}`)
        }
        state.delta *= 0.25
        continue
      }

      // Filter method or standard trust region acceptance
      const accepted = config.enableFilter
        ? this.filterAccept(stepResult, barrier.predictedReduction)
        : this.trustRegionAccept(stepResult, barrier.predictedReduction)

      if (accepted) {
        if (config.verbose) {
          console.log(`  Step accepted: f=${stepResult.objective.toFixed(4)}, theta=${stepResult.constraintViolation.toExponential(3)}`)
        }
        this.acceptStep(step, stepResult, false)

        // Expand trust region if step was good
        if (stepResult.rho > 0.75 && trustResult.hitsBoundary) {
          state.delta = Math.min(2 * state.delta, this.adaptiveMaxTR)
        }
      } else {
        // Watchdog: allow occasional bad steps
        if (config.enableWatchdog && this.watchdogAccept(stepResult)) {
          this.acceptStep(step, stepResult, false)
        } else {
          // Reject and shrink
          if (config.verbose) {
            console.log(`  Step rejected by filter: newF=${stepResult.objective.toFixed(4)}, oldF=${state.f.toFixed(4)}, newPhi=${stepResult.barrierObjective.toFixed(4)}, oldPhi=${state.phi.toFixed(4)}, newTheta=${stepResult.constraintViolation.toExponential(3)}, oldTheta=${state.theta.toExponential(3)}`)
          }
          state.delta *= 0.25
        }
      }
    }

    return 'converged'
  }

  // ==========================================================================
  // Barrier Objective Value
  // ==========================================================================

  /**
   * Compute barrier objective: φ = t*f + (t/2)·Σ h_i² - Σlog(-c_j)
   * where h_i are equality constraints and c_j are inequalities.
   * Returns Infinity if any active inequality is infeasible.
   */
  private computeBarrierObjective(
    f: number, constraints: number[], t: number,
    signs: number[], inactiveSet: Set<number>
  ): number {
    const numEq = this.problem.numEqualityConstraints
    let phi = t * f

    // Equality constraints: quadratic penalty (t²/2)·Σ h_i²
    // Using t² ensures penalty dominates as t→∞, forcing h→0.
    const eqPenalty = t * t
    for (let i = 0; i < numEq; i++) {
      phi += (eqPenalty / 2) * constraints[i] * constraints[i]
    }

    // Inequality constraints: log barrier -Σlog(-f_i)
    for (let i = numEq; i < constraints.length; i++) {
      if (inactiveSet.has(i)) continue
      const fi = signs[i] * constraints[i]
      if (fi >= 0) return Infinity
      phi -= Math.log(-fi)
    }
    return phi
  }

  // ==========================================================================
  // Barrier Function
  // ==========================================================================

  private computeBarrier(): {
    gradient: number[]
    hessian: Matrix
    predictedReduction: number
    newtonDecrementSq: number
  } | null {
    const { state, problem, config } = this
    const n = problem.numVariables
    const t = state.t
    const numEq = problem.numEqualityConstraints

    // Get current state
    const f0Gradient = problem.computeObjectiveGradient()
    const constraints = state.c
    const signs = state.signs
    const inactiveSet = state.inactiveSet
    const jacobian = problem.computeConstraintJacobian()

    // Compute barrier gradient: t * ∇f0
    const barrierGradient = scale(f0Gradient, t)

    // Equality constraints: gradient += t² · J_eq^T · h
    const eqPenalty = t * t
    if (numEq > 0) {
      for (let i = 0; i < numEq; i++) {
        const hi = constraints[i]
        for (let j = 0; j < n; j++) {
          barrierGradient[j] += eqPenalty * jacobian[i][j] * hi
        }
      }
    }

    // Inequality constraints: gradient += Σ(-1/f_i) * sign_i * ∇c_i
    const activeF: number[] = []
    const activeJacobian: Matrix = []
    const activeSupports: number[][] = [] // nonzero columns per active row (only when IP_LOCALITY)

    for (let i = numEq; i < constraints.length; i++) {
      if (inactiveSet.has(i)) continue

      const f = signs[i] * constraints[i]
      if (f >= 0) {
        // Constraint violated or at boundary - can't compute log barrier
        return null
      }

      activeF.push(f)
      const scaledRow = jacobian[i].map((val) => val * signs[i])
      activeJacobian.push(scaledRow)
      if (IP_LOCALITY.enabled) {
        const supp: number[] = []
        for (let j = 0; j < n; j++) if (scaledRow[j] !== 0) supp.push(j)
        activeSupports.push(supp)
      }

      // Add barrier gradient contribution: -1/f * ∇f
      for (let j = 0; j < n; j++) {
        barrierGradient[j] += (-jacobian[i][j] * signs[i]) / f
      }
    }

    // Compute barrier Hessian: t * H_L (BFGS) or t * H_f0 (fallback)
    const lagrangianHessian = config.enableBFGS
      ? this.bfgsHessian
      : (problem.computeObjectiveHessian
          ? problem.computeObjectiveHessian()
          : identityMatrix(n))

    const barrierHessian = matScale(lagrangianHessian, t)

    // Equality constraints: Hessian += t² · J_eq^T · J_eq (Gauss-Newton approx)
    if (numEq > 0) {
      const eqJacobian: Matrix = []
      for (let i = 0; i < numEq; i++) {
        eqJacobian.push(jacobian[i])
      }
      const ones = new Array(numEq).fill(1)
      const jtJ = atDiagA(eqJacobian, ones)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          barrierHessian[i][j] += eqPenalty * jtJ[i][j]
        }
      }
    }

    // Inequality constraints: Hessian += J^T * diag(1/f²) * J
    if (activeF.length > 0) {
      let jtDiagJ: Matrix
      if (IP_LOCALITY.enabled) {
        // Locality: accumulate each constraint's rank-1 update into its local
        // support block — lower triangle only, then mirror — to keep it BIT-IDENTICAL
        // to atDiagA (which is symmetric). O(active·d²) instead of O(active·n²).
        jtDiagJ = Array.from({ length: n }, () => new Array(n).fill(0))
        for (let kk = 0; kk < activeJacobian.length; kk++) {
          const row = activeJacobian[kk], d = 1 / (activeF[kk] * activeF[kk]), S = activeSupports[kk]
          for (let a = 0; a < S.length; a++) {
            const i = S[a], di = row[i] * d, Hi = jtDiagJ[i]
            for (let b = 0; b < S.length; b++) { const j = S[b]; if (j <= i) Hi[j] += di * row[j] }
          }
        }
        for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) jtDiagJ[j][i] = jtDiagJ[i][j] // mirror
      } else {
        const invFSq = activeF.map((f) => 1 / (f * f))
        jtDiagJ = atDiagA(activeJacobian, invFSq)
      }
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) barrierHessian[i][j] += jtDiagJ[i][j]
    }

    // Exact constraint Hessians: Σ wᵢ · ∇²cᵢ
    // For equalities: wᵢ = t² · hᵢ (from quadratic penalty)
    // For active inequalities: wᵢ = -signᵢ / fᵢ = -1/cᵢ (barrier multiplier)
    if (problem.computeConstraintHessianWeightedSum) {
      const hessianWeights = new Array(constraints.length).fill(0)
      for (let i = 0; i < numEq; i++) {
        hessianWeights[i] = eqPenalty * constraints[i]
      }
      let activeIdx = 0
      for (let i = numEq; i < constraints.length; i++) {
        if (inactiveSet.has(i)) continue
        hessianWeights[i] = -signs[i] / activeF[activeIdx]
        activeIdx++
      }
      const constraintH = problem.computeConstraintHessianWeightedSum(hessianWeights)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          barrierHessian[i][j] += constraintH[i][j]
        }
      }
    }

    // Compute predicted reduction and Newton decrement
    const { x: negStep } = choleskySolve(barrierHessian, barrierGradient, config.hessianRegularization)
    const predictedReduction = negStep ? dot(barrierGradient, negStep) : 0
    const newtonDecrementSq = Math.max(0, predictedReduction)

    return {
      gradient: barrierGradient,
      hessian: barrierHessian,
      predictedReduction,
      newtonDecrementSq,
    }
  }

  // ==========================================================================
  // Second-Order Correction (SOC)
  // ==========================================================================

  /**
   * When Newton step violates constraints, compute a correction that
   * projects back to feasibility.
   *
   * Solve: min ||Δp||² subject to J * Δp = -violation
   * Solution: Δp = -J^T * (J * J^T)^{-1} * violation
   */
  private secondOrderCorrection(
    originalStep: number[],
    trialConstraints: number[]
  ): { step: number[] } | null {
    const { state, problem } = this
    const signs = state.signs
    const inactiveSet = state.inactiveSet
    const numEq = problem.numEqualityConstraints

    // Compute violations (positive values mean violated)
    const violations: number[] = []
    const activeIndices: number[] = []

    // Equality constraints: violation = h_i (push toward zero)
    for (let i = 0; i < numEq; i++) {
      violations.push(trialConstraints[i])
      activeIndices.push(i)
    }

    // Inequality constraints
    for (let i = numEq; i < trialConstraints.length; i++) {
      if (inactiveSet.has(i)) continue

      const f = signs[i] * trialConstraints[i]
      if (f >= 0) {
        // Push back to safe region
        violations.push(f + 1e-6)
        activeIndices.push(i)
      } else {
        violations.push(0)
        activeIndices.push(i)
      }
    }

    // If no violations, no correction needed
    if (violations.every((v) => v === 0)) {
      return null
    }

    // Get Jacobian for active constraints
    const fullJacobian = problem.computeConstraintJacobian()
    const activeJacobian: Matrix = activeIndices.map((i) =>
      i < numEq
        ? fullJacobian[i]  // equality: no sign flip
        : fullJacobian[i].map((val) => val * signs[i])
    )

    if (activeJacobian.length === 0) {
      return null
    }

    // Solve min-norm problem: min ||Δp||² s.t. J * Δp = -violations
    const rhs = violations.map((v) => -v)
    let success: boolean, correction: number[]
    if (IP_SPARSE_SOC.enabled) {
      // Banded path: extract each row's sparse support, solve via the constraint
      // Gram A·Aᵀ (banded) instead of dense matMat + Cholesky.
      const nCols = activeJacobian[0].length
      const rowCols: number[][] = []
      const rowVals: number[][] = []
      for (const row of activeJacobian) {
        const cols: number[] = [], vals: number[] = []
        for (let j = 0; j < nCols; j++) { const v = row[j]; if (v !== 0) { cols.push(j); vals.push(v) } }
        rowCols.push(cols); rowVals.push(vals)
      }
      ;({ success, x: correction } = minNormSolveSparse(rowCols, rowVals, nCols, rhs))
    } else {
      ;({ success, x: correction } = minNormSolve(activeJacobian, rhs))
    }

    if (!success) {
      return null
    }

    // Scale correction to stay within trust region
    const corrNorm = norm2(correction)
    const maxCorr = state.delta * 0.5

    const scaledCorrection = corrNorm > maxCorr ? scale(correction, maxCorr / corrNorm) : correction

    // Apply correction to original step
    const correctedStep = add(originalStep, scaledCorrection)

    return { step: correctedStep }
  }

  // ==========================================================================
  // Feasibility Restoration
  // ==========================================================================

  /**
   * When optimization is stuck, try to find a feasible direction by
   * minimizing constraint violation.
   */
  private feasibilityRestoration(): boolean {
    const { state, problem, config } = this

    if (config.verbose) {
      console.log('Attempting feasibility restoration')
    }

    const signs = state.signs
    const inactiveSet = state.inactiveSet
    const jacobian = problem.computeConstraintJacobian()
    const n = problem.numVariables

    // Compute constraint violations
    const constraints = state.c
    const numEq = problem.numEqualityConstraints
    const violations: number[] = []
    const activeJacobian: Matrix = []

    // Equality constraints: always include, violation = |h_i|
    for (let i = 0; i < numEq; i++) {
      violations.push(Math.abs(constraints[i]))
      activeJacobian.push(jacobian[i].map((val) => val * Math.sign(constraints[i] || 1)))
    }

    // Inequality constraints
    for (let i = numEq; i < constraints.length; i++) {
      if (inactiveSet.has(i)) continue

      const f = signs[i] * constraints[i]
      if (f > -1e-4) {
        // Near or past boundary
        violations.push(Math.max(0, f))
        activeJacobian.push(jacobian[i].map((val) => val * signs[i]))
      }
    }

    if (violations.length === 0) {
      // No tight constraints
      return false
    }

    // Gradient of violation: J^T * violations
    const violationGradient = zeros(n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < violations.length; i++) {
        violationGradient[j] += activeJacobian[i][j] * violations[i]
      }
    }

    const gradNorm = norm2(violationGradient)
    if (gradNorm < 1e-14) {
      return false
    }

    // Take a small step in the negative gradient direction
    const stepSize = 0.01 / Math.max(1, gradNorm)
    const restorationStep = scale(violationGradient, -stepSize)

    // Apply step
    const newX = add(state.x, restorationStep)
    problem.setVariables(newX)

    // Check if violations improved
    const newConstraints = problem.computeConstraints()
    const oldViolation = violations.reduce((sum, v) => sum + v, 0)

    let newViolation = 0
    for (let i = 0; i < newConstraints.length; i++) {
      if (inactiveSet.has(i)) continue

      const f = signs[i] * newConstraints[i]
      if (f > -1e-4) {
        newViolation += Math.max(0, f)
      }
    }

    if (newViolation < oldViolation * 0.9) {
      // Update state
      state.x = newX
      state.f = problem.computeObjective()
      state.c = newConstraints
      state.theta = this.computeConstraintViolation(newConstraints)
      state.phi = this.computeBarrierObjective(state.f, state.c, state.t, state.signs, state.inactiveSet)
      state.iteration++

      if (config.verbose) {
        console.log(`Restoration improved: ${oldViolation.toFixed(6)} -> ${newViolation.toFixed(6)}`)
      }

      return true
    }

    // Restoration didn't help, restore original
    problem.setVariables(state.x)
    return false
  }

  // ==========================================================================
  // Filter Method
  // ==========================================================================

  /**
   * Accept step if it's not dominated by any filter entry.
   * A point is acceptable if it improves either objective OR constraint violation.
   */
  private filterAccept(stepResult: StepResult, _predictedBarrierReduction?: number): boolean {
    const { state } = this

    // Check if step is acceptable to filter
    const newF = stepResult.objective
    const newTheta = stepResult.constraintViolation
    const newPhi = stepResult.barrierObjective

    // Check switching condition: if theta is small, focus on objective
    const switchingCondition = newTheta < 1e-4

    // Standard filter acceptance (domination test on f, theta — prevents cycling)
    for (const entry of state.filter) {
      // A point is dominated if it's worse in both objective and constraint violation
      const dominated =
        newF >= entry.objective - 1e-8 && newTheta >= entry.constraintViolation - 1e-8

      if (dominated) {
        return false
      }
    }

    // Sufficient decrease test
    // Key fix: when nearly feasible (switching condition), test barrier objective φ
    // instead of raw f. The Newton step minimizes φ = t*f - Σlog(-c_i), so it can
    // reduce barrier terms while slightly increasing f. Testing raw f would reject
    // such steps, causing stalling.
    const sufficientDecrease = switchingCondition
      ? newPhi < state.phi - 1e-4
      : newTheta < state.theta * 0.99 || newF < state.f * 0.99

    return sufficientDecrease
  }

  /**
   * Add current point to filter after accepting a step
   */
  private updateFilter(stepResult: StepResult): void {
    const { state } = this

    // Only add to filter if step improved constraint violation significantly
    if (stepResult.constraintViolation < state.theta * 0.99) {
      state.filter.push({
        objective: state.f,
        constraintViolation: state.theta,
      })

      // Prune dominated entries
      state.filter = state.filter.filter(
        (entry) =>
          !state.filter.some(
            (other) =>
              other !== entry &&
              other.objective <= entry.objective &&
              other.constraintViolation <= entry.constraintViolation
          )
      )
    }
  }

  // ==========================================================================
  // Watchdog Technique
  // ==========================================================================

  /**
   * Allow occasional non-monotone steps to escape local minima.
   */
  private watchdogAccept(stepResult: StepResult): boolean {
    const { state, config } = this

    if (!state.watchdog) {
      // Start watchdog trial
      if (stepResult.rho > 0) {
        // Step makes some progress, allow it
        state.watchdog = {
          savedX: clone(state.x),
          savedF: state.f,
          savedTheta: state.theta,
          savedPhi: state.phi,
          trialsRemaining: config.watchdogTrialLimit - 1,
        }
        return true
      }
      return false
    }

    // In watchdog mode
    if (state.watchdog.trialsRemaining > 0) {
      state.watchdog.trialsRemaining--
      return true
    }

    // Watchdog trials exhausted
    // Check if we've improved from saved point
    const improved =
      stepResult.objective < state.watchdog.savedF ||
      stepResult.constraintViolation < state.watchdog.savedTheta

    if (!improved) {
      // Restore saved point
      this.problem.setVariables(state.watchdog.savedX)
      state.x = state.watchdog.savedX
      state.f = state.watchdog.savedF
      state.theta = state.watchdog.savedTheta
      state.phi = state.watchdog.savedPhi
      state.c = this.problem.computeConstraints()
    }

    state.watchdog = null
    return false
  }

  // ==========================================================================
  // Standard Trust Region Acceptance
  // ==========================================================================

  private trustRegionAccept(stepResult: StepResult, predictedReduction: number): boolean {
    const { config } = this

    if (predictedReduction <= 0) {
      return false
    }

    return stepResult.rho > config.acceptanceThreshold
  }

  // ==========================================================================
  // Step Evaluation
  // ==========================================================================

  private evaluateStep(step: number[]): StepResult {
    const { state, problem } = this

    // Compute trial point
    const trialX = add(state.x, step)
    problem.setVariables(trialX)

    // Evaluate at trial point
    const trialF = problem.computeObjective()
    const trialC = problem.computeConstraints()
    const trialTheta = this.computeConstraintViolation(trialC)
    const trialPhi = this.computeBarrierObjective(trialF, trialC, state.t, state.signs, state.inactiveSet)

    // Check constraint violation (only inequalities can "violate" in the barrier sense)
    const signs = state.signs
    const inactiveSet = state.inactiveSet
    const numEq = this.problem.numEqualityConstraints
    let violatesConstraints = false

    for (let i = numEq; i < trialC.length; i++) {
      if (inactiveSet.has(i)) continue
      const f = signs[i] * trialC[i]
      if (f >= 0) {
        violatesConstraints = true
        break
      }
    }

    // Compute rho (actual / predicted reduction of the barrier objective φ)
    // Boyd §11.5.2: compare actual vs predicted reduction of the same function
    // The Newton step minimizes φ(x) = t·f(x) - Σlog(-fᵢ(x)), so rho should
    // use φ, not the raw objective f.
    const actualReduction = state.phi - trialPhi
    const barrier = this.computeBarrier()
    const predictedReduction = barrier ? barrier.predictedReduction : 0

    const rho = predictedReduction > 0 ? actualReduction / predictedReduction : 0

    // Restore original point
    problem.setVariables(state.x)

    return {
      trialX,
      objective: trialF,
      constraints: trialC,
      constraintViolation: trialTheta,
      barrierObjective: trialPhi,
      violatesConstraints,
      rho,
    }
  }

  private acceptStep(_step: number[], stepResult: StepResult, usedSOC: boolean): void {
    const { state, problem, config } = this

    // Update filter before moving
    if (config.enableFilter) {
      this.updateFilter(stepResult)
    }

    // BFGS update: compute before moving to new point
    if (config.enableBFGS) {
      this.performBFGSUpdate(stepResult)
    }

    // Move to new point
    state.x = stepResult.trialX
    state.f = stepResult.objective
    state.c = stepResult.constraints
    state.theta = stepResult.constraintViolation
    state.phi = stepResult.barrierObjective

    // Track the best feasible iterate: prefer feasible over infeasible, then
    // lowest objective; among infeasible points prefer least violation. The
    // watchdog/filter may accept worse steps, so the final iterate is not
    // necessarily the best one we passed through.
    const tol = config.constraintTolerance
    const curFeasible = state.theta <= tol
    const bestFeasible = state.bestTheta <= tol
    const better =
      (curFeasible && !bestFeasible) ||
      (curFeasible === bestFeasible && state.f < state.bestF) ||
      (!curFeasible && !bestFeasible && state.theta < state.bestTheta)
    if (better) {
      state.bestX = clone(state.x)
      state.bestF = state.f
      state.bestTheta = state.theta
    }

    problem.setVariables(state.x)

    // Store current data for next BFGS update
    if (config.enableBFGS) {
      this.prevX = clone(state.x)
      this.prevObjGrad = problem.computeObjectiveGradient()
      this.prevJacobian = problem.computeConstraintJacobian()
      this.prevSigns = clone(state.signs)
    }

    // NOTE: Do NOT update constraint signs here!
    // Signs must remain fixed from initial state to preserve curvature extrema count.
    // Updating signs would allow new extrema to form.

    // Relaxed acceptance if SOC was used
    if (usedSOC && state.delta < this.adaptiveInitialTR) {
      state.delta = Math.min(state.delta * 1.5, this.adaptiveInitialTR)
    }
  }

  // ==========================================================================
  // BFGS Lagrangian Hessian Approximation
  // ==========================================================================

  /**
   * Reset BFGS Hessian to scaled identity and clear previous step data.
   * Called on initialization, barrier parameter change, and feasibility restoration.
   */
  private resetBFGS(): void {
    const n = this.problem.numVariables
    // Scale initial Hessian by ||∇f||/n or 1.0 as fallback
    const grad = this.problem.computeObjectiveGradient()
    const gradNorm = norm2(grad)
    const scaling = gradNorm > 1e-10 ? gradNorm / n : 1.0
    this.bfgsHessian = identityMatrix(n)
    for (let i = 0; i < n; i++) {
      this.bfgsHessian[i][i] = scaling
    }
    this.prevX = null
    this.prevObjGrad = null
    this.prevJacobian = null
    this.prevSigns = null
  }

  /**
   * Perform damped BFGS update of the Lagrangian Hessian approximation.
   * Uses Powell's modification to maintain positive definiteness.
   *
   * The Lagrangian gradient at point x with multipliers λ is:
   *   ∇_x L = ∇f + Σ λᵢ · sign_i · J_i
   * where λᵢ = -1/fᵢ are barrier multiplier estimates.
   *
   * We compute y_k = ∇_x L(x_{k+1}, λ_{k+1}) - ∇_x L(x_k, λ_{k+1})
   * using the same multipliers λ_{k+1} at both points.
   */
  private performBFGSUpdate(stepResult: StepResult): void {
    if (!this.prevX || !this.prevObjGrad || !this.prevJacobian || !this.prevSigns) {
      return
    }

    const { state, problem } = this
    const n = problem.numVariables
    const numEq = problem.numEqualityConstraints

    // s = x_{k+1} - x_k
    const s = subtract(stepResult.trialX, this.prevX)
    const sNorm = norm2(s)
    if (sNorm < 1e-14) return // Skip tiny steps

    // Compute current multipliers λᵢ = -1/fᵢ for inequality constraints
    // where fᵢ = sign_i * c_i (should be negative for feasible)
    const currentConstraints = stepResult.constraints
    const signs = state.signs
    const inactiveSet = state.inactiveSet

    // Compute ∇_x L at x_{k+1} with λ_{k+1}
    problem.setVariables(stepResult.trialX)
    const newObjGrad = problem.computeObjectiveGradient()
    const newJacobian = problem.computeConstraintJacobian()

    const gradL_new = clone(newObjGrad)
    const gradL_old = clone(this.prevObjGrad)

    for (let i = numEq; i < currentConstraints.length; i++) {
      if (inactiveSet.has(i)) continue
      const fi = signs[i] * currentConstraints[i]
      if (fi >= 0) continue // Skip infeasible (shouldn't happen for accepted step)

      const lambda_i = -1 / fi // Barrier multiplier estimate

      for (let j = 0; j < n; j++) {
        // ∇_x L contribution: λᵢ · sign_i · J_ij
        gradL_new[j] += lambda_i * signs[i] * newJacobian[i][j]
        gradL_old[j] += lambda_i * this.prevSigns[i] * this.prevJacobian![i][j]
      }
    }

    // Restore original variables
    problem.setVariables(state.x)

    // y = ∇_x L(x_{k+1}, λ_{k+1}) - ∇_x L(x_k, λ_{k+1})
    const y = subtract(gradL_new, gradL_old)

    this.updateBFGS(s, y)
  }

  /**
   * Damped BFGS update (Powell's modification).
   *
   * if s^T·y ≥ 0.2·s^T·B·s:  θ = 1 (standard BFGS)
   * else: θ = 0.8·s^T·B·s / (s^T·B·s - s^T·y)
   *
   * r = θ·y + (1-θ)·B·s
   * B_{k+1} = B_k - (B·s·s^T·B)/(s^T·B·s) + (r·r^T)/(s^T·r)
   */
  private updateBFGS(s: number[], y: number[]): void {
    const n = s.length
    const B = this.bfgsHessian

    // Bs = B · s
    const Bs = matVec(B, s)

    // sBs = s^T · B · s
    const sBs = dot(s, Bs)
    if (sBs < 1e-14) return // Skip if curvature is negligible

    // sty = s^T · y
    const sty = dot(s, y)

    // Damping (Powell's modification)
    let theta: number
    if (sty >= 0.2 * sBs) {
      theta = 1.0
    } else {
      theta = (0.8 * sBs) / (sBs - sty)
    }

    // r = θ·y + (1-θ)·B·s
    const r = new Array(n)
    for (let i = 0; i < n; i++) {
      r[i] = theta * y[i] + (1 - theta) * Bs[i]
    }

    // str = s^T · r
    const str = dot(s, r)
    if (Math.abs(str) < 1e-14) return // Skip degenerate update

    // B_{k+1} = B - (Bs·Bs^T)/sBs + (r·r^T)/str
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        const update = -Bs[i] * Bs[j] / sBs + r[i] * r[j] / str
        B[i][j] += update
        if (i !== j) {
          B[j][i] += update // Maintain symmetry
        }
      }
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private initializeState(): OptimizationState {
    const problem = this.problem
    const numEq = problem.numEqualityConstraints

    const x = problem.getVariables()
    const f = problem.computeObjective()
    const c = problem.computeConstraints()
    const signs = problem.getConstraintSigns()
    const inactiveSet = problem.getInactiveConstraints()

    // Compute initial constraint violation using the signs directly
    // (this.state is not yet assigned, so computeConstraintViolation would
    // use fallback sign=1 which gives wrong results)
    let theta = 0
    // Equality constraints: violation = |h_i|
    for (let i = 0; i < numEq; i++) {
      const absC = Math.abs(c[i])
      if (absC > theta) theta = absC
    }
    // Inequality constraints: violation = max(0, sign*c_i)
    for (let i = numEq; i < c.length; i++) {
      if (inactiveSet.has(i)) continue
      const signedC = (signs[i] ?? 1) * c[i]
      if (signedC > theta) theta = signedC
    }

    const t = this.config.warmStartT ?? this.computeInitialT()
    const delta = this.config.warmStartDelta ?? this.adaptiveInitialTR
    const phi = this.computeBarrierObjective(f, c, t, signs, inactiveSet)

    return {
      x,
      f,
      c,
      theta,
      phi,
      signs,
      inactiveSet,
      t,
      delta,
      iteration: 0,
      filter: [],
      watchdog: null,
      bestX: clone(x),
      bestF: f,
      bestTheta: theta,
    }
  }

  private computeInitialT(): number {
    const f0 = this.problem.computeObjective()
    const m = Math.max(this.problem.numConstraints, 1)
    // Boyd: t = m/f₀ balances the objective term (t*f) with the barrier (m log terms).
    // After coordinate normalization (Priority 1), f₀ is scale-invariant, so t is too.
    // Clamp: minimum m (ensures barrier smoothing with very large drags),
    // maximum 1e6 (prevents instant convergence when drag distance ≈ 0).
    return Math.max(Math.min(m / Math.max(f0, 1e-10), 1e6), m)
  }

  private computeConstraintViolation(constraints: number[]): number {
    const { state } = this
    const numEq = this.problem.numEqualityConstraints
    let maxViolation = 0

    // Equality constraints: violation = |h_i|
    for (let i = 0; i < numEq; i++) {
      maxViolation = Math.max(maxViolation, Math.abs(constraints[i]))
    }

    // Inequality constraints: violation = max(0, sign*c_i)
    for (let i = numEq; i < constraints.length; i++) {
      if (state?.inactiveSet?.has(i)) continue

      const sign = state?.signs?.[i] ?? 1
      const f = sign * constraints[i]
      maxViolation = Math.max(maxViolation, Math.max(0, f))
    }

    return maxViolation
  }

  /**
   * Re-anchor the constraint state to the current curve: re-reads constraint
   * signs + inactive (sliding) set from the problem and refreshes the
   * derived state (constraints, violation, filter). The barrier objective φ
   * is recomputed by the outer loop after this call (with the updated t).
   * The filter is cleared because prior (f, θ) entries are no longer
   * comparable under the new constraint pattern.
   */
  private refreshConstraints(): void {
    const { state, problem } = this
    problem.setVariables(state.x)
    problem.updateConstraintState()
    state.signs = problem.getConstraintSigns()
    state.inactiveSet = problem.getInactiveConstraints()
    state.c = problem.computeConstraints()
    state.theta = this.computeConstraintViolation(state.c)
    state.filter = []
  }

  private makeResult(reason: TerminationReason): OptimizerResult {
    const { state, config } = this

    // Optionally return the best feasible iterate rather than the stopping point.
    const useBest = config.returnBestFeasible === true
    return {
      variables: clone(useBest ? state.bestX : state.x),
      objective: useBest ? state.bestF : state.f,
      constraintViolation: useBest ? state.bestTheta : state.theta,
      iterations: state.iteration,
      converged: reason === TerminationReason.Converged,
      terminationReason: reason,
      finalT: state.t,
      finalDelta: state.delta,
    }
  }
}

// ==========================================================================
// Types
// ==========================================================================

interface StepResult {
  trialX: number[]
  objective: number
  constraints: number[]
  constraintViolation: number
  barrierObjective: number
  violatesConstraints: boolean
  rho: number
}
