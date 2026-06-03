// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// ============================================================================
// B-SPLINE OPERATIONS MODULE
// ============================================================================
//
// This is the main entry point for B-spline functionality.
// Core functionality is organized into sub-modules:
// - ./bspline/periodic.ts: Periodic abstractions with spiral weight handling
// - ./bspline/core.ts: Curve evaluation
// - ./bspline/utilities.ts: Sampling, path generation, conversions
//
// This file contains curve operations that modify curves:
// - Knot insertion (insertKnot)
// - Degree elevation (elevateDegree)
// - Knot movement and removal
// ============================================================================

import type { Point2D, WeightedPoint2D, ComplexPoint, Curve, BSplineCurve, RationalBSplineCurve, ComplexRationalBSplineCurve } from '../types/curve'
import { cmult, cdiv, type Complex } from './complex'

// Re-export everything from sub-modules for backwards compatibility
export * from './bspline/periodic'
export * from './bspline/core'
export * from './bspline/utilities'

// Import what we need from sub-modules
import {
  periodicKnotAt,
  periodicControlPointAt,
  toPeriodicComplexBSpline,
  toPeriodicRationalBSpline,
  bsKnotAt,
  bsHomogeneousAt,
  bsNumCPs,
  rbsKnotAt,
  rbsHomogeneousAt,
  rbsNumCPs,
  type PeriodicComplexBSpline,
  type PeriodicRationalBSpline,
} from './bspline/periodic'

import {
  findKnotSpan,
  isPeriodicRepresentation,
} from './bspline/core'

// ============================================================================
// COVERING SPACE HELPERS
// ============================================================================

function windingNumber(degree: number, numControlPoints: number): number {
  return Math.ceil((degree + 1) / numControlPoints)
}

function requiredPeriods(degree: number, numControlPoints: number): number {
  const w = windingNumber(degree, numControlPoints)
  const blendMargin = Math.ceil(degree / numControlPoints)
  return w + 2 * blendMargin + 2
}

/**
 * Expand a periodic non-rational B-spline to covering space.
 * Control points are purely periodic (no spiral).
 */
function expandToCovering(
  knots: number[],
  controlPoints: Point2D[],
  degree: number,
  numPeriods: number,
  period: number = 1
): { expandedKnots: number[]; expandedCPs: Point2D[] } {
  const n = controlPoints.length
  const startPeriod = -Math.floor(numPeriods / 2)
  const totalCPs = numPeriods * n + degree
  const startIdx = startPeriod * n

  const numKnots = totalCPs + degree + 1
  const expandedKnots: number[] = []
  for (let i = 0; i < numKnots; i++) {
    expandedKnots.push(periodicKnotAt(knots, startIdx + i, period))
  }

  const expandedCPs: Point2D[] = []
  for (let i = 0; i < totalCPs; i++) {
    const cp = periodicControlPointAt(controlPoints, startIdx + i)
    expandedCPs.push({ x: cp.x, y: cp.y })
  }

  return { expandedKnots, expandedCPs }
}

/**
 * Expand a periodic rational B-spline to covering space using spiral accessors.
 * Returns parallel Point2D[] arrays for homogeneous components (wx,wy) and (w,0).
 */
function expandRationalToCovering(
  pbs: PeriodicRationalBSpline,
  numPeriods: number
): { knots: number[]; homo: Point2D[]; w: Point2D[]; startIdx: number } {
  const p = pbs.degree
  const n = rbsNumCPs(pbs)
  const period = 1
  const startPeriod = -Math.floor(numPeriods / 2)
  const totalCPs = numPeriods * n + p
  const startIdx = startPeriod * n

  const numKnots = totalCPs + p + 1
  const knots: number[] = []
  for (let i = 0; i < numKnots; i++) {
    knots.push(rbsKnotAt(pbs, startIdx + i, period))
  }

  const homo: Point2D[] = []
  const w: Point2D[] = []
  for (let i = 0; i < totalCPs; i++) {
    const h = rbsHomogeneousAt(pbs, startIdx + i)
    homo.push({ x: h.wx, y: h.wy })
    w.push({ x: h.w, y: 0 })
  }

  return { knots, homo, w, startIdx }
}

/**
 * Expand a periodic complex-rational B-spline to covering space using spiral accessors.
 * Returns parallel Point2D[] arrays for homogeneous components c0=(w*z) and c1=(w).
 */
function expandComplexToCovering(
  pbs: PeriodicComplexBSpline,
  numPeriods: number
): { knots: number[]; c0: Point2D[]; c1: Point2D[]; startIdx: number } {
  const p = pbs.degree
  const n = bsNumCPs(pbs)
  const period = 1
  const startPeriod = -Math.floor(numPeriods / 2)
  const totalCPs = numPeriods * n + p
  const startIdx = startPeriod * n

  const numKnots = totalCPs + p + 1
  const knots: number[] = []
  for (let i = 0; i < numKnots; i++) {
    knots.push(bsKnotAt(pbs, startIdx + i, period))
  }

  const c0: Point2D[] = []
  const c1: Point2D[] = []
  for (let i = 0; i < totalCPs; i++) {
    const h = bsHomogeneousAt(pbs, startIdx + i)
    c0.push({ x: h.c0.re, y: h.c0.im })
    c1.push({ x: h.c1.re, y: h.c1.im })
  }

  return { knots, c0, c1, startIdx }
}

/**
 * Contract expanded knots back to one period.
 * Returns the new knots (normalized to [0, period)) and the startKnotIdx
 * for slicing any parallel arrays.
 */
function contractToPeriod(
  expandedKnots: number[],
  period: number = 1
): { newKnots: number[]; startKnotIdx: number } {
  const midKnot = (expandedKnots[0] + expandedKnots[expandedKnots.length - 1]) / 2
  const targetStart = Math.floor(midKnot / period) * period

  let startKnotIdx = 0
  while (startKnotIdx < expandedKnots.length && expandedKnots[startKnotIdx] < targetStart - 1e-10) {
    startKnotIdx++
  }

  const newKnots: number[] = []
  let knotIdx = startKnotIdx
  while (knotIdx < expandedKnots.length && expandedKnots[knotIdx] < targetStart + period - 1e-10) {
    newKnots.push(expandedKnots[knotIdx] - targetStart)
    knotIdx++
  }

  return { newKnots, startKnotIdx }
}

/**
 * Remove a knot from an open B-spline given raw knots + Point2D[] control points.
 * Analogous to boehmInsertOpen — this is the open-curve building block for periodic removal.
 */
