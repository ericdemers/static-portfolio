// knotVector.ts

export interface KnotInterface {
    getValue(index: number): number;
    getMultiplicity(index: number): number;
    getSize(): number;
    getDomain(): [number, number];
    isValid(degree: number): boolean;
}

export abstract class BaseKnotVector implements KnotInterface {
    abstract getValue(index: number): number;
    abstract getMultiplicity(index: number): number;
    abstract getSize(): number;
    abstract getDomain(): [number, number];

    isValid(degree: number): boolean {
        const size = this.getSize();
        if (size < 2 * (degree + 1)) return false;

        let prev = this.getValue(0);
        for (let i = 1; i < size; i++) {
            const current = this.getValue(i);
            if (current < prev) return false;
            prev = current;
        }

        return true;
    }

    // Common utility methods can be implemented here
}

export class StandardKnotVector extends BaseKnotVector {
    private knots: number[];

    constructor(knots: number[]) {
        super();
        this.knots = [...knots];
    }

    getValue(index: number): number {
        return this.knots[index];
    }

    getMultiplicity(index: number): number {
        let mult = 1;
        while (index + 1 < this.knots.length && this.knots[index] === this.knots[index + 1]) {
            mult++;
            index++;
        }
        return mult;
    }

    getSize(): number {
        return this.knots.length;
    }

    getDomain(): [number, number] {
        return [this.knots[0], this.knots[this.knots.length - 1]];
    }
}

export class CompactKnotVector extends BaseKnotVector {
    private values: number[];
    private multiplicities: number[];

    constructor(values: number[], multiplicities: number[]) {
        super();
        if (values.length !== multiplicities.length) {
            throw new Error("Values and multiplicities arrays must have the same length");
        }
        this.values = [...values];
        this.multiplicities = [...multiplicities];
    }

    getValue(index: number): number {
        let count = 0;
        for (let i = 0; i < this.values.length; i++) {
            if (count + this.multiplicities[i] > index) {
                return this.values[i];
            }
            count += this.multiplicities[i];
        }
        throw new Error("Index out of bounds");
    }

    getMultiplicity(index: number): number {
        let count = 0;
        for (let i = 0; i < this.values.length; i++) {
            if (count + this.multiplicities[i] > index) {
                return this.multiplicities[i];
            }
            count += this.multiplicities[i];
        }
        throw new Error("Index out of bounds");
    }

    getSize(): number {
        return this.multiplicities.reduce((sum, mult) => sum + mult, 0);
    }

    getDomain(): [number, number] {
        return [this.values[0], this.values[this.values.length - 1]];
    }
}

export class PeriodicKnotVector extends BaseKnotVector {
    private baseKnots: number[];
    private period: number;

    constructor(baseKnots: number[], period: number) {
        super();
        this.baseKnots = [...baseKnots];
        this.period = period;
    }

    getValue(index: number): number {
        const baseIndex = index % this.baseKnots.length;
        const cycles = Math.floor(index / this.baseKnots.length);
        return this.baseKnots[baseIndex] + cycles * this.period;
    }

    getMultiplicity(index: number): number {
        return 1; // Assuming no multiplicities in periodic knots
    }

    getSize(): number {
        return Infinity; // Periodic knots are infinite
    }

    getDomain(): [number, number] {
        return [this.baseKnots[0], this.baseKnots[this.baseKnots.length - 1] + this.period];
    }
}

export class SubsequenceKnotVector extends BaseKnotVector {
    private baseKnotVector: BaseKnotVector;
    private start: number;
    private end: number;

    constructor(baseKnotVector: BaseKnotVector, start: number, end: number) {
        super();
        this.baseKnotVector = baseKnotVector;
        this.start = start;
        this.end = end;
    }

    getValue(index: number): number {
        return this.baseKnotVector.getValue(this.start + index);
    }

    getMultiplicity(index: number): number {
        return this.baseKnotVector.getMultiplicity(this.start + index);
    }

    getSize(): number {
        return this.end - this.start + 1;
    }

    getDomain(): [number, number] {
        return [this.getValue(0), this.getValue(this.getSize() - 1)];
    }
}
