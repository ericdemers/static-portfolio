// Dense linear algebra for the optimizer's KKT solves. Systems are small
// (a few dozen unknowns for ~15 control points), so a dense LU with partial
// pivoting is both robust (handles the symmetric-indefinite KKT matrix) and
// fast enough for interactive editing.

export type Matrix = number[][]

export interface LU {
  lu: number[][]
  piv: number[]
}

/** LU factorization with partial pivoting. Returns null if (near-)singular. */
export function luFactor(A: Matrix): LU | null {
  const n = A.length
  const lu = A.map((row) => [...row])
  const piv = Array.from({ length: n }, (_, i) => i)

  for (let k = 0; k < n; k++) {
    let p = k
    let max = Math.abs(lu[k][k])
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i][k])
      if (v > max) {
        max = v
        p = i
      }
    }
    if (max < 1e-300) return null
    if (p !== k) {
      const tmp = lu[k]
      lu[k] = lu[p]
      lu[p] = tmp
      const t = piv[k]
      piv[k] = piv[p]
      piv[p] = t
    }
    const pivot = lu[k][k]
    for (let i = k + 1; i < n; i++) {
      const f = lu[i][k] / pivot
      lu[i][k] = f
      for (let j = k + 1; j < n; j++) lu[i][j] -= f * lu[k][j]
    }
  }
  return { lu, piv }
}

/** Solve A·x = b using a precomputed LU factorization. */
export function luSolve(fact: LU, b: number[]): number[] {
  const { lu, piv } = fact
  const n = lu.length
  const y = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let s = b[piv[i]]
    for (let j = 0; j < i; j++) s -= lu[i][j] * y[j]
    y[i] = s
  }
  const x = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let j = i + 1; j < n; j++) s -= lu[i][j] * x[j]
    x[i] = s / lu[i][i]
  }
  return x
}
