// Being migrated to core/ incrementally; remove this once a file is on core.
// Color for basis functions and their control points.

/**
 * Basis-function color as a continuous spectral sweep — no cycling. `count` is the
 * number of basis functions.
 *  - open curve: hue 0→270, so first = red, last = purple (distinct endpoints).
 *  - closed curve: hue sweeps the FULL wheel 0→360·(n−1)/n, so the last color
 *    lands just shy of red and the seam wraps seamlessly (equal hue steps all the
 *    way round the loop).
 * (HSL is used deliberately — it works on old Safari, unlike oklch/color-mix.)
 */
export function getBasisColor(index: number, count = 1, closed = false): string {
  if (count <= 1) return 'hsl(0, 75%, 52%)'
  const span = closed ? (360 * (count - 1)) / count : 270 // red→purple, or full wheel
  const hue = ((index / (count - 1)) * span) % 360
  return `hsl(${hue.toFixed(1)}, 75%, 52%)`
}
