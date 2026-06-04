# Architecture

This app (numericelements.com) is built in **two intentional layers**. Keeping the
boundary clean is the point — they are not accidental duplication.

```
src/core/      clean, fully-typed reference engine   ← the spec
src/talks/     the Curves & Surfaces 2026 deck        ← uses core/ only
src/sketcher/  the interactive editor (+ Lie-sphere lab)  ← production engine
src/pages/     routing/shell                          ← uses core/ only
```

## Layer 1 — `core/` : the clean reference engine

A small (~9k line), fully type-checked, heavily tested B-spline + curvature
engine: Bernstein algebra, the curvature-extrema / inflection numerators, the
analytic gradients, and the interior-point optimizers.

- **Authoritative for the theory.** The curvature-extrema *bound* and its
  preservation live here. The talk demos run on `core/`.
- **The "reference + optimized, equivalence-tested" pattern.** Where a fast path
  exists, the slow/obvious version is kept as a *readable oracle* and a test locks
  the two bit-equal. Examples: the dense AD gradient is the oracle for the local
  (hoisted analytic-partials) gradient; the finite-difference Jacobian was the
  oracle for the analytic complex-rational one. **Do not delete an oracle** — it
  is the spec the fast path is checked against.
- **Self-contained.** `core/` imports nothing from `sketcher/`. `talks/` and
  `pages/` import only `core/`. This independence is enforced — don't break it.

## Layer 2 — `src/sketcher/` : the production editor

The interactive curve editor and the Lie-sphere transformation lab, with its own
optimizer stack (`sketcher/optimizer/`). It was imported from the reference app
`../sketcher` (a separate, read-only repo) and is **the production path for
interactive editing**.

Why a second optimizer instead of just `core/`:
- It covers a **much richer set of curve types** core does not — PH, AB-PH,
  rational, complex-rational, complex-rational PH — each with its own problem
  class and (mostly analytic, precomputed) Jacobian.
- It has the **better interactive feel.** Its `optimizeCurve` resists a
  bound-violating drag *softly* via the constraint, where `core`'s `slideCurve`
  has a hard post-solve bisect-back guard that clamps the point and feels
  "stuck". The open B-spline drag therefore runs on `optimizeCurve`, by design.
  This is locked by `src/sketcher/__tests__/editingFeel.test.ts` (tracking,
  continuity, reversibility, stability) — the *feel* guard, alongside `core`'s
  *bound-preservation* guard.

Status / debt: most `sketcher/` files are still `@ts-nocheck` (type-checking was
silenced to land the import). Lifting that **incrementally, file by file** — and
fixing the lint it surfaces — is the standing cleanup. New code should be typed.

## The boundary rules (keep these true)

1. `core/` never imports `sketcher/`.
2. `talks/` and `pages/` import `core/`, never `sketcher/`.
3. `sketcher/` may use `core/` (it's the clean base) but owns its production
   optimizer; the two engines coexist on purpose (see above), they are not a
   migration-in-progress to be collapsed.
4. Never delete a `core/` oracle function; it backs an equivalence test.

## Relationship to `../sketcher`

`../sketcher` is the original reference app — a **separate, read-only repo, not a
build/runtime dependency**. `src/sketcher/` is a copy of its engine. We compare
against `../sketcher` as an oracle for behavior and performance, and hand-port
improvements *into* this repo; we do not import from it.
