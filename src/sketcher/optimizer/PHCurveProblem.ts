// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * PH Curve Optimization Problem
 *
 * Implements OptimizationProblem interface for optimizing PH curves.
 * No constraints — just an objective function that matches PH curve CPs to targets.
 *
 * Variables: [x₀, y₀, u₀, ..., u_m, v₀, ..., v_m]
 *   - x₀, y₀: integration origin
 *   - u₀..u_m: u generating function control points
 *   - v₀..v_m: v generating function control points
 *
 * The PH property is maintained by construction: the curve is always computed
 * from u,v via r'(t) = (u²-v², 2uv).
 */

import type { OptimizationProblem } from './types'
import type { Matrix } from './linearAlgebra'
import { computePHCurveFromUV, type PHMetadata } from './phCurve'
import { phCurvatureBoundCoeffs, phCurvatureBoundJacobian } from './phCurvatureBound'
import { phControlPointJacobian, type CPDerivative } from './phCurveAnalytic'
import { computeGCPsFromHomogeneous, computeOpenComplexCurvatureConstraintState, computeClosedPolynomialCurvatureConstraintState } from './complexAlgebra'
import type { Point2D } from '../types/curve'

/**
 * Optional curvature-value bound |κ| ≤ κ_max.
 * - `constrained`: enforce the bound as hard IP inequalities (needs a feasible
 *   start — true tick-to-tick during a drag once the curve is snapped feasible).
 * - `penaltyWeight > 0`: instead add λ·Σ max(0,−coeff)² to the objective — a soft
 *   push toward feasibility from ANY start, used to snap an over-curved curve
 *   under the bound before constrained dragging takes over.
 */
export interface PHCurvatureBoundOptions {
  curvatureBound?: number // κ_max (omit / Infinity ⇒ no bound)
  subdivisions?: number
  constrained?: boolean
  penaltyWeight?: number
  /** Preserve the curvature-extrema COUNT while editing — hold the sign pattern
   *  of the curvature-derivative numerator g's Bernstein coefficients (the
   *  sliding mechanism). Independent of the curvature-VALUE bound above; both
   *  may be active at once. */
  preserveCurvatureExtrema?: boolean
  /** CLOSED PH curve: keep the curve closed (∮w²=0) and the seam wrap continuous
   *  (anti-periodic, sign `wrapSign`; `seamContinuity` derivative matches) as
   *  equality constraints, and use the wrap-aware (seam-crossing) inactive set for
   *  curvature-extrema preservation. Absent ⇒ open curve. */
  closed?: { wrapSign: number; seamContinuity: number }
}

export class PHCurveProblem implements OptimizationProblem {
  private targetCPs: Point2D[]
  private cpWeights: number[]

  private uvDegree: number
  private uvKnots: number[]
  private numU: number
  private numV: number

  // Current variable state
  private x0: number
  private y0: number
  private uCPs: number[]
  private vCPs: number[]
  // Cached analytic control-point Jacobian for the current (u,v); the objective
  // gradient and the closure (equality) Jacobian both need it, so compute once
  // per variable state. Invalidated by setVariables.
  private _cpJac: CPDerivative[] | null = null

  // Curvature-value bound (optional)
  private kappaMax: number
  private subdivisions: number
  private constrained: boolean
  private penaltyWeight: number
  private _numBoundConstraints: number

  // Curvature-extrema preservation (optional) — sign pattern + active (non-
  // sliding) set of g's Bernstein coefficients, snapshotted at drag start. g is
  // the curve's curvature-derivative numerator; for a polynomial PH curve the
  // curve is non-rational, so we feed its real CPs as homogeneous coords with
  // unit weight (W = 1) and reuse the complex-rational g machinery.
  private constrainExtrema: boolean
  private extremaSigns: number[] = []
  private extremaActive: number[] = []

  // Closed-curve equality constraints (optional): closure ∮w²=0 (2) + seam wrap
  // (anti-periodic, 0/2/4 linear), prepended to the constraint vector.
  private closed: boolean
  private wrapSign: number
  private nWrap: number          // seam continuity = number of wrap-derivative matches
  private wrapRatio: number      // end knot-interval ratio (1 for uniform)
  private _numWrap: number       // linear wrap residual count (2·nWrap: u and v each)
  private _numEq: number         // total equality constraints (wrap + closure)

