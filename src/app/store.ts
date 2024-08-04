import { configureStore} from '@reduxjs/toolkit';
import sketcherReducer from '../components/templates/sketcher/sketcherSlice';
import sketchElementReducer from '../sketchElements/sketchElementsSlice';


import undoable, { excludeAction, includeAction } from 'redux-undo';

export const store = configureStore({
  reducer: { 
        sketcher: sketcherReducer,
        sketchElements: undoable(sketchElementReducer, {filter: excludeAction("sketchElements/replaceCurve"), syncFilter: true}),
        //sketchElements: undoable(sketchElementReducer),
    }  
})

export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof store.getState>


