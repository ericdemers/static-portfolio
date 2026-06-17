import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Canvas, useThree } from '@react-three/fiber'
import { TrackballControls } from '@react-three/drei'
import { useSceneStore } from '../store/sceneStore'
import SketcherCanvas from '../components/SketcherCanvas'
import { DEMO_CONFIG } from '../types/canvas'
import { createComplexRationalPHFromTwoPoints } from '../optimizer/complexRationalPHCurve'
import { computeOpenComplexCurvatureExtremaParameters } from '../optimizer/complexAlgebra'
import { evaluateCurve } from '../utils/bspline/core'
import RevolutionSurface, { type MeridianSample } from '../lab/lieSphere/RevolutionSurface'
import {
  type Mat6,
  type Vec3,
  compose6,
  identity6,
  inversionInSphere6,
} from '../lab/lieSphere/lieTransform'
import { SHAPE_GENERATORS, liePoint, type GeneratorGroup } from '../lab/lieSphere/lieAlgebra'
import { materializeLieSurface, type MeridianEval, type SurfaceNurbs } from '../lab/lieSphere/materialize'
import ControlNet from '../lab/lieSphere/ControlNet'
import type { Curve, ComplexPoint } from '../types/curve'

const GROUP_LABELS: Record<GeneratorGroup, string> = {
  conformal: 'Conformal (inversive)',
  laguerre: 'Laguerre',
  lie: 'Lie mix',
}
const GROUP_ORDER: GeneratorGroup[] = ['conformal', 'laguerre', 'lie']
// Per-group slider half-range. The inversive (conformal) and Lie-mix generators
// are strong — a small coefficient already distorts the surface a lot — so give
// them a tighter range for gentler, finer control; Laguerre keeps the full ±1.
const GROUP_RANGE: Record<GeneratorGroup, number> = { conformal: 0.3, laguerre: 1, lie: 0.3 }

const MERIDIAN_CURVE_ID = 'lie-sphere-meridian'
const MERIDIAN_SAMPLES = 200
// Editor world units → 3D world units. The 2D sketcher works at ~hundreds of
// pixels; the 3D camera at ~unit scale. Divide samples by SCALE before passing
// to the revolution view.
const SCALE = 200

const meridianConfig = {
  ...DEMO_CONFIG,
  showRightMenu: false,
  showBottomBar: false,
  showBottomPanel: false,
  showHamburger: false,
  showPencilTool: false,
  alwaysSelected: true,
  showControlPolygon: true,
  hidePolygonOnDeselect: true, // clicking empty space hides the polygon
  allowDrawing: false,
  allowSelection: true,
}

/**
 * Frame the camera to fit the surface, ONCE, when its position first becomes
 * available (`ready` flips false→true). Sets up = +Z so the revolution axis is
 * vertical, matching the PH curve's z-up in the 2D editor. After the first fit
 * it leaves the camera alone so TrackballControls own it.
 */
function CameraRig({
  position,
  target,
  ready,
}: {
  position: [number, number, number]
  target: [number, number, number]
  ready: boolean
}) {
  const camera = useThree((s) => s.camera)
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    camera.up.set(0, 0, 1)
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(target[0], target[1], target[2])
    camera.updateProjectionMatrix()
  }, [ready, camera, position, target])
  return null
}

