import type { SquareMatrix } from "../linearAlgebra/SquareMatrix"
import type { Coordinates } from "./coordinates"

export enum ConstraintType {
    PositionConstraint,
    ContinuityConstraint,
    SymmetryConstraint,
    DifferentialConstraint,
}

export type Center = { point: Coordinates }
export type Line = { point0: Coordinates, point1: Coordinates }
export type Circle = {point: Coordinates, radius: number}


export type PositionConstraint = Readonly<{
    id: string,
    type: ConstraintType.PositionConstraint
    curveID: number
    controlPointIndex: number,
    on: Center | Line | Circle
}>

export type ContinuityConstraint = Readonly<{
    id: string,
    type: ConstraintType.ContinuityConstraint
    curveID: string | [string, string]
    controlPointIndex: number | [number, number]
    order: number,
}>

export enum TansformationMatrixType {
    Projective,
    Mobius,
    LieSphere
}

export type TransformationMatrix = Readonly<{
    type: TansformationMatrixType,
    matrix: SquareMatrix
}>

export type Symmetries = Readonly<{
    id: string,
    type : ConstraintType.SymmetryConstraint
    masterCurveID: string
    dependentCurveIDs: string[]
    matrices : TransformationMatrix[]
}>

export type DifferentialConstraint = Readonly<{
    id: string,
    type : ConstraintType.DifferentialConstraint
    curveID: string
    inflection: boolean
    curvatureExtrema: boolean
}>

export type Constraint = PositionConstraint | ContinuityConstraint | Symmetries | DifferentialConstraint