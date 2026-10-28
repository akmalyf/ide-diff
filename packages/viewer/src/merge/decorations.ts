// Merge change highlighting for one editor: ThreesideMergeHighlighters / DiffViewerHighlighters.createHighlighter +
// createInnerHighlighter. Unresolved changes use the regular DiffDrawUtil line backgrounds (shared CSS classes from
// the editor theme); resolved ones use PaintMode.RESOLVED (no background, bold dotted border lines).
import { RangeSet, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutterLineClass, type DecorationSet } from '@codemirror/view';
import type { TextDiffType } from '@ide-diff/core';

/** One change as seen from one editor. Lines are 0-based, end exclusive. */
export interface MergeHighlight {
  startLine: number;
  endLine: number;
  type: TextDiffType;
  resolved: boolean;
  /** inner fragments exist for this change: soft ("ignored") line background */
  ignored: boolean;
  /** absolute [from, to) offsets of inner (by-word) differences in this editor */
  inner: Array<[number, number]>;
}

export const setMergeHighlights = StateEffect.define<MergeHighlight[]>();

interface Value {
  deco: DecorationSet;
  gutter: RangeSet<GutterMarker>;
}

class ClassMarker extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }
  eq(other: GutterMarker): boolean {
    return other instanceof ClassMarker && other.elementClass === this.elementClass;
  }
}

const markerCache = new Map<string, ClassMarker>();
function classMarker(cls: string): ClassMarker {
  let m = markerCache.get(cls);
  if (!m) markerCache.set(cls, (m = new ClassMarker(cls)));
  return m;
}

/** DiffEmptyHighlighterRenderer: thin marker for an empty inner range */
class EmptyInnerWidget extends WidgetType {
  constructor(readonly type: TextDiffType) {
    super();
  }
  eq(other: EmptyInnerWidget): boolean {
    return other.type === this.type;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = `idd-i-empty idd-i-empty-${this.type.toLowerCase()}`;
    span.style.cssText = 'display:inline-block;width:2px;margin:0 -1px;height:1.15em;vertical-align:text-bottom;';
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

function build(doc: Text, highlights: MergeHighlight[]): Value {
  const deco: Range<Decoration>[] = [];
  const gutter: Range<GutterMarker>[] = [];
  const lines = doc.lines;
  const addLineClass = (line: number, cls: string) => {
    const pos = doc.line(Math.max(0, Math.min(line, lines - 1)) + 1).from;
    deco.push(Decoration.line({ class: cls }).range(pos));
    gutter.push(classMarker(cls).range(pos));
  };

  for (const h of highlights) {
    const type = h.type.toLowerCase();
    if (h.startLine === h.endLine) {
      // empty range: border line at the boundary (doubleLine; dotted when resolved)
      const atTop = h.startLine === 0;
      const line = atTop ? 0 : Math.min(h.startLine, lines) - 1;
      if (h.resolved) addLineClass(line, `idd-mr idd-mr-${type} ${atTop ? 'idd-mr-top' : 'idd-mr-bottom'}`);
      else addLineClass(line, atTop ? `idd-e-top-${type}` : `idd-e-bottom-${type}`);
    } else if (h.resolved) {
      const last = Math.min(h.endLine, lines) - 1;
      if (h.startLine === last) addLineClass(h.startLine, `idd-mr idd-mr-${type} idd-mr-top idd-mr-bottom`);
      else {
        addLineClass(h.startLine, `idd-mr idd-mr-${type} idd-mr-top`);
        addLineClass(last, `idd-mr idd-mr-${type} idd-mr-bottom`);
      }
    } else {
      const cls = h.ignored ? `idd-l-${type}-ign` : `idd-l-${type}`;
      for (let line = h.startLine; line < Math.min(h.endLine, lines); line++) addLineClass(line, cls);
    }
    if (h.resolved) continue;
    for (const [f, t] of h.inner) {
      const from = Math.min(f, doc.length);
      const to = Math.min(t, doc.length);
      if (from === to) deco.push(Decoration.widget({ widget: new EmptyInnerWidget(h.type), side: 1 }).range(from));
      else deco.push(Decoration.mark({ class: `idd-i-${type}` }).range(from, to));
    }
  }
  return { deco: Decoration.set(deco, true), gutter: RangeSet.of(gutter, true) };
}

const field = StateField.define<Value>({
  create: () => ({ deco: Decoration.none, gutter: RangeSet.empty }),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setMergeHighlights)) return build(tr.state.doc, effect.value);
    if (!tr.docChanged) return value;
    return { deco: value.deco.map(tr.changes), gutter: value.gutter.map(tr.changes) };
  },
  provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), gutterLineClass.from(f, (v) => v.gutter)],
});

export function mergeDecorations(): Extension {
  return field;
}
