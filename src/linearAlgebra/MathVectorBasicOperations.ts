import { DenseMatrix } from './DenseMatrix';
import { SquareMatrix } from './SquareMatrix';



/**
 * Multiply a vector by a scalar
 * @param vector vector
 * @param value scalar
 */
export function multiplyVectorByScalar(vector: number[], value: number) {
    let result: number[] = []
    for(let vi of vector){
        result.push(vi * value)
    }
    return result
}

/**
 * Divide a vector by a scalar
 * @param vector Vector
 * @param value Scalar
 * @throws If the scalar value is zero
 */
export function divideVectorByScalar(vector: number[], value: number) {
    if (value === 0) {
        throw new Error("Division by zero")
    }
    let result: number[] = []
    for(let vi of vector){
        result.push(vi / value)
    }
    return result
}

/**
 * A standard function in basic linear algebra : y = ax + y 
 * @param a Scalar
 * @param x Vector
 * @param y Vector
 * @throws If x and y have different length
 */
export function saxpy(a: number, x: number[], y: number[]) {
    if (x.length !== y.length) {
        throw new Error("Adding two vectors of different length")
    }
    for (let i = 0; i < x.length; i += 1) {
        y[i] += a * x[i]
    }
}



/**
 * A standard function in basic linear algebra : z = ax + y 
 * @param a Scalar
 * @param x Vector
 * @param y Vector
 * @returns ax + y
 * @throws If x and y have different length
 */
export function saxpy2(a: number, x: number[], y: number[]) {
    if (x.length !== y.length) {
        throw new Error("Adding two vectors of different length")
    }
    let result: number[] = []
    for (let i = 0; i < x.length; i += 1) {
        result.push(a * x[i] + y[i])
    }
    return result
}

/**
 * Compute the dot product of two vectors
 * @param x Vector
 * @param y Vector
 * @return The scalar result
 * @throws If x and y have different length
 */
export function dotProduct(x: number[], y: number[]) {
    if (x.length !== y.length) {
        throw new Error("Making the dot product of two vectors of different length");
    }
    let result = 0
    for (let i = 0; i < x.length; i += 1) {
        result += x[i] * y[i];
    }
    return result;
}

/**
 * Add two vectors
 * @param x Vector
 * @param y Vector
 * @return Vector
 * @throws If x and y have different length
 */
export function addTwoVectors(x: number[], y: number[]) {
    if (x.length !== y.length) {
        throw new Error("Adding two vectors of different length");
    }
    let result: number[] = []
    for (let i = 0; i < x.length; i += 1) {
        result.push(x[i] + y[i]);
    }
    return result;
}

/**
 * Add the second vector to the first vector
 * @param x Vector
 * @param y Vector
 * @throws If x and y have different length
 */
export function addSecondVectorToFirst(x: number[], y: number[]) {
    if (x.length !== y.length) {
        throw new Error("Adding two vectors of different length");
    }
    for (let i = 0; i < x.length; i += 1) {
        x[i] +=  y[i]
    }
}

/**
 * Compute the square of the norm 
 * @param v Vector
 * @return Non negative scalar
 */
export function squaredNorm(vector: number[]) {
    let result = 0
    for(let vi of vector){
        result += vi * vi
    }
    return result;
}

/**
 * Compute the norm 
 * @param v Vector
 * @return Non negative scalar
 */
export function norm(v: number[]) {
    return Math.sqrt(squaredNorm(v))
}

/**
 * Compute the norm p = 1
 * @param v Vector
 * @return Non negative scalar
 */
export function norm1(vector: number[]) {
    let result = 0
    for(let vi of vector){
        result += Math.abs(vi)
    }
    return result;
}

/**
 * Create a zero vector of size n
 * @param n Size
 */
export function zeroVector(n: number) {
    let result: number[] = []
    for (let i = 0; i < n; i += 1) {
        result.push(0);
    }
    return result;
}


/**
 * Compute the product of a vector and its transpose
 * @param v Vector
 */
export function product_v_vt(v: number[]) {
    const n = v.length
    let result = new SquareMatrix(n)
    for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
            result.set(i, j, v[i] * v[j]);
        }
    }
    return result;
}

/**
 * Compute the product of a first vector with the transpose of a second vector
 * @param v1 The first vector taken as a column vector
 * @param v2 The second vector taken after transposition as a row vector
 */
export function product_v1_v2t(v1: number[], v2: number[]) {
    const m = v1.length
    const n = v2.length
    let result = new DenseMatrix(m, n)
    for (let i = 0; i < m; i += 1) {
        for (let j = 0; j < n; j += 1) {
            result.set(i, j, v1[i] * v2[j]);
        }
    }
    return result;
}

export function isZeroVector(vector: number[]) {
    for (let vi of vector) {
        if (vi !== 0) {
            return false
        }
    }
    return true;
}

/**
 * Returns a vector filled with random values between 0 and 1
 * @param n The size of the random vector
 */
export function randomVector(n: number){
    let result: number[] = []
    for (let i = 0; i < n; i += 1) {
        result.push((Math.random()-0.5)*10e8)
        //result.push((Math.random())*10e8)
    }
    return result
}

export function containsNaN(vector: number[]) {
    for (let vi of vector) {
        if (isNaN(vi)) {
            return true
        }
    }
    return false
}

/**
 * Return the sign of a number.
 * It returns 1 if the number is positive, -1 if the number is negative and 0 if it is zero or minus zero
 * The standard Math.sign() function doesn't work with Windows Internet Explorer
 * @param x Number
 */
export function sign(x: number) {
    if (x == 0) return 0
    else return  x < 0 ? -1 : 1
}

export function removeElements(array: any[], indices: number[]) {
    let result = array.slice()
    for (let i = indices.length -1; i >= 0; i--) {
        result.splice(indices[i], 1)
    }
    return result
}
