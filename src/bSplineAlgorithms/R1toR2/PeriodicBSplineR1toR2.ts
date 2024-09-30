import { Vector2d } from "../../mathVector/Vector2d"
import { BaseBSplineR1toR2, deepCopyControlPoints } from "./BaseBSplineR1toR2"
import { BSplineR1toR2 } from "./BSplineR1toR2"
import { clampingFindSpan } from "../Piegl_Tiller_NURBS_Book"
import { PeriodicBSplineR1toR2DifferentialProperties } from "./PeriodicBSplineR1toR2DifferentialProperties"


/**
 * A B-Spline function from a one dimensional real periodic space to a two dimensional real space
 */
export class PeriodicBSplineR1toR2 extends BaseBSplineR1toR2  {


    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
     constructor(controlPoints: readonly Vector2d[] = [new Vector2d(0, 0)], knots: readonly number[] = [0, 1]) {
        super(controlPoints, knots)
    }

    
    protected override factory(controlPoints: readonly Vector2d[] = [new Vector2d(0, 0)], knots: readonly number[] = [0, 1]) {
        return new PeriodicBSplineR1toR2(controlPoints, knots) as this
    }
    


    get periodicControlPointsLength() {
        return this._controlPoints.length - this._degree
    }

    get freeControlPoints() {
        let periodicControlPoints = []
        for (let i = 0; i < this.periodicControlPointsLength; i += 1) {
            periodicControlPoints.push(this._controlPoints[i].clone())
        }
        return periodicControlPoints
    }

    getClampSpline() {
        let s = new BSplineR1toR2(this._controlPoints, this._knots)
        const degree = this._degree
        s = s.clamp(s.knots[degree])
        s = s.clamp(s.knots[s.knots.length - degree - 1])
        const newControlPoints = s.controlPoints.slice(degree, s.controlPoints.length - degree)
        const newKnots = s.knots.slice(degree, s.knots.length - degree)
        return new BSplineR1toR2(newControlPoints, newKnots)
    }


    /**
     * Return a deep copy of this b-spline
     */
     clone() : PeriodicBSplineR1toR2 {
        let cloneControlPoints = deepCopyControlPoints(this._controlPoints)
        return new PeriodicBSplineR1toR2(cloneControlPoints, this._knots.slice())
    }

    /*
    optimizerStep2(step: number[]) {
        
        const n = this.periodicControlPointsLength
        let controlPoints = this.controlPoints
        for (let i = 0; i < n; i += 1) {
            controlPoints[i]
            this.moveControlPoint2(i, step[i], step[i + n])
        }
    }
    */

    moveControlPoints(delta: Vector2d[]) {
        const n = this.periodicControlPointsLength
        if (delta.length !== n) {
            throw new Error("Array of unexpected dimension")
        }
        let controlPoints = this.controlPoints
        for (let i = 0; i < n; i += 1) {
            controlPoints[i] = controlPoints[i].add(delta[i])
            if (i < this.degree) {
                controlPoints[n + i] = controlPoints[i]
            }
        }
        return new PeriodicBSplineR1toR2(controlPoints, this._knots) as this

    }

    moveControlPoint(i: number, delta: Vector2d) {
        const n = this.periodicControlPointsLength
        if (i < 0 || i >= n) {
            throw new Error("Control point indentifier is out of range")
        }
        let controlPoints = this.controlPoints
        controlPoints[i] = controlPoints[i].add(delta)
        if (i < this.degree) {
            controlPoints[n + i] = controlPoints[i]
        }
        return new PeriodicBSplineR1toR2(controlPoints, this._knots) as this
    }

