// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Types and Interfaces for Interior Point Optimizer
 *
 * Based on IPOPT's problem formulation:
 *   minimize f(x)
 *   subject to c(x) <= 0  (inequality constraints)
 *
 * We use the barrier formulation:
 *   minimize t * f(x) - sum(log(-c_i(x)))
 */

import type { Matrix } from './linearAlgebra'

// ============================================================================
// Optimization Problem Interface
// ============================================================================

/**
 * Interface for optimization problems.
 * The optimizer calls these methods to get objective, constraints, and gradients.
 */
export interface OptimizationProblem {
  /** Number of variables */
  readonly numVariables: number

  /** Current variable values */
  getVariables(): number[]

  /** Set variable values */
  setVariables(x: number[]): void

  // ----- Objective Function -----

  /** Compute objective value f(x) */
  computeObjective(): number

  /** Compute gradient of objective ∇f(x) */
  computeObjectiveGradient(): number[]

  // ----- Constraints -----

  /** Number of constraints */
  readonly numConstraints: number

  /**
   * Number of equality constraints (default 0).
   * Convention: the first numEqualityConstraints entries of computeConstraints()
   * are equalities h(x) = 0; the rest are inequalities c(x) ≤ 0.
   */
  readonly numEqualityConstraints: number

  /**
   * Compute constraint values c(x).
   * Convention: c(x) < 0 is feasible, c(x) >= 0 is violated.
   */
  computeConstraints(): number[]

  /**
   * Compute Jacobian of constraints.
   * Returns m × n matrix where J[i][j] = ∂c_i/∂x_j
   */
  computeConstraintJacobian(): Matrix

  // ----- Constraint Management (Sliding Support) -----

  /**
   * Get signs of constraints from initial configuration.
   * sign[i] = -1 if c_i was positive, +1 if negative.
   * Used to maintain constraint direction during optimization.
   */
  getConstraintSigns(): number[]

  /**
   * Get indices of inactive constraints.
   * Inactive constraints are not enforced (allowed to slide).
   */
  getInactiveConstraints(): Set<number>

  /**
   * Recompute signs and inactive set from current state.
   * Called after accepting a step.
   */
  updateConstraintState(): void

  // ----- Optional: Hessian -----

  /**
   * Compute Hessian of objective ∇²f(x).
   * If not provided, identity matrix is used.
   */
  computeObjectiveHessian?(): Matrix

  /**
   * Compute the weighted sum of constraint Hessians: Σ wᵢ·∇²cᵢ(x).
   * weights[i] corresponds to constraint i (same order as computeConstraints).
   * If not provided, constraint Hessians are assumed zero (Gauss-Newton only).
   */
  computeConstraintHessianWeightedSum?(weights: number[]): Matrix
}

// ============================================================================
// Optimizer Configuration
// ============================================================================

export interface OptimizerConfig {
  // ----- Convergence Tolerances -----

  /** Barrier convergence tolerance (default: 1e-6) */
  barrierTolerance: number

  /** Newton decrement tolerance for inner loop (default: 1e-8) */
  newtonTolerance: number

  /** Constraint violation tolerance (default: 1e-8) */
  constraintTolerance: number

  // ----- Iteration Limits -----

  /** Maximum total iterations (default: 500) */
  maxIterations: number

  /** Maximum inner loop iterations per barrier parameter (default: 50) */
  maxInnerIterations: number

  // ----- Trust Region -----

  /** Initial trust region radius (default: 1.0) */
  initialTrustRadius: number

  /** Maximum trust region radius (default: 10.0) */
  maxTrustRadius: number

  /** Minimum trust region radius (default: 1e-15) */
  minTrustRadius: number

  // ----- Barrier Method -----

  /** Barrier parameter multiplier μ (default: 10) */
  barrierMu: number

  // ----- Step Acceptance (Trust Region) -----

  /** Step acceptance threshold η (default: 0.1) */
  acceptanceThreshold: number

  // ----- IPOPT Features -----

  /** Enable Second-Order Correction (default: true) */
  enableSOC: boolean

  /** Enable Feasibility Restoration (default: true) */
  enableFeasibilityRestoration: boolean

  /** Enable Filter method (default: true) */
  enableFilter: boolean

  /** Enable Watchdog (default: true) */
  enableWatchdog: boolean

  /** Watchdog trial limit (default: 3) */
  watchdogTrialLimit: number

