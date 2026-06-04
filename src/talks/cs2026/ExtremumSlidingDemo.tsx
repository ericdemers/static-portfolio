import { useState, useCallback, useRef, useMemo } from 'react'
import { curvatureExtremaNumeratorPlanar } from '../../core'

/**
 * Beat (b) demo: drag the vertex of an upside-down parabola; watch the
 * Bernstein-coefficient sign boundary of g(t) slide in sync.
 *
 * Math: the underlying curve is a *perturbed* parabola
 *     y(u) = -u^2 + EPSILON · u^4    where  u = x − a,   x ∈ [-1, 1],
 * scaled by 1 / (1 + |a|)^1.5 to keep the deep endpoint near y = -1
 * across the slider. The quartic term lifts the tails slightly so that
 * g(t) is no longer linear — it becomes degree 7, which in the
 * degree-10 Bernstein basis traces a visibly *curved* control polygon
 * (the audience reads "control polygon of a B-spline function," not a
 * line). EPSILON is small enough that g still has exactly one zero in
 * the visible range, so the single-extremum story is preserved.
 *
 * g(t)'s Bernstein coefficients are computed by the sketcher's own
 * computeCurvatureDerivativeNumeratorCPsFromArrays so the demo shares
 * the talk's actual math path.
 */

interface Props {
  width?: number
  height?: number
}

const COLORS = {
  background: '#fafafa',
  border: '#e5e7eb',
  axis: '#cbd5e1',
  curve: '#1f2937',
  controlPolygon: '#cbd5e1',
  controlPoint: '#3b82f6', // sketcher selected blue — single-curve presentation
  extrema: '#f59e0b', // sketcher amber
  extremaFill: 'rgba(245, 158, 11, 0.4)',
  extremaFillActive: 'rgba(245, 158, 11, 0.85)',
  gLine: '#475569',
  gPositive: '#16a34a',
  gNegative: '#dc2626',
  gZero: '#9ca3af',
  label: '#475569',
}

const A_MIN = -0.85
const A_MAX = 0.85
// Layout + display ranges are prop-independent, so they live at module scope —
// stable references for the memoized coordinate transforms / handlers.
const margin = { top: 36, right: 40, bottom: 24, left: 48 }
const cxRange: [number, number] = [-1.15, 1.15]
const cyRange: [number, number] = [-1.6, 0.5]

// Quartic perturbation magnitude: y = -u^2 + EPSILON · u^4. Keeps a comfortable
// safety margin (~25%) before the secondary zeros of g at u^2 = (1+EPSILON) /
// (10·EPSILON) would enter the visible range.
const EPSILON = 0.022

// De Casteljau evaluation of a Bezier-basis polynomial on [0, 1].
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

