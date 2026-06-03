// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Open-curve fairness for the Airfoil Workbench (the "Fair" button in Open TE).
 *
 * Mirrors the closed-curve fairness (jerkEnergy.ts) but for a CLAMPED B-spline
 * with the trailing-edge endpoints PINNED:
 *
 *   min over interior CPs   Σ‖C(tᵢ) − Dᵢ‖²  +  λ ∫‖C⁽ᵏ⁾(t)‖² dt
 *
 * with C(0)=pinStart, C(1)=pinEnd fixed. Both terms are quadratic, so the
 * minimum is one linear solve over the interior control points:
 *
 *   (Bᵢₙₜᵀ Bᵢₙₜ + λ Mᵢₙₜ) P = Bᵢₙₜᵀ d′ − λ (M·endpoint terms)
 *
 * where M[i][j] = ∫ B_i⁽ᵏ⁾·B_j⁽ᵏ⁾ dt is the clamped fairness Gram matrix and
 * d′ is the data with the pinned-endpoint contribution moved to the RHS.
 */

import { decomposeToBernstein, integrateBD } from '../../optimizer/algebra'
import { choleskySolve, luSolve } from '../../optimizer/linearAlgebra'
import { evaluateBSpline } from '../../utils/bspline/core'
import type { FairnessEnergyType } from '../optimizer/jerkEnergy'
import { fairnessDerivativeOrder } from '../optimizer/jerkEnergy'
import { buildClampedBasisMatrix } from './openFit'
import type { Point2D } from '../../types/curve'

/** Evaluate a Bernstein decomposition (per-span Bernstein coeffs) at parameter t. */
function evalBD(bd: { controlPointsArray: number[][]; distinctKnots: number[] }, t: number): number {
  const dk = bd.distinctKnots
  const nSpans = bd.controlPointsArray.length
  if (nSpans === 0) return 0
  let s = 0
  for (let k = 0; k < nSpans; k++) { if (dk[k] <= t + 1e-12) s = k }
  s = Math.max(0, Math.min(nSpans - 1, s))
  const a = dk[s], b = dk[s + 1], span = b - a
  const u = span > 1e-14 ? Math.max(0, Math.min(1, (t - a) / span)) : 0
  // de Casteljau on the span's Bernstein coefficients
  const c = [...bd.controlPointsArray[s]]
  const n = c.length
  for (let r = 1; r < n; r++) for (let i = 0; i < n - r; i++) c[i] = c[i] * (1 - u) + c[i + 1] * u
  return c[0]
}

/**
 * Arc-length-weighted fairness Gram: M[i][j] = ∫_window B_i⁽ᵏ⁾ B_j⁽ᵏ⁾ · v(t)^{(1-2k)·α} dt,
 * where v(t) = ‖C'(t)‖ is the (frozen) base-curve speed. At α = 0 this is the
 * ordinary parameter-space Gram; at α = 1 the weight v^{1-2k} makes the energy
 * approximate the ARC-LENGTH fairness ∫‖dᵏC/dsᵏ‖² ds (constant-speed leading
 * order) — i.e. "closer to the curvature itself". Computed by quadrature.
 */
export function computeArclenWeightedGram(
  knots: number[],
  numCPs: number,
  degree: number,
  energyType: FairnessEnergyType,
  tA: number,
  tB: number,
  cpX: number[],
  cpY: number[],
  alpha: number,
): number[][] {
  const order = fairnessDerivativeOrder(energyType)
  const derivs = Array.from({ length: numCPs }, (_, i) => diracDerivativeBD(knots, numCPs, degree, i, order))
  const exp = (1 - 2 * order) * alpha
  const pts = cpX.map((x, i) => ({ x, y: cpY[i] }))
  const t0 = knots[degree], t1 = knots[numCPs]
  const speedAt = (t: number): number => {
    const h = 1e-4
    const ta = Math.max(t0, t - h), tb = Math.min(t1, t + h)
    const a = evaluateBSpline(pts, degree, knots, ta)
    const b = evaluateBSpline(pts, degree, knots, tb)
    return Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1e-9, tb - ta)
  }
  const Q = 600
  const M: number[][] = Array.from({ length: numCPs }, () => new Array<number>(numCPs).fill(0))
  for (let qi = 0; qi <= Q; qi++) {
    const t = tA + (tB - tA) * (qi / Q)
    const trap = (qi === 0 || qi === Q ? 0.5 : 1) * ((tB - tA) / Q)
    const w = Math.pow(Math.max(1e-6, speedAt(t)), exp) * trap
    const row = derivs.map((bd) => evalBD(bd, t))
    for (let i = 0; i < numCPs; i++) {
      if (row[i] === 0) continue
      for (let j = i; j < numCPs; j++) {
        if (row[j] === 0) continue
        const val = w * row[i] * row[j]
        M[i][j] += val
        if (i !== j) M[j][i] += val
      }
    }
  }
  return M
}

