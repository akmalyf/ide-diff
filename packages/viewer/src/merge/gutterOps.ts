// Merge gutter operations (ThreesideMergeHighlighters.installOperations / DiffGutterOperation.WithModifiers):
// ">>" / "<<" accept + "X" ignore in the left / right editors, magic-wand resolve in the result editor.
// Ctrl/Cmd+click on a conflict operation resolves the whole conflict ("Ctrl+click to resolve conflict").
import { RangeSet, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';
import { getIcon, type IconName } from '../icons';
import { attachTooltip, type ThemeName } from '../toolbar/ui';

export interface MergeOperationButton {
  icon: IconName;
  tooltip: string;
  /** secondary tooltip line, e.g. "Ctrl+click to resolve conflict" */
  appendix?: string;
  run: (modifier: boolean) => void;
}

export interface MergeGutterOperation {
  /** stable key (generation + change index + button kinds/icons), used for marker equality */
  key: string;
  /** document offset (start of the change's first line) */
  pos: number;
  buttons: MergeOperationButton[];
}

export interface MergeGutterConfig {
  side: 'before' | 'after';
  theme: () => ThemeName;
  themeClass: () => string;
}

export const setMergeOperations = StateEffect.define<MergeGutterOperation[]>();

class OperationMarker extends GutterMarker {
  constructor(
    readonly op: MergeGutterOperation,
    readonly config: MergeGutterConfig,
  ) {
    super();
  }
  eq(other: OperationMarker): boolean {
    // buttons resolve their change by index at click time, so the key (generation + index + kinds) is enough
    return other.op.key === this.op.key;
  }
  toDOM(): Node {
    const wrap = document.createElement('span');
    wrap.className = 'idd-merge-ops';
    for (const b of this.op.buttons) {
      const button = document.createElement('span');
      button.className = 'idd-gutter-op';
      button.dataset.icon = b.icon;
      button.innerHTML = getIcon(b.icon, this.config.theme());
      attachTooltip(button, () => b.tooltip, b.appendix, this.config.themeClass);
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        b.run(e.ctrlKey || e.metaKey);
      });
      wrap.appendChild(button);
    }
    return wrap;
  }
}

class SpacerMarker extends GutterMarker {
  constructor(readonly count: number) {
    super();
  }
  eq(other: SpacerMarker): boolean {
    return other.count === this.count;
  }
  toDOM(): Node {
    const wrap = document.createElement('span');
    wrap.className = 'idd-merge-ops';
    for (let i = 0; i < this.count; i++) {
      const s = document.createElement('span');
      s.className = 'idd-gutter-op';
      wrap.appendChild(s);
    }
    return wrap;
  }
}

/** A gutter column with merge operations. `slots` = number of icon slots reserved (column width). */
export function mergeGutterOperations(config: MergeGutterConfig, slots: number): Extension {
  const field = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(setMergeOperations)) {
          const doc = tr.state.doc;
          const ranges: Range<GutterMarker>[] = e.value
            .filter((op) => op.buttons.length > 0)
            .map((op) => new OperationMarker(op, config).range(doc.lineAt(Math.min(op.pos, doc.length)).from));
          return RangeSet.of(ranges, true);
        }
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
  });
  const spacer = new SpacerMarker(slots);
  return [
    field,
    gutter({
      class: 'idd-merge-actions',
      side: config.side,
      markers: (view) => view.state.field(field),
      initialSpacer: () => spacer,
    }),
  ];
}
