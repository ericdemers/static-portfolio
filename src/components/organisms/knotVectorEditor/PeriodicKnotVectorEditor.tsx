import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"
import {
  selectControlPolygonsDisplayed,
  selectTheme,
} from "../../templates/sketcher/sketcherSlice"
import type { Curve } from "../../../sketchElements/curveTypes"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"
import { useKnotEditorDrawingFunctions } from "./knotEditorDrawingFunctions"
import { usePeriodicEventHandlers } from "./periodicEventHandler"

const PeriodicKnotVectorEditor = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [pixelRatio, setPixelRatio] = useState<number>(1)
  const [curve, setCurve] = useState<Curve | null>(null)
  const curves = useAppSelector(selectCurves)
  const theme = useAppSelector(selectTheme)
  const controlPolygonsDisplayed = useAppSelector(
    selectControlPolygonsDisplayed,
  )
  const [zoom, setZoom] = useState(1)
  const leftMaximumSliderPosition = 0.35
  const rightMaximumSliderPosition = 0.65
  const maximumZoom = 10
  const [scroll, setScroll] = useState(0)

  const {
    drawLines,
    drawZoomSlider,
    drawPeriodicKnotSlider,
    drawPeriodicBasisFunctions,
    drawPeriodicKnotTicks,
  } = useKnotEditorDrawingFunctions(zoom, sliderPosition(zoom), scroll, width)

  usePeriodicEventHandlers(
    canvasRef.current,
    zoom,
    setZoom,
    width,
    height,
    leftMaximumSliderPosition,
    rightMaximumSliderPosition,
    maximumZoom,
    sliderPosition(zoom),
    curve,
    scroll,
    setScroll,
  )

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

  function sliderPosition(zoom: number) {
    const left = leftMaximumSliderPosition
    const right = rightMaximumSliderPosition
    return left + ((zoom - 1) * (right - left)) / (maximumZoom - 1)
  }

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
      drawPeriodicBasisFunctions(context, curve, ratio)
      drawPeriodicKnotSlider(context, curve, ratio)
      drawPeriodicKnotTicks(context, curve, ratio)
    }

    drawLines(context, ratio)
  }, [
    canvasRef,
    curve,
    drawLines,
    drawPeriodicBasisFunctions,
    drawPeriodicKnotSlider,
    drawPeriodicKnotTicks,
    drawZoomSlider,
    height,
    pixelRatio,
    theme,
    width,
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

export default PeriodicKnotVectorEditor
