import { useCallback } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { SimplifyIcon } from "../../../icons"
import { optimizedKnotPositions } from "../../../sketchElements/curve"
import {
  selectCurves,
  updateThisCurve,
} from "../../../sketchElements/sketchElementsSlice"
import {
  selectControlPolygonsDispayed,
  selectShowKnotVectorEditor,
  selectZoom,
  toggleShowKnotVectorEditor,
} from "../../templates/sketcher/sketcherSlice"

function RightMenu() {
  const dispatch = useAppDispatch()
  const showKnotVectorEditor = useAppSelector(selectShowKnotVectorEditor)
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const zoom = useAppSelector(selectZoom)

  const handleToggleShowKnotVectorEditor = () => {
    dispatch(toggleShowKnotVectorEditor())
  }

  const handleSimplifyCurve = () => {
    if (!controlPolygonsDisplayed || !controlPolygonsDisplayed.curveIDs) return
    const curve = curves.find(
      curve => curve.id === controlPolygonsDisplayed.curveIDs[0],
    )
    if (!curve) return

    const newCurve = optimizedKnotPositions(curve, zoom, 0.2)
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
            onClick={handleSimplifyCurve}
            className={` hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
          >
            <div className="size-6">{SimplifyIcon}</div>
          </button>
        </li>
      </ul>
    </div>
  )
}

export default RightMenu
