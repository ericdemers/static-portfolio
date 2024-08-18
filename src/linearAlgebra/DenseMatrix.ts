import type { MatrixInterface } from "./MatrixInterfaces"


/**
 * A dense matrix
 */
export class DenseMatrix implements MatrixInterface {

    private _shape: number[]
    private data: number[]

    /**
     * Create a dense matrix
     * @param nrows Number of rows
     * @param ncols Number of columns
     * @param data A row after row flat array
     * @throws If data length is not equal to nrows*ncols 
     */
    constructor(nrows: number, ncols: number, data?: number[]) {
        this._shape = [nrows, ncols]
        if (data) {
            if (data.length !== this.shape[0]*this.shape[1]) {
                throw new Error("Dense matrix constructor expect the data to have nrows*ncols length")
            }
            this.data = data.slice()
        } else {
            this.data = []
            for (let i = 0; i < this.shape[0] * this.shape[1]; i += 1) {
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
     * Return the corresponding index in the flat row by row data vector
     * @param row The row index
     * @param column The column index
     */
    private dataIndex(row: number, column: number) {
        return row * this.shape[1] + column
    }

    /**
     * Return the value at a given row and column position
     * @param row The row index
     * @param column The column index
     * @return Scalar
     * @throws If an index is out of range
     */
    get(row: number, column: number) {
        this.checkRowRange(row)
        this.checkColumnRange(column)
        return this.data[this.dataIndex(row, column)]
    }

    /**
     * Set a given value at a given row and column position
     * @param row The row index
     * @param column The column index
     * @param value The new value
     * @throws If an index is out of range
     */
    set(row: number, column: number, value: number) {
        this.checkRowRange(row)
        this.checkColumnRange(column)
        this.data[this.dataIndex(row, column)] = value
    }

    /**
     * Check that the column index is inside appropriate range
     * @param index The column index
     * @throws If index is out of range
     */
    checkColumnRange(index: number) {
        if (index < 0  || index >= this.shape[1]) {
            throw new Error("DenseMatrix column index out of range")
        }
    }

    /**
     * Check that the row index is inside appropriate range
     * @param index The row index
     * @throws If index is out of range
     */
    checkRowRange(index: number) {
        if (index < 0  || index >= this.shape[0]) {
            throw new Error("DenseMatrix row index out of range")
        }
    }

    removeRows(rows: number[]) {
        const numberOfRows = this.shape[0] - rows.length
        const numberOfColumns = this.shape[1]
        let result = new DenseMatrix(numberOfRows, numberOfColumns)
        let k = 0
        let newRowIndex = 0
        for (let i = 0; i < this.shape[0]; i += 1) {
            if (rows[k] != i) {
                for (let j = 0; j < this.shape[1]; j += 1) {
                    result.set(newRowIndex, j, this.get(i, j))
                }
                newRowIndex += 1
            }
            else { 
                k += 1
            }
        }
        return result
    }
}