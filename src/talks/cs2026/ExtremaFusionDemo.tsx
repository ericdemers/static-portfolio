import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { curvatureExtremaNumeratorPlanar, slideCurve } from '../../core'

/**
 * Beat (c) demo — extrema fusion.
 *
 * Same self-contained viewer pattern as WithoutSlidingDemo (RAF
 * throttle, SVG-level pointer capture, ×200 internal scale for the
 * optimizer, anchor 0.05 + drag-start snapshot, maxIterations 20), but
 * with an airfoil-like initial polygon that gives **three** curvature
 * extrema, and **without** disableSliding so the optimizer uses the
 * maximal inactive set. Dragging the rightmost CP outward lets two
 * extrema slide toward each other, merge, and disappear — the bound
 * on the number of curvature extrema can only stay the same or
 * decrease.
 *
 * With the constraint off, the bound is free to grow as well — the
 * "without the sliding mechanism, things can get worse" counter-demo.
 */

interface Props {
  width?: number
  height?: number
  constrainExtrema?: boolean
  onBoundChange?: (bound: number | null) => void
  /**
   * Bumping this value resets the control points to their initial
   * positions. Pattern: parent owns a counter, increments on each
   * "Reset" click; the child runs a `useEffect([resetNonce])` that
   * snaps CPs back to INITIAL_CPS.
   */
  resetNonce?: number
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
const OPT_SCALE = 200
// Layout + display ranges are prop-independent, so they live at module scope —
// stable references for the memoized coordinate transforms.
const margin = { top: 36, right: 40, bottom: 24, left: 48 }
const cxRange: [number, number] = [-3, 4.5]
const cyRange: [number, number] = [-1, 2.5]

// Airfoil-like initial polygon: degree-4 Bezier with 5 CPs that yields
// a curve with three curvature extrema. P4 starts just to the right of
// P3 so it reads as the *rightmost* control point (matching the panel
// copy) while remaining close enough to feel visually "below" P3.
// Dragging P4 right gives a clean sweep that lets two extrema slide
// toward each other and annihilate.
const INITIAL_CPS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: -2, y: 0 },
  { x: -1, y: 2 },
  { x: 1, y: 2 },
  { x: 1.3, y: 0 },
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

// Find zeros of f on [0,1] via dense sampling + bisection. Tolerance-aware
// so exact-zero-at-sample (symmetric configurations) is handled cleanly.
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

// Maximal sign-changing-sequence inactive set (the sliding mechanism's
// pick). Matches BSplineFunctionDemo / BSplineCurveProblem.
function computeInactiveSet(gCPs: number[]): Set<number> {
  const inactive = new Set<number>()
  const n = gCPs.length
  let i = 0
  while (i < n - 1) {
    if (gCPs[i] * gCPs[i + 1] <= 0) {
      const seq: { idx: number; absVal: number }[] = [
        { idx: i, absVal: Math.abs(gCPs[i]) },
        { idx: i + 1, absVal: Math.abs(gCPs[i + 1]) },
      ]
      let j = i + 1
      while (j + 1 < n && gCPs[j] * gCPs[j + 1] <= 0) {
        seq.push({ idx: j + 1, absVal: Math.abs(gCPs[j + 1]) })
        j++
      }
      let maxEntry = seq[0]
      for (const e of seq) if (e.absVal > maxEntry.absVal) maxEntry = e
      for (const e of seq) if (e.idx !== maxEntry.idx) inactive.add(e.idx)
      i = j + 1
    } else {
      i++
    }
  }
  return inactive
}

