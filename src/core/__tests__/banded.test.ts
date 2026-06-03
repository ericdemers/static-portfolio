import { describe, it, expect } from 'vitest'
import { symBandZero, symBandAdd, symBandAddDiag, ldlFactorBand, ldlSolveBand } from '../banded'
import { luFactor, luSolve, type Matrix } from '../linalg'

// Build a random symmetric banded SPD matrix (both as a band and as a dense
// matrix) and check the banded LDLᵀ solve matches the dense LU solve.
function makeSystem(n: number, b: number, seed: number) {
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
  const band = symBandZero(n, b)
  const dense: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let p = 1; p <= Math.min(b, i); p++) {
      const v = (rand() * 2 - 1) * 0.5
      symBandAdd(band, i, i - p, v)
      dense[i][i - p] = v
      dense[i - p][i] = v
    }
  }
  // Diagonal dominant → SPD.
  for (let i = 0; i < n; i++) {
    let rowAbs = 0
    for (let j = 0; j < n; j++) rowAbs += Math.abs(dense[i][j])
    const diag = rowAbs + 1 + rand()
    symBandAddDiag(band, i, diag)
    dense[i][i] += diag
  }
  const rhs = Array.from({ length: n }, () => rand() * 10 - 5)
  return { band, dense, rhs }
}

describe('symmetric banded LDLᵀ', () => {
  it('matches the dense LU solve across sizes and bandwidths', () => {
    for (const [n, b, seed] of [
      [10, 2, 1],
      [30, 4, 2],
      [50, 6, 3],
      [80, 3, 4],
      [120, 8, 5],
    ] as const) {
      const { band, dense, rhs } = makeSystem(n, b, seed)
      const ok = ldlFactorBand(band)
      expect(ok).toBe(true)
      const xBand = ldlSolveBand(band, rhs)
      const xDense = luSolve(luFactor(dense)!, rhs)
      let maxErr = 0
      for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(xBand[i] - xDense[i]))
      expect(maxErr).toBeLessThan(1e-7)
    }
  })

  it('reports non-positive-definite via a zero pivot', () => {
    const m = symBandZero(3, 1)
    symBandAddDiag(m, 0, 1)
    symBandAddDiag(m, 1, 0) // zero pivot
    symBandAddDiag(m, 2, 1)
    expect(ldlFactorBand(m)).toBe(false)
  })
})
