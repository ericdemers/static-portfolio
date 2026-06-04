import { describe, it, expect } from 'vitest'
import {
  curvatureExtremaGradientPlanarPeriodic,
  curvatureExtremaGradientPlanarPeriodicLocal,
  inflectionGradientPlanarPeriodic,
  inflectionGradientPlanarPeriodicLocal,
} from '../index'
import type { PlanarCurvatureGradient } from '../gradient'
import type { BernsteinDecomposition } from '../bernstein'

/**
 * The local (B-spline-locality) periodic gradients must be NUMERICALLY IDENTICAL
 * to the dense periodic gradients they replace in the closed-curve drag — they
 * differ only in WHICH spans they compute (the support window, which wraps the
 * seam), and the dropped spans are structurally zero. The dense versions are kept
 * solely as the oracle for this test. This is what makes the ~2x closed-curve
 * speedup safe: any future drift from the dense math fails here.
 */

function makeOval(a: number, b: number, p1x: number, p1y: number, p2x: number, p2y: number) {
  return [
    { x: a, y: 0 }, { x: p1x, y: -p1y }, { x: p2x, y: -p2y }, { x: 0, y: -b },
    { x: -p2x, y: -p2y }, { x: -p1x, y: -p1y }, { x: -a, y: 0 }, { x: -p1x, y: p1y },
    { x: -p2x, y: p2y }, { x: 0, y: b }, { x: p2x, y: p2y }, { x: p1x, y: p1y },
  ]
}
const OVAL = makeOval(179.0609926, 213.3017254, 156.1043674, 118.2907758, 87.2324738, 189.5488809)

// Max RELATIVE difference (abs diff / max |coeff|). The local gradients compute
// the same partials as the dense oracle but with the value work hoisted out of
// the per-column loop (shared once) and combined via the analytic chain rule, so
// the floating-point operation ORDER differs — the result is identical to
// round-off, not bit-for-bit. g's coefficients span ~1e14, so we compare
// relative, not absolute.
function maxRelDiff(
  dense: PlanarCurvatureGradient,
  local: PlanarCurvatureGradient,
  n: number,
): number {
  let d = 0
  let scale = 0
  const cmp = (a: BernsteinDecomposition, b: BernsteinDecomposition) => {
    for (let s = 0; s < a.coeffs.length; s++)
      for (let c = 0; c < a.coeffs[s].length; c++) {
        d = Math.max(d, Math.abs(a.coeffs[s][c] - b.coeffs[s][c]))
        scale = Math.max(scale, Math.abs(a.coeffs[s][c]))
      }
  }
  cmp(dense.g, local.g)
  for (let i = 0; i < n; i++) { cmp(dense.dx[i], local.dx[i]); cmp(dense.dy[i], local.dy[i]) }
  return scale > 0 ? d / scale : d
}

describe('local periodic gradients match the dense oracle (to round-off)', () => {
  it('curvature gradient — Oval (deg 3, 12 CPs)', () => {
    const K = Array.from({ length: 12 }, (_, i) => i / 12)
    const x = OVAL.map((p) => p.x), y = OVAL.map((p) => p.y)
    const rel = maxRelDiff(
      curvatureExtremaGradientPlanarPeriodic(x, y, K, 3),
      curvatureExtremaGradientPlanarPeriodicLocal(x, y, K, 3),
      12,
    )
    expect(rel).toBeLessThan(1e-12) // ≈ machine epsilon; observed ~3e-17
  })

  it('curvature + inflection gradients — random periodic curves (deg 3 & 4)', () => {
    let st = 123
    const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return (st / 0x100000000) * 400 - 200 }
    for (const [n, deg] of [[8, 3], [10, 3], [7, 4], [12, 4], [16, 3]] as [number, number][]) {
      const K = Array.from({ length: n }, (_, i) => i / n)
      const x = Array.from({ length: n }, rnd), y = Array.from({ length: n }, rnd)
      const cg = maxRelDiff(
        curvatureExtremaGradientPlanarPeriodic(x, y, K, deg),
        curvatureExtremaGradientPlanarPeriodicLocal(x, y, K, deg),
        n,
      )
      const fg = maxRelDiff(
        inflectionGradientPlanarPeriodic(x, y, K, deg),
        inflectionGradientPlanarPeriodicLocal(x, y, K, deg),
        n,
      )
      expect(cg).toBeLessThan(1e-12)
      expect(fg).toBeLessThan(1e-12)
    }
  })
})
