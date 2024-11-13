// core.ts

export type Real = number;

export class Vector {
    constructor(public coordinates: Real[]) {}

    static zero(dimension: number): Vector {
        return new Vector(new Array(dimension).fill(0));
    }

    add(other: Vector): Vector {
        return new Vector(this.coordinates.map((v, i) => v + other.coordinates[i]));
    }

    scale(scalar: Real): Vector {
    return new Vector(this.coordinates.map(v => v * scalar));
    }

    // Add more vector operations as needed
}

export class Point {
    constructor(public coordinates: Real[]) {}

    static origin(dimension: number): Point {
        return new Point(new Array(dimension).fill(0));
    }

    toVector(): Vector {
        return new Vector(this.coordinates);
    }

    // Add more point operations as needed
}

export class KnotVector {
    constructor(public knots: Real[]) {}

    findSpan(u: Real, degree: number): number {
        // Implement knot span finding algorithm
        // This is crucial for efficient B-spline evaluation
    }

    // Add methods for knot insertion, removal, etc.
}

export class BSplineBasis {
    constructor(public degree: number, public knots: KnotVector) {}

    evaluate(i: number, p: number, u: Real): Real {
        // Implement Cox-de Boor recursion formula
        // This is the core of B-spline basis function evaluation
    }

    // Add methods for basis function derivatives, etc.
}

export class BSplineCurve {
    constructor(
        public controlPoints: Point[],
        public degree: number,
        public knots: KnotVector
    ) {}

    evaluate(u: Real): Point {
        const basis = new BSplineBasis(this.degree, this.knots);
        const span = this.knots.findSpan(u, this.degree);
        
        let point = Point.origin(this.controlPoints[0].coordinates.length);
        for (let i = 0; i <= this.degree; i++) {
            const basisValue = basis.evaluate(span - this.degree + i, this.degree, u);
            point = point.toVector().add(this.controlPoints[span - this.degree + i].toVector().scale(basisValue)).toVector().toPoint();
        }
        return point;
    }

    // Add methods for derivatives, splitting, degree elevation, etc.
}

// pyramid.ts

export class PyramidScheme<T> {
    private pyramid: T[][];

    constructor(baseLevel: T[]) {
        this.pyramid = [baseLevel];
    }

    build(combineFunc: (a: T, b: T) => T): void {
        let currentLevel = this.pyramid[0];
        while (currentLevel.length > 1) {
            const nextLevel: T[] = [];
            for (let i = 0; i < currentLevel.length - 1; i++) {
                nextLevel.push(combineFunc(currentLevel[i], currentLevel[i + 1]));
            }
            this.pyramid.push(nextLevel);
            currentLevel = nextLevel;
        }
    }

    evaluate(t: Real): T {
        let result = this.pyramid[this.pyramid.length - 1][0];
        for (let i = this.pyramid.length - 2; i >= 0; i--) {
            const level = this.pyramid[i];
            const index = Math.floor(t * level.length);
            t = (t * level.length) % 1;
            result = this.interpolate(level[index], level[index + 1], t);
        }
        return result;
    }

    private interpolate(a: T, b: T, t: Real): T {
        // Implement interpolation based on the type T
        // For points, this would be linear interpolation
        // For more complex types, this might involve more sophisticated blending
        throw new Error("Interpolation not implemented for this type");
    }
}

// algorithms.ts

export class Algorithms {
    static deCasteljau(points: Point[], t: Real): Point {
        const pyramid = new PyramidScheme<Point>(points);
        pyramid.build((a, b) => new Point(a.coordinates.map((v, i) => (1 - t) * v + t * b.coordinates[i])));
        return pyramid.evaluate(0); // We only need the top of the pyramid for de Casteljau
    }

    static blossom(points: Point[], knots: KnotVector, u: Real[]): Point {
        // Implement multi-affine polar form (blossom) using pyramid scheme
        // This is a powerful generalization that can be used for many spline operations
    }

