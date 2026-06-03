import type { Matrix } from './linalg'
import type { OptimizationProblem, OptimizerConfig } from './optimize'
import { PrimalDualOptimizer } from './optimize'
import { curvatureExtremaNumeratorPlanar, curvatureExtremaNumeratorPlanarPeriodic } from './curvature'
import { curvatureExtremaGradientPlanar, curvatureExtremaGradientPlanarPeriodic } from './gradient'
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
  private signs: number[] // per ACTIVE constraint
  private activeIdx: number[] // indices into g.flatCoeffs()
  private cachedG: number[] | null = null
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
    this.weights = opts.weights ?? cpX.map(() => 1)
    this.anchorX = opts.anchorX ?? [...this.cpX]
    this.anchorY = opts.anchorY ?? [...this.cpY]
    this.anchorWeight = opts.anchorWeight ?? 0

    const gc = this.numerator().flatCoeffs()
    const allSigns = gc.map((v) => (v > 0 ? -1 : 1))
    const inactive = opts.disableSliding ? new Set<number>() : computeInactiveSet(gc)
    this.activeIdx = gc.map((_, i) => i).filter((i) => !inactive.has(i))
    this.signs = this.activeIdx.map((i) => allSigns[i])
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
    this.cachedG = null
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
    return this.activeIdx.length
  }
  computeConstraints(): number[] {
    if (!this.cachedG) {
      this.cachedG = this.numerator().flatCoeffs()
    }
    return this.activeIdx.map((i) => this.cachedG![i])
  }
  computeConstraintJacobian(): Matrix {
    if (!this.cachedJac) {
      const { dx, dy } = this.gradient()
      const m = this.cpX.length
      const dxf = dx.map((b) => b.flatCoeffs())
      const dyf = dy.map((b) => b.flatCoeffs())
      this.cachedJac = this.activeIdx.map((idx) => {
        const row = new Array<number>(2 * m)
        for (let j = 0; j < m; j++) {
          row[j] = dxf[j][idx]
          row[m + j] = dyf[j][idx]
        }
        return row
      })
    }
    return this.cachedJac
  }
  getConstraintSigns(): number[] {
    return this.signs
  }
  getInactiveConstraints(): Set<number> {
    return new Set<number>()
  }
  updateConstraintState(): void {
    const gc = this.numerator().flatCoeffs()
    const allSigns = gc.map((v) => (v > 0 ? -1 : 1))
    this.signs = this.activeIdx.map((i) => allSigns[i])
    this.cachedG = null
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
  } & Partial<OptimizerConfig> = {},
): { x: number[]; y: number[]; converged: boolean } {
  const problem = new PlanarCurvatureProblem(cpX, cpY, knots, degree, dragIndex, targetX, targetY, {
    disableSliding: opts.disableSliding,
    closed: opts.closed,
    anchorX: opts.anchorX,
    anchorY: opts.anchorY,
    anchorWeight: opts.anchorWeight,
  })
  const optimizer = new PrimalDualOptimizer(problem, {
    maxIterations: opts.maxIterations ?? 80,
    returnBestFeasible: true,
  })
  const result = optimizer.optimize()
  problem.setVariables(result.variables)
  return { x: problem.cpX, y: problem.cpY, converged: result.converged }
}
