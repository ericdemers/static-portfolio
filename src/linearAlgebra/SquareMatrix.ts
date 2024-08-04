import type { SquareMatrixInterface } from "./MatrixInterfaces"

/**
 * A square matrix
 */
export class SquareMatrix implements SquareMatrixInterface {

    private _shape: number[]
    private data: number[]

    /**
     * Create a square matrix
     * @param size Number of row and column
     * @param data A row after row flat array
     * @throws If data length is not equal to size*size 
     */
    constructor(size: number, data?: number[]) {
        this._shape = [size, size]
        if (data) {
            if (data.length !== size*size) {
                throw new Error("Square matrix constructor expect the data to have size*size length")
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
        let n = row * this._shape[1] + column;
        return n;
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
        return this.data[this.dataIndex(row, column)];
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
        this.data[this.dataIndex(row, column)] = value;
    }

    /**
     * Change the value of the matrix at a given row and column position by this value divided by the divisor value
     * @param row The row index
     * @param column The column index
     * @param divisor The divisor value
     * @throws If an index is out of range
     */
    divideAt(row: number, column: number, divisor: number) {
        this.checkRowRange(row)
        this.checkColumnRange(column) 
        this.data[this.dataIndex(row, column)] /= divisor 
    }

    /**
     * Change the value of the matrix at a given row and column position by this value substracted by the subtrahend value
     * @param row The row index
     * @param column The column index
     * @param divisor The divisor value
     * @throws If an index is out of range
     */
    substractAt(row: number, column: number, subtrahend: number) {
        this.checkRowRange(row)
        this.checkColumnRange(column) 
        this.data[this.dataIndex(row, column)] -= subtrahend 
    }

    /**
     * Check that the index is inside appropriate range
     * @param index The column or the row index
     * @throws If an index is out of range
     */
    checkRowRange(index: number) {
        if (index < 0  || index >= this.shape[0]) {
            throw new Error("SquareMatrix index is out of range");
        }
    }

    /**
     * Check that the index is inside appropriate range
     * @param index The column or the row index
     * @throws If an index is out of range
     */
    checkColumnRange(index: number) {
        if (index < 0  || index >= this.shape[1]) {
            throw new Error("SquareMatrix index is out of range");
        }
    }

    /**
     * Multiply two matrices
     * @param that A square or a square matrix
     * @return a square matrix
     */
    multiplyByMatrix(that: SquareMatrixInterface) {
        if (this.shape[1] !== that.shape[0]) {
            throw new Error("Size mismatch in matrix multiplication")
        }
        let result = new SquareMatrix(this.shape[1])

        for (let i = 0; i < this.shape[0]; i += 1) {
            for (let j = 0; j < this.shape[0]; j += 1) {
                let temp = 0;
                for (let k = 0; k < this.shape[0]; k += 1) {
                    temp += this.get(i, k) * that.get(k, j);
                }
                result.set(i, j, temp);
            }
        }
        return result;
    }

    multiplyByVector(v: number[]) {
        if (this.shape[1] !== v.length) {
            throw new Error("SquareMatrix multiply a vector of incorrect length");
        }
        let result = []
        const n = this.shape[1]
        for (let i = 0; i < n; i += 1) {
            let temp = 0;
            for (let j = 0; j < n; j += 1) {
                temp += this.get(i, j) * v[j];
            }
            result.push(temp);
        }
        return result;

    }


    /**
     * Add two matrices
     * @param that A square or a square matrix
     * @return a square matrix
     */
    addByMatrix(that: SquareMatrixInterface) {
        if (this.shape[1] !== that.shape[0]) {
            throw new Error("Size mismatch in matrix addition")
        }
        let result = new SquareMatrix(this.shape[1])

        for (let i = 0; i < this.shape[0]; i += 1) {
            for (let j = 0; j < this.shape[0]; j += 1) {
                result.set(i, j, this.get(i, j) + that.get(i, j));
            }
        }
        return result;
    }

    /**
     * Add two matrices
     * @param that A square or a symmetric matrix
     * @return a square matrix
     */
    mutiplyByConstant(value: number) {
        let result = new SquareMatrix(this.shape[1])
        for (let i = 0; i < this.shape[0]; i += 1) {
            for (let j = 0; j < this.shape[0]; j += 1) {
                result.set(i, j, this.get(i, j) * value);
            }
        }
        return result;
    }

    toNumberArray() {
        let result: number[][] = []
        for (let i = 0; i < this.shape[0]; i += 1) {
            result.push([])
            for (let j = 0; j < this.shape[1]; j += 1) {
                result[i].push(this.get(i, j))
            }
        }
        return result
    }




}