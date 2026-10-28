// Ported from com.intellij.diff.util.Range / MergeRange (JetBrains/intellij-community, Apache-2.0).

/** Half-open on both sides. */
export class Range {
  constructor(
    readonly start1: number,
    readonly end1: number,
    readonly start2: number,
    readonly end2: number,
  ) {}

  get isEmpty(): boolean {
    return this.start1 === this.end1 && this.start2 === this.end2;
  }

  toString(): string {
    return `[${this.start1}, ${this.end1}) - [${this.start2}, ${this.end2})`;
  }
}

/** 1 = left, 2 = base, 3 = right. */
export class MergeRange {
  constructor(
    readonly start1: number,
    readonly end1: number,
    readonly start2: number,
    readonly end2: number,
    readonly start3: number,
    readonly end3: number,
  ) {}

  get isEmpty(): boolean {
    return this.start1 === this.end1 && this.start2 === this.end2 && this.start3 === this.end3;
  }

  toString(): string {
    return `[${this.start1}, ${this.end1}) - [${this.start2}, ${this.end2}) - [${this.start3}, ${this.end3})`;
  }
}

export type Side = 0 | 1; // LEFT = 0, RIGHT = 1
