import { useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"
//import { selectTheme } from "../mainMenu/mainMenuSlice"

import { useEventHandlers } from "./eventHandlers"
import {
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
  const { drawCurve } = useDrawingFunctions()
  const curves = useAppSelector(selectCurves)

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

    /*
    context.lineWidth = 1.4 / zoom
    context.beginPath() // Start a new path
    context.moveTo(340, 400)
    context.lineTo(320, 110)
    context.moveTo(220, 300)
    context.lineTo(420, 310)
    context.stroke() // Render the path
    context.beginPath()
    context.arc(200, 275, 100, 0, Math.PI)
    context.stroke()
    */
    curves.forEach(curve => drawCurve(context, curve))
    context.restore()
  }, [
    canvasHeight,
    canvasWidth,
    curves,
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