function removeKnotOpen(
  knots: number[],
  controlPoints: Point2D[],
  degree: number,
  knotIndex: number,
  tolerance: number
): { newKnots: number[]; newCPs: Point2D[] } | null {
  const n = controlPoints.length
  const m = knots.length - 1
  const u = knots[knotIndex]

  // Find rightmost index with same knot value
  let r = knotIndex
  while (r < m && Math.abs(knots[r + 1] - u) < 1e-10) {
    r++
  }

  // Count multiplicity
  let s = 0
  for (let i = 0; i <= m; i++) {
    if (Math.abs(knots[i] - u) < 1e-10) {
      s++
    }
  }

  if (s > degree) return null

  const ord = degree + 1
  const first = r - degree
  const last = r - s

  if (first < 0 || last >= n - 1) return null

  const add = (a: Point2D, b: Point2D): Point2D => ({ x: a.x + b.x, y: a.y + b.y })
  const sub = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y })
  const scale = (sc: number, p: Point2D): Point2D => ({ x: sc * p.x, y: sc * p.y })
  const norm = (p: Point2D): number => Math.sqrt(p.x * p.x + p.y * p.y)

  const temp: Point2D[] = new Array(last - first + 3)

  temp[0] = controlPoints[first - 1 >= 0 ? first - 1 : 0]
  temp[last - first + 2] = controlPoints[last + 1 < n ? last + 1 : n - 1]

  let i = first
  let j = last
  let ii = 1
  let jj = last - first + 1

  while (j - i > 0) {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    if (Math.abs(alphaI) < 1e-14) {
      temp[ii] = controlPoints[i]
    } else if (Math.abs(alphaI - 1) < 1e-14) {
      temp[ii] = temp[ii - 1]
    } else {
      const scaled = scale(1 - alphaI, temp[ii - 1])
      const diff = sub(controlPoints[i], scaled)
      temp[ii] = scale(1 / alphaI, diff)
    }

    const alphaJ = (u - knots[j]) / (knots[j + ord] - knots[j])
    if (Math.abs(1 - alphaJ) < 1e-14) {
      temp[jj] = controlPoints[j]
    } else if (Math.abs(alphaJ) < 1e-14) {
      temp[jj] = temp[jj + 1]
    } else {
      const scaled = scale(alphaJ, temp[jj + 1])
      const diff = sub(controlPoints[j], scaled)
      temp[jj] = scale(1 / (1 - alphaJ), diff)
    }

    i++
    ii++
    j--
    jj--
  }

  let removable = false
  if (j - i < 0) {
    const diff = sub(temp[ii - 1], temp[jj + 1])
    const removalError = norm(diff)
    if (removalError <= tolerance) {
      removable = true
    }
  } else {
    const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
    const interpPt = add(scale(1 - alphaI, temp[ii - 1]), scale(alphaI, temp[jj + 1]))
    const diff = sub(controlPoints[i], interpPt)
    const removalError = norm(diff)
    if (removalError <= tolerance) {
      removable = true
      temp[ii] = interpPt
    }
  }

  if (!removable) return null

  const newCPs: Point2D[] = []
  const tempEnd = last - first + 2

  for (let idx = 0; idx < first; idx++) {
    newCPs.push(controlPoints[idx])
  }

  for (let tempIdx = 1; tempIdx < ii; tempIdx++) {
    newCPs.push(temp[tempIdx])
  }

  const rightStart = (j === i) ? jj + 1 : jj + 2
  for (let tempIdx = rightStart; tempIdx < tempEnd; tempIdx++) {
    newCPs.push(temp[tempIdx])
  }

  for (let idx = last + 1; idx < n; idx++) {
    newCPs.push(controlPoints[idx])
  }

  const newKnots = [...knots.slice(0, knotIndex), ...knots.slice(knotIndex + 1)]

  return { newKnots, newCPs }
}

function boehmInsertOpen(
  knots: number[],
  controlPoints: Point2D[],
  degree: number,
  t: number
): { newKnots: number[]; newCPs: Point2D[] } {
  if (controlPoints.length === 0) {
    return { newKnots: knots, newCPs: controlPoints }
  }

  let span = degree
  while (span < knots.length - degree - 1 && knots[span + 1] <= t) {
    span++
  }

  if (span < degree || span >= controlPoints.length) {
    return { newKnots: [...knots], newCPs: controlPoints.map(p => ({ ...p })) }
  }

  const newKnots = [...knots.slice(0, span + 1), t, ...knots.slice(span + 1)]
  const newCPs: Point2D[] = []

  for (let i = 0; i <= span - degree; i++) {
    if (i >= 0 && i < controlPoints.length) {
      newCPs.push({ ...controlPoints[i] })
    }
  }

  for (let i = span - degree + 1; i <= span; i++) {
    if (i - 1 < 0 || i >= controlPoints.length) continue
    const denom = knots[i + degree] - knots[i]
    const alpha = denom === 0 ? 0 : (t - knots[i]) / denom
    newCPs.push({
      x: (1 - alpha) * controlPoints[i - 1].x + alpha * controlPoints[i].x,
      y: (1 - alpha) * controlPoints[i - 1].y + alpha * controlPoints[i].y,
    })
  }

  for (let i = span; i < controlPoints.length; i++) {
    newCPs.push({ ...controlPoints[i] })
  }

  return { newKnots, newCPs }
}

/**
 * Compute insertion points for all periodic copies of u within the expanded knot range.
 */
function computePeriodicInsertionPoints(
  uNorm: number,
  expandedKnots: number[],
  numPeriods: number,
  period: number = 1
): number[] {
  const startKnot = expandedKnots[0]
  const endKnot = expandedKnots[expandedKnots.length - 1]
  const insertionPoints: number[] = []
  for (let k = -numPeriods; k <= numPeriods; k++) {
    const pos = uNorm + k * period
    if (pos > startKnot + 1e-10 && pos < endKnot - 1e-10) {
      if (!expandedKnots.some(ek => Math.abs(ek - pos) < 1e-10)) {
        insertionPoints.push(pos)
      }
    }
  }
  insertionPoints.sort((a, b) => b - a) // Right to left
  return insertionPoints
}

/**
 * Compute removal points for all periodic copies of u within the expanded knot range.
 * Returns knot indices in the expanded vector, sorted right-to-left so that
 * removal doesn't invalidate earlier indices.
 */
function computePeriodicRemovalPoints(
  uNorm: number,
  expandedKnots: number[],
  numPeriods: number,
  period: number = 1
): number[] {
  const startKnot = expandedKnots[0]
  const endKnot = expandedKnots[expandedKnots.length - 1]
  const removalIndices: number[] = []

  for (let k = -numPeriods; k <= numPeriods; k++) {
    const pos = uNorm + k * period
    if (pos > startKnot + 1e-10 && pos < endKnot - 1e-10) {
      // Find a knot index with this value
      for (let i = 0; i < expandedKnots.length; i++) {
        if (Math.abs(expandedKnots[i] - pos) < 1e-10) {
          removalIndices.push(i)
          break
        }
      }
    }
  }

  removalIndices.sort((a, b) => b - a) // Right to left
  return removalIndices
}

// ============================================================================
// KNOT INSERTION
// ============================================================================

/**
 * Insert a knot into a periodic complex-rational B-spline using Boehm's algorithm.
 *
 * Uses the covering space approach: unwind the spiral to multiple periods in
 * homogeneous coordinates, insert at all periodic copies, then contract back.
 * This correctly handles boundary wrapping when the insertion span k < degree.
 */
export function insertKnotPeriodicComplex(
  pbs: PeriodicComplexBSpline,
  u: number
): PeriodicComplexBSpline {
  const p = pbs.degree
  const n = bsNumCPs(pbs)
  const period = 1
  const uNorm = ((u % period) + period) % period
  const numPeriods = requiredPeriods(p, n)

  // 1. Expand to covering space in homogeneous coordinates using spiral accessors.
  const expanded = expandComplexToCovering(pbs, numPeriods)

  // 2. Insert at all periodic copies of u within the expanded range.
  const insertionPoints = computePeriodicInsertionPoints(uNorm, expanded.knots, numPeriods, period)

  let curKnots = expanded.knots
  let curC0 = expanded.c0
  let curC1 = expanded.c1
  for (const insertPos of insertionPoints) {
    const resC0 = boehmInsertOpen(curKnots, curC0, p, insertPos)
    const resC1 = boehmInsertOpen(curKnots, curC1, p, insertPos)
    curKnots = resC0.newKnots
    curC0 = resC0.newCPs
    curC1 = resC1.newCPs
  }

  // 3. Contract back to one period.
  const { newKnots, startKnotIdx } = contractToPeriod(curKnots, period)

  const newN = newKnots.length
  const newPositions: Complex[] = []
  const newWeights: Complex[] = []
  for (let i = 0; i < newN; i++) {
    const cpIdx = startKnotIdx + i
    const c0: Complex = { re: curC0[cpIdx].x, im: curC0[cpIdx].y }
    const c1: Complex = { re: curC1[cpIdx].x, im: curC1[cpIdx].y }
    newPositions.push(cdiv(c0, c1))
    newWeights.push(c1)
  }

  // 4. Recompute weightRatio from the covering space.
  let newRatio = pbs.weightRatio
  const w0 = newWeights[0]
  const w0NormSq = w0.re * w0.re + w0.im * w0.im
  if (w0NormSq > 1e-20) {
    const nextPeriodIdx = startKnotIdx + newN
    if (nextPeriodIdx < curC1.length) {
      const wNext: Complex = { re: curC1[nextPeriodIdx].x, im: curC1[nextPeriodIdx].y }
      newRatio = cdiv(wNext, w0)
    }
  }

  return {
    knots: newKnots,
    positions: newPositions,
    weights: newWeights,
    degree: p,
    weightRatio: newRatio,
  }
}

