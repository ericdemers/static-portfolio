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
    //points: ReadonlyArray<Coordinates>
    points: Coordinates[]
    //knots: ReadonlyArray<number>
    knots: number[]
    pythagoreanHodograph?: PythagoreanHodograph
    closed?: Closed
    degree?: number
    constraintIDs? : string[]
    masterCurveID?: string
}



