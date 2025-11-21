// Reference : Fast Automatic Knot Placement Method for Accurate B-spline curve Fitting, by Raine Yeh, Youssef S. G. Nashed, Tom Peterka, Xavier Tricoche, Computer-aided design 128 (2020)

import { CholeskyDecomposition } from "../../linearAlgebra/CholeskyDecomposition"
import { DenseMatrix } from "../../linearAlgebra/DenseMatrix"
import { zeroVector } from "../../linearAlgebra/MathVectorBasicOperations"
import { SymmetricMatrix } from "../../linearAlgebra/SymmetricMatrix"

import { basisFunctions, findSpan } from "../Piegl_Tiller_NURBS_Book"
import { BSplineR1toR1 } from "../R1toR1/BSplineR1toR1"
import { BSplineR1toR2 } from "../R1toR2/BSplineR1toR2"
import { Vector2d } from "../../mathVector/Vector2d"



export function automaticFitting(initialSpline: BSplineR1toR2, scale = 1, resolutionFactor = 0.3) {
    if (initialSpline.degree < 3) {
        return initialSpline
    }
    const spline0 = removeOverlappingControlPoints(initialSpline, 0.005 / scale)
    //console.log(spline0)
    const spline = approximateArcLengthParametrization(spline0)
    //console.log(spline)
    //const spline = approximateArcLengthParametrization(initialSpline)
    //const spline = initialSpline
    //const spline = spline0
    

    const cff = cumulativeFeatureFunction(spline, 3)
    let knots = knotDistribution(cff, 3, resolutionFactor * Math.pow(scale, 1 / 3))
    if (knots.length >= initialSpline.knots.length) {
        knots = knotDistribution(cff, 3, resolutionFactor / 2 * Math.pow(scale, 1 / 3))
    }
    //console.log(spline)
    const cp = leastSquareApproximation2(spline, knots, 3)
    if (cp.length >= initialSpline.controlPoints.length) {
        return initialSpline
    }
    //console.log(cp)
    let terminate = false
    cp.forEach( c=>{
            if(isNaN(c.x) || isNaN(c.y)){
                //console.log(c.x)
                //console.log(initialSpline)
                terminate = true
            }
        }
    )
    if (terminate) return
    return new BSplineR1toR2(cp, knots)

}

export function removeASingleKnotAndApproximate(initialSpline: BSplineR1toR2, knotIndex: number) {
    let newKnots = [...initialSpline.knots]
    newKnots.splice(knotIndex, 1)
    const cp = leastSquareApproximation2(initialSpline, newKnots)
    return new BSplineR1toR2(cp, newKnots)
}







function cffToBSpline(cff: {xs: number[], ys: number[]}) {
    const knots = uniformKnots(3, cff.xs.length)
    let cp: Vector2d[] = []
    for (let i = 0; i < cff.xs.length; i += 1) {
        cp.push(new Vector2d(cff.xs[i] * 500 + 100, - cff.ys[i] * 10 + 500))
    }
    return new BSplineR1toR2(cp, knots)
}

function removeOverlappingControlPoints(spline: BSplineR1toR2, tolerance = 0.00001) {
    let newControlPoints: Vector2d[] = []
    let temp: Vector2d = spline.controlPoints[0]
    spline.controlPoints.forEach((p, index) => {
        //console.log(p)
        if (index === 0) {
            newControlPoints.push(p)
        } else {
            if (p.distance(temp) > tolerance) {
                newControlPoints.push(p)
                temp = p
            }
        }
    })
    //console.log(newControlPoints.length)
    if (newControlPoints.length - spline.degree - 1 < 0) {
        return spline
    }
    let newKnots = uniformKnots(spline.degree, newControlPoints.length)
    return new BSplineR1toR2(newControlPoints, newKnots)
}


