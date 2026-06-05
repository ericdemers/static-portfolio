import { describe, it, expect } from 'vitest'
import { useSceneStore } from '../store/sceneStore'
import { createStraightComplexRationalPH } from '../optimizer/complexRationalPHCurve'
import type { ComplexRationalBSplineCurve, ComplexPoint } from '../types/curve'

/**
 * Closed PH curves aren't supported yet, so dragging a PH curve's two endpoints
 * together must NOT close it — the store's moveControlPoint blocks any PH drag
 * whose result would bring the first and last control points together (within
 * ~3% of the curve's extent). This guards both the sketcher and the lab (both
 * drag PH curves through this path).
 */
const gap = (cps: ComplexPoint[]) =>
  Math.hypot(cps[cps.length - 1].re - cps[0].re, cps[cps.length - 1].im - cps[0].im)

function setup() {
  const res = createStraightComplexRationalPH(0, 0, 100, 40)
  const id = 'ph'
  const curve: ComplexRationalBSplineCurve = {
    id, kind: 'complex-rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false,
  }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map([[id, res.metadata]]), generate: null })
  return { id, cps: res.controlPoints as ComplexPoint[] }
}
const current = (id: string) =>
  useSceneStore.getState().curves.find((c) => c.id === id)!.controlPoints as ComplexPoint[]

describe('PH curve cannot be closed by dragging the endpoints together', () => {
  it('blocks a drag that brings the end endpoint onto the start endpoint', () => {
    const { id, cps } = setup()
    const last = cps.length - 1
    const g0 = gap(cps)
    // drag the end control point onto the start — a closing move
    useSceneStore.getState().moveControlPoint(id, last, { x: cps[0].re, y: cps[0].im })
    // the curve stayed open: endpoints are still well apart (move was blocked)
    expect(gap(current(id))).toBeGreaterThan(0.5 * g0)
  })

  it('still allows a normal (non-closing) drag', () => {
    const { id, cps } = setup()
    const last = cps.length - 1
    // move the end endpoint further out, away from the start — not closing
    useSceneStore.getState().moveControlPoint(id, last, { x: cps[last].re + 10, y: cps[last].im + 30 })
    const after = current(id)
    const moved = Math.hypot(after[last].re - cps[last].re, after[last].im - cps[last].im)
    expect(moved).toBeGreaterThan(1) // the curve responded to the drag
  })
})
