import type { BSplineR1toR1 } from "../R1toR1/BSplineR1toR1"
import type { Vector2d } from "../mathVector/Vector2d"


export interface BSplineR1toR2DifferentialPropertiesInterface {

    curvatureExtrema(_curvatureDerivativeNumerator?: BSplineR1toR1): Vector2d[]
    inflections(curvatureNumerator?: BSplineR1toR1): Vector2d[]

}