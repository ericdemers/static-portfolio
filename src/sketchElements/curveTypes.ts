import type { Coordinates } from "./coordinates"

export enum CurveType {
    NonRational,
    Rational,
    Complex,
}

export enum PythagoreanHodograph {
    Primitive,
    General
}

export enum Closed {
    True
}

export type Curve = {
    id: string
    type: CurveType
    points: Coordinates[]
    knots: number[]
    pythagoreanHodograph?: PythagoreanHodograph
    closed?: Closed
    degree?: number
    period?: number
    constraintIDs? : string[]
    masterCurveID?: string
}

export type CurveData = {
    id: string
    type: CurveType
    controlPoints: Coordinates[]
    farinPoints?: Coordinates[]
    knots: number[]
    degree: number
    close: boolean
    period?: number // for close curves
    pythagoreanHodograph?: PythagoreanHodograph
}




