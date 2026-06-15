/**
 * Spatial PH quintic optimization problem.
 *
 * Variables: the 12 quaternion DOF (A0,A1,A2 each = u,v,p,q) + the 3 origin
 * coordinates = 15 in total. PH is automatic in this parameterization, so there
 * are NO equality constraints (unlike the (A,B,S) complex-rational problem).
 *
 * Plain drag: weighted least-squares match of the 6 Bézier control points to a
 * target (the dragged point moved to the cursor).
 *
 * Enforce (κ ≤ κ_max): the curvature bound is a polynomial inequality
 *   P_max(t) = κ_max²·σ⁶ − ‖r'×r''‖² ≥ 0,
 * certified by the (subdivided) Bernstein coefficients of P_max being ≥ 0. The
 * project's interior-point solver needs a *feasible* start (its barrier is
 * undefined on violations), but "make this over-curved curve legal" starts
 * infeasible. So we fold the bound into the objective as a penalty
 *   λ · Σ_i max(0, −coeff_i)²
 * and escalate λ. The penalty vanishes once every coefficient is ≥ 0, so the
 * shape term then holds the curve at the feasibility boundary instead of
 * over-flattening it. We verify the certificate afterwards.
 */

import type { OptimizationProblem } from '../../optimizer/types'
import type { Matrix } from '../../optimizer/linearAlgebra'
import { InteriorPointOptimizer } from '../../optimizer/InteriorPointOptimizer'
import {
  ph3dControlPoints,
  ph3dPMaxCoeffs,
  ph3dControlPointJacobian,
  ph3dPMaxJacobian,
  type Quat,
  type Vec3,
} from './ph3dCurve'

export interface PH3DState {
  a0: Quat
  a1: Quat
  a2: Quat
  origin: Vec3
}

/** Subdivision depth for the curvature certificate (tightness vs. cost). */
export const DEFAULT_SUBDIVISIONS = 4

function quatToArr(q: Quat): number[] {
  return [q.u, q.v, q.p, q.q]
}
function arrToQuat(a: number[], off: number): Quat {
  return { u: a[off], v: a[off + 1], p: a[off + 2], q: a[off + 3] }
}

export class Spatial3DPHCurveProblem implements OptimizationProblem {
  private a0: Quat
  private a1: Quat
  private a2: Quat
  private origin: Vec3

  private targetCPs: Vec3[]
  private cpWeights: number[]

  private enforce: boolean
  private constrained: boolean
  private kappaMax: number
  private subdivisions: number
  private penaltyWeight: number
  private _numConstraints: number

  constructor(
    state: PH3DState,
    dragIndex: number,
    target: Vec3,
    opts: {
      enforce?: boolean
      /**
       * Hard-constrain the curvature bound (κ ≤ κ_max) via the IP barrier on the
       * P_max Bernstein coefficients. Requires a FEASIBLE start (the barrier is
       * undefined on violations) — used for real-time bounded dragging, where
       * each tick warm-starts from the previous, already-feasible curve.
       */
      constrained?: boolean
      kappaMax?: number
      subdivisions?: number
      penaltyWeight?: number
      /**
       * Objective anchors for the non-dragged control points. Pass the
       * grab-start control points so the untouched points are held to where
       * they were when the drag began (prevents drift) — while the variables
       * still warm-start from the CURRENT curve (`state`) for stable,
       * incremental per-tick solves. Defaults to the current curve's CPs.
       */
      anchorCPs?: Vec3[]
    } = {},
  ) {
    this.a0 = { ...state.a0 }
    this.a1 = { ...state.a1 }
    this.a2 = { ...state.a2 }
    this.origin = { ...state.origin }

    this.enforce = opts.enforce ?? false
    this.constrained = opts.constrained ?? false
    this.kappaMax = opts.kappaMax ?? Infinity
    this.subdivisions = opts.subdivisions ?? DEFAULT_SUBDIVISIONS
    this.penaltyWeight = opts.penaltyWeight ?? 0
    this._numConstraints = this.constrained
      ? ph3dPMaxCoeffs(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions).length
      : 0

    const cps = opts.anchorCPs ?? ph3dControlPoints(this.a0, this.a1, this.a2, this.origin)
    this.targetCPs = cps.map((c) => ({ ...c }))
    this.targetCPs[dragIndex] = { ...target }

    const n = cps.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5
  }

