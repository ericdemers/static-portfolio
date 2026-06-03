// Minimal complex arithmetic for complex-rational B-splines.

export interface Complex {
  re: number
  im: number
}

export const cadd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
})

export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
})

export const csub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
})

/** Scale a complex number by a real. */
export const cscale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k })

/** Magnitude |a + bi|. */
export const cnorm = (a: Complex): number => Math.sqrt(a.re * a.re + a.im * a.im)

/** Complex conjugate. */
export const cconj = (a: Complex): Complex => ({ re: a.re, im: -a.im })

export function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  }
}

/** Integer power z^n (n positive, negative, or zero). */
export function cpow(z: Complex, n: number): Complex {
  if (n === 0) return { re: 1, im: 0 }
  if (n === 1) return z
  if (n === -1) {
    const normSq = z.re * z.re + z.im * z.im
    if (normSq < 1e-20) return { re: 0, im: 0 }
    return { re: z.re / normSq, im: -z.im / normSq }
  }
  if (n > 0) {
    let result = z
    for (let i = 1; i < n; i++) result = cmul(result, z)
    return result
  }
  return cpow(cpow(z, -n), -1)
}
