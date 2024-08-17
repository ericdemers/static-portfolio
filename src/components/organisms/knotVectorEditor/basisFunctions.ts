import { basisFunctions } from "../../../bSplineAlgorithms/Piegl_Tiller_NURBS_Book";
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