/**
 * Degree-targeted reduction by sample-and-solve.
 *
 * The generic Lie-coordinate readback produces a high-degree rational surface
 * with a large removable common factor. Rather than form it and run a fragile
 * high-degree GCD, we exploit that we can evaluate the (reduced) surface exactly
 * via the numerical Picture-1 pipeline, and fit the minimal-degree rational form
 * directly from samples — a single linear least-squares at the known low degree.
 * This is the resultant/cofactor family of (approximate) GCD, posed at the target
 * degree so the conditioning is governed by d_low, not the inflated degree.
 *
 * This module does the 1-D (meridian) case: a complex-rational Bézier z = N/D.
 */

/** Bernstein basis values B_i^n(u), i = 0..n (stable triangular recurrence). */
export function bernsteinBasis(n: number, u: number): number[] {
  const b = new Array(n + 1).fill(0)
  b[0] = 1
  const u1 = 1 - u
  for (let j = 1; j <= n; j++) {
    let saved = 0
    for (let i = 0; i < j; i++) {
      const tmp = b[i]
      b[i] = saved + u1 * tmp
      saved = u * tmp
    }
    b[j] = saved
  }
  return b
}

/** Bernstein basis derivatives d/du B_i^n(u), i = 0..n. B_i^n' = n(B_{i-1}^{n-1} − B_i^{n-1}). */
export function bernsteinBasisDeriv(n: number, u: number): number[] {
  if (n === 0) return [0]
  const lower = bernsteinBasis(n - 1, u) // B_i^{n-1}, i = 0..n-1
  const d = new Array(n + 1).fill(0)
  for (let i = 0; i <= n; i++) {
    const a = i - 1 >= 0 ? lower[i - 1] : 0
    const b = i < n ? lower[i] : 0
    d[i] = n * (a - b)
  }
  return d
}

/** Least squares min ‖A x − b‖ via Householder QR. A is m×n with m ≥ n. */
export function lstsq(A: number[][], b: number[]): number[] {
  const m = A.length
  const n = A[0].length
  const R = A.map((row) => row.slice())
  const y = b.slice()

  for (let k = 0; k < n; k++) {
    let normx = 0
    for (let i = k; i < m; i++) normx += R[i][k] * R[i][k]
    normx = Math.sqrt(normx)
    if (normx === 0) continue
    const alpha = R[k][k] >= 0 ? -normx : normx
    const v = new Array(m).fill(0)
    for (let i = k; i < m; i++) v[i] = R[i][k]
    v[k] -= alpha
    let vv = 0
    for (let i = k; i < m; i++) vv += v[i] * v[i]
    if (vv === 0) continue
    for (let j = k; j < n; j++) {
      let dot = 0
      for (let i = k; i < m; i++) dot += v[i] * R[i][j]
      const f = (2 * dot) / vv
      for (let i = k; i < m; i++) R[i][j] -= f * v[i]
    }
    let dy = 0
    for (let i = k; i < m; i++) dy += v[i] * y[i]
    const fy = (2 * dy) / vv
    for (let i = k; i < m; i++) y[i] -= fy * v[i]
  }

  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]
    for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j]
    x[i] = Math.abs(R[i][i]) < 1e-300 ? 0 : s / R[i][i]
  }
  return x
}

export interface ComplexRationalCurve {
  numRe: number[]
  numIm: number[]
  denRe: number[]
  denIm: number[]
  degree: number
}

export interface ComplexSample {
  /** Parameter in [0, 1]. */
  u: number
  re: number
  im: number
}

/**
 * Fit a degree-`degree` complex-rational Bézier z(u) = N(u)/D(u) to samples,
 * with the gauge D_0 = 1 fixing the projective scale. Each sample gives the two
 * real equations from N(u_k) − z_k·D(u_k) = 0.
 */
