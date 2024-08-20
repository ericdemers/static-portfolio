import { useCallback } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import {
  DeleteKnotIcon,
  InsertKnotIcon,
  SimplifyIcon,
  UpArrowIcon,
} from "../../../icons"
import {
  elevateDegree,
  insertKnot,
  interiorKnot,
  optimizedKnotPositions,
  removeAKnot,
} from "../../../sketchElements/curve"
import {
  selectCurves,
  updateThisCurve,
} from "../../../sketchElements/sketchElementsSlice"
import {
  selectControlPolygonsDispayed,
  selectParametricPosition,
  selectSelectedKnot,
  selectShowKnotVectorEditor,
  selectZoom,
  setParametricPosition,
  setSelectedKnot,
  toggleShowKnotVectorEditor,
} from "../../templates/sketcher/sketcherSlice"
import { CurveType } from "../../../sketchElements/curveTypes"

function RightMenu() {
  const dispatch = useAppDispatch()
  const showKnotVectorEditor = useAppSelector(selectShowKnotVectorEditor)
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const zoom = useAppSelector(selectZoom)
  const parametricPosition = useAppSelector(selectParametricPosition)
  const selectedKnot = useAppSelector(selectSelectedKnot)

  const selectedCurve =
    controlPolygonsDisplayed && controlPolygonsDisplayed.curveIDs
      ? curves.find(curve => curve.id === controlPolygonsDisplayed.curveIDs[0])
      : null

  const handleToggleShowKnotVectorEditor = () => {
    dispatch(toggleShowKnotVectorEditor())
    dispatch(setSelectedKnot({ value: null }))
    dispatch(setParametricPosition({ value: null }))
  }

  const handleSimplifyCurve = () => {
    if (!selectedCurve) return
    const newCurve = optimizedKnotPositions(selectedCurve, zoom, 0.2)
    dispatch(updateThisCurve({ curve: newCurve }))
  }

  const handleInsertKnot = () => {
    if (!selectedCurve || parametricPosition === null) return
    const newCurve = insertKnot(parametricPosition, selectedCurve)
    if (!newCurve) return
    dispatch(updateThisCurve({ curve: newCurve }))
  }

  const handleDeleteKnot = () => {
    if (!selectedCurve || selectedKnot === null) return
    const newCurve = removeAKnot(selectedCurve, selectedKnot)
    if (!newCurve) return
    dispatch(updateThisCurve({ curve: newCurve }))
  }

  const handleElevateDegree = () => {
    if (!selectedCurve) return
    const newCurve = elevateDegree(selectedCurve)
    if (!newCurve) return
    dispatch(updateThisCurve({ curve: newCurve }))
  }

  return (
    <div className="w-12 flex flex-col  place-content-around bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 p-1 shadow rounded-lg select-none">
      <ul>
        <li>
          <button
            onClick={handleToggleShowKnotVectorEditor}
            className={`${showKnotVectorEditor ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 w-10 h-10 rounded-lg outline-none font-medium text-center`}
          >
            B
          </button>
        </li>
        <li>
          <button
            onClick={handleElevateDegree}
            className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
          >
            <div className="size-6">{UpArrowIcon}</div>
          </button>
        </li>

        {selectedCurve && selectedCurve.type === CurveType.NonRational ? (
          <li>
            <button
              onClick={handleSimplifyCurve}
              className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            >
              <div className="size-6">{SimplifyIcon}</div>
            </button>
          </li>
        ) : null}
        {parametricPosition !== null ? (
          <li>
            <button
              onClick={handleInsertKnot}
              className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            >
              <div className="size-6">{InsertKnotIcon}</div>
            </button>
          </li>
        ) : null}
        {selectedKnot !== null &&
        selectedCurve?.type === CurveType.NonRational ? (
          <li>
            <button
              onClick={handleDeleteKnot}
              className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            >
              <div className="size-6">{DeleteKnotIcon}</div>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export default RightMenu
