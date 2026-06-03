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

// Regression for the NOISE-coefficient bound violation. When g has a Bernstein
// coefficient at the floating-point noise floor (|g_i| ≪ machine-eps · max|g|,
// from catastrophic cancellation), an earlier coordinate-normalization
// round-trip ((cp/s)·s ≠ cp) flipped that coefficient's sign between the
// constructor and the first solve iterate → "start infeasible" → the optimizer
// bailed and returned an infeasible point with a spurious new sign change,
// raising S⁻ (the bound) — the "extremum flashes then enters" the user saw.
// These drags must never raise S⁻.
describe('noise-coefficient drags never raise the bound', () => {
  const k2 = [0, 0, 0, 0, 0.5, 1, 1, 1, 1]
  const sc2 = (x: number[], y: number[]) => curvatureExtremaNumeratorPlanar(x, y, k2, degree).signChanges()

  it('the deterministic noise-flip frame keeps S⁻', () => {
    const x = [-355.2078496872041, -185.94643512413916, -36.85029437633483, -81.15737040420538, 91.65537194238784]
    const y = [339.30473765577693, -47.1996728337419, 74.81986698923158, 97.40922759636183, -106.59593806976287]
    const before = sc2(x, y)
    const r = slideCurve(x, y, k2, degree, 3, -94.74, 87.228, { maxIterations: 20 })
    expect(sc2(r.x, r.y)).toBeLessThanOrEqual(before)
  })

  it('chained wandering drags never raise S⁻ (bounded search)', () => {
    const bases = [
      { x: [-222.35247802418897, -109.85297098415901, 29.429420767030415, 203.4484242627635, 340.5164794921875], y: [52.57379150284148, -41.22672830286821, -31.175429342484758, -87.28703942089011, -213.9583282470703] },
      { x: [-169.91911471484707, -131.26593017578125, -3.740121679049728, 110.0525907480096, 211.441545884755], y: [-146.1093110109697, -45.18011474609375, 40.94149211160833, -43.832898796388754, -236.4105528695159] },
    ]
    let lcgState = 13
    const rand = () => { lcgState = (lcgState * 1664525 + 1013904223) >>> 0; return lcgState / 0x100000000 }
    let increases = 0
    for (const base of bases) {
      for (let seed = 0; seed < 3; seed++) {
        let cx = base.x.slice(), cy = base.y.slice()
        let idx = 4
        for (let s = 0; s < 150; s++) {
          if (rand() < 0.1) idx = Math.floor(rand() * 5)
          const sp = 10 + rand() * 60
          const tx = cx[idx] + (rand() * 2 - 1) * sp
          const ty = cy[idx] + (rand() * 2 - 1) * sp
          const sB = sc2(cx, cy)
          const r = slideCurve(cx, cy, k2, degree, idx, tx, ty, { maxIterations: 20 })
          if (sc2(r.x, r.y) > sB) increases++
          cx = r.x; cy = r.y
        }
      }
    }
    expect(increases).toBe(0)
  })
})
