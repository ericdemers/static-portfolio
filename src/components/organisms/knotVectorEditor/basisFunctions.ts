import { basisFunctions } from "../../../bSplineAlgorithms/Piegl_Tiller_NURBS_Book";
import { cadd, cdiv, cmult, csub } from "../../../mathVector/ComplexGrassmannSpace";
import type { Coordinates } from "../../../sketchElements/coordinates";
import { computeDegree } from "../../../sketchElements/curve";
import type { Curve } from "../../../sketchElements/curveTypes";

export function computeBasisFunction(curve: Curve, step: number = 0.001) {
    const numberOfControlPoints = curve.points.length
    let result: {u: number, value: number}[][] = []
    for (let i = 0; i < numberOfControlPoints; i += 1) {
        result.push([])
    }
    const degree = computeDegree(curve)
    if (degree > 0) {
        curve.knots.forEach((value, knotIndex) => {
            if (knotIndex < curve.knots.length - 1 && value !== curve.knots[knotIndex + 1]) {
                const range = rangeIncludingStopValue(value, curve.knots[knotIndex + 1], step)
                range.forEach(u => {
                    const basis = basisFunctions(knotIndex, u, curve.knots, degree)
                    basis.forEach((value, index) => {
                        result[knotIndex + index - degree].push({u, value})
                    })
                })
            }
        })
    }
    return result
}


export function rangeIncludingStopValue(start: number, stop: number, step: number) {
    let result: number[] = []
    for (let i = start; i <= stop; i += step) {
        result.push(i)
    }
    if (result[result.length - 1] !== stop) result.push(stop)
    return result
}

export function computeRationalBasisFunction(curve: Curve, step: number = 0.001) {
    const knots = curve.knots
    const degree = Math.round(curve.knots.length - (curve.points.length / 2 + 0.5) - 1)
    const numberOfControlPoints = knots.length - degree - 1
    if (numberOfControlPoints < 0) {
         throw Error("negative number of control points is not allowed")
    }
    
    let result: {u: number, value: number}[][] = []
    for (let i = 0; i < numberOfControlPoints; i += 1) {
     result.push([])
    }
    
    knots.forEach((value, knotIndex) => {
         if (knotIndex < knots.length - 1 && value !== knots[knotIndex + 1]) {
            const weights = relativeWeight(curve, knotIndex, degree)
            const range = rangeIncludingStopValue(value, knots[knotIndex + 1], step)
            range.forEach(u => {
                    let denominator = 0
                    const basis = basisFunctions(knotIndex, u, knots, degree)
                    for (let i = 0; i < weights.length; i += 1) {
                       denominator = denominator + basis[i] * weights[i]
                    }
                    basis.forEach((value, index) => {
                    const v = value * weights[index] / denominator
                    result[knotIndex + index - degree].push({u,  value: v})
                    })
            })  
         } 
    })
    
    return result
    
 }

export function computeComplexRationalBasisFunction(curve: Curve, step: number = 0.001) {
    
    const knots = curve.knots
    const degree = Math.round(curve.knots.length - (curve.points.length / 2 + 0.5) - 1)
    const numberOfControlPoints = knots.length - degree - 1
    if (numberOfControlPoints < 0) {
         throw Error("negative number of control points is not allowed")
    }
    
    let result: {u: number, value: {x: number, y: number}}[][] = []
    for (let i = 0; i < numberOfControlPoints; i += 1) {
     result.push([])
    }
    
    knots.forEach((value, knotIndex) => {
        
         if (knotIndex < knots.length - 1 && value !== knots[knotIndex + 1]) {
            
            const weights = relativeComplexWeight(curve, knotIndex, degree)
            const range = rangeIncludingStopValue(value, knots[knotIndex + 1], step)
            range.forEach(u => {
                    let denominator = {x: 0, y: 0}
                    const basis = basisFunctions(knotIndex, u, knots, degree)
                    for (let i = 0; i < weights.length; i += 1) {
                       denominator = cadd(denominator, cmult({x: basis[i], y: 0},  weights[i]))
                    }
                    basis.forEach((value, index) => {
                    const v = cdiv(cmult({x: value, y: 0}, weights[index]), denominator)
                    result[knotIndex + index - degree].push({u,  value: v})
                    })
            })
             
         }
         
    })
    
    return result
    
 }

 function relativeComplexWeight(curve: Curve, knotIndex: number, degree: number) {
    const firstControlPointIndex = knotIndex - degree
    let weights = [{x: 1, y: 0}]
    for (let i = 0; i < degree; i += 1) {
        const z0 = curve.points[2 * (firstControlPointIndex + i)]
        const z1 = curve.points[2 * (firstControlPointIndex + i + 1)]
        const q0 = curve.points[2 * (firstControlPointIndex + i + 1) - 1]
        weights.push( cmult( weights[i], cdiv( csub(q0, z0), csub(z1, q0)) ) )
    }
    return weights
 }

 function relativeWeight(curve: Curve, knotIndex: number, degree: number) {
    const firstControlPointIndex = knotIndex - degree
    let weights = [1]
    for (let i = 0; i < degree; i += 1) {
        const p0 = curve.points[2 * (firstControlPointIndex + i)]
        const p1 = curve.points[2 * (firstControlPointIndex + i + 1)]
        const q0 = curve.points[2 * (firstControlPointIndex + i + 1) - 1]
        weights.push( weights[i] * (dist(q0, p0) / dist(q0, p1)) )
    }
    return weights
 }

 function dist(p0: Coordinates, p1: Coordinates) {
    return Math.hypot(p0.x - p1.x, p0.y - p1.y)
}