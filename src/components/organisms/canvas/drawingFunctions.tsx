import { useCallback } from "react"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import { useAppSelector } from "../../../app/hooks"
//import { selectTheme } from "../mainMenu/mainMenuSlice"

import { pointsOnCurve } from "../../../sketchElements/curve"
import { selectTheme, selectZoom } from "../../templates/sketcher/sketcherSlice"

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

  return {
    drawCurve,
  }
}