export function fitComplexRational(samples: ComplexSample[], degree: number): ComplexRationalCurve {
  const nNum = degree + 1 // num_0..num_degree (complex)
  const nDenFree = degree // den_1..den_degree (complex); den_0 = 1 fixed
  // unknown layout: [numRe(0..d) | numIm(0..d) | denRe(1..d) | denIm(1..d)]
  const offNumIm = nNum
  const offDenRe = 2 * nNum
  const offDenIm = 2 * nNum + nDenFree
  const nUnknown = 2 * nNum + 2 * nDenFree

  const A: number[][] = []
  const rhs: number[] = []

  for (const { u, re: zr, im: zi } of samples) {
    const B = bernsteinBasis(degree, u)

    // Real part of N − z·D = 0:
    //   numRe·B − [ zr·denRe − zi·denIm ] = 0, with denRe = B_0 + Σ_{i≥1} denRe_i B_i.
    const rowR = new Array(nUnknown).fill(0)
    for (let i = 0; i <= degree; i++) rowR[i] = B[i] // numRe_i
    for (let i = 1; i <= degree; i++) {
      rowR[offDenRe + (i - 1)] += -zr * B[i] // denRe_i
      rowR[offDenIm + (i - 1)] += zi * B[i] // denIm_i
    }
    A.push(rowR)
    rhs.push(zr * B[0]) // moved fixed den_0 = 1 term to RHS

    // Imag part of N − z·D = 0:
    //   numIm·B − [ zr·denIm + zi·denRe ] = 0
    const rowI = new Array(nUnknown).fill(0)
    for (let i = 0; i <= degree; i++) rowI[offNumIm + i] = B[i] // numIm_i
    for (let i = 1; i <= degree; i++) {
      rowI[offDenRe + (i - 1)] += -zi * B[i] // denRe_i
      rowI[offDenIm + (i - 1)] += -zr * B[i] // denIm_i
    }
    A.push(rowI)
    rhs.push(zi * B[0])
  }

  const x = lstsq(A, rhs)

  const numRe: number[] = []
  const numIm: number[] = []
  const denRe: number[] = [1]
  const denIm: number[] = [0]
  for (let i = 0; i <= degree; i++) {
    numRe.push(x[i])
    numIm.push(x[offNumIm + i])
  }
  for (let i = 1; i <= degree; i++) {
    denRe.push(x[offDenRe + (i - 1)])
    denIm.push(x[offDenIm + (i - 1)])
  }
  return { numRe, numIm, denRe, denIm, degree }
}

export function evalComplexRational(c: ComplexRationalCurve, u: number): { re: number; im: number } {
  const B = bernsteinBasis(c.degree, u)
  let nr = 0
  let ni = 0
  let dr = 0
  let di = 0
  for (let i = 0; i <= c.degree; i++) {
    nr += c.numRe[i] * B[i]
    ni += c.numIm[i] * B[i]
    dr += c.denRe[i] * B[i]
    di += c.denIm[i] * B[i]
  }
  const d2 = dr * dr + di * di
  return { re: (nr * dr + ni * di) / d2, im: (ni * dr - nr * di) / d2 }
}

// ---- Real rational curve fit (common real denominator) ----
// A sample optionally carries a tangent DIRECTION (tx,ty); when present, a G¹
// constraint (curve tangent ∥ (tx,ty)) is added. The direction need not be unit.
export interface RealSample { u: number; x: number; y: number; tx?: number; ty?: number }
export interface RealRationalCurve { numX: number[]; numY: number[]; den: number[]; degree: number }

/**
 * Fit a degree-`degree` REAL rational Bézier (x,y)(u) = (Nx,Ny)(u)/D(u) to
 * samples, gauge D_0 = 1. Each sample gives two point equations N − point·D = 0,
 * and — if it carries a tangent — one G¹ equation. The tangent constraint is
 * LINEAR: substituting the point condition N(u)=p·D(u) gives curve'(u) ∝
 * N'(u) − p·D'(u), so "tangent ∥ (tx,ty)" is
 *   ty·(Nx' − x·D') − tx·(Ny' − y·D') = 0.
 * Point+tangent samples pin down the denominator (weights), which points alone
 * leave under-constrained — yielding a clean, hull-respecting NURBS instead of a
 * wild least-squares polygon. Used for the Lie-sphere image of a PH curve.
 */
