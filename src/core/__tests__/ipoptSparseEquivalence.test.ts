import { describe, it, expect, afterEach } from 'vitest'
import { slideCurve } from '../index'
import { IP_LOCALITY, IP_SPARSE_SOC } from '../ipopt/InteriorPointOptimizer'

/**
 * core/ipopt is now the SINGLE interior-point solver (the sketcher's copy was
 * deleted and re-exports it). core/ipopt adds two sparse fast-paths over the
 * plain dense solver, behind flags:
 *   - IP_LOCALITY: sparse accumulation of the barrier Hessian Jᵀ·diag(1/f²)·J
 *   - IP_SPARSE_SOC: sparse min-norm projection for the second-order correction
 * They must be ALGEBRAICALLY identical to the dense path (only the FP operation
 * order differs). This locks that: a constraint-engaging drag gives the same
 * result with the flags on (the shipping default) and off. If a future sparse
 * tweak drifts, this fails before the editor silently changes behavior.
 */
const KNOTS = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const X0 = [-152, -180, -263, -152, 20, 180, 207]
const Y0 = [17, -79, -184, -235, -212, -278, -346]
const DEGREE = 3

// A strong push that drives the curve against the curvature-extrema bound, so the
// active-set barrier Hessian and the second-order correction are both exercised.
const run = () =>
  slideCurve(X0, Y0, KNOTS, DEGREE, 3, X0[3], Y0[3] + 220, { method: 'ipopt', maxIterations: 40 })

describe('IPOPT sparse fast-paths equal the dense path', () => {
  afterEach(() => {
    IP_LOCALITY.enabled = true
    IP_SPARSE_SOC.enabled = true
  })

  it('IP_LOCALITY + IP_SPARSE_SOC on vs off give the same drag, to round-off', () => {
    let sparse, dense
    try {
      IP_LOCALITY.enabled = true
      IP_SPARSE_SOC.enabled = true
      sparse = run()

      IP_LOCALITY.enabled = false
      IP_SPARSE_SOC.enabled = false
      dense = run()
    } finally {
      // Restore immediately (before assertions) — these are global flags.
      IP_LOCALITY.enabled = true
      IP_SPARSE_SOC.enabled = true
    }

    let maxDiff = 0
    for (let i = 0; i < sparse.x.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(sparse.x[i] - dense.x[i]), Math.abs(sparse.y[i] - dense.y[i]))
    }
    // Coordinates are O(100s); algebraically identical paths agree to ~round-off.
    expect(maxDiff).toBeLessThan(1e-6)
    expect(sparse.converged).toBe(dense.converged)
  })
})
