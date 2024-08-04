import type { Vector2d } from "../../mathVector/Vector2d"
import { Vector3d } from "../../mathVector/Vector3d"
import type { IBSplineR1toR2 } from "./IBSplineR1toR2"
import { RationalBSplineR1toR2 } from "./RationalBSplineR1toR2"


export class RationalBSplineR1toR2Adapter implements IBSplineR1toR2  {


    private _spline: RationalBSplineR1toR2


    constructor(controlPoints: Vector3d[] = [new Vector3d(0, 0, 1)], knots: number[] = [0, 1]) {
        this._spline = new RationalBSplineR1toR2(controlPoints, knots)
    }
    getControlPointsX(): number[] {
        let result: number[] = []
        for (let cp of this._spline.controlPoints) {
            result.push(cp.x)
        }
        return result
    }
    getControlPointsY(): number[] {
        let result: number[] = []
        for (let cp of this._spline.controlPoints) {
            result.push(cp.y)
        }
        return result
    }

    moveControlPoint(i: number, delta: Vector2d) {
        if (i < 0 || i >= this._spline.controlPoints.length - this._spline.degree) {
            throw new Error("Control point indentifier is out of range")
        }
        const z = this._spline.controlPoints[i].z

        let controlPoints = this._spline.controlPoints
        controlPoints[i].x += delta.x * z
        controlPoints[i].y += delta.y * z
        return new RationalBSplineR1toR2Adapter(controlPoints, this.knots)
    }

    moveControlPoints(delta: Vector2d[]) {
        const n = this._spline.controlPoints.length
        if (delta.length !== n) {
            throw new Error("Array of unexpected dimension")
        }
        let controlPoints = this._spline.controlPoints
        for (let i = 0; i < n; i += 1) {
            const z = this._spline.controlPoints[i].z
            controlPoints[i].x += delta[i].x * z
            controlPoints[i].y += delta[i].y * z
        }
        return new RationalBSplineR1toR2Adapter(controlPoints, this.knots)
    }

    setControlPointPosition(index: number, value: Vector2d) {
        const z = this._spline.controlPoints[index].z
        let s = this._spline.setControlPointPosition(index, new Vector3d(value.x * z, value.y * z, z))
        return new RationalBSplineR1toR2Adapter(s.controlPoints, s.knots)
    }

    get degree() {
        return this._spline.degree
    }

    get knots() {
        return this._spline.knots
    }

    get controlPoints() {
        return this._spline.controlPoints2D()
    }

    get freeControlPoints() {
        return this._spline.controlPoints2D()
    }

    clone(): RationalBSplineR1toR2Adapter {
        return new RationalBSplineR1toR2Adapter(this._spline.controlPoints, this._spline.knots)
    }

    evaluate(u: number) : Vector2d {
        return this._spline.evaluate(u)
    }

    /*
    optimizerStep(step: number[]): void {
    }
    */
    
    
    getRationalBSplineR1toR2() {
        return this._spline.clone()
    }

    setControlPointWeight(controlPointIndex: number, w: number) {
        const x = this._spline.controlPoints[controlPointIndex].x
        const y = this._spline.controlPoints[controlPointIndex].y
        const z = this._spline.controlPoints[controlPointIndex].z
        this._spline.setControlPointPosition(controlPointIndex, new Vector3d(x * w / z, y * w / z, w))
    }

    getControlPointWeight(controlPointIndex: number) {
        return this._spline.controlPoints[controlPointIndex].z
    }

    getDifferentialProperties() {
        return this._spline.getDifferentialProperties()
    }
}