    // Implement other algorithms (knot insertion, subdivision, etc.) using the pyramid scheme
}

// nurbs.ts

export class RationalBSplineCurve extends BSplineCurve {
    constructor(
        controlPoints: Point[],
        degree: number,
        knots: KnotVector,
        public weights: Real[]
    ) {
        super(controlPoints, degree, knots);
    }

    evaluate(u: Real): Point {
        // Implement NURBS evaluation using homogeneous coordinates and the pyramid scheme
    }

    // Add methods specific to rational curves
}

// Example usage

const controlPoints = [
    new Point([0, 0]),
    new Point([1, 1]),
    new Point([2, -1]),
    new Point([3, 0])
];
const knots = new KnotVector([0, 0, 0, 0, 1, 1, 1, 1]);
const curve = new BSplineCurve(controlPoints, 3, knots);

const point = curve.evaluate(0.5);
console.log(`Point at u=0.5: (${point.coordinates.join(', ')})`);

const deCasteljauPoint = Algorithms.deCasteljau(controlPoints, 0.5);
console.log(`De Casteljau at t=0.5: (${deCasteljauPoint.coordinates.join(', ')})`);


// complex.ts

export class Complex {
    constructor(public real: Real, public imag: Real) {}

    static zero(): Complex {
        return new Complex(0, 0);
    }

    add(other: Complex): Complex {
        return new Complex(this.real + other.real, this.imag + other.imag);
    }

    multiply(other: Complex): Complex {
        return new Complex(
            this.real * other.real - this.imag * other.imag,
            this.real * other.imag + this.imag * other.real
        );
    }

    scale(scalar: Real): Complex {
        return new Complex(this.real * scalar, this.imag * scalar);
    }
}


//2. Now, let's modify our Point and Vector classes to support complex coordinates:

export class ComplexVector {
    constructor(public coordinates: Complex[]) {}

    static zero(dimension: number): ComplexVector {
        return new ComplexVector(new Array(dimension).fill(Complex.zero()));
    }

    add(other: ComplexVector): ComplexVector {
        return new ComplexVector(this.coordinates.map((v, i) => v.add(other.coordinates[i])));
    }

    scale(scalar: Complex): ComplexVector {
        return new ComplexVector(this.coordinates.map(v => v.multiply(scalar)));
    }

    // Add more vector operations as needed
}

export class ComplexPoint {
    constructor(public coordinates: Complex[]) {}

    static origin(dimension: number): ComplexPoint {
        return new ComplexPoint(new Array(dimension).fill(Complex.zero()));
    }

    toVector(): ComplexVector {
        return new ComplexVector(this.coordinates);
    }

    // Add more point operations as needed
}

// algorithms.ts

export class Algorithms2 {
    // ... existing methods ...

    static complexDeCasteljau(points: ComplexPoint[], weights: Complex[], t: Real): ComplexPoint {
        const pyramid = new PyramidScheme<ComplexPoint>(points);
        pyramid.build((a, b, i) => {
            const w1 = weights[i];
            const w2 = weights[i + 1];
            const totalWeight = w1.scale(1 - t).add(w2.scale(t));
            return new ComplexPoint(
                a.coordinates.map((v, j) => 
                    v.multiply(w1).scale(1 - t).add(b.coordinates[j].multiply(w2).scale(t)).divide(totalWeight)
                )
            );
        });
        return pyramid.evaluate(0);
    }

    static complexBlossom(points: ComplexPoint[], weights: Complex[], knots: KnotVector, u: Real[]): ComplexPoint {
        // Implement complex multi-affine polar form (blossom) using pyramid scheme
    }

    // Implement other algorithms for complex rational B-splines
}

// complexRationalBSpline.ts

export class ComplexRationalBSplineCurve {
    constructor(
        public controlPoints: ComplexPoint[],
        public weights: Complex[],
        public degree: number,
        public knots: KnotVector
    ) {}

