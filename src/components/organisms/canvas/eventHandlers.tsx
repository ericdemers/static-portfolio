import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import { distance, type Coordinates } from "../../../sketchElements/coordinates"
import { viewportCoordsToSceneCoords } from "./viewport"
import {
  selectActiveTool,
  selectScrollX,
  selectScrollY,
  selectZoom,
  scroll,
  selectInitialView,
  activateFreeDrawFromInitialView,
  unselectCreationTool,
} from "../../templates/sketcher/sketcherSlice"
import {
  createCurve,
  InitialCurve,
  uniformKnots,
} from "../../../sketchElements/curve"
import { flushSync } from "react-dom"
import {
  addNewCurve,
  replaceCurve,
  selectCurves,
  updateThisCurve,
} from "../../../sketchElements/sketchElementsSlice"
import type { Curve } from "../../../sketchElements/curveTypes"
import { ActionCreators } from "redux-undo"

type ActionType =
  | "none"
  | "drawing"
  | "moving a control point"
  | "moving curves"

type mouseMoveThresholdType = "not exceeded" | "just exceeded" | "exceeded"

export const useEventHandlers = (canvas: HTMLCanvasElement | null) => {
  const dispatch = useAppDispatch()
  const zoom = useAppSelector(selectZoom)
  const scrollX = useAppSelector(selectScrollX)
  const scrollY = useAppSelector(selectScrollY)
  const activeTool = useAppSelector(selectActiveTool)
  const initialView = useAppSelector(selectInitialView)
  const [pressDown, setPressDown] = useState(false)
  const [initialMousePosition, setInitialMousePosition] =
    useState<Coordinates | null>(null)
  const [action, setAction] = useState<ActionType>("none")
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")
  const [currentlyDrawnCurve, setCurrentlyDrawnCurve] = useState<Curve | null>(
    null,
  )
  const curves = useAppSelector(selectCurves)

  const clickWithoutMovingResolution = 10

  const getMouseCoordinates = useCallback(
    (event: MouseEvent): Coordinates | null => {
      if (!canvas) return null
      const viewportCoords = {
        clientX: event.clientX - canvas.offsetLeft,
        clientY: event.clientY - canvas.offsetTop,
      }
      return viewportCoordsToSceneCoords(viewportCoords, {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      })
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const getTouchCoordinates = useCallback(
    (event: TouchEvent): Coordinates | null => {
      if (!canvas) return null
      const viewportCoords = {
        clientX: event.touches[0].clientX - canvas.offsetLeft,
        clientY: event.touches[0].clientY - canvas.offsetTop,
      }
      return viewportCoordsToSceneCoords(viewportCoords, {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      })
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const getTwoFingersTouchCoordinates = useCallback(
    (event: TouchEvent): { p0: Coordinates; p1: Coordinates } | null => {
      if (!canvas) return null
      const viewportCoords0 = {
        clientX: event.touches[0].clientX - canvas.offsetLeft,
        clientY: event.touches[0].clientY - canvas.offsetTop,
      }
      const viewportCoords1 = {
        clientX: event.touches[1].clientX - canvas.offsetLeft,
        clientY: event.touches[1].clientY - canvas.offsetTop,
      }
      const stateInfo = {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      }
      const p0 = viewportCoordsToSceneCoords(viewportCoords0, stateInfo)
      const p1 = viewportCoordsToSceneCoords(viewportCoords1, stateInfo)
      return { p0: p0, p1: p1 }
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const onLine = useCallback(
    (
      endPoints: readonly [Coordinates, Coordinates],
      point: Coordinates,
      maxDistance = 1,
    ) => {
      // offset : semi-minor axis of the ellipse with the line endpoint as focal points
      const offset = Math.sqrt(
        Math.pow(
          (distance(endPoints[0], point) + distance(endPoints[1], point)) / 2,
          2,
        ) - Math.pow(distance(endPoints[0], endPoints[1]) / 2, 2),
      )
      return offset < maxDistance / zoom
    },
    [zoom],
  )

  const getCurveAtPosition = useCallback((coordinates: Coordinates) => {
    //return curves.map(curve => ({ ...Element, position: position }))
  }, [])

  const handlePressDown = useCallback(
    (coordinates: Coordinates) => {
      setPressDown(true)
      setInitialMousePosition(coordinates)
      setMouseMoveThreshold("not exceeded")
      switch (activeTool) {
        case "none": {
          const curve = getCurveAtPosition(coordinates)
          break
        }
      }
      if (initialView) {
        dispatch(activateFreeDrawFromInitialView())
      }
    },
    [activeTool, dispatch, initialView],
  )

  const handlePressRelease = useCallback(
    (coordinates: Coordinates) => {
      setPressDown(false)
      setInitialMousePosition(null)
      if (
        mouseMoveThreshold === "not exceeded" &&
        (activeTool === "freeDraw" ||
          activeTool === "line" ||
          activeTool === "circleArc" ||
          activeTool === "spiral")
      ) {
        dispatch(unselectCreationTool())
      }
      setAction("none")
    },
    [activeTool, dispatch, mouseMoveThreshold],
  )

  const extendCurve = useCallback(
    (point: Coordinates, curveType: InitialCurve) => {
      if (currentlyDrawnCurve !== null) {
        let curve = { ...currentlyDrawnCurve }
        switch (curveType) {
          case InitialCurve.Freehand: {
            const degree = curve.points.length < 5 ? curve.points.length : 5
            curve.points = [...curve.points, point]
            curve.knots = uniformKnots(degree, curve.points.length)
            break
          }
          case InitialCurve.Line: {
            curve.points = [curve.points[0], point]
            break
          }
          case InitialCurve.CircleArc: {
            break
          }
        }
        dispatch(replaceCurve({ curve }))
        setCurrentlyDrawnCurve(curve)
      }
    },
    [currentlyDrawnCurve, dispatch],
  )

  const draw = useCallback(
    (
      initialCurve: InitialCurve,
      action: ActionType,
      initialMousePosition: Coordinates,
      coordinates: Coordinates,
    ) => {
      flushSync(() => {
        switch (action) {
          case "none":
            if (mouseMoveThreshold === "exceeded") {
              setAction("drawing") // React doesn’t update state immediately, flushSync is necessary for ipad to make the state transition fast enough
              const curve = createCurve(initialCurve, initialMousePosition)
              dispatch(addNewCurve({ curve }))
              setCurrentlyDrawnCurve(curve)
            }
            break
          case "drawing":
            extendCurve(coordinates, initialCurve)
        }
      })
    },
    [dispatch, extendCurve, mouseMoveThreshold],
  )

  const handleMove = useCallback(
    (coordinates: Coordinates) => {
      if (!initialMousePosition) return
      if (mouseMoveThreshold === "not exceeded") {
        const d = distance(initialMousePosition, coordinates)
        if (d > clickWithoutMovingResolution / zoom) {
          setMouseMoveThreshold("just exceeded")
        }
      }
      if (mouseMoveThreshold === "just exceeded") {
        setMouseMoveThreshold("exceeded")
      }

      const deltaX = coordinates.x - initialMousePosition.x
      const deltaY = coordinates.y - initialMousePosition.y
      switch (activeTool) {
        case "none":
          dispatch(scroll({ deltaX, deltaY }))
          break
        case "freeDraw":
          draw(InitialCurve.Freehand, action, initialMousePosition, coordinates)
          break
        case "line":
          draw(InitialCurve.Line, action, initialMousePosition, coordinates)
          break
      }
    },
    [
      action,
      activeTool,
      dispatch,
      draw,
      initialMousePosition,
      mouseMoveThreshold,
      zoom,
    ],
  )

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      const coordinates = getMouseCoordinates(event)
      if (!coordinates) return
      handlePressDown(coordinates)
    },
    [getMouseCoordinates, handlePressDown],
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const coordinates = getMouseCoordinates(event)
      if (!coordinates) return
      if (pressDown) {
        handleMove(coordinates)
      }
    },
    [getMouseCoordinates, handleMove, pressDown],
  )

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      const coordinates = getMouseCoordinates(event)
      if (!coordinates) return
      handlePressRelease(coordinates)
      if (currentlyDrawnCurve) {
        //dispatch(updateThisCurve({ curve: currentlyDrawnCurve }))
        //dispatch(ActionCreators.undo())
        //dispatch(ActionCreators.redo())
        setCurrentlyDrawnCurve(null)
      }
    },
    [currentlyDrawnCurve, getMouseCoordinates, handlePressRelease],
  )

  const handleMouseLeave = useCallback((event: MouseEvent) => {}, [])

  const handleTouchStart = useCallback((event: TouchEvent) => {}, [])

  const handleTouchMove = useCallback((event: TouchEvent) => {}, [])

  const handleTouchEnd = useCallback((event: TouchEvent) => {}, [])

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      const { deltaX, deltaY } = event
      dispatch(scroll({ deltaX: -deltaX / zoom, deltaY: -deltaY / zoom }))
    },
    [dispatch, zoom],
  )

  const handleKeyPress = useCallback((event: KeyboardEvent) => {}, [])

  useEffect(() => {
    if (!canvas) return
    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove)
    canvas.addEventListener("mouseup", handleMouseUp)
    canvas.addEventListener("touchend", handleTouchEnd)
    canvas.addEventListener("mouseleave", handleMouseLeave)
    canvas.addEventListener("wheel", handleWheel)
    window.addEventListener("keydown", handleKeyPress)
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseup", handleMouseUp)
      canvas.removeEventListener("touchend", handleTouchEnd)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
      canvas.removeEventListener("wheel", handleWheel)
      window.removeEventListener("keydown", handleKeyPress)
    }
  }, [
    canvas,
    handleKeyPress,
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
