//https://stackoverflow.com/questions/31820079/how-to-size-and-position-a-html5-canvas-in-javascript
//https://stackoverflow.com/questions/72179237/sizing-canvas-element-in-react
//https://stackoverflow.com/questions/66254850/how-to-resize-canvas-according-to-the-parent-div-element-react

import type { FunctionComponent } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useAppSelector } from "../../../app/hooks"
import { selectTheme } from "../../templates/sketcher/sketcherSlice"

/*
interface EditorProps {
  editorWidth: number
  editorHeight: number
  offsetX: number
  offsetY: number
}
*/

//const KnotVectorEditor: FunctionComponent<EditorProps> = props => {
const KnotVectorEditor = () => {
  //const { editorWidth, editorHeight, offsetX, offsetY } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const theme = useAppSelector(selectTheme)

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

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = height / width
    const context = canvas.getContext("2d")
    if (!context) return
    context.save()
    context.clearRect(0, 0, height, width)
    context.scale(width, width)

    const lineColor =
      theme === "dark" ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 1)"
    context.strokeStyle = lineColor
    context.lineJoin = "round"
    context.lineWidth = 1.2 / width
    context.beginPath()
    context.moveTo(0.03, 0.7 * ratio)
    context.lineTo(0.97, 0.7 * ratio)
    context.stroke()

    let lineColorA =
      theme === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
    context.strokeStyle = lineColorA
    context.beginPath()
    context.moveTo(0.03, 0.85 * ratio)
    context.lineTo(0.97, 0.85 * ratio)
    context.stroke()
    context.restore()
    console.log("test")
  }, [canvasRef, height, theme, width])

  return (
    <div className="shadow rounded-lg bg-white dark:bg-neutral-800 h-full w-full">
      <canvas
        className="w-full h-full pointer-events-auto"
        ref={canvasRef}
        height={height}
        width={width}
      />
    </div>
  )
}

export default KnotVectorEditor