/**
 * k-th derivative of the i-th clamped dirac basis function, as a Bernstein
 * decomposition. Differentiating a scalar B-spline of degree p: knots lose
 * their first and last entry, control points Q_r = p·(P_{r+1}−P_r)/(u_{r+p+1}−u_{r+1}).
 */
function diracDerivativeBD(knots: number[], numCPs: number, degree: number, i: number, order: number) {
  let k = [...knots]
  let c = new Array<number>(numCPs).fill(0)
  c[i] = 1
  let p = degree
  for (let o = 0; o < order; o++) {
    const m = c.length
    const q = new Array<number>(m - 1)
    for (let r = 0; r < m - 1; r++) {
      const denom = k[r + p + 1] - k[r + 1]
      q[r] = Math.abs(denom) > 1e-14 ? (p * (c[r + 1] - c[r])) / denom : 0
    }
    c = q
    k = k.slice(1, -1)
    p -= 1
  }
  return decomposeToBernstein({ knots: k, controlPoints: c })
}

/**
 * Clamped fairness Gram matrix M[i][j] = ∫₀¹ B_i⁽ᵏ⁾(t)·B_j⁽ᵏ⁾(t) dt, where
 * k = derivative order for the energy type (strain=2, jerk=3, snap=4).
 */
export function computeOpenFairnessGramMatrix(
  knots: number[],
  numCPs: number,
  degree: number,
  energyType: FairnessEnergyType,
): number[][] {
  const order = fairnessDerivativeOrder(energyType)
  const derivs = Array.from({ length: numCPs }, (_, i) => diracDerivativeBD(knots, numCPs, degree, i, order))

  const M: number[][] = []
  for (let i = 0; i < numCPs; i++) M[i] = new Array<number>(numCPs).fill(0)
  for (let i = 0; i < numCPs; i++) {
    for (let j = i; j < numCPs; j++) {
      const product = derivs[i].multiply(derivs[j])
      const antideriv = integrateBD(product, 0)
      const lastSpan = antideriv.controlPointsArray[antideriv.controlPointsArray.length - 1]
      const value = lastSpan[lastSpan.length - 1] // ∫₀¹ = antiderivative at t=1 (0 at t=0)
      M[i][j] = value
      M[j][i] = value
    }
  }
  return M
}

/**
 * LOCALIZED fairness Gram matrix: the global fairness energy restricted to the
 * region [tA, tB]. We keep only the interactions among control points whose
 * Greville abscissa falls in [tA, tB], so the snap/jerk penalty smooths just
 * that stretch of the curve (driving it toward a spiral / monotone curvature)
 * while leaving the rest of the data fit untouched. Endpoints tA=0 / tB=1 make
 * the region reach an open-curve end.
 */
export function computeOpenFairnessGramMatrixLocal(
  knots: number[],
  numCPs: number,
  degree: number,
  energyType: FairnessEnergyType,
  tA: number,
  tB: number,
): number[][] {
  const M = computeOpenFairnessGramMatrix(knots, numCPs, degree, energyType)
  // Greville abscissa of control point i: mean of knots[i+1 .. i+degree].
  const inRegion = (i: number): boolean => {
    let s = 0
    for (let j = 1; j <= degree; j++) s += knots[i + j]
    const greville = s / degree
    return greville >= tA - 1e-9 && greville <= tB + 1e-9
  }
  const Mloc: number[][] = []
  for (let i = 0; i < numCPs; i++) Mloc[i] = new Array<number>(numCPs).fill(0)
  for (let i = 0; i < numCPs; i++) {
    if (!inRegion(i)) continue
    for (let j = 0; j < numCPs; j++) {
      if (inRegion(j)) Mloc[i][j] = M[i][j]
    }
  }
  return Mloc
}

/**
 * LOCALIZED fairness Gram via a true partial integral over [tA, tB]:
 * M[i][j] = ∫_{tA}^{tB} B_i⁽ᵏ⁾·B_j⁽ᵏ⁾ dt, snapped to whole knot spans.
 *
 * Unlike the Greville-cutoff version, every control point supporting the region
 * is penalized with its natural weight (no hard on/off boundary), so the energy
 * tapers smoothly and doesn't manufacture wiggles at the region edge.
 */
