import type { Coordinates } from "../sketchElements/coordinates";
import { distanceSquare } from "../sketchElements/coordinates";

/**
 * Represents a complex number.
 */
export type Complex = {
    x: number;  // Real part
    y: number;  // Imaginary part
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
 * Calculates the argument (angle) of a complex number.
 * @param p The complex number.
 * @returns The argument of the complex number in radians, in the range [0, 2π).
 */
export function carg(p: Complex): number {
    const result = Math.atan2(p.y, p.x);
    return result >= 0 ? result : result + Math.PI * 2;
}

/**
 * Returns the complex conjugate of a complex number.
 * @param p The complex number.
 * @returns The complex conjugate.
 */
export function conjugate(p: Complex): Complex {
    return {x: p.x, y: -p.y};
}

/**
 * Adds two complex numbers.
 * @param p1 The first complex number.
 * @param p2 The second complex number.
 * @returns The sum of the two complex numbers.
 */
export function cadd(p1: Complex, p2: Complex): Complex {
    return {x: p1.x + p2.x, y: p1.y + p2.y};
}

/**
 * Subtracts one complex number from another.
 * @param p1 The complex number to subtract from.
 * @param p2 The complex number to subtract.
 * @returns The difference between the two complex numbers.
 */
export function csub(p1: Complex, p2: Complex): Complex {
    return {x: p1.x - p2.x, y: p1.y - p2.y};
}

/**
 * Multiplies two complex numbers.
 * @param p1 The first complex number.
 * @param p2 The second complex number.
 * @returns The product of the two complex numbers.
 */
export function cmult(p1: Complex, p2: Complex): Complex {
    return {x: p1.x * p2.x - p1.y * p2.y, y: p1.x * p2.y + p1.y * p2.x};
}

/**
 * Divides one complex number by another.
 * @param p1 The numerator complex number.
 * @param p2 The denominator complex number.
 * @returns The quotient of the two complex numbers.
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
 * @returns The product of the complex number and the scalar.
 */
export function cX(p: Complex, scalar: number): Complex {
    return {x: p.x * scalar, y: p.y * scalar};
}

/**
 * Represents a mass point in Grassmann space.
 */
export type MassePoint = {
    mP: Coordinates;
    m: number;
}

/**
 * Adds two mass points in Grassmann space.
 * @param p1 The first mass point.
 * @param p2 The second mass point.
 * @returns The sum of the two mass points.
 */
export function madd(p1: MassePoint, p2: MassePoint): MassePoint {
    return {
        mP: {x: p1.mP.x + p2.mP.x, y: p1.mP.y + p2.mP.y},
        m: p1.m + p2.m
    };
}

/**
 * Represents a complex mass point in Grassmann space.
 */
export type ComplexMassPoint = {
    mP: Complex;
    m: Complex;
}

/**
 * Adds two complex mass points in Grassmann space.
 * @param p1 The first complex mass point.
 * @param p2 The second complex mass point.
 * @returns The sum of the two complex mass points.
 */
export function cmadd(p1: ComplexMassPoint, p2: ComplexMassPoint): ComplexMassPoint {
    return {
        mP: cadd(p1.mP, p2.mP),
        m: cadd(p1.m, p2.m)
    };
}

/**
 * Multiplies a complex mass point by a scalar.
 * @param p The complex mass point.
 * @param scalar The scalar value.
 * @returns The product of the complex mass point and the scalar.
 */
export function cmX(p: ComplexMassPoint, scalar: number): ComplexMassPoint {
    return {
        mP: cX(p.mP, scalar),
        m: cX(p.m, scalar)
    };
}

/**
 * Converts a complex mass point to a complex number.
 * @param p The complex mass point.
 * @returns The complex number representation of the complex mass point.
 * @throws Error if the denominator is zero.
 */
export function cm2c(p: ComplexMassPoint): Complex {
    return cdiv(p.mP, p.m);
}

/**
 * Calculates the phi angle for complex rational Bézier curves.
 * @param z0 The start point.
 * @param z1 The end point.
 * @param q0 The control point.
 * @param epsilon The tolerance for zero comparison. Defaults to 1e-8.
 * @returns The phi angle in radians.
 */
export function cphi(z0: Complex, z1: Complex, q0: Complex, epsilon: number = 1e-8): number {
    const v0 = csub(q0, z0);
    const v1 = csub(z1, q0);
    const n0 = cnorm(v0);
    const n1 = cnorm(v1);
    if (n0 < epsilon || n1 < epsilon) return 0;
    return -Math.atan2(v0.x * v1.y - v0.y * v1.x, v0.x * v1.x + v0.y * v1.y);
}

/**
 * Calculates the average phi angle for a set of points.
 * @param points An array of complex numbers representing the points.
 * @returns The average phi angle in radians.
 */
export function averagePhi(points: Complex[]): number {
    if (points.length < 3) { return 0; }
    const z0 = points[0];
    const z1 = points[points.length - 1];
    const interiorPoints = points.slice(1, -1);
    const phis = interiorPoints.map(p => cphi(z0, z1, p));
    return average(phis);
}

/**
 * Calculates the weighted average phi angle for a set of points.
 * @param points An array of complex numbers representing the points.
 * @returns The weighted average phi angle in radians.
 */
export function weightedAveragePhi(points: Complex[]): number {
    if (points.length < 3) { return 0; }
    const z0 = points[0];
    const z1 = points[points.length - 1];
    const interiorPoints = points.slice(1, -1);
    const phis = interiorPoints.map(p => cphi(z0, z1, p));
    const weight = chordsSquare(z0, z1, interiorPoints);
    return weightedAverage(phis, weight);
}

/**
 * Calculates the squared distances between a set of points and two fixed points.
 * @param p0 The first fixed point.
 * @param p1 The second fixed point.
 * @param points An array of points to calculate distances from.
 * @returns An array of squared distances.
 */
export function chordsSquare(p0: Coordinates, p1: Coordinates, points: Coordinates[]): number[] {
    return points.map((p) => {
        return distanceSquare(p0, p) + distanceSquare(p1, p);
    });
}

/**
 * Calculates the average of an array of numbers.
 * @param ns An array of numbers.
 * @returns The average of the numbers.
 */
export function average(ns: number[]): number {
    return ns.reduce((a, b) => a + b, 0) / ns.length;
}

/**
 * Calculates the weighted average of an array of numbers.
 * @param ns An array of numbers.
 * @param weights An array of weights corresponding to the numbers.
 * @returns The weighted average of the numbers.
 */
export function weightedAverage(ns: number[], weights: number[]): number {
    const nsw = ns.map((v, i) => v * weights[i]);
    const sum = weights.reduce((a, b) => a + b, 0);
    return nsw.reduce((a, b) => a + b, 0) / sum;
}

/**
 * Calculates the positive angle in radians from the x-axis to a given point.
 * @param y The y-coordinate of the point.
 * @param x The x-coordinate of the point.
 * @returns The angle in radians, in the range [0, 2π).
 */
export function positiveAtan2(y: number, x: number): number {
    const angle = Math.atan2(y, x);
    return angle >= 0 ? angle : angle + 2 * Math.PI;
}
