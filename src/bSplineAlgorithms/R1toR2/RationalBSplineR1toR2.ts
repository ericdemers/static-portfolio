
import { Complex2d } from "../../mathVector/Complex2d"
import { Vector2d } from "../../mathVector/Vector2d"
import { Vector3d } from "../../mathVector/Vector3d"
import { RationalBSplineR1toC1 } from "../R1toC1/RationalBSplineR1toC1"
import { BSplineR1toR3 } from "../R1toR3/BSplineR1toR3"
import { RationalBSplineR1toR2Adapter } from "./RationalBSplineR1toR2Adapter"
import { RationalBSplineR1toR2DifferentialProperties } from "./RationalBSplineR1toR2DifferentialProperties"


export class RationalBSplineR1toR2 {

    private readonly spline: BSplineR1toR3

    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: Vector3d[] = [new Vector3d(0, 0, 1)], knots: number[] = [0, 1]) {
        this.spline = new BSplineR1toR3(controlPoints, knots)
    }


    get knots() : number[] {
        return this.spline.knots
    }

    get degree() : number {
        return this.spline.degree
    }

    get controlPoints(): Vector3d[] {
        return this.spline.controlPoints
    }

    get freeControlPoints(): Vector3d[] {
        return this.spline.freeControlPoints
    }

    evaluate(u: number) : Vector2d {
        let result = this.spline.evaluate(u)
        return new Vector2d(result.x / result.z, result.y / result.z)
    }

    controlPoints2D() : Vector2d[] {
        let result: Vector2d[] = []
        for (let cp of this.spline.controlPoints) {
            result.push(new Vector2d(cp.x / cp.z, cp.y / cp.z))
        }
        return result
    }

    clone(): RationalBSplineR1toR2 {
        return new RationalBSplineR1toR2(this.spline.controlPoints, this.spline.knots)
    }

    insertKnot(u: number, times: number = 1)  {
        let s = this.spline.insertKnot(u, times)
        return new RationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    /*
    optimizerStep(step: number[]) {
        this.spline.optimizerStep(step)
    }
    */

    moveControlPoints(delta: Vector3d[]) {
        const s = this.spline.moveControlPoints(delta)
        return new RationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    extract(fromU: number, toU: number) {
        return this.spline.extract(fromU, toU)
    }

    getControlPointsX() {
        return this.spline.getControlPointsX()
    }

    getControlPointsY() {
        return this.spline.getControlPointsY()
    }

    getControlPointsW() {
        return this.spline.getControlPointsZ()
    }

    setControlPointPosition(index: number, value: Vector3d) {
        const s = this.spline.setControlPointPosition(index, value)
        return new RationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    setControlPointWeight(controlPointIndex: number, w: number) {
        const x = this.controlPoints[controlPointIndex].x
        const y = this.controlPoints[controlPointIndex].y
        const z = this.controlPoints[controlPointIndex].z
        const s = this.setControlPointPosition(controlPointIndex, new Vector3d(x * w / z, y * w / z, w))
        return new RationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    getControlPointWeight(controlPointIndex: number) {
        return this.controlPoints[controlPointIndex].z
    }

    distinctKnots() {
        let result = [this.knots[0]]
        let temp = result[0]
        for (let i = 1; i < this.knots.length; i += 1) {
            if (this.knots[i] !== temp) {
                result.push(this.knots[i]);
                temp = this.knots[i];
            }
        }
        return result;
    }

    getSplineAdapter(): RationalBSplineR1toR2Adapter {
        return new RationalBSplineR1toR2Adapter(this.controlPoints, this.knots)
    }

    grevilleAbscissae() {
        let result = []
        for (let i = 0; i < this.spline.controlPoints.length; i += 1) {
            let sum = 0
            for (let j = i + 1; j < i + this.spline.degree + 1; j += 1) {
                sum += this.spline.knots[j]
            }
            result.push(sum / this.spline.degree)
        }
        return result
    }

    elevateDegree() {
        //console.log(this.spline)
        const s = this.spline.elevateDegree()
        return new RationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    getDifferentialProperties() {
        return new RationalBSplineR1toR2DifferentialProperties(this)
    }

    toRationalBSplineR1toC1() {
        let cp: Complex2d[] = []
        for (let i = 0; i < this.controlPoints.length; i += 1) {
            const c0 = {x: this.controlPoints[i].x, y: this.controlPoints[i].y}
            const c1 = {x: this.controlPoints[i].z, y: 0}
            cp.push(new Complex2d(c0, c1 ))
        }
        return new RationalBSplineR1toC1(cp, this.knots)
    }

}

export function create_RationalBSplineR1toR2(controlPoints: number[][], knots: number[]){
    let newControlPoints: Vector3d[] = []
    for (let cp of controlPoints) {
        newControlPoints.push(new Vector3d(cp[0], cp[1], cp[2]))
    }
    return new RationalBSplineR1toR2(newControlPoints, knots)
}