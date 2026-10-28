// Line-number gutter that can sit on either side of the text. IntelliJ mirrors the left diff editor
// (VERTICAL_SCROLLBAR_LEFT), so its gutter is drawn between the text and the divider.
import type { Extension } from '@codemirror/state';
import { GutterMarker, gutter, type EditorView } from '@codemirror/view';

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

const spacerFor = (view: EditorView) => new NumberMarker(String(Math.max(view.state.doc.lines, 99)));

export function sideLineNumbers(side: 'before' | 'after'): Extension {
  return gutter({
    class: 'idd-linenumbers',
    side,
    renderEmptyElements: false,
    lineMarker: (view, line) => new NumberMarker(String(view.state.doc.lineAt(line.from).number)),
    lineMarkerChange: (update) => update.docChanged,
    initialSpacer: spacerFor,
    updateSpacer: (spacer, update) => {
      const next = spacerFor(update.view);
      return next.eq(spacer as NumberMarker) ? spacer : next;
    },
  });
}
