/**
 * Represents a two-dimensional vector.
 * This class provides immutable operations on 2D vectors.
 */
export class Vector2d {
    /**
     * Creates a new Vector2d instance.
     * @param x The x-coordinate of the vector. Defaults to 0.
     * @param y The y-coordinate of the vector. Defaults to 0.
     */
    constructor(public readonly x = 0, public readonly y = 0) {}

    /**
     * Creates a Vector2d from x and y coordinates.
     * This static method provides an alternative to the constructor.
     * @param x The x-coordinate of the vector.
     * @param y The y-coordinate of the vector.
     * @returns A new Vector2d instance.
     */
    static from(x: number, y: number): Vector2d {
        return new Vector2d(x, y);
    }

    /**
     * Creates a zero vector (0, 0).
     * @returns A new Vector2d instance representing the zero vector.
     */
    static zero(): Vector2d {
        return new Vector2d(0, 0);
    }

    /**
     * Returns the negative of this vector.
     * @returns A new Vector2d instance with negated coordinates.
     */
    negative(): Vector2d {
        return new Vector2d(-this.x, -this.y);
    }

    /**
     * Adds another vector to this vector.
     * @param v The vector to add.
     * @returns A new Vector2d instance representing the sum.
     */
    add(v: Vector2d): Vector2d;
    /**
     * Adds x and y components to this vector.
     * @param x The x component to add.
     * @param y The y component to add.
     * @returns A new Vector2d instance representing the sum.
     */
    add(x: number, y: number): Vector2d;
    add(xOrVector: number | Vector2d, y?: number): Vector2d {
        if (xOrVector instanceof Vector2d) {
            return new Vector2d(this.x + xOrVector.x, this.y + xOrVector.y);
        }
        return new Vector2d(this.x + xOrVector, this.y + (y ?? 0));
    }

    /**
     * Multiplies this vector by a scalar value.
     * @param value The scalar to multiply by.
     * @returns A new Vector2d instance representing the product.
     */
    multiply(value: number): Vector2d {
        return new Vector2d(this.x * value, this.y * value);
    }

    /**
     * Subtracts another vector from this vector.
     * @param v The vector to subtract.
     * @returns A new Vector2d instance representing the difference.
     */
    subtract(v: Vector2d): Vector2d {
        return new Vector2d(this.x - v.x, this.y - v.y);
    }

    /**
     * Rotates this vector 90 degrees counterclockwise.
     * @returns A new Vector2d instance representing the rotated vector.
     */
    rotate90degrees(): Vector2d {
        return new Vector2d(-this.y, this.x);
    }
    
    /**
     * Normalizes this vector (makes it a unit vector).
     * @returns A new Vector2d instance representing the normalized vector.
     * @throws Error if the vector is a zero vector.
     */
    normalize(): Vector2d {
        const norm = this.norm();
        if (norm === 0) {
            throw new Error("Cannot normalize a zero vector");
        }
        return new Vector2d(this.x / norm, this.y / norm);
    }

    /**
     * Calculates the dot product of this vector with another vector.
     * @param v The other vector.
     * @returns The dot product.
     */
    dot(v: Vector2d): number {
        return this.x * v.x + this.y * v.y;
    }

    /**
     * Calculates the Euclidean distance between this vector and another vector.
     * @param v The other vector.
     * @returns The distance between the two vectors.
     */
    distance(v: Vector2d): number {
        return Math.sqrt(Math.pow(this.x - v.x, 2) + Math.pow(this.y - v.y, 2));
    }

    /**
     * Calculates the Euclidean norm (magnitude) of this vector.
     * @returns The norm of the vector.
     */
    norm(): number {
        return Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
    }

    /**
     * Creates a new Vector2d instance with the same coordinates.
     * @returns A new Vector2d instance.
     */
    clone(): Vector2d {
        return new Vector2d(this.x, this.y);
    }

    /**
     * Performs linear interpolation between this vector and another vector.
     * @param v The other vector.
     * @param t The interpolation parameter (0 <= t <= 1).
     * @returns A new Vector2d instance representing the interpolated vector.
     */
    lerp(v: Vector2d, t: number): Vector2d {
        return new Vector2d(
            this.x + (v.x - this.x) * t,
            this.y + (v.y - this.y) * t
        );
    }

    /**
     * Checks if this vector is equal to another vector within a given epsilon.
     * @param v The other vector.
     * @param epsilon The maximum allowed difference. Defaults to 1e-10.
     * @returns True if the vectors are equal within the epsilon, false otherwise.
     */
    equals(v: Vector2d, epsilon = 1e-10): boolean {
        return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
    }

    /**
     * Returns a string representation of this vector.
     * @returns A string in the format "Vector2d(x, y)".
     */
    toString(): string {
        return `Vector2d(${this.x}, ${this.y})`;
    }
}

/**
 * Scales an array of vectors by a given factor.
 * @param factor The scaling factor.
 * @param v The array of vectors to scale.
 * @returns A new array of scaled vectors.
 */
export function scale(factor: number, v: Vector2d[]): Vector2d[] {
    return v.map(element => element.multiply(factor));
}

/**
 * Scales the x-coordinates of an array of vectors by a given factor.
 * @param factor The scaling factor for x-coordinates.
 * @param v The array of vectors to scale.
 * @returns A new array of vectors with scaled x-coordinates.
 */
export function scaleX(factor: number, v: Vector2d[]): Vector2d[] {
    return v.map(element => new Vector2d(element.x * factor, element.y));
}

/**
 * Scales the y-coordinates of an array of vectors by a given factor.
 * @param factor The scaling factor for y-coordinates.
 * @param v The array of vectors to scale.
 * @returns A new array of vectors with scaled y-coordinates.
 */
export function scaleY(factor: number, v: Vector2d[]): Vector2d[] {
    return v.map(element => new Vector2d(element.x, element.y * factor));
}
