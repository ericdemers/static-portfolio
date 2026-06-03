// ============================================================================
// Symmetric banded linear algebra (LDLᵀ). The curvature optimizer's per-step
// system M = H + JᵀDJ is symmetric, positive-definite, and BANDED: H is
// diagonal, and the constraint Jacobian J is banded because each g Bernstein
// coefficient depends only on the d+1 control points supporting its span
// (B-spline locality). Factorizing a band of half-width b costs O(n·b²) — linear
// in the number of control points for fixed degree — versus O(n³) dense.
//
// Storage: the lower band only (M is symmetric). low[i][p] = M[i][i−p] for
// p = 0..b (p=0 is the diagonal; entries with i−p < 0 are absent/zero). After
// factorization in place: low[i][0] = D[i], low[i][p] = L[i][i−p] (p≥1).
// ============================================================================

export interface SymBand {
  n: number
  b: number
  /** low[i] has length b+1; low[i][p] = M[i][i−p] (p=0 diagonal). */
  low: Float64Array[]
}

export function symBandZero(n: number, b: number): SymBand {
  const low: Float64Array[] = new Array(n)
  for (let i = 0; i < n; i++) low[i] = new Float64Array(b + 1)
  return { n, b, low }
}

/** Add v to the symmetric entry (i,j). Stores into the lower triangle (i ≥ j). */
export function symBandAdd(M: SymBand, i: number, j: number, v: number): void {
  if (i < j) {
    const t = i
    i = j
    j = t
  }
  const p = i - j
  if (p <= M.b) M.low[i][p] += v
}

/** Add v to the diagonal entry (i,i). */
export function symBandAddDiag(M: SymBand, i: number, v: number): void {
  M.low[i][0] += v
}

/**
 * In-place LDLᵀ factorization of a symmetric banded matrix. Returns false if a
 * pivot is non-positive (not positive-definite within tolerance). O(n·b²).
 */
export function ldlFactorBand(M: SymBand, minPivot = 1e-300): boolean {
  const { n, b, low } = M
  for (let j = 0; j < n; j++) {
    let d = low[j][0]
    const pMaxJ = Math.min(b, j)
    for (let p = 1; p <= pMaxJ; p++) {
      const Ljk = low[j][p] // L[j][j−p]
      d -= Ljk * Ljk * low[j - p][0] // L[j][k]² · D[k]
    }
    if (!(Math.abs(d) > minPivot)) return false
    low[j][0] = d
    const iMax = Math.min(j + b, n - 1)
    for (let i = j + 1; i <= iMax; i++) {
      let s = low[i][i - j] // M[i][j]
      const kLo = Math.max(0, i - b)
      for (let k = kLo; k < j; k++) {
        const Lik = i - k <= b ? low[i][i - k] : 0
        if (Lik === 0) continue
        const Ljk = j - k <= b ? low[j][j - k] : 0
        if (Ljk === 0) continue
        s -= Lik * Ljk * low[k][0]
      }
      low[i][i - j] = s / d
    }
  }
  return true
}

/** Solve M x = rhs given an LDLᵀ-factored band (factor in place first). */
export function ldlSolveBand(M: SymBand, rhs: number[]): number[] {
  const { n, b, low } = M
  const x = rhs.slice()
  // Forward: L z = rhs.
  for (let i = 0; i < n; i++) {
    let s = x[i]
    const pMax = Math.min(b, i)
    for (let p = 1; p <= pMax; p++) s -= low[i][p] * x[i - p]
    x[i] = s
  }
  // Diagonal: D y = z.
  for (let i = 0; i < n; i++) x[i] /= low[i][0]
  // Backward: Lᵀ x = y.
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    const kMax = Math.min(i + b, n - 1)
    for (let k = i + 1; k <= kMax; k++) {
      if (k - i <= b) s -= low[k][k - i] * x[k]
    }
    x[i] = s
  }
  return x
}
