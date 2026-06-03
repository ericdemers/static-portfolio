import { useState, useCallback, useRef, useMemo } from 'react'
import type { Point2D } from '../../core'
import { evaluate, plainCoeffs, closedCurvatureExtremaParameters, slideCurve } from '../../core'
import { twoAxisSequence } from './ovalShapes'
import { buildMirrorMap } from './symmetry'

/**
 * Self-contained viewer for the "Oval" application slide.
 *
 * Closed periodic degree-3 B-spline with 12 CPs, near-circle start
 * (twoAxisSequence[0]), 2-axis symmetry enforced through `symmetryMaps`
 * passed to `optimizeCurve`. The optimizer preserves the four curvature
 * extrema while the symmetric subspace projection keeps both axes of
 * symmetry exact by construction.
 *
 * Performance pattern: during an active drag, CP positions live in a
 * `useRef` and SVG attributes are mutated directly via refs each RAF
 * tick — skipping React reconciliation for the whole subtree. On
 * pointerUp we copy the ref state back into `useState` so the next
 * render matches the DOM. This matches the smoothness of the sketcher
 * canvas (slide 21) without giving up the inline slide-5 visual style.
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
  symmetryAxis: '#cbd5e1',
}

const DEGREE = 3
const NUM_CPS = 12
// Uniform periodic knots — same vector as closedDemoCurve / nearCircleCurve.
const KNOTS = Array.from({ length: NUM_CPS }, (_, i) => i / NUM_CPS)

const INITIAL_CPS: Point2D[] = twoAxisSequence[0].controlPoints.map((p) => ({
  x: p.x,
  y: p.y,
}))

// Symmetry maps — precomputed once from the initial CPs. They depend only
// on indices (which CP mirrors which), so they remain valid as the CPs
// move; the optimizer projects each drag into the symmetric subspace.
const MIRROR_MAP_X = buildMirrorMap(INITIAL_CPS, 'x')
const MIRROR_MAP_Y = buildMirrorMap(INITIAL_CPS, 'y')

const ANCHOR_WEIGHT = 0.05

// Number of samples for the curve path (closed loop). Matches the
// sketcher's main canvas sample count, which is the practical sweet
// spot between smooth visuals and per-frame SVG diff cost.
const CURVE_SAMPLES = 100

// Pre-allocated slot count for extremum markers. The oval invariant is
// 4 extrema; we allocate a small buffer in case the optimizer reports a
// transient configuration with more during a wild drag.
const MAX_EXTREMA = 8

// =====================================================================
// Pure path builders — used both by initial render (via useMemo on
// cpsState) and by the drag handler (called imperatively with cpsRef
// data). Keeping them pure & module-scope makes the two paths share
// exactly one source of truth.
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

export default function OvalDemo({ width = 580, height = 580 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Canonical state — driven by React, used to (re)render when the
  // component mounts or after a drag completes.
  const [cpsState, setCpsState] = useState<Point2D[]>(INITIAL_CPS)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // Curve selection — same pattern as the sketcher: click the canvas
  // background to deselect (hides control polygon + CPs so the audience
  // sees just the curve and its extrema). Click the curve to re-select
  // and resume editing. Defaults to selected so the slide opens with
  // the editing UI visible.
  const [selected, setSelected] = useState(true)

  // Live state — mutated each RAF tick during an active drag. We
  // bypass React entirely for the drag itself and copy this back into
  // `cpsState` on pointerUp.
  const cpsLiveRef = useRef<Point2D[]>(INITIAL_CPS)
  const dragStartCpsRef = useRef<Point2D[] | null>(null)
  const pendingTargetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRafRef = useRef<number | null>(null)
  // True for the one synthetic click that follows a drag's pointerup, so
  // onSvgClick can skip deselecting on it.
  const justDraggedRef = useRef(false)

  // Element refs for direct DOM mutation during drag.
  const cpCircleRefs = useRef<(SVGCircleElement | null)[]>([])
  const curvePathRef = useRef<SVGPathElement>(null)
  // A transparent wider-stroke twin of the curve, used as the click hit
  // area so the user can click anywhere within ~15 px of the curve to
  // re-select after deselecting. Updated alongside the visible curve.
  const curveHitPathRef = useRef<SVGPathElement>(null)
  const polygonPathRef = useRef<SVGPathElement>(null)
  const extremaRefs = useRef<(SVGGElement | null)[]>([])

  // ===== Layout =====
  const margin = 24
  const innerSize = Math.min(width, height) - 2 * margin
  const WORLD_HALF = 260

  // Coord transforms — captured by the drag handler via closure. They
  // depend only on the (stable) layout constants, so the same callback
  // instances are valid for the lifetime of the component.
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

  // ===== Drag handlers =====

  // Imperatively apply a CPs update to the DOM during an active drag.
  // No React state is touched — only refs/setAttribute calls. This is
  // the hot path that makes the drag feel like the sketcher canvas.
  const applyCpsToDom = useCallback(
    (cps: Point2D[]) => {
      // 1. CP circles
      const circles = cpCircleRefs.current
      for (let i = 0; i < cps.length; i++) {
        const el = circles[i]
        if (!el) continue
        el.setAttribute('cx', cxToPx(cps[i].x).toFixed(1))
        el.setAttribute('cy', cyToPx(cps[i].y).toFixed(1))
      }

      // 2. Curve path (visible) + its transparent click hit-area twin
      const curveD = buildCurvePath(cps, cxToPx, cyToPx)
      if (curvePathRef.current) {
        curvePathRef.current.setAttribute('d', curveD)
      }
      if (curveHitPathRef.current) {
        curveHitPathRef.current.setAttribute('d', curveD)
      }

      // 3. Control polygon
      if (polygonPathRef.current) {
        polygonPathRef.current.setAttribute(
          'd',
          buildPolygonPath(cps, cxToPx, cyToPx),
        )
      }

      // 4. Extrema markers — translate each <g> wrapper to its new
      // position. Hide any pre-allocated slot we don't have an
      // extremum for in this frame.
      const exs = computeExtrema(cps)
      const slots = extremaRefs.current
      for (let i = 0; i < MAX_EXTREMA; i++) {
        const g = slots[i]
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
    },
    [cxToPx, cyToPx],
  )

  const onCPPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragIndex(i)
      // Snapshot live state at drag start — both for the optimizer's
      // anchor weight and so our ref-based DOM mutations have a known
      // starting point that matches what React last rendered.
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
          // Closed-curve sliding via core/, all hard constraints inside the
          // solve: 4 curvature extrema (g signs) AND 0 inflections (f signs),
          // with the 2 axes of symmetry enforced by variable reduction
          // (symmetryMaps) and drift resistance toward the drag-start polygon.
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
              maxIterations: 20,
              preserveInflections: true,
              symmetryMaps: { mapX: MIRROR_MAP_X, mapY: MIRROR_MAP_Y },
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
      // A pointerup that ends a drag is followed by a synthetic `click`
      // on the SVG background (the pointer lifted over the background,
      // not the CP). Flag it so onSvgClick ignores that one click and
      // does NOT deselect — otherwise every CP drag hides the polygon.
      justDraggedRef.current = true
      // Sync the live ref state back into React state. The next render
      // will draw from this state; since the DOM is already at this
      // configuration (last applyCpsToDom call), there's no flicker.
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

  // Clicking the canvas background hides the editing UI (polygon + CPs).
  // Anything that should *not* deselect (the curve hit-path, the CPs,
  // the polygon) stops propagation in its own onClick.
  const onSvgClick = useCallback(() => {
    // Ignore the synthetic click fired right after a drag ends (see
    // onSvgPointerUp) — only a genuine background click should deselect.
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

  // Pre-allocate the extremum-slot indices so the JSX is stable across
  // renders — only the `transform` attribute changes during drag.
  const extremumSlots = Array.from({ length: MAX_EXTREMA }, (_, i) => i)

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
      {/* Symmetry axes — horizontal (y = 0) and vertical (x = 0). Drawn
          first so they sit visually behind the curve and CPs. Thin
          dashed slate lines read as "abstract construction lines"
          rather than part of the geometry. */}
      <line
        x1={cxToPx(-WORLD_HALF)}
        y1={cyToPx(0)}
        x2={cxToPx(WORLD_HALF)}
        y2={cyToPx(0)}
        stroke={COLORS.symmetryAxis}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <line
        x1={cxToPx(0)}
        y1={cyToPx(-WORLD_HALF)}
        x2={cxToPx(0)}
        y2={cyToPx(WORLD_HALF)}
        stroke={COLORS.symmetryAxis}
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* Control polygon (closed dashed loop). Only rendered when the
          curve is selected — same sketcher-style click-to-deselect
          pattern. `pointer-events="none"` so the dashed line itself
          doesn't catch clicks (which would create dead zones for
          deselect). */}
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

      {/* Transparent wider hit-area twin — catches clicks to re-select
          when the editing UI is hidden. Drawn after (above) the visible
          curve so it wins hit-testing. */}
      <path
        ref={curveHitPathRef}
        d={curvePathD}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
        onClick={onCurveClick}
      />

      {/* Extremum markers — fixed slot count. We translate each <g>
          wrapper rather than updating cx/cy on the inner circles, so
          one attribute write per slot moves both the ring and the
          fill. Slots beyond the current extremum count are hidden via
          the visibility attribute (also imperatively during drag). */}
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

      {/* Control points — only rendered when the curve is selected.
          Always blue, with the dragged CP in a slightly darker shade.
          onClick stopPropagation prevents a quick tap on a CP from
          bubbling to the SVG's deselect handler. */}
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
