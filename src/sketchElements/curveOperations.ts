import { PeriodicBSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/PeriodicBSplineR1toR2";
import { distance, type Coordinates } from "./coordinates";
import { CoordinatesToVector2d } from "./curve";
import { CurveType, type CurveData } from "./curveTypes";

export type Domain = {
    min: number
    max: number
}

export class CurveOperations {
    static getFirstPoint(curve: CurveData) : Coordinates {
        return curve.controlPoints[0]
    }
    static getLastPoint(curve: CurveData) : Coordinates {
        return curve.controlPoints[curve.controlPoints.length - 1]
    }

    static calculateDomain(curve: CurveData): Domain {
        // if the curve is closed (periodic)
        if (curve.close) {
            if (!curve.period) {
                throw new Error("Closed curves must have a defined period");
            }
            return {
                min: curve.knots[curve.degree - 1],
                max: curve.knots[curve.degree] + curve.period
            };
        } else {
            return {
                min: curve.knots[curve.degree],
                max: curve.knots[curve.knots.length - curve.degree - 1]
            };
        }
    }

    static normalizeDomain(curve: CurveData): CurveData {
        const domain = this.calculateDomain(curve);
        const newKnots = curve.knots.map(k => (k - domain.min) / (domain.max - domain.min));
        const period = curve.close ? 1.0 : undefined
        return { ...curve, knots: newKnots, period };
    }

    static onCurve(curve: CurveData, point: Coordinates, zoom: number, maxDistance = 1): boolean {
        const points = pointsOnCurve(curve, 100)
        return points.slice(0, -1).some((curvePoint, index) => {
          const nextCurvePoint = points[index + 1]
          return onLine([curvePoint, nextCurvePoint], point, zoom, 10)
        }) 
    }

    
}

export const onLine = (
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
  
export const onCircle = (
    center: Coordinates,
    point: Coordinates,
    zoom: number,
    maxDistance = 1,
  ) => {
    const offset = Math.hypot(point.x - center.x, point.y - center.y)
    return offset < maxDistance / zoom
  }

export function pointsOnCurve(curve: CurveData, numberOfPoints: number = 1000) {
    const bspline = toBSpline(curve)
}

export function toBSpline(curve: CurveData) {
    switch (curve.type) {
        case CurveType.NonRational:
            if (curve.close) {
                return toPeriodicBSplineR1toR2(curve)
            }
    }
}

export function toPeriodicBSplineR1toR2(curve: CurveData) {
    const controlPoints = wrapAroundControlPoints(curve)
    const knots = periodicCurveKnots(curve)
    return new PeriodicBSplineR1toR2(controlPoints, knots)
}

export function wrapAroundControlPoints(curve: CurveData) {
    const p0 = CoordinatesToVector2d(curve.controlPoints)
    const controlPoints = p0.concat(p0.slice(0, curve.degree))
    return controlPoints
}

export function periodicCurveKnots(curve: CurveData) {
    if (!curve.period) {
        throw new Error("Closed curves must have a defined period");
    }
    let additionalKnots: number[] = []
    const l = curve.knots.length
    for (let i = 0; i < 2 * curve.degree; i += 1) {
        additionalKnots.push(curve.knots[i % l] + curve.period * Math.floor(i / l + 1))
    }
    const firstKnot = curve.knots[0] - (curve.period - curve.knots[curve.knots.length - 1])
    const p = (additionalKnots[additionalKnots.length-curve.degree-1] - curve.knots[curve.degree -1]) // the first knot is not added yet
    return ([firstKnot].concat(curve.knots.concat(additionalKnots))).map(v => (v - curve.knots[curve.degree - 1]) / p  )
}