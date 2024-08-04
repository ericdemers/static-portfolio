export type Coordinates = Readonly<{
    x: number,
    y: number
}>

export const distance = (a: Coordinates, b: Coordinates) => Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) 

export function movePoint(point: Coordinates, vector: {x: number, y: number}): Coordinates {
    return {x: point.x + vector.x, y: point.y + vector.y}
}


