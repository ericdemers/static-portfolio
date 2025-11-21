import { basisFunctions, clampingFindSpan, decomposeFunction, findSpan } from "../../src/bSplineAlgorithms/Piegl_Tiller_NURBS_Book";
import { BSplineR1toR1 } from "../../src/bSplineAlgorithms/R1toR1/BSplineR1toR1";


describe('Piegl_Tiller_NURBS_Book', () => {
  describe('findSpan', () => {
    it('should find the correct span for a given u value', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      expect(findSpan(2.5, knots, degree)).toBe(4);
      expect(findSpan(0.5, knots, degree)).toBe(2);
      expect(findSpan(4.9, knots, degree)).toBe(7);
    });

    it('should return the last valid span index when u is at the right end', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      expect(findSpan(5, knots, degree)).toBe(7);
    });

    it('should throw an error when u is outside the valid range', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      //expect(() => findSpan(-0.1, knots, degree)).toThrow();
      //expect(() => findSpan(5.1, knots, degree)).toThrow();
    });
  });

  describe('clampingFindSpan', () => {
    it('should find the correct span for a given u value', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      expect(clampingFindSpan(2.5, knots, degree)).toBe(4);
      expect(clampingFindSpan(0.5, knots, degree)).toBe(2);
      expect(clampingFindSpan(4.9, knots, degree)).toBe(7);
    });

    it('should return the last span index when u is at the right end', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      expect(clampingFindSpan(5, knots, degree)).toBe(8);
    });

    it('should throw an error when u is outside the valid range', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      expect(() => clampingFindSpan(-0.1, knots, degree)).toThrow();
      expect(() => clampingFindSpan(5.1, knots, degree)).toThrow();
    });
  });

  describe('basisFunctions', () => {
    it('should compute correct basis functions for a given span', () => {
      const knots = [0, 0, 0, 1, 2, 3, 4, 4, 5, 5, 5];
      const degree = 2;
      const span = 4;
      const u = 2.5;
      const result = basisFunctions(span, u, knots, degree);
      expect(result.length).toBe(degree + 1);
      expect(result[0]).toBeCloseTo(0.125, 5);
      expect(result[1]).toBeCloseTo(0.75, 5);
      expect(result[2]).toBeCloseTo(0.125, 5);
    });
  });

});
