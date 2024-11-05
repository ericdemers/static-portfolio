import type { PayloadAction} from '@reduxjs/toolkit';
import { createSlice} from '@reduxjs/toolkit';
import type { RootState} from "../app/store"
import { Closed, CurveType, type Curve } from './curveTypes';
import type { Constraint } from './constraintTypes';
import { movePoint } from './coordinates';
import { computeDegree, duplicateCurve, joinTwoCurves, reverseCurveDirection } from './curve';
import type { ControlPolygonsDisplayed } from '../components/templates/sketcher/sketcherSlice';
import type { WritableDraft } from 'immer';


interface sketchElementsState {
    curves: readonly Curve[],
    constraints: Constraint[]
}

const initialState: sketchElementsState = {
    curves: [],
    constraints: []
}

const sketchElementsSlice = createSlice({
    name: 'sketchElements',
    initialState,
    reducers: {
        //increment
        addNewCurve(state,  action: PayloadAction<{curve: Curve}>) {
            state.curves.push(action.payload.curve)
        },
        // This does not create a new step in the history (undo-redo)
        // see -> store.ts -- filter: excludeAction("replaceCurve")
        replaceCurve(state, action: PayloadAction<{curve: Curve}>) {
            const newCurve = action.payload.curve 
            const index = state.curves.findIndex((c: Curve) => (c.id === newCurve.id))
            if (index !== -1) {
                state.curves[index] = newCurve
            }
        },
        updateThisCurve(state, action: PayloadAction<{curve: Curve}>) {
            const newCurve = action.payload.curve 
            const index = state.curves.findIndex((c: Curve) => (c.id === newCurve.id))
            if (index !== -1) {
                state.curves[index] = newCurve
            }
        },
        updateCurves(state, action: PayloadAction<{curves: Curve[]}>) {
            state.curves = action.payload.curves
        },
        clearCurves(state) {
            state.curves = []
        },
        moveCurves(state, action: PayloadAction<{displacement: {x: number, y: number}, ids: string[]}>) {
            action.payload.ids.forEach(id => {
                const curve = state.curves.find((c) => (c.id === id))
                if (!curve) return
                curve.points = curve.points.map(p => movePoint(p, action.payload.displacement))
            })
        },
        moveControlPoint(state, action: PayloadAction<{displacement: {x: number, y: number}, controlPolygonsDisplayed: ControlPolygonsDisplayed}>) {
            if (!action.payload.controlPolygonsDisplayed?.selectedControlPoint) return
            const curveID = action.payload.controlPolygonsDisplayed.selectedControlPoint.curveID
            const index = action.payload.controlPolygonsDisplayed.selectedControlPoint.controlPointIndex
            const curve = state.curves.find((c)=> (c.id === curveID))
            if (!curve) return
            curve.points[index] = movePoint(curve.points[index], action.payload.displacement)
        },
        joinCurves(state, action: PayloadAction<{selectedControlPoint: { curveID: string; controlPointIndex: number },
            overAnEndPoint: {
              curveID: string
              index: number
            }}>) {
               let firstCurve = state.curves.find((c)=> (c.id === action.payload.selectedControlPoint.curveID))
               let secondCurve = state.curves.find((curve) => curve.id === action.payload.overAnEndPoint.curveID)
               if (!firstCurve || !secondCurve) return
               if (action.payload.selectedControlPoint.controlPointIndex === 0) {
                firstCurve = reverseCurveDirection(firstCurve)
               }
               if (action.payload.overAnEndPoint.index === 1) {
                secondCurve = reverseCurveDirection(secondCurve)
               }
               const curve = joinTwoCurves(firstCurve, secondCurve)
               state.curves = state.curves.filter((curve) => curve.id !== action.payload.overAnEndPoint.curveID)
               const index = state.curves.findIndex((c: Curve) => (c.id === curve.id))
               if (index !== -1) {
                   state.curves[index] = curve as WritableDraft<Curve>
               }
        },
        closeCurve(state, action: PayloadAction<{curve: Curve}>) {
            //const curve = state.curves.find((c)=> (c.id === action.payload.selectedControlPoint.curveID))
            //if (curve === undefined) return
            const curve = action.payload.curve
            const index = state.curves.findIndex((c: Curve) => (c.id === curve.id))
            const degree = computeDegree(curve)
            //console.log(degree)
            //state.curves[index] = {...curve, closed: Closed.True, degree: degree, points: curve.points.slice(0, -1), knots: curve.knots.slice(1, -(degree + 1)), period: curve.knots[curve.knots.length - 1] - curve.knots[0]}
            state.curves[index] = {...curve, closed: Closed.True, degree: degree, points: curve.points.slice(0, -1), knots: curve.knots.slice(1, -(degree + 1)), period: 1}

            //state.curves[index] = {...curve}


        },
        deleteCurves(state, action: PayloadAction<{curveIDs: string[]}>) {
            state.curves = state.curves.filter((curve) => !action.payload.curveIDs.includes(curve.id))
        },
        duplicateCurves(state, action: PayloadAction<{curveIDs: string[], deltaX: number, deltaY: number}>) {
            state.curves = state.curves.concat(state.curves.filter((curve) => action.payload.curveIDs.includes(curve.id)).map(curve => duplicateCurve(curve, {x: action.payload.deltaX, y: action.payload.deltaY})))
        }

    },
    selectors: {
        curves: sketchElements => sketchElements.curves,
      },
})

export const { addNewCurve, replaceCurve, clearCurves, updateThisCurve, moveCurves, moveControlPoint, joinCurves, closeCurve, updateCurves, deleteCurves, duplicateCurves } = sketchElementsSlice.actions
export const selectCurves = (state: RootState) => state.sketchElements.present.curves
export const selectShowUndoArrow = (state: RootState) => state.sketchElements.past.length !== 0
export const selectShowRedoArrow = (state: RootState) => state.sketchElements.future.length !== 0
export default sketchElementsSlice.reducer