import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { curvatureExtremaNumeratorPlanar, slideCurve } from '../../core'

/**
 * "Without Sliding" demo — pre-contribution rigid behavior.
 *
 * Same visual idiom as ExtremumSlidingDemo (single bordered SVG, math
 * coords with y-up, sketcher-style amber extremum markers + selected-blue
 * CPs, lower g(t) panel with arrowed axes + dashed polygon + smooth
 * function curve + ±-labeled Bernstein dots), but the user drags
 * **control points** instead of the extremum.
 *
 * When `constrainExtrema` is true (default), each drag calls the sketcher's
 * constrained optimizer with `disableSliding: true` so every Bernstein sign
 * anchor stays active — the boundary of g(t) can't slide and the extremum
 * is locked in t. When `constrainExtrema` is false, drags are free —
 * extrema can multiply.
 */

interface Props {
  width?: number
  height?: number
  constrainExtrema?: boolean
  onBoundChange?: (bound: number | null) => void
}

const COLORS = {
  background: '#fafafa',
  border: '#e5e7eb',
  axis: '#cbd5e1',
  curve: '#1f2937',
  controlPolygon: '#cbd5e1',
  controlPoint: '#3b82f6',
  controlPointDrag: '#1e40af',
  extrema: '#f59e0b',
  extremaFill: 'rgba(245, 158, 11, 0.4)',
  gLine: '#475569',
  gPositive: '#16a34a',
  gNegative: '#dc2626',
  label: '#475569',
}

const KNOTS = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]

// Internal-scale factor for the optimizer. CPs are stored in math units
// (x ∈ [-1, 1]) but the interior-point optimizer's tolerances are tuned
// for sketcher-pixel-like magnitudes (~hundreds). Multiply by this when
// handing CPs/target to optimizeCurve, divide back for display state.
const OPT_SCALE = 200

// Initial parabola CPs: a = 0, EPSILON = 0.022 perturbation (same as
// ExtremumSlidingDemo at the slider's center). Math coords, y-up.
// CP3.y is nudged by 0.002 (≈ 0.3 px on screen) to break the perfect L/R
// mirror symmetry — otherwise g(0.5) = 0 exactly and the middle Bernstein
// coefficient of g lands on zero, leaving the center sign-dot visually
// ambiguous when the page first opens.
const INITIAL_CPS: { x: number; y: number }[] = [
  { x: -1, y: -0.978 },
  { x: -0.5, y: -0.022 },
  { x: 0, y: 0.356 },
  { x: 0.5, y: -0.020 },
  { x: 1, y: -0.978 },
]

// de Casteljau evaluation of a Bezier-basis polynomial on [0, 1].
function evalBernstein(coefs: number[], t: number): number {
  if (coefs.length === 0) return 0
  const b = coefs.slice()
  const u = 1 - t
  for (let r = 1; r < b.length; r++) {
    for (let i = 0; i < b.length - r; i++) {
      b[i] = u * b[i] + t * b[i + 1]
    }
  }
  return b[0]
}

// Evaluate a degree-4 Bezier curve at parameter t.
function evalCurve(
  cps: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  const u = 1 - t
  const b0 = u * u * u * u
  const b1 = 4 * t * u * u * u
  const b2 = 6 * t * t * u * u
  const b3 = 4 * t * t * t * u
  const b4 = t * t * t * t
  return {
    x:
      b0 * cps[0].x +
      b1 * cps[1].x +
      b2 * cps[2].x +
      b3 * cps[3].x +
      b4 * cps[4].x,
    y:
      b0 * cps[0].y +
      b1 * cps[1].y +
      b2 * cps[2].y +
      b3 * cps[3].y +
      b4 * cps[4].y,
  }
}

// Schumaker S⁻ sign-change count (zeros skipped).
function countSignChanges(values: number[]): number {
  let count = 0
  let lastSign = 0
  for (const v of values) {
    if (v === 0) continue
    const s = v > 0 ? 1 : -1
    if (lastSign !== 0 && s !== lastSign) count++
    lastSign = s
  }
  return count
}

