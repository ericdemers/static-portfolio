import { describe, it, expect } from 'vitest'
import { createStraightABPH, evaluateABPHCurveAtParam } from '../../optimizer/abPHCurve'
import { abPHToLieCurve, lieCurveHomogeneous, identity5 } from './lieCurve2D'

describe('straight-line PH curve', () => {
  const meta = createStraightABPH(10, 20, 110, 60).metadata
  it('evaluates exactly on the line P0→P1', () => {
    for (const t of [0, 0.15, 0.4, 0.5, 0.73, 1]) {
      const p = evaluateABPHCurveAtParam(meta, t)
      expect(Math.abs(p.x - (10 + 100 * t))).toBeLessThan(1e-9)
      expect(Math.abs(p.y - (20 + 40 * t))).toBeLessThan(1e-9)
    }
  })
  it('works in the Lie converter (identity = the line)', () => {
    const h = lieCurveHomogeneous(meta, identity5())
    for (const t of [0.2, 0.5, 0.8]) {
      const w = h.W.evaluate(t)
      expect(Math.abs(h.X.evaluate(t) / w - (10 + 100 * t))).toBeLessThan(1e-6)
      expect(Math.abs(h.Y.evaluate(t) / w - (20 + 40 * t))).toBeLessThan(1e-6)
    }
    expect(abPHToLieCurve(meta, identity5()).degree).toBe(2 * meta.degree)
  })
})
