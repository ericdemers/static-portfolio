import { describe, it, expect } from 'vitest'
import { useSceneStore } from '../store/sceneStore'

/**
 * Undo/redo must keep a PH/AB/rational curve's GEOMETRY and its defining
 * phMetadata coefficients in sync. The history snapshot (createHistoryEntry)
 * captured only {curves, spatialCurves, selectedCurveId}; undo/redo restored
 * those and left the phMetadata Map untouched — so after an undo the geometry
 * reverted but the S/D/A/B coefficients did not, and the next edit consumed a
 * (geometry, coefficients) pair that never coexisted. This locks that fixed.
 *
 * The curve here is a minimal polynomial-PH B-spline; the test only needs the
 * (geometry, metadata) pair to differ between v1 and v2 so a desync is visible.
 */
const phCurve = (x0: number) => ({
  id: 'ph1',
  kind: 'bspline' as const,
  degree: 3,
  closed: false,
  controlPoints: [
    { x: x0, y: 0 }, { x: x0 + 10, y: 0 }, { x: x0 + 20, y: 0 }, { x: x0 + 30, y: 0 },
  ],
  knots: [0, 0, 0, 0, 1, 1, 1, 1],
})
// `tag` stands in for the defining coefficients; it must travel with the geometry.
const phMeta = (tag: number) => ({
  kind: 'polynomial' as const,
  uvDegree: 1,
  uControlPoints: [tag],
  vControlPoints: [0],
  uvKnots: [0, 0, 1, 1],
  origin: { x: 0, y: 0 },
})

describe('undo/redo keeps phMetadata in sync with curve geometry', () => {
  it('undo restores the metadata that coexisted with the restored geometry', () => {
    const store = useSceneStore

    // v1: geometry at x0=0 with coefficients tagged 1
    store.setState({ curves: [phCurve(0)], phMetadata: new Map([['ph1', phMeta(1)]]) })
    store.getState().saveToHistory()

    // edit → v2: geometry moved to x0=100, coefficients re-derived (tagged 2)
    store.setState({ curves: [phCurve(100)], phMetadata: new Map([['ph1', phMeta(2)]]) })
    store.getState().saveToHistory()

    // undo: must restore BOTH the v1 geometry and the v1 coefficients
    store.getState().undo()
    const s = store.getState()
    expect((s.curves[0].controlPoints[0] as { x: number }).x).toBe(0) // geometry reverted (already worked)
    expect((s.phMetadata.get('ph1') as { uControlPoints: number[] }).uControlPoints[0]).toBe(1) // coefficients must revert too

    // redo: forward to v2 — both again in sync
    store.getState().redo()
    const s2 = store.getState()
    expect((s2.curves[0].controlPoints[0] as { x: number }).x).toBe(100)
    expect((s2.phMetadata.get('ph1') as { uControlPoints: number[] }).uControlPoints[0]).toBe(2)
  })
})
