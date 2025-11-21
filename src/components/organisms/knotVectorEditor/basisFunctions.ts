import { basisFunctions } from "../../../bSplineAlgorithms/Piegl_Tiller_NURBS_Book";
import type { PeriodicRationalBSplineR1toC1 } from "../../../bSplineAlgorithms/R1toC1/PeriodicRationalBSplineR1toC1";
import type { PeriodicRationalBSplineR1toR2 } from "../../../bSplineAlgorithms/R1toR2/PeriodicRationalBSplineR1toR2";
import { cadd, cdiv, cmult, csub } from "../../../mathVector/ComplexGrassmannSpace";
import type { Coordinates } from "../../../sketchElements/coordinates";
import { computeDegree, curveToComplexPeriodicBSpline, curveToPeriodicBSpline, curveToPeriodicRationalBSpline } from "../../../sketchElements/curve";
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

export function computePeriodicBasisFunction(curve: Curve, step: number = 0.001) {
    
    let result: {u: number, value: number}[][] = []
    const bspline = curveToPeriodicBSpline(curve)
    //console.log(bspline)
    if (bspline === undefined) return result
    for (let i = 0; i < bspline.controlPoints.length; i += 1) {
        result.push([])
    }
    //const delta = curve.knots[bspline.degree - 1]
    if(curve.period === undefined) return result
    const l = curve.knots.length
    const delta = curve.knots[(bspline.degree - 1) % l] + curve.period * Math.floor((bspline.degree - 1) / l )

    //console.log(bspline)
    const degree = bspline.degree
    if (degree > 0) {
        bspline.knots.forEach((knotValue, knotIndex) => {
            if (knotIndex > degree - 1  && knotIndex < bspline.knots.length - degree - 1) {
                const range = rangeIncludingStopValue(knotValue, bspline.knots[knotIndex + 1], step)
                range.forEach(u => {
                    const basis = basisFunctions(knotIndex, u, bspline.knots, degree)
                    //console.log(bspline.knots)
                    //console.log(u)
                    //console.log("basis")
                    //console.log(basis)
                    basis.forEach((value, index) => {
                        result[knotIndex + index - degree ].push({u: (u + delta), value})
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

 export function computePeriodicRationalBasisFunction(curve: Curve, step: number = 0.001) {
    //console.log(curve.knots)
    //console.log(curve.points)
    let result: {u: number, value: number}[][] = []
    const bspline = curveToPeriodicRationalBSpline(curve)
    if (bspline === undefined) return result
    //console.log(bspline.knots)
    //console.log(bspline.controlPoints)
    for (const element of bspline.controlPoints) {
        result.push([])
    }
    

    const degree = bspline.degree
    if (degree > 0) {
        const delta = curve.knots[bspline.degree - 1]
        bspline.knots.forEach((knotValue, knotIndex) => {
            if (knotIndex > degree - 1  && knotIndex < bspline.knots.length - degree - 1) {
                const weights = relativeWeightPeriodicRationalBSpline( bspline, knotIndex, degree)
                //console.log("weights")
                //console.log(weights)
                const range = rangeIncludingStopValue(knotValue, bspline.knots[knotIndex + 1], step)
                //console.log("bspline control points")
                //console.log(bspline.controlPoints)
                range.forEach(u => {
                    let denominator = 0
                    const basis = basisFunctions(knotIndex, u, bspline.knots, degree)
                    //console.log(bspline.knots)
                    //console.log(u)
                    //console.log("basis")
                    //console.log(basis)
                    for (let i = 0; i < weights.length; i += 1) {
                        denominator = denominator + basis[i] *  weights[i]
                        //denominator = {x: 1, y: 0}
                     }
                    basis.forEach((value, index) => {
                        //result[knotIndex + index - degree ].push({u: (u + delta), value})
                        const v = value * weights[index] / denominator
                        result[knotIndex + index - degree].push({u: u + delta,  value: v})
                       //result[knotIndex + index - degree].push({u,  value: {x: 1 , y: 0}})
                    })
                })
            }
        })
    }
    //console.log(result)
    return result
}

 export function computePeriodicComplexBasisFunction(curve: Curve, step: number = 0.001) {
    //console.log(curve.knots)
    //console.log(curve.points)
    let result: {u: number, value: {x: number, y: number}}[][] = []
    const bspline = curveToComplexPeriodicBSpline(curve)
    if (bspline === undefined) return result
    //console.log(bspline.knots)
    //console.log(bspline.controlPoints)
    for (const element of bspline.controlPoints) {
        result.push([])
    }
    

    const degree = bspline.degree
    if (degree > 0) {
        const delta = curve.knots[bspline.degree - 1]
        bspline.knots.forEach((knotValue, knotIndex) => {
            if (knotIndex > degree - 1  && knotIndex < bspline.knots.length - degree - 1) {
                const weights = relativeComplexWeightPeriodicBSpline( bspline, knotIndex, degree)
                //console.log("weights")
                //console.log(weights)
                const range = rangeIncludingStopValue(knotValue, bspline.knots[knotIndex + 1], step)
                //console.log("bspline control points")
                //console.log(bspline.controlPoints)
                range.forEach(u => {
                    let denominator = {x: 0, y: 0}
                    const basis = basisFunctions(knotIndex, u, bspline.knots, degree)
                    //console.log(bspline.knots)
                    //console.log(u)
                    //console.log("basis")
                    //console.log(basis)
                    for (let i = 0; i < weights.length; i += 1) {
                        denominator = cadd(denominator, cmult({x: basis[i], y: 0},  weights[i]))
                        //denominator = {x: 1, y: 0}
                     }
                    basis.forEach((value, index) => {
                        //result[knotIndex + index - degree ].push({u: (u + delta), value})
                        const v = cdiv(cmult({x: value, y: 0}, weights[index]), denominator)
                        result[knotIndex + index - degree].push({u: u + delta,  value: v})
                       //result[knotIndex + index - degree].push({u,  value: {x: 1 , y: 0}})
                    })
                })
            }
        })
    }
    //console.log(result)
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

 function relativeWeightPeriodicRationalBSpline(curve: PeriodicRationalBSplineR1toR2, knotIndex: number, degree: number) {
    const firstControlPointIndex = knotIndex - degree
    /*
    let weights = [{x: 1, y: 0}]
    for (let i = 1; i < degree + 1; i += 1) {
        weights.push( cdiv( curve.controlPoints[firstControlPointIndex + i].c1,  curve.controlPoints[firstControlPointIndex].c1 ) )
    }
        return weights
    */
    return curve.controlPoints.slice(firstControlPointIndex, firstControlPointIndex + degree + 1).map(cp => cp.z)
    
 }

 function relativeComplexWeightPeriodicBSpline(curve: PeriodicRationalBSplineR1toC1, knotIndex: number, degree: number) {
    const firstControlPointIndex = knotIndex - degree
    /*
    let weights = [{x: 1, y: 0}]
    for (let i = 1; i < degree + 1; i += 1) {
        weights.push( cdiv( curve.controlPoints[firstControlPointIndex + i].c1,  curve.controlPoints[firstControlPointIndex].c1 ) )
    }
        return weights
    */
    return curve.controlPoints.slice(firstControlPointIndex, firstControlPointIndex + degree + 1).map(cp => cp.c1)
    
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