# Linear-complexity interactive drag (curvature-extrema control)

Where the interactive drag stands on per-frame complexity vs the number of control
points `n`, what the Rust `ne-core` blueprint achieves, and the concrete path to get
the TypeScript live drag from its current super-linear cost to `O(n)`.

A **drag frame** = one constrained interior-point solve (a few Newton iterations).
Each Newton iteration = **assembly** (constraint Jacobian/Hessian) + a **linear solve**
of the Newton/KKT system. Linear-per-frame needs BOTH to be `O(n)`: a banded/arrowhead
solve (not dense Cholesky) AND local/seeded assembly (not dense FD).

## The question
Is the drag linear in `n` for all curve kinds? Can the TS side get there?

## Measured TODAY (TS), ms per frame, curvature-extrema control ON

Cross-curve, open, current live drag (sketcher dense IPOPT):

| CPs | b-spline | rational | complex-rational | PH (new g, closed) |
|----:|------:|--------:|-----------------:|-------------------:|
|  30 |    67 |     526 |            2 132 |                132 |
|  60 |   457 |   2 944 |           13 527 |                508 |
|  90 | 1 544 |   8 546 |           32 346 |              1 242 |
| 120 | 4 083 |  21 708 |           63 496 |              2 461 |

Doubling `n` (60→120) multiplies time by ~9× (b-spline), ~7× (rational), ~5×
(complex-rational), ~5× (PH). **Nothing is linear; everything is ~O(n^2.5–3),
dominated by the dense Cholesky solve.**

PH closed, OLD rational g vs NEW low-degree g (the shipped win, see
`phCurvatureExtrema.ts`): 30 CPs 1316→132, 60 5071→508, 90 7813→1242, 120 12525→2461
(≈10× at small n, ≈5× at large n — a big constant factor, not a complexity change).

**Why PH < b-spline at large n:** PH optimizes the degree-2 *generator* (~38 vars for a
30-CP curve) not the curve (~60 vars); the dense solve is `O(vars³)`, so PH's smaller
system makes its solve ~4× cheaper and it scales better once the cubic solve dominates.
(At small n the b-spline wins: PH carries the generate→curve rebuild + an FD extrema
Jacobian as fixed overhead.)

## Rust `ne-core` — the blueprint (mostly linear)

| family | open | closed |
|---|---|---|
| polynomial b-spline | **O(n)** | **O(n)** |
| rational | **O(n)** | **O(n)** |
| complex-rational | **O(n)** | **O(n)** |
| **PH** | **O(n³)** | **O(n³)** |

The planar/rational/complex families are linear because Rust has all three pieces:
- **Banded LDLᵀ** for open (`banded.rs`, `O(n·b²)`, band width `b` fixed by degree).
- **Arrowhead/Woodbury** for closed (`cyclic.rs`): the seam is a low-rank corner, not a
  dense band — `s+2` banded solves + one `s×s` dense solve, `s = O(d)`.
- **Local/seeded assembly**: sparse `LocalColumn` (Chen) or a fixed-capacity sparse
  `Jet` (`JET_CAP=32`, NOT `n` tangents) → `O(n·d²)`.
- Plus a live **windowed solve** (`solve_windowed`, `windowed_tol=1e-8` set on every drag
  entry) → sub-`O(n)` for a *local* drag (window size set by drag locality, not `n`).

**PH is the exception even in Rust:** `PhDragProblem` never opts into `banded()`, so its
Newton step is a dense `O(n³)` Cholesky. PH *assembly* is `O(n)` (the sparse Jet); only
the solve is cubic. So PH is dense-solve-bound on both sides.

## TS current state — the gap

Net per-frame: **`O(n³)` for every live kind** (dense Cholesky dominates). Audit
findings:

- **Live drag uses the sketcher's own dense IPOPT** (`sketcher/optimizer/InteriorPoint-
  Optimizer.ts` → dense `choleskySolve`), for all kinds. `sceneStore` open-planar drags
  deliberately use `sketcher/optimizer/optimizeCurve`, NOT core `slideCurve`.
- **The linear pieces exist in `core/` but are off the live path:**
  - Banded LDLᵀ: `core/banded.ts` (`ldlFactorBand`/`ldlSolveBand`, `O(n·b²)`).
  - Banded optimizers: `core/barrierOptimizer.ts`, `core/bandedPrimalDual.ts`.
  - Local seeded gradients: `core/gradient.ts`
    (`curvatureExtremaGradientPlanarLocal`, `…PeriodicLocal`, `precomputePeriodicSeeds`),
    `core/curvature.ts` (`precomputeComplexPeriodicSeeds`).
  - Sparse local Jacobian: `PlanarCurvatureProblem.computeConstraintJacobianLocal`.
  - All reachable ONLY via `slideCurve method:'barrier'|'primal-dual'`, which is itself
    used only by the cs2026 talk demos — doubly removed from the live drag.
- **Missing entirely:** no `solveWindowed`; no arrowhead/cyclic solver for closed curves
  (closed has NO near-linear path — `banded = !closed`); the sketcher optimizer has no
  banded solver and emits dense full-width Jacobian rows; PH still uses an FD extrema
  Jacobian (`O(n²)` assembly) and a dense solve.

## Proof point — core's banded solver works (validates the whole direction)

`slideCurve` dense (`ipopt`) vs banded (`barrier`), open b-spline, curvature-extrema on
(same problem, only `method` differs):

| CPs | dense | banded | dense/banded |
|----:|------:|-------:|-------------:|
|  30 |   432 |    108 |        4.0× |
|  60 | 1 234 |    278 |        4.4× |
| 120 | 4 174 |    535 |        7.8× |
| 180 | 9 324 |  **529** |     **17.6×** |

Dense keeps climbing (super-linear); **banded flattens** (278→535→529 from 60→120→180 —
barely moves 120→180). Both land on the same curve (maxΔ ≈ 0.5% of curve width; the small
drift is the known "`barrier` can let the bound drift on a quick drag" gap). So the
linear machinery already in `core/` delivers — the remaining work is wiring, not
invention.

## Path to linear (leverage order)

1. **Bound-faithful banded drag, routed live** (the big one). Make `barrier`/banded
   keep the curvature-extrema bound on quick drags (today it can drift — see
   [[core-slidecurve-banded-default-violates-bound]] / [[ipopt-is-the-invariant-keeper]]),
   then route the live open-planar drag through it (sceneStore → core, or port the banded
   path into the sketcher optimizer). Universal win for b-spline/rational/complex.
2. **Arrowhead/cyclic solver for closed curves** — port `cyclic.rs`; closed has no
   near-linear path today.
3. **PH banded** — assembly is already cheap (low-degree g); give it an analytic/seeded
   extrema Jacobian + banded (interleaved-generator) ordering so the solve stops being
   dense. Greenfield (Rust hasn't done it either).
4. **Windowed solve** ([[windowed-solve-handoff]]) — only after 1–3; it makes the solve
   sub-`O(n)` for local drags but is a no-op until the solve is the bottleneck.

See also [[closed-curve-abstractions-to-preserve]], [[ph-drag-analytic-jacobian-finding]].
Cross-reference: Rust `crates/ne-core/src/{interior_point,banded,cyclic,analytic_*}.rs`.
