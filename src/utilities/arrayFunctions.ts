//https://hackage.haskell.org/package/groupBy-0.1.0.0/docs/Data-List-GroupBy.html
//https://stackoverflow.com/questions/26675688/best-way-to-group-adjacent-array-items-by-value

export function groupAdjacentBy<T>(f: (a: T, b: T) => boolean, list: T[]) : T[][] {
    if (list.length === 0) return [[]]
    let result: T[][] = []
    list.forEach(elem => {
        if (result.length !== 0 && f(elem, result[result.length - 1][0])) {
            result[result.length - 1].push(elem)
        } else {
            result.push([elem])
        }
    })
    return result
}

export function countAdjacentBy<T>(f: (a: T, b: T) => boolean, list: T[]) : number[] {
    if (list.length === 0) return []
    let result: number[] = []
    let last: T
    list.forEach(curent => {
        if (result.length !== 0 && f(curent, last)) {
            result[result.length - 1] += 1
        } else {
            last = curent
            result.push(1)
        }
    })
    return result
}