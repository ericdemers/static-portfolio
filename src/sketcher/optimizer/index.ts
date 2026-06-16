// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Curvature Extrema Control Optimizer
 *
 * High-level API for optimizing B-spline curves while preserving
 * the number of curvature extrema.
 *
 * This is the main entry point for the optimizer. Use `optimizeCurve()`
 * to move a control point while keeping the curve's curvature well-behaved.
 */

import { InteriorPointOptimizer } from './InteriorPointOptimizer'
import { BSplineCurveProblem } from './BSplineCurveProblem'
import { PeriodicBSplineCurveProblem, type PeriodicConstraintState } from './PeriodicBSplineCurveProblem'
import { RationalBSplineCurveProblem } from './RationalBSplineCurveProblem'
import { PeriodicRationalBSplineCurveProblem, type PeriodicRationalConstraintState } from './PeriodicRationalBSplineCurveProblem'
import { ComplexRationalBSplineCurveProblem } from './ComplexRationalBSplineCurveProblem'
import type { ComplexRationalConstraintState } from './complexAlgebra'
import type { OptimizerConfig } from './types'
import { SymmetryReductionWrapper } from './SymmetryReductionWrapper'
import { FixedVariableWrapper } from './FixedVariableWrapper'
import { curveToBS2D, curveToRationalBS2D, updateCurveFromBS2D, updateCurveFromRationalBS2D, type BSpline2D, type RationalBSpline2D } from './bsplineTypes'
import type { Curve, ComplexPoint, Point2D, ComplexRationalBSplineCurve } from '../types/curve'
import { PHCurveProblem, type PHCurvatureBoundOptions } from './PHCurveProblem'
import { phCurvatureMargin } from './phCurvatureBound'
import { ComplexRationalPHCurveProblem } from './ComplexRationalPHCurveProblem'
import { computePHCurveFromUV, type PHMetadata, type PHCurveResult, type ComplexRationalPHMetadata, type ComplexRationalPHCurveResult } from './phCurve'
import { computeComplexRationalPHFromSD } from './complexRationalPHCurve'
import { computeABPHCurve, type ABPHMetadata, type ABPHCurveResult } from './abPHCurve'
import { ABPHCurveProblem } from './ABPHCurveProblem'
import { computeRealRationalPHCurve, type RealRationalPHMetadata, type RealRationalPHCurveResult } from './realRationalPHCurve'
import { RealRationalPHCurveProblem } from './RealRationalPHCurveProblem'

// ============================================================================
// Types
// ============================================================================

export interface OptimizeResult {
  /** Optimized X control points */
  controlPointsX: number[]
  /** Optimized Y control points */
  controlPointsY: number[]
  /** Number of optimizer iterations */
  iterations: number
  /** Whether optimization converged */
  converged: boolean
  /** Final objective value (distance from target) */
  objective: number
  /** Final constraint violation */
  constraintViolation: number
}

export interface OptimizeRationalResult extends OptimizeResult {
  /** Optimized weight control points */
  controlPointsW: number[]
}

export interface OptimizeRationalFarinResult extends OptimizeRationalResult {
  /** Updated Farin t-values (for closed curves) */
  farinTValues?: number[]
  /** Updated wrap weight (for closed curves) */
  wrapWeight?: number
}

export interface OptimizeComplexRationalResult {
  /** Optimized control points (with complex weights) */
  controlPoints: ComplexPoint[]
  /** Optimized Farin positions */
  farinPositions: Point2D[]
  /** Wrap weight for closed curves */
  wrapWeight: { re: number; im: number }
  /** Number of optimizer iterations */
  iterations: number
  /** Whether optimization converged */
  converged: boolean
  /** Final objective value */
  objective: number
  /** Final constraint violation */
  constraintViolation: number
}

