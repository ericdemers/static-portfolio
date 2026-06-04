import { describe, it, expect } from 'vitest'
import { optimizeComplexRationalCurve, computeOpenComplexCurvatureConstraintState } from '../optimizer'
import type { ComplexRationalBSplineCurve } from '../types/curve'

/**
 * Production bound-preservation guard for the COMPLEX-RATIONAL curve type — the
 * companion to rationalBoundPreservation. optimizeComplexRationalCurve runs a
 * different solver (ComplexRationalBSplineCurveProblem); this locks that a quick
 * drag through it never increases the curvature-extrema bound S⁻.
 *
 * Metric: the open complex constraint state's exact `signs`, fed the homogeneous
 * Z = w·z cps (Zre = re·w_re − im·w_im, …) exactly as BottomPanel computes them.
 * Teeth: a naive snap-to-cursor drag DOES raise the bound on at least one push.
 *
 * Smaller matrix than the rational test (fewer frames/pushes): this is the
 * heaviest solver in the app (~hundreds of ms/frame), so we keep CI quick.
 */

const DEGREE = 3
const KNOTS = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const RE0 = [-152, -180, -263, -152, 20, 180, 207]
const IM0 = [17, -79, -184, -235, -212, -278, -346]
const OPTS = { maxIterations: 20, enableBFGS: false }
const FRAMES = 8

// w = 1 + 0i ⇒ a polynomial curve in complex clothing; gives a real bound to preserve.
const freshCurve = (): ComplexRationalBSplineCurve => ({
  id: 'cr', kind: 'complex-rational', degree: DEGREE, closed: false,
  controlPoints: RE0.map((re, i) => ({ re, im: IM0[i], w_re: 1, w_im: 0 })),
  knots: KNOTS,
})

function boundOf(curve: ComplexRationalBSplineCurve): number {
  const Zre: number[] = [], Zim: number[] = [], Wre: number[] = [], Wim: number[] = []
  for (const cp of curve.controlPoints) {
    Zre.push(cp.re * cp.w_re - cp.im * cp.w_im)
    Zim.push(cp.re * cp.w_im + cp.im * cp.w_re)
    Wre.push(cp.w_re)
    Wim.push(cp.w_im)
  }
  const { signs } = computeOpenComplexCurvatureConstraintState(curve.knots, Zre, Zim, Wre, Wim)
  let changes = 0
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++
  return changes
}

function optimizedDrag(start: ComplexRationalBSplineCurve, di: number, tx: number, ty: number): ComplexRationalBSplineCurve {
  let curve = start
  const sx = start.controlPoints[di].re
  const sy = start.controlPoints[di].im
  for (let i = 0; i < FRAMES; i++) {
    const f = (i + 1) / FRAMES
    const r = optimizeComplexRationalCurve(curve, sx + (tx - sx) * f, sy + (ty - sy) * f, di, 'controlPoint', OPTS)
    curve = { ...curve, controlPoints: r.controlPoints }
  }
  return curve
}

function naiveDrag(start: ComplexRationalBSplineCurve, di: number, tx: number, ty: number): ComplexRationalBSplineCurve {
  let curve = start
  const sx = start.controlPoints[di].re
  const sy = start.controlPoints[di].im
  for (let i = 0; i < FRAMES; i++) {
    const f = (i + 1) / FRAMES
    const cps = curve.controlPoints.map((p) => ({ ...p }))
    cps[di] = { ...cps[di], re: sx + (tx - sx) * f, im: sy + (ty - sy) * f }
    curve = { ...curve, controlPoints: cps }
  }
  return curve
}

const PUSHES: [number, number, number][] = [[3, 0, 220], [2, 0, 260], [1, 0, 190]]

describe('complex-rational curve: production drag preserves the curvature-extrema bound', () => {
  it('optimizeComplexRationalCurve never increases S⁻ on a quick drag', () => {
    for (const [di, dx, dy] of PUSHES) {
      const start = freshCurve()
      const b0 = boundOf(start)
      const out = optimizedDrag(start, di, start.controlPoints[di].re + dx, start.controlPoints[di].im + dy)
      expect(boundOf(out)).toBeLessThanOrEqual(b0)
    }
  })

  it('TEETH: a naive snap-to-cursor drag DOES raise the bound on at least one push', () => {
    let naiveViolations = 0
    for (const [di, dx, dy] of PUSHES) {
      const start = freshCurve()
      const b0 = boundOf(start)
      const out = naiveDrag(start, di, start.controlPoints[di].re + dx, start.controlPoints[di].im + dy)
      if (boundOf(out) > b0) naiveViolations++
    }
    expect(naiveViolations).toBeGreaterThan(0)
  })
})
