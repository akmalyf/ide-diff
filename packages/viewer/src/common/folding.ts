// "Collapse unchanged fragments": port of FoldingModelSupport (nested context levels range, 2*range, 4*range)
// rendered with the wavy DiffLineSeparatorRenderer look.
import { StateEffect, StateField, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutterWidgetClass, type DecorationSet } from '@codemirror/view';

/** A folded line range on one side (0-based, end exclusive). */
export interface FoldRegion {
  groupId: number;
  startLine: number;
  endLine: number;
}

export interface FoldGroup {
  id: number;
  /** blocks[level][side] — null when that side has nothing to fold at this level */
  blocks: Array<[FoldRegion | null, FoldRegion | null]>;
  /** gap start line per side, used to keep the expanded state across re-diffs */
  anchor: [number, number];
}

const MIN = Number.MIN_SAFE_INTEGER;
const MAX = Number.MAX_SAFE_INTEGER;

function rangeShift(range: number, level: number): number {
  return level === 0 ? range : level === 1 ? range * 2 : level === 2 ? range * 4 : -1;
}

const bound = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** FoldingModelSupport.FoldingBuilderBase.build for two sides. `changes` are [start1, end1, start2, end2]. */
export function computeFoldGroups(changes: Array<[number, number, number, number]>, lineCount: [number, number], range: number): FoldGroup[] {
  const groups: FoldGroup[] = [];
  let last: [number, number] = [MIN, MIN];
  const addGroup = (starts: [number, number], ends: [number, number]) => {
    const blocks: FoldGroup['blocks'] = [];
    for (let level = 0; ; level++) {
      const shift = rangeShift(range, level);
      if (shift === -1) break;
      const pair: [FoldRegion | null, FoldRegion | null] = [null, null];
      for (let side = 0; side < 2; side++) {
        const s = bound(starts[side]! + shift, 0, lineCount[side]!);
        const e = bound(ends[side]! - shift, 0, lineCount[side]!);
        if (e - s >= 2) pair[side] = { groupId: groups.length, startLine: s, endLine: e };
      }
      if (pair[0] || pair[1]) blocks.push(pair);
    }
    if (blocks.length) {
      groups.push({
        id: groups.length,
        blocks,
        anchor: [bound(starts[0], 0, lineCount[0]), bound(starts[1], 0, lineCount[1])],
      });
    }
  };
  for (const [s1, e1, s2, e2] of changes) {
    addGroup([last[0], last[1]], [s1, s2]);
    last = [e1, e2];
  }
  addGroup([last[0], last[1]], [MAX, MAX]);
  return groups;
}

const waveMask = (stroke: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='8'><path d='M0,1 Q2,1 4,4 Q6,7 8,7 Q10,7 12,4 Q14,1 16,1' fill='none' stroke='black' stroke-width='${stroke}'/></svg>`,
  )}")`;

export const foldTheme = EditorView.baseTheme({
  '.idd-fold::before, .idd-fold-gutter::before': {
    content: '""',
    position: 'absolute',
    inset: '0',
    backgroundColor: 'var(--idd-diff-separator-wave)',
    maskImage: waveMask(1),
    maskRepeat: 'repeat-x',
    maskPosition: '0 center',
    maskSize: '16px 8px',
    WebkitMaskImage: waveMask(1),
    WebkitMaskRepeat: 'repeat-x',
    WebkitMaskPosition: '0 center',
    WebkitMaskSize: '16px 8px',
  },
  '.idd-fold:hover::before, .idd-fold-gutter.idd-hover::before': {
    maskImage: waveMask(2),
    WebkitMaskImage: waveMask(2),
  },
  '.idd-fold-gutter': { position: 'relative' },
});

export class FoldWidget extends WidgetType {
  constructor(
    readonly groupId: number,
    readonly lines: number,
    readonly onExpand: (groupId: number) => void,
  ) {
    super();
  }
  eq(other: FoldWidget): boolean {
    return other.groupId === this.groupId && other.lines === this.lines;
  }
  get estimatedHeight(): number {
    return -1;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'idd-fold';
    el.dataset.group = String(this.groupId);
    const label = document.createElement('span');
    label.className = 'idd-fold-label';
    label.textContent = `${this.lines} unchanged lines`;
    el.appendChild(label);
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.onExpand(this.groupId);
    });
    return el;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class FoldGutterMarker extends GutterMarker {
  elementClass = 'idd-fold-gutter';
}
const foldGutterMarker = new FoldGutterMarker();

export interface FoldSpec {
  regions: FoldRegion[];
  onExpand: (groupId: number) => void;
}

export const setFolds = StateEffect.define<FoldSpec>();

function buildFolds(doc: Text, spec: FoldSpec): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const r of spec.regions) {
    if (r.endLine > doc.lines || r.startLine >= r.endLine) continue;
    const from = doc.line(r.startLine + 1).from;
    const to = doc.line(r.endLine).to;
    ranges.push(
      Decoration.replace({ block: true, widget: new FoldWidget(r.groupId, r.endLine - r.startLine, spec.onExpand) }).range(from, to),
    );
  }
  return Decoration.set(ranges, true);
}

const foldField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFolds)) return buildFolds(tr.state.doc, effect.value);
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function unchangedFolding(): Extension {
  return [
    foldField,
    foldTheme,
    gutterWidgetClass.of((_view, widget) => (widget instanceof FoldWidget ? foldGutterMarker : null)),
  ];
}
