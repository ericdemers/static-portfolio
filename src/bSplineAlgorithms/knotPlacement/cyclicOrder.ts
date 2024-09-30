// https://en.wikipedia.org/wiki/Cyclic_order

export function checkStrictCyclicOrder(a: number, b: number, c: number) {
    return (a < b  && b < c) || (b < c && c < a) || (c < a && a < b)
}

export function checkCyclicOrder(a: number, b: number, c: number) {
    return (a <= b  && b <= c) || (b <= c && c <= a) || (c <= a && a <= b)
}