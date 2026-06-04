// The pencil tool now draws (S, D) complex-rational PH curves (PH by
// construction, like the lab). This checks (a) the freshly-drawn curve is an
// exact straight line, and (b) the Generate path still works: the (S, D) curve
// adapts into the (A, B, S) shape the Lie converter consumes (via
// convertComplexPointsToAB), and at identity it reproduces the line.
import { describe, it, expect } from 'vitest'
import { createStraightComplexRationalPH } from '../../optimizer/complexRationalPHCurve'
import { convertComplexPointsToAB } from '../../optimizer/abPHCurve'
import { evaluateCurve } from '../../utils/bspline/core'
import { abPHToLieCurve, lieCurveHomogeneous, identity5 } from './lieCurve2D'
import type { ComplexRationalBSplineCurve } from '../../types/curve'
import type { ComplexRationalPHMetadata } from '../../optimizer/phCurve'
import type { ABPHMetadata } from '../../optimizer/abPHCurve'

// Mirror of sceneStore's abShapeForGenerate for a (S, D) curve.
function abShape(curve: ComplexRationalBSplineCurve, meta: ComplexRationalPHMetadata): ABPHMetadata {
  const { aRe, aIm, bRe, bIm } = convertComplexPointsToAB(curve.controlPoints)
  return {
    kind: 'ab-complex-rational',
    degree: curve.degree,
    aReCPs: aRe, aImCPs: aIm, bReCPs: bRe, bImCPs: bIm,
    sReCPs: meta.sUControlPoints, sImCPs: meta.sVControlPoints,
    knots: curve.knots, sKnots: meta.sKnots,
  }
}

describe('straight (S, D) PH curve', () => {
  const res = createStraightComplexRationalPH(10, 20, 110, 60)
  const curve: ComplexRationalBSplineCurve = { id: 'test', kind: 'complex-rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false }

  it('evaluates exactly on the line P0→P1', () => {
    for (const t of [0, 0.15, 0.4, 0.5, 0.73, 1]) {
      const p = evaluateCurve(curve, t)
      expect(Math.abs(p.x - (10 + 100 * t))).toBeLessThan(1e-6)
      expect(Math.abs(p.y - (20 + 40 * t))).toBeLessThan(1e-6)
    }
  })

  it('is degree 5 (S degree 2, D ≡ 1)', () => {
    expect(res.degree).toBe(5)
  })

  it('Generate adapter feeds the Lie converter (identity = the line)', () => {
    const meta = abShape(curve, res.metadata)
    const h = lieCurveHomogeneous(meta, identity5())
    for (const t of [0.2, 0.5, 0.8]) {
      const w = h.W.evaluate(t)
      expect(Math.abs(h.X.evaluate(t) / w - (10 + 100 * t))).toBeLessThan(1e-5)
      expect(Math.abs(h.Y.evaluate(t) / w - (20 + 40 * t))).toBeLessThan(1e-5)
    }
    // Output degree is 2n, as for the AB path.
    expect(abPHToLieCurve(meta, identity5()).degree).toBe(2 * meta.degree)
  })
})
