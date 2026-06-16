import { create } from 'zustand'
import type { Curve, CurveKind, Point2D, Point3D, Curve3D, DrawingTool, HistoryEntry, PHMetadataAny, ComplexPoint, WeightedPoint2D } from '../types/curve'
import type { FairnessEnergyType } from '../lab/optimizer/jerkEnergy'
import { computeRegionPreview, defaultEnergyForDegree, type SmoothMode } from '../utils/regionSmooth'
import { createBSpline, elevateDegree, insertKnot, moveKnot, removeKnot, getControlPointsAsPoints, toRationalBSpline, toComplexRationalBSpline, toBSpline, periodicKnotsWithJunction, uniformPeriodicKnots, generateCurveId, findKnotSpan, isClampedEndKnot } from '../utils/bspline'
import { createLine, createCircularArc, createFullCircle } from '../utils/shapes'
import { createSpiralFromTwoPoints, computePHCurveFromUV, computePHOffset, type PHMetadata, type ComplexRationalPHMetadata } from '../optimizer/phCurve'
import { createStraightComplexRationalPH } from '../optimizer/complexRationalPHCurve'
import { fitPHSplineToBSpline } from '../optimizer/phSplineFit'
import { computeABPHCurve, computeABPHOffset, applyMobiusToABPH, convertComplexPointsToAB, type ABPHMetadata } from '../optimizer/abPHCurve'
import { createRealRationalPHFromTwoPoints, computeRealRationalPHCurve, computeRealRationalPHOffset, type RealRationalPHMetadata } from '../optimizer/realRationalPHCurve'
import { insertKnot1D, elevateDegree1D, removeKnot1D } from '../optimizer/phBSplineOps'
import { weightedAveragePhi, threeArcPointsFromNoisyPoints, circleArcFromThreePoints, type CircleArcGeometry } from '../utils/circleArc'
import { optimizeCurve, applyOptimizeResult, applyOptimizeRationalResult, optimizeComplexRationalCurve, applyComplexRationalOptimizeResult, optimizeRationalFarinCurve, applyOptimizeRationalFarinResult, optimizePHCurve, optimizeComplexRationalPHCurve, optimizeABPHCurve, optimizeRealRationalPHCurve, type OptimizeRationalResult } from '../optimizer'
// MIGRATION: open planar B-spline curvature-extrema drag now runs on the clean
// core/ engine. Closed bsplines (periodic-junction knots) + rational stay on
// the legacy optimizer until core covers those conventions.
import { abPHToLieCurveSpline, identity5, isIdentityMat5, compose5, scaling5, translation5, type Mat5 } from '../lab/lieSphere/lieCurve2D'
import { liePoint5, SHAPE_GENERATORS } from '../lab/lieSphere/lieAlgebra2D'
import { computeRationalFarinPoints, updateWeightsFromRationalFarin, updateWeightsFromComplexFarin, projectPointOntoEdge, moveComplexControlPointKeepingFarinFixed, initializeFarinPositionsFromComplexWeights } from '../utils/farinPoints'
import { csub, cmult, cdiv, cnorm, type Complex } from '../utils/complex'
import {
  computeBBox,
  computeCircleFromBBox,
  computeAffineTransform,
  applyAffineToBSpline,
  computeProjectiveTransform,
  applyProjectiveToRational,
  computeMobiusTransform,
  applyMobiusToComplexRational,
  constrainParallelogram,
  applyParallelogramMidpointDrag,
  applyQuadrilateralMidpointDrag,
  getAffineReferencePoints,
  getProjectiveReferencePoints,
} from '../utils/transforms'
import { type OrientedLine, computeLaguerreMatrix, applyLaguerreToABPH } from '../optimizer/laguerrePH'
import { laguerreWidgetFromBBox, linesToHandlePoints, handlePointsToLines } from '../utils/laguerreWidget'
import { elevateDegreeBy1BSpline3D } from '../utils/curve3d'

// Snap threshold for closing curves (in screen pixels)
const CLOSE_SNAP_THRESHOLD = 30

export type PanelView = 'basis' | 'curvature' | null

interface ViewState {
  zoom: number
  panX: number
  panY: number
}

export type CurveSource = 'planar' | 'spatial'

export interface FoundCurve {
  curve: Curve | Curve3D
  source: CurveSource
}

interface SketcherState {
  // Planar curves (2D sketcher)
  curves: Curve[]
  // Spatial curves (3D)
  spatialCurves: Curve3D[]

  selectedCurveId: string | null
  selectedControlPointIndex: number | null
  selectedKnotIndex: number | null
  selectedFarinPointIndex: number | null

  // Drawing
  activeTool: DrawingTool
  toolLocked: boolean
  isDrawing: boolean
  drawingPoints: Point2D[]
  isNearStart: boolean // True when drawing and current point is near start (for closing)
  drawnCircleArc: CircleArcGeometry | null // Tracked during circle drawing after arc recognition
  isCircleClosed: boolean // True when full circle is detected

  // PH curve metadata (curveId → PH data)
  phMetadata: Map<string, PHMetadata | ComplexRationalPHMetadata | ABPHMetadata | RealRationalPHMetadata>

  // PH curve offset
  offsetSourceCurveId: string | null

  // Endpoint snap for closing open curves
  endpointSnapTarget: Point2D | null // The target endpoint position when snapping

  // UI state
  panelView: PanelView
  showHint: boolean
  hamburgerOpen: boolean
  pencilExpanded: boolean
  darkMode: boolean
  preserveCurvatureExtrema: boolean
  // Polynomial PH only: bound the curvature VALUE |κ| ≤ curvatureBound live
  // during a drag (used by the 2D PH curvature workbench). Off by default so the
  // main sketcher is unaffected.
  boundCurvatureValue: boolean
  curvatureBound: number // κ_max = 1 / minimum turning radius
  // Region-smoothing tool: linear fairing of a windowed arc; B-spline locality
  // keeps everything outside the window's support exactly fixed.
  smoothActive: boolean
  smoothWindow: [number, number]
  smoothAmount: number              // fairing-weight exponent: λ = 10^amount / gramScale
  smoothEnergy: FairnessEnergyType
  smoothMode: SmoothMode            // 'fairness' (energy solve) or 'laplacian' (control-point averaging)
  smoothIterations: number          // Laplacian-mode amount
  smoothPrevBound: boolean          // bound-toggle state to restore on exit
  preserveInflections: boolean
  /** When true, the constrained optimizer skips computing the inactive set —
   * every Bernstein sign anchor stays active and the boundary cannot slide.
   * Used by talk demos that want to show the "pre-contribution" behavior. */
  disableSliding: boolean
  symmetryMaps: { mapX: number[] | null; mapY: number[] | null } | null

  // Drift resistance (weighted anchoring)
  anchorWeight: number  // 0 = disabled, >0 = anchor undragged CPs to drag-start positions
  dragStartCPsX: number[] | null
  dragStartCPsY: number[] | null

  // Generate session: apply a (planar) Lie-sphere transform to a PH curve to
  // PRODUCE A NEW curve. accumulated = baked transform; sliders = the live one;
  // the preview is a transient curve recomputed via the exact converter.
  generate: {
    originalCurveId: string
    previewCurveId: string
    accumulated: number[][]
    coeffs: number[] // one per SHAPE_GENERATORS entry (the 8 o(3,2) generators)
    norm: number[][] // S: center + unit-scale the curve (generators act at unit scale)
    denorm: number[][] // S⁻¹
  } | null
  startGenerate: (curveId: string) => void
  setGenerateCoeff: (index: number, value: number) => void
  applyGenerate: () => void
  resetGenerate: () => void
  doneGenerate: () => void
  cancelGenerate: () => void
  /** Internal: recompute the live Generate (Lie-transform) preview curve. */
  _refreshGeneratePreview: () => void

  // Transform widget
  transformActive: boolean
  transformOriginalCurve: Curve | null
  transformOriginalPhMeta: ABPHMetadata | null
  transformWidgetType: 'parallelogram' | 'quadrilateral' | 'mobius' | 'laguerre' | null
  transformOriginalWidget: Point2D[] | null
  transformCurrentWidget: Point2D[] | null
  transformOriginalLaguerreLines: OrientedLine[] | null

  // View transform
  view: ViewState

  // History for undo/redo
  history: HistoryEntry[]
  historyIndex: number

  // Actions - Curves
  addCurve: (curve: Curve) => void
  updateCurve: (id: string, updates: Partial<Curve>) => void
  deleteCurve: (id: string) => void
  selectCurve: (id: string | null) => void
  selectControlPoint: (index: number | null) => void
  moveControlPoint: (curveId: string, pointIndex: number, newPosition: Point2D) => void
  moveCurve: (curveId: string, displacement: Point2D) => void

  // Actions - Drawing
  setActiveTool: (tool: DrawingTool) => void
  setToolLocked: (locked: boolean) => void
  startDrawing: (point: Point2D) => void
  continueDrawing: (point: Point2D, zoom?: number) => void
  finishDrawing: (zoom?: number) => void
  cancelDrawing: () => void

  // Actions - UI
  togglePanel: (view: PanelView) => void
  setShowHint: (show: boolean) => void
  setHamburgerOpen: (open: boolean) => void
  setPencilExpanded: (expanded: boolean) => void
  toggleDarkMode: () => void
  setPreserveCurvatureExtrema: (preserve: boolean) => void
  setBoundCurvatureValue: (bound: boolean) => void
  setCurvatureBound: (kappaMax: number) => void
  enterSmooth: () => void
  cancelSmooth: () => void
  applySmooth: () => void
  setSmoothWindow: (w: [number, number]) => void
  setSmoothAmount: (a: number) => void
  setSmoothEnergy: (e: FairnessEnergyType) => void
  setSmoothMode: (m: SmoothMode) => void
  setSmoothIterations: (n: number) => void
  setPreserveInflections: (preserve: boolean) => void
  setDisableSliding: (disable: boolean) => void
  setAnchorWeight: (weight: number) => void
  snapshotDragStartCPs: (curveId: string) => void
  clearDragStartCPs: () => void

  // Actions - View
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  setPan: (x: number, y: number) => void
  resetView: () => void
  fitAll: () => void

  // Actions - History
  undo: () => void
  redo: () => void
  saveToHistory: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Actions - Curve operations
  elevateCurveDegree: (id: string) => void
  insertKnotAtCurve: (id: string, t: number) => void
  moveKnotAtCurve: (id: string, knotIndex: number, newValue: number) => void
  removeKnotFromCurve: (id: string, knotIndex: number) => void
  selectKnot: (index: number | null) => void

  // Actions - Farin points
  selectFarinPoint: (index: number | null) => void
  moveFarinPoint: (curveId: string, farinIndex: number, newPosition: Point2D) => void
  convertCurveType: (id: string, newKind: CurveKind) => void

  // Actions - Transform widget
  startTransform: (widgetType?: 'parallelogram' | 'quadrilateral' | 'mobius' | 'laguerre') => void
  commitTransform: () => void
  cancelTransform: () => void
  moveTransformHandle: (handleIndex: number, handleType: 'corner' | 'midpoint', newPosition: Point2D) => void

  // Actions - PH curve offset
  setOffsetSourceCurveId: (id: string | null) => void
  createOffsetCurve: (sourceCurveId: string, distance: number) => void

  // Actions - Endpoint snap (for closing open curves)
  setEndpointSnapTarget: (target: Point2D | null) => void
  closeCurveByMergingEndpoints: (curveId: string, draggedPointIndex: number) => void

  // Actions - Spatial curves (3D)
  addSpatialCurves: (curves: Curve3D[]) => void
  deleteSpatialCurve: (id: string) => void
  moveSpatialControlPoint: (curveId: string, index: number, position: Point3D) => void
  elevateSpatialCurveDegree: (id: string) => void
  moveSpatialKnot: (curveId: string, knotIndex: number, newValue: number) => void
  insertSpatialKnot: (curveId: string, t: number) => void
  removeSpatialKnot: (curveId: string, knotIndex: number) => void
  graduateCurve: (planarCurveId: string) => void

  // Lookup helper
  findCurve: (id: string) => FoundCurve | null

  // Utility
  clearAll: () => void
  /** Replace the whole scene (from a loaded file). */
  loadScene: (curves: Curve[], phMetadata: Map<string, PHMetadataAny>, spatialCurves: Curve3D[]) => void
}

const MAX_HISTORY = 50

// The Lie-sphere converter (abPHToLieCurve) consumes the (A, B, S) shape. A
// (S, D) complex-rational PH curve carries the same information: its control
// points are F_i/D_i with weights D_i, so A_i = F_i (= pos·weight) and B_i = D_i,
// and the stored S is the generator. This adapter lets Generate / offset work on
// both representations. Returns the metadata unchanged for an AB curve.
function abShapeForGenerate(curve: Curve, meta: PHMetadataAny): ABPHMetadata {
  if (meta.kind === 'ab-complex-rational') return meta
  if (meta.kind === 'complex-rational') {
    const { aRe, aIm, bRe, bIm } = convertComplexPointsToAB(curve.controlPoints as ComplexPoint[])
    return {
      kind: 'ab-complex-rational',
      degree: curve.degree,
      aReCPs: aRe, aImCPs: aIm, bReCPs: bRe, bImCPs: bIm,
      sReCPs: meta.sUControlPoints, sImCPs: meta.sVControlPoints,
      knots: curve.knots, sKnots: meta.sKnots,
    }
  }
  if (meta.kind === 'polynomial') {
    // A polynomial PH curve is the rational case with denominator B ≡ 1: its
    // real control points ARE the numerator A, the weight is 1, and the stored
    // (u,v) generator is S. (B'=0 ⇒ A'=S²=w², matching r'=w².) Exact repackaging
    // — the Lie pipeline then emits the rational image (multi-segment aware).
    const cps = curve.controlPoints as Point2D[]
    return {
      kind: 'ab-complex-rational',
      degree: curve.degree,
      aReCPs: cps.map((p) => p.x),
      aImCPs: cps.map((p) => p.y),
      bReCPs: cps.map(() => 1),
      bImCPs: cps.map(() => 0),
      sReCPs: meta.uControlPoints, sImCPs: meta.vControlPoints,
      knots: curve.knots, sKnots: meta.uvKnots,
    }
  }
  // Generate/offset only run on PH curves (callers guard on meta.kind);
  // real-rational PH can't be expressed as an AB shape.
  throw new Error(`abShapeForGenerate: unsupported metadata kind '${meta.kind}'`)
}