  constructor(
    metadata: PHMetadata,
    curveCPs: Point2D[],
    targetX: number,
    targetY: number,
    dragIndex: number,
    bound: PHCurvatureBoundOptions = {},
  ) {
    this.uvDegree = metadata.uvDegree
    this.uvKnots = [...metadata.uvKnots]
    this.uCPs = [...metadata.uControlPoints]
    this.vCPs = [...metadata.vControlPoints]
    this.numU = this.uCPs.length
    this.numV = this.vCPs.length
    this.x0 = metadata.origin.x
    this.y0 = metadata.origin.y

    this.kappaMax = bound.curvatureBound ?? Infinity
    this.subdivisions = bound.subdivisions ?? 1
    this.penaltyWeight = bound.penaltyWeight ?? 0
    this.constrained = (bound.constrained ?? false) && Number.isFinite(this.kappaMax)
    this._numBoundConstraints = this.constrained
      ? phCurvatureBoundCoeffs(this.uCPs, this.vCPs, this.uvKnots, this.kappaMax, this.subdivisions).length
      : 0

    // Closed-curve equality constraints: closure (∮w²=0, 2) + seam wrap (linear,
    // 2 per matched derivative: u and v). nWrap = seam continuity (C⁰→0, C¹→1,
    // C²→2). The wrap ratio is the end knot-interval ratio (1 for uniform knots).
    this.closed = !!bound.closed
    this.wrapSign = bound.closed?.wrapSign ?? 1
    this.nWrap = Math.max(0, Math.min(this.uvDegree, bound.closed?.seamContinuity ?? 0))
    const nGen = this.numU
    const hFirst = this.uvKnots[this.uvDegree + 1] - this.uvKnots[this.uvDegree]
    const hLast = this.uvKnots[nGen] - this.uvKnots[nGen - 1]
    this.wrapRatio = hFirst > 1e-12 ? hLast / hFirst : 1
    this._numWrap = this.closed ? 2 * this.nWrap : 0
    this._numEq = this.closed ? this._numWrap + 2 : 0

    // Snapshot the curvature-extrema sign pattern + inactive (sliding) set from
    // the initial generator state; held fixed for the solve. Closed curves use the
    // wrap-aware inactive set so an extremum may slide across the seam.
    this.constrainExtrema = bound.preserveCurvatureExtrema ?? false
    if (this.constrainExtrema) {
      try {
        const { knots, Zre, Zim, Wre, Wim } = this.curveHomogeneous()
        const state = this.closed
          ? computeClosedPolynomialCurvatureConstraintState(knots, Zre, Zim, Wre, Wim)
          : computeOpenComplexCurvatureConstraintState(knots, Zre, Zim, Wre, Wim)
        const inactive = new Set(state.inactiveIndices)
        for (let i = 0; i < state.signs.length; i++) {
          if (inactive.has(i)) continue
          // Skip g coefficients at zero-width spans (repeated interior knots of a
          // C² spline): they are NaN/degenerate and carry no curvature meaning.
          if (!Number.isFinite(state.gCPs[i])) continue
          this.extremaActive.push(i)
          this.extremaSigns.push(state.signs[i])
        }
      } catch {
        this.constrainExtrema = false
      }
    }

    // Target CPs: copy current, move dragged one to target
    this.targetCPs = curveCPs.map(p => ({ ...p }))
    this.targetCPs[dragIndex] = { x: targetX, y: targetY }

    // Weights: higher weight on dragged CP and endpoints
    const n = curveCPs.length
    this.cpWeights = new Array(n).fill(1)
    this.cpWeights[dragIndex] = 10
    this.cpWeights[0] = 5
    this.cpWeights[n - 1] = 5
  }

  private boundCoeffs(): number[] {
    return phCurvatureBoundCoeffs(this.uCPs, this.vCPs, this.uvKnots, this.kappaMax, this.subdivisions)
  }

  // Current curve, expressed as homogeneous coords with unit weight (the curve
  // is non-rational), as needed by the curvature-derivative-numerator machinery.
  private curveHomogeneous(): {
    knots: number[]; Zre: number[]; Zim: number[]; Wre: number[]; Wim: number[]
  } {
    const ph = computePHCurveFromUV(this.uCPs, this.vCPs, this.uvKnots, this.uvDegree, this.x0, this.y0)
    const Zre: number[] = [], Zim: number[] = [], Wre: number[] = [], Wim: number[] = []
    for (const p of ph.controlPoints) {
      Zre.push(p.x); Zim.push(p.y); Wre.push(1); Wim.push(0)
    }
    return { knots: ph.knots, Zre, Zim, Wre, Wim }
  }

