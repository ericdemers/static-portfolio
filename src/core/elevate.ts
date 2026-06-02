import type { Coeffs } from './coeffs'
import { findOpenSpan, findPeriodicSpan, periodicKnotAt, mod, wrap01 } from './basis'

/** Affine blend (1−a)·p + a·q in homogeneous space, built from a Coeffs. */
function makeLerp<CP, H, S, Out>(c: Coeffs<CP, H, S, Out>) {
  return (p: H, q: H, a: number): H => c.madd(c.madd(c.zero(), 1 - a, p), a, q)
}

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

/** Knots after elevating degree by one: each distinct value's multiplicity +1. */
function elevatedKnotVector(knots: readonly number[]): number[] {
  const out: number[] = []
  for (const [value, mult] of groupKnots(knots)) {
    for (let i = 0; i < mult + 1; i++) out.push(value)
  }
  return out
}

/**
 * Degree-p blossom (polar form) of an OPEN B-spline at p arguments, evaluated
 * in homogeneous space by the de Boor recursion (argument args[r-1] at level r).
 */
function blossomHomOpen<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  h: readonly H[],
  knots: readonly number[],
  degree: number,
  args: readonly number[],
): H {
  if (degree === 0) return h[0]
  const lerp = makeLerp(coeffs)
  const k = findOpenSpan(degree, knots, args[0])
  const d: H[] = []
  for (let j = 0; j <= degree; j++) {
    d.push(h[Math.max(0, Math.min(k - degree + j, h.length - 1))])
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
 * Degree-p blossom of a PERIODIC B-spline (one period of cps/knots) at p
 * arguments, in the bi-infinite index frame with a spiral-aware accessor.
 */
function blossomHomPeriodic<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  cps: readonly CP[],
  knots: readonly number[],
  degree: number,
  ratio: S,
  args: readonly number[],
): H {
  const n = cps.length
  const lerp = makeLerp(coeffs)
  const tau = (i: number) => periodicKnotAt(knots, i)
  const Hat = (i: number): H => {
    const base = coeffs.lift(cps[mod(i, n)])
    const q = Math.floor(i / n)
    return q === 0 ? base : coeffs.scale(base, coeffs.spow(ratio, q))
  }
  if (degree === 0) return Hat(0)

  // Bi-infinite span containing args[0].
  const u0 = args[0]
  const k = findPeriodicSpan(knots, wrap01(u0)) + Math.floor(u0) * n
  const d: H[] = []
  for (let j = 0; j <= degree; j++) d.push(Hat(k - degree + j))
  for (let r = 1; r <= degree; r++) {
    const u = args[r - 1]
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const denom = tau(k + 1 - r + j) - tau(i)
      const a = Math.abs(denom) < 1e-14 ? 0.5 : (u - tau(i)) / denom
      d[j] = lerp(d[j - 1], d[j], a)
    }
  }
  return d[degree]
}

/** New control point = average of the degree-p blossom over leave-one-out subsets. */
function elevatedControlPoint<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  args: readonly number[],
  blossom: (reduced: number[]) => H,
): H {
  const p = args.length - 1
  let acc = coeffs.zero()
  for (let leaveOut = 0; leaveOut <= p; leaveOut++) {
    const reduced = [...args.slice(0, leaveOut), ...args.slice(leaveOut + 1)]
    acc = coeffs.madd(acc, 1, blossom(reduced))
  }
  return coeffs.madd(coeffs.zero(), 1 / (p + 1), acc)
}

/**
 * Elevate the degree of an OPEN B-spline by one, via blossoming. Returns the
 * minimal elevated representation directly (each distinct knot's multiplicity
 * +1, continuity preserved). One impl for function + plain + rational + complex.
 */
export function elevateDegreeOpen<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  knots: readonly number[],
  degree: number,
): { controlPoints: CP[]; knots: number[]; degree: number } {
  const p = degree
  const h = controlPoints.map((cp) => coeffs.lift(cp))
  const elevated = elevatedKnotVector(knots)
  const newN = elevated.length - (p + 1) - 1

  const newCps: CP[] = []
  for (let j = 0; j < newN; j++) {
    const args = Array.from({ length: p + 1 }, (_, i) => elevated[j + 1 + i])
    const q = elevatedControlPoint(coeffs, args, (reduced) =>
      blossomHomOpen(coeffs, h, knots, p, reduced),
    )
    newCps.push(coeffs.unlift(q))
  }
  return { controlPoints: newCps, knots: elevated, degree: p + 1 }
}

/**
 * Elevate the degree of a PERIODIC B-spline by one. Blossom in the bi-infinite
 * frame, then fold each new control point back to canonical [0,1) storage by
 * its Greville period (de-spiral). The monodromy `ratio` is exact, so the same
 * `spiralRatio` drives `evaluate` before and after.
 */
export function elevateDegreePeriodic<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  knots: readonly number[],
  degree: number,
  spiralRatio?: S,
): { controlPoints: CP[]; knots: number[]; degree: number } {
  const p = degree
  const ratio = spiralRatio ?? coeffs.one
  const elevatedBase = elevatedKnotVector(knots) // one period, canonical [0,1)
  const newNper = elevatedBase.length
  const sigma = (i: number) => elevatedBase[mod(i, newNper)] + Math.floor(i / newNper)

  // Compute the new control points for canonical indices 0..newNper-1 directly.
  // These ARE the stored period-0 values: evaluate re-applies the spiral itself
  // for wrapped accesses, and the monodromy Q_{s+newNper} = ratio·Q_s holds
  // exactly, so no de-spiralling here.
  const newCps: CP[] = []
  for (let s = 0; s < newNper; s++) {
    const args = Array.from({ length: p + 1 }, (_, i) => sigma(s + 1 + i))
    const q = elevatedControlPoint(coeffs, args, (reduced) =>
      blossomHomPeriodic(coeffs, controlPoints, knots, p, ratio, reduced),
    )
    newCps.push(coeffs.unlift(q))
  }

  return { controlPoints: newCps, knots: elevatedBase, degree: p + 1 }
}

/** Elevate degree by one (open or periodic). */
export function elevateDegree<CP, H, S, Out>(
  coeffs: Coeffs<CP, H, S, Out>,
  controlPoints: readonly CP[],
  knots: readonly number[],
  degree: number,
  closed = false,
  spiralRatio?: S,
): { controlPoints: CP[]; knots: number[]; degree: number } {
  return closed
    ? elevateDegreePeriodic(coeffs, controlPoints, knots, degree, spiralRatio)
    : elevateDegreeOpen(coeffs, controlPoints, knots, degree)
}
