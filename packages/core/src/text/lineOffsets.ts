// Ported from com.intellij.diff.tools.util.text.LineOffsetsImpl + com.intellij.diff.util.DiffRangeUtil
// (JetBrains/intellij-community, Apache-2.0). Assumes '\n' line separators.

export class LineOffsets {
  private constructor(
    private readonly lineEnds: Int32Array,
    readonly textLength: number,
  ) {}

  static create(text: string): LineOffsets {
    const ends: number[] = [];
    let index = 0;
    for (;;) {
      const lineEnd = text.indexOf('\n', index);
      if (lineEnd !== -1) {
        ends.push(lineEnd);
        index = lineEnd + 1;
      } else {
        ends.push(text.length);
        break;
      }
    }
    return new LineOffsets(Int32Array.from(ends), text.length);
  }

  get lineCount(): number {
    return this.lineEnds.length;
  }

  getLineStart(line: number): number {
    this.checkLineIndex(line);
    if (line === 0) return 0;
    return this.lineEnds[line - 1] + 1;
  }

  getLineEnd(line: number, includeNewline = false): number {
    this.checkLineIndex(line);
    return this.lineEnds[line] + (includeNewline && line !== this.lineEnds.length - 1 ? 1 : 0);
  }

  getLineNumber(offset: number): number {
    if (offset < 0 || offset > this.textLength) {
      throw new RangeError(`Wrong offset: ${offset}. Available text length: ${this.textLength}`);
    }
    if (offset === 0) return 0;
    if (offset === this.textLength) return this.lineCount - 1;
    let l = 0;
    let r = this.lineEnds.length - 1;
    while (l <= r) {
      const m = (l + r) >>> 1;
      const v = this.lineEnds[m];
      if (v < offset) l = m + 1;
      else if (v > offset) r = m - 1;
      else return m;
    }
    return l;
  }

  private checkLineIndex(index: number): void {
    if (index < 0 || index >= this.lineCount) {
      throw new RangeError(`Wrong line: ${index}. Available lines count: ${this.lineCount}`);
    }
  }
}

export interface LinesRange {
  startOffset: number;
  endOffset: number;
}

export function getLinesRange(lo: LineOffsets, line1: number, line2: number, includeNewline: boolean): LinesRange {
  if (line1 === line2) {
    const start = line1 < lo.lineCount ? lo.getLineStart(line1) : lo.textLength;
    return { startOffset: start, endOffset: start };
  }
  const startOffset = lo.getLineStart(line1);
  let endOffset = lo.getLineEnd(line2 - 1);
  if (includeNewline && endOffset < lo.textLength) endOffset++;
  return { startOffset, endOffset };
}

/** DiffRangeUtil.getLinesContent — text of lines [line1, line2) without the trailing newline (by default). */
export function getLinesContent(text: string, lo: LineOffsets, line1: number, line2: number, includeNewline = false): string {
  const r = getLinesRange(lo, line1, line2, includeNewline);
  return text.substring(r.startOffset, r.endOffset);
}

/** All lines of the text without their '\n'. */
export function getLines(text: string, lo: LineOffsets = LineOffsets.create(text)): string[] {
  const result: string[] = new Array(lo.lineCount);
  for (let i = 0; i < lo.lineCount; i++) result[i] = text.substring(lo.getLineStart(i), lo.getLineEnd(i));
  return result;
}

/** Public helper (CONTRACT.md): start offset of every line. `""` has one line starting at 0. */
export function lineOffsets(text: string): number[] {
  const result = [0];
  let index = text.indexOf('\n');
  while (index !== -1) {
    result.push(index + 1);
    index = text.indexOf('\n', index + 1);
  }
  return result;
}
