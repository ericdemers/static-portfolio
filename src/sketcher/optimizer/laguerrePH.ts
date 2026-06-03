// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Laguerre Transformation for AB PH Curves
 *
 * Applies Laguerre transformations (a subgroup of the Lie sphere group O(3,2))
 * to AB PH curves. The approach:
 * 1. Lift tangent lines to homogeneous Lie coordinates using B-spline algebra
 * 2. Apply a 5×5 Laguerre matrix
 * 3. Compute the envelope of transformed lines to recover a rational B-spline curve
 *
 * For an AB PH curve z(t) = A(t)/B(t) with PH condition A'B - AB' = S²,
 * the tangent line at parameter t has Lie coordinates:
 *   L₀ = Im(S²·conj(A)·conj(B))
 *   L₁ = -L₀  (line constraint: x₀ + x₁ = 0)
 *   L₂ = Im(S²·conj(B)²)
 *   L₃ = -Re(S²·conj(B)²)
 *   L₄ = |B|²·|S|²
 *
 * All are degree 4p-2 B-splines, computed via BernsteinDecomposition products.
 */

import type { ComplexPoint } from '../types/curve'
import type { ABPHMetadata } from './abPHCurve'
import {
  BernsteinDecomposition,
  decomposeToBernstein,
  recomposeBD,
  derivativeBD,
} from './algebra'
import type { SimpleBSpline } from './complexAlgebra'

// ============================================================================
// Types
// ============================================================================

export interface OrientedLine {
  px: number
  py: number
  angle: number // Normal direction angle: normal = (cos θ, sin θ)
}

export interface LieCoordinates {
  L0: BernsteinDecomposition
  L1: BernsteinDecomposition
  L2: BernsteinDecomposition
  L3: BernsteinDecomposition
  L4: BernsteinDecomposition
}

// ============================================================================
// 5×5 Matrix Utilities (Lie algebra o(3,2))
// ============================================================================

const G_METRIC = [-1, 1, 1, 1, -1] // Diagonal of metric tensor

function identity5(): number[][] {
  const I: number[][] = Array(5).fill(0).map(() => Array(5).fill(0))
  for (let i = 0; i < 5; i++) I[i][i] = 1
  return I
}

function matMul(A: number[][], B: number[][]): number[][] {
  const result: number[][] = Array(5).fill(0).map(() => Array(5).fill(0))
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      let s = 0
      for (let k = 0; k < 5; k++) s += A[i][k] * B[k][j]
      result[i][j] = s
    }
  }
  return result
}

function matVec(A: number[][], v: number[]): number[] {
  const result = Array(5).fill(0)
  for (let i = 0; i < 5; i++) {
    let s = 0
    for (let j = 0; j < 5; j++) s += A[i][j] * v[j]
    result[i] = s
  }
  return result
}

function matExp(A: number[][]): number[][] {
  let norm = 0
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) norm += A[i][j] * A[i][j]
  norm = Math.sqrt(norm)

  let s = 0
  while (norm > 0.5) {
    norm /= 2
    s++
  }

  const scaleFactor = Math.pow(2, -s)
  const Ascaled = A.map(row => row.map(x => x * scaleFactor))

  let result = identity5()
  let term = identity5()
  let factorial = 1

  for (let n = 1; n <= 20; n++) {
    term = matMul(term, Ascaled)
    factorial *= n
    const factor = 1.0 / factorial

    let maxTerm = 0
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const val = term[i][j] * factor
        result[i][j] += val
        maxTerm = Math.max(maxTerm, Math.abs(val))
      }
    }
    if (n > 5 && maxTerm < 1e-12) break
  }

  for (let i = 0; i < s; i++) result = matMul(result, result)
  return result
}

/**
 * Generator: antisymmetric matrix for o(3,2)
 * G[i][j] = sign * g[j], G[j][i] = -sign * g[i]
 */
