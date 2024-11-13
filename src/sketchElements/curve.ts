import { nanoid } from "@reduxjs/toolkit";
import type { Curve } from "./curveTypes";
import { Closed, CurveType, PythagoreanHodograph } from "./curveTypes";
import { distance, middlePoint, movePoint, type Coordinates } from "./coordinates";
import { BSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/BSplineR1toR2";
import { Vector2d } from "../mathVector/Vector2d";
import { automaticFitting, removeASingleKnot } from "../bSplineAlgorithms/knotPlacement/automaticFitting";
import { averagePhi, cadd, cdiv, cmult, csub, weightedAveragePhi } from "../mathVector/ComplexGrassmannSpace";
import { arcPoints, arrayRange, complexMassPointsFromCircleArc, q0FromPhi } from "./circleArc";
import { BSplineR1toC2 } from "../bSplineAlgorithms/R1toC2/BSplineR1toC2";
import { Complex2d } from "../mathVector/Complex2d";
import { RationalBSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/RationalBSplineR1toR2";
import { Vector3d } from "../mathVector/Vector3d";
import { PeriodicBSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/PeriodicBSplineR1toR2";
import { PeriodicRationalBSplineR1toC1 } from "../bSplineAlgorithms/R1toC1/PeriodicRationalBSplineR1toC1";
import { Complex } from "../bSplineAlgorithms/R1toR1/FFT";
import { PeriodicRationalBSplineR1toR2 } from "../bSplineAlgorithms/R1toR2/PeriodicRationalBSplineR1toR2";
import { RationalBSplineR1toC1 } from "../bSplineAlgorithms/R1toC1/RationalBSplineR1toC1";

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
            return {id, type: CurveType.Complex, points: [point, point, point], knots: []}
        case InitialCurve.Spiral:
            return {id, type: CurveType.NonRational, points: [point, point, point, point, point, point], knots: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], pythagoreanHodograph: PythagoreanHodograph.Primitive}
    }
}

export function duplicateCurve(curve: Curve, move: {x: number, y: number} = {x: 0, y: 0} ): Curve {
    const id = nanoid()
    const points = curve.points.map(p => movePoint(p, move))
    return {...curve, id, points}
}

export function curveToPeriodicBSpline(curve: Curve) {
    const p0 = CoordinatesToVector2d(curve.points)
    if (curve.degree === undefined || curve.period === undefined) return
    const period = curve.period
    const degree = curve.degree
    const controlPoints = p0.concat(p0.slice(0, curve.degree))
    let additionalKnots: number[] = []
    const l = curve.knots.length
    for (let i = 0; i < 2 * curve.degree; i += 1) {
        additionalKnots.push(curve.knots[i % l] + period * Math.floor(i / l + 1))
    }
    const firstKnot = curve.knots[0] - (curve.period - curve.knots[curve.knots.length - 1])
    const p = (additionalKnots[additionalKnots.length-degree-1] - curve.knots[degree -1]) // the first knot is not added yet
    const knots = ([firstKnot].concat(curve.knots.concat(additionalKnots))).map(v => (v - curve.knots[degree - 1]) / p  )
    return new PeriodicBSplineR1toR2(controlPoints, knots)
}

export function PeriodicBSplineToCurve(spline: PeriodicBSplineR1toR2) : Curve {
    const id = nanoid()
    const degree = spline.degree
    const numberOfControlPoints = spline.periodicControlPointsLength
    const points = Vector2dToCoordinates(spline.controlPoints).slice(0, numberOfControlPoints)
    const knots = spline.knots.slice(1, -(degree + 1))
    return {id, type: CurveType.NonRational, points, knots, closed: Closed.True, degree, period: 1}
}

