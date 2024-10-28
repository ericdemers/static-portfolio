/**
 * Represents a three-dimensional vector.
 */
export class Vector3d {
    /**
     * Creates a new Vector3d instance.
     * @param x The x-coordinate of the vector. Defaults to 0.
     * @param y The y-coordinate of the vector. Defaults to 0.
     * @param z The z-coordinate of the vector. Defaults to 0.
     */
    constructor(public readonly x = 0, public readonly y = 0, public readonly z = 0) {}

    /**
     * Creates a Vector3d from x, y, and z coordinates.
     * @param x The x-coordinate of the vector.
     * @param y The y-coordinate of the vector.
     * @param z The z-coordinate of the vector.
     * @returns A new Vector3d instance.
     */
    static from(x: number, y: number, z: number): Vector3d {
        return new Vector3d(x, y, z);
    }

    /**
     * Creates a zero vector (0, 0, 0).
     * @returns A new Vector3d instance representing the zero vector.
     */
    static zero(): Vector3d {
        return new Vector3d(0, 0, 0);
    }

    /**
     * Returns the negative of this vector.
     * @returns A new Vector3d instance with negated coordinates.
     */
    negative(): Vector3d {
        return new Vector3d(-this.x, -this.y, -this.z);
    }

    /**
     * Adds another vector to this vector.
     * @param v The vector to add.
     * @returns A new Vector3d instance representing the sum.
     */
    add(v: Vector3d): Vector3d {
        return new Vector3d(this.x + v.x, this.y + v.y, this.z + v.z);
    }

    /**
     * Multiplies this vector by a scalar value.
     * @param value The scalar to multiply by.
     * @returns A new Vector3d instance representing the product.
     */
    multiply(value: number): Vector3d {
        return new Vector3d(this.x * value, this.y * value, this.z * value);
    }

    /**
     * Subtracts another vector from this vector.
     * @param v The vector to subtract.
     * @returns A new Vector3d instance representing the difference.
     */
    subtract(v: Vector3d): Vector3d {
        return new Vector3d(this.x - v.x, this.y - v.y, this.z - v.z);
    }

    /**
     * Normalizes this vector (makes it a unit vector).
     * @returns A new Vector3d instance representing the normalized vector.
     * @throws Error if the vector is a zero vector.
     */
    normalize(): Vector3d {
        const norm = this.norm();
        if (norm === 0) {
            throw new Error("Cannot normalize a zero vector");
        }
        return new Vector3d(this.x / norm, this.y / norm, this.z / norm);
    }

    /**
     * Calculates the dot product of this vector with another vector.
     * @param v The other vector.
     * @returns The dot product.
     */
    dot(v: Vector3d): number {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    /**
     * Calculates the Euclidean distance between this vector and another vector.
     * @param v The other vector.
     * @returns The distance between the two vectors.
     */
    distance(v: Vector3d): number {
        return Math.sqrt(
            Math.pow(this.x - v.x, 2) + 
            Math.pow(this.y - v.y, 2) + 
            Math.pow(this.z - v.z, 2)
        );
    }

    /**
     * Calculates the Euclidean norm (magnitude) of this vector.
     * @returns The norm of the vector.
     */
    norm(): number {
        return Math.sqrt(
            Math.pow(this.x, 2) + 
            Math.pow(this.y, 2) + 
            Math.pow(this.z, 2)
        );
    }

    /**
     * Creates a new Vector3d instance with the same coordinates.
     * @returns A new Vector3d instance.
     */
    clone(): Vector3d {
        return new Vector3d(this.x, this.y, this.z);
    }

    /**
     * Calculates the cross product of this vector with another vector.
     * @param v The other vector.
     * @returns A new Vector3d instance representing the cross product.
     */
    crossProduct(v: Vector3d): Vector3d {
        return new Vector3d(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x
        );
    }

    /**
     * Rotates this vector around an axis by a given angle.
     * @param axis The axis of rotation (should be normalized).
     * @param angle The angle of rotation in radians.
     * @returns A new Vector3d instance representing the rotated vector.
     */
    axisAngleRotation(axis: Vector3d, angle: number): Vector3d {
        const k = axis.normalize();
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        const firstTerm = this.multiply(cosAngle);
        const secondTerm = k.crossProduct(this).multiply(sinAngle);
        const thirdTerm = k.multiply(k.dot(this) * (1 - cosAngle));

        return firstTerm.add(secondTerm).add(thirdTerm);
    }

    /**
     * Checks if this vector is equal to another vector within a given epsilon.
     * @param v The other vector.
     * @param epsilon The maximum allowed difference. Defaults to 1e-10.
     * @returns True if the vectors are equal within the epsilon, false otherwise.
     */
    equals(v: Vector3d, epsilon = 1e-10): boolean {
        return Math.abs(this.x - v.x) < epsilon &&
               Math.abs(this.y - v.y) < epsilon &&
               Math.abs(this.z - v.z) < epsilon;
    }

    /**
     * Returns a string representation of this vector.
     * @returns A string in the format "Vector3d(x, y, z)".
     */
    toString(): string {
        return `Vector3d(${this.x}, ${this.y}, ${this.z})`;
    }
}

/**
 * Calculates the distance between a point and a line in 3D space.
 * @param p0 The point.
 * @param p1 The first point on the line.
 * @param p2 The second point on the line.
 * @returns The shortest distance from the point to the line.
 */
export function pointLineDistance(p0: Vector3d, p1: Vector3d, p2: Vector3d): number {
    return p0.subtract(p1).crossProduct(p0.subtract(p2)).norm() / p2.subtract(p1).norm();
}

/**
 * Calculates the intersection point of a line and a plane in 3D space.
 * @param lineP1 The first point on the line.
 * @param lineP2 The second point on the line.
 * @param lookAtOrigin The look-at origin (defines the plane normal).
 * @param cameraPosition The camera position (a point on the plane).
 * @param objectCenter The object center (used to determine which side of the plane to use).
 * @returns The intersection point as a Vector3d.
 * @throws Error if the line is parallel to the plane.
 */
export function linePlaneIntersection(
    lineP1: Vector3d,
    lineP2: Vector3d,
    lookAtOrigin: Vector3d,
    cameraPosition: Vector3d,
    objectCenter: Vector3d
): Vector3d {
    const l = lineP2.subtract(lineP1);
    const n = lookAtOrigin.subtract(cameraPosition);
    const nn = n.normalize();
    const a = nn.dot(objectCenter.subtract(cameraPosition));
    const p0 = nn.multiply(a).add(cameraPosition);
    const denominator = l.dot(n);
    
    if (Math.abs(denominator) < 1e-10) {
        throw new Error("Line is parallel to the plane");
    }

    const d = p0.subtract(lineP1).dot(n) / denominator;
    return lineP1.add(l.multiply(d));
}
