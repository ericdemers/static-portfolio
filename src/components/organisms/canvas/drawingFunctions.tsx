import { useCallback } from "react"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import { useAppSelector } from "../../../app/hooks"
//import { selectTheme } from "../mainMenu/mainMenuSlice"

import { pointsOnCurve } from "../../../sketchElements/curve"
import { selectTheme, selectZoom } from "../../templates/sketcher/sketcherSlice"
import { createColorPaletteRGB } from "../../../utilities/color"

export const useDrawingFunctions = () => {
  const theme = useAppSelector(selectTheme)
  const zoom = useAppSelector(selectZoom)

  const drawCurve = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      const lineColor =
        theme === "dark" ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 1)"
      switch (curve.type) {
        case CurveType.NonRational:
          {
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            context.beginPath()
            const points = pointsOnCurve(curve, 1000)
            context.moveTo(points[0].x, points[0].y)
            points.forEach(point => context.lineTo(point.x, point.y))
            context.stroke()
          }
          break
        case CurveType.Rational:
          {
            /*
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / sketcherState.zoom
            context.beginPath()
            const points = pointsOnCurve(curve, 1000)
            context.moveTo(points[0].x, points[0].y)
            points.forEach(point => context.lineTo(point.x, point.y))
            context.stroke() */
          }
          break
        case CurveType.Complex:
          {
            /*
            if (curve.points.length >= 3 && curve.knots.length === 0) {
              const points = arcPointsFromMultiplePoints(curve.points)
              context.strokeStyle = lineColor
              context.lineJoin = "round"
              context.lineWidth = 1.5 / sketcherState.zoom
              context.beginPath()
              context.moveTo(points[0].x, points[0].y)
              const circle = circleArcFromThreePoints(
                points[0],
                points[Math.floor(points.length / 2)],
                points[points.length - 1],
              )
              if (!circle) return
              const { xc, yc, r, startAngle, endAngle, counterclockwise } =
                circle
              context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
              context.stroke()
            } else if (curve.points.length >= 3) {
              context.strokeStyle = lineColor
              context.lineJoin = "round"
              context.lineWidth = 1.5 / sketcherState.zoom
              context.beginPath()
              const points = pointsOnComplexCurve(curve, 1000)
              context.moveTo(points[0].x, points[0].y)
              points.forEach(point => context.lineTo(point.x, point.y))
              context.stroke()
            }*/
          }
          break
      }
    },
    [theme, zoom],
  )

  const drawControlPoints = useCallback(
    (
      context: CanvasRenderingContext2D,
      curve: Curve,
      selectedControlPoint: number | null,
    ) => {
      const innerCircleRadius = 3.5 / zoom
      const outerCircleRadius = 6 / zoom
      const colorPalette1 = createColorPaletteRGB(curve.points.length, 0.2)
      const colorPalette2 = createColorPaletteRGB(curve.points.length, 0.4)
      const colorPalette3 = createColorPaletteRGB(curve.points.length, 0.7)
      switch (curve.type) {
        case CurveType.NonRational: {
          context.lineJoin = "round"
          context.lineWidth = 0
          curve.points.forEach((p, index) => {
            const fillStyle1 = colorPalette1[index]
            const fillStyle2 = colorPalette2[index]
            const fillStyle3 = colorPalette3[index]
            const { x, y } = p
            context.beginPath()
            context.fillStyle = fillStyle3
            context.arc(x, y, innerCircleRadius, 0, 2 * Math.PI, false)
            context.fill()
            context.arc(x, y, outerCircleRadius, 0, 2 * Math.PI, false)
            if (index === selectedControlPoint) {
              context.fillStyle = fillStyle2
            } else {
              context.fillStyle = fillStyle1
            }
            context.fill()
          })
          break
        }
      }
    },
    [zoom],
  )

  return {
    drawCurve,
    drawControlPoints,
  }
}
