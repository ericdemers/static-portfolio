import { describe, it, expect } from 'vitest'
import {
  slideCurve,
  slideComplexRational,
  curvatureExtremaNumeratorPlanar,
  curvatureExtremaNumeratorPlanarPeriodic,
  closedCurvatureExtremaParameters,
  curvatureExtremaNumeratorComplexPeriodic,
} from '../index'

/**
 * SLIDE-4 ("Without Sliding") regression lock — the curvature-extrema bound must
 * survive a QUICK drag.
 *
 * History this guards against: the slide was ported from the proven ../sketcher
 * deck, but the port called slideCurve WITHOUT a `method`, so it fell onto the
 * BANDED solver instead of the robust IPOPT solver ../sketcher's optimizeCurve
 * always uses. On the slide's parabola — whose boundary g coefficient is a
 * structural zero — a quick flick of a control point made the banded solver
 * under-converge and let that coefficient overshoot across zero, INTRODUCING a
 * curvature extremum and recoloring the g sign-dots. The whole visual argument
 * (constraints ⇒ the bound cannot grow) was destroyed by the glitch.
 *
 * TWO lessons are baked into the shape of this test:
 *
 * 1. QUICK drags, not slow walks. A gentle multi-frame walk near the start never
 *    pushes a coefficient across zero, so it cannot reproduce the bug. The
 *    failure needs a big jump in few frames (the solver under-converges).
 *
 * 2. The DEMO's display metric, not core's robust metric. core's signChanges()
 *    and openCurvatureExtremaParameters() carry a noise tolerance that ABSORBS
 *    the wobble — so they never reported a violation even on the buggy banded
 *    path. What the user SEES is the demo's naive metric (exact-threshold sign
 *    count + a findZeros marker count). The lock therefore asserts on a faithful
 *    copy of that metric; otherwise it would be green while the slide glitched.
 *
 * The proven teeth (captured when this was written): across the matrix below,
 * the banded solver introduced an extremum in 18 of 75 quick drags; IPOPT in 0.
 */

const degree = 4
const KNOTS = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
const OPT_SCALE = 200
const X0 = [-1, -0.5, 0, 0.5, 1].map((v) => v * OPT_SCALE)
const Y0 = [-0.978, -0.022, 0.356, -0.02, -0.978].map((v) => v * OPT_SCALE)

// ── The demo's exact display metric (mirrors WithoutSlidingDemo.tsx) ──────────
const gCoefs = (x: number[], y: number[]) =>
  curvatureExtremaNumeratorPlanar(x, y, KNOTS, degree).flatCoeffs()

// Schumaker S⁻ sign-change count, exact-zero threshold (no tolerance) — the
// number the demo prints and colors the ± dots by.
function displaySignChanges(v: number[]): number {
  let count = 0
  let last = 0
  for (const x of v) {
    if (x === 0) continue
    const s = x > 0 ? 1 : -1
    if (last !== 0 && s !== last) count++
    last = s
  }
  return count
}

function evalBernstein(c: number[], t: number): number {
  if (!c.length) return 0
  const b = c.slice()
  const u = 1 - t
  for (let r = 1; r < b.length; r++)
    for (let i = 0; i < b.length - r; i++) b[i] = u * b[i] + t * b[i + 1]
  return b[0]
}

// Number of amber extremum markers the demo draws (zeros of g via dense
// sample + sign-change, same tolerance as WithoutSlidingDemo's findZeros).
function displayExtremaCount(c: number[], N = 200): number {
  const s: number[] = []
  let m = 0
  for (let i = 0; i <= N; i++) {
    const v = evalBernstein(c, i / N)
    s.push(v)
    m = Math.max(m, Math.abs(v))
  }
  const tol = Math.max(1e-9 * m, 1e-15)
  let zeros = 0
  let i = 0
  while (i < N) {
    if (Math.abs(s[i]) <= tol) {
      zeros++
      while (i <= N && Math.abs(s[i]) <= tol) i++
    } else if (s[i] * s[i + 1] < 0) {
      zeros++
      i++
    } else i++
  }
  return zeros
}

