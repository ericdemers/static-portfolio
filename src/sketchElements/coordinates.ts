export type Coordinates = Readonly<{
    x: number,
    y: number
}>

export const distance = (a: Coordinates, b: Coordinates) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) 

export const distanceSquare = (a: Coordinates, b: Coordinates) => (Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))


export function movePoint(point: Coordinates, vector: {x: number, y: number}): Coordinates {
    return {x: point.x + vector.x, y: point.y + vector.y}
}

export function displacement(c1: Coordinates, c2: Coordinates): Coordinates {
    const {x: cx1, y: cy1} = c1
    const {x: cx2, y: cy2} = c2
    return {x: cx2 - cx1, y: cy2 - cy1}
}

export function middlePoint(c0: Coordinates, c1: Coordinates): Coordinates {
    return {x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2}
}

