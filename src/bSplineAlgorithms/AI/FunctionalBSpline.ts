// Type definitions

type Point1D = number;
type Point2D = [number, number];
type Point3D = [number, number, number];
type Point4D = [number, number, number, number];
type Complex = { re: number; im: number };
type Point = Point1D | Point2D | Point3D | Point4D | Complex;



type Knot = number;
type KnotVector = Knot[];

type Weight = number;


// Complex number operations
const complex = {
    create: (re: number, im: number = 0): Complex => ({ re, im }),
    add: (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im }),
    subtract: (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im }),
    multiply: (a: Complex, b: Complex): Complex => ({
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    }),
    divide: (a: Complex, b: Complex): Complex => {
        const denominator = b.re * b.re + b.im * b.im;
        return {
            re: (a.re * b.re + a.im * b.im) / denominator,
            im: (a.im * b.re - a.re * b.im) / denominator
        };
    },
    scale: (a: Complex, scalar: number): Complex => ({ re: a.re * scalar, im: a.im * scalar })
};

// Generic types for different B-spline structures

type BSplineCurve<P extends Point> = {
    controlPoints: P[];
    knotVector: KnotVector;
    degree: number;
    weights?: Weight[];
};


type BSplineSurface<P extends Point> = {
    controlPoints: P[][];
    knotVectorU: KnotVector;
    knotVectorV: KnotVector;
    degreeU: number;
    degreeV: number;
    weights?: Weight[][];
};

type BSplineVolume<P extends Point> = {
    controlPoints: P[][][];
    knotVectorU: KnotVector;
    knotVectorV: KnotVector;
    knotVectorW: KnotVector;
    degreeU: number;
    degreeV: number;
    degreeW: number;
    weights?: Weight[][][];
};


// Basis function (Cox-de Boor recursion formula)
function basisFunction(i: number, p: number, knots: KnotVector, t: number): number {
    if (p === 0) {
        return (t >= knots[i] && t < knots[i + 1]) ? 1 : 0;
    }

    const left = (t - knots[i]) / (knots[i + p] - knots[i]);
    const right = (knots[i + p + 1] - t) / (knots[i + p + 1] - knots[i + 1]);

    return (left * basisFunction(i, p - 1, knots, t)) +
           (right * basisFunction(i + 1, p - 1, knots, t));
}

// Helper function to interpolate points
/*
function interpolatePoints<P extends Point>(p1: P, p2: P, t: number): P {
    if (typeof p1 === 'number' && typeof p2 === 'number') {
        return (p1 * (1 - t) + p2 * t) as P;
    } else {
        return (p1 as number[]).map((v, i) => v * (1 - t) + (p2 as number[])[i] * t) as P;
    }
}


// Modify interpolatePoints to handle Complex
function interpolatePoints<P extends Point>(p1: P, p2: P, t: number): P {
    if (typeof p1 === 'number' && typeof p2 === 'number') {
        return (p1 * (1 - t) + p2 * t) as P;
    } else if ('re' in p1 && 're' in p2) {
        return complex.add(
            complex.scale(p1, 1 - t),
            complex.scale(p2, t)
        ) as P;
    } else {
        return (p1 as number[]).map((v, i) => v * (1 - t) + (p2 as number[])[i] * t) as P;
    }
}

// Evaluate point on a B-spline curve
function evaluateCurvePoint<P extends Point>(curve: BSplineCurve<P>, t: number): P {
    const n = curve.controlPoints.length - 1;
    const p = curve.degree;

    let point = Array(curve.controlPoints[0].length).fill(0) as P;
    let weightSum = 0;

    for (let i = 0; i <= n; i++) {
        const basis = basisFunction(i, p, curve.knotVector, t);
        const weight = curve.weights ? curve.weights[i] : 1;
        weightSum += basis * weight;

        point = interpolatePoints(point, curve.controlPoints[i], basis * weight / weightSum);
    }

    return point;
}



// Evaluate point on a B-spline surface
function evaluateSurfacePoint<P extends Point>(surface: BSplineSurface<P>, u: number, v: number): P {
    const m = surface.controlPoints.length - 1;
    const n = surface.controlPoints[0].length - 1;
    const p = surface.degreeU;
    const q = surface.degreeV;

    let point = Array(surface.controlPoints[0][0].length).fill(0) as P;
    let weightSum = 0;

    for (let i = 0; i <= m; i++) {
        for (let j = 0; j <= n; j++) {
            const basisU = basisFunction(i, p, surface.knotVectorU, u);
            const basisV = basisFunction(j, q, surface.knotVectorV, v);
            const weight = surface.weights ? surface.weights[i][j] : 1;
            const basisProduct = basisU * basisV * weight;
            weightSum += basisProduct;

            point = interpolatePoints(point, surface.controlPoints[i][j], basisProduct / weightSum);
        }
    }

    return point;
}

// Evaluate point in a B-spline volume
function evaluateVolumePoint<P extends Point>(volume: BSplineVolume<P>, u: number, v: number, w: number): P {
    const l = volume.controlPoints.length - 1;
    const m = volume.controlPoints[0].length - 1;
    const n = volume.controlPoints[0][0].length - 1;
    const p = volume.degreeU;
    const q = volume.degreeV;
    const r = volume.degreeW;

    let point = Array(volume.controlPoints[0][0][0].length).fill(0) as P;
    let weightSum = 0;

    for (let i = 0; i <= l; i++) {
        for (let j = 0; j <= m; j++) {
            for (let k = 0; k <= n; k++) {
                const basisU = basisFunction(i, p, volume.knotVectorU, u);
                const basisV = basisFunction(j, q, volume.knotVectorV, v);
                const basisW = basisFunction(k, r, volume.knotVectorW, w);
                const weight = volume.weights ? volume.weights[i][j][k] : 1;
                const basisProduct = basisU * basisV * basisW * weight;
                weightSum += basisProduct;

                point = interpolatePoints(point, volume.controlPoints[i][j][k], basisProduct / weightSum);
            }
        }
    }

    return point;
}

*/


// Factory functions for creating different types of B-splines
function createBSplineCurve<P extends Point>(
    controlPoints: P[],
    knotVector: KnotVector,
    degree: number,
    weights?: Weight[]
): BSplineCurve<P> {
    return { controlPoints, knotVector, degree, weights };
}

function createBSplineSurface<P extends Point>(
    controlPoints: P[][],
    knotVectorU: KnotVector,
    knotVectorV: KnotVector,
    degreeU: number,
    degreeV: number,
    weights?: Weight[][]
): BSplineSurface<P> {
    return { controlPoints, knotVectorU, knotVectorV, degreeU, degreeV, weights };
}

function createBSplineVolume<P extends Point>(
    controlPoints: P[][][],
    knotVectorU: KnotVector,
    knotVectorV: KnotVector,
    knotVectorW: KnotVector,
    degreeU: number,
    degreeV: number,
    degreeW: number,
    weights?: Weight[][][]
): BSplineVolume<P> {
    return { controlPoints, knotVectorU, knotVectorV, knotVectorW, degreeU, degreeV, degreeW, weights };
}

