// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { Curve } from '../types/curve'
import { computeRegionPreview } from '../utils/regionSmooth'
import { basisFunctions, findKnotSpan, isClampedEndKnot, isPeriodicRepresentation, periodicBasisFunctions, findPeriodicKnotSpan } from '../utils/bspline'
import { curvatureComb } from '../utils/curvature'
import { getBasisColor } from '../utils/colors'
import { computeOpenCurveConstraintState, computeClosedCurveConstraintState, computeRationalCurveConstraintState, computeClosedRationalCurveConstraintState, computeComplexCurvatureConstraintState, computeOpenComplexCurvatureConstraintState, computeCurvatureExtremaParameters } from '../optimizer'

export default function BottomPanel() {
  const { panelView, curves, selectedCurveId } = useSceneStore()

  const selectedCurve = curves.find((c) => c.id === selectedCurveId)

  if (!panelView || !selectedCurve) return null

  return (
    <div className="absolute bottom-16 left-3 right-3 h-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-30">
      {panelView === 'basis' && <BasisFunctionsPanel curve={selectedCurve} />}
      {panelView === 'curvature' && <CurvaturePanel curve={selectedCurve} />}
    </div>
  )
}

interface CurvePanelProps {
  curve: Curve
}

function BasisFunctionsPanel({ curve }: CurvePanelProps) {
  const { t } = useTranslation()
  const { degree, knots } = curve
  const {
    selectedKnotIndex,
    selectKnot,
    moveKnotAtCurve,
    insertKnotAtCurve,
    removeKnotFromCurve,
    saveToHistory,
  } = useSceneStore()

  const [isDragging, setIsDragging] = useState(false)
  const [dragStarted, setDragStarted] = useState(false)
  const [hoveredKnot, setHoveredKnot] = useState<number | null>(null)
  const [tooltipValue, setTooltipValue] = useState<number | null>(null)

  // Check if this is a periodic curve
  const isPeriodic = curve.closed && isPeriodicRepresentation(curve)

  // Sample basis functions
  const basisData = useMemo(() => {
    if (isPeriodic) {
      // Periodic curve: sample in [0, 1), t=1 is same as t=0
      const numSamples = 200
      const numBasis = curve.controlPoints.length // For periodic curves, numBasis = numControlPoints

      const data: { t: number; values: number[] }[] = []

      for (let i = 0; i <= numSamples; i++) {
        // Sample up to just before 1 to avoid boundary issues
        // t=1 would be identical to t=0 anyway
        const t = i < numSamples ? i / numSamples : 1 - 1e-6
        const span = findPeriodicKnotSpan(degree, knots, t)
        const N = periodicBasisFunctions(span, t, degree, knots)

        const values = new Array(numBasis).fill(0)
        let sum = 0
        for (let j = 0; j <= degree; j++) {
          // Use modular index for periodic curves
          const idx = ((span - degree + j) % numBasis + numBasis) % numBasis
          const val = N[j]
          const cleanVal = isNaN(val) || !isFinite(val) ? 0 : Math.max(0, val)
          values[idx] += cleanVal
          sum += cleanVal
        }

        // Normalize if needed (basis functions should sum to 1)
        if (sum > 0 && Math.abs(sum - 1) > 1e-6) {
          for (let k = 0; k < numBasis; k++) {
            values[k] /= sum
          }
        }

        data.push({ t, values })
      }

      return { data, numBasis, tMin: 0, tMax: 1 }
    }

    // Standard basis function sampling for open curves
    const tMin = knots[degree]
    const tMax = knots[knots.length - degree - 1]
    const numSamples = 200
    const numBasis = knots.length - degree - 1

    const data: { t: number; values: number[] }[] = []

    for (let i = 0; i <= numSamples; i++) {
      const t = tMin + (i / numSamples) * (tMax - tMin)
      const span = findKnotSpan(degree, knots, t)
      const N = basisFunctions(span, t, degree, knots)

      const values = new Array(numBasis).fill(0)
      for (let j = 0; j <= degree; j++) {
        const idx = span - degree + j
        if (idx >= 0 && idx < numBasis) {
          values[idx] = N[j]
        }
      }

      data.push({ t, values })
    }

    return { data, numBasis, tMin, tMax }
  }, [degree, knots, isPeriodic, curve.controlPoints.length])

  const width = 800
  const height = 160
  const padding = { left: 40, right: 20, top: 10, bottom: 50 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom - 20 // Reserve space for knot bar
  const knotBarY = padding.top + plotHeight + 15

  // Convert x coordinate to parameter value
  const xToParam = useCallback(
    (x: number) => {
      const normalized = (x - padding.left) / plotWidth
      return basisData.tMin + normalized * (basisData.tMax - basisData.tMin)
    },
    [basisData.tMin, basisData.tMax, plotWidth]
  )

  // Convert parameter value to x coordinate
  const paramToX = useCallback(
    (t: number) => {
      return padding.left + ((t - basisData.tMin) / (basisData.tMax - basisData.tMin)) * plotWidth
    },
    [basisData.tMin, basisData.tMax, plotWidth]
  )

  // Convert screen coordinates to SVG viewBox coordinates
  const screenToSvgX = useCallback(
    (e: React.PointerEvent | React.MouseEvent, svg: SVGSVGElement): number => {
      const point = svg.createSVGPoint()
      point.x = e.clientX
      point.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (ctm) {
        const svgPoint = point.matrixTransform(ctm.inverse())
        return svgPoint.x
      }
      // Fallback if CTM not available
      const rect = svg.getBoundingClientRect()
      return ((e.clientX - rect.left) / rect.width) * width
    },
    [width]
  )

  // Handle knot drag
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, knotIndex: number) => {
      // Check if knot is fixed (clamped end knots for open curves, knots at 0 for periodic curves)
      if (isClampedEndKnot(degree, knots, knotIndex, curve.closed)) return

      e.preventDefault()
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)

      selectKnot(knotIndex)
      setIsDragging(true)
      setDragStarted(false)
      setTooltipValue(knots[knotIndex])
    },
    [degree, knots, selectKnot, curve.closed]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || selectedKnotIndex === null) return

      const svg = e.currentTarget as SVGSVGElement
      const svgX = screenToSvgX(e, svg)
      const newParam = xToParam(svgX)

      if (!dragStarted) {
        setDragStarted(true)
      }

      moveKnotAtCurve(curve.id, selectedKnotIndex, newParam)

      // Show the actual clamped knot value, not the raw mouse position
      const updatedCurves = useSceneStore.getState().curves
      const updatedCurve = updatedCurves.find((c) => c.id === curve.id)
      if (updatedCurve && selectedKnotIndex < updatedCurve.knots.length) {
        setTooltipValue(updatedCurve.knots[selectedKnotIndex])
      }
    },
    [isDragging, selectedKnotIndex, curve.id, xToParam, screenToSvgX, moveKnotAtCurve, saveToHistory, dragStarted]
  )

  const handlePointerUp = useCallback(() => {
    if (dragStarted) {
      saveToHistory()
    }
    setIsDragging(false)
    setDragStarted(false)
    setTooltipValue(null)
  }, [dragStarted, saveToHistory])

  // Handle click on knot bar to insert a new knot
  const handleKnotBarClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = e.currentTarget.ownerSVGElement
      if (!svg) return

      const svgX = screenToSvgX(e, svg)
      const newParam = xToParam(svgX)

      // Only insert if within valid range
      if (newParam > basisData.tMin && newParam < basisData.tMax) {
        insertKnotAtCurve(curve.id, newParam)
      }
    },
    [curve.id, xToParam, screenToSvgX, insertKnotAtCurve, basisData.tMin, basisData.tMax]
  )

  // Handle Delete key for selected knot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Cannot delete fixed knots (clamped end knots for open curves, knots at 0 for periodic curves)
        const canDelete = !isClampedEndKnot(degree, knots, selectedKnotIndex ?? -1, curve.closed)
        if (selectedKnotIndex !== null && canDelete) {
          e.preventDefault()
          removeKnotFromCurve(curve.id, selectedKnotIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedKnotIndex, degree, knots, curve.id, removeKnotFromCurve, curve.closed])

  // Separate clamped/fixed knots from interior (movable) knots
  // For periodic curves:
  // - If only 1 knot at 0: it's fixed (cannot move)
  // - If multiple knots at 0: show as movable with multiplicity (can reduce multiplicity by dragging)
  const { clampedKnots, interiorKnots } = useMemo(() => {
    if (isPeriodic) {
      // Count knots at 0
      const knotsAtZeroIndices = knots
        .map((k, i) => ({ k, i }))
        .filter(({ k }) => Math.abs(k) < 1e-10)
        .map(({ i }) => i)
      const knotsAtZeroCount = knotsAtZeroIndices.length

      const fixedSeen = new Map<number, { indices: number[]; value: number }>()
      const interiorSeen = new Map<number, { indices: number[]; value: number }>()

      knots.forEach((k, i) => {
        const rounded = Math.round(k * 1e10) / 1e10
        const isAtZero = Math.abs(k) < 1e-10

        if (isAtZero) {
          if (knotsAtZeroCount === 1) {
            // Only one knot at 0: it's fixed
            if (fixedSeen.has(rounded)) {
              fixedSeen.get(rounded)!.indices.push(i)
            } else {
              fixedSeen.set(rounded, { indices: [i], value: k })
            }
          } else {
            // Multiple knots at 0: show as movable (can drag to reduce multiplicity)
            if (interiorSeen.has(rounded)) {
              interiorSeen.get(rounded)!.indices.push(i)
            } else {
              interiorSeen.set(rounded, { indices: [i], value: k })
            }
          }
        } else {
          // Not at 0: always interior/movable
          if (interiorSeen.has(rounded)) {
            interiorSeen.get(rounded)!.indices.push(i)
          } else {
            interiorSeen.set(rounded, { indices: [i], value: k })
          }
        }
      })

      return {
        clampedKnots: Array.from(fixedSeen.values()),
        interiorKnots: Array.from(interiorSeen.values()),
      }
    }

    // First, group ALL knots by position
    const allByPosition = new Map<number, { indices: number[]; value: number; clampedIndices: number[]; interiorIndices: number[] }>()

    knots.forEach((k, i) => {
      const rounded = Math.round(k * 1e10) / 1e10
      const isClamped = isClampedEndKnot(degree, knots, i, curve.closed)

      if (!allByPosition.has(rounded)) {
        allByPosition.set(rounded, { indices: [], value: k, clampedIndices: [], interiorIndices: [] })
      }
      const group = allByPosition.get(rounded)!
      group.indices.push(i)
      if (isClamped) {
        group.clampedIndices.push(i)
      } else {
        group.interiorIndices.push(i)
      }
    })

    // Now categorize each position:
    // - If position has ONLY clamped knots: show as clamped (fixed)
    // - If position has ANY interior knots: show as interior (movable) with total multiplicity
    const clampedResult: { indices: number[]; value: number }[] = []
    const interiorResult: { indices: number[]; value: number }[] = []

    allByPosition.forEach((group) => {
      if (group.interiorIndices.length > 0) {
        // Has movable knots - show as interior with ALL indices (total multiplicity)
        interiorResult.push({ indices: group.indices, value: group.value })
      } else {
        // Only clamped knots - show as fixed
        clampedResult.push({ indices: group.indices, value: group.value })
      }
    })

    return {
      clampedKnots: clampedResult,
      interiorKnots: interiorResult,
    }
  }, [degree, knots, isPeriodic, curve.closed])

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
        {t('panels.basisFunctions')} ({t('panels.degree')} {degree})
      </div>

      <div className="flex-1 overflow-auto p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Background - click to deselect knot */}
          <rect
            x={padding.left}
            y={padding.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            stroke="#e5e7eb"
            className="dark:stroke-gray-700"
            onClick={() => selectKnot(null)}
            style={{ cursor: 'default' }}
          />

          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((v) => (
            <line
              key={v}
              x1={padding.left}
              y1={padding.top + plotHeight * (1 - v)}
              x2={padding.left + plotWidth}
              y2={padding.top + plotHeight * (1 - v)}
              stroke="#e5e7eb"
              strokeDasharray="2,2"
              className="dark:stroke-gray-700"
            />
          ))}

          {/* Knot vertical lines in plot area - clamped end knots */}
          {clampedKnots.map(({ indices, value }) => {
            const x = paramToX(value)
            if (x >= padding.left && x <= padding.left + plotWidth) {
              return (
                <line
                  key={`clamped-line-${indices[0]}`}
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + plotHeight}
                  stroke="#d1d5db"
                  strokeWidth={1}
                  strokeDasharray="4,2"
                  opacity={0.5}
                />
              )
            }
            return null
          })}

          {/* Knot vertical lines in plot area - interior knots */}
          {interiorKnots.map(({ indices, value }) => {
            const x = paramToX(value)
            if (x >= padding.left && x <= padding.left + plotWidth) {
              return (
                <line
                  key={`interior-line-${indices[0]}`}
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + plotHeight}
                  stroke="#9ca3af"
                  strokeWidth={1}
                  strokeDasharray="4,2"
                  opacity={0.8}
                />
              )
            }
            return null
          })}

          {/* Basis function curves */}
          {Array.from({ length: basisData.numBasis }, (_, basisIndex) => {
            let pathD = ''
            basisData.data.forEach((sample, i) => {
              const x =
                padding.left +
                ((sample.t - basisData.tMin) / (basisData.tMax - basisData.tMin)) * plotWidth
              const y = padding.top + plotHeight * (1 - sample.values[basisIndex])

              if (i === 0) {
                pathD = `M ${x} ${y}`
              } else {
                pathD += ` L ${x} ${y}`
              }
            })

            return (
              <path
                key={basisIndex}
                d={pathD}
                fill="none"
                stroke={getBasisColor(basisIndex)}
                strokeWidth={1.5}
                opacity={0.8}
              />
            )
          })}

          {/* Knot bar background (clickable to insert knots) */}
          <rect
            x={padding.left}
            y={knotBarY - 8}
            width={plotWidth}
            height={16}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onClick={handleKnotBarClick}
          />

          {/* Knot bar line */}
          <line
            x1={padding.left}
            y1={knotBarY}
            x2={padding.left + plotWidth}
            y2={knotBarY}
            stroke="#9ca3af"
            strokeWidth={2}
          />

          {/* Knot markers - clamped/fixed knots (non-interactive) */}
          {clampedKnots.map(({ indices, value }) => {
            const x = paramToX(value)
            if (x < padding.left || x > padding.left + plotWidth) return null

            const multiplicity = indices.length
            // Default clamped multiplicity is degree + 1; use smaller circle for default, larger if more
            const isDefaultMultiplicity = multiplicity <= degree + 1

            return (
              <g key={`clamped-knot-${indices[0]}`}>
                <circle
                  cx={x}
                  cy={knotBarY}
                  r={isDefaultMultiplicity ? 4 : 6}
                  fill="#d1d5db"
                  opacity={0.5}
                  style={{ cursor: 'default' }}
                />
                {/* Multiplicity indicator for fixed knots */}
                {multiplicity > 1 && (
                  <text
                    x={x}
                    y={knotBarY + (isDefaultMultiplicity ? 12 : 4)}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#6b7280"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    {multiplicity}
                  </text>
                )}
              </g>
            )
          })}

          {/* Knot markers - interior knots (interactive) */}
          {interiorKnots.map(({ indices, value }) => {
            const x = paramToX(value)
            if (x < padding.left || x > padding.left + plotWidth) return null

            const isSelected = indices.includes(selectedKnotIndex ?? -1)
            const isHovered = indices.includes(hoveredKnot ?? -1)
            const multiplicity = indices.length

            // Find the first movable (non-clamped) index in this group
            // For open curves: skip clamped end knots
            // For closed curves: skip the fixed knot at index 0 when at position 0
            const movableIndex = indices.find(idx => !isClampedEndKnot(degree, knots, idx, curve.closed)) ?? indices[0]

            return (
              <g key={`interior-knot-${indices[0]}`}>
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    cx={x}
                    cy={knotBarY}
                    r={9}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                  />
                )}

                {/* Knot circle */}
                <circle
                  cx={x}
                  cy={knotBarY}
                  r={isHovered ? 7 : 6}
                  fill="#374151"
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => handlePointerDown(e, movableIndex)}
                  onPointerEnter={() => setHoveredKnot(movableIndex)}
                  onPointerLeave={() => setHoveredKnot(null)}
                />

                {/* Multiplicity indicator */}
                {multiplicity > 1 && (
                  <text
                    x={x}
                    y={knotBarY + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill="white"
                    fontWeight="bold"
                    style={{ pointerEvents: 'none' }}
                  >
                    {multiplicity}
                  </text>
                )}

                {/* Tooltip showing parameter value while dragging */}
                {isSelected && isDragging && tooltipValue !== null && (
                  <g>
                    <rect
                      x={x - 25}
                      y={knotBarY + 12}
                      width={50}
                      height={18}
                      rx={3}
                      fill="#1f2937"
                      opacity={0.9}
                    />
                    <text
                      x={x}
                      y={knotBarY + 25}
                      textAnchor="middle"
                      fontSize={11}
                      fill="white"
                    >
                      {tooltipValue.toFixed(3)}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {/* Axis labels */}
          <text
            x={padding.left - 5}
            y={padding.top + 4}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            1
          </text>
          <text
            x={padding.left - 5}
            y={padding.top + plotHeight + 4}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            0
          </text>
          <text
            x={padding.left}
            y={knotBarY + 25}
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            {basisData.tMin.toFixed(1)}
          </text>
          <text
            x={padding.left + plotWidth}
            y={knotBarY + 25}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            {basisData.tMax.toFixed(1)}
          </text>
        </svg>
      </div>
    </div>
  )
}

function CurvaturePanel({ curve }: CurvePanelProps) {
  const { t } = useTranslation()
  const {
    preserveCurvatureExtrema, setPreserveCurvatureExtrema,
    smoothActive, smoothWindow, smoothAmount, smoothEnergy, smoothMode, smoothIterations,
    enterSmooth, cancelSmooth, applySmooth, setSmoothWindow, setSmoothAmount,
    setSmoothMode, setSmoothIterations,
  } = useSceneStore()

  const kSvgRef = useRef<SVGSVGElement>(null)
  const dragIdx = useRef<number | null>(null)
  const grabDT = useRef(0)
  const otherT = useRef(0)

  // Parameter domain — maps the κ x-axis ↔ curve parameter t.
  const tMin = curve.closed ? 0 : curve.knots[curve.degree]
  const tMax = curve.closed ? 1 : curve.knots[curve.knots.length - curve.degree - 1]
  const tRange = tMax - tMin || 1

  // Eligible for the region-smoothing tool? (open B-spline only, for now)
  const smoothEligible = curve.kind === 'bspline' && !curve.closed
  const active = smoothActive && smoothEligible

  // Faired preview while the smoothing tool is active.
  const smooth = useMemo(() => {
    if (!active || curve.kind !== 'bspline') return null
    const cpX = curve.controlPoints.map((p) => p.x)
    const cpY = curve.controlPoints.map((p) => p.y)
    return computeRegionPreview(curve.knots, cpX, cpY, curve.degree, smoothWindow,
      { mode: smoothMode, amountExp: smoothAmount, energy: smoothEnergy, iterations: smoothIterations })
  }, [active, curve, smoothWindow, smoothAmount, smoothEnergy, smoothMode, smoothIterations])

  // Current curvature-extrema count of the bounded preview (the upper bound S).
  const smoothBound = useMemo(() => {
    if (!smooth || smoothMode !== 'laplacian-bounded') return null
    try { return computeCurvatureExtremaParameters(curve.knots, smooth.cpX, smooth.cpY).length } catch { return null }
  }, [smooth, smoothMode, curve.knots])

  // Curve shown in the κ panel: the live preview when smoothing, else the curve.
  const shownCurve = useMemo(() => {
    if (!smooth || curve.kind !== 'bspline') return curve
    return { ...curve, controlPoints: smooth.cpX.map((x, i) => ({ x, y: smooth.cpY[i] })) }
  }, [smooth, curve])

  const curvatureData = useMemo(() => {
    return curvatureComb(shownCurve, 100, 30)
  }, [shownCurve])

  // Compute g control points for the constraint visualization
  const constraintState = useMemo(() => {
    if (!preserveCurvatureExtrema || (curve.kind !== 'bspline' && curve.kind !== 'rational' && curve.kind !== 'complex-rational')) {
      return null
    }
    try {
      if (curve.kind === 'complex-rational') {
        const n = curve.controlPoints.length
        const cpsZre: number[] = []
        const cpsZim: number[] = []
        const cpsWre: number[] = []
        const cpsWim: number[] = []
        for (let i = 0; i < n; i++) {
          const cp = curve.controlPoints[i]
          cpsZre.push(cp.re * cp.w_re - cp.im * cp.w_im)
          cpsZim.push(cp.re * cp.w_im + cp.im * cp.w_re)
          cpsWre.push(cp.w_re)
          cpsWim.push(cp.w_im)
        }
        if (curve.closed) {
          return computeComplexCurvatureConstraintState(
            curve.degree, curve.knots, cpsZre, cpsZim, cpsWre, cpsWim,
            1.0, curve.wrapWeight
          )
        } else {
          return computeOpenComplexCurvatureConstraintState(
            curve.knots, cpsZre, cpsZim, cpsWre, cpsWim
          )
        }
      }
      if (curve.kind === 'rational') {
        const cpsX = curve.controlPoints.map((p) => p.x * p.w)
        const cpsY = curve.controlPoints.map((p) => p.y * p.w)
        const cpsW = curve.controlPoints.map((p) => p.w)
        if (curve.closed) {
          return computeClosedRationalCurveConstraintState(
            curve.knots, cpsX, cpsY, cpsW, curve.degree, 1.0, curve.wrapWeight
          )
        } else {
          return computeRationalCurveConstraintState(
            curve.knots, cpsX, cpsY, cpsW
          )
        }
      }
      if (curve.closed) {
        return computeClosedCurveConstraintState(
          curve.knots,
          curve.controlPoints.map((p) => p.x),
          curve.controlPoints.map((p) => p.y),
          curve.degree
        )
      } else {
        return computeOpenCurveConstraintState(
          curve.knots,
          curve.controlPoints.map((p) => p.x),
          curve.controlPoints.map((p) => p.y)
        )
      }
    } catch (e) {
      console.error('constraintState computation failed:', e)
      return null
    }
  }, [curve, preserveCurvatureExtrema])

  // Current bound S(b): the number of sign changes of g = the curvature-extrema
  // count being held. Shown next to the toggle, mirroring the cs2026 talk slide.
  const extremaBound = useMemo(() => {
    if (!constraintState) return null
    let count = 0, last = 0
    for (const v of constraintState.gCPs) {
      if (v === 0) continue
      const s = v > 0 ? 1 : -1
      if (last !== 0 && s !== last) count++
      last = s
    }
    return count
  }, [constraintState])

  // Find curvature range for scaling
  const curvatures = curvatureData.map((d) => d.curvature)
  const maxCurvature = Math.max(...curvatures.map(Math.abs))
  const minCurvature = Math.min(...curvatures)
  const maxCurvatureVal = Math.max(...curvatures)

  const width = 800
  const height = preserveCurvatureExtrema && constraintState ? 160 : 140
  const padding = { left: 40, right: 20, top: 10, bottom: preserveCurvatureExtrema && constraintState ? 50 : 30 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom - (preserveCurvatureExtrema && constraintState ? 20 : 0)
  const gBarY = padding.top + plotHeight + 15

  // Normalize curvature for display
  const normalizedData = curvatureData.map((d, i) => ({
    x: padding.left + (i / (curvatureData.length - 1)) * plotWidth,
    y:
      padding.top +
      plotHeight / 2 -
      (d.curvature / (maxCurvature || 1)) * (plotHeight / 2) * 0.9,
    curvature: d.curvature,
  }))

  // Build path
  let pathD = ''
  normalizedData.forEach((d, i) => {
    if (i === 0) {
      pathD = `M ${d.x} ${d.y}`
    } else {
      pathD += ` L ${d.x} ${d.y}`
    }
  })

  // Handle checkbox toggle
  const handleToggle = useCallback(() => {
    setPreserveCurvatureExtrema(!preserveCurvatureExtrema)
  }, [preserveCurvatureExtrema, setPreserveCurvatureExtrema])

  // Check if curve is compatible with the optimizer (both open and closed bsplines, and rational)
  const isCompatible = curve.kind === 'bspline' || curve.kind === 'rational' || curve.kind === 'complex-rational'

  // κ-panel ↔ parameter t mapping, and the smoothing-window drag (grab nearer
  // edge, no min-width collapse — same behaviour as the lab).
  const txOf = (tt: number) => padding.left + ((tt - tMin) / tRange) * plotWidth
  const xtOf = (svgX: number) => tMin + ((svgX - padding.left) / plotWidth) * tRange
  // Map a pointer event to SVG-x via the screen CTM (robust to viewBox letterboxing).
  const winSvgX = (e: React.PointerEvent): number => {
    const svg = kSvgRef.current
    if (!svg) return 0
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (ctm) return pt.matrixTransform(ctm.inverse()).x
    const r = svg.getBoundingClientRect()
    return ((e.clientX - r.left) / r.width) * width
  }
  const onWinDown = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const tc = xtOf(winSvgX(e))
    const idx = Math.abs(tc - smoothWindow[0]) <= Math.abs(tc - smoothWindow[1]) ? 0 : 1
    dragIdx.current = idx
    grabDT.current = tc - smoothWindow[idx]
    otherT.current = smoothWindow[idx === 0 ? 1 : 0]
  }
  const onWinMove = (e: React.PointerEvent) => {
    if (dragIdx.current === null) return
    let tt = xtOf(winSvgX(e)) - grabDT.current
    tt = Math.max(tMin, Math.min(tMax, tt))
    const o = otherT.current
    setSmoothWindow([Math.min(tt, o), Math.max(tt, o)])
  }
  const onWinUp = () => { dragIdx.current = null }

  const movableArc = smooth?.arc ?? null

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 flex justify-between items-center">
        <span>{t('panels.curvature')}</span>
        <div className="flex items-center gap-3">
          {active ? (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-300">Smooth</span>
              <select
                value={smoothMode}
                onChange={(e) => setSmoothMode(e.target.value as 'fairness' | 'laplacian' | 'laplacian-bounded')}
                className="text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1 py-0.5"
                title="smoothing method"
              >
                <option value="laplacian-bounded">Laplacian (bounded)</option>
                <option value="fairness">fairness ({smoothEnergy})</option>
              </select>
              {smoothMode === 'laplacian-bounded' && smoothBound !== null && (
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                  S = {smoothBound}
                </span>
              )}
              {smoothMode === 'fairness' ? (
                <input
                  type="range" min={-2} max={14} step={0.1} value={smoothAmount}
                  onChange={(e) => setSmoothAmount(Number(e.target.value))}
                  className="w-40" title="fairing amount"
                />
              ) : (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="range" min={0} max={50} step={1} value={smoothIterations}
                    onChange={(e) => setSmoothIterations(Number(e.target.value))}
                    className="w-36" title="Laplacian iterations"
                  />
                  <span className="tabular-nums w-6">{smoothIterations}</span>
                </label>
              )}
              <button
                onClick={applySmooth}
                className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply
              </button>
              <button
                onClick={cancelSmooth}
                className="text-xs px-2 py-0.5 rounded border border-gray-400 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {isCompatible && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preserveCurvatureExtrema}
                    onChange={handleToggle}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {t('panels.preserveExtrema')}
                  </span>
                  {preserveCurvatureExtrema && extremaBound !== null && (
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                      S = {extremaBound}
                    </span>
                  )}
                </label>
              )}
              {smoothEligible && (
                <button
                  onClick={enterSmooth}
                  className="text-xs px-2 py-0.5 rounded border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                >
                  Smooth region…
                </button>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('panels.range')}: [{minCurvature.toFixed(4)}, {maxCurvatureVal.toFixed(4)}]
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <svg
          ref={kSvgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          style={{ touchAction: 'none' }}
          onPointerMove={active ? onWinMove : undefined}
          onPointerUp={active ? onWinUp : undefined}
          onPointerLeave={active ? onWinUp : undefined}
        >
          {/* Background */}
          <rect
            x={padding.left}
            y={padding.top}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="#e5e7eb"
            className="dark:stroke-gray-700"
          />

          {/* Smoothing tool: selection window + movable-arc bands (behind the curve) */}
          {active && (
            <>
              <rect
                x={txOf(smoothWindow[0])} y={padding.top}
                width={Math.max(0, txOf(smoothWindow[1]) - txOf(smoothWindow[0]))} height={plotHeight}
                fill="#94a3b8" opacity={0.13}
              />
              {movableArc && (
                <rect
                  x={txOf(movableArc[0])} y={padding.top}
                  width={Math.max(0, txOf(movableArc[1]) - txOf(movableArc[0]))} height={plotHeight}
                  fill="#f59e0b" opacity={0.16}
                />
              )}
            </>
          )}

          {/* Zero line */}
          <line
            x1={padding.left}
            y1={padding.top + plotHeight / 2}
            x2={padding.left + plotWidth}
            y2={padding.top + plotHeight / 2}
            stroke="#9ca3af"
            strokeWidth={1}
          />

          {/* Fill area */}
          <path
            d={`${pathD} L ${padding.left + plotWidth} ${padding.top + plotHeight / 2} L ${padding.left} ${padding.top + plotHeight / 2} Z`}
            fill="#3b82f6"
            opacity={0.2}
          />

          {/* Curvature line */}
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />

          {/* Constraint control points bar (when preserve extrema is enabled) */}
          {preserveCurvatureExtrema && constraintState && (
            <>
              {/* Bar line */}
              <line
                x1={padding.left}
                y1={gBarY}
                x2={padding.left + plotWidth}
                y2={gBarY}
                stroke="#9ca3af"
                strokeWidth={1}
              />

              {/* Constraint control points */}
              {constraintState.gCPs.map((_, i) => {
                const tMin = curve.closed ? 0 : curve.knots[curve.degree]
                const tMax = curve.closed ? 1 : curve.knots[curve.knots.length - curve.degree - 1]
                const tRange = tMax - tMin
                const x = padding.left + ((constraintState.grevilleAbscissae[i] - tMin) / tRange) * plotWidth
                const isInactive = constraintState.inactiveIndices.includes(i)
                const sign = constraintState.signs[i]

                // Color based on sign: positive constraint (g > 0 means sign = -1) is red
                // negative constraint (g < 0 means sign = 1) is green
                const color = sign === -1 ? '#ef4444' : '#22c55e' // red for positive, green for negative

                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={gBarY}
                    r={isInactive ? 4 : 5}
                    fill={color}
                    opacity={isInactive ? 0.3 : 0.9}
                    stroke={isInactive ? 'none' : '#374151'}
                    strokeWidth={0.5}
                  />
                )
              })}
            </>
          )}

          {/* Axis labels */}
          {/* κ label for curvature */}
          <text
            x={padding.left - 8}
            y={padding.top + plotHeight / 2 + 4}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={12}
            fontStyle="italic"
          >
            κ
          </text>
          <text
            x={padding.left - 5}
            y={padding.top + 4}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            +
          </text>
          <text
            x={padding.left - 5}
            y={padding.top + plotHeight + 4}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            -
          </text>

          {/* Parameter labels - position depends on whether constraint bar is shown */}
          <text
            x={padding.left}
            y={preserveCurvatureExtrema && constraintState ? gBarY + 15 : padding.top + plotHeight + 20}
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            0.0
          </text>
          <text
            x={padding.left + plotWidth}
            y={preserveCurvatureExtrema && constraintState ? gBarY + 15 : padding.top + plotHeight + 20}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
            fontSize={10}
          >
            1.0
          </text>

          {/* Smoothing window drag handles — rendered LAST so they sit on top of
              the curvature fill/line and stay clickable everywhere */}
          {active && ([0, 1] as const).map((idx) => {
            const x = txOf(smoothWindow[idx])
            return (
              <g key={idx} style={{ cursor: 'ew-resize' }} onPointerDown={onWinDown}>
                <rect x={x - 9} y={padding.top} width={18} height={plotHeight} fill="transparent" />
                <line x1={x} y1={padding.top} x2={x} y2={padding.top + plotHeight} stroke="#f59e0b" strokeWidth={2} />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
