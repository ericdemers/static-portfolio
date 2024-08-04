import type { Curve } from "./curveTypes"

export enum Rosette {
    Kaleidoscope, Gyration
}

export enum Frieze {
    Hop, Step, Jump, Sidle, SpinningHop, SpinningJump, SpinningSidle
} 

export enum Symmetry2D {
    Plane, Spherical, Hyperbolic
}

export enum PlanePatternOrbifoldSignature {
    '_*632', '_*442', '_*333', '_*2222', '_**',
    '_2*22', '_*x', '_4*2', '_3*3', '_22*', '_xx', 
    '_22x', '_632', '_442', '_333', '_2222', 'o'
}

export type Signature = number | PlanePatternOrbifoldSignature

export type Symmetry = {
    type: Rosette | Frieze | Symmetry2D,
    signature?: Signature
    origin: {x: number, y: number}
    orientation: {x: number, y: number}
}


