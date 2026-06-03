// @ts-nocheck — the minimal rational degree of a Lie-transformed PH curve stays ≤ 2n
// (the classic PH-offset bound). Confirms a degree-2n fit always suffices and the
// symbolic lift's high degree is pure removable redundancy.
import { describe, it, expect } from 'vitest'
import { createABPHFromTwoPoints } from '../../optimizer/abPHCurve'
import { fitComplexRational, evalComplexRational } from './rationalFit'
import { lieCurveHomogeneous, identity5, scaling5, rotation5, offset5, compose5 } from './lieCurve2D'

const meta = createABPHFromTwoPoints(0, 0, 100, 40).metadata
const n = meta.degree

// Exact transformed point (X/W, Y/W) at parameter u, via the symbolic converter.
function exactPoint(M, u) {
  const h = lieCurveHomogeneous(meta, M)
  const w = h.W.evaluate(u)
  return { re: h.X.evaluate(u) / w, im: h.Y.evaluate(u) / w }
}

// Minimal complex-rational degree (residual-drop detection, like the lab's detectDegU).
function detectDegree(M) {
  const fitU = Array.from({ length: 60 }, (_, i) => (i + 0.5) / 60) // fit samples
  const testU = Array.from({ length: 41 }, (_, i) => 0.01 + (0.98 * i) / 40) // dense test
  const samples = fitU.map((u) => ({ u, ...exactPoint(M, u) }))
  for (let d = 1; d <= 16; d++) {
    let c
    try { c = fitComplexRational(samples, d) } catch { continue }
    let maxErr = 0
    for (const u of testU) {
      const got = evalComplexRational(c, u)
      const exp = exactPoint(M, u)
      maxErr = Math.max(maxErr, Math.hypot(got.re - exp.re, got.im - exp.im))
    }
    if (maxErr < 1e-6) return { degree: d, residual: maxErr }
  }
  return { degree: -1, residual: Infinity } // not found ≤16
}

describe('minimal degree of Lie-transformed PH curve', () => {
  const cases = {
    identity: identity5(),
    scale: scaling5(1.7),
    rotation: rotation5(0.6),
    offset: offset5(15),
    'scale∘rotation': compose5(scaling5(1.7), rotation5(0.6)),
    'offset∘scale': compose5(offset5(15), scaling5(1.7)),
    'offset∘rotation∘scale': compose5(offset5(15), rotation5(0.6), scaling5(1.7)),
    'offset∘offset': compose5(offset5(15), offset5(-8)),
  }
  for (const [name, M] of Object.entries(cases)) {
    it(`${name}: minimal degree ≤ 2n (= ${2 * n})`, () => {
      const r = detectDegree(M)
      expect(r.degree).toBeGreaterThan(0) // a finite minimal degree was found ≤16
      expect(r.degree).toBeLessThanOrEqual(2 * n)
    })
  }
})
