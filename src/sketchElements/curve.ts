import { nanoid } from "@reduxjs/toolkit";
import type { Curve } from "./curveTypes";
import { CurveType, PythagoreanHodograph } from "./curveTypes";
import { movePoint, type Coordinates } from "./coordinates";
import { BSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/BSplineR1toR2";
import { Vector2d } from "../mathVector/Vector2d";
import { automaticFitting, removeASingleKnot } from "../bSplineAlgorithms/knotPlacement/automaticFitting";

export enum InitialCurve {
    Freehand,
    Line,
    CircleArc,
    Spiral,
}

export function createCurve(type: InitialCurve, point: Coordinates) : Curve {
    const id = nanoid()
    switch (type) {
        case InitialCurve.Freehand:
            return {id, type: CurveType.NonRational, points: [point], knots: [0, 1]}
        case InitialCurve.Line:
            return {id, type: CurveType.NonRational, points: [point, point], knots: [0, 0, 1, 1]} 
        case InitialCurve.CircleArc:
            return {id, type: CurveType.Complex, points: [point, point, point], knots: [0, 0, 1, 1]}
        case InitialCurve.Spiral:
            return {id, type: CurveType.NonRational, points: [point, point, point, point, point, point], knots: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], pythagoreanHodograph: PythagoreanHodograph.Primitive}
    }
}

export function duplicateCurve(curve: Curve, move: {x: number, y: number} = {x: 0, y: 0} ): Curve {
    const id = nanoid()
    const points = curve.points.map(p => movePoint(p, move))
    return {...curve, id, points}
}

export function pointsOnCurve(curve: Curve, numberOfPoints: number = 1000) {
    switch(curve.type) {
        case CurveType.NonRational: {
            const bspline: BSplineR1toR2 =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            return [...Array(numberOfPoints).keys()].map((u) => {
                const p = bspline.evaluate(u / (numberOfPoints - 1))
                return {x: p.x, y: p.y}
            })  
        }
        case CurveType.Rational:
            return [{x: 0, y: 0}]
          break
        case CurveType.Complex:
            return [{x: 0, y: 0}]
          break
    }
}

export function pointOnCurve(curve: Curve, u: number) {
    switch(curve.type) {
        case CurveType.NonRational : {
            const bspline: BSplineR1toR2 =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const p = bspline.evaluate(u)
            return {x: p.x, y: p.y}
        }
    }

}

export function interiorKnot(curve: Curve) {
    switch(curve.type) {
        case CurveType.NonRational: {
            const degree =  curve.knots.length - curve.points.length- 1
            const result = curve.knots.length - 2 * degree - 2
            if (result > 0) return result
        }
        break
    }

}
  
export function CoordinatesToVector2d(list: readonly Coordinates[]) {
    return list.map(point => new Vector2d(point.x, point.y))
}

export function Vector2dToCoordinates(list: Vector2d[]) {
    return list.map(point => {return {x: point.x, y: point.y}} )
}

/*
export function uniformKnots(degree: number, numberOfControlPoints: number) {
    const numberOfInteriorKnot = numberOfControlPoints - degree - 1
    if (numberOfInteriorKnot < 0) {
        throw new Error("The number of interior knot cannot be negative")
    }
    let knots: number[] = []
    for (let i = 0; i < degree + 1; i += 1) {
        knots.push(0)
    }
    const step = 1 / (numberOfInteriorKnot + 1)
    for (let i = 0; i < numberOfInteriorKnot; i += 1) {
        knots.push(step + i * step)
    }
    for (let i = 0; i < degree + 1; i += 1) {
        knots.push(1)
    }
    return knots
}
    */


//export function updateCurve(initialCurveType: InitialCurve) {}

//export function moveCurve(curves: Curve[], displacement: {x: number, y: number}) {}

export function computeDegree(curve: Curve) {
    if (curve.degree !== undefined) return curve.degree 
    switch (curve.type) {
        case CurveType.NonRational :
            return curve.knots.length - curve.points.length - 1
        case CurveType.Rational :
        case CurveType.Complex : 
            return curve.knots.length - curve.points.length + (curve.points.length - 1) / 2 - 1
    }
    
}

export function computeMultiplicityRight(knots: number[], index: number) {
    let multiplicity = 0
    let i = index + 1
    while (i < knots.length && knots[index] > knots[i])  {
        i += 1
        multiplicity += 1
    }
    return multiplicity
} 

export function computeMultiplicityLeft(knots: number[], index: number) {
    let multiplicity = 0
    let i = index - 1
    while (i > 0 && knots[index] < knots[i])  {
        i -= 1
        multiplicity += 1
    }
    return multiplicity
} 



export function optimizedKnotPositions(curve: Curve, scale = 1, resolutionFactor = 0.3) {
    const bSpline = new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
    const newBSpline = automaticFitting(bSpline, scale, resolutionFactor)
    return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
}

export function insertKnot(u: number, curve: Curve) {
    switch (curve.type) {
        case CurveType.NonRational: {
            const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const newBSpline = bspline.insertKnot(u)
            return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
        }
        
    }
}

export function removeAKnot(curve: Curve, knotIndex: number) {


    switch (curve.type) {
        case CurveType.NonRational:
        {
            const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const newBSpline = removeASingleKnot(bspline, knotIndex + bspline.degree + 1)
            return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
        }
        case CurveType.Complex:
            {
                /*
                const bspline =  new BSplineR1toC2(CoordinatesToComplex2d(curve.points), curve.knots)
                const newBSpline = removeASingleKnotFromComplexCurve(bspline, knotIndex + bspline.degree + 1)
                curvesCopy[index] = {id, type: BSplineEnumType.NonRational,  points: Complex2dToCoordinates(newBSpline.controlPoints ), knots: newBSpline.knots}
                */
            }
            break
    }

}

export function elevateDegree(curve: Curve) {

    switch (curve.type) {
        case CurveType.NonRational: {
            const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const newBSpline = bspline.elevateDegree()
            return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
        }
        break
        case CurveType.Rational: {
            /*
            const bspline =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
            const newBSpline = bspline.elevateDegree()
            curvesCopy[index] = {id, type: BSplineEnumType.Rational,  points: Vector3dToCoordinates(newBSpline.controlPoints ), knots: newBSpline.knots}
            */
        }
        break
        case CurveType.Complex: {
            /*
            const bspline =  new BSplineR1toC2(CoordinatesToComplex2d(curve.points), curve.knots)
            const newBSpline = bspline.elevateDegree()
            //console.log(newBSpline)
            curvesCopy[index] = {id, type: BSplineEnumType.Complex,  points: Complex2dToCoordinates(newBSpline.controlPoints ), knots: newBSpline.knots}
            }
            */
        }
        break
 
} }