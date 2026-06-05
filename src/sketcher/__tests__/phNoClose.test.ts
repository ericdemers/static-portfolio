import { describe, it, expect } from 'vitest'
import { useSceneStore } from '../store/sceneStore'
import { createStraightComplexRationalPH } from '../optimizer/complexRationalPHCurve'
import type { ComplexRationalBSplineCurve, ComplexPoint } from '../types/curve'

/**
 * Closed PH curves aren't supported yet. The endpoints may be dragged freely
 * (even onto each other), but the curve must never be CONVERTED to a closed /
 * periodic curve. That conversion only happens via closeCurveByMergingEndpoints
 * (triggered by the endpoint snap-to-close gesture), which now refuses PH curves —
 * and the snap detection no longer highlights the opposite endpoint for them.
 * Guards both the sketcher and the lab (shared store).
 */
function setupPH() {
  const res = createStraightComplexRationalPH(0, 0, 100, 40)
  const id = 'ph'
  const curve: ComplexRationalBSplineCurve = {
    id, kind: 'complex-rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false,
  }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map([[id, res.metadata]]), generate: null })
  return { id, cps: res.controlPoints as ComplexPoint[] }
}
const current = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!

describe('PH curves cannot be closed', () => {
  it('closeCurveByMergingEndpoints refuses a PH curve — it stays open', () => {
    const { id } = setupPH()
    const last = (current(id).controlPoints as ComplexPoint[]).length - 1
    useSceneStore.getState().closeCurveByMergingEndpoints(id, last)
    const c = current(id)
    expect(c.closed).toBe(false) // not converted to a closed/periodic curve
    expect(c.kind).toBe('complex-rational')
    expect(useSceneStore.getState().phMetadata.has(id)).toBe(true)
  })

  it('a normal endpoint drag still moves the PH curve freely', () => {
    const { id, cps } = setupPH()
    const last = cps.length - 1
    useSceneStore.getState().moveControlPoint(id, last, { x: cps[last].re + 10, y: cps[last].im + 30 })
    const after = current(id).controlPoints as ComplexPoint[]
    const moved = Math.hypot(after[last].re - cps[last].re, after[last].im - cps[last].im)
    expect(moved).toBeGreaterThan(1) // the curve responded to the drag
  })
})