  // ---- OptimizationProblem (unconstrained; bound folded into objective) ----

  get numVariables(): number {
    return 15 // 12 quaternion DOF + 3 origin
  }

  get numConstraints(): number {
    return this._numConstraints
  }

  get numEqualityConstraints(): number {
    return 0
  }

  getVariables(): number[] {
    return [
      ...quatToArr(this.a0),
      ...quatToArr(this.a1),
      ...quatToArr(this.a2),
      this.origin.x,
      this.origin.y,
      this.origin.z,
    ]
  }

  setVariables(x: number[]): void {
    this.a0 = arrToQuat(x, 0)
    this.a1 = arrToQuat(x, 4)
    this.a2 = arrToQuat(x, 8)
    this.origin = { x: x[12], y: x[13], z: x[14] }
  }

  private shapeObjective(): number {
    const cps = ph3dControlPoints(this.a0, this.a1, this.a2, this.origin)
    let f = 0
    for (let i = 0; i < cps.length; i++) {
      const dx = cps[i].x - this.targetCPs[i].x
      const dy = cps[i].y - this.targetCPs[i].y
      const dz = cps[i].z - this.targetCPs[i].z
      f += this.cpWeights[i] * 0.5 * (dx * dx + dy * dy + dz * dz)
    }
    return f
  }

  private curvaturePenalty(): number {
    if (!this.enforce || this.penaltyWeight <= 0) return 0
    const coeffs = ph3dPMaxCoeffs(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions)
    let pen = 0
    for (const c of coeffs) {
      if (c < 0) pen += c * c // max(0, −c)²
    }
    return this.penaltyWeight * pen
  }

  computeObjective(): number {
    return this.shapeObjective() + this.curvaturePenalty()
  }

  computeObjectiveGradient(): number[] {
    const numVars = this.numVariables
    const grad = new Array(numVars).fill(0)

    // Exact shape-objective gradient via the analytic control-point Jacobian.
    const cps = ph3dControlPoints(this.a0, this.a1, this.a2, this.origin)
    const jac = ph3dControlPointJacobian(this.a0, this.a1, this.a2)
    for (let vIdx = 0; vIdx < numVars; vIdx++) {
      const { dx, dy, dz } = jac[vIdx]
      let g = 0
      for (let i = 0; i < cps.length; i++) {
        g += this.cpWeights[i] *
          ((cps[i].x - this.targetCPs[i].x) * dx[i] +
            (cps[i].y - this.targetCPs[i].y) * dy[i] +
            (cps[i].z - this.targetCPs[i].z) * dz[i])
      }
      grad[vIdx] = g
    }

    // Exact curvature-penalty gradient (snap mode) via the bound Jacobian:
    // d/dx [λ·Σ max(0,−c)²] = Σ_{c<0} −2λ(−c)·∂c/∂x.
    if (this.enforce && this.penaltyWeight > 0 && Number.isFinite(this.kappaMax)) {
      const c = ph3dPMaxCoeffs(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions)
      const J = ph3dPMaxJacobian(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions)
      for (let k = 0; k < c.length; k++) {
        if (c[k] < 0) {
          const coef = -2 * this.penaltyWeight * (-c[k])
          for (let vIdx = 0; vIdx < numVars; vIdx++) grad[vIdx] += coef * J[k][vIdx]
        }
      }
    }
    return grad
  }

  computeConstraints(): number[] {
    if (!this.constrained) return []
    // Raw P_max coefficients; sign = −1 ⇒ feasibility (sign·c < 0) is coeff > 0.
    return ph3dPMaxCoeffs(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions)
  }

  computeConstraintJacobian(): Matrix {
    if (!this.constrained) return []
    // Exact Jacobian of the P_max bound coefficients (Bernstein algebra).
    return ph3dPMaxJacobian(this.a0, this.a1, this.a2, this.kappaMax, this.subdivisions)
  }

  getConstraintSigns(): number[] {
    return new Array(this._numConstraints).fill(-1)
  }

  getInactiveConstraints(): Set<number> {
    return new Set()
  }

  updateConstraintState(): void {}

  getState(): PH3DState {
    return {
      a0: { ...this.a0 },
      a1: { ...this.a1 },
      a2: { ...this.a2 },
      origin: { ...this.origin },
    }
  }
}

