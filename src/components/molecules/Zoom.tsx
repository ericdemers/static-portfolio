import { Icon } from "@iconify/react"
import { useCallback } from "react"

import { useAppDispatch, useAppSelector } from "../../app/hooks"
import { zoomIn, zoomOut } from "../templates/sketcher/sketcherSlice"
import { selectCurves } from "../../sketchElements/sketchElementsSlice"

export const Zoom = () => {
  const dispatch = useAppDispatch()
  //const zoom = useAppSelector(selectZoom)
  const handleZoomOut = useCallback(() => {
    dispatch(zoomOut())
  }, [dispatch])
  const handleZoomIn = useCallback(() => {
    dispatch(zoomIn())
  }, [dispatch])
  const curves = useAppSelector(selectCurves)

  return (
    <div
      className={`${curves.length === 0 ? "invisible" : ""} pointer-events-auto`}
    >
      <button
        onClick={handleZoomOut}
        className="text-neutral-600  dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full p-2 hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10"
      >
        <Icon icon="ant-design:zoom-out-outlined" className="size-5 " />
      </button>
      <button className=" text-neutral-600  dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full p-2 hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10">
        {/* <Icon icon="ant-design:expand-outlined" className="size-5 " /> */}
        <Icon icon="iconamoon:screen-full-light" className="size-6 " />
      </button>
      <button
        onClick={handleZoomIn}
        className="text-neutral-600  dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full p-2 hover:shadow-inner hover:shadow-black/10 hover:dark:shadow-white/10"
      >
        <Icon icon="ant-design:zoom-in-outlined" className="size-5 " />
      </button>
    </div>
  )
}
