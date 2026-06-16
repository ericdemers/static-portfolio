import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { TrackballControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import {
  analyzePH3D,
  defaultPH3D,
  type PH3DAnalysis,
  type Vec3,
} from '../lab/ph3d/ph3dCurve'
import {
  dragPH3DCurve,
  snapToFeasiblePH3D,
  ph3dCurvatureMargin,
  type PH3DState,
} from '../lab/ph3d/ph3dProblem'

// ---------------------------------------------------------------------------
// Curvature → colour. Blue (straight) → amber (near the limit) → red (over it).
// ---------------------------------------------------------------------------
function curvatureColor(kappa: number, kappaMax: number): [number, number, number] {
  if (kappa > kappaMax) return [0.9, 0.15, 0.15] // over the bound — red
  const t = kappaMax > 0 ? Math.min(1, kappa / kappaMax) : 0
  return [0.1 + 0.9 * t, 0.45 + 0.25 * t, 1 - 0.95 * t] // blue → amber
}

function v3(p: Vec3): [number, number, number] {
  return [p.x, p.y, p.z]
}

/** Fit the camera to the curve once, with +Z up. */
function CameraRig({
  position,
  target,
}: {
  position: [number, number, number]
  target: [number, number, number]
}) {
  const camera = useThree((s) => s.camera)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    camera.up.set(0, 0, 1)
    camera.position.set(...position)
    camera.lookAt(...target)
    camera.updateProjectionMatrix()
  }, [camera, position, target])
  return null
}

// ---------------------------------------------------------------------------
// 3D scene — directly draggable control points
// ---------------------------------------------------------------------------
function Scene({
  analysis,
  kappaMax,
  boundActive,
  stateRef,
  onChange,
  camera,
}: {
  analysis: PH3DAnalysis
  kappaMax: number
  boundActive: boolean
  stateRef: React.MutableRefObject<PH3DState>
  onChange: (next: PH3DState) => void
  camera: { position: [number, number, number]; target: [number, number, number] }
}) {
  const cps = analysis.controlPoints
  const [hover, setHover] = useState<number | null>(null)
  // Index of the control point being dragged — state, only for the highlight.
  const [dragging, setDragging] = useState<number | null>(null)
  const dragRef = useRef<{ index: number; plane: THREE.Plane; anchorCPs: Vec3[] } | null>(null)
  // Ref to TrackballControls so we can disable it SYNCHRONOUSLY at pointer-down,
  // before its own listener turns the press into a rotation (a React-state
  // `enabled` prop updates a render too late and leaves it stuck rotating).
  const controlsRef = useRef<{ enabled: boolean } | null>(null)

  const linePoints = useMemo(() => analysis.points.map(v3), [analysis])
  const lineColors = useMemo(
    () => analysis.curvatureSamples.map((k) => curvatureColor(k, kappaMax)),
    [analysis, kappaMax],
  )

  const camDir = useMemo(() => new THREE.Vector3(), [])

  const onDown = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controlsRef.current) controlsRef.current.enabled = false
    setDragging(i)
    // Drag in the plane through the point, facing the camera.
    e.camera.getWorldDirection(camDir)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camDir.clone(),
      new THREE.Vector3(cps[i].x, cps[i].y, cps[i].z),
    )
    // Anchor the untouched control points to where they are at grab time, so they
    // don't drift as we drag (the dragged point still chases the cursor).
    dragRef.current = { index: i, plane, anchorCPs: cps.map((c) => ({ ...c })) }
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current
    if (!d) return
    e.stopPropagation()
    const hit = new THREE.Vector3()
    if (!e.ray.intersectPlane(d.plane, hit)) return
    // Incremental solve: warm-start from the CURRENT curve and nudge it toward
    // the cursor, holding the other CPs to their grab-start anchors. Small per-
    // tick steps → smooth tracking (matches sceneStore.moveControlPoint). With
    // the bound active, κ ≤ κ_max is a live constraint kept every tick.
    const next = dragPH3DCurve(stateRef.current, d.index, { x: hit.x, y: hit.y, z: hit.z }, {
      anchorCPs: d.anchorCPs,
      bound: boundActive,
      kappaMax,
    })
    onChange(next)
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragRef.current) return
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    dragRef.current = null
    setDragging(null)
    if (controlsRef.current) controlsRef.current.enabled = true
  }

  return (
    <>
      <CameraRig position={camera.position} target={camera.target} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={0.8} />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} />

      {/* The curve, coloured by curvature. */}
      <Line points={linePoints} vertexColors={lineColors} lineWidth={4} />

      {/* Control polygon. */}
      <Line points={cps.map(v3)} color="#9ca3af" lineWidth={1} dashed dashSize={0.03} gapSize={0.02} />

      {/* Directly draggable control points — uniform blue, like the 2D lab; the
          hovered/dragged one just brightens and grows slightly for feedback. */}
      {cps.map((cp, i) => {
        const active = hover === i || dragging === i
        return (
          <mesh
            key={i}
            position={v3(cp)}
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(i)
            }}
            onPointerOut={() => setHover((h) => (h === i ? null : h))}
          >
            <sphereGeometry args={[active ? 0.026 : 0.02, 20, 20]} />
            <meshStandardMaterial color={active ? '#60a5fa' : '#3b82f6'} />
          </mesh>
        )
      })}

      <TrackballControls ref={controlsRef as never} makeDefault target={camera.target} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Bottom graph — curvature κ(t) and torsion τ(t), switchable by tab. Same style
