import type { Coeffs } from './coeffs'
import { findOpenSpan, findPeriodicSpan, periodicKnotAt, mod, wrap01 } from './basis'

/** Affine blend (1−a)·p + a·q in homogeneous space, built from a Coeffs. */
function homLerp<CP, H, S, Out>(c: Coeffs<CP, H, S, Out>) {
  return (p: H, q: H, a: number): H => c.madd(c.madd(c.zero(), 1 - a, p), a, q)
}

/**
 * Insert a single knot into a B-spline (function or curve), open or periodic.
 * The curve/function is unchanged; its representation gains one control point
 * and one knot. For a closed rational/complex curve, pass the spiral ratio
 * (wrapWeight / w₀); it is invariant under insertion, so the SAME ratio drives
 * `evaluate` before and after.
 */
export function insertKnot<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  degree: number,
  knots: readonly number[],
  tBar: number,
  closed = false,
  spiralRatio?: S,
): { controlPoints: CP[]; knots: number[] } {
  return closed
    ? insertKnotPeriodic(coeffs, controlPoints, degree, knots, tBar, spiralRatio)
    : insertKnotOpen(coeffs, controlPoints, degree, knots, tBar)
}

/**
 * Insert a single knot `tBar` into an OPEN (clamped) B-spline (Boehm).
 *
 * Generic over the coefficient field: one implementation for scalar functions
 * and plain / rational / complex curves. Rational & complex blend in
 * homogeneous space (`lift`), the only correct space, then `unlift` back.
 */
export function insertKnotOpen<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  degree: number,
  knots: readonly number[],
  tBar: number,
): { controlPoints: CP[]; knots: number[] } {
  const lerp = homLerp(coeffs)
  const k = findOpenSpan(degree, knots, tBar)
  const h = controlPoints.map((cp) => coeffs.lift(cp))
  const n = controlPoints.length

  const q: H[] = new Array<H>(n + 1)
  for (let i = 0; i <= k - degree; i++) q[i] = h[i]
  for (let i = k + 1; i <= n; i++) q[i] = h[i - 1]
  for (let i = k - degree + 1; i <= k; i++) {
    const denom = knots[i + degree] - knots[i]
    const a = denom === 0 ? 0 : (tBar - knots[i]) / denom
    q[i] = lerp(h[i - 1], h[i], a)
  }

  const newKnots = [...knots.slice(0, k + 1), tBar, ...knots.slice(k + 1)]
  return { controlPoints: q.map((hh) => coeffs.unlift(hh)), knots: newKnots }
}

/**
 * Insert a single knot `tBar ∈ [0,1)` into a PERIODIC B-spline stored as one
 * period (n control points, n knots in [0,1)).
 *
 * Strategy: view the curve in the bi-infinite index frame with a spiral-aware
 * control-point accessor `Hat`. Compute one new period of de Boor points
 * (n+1 of them) by Boehm's blend, then fold each back to canonical [0,1)
 * storage — de-spiralling by the knot's integer period — and sort by knot. The
 * monodromy `ratio` is unchanged, so the result evaluates identically under
 * the same `spiralRatio`.
 */
export function insertKnotPeriodic<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  degree: number,
  knots: readonly number[],
  tBar: number,
  spiralRatio?: S,
): { controlPoints: CP[]; knots: number[] } {
  const n = controlPoints.length
  const ratio = spiralRatio ?? coeffs.one
  const lerp = homLerp(coeffs)

  const tau = (i: number) => periodicKnotAt(knots, i) // period 1
  const Hat = (i: number): H => {
    const base = coeffs.lift(controlPoints[mod(i, n)])
    const q = Math.floor(i / n)
    return q === 0 ? base : coeffs.scale(base, coeffs.spow(ratio, q))
  }

  const u = wrap01(tBar)
  const k = findPeriodicSpan(knots, u)
  // Lift u into the span's actual interval [tau(k), tau(k+1)) (handles the seam).
  const uEff = u < tau(k) ? u + 1 : u

  // New de Boor point at bi-infinite new index j (single insertion in this period).
  const newDeBoor = (j: number): H => {
    if (j <= k - degree) return Hat(j)
    if (j <= k) {
      const denom = tau(j + degree) - tau(j)
      const a = denom === 0 ? 0 : (uEff - tau(j)) / denom
      return lerp(Hat(j - 1), Hat(j), a)
    }
    return Hat(j - 1)
  }

  // One new period: new indices [k-degree+1 .. k-degree+1+n]. Fold each point
  // back to canonical [0,1) storage by removing its knot's integer period.
  const startJ = k - degree + 1
  const pairs: { knot: number; cp: H }[] = []
  for (let s = 0; s <= n; s++) {
    const j = startJ + s
    const rawKnot = j <= k ? tau(j) : j === k + 1 ? uEff : tau(j - 1)
    const per = Math.floor(rawKnot)
    pairs.push({
      knot: rawKnot - per,
      cp: coeffs.scale(newDeBoor(j), coeffs.spow(ratio, -per)),
    })
  }
  pairs.sort((a, b) => a.knot - b.knot)

  return {
    controlPoints: pairs.map((p) => coeffs.unlift(p.cp)),
    knots: pairs.map((p) => p.knot),
  }
}