/**
 * Insert a knot into a periodic rational B-spline using Boehm's algorithm.
 *
 * Uses the covering space approach: unwind the spiral to multiple periods in
 * homogeneous coordinates (wx, wy, w), insert at all periodic copies, then
 * contract back. This correctly handles boundary wrapping when k < degree.
 */
export function insertKnotPeriodicRational(
  pbs: PeriodicRationalBSpline,
  u: number
): PeriodicRationalBSpline {
  const p = pbs.degree
  const n = rbsNumCPs(pbs)
  const period = 1
  const uNorm = ((u % period) + period) % period
  const numPeriods = requiredPeriods(p, n)

  // 1. Expand to covering space in homogeneous coordinates using spiral accessors.
  const expanded = expandRationalToCovering(pbs, numPeriods)

  // 2. Insert at all periodic copies of u within the expanded range.
  const insertionPoints = computePeriodicInsertionPoints(uNorm, expanded.knots, numPeriods, period)

  let curKnots = expanded.knots
  let curHomo = expanded.homo
  let curW = expanded.w
  for (const insertPos of insertionPoints) {
    const resHomo = boehmInsertOpen(curKnots, curHomo, p, insertPos)
    const resW = boehmInsertOpen(curKnots, curW, p, insertPos)
    curKnots = resHomo.newKnots
    curHomo = resHomo.newCPs
    curW = resW.newCPs
  }

  // 3. Contract back to one period.
  const { newKnots, startKnotIdx } = contractToPeriod(curKnots, period)

  const newN = newKnots.length
  const newPositions: Point2D[] = []
  const newWeights: number[] = []
  for (let i = 0; i < newN; i++) {
    const cpIdx = startKnotIdx + i
    const wx = curHomo[cpIdx].x
    const wy = curHomo[cpIdx].y
    const w = curW[cpIdx].x
    if (Math.abs(w) > 1e-14) {
      newPositions.push({ x: wx / w, y: wy / w })
    } else {
      newPositions.push({ x: 0, y: 0 })
    }
    newWeights.push(w)
  }

  // 4. Recompute weightRatio from the covering space.
  let newRatio = pbs.weightRatio
  if (Math.abs(newWeights[0]) > 1e-14) {
    const nextPeriodIdx = startKnotIdx + newN
    if (nextPeriodIdx < curW.length) {
      newRatio = curW[nextPeriodIdx].x / newWeights[0]
    }
  }

  return {
    knots: newKnots,
    positions: newPositions,
    weights: newWeights,
    degree: p,
    weightRatio: newRatio,
  }
}

/**
 * Insert a knot into a periodic non-rational B-spline using covering space approach.
 */
function insertPeriodicKnot(curve: BSplineCurve, t: number): BSplineCurve {
  const { degree, knots, controlPoints } = curve
  const n = controlPoints.length
  const period = 1

  const tNorm = ((t % period) + period) % period

  const numPeriods = requiredPeriods(degree, n)
  let { expandedKnots, expandedCPs } = expandToCovering(knots, controlPoints, degree, numPeriods, period)

  const insertionPoints = computePeriodicInsertionPoints(tNorm, expandedKnots, numPeriods, period)

  for (const insertPos of insertionPoints) {
    const result = boehmInsertOpen(expandedKnots, expandedCPs, degree, insertPos)
    expandedKnots = result.newKnots
    expandedCPs = result.newCPs
  }

  const { newKnots, startKnotIdx } = contractToPeriod(expandedKnots, period)

  const newCPs: Point2D[] = []
  for (let i = 0; i < newKnots.length; i++) {
    const cpIdx = startKnotIdx + i
    if (cpIdx >= 0 && cpIdx < expandedCPs.length) {
      newCPs.push({ ...expandedCPs[cpIdx] })
    }
  }

  return {
    ...curve,
    knots: newKnots,
    controlPoints: newCPs,
  }
}

/**
 * Insert a knot into a curve.
 * Handles open and periodic curves of all types (bspline, rational, complex-rational).
 */
