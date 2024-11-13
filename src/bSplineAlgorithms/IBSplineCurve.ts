type Point2D = [number, number];


export interface IBSplineCurve2D {

    readonly knots: number[]

    readonly degree: number

    readonly controlPoints: Point2D[]

    evaluate(u: number): Point2D

}