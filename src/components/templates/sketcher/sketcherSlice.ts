import { createSlice, type PayloadAction} from '@reduxjs/toolkit';
//import type { RootState } from "../../../app/store"

type Theme = "light" | "dark"

type ActiveToolsType = "none" | "freeDraw" | "line" | "circleArc" | "spiral" | "singleSelection" | "multipleSelection"

type SketcherState = {
    theme: Theme
    zoom: number
    scrollX: number
    scrollY: number
    sketcherWidth: number
    sketcherHeight: number
    activeTool: ActiveToolsType
    initialView: boolean
    controlPolygonsDisplayed: {curveIDs: string[], selectedControlPoint: {curveID: string, controlPointIndex: number} | null  } | null 
}

const initialState: SketcherState = {
    theme: "light",
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    sketcherWidth: 0,
    sketcherHeight: 0,
    activeTool: "none",
    initialView: true,
    controlPolygonsDisplayed: null,
}

const zoomFactor = 1.2

const sketcherSlice = createSlice({
    name: 'sketcher',
    initialState,
    reducers: {
        setSketcherSize(state, action: PayloadAction<{width: number, height: number}>) {
            const {width, height} = action.payload
            state.sketcherWidth = width
            state.sketcherHeight = height
        },
        zoomIn(state) {
            const newZoom = state.zoom * zoomFactor
            const centerX = state.sketcherWidth / 2
            const centerY = state.sketcherHeight / 2
            state.scrollX = (state.scrollX - (centerX * (newZoom / state.zoom) - centerX) / newZoom) 
            state.scrollY = (state.scrollY - (centerY * (newZoom / state.zoom) - centerY) / newZoom) 
            state.zoom = newZoom
            console.log(centerX)
            console.log(centerY)
        },
        zoomOut(state) {
            const newZoom = state.zoom / zoomFactor
            const centerX = state.sketcherWidth / 2
            const centerY = state.sketcherHeight / 2
            state.scrollX = state.scrollX - (centerX * (newZoom / state.zoom) - centerX) / newZoom
            state.scrollY = state.scrollY - (centerY * (newZoom / state.zoom) - centerY) / newZoom
            state.zoom = newZoom
        },
        scroll(state, action: PayloadAction<{deltaX: number, deltaY: number}>) {
            const {deltaX, deltaY} = action.payload
            state.scrollX += deltaX
            state.scrollY += deltaY
        },
        setInitialView(state, action: PayloadAction<{show: boolean}>) {
            const {show} = action.payload
            state.initialView = show
            if (show === false) {
                state.activeTool = "freeDraw"
            }
        },
        toggleFreeDrawCreationTool(state) {
            if (state.activeTool === "freeDraw") {
                state.activeTool = "none"
            } else {
                state.activeTool = "freeDraw"
                state.controlPolygonsDisplayed = null
            }
        },
        toggleLineCreationTool(state) {
            if (state.activeTool === "line") {
                state.activeTool = "none"
            } else {
                state.activeTool = "line"
                state.controlPolygonsDisplayed = null
            }
        },
        toggleCircleArcCreationTool(state) {
            if (state.activeTool === "circleArc") {
                state.activeTool = "none"
            } else {
                state.activeTool = "circleArc"
                state.controlPolygonsDisplayed = null
            }
        },
        activateFreeDrawFromInitialView(state) {
            state.activeTool = "freeDraw"
            state.initialView = false
        },
        resetCanvas(state) {
            return  {...initialState,
                sketcherWidth: state.sketcherWidth,
                sketcherHeight: state.sketcherHeight,
                theme: state.theme,
            }
        },
        setTheme(state, action) {
            state.theme = action.payload
        },
        toggleTheme(state) {
            if (state.theme === "dark") {
                state.theme = "light"
            }
            else {
                state.theme = "dark"
            }
        },
        unselectCreationTool(state) {
            state.activeTool = "none"
        },
        unselectCurvesAndCreationTool(state) {
            state.activeTool = "none"
            state.controlPolygonsDisplayed = null
        },
        setControlPolygonsDisplayed(state, action: PayloadAction<{curveIDs: string[], selectedControlPoint: {curveID: string, controlPointIndex: number} | null  } | null >) {
            state.controlPolygonsDisplayed = action.payload
        },
        selectASingleCurve(state, action: PayloadAction<{curveID: string}>) {
            state.controlPolygonsDisplayed = {curveIDs: [action.payload.curveID], selectedControlPoint: null}
            state.activeTool = "singleSelection"
        },
        addControlPolygonToBeDisplayed(state, action: PayloadAction<{curveID: string}>) {
            if (state.controlPolygonsDisplayed) {
                state.controlPolygonsDisplayed.curveIDs.push(action.payload.curveID)
            } else {
                state.controlPolygonsDisplayed = {curveIDs: [action.payload.curveID], selectedControlPoint: null}
            }
        }
        
    },
    selectors: {
        selectZoom: sketcher => sketcher.zoom,
        selectScrollX: sketcher => sketcher.scrollX,
        selectScrollY: sketcher => sketcher.scrollY,
        selectActiveTool: sketcher => sketcher.activeTool,
        selectInitialView: sketcher => sketcher.initialView,
        selectTheme: sketcher => sketcher.theme,
        selectControlPolygonsDispayed: sketcher => sketcher.controlPolygonsDisplayed
    },
        
})

export const { selectZoom, selectScrollX, selectScrollY, selectActiveTool, 
    selectInitialView, selectTheme, selectControlPolygonsDispayed } = sketcherSlice.selectors

export const { setSketcherSize, zoomIn, zoomOut, scroll, setInitialView, 
     activateFreeDrawFromInitialView, toggleFreeDrawCreationTool, 
     toggleLineCreationTool, toggleCircleArcCreationTool, 
     resetCanvas, setTheme, toggleTheme, 
    unselectCreationTool, setControlPolygonsDisplayed, unselectCurvesAndCreationTool, selectASingleCurve} = sketcherSlice.actions

export default sketcherSlice.reducer