export function computeOpenFairnessGramMatrixLocalIntegral(
  knots: number[],
  numCPs: number,
  degree: number,
  energyType: FairnessEnergyType,
  tA: number,
  tB: number,
): number[][] {
  const order = fairnessDerivativeOrder(energyType)
  const derivs = Array.from({ length: numCPs }, (_, i) => diracDerivativeBD(knots, numCPs, degree, i, order))
  const distinct = [...new Set(knots)].sort((a, b) => a - b)
  // Span containing tA (s0) and tB (s1): largest s with distinct[s] <= t.
  let s0 = 0, s1 = distinct.length - 2
  for (let s = 0; s < distinct.length - 1; s++) { if (distinct[s] <= tA + 1e-9) s0 = s }
  for (let s = 0; s < distinct.length - 1; s++) { if (distinct[s] <= tB + 1e-9) s1 = s }

  const M: number[][] = []
  for (let i = 0; i < numCPs; i++) M[i] = new Array<number>(numCPs).fill(0)
  for (let i = 0; i < numCPs; i++) {
    for (let j = i; j < numCPs; j++) {
      const antideriv = integrateBD(derivs[i].multiply(derivs[j]), 0)
      const arr = antideriv.controlPointsArray
      const a = Math.max(0, Math.min(s0, arr.length - 1))
      const b = Math.max(0, Math.min(s1, arr.length - 1))
      // ∫_{distinct[a]}^{distinct[b+1]} = antiderivative at span-b end − span-a start.
      const value = arr[b][arr[b].length - 1] - arr[a][0]
      M[i][j] = value
      M[j][i] = value
    }
  }
  return M
}

/**
 * Pinned-endpoint fairness least squares: solve the interior control points of
 * a clamped B-spline minimizing data error + λ·fairness, holding P0/P_{n-1}.
 */
export function openFitPinnedFair(
  t: number[],
  dataX: number[],
  dataY: number[],
  pinStart: Point2D,
  pinEnd: Point2D,
  numCPs: number,
  degree: number,
  lambda: number,
  gram: number[][],
  knots: number[],
): { cpX: number[]; cpY: number[] } | null {
  const B = buildClampedBasisMatrix(t, degree, knots, numCPs)
  const m = t.length
  const last = numCPs - 1
  const nInt = numCPs - 2

  // Endpoint-corrected data and interior basis.
  const Bint: number[][] = []
  const dx = new Array<number>(m)
  const dy = new Array<number>(m)
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(nInt)
    for (let j = 0; j < nInt; j++) row[j] = B[i][j + 1]
    Bint.push(row)
    dx[i] = dataX[i] - B[i][0] * pinStart.x - B[i][last] * pinEnd.x
    dy[i] = dataY[i] - B[i][0] * pinStart.y - B[i][last] * pinEnd.y
  }

  // A = Bint^T Bint + λ M_int.
  const A: number[][] = []
  for (let i = 0; i < nInt; i++) A[i] = new Array<number>(nInt).fill(0)
  for (let i = 0; i < nInt; i++) {
    for (let j = i; j < nInt; j++) {
      let s = 0
      for (let kk = 0; kk < m; kk++) s += Bint[kk][i] * Bint[kk][j]
      const v = s + lambda * gram[i + 1][j + 1]
      A[i][j] = v
      A[j][i] = v
    }
  }

  // RHS = Bint^T d' − λ (M[interior][end0]·pinStart + M[interior][endN]·pinEnd).
  const bx = new Array<number>(nInt).fill(0)
  const by = new Array<number>(nInt).fill(0)
  for (let j = 0; j < nInt; j++) {
    let sx = 0, sy = 0
    for (let i = 0; i < m; i++) { sx += Bint[i][j] * dx[i]; sy += Bint[i][j] * dy[i] }
    const mEnd0 = gram[j + 1][0]
    const mEndN = gram[j + 1][last]
    bx[j] = sx - lambda * (mEnd0 * pinStart.x + mEndN * pinEnd.x)
    by[j] = sy - lambda * (mEnd0 * pinStart.y + mEndN * pinEnd.y)
  }

  let solX = choleskySolve(A, bx)
  let solY = choleskySolve(A, by)
  if (!solX.success) solX = luSolve(A, bx)
  if (!solY.success) solY = luSolve(A, by)
  if (!solX.success || !solY.success) return null

  return {
    cpX: [pinStart.x, ...solX.x, pinEnd.x],
    cpY: [pinStart.y, ...solY.x, pinEnd.y],
  }
}
