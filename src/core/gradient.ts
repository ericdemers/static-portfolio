import { BernsteinDecomposition, decomposeToBernstein, decomposeToBernsteinPeriodic } from './bernstein'

// ============================================================================
// Exact sparse gradient / Jacobian of the curvature numerator g.
//
// Forward-mode automatic differentiation over the B-spline-function algebra:
// each function is carried as a Dual (value + tangent). The seed tangent is
// ∂c/∂Pᵢ = Nᵢ — a "Dirac" B-spline (control points all zero but one), nonzero on
// only d+1 spans. The product rule on multiply propagates this locality, so the
// Jacobian column for control point i is computed on i's support spans alone —
// the exact, structure-exploiting Jacobian (vs dense autodiff over all spans).
// ============================================================================

/** A function and its derivative w.r.t. one control-point coordinate. */
class Dual {
  readonly v: BernsteinDecomposition
  readonly t: BernsteinDecomposition
  constructor(v: BernsteinDecomposition, t: BernsteinDecomposition) {
    this.v = v
    this.t = t
  }
  add(o: Dual): Dual {
    return new Dual(this.v.add(o.v), this.t.add(o.t))
  }
  sub(o: Dual): Dual {
    return new Dual(this.v.subtract(o.v), this.t.subtract(o.t))
  }
  mul(o: Dual): Dual {
    // product rule: (f·g)′ = f·g′ + f′·g
    return new Dual(this.v.multiply(o.v), this.v.multiply(o.t).add(this.t.multiply(o.v)))
  }
  scale(s: number): Dual {
    return new Dual(this.v.scale(s), this.t.scale(s))
  }
}

/** g = ‖c′‖²(c′×c‴) − 3(c′·c″)(c′×c″), assembled over Duals. */
function gOverDuals(x1: Dual, y1: Dual, x2: Dual, y2: Dual, x3: Dual, y3: Dual): Dual {
  const cross1 = x1.mul(y2).sub(y1.mul(x2)) // c′ × c″
  const dot = x1.mul(x2).add(y1.mul(y2)) // c′ · c″
  const cross2 = x1.mul(y3).sub(y1.mul(x3)) // c′ × c‴
  const normSq = x1.mul(x1).add(y1.mul(y1)) // ‖c′‖²
  return normSq.mul(cross2).sub(dot.mul(cross1).scale(3))
}

const zeroLike = (bd: BernsteinDecomposition): BernsteinDecomposition =>
  new BernsteinDecomposition(bd.coeffs.map((span) => span.map(() => 0)), bd.breaks)

/** Embed a subset result (spans [s0, s0+sub.numSpans)) into a full-width BD. */
function padToFull(
  sub: BernsteinDecomposition,
  s0: number,
  numSpans: number,
  spanDegree: number,
  breaks: number[],
): BernsteinDecomposition {
  const zeros = new Array<number>(spanDegree + 1).fill(0)
  const coeffs: number[][] = []
  for (let s = 0; s < numSpans; s++) {
    coeffs.push(s >= s0 && s < s0 + sub.numSpans ? sub.coeffs[s - s0] : [...zeros])
  }
  return new BernsteinDecomposition(coeffs, breaks)
}

export interface PlanarCurvatureGradient {
  /** The curvature numerator g(t). */
  g: BernsteinDecomposition
  /** ∂g/∂xᵢ for each control point i (full-width; nonzero only on i's support). */
  dx: BernsteinDecomposition[]
  /** ∂g/∂yᵢ for each control point i. */
  dy: BernsteinDecomposition[]
}

/**
 * g and its exact Jacobian w.r.t. the control points of a planar polynomial
 * B-spline curve. Each column is computed only on the perturbed control point's
 * support spans (B-spline locality), not the whole curve.
 */
