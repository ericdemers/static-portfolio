// Being migrated to core/ incrementally; remove this once a file is on core.
// Color for basis functions and their control points.

/**
 * Basis-function color as a continuous spectral sweep from red (first) to purple
 * (last) — no cycling. Interpolates the HSL hue 0→270 over the sequence, so every
 * function gets a distinct hue and the endpoints are red and purple. `count` is
 * the number of basis functions; with it omitted or ≤1 the color is red.
 * (HSL is used deliberately — it works on old Safari, unlike oklch/color-mix.)
 */
export function getBasisColor(index: number, count = 1): string {
  const t = count > 1 ? index / (count - 1) : 0
  const hue = t * 270 // 0 = red → 270 = purple
  return `hsl(${hue.toFixed(1)}, 75%, 52%)`
}
