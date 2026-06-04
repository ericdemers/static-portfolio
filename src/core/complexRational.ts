// ============================================================================
// Complex-rational B-spline editing layer (closed/periodic).
//
// Built on the existing core kernel: the complex curvature-derivative numerator
// (curvature.ts), complex arithmetic (complex.ts), and the primal-dual
// interior-point optimizer (optimize.ts). Provides the geometry the interactive
// Möbius / complex-rational slide needs:
//   - Farin-point ⇄ complex-weight conversion (the weight chain + wrapWeight),
//   - moving a control point while holding the Farin points fixed,
//   - moving a Farin point (re-deriving the weights),
//   - the arc control polygon path,
//   - Möbius transforms in homogeneous complex coordinates,
//   - a fixed-weight closed optimization problem that drags one control point
//     while preserving the curvature-extrema bound (S⁻ of the g coefficients).
//
// Ported from the sketcher's complex-rational engine, re-expressed on the clean
// core kernel (the heavy Bernstein/Chen-term algebra lives in curvature.ts).
// ============================================================================

import type { Point2D, ComplexPoint } from './types'
import { type Complex, cadd, csub, cmul, cdiv, cnorm } from './complex'
import {
  curvatureExtremaNumeratorComplexPeriodic,
  curvatureExtremaGradientComplexPeriodicFixedWeight,
  precomputeComplexPeriodicSeeds,
} from './curvature'
import type { ComplexPeriodicSeeds } from './curvature'
import type { Matrix } from './linalg'
import type { OptimizationProblem, OptimizerConfig } from './optimize'
import { PrimalDualOptimizer } from './optimize'
import { InteriorPointOptimizer } from './ipopt/InteriorPointOptimizer'
import { assignSignsNeighbor, structuralMargins } from './curvatureProblem'

export interface ComplexRationalCurve {
  degree: number
  knots: number[]
  controlPoints: ComplexPoint[]
  closed: boolean
  /** For closed curves the Farin positions are the primary geometric data. */
  farinPositions?: Point2D[]
  /** Periodic monodromy: the effective weight on the wrap (seam) edge. */
  wrapWeight?: { re: number; im: number }
}

export interface ComplexFarinPoint {
  index: number
  position: Point2D
  controlPointBefore: Point2D
  controlPointAfter: Point2D
}

// ============================================================================
// Farin points ⇄ complex weights.
//
// The Farin (weight) point of an edge z₀→z₁ with weights w₀, w₁ is the
// weighted midpoint q = (w₀·z₀ + w₁·z₁)/(w₀ + w₁). Inverting, the weight chain
// is w₀ = 1, w_{k+1} = w_k·(q_k − z_k)/(z_{k+1} − q_k). For a closed curve the
// wrap edge (z_{n-1}→z₀) yields the wrapWeight rather than w₀.
// ============================================================================

/** Farin positions from the current complex weights (q = (w₀z₀ + w₁z₁)/(w₀+w₁)). */
export function initializeFarinPositionsFromComplexWeights(
  controlPoints: ComplexPoint[],
  closed: boolean,
): Point2D[] {
  const n = controlPoints.length
  const numEdges = closed ? n : n - 1
  const positions: Point2D[] = []
  for (let i = 0; i < numEdges; i++) {
    const cp0 = controlPoints[i]
    const cp1 = controlPoints[(i + 1) % n]
    const z0: Complex = { re: cp0.re, im: cp0.im }
    const z1: Complex = { re: cp1.re, im: cp1.im }
    const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
    const w1: Complex = { re: cp1.w_re, im: cp1.w_im }
    const q = cdiv(cadd(cmul(w0, z0), cmul(w1, z1)), cadd(w0, w1))
    positions.push({ x: q.re, y: q.im })
  }
  return positions
}

/**
 * Farin points of a complex-rational curve. Uses stored farinPositions as the
 * source of truth when present (closed); otherwise derives them from the
 * weights, substituting wrapWeight for w₁ on the wrap edge.
 */