function generator(i: number, j: number, sign: number = 1): number[][] {
  const G: number[][] = Array(5).fill(0).map(() => Array(5).fill(0))
  G[i][j] = sign * G_METRIC[j]
  G[j][i] = -sign * G_METRIC[i]
  return G
}

// ============================================================================
// Oriented Line → Lie Coordinates
// ============================================================================

/**
 * Convert an oriented line to homogeneous Lie coordinates.
 * Line with normal (nx, ny) = (cos θ, sin θ) and signed distance d = nx·px + ny·py
 * Lie coordinates: [d, -d, nx, ny, 1]
 */
export function orientedLineToLie(line: OrientedLine): number[] {
  const nx = Math.cos(line.angle)
  const ny = Math.sin(line.angle)
  const d = nx * line.px + ny * line.py
  return [d, -d, nx, ny, 1]
}

// ============================================================================
// Compute Laguerre Matrix from 3 Line Pairs
// ============================================================================

/**
 * Compute 5×5 Laguerre matrix from 3 oriented line pairs.
 *
 * Uses closed-form factor matrices (no matExp) and Newton's method
 * for fast convergence (~5 iterations). The 6 Laguerre parameters are:
 *   [tx, ty, φ (rotation), δ (offset), lx (Laguerre X), ly (Laguerre Y)]
 *
 * The matrix is decomposed as:
 *   M = M_transX(tx) · M_transY(ty) · M_rot(φ) · M_lagX(lx) · M_lagY(ly) · M_offset(δ)
 *
 * Each factor has a closed-form expression (nilpotent or hyperbolic).
 */