  // Closed-curve equality residuals (all should be driven to 0): seam-wrap
  // matches first, then the closure gap. Order matches the Jacobian below.
  private equalityConstraints(): number[] {
    if (!this.closed) return []
    const out: number[] = []
    const u = this.uCPs, v = this.vCPs, s = this.wrapSign, r = this.wrapRatio, n = this.numU
    if (this.nWrap >= 1) {
      out.push(u[n - 1] - s * u[0])
      out.push(v[n - 1] - s * v[0])
    }
    if (this.nWrap >= 2) {
      out.push(u[n - 2] - s * ((1 + r) * u[0] - r * u[1]))
      out.push(v[n - 2] - s * ((1 + r) * v[0] - r * v[1]))
    }
    // Closure gap ∮w² = lastCP − firstCP (origin cancels).
    const ph = computePHCurveFromUV(this.uCPs, this.vCPs, this.uvKnots, this.uvDegree, this.x0, this.y0)
    const cps = ph.controlPoints, last = cps.length - 1
    out.push(cps[last].x - cps[0].x)
    out.push(cps[last].y - cps[0].y)
    return out
  }

  // Jacobian rows for the equality residuals (same order as equalityConstraints).
  private equalityJacobian(): Matrix {
    if (!this.closed) return []
    const numVars = this.numVariables
    const rows: Matrix = []
    const s = this.wrapSign, r = this.wrapRatio, n = this.numU
    const uOff = 2, vOff = 2 + this.numU
    const zero = () => new Array(numVars).fill(0)
    if (this.nWrap >= 1) {
      const ru = zero(); ru[uOff + (n - 1)] = 1; ru[uOff + 0] += -s; rows.push(ru)
      const rv = zero(); rv[vOff + (n - 1)] = 1; rv[vOff + 0] += -s; rows.push(rv)
    }
    if (this.nWrap >= 2) {
      const ru = zero(); ru[uOff + (n - 2)] = 1; ru[uOff + 0] += -s * (1 + r); ru[uOff + 1] += s * r; rows.push(ru)
      const rv = zero(); rv[vOff + (n - 2)] = 1; rv[vOff + 0] += -s * (1 + r); rv[vOff + 1] += s * r; rows.push(rv)
    }
    // Closure gap Jacobian: ∂(lastCP − firstCP)/∂var via the analytic CP Jacobian.
    const jac = this.cpJacobian()
    const last = jac[0].dx.length - 1
    const gx = zero(), gy = zero()
    for (let k = 0; k < numVars; k++) {
      gx[k] = jac[k].dx[last] - jac[k].dx[0]
      gy[k] = jac[k].dy[last] - jac[k].dy[0]
    }
    rows.push(gx, gy)
    return rows
  }

  // Live g (curvature-derivative numerator) coefficients on the active set.
  private extremaConstraints(): number[] {
    const { knots, Zre, Zim, Wre, Wim } = this.curveHomogeneous()
    const g = computeGCPsFromHomogeneous(knots, Zre, Zim, Wre, Wim)
    return this.extremaActive.map((idx) => g[idx] ?? 0)
  }

  // ==========================================================================
  // OptimizationProblem Interface
  // ==========================================================================

  get numVariables(): number {
    return 2 + this.numU + this.numV
  }

  get numConstraints(): number {
    return this._numEq + this._numBoundConstraints + (this.constrainExtrema ? this.extremaActive.length : 0)
  }

  get numEqualityConstraints(): number {
    return this._numEq
  }

  getVariables(): number[] {
    return [this.x0, this.y0, ...this.uCPs, ...this.vCPs]
  }

  setVariables(x: number[]): void {
    this.x0 = x[0]
    this.y0 = x[1]
    this.uCPs = x.slice(2, 2 + this.numU)
    this.vCPs = x.slice(2 + this.numU, 2 + this.numU + this.numV)
    this._cpJac = null
  }

  // Analytic control-point Jacobian for the current (u,v), cached per state.
  private cpJacobian(): CPDerivative[] {
    if (!this._cpJac) this._cpJac = phControlPointJacobian(this.uCPs, this.vCPs, this.uvKnots, this.uvDegree)
    return this._cpJac
  }

  computeObjective(): number {
    const phResult = computePHCurveFromUV(
      this.uCPs, this.vCPs, this.uvKnots, this.uvDegree, this.x0, this.y0
    )
    const cps = phResult.controlPoints

    let f0 = 0
    const n = Math.min(cps.length, this.targetCPs.length)
    for (let i = 0; i < n; i++) {
      const dx = cps[i].x - this.targetCPs[i].x
      const dy = cps[i].y - this.targetCPs[i].y
      f0 += this.cpWeights[i] * 0.5 * (dx * dx + dy * dy)
    }

    // Soft curvature-bound penalty (snap mode): λ·Σ max(0, −coeff)².
    if (this.penaltyWeight > 0 && Number.isFinite(this.kappaMax)) {
      let pen = 0
      for (const c of this.boundCoeffs()) if (c < 0) pen += c * c
      f0 += this.penaltyWeight * pen
    }
    return f0
  }

