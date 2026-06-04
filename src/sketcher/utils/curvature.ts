// Being migrated to core/ incrementally; remove this once a file is on core.
import type { Point2D, Curve } from '../types/curve'
import { findKnotSpan, isPeriodicRepresentation, findPeriodicKnotSpan, periodicKnotAt, periodicControlPointAt } from './bspline'

// Compute basis function derivatives
function basisFunctionDerivatives(
  span: number,
  t: number,
  degree: number,
  knots: number[],
  numDerivs: number
): number[][] {
  const ders: number[][] = []
  for (let i = 0; i <= numDerivs; i++) {
    ders.push(new Array(degree + 1).fill(0))
  }

  const ndu: number[][] = []
  for (let i = 0; i <= degree; i++) {
    ndu.push(new Array(degree + 1).fill(0))
  }

  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)

  ndu[0][0] = 1.0

  for (let j = 1; j <= degree; j++) {
    left[j] = t - knots[span + 1 - j]
    right[j] = knots[span + j] - t
    let saved = 0.0

    for (let r = 0; r < j; r++) {
      ndu[j][r] = right[r + 1] + left[j - r]
      const temp = ndu[r][j - 1] / ndu[j][r]
      ndu[r][j] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }
    ndu[j][j] = saved
  }

  for (let j = 0; j <= degree; j++) {
    ders[0][j] = ndu[j][degree]
  }

  const a: number[][] = [new Array(degree + 1).fill(0), new Array(degree + 1).fill(0)]

  for (let r = 0; r <= degree; r++) {
    let s1 = 0
    let s2 = 1
    a[0][0] = 1.0

    for (let k = 1; k <= numDerivs; k++) {
      let d = 0.0
      const rk = r - k
      const pk = degree - k

      if (r >= k) {
        a[s2][0] = a[s1][0] / ndu[pk + 1][rk]
        d = a[s2][0] * ndu[rk][pk]
      }

      const j1 = rk >= -1 ? 1 : -rk
      const j2 = r - 1 <= pk ? k - 1 : degree - r

      for (let j = j1; j <= j2; j++) {
        a[s2][j] = (a[s1][j] - a[s1][j - 1]) / ndu[pk + 1][rk + j]
        d += a[s2][j] * ndu[rk + j][pk]
      }

      if (r <= pk) {
        a[s2][k] = -a[s1][k - 1] / ndu[pk + 1][r]
        d += a[s2][k] * ndu[r][pk]
      }

      ders[k][r] = d
      const temp = s1
      s1 = s2
      s2 = temp
    }
  }

  let r = degree
  for (let k = 1; k <= numDerivs; k++) {
    for (let j = 0; j <= degree; j++) {
      ders[k][j] *= r
    }
    r *= degree - k
  }

  return ders
}

// Compute basis function derivatives for periodic curves
function periodicBasisFunctionDerivatives(
  span: number,
  t: number,
  degree: number,
  knots: number[],
  numDerivs: number
): number[][] {
  const ders: number[][] = []
  for (let i = 0; i <= numDerivs; i++) {
    ders.push(new Array(degree + 1).fill(0))
  }

  const ndu: number[][] = []
  for (let i = 0; i <= degree; i++) {
    ndu.push(new Array(degree + 1).fill(0))
  }

  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)

  ndu[0][0] = 1.0

  for (let j = 1; j <= degree; j++) {
    // Use periodicKnotAt for proper wrapping
    left[j] = t - periodicKnotAt(knots, span + 1 - j)
    right[j] = periodicKnotAt(knots, span + j) - t
    let saved = 0.0

    for (let r = 0; r < j; r++) {
      ndu[j][r] = right[r + 1] + left[j - r]
      const temp = ndu[j][r] === 0 ? 0 : ndu[r][j - 1] / ndu[j][r]
      ndu[r][j] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }
    ndu[j][j] = saved
  }

  for (let j = 0; j <= degree; j++) {
    ders[0][j] = ndu[j][degree]
  }

  const a: number[][] = [new Array(degree + 1).fill(0), new Array(degree + 1).fill(0)]

  for (let r = 0; r <= degree; r++) {
    let s1 = 0
    let s2 = 1
    a[0][0] = 1.0

    for (let k = 1; k <= numDerivs; k++) {
      let d = 0.0
      const rk = r - k
      const pk = degree - k

      if (r >= k) {
        a[s2][0] = ndu[pk + 1][rk] === 0 ? 0 : a[s1][0] / ndu[pk + 1][rk]
        d = a[s2][0] * ndu[rk][pk]
      }

      const j1 = rk >= -1 ? 1 : -rk
      const j2 = r - 1 <= pk ? k - 1 : degree - r

      for (let j = j1; j <= j2; j++) {
        a[s2][j] = ndu[pk + 1][rk + j] === 0 ? 0 : (a[s1][j] - a[s1][j - 1]) / ndu[pk + 1][rk + j]
        d += a[s2][j] * ndu[rk + j][pk]
      }

      if (r <= pk) {
        a[s2][k] = ndu[pk + 1][r] === 0 ? 0 : -a[s1][k - 1] / ndu[pk + 1][r]
        d += a[s2][k] * ndu[r][pk]
      }

      ders[k][r] = d
      const temp = s1
      s1 = s2
      s2 = temp
    }
  }

  let r = degree
  for (let k = 1; k <= numDerivs; k++) {
    for (let j = 0; j <= degree; j++) {
      ders[k][j] *= r
    }
    r *= degree - k
  }

  return ders
}

