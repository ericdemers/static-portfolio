/**
 * Sparse symmetric factorization for the primal-dual KKT system.
 *
 * The augmented matrix [H+δI, ∇hᵀ, ∇wᵀ; ∇h, -δI, 0; ∇w, 0, -W/Y-δI] is SYMMETRIC and
 * (with the δ regularization) QUASIDEFINITE — so an LDLᵀ with NO pivoting is stable
 * (Vanderbei) and introduces no fill beyond the band. We RCM-reorder to get a small
 * bandwidth, then banded LDLᵀ at O(N·band²) instead of dense O(N³).
 *
 * factorizeSym(M) once, solveSym(F, b) many times (Mehrotra needs two RHS).
 */
export interface SymFactor { perm: number[]; L: number[][]; D: number[]; band: number; N: number }

// Reverse Cuthill–McKee ordering from the sparsity pattern of symmetric M.
function rcm(M: number[][], tol: number): number[] {
  const N = M.length
  const adj: number[][] = Array.from({ length: N }, () => [])
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j && Math.abs(M[i][j]) > tol) adj[i].push(j)
  const deg = adj.map((a) => a.length)
  const seen = new Array(N).fill(false)
  const order: number[] = []
  while (order.length < N) {
    let start = -1
    for (let i = 0; i < N; i++) if (!seen[i] && (start < 0 || deg[i] < deg[start])) start = i
    const q = [start]; seen[start] = true
    let qi = 0
    while (qi < q.length) {
      const u = q[qi++]; order.push(u)
      const nb = adj[u].filter((v) => !seen[v]).sort((a, b) => deg[a] - deg[b])
      for (const v of nb) { seen[v] = true; q.push(v) }
    }
  }
  return order.reverse()
}

export function factorizeSym(M: number[][], floor = 1e-300): SymFactor | null {
  const N = M.length
  const perm = rcm(M, 1e-300)
  // permuted matrix + bandwidth
  const Mp: number[][] = Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => M[perm[a]][perm[b]]))
  let band = 0
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (Math.abs(Mp[a][b]) > 1e-300) band = Math.max(band, Math.abs(a - b))
  // banded LDLᵀ (no pivoting); A holds L below diagonal, D separate
  const A = Mp.map((r) => [...r]), D = new Array(N).fill(0)
  for (let j = 0; j < N; j++) {
    let dj = A[j][j]
    for (let k = Math.max(0, j - band); k < j; k++) dj -= A[j][k] * A[j][k] * D[k]
    if (!isFinite(dj) || Math.abs(dj) < floor) dj = dj >= 0 ? floor : -floor
    D[j] = dj
    const iHi = Math.min(N - 1, j + band)
    for (let i = j + 1; i <= iHi; i++) {
      let s = A[i][j]
      for (let k = Math.max(0, i - band); k < j; k++) s -= A[i][k] * A[j][k] * D[k]
      A[i][j] = s / dj
    }
  }
  return { perm, L: A, D, band, N }
}

export function solveSym(F: SymFactor, b: number[]): number[] {
  const { perm, L, D, band, N } = F
  const pb = perm.map((p) => b[p])              // permute RHS
  const y = new Array(N).fill(0)                 // L y = pb
  for (let i = 0; i < N; i++) { let s = pb[i]; for (let k = Math.max(0, i - band); k < i; k++) s -= L[i][k] * y[k]; y[i] = s }
  for (let i = 0; i < N; i++) y[i] /= D[i]        // D z = y  (in place)
  const x = new Array(N).fill(0)                 // Lᵀ x = z
  for (let i = N - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k <= Math.min(N - 1, i + band); k++) s -= L[k][i] * x[k]; x[i] = s }
  const out = new Array(N).fill(0)
  for (let i = 0; i < N; i++) out[perm[i]] = x[i] // unpermute
  return out
}

// =============================================================================
// SPARSE variant — same banded LDLᵀ, but NEVER materializes the dense N×N. Input
// is the lower-triangle (incl. diagonal) nonzeros per row; RCM runs on the sparse
// adjacency, the band is read off the permuted edges, and L is held in band
// storage (N×(band+1)). Cost: O(nnz) setup + O(N·band²) factor — linear in N for
// a fixed band, vs factorizeSym's O(N²) dense bookkeeping.
// =============================================================================

export interface SymFactorSparse { perm: number[]; Lb: Float64Array; D: Float64Array; band: number; N: number }
/** Per-row lower-triangle entries (j ≤ i, including the diagonal). */
export type LowerRows = { j: number; v: number }[][]

function rcmFromAdj(adj: number[][], N: number): number[] {
  const deg = adj.map((a) => a.length)
  const seen = new Array(N).fill(false)
  const order: number[] = []
  while (order.length < N) {
    let start = -1
    for (let i = 0; i < N; i++) if (!seen[i] && (start < 0 || deg[i] < deg[start])) start = i
    const q = [start]; seen[start] = true; let qi = 0
    while (qi < q.length) {
      const u = q[qi++]; order.push(u)
      const nb = adj[u].filter((v) => !seen[v]).sort((a, b) => deg[a] - deg[b])
      for (const v of nb) { seen[v] = true; q.push(v) }
    }
  }
  return order.reverse()
}