export function curveToPeriodicRationalBSpline(curve: Curve) {
    //if (curve.degree === undefined || curve.period === undefined) return
    if (curve.degree === undefined || curve.period === undefined) throw new Error("curveToPeriodicRationalBSpline: curve.degree or curve.period is undefined")
    const newPoints = curve.points.concat(curve.points.slice(0, curve.degree * 2  - 1))
    //console.log(newPoints)
    const controlPoints = CoordinatesToVector3d(newPoints)
    //console.log(controlPoints)
    const period = curve.period
    const degree = curve.degree
    
    let additionalKnots: number[] = []
    const l = curve.knots.length
    for (let i = 0; i < 2 * curve.degree; i += 1) {
        additionalKnots.push(curve.knots[i % l] + period * Math.floor(i / l + 1))
    }
    const firstKnot = curve.knots[0] - (curve.period - curve.knots[curve.knots.length - 1])
    const p = (additionalKnots[additionalKnots.length-degree-1] - curve.knots[degree -1]) // the first knot is not added yet
    const knots = ([firstKnot].concat(curve.knots.concat(additionalKnots))).map(v => (v - curve.knots[degree - 1]) / p  )
    return new PeriodicRationalBSplineR1toR2(controlPoints, knots)}

export function PeriodicRationalBSplineToCurve(spline: PeriodicRationalBSplineR1toR2) : Curve {
    const id = nanoid()
    const degree = spline.degree
    const numberOfControlPoints = spline.periodicControlPointsLength
    const points = Vector3dToCoordinates(spline.controlPoints).slice(0, numberOfControlPoints * 2)
    const knots = spline.knots.slice(1, -(degree + 1))
    return {id, type: CurveType.Rational, points, knots, closed: Closed.True, degree, period: 1}
}


export function curveToComplexPeriodicBSpline(curve: Curve) {
    /*
    const points = curve.points.concat(curve.points[0])
    const p0 = CoordinatesToComplex2d(points)
    if (curve.degree === undefined || curve.period === undefined) return
    const period = curve.period
    const degree = curve.degree
    //const additionalControlPoints = p0.slice(1, curve.degree).map(u => u.add(new Complex2d( {x: 0, y: 0}, p0[p0.length - 1].c1 )))
    const additionalControlPoints = p0.slice(1, curve.degree).map(u => u.add(new Complex2d( {x: 0, y: 0}, {x: 0, y: 0} )))
    const controlPoints = p0.concat(additionalControlPoints)
    let additionalKnots: number[] = []
    const l = curve.knots.length
    for (let i = 0; i < 2 * curve.degree; i += 1) {
        additionalKnots.push(curve.knots[i % l] + period * Math.floor(i / l + 1))
    }
    const firstKnot = curve.knots[0] - (curve.period - curve.knots[curve.knots.length - 1])
    const p = (additionalKnots[additionalKnots.length-degree-1] - curve.knots[degree -1]) // the first knot is not added yet
    const knots = ([firstKnot].concat(curve.knots.concat(additionalKnots))).map(v => (v - curve.knots[degree - 1]) / p  )
    //console.log(controlPoints)
    //console.log(knots)
    */
    if (curve.degree === undefined || curve.period === undefined) return
    const period = curve.period
    const degree = curve.degree
    //const additionalControlPoints = p0.slice(1, curve.degree).map(u => u.add(new Complex2d( {x: 0, y: 0}, p0[p0.length - 1].c1 )))
    const newPoints = curve.points.concat(curve.points.slice(0, curve.degree * 2  - 1))
    const controlPoints = CoordinatesToComplex2d(newPoints)
    let additionalKnots: number[] = []
    const l = curve.knots.length
    for (let i = 0; i < 2 * curve.degree; i += 1) {
        additionalKnots.push(curve.knots[i % l] + period * Math.floor(i / l + 1))
    }
    const firstKnot = curve.knots[0] - (curve.period - curve.knots[curve.knots.length - 1])
    const p = (additionalKnots[additionalKnots.length-degree-1] - curve.knots[degree -1]) // the first knot is not added yet
    const knots = ([firstKnot].concat(curve.knots.concat(additionalKnots))).map(v => (v - curve.knots[degree - 1]) / p  )

    return new PeriodicRationalBSplineR1toC1(controlPoints, knots)
}