export function computeComplexFarinPoints(curve: ComplexRationalCurve): ComplexFarinPoint[] {
  const { controlPoints } = curve
  const n = controlPoints.length
  if (n < 2) return []
  const numEdges = curve.closed ? n : n - 1
  const useStored =
    curve.closed && curve.farinPositions && curve.farinPositions.length === numEdges

  const farinPoints: ComplexFarinPoint[] = []
  for (let i = 0; i < numEdges; i++) {
    const cp0 = controlPoints[i]
    const cp1 = controlPoints[(i + 1) % n]
    let position: Point2D
    if (useStored) {
      position = curve.farinPositions![i]
    } else {
      const z0: Complex = { re: cp0.re, im: cp0.im }
      const z1: Complex = { re: cp1.re, im: cp1.im }
      const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
      const isWrapEdge = curve.closed && i === n - 1
      const w1: Complex =
        isWrapEdge && curve.wrapWeight
          ? { re: curve.wrapWeight.re, im: curve.wrapWeight.im }
          : { re: cp1.w_re, im: cp1.w_im }
      const q = cdiv(cadd(cmul(w0, z0), cmul(w1, z1)), cadd(w0, w1))
      position = { x: q.re, y: q.im }
    }
    farinPoints.push({
      index: i,
      position,
      controlPointBefore: { x: cp0.re, y: cp0.im },
      controlPointAfter: { x: cp1.re, y: cp1.im },
    })
  }
  return farinPoints
}

/**
 * Move control point `index` to `newPosition`, recomputing the weights so every
 * Farin point stays fixed. Returns the new control points + wrapWeight. (Free
 * mode CP drag.)
 */
export function moveComplexControlPointKeepingFarinFixed(
  curve: ComplexRationalCurve,
  controlPointIndex: number,
  newPosition: Point2D,
  minDistance = 5,
): { points: ComplexPoint[]; wrapWeight?: { re: number; im: number } } {
  const { controlPoints } = curve
  const n = controlPoints.length
  const numEdges = curve.closed ? n : n - 1
  const newPoints = controlPoints.map((p) => ({ ...p }))

  const farinPositions =
    curve.farinPositions && curve.farinPositions.length === numEdges
      ? curve.farinPositions
      : initializeFarinPositionsFromComplexWeights(controlPoints, curve.closed)

  // Keep the moved CP at least minDistance from its neighbouring Farin points.
  let pos = { ...newPosition }
  const pushOff = (f: Point2D | undefined) => {
    if (!f) return
    const dist = Math.hypot(pos.x - f.x, pos.y - f.y)
    if (dist < minDistance) {
      const scale = dist > 0 ? minDistance / dist : 1
      pos = { x: f.x + (pos.x - f.x) * scale, y: f.y + (pos.y - f.y) * scale }
    }
  }
  if (controlPointIndex > 0 || curve.closed) {
    pushOff(farinPositions[curve.closed ? (controlPointIndex - 1 + numEdges) % numEdges : controlPointIndex - 1])
  }
  if (controlPointIndex < numEdges) pushOff(farinPositions[controlPointIndex])

  newPoints[controlPointIndex].re = pos.x
  newPoints[controlPointIndex].im = pos.y

  // Re-derive weights forward to hold the Farin points: w_{i+1} = w_i·(q_i − z_i)/(z_{i+1} − q_i).
  const edgesToPropagate = curve.closed ? numEdges - 1 : numEdges
  for (let i = 0; i < edgesToPropagate; i++) {
    const idx0 = i
    const idx1 = (i + 1) % n
    const q: Complex = { re: farinPositions[i].x, im: farinPositions[i].y }
    const zBefore: Complex = { re: newPoints[idx0].re, im: newPoints[idx0].im }
    const zAfter: Complex = { re: newPoints[idx1].re, im: newPoints[idx1].im }
    const denom = csub(zAfter, q)
    if (cnorm(denom) < 1e-10) continue
    const wBefore: Complex = { re: newPoints[idx0].w_re, im: newPoints[idx0].w_im }
    const wAfter = cmul(wBefore, cdiv(csub(q, zBefore), denom))
    newPoints[idx1].w_re = wAfter.re
    newPoints[idx1].w_im = wAfter.im
  }

  let wrapWeight: { re: number; im: number } | undefined
  if (curve.closed) {
    const q: Complex = { re: farinPositions[n - 1].x, im: farinPositions[n - 1].y }
    const zLast: Complex = { re: newPoints[n - 1].re, im: newPoints[n - 1].im }
    const zFirst: Complex = { re: newPoints[0].re, im: newPoints[0].im }
    const wLast: Complex = { re: newPoints[n - 1].w_re, im: newPoints[n - 1].w_im }
    const denom = csub(zFirst, q)
    wrapWeight =
      cnorm(denom) < 1e-10 ? { re: wLast.re, im: wLast.im } : cmul(wLast, cdiv(csub(q, zLast), denom))
  }
  return { points: newPoints, wrapWeight }
}