const sc = (x: number[], y: number[]) => displaySignChanges(gCoefs(x, y))
const ex = (x: number[], y: number[]) => displayExtremaCount(gCoefs(x, y))

// A quick drag: move control point `di` from its start toward `target` in
// `frames` big steps, feeding each solved frame back in. `method=null` is a FREE
// drag (no solve — just place the point), used to prove the scenario is real.
function quickDrag(
  method: 'ipopt' | null,
  di: number,
  target: [number, number],
  frames: number,
): { startSc: number; maxSc: number; startEx: number; maxEx: number } {
  let x = X0.slice()
  let y = Y0.slice()
  let maxSc = sc(X0, Y0)
  let maxEx = ex(X0, Y0)
  for (let i = 0; i < frames; i++) {
    const f = (i + 1) / frames
    const tx = X0[di] + (target[0] - X0[di]) * f
    const ty = Y0[di] + (target[1] - Y0[di]) * f
    if (method === null) {
      x[di] = tx
      y[di] = ty
    } else {
      const r = slideCurve(x, y, KNOTS, degree, di, tx, ty, {
        disableSliding: true,
        method,
        maxIterations: 20,
        anchorWeight: 0.05,
        anchorX: X0.slice(),
        anchorY: Y0.slice(),
      })
      x = r.x
      y = r.y
    }
    maxSc = Math.max(maxSc, sc(x, y))
    maxEx = Math.max(maxEx, ex(x, y))
  }
  return { startSc: sc(X0, Y0), maxSc, startEx: ex(X0, Y0), maxEx }
}

const TARGETS: [number, number][] = [
  [0, 200],
  [0, -300],
  [300, 200],
  [-300, 200],
  [200, -200],
]
const FRAMES = [1, 2, 4]
const CPS = [0, 1, 2, 3, 4]

