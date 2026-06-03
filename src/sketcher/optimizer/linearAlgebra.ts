// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Linear Algebra Utilities for Interior Point Optimizer
 *
 * Provides basic vector and matrix operations needed for optimization.
 * Designed to be standalone with no external dependencies.
 */

// ============================================================================
// Vector Operations
// ============================================================================

export function zeros(n: number): number[] {
  return new Array(n).fill(0)
}

export function ones(n: number): number[] {
  return new Array(n).fill(1)
}

export function clone(v: number[]): number[] {
  return [...v]
}

export function add(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i])
}

export function subtract(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i])
}

export function scale(v: number[], s: number): number[] {
  return v.map((val) => val * s)
}

export function saxpy(a: number, x: number[], y: number[]): number[] {
  // a*x + y
  return x.map((val, i) => a * val + y[i])
}

export function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

export function norm2(v: number[]): number {
  return Math.sqrt(dot(v, v))
}

export function normInf(v: number[]): number {
  return Math.max(...v.map(Math.abs))
}

export function elementwiseMultiply(a: number[], b: number[]): number[] {
  return a.map((val, i) => val * b[i])
}

export function elementwiseDivide(a: number[], b: number[]): number[] {
  return a.map((val, i) => val / b[i])
}

// ============================================================================
// Matrix Operations (stored as 2D arrays, row-major)
// ============================================================================

export type Matrix = number[][]

export function zerosMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array(cols).fill(0))
}

export function identityMatrix(n: number): Matrix {
  const result = zerosMatrix(n, n)
  for (let i = 0; i < n; i++) {
    result[i][i] = 1
  }
  return result
}

export function diagonalMatrix(diag: number[]): Matrix {
  const n = diag.length
  const result = zerosMatrix(n, n)
  for (let i = 0; i < n; i++) {
    result[i][i] = diag[i]
  }
  return result
}

export function transpose(A: Matrix): Matrix {
  const rows = A.length
  const cols = A[0].length
  const result = zerosMatrix(cols, rows)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = A[i][j]
    }
  }
  return result
}

export function matVec(A: Matrix, v: number[]): number[] {
  return A.map((row) => dot(row, v))
}

export function matMat(A: Matrix, B: Matrix): Matrix {
  const rowsA = A.length
  const colsA = A[0].length
  const colsB = B[0].length
  const result = zerosMatrix(rowsA, colsB)

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      let sum = 0
      for (let k = 0; k < colsA; k++) {
        sum += A[i][k] * B[k][j]
      }
      result[i][j] = sum
    }
  }
  return result
}

export function matAdd(A: Matrix, B: Matrix): Matrix {
  return A.map((row, i) => row.map((val, j) => val + B[i][j]))
}

export function matScale(A: Matrix, s: number): Matrix {
  return A.map((row) => row.map((val) => val * s))
}

// A^T * diag(d) * A
export function atDiagA(A: Matrix, d: number[]): Matrix {
  const rows = A.length
  const cols = A[0].length
  const result = zerosMatrix(cols, cols)

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0
      for (let k = 0; k < rows; k++) {
        sum += A[k][i] * d[k] * A[k][j]
      }
      result[i][j] = sum
      result[j][i] = sum // Symmetric
    }
  }
  return result
}

// ============================================================================
// Cholesky Decomposition and Linear Solve
// ============================================================================

export interface CholeskyResult {
  success: boolean
  L: Matrix
}

/**
 * Cholesky decomposition: A = L * L^T
 * Returns lower triangular L, or success=false if not positive definite.
 */
export function cholesky(A: Matrix, regularization = 1e-10): CholeskyResult {
  const n = A.length
  const L = zerosMatrix(n, n)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j]

      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k]
      }

      if (i === j) {
        // Add regularization for numerical stability
        sum += regularization
        if (sum <= 0) {
          return { success: false, L: [] }
        }
        L[i][j] = Math.sqrt(sum)
      } else {
        L[i][j] = sum / L[j][j]
      }
    }
  }

  return { success: true, L }
}

/**
 * Solve L * y = b (forward substitution)
 */
function forwardSolve(L: Matrix, b: number[]): number[] {
  const n = b.length
  const y = zeros(n)

  for (let i = 0; i < n; i++) {
    let sum = b[i]
    for (let j = 0; j < i; j++) {
      sum -= L[i][j] * y[j]
    }
    y[i] = sum / L[i][i]
  }

  return y
}

/**
 * Solve L^T * x = y (backward substitution)
 */
function backwardSolve(L: Matrix, y: number[]): number[] {
  const n = y.length
  const x = zeros(n)

  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]
    for (let j = i + 1; j < n; j++) {
      sum -= L[j][i] * x[j] // L^T[i][j] = L[j][i]
    }
    x[i] = sum / L[i][i]
  }

  return x
}

/**
 * Solve A * x = b using Cholesky decomposition
 * A must be symmetric positive definite
 */
