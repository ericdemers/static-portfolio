

export function binomialCoefficient(n: number, k: number) {
    let result = 1
    if (n < k || k < 0) {
        return 0;
    }
    // take advantage of symmetry
    if (k > n - k) {
        k = n - k;
    }
    for (let x = n - k + 1; x <= n; x += 1) {result *= x; }
    for (let x = 1; x <= k; x += 1) {result /= x; }
    return result;
}

export function memoizedBinomialCoefficient() {
    let cache: number[][] = []
    return (n: number, k: number) => {
        if (cache[n] !== undefined && cache[n][k] !== undefined ) {
            return cache[n][k]
        }
        else {
            if (cache[n] === undefined) {
                cache[n] = []
            }
            const result = binomialCoefficient(n, k)
            cache[n][k] = result
            return result
        }
    }

}



/**
 * Calculates the binomial coefficient (n choose k).
 * @param n Total number of items
 * @param k Number of items to choose
 * @returns The binomial coefficient or 0 if inputs are invalid
 */
export function binomialCoefficient2(n: number, k: number): number {
    if (!Number.isInteger(n) || !Number.isInteger(k)) {
        throw new Error("Inputs must be integers");
    }
    if (n < k || k < 0) {
        return 0;
    }
    // Take advantage of symmetry
    if (k > n - k) {
        k = n - k;
    }
    let result = 1;
    for (let i = 0; i < k; i++) {
        result *= (n - i) / (i + 1);
    }
    return Math.round(result); // Ensure integer result
}


/**
 * Creates a memoized version of the binomial coefficient function.
 * @returns A memoized function to calculate binomial coefficients
 */
export function memoizedBinomialCoefficient2(): (n: number, k: number) => number {
    const cache: Map<string, number> = new Map();
    
    return (n: number, k: number): number => {
        const key = `${n},${k}`;
        if (cache.has(key)) {
            return cache.get(key)!;
        } else {
            const result = binomialCoefficient2(n, k);
            cache.set(key, result);
            return result;
        }
    };
}