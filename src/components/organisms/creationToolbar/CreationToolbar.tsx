import { PencilIcon } from "@heroicons/react/24/outline"
import { Icon } from "@iconify/react"
import { FreeDrawIcon } from "../../../icons"

import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { useCallback } from "react"
import {
  selectActiveTool,
  selectInitialView,
  setInitialView,
  toggleFreeDrawCreationTool,
} from "../../templates/sketcher/sketcherSlice"

function CreationToolbar() {
  const initialView = useAppSelector(selectInitialView)
  const activeTool = useAppSelector(selectActiveTool)
  const dispatch = useAppDispatch()

  const handlePushPencil = useCallback(() => {
    dispatch(setInitialView({ show: false }))
  }, [dispatch])

  const handleToggleFreeDrawCreationTool = useCallback(() => {
    dispatch(toggleFreeDrawCreationTool())
  }, [dispatch])

  return (
    <div className="flex place-content-around bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 p-1 shadow rounded-lg select-none">
      {initialView ? (
        <button
          className="hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg"
          onClick={handlePushPencil}
        >
          <Icon icon="iconoir:edit-pencil" className="size-6" />
        </button>
      ) : (
        <button
          className={`${activeTool === "freeDraw" ? "bg-blue-50" + " dark:bg-gray-600" : ""} hover:bg-neutral-100 dark:hover:bg-neutral-700 p-2 rounded-lg `}
          onClick={handleToggleFreeDrawCreationTool}
        >
          <div className="size-6">{FreeDrawIcon}</div>
        </button>
      )}
    </div>
  )
}

export default CreationToolbar
