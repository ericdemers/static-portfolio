// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * 1D Truncated Hierarchical B-splines — teaching helper.
 *
 * Two uniform B-spline levels on an interval:
 *   level 0 (coarse): integer knots 0,1,…,N
 *   level 1 (fine):   half-integer knots 0,0.5,…,N
 * The fine basis is a dyadic refinement of the coarse one, related by the
 * two-scale (subdivision) relation
 *   N⁰_i = Σ_{k=0}^{p+1} w_k · N¹_{2i+k},   w_k = C(p+1,k) / 2^p.
 *
 * Given a refinement region [a,b] (whole coarse cells), we form the hierarchical
 * selection and the truncation, and sample everything for plotting:
 *   - coarse function status: 'kept' (outside the region), 'removed' (entirely
 *     inside ⇒ replaced by fine), or 'straddling' (crosses the boundary).
 *   - active fine functions: those whose support lies inside the region.
 *   - truncated coarse: trunc(N⁰_i) = Σ_{k: child NOT active} w_k N¹_{2i+k}
 *     (drop the fine children the active fine functions already provide).
 * Partition of unity: the HB sum (kept coarse FULL + active fine) bulges above 1
 * at the seam; the THB sum (kept coarse TRUNCATED + active fine) is exactly 1.
 */

import { basisFunctions, findKnotSpan } from '../../utils/bspline/core'

const N = 14 // number of coarse unit cells

function binom(n: number, k: number): number {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

export type CoarseStatus = 'kept' | 'removed' | 'straddling'

export interface CoarseFn {
  index: number
  status: CoarseStatus
  support: [number, number]
  full: number[] // the untruncated coarse function, sampled
  trunc: number[] // the truncated coarse function, sampled
  children: { fineIndex: number; weight: number; active: boolean }[] // two-scale decomposition
}

export interface FineFn {
  index: number
  active: boolean
  support: [number, number]
  values: number[]
}

export interface THBData {
  degree: number
  tMin: number
  tMax: number
  xs: number[]
  coarse: CoarseFn[]
  fine: FineFn[]
  sumHB: number[]
  sumTHB: number[]
}

/** Domain over which the (open uniform) basis is a partition of unity. */
export function thbDomain(degree: number): [number, number] {
  return [degree, N - degree]
}

export function computeTHB(
  degree: number,
  regionA: number,
  regionB: number,
  numSamples = 600,
): THBData {
  const p = degree
  const coarseKnots = Array.from({ length: N + 1 }, (_, i) => i)
  const fineKnots = Array.from({ length: 2 * N + 1 }, (_, i) => i / 2)
  const numCoarse = coarseKnots.length - p - 1
  const numFine = fineKnots.length - p - 1
  const [tMin, tMax] = thbDomain(p)

  const eps = 1e-9
  const coarseSupport = (i: number): [number, number] => [coarseKnots[i], coarseKnots[i + p + 1]]
  const fineSupport = (j: number): [number, number] => [fineKnots[j], fineKnots[j + p + 1]]
  const inside = (s: [number, number]) => s[0] >= regionA - eps && s[1] <= regionB + eps
  const overlaps = (s: [number, number]) => s[1] > regionA + eps && s[0] < regionB - eps
  const fineActive = (j: number) => j >= 0 && j < numFine && inside(fineSupport(j))

  // Two-scale weights w_k = C(p+1,k)/2^p.
  const w = Array.from({ length: p + 2 }, (_, k) => binom(p + 1, k) / Math.pow(2, p))

  // Sample every coarse and fine basis function.
  const xs: number[] = []
  const coarseVals: number[][] = Array.from({ length: numCoarse }, () => [])
  const fineVals: number[][] = Array.from({ length: numFine }, () => [])
  for (let s = 0; s <= numSamples; s++) {
    const t = tMin + (s / numSamples) * (tMax - tMin)
    xs.push(t)
    const cs = findKnotSpan(p, coarseKnots, t)
    const Nc = basisFunctions(cs, t, p, coarseKnots)
    const c = new Array(numCoarse).fill(0)
    for (let j = 0; j <= p; j++) {
      const idx = cs - p + j
      if (idx >= 0 && idx < numCoarse) c[idx] = Nc[j]
    }
    for (let i = 0; i < numCoarse; i++) coarseVals[i].push(c[i])

    const fs = findKnotSpan(p, fineKnots, t)
    const Nf = basisFunctions(fs, t, p, fineKnots)
    const f = new Array(numFine).fill(0)
    for (let j = 0; j <= p; j++) {
      const idx = fs - p + j
      if (idx >= 0 && idx < numFine) f[idx] = Nf[j]
    }
    for (let j = 0; j < numFine; j++) fineVals[j].push(f[j])
  }

  const status = (i: number): CoarseStatus => {
    const s = coarseSupport(i)
    if (inside(s)) return 'removed'
    if (overlaps(s)) return 'straddling'
    return 'kept'
  }

  const coarse: CoarseFn[] = []
  for (let i = 0; i < numCoarse; i++) {
    const children = w.map((weight, k) => ({ fineIndex: 2 * i + k, weight, active: fineActive(2 * i + k) }))
    const trunc = xs.map((_, s) => {
      let v = 0
      for (const ch of children) if (!ch.active && ch.fineIndex < numFine) v += ch.weight * fineVals[ch.fineIndex][s]
      return v
    })
    coarse.push({ index: i, status: status(i), support: coarseSupport(i), full: coarseVals[i], trunc, children })
  }

  const fine: FineFn[] = []
  for (let j = 0; j < numFine; j++) {
    fine.push({ index: j, active: fineActive(j), support: fineSupport(j), values: fineVals[j] })
  }

  const sumHB = xs.map((_, s) => {
    let v = 0
    for (const c of coarse) if (c.status !== 'removed') v += c.full[s]
    for (const f of fine) if (f.active) v += f.values[s]
    return v
  })
  const sumTHB = xs.map((_, s) => {
    let v = 0
    for (const c of coarse) if (c.status !== 'removed') v += c.trunc[s]
    for (const f of fine) if (f.active) v += f.values[s]
    return v
  })

  return { degree: p, tMin, tMax, xs, coarse, fine, sumHB, sumTHB }
}
