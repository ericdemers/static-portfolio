import { BernsteinDecomposition } from './bernstein'

/**
 * A complex-valued B-spline function in Bernstein form: real and imaginary
 * parts are each a BernsteinDecomposition. Complex arithmetic on top of the
 * real B-spline-function algebra — used to assemble the complex-rational
 * curvature numerator.
 */
export class ComplexBD {
  readonly re: BernsteinDecomposition
  readonly im: BernsteinDecomposition

  constructor(re: BernsteinDecomposition, im: BernsteinDecomposition) {
    this.re = re
    this.im = im
  }

  add(o: ComplexBD): ComplexBD {
    return new ComplexBD(this.re.add(o.re), this.im.add(o.im))
  }
  sub(o: ComplexBD): ComplexBD {
    return new ComplexBD(this.re.subtract(o.re), this.im.subtract(o.im))
  }
  mul(o: ComplexBD): ComplexBD {
    return new ComplexBD(
      this.re.multiply(o.re).subtract(this.im.multiply(o.im)),
      this.re.multiply(o.im).add(this.im.multiply(o.re)),
    )
  }
  scale(s: number): ComplexBD {
    return new ComplexBD(this.re.scale(s), this.im.scale(s))
  }
  conj(): ComplexBD {
    return new ComplexBD(this.re, this.im.scale(-1))
  }
  derivative(): ComplexBD {
    return new ComplexBD(this.re.derivative(), this.im.derivative())
  }
}
