
import { decomposeFunction, findSpan } from "../Piegl_Tiller_NURBS_Book";
import { BaseBSplineR1toR1 } from "./BaseBSplineR1toR1";
import { BernsteinDecompositionR1toR1, splineRecomposition } from "./BernsteinDecompositionR1toR1";
import { ScaledBernsteinDecompositionR1toR1, scaledDecomposeFunction } from "./ScaledBernsteinDecompositionR1toR1";

/**
 * A B-Spline function from a one dimensional real space to a one dimensional real space
 */
export class BSplineR1toR1 extends BaseBSplineR1toR1 {

    /**
     * Create a B-Spline
     * @param controlPoints The control points array
     * @param knots The knot vector
     */
    constructor(controlPoints: number[] = [0], knots: number[] = [0, 1]) {
        super(controlPoints, knots)
    }

    protected override factory(controlPoints: number[] = [0], knots: number[] = [0, 1]) {
        return new BSplineR1toR1(controlPoints, knots)
    }

    bernsteinDecomposition() {
        // Piegl_Tiller_NURBS_Book.ts
        return new BernsteinDecompositionR1toR1(decomposeFunction(this))
    }

    scaledBernsteinDecomposition() {
        // Piegl_Tiller_NURBS_Book.ts
        return new ScaledBernsteinDecompositionR1toR1(scaledDecomposeFunction(this))
    }

    clone() {
        return new BSplineR1toR1(this._controlPoints.slice(), this._knots.slice());
    }

    derivative() {
        let newControlPoints = []
        let newKnots = []
        for (let i = 0; i < this._controlPoints.length - 1; i += 1) {
            newControlPoints[i] = (this._controlPoints[i + 1] - (this._controlPoints[i])) * (this._degree / (this._knots[i + this._degree + 1] - this._knots[i + 1]));
        }
        newKnots = this._knots.slice(1, this._knots.length - 1);
        return new BSplineR1toR1(newControlPoints, newKnots);
    }

    elevateDegree(): BSplineR1toR1 {
        let bds = this.bernsteinDecomposition()
        bds = bds.elevateDegree()

        const knots = this.distinctKnots()


        const newSpline = splineRecomposition(bds, knots)

        for (let i = 0; i < knots.length; i += 1) {
            let m = this.knotMultiplicity(findSpan(knots[i], this.knots, this.degree))
            for (let j = 0; j < newSpline.degree - m - 1; j += 1) {
                newSpline.removeKnot(findSpan(newSpline.knots[i], newSpline.knots, newSpline.degree))
            }
        }
        return newSpline
    }

    removeKnot(indexFromFindSpan: number, tolerance: number | null = null) {
        //Piegl and Tiller, The NURBS book, p : 185

        let controlPoints = this.controlPoints
        let knots = this.knots
    
        const index = indexFromFindSpan

        // end knots are not removed
        
        if (!(index > this._degree && index < this.knots.length - this._degree - 1)) {
            throw new Error("index out of range")
        }
        
        
        //const double tolerance = 1;
        
        const multiplicity = this.knotMultiplicity(index, knots);
        
        const last = index - multiplicity
        const first = index -this.degree
        const offset = first -1;
        //std::vector<vectorType> local(2*degree+1);
        let local: number[] = []
        local[0] = controlPoints[offset];
        local[last+1-offset] = controlPoints[last+1]
        let i = first
        let j = last
        let ii = 1
        let jj = last - offset
        let removable = false
        
        // Compute new control point for one removal step
        while (j>i){
            let alpha_i = (knots[index] - knots[i])/(knots[i+this.degree+1]-knots[i])
            let alpha_j = (knots[index] - knots[j])/(knots[j+this.degree+1] - knots[j])
            local[ii] = (controlPoints[i] - (local[ii-1] * (1.0-alpha_i))) / alpha_i  
            local[jj] = (controlPoints[j] - (local[jj+1] * (alpha_j))) / (1.0-alpha_j) 
            ++i
            ++ii
            --j
            --jj
        }

        if (tolerance === null) {removable = true}
        else {
            if (j < i) {
                if ( (local[ii-1] - (local[jj+1])) <= tolerance){
                    removable = true
                }
            }
            else {
                const alpha_i = (knots[index] - knots[i]) / (knots[i+this.degree+1]-knots[i])
                const value = ((controlPoints[i] - ((local[ii+1] * (alpha_i)))) + (local[ii-1] * (1.0- alpha_i)))
                if ( value <= tolerance) {
                    removable = true
                }
            }
        } 
        
        if (removable === false) {
            console.log("Tolerance for knot removal exceeded")
            return
        }
            
        else {
            let i = first
            let j = last
            while (j > i) {
                controlPoints[i] = local[i-offset]
                controlPoints[j] = local[j-offset]
                ++i
                --j
            }
        }
        
        knots.splice(index, 1)
        const fout = (2*index - multiplicity - this.degree) / 2
        controlPoints.splice(fout, 1)
        //console.log(new BSplineR1toR1(controlPoints, knots))
        return new BSplineR1toR1(controlPoints, knots)
    }

    
    moveControlPoint(i: number, delta: number) {
        if (i < 0 || i >= this.controlPoints.length) {
            throw new Error("Control point indentifier is out of range")
        }
        let newControlPoints = this.controlPoints
        newControlPoints[i] += delta
        return new BSplineR1toR1(newControlPoints, this.knots)
    }


}
