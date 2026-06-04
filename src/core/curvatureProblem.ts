import type { Matrix } from './linalg'
import type { OptimizationProblem, OptimizerConfig } from './optimize'
import { PrimalDualOptimizer } from './optimize'
import { BarrierOptimizer } from './barrierOptimizer'
import { BandedPrimalDualOptimizer } from './bandedPrimalDual'
import { InteriorPointOptimizer } from './ipopt/InteriorPointOptimizer'
import { buildSymmetryReduction, SymmetryReducedProblem } from './symmetryReduction'
import {
  curvatureExtremaNumeratorPlanar,
  curvatureExtremaNumeratorPlanarPeriodic,
  inflectionNumeratorPlanar,
  inflectionNumeratorPlanarPeriodic,
  openCurvatureExtremaParameters,
  closedCurvatureExtremaParameters,
} from './curvature'
import {
  curvatureExtremaGradientPlanar,
  curvatureExtremaGradientPlanarPeriodicLocal,
  curvatureExtremaGradientPlanarLocal,
  inflectionGradientPlanar,
  inflectionGradientPlanarPeriodicLocal,
  precomputePeriodicSeeds,
} from './gradient'
import type { PeriodicSeeds } from './gradient'
import type { BernsteinDecomposition } from './bernstein'
import type { PlanarCurvatureGradient } from './gradient'

/** Per coefficient: −1 if g>0 (keep ≥0), +1 if g≤0 (keep ≤0). Exact-0 → +1. */
function assignSigns(gc: number[]): number[] {
  return gc.map((v) => (v > 0 ? -1 : 1))
}

const SIGN_NOISE_REL = 1e-9
/**
 * Neighbour-aware sign assignment for the robust (unscaled) regime. A
 * coefficient above the noise floor takes the sign of its own value; a near-zero
 * one — the STRUCTURALLY ZERO clamped-boundary coefficient our core computes as
 * exactly 0 — takes its nearest determined neighbour's sign. That mirrors what
 * the sketcher gets for free from its tiny roundoff residual (g[0] ≈ +7.8e-3):
 * the boundary coefficient joins its run, stays ACTIVE, and is enforced, so the
 * solve coordinates the neighbours to keep it feasible instead of letting it
 * slide across zero (a real extremum).
 */
export function assignSignsNeighbor(gc: number[]): number[] {
  const maxAbs = Math.max(1e-300, ...gc.map(Math.abs))
  const noise = SIGN_NOISE_REL * maxAbs
  const det = gc.map((v) => (Math.abs(v) <= noise ? 0 : v > 0 ? -1 : 1))
  const out = det.slice()
  const n = det.length
  for (let i = 0; i < n; i++) {
    if (det[i] !== 0) continue
    let l = i - 1
    while (l >= 0 && det[l] === 0) l--
    let r = i + 1
    while (r < n && det[r] === 0) r++
    const dl = l >= 0 ? i - l : Infinity
    const dr = r < n ? r - i : Infinity
    out[i] = dl <= dr ? (l >= 0 ? det[l] : 1) : r < n ? det[r] : 1
    if (out[i] === 0) out[i] = 1
  }
  return out
}

/** Sliding active set driven by the ASSIGNED signs (robust regime): a near-zero
 *  coefficient that took its run's sign shares its neighbour's sign and so stays
 *  active. Within each alternating-sign run keep the largest-|g| anchor active. */
function computeInactiveSetBySign(signs: number[], absVal: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = signs.length
  let i = 0
  while (i < n - 1) {
    if (signs[i] !== signs[i + 1]) {
      const seq = [
        { idx: i, abs: absVal[i] },
        { idx: i + 1, abs: absVal[i + 1] },
      ]
      let j = i + 1
      while (j < n - 1 && signs[j] !== signs[j + 1]) {
        j++
        seq.push({ idx: j, abs: absVal[j] })
      }
      const anchor = seq.reduce((m, e) => (e.abs > m.abs ? e : m))
      for (const e of seq) if (e.idx !== anchor.idx) inactive.add(e.idx)
      i = j + 1
    } else {
      i++
    }
  }
  return inactive
}

/** Tiny feasible-side margin (in raw g units) for structurally-zero ACTIVE
 *  coefficients, so g=0 starts at a small POSITIVE slack — the analogue of the
 *  sketcher's roundoff residual — instead of exactly 0 (a barrier wall). The
 *  excursion it permits is MARGIN_REL·max|g| ≈ noise, never a real extremum. */
