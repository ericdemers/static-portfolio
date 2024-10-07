import { findSpan, clampingFindSpan, basisFunctions } from "../Piegl_Tiller_NURBS_Book"
import { Vector3d } from "../../mathVector/Vector3d"
import type { BSplineR1toR3Interface } from "./BSplineR1toR3Interface"



/**
 * A B-Spline function from a one dimensional real space to a two dimensional real space
 */
//export abstract class AbstractBSplineR1toR3 implements BSplineR1toRxInterface<Vector3d> {
export abstract class BaseBSplineR1toR3 implements BSplineR1toR3Interface {

    protected readonly _controlPoints: readonly Vector3d[]
    protected readonly _knots: readonly number[]
    protected readonly _degree: number

    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: readonly Vector3d[] = [new Vector3d(0, 0, 0)], knots: readonly number[] = [0, 1]) {
        this._controlPoints = deepCopyControlPoints(controlPoints)
        this._knots = [...knots]
        this._degree = this.computeDegree()
    }

    /**
     * Return a b-spline of derived class type
     */
         protected abstract factory(controlPoints: readonly Vector3d[], knots: readonly number[]): BaseBSplineR1toR3


    computeDegree() {
        let degree = this._knots.length - this._controlPoints.length - 1
        if (degree < 0) {
            throw new Error("Negative degree BSplineR1toR1 are not supported")
        }
        return degree
    }

    
    get controlPoints(): Vector3d[] {
        return deepCopyControlPoints(this._controlPoints)
    }
    

    abstract get freeControlPoints(): Vector3d[] 

    /*
    set controlPoints(controlPoints: Vector3d[]) {
        this._controlPoints = deepCopyControlPoints(controlPoints)
    }
    */

    get knots() : number[] {
        return [...this._knots]
    }

    /*
    set knots(knots: number[]) {
        this._knots = [...knots]
        this._degree = this.computeDegree()
    }
    */
    

    get degree() : number {
        return this._degree
    }


    getControlPoint(index: number) {
        return this._controlPoints[index].clone()
    }


    /**
     * B-Spline evaluation
     * @param u The parameter
     * @returns the value of the B-Spline at u
     */
    evaluate(u: number) : Vector3d {
        const span = findSpan(u, this._knots, this._degree)
        const basis = basisFunctions(span, u, this._knots, this._degree)
        let result = new Vector3d(0, 0, 0)
        for (let i = 0; i < this._degree + 1; i += 1) {
            result.x += basis[i] * this._controlPoints[span - this._degree + i].x
            result.y += basis[i] * this._controlPoints[span - this._degree + i].y
            result.z += basis[i] * this._controlPoints[span - this._degree + i].z
        }
        return result
    }

    /**
     * Return a deep copy of this b-spline
     */
    abstract clone() : BaseBSplineR1toR3

    getControlPointsX() {
        let result: number[] = []
        for (let cp of this._controlPoints) {
            result.push(cp.x)
        }
        return result
    }

    getControlPointsY() {
        let result: number[] = []
        for (let cp of this._controlPoints) {
            result.push(cp.y)
        }
        return result
    }

    getControlPointsZ() {
        let result: number[] = []
        for (let cp of this._controlPoints) {
            result.push(cp.z)
        }
        return result
    }

    getDistinctKnots() {
        let result: number[] = [this._knots[0]]
        let temp = result[0]
        for (let i = 1; i < this._knots.length; i += 1) {
            if (this._knots[i] !== temp) {
                result.push(this._knots[i])
                temp = this._knots[i]
            }
        }
        return result
    }

    moveControlPoint(i: number, delta: Vector3d) {
        if (i < 0 || i >= this._controlPoints.length - this._degree) {
            throw new Error("Control point indentifier is out of range")
        }
        let controlPoints = this.controlPoints

        controlPoints[i].x += delta.x
        controlPoints[i].y += delta.y
        controlPoints[i].z += delta.z
        return this.factory(controlPoints, this._knots)
    }

    moveControlPoints(delta: Vector3d[]) {
        const n = this._controlPoints.length
        if (delta.length !== n) {
            throw new Error("Array of unexpected dimension")
        }
        let controlPoints = this.controlPoints
        for (let i = 0; i < n; i += 1) {
            controlPoints[i] = controlPoints[i].add(delta[i])
        }
        return this.factory(controlPoints, this._knots)
    }


    setControlPointPosition(index: number, value: Vector3d) {
        let controlPoints = this.controlPoints
        controlPoints[index] =  value
        return this.factory(controlPoints, this.knots)
    }

    insertKnot(u: number, times: number = 1) {
        // Piegl and Tiller, The NURBS book, p: 151
        if (times <= 0) {
            return this.factory(this.controlPoints, this.knots)
        }
        
        let index = findSpan(u, this._knots, this._degree)
        let multiplicity = 0
        let controlPoints = this.controlPoints
        let knots = [...this.knots]

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
                newControlPoints[i] = (controlPoints[i - 1].multiply(1 - alpha)).add(controlPoints[i].multiply(alpha))
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

    grevilleAbscissae() {
        let result = []
        for (let i = 0; i < this._controlPoints.length; i += 1) {
            let sum = 0
            for (let j = i + 1; j < i + this._degree + 1; j += 1) {
                sum += this._knots[j]
            }
            result.push(sum / this._degree)
        }
        return result
    }


    clamp(u: number) {
        // Piegl and Tiller, The NURBS book, p: 151

        let index = clampingFindSpan(u, this._knots, this._degree)
        let newControlPoints = []
        let controlPoints = this.controlPoints
        let knots = this.knots

        let multiplicity = 0
        if (u === this._knots[index]) {
            multiplicity = this.knotMultiplicity(index)
        }

        const times = this._degree - multiplicity + 1;

        for (let t = 0; t < times; t += 1) {
            for (let i = 0; i < index - this._degree + 1; i += 1) {
                newControlPoints[i] = controlPoints[i]
            }
            for (let i = index - this._degree + 1; i <= index - multiplicity; i += 1) {
                let alpha = (u - knots[i]) / (knots[i + this._degree] - knots[i]);
                newControlPoints[i] = (controlPoints[i - 1].multiply(1 - alpha)).add(controlPoints[i].multiply(alpha))
            }
            for (let i = index - multiplicity; i < controlPoints.length; i += 1) {
                newControlPoints[i + 1] = controlPoints[i]
            }
            knots.splice(index + 1, 0, u)
            controlPoints = newControlPoints.slice()
            multiplicity += 1
            index += 1
        }
        return this.factory(controlPoints, knots) as this

    }

    /**
     * 
     * @param fromU Parametric position where the section start
     * @param toU Parametric position where the section end
     * @retrun the BSpline_R1_to_R2 section
     */
    abstract extract(fromU: number, toU: number) : BaseBSplineR1toR3

}

export function deepCopyControlPoints(controlPoints: readonly Vector3d[]): Vector3d[] {
    let result: Vector3d[] = []
    for (let cp of controlPoints) {
        result.push(cp.clone())
    }
    return result
}


