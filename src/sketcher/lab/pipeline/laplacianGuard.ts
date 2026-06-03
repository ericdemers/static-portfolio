// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Bounded Laplacian smoothing (Route A): Laplacian averaging GUIDES the motion,
 * the curvature-extrema bound CONSTRAINS it.
 *
 *   target T  = N Laplacian-averaging steps of the free control points
 *   solve      min ½‖P_F − T_F‖²   s.t.  curvature-extrema sign bound (sliding)
 *
 * i.e. the bound-feasible curve closest to the Laplacian target. The free CPs
 * move toward where Laplacian wants them, but the sign bound + sliding mechanism
 * (the same machinery as the "Bound the number of extrema" toggle) guarantee the
 * curvature-extrema count can only stay or DROP — never rise. Robust driver
 * (Laplacian never cusps) + hard guarantee (the bound). Run through the same
 * interior-point optimizer as the airfoil Fit.
 */
import { InteriorPointOptimizer } from '../../optimizer/InteriorPointOptimizer'
import type { OptimizationProblem } from '../../optimizer/types'
import type { Matrix } from '../../optimizer/linearAlgebra'
import { computeOpenInactiveSet } from '../optimizer/OpenAirfoilFittingProblem'
import {
  computeCurvatureDerivativeNumeratorCPsFromArrays,
  computeCurvatureExtremaParameters,
  computeExplicitJacobian,
  precomputeBasisDerivatives,
  type PrecomputedBasisDerivatives,
} from '../../optimizer/algebra'

/** N plain Laplacian-averaging steps of the free CPs (fixed frame as boundary). */
export function laplacianTarget(
  cpX: number[], cpY: number[], F: number[], iterations: number, lambda = 0.5,
): { x: number[]; y: number[] } {
  const x = [...cpX], y = [...cpY]
  for (let it = 0; it < iterations; it++) {
    const nx = [...x], ny = [...y]
    for (const i of F) {
      nx[i] = x[i] + lambda * ((x[i - 1] + x[i + 1]) / 2 - x[i]) // F excludes endpoints
      ny[i] = y[i] + lambda * ((y[i - 1] + y[i + 1]) / 2 - y[i])
    }
    for (const i of F) { x[i] = nx[i]; y[i] = ny[i] }
  }
  return { x, y }
}

class LaplacianGuardProblem implements OptimizationProblem {
  readonly numEqualityConstraints = 0
  numConstraints = 0

  private fx: number[]
  private fy: number[]
  private readonly n: number
  private readonly knots: number[]
  private readonly F: number[]
  private readonly freeCols: number[]
  private readonly target: number[] // [Tx[F], Ty[F]]
  private readonly pre: PrecomputedBasisDerivatives
  private signs: number[] = []
  private inactive = new Set<number>()

  constructor(baseX: number[], baseY: number[], knots: number[], F: number[], tx: number[], ty: number[]) {
    this.fx = [...baseX]
    this.fy = [...baseY]
    this.n = baseX.length
    this.knots = knots
    this.F = F
    this.freeCols = [...F, ...F.map((f) => this.n + f)]
    this.target = [...F.map((f) => tx[f]), ...F.map((f) => ty[f])]
    this.pre = precomputeBasisDerivatives(knots, this.n)
    this.refreshConstraints()
  }

  get numVariables() { return this.freeCols.length }
  getVariables() { return [...this.F.map((f) => this.fx[f]), ...this.F.map((f) => this.fy[f])] }
  setVariables(v: number[]) {
    const nF = this.F.length
    for (let k = 0; k < nF; k++) { this.fx[this.F[k]] = v[k]; this.fy[this.F[k]] = v[nF + k] }
  }

  // --- objective: ½‖P_free − T_free‖² (move toward the Laplacian target) ---
  computeObjective() { const v = this.getVariables(); let s = 0; for (let k = 0; k < v.length; k++) { const d = v[k] - this.target[k]; s += d * d } return 0.5 * s }
  computeObjectiveGradient() { const v = this.getVariables(); return v.map((vk, k) => vk - this.target[k]) }
  computeObjectiveHessian(): Matrix {
    const m = this.freeCols.length, H: number[][] = []
    for (let i = 0; i < m; i++) { H[i] = new Array<number>(m).fill(0); H[i][i] = 1 }
    return H
  }

