import type { Coeffs } from './coeffs'
import { findOpenSpan } from './basis'

/** Affine blend (1−a)·p + a·q in homogeneous space, built from a Coeffs. */
function homLerp<CP, H, S, Out>(c: Coeffs<CP, H, S, Out>) {
  return (p: H, q: H, a: number): H => c.madd(c.madd(c.zero(), 1 - a, p), a, q)
}

/**
 * Insert a single knot `tBar` into an OPEN (clamped) B-spline (Boehm).
 *
 * Generic over the coefficient field, so one implementation serves scalar
 * functions and plain / rational / complex curves. Rational & complex are
 * blended in homogeneous space (the only correct space — `lift`), then
 * projected back to control points (`unlift`). The curve/function is
 * unchanged; only its representation gains one control point and one knot.
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
