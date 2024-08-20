import { useCallback } from "react"
import { CurveType, type Curve } from "../../../sketchElements/curveTypes"
import { useAppSelector } from "../../../app/hooks"
//import { selectTheme } from "../mainMenu/mainMenuSlice"

import {
  arcPointsFrom3Points,
  InitialCurve,
  pointOnCurve,
  pointsOnCurve,
} from "../../../sketchElements/curve"
import { selectTheme, selectZoom } from "../../templates/sketcher/sketcherSlice"
import { createColorPaletteRGB } from "../../../utilities/color"
import { circleArcFromThreePoints } from "../../../sketchElements/circleArc"

export const useDrawingFunctions = () => {
  const theme = useAppSelector(selectTheme)
  const zoom = useAppSelector(selectZoom)

  const drawCurve = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      const lineColor =
        theme === "dark" ? "rgba(200, 200, 200, 1)" : "rgba(0, 0, 0, 1)"
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
          if (curve.points.length >= 3 && curve.knots.length === 0) {
            const points = arcPointsFrom3Points(curve.points)
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            context.beginPath()
            context.moveTo(points[0].x, points[0].y)
            const circle = circleArcFromThreePoints(
              points[0],
              points[Math.floor(points.length / 2)],
              points[points.length - 1],
            )
            if (!circle) return
            const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
            context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
            context.stroke()
          } else if (curve.points.length >= 3) {
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
      const colorPalette1 =
        theme === "light"
          ? createColorPaletteRGB(curve.points.length, 0.2)
          : createColorPaletteRGB(curve.points.length, 0.5)
      const colorPalette2 =
        theme === "light"
          ? createColorPaletteRGB(curve.points.length, 0.4)
          : createColorPaletteRGB(curve.points.length, 0.7)
      const colorPalette3 =
        theme === "light"
          ? createColorPaletteRGB(curve.points.length, 0.7)
          : createColorPaletteRGB(curve.points.length, 0.9)
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
        case CurveType.Rational:
        case CurveType.Complex: {
          const s1 =
            theme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
          const s2 =
            theme === "dark" ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"
          const s3 =
            theme === "dark" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"
          context.lineJoin = "round"
          context.lineWidth = 0
          curve.points.forEach((p, index) => {
            let fillStyle1: string
            let fillStyle2: string
            let fillStyle3: string

            if (index % 2 === 0) {
              fillStyle1 = colorPalette1[index / 2]
              fillStyle2 = colorPalette2[index / 2]
              fillStyle3 = colorPalette3[index / 2]
            } else {
              fillStyle1 = s1
              fillStyle2 = s2
              fillStyle3 = s3
            }
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
    [theme, zoom],
  )

  const drawControlPolygon = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      const color =
        theme === "dark" ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"

      switch (curve.type) {
        case CurveType.NonRational:
          context.lineJoin = "round"
          context.lineWidth = 0
          context.beginPath()
          context.strokeStyle = color
          context.lineWidth = 1.2 / zoom
          context.moveTo(curve.points[0].x, curve.points[0].y)
          curve.points.forEach(point => context.lineTo(point.x, point.y))
          context.stroke()
          break
        case CurveType.Complex: {
          context.lineJoin = "round"
          context.lineWidth = 0
          for (let i = 0; i < curve.points.length - 2; i += 2) {
            const points = arcPointsFrom3Points([
              curve.points[i],
              curve.points[i + 1],
              curve.points[i + 2],
            ])
            context.strokeStyle = color
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            context.beginPath()
            const circle = circleArcFromThreePoints(
              points[0],
              points[Math.floor(points.length / 2)],
              points[points.length - 1],
            )
            if (!circle) {
              context.moveTo(curve.points[i].x, curve.points[i].y)
              context.lineTo(curve.points[i + 2].x, curve.points[i + 2].y)
              context.stroke()
            } else {
              context.moveTo(curve.points[i].x, curve.points[i].y)
              const { xc, yc, r, startAngle, endAngle, counterclockwise } =
                circle
              context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
              context.stroke()
            }
          }
          break
        }
      }
    },
    [theme, zoom],
  )

  const drawPoint = useCallback(
    (
      context: CanvasRenderingContext2D,
      point: { x: number; y: number },
      size: number = 4,
    ) => {
      const radius = size / zoom
      let fillStyle =
        theme === "dark" ? "rgba(200, 200, 200, 1)" : "rgba(50, 50, 50, 1)"
      context.beginPath()
      context.fillStyle = fillStyle
      context.arc(point.x, point.y, radius, 0, 2 * Math.PI, false)
      context.fill()
    },
    [theme, zoom],
  )

  const drawPositionOnCurve = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, u: number) => {
      const point = pointOnCurve(curve, u)
      if (!point) return
      drawPoint(context, point, 4)
    },
    [drawPoint],
  )

  return {
    drawCurve,
    drawControlPoints,
    drawControlPolygon,
    drawPositionOnCurve,
  }
}
