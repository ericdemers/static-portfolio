import { describe, it, expect } from 'vitest'
import {
  slideCurve,
  planarCurvatureConstraintState,
  curvatureExtremaNumeratorPlanar,
} from '../index'

// The sliding mechanism must FOLLOW the sign assignment fixed at drag start, not
// re-derive signs each frame. With a fixed constraint state carried across a
// chained drag, the bound S⁻ is preserved and a near-zero ("noise") coefficient
// can't flicker sign. Fixture: the curve whose leading g coefficient is at the
// floating-point noise floor (g(0) ~ 1e-5 next to ~1e14).

const degree = 3
const knots = [0, 0, 0, 0, 0.5, 1, 1, 1, 1]
const baseX = [-222.35247802418897, -109.85297098415901, 29.429420767030415, 203.4484242627635, 340.5164794921875]
const baseY = [52.57379150284148, -41.22672830286821, -31.175429342484758, -87.28703942089011, -213.9583282470703]
const sc = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, knots, degree).signChanges()

describe('fixed drag-start constraint state', () => {
  it('assigns a sign to every coefficient (none skipped) + scale + positions', () => {
    const cs = planarCurvatureConstraintState(baseX, baseY, knots, degree)
    const nCoeffs = curvatureExtremaNumeratorPlanar(baseX, baseY, knots, degree).flatCoeffs().length
    expect(cs.signs.length).toBe(nCoeffs)
    expect(cs.gScale.length).toBe(nCoeffs)
    expect(cs.grevilleAbscissae.length).toBe(nCoeffs)
    expect(cs.signs.every((s) => s === 1 || s === -1)).toBe(true) // every coeff has a definite sign
  })

  it('chained drag with the FIXED state never raises S⁻ (no noise flicker)', () => {
    const cs = planarCurvatureConstraintState(baseX, baseY, knots, degree)
    const before = sc(baseX, baseY)
    let cx = baseX.slice(), cy = baseY.slice()
    let st = 5
    const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 0x100000000 }
    for (let s = 0; s < 80; s++) {
      const tx = cx[3] + (rand() * 2 - 1) * 30
      const ty = cy[3] + (rand() * 2 - 1) * 30
      const r = slideCurve(cx, cy, knots, degree, 3, tx, ty, {
        maxIterations: 20,
        dragWeight: 25,
        constraintState: cs, // fixed at "drag start"
      })
      cx = r.x; cy = r.y
      expect(sc(cx, cy)).toBeLessThanOrEqual(before)
    }
  })
})
