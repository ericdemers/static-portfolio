import { configureStore} from '@reduxjs/toolkit';
import sketcherReducer from '../components/templates/sketcher/sketcherSlice';
import sketchElementReducer from '../sketchElements/sketchElementsSlice';


import undoable, { excludeAction } from 'redux-undo';

export const store = configureStore({
  reducer: { 
        sketcher: sketcherReducer,
        //note: "sketcher/setParametricPosition" added to the filter otherwise simultanuous dispatch with replace curve cause problem with undo"
        sketchElements: undoable(sketchElementReducer, {filter: excludeAction(["sketchElements/addNewCurve", "sketchElements/replaceCurve", "sketchElements/moveCurves", "sketchElements/moveControlPoint", "sketcher/setParametricPosition"])}),
    }  
})

export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof store.getState>


