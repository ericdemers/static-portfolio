// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * OpenAirfoilFittingProblem — least-squares fit of an OPEN (clamped) B-spline to
 * airfoil data, with the trailing-edge endpoints PINNED and the curvature-extrema
 * count preserved via sign constraints on g(t)'s Bernstein coefficients.
 *
 * This is the open-curve counterpart of AirfoilFittingProblem (periodic). The
 * two pinned endpoints are NOT variables — only the interior control points are:
 *
 *   variables = [x_1 … x_{n-2}, y_1 … y_{n-2}]      (2·(n-2) total)
 *   objective = 0.5 · Σ‖C(t_i) − D_i‖²              (endpoints fixed)
 *   constraints = sign pattern of the open g(t) control points (sliding mechanism)
 *
 * It reuses the open curvature-extrema machinery from algebra.ts
 * (computeCurvatureDerivativeNumeratorCPsFromArrays / computeExplicitJacobian),
 * dropping the four pinned-endpoint columns from the Jacobian.
 */

import type { OptimizationProblem } from '../../optimizer/types'
import type { Matrix } from '../../optimizer/linearAlgebra'
import {
  precomputeBasisDerivatives,
  computeCurvatureDerivativeNumeratorCPsFromArrays,
  computeExplicitJacobian,
  type PrecomputedBasisDerivatives,
} from '../../optimizer/algebra'
import { buildClampedBasisMatrix } from '../pipeline/openFit'
import type { Point2D } from '../../types/curve'

/**
 * Open sliding mechanism: within each maximal alternating-sign run of g's
 * Bernstein coefficients, keep the largest |g| active and let the rest slide
 * (mark inactive). Mirrors BSplineCurveProblem.computeInactiveSet for open curves.
 */
