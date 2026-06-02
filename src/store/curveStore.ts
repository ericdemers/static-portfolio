import { create } from 'zustand'
import type { Point2D } from '../core'

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
  moveControlPoint: (index: number, p: Point2D) => void
  reset: () => void
}

export const useCurveStore = create<CurveState>((set) => ({
  controlPoints: INITIAL_CONTROL_POINTS,
  degree: 3,
  moveControlPoint: (index, p) =>
    set((s) => ({ controlPoints: s.controlPoints.map((q, i) => (i === index ? p : q)) })),
  reset: () => set({ controlPoints: INITIAL_CONTROL_POINTS }),
}))