export default function LabLieSphere() {
  // Bound/Free curvature-extrema editing. The markers are always shown
  // (panelView 'curvature', set on mount); this toggle controls whether the
  // (S,D) PH optimizer BOUNDS the curvature-extrema count while dragging.
  const preserveCurvatureExtrema = useSceneStore((s) => s.preserveCurvatureExtrema)
  const setPreserveCurvatureExtrema = useSceneStore((s) => s.setPreserveCurvatureExtrema)

  // When launched from the presentation (?return=/talks/cs2026?slide=N), show a
  // "Back to presentation" button that returns to the exact slide.
  const navigate = useNavigate()
  const returnUrl = new URLSearchParams(window.location.search).get('return')

  const [meridian, setMeridian] = useState<MeridianSample[]>([])
  const [ridgeIndices, setRidgeIndices] = useState<number[]>([])
  const [coeffs, setCoeffs] = useState<number[]>(() => new Array(SHAPE_GENERATORS.length).fill(0))
  const [accumulated, setAccumulated] = useState<Mat6>(() => identity6())

  // Initial camera framing, computed ONCE from the first non-empty meridian so
  // the surface fits the view and the revolution axis is vertical (up = +Z,
  // matching the PH curve's z-up in the 2D editor). Frozen after first fit so
  // dragging the curve doesn't yank the camera. Depend on the false→true
  // transition only (a stable boolean, so the deps entry isn't an expression).
  const meridianReady = meridian.length > 0
  const cameraInit = useMemo(() => {
    let rMax = 0, zMin = Infinity, zMax = -Infinity
    for (const m of meridian) {
      rMax = Math.max(rMax, Math.abs(m.r))
      zMin = Math.min(zMin, m.z)
      zMax = Math.max(zMax, m.z)
    }
    if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) {
      return { position: [2.4, -2.4, 1.4] as [number, number, number], target: [0, 0, 0] as [number, number, number] }
    }
    const zMid = (zMin + zMax) / 2
    // Fit radius covers the cylinder (radial extent rMax, axial half-height).
    const fitR = Math.max(rMax, (zMax - zMin) / 2, 0.5)
    const dist = fitR * 3.2 // pull back so it comfortably fills the frame
    // 3/4 view: in front (-Y), slightly to the side (+X), slightly above (+Z).
    return {
      position: [dist * 0.55, -dist * 0.78, zMid + dist * 0.35] as [number, number, number],
      target: [0, 0, zMid] as [number, number, number],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meridianReady])

  const transform = useMemo<Mat6>(
    () => compose6(liePoint(coeffs), accumulated),
    [coeffs, accumulated],
  )

  const [nurbs, setNurbs] = useState<SurfaceNurbs | null>(null)

  const setCoeff = (i: number, v: number) =>
    setCoeffs((c) => c.map((x, k) => (k === i ? v : x)))
  const applyTransform = () => {
    setAccumulated((m) => compose6(liePoint(coeffs), m))
    setCoeffs(new Array(SHAPE_GENERATORS.length).fill(0))
  }
  const invert = () =>
    setAccumulated((m) => compose6(inversionInSphere6([1.5, 0, 0] as Vec3, 1.2), m))
  const resetTransform = () => {
    setAccumulated(identity6())
    setCoeffs(new Array(SHAPE_GENERATORS.length).fill(0))
    setNurbs(null)
  }

  // Materialize the transformed surface as an exact rational NURBS. The
  // materialize API is representation-agnostic: feed it a meridian evaluator
  // (point + planar normal vs normalized u) built from the stored (S,D) PH
  // curve. The fit recovers the exact coefficients at the surface's true
  // u-degree (detected by the residual drop).
  const materialize = () => {
    const curve = useSceneStore.getState().curves.find((c) => c.id === MERIDIAN_CURVE_ID)
    if (!curve || curve.kind !== 'complex-rational') return
    const knots = curve.knots
    const tMin = knots[curve.degree]
    const tMax = knots[knots.length - 1 - curve.degree]
    const span = tMax - tMin
    if (span <= 0) return
    const h = span * 1e-4
    const evalAt = (t: number) => evaluateCurve(curve, Math.min(tMax, Math.max(tMin, t)))
    const merid: MeridianEval = (u) => {
      const t = tMin + u * span
      const p = evalAt(t)
      const pa = evalAt(t - h), pb = evalAt(t + h)
      const tx = pb.x - pa.x, ty = pb.y - pa.y
      const sp = Math.hypot(tx, ty) || 1
      return { X: p.x, Y: p.y, nx: -ty / sp, ny: tx / sp }
    }
    setNurbs(materializeLieSurface(merid, transform, SCALE))
  }

  // Initialize the meridian curve in sceneStore on mount. (S,D) parameterized
  // PH curve — PH by construction, so dragging with the curvature-extrema
  // bound enabled keeps the count monotone while staying exactly PH.
  useEffect(() => {
    const phResult = createComplexRationalPHFromTwoPoints(SCALE, -SCALE, SCALE, SCALE)
    const curve: Curve = {
      id: MERIDIAN_CURVE_ID,
      kind: 'complex-rational',
      degree: phResult.degree,
      knots: phResult.knots,
      controlPoints: phResult.controlPoints,
      closed: false,
    }

    useSceneStore.setState((state) => {
      const newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.set(MERIDIAN_CURVE_ID, phResult.metadata)
      return {
        curves: [curve],
        selectedCurveId: MERIDIAN_CURVE_ID,
        selectedControlPointIndex: null,
        phMetadata: newPhMetadata,
        showHint: false,
        symmetryMaps: null,
        // Always display the curvature-extrema markers on the meridian: the
        // 'curvature' panel view makes SketcherCanvas draw them regardless of
        // the (separate) preserve/bound toggle. These are the same κ′ zeros
        // shown as 3D ridge rings on the surface.
        panelView: 'curvature',
      }
    })

    return () => {
      useSceneStore.setState({
        curves: [],
        selectedCurveId: null,
        selectedControlPointIndex: null,
        phMetadata: new Map(),
        showHint: true,
        panelView: null,
        preserveCurvatureExtrema: false, // don't leak Bound state to the main app
      })
    }
  }, [])

  // Subscribe to curve changes, resample the meridian (point + planar normal),
  // and find ridges (curvature extrema). Representation-agnostic: samples the
  // stored curve directly via evaluateCurve, so it works for any open
  // complex-rational curve (here the (S,D) PH meridian).
  useEffect(() => {
    const update = () => {
      const state = useSceneStore.getState()
      const curve = state.curves.find((c) => c.id === MERIDIAN_CURVE_ID)
      if (!curve || curve.kind !== 'complex-rational') return

      const knots = curve.knots
      const tMin = knots[curve.degree]
      const tMax = knots[knots.length - 1 - curve.degree]
      if (tMax <= tMin) return
      const span = tMax - tMin

      // Sample point + a finite-difference unit normal (left normal of the
      // tangent). FD is fine for display and is representation-agnostic.
      const evalAt = (t: number) => evaluateCurve(curve, Math.min(tMax, Math.max(tMin, t)))
      const h = span * 1e-4
      const m: MeridianSample[] = []
      for (let i = 0; i <= MERIDIAN_SAMPLES; i++) {
        const t = tMin + (i / MERIDIAN_SAMPLES) * span
        const p = evalAt(t)
        const pa = evalAt(t - h)
        const pb = evalAt(t + h)
        const tx = pb.x - pa.x, ty = pb.y - pa.y
        const sp = Math.hypot(tx, ty) || 1
        m.push({ r: Math.max(0, p.x) / SCALE, z: p.y / SCALE, nr: -ty / sp, nz: tx / sp })
      }
      setMeridian(m)

      // Ridge rings = curvature extrema = zeros of g(t). Compute from the
      // curve's homogeneous (Z = pos·weight, W = weight) coefficients.
      const cps = curve.controlPoints as ComplexPoint[]
      const Zre: number[] = [], Zim: number[] = [], Wre: number[] = [], Wim: number[] = []
      for (const cp of cps) {
        Zre.push(cp.re * cp.w_re - cp.im * cp.w_im)
        Zim.push(cp.re * cp.w_im + cp.im * cp.w_re)
        Wre.push(cp.w_re); Wim.push(cp.w_im)
      }
      let ridgeTs: number[] = []
      try {
        ridgeTs = computeOpenComplexCurvatureExtremaParameters(curve.knots, Zre, Zim, Wre, Wim)
      } catch {
        ridgeTs = []
      }
      const idxs: number[] = []
      for (const t of ridgeTs) {
        if (t >= tMin && t <= tMax) idxs.push(((t - tMin) / span) * MERIDIAN_SAMPLES)
      }
      setRidgeIndices(idxs)
    }

    update()
    const unsub = useSceneStore.subscribe(update)
    return unsub
  }, [])

  return (
    <div className="h-screen flex flex-col bg-steelblue-900 bg-gradient-to-br from-steelblue-900 to-steelblue-200">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-800">
        {returnUrl ? (
          <button
            type="button"
            onClick={() => navigate(returnUrl)}
            className="text-sm px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            ← Back to presentation
          </button>
        ) : (
          <Link
            to="/lab"
            className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400"
          >
            Lab
          </Link>
        )}
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Lie Sphere Workbench
        </h1>
        <span className="text-xs text-gray-500 dark:text-gray-500 italic">
          stage 2 — + live Lie sphere transforms (exp of o(4,2))
        </span>
        <span className="ml-auto text-xs text-gray-600 dark:text-gray-400">
          ridges: <span className="font-mono">{ridgeIndices.length}</span>
        </span>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 min-h-0">
        <div className="bg-white dark:bg-gray-950 relative min-h-0">
          <SketcherCanvas config={meridianConfig} />
          <div className="absolute top-2 left-2 flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-2 bg-white/85 dark:bg-gray-950/85 px-2 py-1 rounded cursor-pointer text-gray-700 dark:text-gray-300 backdrop-blur">
              <input
                type="checkbox"
                checked={preserveCurvatureExtrema}
                onChange={(e) => setPreserveCurvatureExtrema(e.target.checked)}
              />
              <span>
                {preserveCurvatureExtrema ? 'Bound' : 'Free'} curvature extrema
                <span className="ml-1 font-mono text-amber-500">({ridgeIndices.length})</span>
              </span>
            </label>
            <span className="text-gray-500 dark:text-gray-500 italic bg-white/70 dark:bg-gray-950/70 px-2 py-1 rounded pointer-events-none">
              meridian (drag CPs) · vertical line ≡ axis of revolution
            </span>
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-gray-900 min-h-0 relative">
          <Canvas camera={{ position: cameraInit.position, fov: 40, up: [0, 0, 1] }}>
            <CameraRig
              position={cameraInit.position}
              target={cameraInit.target}
              ready={meridian.length > 0}
            />
            <ambientLight intensity={0.45} />
            <directionalLight position={[3, 4, 5]} intensity={0.8} />
            <directionalLight position={[-3, -2, -3]} intensity={0.3} />
            {/* Display-only 180° ROTATION about the horizontal X axis through the
                surface centre (z = zMid). The surface is built z-up but the 2D
                meridian editor is Y-down, so without this it reads upside-down vs
                the curve. A rotation (not a z-reflection) leaves the surface math
                and its handedness untouched under Lie transforms. Pivot at the
                centre (nested translate/rotate/translate) so the camera stays
                framed. */}
            <group position={[0, 0, cameraInit.target[2]]} rotation-x={Math.PI}>
              <group position={[0, 0, -cameraInit.target[2]]}>
                {meridian.length > 0 && (
                  <RevolutionSurface
                    meridian={meridian}
                    ridgeIndices={ridgeIndices}
                    transform={transform}
                  />
                )}
                {nurbs && <ControlNet nurbs={nurbs} />}
              </group>
            </group>
            <TrackballControls target={cameraInit.target} />
          </Canvas>

          <div className="absolute top-2 left-2 w-60 max-h-[calc(100%-1rem)] overflow-auto flex flex-col gap-2 bg-white/85 dark:bg-gray-950/85 px-3 py-2 rounded text-xs text-gray-700 dark:text-gray-300 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Lie transform</span>
              <span className="font-mono text-gray-400">exp(Σ sᵢXᵢ)</span>
            </div>
            {GROUP_ORDER.map((grp) => (
              <div key={grp} className="flex flex-col gap-1">
                <span className="uppercase text-[10px] tracking-wide text-gray-400">
                  {GROUP_LABELS[grp]}
                </span>
                {SHAPE_GENERATORS.map((g, i) =>
                  g.group === grp ? (
                    <label key={g.key} className="flex items-center gap-2">
                      <span className="w-24 truncate">{g.label}</span>
                      <input
                        type="range"
                        min={-GROUP_RANGE[grp]}
                        max={GROUP_RANGE[grp]}
                        step={GROUP_RANGE[grp] / 50}
                        value={coeffs[i]}
                        onChange={(e) => setCoeff(i, parseFloat(e.target.value))}
                        className="flex-1 min-w-0"
                      />
                      <span className="font-mono w-9 text-right">{coeffs[i].toFixed(2)}</span>
                    </label>
                  ) : null,
                )}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={applyTransform}
                className="px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={invert}
                className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Invert
              </button>
              <button
                type="button"
                onClick={resetTransform}
                className="px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Reset
              </button>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={materialize}
                className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600"
              >
                Materialize NURBS
              </button>
              {nurbs && (
                <button
                  type="button"
                  onClick={() => setNurbs(null)}
                  className="text-blue-500 hover:text-blue-600 dark:text-blue-400"
                >
                  hide
                </button>
              )}
            </div>
            {nurbs && (
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                control net · degree ({nurbs.degU}, {nurbs.degV}) ·{' '}
                {nurbs.exact ? 'exact' : 'best-fit'} · 4 patches
              </span>
            )}
          </div>

          <div className="absolute bottom-2 right-3 text-xs text-gray-500 dark:text-gray-500 italic pointer-events-none">
            drag to rotate · scroll to zoom
          </div>
        </div>
      </div>
    </div>
  )
}
