//https://stackoverflow.com/questions/31820079/how-to-size-and-position-a-html5-canvas-in-javascript
//https://stackoverflow.com/questions/72179237/sizing-canvas-element-in-react
//https://stackoverflow.com/questions/66254850/how-to-resize-canvas-according-to-the-parent-div-element-react

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
  selectParametricPosition,
  selectSelectedKnot,
  selectTheme,
  setParametricPosition,
  setSelectedKnot,
} from "../../templates/sketcher/sketcherSlice"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import {
  computeBasisFunction,
  computeComplexRationalBasisFunction,
} from "./basisFunctions"
import { createColorPaletteRGB } from "../../../utilities/color"
import {
  replaceCurve,
  selectCurves,
  updateCurves,
} from "../../../sketchElements/sketchElementsSlice"
import type { Coordinates } from "../../../sketchElements/coordinates"
import {
  computeDegree,
  computeMultiplicityLeft,
  computeMultiplicityRight,
} from "../../../sketchElements/curve"

import { carg, cnorm } from "../../../mathVector/ComplexGrassmannSpace"

type KnotEditorStateType =
  | "idle"
  | "moving a knot"
  | "selected knot"
  | "display position on abscissa"
type ActionType = "none" | "zooming" | "scrolling"
type mouseMoveThresholdType = "not exceeded" | "just exceeded" | "exceeded"