export function curvatureExtremaGradientPlanar(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  const X1 = decomposeToBernstein(x, knots, degree).derivative()
  const Y1 = decomposeToBernstein(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  // Primal g (value only) — full width, computed once.
  const g = gOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
    new Dual(X3, zeroLike(X3)),
    new Dual(Y3, zeroLike(Y3)),
  ).v

  const n = x.length
  const numSpans = g.numSpans
  const gDeg = g.degree
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []

  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernstein(e, knots, degree) // the Dirac B-spline Nᵢ

    // Support spans of Nᵢ (contiguous).
    let s0 = -1
    let s1 = -1
    for (let s = 0; s < Ni.numSpans; s++) {
      if (Ni.coeffs[s].some((c) => Math.abs(c) > 1e-14)) {
        if (s0 < 0) s0 = s
        s1 = s
      }
    }
    if (s0 < 0) {
      const z = padToFull(new BernsteinDecomposition([], []), 0, numSpans, gDeg, g.breaks)
      dx.push(z)
      dy.push(z)
      continue
    }
    s1 += 1

    // Cached basis derivatives, restricted to the support spans.
    const Ni1 = Ni.derivative().subset(s0, s1)
    const Ni2 = Ni.derivative().derivative().subset(s0, s1)
    const Ni3 = Ni.derivative().derivative().derivative().subset(s0, s1)
    const x1 = X1.subset(s0, s1)
    const y1 = Y1.subset(s0, s1)
    const x2 = X2.subset(s0, s1)
    const y2 = Y2.subset(s0, s1)
    const x3 = X3.subset(s0, s1)
    const y3 = Y3.subset(s0, s1)

    // ∂g/∂xᵢ: seed the x-function tangents with Nᵢ derivatives, y with zeros.
    const gx = gOverDuals(
      new Dual(x1, Ni1),
      new Dual(y1, zeroLike(y1)),
      new Dual(x2, Ni2),
      new Dual(y2, zeroLike(y2)),
      new Dual(x3, Ni3),
      new Dual(y3, zeroLike(y3)),
    ).t
    // ∂g/∂yᵢ: tangents on the y-functions.
    const gy = gOverDuals(
      new Dual(x1, zeroLike(x1)),
      new Dual(y1, Ni1),
      new Dual(x2, zeroLike(x2)),
      new Dual(y2, Ni2),
      new Dual(x3, zeroLike(x3)),
      new Dual(y3, Ni3),
    ).t

    dx.push(padToFull(gx, s0, numSpans, gDeg, g.breaks))
    dy.push(padToFull(gy, s0, numSpans, gDeg, g.breaks))
  }

  return { g, dx, dy }
}

/** One control point's ∂g column, kept LOCAL: nonzero spans [s0, s0+gx.numSpans). */
export interface LocalGradientColumn {
  s0: number
  gx: BernsteinDecomposition
  gy: BernsteinDecomposition
}
export interface PlanarCurvatureGradientLocal {
  g: BernsteinDecomposition
  gDeg: number
  numSpans: number
  /** Per control point. s0 < 0 means no support (empty column). */
  cols: LocalGradientColumn[]
}

/**
 * Same exact Jacobian as curvatureExtremaGradientPlanar, but each column is left
 * in LOCAL form (its support spans only, no full-width padding). Lets callers
 * assemble JᵀDJ in O(n·d²) instead of paying O(n·numSpans) per column — the key
 * to a linear-in-#control-points interior-point step. Open (clamped) curves only.
 */
export function curvatureExtremaGradientPlanarLocal(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradientLocal {
  const X1 = decomposeToBernstein(x, knots, degree).derivative()
  const Y1 = decomposeToBernstein(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  const g = gOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
    new Dual(X3, zeroLike(X3)),
    new Dual(Y3, zeroLike(Y3)),
  ).v

  const n = x.length
  const empty = new BernsteinDecomposition([], [])
  const cols: LocalGradientColumn[] = []
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernstein(e, knots, degree)
    let s0 = -1
    let s1 = -1
    for (let s = 0; s < Ni.numSpans; s++) {
      if (Ni.coeffs[s].some((c) => Math.abs(c) > 1e-14)) {
        if (s0 < 0) s0 = s
        s1 = s
      }
    }
    if (s0 < 0) {
      cols.push({ s0: -1, gx: empty, gy: empty })
      continue
    }
    s1 += 1
    const Ni1 = Ni.derivative().subset(s0, s1)
    const Ni2 = Ni.derivative().derivative().subset(s0, s1)
    const Ni3 = Ni.derivative().derivative().derivative().subset(s0, s1)
    const x1 = X1.subset(s0, s1)
    const y1 = Y1.subset(s0, s1)
    const x2 = X2.subset(s0, s1)
    const y2 = Y2.subset(s0, s1)
    const x3 = X3.subset(s0, s1)
    const y3 = Y3.subset(s0, s1)
    const gx = gOverDuals(
      new Dual(x1, Ni1),
      new Dual(y1, zeroLike(y1)),
      new Dual(x2, Ni2),
      new Dual(y2, zeroLike(y2)),
      new Dual(x3, Ni3),
      new Dual(y3, zeroLike(y3)),
    ).t
    const gy = gOverDuals(
      new Dual(x1, zeroLike(x1)),
      new Dual(y1, Ni1),
      new Dual(x2, zeroLike(x2)),
      new Dual(y2, Ni2),
      new Dual(x3, zeroLike(x3)),
      new Dual(y3, Ni3),
    ).t
    cols.push({ s0, gx, gy })
  }
  return { g, gDeg: g.degree, numSpans: g.numSpans, cols }
}