    evaluate(u: Real): ComplexPoint {
        const basis = new BSplineBasis(this.degree, this.knots);
        const span = this.knots.findSpan(u, this.degree);
        
        let numerator = ComplexPoint.origin(this.controlPoints[0].coordinates.length);
        let denominator = Complex.zero();

        for (let i = 0; i <= this.degree; i++) {
            const basisValue = basis.evaluate(span - this.degree + i, this.degree, u);
            const weightedBasis = this.weights[span - this.degree + i].scale(basisValue);
            
            numerator = numerator.toVector().add(
                this.controlPoints[span - this.degree + i].toVector().scale(weightedBasis)
            ).toVector().toPoint();
            
            denominator = denominator.add(weightedBasis);
        }

        // Perform the rational division
        return new ComplexPoint(
            numerator.coordinates.map(coord => coord.divide(denominator))
        );
    }

    // Add methods for derivatives, splitting, degree elevation, etc.
}


// farinPoint.ts

export class FarinPoint {
    constructor(
        public controlPoint: ComplexPoint,
        public weight: Complex
    ) {}

    static fromComplexPoint(point: ComplexPoint, weight: Complex): FarinPoint {
        return new FarinPoint(point, weight);
    }

    toComplexPoint(): ComplexPoint {
        return new ComplexPoint(
            this.controlPoint.coordinates.map(coord => coord.multiply(this.weight))
        );
    }
}

export class ComplexRationalBSplineCurveWithFarin extends ComplexRationalBSplineCurve {
    farinPoints: FarinPoint[];

    constructor(
        farinPoints: FarinPoint[],
        degree: number,
        knots: KnotVector
    ) {
        const controlPoints = farinPoints.map(fp => fp.controlPoint);
        const weights = farinPoints.map(fp => fp.weight);
        super(controlPoints, weights, degree, knots);
        this.farinPoints = farinPoints;
    }

    updateFarinPoint(index: number, newFarinPoint: FarinPoint): void {
        this.farinPoints[index] = newFarinPoint;
        this.controlPoints[index] = newFarinPoint.controlPoint;
        this.weights[index] = newFarinPoint.weight;
    }

    // Add methods for manipulating Farin points
}

// Example usage

const farinPoints = [
    FarinPoint.fromComplexPoint(new ComplexPoint([new Complex(0, 0)]), new Complex(1, 0)),
    FarinPoint.fromComplexPoint(new ComplexPoint([new Complex(1, 1)]), new Complex(0.5, 0.5)),
    FarinPoint.fromComplexPoint(new ComplexPoint([new Complex(2, -1)]), new Complex(1, -0.5)),
    FarinPoint.fromComplexPoint(new ComplexPoint([new Complex(3, 0)]), new Complex(1, 0))
];

const knots = new KnotVector([0, 0, 0, 0, 1, 1, 1, 1]);
const curve = new ComplexRationalBSplineCurveWithFarin(farinPoints, 3, knots);

const point = curve.evaluate(0.5);
console.log(`Point at u=0.5: (${point.coordinates.map(c => `${c.real}+${c.imag}i`).join(', ')})`);

// Manipulate a Farin point
curve.updateFarinPoint(1, FarinPoint.fromComplexPoint(new ComplexPoint([new Complex(1.5, 1.5)]), new Complex(0.7, 0.3)));

const newPoint = curve.evaluate(0.5);
console.log(`New point at u=0.5: (${newPoint.coordinates.map(c => `${c.real}+${c.imag}i`).join(', ')})`);


// core.ts (modifications and additions)

export class BSplineBasis {
    constructor(public degree: number, public knots: KnotVector) {}

    evaluate(i: number, p: number, u: Real): Real {
        // Implement Cox-de Boor recursion formula
    }

    // Add methods for basis function derivatives, etc.
}

