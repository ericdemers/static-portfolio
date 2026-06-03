// @ts-nocheck — ported from ../sketcher Lie Sphere lab (engine intact)
/**
 * The Lie algebra o(4,2) and its exponential, for driving Lie sphere
 * transformations from sliders. dim O(4,2) = 15; the 8 *shape-changing*
 * generators (the rest — 3 rotations, 3 translations, 1 scaling — are rigid
 * motions / similarity, handled by the mouse) are exposed here.
 *
 * With metric G = diag(-1,1,1,1,1,-1), X ∈ o(4,2) iff GX is antisymmetric, so a
 * basis is X_{ij} = G·E_{ij}: X[i][j] = G_i, X[j][i] = -G_j. The named
 * generators are geometric combinations of these (see DESIGN.md):
 *   special-conformal_k = X_{1k} - X_{0k}   (Möbius, "inversive bend")
 *   laguerre-boost_k    = X_{k5}            (cylinder↔cone style morph)
 *   offset              = X_{05} + X_{15}   (radius shift, dX_offset closed form)
 *   lie-mix             = X_{05} - X_{15}   (the direction in neither Möbius nor Laguerre)
 */

import { type Mat6, identity6, matMul6 } from './lieTransform'

const G = [-1, 1, 1, 1, 1, -1]

function zeros6(): Mat6 {
  return Array.from({ length: 6 }, () => new Array(6).fill(0))
}

function addMat6(a: Mat6, b: Mat6): Mat6 {
  const c = zeros6()
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) c[i][j] = a[i][j] + b[i][j]
  return c
}

function subMat6(a: Mat6, b: Mat6): Mat6 {
  const c = zeros6()
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) c[i][j] = a[i][j] - b[i][j]
  return c
}

export function scaleMat6(s: number, a: Mat6): Mat6 {
  const c = zeros6()
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) c[i][j] = s * a[i][j]
  return c
}

/** Basis generator of o(4,2) acting in the (i, j) plane. */
export function genIJ(i: number, j: number): Mat6 {
  const X = zeros6()
  X[i][j] = G[i]
  X[j][i] = -G[j]
  return X
}

export type GeneratorGroup = 'conformal' | 'laguerre' | 'lie'

export interface NamedGenerator {
  key: string
  label: string
  group: GeneratorGroup
  X: Mat6
}

/** The 8 shape-changing generators, in slider order. */
export const SHAPE_GENERATORS: NamedGenerator[] = [
  { key: 'sct-x', label: 'inversive bend X', group: 'conformal', X: subMat6(genIJ(1, 2), genIJ(0, 2)) },
  { key: 'sct-y', label: 'inversive bend Y', group: 'conformal', X: subMat6(genIJ(1, 3), genIJ(0, 3)) },
  { key: 'sct-z', label: 'inversive bend Z', group: 'conformal', X: subMat6(genIJ(1, 4), genIJ(0, 4)) },
  { key: 'boost-x', label: 'Laguerre boost X', group: 'laguerre', X: genIJ(2, 5) },
  { key: 'boost-y', label: 'Laguerre boost Y', group: 'laguerre', X: genIJ(3, 5) },
  { key: 'boost-z', label: 'Laguerre boost Z', group: 'laguerre', X: genIJ(4, 5) },
  { key: 'offset', label: 'offset', group: 'laguerre', X: addMat6(genIJ(0, 5), genIJ(1, 5)) },
  { key: 'lie-mix', label: 'Lie mix', group: 'lie', X: subMat6(genIJ(0, 5), genIJ(1, 5)) },
]

function maxColSum(X: Mat6): number {
  let m = 0
  for (let j = 0; j < 6; j++) {
    let s = 0
    for (let i = 0; i < 6; i++) s += Math.abs(X[i][j])
    m = Math.max(m, s)
  }
  return m
}

/** Matrix exponential via scaling-and-squaring with a Taylor inner sum. */
export function expm6(X: Mat6): Mat6 {
  let squarings = 0
  let n = maxColSum(X)
  while (n > 0.5) {
    n /= 2
    squarings++
  }
  const Xs = scaleMat6(1 / 2 ** squarings, X)

  let term = identity6()
  let sum = identity6()
  for (let k = 1; k <= 16; k++) {
    term = scaleMat6(1 / k, matMul6(term, Xs))
    sum = addMat6(sum, term)
  }

  let R = sum
  for (let i = 0; i < squarings; i++) R = matMul6(R, R)
  return R
}

/** exp(Σ coeffs[i] · SHAPE_GENERATORS[i].X). */
export function liePoint(coeffs: number[]): Mat6 {
  let X = zeros6()
  for (let i = 0; i < SHAPE_GENERATORS.length; i++) {
    if (coeffs[i]) X = addMat6(X, scaleMat6(coeffs[i], SHAPE_GENERATORS[i].X))
  }
  return expm6(X)
}
