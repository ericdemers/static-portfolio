

export interface MatrixInterface {
    /**
    * Return the value at a given row and column position
    * @param row The row index
    * @param column The column index
    * @return Scalar
    */
   get(row: number, column: number): number

   /**
    * Set a given value at a given row and column position
    * @param row The row index
    * @param column The column index
    * @param value The new value
    */
   set(row: number, column: number, value: number): void

   /**
    * Array of dimensions
    * Example : for a matrix of 2 rows and 3 columns the matrix shape = [2, 3]
    */
   shape: number[]
   
}

export interface SquareMatrixInterface extends MatrixInterface {

}

export interface SymmetricMatrixInterface extends SquareMatrixInterface {
   
}
