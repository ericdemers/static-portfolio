import { describe, it, expect } from 'vitest'
import { slideCurve, openCurvatureExtremaParameters } from '../index'

// The robust ('ipopt') solver reproduces the reference sketcher's behavior: it
// coordinates the other control points to keep the curvature-extrema bound and
// never returns a curve with more actual extrema than the start — even at the
// structurally-zero clamped boundary where g[0] is exactly 0 (our cleaner
// computation) instead of the sketcher's tiny roundoff residual. The neighbour-
// aware sign keeps that boundary coefficient active; the banded solvers, which
// leave it inactive/scaled, slide it across zero and add an extremum.

const degree = 3
const ex = (x: number[], y: number[], k: number[]) => openCurvatureExtremaParameters(x, y, k, degree).length

describe('robust (ipopt) drag preserves the curvature-extrema bound', () => {
  // The exact curve the user reported as violating (S⁻ 1→2) under the banded solver.
  const k1 = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
  const x1 = [-152.00519552295506, -179.59904722278822, -262.74648325429405, -152.26902352272606, 20.538338671201576, 180.0280168490812, 207.10743141103873]
  const y1 = [16.874207818891062, -79.1661421034233, -183.9644297956243, -235.12793945218618, -211.62490583779913, -278.12276042640167, -346.0089360253646]

  it('does not add an extremum on the reported case, and coordinates the curve', () => {
    const before = ex(x1, y1, k1)
    const r = slideCurve(x1, y1, k1, degree, 0, -155.323, 19.363, { maxIterations: 80, method: 'ipopt' })
    expect(ex(r.x, r.y, k1)).toBeLessThanOrEqual(before) // bound preserved (banded gave +1)
    // dragged point follows the cursor most of the way...
    expect(Math.hypot(r.x[0] - -155.323, r.y[0] - 19.363)).toBeLessThan(1.5)
    // ...and the neighbours move to accommodate it (coordinated, not cp0-only).
    const neighbourMove = Math.max(Math.hypot(r.x[1] - x1[1], r.y[1] - y1[1]), Math.hypot(r.x[2] - x1[2], r.y[2] - y1[2]))
    expect(neighbourMove).toBeGreaterThan(0.5)
  })

  it('never adds an extremum dragging cp0 of a flat arc in any direction', () => {
    const k2 = [0, 0, 0, 0, 1, 1, 1, 1]
    const x2 = [-110.15740732779604, -45.66054699557279, 129.55497644405924, 150.7647139043658]
    const y2 = [-31.082123125551952, -163.27977141022885, -249.809504216241, -402.2460893293892]
    const before = ex(x2, y2, k2)
    for (let d = 0; d < 8; d++) {
      const a = (Math.PI * 2 * d) / 8
      const r = slideCurve(x2, y2, k2, degree, 0, x2[0] + Math.cos(a) * 60, y2[0] + Math.sin(a) * 60, { maxIterations: 80, method: 'ipopt' })
      expect(ex(r.x, r.y, k2)).toBeLessThanOrEqual(before)
    }
  })
})
