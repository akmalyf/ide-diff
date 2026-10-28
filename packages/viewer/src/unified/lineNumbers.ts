// Two line-number columns for the unified editor (LineNumberConvertor): left text numbers, then right text numbers.
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { GutterMarker, gutter, type EditorView } from '@codemirror/view';

export interface LineMaps {
  map1: Int32Array;
  map2: Int32Array;
  max1: number;
  max2: number;
}

export const setLineMaps = StateEffect.define<LineMaps>();

const lineMapsField = StateField.define<LineMaps>({
  create: () => ({ map1: new Int32Array(0), map2: new Int32Array(0), max1: 1, max2: 1 }),
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLineMaps)) return e.value;
    return value;
  },
});

class NumberMarker extends GutterMarker {
  constructor(readonly text: string) {
    super();
  }
  eq(other: NumberMarker): boolean {
    return this.text === other.text;
  }
  toDOM(): Node {
    return document.createTextNode(this.text);
  }
}

function column(index: 1 | 2): Extension {
  const maps = (view: EditorView) => view.state.field(lineMapsField);
  const spacer = (view: EditorView) => new NumberMarker(String(Math.max(index === 1 ? maps(view).max1 : maps(view).max2, 99)));
  return gutter({
    class: `idd-linenumbers idd-linenumbers-${index}`,
    lineMarker(view, line) {
      const m = maps(view);
      const unifiedLine = view.state.doc.lineAt(line.from).number - 1;
      const n = (index === 1 ? m.map1 : m.map2)[unifiedLine];
      return n == null || n < 0 ? null : new NumberMarker(String(n + 1));
    },
    lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setLineMaps))),
    initialSpacer: spacer,
    updateSpacer: (s, update) => {
      const next = spacer(update.view);
      return next.eq(s as NumberMarker) ? s : next;
    },
  });
}

export function unifiedLineNumbers(): Extension {
  return [column(1), column(2)];
}

export function unifiedLineMaps(): Extension {
  return lineMapsField;
}