const MARGIN_REL = 1e-9
export function structuralMargins(gcAll: number[], activeIdx: number[]): number[] {
  const maxAbs = Math.max(1e-300, ...gcAll.map(Math.abs))
  const noise = SIGN_NOISE_REL * maxAbs
  const margin = MARGIN_REL * maxAbs
  return activeIdx.map((i) => (Math.abs(gcAll[i]) <= noise ? margin : 0))
}

/**
 * Anchor-based sliding active set (the talk's mechanism). Walk the g Bernstein
 * coefficients: within each maximal alternating-sign run (consecutive products
 * ≤ 0, so a zero joins the run on either side) keep only the anchor (largest
 * |g|) active and let the rest slide; positions with same-sign neighbours stay
 * active. Inactive constraints are dropped from the barrier but the active
 * anchors still bound S⁻ by the variation-diminishing property. This matches the
 * sketcher's proven setup; a structurally-zero boundary coefficient lands in the
 * inactive set (so it does not wall the solve), and the robust IPOPT solver
 * keeps the bound via the neighbouring active anchor.
 */
function computeInactiveSet(gc: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gc.length
  let i = 0
  while (i < n - 1) {
    if (gc[i] * gc[i + 1] <= 0) {
      const seq = [
        { idx: i, abs: Math.abs(gc[i]) },
        { idx: i + 1, abs: Math.abs(gc[i + 1]) },
      ]
      let j = i + 1
      while (j < n - 1 && gc[j] * gc[j + 1] <= 0) {
        j++
        seq.push({ idx: j, abs: Math.abs(gc[j]) })
      }
      const anchor = seq.reduce((m, e) => (e.abs > m.abs ? e : m))
      for (const e of seq) if (e.idx !== anchor.idx) inactive.add(e.idx)
      i = j + 1
    } else {
      i++
    }
  }
  return inactive
}

/**
 * Per-constraint scale = |coeff|, but floored at `SCALE_FLOOR_REL · max|coeff|`.
 *
 * Dividing each active constraint by |coeff| normalizes the slacks to ≈1 and
 * collapses g's huge dynamic range (the conditioning fix). But a coefficient
 * that is NOISE — |coeff| far below machine epsilon relative to the largest
 * (e.g. 7.6e-6 next to 3.5e14, ratio 2e-20, from catastrophic cancellation in
 * the Bernstein products) — must NOT become the divisor: that would blow its
 * Jacobian row up by ~1/noise and let the optimizer flip a meaningless sign,
 * spuriously raising the bound S⁻. The floor caps how small a divisor can be,
 * so genuinely small-but-meaningful coefficients still get per-constraint
 * scaling while noise-level ones are treated as ≈the floor.
 */
const SCALE_FLOOR_REL = 1e-12
function scaleFor(coeffs: number[], activeIdx: number[]): number[] {
  const maxAbs = Math.max(1e-300, ...coeffs.map(Math.abs))
  const floor = SCALE_FLOOR_REL * maxAbs
  return activeIdx.map((i) => Math.max(Math.abs(coeffs[i]), floor))
}

/**
 * The sliding mechanism's state, fixed ONCE at the start of a drag. Every g
 * Bernstein coefficient is assigned a definite sign here (even a near-zero one)
 * — the mechanism then PRESERVES those assigned signs for the whole drag, never
 * re-deriving a sign from a noise-level value mid-drag. Recomputing per frame let
 * a near-zero coefficient flicker sign, which destabilized the bound S⁻ and the
 * constraint coloring. Carry this across the drag's frames (optimizer + display).
 */
export interface CurvatureConstraintState {
  /** g Bernstein coefficients at the start (for the display; values are fixed). */
  gCPs: number[]
  /** Per coefficient: −1 if g>0, +1 if g<0 (assigned once at the start). */
  signs: number[]
  /** Non-anchor members of alternating runs — allowed to slide. */
  inactiveIndices: number[]
  /** Per coefficient scale (floored), for conditioning. */
  gScale: number[]
  /** Per coefficient parameter position, for the constraint-bar display. */
  grevilleAbscissae: number[]
}