export function approximateArcLengthParametrization(spline: BSplineR1toR2) {
    const distinctKnots = spline.distinctKnots()
    if (spline.knots.length !== (spline.degree + 1) * 2 + distinctKnots.length - 2) {
        throw new Error("Assumption: multiplicity is 1 for all interior knots")
    }
    const points = distinctKnots.map(u => spline.evaluate(u))
    const p0 = points.slice(0, -1)
    const distances = p0.map((p, i) => Math.hypot(p.x - points[i + 1].x, p.y - points[i + 1].y))
    let sum = 0
    const cummulativeDistances = distances.map((sum = 0, d => sum += d))
    const totalLength = distances.reduce((total, dist) => total + dist)
    const k0 = Array(spline.degree + 1).fill(0) 
    const k1 = cummulativeDistances.slice(0, -1).map(u => u / totalLength)
    const k2 = Array(spline.degree + 1).fill(1) 
    const newKnots = k0.concat(k1).concat(k2)
    return new BSplineR1toR2(spline.controlPoints, newKnots)
}

export function cumulativeFeatureFunction(spline: BSplineR1toR2, nthDerivative: number) {
    if (nthDerivative > spline.degree) {
        throw new Error("nthDerivative has to be lower than spline.degree")
    }
    let sx = new BSplineR1toR1(spline.getControlPointsX(), spline.knots)
    let sy = new BSplineR1toR1(spline.getControlPointsY(), spline.knots)
    for (let i = 0; i < nthDerivative; i += 1) {
        sx = sx.derivative()
        sy = sy.derivative()
    }
    const distinctKnots = spline.distinctKnots()
    const sxs = distinctKnots.map(u => sx.evaluate(u))
    const sys = distinctKnots.map(u => sy.evaluate(u))

    const featureFunction = sxs.map((v, i) => Math.pow(Math.pow(v, 2) + Math.pow(sys[i], 2), 1 / (nthDerivative * 2 )))
    //const featureFunction = sxs.map((v, i) => Math.pow(Math.pow(v, 2) + Math.pow(sys[i], 2), 1 / (2 )))
    //console.log(junk)
    //console.log(featureFunction)
    const cumulativeFeatureFunction = integrate(distinctKnots, featureFunction)
    //console.log(cumulativeFeatureFunction)
    return {xs: distinctKnots, ys: cumulativeFeatureFunction}
}

function integrate(xs: number[], ys: number[]) {
    let result = [0]
    for (let i = 1; i < xs.length; i += 1) {
        result.push(result[i - 1] + (xs[i] - xs[i - 1]) * (ys[i] + ys[i - 1]) / 2)
        //result.push(result[i - 1] + Math.pow((xs[i] - xs[i - 1]), 2) * (ys[i] + ys[i - 1]) / 2)
    }
    return result
}

export function knotDistribution(cumulativeFeatureFunction: {xs: number[], ys: number[]}, degree: number, resolutionFactor = 0.2) {
    const {xs, ys} = cumulativeFeatureFunction
    //console.log(cumulativeFeatureFunction)
    
    const numberOfIteriorKnot = Math.round(ys[ys.length - 1] * resolutionFactor)
    const delta = 1 / (numberOfIteriorKnot + 1) * ys[ys.length -1]
    let y = delta
    let result: number[] = Array(degree + 1).fill(0)
    for (let i = 1; i < ys.length; i += 1) {
        while (y < ys[i] && y < ys[ys.length - 1] - delta / 2) {
            result.push( xs[i - 1] + (xs[i] - xs[i - 1]) * (y - ys[i - 1]) / (ys[i] - ys[i - 1]) )
            y += delta
        }
    }
    // Remove last interior knot !!!!!!!!!!!!!!!!!!!!!
    //if (result.length > degree + 1)
    //result.splice(-1)
    result = result.concat(Array(degree + 1).fill(1))
    //console.log(result)
    return result

}

