// Being migrated to core/ incrementally; remove this once a file is on core.
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { Point2D, Curve } from '../types/curve'
import type { CanvasConfig } from '../types/canvas'
import { curvePathAdaptive, getControlPointsAsPoints, sampleCurve, evaluateCurve, type ViewportBounds } from '../utils/bspline'
import { computeRegionPreview } from '../utils/regionSmooth'
import { computeRationalFarinPoints, computeComplexFarinPoints, computeEdgePerpendicular, computeComplexControlPolygonPath, type RationalFarinPoint, type ComplexFarinPoint } from '../utils/farinPoints'
import { getBasisColor } from '../utils/colors'
import { computeCurvatureExtremaParameters, computeClosedCurvatureExtremaParameters, computeRationalCurvatureExtremaParameters, computeClosedRationalCurvatureExtremaParameters, computeClosedComplexCurvatureExtremaParameters, computeOpenComplexCurvatureExtremaParameters, computeClosedInflectionParameters } from '../optimizer'
// Open planar B-spline curvature-extrema markers now come from core/ (accurate
// dense-scan zeros), replacing the legacy coefficient-root finder which reports
// spurious extra markers on fine-knotted curves.
import { openCurvatureExtremaParameters as coreOpenExtremaParams, curvatureExtremaNumeratorPlanar as coreCurvatureNumerator } from '../../core'
import TransformWidget from './TransformWidget'
import { threeArcPointsFromNoisyPoints, circleArcFromThreePoints } from '../utils/circleArc'
import { evaluatePHNormal, findNearestPointParam, computePHCurveFromUV, type PHMetadata } from '../optimizer/phCurve'
import { evaluateABPHNormal, evaluateABPHCurveAtParam, findNearestPointParamAB } from '../optimizer/abPHCurve'
import { evaluateRealRationalPHNormal, evaluateRealRationalPHCurveAtParam, findNearestPointParamRealRational } from '../optimizer/realRationalPHCurve'
import { decomposeToBernstein } from '../optimizer/algebra'

interface Props {
  config?: CanvasConfig
  /** Optional SVG elements rendered inside the main SVG (same coordinate system) */
  svgOverlay?: React.ReactNode
}

interface TouchState {
  type: 'none' | 'one-finger' | 'two-finger'
  initialDistance?: number
  initialZoom?: number
  initialPan?: Point2D
  lastCenter?: Point2D
}

type ActionMode = 'none' | 'panning' | 'drawing' | 'moving-point' | 'moving-curve' | 'moving-farin' | 'moving-transform-handle' | 'creating-offset'

const CLICK_THRESHOLD = 2 // pixels - if movement < this, it's a click not a drag