export default function ExtremaFusionDemo({
  width = 800,
  height = 580,
  constrainExtrema = true,
  onBoundChange,
  resetNonce = 0,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [cps, setCps] = useState<{ x: number; y: number }[]>(INITIAL_CPS)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // Reset CPs when the parent bumps the nonce. Adjusting state during render
  // (tracking the previous nonce) is React's recommended alternative to a
  // setState-in-effect — it avoids a cascading re-render. prevNonce starts at
  // the initial nonce, so the first render is a no-op.
  const [prevNonce, setPrevNonce] = useState(resetNonce)
  if (prevNonce !== resetNonce) {
    setPrevNonce(resetNonce)
    setCps(INITIAL_CPS)
  }
  const dragStartCpsRef = useRef<{ x: number; y: number }[] | null>(null)
  const pendingTargetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRafRef = useRef<number | null>(null)

  const gCoefs = useMemo<number[]>(() => {
    return curvatureExtremaNumeratorPlanar(
      cps.map((p) => p.x),
      cps.map((p) => p.y),
      KNOTS,
      4,
    ).flatCoeffs()
  }, [cps])

  const bound = useMemo(() => countSignChanges(gCoefs), [gCoefs])

  useEffect(() => {
    onBoundChange?.(constrainExtrema ? bound : null)
  }, [bound, constrainExtrema, onBoundChange])

  const inactiveSet = useMemo(
    () => (constrainExtrema ? computeInactiveSet(gCoefs) : new Set<number>()),
    [gCoefs, constrainExtrema],
  )

  const extremaPositions = useMemo(() => {
    const zeros = findZeros((t) => evalBernstein(gCoefs, t))
    return zeros.map((t) => evalCurve(cps, t))
  }, [gCoefs, cps])

  const curvePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = []
    const N = 100
    for (let k = 0; k <= N; k++) pts.push(evalCurve(cps, k / N))
    return pts
  }, [cps])

  // ===== Layout ===== (margin, cxRange, cyRange are module constants)
  const curveFrac = 0.65
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const curveH = innerH * curveFrac - 14
  const gTop = margin.top + curveH + 28
  const gH = innerH - curveH - 28

  const cxToPx = (x: number) =>
    margin.left + ((x - cxRange[0]) / (cxRange[1] - cxRange[0])) * innerW
  const cyToPx = (y: number) =>
    margin.top + curveH - ((y - cyRange[0]) / (cyRange[1] - cyRange[0])) * curveH
  // Memoized so they're stable deps for the pointer-move callback below.
  const pxToCx = useCallback(
    (px: number) => cxRange[0] + ((px - margin.left) / innerW) * (cxRange[1] - cxRange[0]),
    [innerW],
  )
  const pxToCy = useCallback(
    (py: number) => cyRange[0] + ((margin.top + curveH - py) / curveH) * (cyRange[1] - cyRange[0]),
    [curveH],
  )

  const gMaxAbs = Math.max(...gCoefs.map((v) => Math.abs(v)), 1)
  const gxToPx = (t: number) => margin.left + t * innerW
  const gyToPx = (v: number) =>
    gTop + gH / 2 - (v / gMaxAbs) * (gH / 2 - 22)

  // ===== Drag handlers — pointer captured on the SVG (parent), not the CP =====
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
          // Sliding active set (no disableSliding). Engine: core/.
          // method:'ipopt' is load-bearing: it is the robust solver the proven
          // ../sketcher deck uses (optimizeCurve always runs InteriorPointOptimizer).
          // The default banded solver under-converges on a quick drag and slides a
          // near-zero g coefficient across zero — spuriously adding an extremum.
          // See core/__tests__/boundPreservationSession.test.ts.
          try {
            const { x, y } = slideCurve(
              cps.map((p) => p.x * OPT_SCALE),
              cps.map((p) => p.y * OPT_SCALE),
              KNOTS,
              4,
              dragIndex,
              targetX * OPT_SCALE,
              targetY * OPT_SCALE,
              { method: 'ipopt', maxIterations: 20 },
            )
            setCps(x.map((xi, i) => ({ x: xi / OPT_SCALE, y: y[i] / OPT_SCALE })))
          } catch {
            // Drop the step if the optimizer fails.
          }
        } else {
          const next = cps.slice()
          next[dragIndex] = { x: targetX, y: targetY }
          setCps(next)
        }
      })
    },
    [dragIndex, cps, constrainExtrema, width, height, pxToCx, pxToCy],
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
          id="ef-axis-arrow"
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

      {/* Control polygon */}
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
          SVG so capture survives the circle re-rendering. */}
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

      {/* g(t) t-axis */}
      <line
        x1={gxToPx(0)}
        y1={gTop + gH / 2}
        x2={gxToPx(1) + 22}
        y2={gTop + gH / 2}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#ef-axis-arrow)"
      />
      {/* g(t)-axis */}
      <line
        x1={gxToPx(0)}
        y1={gyToPx(-gMaxAbs * 1.05)}
        x2={gxToPx(0)}
        y2={gyToPx(gMaxAbs * 1.05) - 8}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#ef-axis-arrow)"
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

      {/* Bernstein coefficient dots — inactive ones (sliding constraints)
          are faded to 0.25 opacity. Zero coefficients get + by convention. */}
      {gCoefs.map((v, i) => {
        const t = i / (gCoefs.length - 1)
        const x = gxToPx(t)
        const y = gyToPx(v)
        const sign = v < -1e-6 ? -1 : 1
        const color = sign > 0 ? COLORS.gPositive : COLORS.gNegative
        const symbol = sign > 0 ? '+' : '−'
        const opacity = inactiveSet.has(i) ? 0.25 : 1
        return (
          <g key={`g-${i}`} opacity={opacity}>
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