// The Generate preview curve (a real rational NURBS) for a given Lie transform M.
// At the IDENTITY (all sliders at 0) the image is just the original curve, so we
// use the EXACT complex→real-rational conversion (z = Z·W̄/|W|², degree 2n) — a
// clean control polygon (weights = |W|² coefficients, control points hugging the
// curve). The lift+fit path (abPHToLieCurve) is ill-conditioned at degree 2n
// (negative weights, far-flung control points) and is only needed for a genuine,
// non-identity transform.
function generatePreviewGeom(
  curve: Curve,
  meta: PHMetadataAny,
  M: Mat5,
): { controlPoints: WeightedPoint2D[]; knots: number[]; degree: number } {
  if (isIdentityMat5(M)) {
    const r = toRationalBSpline(curve) // complex-rational → exact real rational
    return { controlPoints: r.controlPoints as WeightedPoint2D[], knots: r.knots, degree: r.degree }
  }
  const res = abPHToLieCurveSpline(abShapeForGenerate(curve, meta), M)
  return { controlPoints: res.controlPoints, knots: res.knots, degree: res.degree }
}

function createHistoryEntry(curves: Curve[], spatialCurves: Curve3D[], selectedCurveId: string | null, phMetadata: Map<string, PHMetadataAny>): HistoryEntry {
  return {
    curves: curves.map((c) => {
      // Deep copy based on curve kind to maintain proper typing
      if (c.kind === 'bspline') {
        return {
          ...c,
          controlPoints: c.controlPoints.map(p => ({ ...p })),
          knots: [...c.knots],
        }
      } else if (c.kind === 'rational') {
        return {
          ...c,
          controlPoints: c.controlPoints.map(p => ({ ...p })),
          knots: [...c.knots],
        }
      } else {
        return {
          ...c,
          controlPoints: c.controlPoints.map(p => ({ ...p })),
          knots: [...c.knots],
        }
      }
    }),
    spatialCurves: spatialCurves.map((c) => ({
      ...c,
      controlPoints: c.controlPoints.map(p => ({ ...p })),
      knots: [...c.knots],
    })),
    selectedCurveId,
    // shallow Map clone: metadata objects are replaced wholesale (never mutated
    // in place), so the entries stay valid snapshots.
    phMetadata: new Map(phMetadata),
  }
}

