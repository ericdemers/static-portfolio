// Knot-span finding and Cox–de Boor basis functions, for both open (clamped)
// and periodic knot vectors. This is the ONE copy of these algorithms; the
// open and periodic variants differ only in how the knot index wraps.

/** Positive modulo: result in [0, n). */
export function mod(i: number, n: number): number {
  return ((i % n) + n) % n
}

/** Normalize a parameter into [0, 1) for periodic curves. */
export function wrap01(t: number): number {
  return ((t % 1) + 1) % 1
}

/**
 * Knot value at any index for a periodic knot vector stored in [0, period).
 * Truly periodic: knotAt(i + n) = knotAt(i) + period.
 */
export function periodicKnotAt(knots: readonly number[], i: number, period = 1): number {
  const n = knots.length
  const q = Math.floor(i / n)
  return knots[mod(i, n)] + q * period
}

/** Knot span for an open (clamped) knot vector. (Piegl & Tiller, A2.1) */
export function findOpenSpan(degree: number, knots: readonly number[], t: number): number {
  const n = knots.length - degree - 2 // index of the last control point
  if (t >= knots[n + 1]) {
    let span = n
    while (span > degree && knots[span] >= knots[span + 1]) span--
    return span
  }
  if (t < knots[degree]) return degree

  let low = degree
  let high = n + 1
  let mid = Math.floor((low + high) / 2)
  while (t < knots[mid] || t >= knots[mid + 1]) {
    if (t < knots[mid]) high = mid
    else low = mid
    mid = Math.floor((low + high) / 2)
  }
  return mid
}

/**
 * Knot span for a periodic knot vector stored in [0, 1).
 * Expects t already normalized to [0, 1).
 */
export function findPeriodicSpan(knots: readonly number[], t: number): number {
  const n = knots.length
  if (t < knots[0]) return n - 1
  if (t >= knots[n - 1]) return n - 1

  let low = 0
  let high = n - 1
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (knots[mid] <= t) low = mid
    else high = mid - 1
  }
  return low
}

/** Cox–de Boor basis functions for an open knot vector. (Piegl & Tiller, A2.2) */
export function openBasis(
  span: number,
  t: number,
  degree: number,
  knots: readonly number[],
): number[] {
  return coxDeBoor(t, degree, (k) => knots[k], span)
}

/** Cox–de Boor basis functions for a periodic knot vector (modular knot access). */
export function periodicBasis(
  span: number,
  t: number,
  degree: number,
  knots: readonly number[],
): number[] {
  return coxDeBoor(t, degree, (k) => periodicKnotAt(knots, k), span)
}

/**
 * Shared Cox–de Boor recursion. `knotAt` abstracts open vs periodic indexing,
 * so the numerical core lives in exactly one place.
 */
function coxDeBoor(
  t: number,
  degree: number,
  knotAt: (index: number) => number,
  span: number,
): number[] {
  const N = new Array<number>(degree + 1).fill(0)
  const left = new Array<number>(degree + 1).fill(0)
  const right = new Array<number>(degree + 1).fill(0)
  N[0] = 1

  for (let j = 1; j <= degree; j++) {
    left[j] = t - knotAt(span + 1 - j)
    right[j] = knotAt(span + j) - t
    let saved = 0
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1] + left[j - r]
      const temp = denom === 0 ? 0 : N[r] / denom
      N[r] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }
    N[j] = saved
  }
  return N
}