// Evaluate curve and its derivatives at parameter t
export function evaluateCurveDerivatives(
  curve: Curve,
  t: number,
  numDerivs: number = 2
): Point2D[] {
  const { degree, knots, closed } = curve
  const isPeriodic = closed && isPeriodicRepresentation(curve)

  // Handle periodic curves
  if (isPeriodic) {
    // Normalize t to [0, 1)
    t = ((t % 1) + 1) % 1

    const span = findPeriodicKnotSpan(degree, knots, t)
    const ders = periodicBasisFunctionDerivatives(span, t, degree, knots, numDerivs)

    const result: Point2D[] = []

    if (curve.kind === 'bspline') {
      const controlPoints = curve.controlPoints

      for (let k = 0; k <= numDerivs; k++) {
        let x = 0
        let y = 0
        for (let j = 0; j <= degree; j++) {
          const cp = periodicControlPointAt(controlPoints, span - degree + j)
          x += ders[k][j] * cp.x
          y += ders[k][j] * cp.y
        }
        result.push({ x, y })
      }
    } else if (curve.kind === 'rational') {
      // For rational curves, need to use quotient rule
      const controlPoints = curve.controlPoints
      const Aders: Point2D[] = []
      const wders: number[] = []

      for (let k = 0; k <= numDerivs; k++) {
        let x = 0
        let y = 0
        let w = 0
        for (let j = 0; j <= degree; j++) {
          const cp = periodicControlPointAt(controlPoints, span - degree + j)
          const dw = ders[k][j] * cp.w
          x += dw * cp.x
          y += dw * cp.y
          w += dw
        }
        Aders.push({ x, y })
        wders.push(w)
      }

      for (let k = 0; k <= numDerivs; k++) {
        let x = Aders[k].x
        let y = Aders[k].y

        for (let i = 1; i <= k; i++) {
          const binom = binomial(k, i)
          x -= binom * wders[i] * result[k - i].x
          y -= binom * wders[i] * result[k - i].y
        }

        result.push({ x: x / wders[0], y: y / wders[0] })
      }
    } else if (curve.kind === 'complex-rational') {
      // Complex rational - same approach with periodic control point access
      const controlPoints = curve.controlPoints
      const c0_ders: { re: number; im: number }[] = []
      const c1_ders: { re: number; im: number }[] = []

      for (let k = 0; k <= numDerivs; k++) {
        let c0_re = 0, c0_im = 0
        let c1_re = 0, c1_im = 0
        for (let j = 0; j <= degree; j++) {
          const cp = periodicControlPointAt(controlPoints, span - degree + j)
          const d = ders[k][j]
          const wz_re = cp.w_re * cp.re - cp.w_im * cp.im
          const wz_im = cp.w_re * cp.im + cp.w_im * cp.re
          c0_re += d * wz_re
          c0_im += d * wz_im
          c1_re += d * cp.w_re
          c1_im += d * cp.w_im
        }
        c0_ders.push({ re: c0_re, im: c0_im })
        c1_ders.push({ re: c1_re, im: c1_im })
      }

      for (let k = 0; k <= numDerivs; k++) {
        let num_re = c0_ders[k].re
        let num_im = c0_ders[k].im

        for (let i = 1; i <= k; i++) {
          const binom = binomial(k, i)
          const prev_re = result[k - i].x
          const prev_im = result[k - i].y
          const c1i_re = c1_ders[i].re
          const c1i_im = c1_ders[i].im
          const prod_re = c1i_re * prev_re - c1i_im * prev_im
          const prod_im = c1i_re * prev_im + c1i_im * prev_re
          num_re -= binom * prod_re
          num_im -= binom * prod_im
        }

        const c1_0_re = c1_ders[0].re
        const c1_0_im = c1_ders[0].im
        const denom = c1_0_re * c1_0_re + c1_0_im * c1_0_im
        if (denom < 1e-20) {
          result.push({ x: 0, y: 0 })
        } else {
          result.push({
            x: (num_re * c1_0_re + num_im * c1_0_im) / denom,
            y: (num_im * c1_0_re - num_re * c1_0_im) / denom,
          })
        }
      }
    }

    return result
  }

  // Standard (non-periodic) evaluation
  const span = findKnotSpan(degree, knots, t)
  const ders = basisFunctionDerivatives(span, t, degree, knots, numDerivs)

  const result: Point2D[] = []

  if (curve.kind === 'bspline') {
    const controlPoints = curve.controlPoints

    for (let k = 0; k <= numDerivs; k++) {
      let x = 0
      let y = 0
      for (let j = 0; j <= degree; j++) {
        const cp = controlPoints[span - degree + j]
        x += ders[k][j] * cp.x
        y += ders[k][j] * cp.y
      }
      result.push({ x, y })
    }
  } else if (curve.kind === 'rational') {
    // For rational curves, need to use quotient rule
    const controlPoints = curve.controlPoints
    const Aders: Point2D[] = []
    const wders: number[] = []

    for (let k = 0; k <= numDerivs; k++) {
      let x = 0
      let y = 0
      let w = 0
      for (let j = 0; j <= degree; j++) {
        const cp = controlPoints[span - degree + j]
        const dw = ders[k][j] * cp.w
        x += dw * cp.x
        y += dw * cp.y
        w += dw
      }
      Aders.push({ x, y })
      wders.push(w)
    }

    // Apply quotient rule for derivatives
    for (let k = 0; k <= numDerivs; k++) {
      let x = Aders[k].x
      let y = Aders[k].y

      for (let i = 1; i <= k; i++) {
        const binom = binomial(k, i)
        x -= binom * wders[i] * result[k - i].x
        y -= binom * wders[i] * result[k - i].y
      }

      result.push({ x: x / wders[0], y: y / wders[0] })
    }
  } else if (curve.kind === 'complex-rational') {
    // Complex rational - uses complex weights
    // We compute c0 = sum(N * w * z) and c1 = sum(N * w) where w and z are complex
    // Then the curve point is Re(c0/c1), Im(c0/c1)
    const controlPoints = curve.controlPoints

    // For derivative computation, we track both c0 and c1 derivatives
    // c0_ders[k] = sum(ders[k][j] * w_j * z_j) as complex
    // c1_ders[k] = sum(ders[k][j] * w_j) as complex
    const c0_ders: { re: number; im: number }[] = []
    const c1_ders: { re: number; im: number }[] = []

    for (let k = 0; k <= numDerivs; k++) {
      let c0_re = 0, c0_im = 0
      let c1_re = 0, c1_im = 0
      for (let j = 0; j <= degree; j++) {
        const cp = controlPoints[span - degree + j]
        const d = ders[k][j]
        // w * z = (w_re + w_im*i) * (z_re + z_im*i)
        // = (w_re*z_re - w_im*z_im) + (w_re*z_im + w_im*z_re)*i
        const wz_re = cp.w_re * cp.re - cp.w_im * cp.im
        const wz_im = cp.w_re * cp.im + cp.w_im * cp.re
        c0_re += d * wz_re
        c0_im += d * wz_im
        c1_re += d * cp.w_re
        c1_im += d * cp.w_im
      }
      c0_ders.push({ re: c0_re, im: c0_im })
      c1_ders.push({ re: c1_re, im: c1_im })
    }

    // Now compute curve derivatives using quotient rule for complex functions
    // result[k] = (c0^(k) - sum_{i=1}^{k} binom(k,i) * c1^(i) * result[k-i]) / c1^(0)
    // The result is the 2D point (Re(q), Im(q)) where q is the complex quotient

    for (let k = 0; k <= numDerivs; k++) {
      let num_re = c0_ders[k].re
      let num_im = c0_ders[k].im

      for (let i = 1; i <= k; i++) {
        const binom = binomial(k, i)
        // result[k-i] is a 2D point, treat as complex: z = x + y*i
        const prev_re = result[k - i].x
        const prev_im = result[k - i].y
        const c1i_re = c1_ders[i].re
        const c1i_im = c1_ders[i].im
        // c1^(i) * result[k-i] = (c1i_re + c1i_im*i) * (prev_re + prev_im*i)
        const prod_re = c1i_re * prev_re - c1i_im * prev_im
        const prod_im = c1i_re * prev_im + c1i_im * prev_re
        num_re -= binom * prod_re
        num_im -= binom * prod_im
      }

      // Divide by c1^(0): (num_re + num_im*i) / (c1_0_re + c1_0_im*i)
      const c1_0_re = c1_ders[0].re
      const c1_0_im = c1_ders[0].im
      const denom = c1_0_re * c1_0_re + c1_0_im * c1_0_im
      if (denom < 1e-20) {
        result.push({ x: 0, y: 0 })
      } else {
        result.push({
          x: (num_re * c1_0_re + num_im * c1_0_im) / denom,
          y: (num_im * c1_0_re - num_re * c1_0_im) / denom,
        })
      }
    }
  }

  return result
}

