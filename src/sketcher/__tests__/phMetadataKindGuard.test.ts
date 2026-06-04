import { describe, it, expect } from 'vitest'
import { useSceneStore } from '../store/sceneStore'
import { createStraightComplexRationalPH } from '../optimizer/complexRationalPHCurve'
import type { ComplexRationalBSplineCurve } from '../types/curve'

/**
 * A non-polynomial PH curve (complex-rational / ab / real-rational) carries
 * phMetadata WITHOUT u/v control points. elevateCurveDegree and
 * removeKnotFromCurve gated their polynomial branch on `phMetadata.has(id)`
 * alone — true for ALL metadata kinds — so a complex-rational curve entered the
 * polynomial path and called elevateDegree1D(meta.uControlPoints = undefined, …),
 * which crashes. They must guard on `meta.kind === 'polynomial'` and otherwise
 * fall through to the kind-aware generic op (as insertKnotAtCurve already does).
 * convertCurveType must also drop the now-irrelevant metadata.
 */
function makeComplexRationalPHInStore(): string {
  const res = createStraightComplexRationalPH(0, 0, 100, 40)
  const id = 'crph1'
  const curve: ComplexRationalBSplineCurve = {
    id,
    kind: 'complex-rational',
    degree: res.degree,
    controlPoints: res.controlPoints,
    knots: res.knots,
    closed: false,
  }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map([[id, res.metadata]]) })
  return id
}

describe('phMetadata kind guard (non-polynomial PH must not enter the u/v branch)', () => {
  it('elevateCurveDegree on a complex-rational PH curve does not crash', () => {
    const id = makeComplexRationalPHInStore()
    const before = useSceneStore.getState().curves[0].degree
    expect(() => useSceneStore.getState().elevateCurveDegree(id)).not.toThrow()
    // fell through to the kind-aware generic elevateDegree
    expect(useSceneStore.getState().curves[0].degree).toBe(before + 1)
  })

  it('removeKnotFromCurve on a complex-rational PH curve does not crash', () => {
    const id = makeComplexRationalPHInStore()
    const mid = Math.floor(useSceneStore.getState().curves[0].knots.length / 2)
    expect(() => useSceneStore.getState().removeKnotFromCurve(id, mid)).not.toThrow()
  })

  it('convertCurveType drops the stale phMetadata entry', () => {
    const id = makeComplexRationalPHInStore()
    expect(useSceneStore.getState().phMetadata.has(id)).toBe(true)
    useSceneStore.getState().convertCurveType(id, 'bspline')
    expect(useSceneStore.getState().phMetadata.has(id)).toBe(false)
  })
})
