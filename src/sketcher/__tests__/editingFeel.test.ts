import { describe, it, expect } from 'vitest'
import { optimizeCurve, applyOptimizeResult } from '../optimizer'

/**
 * "Feel guard" — the open B-spline curvature drag must FEEL good, not just be
 * fast and correct. "Feel" isn't one number; it's a vector of interaction
 * invariants that, together, make the curve deform freely, continuously and
 * predictably under a finger. This locks the deterministic ones so a future
 * change (e.g. re-introducing a hard clamp like core slideCurve's bisect-back
 * guard, which made the point "stuck") fails here:
 *
 *   - TRACKING   — on a reachable drag the dragged point reaches the cursor
 *                  (full freedom; not held back / stuck). This is exactly what
 *                  regressed when the open drag ran on core slideCurve.
 *   - CONTINUITY — each frame's control-point change is proportional to the
 *                  cursor step; no jumps/snaps (smooth deformation).
 *   - REVERSIBILITY — a reachable out-and-back returns near the start (low
 *                  hysteresis) when the bound isn't engaged.
 *   - STABILITY  — never NaN/blows up.
 *
 * Drags run frame-by-frame (RAF-style), the way a finger actually moves, on the
 * shipping path: the sketcher's optimizeCurve (Gauss-Newton, maxIter 20), which
 * always enforces the curvature-extrema bound. We do NOT assert subjective taste
 * (coordinated vs point-chases-cursor) — only the absence of the bad feels.
 */

const KNOTS = [0, 0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 1]
const X0 = [-152, -180, -263, -152, 20, 180, 207]
const Y0 = [17, -79, -184, -235, -212, -278, -346]
const DEGREE = 3
const OPTS = { maxIterations: 20, enableBFGS: false }

type Curve = { id: string; kind: 'bspline'; degree: number; closed: boolean; controlPoints: { x: number; y: number }[]; knots: number[] }
const freshCurve = (): Curve => ({
  id: 'c', kind: 'bspline', degree: DEGREE, closed: false,
  controlPoints: X0.map((x, i) => ({ x, y: Y0[i] })), knots: KNOTS,
})

interface DragMetrics {
  curve: Curve
  trackMiss: number // px the dragged point ends from the cursor target
  maxJump: number // largest per-frame ‖Δ control point‖ over the drag
  anyNaN: boolean
  maxFrameMs: number
}

// Chained RAF-style drag of control point `di` from its current spot to
// (tx, ty) in `frames` equal cursor steps, feeding each solved frame back in.
function chainedDrag(start: Curve, di: number, tx: number, ty: number, frames: number): DragMetrics {
  let curve = start
  const sx = start.controlPoints[di].x
  const sy = start.controlPoints[di].y
  let maxJump = 0
  let anyNaN = false
  let maxFrameMs = 0
  for (let i = 0; i < frames; i++) {
    const f = (i + 1) / frames
    const cx = sx + (tx - sx) * f
    const cy = sy + (ty - sy) * f
    const t0 = performance.now()
    const r = optimizeCurve(curve, cx, cy, di, OPTS)
    maxFrameMs = Math.max(maxFrameMs, performance.now() - t0)
    const prev = curve.controlPoints
    curve = applyOptimizeResult(curve, r) as Curve
    for (let k = 0; k < prev.length; k++) {
      const jump = Math.hypot(curve.controlPoints[k].x - prev[k].x, curve.controlPoints[k].y - prev[k].y)
      maxJump = Math.max(maxJump, jump)
    }
    for (const p of curve.controlPoints) if (!isFinite(p.x) || !isFinite(p.y)) anyNaN = true
  }
  const pt = curve.controlPoints[di]
  return { curve, trackMiss: Math.hypot(pt.x - tx, pt.y - ty), maxJump, anyNaN, maxFrameMs }
}

