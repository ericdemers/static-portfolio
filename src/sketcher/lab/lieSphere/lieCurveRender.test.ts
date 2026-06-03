// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { createABPHFromTwoPoints, evaluateABPHCurveAtParam } from '../../optimizer/abPHCurve'
import { evaluateCurve } from '../../utils/bspline/core'
import { abPHToLieCurve, identity5, scaling5, offset5, compose5 } from './lieCurve2D'

// The OUTPUT curve (a fitted rational NURBS) must RENDER correctly — i.e.
// evaluateCurve on the produced control points/knots reproduces the transform.
// (Regression: the un-reduced degree-44 form rendered as garbage even at identity.)
const meta = createABPHFromTwoPoints(0, 0, 100, 40).metadata
const U = [0.07, 0.2, 0.35, 0.5, 0.65, 0.8, 0.93]

function asCurve(res) {
  return { kind: 'rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false }
}
const close = (a, b, t = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(t)

describe('abPHToLieCurve renders correctly', () => {
  it('identity output coincides with the original curve', () => {
    const c = asCurve(abPHToLieCurve(meta, identity5()))
    for (const u of U) {
      const got = evaluateCurve(c, u)
      const exp = evaluateABPHCurveAtParam(meta, u)
      close(got.x, exp.x); close(got.y, exp.y)
    }
  })

  it('scaling output = λ · original', () => {
    const l = 1.6
    const c = asCurve(abPHToLieCurve(meta, scaling5(l)))
    for (const u of U) {
      const got = evaluateCurve(c, u)
      const p = evaluateABPHCurveAtParam(meta, u)
      close(got.x, l * p.x); close(got.y, l * p.y)
    }
  })

  it('output degree is 2n', () => {
    expect(abPHToLieCurve(meta, compose5(scaling5(1.3), offset5(10))).degree).toBe(2 * meta.degree)
  })
})
