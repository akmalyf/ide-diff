// Vertical geometry helpers (document coordinates), ports of DiffDrawUtil.lineToY / getGutterMarkerPaintRange.
import type { EditorView } from '@codemirror/view';

/** DiffDrawUtil.lineToY(editor, line, lineStart): top (lineStart) or bottom of 0-based `line`. */
export function lineToY(view: EditorView, line: number, lineStart: boolean): number {
  const doc = view.state.doc;
  if (line < 0) return 0;
  if (line >= doc.lines) {
    const lastBottom = view.lineBlockAt(doc.length).bottom;
    const tail = line - doc.lines + (lineStart ? 0 : 1);
    return lastBottom + view.defaultLineHeight * tail;
  }
  const block = view.lineBlockAt(doc.line(line + 1).from);
  return lineStart ? block.top : block.bottom;
}

export interface MarkerRange {
  y1: number;
  y2: number;
}

/** DiffDrawUtil.getGutterMarkerPaintRange */
export function markerPaintRange(view: EditorView, startLine: number, endLine: number): MarkerRange {
  if (startLine === endLine) {
    const y = startLine === 0 ? lineToY(view, 0, true) + 1 : lineToY(view, startLine - 1, false);
    return { y1: y, y2: y };
  }
  return { y1: lineToY(view, startLine, true), y2: lineToY(view, endLine - 1, false) };
}