export function computeLaguerreMatrix(
  original: OrientedLine[],
  target: OrientedLine[],
): number[][] {
  if (original.length < 3 || target.length < 3) return identity5()

  // Convert lines to Lie coordinates
  const origLie = original.map(orientedLineToLie)
  const targLie = target.map(orientedLineToLie)

  // Check if original and target are the same (identity transform)
  let allSame = true
  for (let i = 0; i < 3 && allSame; i++)
    for (let j = 0; j < 5 && allSame; j++)
      if (Math.abs(origLie[i][j] - targLie[i][j]) > 1e-10) allSame = false
  if (allSame) return identity5()

  // Extract geometric parameters for initial guess
  const origAngles = original.map(l => l.angle)
  const targAngles = target.map(l => l.angle)
  const origDists = origLie.map(l => l[0])
  const targDists = targLie.map(l => l[0])

  // Initial guess: rotation from mean angle difference, then solve 3×3 for (tx, ty, δ)
  const meanAngleDiff = (
    angleDiff(targAngles[0], origAngles[0]) +
    angleDiff(targAngles[1], origAngles[1]) +
    angleDiff(targAngles[2], origAngles[2])
  ) / 3
  const params = [0, 0, meanAngleDiff, 0, 0, 0]

  // Solve 3×3 system for (tx, ty, δ) using the Euclidean+offset model
  // After transform: d' = d + tx·cos(θ') + ty·sin(θ') - δ
  // So: tx·cos(θ') + ty·sin(θ') - δ = d' - d
  const phi = meanAngleDiff
  const A = [
    [Math.cos(targAngles[0]), Math.sin(targAngles[0]), -1],
    [Math.cos(targAngles[1]), Math.sin(targAngles[1]), -1],
    [Math.cos(targAngles[2]), Math.sin(targAngles[2]), -1],
  ]
  const b = [
    targDists[0] - origDists[0],
    targDists[1] - origDists[1],
    targDists[2] - origDists[2],
  ]
  const sol = solve3x3(A, b)
  if (sol) {
    params[0] = sol[0] // tx
    params[1] = sol[1] // ty
    params[3] = sol[2] // δ
  }

  // Save initial Euclidean guess (fallback if Newton diverges)
  const euclideanParams = [...params]

  // Newton's method to refine all 6 parameters
  let prevMaxRes = Infinity
  for (let iter = 0; iter < 15; iter++) {
    const M = buildLaguerreFromParams(params)

    // Compute residuals: for each line pair, angle error and distance error
    const res: number[] = []
    for (let i = 0; i < 3; i++) {
      const t = matVec(M, origLie[i])
      const w = t[4]
      if (Math.abs(w) < 1e-14) { res.push(0, 0); continue }
      const nx = t[2] / w
      const ny = t[3] / w
      const d = t[0] / w
      const tAngle = Math.atan2(targLie[i][3], targLie[i][2])
      const angle = Math.atan2(ny, nx)
      res.push(angleDiff(angle, tAngle), d - targLie[i][0])
    }

    // Check convergence
    let maxRes = 0
    for (const r of res) maxRes = Math.max(maxRes, Math.abs(r))
    if (maxRes < 1e-10) break

    // Detect divergence: if residual is growing, revert to Euclidean guess
    if (iter > 2 && maxRes > prevMaxRes * 2) {
      for (let k = 0; k < 6; k++) params[k] = euclideanParams[k]
      break
    }
    prevMaxRes = maxRes

    // Compute Jacobian using forward differences
    const eps = 1e-7
    const J: number[][] = Array(6).fill(0).map(() => Array(6).fill(0))
    for (let k = 0; k < 6; k++) {
      const pPlus = [...params]
      pPlus[k] += eps
      const Mplus = buildLaguerreFromParams(pPlus)
      for (let i = 0; i < 3; i++) {
        const t = matVec(Mplus, origLie[i])
        const w = t[4]
        if (Math.abs(w) < 1e-14) continue
        const nx = t[2] / w
        const ny = t[3] / w
        const d = t[0] / w
        const tAngle = Math.atan2(targLie[i][3], targLie[i][2])
        const angle = Math.atan2(ny, nx)
        J[i * 2][k] = (angleDiff(angle, tAngle) - res[i * 2]) / eps
        J[i * 2 + 1][k] = (d - targLie[i][0] - res[i * 2 + 1]) / eps
      }
    }

    // Solve J·Δp = -res using Gaussian elimination with partial pivoting
    const delta = solveLinear6x6(J, res.map(r => -r))
    if (!delta) break

    // Check for NaN/Inf in delta
    if (delta.some(d => !isFinite(d))) break

    // Damped Newton step
    for (let k = 0; k < 6; k++) params[k] += delta[k]

    // Clamp Laguerre boost parameters to reasonable range
    params[4] = Math.max(-5, Math.min(5, params[4])) // lx
    params[5] = Math.max(-5, Math.min(5, params[5])) // ly
  }

  // Final safety check
  const result = buildLaguerreFromParams(params)
  if (result.flat().some(v => !isFinite(v))) return identity5()
  return result
}

/** Signed angle difference in [-π, π] */
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Solve 3×3 linear system Ax = b using Cramer's rule */
function solve3x3(A: number[][], b: number[]): number[] | null {
  const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
             - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
             + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])
  if (Math.abs(det) < 1e-14) return null
  const x0 = (b[0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
             - A[0][1] * (b[1] * A[2][2] - A[1][2] * b[2])
             + A[0][2] * (b[1] * A[2][1] - A[1][1] * b[2])) / det
  const x1 = (A[0][0] * (b[1] * A[2][2] - A[1][2] * b[2])
             - b[0] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
             + A[0][2] * (A[1][0] * b[2] - b[1] * A[2][0])) / det
  const x2 = (A[0][0] * (A[1][1] * b[2] - b[1] * A[2][1])
             - A[0][1] * (A[1][0] * b[2] - b[1] * A[2][0])
             + b[0] * (A[1][0] * A[2][1] - A[1][1] * A[2][0])) / det
  return [x0, x1, x2]
}

