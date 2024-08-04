import { binomialCoefficient, memoizedBinomialCoefficient } from "../BinomialCoefficient"
import { BSplineR1toR1 } from "./BSplineR1toR1"
import { type Complex, fft, ifft } from "./FFT"
import type { IBernsteinDecompositionR1toR1 } from "./IBernsteinDecompositionR1toR1"

/**
* A Bernstein decomposition of a B-Spline function from a one dimensional real space to a one dimensional real space
*/

export class BernsteinDecompositionR1toR1 implements IBernsteinDecompositionR1toR1 {


    static binomial = memoizedBinomialCoefficient()
    static flopsCounter = 0
    private controlPointsArray: number[][]
    
    /**
     * 
     * @param controlPointsArray An array of array of control points
     */
    constructor(controlPointsArray: number[][] = []) {
        this.controlPointsArray = controlPointsArray
    }

    add(other: BernsteinDecompositionR1toR1) {
        let result: number[][] = []
        for (let i = 0; i < other.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < other.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] + other.controlPointsArray[i][j];
            }
        }
        return new BernsteinDecompositionR1toR1(result)
    }

    subtract(other: BernsteinDecompositionR1toR1) {
        let result: number[][] = []
        for (let i = 0; i < other.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < other.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] - other.controlPointsArray[i][j]
            }
        }
        return new BernsteinDecompositionR1toR1(result)
    }


    multiply(other: BernsteinDecompositionR1toR1) {
        return new BernsteinDecompositionR1toR1(this.bernsteinMultiplicationArray(this.controlPointsArray, other.controlPointsArray))
    }


    multiplyRange(other: BernsteinDecompositionR1toR1, start: number, lessThan: number) {
        let result: number[][] = []
        for (let i = start; i < lessThan; i += 1) {
            result[i-start] = this.bernsteinMultiplication(this.controlPointsArray[i], other.controlPointsArray[i])
        }
        return new BernsteinDecompositionR1toR1(result)
    }

    

    multiplyRange2(bd: BernsteinDecompositionR1toR1, start: number, lessThan: number) {
        let result: number[][] = []
        for (let i = start; i < lessThan; i += 1) {
            result[i-start] = this.bernsteinMultiplication(this.controlPointsArray[i-start], bd.controlPointsArray[i])
        }
        return new BernsteinDecompositionR1toR1(result)
    }
    



    bernsteinMultiplicationArray(f: number[][], g: number[][]) {
        let result: number[][] = []
        for (let i = 0; i < f.length; i += 1) {
            //result[i] = this.bernsteinMultiplicationFFT(f[i], g[i])
            //result[i] = this.bernsteinMultiplication(f[i], g[i])
            result[i] = this.bernsteinMultiplicationFaster(f[i], g[i])


        }
        return result
    }

    bernsteinMultiplication(f: number[], g: number[]) {
        const f_degree = f.length - 1
        const g_degree = g.length - 1
        let result: number[] = []
        for (let k = 0; k < f_degree + g_degree + 1; k += 1) {
            let cp = 0
            let bfugu = BernsteinDecompositionR1toR1.binomial(f_degree + g_degree, k)
            for (let i = Math.max(0, k - g_degree); i < Math.min(f_degree, k) + 1; i += 1) {
                let bfu = BernsteinDecompositionR1toR1.binomial(f_degree, i)
                let bgu = BernsteinDecompositionR1toR1.binomial(g_degree, k - i)
                cp += bfu * bgu / bfugu * f[i] * g[k - i]
            }
            result[k] = cp
        }
        return result
    }


    
    bernsteinMultiplicationFaster(f: number[], g: number[]) {
        const f_degree = f.length - 1
        const g_degree = g.length - 1
        let result: number[] = []
        let fScaled = []
        let gScaled = []

        for (let i = 0; i < f.length; i += 1) {
            fScaled[i] = f[i] * BernsteinDecompositionR1toR1.binomial(f_degree, i)
        }

        for (let i = 0; i < g.length; i += 1) {
            gScaled[i] = g[i] * BernsteinDecompositionR1toR1.binomial(g_degree, i)
        }

        for (let k = 0; k < f_degree + g_degree + 1; k += 1) {
            let cp = 0
            for (let i = Math.max(0, k - g_degree); i < Math.min(f_degree, k) + 1; i += 1) {
                cp +=  fScaled[i] * gScaled[k - i]
            }
            result[k] = cp
        }
        for (let i = 0; i < result.length; i += 1) {
            result[i] = result[i] / BernsteinDecompositionR1toR1.binomial(f_degree + g_degree, i)
        }
        return result
    }
    

    

    scaledBernsteinBasis(f: number[], totalLengthWithZeroPadding: number) {
        let result: number[] = []
        const n = f.length - 1
        for (let i = 0; i < f.length; i += 1) {
            result.push(BernsteinDecompositionR1toR1.binomial(n, i) * f[i])
        }
        for (let i = 0; i < totalLengthWithZeroPadding - f.length; i += 1) {
            result.push(0)
        }
        return result
    }

    unscaledBernsteinBasis(f: number[], totalLengthWithoutZeroPadding: number) {
        let result: number[] = []
        const n = totalLengthWithoutZeroPadding - 1
        for (let i = 0; i < totalLengthWithoutZeroPadding; i += 1) {
            result.push(f[i] / BernsteinDecompositionR1toR1.binomial(n, i))
        }
        return result
    }

    

    bernsteinMultiplicationFFT(f: number[], g: number[]) {
        const f_degree = f.length - 1
        const g_degree = g.length - 1
        let l = 2
        while (l < f_degree + g_degree + 1) {
            l = l * 2
        }
        const fs = this.scaledBernsteinBasis(f, l)
        const gs = this.scaledBernsteinBasis(g, l)
        const fsFFT = fft(fs)
        const gsFFT = fft(gs)
        const conv: Complex[] = []
        for (let i = 0; i < fsFFT.length; i += 1) {
            fsFFT[i].mul(gsFFT[i], fsFFT[i])
        }
        const r = ifft(fsFFT)

        return this.unscaledBernsteinBasis(r, f_degree + g_degree + 1)
    }
    

    multiplyByScalar(value: number) {
        let result: number[][] = []
        for (let i = 0; i < this.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < this.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] * value
            }
        }
        return new BernsteinDecompositionR1toR1(result)
    }

    /*
    addScalar(value: number) {
        let result: number[][] = []
        for (let i = 0; i < this.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < this.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] + value
            }
        }
        return new BernsteinDecompositionR1toR1(result)
    }
    */

    flattenControlPointsArray() {
        return this.controlPointsArray.reduce(function (acc: number[], val: number[]) {
            return acc.concat(val)
        }, [])
    }

    unScaledFlattenControlPointsArray() {
        return this.flattenControlPointsArray()
    }

    subset(start: number, lessThan: number) {
        return new BernsteinDecompositionR1toR1(this.controlPointsArray.slice(start, lessThan))

    }



    

    // elevateDegree(times: number = 1) {
    //     let newControlPointsArray: number[][] = []
    //     for (let cps of this.controlPointsArray) {
    //         newControlPointsArray.push(this.elevateDegreeB( cps, times))
    //     }
    //     this.controlPointsArray = newControlPointsArray
    // }

    elevateDegree() {
        return new BernsteinDecompositionR1toR1(this.controlPointsArray.map(this.elevateDegreeB))
    }

    elevateDegreeB(controlPoints: number[], times: number = 1) {
        const degree = controlPoints.length - 1
        let result: number[] = []
        for (let i = 0; i < controlPoints.length + times; i += 1) {
            let cp = 0
            for (let j = Math.max(0, i - times); j <= Math.min(degree, i); j += 1){
                const bc0 = binomialCoefficient(times, i-j)
                const bc1 = binomialCoefficient(degree, j)
                const bc2 = binomialCoefficient(degree+times, i)
                cp += bc0 * bc1 / bc2 * controlPoints[j]
            }
            result.push(cp)
        }
        return result
    }

    derivative() {
        return new BernsteinDecompositionR1toR1(this.controlPointsArray.map(this.derivativeB))
    }


    

    derivativeB(controlPoints: number[]) {
        const degree = controlPoints.length - 1
        let newControlPoints = []
        for (let i = 0; i < controlPoints.length - 1; i += 1) {
            newControlPoints[i] = (controlPoints[i + 1] - (controlPoints[i]))* degree
        }
        return newControlPoints
    }

    integral(integrationConstant: number=0) {
        let newControlPointsArray: number[][] = []
        let c = integrationConstant
        for (let cps of this.controlPointsArray) {
            const b = this.integralB(cps, c)
            newControlPointsArray.push(b)
            c = b[b.length - 1]
        }
        return new BernsteinDecompositionR1toR1(newControlPointsArray)
    }

    integralB(controlPoints: number[], integrationConstant: number=0) {
        const degree = controlPoints.length - 1
        let newControlPoints = [integrationConstant]
        for (let k = 1; k < controlPoints.length + 1; k += 1) {
            newControlPoints.push(integrationConstant)
            for (let j = 0; j < k; j += 1) {
                newControlPoints[k]  += controlPoints[j] / (degree + 1)
            }
        }
        return newControlPoints
    }

    

    
    
    splineRecomposition(distinctKnots: number[]) {
        const cp = this.flattenControlPointsArray()
        const degree = this.getDegree()
        let knots: number[] = []

        for (let distinctKnot of distinctKnots) {
            for (let j = 0; j < degree + 1; j += 1) {
                knots.push(distinctKnot)
            }
        }

        return new BSplineR1toR1(cp, knots)
    }
    
    
    
    
    getDegree() {
        return this.controlPointsArray[0].length - 1
    }
    

}

export function splineRecomposition(bernsteinDecomposiiton: BernsteinDecompositionR1toR1, distinctKnots: number[]) {
    const cp = bernsteinDecomposiiton.flattenControlPointsArray()
    const degree = bernsteinDecomposiiton.getDegree()
    let knots: number[] = []

    for (let distinctKnot of distinctKnots) {
        for (let j = 0; j < degree + 1; j += 1) {
            knots.push(distinctKnot)
        }
    }
    return new BSplineR1toR1(cp, knots)
}

export function determinant2by2(ax: BernsteinDecompositionR1toR1, ay: BernsteinDecompositionR1toR1, bx: BernsteinDecompositionR1toR1, by: BernsteinDecompositionR1toR1) {
    return (ax.multiply(by)).subtract(bx.multiply(ay))
}