/**
 * Optimizer-computed oval shapes for the presentation animation.
 *
 * Each shape was produced by simulating control point drags through
 * the curvature extrema optimizer with both symmetry axes active.
 * Every shape has exactly 4 curvature extrema:
 *   - Max curvature at top and bottom (on Y-axis)
 *   - Min curvature at left and right (on X-axis)
 */

import type { Point2D } from '../../core'

/**
 * Build a symmetric 12-CP oval.
 * a  = x-coordinate of CP 0 (half-width)
 * b  = y-coordinate of CP 9 (half-height)
 * p1x, p1y = coordinates of CP 11 (Q1)
 * p2x, p2y = coordinates of CP 10 (Q1)
 */
function makeOval(
  a: number, b: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
): Point2D[] {
  return [
    { x: a, y: 0 },
    { x: p1x, y: -p1y },
    { x: p2x, y: -p2y },
    { x: 0, y: -b },
    { x: -p2x, y: -p2y },
    { x: -p1x, y: -p1y },
    { x: -a, y: 0 },
    { x: -p1x, y: p1y },
    { x: -p2x, y: p2y },
    { x: 0, y: b },
    { x: p2x, y: p2y },
    { x: p1x, y: p1y },
  ]
}

// a=138.7, b=250.0, ratio b/a = 1.802
const ellipse = makeOval(
  138.7470881, 250.0136057,
  129.9019625, 125.0037236,
  75.0050599, 216.5016565,
)

// a=179.1, b=213.3, ratio b/a = 1.191
const nearCircle = makeOval(
  179.0609926, 213.3017254,
  156.1043674, 118.2907758,
  87.2324738, 189.5488809,
)

// a=106.5, b=296.6, ratio b/a = 2.784
const tallOval = makeOval(
  106.5481956, 296.5856829,
  121.2312349, 121.5349442,
  81.9218160, 224.6896019,
)

// a=77.4, b=346.3, ratio b/a = 4.472
const tallNarrow = makeOval(
  77.4313911, 346.2833833,
  110.4890944, 113.9406379,
  89.0125096, 238.1420445,
)

// a=62.6, b=377.0, ratio b/a = 6.021
const capsule = makeOval(
  62.6087675, 376.9836096,
  99.6210691, 119.0789123,
  83.7818369, 252.7730371,
)

export interface OvalKeyframe {
  name: string
  controlPoints: Point2D[]
}

/**
 * Sequence of oval shapes for the 2-symmetry-axis exploration.
 * All shapes computed by the optimizer — guaranteed 4 curvature extrema.
 */
export const twoAxisSequence: OvalKeyframe[] = [
  { name: 'Circle', controlPoints: nearCircle },
  { name: 'Ellipse', controlPoints: ellipse },
  { name: 'Tall oval', controlPoints: tallOval },
  { name: 'Tall narrow', controlPoints: tallNarrow },
  { name: 'Capsule', controlPoints: capsule },
  { name: 'Circle', controlPoints: nearCircle },
]
