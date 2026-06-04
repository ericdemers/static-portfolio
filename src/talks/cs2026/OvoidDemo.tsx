import { useState, useCallback, useRef, useMemo } from 'react'
import type { Point2D } from '../../core'
import {
  evaluate,
  plainCoeffs,
  closedCurvatureExtremaParameters,
  closedInflectionParameters,
  slideCurve,
} from '../../core'
import { twoAxisSequence } from './ovalShapes'
import { buildMirrorMap } from './symmetry'

/**
 * Self-contained viewer for the "Single axis of symmetry" slide.
 *
 * Closed periodic degree-3 B-spline with 12 CPs, **y-axis symmetric
 * only** (no top/bottom mirror), starting from an ovoid shape (egg
 * pointing up — narrow top, wide bottom). The optimizer preserves
 * the four curvature extrema but **leaves inflections free**: as the
 * user drags, the curve can develop a "waist" (peanut-style) and the
 * inflection markers appear in teal.
 *
 * Same direct-ref drag pattern and click-to-deselect UI as OvalDemo.
 */

interface Props {
  width?: number
  height?: number
}

const COLORS = {
  background: '#fafafa',
  border: '#e5e7eb',
  curve: '#1f2937',
  controlPolygon: '#cbd5e1',
  controlPoint: '#3b82f6',
  controlPointDrag: '#1e40af',
  extrema: '#f59e0b',
  extremaFill: 'rgba(245, 158, 11, 0.4)',
  inflection: '#0891b2',
  inflectionFill: 'rgba(8, 145, 178, 0.4)',
  symmetryAxis: '#cbd5e1',
}

const DEGREE = 3
const NUM_CPS = 12
const KNOTS = Array.from({ length: NUM_CPS }, (_, i) => i / NUM_CPS)

// Initial CPs — the SAME near-circle as the Oval slide, on purpose. This
// slide opens on identical geometry; what differs is the constraint set
// (y-axis symmetry only, inflections free). The user discovers the new
// freedom by dragging the top differently from the bottom, which the
// Oval's two-axis mirror prevented.
const INITIAL_CPS: Point2D[] = twoAxisSequence[0].controlPoints.map((p) => ({
  x: p.x,
  y: p.y,
}))

// Y-axis-only symmetry (mirror across x = 0). The X-axis mirror is
// disabled — the ovoid has no top/bottom symmetry, by design.
const MIRROR_MAP_Y = buildMirrorMap(INITIAL_CPS, 'y')
const SYMMETRY_MAPS = { mapX: null, mapY: MIRROR_MAP_Y }

const ANCHOR_WEIGHT = 0.05

const CURVE_SAMPLES = 100

// Pre-allocated marker slots. The optimizer preserves 4 extrema, so
// MAX_EXTREMA = 8 gives buffer for transient configurations. Inflections
// are free — for a y-axis-symmetric curve they come in mirror pairs, so
// 0, 2, 4, ... can occur; MAX_INFLECTIONS = 8 covers strongly waisted
// shapes.
const MAX_EXTREMA = 8
const MAX_INFLECTIONS = 8

// =====================================================================
// Pure path builders (shared between initial render and drag handler).
// =====================================================================

function buildCurvePath(
  cps: Point2D[],
  cxToPx: (x: number) => number,
  cyToPx: (y: number) => number,
): string {
  const parts: string[] = []
  for (let k = 0; k < CURVE_SAMPLES; k++) {
    const t = k / CURVE_SAMPLES
    const p = evaluate(plainCoeffs, cps, DEGREE, KNOTS, t, true)
    parts.push(
      `${k === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`,
    )
  }
  parts.push('Z')
  return parts.join(' ')
}

function buildPolygonPath(
  cps: Point2D[],
  cxToPx: (x: number) => number,
  cyToPx: (y: number) => number,
): string {
  const parts: string[] = []
  for (let i = 0; i < cps.length; i++) {
    parts.push(
      `${i === 0 ? 'M' : 'L'}${cxToPx(cps[i].x).toFixed(1)},${cyToPx(cps[i].y).toFixed(1)}`,
    )
  }
  parts.push('Z')
  return parts.join(' ')
}

