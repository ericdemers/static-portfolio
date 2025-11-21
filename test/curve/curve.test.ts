import { computePeriodicBasisFunction } from "../../src/components/organisms/knotVectorEditor/basisFunctions";
import type { Coordinates } from "../../src/sketchElements/coordinates";
import { CoordinatesToVector2d, curveToPeriodicBSpline, curveToPeriodicRationalBSpline } from "../../src/sketchElements/curve";
import type { Curve} from "../../src/sketchElements/curveTypes";
import { Closed, CurveType } from "../../src/sketchElements/curveTypes";

// unit test for the curveToPeriodicRationalBSpline function
describe("curveToPeriodicRationalBSpline", () => {
  it("should return a periodic rational b-spline curve", () => {
    
    const curve: Curve = {id: "1", type: CurveType.Rational, 
        points: [{x: 0, y: 0}, {x: 0.5, y: 0}, {x: 1, y: 0}, {x: 1, y: 0.5}, {x: 1, y: 1}, {x: 0.5, y: 0.5}],
        knots: [0, 0, 0], closed: Closed.True, degree: 3, period: 1 }
    
    const bspline = curveToPeriodicRationalBSpline(curve)
    //console.log(bspline.controlPoints)
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


// unit test for the curveToPeriodicNonRationalBSpline function
describe("curveToNonRationalBSpline", () => {
  it("should return a periodic nonrational b-spline curve", () => {
    
    const curve: Curve = {id: "1", type: CurveType.Rational, 
        points: [{x: 0, y: 0}, {x: 0.5, y: 0}, {x: 0.5, y: 0.5}, {x: 0.5, y: 0.7}],
        knots: [0, 0, 0, 0.1], closed: Closed.True, degree: 4, period: 1 }
        
    const bspline = curveToPeriodicBSpline(curve)
    //expect(bspline).toBeDefined()
    //console.log(bspline)
    
    if (bspline === undefined) return
    expect(bspline.controlPoints[0].x).toBe(0)
    //console.log(bspline)
    
    //console.log(bspline.evaluate(0.1))
    
  })

  it("should also return a periodic nonrational b-spline curve", () => {
    
    const curve: Curve = {id: "1", type: CurveType.Rational, 
        points: [{x: 0, y: 0}, {x: 0.5, y: 0}, {x: 0.5, y: 0.5}],
        knots: [0, 0, 0.1], closed: Closed.True, degree: 4, period: 1 }
        
    const bspline = curveToPeriodicBSpline(curve)
    //expect(bspline).toBeDefined()
    //console.log(bspline)
    
    if (bspline === undefined) return
    expect(bspline.controlPoints[0].x).toBe(0)
    console.log(bspline)
    
    //console.log(bspline.evaluate(0.1))

    const basisFunctions = computePeriodicBasisFunction(curve)
    console.log(basisFunctions[1])
    
  })
    

})
  

/*
// unit test for the CoordinatesToComplex2d function
describe("CoordinatesToComplex2d", () => {
  it("should return correct values", () => {
    const list = [{x: 827, y: 257}, 
      {x: 812, y: 194.5}, {x: 797, y: 132},
    {x: 628.5, y: 144},
  {x: 460, y: 156}, {x: }]
  })

})
  */