export function PeriodicComplexBSplineToCurve(spline: PeriodicRationalBSplineR1toC1) : Curve {
    const id = nanoid()
    const degree = spline.degree
    const numberOfControlPoints = spline.periodicControlPointsLength
    const points = Complex2dToCoordinates(spline.controlPoints).slice(0, numberOfControlPoints * 2)
    const knots = spline.knots.slice(1, -(degree + 1))
    return {id, type: CurveType.Complex, points, knots, closed: Closed.True, degree, period: 1}
}

export function pointsOnCurve(curve: Curve, numberOfPoints: number = 1000) {
    switch(curve.type) {
        case CurveType.NonRational: {
            if (curve.closed === Closed.True) {
                const bspline = curveToPeriodicBSpline(curve)
                if (bspline === undefined) return [{x: 0, y: 0}]
                //console.log(bspline)
                return [...Array(numberOfPoints).keys(), 0].map((u) => {
                    const p = bspline.evaluate(u / (numberOfPoints - 1))
                    return {x: p.x, y: p.y}
                })  
            } else {
                const bspline: BSplineR1toR2 =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
                return [...Array(numberOfPoints).keys()].map((u) => {
                    const p = bspline.evaluate(u / (numberOfPoints - 1))
                    return {x: p.x, y: p.y}
                })  
            }
        }
        case CurveType.Rational:
            if (curve.closed === Closed.True) {
                //console.log(curve)
                const bspline = curveToPeriodicRationalBSpline(curve)
                if (bspline === undefined) return [{x: 0, y: 0}]
                //console.log(bspline)
                return [...Array(numberOfPoints).keys(), 0].map((u) => {
                    const p = bspline.evaluate(u / (numberOfPoints - 1))
                    return {x: p.x, y: p.y}
                })  
            } else {
                const bspline: RationalBSplineR1toR2 =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
                return [...Array(numberOfPoints).keys()].map((u) => {
                    const p = bspline.evaluate(u / (numberOfPoints - 1))
                    return {x: p.x, y: p.y}
                })  
            }
            
        case CurveType.Complex:
            if (curve.closed === Closed.True) {
                const bspline = curveToComplexPeriodicBSpline(curve)
                if (bspline === undefined) return [{x: 0, y: 0}]
                return [...Array(numberOfPoints).keys()].map((u) => {
                    const p = bspline.evaluate(u / (numberOfPoints - 1))
                    return {x: p.x, y: p.y}
                })
            }
             else {
            return [...Array(numberOfPoints).keys()].map((u) => {
                const bspline = new BSplineR1toC2(CoordinatesToComplex2d(curve.points), curve.knots)
                const p = bspline.evaluate(u / (numberOfPoints - 1)).toComplexNumber()
                return {x: p.x, y: p.y}
            })
               
        } 
            
    }
}

export function mod(n: number, m: number) {
    return ((n % m) + m) % m
}

