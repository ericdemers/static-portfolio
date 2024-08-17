//https://stackoverflow.com/questions/31820079/how-to-size-and-position-a-html5-canvas-in-javascript
//https://stackoverflow.com/questions/72179237/sizing-canvas-element-in-react
//https://stackoverflow.com/questions/66254850/how-to-resize-canvas-according-to-the-parent-div-element-react

import type { FunctionComponent } from "react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import {
  selectControlPolygonsDispayed,
  selectTheme,
} from "../../templates/sketcher/sketcherSlice"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import { computeBasisFunction } from "./basisFunctions"
import { createColorPaletteRGB } from "../../../utilities/color"
import {
  moveKnot,
  selectCurves,
  updateCurves,
} from "../../../sketchElements/sketchElementsSlice"
import type { Coordinates } from "../../../sketchElements/coordinates"
import { computeDegree } from "../../../sketchElements/curve"

/*
interface EditorProps {
  editorWidth: number
  editorHeight: number
  offsetX: number
  offsetY: number
}
*/

type KnotEditorStateType =
  | "idle"
  | "moving a knot"
  | "selected knot"
  | "display position on abscissa"
type ActionType = "none" | "zooming" | "scrolling"
type mouseMoveThresholdType = "not exceeded" | "just exceeded" | "exceeded"

