import { useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"
//import { selectTheme } from "../mainMenu/mainMenuSlice"

import { useEventHandlers } from "./eventHandlers"
import {
  selectControlPolygonsDispayed,
  selectScrollX,
  selectScrollY,
  selectTheme,
  selectZoom,
} from "../../templates/sketcher/sketcherSlice"
import { useDrawingFunctions } from "./drawingFunctions"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"

interface CanvasProps {
  canvasWidth: number
  canvasHeight: number
}

function Canvas(props: Readonly<CanvasProps>) {
  const { canvasWidth, canvasHeight } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const theme = useAppSelector(selectTheme)
  const zoom = useAppSelector(selectZoom)
  const scrollX = useAppSelector(selectScrollX)
  const scrollY = useAppSelector(selectScrollY)
  const [pixelRatio, setPixelRatio] = useState<number>(1)
  const { drawCurve, drawControlPoints } = useDrawingFunctions()
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)

  useLayoutEffect(() => {
    setPixelRatio(Math.ceil(window.devicePixelRatio))
  }, [])

  useEventHandlers(canvasRef.current)

  useLayoutEffect(() => {
    const lineColor =
      theme === "dark" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)"
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    context.save()
    context.strokeStyle = lineColor
    context.clearRect(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio)
    context.scale(zoom * pixelRatio, zoom * pixelRatio)
    context.translate(scrollX, scrollY)
    curves.forEach(curve => {
      drawCurve(context, curve)
      //drawControlPoints(context, curve, null)
    })
    if (controlPolygonsDisplayed) {
      const selectedCurves = curves.filter(curve =>
        controlPolygonsDisplayed.curveIDs.includes(curve.id),
      )
      selectedCurves.forEach(curve => {
        let selectedControlPointIndex = null
        if (
          controlPolygonsDisplayed.selectedControlPoint &&
          curve.id === controlPolygonsDisplayed.selectedControlPoint.curveID
        ) {
          selectedControlPointIndex =
            controlPolygonsDisplayed.selectedControlPoint.controlPointIndex
        }
        drawControlPoints(context, curve, selectedControlPointIndex)
      })
    }
    context.restore()
  }, [
    canvasHeight,
    canvasWidth,
    controlPolygonsDisplayed,
    curves,
    drawControlPoints,
    drawCurve,
    pixelRatio,
    scrollX,
    scrollY,
    theme,
    zoom,
  ])

  const bg = theme === "dark" ? "black" : "white"

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth * pixelRatio}
      height={canvasHeight * pixelRatio}
      style={{ backgroundColor: bg, width: canvasWidth, height: canvasHeight }}
      className="rounded select-none"
    />
  )
}

export default Canvas