// Find zeros of a function f on [0,1] via dense sampling + bisection.
// Handles the exact-zero-at-sample case (matters at t = 0.5 for the
// symmetric initial parabola): if a sample lands within `tol` of zero,
// it is reported directly; otherwise we look for a strict sign change
// between adjacent samples and bisect.
function findZeros(f: (t: number) => number, N = 200): number[] {
  const samples: number[] = []
  let maxAbs = 0
  for (let i = 0; i <= N; i++) {
    const v = f(i / N)
    samples.push(v)
    maxAbs = Math.max(maxAbs, Math.abs(v))
  }
  const tol = Math.max(1e-9 * maxAbs, 1e-15)

  const zeros: number[] = []
  let i = 0
  while (i < N) {
    if (Math.abs(samples[i]) <= tol) {
      zeros.push(i / N)
      // Skip a run of near-zero samples so we don't double-count.
      while (i <= N && Math.abs(samples[i]) <= tol) i++
    } else if (samples[i] * samples[i + 1] < 0) {
      let lo = i / N
      let hi = (i + 1) / N
      let lv = samples[i]
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2
        const mv = f(mid)
        if (lv * mv < 0) {
          hi = mid
        } else {
          lo = mid
          lv = mv
        }
      }
      zeros.push((lo + hi) / 2)
      i++
    } else {
      i++
    }
  }
  if (Math.abs(samples[N]) <= tol && !zeros.includes(1)) zeros.push(1)
  return zeros
}

