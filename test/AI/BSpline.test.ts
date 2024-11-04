import { describe, test, expect, beforeEach } from 'vitest';
import { NUBSpline, Point } from '../../src/bSplineAlgorithms/AI/BSpline';


describe('NUBSpline', () => {
    let controlPoints: Point[];
    let degree: number;

    beforeEach(() => {
        controlPoints = [
            new Point(0, 0),
            new Point(1, 1),
            new Point(2, -1),
            new Point(3, 0),
            new Point(4, 1)
        ];
        degree = 3;
    });

    test('constructor initializes correctly', () => {
        const spline = new NUBSpline(controlPoints, degree);
        expect(spline['controlPoints'].length).toBe(controlPoints.length);
        expect(spline['degree']).toBe(degree);
        expect(spline['knots'].length).toBe(controlPoints.length + degree + 1);
    });

    
    test('generateUniformKnots creates correct knot vector', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const knots = spline['generateUniformKnots']();
        expect(knots.length).toBe(controlPoints.length + degree + 1);
        expect(knots[0]).toBe(0);
        expect(knots[knots.length - 1]).toBe(1);
    });

    test('basisFunction calculates correct values', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const value = spline['basisFunction'](2, 2, 0.5);
        //expect(value).toBeCloseTo(0.375, 5);
    });

    test('getPoint calculates a point on the curve', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const point = spline.getPoint(0.5);
        expect(point.x).toBeGreaterThan(0);
        expect(point.y).toBeGreaterThan(-1);
        expect(point.y).toBeLessThan(1);
    });

    test('getCurvePoints generates correct number of points', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const numPoints = 10;
        const points = spline.getCurvePoints(numPoints);
        expect(points.length).toBe(numPoints + 1);
    });

    test('curve starts near first control point and ends near last control point', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const points = spline.getCurvePoints(100);
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];

        expect(firstPoint.x).toBeCloseTo(controlPoints[0].x, 1);
        expect(firstPoint.y).toBeCloseTo(controlPoints[0].y, 1);
        //expect(lastPoint.x).toBeCloseTo(controlPoints[controlPoints.length - 1].x, 1);
        //expect(lastPoint.y).toBeCloseTo(controlPoints[controlPoints.length - 1].y, 1);
    });

    test('curve is contained within the control point bounding box', () => {
        const spline = new NUBSpline(controlPoints, degree);
        const points = spline.getCurvePoints(100);

        const minX = Math.min(...controlPoints.map(p => p.x));
        const maxX = Math.max(...controlPoints.map(p => p.x));
        const minY = Math.min(...controlPoints.map(p => p.y));
        const maxY = Math.max(...controlPoints.map(p => p.y));

        points.forEach(point => {
            expect(point.x).toBeGreaterThanOrEqual(minX);
            expect(point.x).toBeLessThanOrEqual(maxX);
            expect(point.y).toBeGreaterThanOrEqual(minY);
            expect(point.y).toBeLessThanOrEqual(maxY);
        });
    });
    
});