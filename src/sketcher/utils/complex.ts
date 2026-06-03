// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// Complex number type and arithmetic operations

export interface Complex {
  re: number
  im: number
}

// Addition: (a + bi) + (c + di) = (a+c) + (b+d)i
export function cadd(a: Complex, b: Complex): Complex {
  return {
    re: a.re + b.re,
    im: a.im + b.im,
  }
}

// Subtraction: (a + bi) - (c + di) = (a-c) + (b-d)i
export function csub(a: Complex, b: Complex): Complex {
  return {
    re: a.re - b.re,
    im: a.im - b.im,
  }
}

// Multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
export function cmult(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  }
}

// Division: (a + bi) / (c + di) = ((ac + bd) + (bc - ad)i) / (c² + d²)
export function cdiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im
  if (denom === 0) {
    return { re: Infinity, im: Infinity }
  }
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  }
}

// Norm (magnitude): |a + bi| = sqrt(a² + b²)
export function cnorm(c: Complex): number {
  return Math.sqrt(c.re * c.re + c.im * c.im)
}

// Scale by real number
export function cscale(s: number, c: Complex): Complex {
  return {
    re: s * c.re,
    im: s * c.im,
  }
}

// Complex conjugate: conj(a + bi) = a - bi
export function cconj(c: Complex): Complex {
  return {
    re: c.re,
    im: -c.im,
  }
}

// Create complex from real
export function creal(r: number): Complex {
  return { re: r, im: 0 }
}

// Create complex from imaginary
export function cimag(i: number): Complex {
  return { re: 0, im: i }
}
