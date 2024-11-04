/**
 * Represents a 2D point with x and y coordinates.
 */
export class Point {
    constructor(public x: number, public y: number) {}
}

/**
 * Implements a Non-Uniform B-Spline (NUBS) curve in 2D space.
 * This class allows for the creation and manipulation of B-spline curves
 * with either automatically generated uniform knots or custom knot vectors.
 */
export class NUBSpline {
    private controlPoints: Point[];
    private knots: number[];
    private degree: number;

    /**
     * Creates a new NUBSpline instance.
     * @param controlPoints An array of Point objects representing the control points of the curve.
     * @param degree The degree of the B-spline curve. Must be positive and less than the number of control points.
     * @param knots Optional. A custom knot vector. If not provided, a uniform knot vector will be generated.
     */
    constructor(controlPoints: Point[], degree: number, knots?: number[]) {
        this.controlPoints = controlPoints;
        this.degree = degree;

        if (knots) {
            this.knots = knots;
        } else {
            this.knots = this.generateUniformKnots();
        }
    }

    /**
     * Generates a uniform knot vector based on the number of control points and the degree of the curve.
     * @returns An array of numbers representing the uniform knot vector.
     */
    private generateUniformKnots(): number[] {
        const n = this.controlPoints.length;
        const m = n + this.degree + 1;
        const knots: number[] = [];

        for (let i = 0; i < m; i++) {
            if (i < this.degree + 1) {
                knots.push(0);
            } else if (i >= m - this.degree - 1) {
                knots.push(1);
            } else {
                knots.push((i - this.degree) / (n - this.degree));
            }
        }

        return knots;
    }

    
    

    /**
     * Calculates the basis function value for a given knot span and parameter.
     * This method implements the Cox-de Boor recursion formula for B-spline basis functions.
     * 
     * @param i The index of the knot span.
     * @param k The current degree of the basis function (1 <= k <= degree + 1).
     * @param t The parameter value (typically 0 <= t <= 1).
     * @returns The value of the basis function N_{i,k}(t).
     */
    private basisFunction(i: number, k: number, t: number): number {
        // Base case: degree 1 (constant function over knot span)
        if (k === 1) {
            // N_{i,1}(t) is 1 if t is in the i-th knot span, 0 otherwise
            return (t >= this.knots[i] && t < this.knots[i + 1]) ? 1 : 0;
        }
    
        // Recursive case: apply Cox-de Boor formula
        // N_{i,k}(t) = w1 * N_{i,k-1}(t) + w2 * N_{i+1,k-1}(t)
        let left = 0, right = 0;
        const denomLeft = this.knots[i + k - 1] - this.knots[i];
        const denomRight = this.knots[i + k] - this.knots[i + 1];
    
        // Calculate left term: w1 * N_{i,k-1}(t)
        if (denomLeft !== 0) {
            const w1 = (t - this.knots[i]) / denomLeft;
            left = w1 * this.basisFunction(i, k - 1, t);
        }
    
        // Calculate right term: w2 * N_{i+1,k-1}(t)
        if (denomRight !== 0) {
            const w2 = (this.knots[i + k] - t) / denomRight;
            right = w2 * this.basisFunction(i + 1, k - 1, t);
        }
    
        // The basis function is the sum of these two terms
        return left + right;
    }
    

    /**
     * Calculates a point on the B-spline curve for a given parameter value.
     * @param t The parameter value, typically between 0 and 1.
     * @returns A Point object representing the calculated point on the curve.
     */
    public getPoint(t: number): Point {
        let x = 0, y = 0;
        const n = this.controlPoints.length;

        for (let i = 0; i < n; i++) {
            const basis = this.basisFunction(i, this.degree + 1, t);
            x += basis * this.controlPoints[i].x;
            y += basis * this.controlPoints[i].y;
        }

        return new Point(x, y);
    }

    /**
     * Generates a series of points along the B-spline curve.
     * @param numPoints The number of points to generate.
     * @returns An array of Point objects representing the curve.
     */
    public getCurvePoints(numPoints: number): Point[] {
        const points: Point[] = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            points.push(this.getPoint(t));
        }
        return points;
    }
}

// Usage example:

/*
const controlPoints = [
    new Point(0, 0),
    new Point(1, 5),
    new Point(2, 0),
    new Point(3, 5),
    new Point(4, 0)
];

const degree = 3;
const nurbSpline = new NUBSpline(controlPoints, degree);
const curvePoints = nurbSpline.getCurvePoints(100);

console.log(curvePoints);
*/