/**
 * Move Farin point `farinIndex` to `newPosition`, re-deriving all weights from
 * the (closed) Farin positions. Returns new points + farinPositions + wrapWeight.
 * (Free mode Farin drag.)
 */
export function updateWeightsFromComplexFarin(
  curve: ComplexRationalCurve,
  farinIndex: number,
  newPosition: Point2D,
  minDistance = 5,
): { newPoints: ComplexPoint[]; newFarinPositions?: Point2D[]; newWrapWeight?: { re: number; im: number } } {
  const { controlPoints } = curve
  const n = controlPoints.length
  const numEdges = curve.closed ? n : n - 1
  const newPoints = controlPoints.map((p) => ({ ...p }))

  const cp0 = controlPoints[farinIndex]
  const cp1 = controlPoints[(farinIndex + 1) % n]
  // Keep the Farin point clear of its two endpoints.
  let q = { ...newPosition }
  const pushOff = (zx: number, zy: number) => {
    const dist = Math.hypot(q.x - zx, q.y - zy)
    if (dist < minDistance) {
      const scale = dist > 0 ? minDistance / dist : 1
      q = { x: zx + (q.x - zx) * scale, y: zy + (q.y - zy) * scale }
    }
  }
  pushOff(cp0.re, cp0.im)
  pushOff(cp1.re, cp1.im)

  if (!curve.closed) {
    // Open: only the local weight changes (the slide's curve is closed; kept for completeness).
    const denom = csub({ re: cp1.re, im: cp1.im }, { re: q.x, im: q.y })
    if (cnorm(denom) < 1e-10) return { newPoints }
    const wPrev: Complex = { re: cp0.w_re, im: cp0.w_im }
    const w = cmul(wPrev, cdiv(csub({ re: q.x, im: q.y }, { re: cp0.re, im: cp0.im }), denom))
    newPoints[(farinIndex + 1) % n].w_re = w.re
    newPoints[(farinIndex + 1) % n].w_im = w.im
    return { newPoints }
  }

  const positions =
    curve.farinPositions && curve.farinPositions.length === numEdges
      ? curve.farinPositions.map((p) => ({ ...p }))
      : initializeFarinPositionsFromComplexWeights(controlPoints, true)
  positions[farinIndex] = q

  newPoints[0].w_re = 1
  newPoints[0].w_im = 0
  for (let i = 1; i < n; i++) {
    const farin = positions[i - 1]
    const zPrev: Complex = { re: controlPoints[i - 1].re, im: controlPoints[i - 1].im }
    const zCurr: Complex = { re: controlPoints[i].re, im: controlPoints[i].im }
    const wPrev: Complex = { re: newPoints[i - 1].w_re, im: newPoints[i - 1].w_im }
    const denom = csub(zCurr, { re: farin.x, im: farin.y })
    const wCurr =
      cnorm(denom) < 1e-10 ? wPrev : cmul(wPrev, cdiv(csub({ re: farin.x, im: farin.y }, zPrev), denom))
    newPoints[i].w_re = wCurr.re
    newPoints[i].w_im = wCurr.im
  }

  const qLast = positions[n - 1]
  const zLast: Complex = { re: controlPoints[n - 1].re, im: controlPoints[n - 1].im }
  const zFirst: Complex = { re: controlPoints[0].re, im: controlPoints[0].im }
  const wLast: Complex = { re: newPoints[n - 1].w_re, im: newPoints[n - 1].w_im }
  const denomWrap = csub(zFirst, { re: qLast.x, im: qLast.y })
  const newWrapWeight =
    cnorm(denomWrap) < 1e-10
      ? { re: wLast.re, im: wLast.im }
      : cmul(wLast, cdiv(csub({ re: qLast.x, im: qLast.y }, zLast), denomWrap))

  return { newPoints, newFarinPositions: positions, newWrapWeight }
}