// 15 RAF steps per drag: fine enough that core slideCurve's fixed bisect-back
// lurch shows as ~2.5–3× the step (the "stuck/jumpy" signature) while
// optimizeCurve stays ≈1.0×; coarser hides the lurch, much finer makes even the
// soft path's settling register. This is the regime where the teeth are clean.
const FRAMES = 15
// Moves verified (by calibration) NOT to engage the curvature bound — so the
// point should reach the cursor and the motion should be reversible. (Moves that
// engage the bound are correctly resisted, which is not "stuck".)
const REACHABLE: [number, number, number][] = [[2, -50, -30], [4, 50, 30]]
// STRONG pushes that DO drive the curve against the bound — this is where "feel"
// is decided. The shipping optimizeCurve resists smoothly (per-frame ‖Δ‖ stays
// ≈ the cursor step). core slideCurve's hard bisect-back guard instead JUMPS the
// point back (measured 2.5–3× the step), the "stuck/jumpy" feel. The continuity
// guard below catches that.
const STRONG: [number, number, number][] = [[3, 0, 200], [2, 0, 250], [1, 0, 180], [3, 150, 150]]
const ALL: [number, number, number][] = [...REACHABLE, ...STRONG]

// Warm up the JIT so the latency backstop isn't measuring cold compile.
for (let w = 0; w < 5; w++) chainedDrag(freshCurve(), 4, 60, 10, FRAMES)

describe('open B-spline editing feel (interaction-quality guard)', () => {
  it('TRACKING: a reachable drag reaches the cursor — the point is not stuck', () => {
    for (const [di, dx, dy] of REACHABLE) {
      const start = freshCurve()
      const tx = start.controlPoints[di].x + dx
      const ty = start.controlPoints[di].y + dy
      const m = chainedDrag(start, di, tx, ty, FRAMES)
      // Calibrated ≤ 0.5 px; 2 px leaves margin but still fails a clamp (the
      // bisect-back guard left the point many px short of a reachable cursor).
      expect(m.trackMiss).toBeLessThan(2)
    }
  })

  it('CONTINUITY: deformation is proportional to the cursor step — no jumps (incl. against the bound)', () => {
    for (const [di, dx, dy] of ALL) {
      const start = freshCurve()
      const stepSize = Math.hypot(dx, dy) / FRAMES
      const m = chainedDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy, FRAMES)
      // optimizeCurve stays ≈ 1.0× the step even pushing against the bound (~1.07
      // measured); 1.8× has margin yet fails core slideCurve's bisect-back guard,
      // which lurches 2.5–3× on the strong pushes (the regression this catches).
      expect(m.maxJump).toBeLessThan(1.8 * stepSize)
    }
  })

  it('REVERSIBILITY: a reachable out-and-back returns near the start', () => {
    for (const [di, dx, dy] of REACHABLE) {
      const start = freshCurve()
      const out = chainedDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy, FRAMES)
      const back = chainedDrag(out.curve, di, start.controlPoints[di].x, start.controlPoints[di].y, FRAMES)
      let revErr = 0
      for (let k = 0; k < start.controlPoints.length; k++) {
        revErr = Math.max(revErr, Math.hypot(
          back.curve.controlPoints[k].x - start.controlPoints[k].x,
          back.curve.controlPoints[k].y - start.controlPoints[k].y,
        ))
      }
      expect(revErr).toBeLessThan(5) // calibrated ≤ 3 px
    }
  })

  it('STABILITY: no NaN / blow-up on any drag', () => {
    for (const [di, dx, dy] of ALL) {
      const start = freshCurve()
      const m = chainedDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy, FRAMES)
      expect(m.anyNaN).toBe(false)
    }
  })

  it('LATENCY: stays interactive (coarse, non-flaky backstop)', () => {
    // Calibrated ~5 ms/frame (15 ms cold). 60 ms is a generous machine-independent
    // ceiling — it won't flake on CI but still catches a ~10× regression.
    for (const [di, dx, dy] of ALL) {
      const start = freshCurve()
      const m = chainedDrag(start, di, start.controlPoints[di].x + dx, start.controlPoints[di].y + dy, FRAMES)
      expect(m.maxFrameMs).toBeLessThan(60)
    }
  })
})