describe('slide-4 quick-drag bound lock', () => {
  // Sanity: the drags below are genuinely bound-threatening — a FREE quick drag
  // (no constraint) DOES introduce extrema for at least some of them. Without
  // this, a passing IPOPT test could be vacuous (maybe nothing threatens it).
  it('a FREE quick drag does introduce extrema (the scenario is real)', () => {
    const violated = CPS.flatMap((di) =>
      TARGETS.flatMap((t) =>
        FRAMES.map((fr) => {
          const r = quickDrag(null, di, t, fr)
          return r.maxEx > r.startEx || r.maxSc > r.startSc
        }),
      ),
    )
    expect(violated.some(Boolean)).toBe(true)
  })

  // The lock: under the robust solver the demo uses, NO quick drag may grow the
  // displayed sign-change bound OR the amber-marker count. This is exactly the
  // assertion the banded port failed.
  it('[ipopt] no quick drag grows the displayed bound or the extrema markers', () => {
    for (const di of CPS) {
      for (const t of TARGETS) {
        for (const fr of FRAMES) {
          const r = quickDrag('ipopt', di, t, fr)
          expect(
            `cp${di} t[${t}] f${fr}: sc ${r.maxSc}/${r.startSc} ex ${r.maxEx}/${r.startEx}`,
          ).toBe(
            `cp${di} t[${t}] f${fr}: sc ${r.startSc}/${r.startSc} ex ${r.startEx}/${r.startEx}`,
          )
        }
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Closed + complex paths: the robust IPOPT path runs Gauss-Newton (enableBFGS
// defaults to false) — exact Hessian for the least-squares drag objective, so
// it's fast AND feasibility is held by the barrier. These lock that the bound
// survives a quick drag on the real Oval and teardrop fixtures under that path.
// ─────────────────────────────────────────────────────────────────────────────

// Oval fixture: nearCircle, degree 3, 12 CPs, periodic knots (from OvalDemo).
function makeOval(a: number, b: number, p1x: number, p1y: number, p2x: number, p2y: number) {
  return [
    { x: a, y: 0 }, { x: p1x, y: -p1y }, { x: p2x, y: -p2y }, { x: 0, y: -b },
    { x: -p2x, y: -p2y }, { x: -p1x, y: -p1y }, { x: -a, y: 0 }, { x: -p1x, y: p1y },
    { x: -p2x, y: p2y }, { x: 0, y: b }, { x: p2x, y: p2y }, { x: p1x, y: p1y },
  ]
}
const OVAL = makeOval(179.0609926, 213.3017254, 156.1043674, 118.2907758, 87.2324738, 189.5488809)
const OK = Array.from({ length: 12 }, (_, i) => i / 12)
const osc = (x: number[], y: number[]) => curvatureExtremaNumeratorPlanarPeriodic(x, y, OK, 3).signChanges()
const oex = (x: number[], y: number[]) => closedCurvatureExtremaParameters(x, y, OK, 3).length

describe('closed-curve quick-drag bound lock (Oval, Gauss-Newton IPOPT)', () => {
  it('[ipopt] no quick drag of the oval grows S⁻ or the extrema count', { timeout: 30000 }, () => {
    const sx = OVAL.map((p) => p.x)
    const sy = OVAL.map((p) => p.y)
    const startSc = osc(sx, sy)
    const startEx = oex(sx, sy)
    const targets: [number, number][] = [[0, -360], [260, 0], [180, 300]]
    for (const di of [3, 9]) {
      for (const t of targets) {
        for (const fr of [1, 3]) {
          let x = sx.slice()
          let y = sy.slice()
          for (let i = 0; i < fr; i++) {
            const f = (i + 1) / fr
            const tx = sx[di] + (t[0] - sx[di]) * f
            const ty = sy[di] + (t[1] - sy[di]) * f
            const r = slideCurve(x, y, OK, 3, di, tx, ty, {
              closed: true,
              method: 'ipopt',
              maxIterations: 20,
              dragWeight: 25,
              preserveInflections: true,
            })
            x = r.x
            y = r.y
          }
          expect(osc(x, y)).toBeLessThanOrEqual(startSc)
          expect(oex(x, y)).toBeLessThanOrEqual(startEx)
        }
      }
    }
  })
})

// Teardrop fixture: degree 4, 6-CP closed complex-rational (from ComplexRationalDemo).
const TEAR = [
  { x: -100, y: 28 }, { x: -185, y: 0 }, { x: -100, y: -28 },
  { x: 70, y: -20 }, { x: 190, y: 0 }, { x: 70, y: 20 },
].map((p) => ({ re: p.x, im: p.y, w_re: 1, w_im: 0 }))
const TK = Array.from({ length: 6 }, (_, i) => i / 6)
const csc = (pts: { re: number; im: number; w_re: number; w_im: number }[]) =>
  curvatureExtremaNumeratorComplexPeriodic(
    pts.map((p) => p.re), pts.map((p) => p.im),
    pts.map((p) => p.w_re), pts.map((p) => p.w_im), TK, 4,
  ).signChanges()

describe('complex-rational quick-drag bound lock (teardrop, Gauss-Newton IPOPT)', () => {
  it('[ipopt] no quick drag of the teardrop grows S⁻', { timeout: 30000 }, () => {
    const startSc = csc(TEAR)
    const targets: [number, number][] = [[0, 120], [120, 0], [80, -100]]
    for (const di of [1, 4]) {
      for (const t of targets) {
        for (const fr of [1]) {
          let pts = TEAR.map((p) => ({ ...p }))
          for (let i = 0; i < fr; i++) {
            const f = (i + 1) / fr
            const tx = TEAR[di].re + (t[0] - TEAR[di].re) * f
            const ty = TEAR[di].im + (t[1] - TEAR[di].im) * f
            const r = slideComplexRational(pts, TK, 4, di, tx, ty, {
              method: 'ipopt',
              maxIterations: 24,
              dragWeight: 25,
            })
            pts = r.points
          }
          expect(csc(pts)).toBeLessThanOrEqual(startSc)
        }
      }
    }
  })
})