export const useSceneStore = create<SketcherState>((set, get) => ({
  // Initial state
  curves: [],
  spatialCurves: [],
  selectedCurveId: null,
  selectedControlPointIndex: null,
  selectedKnotIndex: null,
  selectedFarinPointIndex: null,

  activeTool: 'none',
  toolLocked: false,
  isDrawing: false,
  drawingPoints: [],
  isNearStart: false,
  drawnCircleArc: null,
  isCircleClosed: false,
  phMetadata: new Map<string, PHMetadata>(),
  offsetSourceCurveId: null,
  endpointSnapTarget: null,
  transformActive: false,
  transformOriginalCurve: null,
  transformOriginalPhMeta: null,
  transformWidgetType: null,
  transformOriginalWidget: null,
  transformCurrentWidget: null,
  transformOriginalLaguerreLines: null,

  panelView: null,
  showHint: true,
  hamburgerOpen: false,
  pencilExpanded: false,
  darkMode: true,
  preserveCurvatureExtrema: false,
  boundCurvatureValue: false,
  curvatureBound: Infinity,
  smoothActive: false,
  smoothWindow: [0.3, 0.7],
  smoothAmount: 0,
  smoothEnergy: 'snap',
  smoothMode: 'laplacian-bounded',
  smoothIterations: 0,
  smoothPrevBound: false,
  preserveInflections: false,
  disableSliding: false,
  symmetryMaps: null,
  anchorWeight: 0,
  dragStartCPsX: null,
  dragStartCPsY: null,
  generate: null,

  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },

  history: [createHistoryEntry([], [], null, new Map())],
  historyIndex: 0,

  // Curve actions
  addCurve: (curve) => {
    const state = get()
    set({
      curves: [...state.curves, curve],
      selectedCurveId: curve.id,
      showHint: false,
    })
    get().saveToHistory()
  },

  updateCurve: (id, updates) => {
    set((state) => ({
      curves: state.curves.map((c) => (c.id === id ? { ...c, ...updates } as Curve : c)),
    }))
  },

  // --- Region-smoothing tool ---
  enterSmooth: () => {
    const state = get()
    const curve = state.curves.find((c) => c.id === state.selectedCurveId)
    if (!curve || curve.kind !== 'bspline' || curve.closed) return
    const t0 = curve.knots[curve.degree]
    const t1 = curve.knots[curve.controlPoints.length]
    const mid = (t0 + t1) / 2
    set({
      smoothActive: true,
      smoothPrevBound: state.preserveCurvatureExtrema,
      preserveCurvatureExtrema: false, // smoothing does not apply the bound
      // First boundary at the curve start (t0 = 0 for a clamped B-spline); the
      // second at the midpoint.
      smoothWindow: [t0, mid],
      smoothAmount: 0,
      smoothIterations: 0,
      smoothEnergy: defaultEnergyForDegree(curve.degree),
    })
  },
  cancelSmooth: () => {
    set((state) => ({ smoothActive: false, preserveCurvatureExtrema: state.smoothPrevBound }))
  },
  applySmooth: () => {
    const state = get()
    const curve = state.curves.find((c) => c.id === state.selectedCurveId)
    if (curve && curve.kind === 'bspline' && !curve.closed) {
      const cpX = curve.controlPoints.map((p) => p.x)
      const cpY = curve.controlPoints.map((p) => p.y)
      const prev = computeRegionPreview(
        curve.knots, cpX, cpY, curve.degree, state.smoothWindow,
        { mode: state.smoothMode, amountExp: state.smoothAmount, energy: state.smoothEnergy, iterations: state.smoothIterations },
      )
      const controlPoints = prev.cpX.map((x, i) => ({ x, y: prev.cpY[i] }))
      get().updateCurve(curve.id, { controlPoints })
      get().saveToHistory()
    }
    set((s) => ({ smoothActive: false, preserveCurvatureExtrema: s.smoothPrevBound }))
  },
  setSmoothWindow: (w) => set({ smoothWindow: w }),
  setSmoothAmount: (a) => set({ smoothAmount: a }),
  setSmoothEnergy: (e) => set({ smoothEnergy: e }),
  setSmoothMode: (m) => set({ smoothMode: m }),
  setSmoothIterations: (n) => set({ smoothIterations: n }),

  deleteCurve: (id) => {
    const state = get()
    const newPhMetadata = new Map(state.phMetadata)
    newPhMetadata.delete(id)
    set((state) => ({
      curves: state.curves.filter((c) => c.id !== id),
      selectedCurveId: state.selectedCurveId === id ? null : state.selectedCurveId,
      phMetadata: newPhMetadata,
    }))
    get().saveToHistory()
  },

  selectCurve: (id) => {
    const state = get()
    // If transform is active and we're deselecting or selecting a different curve, commit the transform
    if (state.transformActive && id !== state.selectedCurveId) {
      state.commitTransform()
    }
    set({ selectedCurveId: id, selectedControlPointIndex: null, selectedKnotIndex: null, selectedFarinPointIndex: null })
  },

  selectControlPoint: (index) => {
    set({ selectedControlPointIndex: index, selectedKnotIndex: null, selectedFarinPointIndex: null })
  },

  moveControlPoint: (curveId, pointIndex, newPosition) => {
    const { preserveCurvatureExtrema, preserveInflections, disableSliding, symmetryMaps, curves, phMetadata, anchorWeight, dragStartCPsX, dragStartCPsY, boundCurvatureValue, curvatureBound } = get()
    const curve = curves.find((c) => c.id === curveId)

    if (!curve) return

    // PH curve optimization (always active for PH curves)
    if (phMetadata.has(curveId) && curve.kind === 'bspline') {
      const meta = phMetadata.get(curveId)!
      if (meta.kind === 'polynomial') {
        try {
          // Live curvature controls during the drag: the curvature-VALUE bound
          // (2D PH workbench) and/or curvature-EXTREMA-count preservation (the
          // sketcher's signature constraint). When either is active, use a small
          // iteration cap + Gauss-Newton (no BFGS) for interactivity.
          const valueBound = boundCurvatureValue && Number.isFinite(curvatureBound)
          const phOptions: Parameters<typeof optimizePHCurve>[5] = {
            ...(valueBound ? { constrainCurvatureValue: true, curvatureBound } : {}),
            ...(preserveCurvatureExtrema ? { preserveCurvatureExtrema: true } : {}),
          }
          if (valueBound || preserveCurvatureExtrema) {
            phOptions.maxIterations = 24
            phOptions.enableBFGS = false
          }
          const result = optimizePHCurve(
            meta, curve.controlPoints, newPosition.x, newPosition.y, pointIndex,
            phOptions,
          )
          if (result.converged || result.iterations > 0) {
            const newPhMetadata = new Map(phMetadata)
            newPhMetadata.set(curveId, result.curveResult.metadata)
            set((state) => ({
              curves: state.curves.map((c) =>
                c.id === curveId
                  ? { ...c, controlPoints: result.curveResult.controlPoints, knots: result.curveResult.knots, degree: result.curveResult.degree } as Curve
                  : c
              ),
              phMetadata: newPhMetadata,
            }))
            return
          }
        } catch {
          // Fall through to direct move if PH optimization fails
        }
      }
    }

    // (A, B, S) PH curve optimization
    if (phMetadata.has(curveId) && curve.kind === 'complex-rational') {
      const meta = phMetadata.get(curveId)!
      if (meta.kind === 'ab-complex-rational') {
        try {
          const result = optimizeABPHCurve(
            meta, curve.controlPoints, newPosition.x, newPosition.y, pointIndex,
            { preserveCurvatureExtrema }
          )
          if (result.converged || result.iterations > 0) {
            const newPhMetadata = new Map(phMetadata)
            newPhMetadata.set(curveId, result.curveResult.metadata)
            set((state) => ({
              curves: state.curves.map((c) =>
                c.id === curveId
                  ? { ...c, controlPoints: result.curveResult.controlPoints, knots: result.curveResult.knots, degree: result.curveResult.degree } as Curve
                  : c
              ),
              phMetadata: newPhMetadata,
            }))
            return
          }
        } catch {
          // Fall through to complex-rational or direct move
        }
      }

      // Complex rational PH curve optimization (S,D parameterization — PH by
      // construction). Optionally bounds the curvature-extrema count.
      if (meta.kind === 'complex-rational') {
        try {
          const result = optimizeComplexRationalPHCurve(
            meta, curve.controlPoints, newPosition.x, newPosition.y, pointIndex,
            { preserveCurvatureExtrema }
          )
          if (result.converged || result.iterations > 0) {
            const newPhMetadata = new Map(phMetadata)
            newPhMetadata.set(curveId, result.curveResult.metadata)
            set((state) => ({
              curves: state.curves.map((c) =>
                c.id === curveId
                  ? { ...c, controlPoints: result.curveResult.controlPoints, knots: result.curveResult.knots, degree: result.curveResult.degree } as Curve
                  : c
              ),
              phMetadata: newPhMetadata,
            }))
            return
          }
        } catch {
          // Fall through to direct move if complex rational PH optimization fails
        }
      }
    }

    // Real rational PH curve optimization
    if (phMetadata.has(curveId) && curve.kind === 'rational') {
      const meta = phMetadata.get(curveId)!
      if (meta.kind === 'real-rational') {
        try {
          const result = optimizeRealRationalPHCurve(
            meta, curve.controlPoints, newPosition.x, newPosition.y, pointIndex
          )
          if (result.converged || result.iterations > 0) {
            const newPhMetadata = new Map(phMetadata)
            newPhMetadata.set(curveId, result.curveResult.metadata)
            set((state) => ({
              curves: state.curves.map((c) =>
                c.id === curveId
                  ? { ...c, controlPoints: result.curveResult.controlPoints, knots: result.curveResult.knots, degree: result.curveResult.degree } as Curve
                  : c
              ),
              phMetadata: newPhMetadata,
            }))
            return
          }
        } catch {
          // Fall through to direct move if real rational PH optimization fails
        }
      }
    }

    // Open planar B-splines use the sketcher's own optimizeCurve (below) — it
    // gives the smoother editing feel: the soft curvature constraint resists a
    // bound-violating drag without core slideCurve's hard bisect-back guard
    // (which clamps the dragged point and feels "stuck"). The clean core engine
    // still backs the presentation demos directly.

    // Use optimizer if preserveCurvatureExtrema is enabled and curve is compatible
    // (closed bsplines + rational — not yet migrated to core/).
    if (preserveCurvatureExtrema && (curve.kind === 'bspline' || curve.kind === 'rational')) {
      try {
        const opts = {
          maxIterations: 20, // cap for interactive dragging (small deltas converge fast)
          enableBFGS: false, // drag objective Σ½‖cp−t‖² has an exact identity Hessian → Gauss-Newton, ~30% faster, same result
          ...(symmetryMaps ? { symmetryMaps } : {}),
          ...(preserveInflections ? { preserveInflections } : {}),
          ...(disableSliding ? { disableSliding } : {}),
          ...(anchorWeight > 0 && dragStartCPsX && dragStartCPsY
            ? { anchorWeight, anchorCPsX: dragStartCPsX, anchorCPsY: dragStartCPsY }
            : {}),
        }
        const result = optimizeCurve(curve, newPosition.x, newPosition.y, pointIndex, opts)
        if (result.converged || result.iterations > 0) {
          const optimizedCurve = curve.kind === 'rational'
            ? applyOptimizeRationalResult(curve, result as OptimizeRationalResult)
            : applyOptimizeResult(curve, result)
          set((state) => ({
            curves: state.curves.map((c) => (c.id === curveId ? optimizedCurve : c)),
          }))
          return
        }
      } catch (e) {
        // Fall through to direct move if optimization fails
        console.warn('Curvature optimizer failed:', e)
      }
    }

    if (preserveCurvatureExtrema && curve.kind === 'complex-rational') {
      try {
        const result = optimizeComplexRationalCurve(
          curve, newPosition.x, newPosition.y, pointIndex, 'controlPoint',
          // Interactive drag: cap iterations and drop BFGS, exactly like the bspline
          // path. Default was 100 iters + BFGS on, which on the complex path costs
          // ~1.2 s/tick (degree 3, 12 CPs) and never converges within the cap. BFGS
          // off uses the identity-Hessian fallback: ~7.7× faster (≈160 ms/tick) AND
          // converges in ~10 iters per tick, tracking the target as well or better.
          // (measured in complexRationalDragBench / complexRationalDragQuality)
          //
          // fixedWeightClosed: on a CLOSED curve, freeze the complex weights (and
          // the wrap/monodromy) instead of letting every Farin point be a free
          // variable. Free Farin points couple globally through the weight chain
          // → a dense Jacobian; frozen weights give the sparse fixed-weight
          // formulation (the same one open-curve CP drags already use). Editing
          // the shape inside a fixed conformal frame, then bounding its curvature
          // extrema. The flag is a no-op on open curves and on Farin drags.
          // (ComplexRationalDemo already does this; this brings the sketcher in line.)
          { maxIterations: 20, enableBFGS: false, fixedWeightClosed: true }
        )
        if (result.converged || result.iterations > 0) {
          const optimizedCurve = applyComplexRationalOptimizeResult(curve, result)
          set((state) => ({
            curves: state.curves.map((c) => (c.id === curveId ? optimizedCurve : c)),
          }))
          return
        }
      } catch {
        // Fall through to direct move if optimization fails
      }
    }

    // Direct move (original behavior)
    set((state) => ({
      curves: state.curves.map((c): Curve => {
        if (c.id !== curveId) return c

        if (c.kind === 'bspline') {
          const newPoints = [...c.controlPoints]
          newPoints[pointIndex] = { ...newPosition }
          return { ...c, controlPoints: newPoints }
        } else if (c.kind === 'rational') {
          const newPoints = [...c.controlPoints]
          newPoints[pointIndex] = { ...newPoints[pointIndex], x: newPosition.x, y: newPosition.y }
          return { ...c, controlPoints: newPoints }
        } else if (c.kind === 'complex-rational') {
          // Complex-rational: keep Farin points fixed when moving control points
          const result = moveComplexControlPointKeepingFarinFixed(
            c,
            pointIndex,
            newPosition,
            5 / state.view.zoom
          )
          return {
            ...c,
            controlPoints: result.points,
            ...(result.wrapWeight ? { wrapWeight: result.wrapWeight } : {}),
          }
        }
        return c // unreachable (kinds above are exhaustive); satisfies the Curve return type
      }),
    }))
  },

  moveCurve: (curveId, displacement) => {
    set((state) => {
      const dx = displacement.x, dy = displacement.y
      // Translate the PH metadata too, so the PH structure (used by Generate,
      // offset, …) follows the moved curve. For z = A/B, a translation by
      // Δ = dx + i·dy gives z+Δ = (A + Δ·B)/B, i.e. A ← A + Δ·B (B, S unchanged
      // — the PH condition A'B−AB'=S² is translation-invariant).
      let phMetadata = state.phMetadata
      const meta = phMetadata.get(curveId)
      if (meta && meta.kind === 'ab-complex-rational') {
        const aReCPs = meta.aReCPs.map((a, i) => a + dx * meta.bReCPs[i] - dy * meta.bImCPs[i])
        const aImCPs = meta.aImCPs.map((a, i) => a + dx * meta.bImCPs[i] + dy * meta.bReCPs[i])
        phMetadata = new Map(phMetadata)
        phMetadata.set(curveId, { ...meta, aReCPs, aImCPs })
      } else if (meta && meta.kind === 'complex-rational') {
        // (S, D) form: translation only shifts the integration constant (origin);
        // S and D are translation-invariant.
        phMetadata = new Map(phMetadata)
        phMetadata.set(curveId, { ...meta, origin: { x: meta.origin.x + dx, y: meta.origin.y + dy } })
      }
      return {
      phMetadata,
      curves: state.curves.map((c): Curve => {
        if (c.id !== curveId) return c

        if (c.kind === 'bspline') {
          return {
            ...c,
            controlPoints: c.controlPoints.map((p) => ({
              x: p.x + displacement.x,
              y: p.y + displacement.y,
            })),
          }
        } else if (c.kind === 'rational') {
          return {
            ...c,
            controlPoints: c.controlPoints.map((p) => ({
              ...p,
              x: p.x + displacement.x,
              y: p.y + displacement.y,
            })),
          }
        } else {
          return {
            ...c,
            controlPoints: c.controlPoints.map((p) => ({
              ...p,
              re: p.re + displacement.x,
              im: p.im + displacement.y,
            })),
            // Also move farinPositions for closed curves
            ...(c.farinPositions
              ? {
                  farinPositions: c.farinPositions.map((p) => ({
                    x: p.x + displacement.x,
                    y: p.y + displacement.y,
                  })),
                }
              : {}),
          }
        }
      }),
      }
    })
  },

  // Drawing actions
  setActiveTool: (tool) => {
    set({ activeTool: tool, toolLocked: false, pencilExpanded: false })
  },

  setToolLocked: (locked) => set({ toolLocked: locked }),

  startDrawing: (point) => {
    set({
      isDrawing: true,
      drawingPoints: [point],
      showHint: false,
      drawnCircleArc: null,
      isCircleClosed: false,
    })
  },

  continueDrawing: (point, zoom: number = 1) => {
    set((state) => {
      // Circle tool: progressive arc recognition
      if (state.activeTool === 'circle') {
        const points = [...state.drawingPoints, point]

        if (state.isCircleClosed) {
          // Already closed, ignore further points
          return {}
        }

        if (state.drawnCircleArc) {
          // Phase 3: Arc already recognized - update arc with new point
          const arc = state.drawnCircleArc
          const angle = Math.atan2(point.y - arc.yc, point.x - arc.xc)

          // Check if we've returned near the start angle (full circle)
          let angleDiff = angle - arc.startAngle
          // Normalize to [-pi, pi]
          angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

          if (Math.abs(angleDiff) < 0.1) {
            // Full circle detected - snap to 2 diametrically opposite points
            // (matching createFullCircle convention: 0° and 180°)
            const r = arc.r
            const cx = arc.xc
            const cy = arc.yc
            const p0: Point2D = { x: cx + r, y: cy }
            const p1: Point2D = { x: cx - r, y: cy }
            return {
              drawingPoints: [p0, p1],
              isCircleClosed: true,
              drawnCircleArc: { ...arc, endAngle: arc.startAngle },
            }
          }

          // Project point onto circle and update the 3-point representation
          const projX = arc.xc + arc.r * Math.cos(angle)
          const projY = arc.yc + arc.r * Math.sin(angle)
          const projectedEnd: Point2D = { x: projX, y: projY }

          // Keep the start point, recompute middle and update end
          const startPt = state.drawingPoints[0]
          const midAngle = (arc.startAngle + angle) / 2
          // Handle angle wrap-around for mid angle
          let adjustedMidAngle = midAngle
          if (arc.counterclockwise) {
            let sweep = arc.startAngle - angle
            if (sweep < 0) sweep += 2 * Math.PI
            adjustedMidAngle = arc.startAngle - sweep / 2
          } else {
            let sweep = angle - arc.startAngle
            if (sweep < 0) sweep += 2 * Math.PI
            adjustedMidAngle = arc.startAngle + sweep / 2
          }
          const midPt: Point2D = {
            x: arc.xc + arc.r * Math.cos(adjustedMidAngle),
            y: arc.yc + arc.r * Math.sin(adjustedMidAngle),
          }

          const newArc = circleArcFromThreePoints(startPt, midPt, projectedEnd)

          return {
            drawingPoints: [startPt, midPt, projectedEnd],
            drawnCircleArc: newArc || state.drawnCircleArc,
          }
        }

        // Phase 1 & 2: Accumulate points, check for arc recognition
        if (points.length >= 3) {
          const phi = weightedAveragePhi(points)
          if (Math.abs(phi) > Math.PI / 2) {
            // Phase 2: Recognize arc - snap to 3 clean points
            const [p0, p1, p2] = threeArcPointsFromNoisyPoints(points)
            const arcGeom = circleArcFromThreePoints(p0, p1, p2)

            return {
              drawingPoints: [p0, p1, p2],
              drawnCircleArc: arcGeom,
            }
          }
        }

        return { drawingPoints: points }
      }

      // Non-circle tools: original behavior
      const points = [...state.drawingPoints, point]

      // Check proximity to start point for closing (only if we have enough points)
      // Works for freehand drawing tool
      let isNearStart = false
      if (points.length >= 4) {
        const start = points[0]
        const dx = point.x - start.x
        const dy = point.y - start.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        // Threshold is in screen pixels, convert to canvas coordinates
        const thresholdInCanvas = CLOSE_SNAP_THRESHOLD / zoom
        isNearStart = distance < thresholdInCanvas
      }

      return {
        drawingPoints: points,
        isNearStart,
      }
    })
  },

  finishDrawing: (zoom: number = 1) => {
    const state = get()
    const points = state.drawingPoints
    const tool = state.activeTool

    // Spiral uses two points (press start → drag end)
    if (tool === 'spiral' && points.length >= 1) {
      const last = points[points.length - 1]
      const dx = last.x - points[0].x
      const dy = last.y - points[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      // If only 1 point or very short drag, create a default-sized spiral
      const defaultSize = 50 / zoom
      const spiralResult = (points.length <= 1 || dist < 1e-6)
        ? createSpiralFromTwoPoints(points[0].x, points[0].y, points[0].x + defaultSize, points[0].y)
        : createSpiralFromTwoPoints(points[0].x, points[0].y, last.x, last.y)
      const curveId = generateCurveId()
      const curve: Curve = {
        id: curveId,
        kind: 'bspline',
        degree: spiralResult.degree,
        knots: spiralResult.knots,
        controlPoints: spiralResult.controlPoints,
        closed: false,
      }

      const newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.set(curveId, spiralResult.metadata)
      set((s) => ({
        curves: [...s.curves, curve],
        selectedCurveId: curveId,
        isDrawing: false,
        drawingPoints: [],
        isNearStart: false,
        drawnCircleArc: null,
        isCircleClosed: false,
        phMetadata: newPhMetadata,
        // Freshly drawn PH curve: leave the curvature-extrema bound off so it's
        // immediately shapeable (a near-straight fresh curve is otherwise frozen).
        preserveCurvatureExtrema: false,
        ...(!s.toolLocked ? { activeTool: 'none' as DrawingTool, toolLocked: false } : {}),
      }))
      get().saveToHistory()
      return
    }

    // Real rational PH spiral uses two points (press start → drag end)
    if (tool === 'rational-spiral' && points.length >= 1) {
      const last = points[points.length - 1]
      const dx = last.x - points[0].x
      const dy = last.y - points[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const defaultSize = 50 / zoom
      const phResult = (points.length <= 1 || dist < 1e-6)
        ? createRealRationalPHFromTwoPoints(points[0].x, points[0].y, points[0].x + defaultSize, points[0].y)
        : createRealRationalPHFromTwoPoints(points[0].x, points[0].y, last.x, last.y)
      const curveId = generateCurveId()
      const curve: Curve = {
        id: curveId,
        kind: 'rational',
        degree: phResult.degree,
        knots: phResult.knots,
        controlPoints: phResult.controlPoints,
        closed: false,
      }

      const newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.set(curveId, phResult.metadata)
      set((s) => ({
        curves: [...s.curves, curve],
        selectedCurveId: curveId,
        isDrawing: false,
        drawingPoints: [],
        isNearStart: false,
        drawnCircleArc: null,
        isCircleClosed: false,
        phMetadata: newPhMetadata,
        // A freshly drawn PH curve is a straight line (0 curvature extrema). With
        // the bound ON it would be frozen straight — undeformable — which baffles
        // a new user. Turn the curvature-extrema constraint off so they can shape
        // it; they can re-enable the bound once it's a curve.
        preserveCurvatureExtrema: false,
        ...(!s.toolLocked ? { activeTool: 'none' as DrawingTool, toolLocked: false } : {}),
      }))
      get().saveToHistory()
      return
    }

    // Complex rational PH spiral uses two points (press start → drag end)
    if (tool === 'complex-spiral' && points.length >= 1) {
      const last = points[points.length - 1]
      const dx = last.x - points[0].x
      const dy = last.y - points[0].y
      const dist = Math.sqrt(dx * dx + dy * dy)

      const defaultSize = 50 / zoom
      // (S, D) parameterization — PH by construction, so dragging (via
      // optimizeComplexRationalPHCurve) moves all control points smoothly, with
      // no PH equality constraints to crawl along. Mirrors the Lie-sphere lab.
      const phResult = (points.length <= 1 || dist < 1e-6)
        ? createStraightComplexRationalPH(points[0].x, points[0].y, points[0].x + defaultSize, points[0].y)
        : createStraightComplexRationalPH(points[0].x, points[0].y, last.x, last.y)
      const curveId = generateCurveId()
      const curve: Curve = {
        id: curveId,
        kind: 'complex-rational',
        degree: phResult.degree,
        knots: phResult.knots,
        controlPoints: phResult.controlPoints,
        closed: false,
      }

      const newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.set(curveId, phResult.metadata)
      set((s) => ({
        curves: [...s.curves, curve],
        selectedCurveId: curveId,
        isDrawing: false,
        drawingPoints: [],
        isNearStart: false,
        drawnCircleArc: null,
        isCircleClosed: false,
        phMetadata: newPhMetadata,
        // A freshly drawn PH curve is a straight line (0 curvature extrema). With
        // the bound ON it would be frozen straight — undeformable — which baffles
        // a new user. Turn the curvature-extrema constraint off so they can shape
        // it; they can re-enable the bound once it's a curve.
        preserveCurvatureExtrema: false,
        ...(!s.toolLocked ? { activeTool: 'none' as DrawingTool, toolLocked: false } : {}),
      }))
      get().saveToHistory()
      return
    }

    // Polynomial PH spline via hodograph matching: fit an ordinary freehand
    // B-spline to the stroke, then match its hodograph with w² (a linear √h
    // least-squares fit) and integrate — an automatically-C² PH spline that
    // follows the stroke and is fully editable through the polynomial-PH path.
    if (tool === 'ph-freehand') {
      if (points.length < 2) {
        set({ isDrawing: false, drawingPoints: [], isNearStart: false, drawnCircleArc: null, isCircleClosed: false })
        return
      }
      // Trim the noisy slow-down tail, mirroring the freehand branch below.
      const tailRadius = 5 / zoom
      let trimEnd = points.length - 1
      while (trimEnd > 0) {
        const tdx = points[trimEnd].x - points[points.length - 1].x
        const tdy = points[trimEnd].y - points[points.length - 1].y
        if (Math.sqrt(tdx * tdx + tdy * tdy) >= tailRadius) break
        trimEnd--
      }
      const trimmedPoints = trimEnd < points.length - 2 ? points.slice(0, trimEnd + 2) : points
      const simplified = simplifyPointsCurvatureAdaptive(trimmedPoints)
      const bs = createBSpline(simplified, 3)
      const bsCPs = bs.kind === 'bspline' ? bs.controlPoints : []
      const ph = fitPHSplineToBSpline(bsCPs, bs.knots)
      if (!ph) {
        set({ isDrawing: false, drawingPoints: [], isNearStart: false, drawnCircleArc: null, isCircleClosed: false })
        return
      }
      const curveId = generateCurveId()
      const phCurve: Curve = {
        id: curveId,
        kind: 'bspline',
        degree: ph.degree,
        knots: ph.knots,
        controlPoints: ph.controlPoints,
        closed: false,
      }
      const newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.set(curveId, ph.metadata)
      set((s) => ({
        curves: [...s.curves, phCurve],
        selectedCurveId: curveId,
        isDrawing: false,
        drawingPoints: [],
        isNearStart: false,
        drawnCircleArc: null,
        isCircleClosed: false,
        phMetadata: newPhMetadata,
        preserveCurvatureExtrema: false,
        ...(!s.toolLocked ? { activeTool: 'none' as DrawingTool, toolLocked: false } : {}),
      }))
      get().saveToHistory()
      return
    }

    if (points.length < 2) {
      set({ isDrawing: false, drawingPoints: [], isNearStart: false, drawnCircleArc: null, isCircleClosed: false })
      return
    }

    let curve: Curve

    switch (tool) {
      case 'line':
        // Create a line from first to last point
        curve = createLine(points[0], points[points.length - 1])
        break

      case 'circle': {
        let circleArc = state.drawnCircleArc
        let arcPoints = points

        // If arc wasn't formally recognized during drawing, try to fit one now
        // (the preview already shows this arc, so releasing should create it)
        if (!circleArc && points.length >= 3) {
          const [p0, p1, p2] = threeArcPointsFromNoisyPoints(points)
          circleArc = circleArcFromThreePoints(p0, p1, p2)
          arcPoints = [p0, p1, p2]
        }

        if (state.isCircleClosed && circleArc) {
          // Full circle detected
          curve = createFullCircle({ x: circleArc.xc, y: circleArc.yc }, circleArc.r)
        } else if (circleArc) {
          // Arc - create circular arc from start to end through center
          const center: Point2D = { x: circleArc.xc, y: circleArc.yc }
          curve = createCircularArc(arcPoints[0], arcPoints[arcPoints.length - 1], center, circleArc.counterclockwise)
        } else {
          // Too few points, discard
          set({ isDrawing: false, drawingPoints: [], isNearStart: false, drawnCircleArc: null, isCircleClosed: false })
          return
        }
        break
      }

      case 'draw':
      default: {
        // Check if we should close the curve (snap to start) BEFORE simplification
        const start = points[0]
        const end = points[points.length - 1]
        const dx = end.x - start.x
        const dy = end.y - start.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        const threshold = CLOSE_SNAP_THRESHOLD / zoom
        const shouldClose = distance < threshold && points.length >= 4

        if (shouldClose) {
          // Trim the noisy closure tail: walk backward from the end and find the
          // last point that is outside the snap zone around points[0].
          let trimIndex = points.length - 1
          while (trimIndex > 0) {
            const tdx = points[trimIndex].x - points[0].x
            const tdy = points[trimIndex].y - points[0].y
            if (Math.sqrt(tdx * tdx + tdy * tdy) >= threshold) break
            trimIndex--
          }
          const trimmedPoints = points.slice(0, trimIndex + 1)

          // Simplify the trimmed (clean) points
          const simplified = simplifyPointsCurvatureAdaptive(trimmedPoints)
          const closedPoints = simplified

          const degree = Math.min(3, closedPoints.length - 1)

          // Check tangent alignment at junction to decide smoothness
          // Arriving tangent: last point → first point (wrapping around)
          // Departing tangent: first point → second point
          const n = closedPoints.length
          const arrX = closedPoints[0].x - closedPoints[n - 1].x
          const arrY = closedPoints[0].y - closedPoints[n - 1].y
          const depX = closedPoints[1].x - closedPoints[0].x
          const depY = closedPoints[1].y - closedPoints[0].y
          const arrLen = Math.sqrt(arrX * arrX + arrY * arrY)
          const depLen = Math.sqrt(depX * depX + depY * depY)
          // Cosine of angle between tangents (dot product of unit vectors)
          const cosAngle = arrLen > 1e-10 && depLen > 1e-10
            ? (arrX * depX + arrY * depY) / (arrLen * depLen)
            : 1
          // If tangents are roughly aligned (< ~30°), use uniform knots (C² at junction)
          // Otherwise keep junction knots (C⁰) to preserve the corner
          const knots = cosAngle > 0.85
            ? uniformPeriodicKnots(closedPoints.length)
            : periodicKnotsWithJunction(closedPoints.length, degree)

          curve = {
            id: generateCurveId(),
            kind: 'bspline',
            degree,
            knots,
            controlPoints: closedPoints,
            closed: true,
          }
        } else {
          // Trim the noisy tail at the end of the stroke: when the user slows
          // down or stops, input points pile up in a tiny area. Walk backward
          // from the end and remove points that are within a small radius of
          // the final position (similar to the closed-curve snap-zone trim).
          const tailRadius = 5 / zoom // 5 screen pixels
          let trimEnd = points.length - 1
          while (trimEnd > 0) {
            const tdx = points[trimEnd].x - points[points.length - 1].x
            const tdy = points[trimEnd].y - points[points.length - 1].y
            if (Math.sqrt(tdx * tdx + tdy * tdy) >= tailRadius) break
            trimEnd--
          }
          // Keep at least one point beyond the trim boundary (the exit point of the cluster)
          const trimmedPoints = trimEnd < points.length - 2
            ? points.slice(0, trimEnd + 2)
            : points

          const simplified = simplifyPointsCurvatureAdaptive(trimmedPoints)
          curve = createBSpline(simplified, 3)
        }
        break
      }
    }

    set((s) => ({
      curves: [...s.curves, curve],
      selectedCurveId: curve.id,
      isDrawing: false,
      drawingPoints: [],
      isNearStart: false,
      drawnCircleArc: null,
      isCircleClosed: false,
      // Auto-return to selection unless tool is locked (pinned mode)
      ...(!s.toolLocked ? { activeTool: 'none', toolLocked: false } : {}),
    }))
    get().saveToHistory()
  },

  cancelDrawing: () => {
    set({ isDrawing: false, drawingPoints: [], isNearStart: false, drawnCircleArc: null, isCircleClosed: false })
  },

  // UI actions
  togglePanel: (view) =>
    set((state) => ({
      panelView: state.panelView === view ? null : view,
    })),

  setShowHint: (show) => set({ showHint: show }),

  setHamburgerOpen: (open) => set({ hamburgerOpen: open }),

  setPencilExpanded: (expanded) => set({ pencilExpanded: expanded }),

  toggleDarkMode: () =>
    set((state) => {
      const newDarkMode = !state.darkMode
      if (newDarkMode) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return { darkMode: newDarkMode }
    }),

  setPreserveCurvatureExtrema: (preserve) => set({ preserveCurvatureExtrema: preserve }),
  setBoundCurvatureValue: (bound) => set({ boundCurvatureValue: bound }),
  setCurvatureBound: (kappaMax) => set({ curvatureBound: kappaMax }),
  setPreserveInflections: (preserve) => set({ preserveInflections: preserve }),
  setDisableSliding: (disable) => set({ disableSliding: disable }),
  setAnchorWeight: (weight) => set({ anchorWeight: weight }),

  // ----- Generate (Lie-sphere transform → new curve) -----
  _refreshGeneratePreview: () => {
    const g = get().generate
    if (!g) return
    const meta = get().phMetadata.get(g.originalCurveId)
    if (!meta) return
    const origCurve = get().curves.find((c) => c.id === g.originalCurveId)
    if (!origCurve) return
    // Conjugate by the normalize/denormalize similarity so the generators act
    // on the unit-scale, origin-centred curve (uniform, sensible slider feel).
    const M = compose5(g.denorm, g.accumulated, liePoint5(g.coeffs), g.norm)
    const res = generatePreviewGeom(origCurve, meta, M)
    set((s) => ({
      curves: s.curves.map((c): Curve =>
        // The preview is always a fresh open rational curve — build it explicitly
        // rather than spreading c (whose complex-rational fields, e.g. a {re,im}
        // wrapWeight, would conflict with the rational shape).
        c.id === g.previewCurveId
          ? { id: c.id, kind: 'rational', degree: res.degree, knots: res.knots, controlPoints: res.controlPoints, closed: false }
          : c,
      ),
    }))
  },
  startGenerate: (curveId) => {
    if (get().generate) return
    const meta = get().phMetadata.get(curveId)
    if (!meta || (meta.kind !== 'ab-complex-rational' && meta.kind !== 'complex-rational' && meta.kind !== 'polynomial')) return
    const curve = get().curves.find((c) => c.id === curveId)
    if (!curve) return
    // Centre + unit-scale similarity from the curve's bounding box, so the Lie
    // generators act at unit scale (uniform slider sensitivity).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of curve.controlPoints) {
      const x = 're' in p ? p.re : p.x, y = 'im' in p ? p.im : p.y
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    const L = Math.max(1e-6, 0.5 * Math.hypot(maxX - minX, maxY - minY))
    const norm = compose5(scaling5(1 / L), translation5(-cx, -cy))
    const denorm = compose5(translation5(cx, cy), scaling5(L))

    const previewCurveId = generateCurveId()
    const res = generatePreviewGeom(curve, meta, identity5())
    const preview: Curve = {
      id: previewCurveId, kind: 'rational', degree: res.degree,
      knots: res.knots, controlPoints: res.controlPoints, closed: false,
    }
    set((s) => ({
      curves: [...s.curves, preview],
      generate: { originalCurveId: curveId, previewCurveId, accumulated: identity5(), coeffs: new Array(SHAPE_GENERATORS.length).fill(0), norm, denorm },
    }))
  },
  setGenerateCoeff: (index, value) => {
    const g = get().generate
    if (!g) return
    const coeffs = g.coeffs.slice()
    coeffs[index] = value
    set({ generate: { ...g, coeffs } })
    get()._refreshGeneratePreview()
  },
  applyGenerate: () => {
    const g = get().generate
    if (!g) return
    set({ generate: { ...g, accumulated: compose5(g.accumulated, liePoint5(g.coeffs)), coeffs: new Array(SHAPE_GENERATORS.length).fill(0) } })
    get()._refreshGeneratePreview()
  },
  resetGenerate: () => {
    const g = get().generate
    if (!g) return
    set({ generate: { ...g, accumulated: identity5(), coeffs: new Array(SHAPE_GENERATORS.length).fill(0) } })
    get()._refreshGeneratePreview()
  },
  doneGenerate: () => {
    const g = get().generate
    if (!g) return
    // The preview curve stays — it becomes an independent curve. Original untouched.
    set({ generate: null, selectedCurveId: g.previewCurveId })
    get().saveToHistory()
  },
  cancelGenerate: () => {
    const g = get().generate
    if (!g) return
    set((s) => ({
      curves: s.curves.filter((c) => c.id !== g.previewCurveId),
      generate: null,
      selectedCurveId: g.originalCurveId,
    }))
  },
  snapshotDragStartCPs: (curveId) => {
    const curve = get().curves.find((c) => c.id === curveId)
    if (!curve) return
    const cps = curve.controlPoints
    // Snapshot the drag-start control points — used as the anchor (drift
    // resistance) when anchorWeight > 0.
    set({
      dragStartCPsX: cps.map((p) => ('re' in p ? p.re : p.x)),
      dragStartCPsY: cps.map((p) => ('im' in p ? p.im : p.y)),
    })
  },
  clearDragStartCPs: () => set({ dragStartCPsX: null, dragStartCPsY: null }),

  // View actions
  setZoom: (zoom) =>
    set((state) => ({
      view: { ...state.view, zoom: Math.max(0.01, Math.min(100, zoom)) },
    })),

  zoomIn: () =>
    set((state) => ({
      view: { ...state.view, zoom: Math.min(100, state.view.zoom * 1.2) },
    })),

  zoomOut: () =>
    set((state) => ({
      view: { ...state.view, zoom: Math.max(0.01, state.view.zoom / 1.2) },
    })),

  setPan: (x, y) =>
    set((state) => ({
      view: { ...state.view, panX: x, panY: y },
    })),

  resetView: () =>
    set((state) => ({
      view: { ...state.view, zoom: 1, panX: 0, panY: 0 },
    })),

  fitAll: () => {
    const curves = get().curves
    if (curves.length === 0) {
      // Reset to default view if no curves
      set({ view: { zoom: 1, panX: 0, panY: 0 } })
      return
    }

    // Calculate bounds of all control points
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const curve of curves) {
      const points = getControlPointsAsPoints(curve)
      for (const p of points) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
    }

    // Calculate zoom to fit with padding
    const width = maxX - minX
    const height = maxY - minY
    const padding = 0.8 // 80% of viewport
    const viewWidth = window.innerWidth
    const viewHeight = window.innerHeight

    // Avoid division by zero for single point or aligned points
    const zoomX = width > 0 ? (viewWidth * padding) / width : 100
    const zoomY = height > 0 ? (viewHeight * padding) / height : 100
    const newZoom = Math.min(zoomX, zoomY, 100)

    // Center on curves
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    set({
      view: {
        zoom: Math.max(0.01, newZoom),
        panX: -centerX * Math.max(0.01, newZoom),
        panY: -centerY * Math.max(0.01, newZoom),
      },
    })
  },

  // History actions
  saveToHistory: () => {
    const state = get()
    const entry = createHistoryEntry(state.curves, state.spatialCurves, state.selectedCurveId, state.phMetadata)

    // Truncate future history if we're not at the end
    const newHistory = state.history.slice(0, state.historyIndex + 1)
    newHistory.push(entry)

    // Limit history size
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex <= 0) return

    const entry = state.history[state.historyIndex - 1]
    set({
      curves: entry.curves,
      spatialCurves: entry.spatialCurves,
      selectedCurveId: entry.selectedCurveId,
      phMetadata: new Map(entry.phMetadata), // keep coefficients in sync with restored geometry
      historyIndex: state.historyIndex - 1,
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return

    const entry = state.history[state.historyIndex + 1]
    set({
      curves: entry.curves,
      spatialCurves: entry.spatialCurves,
      selectedCurveId: entry.selectedCurveId,
      phMetadata: new Map(entry.phMetadata), // keep coefficients in sync with restored geometry
      historyIndex: state.historyIndex + 1,
    })
  },

  canUndo: () => get().historyIndex > 0,

  canRedo: () => {
    const state = get()
    return state.historyIndex < state.history.length - 1
  },

  // Curve operations
  elevateCurveDegree: (id) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === id)
    if (!curve) return

    // Polynomial PH curve: elevate u,v degree and recompute. Only polynomial PH
    // metadata carries u/v control points — guard on meta.kind (not just has(id)),
    // or ab/real/complex-rational kinds enter this branch and read undefined
    // fields. Other kinds fall through to the kind-aware generic elevateDegree
    // (matches insertKnotAtCurve).
    if (state.phMetadata.has(id)) {
      const meta = state.phMetadata.get(id)!
      if (meta.kind === 'polynomial') {
        const uResult = elevateDegree1D(meta.uControlPoints, meta.uvKnots, meta.uvDegree)
        const vResult = elevateDegree1D(meta.vControlPoints, meta.uvKnots, meta.uvDegree)
        const newUVDegree = meta.uvDegree + 1

        const phResult = computePHCurveFromUV(
          uResult.controlPoints, vResult.controlPoints, uResult.knots, newUVDegree, meta.origin.x, meta.origin.y
        )

        const newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(id, phResult.metadata)

        set((s) => ({
          curves: s.curves.map((c) =>
            c.id === id
              ? { ...c, controlPoints: phResult.controlPoints, knots: phResult.knots, degree: phResult.degree } as Curve
              : c
          ),
          phMetadata: newPhMetadata,
        }))
        get().saveToHistory()
        return
      }
    }

    const elevated = elevateDegree(curve)
    set((s) => ({
      curves: s.curves.map((c) => (c.id === id ? elevated : c)),
    }))
    get().saveToHistory()
  },

  insertKnotAtCurve: (id, t) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === id)
    if (!curve) return

    // PH curve: insert knot and recompute curve
    if (state.phMetadata.has(id)) {
      const meta = state.phMetadata.get(id)!

      if (meta.kind === 'polynomial') {
        // Polynomial PH: insert knot in u,v and recompute
        const uResult = insertKnot1D(meta.uControlPoints, meta.uvKnots, meta.uvDegree, t)
        const vResult = insertKnot1D(meta.vControlPoints, meta.uvKnots, meta.uvDegree, t)

        const phResult = computePHCurveFromUV(
          uResult.controlPoints, vResult.controlPoints, uResult.knots, meta.uvDegree, meta.origin.x, meta.origin.y
        )

        const newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(id, phResult.metadata)

        set((s) => ({
          curves: s.curves.map((c) =>
            c.id === id
              ? { ...c, controlPoints: phResult.controlPoints, knots: phResult.knots, degree: phResult.degree } as Curve
              : c
          ),
          phMetadata: newPhMetadata,
        }))
        get().saveToHistory()
        return
      }

      if (meta.kind === 'ab-complex-rational') {
        // AB PH: insert knot in A, B (shared knots) and S (own sKnots)
        const sDegree = meta.sKnots.length - meta.sReCPs.length - 1
        const aReResult = insertKnot1D(meta.aReCPs, meta.knots, meta.degree, t)
        const aImResult = insertKnot1D(meta.aImCPs, meta.knots, meta.degree, t)
        const bReResult = insertKnot1D(meta.bReCPs, meta.knots, meta.degree, t)
        const bImResult = insertKnot1D(meta.bImCPs, meta.knots, meta.degree, t)
        const sReResult = insertKnot1D(meta.sReCPs, meta.sKnots, sDegree, t)
        const sImResult = insertKnot1D(meta.sImCPs, meta.sKnots, sDegree, t)

        const newMeta: ABPHMetadata = {
          ...meta,
          aReCPs: aReResult.controlPoints,
          aImCPs: aImResult.controlPoints,
          bReCPs: bReResult.controlPoints,
          bImCPs: bImResult.controlPoints,
          sReCPs: sReResult.controlPoints,
          sImCPs: sImResult.controlPoints,
          knots: aReResult.knots,
          sKnots: sReResult.knots,
        }

        const abResult = computeABPHCurve(newMeta)
        const newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(id, newMeta)

        set((s) => ({
          curves: s.curves.map((c) =>
            c.id === id
              ? { ...c, controlPoints: abResult.controlPoints, knots: abResult.knots, degree: abResult.degree } as Curve
              : c
          ),
          phMetadata: newPhMetadata,
        }))
        get().saveToHistory()
        return
      }

      if (meta.kind === 'real-rational') {
        // Real-rational PH: insert knot in A, B (real), and S
        const sDegree = meta.sKnots.length - meta.sReCPs.length - 1
        const aReResult = insertKnot1D(meta.aReCPs, meta.knots, meta.degree, t)
        const aImResult = insertKnot1D(meta.aImCPs, meta.knots, meta.degree, t)
        const bResult = insertKnot1D(meta.bCPs, meta.knots, meta.degree, t)
        const sReResult = insertKnot1D(meta.sReCPs, meta.sKnots, sDegree, t)
        const sImResult = insertKnot1D(meta.sImCPs, meta.sKnots, sDegree, t)

        const newMeta: RealRationalPHMetadata = {
          ...meta,
          aReCPs: aReResult.controlPoints,
          aImCPs: aImResult.controlPoints,
          bCPs: bResult.controlPoints,
          sReCPs: sReResult.controlPoints,
          sImCPs: sImResult.controlPoints,
          knots: aReResult.knots,
          sKnots: sReResult.knots,
        }

        const rrResult = computeRealRationalPHCurve(newMeta)
        const newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(id, newMeta)

        set((s) => ({
          curves: s.curves.map((c) =>
            c.id === id
              ? { ...c, controlPoints: rrResult.controlPoints, knots: rrResult.knots, degree: rrResult.degree } as Curve
              : c
          ),
          phMetadata: newPhMetadata,
        }))
        get().saveToHistory()
        return
      }
    }

    const updated = insertKnot(curve, t)
    set((s) => ({
      curves: s.curves.map((c) => (c.id === id ? updated : c)),
    }))
    get().saveToHistory()
  },

  moveKnotAtCurve: (id, knotIndex, newValue) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === id)
    if (!curve) return

    const updated = moveKnot(curve, knotIndex, newValue)
    if (!updated) return

    set((s) => ({
      curves: s.curves.map((c) => (c.id === id ? updated : c)),
    }))
  },

  removeKnotFromCurve: (id, knotIndex) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === id)
    if (!curve) return

    // Polynomial PH curve: remove knot from u,v and recompute. Guard on meta.kind
    // (not just has(id)) — ab/real/complex-rational kinds lack u/v fields and would
    // read undefined here; they fall through to the kind-aware generic removeKnot.
    if (state.phMetadata.has(id)) {
      const meta = state.phMetadata.get(id)!
      if (meta.kind === 'polynomial') {
        const uResult = removeKnot1D(meta.uControlPoints, meta.uvKnots, meta.uvDegree, knotIndex)
        if (!uResult) return
        const vResult = removeKnot1D(meta.vControlPoints, meta.uvKnots, meta.uvDegree, knotIndex)
        if (!vResult) return

        const phResult = computePHCurveFromUV(
          uResult.controlPoints, vResult.controlPoints, uResult.knots, meta.uvDegree, meta.origin.x, meta.origin.y
        )

        const newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(id, phResult.metadata)

        set((s) => ({
          curves: s.curves.map((c) =>
            c.id === id
              ? { ...c, controlPoints: phResult.controlPoints, knots: phResult.knots, degree: phResult.degree } as Curve
              : c
          ),
          phMetadata: newPhMetadata,
          selectedKnotIndex: null,
        }))
        get().saveToHistory()
        return
      }
    }

    const updated = removeKnot(curve, knotIndex)
    if (!updated) return

    set((s) => ({
      curves: s.curves.map((c) => (c.id === id ? updated : c)),
      selectedKnotIndex: null,
    }))
    get().saveToHistory()
  },

  selectKnot: (index) => {
    set({ selectedKnotIndex: index, selectedControlPointIndex: null, selectedFarinPointIndex: null })
  },

  // Farin point actions
  selectFarinPoint: (index) => {
    set({ selectedFarinPointIndex: index, selectedControlPointIndex: null, selectedKnotIndex: null })
  },

  moveFarinPoint: (curveId, farinIndex, newPosition) => {
    const { curves, view } = get()
    const curve = curves.find((c) => c.id === curveId)
    if (!curve) return

    // Minimum distance constraint (in canvas coordinates)
    const minDistance = 5 / view.zoom

    if (curve.kind === 'rational') {
      // Use optimizer if preserveCurvatureExtrema is enabled
      const { preserveCurvatureExtrema } = get()
      if (preserveCurvatureExtrema) {
        try {
          const result = optimizeRationalFarinCurve(
            curve, newPosition.x, newPosition.y, farinIndex
          )
          if (result.converged || result.iterations > 0) {
            const optimizedCurve = applyOptimizeRationalFarinResult(curve, result)
            set((state) => ({
              curves: state.curves.map((c) => (c.id === curveId ? optimizedCurve : c)),
            }))
            return
          }
        } catch {
          // Fall through to direct move if optimization fails
        }
      }

      // Compute current Farin points to get edge info
      const farinPoints = computeRationalFarinPoints(curve)
      const farin = farinPoints[farinIndex]
      if (!farin) return

      // Project the new position onto the edge
      const { t } = projectPointOntoEdge(
        newPosition,
        farin.edgeStart,
        farin.edgeEnd,
        minDistance / Math.sqrt((farin.edgeEnd.x - farin.edgeStart.x) ** 2 + (farin.edgeEnd.y - farin.edgeStart.y) ** 2 + 1e-10),
        1 - minDistance / Math.sqrt((farin.edgeEnd.x - farin.edgeStart.x) ** 2 + (farin.edgeEnd.y - farin.edgeStart.y) ** 2 + 1e-10)
      )

      // Update weights based on new t value
      const result = updateWeightsFromRationalFarin(curve, farinIndex, t, 0.01)

      set((state) => ({
        curves: state.curves.map((c) =>
          c.id === curveId
            ? {
                ...curve,
                controlPoints: result.newPoints,
                // For closed curves, also update farinTValues and wrapWeight
                ...(result.newFarinTValues ? { farinTValues: result.newFarinTValues } : {}),
                ...(result.newWrapWeight !== undefined ? { wrapWeight: result.newWrapWeight } : {}),
              }
            : c
        ),
      }))
    } else if (curve.kind === 'complex-rational') {
      // Use optimizer if preserveCurvatureExtrema is enabled for complex-rational curves
      const { preserveCurvatureExtrema } = get()
      if (preserveCurvatureExtrema) {
        try {
          const result = optimizeComplexRationalCurve(
            curve, newPosition.x, newPosition.y, farinIndex, 'farinPoint'
          )
          if (result.converged || result.iterations > 0) {
            const optimizedCurve = applyComplexRationalOptimizeResult(curve, result)
            set((state) => ({
              curves: state.curves.map((c) => (c.id === curveId ? optimizedCurve : c)),
            }))
            return
          }
        } catch {
          // Fall through to direct move if optimization fails
        }
      }

      // Complex Farin points have free 2D movement
      const result = updateWeightsFromComplexFarin(curve, farinIndex, newPosition, minDistance)

      set((state) => ({
        curves: state.curves.map((c) =>
          c.id === curveId
            ? {
                ...curve,
                controlPoints: result.newPoints,
                // For closed curves, also update farinPositions and wrapWeight
                ...(result.newFarinPositions ? { farinPositions: result.newFarinPositions } : {}),
                ...(result.newWrapWeight ? { wrapWeight: result.newWrapWeight } : {}),
              }
            : c
        ),
      }))
    }
  },

  convertCurveType: (id, newKind) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === id)
    if (!curve || curve.kind === newKind) return

    let converted: Curve
    switch (newKind) {
      case 'bspline':
        converted = toBSpline(curve)
        break
      case 'rational':
        converted = toRationalBSpline(curve)
        break
      case 'complex-rational':
        converted = toComplexRationalBSpline(curve)
        break
    }

    // The converted curve is a plain bspline/rational/complex-rational, not a PH
    // curve — drop any stale defining-coefficient metadata so a later has(id)
    // doesn't read it against the wrong kind.
    const clearedPhMetadata = state.phMetadata.has(id)
      ? new Map([...state.phMetadata].filter(([key]) => key !== id))
      : null

    set((s) => ({
      curves: s.curves.map((c) => (c.id === id ? converted : c)),
      selectedFarinPointIndex: null,
      ...(clearedPhMetadata ? { phMetadata: clearedPhMetadata } : {}),
    }))
    get().saveToHistory()
  },

  // Transform widget actions
  startTransform: (requestedWidgetType?) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === state.selectedCurveId)
    if (!curve) return

    // Deep copy the original curve
    const originalCurve = JSON.parse(JSON.stringify(curve)) as Curve

    // Determine widget type and compute initial widget
    const points = getControlPointsAsPoints(curve)
    let widgetType: 'parallelogram' | 'quadrilateral' | 'mobius' | 'laguerre'
    let widgetPoints: Point2D[]
    let originalLaguerreLines: OrientedLine[] | null = null

    if (requestedWidgetType) {
      widgetType = requestedWidgetType
    } else if (curve.kind === 'complex-rational') {
      widgetType = 'mobius'
    } else if (curve.kind === 'rational') {
      widgetType = 'quadrilateral'
    } else {
      widgetType = 'parallelogram'
    }

    if (widgetType === 'laguerre') {
      const { lines } = laguerreWidgetFromBBox(points)
      originalLaguerreLines = lines.map(l => ({ ...l }))
      widgetPoints = linesToHandlePoints(lines)
    } else if (widgetType === 'mobius') {
      const { handlePoints } = computeCircleFromBBox(points)
      widgetPoints = handlePoints
    } else if (widgetType === 'quadrilateral') {
      const { corners } = computeBBox(points)
      widgetPoints = corners
    } else {
      const { corners } = computeBBox(points)
      widgetPoints = corners
    }

    // Save original PH metadata for AB PH curves
    let originalPhMeta: ABPHMetadata | null = null
    const meta = state.phMetadata.get(curve.id)
    if (meta && meta.kind === 'ab-complex-rational') {
      originalPhMeta = { ...meta } as ABPHMetadata
    }

    set({
      transformActive: true,
      transformOriginalCurve: originalCurve,
      transformOriginalPhMeta: originalPhMeta,
      transformWidgetType: widgetType,
      transformOriginalWidget: widgetPoints.map(p => ({ ...p })),
      transformCurrentWidget: widgetPoints.map(p => ({ ...p })),
      transformOriginalLaguerreLines: originalLaguerreLines,
    })
    get().saveToHistory()
  },

  commitTransform: () => {
    const state = get()
    // If Laguerre transform was applied, the curve is no longer PH
    let newPhMetadata: Map<string, PHMetadata | ComplexRationalPHMetadata | ABPHMetadata | RealRationalPHMetadata> | undefined
    if (state.transformWidgetType === 'laguerre' && state.transformOriginalCurve) {
      newPhMetadata = new Map(state.phMetadata)
      newPhMetadata.delete(state.transformOriginalCurve.id)
    }

    set({
      transformActive: false,
      transformOriginalCurve: null,
      transformOriginalPhMeta: null,
      transformWidgetType: null,
      transformOriginalWidget: null,
      transformCurrentWidget: null,
      transformOriginalLaguerreLines: null,
      ...(newPhMetadata ? { phMetadata: newPhMetadata } : {}),
    })
  },

  cancelTransform: () => {
    const state = get()
    if (!state.transformActive || !state.transformOriginalCurve) return

    // Restore original curve and PH metadata
    const originalCurve = state.transformOriginalCurve
    let restoredPhMetadata: Map<string, PHMetadata | ComplexRationalPHMetadata | ABPHMetadata | RealRationalPHMetadata> | undefined
    if (state.transformOriginalPhMeta) {
      restoredPhMetadata = new Map(state.phMetadata)
      restoredPhMetadata.set(originalCurve.id, state.transformOriginalPhMeta)
    }

    set({
      curves: state.curves.map((c) =>
        c.id === originalCurve.id ? originalCurve : c
      ),
      transformActive: false,
      transformOriginalCurve: null,
      transformOriginalPhMeta: null,
      transformWidgetType: null,
      transformOriginalWidget: null,
      transformCurrentWidget: null,
      transformOriginalLaguerreLines: null,
      ...(restoredPhMetadata ? { phMetadata: restoredPhMetadata } : {}),
    })
  },

  moveTransformHandle: (handleIndex, handleType, newPosition) => {
    const state = get()
    if (!state.transformActive || !state.transformOriginalCurve ||
        !state.transformOriginalWidget || !state.transformCurrentWidget ||
        !state.transformWidgetType) return

    const originalCurve = state.transformOriginalCurve
    const originalWidget = state.transformOriginalWidget
    let newWidget: Point2D[]

    if (state.transformWidgetType === 'laguerre') {
      // Laguerre: 6 handles (3 position + 3 rotation)
      newWidget = state.transformCurrentWidget.map(p => ({ ...p }))
      if (handleIndex < 3) {
        // Position handle: translate the line (move both pos and rot handle)
        const dx = newPosition.x - newWidget[handleIndex].x
        const dy = newPosition.y - newWidget[handleIndex].y
        newWidget[handleIndex] = { ...newPosition }
        newWidget[handleIndex + 3] = {
          x: newWidget[handleIndex + 3].x + dx,
          y: newWidget[handleIndex + 3].y + dy,
        }
      } else {
        // Rotation handle: rotate the line orientation
        newWidget[handleIndex] = { ...newPosition }
      }
    } else if (state.transformWidgetType === 'mobius') {
      // Mobius: 3 handle points, free movement
      newWidget = state.transformCurrentWidget.map(p => ({ ...p }))
      newWidget[handleIndex] = { ...newPosition }
    } else if (state.transformWidgetType === 'parallelogram') {
      if (handleType === 'corner') {
        newWidget = constrainParallelogram(state.transformCurrentWidget, handleIndex, newPosition)
      } else {
        newWidget = applyParallelogramMidpointDrag(state.transformCurrentWidget, handleIndex, newPosition)
      }
    } else {
      // quadrilateral: free movement for corners, constrained for midpoints
      if (handleType === 'corner') {
        newWidget = state.transformCurrentWidget.map(p => ({ ...p }))
        newWidget[handleIndex] = { ...newPosition }
      } else {
        newWidget = applyQuadrilateralMidpointDrag(state.transformCurrentWidget, handleIndex, newPosition)
      }
    }

    // Compute the transform from original widget -> new widget
    // and apply to original control points
    let updatedCurve: Curve | null = null
    let updatedPhMeta: ABPHMetadata | null = null

    if (state.transformWidgetType === 'laguerre' && state.transformOriginalPhMeta && state.transformOriginalLaguerreLines) {
      // Laguerre transform on AB PH curve
      const currentLines = handlePointsToLines(newWidget)
      const M = computeLaguerreMatrix(state.transformOriginalLaguerreLines, currentLines)
      try {
        const result = applyLaguerreToABPH(M, state.transformOriginalPhMeta)
        updatedCurve = {
          ...originalCurve,
          kind: 'complex-rational' as const,
          controlPoints: result.controlPoints,
          knots: result.knots,
          degree: result.degree,
        } as Curve
      } catch (err) {
        console.warn('Laguerre transform failed:', err)
      }
    } else if (state.transformWidgetType === 'parallelogram' && originalCurve.kind === 'bspline') {
      const origRef = getAffineReferencePoints(originalWidget)
      const newRef = getAffineReferencePoints(newWidget)
      const transform = computeAffineTransform(origRef, newRef)
      if (transform) {
        const newCPs = applyAffineToBSpline(transform, originalCurve.controlPoints)
        updatedCurve = { ...originalCurve, controlPoints: newCPs }
      }
    } else if (state.transformWidgetType === 'quadrilateral' && originalCurve.kind === 'rational') {
      const origRef = getProjectiveReferencePoints(originalWidget)
      const newRef = getProjectiveReferencePoints(newWidget)
      const transform = computeProjectiveTransform(origRef, newRef)
      if (transform) {
        const newCPs = applyProjectiveToRational(transform, originalCurve.controlPoints)

        // Update wrapWeight for closed curves
        let newWrapWeight = originalCurve.wrapWeight
        if (originalCurve.closed && originalCurve.wrapWeight !== undefined) {
          const oldW0 = originalCurve.controlPoints[0].w
          const newW0 = newCPs[0].w
          if (Math.abs(oldW0) > 1e-14) {
            newWrapWeight = originalCurve.wrapWeight * (newW0 / oldW0)
          }
        }

        // Recompute farinTValues from new weights
        let newFarinTValues: number[] | undefined
        if (originalCurve.closed && originalCurve.farinTValues) {
          const n = newCPs.length
          const numEdges = n
          newFarinTValues = []
          for (let i = 0; i < numEdges; i++) {
            const isWrapEdge = i === numEdges - 1
            const w0 = newCPs[i].w
            const w1 = isWrapEdge ? (newWrapWeight ?? newCPs[0].w) : newCPs[(i + 1) % n].w
            const total = w0 + w1
            newFarinTValues.push(total > 0 ? w1 / total : 0.5)
          }
        }

        updatedCurve = {
          ...originalCurve,
          controlPoints: newCPs,
          ...(newWrapWeight !== undefined ? { wrapWeight: newWrapWeight } : {}),
          ...(newFarinTValues ? { farinTValues: newFarinTValues } : {}),
        }
      }
    } else if (state.transformWidgetType === 'mobius' && originalCurve.kind === 'complex-rational') {
      const origRef = originalWidget.map(p => ({ re: p.x, im: p.y }))
      const newRef = newWidget.map(p => ({ re: p.x, im: p.y }))
      const transform = computeMobiusTransform(origRef, newRef)
      if (transform) {
        // For AB PH curves, derive visible CPs from metadata to ensure consistency
        // Use the saved original metadata (not state.phMetadata which gets updated each move)
        if (state.transformOriginalPhMeta) {
          const newMeta = applyMobiusToABPH(transform, state.transformOriginalPhMeta)
          const abResult = computeABPHCurve(newMeta)
          updatedPhMeta = newMeta
          updatedCurve = {
            ...originalCurve,
            controlPoints: abResult.controlPoints,
          }
        } else {
          const newCPs = applyMobiusToComplexRational(transform, originalCurve.controlPoints)

          // Update wrapWeight for closed curves
          let newWrapWeight = originalCurve.wrapWeight
          if (originalCurve.closed && originalCurve.wrapWeight) {
            const oldW0re = originalCurve.controlPoints[0].w_re
            const oldW0im = originalCurve.controlPoints[0].w_im
            const newW0re = newCPs[0].w_re
            const newW0im = newCPs[0].w_im
            const oldW0: Complex = { re: oldW0re, im: oldW0im }
            const newW0: Complex = { re: newW0re, im: newW0im }
            const oldWrap: Complex = { re: originalCurve.wrapWeight.re, im: originalCurve.wrapWeight.im }
            if (cnorm(oldW0) > 1e-14) {
              const ratio = cdiv(newW0, oldW0)
              const newWrap = cmult(oldWrap, ratio)
              newWrapWeight = { re: newWrap.re, im: newWrap.im }
            }
          }

          // Recompute farinPositions from new weights
          let newFarinPositions: Point2D[] | undefined
          if (originalCurve.closed) {
            newFarinPositions = initializeFarinPositionsFromComplexWeights(newCPs, true)
            // For the wrap edge, use wrapWeight
            if (newWrapWeight && newFarinPositions.length > 0) {
              const n = newCPs.length
              const lastIdx = newFarinPositions.length - 1
              const cpLast = newCPs[n - 1]
              const cpFirst = newCPs[0]
              const wLast: Complex = { re: cpLast.w_re, im: cpLast.w_im }
              const wFirst: Complex = { re: newWrapWeight.re, im: newWrapWeight.im }
              const zLast: Complex = { re: cpLast.re, im: cpLast.im }
              const zFirst: Complex = { re: cpFirst.re, im: cpFirst.im }
              const c0 = cmult(wLast, zLast)
              const c1 = cmult(wFirst, zFirst)
              const num = { re: c0.re + c1.re, im: c0.im + c1.im }
              const denom = { re: wLast.re + wFirst.re, im: wLast.im + wFirst.im }
              const q = cdiv(num, denom)
              newFarinPositions[lastIdx] = { x: q.re, y: q.im }
            }
          } else if (originalCurve.farinPositions) {
            // OPEN curve: the Möbius changed the control-point weights, so the
            // stored Farin points (which a later control-point move treats as the
            // source of truth) must be recomputed from the NEW weights. Without
            // this they stay stale, and the next move snaps the curve back toward
            // the old weights — a sudden shape change on the first drag. (Closed
            // curves are handled above, with the extra wrap/monodromy term.)
            newFarinPositions = initializeFarinPositionsFromComplexWeights(newCPs, false)
          }

          updatedCurve = {
            ...originalCurve,
            controlPoints: newCPs,
            ...(newWrapWeight ? { wrapWeight: newWrapWeight } : {}),
            ...(newFarinPositions ? { farinPositions: newFarinPositions } : {}),
          }
        }
      }
    }

    if (updatedCurve) {
      // Update PH metadata if it was set during transform
      let newPhMetadata: Map<string, PHMetadata | ComplexRationalPHMetadata | ABPHMetadata | RealRationalPHMetadata> | undefined
      if (updatedPhMeta) {
        newPhMetadata = new Map(state.phMetadata)
        newPhMetadata.set(originalCurve.id, updatedPhMeta)
      }

      set({
        transformCurrentWidget: newWidget,
        curves: state.curves.map((c) =>
          c.id === originalCurve.id ? updatedCurve! : c
        ),
        ...(newPhMetadata ? { phMetadata: newPhMetadata } : {}),
      })
    } else {
      // Transform computation failed (singular), just update the widget
      set({ transformCurrentWidget: newWidget })
    }
  },

  // PH curve offset actions
  setOffsetSourceCurveId: (id) => set({ offsetSourceCurveId: id }),

  createOffsetCurve: (sourceCurveId, distance) => {
    const state = get()
    const rawMetadata = state.phMetadata.get(sourceCurveId)
    if (!rawMetadata) return

    let curve: Curve

    if (rawMetadata.kind === 'ab-complex-rational') {
      // AB PH: exact complex-rational offset (accounts for B rotation)
      const offset = computeABPHOffset(rawMetadata, distance)
      curve = {
        id: generateCurveId(),
        kind: 'complex-rational',
        degree: offset.degree,
        knots: offset.knots,
        controlPoints: offset.controlPoints,
        closed: false,
      }
    } else if (rawMetadata.kind === 'complex-rational') {
      // (S, D) PH: adapt to (A, B, S) and reuse the exact AB offset.
      const srcCurve = state.curves.find((c) => c.id === sourceCurveId)
      if (!srcCurve) return
      const offset = computeABPHOffset(abShapeForGenerate(srcCurve, rawMetadata), distance)
      curve = {
        id: generateCurveId(),
        kind: 'complex-rational',
        degree: offset.degree,
        knots: offset.knots,
        controlPoints: offset.controlPoints,
        closed: false,
      }
    } else if (rawMetadata.kind === 'real-rational') {
      // Real rational PH: offset produces real rational curve
      const offset = computeRealRationalPHOffset(rawMetadata, distance)
      curve = {
        id: generateCurveId(),
        kind: 'rational',
        degree: offset.degree,
        knots: offset.knots,
        controlPoints: offset.controlPoints,
        closed: false,
      }
    } else {
      // Polynomial PH: existing path
      const metadata = rawMetadata as PHMetadata
      const curveResult = computePHCurveFromUV(
        metadata.uControlPoints,
        metadata.vControlPoints,
        metadata.uvKnots,
        metadata.uvDegree,
        metadata.origin.x,
        metadata.origin.y,
      )
      const offset = computePHOffset(metadata, curveResult, distance)
      curve = {
        id: generateCurveId(),
        kind: 'rational',
        degree: offset.degree,
        knots: offset.knots,
        controlPoints: offset.controlPoints,
        closed: false,
      }
    }

    set((s) => ({
      curves: [...s.curves, curve],
      // Keep original PH curve selected (don't select the new offset curve)
      // If not locked, reset tool; if locked, stay in offset mode
      ...(!s.toolLocked
        ? { activeTool: 'none' as DrawingTool, offsetSourceCurveId: null }
        : {}),
    }))
    get().saveToHistory()
  },

  // Endpoint snap actions
  setEndpointSnapTarget: (target) => {
    set({ endpointSnapTarget: target })
  },

  closeCurveByMergingEndpoints: (curveId, draggedPointIndex) => {
    const state = get()
    const curve = state.curves.find((c) => c.id === curveId)
    if (!curve || curve.closed) return
    // Closed PH curves aren't supported — never close a PH curve, whatever path
    // (mouse, touch) got here.
    if (state.phMetadata.has(curveId)) return

    const n = curve.controlPoints.length
    const minPoints = curve.kind === 'complex-rational' ? 3 : 4
    if (n < minPoints) return

    // Determine which point is being dragged and which is the target
    const isFirst = draggedPointIndex === 0
    const isLast = draggedPointIndex === n - 1
    if (!isFirst && !isLast) return // Only first or last can be merged

    // Create new control points array for the closed curve
    // Both directions should produce the same control point structure:
    // [P1, P2, ..., P(n-1)] - always remove P0, keep P(n-1) as the junction point
    //
    // Case A (drag first onto last): P(n-1) stays at its position (target)
    // Case B (drag last onto first): P(n-1) moves to P0's position (target)
    //
    // This ensures both operations produce identical structure, only the
    // junction point's position differs based on the target.

    let newControlPoints: typeof curve.controlPoints
    const targetIdx = isFirst ? n - 1 : 0  // Target is the point being dropped onto

    if (curve.kind === 'bspline') {
      // Remove first point: [P1, P2, ..., P(n-1)]
      const cps = curve.controlPoints.slice(1).map(p => ({ ...p }))
      // Move last control point (junction) to target position
      const target = curve.controlPoints[targetIdx]
      cps[cps.length - 1] = { x: target.x, y: target.y }
      newControlPoints = cps
    } else if (curve.kind === 'rational') {
      const cps = curve.controlPoints.slice(1).map(p => ({ ...p }))
      const target = curve.controlPoints[targetIdx]
      cps[cps.length - 1] = { ...cps[cps.length - 1], x: target.x, y: target.y }
      newControlPoints = cps
    } else if (curve.kind === 'complex-rational') {
      // complex-rational
      const cps = curve.controlPoints.slice(1).map(p => ({ ...p }))
      const target = curve.controlPoints[targetIdx]
      cps[cps.length - 1] = { ...cps[cps.length - 1], re: target.re, im: target.im }
      newControlPoints = cps
    } else {
      return // κ-curves don't support endpoint merging
    }

    // Generate C^0 junction knots for the closed curve
    // For periodic B-splines, we keep the original degree even if degree >= n
    // This creates a "high winding" curve where basis functions wrap around
    const degree = curve.degree
    const knots = periodicKnotsWithJunction(newControlPoints.length, degree)

    // For complex-rational curves, compute farinPositions and wrapWeight
    let farinPositions: Point2D[] | undefined
    let wrapWeight: { re: number; im: number } | undefined

    if (curve.kind === 'complex-rational') {
      const cps = newControlPoints as import('../types/curve').ComplexPoint[]
      const newN = cps.length

      // If the curve doesn't have farinPositions stored, compute them now from the current weights
      // This ensures we have the original Farin positions to preserve
      let originalFarinPositions = curve.farinPositions
      if (!originalFarinPositions || originalFarinPositions.length !== n - 1) {
        originalFarinPositions = initializeFarinPositionsFromComplexWeights(curve.controlPoints, curve.closed)
      }

      // When closing, we need to preserve existing Farin positions where edges are unchanged
      // Original open curve had n CPs with (n-1) edges: P0→P1, P1→P2, ..., P(n-2)→P(n-1)
      // After removing P0, new closed curve has (n-1) CPs with (n-1) edges:
      //   Edge 0: P1→P2 (was original edge 1) → use original F1
      //   Edge 1: P2→P3 (was original edge 2) → use original F2
      //   ...
      //   Edge (n-3): P(n-2)→P(n-1)' (endpoint moved) → recompute
      //   Edge (n-2): P(n-1)'→P1 (wrap-around, new edge) → use original F0 as basis

      if (originalFarinPositions && originalFarinPositions.length === n - 1) {
        // Preserve Farin positions by shifting indices
        farinPositions = []

        for (let i = 0; i < newN; i++) {
          if (i < newN - 2) {
            // Edges that are unchanged: new edge i corresponds to original edge i+1
            farinPositions.push({ ...originalFarinPositions[i + 1] })
          } else if (i === newN - 2) {
            // Second-to-last edge: P(n-2)→P(n-1)'
            // P(n-1) may have moved to the merge position
            //
            // Check if P0 and P(n-1) are close enough to be considered coincident
            // Use CLOSE_SNAP_THRESHOLD to match the visual snapping behavior
            const originalP0 = curve.controlPoints[0]
            const originalPLast = curve.controlPoints[n - 1]
            const endpointDistance = Math.sqrt(
              (originalP0.re - originalPLast.re) ** 2 + (originalP0.im - originalPLast.im) ** 2
            )
            const areEndpointsClose = endpointDistance < CLOSE_SNAP_THRESHOLD

            if (areEndpointsClose) {
              // Endpoints already coincided - this edge is unchanged, preserve original Farin
              // Original edge index: (n-2)→(n-1) corresponds to originalFarinPositions[n-2]
              farinPositions.push({ ...originalFarinPositions[n - 2] })
            } else {
              // Endpoint moved - recompute Farin position with new endpoint
              const cp0 = cps[i]
              const cp1 = cps[(i + 1) % newN]
              const z0: Complex = { re: cp0.re, im: cp0.im }
              const z1: Complex = { re: cp1.re, im: cp1.im }
              const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
              const w1: Complex = { re: cp1.w_re, im: cp1.w_im }
              const c0 = cmult(w0, z0)
              const c1 = cmult(w1, z1)
              const num = { re: c0.re + c1.re, im: c0.im + c1.im }
              const denom = { re: w0.re + w1.re, im: w0.im + w1.im }
              const q = cdiv(num, denom)
              farinPositions.push({ x: q.re, y: q.im })
            }
          } else {
            // Last edge (wrap-around): P(n-1)'→P1
            // This edge connects the merged point back to P1
            //
            // Key insight: When the endpoints are brought together (P0 ≈ P(n-1)),
            // this wrap-around edge is geometrically the same as the original P0→P1 edge.
            // To preserve the curve shape, we should use the original Farin[0] position.
            //
            // Check if the merged point (P(n-1)') is at the same position as where P0 was
            // Check if the merged point is close to where P0 was
            // Use CLOSE_SNAP_THRESHOLD to match the visual snapping behavior
            const cp0 = cps[i]  // P(n-1)' (the merged point)
            const originalP0 = curve.controlPoints[0]
            const positionDiff = Math.sqrt(
              (cp0.re - originalP0.re) ** 2 + (cp0.im - originalP0.im) ** 2
            )

            if (positionDiff < CLOSE_SNAP_THRESHOLD) {
              // Endpoints coincide - preserve the original Farin[0] to maintain curve shape
              farinPositions.push({ ...originalFarinPositions[0] })
            } else {
              // Endpoints don't coincide - compute new Farin position
              const cp1 = cps[0]  // P1 (which was original P1)
              const z0: Complex = { re: cp0.re, im: cp0.im }
              const z1: Complex = { re: cp1.re, im: cp1.im }
              const w0: Complex = { re: cp0.w_re, im: cp0.w_im }
              const w1: Complex = { re: cp1.w_re, im: cp1.w_im }
              const c0 = cmult(w0, z0)
              const c1 = cmult(w1, z1)
              const num = { re: c0.re + c1.re, im: c0.im + c1.im }
              const denom = { re: w0.re + w1.re, im: w0.im + w1.im }
              const q = cdiv(num, denom)
              farinPositions.push({ x: q.re, y: q.im })
            }
          }
        }
      } else {
        // No existing Farin positions, compute from weights
        farinPositions = initializeFarinPositionsFromComplexWeights(cps, true)
      }

      // Compute wrapWeight from the last edge
      const qLast = farinPositions[newN - 1]
      const zLast = cps[newN - 1]
      const zFirst = cps[0]
      const wLast: Complex = { re: zLast.w_re, im: zLast.w_im }

      const qLastComplex: Complex = { re: qLast.x, im: qLast.y }
      const zLastComplex: Complex = { re: zLast.re, im: zLast.im }
      const zFirstComplex: Complex = { re: zFirst.re, im: zFirst.im }

      const numWrap = csub(qLastComplex, zLastComplex)
      const denomWrap = csub(zFirstComplex, qLastComplex)

      if (cnorm(denomWrap) < 1e-10) {
        wrapWeight = { re: wLast.re, im: wLast.im }
      } else {
        const w = cmult(wLast, cdiv(numWrap, denomWrap))
        wrapWeight = { re: w.re, im: w.im }
      }
    }

    const closedCurve = {
      ...curve,
      controlPoints: newControlPoints,
      knots,
      degree,
      closed: true,
      ...(farinPositions ? { farinPositions } : {}),
      ...(wrapWeight ? { wrapWeight } : {}),
    } as typeof curve

    set((s) => ({
      curves: s.curves.map((c) => (c.id === curveId ? closedCurve : c)),
      selectedControlPointIndex: null,
      endpointSnapTarget: null,
    }))
    get().saveToHistory()
  },

  clearAll: () => {
    const state = get()
    if (state.curves.length === 0 && state.spatialCurves.length === 0) return
    set({
      curves: [],
      spatialCurves: [],
      selectedCurveId: null,
      selectedControlPointIndex: null,
      showHint: true,
      phMetadata: new Map<string, PHMetadata>(),
    })
    get().saveToHistory()
  },

  loadScene: (curves, phMetadata, spatialCurves) => {
    set({
      curves,
      spatialCurves,
      selectedCurveId: null,
      selectedControlPointIndex: null,
      selectedKnotIndex: null,
      selectedFarinPointIndex: null,
      showHint: curves.length === 0,
      phMetadata: new Map(phMetadata),
    })
    get().saveToHistory()
  },

  // ── Spatial curves (3D) ───────────────────────────────────────────

  addSpatialCurves: (newCurves) =>
    set((s) => ({ spatialCurves: [...s.spatialCurves, ...newCurves] })),

  deleteSpatialCurve: (id) => {
    set((s) => ({
      spatialCurves: s.spatialCurves.filter((c) => c.id !== id),
      selectedCurveId: s.selectedCurveId === id ? null : s.selectedCurveId,
      selectedControlPointIndex: s.selectedCurveId === id ? null : s.selectedControlPointIndex,
      selectedKnotIndex: s.selectedCurveId === id ? null : s.selectedKnotIndex,
    }))
    get().saveToHistory()
  },

  moveSpatialControlPoint: (curveId, index, position) => {
    set((s) => ({
      spatialCurves: s.spatialCurves.map((c) => {
        if (c.id !== curveId) return c
        const newControlPoints = [...c.controlPoints]
        newControlPoints[index] = position
        return { ...c, controlPoints: newControlPoints }
      }),
    }))
  },

  elevateSpatialCurveDegree: (id) => {
    const state = get()
    const curve = state.spatialCurves.find((c) => c.id === id)
    if (!curve) return
    const { controlPoints: newCPs, knots: newKnots } = elevateDegreeBy1BSpline3D(
      curve.controlPoints,
      curve.knots,
      curve.degree
    )
    set({
      spatialCurves: state.spatialCurves.map((c) =>
        c.id === id
          ? { ...c, controlPoints: newCPs, knots: newKnots, degree: curve.degree + 1 }
          : c
      ),
    })
    get().saveToHistory()
  },

  moveSpatialKnot: (curveId, knotIndex, newValue) => {
    const state = get()
    const curve = state.spatialCurves.find((c) => c.id === curveId)
    if (!curve) return
    const { degree, knots } = curve

    if (isClampedEndKnot(degree, knots, knotIndex)) return

    const tMin = knots[0]
    const tMax = knots[knots.length - 1]
    const clampedValue = Math.max(tMin, Math.min(tMax, newValue))

    const newKnots = [...knots]
    newKnots[knotIndex] = clampedValue

    for (let i = knotIndex - 1; i > degree; i--) {
      if (newKnots[i] > newKnots[i + 1]) {
        newKnots[i] = newKnots[i + 1]
      } else {
        break
      }
    }

    for (let i = knotIndex + 1; i < knots.length - degree - 1; i++) {
      if (newKnots[i] < newKnots[i - 1]) {
        newKnots[i] = newKnots[i - 1]
      } else {
        break
      }
    }

    set({
      spatialCurves: state.spatialCurves.map((c) =>
        c.id === curveId ? { ...c, knots: newKnots } : c
      ),
    })
  },

  insertSpatialKnot: (curveId, t) => {
    const state = get()
    const curve = state.spatialCurves.find((c) => c.id === curveId)
    if (!curve) return
    const { degree, knots, controlPoints } = curve

    const span = findKnotSpan(degree, knots, t)
    const newKnots = [...knots.slice(0, span + 1), t, ...knots.slice(span + 1)]

    const oldPoints = controlPoints
    const newPoints: Point3D[] = []

    for (let i = 0; i <= span - degree; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    for (let i = span - degree + 1; i <= span; i++) {
      const alpha = (t - knots[i]) / (knots[i + degree] - knots[i])
      newPoints.push({
        x: (1 - alpha) * oldPoints[i - 1].x + alpha * oldPoints[i].x,
        y: (1 - alpha) * oldPoints[i - 1].y + alpha * oldPoints[i].y,
        z: (1 - alpha) * oldPoints[i - 1].z + alpha * oldPoints[i].z,
      })
    }

    for (let i = span; i < oldPoints.length; i++) {
      newPoints.push({ ...oldPoints[i] })
    }

    set({
      spatialCurves: state.spatialCurves.map((c) =>
        c.id === curveId ? { ...c, knots: newKnots, controlPoints: newPoints } : c
      ),
    })
    get().saveToHistory()
  },

  removeSpatialKnot: (curveId, knotIndex) => {
    const state = get()
    const curve = state.spatialCurves.find((c) => c.id === curveId)
    if (!curve) return
    const { degree, knots, controlPoints } = curve

    if (isClampedEndKnot(degree, knots, knotIndex)) return
    if (controlPoints.length <= degree + 1) return

    const newKnots = [...knots.slice(0, knotIndex), ...knots.slice(knotIndex + 1)]
    const cpIndex = Math.max(0, Math.min(controlPoints.length - 1, knotIndex - degree))
    const newControlPoints = [
      ...controlPoints.slice(0, cpIndex),
      ...controlPoints.slice(cpIndex + 1),
    ]

    set({
      spatialCurves: state.spatialCurves.map((c) =>
        c.id === curveId
          ? { ...c, knots: newKnots, controlPoints: newControlPoints }
          : c
      ),
      selectedKnotIndex: null,
    })
    get().saveToHistory()
  },

  graduateCurve: (planarCurveId) => {
    const state = get()
    const curve2D = state.curves.find((c) => c.id === planarCurveId)
    if (!curve2D || curve2D.kind !== 'bspline') return

    const curve3D: Curve3D = {
      id: `grad-${planarCurveId}-${Date.now()}`,
      controlPoints: curve2D.controlPoints.map((p) => ({
        x: p.x / 500,
        y: 0,
        z: p.y / 500,
      })),
      knots: [...curve2D.knots],
      degree: curve2D.degree,
      closed: curve2D.closed,
    }

    set((s) => ({
      curves: s.curves.filter((c) => c.id !== planarCurveId),
      spatialCurves: [...s.spatialCurves, curve3D],
      selectedCurveId: curve3D.id,
      selectedKnotIndex: null,
    }))
    get().saveToHistory()
  },

  findCurve: (id) => {
    const state = get()
    const planar = state.curves.find((c) => c.id === id)
    if (planar) return { curve: planar, source: 'planar' as CurveSource }
    const spatial = state.spatialCurves.find((c) => c.id === id)
    if (spatial) return { curve: spatial, source: 'spatial' as CurveSource }
    return null
  },
}))

