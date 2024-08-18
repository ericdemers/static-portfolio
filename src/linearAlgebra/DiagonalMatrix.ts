import type { SymmetricMatrixInterface } from "./MatrixInterfaces"


/**
 * An identity matrix
 */
export class DiagonalMatrix implements SymmetricMatrixInterface {


    private _shape: number[]
    private data: number[]

    /**
     * Create a Symmetric Matrix
     * @param size The number of rows or the number columns 
     * @param data The matrix data in a flat vector
     */
    constructor(size: number, data?: Array<number>) {
        this._shape = [size, size]
        if (data) {
            if (data.length !== size ) {
                throw new Error("Diagonal matrix constructor expect the data to have size length")
            }
            this.data = data.slice()
        } else {
            this.data = []
            const n = size
            for (let i = 0; i < n; i += 1) {
                this.data.push(0);
            }
        }
    }

    /**
     * Returns the shape of the matrix : [number of rows, number of columns]
     */
    get shape() {
        return this._shape
    }

        /**
     * Returns the value at a given row and column position
     * @param row The row index
     * @param column The column index
     * @return Scalar
     * @throws If an index is out of range
     */
    get(row: number, column: number) {
        this.checkRange(row, column);
        return this.data[row];
    }

    /**
     * Set a given value at a given row and column position
     * @param row The row index
     * @param column The column index
     * @param value The new value
     * @throws If an index is out of range
     */
    set(row: number, column: number, value: number) {
        this.checkRange(row, column);
        this.data[row] = value;

    }

    /**
     * Check that the index is inside appropriate range
     * @param index The column or the row index
     * @throws If an index is out of range
     */
    checkRange(row: number, column: number) {
        if (row < 0  || row >= this.shape[0] || row != column) {
            throw new Error("DiagonalMatrix index is out of range");
        }
    }

}


export function identityMatrix(n: number) {
    let result = new DiagonalMatrix(n)
    for (let i = 0; i < n; i += 1){
        result.set(i, i, 1)
    }
    return result
}