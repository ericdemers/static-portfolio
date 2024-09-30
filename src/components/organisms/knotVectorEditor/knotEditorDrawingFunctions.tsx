import { useCallback } from "react"
import { useAppSelector } from "../../../app/hooks"
import { selectTheme } from "../../templates/sketcher/sketcherSlice"
import {
  leftMaximumSliderPosition,
  rightMaximumSliderPosition,
} from "./KnotEditorConstants"

export const useKnotEditorDrawingFunctions = (
  zoom: number,
  sliderPosition: number,
) => {
  const theme = useAppSelector(selectTheme)

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
      const position = sliderPosition
      context.moveTo(position, 0.125 * ratio)
      context.lineTo(position, 0.175 * ratio)

      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.lineWidth = 9
      context.stroke()
      context.restore()
    },
    [sliderPosition, theme],
  )

  return {
    drawZoomSlider,
  }
}
