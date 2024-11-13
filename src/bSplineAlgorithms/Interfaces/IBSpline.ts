// Type definitions
export type Point1D = number;
export type Point2D = [number, number];
export type Point3D = [number, number, number];
export type Point4D = [number, number, number, number];
export type Complex = [number, number];
export type Point = Point1D | Point2D | Point3D | Point4D | Complex;

export type Knot = number;
export type KnotVector = Knot[];
export type Weight = Point1D | Complex;


export type BSplineCurve<P extends Point> = {
    controlPoints: P[];
    knotVector: KnotVector;
    degree: number;
    weights?: Weight[];
};

export type BSplineSurface<P extends Point> = {
    controlPoints: P[][];
    knotVectorU: KnotVector;
    knotVectorV: KnotVector;
    degreeU: number;
    degreeV: number;
    weights?: Weight[][];
};

export type BSplineVolume<P extends Point> = {
    controlPoints: P[][][];
    knotVectorU: KnotVector;
    knotVectorV: KnotVector;
    knotVectorW: KnotVector;
    degreeU: number;
    degreeV: number;
    degreeW: number;
    weights?: Weight[][][];
};

// Factory functions for creating different types of B-splines
export function createBSplineCurve<P extends Point>(
    controlPoints: P[],
    knotVector: KnotVector,
    degree: number,
    weights?: Weight[]
): BSplineCurve<P> {
    return { controlPoints, knotVector, degree, weights };
}

const bSplineFunction = createBSplineCurve([1, 2, 3], [0, 1, 2, 3], 2, [1, 1, 1]);
const bSpline2DCurve = createBSplineCurve([[1, 2], [3, 4], [5, 6]], [0, 1, 2, 3], 2);
const bSpline2DRationalCurve = createBSplineCurve([[1, 2], [3, 4], [5, 6]], [0, 1, 2, 3], 2, [1, 1, 1]);
const bSpline2DComplexRationalCurve = createBSplineCurve([[1, 2], [3, 4], [5, 6]], [0, 1, 2, 3], 2, [[1, 0], [1, 0], [1, 0]]);
const bSpline3DCurve = createBSplineCurve([[1, 2, 3], [4, 5, 6], [7, 8 ,9]], [0, 1, 2, 3], 2);

// Evaluate point on a B-spline curve
function evaluateCurvePoint<P extends Point>(curve: BSplineCurve<P>, t: number): P {
    const n = curve.controlPoints.length - 1;
    const p = curve.degree;

    const dimension = (typeof curve.controlPoints[0] === 'number') ? 1 : curve.controlPoints[0].length;

    let point = Array(dimension).fill(0) as P;
    let weightSum = 0;

    for (let i = 0; i <= n; i++) {
        const basis = basisFunction(i, p, curve.knotVector, t);
        const weight = curve.weights ? curve.weights[i] : 1;
        weightSum += basis * weight;

        point = interpolatePoints(point, curve.controlPoints[i], basis * weight / weightSum);
    }

    return point;
}

function interpolatePoints<P extends Point>(p1: P, p2: P, t: number): P {
    if (typeof p1 === 'number' && typeof p2 === 'number') {
        return (p1 * (1 - t) + p2 * t) as P;
    } else {
        return (p1 as number[]).map((v, i) => v * (1 - t) + (p2 as number[])[i] * t) as P;
    }
}