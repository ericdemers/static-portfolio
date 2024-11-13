import { useCallback } from "react"
import {
  Closed,
  CurveType,
  type Curve,
} from "../../../sketchElements/curveTypes"
import { useAppSelector } from "../../../app/hooks"

import {
  threeArcPointsFromNoisyPoints,
  pointOnCurve,
  pointsOnCurve,
} from "../../../sketchElements/curve"
import { selectTheme, selectZoom } from "../../templates/sketcher/sketcherSlice"
import { createColorPaletteRGB } from "../../../utilities/color"
import { circleArcFromThreePoints } from "../../../sketchElements/circleArc"
import { Vector2d } from "../../../mathVector/Vector2d"
import { distance } from "../../../sketchElements/coordinates"

export const useDrawingFunctions = () => {
  const theme = useAppSelector(selectTheme)
  const zoom = useAppSelector(selectZoom)

  const drawComplexSplineOfDegreeOne = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      if (curve.points.length === 3 && curve.closed === Closed.True) {
        const circle = circleArcFromThreePoints(
          curve.points[0],
          curve.points[1],
          curve.points[2],
        )
        if (!circle) return
        const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
        context.beginPath()
        context.arc(xc, yc, r, 0, 2 * Math.PI, counterclockwise)
        context.stroke()
      } else {
        for (let i = 0; i < curve.points.length - 2; i += 2) {
          context.beginPath()
          const circle = circleArcFromThreePoints(
            curve.points[i],
            curve.points[i + 1],
            curve.points[i + 2],
          )

          if (!circle) {
            context.moveTo(curve.points[i].x, curve.points[i].y)
            context.lineTo(curve.points[i + 2].x, curve.points[i + 2].y)
            context.stroke()
          } else {
            context.moveTo(curve.points[i].x, curve.points[i].y)
            const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
            context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
            context.stroke()
          }
        }
      }
    },
    [],
  )

  const drawPeriodicComplexSplineOfDegreeOne = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      if (curve.points.length === 3) {
        const circle = circleArcFromThreePoints(
          curve.points[0],
          curve.points[1],
          curve.points[2],
        )
        if (!circle) return
        const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
        context.beginPath()
        context.arc(xc, yc, r, 0, 2 * Math.PI, counterclockwise)
        context.stroke()
      } else {
        const points = curve.points.concat(curve.points[0])
        for (let i = 0; i < points.length - 2; i += 2) {
          context.beginPath()
          const circle = circleArcFromThreePoints(
            points[i],
            points[i + 1],
            points[i + 2],
          )
          if (!circle) {
            context.moveTo(points[i].x, points[i].y)
            context.lineTo(points[i + 2].x, points[i + 2].y)
            context.stroke()
          } else {
            context.moveTo(points[i].x, points[i].y)
            const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
            context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
            context.stroke()
          }
        }
      }
    },
    [],
  )

  const drawCurve = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve) => {
      const lineColor =
        theme === "dark" ? "rgba(200, 200, 200, 1)" : "rgba(0, 0, 0, 1)"
      switch (curve.type) {
        case CurveType.NonRational:
          //if (curve.closed) {
          //  console.log("closed")
          //} else
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
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            context.beginPath()
            const points = pointsOnCurve(curve, 1000)
            context.moveTo(points[0].x, points[0].y)
            points.forEach((point, index) => {
              if (
                index !== 0 &&
                distance(point, points[index - 1]) > 10000 / zoom
              )
                context.moveTo(point.x, point.y)
              context.lineTo(point.x, point.y)
            })
            context.stroke()
          }
          break
        case CurveType.Complex:
          // note:  curve.knots.length === 0 means that the curve is drawn for the first time
          if (curve.points.length >= 3 && curve.knots.length === 0) {
            const points = threeArcPointsFromNoisyPoints(curve.points)
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            context.beginPath()
            context.moveTo(points[0].x, points[0].y)
            const circle = circleArcFromThreePoints(
              points[0],
              points[1],
              points[2],
            )
            if (!circle) return
            const { xc, yc, r, startAngle, endAngle, counterclockwise } = circle
            context.arc(xc, yc, r, startAngle, endAngle, counterclockwise)
            context.stroke()
          } else if (curve.points.length >= 3) {
            const degree =
              curve.knots.length - (curve.points.length + 1) / 2 - 1
            context.strokeStyle = lineColor
            context.lineJoin = "round"
            context.lineWidth = 1.5 / zoom
            if (degree === 1) {
              drawComplexSplineOfDegreeOne(context, curve)
            } else {
              context.beginPath()
              const points = pointsOnCurve(curve, 1000)
              context.moveTo(points[0].x, points[0].y)
              points.forEach(point => context.lineTo(point.x, point.y))
              context.stroke()
            }
          }
          break
      }
    },
    [drawComplexSplineOfDegreeOne, theme, zoom],
  )

  const drawControlPoints = useCallback(
    (
      context: CanvasRenderingContext2D,
      curve: Curve,
      selectedControlPoint: number | null,
    ) => {
      const innerCircleRadius = 3.5 / zoom
      const outerCircleRadius = 6 / zoom

      switch (curve.type) {
        case CurveType.NonRational: {
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
        case CurveType.Rational: {
          const numberOfControlPoints =
            curve.closed === Closed.True
              ? curve.points.length / 2
              : (curve.points.length + 1) / 2
          const colorPalette1 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.2)
              : createColorPaletteRGB(numberOfControlPoints, 0.5)
          const colorPalette2 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.4)
              : createColorPaletteRGB(numberOfControlPoints, 0.7)
          const colorPalette3 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.7)
              : createColorPaletteRGB(numberOfControlPoints, 0.9)
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
            } else {
              fillStyle1 = s1
              fillStyle2 = s2
              fillStyle3 = s3
              const { x, y } = p
              //console.log(p)
              const { x: x0, y: y0 } = curve.points[index - 1]
              const { x: x1, y: y1 } =
                index < curve.points.length - 1
                  ? curve.points[index + 1]
                  : curve.points[0]
              const vector = new Vector2d(x1 - x0, y1 - y0)
                .normalize()
                .rotate90degrees()
              const l = outerCircleRadius * 0.5
              const l2 = outerCircleRadius * 0.5

              context.beginPath()
              context.lineCap = "round"
              context.strokeStyle = fillStyle2
              context.moveTo(x + vector.x * l2, y + vector.y * l2)
              context.lineTo(x - vector.x * l2, y - vector.y * l2)
              if (index === selectedControlPoint) {
                context.lineWidth = 4.2 / zoom
              } else {
                context.lineWidth = 3.2 / zoom
              }
              context.stroke()

              context.beginPath()
              context.lineCap = "round"
              context.strokeStyle = fillStyle3
              context.moveTo(x + vector.x * l, y + vector.y * l)
              context.lineTo(x - vector.x * l, y - vector.y * l)
              if (index === selectedControlPoint) {
                context.lineWidth = 2.7 / zoom
              } else {
                context.lineWidth = 1.2 / zoom
              }
              context.stroke()
              /*
              context.beginPath()
              context.fillStyle = fillStyle1
              context.ellipse(
                x,
                y,
                1.2 * l,
                2 / zoom,
                Math.atan2(vector.y, vector.x),
                0,
                2 * Math.PI,
              )
              context.fill()
              context.beginPath()
              context.fillStyle = fillStyle3
              context.ellipse(
                x,
                y,
                1 * l,
                1 / zoom,
                Math.atan2(vector.y, vector.x),
                0,
                2 * Math.PI,
              )
              context.fill()
              */
            }
          })
          break
        }
        case CurveType.Complex: {
          let numberOfControlPoints =
            curve.closed === Closed.True
              ? curve.points.length / 2
              : (curve.points.length + 1) / 2
          if (curve.points.length === 3 && curve.closed === Closed.True) {
            numberOfControlPoints = 3
          }
          //console.log(numberOfControlPoints)
          const colorPalette1 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.2)
              : createColorPaletteRGB(numberOfControlPoints, 0.5)
          const colorPalette2 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.4)
              : createColorPaletteRGB(numberOfControlPoints, 0.7)
          const colorPalette3 =
            theme === "light"
              ? createColorPaletteRGB(numberOfControlPoints, 0.7)
              : createColorPaletteRGB(numberOfControlPoints, 0.9)
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
          if (curve.closed === Closed.True) {
            const p = curve.points[0]
            context.lineTo(p.x, p.y)
          }
          context.stroke()
          break
        case CurveType.Rational: {
          context.lineJoin = "round"
          context.lineWidth = 0
          context.beginPath()
          context.strokeStyle = color
          context.lineWidth = 1.2 / zoom
          context.moveTo(curve.points[0].x, curve.points[0].y)
          const points = curve.points.filter((_, i) => i % 2 === 0)
          points.forEach(point => context.lineTo(point.x, point.y))
          if (curve.closed === Closed.True) {
            const p = curve.points[0]
            context.lineTo(p.x, p.y)
          }
          context.stroke()
          break
        }
        case CurveType.Complex: {
          context.strokeStyle = color
          context.lineJoin = "round"
          context.lineWidth = 1.5 / zoom
          if (curve.closed === Closed.True) {
            drawPeriodicComplexSplineOfDegreeOne(context, curve)
          } else {
            drawComplexSplineOfDegreeOne(context, curve)
          }
          break
        }
      }
    },
    [
      drawComplexSplineOfDegreeOne,
      drawPeriodicComplexSplineOfDegreeOne,
      theme,
      zoom,
    ],
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
