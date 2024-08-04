

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