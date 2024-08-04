import { clampingFindSpan, findSpan } from "../Piegl_Tiller_NURBS_Book"
import { Vector2d } from "../../mathVector/Vector2d"
import { BaseBSplineR1toR2, deepCopyControlPoints } from "./BaseBSplineR1toR2"
import type { BSplineR1toR2DifferentialPropertiesInterface } from "./BaseBSplineR1toR2DifferentialProperties"

import { Vector3d } from "../../mathVector/Vector3d"
import { BSplineR1toR2DifferentialProperties } from "./BSplineR1toR2DifferentialProperties"
import { RationalBSplineR1toR2 } from "./RationalBSplineR1toR2"

/**
 * A B-Spline function from a one dimensional real space to a two dimensional real space
 */
export class BSplineR1toR2 extends BaseBSplineR1toR2 {

    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: readonly Vector2d[] = [new Vector2d(0, 0)], knots: readonly number[] = [0, 1]) {
        super(controlPoints, knots)
    }

    
    protected override factory(controlPoints: readonly Vector2d[] = [new Vector2d(0, 0)], knots: readonly number[] = [0, 1]) {
        return new BSplineR1toR2(controlPoints, knots) as this
    }
    


    get freeControlPoints(): Vector2d[] {
        return this.controlPoints
    }


    /**
     * Return a deep copy of this b-spline
     */
    
    clone() : BSplineR1toR2 {
        let cloneControlPoints = deepCopyControlPoints(this._controlPoints)
        return new BSplineR1toR2(cloneControlPoints, this._knots.slice())
    }
    


    optimizerStep(step: number[]) {
        for (let i = 0; i < this._controlPoints.length; i += 1) {
            this._controlPoints[i].x += step[i]
            this._controlPoints[i].y += step[i + this._controlPoints.length]
        }
    }



    /**
     * 
     * @param fromU Parametric position where the section start
     * @param toU Parametric position where the section end
     * @retrun the BSpline_R1_to_R2 section
     */
    extract(fromU: number, toU: number) {

        let spline = this.clone()
        spline = spline.clamp(fromU)
        spline = spline.clamp(toU)


        const newFromSpan = clampingFindSpan(fromU, spline._knots, spline._degree)
        const newToSpan = clampingFindSpan(toU, spline._knots, spline._degree)

        let newKnots : number[] = []
        let newControlPoints : Vector2d[] = []


        for (let i = newFromSpan - spline._degree; i < newToSpan + 1; i += 1) {
            newKnots.push(spline._knots[i])
        }

        for (let i = newFromSpan - spline._degree; i < newToSpan - spline._degree; i += 1) {
            newControlPoints.push(new Vector2d(spline._controlPoints[i].x, spline._controlPoints[i].y))
        }

        return new BSplineR1toR2(newControlPoints, newKnots)
    }

    /**
     * Degree elevation algorithm of Prautzsch
     */
    elevateDegree() {
        const s = this.generateIntermediateSplinesForDegreeElevation()
        let splineHigherDegree = new BSplineR1toR2(s.controlPolygons[0], s.knotVectors[0]) as BaseBSplineR1toR2
        if(this.knotMultiplicity(this._knots[0]) !== this._degree + 1 || this.knotMultiplicity(this.knots[this._knots.length - 1]) !== this._degree + 1) {
            for( let i = 1; i <= this._degree; i += 1) {
                let splineTemp = new BSplineR1toR2(s.controlPolygons[i], s.knotVectors[i]) as BaseBSplineR1toR2
                let j = 0
                while(j < splineHigherDegree.knots.length ) {
                    if(splineHigherDegree.knots[j] !== splineTemp.knots[j] && splineHigherDegree.knots[j] < splineTemp.knots[j]) {
                        splineTemp = splineTemp.insertKnot(splineHigherDegree.knots[j])
                    } else if(splineHigherDegree.knots[j] !== splineTemp.knots[j] && splineHigherDegree.knots[j] > splineTemp.knots[j]) {
                        splineHigherDegree = splineHigherDegree.insertKnot(splineTemp.knots[j])
                    }
                    j += 1
                }
                for( let ind = 0; ind < splineHigherDegree.controlPoints.length; ind += 1) {
                    let cp = splineHigherDegree.controlPoints[ind].add(splineTemp.controlPoints[ind])
                    let cps = splineHigherDegree.controlPoints
                    cps[ind] = cp
                    splineHigherDegree = new BSplineR1toR2(cps, splineHigherDegree.knots)
                }
            }
            for(let j = 0; j < splineHigherDegree.controlPoints.length; j += 1) {
                let cp = splineHigherDegree.controlPoints[j].multiply(1/(this.degree + 1))
                let cps = splineHigherDegree.controlPoints
                cps[j] = cp
                splineHigherDegree = new BSplineR1toR2(cps, splineHigherDegree.knots)
            }
        }
        else throw new Error('incompatible knot vector of the input spline')
        return new BSplineR1toR2(splineHigherDegree.controlPoints, splineHigherDegree.knots)

    }

    generateIntermediateSplinesForDegreeElevation() {
        let knotVectors: number[][] = []
        let controlPolygons: Vector2d[][] = []
        for(let i = 0; i <= this.degree; i+= 1) {
            let knotVector = this.knots.slice()
            let controlPolygon = this.controlPoints.slice()
            let k = 0
            for(let j = i; j < this.knots.length; j += this.degree + 1) {
                knotVector.splice((j + k), 0, this.knots[j])
                if(j < this.controlPoints.length) {
                    let controlPoint = this.controlPoints[j]
                    controlPolygon.splice((j + k), 0, controlPoint)
                }
                k += 1
            }
            knotVectors.push(knotVector)
            controlPolygons.push(controlPolygon)
        }
        return {    
            knotVectors: knotVectors,
            controlPolygons: controlPolygons
        }
    }

    toRationalBSPlineR1toR2() {
        let cp: Vector3d[] = []
        for (let i = 0; i < this.controlPoints.length; i += 1) {
            cp.push(new Vector3d(this.controlPoints[i].x, this.controlPoints[i].y, 1))
        }
        return new RationalBSplineR1toR2(cp, this.knots)

    }
    
    
