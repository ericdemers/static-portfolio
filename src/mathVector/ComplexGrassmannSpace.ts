
export type Complex = {
    x: number
    y: number
}

export function cnorm(p: Complex) {
    return Math.sqrt(p.x * p.x + p.y * p.y)
}

export function carg(p: Complex) {
    const result = Math.atan2(p.y, p.x)
    return result >= 0 ? result : result + Math.PI * 2
}

/**
 * Complex number addition
 */
export function cadd(p1: Complex, p2: Complex): Complex {
    return ({x: p1.x + p2.x, y: p1.y + p2.y})
}

/**
 * Complex number substraction
 */
export function csub(p1: Complex, p2: Complex): Complex {
    return ({x: p1.x - p2.x, y: p1.y - p2.y})
}

/**
 * Complex number multiplication
 */
export function cmult(p1: Complex, p2: Complex): Complex {
    return ({x: p1.x * p2.x - p1.y * p2.y, y: p1.x * p2.y + p1.y * p2.x})
}

/**
 * Complex number division
 */
export function cdiv(p1: Complex, p2: Complex): Complex {
    const l2 = p2.x * p2.x + p2.y * p2.y
    return {x: (p1.x * p2.x + p1.y * p2.y) / l2, y: (p2.x * p1.y - p2.y * p1.x) / l2}
}

/**
 * Complex number scalar multiplication
 */
export function cX(p: Complex, scalar: number): Complex {
    return ({x: p.x * scalar, y: p.y * scalar})
}

/**
 * Grassmann space
 */
export type MassePoint = {
    mP:{x: number, y: number}
    m: number 
}

/**
 * Mass point addition
 */
export function madd(p1: MassePoint, p2: MassePoint): MassePoint {
    return {mP: {x: p1.mP.x + p2.mP.x, y: p1.mP.y + p2.mP.y}, m: p1.m + p2.m }
}

export type ComplexMassPoint = {
    mP: Complex
    m: Complex
}

/**
 * Complex mass point addition
 */
export function cmadd(p1: ComplexMassPoint, p2: ComplexMassPoint) {
    return {mP: cadd(p1.mP, p2.mP), m: cadd(p1.m, p2.m) }
}

/**
 * Complex mass point multiplication by scalar
 */
export function cmX(p: ComplexMassPoint, scalar: number): ComplexMassPoint {
    return {mP: cX(p.mP, scalar), m: cX(p.m, scalar)}
}

/**
 * Complex mass point to complex number
 */
export function cm2c(p: ComplexMassPoint): Complex {
    return cdiv(p.mP, p.m)
} 

/**
 * Complex rational Bézier curves phi angle
 */
export function cphi(z0: Complex, z1: Complex, q0: Complex, epsilon: number=10e-8) {
    const v0 = csub(q0, z0)
    const v1 = csub(z1, q0)
    const n0 = cnorm(v0)
    const n1 = cnorm(v1)
    if (n0 < epsilon || n1 < epsilon) return 0
    //return Math.acos((v0.x * v1.x + v0.y * v1.y) / (n0 * n1))
    return -Math.atan2(v0.x * v1.y - v0.y * v1.x, v0.x * v1.x + v0.y * v1.y)
}

export function averagePhi(points: Complex[]) {
    if (points.length < 3) { return 0}
    const z0 = points[0]
    const z1 = points[points.length - 1]
    const interiorPoints = points.slice(1, -1)
    const phis = interiorPoints.map(p => cphi(z0, z1, p))
    return average(phis)
}


export function average(ns: number[]) {
    return ns.reduce((a, b) => a + b, 0) / ns.length
}