    /**
     * 
     * @param fromU Parametric position where the section start
     * @param toU Parametric position where the section end
     * @retrun the BSpline_R1_to_R2 section
     */
     extract(fromU: number, toU: number) {

        let spline = new BSplineR1toR2(this._controlPoints, this._knots)
        spline = spline.clamp(fromU)
        spline = spline.clamp(toU)


        const newFromSpan = clampingFindSpan(fromU, spline.knots, spline.degree)
        const newToSpan = clampingFindSpan(toU, spline.knots, spline.degree)

        let newKnots : number[] = []
        let newControlPoints : Vector2d[] = []


        for (let i = newFromSpan - spline.degree; i < newToSpan + 1; i += 1) {
            newKnots.push(spline.knots[i])
        }

        for (let i = newFromSpan - spline.degree; i < newToSpan - spline.degree; i += 1) {
            newControlPoints.push(new Vector2d(spline.controlPoints[i].x, spline.controlPoints[i].y))
        }

        return new BSplineR1toR2(newControlPoints, newKnots)
    }



    getDistinctKnots() {
        const result = super.getDistinctKnots()
        return result.slice(this.degree, result.length - this.degree)
    }

    setControlPointPosition(i: number, value: Vector2d) {
        const n = this.periodicControlPointsLength
        if (i < 0 || i >= n) {
            throw new Error("Control point indentifier is out of range")
        }
        let controlPoints = this.controlPoints
        controlPoints[i] = value.clone()
        if (i < this.degree) {
            controlPoints[n + i] = controlPoints[i]
        }
        return new PeriodicBSplineR1toR2(controlPoints, this._knots) as this
    }

    insertKnot(u: number) {
        let s = new BSplineR1toR2(this._controlPoints, this._knots)
        s = s.insertKnot(u, 1)
        let controlPoints = s.controlPoints
        let knots = s.knots

        if (u < knots[2 * this._degree]) {
            let newKnots : number[] = []
            let newControlPoints: Vector2d[]  = []
            for (let i = 0; i < knots.length - 2 * this._degree ; i += 1) {
                newKnots.push(knots[i])
            }
            const ui = newKnots[newKnots.length - 1]
            for (let i = 1; i < 2 * this._degree + 1; i += 1 ) {
                newKnots.push(ui + (knots[i] - knots[0]))
            }
            for (let i = 0; i < controlPoints.length - this._degree ; i += 1) {
                newControlPoints.push(new Vector2d(controlPoints[i].x, controlPoints[i].y))
            }
            for (let i = 0; i < this._degree; i += 1 ) {
                newControlPoints.push(new Vector2d(controlPoints[i].x, controlPoints[i].y))
            }
            controlPoints = newControlPoints
            knots = newKnots
        }
        if (u > knots[knots.length - 1 - 2 * this._degree]) {
            let newKnots : number[] = []
            let newControlPoints: Vector2d[]  = []
            const periodicIndex = knots.length - 1 - 2 * this._degree
            const ui = knots[periodicIndex]
            for (let i = 0; i < 2 * this._degree; i += 1) {
                newKnots.push(knots[1] + (knots[i + periodicIndex] - ui))
            }
            for (let i = 2 * this._degree; i < knots.length; i += 1 ) {
                newKnots.push(knots[i])
            }
            const cpi = this._controlPoints.length - this._degree
            for (let i = 0; i < this._degree; i += 1 ) {
                newControlPoints.push(new Vector2d(controlPoints[cpi + i].x, controlPoints[cpi + i].y))
            }
            for (let i = this._degree; i < controlPoints.length; i += 1) {
                newControlPoints.push(new Vector2d(controlPoints[i].x, controlPoints[i].y))
            }
            controlPoints = newControlPoints
            knots = newKnots
        } 
        return new PeriodicBSplineR1toR2(controlPoints, knots) as this
    }

    getDifferentialProperties(): PeriodicBSplineR1toR2DifferentialProperties {
        return new PeriodicBSplineR1toR2DifferentialProperties(this)
    }

}

export function create_PeriodicBSplineR1toR2(controlPoints: number[][], knots: number[]){
    let newControlPoints: Vector2d[] = []
    for (let cp of controlPoints) {
        newControlPoints.push(new Vector2d(cp[0], cp[1]))
    }
    return new PeriodicBSplineR1toR2(newControlPoints, knots)
}