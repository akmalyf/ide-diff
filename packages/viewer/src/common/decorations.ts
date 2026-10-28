// Change highlighting for one editor side: line backgrounds, inner (word/char) fragments, empty-range markers and
// matching gutter backgrounds. Port of SimpleDiffChangeUi.installHighlighter + DiffDrawUtil builders.
import { RangeSet, StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutterLineClass, type DecorationSet } from '@codemirror/view';
import type { TextDiffType } from '@ide-diff/core';

export interface InnerRange {
  from: number; // absolute offset in this side's document
  to: number;
  type: TextDiffType;
}

/** One change as seen from one side. Lines are 0-based, end exclusive. */
export interface SideChange {
  startLine: number;
  endLine: number;
  type: TextDiffType;
  /** true when inner fragments exist: the line background then uses the "ignored" (soft) color */
  ignored: boolean;
  inner: InnerRange[];
  /** createNonSquashedChangesSeparator: previous change ends exactly where this one starts */
  separatorTop: boolean;
}

export const setSideChanges = StateEffect.define<SideChange[]>();

interface DiffDecorationsValue {
  deco: DecorationSet;
  gutter: RangeSet<GutterMarker>;
  changes: SideChange[];
}

class ClassMarker extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }
  eq(other: GutterMarker): boolean {
    return other instanceof ClassMarker && other.elementClass === this.elementClass;
  }
}

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

const markerCache = new Map<string, ClassMarker>();
function classMarker(cls: string): ClassMarker {
  let m = markerCache.get(cls);
  if (!m) markerCache.set(cls, (m = new ClassMarker(cls)));
  return m;
}

function build(doc: Text, changes: SideChange[]): DiffDecorationsValue {
  const deco: Range<Decoration>[] = [];
  const gutter: Range<GutterMarker>[] = [];
  const lines = doc.lines;

  const addLineClass = (line: number, cls: string) => {
    const pos = doc.line(line + 1).from;
    deco.push(Decoration.line({ class: cls }).range(pos));
    gutter.push(classMarker(cls).range(pos));
  };

  for (const change of changes) {
    const type = change.type.toLowerCase();
    if (change.startLine === change.endLine) {
      if (change.startLine === 0 || lines === 0) addLineClass(0, `idd-e-top-${type}`);
      else addLineClass(Math.min(change.startLine, lines) - 1, `idd-e-bottom-${type}`);
    } else {
      const cls = change.ignored ? `idd-l-${type}-ign` : `idd-l-${type}`;
      for (let line = change.startLine; line < Math.min(change.endLine, lines); line++) addLineClass(line, cls);
      if (change.separatorTop) addLineClass(change.startLine, 'idd-sep-top');
    }
    for (const inner of change.inner) {
      const innerType = inner.type.toLowerCase();
      const from = Math.min(inner.from, doc.length);
      const to = Math.min(inner.to, doc.length);
      if (from === to) {
        deco.push(Decoration.widget({ widget: new EmptyInnerWidget(inner.type), side: 1 }).range(from));
      } else {
        deco.push(Decoration.mark({ class: `idd-i-${innerType}` }).range(from, to));
      }
    }
  }

  return {
    deco: Decoration.set(deco, true),
    gutter: RangeSet.of(gutter, true),
    changes,
  };
}

const diffDecorationsField = StateField.define<DiffDecorationsValue>({
  create: () => ({ deco: Decoration.none, gutter: RangeSet.empty, changes: [] }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSideChanges)) return build(tr.state.doc, effect.value);
    }
    if (!tr.docChanged) return value;
    return { deco: value.deco.map(tr.changes), gutter: value.gutter.map(tr.changes), changes: value.changes };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.deco),
    gutterLineClass.from(field, (v) => v.gutter),
  ],
});

export function diffDecorations(): Extension {
  return diffDecorationsField;
}

