import { createSlice, type PayloadAction} from '@reduxjs/toolkit';
import type { Curve } from '../../../sketchElements/curveTypes';
//import type { RootState } from "../../../app/store"

type Theme = "light" | "dark"

//export type ActiveToolsType = "none" | "freeDraw" | "line" | "circleArc" | "spiral" | "singleSelection" | "multipleSelection"

/**
 * Represents the available drawing tools.
 */
export enum DrawingTool {
    FreeDraw = "freeDraw",
    Line = "line",
    CircleArc = "circleArc",
    Spiral = "spiral"}

/**
 * Represents the available selection tools.
 */
export enum SelectionTool {
    SingleSelection = "singleSelection",
    MultipleSelection = "multipleSelection"}


/**
 * Represents the state where no tool is selected
 */
export enum ToolState {
    None = "none"
}

/**
 * Represents the currently active tool, which can be a drawing tool, a selection tool, or None if no tool is active.
 */
export type ActiveTool = DrawingTool | SelectionTool | ToolState

export type ControlPolygonsDisplayed = {curveIDs: string[], selectedControlPoint: {curveID: string, controlPointIndex: number} | null  } | null

type SketcherState = {
    theme: Theme
    zoom: number
    scrollX: number
    scrollY: number
    sketcherWidth: number
    sketcherHeight: number
    activeTool: ActiveTool
    initialView: boolean
    controlPolygonsDisplayed: ControlPolygonsDisplayed
    showKnotVectorEditor: boolean
    selectedKnot: number | null
    parametricPosition: number | null
}

