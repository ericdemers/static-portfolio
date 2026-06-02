import { create } from 'zustand'
import type { Point2D } from '../core'
import { clampedUniformKnots, slideCurve } from '../core'

// The editable B-spline curve shared by the interactive demos. First Zustand
// store of the app — keeps curve state out of components so multiple views
// (canvas, g-plot, future panels) stay in sync.

const INITIAL_CONTROL_POINTS: Point2D[] = [
  { x: 70, y: 300 },
  { x: 210, y: 70 },
  { x: 350, y: 300 },
  { x: 500, y: 80 },
  { x: 650, y: 300 },
  { x: 790, y: 150 },
]

interface CurveState {
  controlPoints: Point2D[]
  degree: number
  /** When true, drags go through the optimizer (sliding mechanism). */
  constrain: boolean
  /** Free move (no constraint). */
  moveControlPoint: (index: number, p: Point2D) => void
  /** Constrained drag: follow the target while keeping the curvature-extrema bound. */
  slideControlPoint: (index: number, target: Point2D) => void
  toggleConstrain: () => void
  reset: () => void
}

export const useCurveStore = create<CurveState>((set) => ({
  controlPoints: INITIAL_CONTROL_POINTS,
  degree: 3,
  constrain: false,
  moveControlPoint: (index, p) =>
    set((s) => ({ controlPoints: s.controlPoints.map((q, i) => (i === index ? p : q)) })),
  slideControlPoint: (index, target) =>
    set((s) => {
      const knots = clampedUniformKnots(s.controlPoints.length, s.degree)
      const xs = s.controlPoints.map((p) => p.x)
      const ys = s.controlPoints.map((p) => p.y)
      const { x, y } = slideCurve(xs, ys, knots, s.degree, index, target.x, target.y, {
        maxIterations: 40,
      })
      return { controlPoints: x.map((xi, i) => ({ x: xi, y: y[i] })) }
    }),
  toggleConstrain: () => set((s) => ({ constrain: !s.constrain })),
  reset: () => set({ controlPoints: INITIAL_CONTROL_POINTS }),
}))