export interface OptimizeOptions {
  /** Maximum iterations (default: 100) */
  maxIterations?: number
  /** Cap on the inner Newton iterations per barrier subproblem (default: 50).
   *  Lowering to ~5 makes each outer iteration much cheaper for interactive
   *  dragging at a small cost to the exact feasible point reached. */
  maxInnerIterations?: number
  /** Print debug info (default: false) */
  verbose?: boolean
  /** Enable Second-Order Correction (default: true) */
  enableSOC?: boolean
  /** Enable Feasibility Restoration (default: true) */
  enableFeasibilityRestoration?: boolean
  /** Enable Filter method (default: true) */
  enableFilter?: boolean
  /** Enable Watchdog (default: true) */
  enableWatchdog?: boolean
  /** Enable BFGS Lagrangian-Hessian approximation (default: true). Set false
   *  for a Gauss-Newton solve: the drag objective Σ½‖cp−t‖² has an exactly
   *  identity Hessian, so disabling BFGS uses that (no dense quasi-Newton
   *  matrix) and typically converges in far fewer iterations. */
  enableBFGS?: boolean
  /** Initial constraint state for periodic curves (computed once at drag start) */
  initialPeriodicConstraintState?: PeriodicConstraintState
  /** Initial constraint state for periodic rational curves */
  initialPeriodicRationalConstraintState?: PeriodicRationalConstraintState
  /** Keep weights fixed during rational curve optimization (default: true) */
  fixWeights?: boolean
  /** Initial constraint state for complex-rational curves */
  initialComplexRationalConstraintState?: ComplexRationalConstraintState
  /** Closed complex-rational only: freeze weights at their current values and
   *  optimize control-point positions only (sparse Jacobian, ~2x faster build,
   *  half the variables). Farin points are not editable in this mode. */
  fixedWeightClosed?: boolean
  /** Drag type for complex-rational curves */
  dragType?: 'controlPoint' | 'farinPoint'
  /** Symmetry mirror maps for variable reduction (exact symmetry by construction) */
  symmetryMaps?: { mapX: number[] | null; mapY: number[] | null }
  /** Preserve inflection count (zeros of curvature numerator) */
  preserveInflections?: boolean
  /** AB-PH only: also bound the curvature-extrema count (sign changes of g)
   *  while editing, stacked on top of the PH equality constraints. */
  preserveCurvatureExtrema?: boolean
  /** Polynomial PH only: bound the curvature VALUE |κ| ≤ curvatureBound live
   *  during the drag (the degree-8 P± = curvatureBound·σ² ± 2(uv'−vu') ≥ 0). */
  constrainCurvatureValue?: boolean
  /** κ_max for constrainCurvatureValue (the inverse minimum turning radius). */
  curvatureBound?: number
  /** Subdivision depth for the curvature-value certificate (default 2). */
  curvatureSubdivisions?: number
  /** Force the constrained optimizer's inactive set to ∅ — every sign anchor
   * stays active, so the sign-change boundary cannot slide. Default false. */
  disableSliding?: boolean
  /** Anchor CPs for drift resistance — snapshot of CPs at drag start */
  anchorCPsX?: number[]
  anchorCPsY?: number[]
  /** Weight for anchoring undragged CPs to their drag-start positions (0 = no anchoring) */
  anchorWeight?: number
  /** Indices of variables to fix (in the [x0..x_{n-1}, y0..y_{n-1}] layout) */
  fixedVariableIndices?: number[]
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Optimize a B-spline curve to move a control point to a target position
 * while preserving curvature extrema count.
 */
export function optimizeCurve(
  curve: Curve,
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeResult {
  if (curve.kind === 'rational') {
    return optimizeRationalCurve(curve, targetX, targetY, cpIndex, options)
  }

  // Non-rational B-spline
  const bs2d = curveToBS2D(curve)
  return optimizeCurveInternal(bs2d, targetX, targetY, cpIndex, options)
}

/**
 * Optimize a rational B-spline curve.
 * Returns OptimizeRationalResult with controlPointsW.
 */
export function optimizeRationalCurve(
  curve: Curve,
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeRationalResult {
  if (curve.kind !== 'rational') {
    throw new Error('optimizeRationalCurve requires a rational curve')
  }

  const rbs2d = curveToRationalBS2D(curve)
  return optimizeRationalCurveInternal(rbs2d, targetX, targetY, cpIndex, options)
}

/**
 * Optimize using the internal BSpline2D representation.
 */
export function optimizeCurveInternal(
  curve: BSpline2D,
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 100,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
    enableBFGS: options.enableBFGS ?? true,
    ...(options.maxInnerIterations ? { maxInnerIterations: options.maxInnerIterations } : {}),
  }

  let problem: import('./types').OptimizationProblem
  if (curve.knots.tag === 'periodic') {
    problem = new PeriodicBSplineCurveProblem(
      curve, targetX, targetY, cpIndex,
      options.initialPeriodicConstraintState,
      options.preserveInflections ?? false,
      options.anchorCPsX,
      options.anchorCPsY,
      options.anchorWeight,
      options.disableSliding ?? false,
    )
  } else {
    problem = new BSplineCurveProblem(
      curve, targetX, targetY, cpIndex, undefined,
      options.preserveInflections ?? false,
      options.disableSliding ?? false,
    )
  }

  let symmetryWrapper: SymmetryReductionWrapper | null = null
  if (options.symmetryMaps) {
    symmetryWrapper = new SymmetryReductionWrapper(
      problem, options.symmetryMaps.mapX, options.symmetryMaps.mapY,
    )
    problem = symmetryWrapper
  }

  let fixedWrapper: FixedVariableWrapper | null = null
  if (options.fixedVariableIndices && options.fixedVariableIndices.length > 0) {
    fixedWrapper = new FixedVariableWrapper(problem, options.fixedVariableIndices)
    problem = fixedWrapper
  }

  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Expand back to full variables through wrapper chain
  let fullVars = result.variables
  if (fixedWrapper) {
    fullVars = fixedWrapper.expandToFull(fullVars)
  }
  if (symmetryWrapper) {
    fullVars = symmetryWrapper.expandToFull(fullVars)
  }

  const n = curve.controlPointsX.cps.length
  return {
    controlPointsX: fullVars.slice(0, n),
    controlPointsY: fullVars.slice(n, 2 * n),
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

/**
 * Optimize using the internal RationalBSpline2D representation.
 */
export function optimizeRationalCurveInternal(
  curve: RationalBSpline2D,
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeRationalResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 100,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
  }

  const fixWeights = options.fixWeights ?? true

  let problem: RationalBSplineCurveProblem | PeriodicRationalBSplineCurveProblem
  if (curve.knots.tag === 'periodic') {
    problem = new PeriodicRationalBSplineCurveProblem(
      curve, targetX, targetY, cpIndex, options.initialPeriodicRationalConstraintState, fixWeights
    )
  } else {
    problem = new RationalBSplineCurveProblem(curve, targetX, targetY, cpIndex, fixWeights)
  }

  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  const n = curve.controlPointsX.cps.length
  return {
    controlPointsX: result.variables.slice(0, n),
    controlPointsY: result.variables.slice(n, 2 * n),
    controlPointsW: fixWeights ? problem.getWeights() : result.variables.slice(2 * n, 3 * n),
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

/**
 * Optimize a rational B-spline curve when dragging a Farin point.
 * Variables: [x_0..x_{n-1}, y_0..y_{n-1}, t_j] (Euclidean + Farin t-value).
 */
export function optimizeRationalFarinCurve(
  curve: Curve,
  targetX: number,
  targetY: number,
  farinIndex: number,
  options: OptimizeOptions = {}
): OptimizeRationalFarinResult {
  if (curve.kind !== 'rational') {
    throw new Error('optimizeRationalFarinCurve requires a rational curve')
  }

  const rbs2d = curveToRationalBS2D(curve)
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 100,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
  }

  let problem: RationalBSplineCurveProblem | PeriodicRationalBSplineCurveProblem
  if (rbs2d.knots.tag === 'periodic') {
    problem = new PeriodicRationalBSplineCurveProblem(
      rbs2d, targetX, targetY, farinIndex,
      options.initialPeriodicRationalConstraintState, true, 'farinPoint'
    )
  } else {
    problem = new RationalBSplineCurveProblem(
      rbs2d, targetX, targetY, farinIndex, true, 'farinPoint'
    )
  }

  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Apply result variables to get final state
  problem.setVariables(result.variables)

  // Extract Euclidean positions and weights
  const pos = problem.getEuclideanPositions()
  const weights = problem.getWeights()
  const n = pos.x.length

  // Convert to homogeneous for the result interface (to match applyOptimizeRationalResult)
  const controlPointsX = pos.x.map((x, i) => x * weights[i])
  const controlPointsY = pos.y.map((y, i) => y * weights[i])

  // Compute farinTValues from weights
  const numEdges = curve.closed ? n : n - 1
  const farinTValues: number[] = []
  for (let i = 0; i < numEdges; i++) {
    const w0 = weights[i]
    const w1 = weights[(i + 1) % n]
    farinTValues.push(w1 / (w0 + w1))
  }

  // Compute wrapWeight for closed curves
  let wrapWeight: number | undefined
  if (curve.closed) {
    const tLast = farinTValues[n - 1]
    wrapWeight = weights[n - 1] * tLast / (1 - tLast)
  }

  return {
    controlPointsX,
    controlPointsY,
    controlPointsW: weights,
    farinTValues: curve.closed ? farinTValues : undefined,
    wrapWeight,
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

/**
 * Apply rational Farin optimization result to a curve, returning a new curve.
 * Converts from homogeneous (x*w, y*w, w) back to Euclidean (x, y, w).
 * Also updates farinTValues and wrapWeight for closed curves.
 */
export function applyOptimizeRationalFarinResult(curve: Curve, result: OptimizeRationalFarinResult): Curve {
  const baseCurve = updateCurveFromRationalBS2D(
    curve, result.controlPointsX, result.controlPointsY, result.controlPointsW
  )
  if (curve.kind !== 'rational') return baseCurve
  return {
    ...baseCurve,
    ...(result.farinTValues ? { farinTValues: result.farinTValues } : {}),
    ...(result.wrapWeight !== undefined ? { wrapWeight: result.wrapWeight } : {}),
  } as Curve
}

/**
 * Optimize a complex-rational B-spline curve.
 * Variables are geometric: control point positions and Farin point positions.
 */
export function optimizeComplexRationalCurve(
  curve: ComplexRationalBSplineCurve,
  targetX: number,
  targetY: number,
  dragIndex: number,
  dragType: 'controlPoint' | 'farinPoint',
  options: OptimizeOptions = {}
): OptimizeComplexRationalResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 100,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
    enableBFGS: options.enableBFGS ?? true,
  }

  const problem = new ComplexRationalBSplineCurveProblem(
    curve, targetX, targetY, dragIndex, dragType,
    options.initialComplexRationalConstraintState,
    undefined,
    options.fixedWeightClosed
  )

  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Apply result variables to the problem to get updated state
  problem.setVariables(result.variables)

  return {
    controlPoints: problem.getControlPoints(),
    farinPositions: problem.getFarinPositions(),
    wrapWeight: problem.getWrapWeight(),
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

/**
 * Apply complex-rational optimization result to a curve, returning a new curve.
 */
export function applyComplexRationalOptimizeResult(
  curve: Curve,
  result: OptimizeComplexRationalResult
): Curve {
  if (curve.kind !== 'complex-rational') {
    throw new Error('applyComplexRationalOptimizeResult requires a complex-rational curve')
  }
  return {
    ...curve,
    controlPoints: result.controlPoints,
    farinPositions: result.farinPositions,
    wrapWeight: result.wrapWeight,
  }
}

/**
 * Optimize a periodic B-spline curve so ALL control points track target positions,
 * while preserving curvature extrema. Used by the "target curve" editing mode.
 */
export function optimizeCurveToTarget(
  curve: Curve,
  targetCPsX: number[],
  targetCPsY: number[],
  options: OptimizeOptions = {}
): OptimizeResult {
  const bs2d = curveToBS2D(curve)
  // Reuse the anchoring mechanism: all CPs target the given positions with weight 1
  return optimizeCurveInternal(bs2d, targetCPsX[0], targetCPsY[0], 0, {
    ...options,
    anchorCPsX: targetCPsX,
    anchorCPsY: targetCPsY,
    anchorWeight: 1.0,
  })
}

/**
 * Apply optimization result to a curve, returning a new curve.
 */
export function applyOptimizeResult(curve: Curve, result: OptimizeResult): Curve {
  return updateCurveFromBS2D(curve, result.controlPointsX, result.controlPointsY)
}

/**
 * Apply rational optimization result to a curve, returning a new curve.
 * Converts from homogeneous (x*w, y*w, w) back to Euclidean (x, y, w).
 */
export function applyOptimizeRationalResult(curve: Curve, result: OptimizeRationalResult): Curve {
  return updateCurveFromRationalBS2D(curve, result.controlPointsX, result.controlPointsY, result.controlPointsW)
}

// ============================================================================
// PH Curve Optimization
// ============================================================================

export interface OptimizePHResult {
  /** Optimized curve result (CPs, knots, degree) */
  curveResult: PHCurveResult
  /** Number of optimizer iterations */
  iterations: number
  /** Whether optimization converged */
  converged: boolean
  /** Final objective value */
  objective: number
}

/**
 * Optimize a PH curve by moving a control point to a target position.
 * The optimizer adjusts u,v generating functions to match the target while
 * keeping the curve PH by construction.
 */
export function optimizePHCurve(
  metadata: PHMetadata,
  curveCPs: Point2D[],
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizePHResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 50,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: false,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
    enableBFGS: options.enableBFGS ?? true,
  }

  // Optional curvature-value bound |κ| ≤ κ_max and/or curvature-extrema-count
  // preservation, enforced live during the drag.
  const bound: PHCurvatureBoundOptions = {
    ...(options.constrainCurvatureValue && Number.isFinite(options.curvatureBound ?? Infinity)
      ? {
          curvatureBound: options.curvatureBound,
          subdivisions: options.curvatureSubdivisions ?? 2,
          constrained: true,
        }
      : {}),
    ...(options.preserveCurvatureExtrema ? { preserveCurvatureExtrema: true } : {}),
  }

  const problem = new PHCurveProblem(metadata, curveCPs, targetX, targetY, cpIndex, bound)
  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Extract optimized u,v and rebuild curve
  problem.setVariables(result.variables)
  const vars = result.variables
  const numU = metadata.uControlPoints.length
  const numV = metadata.vControlPoints.length
  const x0 = vars[0]
  const y0 = vars[1]
  const uCPs = vars.slice(2, 2 + numU)
  const vCPs = vars.slice(2 + numU, 2 + numU + numV)

  const curveResult = computePHCurveFromUV(
    uCPs, vCPs, metadata.uvKnots, metadata.uvDegree, x0, y0
  )

  return {
    curveResult,
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
  }
}

/**
 * Project a (possibly over-curved) polynomial PH curve onto |κ| ≤ κ_max. The IP
 * barrier needs a feasible start, so feasibility is driven by an escalating
 * penalty (stops at the first λ that certifies the bound). Used once when the
 * bound is enabled or the radius tightened while the curve is violating; live
 * constrained dragging maintains it thereafter.
 */
export function snapPHCurveToCurvatureBound(
  metadata: PHMetadata,
  curveCPs: Point2D[],
  kappaMax: number,
  subdivisions = 2,
): OptimizePHResult {
  const numU = metadata.uControlPoints.length
  const numV = metadata.vControlPoints.length
  let meta = metadata
  let lambda = 1
  let result: ReturnType<InteriorPointOptimizer['optimize']> | null = null

  const margin = () =>
    phCurvatureMargin(meta.uControlPoints, meta.vControlPoints, meta.uvKnots, kappaMax, subdivisions)

  if (margin() > 1e-9) {
    return { curveResult: computePHCurveFromUV(meta.uControlPoints, meta.vControlPoints, meta.uvKnots, meta.uvDegree, meta.origin.x, meta.origin.y), iterations: 0, converged: true, objective: 0 }
  }

  for (let i = 0; i < 18; i++) {
    // No drag (target = current CP 0); the penalty does the work.
    const problem = new PHCurveProblem(meta, curveCPs, curveCPs[0].x, curveCPs[0].y, 0, {
      curvatureBound: kappaMax,
      subdivisions,
      penaltyWeight: lambda,
    })
    const optimizer = new InteriorPointOptimizer(problem, {
      maxIterations: 40, enableFeasibilityRestoration: false, enableBFGS: false,
    })
    result = optimizer.optimize()
    problem.setVariables(result.variables)
    const v = result.variables
    meta = {
      ...meta,
      origin: { x: v[0], y: v[1] },
      uControlPoints: v.slice(2, 2 + numU),
      vControlPoints: v.slice(2 + numU, 2 + numU + numV),
    }
    if (margin() > 1e-7) break
    lambda *= 2.5
  }

  const curveResult = computePHCurveFromUV(
    meta.uControlPoints, meta.vControlPoints, meta.uvKnots, meta.uvDegree, meta.origin.x, meta.origin.y,
  )
  return { curveResult, iterations: result?.iterations ?? 0, converged: true, objective: result?.objective ?? 0 }
}

// ============================================================================
// Complex Rational PH Curve Optimization
// ============================================================================

export interface OptimizeComplexRationalPHResult {
  /** Optimized curve result */
  curveResult: ComplexRationalPHCurveResult
  /** Number of optimizer iterations */
  iterations: number
  /** Whether optimization converged */
  converged: boolean
  /** Final objective value */
  objective: number
}

/**
 * Optimize a complex rational PH curve by moving a control point to a target.
 * The optimizer adjusts S (generating function) and origin to match the target
 * while keeping the curve PH by construction via S². D is kept fixed.
 */
export function optimizeComplexRationalPHCurve(
  metadata: ComplexRationalPHMetadata,
  curveCPs: ComplexPoint[],
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeComplexRationalPHResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 50,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: false,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
  }

  const problem = new ComplexRationalPHCurveProblem(
    metadata, curveCPs, targetX, targetY, cpIndex,
    options.preserveCurvatureExtrema ?? false,
  )
  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Extract optimized origin + S variables; D stays fixed from metadata
  problem.setVariables(result.variables)
  const vars = result.variables
  const x0 = vars[0]
  const y0 = vars[1]
  const numU = metadata.sUControlPoints.length
  const numV = metadata.sVControlPoints.length
  const uCPs = vars.slice(2, 2 + numU)
  const vCPs = vars.slice(2 + numU, 2 + numU + numV)

  const curveResult = computeComplexRationalPHFromSD(
    uCPs, vCPs, metadata.sKnots, metadata.sDegree,
    metadata.dReControlPoints, metadata.dImControlPoints, metadata.dKnots, metadata.dDegree,
    x0, y0,
  )

  return {
    curveResult,
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
  }
}

// ============================================================================
// (A, B, S) PH Curve Optimization
// ============================================================================

export interface OptimizeABPHResult {
  /** Optimized curve result */
  curveResult: ABPHCurveResult
  /** Number of optimizer iterations */
  iterations: number
  /** Whether optimization converged */
  converged: boolean
  /** Final objective value */
  objective: number
  /** Final constraint violation */
  constraintViolation: number
}

/**
 * Optimize an (A, B, S) PH curve by moving a control point to a target.
 * Uses equality constraints W = S² to maintain the PH property.
 */
export function optimizeABPHCurve(
  metadata: ABPHMetadata,
  curveCPs: ComplexPoint[],
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeABPHResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 50,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
  }

  const problem = new ABPHCurveProblem(
    metadata, curveCPs, targetX, targetY, cpIndex,
    options.preserveCurvatureExtrema ?? false,
  )
  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Rebuild curve from optimized variables
  problem.setVariables(result.variables)
  const curveResult = computeABPHCurve(problem.getMetadata())

  return {
    curveResult,
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

// ============================================================================
// Real Rational PH Curve Optimization
// ============================================================================

export interface OptimizeRealRationalPHResult {
  curveResult: RealRationalPHCurveResult
  iterations: number
  converged: boolean
  objective: number
  constraintViolation: number
}

/**
 * Optimize a real rational PH curve by moving a control point to a target.
 * Like AB optimization but with fewer variables (no bIm).
 */
export function optimizeRealRationalPHCurve(
  metadata: RealRationalPHMetadata,
  curveCPs: import('../types/curve').WeightedPoint2D[],
  targetX: number,
  targetY: number,
  cpIndex: number,
  options: OptimizeOptions = {}
): OptimizeRealRationalPHResult {
  const config: Partial<OptimizerConfig> = {
    maxIterations: options.maxIterations ?? 50,
    verbose: options.verbose ?? false,
    enableSOC: options.enableSOC ?? true,
    enableFeasibilityRestoration: options.enableFeasibilityRestoration ?? true,
    enableFilter: options.enableFilter ?? true,
    enableWatchdog: options.enableWatchdog ?? true,
  }

  const problem = new RealRationalPHCurveProblem(metadata, curveCPs, targetX, targetY, cpIndex)
  const optimizer = new InteriorPointOptimizer(problem, config)
  const result = optimizer.optimize()

  // Rebuild curve from optimized variables
  problem.setVariables(result.variables)
  const curveResult = computeRealRationalPHCurve(problem.getMetadata())

  return {
    curveResult,
    iterations: result.iterations,
    converged: result.converged,
    objective: result.objective,
    constraintViolation: result.constraintViolation,
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { curveToBS2D, updateCurveFromBS2D, curveToRationalBS2D, updateCurveFromRationalBS2D } from './bsplineTypes'
export type { BSpline2D, BSpline, KnotVector, ControlPoints, RationalBSpline2D } from './bsplineTypes'
export { knotAt, cpAt, topology } from './bsplineTypes'
export type { OptimizerConfig, OptimizerResult } from './types'
export { TerminationReason } from './types'
export { computeOpenCurveConstraintState } from './BSplineCurveProblem'
export type { OpenCurveConstraintState } from './BSplineCurveProblem'
export { computePeriodicConstraintState, computeClosedCurveConstraintState } from './PeriodicBSplineCurveProblem'
export type { PeriodicConstraintState, ClosedCurveConstraintState } from './PeriodicBSplineCurveProblem'
export { computeRationalCurveConstraintState } from './RationalBSplineCurveProblem'
export type { RationalCurveConstraintState } from './RationalBSplineCurveProblem'
export { computeClosedRationalCurveConstraintState } from './PeriodicRationalBSplineCurveProblem'
export type { ClosedRationalCurveConstraintState, PeriodicRationalConstraintState } from './PeriodicRationalBSplineCurveProblem'
export { computeCurvatureExtremaParameters, computeClosedCurvatureExtremaParameters, computeRationalCurvatureExtremaParameters, computeClosedRationalCurvatureExtremaParameters, computeClosedInflectionParameters } from './algebra'
export { computeOpenComplexCurvatureExtremaParameters, computeClosedComplexCurvatureExtremaParameters, computeComplexCurvatureConstraintState, computeOpenComplexCurvatureConstraintState } from './complexAlgebra'
export type { ComplexRationalConstraintState } from './complexAlgebra'
export type { PHMetadata, PHCurveResult, ComplexRationalPHMetadata, ComplexRationalPHCurveResult } from './phCurve'
export { computePHCurveFromUV, createDefaultSpiral } from './phCurve'
export { createComplexRationalPHFromTwoPoints, createStraightComplexRationalPH, computeComplexRationalPHFromSD } from './complexRationalPHCurve'
export type { ABPHMetadata, ABPHCurveResult } from './abPHCurve'
export { createABPHFromTwoPoints, computeABPHCurve } from './abPHCurve'