/**
 * Implements a Non-Uniform B-Spline (NUBS) curve in 2D space.
 * This class allows for the creation and manipulation of B-spline curves
 * with either automatically generated uniform knots or custom knot vectors.
 */
class NUBSpline2 {
    private controlPoints: Point[];
    private knots: number[];
    private degree: number;
    private basisFunctionCache: number[][][] = [];


    /**
     * Creates a new NUBSpline instance.
     * @param controlPoints An array of Point objects representing the control points of the curve.
     * @param degree The degree of the B-spline curve. Must be positive and less than the number of control points.
     * @param knots Optional. A custom knot vector. If not provided, a uniform knot vector will be generated.
     */
    constructor(controlPoints: Point[], degree: number, knots?: number[]) {
        this.controlPoints = controlPoints;
        this.degree = degree;

        if (knots) {
            this.knots = knots;
        } else {
            this.knots = this.generateUniformKnots();
        }
    }

    /**
     * Generates a uniform knot vector based on the number of control points and the degree of the curve.
     * @returns An array of numbers representing the uniform knot vector.
     */
    private generateUniformKnots(): number[] {
        const n = this.controlPoints.length;
        const m = n + this.degree + 1;
        const knots: number[] = [];

        for (let i = 0; i < m; i++) {
            if (i < this.degree + 1) {
                knots.push(0);
            } else if (i >= m - this.degree - 1) {
                knots.push(1);
            } else {
                knots.push((i - this.degree) / (n - this.degree));
            }
        }

        return knots;
    }

    /**
     * Calculates all basis function values using dynamic programming.
     * @param t The parameter value (typically 0 <= t <= 1).
     */
    private calculateBasisFunctions(t: number): void {
        const n = this.knots.length - 1;
        const cache: number[][] = Array(n).fill(0).map(() => Array(this.degree + 2).fill(0));

        // Initialize degree 1 basis functions
        for (let i = 0; i < n; i++) {
            cache[i][1] = (t >= this.knots[i] && t < this.knots[i + 1]) ? 1 : 0;
        }

        // Build up to higher degree basis functions
        for (let k = 2; k <= this.degree + 1; k++) {
            for (let i = 0; i < n - k + 1; i++) {
                const denomLeft = this.knots[i + k - 1] - this.knots[i];
                const denomRight = this.knots[i + k] - this.knots[i + 1];

                let left = 0, right = 0;

                if (denomLeft !== 0) {
                    left = ((t - this.knots[i]) / denomLeft) * cache[i][k - 1];
                }

                if (denomRight !== 0) {
                    right = ((this.knots[i + k] - t) / denomRight)                }

                cache[i][k] = left + right;
            }
        }

        this.basisFunctionCache.push(cache);
    }

    /**
     * Retrieves the basis function value from the cache or calculates it if not available.
     * @param i The index of the knot span.
     * @param k The degree of the basis function.
     * @param t The parameter value.
     * @returns The value of the basis function N_{i,k}(t).
     */
    private basisFunction(i: number, k: number, t: number): number {
        const cacheIndex = this.basisFunctionCache.findIndex(cache => 
            Math.abs(cache[0][1] - t) < 1e-10);

        if (cacheIndex === -1) {
            this.calculateBasisFunctions(t);
            return this.basisFunctionCache[this.basisFunctionCache.length - 1][i][k];
        }

        return this.basisFunctionCache[cacheIndex][i][k];
    }


    /**
     * Calculates all basis function values using a functional programming approach.
     * @param t The parameter value (typically 0 <= t <= 1).
     * @returns A 2D array of basis function values.
     */
    private calculateBasisFunctions2(t: number): number[][] {
        const n = this.knots.length - 1;

        // Initialize degree 1 basis functions
        const initBasis = Array(n).fill(0).map((_, i) => 
            (t >= this.knots[i] && t < this.knots[i + 1]) ? 1 : 0
        );

        // Generate higher degree basis functions
        const higherDegreeBasis = Array(this.degree)
            .fill(null)
            .reduce((prev, _, k) => {
                const degree = k + 2; // Current degree (k starts from 0)
                return [
                    ...prev,
                    Array(n - degree + 1).fill(0).map((_, i) => {
                        const denomLeft = this.knots[i + degree - 1] - this.knots[i];
                        const denomRight = this.knots[i + degree] - this.knots[i + 1];

                        const left = denomLeft !== 0
                            ? ((t - this.knots[i]) / denomLeft) * prev[k][i]
                            : 0;

                        const right = denomRight !== 0
                            ? ((this.knots[i + degree] - t) / denomRight) * prev[k][i + 1]
                            : 0;

                        return left + right;
                    })
                ];
            }, [initBasis]);

        return [initBasis, ...higherDegreeBasis];
    }