export default function SketcherCanvas({ config = {}, svgOverlay }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null)
  const [draggedFarinIndex, setDraggedFarinIndex] = useState<number | null>(null)
  const [draggedTransformHandle, setDraggedTransformHandle] = useState<{ index: number; type: 'corner' | 'midpoint' } | null>(null)
  const [initialPan, setInitialPan] = useState<Point2D | null>(null)
  const [touchState, setTouchState] = useState<TouchState>({ type: 'none' })

  // Threshold-based click/drag detection state
  const [pressStart, setPressStart] = useState<Point2D | null>(null)
  const [didExceedThreshold, setDidExceedThreshold] = useState(false)
  const [action, setAction] = useState<ActionMode>('none')

  // RAF throttle for optimizer calls during drag
  const pendingOptimizeRAF = useRef<number | null>(null)
  const pendingOptimizeArgs = useRef<{ curveId: string; pointIndex: number; pos: Point2D } | null>(null)

  // Offset drag state
  const [offsetDragStart, setOffsetDragStart] = useState<Point2D | null>(null)
  const [offsetNormal, setOffsetNormal] = useState<{ nx: number; ny: number } | null>(null)
  const [offsetDistance, setOffsetDistance] = useState(0)
  const [offsetPreviewPolyline, setOffsetPreviewPolyline] = useState<Point2D[] | null>(null)

  const {
    curves,
    selectedCurveId,
    selectCurve,
    selectControlPoint,
    moveControlPoint,
    moveCurve,
    view,
    setPan,
    setZoom,
    isDrawing,
    drawingPoints,
    isNearStart,
    drawnCircleArc,
    isCircleClosed,
    startDrawing,
    continueDrawing,
    finishDrawing,
    activeTool,
    setActiveTool,
    showHint,
    saveToHistory,
    panelView,
    preserveCurvatureExtrema,
    preserveInflections,
    selectFarinPoint,
    moveFarinPoint,
    endpointSnapTarget,
    setEndpointSnapTarget,
    closeCurveByMergingEndpoints,
    transformActive,
    transformWidgetType,
    transformCurrentWidget,
    moveTransformHandle,
    phMetadata,
    offsetSourceCurveId,
    setOffsetSourceCurveId,
    createOffsetCurve,
    smoothActive,
    smoothWindow,
    smoothAmount,
    smoothEnergy,
    smoothMode,
    smoothIterations,
  } = useSceneStore()

  const { allowDrawing = true, allowSelection = true, showControlPolygon, hidePolygonOnDeselect, controlPointHitRadius = 15, alwaysShowCurvatureExtrema = false } = config
  const { t } = useTranslation()

  // Compute curvature extrema positions for selected curve when curvature panel or preserve toggle is active
  const extremaPositions = useMemo(() => {
    if ((!preserveCurvatureExtrema && panelView !== 'curvature' && !alwaysShowCurvatureExtrema) || !selectedCurveId) return []

    const curve = curves.find((c) => c.id === selectedCurveId)
    if (!curve || (curve.kind !== 'bspline' && curve.kind !== 'rational' && curve.kind !== 'complex-rational')) return []

    try {
      let params: number[]
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
          params = computeClosedComplexCurvatureExtremaParameters(
            curve.degree, curve.knots, cpsZre, cpsZim, cpsWre, cpsWim,
            1.0, curve.wrapWeight
          )
        } else {
          params = computeOpenComplexCurvatureExtremaParameters(
            curve.knots, cpsZre, cpsZim, cpsWre, cpsWim
          )
        }
      } else if (curve.kind === 'rational') {
        const cpsX = curve.controlPoints.map((p) => p.x * p.w)
        const cpsY = curve.controlPoints.map((p) => p.y * p.w)
        const cpsW = curve.controlPoints.map((p) => p.w)
        if (curve.closed) {
          params = computeClosedRationalCurvatureExtremaParameters(
            curve.knots, cpsX, cpsY, cpsW, curve.degree, curve.wrapWeight
          )
        } else {
          params = computeRationalCurvatureExtremaParameters(
            curve.knots, cpsX, cpsY, cpsW
          )
        }
      } else if (curve.closed) {
        params = computeClosedCurvatureExtremaParameters(
          curve.knots,
          curve.controlPoints.map((p) => p.x),
          curve.controlPoints.map((p) => p.y),
          curve.degree
        )
      } else {
        const cx = curve.controlPoints.map((p) => p.x)
        const cy = curve.controlPoints.map((p) => p.y)
        // A straight / zero-curvature segment has g ≡ 0, so it has no genuine
        // curvature extrema — and the root-finder degenerates there, smearing
        // markers along the whole curve. Skip when g has no sign changes (0
        // extrema by variation diminishing).
        if (coreCurvatureNumerator(cx, cy, curve.knots, curve.degree).signChanges() === 0) {
          return []
        }
        params = coreOpenExtremaParams(cx, cy, curve.knots, curve.degree)
      }

      // Evaluate curve at each parameter to get (x, y) positions
      return params.map((t) => evaluateCurve(curve, t))
    } catch {
      return []
    }
  }, [preserveCurvatureExtrema, panelView, selectedCurveId, curves, alwaysShowCurvatureExtrema])

  // Compute inflection point positions for selected closed bspline curve
  const inflectionPositions = useMemo(() => {
    if (!preserveInflections || !selectedCurveId) return []

    const curve = curves.find((c) => c.id === selectedCurveId)
    if (!curve || curve.kind !== 'bspline' || !curve.closed) return []

    try {
      const params = computeClosedInflectionParameters(
        curve.knots,
        curve.controlPoints.map((p) => p.x),
        curve.controlPoints.map((p) => p.y),
        curve.degree
      )
      return params.map((t) => evaluateCurve(curve, t))
    } catch {
      return []
    }
  }, [preserveInflections, selectedCurveId, curves])

  // Compute Farin points for selected curve (rational and complex-rational only).
  // EXCEPTION: PH curves have NO editable Farin points — their weights are
  // determined by the generator (the curve is ∫S²), not free handles. The
  // optimizer's variables are the generator, never the weights, so a Farin
  // drag would be meaningless (overwritten on the next solve, or PH-breaking).
  // So hide them entirely whenever the curve carries PH metadata.
  const farinPoints = useMemo((): { rational: RationalFarinPoint[]; complex: ComplexFarinPoint[] } => {
    if (!selectedCurveId) return { rational: [], complex: [] }

    const curve = curves.find((c) => c.id === selectedCurveId)
    if (!curve) return { rational: [], complex: [] }

    const isPH = phMetadata.has(selectedCurveId)
    // Complex-rational curves (INCLUDING PH) get the complex Farin points so
    // their control polygon draws as circle arcs (the natural complex/Farin
    // representation). The draggable Farin handles are still suppressed for PH
    // curves at render time — those are for editing a generic complex-rational
    // curve, whereas a PH curve is edited through its control points + meta.
    if (curve.kind === 'complex-rational') {
      return { rational: [], complex: computeComplexFarinPoints(curve) }
    }
    if (curve.kind === 'rational' && !isPH) {
      return { rational: computeRationalFarinPoints(curve), complex: [] }
    }
    return { rational: [], complex: [] }
  }, [selectedCurveId, curves, phMetadata])

  // Region-smoothing preview overlay: the faired curve, the movable arc, and the
  // free/fixed control points — shown while the smoothing tool is active.
  const smoothOverlay = useMemo(() => {
    if (!smoothActive || !selectedCurveId) return null
    const curve = curves.find((c) => c.id === selectedCurveId)
    if (!curve || curve.kind !== 'bspline' || curve.closed) return null
    const cpX = curve.controlPoints.map((p) => p.x)
    const cpY = curve.controlPoints.map((p) => p.y)
    const prev = computeRegionPreview(curve.knots, cpX, cpY, curve.degree, smoothWindow,
      { mode: smoothMode, amountExp: smoothAmount, energy: smoothEnergy, iterations: smoothIterations })
    const previewCurve = { ...curve, controlPoints: prev.cpX.map((x, i) => ({ x, y: prev.cpY[i] })) }
    const full = sampleCurve(previewCurve, 240)
    const fullPath = full.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
    let arcPath = ''
    if (prev.arc) {
      const [a, b] = prev.arc, N = 100
      for (let i = 0; i <= N; i++) {
        const tt = a + (b - a) * (i / N)
        const p = evaluateCurve(previewCurve, tt)
        arcPath += `${i === 0 ? 'M' : 'L'}${p.x} ${p.y} `
      }
    }
    const freeSet = new Set(prev.F)
    const cps = previewCurve.controlPoints.map((p, i) => ({ x: p.x, y: p.y, free: freeSet.has(i) }))
    // Curvature extrema of the PREVIEW curve, so they animate (and collide) as you slide.
    let extrema: Point2D[] = []
    try {
      const params = computeCurvatureExtremaParameters(previewCurve.knots, prev.cpX, prev.cpY)
      extrema = params.map((tt) => evaluateCurve(previewCurve, tt))
    } catch { extrema = [] }
    return { fullPath, arcPath, cps, extrema }
  }, [smoothActive, selectedCurveId, curves, smoothWindow, smoothAmount, smoothEnergy, smoothMode, smoothIterations])

  // Compute viewport bounds in world coordinates for curve clipping
  const viewport: ViewportBounds = useMemo(() => ({
    minX: (-dimensions.width / 2 - view.panX) / view.zoom,
    maxX: (dimensions.width / 2 - view.panX) / view.zoom,
    minY: (-dimensions.height / 2 - view.panY) / view.zoom,
    maxY: (dimensions.height / 2 - view.panY) / view.zoom,
  }), [dimensions.width, dimensions.height, view.panX, view.panY, view.zoom])

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: rect.height })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Escape key: cancel offset mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && activeTool === 'offset') {
        setActiveTool('none')
        setOffsetSourceCurveId(null)
        setOffsetDragStart(null)
        setOffsetNormal(null)
        setOffsetDistance(0)
        setOffsetPreviewPolyline(null)
        setAction('none')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, setActiveTool, setOffsetSourceCurveId])

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number): Point2D => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return { x: screenX, y: screenY }

      const x = (screenX - rect.left - dimensions.width / 2 - view.panX) / view.zoom
      const y = (screenY - rect.top - dimensions.height / 2 - view.panY) / view.zoom

      return { x, y }
    },
    [view.panX, view.panY, view.zoom, dimensions]
  )

  // Handle wheel zoom - smooth exponential scaling towards mouse position
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return

      // Smooth exponential zoom like static-portfolio
      const newZoom = Math.max(0.01, Math.min(100, view.zoom * Math.exp(-e.deltaY * 0.001)))

      // Zoom towards mouse position (focal point)
      const focalX = e.clientX - rect.left
      const focalY = e.clientY - rect.top
      const centerX = dimensions.width / 2
      const centerY = dimensions.height / 2

      // Adjust pan so the point under the mouse stays fixed
      const focalOffsetX = focalX - centerX
      const focalOffsetY = focalY - centerY
      const zoomRatio = newZoom / view.zoom
      const newPanX = view.panX * zoomRatio - focalOffsetX * (zoomRatio - 1)
      const newPanY = view.panY * zoomRatio - focalOffsetY * (zoomRatio - 1)

      setPan(newPanX, newPanY)
      setZoom(newZoom)
    },
    [view.zoom, view.panX, view.panY, setZoom, setPan, dimensions]
  )

  // Attach the wheel handler as a NON-passive native listener so preventDefault
  // actually suppresses page scroll while zooming. React's onWheel is passive,
  // which both ignores preventDefault and logs a console warning.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Get control point index at position (for selected curve only)
  const getControlPointAtPosition = useCallback(
    (screenX: number, screenY: number): number | null => {
      if (!selectedCurveId) return null

      const selectedCurve = curves.find((c) => c.id === selectedCurveId)
      if (!selectedCurve) return null

      const canvas = screenToCanvas(screenX, screenY)
      const hitRadius = controlPointHitRadius / view.zoom

      const points = getControlPointsAsPoints(selectedCurve)
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const dx = canvas.x - point.x
        const dy = canvas.y - point.y
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          return i
        }
      }
      return null
    },
    [screenToCanvas, view.zoom, curves, selectedCurveId, controlPointHitRadius]
  )

  // Get curve ID at position (for selection)
  // Uses actual curve path sampling for accurate hit detection
  const getCurveAtPosition = useCallback(
    (screenX: number, screenY: number): string | null => {
      const canvas = screenToCanvas(screenX, screenY)
      const hitRadius = 10 / view.zoom // Hit detection radius for curve path

      // Check each curve's path by sampling actual curve points
      for (const curve of curves) {
        // Sample the actual curve at 50 points for hit detection
        const points = sampleCurve(curve, 50)
        if (points.length < 2) continue

        // Check distance to each segment of the sampled curve
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i]
          const p2 = points[i + 1]

          // Distance from point to line segment
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const len2 = dx * dx + dy * dy

          if (len2 === 0) {
            // p1 and p2 are the same point
            const dist = Math.sqrt(
              (canvas.x - p1.x) ** 2 + (canvas.y - p1.y) ** 2
            )
            if (dist < hitRadius) return curve.id
          } else {
            // Project point onto line segment
            const t = Math.max(
              0,
              Math.min(1, ((canvas.x - p1.x) * dx + (canvas.y - p1.y) * dy) / len2)
            )
            const projX = p1.x + t * dx
            const projY = p1.y + t * dy
            const dist = Math.sqrt(
              (canvas.x - projX) ** 2 + (canvas.y - projY) ** 2
            )
            if (dist < hitRadius) return curve.id
          }
        }
      }
      return null
    },
    [screenToCanvas, view.zoom, curves]
  )

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore touch events here - handled by touch handlers
      if (e.pointerType === 'touch') return

      const canvas = screenToCanvas(e.clientX, e.clientY)

      // Right-click, middle mouse button, Shift+click, or Alt+click = pan
      if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.altKey || e.shiftKey))) {
        setPressStart({ x: e.clientX, y: e.clientY })
        setDidExceedThreshold(true) // Immediately start panning
        setAction('panning')
        setInitialPan({ x: view.panX, y: view.panY })
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }

      // Left click behavior depends on active tool
      if (e.button === 0) {
        // Offset tool: click on highlighted curve to start drag
        if (activeTool === 'offset' && offsetSourceCurveId) {
          // Use threshold detection (click vs drag), same as other tools
          // Click (no drag) = deselect/disengage, drag = create offset
          setPressStart({ x: e.clientX, y: e.clientY })
          setDidExceedThreshold(false)
          setAction('none')  // Will become 'creating-offset' if threshold exceeded
          e.currentTarget.setPointerCapture(e.pointerId)
          return
        }


        const isDrawingTool = activeTool === 'draw' || activeTool === 'line' || activeTool === 'circle' || activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral' || activeTool === 'ph-freehand'

        if (isDrawingTool && allowDrawing) {
          // Drawing tool: use threshold detection (click vs drag)
          // Don't start drawing immediately - wait for threshold to distinguish click from drag
          setPressStart({ x: e.clientX, y: e.clientY })
          setDidExceedThreshold(false)
          setAction('none')  // Will become 'drawing' if threshold exceeded
          e.currentTarget.setPointerCapture(e.pointerId)
        } else if (activeTool === 'none') {
          if (showHint && allowDrawing) {
            // Initial view: first touch activates draw mode and starts drawing
            setActiveTool('draw')
            setPressStart({ x: e.clientX, y: e.clientY })
            setDidExceedThreshold(true)
            setAction('drawing')
            startDrawing(canvas)
            e.currentTarget.setPointerCapture(e.pointerId)
          } else {
            // Unified selection/pan/move handling with threshold
            setPressStart({ x: e.clientX, y: e.clientY })
            setDidExceedThreshold(false)

            // Check if over a control point of selected curve
            const controlPointIndex = getControlPointAtPosition(e.clientX, e.clientY)
            if (controlPointIndex !== null && selectedCurveId) {
              // Start moving point immediately (no threshold for control points)
              setAction('moving-point')
              setDraggedPointIndex(controlPointIndex)
              selectControlPoint(controlPointIndex)
              setDidExceedThreshold(true)
              // Snapshot CPs for drift resistance (only used when anchorWeight > 0)
              if (useSceneStore.getState().anchorWeight > 0) {
                useSceneStore.getState().snapshotDragStartCPs(selectedCurveId)
              }
            } else {
              // Will determine action (pan or move-curve) on threshold exceeded
              setAction('none')
            }

            e.currentTarget.setPointerCapture(e.pointerId)
          }
        }
      }
    },
    [screenToCanvas, view.panX, view.panY, allowDrawing, activeTool, setActiveTool, startDrawing, showHint, getControlPointAtPosition, selectedCurveId, selectControlPoint, offsetSourceCurveId, phMetadata]
  )

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // Ignore touch events here - handled by touch handlers
      if (e.pointerType === 'touch') return

      // Check threshold for click vs drag detection
      if (pressStart && !didExceedThreshold) {
        const dx = e.clientX - pressStart.x
        const dy = e.clientY - pressStart.y
        if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) {
          setDidExceedThreshold(true)

          // Determine what action to start based on what's under the initial press
          if (action === 'none') {
            if (activeTool === 'offset' && offsetSourceCurveId) {
              // Started drag with offset tool → compute nearest point and begin offset
              const canvas = screenToCanvas(pressStart.x, pressStart.y)
              const rawMetadata = phMetadata.get(offsetSourceCurveId)
              if (rawMetadata) {
                let normal: { nx: number; ny: number }
                if (rawMetadata.kind === 'ab-complex-rational') {
                  const t = findNearestPointParamAB(rawMetadata, canvas)
                  normal = evaluateABPHNormal(rawMetadata, t)
                } else if (rawMetadata.kind === 'real-rational') {
                  const t = findNearestPointParamRealRational(rawMetadata, canvas)
                  normal = evaluateRealRationalPHNormal(rawMetadata, t)
                } else {
                  const metadata = rawMetadata as PHMetadata
                  const curveResult = computePHCurveFromUV(
                    metadata.uControlPoints, metadata.vControlPoints,
                    metadata.uvKnots, metadata.uvDegree,
                    metadata.origin.x, metadata.origin.y,
                  )
                  const t = findNearestPointParam(curveResult, canvas)
                  normal = evaluatePHNormal(metadata, t)
                }
                setOffsetDragStart(canvas)
                setOffsetNormal(normal)
                setOffsetDistance(0)
                setOffsetPreviewPolyline(null)
                setAction('creating-offset')
              }
            } else {
            const isDrawingTool = activeTool === 'draw' || activeTool === 'line' || activeTool === 'circle' || activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral' || activeTool === 'ph-freehand'
            if (isDrawingTool && allowDrawing) {
              // Started drag with drawing tool → start drawing from press position
              const canvas = screenToCanvas(pressStart.x, pressStart.y)
              startDrawing(canvas)
              setAction('drawing')
            } else {
              const curveUnderPointer = getCurveAtPosition(pressStart.x, pressStart.y)
              if (curveUnderPointer) {
                // Started drag on any curve → select it and move it
                selectCurve(curveUnderPointer)
                setAction('moving-curve')
              } else if (curves.length === 0 && allowDrawing) {
                // Canvas is empty → start freehand drawing automatically
                setActiveTool('draw')
                const canvas = screenToCanvas(pressStart.x, pressStart.y)
                startDrawing(canvas)
                setAction('drawing')
              } else {
                // Started drag on empty space → pan
                setAction('panning')
                setInitialPan({ x: view.panX, y: view.panY })
              }
            }
            }
          }
        }
      }

      // Handle current action
      if (action === 'panning' && pressStart && initialPan) {
        const dx = e.clientX - pressStart.x
        const dy = e.clientY - pressStart.y
        setPan(initialPan.x + dx, initialPan.y + dy)
        return
      }

      if (action === 'drawing') {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        continueDrawing(canvas, view.zoom)
        return
      }

      if (action === 'moving-point' && draggedPointIndex !== null && selectedCurveId) {
        const canvas = screenToCanvas(e.clientX, e.clientY)

        // RAF-throttle the optimizer: only run once per frame, always use latest position
        pendingOptimizeArgs.current = { curveId: selectedCurveId, pointIndex: draggedPointIndex, pos: canvas }
        if (pendingOptimizeRAF.current === null) {
          pendingOptimizeRAF.current = requestAnimationFrame(() => {
            pendingOptimizeRAF.current = null
            const args = pendingOptimizeArgs.current
            if (args) {
              moveControlPoint(args.curveId, args.pointIndex, args.pos)
            }
          })
        }

        // Check for endpoint snap (closing open curve). Closeable: ordinary
        // curves, and the polynomial PH spline (the only PH kind with closed
        // support). Other PH kinds are still excluded.
        const curve = curves.find((c) => c.id === selectedCurveId)
        const phK = curve ? phMetadata.get(curve.id) : undefined
        const closeable = !phK || phK.kind === 'polynomial'
        const minSnapPoints = curve?.kind === 'complex-rational' ? 3 : 4
        if (curve && !curve.closed && closeable && curve.controlPoints.length >= minSnapPoints) {
          const n = curve.controlPoints.length
          const isFirst = draggedPointIndex === 0
          const isLast = draggedPointIndex === n - 1

          if (isFirst || isLast) {
            // Get the opposite endpoint
            const targetPoint = getControlPointsAsPoints(curve)[isFirst ? n - 1 : 0]
            const dx = canvas.x - targetPoint.x
            const dy = canvas.y - targetPoint.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const threshold = 30 / view.zoom // Same threshold as drawing snap

            if (distance < threshold) {
              setEndpointSnapTarget(targetPoint)
            } else {
              setEndpointSnapTarget(null)
            }
          } else {
            setEndpointSnapTarget(null)
          }
        } else {
          setEndpointSnapTarget(null)
        }
        return
      }

      if (action === 'moving-curve' && pressStart && selectedCurveId) {
        const prevCanvas = screenToCanvas(pressStart.x, pressStart.y)
        const currCanvas = screenToCanvas(e.clientX, e.clientY)
        const displacement = {
          x: currCanvas.x - prevCanvas.x,
          y: currCanvas.y - prevCanvas.y,
        }
        moveCurve(selectedCurveId, displacement)
        setPressStart({ x: e.clientX, y: e.clientY }) // Update baseline for incremental moves
      }

      if (action === 'moving-farin' && draggedFarinIndex !== null && selectedCurveId) {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        moveFarinPoint(selectedCurveId, draggedFarinIndex, canvas)
      }

      if (action === 'moving-transform-handle' && draggedTransformHandle !== null) {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        moveTransformHandle(draggedTransformHandle.index, draggedTransformHandle.type, canvas)
      }

      if (action === 'creating-offset' && offsetDragStart && offsetNormal && offsetSourceCurveId) {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        // Project displacement onto the stored normal
        const dx = canvas.x - offsetDragStart.x
        const dy = canvas.y - offsetDragStart.y
        const d = dx * offsetNormal.nx + dy * offsetNormal.ny
        setOffsetDistance(d)

        // Build preview: sample base curve and offset each point
        const rawMetadata = phMetadata.get(offsetSourceCurveId)
        if (rawMetadata) {
          const numSamples = 100
          const previewPoints: Point2D[] = []

          if (rawMetadata.kind === 'ab-complex-rational') {
            // AB PH: sample actual A/B curve and use correct normal
            const degree = rawMetadata.degree
            const knots = rawMetadata.knots
            const tMin = knots[degree]
            const tMax = knots[knots.length - degree - 1]
            for (let i = 0; i <= numSamples; i++) {
              const t = tMin + (i / numSamples) * (tMax - tMin)
              const pt = evaluateABPHCurveAtParam(rawMetadata, t)
              const n = evaluateABPHNormal(rawMetadata, t)
              previewPoints.push({ x: pt.x + d * n.nx, y: pt.y + d * n.ny })
            }
          } else if (rawMetadata.kind === 'real-rational') {
            // Real rational PH: sample A/B curve with simplified normal
            const degree = rawMetadata.degree
            const knots = rawMetadata.knots
            const tMin = knots[degree]
            const tMax = knots[knots.length - degree - 1]
            for (let i = 0; i <= numSamples; i++) {
              const t = tMin + (i / numSamples) * (tMax - tMin)
              const pt = evaluateRealRationalPHCurveAtParam(rawMetadata, t)
              const n = evaluateRealRationalPHNormal(rawMetadata, t)
              previewPoints.push({ x: pt.x + d * n.nx, y: pt.y + d * n.ny })
            }
          } else {
            // Polynomial PH: existing path
            const metadata = rawMetadata as PHMetadata
            const curveResult = computePHCurveFromUV(
              metadata.uControlPoints, metadata.vControlPoints,
              metadata.uvKnots, metadata.uvDegree,
              metadata.origin.x, metadata.origin.y,
            )
            const xBD = decomposeToBernstein({
              knots: curveResult.knots,
              controlPoints: curveResult.controlPoints.map(p => p.x),
            })
            const yBD = decomposeToBernstein({
              knots: curveResult.knots,
              controlPoints: curveResult.controlPoints.map(p => p.y),
            })
            const tMin = curveResult.knots[curveResult.degree]
            const tMax = curveResult.knots[curveResult.knots.length - curveResult.degree - 1]
            for (let i = 0; i <= numSamples; i++) {
              const t = tMin + (i / numSamples) * (tMax - tMin)
              const n = evaluatePHNormal(metadata, t)
              const bx = xBD.evaluate(t)
              const by = yBD.evaluate(t)
              previewPoints.push({ x: bx + d * n.nx, y: by + d * n.ny })
            }
          }
          setOffsetPreviewPolyline(previewPoints)
        }
      }
    },
    [
      pressStart,
      didExceedThreshold,
      action,
      initialPan,
      draggedPointIndex,
      draggedFarinIndex,
      draggedTransformHandle,
      selectedCurveId,
      screenToCanvas,
      setPan,
      continueDrawing,
      moveControlPoint,
      moveCurve,
      moveFarinPoint,
      moveTransformHandle,
      getCurveAtPosition,
      selectCurve,
      view.panX,
      view.panY,
      view.zoom,
      activeTool,
      allowDrawing,
      startDrawing,
      curves,
      setActiveTool,
      setEndpointSnapTarget,
      offsetDragStart,
      offsetNormal,
      offsetSourceCurveId,
      phMetadata,
    ]
  )

  // Handle pointer up
  const handlePointerUp = useCallback(
    (e?: React.PointerEvent) => {
      // Ignore touch here — touch is finalized by handleTouchEnd. On iOS a touch
      // also emits pointer events, and pointerleave/pointercancel can fire
      // mid-stroke; without this guard that would finish the drawing prematurely
      // ("draws a bit, then stops while the finger keeps moving").
      if (e?.pointerType === 'touch') return
      // Handle click (threshold not exceeded)
      if (!didExceedThreshold && pressStart && allowSelection) {
        // It was a click, not a drag
        const curveId = getCurveAtPosition(pressStart.x, pressStart.y)
        if (curveId) {
          selectCurve(curveId)
        } else if (useSceneStore.getState().generate) {
          // Clicking empty space during a Generate session commits it (the
          // generated curve is kept) and hides the panel — click-away = Done.
          useSceneStore.getState().doneGenerate()
        } else {
          selectCurve(null) // Deselect
          setActiveTool('none') // Enter rest state - must choose tool to draw again
        }
      }

      // Handle offset creation
      if (action === 'creating-offset' && offsetSourceCurveId) {
        if (Math.abs(offsetDistance) > 0.5 / view.zoom) {
          createOffsetCurve(offsetSourceCurveId, offsetDistance)
        }
        // Clean up offset state
        setOffsetDragStart(null)
        setOffsetNormal(null)
        setOffsetDistance(0)
        setOffsetPreviewPolyline(null)
        setAction('none')
        setPressStart(null)
        setDidExceedThreshold(false)
        return
      }

      // Handle drawing end
      if (action === 'drawing') {
        finishDrawing(view.zoom)
      }

      // Check for endpoint snap to close curve
      if (action === 'moving-point' && endpointSnapTarget && selectedCurveId && draggedPointIndex !== null) {
        closeCurveByMergingEndpoints(selectedCurveId, draggedPointIndex)
      } else if (action === 'moving-curve' || action === 'moving-point' || action === 'moving-farin') {
        // Save history if we moved something (and didn't close)
        saveToHistory()
      }

      // Clear drift resistance snapshot
      if (action === 'moving-point') {
        useSceneStore.getState().clearDragStartCPs()
      }

      // Clear endpoint snap target
      setEndpointSnapTarget(null)

      // Reset state
      setPressStart(null)
      setDidExceedThreshold(false)
      setAction('none')
      setDraggedPointIndex(null)
      setDraggedFarinIndex(null)
      setDraggedTransformHandle(null)
      setInitialPan(null)
    },
    [didExceedThreshold, pressStart, allowSelection, getCurveAtPosition, selectCurve, setActiveTool, action, finishDrawing, saveToHistory, endpointSnapTarget, selectedCurveId, draggedPointIndex, closeCurveByMergingEndpoints, setEndpointSnapTarget, view.zoom, offsetSourceCurveId, offsetDistance, createOffsetCurve, activeTool, screenToCanvas]
  )

  // Handle control point mouse down for dragging
  const handleControlPointDown = useCallback(
    (e: React.PointerEvent, pointIndex: number) => {
      e.stopPropagation()
      // Set up state for control point dragging
      setPressStart({ x: e.clientX, y: e.clientY })
      setDidExceedThreshold(true) // Immediately start dragging
      setAction('moving-point')
      setDraggedPointIndex(pointIndex)
      selectControlPoint(pointIndex)
      // Snapshot CPs for drift resistance (only used when anchorWeight > 0)
      if (useSceneStore.getState().anchorWeight > 0 && selectedCurveId) {
        useSceneStore.getState().snapshotDragStartCPs(selectedCurveId)
      }
      // Capture on SVG element (parent), not the circle
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId)
      }
    },
    [selectControlPoint, selectedCurveId]
  )

  // Handle transform widget handle pointer down
  const handleTransformHandleDown = useCallback(
    (e: React.PointerEvent, handleIndex: number, handleType: 'corner' | 'midpoint') => {
      e.stopPropagation()
      setPressStart({ x: e.clientX, y: e.clientY })
      setDidExceedThreshold(true)
      setAction('moving-transform-handle')
      setDraggedTransformHandle({ index: handleIndex, type: handleType })
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId)
      }
    },
    []
  )

  // Handle Farin point mouse down for dragging
  const handleFarinPointDown = useCallback(
    (e: React.PointerEvent, farinIndex: number) => {
      e.stopPropagation()
      // Set up state for Farin point dragging
      setPressStart({ x: e.clientX, y: e.clientY })
      setDidExceedThreshold(true) // Immediately start dragging
      setAction('moving-farin')
      setDraggedFarinIndex(farinIndex)
      selectFarinPoint(farinIndex)
      // Capture on SVG element (parent)
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId)
      }
    },
    [selectFarinPoint]
  )

  // Touch event handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches

      if (touches.length === 2) {
        // Two-finger gesture - always pan/zoom
        e.preventDefault()
        const t1 = touches[0]
        const t2 = touches[1]
        const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
        const center = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        }

        setTouchState({
          type: 'two-finger',
          initialDistance: distance,
          initialZoom: view.zoom,
          initialPan: { x: view.panX, y: view.panY },
          lastCenter: center,
        })
      } else if (touches.length === 1) {
        // One-finger gesture - use same threshold-based approach as pointer
        const touch = touches[0]
        const isDrawingTool = activeTool === 'draw' || activeTool === 'line' || activeTool === 'circle' || activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral' || activeTool === 'ph-freehand'

        if (isDrawingTool && allowDrawing) {
          // Drawing tool: use threshold detection (click vs drag)
          // Don't start drawing immediately - wait for threshold to distinguish click from drag
          setPressStart({ x: touch.clientX, y: touch.clientY })
          setDidExceedThreshold(false)
          setAction('none')  // Will become 'drawing' if threshold exceeded
          setTouchState({ type: 'one-finger' })
        } else if (activeTool === 'none') {
          // Unified selection/pan/move handling with threshold
          // (empty canvas auto-draw is handled in handleTouchMove after threshold)
          setPressStart({ x: touch.clientX, y: touch.clientY })
          setDidExceedThreshold(false)

          // Check if over a control point of selected curve
          const controlPointIndex = getControlPointAtPosition(touch.clientX, touch.clientY)
          if (controlPointIndex !== null && selectedCurveId) {
            setAction('moving-point')
            setDraggedPointIndex(controlPointIndex)
            selectControlPoint(controlPointIndex)
            if (useSceneStore.getState().anchorWeight > 0) {
              useSceneStore.getState().snapshotDragStartCPs(selectedCurveId)
            }
            setDidExceedThreshold(true)
          } else {
            setAction('none')
          }
          setTouchState({ type: 'one-finger' })
        }
      }
    },
    [view.zoom, view.panX, view.panY, screenToCanvas, activeTool, allowDrawing, getControlPointAtPosition, selectedCurveId, selectControlPoint]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touches = e.touches

      if (touches.length === 2 && touchState.type === 'two-finger') {
        e.preventDefault()
        const rect = svgRef.current?.getBoundingClientRect()
        if (!rect) return

        const t1 = touches[0]
        const t2 = touches[1]

        // Calculate new distance for pinch zoom
        const newDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

        // Calculate new center (focal point for zoom)
        const newCenter = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        }

        // Apply zoom and pan together to keep focal point fixed
        if (touchState.initialDistance && touchState.initialZoom && touchState.lastCenter) {
          const scale = newDistance / touchState.initialDistance
          const newZoom = Math.max(0.01, Math.min(10, touchState.initialZoom * scale))

          // Focal point in SVG-relative coordinates
          const focalX = newCenter.x - rect.left
          const focalY = newCenter.y - rect.top
          const centerX = dimensions.width / 2
          const centerY = dimensions.height / 2

          // Calculate pan adjustment to keep focal point fixed during zoom
          const focalOffsetX = focalX - centerX
          const focalOffsetY = focalY - centerY
          const zoomRatio = newZoom / view.zoom
          let newPanX = view.panX * zoomRatio - focalOffsetX * (zoomRatio - 1)
          let newPanY = view.panY * zoomRatio - focalOffsetY * (zoomRatio - 1)

          // Also apply pan from finger movement (so you can pan while zooming)
          const dx = newCenter.x - touchState.lastCenter.x
          const dy = newCenter.y - touchState.lastCenter.y
          newPanX += dx
          newPanY += dy

          setPan(newPanX, newPanY)
          setZoom(newZoom)
        }

        // Update last center for continuous panning
        setTouchState((prev) => ({
          ...prev,
          lastCenter: newCenter,
        }))
      } else if (touches.length === 1 && touchState.type === 'one-finger') {
        const touch = touches[0]

        // Check threshold for click vs drag detection
        if (pressStart && !didExceedThreshold) {
          const dx = touch.clientX - pressStart.x
          const dy = touch.clientY - pressStart.y
          if (Math.sqrt(dx * dx + dy * dy) > CLICK_THRESHOLD) {
            setDidExceedThreshold(true)

            // Determine what action to start
            if (action === 'none') {
              const isDrawingTool = activeTool === 'draw' || activeTool === 'line' || activeTool === 'circle' || activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral' || activeTool === 'ph-freehand'
              if (isDrawingTool && allowDrawing) {
                // Started drag with drawing tool → start drawing from press position
                const canvas = screenToCanvas(pressStart.x, pressStart.y)
                startDrawing(canvas)
                setAction('drawing')
              } else {
                const curveUnderPointer = getCurveAtPosition(pressStart.x, pressStart.y)
                if (curveUnderPointer) {
                  // Started drag on any curve → select it and move it
                  selectCurve(curveUnderPointer)
                  setAction('moving-curve')
                } else if (curves.length === 0 && allowDrawing) {
                  // Canvas is empty → start freehand drawing automatically
                  setActiveTool('draw')
                  const canvas = screenToCanvas(pressStart.x, pressStart.y)
                  startDrawing(canvas)
                  setAction('drawing')
                } else {
                  // Started drag on empty space → pan
                  setAction('panning')
                  setInitialPan({ x: view.panX, y: view.panY })
                }
              }
            }
          }
        }

        // Handle current action
        if (action === 'panning' && pressStart && initialPan) {
          const dx = touch.clientX - pressStart.x
          const dy = touch.clientY - pressStart.y
          setPan(initialPan.x + dx, initialPan.y + dy)
        } else if (action === 'drawing') {
          const canvas = screenToCanvas(touch.clientX, touch.clientY)
          continueDrawing(canvas, view.zoom)
        } else if (action === 'moving-point' && draggedPointIndex !== null && selectedCurveId) {
          const canvas = screenToCanvas(touch.clientX, touch.clientY)
          pendingOptimizeArgs.current = { curveId: selectedCurveId, pointIndex: draggedPointIndex, pos: canvas }
          if (pendingOptimizeRAF.current === null) {
            pendingOptimizeRAF.current = requestAnimationFrame(() => {
              pendingOptimizeRAF.current = null
              const args = pendingOptimizeArgs.current
              if (args) {
                moveControlPoint(args.curveId, args.pointIndex, args.pos)
              }
            })
          }

          // Check for endpoint snap (closing open curve). Only ordinary curves
          // and the polynomial PH spline are closeable.
          const curve = curves.find((c) => c.id === selectedCurveId)
          const phK = curve ? phMetadata.get(curve.id) : undefined
          const closeable = !phK || phK.kind === 'polynomial'
          const minSnapPoints = curve?.kind === 'complex-rational' ? 3 : 4
          if (curve && !curve.closed && closeable && curve.controlPoints.length >= minSnapPoints) {
            const n = curve.controlPoints.length
            const isFirst = draggedPointIndex === 0
            const isLast = draggedPointIndex === n - 1

            if (isFirst || isLast) {
              const targetPoint = getControlPointsAsPoints(curve)[isFirst ? n - 1 : 0]
              const dx = canvas.x - targetPoint.x
              const dy = canvas.y - targetPoint.y
              const distance = Math.sqrt(dx * dx + dy * dy)
              const threshold = 30 / view.zoom

              if (distance < threshold) {
                setEndpointSnapTarget(targetPoint)
              } else {
                setEndpointSnapTarget(null)
              }
            } else {
              setEndpointSnapTarget(null)
            }
          } else {
            setEndpointSnapTarget(null)
          }
        } else if (action === 'moving-curve' && pressStart && selectedCurveId) {
          const prevCanvas = screenToCanvas(pressStart.x, pressStart.y)
          const currCanvas = screenToCanvas(touch.clientX, touch.clientY)
          const displacement = {
            x: currCanvas.x - prevCanvas.x,
            y: currCanvas.y - prevCanvas.y,
          }
          moveCurve(selectedCurveId, displacement)
          setPressStart({ x: touch.clientX, y: touch.clientY })
        } else if (action === 'moving-farin' && draggedFarinIndex !== null && selectedCurveId) {
          const canvas = screenToCanvas(touch.clientX, touch.clientY)
          moveFarinPoint(selectedCurveId, draggedFarinIndex, canvas)
        } else if (action === 'moving-transform-handle' && draggedTransformHandle !== null) {
          const canvas = screenToCanvas(touch.clientX, touch.clientY)
          moveTransformHandle(draggedTransformHandle.index, draggedTransformHandle.type, canvas)
        }
      }
    },
    [
      touchState,
      view.panX,
      view.panY,
      view.zoom,
      dimensions,
      pressStart,
      didExceedThreshold,
      action,
      initialPan,
      draggedPointIndex,
      draggedFarinIndex,
      draggedTransformHandle,
      selectedCurveId,
      screenToCanvas,
      setZoom,
      setPan,
      continueDrawing,
      moveControlPoint,
      moveCurve,
      moveFarinPoint,
      moveTransformHandle,
      getCurveAtPosition,
      selectCurve,
      activeTool,
      allowDrawing,
      startDrawing,
      curves,
      setActiveTool,
      setEndpointSnapTarget,
      phMetadata,
    ]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const remainingTouches = e.touches.length

      if (remainingTouches === 0) {
        // All fingers lifted - same logic as handlePointerUp
        if (!didExceedThreshold && pressStart && allowSelection) {
          const curveId = getCurveAtPosition(pressStart.x, pressStart.y)
          if (curveId) {
            selectCurve(curveId)
          } else if (useSceneStore.getState().generate) {
            // Click-away during a Generate session commits it (Done) and hides the panel.
            useSceneStore.getState().doneGenerate()
          } else {
            selectCurve(null) // Deselect
            setActiveTool('none') // Enter rest state - must choose tool to draw again
          }
        }

        if (action === 'drawing') {
          finishDrawing(view.zoom)
        }

        // Check for endpoint snap to close curve
        if (action === 'moving-point' && endpointSnapTarget && selectedCurveId && draggedPointIndex !== null) {
          closeCurveByMergingEndpoints(selectedCurveId, draggedPointIndex)
        } else if (action === 'moving-curve' || action === 'moving-point' || action === 'moving-farin') {
          saveToHistory()
        }

        // Clear drift resistance snapshot
        if (action === 'moving-point') {
          useSceneStore.getState().clearDragStartCPs()
        }

        // Clear endpoint snap target
        setEndpointSnapTarget(null)

        // Reset state
        setPressStart(null)
        setDidExceedThreshold(false)
        setAction('none')
        setDraggedPointIndex(null)
        setDraggedFarinIndex(null)
        setDraggedTransformHandle(null)
        setInitialPan(null)
        setTouchState({ type: 'none' })
      } else if (remainingTouches === 1 && touchState.type === 'two-finger') {
        // Went from two fingers to one - reset to prevent jumpy behavior
        setTouchState({ type: 'none' })
      }
    },
    [didExceedThreshold, pressStart, allowSelection, getCurveAtPosition, selectCurve, setActiveTool, action, finishDrawing, saveToHistory, touchState.type, endpointSnapTarget, selectedCurveId, draggedPointIndex, closeCurveByMergingEndpoints, setEndpointSnapTarget, view.zoom]
  )

  // Determine which curves show control polygon.
  const shouldShowControlPolygon = (curve: Curve) => {
    // Hide control polygon when in offset mode for the source curve
    if (activeTool === 'offset' && curve.id === offsetSourceCurveId) return false
    // hidePolygonOnDeselect: the polygon follows SELECTION — clicking empty
    // space deselects and HIDES it (rather than leaving it shown/greyed).
    if (hidePolygonOnDeselect) return curve.id === selectedCurveId
    if (showControlPolygon) return true
    return curve.id === selectedCurveId
  }

  // Compute cursor based on current action
  const getCursor = () => {
    if (action === 'panning') return 'grabbing'
    if (action === 'drawing') return 'crosshair'
    if (action === 'moving-curve') return 'move'
    if (action === 'moving-point') return 'pointer'
    if (action === 'moving-farin') return 'pointer'
    if (action === 'moving-transform-handle') return 'move'
    if (action === 'creating-offset') return 'crosshair'
    if (activeTool === 'offset') return 'crosshair'
    return 'default'
  }

  return (
    <svg
      ref={svgRef}
      className="w-full h-full bg-white dark:bg-gray-900 touch-none"
      style={{ cursor: getCursor() }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Transform group for pan/zoom */}
      <g
        transform={`translate(${dimensions.width / 2 + view.panX}, ${dimensions.height / 2 + view.panY}) scale(${view.zoom})`}
      >
        {/* Grid */}
        <g className="text-gray-200 dark:text-gray-800">
          <line
            x1={-5000}
            y1={0}
            x2={5000}
            y2={0}
            stroke="currentColor"
            strokeWidth={1 / view.zoom}
          />
          <line
            x1={0}
            y1={-5000}
            x2={0}
            y2={5000}
            stroke="currentColor"
            strokeWidth={1 / view.zoom}
          />
        </g>

        {/* Render curves */}
        {curves.map((curve) => {
          const isSelected = curve.id === selectedCurveId
          const points = getControlPointsAsPoints(curve)

          return (
            <g key={curve.id}>
              {/* Control polygon (shown when selected; hidden while smoothing — the preview overlay shows it) */}
              {shouldShowControlPolygon(curve) && points.length > 1 && !(isSelected && smoothActive) && (
                <g>
                  {/* Control polygon - use arcs for complex-rational, lines for others */}
                  {curve.kind === 'complex-rational' && isSelected && farinPoints.complex.length > 0 ? (
                    <path
                      d={computeComplexControlPolygonPath(points, farinPoints.complex, curve.closed, viewport, 0.5 / view.zoom)}
                      fill="none"
                      stroke={isSelected ? '#3b82f6' : '#9ca3af'}
                      strokeWidth={1 / view.zoom}
                      strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.6}
                    />
                  ) : curve.closed ? (
                    // Use polygon for closed curves to connect last point to first
                    <polygon
                      points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={isSelected ? '#3b82f6' : '#9ca3af'}
                      strokeWidth={1 / view.zoom}
                      strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.6}
                    />
                  ) : (
                    <polyline
                      points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={isSelected ? '#3b82f6' : '#9ca3af'}
                      strokeWidth={1 / view.zoom}
                      strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.6}
                    />
                  )}

                  {/* Control points */}
                  {points.map((point, index) => {
                    // Use basis function colors when basis panel is open
                    const pointColor =
                      isSelected && panelView === 'basis'
                        ? getBasisColor(index, points.length)
                        : isSelected
                          ? '#3b82f6'
                          : '#9ca3af'
                    return (
                      <circle
                        key={index}
                        cx={point.x}
                        cy={point.y}
                        r={6 / view.zoom}
                        fill={pointColor}
                        stroke="white"
                        strokeWidth={2 / view.zoom}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(e) => handleControlPointDown(e, index)}
                      />
                    )
                  })}

                  {/* Endpoint snap indicator (for closing open curves) */}
                  {isSelected && !curve.closed && endpointSnapTarget && (
                    <g>
                      {/* Green rings around target endpoint */}
                      <circle
                        cx={endpointSnapTarget.x}
                        cy={endpointSnapTarget.y}
                        r={12 / view.zoom}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={2.5 / view.zoom}
                        opacity={0.8}
                      />
                      <circle
                        cx={endpointSnapTarget.x}
                        cy={endpointSnapTarget.y}
                        r={18 / view.zoom}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={1.5 / view.zoom}
                        opacity={0.4}
                      />
                    </g>
                  )}
                </g>
              )}

              {/* Highlight glow when in offset mode */}
              {activeTool === 'offset' && curve.id === offsetSourceCurveId && (
                <path
                  d={curvePathAdaptive(curve, { tolerance: 0.5 / view.zoom, viewport })}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={4 / view.zoom}
                  opacity={0.4}
                  style={{ pointerEvents: 'none' }}
                />
              )}

              {/* The curve itself */}
              <path
                d={curvePathAdaptive(curve, { tolerance: 0.5 / view.zoom, viewport })}
                fill="none"
                stroke={isSelected ? '#2563eb' : '#374151'}
                strokeWidth={(isSelected ? 3 : 2) / view.zoom}
                style={{ cursor: 'pointer', pointerEvents: 'none' }}
                className="dark:stroke-gray-300"
              />

              {/* Curvature extrema markers (when curvature panel or preserve extrema is active) */}
              {isSelected && !smoothActive && (preserveCurvatureExtrema || panelView === 'curvature' || alwaysShowCurvatureExtrema) && extremaPositions.length > 0 && (
                <g>
                  {extremaPositions.map((pos, index) => (
                    <g key={`extrema-${index}`}>
                      {/* Outer ring */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={8 / view.zoom}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2.5 / view.zoom}
                      />
                      {/* Inner fill */}
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={5 / view.zoom}
                        fill="rgba(245, 158, 11, 0.4)"
                      />
                    </g>
                  ))}
                </g>
              )}

              {/* Inflection point markers (red diamonds) */}
              {isSelected && preserveInflections && inflectionPositions.length > 0 && (
                <g>
                  {inflectionPositions.map((pos, index) => (
                    <rect
                      key={`inflection-${index}`}
                      x={pos.x - 5 / view.zoom}
                      y={pos.y - 5 / view.zoom}
                      width={10 / view.zoom}
                      height={10 / view.zoom}
                      fill="rgba(239, 68, 68, 0.4)"
                      stroke="#ef4444"
                      strokeWidth={2 / view.zoom}
                      transform={`rotate(45 ${pos.x} ${pos.y})`}
                    />
                  ))}
                </g>
              )}

              {/* Farin points for rational B-splines (perpendicular line markers) */}
              {isSelected && !(activeTool === 'offset' && curve.id === offsetSourceCurveId) && curve.kind === 'rational' && farinPoints.rational.length > 0 && (
                <g>
                  {farinPoints.rational.map((farin) => {
                    const { px, py } = computeEdgePerpendicular(farin.edgeStart, farin.edgeEnd)
                    const len = 8 / view.zoom
                    return (
                      <g key={`farin-${farin.index}`}>
                        {/* Invisible wider hit target */}
                        <line
                          x1={farin.position.x - px * len}
                          y1={farin.position.y - py * len}
                          x2={farin.position.x + px * len}
                          y2={farin.position.y + py * len}
                          stroke="transparent"
                          strokeWidth={12 / view.zoom}
                          strokeLinecap="round"
                          style={{ cursor: 'ew-resize' }}
                          onPointerDown={(e) => handleFarinPointDown(e, farin.index)}
                        />
                        {/* Visible marker */}
                        <line
                          x1={farin.position.x - px * len}
                          y1={farin.position.y - py * len}
                          x2={farin.position.x + px * len}
                          y2={farin.position.y + py * len}
                          stroke="#3b82f6"
                          strokeWidth={2.5 / view.zoom}
                          strokeLinecap="round"
                          style={{ cursor: 'ew-resize', pointerEvents: 'none' }}
                        />
                      </g>
                    )
                  })}
                </g>
              )}

              {/* Farin points for complex-rational B-splines (semi-transparent circles).
                  Hidden in bound ("optimization") mode: the optimizer freezes the
                  weights, so Farin points cannot move — showing them invites a drag that
                  fights the optimizer and leaves the interaction stuck. The control-polygon
                  arcs above still render (they only read the Farin positions). */}
              {isSelected && !preserveCurvatureExtrema && !(activeTool === 'offset' && curve.id === offsetSourceCurveId) && curve.kind === 'complex-rational' && !phMetadata.has(curve.id) && farinPoints.complex.length > 0 && (
                <g>
                  {farinPoints.complex.map((farin) => (
                    <circle
                      key={`farin-${farin.index}`}
                      cx={farin.position.x}
                      cy={farin.position.y}
                      r={5 / view.zoom}
                      fill="#3b82f6"
                      fillOpacity={0.5}
                      stroke="#3b82f6"
                      strokeWidth={1.5 / view.zoom}
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => handleFarinPointDown(e, farin.index)}
                    />
                  ))}
                </g>
              )}
            </g>
          )
        })}

        {/* Transform widget */}
        {transformActive && transformWidgetType && transformCurrentWidget && selectedCurveId && (
          <TransformWidget
            widgetType={transformWidgetType}
            currentWidget={transformCurrentWidget}
            zoom={view.zoom}
            onHandlePointerDown={handleTransformHandleDown}
          />
        )}

        {/* Drawing preview */}
        {isDrawing && drawingPoints.length > 0 && (
          <g>
            {(activeTool === 'draw' || activeTool === 'ph-freehand') && (
              <>
                {/* Freehand preview */}
                <polyline
                  points={drawingPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2 / view.zoom}
                  opacity={0.6}
                />
                {drawingPoints.map((point, index) => (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={3 / view.zoom}
                    fill="#3b82f6"
                    opacity={0.6}
                  />
                ))}
                {/* Snap indicator - shows when near start point */}
                {isNearStart && drawingPoints.length >= 4 && (
                  <g>
                    {/* Pulsing ring around start point */}
                    <circle
                      cx={drawingPoints[0].x}
                      cy={drawingPoints[0].y}
                      r={12 / view.zoom}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={2.5 / view.zoom}
                      opacity={0.8}
                    />
                    <circle
                      cx={drawingPoints[0].x}
                      cy={drawingPoints[0].y}
                      r={18 / view.zoom}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={1.5 / view.zoom}
                      opacity={0.4}
                    />
                    {/* Connecting line preview */}
                    <line
                      x1={drawingPoints[drawingPoints.length - 1].x}
                      y1={drawingPoints[drawingPoints.length - 1].y}
                      x2={drawingPoints[0].x}
                      y2={drawingPoints[0].y}
                      stroke="#22c55e"
                      strokeWidth={2 / view.zoom}
                      strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
                      opacity={0.6}
                    />
                  </g>
                )}
              </>
            )}

            {activeTool === 'line' && drawingPoints.length >= 1 && (
              <>
                {/* Line preview - just first and last point */}
                <line
                  x1={drawingPoints[0].x}
                  y1={drawingPoints[0].y}
                  x2={drawingPoints[drawingPoints.length - 1].x}
                  y2={drawingPoints[drawingPoints.length - 1].y}
                  stroke="#3b82f6"
                  strokeWidth={2 / view.zoom}
                  opacity={0.6}
                />
                <circle
                  cx={drawingPoints[0].x}
                  cy={drawingPoints[0].y}
                  r={5 / view.zoom}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth={2 / view.zoom}
                />
                <circle
                  cx={drawingPoints[drawingPoints.length - 1].x}
                  cy={drawingPoints[drawingPoints.length - 1].y}
                  r={5 / view.zoom}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth={2 / view.zoom}
                />
              </>
            )}

            {activeTool === 'circle' && drawingPoints.length >= 1 && (() => {
              // Full circle detected - green circle with center dot
              if (isCircleClosed && drawnCircleArc) {
                return (
                  <>
                    <circle
                      cx={drawnCircleArc.xc}
                      cy={drawnCircleArc.yc}
                      r={drawnCircleArc.r}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth={2.5 / view.zoom}
                      opacity={0.8}
                    />
                    <circle
                      cx={drawnCircleArc.xc}
                      cy={drawnCircleArc.yc}
                      r={3 / view.zoom}
                      fill="#22c55e"
                      opacity={0.6}
                    />
                  </>
                )
              }

              // Compute the arc to display — either from recognized state or by fitting raw points
              const arc = drawnCircleArc ?? (() => {
                if (drawingPoints.length < 3) return null
                const [p0, p1, p2] = threeArcPointsFromNoisyPoints(drawingPoints)
                return circleArcFromThreePoints(p0, p1, p2)
              })()

              if (!arc) return null

              const start = drawingPoints[0]
              const end = drawingPoints[drawingPoints.length - 1]
              const largeArcFlag = (() => {
                let sweep = arc.endAngle - arc.startAngle
                if (arc.counterclockwise) {
                  // CCW: angles decrease; if sweep is positive, we go the long way
                  if (sweep > 0) sweep -= 2 * Math.PI
                } else {
                  // CW: angles increase; if sweep is negative, we go the long way
                  if (sweep < 0) sweep += 2 * Math.PI
                }
                return Math.abs(sweep) > Math.PI ? 1 : 0
              })()
              const sweepFlag = arc.counterclockwise ? 0 : 1

              return (
                <path
                  d={`M ${start.x} ${start.y} A ${arc.r} ${arc.r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2 / view.zoom}
                  opacity={0.6}
                />
              )
            })()}

            {(activeTool === 'spiral' || activeTool === 'rational-spiral' || activeTool === 'complex-spiral') && drawingPoints.length >= 1 && (
              <>
                {/* Spiral preview: line from start to current drag position */}
                <line
                  x1={drawingPoints[0].x}
                  y1={drawingPoints[0].y}
                  x2={drawingPoints[drawingPoints.length - 1].x}
                  y2={drawingPoints[drawingPoints.length - 1].y}
                  stroke="#3b82f6"
                  strokeWidth={2 / view.zoom}
                  opacity={0.6}
                />
                <circle
                  cx={drawingPoints[0].x}
                  cy={drawingPoints[0].y}
                  r={5 / view.zoom}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth={2 / view.zoom}
                />
                <circle
                  cx={drawingPoints[drawingPoints.length - 1].x}
                  cy={drawingPoints[drawingPoints.length - 1].y}
                  r={5 / view.zoom}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth={2 / view.zoom}
                />
              </>
            )}
          </g>
        )}

        {/* Offset preview polyline */}
        {action === 'creating-offset' && offsetPreviewPolyline && offsetPreviewPolyline.length > 1 && (
          <polyline
            points={offsetPreviewPolyline.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2 / view.zoom}
            opacity={0.8}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Region-smoothing preview: faired curve + amber movable arc + free CPs */}
        {smoothOverlay && (
          <g style={{ pointerEvents: 'none' }}>
            <path d={smoothOverlay.fullPath} fill="none" stroke="#2563eb" strokeWidth={3 / view.zoom} />
            {smoothOverlay.arcPath && (
              <path d={smoothOverlay.arcPath} fill="none" stroke="#f59e0b" strokeWidth={4.5 / view.zoom} opacity={0.9} />
            )}
            {smoothOverlay.cps.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={(p.free ? 6 : 4) / view.zoom}
                fill={p.free ? '#1d4ed8' : '#94a3b8'}
                stroke="white"
                strokeWidth={1.5 / view.zoom}
                opacity={p.free ? 1 : 0.55}
              />
            ))}
            {/* live curvature extrema on the preview — watch them collide as you slide
                (same amber as the normal extrema markers) */}
            {smoothOverlay.extrema.map((p, i) => (
              <g key={`se-${i}`}>
                <circle cx={p.x} cy={p.y} r={8 / view.zoom} fill="none" stroke="#f59e0b" strokeWidth={2.5 / view.zoom} />
                <circle cx={p.x} cy={p.y} r={5 / view.zoom} fill="rgba(245, 158, 11, 0.4)" />
              </g>
            ))}
          </g>
        )}

        {svgOverlay}
      </g>

      {/* Hint text (centered, not transformed) */}
      {showHint && curves.length === 0 && !isDrawing && (
        <text
          x={dimensions.width / 2}
          y={dimensions.height / 2}
          textAnchor="middle"
          className="fill-gray-400 dark:fill-gray-600 text-lg pointer-events-none select-none"
          style={{ fontFamily: 'system-ui, sans-serif' }}
        >
          {t('hints.touchToDraw')}
        </text>
      )}
    </svg>
  )
}
