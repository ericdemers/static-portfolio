
import { BernsteinDecompositionR1toR1 } from "./BernsteinDecompositionR1toR1";
import { BSplineR1toR1 } from "./BSplineR1toR1";
import { decomposeFunction } from "../Piegl_Tiller_NURBS_Book";
import { ScaledBernsteinDecompositionR1toR1, scaledDecomposeFunction } from "./ScaledBernsteinDecompositionR1toR1";
import { BaseBSplineR1toR1 } from "./BaseBSplineR1toR1";


/**
 * A B-Spline function from a one dimensional real periodic space to a one dimensional real space
 */
export class PeriodicBSplineR1toR1 extends BaseBSplineR1toR1 {

    constructor(controlPoints: number[] = [0], knots: number[] = [0, 1]) {
        super(controlPoints, knots)
    }

    protected override factory(controlPoints: number[] = [0], knots: number[] = [0, 1]) {
        return new PeriodicBSplineR1toR1(controlPoints, knots)
    }

    bernsteinDecomposition() {
        let s = this.clone() as BaseBSplineR1toR1
        s = s.clamp(s.knots[this._degree]) 
        s = s.clamp(s.knots[s.knots.length - this._degree - 1]) 
        const newControlPoints = s.controlPoints.slice(this._degree, s.controlPoints.length - this._degree)
        const newKnots = s.knots.slice(this._degree, s.knots.length - this._degree)
        return new BernsteinDecompositionR1toR1(decomposeFunction(new BSplineR1toR1(newControlPoints, newKnots)))
    }

    scaledBernsteinDecomposition() {
        let s = this.clone() as BaseBSplineR1toR1
        s = s.clamp(s.knots[this._degree]) 
        s = s.clamp(s.knots[s.knots.length - this._degree - 1]) 
        const newControlPoints = s.controlPoints.slice(this._degree, s.controlPoints.length - this._degree)
        const newKnots = s.knots.slice(this._degree, s.knots.length - this._degree)
        return new ScaledBernsteinDecompositionR1toR1(scaledDecomposeFunction(new BSplineR1toR1(newControlPoints, newKnots)))
    }

    clone() {
        return new PeriodicBSplineR1toR1(this._controlPoints.slice(), this._knots.slice());
    }

    derivative() {
        let newControlPoints = []
        let newKnots = []
        for (let i = 0; i < this._controlPoints.length - 1; i += 1) {
            newControlPoints[i] = (this._controlPoints[i + 1] - (this._controlPoints[i])) * (this._degree / (this._knots[i + this._degree + 1] - this._knots[i + 1]));
        }
        newKnots = this._knots.slice(1, this._knots.length - 1);
        return new PeriodicBSplineR1toR1(newControlPoints, newKnots);
    }

}