    /**
     * Retrieves the basis function value from the cache or calculates it if not available.
     * @param i The index of the knot span.
     * @param k The degree of the basis function.
     * @param t The parameter value.
     * @returns The value of the basis function N_{i,k}(t).
     */
    private basisFunction2(i: number, k: number, t: number): number {
        const cacheIndex = this.basisFunctionCache.findIndex(cache => 
            Math.abs(cache[0][1] - t) < 1e-10);

        if (cacheIndex === -1) {
            const newCache = this.calculateBasisFunctions2(t);
            this.basisFunctionCache.push(newCache);
            return newCache[k - 1][i];
        }

        return this.basisFunctionCache[cacheIndex][k - 1][i];
    }


    /**
     * Inserts a new knot into the B-spline curve using Boehm's algorithm.
     * This method does not change the shape of the curve but increases its control.
     * 
     * @param u The parameter value of the new knot to insert (must be within the knot vector range).
     * @returns A new NUBSpline object with the inserted knot.
     */
    public insertKnot(u: number): NUBSpline {
        if (u < this.knots[0] || u > this.knots[this.knots.length - 1]) {
            throw new Error("New knot must be within the range of the existing knot vector.");
        }

        const n = this.controlPoints.length;
        const k = this.findKnotSpan(u);
        const newControlPoints: Point[] = [];
        const newKnots = [...this.knots];

        // Insert the new knot
        newKnots.splice(k + 1, 0, u);

        // Calculate new control points
        for (let i = 0; i <= n; i++) {
            if (i <= k - this.degree) {
                newControlPoints[i] = this.controlPoints[i];
            } else if (i > k) {
                newControlPoints[i] = this.controlPoints[i - 1];
            } else {
                const alpha = this.calculateAlpha(i, k, u);
                newControlPoints[i] = new Point(
                    (1 - alpha) * this.controlPoints[i - 1].x + alpha * this.controlPoints[i].x,
                    (1 - alpha) * this.controlPoints[i - 1].y + alpha * this.controlPoints[i].y
                );
            }
        }

        return new NUBSpline(newControlPoints, this.degree, newKnots);
    }

    /**
     * Finds the knot span index for a given parameter value.
     * @param u The parameter value.
     * @returns The index of the knot span containing u.
     */
    private findKnotSpan(u: number): number {
        const n = this.knots.length - 1;
        if (u >= this.knots[n]) return n - 1;
        if (u < this.knots[0]) return 0;

        let low = 0;
        let high = n;
        let mid = Math.floor((low + high) / 2);

        while (u < this.knots[mid] || u >= this.knots[mid + 1]) {
            if (u < this.knots[mid]) {
                high = mid;
            } else {
                low = mid;
            }
            mid = Math.floor((low + high) / 2);
        }

        return mid;
    }


    /**
     * Finds the knot span index for a given parameter value.
     * 
     * This method uses a binary search algorithm to efficiently locate the knot span
     * containing the given parameter value. It's crucial for many B-spline operations,
     * including curve evaluation and knot insertion.
     * 
     * Edge cases:
     * 1. If u is greater than or equal to the last knot, it returns the index of the
     *    second-to-last knot span. This ensures that the last segment of the curve
     *    is properly handled.
     * 2. If u is less than the first knot, it returns 0. This handles cases where the
     *    parameter might be slightly out of the expected range due to numerical precision.
     * 
     * @param u The parameter value to locate in the knot vector.
     * @returns The index i such that u is in the half-open interval [knots[i], knots[i+1]).
     * 
     * @throws {Error} If the knot vector is empty or invalid.
     */
    private findKnotSpan2(u: number): number {
        const n = this.knots.length - 1;

        // Edge case: u is at or beyond the end of the knot vector
        if (u >= this.knots[n]) return n - 1;

        // Edge case: u is before the start of the knot vector
        if (u < this.knots[0]) return 0;

        // Binary search
        let low = 0;
        let high = n;
        let mid = Math.floor((low + high) / 2);

        while (u < this.knots[mid] || u >= this.knots[mid + 1]) {
            if (u < this.knots[mid]) {
                high = mid;
            } else {
                low = mid;
            }
            mid = Math.floor((low + high) / 2);
        }

        return mid;
    }