export default function ExtremumSlidingDemo({ width = 800, height = 580 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [a, setA] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Degree-4 Bezier CPs of the perturbed parabola y(u) = -u^2 + EPSILON · u^4
  // (u = x - a), via blossoming, then soft-depth-bounded by 1/(1+|a|)^1.5.
  // For EPSILON = 0 these collapse to the original parabola formulas.
  const cps = useMemo(() => {
    const norm = (1 + Math.abs(a)) ** 1.5
    const m = 1 + a // u at left endpoint = -m, u at right endpoint = 1 - a
    const oneMinusA = 1 - a
    const oneMinusASq = oneMinusA * oneMinusA
    const oneMinusASqSq = oneMinusASq * oneMinusASq // (1-a)^4
    const mSq = m * m
    const mSqSq = mSq * mSq // (1+a)^4
    const oneMinusASq2 = (1 - a * a) * (1 - a * a) // (1-a^2)^2
    const ys = [
      -mSq + EPSILON * mSqSq,
      -a * m - EPSILON * (m * mSq) * oneMinusA,
      (1 - 3 * a * a) / 3 + EPSILON * oneMinusASq2,
      a * oneMinusA - EPSILON * m * (oneMinusASq * oneMinusA),
      -oneMinusASq + EPSILON * oneMinusASqSq,
    ]
    return ys.map((y, i) => ({ x: -1 + 0.5 * i, y: y / norm }))
  }, [a])

  // g(t)'s Bernstein coefficients via the sketcher's own algebra path.
  // Knots: open-uniform [0,0,0,0,0,1,1,1,1,1] for a single-span degree-4 Bezier.
  const gCoefs = useMemo(() => {
    const knots = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]
    const degree = knots.length - cps.length - 1
    return curvatureExtremaNumeratorPlanar(
      cps.map((p) => p.x),
      cps.map((p) => p.y),
      knots,
      degree,
    ).flatCoeffs()
  }, [cps])

  // Inactive constraints: within each maximal sign-changing sequence of g's
  // Bernstein coefficients, the entry with largest |g| is the active anchor;
  // the rest are inactive (they may cross zero without changing S).
  // Mirrors BSplineFunctionDemo's algorithm so the visual idiom matches.
  const inactiveSet = useMemo(() => {
    const inactive = new Set<number>()
    const n = gCoefs.length
    let i = 0
    while (i < n - 1) {
      if (gCoefs[i] * gCoefs[i + 1] <= 0) {
        const seq: { idx: number; absVal: number }[] = [
          { idx: i, absVal: Math.abs(gCoefs[i]) },
          { idx: i + 1, absVal: Math.abs(gCoefs[i + 1]) },
        ]
        let j = i + 1
        while (j + 1 < n && gCoefs[j] * gCoefs[j + 1] <= 0) {
          seq.push({ idx: j + 1, absVal: Math.abs(gCoefs[j + 1]) })
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
  }, [gCoefs])

  // Sampled curve points (degree-4 Bernstein evaluation).
  const curvePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = []
    const N = 80
    for (let k = 0; k <= N; k++) {
      const t = k / N
      const u = 1 - t
      const b0 = u * u * u * u
      const b1 = 4 * t * u * u * u
      const b2 = 6 * t * t * u * u
      const b3 = 4 * t * t * t * u
      const b4 = t * t * t * t
      pts.push({
        x: b0 * cps[0].x + b1 * cps[1].x + b2 * cps[2].x + b3 * cps[3].x + b4 * cps[4].x,
        y: b0 * cps[0].y + b1 * cps[1].y + b2 * cps[2].y + b3 * cps[3].y + b4 * cps[4].y,
      })
    }
    return pts
  }, [cps])

  // Layout (margin, cxRange, cyRange are module constants)
  const curveFrac = 0.65
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const curveH = innerH * curveFrac - 14
  const gTop = margin.top + curveH + 28
  const gH = innerH - curveH - 28

  // Coordinate transforms — y-range tightened to the soft-bounded depth.
  const cxToPx = (x: number) =>
    margin.left + ((x - cxRange[0]) / (cxRange[1] - cxRange[0])) * innerW
  const cyToPx = (y: number) =>
    margin.top + curveH - ((y - cyRange[0]) / (cyRange[1] - cyRange[0])) * curveH

  const gMaxAbs = Math.max(...gCoefs.map((v) => Math.abs(v)), 1)
  const gxToPx = (t: number) => margin.left + t * innerW
  const gyToPx = (v: number) => gTop + gH / 2 - (v / gMaxAbs) * (gH / 2 - 22)

  // Drag handlers
  const updateAFromPointer = useCallback(
    (clientX: number) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const scaleX = width / rect.width
      const pixelX = (clientX - rect.left) * scaleX
      const x = cxRange[0] + ((pixelX - margin.left) / innerW) * (cxRange[1] - cxRange[0])
      setA(Math.max(A_MIN, Math.min(A_MAX, x)))
    },
    [innerW, width]
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      updateAFromPointer(e.clientX)
    },
    [updateAFromPointer]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (!dragging) return
      updateAFromPointer(e.clientX)
    },
    [dragging, updateAFromPointer]
  )

  const onPointerUp = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // Path strings
  const polygonD = cps
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`)
    .join(' ')
  const curveD = curvePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`)
    .join(' ')
  // g(t) control polygon (line through the Bernstein coefficient dots)
  const gPolygonD = gCoefs
    .map((v, i) => {
      const t = i / (gCoefs.length - 1)
      return `${i === 0 ? 'M' : 'L'}${gxToPx(t).toFixed(1)},${gyToPx(v).toFixed(1)}`
    })
    .join(' ')

  // g(t) function curve, sampled from the Bernstein representation
  const gCurveD = (() => {
    const N = 80
    const pts: string[] = []
    for (let k = 0; k <= N; k++) {
      const t = k / N
      const v = evalBernstein(gCoefs, t)
      pts.push(`${k === 0 ? 'M' : 'L'}${gxToPx(t).toFixed(1)},${gyToPx(v).toFixed(1)}`)
    }
    return pts.join(' ')
  })()

  const vertexX = cxToPx(a)
  const vertexY = cyToPx(0)

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
    >
      {/* Curve area: dashed x-axis */}
      <line
        x1={margin.left}
        y1={cyToPx(0)}
        x2={width - margin.right}
        y2={cyToPx(0)}
        stroke={COLORS.axis}
        strokeWidth={1}
        strokeDasharray="4 4"
      />

      {/* Control polygon */}
      <path
        d={polygonD}
        fill="none"
        stroke={COLORS.controlPolygon}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      {cps.map((p, i) => (
        <circle
          key={`cp-${i}`}
          cx={cxToPx(p.x)}
          cy={cyToPx(p.y)}
          r={9}
          fill={COLORS.controlPoint}
          stroke="white"
          strokeWidth={2}
        />
      ))}

      {/* Curve */}
      <path d={curveD} fill="none" stroke={COLORS.curve} strokeWidth={2.5} />

      {/* Extremum marker — amber target style, matches sketcher canvas */}
      <circle
        cx={vertexX}
        cy={vertexY}
        r={10}
        fill="none"
        stroke={COLORS.extrema}
        strokeWidth={2.5}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={vertexX}
        cy={vertexY}
        r={6}
        fill={dragging ? COLORS.extremaFillActive : COLORS.extremaFill}
        style={{ pointerEvents: 'none' }}
      />
      {/* Transparent hit area for easy grabbing */}
      <circle
        cx={vertexX}
        cy={vertexY}
        r={18}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Section label for curve area */}
      <text x={margin.left} y={margin.top + 4} fontSize={27} fill={COLORS.label}>
        curve <tspan fontStyle="italic">c(t)</tspan>
      </text>

      {/* Arrowhead marker for axes */}
      <defs>
        <marker
          id="axis-arrow"
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

      {/* Divider between curve and g(t) */}
      <line
        x1={margin.left}
        y1={gTop - 14}
        x2={width - margin.right}
        y2={gTop - 14}
        stroke={COLORS.border}
        strokeWidth={1}
      />

      {/* Vertical dashed line linking the curve's extremum to g = 0 */}
      <line
        x1={vertexX}
        y1={vertexY}
        x2={vertexX}
        y2={gTop + gH / 2}
        stroke={COLORS.extrema}
        strokeWidth={1.5}
        strokeDasharray="6 5"
        opacity={0.55}
      />

      {/* g(t) plot — solid arrowed t- and g(t)-axes */}
      <line
        x1={gxToPx(0)}
        y1={gTop + gH / 2}
        x2={gxToPx(1) + 22}
        y2={gTop + gH / 2}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#axis-arrow)"
      />
      <line
        x1={gxToPx(0)}
        y1={gyToPx(-gMaxAbs * 1.05)}
        x2={gxToPx(0)}
        y2={gyToPx(gMaxAbs * 1.05) - 8}
        stroke={COLORS.axis}
        strokeWidth={1.5}
        markerEnd="url(#axis-arrow)"
      />

      {/* Axis labels — italic, at the arrow tips */}
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

      {/* g(t) control polygon (dashed light line through the dots) */}
      <path
        d={gPolygonD}
        fill="none"
        stroke={COLORS.controlPolygon}
        strokeWidth={1.2}
        strokeDasharray="5 4"
      />

      {/* g(t) function curve sampled from the Bernstein representation */}
      <path d={gCurveD} fill="none" stroke={COLORS.gLine} strokeWidth={2} />

      {/* Bernstein coefficient dots — inactive ones (sliding constraints) are
          faded. Zero coefficients are assigned the positive sign by convention
          (a one-time choice at session start, per the talk's variation-
          diminishing setup). */}
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
            <circle cx={x} cy={y} r={9} fill={color} stroke="white" strokeWidth={1.5} />
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
