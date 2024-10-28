/**
 * Represents a complex number.
 */
export type Complex = {
    x: number;  // Real part
    y: number;  // Imaginary part
}

/**
 * Represents a two-dimensional complex vector.
 */
export class Complex2d {
    /**
     * Creates a new Complex2d instance.
     * @param c0 The first complex component.
     * @param c1 The second complex component.
     */
    constructor(public readonly c0: Complex, public readonly c1: Complex) {}

    /**
     * Creates a Complex2d from real and imaginary parts.
     * @param x0 Real part of the first component.
     * @param y0 Imaginary part of the first component.
     * @param x1 Real part of the second component.
     * @param y1 Imaginary part of the second component.
     * @returns A new Complex2d instance.
     */
    static from(x0: number, y0: number, x1: number, y1: number): Complex2d {
        return new Complex2d({x: x0, y: y0}, {x: x1, y: y1});
    }

    /**
     * Creates a zero Complex2d (0+0i, 0+0i).
     * @returns A new Complex2d instance representing zero.
     */
    static zero(): Complex2d {
        return new Complex2d({x: 0, y: 0}, {x: 0, y: 0});
    }

    /**
     * Returns the negative of this complex vector.
     * @returns A new Complex2d instance with negated components.
     */
    negative(): Complex2d {
        return new Complex2d(negative(this.c0), negative(this.c1));
    }

    /**
     * Adds another complex vector to this one.
     * @param v The complex vector to add.
     * @returns A new Complex2d instance representing the sum.
     */
    add(v: Complex2d): Complex2d {
        return new Complex2d(cadd(this.c0, v.c0), cadd(this.c1, v.c1));
    }

    /**
     * Multiplies this complex vector by a complex number.
     * @param value The complex number to multiply by.
     * @returns A new Complex2d instance representing the product.
     */
    multiply(value: Complex): Complex2d {
        return new Complex2d(cmult(this.c0, value), cmult(this.c1, value));
    }

    /**
     * Multiplies this complex vector by a scalar.
     * @param value The scalar to multiply by.
     * @returns A new Complex2d instance representing the product.
     */
    multiplyScalar(value: number): Complex2d {
        return new Complex2d(cX(this.c0, value), cX(this.c1, value));
    }

    /**
     * Subtracts another complex vector from this one.
     * @param v The complex vector to subtract.
     * @returns A new Complex2d instance representing the difference.
     */
    subtract(v: Complex2d): Complex2d {
        return new Complex2d(csub(this.c0, v.c0), csub(this.c1, v.c1));
    }
    
    /**
     * Converts this complex vector to a complex number by division.
     * @returns A new Complex representing c0 / c1.
     * @throws Error if c1 is zero.
     */
    toComplexNumber(): Complex {
        if (this.c1.x === 0 && this.c1.y === 0) {
            throw new Error("Division by zero");
        }
        return cdiv(this.c0, this.c1);
    }

    /**
     * Creates a new Complex2d instance with the same components.
     * @returns A new Complex2d instance.
     */
    clone(): Complex2d {
        return new Complex2d({...this.c0}, {...this.c1});
    }

    /**
     * Calculates the magnitude (norm) of this complex vector.
     * @returns The magnitude of the complex vector.
     */
    magnitude(): number {
        return Math.sqrt(cnorm(this.c0) ** 2 + cnorm(this.c1) ** 2);
    }

    /**
     * Normalizes this complex vector.
     * @returns A new Complex2d instance representing the normalized vector.
     * @throws Error if the vector has zero magnitude.
     */
    normalize(): Complex2d {
        const mag = this.magnitude();
        if (mag === 0) {
            throw new Error("Cannot normalize a zero vector");
        }
        return this.multiplyScalar(1 / mag);
    }

    /**
     * Checks if this complex vector is equal to another within a given epsilon.
     * @param v The other complex vector.
     * @param epsilon The maximum allowed difference. Defaults to 1e-10.
     * @returns True if the vectors are equal within the epsilon, false otherwise.
     */
    equals(v: Complex2d, epsilon = 1e-10): boolean {
        return Math.abs(this.c0.x - v.c0.x) < epsilon &&
               Math.abs(this.c0.y - v.c0.y) < epsilon &&
               Math.abs(this.c1.x - v.c1.x) < epsilon &&
               Math.abs(this.c1.y - v.c1.y) < epsilon;
    }

    /**
     * Returns a string representation of this complex vector.
     * @returns A string in the format "Complex2d((a+bi), (c+di))".
     */
    toString(): string {
        return `Complex2d((${this.c0.x}${this.c0.y >= 0 ? '+' : ''}${this.c0.y}i), (${this.c1.x}${this.c1.y >= 0 ? '+' : ''}${this.c1.y}i))`;
    }
}

/**
 * Returns the negative of a complex number.
 * @param c The complex number.
 * @returns A new Complex representing the negative.
 */
export function negative(c: Complex): Complex {
    return {x: -c.x, y: -c.y};
}

/**
 * Calculates the norm (magnitude) of a complex number.
 * @param p The complex number.
 * @returns The norm of the complex number.
 */
export function cnorm(p: Complex): number {
    return Math.sqrt(p.x * p.x + p.y * p.y);
}

/**
 * Adds two complex numbers.
 * @param p1 The first complex number.
 * @param p2 The second complex number.
 * @returns A new Complex representing the sum.
 */
export function cadd(p1: Complex, p2: Complex): Complex {
    return {x: p1.x + p2.x, y: p1.y + p2.y};
}

/**
 * Subtracts one complex number from another.
 * @param p1 The complex number to subtract from.
 * @param p2 The complex number to subtract.
 * @returns A new Complex representing the difference.
 */
export function csub(p1: Complex, p2: Complex): Complex {
    return {x: p1.x - p2.x, y: p1.y - p2.y};
}

/**
 * Multiplies two complex numbers.
 * @param p1 The first complex number.
 * @param p2 The second complex number.
 * @returns A new Complex representing the product.
 */
export function cmult(p1: Complex, p2: Complex): Complex {
    return {x: p1.x * p2.x - p1.y * p2.y, y: p1.x * p2.y + p1.y * p2.x};
}

/**
 * Divides one complex number by another.
 * @param p1 The numerator complex number.
 * @param p2 The denominator complex number.
 * @returns A new Complex representing the quotient.
 * @throws Error if the denominator is zero.
 */
export function cdiv(p1: Complex, p2: Complex): Complex {
    const l2 = p2.x * p2.x + p2.y * p2.y;
    if (l2 === 0) {
        throw new Error("Division by zero");
    }
    return {x: (p1.x * p2.x + p1.y * p2.y) / l2, y: (p2.x * p1.y - p2.y * p1.x) / l2};
}

/**
 * Multiplies a complex number by a scalar.
 * @param p The complex number.
 * @param scalar The scalar value.
 * @returns A new Complex representing the product.
 */
export function cX(p: Complex, scalar: number): Complex {
    return {x: p.x * scalar, y: p.y * scalar};
}