export class BSplineCurve<T extends Vector> {
    constructor(
        public controlPoints: T[],
        public degree: number,
        public knots: KnotVector
    ) {}

    evaluate(u: Real): T {
        const basis = new BSplineBasis(this.degree, this.knots);
        const span = this.knots.findSpan(u, this.degree);
        
        let result = this.controlPoints[0].zero();
        for (let i = 0; i <= this.degree; i++) {
            const basisValue = basis.evaluate(span - this.degree + i, this.degree, u);
            result = result.add(this.controlPoints[span - this.degree + i].scale(basisValue));
        }
        return result;
    }

    insertKnot(u: Real, times: number = 1): BSplineCurve<T> {
        // Implement knot insertion algorithm
        // This will work for both rational and non-rational curves
    }

    // Other methods like degree elevation, splitting, etc.
}

// rationalBSpline.ts

export class RationalBSplineCurve {
    private homogeneousCurve: BSplineCurve<Vector>;

    constructor(
        controlPoints: Point[],
        weights: Real[],
        degree: number,
        knots: KnotVector
    ) {
        const homogeneousPoints = controlPoints.map((point, i) => 
            new Vector([...point.coordinates.map(c => c * weights[i]), weights[i]])
        );
        this.homogeneousCurve = new BSplineCurve(homogeneousPoints, degree, knots);
    }

    evaluate(u: Real): Point {
        const homogeneousPoint = this.homogeneousCurve.evaluate(u);
        const weight = homogeneousPoint.coordinates[homogeneousPoint.coordinates.length - 1];
        return new Point(homogeneousPoint.coordinates.slice(0, -1).map(c => c / weight));
    }

    insertKnot(u: Real, times: number = 1): RationalBSplineCurve {
        const newHomogeneousCurve = this.homogeneousCurve.insertKnot(u, times);
        return this.fromHomogeneousCurve(newHomogeneousCurve);
    }

    private static fromHomogeneousCurve(curve: BSplineCurve<Vector>): RationalBSplineCurve {
        const controlPoints = curve.controlPoints.map(p => 
            new Point(p.coordinates.slice(0, -1).map(c => c / p.coordinates[p.coordinates.length - 1]))
        );
        const weights = curve.controlPoints.map(p => p.coordinates[p.coordinates.length - 1]);
        return new RationalBSplineCurve(controlPoints, weights, curve.degree, curve.knots);
    }

    // Other methods that delegate to homogeneousCurve and then project back
}

// complexRationalBSpline.ts

export class ComplexRationalBSplineCurve {
    private realCurve: RationalBSplineCurve;

    constructor(
        controlPoints: ComplexPoint[],
        weights: Complex[],
        degree: number,
        knots: KnotVector
    ) {
        const realControlPoints = controlPoints.flatMap(p => 
            p.coordinates.flatMap(c => [c.real, c.imag])
        );
        const realWeights = weights.flatMap(w => [w.real, w.imag]);
        this.realCurve = new RationalBSplineCurve(
            realControlPoints.map(c => new Point([c])),
            realWeights,
            degree,
            knots
        );
    }

    evaluate(u: Real): ComplexPoint {
        const realPoint = this.realCurve.evaluate(u);
        const complexCoords = [];
        for (let i = 0; i < realPoint.coordinates.length; i += 2) {
            complexCoords.push(new Complex(realPoint.coordinates[i], realPoint.coordinates[i + 1]));
        }
        return new ComplexPoint(complexCoords);
    }

    insertKnot(u: Real, times: number = 1): ComplexRationalBSplineCurve {
        const newRealCurve = this.realCurve.insertKnot(u, times);
        return ComplexRationalBSplineCurve.fromRealCurve(newRealCurve);
    }

    private static fromRealCurve(curve: RationalBSplineCurve): ComplexRationalBSplineCurve {
        // Convert back from real representation to complex
        // This method would need to be implemented
    }

    // Other methods that delegate to realCurve and then convert back to complex
}



