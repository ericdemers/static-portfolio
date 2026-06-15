import { describe, it, expect } from 'vitest'
import { BernsteinDecomposition } from '../../optimizer/algebra'
import { analyzePH3D, ph3dPolynomials, defaultPH3D, type Vec3 } from './ph3dCurve'

const TS = [0.0, 0.13, 0.27, 0.41, 0.5, 0.66, 0.78, 0.9, 1.0]

function evalBezier(cps: Vec3[], t: number): Vec3 {
  // de Casteljau on the 6 control points
  let xs = cps.map((c) => c.x)
  let ys = cps.map((c) => c.y)
  let zs = cps.map((c) => c.z)
  for (let r = 1; r < cps.length; r++) {
    const nx: number[] = [], ny: number[] = [], nz: number[] = []
    for (let i = 0; i < xs.length - 1; i++) {
      nx.push((1 - t) * xs[i] + t * xs[i + 1])
      ny.push((1 - t) * ys[i] + t * ys[i + 1])
      nz.push((1 - t) * zs[i] + t * zs[i + 1])
    }
    xs = nx; ys = ny; zs = nz
  }
  return { x: xs[0], y: ys[0], z: zs[0] }
}

describe('spatial PH quintic math core', () => {
  const { a0, a1, a2, origin } = defaultPH3D()

  it('satisfies the PH identity σ² = ‖r′‖² exactly', () => {
    const { hx, hy, hz, sigma } = ph3dPolynomials(a0, a1, a2)
    for (const t of TS) {
      const x = hx.evaluate(t), y = hy.evaluate(t), z = hz.evaluate(t)
      const speedSq = x * x + y * y + z * z
      const sig = sigma.evaluate(t)
      expect(sig).toBeCloseTo(Math.sqrt(speedSq), 9) // σ = |r′|
    }
  })

  it('arc length equals the numeric integral of σ', () => {
    const a = analyzePH3D(a0, a1, a2, origin)
    const { sigma } = ph3dPolynomials(a0, a1, a2)
    // fine trapezoidal rule on σ
    const N = 20000
    let s = 0
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N
      s += 0.5 * (sigma.evaluate(t0) + sigma.evaluate(t1)) * (t1 - t0)
    }
    expect(a.arcLength).toBeCloseTo(s, 6)
  })

  it('control points reproduce the sampled curve points', () => {
    const a = analyzePH3D(a0, a1, a2, origin)
    for (const t of TS) {
      const fromCP = evalBezier(a.controlPoints, t)
      // find nearest sample param
      const idx = Math.round(t * (a.params.length - 1))
      expect(fromCP.x).toBeCloseTo(a.points[idx].x, 9)
      expect(fromCP.y).toBeCloseTo(a.points[idx].y, 9)
      expect(fromCP.z).toBeCloseTo(a.points[idx].z, 9)
    }
  })

  it('curvature matches a finite-difference Frenet computation', () => {
    const a = analyzePH3D(a0, a1, a2, origin)
    const h = 1e-4
    for (const t of TS) {
      if (t < 0.05 || t > 0.95) continue // skip endpoints for FD stability
      const pm = evalBezier(a.controlPoints, t - h)
      const p0 = evalBezier(a.controlPoints, t)
      const pp = evalBezier(a.controlPoints, t + h)
      // r', r'' via central differences
      const d1: Vec3 = { x: (pp.x - pm.x) / (2 * h), y: (pp.y - pm.y) / (2 * h), z: (pp.z - pm.z) / (2 * h) }
      const d2: Vec3 = { x: (pp.x - 2 * p0.x + pm.x) / (h * h), y: (pp.y - 2 * p0.y + pm.y) / (h * h), z: (pp.z - 2 * p0.z + pm.z) / (h * h) }
      const cx = d1.y * d2.z - d1.z * d2.y
      const cy = d1.z * d2.x - d1.x * d2.z
      const cz = d1.x * d2.y - d1.y * d2.x
      const speed = Math.sqrt(d1.x * d1.x + d1.y * d1.y + d1.z * d1.z)
      const kappaFD = Math.sqrt(cx * cx + cy * cy + cz * cz) / (speed * speed * speed)

      const idx = Math.round(t * (a.params.length - 1))
      expect(a.curvatureSamples[idx]).toBeCloseTo(kappaFD, 4)
    }
  })

  it('P_max(t) equals (κ_max² − κ(t)²)·σ⁶ and is ≥0 above the peak', () => {
    const a = analyzePH3D(a0, a1, a2, origin)
    const { sigma } = ph3dPolynomials(a0, a1, a2)
    const kappaMax = a.peakCurvature * 1.5
    const pMax = new BernsteinDecomposition([a.pMaxCoeffs(kappaMax)], [0, 1])
    for (const t of TS) {
      const sig = sigma.evaluate(t)
      const idx = Math.round(t * (a.params.length - 1))
      const kappa = a.curvatureSamples[idx]
      const expected = (kappaMax * kappaMax - kappa * kappa) * Math.pow(sig, 6)
      expect(pMax.evaluate(t)).toBeCloseTo(expected, 6)
      expect(pMax.evaluate(t)).toBeGreaterThanOrEqual(0)
    }
  })
})
