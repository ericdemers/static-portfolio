import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../../app/hooks"
import {
  displacement,
  distance,
  type Coordinates,
} from "../../../sketchElements/coordinates"
import { viewportCoordsToSceneCoords } from "./viewport"
import {
  selectActiveTool,
  selectScrollX,
  selectScrollY,
  selectZoom,
  scroll,
  selectInitialView,
  activateFreeDrawFromInitialView,
  unselectCurvesAndCreationTool,
  selectControlPolygonsDisplayed,
  selectASingleCurve,
  zoomWithTwoFingers,
  zoomOut,
  zoomIn,
  selectControlPoint,
  zoomReset,
} from "../../templates/sketcher/sketcherSlice"
import {
  closeCurveMovingControlPoints,
  createCurve,
  InitialCurve,
  moveSelectedControlPoint,
  normalizeCircle,
  optimizedKnotPositions,
  pointsOnCurve,
  threeArcPointsFromNoisyPoints,
} from "../../../sketchElements/curve"
import { flushSync } from "react-dom"
import {
  addNewCurve,
  moveCurves,
  updateCurves,
  replaceCurve,
  selectCurves,
  updateThisCurve,
  deleteCurves,
  duplicateCurves,
  moveControlPoint,
  joinCurves,
  closeCurve,
} from "../../../sketchElements/sketchElementsSlice"
import {
  Closed,
  CurveType,
  type Curve,
} from "../../../sketchElements/curveTypes"
import { ActionCreators } from "redux-undo"
import { uniformKnots } from "../../../bSplineAlgorithms/knotPlacement/automaticFitting"
import { circleArcFromThreePoints } from "../../../sketchElements/circleArc"
import {
  cmult,
  conjugate,
  positiveAtan2,
  weightedAveragePhi,
} from "../../../mathVector/ComplexGrassmannSpace"

type ActionType =
  | "none"
  | "drawing"
  | "moving a control point"
  | "moving curves"

type mouseMoveThresholdType = "not exceeded" | "just exceeded" | "exceeded"