function computeExtrema(cps: Point2D[]): Point2D[] {
  try {
    const ts = closedCurvatureExtremaParameters(
      cps.map((p) => p.x),
      cps.map((p) => p.y),
      KNOTS,
      DEGREE,
    )
    return ts.map((t) => evaluate(plainCoeffs, cps, DEGREE, KNOTS, t, true))
  } catch {
    return []
  }
}

function computeInflections(cps: Point2D[]): Point2D[] {
  try {
    const ts = closedInflectionParameters(
      cps.map((p) => p.x),
      cps.map((p) => p.y),
      KNOTS,
      DEGREE,
    )
    return ts.map((t) => evaluate(plainCoeffs, cps, DEGREE, KNOTS, t, true))
  } catch {
    return []
  }
}

export default function OvoidDemo({ width = 580, height = 580 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  const [cpsState, setCpsState] = useState<Point2D[]>(INITIAL_CPS)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [selected, setSelected] = useState(true)

  const cpsLiveRef = useRef<Point2D[]>(INITIAL_CPS)
  const dragStartCpsRef = useRef<Point2D[] | null>(null)
  const pendingTargetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRafRef = useRef<number | null>(null)
  // True for the one synthetic click that follows a drag's pointerup, so
  // onSvgClick can skip deselecting on it.
  const justDraggedRef = useRef(false)

  const cpCircleRefs = useRef<(SVGCircleElement | null)[]>([])
  const curvePathRef = useRef<SVGPathElement>(null)
  const curveHitPathRef = useRef<SVGPathElement>(null)
  const polygonPathRef = useRef<SVGPathElement>(null)
  const extremaRefs = useRef<(SVGGElement | null)[]>([])
  const inflectionRefs = useRef<(SVGGElement | null)[]>([])

  // ===== Layout =====
  const margin = 24
  const innerSize = Math.min(width, height) - 2 * margin
  const WORLD_HALF = 280

  const cxToPx = useCallback(
    (x: number) => margin + ((x + WORLD_HALF) / (2 * WORLD_HALF)) * innerSize,
    [innerSize, margin],
  )
  const cyToPx = useCallback(
    (y: number) =>
      margin + innerSize - ((y + WORLD_HALF) / (2 * WORLD_HALF)) * innerSize,
    [innerSize, margin],
  )
  const pxToCx = useCallback(
    (px: number) =>
      -WORLD_HALF + ((px - margin) / innerSize) * (2 * WORLD_HALF),
    [innerSize, margin],
  )
  const pxToCy = useCallback(
    (py: number) =>
      -WORLD_HALF +
      ((margin + innerSize - py) / innerSize) * (2 * WORLD_HALF),
    [innerSize, margin],
  )

  // ===== Render-time derived data (used only for non-drag renders) =====
  const curvePathD = useMemo(
    () => buildCurvePath(cpsState, cxToPx, cyToPx),
    [cpsState, cxToPx, cyToPx],
  )
  const polygonPathD = useMemo(
    () => buildPolygonPath(cpsState, cxToPx, cyToPx),
    [cpsState, cxToPx, cyToPx],
  )
  const extremaPositions = useMemo(() => computeExtrema(cpsState), [cpsState])
  const inflectionPositions = useMemo(
    () => computeInflections(cpsState),
    [cpsState],
  )

  // ===== Imperative drag-time DOM updater =====
  const applyCpsToDom = useCallback(
    (cps: Point2D[]) => {
      // CP circles
      const circles = cpCircleRefs.current
      for (let i = 0; i < cps.length; i++) {
        const el = circles[i]
        if (!el) continue
        el.setAttribute('cx', cxToPx(cps[i].x).toFixed(1))
        el.setAttribute('cy', cyToPx(cps[i].y).toFixed(1))
      }

      // Curve (visible + transparent hit-area twin)
      const curveD = buildCurvePath(cps, cxToPx, cyToPx)
      if (curvePathRef.current) {
        curvePathRef.current.setAttribute('d', curveD)
      }
      if (curveHitPathRef.current) {
        curveHitPathRef.current.setAttribute('d', curveD)
      }

      // Control polygon
      if (polygonPathRef.current) {
        polygonPathRef.current.setAttribute(
          'd',
          buildPolygonPath(cps, cxToPx, cyToPx),
        )
      }

      // Extrema markers
      const exs = computeExtrema(cps)
      const exSlots = extremaRefs.current
      for (let i = 0; i < MAX_EXTREMA; i++) {
        const g = exSlots[i]
        if (!g) continue
        if (i < exs.length) {
          g.setAttribute(
            'transform',
            `translate(${cxToPx(exs[i].x).toFixed(1)},${cyToPx(exs[i].y).toFixed(1)})`,
          )
          g.setAttribute('visibility', 'visible')
        } else {
          g.setAttribute('visibility', 'hidden')
        }
      }

      // Inflection markers — same pattern, separate slot pool & color.
      const inflections = computeInflections(cps)
      const inflectionSlots = inflectionRefs.current
      for (let i = 0; i < MAX_INFLECTIONS; i++) {
        const g = inflectionSlots[i]
        if (!g) continue
        if (i < inflections.length) {
          g.setAttribute(
            'transform',
            `translate(${cxToPx(inflections[i].x).toFixed(1)},${cyToPx(inflections[i].y).toFixed(1)})`,
          )
          g.setAttribute('visibility', 'visible')
        } else {
          g.setAttribute('visibility', 'hidden')
        }
      }
    },
    [cxToPx, cyToPx],
  )

  // ===== Drag handlers =====
  const onCPPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragIndex(i)
      dragStartCpsRef.current = cpsLiveRef.current.map((p) => ({
        x: p.x,
        y: p.y,
      }))
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId)
      }
    },
    [],
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

        const live = cpsLiveRef.current
        const anchor = dragStartCpsRef.current
        try {
          // Closed-curve sliding via core/: preserve the 4 curvature
          // extrema (g signs) with y-axis symmetry enforced by variable
          // reduction (symmetryMaps). NO preserveInflections — the ovoid
          // is free to develop a waist; inflections are detected and shown
          // in teal but not constrained.
          const { x, y } = slideCurve(
            live.map((p) => p.x),
            live.map((p) => p.y),
            KNOTS,
            DEGREE,
            dragIndex,
            targetX,
            targetY,
            {
              closed: true,
              // Robust solver (matches ../sketcher's optimizeCurve). The default
              // dense primal-dual slides a symmetry-forced near-zero g coefficient
              // across zero on a quick drag; ipopt's structural margins hold it.
              method: 'ipopt',
              maxIterations: 20, // Gauss-Newton converges fast; matches ../sketcher
              dragWeight: 25,
              symmetryMaps: SYMMETRY_MAPS,
              ...(anchor
                ? {
                    anchorWeight: ANCHOR_WEIGHT,
                    anchorX: anchor.map((p) => p.x),
                    anchorY: anchor.map((p) => p.y),
                  }
                : {}),
            },
          )
          const next: Point2D[] = x.map((xi, i) => ({ x: xi, y: y[i] }))
          cpsLiveRef.current = next
          applyCpsToDom(next)
        } catch {
          // Drop the step if the optimizer fails.
        }
      })
    },
    [dragIndex, width, height, pxToCx, pxToCy, applyCpsToDom],
  )

  const onSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null) return
      // Skip the synthetic post-drag click in onSvgClick (don't deselect).
      justDraggedRef.current = true
      setCpsState(cpsLiveRef.current)
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

  // ===== Selection handlers =====
  const onSvgClick = useCallback(() => {
    // Ignore the synthetic click fired right after a drag ends — only a
    // genuine background click should deselect.
    if (justDraggedRef.current) {
      justDraggedRef.current = false
      return
    }
    setSelected(false)
  }, [])

  const onCurveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(true)
  }, [])

  const extremumSlots = Array.from({ length: MAX_EXTREMA }, (_, i) => i)
  const inflectionSlots = Array.from({ length: MAX_INFLECTIONS }, (_, i) => i)

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
      onClick={onSvgClick}
    >
      {/* Vertical symmetry axis only — the one structural property of
          the ovoid. No horizontal axis (the curve has no x-axis
          mirror). */}
      <line
        x1={cxToPx(0)}
        y1={cyToPx(-WORLD_HALF)}
        x2={cxToPx(0)}
        y2={cyToPx(WORLD_HALF)}
        stroke={COLORS.symmetryAxis}
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* Control polygon — only when selected */}
      {selected && (
        <path
          ref={polygonPathRef}
          d={polygonPathD}
          fill="none"
          stroke={COLORS.controlPolygon}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          pointerEvents="none"
        />
      )}

      {/* Curve (visible stroke) */}
      <path
        ref={curvePathRef}
        d={curvePathD}
        fill="none"
        stroke={COLORS.curve}
        strokeWidth={2.5}
        pointerEvents="none"
      />

      {/* Transparent wider hit-area twin for click-to-reselect */}
      <path
        ref={curveHitPathRef}
        d={curvePathD}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
        onClick={onCurveClick}
      />

      {/* Extremum markers — amber, fixed slot count */}
      {extremumSlots.map((i) => {
        const pos = extremaPositions[i]
        const visible = pos !== undefined
        const tx = visible ? cxToPx(pos.x).toFixed(1) : '0'
        const ty = visible ? cyToPx(pos.y).toFixed(1) : '0'
        return (
          <g
            key={`ext-${i}`}
            ref={(el) => {
              extremaRefs.current[i] = el
            }}
            transform={`translate(${tx},${ty})`}
            visibility={visible ? 'visible' : 'hidden'}
            style={{ pointerEvents: 'none' }}
          >
            <circle
              r={10}
              fill="none"
              stroke={COLORS.extrema}
              strokeWidth={2.5}
            />
            <circle r={6} fill={COLORS.extremaFill} />
          </g>
        )
      })}

      {/* Inflection markers — teal, fixed slot count. Visible whenever
          the inflection numerator f has zeros; hidden otherwise.
          Distinct from extrema markers in both hue and the visual
          message ("the curve has a sign change in κ here"). */}
      {inflectionSlots.map((i) => {
        const pos = inflectionPositions[i]
        const visible = pos !== undefined
        const tx = visible ? cxToPx(pos.x).toFixed(1) : '0'
        const ty = visible ? cyToPx(pos.y).toFixed(1) : '0'
        return (
          <g
            key={`inf-${i}`}
            ref={(el) => {
              inflectionRefs.current[i] = el
            }}
            transform={`translate(${tx},${ty})`}
            visibility={visible ? 'visible' : 'hidden'}
            style={{ pointerEvents: 'none' }}
          >
            <circle
              r={10}
              fill="none"
              stroke={COLORS.inflection}
              strokeWidth={2.5}
            />
            <circle r={6} fill={COLORS.inflectionFill} />
          </g>
        )
      })}

      {/* Control points — only when selected */}
      {selected &&
        cpsState.map((p, i) => (
          <circle
            key={`cp-${i}`}
            ref={(el) => {
              cpCircleRefs.current[i] = el
            }}
            cx={cxToPx(p.x)}
            cy={cyToPx(p.y)}
            r={8}
            fill={dragIndex === i ? COLORS.controlPointDrag : COLORS.controlPoint}
            stroke="white"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
            onPointerDown={onCPPointerDown(i)}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
    </svg>
  )
}