/**
 * g and its Jacobian for a CLOSED (periodic) planar B-spline curve. Same
 * forward-AD assembly; the seed is the periodic Dirac B-spline Nᵢ. Computed on
 * full periodic decompositions (periodic support wraps, so no span subsetting).
 */
export function curvatureExtremaGradientPlanarPeriodic(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  const X1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const Y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  const g = gOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
    new Dual(X3, zeroLike(X3)),
    new Dual(Y3, zeroLike(Y3)),
  ).v

  const n = x.length
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernsteinPeriodic(e, knots, degree)
    const Ni1 = Ni.derivative()
    const Ni2 = Ni1.derivative()
    const Ni3 = Ni2.derivative()
    dx.push(
      gOverDuals(
        new Dual(X1, Ni1),
        new Dual(Y1, zeroLike(Y1)),
        new Dual(X2, Ni2),
        new Dual(Y2, zeroLike(Y2)),
        new Dual(X3, Ni3),
        new Dual(Y3, zeroLike(Y3)),
      ).t,
    )
    dy.push(
      gOverDuals(
        new Dual(X1, zeroLike(X1)),
        new Dual(Y1, Ni1),
        new Dual(X2, zeroLike(X2)),
        new Dual(Y2, Ni2),
        new Dual(X3, zeroLike(X3)),
        new Dual(Y3, Ni3),
      ).t,
    )
  }
  return { g, dx, dy }
}

/** Gather the listed spans (any order; periodic support may wrap) into a compact
 *  BD. Breaks are placeholders — downstream only multiplies/adds (per-span, breaks-
 *  independent) and reads coeffs, so the values don't matter, only the count. */
function gatherSpans(bd: BernsteinDecomposition, spans: number[]): BernsteinDecomposition {
  const breaks = spans.map((_, k) => k)
  breaks.push(spans.length)
  return new BernsteinDecomposition(spans.map((s) => bd.coeffs[s]), breaks)
}

/** Scatter a compact per-span-list result back to full width (zeros elsewhere). */
function scatterSpans(
  sub: BernsteinDecomposition,
  spans: number[],
  numSpans: number,
  spanDegree: number,
  breaks: number[],
): BernsteinDecomposition {
  const coeffs: number[][] = []
  for (let s = 0; s < numSpans; s++) coeffs.push(new Array<number>(spanDegree + 1).fill(0))
  spans.forEach((s, k) => {
    coeffs[s] = sub.coeffs[k]
  })
  return new BernsteinDecomposition(coeffs, breaks)
}

/**
 * Geometry-INDEPENDENT part of the periodic local gradient: for each control
 * point, its (wrap-around) support spans and the seed Dirac B-spline derivatives
 * Nᵢ′, Nᵢ″, Nᵢ‴ gathered on those spans. These depend only on (knots, degree, n),
 * NOT on the control-point positions — so for an interactive drag they are
 * computed ONCE and reused across every Jacobian build (the curve moves ~50×/frame
 * but the seeds never change). Recomputing them each build was pure waste.
 */
export interface PeriodicSeeds {
  numSpans: number
  spans: number[][]
  /** Nᵢ′, Nᵢ″, Nᵢ‴ gathered on spans[i] (n3 unused by the inflection gradient). */
  n1: BernsteinDecomposition[]
  n2: BernsteinDecomposition[]
  n3: BernsteinDecomposition[]
}