export function choleskySolve(
  A: Matrix,
  b: number[],
  regularization = 1e-10
): { success: boolean; x: number[] } {
  const { success, L } = cholesky(A, regularization)

  if (!success) {
    return { success: false, x: [] }
  }

  // Solve L * y = b
  const y = forwardSolve(L, b)

  // Solve L^T * x = y
  const x = backwardSolve(L, y)

  return { success: true, x }
}

/**
 * Solve linear system using LU decomposition with partial pivoting
 * More robust than Cholesky for general matrices
 */
export function luSolve(A: Matrix, b: number[]): { success: boolean; x: number[] } {
  const n = A.length

  // Create augmented matrix [A | b]
  const aug: Matrix = A.map((row, i) => [...row, b[i]])

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col])
        maxRow = row
      }
    }

    // Check for singular matrix
    if (maxVal < 1e-14) {
      return { success: false, x: [] }
    }

    // Swap rows
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

    // Eliminate
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j]
      }
    }
  }

  // Back substitution
  const x = zeros(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n]
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j]
    }
    x[i] = sum / aug[i][i]
  }

  return { success: true, x }
}

// ============================================================================
// Trust Region Subproblem Solver
// ============================================================================

export interface TrustRegionResult {
  step: number[]
  hitsBoundary: boolean
  lambda: number
}

/**
 * Solve the trust region subproblem:
 *   minimize g^T * p + 0.5 * p^T * H * p
 *   subject to ||p|| <= delta
 *
 * Uses the dogleg method for efficiency.
 */
export function solveTrustRegion(
  gradient: number[],
  hessian: Matrix,
  delta: number,
  regularization = 1e-8
): TrustRegionResult {
  const n = gradient.length

  // Try Newton step first
  const negGrad = scale(gradient, -1)
  const { success, x: newtonStep } = choleskySolve(hessian, negGrad, regularization)

  if (success) {
    const newtonNorm = norm2(newtonStep)
    if (newtonNorm <= delta) {
      // Newton step is inside trust region
      return { step: newtonStep, hitsBoundary: false, lambda: 0 }
    }
  }

  // Newton step outside trust region or Cholesky failed
  // Use Cauchy point as fallback
  const gHg = quadraticForm(hessian, gradient)
  const gNorm = norm2(gradient)

  if (gNorm < 1e-14) {
    return { step: zeros(n), hitsBoundary: false, lambda: 0 }
  }

  let cauchyStep: number[]
  if (gHg <= 0) {
    // Negative curvature: go to boundary in steepest descent direction
    cauchyStep = scale(gradient, -delta / gNorm)
  } else {
    // Cauchy point
    const tau = Math.min(1, Math.pow(gNorm, 3) / (delta * gHg))
    cauchyStep = scale(gradient, (-tau * delta) / gNorm)
  }

  // If we have a valid Newton step, use dogleg
  if (success) {
    const cauchyNorm = norm2(cauchyStep)
    if (cauchyNorm >= delta) {
      // Cauchy point is on or outside boundary
      return { step: scale(cauchyStep, delta / cauchyNorm), hitsBoundary: true, lambda: 0 }
    }

    // Dogleg: find intersection of Newton-Cauchy segment with trust region
    const diff = subtract(newtonStep, cauchyStep)
    const a = dot(diff, diff)
    const b = 2 * dot(cauchyStep, diff)
    const c = dot(cauchyStep, cauchyStep) - delta * delta

    const discriminant = b * b - 4 * a * c
    if (discriminant >= 0) {
      const tau = (-b + Math.sqrt(discriminant)) / (2 * a)
      const step = add(cauchyStep, scale(diff, Math.max(0, Math.min(1, tau))))
      return { step, hitsBoundary: true, lambda: 0 }
    }
  }

  // Fallback: scaled Cauchy step to boundary
  const step = scale(gradient, -delta / gNorm)
  return { step, hitsBoundary: true, lambda: 0 }
}

function quadraticForm(H: Matrix, v: number[]): number {
  return dot(v, matVec(H, v))
}

// ============================================================================
// Least Squares Solve (for SOC)
// ============================================================================

/**
 * Solve min ||A*x - b||^2 (least squares)
 * Returns x = (A^T * A)^{-1} * A^T * b
 */
export function leastSquares(A: Matrix, b: number[]): { success: boolean; x: number[] } {
  const At = transpose(A)
  const AtA = matMat(At, A)
  const Atb = matVec(At, b)

  return choleskySolve(AtA, Atb, 1e-8)
}

/**
 * Compute minimum norm solution: min ||x||^2 s.t. A*x = b
 * Returns x = A^T * (A * A^T)^{-1} * b
 */
export function minNormSolve(A: Matrix, b: number[]): { success: boolean; x: number[] } {
  if (A.length === 0 || A[0].length === 0) {
    return { success: true, x: zeros(A[0]?.length || 0) }
  }

  const At = transpose(A)
  const AAt = matMat(A, At)

  // Solve (A * A^T) * lambda = b
  const { success, x: lambda } = choleskySolve(AAt, b, 1e-8)

  if (!success) {
    return { success: false, x: [] }
  }

  // x = A^T * lambda
  const x = matVec(At, lambda)
  return { success: true, x }
}