const PeriodicKnotVectorEditor = () => {
  const [editorState, setEditorState] = useState<KnotEditorStateType>("idle")
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")
  const [initialMouseXPosition, setInitialMouseXPosition] = useState<
    number | null
  >(null)

  const dispatch = useAppDispatch()
  const [curve, setCurve] = useState<Curve | null>(null)
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const theme = useAppSelector(selectTheme)
  const selectedKnot = useAppSelector(selectSelectedKnot)
  const parametricPosition = useAppSelector(selectParametricPosition)
  const [zoom, setZoom] = useState(1)
  const [action, setAction] = useState<ActionType>("none")
  const [scroll, setScroll] = useState(0)
  const [pixelRatio, setPixelRatio] = useState<number>(1)
  const maximumZoom = 10
  const leftMaximumSliderPosition = 0.35
  const rightMaximumSliderPosition = 0.65
  const reductionFactor = 0.94
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
      const colorPaletteAngle = createColorPaletteRGB(360, 0.2)

      context.rect(0.03, 0, 0.94, 1)
      context.clip()

      switch (curve.type) {
        case CurveType.NonRational:
          {
            const basisFunctions = computeBasisFunction(curve)
            //context.save()
            context.strokeStyle = colorPalette[0]
            context.lineJoin = "round"
            context.lineWidth = 1.6 / width
            for (let i = -2; i < 3; i += 1) {
              basisFunctions.forEach((b, index) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  context.strokeStyle = colorPalette[index]
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    -b[0].value * ratio * scaleY + offsetTop,
                  )
                  b.forEach((point, index) =>
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      -point.value * ratio * scaleY + offsetTop,
                    ),
                  )
                  context.stroke()
                }
              })
            }
            //context.restore()
          }
          break
        case CurveType.Complex:
          {
            const basisFunctions = computeComplexRationalBasisFunction(curve)
            context.lineWidth = 6 / width
            for (let i = -2; i < 3; i += 1) {
              basisFunctions.forEach((b, bIndex) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    (-Math.atan(cnorm(b[0].value)) / Math.PI) *
                      2 *
                      ratio *
                      scaleY +
                      offsetTop,
                  )
                  const grad = context.createLinearGradient(0, 0, 1, 0)
                  for (let i = 0; i < b.length; i += 1) {
                    const arg = carg(b[i].value)
                    grad.addColorStop(
                      i / b.length,
                      colorPaletteAngle[
                        Math.round(
                          (arg * 180) / Math.PI +
                            (bIndex / basisFunctions.length) * 360,
                        ) % 360
                      ],
                    )
                  }
                  context.strokeStyle = grad
                  b.forEach((point, index) => {
                    if (index === 0) return
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      (-Math.atan(cnorm(point.value)) / Math.PI) *
                        2 *
                        ratio *
                        scaleY +
                        offsetTop,
                    )
                  })
                  context.stroke()
                }
              })
            }

            //context.strokeStyle = colorPalette[0]
            context.lineJoin = "round"
            context.lineWidth = 1.8 / width
            for (let i = -2; i < 3; i += 1) {
              basisFunctions.forEach((b, index) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  context.strokeStyle = colorPalette[index]
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    (-Math.atan(cnorm(b[0].value)) / Math.PI) *
                      2 *
                      ratio *
                      scaleY +
                      offsetTop,
                  )
                  b.forEach((point, index) =>
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      (-Math.atan(cnorm(point.value)) / Math.PI) *
                        2 *
                        ratio *
                        scaleY +
                        offsetTop,
                    ),
                  )
                  context.stroke()
                }
              })
            }
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
      const ticks = multipleCopyOffPositionOfKnotsOnSlider(
        curve.knots,
        degree,
        scaleX,
        offsetLeft,
      )

      //for (let i = -2; i < 3; i += 1) {
      ticks.forEach(u => {
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 9
        context.stroke()
        context.restore()
      })

      if (selectedKnot !== null) {
        const u = ticks[selectedKnot]
        //context.lineWidth = 6 / width
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 11
        context.stroke()
        context.restore()
      }
      if (parametricPosition !== null) {
        const u = parametricPosition * scaleX + offsetLeft
        //context.lineWidth = 1.2 / width
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 3
        context.stroke()
        context.restore()
      }
      //}
    },
    [parametricPosition, scroll, selectedKnot, theme, width, zoom],
  )

  const drawKnotTicks = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      let lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"
      const scaleX = reductionFactor * zoom
      const scaleY = 0.5
      const offsetLeft = 0.05 + reductionFactor * scroll
      const offsetTop = 0.7 * ratio
      context.beginPath()
      context.rect(0.03, 0, 0.94, 1)
      context.clip()
      context.strokeStyle = lineColor
      context.lineJoin = "round"
      context.lineWidth = 1.2 / width
      const ticks = addSpaceBetweenTicks(curve.knots, 0.005 / zoom)

      for (let i = -2; i < 3; i += 1)
        ticks.forEach(u => {
          context.beginPath()
          context.moveTo(
            (u + i) * scaleX + offsetLeft,
            +0.04 * ratio * scaleY + offsetTop,
          )
          context.lineTo(
            (u + i) * scaleX + offsetLeft,
            -0.04 * ratio * scaleY + offsetTop,
          )
          context.save()
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.lineWidth = 2
          context.stroke()
          context.restore()
        })
    },
    [scroll, theme, width, zoom],
  )

  const drawZoomSlider = useCallback(
    (context: CanvasRenderingContext2D, ratio: number = 1) => {
      const left = leftMaximumSliderPosition
      const right = rightMaximumSliderPosition
      const lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"
      const lineColorA =
        theme === "dark" ? "rgba(250, 250, 250, 0.5)" : "rgba(0, 0, 0, 0.5)"
      const lineColorB =
        theme === "dark" ? "rgba(250, 250, 250, 0.8)" : "rgba(0, 0, 0, 0.8)"

      context.strokeStyle = lineColorA
      context.lineJoin = "round"
      context.beginPath()
      context.moveTo(left, 0.15 * ratio)
      context.lineTo(right, 0.15 * ratio)

      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.lineWidth = 2
      context.stroke()
      context.restore()

      context.strokeStyle = lineColor
      context.beginPath()
      //minus symbol
      context.moveTo(0.33 - 0.025 * ratio, 0.15 * ratio)
      context.lineTo(0.33 + 0.025 * ratio, 0.15 * ratio)
      //plus symbol
      context.moveTo(0.67 - 0.025 * ratio, 0.15 * ratio)
      context.lineTo(0.67 + 0.025 * ratio, 0.15 * ratio)
      context.moveTo(0.67, 0.125 * ratio)
      context.lineTo(0.67, 0.175 * ratio)

      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.lineWidth = 3
      context.stroke()
      context.restore()

      //context.lineWidth = 4.5 / width
      context.strokeStyle = lineColorB
      context.lineCap = "round"
      context.beginPath()
      //slider
      const position = sliderPosition(zoom)
      context.moveTo(position, 0.125 * ratio)
      context.lineTo(position, 0.175 * ratio)

      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.lineWidth = 9
      context.stroke()
      context.restore()
    },
    [theme, zoom],
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

    drawZoomSlider(context, ratio)
    if (curve) {
      drawBasisFunctions(context, curve, ratio)
      drawKnotSlider(context, curve, ratio)
      drawKnotTicks(context, curve, ratio)
    }

    const lineColor =
      theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"

    context.beginPath()
    context.moveTo(0.03, 0.7 * ratio)
    context.lineTo(0.97, 0.7 * ratio)

    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.lineWidth = 3
    context.strokeStyle = lineColor
    context.stroke()
    context.restore()

    context.beginPath()
    context.moveTo(0.03, 0.85 * ratio)
    context.lineTo(0.97, 0.85 * ratio)

    //context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    let lineColorA =
      theme === "dark" ? "rgba(250, 250, 250, 0.5)" : "rgba(0, 0, 0, 0.5)"
    context.lineWidth = 3
    context.strokeStyle = lineColorA
    context.stroke()
    //context.restore()

    context.restore()
  }, [
    canvasRef,
    curve,
    drawBasisFunctions,
    drawKnotSlider,
    drawKnotTicks,
    drawZoomSlider,
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
      } else if (onBasisFunctionsArea(point)) {
        setAction("scrolling")
        setInitialMouseXPosition(point.x)
        dispatch(setSelectedKnot({ value: null }))
        dispatch(setParametricPosition({ value: null }))
      } else if (onKnotSliderArea(point)) {
        setInitialMouseXPosition(point.x)
        if (curve) {
          const scaleX = reductionFactor * zoom
          const offsetLeft = 0.05 + reductionFactor * scroll
          let position =
            positionToParameterOnKnotSlider(point.x, scaleX, offsetLeft) % 1
          if (position < 0) position = 0
          if (position > 1) position = 1
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

  const moveKnots = useCallback(
    (curve: Curve, index: number, newPosition: number) => {
      let newKnots = [...curve.knots]
      //console.log(newKnots)
      const multiplicityRight = computeMultiplicityRight(curve.knots, index)
      const multiplicityLeft = computeMultiplicityLeft(curve.knots, index)

      for (
        let i = index - multiplicityLeft;
        i < index + multiplicityRight + 1;
        i += 1
      ) {
        newKnots[i] = newPosition
      }
      //console.log(newKnots)
      //newKnots[index] = newPosition
      //console.log(index)
      //console.log(newPosition)
      dispatch(replaceCurve({ curve: { ...curve, knots: newKnots } }))
      dispatch(setParametricPosition({ value: newPosition }))
    },
    [dispatch],
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
        if (newScroll < -1 * zoom) newScroll = 0
        if (newScroll > 1 * zoom) newScroll = 0
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
        let newPosition = ((x - offsetLeft) / zoom / reductionFactor) % 1
        if (newPosition < 0) newPosition = 0
        if (newPosition > 1) newPosition = 1
        //const index = selectedKnot + computeDegree(curve) + 1
        const index = selectedKnot
        const cpd = controlPolygonsDisplayed

        if (!cpd || mouseMoveThreshold !== "exceeded") return
        //dispatch(setParametricPosition({ value: newPosition }))
        moveKnots(curve, index, newPosition)
      }
    },
    [
      action,
      controlPolygonsDisplayed,
      curve,
      editorState,
      initialMouseXPosition,
      mouseMoveThreshold,
      moveKnots,
      scroll,
      selectedKnot,
      viewportCoordsToSceneCoords,
      zoom,
    ],
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

  const handlePressRelease = useCallback(
    (newMousePosition: Coordinates) => {
      if (editorState !== "display position on abscissa") {
        //actionManager.renderAction("displayParametricPositionOnCurve", null)
      }

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
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    handleWheel,
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

function multipleCopyOffPositionOfKnotsOnSlider(
  knots: number[],
  degree: number,
  scaleX: number,
  offsetLeft: number,
) {
  //const ticks = knots
  let ticks: number[] = []
  for (let i = -3; i < 2; i += 1) {
    knots.forEach(value => ticks.push(value + i))
  }
  return ticks.map(u => u * scaleX + offsetLeft)
}

function positionOfKnotsOnSlider(
  knots: number[],
  degree: number,
  scaleX: number,
  offsetLeft: number,
) {
  //const ticks = knots
  let ticks: number[] = []

  knots.forEach(value => ticks.push(value))

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

export function addSpaceBetweenTicks(knots: number[], step: number = 0.01) {
  let result: number[] = []
  let multiplicity = 1
  knots.forEach((u, i) => {
    if (i === knots.length - 1) {
      result = result.concat(distribute(u, multiplicity, step))
    } else if (knots[i] === knots[i + 1]) {
      multiplicity += 1
    } else {
      result = result.concat(distribute(u, multiplicity, step))
      multiplicity = 1
    }
  })
  return result
}

function distribute(value: number, multiplicity: number, step: number = 0.01) {
  let result: number[] = []
  if (multiplicity === 1) {
    return [value]
  }
  const left = value - ((multiplicity - 1) * step) / 2
  for (let i = 0; i < multiplicity; i += 1) {
    result.push(left + i * step)
  }
  return result
}

export default PeriodicKnotVectorEditor