//const KnotVectorEditor: FunctionComponent<EditorProps> = props => {
const KnotVectorEditor = () => {
  //const { editorWidth, editorHeight, offsetX, offsetY } = props
  const [editorState, setEditorState] = useState<KnotEditorStateType>("idle")
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")
  const [initialMouseXPosition, setInitialMouseXPosition] = useState<
    number | null
  >(null)

  const dispatch = useAppDispatch()

  const [selectedKnot, setSelectedKnot] = useState<number | null>(null)

  const [curve, setCurve] = useState<Curve | null>(null)
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const theme = useAppSelector(selectTheme)
  const [zoom, setZoom] = useState(1)
  const [action, setAction] = useState<ActionType>("none")
  const [scroll, setScroll] = useState(0)
  const [pixelRatio, setPixelRatio] = useState<number>(1)
  const maximumZoom = 10
  const leftMaximumSliderPosition = 0.35
  const rightMaximumSliderPosition = 0.65
  const reductionFactor = 0.9
  const clickWithoutMovingResolution = 0.0005

  useLayoutEffect(() => {
    setPixelRatio(Math.ceil(window.devicePixelRatio))
  }, [])

  useLayoutEffect(() => {
    if (controlPolygonsDisplayed === null) {
      setCurve(null)
      return
    }
    const selectedCurves = curves.filter(curve =>
      controlPolygonsDisplayed.curveIDs.includes(curve.id),
    )
    setCurve(selectedCurves[0])
  }, [controlPolygonsDisplayed, curves])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resizeOberver = new ResizeObserver(() => {
      setWidth(canvas.clientWidth)
      setHeight(canvas.clientHeight)
    })
    resizeOberver.observe(canvas)
    return () => resizeOberver.disconnect()
  }, [])

  const drawBasisFunctions = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      const scaleX = reductionFactor * zoom
      const scaleY = 0.5
      const offsetLeft = 0.05 + reductionFactor * scroll
      const offsetTop = 0.7 * ratio
      const colorPalette = createColorPaletteRGB(curve.points.length, 1)
      switch (curve.type) {
        case CurveType.NonRational:
          {
            const basisFunctions = computeBasisFunction(curve)
            //context.save()
            context.strokeStyle = colorPalette[0]
            context.lineJoin = "round"
            context.lineWidth = 1.6 / width
            basisFunctions.forEach((b, index) => {
              if (b[0] !== undefined) {
                context.beginPath()
                context.strokeStyle = colorPalette[index]
                context.moveTo(
                  b[0].u * scaleX + offsetLeft,
                  -b[0].value * ratio * scaleY + offsetTop,
                )
                b.forEach((point, index) =>
                  context.lineTo(
                    point.u * scaleX + offsetLeft,
                    -point.value * ratio * scaleY + offsetTop,
                  ),
                )
                context.stroke()
              }
            })
            //context.restore()
          }
          break
      }
    },
    [scroll, width, zoom],
  )

  const drawKnotSlider = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      let lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 0.8)" : "rgba(0, 0, 0, 0.8)"
      const scaleX = reductionFactor * zoom
      const offsetLeft = 0.05 + reductionFactor * scroll
      const offsetTop = 0.85 * ratio
      //context.save()
      context.beginPath()
      context.rect(0.03, 0, 0.94, 1)
      context.clip()

      context.strokeStyle = lineColor
      context.lineCap = "round"
      context.lineWidth = 4.5 / width
      let degree = curve.knots.length - curve.points.length - 1
      if (curve.type !== CurveType.NonRational) {
        degree = Math.round(
          curve.knots.length - (curve.points.length / 2 + 0.5) - 1,
        )
      }
      const ticks = positionOfKnotsOnSlider(
        curve.knots,
        degree,
        scaleX,
        offsetLeft,
      )
      ticks.forEach(u => {
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.stroke()
      })
      /*
      if (sketcherState.selectedKnot !== null) {
        const u = ticks[sketcherState.selectedKnot]
        context.lineWidth = 6 / windowWidth
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.stroke()
        context.restore()
      }
      */
    },
    [scroll, theme, width, zoom],
  )

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = height / width
    const context = canvas.getContext("2d")
    if (!context) return
    context.save()
    context.clearRect(0, 0, width * pixelRatio, height * pixelRatio)
    context.scale(width * pixelRatio, width * pixelRatio)

    if (curve) {
      drawBasisFunctions(context, curve, ratio)
      drawKnotSlider(context, curve, ratio)
    }

    const lineColor =
      theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"
    context.strokeStyle = lineColor
    context.lineJoin = "round"
    context.lineWidth = 1.2 / width
    context.beginPath()
    context.moveTo(0.03, 0.7 * ratio)
    context.lineTo(0.97, 0.7 * ratio)
    context.stroke()

    let lineColorA =
      theme === "dark" ? "rgba(250, 250, 250, 0.5)" : "rgba(0, 0, 0, 0.5)"
    context.strokeStyle = lineColorA
    context.beginPath()
    context.moveTo(0.03, 0.85 * ratio)
    context.lineTo(0.97, 0.85 * ratio)
    context.stroke()
    context.restore()
  }, [
    canvasRef,
    curve,
    drawBasisFunctions,
    drawKnotSlider,
    height,
    pixelRatio,
    theme,
    width,
  ])

  const viewportCoordsToSceneCoords = useCallback(
    ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()

      const x = (clientX - rect.left) / width
      const y = (clientY - rect.top) / height
      return { x, y }
    },
    [height, width],
  )

  function sliderPosition(zoom: number) {
    const left = leftMaximumSliderPosition
    const right = rightMaximumSliderPosition
    return left + ((zoom - 1) * (right - left)) / (maximumZoom - 1)
  }

  function zoomFromSliderPosition(position: number) {
    const left = leftMaximumSliderPosition
    const right = rightMaximumSliderPosition
    return ((position - left) * (maximumZoom - 1)) / (right - left) + 1
  }

  const onZoomSlider = useCallback(
    (point: Coordinates) => {
      if (point.y < 0.2 && Math.abs(point.x - sliderPosition(zoom)) < 0.05) {
        return true
      }
    },
    [zoom],
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

  const handlePressDown = useCallback(
    (client: { clientX: number; clientY: number }) => {
      //setSelectedKnot(null)
      //actionManager.renderAction("selectKnot", null)
      setEditorState("idle")
      //setParametricPosition(null)
      //actionManager.renderAction("displayParametricPositionOnCurve", null)

      setMouseMoveThreshold("not exceeded")
      const point = viewportCoordsToSceneCoords(client)
      if (!point) return
      if (onZoomSlider(point)) {
        setAction("zooming")
        //actionManager.renderAction(
        //  "removeParametricPositionOnCurveAndKnotSelection",
        //)
      } else if (onBasisFunctionsArea(point)) {
        setAction("scrolling")
        setInitialMouseXPosition(point.x)
        //actionManager.renderAction(
        //  "removeParametricPositionOnCurveAndKnotSelection",
        //)
      } else if (onKnotSliderArea(point)) {
        setInitialMouseXPosition(point.x)
        if (curve) {
          const scaleX = reductionFactor * zoom
          const offsetLeft = 0.05 + reductionFactor * scroll
          const degree = computeDegree(curve)
          const knots = positionOfKnotsOnSlider(
            curve.knots,
            degree,
            scaleX,
            offsetLeft,
          )
          const knotIndex = getKnotAtPosition(point.x, knots)
          //setSelectedKnot(knotIndex)
          if (knotIndex !== null) {
            //actionManager.renderAction("selectKnot", knotIndex)
            setSelectedKnot(knotIndex)
            setEditorState("moving a knot")
          } else {
            let position = positionToParameterOnKnotSlider(
              point.x,
              scaleX,
              offsetLeft,
            )
            if (position < 0) position = 0
            if (position > 1) position = 1
            //setParametricPosition(position)
            //actionManager.renderAction(
            //  "displayParametricPositionOnCurveAndRemoveKnotSelection",
            //  position,
            //)
            setEditorState("display position on abscissa")
          }
        }
      }
    },
    [
      curve,
      onBasisFunctionsArea,
      onKnotSliderArea,
      onZoomSlider,
      scroll,
      viewportCoordsToSceneCoords,
      zoom,
    ],
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

  const handleMove = useCallback(
    (point: { clientX: number; clientY: number }) => {
      const p = viewportCoordsToSceneCoords(point)
      if (p === undefined) return
      const x = p.x
      if (editorState !== "display position on abscissa") {
        //actionManager.renderAction("displayParametricPositionOnCurve", null)
      }

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
      if (action === "scrolling" && initialMouseXPosition) {
        let newScroll = scroll + (x - initialMouseXPosition)
        if (newScroll > 0) newScroll = 0
        if (newScroll < 1 - zoom) newScroll = 1 - zoom
        setInitialMouseXPosition(x)
        setScroll(newScroll)
      }
      if (editorState === "moving a knot") {
        if (initialMouseXPosition === null) return
        if (mouseMoveThreshold === "just exceeded") {
          //addAnEntryToTheHistory()
          setMouseMoveThreshold("exceeded")
        }
        if (mouseMoveThreshold === "not exceeded") {
          const d = Math.abs(initialMouseXPosition - x)
          if (d > clickWithoutMovingResolution / zoom) {
            setMouseMoveThreshold("just exceeded")
          }
        }
        if (!curve || selectedKnot === null) return
        const offsetLeft = 0.05 + reductionFactor * scroll
        let newPosition = (x - offsetLeft) / zoom / reductionFactor
        if (newPosition < 0) newPosition = 0
        if (newPosition > 1) newPosition = 1
        const index = selectedKnot + computeDegree(curve) + 1
        const cpd = controlPolygonsDisplayed

        if (!cpd || mouseMoveThreshold !== "exceeded") return
        dispatch(
          moveKnot({
            index: index,
            newPosition: newPosition,
            controlPolygonsDisplayed,
          }),
        )
      }
    },
    [
      action,
      controlPolygonsDisplayed,
      curve,
      dispatch,
      editorState,
      initialMouseXPosition,
      mouseMoveThreshold,
      scroll,
      selectedKnot,
      viewportCoordsToSceneCoords,
      zoom,
    ],
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      handleMove({ clientX: event.clientX, clientY: event.clientY })
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

  const handlePressRelease = useCallback(
    (newMousePosition: Coordinates) => {
      if (editorState !== "display position on abscissa") {
        //actionManager.renderAction("displayParametricPositionOnCurve", null)
      }

      setAction("none")
      setInitialMouseXPosition(null)
      if (editorState === "moving a knot") {
        setEditorState("selected knot")
        dispatch(updateCurves({ curves: curves.slice() }))
      }
    },
    [curves, dispatch, editorState],
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
    if (!canvasRef.current) {
      return
    }
    const canvas: HTMLCanvasElement = canvasRef.current
    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove)
    canvas.addEventListener("mouseup", handleMouseUp)
    canvas.addEventListener("touchend", handleTouchEnd)
    canvas.addEventListener("mouseleave", handleMouseLeave)
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseup", handleMouseUp)
      canvas.removeEventListener("touchend", handleTouchEnd)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
  ])

  return (
    <div className="shadow-lg rounded-lg bg-white dark:bg-neutral-800 h-full w-full">
      <canvas
        className="w-full h-full pointer-events-auto"
        ref={canvasRef}
        height={height * pixelRatio}
        width={width * pixelRatio}
      />
    </div>
  )
}

function positionOfKnotsOnSlider(
  knots: number[],
  degree: number,
  scaleX: number,
  offsetLeft: number,
) {
  const ticks = knots.slice(degree + 1, -(degree + 1))
  return ticks.map(u => u * scaleX + offsetLeft)
}

function positionToParameterOnKnotSlider(
  u: number,
  scaleX: number,
  offsetLeft: number,
) {
  return (u - offsetLeft) / scaleX
}

function parameterToPositionOnKnotSlider(
  u: number,
  scaleX: number,
  offsetLeft: number,
) {
  return u * scaleX + offsetLeft
}

function getKnotAtPosition(
  position: number,
  knots: number[],
  delta: number = 0.015,
) {
  const result = knots.findIndex(u => Math.abs(u - position) < delta)
  if (result === -1) {
    return null
  } else return result
}

export default KnotVectorEditor