/** Solve 6×6 linear system using Gaussian elimination with partial pivoting */
function solveLinear6x6(J: number[][], rhs: number[]): number[] | null {
  const n = 6
  // Augmented matrix
  const aug = J.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxVal = Math.abs(aug[col][col])
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col])
        maxRow = row
      }
    }
    if (maxVal < 1e-14) return null
    if (maxRow !== col) {
      const tmp = aug[col]; aug[col] = aug[maxRow]; aug[maxRow] = tmp
    }
    // Eliminate
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j]
    }
  }
  // Back substitution
  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = aug[i][n]
    for (let j = i + 1; j < n; j++) s -= aug[i][j] * x[j]
    x[i] = s / aug[i][i]
  }
  return x
}

/**
 * Build a Laguerre matrix from 6 parameters using closed-form factor matrices.
 * No matrix exponential needed — each factor is computed analytically.
 *
 * M = M_transX(tx) · M_transY(ty) · M_rot(φ) · M_lagX(lx) · M_lagY(ly) · M_offset(δ)
 */
function buildLaguerreFromParams(p: number[]): number[][] {
  const [tx, ty, phi, delta, lx, ly] = p
  const c = Math.cos(phi), s = Math.sin(phi)
  const tx2 = tx * tx, ty2 = ty * ty, d2 = delta * delta
  const clx = Math.cosh(lx), slx = Math.sinh(lx)
  const cly = Math.cosh(ly), sly = Math.sinh(ly)

  // M_transX: exp(tx·G_tx), nilpotent (G_tx³ = 0)
  // [1+tx²/2, tx²/2, tx, 0, 0; -tx²/2, 1-tx²/2, -tx, 0, 0; tx, tx, 1, 0, 0; 0,0,0,1,0; 0,0,0,0,1]
  const Mtx: number[][] = [
    [1 + tx2 / 2, tx2 / 2, tx, 0, 0],
    [-tx2 / 2, 1 - tx2 / 2, -tx, 0, 0],
    [tx, tx, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ]

  // M_transY: exp(ty·G_ty), nilpotent (G_ty³ = 0)
  const Mty: number[][] = [
    [1 + ty2 / 2, ty2 / 2, 0, ty, 0],
    [-ty2 / 2, 1 - ty2 / 2, 0, -ty, 0],
    [0, 0, 1, 0, 0],
    [ty, ty, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ]

  // M_rot: rotation in (2,3) plane
  const Mrot: number[][] = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, c, -s, 0],
    [0, 0, s, c, 0],
    [0, 0, 0, 0, 1],
  ]

  // M_lagX: hyperbolic rotation in (2,4) plane
  const Mlx: number[][] = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, clx, 0, -slx],
    [0, 0, 0, 1, 0],
    [0, 0, -slx, 0, clx],
  ]

  // M_lagY: hyperbolic rotation in (3,4) plane
  const Mly: number[][] = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, cly, -sly],
    [0, 0, 0, -sly, cly],
  ]

  // M_offset: exp(δ·G_off), nilpotent (G_off³ = 0)
  const Moff: number[][] = [
    [1 - d2 / 2, -d2 / 2, 0, 0, -delta],
    [d2 / 2, 1 + d2 / 2, 0, 0, delta],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [delta, delta, 0, 0, 1],
  ]

  // Compose: M = Mtx · Mty · Mrot · Mlx · Mly · Moff
  return matMul(Mtx, matMul(Mty, matMul(Mrot, matMul(Mlx, matMul(Mly, Moff)))))
}

// ============================================================================
// Lift PH Curve Tangent Lines to Lie Coordinates
// ============================================================================

/**
 * Lift PH curve tangent lines to 5 Lie coordinate B-splines.
 *
 * For z(t) = A(t)/B(t) with A'B - AB' = S², the tangent line at parameter t:
 *   L₀ = Im(S²·conj(A)·conj(B))     (signed distance × normalization)
 *   L₁ = -L₀                          (line constraint: x₀ + x₁ = 0)
 *   L₂ = Im(S²·conj(B)²)             (normal x-component × normalization)
 *   L₃ = -Re(S²·conj(B)²)            (normal y-component × normalization)
 *   L₄ = |B|²·|S|²                   (normalization factor)
 *
 * All are degree 4p-2 B-splines on a common knot vector.
 */
