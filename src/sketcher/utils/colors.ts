// @ts-nocheck — imported legacy Sketcher engine; type-checked in ../sketcher.
// Being migrated to core/ incrementally; remove this once a file is on core.
// Color palette for basis functions and control points
export const basisColors = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#a855f7', // violet
]

export function getBasisColor(index: number): string {
  return basisColors[index % basisColors.length]
}