/** Compute the constraint state from a curve — call ONCE at drag start, then reuse. */
export function planarCurvatureConstraintState(
  cpX: readonly number[],
  cpY: readonly number[],
  knots: readonly number[],
  degree: number,
  opts: { disableSliding?: boolean; robust?: boolean } = {},
): CurvatureConstraintState {
  const g = curvatureExtremaNumeratorPlanar(cpX, cpY, knots, degree)
  const gc = g.flatCoeffs()
  // The robust regime (IPOPT path) keeps the structurally-zero boundary
  // coefficient active via its neighbour's sign; the banded regime uses the
  // raw sign rule and value-based sliding. Match whichever solver will run so
  // the fixed drag-start signs agree with the optimizer's constraint set.
  const signs = opts.robust ? assignSignsNeighbor(gc) : assignSigns(gc)
  const inactive = opts.disableSliding
    ? new Set<number>()
    : opts.robust
      ? computeInactiveSetBySign(signs, gc.map(Math.abs))
      : computeInactiveSet(gc)
  const gScale = scaleFor(
    gc,
    gc.map((_, i) => i),
  )
  const grevilleAbscissae: number[] = []
  for (let s = 0; s < g.coeffs.length; s++) {
    const a = g.breaks[s]
    const b = g.breaks[s + 1]
    const m = g.coeffs[s].length
    for (let j = 0; j < m; j++) grevilleAbscissae.push(a + (m > 1 ? j / (m - 1) : 0) * (b - a))
  }
  return { gCPs: gc, signs, inactiveIndices: [...inactive], gScale, grevilleAbscissae }
}

/**
 * The "sliding mechanism" as an optimization problem: drag one control point to
 * a target while keeping the curvature-extrema bound. Objective is weighted
 * least-squares to the targets; constraints keep the sign of every ACTIVE
 * Bernstein coefficient of g (anchors + same-sign positions), so S⁻(g) — the
 * bound on curvature extrema — is monotone non-increasing.
 */
export class PlanarCurvatureProblem implements OptimizationProblem {
  cpX: number[]
  cpY: number[]
  readonly numEqualityConstraints = 0

  private knots: number[]
  private degree: number
  private closed: boolean
  private targetX: number[]
  private targetY: number[]
  private weights: number[]
  private anchorX: number[]
  private anchorY: number[]
  private anchorWeight: number
  private signs: number[] // per ACTIVE g constraint
  private activeIdx: number[] // indices into g.flatCoeffs()
  // Per-constraint scale = |g_i| at the start (floored). Dividing each
  // constraint (and its Jacobian row) by this normalizes every active slack to
  // ≈1 at the start, collapsing g's huge dynamic range (its Bernstein coeffs
  // can span >10 orders of magnitude on real curves — e.g. 0.4 next to 1e12 —
  // which otherwise makes the KKT system hopelessly ill-conditioned and the
  // optimizer give up). Sign-invariant (scale > 0), so the feasible set and the
  // bound are unchanged; only the numerics improve.
  private gScale: number[] = []
  private margins: number[] = []
  private preserveInflections: boolean
  private fActiveIdx: number[] = []
  private fSigns: number[] = []
  private fScale: number[] = []
  private fMargins: number[] = []
  private cachedCons: number[] | null = null
  private cachedJac: Matrix | null = null
  // Geometry-independent seeds for the periodic local gradient — depend only on
  // (knots, degree, n), so precompute ONCE here and reuse across every Jacobian
  // build of the drag (the curve moves ~50×/frame; the seeds never change).
  private periodicSeeds: PeriodicSeeds | null = null

