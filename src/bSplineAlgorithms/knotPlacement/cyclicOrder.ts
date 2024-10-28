/**
 * Represents the result of a cyclic order check.
 */
export enum CyclicOrderResult {
    STRICTLY_INCREASING = 1,
    INCREASING = 0,
    NOT_IN_ORDER = -1
}

/**
 * Checks if three numbers are in strict cyclic order.
 * Strict cyclic order means that the numbers are strictly increasing when considered cyclically.
 * 
 * @param a - The first number in the sequence
 * @param b - The second number in the sequence
 * @param c - The third number in the sequence
 * @returns True if the numbers are in strict cyclic order, false otherwise
 * @throws {Error} If any of the input parameters is not a finite number
 */
export function checkStrictCyclicOrder(a: number, b: number, c: number): boolean {
    validateInputs(a, b, c);
    return (a < b && b < c) || (b < c && c < a) || (c < a && a < b);
}

/**
 * Checks if three numbers are in cyclic order.
 * Cyclic order allows for equality between adjacent numbers.
 * 
 * @param a - The first number in the sequence
 * @param b - The second number in the sequence
 * @param c - The third number in the sequence
 * @returns True if the numbers are in cyclic order, false otherwise
 * @throws {Error} If any of the input parameters is not a finite number
 */
export function checkCyclicOrder(a: number, b: number, c: number): boolean {
    validateInputs(a, b, c);
    return (a <= b && b <= c) || (b <= c && c <= a) || (c <= a && a <= b);
}

/**
 * Determines the cyclic order relationship between three numbers.
 * 
 * @param a - The first number in the sequence
 * @param b - The second number in the sequence
 * @param c - The third number in the sequence
 * @returns A CyclicOrderResult indicating the type of cyclic order
 * @throws {Error} If any of the input parameters is not a finite number
 */
export function determineCyclicOrder(a: number, b: number, c: number): CyclicOrderResult {
    validateInputs(a, b, c);
    if (checkStrictCyclicOrder(a, b, c)) {
        return CyclicOrderResult.STRICTLY_INCREASING;
    } else if (checkCyclicOrder(a, b, c)) {
        return CyclicOrderResult.INCREASING;
    } else {
        return CyclicOrderResult.NOT_IN_ORDER;
    }
}

/**
 * Validates that all input parameters are finite numbers.
 * 
 * @param numbers - The numbers to validate
 * @throws {Error} If any of the input parameters is not a finite number
 */
function validateInputs(...numbers: number[]): void {
    for (const num of numbers) {
        if (!Number.isFinite(num)) {
            throw new Error(`Invalid input: ${num} is not a finite number`);
        }
    }
}

/**
 * Checks if a sequence of numbers is in cyclic order.
 * 
 * @param sequence - An array of numbers to check
 * @returns True if the entire sequence is in cyclic order, false otherwise
 * @throws {Error} If the sequence has less than 3 elements or contains non-finite numbers
 */
export function isSequenceInCyclicOrder(sequence: number[]): boolean {
    if (sequence.length < 3) {
        throw new Error("Sequence must have at least 3 elements");
    }

    for (let i = 0; i < sequence.length; i++) {
        const a = sequence[i];
        const b = sequence[(i + 1) % sequence.length];
        const c = sequence[(i + 2) % sequence.length];

        if (!checkCyclicOrder(a, b, c)) {
            return false;
        }
    }

    return true;
}
