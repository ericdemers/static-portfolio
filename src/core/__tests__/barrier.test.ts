import { describe, it, expect } from 'vitest'
import { slideCurve, curvatureExtremaNumeratorPlanar, planarCurvatureConstraintState } from '../index'

// The banded barrier optimizer must be a drop-in equivalent of the dense
// primal-dual: preserve the curvature-extrema bound and track the drag at least
// as well, on representative open curves.

const degree = 3

function clampedKnots(n: number) {
  const k: number[] = []
  for (let i = 0; i <= degree; i++) k.push(0)
  const internal = n - degree - 1
  for (let i = 1; i <= internal; i++) k.push(i / (internal + 1))
  for (let i = 0; i <= degree; i++) k.push(1)
  return k
}
const sc = (x: number[], y: number[], knots: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

describe('banded barrier optimizer', () => {
  const cases = [
    {
      name: 'wavy 9-CP',
      x: Array.from({ length: 9 }, (_, i) => i * 50),
      y: Array.from({ length: 9 }, (_, i) => 120 * Math.sin(i * 1.1)),
    },
    {
      name: '7-CP arc',
      x: [262, -104, -277, -508, -320, 10, 260],
      y: [119, 128, 141, 57, -195, -190, -55],
    },
  ]

  for (const c of cases) {
    const knots = clampedKnots(c.x.length)
    const before = sc(c.x, c.y, knots)
    const cs = planarCurvatureConstraintState(c.x, c.y, knots, degree)
    const idx = 3
    const tx = c.x[idx] + 70
    const ty = c.y[idx] - 50

    const pd = slideCurve(c.x, c.y, knots, degree, idx, tx, ty, { method: 'primal-dual', maxIterations: 20, dragWeight: 25, constraintState: cs })
    const ba = slideCurve(c.x, c.y, knots, degree, idx, tx, ty, { method: 'barrier', maxIterations: 40, dragWeight: 25, constraintState: cs })

    it(`${c.name}: barrier preserves the bound`, () => {
      expect(sc(ba.x, ba.y, knots)).toBeLessThanOrEqual(before)
    })

    it(`${c.name}: barrier tracks the drag at least as well as primal-dual`, () => {
      const dPD = Math.hypot(pd.x[idx] - tx, pd.y[idx] - ty)
      const dBA = Math.hypot(ba.x[idx] - tx, ba.y[idx] - ty)
      expect(dBA).toBeLessThanOrEqual(dPD + 8)
    })

    it(`${c.name}: barrier and primal-dual land the dragged point close`, () => {
      const sep = Math.hypot(pd.x[idx] - ba.x[idx], pd.y[idx] - ba.y[idx])
      expect(sep).toBeLessThan(30)
    })
  }
})
