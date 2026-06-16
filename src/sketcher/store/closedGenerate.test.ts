import { describe, it, expect } from 'vitest'
import { useSceneStore } from './sceneStore'
import { fitClosedPHSpline } from '../optimizer/phClosedSplineFit'
import { createBSpline } from '../utils/bspline/utilities'
import { evaluateCurve } from '../utils/bspline/core'
import { SHAPE_GENERATORS } from '../lab/lieSphere/lieAlgebra2D'
import type { Curve, Point2D, PHMetadataAny } from '../types/curve'

function injectClosedPH(): string {
  const pts: Point2D[] = []
  for (let i = 0; i < 16; i++) { const a = (2 * Math.PI * i) / 16; pts.push({ x: 160 * Math.cos(a), y: 90 * Math.sin(a) }) }
  const bs = createBSpline(pts, 3, true) as { controlPoints: Point2D[]; degree: number; knots: number[] }
  const ph = fitClosedPHSpline(bs.controlPoints, bs.degree, bs.knots)!
  const id = 'closed-ph'
  const curve: Curve = { id, kind: 'bspline', degree: ph.degree, knots: ph.knots, controlPoints: ph.controlPoints, closed: true }
  useSceneStore.setState({ curves: [curve], phMetadata: new Map<string, PHMetadataAny>([[id, ph.metadata]]), selectedCurveId: id, generate: null })
  return id
}

const curveById = (id: string) => useSceneStore.getState().curves.find((c) => c.id === id)!
const isFinite2 = (c: Curve) => c.controlPoints.every((p) => Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { y: number }).y))
// Closure tolerance ~1e-3 (the Lie image is fit span-by-span, so the seam closes
// only to fit accuracy — here ~4e-6 on a ~320-unit curve).
const closes = (c: Curve) => { const a = evaluateCurve(c, 0), b = evaluateCurve(c, 1); return Math.hypot(a.x - b.x, a.y - b.y) < 1e-3 }

describe('Generate on a closed PH curve', () => {
  it('identity preview is a CLOSED rational matching the original geometry', () => {
    const id = injectClosedPH()
    const orig = curveById(id)
    useSceneStore.getState().startGenerate(id)
    const g = useSceneStore.getState().generate!
    const preview = curveById(g.previewCurveId)

    expect(preview.kind).toBe('rational')
    expect(preview.closed).toBe(true)
    expect(isFinite2(preview)).toBe(true)
    // Same shape as the source closed PH curve at the identity transform.
    for (let k = 0; k < 12; k++) {
      const t = k / 12
      const a = evaluateCurve(orig, t), b = evaluateCurve(preview, t)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-3)
    }
  })

  it('a Lie offset transform yields a finite CLOSED rational, committed by Done', () => {
    const id = injectClosedPH()
    useSceneStore.getState().startGenerate(id)
    const g = useSceneStore.getState().generate!

    const offsetIdx = SHAPE_GENERATORS.findIndex((s) => s.key === 'offset')
    expect(offsetIdx).toBeGreaterThanOrEqual(0)
    useSceneStore.getState().setGenerateCoeff(offsetIdx, 0.15)

    const preview = curveById(g.previewCurveId)
    expect(preview.kind).toBe('rational')
    expect(preview.closed).toBe(true)
    expect(isFinite2(preview)).toBe(true)
    expect(closes(preview)).toBe(true)

    // Done commits the preview as an independent closed curve; original untouched.
    const before = useSceneStore.getState().curves.length
    useSceneStore.getState().doneGenerate()
    expect(useSceneStore.getState().generate).toBeNull()
    expect(useSceneStore.getState().curves.length).toBe(before)
    const committed = curveById(g.previewCurveId)
    expect(committed.closed).toBe(true)
    expect(committed.kind).toBe('rational')
    expect(curveById(id).closed).toBe(true) // source still closed PH
  })
})
