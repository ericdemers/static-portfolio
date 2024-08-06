import type { PayloadAction} from '@reduxjs/toolkit';
import { createSlice} from '@reduxjs/toolkit';
import type { RootState} from "../app/store"
import type { Curve } from './curveTypes';
import type { Constraint } from './constraintTypes';

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
        clearCurves(state) {
            state.curves = []
        }

    },
    selectors: {
        curves: sketchElements => sketchElements.curves,
      },
})

export const { addNewCurve, replaceCurve, clearCurves, updateThisCurve } = sketchElementsSlice.actions
export const selectCurves = (state: RootState) => state.sketchElements.present.curves
export const selectShowUndoArrow = (state: RootState) => state.sketchElements.past.length !== 0
export const selectShowRedoArrow = (state: RootState) => state.sketchElements.future.length !== 0
export default sketchElementsSlice.reducer