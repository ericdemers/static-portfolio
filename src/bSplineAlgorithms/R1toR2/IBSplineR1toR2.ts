import type { Vector2d } from "../mathVector/Vector2d"
import type { BSplineR1toR2DifferentialPropertiesInterface } from "./IBSplineR1toR2DifferentialProperties"

export interface IBSplineR1toR2 {

    readonly knots: number[]

    readonly degree: number

    readonly controlPoints: readonly Vector2d[]

    readonly freeControlPoints: readonly Vector2d[]

    evaluate(u: number): Vector2d

    clone(): IBSplineR1toR2

    getControlPointsX(): number[]

    getControlPointsY(): number[]

    setControlPointPosition(index: number, value: Vector2d): IBSplineR1toR2

    moveControlPoint(index: number, delta: Vector2d): IBSplineR1toR2

    moveControlPoints(delta: Vector2d[]): IBSplineR1toR2

    getDifferentialProperties(): BSplineR1toR2DifferentialPropertiesInterface

}