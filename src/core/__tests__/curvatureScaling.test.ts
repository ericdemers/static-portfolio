import { describe, it, expect } from 'vitest'
import { slideCurve, curvatureExtremaNumeratorPlanar } from '../index'

// Regression guard for the per-constraint / coordinate scaling in
// PlanarCurvatureProblem. Without scaling, g's Bernstein coefficients span >10
// orders of magnitude on real curves (here: 0.4 next to ~1e12), the KKT system
// is hopelessly ill-conditioned, and the optimizer gives up at iterate 0 on
// most drags (returning the start). The guarantees we lock in:
//   (1) the curvature-extrema bound S⁻ is NEVER increased by a drag, and
//   (2) the optimizer makes real progress on a fair share of drags (it doesn't
//       silently fall back to "return the start" everywhere — the failure mode
//       the scaling fixed).
// Fixture: the exact open cubic a user reported as "stuck".

const degree = 3
const knots = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const baseX = [-417.968, -375.276, -252.404, -123.837, -22.781, 38.166, 142.094]
const baseY = [-23.075, 11.165, 32.376, 54.571, 72.017, 82.538, 100.479]

const sc = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

describe('PlanarCurvatureProblem scaling: bound preserved + drags progress', () => {
  const before = sc(baseX, baseY)
  const dirs = 12
  const mags = [40, 120, 250]
  let boundIncreases = 0
  let progressed = 0
  let total = 0

  for (let idx = 0; idx < baseX.length; idx++) {
    for (let d = 0; d < dirs; d++) {
      const ang = (2 * Math.PI * d) / dirs
      for (const mag of mags) {
        total++
        const tx = baseX[idx] + Math.cos(ang) * mag
        const ty = baseY[idx] + Math.sin(ang) * mag
        const { x, y } = slideCurve(baseX, baseY, knots, degree, idx, tx, ty, { maxIterations: 20 })
        if (sc(x, y) > before) boundIncreases++
        const want = Math.hypot(tx - baseX[idx], ty - baseY[idx])
        const moved = Math.hypot(x[idx] - baseX[idx], y[idx] - baseY[idx])
        if (want > 0 && moved / want > 0.1) progressed++
      }
    }
  }

  it('never increases the curvature-extrema bound S⁻', () => {
    expect(boundIncreases).toBe(0)
  })

  it('makes real progress on a fair share of drags (scaling not stuck-at-start)', () => {
    // Pre-scaling, the optimizer gave up at iterate 0 on the great majority of
    // these drags. Post-scaling a meaningful fraction track the cursor.
    expect(progressed / total).toBeGreaterThan(0.15)
  })
})
