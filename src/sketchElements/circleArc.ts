import type { ComplexMassPoint} from "../mathVector/ComplexGrassmannSpace";
import { cdiv, cm2c, cmadd, cmult, cmX, cphi, csub, type Complex } from "../mathVector/ComplexGrassmannSpace"
import { distance, distanceSquare, middlePoint, type Coordinates } from "./coordinates"


export type CircleArc = {
    z0: Complex
    z1: Complex
    q0: Complex
}

export function w1FromPhi(phi: number): Complex {
    return {x: Math.cos(phi), y: Math.sin(phi)}
}

export function w1FromCircleArc(c: CircleArc): Complex {
    return cdiv(csub(c.q0, c.z0), csub(c.z1, c.q0))
}

export function complexMassPointsFromCircleArc(c: CircleArc): {p0: ComplexMassPoint, p1: ComplexMassPoint} {
    const m1 = w1FromCircleArc(c)
    const m0 = {x: 1, y: 0} 
    return {p0: {mP: cmult(c.z0, m0), m: m0}, p1: {mP: cmult(c.z1, m1), m: m1}}
}

export function arcPoints(p0: ComplexMassPoint, p1: ComplexMassPoint, us: number[]): Complex[] {
    return us.map(u => cm2c(cmadd(cmX(p0, (1 - u)), cmX(p1, u))))
}

export function q0FromPhi(phi: number, z0: Complex, z1: Complex) {
    const w0: Complex = {x: 1, y: 0}
    const w1 = w1FromPhi(phi)
    const cm0: ComplexMassPoint = {mP: z0, m: w0}
    const cm1: ComplexMassPoint = {mP: cmult(w1, z1), m: w1}
    //return ( cdiv( cadd(z0, cmult(w1, z1) ), cadd(w0, w1) ) )
    return cm2c(cmadd(cm0, cm1))
}

export function arrayRange(start: number, stop: number, step: number): number[] {
    return Array.from({ length: (stop - start) / step + 1 },
        (value, index) => start + index * step)
}

export function circleArcFromThreePoints(p0: Coordinates, p1: Coordinates, p2: Coordinates) {
    //https://math.stackexchange.com/questions/213658/get-the-equation-of-a-circle-when-given-3-points
    const epsilon = 10e-8
    const a = p0.x * (p1.y - p2.y) - p0.y * (p1.x - p2.x) + p1.x * p2.y - p2.x * p1.y
    if (Math.abs(a)  < epsilon) {return null}
    const t0 = p0.x * p0.x + p0.y * p0.y
    const t1 = p1.x * p1.x + p1.y * p1.y
    const t2 = p2.x * p2.x + p2.y * p2.y
    const b = t0 * (p2.y - p1.y) +  t1 * (p0.y - p2.y) + t2 * (p1.y - p0.y)
    const c = t0 * (p1.x - p2.x) + t1 * (p2.x - p0.x) + t2 * (p0.x - p1.x)
    const d = t0 * (p2.x * p1.y - p1.x * p2.y) + t1 * (p0.x * p2.y - p2.x * p0.y) + t2 * (p1.x * p0.y - p0.x * p1.y)
    const xc = -b / (2 * a)
    const yc = -c / (2 * a)
    const r = Math.sqrt((b * b + c * c - 4 * a * d) / (4 * a * a) )
    const phi = cphi(p0, p1, p2)
    let counterclockwise = false
    if (phi < 0) {
        counterclockwise = true
    }
    const startAngle = Math.atan2(p0.y - yc, p0.x - xc)
    const endAngle = Math.atan2(p2.y - yc, p2.x - xc)
    return {xc: xc, yc: yc, r: r, startAngle: startAngle, endAngle: endAngle, counterclockwise: counterclockwise}
}

/*
export function longuestChord(p0: Coordinates, p1: Coordinates, points: Coordinates[]) {
    let index = Math.floor(points.length / 2)
    let maxChord = 0
    points.forEach((p, i) => {
        const chord = distanceSquare(p0, p) + distanceSquare(p1, p)
        if (chord > maxChord) {
            maxChord = chord
            index = i
        }
    })
    return index
}
    */