// ============================================================================
// Arc control polygon. Each edge is the circular arc through z₀, its Farin
// point, and z₁ (a straight segment when the weights are equal). Inputs are in
// whatever coordinate space (typically pixels) the caller passes.
// ============================================================================

const isFinitePt = (p: Point2D) => Number.isFinite(p.x) && Number.isFinite(p.y)

function arcGeometry(
  start: Point2D,
  through: Point2D,
  end: Point2D,
): { radius: number; sweepFlag: number; largeArcFlag: number } | null {
  const v1x = through.x - start.x, v1y = through.y - start.y
  const v2x = end.x - start.x, v2y = end.y - start.y
  const cross = v1x * v2y - v1y * v2x
  if (Math.abs(cross) < 1e-10) return null

  const ax = start.x, ay = start.y, bx = through.x, by = through.y, cx = end.x, cy = end.y
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-10) return null
  const aSq = ax * ax + ay * ay, bSq = bx * bx + by * by, cSq = cx * cx + cy * cy
  const centerX = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d
  const centerY = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d
  const radius = Math.hypot(ax - centerX, ay - centerY)

  const sweepFlag = cross > 0 ? 1 : 0
  const centerCross = (centerX - start.x) * v2y - (centerY - start.y) * v2x
  const largeArcFlag = (cross > 0) === (centerCross > 0) ? 1 : 0
  return { radius, sweepFlag, largeArcFlag }
}

function arcPath(start: Point2D, through: Point2D, end: Point2D, maxRadius: number): string {
  if (!isFinitePt(start) || !isFinitePt(through) || !isFinitePt(end)) {
    return isFinitePt(start) && isFinitePt(end) ? `M ${start.x} ${start.y} L ${end.x} ${end.y}` : ''
  }
  const geom = arcGeometry(start, through, end)
  if (!geom || geom.radius > maxRadius || !Number.isFinite(geom.radius)) {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  }
  return `M ${start.x} ${start.y} A ${geom.radius} ${geom.radius} 0 ${geom.largeArcFlag} ${geom.sweepFlag} ${end.x} ${end.y}`
}

/** Arc control polygon path for a complex-rational curve (CPs + Farin points in display space). */
export function computeComplexControlPolygonPath(
  controlPoints: Point2D[],
  farinPoints: ComplexFarinPoint[],
  closed: boolean,
): string {
  if (controlPoints.length < 2) return ''
  const numEdges = closed ? controlPoints.length : controlPoints.length - 1
  const maxRadius = 10000
  const segments: string[] = []
  for (let i = 0; i < numEdges; i++) {
    const p0 = controlPoints[i]
    const p1 = controlPoints[(i + 1) % controlPoints.length]
    const farin = farinPoints[i]
    if (farin && isFinitePt(farin.position)) {
      const a = arcPath(p0, farin.position, p1, maxRadius)
      if (a) segments.push(a)
    } else if (isFinitePt(p0) && isFinitePt(p1)) {
      segments.push(`M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`)
    }
  }
  return segments.join(' ')
}

