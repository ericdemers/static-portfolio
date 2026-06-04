import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { Point2D } from '../../core'
import {
  evaluate,
  plainCoeffs,
  closedCurvatureExtremaParameters,
  closedInflectionParameters,
  slideCurve,
} from '../../core'
import { buildMirrorMap } from './symmetry'

/**
 * Self-contained viewer for the "Airfoil" slide.
 *
 * Closed periodic degree-3 B-spline with 12 CPs in an airfoil-like
 * polygon (chord aligned with the x-axis, rounded leading edge on the
 * left, sharp-ish trailing edge on the right). The `symmetric` prop
 * toggles a single mirror across the x-axis:
 *
 *   - symmetric = true  → optimizer enforces y → -y mirror (NACA-style).
 *   - symmetric = false → no mirror constraint; the curve can develop
 *                          camber (asymmetric top vs. bottom).
 *
 * Extrema count preserved at 4. Inflections free and rendered in teal
 * when present — strongly cambered airfoils could develop one, though
 * the UIUC corpus largely doesn't.
 */

interface Props {
  width?: number
  height?: number
  /** Toggle the x-axis mirror. */
  symmetric?: boolean
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

// Match the closed-curve representation used by the oval and ovoid
// slides: degree 3, 12 CPs, uniform periodic knots. Easier to drag than
// the v2 study's 26-CP / degree-5 fit, with enough DoF to read clearly
// as a NACA 0012 silhouette.
const DEGREE = 3
const NUM_CPS = 12
const KNOTS = Array.from({ length: NUM_CPS }, (_, i) => i / NUM_CPS)

// NACA 0012 → 12-CP / degree-3 approximation. Produced by Eric's
// Airfoil Workbench workflow (Energy = Jerk, λ slider = 1e6, press
// Fair → press Fit), re-run programmatically against the v2-study
// source curve in unit-chord space, then scaled back to chord = 400
// for the talk viewport. Snapped to exact x-axis mirror symmetry.
//
// CP 4 is the leading edge and CP 10 is the trailing edge — both
// sit on the x-axis as self-mirror points. Fit quality on the raw
// unit-chord data: Hausdorff ≈ 8.4 × 10⁻⁴ (≈ 0.08% chord).
const INITIAL_CPS: Point2D[] = [
  { x: 97.790, y: 12.595 },
  { x: -4.201, y: 22.703 },
  { x: -102.721, y: 25.352 },
  { x: -176.765, y: 18.714 },
  { x: -211.815, y: 0 },
  { x: -176.765, y: -18.714 },
  { x: -102.721, y: -25.352 },
  { x: -4.201, y: -22.703 },
  { x: 97.790, y: -12.595 },
  { x: 171.062, y: -5.167 },
  { x: 212.767, y: 0 },
  { x: 171.062, y: 5.167 },
]

// Single mirror map across the x-axis (same x, opposite y). Computed
// once from the symmetric initial CPs; remains valid as a permutation
// of indices for as long as the optimizer keeps the symmetry exact.
// When `symmetric` is false the optimizer is called without symmetry
// maps and the user can break the mirror freely.
const MIRROR_MAP_X = buildMirrorMap(INITIAL_CPS, 'x')

const ANCHOR_WEIGHT = 0.05

const CURVE_SAMPLES = 100

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

export default function AirfoilDemo({
  width = 580,
  height = 580,
  symmetric = true,
}: Props) {
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

  // Keep a live mirror of `symmetric` in a ref so the drag callback
  // sees the current value without having to be recreated whenever the
  // toggle changes. (The optimizer call needs the latest value at the
  // moment of each RAF tick.)
  const symmetricRef = useRef(symmetric)
  useEffect(() => {
    symmetricRef.current = symmetric
  }, [symmetric])

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

  // ===== Render-time derived data =====
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
      const circles = cpCircleRefs.current
      for (let i = 0; i < cps.length; i++) {
        const el = circles[i]
        if (!el) continue
        el.setAttribute('cx', cxToPx(cps[i].x).toFixed(1))
        el.setAttribute('cy', cyToPx(cps[i].y).toFixed(1))
      }

      const curveD = buildCurvePath(cps, cxToPx, cyToPx)
      if (curvePathRef.current) {
        curvePathRef.current.setAttribute('d', curveD)
      }
      if (curveHitPathRef.current) {
        curveHitPathRef.current.setAttribute('d', curveD)
      }

      if (polygonPathRef.current) {
        polygonPathRef.current.setAttribute(
          'd',
          buildPolygonPath(cps, cxToPx, cyToPx),
        )
      }

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
          // extrema. The x-axis mirror is enforced (variable reduction)
          // only when the toggle is on — read from the live ref so this
          // RAF tick sees the current value even if toggled mid-drag.
          // Inflections are FREE (no preserveInflections); shown in teal.
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
              ...(symmetricRef.current
                ? { symmetryMaps: { mapX: MIRROR_MAP_X, mapY: null } }
                : {}),
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
      {/* Horizontal symmetry axis — only shown when the mirror is
          enforced. Toggling the symmetry off removes this visual cue
          as well as the constraint. */}
      {symmetric && (
        <line
          x1={cxToPx(-WORLD_HALF)}
          y1={cyToPx(0)}
          x2={cxToPx(WORLD_HALF)}
          y2={cyToPx(0)}
          stroke={COLORS.symmetryAxis}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      )}

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

      {/* Extremum markers — amber */}
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

      {/* Inflection markers — teal */}
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