export function fitRealRational(samples: RealSample[], degree: number): RealRationalCurve {
  const nN = degree + 1
  const offNy = nN
  const offD = 2 * nN
  const nUnknown = 2 * nN + degree // numX(d+1) + numY(d+1) + den_1..d
  const A: number[][] = []
  const rhs: number[] = []
  for (const { u, x, y, tx, ty } of samples) {
    const B = bernsteinBasis(degree, u)
    const rowX = new Array(nUnknown).fill(0)
    for (let i = 0; i <= degree; i++) rowX[i] = B[i]
    for (let i = 1; i <= degree; i++) rowX[offD + (i - 1)] += -x * B[i]
    A.push(rowX); rhs.push(x * B[0])
    const rowY = new Array(nUnknown).fill(0)
    for (let i = 0; i <= degree; i++) rowY[offNy + i] = B[i]
    for (let i = 1; i <= degree; i++) rowY[offD + (i - 1)] += -y * B[i]
    A.push(rowY); rhs.push(y * B[0])
    if (tx !== undefined && ty !== undefined) {
      const Bp = bernsteinBasisDeriv(degree, u)
      const rowT = new Array(nUnknown).fill(0)
      for (let i = 0; i <= degree; i++) { rowT[i] += ty * Bp[i]; rowT[offNy + i] += -tx * Bp[i] }
      for (let i = 1; i <= degree; i++) rowT[offD + (i - 1)] += (tx * y - ty * x) * Bp[i]
      A.push(rowT); rhs.push((ty * x - tx * y) * Bp[0])
    }
  }
  const s = lstsq(A, rhs)
  const numX: number[] = []
  const numY: number[] = []
  const den: number[] = [1]
  for (let i = 0; i <= degree; i++) { numX.push(s[i]); numY.push(s[offNy + i]) }
  for (let i = 1; i <= degree; i++) den.push(s[offD + (i - 1)])
  return { numX, numY, den, degree }
}

export function evalRealRational(c: RealRationalCurve, u: number): { x: number; y: number } {
  const B = bernsteinBasis(c.degree, u)
  let nx = 0, ny = 0, d = 0
  for (let i = 0; i <= c.degree; i++) { nx += c.numX[i] * B[i]; ny += c.numY[i] * B[i]; d += c.den[i] * B[i] }
  return { x: nx / d, y: ny / d }
}

/**
 * Degree-elevate a real rational Bézier to `target` (≥ its degree), preserving
 * the curve EXACTLY. Standard Bernstein elevation of the homogeneous coefficients
 * (numX, numY, den). Unlike fitting directly at the higher degree (which is
 * non-unique — an arbitrary common factor), elevation is unique and POSITIVITY-
 * preserving (each elevated coeff is a convex combination), so a positive-weight
 * curve stays positive-weight.
 */
export function elevateRealRational(c: RealRationalCurve, target: number): RealRationalCurve {
  let { numX, numY, den, degree } = c
  const el = (a: number[], d: number) => {
    const o = new Array(d + 2).fill(0)
    for (let i = 0; i <= d + 1; i++) {
      const al = i / (d + 1)
      o[i] = (i > 0 ? al * a[i - 1] : 0) + (i <= d ? (1 - al) * a[i] : 0)
    }
    return o
  }
  while (degree < target) { numX = el(numX, degree); numY = el(numY, degree); den = el(den, degree); degree++ }
  return { numX, numY, den, degree }
}

/**
 * Normalize weights toward uniform via the gauge freedom (numX,numY,den)_i →
 * ·(c·tⁱ): control points x_i = numX_i/den_i are UNCHANGED and the curve trace is
 * preserved (it's a parameter Möbius), while the weights become w_i·c·tⁱ chosen so
 * w_0 = w_n = 1 (Farin's symmetric form). Sign-preserving — apply to a positive-
 * weight curve. No-op if an end weight is non-positive.
 */
export function normalizeRealRationalWeights(c: RealRationalCurve): RealRationalCurve {
  const n = c.degree, w0 = c.den[0], wn = c.den[n]
  if (!(w0 > 0) || !(wn > 0)) return c
  const t = Math.pow(w0 / wn, 1 / n), s = 1 / w0
  const scale = (a: number[]) => a.map((v, i) => v * s * Math.pow(t, i))
  return { numX: scale(c.numX), numY: scale(c.numY), den: scale(c.den), degree: n }
}
