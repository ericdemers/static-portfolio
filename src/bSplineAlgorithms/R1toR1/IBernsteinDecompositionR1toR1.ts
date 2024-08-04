
export interface IBernsteinDecompositionR1toR1 {

    //controlPointsArray: number[][]

    getDegree(): number

    flattenControlPointsArray(): number[]

    unScaledFlattenControlPointsArray(): number[]

    multiply(other: IBernsteinDecompositionR1toR1): IBernsteinDecompositionR1toR1

    multiplyByScalar(value: number): IBernsteinDecompositionR1toR1

    multiplyRange(other: IBernsteinDecompositionR1toR1, start: number, lessThan: number): IBernsteinDecompositionR1toR1

    subset(start: number, lessThan: number): IBernsteinDecompositionR1toR1

    add(other: IBernsteinDecompositionR1toR1): IBernsteinDecompositionR1toR1

    subtract(other: IBernsteinDecompositionR1toR1): IBernsteinDecompositionR1toR1

    bernsteinMultiplicationArray(f: number[][], g: number[][]): number[][]
    
    bernsteinMultiplication(f: number[], g: number[]): number[]

}