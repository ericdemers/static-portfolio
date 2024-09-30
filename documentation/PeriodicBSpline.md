# Periodic B-Spline

## Introduction

Let use n for the number of control points, k for the number of knots and d for the degree of the b-spline.

A non periodic b-spline has n + d + 1 knots.

A clamped b-spline has d+1 coincident knot at the begining and at the end.

When the two end point of a non periodic clamped b-spline are put sufficiently close to one another the application close the curve and a periodic b-spline is obtained.

The last control point that coincides with the first is a redundant information and for this reason deleted. The period which is the distance between the first and the last knot is recorded. Then, the first and the degree + 1 last knots are deleted.

Now the problem is to reproduce the same curve with a unclamped b-spline.

It is possible to shift and scall all knots positions without any effect on the curve itself except for its parametrization.

It is then always possible to draw the curve using the interval (0, 1).

One knot on the left side was removed, d + 1 knot on the right side were removed and one control point was removed.

Now it is necessary to add d control points and 2d + 1 knots, 1 knot before the first knot and 2d knots after the last. The added knot respect cyclic intervals.

For example lets take a b-spline of degree one with one internal knot. The b-spline has 3 control points and 5 knots. In memory there is 2 control points and 2 knots. It is necessary to add 1 control point and 3 knots. The added control point coordinates are the same as the first control point.

Now for a b-spline of degree 2 with one internal knot. The b-spline has 4 control points and 7 knots.
The unclamped b-spline has 5 control points and 8 knots.
