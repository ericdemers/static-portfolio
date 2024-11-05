import type { Coordinates } from "../../src/sketchElements/coordinates";
import { curveToPeriodicRationalBSpline } from "../../src/sketchElements/curve";
import type { Curve} from "../../src/sketchElements/curveTypes";
import { Closed, CurveType } from "../../src/sketchElements/curveTypes";

// unit test for the curveToPeriodicRationalBSpline function
describe("curveToPeriodicRationalBSpline", () => {
  it("should return a periodic rational b-spline curve", () => {
    const curve: Curve = {id: "1", type: CurveType.Rational, 
        points: [{x: 0, y: 0}, {x: 0.5, y: 0}, {x: 1, y: 0}, {x: 1, y: 0.5}, {x: 1, y: 1}, {x: 0.5, y: 0.5}],
        knots: [0, 0, 0], closed: Closed.True, degree: 3, period: 1 }
    const bspline = curveToPeriodicRationalBSpline(curve)
    expect(bspline).toBeDefined()
    if (bspline === undefined) return
    expect(bspline.controlPoints[0].z).toBe(1)
    expect(bspline.controlPoints[1].z).toBe(1)
    expect(bspline.controlPoints[2].z).toBe(1)
    expect(bspline.controlPoints[3].z).toBe(1)
    expect(bspline.controlPoints[4].z).toBe(1)
    expect(bspline.controlPoints[5].z).toBe(1)
  })

})