    /**
 * Finds the knot span index for a given parameter value, handling repeated knots.
 * 
 * This method uses a modified binary search algorithm to efficiently locate the
 * knot span containing the given parameter value, even in the presence of repeated knots.
 * It's crucial for many B-spline operations, including curve evaluation and knot insertion.
 * 
 * Edge cases:
 * 1. If u is greater than or equal to the last knot, it returns the index of the
 *    last unique knot span.
 * 2. If u is less than or equal to the first knot, it returns the index of the
 *    first unique knot.
 * 3. For repeated interior knots, it returns the index of the last occurrence of
 *    the knot value less than or equal to u.
 * 
 * @param u The parameter value to locate in the knot vector.
 * @returns The index i such that knots[i] <= u < knots[i+1], 
 *          or the last unique knot index if u is at the end of the vector.
 * 
 * @throws {Error} If the knot vector is empty or invalid.
 */
private findKnotSpan3(u: number): number {
    if (this.knots.length === 0) {
        throw new Error("Knot vector is empty");
    }

    const n = this.knots.length - 1;

    // Edge case: u is at or beyond the end of the knot vector
    if (u >= this.knots[n]) {
        // Find the last unique knot
        for (let i = n - 1; i >= 0; i--) {
            if (this.knots[i] < this.knots[n]) {
                return i;
            }
        }
        return 0; // All knots are the same (degenerate case)
    }

    // Edge case: u is at or before the start of the knot vector
    if (u <= this.knots[0]) {
        return 0;
    }

    // Binary search
    let low = 0;
    let high = n;

    while (low < high) {
        let mid = Math.floor((low + high) / 2);

        if (u < this.knots[mid]) {
            high = mid;
        } else if (u > this.knots[mid]) {
            low = mid + 1;
        } else {
            // u is exactly equal to knots[mid]
            // Find the last occurrence of this knot value
            while (mid < n && this.knots[mid + 1] === u) {
                mid++;
            }
            return mid;
        }
    }

    // At this point, low == high and knots[low-1] <= u < knots[low]
    return low - 1;
}



    /**
     * Calculates the alpha value for Boehm's algorithm.
     * @param i The index of the control point.
     * @param k The knot span index.
     * @param u The parameter value of the new knot.
     * @returns The calculated alpha value.
     */
    private calculateAlpha(i: number, k: number, u: number): number {
        if (i <= k - this.degree + 1) {
            return (u - this.knots[i]) / (this.knots[i + this.degree] - this.knots[i]);
        }
        return (u - this.knots[i]) / (this.knots[i + this.degree - 1] - this.knots[i]);
    }

    /**
     * Calculates a point on the B-spline curve for a given parameter value.
     * @param t The parameter value, typically between 0 and 1.
     * @returns A Point object representing the calculated point on the curve.
     */
    public getPoint(t: number): Point {
        this.calculateBasisFunctions(t);
        let x = 0, y = 0;
        const n = this.controlPoints.length;

        for (let i = 0; i < n; i++) {
            const basis = this.basisFunction(i, this.degree + 1, t);
            x += basis * this.controlPoints[i].x;
            y += basis * this.controlPoints[i].y;
        }

        return new Point(x, y);
    }

