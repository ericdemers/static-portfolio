// 2D PH Curvature Workbench — a non-rational (polynomial) Pythagorean-hodograph
// quintic edited with the full sketcher (control points, real-time PH-preserving
// dragging), plus a curvature display (κ vs t, like the sketcher's) that shows a
// minimum-turning-radius bound ±κ_max and the distance to it. The bound is
// visualised, not (yet) enforced — dragging keeps the curve PH via the sketcher
// engine; we just measure how much curvature margin remains.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../i18n' // SketcherCanvas uses react-i18next
import { useSceneStore } from '../store/sceneStore'
import SketcherCanvas from '../components/SketcherCanvas'
import type { CanvasConfig } from '../types/canvas'
import type { Curve } from '../types/curve'
import { createSpiralFromTwoPoints } from '../optimizer/phCurve'
import { snapPHCurveToCurvatureBound } from '../optimizer'
import { phCurvatureMargin } from '../optimizer/phCurvatureBound'
import { curvatureComb } from '../utils/curvature'

const CURVE_ID = 'ph2d-curve'
const SAMPLES = 240

// Sketcher chrome stripped: control points + dragging only, no menus/bars/panel
// (we render our own curvature panel below).
const config: CanvasConfig = {
  mode: 'demo',
  showHamburger: false,
  showPencilTool: false,
  showRightMenu: false,
  showBottomBar: false,
  showBottomPanel: false,
  allowDrawing: false,
  allowSelection: true,
  alwaysSelected: true,
  showControlPolygon: true,
  hidePolygonOnDeselect: true,
}

interface CurvatureData {
  curvatures: number[]
  peak: number
  arcLength: number
}