// Curvature-adaptive, arc-length-based point simplification.
// Places more control points in high-curvature regions and fewer in straight sections,
// independent of drawing speed.
function simplifyPointsCurvatureAdaptive(
  points: Point2D[],
  minCount: number = 4,
  maxCount: number = 15,
): Point2D[] {
  if (points.length <= minCount) return [...points]

  const n = points.length

  // Step 1: Compute cumulative arc lengths
  const arcLengths = new Float64Array(n)
  arcLengths[0] = 0
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    arcLengths[i] = arcLengths[i - 1] + Math.sqrt(dx * dx + dy * dy)
  }
  const totalArcLength = arcLengths[n - 1]
  if (totalArcLength === 0) return [points[0], points[n - 1]]

  // Step 2: Estimate curvature at each interior point (Menger curvature)
  const curvature = new Float64Array(n) // 0 at endpoints
  for (let i = 1; i < n - 1; i++) {
    const ax = points[i].x - points[i - 1].x
    const ay = points[i].y - points[i - 1].y
    const bx = points[i + 1].x - points[i].x
    const by = points[i + 1].y - points[i].y
    const cross = Math.abs(ax * by - ay * bx)
    const a = Math.sqrt(ax * ax + ay * ay)
    const b = Math.sqrt(bx * bx + by * by)
    const cx = points[i + 1].x - points[i - 1].x
    const cy = points[i + 1].y - points[i - 1].y
    const c = Math.sqrt(cx * cx + cy * cy)
    const denom = a * b * c
    curvature[i] = denom > 1e-10 ? (2 * cross) / denom : 0
  }

  // Smooth curvature with a 5-point moving average
  const smoothed = new Float64Array(n)
  const halfWin = 2
  for (let i = 0; i < n; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - halfWin); j <= Math.min(n - 1, i + halfWin); j++) {
      sum += curvature[j]
      count++
    }
    smoothed[i] = sum / count
  }

  // Step 3: Determine target control point count from geometry
  // Total absolute curvature: integral of |κ| ds
  let totalAbsCurvature = 0
  for (let i = 1; i < n; i++) {
    const ds = arcLengths[i] - arcLengths[i - 1]
    totalAbsCurvature += smoothed[i] * ds
  }
  const curvatureBonus = Math.floor(totalAbsCurvature / (Math.PI / 2))
  const targetCount = Math.min(Math.max(minCount, minCount + curvatureBonus), maxCount)

  if (points.length <= targetCount) return [...points]

  // Step 4: Compute curvature-weighted cumulative arc length
  // Density: ρ(s) = 1 + α·|κ(s)|, α chosen so curvature regions get noticeably more points
  const alpha = totalArcLength / (totalAbsCurvature + 1e-10) // normalize so curvature contribution is ~1x arc length
  const weightedLengths = new Float64Array(n)
  weightedLengths[0] = 0
  for (let i = 1; i < n; i++) {
    const ds = arcLengths[i] - arcLengths[i - 1]
    const rho = 1 + alpha * smoothed[i]
    weightedLengths[i] = weightedLengths[i - 1] + rho * ds
  }
  const totalWeighted = weightedLengths[n - 1]

  // Step 5: Place control points at equal intervals of weighted arc length
  const result: Point2D[] = [points[0]]
  const step = totalWeighted / (targetCount - 1)
  let ptIdx = 1

  for (let k = 1; k < targetCount - 1; k++) {
    const target = k * step
    // Advance ptIdx until we pass the target weighted length
    while (ptIdx < n - 1 && weightedLengths[ptIdx] < target) {
      ptIdx++
    }
    // Linear interpolation between ptIdx-1 and ptIdx
    const w0 = weightedLengths[ptIdx - 1]
    const w1 = weightedLengths[ptIdx]
    const t = w1 > w0 ? (target - w0) / (w1 - w0) : 0
    result.push({
      x: points[ptIdx - 1].x + t * (points[ptIdx].x - points[ptIdx - 1].x),
      y: points[ptIdx - 1].y + t * (points[ptIdx].y - points[ptIdx - 1].y),
    })
  }

  result.push(points[n - 1])
  return result
}

// Dev-only: expose the store on window so the selected curve can be dumped from
// the browser console (used to reproduce bugs exactly). Stripped from prod builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { sketcherStore: typeof useSceneStore }).sketcherStore = useSceneStore
  ;(window as unknown as { dumpCurve: () => string }).dumpCurve = () => {
    const s = useSceneStore.getState()
    const c = s.curves.find((x) => x.id === s.selectedCurveId)
    if (!c) return 'No curve selected'
    const out = JSON.stringify({ kind: c.kind, degree: c.degree, closed: c.closed, knots: c.knots, controlPoints: c.controlPoints })
    try { (navigator as unknown as { clipboard?: { writeText: (t: string) => void } }).clipboard?.writeText(out) } catch { /* ignore */ }
    console.log(out)
    return out
  }
}
