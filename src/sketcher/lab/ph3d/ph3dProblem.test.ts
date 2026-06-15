import { describe, it, expect } from 'vitest'
import { analyzePH3D, defaultPH3D, straightLine } from './ph3dCurve'
import { dragPH3DCurve, snapToFeasiblePH3D } from './ph3dProblem'

describe('spatial PH quintic optimization', () => {
  it('plain drag moves a control point toward the target (curve stays PH)', () => {
    const state = defaultPH3D()
    const before = analyzePH3D(state.a0, state.a1, state.a2, state.origin)
    const dragIndex = 3
    const target = {
      x: before.controlPoints[dragIndex].x + 0.4,
      y: before.controlPoints[dragIndex].y + 0.6,
      z: before.controlPoints[dragIndex].z - 0.3,
    }

    const next = dragPH3DCurve(state, dragIndex, target, {})
    const after = analyzePH3D(next.a0, next.a1, next.a2, next.origin)

    const dist = (a: { x: number; y: number; z: number }, b: typeof a) =>
      Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

    const before0 = dist(before.controlPoints[dragIndex], target)
    const after0 = dist(after.controlPoints[dragIndex], target)
    // The dragged CP gets meaningfully closer to the cursor.
    expect(after0).toBeLessThan(before0 * 0.6)

    // PH is automatic: σ = |r'| still holds (sanity that we produced a real PH curve).
    expect(Number.isFinite(after.arcLength)).toBe(true)
    expect(after.arcLength).toBeGreaterThan(0)
  })

  it('Enforce pulls the peak curvature under the requested bound', () => {
    const state = defaultPH3D()
    const before = analyzePH3D(state.a0, state.a1, state.a2, state.origin)

    // Ask for a limit well below the current peak — forces the solver to flatten.
    const kappaMax = before.peakCurvature * 0.6

    const snapped = snapToFeasiblePH3D(state, kappaMax)
    const after = analyzePH3D(snapped.a0, snapped.a1, snapped.a2, snapped.origin)

    // Bernstein positivity is sufficient, so the achieved peak must be ≤ κ_max
    // (allow a tiny numerical slack from sampling/solver tolerance).
    expect(after.peakCurvature).toBeLessThanOrEqual(kappaMax * 1.02)
    expect(after.peakCurvature).toBeLessThan(before.peakCurvature)
  })

  it('real-time bounded dragging stays under the bound every tick', () => {
    // Start feasible (straight line, κ = 0), bound on, then drag a CP hard.
    let state = straightLine()
    const a0 = analyzePH3D(state.a0, state.a1, state.a2, state.origin)
    const idx = 2
    const start = a0.controlPoints[idx]
    const anchorCPs = a0.controlPoints.map((c) => ({ ...c }))
    const kappaMax = 2.0

    // Pull CP2 far out in many small steps with the bound active.
    for (let s = 1; s <= 30; s++) {
      const f = s / 30
      const cursor = { x: start.x, y: 0.8 * f, z: 0.8 * f }
      state = dragPH3DCurve(state, idx, cursor, { bound: true, kappaMax, anchorCPs })
      const a = analyzePH3D(state.a0, state.a1, state.a2, state.origin)
      // Never exceed the bound (small numerical slack).
      expect(a.peakCurvature).toBeLessThanOrEqual(kappaMax * 1.05)
    }
  })
})