  constructor(
    cpX: readonly number[],
    cpY: readonly number[],
    knots: readonly number[],
    degree: number,
    dragIndex: number,
    targetX: number,
    targetY: number,
    opts: {
      disableSliding?: boolean
      weights?: number[]
      closed?: boolean
      anchorX?: number[]
      anchorY?: number[]
      anchorWeight?: number
      preserveInflections?: boolean
      /** Extra objective weight on the dragged point so it tracks the cursor. */
      dragWeight?: number
      /** Fixed sign/active-set from drag start (preferred over recomputing). */
      constraintState?: CurvatureConstraintState
      /**
       * Use RAW (unscaled) constraints — gScale ≡ 1 — instead of dividing each
       * by |g_i|. The per-constraint scaling conditions the lean Mehrotra/barrier
       * solvers but it floors a structurally-zero coefficient at the noise level,
       * which blows up its Jacobian row and makes that constraint impossible to
       * enforce (the drag stalls or the bound is violated). The robust IPOPT
       * solver handles the raw dynamic range via its trust region, exactly as the
       * sketcher does, so it takes the unscaled form.
       */
      noScale?: boolean
    } = {},
  ) {
    this.cpX = [...cpX]
    this.cpY = [...cpY]
    this.knots = [...knots]
    this.degree = degree
    this.closed = opts.closed ?? false
    if (this.closed) this.periodicSeeds = precomputePeriodicSeeds(this.knots, this.degree, this.cpX.length)
    this.targetX = [...cpX]
    this.targetY = [...cpY]
    this.targetX[dragIndex] = targetX
    this.targetY[dragIndex] = targetY
    this.weights = (opts.weights ?? cpX.map(() => 1)).slice()
    if (opts.dragWeight !== undefined) this.weights[dragIndex] = opts.dragWeight
    this.anchorX = opts.anchorX ?? [...this.cpX]
    this.anchorY = opts.anchorY ?? [...this.cpY]
    this.anchorWeight = opts.anchorWeight ?? 0

    this.preserveInflections = opts.preserveInflections ?? false

    // Two regimes. The ROBUST regime (`noScale`, used by the IPOPT solver and
    // the editor) mirrors the sketcher: unscaled (raw) constraints, neighbour-
    // aware signs that keep the structurally-zero clamped-boundary coefficient
    // ACTIVE in its run, and a tiny margin so g=0 starts at positive slack. The
    // BANDED regime (default, for the near-linear slide solvers) keeps the
    // per-constraint scaling and the value-based sliding set the banded
    // solvers were tuned for.
    if (opts.constraintState) {
      // FIXED signs/active-set/scale from drag start — the sliding mechanism
      // follows the initial sign assignment instead of re-deriving each frame.
      const cs = opts.constraintState
      const inactive = new Set(cs.inactiveIndices)
      this.activeIdx = cs.signs.map((_, i) => i).filter((i) => !inactive.has(i))
      this.signs = this.activeIdx.map((i) => cs.signs[i])
      this.gScale = opts.noScale ? this.activeIdx.map(() => 1) : this.activeIdx.map((i) => cs.gScale[i])
      this.margins = opts.noScale ? structuralMargins(cs.gCPs, this.activeIdx) : this.activeIdx.map(() => 0)
    } else if (opts.noScale) {
      const gc = this.numerator().flatCoeffs()
      const allSigns = assignSignsNeighbor(gc)
      const inactive = opts.disableSliding ? new Set<number>() : computeInactiveSetBySign(allSigns, gc.map(Math.abs))
      this.activeIdx = gc.map((_, i) => i).filter((i) => !inactive.has(i))
      this.signs = this.activeIdx.map((i) => allSigns[i])
      this.gScale = this.activeIdx.map(() => 1)
      this.margins = structuralMargins(gc, this.activeIdx)
    } else {
      const gc = this.numerator().flatCoeffs()
      const allSigns = assignSigns(gc)
      const inactive = opts.disableSliding ? new Set<number>() : computeInactiveSet(gc)
      this.activeIdx = gc.map((_, i) => i).filter((i) => !inactive.has(i))
      this.signs = this.activeIdx.map((i) => allSigns[i])
      this.gScale = scaleFor(gc, this.activeIdx)
      this.margins = this.activeIdx.map(() => 0)
    }

    if (this.preserveInflections) {
      const fc = this.inflectionNumerator().flatCoeffs()
      const fAllSigns = opts.noScale ? assignSignsNeighbor(fc) : assignSigns(fc)
      const fInactive = opts.disableSliding
        ? new Set<number>()
        : opts.noScale
          ? computeInactiveSetBySign(fAllSigns, fc.map(Math.abs))
          : computeInactiveSet(fc)
      this.fActiveIdx = fc.map((_, i) => i).filter((i) => !fInactive.has(i))
      this.fSigns = this.fActiveIdx.map((i) => fAllSigns[i])
      this.fScale = opts.noScale ? this.fActiveIdx.map(() => 1) : scaleFor(fc, this.fActiveIdx)
      this.fMargins = opts.noScale ? structuralMargins(fc, this.fActiveIdx) : this.fActiveIdx.map(() => 0)
    }
  }