// ============================================================================
// Möbius transforms in homogeneous complex coordinates: f(z) = (a·z + b)/(c·z + d).
// ============================================================================

export interface MobiusTransform {
  a: Complex
  b: Complex
  c: Complex
  d: Complex
}

/** The Möbius transform sending three originals to three targets (null if degenerate). */
export function computeMobiusTransform(
  originals: Complex[],
  targets: Complex[],
): MobiusTransform | null {
  if (originals.length < 3 || targets.length < 3) return null
  const [z1, z2, z3] = originals
  const [w1, w2, w3] = targets
  const P = cmul(csub(w2, w3), csub(z2, z1))
  const Q = cmul(csub(w2, w1), csub(z2, z3))
  const a = csub(cmul(w1, P), cmul(w3, Q))
  const b = cadd(cmul({ re: -z3.re, im: -z3.im }, cmul(w1, P)), cmul(z1, cmul(w3, Q)))
  const c = csub(P, Q)
  const d = cadd(cmul({ re: -z3.re, im: -z3.im }, P), cmul(z1, Q))
  const det = csub(cmul(a, d), cmul(b, c))
  if (cnorm(det) < 1e-14) return null
  return { a, b, c, d }
}

/** Apply a Möbius transform to complex-rational control points (homogeneous coords). */
export function applyMobiusToComplexRational(
  transform: MobiusTransform,
  controlPoints: ComplexPoint[],
): ComplexPoint[] {
  return controlPoints.map((p) => {
    const w: Complex = { re: p.w_re, im: p.w_im }
    const z: Complex = { re: p.re, im: p.im }
    const wz = cmul(w, z)
    const newWz = cadd(cmul(transform.a, wz), cmul(transform.b, w))
    const newW = cadd(cmul(transform.c, wz), cmul(transform.d, w))
    const newZ = cdiv(newWz, newW)
    return { re: newZ.re, im: newZ.im, w_re: newW.re, w_im: newW.im }
  })
}

// ============================================================================
// Fixed-weight closed optimization problem: drag one control point while
// preserving the curvature-extrema bound. The weights (hence the Farin
// geometry) are frozen; only the control-point positions are free. The
// constraints keep the sign of every ACTIVE Bernstein coefficient of g.
// ============================================================================

/** Anchor-based sliding active set over g's coefficients (closed/periodic wrap-around). */
function computeInactiveSetPeriodic(gc: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gc.length
  if (n === 0) return inactive
  const sequences: { idx: number; abs: number }[][] = []
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
      sequences.push(seq)
      i = j + 1
    } else {
      i++
    }
  }
  // Periodic wrap-around (n-1 ↔ 0), merging with the adjacent runs.
  if (gc[n - 1] * gc[0] <= 0) {
    const wrap = [
      { idx: n - 1, abs: Math.abs(gc[n - 1]) },
      { idx: 0, abs: Math.abs(gc[0]) },
    ]
    const last = sequences.length > 0 ? sequences[sequences.length - 1] : null
    if (last && last[last.length - 1].idx === n - 1) {
      for (let k = 0; k < last.length - 1; k++) wrap.unshift(last[k])
      sequences.pop()
    }
    const first = sequences.length > 0 ? sequences[0] : null
    if (first && first[0].idx === 0) {
      for (let k = 1; k < first.length; k++) wrap.push(first[k])
      sequences.shift()
    }
    sequences.push(wrap)
  }
  for (const seq of sequences) {
    const anchor = seq.reduce((m, e) => (e.abs > m.abs ? e : m))
    for (const e of seq) if (e.idx !== anchor.idx) inactive.add(e.idx)
  }
  return inactive
}

