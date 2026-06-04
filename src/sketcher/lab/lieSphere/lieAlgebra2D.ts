// The planar Lie algebra o(3,2) and its exponential — the 2-D analogue of the
// lab's lieAlgebra.ts (o(4,2)), for driving Lie-sphere transforms of a curve
// from sliders. dim O(3,2) = 10; excluding the 2 translations (mouse-handled)
// leaves 8 generators.
//
// Metric G = diag(-1,1,1,1,-1) over [s0,s1,x,y,r]; X ∈ o(3,2) iff GX is
// antisymmetric, so a basis is X_{ij} with X[i][j]=G_i, X[j][i]=-G_j. Named
// generators (2-D versions of the lab's):
//   scale            = X_{01}             (s0–s1 boost ⇒ uniform scaling of the point)
//   rotation         = X_{23}             (rotation in the x–y plane)
//   special-conformal_k = X_{1k} - X_{0k} (Möbius "inversive bend", k = x,y)
//   laguerre-boost_k = X_{k4}             (cone/cylinder-style morph, k = x,y)
//   offset           = X_{04} + X_{14}    (radius shift — the Laguerre offset)
//   lie-mix          = X_{04} - X_{14}    (the direction in neither Möbius nor Laguerre)
import { type Mat5, identity5, matMul5 } from './lieCurve2D'

const G = [-1, 1, 1, 1, -1]

function zeros5(): Mat5 { return Array.from({ length: 5 }, () => new Array(5).fill(0)) }
function addMat5(a: Mat5, b: Mat5): Mat5 { const c = zeros5(); for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) c[i][j] = a[i][j] + b[i][j]; return c }
function subMat5(a: Mat5, b: Mat5): Mat5 { const c = zeros5(); for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) c[i][j] = a[i][j] - b[i][j]; return c }
export function scaleMat5(s: number, a: Mat5): Mat5 { const c = zeros5(); for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) c[i][j] = s * a[i][j]; return c }

/** Basis generator of o(3,2) acting in the (i, j) plane. */
export function genIJ(i: number, j: number): Mat5 { const X = zeros5(); X[i][j] = G[i]; X[j][i] = -G[j]; return X }

export type GeneratorGroup = 'conformal' | 'laguerre' | 'lie'
export interface NamedGenerator { key: string; label: string; group: GeneratorGroup; X: Mat5 }

/** The 8 generators, in slider order. */
export const SHAPE_GENERATORS: NamedGenerator[] = [
  { key: 'scale', label: 'Scale', group: 'conformal', X: genIJ(0, 1) },
  { key: 'rotation', label: 'Rotation', group: 'conformal', X: genIJ(2, 3) },
  { key: 'sct-x', label: 'Inversive bend X', group: 'conformal', X: subMat5(genIJ(1, 2), genIJ(0, 2)) },
  { key: 'sct-y', label: 'Inversive bend Y', group: 'conformal', X: subMat5(genIJ(1, 3), genIJ(0, 3)) },
  { key: 'boost-x', label: 'Laguerre boost X', group: 'laguerre', X: genIJ(2, 4) },
  { key: 'boost-y', label: 'Laguerre boost Y', group: 'laguerre', X: genIJ(3, 4) },
  { key: 'offset', label: 'Offset', group: 'laguerre', X: addMat5(genIJ(0, 4), genIJ(1, 4)) },
  { key: 'lie-mix', label: 'Lie mix', group: 'lie', X: subMat5(genIJ(0, 4), genIJ(1, 4)) },
]

function maxColSum(X: Mat5): number {
  let m = 0
  for (let j = 0; j < 5; j++) { let s = 0; for (let i = 0; i < 5; i++) s += Math.abs(X[i][j]); m = Math.max(m, s) }
  return m
}

/** Matrix exponential via scaling-and-squaring with a Taylor inner sum. */
export function expm5(X: Mat5): Mat5 {
  let squarings = 0
  let n = maxColSum(X)
  while (n > 0.5) { n /= 2; squarings++ }
  const Xs = scaleMat5(1 / 2 ** squarings, X)
  let term = identity5()
  let sum = identity5()
  for (let k = 1; k <= 16; k++) { term = scaleMat5(1 / k, matMul5(term, Xs)); sum = addMat5(sum, term) }
  let R = sum
  for (let i = 0; i < squarings; i++) R = matMul5(R, R)
  return R
}

/** exp(Σ coeffs[i] · SHAPE_GENERATORS[i].X) — the group element for a slider vector. */
export function liePoint5(coeffs: number[]): Mat5 {
  let X = zeros5()
  for (let i = 0; i < SHAPE_GENERATORS.length; i++) if (coeffs[i]) X = addMat5(X, scaleMat5(coeffs[i], SHAPE_GENERATORS[i].X))
  return expm5(X)
}