    /**
     * Generates a series of points along the B-spline curve.
     * @param numPoints The number of points to generate.
     * @returns An array of Point objects representing the curve.
     */
    public getCurvePoints(numPoints: number): Point[] {
        const points: Point[] = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            points.push(this.getPoint(t));
        }
        return points;
    }

    /**
     * Creates a closed B-spline curve from the given control points.
     * 
     * @param controlPoints The original control points.
     * @param degree The degree of the B-spline curve.
     * @returns A new NUBSpline instance representing a closed curve.
     */
    public static createClosedCurve(controlPoints: Point[], degree: number): NUBSpline {
        if (controlPoints.length <= degree) {
            throw new Error("Number of control points must be greater than the degree for a closed curve.");
        }

        // Create periodic control points
        const periodicControlPoints = [
            ...controlPoints,
            ...controlPoints.slice(0, degree)
        ];

        // Create periodic knot vector
        const n = periodicControlPoints.length;
        const knots = Array(n + degree + 1).fill(0).map((_, i) => i);

        return new NUBSpline(periodicControlPoints, degree, knots);
    }

    /**
     * Evaluates a point on the closed B-spline curve, handling the periodic nature of the curve.
     * 
     * @param t The parameter value (0 <= t <= 1).
     * @returns A Point on the curve.
     */
    public getPointOnClosedCurve(t: number): Point {
        // Ensure t is within [0, 1]
        t = t - Math.floor(t);

        // Map t to the full parameter range
        const fullRangeT = t * (this.knots[this.knots.length - this.degree - 1] - this.knots[this.degree]);

        return this.getPoint(fullRangeT + this.knots[this.degree]);
    }


    /**
     * Creates a closed B-spline curve with a non-uniform knot vector.
     * 
     * @param controlPoints The original control points.
     * @param degree The degree of the B-spline curve.
     * @param knotSpacingFunction A function that determines the spacing between knots.
     * @returns A new NUBSpline instance representing a closed curve with a non-uniform knot vector.
     */
    public static createClosedCurveNonUniform(
        controlPoints: Point[], 
        degree: number, 
        knotSpacingFunction: (i: number, n: number) => number
    ): NUBSpline {
        if (controlPoints.length <= degree) {
            throw new Error("Number of control points must be greater than the degree for a closed curve.");
        }

        // Create periodic control points
        const periodicControlPoints = [
            ...controlPoints,
            ...controlPoints.slice(0, degree)
        ];

        const n = periodicControlPoints.length;

        // Create non-uniform knot vector
        const knots: number[] = [];
        let knotValue = 0;

        // Initial degree+1 knots
        for (let i = 0; i <= degree; i++) {
            knots.push(0);
        }

        // Interior knots
        for (let i = 1; i < n - degree; i++) {
            knotValue += knotSpacingFunction(i, n - degree - 1);
            knots.push(knotValue);
        }

        // Final degree+1 knots
        const maxKnotValue = knotValue;
        for (let i = 0; i <= degree; i++) {
            knots.push(maxKnotValue);
        }

        // Normalize knot vector to [0, 1] range
        const normalizedKnots = knots.map(k => k / maxKnotValue);

        return new NUBSpline(periodicControlPoints, degree, normalizedKnots);
    }

    /**
     * Evaluates a point on the closed B-spline curve, handling the periodic nature of the curve.
     * This method works for both uniform and non-uniform knot vectors.
     * 
     * @param t The parameter value (0 <= t <= 1).
     * @returns A Point on the curve.
     */
    public getPointOnClosedCurve2(t: number): Point {
        // Ensure t is within [0, 1]
        t = t - Math.floor(t);

        // Map t to the full parameter range
        const startKnot = this.knots[this.degree];
        const endKnot = this.knots[this.knots.length - this.degree - 1];
        const fullRangeT = startKnot + t * (endKnot - startKnot);

        return this.getPoint(fullRangeT);
    }

        /**
     * Inserts a knot into the closed B-spline curve.
     * 
     * @param u The parameter value of the new knot (0 <= u <= 1).
     * @returns A new NUBSpline instance representing the curve with the inserted knot.
     */
        public insertKnotClosed(u: number): NUBSpline {
            // Ensure u is within [0, 1]
            u = Math.max(0, Math.min(1, u));
    
            // Map u to the full knot range
            const startKnot = this.knots[this.degree];
            const endKnot = this.knots[this.knots.length - this.degree - 1];
            const mappedU = startKnot + u * (endKnot - startKnot);
    
            // Find the knot span
            const k = this.findKnotSpan(mappedU);
    
            // Create new knot vector
            const newKnots = [...this.knots];
            newKnots.splice(k + 1, 0, mappedU);
    
            // Create new control points
            const newControlPoints: Point[] = [];
            const n = this.controlPoints.length - this.degree; // Number of original control points
    
            for (let i = 0; i < n + this.degree + 1; i++) {
                if (i <= k - this.degree + 1) {
                    newControlPoints.push(this.controlPoints[i]);
                } else if (i > k) {
                    newControlPoints.push(this.controlPoints[i - 1]);
                } else {
                    const alpha = this.calculateAlpha(i, k, mappedU);
                    const newPoint = new Point(
                        (1 - alpha) * this.controlPoints[i - 1].x + alpha * this.controlPoints[i].x,
                        (1 - alpha) * this.controlPoints[i - 1].y + alpha * this.controlPoints[i].y
                    );
                    newControlPoints.push(newPoint);
                }
            }
    
            // Ensure closure by updating the first 'degree' control points
            for (let i = 0; i < this.degree; i++) {
                newControlPoints[i] = newControlPoints[n + i];
            }
    
            // Create a new NUBSpline instance with the updated knots and control points
            return new NUBSpline(newControlPoints, this.degree, newKnots);
        }
}


