// Gutter apply operations (SimpleDiffChangeUi.createAcceptOperation): ">>" in the left editor, "<<" in the
// right editor; holding Ctrl/Cmd on a MODIFIED change switches to "append" (arrow-down icons).
import { RangeSet, StateEffect, StateField, type Extension, type Range, type StateEffectType } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';
import { getIcon, type IconName } from '../icons';
import { attachTooltip, type ThemeName } from '../toolbar/ui';

export interface GutterOperation {
  changeIndex: number;
  /** document offset of the change start on this side */
  pos: number;
  canAppend: boolean;
}

export interface GutterOperationsConfig {
  side: 'left' | 'right';
  theme: () => ThemeName;
  themeClass: () => string;
  applyText: () => string;
  shortcut: string;
  onApply: (changeIndex: number, append: boolean) => void;
  /** defaults: ">>" / "<<" with arrow-down append icons */
  icons?: { apply: IconName; append: IconName };
  /** gutter placement; defaults to 'after' for the left (mirrored) editor, 'before' otherwise */
  gutterSide?: 'before' | 'after';
  /** effect that sets this gutter's operations (lets one editor host several operation gutters) */
  effect?: StateEffectType<GutterOperation[]>;
}

export const setGutterOperations = StateEffect.define<GutterOperation[]>();

class OperationMarker extends GutterMarker {
  constructor(
    readonly op: GutterOperation,
    readonly config: GutterOperationsConfig,
  ) {
    super();
  }
  eq(other: OperationMarker): boolean {
    return other.op.changeIndex === this.op.changeIndex && other.op.canAppend === this.op.canAppend;
  }
  toDOM(): Node {
    const { side, theme } = this.config;
    const button = document.createElement('span');
    button.className = 'idd-gutter-op';
    const apply: IconName = this.config.icons?.apply ?? (side === 'left' ? 'diffArrowRight' : 'diffArrow');
    const append: IconName = this.config.icons?.append ?? (side === 'left' ? 'diffArrowRightDown' : 'diffArrowLeftDown');
    const applyIcon = document.createElement('span');
    applyIcon.className = 'idd-op-apply';
    applyIcon.dataset.icon = apply;
    applyIcon.innerHTML = getIcon(apply, theme());
    button.appendChild(applyIcon);
    if (this.op.canAppend) {
      const appendIcon = document.createElement('span');
      appendIcon.className = 'idd-op-append';
      appendIcon.dataset.icon = append;
      appendIcon.innerHTML = getIcon(append, theme());
      button.appendChild(appendIcon);
    }
    attachTooltip(
      button,
      () => (this.op.canAppend && document.documentElement.classList.contains('idd-mod-down') ? 'Append' : this.config.applyText()),
      this.config.shortcut,
      this.config.themeClass,
    );
    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.config.onApply(this.op.changeIndex, this.op.canAppend && (e.ctrlKey || e.metaKey));
    });
    return button;
  }
}

export function gutterOperations(config: GutterOperationsConfig): Extension {
  const field = StateField.define<RangeSet<GutterMarker>>({
    create: () => RangeSet.empty,
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(config.effect ?? setGutterOperations)) {
          const ranges: Range<GutterMarker>[] = e.value.map((op) =>
            new OperationMarker(op, config).range(tr.state.doc.lineAt(Math.min(op.pos, tr.state.doc.length)).from),
          );
          return RangeSet.of(ranges, true);
        }
      }
      return tr.docChanged ? value.map(tr.changes) : value;
    },
  });
  return [
    field,
    gutter({
      class: 'idd-actions',
      side: config.gutterSide ?? (config.side === 'left' ? 'after' : 'before'),
      markers: (view) => view.state.field(field),
      initialSpacer: () => spacer,
    }),
  ];
}

class SpacerMarker extends GutterMarker {
  toDOM(): Node {
    const span = document.createElement('span');
    span.className = 'idd-gutter-op';
    return span;
  }
}
const spacer = new SpacerMarker();