// Binomial coefficient
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  if (k === 0 || k === n) return 1

  let result = 1
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1)
  }
  return result
}

// Compute signed curvature at parameter t
export function curvatureAt(curve: Curve, t: number): number {
  const derivs = evaluateCurveDerivatives(curve, t, 2)

  const dx = derivs[1].x
  const dy = derivs[1].y
  const ddx = derivs[2].x
  const ddy = derivs[2].y

  const numerator = dx * ddy - dy * ddx
  const denominator = Math.pow(dx * dx + dy * dy, 1.5)

  if (Math.abs(denominator) < 1e-10) return 0
  return numerator / denominator
}

// Sample curvature along the curve
export function sampleCurvature(
  curve: Curve,
  numSamples: number = 100
): { t: number; point: Point2D; curvature: number; normal: Point2D }[] {
  const result: { t: number; point: Point2D; curvature: number; normal: Point2D }[] = []
  const knots = curve.knots
  const isPeriodic = curve.closed && isPeriodicRepresentation(curve)

  // For periodic curves, sample in [0, 1]
  const tMin = isPeriodic ? 0 : knots[curve.degree]
  const tMax = isPeriodic ? 1 : knots[knots.length - curve.degree - 1]

  for (let i = 0; i <= numSamples; i++) {
    const t = tMin + (i / numSamples) * (tMax - tMin)
    const derivs = evaluateCurveDerivatives(curve, t, 2)

    const point = derivs[0]
    const tangent = derivs[1]

    // Compute curvature
    const dx = tangent.x
    const dy = tangent.y
    const ddx = derivs[2].x
    const ddy = derivs[2].y

    const numerator = dx * ddy - dy * ddx
    const denominator = Math.pow(dx * dx + dy * dy, 1.5)
    const curvature = Math.abs(denominator) < 1e-10 ? 0 : numerator / denominator

    // Compute unit normal (perpendicular to tangent)
    const tangentLength = Math.sqrt(dx * dx + dy * dy)
    const normal =
      tangentLength < 1e-10
        ? { x: 0, y: 1 }
        : { x: -dy / tangentLength, y: dx / tangentLength }

    result.push({ t, point, curvature, normal })
  }

  return result
}

// Generate curvature comb data for visualization
export function curvatureComb(
  curve: Curve,
  numSamples: number = 100,
  scale: number = 50
): { base: Point2D; tip: Point2D; curvature: number }[] {
  const samples = sampleCurvature(curve, numSamples)

  return samples.map(({ point, curvature, normal }) => ({
    base: point,
    tip: {
      x: point.x + normal.x * curvature * scale,
      y: point.y + normal.y * curvature * scale,
    },
    curvature,
  }))
}
