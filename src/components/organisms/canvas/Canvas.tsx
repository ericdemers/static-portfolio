import { useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"

import { useEventHandlers } from "./eventHandlers"
import {
  selectControlPolygonsDispayed,
  selectParametricPosition,
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
  const {
    drawCurve,
    drawControlPoints,
    drawControlPolygon,
    drawPositionOnCurve,
  } = useDrawingFunctions()
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(selectControlPolygonsDispayed)
  const parametricPosition = useAppSelector(selectParametricPosition)

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
    })
    if (controlPolygonsDisplayed) {
      const selectedCurves = curves.filter(curve =>
        controlPolygonsDisplayed.curveIDs.includes(curve.id),
      )
      selectedCurves.forEach(curve => {
        const selectedControlPointIndex =
          controlPolygonsDisplayed.selectedControlPoint &&
          controlPolygonsDisplayed.selectedControlPoint.curveID === curve.id
            ? controlPolygonsDisplayed.selectedControlPoint.controlPointIndex
            : null
        drawControlPoints(context, curve, selectedControlPointIndex)
        drawControlPolygon(context, curve)
        if (parametricPosition !== null)
          drawPositionOnCurve(context, curve, parametricPosition)
      })
    }
    context.restore()
  }, [
    canvasHeight,
    canvasWidth,
    controlPolygonsDisplayed,
    curves,
    drawControlPoints,
    drawControlPolygon,
    drawCurve,
    drawPositionOnCurve,
    parametricPosition,
    pixelRatio,
    scrollX,
    scrollY,
    theme,
    zoom,
  ])

  //const bg = theme === "dark" ? "black" : "white"
  const bg = theme === "light" ? "rgba(253, 253, 253, 1)" : "rgba(0, 0, 0, 1)"

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
