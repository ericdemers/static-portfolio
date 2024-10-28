import { configureStore } from '@reduxjs/toolkit';
import sketcherReducer from '../components/templates/sketcher/sketcherSlice';
import sketchElementReducer from '../sketchElements/sketchElementsSlice';
import undoable, { excludeAction } from 'redux-undo';

/**
 * Configure and create the Redux store
 */
export const store = configureStore({
  reducer: { 
    sketcher: sketcherReducer,
    sketchElements: undoable(sketchElementReducer, {
      filter: excludeAction([
        "sketchElements/addNewCurve",
        "sketchElements/replaceCurve",
        "sketchElements/moveCurves",
        "sketchElements/moveControlPoint",
        "sketcher/setParametricPosition"
      ])
    }),
  }  
});

/**
 * Type definition for the dispatch function of the store
 */
export type AppDispatch = typeof store.dispatch;

/**
 * Type definition for the root state of the store
 */
export type RootState = ReturnType<typeof store.getState>;

