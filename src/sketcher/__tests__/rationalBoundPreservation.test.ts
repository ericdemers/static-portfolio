import { describe, it, expect } from 'vitest'
import { optimizeRationalCurve, computeRationalCurveConstraintState } from '../optimizer'
import type { RationalBSplineCurve } from '../types/curve'

/**
 * Production bound-preservation guard for the RATIONAL curve type.
 *
 * The sketcher's optimizeCurve dispatches to per-curve-type solvers; only
 * `kind:'bspline'` had a bound/feel test (editingFeel, openSlideMigration). The
 * rich curve types — the whole reason the production optimizer exists — shipped
 * unguarded: a Jacobian-sign or active-set bug in the rational solver would let
 * the curvature-extrema bound (S⁻, the sign-change count of the g numerator)
 * GROW under a drag, silently. This locks that it cannot.
 *
 * Metric: the constraint state's exact `signs` (g > 0 ? -1 : 1) — what the
 * curvature bar shows the user — fed the homogeneous cps (x·w, y·w, w), exactly
 * as BottomPanel computes them.
 *
 * Teeth: the same quick drag done NAIVELY (snap the control point straight to the
 * cursor, no optimization) DOES raise the bound on these pushes; the optimizer
 * must not. The test asserts both — so it can't pass vacuously.
 */

const DEGREE = 3
const KNOTS = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const X0 = [-152, -180, -263, -152, 20, 180, 207]
const Y0 = [17, -79, -184, -235, -212, -278, -346]
const OPTS = { maxIterations: 20, enableBFGS: false }
const FRAMES = 15

const freshCurve = (): RationalBSplineCurve => ({
  id: 'r', kind: 'rational', degree: DEGREE, closed: false,
  controlPoints: X0.map((x, i) => ({ x, y: Y0[i], w: 1 })),
  knots: KNOTS,
})

// S⁻ as the user sees it: sign changes of the exact `signs` array, from the
// homogeneous cps (BottomPanel's recipe).
function boundOf(curve: RationalBSplineCurve): number {
  const cpsX = curve.controlPoints.map((p) => p.x * p.w)
  const cpsY = curve.controlPoints.map((p) => p.y * p.w)
  const cpsW = curve.controlPoints.map((p) => p.w)
  const { signs } = computeRationalCurveConstraintState(curve.knots, cpsX, cpsY, cpsW)
  let changes = 0
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++
  return changes
}

// Optimized chained drag: feed each solved frame back in, the way a finger moves.
function optimizedDrag(start: RationalBSplineCurve, di: number, tx: number, ty: number): RationalBSplineCurve {
  let curve = start
  const sx = start.controlPoints[di].x
  const sy = start.controlPoints[di].y
  for (let i = 0; i < FRAMES; i++) {
    const f = (i + 1) / FRAMES
    const r = optimizeRationalCurve(curve, sx + (tx - sx) * f, sy + (ty - sy) * f, di, OPTS)
    // result cps are homogeneous (X = x·w); rebuild Cartesian WeightedPoint2D
    curve = {
      ...curve,
      controlPoints: r.controlPointsX.map((X, k) => {
        const w = r.controlPointsW[k]
        return { x: X / w, y: r.controlPointsY[k] / w, w }
      }),
    }
  }
  return curve
}

// Naive chained drag: snap the dragged point straight to the cursor each frame,
// no constraint — the "what a dumb editor would do" baseline.
function naiveDrag(start: RationalBSplineCurve, di: number, tx: number, ty: number): RationalBSplineCurve {
  let curve = start
  const sx = start.controlPoints[di].x
  const sy = start.controlPoints[di].y
  for (let i = 0; i < FRAMES; i++) {
    const f = (i + 1) / FRAMES
    const cps = curve.controlPoints.map((p) => ({ ...p }))
    cps[di] = { x: sx + (tx - sx) * f, y: sy + (ty - sy) * f, w: cps[di].w }
    curve = { ...curve, controlPoints: cps }
  }
  return curve
}

// Strong pushes that drive the curve against the bound (same family as editingFeel's STRONG).
const PUSHES: [number, number, number][] = [[3, 0, 220], [2, 0, 260], [1, 0, 190], [4, 0, 240], [3, 160, 160]]

describe('rational curve: production drag preserves the curvature-extrema bound', () => {
  it('optimizeRationalCurve never increases S⁻ on a quick drag', () => {
    for (const [di, dx, dy] of PUSHES) {
      const start = freshCurve()
      const b0 = boundOf(start)
      const out = optimizedDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy)
      expect(boundOf(out)).toBeLessThanOrEqual(b0)
    }
  })

  it('TEETH: a naive snap-to-cursor drag DOES raise the bound on at least one push', () => {
    let naiveViolations = 0
    for (const [di, dx, dy] of PUSHES) {
      const start = freshCurve()
      const b0 = boundOf(start)
      const out = naiveDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy)
      if (boundOf(out) > b0) naiveViolations++
    }
    // If naive never violates, the optimized assertion above is vacuous — fail loudly.
    expect(naiveViolations).toBeGreaterThan(0)
  })
})
