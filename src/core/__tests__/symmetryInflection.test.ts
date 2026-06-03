import { describe, it, expect } from 'vitest'
import {
  slideCurve,
  curvatureExtremaNumeratorPlanarPeriodic,
  inflectionNumeratorPlanarPeriodic,
} from '../index'

// A symmetric closed "oval" (ellipse-ish): 8 control points, 2 axes of symmetry.
const a = 200
const b = 120
const s = 1 / Math.SQRT2
const cpX = [a, a * s, 0, -a * s, -a, -a * s, 0, a * s]
const cpY = [0, b * s, b, b * s, 0, -b * s, -b, -b * s]
const knots = [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8]
const degree = 3
// x-axis mirror (y → −y) and y-axis mirror (x → −x) index maps for this 8-gon.
const mapX = [0, 7, 6, 5, 4, 3, 2, 1]
const mapY = [4, 3, 2, 1, 0, 7, 6, 5]

const sc = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanarPeriodic(x, y, knots, degree).signChanges()
const inflSc = (x: number[], y: number[]) =>
  inflectionNumeratorPlanarPeriodic(x, y, knots, degree).signChanges()

describe('Oval: symmetry + inflection enforced inside the solve', () => {
  const before = sc(cpX, cpY)
  const inflBefore = inflSc(cpX, cpY)
  const { x, y } = slideCurve(cpX, cpY, knots, degree, 1, cpX[1] + 60, cpY[1] + 40, {
    closed: true,
    preserveInflections: true,
    symmetryMaps: { mapX, mapY },
    maxIterations: 60,
  })

  it('keeps both axes of symmetry exact', () => {
    for (let i = 0; i < x.length; i++) {
      // x-axis mirror: cp[mapX[i]] = (x_i, −y_i)
      expect(Math.abs(x[mapX[i]] - x[i])).toBeLessThan(1e-6)
      expect(Math.abs(y[mapX[i]] + y[i])).toBeLessThan(1e-6)
      // y-axis mirror: cp[mapY[i]] = (−x_i, y_i)
      expect(Math.abs(x[mapY[i]] + x[i])).toBeLessThan(1e-6)
      expect(Math.abs(y[mapY[i]] - y[i])).toBeLessThan(1e-6)
    }
  })

  it('keeps the curvature-extrema bound non-increasing', () => {
    expect(sc(x, y)).toBeLessThanOrEqual(before)
  })

  it('keeps the inflection bound non-increasing', () => {
    expect(inflSc(x, y)).toBeLessThanOrEqual(inflBefore)
  })

  it('follows the drag', () => {
    const dBefore = Math.hypot(cpX[1] - (cpX[1] + 60), cpY[1] - (cpY[1] + 40))
    const dAfter = Math.hypot(x[1] - (cpX[1] + 60), y[1] - (cpY[1] + 40))
    expect(dAfter).toBeLessThan(dBefore)
  })
})
