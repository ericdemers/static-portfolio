import { useRef, useState } from 'react'
import type { Point2D } from '../core'
import { evaluate, plainCoeffs, clampedUniformKnots, curvatureExtremaNumeratorPlanar } from '../core'
import { useCurveStore } from '../store/curveStore'

// ---------------------------------------------------------------------------
// Interactive demo, powered entirely by src/core/: drag the control points of
// a planar B-spline curve and watch, live, the curvature-extrema numerator g(t)
// and the bound given by the sign changes of its Bernstein coefficients
// (Schoenberg variation-diminishing → the anchor theorem). Curve state lives in
// the Zustand curve store; only the transient drag index is local.
// ---------------------------------------------------------------------------

const W = 860
const H = 560
const CURVE_H = 380
const PLOT_Y = 410
const PLOT_H = 130

/** Refine the zeros of a densely sampled function by bisection. */
function findZeros(f: (t: number) => number, samples = 600): number[] {
  const zeros: number[] = []
  let prevT = 0
  let prevV = f(0)
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const v = f(t)
    if (prevV === 0) zeros.push(prevT)
    else if (prevV * v < 0) {
      let a = prevT
      let b = t
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2
        if (f(a) * f(m) <= 0) b = m
        else a = m
      }
      zeros.push((a + b) / 2)
    }
    prevT = t
    prevV = v
  }
  return zeros
}

export default function CurvatureDemo() {
  const pts = useCurveStore((s) => s.controlPoints)
  const degree = useCurveStore((s) => s.degree)
  const moveControlPoint = useCurveStore((s) => s.moveControlPoint)
  const reset = useCurveStore((s) => s.reset)

  const [drag, setDrag] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const knots = clampedUniformKnots(pts.length, degree)
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)

  const N = 240
  const curve: Point2D[] = []
  for (let i = 0; i <= N; i++) curve.push(evaluate(plainCoeffs, pts, degree, knots, i / N))
  const curvePath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')

  const g = curvatureExtremaNumeratorPlanar(xs, ys, knots, degree)
  const bound = g.signChanges()
  const extrema = findZeros((t) => g.evaluate(t), 600)

  const gSamples = curve.map((_, i) => g.evaluate(i / N))
  const gMax = Math.max(1e-9, ...gSamples.map(Math.abs))
  const gPath = gSamples
    .map((v, i) => {
      const x = 30 + (i / N) * (W - 60)
      const y = PLOT_Y + PLOT_H / 2 - (v / gMax) * (PLOT_H / 2 - 6)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const gdeg = g.degree
  const dots: { x: number; sign: number }[] = []
  for (let s = 0; s < g.numSpans; s++) {
    for (let j = 0; j <= gdeg; j++) {
      const t = g.breaks[s] + (gdeg === 0 ? 0.5 : j / gdeg) * (g.breaks[s + 1] - g.breaks[s])
      dots.push({ x: 30 + t * (W - 60), sign: Math.sign(g.coeffs[s][j]) })
    }
  }

  const toSvg = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  return (
    <div style={{ width: '100%', maxWidth: 980, margin: '0 auto' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', background: '#0b1020', borderRadius: 12, touchAction: 'none' }}
        onPointerMove={(e) => {
          if (drag === null) return
          const p = toSvg(e)
          moveControlPoint(drag, { x: p.x, y: Math.min(CURVE_H, Math.max(0, p.y)) })
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#334155"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <path d={curvePath} fill="none" stroke="#60a5fa" strokeWidth={3} />
        {extrema.map((t, i) => {
          const p = evaluate(plainCoeffs, pts, degree, knots, t)
          return <circle key={i} cx={p.x} cy={p.y} r={6} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
        })}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={9}
            fill={drag === i ? '#f87171' : '#e2e8f0'}
            stroke="#1e293b"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              ;(e.target as Element).setPointerCapture(e.pointerId)
              setDrag(i)
            }}
          />
        ))}

        <line x1={30} y1={PLOT_Y + PLOT_H / 2} x2={W - 30} y2={PLOT_Y + PLOT_H / 2} stroke="#334155" strokeWidth={1} />
        <path d={gPath} fill="none" stroke="#a78bfa" strokeWidth={2} />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={PLOT_Y + PLOT_H / 2}
            r={4}
            fill={d.sign > 0 ? '#16a34a' : d.sign < 0 ? '#dc2626' : '#64748b'}
          />
        ))}
        <text x={30} y={PLOT_Y - 10} fill="#94a3b8" fontSize={13} fontFamily="system-ui">
          g(t) — numerator of κ′ · its Bernstein coefficients (＋ / −)
        </text>
      </svg>

      <div style={{ marginTop: 12, color: '#cbd5e1', fontFamily: 'system-ui', fontSize: 15, textAlign: 'center' }}>
        <strong style={{ color: '#f59e0b' }}>{extrema.length}</strong> curvature extrema on the curve&nbsp; ≤&nbsp;
        <strong style={{ color: '#a78bfa' }}>{bound}</strong> sign changes of g&apos;s Bernstein coefficients
        <span style={{ color: '#64748b' }}> (the variation-diminishing bound)</span>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={reset}
            style={{
              padding: '6px 18px',
              fontSize: 14,
              borderRadius: 6,
              border: '1px solid #3b82f6',
              background: '#1e3a5f',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
          Drag any control point — everything recomputes live from <code>src/core/</code>.
        </div>
      </div>
    </div>
  )
}
