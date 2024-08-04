/**
 * A two dimensional complex vector
 */

export class Complex2d {

    constructor(public c0: Complex, public c1: Complex) {
    }

    negative()  {
        return new Complex2d(negative(this.c0), negative(this.c1))
    }

    add(v: Complex2d) {
        return new Complex2d(cadd(this.c0, v.c0), cadd(this.c1, v.c1))
    }

    multiply(value: Complex) {
        return new Complex2d(cmult(this.c0, value), cmult(this.c1, value))
    }

    multiplyScalar(value: number) {
        return new Complex2d(cX(this.c0, value), cX(this.c1, value))
    }

    subtract(v: Complex2d) {
        return new Complex2d(csub(this.c0, v.c0), csub(this.c1, v.c1))
    }
    
    toComplexNumber() {
        return cdiv(this.c0, this.c1)
    }

    clone() {
        return new Complex2d(this.c0, this.c1)
    }

}


export type Complex = {
    x: number
    y: number
}

export function negative(c: Complex) {
    return {x: -c.x, y: -c.y}
}

export function cnorm(p: Complex) {
    return Math.sqrt(p.x * p.x + p.y * p.y)
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



