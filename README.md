# Numeric Elements

The numericelements.com website — interactive B-spline curve design with
control of curvature extrema and inflections.

This is the `v2` rebuild: a clean, self-contained app that owns its own
B-spline `core/` library. Curated pieces (the sketcher workbench, the
Curves & Surfaces 2026 presentation, and selected labs) are ported in from
the `../sketcher` research repo as they are cleaned up — this site depends on
none of it.

## Stack

React 19 · React Router 7 · Vite 7 · TypeScript · Tailwind CSS 4 · Vitest

## Develop

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # type-check + production build to dist/
bun run test     # unit tests
```

## Deploy

Deployed via AWS Amplify (Git-connected). The production branch is built with
`vite build` and served from `dist/`.
