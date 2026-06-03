import { describe, it, expect } from 'vitest'
import { openCurvatureExtremaParameters, curvatureExtremaNumeratorPlanar } from '../index'

// openCurvatureExtremaParameters must be ACCURATE — it replaces the legacy
// coefficient-root finder that reported spurious extra markers on fine-knotted
// curves (a user saw "S" tick up to a count exceeding the bound S⁻, which is
// impossible for one g). Guarantees: the count never exceeds S⁻ (variation
// diminishing), and matches a dense reference scan.

const sc = (x: number[], y: number[], knots: number[], degree: number) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

const denseZeros = (x: number[], y: number[], knots: number[], degree: number) => {
  const g = curvatureExtremaNumeratorPlanar(x, y, knots, degree)
  const tMin = knots[degree]
  const tMax = knots[knots.length - 1 - degree]
  let c = 0, p = 0
  const M = 20000
  for (let i = 0; i <= M; i++) {
    const v = g.evaluate(tMin + ((tMax - tMin) * i) / M)
    if (v > 0) { if (p < 0) c++; p = 1 } else if (v < 0) { if (p > 0) c++; p = -1 }
  }
  return c
}

describe('openCurvatureExtremaParameters is accurate (no spurious markers)', () => {
  it('degree-4 case the legacy solver over-counted (3) is actually 2', () => {
    const knots = [0, 0, 0, 0, 0, 0.3328777416332348, 0.6094765740471917, 1, 1, 1, 1, 1]
    const cps = [[-205.61935531147478, 56.76648687530698], [-208.90321156679815, 33.01824844771824], [-203.7717348514653, -19.35821511666481], [-134.8098434753042, -107.01703834610959], [-46.784982343775255, -163.25937233181097], [32.23480927375857, -189.56096471014095], [186.9824183189131, -209.2646307544952]]
    const x = cps.map((p) => p[0]), y = cps.map((p) => p[1])
    const params = openCurvatureExtremaParameters(x, y, knots, 4)
    expect(params.length).toBe(2)
    expect(params.length).toBeLessThanOrEqual(sc(x, y, knots, 4)) // ≤ S⁻
    expect(params.length).toBe(denseZeros(x, y, knots, 4))
  })

  it('count never exceeds the bound S⁻ across random open cubics', () => {
    const degree = 3
    const knots = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
    let st = 7
    const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 0x100000000 }
    for (let t = 0; t < 200; t++) {
      const x = Array.from({ length: 7 }, (_, i) => i * 60 + (rand() * 2 - 1) * 40)
      const y = Array.from({ length: 7 }, () => (rand() * 2 - 1) * 200)
      const n = openCurvatureExtremaParameters(x, y, knots, degree).length
      expect(n).toBeLessThanOrEqual(sc(x, y, knots, degree))
    }
  })
})
