import { describe, it, expect } from 'vitest'
import { evaluate, scalarCoeffs, decomposeToBernstein, BernsteinDecomposition } from '../index'

const samples = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n)
const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

const DEG = 3
const knots = [0, 0, 0, 0, 0.4, 0.7, 1, 1, 1, 1] // interior knots → multiple spans
const f = [1, -2, 3, 0, -1, 2]
const g = [0.5, 1, -1, 2, 0.3, -0.5]

describe('BernsteinDecomposition — B-spline function algebra', () => {
  it('decompose reproduces the B-spline (vs Cox–de Boor evaluation)', () => {
    const bd = decomposeToBernstein(f, knots, DEG)
    for (const t of samples(40)) close(bd.evaluate(t), evaluate(scalarCoeffs, f, DEG, knots, t))
  })

  it('multiply = pointwise product', () => {
    const bf = decomposeToBernstein(f, knots, DEG)
    const bg = decomposeToBernstein(g, knots, DEG)
    const prod = bf.multiply(bg)
    expect(prod.degree).toBe(2 * DEG)
    for (const t of samples(40)) close(prod.evaluate(t), bf.evaluate(t) * bg.evaluate(t))
  })

  it('add / subtract = pointwise sum / difference', () => {
    const bf = decomposeToBernstein(f, knots, DEG)
    const bg = decomposeToBernstein(g, knots, DEG)
    for (const t of samples(30)) {
      close(bf.add(bg).evaluate(t), bf.evaluate(t) + bg.evaluate(t))
      close(bf.subtract(bg).evaluate(t), bf.evaluate(t) - bg.evaluate(t))
    }
  })

  it('multiply across differing degrees (f · f′)', () => {
    const bf = decomposeToBernstein(f, knots, DEG)
    const d = bf.derivative()
    const prod = bf.multiply(d)
    for (const t of samples(30)) close(prod.evaluate(t), bf.evaluate(t) * d.evaluate(t))
  })

  it('derivative matches central finite differences', () => {
    const bf = decomposeToBernstein(f, knots, DEG)
    const d = bf.derivative()
    const h = 1e-5
    for (const t of samples(20)) {
      if (t - h > 0 && t + h < 1) {
        close(d.evaluate(t), (bf.evaluate(t + h) - bf.evaluate(t - h)) / (2 * h), 1e-4)
      }
    }
  })

  it('signChanges counts strict sign changes, skipping zeros', () => {
    expect(new BernsteinDecomposition([[1, 0, -1, 2]], [0, 1]).signChanges()).toBe(2)
    expect(new BernsteinDecomposition([[1, 2, 3]], [0, 1]).signChanges()).toBe(0)
    expect(new BernsteinDecomposition([[-1, 1, -1, 1]], [0, 1]).signChanges()).toBe(3)
  })
})
