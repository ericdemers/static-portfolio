import { type Curve, CurveType } from "./curveTypes"

export function computeDegree(curve: Curve) {
    if ('degree' in curve ) {
        return curve.degree
    }
    switch (curve.type) {
        case CurveType.NonRational :
            return curve.knots.length - curve.points.length - 1
        case CurveType.Rational :
        case CurveType.Complex : 
            return curve.knots.length - curve.points.length + (curve.points.length - 1) / 2 - 1
    }
}