// as the 2D lab's curvature display. Curvature is unsigned in 3D (one-sided,
// single +κ_max bound); torsion is signed (two-sided, display-only).
// ---------------------------------------------------------------------------
function GraphPanel({ analysis, kappaMax }: { analysis: PH3DAnalysis; kappaMax: number }) {
  const [tab, setTab] = useState<'curvature' | 'torsion'>('curvature')
  const W = 800
  const H = 168
  const pad = { left: 48, right: 14, top: 14, bottom: 22 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom

  const values = tab === 'curvature' ? analysis.curvatureSamples : analysis.torsionSamples
  const signed = tab === 'torsion'
  const bound = tab === 'curvature' ? kappaMax : null

  const peakAbs = values.reduce((m, k) => Math.max(m, Math.abs(k)), 0)
  const sp = Math.max(peakAbs, bound ?? 0) * 1.15 || 1
  const xOf = (i: number) => pad.left + (i / (values.length - 1)) * plotW
  const yOf = signed
    ? (k: number) => pad.top + plotH / 2 - (k / sp) * (plotH / 2)
    : (k: number) => pad.top + plotH - (k / sp) * plotH
  const zeroY = signed ? pad.top + plotH / 2 : pad.top + plotH

  const segments = values.slice(1).map((k, i) => {
    const k0 = values[i]
    const over = bound != null && (Math.abs(k0) > bound || Math.abs(k) > bound)
    return { x1: xOf(i), y1: yOf(k0), x2: xOf(i + 1), y2: yOf(k), over }
  })
  const clearance = bound != null ? bound - peakAbs : null

  const tabBtn = (key: 'curvature' | 'torsion', label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`px-2 py-0.5 rounded ${tab === key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <div className="flex gap-1">
          {tabBtn('curvature', 'Curvature κ(t)')}
          {tabBtn('torsion', 'Torsion τ(t)')}
        </div>
        {clearance != null ? (
          <span className={`font-mono ${clearance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {clearance >= 0 ? `clearance to bound: ${clearance.toFixed(3)}` : `over bound by: ${(-clearance).toFixed(3)}`}
          </span>
        ) : (
          <span className="font-mono text-gray-500">max |τ| = {peakAbs.toFixed(3)}</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: H }}>
        <line x1={pad.left} y1={zeroY} x2={W - pad.right} y2={zeroY} stroke="#9ca3af" strokeWidth={0.5} />
        {bound != null &&
          [bound, ...(signed ? [-bound] : [])].map((b) => (
            <line key={b} x1={pad.left} y1={yOf(b)} x2={W - pad.right} y2={yOf(b)} stroke="#ef4444" strokeWidth={1} strokeDasharray="5 4" />
          ))}
        {bound != null && (
          <text x={pad.left - 6} y={yOf(bound) + 3} textAnchor="end" fontSize={10} fill="#ef4444">κmax</text>
        )}
        {segments.map((sg, i) => (
          <line key={i} x1={sg.x1} y1={sg.y1} x2={sg.x2} y2={sg.y2} stroke={sg.over ? '#ef4444' : '#2563eb'} strokeWidth={sg.over ? 2.5 : 1.8} />
        ))}
        <text x={pad.left} y={H - 6} fontSize={10} fill="#9ca3af">t = 0</text>
        <text x={W - pad.right} y={H - 6} textAnchor="end" fontSize={10} fill="#9ca3af">t = 1</text>
      </svg>
    </div>
  )
}

