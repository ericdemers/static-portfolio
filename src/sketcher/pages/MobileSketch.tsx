// @ts-nocheck — uses the imported Sketcher engine (store + canvas).
// A deliberately tiny editor for phones: draw a degree-3 B-spline with your
// finger, move its control points, and toggle the curvature-extrema bound.
// Nothing else. Reuses SketcherCanvas (with chrome stripped via config) and the
// scene store; the freehand 'draw' tool already fits a degree-3 B-spline.
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import '../i18n' // SketcherCanvas uses react-i18next; init it (we bypass ../index)
import { useSceneStore } from '../store/sceneStore'
import SketcherCanvas from '../components/SketcherCanvas'
import type { CanvasConfig } from '../types/canvas'
import { curvatureExtremaNumeratorPlanar, curvatureExtremaNumeratorPlanarPeriodic } from '../../core'

// Strip all chrome; SketcherCanvas reads allowDrawing/allowSelection +
// the control-polygon flags. The page renders no menus/bars at all.
const mobileConfig: CanvasConfig = {
  mode: 'sketcher',
  allowDrawing: true,
  allowSelection: true,
  showControlPolygon: true,
  hidePolygonOnDeselect: true,
  controlPointHitRadius: 28, // finger-sized grab target (desktop default is 15)
  alwaysShowCurvatureExtrema: true, // markers stay on for any selected curve,
  // including 'Extrema: free' — the extrema are the point of the mobile editor.
}

export default function MobileSketch() {
  const activeTool = useSceneStore((s) => s.activeTool)
  const setActiveTool = useSceneStore((s) => s.setActiveTool)
  const setToolLocked = useSceneStore((s) => s.setToolLocked)
  const preserve = useSceneStore((s) => s.preserveCurvatureExtrema)
  const setPreserve = useSceneStore((s) => s.setPreserveCurvatureExtrema)
  const clearAll = useSceneStore((s) => s.clearAll)
  const deleteCurve = useSceneStore((s) => s.deleteCurve)
  const curves = useSceneStore((s) => s.curves)
  const selectedCurveId = useSceneStore((s) => s.selectedCurveId)

  const drawing = activeTool === 'draw'

  // The curvature-extrema bound S⁻: the number of sign changes of g's Bernstein
  // coefficients — an upper bound on the curve's curvature extrema, and the
  // quantity the 'ipopt' solver keeps from increasing. Recomputed live so it
  // ticks down as extrema annihilate while dragging.
  const boundS = useMemo(() => {
    const c = curves.find((x) => x.id === selectedCurveId)
    if (!c || c.kind !== 'bspline') return null
    try {
      const x = c.controlPoints.map((p) => p.x)
      const y = c.controlPoints.map((p) => p.y)
      const g = c.closed
        ? curvatureExtremaNumeratorPlanarPeriodic(x, y, c.knots, c.degree)
        : curvatureExtremaNumeratorPlanar(x, y, c.knots, c.degree)
      return g.signChanges()
    } catch {
      return null
    }
  }, [curves, selectedCurveId])

  // Draw mode: keep the 'draw' tool locked so every finger stroke makes a new
  // degree-3 curve. Edit mode ('none'): a finger drags control points instead.
  const enterDraw = () => {
    setActiveTool('draw')
    setToolLocked(true)
  }
  const enterEdit = () => setActiveTool('none')

  // Start in draw mode with the curvature-extrema bound ON. Reset the shared
  // store on the way out so nothing leaks into /sketcher.
  useEffect(() => {
    setPreserve(true)
    enterDraw()

    // Lock the page so iOS Safari can't rubber-band / scroll the canvas while a
    // finger is drawing (that scroll cancels the stroke). Restored on exit.
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyTouch: body.style.touchAction,
    }
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    body.style.touchAction = 'none'

    return () => {
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overflow = prev.bodyOverflow
      body.style.overscrollBehavior = prev.bodyOverscroll
      body.style.touchAction = prev.bodyTouch
      useSceneStore.getState().clearAll()
      setActiveTool('none')
      setPreserve(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const btnBase =
    'h-12 px-5 rounded-full text-base font-medium shadow-lg active:scale-95 transition select-none'

  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none select-none bg-white dark:bg-gray-900">
      <SketcherCanvas config={mobileConfig} />

      {/* Back link — small, unobtrusive */}
      <Link
        to="/"
        className="fixed top-3 left-3 z-40 text-sm text-slate-400 hover:text-slate-600 select-none"
      >
        ← Home
      </Link>

      {/* Curvature-extrema toggle — the headline feature */}
      <button
        type="button"
        onClick={() => setPreserve(!preserve)}
        className={`fixed top-3 right-3 z-40 ${btnBase} ${
          preserve ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
        }`}
      >
        {preserve
          ? `Extrema: bound${boundS !== null ? ` · S = ${boundS}` : ''}`
          : 'Extrema: free'}
      </button>

      {/* Bottom toolbar — thumb-reachable */}
      <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center gap-3 px-4">
        <button
          type="button"
          onClick={() => (drawing ? enterEdit() : enterDraw())}
          className={`${btnBase} ${
            drawing ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
          }`}
        >
          {drawing ? '✏️ Drawing' : '✋ Editing'}
        </button>
        {selectedCurveId && (
          <button
            type="button"
            onClick={() => deleteCurve(selectedCurveId)}
            className={`${btnBase} bg-red-500 text-white`}
          >
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            clearAll()
            enterDraw()
          }}
          className={`${btnBase} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200`}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
