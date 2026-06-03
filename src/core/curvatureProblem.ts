import type { Matrix } from './linalg'
import type { OptimizationProblem, OptimizerConfig } from './optimize'
import { PrimalDualOptimizer } from './optimize'
import { buildSymmetryReduction, SymmetryReducedProblem } from './symmetryReduction'
import {
  curvatureExtremaNumeratorPlanar,
  curvatureExtremaNumeratorPlanarPeriodic,
  inflectionNumeratorPlanar,
  inflectionNumeratorPlanarPeriodic,
} from './curvature'
import {
  curvatureExtremaGradientPlanar,
  curvatureExtremaGradientPlanarPeriodic,
  inflectionGradientPlanar,
  inflectionGradientPlanarPeriodic,
} from './gradient'
import type { BernsteinDecomposition } from './bernstein'
import type { PlanarCurvatureGradient } from './gradient'

/**
 * Anchor-based sliding active set (the talk's mechanism). Walk the g Bernstein
 * coefficients: within each maximal alternating-sign run, keep only the anchor
 * (largest |g|) active and let the rest slide; positions with same-sign
 * neighbours stay active. Inactive constraints are dropped from the problem.
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
  // The optimizer works in normalized variables x̃ = cp / coordScale (so the
  // control points are O(1) regardless of world units). Keeps the objective
  // Hessian and the constraint Jacobian on comparable scales — the companion to
  // gScale. Real coords are recovered in setVariables; gradient/Hessian/Jacobian
  // carry the chain-rule factor.
  private coordScale = 1
  private preserveInflections: boolean
  private fActiveIdx: number[] = []
  private fSigns: number[] = []
  private fScale: number[] = []
  private cachedCons: number[] | null = null
  private cachedJac: Matrix | null = null

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
    } = {},
  ) {
    this.cpX = [...cpX]
    this.cpY = [...cpY]
    this.knots = [...knots]
    this.degree = degree
    this.closed = opts.closed ?? false
    this.targetX = [...cpX]
    this.targetY = [...cpY]
    this.targetX[dragIndex] = targetX
    this.targetY[dragIndex] = targetY
    this.weights = (opts.weights ?? cpX.map(() => 1)).slice()
    if (opts.dragWeight !== undefined) this.weights[dragIndex] = opts.dragWeight
    this.anchorX = opts.anchorX ?? [...this.cpX]
    this.anchorY = opts.anchorY ?? [...this.cpY]
    this.anchorWeight = opts.anchorWeight ?? 0
    this.coordScale = Math.max(
      1,
      ...this.cpX.map(Math.abs),
      ...this.cpY.map(Math.abs),
      ...this.targetX.map(Math.abs),
      ...this.targetY.map(Math.abs),
    )

    this.preserveInflections = opts.preserveInflections ?? false

    const gc = this.numerator().flatCoeffs()
    const allSigns = gc.map((v) => (v > 0 ? -1 : 1))
    const inactive = opts.disableSliding ? new Set<number>() : computeInactiveSet(gc)
    this.activeIdx = gc.map((_, i) => i).filter((i) => !inactive.has(i))
    this.signs = this.activeIdx.map((i) => allSigns[i])
    this.gScale = this.activeIdx.map((i) => Math.max(Math.abs(gc[i]), 1e-12))

    if (this.preserveInflections) {
      const fc = this.inflectionNumerator().flatCoeffs()
      const fAllSigns = fc.map((v) => (v > 0 ? -1 : 1))
      const fInactive = opts.disableSliding ? new Set<number>() : computeInactiveSet(fc)
      this.fActiveIdx = fc.map((_, i) => i).filter((i) => !fInactive.has(i))
      this.fSigns = this.fActiveIdx.map((i) => fAllSigns[i])
      this.fScale = this.fActiveIdx.map((i) => Math.max(Math.abs(fc[i]), 1e-12))
    }
  }

  private numerator(): BernsteinDecomposition {
    return this.closed
      ? curvatureExtremaNumeratorPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
      : curvatureExtremaNumeratorPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private gradient(): PlanarCurvatureGradient {
    return this.closed
      ? curvatureExtremaGradientPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
      : curvatureExtremaGradientPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private inflectionNumerator(): BernsteinDecomposition {
    return this.closed
      ? inflectionNumeratorPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
      : inflectionNumeratorPlanar(this.cpX, this.cpY, this.knots, this.degree)
  }
  private inflectionGrad(): PlanarCurvatureGradient {
    return this.closed
      ? inflectionGradientPlanarPeriodic(this.cpX, this.cpY, this.knots, this.degree)
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
    const s = this.coordScale
    return [...this.cpX.map((v) => v / s), ...this.cpY.map((v) => v / s)]
  }
  setVariables(x: number[]): void {
    const n = this.cpX.length
    const s = this.coordScale
    this.cpX = x.slice(0, n).map((v) => v * s)
    this.cpY = x.slice(n).map((v) => v * s)
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
    // ∇_x̃ f = coordScale · ∇_cp f (chain rule for x̃ = cp / coordScale).
    const aw = this.anchorWeight
    const s = this.coordScale
    const gx = this.cpX.map((x, i) => s * (this.weights[i] * (x - this.targetX[i]) + aw * (x - this.anchorX[i])))
    const gy = this.cpY.map((y, i) => s * (this.weights[i] * (y - this.targetY[i]) + aw * (y - this.anchorY[i])))
    return [...gx, ...gy]
  }
  computeObjectiveHessian(): Matrix {
    // ∇²_x̃ f = coordScale² · ∇²_cp f.
    const n = this.numVariables
    const m = this.cpX.length
    const aw = this.anchorWeight
    const s2 = this.coordScale * this.coordScale
    const H: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < m; i++) {
      H[i][i] = (this.weights[i] + aw) * s2
      H[m + i][m + i] = (this.weights[i] + aw) * s2
    }
    return H
  }

  get numConstraints(): number {
    return this.activeIdx.length + (this.preserveInflections ? this.fActiveIdx.length : 0)
  }
  computeConstraints(): number[] {
    if (!this.cachedCons) {
      const gc = this.numerator().flatCoeffs()
      const cons = this.activeIdx.map((i, k) => gc[i] / this.gScale[k])
      if (this.preserveInflections) {
        const fc = this.inflectionNumerator().flatCoeffs()
        this.fActiveIdx.forEach((i, k) => cons.push(fc[i] / this.fScale[k]))
      }
      this.cachedCons = cons
    }
    return this.cachedCons
  }
  computeConstraintJacobian(): Matrix {
    // ∂c/∂x̃ = coordScale · ∂c/∂cp, and divide each row by its constraint scale.
    if (!this.cachedJac) {
      const s = this.coordScale
      const rows = this.jacRows(this.gradient(), this.activeIdx).map((row, k) =>
        row.map((v) => (v * s) / this.gScale[k]),
      )
      if (this.preserveInflections) {
        const fRows = this.jacRows(this.inflectionGrad(), this.fActiveIdx).map((row, k) =>
          row.map((v) => (v * s) / this.fScale[k]),
        )
        rows.push(...fRows)
      }
      this.cachedJac = rows
    }
    return this.cachedJac
  }
  getConstraintSigns(): number[] {
    return this.preserveInflections ? [...this.signs, ...this.fSigns] : this.signs
  }
  getInactiveConstraints(): Set<number> {
    return new Set<number>()
  }
  updateConstraintState(): void {
    const gc = this.numerator().flatCoeffs()
    this.signs = this.activeIdx.map((i) => (gc[i] > 0 ? -1 : 1))
    if (this.preserveInflections) {
      const fc = this.inflectionNumerator().flatCoeffs()
      this.fSigns = this.fActiveIdx.map((i) => (fc[i] > 0 ? -1 : 1))
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
  } & Partial<OptimizerConfig> = {},
): { x: number[]; y: number[]; converged: boolean } {
  const problem = new PlanarCurvatureProblem(cpX, cpY, knots, degree, dragIndex, targetX, targetY, {
    disableSliding: opts.disableSliding,
    closed: opts.closed,
    anchorX: opts.anchorX,
    anchorY: opts.anchorY,
    anchorWeight: opts.anchorWeight,
    preserveInflections: opts.preserveInflections,
    dragWeight: opts.dragWeight,
  })
  // Symmetry is enforced inside the solve via variable reduction (the result
  // is symmetric AND constraint-feasible — no post-projection).
  const solved: OptimizationProblem = opts.symmetryMaps
    ? new SymmetryReducedProblem(
        problem,
        buildSymmetryReduction(cpX.length, opts.symmetryMaps.mapX, opts.symmetryMaps.mapY),
      )
    : problem
  const optimizer = new PrimalDualOptimizer(solved, {
    maxIterations: opts.maxIterations ?? 80,
    returnBestFeasible: true,
  })
  const result = optimizer.optimize()
  solved.setVariables(result.variables)
  return { x: problem.cpX, y: problem.cpY, converged: result.converged }
}
