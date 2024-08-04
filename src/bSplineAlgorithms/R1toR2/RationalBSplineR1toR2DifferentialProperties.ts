import type { BernsteinDecompositionR1toR1} from "../R1toR1/BernsteinDecompositionR1toR1";
import { determinant2by2 } from "../R1toR1/BernsteinDecompositionR1toR1"
import { BSplineR1toR1 } from "../R1toR1/BSplineR1toR1"
import type { IBSplineR1toR1 } from "../R1toR1/IBSplineR1toR1"
import type { RationalBSplineR1toR2 } from "./RationalBSplineR1toR2"



export class RationalBSplineR1toR2DifferentialProperties {

    private spline: RationalBSplineR1toR2
    private derivatives: Derivatives
    private ChenTerms: ChenTerms

    bSplineR1toR1Factory(controlPoints: number[], knots: number[]): IBSplineR1toR1 {
        return new BSplineR1toR1(controlPoints, knots)
    }

    constructor(spline: RationalBSplineR1toR2) {
        this.spline = spline.clone()
        this.derivatives = this.computeDerivatives()
        this.ChenTerms = this.ComputeChenTerms()
    }

    protected computeDerivatives() {
        const sx = this.bSplineR1toR1Factory(this.spline.getControlPointsX(), this.spline.knots)
        const sy = this.bSplineR1toR1Factory(this.spline.getControlPointsY(), this.spline.knots)
        const sw = this.bSplineR1toR1Factory(this.spline.getControlPointsW(), this.spline.knots)
        const sxu = sx.derivative()
        const syu = sy.derivative()
        const swu = sw.derivative()
        const sxuu = sxu.derivative()
        const syuu = syu.derivative()
        const swuu = swu.derivative()
        const sxuuu = sxuu.derivative()
        const syuuu = syuu.derivative()
        const swuuu = swuu.derivative()
        return {
            x: sx.bernsteinDecomposition(),
            y: sy.bernsteinDecomposition(),
            w: sw.bernsteinDecomposition(),
            xu: sxu.bernsteinDecomposition(),
            yu: syu.bernsteinDecomposition(),
            wu: swu.bernsteinDecomposition(),
            xuu: sxuu.bernsteinDecomposition(),
            yuu: syuu.bernsteinDecomposition(),
            wuu: swuu.bernsteinDecomposition(),
            xuuu: sxuuu.bernsteinDecomposition(),
            yuuu: syuuu.bernsteinDecomposition(),
            wuuu: swuuu.bernsteinDecomposition()
        };
    }

    protected ComputeChenTerms() {
        // reference: XIANMING CHEN, COMPLEXITY REDUCTION FOR SYMBOLIC COMPUTATION WITH RATIONAL B-SPLINES
        const s = this.derivatives
        return {
            w: s.w,
            wu: s.wu,
            D1x: (s.xu.multiply(s.w)).subtract(s.x.multiply(s.wu)),
            D1y: (s.yu.multiply(s.w)).subtract(s.y.multiply(s.wu)),
            D2x: (s.xuu.multiply(s.w)).subtract(s.x.multiply(s.wuu)),
            D2y: (s.yuu.multiply(s.w)).subtract(s.y.multiply(s.wuu)),
            D3x: (s.xuuu.multiply(s.w)).subtract(s.x.multiply(s.wuuu)),
            D3y: (s.yuuu.multiply(s.w)).subtract(s.y.multiply(s.wuuu)),
            D21x: (s.xuu.multiply(s.wu)).subtract(s.xu.multiply(s.wuu)),
            D21y: (s.yuu.multiply(s.wu)).subtract(s.yu.multiply(s.wuu))
        }
    }

    curvatureNumerator() {
        // reference: XIANMING CHEN, COMPLEXITY REDUCTION FOR SYMBOLIC COMPUTATION WITH RATIONAL B-SPLINES
        const s = this.derivatives
        const t1 = determinant2by2(s.xu, s.yu, s.xuu, s.yuu).multiply(s.w)
        const t2 = determinant2by2(s.x, s.y, s.xuu, s.yuu).multiply(s.wu)
        const t3 = determinant2by2(s.xu, s.yu, s.x, s.y).multiply(s.wuu)
        const distinctKnots = this.spline.distinctKnots()
        return (t1.subtract(t2).subtract(t3)).splineRecomposition(distinctKnots)
    }

    inflections(curvatureNumerator?: BSplineR1toR1) {
        if (!curvatureNumerator) {
            curvatureNumerator = this.curvatureNumerator()
        }
        const zeros = curvatureNumerator.zeros()
        let result = []
        for (let z of zeros) {
            result.push(this.spline.evaluate(z))
        }
        return result
    }

    curvatureDerivativeNumerator() {
        const s = this.derivatives
        const ct = this.ChenTerms
        const t0 = (ct.D1x.multiply(ct.D1x)).add(ct.D1y.multiply(ct.D1y))
        const t1 = determinant2by2(ct.D1x, ct.D1y, ct.D3x, ct.D3y)
        const t2 = determinant2by2(ct.D1x, ct.D1y, ct.D21x, ct.D21y)
        const t3 = determinant2by2(ct.D1x, ct.D1y, ct.D2x, ct.D2y)
        const t4 = s.wu.multiplyByScalar(2)
        const t5 = (ct.D1x.multiply(ct.D2x)).add(ct.D1y.multiply(ct.D2y)).multiplyByScalar(3)
        const distinctKnots = this.spline.distinctKnots()
        return ((t1.add(t2)).multiply(t0).multiply(s.w)).add(t4.multiply(t3).multiply(t0)).subtract(t5.multiply(t3).multiply(s.w)).splineRecomposition(distinctKnots)
    }

    curvatureExtrema(_curvatureDerivativeNumerator?: BSplineR1toR1) {
        if (!_curvatureDerivativeNumerator) {
            _curvatureDerivativeNumerator = this.curvatureDerivativeNumerator()
        }
        const zeros = _curvatureDerivativeNumerator.zeros()
        let result = []
        for (let z of zeros) {
            result.push(this.spline.evaluate(z))
        }
        return result
    }


}

export interface Derivatives {
    x: BernsteinDecompositionR1toR1
    y: BernsteinDecompositionR1toR1
    w: BernsteinDecompositionR1toR1
    xu: BernsteinDecompositionR1toR1
    yu: BernsteinDecompositionR1toR1
    wu: BernsteinDecompositionR1toR1
    xuu: BernsteinDecompositionR1toR1
    yuu: BernsteinDecompositionR1toR1
    wuu: BernsteinDecompositionR1toR1
    xuuu: BernsteinDecompositionR1toR1
    yuuu: BernsteinDecompositionR1toR1
    wuuu: BernsteinDecompositionR1toR1
}

export interface ChenTerms {
    w: BernsteinDecompositionR1toR1
    wu: BernsteinDecompositionR1toR1
    D1x: BernsteinDecompositionR1toR1
    D1y: BernsteinDecompositionR1toR1
    D2x: BernsteinDecompositionR1toR1
    D2y: BernsteinDecompositionR1toR1
    D3x: BernsteinDecompositionR1toR1
    D3y: BernsteinDecompositionR1toR1
    D21x: BernsteinDecompositionR1toR1
    D21y: BernsteinDecompositionR1toR1
}