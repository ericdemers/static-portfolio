import { binomialCoefficient2, memoizedBinomialCoefficient2 } from "../../src/bSplineAlgorithms/BinomialCoefficient";

describe('binomialCoefficient', () => {
    test('calculates small binomial coefficients correctly', () => {
      expect(binomialCoefficient2(5, 2)).toBe(10);
      expect(binomialCoefficient2(10, 3)).toBe(120);
      expect(binomialCoefficient2(20, 5)).toBe(15504);
    });
  
    test('handles edge cases correctly', () => {
      expect(binomialCoefficient2(0, 0)).toBe(1);
      expect(binomialCoefficient2(5, 0)).toBe(1);
      expect(binomialCoefficient2(5, 5)).toBe(1);
    });
  
    test('returns 0 for invalid inputs', () => {
      expect(binomialCoefficient2(3, 5)).toBe(0);
      expect(binomialCoefficient2(5, -1)).toBe(0);
    });
  
    test('throws error for non-integer inputs', () => {
      expect(() => binomialCoefficient2(5.5, 2)).toThrow('Inputs must be integers');
      expect(() => binomialCoefficient2(5, 2.5)).toThrow('Inputs must be integers');
    });
  
    test('calculates large binomial coefficients correctly', () => {
      expect(binomialCoefficient2(30, 15)).toBe(155117520);
    });
  });
  
  describe('memoizedBinomialCoefficient', () => {
    let memoizedBC: (n: number, k: number) => number;
  
    beforeEach(() => {
      memoizedBC = memoizedBinomialCoefficient2();
    });
  
    test('calculates binomial coefficients correctly', () => {
      expect(memoizedBC(5, 2)).toBe(10);
      expect(memoizedBC(10, 3)).toBe(120);
    });
  
    test('memoizes results for repeated calls', () => {
      const spy = vi.spyOn(Math, 'round');
      
      memoizedBC(20, 5);
      expect(spy).toHaveBeenCalledTimes(1);
      
      memoizedBC(20, 5);
      expect(spy).toHaveBeenCalledTimes(1); // Should not increase if memoized
      
      memoizedBC(20, 6);
      expect(spy).toHaveBeenCalledTimes(2); // Should increase for new input
      
      spy.mockRestore();
    });
  
    test('handles edge cases correctly', () => {
      expect(memoizedBC(0, 0)).toBe(1);
      expect(memoizedBC(5, 0)).toBe(1);
      expect(memoizedBC(5, 5)).toBe(1);
    });
  
    test('returns 0 for invalid inputs', () => {
      expect(memoizedBC(3, 5)).toBe(0);
      expect(memoizedBC(5, -1)).toBe(0);
    });
  
    test('throws error for non-integer inputs', () => {
      expect(() => memoizedBC(5.5, 2)).toThrow('Inputs must be integers');
      expect(() => memoizedBC(5, 2.5)).toThrow('Inputs must be integers');
    });
  });