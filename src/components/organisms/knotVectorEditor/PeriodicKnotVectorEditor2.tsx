import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"
import {
  selectControlPolygonsDispayed,
  selectTheme,
} from "../../templates/sketcher/sketcherSlice"
import type { Curve } from "../../../sketchElements/curveTypes"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"
import { usePeriodicEventHandlers } from "./PeriodicEventHandler"
import { useKnotEditorDrawingFunctions } from "./knotEditorDrawingFunctions"

const PeriodicKnotVectorEditor2 = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [pixelRatio, setPixelRatio] = useState<number>(1)
  const [curve, setCurve] = useState<Curve | null>(null)
  const curves = useAppSelector(selectCurves)
  const theme = useAppSelector(selectTheme)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const [zoom, setZoom] = useState(1)
  const leftMaximumSliderPosition = 0.35
  const rightMaximumSliderPosition = 0.65
  const maximumZoom = 10

  const { drawZoomSlider } = useKnotEditorDrawingFunctions(
    zoom,
    sliderPosition(zoom),
  )

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
      //drawBasisFunctions(context, curve, ratio)
      //drawKnotSlider(context, curve, ratio)
      //drawKnotTicks(context, curve, ratio)
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
  }, [canvasRef, curve, drawZoomSlider, height, pixelRatio, theme, width])

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

export default PeriodicKnotVectorEditor2
