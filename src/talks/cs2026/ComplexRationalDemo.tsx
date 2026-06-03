import { useState, useCallback, useRef, useMemo } from 'react'
import type { Point2D, ComplexPoint, ComplexRationalCurve, MobiusTransform } from '../../core'
import {
  evaluate,
  complexCoeffs,
  complexSpiralRatio,
  closedComplexCurvatureExtremaParameters,
  computeComplexFarinPoints,
  computeComplexControlPolygonPath,
  updateWeightsFromComplexFarin,
  moveComplexControlPointKeepingFarinFixed,
  applyMobiusToComplexRational,
  slideComplexRational,
  type Complex,
  type ComplexFarinPoint,
} from '../../core'

/**
 * Self-contained viewer for the §3 "Complex rational + Möbius" slide, wired to
 * core/. A closed periodic degree-4 complex-rational B-spline teardrop (initial
 * weights all = 1). A live 3-DOF Möbius transform (rotation θ, inversion x/y)
 * is layered over the baked control points; "Apply" bakes it in, "Reset"
 * returns to the initial curve. Dragging a control point in Bound mode runs the
 * core complex-rational optimizer (fixed weights), preserving the 4 curvature
 * extrema; in Free mode the drag is a direct move (Farin points held fixed) and
 * the extrema count is free to change.
 *
 * Same direct-ref drag pattern and click-to-deselect UI as the other slides.
 */

interface DemoParts {
  panel: React.ReactNode
  canvas: React.ReactNode
}

interface Props {
  width?: number
  height?: number
  children?: (parts: DemoParts) => React.ReactNode
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
  farin: 'rgba(100, 116, 139, 0.5)',
  farinStroke: '#475569',
  panelBg: 'rgba(255, 255, 255, 0.92)',
  panelBorder: '#cbd5e1',
  panelLabel: '#475569',
  applyBtn: '#2563eb',
  resetBtn: '#64748b',
}

const DEGREE = 4
const NUM_CPS = 6
const KNOTS = Array.from({ length: NUM_CPS }, (_, i) => i / NUM_CPS)

// 6-CP teardrop, x-axis symmetric. A degree-4 closed B-spline is C³, so the
// curvature-derivative numerator g is continuous: an honest clean 4 curvature
// extrema (all smooth, none at the spline joins), and Möbius preserves them.
const INITIAL_REAL_CPS: Point2D[] = [
  { x: -100, y: 28 },
  { x: -185, y: 0 },
  { x: -100, y: -28 },
  { x: 70, y: -20 },
  { x: 190, y: 0 },
  { x: 70, y: 20 },
]

const INITIAL_CPS: ComplexPoint[] = INITIAL_REAL_CPS.map((p) => ({
  re: p.x,
  im: p.y,
  w_re: 1,
  w_im: 0,
}))

const ANCHOR_WEIGHT = 0.05
const MAX_EXTREMA = 8
const CURVE_SAMPLES = 240

// =====================================================================
// Möbius from slider state. Parameterization: rotation around origin via
// diagonal Möbius diag(r), r = e^{iθ/2}; inversive component via lower-
// triangular [[1,0],[c,1]] with c = (ix + i·iy)/WORLD_HALF. Composed:
//   [[r,0],[c/r, 1/r]].
// =====================================================================

const WORLD_HALF = 280
const INVERSION_SCALE = 1 / WORLD_HALF

function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function mobiusFromSliders(theta: number, ix: number, iy: number): MobiusTransform {
  const half = theta / 2
  const r: Complex = { re: Math.cos(half), im: Math.sin(half) }
  const rInv: Complex = { re: Math.cos(half), im: -Math.sin(half) }
  const c: Complex = { re: ix * INVERSION_SCALE, im: iy * INVERSION_SCALE }
  return { a: r, b: { re: 0, im: 0 }, c: cmul(c, rInv), d: rInv }
}

