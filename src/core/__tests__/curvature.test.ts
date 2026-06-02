import { describe, it, expect } from 'vitest'
import type { Point2D } from '../types'
import {
  evaluate,
  plainCoeffs,
  decomposeToBernstein,
  curvatureExtremaNumeratorPlanar,
  inflectionNumeratorPlanar,
} from '../index'

const DEG = 3
const knots = [0, 0, 0, 0, 1, 1, 1, 1] // single Bézier segment → smooth FD
const x = [0, 1, 3, 4]
const y = [0, 3, -1, 1]
const pts: Point2D[] = x.map((xi, i) => ({ x: xi, y: y[i] }))

describe('planar curvature numerators', () => {
  it('g(t) equals the κ′ numerator formula evaluated from the derivative functions', () => {
    const g = curvatureExtremaNumeratorPlanar(x, y, knots, DEG)
    expect(g.degree).toBe(4 * DEG - 6)

    const x1 = decomposeToBernstein(x, knots, DEG).derivative()
    const y1 = decomposeToBernstein(y, knots, DEG).derivative()
    const x2 = x1.derivative()
    const y2 = y1.derivative()
    const x3 = x2.derivative()
    const y3 = y2.derivative()

    for (let i = 1; i < 40; i++) {
      const t = i / 40
      const x1v = x1.evaluate(t), y1v = y1.evaluate(t)
      const x2v = x2.evaluate(t), y2v = y2.evaluate(t)
      const x3v = x3.evaluate(t), y3v = y3.evaluate(t)
      const num =
        (x1v * x1v + y1v * y1v) * (x1v * y3v - y1v * x3v) -
        3 * (x1v * x2v + y1v * y2v) * (x1v * y2v - y1v * x2v)
      expect(Math.abs(g.evaluate(t) - num)).toBeLessThan(1e-7)
    }
  })

  it('g(t) matches finite differences of the actual curve (independent end-to-end)', () => {
    const g = curvatureExtremaNumeratorPlanar(x, y, knots, DEG)
    const c = (t: number) => evaluate(plainCoeffs, pts, DEG, knots, t)
    const h = 1e-3
    const d1 = (t: number) => {
      const a = c(t + h), b = c(t - h)
      return { x: (a.x - b.x) / (2 * h), y: (a.y - b.y) / (2 * h) }
    }
    const d2 = (t: number) => {
      const a = c(t + h), m = c(t), b = c(t - h)
      return { x: (a.x - 2 * m.x + b.x) / (h * h), y: (a.y - 2 * m.y + b.y) / (h * h) }
    }
    const d3 = (t: number) => {
      const a = c(t + 2 * h), b = c(t + h), d = c(t - h), e = c(t - 2 * h)
      return {
        x: (a.x - 2 * b.x + 2 * d.x - e.x) / (2 * h * h * h),
        y: (a.y - 2 * b.y + 2 * d.y - e.y) / (2 * h * h * h),
      }
    }
    for (let i = 2; i <= 8; i++) {
      const t = i / 10
      const c1 = d1(t), c2 = d2(t), c3 = d3(t)
      const num =
        (c1.x * c1.x + c1.y * c1.y) * (c1.x * c3.y - c1.y * c3.x) -
        3 * (c1.x * c2.x + c1.y * c2.y) * (c1.x * c2.y - c1.y * c2.x)
      const rel = Math.abs(g.evaluate(t) - num) / (1 + Math.abs(num))
      expect(rel).toBeLessThan(1e-3)
    }
  })

  it('inflection numerator equals c′ × c″', () => {
    const f = inflectionNumeratorPlanar(x, y, knots, DEG)
    expect(f.degree).toBe(2 * DEG - 3)
    const x1 = decomposeToBernstein(x, knots, DEG).derivative()
    const y1 = decomposeToBernstein(y, knots, DEG).derivative()
    const x2 = x1.derivative()
    const y2 = y1.derivative()
    for (let i = 1; i < 30; i++) {
      const t = i / 30
      const expected = x1.evaluate(t) * y2.evaluate(t) - y1.evaluate(t) * x2.evaluate(t)
      expect(Math.abs(f.evaluate(t) - expected)).toBeLessThan(1e-9)
    }
  })
})
