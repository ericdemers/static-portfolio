import { useCallback } from "react"
import { useAppSelector } from "../../../app/hooks"
import {
  selectParametricPosition,
  selectSelectedKnot,
  selectTheme,
} from "../../templates/sketcher/sketcherSlice"
import {
  leftMaximumSliderPosition,
  periodicReductionFactor,
  rightMaximumSliderPosition,
} from "./KnotEditorConstants"
import {
  Closed,
  CurveType,
  type Curve,
} from "../../../sketchElements/curveTypes"
import { createColorPaletteRGB } from "../../../utilities/color"
import {
  computePeriodicComplexBasisFunction,
  computePeriodicBasisFunction,
  computePeriodicRationalBasisFunction,
} from "./basisFunctions"
import { carg, cnorm } from "../../../mathVector/ComplexGrassmannSpace"

export const useKnotEditorDrawingFunctions = (
  zoom: number,
  sliderPosition: number,
  scroll: number,
  width: number,
) => {
  const theme = useAppSelector(selectTheme)
  const selectedKnot = useAppSelector(selectSelectedKnot)
  const parametricPosition = useAppSelector(selectParametricPosition)

  const drawLines = useCallback(
    (context: CanvasRenderingContext2D, ratio: number = 1) => {
      const lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"

      context.beginPath()
      context.moveTo(0.03, 0.7 * ratio)
      context.lineTo(0.97, 0.7 * ratio)

      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.lineWidth = 3
      context.strokeStyle = lineColor
      context.stroke()
      context.restore()

      context.beginPath()
      context.moveTo(0.03, 0.85 * ratio)
      context.lineTo(0.97, 0.85 * ratio)

      //context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      let lineColorA =
        theme === "dark" ? "rgba(250, 250, 250, 0.5)" : "rgba(0, 0, 0, 0.5)"
      context.lineWidth = 3
      context.strokeStyle = lineColorA
      context.stroke()
      //context.restore()

      context.restore()
    },
    [theme],
  )

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

  function multipleCopyOfPositionOfKnotsOnSlider(
    knots: number[],
    degree: number,
    scaleX: number,
    offsetLeft: number,
  ) {
    //const ticks = knots
    let ticks: number[] = []
    for (let i = -1; i < 2; i += 1) {
      knots.forEach(value => ticks.push(value + i))
    }
    return ticks.map(u => u * scaleX + offsetLeft)
  }

  const drawPeriodicKnotSlider = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      let lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 0.8)" : "rgba(0, 0, 0, 0.8)"
      const scaleX = periodicReductionFactor * zoom
      const offsetLeft = 0.05 + periodicReductionFactor * scroll
      const offsetTop = 0.85 * ratio
      //context.save()
      context.beginPath()
      context.rect(0.03, 0, 0.94, 1)
      context.clip()

      context.strokeStyle = lineColor
      context.lineCap = "round"
      context.lineWidth = 4.5 / width
      let degree = curve.knots.length - curve.points.length - 1
      if (curve.type !== CurveType.NonRational) {
        degree = Math.round(
          curve.knots.length - (curve.points.length / 2 + 0.5) - 1,
        )
      }
      const ticksMultipleCopies = multipleCopyOfPositionOfKnotsOnSlider(
        curve.knots,
        degree,
        scaleX,
        offsetLeft,
      )

      ticksMultipleCopies.forEach(u => {
        context.beginPath()
        context.moveTo(u, +0.025 * ratio + offsetTop)
        context.lineTo(u, -0.025 * ratio + offsetTop)
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 9
        context.stroke()
        context.restore()
      })

      if (selectedKnot !== null) {
        const index = selectedKnot % curve.knots.length
        const u = [
          ticksMultipleCopies[index],
          ticksMultipleCopies[index + curve.knots.length],
          ticksMultipleCopies[index + 2 * curve.knots.length],
        ]

        context.beginPath()
        for (let i = 0; i < 3; i += 1) {
          context.moveTo(u[i], +0.025 * ratio + offsetTop)
          context.lineTo(u[i], -0.025 * ratio + offsetTop)
        }
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 11
        context.stroke()
        context.restore()
      }
      if (parametricPosition !== null) {
        context.beginPath()
        for (let i = -1; i < 2; i += 1) {
          const u = (parametricPosition + i) * scaleX + offsetLeft
          context.moveTo(u, +0.025 * ratio + offsetTop)
          context.lineTo(u, -0.025 * ratio + offsetTop)
        }
        context.save()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.lineWidth = 3
        context.stroke()
        context.restore()
      }
    },
    [parametricPosition, scroll, selectedKnot, theme, width, zoom],
  )

  const drawPeriodicBasisFunctions = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      const scaleX = periodicReductionFactor * zoom
      const scaleY = 0.5
      const offsetLeft = 0.05 + periodicReductionFactor * scroll
      const offsetTop = 0.7 * ratio

      const colorPaletteAngle = createColorPaletteRGB(360, 0.2)

      context.rect(0.03, 0, 0.94, 1)
      context.clip()

      switch (curve.type) {
        case CurveType.NonRational:
          {
            const numberOfControlPoints = curve.points.length
            const colorPalette = createColorPaletteRGB(numberOfControlPoints, 1)
            const basisFunctions = computePeriodicBasisFunction(curve)
            context.strokeStyle = colorPalette[0]
            context.lineJoin = "round"
            context.lineWidth = 1.6 / width
            for (let i = -1; i < 2; i += 1) {
              basisFunctions.forEach((b, index) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  context.strokeStyle =
                    colorPalette[index % curve.points.length]
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    -b[0].value * ratio * scaleY + offsetTop,
                  )
                  b.forEach(point =>
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      -point.value * ratio * scaleY + offsetTop,
                    ),
                  )
                  context.stroke()
                }
              })
            }
          }
          break
        case CurveType.Rational: {
          const numberOfControlPoints = curve.points.length / 2
          const colorPalette = createColorPaletteRGB(numberOfControlPoints, 1)
          const basisFunctions = computePeriodicRationalBasisFunction(curve)
          context.lineJoin = "round"
          context.lineWidth = 1.6 / width
          for (let i = -1; i < 2; i += 1) {
            basisFunctions.forEach((b, index) => {
              if (b[0] !== undefined) {
                context.beginPath()
                context.strokeStyle = colorPalette[index % curve.points.length]
                context.moveTo(
                  b[0].u * scaleX + offsetLeft,
                  -b[0].value * ratio * scaleY + offsetTop,
                )
                b.forEach(point => {
                  context.lineTo(
                    point.u * scaleX + offsetLeft,
                    -point.value * ratio * scaleY + offsetTop,
                  )
                })
                context.stroke()
              }
            })
          }

          break
        }

        case CurveType.Complex:
          {
            const numberOfControlPoints =
              curve.closed === Closed.True
                ? curve.points.length / 2
                : (curve.points.length + 1) / 2
            const colorPalette = createColorPaletteRGB(numberOfControlPoints, 1)
            const basisFunctions = computePeriodicComplexBasisFunction(
              curve,
              0.01,
            )
            //console.log(basisFunctions)
            context.lineWidth = 6 / width
            for (let i = -1; i < 2; i += 1) {
              basisFunctions.forEach((b, bIndex) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    (-Math.atan(cnorm(b[0].value)) / Math.PI) *
                      2 *
                      ratio *
                      scaleY +
                      offsetTop,
                  )

                  const grad = context.createLinearGradient(0, 0, 1, 0)
                  for (let i = 0; i < b.length; i += 1) {
                    const arg = carg(b[i].value)
                    if (arg) {
                      grad.addColorStop(
                        i / b.length,
                        colorPaletteAngle[
                          Math.round(
                            (arg * 180) / Math.PI +
                              (bIndex / basisFunctions.length) * 360,
                          ) % 360
                        ],
                      )

                      grad.addColorStop(
                        i / b.length,
                        colorPaletteAngle[
                          Math.round(
                            (arg * 180) / Math.PI +
                              ((bIndex % numberOfControlPoints) /
                                numberOfControlPoints) *
                                360 *
                                0,
                          ) % 360
                        ],
                      )
                    }
                  }
                  context.strokeStyle = grad
                  b.forEach((point, index) => {
                    if (index === 0) return
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      (-Math.atan(cnorm(point.value)) / Math.PI) *
                        2 *
                        ratio *
                        scaleY +
                        offsetTop,
                    )
                  })
                  context.stroke()
                }
              })
            }
            context.lineJoin = "round"
            context.lineWidth = 1.8 / width
            for (let i = -1; i < 2; i += 1) {
              basisFunctions.forEach((b, index) => {
                if (b[0] !== undefined) {
                  context.beginPath()
                  const numberOfControlPoints =
                    curve.closed === Closed.True
                      ? curve.points.length / 2
                      : (curve.points.length + 1) / 2
                  context.strokeStyle =
                    colorPalette[index % numberOfControlPoints]
                  context.moveTo(
                    (b[0].u + i) * scaleX + offsetLeft,
                    (-Math.atan(cnorm(b[0].value)) / Math.PI) *
                      2 *
                      ratio *
                      scaleY +
                      offsetTop,
                  )
                  b.forEach((point, index) =>
                    context.lineTo(
                      (point.u + i) * scaleX + offsetLeft,
                      (-Math.atan(cnorm(point.value)) / Math.PI) *
                        2 *
                        ratio *
                        scaleY +
                        offsetTop,
                    ),
                  )
                  context.stroke()
                }
              })
            }
          }
          break
      }
    },
    [scroll, width, zoom],
  )

  const drawPeriodicKnotTicks = useCallback(
    (context: CanvasRenderingContext2D, curve: Curve, ratio: number = 1) => {
      let lineColor =
        theme === "dark" ? "rgba(250, 250, 250, 1)" : "rgba(0, 0, 0, 1)"
      const scaleX = periodicReductionFactor * zoom
      const scaleY = 0.5
      const offsetLeft = 0.05 + periodicReductionFactor * scroll
      const offsetTop = 0.7 * ratio
      context.beginPath()
      context.rect(0.03, 0, 0.94, 1)
      context.clip()
      context.strokeStyle = lineColor
      context.lineJoin = "round"
      context.lineWidth = 1.2 / width
      const ticks = addSpaceBetweenTicks(curve.knots, 0.005 / zoom)

      for (let i = -1; i < 2; i += 1)
        ticks.forEach(u => {
          context.beginPath()
          context.moveTo(
            (u + i) * scaleX + offsetLeft,
            +0.04 * ratio * scaleY + offsetTop,
          )
          context.lineTo(
            (u + i) * scaleX + offsetLeft,
            -0.04 * ratio * scaleY + offsetTop,
          )
          context.save()
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.lineWidth = 2
          context.stroke()
          context.restore()
        })
    },
    [scroll, theme, width, zoom],
  )

  return {
    drawLines,
    drawZoomSlider,
    drawPeriodicKnotSlider,
    drawPeriodicBasisFunctions,
    drawPeriodicKnotTicks,
  }
}

export function addSpaceBetweenTicks(knots: number[], step: number = 0.01) {
  let result: number[] = []
  let multiplicity = 1
  knots.forEach((u, i) => {
    if (i === knots.length - 1) {
      result = result.concat(distribute(u, multiplicity, step))
    } else if (knots[i] === knots[i + 1]) {
      multiplicity += 1
    } else {
      result = result.concat(distribute(u, multiplicity, step))
      multiplicity = 1
    }
  })
  return result
}

function distribute(value: number, multiplicity: number, step: number = 0.01) {
  let result: number[] = []
  if (multiplicity === 1) {
    return [value]
  }
  const left = value - ((multiplicity - 1) * step) / 2
  for (let i = 0; i < multiplicity; i += 1) {
    result.push(left + i * step)
  }
  return result
}
