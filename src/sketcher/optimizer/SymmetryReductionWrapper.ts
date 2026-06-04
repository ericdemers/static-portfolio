// Being migrated to core/ incrementally; remove this once a file is on core.
/**
 * Wraps an OptimizationProblem to enforce symmetry by variable reduction.
 *
 * Instead of adding equality constraints (approximate, slow), this wrapper
 * reduces the variable space so that symmetry is exact by construction.
 *
 * Example: 8 CPs with both X and Y axes → 4 free variables instead of 16.
 * The optimizer works in the reduced space; expansion to full variables
 * automatically satisfies all symmetry relations.
 *
 * Variable layout (inner problem): [x_0..x_{n-1}, y_0..y_{n-1}]
 *
 * For each symmetry orbit, one representative CP is chosen (smallest index).
 * Its free coordinates become reduced variables:
 *   - x is free unless CP is self-mirror on Y-axis (x must be 0)
 *   - y is free unless CP is self-mirror on X-axis (y must be 0)
 *
 * Expansion from reduced to full uses sign rules:
 *   - X-axis mirror: same x, negate y
 *   - Y-axis mirror: negate x, same y
 *   - Both: negate x, negate y
 */

import type { OptimizationProblem, Matrix } from './types'

interface ExpansionEntry {
  fullIndex: number
  coeff: number
}

export class SymmetryReductionWrapper implements OptimizationProblem {
  private readonly expansionMap: ExpansionEntry[][]
  private readonly inner: OptimizationProblem

  constructor(
    inner: OptimizationProblem,
    mapX: number[] | null,
    mapY: number[] | null,
  ) {
    this.inner = inner
    const n = inner.numVariables / 2
    this.expansionMap = buildExpansionMap(n, mapX, mapY)
  }

  get numVariables(): number {
    return this.expansionMap.length
  }

  get numConstraints(): number {
    return this.inner.numConstraints
  }

  get numEqualityConstraints(): number {
    return this.inner.numEqualityConstraints
  }

  getVariables(): number[] {
    const full = this.inner.getVariables()
    const reduced = new Array(this.expansionMap.length)
    for (let k = 0; k < this.expansionMap.length; k++) {
      // First entry is always the representative with coeff = +1
      const entry = this.expansionMap[k][0]
      reduced[k] = full[entry.fullIndex]
    }
    return reduced
  }

  setVariables(x: number[]): void {
    this.inner.setVariables(this.expandToFull(x))
  }

  /** Expand reduced variables to full variable vector. */
  expandToFull(reduced: number[]): number[] {
    const full = new Array(this.inner.numVariables).fill(0)
    for (let k = 0; k < reduced.length; k++) {
      for (const { fullIndex, coeff } of this.expansionMap[k]) {
        full[fullIndex] = coeff * reduced[k]
      }
    }
    return full
  }

  /** Get the full (expanded) variables from the inner problem. */
  getFullVariables(): number[] {
    return this.inner.getVariables()
  }

  computeObjective(): number {
    return this.inner.computeObjective()
  }

  computeObjectiveGradient(): number[] {
    const fullGrad = this.inner.computeObjectiveGradient()
    return this.reduceVector(fullGrad)
  }

  computeConstraints(): number[] {
    return this.inner.computeConstraints()
  }

  computeConstraintJacobian(): Matrix {
    const fullJ = this.inner.computeConstraintJacobian()
    const m = fullJ.length
    const nReduced = this.expansionMap.length
    const J: number[][] = new Array(m)
    for (let i = 0; i < m; i++) {
      const row = new Array(nReduced).fill(0)
      for (let k = 0; k < nReduced; k++) {
        for (const { fullIndex, coeff } of this.expansionMap[k]) {
          row[k] += coeff * fullJ[i][fullIndex]
        }
      }
      J[i] = row
    }
    return J
  }

  getConstraintSigns(): number[] {
    return this.inner.getConstraintSigns()
  }

  getInactiveConstraints(): Set<number> {
    return this.inner.getInactiveConstraints()
  }

  updateConstraintState(): void {
    this.inner.updateConstraintState()
  }

  /** Reduce a full-space vector to reduced space (J^T style). */
  private reduceVector(full: number[]): number[] {
    const reduced = new Array(this.expansionMap.length).fill(0)
    for (let k = 0; k < this.expansionMap.length; k++) {
      for (const { fullIndex, coeff } of this.expansionMap[k]) {
        reduced[k] += coeff * full[fullIndex]
      }
    }
    return reduced
  }
}

/**
 * Build the expansion map from mirror maps.
 *
 * Returns an array where expansionMap[k] lists the full-variable entries
 * that reduced variable k expands to. Each entry has a fullIndex and a
 * coefficient (+1 or -1).
 */
function buildExpansionMap(
  n: number,
  mapX: number[] | null,
  mapY: number[] | null,
): ExpansionEntry[][] {
  // Step 1: Find symmetry orbits via BFS
  const visited = new Set<number>()
  const orbits: { rep: number; members: Map<number, { sx: number; sy: number }> }[] = []

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue

    const members = new Map<number, { sx: number; sy: number }>()
    members.set(i, { sx: 1, sy: 1 })
    const queue = [i]

    while (queue.length > 0) {
      const cp = queue.pop()!
      const { sx, sy } = members.get(cp)!

      // X-axis mirror: preserves x, negates y
      if (mapX) {
        const mirror = mapX[cp]
        if (mirror !== -1 && !members.has(mirror)) {
          members.set(mirror, { sx, sy: -sy })
          queue.push(mirror)
        }
      }

      // Y-axis mirror: negates x, preserves y
      if (mapY) {
        const mirror = mapY[cp]
        if (mirror !== -1 && !members.has(mirror)) {
          members.set(mirror, { sx: -sx, sy })
          queue.push(mirror)
        }
      }
    }

    for (const m of members.keys()) visited.add(m)
    orbits.push({ rep: i, members })
  }

  // Step 2: For each orbit representative, determine free coordinates
  // and build expansion entries
  const expansionMap: ExpansionEntry[][] = []

  for (const { rep, members } of orbits) {
    const selfMirrorX = mapX !== null && mapX[rep] === rep // y must be 0
    const selfMirrorY = mapY !== null && mapY[rep] === rep // x must be 0

    // x-coordinate is free unless self-mirror on Y-axis
    if (!selfMirrorY) {
      const entries: ExpansionEntry[] = []
      // Representative first (coeff = +1)
      entries.push({ fullIndex: rep, coeff: 1 })
      for (const [cpIdx, { sx }] of members) {
        if (cpIdx !== rep) {
          entries.push({ fullIndex: cpIdx, coeff: sx })
        }
      }
      expansionMap.push(entries)
    }

    // y-coordinate is free unless self-mirror on X-axis
    if (!selfMirrorX) {
      const entries: ExpansionEntry[] = []
      // Representative first (coeff = +1)
      entries.push({ fullIndex: n + rep, coeff: 1 })
      for (const [cpIdx, { sy }] of members) {
        if (cpIdx !== rep) {
          entries.push({ fullIndex: n + cpIdx, coeff: sy })
        }
      }
      expansionMap.push(entries)
    }
  }

  return expansionMap
}