export function computeOpenInactiveSet(gCPs: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gCPs.length
  let i = 0
  while (i < n - 1) {
    if (gCPs[i] * gCPs[i + 1] <= 0) {
      const seq = [
        { idx: i, absVal: Math.abs(gCPs[i]) },
        { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
      ]
      let j = i + 1
      while (j < n - 1 && gCPs[j] * gCPs[j + 1] <= 0) {
        j++
        seq.push({ idx: j, absVal: Math.abs(gCPs[j]) })
      }
      const maxEntry = seq.reduce((mx, e) => (e.absVal > mx.absVal ? e : mx))
      for (const e of seq) if (e.idx !== maxEntry.idx) inactive.add(e.idx)
      i = j
    } else {
      i++
    }
  }
  return inactive
}

export class OpenAirfoilFittingProblem implements OptimizationProblem {
  readonly numVariables: number
  readonly numConstraints: number
  readonly numEqualityConstraints = 0

  private degree: number
  private knots: number[]
  private numCPs: number
  private nInt: number
  private pinStart: Point2D
  private pinEnd: Point2D

  private vx: number[] // interior control points (x)
  private vy: number[] // interior control points (y)

  private precomputed: PrecomputedBasisDerivatives
  private B: number[][] // m × numCPs clamped basis (for objective)
  private dataX: number[]
  private dataY: number[]
  private weights: number[] // per-data-point weight in the least-squares objective

  // Reduced normal-equation pieces over interior CPs.
  private Hint: number[][] // (n-2) × (n-2) = Bint^T Bint
  private rhsX: number[] // Bint^T (dataX − endpoint contribution)
  private rhsY: number[]

  private constraintSigns: number[]
  private inactiveConstraints: Set<number>

  // Optional localized fairness: adds 0.5·λ·(Pₓᵀ M Pₓ + P_y ᵀ M P_y) to the
  // objective, driving the region M covers toward a spiral (monotone curvature).
  private fairLambda: number
  private fairGram: number[][] | null
  // Parameter region whose g-constraints are forced inactive (freed), letting
  // the extrema inside it merge while the rest of the bound is held.
  private freeRegion: [number, number] | null
  private distinctKnots: number[] = []

  constructor(
    interiorX: number[],
    interiorY: number[],
    pinStart: Point2D,
    pinEnd: Point2D,
    knots: number[],
    degree: number,
    t: number[],
    dataX: number[],
    dataY: number[],
    fairLambda = 0,
    fairGram: number[][] | null = null,
    freeRegion: [number, number] | null = null,
    weights: number[] | null = null,
  ) {
    this.fairLambda = fairLambda
    this.fairGram = fairGram
    this.freeRegion = freeRegion
    this.nInt = interiorX.length
    this.numCPs = this.nInt + 2
    this.numVariables = 2 * this.nInt
    this.degree = degree
    this.knots = knots
    this.pinStart = pinStart
    this.pinEnd = pinEnd
    this.vx = [...interiorX]
    this.vy = [...interiorY]
    this.dataX = dataX
    this.dataY = dataY

    const m = t.length
    this.weights = weights && weights.length === m ? weights : new Array<number>(m).fill(1)
    const w = this.weights
    const last = this.numCPs - 1
    this.B = buildClampedBasisMatrix(t, degree, knots, this.numCPs)

    // Interior basis + endpoint-corrected data → reduced normal equations.
    const Bint: number[][] = []
    const dx = new Array<number>(m)
    const dy = new Array<number>(m)
    for (let i = 0; i < m; i++) {
      const row = new Array<number>(this.nInt)
      for (let j = 0; j < this.nInt; j++) row[j] = this.B[i][j + 1]
      Bint.push(row)
      dx[i] = dataX[i] - this.B[i][0] * pinStart.x - this.B[i][last] * pinEnd.x
      dy[i] = dataY[i] - this.B[i][0] * pinStart.y - this.B[i][last] * pinEnd.y
    }
    this.Hint = []
    for (let i = 0; i < this.nInt; i++) this.Hint[i] = new Array<number>(this.nInt).fill(0)
    // Weighted normal equations: Hint = Bintᵀ W Bint, rhs = Bintᵀ W d.
    for (let i = 0; i < this.nInt; i++) {
      for (let j = i; j < this.nInt; j++) {
        let s = 0
        for (let k = 0; k < m; k++) s += w[k] * Bint[k][i] * Bint[k][j]
        this.Hint[i][j] = s
        this.Hint[j][i] = s
      }
    }
    this.rhsX = new Array<number>(this.nInt).fill(0)
    this.rhsY = new Array<number>(this.nInt).fill(0)
    for (let j = 0; j < this.nInt; j++) {
      let sx = 0, sy = 0
      for (let i = 0; i < m; i++) { sx += w[i] * Bint[i][j] * dx[i]; sy += w[i] * Bint[i][j] * dy[i] }
      this.rhsX[j] = sx
      this.rhsY[j] = sy
    }

    // Open curvature-extrema constraint state.
    this.distinctKnots = [...new Set(knots)].sort((a, b) => a - b)
    this.precomputed = precomputeBasisDerivatives(knots, this.numCPs)
    const gCPs = computeCurvatureDerivativeNumeratorCPsFromArrays(knots, this.fullX(), this.fullY())
    this.numConstraints = gCPs.length
    this.constraintSigns = gCPs.map(v => (v >= 0 ? -1 : 1))
    this.inactiveConstraints = this.withFreeRegion(computeOpenInactiveSet(gCPs), gCPs.length)
  }

  /** Add the g-constraints whose parameter falls in freeRegion to the inactive
   *  set, so the extrema there can slide/merge. */
  private withFreeRegion(inactive: Set<number>, numG: number): Set<number> {
    if (!this.freeRegion) return inactive
    const [tA, tB] = this.freeRegion
    const gDegree = 4 * this.degree - 6
    const cpsPerSpan = gDegree + 1
    const dk = this.distinctKnots
    const out = new Set(inactive)
    for (let i = 0; i < numG; i++) {
      const span = Math.floor(i / cpsPerSpan)
      const localIdx = i % cpsPerSpan
      const tS = dk[span] ?? 0
      const tE = dk[span + 1] ?? 1
      const tMid = tS + (tE - tS) * (localIdx + 0.5) / cpsPerSpan
      if (tMid >= tA && tMid <= tB) out.add(i)
    }
    return out
  }

  private fullX(): number[] { return [this.pinStart.x, ...this.vx, this.pinEnd.x] }
  private fullY(): number[] { return [this.pinStart.y, ...this.vy, this.pinEnd.y] }

  getVariables(): number[] { return [...this.vx, ...this.vy] }

  setVariables(x: number[]): void {
    this.vx = x.slice(0, this.nInt)
    this.vy = x.slice(this.nInt)
  }

  computeObjective(): number {
    const fx = this.fullX(), fy = this.fullY()
    const m = this.dataX.length
    let sum = 0
    for (let i = 0; i < m; i++) {
      let cx = 0, cy = 0
      for (let j = 0; j < this.numCPs; j++) { cx += this.B[i][j] * fx[j]; cy += this.B[i][j] * fy[j] }
      sum += this.weights[i] * ((cx - this.dataX[i]) ** 2 + (cy - this.dataY[i]) ** 2)
    }
    let f = 0.5 * sum
    if (this.fairLambda > 0 && this.fairGram) {
      f += 0.5 * this.fairLambda * (this.quad(this.fairGram, fx) + this.quad(this.fairGram, fy))
    }
    return f
  }

  computeObjectiveGradient(): number[] {
    const gx = this.matVec(this.Hint, this.vx)
    const gy = this.matVec(this.Hint, this.vy)
    const grad = new Array<number>(2 * this.nInt)
    for (let a = 0; a < this.nInt; a++) {
      grad[a] = gx[a] - this.rhsX[a]
      grad[this.nInt + a] = gy[a] - this.rhsY[a]
    }
    if (this.fairLambda > 0 && this.fairGram) {
      // ∂/∂x_{a+1} [0.5 λ Pₓᵀ M Pₓ] = λ (M Pₓ)_{a+1}
      const Mx = this.matVec(this.fairGram, this.fullX())
      const My = this.matVec(this.fairGram, this.fullY())
      for (let a = 0; a < this.nInt; a++) {
        grad[a] += this.fairLambda * Mx[a + 1]
        grad[this.nInt + a] += this.fairLambda * My[a + 1]
      }
    }
    return grad
  }

  computeObjectiveHessian(): Matrix {
    const N = 2 * this.nInt
    const H: number[][] = []
    for (let i = 0; i < N; i++) H[i] = new Array<number>(N).fill(0)
    const M = this.fairGram
    const lam = this.fairLambda
    for (let i = 0; i < this.nInt; i++) {
      for (let j = 0; j < this.nInt; j++) {
        let v = this.Hint[i][j]
        if (lam > 0 && M) v += lam * M[i + 1][j + 1]
        H[i][j] = v
        H[this.nInt + i][this.nInt + j] = v
      }
    }
    return H
  }

  private quad(M: number[][], p: number[]): number {
    let s = 0
    for (let i = 0; i < p.length; i++) {
      let row = 0
      for (let j = 0; j < p.length; j++) row += M[i][j] * p[j]
      s += p[i] * row
    }
    return s
  }

  computeConstraints(): number[] {
    return computeCurvatureDerivativeNumeratorCPsFromArrays(this.knots, this.fullX(), this.fullY())
  }

  computeConstraintJacobian(): Matrix {
    const allIndices = Array.from({ length: this.numConstraints }, (_, i) => i)
    const jFull = computeExplicitJacobian(this.precomputed, this.fullX(), this.fullY(), allIndices)
    // jFull columns are [x_0 … x_{n-1}, y_0 … y_{n-1}]; keep only the interior
    // columns (drop the four pinned-endpoint derivatives).
    const n = this.numCPs
    const jac: number[][] = []
    for (let r = 0; r < this.numConstraints; r++) {
      const row = new Array<number>(2 * this.nInt)
      for (let a = 0; a < this.nInt; a++) {
        row[a] = jFull[r][a + 1]           // ∂g/∂x_{a+1}
        row[this.nInt + a] = jFull[r][n + a + 1] // ∂g/∂y_{a+1}
      }
      jac.push(row)
    }
    return jac
  }

  getConstraintSigns(): number[] { return [...this.constraintSigns] }

  getInactiveConstraints(): Set<number> { return new Set(this.inactiveConstraints) }

  updateConstraintState(): void {
    const gCPs = computeCurvatureDerivativeNumeratorCPsFromArrays(this.knots, this.fullX(), this.fullY())
    this.constraintSigns = gCPs.map(g => (g > 0 ? -1 : 1))
    this.inactiveConstraints = this.withFreeRegion(computeOpenInactiveSet(gCPs), gCPs.length)
  }

  /** Current full control points (pins + interior), for reading back the result. */
  getFullControlPoints(): { cpX: number[]; cpY: number[] } {
    return { cpX: this.fullX(), cpY: this.fullY() }
  }

  private matVec(A: number[][], x: number[]): number[] {
    const out = new Array<number>(A.length).fill(0)
    for (let i = 0; i < A.length; i++) {
      let s = 0
      for (let j = 0; j < x.length; j++) s += A[i][j] * x[j]
      out[i] = s
    }
    return out
  }
}
