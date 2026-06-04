import { describe, it, expect } from 'vitest'
import { createABPHFromTwoPoints } from '../../optimizer/abPHCurve'
import { fitComplexRational, evalComplexRational } from './rationalFit'
import { lieCurveHomogeneous } from './lieCurve2D'
import { SHAPE_GENERATORS, liePoint5, expm5 } from './lieAlgebra2D'

const meta = createABPHFromTwoPoints(0, 0, 100, 40).metadata
const n = meta.degree
const U = [0.1, 0.3, 0.5, 0.7, 0.9]
const idx = (key: string) => SHAPE_GENERATORS.findIndex((g) => g.key === key)
function coeffsWith(key: string, v: number) { const c = new Array(8).fill(0); c[idx(key)] = v; return c }
function pt(M: number[][], u: number) { const h = lieCurveHomogeneous(meta, M); const w = h.W.evaluate(u); return { x: h.X.evaluate(u) / w, y: h.Y.evaluate(u) / w } }
function orig(u: number) { return pt(expm5(SHAPE_GENERATORS[0].X.map((r) => r.map(() => 0))), u) } // identity
const close = (a: number, b: number, t = 1e-5) => expect(Math.abs(a - b)).toBeLessThan(t)

describe('o(3,2) generators', () => {
  it('scale generator scales the point by e^s', () => {
    const s = 0.4, k = Math.exp(s)
    for (const u of U) { const g = pt(liePoint5(coeffsWith('scale', s)), u); const p = orig(u); close(g.x, k * p.x); close(g.y, k * p.y) }
  })

  it('rotation generator rotates the point (by ±θ)', () => {
    const th = 0.5
    // exp(θ·X_{23}) is a rotation; check the magnitude is preserved and the angle changed by ±θ.
    for (const u of U) {
      const g = pt(liePoint5(coeffsWith('rotation', th)), u); const p = orig(u)
      close(Math.hypot(g.x, g.y), Math.hypot(p.x, p.y)) // rotation preserves radius
      const dAng = Math.atan2(g.y, g.x) - Math.atan2(p.y, p.x)
      close(Math.cos(dAng), Math.cos(th)) // angle change is ±θ
    }
  })

  it('each of the 8 generators alone yields a curve of degree ≤ 2n', () => {
    for (const gen of SHAPE_GENERATORS) {
      const M = liePoint5(coeffsWith(gen.key, gen.key === 'offset' || gen.key.startsWith('boost') ? 8 : 0.3))
      const samples = U.concat([0.2, 0.4, 0.6, 0.8, 0.15, 0.35, 0.55, 0.75, 0.95, 0.05]).map((u) => ({ u, re: pt(M, u).x, im: pt(M, u).y }))
      let found = -1
      for (let d = 1; d <= 16; d++) {
        const c = fitComplexRational(samples, d)
        let err = 0
        for (const u of [0.12, 0.37, 0.63, 0.88]) { const e = evalComplexRational(c, u); const p = pt(M, u); err = Math.max(err, Math.hypot(e.re - p.x, e.im - p.y)) }
        if (err < 1e-5) { found = d; break }
      }
      expect(found).toBeGreaterThan(0)
      expect(found).toBeLessThanOrEqual(2 * n)
    }
  })
})