export default function WithoutSlidingDemo({
  width = 800,
  height = 580,
  constrainExtrema = true,
  onBoundChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [cps, setCps] = useState<{ x: number; y: number }[]>(INITIAL_CPS)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // CP snapshot at drag start — anchor targets for the optimizer's Tikhonov
  // pull (matches sceneStore's drift resistance). Smooths interactive drags.
  const dragStartCpsRef = useRef<{ x: number; y: number }[] | null>(null)
  // RAF-throttle the optimizer: collect the latest pointer target, run the
  // optimizer at most once per animation frame. Same idiom SketcherCanvas
  // uses for moving-point drags — buttery smoothness regardless of how
  // fast pointermove fires.
  const pendingTargetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRafRef = useRef<number | null>(null)

  // g(t) Bernstein coefficients — same code path as the rest of the talk.
  const gCoefs = useMemo<number[]>(() => {
    return curvatureExtremaNumeratorPlanar(
      cps.map((p) => p.x),
      cps.map((p) => p.y),
      KNOTS,
      4,
    ).flatCoeffs()
  }, [cps])

  const bound = useMemo(() => countSignChanges(gCoefs), [gCoefs])

  // Report bound up to the parent panel (for the button label).
  useEffect(() => {
    onBoundChange?.(constrainExtrema ? bound : null)
  }, [bound, constrainExtrema, onBoundChange])

  // Curvature-extremum positions in 2D (zeros of g, evaluated through c).
  const extremaPositions = useMemo(() => {
    const zeros = findZeros((t) => evalBernstein(gCoefs, t))
    return zeros.map((t) => evalCurve(cps, t))
  }, [gCoefs, cps])

  // Sampled curve points for the smooth drawing.
  const curvePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = []
    const N = 80
    for (let k = 0; k <= N; k++) pts.push(evalCurve(cps, k / N))
    return pts
  }, [cps])

  // ===== Layout =====
  const margin = { top: 36, right: 40, bottom: 24, left: 48 }
  const curveFrac = 0.65
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const curveH = innerH * curveFrac - 14
  const gTop = margin.top + curveH + 28
  const gH = innerH - curveH - 28

  // ===== Coordinate transforms =====
  const cxRange: [number, number] = [-1.15, 1.15]
  const cyRange: [number, number] = [-1.6, 0.5]
  const cxToPx = (x: number) =>
    margin.left + ((x - cxRange[0]) / (cxRange[1] - cxRange[0])) * innerW
  const cyToPx = (y: number) =>
    margin.top + curveH - ((y - cyRange[0]) / (cyRange[1] - cyRange[0])) * curveH
  const pxToCx = (px: number) =>
    cxRange[0] + ((px - margin.left) / innerW) * (cxRange[1] - cxRange[0])
  const pxToCy = (py: number) =>
    cyRange[0] +
    ((margin.top + curveH - py) / curveH) * (cyRange[1] - cyRange[0])

  const gMaxAbs = Math.max(...gCoefs.map((v) => Math.abs(v)), 1)
  const gxToPx = (t: number) => margin.left + t * innerW
  const gyToPx = (v: number) =>
    gTop + gH / 2 - (v / gMaxAbs) * (gH / 2 - 22)

  // ===== Drag handlers =====
  // Capture pointer on the SVG element (parent), not the CP circle, so
  // that re-rendering the circle with new cx/cy doesn't lose the capture.
  // Matches SketcherCanvas's pattern (line 774: "Capture on SVG element
  // (parent), not the circle"), which is what makes the sketcher's drag
  // feel smooth.
  const onCPPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragIndex(i)
      dragStartCpsRef.current = cps.map((p) => ({ x: p.x, y: p.y }))
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId)
      }
    },
    [cps],
  )

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const scaleX = width / rect.width
      const scaleY = height / rect.height
      const pixelX = (e.clientX - rect.left) * scaleX
      const pixelY = (e.clientY - rect.top) * scaleY
      pendingTargetRef.current = {
        x: pxToCx(pixelX),
        y: pxToCy(pixelY),
      }
      if (pendingRafRef.current !== null) return

      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null
        const target = pendingTargetRef.current
        if (target === null || dragIndex === null) return
        const { x: targetX, y: targetY } = target

        if (constrainExtrema) {
          // Scale up to sketcher-pixel-like magnitudes for the optimizer's
          // tolerances, then scale back for display state. Engine: core/.
          try {
            const { x, y } = slideCurve(
              cps.map((p) => p.x * OPT_SCALE),
              cps.map((p) => p.y * OPT_SCALE),
              KNOTS,
              4,
              dragIndex,
              targetX * OPT_SCALE,
              targetY * OPT_SCALE,
              { disableSliding: true, maxIterations: 20 },
            )
            setCps(x.map((xi, i) => ({ x: xi / OPT_SCALE, y: y[i] / OPT_SCALE })))
          } catch {
            // Fall through: optimizer failed, drop the step.
          }
        } else {
          const next = cps.slice()
          next[dragIndex] = { x: targetX, y: targetY }
          setCps(next)
        }
      })
    },
    [dragIndex, cps, constrainExtrema, width, height],
  )

  const onSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null) return
      setDragIndex(null)
      dragStartCpsRef.current = null
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current)
        pendingRafRef.current = null
      }
      pendingTargetRef.current = null
      if (svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId)
      }
    },
    [dragIndex],
  )

  // ===== Path strings =====
  const polygonD = cps
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`,
    )
    .join(' ')
  const curveD = curvePoints
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`,
    )
    .join(' ')
  const gPolygonD = gCoefs
    .map((v, i) => {
      const t = i / (gCoefs.length - 1)
      return `${i === 0 ? 'M' : 'L'}${gxToPx(t).toFixed(1)},${gyToPx(v).toFixed(1)}`
    })
    .join(' ')
  const gCurveD = (() => {
    const N = 80
    const pts: string[] = []
    for (let k = 0; k <= N; k++) {
      const t = k / N
      const v = evalBernstein(gCoefs, t)
      pts.push(
        `${k === 0 ? 'M' : 'L'}${gxToPx(t).toFixed(1)},${gyToPx(v).toFixed(1)}`,
      )
    }
    return pts.join(' ')
  })()

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: '100%',
        height: '100%',
        maxWidth: width,
        maxHeight: height,
        background: COLORS.background,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        touchAction: 'none',
      }}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
      onPointerCancel={onSvgPointerUp}
    >
      <defs>
        <marker
          id="ws-axis-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS.axis} />
        </marker>
      </defs>

      {/* Control polygon (faded gray dashed) */}
      <path
        d={polygonD}
        fill="none"
        stroke={COLORS.controlPolygon}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />

      {/* Curve */}
      <path d={curveD} fill="none" stroke={COLORS.curve} strokeWidth={2.5} />

      {/* Extremum markers — display only */}
      {extremaPositions.map((pos, i) => (
        <g key={`ext-${i}`} style={{ pointerEvents: 'none' }}>
          <circle
            cx={cxToPx(pos.x)}
            cy={cyToPx(pos.y)}
            r={10}
            fill="none"
            stroke={COLORS.extrema}
            strokeWidth={2.5}
          />
          <circle
            cx={cxToPx(pos.x)}
            cy={cyToPx(pos.y)}
            r={6}
            fill={COLORS.extremaFill}
          />
        </g>
      ))}

      {/* Control points — draggable. PointerDown starts the drag and asks
          the SVG (parent) to capture; pointermove/up are handled on the
          SVG so capture survives the circle re-rendering with new cx/cy. */}
      {cps.map((p, i) => (
        <circle
          key={`cp-${i}`}
          cx={cxToPx(p.x)}
          cy={cyToPx(p.y)}
          r={9}
          fill={dragIndex === i ? COLORS.controlPointDrag : COLORS.controlPoint}
          stroke="white"
          strokeWidth={2}
          style={{ cursor: 'grab' }}
          onPointerDown={onCPPointerDown(i)}
        />
      ))}

      {/* Section label */}
      <text
        x={margin.left}
        y={margin.top + 4}
        fontSize={27}
        fill={COLORS.label}
      >
        curve <tspan fontStyle="italic">c(t)</tspan>
      </text>

      {/* Divider */}
      <line
        x1={margin.left}
        y1={gTop - 14}
        x2={width - margin.right}
        y2={gTop - 14}
        stroke={COLORS.border}
        strokeWidth={1}
      />

      {/* g(t) plot — t-axis */}
      <line
        x1={gxToPx(0)}
        y1={gTop + gH / 2}
        x2={gxToPx(1) + 22}
        y2={gTop + gH / 2}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#ws-axis-arrow)"
      />
      {/* g(t)-axis */}
      <line
        x1={gxToPx(0)}
        y1={gyToPx(-gMaxAbs * 1.05)}
        x2={gxToPx(0)}
        y2={gyToPx(gMaxAbs * 1.05) - 8}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#ws-axis-arrow)"
      />
      <text
        x={gxToPx(1) + 30}
        y={gTop + gH / 2 + 5}
        fontSize={17}
        fontStyle="italic"
        fill={COLORS.label}
      >
        t
      </text>
      <text
        x={gxToPx(0) + 8}
        y={gyToPx(gMaxAbs * 1.05) + 1}
        fontSize={26}
        fontStyle="italic"
        fill={COLORS.label}
      >
        g(t)
      </text>

      {/* g(t) control polygon (dashed) */}
      <path
        d={gPolygonD}
        fill="none"
        stroke={COLORS.controlPolygon}
        strokeWidth={1.2}
        strokeDasharray="5 4"
      />

      {/* g(t) function curve */}
      <path d={gCurveD} fill="none" stroke={COLORS.gLine} strokeWidth={2} />

      {/* Bernstein coefficient dots. With disableSliding=true the inactive
          set is empty (every dot fully colored). Zero coefficients get +
          by convention. */}
      {gCoefs.map((v, i) => {
        const t = i / (gCoefs.length - 1)
        const x = gxToPx(t)
        const y = gyToPx(v)
        const sign = v < -1e-6 ? -1 : 1
        const color = sign > 0 ? COLORS.gPositive : COLORS.gNegative
        const symbol = sign > 0 ? '+' : '−'
        return (
          <g key={`g-${i}`}>
            <circle
              cx={x}
              cy={y}
              r={9}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
            />
            <text
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              fill="white"
            >
              {symbol}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