// reference: The Nubrs Book, Piegl and Tiller, p. 410 - 412
export function leastSquareApproximation(splineToApproximate: BSplineR1toR2, newKnots: number[] ) {
    const degree = 3
    const numberOfControlPoints = newKnots.length - degree - 1
    const us = sampleBetweenKnotsPlusEndPoints(newKnots, degree)
    //console.log("us")
    //console.log(us)

    const Qs = us.map(u => splineToApproximate.evaluate(u))
    const NplusEndPoints = us.map(u => {
        const span = findSpan(u, newKnots, degree)
        const basis = basisFunctions(span, u, newKnots, degree)
        return {span, basis}
    })

    //console.log(Qs)



    let N = new DenseMatrix(us.length - 2, numberOfControlPoints - 2)
    NplusEndPoints.forEach((item, i) => {
        if (i === 0 || i === us.length - 1) return //remove end points
        const {span, basis} = item
        basis.forEach((value, j) => {
            if (span - degree + j === 0 || span - degree + j === numberOfControlPoints - 1) return //remove end basis functions
            N.set(i - 1, span - degree + j - 1, value)
        })
    })


    let NtN = new SymmetricMatrix(numberOfControlPoints - 2)

    for (let i = 0; i < numberOfControlPoints - 2; i += 1) {
        for (let j = i; j < numberOfControlPoints - 2; j += 1) {
            let value = 0
            for (let k = 0; k < us.length - 2; k += 1) {
                value += N.get(k, i) * N.get(k, j)
            }
            NtN.set(i, j, value)
        }
    }

   
    
   

    let Rkx = Qs.map(value => value.x)
    let Rky = Qs.map(value => value.y)

    
    
    let indexU = 0
    
    while (us[indexU] < newKnots[degree + 1]) {
        Rkx[indexU] -= Qs[0].x * NplusEndPoints[indexU].basis[0]
        Rky[indexU] -= Qs[0].y * NplusEndPoints[indexU].basis[0]
        indexU += 1 
    }
    

    
    
    indexU = Qs.length - 1
    while (us[indexU] > newKnots[newKnots.length - degree - 2]) {
        Rkx[indexU] -= Qs[Qs.length - 1].x * NplusEndPoints[indexU].basis[degree]
        Rky[indexU] -= Qs[Qs.length - 1].y * NplusEndPoints[indexU].basis[degree]
        indexU -= 1 
    }
    

    
    
    
    let Rex = zeroVector(numberOfControlPoints)
    let Rey = zeroVector(numberOfControlPoints)

    for (let s = 1; s < us.length - 1; s += 1) {
        for (let i = 0; i < degree + 1; i += 1) {
            Rex[i + NplusEndPoints[s].span - degree] += NplusEndPoints[s].basis[i] * Rkx[s]
            Rey[i + NplusEndPoints[s].span - degree] += NplusEndPoints[s].basis[i] * Rky[s]
        }
    }


    const Rx = Rex.slice(1, -1)
    const Ry = Rey.slice(1, -1)
    

    const cd = new CholeskyDecomposition(NtN)
    const Px = cd.solve(Rx)
    const Py = cd.solve(Ry)



    let points: Vector2d[] = []
    points.push(Qs[0])
    for (let i = 0; i < Px.length; i += 1) {
        points.push(new Vector2d(Px[i], Py[i]))
    }
    points.push(Qs[Qs.length - 1])

    return points

    
}