export function pointOnCurve(curve: Curve, u: number) {
    switch(curve.type) {
        case CurveType.NonRational : {
            if (curve.closed === Closed.True) {
                const bspline = curveToPeriodicBSpline(curve)
                if (bspline === undefined || curve.degree === undefined) return
                const p = bspline.evaluate(mod(u - curve.knots[curve.degree - 1], 1))
                return {x: p.x, y: p.y}
            } else {
            const bspline: BSplineR1toR2 =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const p = bspline.evaluate(u)
            return {x: p.x, y: p.y}
            }
        }
        case CurveType.Complex :
            break
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


export function CoordinatesToVector3d(list: Coordinates[]) {
    //console.log(list)
    const cps = CoordinatesToComplex2d(list)
    //console.log(cps)
    const result = cps.map(p => new Vector3d(p.c0.x, p.c0.y, p.c1.x))
    return result

}



export function Vector2dToCoordinates(list: Vector2d[]) {
    return list.map(point => {return {x: point.x, y: point.y}} )
}


function Vector3dToCoordinates(list: Vector3d[]) {
    const ps: Coordinates[] = list.map(point => {return {x : point.x / point.z, y : point.y / point.z}})
    let q: Coordinates[] = []
    for (let i = 1; i < list.length; i += 1) {
        const div = (list[i-1].z + list[i].z)
        const x = (list[i-1].x + list[i].x) / div
        const y = (list[i-1].y + list[i].y) / div
        q.push({x, y})
    }
    let result: Coordinates[] = [ps[0]]
    for (let i = 0; i < q.length; i += 1) {
        result.push(q[i])
        result.push(ps[i + 1])
    }
    return result

}


export function CoordinatesToComplex2d(list: Coordinates[]) {
    let z: Coordinates[] = []
    let q: Coordinates[] = []
    for(let i = 0; i < list.length; i += 1) {
        if (i % 2 === 0) {
            z.push(list[i])
        } else {
            q.push(list[i])
        }
    }

    let cps: Complex2d[] = [new Complex2d(z[0], {x: 1, y: 0})]
    for (let i = 1; i < z.length; i += 1) {
        const w = cmult(cps[i - 1].c1, cdiv( csub(q[i - 1], z[i - 1]), csub(z[i], q[i - 1]) ) )
        cps.push(new Complex2d(cmult(z[i], w), w))
    }
    return cps
}

export function Complex2dToCoordinates(list: Complex2d[]) {
    const z = list.map(point => cdiv(point.c0, point.c1))
    let q: Coordinates[] = []
    for (let i = 1; i < z.length; i += 1) {
        q.push(cdiv (cadd(list[i - 1].c0, list[i].c0), cadd(list[i - 1].c1, list[i].c1)) )
    }
    let result: Coordinates[] = [z[0]]
    for (let i = 0; i < q.length; i += 1) {
        result.push(q[i])
        result.push(z[i + 1])
    }
    return result
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
    while (i >= 0 && knots[index] < knots[i])  {
        i -= 1
        multiplicity += 1
    }
    return multiplicity
} 

export function computePeriodicMultiplicityRight(knots: number[], index: number) {
    let multiplicity = 0
    let i = 0
    while (i < knots.length && knots[index] > knots[i] + 1)  {
        i += 1
        multiplicity += 1
    }
    return multiplicity
} 

export function computePeriodicMultiplicityLeft(knots: number[], index: number) {
    let multiplicity = 0
    let i = knots.length - 1
    while (i > 0 && knots[index] < knots[i] - 1)  {
        i -= 1
        multiplicity += 1
    }
    return multiplicity
} 

export function computeCyclicNewPosition 
    (knotPosition: number, newPosition: number) {
      const distanceFromKnot = newPosition - knotPosition
      let modulo = mod(distanceFromKnot, 1)
      if (modulo > 0.5) modulo -= 1
      return modulo + knotPosition
    }




export function optimizedKnotPositions(curve: Curve, scale = 1, resolutionFactor = 0.3) {
    const bSpline = new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
    let newBSpline = automaticFitting(bSpline, scale, resolutionFactor)
    if (newBSpline === undefined) {
        newBSpline = bSpline
    }
    return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
}
    

export function insertKnot(u: number, curve: Curve) {
    switch (curve.type) {
        case CurveType.NonRational: {
            const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const newBSpline = bspline.insertKnot(u)
            return ({...curve, points: Vector2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
        }
        case CurveType.Rational: {
            const bspline =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
            const newBSpline = bspline.insertKnot(u)
            return ({...curve, points: Vector3dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})

        }
        case CurveType.Complex: {
            const bspline =  new BSplineR1toC2(CoordinatesToComplex2d(curve.points), curve.knots)
            const newBSpline = bspline.insertKnot(u)
            return ({...curve, points: Complex2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})
        }
        
    }
}

export function removeAKnot(curve: Curve, knotIndex: number) {


    switch (curve.type) {
        case CurveType.NonRational:
        {
            const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
            const newBSpline = (curve.closed) ? removeASingleKnot(bspline, knotIndex) : removeASingleKnot(bspline, knotIndex + bspline.degree + 1)
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
        case CurveType.Rational: {
            const bspline =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
            const newBSpline = bspline.elevateDegree()
            return ({...curve, points: Vector3dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})   

        }
        case CurveType.Complex: {  
            const bspline =  new BSplineR1toC2(CoordinatesToComplex2d(curve.points), curve.knots)
            const newBSpline = bspline.elevateDegree()
            return ({...curve, points: Complex2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots})   
        }
} }

export function arcPointsFrom3Points(points: Coordinates[]) {
    const phi = averagePhi(points)
    const z0 = points[0]
    const z1 = points[points.length - 1]
    const q0 = q0FromPhi(phi, z0, z1)
    const cm = complexMassPointsFromCircleArc({z0: z0, z1: z1, q0: q0})
    const us = arrayRange(0, 1, 0.01)
    return arcPoints(cm.p0, cm.p1, us)
}

export function threeArcPointsFromNoisyPoints(points: Coordinates[]) {
    const phi = weightedAveragePhi(points)
    const z0 = points[0]
    const z1 = points[points.length - 1]
    const q0 = q0FromPhi(phi, z0, z1)
    const cm = complexMassPointsFromCircleArc({z0: z0, z1: z1, q0: q0})
    const us = arrayRange(0, 1, 0.5)
    return arcPoints(cm.p0, cm.p1, us)
}

export function normalizeCircle(c: Curve): Curve { 
    
    let curveCopy = structuredClone(c)
    if (c.points.length === 1) {
        curveCopy.points = [c.points[0], c.points[0], c.points[0]]
    } else if (c.points.length === 2) {
        curveCopy.points = [c.points[0], middlePoint(c.points[0], c.points[1]), c.points[1]]
    } else if (c.points.length > 3) {
        const z0 = c.points[0]
        const z1 = c.points[c.points.length - 1]
        //const phi = averagePhi(c.points)
        const phi = weightedAveragePhi(c.points)
        const q0 = q0FromPhi(phi, z0, z1)
        curveCopy.points = [z0, q0, z1]
        curveCopy.knots = [0, 0, 1, 1]
    }
    return curveCopy
}

export function reverseCurveDirection(curve: Curve): Curve {
    let curve1 = JSON.parse(JSON.stringify(curve))
    const points = curve1.points.reverse()
    const knots = curve1.knots.reverse().map((v: number) => -v + 1)
    return {...curve1, points: points, knots: knots}
}

export function joinTwoCurves(firstCurve: Curve, secondCurve: Curve): Curve {
    let curve1 = JSON.parse(JSON.stringify(firstCurve))
    let curve2 = JSON.parse(JSON.stringify(secondCurve))
    
    const degree1 = computeDegree(firstCurve)
    const degree2 = computeDegree(secondCurve)
    const d = Math.max(degree1, degree2)

    for (let i = 0; i < degree2 - degree1; i += 1) {
        curve1 = elevateDegree(curve1)
    }
    for (let i = 0; i < degree1 - degree2; i += 1) {
        curve2 = elevateDegree(curve2)
    }

    const points = [...curve1.points, ...curve2.points.slice(1)]
    const factor1 = curve1.knots.length - 2 * d - 1
    const factor2 = curve2.knots.length - 2 * d - 1
    let knots = [...curve1.knots.slice(0, -1).map((v:number)=>v*factor1), ...curve2.knots.slice(d + 1).map((v: number) => v*factor2+factor1)]
    knots = knots.map(v => v/(factor1 + factor2))
    return ({...curve1, points, knots})
}

export function toNonRationalBSpline(curve: Curve) {
    const keepEvenIndex = (points: Coordinates[]) => {
        let newPoints: Coordinates[] = []
        for (let i = 0; i < points.length; i += 2) {
            newPoints.push({x: points[i].x, y: points[i].y})
        }
        return newPoints
    }
    switch (curve.type) {
        case CurveType.Rational: {
            return {...curve, type: CurveType.NonRational, points: keepEvenIndex(curve.points)}
        }
        case CurveType.Complex: {
            const bspline =  new RationalBSplineR1toC1(CoordinatesToComplex2d(curve.points), curve.knots)
            const newBSpline = bspline.toRationalBSplineR1toR2()
            //return {...curve, type: CurveType.Rational, points: Vector3dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots}
            return {...curve, type: CurveType.NonRational, points: keepEvenIndex(Vector3dToCoordinates(newBSpline.controlPoints)), knots: newBSpline.knots}
        }
    }
}

export function toRationalBSpline(curve: Curve) {
    switch (curve.type) {
        case CurveType.NonRational: {
            if (curve.closed === Closed.True) {
                //const bspline =  new PeriodicBSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
                const bspline = curveToPeriodicBSpline(curve)
                if (!bspline) return
                const newBSpline = bspline.toPeriodicRationalBSplineR1toR2()
                const newCurve = PeriodicRationalBSplineToCurve(newBSpline)
                return {...curve, type: CurveType.Rational, points: newCurve.points}
            }
            else {
                const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
                const newBSpline = bspline.toRationalBSplineR1toR2()
                return {...curve, type: CurveType.Rational, points: Vector3dToCoordinates(newBSpline.controlPoints)}
            }

        }
        case CurveType.Complex: {
            if (curve.closed === Closed.True) {
                /*
                const bspline =  curveToComplexPeriodicBSpline(curve)
                console.log(bspline)
                if(!bspline) return
                const newBSpline = bspline.toPeriodicRationalBSplineR1toR2()
                console.log(newBSpline)
                const newCurve = PeriodicRationalBSplineToCurve(newBSpline)
                console.log(newCurve)
                return {...curve, type: CurveType.Rational, points: newCurve.points}
                */
            }
            else {
                const bspline =  new RationalBSplineR1toC1(CoordinatesToComplex2d(curve.points), curve.knots)
                const newBSpline = bspline.toRationalBSplineR1toR2()
                return {...curve, type: CurveType.Rational, points: Vector3dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots}
            }
        }
    }
}

export function toComplexBSpline(curve: Curve) {
    switch (curve.type) {
        case CurveType.NonRational: {
            if (curve.closed === Closed.True) {
                const bspline = curveToPeriodicBSpline(curve)
                if (!bspline) return
                const newBSpline = bspline.toPeriodicRationalBSplineR1toR2()
                const newCurve = PeriodicRationalBSplineToCurve(newBSpline)
                return {...curve, type: CurveType.Complex, points: newCurve.points}
            }
            else {
                const bspline =  new BSplineR1toR2(CoordinatesToVector2d(curve.points), curve.knots)
                const newBSpline0 = bspline.toRationalBSplineR1toR2()
                const newBSpline = newBSpline0.toRationalBSplineR1toC1()
                return {...curve, type: CurveType.Complex, points: Complex2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots}
            }
        }
        case CurveType.Rational: {
            if (curve.closed === Closed.True) {
                /*
                const bspline =  curveToPeriodicRationalBSpline(curve)
                const newBSpline = bspline.toPeriodicRationalBSplineR1toC1()
                const newCurve = PeriodicComplexBSplineToCurve(newBSpline)
                return {...curve, type: CurveType.Complex, points: newCurve.points}
                */
                return {...curve, type: CurveType.Complex}
            }
            else {
                const bspline =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
                const newBSpline = bspline.toRationalBSplineR1toC1()
                return {...curve, type: CurveType.Complex, points: Complex2dToCoordinates(newBSpline.controlPoints), knots: newBSpline.knots}
            }
        }
    }
}

/**
 * Linear interpolation between two Coordinates
 */
function linearInterpolation(p0: Coordinates, p1: Coordinates, u: number) {
    return {
        x: (1 - u) * p0.x + u * p1.x,
        y: (1 - u) * p0.y + u * p1.y,
    }
}

/**
 * Move a control point of a rational B-spline curve 
 * This function adjusts the position of a specified control point and its adjacent Farin's (weight) points
 * so that the weight themselves doesn't change
 * 
 * @param curve - The original curve object containing points and other properties.
 * @param index - The index of the control point to be moved.
 * @param newPosition - The new coordinates for the selected control point.
 * @returns A new curve object with updated control points.
 */
function moveControlPointOfPeriodicRationalCurve(curve: Curve, index: number, newPosition: Coordinates): Curve {
    const points = structuredClone(curve.points);
    const n = points.length;

    /**
     * Retrieves the adjacent points for a given index in the periodic curve.
     * @param idx - The index of the current point.
     * @returns An object containing the adjacent control points and Farin's points (weights).
     */
    const getAdjacentPoints = (idx: number) => {
        const mod = (x: number) => ((x % n) + n) % n;
        return {
            rightPoint: points[mod(idx - 2)],
            rightWeight: points[mod(idx - 1)],
            currentPoint: points[idx],
            leftWeight: points[mod(idx + 1)],
            leftPoint: points[mod(idx + 2)]
        };
    };

    const { rightPoint, rightWeight, currentPoint, leftWeight, leftPoint } = getAdjacentPoints(index);

    /**
     * Calculates the new positions of the Farin's points based on the moved control point.
     * @param current - The current position of the control point being moved.
     * @param left - The left adjacent control point.
     * @param right - The right adjacent control point.
     * @param newPos - The new position for the control point being moved.
     * @returns An object containing the new positions for the left and right Farin's (weight) points.
     */
    const calculateFarinPoints = (current: Coordinates, left: Coordinates, right: Coordinates, newPos: Coordinates) => {
        const u1 = distance(current, leftWeight) / distance(current, left);
        const u2 = distance(right, rightWeight) / distance(current, right);
        return {
            leftInterpolation: linearInterpolation(left, newPos, 1 - u1),
            rightInterpolation: linearInterpolation(newPos, right, 1 - u2)
        };
    };

    const { leftInterpolation, rightInterpolation } = calculateFarinPoints(currentPoint, leftPoint, rightPoint, newPosition);

    // Update the points array with new positions
    points[index] = newPosition;
    points[(index + 1) % n] = leftInterpolation;
    points[(index - 1 + n) % n] = rightInterpolation;

    // Return a new curve object with updated points
    return { ...curve, points };
}


export function moveSelectedControlPoint(curve: Curve, point: Coordinates, index: number, zoom: number) {
    let  newCurve = {...curve}
    const factor = 5
    //if (!curve) return
    switch (newCurve.type) {
        case CurveType.NonRational : {
            const newPoints = newCurve.points.map(p => {return {x: p.x, y: p.y}})
            newPoints[index] = point
            newCurve.points = newPoints
            break
        }
        case CurveType.Rational :
            if (index % 2 === 0) {
                const cpIndex = index / 2 
                if (curve.closed === Closed.True) {
                    /*
                    //let s =  new PeriodicRationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
                    const s =  curveToPeriodicRationalBSpline(curve)
                    //console.log(s)
                    //if (s === undefined) return
                    const w = s.getControlPointWeight(cpIndex)
                    //console.log(cpIndex)
                    //console.log(w)
                    const s1 = s.setControlPointPosition(cpIndex, new Vector3d (point.x * w , point.y * w, w))
                    //console.log(s)
                    newCurve.points = Vector3dToCoordinates(s1.controlPoints).slice(0, curve.points.length)
                    //console.log(newCurve.points)
                    */
                    newCurve = moveControlPointOfPeriodicRationalCurve(curve, index, point)
                } else {
                    let s =  new RationalBSplineR1toR2(CoordinatesToVector3d(curve.points), curve.knots)
                    const w = s.getControlPointWeight(cpIndex)
                    s = s.setControlPointPosition(cpIndex, new Vector3d (point.x * w , point.y * w, w))
                    newCurve.points = Vector3dToCoordinates(s.controlPoints)
                }
            } else {
                //https://stackoverflow.com/questions/64330618/finding-the-projection-of-a-point-onto-a-line
                const p1 = newCurve.points[index - 1]
                //const p2 = (index + 1 < newCurve.points.length - 1) ? newCurve.points[index + 1] : newCurve.points[0]
                const p2 = (index + 1 === newCurve.points.length) ? newCurve.points[0]: newCurve.points[index + 1]
                //const p2 =  newCurve.points[index + 1] 
                const abx = p2.x - p1.x
                const aby = p2.y - p1.y
                const acx = point.x - p1.x
                const acy = point.y - p1.y
                const lengthSquare = (abx * abx + aby * aby)
                const length = Math.sqrt(lengthSquare)
                let coeff = (abx * acx + aby * acy) / lengthSquare
                const epsilon = 7 / length / zoom
                //if (coeff > 1 - epsilon  ) coeff = 1 - epsilon
                //if (coeff < epsilon) coeff = epsilon
                if (Math.abs(coeff) < epsilon ) coeff = epsilon
                if (Math.abs(coeff - 1) < epsilon) coeff = 1 - epsilon

                const x = p1.x + abx * coeff
                const y = p1.y + aby * coeff

                const newPoints = newCurve.points.map(p => {return {x: p.x, y: p.y}})
                newPoints[index] = {x, y}
                newCurve.points = newPoints
                //console.log(newCurve.points)

                //newCurve.points[index] = {x, y}
            }
            break
        case CurveType.Complex :
            // if (index%2 === 0) {
            //     const cpIndex = index / 2 
            //     let s =  new RationalBSplineR1toC1(CoordinatesToComplex2d(curve.points), curve.knots)
            //     const w = s.getControlPointWeight(cpIndex)
            //     s = s.setControlPointPosition(cpIndex, new Complex2d (cmult(point, w), w))
            //     curve.points = Complex2dToCoordinates(s.controlPoints)
            // } else {
            //     curve.points[index] = point
            // } 
            {
                // Make sure the distance between two consecutive control points is bigger than epsilon
                
                let tooClose = false
                if (curve.closed === Closed.True) {
                    if (index === 0) {
                        if (distance(point, newCurve.points[newCurve.points.length - 2]) < factor / zoom) tooClose = true
                    }
                    else if (distance(point, newCurve.points[index - 1]) < factor / zoom) tooClose = true
                    }
                else {
                    if (index !==0) {
                        if (distance(point, newCurve.points[index - 1]) < factor / zoom) tooClose = true
                    }
                    if (index !== newCurve.points.length - 1) {
                        if (distance(point, newCurve.points[index + 1]) < factor / zoom) tooClose = true
                    }
                }


                const newPoints = newCurve.points.map(p => {return {x: p.x, y: p.y}})
                if (!tooClose) newPoints[index] = point
                newCurve.points = newPoints
                break
            }
    }
    return newCurve

}

export function closeCurveMovingControlPoints(curve: Curve) {
    switch(curve.type) {
        case CurveType.NonRational :
        case CurveType.Complex :
            {
                const degree = computeDegree(curve)
                const firstPoint = curve.points[0]
                const lastPoint = curve.points[curve.points.length - 1]
                const firstLastPoint = {x: (firstPoint.x + lastPoint.x) / 2, y: (firstPoint.y + lastPoint.y) / 2}
                const points = [firstLastPoint].concat(curve.points.slice(1, -1))
                const newCurve = {...curve, closed: Closed.True, degree: degree, points: points, knots: curve.knots.slice(1, -(degree + 1)), period: 1}
                return newCurve
            }
        case CurveType.Rational :
            {
                const degree = computeDegree(curve)
                const firstPoint = curve.points[0]
                const lastPoint = curve.points[curve.points.length - 1]
                const firstLastPoint = {x: (firstPoint.x + lastPoint.x) / 2, y: (firstPoint.y + lastPoint.y) / 2}
                const newCurve1 = moveSelectedControlPoint(curve, firstLastPoint, 0, 1)
                const newCurve2 = moveSelectedControlPoint(newCurve1, firstLastPoint, curve.points.length - 1, 1)
                const points = newCurve2.points.slice(0, -1)
                const newCurve = {...curve, closed: Closed.True, degree: degree, points: points, knots: curve.knots.slice(1, -(degree + 1)), period: 1}
                return newCurve
            }
    }
}