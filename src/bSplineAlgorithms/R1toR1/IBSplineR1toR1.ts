import type { BernsteinDecompositionR1toR1 } from "./BernsteinDecompositionR1toR1"
import type { ScaledBernsteinDecompositionR1toR1 } from "./ScaledBernsteinDecompositionR1toR1"


export interface IBSplineR1toR1 {

    knots: number[]

    degree: number

    controlPoints: number[]

    evaluate(u: number): number

    clone(): IBSplineR1toR1

    derivative(): IBSplineR1toR1

    bernsteinDecomposition(): BernsteinDecompositionR1toR1

    scaledBernsteinDecomposition(): ScaledBernsteinDecompositionR1toR1


}