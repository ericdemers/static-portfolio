import { describe, it, expect, beforeEach } from 'vitest'
import { useSceneStore } from './sceneStore'
import type { Curve } from '../types/curve'

function injectBSpline(): string {
  const id = 'bs'
  const curve: Curve = {
    id, kind: 'bspline', degree: 3,
    knots: [0, 0, 0, 0, 1, 1, 1, 1],
    controlPoints: [{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 150, y: 100 }, { x: 200, y: 0 }],
    closed: false,
  }
  useSceneStore.setState({ curves: [curve], selectedCurveId: id, transformWidgetType: null, transformActive: false })
  return id
}

const kindOf = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!.kind

describe('converting curve type closes an active Transform widget', () => {
  beforeEach(() => { useSceneStore.getState().cancelTransform() })

  it('deactivates the (stale) Transform widget when the representation switches', () => {
    const id = injectBSpline()
    useSceneStore.getState().startTransform()
    expect(useSceneStore.getState().transformActive).toBe(true)
    expect(useSceneStore.getState().transformWidgetType).toBe('parallelogram') // bspline widget

    useSceneStore.getState().convertCurveType(id, 'complex-rational')

    expect(kindOf(id)).toBe('complex-rational')          // conversion happened
    expect(useSceneStore.getState().transformActive).toBe(false) // widget closed
    expect(useSceneStore.getState().transformWidgetType).toBeNull()
  })

  it('is a no-op for the widget when none is active', () => {
    const id = injectBSpline()
    expect(useSceneStore.getState().transformActive).toBe(false)
    useSceneStore.getState().convertCurveType(id, 'rational')
    expect(kindOf(id)).toBe('rational')
    expect(useSceneStore.getState().transformWidgetType).toBeNull()
  })
})
