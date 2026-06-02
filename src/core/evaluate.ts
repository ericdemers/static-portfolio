import type { Coeffs } from './coeffs'
import { findOpenSpan, findPeriodicSpan, openBasis, periodicBasis, mod, wrap01 } from './basis'

/**
 * Evaluate a B-spline at parameter `t`.
 *
 * One implementation for a scalar function or a plain / rational /
 * complex-rational curve (selected by `coeffs`), open or periodic (selected by
 * `closed`). For a closed rational/complex curve whose seam weight differs from
 * w₀, pass the spiral ratio (wrapWeight / w₀): positions stay periodic while
 * weights spiral, and the projection cancels the ratio so the curve closes.
 * (See coeffs.ts for `realSpiralRatio` / `complexSpiralRatio`.)
 */
export function evaluate<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  degree: number,
  knots: readonly number[],
  t: number,
  closed = false,
  spiralRatio?: S,
): Out {
  const n = controlPoints.length
  const tt = closed ? wrap01(t) : t
  const span = closed ? findPeriodicSpan(knots, tt) : findOpenSpan(degree, knots, tt)
  const basis = closed
    ? periodicBasis(span, tt, degree, knots)
    : openBasis(span, tt, degree, knots)

  let acc = coeffs.zero()
  for (let i = 0; i <= degree; i++) {
    const raw = span - degree + i
    const idx = closed ? mod(raw, n) : raw
    let h = coeffs.lift(controlPoints[idx])
    if (closed && spiralRatio !== undefined) {
      const q = Math.floor(raw / n) // which period this wrapped index lies in
      if (q !== 0) h = coeffs.scale(h, coeffs.spow(spiralRatio, q))
    }
    acc = coeffs.madd(acc, basis[i], h)
  }
  return coeffs.project(acc)
}