export function insertKnot(curve: Curve, t: number): Curve {
  const { degree, knots, closed } = curve

  if (closed && isPeriodicRepresentation(curve)) {
    if (curve.kind === 'bspline') {
      return insertPeriodicKnot(curve, t)
    } else if (curve.kind === 'rational') {
      // Convert to periodic representation, insert, convert back
      const pbs = toPeriodicRationalBSpline(curve)
      const newPbs = insertKnotPeriodicRational(pbs, t)

      const newN = newPbs.positions.length
      const newControlPoints: WeightedPoint2D[] = newPbs.positions.map((p, i) => ({
        x: p.x,
        y: p.y,
        w: newPbs.weights[i],
      }))

      const newWrapWeight = newPbs.weights[0] * newPbs.weightRatio

      const newFarinTValues: number[] = []
      for (let i = 0; i < newN; i++) {
        const w0 = newPbs.weights[i]
        const isWrapEdge = (i === newN - 1)
        const w1 = isWrapEdge ? newWrapWeight : newPbs.weights[(i + 1) % newN]
        const totalWeight = w0 + w1
        const tValue = totalWeight > 0 ? w1 / totalWeight : 0.5
        newFarinTValues.push(tValue)
      }

      return {
        ...curve,
        knots: [...newPbs.knots],
        controlPoints: newControlPoints,
        farinTValues: newFarinTValues,
        wrapWeight: newWrapWeight,
      }
    } else if (curve.kind === 'complex-rational') {
      // Convert to periodic representation, insert, convert back
      const pbs = toPeriodicComplexBSpline(curve)
      const newPbs = insertKnotPeriodicComplex(pbs, t)

      const newN = newPbs.positions.length
      const newControlPoints: ComplexPoint[] = newPbs.positions.map((z, i) => ({
        re: z.re,
        im: z.im,
        w_re: newPbs.weights[i].re,
        w_im: newPbs.weights[i].im,
      }))

      const w0_base = newPbs.weights[0]
      const newWrapWeight = cmult(w0_base, newPbs.weightRatio)

      const newFarinPositions: Point2D[] = []
      for (let i = 0; i < newN; i++) {
        const z0 = newPbs.positions[i]
        const z1 = newPbs.positions[(i + 1) % newN]
        const w0 = newPbs.weights[i]

        const isWrapEdge = (i === newN - 1)
        const w1 = isWrapEdge ? newWrapWeight : newPbs.weights[(i + 1) % newN]

        const c0 = cmult(w0, z0)
        const c1 = cmult(w1, z1)
        const num: Complex = { re: c0.re + c1.re, im: c0.im + c1.im }
        const denom: Complex = { re: w0.re + w1.re, im: w0.im + w1.im }
        const q = cdiv(num, denom)

        newFarinPositions.push({ x: q.re, y: q.im })
      }

      return {
        ...curve,
        knots: [...newPbs.knots],
        controlPoints: newControlPoints,
        farinPositions: newFarinPositions,
        wrapWeight: { re: newWrapWeight.re, im: newWrapWeight.im },
      }
    }
  }

  const span = findKnotSpan(degree, knots, t)
  const newKnots = [...knots.slice(0, span + 1), t, ...knots.slice(span + 1)]

  if (curve.kind === 'bspline') {
    const oldPoints = curve.controlPoints
    const newPoints: Point2D[] = []

    for (let i = 0; i <= span - degree; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    for (let i = span - degree + 1; i <= span; i++) {
      const alpha = (t - knots[i]) / (knots[i + degree] - knots[i])
      newPoints.push({
        x: (1 - alpha) * oldPoints[i - 1].x + alpha * oldPoints[i].x,
        y: (1 - alpha) * oldPoints[i - 1].y + alpha * oldPoints[i].y,
      })
    }

    for (let i = span; i < oldPoints.length; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    return { ...curve, knots: newKnots, controlPoints: newPoints }
  }

  if (curve.kind === 'rational') {
    const oldPoints = curve.controlPoints
    const newPoints: WeightedPoint2D[] = []

    for (let i = 0; i <= span - degree; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    for (let i = span - degree + 1; i <= span; i++) {
      const alpha = (t - knots[i]) / (knots[i + degree] - knots[i])
      // Interpolate in homogeneous space: (x*w, y*w, w)
      const p0 = oldPoints[i - 1]
      const p1 = oldPoints[i]
      const xw = (1 - alpha) * p0.x * p0.w + alpha * p1.x * p1.w
      const yw = (1 - alpha) * p0.y * p0.w + alpha * p1.y * p1.w
      const w = (1 - alpha) * p0.w + alpha * p1.w
      newPoints.push({ x: xw / w, y: yw / w, w })
    }

    for (let i = span; i < oldPoints.length; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    return { ...curve, knots: newKnots, controlPoints: newPoints }
  }

  // complex-rational: interpolate in homogeneous space c0 = z*w, c1 = w
  const oldPoints = (curve as ComplexRationalBSplineCurve).controlPoints
  const newPoints: ComplexPoint[] = []

  for (let i = 0; i <= span - degree; i++) {
    newPoints.push({ ...oldPoints[i] })
  }

  for (let i = span - degree + 1; i <= span; i++) {
    const alpha = (t - knots[i]) / (knots[i + degree] - knots[i])
    const p0 = oldPoints[i - 1]
    const p1 = oldPoints[i]
    // c0 = z * w (complex multiply): c0_re = re*w_re - im*w_im, c0_im = re*w_im + im*w_re
    const c0_0_re = p0.re * p0.w_re - p0.im * p0.w_im
    const c0_0_im = p0.re * p0.w_im + p0.im * p0.w_re
    const c0_1_re = p1.re * p1.w_re - p1.im * p1.w_im
    const c0_1_im = p1.re * p1.w_im + p1.im * p1.w_re
    // Interpolate c0 and c1 = w
    const c0_re = (1 - alpha) * c0_0_re + alpha * c0_1_re
    const c0_im = (1 - alpha) * c0_0_im + alpha * c0_1_im
    const c1_re = (1 - alpha) * p0.w_re + alpha * p1.w_re
    const c1_im = (1 - alpha) * p0.w_im + alpha * p1.w_im
    // Back-project: z = c0 / c1
    const denom = c1_re * c1_re + c1_im * c1_im
    newPoints.push({
      re: (c0_re * c1_re + c0_im * c1_im) / denom,
      im: (c0_im * c1_re - c0_re * c1_im) / denom,
      w_re: c1_re,
      w_im: c1_im,
    })
  }

  for (let i = span; i < oldPoints.length; i++) {
    newPoints.push({ ...oldPoints[i] })
  }

  return { ...curve, knots: newKnots, controlPoints: newPoints }
}

// ============================================================================
// DEGREE ELEVATION
// ============================================================================

/**
 * Evaluate the blossom (polar form) of a B-spline at arbitrary arguments.
 */
function blossomEval(
  controlPoints: Point2D[],
  knots: number[],
  degree: number,
  args: number[]
): Point2D {
  if (args.length !== degree) {
    throw new Error(`blossomEval: expected ${degree} arguments, got ${args.length}`)
  }

  if (degree === 0) {
    return { ...controlPoints[0] }
  }

  const u1 = args[0]
  const k = findKnotSpan(degree, knots, u1)

  const d: Point2D[] = []
  for (let j = 0; j <= degree; j++) {
    const idx = k - degree + j
    if (idx >= 0 && idx < controlPoints.length) {
      d.push({ ...controlPoints[idx] })
    } else {
      d.push({ ...controlPoints[Math.max(0, Math.min(idx, controlPoints.length - 1))] })
    }
  }

  for (let r = 1; r <= degree; r++) {
    const u = args[r - 1]

    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const ti = knots[i]
      const ti_end = knots[k + 1 - r + j]
      const denom = ti_end - ti

      let alpha: number
      if (Math.abs(denom) < 1e-14) {
        alpha = 0.5
      } else {
        alpha = (u - ti) / denom
      }

      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
      }
    }
  }

  return d[degree]
}

export function groupKnotMultiplicities(knots: number[]): Array<[number, number]> {
  if (knots.length === 0) return []

  const groups: Array<[number, number]> = []
  let currentValue = knots[0]
  let count = 1

  for (let i = 1; i < knots.length; i++) {
    if (Math.abs(knots[i] - currentValue) < 1e-10) {
      count++
    } else {
      groups.push([currentValue, count])
      currentValue = knots[i]
      count = 1
    }
  }
  groups.push([currentValue, count])

  return groups
}

function elevateDegreeBy1BSpline(
  controlPoints: Point2D[],
  knots: number[],
  degree: number
): { controlPoints: Point2D[]; knots: number[] } {
  const p = degree

  const knotGroups = groupKnotMultiplicities(knots)

  const elevatedKnots: number[] = []
  for (const [value, mult] of knotGroups) {
    for (let i = 0; i < mult + 1; i++) {
      elevatedKnots.push(value)
    }
  }

  const newN = elevatedKnots.length - (p + 1) - 1
  const newCPs: Point2D[] = []

  for (let j = 0; j < newN; j++) {
    const args: number[] = []
    for (let i = 0; i <= p; i++) {
      args.push(elevatedKnots[j + 1 + i])
    }

    let sumX = 0
    let sumY = 0

    for (let k = 0; k <= p; k++) {
      const reducedArgs = [...args.slice(0, k), ...args.slice(k + 1)]
      const blossomVal = blossomEval(controlPoints, knots, p, reducedArgs)
      sumX += blossomVal.x
      sumY += blossomVal.y
    }

    newCPs.push({
      x: sumX / (p + 1),
      y: sumY / (p + 1),
    })
  }

  return { controlPoints: newCPs, knots: elevatedKnots }
}

/**
 * Elevate the degree of a B-spline curve by 1.
 */
export function elevateDegree(curve: Curve): Curve {
  const newDegree = curve.degree + 1

  if (curve.kind === 'bspline') {
    if (curve.closed && isPeriodicRepresentation(curve)) {
      return elevateDegreePeriodic(curve)
    }

    const result = elevateDegreeBy1BSpline(curve.controlPoints, curve.knots, curve.degree)

    return {
      ...curve,
      degree: newDegree,
      controlPoints: result.controlPoints,
      knots: result.knots,
    }
  }

  if (curve.kind === 'rational') {
    if (curve.closed && isPeriodicRepresentation(curve)) {
      return elevateDegreePeriodRational(curve)
    }
    return elevateDegreeRationalSimplified(curve)
  }

  if (curve.closed && isPeriodicRepresentation(curve)) {
    return elevateDegreePeriodComplexRational(curve)
  }
  return elevateDegreeComplexRationalSimplified(curve)
}

function elevateDegreePeriodic(curve: BSplineCurve): BSplineCurve {
  const { degree, knots, controlPoints } = curve
  const n = controlPoints.length
  const period = 1

  const numPeriods = requiredPeriods(degree, n)
  const { expandedKnots, expandedCPs } = expandToCovering(knots, controlPoints, degree, numPeriods, period)

  const elevated = elevateDegreeBy1BSpline(expandedCPs, expandedKnots, degree)
  const newDegree = degree + 1

  const { newKnots, startKnotIdx } = contractToPeriod(elevated.knots, period)

  const newCPs: Point2D[] = []
  for (let i = 0; i < newKnots.length; i++) {
    const cpIdx = startKnotIdx + i
    if (cpIdx >= 0 && cpIdx < elevated.controlPoints.length) {
      newCPs.push({ ...elevated.controlPoints[cpIdx] })
    }
  }

  return {
    ...curve,
    degree: newDegree,
    controlPoints: newCPs,
    knots: newKnots,
  }
}

function elevateDegreePeriodRational(curve: RationalBSplineCurve): RationalBSplineCurve {
  const { degree } = curve
  const newDegree = degree + 1
  const period = 1

  const pbs = toPeriodicRationalBSpline(curve)
  const n = rbsNumCPs(pbs)
  const numPeriods = requiredPeriods(degree, n)

  // Use spiral-aware expansion
  const expanded = expandRationalToCovering(pbs, numPeriods)

  const elevatedHomog = elevateDegreeBy1BSpline(expanded.homo, expanded.knots, degree)
  const elevatedWeights = elevateDegreeBy1BSpline(expanded.w, expanded.knots, degree)

  const { newKnots, startKnotIdx } = contractToPeriod(elevatedHomog.knots, period)

  const newCPs: WeightedPoint2D[] = []
  for (let i = 0; i < newKnots.length; i++) {
    const cpIdx = startKnotIdx + i
    const w = elevatedWeights.controlPoints[cpIdx].x
    const wx = elevatedHomog.controlPoints[cpIdx].x
    const wy = elevatedHomog.controlPoints[cpIdx].y
    newCPs.push({
      x: w !== 0 ? wx / w : wx,
      y: w !== 0 ? wy / w : wy,
      w: w,
    })
  }

  // Compute wrapWeight from the covering space (one period ahead)
  let newWrapWeight: number | undefined = undefined
  const w0 = newCPs[0].w
  if (Math.abs(w0) > 1e-14) {
    const nextPeriodIdx = startKnotIdx + newKnots.length
    if (nextPeriodIdx < elevatedWeights.controlPoints.length) {
      const wNext = elevatedWeights.controlPoints[nextPeriodIdx].x
      newWrapWeight = wNext
    }
  }

  // Compute farinTValues using wrapWeight for the wrap-around edge
  const newN = newCPs.length
  const newFarinTValues: number[] = []
  for (let i = 0; i < newN; i++) {
    const wi = newCPs[i].w
    const isWrapEdge = (i === newN - 1)
    const wNext = isWrapEdge ? (newWrapWeight ?? newCPs[0].w) : newCPs[(i + 1) % newN].w
    const totalWeight = wi + wNext
    const tValue = totalWeight > 0 ? wNext / totalWeight : 0.5
    newFarinTValues.push(tValue)
  }

  return {
    ...curve,
    degree: newDegree,
    controlPoints: newCPs,
    knots: newKnots,
    farinTValues: newFarinTValues,
    wrapWeight: newWrapWeight,
  }
}

function elevateDegreePeriodComplexRational(curve: ComplexRationalBSplineCurve): ComplexRationalBSplineCurve {
  const { degree } = curve
  const newDegree = degree + 1
  const period = 1

  const pbs = toPeriodicComplexBSpline(curve)
  const n = bsNumCPs(pbs)
  const numPeriods = requiredPeriods(degree, n)

  // Use spiral-aware expansion
  const expanded = expandComplexToCovering(pbs, numPeriods)

  const elevatedHomog = elevateDegreeBy1BSpline(expanded.c0, expanded.knots, degree)
  const elevatedWeights = elevateDegreeBy1BSpline(expanded.c1, expanded.knots, degree)

  const { newKnots, startKnotIdx } = contractToPeriod(elevatedHomog.knots, period)

  const newCPs: ComplexPoint[] = []
  for (let i = 0; i < newKnots.length; i++) {
    const cpIdx = startKnotIdx + i
    const c0: Complex = { re: elevatedHomog.controlPoints[cpIdx].x, im: elevatedHomog.controlPoints[cpIdx].y }
    const w: Complex = { re: elevatedWeights.controlPoints[cpIdx].x, im: elevatedWeights.controlPoints[cpIdx].y }
    const z = cdiv(c0, w)
    newCPs.push({
      re: z.re,
      im: z.im,
      w_re: w.re,
      w_im: w.im,
    })
  }

  // Compute wrapWeight from the covering space (one period ahead)
  let newWrapWeight: { re: number; im: number } | undefined = undefined
  const w0: Complex = { re: newCPs[0].w_re, im: newCPs[0].w_im }
  const w0NormSq = w0.re * w0.re + w0.im * w0.im
  if (w0NormSq > 1e-20) {
    const nextPeriodIdx = startKnotIdx + newKnots.length
    if (nextPeriodIdx < elevatedWeights.controlPoints.length) {
      const wNext: Complex = {
        re: elevatedWeights.controlPoints[nextPeriodIdx].x,
        im: elevatedWeights.controlPoints[nextPeriodIdx].y,
      }
      newWrapWeight = { re: wNext.re, im: wNext.im }
    }
  }

  // Compute farinPositions using wrapWeight for the wrap-around edge
  const newN = newCPs.length
  const newFarinPositions: Point2D[] = []
  for (let i = 0; i < newN; i++) {
    const cp0 = newCPs[i]
    const cp1 = newCPs[(i + 1) % newN]
    const z0: Complex = { re: cp0.re, im: cp0.im }
    const z1: Complex = { re: cp1.re, im: cp1.im }
    const wi: Complex = { re: cp0.w_re, im: cp0.w_im }

    const isWrapEdge = (i === newN - 1)
    const wNext: Complex = isWrapEdge
      ? (newWrapWeight ?? { re: cp1.w_re, im: cp1.w_im })
      : { re: cp1.w_re, im: cp1.w_im }

    const c0 = cmult(wi, z0)
    const c1 = cmult(wNext, z1)
    const num: Complex = { re: c0.re + c1.re, im: c0.im + c1.im }
    const denom: Complex = { re: wi.re + wNext.re, im: wi.im + wNext.im }
    const q = cdiv(num, denom)

    newFarinPositions.push({ x: q.re, y: q.im })
  }

  return {
    ...curve,
    degree: newDegree,
    controlPoints: newCPs,
    knots: newKnots,
    farinPositions: newFarinPositions,
    wrapWeight: newWrapWeight,
  }
}

function elevateDegreeRationalSimplified(curve: RationalBSplineCurve): RationalBSplineCurve {
  const newDegree = curve.degree + 1

  const homogeneousCPs: Point2D[] = curve.controlPoints.map(p => ({
    x: p.x * p.w,
    y: p.y * p.w,
  }))
  const weights = curve.controlPoints.map(p => p.w)

  const elevatedHomog = elevateDegreeBy1BSpline(homogeneousCPs, curve.knots, curve.degree)

  const weightCPs: Point2D[] = weights.map(w => ({ x: w, y: 0 }))
  const elevatedWeights = elevateDegreeBy1BSpline(weightCPs, curve.knots, curve.degree)

  const newCPs: WeightedPoint2D[] = elevatedHomog.controlPoints.map((p, i) => {
    const w = elevatedWeights.controlPoints[i].x
    return {
      x: w !== 0 ? p.x / w : p.x,
      y: w !== 0 ? p.y / w : p.y,
      w: w,
    }
  })

  return {
    ...curve,
    degree: newDegree,
    controlPoints: newCPs,
    knots: elevatedHomog.knots,
  }
}

function elevateDegreeComplexRationalSimplified(curve: ComplexRationalBSplineCurve): ComplexRationalBSplineCurve {
  const newDegree = curve.degree + 1

  const homogeneousCPs: Point2D[] = curve.controlPoints.map(p => {
    const c0 = cmult({ re: p.w_re, im: p.w_im }, { re: p.re, im: p.im })
    return { x: c0.re, y: c0.im }
  })

  const elevatedHomog = elevateDegreeBy1BSpline(homogeneousCPs, curve.knots, curve.degree)

  const weightCPs: Point2D[] = curve.controlPoints.map(p => ({ x: p.w_re, y: p.w_im }))
  const elevatedWeights = elevateDegreeBy1BSpline(weightCPs, curve.knots, curve.degree)

  const newCPs: ComplexPoint[] = elevatedHomog.controlPoints.map((p, i) => {
    const c0: Complex = { re: p.x, im: p.y }
    const w: Complex = { re: elevatedWeights.controlPoints[i].x, im: elevatedWeights.controlPoints[i].y }
    const z = cdiv(c0, w)
    return {
      re: z.re,
      im: z.im,
      w_re: w.re,
      w_im: w.im,
    }
  })

  return {
    ...curve,
    degree: newDegree,
    controlPoints: newCPs,
    knots: elevatedHomog.knots,
    farinPositions: undefined,
    wrapWeight: undefined,
  }
}

// ============================================================================
// KNOT OPERATIONS
// ============================================================================

export function isFixedPeriodicKnot(knots: number[], knotIndex: number): boolean {
  if (Math.abs(knots[knotIndex]) > 1e-10) return false

  let lastZeroIndex = knotIndex
  while (lastZeroIndex < knots.length - 1 && Math.abs(knots[lastZeroIndex + 1]) < 1e-10) {
    lastZeroIndex++
  }

  return knotIndex === lastZeroIndex
}

export function isClampedEndKnot(degree: number, knots: number[], knotIndex: number, closed: boolean = false): boolean {
  if (closed) {
    return false
  }
  return knotIndex <= degree || knotIndex >= knots.length - degree - 1
}

export function getKnotMultiplicity(knots: number[], knotIndex: number): number {
  const value = knots[knotIndex]
  let count = 0
  for (const k of knots) {
    if (Math.abs(k - value) < 1e-10) count++
  }
  return count
}

export function moveKnot(curve: Curve, knotIndex: number, newValue: number): Curve | null {
  const { degree, knots } = curve

  // Handle periodic curves
  if (curve.closed && isPeriodicRepresentation(curve)) {
    return movePeriodicKnot(curve, knotIndex, newValue)
  }

  // Cannot move clamped end knots for open curves
  if (isClampedEndKnot(degree, knots, knotIndex)) {
    return null
  }

  // Valid parameter range is defined by the clamped end knot values
  // For standard clamped B-splines, this is [0, 1]
  const tMin = knots[0]  // First knot value (start of parameter domain)
  const tMax = knots[knots.length - 1]  // Last knot value (end of parameter domain)

  // Clamp to valid parameter range [tMin, tMax]
  const clampedValue = Math.max(tMin, Math.min(tMax, newValue))

  // Create new knot vector
  const newKnots = [...knots]
  newKnots[knotIndex] = clampedValue

  // Push knots to the left if needed (when moving left)
  // Stop at the clamped end knots (index > degree)
  for (let i = knotIndex - 1; i > degree; i--) {
    if (newKnots[i] > newKnots[i + 1]) {
      newKnots[i] = newKnots[i + 1]
    } else {
      break
    }
  }

  // Push knots to the right if needed (when moving right)
  // Stop at the clamped end knots (index < knots.length - degree - 1)
  for (let i = knotIndex + 1; i < knots.length - degree - 1; i++) {
    if (newKnots[i] < newKnots[i - 1]) {
      newKnots[i] = newKnots[i - 1]
    } else {
      break
    }
  }

  return {
    ...curve,
    knots: newKnots,
  }
}

const KNOT_MIN = 0.0001
const KNOT_MAX = 0.9999
const SNAP_TO_ZERO_THRESHOLD = 0.001

export function movePeriodicKnot(curve: Curve, knotIndex: number, newValue: number): Curve | null {
  const knots = [...curve.knots]

  if (isFixedPeriodicKnot(curve.knots, knotIndex)) {
    return null
  }

  let clampedValue = newValue

  // When moving a knot at 0, allow it (reducing multiplicity at junction)
  // but clamp to KNOT_MIN so it doesn't stay at exactly 0
  const isMovingFromZero = Math.abs(knots[knotIndex]) < 1e-10

  if (clampedValue < 0) {
    clampedValue = KNOT_MIN
  } else {
    clampedValue = Math.min(KNOT_MAX, newValue)
  }

  // If moving from zero, ensure we actually move away
  if (isMovingFromZero && clampedValue < KNOT_MIN) {
    clampedValue = KNOT_MIN
  }

  knots[knotIndex] = clampedValue

  let leftBoundary = 0
  while (leftBoundary < knots.length && knots[leftBoundary] === 0) {
    leftBoundary++
  }

  for (let i = knotIndex - 1; i >= 0; i--) {
    if (knots[i] > knots[i + 1]) {
      const pushedValue = knots[i + 1]
      knots[i] = pushedValue < SNAP_TO_ZERO_THRESHOLD ? 0 : pushedValue
    } else {
      break
    }
  }

  for (let i = knotIndex + 1; i < knots.length; i++) {
    // Don't push knots that are fixed at 0 (preserve the junction)
    if (isFixedPeriodicKnot(curve.knots, i)) {
      break
    }
    if (knots[i] < knots[i - 1]) {
      knots[i] = Math.min(KNOT_MAX, knots[i - 1])
    } else {
      break
    }
  }

  knots.sort((a, b) => a - b)

  return {
    ...curve,
    knots,
  }
}

/**
 * Remove a knot from a periodic non-rational B-spline using covering space approach.
 */
function removePeriodicKnot(curve: BSplineCurve, knotIndex: number, tolerance: number): BSplineCurve | null {
  const { degree, knots, controlPoints } = curve
  const n = controlPoints.length
  const period = 1

  if (isFixedPeriodicKnot(knots, knotIndex)) {
    return null
  }

  // Periodic curves need at least 2 CPs (a single CP is a point, not a curve)
  if (n <= 2) {
    return null
  }

  const u = knots[knotIndex]
  const uNorm = ((u % period) + period) % period
  const numPeriods = requiredPeriods(degree, n)

  let { expandedKnots, expandedCPs } = expandToCovering(knots, controlPoints, degree, numPeriods, period)

  const removalIndices = computePeriodicRemovalPoints(uNorm, expandedKnots, numPeriods, period)

  if (removalIndices.length === 0) return null

  // Remove at each periodic copy (right-to-left so indices stay valid).
  // Copies near the boundary of the expanded space may fail — skip them,
  // as they don't affect the central period extracted by contractToPeriod.
  let anyRemoved = false
  for (const idx of removalIndices) {
    const result = removeKnotOpen(expandedKnots, expandedCPs, degree, idx, tolerance)
    if (!result) continue
    anyRemoved = true
    expandedKnots = result.newKnots
    expandedCPs = result.newCPs
  }

  if (!anyRemoved) return null

  const { newKnots, startKnotIdx } = contractToPeriod(expandedKnots, period)

  const newCPs: Point2D[] = []
  for (let i = 0; i < newKnots.length; i++) {
    const cpIdx = startKnotIdx + i
    if (cpIdx >= 0 && cpIdx < expandedCPs.length) {
      newCPs.push({ ...expandedCPs[cpIdx] })
    }
  }

  return {
    ...curve,
    knots: newKnots,
    controlPoints: newCPs,
  }
}

/**
 * Remove a knot from a periodic rational B-spline using covering space approach.
 */
function removeKnotPeriodicRational(
  pbs: PeriodicRationalBSpline,
  knotIndex: number,
  tolerance: number
): PeriodicRationalBSpline | null {
  const p = pbs.degree
  const n = rbsNumCPs(pbs)
  const period = 1

  const u = pbs.knots[knotIndex]
  const uNorm = ((u % period) + period) % period
  const numPeriods = requiredPeriods(p, n)

  const expanded = expandRationalToCovering(pbs, numPeriods)

  const removalIndices = computePeriodicRemovalPoints(uNorm, expanded.knots, numPeriods, period)

  if (removalIndices.length === 0) return null

  let curKnots = expanded.knots
  let curHomo = expanded.homo
  let curW = expanded.w

  let anyRemoved = false
  for (const idx of removalIndices) {
    const resHomo = removeKnotOpen(curKnots, curHomo, p, idx, tolerance)
    const resW = removeKnotOpen(curKnots, curW, p, idx, tolerance)
    if (!resHomo || !resW) continue
    anyRemoved = true
    curKnots = resHomo.newKnots
    curHomo = resHomo.newCPs
    curW = resW.newCPs
  }

  if (!anyRemoved) return null

  const { newKnots, startKnotIdx } = contractToPeriod(curKnots, period)

  const newN = newKnots.length
  const newPositions: Point2D[] = []
  const newWeights: number[] = []
  for (let i = 0; i < newN; i++) {
    const cpIdx = startKnotIdx + i
    const wx = curHomo[cpIdx].x
    const wy = curHomo[cpIdx].y
    const w = curW[cpIdx].x
    if (Math.abs(w) > 1e-14) {
      newPositions.push({ x: wx / w, y: wy / w })
    } else {
      newPositions.push({ x: 0, y: 0 })
    }
    newWeights.push(w)
  }

  let newRatio = pbs.weightRatio
  if (Math.abs(newWeights[0]) > 1e-14) {
    const nextPeriodIdx = startKnotIdx + newN
    if (nextPeriodIdx < curW.length) {
      newRatio = curW[nextPeriodIdx].x / newWeights[0]
    }
  }

  return {
    knots: newKnots,
    positions: newPositions,
    weights: newWeights,
    degree: p,
    weightRatio: newRatio,
  }
}

/**
 * Remove a knot from a periodic complex-rational B-spline using covering space approach.
 */
function removeKnotPeriodicComplex(
  pbs: PeriodicComplexBSpline,
  knotIndex: number,
  tolerance: number
): PeriodicComplexBSpline | null {
  const p = pbs.degree
  const n = bsNumCPs(pbs)
  const period = 1

  const u = pbs.knots[knotIndex]
  const uNorm = ((u % period) + period) % period
  const numPeriods = requiredPeriods(p, n)

  const expanded = expandComplexToCovering(pbs, numPeriods)

  const removalIndices = computePeriodicRemovalPoints(uNorm, expanded.knots, numPeriods, period)

  if (removalIndices.length === 0) return null

  let curKnots = expanded.knots
  let curC0 = expanded.c0
  let curC1 = expanded.c1

  let anyRemoved = false
  for (const idx of removalIndices) {
    const resC0 = removeKnotOpen(curKnots, curC0, p, idx, tolerance)
    const resC1 = removeKnotOpen(curKnots, curC1, p, idx, tolerance)
    if (!resC0 || !resC1) continue
    anyRemoved = true
    curKnots = resC0.newKnots
    curC0 = resC0.newCPs
    curC1 = resC1.newCPs
  }

  if (!anyRemoved) return null

  const { newKnots, startKnotIdx } = contractToPeriod(curKnots, period)

  const newN = newKnots.length
  const newPositions: Complex[] = []
  const newWeights: Complex[] = []
  for (let i = 0; i < newN; i++) {
    const cpIdx = startKnotIdx + i
    const c0: Complex = { re: curC0[cpIdx].x, im: curC0[cpIdx].y }
    const c1: Complex = { re: curC1[cpIdx].x, im: curC1[cpIdx].y }
    newPositions.push(cdiv(c0, c1))
    newWeights.push(c1)
  }

  let newRatio = pbs.weightRatio
  const w0 = newWeights[0]
  const w0NormSq = w0.re * w0.re + w0.im * w0.im
  if (w0NormSq > 1e-20) {
    const nextPeriodIdx = startKnotIdx + newN
    if (nextPeriodIdx < curC1.length) {
      const wNext: Complex = { re: curC1[nextPeriodIdx].x, im: curC1[nextPeriodIdx].y }
      newRatio = cdiv(wNext, w0)
    }
  }

  return {
    knots: newKnots,
    positions: newPositions,
    weights: newWeights,
    degree: p,
    weightRatio: newRatio,
  }
}

export function removeKnot(curve: Curve, knotIndex: number, tolerance: number = Infinity): Curve | null {
  const { degree, knots } = curve

  // Handle periodic (closed) curves
  if (curve.closed && isPeriodicRepresentation(curve)) {
    if (isFixedPeriodicKnot(knots, knotIndex)) {
      return null
    }

    // Periodic curves need at least 2 CPs (a single CP is a point, not a curve)
    if (curve.controlPoints.length <= 2) {
      return null
    }

    if (curve.kind === 'bspline') {
      return removePeriodicKnot(curve, knotIndex, tolerance)
    } else if (curve.kind === 'rational') {
      const pbs = toPeriodicRationalBSpline(curve)
      const newPbs = removeKnotPeriodicRational(pbs, knotIndex, tolerance)
      if (!newPbs) return null

      const newN = newPbs.positions.length
      const newControlPoints: WeightedPoint2D[] = newPbs.positions.map((p, i) => ({
        x: p.x,
        y: p.y,
        w: newPbs.weights[i],
      }))

      const newWrapWeight = newPbs.weights[0] * newPbs.weightRatio

      const newFarinTValues: number[] = []
      for (let i = 0; i < newN; i++) {
        const w0 = newPbs.weights[i]
        const isWrapEdge = (i === newN - 1)
        const w1 = isWrapEdge ? newWrapWeight : newPbs.weights[(i + 1) % newN]
        const totalWeight = w0 + w1
        const tValue = totalWeight > 0 ? w1 / totalWeight : 0.5
        newFarinTValues.push(tValue)
      }

      return {
        ...curve,
        knots: [...newPbs.knots],
        controlPoints: newControlPoints,
        farinTValues: newFarinTValues,
        wrapWeight: newWrapWeight,
      }
    } else if (curve.kind === 'complex-rational') {
      const pbs = toPeriodicComplexBSpline(curve)
      const newPbs = removeKnotPeriodicComplex(pbs, knotIndex, tolerance)
      if (!newPbs) return null

      const newN = newPbs.positions.length
      const newControlPoints: ComplexPoint[] = newPbs.positions.map((z, i) => ({
        re: z.re,
        im: z.im,
        w_re: newPbs.weights[i].re,
        w_im: newPbs.weights[i].im,
      }))

      const w0_base = newPbs.weights[0]
      const newWrapWeight = cmult(w0_base, newPbs.weightRatio)

      const newFarinPositions: Point2D[] = []
      for (let i = 0; i < newN; i++) {
        const z0 = newPbs.positions[i]
        const z1 = newPbs.positions[(i + 1) % newN]
        const w0 = newPbs.weights[i]

        const isWrapEdge = (i === newN - 1)
        const w1 = isWrapEdge ? newWrapWeight : newPbs.weights[(i + 1) % newN]

        const c0 = cmult(w0, z0)
        const c1 = cmult(w1, z1)
        const num: Complex = { re: c0.re + c1.re, im: c0.im + c1.im }
        const denom: Complex = { re: w0.re + w1.re, im: w0.im + w1.im }
        const q = cdiv(num, denom)

        newFarinPositions.push({ x: q.re, y: q.im })
      }

      return {
        ...curve,
        knots: [...newPbs.knots],
        controlPoints: newControlPoints,
        farinPositions: newFarinPositions,
        wrapWeight: { re: newWrapWeight.re, im: newWrapWeight.im },
      }
    }
  }

  if (isClampedEndKnot(degree, knots, knotIndex)) {
    return null
  }

  if (curve.controlPoints.length <= degree + 1) {
    return null
  }

  const n = curve.controlPoints.length
  const m = knots.length - 1
  const u = knots[knotIndex]

  let r = knotIndex
  while (r < m && Math.abs(knots[r + 1] - u) < 1e-10) {
    r++
  }

  let s = 0
  for (let i = 0; i <= m; i++) {
    if (Math.abs(knots[i] - u) < 1e-10) {
      s++
    }
  }

  if (s > degree) {
    return null
  }

  const ord = degree + 1
  const first = r - degree
  const last = r - s

  if (first < 0 || last >= n - 1) {
    return null
  }

  const addP2D = (a: Point2D, b: Point2D): Point2D => ({ x: a.x + b.x, y: a.y + b.y })
  const subP2D = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y })
  const scaleP2D = (sc: number, p: Point2D): Point2D => ({ x: sc * p.x, y: sc * p.y })
  const normP2D = (p: Point2D): number => Math.sqrt(p.x * p.x + p.y * p.y)

  const addW2D = (a: WeightedPoint2D, b: WeightedPoint2D): WeightedPoint2D => ({ x: a.x + b.x, y: a.y + b.y, w: a.w + b.w })
  const subW2D = (a: WeightedPoint2D, b: WeightedPoint2D): WeightedPoint2D => ({ x: a.x - b.x, y: a.y - b.y, w: a.w - b.w })
  const scaleW2D = (sc: number, p: WeightedPoint2D): WeightedPoint2D => ({ x: sc * p.x, y: sc * p.y, w: sc * p.w })
  const normW2D = (p: WeightedPoint2D): number => Math.sqrt(p.x * p.x + p.y * p.y)

  const addCP = (a: ComplexPoint, b: ComplexPoint): ComplexPoint => ({ re: a.re + b.re, im: a.im + b.im, w_re: a.w_re + b.w_re, w_im: a.w_im + b.w_im })
  const subCP = (a: ComplexPoint, b: ComplexPoint): ComplexPoint => ({ re: a.re - b.re, im: a.im - b.im, w_re: a.w_re - b.w_re, w_im: a.w_im - b.w_im })
  const scaleCP = (sc: number, p: ComplexPoint): ComplexPoint => ({ re: sc * p.re, im: sc * p.im, w_re: sc * p.w_re, w_im: sc * p.w_im })
  const normCP = (p: ComplexPoint): number => Math.sqrt(p.re * p.re + p.im * p.im)

  function removeKnotGeneric<T>(
    P: T[],
    add: (a: T, b: T) => T,
    sub: (a: T, b: T) => T,
    scale: (sc: number, p: T) => T,
    norm: (p: T) => number
  ): { newP: T[]; removed: boolean } {
    const temp: T[] = new Array(last - first + 3)

    temp[0] = P[first - 1 >= 0 ? first - 1 : 0]
    temp[last - first + 2] = P[last + 1 < n ? last + 1 : n - 1]

    let i = first
    let j = last
    let ii = 1
    let jj = last - first + 1

    while (j - i > 0) {
      const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
      if (Math.abs(alphaI) < 1e-14) {
        temp[ii] = P[i]
      } else if (Math.abs(alphaI - 1) < 1e-14) {
        temp[ii] = temp[ii - 1]
      } else {
        const scaled = scale(1 - alphaI, temp[ii - 1])
        const diff = sub(P[i], scaled)
        temp[ii] = scale(1 / alphaI, diff)
      }

      const alphaJ = (u - knots[j]) / (knots[j + ord] - knots[j])
      if (Math.abs(1 - alphaJ) < 1e-14) {
        temp[jj] = P[j]
      } else if (Math.abs(alphaJ) < 1e-14) {
        temp[jj] = temp[jj + 1]
      } else {
        const scaled = scale(alphaJ, temp[jj + 1])
        const diff = sub(P[j], scaled)
        temp[jj] = scale(1 / (1 - alphaJ), diff)
      }

      i++
      ii++
      j--
      jj--
    }

    let removable = false
    if (j - i < 0) {
      const diff = sub(temp[ii - 1], temp[jj + 1])
      const removalError = norm(diff)
      if (removalError <= tolerance) {
        removable = true
      }
    } else {
      const alphaI = (u - knots[i]) / (knots[i + ord] - knots[i])
      const interpPt = add(scale(1 - alphaI, temp[ii - 1]), scale(alphaI, temp[jj + 1]))
      const diff = sub(P[i], interpPt)
      const removalError = norm(diff)
      if (removalError <= tolerance) {
        removable = true
        temp[ii] = interpPt
      }
    }

    if (!removable) {
      return { newP: [], removed: false }
    }

    const newP: T[] = []
    const tempEnd = last - first + 2

    for (let idx = 0; idx < first; idx++) {
      newP.push(P[idx])
    }

    for (let tempIdx = 1; tempIdx < ii; tempIdx++) {
      newP.push(temp[tempIdx])
    }

    const rightStart = (j === i) ? jj + 1 : jj + 2
    for (let tempIdx = rightStart; tempIdx < tempEnd; tempIdx++) {
      newP.push(temp[tempIdx])
    }

    for (let idx = last + 1; idx < n; idx++) {
      newP.push(P[idx])
    }

    return { newP, removed: true }
  }

  const newKnots = [...knots.slice(0, knotIndex), ...knots.slice(knotIndex + 1)]

  if (curve.kind === 'bspline') {
    const result = removeKnotGeneric(curve.controlPoints, addP2D, subP2D, scaleP2D, normP2D)
    if (!result.removed) return null
    return { ...curve, knots: newKnots, controlPoints: result.newP }
  }

  if (curve.kind === 'rational') {
    const result = removeKnotGeneric(curve.controlPoints, addW2D, subW2D, scaleW2D, normW2D)
    if (!result.removed) return null
    return { ...curve, knots: newKnots, controlPoints: result.newP }
  }

  const result = removeKnotGeneric(curve.controlPoints, addCP, subCP, scaleCP, normCP)
  if (!result.removed) return null
  return { ...curve, knots: newKnots, controlPoints: result.newP }
}
