import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import type { Coordinates } from "../../../sketchElements/coordinates"
import {
  selectCurves,
  updateCurves,
} from "../../../sketchElements/sketchElementsSlice"

type KnotEditorStateType =
  | "idle"
  | "moving a knot"
  | "selected knot"
  | "display position on abscissa"
type ActionType = "none" | "zooming" | "scrolling"
type mouseMoveThresholdType = "not exceeded" | "just exceeded" | "exceeded"

export const usePeriodicEventHandlers = (
  canvas: HTMLCanvasElement | null,
  zoom: number,
  setZoom: React.Dispatch<React.SetStateAction<number>>,
  width: number,
  height: number,
  leftMaximumSliderPosition: number,
  rightMaximumSliderPosition: number,
  maximumZoom: number,
  sliderPosition: number,
) => {
  const [editorState, setEditorState] = useState<KnotEditorStateType>("idle")
  const [initialMouseXPosition, setInitialMouseXPosition] = useState<
    number | null
  >(null)
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")

  const [action, setAction] = useState<ActionType>("none")
  const dispatch = useAppDispatch()
  const [scroll, setScroll] = useState(0)
  const curves = useAppSelector(selectCurves)

  const viewportCoordsToSceneCoords = useCallback(
    ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      //const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()

      const x = (clientX - rect.left) / width
      const y = (clientY - rect.top) / height
      return { x, y }
    },
    [canvas, height, width],
  )

  const onZoomSlider = useCallback(
    (point: Coordinates) => {
      if (point.y < 0.2 && Math.abs(point.x - sliderPosition) < 0.05) {
        return true
      }
    },
    [sliderPosition],
  )

  const zoomFromSliderPosition = useCallback(
    (position: number) => {
      const left = leftMaximumSliderPosition
      const right = rightMaximumSliderPosition
      return ((position - left) * (maximumZoom - 1)) / (right - left) + 1
    },
    [leftMaximumSliderPosition, maximumZoom, rightMaximumSliderPosition],
  )

  const handlePressDown = useCallback(
    (client: { clientX: number; clientY: number }) => {
      setMouseMoveThreshold("not exceeded")
      const point = viewportCoordsToSceneCoords(client)
      if (!point) return
      if (onZoomSlider(point)) {
        setAction("zooming")
      }
    },
    [onZoomSlider, viewportCoordsToSceneCoords],
  )

  const handleMove = useCallback(
    (point: { clientX: number; clientY: number }) => {
      const p = viewportCoordsToSceneCoords(point)
      if (p === undefined) return
      const x = p.x

      if (action === "zooming") {
        let newZoom = zoomFromSliderPosition(x)
        if (newZoom < 1) newZoom = 1
        if (newZoom > maximumZoom) newZoom = maximumZoom
        let newScroll = ((scroll - 0.5) * newZoom) / zoom + 0.5
        if (newScroll > 0) newScroll = 0
        if (newScroll < 1 - zoom) newScroll = 1 - zoom
        setZoom(newZoom)
        setScroll(newScroll)
      }
    },
    [
      action,
      maximumZoom,
      scroll,
      setZoom,
      viewportCoordsToSceneCoords,
      zoom,
      zoomFromSliderPosition,
    ],
  )

  const handlePressRelease = useCallback(
    (newMousePosition: Coordinates) => {
      setAction("none")
      setInitialMouseXPosition(null)
      if (editorState === "moving a knot") {
        setEditorState("selected knot")
        if (mouseMoveThreshold === "exceeded")
          dispatch(updateCurves({ curves: curves.slice() }))
      }
    },
    [curves, dispatch, editorState, mouseMoveThreshold],
  )

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      const clientX = event.clientX
      const clientY = event.clientY
      handlePressDown({ clientX, clientY })
    },
    [handlePressDown],
  )

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      const clientX = event.touches[0].clientX
      const clientY = event.touches[0].clientY
      handlePressDown({ clientX, clientY })
    },
    [handlePressDown],
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      //flushSync(() => {
      handleMove({ clientX: event.clientX, clientY: event.clientY })
      //})
    },
    [handleMove],
  )

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      handleMove({
        clientX: event.touches[0].clientX,
        clientY: event.touches[0].clientY,
      })
    },
    [handleMove],
  )

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      const { deltaX, deltaY } = event
      let newScroll = scroll - deltaX / 800
      if (newScroll < -1 * zoom) newScroll = 0
      if (newScroll > 1 * zoom) newScroll = 0
      setScroll(newScroll)
    },
    [scroll, zoom],
  )

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      const p = viewportCoordsToSceneCoords({
        clientX: event.clientX,
        clientY: event.clientY,
      })
      if (p === undefined) return
      handlePressRelease(p)
    },
    [handlePressRelease, viewportCoordsToSceneCoords],
  )

  const handleMouseLeave = useCallback((event: MouseEvent) => {}, [])

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (event.touches.length === 0) {
      setAction("none")
    }
  }, [])

  useEffect(() => {
    if (!canvas) {
      return
    }
    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove)
    canvas.addEventListener("mouseup", handleMouseUp)
    canvas.addEventListener("touchend", handleTouchEnd)
    canvas.addEventListener("mouseleave", handleMouseLeave)
    canvas.addEventListener("wheel", handleWheel)
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseup", handleMouseUp)
      canvas.removeEventListener("touchend", handleTouchEnd)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
      canvas.removeEventListener("wheel", handleWheel)
    }
  }, [
    canvas,
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    handleWheel,
  ])
}