export class ComplexRationalProblem implements OptimizationProblem {
  cpX: number[]
  cpY: number[]
  readonly numEqualityConstraints = 0

  private knots: number[]
  private degree: number
  private wre: number[]
  private wim: number[]
  private targetX: number[]
  private targetY: number[]
  private weights: number[]
  private anchorX: number[]
  private anchorY: number[]
  private anchorWeight: number
  private signs: number[]
  private activeIdx: number[]
  private margins: number[]
  // Geometry-independent seeds for the analytic Jacobian — reused across builds.
  private seeds: ComplexPeriodicSeeds
  private cachedCons: number[] | null = null
  private cachedJac: Matrix | null = null

  constructor(
    controlPoints: readonly ComplexPoint[],
    knots: readonly number[],
    degree: number,
    dragIndex: number,
    targetX: number,
    targetY: number,
    opts: {
      disableSliding?: boolean
      anchorX?: number[]
      anchorY?: number[]
      anchorWeight?: number
      dragWeight?: number
      /**
       * Robust regime (for the IPOPT solver): neighbour-aware signs + a tiny
       * positive margin for near-zero coefficients, so a structurally-/numerically-
       * zero g coefficient starts off the constraint wall instead of on it. Without
       * it the dense primal-dual slides such a coefficient across zero on a quick
       * drag and adds a curvature extremum (same failure the open curves had).
       */
      robust?: boolean
    } = {},
  ) {
    this.cpX = controlPoints.map((p) => p.re)
    this.cpY = controlPoints.map((p) => p.im)
    this.wre = controlPoints.map((p) => p.w_re)
    this.wim = controlPoints.map((p) => p.w_im)
    this.knots = [...knots]
    this.degree = degree
    this.seeds = precomputeComplexPeriodicSeeds(this.knots, degree, this.cpX.length)
    this.targetX = [...this.cpX]
    this.targetY = [...this.cpY]
    this.targetX[dragIndex] = targetX
    this.targetY[dragIndex] = targetY
    this.weights = this.cpX.map(() => 1)
    if (opts.dragWeight !== undefined) this.weights[dragIndex] = opts.dragWeight
    this.anchorX = opts.anchorX ?? [...this.cpX]
    this.anchorY = opts.anchorY ?? [...this.cpY]
    this.anchorWeight = opts.anchorWeight ?? 0

    const gc = this.numerator()
    const allSigns = opts.robust ? assignSignsNeighbor(gc) : gc.map((v) => (v > 0 ? -1 : 1))
    const inactive = opts.disableSliding ? new Set<number>() : computeInactiveSetPeriodic(gc)
    this.activeIdx = gc.map((_, i) => i).filter((i) => !inactive.has(i))
    this.signs = this.activeIdx.map((i) => allSigns[i])
    this.margins = opts.robust ? structuralMargins(gc, this.activeIdx) : this.activeIdx.map(() => 0)
  }