export function liftTangentLinesToLie(meta: ABPHMetadata): LieCoordinates {
  // Decompose A, B to Bernstein form
  const aReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aReCPs })
  const aImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.aImCPs })
  const bReBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bReCPs })
  const bImBD = decomposeToBernstein({ knots: meta.knots, controlPoints: meta.bImCPs })

  // Decompose S to Bernstein form
  const sReBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sReCPs })
  const sImBD = decomposeToBernstein({ knots: meta.sKnots, controlPoints: meta.sImCPs })

  // S² = (sRe + i·sIm)² = (sRe² - sIm²) + i·(2·sRe·sIm)
  const s2Re = sReBD.multiply(sReBD).subtract(sImBD.multiply(sImBD))
  const s2Im = sReBD.multiply(sImBD).multiplyByScalar(2)

  // conj(A) = aRe - i·aIm
  // conj(B) = bRe - i·bIm

  // S²·conj(A)·conj(B):
  // First: conj(A)·conj(B) = (aRe - i·aIm)(bRe - i·bIm)
  //   = (aRe·bRe - aIm·bIm) - i·(aRe·bIm + aIm·bRe)
  const conjAconjB_Re = aReBD.multiply(bReBD).subtract(aImBD.multiply(bImBD))
  const conjAconjB_Im = aReBD.multiply(bImBD).add(aImBD.multiply(bReBD)).multiplyByScalar(-1)

  // S²·conj(A)·conj(B) = (s2Re + i·s2Im)(conjAconjB_Re + i·conjAconjB_Im)
  const s2AbarBbar_Re = s2Re.multiply(conjAconjB_Re).subtract(s2Im.multiply(conjAconjB_Im))
  const s2AbarBbar_Im = s2Re.multiply(conjAconjB_Im).add(s2Im.multiply(conjAconjB_Re))

  // L₀ = Im(S²·conj(A)·conj(B))
  // This ensures the line equation L₂·x + L₃·y = L₀ holds for the curve point (x,y)
  const L0 = s2AbarBbar_Im

  // L₁ = -L₀ (line constraint: x₀ + x₁ = 0)
  const L1 = s2AbarBbar_Im.multiplyByScalar(-1)

  // S²·conj(B)² = S²·(bRe - i·bIm)²
  // conj(B)² = (bRe² - bIm²) - i·(2·bRe·bIm)
  const conjB2_Re = bReBD.multiply(bReBD).subtract(bImBD.multiply(bImBD))
  const conjB2_Im = bReBD.multiply(bImBD).multiplyByScalar(-2)

  // S²·conj(B)² = (s2Re + i·s2Im)(conjB2_Re + i·conjB2_Im)
  const s2Bbar2_Re = s2Re.multiply(conjB2_Re).subtract(s2Im.multiply(conjB2_Im))
  const s2Bbar2_Im = s2Re.multiply(conjB2_Im).add(s2Im.multiply(conjB2_Re))

  // L₂ = Im(S²·conj(B)²)
  const L2 = s2Bbar2_Im

  // L₃ = -Re(S²·conj(B)²)
  const L3 = s2Bbar2_Re.multiplyByScalar(-1)

  // L₄ = |B|²·|S|²
  // |B|² = bRe² + bIm²
  // |S|² = sRe² + sIm²
  const bNorm2 = bReBD.multiply(bReBD).add(bImBD.multiply(bImBD))
  const sNorm2 = sReBD.multiply(sReBD).add(sImBD.multiply(sImBD))
  const L4 = bNorm2.multiply(sNorm2)

  return { L0, L1, L2, L3, L4 }
}

// ============================================================================
// Apply Laguerre Matrix to Lie Coordinates
// ============================================================================

