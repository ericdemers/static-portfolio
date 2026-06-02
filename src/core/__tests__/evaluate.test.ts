import { describe, it, expect } from 'vitest'
import type { Point2D, WeightedPoint2D, ComplexPoint } from '../types'
import { type Complex, cadd, cmul, cscale, cdiv, cpow } from '../complex'
import {
  openBasis,
  periodicBasis,
  findOpenSpan,
  findPeriodicSpan,
  wrap01,
} from '../basis'
import {
  evaluate,
  plainCoeffs,
  rationalCoeffs,
  complexCoeffs,
  realSpiralRatio,
  complexSpiralRatio,
} from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOL = 1e-9
const near = (a: number, b: number, tol = TOL) => expect(Math.abs(a - b)).toBeLessThan(tol)
function expectPointClose(a: Point2D, b: Point2D, tol = TOL) {
  expect(Math.abs(a.x - b.x)).toBeLessThan(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThan(tol)
}
const samples = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n)

// Independent oracle: de Casteljau for a single Bézier segment.
function bezier(points: Point2D[], t: number): Point2D {
  let pts = points.map((p) => ({ ...p }))
  while (pts.length > 1) {
    const next: Point2D[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      next.push({
        x: pts[i].x * (1 - t) + pts[i + 1].x * t,
        y: pts[i].y * (1 - t) + pts[i + 1].y * t,
      })
    }
    pts = next
  }
  return pts[0]
}

function binom(n: number, k: number): number {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}
const bernstein = (d: number, i: number, t: number) =>
  binom(d, i) * t ** i * (1 - t) ** (d - i)

// Independent oracle: weighted-Bernstein rational Bézier.
function rationalBezier(cps: WeightedPoint2D[], t: number): Point2D {
  const d = cps.length - 1
  let sx = 0,
    sy = 0,
    sw = 0
  for (let i = 0; i <= d; i++) {
    const b = bernstein(d, i, t) * cps[i].w
    sx += b * cps[i].x
    sy += b * cps[i].y
    sw += b
  }
  return { x: sx / sw, y: sy / sw }
}

// Independent oracle: complex-weighted Bernstein Bézier.
function complexBezier(cps: ComplexPoint[], t: number): Point2D {
  const d = cps.length - 1
  let c0: Complex = { re: 0, im: 0 }
  let c1: Complex = { re: 0, im: 0 }
  for (let i = 0; i <= d; i++) {
    const b = bernstein(d, i, t)
    const w: Complex = { re: cps[i].w_re, im: cps[i].w_im }
    c0 = cadd(c0, cscale(cmul(w, { re: cps[i].re, im: cps[i].im }), b))
    c1 = cadd(c1, cscale(w, b))
  }
  const z = cdiv(c0, c1)
  return { x: z.re, y: z.im }
}

// Reference ports of the legacy ../sketcher periodic spiral evaluators — used
// ONLY here, to pin the new coeffs-based spiral to the original inline math.
function refPeriodicRational(
  cps: WeightedPoint2D[],
  degree: number,
  knots: number[],
  t: number,
  wrapWeight?: number,
): Point2D {
  const tt = wrap01(t)
  const span = findPeriodicSpan(knots, tt)
  const N = periodicBasis(span, tt, degree, knots)
  const n = cps.length
  let x = 0,
    y = 0,
    w = 0
  for (let i = 0; i <= degree; i++) {
    const rawIdx = span - degree + i
    const idx = ((rawIdx % n) + n) % n
    const cp = cps[idx]
    let cpW = cp.w
    if (wrapWeight !== undefined) {
      const periods = Math.floor(rawIdx / n)
      if (periods !== 0) cpW = cp.w * Math.pow(wrapWeight / cps[0].w, periods)
    }
    const nw = N[i] * cpW
    x += nw * cp.x
    y += nw * cp.y
    w += nw
  }
  return { x: x / w, y: y / w }
}

