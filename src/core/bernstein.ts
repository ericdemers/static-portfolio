import { scalarCoeffs } from './coeffs'
import { insertKnotOpen } from './insert'

// ============================================================================
// B-spline FUNCTION algebra in Bernstein form.
//
// A B-spline function f: ℝ → ℝ is stored as its per-span Bézier (Bernstein)
// coefficients. Add / subtract / multiply / derivative all return another such
// function — a closed algebra. This is the substrate for the curvature numerator
// g(t): its Bernstein coefficients' sign changes bound the curvature extrema
// (Schoenberg's variation-diminishing property).
// ============================================================================

/** Binomial coefficient C(n, k). */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}

/** Distinct knot values (breakpoints). */
function distinctKnots(knots: readonly number[], eps = 1e-10): number[] {
  const out: number[] = []
  for (const k of knots) {
    if (out.length === 0 || Math.abs(k - out[out.length - 1]) > eps) out.push(k)
  }
  return out
}

/** Degree-elevate a single Bernstein polynomial to `targetDegree`. */
function bernsteinElevate(coeffs: number[], targetDegree: number): number[] {
  let result = coeffs
  while (result.length - 1 < targetDegree) {
    const n = result.length - 1
    const elevated = new Array<number>(n + 2)
    for (let i = 0; i <= n + 1; i++) {
      const a = i / (n + 1)
      const prev = i > 0 ? result[i - 1] : 0
      const curr = i <= n ? result[i] : 0
      elevated[i] = a * prev + (1 - a) * curr
    }
    result = elevated
  }
  return result
}

/** Product of two Bernstein polynomials (on the same interval): degree p+q. */
function bernsteinMultiply(f: number[], g: number[]): number[] {
  const p = f.length - 1
  const q = g.length - 1
  const fs = f.map((v, i) => v * binomial(p, i))
  const gs = g.map((v, j) => v * binomial(q, j))
  const out: number[] = []
  for (let k = 0; k <= p + q; k++) {
    let c = 0
    for (let i = Math.max(0, k - q); i <= Math.min(p, k); i++) c += fs[i] * gs[k - i]
    out[k] = c / binomial(p + q, k)
  }
  return out
}

/**
 * A B-spline function in Bernstein form: `coeffs[s]` are the degree-d Bézier
 * coefficients on span [breaks[s], breaks[s+1]].
 */
export class BernsteinDecomposition {
  readonly coeffs: number[][]
  readonly breaks: number[]

  constructor(coeffs: number[][], breaks: number[]) {
    this.coeffs = coeffs
    this.breaks = breaks
  }

  get degree(): number {
    return this.coeffs.length > 0 ? this.coeffs[0].length - 1 : 0
  }
  get numSpans(): number {
    return this.coeffs.length
  }

  private combine(other: BernsteinDecomposition, sign: 1 | -1): BernsteinDecomposition {
    const out: number[][] = []
    for (let s = 0; s < this.coeffs.length; s++) {
      let a = this.coeffs[s]
      let b = other.coeffs[s]
      const deg = Math.max(a.length, b.length) - 1
      if (a.length - 1 < deg) a = bernsteinElevate(a, deg)
      if (b.length - 1 < deg) b = bernsteinElevate(b, deg)
      out[s] = a.map((v, i) => v + sign * b[i])
    }
    return new BernsteinDecomposition(out, this.breaks)
  }

  add(other: BernsteinDecomposition): BernsteinDecomposition {
    return this.combine(other, 1)
  }
  subtract(other: BernsteinDecomposition): BernsteinDecomposition {
    return this.combine(other, -1)
  }

  /** Pointwise product f·g (degree adds), span by span. */
  multiply(other: BernsteinDecomposition): BernsteinDecomposition {
    const out = this.coeffs.map((c, s) => bernsteinMultiply(c, other.coeffs[s]))
    return new BernsteinDecomposition(out, this.breaks)
  }

  scale(value: number): BernsteinDecomposition {
    return new BernsteinDecomposition(
      this.coeffs.map((c) => c.map((v) => v * value)),
      this.breaks,
    )
  }

  /** Derivative f′ (degree − 1), accounting for each span's width. */
  derivative(): BernsteinDecomposition {
    const p = this.degree
    if (p === 0) {
      return new BernsteinDecomposition(this.coeffs.map(() => [0]), this.breaks)
    }
    const out: number[][] = []
    for (let s = 0; s < this.coeffs.length; s++) {
      const c = this.coeffs[s]
      const interval = this.breaks[s + 1] - this.breaks[s]
      const d: number[] = []
      for (let i = 0; i < p; i++) d.push((p * (c[i + 1] - c[i])) / interval)
      out.push(d)
    }
    return new BernsteinDecomposition(out, this.breaks)
  }

  /** Evaluate at parameter t (de Casteljau on the containing span). */
  evaluate(t: number): number {
    let s = 0
    while (s < this.breaks.length - 2 && t > this.breaks[s + 1]) s++
    const tA = this.breaks[s]
    const tB = this.breaks[s + 1]
    const u = tB === tA ? 0 : (t - tA) / (tB - tA)
    const work = [...this.coeffs[s]]
    for (let r = 1; r < work.length; r++) {
      for (let i = 0; i < work.length - r; i++) work[i] = (1 - u) * work[i] + u * work[i + 1]
    }
    return work[0]
  }

  /** All Bernstein coefficients, concatenated across spans. */
  flatCoeffs(): number[] {
    return this.coeffs.flat()
  }

  /**
   * Number of strict sign changes S⁻ in the Bernstein coefficients (zeros
   * skipped). By the variation-diminishing property this bounds the number of
   * zeros of f — for g(t) that is the bound on the number of curvature extrema.
   */
  signChanges(): number {
    let changes = 0
    let prev = 0
    for (const v of this.flatCoeffs()) {
      const s = Math.sign(v)
      if (s !== 0) {
        if (prev !== 0 && s !== prev) changes++
        prev = s
      }
    }
    return changes
  }
}

/**
 * Decompose a scalar B-spline function (open/clamped) into Bernstein form by
 * inserting each interior knot to full multiplicity (reusing core knot
 * insertion), then reading off the per-span Bézier coefficients.
 */
export function decomposeToBernstein(
  coeffs: readonly number[],
  knots: readonly number[],
  degree: number,
): BernsteinDecomposition {
  const breaks = distinctKnots(knots)
  let c = [...coeffs]
  let k = [...knots]

  for (let bi = 1; bi < breaks.length - 1; bi++) {
    const v = breaks[bi]
    let mult = k.filter((x) => Math.abs(x - v) < 1e-10).length
    while (mult < degree) {
      const res = insertKnotOpen(scalarCoeffs, c, degree, k, v)
      c = res.controlPoints
      k = res.knots
      mult++
    }
  }

  const numSpans = breaks.length - 1
  const spanCoeffs: number[][] = []
  for (let s = 0; s < numSpans; s++) {
    spanCoeffs.push(c.slice(s * degree, s * degree + degree + 1))
  }
  return new BernsteinDecomposition(spanCoeffs, breaks)
}
