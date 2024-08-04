import type { Vector3d } from "../../mathVector/Vector3d"


export interface BSplineR1toR3Interface {

    knots: number[]

    degree: number

    controlPoints: Vector3d[]

    freeControlPoints: Vector3d[]

    evaluate(u: number): Vector3d

    clone(): BSplineR1toR3Interface

    getControlPointsX(): number[]

    getControlPointsY(): number[]

    getControlPointsZ(): number[]

    getDistinctKnots(): number[]

    moveControlPoint(i: number, delta: Vector3d): BSplineR1toR3Interface

    moveControlPoints(delta: Vector3d[]): BSplineR1toR3Interface

    setControlPointPosition(index: number, value: Vector3d): BSplineR1toR3Interface

}