const initialState: SketcherState = {
    theme: "light",
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    sketcherWidth: 0,
    sketcherHeight: 0,
    activeTool: ToolState.None,
    initialView: true,
    controlPolygonsDisplayed: null,
    showKnotVectorEditor: true,
    selectedKnot: null,
    parametricPosition: null,
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
        },
        zoomOut(state) {
            const newZoom = state.zoom / zoomFactor
            const centerX = state.sketcherWidth / 2
            const centerY = state.sketcherHeight / 2
            state.scrollX = state.scrollX - (centerX * (newZoom / state.zoom) - centerX) / newZoom
            state.scrollY = state.scrollY - (centerY * (newZoom / state.zoom) - centerY) / newZoom
            state.zoom = newZoom
        },
        zoomReset(state, action: PayloadAction<{curves: readonly Curve[]}>) {
            const maxX = Math.max(... action.payload.curves.map(curve => Math.max(... curve.points.map(p => p.x))))
            const maxY = Math.max(... action.payload.curves.map(curve => Math.max(... curve.points.map(p => p.y))))
            const minX = Math.min(... action.payload.curves.map(curve => Math.min(... curve.points.map(p => p.x))))
            const minY = Math.min(... action.payload.curves.map(curve => Math.min(... curve.points.map(p => p.y))))
            const width = maxX - minX
            const height = maxY - minY
            const averageX = (maxX + minX) / 2
            const averageY = (maxY + minY) / 2
            const centerX = state.sketcherWidth / 2
            const centerY = state.sketcherHeight / 2
            const zoom1 = state.sketcherWidth / width
            const zoom2 = state.sketcherHeight /height
            const zoom = Math.min(zoom1, zoom2) * 0.8
            state.zoom = zoom
            state.scrollX = - averageX + centerX / zoom
            state.scrollY =  - averageY + centerY / zoom
        },
        zoomWithTwoFingers(state, action: PayloadAction<{deltaX: number, deltaY: number, newZoom: number}>) {
            state.zoom = action.payload.newZoom
            state.scrollX = state.scrollX + action.payload.deltaX
            state.scrollY = state.scrollY + action.payload.deltaY
        },
        zoomWithWheel(state, action: PayloadAction<{deltaX: number, deltaY: number}>) {
            //const newZoom = state.zoom +  action.payload.deltaY * 0.001
            if (state.zoom * Math.exp(action.payload.deltaY * 0.001) < 0.01) return
            const newZoom = state.zoom * Math.exp(action.payload.deltaY * 0.001)
            const centerX = state.sketcherWidth / 2
            const centerY = state.sketcherHeight / 2
            state.scrollX = (state.scrollX - (centerX * (newZoom / state.zoom) - centerX) / newZoom) 
            state.scrollY = (state.scrollY - (centerY * (newZoom / state.zoom) - centerY) / newZoom) 
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
                state.activeTool = DrawingTool.FreeDraw
            }
        },
        toggleFreeDrawCreationTool(state) {
            if (state.activeTool === "freeDraw") {
                state.activeTool = ToolState.None
            } else {
                state.activeTool = DrawingTool.FreeDraw
                state.controlPolygonsDisplayed = null
            }
        },
        toggleLineCreationTool(state) {
            if (state.activeTool === "line") {
                state.activeTool = ToolState.None
            } else {
                state.activeTool = DrawingTool.Line
                state.controlPolygonsDisplayed = null
            }
        },
        toggleCircleArcCreationTool(state) {
            if (state.activeTool === "circleArc") {
                state.activeTool = ToolState.None
            } else {
                state.activeTool = DrawingTool.CircleArc
                state.controlPolygonsDisplayed = null
            }
        },
        activateFreeDrawFromInitialView(state) {
            state.activeTool = DrawingTool.FreeDraw
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
            state.activeTool = ToolState.None
        },
        unselectCurvesAndCreationTool(state) {
            state.activeTool = ToolState.None
            state.controlPolygonsDisplayed = null
            state.selectedKnot = null
            state.parametricPosition = null
        },
        setControlPolygonsDisplayed(state, action: PayloadAction<{curveIDs: string[], selectedControlPoint: {curveID: string, controlPointIndex: number} | null  } | null >) {
            state.controlPolygonsDisplayed = action.payload
        },
        selectASingleCurve(state, action: PayloadAction<{curveID: string}>) {
            state.controlPolygonsDisplayed = {curveIDs: [action.payload.curveID], selectedControlPoint: null}
            state.activeTool = SelectionTool.SingleSelection
        },
        addControlPolygonToBeDisplayed(state, action: PayloadAction<{curveID: string}>) {
            if (state.controlPolygonsDisplayed) {
                state.controlPolygonsDisplayed.curveIDs.push(action.payload.curveID)
            } else {
                state.controlPolygonsDisplayed = {curveIDs: [action.payload.curveID], selectedControlPoint: null}
            }
        },
        selectControlPoint(state, action: PayloadAction<{curveID: string, controlPointIndex: number}>) {
            if (!state.controlPolygonsDisplayed) return
            state.controlPolygonsDisplayed.selectedControlPoint = action.payload
        },
        toggleShowKnotVectorEditor(state) {
            state.showKnotVectorEditor = !state.showKnotVectorEditor
        },
        setSelectedKnot(state, action: PayloadAction<{value: number | null}>) {
            state.selectedKnot = action.payload.value
        },
        setParametricPosition(state, action: PayloadAction<{value: number | null}>) {
            state.parametricPosition = action.payload.value
        },
        
    },
    selectors: {
        selectZoom: sketcher => sketcher.zoom,
        selectScrollX: sketcher => sketcher.scrollX,
        selectScrollY: sketcher => sketcher.scrollY,
        selectActiveTool: sketcher => sketcher.activeTool,
        selectInitialView: sketcher => sketcher.initialView,
        selectTheme: sketcher => sketcher.theme,
        selectControlPolygonsDisplayed: sketcher => sketcher.controlPolygonsDisplayed,
        selectShowKnotVectorEditor: sketcher => sketcher.showKnotVectorEditor,
        selectSelectedKnot: sketcher => sketcher.selectedKnot,
        selectParametricPosition: sketcher => sketcher.parametricPosition
    },
        
})

export const { selectZoom, selectScrollX, selectScrollY, selectActiveTool, 
    selectInitialView, selectTheme, selectControlPolygonsDisplayed, selectShowKnotVectorEditor,
    selectSelectedKnot, selectParametricPosition } = sketcherSlice.selectors

export const { setSketcherSize, zoomIn, zoomOut, zoomWithTwoFingers, zoomWithWheel, scroll, setInitialView, 
     activateFreeDrawFromInitialView, toggleFreeDrawCreationTool, 
     toggleLineCreationTool, toggleCircleArcCreationTool, 
     resetCanvas, setTheme, toggleTheme, 
    unselectCreationTool, setControlPolygonsDisplayed, 
    unselectCurvesAndCreationTool, selectASingleCurve, zoomReset, 
    selectControlPoint, toggleShowKnotVectorEditor, setSelectedKnot, setParametricPosition} = sketcherSlice.actions

export default sketcherSlice.reducer