export function factorizeSymSparse(lower: LowerRows, N: number, floor = 1e-300): SymFactorSparse | null {
  // adjacency (symmetric) from the lower entries
  const adj: number[][] = Array.from({ length: N }, () => [])
  for (let i = 0; i < N; i++) for (const { j } of lower[i]) if (j !== i) { adj[i].push(j); adj[j].push(i) }
  const perm = rcmFromAdj(adj, N)
  const inv = new Array(N); for (let a = 0; a < N; a++) inv[perm[a]] = a
  let band = 0
  for (let i = 0; i < N; i++) for (const { j } of lower[i]) band = Math.max(band, Math.abs(inv[i] - inv[j]))
  const W = band + 1
  const Lb = new Float64Array(N * W) // Lb[a*W + (band-(a-c))] = entry(row a, col c≤a) in permuted order
  for (let oi = 0; oi < N; oi++) for (const { j: oj, v } of lower[oi]) {
    const a = inv[oi], b = inv[oj], r = Math.max(a, b), c = Math.min(a, b)
    Lb[r * W + (band - (r - c))] = v
  }
  const D = new Float64Array(N)
  for (let j = 0; j < N; j++) {
    let dj = Lb[j * W + band]
    for (let k = Math.max(0, j - band); k < j; k++) { const ljk = Lb[j * W + (band - (j - k))]; dj -= ljk * ljk * D[k] }
    if (!isFinite(dj) || Math.abs(dj) < floor) dj = dj >= 0 ? floor : -floor
    D[j] = dj
    const iHi = Math.min(N - 1, j + band)
    for (let i = j + 1; i <= iHi; i++) {
      let s = Lb[i * W + (band - (i - j))]
      for (let k = Math.max(0, i - band); k < j; k++) s -= Lb[i * W + (band - (i - k))] * Lb[j * W + (band - (j - k))] * D[k]
      Lb[i * W + (band - (i - j))] = s / dj
    }
  }
  return { perm, Lb, D, band, N }
}

export function solveSymSparse(F: SymFactorSparse, b: number[]): number[] {
  const { perm, Lb, D, band, N } = F, W = band + 1
  const pb = perm.map((p) => b[p])
  const y = new Float64Array(N)
  for (let i = 0; i < N; i++) { let s = pb[i]; for (let k = Math.max(0, i - band); k < i; k++) s -= Lb[i * W + (band - (i - k))] * y[k]; y[i] = s }
  for (let i = 0; i < N; i++) y[i] /= D[i]
  const x = new Float64Array(N)
  for (let i = N - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k <= Math.min(N - 1, i + band); k++) s -= Lb[k * W + (band - (k - i))] * x[k]; x[i] = s }
  const out = new Array(N).fill(0)
  for (let i = 0; i < N; i++) out[perm[i]] = x[i]
  return out
}

// =============================================================================
// SPARSE MIN-NORM SOLVE — the regularized min-norm correction
//     x = Aᵀ(A·Aᵀ + εI)⁻¹·b   ≡   (AᵀA + εI)⁻¹·Aᵀb     (exact push-through identity)
//
// A is given as SPARSE ROWS (each constraint's nonzero columns + values). We use
// the RIGHT form: factor the n×n VARIABLE-Gram G = AᵀA + εI rather than the m×m
// constraint-Gram. This is decisive when constraints outnumber variables (m≫n,
// the SOC regime): A·Aᵀ is then m×m and rank-deficient (≤ n) — a banded LDLᵀ on it
// divides by ~0 and overflows to NaN — whereas AᵀA+εI is small (n×n), banded
// (vars share an entry only through a common constraint ⇒ compact support), and
// well-conditioned. Cost O(Σ|suppᵢ|² + n·band²): linear in m and n for fixed band,
// vs the dense matMat(A,Aᵀ)+Cholesky at O(m²n + m³).
// =============================================================================
export function minNormSolveSparse(
  rowCols: number[][],   // rowCols[i] = nonzero column indices of constraint row i
  rowVals: number[][],   // rowVals[i] = matching values (parallel to rowCols[i])
  nVars: number,
  b: number[],           // length = number of rows
  reg = 1e-8,
): { success: boolean; x: number[] } {
  const m = rowCols.length
  if (m === 0) return { success: true, x: new Array(nVars).fill(0) }

  // Lower-triangle of G = AᵀA, accumulated one constraint row at a time:
  //   G[p][q] += A[i][p]·A[i][q]   for each pair (p,q) in row i's support, q ≤ p.
  // Stored as per-variable maps q→value (q ≤ p), plus Aᵀb.
  const gLower: Map<number, number>[] = Array.from({ length: nVars }, () => new Map<number, number>())
  const Atb = new Array(nVars).fill(0)
  for (let i = 0; i < m; i++) {
    const cols = rowCols[i], vals = rowVals[i], bi = b[i]
    for (let a = 0; a < cols.length; a++) {
      const p = cols[a], vip = vals[a]
      Atb[p] += vip * bi
      const gp = gLower[p]
      for (let c = 0; c < cols.length; c++) {
        const q = cols[c]
        if (q > p) continue // lower triangle only
        gp.set(q, (gp.get(q) ?? 0) + vip * vals[c])
      }
    }
  }

  // Assemble LowerRows for the banded factorizer (+reg on the diagonal).
  const lower: LowerRows = new Array(nVars)
  for (let p = 0; p < nVars; p++) {
    const gp = gLower[p]
    const entries: { j: number; v: number }[] = []
    let hasDiag = false
    for (const [q, v] of gp) { entries.push({ j: q, v: q === p ? v + reg : v }); if (q === p) hasDiag = true }
    if (!hasDiag) entries.push({ j: p, v: reg })
    lower[p] = entries
  }

  const F = factorizeSymSparse(lower, nVars)
  if (!F) return { success: false, x: [] }
  const x = solveSymSparse(F, Atb) // (AᵀA + εI) x = Aᵀb
  if (!x.every(Number.isFinite)) return { success: false, x: [] }
  return { success: true, x }
}