export function precomputePeriodicSeeds(
  knots: readonly number[],
  degree: number,
  n: number,
): PeriodicSeeds {
  const probe = decomposeToBernsteinPeriodic(new Array<number>(n).fill(0), knots, degree)
  const numSpans = probe.numSpans
  const spans: number[][] = []
  const n1: BernsteinDecomposition[] = []
  const n2: BernsteinDecomposition[] = []
  const n3: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decomposeToBernsteinPeriodic(e, knots, degree)
    const sp: number[] = []
    for (let s = 0; s < numSpans; s++) {
      if (Ni.coeffs[s].some((c) => Math.abs(c) > 1e-14)) sp.push(s)
    }
    const d1 = Ni.derivative()
    const d2 = d1.derivative()
    spans.push(sp)
    n1.push(gatherSpans(d1, sp))
    n2.push(gatherSpans(d2, sp))
    n3.push(gatherSpans(d2.derivative(), sp))
  }
  return { numSpans, spans, n1, n2, n3 }
}

/**
 * Local (B-spline-locality) version of curvatureExtremaGradientPlanarPeriodic:
 * bit-identical {g, dx, dy}, but each Jacobian column is assembled only on its
 * control point's d+1 support spans (which WRAP across the periodic seam) instead
 * of the whole curve, then scattered back to full width. The non-support spans of
 * a dense column are structurally zero (the seed Nᵢ vanishes there), so dropping
 * them changes nothing — only the cost: O(n·d²) instead of O(n²). Pass `seeds`
 * (precomputePeriodicSeeds) to skip rebuilding the geometry-independent seeds on
 * every call — what keeps the closed-curve drag interactive.
 */
export function curvatureExtremaGradientPlanarPeriodicLocal(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
  seeds: PeriodicSeeds = precomputePeriodicSeeds(knots, degree, x.length),
): PlanarCurvatureGradient {
  const X1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const Y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const X3 = X2.derivative()
  const Y3 = Y2.derivative()

  // Shared value polynomials — computed ONCE per build, not once per control
  // point. (The per-column AD re-derived these 12× over.) g = ‖c′‖²(c′×c‴) −
  // 3(c′·c″)(c′×c″).
  const cross1 = X1.multiply(Y2).subtract(Y1.multiply(X2)) // c′ × c″
  const dotP = X1.multiply(X2).add(Y1.multiply(Y2)) // c′ · c″
  const cross2 = X1.multiply(Y3).subtract(Y1.multiply(X3)) // c′ × c‴
  const normSq = X1.multiply(X1).add(Y1.multiply(Y1)) // ‖c′‖²
  const g = normSq.multiply(cross2).subtract(dotP.multiply(cross1).scale(3))

  // Analytic partials ∂g/∂{X1,Y1,X2,Y2,X3,Y3}, treating the six derivative fields
  // as independent (also once per build). Then dg/dPᵢ = Σ (∂g/∂field)·(∂field/∂Pᵢ)
  // where ∂Xₖ/∂Pᵢ,ₓ = Nᵢ⁽ᵏ⁾ — the chain rule, with the seed derivatives
  // precomputed. This is forward-mode AD with the value work hoisted out of the
  // per-column loop; bit-equal (to round-off) with the dense oracle gradient.
  const pX1 = X1.scale(2).multiply(cross2).add(normSq.multiply(Y3)).subtract(X2.multiply(cross1).add(dotP.multiply(Y2)).scale(3))
  const pY1 = Y1.scale(2).multiply(cross2).subtract(normSq.multiply(X3)).subtract(Y2.multiply(cross1).subtract(dotP.multiply(X2)).scale(3))
  const pX2 = X1.multiply(cross1).subtract(dotP.multiply(Y1)).scale(-3)
  const pY2 = Y1.multiply(cross1).add(dotP.multiply(X1)).scale(-3)
  const pX3 = normSq.multiply(Y1).scale(-1)
  const pY3 = normSq.multiply(X1)

  const numSpans = seeds.numSpans
  const spanDegree = g.degree
  const n = x.length
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const spans = seeds.spans[i]
    const n1 = seeds.n1[i]
    const n2 = seeds.n2[i]
    const n3 = seeds.n3[i]
    const gx = gatherSpans(pX1, spans).multiply(n1)
      .add(gatherSpans(pX2, spans).multiply(n2))
      .add(gatherSpans(pX3, spans).multiply(n3))
    const gy = gatherSpans(pY1, spans).multiply(n1)
      .add(gatherSpans(pY2, spans).multiply(n2))
      .add(gatherSpans(pY3, spans).multiply(n3))
    dx.push(scatterSpans(gx, spans, numSpans, spanDegree, g.breaks))
    dy.push(scatterSpans(gy, spans, numSpans, spanDegree, g.breaks))
  }
  return { g, dx, dy }
}

