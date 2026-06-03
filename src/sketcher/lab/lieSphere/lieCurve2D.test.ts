// @ts-nocheck
import { describe, it, expect } from 'vitest'
import { createABPHFromTwoPoints, evaluateABPHCurveAtParam } from '../../optimizer/abPHCurve'
import { decomposeToBernstein } from '../../optimizer/algebra'
import { lieCurveHomogeneous, identity5, scaling5, rotation5, offset5 } from './lieCurve2D'

// Validate the planar Lie-sphere converter against closed-form oracles:
//  identity → original;  scaling → λ·point;  rotation → rotated point;
//  offset → point + d·N (the genuinely-Lie case, exercises the tangent/normal path).

const meta = createABPHFromTwoPoints(0, 0, 100, 40).metadata
const SAMPLES = [0.05, 0.2, 0.4, 0.5, 0.6, 0.8, 0.95]

// transformed point via the converter: (X/W, Y/W) by direct BD evaluation.
function lieAt(M, t) {
  const h = lieCurveHomogeneous(meta, M)
  const w = h.W.evaluate(t)
  return { x: h.X.evaluate(t) / w, y: h.Y.evaluate(t) / w }
}

// offset direction N = i·S²·B̄ / (B·σ) at t (exactly the lift's normal & the offset oracle).
function normalAt(t) {
  const u = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs }).evaluate(t)
  const v = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs }).evaluate(t)
  const bRe = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs }).evaluate(t)
  const bIm = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs }).evaluate(t)
  const Sr = u * u - v * v, Si = 2 * u * v // S²
  const sigma = u * u + v * v // |S|²
  const W = bRe * bRe + bIm * bIm
  // num = i·S²·B̄
  const numRe = Sr * bIm - Si * bRe
  const numIm = Sr * bRe + Si * bIm
  // N = num / (B·σ)
  return { nx: (numRe * bRe + numIm * bIm) / (sigma * W), ny: (numIm * bRe - numRe * bIm) / (sigma * W) }
}

const close = (a, b, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('planar Lie-sphere curve converter (exact, symbolic Bernstein)', () => {
  it('identity reproduces the original curve', () => {
    for (const t of SAMPLES) {
      const got = lieAt(identity5(), t)
      const exp = evaluateABPHCurveAtParam(meta, t)
      close(got.x, exp.x); close(got.y, exp.y)
    }
  })

  it('scaling by λ scales the point by λ', () => {
    const l = 1.7
    for (const t of SAMPLES) {
      const got = lieAt(scaling5(l), t)
      const p = evaluateABPHCurveAtParam(meta, t)
      close(got.x, l * p.x); close(got.y, l * p.y)
    }
  })

  it('rotation by θ rotates the point', () => {
    const th = 0.6, c = Math.cos(th), s = Math.sin(th)
    for (const t of SAMPLES) {
      const got = lieAt(rotation5(th), t)
      const p = evaluateABPHCurveAtParam(meta, t)
      close(got.x, c * p.x - s * p.y); close(got.y, s * p.x + c * p.y)
    }
  })

  it('offset (genuinely-Lie) matches point + d·N', () => {
    const d = 12
    for (const t of SAMPLES) {
      const got = lieAt(offset5(d), t)
      const p = evaluateABPHCurveAtParam(meta, t)
      const N = normalAt(t)
      close(got.x, p.x + d * N.nx, 1e-5); close(got.y, p.y + d * N.ny, 1e-5)
    }
  })
})