export function leastSquareApproximation2(splineToApproximate: BSplineR1toR2, newKnots: number[], degreeOfReturnedCurve: number = splineToApproximate.degree ) {
    //const degree = splineToApproximate.degree
    const numberOfControlPoints = newKnots.length - degreeOfReturnedCurve - 1
    const us = sampleBetweenKnotsPlusEndPoints(newKnots, degreeOfReturnedCurve)
    //console.log("us")
    //console.log(us)

    const Qs = us.map(u => splineToApproximate.evaluate(u))
    const NplusEndPoints = us.map(u => {
        const span = findSpan(u, newKnots, degreeOfReturnedCurve)
        const basis = basisFunctions(span, u, newKnots, degreeOfReturnedCurve)
        return {span, basis}
    })

    //console.log(Qs)



    let N = new DenseMatrix(us.length, numberOfControlPoints)
    NplusEndPoints.forEach((item, i) => {
        const {span, basis} = item
        basis.forEach((value, j) => {
            N.set(i, span - degreeOfReturnedCurve + j, value)
        })
    })


    let NtN = new SymmetricMatrix(numberOfControlPoints)

    
    for (let i = 0; i < numberOfControlPoints; i += 1) {
        for (let j = i; j < numberOfControlPoints; j += 1) {
            let value = 0
            for (let k = 0; k < us.length; k += 1) {
                value += N.get(k, i) * N.get(k, j)
            }
            NtN.set(i, j, value)
        }
    }

    /*
    for (let i = 0; i < numberOfControlPoints; i += 1) {
            NtN.set(i, i, 1)
    }
    */

   
    
   

    let Rkx = Qs.map(value => value.x)
    let Rky = Qs.map(value => value.y)

    
    let Rex = zeroVector(numberOfControlPoints)
    let Rey = zeroVector(numberOfControlPoints)

    for (let s = 0; s < us.length; s += 1) {
        for (let i = 0; i < degreeOfReturnedCurve + 1; i += 1) {
            Rex[i + NplusEndPoints[s].span - degreeOfReturnedCurve] += NplusEndPoints[s].basis[i] * Rkx[s]
            Rey[i + NplusEndPoints[s].span - degreeOfReturnedCurve] += NplusEndPoints[s].basis[i] * Rky[s]
        }
    }


    const Rx = Rex
    const Ry = Rey

    //const Rx = Rex.map((u, i) => 100 + 10 * i)
    //const Ry = Rey.map((u, i) => 100 + 10 * i)

    //console.log(Rx)
    

    const cd = new CholeskyDecomposition(NtN)
    const Px = cd.solve(Rx)
    const Py = cd.solve(Ry)
    
    /*
    const square = NtN.squareMatrix()
    const Px = lusolve(square, Rx)!
    const Py = lusolve(square, Ry)!
    */
    
    
    

    //console.log(Px)
    //console.log(Py)



    let points: Vector2d[] = []
   
    for (let i = 0; i < Px.length; i += 1) {
        points.push(new Vector2d(Px[i], Py[i]))
    }


    return points

    
}



function sampleBetweenKnotsPlusEndPoints(knots: number[], degree: number, subdivision = 8) {
    let us: number[] = []
    
    
    us.push(0)
    for (let i = degree; i < knots.length - 1 - degree; i += 1) {
        for (let j = 1; j < subdivision + 1; j += 1) {
            const value = knots[i] + (knots[i + 1] - knots[i]) * j / (subdivision + 1) 
            if (value !== 1) us.push(value)
        }
    }
    us.push(1)
    
    

    //us = grevilleAbscissae(knots, degree)
    //console.log(knots)
    //console.log(us)
    return us
}

function grevilleAbscissae(knots: number[], degree: number) {
    let result = []
    for (let i = 0; i < knots.length - degree - 1; i += 1) {
        let sum = 0
        for (let j = i + 1; j < i + degree + 1; j += 1) {
            sum += knots[j]
        }
        result.push(sum / degree)
    }
    return result
}

function smoothControlPolygon(spline: BSplineR1toR2) {
    const ga = grevilleAbscissae(spline.knots, spline.degree)
    const newControlPoints = ga.map((u) => spline.evaluate(u))
    return new BSplineR1toR2(newControlPoints, spline.knots)
}

export function uniformKnots(degree: number, numberOfControlPoints: number) {
    const numberOfInteriorKnot = numberOfControlPoints - degree - 1
    if (numberOfInteriorKnot < 0) {
        throw new Error("The number of interior knot cannot be negative") 
    }
    let knots: number[] = []
    for (let i = 0; i < degree + 1; i += 1) {
        knots.push(0)
    }
    const step = 1 / (numberOfInteriorKnot + 1)
    for (let i = 0; i < numberOfInteriorKnot; i += 1) {
        knots.push(step + i * step)
    }
    for (let i = 0; i < degree + 1; i += 1) {
        knots.push(1)
    }
    return knots
}

