import { describe, it, expect } from 'vitest'
import {
  curvatureExtremaNumeratorComplexPeriodic,
  closedComplexCurvatureExtremaParameters,
  closedCurvatureExtremaParameters,
  initializeFarinPositionsFromComplexWeights,
  updateWeightsFromComplexFarin,
  computeComplexFarinPoints,
  computeMobiusTransform,
  applyMobiusToComplexRational,
  slideComplexRational,
  type ComplexPoint,
  type ComplexRationalCurve,
} from '../index'

// Degree-4, 6-CP closed teardrop (the slide's curve), all unit weights.
const DEGREE = 4
const NUM = 6
const KNOTS = Array.from({ length: NUM }, (_, i) => i / NUM)
const REAL: [number, number][] = [
  [-100, 28],
  [-185, 0],
  [-100, -28],
  [70, -20],
  [190, 0],
  [70, 20],
]
const CPS: ComplexPoint[] = REAL.map(([x, y]) => ({ re: x, im: y, w_re: 1, w_im: 0 }))
const xs = REAL.map((p) => p[0])
const ys = REAL.map((p) => p[1])
const ones = REAL.map(() => 1)
const zeros = REAL.map(() => 0)

describe('complex-rational: unit weights reduce to the plain B-spline', () => {
  it('complex curvature-extrema parameters match the planar ones', () => {
    const complex = closedComplexCurvatureExtremaParameters(xs, ys, ones, zeros, KNOTS, DEGREE)
    const planar = closedCurvatureExtremaParameters(xs, ys, KNOTS, DEGREE)
    expect(complex.length).toBe(planar.length)
    // Same zeros (both bound the curvature extrema); match within sampling tol.
    const sorted = (a: number[]) => [...a].sort((p, q) => p - q)
    const c = sorted(complex)
    const p = sorted(planar)
    for (let i = 0; i < c.length; i++) expect(Math.abs(c[i] - p[i])).toBeLessThan(1e-3)
  })

  it('the teardrop has 4 smooth curvature extrema', () => {
    const ts = closedComplexCurvatureExtremaParameters(xs, ys, ones, zeros, KNOTS, DEGREE)
    expect(ts.length).toBe(4)
  })
})

describe('complex-rational: Farin ⇄ weight round-trip', () => {
  it('recovers the weights from the Farin positions', () => {
    // Perturb to non-unit weights via a Farin move, then re-derive.
    const curve: ComplexRationalCurve = {
      degree: DEGREE,
      knots: KNOTS,
      controlPoints: CPS,
      closed: true,
    }
    const farins0 = initializeFarinPositionsFromComplexWeights(CPS, true)
    // Move Farin 0 off the edge midpoint, then read the Farin points back.
    const moved = updateWeightsFromComplexFarin(curve, 0, {
      x: farins0[0].x + 15,
      y: farins0[0].y + 10,
    })
    const curve2: ComplexRationalCurve = {
      degree: DEGREE,
      knots: KNOTS,
      controlPoints: moved.newPoints,
      closed: true,
      farinPositions: moved.newFarinPositions,
      wrapWeight: moved.newWrapWeight,
    }
    const farins = computeComplexFarinPoints(curve2)
    // The moved Farin point sits where we asked.
    expect(Math.abs(farins[0].position.x - (farins0[0].x + 15))).toBeLessThan(1e-6)
    expect(Math.abs(farins[0].position.y - (farins0[0].y + 10))).toBeLessThan(1e-6)
  })
})

describe('complex-rational: Möbius', () => {
  it('identity-mapping transform leaves the curve unchanged', () => {
    const z: { re: number; im: number }[] = [
      { re: 1, im: 0 },
      { re: 0, im: 1 },
      { re: -1, im: 0 },
    ]
    const m = computeMobiusTransform(z, z)
    expect(m).not.toBeNull()
    const out = applyMobiusToComplexRational(m!, CPS)
    for (let i = 0; i < CPS.length; i++) {
      expect(Math.abs(out[i].re - CPS[i].re)).toBeLessThan(1e-6)
      expect(Math.abs(out[i].im - CPS[i].im)).toBeLessThan(1e-6)
    }
  })

  it('a Möbius transform preserves the curvature-extrema count', () => {
    const z = [
      { re: 1, im: 0 },
      { re: 0, im: 1 },
      { re: -1, im: 0 },
    ]
    // A small rotation+inversion.
    const w = [
      { re: 0.98, im: 0.2 },
      { re: -0.1, im: 0.99 },
      { re: -0.98, im: -0.18 },
    ]
    const m = computeMobiusTransform(z, w)!
    const out = applyMobiusToComplexRational(m, CPS)
    const before = closedComplexCurvatureExtremaParameters(xs, ys, ones, zeros, KNOTS, DEGREE).length
    const after = closedComplexCurvatureExtremaParameters(
      out.map((p) => p.re),
      out.map((p) => p.im),
      out.map((p) => p.w_re),
      out.map((p) => p.w_im),
      KNOTS,
      DEGREE,
    ).length
    expect(after).toBe(before)
  })
})

describe('complex-rational: slide preserves the curvature-extrema bound', () => {
  const sc = (cps: ComplexPoint[]) =>
    curvatureExtremaNumeratorComplexPeriodic(
      cps.map((p) => p.re),
      cps.map((p) => p.im),
      cps.map((p) => p.w_re),
      cps.map((p) => p.w_im),
      KNOTS,
      DEGREE,
    ).signChanges()

  it('S⁻(g) is non-increasing after a drag', () => {
    const before = sc(CPS)
    const { points } = slideComplexRational(CPS, KNOTS, DEGREE, 1, CPS[1].re - 40, CPS[1].im + 30, {
      maxIterations: 40,
      dragWeight: 20,
    })
    expect(sc(points)).toBeLessThanOrEqual(before)
  })

  it('follows the drag', () => {
    const tx = CPS[1].re - 40
    const ty = CPS[1].im + 30
    const { points } = slideComplexRational(CPS, KNOTS, DEGREE, 1, tx, ty, {
      maxIterations: 40,
      dragWeight: 20,
    })
    const dBefore = Math.hypot(CPS[1].re - tx, CPS[1].im - ty)
    const dAfter = Math.hypot(points[1].re - tx, points[1].im - ty)
    expect(dAfter).toBeLessThan(dBefore)
  })
})
