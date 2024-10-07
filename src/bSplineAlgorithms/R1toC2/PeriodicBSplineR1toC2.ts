import { Complex2d } from "../../mathVector/Complex2d";
import { Vector2d } from "../../mathVector/Vector2d";
import { basisFunctions, findSpan } from "../Piegl_Tiller_NURBS_Book";
import { BSplineR1toR2 } from "../R1toR2/BSplineR1toR2";

export class PeriodicBSplineR1toC2 {
    protected readonly _controlPoints: readonly Complex2d[]
    protected readonly _knots: readonly number[]
    protected readonly _degree: number


    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: readonly Complex2d[] = [new Complex2d({x: 0, y: 0}, {x: 1, y: 0})], knots: readonly number[] = [0, 1]) {
        this._controlPoints = deepCopyControlPoints(controlPoints)
        this._knots = [...knots]
        this._degree = this.computeDegree()
    }

    computeDegree() {
        let degree = this._knots.length - this._controlPoints.length - 1
        if (degree < 0) {
            throw new Error("Negative degree BSplineR1toR1 are not supported")
        }
        return degree
    }

    /**
     * B-Spline evaluation
     * @param u The parameter
     * @returns the value of the B-Spline at u
     */
    evaluate(u: number) : Complex2d {
        const span = findSpan(u, this._knots, this._degree)
        const basis = basisFunctions(span, u, this._knots, this._degree)
        let result = new Complex2d({x: 0, y: 0}, {x: 0, y: 0})
        for (let i = 0; i < this._degree + 1; i += 1) {
            result.c0.x += basis[i] * this._controlPoints[span - this._degree + i].c0.x
            result.c0.y += basis[i] * this._controlPoints[span - this._degree + i].c0.y
            result.c1.x += basis[i] * this._controlPoints[span - this._degree + i].c1.x
            result.c1.y += basis[i] * this._controlPoints[span - this._degree + i].c1.y
        }
        return result
    }

    get knots() : number[] {
        return [...this._knots]
    }

    get degree() : number {
        return this._degree
    }

    get controlPoints(): Complex2d[] {
        return deepCopyControlPoints(this._controlPoints)
    }

    insertKnot(u: number, times: number = 1) {
        // Piegl and Tiller, The NURBS book, p: 151
        if (times <= 0) {
            return this.factory(this.controlPoints, this.knots)
        }
        
        let index = findSpan(u, this._knots, this._degree)
        let multiplicity = 0
        let controlPoints = this.controlPoints
        let knots = this.knots

        if (u === this._knots[index]) {
            multiplicity = this.knotMultiplicity(index)
        }

        for (let t = 0; t < times; t += 1) {
            let newControlPoints = []
            for (let i = 0; i < index - this._degree + 1; i += 1) {
                newControlPoints[i] = controlPoints[i]
            }
            for (let i = index - this._degree + 1; i <= index - multiplicity; i += 1) {
                let alpha = (u - knots[i]) / (knots[i + this._degree] - knots[i])
                newControlPoints[i] = (controlPoints[i - 1].multiplyScalar(1 - alpha)).add(controlPoints[i].multiplyScalar(alpha))
            }
            for (let i = index - multiplicity; i < controlPoints.length; i += 1) {
                newControlPoints[i + 1] = controlPoints[i]
            }
            knots.splice(index + 1, 0, u)
            controlPoints = newControlPoints.slice()
            multiplicity += 1
            index += 1
        }
        return this.factory(controlPoints, knots)
    }

    knotMultiplicity(indexFromFindSpan: number) {
        let result: number = 0
        let i = 0
        while (this._knots[indexFromFindSpan + i] === this._knots[indexFromFindSpan]) {
            i -= 1
            result += 1
            if (indexFromFindSpan + i < 0) {
                break
            }
        }
        return result
    }

    setControlPointPosition(index: number, value: Complex2d) {
        let controlPoints = this.controlPoints
        controlPoints[index] =  value
        return this.factory(controlPoints, this.knots)
    }

    factory(controlPoints: readonly Complex2d[] = [new Complex2d({x: 0, y: 0}, {x: 1, y: 0})], knots: readonly number[] = [0, 1]) {
        return new PeriodicBSplineR1toC2(controlPoints, knots)
    }

    elevateDegree() {
        const cps0 : Vector2d[] = this._controlPoints.map(value => new Vector2d(value.c0.x, value.c0.y))
        const cps1 : Vector2d[] = this._controlPoints.map(value => new Vector2d(value.c1.x, value.c1.y))
        const bspline0 = new BSplineR1toR2(cps0, this._knots)
        const bspline1 = new BSplineR1toR2(cps1, this._knots)
        const newbspline0 = bspline0.elevateDegree()
        const newbspline1 = bspline1.elevateDegree()
        const controlPoints = newbspline0.controlPoints.map((value, index) => new Complex2d(value, newbspline1.controlPoints[index]))
        return new PeriodicBSplineR1toC2(controlPoints, newbspline0.knots)
    }


}


export function deepCopyControlPoints(controlPoints: readonly Complex2d[]): Complex2d[] {
    let result: Complex2d[] = []
    for (let cp of controlPoints) {
        result.push(cp.clone())
    }
    return result
}