const DEFAULT_RMIN = 0.27 // world units

// ---------------------------------------------------------------------------
// Lab page
// ---------------------------------------------------------------------------
export default function LabPH3D() {
  const [state, setStateRaw] = useState<PH3DState>(() => defaultPH3D())
  // Keep stateRef in lock-step with state SYNCHRONOUSLY (an effect-synced ref
  // lags one render, which would make the first drag after a reset warm-start
  // from the stale, pre-reset curve and snap back to it).
  const stateRef = useRef(state)
  const setState = (s: PH3DState) => {
    stateRef.current = s
    setStateRaw(s)
  }

  const [busy, setBusy] = useState(false)
  // Persistent on/off: when active, κ ≤ κ_max is enforced live during dragging.
  // On by default.
  const [boundActive, setBoundActive] = useState(true)
  // Minimum turning radius slider (κ_max = 1 / R_min). Range chosen so the start
  // and the min match the 2D lab in dimensionless terms (radius ÷ curve extent),
  // even though the absolute scale differs (3D world units vs 2D canvas px).
  const [rMin, setRMin] = useState(DEFAULT_RMIN)
  const kappaMax = 1 / rMin

  const analysis = useMemo(
    () => analyzePH3D(state.a0, state.a1, state.a2, state.origin),
    [state],
  )
  const margin = useMemo(() => ph3dCurvatureMargin(state, kappaMax), [state, kappaMax])
  const certified = margin >= -1e-9
  const peakRadius = analysis.peakCurvature > 1e-6 ? 1 / analysis.peakCurvature : Infinity
  const maxTorsion = useMemo(
    () => analysis.torsionSamples.reduce((m, t) => Math.max(m, Math.abs(t)), 0),
    [analysis],
  )

  // Frame the camera once from the initial curve (TrackballControls then own it).
  const camera = useMemo(() => {
    const pts = analyzePH3D(state.a0, state.a1, state.a2, state.origin).controlPoints
    const c = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 })
    const n = pts.length
    const center: [number, number, number] = [c.x / n, c.y / n, c.z / n]
    let r = 0
    for (const p of pts) r = Math.max(r, Math.hypot(p.x - center[0], p.y - center[1], p.z - center[2]))
    r = Math.max(r, 0.5)
    // Face-on to the initial (planar, xz) curve: look straight down the −y axis,
    // up = +z. The drag plane is screen-facing, so dragging starts in the curve's
    // plane; rotate the view (TrackballControls) to bend out of plane.
    return {
      target: center,
      position: [center[0], center[1] - r * 3.0, center[2]] as [number, number, number],
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Project the current curve STRICTLY inside κ ≤ κ_max when needed. We snap to a
  // slightly tighter bound (1−δ)·κ_max so the interior-point barrier has room to
  // start — landing exactly on the boundary freezes the next drag. Deferred so
  // the "Working…" state can paint before the (heavier) snap blocks the thread.
  const SNAP_BUFFER = 0.03
  const snapAsync = (s: PH3DState, km: number) => {
    const kmSnap = km * (1 - SNAP_BUFFER)
    if (ph3dCurvatureMargin(s, kmSnap) >= 0) return // already strictly inside
    setBusy(true)
    setTimeout(() => {
      setState(snapToFeasiblePH3D(s, kmSnap))
      setBusy(false)
    }, 10)
  }

  const toggleBound = (next: boolean) => {
    setBoundActive(next)
    if (next) snapAsync(stateRef.current, kappaMax)
  }

  // Slider: update live (display + colouring); snap to feasible on release if the
  // tighter bound is now violated and the bound is active.
  const onRadiusRelease = () => {
    if (boundActive) snapAsync(stateRef.current, 1 / rMin)
  }

  const reset = () => {
    setRMin(DEFAULT_RMIN)
    const s = defaultPH3D()
    const kmSnap = (1 / DEFAULT_RMIN) * (1 - SNAP_BUFFER)
    setState(boundActive && ph3dCurvatureMargin(s, kmSnap) < 0 ? snapToFeasiblePH3D(s, kmSnap) : s)
  }

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
          3D PH Curvature Workbench
        </h1>
        <span className="text-xs text-gray-500 italic">
          spatial Pythagorean-hodograph quintic · bounded curvature · exact arc length
        </span>
      </header>

      <div className="flex-1 relative min-h-0">
        <Canvas camera={{ position: camera.position, fov: 40, up: [0, 0, 1] }}>
          <Scene
            analysis={analysis}
            kappaMax={kappaMax}
            boundActive={boundActive}
            stateRef={stateRef}
            onChange={setState}
            camera={camera}
          />
        </Canvas>

        {/* Controls / readouts panel. */}
        <div className="absolute top-3 left-3 w-72 flex flex-col gap-3 bg-white/90 dark:bg-gray-950/90 px-4 py-3 rounded-lg text-xs text-gray-700 dark:text-gray-300 backdrop-blur shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">Minimum turning radius</span>
              <span className="font-mono text-gray-800 dark:text-gray-200">R = {rMin.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.04}
              max={0.8}
              step={0.005}
              value={rMin}
              onChange={(e) => setRMin(parseFloat(e.target.value))}
              onMouseUp={onRadiusRelease}
              onTouchEnd={onRadiusRelease}
              className="w-full"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">
              κ<sub>max</sub> = 1/R = <span className="font-mono">{kappaMax.toFixed(2)}</span> — the drone cannot bend tighter than this
            </div>
          </div>

          <div className="flex flex-col gap-1 pt-2 border-t border-gray-200 dark:border-gray-800">
            {stat('Arc length', analysis.arcLength.toFixed(3))}
            {stat(
              'Peak curvature',
              analysis.peakCurvature.toFixed(3),
              analysis.peakCurvature > kappaMax ? 'text-red-500' : 'text-emerald-500',
            )}
            {stat('Tightest radius', Number.isFinite(peakRadius) ? peakRadius.toFixed(3) : '∞')}
            {stat('Max |torsion|', maxTorsion.toFixed(3))}
            {stat(
              'Within bound',
              certified ? 'certified ✓' : 'exceeded ✗',
              certified ? 'text-emerald-500' : 'text-red-500',
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={boundActive}
                disabled={busy}
                onChange={(e) => toggleBound(e.target.checked)}
              />
              <span className="font-semibold">
                {boundActive ? 'Bounding' : 'Free'} curvature (κ ≤ κ<sub>max</sub>)
              </span>
              {busy && <span className="text-gray-400">working…</span>}
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
            Grab a control point (sphere) and drag it — the curve re-solves onto
            the PH manifold, so it follows the cursor but snaps to stay a true PH
            curve (arc length stays exact). Dragging is in the screen-facing plane;
            rotate the view to bend in other directions. Turn on
            <span className="font-semibold"> Bounding curvature</span> and the curve
            can never exceed the limit while you drag.
          </p>
        </div>

        <div className="absolute bottom-2 right-3 text-xs text-gray-500 italic pointer-events-none">
          drag a sphere to bend · drag empty space to rotate · scroll to zoom
        </div>
      </div>

      <GraphPanel analysis={analysis} kappaMax={kappaMax} />
    </div>
  )
}
