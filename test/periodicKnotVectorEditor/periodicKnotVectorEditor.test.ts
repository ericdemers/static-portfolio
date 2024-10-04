import { computeCyclicNewPosition, computeMultiplicityLeft, computeMultiplicityRight, computePeriodicMultiplicityLeft, computePeriodicMultiplicityRight } from "../../src/sketchElements/curve"

export function sum(a: number, b: number) {
    return a + b
  }


  test('move knots', () => {
    const knots1 = [0, -0.1, 0, 0, 0.3, 0.2,  0.7]
    expect(computeMultiplicityLeft(knots1, 0)).toBe(0)
    expect(computeMultiplicityRight(knots1, 0)).toBe(1)
    expect(computeMultiplicityLeft(knots1, 1)).toBe(1)
    expect(computeMultiplicityRight(knots1, 1)).toBe(0)
    expect(computeMultiplicityLeft(knots1, 2)).toBe(0)
    expect(computeMultiplicityRight(knots1, 2)).toBe(0)
    expect(computeMultiplicityLeft(knots1, 3)).toBe(0)
    expect(computeMultiplicityRight(knots1, 3)).toBe(0)
    expect(computeMultiplicityLeft(knots1, 4)).toBe(0)
    expect(computeMultiplicityRight(knots1, 4)).toBe(1)
    expect(computeMultiplicityLeft(knots1, 5)).toBe(1)
    expect(computeMultiplicityRight(knots1, 5)).toBe(0)
    
    const knots2 = [0, 0, 0, 0.3, 0.2, 1.01, 1.1, ]
    expect(computePeriodicMultiplicityRight(knots2, 6)).toBe(3)
    expect(computePeriodicMultiplicityLeft(knots2, 6)).toBe(0)
    expect(computePeriodicMultiplicityRight(knots2, 0)).toBe(0)
    expect(computePeriodicMultiplicityLeft(knots2, 0)).toBe(2)
  })

  test ('computeFirstKnotPosition', () => {
    expect(computeCyclicNewPosition(0, 0.5)).toBe(0.5)
    expect(computeCyclicNewPosition(0, 1.5)).toBe(0.5)
    expect(computeCyclicNewPosition(0, -0.2)).toBe(0.8)
    expect(computeCyclicNewPosition(0, 1)).toBe(0)
  })