/** Inflection numerator f = c′×c″ assembled over Duals. */
function fOverDuals(x1: Dual, y1: Dual, x2: Dual, y2: Dual): Dual {
  return x1.mul(y2).sub(y1.mul(x2))
}

/** f and its Jacobian for an OPEN planar B-spline curve. */
export function inflectionGradientPlanar(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  return inflectionGradient(x, y, knots, degree, decomposeToBernstein)
}

/** f and its Jacobian for a CLOSED (periodic) planar B-spline curve. */
export function inflectionGradientPlanarPeriodic(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
): PlanarCurvatureGradient {
  return inflectionGradient(x, y, knots, degree, decomposeToBernsteinPeriodic)
}

function inflectionGradient(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
  decompose: (c: readonly number[], k: readonly number[], d: number) => BernsteinDecomposition,
): PlanarCurvatureGradient {
  const X1 = decompose(x, knots, degree).derivative()
  const Y1 = decompose(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  const g = fOverDuals(
    new Dual(X1, zeroLike(X1)),
    new Dual(Y1, zeroLike(Y1)),
    new Dual(X2, zeroLike(X2)),
    new Dual(Y2, zeroLike(Y2)),
  ).v

  const n = x.length
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0)
    e[i] = 1
    const Ni = decompose(e, knots, degree)
    const Ni1 = Ni.derivative()
    const Ni2 = Ni1.derivative()
    dx.push(fOverDuals(new Dual(X1, Ni1), new Dual(Y1, zeroLike(Y1)), new Dual(X2, Ni2), new Dual(Y2, zeroLike(Y2))).t)
    dy.push(fOverDuals(new Dual(X1, zeroLike(X1)), new Dual(Y1, Ni1), new Dual(X2, zeroLike(X2)), new Dual(Y2, Ni2)).t)
  }
  return { g, dx, dy }
}

/**
 * Local (B-spline-locality) inflection gradient for a CLOSED periodic curve —
 * bit-identical to inflectionGradientPlanarPeriodic, each column assembled only
 * on its wrap-around support spans. Companion to
 * curvatureExtremaGradientPlanarPeriodicLocal.
 */
export function inflectionGradientPlanarPeriodicLocal(
  x: readonly number[],
  y: readonly number[],
  knots: readonly number[],
  degree: number,
  seeds: PeriodicSeeds = precomputePeriodicSeeds(knots, degree, x.length),
): PlanarCurvatureGradient {
  const X1 = decomposeToBernsteinPeriodic(x, knots, degree).derivative()
  const Y1 = decomposeToBernsteinPeriodic(y, knots, degree).derivative()
  const X2 = X1.derivative()
  const Y2 = Y1.derivative()
  // f = c′ × c″ = X1·Y2 − Y1·X2. Partials: ∂f/∂X1=Y2, ∂f/∂Y1=−X2,
  // ∂f/∂X2=−Y1, ∂f/∂Y2=X1 (each computed once; chain-ruled per column).
  const g = X1.multiply(Y2).subtract(Y1.multiply(X2))

  const numSpans = seeds.numSpans
  const spanDegree = g.degree
  const n = x.length
  const dx: BernsteinDecomposition[] = []
  const dy: BernsteinDecomposition[] = []
  for (let i = 0; i < n; i++) {
    const spans = seeds.spans[i]
    const n1 = seeds.n1[i]
    const n2 = seeds.n2[i]
    // dx = Y2·Nᵢ′ + (−Y1)·Nᵢ″ ; dy = (−X2)·Nᵢ′ + X1·Nᵢ″
    const gx = gatherSpans(Y2, spans).multiply(n1).subtract(gatherSpans(Y1, spans).multiply(n2))
    const gy = gatherSpans(X1, spans).multiply(n2).subtract(gatherSpans(X2, spans).multiply(n1))
    dx.push(scatterSpans(gx, spans, numSpans, spanDegree, g.breaks))
    dy.push(scatterSpans(gy, spans, numSpans, spanDegree, g.breaks))
  }
  return { g, dx, dy }
}