export const useEventHandlers = (canvas: HTMLCanvasElement | null) => {
  const dispatch = useAppDispatch()
  const zoom = useAppSelector(selectZoom)
  const scrollX = useAppSelector(selectScrollX)
  const scrollY = useAppSelector(selectScrollY)
  const activeTool = useAppSelector(selectActiveTool)
  const initialView = useAppSelector(selectInitialView)
  const [pressDown, setPressDown] = useState(false)
  const [initialMousePosition, setInitialMousePosition] =
    useState<Coordinates | null>(null)
  const [newestMousePosition, setNewestMousePosition] =
    useState<Coordinates | null>(null)
  const [twoFingersTouch, setTwoFingersTouch] = useState<{
    p0: Coordinates
    p1: Coordinates
    initialZoom: number
  } | null>(null)
  const [action, setAction] = useState<ActionType>("none")
  const [mouseMoveThreshold, setMouseMoveThreshold] =
    useState<mouseMoveThresholdType>("not exceeded")
  const [currentlyDrawnCurve, setCurrentlyDrawnCurve] = useState<Curve | null>(
    null,
  )
  const curves = useAppSelector(selectCurves)
  const controlPolygonsDisplayed = useAppSelector(
    selectControlPolygonsDisplayed,
  )
  const [drawnCircleArc, setDrawnCircleArc] = useState<{
    xc: number
    yc: number
    r: number
    startAngle: number
    endAngle: number
    counterclockwise: boolean
  } | null>(null)

  const clickWithoutMovingResolution = 2

  const getMouseCoordinates = useCallback(
    (event: MouseEvent): Coordinates | null => {
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const viewportCoords = {
        clientX: event.clientX - rect.left,
        clientY: event.clientY - rect.top,
      }

      return viewportCoordsToSceneCoords(viewportCoords, {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      })
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const getTouchCoordinates = useCallback(
    (event: TouchEvent): Coordinates | null => {
      if (!canvas) return null
      // const viewportCoords = {
      //   clientX: event.touches[0].clientX - canvas.offsetLeft,
      //   clientY: event.touches[0].clientY - canvas.offsetTop,
      // }
      const rect = canvas.getBoundingClientRect()
      const viewportCoords = {
        clientX: event.touches[0].clientX - rect.left,
        clientY: event.touches[0].clientY - rect.top,
      }
      return viewportCoordsToSceneCoords(viewportCoords, {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      })
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const getTwoFingersTouchCoordinates = useCallback(
    (event: TouchEvent): { p0: Coordinates; p1: Coordinates } | null => {
      if (!canvas) return null
      const viewportCoords0 = {
        clientX: event.touches[0].clientX - canvas.offsetLeft,
        clientY: event.touches[0].clientY - canvas.offsetTop,
      }
      const viewportCoords1 = {
        clientX: event.touches[1].clientX - canvas.offsetLeft,
        clientY: event.touches[1].clientY - canvas.offsetTop,
      }
      const stateInfo = {
        zoom,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX,
        scrollY,
      }
      const p0 = viewportCoordsToSceneCoords(viewportCoords0, stateInfo)
      const p1 = viewportCoordsToSceneCoords(viewportCoords1, stateInfo)
      return { p0: p0, p1: p1 }
    },
    [canvas, scrollX, scrollY, zoom],
  )

  const onLine = (
    endPoints: readonly [Coordinates, Coordinates],
    point: Coordinates,
    zoom: number,
    maxDistance = 1,
  ) => {
    // offset : semi-minor axis of the ellipse with the line endpoint as focal points
    const offset = Math.sqrt(
      Math.pow(
        (distance(endPoints[0], point) + distance(endPoints[1], point)) / 2,
        2,
      ) - Math.pow(distance(endPoints[0], endPoints[1]) / 2, 2),
    )
    return offset < maxDistance / zoom
  }

  const onCircleArc = useCallback(
    (
      threePoints: readonly Coordinates[],
      point: Coordinates,
      zoom: number,
      maxDistance = 1,
    ) => {
      const circle = circleArcFromThreePoints(
        threePoints[0],
        threePoints[1],
        threePoints[2],
      )
      if (circle) {
        const distanceFromCenter = Math.hypot(
          point.x - circle.xc,
          point.y - circle.yc,
        )
        const offset = Math.abs(distanceFromCenter - circle.r)
        const a = {
          x: Math.cos(circle.startAngle),
          y: Math.sin(circle.startAngle),
        }
        const b = { x: point.x - circle.xc, y: point.y - circle.yc }
        const c = { x: Math.cos(circle.endAngle), y: Math.sin(circle.endAngle) }
        const v1 = circle.counterclockwise
          ? cmult(conjugate(a), b)
          : cmult(conjugate(b), a)
        const v2 = circle.counterclockwise
          ? cmult(conjugate(a), c)
          : cmult(conjugate(c), a)
        const av1 = positiveAtan2(v1.y, v1.x)
        const av2 = positiveAtan2(v2.y, v2.x)
        const between = av1 > av2

        return offset < maxDistance / zoom && between
      } else {
        return onLine(
          [threePoints[0], threePoints[2]],
          point,
          zoom,
          maxDistance,
        )
      }
    },
    [],
  )

  const onCircleArcs = useCallback(
    (
      points: readonly Coordinates[],
      point: Coordinates,
      zoom: number,
      maxDistance = 1,
    ) => {
      for (let i = 0; i < points.length - 2; i += 2) {
        if (
          onCircleArc(
            [points[i], points[i + 1], points[i + 2]],
            point,
            zoom,
            maxDistance,
          )
        ) {
          return true
        }
      }
      return false
    },
    [onCircleArc],
  )

  const onCircle = useCallback(
    (
      threePoints: readonly Coordinates[],
      point: Coordinates,
      zoom: number,
      maxDistance = 1,
    ) => {
      const circle = circleArcFromThreePoints(
        threePoints[0],
        threePoints[1],
        threePoints[2],
      )
      if (circle) {
        const distanceFromCenter = Math.hypot(
          point.x - circle.xc,
          point.y - circle.yc,
        )
        const offset = Math.abs(distanceFromCenter - circle.r)

        return offset < maxDistance / zoom
      } else {
        return onLine(
          [threePoints[0], threePoints[2]],
          point,
          zoom,
          maxDistance,
        )
      }
    },
    [],
  )

  const onCurve = useCallback(
    (point: Coordinates, curve: Curve, zoom: number) => {
      if (
        curve.type === CurveType.Complex &&
        curve.knots.length - (curve.points.length + 1) / 2 - 1 === 1
      ) {
        if (curve.closed === undefined) {
          return onCircleArcs(curve.points, point, zoom, 10)
        } else {
          if (curve.points.length === 3 && curve.knots.length === 4) {
            return onCircle(curve.points, point, zoom, 10)
          }
        }
      }
      const points = pointsOnCurve(curve, 100)
      return points.slice(0, -1).some((curvePoint, index) => {
        const nextCurvePoint = points[index + 1]
        return onLine([curvePoint, nextCurvePoint], point, zoom, 10)
      })
    },
    [onCircle, onCircleArcs],
  )

  const findControlPointAtPosition = useCallback(
    (point: Coordinates, curve: Curve, maxDistance = 1) => {
      const index = curve.points.findIndex(
        p => distance(point, p) < maxDistance / zoom,
      )
      if (index === -1) return null
      return { curveID: curve.id, index: index }
    },
    [zoom],
  )

  const findSameCurveExtremity = useCallback(
    (curve: Curve, maxDistance = 1) => {
      if (curve.closed === Closed.True) return false

      if (
        distance(curve.points[0], curve.points[curve.points.length - 1]) <
        maxDistance / zoom
      ) {
        return true
      }

      return false
    },
    [zoom],
  )

  const findAnotherCurveExtremity = useCallback(
    (point: Coordinates, curve: Curve, maxDistance = 1) => {
      if (curve.closed === Closed.True) return null
      if (curve.id === controlPolygonsDisplayed?.curveIDs[0]) return null
      const index = [
        curve.points[0],
        curve.points[curve.points.length - 1],
      ].findIndex(p => distance(point, p) < maxDistance / zoom)
      if (index === -1) return null
      return { curveID: curve.id, index: index }
    },
    [controlPolygonsDisplayed?.curveIDs, zoom],
  )

  const getControlPointAtPosition = useCallback(
    (point: Coordinates, curves: Curve[], maxDistance = 1) => {
      return curves
        .map(curve => findControlPointAtPosition(point, curve, maxDistance))
        .find(value => value !== null)
    },
    [findControlPointAtPosition],
  )

  const getCurveExtremity = useCallback(
    (point: Coordinates, curves: readonly Curve[], maxDistance = 1) => {
      return curves
        .map(curve => findAnotherCurveExtremity(point, curve, maxDistance))
        .find(value => value !== null)
    },
    [findAnotherCurveExtremity],
  )

  const getCurveAtPosition = useCallback(
    (point: Coordinates, curves: readonly Curve[], zoom: number) => {
      return curves.find(curve => onCurve(point, curve, zoom))
    },
    [onCurve],
  )

  /*
  const extendCurve = useCallback(
    (point: Coordinates, curveType: InitialCurve) => {
      if (currentlyDrawnCurve !== null) {
        let curve = { ...currentlyDrawnCurve }
        const curvePoints = curve.points.map(p => {
          return { x: p.x, y: p.y }
        })
        switch (curveType) {
          case InitialCurve.Freehand: {
            //curve.points = [...curve.points, point]
            const newCurvePoints = [...curvePoints, point]
            let degree = 1
            if (newCurvePoints.length > 7) degree = 5
            //const degree = curve.points.length < 7 ? curve.points.length - 2 : 5
            curve.knots = uniformKnots(degree, newCurvePoints.length)
            break
          }
          case InitialCurve.Line: {
            curve.points = [curve.points[0], point]
            break
          }
          case InitialCurve.CircleArc: {
            curve.points = [...curve.points, point]
            break
          }
        }
        dispatch(replaceCurve({ curve }))
        setCurrentlyDrawnCurve(curve)
      }
    },
    [currentlyDrawnCurve, dispatch],
  )
    */

  const extendCurve = useCallback(
    (point: Coordinates, curveType: InitialCurve) => {
      if (currentlyDrawnCurve !== null) {
        const curvePoints = currentlyDrawnCurve.points.map(p => {
          return { x: p.x, y: p.y }
        })
        const curve = {
          ...currentlyDrawnCurve,
          points: curvePoints,
          knots: currentlyDrawnCurve.knots,
        }
        switch (curveType) {
          case InitialCurve.Freehand: {
            const degree = curvePoints.length < 5 ? curvePoints.length : 5
            const newCurvePoints = [...curvePoints, point]
            curve.knots = uniformKnots(degree, newCurvePoints.length)
            curve.points = newCurvePoints
            break
          }
          case InitialCurve.Line: {
            curve.points = [curve.points[0], point]
            break
          }
          case InitialCurve.CircleArc: {
            if (curve.closed === Closed.True) {
              return
            }
            if (curve.points.length >= 3 && curve.knots.length === 0) {
              const phi = weightedAveragePhi(curve.points)
              if (phi > Math.PI / 2 || phi < -Math.PI / 2) {
                const points = threeArcPointsFromNoisyPoints(curve.points)
                curve.points = points
                curve.knots = [0, 0, 1, 1]
                setDrawnCircleArc(
                  circleArcFromThreePoints(points[0], points[1], points[2]),
                )
              } else curve.points = [...curve.points, point]
            } else if (drawnCircleArc !== null) {
              const vector = {
                x: point.x - drawnCircleArc.xc,
                y: point.y - drawnCircleArc.yc,
              }
              const angle = Math.atan2(vector.y, vector.x)

              const delta = 0.1
              if (Math.abs(drawnCircleArc.startAngle - angle) < delta) {
                const sin30 = 1 / 2
                const cos30 = Math.sqrt(3) / 2
                curve.closed = Closed.True
                const p0 = {
                  x: drawnCircleArc.xc - cos30 * drawnCircleArc.r,
                  y: drawnCircleArc.yc + sin30 * drawnCircleArc.r,
                }
                const p1 = {
                  x: drawnCircleArc.xc,
                  y: drawnCircleArc.yc - drawnCircleArc.r,
                }
                const p2 = {
                  x: drawnCircleArc.xc + cos30 * drawnCircleArc.r,
                  y: drawnCircleArc.yc + sin30 * drawnCircleArc.r,
                }
                curve.points = [p0, p1, p2]
              } else {
                const newPoint = {
                  x: drawnCircleArc.xc + drawnCircleArc.r * Math.cos(angle),
                  y: drawnCircleArc.yc + drawnCircleArc.r * Math.sin(angle),
                }
                const distributedPoints = threeArcPointsFromNoisyPoints([
                  curve.points[0],
                  curve.points[1],
                  curve.points[2],
                ])
                setDrawnCircleArc({ ...drawnCircleArc, endAngle: angle })
                curve.points = [curve.points[0], distributedPoints[1], newPoint]
              }
            } else curve.points = [...curve.points, point]
            break
          }
        }
        dispatch(replaceCurve({ curve }))
        setCurrentlyDrawnCurve(curve)
      }
    },
    [currentlyDrawnCurve, dispatch, drawnCircleArc],
  )

  const draw = useCallback(
    (
      initialCurve: InitialCurve,
      action: ActionType,
      initialMousePosition: Coordinates,
      coordinates: Coordinates,
    ) => {
      flushSync(() => {
        switch (action) {
          case "none":
            if (mouseMoveThreshold === "exceeded") {
              setAction("drawing") // React doesn’t update state immediately, flushSync is necessary for ipad to make the state transition fast enough
              const curve = createCurve(initialCurve, initialMousePosition)
              dispatch(addNewCurve({ curve }))
              setCurrentlyDrawnCurve(curve)
            }
            break
          case "drawing":
            extendCurve(coordinates, initialCurve)
        }
      })
    },
    [dispatch, extendCurve, mouseMoveThreshold],
  )

  const handlePressDown = useCallback(
    (coordinates: Coordinates) => {
      setPressDown(true)
      setInitialMousePosition(coordinates)
      setMouseMoveThreshold("not exceeded")
      switch (activeTool) {
        case "none": {
          const curve = getCurveAtPosition(coordinates, curves, zoom)
          if (curve) {
            setAction("moving curves")
            dispatch(selectASingleCurve({ curveID: curve.id }))
          }
          break
        }
        case "singleSelection":
          {
            if (!controlPolygonsDisplayed) return
            const selectedCurves = curves.filter(curve =>
              controlPolygonsDisplayed.curveIDs.includes(curve.id),
            )
            const selectedControlPoint = getControlPointAtPosition(
              coordinates,
              selectedCurves,
              15,
            )
            if (selectedControlPoint) {
              setAction("moving a control point")
              dispatch(
                selectControlPoint({
                  curveID: selectedControlPoint.curveID,
                  controlPointIndex: selectedControlPoint.index,
                }),
              )
            } else {
              const curve = getCurveAtPosition(coordinates, curves, zoom)
              if (curve) {
                setAction("moving curves")
                dispatch(selectASingleCurve({ curveID: curve.id }))
              }
            }
          }
          break
      }
      if (initialView || (curves.length === 0 && activeTool === "none")) {
        dispatch(activateFreeDrawFromInitialView())
      }
    },
    [
      activeTool,
      controlPolygonsDisplayed,
      curves,
      dispatch,
      getControlPointAtPosition,
      getCurveAtPosition,
      initialView,
      zoom,
    ],
  )

  const handleMouseMoveTreshold = useCallback(
    (initialMousePosition: Coordinates, newCoordinates: Coordinates) => {
      if (mouseMoveThreshold === "not exceeded") {
        const d = distance(initialMousePosition, newCoordinates)
        if (d > clickWithoutMovingResolution / zoom) {
          setMouseMoveThreshold("just exceeded")
        }
      }
      if (mouseMoveThreshold === "just exceeded") {
        setMouseMoveThreshold("exceeded")
      }
    },
    [mouseMoveThreshold, zoom],
  )

  const handleMove = useCallback(
    (newCoordinates: Coordinates) => {
      //flushSync(() => {
      if (!initialMousePosition) return
      handleMouseMoveTreshold(initialMousePosition, newCoordinates)
      //if (mouseMoveThreshold !== "exceeded") return
      //if (pressDown === false) return
      //const deltaX = newCoordinates.x - initialMousePosition.x
      //const deltaY = newCoordinates.y - initialMousePosition.y
      const v = displacement(initialMousePosition, newCoordinates)
      switch (activeTool) {
        case "none":
          dispatch(scroll({ deltaX: v.x, deltaY: v.y }))
          break
        case "freeDraw":
          draw(
            InitialCurve.Freehand,
            action,
            initialMousePosition,
            newCoordinates,
          )
          break
        case "line":
          draw(InitialCurve.Line, action, initialMousePosition, newCoordinates)
          break
        case "circleArc":
          draw(
            InitialCurve.CircleArc,
            action,
            initialMousePosition,
            newCoordinates,
          )
          break
        case "singleSelection":
        case "multipleSelection":
          switch (action) {
            case "moving curves":
              if (
                controlPolygonsDisplayed &&
                mouseMoveThreshold === "exceeded"
              ) {
                dispatch(
                  moveCurves({
                    displacement: v,
                    ids: controlPolygonsDisplayed.curveIDs,
                  }),
                )
                setInitialMousePosition(newCoordinates)
              }
              break
            case "moving a control point": {
              /*
              dispatch(
                moveControlPoint({
                  displacement: v,
                  controlPolygonsDisplayed,
                }),
              )
              */
              const selectedCurves = curves.filter(curve =>
                controlPolygonsDisplayed?.curveIDs.includes(curve.id),
              )
              const curve = selectedCurves[0]
              if (
                curve &&
                controlPolygonsDisplayed &&
                controlPolygonsDisplayed.selectedControlPoint
              ) {
                const newCurve = moveSelectedControlPoint(
                  curve,
                  newCoordinates,
                  controlPolygonsDisplayed.selectedControlPoint
                    .controlPointIndex,
                  1,
                )
                if (newCurve) {
                  dispatch(replaceCurve({ curve: newCurve }))
                }
              }

              setInitialMousePosition(newCoordinates)
              break
            }
            case "none":
              dispatch(scroll({ deltaX: v.x, deltaY: v.y }))
              break
          }
          break
      }
      //})
    },
    [
      action,
      activeTool,
      controlPolygonsDisplayed,
      curves,
      dispatch,
      draw,
      handleMouseMoveTreshold,
      initialMousePosition,
      mouseMoveThreshold,
    ],
  )

  const handlePressRelease = useCallback(
    (coordinates: Coordinates) => {
      if (
        mouseMoveThreshold !== "exceeded" &&
        activeTool !== "multipleSelection" &&
        action !== "moving a control point" &&
        action !== "moving curves"
      ) {
        dispatch(unselectCurvesAndCreationTool())
      }
      switch (action) {
        case "moving curves":
        case "moving a control point":
          if (mouseMoveThreshold === "exceeded") {
            let closingACurve = false
            const curve = curves.find(
              curve => curve.id === controlPolygonsDisplayed?.curveIDs[0],
            )
            const overAnEndPoint = getCurveExtremity(coordinates, curves, 15)
            if (curve) {
              closingACurve = findSameCurveExtremity(curve, 15)
            }
            if (
              overAnEndPoint &&
              controlPolygonsDisplayed?.selectedControlPoint
            ) {
              dispatch(
                joinCurves({
                  selectedControlPoint:
                    controlPolygonsDisplayed.selectedControlPoint,
                  overAnEndPoint,
                }),
              )
            } else if (
              closingACurve &&
              controlPolygonsDisplayed?.selectedControlPoint
            ) {
              if (curve) {
                //dispatch(closeCurve({ curve }))
                const newCurve = closeCurveMovingControlPoints(curve)
                dispatch(updateThisCurve({ curve: newCurve }))
              }
            } else {
              dispatch(updateCurves({ curves: curves.slice() }))
            }
          }
          break
        case "drawing":
          switch (activeTool) {
            case "freeDraw":
              if (mouseMoveThreshold === "exceeded") {
                if (currentlyDrawnCurve) {
                  const curve = optimizedKnotPositions(
                    currentlyDrawnCurve,
                    zoom,
                    0.3,
                  )
                  dispatch(updateThisCurve({ curve }))
                }
              }
              break
            case "line": {
              if (currentlyDrawnCurve) {
                dispatch(updateThisCurve({ curve: currentlyDrawnCurve }))
              }
              break
            }
            case "circleArc":
              if (currentlyDrawnCurve) {
                const c = normalizeCircle(currentlyDrawnCurve)
                dispatch(updateThisCurve({ curve: c }))
              }
              break
          }
          break
      }
      setPressDown(false)
      setMouseMoveThreshold("not exceeded")
      setAction("none")
      setCurrentlyDrawnCurve(null)
      setInitialMousePosition(null)
      setDrawnCircleArc(null)
    },
    [
      action,
      activeTool,
      controlPolygonsDisplayed?.curveIDs,
      controlPolygonsDisplayed?.selectedControlPoint,
      currentlyDrawnCurve,
      curves,
      dispatch,
      findSameCurveExtremity,
      getCurveExtremity,
      mouseMoveThreshold,
      zoom,
    ],
  )

  const handleMouseDown = useCallback(
    (event: MouseEvent) => {
      const coordinates = getMouseCoordinates(event)
      if (!coordinates) return
      handlePressDown(coordinates)
    },
    [getMouseCoordinates, handlePressDown],
  )

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      flushSync(() => {
        const coordinates = getMouseCoordinates(event)
        if (!coordinates) return
        if (pressDown) {
          handleMove(coordinates)
        }
      })
    },
    [getMouseCoordinates, handleMove, pressDown],
  )

  const handleMouseUp = useCallback(
    (event: MouseEvent) => {
      const coordinates = getMouseCoordinates(event)
      if (!coordinates) return
      handlePressRelease(coordinates)
    },
    [getMouseCoordinates, handlePressRelease],
  )

  const handleMouseLeave = useCallback((event: MouseEvent) => {}, [])

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const coordinates = getTouchCoordinates(event)
        if (!coordinates) return
        handlePressDown(coordinates)
        event.preventDefault()
        setNewestMousePosition(coordinates) //touchend event does not give its position
      }
      if (event.touches.length === 2) {
        event.preventDefault()
        const coordinates = getTwoFingersTouchCoordinates(event)
        if (!coordinates) return
        setTwoFingersTouch({
          p0: coordinates.p0,
          p1: coordinates.p1,
          initialZoom: zoom,
        })
      }
    },
    [getTouchCoordinates, getTwoFingersTouchCoordinates, handlePressDown, zoom],
  )

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      flushSync(() => {
        if (event.touches.length === 1) {
          const coordinates = getTouchCoordinates(event)
          if (!pressDown || !coordinates) return
          handleMove(coordinates)
          setNewestMousePosition(coordinates) //touchend event does not give its position
        }
        if (event.touches.length === 2) {
          const coordinates = getTwoFingersTouchCoordinates(event)
          if (!coordinates || !twoFingersTouch) return
          const deltaX0 = coordinates.p0.x - twoFingersTouch.p0.x
          const deltaY0 = coordinates.p0.y - twoFingersTouch.p0.y
          const newDistanceX = coordinates.p1.x - coordinates.p0.x
          const newDistanceY = coordinates.p1.y - coordinates.p0.y
          const initialDistanceX = twoFingersTouch.p1.x - twoFingersTouch.p0.x
          const initialDistanceY = twoFingersTouch.p1.y - twoFingersTouch.p0.y
          const newDistance = Math.hypot(newDistanceX, newDistanceY)
          const initialDistance = Math.hypot(initialDistanceX, initialDistanceY)
          dispatch(
            zoomWithTwoFingers({
              deltaX: deltaX0,
              deltaY: deltaY0,
              newZoom: (zoom * newDistance) / initialDistance,
            }),
          )
        }
      })
    },
    [
      dispatch,
      getTouchCoordinates,
      getTwoFingersTouchCoordinates,
      handleMove,
      pressDown,
      twoFingersTouch,
      zoom,
    ],
  )

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length === 0) {
        setPressDown(false)
        if (newestMousePosition) {
          handlePressRelease(newestMousePosition)
        }
      }
      if (event.touches.length === 1) {
        setTwoFingersTouch(null)
        const coordinates = getTouchCoordinates(event)
        if (!coordinates) return
        handlePressDown(coordinates)
      }
      setNewestMousePosition(null)
    },
    [
      getTouchCoordinates,
      handlePressDown,
      handlePressRelease,
      newestMousePosition,
    ],
  )

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()
      const { deltaX, deltaY } = event
      dispatch(scroll({ deltaX: -deltaX / zoom, deltaY: -deltaY / zoom }))
    },
    [dispatch, zoom],
  )

  const handleDelete = useCallback(() => {
    if (!controlPolygonsDisplayed) return
    dispatch(deleteCurves({ curveIDs: controlPolygonsDisplayed.curveIDs }))
    dispatch(unselectCurvesAndCreationTool())
  }, [controlPolygonsDisplayed, dispatch])

  const handleDuplicate = useCallback(() => {
    if (!controlPolygonsDisplayed) return
    dispatch(
      duplicateCurves({
        curveIDs: controlPolygonsDisplayed.curveIDs,
        deltaX: 30 / zoom,
        deltaY: 30 / zoom,
      }),
    )
    dispatch(unselectCurvesAndCreationTool())
  }, [controlPolygonsDisplayed, dispatch, zoom])

  const handleZoomOut = useCallback(() => {
    dispatch(zoomOut())
  }, [dispatch])
  const handleZoomIn = useCallback(() => {
    dispatch(zoomIn())
  }, [dispatch])
  const handleZoomReset = useCallback(() => {
    dispatch(zoomReset({ curves: curves }))
  }, [curves, dispatch])

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          dispatch(unselectCurvesAndCreationTool())
          break
        case "Delete":
        case "Backspace":
          handleDelete()
          break
        case "-":
        case "_":
          handleZoomOut()
          break
        case "=":
        case "+":
          handleZoomIn()
          break
        case "0":
          handleZoomReset()
      }
      if (event.ctrlKey || (event.metaKey && event.key === "=")) {
        handleZoomIn()
        event.preventDefault()
      }
      if (event.ctrlKey || (event.metaKey && event.key === "-")) {
        handleZoomOut()
        event.preventDefault()
      }
      if (event.ctrlKey || (event.metaKey && event.key === "0")) {
        handleZoomReset()
        event.preventDefault()
      }
      if (event.ctrlKey || (event.metaKey && event.key === "d")) {
        handleDuplicate()
        event.preventDefault()
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "z" &&
        !event.shiftKey
      ) {
        dispatch(ActionCreators.undo())
        event.preventDefault()
      }
      if (event.ctrlKey && event.key === "Z") {
        dispatch(ActionCreators.redo())
        event.preventDefault()
      }
      if (event.metaKey && event.key === "z" && event.shiftKey) {
        dispatch(ActionCreators.redo())
        event.preventDefault()
      }
    },
    [
      dispatch,
      handleDelete,
      handleDuplicate,
      handleZoomIn,
      handleZoomOut,
      handleZoomReset,
    ],
  )

  useEffect(() => {
    if (!canvas) return
    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove)
    canvas.addEventListener("mouseup", handleMouseUp)
    canvas.addEventListener("touchend", handleTouchEnd)
    canvas.addEventListener("mouseleave", handleMouseLeave)
    canvas.addEventListener("wheel", handleWheel)
    window.addEventListener("keydown", handleKeyPress)
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseup", handleMouseUp)
      canvas.removeEventListener("touchend", handleTouchEnd)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
      canvas.removeEventListener("wheel", handleWheel)
      window.removeEventListener("keydown", handleKeyPress)
    }
  }, [
    canvas,
    handleKeyPress,
    handleMouseDown,
    handleMouseLeave,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
    handleWheel,
  ])
}