function refPeriodicComplex(
  cps: ComplexPoint[],
  degree: number,
  knots: number[],
  t: number,
  wrapWeight?: Complex,
): Point2D {
  const tt = wrap01(t)
  const span = findPeriodicSpan(knots, tt)
  const basis = periodicBasis(span, tt, degree, knots)
  const n = cps.length
  let c0re = 0,
    c0im = 0,
    c1re = 0,
    c1im = 0
  for (let i = 0; i <= degree; i++) {
    const rawIdx = span - degree + i
    const idx = ((rawIdx % n) + n) % n
    const cp = cps[idx]
    const N = basis[i]
    let wRe = cp.w_re
    let wIm = cp.w_im
    if (wrapWeight !== undefined) {
      const periods = Math.floor(rawIdx / n)
      if (periods !== 0) {
        const w0re = cps[0].w_re
        const w0im = cps[0].w_im
        const denom0 = w0re * w0re + w0im * w0im
        if (denom0 > 1e-20) {
          const rRe = (wrapWeight.re * w0re + wrapWeight.im * w0im) / denom0
          const rIm = (wrapWeight.im * w0re - wrapWeight.re * w0im) / denom0
          const rp = cpow({ re: rRe, im: rIm }, periods)
          const nwr = wRe * rp.re - wIm * rp.im
          const nwi = wRe * rp.im + wIm * rp.re
          wRe = nwr
          wIm = nwi
        }
      }
    }
    const wzRe = wRe * cp.re - wIm * cp.im
    const wzIm = wRe * cp.im + wIm * cp.re
    c0re += N * wzRe
    c0im += N * wzIm
    c1re += N * wRe
    c1im += N * wIm
  }
  const denom = c1re * c1re + c1im * c1im
  if (denom < 1e-20) return { x: 0, y: 0 }
  return {
    x: (c0re * c1re + c0im * c1im) / denom,
    y: (c0im * c1re - c0re * c1im) / denom,
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const D = 3
const clamped = [0, 0, 0, 0, 1, 1, 1, 1] // degree-3 single Bézier segment
const bezierPts: Point2D[] = [
  { x: 0, y: 0 },
  { x: 1, y: 2 },
  { x: 3, y: 2 },
  { x: 4, y: 0 },
]

// A degree-2 closed curve: 6 control points, uniform periodic knots in [0,1).
const cdeg = 2
const periodicKnots = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
const hexagon: Point2D[] = [
  { x: 2, y: 0 },
  { x: 1, y: 1.7 },
  { x: -1, y: 1.7 },
  { x: -2, y: 0 },
  { x: -1, y: -1.7 },
  { x: 1, y: -1.7 },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('basis functions', () => {
  it('open basis is a partition of unity', () => {
    for (const t of samples(20)) {
      const span = findOpenSpan(D, clamped, t)
      const N = openBasis(span, t, D, clamped)
      near(N.reduce((a, b) => a + b, 0), 1)
    }
  })

  it('periodic basis is a partition of unity', () => {
    for (const t of samples(20)) {
      const tt = wrap01(t)
      const span = findPeriodicSpan(periodicKnots, tt)
      const N = periodicBasis(span, tt, cdeg, periodicKnots)
      near(N.reduce((a, b) => a + b, 0), 1)
    }
  })
})

describe('open evaluation vs independent Bézier oracle', () => {
  it('plain matches de Casteljau', () => {
    for (const t of samples(25)) {
      expectPointClose(evaluate(plainCoeffs, bezierPts, D, clamped, t), bezier(bezierPts, t))
    }
  })

  it('rational matches weighted-Bernstein rational Bézier', () => {
    const cps: WeightedPoint2D[] = bezierPts.map((p, i) => ({ ...p, w: [1, 2, 0.5, 3][i] }))
    for (const t of samples(25)) {
      expectPointClose(evaluate(rationalCoeffs, cps, D, clamped, t), rationalBezier(cps, t))
    }
  })

  it('complex-rational matches complex-weighted Bézier', () => {
    const cps: ComplexPoint[] = bezierPts.map((p, i) => ({
      re: p.x,
      im: p.y,
      w_re: [1, 0.8, 1.2, 1][i],
      w_im: [0, 0.3, -0.2, 0.1][i],
    }))
    for (const t of samples(25)) {
      expectPointClose(evaluate(complexCoeffs, cps, D, clamped, t), complexBezier(cps, t))
    }
  })
})

describe('cross-field consistency', () => {
  it('rational with all weights = 1 equals plain', () => {
    const cps: WeightedPoint2D[] = bezierPts.map((p) => ({ ...p, w: 1 }))
    for (const t of samples(15)) {
      expectPointClose(
        evaluate(rationalCoeffs, cps, D, clamped, t),
        evaluate(plainCoeffs, bezierPts, D, clamped, t),
      )
    }
  })

  it('complex with weight (1,0) equals plain', () => {
    const cps: ComplexPoint[] = bezierPts.map((p) => ({ re: p.x, im: p.y, w_re: 1, w_im: 0 }))
    for (const t of samples(15)) {
      expectPointClose(
        evaluate(complexCoeffs, cps, D, clamped, t),
        evaluate(plainCoeffs, bezierPts, D, clamped, t),
      )
    }
  })
})

describe('periodic evaluation', () => {
  it('closed plain curve is C0 at the seam: c(0) == c(1)', () => {
    const a = evaluate(plainCoeffs, hexagon, cdeg, periodicKnots, 0, true)
    const b = evaluate(plainCoeffs, hexagon, cdeg, periodicKnots, 1, true)
    expectPointClose(a, b)
  })

  it('closed rational matches the reference spiral (nontrivial wrapWeight)', () => {
    const cps: WeightedPoint2D[] = hexagon.map((p, i) => ({ ...p, w: [1, 1.5, 2, 1, 1.5, 2][i] }))
    const wrapWeight = 1.3 // ≠ w0
    const ratio = realSpiralRatio(wrapWeight, cps[0].w)
    for (const t of samples(40)) {
      expectPointClose(
        evaluate(rationalCoeffs, cps, cdeg, periodicKnots, t, true, ratio),
        refPeriodicRational(cps, cdeg, periodicKnots, t, wrapWeight),
      )
    }
  })

  it('closed complex-rational matches the reference spiral (nontrivial wrapWeight)', () => {
    const cps: ComplexPoint[] = hexagon.map((p, i) => ({
      re: p.x,
      im: p.y,
      w_re: [1, 1.1, 0.9, 1, 1.1, 0.9][i],
      w_im: [0, 0.2, -0.1, 0.05, -0.15, 0.1][i],
    }))
    const wrapWeight: Complex = { re: 1.2, im: -0.3 }
    const ratio = complexSpiralRatio(wrapWeight, { re: cps[0].w_re, im: cps[0].w_im })
    for (const t of samples(40)) {
      expectPointClose(
        evaluate(complexCoeffs, cps, cdeg, periodicKnots, t, true, ratio),
        refPeriodicComplex(cps, cdeg, periodicKnots, t, wrapWeight),
      )
    }
  })

  it('spiral with ratio = 1 (wrapWeight = w0) reduces to the naive periodic curve', () => {
    const cps: WeightedPoint2D[] = hexagon.map((p, i) => ({ ...p, w: [1, 1.5, 2, 1, 1.5, 2][i] }))
    const ratio = realSpiralRatio(cps[0].w, cps[0].w) // = 1
    for (const t of samples(20)) {
      expectPointClose(
        evaluate(rationalCoeffs, cps, cdeg, periodicKnots, t, true, ratio),
        refPeriodicRational(cps, cdeg, periodicKnots, t), // no wrapWeight → naive
      )
    }
  })
})