function runOnce(
  state: PH3DState,
  dragIndex: number,
  target: Vec3,
  opts: { enforce?: boolean; constrained?: boolean; kappaMax?: number; subdivisions?: number; penaltyWeight?: number; maxIterations?: number; anchorCPs?: Vec3[] },
): PH3DState {
  const problem = new Spatial3DPHCurveProblem(state, dragIndex, target, opts)
  const optimizer = new InteriorPointOptimizer(problem, {
    maxIterations: opts.maxIterations ?? 60,
    // Drag objective Σ½w‖cp−t‖² has an exact identity Hessian → Gauss-Newton is
    // faster and steadier than BFGS for the tiny per-tick steps (matches the
    // sketcher's interactive-drag config in sceneStore).
    enableBFGS: false,
    enableSOC: true,
    enableFeasibilityRestoration: true,
    enableFilter: true,
    enableWatchdog: true,
    // With the bound active, warm-start the barrier parameter high so the few-
    // iteration solve sits near the boundary (objective-optimal) instead of in
    // the deep-interior "centering" region — which for the degree-24 curvature
    // bound means an inflated, over-flattened curve that drifts and accelerates.
    // Each tick already starts feasible near the boundary, so this is safe.
    ...(opts.constrained ? { warmStartT: 1e4 } : {}),
  })
  const result = optimizer.optimize()
  problem.setVariables(result.variables)
  return problem.getState()
}

/** Smallest (subdivided) P_max Bernstein coefficient; ≥ 0 ⇒ κ ≤ κ_max certified. */
export function ph3dCurvatureMargin(
  state: PH3DState,
  kappaMax: number,
  subdivisions = DEFAULT_SUBDIVISIONS,
): number {
  const coeffs = ph3dPMaxCoeffs(state.a0, state.a1, state.a2, kappaMax, subdivisions)
  return coeffs.reduce((m, c) => Math.min(m, c), Infinity)
}

/**
 * Per-tick interactive drag. Warm-starts from `state`, moves control point
 * `dragIndex` toward `target`, and holds the untouched CPs to `anchorCPs`
 * (their grab-start positions). With `bound`, the curvature limit κ ≤ κ_max is
 * a hard IP constraint kept live during the drag — this requires `state` to be
 * already feasible (true tick-to-tick once snapped; use snapToFeasiblePH3D on
 * toggle-enable / slider-tighten).
 */
export function dragPH3DCurve(
  state: PH3DState,
  dragIndex: number,
  target: Vec3,
  opts: { bound?: boolean; kappaMax?: number; subdivisions?: number; anchorCPs?: Vec3[]; maxIterations?: number } = {},
): PH3DState {
  const subdivisions = opts.subdivisions ?? DEFAULT_SUBDIVISIONS
  const bound = (opts.bound ?? false) && Number.isFinite(opts.kappaMax ?? Infinity)
  return runOnce(state, dragIndex, target, {
    constrained: bound,
    kappaMax: opts.kappaMax,
    subdivisions,
    anchorCPs: opts.anchorCPs,
    maxIterations: opts.maxIterations ?? (bound ? 18 : 24),
  })
}

/**
 * Project a (possibly over-curved) curve onto the feasible set κ ≤ κ_max. The
 * project's IP barrier needs a feasible start, so we drive feasibility with an
 * escalating penalty on a fine geometric schedule, stopping at the first λ that
 * makes the bound certifiable — landing just under the limit. Used once when the
 * bound is enabled (or the slider tightened) while the curve is violating; after
 * that, dragPH3DCurve({ bound: true }) keeps it feasible in real time.
 */
export function snapToFeasiblePH3D(
  state: PH3DState,
  kappaMax: number,
  subdivisions = DEFAULT_SUBDIVISIONS,
): PH3DState {
  if (!Number.isFinite(kappaMax)) return state
  if (ph3dCurvatureMargin(state, kappaMax, subdivisions) > 1e-7) return state
  let cur = state
  let lambda = 10
  for (let i = 0; i < 16; i++) {
    cur = runOnce(cur, 0, ph3dControlPoints(cur.a0, cur.a1, cur.a2, cur.origin)[0], {
      enforce: true,
      kappaMax,
      subdivisions,
      penaltyWeight: lambda,
      maxIterations: 40,
    })
    if (ph3dCurvatureMargin(cur, kappaMax, subdivisions) > 1e-7) break
    lambda *= 2.5
  }
  return cur
}