/*
    elevateDegreeWithRemoveKnot() {
        const sx = new BSplineR1toR1(this.getControlPointsX(), this.knots)
        const sy = new BSplineR1toR1(this.getControlPointsY(), this.knots)
        const bdsx = sx.bernsteinDecomposition()
        const bdsy = sy.bernsteinDecomposition()
        bdsx.elevateDegree()
        bdsy.elevateDegree()

        const knots = this.distinctKnots()


        const sxNew = splineRecomposition(bdsx, knots)
        const syNew = splineRecomposition(bdsy, knots)

        let newcp: Vector2d[] = []
        for (let i = 0; i < sxNew.controlPoints.length; i += 1) {
            newcp.push(new Vector2d(sxNew.controlPoints[i], syNew.controlPoints[i]))
        }
        let newSpline = new BSplineR1toR2(newcp, sxNew.knots)

        for (let i = 0; i < knots.length; i += 1) {
            let m = this.knotMultiplicity(findSpan(knots[i], this.knots, this.degree))
            for (let j = 0; j < newSpline.degree - m - 1; j += 1) {
                newSpline.removeKnot(findSpan(newSpline.knots[i], newSpline.knots, newSpline.degree))
            }
        }

        
        this.controlPoints = newSpline.controlPoints
        this.knots = newSpline.knots
        this._degree = newSpline.degree
        
        
        return newSpline
    }

    removeKnot(indexFromFindSpan: number, tolerance: number = 10e-5) {
        //Piegl and Tiller, The NURBS book, p : 185
    
        const index = indexFromFindSpan

        // end knots are not removed
        if (index > this._degree && index < this.knots.length-this._degree - 1) {
            throw new Error("index out of range")
        }
        
        //const double tolerance = 1;
        
        const multiplicity = this.knotMultiplicity(index);
        
        const last = index - multiplicity
        const first = index -this.degree
        const offset = first -1;
        //std::vector<vectorType> local(2*degree+1);
        let local: Vector2d[] = []
        local[0] = this.controlPoints[offset];
        local[last+1-offset] = this.controlPoints[last+1];
        let i = first;
        let j = last;
        let ii = 1;
        let jj = last - offset;
        let removable = false;
        
        // Compute new control point for one removal step
        while (j>i){
            let alpha_i = (this.knots[index] - this.knots[i])/(this.knots[i+this.degree+1]-this.knots[i]);
            let alpha_j = (this.knots[index] - this.knots[j])/(this.knots[j+this.degree+1] - this.knots[j]);
            local[ii] = (this._controlPoints[i].subtract(local[ii-1].multiply(1.0-alpha_i))).multiply(1 / alpha_i ) 
            local[jj] = (this._controlPoints[j].subtract(local[jj+1].multiply(alpha_j))).multiply(1 / (1.0-alpha_j) )
            ++i;
            ++ii;
            --j;
            --jj;
        }
        
        if (j < i) {
            if ((local[ii-1].subtract(local[jj+1])).norm() <= tolerance){
                removable = true;
            }
        }
        else {
            const alpha_i = (this.knots[index] - this.knots[i]) / (this.knots[i+this.degree+1]-this.knots[i]) ;
            if ( ((this._controlPoints[i].subtract((local[ii+1].multiply(alpha_i)))).add (local[ii-1].multiply(1.0- alpha_i))).norm() <= tolerance) {
                removable = true;
            }
        }
        
        if (!removable) return;
        else {
            let iii = first;
            let jjj = last;
            while (jjj > i) {
                this._controlPoints[iii] = local[iii-offset];
                this._controlPoints[jjj] = local[jjj-offset];
                ++iii;
                --jjj;
            }
        }
        
        this.knots.splice(index, 1)
        
        const fout = (2*index - multiplicity - this.degree) / 2;
        this._controlPoints.splice(fout, 1);
    }

    */

    distinctKnots() {
        let result = [this.knots[0]]
        let temp = result[0]
        for (let i = 1; i < this.knots.length; i += 1) {
            if (this.knots[i] !== temp) {
                result.push(this.knots[i]);
                temp = this.knots[i];
            }
        }
        return result;
    }

    getDifferentialProperties(): BSplineR1toR2DifferentialPropertiesInterface {
        return new BSplineR1toR2DifferentialProperties(this)
    }

    /*
    insertKnot(u: number, times: number = 1): BSplineR1toR2 {
        return super.insertKnot(u, times) as BSplineR1toR2
    }

    clamp(u: number): BSplineR1toR2 {
        return super.clamp(u) as BSplineR1toR2
    }
    */

}


export function create_BSplineR1toR2(controlPoints: number[][], knots: number[]){
    let newControlPoints: Vector2d[] = []
    for (let cp of controlPoints) {
        newControlPoints.push(new Vector2d(cp[0], cp[1]))
    }
    return new BSplineR1toR2(newControlPoints, knots)
}