  computeObjectiveGradient(): number[] {
    const numVars = this.numVariables
    const grad = new Array(numVars).fill(0)

    // Exact gradient of the control-point least-squares term via the analytic
    // control-point Jacobian (Bernstein algebra; no finite differences).
    const phResult = computePHCurveFromUV(
      this.uCPs, this.vCPs, this.uvKnots, this.uvDegree, this.x0, this.y0,
    )
    const cps = phResult.controlPoints
    const jac = this.cpJacobian()
    const n = Math.min(cps.length, this.targetCPs.length)
    for (let v = 0; v < numVars; v++) {
      const { dx, dy } = jac[v]
      let g = 0
      for (let i = 0; i < n; i++) {
        g += this.cpWeights[i] *
          ((cps[i].x - this.targetCPs[i].x) * dx[i] + (cps[i].y - this.targetCPs[i].y) * dy[i])
      }
      grad[v] = g
    }

    // Exact gradient of the soft curvature penalty (snap mode) via the bound
    // Jacobian: d/dx [λ·Σ max(0,−c)²] = Σ_{c<0} −2λ(−c)·∂c/∂x.
    if (this.penaltyWeight > 0 && Number.isFinite(this.kappaMax)) {
      const c = this.boundCoeffs()
      const J = phCurvatureBoundJacobian(this.uCPs, this.vCPs, this.uvKnots, this.kappaMax, this.subdivisions)
      for (let k = 0; k < c.length; k++) {
        if (c[k] < 0) {
          const coef = -2 * this.penaltyWeight * (-c[k])
          for (let v = 0; v < numVars; v++) grad[v] += coef * J[k][v]
        }
      }
    }
    return grad
  }

  computeConstraints(): number[] {
    const out: number[] = []
    // Equality constraints FIRST (convention): closed-curve closure + seam wrap.
    if (this.closed) out.push(...this.equalityConstraints())
    // Curvature-VALUE bound: raw P± coefficients (feasibility is coeff > 0).
    if (this.constrained) out.push(...this.boundCoeffs())
    // Curvature-EXTREMA: live g coefficients on the active set.
    if (this.constrainExtrema) out.push(...this.extremaConstraints())
    return out
  }

  computeConstraintJacobian(): Matrix {
    const rows: Matrix = []
    // Equality rows FIRST, matching computeConstraints order.
    if (this.closed) rows.push(...this.equalityJacobian())
    // Exact Jacobian of the P± bound coefficients (Bernstein algebra).
    if (this.constrained) {
      rows.push(...phCurvatureBoundJacobian(this.uCPs, this.vCPs, this.uvKnots, this.kappaMax, this.subdivisions))
    }
    // Finite-difference Jacobian of the active g coefficients w.r.t. the
    // variables (matches the complex-rational PH curvature-extrema path).
    if (this.constrainExtrema) {
      const numVars = this.numVariables
      const vars = this.getVariables()
      const c0 = this.extremaConstraints()
      const eps = 1e-7
      const fd: Matrix = c0.map(() => new Array(numVars).fill(0))
      for (let j = 0; j < numVars; j++) {
        const saved = vars[j]
        vars[j] = saved + eps
        this.setVariables(vars)
        const cPlus = this.extremaConstraints()
        vars[j] = saved
        this.setVariables(vars)
        for (let i = 0; i < c0.length; i++) fd[i][j] = (cPlus[i] - c0[i]) / eps
      }
      rows.push(...fd)
    }
    return rows
  }

  getConstraintSigns(): number[] {
    const out: number[] = []
    // Equality rows: sign is unused by the optimizer (equalities use a quadratic
    // penalty, not the log barrier) — emit a placeholder to keep lengths aligned.
    if (this.closed) for (let i = 0; i < this._numEq; i++) out.push(1)
    // Bound rows: sign −1 ⇒ feasibility (sign·c < 0) means coeff > 0.
    if (this.constrained) for (let i = 0; i < this._numBoundConstraints; i++) out.push(-1)
    // Extrema rows: the snapshotted sign that keeps each active g_j on its side.
    if (this.constrainExtrema) out.push(...this.extremaSigns)
    return out
  }

  getInactiveConstraints(): Set<number> {
    return new Set()
  }

  updateConstraintState(): void {
    // Bound is a fixed requirement (coeff ≥ 0); nothing to re-anchor.
  }
}
