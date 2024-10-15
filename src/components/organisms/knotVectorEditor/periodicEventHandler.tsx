import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import type { Coordinates } from "../../../sketchElements/coordinates"
import {
  replaceCurve,
  selectCurves,
  updateCurves,
} from "../../../sketchElements/sketchElementsSlice"
import {
  selectSelectedKnot,
  setParametricPosition,
  setSelectedKnot,
} from "../../templates/sketcher/sketcherSlice"
import {
  clickWithoutMovingResolution,
  periodicReductionFactor,
} from "./KnotEditorConstants"
import type { Curve } from "../../../sketchElements/curveTypes"
import {
  computeCyclicNewPosition,
  computeMultiplicityLeft,
  computeMultiplicityRight,
  computePeriodicMultiplicityLeft,
  computePeriodicMultiplicityRight,
  mod,
} from "../../../sketchElements/curve"

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
  curve: Curve | null,
  scroll: number,
  setScroll: React.Dispatch<React.SetStateAction<number>>,
) => {
  const [editorState, setEditorState] = useState<KnotEditorStateType>("idle")
  const [initialMouseXPosition, setInitialMouseXPosition] = useState<
    number | null
  >(null)
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")

  const [action, setAction] = useState<ActionType>("none")
  const dispatch = useAppDispatch()
  const curves = useAppSelector(selectCurves)
  const selectedKnot = useAppSelector(selectSelectedKnot)

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

  const onBasisFunctionsArea = useCallback((point: Coordinates) => {
    if (point.y > 0.2 && point.y < 0.7) {
      return true
    }
  }, [])

  const onKnotSliderArea = useCallback((point: Coordinates) => {
    if (point.y > 0.75 && point.y < 0.95) {
      return true
    }
  }, [])

  function positionToParameterOnKnotSlider(
    u: number,
    scaleX: number,
    offsetLeft: number,
  ) {
    return (u - offsetLeft) / scaleX
  }

  function getKnotAtPosition(
    position: number,
    knots: number[],
    delta: number = 0.015,
  ) {
    /*
    const result = knots.findIndex(
      u => Math.abs(u - position) < delta || Math.abs(1 - u - position) < delta,
    )
    */

    const result = knots.findIndex(
      u =>
        Math.abs(u - position) < delta ||
        Math.abs(knots[0] - position + 1) < delta,
    )

    if (result === -1) {
      return null
    } else return result
  }

  const moveKnots = useCallback(
    (curve: Curve, index: number, position: number) => {
      const newPosition = computeCyclicNewPosition(curve.knots[index], position)
      let newKnots = [...curve.knots]
      const multiplicityRight = computeMultiplicityRight(curve.knots, index)
      const multiplicityLeft = computeMultiplicityLeft(curve.knots, index)
      for (
        let i = index - multiplicityLeft;
        i < index + multiplicityRight + 1;
        i += 1
      ) {
        newKnots[i] = newPosition
      }

      const leftPeriodicMultiplicity = computePeriodicMultiplicityLeft(
        newKnots,
        index,
      )
      const rightPeriodicMultiplicity = computePeriodicMultiplicityRight(
        newKnots,
        index,
      )
      for (let i = 0; i < leftPeriodicMultiplicity; i += 1) {
        newKnots[newKnots.length - i - 1] = newPosition + 1
      }
      for (let i = 0; i < rightPeriodicMultiplicity; i += 1) {
        newKnots[i] = newPosition - 1
      }

      dispatch(replaceCurve({ curve: { ...curve, knots: newKnots } }))
      dispatch(setParametricPosition({ value: newPosition }))
    },
    [dispatch],
  )

  const handlePressDown = useCallback(
    (client: { clientX: number; clientY: number }) => {
      setMouseMoveThreshold("not exceeded")
      const point = viewportCoordsToSceneCoords(client)
      if (!point) return
      if (onZoomSlider(point)) {
        setAction("zooming")
      } else if (onBasisFunctionsArea(point)) {
        setAction("scrolling")
        setInitialMouseXPosition(point.x)
        dispatch(setSelectedKnot({ value: null }))
        dispatch(setParametricPosition({ value: null }))
      } else if (onKnotSliderArea(point)) {
        setInitialMouseXPosition(point.x)
        if (curve) {
          const scaleX = periodicReductionFactor * zoom
          const offsetLeft = 0.05 + periodicReductionFactor * scroll
          let parameter = positionToParameterOnKnotSlider(
            point.x,
            scaleX,
            offsetLeft,
          )
          if (parameter - curve.knots[0] > 0.5) {
            parameter = parameter - 1
          }
          if (parameter - curve.knots[0] < -0.5) {
            parameter = parameter + 1
          }
          let position = curve.knots[0] + mod(parameter - curve.knots[0], 1)

          const knotIndex = getKnotAtPosition(position, curve.knots)

          if (knotIndex !== null) {
            dispatch(setSelectedKnot({ value: knotIndex }))
            dispatch(setParametricPosition({ value: position }))
            setEditorState("moving a knot")
          } else {
            dispatch(setSelectedKnot({ value: null }))
            dispatch(setParametricPosition({ value: position }))
            setEditorState("display position on abscissa")
          }
        }
      }
    },
    [
      curve,
      dispatch,
      onBasisFunctionsArea,
      onKnotSliderArea,
      onZoomSlider,
      scroll,
      viewportCoordsToSceneCoords,
      zoom,
    ],
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
        setZoom(newZoom)
        setScroll(newScroll)
      }
      if (action === "scrolling" && initialMouseXPosition && curve !== null) {
        let newScroll = scroll + (x - initialMouseXPosition)
        //if (newScroll < -0.5 * zoom) newScroll = 0.5
        //if (newScroll > 0.5 * zoom) newScroll = -0.5
        if (newScroll + curve.knots[0] < -1 * zoom) newScroll = -curve.knots[0]
        if (newScroll + curve.knots[0] > 1 * zoom) newScroll = -curve.knots[0]
        setInitialMouseXPosition(x)
        setScroll(newScroll)
      }
      if (editorState === "moving a knot") {
        if (initialMouseXPosition === null) return
        if (mouseMoveThreshold === "just exceeded") {
          setMouseMoveThreshold("exceeded")
        }
        if (mouseMoveThreshold === "not exceeded") {
          const d = Math.abs(initialMouseXPosition - x)
          if (d > clickWithoutMovingResolution / zoom) {
            setMouseMoveThreshold("just exceeded")
          }
        }
        if (!curve || selectedKnot === null) return
        const offsetLeft = 0.05 + periodicReductionFactor * scroll
        //let newPosition = mod((x - offsetLeft) / zoom / reductionFactor, 1)
        let newPosition = (x - offsetLeft) / zoom / periodicReductionFactor
        //if (newPosition < 0) newPosition = 0
        //if (newPosition > 1) newPosition = 1
        //const index = selectedKnot + computeDegree(curve) + 1
        //console.log(newPosition)
        const index = selectedKnot
        //const cpd = controlPolygonsDisplayed

        //if (!cpd || mouseMoveThreshold !== "exceeded") return
        if (mouseMoveThreshold !== "exceeded") return
        //dispatch(setParametricPosition({ value: newPosition }))
        moveKnots(curve, index, newPosition)
      }
    },
    [
      action,
      curve,
      editorState,
      initialMouseXPosition,
      maximumZoom,
      mouseMoveThreshold,
      moveKnots,
      scroll,
      selectedKnot,
      setScroll,
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
      if (curve === null) return
      if (newScroll + curve.knots[0] < -1 * zoom) newScroll = -curve.knots[0]
      if (newScroll + curve.knots[0] > 1 * zoom) newScroll = -curve.knots[0]
      setScroll(newScroll)
    },
    [curve, scroll, setScroll, zoom],
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