function isIdentityMobius(m: MobiusTransform): boolean {
  return (
    Math.abs(m.a.re - 1) < 1e-12 &&
    Math.abs(m.a.im) < 1e-12 &&
    Math.abs(m.b.re) < 1e-12 &&
    Math.abs(m.b.im) < 1e-12 &&
    Math.abs(m.c.re) < 1e-12 &&
    Math.abs(m.c.im) < 1e-12 &&
    Math.abs(m.d.re - 1) < 1e-12 &&
    Math.abs(m.d.im) < 1e-12
  )
}

// =====================================================================
// Curve eval + extrema (talk-world coords) via core/.
// =====================================================================

function evalCR(
  cps: ComplexPoint[],
  wrapWeight: { re: number; im: number } | undefined,
  t: number,
): Point2D {
  const w0: Complex = { re: cps[0].w_re, im: cps[0].w_im }
  const spiral =
    wrapWeight && (Math.abs(wrapWeight.re - w0.re) > 1e-12 || Math.abs(wrapWeight.im - w0.im) > 1e-12)
      ? complexSpiralRatio(wrapWeight, w0)
      : undefined
  return evaluate(complexCoeffs, cps, DEGREE, KNOTS, t, true, spiral)
}

function buildCurvePath(
  cps: ComplexPoint[],
  wrapWeight: { re: number; im: number } | undefined,
  cxToPx: (x: number) => number,
  cyToPx: (y: number) => number,
): string {
  const parts: string[] = []
  for (let k = 0; k < CURVE_SAMPLES; k++) {
    const p = evalCR(cps, wrapWeight, k / CURVE_SAMPLES)
    parts.push(`${k === 0 ? 'M' : 'L'}${cxToPx(p.x).toFixed(1)},${cyToPx(p.y).toFixed(1)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function computeFarinPointsFor(
  cps: ComplexPoint[],
  farinPositions?: Point2D[],
  wrapWeight?: { re: number; im: number },
): ComplexFarinPoint[] {
  const curve: ComplexRationalCurve = {
    degree: DEGREE,
    knots: KNOTS,
    controlPoints: cps,
    closed: true,
    farinPositions,
    wrapWeight,
  }
  return computeComplexFarinPoints(curve)
}

function buildArcPolygonPath(
  cps: ComplexPoint[],
  farins: ComplexFarinPoint[],
  cxToPx: (x: number) => number,
  cyToPx: (y: number) => number,
): string {
  const cpsPx: Point2D[] = cps.map((p) => ({ x: cxToPx(p.re), y: cyToPx(p.im) }))
  const farinsPx: ComplexFarinPoint[] = farins.map((f) => ({
    ...f,
    position: { x: cxToPx(f.position.x), y: cyToPx(f.position.y) },
  }))
  return computeComplexControlPolygonPath(cpsPx, farinsPx, true)
}

function computeExtrema(
  cps: ComplexPoint[],
  wrapWeight: { re: number; im: number } | undefined,
): Point2D[] {
  try {
    const ts = closedComplexCurvatureExtremaParameters(
      cps.map((p) => p.re),
      cps.map((p) => p.im),
      cps.map((p) => p.w_re),
      cps.map((p) => p.w_im),
      KNOTS,
      DEGREE,
    )
    return ts.map((t) => evalCR(cps, wrapWeight, t))
  } catch {
    return []
  }
}

export default function ComplexRationalDemo({ width = 580, height = 580, children }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  const [cpsState, setCpsState] = useState<ComplexPoint[]>(INITIAL_CPS)
  const [farinPositionsState, setFarinPositionsState] = useState<Point2D[] | undefined>(undefined)
  const [wrapWeightState, setWrapWeightState] = useState<{ re: number; im: number } | undefined>(undefined)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragKind, setDragKind] = useState<'cp' | 'farin' | null>(null)
  const [selected, setSelected] = useState(true)
  const [constrainExtrema, setConstrainExtrema] = useState(true)

  const [theta, setTheta] = useState(0)
  const [invX, setInvX] = useState(0)
  const [invY, setInvY] = useState(0)
  const liveMobius = useMemo(() => mobiusFromSliders(theta, invX, invY), [theta, invX, invY])
  const mobiusIsIdentity = isIdentityMobius(liveMobius)

  const displayedCps = useMemo(
    () => (mobiusIsIdentity ? cpsState : applyMobiusToComplexRational(liveMobius, cpsState)),
    [cpsState, liveMobius, mobiusIsIdentity],
  )
  // Under a non-identity Möbius the stored Farin positions no longer apply
  // (the curve moved in z-space); let them re-derive from the transformed weights.
  const displayedFarinPositions = mobiusIsIdentity ? farinPositionsState : undefined
  const displayedWrapWeight = mobiusIsIdentity ? wrapWeightState : undefined

  const cpsLiveRef = useRef<ComplexPoint[]>(INITIAL_CPS)
  const liveFarinPositionsRef = useRef<Point2D[] | undefined>(undefined)
  const liveWrapWeightRef = useRef<{ re: number; im: number } | undefined>(undefined)
  const dragStartCpsRef = useRef<ComplexPoint[] | null>(null)
  const pendingTargetRef = useRef<{ x: number; y: number } | null>(null)
  const pendingRafRef = useRef<number | null>(null)
  const justDraggedRef = useRef(false)

  const cpCircleRefs = useRef<(SVGCircleElement | null)[]>([])
  const curvePathRef = useRef<SVGPathElement>(null)
  const curveHitPathRef = useRef<SVGPathElement>(null)
  const polygonPathRef = useRef<SVGPathElement>(null)
  const extremaRefs = useRef<(SVGGElement | null)[]>([])
  const farinRefs = useRef<(SVGCircleElement | null)[]>([])

  // ===== Layout =====
  const margin = 24
  const innerSize = Math.min(width, height) - 2 * margin

  const cxToPx = useCallback(
    (x: number) => margin + ((x + WORLD_HALF) / (2 * WORLD_HALF)) * innerSize,
    [innerSize],
  )
  const cyToPx = useCallback(
    (y: number) => margin + innerSize - ((y + WORLD_HALF) / (2 * WORLD_HALF)) * innerSize,
    [innerSize],
  )
  const pxToCx = useCallback(
    (px: number) => -WORLD_HALF + ((px - margin) / innerSize) * (2 * WORLD_HALF),
    [innerSize],
  )
  const pxToCy = useCallback(
    (py: number) => -WORLD_HALF + ((margin + innerSize - py) / innerSize) * (2 * WORLD_HALF),
    [innerSize],
  )

  // ===== Render-time derived data =====
  const curvePathD = useMemo(
    () => buildCurvePath(displayedCps, displayedWrapWeight, cxToPx, cyToPx),
    [displayedCps, displayedWrapWeight, cxToPx, cyToPx],
  )
  const farinPoints = useMemo(
    () => computeFarinPointsFor(displayedCps, displayedFarinPositions, displayedWrapWeight),
    [displayedCps, displayedFarinPositions, displayedWrapWeight],
  )
  const polygonPathD = useMemo(
    () => buildArcPolygonPath(displayedCps, farinPoints, cxToPx, cyToPx),
    [displayedCps, farinPoints, cxToPx, cyToPx],
  )
  const extremaPositions = useMemo(
    () => computeExtrema(displayedCps, displayedWrapWeight),
    [displayedCps, displayedWrapWeight],
  )

  // ===== Imperative drag-time DOM updater =====
  const applyCpsToDom = useCallback(
    (cps: ComplexPoint[], farinPositions?: Point2D[], wrapWeight?: { re: number; im: number }) => {
      const circles = cpCircleRefs.current
      for (let i = 0; i < cps.length; i++) {
        const el = circles[i]
        if (!el) continue
        el.setAttribute('cx', cxToPx(cps[i].re).toFixed(1))
        el.setAttribute('cy', cyToPx(cps[i].im).toFixed(1))
      }

      const curveD = buildCurvePath(cps, wrapWeight, cxToPx, cyToPx)
      if (curvePathRef.current) curvePathRef.current.setAttribute('d', curveD)
      if (curveHitPathRef.current) curveHitPathRef.current.setAttribute('d', curveD)

      const farins = computeFarinPointsFor(cps, farinPositions, wrapWeight)
      if (polygonPathRef.current) {
        polygonPathRef.current.setAttribute('d', buildArcPolygonPath(cps, farins, cxToPx, cyToPx))
      }
      const fSlots = farinRefs.current
      for (let i = 0; i < farins.length; i++) {
        const el = fSlots[i]
        if (!el) continue
        el.setAttribute('cx', cxToPx(farins[i].position.x).toFixed(1))
        el.setAttribute('cy', cyToPx(farins[i].position.y).toFixed(1))
      }

      const exs = computeExtrema(cps, wrapWeight)
      const slots = extremaRefs.current
      for (let i = 0; i < MAX_EXTREMA; i++) {
        const g = slots[i]
        if (!g) continue
        if (i < exs.length) {
          g.setAttribute('transform', `translate(${cxToPx(exs[i].x).toFixed(1)},${cyToPx(exs[i].y).toFixed(1)})`)
          g.removeAttribute('display')
        } else {
          g.setAttribute('display', 'none')
        }
      }
    },
    [cxToPx, cyToPx],
  )

  // ===== Drag handlers =====
  const beginDrag = useCallback(
    (i: number, kind: 'cp' | 'farin', e: React.PointerEvent<SVGCircleElement>) => {
      e.preventDefault()
      e.stopPropagation()
      // Auto-Apply any live Möbius into the baked CPs before the drag begins, so
      // the displayed and baked CPs coincide and the drag operates on coherent
      // state. (The stored Farin/wrap are re-derived from the baked weights.)
      let startCps: ComplexPoint[]
      let startWrap: { re: number; im: number } | undefined
      if (!isIdentityMobius(liveMobius)) {
        startCps = applyMobiusToComplexRational(liveMobius, cpsState)
        startWrap = undefined
        setCpsState(startCps)
        setWrapWeightState(undefined)
        setFarinPositionsState(undefined)
        setTheta(0)
        setInvX(0)
        setInvY(0)
      } else {
        startCps = cpsState
        startWrap = wrapWeightState
      }
      cpsLiveRef.current = startCps
      const startFarins = computeFarinPointsFor(
        startCps,
        mobiusIsIdentity ? farinPositionsState : undefined,
        startWrap,
      )
      liveFarinPositionsRef.current = startFarins.map((f) => ({ ...f.position }))
      liveWrapWeightRef.current = startWrap
      dragStartCpsRef.current = startCps.map((p) => ({ ...p }))
      setDragIndex(i)
      setDragKind(kind)
      if (svgRef.current) svgRef.current.setPointerCapture(e.pointerId)
    },
    [cpsState, liveMobius, mobiusIsIdentity, farinPositionsState, wrapWeightState],
  )

  const onCPPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGCircleElement>) => beginDrag(i, 'cp', e),
    [beginDrag],
  )
  const onFarinPointerDown = useCallback(
    (i: number) => (e: React.PointerEvent<SVGCircleElement>) => beginDrag(i, 'farin', e),
    [beginDrag],
  )

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const scaleX = width / rect.width
      const scaleY = height / rect.height
      pendingTargetRef.current = {
        x: pxToCx((e.clientX - rect.left) * scaleX),
        y: pxToCy((e.clientY - rect.top) * scaleY),
      }
      if (pendingRafRef.current !== null) return

      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null
        const target = pendingTargetRef.current
        if (target === null || dragIndex === null) return
        const { x: targetX, y: targetY } = target

        const live = cpsLiveRef.current
        const curve: ComplexRationalCurve = {
          degree: DEGREE,
          knots: KNOTS,
          controlPoints: live.map((p) => ({ ...p })),
          closed: true,
          farinPositions: liveFarinPositionsRef.current,
          wrapWeight: liveWrapWeightRef.current,
        }

        try {
          if (constrainExtrema && dragKind === 'cp') {
            // Bound mode CP drag — core fixed-weight closed optimizer.
            const anchor = dragStartCpsRef.current
            const { points } = slideComplexRational(live, KNOTS, DEGREE, dragIndex, targetX, targetY, {
              maxIterations: 24,
              dragWeight: 25,
              ...(anchor
                ? {
                    anchorWeight: ANCHOR_WEIGHT,
                    anchorX: anchor.map((p) => p.re),
                    anchorY: anchor.map((p) => p.im),
                  }
                : {}),
            })
            cpsLiveRef.current = points
            // Weights (hence Farin geometry) unchanged; keep cached farins/wrap.
            applyCpsToDom(points, liveFarinPositionsRef.current, liveWrapWeightRef.current)
          } else if (dragKind === 'farin') {
            // Free mode Farin drag — direct weight update from the new position.
            const updated = updateWeightsFromComplexFarin(curve, dragIndex, { x: targetX, y: targetY })
            cpsLiveRef.current = updated.newPoints
            if (updated.newFarinPositions) liveFarinPositionsRef.current = updated.newFarinPositions
            if (updated.newWrapWeight) liveWrapWeightRef.current = updated.newWrapWeight
            applyCpsToDom(updated.newPoints, liveFarinPositionsRef.current, liveWrapWeightRef.current)
          } else {
            // Free mode CP drag — direct move keeping Farin points fixed.
            const moved = moveComplexControlPointKeepingFarinFixed(curve, dragIndex, { x: targetX, y: targetY })
            cpsLiveRef.current = moved.points
            liveWrapWeightRef.current = moved.wrapWeight
            applyCpsToDom(moved.points, liveFarinPositionsRef.current, moved.wrapWeight)
          }
        } catch {
          // Drop the step if the optimizer fails.
        }
      })
    },
    [dragIndex, dragKind, width, height, pxToCx, pxToCy, applyCpsToDom, constrainExtrema],
  )

  const onSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndex === null) return
      justDraggedRef.current = true
      setCpsState(cpsLiveRef.current)
      setFarinPositionsState(liveFarinPositionsRef.current)
      setWrapWeightState(liveWrapWeightRef.current)
      setDragIndex(null)
      setDragKind(null)
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

  // ===== Apply / Reset =====
  const onApply = useCallback(() => {
    if (isIdentityMobius(liveMobius)) return
    const baked = applyMobiusToComplexRational(liveMobius, cpsState)
    setCpsState(baked)
    setFarinPositionsState(undefined)
    setWrapWeightState(undefined)
    cpsLiveRef.current = baked
    liveFarinPositionsRef.current = undefined
    liveWrapWeightRef.current = undefined
    setTheta(0)
    setInvX(0)
    setInvY(0)
  }, [cpsState, liveMobius])

  const onReset = useCallback(() => {
    setCpsState(INITIAL_CPS)
    setFarinPositionsState(undefined)
    setWrapWeightState(undefined)
    cpsLiveRef.current = INITIAL_CPS
    liveFarinPositionsRef.current = undefined
    liveWrapWeightRef.current = undefined
    setTheta(0)
    setInvX(0)
    setInvY(0)
  }, [])

  const extremumSlots = Array.from({ length: MAX_EXTREMA }, (_, i) => i)

  const panel = (
    <MobiusPanel
      theta={theta}
      invX={invX}
      invY={invY}
      onTheta={setTheta}
      onInvX={setInvX}
      onInvY={setInvY}
      onApply={onApply}
      onReset={onReset}
      applyEnabled={!isIdentityMobius(liveMobius)}
      constrainExtrema={constrainExtrema}
      onToggleConstrain={() => setConstrainExtrema((v) => !v)}
      extremaCount={extremaPositions.length}
    />
  )

  const canvas = (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: '100%',
        height: 'auto',
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

      <path
        ref={curvePathRef}
        d={curvePathD}
        fill="none"
        stroke={COLORS.curve}
        strokeWidth={2.5}
        pointerEvents="none"
      />

      <path
        ref={curveHitPathRef}
        d={curvePathD}
        fill="none"
        stroke="transparent"
        strokeWidth={15}
        style={{ cursor: 'pointer' }}
        onClick={onCurveClick}
      />

      {/* Curvature-extrema markers (smooth — degree-4 is C³, no kinks). */}
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
            display={visible ? undefined : 'none'}
            style={{ pointerEvents: 'none' }}
          >
            <circle r={10} fill="none" stroke={COLORS.extrema} strokeWidth={2.5} />
            <circle r={6} fill={COLORS.extremaFill} />
          </g>
        )
      })}

      {/* Farin points — editable in Free mode only; locked (faded) in Bound mode. */}
      {selected &&
        farinPoints.map((f, i) => {
          const locked = constrainExtrema
          return (
            <circle
              key={`farin-${i}`}
              ref={(el) => {
                farinRefs.current[i] = el
              }}
              cx={cxToPx(f.position.x)}
              cy={cyToPx(f.position.y)}
              r={6}
              fill={dragKind === 'farin' && dragIndex === i ? COLORS.farinStroke : COLORS.farin}
              stroke={COLORS.farinStroke}
              strokeWidth={1.2}
              opacity={locked ? 0.5 : 1}
              style={{ cursor: locked ? 'default' : 'grab' }}
              onPointerDown={locked ? undefined : onFarinPointerDown(i)}
              onClick={(e) => e.stopPropagation()}
            />
          )
        })}

      {selected &&
        displayedCps.map((p, i) => (
          <circle
            key={`cp-${i}`}
            ref={(el) => {
              cpCircleRefs.current[i] = el
            }}
            cx={cxToPx(p.re)}
            cy={cyToPx(p.im)}
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

  if (children) return <>{children({ panel, canvas })}</>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%', height: '100%' }}>
      {panel}
      {canvas}
    </div>
  )
}

interface MobiusPanelProps {
  theta: number
  invX: number
  invY: number
  onTheta: (v: number) => void
  onInvX: (v: number) => void
  onInvY: (v: number) => void
  onApply: () => void
  onReset: () => void
  applyEnabled: boolean
  constrainExtrema: boolean
  onToggleConstrain: () => void
  extremaCount: number
}

function MobiusPanel({
  theta,
  invX,
  invY,
  onTheta,
  onInvX,
  onInvY,
  onApply,
  onReset,
  applyEnabled,
  constrainExtrema,
  onToggleConstrain,
  extremaCount,
}: MobiusPanelProps) {
  return (
    <div
      style={{
        width: '100%',
        background: COLORS.panelBg,
        border: `1px solid ${COLORS.panelBorder}`,
        borderRadius: 6,
        padding: '10px 12px',
        fontSize: '0.85em',
        color: COLORS.panelLabel,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <button
        onClick={onToggleConstrain}
        style={{
          padding: '6px 12px',
          fontSize: '0.95em',
          borderRadius: 4,
          border: '1px solid #3b82f6',
          background: constrainExtrema ? '#2563eb' : '#1e3a5f',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        {constrainExtrema ? `Bound extrema (S = ${extremaCount})` : `Free extrema (S = ${extremaCount})`}
      </button>
      <div style={{ height: 1, background: COLORS.panelBorder, margin: '2px 0' }} />
      <VerticalSlider label="θ" min={-Math.PI} max={Math.PI} step={0.01} value={theta} display={`${((theta * 180) / Math.PI).toFixed(0)}°`} onChange={onTheta} />
      <VerticalSlider label="inv x" min={-1} max={1} step={0.005} value={invX} display={invX.toFixed(2)} onChange={onInvX} />
      <VerticalSlider label="inv y" min={-1} max={1} step={0.005} value={invY} display={invY.toFixed(2)} onChange={onInvY} />
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button
          onClick={onApply}
          disabled={!applyEnabled}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '0.95em',
            borderRadius: 4,
            border: 'none',
            background: applyEnabled ? COLORS.applyBtn : '#cbd5e1',
            color: 'white',
            cursor: applyEnabled ? 'pointer' : 'default',
          }}
        >
          Apply
        </button>
        <button
          onClick={onReset}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '0.95em',
            borderRadius: 4,
            border: `1px solid ${COLORS.resetBtn}`,
            background: 'transparent',
            color: COLORS.resetBtn,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

interface VerticalSliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (v: number) => void
}

function VerticalSlider({ label, min, max, step, value, display, onChange }: VerticalSliderProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '0.9em' }}>
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: '100%' }} />
    </div>
  )
}
