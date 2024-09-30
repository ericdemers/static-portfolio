import type { BSplineR1toR1 } from "../R1toR1/BSplineR1toR1"
import { PeriodicBSplineR1toR1 } from "../R1toR1/PeriodicBSplineR1toR1"
import { BaseBSplineR1toR2DifferentialProperties } from "./BaseBSplineR1toR2DifferentialProperties"
import type { PeriodicBSplineR1toR2 } from "./PeriodicBSplineR1toR2"




export class PeriodicBSplineR1toR2DifferentialProperties extends BaseBSplineR1toR2DifferentialProperties {

    /*
    constructor(spline: PeriodicBSplineR1toR2) {
        super(spline)
    }
        */

    bSplineR1toR1Factory(controlPoints: number[], knots: number[]): PeriodicBSplineR1toR1 {
        return new PeriodicBSplineR1toR1(controlPoints, knots)
    }


    curvatureExtrema(curvatureDerivativeNumerator?: BSplineR1toR1) {
        if (!curvatureDerivativeNumerator) {
            curvatureDerivativeNumerator = this.curvatureDerivativeNumerator()
        }
        const zeros = curvatureDerivativeNumerator.zeros(10e-3)
        let result = []
        for (let z of zeros) {
            result.push(this._spline.evaluate(z))
        }
        const a = curvatureDerivativeNumerator.controlPoints[0]
        const b = curvatureDerivativeNumerator.controlPoints[curvatureDerivativeNumerator.controlPoints.length - 1]
        if (a * b < 0 ) { // a and b have different sign
            const u = curvatureDerivativeNumerator.knots[curvatureDerivativeNumerator.knots.length - 1]
            result.push(this._spline.evaluate(u))
        }
        return result
    }

}