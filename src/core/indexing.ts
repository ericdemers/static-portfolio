import type { Coeffs } from './coeffs'
import { findOpenSpan, findPeriodicSpan, periodicKnotAt, mod } from './basis'

// ============================================================================
// Topology abstraction: open vs periodic, behind bi-infinite accessors.
//
// This is the second of the two orthogonal axes (the first is the coefficient
// field, Coeffs). `Indexing` answers "what is knot i?" and "what is the
// (homogeneous) control point at index i?" for any integer index — with the
// periodic wrap AND the weight spiral folded in. Every de Boor / blossom
// algorithm is then written ONCE against it, so the wrap/spiral arithmetic
// lives in exactly one place instead of being re-derived per operation.
// ============================================================================

export interface Indexing<H> {
  readonly count: number
  readonly closed: boolean
  /** Knot value at any (bi-infinite) index. */
  knotAt(i: number): number
  /** Homogeneous control point at any index — periodic wrap + spiral applied. */
  homAt(i: number): H
  /** Span index containing parameter t (t in the open domain, or [0,1) periodic). */
  span(t: number): number
}

const clampIndex = (i: number, n: number) => Math.max(0, Math.min(i, n - 1))

export function makeIndexing<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  knots: readonly number[],
  degree: number,
  closed: boolean,
  spiralRatio?: S,
): Indexing<H> {
  const n = controlPoints.length
  if (!closed) {
    return {
      count: n,
      closed: false,
      knotAt: (i) => knots[clampIndex(i, knots.length)],
      homAt: (i) => coeffs.lift(controlPoints[clampIndex(i, n)]),
      span: (t) => findOpenSpan(degree, knots, t),
    }
  }
  const ratio = spiralRatio ?? coeffs.one
  return {
    count: n,
    closed: true,
    knotAt: (i) => periodicKnotAt(knots, i),
    homAt: (i) => {
      const base = coeffs.lift(controlPoints[mod(i, n)])
      const q = Math.floor(i / n)
      return q === 0 ? base : coeffs.scale(base, coeffs.spow(ratio, q))
    },
    // t is the knot/parameter value directly (already in [0,1) for periodic) —
    // never re-wrapped here, which is what avoids the float-fragile span bug.
    span: (t) => findPeriodicSpan(knots, t),
  }
}

/**
 * Unified de Boor recursion in homogeneous space. With `args` all equal to t it
 * evaluates the curve; with a different argument per level it is the blossom
 * (polar form) — used for Bernstein extraction and degree elevation. Open vs
 * periodic is entirely captured by `ix`.
 */
export function deBoor<CP, H, S, Out>(
  ix: Indexing<H>,
  coeffs: Coeffs<CP, H, S, Out>,
  span: number,
  degree: number,
  args: readonly number[],
): H {
  const lerp = (p: H, q: H, a: number) => coeffs.madd(coeffs.madd(coeffs.zero(), 1 - a, p), a, q)
  const d: H[] = []
  for (let j = 0; j <= degree; j++) d.push(ix.homAt(span - degree + j))
  for (let r = 1; r <= degree; r++) {
    const u = args[r - 1]
    for (let j = degree; j >= r; j--) {
      const i = span - degree + j
      const denom = ix.knotAt(span + 1 - r + j) - ix.knotAt(i)
      const a = Math.abs(denom) < 1e-14 ? 0.5 : (u - ix.knotAt(i)) / denom
      d[j] = lerp(d[j - 1], d[j], a)
    }
  }
  return d[degree]
}
