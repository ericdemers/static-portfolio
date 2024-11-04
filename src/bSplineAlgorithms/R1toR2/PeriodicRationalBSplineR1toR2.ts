import { Vector2d } from "../../mathVector/Vector2d";
import { Vector3d } from "../../mathVector/Vector3d";
import { PeriodicBSplineR1toR3 } from "../R1toR3/PeriodicBSplineR1toR3";


export class PeriodicRationalBSplineR1toR2 {

    private readonly spline: PeriodicBSplineR1toR3

    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: readonly Vector3d[] = [new Vector3d(0, 0, 1)], knots: readonly number[] = [0, 1]) {
        this.spline = new PeriodicBSplineR1toR3(controlPoints, knots)
    }

    get controlPoints(): Vector3d[] {
        return this.spline.controlPoints
    }

    get degree() : number {
        return this.spline.degree
    }

    get knots() : number[] {
        return this.spline.knots
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

    setControlPointPosition(index: number, value: Vector3d) {
        const s = this.spline.setControlPointPosition(index, value)
        return new PeriodicRationalBSplineR1toR2(s.controlPoints, s.knots)
    }

    getControlPointWeight(controlPointIndex: number) {
        return this.controlPoints[controlPointIndex].z
    }


}