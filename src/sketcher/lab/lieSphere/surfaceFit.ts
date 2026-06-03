// @ts-nocheck — ported from ../sketcher Lie Sphere lab (engine intact)
/**
 * 2-D degree-targeted reduction: fit a rational tensor-product Bézier patch
 * (homogeneous control net) to the exactly-evaluable transformed surface.
 *
 * The transformed surface is an exact rational tensor-product (degree d_u in u,
 * degree d_v in v); we recover it by sampling the numerical Picture-1 pipeline
 * and solving the linear system at the target degrees — same idea as the 1-D
 * rationalFit, now over a (u, v) grid. v ranges over one θ-arc so the patch is a
 * plain rational Bézier (no periodic knots); the full surface is a few arcs.
 */

import { type Vec3 } from './lieTransform'
import { bernsteinBasis, lstsq } from './rationalFit'

export interface SurfaceSample {
  u: number
  v: number
  p: Vec3
}

export interface RationalPatch {
  degU: number
  degV: number
  /** Homogeneous control net: ctrl[i][j] = [x, y, z, w], i=0..degU, j=0..degV. */
  ctrl: number[][][]
}

/**
 * Fit a degree (degU, degV) rational Bézier patch to samples, gauge w[0][0]=1.
 * Each sample contributes three real equations from numCoord − p·W = 0.
 */
export function fitRationalPatch(samples: SurfaceSample[], degU: number, degV: number): RationalPatch {
  const nu = degU + 1
  const nv = degV + 1
  const nCp = nu * nv
  // unknown index for control point (i,j) component c (0=x,1=y,2=z,3=w):
  //   4*(i*nv + j) + c, except (0,0,3) [w00] is fixed to 1.
  const idx = (i: number, j: number, c: number) => 4 * (i * nv + j) + c
  const W00 = idx(0, 0, 3)
  const remap = (k: number) => (k < W00 ? k : k - 1) // collapse the fixed unknown
  const nUnknown = 4 * nCp - 1

  const A: number[][] = []
  const rhs: number[] = []

  for (const { u, v, p } of samples) {
    const Bu = bernsteinBasis(degU, u)
    const Bv = bernsteinBasis(degV, v)
    for (let c = 0; c < 3; c++) {
      // numCoord_c − p_c·W = 0
      const row = new Array(nUnknown).fill(0)
      let r = 0
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const b = Bu[i] * Bv[j]
          // numerator coord c term:
          row[remap(idx(i, j, c))] += b
          // −p_c·W term (weight component 3):
          const wk = idx(i, j, 3)
          if (wk === W00) {
            r += p[c] * b // fixed w00 = 1 → move to RHS
          } else {
            row[remap(wk)] += -p[c] * b
          }
        }
      }
      A.push(row)
      rhs.push(r)
    }
  }

  const x = lstsq(A, rhs)

  const ctrl: number[][][] = []
  for (let i = 0; i < nu; i++) {
    const rowI: number[][] = []
    for (let j = 0; j < nv; j++) {
      const cp = [0, 0, 0, 0]
      for (let c = 0; c < 4; c++) {
        const k = idx(i, j, c)
        cp[c] = k === W00 ? 1 : x[remap(k)]
      }
      rowI.push(cp)
    }
    ctrl.push(rowI)
  }
  return { degU, degV, ctrl }
}

export function evalRationalPatch(patch: RationalPatch, u: number, v: number): Vec3 {
  const Bu = bernsteinBasis(patch.degU, u)
  const Bv = bernsteinBasis(patch.degV, v)
  let x = 0
  let y = 0
  let z = 0
  let w = 0
  for (let i = 0; i <= patch.degU; i++) {
    for (let j = 0; j <= patch.degV; j++) {
      const b = Bu[i] * Bv[j]
      const cp = patch.ctrl[i][j]
      x += b * cp[0]
      y += b * cp[1]
      z += b * cp[2]
      w += b * cp[3]
    }
  }
  return [x / w, y / w, z / w]
}
