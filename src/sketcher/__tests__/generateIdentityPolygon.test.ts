import { describe, it, expect } from 'vitest'
import { useSceneStore } from '../store/sceneStore'
import { createStraightComplexRationalPH } from '../optimizer/complexRationalPHCurve'
import type { ComplexRationalBSplineCurve, WeightedPoint2D } from '../types/curve'

/**
 * Generate with all sliders at 0 is the identity Lie transform — the produced
 * curve IS the original, so its control polygon must be NICE. The old path fed
 * the identity through the Lie quadric lift and least-squares-fit a degree-2n
 * rational, which is ill-conditioned: it produced negative weights and control
 * points flung far outside the curve (e.g. a weight of -0.024 and a CP at
 * (438, 1440) for a curve spanning (0,0)→(100,40)). The fix routes the identity
 * through the EXACT complex→real-rational conversion (z = Z·W̄/|W|², degree 2n):
 * weights = |W|² coefficients (positive), control points hugging the curve.
 */
describe('Generate at identity yields a nice control polygon', () => {
  it('startGenerate preview is a clean real rational (positive weights, hull in the curve box)', () => {
    const res = createStraightComplexRationalPH(0, 0, 100, 40)
    const id = 'cr'
    const curve: ComplexRationalBSplineCurve = {
      id, kind: 'complex-rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false,
    }
    useSceneStore.setState({ curves: [curve], phMetadata: new Map([[id, res.metadata]]), generate: null })
    useSceneStore.getState().startGenerate(id)

    const g = useSceneStore.getState().generate
    expect(g).not.toBeNull()
    const preview = useSceneStore.getState().curves.find((c) => c.id === g!.previewCurveId)
    expect(preview).toBeDefined()
    expect(preview!.kind).toBe('rational')
    expect(preview!.degree).toBe(2 * res.degree) // complex-rational n → real rational 2n

    const cps = preview!.controlPoints as WeightedPoint2D[]
    // nice polygon: all weights strictly positive, everything finite, and the
    // control points stay within the curve's bounding box (+small margin) — no
    // far-flung overshoot.
    expect(cps.every((p) => p.w > 0)).toBe(true)
    expect(cps.every((p) => isFinite(p.x) && isFinite(p.y) && isFinite(p.w))).toBe(true)
    const m = 5
    expect(cps.every((p) => p.x >= -m && p.x <= 100 + m && p.y >= -m && p.y <= 40 + m)).toBe(true)
  })
})
