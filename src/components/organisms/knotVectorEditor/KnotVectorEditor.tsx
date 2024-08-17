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
import { useAppSelector } from "../../../app/hooks"
import {
  selectControlPolygonsDispayed,
  selectTheme,
} from "../../templates/sketcher/sketcherSlice"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import { computeBasisFunction } from "./basisFunctions"
import { createColorPaletteRGB } from "../../../utilities/color"
import { selectCurves } from "../../../sketchElements/sketchElementsSlice"

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
          }
          break
      }
    },
    [scroll, width, zoom],
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
    }

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
  }, [canvasRef, curve, drawBasisFunctions, height, pixelRatio, theme, width])

  return (
    <div className="shadow rounded-lg bg-white dark:bg-neutral-800 h-full w-full">
      <canvas
        className="w-full h-full pointer-events-auto"
        ref={canvasRef}
        height={height * pixelRatio}
        width={width * pixelRatio}
      />
    </div>
  )
}

export default KnotVectorEditor
