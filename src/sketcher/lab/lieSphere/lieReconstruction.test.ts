import { describe, it, expect } from 'vitest'
import { createABPHFromTwoPoints } from '../../optimizer/abPHCurve'
import { abPHToLieCurve, identity5, rotation5, scaling5, offset5, translation5, compose5, type Mat5 } from './lieCurve2D'
import { evaluateCurve } from '../../utils/bspline/core'
import type { Curve } from '../../types/curve'

/**
 * The Lie-sphere image of a PH curve is reconstructed (quadric lift → transform →
 * read back → fit) as a degree-2n real rational NURBS. Two properties matter:
 *
 *  - POSITIVE WEIGHTS / clean polygon. A direct least-squares fit at the inflated
 *    2n is non-unique (arbitrary common factor → negative weights). We instead fit
 *    at the DETECTED minimal degree (unique, positive) and degree-ELEVATE back to
 *    2n (unique, positivity-preserving), then normalize weights. So the polygon is
 *    convex-hull-respecting for any transform.
 *
 *  - EQUIVARIANCE. The pipeline must commute with Euclidean motions: a rotated
 *    curve = the rotated identity curve. This checks the quadric round-trip is
 *    correct (a conformal transform = the identity reconstruction, rotated).
 */
const meta = createABPHFromTwoPoints(0, 0, 100, 40).metadata
const TARGET = 2 * meta.degree

const asCurve = (M: Mat5): Curve => {
  const r = abPHToLieCurve(meta, M)
  return { id: 't', kind: 'rational', degree: r.degree, knots: r.knots, controlPoints: r.controlPoints, closed: false }
}

describe('Lie-curve reconstruction: clean polygon + equivariance', () => {
  it('every transform gives a degree-2n NURBS with positive weights', () => {
    const transforms: [string, Mat5][] = [
      ['identity', identity5()],
      ['rotation', rotation5(0.7)],
      ['scale', scaling5(1.6)],
      ['translate', translation5(30, -20)],
      ['offset', offset5(0.5)],
      ['offset∘rot∘scale', compose5(offset5(0.4), rotation5(0.5), scaling5(1.2))],
    ]
    for (const [name, M] of transforms) {
      const r = abPHToLieCurve(meta, M)
      expect(r.degree, name).toBe(TARGET)
      const w = (r.controlPoints as { x: number; y: number; w: number }[])
      expect(w.every((p) => p.w > 0), `${name}: all weights > 0`).toBe(true)
      expect(w.every((p) => isFinite(p.x) && isFinite(p.y) && isFinite(p.w)), `${name}: finite`).toBe(true)
    }
  })

  it('rotation equivariance: abPHToLieCurve(R) = R · abPHToLieCurve(identity)', () => {
    const theta = 0.7
    const c = Math.cos(theta), s = Math.sin(theta)
    const idC = asCurve(identity5())
    const rotC = asCurve(rotation5(theta))
    let maxErr = 0
    for (let k = 0; k <= 40; k++) {
      const u = k / 40
      const p = evaluateCurve(idC, u)
      const rp = { x: p.x * c - p.y * s, y: p.x * s + p.y * c } // rotate the identity curve
      const q = evaluateCurve(rotC, u)
      maxErr = Math.max(maxErr, Math.hypot(rp.x - q.x, rp.y - q.y))
    }
    // Curve spans ~100 units; the round-trip + fit reproduce the rotated identity
    // to well under 1% (rotation is conformal, so it preserves the parameterization).
    expect(maxErr).toBeLessThan(1)
  })
})