  /** g's Bernstein coefficients for the current control-point positions (weights fixed). */
  private numerator(): number[] {
    return curvatureExtremaNumeratorComplexPeriodic(
      this.cpX,
      this.cpY,
      this.wre,
      this.wim,
      this.knots,
      this.degree,
    ).flatCoeffs()
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
    return this.activeIdx.length
  }
  computeConstraints(): number[] {
    if (!this.cachedCons) {
      const gc = this.numerator()
      this.cachedCons = this.activeIdx.map((i, k) => gc[i] - this.signs[k] * this.margins[k])
    }
    return this.cachedCons
  }
  /**
   * Exact analytic ∂g/∂(control point) with weights fixed (the bound-mode drag).
   * The Chen value terms are computed once and each column is a differential
   * reusing them (curvatureExtremaGradientComplexPeriodicFixedWeight) — replaces
   * the old central-difference Jacobian (2·2m full-numerator re-evaluations per
   * build). m control points × 2 coords = 2m columns; rows = active g coeffs.
   */
  computeConstraintJacobian(): Matrix {
    if (this.cachedJac) return this.cachedJac
    const m = this.cpX.length
    const grad = curvatureExtremaGradientComplexPeriodicFixedWeight(
      this.cpX, this.cpY, this.wre, this.wim, this.knots, this.degree, this.seeds,
    )
    const dxf = grad.dx.map((b) => b.flatCoeffs())
    const dyf = grad.dy.map((b) => b.flatCoeffs())
    this.cachedJac = this.activeIdx.map((idx) => {
      const row = new Array<number>(2 * m).fill(0)
      for (let j = 0; j < m; j++) {
        row[j] = dxf[j][idx]
        row[m + j] = dyf[j][idx]
      }
      return row
    })
    return this.cachedJac
  }
  getConstraintSigns(): number[] {
    return this.signs
  }
  getInactiveConstraints(): Set<number> {
    return new Set<number>()
  }
  updateConstraintState(): void {
    const gc = this.numerator()
    this.signs = this.activeIdx.map((i) => (gc[i] > 0 ? -1 : 1))
    this.cachedCons = null
    this.cachedJac = null
  }
}


/**
 * Drag control point `dragIndex` of a closed complex-rational curve toward
 * (targetX, targetY), preserving the curvature-extrema bound. Weights are held
 * fixed (the Farin geometry rides along). Returns the new control points.
 */
export function slideComplexRational(
  controlPoints: readonly ComplexPoint[],
  knots: readonly number[],
  degree: number,
  dragIndex: number,
  targetX: number,
  targetY: number,
  opts: {
    disableSliding?: boolean
    anchorX?: number[]
    anchorY?: number[]
    anchorWeight?: number
    dragWeight?: number
    /**
     * 'primal-dual' (default) is the lean dense solver; 'ipopt' is the robust
     * InteriorPointOptimizer (trust region + filter + feasibility restoration)
     * the proven ../sketcher deck uses — it holds a near-zero g coefficient on
     * its side of zero where the dense solver lets it slide across on a quick
     * drag (adding a curvature extremum). Interactive complex-rational drags
     * (the talk's slide 17) must pass 'ipopt'.
     */
    method?: 'primal-dual' | 'ipopt'
    /**
     * IPOPT only. The drag objective is exact least-squares, so Gauss-Newton
     * (default) uses the true Hessian — faster and more accurate than BFGS, which
     * would only approximate it. Feasibility (the curvature bound) is held by the
     * barrier regardless. Matches ../sketcher's optimizeComplexRationalCurve.
     */
    enableBFGS?: boolean
  } & Partial<OptimizerConfig> = {},
): { points: ComplexPoint[]; converged: boolean } {
  const robust = opts.method === 'ipopt'
  const problem = new ComplexRationalProblem(controlPoints, knots, degree, dragIndex, targetX, targetY, {
    disableSliding: opts.disableSliding,
    anchorX: opts.anchorX,
    anchorY: opts.anchorY,
    anchorWeight: opts.anchorWeight,
    dragWeight: opts.dragWeight,
    robust,
  })
  const optimizer = robust
    ? new InteriorPointOptimizer(problem, {
        maxIterations: opts.maxIterations ?? 60,
        enableBFGS: opts.enableBFGS ?? false,
        returnBestFeasible: true,
      })
    : new PrimalDualOptimizer(problem, {
        maxIterations: opts.maxIterations ?? 60,
        returnBestFeasible: true,
      })
  const result = optimizer.optimize()
  problem.setVariables(result.variables)
  const points: ComplexPoint[] = controlPoints.map((p, i) => ({
    re: problem.cpX[i],
    im: problem.cpY[i],
    w_re: p.w_re,
    w_im: p.w_im,
  }))
  return { points, converged: result.converged }
}