  /** Enable BFGS approximation of Lagrangian Hessian (default: true) */
  enableBFGS: boolean

  /**
   * Return the best feasible iterate visited rather than the final one
   * (default: false). The watchdog/filter may accept temporarily-worse steps,
   * so the final iterate is not guaranteed to be the lowest-objective feasible
   * point. Enable this when the caller wants the optimizer's best result, not
   * its stopping point.
   */
  returnBestFeasible?: boolean

  /**
   * Recompute the constraint signs + inactive ("sliding") set from the current
   * curve at each OUTER barrier iteration (default: false). Lets the sliding
   * set re-anchor to the evolving curve mid-optimization instead of being
   * frozen at the start of the solve. Requires the problem to implement
   * `updateConstraintState`; the caller is responsible for verifying the
   * extrema count afterwards (refreshing signs can let the count drift; the
   * per-solve barrier no longer guarantees it).
   */
  dynamicConstraints?: boolean

  // ----- Regularization -----

  /** Hessian regularization (default: 1e-8) */
  hessianRegularization: number

  // ----- Warm Starting -----

  /** Warm-start barrier parameter (skip early outer iterations) */
  warmStartT?: number

  /** Warm-start trust region radius */
  warmStartDelta?: number

  // ----- Debug -----

  /** Print debug information (default: false) */
  verbose: boolean
}

export const defaultConfig: OptimizerConfig = {
  barrierTolerance: 1e-6,
  newtonTolerance: 1e-8,
  constraintTolerance: 1e-8,
  maxIterations: 500,
  maxInnerIterations: 50,
  initialTrustRadius: 1.0,
  maxTrustRadius: 10.0,
  minTrustRadius: 1e-15,
  barrierMu: 10,
  acceptanceThreshold: 0.1,
  enableSOC: true,
  enableFeasibilityRestoration: true,
  enableFilter: true,
  enableWatchdog: true,
  watchdogTrialLimit: 3,
  enableBFGS: true,
  hessianRegularization: 1e-8,
  verbose: false,
}

// ============================================================================
// Optimizer Result
// ============================================================================

export interface OptimizerResult {
  /** Final variable values */
  variables: number[]

  /** Final objective value */
  objective: number

  /** Final constraint violation (max of positive constraint values) */
  constraintViolation: number

  /** Number of iterations */
  iterations: number

  /** Whether optimization converged */
  converged: boolean

  /** Termination reason */
  terminationReason: TerminationReason

  /** Final barrier parameter (for warm starting) */
  finalT?: number

  /** Final trust region radius (for warm starting) */
  finalDelta?: number
}

export const TerminationReason = {
  Converged: 'converged',
  MaxIterations: 'max_iterations',
  TrustRadiusTooSmall: 'trust_radius_too_small',
  NumericalError: 'numerical_error',
  FeasibilityRestorationFailed: 'feasibility_restoration_failed',
} as const

export type TerminationReason = (typeof TerminationReason)[keyof typeof TerminationReason]

// ============================================================================
// Filter Entry (for IPOPT Filter Method)
// ============================================================================

export interface FilterEntry {
  /** Objective value */
  objective: number

  /** Constraint violation (theta) */
  constraintViolation: number
}

// ============================================================================
// Optimization State (internal)
// ============================================================================

export interface OptimizationState {
  /** Current variables */
  x: number[]

  /** Current objective value */
  f: number

  /** Current constraint values */
  c: number[]

  /** Current constraint violation (theta) */
  theta: number

  /** Current barrier objective value: t*f - Σlog(-f_i) */
  phi: number

  /** Constraint signs */
  signs: number[]

  /** Inactive constraint indices */
  inactiveSet: Set<number>

  /** Barrier parameter t */
  t: number

  /** Trust region radius */
  delta: number

  /** Iteration count */
  iteration: number

  /** Filter entries */
  filter: FilterEntry[]

  /** Watchdog state */
  watchdog: WatchdogState | null

  /** Best feasible iterate visited so far (variables). */
  bestX: number[]
  /** Objective at bestX. */
  bestF: number
  /** Constraint violation at bestX. */
  bestTheta: number
}

export interface WatchdogState {
  /** Saved state before watchdog trials */
  savedX: number[]
  savedF: number
  savedTheta: number
  savedPhi: number

  /** Number of watchdog trials remaining */
  trialsRemaining: number
}