  private numerator(): BernsteinDecomposition {
    return this.closed
      ? curvatureExtremaNumeratorPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
      : curvatureExtremaNumeratorPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private gradient(): PlanarCurvatureGradient {
    return this.closed
      ? curvatureExtremaGradientPlanarPeriodicLocal(this.cpX, this.cpY, this.knots, this.degree, this.periodicSeeds!)
      : curvatureExtremaGradientPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private inflectionNumerator(): BernsteinDecomposition {
    return this.closed
      ? inflectionNumeratorPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
      : inflectionNumeratorPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private inflectionGrad(): PlanarCurvatureGradient {
    return this.closed
      ? inflectionGradientPlanarPeriodicLocal(this.cpX, this.cpY, this.knots, this.degree, this.periodicSeeds!)
      : inflectionGradientPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  /** Build the variable-space rows (length 2m) for a gradient's coeff index. */
  private jacRows(grad: PlanarCurvatureGradient, activeIdx: number[]): number[][] {
    const m = this.cpX.length
    const dxf = grad.dx.map((b) => b.flatCoeffs())
    const dyf = grad.dy.map((b) => b.flatCoeffs())
    return activeIdx.map((idx) => {
      const row = new Array<number>(2 * m)
      for (let j = 0; j < m; j++) {
        row[j] = dxf[j][idx]
        row[m + j] = dyf[j][idx]
      }
      return row
    })
  }

  get numVariables(): number {
    return this.cpX.length * 2
  }
  getVariables(): number[] {
    return [...this.cpX, ...this.cpY]
  }
  setVariables(x: number[]): void {
    const n = this.cpX.length
    this.cpX = x.slice(0, n)
    this.cpY = x.slice(n)
    this.cachedCons = null
    this.cachedJac = null
  }

  computeObjective(): number {
    let s = 0
    const aw = this.anchorWeight
    for (let i = 0; i < this.cpX.length; i++) {
      const dx = this.cpX[i] - this.targetX[i]
      const dy = this.cpY[i] - this.targetY[i]
      s += 0.5 * this.weights[i] * (dx * dx + dy * dy)
      if (aw > 0) {
        const ax = this.cpX[i] - this.anchorX[i]
        const ay = this.cpY[i] - this.anchorY[i]
        s += 0.5 * aw * (ax * ax + ay * ay)
      }
    }
    return s
  }
  computeObjectiveGradient(): number[] {
    const aw = this.anchorWeight
    const gx = this.cpX.map((x, i) => this.weights[i] * (x - this.targetX[i]) + aw * (x - this.anchorX[i]))
    const gy = this.cpY.map((y, i) => this.weights[i] * (y - this.targetY[i]) + aw * (y - this.anchorY[i]))
    return [...gx, ...gy]
  }
  computeObjectiveHessian(): Matrix {
    const n = this.numVariables
    const m = this.cpX.length
    const aw = this.anchorWeight
    const H: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < m; i++) {
      H[i][i] = this.weights[i] + aw
      H[m + i][m + i] = this.weights[i] + aw
    }
    return H
  }

  get numConstraints(): number {
    return this.activeIdx.length + (this.preserveInflections ? this.fActiveIdx.length : 0)
  }
  computeConstraints(): number[] {
    if (!this.cachedCons) {
      const gc = this.numerator().flatCoeffs()
      const cons = this.activeIdx.map((i, k) => gc[i] / this.gScale[k] - this.signs[k] * this.margins[k])
      if (this.preserveInflections) {
        const fc = this.inflectionNumerator().flatCoeffs()
        this.fActiveIdx.forEach((i, k) => cons.push(fc[i] / this.fScale[k] - this.fSigns[k] * this.fMargins[k]))
      }
      this.cachedCons = cons
    }
    return this.cachedCons
  }
  computeConstraintJacobian(): Matrix {
    // Divide each constraint row by its (floored) scale — matches computeConstraints.
    if (!this.cachedJac) {
      const rows = this.jacRows(this.gradient(), this.activeIdx).map((row, k) =>
        row.map((v) => v / this.gScale[k]),
      )
      if (this.preserveInflections) {
        const fRows = this.jacRows(this.inflectionGrad(), this.fActiveIdx).map((row, k) =>
          row.map((v) => v / this.fScale[k]),
        )
        rows.push(...fRows)
      }
      this.cachedJac = rows
    }
    return this.cachedJac
  }
  /**
   * Sparse per-active-constraint Jacobian: row k = {vars, vals} listing only the
   * variables ∂c_k/∂var ≠ 0 (the d+1 control points supporting g_k's span ×
   * x/y). Assembled in O(n·d²) from the LOCAL gradient — no full-width rows — so
   * an interior-point step that uses it (the banded barrier) is linear in the
   * number of control points. Open planar B-splines only (returns null otherwise).
   */
  computeConstraintJacobianLocal(): { vars: number[]; vals: number[] }[] | null {
    if (this.closed || this.preserveInflections) return null
    const grad = curvatureExtremaGradientPlanarLocal(this.cpX, this.cpY, this.knots, this.degree)
    const gDeg1 = grad.gDeg + 1
    const n = this.cpX.length
    const activePos = new Map<number, number>()
    this.activeIdx.forEach((flat, k) => activePos.set(flat, k))
    const rows = this.activeIdx.map(() => ({ vars: [] as number[], vals: [] as number[] }))
    for (let i = 0; i < n; i++) {
      const col = grad.cols[i]
      if (col.s0 < 0) continue
      const gxc = col.gx.coeffs
      const gyc = col.gy.coeffs
      for (let ls = 0; ls < gxc.length; ls++) {
        const s = col.s0 + ls
        for (let c = 0; c <= grad.gDeg; c++) {
          const k = activePos.get(s * gDeg1 + c)
          if (k === undefined) continue
          const inv = 1 / this.gScale[k]
          const vx = gxc[ls][c]
          const vy = gyc[ls][c]
          if (vx !== 0) { rows[k].vars.push(i); rows[k].vals.push(vx * inv) }
          if (vy !== 0) { rows[k].vars.push(n + i); rows[k].vals.push(vy * inv) }
        }
      }
    }
    return rows
  }
  getConstraintSigns(): number[] {
    return this.preserveInflections ? [...this.signs, ...this.fSigns] : this.signs
  }
  getInactiveConstraints(): Set<number> {
    return new Set<number>()
  }
  updateConstraintState(): void {
    const gc = this.numerator().flatCoeffs()
    const gSigns = assignSigns(gc)
    this.signs = this.activeIdx.map((i) => gSigns[i])
    if (this.preserveInflections) {
      const fc = this.inflectionNumerator().flatCoeffs()
      const fSigns = assignSigns(fc)
      this.fSigns = this.fActiveIdx.map((i) => fSigns[i])
    }
    this.cachedCons = null
    this.cachedJac = null
  }
}

/**
 * Run one "slide": drag control point `dragIndex` toward (targetX, targetY)
 * while preserving the curvature-extrema bound. Returns the new control points.
 */
export function slideCurve(
  cpX: readonly number[],
  cpY: readonly number[],
  knots: readonly number[],
  degree: number,
  dragIndex: number,
  targetX: number,
  targetY: number,
  opts: {
    disableSliding?: boolean
    closed?: boolean
    anchorX?: number[]
    anchorY?: number[]
    anchorWeight?: number
    preserveInflections?: boolean
    symmetryMaps?: { mapX: number[] | null; mapY: number[] | null }
    dragWeight?: number
    constraintState?: CurvatureConstraintState
    /**
     * Which optimizer to use. DEFAULTS to 'ipopt' — the ported robust IPOPT-style
     * solver (trust region, filter, feasibility restoration) that gives reliable,
     * coordinated, never-bound-violating drags. 'primal-dual'/'barrier' are opt-in:
     * the banded (near-linear) solvers, best for large curves and the
     * method-comparison demo, but they can let the bound grow on a quick drag.
     */
    method?: 'primal-dual' | 'barrier' | 'ipopt'
    /**
     * IPOPT only. The drag objective is exactly a weighted least-squares term,
     * so its Hessian IS the (constant) identity-weighted diagonal — there is
     * nothing for BFGS to approximate. Gauss-Newton (the default here) uses that
     * exact Hessian: faster AND more accurate, converging in ~half the iterations
     * (this is what the ../sketcher deck does). Set true only to fall back to the
     * BFGS Lagrangian-Hessian approximation. Feasibility is enforced by the
     * barrier, not the Hessian, so the curvature bound holds either way.
     */
    enableBFGS?: boolean
  } & Partial<OptimizerConfig> = {},
): { x: number[]; y: number[]; converged: boolean } {
  // Default to the robust IPOPT solver — it is the curvature-bound invariant
  // keeper. Banded/barrier are opt-in (the method-comparison demo). This used to
  // default to banded: a safe-looking footgun for any caller that omits `method`
  // (it can let the bound grow on a quick drag — see the design review).
  const method = opts.method ?? 'ipopt'
  const problem = new PlanarCurvatureProblem(cpX, cpY, knots, degree, dragIndex, targetX, targetY, {
    disableSliding: opts.disableSliding,
    closed: opts.closed,
    anchorX: opts.anchorX,
    anchorY: opts.anchorY,
    anchorWeight: opts.anchorWeight,
    preserveInflections: opts.preserveInflections,
    dragWeight: opts.dragWeight,
    constraintState: opts.constraintState,
    noScale: method === 'ipopt',
  })
  // Symmetry is enforced inside the solve via variable reduction (the result
  // is symmetric AND constraint-feasible — no post-projection).
  const solved: OptimizationProblem = opts.symmetryMaps
    ? new SymmetryReducedProblem(
        problem,
        buildSymmetryReduction(cpX.length, opts.symmetryMaps.mapX, opts.symmetryMaps.mapY),
      )
    : problem
  // The banded solvers assume control-point-interleaved variables with a banded
  // Jacobian, so they run only on the un-reduced, OPEN problem (no symmetry
  // reduction, no periodic wrap). The dense primal-dual handles the
  // closed/symmetric/reduced cases.
  const banded = !opts.symmetryMaps && !opts.closed
  let converged: boolean
  if (method === 'ipopt') {
    // The robust IPOPT-style solver: trust region + filter + feasibility
    // restoration give gradual, coordinated drags. Works on any problem (dense
    // Jacobian), so it also serves the symmetry/closed cases when selected.
    const ip = new InteriorPointOptimizer(solved, {
      maxIterations: opts.maxIterations ?? 80,
      // Gauss-Newton by default (exact Hessian for the least-squares drag
      // objective): full speed without giving up the feasibility guarantee.
      enableBFGS: opts.enableBFGS ?? false,
      returnBestFeasible: true,
    })
    const r = ip.optimize()
    solved.setVariables(r.variables)
    converged = r.converged
  } else {
    const optimizer =
      method === 'barrier' && banded
        ? new BarrierOptimizer(solved, { maxIterations: opts.maxIterations ?? 40, returnBestFeasible: true })
        : banded
          ? new BandedPrimalDualOptimizer(solved, { maxIterations: opts.maxIterations ?? 80, returnBestFeasible: true })
          : new PrimalDualOptimizer(solved, { maxIterations: opts.maxIterations ?? 80, returnBestFeasible: true })
    const result = optimizer.optimize()
    solved.setVariables(result.variables)
    converged = result.converged
  }

  // Extrema guard: never return a curve with MORE actual curvature extrema than
  // the start. The count is the dense-sampled number of zeros of g(t) — robust
  // to noise-level coefficients (unlike the Bernstein sign-change bound, a
  // coefficient at ~1e-9·max never makes g(t) actually cross zero), so it does
  // not fight the tiny structural-zero margin. If a solve still overshot (added
  // a real extremum), bisect the straight path from the start to the solved
  // curve for the furthest point that preserves the count: the dragged point
  // follows the cursor as far as the bound allows and never past it.
  const sOf = (x: readonly number[], y: readonly number[]) =>
    (opts.closed
      ? closedCurvatureExtremaParameters(x, y, knots, degree)
      : openCurvatureExtremaParameters(x, y, knots, degree)
    ).length
  let rx = problem.cpX
  let ry = problem.cpY
  const startS = sOf(cpX, cpY)
  if (sOf(rx, ry) > startS) {
    let lo = 0
    let hi = 1
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2
      const xm = cpX.map((v, i) => v + mid * (rx[i] - v))
      const ym = cpY.map((v, i) => v + mid * (ry[i] - v))
      if (sOf(xm, ym) <= startS) lo = mid
      else hi = mid
    }
    rx = cpX.map((v, i) => v + lo * (rx[i] - v))
    ry = cpY.map((v, i) => v + lo * (ry[i] - v))
  }
  return { x: rx, y: ry, converged }
}
