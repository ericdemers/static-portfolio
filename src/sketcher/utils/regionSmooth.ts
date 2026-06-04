// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Region smoothing: fair a windowed portion of an open B-spline toward minimal
 * fairness energy, holding everything outside the window's support exactly fixed.
 *
 * This is the product-side wrapper around the lab's linear fairing flow:
 *   - free set F = control points whose WHOLE support ⊆ window (strict locality),
 *   - the rest are held bit-exact (so no curvature extremum can appear outside),
 *   - the free CPs are moved by the implicit step (I + λ M_FF) P_F = P_F⁰ − λ M_FO P_O,
 *     M = the strain/jerk/snap Gram over the window.
 *
 * Convex ⇒ always converges; snap is frequency-selective, so small unwanted
 * oscillations in the window fair out while the broad shape is preserved.
 */
import { computeArclenWeightedGram } from '../lab/pipeline/openFair'
import { implicitFairSolve } from '../lab/pipeline/fairFlow'
import { laplacianGuardedStep } from '../lab/pipeline/laplacianGuard'
import { computeCurvatureExtremaParameters } from '../optimizer/algebra'
import { choleskySolve } from '../optimizer/linearAlgebra'
import { fairnessDerivativeOrder, type FairnessEnergyType } from '../lab/optimizer/jerkEnergy'

// The sketcher fairs in PARAMETER space (α = 0): the convex, stable energy.
// Arc-length weighting (α > 0) is "closer to the curvature itself" but the
// v^{1-2k} weight is hypersensitive to speed — a modest base-speed variation,
// raised to the −5/−7 power, lets low-speed regions dominate the Gram and the
// fairing collapses control points into a near-cusp (maxκ → 1e6). It stays a
// research knob in /lab/snap-flow; the product uses the proven-stable α = 0.
const ARCLEN_ALPHA = 0
const ARCLEN_ITERS = 1

/** Highest fairness order valid for a given degree (order must be ≤ degree). */
export function defaultEnergyForDegree(degree: number): FairnessEnergyType {
  if (degree >= 4) return 'snap'
  if (degree >= 3) return 'jerk'
  return 'strain'
}

/** Every fairness energy valid at this degree (order ≤ degree), low → high. */
export function validEnergiesForDegree(degree: number): FairnessEnergyType[] {
  const all: FairnessEnergyType[] = ['strain', 'jerk', 'snap']
  return all.filter((e) => fairnessDerivativeOrder(e) <= degree)
}

/** Parameter domain [t0, t1] of a clamped B-spline. */
export function paramDomain(knots: number[], numCPs: number, degree: number): [number, number] {
  return [knots[degree], knots[numCPs]]
}

/** Support of basis function i is [knots[i], knots[i+degree+1]]. */
function support(knots: number[], degree: number, i: number): [number, number] {
  return [knots[i], knots[i + degree + 1]]
}

/**
 * Control points whose whole support lies inside the window (strict locality).
 * The two clamped endpoints (P₀, P_{n-1}) are NEVER freed: pinning two points
 * removes the entire similarity group (translation/rotation/scale), so the
 * fairing optimises the SHAPE, not the scale. Without this, a curve with no
 * interior knots (a Bézier) has every basis spanning the whole curve, so the
 * only window that frees anything frees all CPs — and the scale-dependent
 * energy then collapses the curve toward a point.
 */
export function smoothFreeSet(
  knots: number[], numCPs: number, degree: number, win: [number, number],
): number[] {
  const F: number[] = []
  const eps = 1e-9
  for (let i = 1; i < numCPs - 1; i++) {
    const [a, b] = support(knots, degree, i)
    if (a >= win[0] - eps && b <= win[1] + eps) F.push(i)
  }
  return F
}

/** The arc of the curve that actually moves = union of freed supports, clamped to domain. */
export function smoothMovableArc(
  knots: number[], numCPs: number, degree: number, F: number[],
): [number, number] | null {
  if (F.length === 0) return null
  const [t0, t1] = paramDomain(knots, numCPs, degree)
  const lo = support(knots, degree, F[0])[0]
  const hi = support(knots, degree, F[F.length - 1])[1]
  return [Math.max(t0, lo), Math.min(t1, hi)]
}

export interface SmoothPreview {
  F: number[]
  arc: [number, number] | null
  cpX: number[]
  cpY: number[]
}

/**
 * Faired preview of the curve for a given window + amount (slider exponent) +
 * energy. `amountExp` plays the role of the lab's slider: λ = 10^amountExp /
 * gramScale; amountExp low → ≈ original, high → minimum-energy shape.
 * Returns the original points (unchanged) when the window frees nothing.
 */
