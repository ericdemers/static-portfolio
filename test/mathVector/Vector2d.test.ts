import { Vector2d } from "../../src/mathVector/Vector2d";


describe('Vector2d', () => {
  describe('constructor', () => {
    it('should create a Vector2d with the given x and y values', () => {
      const v = new Vector2d(1, 2);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
    });

    it('should create a Vector2d with default values (0, 0) when no arguments are provided', () => {
      const v = new Vector2d();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
    });
  });

  describe('add', () => {
    it('should correctly add two vectors', () => {
      const v1 = new Vector2d(1, 2);
      const v2 = new Vector2d(3, 4);
      const result = v1.add(v2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });

    it('should not modify the original vectors', () => {
      const v1 = new Vector2d(1, 2);
      const v2 = new Vector2d(3, 4);
      v1.add(v2);
      expect(v1.x).toBe(1);
      expect(v1.y).toBe(2);
      expect(v2.x).toBe(3);
      expect(v2.y).toBe(4);
    });
  });

  describe('subtract', () => {
    it('should correctly subtract one vector from another', () => {
      const v1 = new Vector2d(5, 7);
      const v2 = new Vector2d(2, 3);
      const result = v1.subtract(v2);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });
  });

  describe('multiply', () => {
    it('should correctly multiply a vector by a scalar', () => {
      const v = new Vector2d(2, 3);
      const result = v.multiply(2);
      expect(result.x).toBe(4);
      expect(result.y).toBe(6);
    });
  });

  describe('divide', () => {
    it('should correctly divide a vector by a scalar', () => {
      const v = new Vector2d(6, 8);
      const result = v.divide(2);
      expect(result.x).toBe(3);
      expect(result.y).toBe(4);
    });

    it('should throw an error when dividing by zero', () => {
      const v = new Vector2d(1, 1);
      expect(() => v.divide(0)).toThrow("Cannot divide by zero");
    });
  });

  describe('magnitude', () => {
    it('should correctly calculate the magnitude of a vector', () => {
      const v = new Vector2d(3, 4);
      expect(v.magnitude()).toBe(5);
    });
  });

  describe('normalize', () => {
    it('should correctly normalize a vector', () => {
      const v = new Vector2d(3, 4);
      const result = v.normalize();
      expect(result.x).toBeCloseTo(0.6);
      expect(result.y).toBeCloseTo(0.8);
    });

    it('should throw an error when normalizing a zero vector', () => {
      const v = new Vector2d(0, 0);
      expect(() => v.normalize()).toThrow("Cannot normalize a zero vector");
    });
  });

  describe('dot', () => {
    it('should correctly calculate the dot product of two vectors', () => {
      const v1 = new Vector2d(1, 2);
      const v2 = new Vector2d(3, 4);
      expect(v1.dot(v2)).toBe(11);
    });
  });

  describe('equals', () => {
    it('should return true for equal vectors', () => {
      const v1 = new Vector2d(1, 2);
      const v2 = new Vector2d(1, 2);
      expect(v1.equals(v2)).toBe(true);
    });

    it('should return false for different vectors', () => {
      const v1 = new Vector2d(1, 2);
      const v2 = new Vector2d(2, 1);
      expect(v1.equals(v2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return a string representation of the vector', () => {
      const v = new Vector2d(1, 2);
      expect(v.toString()).toBe("Vector2d(1, 2)");
    });
  });
});