class ClosedUnclampBSpline {
    private controlPoints: Point[];
    private knots: number[];
    private degree: number;

    constructor(controlPoints: Point[], degree: number) {
        if (controlPoints.length <= degree) {
            throw new Error("Number of control points must be greater than the degree for a closed curve.");
        }

        this.degree = degree;
        this.controlPoints = [...controlPoints, ...controlPoints.slice(0, degree)];
        
        const n = this.controlPoints.length;
        this.knots = Array.from({length: n + degree + 1}, (_, i) => i);
    }

    private findKnotSpan(u: number): number {
        const n = this.knots.length - 1;
        if (u >= this.knots[n]) return n - 1;
        if (u < this.knots[0]) return this.degree;

        let low = 0;
        let high = n;
        let mid = Math.floor((low + high) / 2);

        while (u < this.knots[mid] || u >= this.knots[mid + 1]) {
            if (u < this.knots[mid]) {
                high = mid;
            } else {
                low = mid;
            }
            mid = Math.floor((low + high) / 2);
        }

        return mid;
    }

    private basisFunctions(i: number, u: number): number[] {
        const N: number[] = Array(this.degree + 1).fill(0);
        N[0] = 1.0;

        for (let j = 1; j <= this.degree; j++) {
            let left = 0.0;
            let right = 0.0;
            for (let k = 0; k < j; k++) {
                const ind = i - k;
                const denom_left = this.knots[ind + j] - this.knots[ind];
                const denom_right = this.knots[ind + j + 1] - this.knots[ind + 1];
                
                if (denom_left !== 0) {
                    left = N[k] * (u - this.knots[ind]) / denom_left;
                }
                if (denom_right !== 0) {
                    right = N[k + 1] * (this.knots[ind + j + 1] - u) / denom_right;
                }
                N[k] = left + right;
            }
        }

        return N;
    }

    public getPoint(u: number): Point {
        const n = this.controlPoints.length - this.degree; // Original number of control points
        u = u % (n - this.degree);
        if (u < 0) u += (n - this.degree);

        const i = this.findKnotSpan(u);
        const N = this.basisFunctions(i, u);

        let x = 0, y = 0;
        for (let j = 0; j <= this.degree; j++) {
            const point = this.controlPoints[i - this.degree + j];
            x += N[j] * point.x;
            y += N[j] * point.y;
        }

        return new Point(x, y);
    }

    public insertKnot(u: number): ClosedUnclampBSpline {
        const k = this.findKnotSpan(u);
        const n = this.controlPoints.length - this.degree - 1;
        const m = this.knots.length - 1;

        // New knot vector
        const newKnots = [...this.knots.slice(0, k + 1), u, ...this.knots.slice(k + 1)];

        // New control points
        const newControlPoints: Point[] = [];
        for (let i = 0; i <= n + 1; i++) {
            if (i <= k - this.degree) {
                newControlPoints.push(this.controlPoints[i]);
            } else if (i > k) {
                newControlPoints.push(this.controlPoints[i - 1]);
            } else {
                const alpha = (u - this.knots[i]) / (this.knots[i + this.degree] - this.knots[i]);
                const newPoint = new Point(
                    (1 - alpha) * this.controlPoints[i - 1].x + alpha * this.controlPoints[i].x,
                    (1 - alpha) * this.controlPoints[i - 1].y + alpha * this.controlPoints[i].y
                );
                newControlPoints.push(newPoint);
            }
        }

        // Ensure closure by updating the first 'degree' control points
        for (let i = 0; i < this.degree; i++) {
            newControlPoints[i] = newControlPoints[n + 1 + i];
        }

        // Create and return a new BSpline instance
        const newBSpline = new ClosedUnclampBSpline(newControlPoints.slice(0, n + 2), this.degree);
        newBSpline.knots = newKnots;
        return newBSpline;
    }

    public getCurvePoints(numPoints: number): Point[] {
        const points: Point[] = [];
        const n = this.controlPoints.length - this.degree;
        const step = (n - this.degree) / numPoints;

        for (let i = 0; i < numPoints; i++) {
            const u = i * step;
            points.push(this.getPoint(u));
        }

        return points;
    }
}





