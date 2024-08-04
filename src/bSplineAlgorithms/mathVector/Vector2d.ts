/**
 * A two dimensional vector
 */

export class Vector2d {

    constructor(public x = 0, public y = 0) {
    }

    negative()  {
        return new Vector2d(-this.x, -this.y)
    }

    add(v: Vector2d) {
        return new Vector2d(this.x+v.x, this.y+v.y)
    }

    multiply(value: number) {
        return new Vector2d(this.x*value, this.y*value)
    }

    subtract(v: Vector2d) {
        return new Vector2d(this.x - v.x, this.y - v.y)
    }

    rotate90degrees() {
        return new Vector2d(-this.y, this.x)
    }
    
    normalize() {
        let norm = Math.sqrt(this.x * this.x + this.y * this.y)
        let x = this.x / norm
        let y = this.y / norm
        return new Vector2d(x, y)
    }

    dot(v: Vector2d) {
        return this.x * v.x + this.y * v.y
    }

    distance(v: Vector2d) {
        return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2))
    }

    norm() {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2))
    }

    clone() {
        return new Vector2d(this.x, this.y)
    }

}

export function scale(factor: number, v: Vector2d[]) {
    let result: Vector2d[] = []
    v.forEach(element => {
        result.push(element.multiply(factor))
    })
    return result
}

export function scaleX(factor: number, v: Vector2d[]) {
    let result: Vector2d[] = []
    v.forEach(element => {
        v.push(new Vector2d(element.x * factor, element.y))
    })
    return result
}

export function scaleY(factor: number, v: Vector2d[]) {
    let result: Vector2d[] = []
    v.forEach(element => {
        v.push(new Vector2d(element.x, element.y * factor))
    })
    return result
}

