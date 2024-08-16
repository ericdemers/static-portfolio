import {
  PencilIcon,
  Square2StackIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { Icon } from "@iconify/react"
import {
  CircleArcIcon,
  FreeDrawIcon,
  LineIcon,
  SimplifyIcon,
} from "../../../icons"

import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { useCallback } from "react"
import {
  selectActiveTool,
  selectControlPolygonsDispayed,
  selectInitialView,
  selectZoom,
  setInitialView,
  toggleCircleArcCreationTool,
  toggleFreeDrawCreationTool,
  toggleLineCreationTool,
  unselectCurvesAndCreationTool,
} from "../../templates/sketcher/sketcherSlice"
import {
  deleteCurves,
  duplicateCurves,
} from "../../../sketchElements/sketchElementsSlice"

function CreationToolbar() {
  const initialView = useAppSelector(selectInitialView)
  const activeTool = useAppSelector(selectActiveTool)
  const dispatch = useAppDispatch()
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const zoom = useAppSelector(selectZoom)

  const handlePushPencil = useCallback(() => {
    dispatch(setInitialView({ show: false }))
  }, [dispatch])

  const handleToggleFreeDrawCreationTool = useCallback(() => {
    dispatch(toggleFreeDrawCreationTool())
  }, [dispatch])

  const handleToggleLineCreationTool = useCallback(() => {
    dispatch(toggleLineCreationTool())
  }, [dispatch])

  const handleToggleCircleArcCreationTool = useCallback(() => {
    dispatch(toggleCircleArcCreationTool())
  }, [dispatch])

  const handleDelete = useCallback(() => {
    if (!controlPolygonsDisplayed) return
    dispatch(deleteCurves({ curveIDs: controlPolygonsDisplayed.curveIDs }))
    dispatch(unselectCurvesAndCreationTool())
  }, [controlPolygonsDisplayed, dispatch])

  const handleDuplicate = useCallback(() => {
    if (!controlPolygonsDisplayed) return
    dispatch(
      duplicateCurves({
        curveIDs: controlPolygonsDisplayed.curveIDs,
        deltaX: 30 / zoom,
        deltaY: 30 / zoom,
      }),
    )
    dispatch(unselectCurvesAndCreationTool())
  }, [controlPolygonsDisplayed, dispatch, zoom])

  return (
    <div className="flex h-12 place-content-around bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 p-1 shadow rounded-lg select-none">
      {initialView ? (
        <button
          className="hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg"
          onClick={handlePushPencil}
        >
          <Icon icon="iconoir:edit-pencil" className="size-6" />
        </button>
      ) : (
        <>
          <button
            className={`${activeTool === "freeDraw" ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            onClick={handleToggleFreeDrawCreationTool}
          >
            <div className="size-6">{FreeDrawIcon}</div>
          </button>
          <button
            className={`${activeTool === "line" ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            onClick={handleToggleLineCreationTool}
          >
            <div className="size-6">{LineIcon}</div>
          </button>
          <button
            className={`${activeTool === "circleArc" ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg outline-none`}
            onClick={handleToggleCircleArcCreationTool}
          >
            <div className="size-6">{CircleArcIcon}</div>
          </button>
          <button className=" hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg outline-none p-2">
            <Icon icon="ph:spiral" className="size-6" />
          </button>
          <div className="inline-block h-[35px] min-h-[1em] w-0.5 self-stretch bg-neutral-200 dark:bg-white/10 m-1"></div>
          <button className=" hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg outline-none p-2">
            <Icon icon="radix-icons:group" className="size-6" />
          </button>
          <button
            className=" hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg outline-none p-2"
            onClick={handleDelete}
          >
            <TrashIcon className="size-6 " />
          </button>
          <button
            className=" hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg outline-none p-2"
            onClick={handleDuplicate}
          >
            <Square2StackIcon className="size-6 " />
          </button>
          <button className=" hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg outline-none p-2">
            <Icon icon="material-symbols:shift-lock" className="size-6" />
          </button>
        </>
      )}
    </div>
  )
}

export default CreationToolbar
