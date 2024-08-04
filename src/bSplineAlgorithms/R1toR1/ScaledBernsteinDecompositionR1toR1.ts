
import { memoizedBinomialCoefficient } from "../BinomialCoefficient"
import { decomposeFunction } from "../Piegl_Tiller_NURBS_Book"
import { BSplineR1toR1 } from "./BSplineR1toR1"
import type { IBernsteinDecompositionR1toR1 } from "./IBernsteinDecompositionR1toR1"

export class ScaledBernsteinDecompositionR1toR1 implements IBernsteinDecompositionR1toR1 {

    static binomial = memoizedBinomialCoefficient()

    private controlPointsArray: number[][]

    /**
     * 
     * @param controlPointsArray An array of array of control points
     */
    constructor(controlPointsArray: number[][] = []) {
        this.controlPointsArray = controlPointsArray
    }

    add(other: ScaledBernsteinDecompositionR1toR1) {
        let result: number[][] = []
        for (let i = 0; i < other.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < other.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] + other.controlPointsArray[i][j];
            }
        }
        return new ScaledBernsteinDecompositionR1toR1(result)
    }

    subtract(other: ScaledBernsteinDecompositionR1toR1) {
        let result: number[][] = []
        for (let i = 0; i < other.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < other.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] - other.controlPointsArray[i][j]
            }
        }
        return new ScaledBernsteinDecompositionR1toR1(result)
    }

    getDegree() {
        return this.controlPointsArray[0].length - 1
    }

    flattenControlPointsArray() {
        return this.controlPointsArray.reduce(function (acc: number[], val: number[]) {
            return acc.concat(val)
        }, [])
    }

    unScaledFlattenControlPointsArray() {
        let result: number[] = []
        const m = this.controlPointsArray.length
        const n = this.controlPointsArray[0].length
        for (let i = 0; i < m; i += 1) {
            for (let j = 0; j < n; j += 1) {
                result.push(this.controlPointsArray[i][j] / ScaledBernsteinDecompositionR1toR1.binomial(n - 1, j))
            }
        }
        return result
    }

    multiply(bd: ScaledBernsteinDecompositionR1toR1) {
        return new ScaledBernsteinDecompositionR1toR1(this.bernsteinMultiplicationArray(this.controlPointsArray, bd.controlPointsArray))
    }

    multiplyByScalar(value: number) {
        let result: number[][] = []
        for (let i = 0; i < this.controlPointsArray.length; i += 1) {
            result[i] = []
            for (let j = 0; j < this.controlPointsArray[0].length; j += 1) {
                result[i][j] = this.controlPointsArray[i][j] * value
            }
        }
        return new ScaledBernsteinDecompositionR1toR1(result)
    }

    multiplyRange(bd: ScaledBernsteinDecompositionR1toR1, start: number, lessThan: number) {
        let result: number[][] = []
        for (let i = start; i < lessThan; i += 1) {
            result[i-start] = this.bernsteinMultiplication(this.controlPointsArray[i], bd.controlPointsArray[i])
        }
        return new ScaledBernsteinDecompositionR1toR1(result)
    }

    multiplyRange2(bd: ScaledBernsteinDecompositionR1toR1, start: number, lessThan: number) {
        let result: number[][] = []
        for (let i = start; i < lessThan; i += 1) {
            result[i-start] = this.bernsteinMultiplication(this.controlPointsArray[i-start], bd.controlPointsArray[i])
        }
        return new ScaledBernsteinDecompositionR1toR1(result)
    }

    subset(start: number, lessThan: number) {
        return new ScaledBernsteinDecompositionR1toR1(this.controlPointsArray.slice(start, lessThan))
    }

    bernsteinMultiplicationArray(f: number[][], g: number[][]) {
        let result: number[][] = []
        for (let i = 0; i < f.length; i += 1) {
            result[i] = this.bernsteinMultiplication(f[i], g[i])
        }
        return result
    }

    bernsteinMultiplication(f: number[], g: number[]) {
        const f_degree = f.length - 1
        const g_degree = g.length - 1
        let result: number[] = []

        for (let k = 0; k < f_degree + g_degree + 1; k += 1) {
            let cp = 0
            for (let i = Math.max(0, k - g_degree); i < Math.min(f_degree, k) + 1; i += 1) {
                cp +=  f[i] * g[k - i]
            }
            result[k] = cp
        }
        return result
    }

}

export function unScaledSplineRecomposition(bernsteinDecompositon: ScaledBernsteinDecompositionR1toR1, distinctKnots: number[]) {
    const cp = bernsteinDecompositon.unScaledFlattenControlPointsArray()
    const degree = bernsteinDecompositon.getDegree()
    let knots: number[] = []

    for (let distinctKnot of distinctKnots) {
        for (let j = 0; j < degree + 1; j += 1) {
            knots.push(distinctKnot)
        }
    }

    return new BSplineR1toR1(cp, knots)
}

export function scaledDecomposeFunction(spline: BSplineR1toR1) {

    let result = decomposeFunction(spline)
    const n = result[0].length
    for (let j = 0; j < n; j += 1) {
        let scalingFactor = ScaledBernsteinDecompositionR1toR1.binomial(n - 1, j)
        for (let i = 0; i < result.length; i += 1) {
            result[i][j] *= scalingFactor
        }
    }
    return result
}

export function determinant2by2(ax: ScaledBernsteinDecompositionR1toR1, ay: ScaledBernsteinDecompositionR1toR1, bx: ScaledBernsteinDecompositionR1toR1, by: ScaledBernsteinDecompositionR1toR1) {
    return (ax.multiply(by)).subtract(bx.multiply(ay))
}