export function computeSmoothPreview(
  knots: number[],
  cpX: number[],
  cpY: number[],
  degree: number,
  win: [number, number],
  amountExp: number,
  energy: FairnessEnergyType,
): SmoothPreview {
  const n = cpX.length
  const F = smoothFreeSet(knots, n, degree, win)
  const arc = smoothMovableArc(knots, n, degree, F)
  if (F.length === 0) return { F, arc, cpX: [...cpX], cpY: [...cpY] }
  // Arc-length-weighted Gram from the base shape (λ normalisation).
  const M0 = computeArclenWeightedGram(knots, n, degree, energy, win[0], win[1], cpX, cpY, ARCLEN_ALPHA)
  let gramScale = 0
  for (let i = 0; i < n; i++) gramScale = Math.max(gramScale, M0[i][i])
  gramScale = gramScale || 1
  const lam = Math.pow(10, amountExp) / gramScale
  // Picard iteration: re-measure arc length on the latest faired shape each round.
  let cur = { x: cpX, y: cpY }
  for (let it = 0; it < ARCLEN_ITERS; it++) {
    const Mi = it === 0
      ? M0
      : computeArclenWeightedGram(knots, n, degree, energy, win[0], win[1], cur.x, cur.y, ARCLEN_ALPHA)
    cur = implicitFairSolve(Mi, cpX, cpY, F, lam, choleskySolve)
  }
  return { F, arc, cpX: cur.x, cpY: cur.y }
}

/**
 * Plain Laplacian smoothing of the windowed control points (index space, fixed
 * frame). Each free CP eases toward the average of its two neighbours; iterate
 * for the "amount". It's a low-pass filter / contraction — unconditionally
 * stable, never cusps (unlike the fairness solve). Endpoints (and everything
 * outside the window) stay fixed and act as boundary values.
 */
export function computeLaplacianPreview(
  knots: number[],
  cpX: number[],
  cpY: number[],
  degree: number,
  win: [number, number],
  iterations: number,
): SmoothPreview {
  const n = cpX.length
  const F = smoothFreeSet(knots, n, degree, win)
  const arc = smoothMovableArc(knots, n, degree, F)
  if (F.length === 0 || iterations <= 0) return { F, arc, cpX: [...cpX], cpY: [...cpY] }
  const lambda = 0.5
  const x = [...cpX], y = [...cpY]
  for (let it = 0; it < iterations; it++) {
    const nx = [...x], ny = [...y] // Jacobi update (all from the previous iterate)
    for (const i of F) {
      // F never contains the endpoints, so i−1 and i+1 always exist.
      nx[i] = x[i] + lambda * ((x[i - 1] + x[i + 1]) / 2 - x[i])
      ny[i] = y[i] + lambda * ((y[i - 1] + y[i + 1]) / 2 - y[i])
    }
    for (const i of F) { x[i] = nx[i]; y[i] = ny[i] }
  }
  return { F, arc, cpX: x, cpY: y }
}

/**
 * Bounded Laplacian: Laplacian motion guided step-by-step, but the
 * curvature-extrema bound is applied each step so the count can only drop,
 * never rise. Never adds a curvature extremum.
 *
 * The trajectory is cached incrementally in a module-level cache keyed on the
 * curve + window, so dragging the iteration slider computes each step ONCE
 * (warm-started from the previous) instead of re-running the whole flow from
 * base on every tick — and both preview call sites share it.
 */
let lapGuardCache: {
  key: string
  F: number[]
  arc: [number, number] | null
  steps: { x: number[]; y: number[]; bound: number }[]
} | null = null

export function computeLaplacianGuardedPreview(
  knots: number[], cpX: number[], cpY: number[], degree: number,
  win: [number, number], iterations: number,
): SmoothPreview {
  const n = cpX.length
  const F = smoothFreeSet(knots, n, degree, win)
  const arc = smoothMovableArc(knots, n, degree, F)
  if (F.length === 0) return { F, arc, cpX: [...cpX], cpY: [...cpY] }
  const key = JSON.stringify([cpX, cpY, win])
  if (!lapGuardCache || lapGuardCache.key !== key) {
    lapGuardCache = { key, F, arc, steps: [{ x: [...cpX], y: [...cpY], bound: computeCurvatureExtremaParameters(knots, cpX, cpY).length }] }
  }
  while (lapGuardCache.steps.length <= iterations) {
    const last = lapGuardCache.steps[lapGuardCache.steps.length - 1]
    lapGuardCache.steps.push(laplacianGuardedStep(last.x, last.y, knots, F, last.bound))
  }
  const s = lapGuardCache.steps[Math.min(iterations, lapGuardCache.steps.length - 1)]
  return { F, arc, cpX: s.x, cpY: s.y }
}

export type SmoothMode = 'fairness' | 'laplacian' | 'laplacian-bounded'

/** Dispatch to the active region-smoothing mode. */
export function computeRegionPreview(
  knots: number[],
  cpX: number[],
  cpY: number[],
  degree: number,
  win: [number, number],
  opts: { mode: SmoothMode; amountExp: number; energy: FairnessEnergyType; iterations: number },
): SmoothPreview {
  if (opts.mode === 'laplacian') return computeLaplacianPreview(knots, cpX, cpY, degree, win, opts.iterations)
  if (opts.mode === 'laplacian-bounded') return computeLaplacianGuardedPreview(knots, cpX, cpY, degree, win, opts.iterations)
  return computeSmoothPreview(knots, cpX, cpY, degree, win, opts.amountExp, opts.energy)
}