  // --- constraint: curvature-extrema sign bound, sliding mechanism ---
  private refreshConstraints() {
    const g = computeCurvatureDerivativeNumeratorCPsFromArrays(this.knots, this.fx, this.fy)
    this.numConstraints = g.length
    this.signs = g.map((v) => (v >= 0 ? -1 : 1))
    this.inactive = computeOpenInactiveSet(g)
  }
  computeConstraints() { return computeCurvatureDerivativeNumeratorCPsFromArrays(this.knots, this.fx, this.fy) }
  computeConstraintJacobian(): Matrix {
    const g = computeCurvatureDerivativeNumeratorCPsFromArrays(this.knots, this.fx, this.fy)
    const J = computeExplicitJacobian(this.pre, this.fx, this.fy, g.map((_, i) => i))
    return J.map((row) => this.freeCols.map((c) => row[c]))
  }
  getConstraintSigns() { return [...this.signs] }
  getInactiveConstraints() { return new Set(this.inactive) }
  updateConstraintState() { this.refreshConstraints() }
  result() { return { cpX: [...this.fx], cpY: [...this.fy] } }
}

/**
 * Bounded Laplacian smoothing: smooth the free CPs toward the N-step Laplacian
 * target, projected onto the curvature-extrema-bound feasible set. Never adds a
 * curvature extremum.
 */
export function laplacianGuarded(
  baseX: number[],
  baseY: number[],
  knots: number[],
  F: number[],
  iterations: number,
  opts?: { maxIterations?: number },
): { cpX: number[]; cpY: number[] } {
  if (F.length === 0 || iterations <= 0) return { cpX: [...baseX], cpY: [...baseY] }
  const T = laplacianTarget(baseX, baseY, F, iterations)
  const problem = new LaplacianGuardProblem(baseX, baseY, knots, F, T.x, T.y)
  const optimizer = new InteriorPointOptimizer(problem, {
    maxIterations: opts?.maxIterations ?? 200,
    enableBFGS: false,
    returnBestFeasible: true,
    dynamicConstraints: true,
  })
  const res = optimizer.optimize()
  problem.setVariables(res.variables)
  return problem.result()
}

/**
 * Step-by-step bounded Laplacian (the right realization): let Laplacian take ONE
 * free step, then follow it with the constraint optimizer only if that step
 * would RAISE the curvature-extrema count. The count is an upper bound that
 * ratchets DOWN as Laplacian merges extrema — it never rises. Because plain
 * Laplacian almost always lowers the count, the constraint follow rarely fires;
 * when it does, it projects out just the one spurious extremum (a small, well-
 * posed correction — not the far jump that froze the one-shot version).
 */
/** Curvature-extrema count. */
const countExtrema = (knots: number[], x: number[], y: number[]) =>
  computeCurvatureExtremaParameters(knots, x, y).length

/**
 * ONE step of bounded Laplacian, warm-started from the current curve. `bound` is
 * the running upper bound on the count. Designed to be cached/chained: each call
 * moves a single Laplacian step, and the constraint solve (only if that step
 * would raise the count) is a tiny projection from the current curve — exactly
 * the small step the interior-point optimizer is efficient at.
 */
export function laplacianGuardedStep(
  x: number[], y: number[], knots: number[], F: number[], bound: number,
  opts?: { maxIterations?: number },
): { x: number[]; y: number[]; bound: number } {
  const s = laplacianTarget(x, y, F, 1)
  const c = countExtrema(knots, s.x, s.y)
  if (c <= bound) return { x: s.x, y: s.y, bound: c } // accept; ratchet the bound down
  const p = new LaplacianGuardProblem(x, y, knots, F, s.x, s.y)
  const opt = new InteriorPointOptimizer(p, {
    maxIterations: opts?.maxIterations ?? 40, enableBFGS: false, returnBestFeasible: true, dynamicConstraints: true,
  })
  const r = opt.optimize(); p.setVariables(r.variables)
  const pr = p.result()
  return { x: pr.cpX, y: pr.cpY, bound: Math.min(bound, countExtrema(knots, pr.cpX, pr.cpY)) }
}

/** N steps of bounded Laplacian (chains laplacianGuardedStep). */
export function laplacianGuardedFlow(
  baseX: number[], baseY: number[], knots: number[], F: number[], iterations: number,
  opts?: { maxIterations?: number },
): { cpX: number[]; cpY: number[] } {
  if (F.length === 0) return { cpX: [...baseX], cpY: [...baseY] }
  let cur = { x: [...baseX], y: [...baseY], bound: countExtrema(knots, baseX, baseY) }
  for (let it = 0; it < iterations; it++) cur = laplacianGuardedStep(cur.x, cur.y, knots, F, cur.bound, opts)
  return { cpX: cur.x, cpY: cur.y }
}
