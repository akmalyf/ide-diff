// Line-range helpers ported from com.intellij.diff.util.DiffUtil (0-based lines, end exclusive).
import type { ChangeSpec, Text } from '@codemirror/state';

export function lineCount(doc: Text): number {
  return doc.lines;
}

/** Offset of the start of 0-based `line` (clamped to the document). */
export function lineStart(doc: Text, line: number): number {
  if (line >= doc.lines) return doc.length;
  return doc.line(line + 1).from;
}

/** DiffUtil.getLinesRange(document, line1, line2, includeNewline = false). */
export function linesRange(doc: Text, line1: number, line2: number): { from: number; to: number } {
  if (line1 === line2) {
    const offset = lineStart(doc, line1);
    return { from: offset, to: offset };
  }
  return { from: doc.line(line1 + 1).from, to: doc.line(Math.min(line2, doc.lines)).to };
}

/** DiffUtil.getLinesContent */
export function linesContent(doc: Text, line1: number, line2: number): string {
  const { from, to } = linesRange(doc, line1, line2);
  return doc.sliceString(from, to);
}

function deleteLines(doc: Text, line1: number, line2: number): ChangeSpec {
  let { from, to } = linesRange(doc, line1, line2);
  if (from > 0) from--;
  else if (to < doc.length) to++;
  return { from, to };
}

function insertLines(doc: Text, line: number, text: string): ChangeSpec {
  if (line >= lineCount(doc)) return { from: doc.length, insert: '\n' + text };
  return { from: lineStart(doc, line), insert: text + '\n' };
}

/**
 * DiffUtil.applyModification: replace lines [line1, line2) of `target` with lines [oLine1, oLine2) of `source`.
 */
export function applyModification(
  target: Text,
  line1: number,
  line2: number,
  source: Text,
  oLine1: number,
  oLine2: number,
): ChangeSpec | null {
  if (line1 === line2 && oLine1 === oLine2) return null;
  if (line1 === line2) return insertLines(target, line1, linesContent(source, oLine1, oLine2));
  if (oLine1 === oLine2) return deleteLines(target, line1, line2);
  const { from, to } = linesRange(target, line1, line2);
  return { from, to, insert: linesContent(source, oLine1, oLine2) };
}

/** SimpleDiffViewer.appendChange: insert source lines after the target range. */
export function appendModification(target: Text, line2: number, source: Text, oLine1: number, oLine2: number): ChangeSpec | null {
  if (oLine1 === oLine2) return null;
  return insertLines(target, line2, linesContent(source, oLine1, oLine2));
}
