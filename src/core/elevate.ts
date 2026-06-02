import type { Coeffs } from './coeffs'
import { findOpenSpan } from './basis'

/** Group consecutive equal knots into [value, multiplicity] pairs. */
function groupKnots(knots: readonly number[], eps = 1e-10): Array<[number, number]> {
  const groups: Array<[number, number]> = []
  if (knots.length === 0) return groups
  let value = knots[0]
  let count = 1
  for (let i = 1; i < knots.length; i++) {
    if (Math.abs(knots[i] - value) < eps) {
      count++
    } else {
      groups.push([value, count])
      value = knots[i]
      count = 1
    }
  }
  groups.push([value, count])
  return groups
}

/**
 * Degree-p blossom (polar form) of an open B-spline at p arguments, evaluated
 * in homogeneous space by the de Boor recursion using argument args[r-1] at
 * level r. Affine throughout, so it serves every coefficient field.
 */
function blossomHom<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  h: readonly H[],
  knots: readonly number[],
  degree: number,
  args: readonly number[],
): H {
  if (degree === 0) return h[0]
  const lerp = (p: H, q: H, a: number) =>
    coeffs.madd(coeffs.madd(coeffs.zero(), 1 - a, p), a, q)

  const k = findOpenSpan(degree, knots, args[0])
  const d: H[] = []
  for (let j = 0; j <= degree; j++) {
    const idx = Math.max(0, Math.min(k - degree + j, h.length - 1))
    d.push(h[idx])
  }
  for (let r = 1; r <= degree; r++) {
    const u = args[r - 1]
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const denom = knots[k + 1 - r + j] - knots[i]
      const a = Math.abs(denom) < 1e-14 ? 0.5 : (u - knots[i]) / denom
      d[j] = lerp(d[j - 1], d[j], a)
    }
  }
  return d[degree]
}

/**
 * Elevate the degree of an OPEN B-spline (function or curve) by one, via
 * blossoming. Returns the MINIMAL elevated representation directly — each
 * distinct knot's multiplicity is raised by one, preserving continuity, with
 * no decompose/knot-removal round-trip. Rational/complex are elevated in
 * homogeneous space (lift), then projected back (unlift).
 *
 * Each new control point is the average of the degree-p blossom over the p+1
 * "leave-one-out" subsets of its p+1 de Boor knots.
 */
export function elevateDegreeOpen<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  knots: readonly number[],
  degree: number,
): { controlPoints: CP[]; knots: number[]; degree: number } {
  const p = degree
  const h = controlPoints.map((cp) => coeffs.lift(cp))

  const elevatedKnots: number[] = []
  for (const [value, mult] of groupKnots(knots)) {
    for (let i = 0; i < mult + 1; i++) elevatedKnots.push(value)
  }

  const newN = elevatedKnots.length - (p + 1) - 1
  const newCps: CP[] = []
  for (let j = 0; j < newN; j++) {
    const args: number[] = []
    for (let i = 0; i <= p; i++) args.push(elevatedKnots[j + 1 + i])

    let acc = coeffs.zero()
    for (let leaveOut = 0; leaveOut <= p; leaveOut++) {
      const reduced = [...args.slice(0, leaveOut), ...args.slice(leaveOut + 1)]
      acc = coeffs.madd(acc, 1, blossomHom(coeffs, h, knots, p, reduced))
    }
    newCps.push(coeffs.unlift(coeffs.madd(coeffs.zero(), 1 / (p + 1), acc)))
  }

  return { controlPoints: newCps, knots: elevatedKnots, degree: p + 1 }
}
