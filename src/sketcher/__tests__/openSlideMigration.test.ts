// migration equivalence check; the legacy side isn't type-clean under strict tsc.
import { describe, it, expect } from 'vitest'
import { slideCurve, curvatureExtremaNumeratorPlanar } from '../../core'
// planar B-spline curvature drag (now on core/) behaves like the legacy path it
// replaced: both keep the curvature-extrema bound and track the drag, and the
// dragged point lands in the same neighbourhood.
import { optimizeCurve, applyOptimizeResult } from '../optimizer'

// Open clamped cubic, 7 control points (an S-ish arc with curvature features).
const degree = 3
const cpX = [0, 60, 130, 200, 280, 350, 420]
const cpY = [0, 120, 40, 150, 30, 130, 20]
const knots = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const dragIndex = 3
const targetX = cpX[dragIndex] + 70
const targetY = cpY[dragIndex] - 60

const signChanges = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

describe('open planar B-spline drag: core/ migration matches legacy behavior', () => {
  const before = signChanges(cpX, cpY)

  // core/ path (what the editor now runs)
  const core = slideCurve(cpX, cpY, knots, degree, dragIndex, targetX, targetY, { maxIterations: 20 })

  // legacy path (what it replaced)
  const curve = {
    id: 't',
    kind: 'bspline' as const,
    degree,
    knots,
    controlPoints: cpX.map((x, i) => ({ x, y: cpY[i] })),
    closed: false,
  }
  const legacyCurve = applyOptimizeResult(
    curve,
    optimizeCurve(curve, targetX, targetY, dragIndex, { maxIterations: 20, enableBFGS: false }),
  )
  // legacyCurve is a bspline (the fixture); narrow its control points off the Curve union.
  const lcps = legacyCurve.controlPoints as { x: number; y: number }[]
  const lx = lcps.map((p) => p.x)
  const ly = lcps.map((p) => p.y)

  it('core keeps the curvature-extrema bound non-increasing', () => {
    expect(signChanges(core.x, core.y)).toBeLessThanOrEqual(before)
  })

  it('legacy keeps the bound too (sanity on the reference path)', () => {
    expect(signChanges(lx, ly)).toBeLessThanOrEqual(before)
  })

  it('core tracks the drag (dragged point moves toward target)', () => {
    const d0 = Math.hypot(cpX[dragIndex] - targetX, cpY[dragIndex] - targetY)
    const d1 = Math.hypot(core.x[dragIndex] - targetX, core.y[dragIndex] - targetY)
    expect(d1).toBeLessThan(d0)
  })

  it('core tracks the drag at least as well as legacy', () => {
    // Different optimizers (Mehrotra predictor-corrector vs the legacy IPM)
    // converge to slightly different feasible points, so not bit-identical.
    // The migration bar: core should land the dragged point at least as close
    // to the target as legacy did (small slack for solver differences).
    const target = { x: targetX, y: targetY }
    const dCore = Math.hypot(core.x[dragIndex] - target.x, core.y[dragIndex] - target.y)
    const dLegacy = Math.hypot(lx[dragIndex] - target.x, ly[dragIndex] - target.y)
    expect(dCore).toBeLessThanOrEqual(dLegacy + 5)
  })
})