/**
 * Apply a 5×5 Laguerre matrix M to each Lie coordinate BD.
 * L'_i = Σ_j M[i][j] · L_j — linear combination of BDs.
 */
export function applyLaguerreToLie(M: number[][], lie: LieCoordinates): LieCoordinates {
  const components = [lie.L0, lie.L1, lie.L2, lie.L3, lie.L4]

  const transform = (row: number): BernsteinDecomposition => {
    let result = components[0].multiplyByScalar(M[row][0])
    for (let j = 1; j < 5; j++) {
      if (Math.abs(M[row][j]) > 1e-14) {
        result = result.add(components[j].multiplyByScalar(M[row][j]))
      }
    }
    return result
  }

  return {
    L0: transform(0),
    L1: transform(1),
    L2: transform(2),
    L3: transform(3),
    L4: transform(4),
  }
}

// ============================================================================
// Compute Envelope from Transformed Lie Coordinates
// ============================================================================

/**
 * Compute the envelope curve from a family of transformed lines.
 *
 * The envelope solves the system:
 *   L₂·x + L₃·y = L₀  (point on line)
 *   (L₂·x + L₃·y)' = L₀'  (tangency condition)
 *
 * Solution:
 *   X = (L₀·L₃' - L₀'·L₃) / D
 *   Y = (L₂·L₀' - L₀·L₂') / D
 *   where D = L₂·L₃' - L₂'·L₃  (= L₃·L₂' - ... with appropriate sign)
 *
 * Returns homogeneous control points where D is the weight.
 */
export function computeEnvelope(lie: LieCoordinates): {
  controlPoints: ComplexPoint[]
  knots: number[]
  degree: number
} {
  const { L0, L2, L3 } = lie

  // Compute derivatives
  const L0p = derivativeBD(L0)
  const L2p = derivativeBD(L2)
  const L3p = derivativeBD(L3)

  // Numerator X = L₀·L₃' - L₀'·L₃
  const numX = L0.multiply(L3p).subtract(L0p.multiply(L3))

  // Numerator Y = L₂·L₀' - L₀·L₂'
  const numY = L2.multiply(L0p).subtract(L0.multiply(L2p))

  // Denominator D = L₂·L₃' - L₂'·L₃
  const denomBD = L2.multiply(L3p).subtract(L2p.multiply(L3))

  // Recompose to B-spline form
  const numXSpline = recomposeBD(numX)
  const numYSpline = recomposeBD(numY)
  const denomSpline = recomposeBD(denomBD)

  // Form ComplexPoint control points
  // For a real rational curve: position = numerator / denominator
  // We use ComplexPoint with w_im = 0 (real weights)
  const controlPoints: ComplexPoint[] = []
  for (let i = 0; i < numXSpline.controlPoints.length; i++) {
    const w = denomSpline.controlPoints[i]
    const wNorm2 = w * w
    if (wNorm2 < 1e-20) {
      controlPoints.push({ re: 0, im: 0, w_re: w, w_im: 0 })
      continue
    }
    controlPoints.push({
      re: numXSpline.controlPoints[i] / w,
      im: numYSpline.controlPoints[i] / w,
      w_re: w,
      w_im: 0,
    })
  }

  const degree = numXSpline.knots.length - numXSpline.controlPoints.length - 1

  return { controlPoints, knots: numXSpline.knots, degree }
}

// ============================================================================
// Top-Level: Apply Laguerre to AB PH Curve
// ============================================================================

/**
 * Apply a Laguerre transformation to an AB PH curve.
 * Lift → transform → envelope.
 * Returns a general rational B-spline (NOT PH in general).
 */
export function applyLaguerreToABPH(
  M: number[][],
  meta: ABPHMetadata,
): { controlPoints: ComplexPoint[]; knots: number[]; degree: number } {
  const lie = liftTangentLinesToLie(meta)
  const transformedLie = applyLaguerreToLie(M, lie)
  return computeEnvelope(transformedLie)
}
