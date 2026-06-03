import { describe, it, expect } from 'vitest'
import { curvatureExtremaNumeratorPlanarPeriodic, slideCurve } from '../index'

const degree = 3
const knots = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]
// Irregular closed hexagon (scaled to the optimizer's tolerance range; perturbed
// to avoid exact-zero g coefficients at symmetry points).
const cpX = [200, 110, -90, -210, -100, 95]
const cpY = [10, 175, 165, 5, -180, -160]
const boundOf = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanarPeriodic(x, y, knots, degree).signChanges()

describe('periodic (closed) curvature sliding', () => {
  it('rigid closed drag preserves the exact g sign pattern', () => {
    const before = boundOf(cpX, cpY)
    const { x, y } = slideCurve(cpX, cpY, knots, degree, 0, cpX[0] + 30, cpY[0] + 25, {
      closed: true,
      disableSliding: true,
    })
    expect(boundOf(x, y)).toBe(before)
  })

  it('closed sliding follows the drag and keeps the bound non-increasing', () => {
    const before = boundOf(cpX, cpY)
    const tx = cpX[0] + 70
    const ty = cpY[0] + 50
    const { x, y } = slideCurve(cpX, cpY, knots, degree, 0, tx, ty, { closed: true })
    expect(boundOf(x, y)).toBeLessThanOrEqual(before)
    const distBefore = Math.hypot(cpX[0] - tx, cpY[0] - ty)
    const distAfter = Math.hypot(x[0] - tx, y[0] - ty)
    expect(distAfter).toBeLessThan(distBefore)
  })
})
