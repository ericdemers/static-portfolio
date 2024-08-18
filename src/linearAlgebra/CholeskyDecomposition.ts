
import type { SquareMatrix } from "./SquareMatrix"
import type { SymmetricMatrix } from "./SymmetricMatrix"


/**
 * A decomposition of a positive-definite matirx into a product of a lower triangular matrix and its conjugate transpose
 */
export class CholeskyDecomposition {
    // Bibliographic reference: Matrix Computation, Golub and Van Loan, p. 164

    // The values of the decomposition are stored in the lower triangular portion of the matrix g
    g: SquareMatrix
    success = false
    CLOSE_TO_ZERO = 10e-8
    firstNonPositiveDefiniteLeadingSubmatrixSize: number = -1

    /**
     * The values of the decomposition are stored in the lower triangular portion of the matrix g
     * @param matrix Matrix
     */
    constructor(matrix: SymmetricMatrix) {
        this.g = matrix.squareMatrix()
        const n = this.g.shape[0]

        if (this.g.get(0, 0) < this.CLOSE_TO_ZERO) {
            return
        }

        let sqrtGjj = Math.sqrt(this.g.get(0, 0))
        for (let i = 0; i < n; i += 1) {
            this.g.divideAt(i, 0, sqrtGjj);
        }
    
        for (let j = 1; j < n; j += 1) {
            for (let i = j; i < n; i += 1) {
                let sum = 0;
                for (let k = 0; k < j; k += 1) {
                    sum += this.g.get(i, k) * this.g.get(j, k);
                }
                this.g.substractAt(i, j, sum);
            }
            if (this.g.get(j, j) < this.CLOSE_TO_ZERO) {
                this.firstNonPositiveDefiniteLeadingSubmatrixSize = j + 1;
                return;
            }
            sqrtGjj = Math.sqrt(this.g.get(j, j));
            for (let i = j; i < n; i += 1) {
                this.g.divideAt(i, j, sqrtGjj);
            }
    
        }
    
        for (let j = 0; j < n; j += 1) {
            for (let i = 0; i < j; i += 1) {
                this.g.set(i, j, 0);
            }
        }
    
        this.success = true;
    }

    /**
     * Solve the linear system
     * @param b Vector
     * @return The vector x
     * @throws If the Cholesky decomposition failed
     */
    solve(b: number[]) {
        'use strict';
        // See Numerical Recipes Third Edition p. 101

        if (!this.success) {
            throw new Error("CholeskyDecomposistion.success === false");
        }

        if (b.length !== this.g.shape[0]) {
            throw new Error("The size of the cholesky decomposed matrix g and the vector b do not match");
        }

        const n = this.g.shape[0]
        let x = b.slice()
 
        // Ly = b
        for (let i = 0; i < n; i += 1) {
            let sum = b[i];
            for (let k = i - 1; k >= 0; k -= 1) {
                sum -= this.g.get(i, k) * x[k];
            }
            x[i] = sum / this.g.get(i, i);
        }
        // LT x = Y
        for (let i = n - 1; i >= 0; i -= 1) {
            let sum = x[i];
            for (let k = i + 1; k < n; k += 1) {
                sum -= this.g.get(k, i) * x[k];
            }
            x[i] = sum / this.g.get(i, i);
        }

        return x;
    }

    /**
     * Solve the linear equation Lower triangular matrix LT * x = b
     * @param b Vector
     */
    solve_LT_result_equal_b(b: number[]) {
        const n = this.g.shape[0]
        let x = b.slice()
        for (let i = 0; i < n; i += 1) {
            let sum = b[i];
            for (let k = i - 1; k >= 0; k -= 1) {
                sum -= this.g.get(i, k) * x[k];
            }
            x[i] = sum / this.g.get(i, i);
        }
        return x;
    }

    
}