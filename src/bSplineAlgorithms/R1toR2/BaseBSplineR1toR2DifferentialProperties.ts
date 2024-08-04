import type { BaseBSplineR1toR2 } from "./BaseBSplineR1toR2"
import { BSplineR1toR1 } from "../R1toR1/BSplineR1toR1"
import type { IBSplineR1toR1 } from "../R1toR1/IBSplineR1toR1"
import type { Vector2d } from "../../mathVector/Vector2d"

export interface BSplineR1toR2DifferentialPropertiesInterface {

    curvatureExtrema(_curvatureDerivativeNumerator?: BSplineR1toR1): Vector2d[]
    inflections(curvatureNumerator?: BSplineR1toR1): Vector2d[]

}


export abstract class BaseBSplineR1toR2DifferentialProperties implements BSplineR1toR2DifferentialPropertiesInterface  {

    protected _spline: BaseBSplineR1toR2

    abstract bSplineR1toR1Factory(controlPoints: number[], knots: number[]): IBSplineR1toR1


    constructor(spline: BaseBSplineR1toR2) {
        this._spline = spline.clone()
    }

    protected expensiveComputation(spline: BaseBSplineR1toR2) {
        const sx = this.bSplineR1toR1Factory(spline.getControlPointsX(), spline.knots)
        const sy = this.bSplineR1toR1Factory(spline.getControlPointsY(), spline.knots)
        const sxu = sx.derivative()
        const syu = sy.derivative()
        const sxuu = sxu.derivative()
        const syuu = syu.derivative()
        const sxuuu = sxuu.derivative()
        const syuuu = syuu.derivative()
        const bdsxu = sxu.bernsteinDecomposition()
        const bdsyu = syu.bernsteinDecomposition()
        const bdsxuu = sxuu.bernsteinDecomposition()
        const bdsyuu = syuu.bernsteinDecomposition()
        const bdsxuuu = sxuuu.bernsteinDecomposition()
        const bdsyuuu = syuuu.bernsteinDecomposition()
        const h1 = (bdsxu.multiply(bdsxu)).add((bdsyu.multiply(bdsyu)))
        const h2 = (bdsxu.multiply(bdsyuuu)).subtract((bdsyu.multiply(bdsxuuu)))
        const h3 = (bdsxu.multiply(bdsxuu)).add((bdsyu.multiply(bdsyuu)))
        const h4 = (bdsxu.multiply(bdsyuu)).subtract((bdsyu.multiply(bdsxuu)))
        return {
            h1 : h1,
            h2 : h2,
            h3 : h3,
            h4 : h4
        };
    }



    curvatureNumerator() {
        const e = this.expensiveComputation(this._spline)
        const distinctKnots = this._spline.getDistinctKnots()
        const controlPoints = e.h4.flattenControlPointsArray()
        const curvatureNumeratorDegree = 2 * this._spline.degree - 3
        let knots = []
        for (let knot of distinctKnots){
            for (let j = 0; j < curvatureNumeratorDegree + 1; j += 1) {
                knots.push(knot);
            }
        }
        return new BSplineR1toR1(controlPoints, knots)
    }

    h1() {
        const e = this.expensiveComputation(this._spline)
        const distinctKnots = this._spline.getDistinctKnots()
        const controlPoints = e.h1.flattenControlPointsArray()
        const h1Degree = 2 * this._spline.degree - 2
        let knots = []

        for (let knot of distinctKnots){
            for (let j = 0; j < h1Degree + 1; j += 1) {
                knots.push(knot);
            }
        }

        return new BSplineR1toR1(controlPoints, knots)

    }

    inflections(curvatureNumerator?: BSplineR1toR1) {
        if (!curvatureNumerator) {
            curvatureNumerator = this.curvatureNumerator()
        }
        const zeros = curvatureNumerator.zeros()
        let result = []
        for (let z of zeros) {
            result.push(this._spline.evaluate(z))
        }
        return result
    }

    curvatureDerivativeNumerator() {
        const e = this.expensiveComputation(this._spline)
        const bd_curvatureDerivativeNumerator = (e.h1.multiply(e.h2)).subtract(e.h3.multiply(e.h4).multiplyByScalar(3))
        const distinctKnots = this._spline.getDistinctKnots()
        const controlPoints = bd_curvatureDerivativeNumerator.flattenControlPointsArray()
        const curvatureDerivativeNumeratorDegree = 4 * this._spline.degree - 6
        let knots = []
        for (let knot of distinctKnots) {
            for (let j = 0; j < curvatureDerivativeNumeratorDegree + 1; j += 1) {
                knots.push(knot);
            }
        }
        return new BSplineR1toR1(controlPoints, knots)
    }


    curvatureExtrema(_curvatureDerivativeNumerator?: BSplineR1toR1) {
        if (!_curvatureDerivativeNumerator) {
            _curvatureDerivativeNumerator = this.curvatureDerivativeNumerator()
        }
        const zeros = _curvatureDerivativeNumerator.zeros()
        let result = []
        for (let z of zeros) {
            result.push(this._spline.evaluate(z))
        }
        return result
    }

}