// ---------------------------------------------------------------------------
// Curvature display — κ(t) plot with the ±κ_max bound and the distance to it.
// Same plot idea as the sketcher's CurvaturePanel (κ centred at mid-height),
// with the bound drawn in and over-bound spans in red.
// ---------------------------------------------------------------------------
function CurvaturePlot({ data, kappaMax }: { data: CurvatureData; kappaMax: number }) {
  const { curvatures } = data
  const W = 800
  const H = 170
  const pad = { left: 48, right: 14, top: 14, bottom: 22 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const midY = pad.top + plotH / 2

  const peakAbs = curvatures.reduce((m, k) => Math.max(m, Math.abs(k)), 0)
  const span = Math.max(peakAbs, kappaMax) * 1.15 || 1
  const yOf = (k: number) => midY - (k / span) * (plotH / 2)
  const xOf = (i: number) => pad.left + (i / (curvatures.length - 1)) * plotW

  // Per-segment κ polyline, red where over the bound.
  const segments = curvatures.slice(1).map((k, i) => {
    const k0 = curvatures[i]
    const over = Math.abs(k0) > kappaMax || Math.abs(k) > kappaMax
    return { x1: xOf(i), y1: yOf(k0), x2: xOf(i + 1), y2: yOf(k), over }
  })

  // Distance to the bound: smallest clearance κ_max − |κ| over the curve.
  const clearance = curvatures.reduce((m, k) => Math.min(m, kappaMax - Math.abs(k)), Infinity)
  const inBound = clearance >= 0

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-200">Curvature κ(t)</span>
        <span className={`font-mono ${inBound ? 'text-emerald-500' : 'text-red-500'}`}>
          {inBound
            ? `clearance to bound: ${clearance.toFixed(4)}`
            : `over bound by: ${(-clearance).toFixed(4)}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
        {/* zero axis */}
        <line x1={pad.left} y1={yOf(0)} x2={W - pad.right} y2={yOf(0)} stroke="#9ca3af" strokeWidth={0.5} />
        {/* ±κ_max bound lines */}
        {[kappaMax, -kappaMax].map((b) => (
          <line
            key={b}
            x1={pad.left}
            y1={yOf(b)}
            x2={W - pad.right}
            y2={yOf(b)}
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="5 4"
          />
        ))}
        <text x={pad.left - 6} y={yOf(kappaMax) + 3} textAnchor="end" fontSize={10} fill="#ef4444">
          +κmax
        </text>
        <text x={pad.left - 6} y={yOf(-kappaMax) + 3} textAnchor="end" fontSize={10} fill="#ef4444">
          −κmax
        </text>
        {/* κ curve, red where over the bound */}
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={s.over ? '#ef4444' : '#2563eb'}
            strokeWidth={s.over ? 2.5 : 1.8}
          />
        ))}
        <text x={pad.left} y={H - 6} fontSize={10} fill="#9ca3af">t = 0</text>
        <text x={W - pad.right} y={H - 6} textAnchor="end" fontSize={10} fill="#9ca3af">t = 1</text>
      </svg>
    </div>
  )
}

const DEFAULT_RMIN = 140 // canvas units

/** (Re)create the default PH spiral in the scene store. */
function installPH2DCurve() {
  const ph = createSpiralFromTwoPoints(-180, 60, 180, 60)
  const curve: Curve = {
    id: CURVE_ID,
    kind: 'bspline',
    degree: ph.degree,
    knots: ph.knots,
    controlPoints: ph.controlPoints,
    closed: false,
  }
  useSceneStore.setState((state) => {
    const phMetadata = new Map(state.phMetadata)
    phMetadata.set(CURVE_ID, ph.metadata)
    return {
      curves: [curve],
      selectedCurveId: CURVE_ID,
      selectedControlPointIndex: null,
      phMetadata,
      showHint: false,
      panelView: null,
    }
  })
}

// ---------------------------------------------------------------------------
// Lab page
// ---------------------------------------------------------------------------
export default function LabPH2D() {
  // Minimum turning radius (canvas units). κ_max = 1 / R.
  const [rMin, setRMin] = useState(DEFAULT_RMIN)
  const kappaMax = 1 / rMin
  const [data, setData] = useState<CurvatureData>({ curvatures: [], peak: 0, arcLength: 0 })

  const boundActive = useSceneStore((s) => s.boundCurvatureValue)
  const setBoundCurvatureValue = useSceneStore((s) => s.setBoundCurvatureValue)
  const setCurvatureBound = useSceneStore((s) => s.setCurvatureBound)

  // Keep the store's live bound in sync so moveControlPoint enforces κ ≤ κ_max
  // during dragging.
  useEffect(() => {
    setCurvatureBound(kappaMax)
  }, [kappaMax, setCurvatureBound])

  // Project the current curve to STRICTLY inside |κ| ≤ km if needed (the IP
  // barrier needs a strictly-feasible start — landing exactly on the boundary
  // freezes the next drag). We snap to a slightly tighter bound (1−δ)·km so the
  // curve sits just inside; live constrained dragging can then push it right up
  // to the real km. Called on bound-enable and slider-tighten.
  const SNAP_BUFFER = 0.03
  const snapToFeasible = (km: number) => {
    const st = useSceneStore.getState()
    const curve = st.curves.find((c) => c.id === CURVE_ID)
    const meta = st.phMetadata.get(CURVE_ID)
    if (!curve || curve.kind !== 'bspline' || !meta || meta.kind !== 'polynomial') return
    const kmSnap = km * (1 - SNAP_BUFFER)
    // Already strictly inside the (tighter) bound? Nothing to do.
    if (phCurvatureMargin(meta.uControlPoints, meta.vControlPoints, meta.uvKnots, kmSnap, 2) >= 0) return
    const res = snapPHCurveToCurvatureBound(meta, curve.controlPoints, kmSnap, 2)
    useSceneStore.setState((state) => {
      const phMetadata = new Map(state.phMetadata)
      phMetadata.set(CURVE_ID, res.curveResult.metadata)
      return {
        curves: state.curves.map((c) =>
          c.id === CURVE_ID
            ? ({ ...c, controlPoints: res.curveResult.controlPoints, knots: res.curveResult.knots, degree: res.curveResult.degree } as Curve)
            : c,
        ),
        phMetadata,
      }
    })
  }

  const toggleBound = (next: boolean) => {
    setBoundCurvatureValue(next)
    if (next) snapToFeasible(kappaMax)
  }
  const onRadiusRelease = () => {
    if (boundActive) snapToFeasible(1 / rMin)
  }

  const reset = () => {
    setRMin(DEFAULT_RMIN)
    installPH2DCurve()
    if (boundActive) snapToFeasible(1 / DEFAULT_RMIN)
  }

  // Create the PH curve in the store on mount (bound on by default); clean up on
  // unmount.
  useEffect(() => {
    installPH2DCurve()
    setBoundCurvatureValue(true)
    return () => {
      useSceneStore.setState({
        curves: [],
        selectedCurveId: null,
        selectedControlPointIndex: null,
        phMetadata: new Map(),
        showHint: true,
        panelView: null,
        boundCurvatureValue: false, // don't leak the bound into the main app
        curvatureBound: Infinity,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute the curvature profile whenever the curve changes.
  useEffect(() => {
    const update = () => {
      const curve = useSceneStore.getState().curves.find((c) => c.id === CURVE_ID)
      if (!curve || curve.kind !== 'bspline') return
      const comb = curvatureComb(curve, SAMPLES, 1)
      const curvatures = comb.map((d) => d.curvature)
      const peak = curvatures.reduce((m, k) => Math.max(m, Math.abs(k)), 0)
      // Arc length ≈ Σ |Δpoint| over the sampled curve points.
      let arcLength = 0
      for (let i = 1; i < comb.length; i++) {
        arcLength += Math.hypot(comb[i].base.x - comb[i - 1].base.x, comb[i].base.y - comb[i - 1].base.y)
      }
      setData({ curvatures, peak, arcLength })
    }
    update()
    return useSceneStore.subscribe(update)
  }, [])

  const peakRadius = data.peak > 1e-9 ? 1 / data.peak : Infinity

  const stat = (label: string, value: string, accent?: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-mono ${accent ?? 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-steelblue-900 to-steelblue-200">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        <Link to="/lab" className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400">
          Lab
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          2D PH Curvature Workbench
        </h1>
        <span className="text-xs text-gray-500 italic">
          polynomial Pythagorean-hodograph quintic · curvature display with a turning-radius bound
        </span>
      </header>

      <div className="flex-1 relative min-h-0">
        <SketcherCanvas config={config} />

        <div className="absolute top-3 left-3 w-72 flex flex-col gap-3 bg-white/90 dark:bg-gray-950/90 px-4 py-3 rounded-lg text-xs text-gray-700 dark:text-gray-300 backdrop-blur shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">Minimum turning radius</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">R = {rMin.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={20}
              max={400}
              step={1}
              value={rMin}
              onChange={(e) => setRMin(parseFloat(e.target.value))}
              onMouseUp={onRadiusRelease}
              onTouchEnd={onRadiusRelease}
              className="w-full"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              κ<sub>max</sub> = 1/R = <span className="font-mono">{kappaMax.toFixed(4)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 pt-2 border-t border-gray-200 dark:border-gray-800">
            {stat('Arc length', data.arcLength.toFixed(1))}
            {stat(
              'Peak |curvature|',
              data.peak.toFixed(4),
              data.peak > kappaMax ? 'text-red-500' : 'text-emerald-500',
            )}
            {stat('Tightest radius', Number.isFinite(peakRadius) ? peakRadius.toFixed(1) : '∞')}
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={boundActive}
                onChange={(e) => toggleBound(e.target.checked)}
              />
              <span className="font-semibold">
                {boundActive ? 'Bounding' : 'Free'} curvature (|κ| ≤ κ<sub>max</sub>)
              </span>
            </label>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {boundActive
                ? 'live — dragging cannot exceed the limit'
                : 'off — drag freely; red shows where it is over the limit'}
            </div>
          </div>

          <div className="flex">
            <button
              type="button"
              onClick={reset}
              className="px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Reset
            </button>
          </div>

          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed pt-1">
            Drag the control points — the curve re-solves to stay a true PH curve.
            The curvature plot below shows κ(t) against the ±κ<sub>max</sub> bound;
            spans over the limit are red, and the readout shows the clearance (or
            how far over). Turn on <span className="font-semibold">Bounding curvature</span>{' '}
            and dragging can never exceed the limit.
          </p>
        </div>
      </div>

      <CurvaturePlot data={data} kappaMax={kappaMax} />
    </div>
  )
}
