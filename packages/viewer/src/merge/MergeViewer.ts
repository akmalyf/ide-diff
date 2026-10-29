// 3-way merge viewer: port of com.intellij.diff.merge.TextMergeViewer / MergeThreesideViewer (+ ThreesideTextDiffViewerEx,
// MergeConflictModel, ThreesideMergeHighlighters), rendered with three CodeMirror 6 editors:
// left (read-only, mirrored gutter) | divider | result (editable) | divider | right (read-only).
import { Compartment, EditorState, Text, Transaction, type Extension } from '@codemirror/state';
import { EditorView, highlightWhitespace, keymap, type ViewUpdate } from '@codemirror/view';
import { DiffTooBigError, type ComparisonPolicy, type HighlightPolicy, type IgnorePolicy } from '@ide-diff/core';
import { baseEditorExtensions, readOnlyExtension } from '../common/editorBase';
import { alignWaves, setFolds, unchangedFolding, type FoldRegion } from '../common/folding';
import { sideLineNumbers } from '../common/lineNumbers';
import { lineStart } from '../common/lines';
import { OverlayScrollbar, type StripeMark } from '../common/scrollbar';
import { injectStyles } from '../theme/styles';
import {
  actionButton,
  closePopup,
  el,
  hideTooltip,
  iconEl,
  retheme,
  separator,
  showPopup,
  type ActionButton,
  type MenuEntry,
  type ThemeName,
} from '../toolbar/ui';
import type { IconName } from '../icons';
import { mergeDecorations, setMergeHighlights, type MergeHighlight } from './decorations';
import { MergeDivider, type MergeDividerChange, type MergeDividerFold } from './divider';
import { computeFoldGroupsN, type FoldGroupN } from './folding';
import { mergeGutterOperations, setMergeOperations, type MergeGutterOperation } from './gutterOps';
import { compareThreesideInner, type ThreesideInner } from './inner';
import {
  BASE,
  LEFT,
  RIGHT,
  MergeCommand,
  computeMergeChanges,
  countUnresolved,
  diffType,
  initialStates,
  isChange,
  isConflict,
  isResolved,
  isResolvedOn,
  linesContent,
  linesRange,
  restoreStates,
  statusText,
  type ChangeState,
  type MergeChange,
  type MergeTexts,
  type Side,
  type ThreeSide,
} from './model';
import { MergeSyncScroll, type AnchorRange } from './syncScroll';
import { mergeState, mergeStateField, setMergeState } from './state';
import { injectMergeStyles } from './styles';
import type { MergeStatus, MergeViewer, MergeViewerOptions } from './types';

type MergeIgnorePolicy = 'DEFAULT' | 'TRIM_WHITESPACES' | 'IGNORE_WHITESPACES';
type MergeHighlightPolicy = 'BY_LINE' | 'BY_WORD';

interface ResolvedMergeOptions {
  left: string;
  base: string;
  right: string;
  language: Extension | undefined;
  leftTitle: string | undefined;
  baseTitle: string | undefined;
  rightTitle: string | undefined;
  theme: ThemeName;
  ignorePolicy: MergeIgnorePolicy;
  highlightPolicy: MergeHighlightPolicy;
  extensions: Extension[];
  collapseUnchanged: boolean;
  contextLines: number;
  syncScroll: boolean;
  showToolbar: boolean;
  autoApplyNonConflicting: boolean;
  showWhitespaces: boolean;
  showLineNumbers: boolean;
  softWraps: boolean;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** MergeThreesideViewer: TextDiffProviderBase(ar(DEFAULT, TRIM_WHITESPACES, IGNORE_WHITESPACES), ar(BY_LINE, BY_WORD)) */
const IGNORE_POLICIES: Array<[MergeIgnorePolicy, string]> = [
  ['DEFAULT', 'None'],
  ['TRIM_WHITESPACES', 'Trim whitespaces'],
  ['IGNORE_WHITESPACES', 'Ignore whitespaces'],
];
const HIGHLIGHT_POLICIES: Array<[MergeHighlightPolicy, string]> = [
  ['BY_LINE', 'Lines'],
  ['BY_WORD', 'Words'],
];

function mergeIgnorePolicy(p: IgnorePolicy | undefined): MergeIgnorePolicy {
  return p === 'IGNORE_WHITESPACES_CHUNKS' ? 'IGNORE_WHITESPACES' : (p ?? 'DEFAULT');
}

function mergeHighlightPolicy(p: HighlightPolicy | undefined): MergeHighlightPolicy {
  return p === 'BY_LINE' || p === 'DO_NOT_HIGHLIGHT' ? 'BY_LINE' : 'BY_WORD';
}

function resolveOptions(o: MergeViewerOptions): ResolvedMergeOptions {
  return {
    left: o.left,
    base: o.base,
    right: o.right,
    language: o.language,
    leftTitle: o.leftTitle,
    baseTitle: o.baseTitle,
    rightTitle: o.rightTitle,
    theme: o.theme ?? 'dark',
    ignorePolicy: mergeIgnorePolicy(o.ignorePolicy),
    highlightPolicy: mergeHighlightPolicy(o.highlightPolicy),
    extensions: o.extensions ?? [],
    collapseUnchanged: o.collapseUnchanged ?? true,
    contextLines: o.contextLines ?? 4,
    syncScroll: o.syncScroll ?? true,
    showToolbar: o.showToolbar ?? true,
    autoApplyNonConflicting: o.autoApplyNonConflicting ?? false,
    showWhitespaces: false,
    showLineNumbers: true,
    softWraps: false,
  };
}

const toText = (s: string) => Text.of(s.split(/\r\n|\r|\n/));

let modifierListenerInstalled = false;
function installModifierListener(): void {
  if (modifierListenerInstalled || typeof window === 'undefined') return;
  modifierListenerInstalled = true;
  const update = (e: KeyboardEvent | MouseEvent) => document.documentElement.classList.toggle('idd-mod-down', e.ctrlKey || e.metaKey);
  window.addEventListener('keydown', update, true);
  window.addEventListener('keyup', update, true);
  window.addEventListener('mousemove', update, true);
  window.addEventListener('blur', () => document.documentElement.classList.remove('idd-mod-down'));
}

type ButtonKey =
  | 'prev'
  | 'next'
  | 'prevConflict'
  | 'nextConflict'
  | 'collapse'
  | 'applyLeft'
  | 'applyAll'
  | 'applyRight'
  | 'magic'
  | 'revert'
  | 'settings';

// DiffBundle tooltip.merge.ctrl.click.to.resolve.conflict (Ctrl+click is a right click on macOS, so Cmd is used there)
const CTRL_CLICK = IS_MAC ? 'Cmd+click to resolve conflict' : 'Ctrl+click to resolve conflict';

export class TextMergeViewer implements MergeViewer {
  private opts: ResolvedMergeOptions;
  private texts: MergeTexts;
  private readonly root: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly titles: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private readonly balloon: HTMLDivElement;
  private readonly dividers = [new MergeDivider(), new MergeDivider()] as const;
  private readonly views: [EditorView, EditorView, EditorView];
  private readonly scrollbars: [OverlayScrollbar, OverlayScrollbar, OverlayScrollbar];
  private readonly sync: MergeSyncScroll;
  private readonly buttons: Record<ButtonKey, ActionButton>;
  private readonly compartments = {
    language: new Compartment(),
    whitespace: new Compartment(),
    wrap: new Compartment(),
    lineNumbers: [new Compartment(), new Compartment(), new Compartment()] as const,
    extensions: new Compartment(),
  };

  /** bumped on every restart; gutter operations created for an older generation are ignored */
  private generation = 0;
  private innerCache = new Map<number, { key: string; inner: ThesideInnerOrNull }>();
  private foldGroups: FoldGroupN[] = [];
  private foldLevels = new Map<string, number>();
  private dividerItems: [MergeDividerChange[], MergeDividerChange[]] = [[], []];
  private lastFocused: ThreeSide = BASE;
  private lastCounts: MergeStatus | null = null;
  private refreshQueued = false;
  private paintFrame = 0;
  private balloonTimer = 0;
  private disposed = false;
  private readonly changeListeners = new Set<(result: string) => void>();
  private readonly statusListeners = new Set<(status: MergeStatus) => void>();
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    options: MergeViewerOptions,
  ) {
    const rootNode = container.getRootNode();
    const styleRoot = rootNode instanceof ShadowRoot ? rootNode : document;
    injectStyles(styleRoot);
    injectMergeStyles(styleRoot);
    installModifierListener();
    this.opts = resolveOptions(options);
    this.texts = { left: toText(this.opts.left), base: toText(this.opts.base), right: toText(this.opts.right) };

    this.root = el('div', `idd-root idd-merge idd-theme-${this.opts.theme}`);
    this.toolbar = el('div', 'idd-toolbar');
    this.status = el('span', 'idd-status');
    this.titles = el('div', 'idd-titles');
    this.notice = el('div', 'idd-notice');
    this.balloon = el('div', 'idd-merge-balloon');
    const body = el('div', 'idd-body');
    const panes = [
      el('div', 'idd-pane idd-pane-left'),
      el('div', 'idd-pane idd-pane-right idd-pane-result'),
      el('div', 'idd-pane idd-pane-right'),
    ] as const;

    this.views = [this.createEditor(0, this.opts.left), this.createEditor(1, this.opts.base), this.createEditor(2, this.opts.right)];
    this.scrollbars = [
      new OverlayScrollbar(this.views[0], 'left'),
      new OverlayScrollbar(this.views[1], 'right'),
      new OverlayScrollbar(this.views[2], 'right'),
    ];
    this.sync = new MergeSyncScroll(this.views);
    this.sync.enabled = this.opts.syncScroll;

    panes.forEach((pane, side) => pane.append(this.views[side as ThreeSide].dom, this.scrollbars[side as ThreeSide].dom));
    panes[1].appendChild(this.balloon);
    body.append(panes[0], this.dividers[0].dom, panes[1], this.dividers[1].dom, panes[2]);

    this.buttons = this.buildToolbar();
    this.root.append(this.toolbar, this.titles, this.notice, body);
    this.toolbar.style.display = this.opts.showToolbar ? '' : 'none';
    container.appendChild(this.root);
    this.renderTitles();

    this.views.forEach((view, side) => {
      view.scrollDOM.addEventListener('scroll', () => {
        this.sync.onScroll(side as ThreeSide);
        this.schedulePaint();
      });
    });
    this.resizeObserver = new ResizeObserver(() => this.schedulePaint());
    this.resizeObserver.observe(this.root);

    this.restart(options.result ?? this.opts.base, options.result != null);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Editors

  private editorExtensions(side: ThreeSide): Extension[] {
    const o = this.opts;
    const mod = IS_MAC ? 'Ctrl-Cmd' : 'Ctrl-Alt';
    const mergeKeymap = keymap.of([
      { key: 'F7', run: () => (this.goToNextChange(), true) },
      { key: 'Shift-F7', run: () => (this.goToPreviousChange(), true) },
      // Diff.ApplyLeftSide / Diff.ApplyRightSide (ApplySelectedChangesAction)
      { key: IS_MAC ? `${mod}-ArrowRight` : 'Ctrl-Alt-r', run: () => this.applySelectedChanges(0, side) },
      { key: IS_MAC ? `${mod}-ArrowLeft` : 'Ctrl-Alt-a', run: () => this.applySelectedChanges(1, side) },
    ]);
    return [
      mergeKeymap,
      this.compartments.lineNumbers[side].of(o.showLineNumbers ? sideLineNumbers(side === 0 ? 'after' : 'before') : []),
      mergeGutterOperations(
        { side: side === 0 ? 'after' : 'before', theme: () => this.opts.theme, themeClass: () => `idd-theme-${this.opts.theme}` },
        side === BASE ? 1 : 2,
      ),
      baseEditorExtensions(),
      mergeDecorations(),
      unchangedFolding(),
      this.compartments.language.of(o.language ?? []),
      this.compartments.whitespace.of(o.showWhitespaces ? highlightWhitespace() : []),
      this.compartments.wrap.of(o.softWraps ? EditorView.lineWrapping : []),
      this.compartments.extensions.of(o.extensions),
      readOnlyExtension(side !== BASE),
      side === BASE ? mergeState() : [],
      EditorView.updateListener.of((u) => this.onEditorUpdate(side, u)),
      EditorView.domEventHandlers({
        focus: () => {
          this.lastFocused = side;
          this.updateNavigationButtons();
        },
      }),
    ];
  }

  private createEditor(side: ThreeSide, doc: string): EditorView {
    return new EditorView({ state: EditorState.create({ doc, extensions: this.editorExtensions(side) }) });
  }

  private onEditorUpdate(side: ThreeSide, u: ViewUpdate): void {
    if (side === BASE) {
      if (u.docChanged) {
        const text = u.state.doc.toString();
        this.changeListeners.forEach((cb) => cb(text));
      }
      if (u.docChanged || u.startState.field(mergeStateField, false) !== u.state.field(mergeStateField, false)) this.scheduleRefresh();
    }
    if (u.selectionSet || u.docChanged) this.updateNavigationButtons();
    if (u.geometryChanged || u.heightChanged || u.viewportChanged || u.docChanged) this.schedulePaint();
  }

  private get resultView(): EditorView {
    return this.views[1];
  }

  private get model(): { changes: readonly MergeChange[]; states: ChangeState[] } {
    return this.resultView.state.field(mergeStateField);
  }

  private doc(side: ThreeSide): Text {
    return this.views[side].state.doc;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // (Re)start: MergeConflictModel.rediff + MergeThreesideViewer.apply

  private comparisonPolicy(): ComparisonPolicy {
    return this.opts.ignorePolicy;
  }

  /**
   * Computes the merge fragments for (left, base, right) and installs `resultText` as the result.
   * `infer`: the result may differ from base — re-attach it to the new fragments (restoreStates) instead of
   * assuming result == base.
   */
  private restart(resultText: string, infer: boolean): void {
    this.generation++;
    this.innerCache.clear();
    this.notice.replaceChildren();
    this.notice.classList.remove('idd-visible');
    let changes: MergeChange[];
    try {
      changes = computeMergeChanges(this.opts.left, this.opts.base, this.opts.right, this.comparisonPolicy());
    } catch (e) {
      if (!(e instanceof DiffTooBigError)) console.error('[ide-diff] merge failed', e);
      changes = [];
      this.notice.append(e instanceof DiffTooBigError ? 'Contents are too big to be compared' : 'Can not calculate differences');
      this.notice.classList.add('idd-visible');
    }
    const result = toText(resultText);
    const states = infer ? restoreStates(changes, this.texts, result) : initialStates(changes);

    // a fresh EditorState: resets undo history (IntelliJ: setInitialOutputContent is non-undoable)
    const view = this.resultView;
    const previous = view.state.doc.toString();
    const scrollTop = view.scrollDOM.scrollTop;
    view.setState(EditorState.create({ doc: result, extensions: this.editorExtensions(BASE) }));
    view.dispatch({ effects: setMergeState.of({ changes, states }), annotations: Transaction.addToHistory.of(false) });
    view.scrollDOM.scrollTop = scrollTop;
    this.lastCounts = null;
    if (result.toString() !== previous) {
      const text = result.toString();
      this.changeListeners.forEach((cb) => cb(text));
    }

    if (this.opts.autoApplyNonConflicting && !infer) {
      this.execute((cmd) => cmd.applyNonConflictedChanges(BASE));
    }
    this.refresh();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Presentation refresh (highlighters, operations, folding, dividers, status)

  private scheduleRefresh(): void {
    if (this.refreshQueued || this.disposed) return;
    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      if (!this.disposed) this.refresh();
    });
  }

  /** MyInnerDiffWorker: by-word differences of the current left / result / right chunks of an unresolved change */
  private innerFor(index: number, c: MergeChange, s: ChangeState): ThesideInnerOrNull {
    if (this.opts.highlightPolicy !== 'BY_WORD' || isResolved(s)) return null;
    const chunks = ([LEFT, BASE, RIGHT] as const).map((side) => {
      if (!isChange(c, side) || isResolvedOn(s, side)) return null;
      const [start, end] = side === BASE ? [s.start, s.end] : [c.startLine[side], c.endLine[side]];
      if (start === end) return null;
      return linesContent(this.doc(side), start, end);
    }) as [string | null, string | null, string | null];
    const key = `${this.opts.ignorePolicy}\u0001${chunks.map((t) => (t == null ? '\u0002' : t)).join('\u0000')}`;
    const cached = this.innerCache.get(index);
    if (cached && cached.key === key) return cached.inner;
    let inner: ThesideInnerOrNull = null;
    try {
      inner = compareThreesideInner(chunks, this.comparisonPolicy());
    } catch (e) {
      if (!(e instanceof DiffTooBigError)) console.error('[ide-diff] inner diff failed', e);
    }
    this.innerCache.set(index, { key, inner });
    return inner;
  }

  private refresh(): void {
    if (this.disposed) return;
    const { changes, states } = this.model;
    const gen = this.generation;
    const docs = [this.doc(0), this.doc(1), this.doc(2)] as const;
    const probe = new MergeCommand(this.texts, changes, docs[1], states);
    const highlights: [MergeHighlight[], MergeHighlight[], MergeHighlight[]] = [[], [], []];
    const ops: [MergeGutterOperation[], MergeGutterOperation[], MergeGutterOperation[]] = [[], [], []];
    const marks: [StripeMark[], StripeMark[], StripeMark[]] = [[], [], []];
    const leftItems: MergeDividerChange[] = [];
    const rightItems: MergeDividerChange[] = [];
    const leftAnchors: AnchorRange[] = [];
    const rightAnchors: AnchorRange[] = [];
    const lines = (c: MergeChange, s: ChangeState, side: ThreeSide): [number, number] =>
      side === BASE ? [s.start, s.end] : [c.startLine[side], c.endLine[side]];

    changes.forEach((c, i) => {
      const s = states[i];
      if (!s) return;
      const type = diffType(c);
      const inner = this.innerFor(i, c, s);
      for (const side of [LEFT, BASE, RIGHT] as const) {
        if (!isChange(c, side)) continue;
        const [start, end] = lines(c, s, side);
        const resolved = isResolvedOn(s, side);
        const doc = docs[side];
        const sideInner = !resolved && inner ? inner[side] : null;
        const offset = sideInner ? linesRange(doc, start, end).from : 0;
        highlights[side].push({
          startLine: start,
          endLine: end,
          type,
          resolved,
          ignored: !resolved && inner != null,
          inner: sideInner ? sideInner.map(([f, t]) => [offset + f, offset + t] as [number, number]) : [],
        });
        if (!resolved) {
          const from = lineStart(doc, start);
          marks[side].push({ from, to: start === end ? from : lineStart(doc, end - 1), type: type.toLowerCase() });
        }
      }

      // gutter operations (ThreesideMergeHighlighters.installOperations)
      const conflict = isConflict(c);
      for (const side of [0, 1] as const) {
        const three = side === 0 ? LEFT : RIGHT;
        if (!isChange(c, three) || s.resolved[side]) continue;
        const applyIcon: IconName =
          side === 0 ? (s.onesideApplied ? 'diffArrowRightDown' : 'diffArrowRight') : s.onesideApplied ? 'diffArrowLeftDown' : 'diffArrow';
        ops[three].push({
          key: `${gen}:${i}:${applyIcon}:${conflict}`,
          pos: lineStart(docs[three], c.startLine[three]),
          buttons: [
            {
              icon: applyIcon,
              tooltip: 'Accept',
              appendix: conflict ? CTRL_CLICK : undefined,
              run: (modifier) => this.runOperation(gen, (cmd) => cmd.replaceChange(i, side, modifier)),
            },
            {
              icon: 'diffRemove',
              tooltip: 'Ignore',
              appendix: conflict ? CTRL_CLICK : undefined,
              run: (modifier) => this.runOperation(gen, (cmd) => cmd.ignoreChange(i, side, modifier)),
            },
          ],
        });
      }
      if (!isResolved(s) && conflict && probe.canResolveChangeAutomatically(i, BASE)) {
        ops[BASE].push({
          key: `${gen}:${i}:resolve`,
          pos: lineStart(docs[BASE], s.start),
          buttons: [
            {
              icon: 'diffMagicResolve',
              tooltip: 'Resolve',
              run: () => this.runOperation(gen, (cmd) => cmd.resolveChangeAutomatically(i, BASE)),
            },
          ],
        });
      }

      // dividers (MyDividerPaintable) and sync scroll anchors (MySyncScrollable): all changes, resolved included
      if (isChange(c, LEFT)) {
        leftItems.push({ startLine1: c.startLine[0], endLine1: c.endLine[0], startLine2: s.start, endLine2: s.end, type, resolved: s.resolved[0] });
      }
      if (isChange(c, RIGHT)) {
        rightItems.push({ startLine1: s.start, endLine1: s.end, startLine2: c.startLine[2], endLine2: c.endLine[2], type, resolved: s.resolved[1] });
      }
      leftAnchors.push([c.startLine[0], c.endLine[0], s.start, s.end]);
      rightAnchors.push([s.start, s.end, c.startLine[2], c.endLine[2]]);
    });
    this.dividerItems = [leftItems, rightItems];
    this.sync.setAnchors(leftAnchors, rightAnchors);

    const folds = this.computeFolds(changes, states);
    this.views.forEach((view, side) => {
      view.dispatch({
        effects: [
          setMergeHighlights.of(highlights[side as ThreeSide]),
          setMergeOperations.of(ops[side as ThreeSide]),
          setFolds.of({ regions: folds[side as ThreeSide], onExpand: (id) => this.expandFold(id) }),
        ],
      });
      this.scrollbars[side as ThreeSide].setMarks(marks[side as ThreeSide]);
    });

    this.updateStatus(probe);
    this.updateNavigationButtons();
    this.schedulePaint();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Folding (MyFoldingModel over the three editors)

  private foldKey(g: FoldGroupN): string {
    // left/right documents are read-only, so their gap starts identify a group across recomputations
    return `${g.anchor[0]}:${g.anchor[2]}`;
  }

  private computeFolds(changes: readonly MergeChange[], states: readonly ChangeState[]): [FoldRegion[], FoldRegion[], FoldRegion[]] {
    this.foldGroups = this.opts.collapseUnchanged
      ? computeFoldGroupsN(
          changes.map((c, i) => [c.startLine[0], c.endLine[0], states[i]!.start, states[i]!.end, c.startLine[2], c.endLine[2]]),
          [this.doc(0).lines, this.doc(1).lines, this.doc(2).lines],
          this.opts.contextLines,
        )
      : [];
    const regions: [FoldRegion[], FoldRegion[], FoldRegion[]] = [[], [], []];
    for (const g of this.foldGroups) {
      const block = g.blocks[this.foldLevels.get(this.foldKey(g)) ?? 0];
      if (!block) continue;
      block.forEach((r, side) => {
        if (r) regions[side as ThreeSide].push(r);
      });
    }
    this.updateCollapseButton();
    return regions;
  }

  private expandFold(groupId: number): void {
    const g = this.foldGroups.find((x) => x.id === groupId);
    if (!g) return;
    const key = this.foldKey(g);
    this.foldLevels.set(key, (this.foldLevels.get(key) ?? 0) + 1);
    this.refresh();
  }

  private anyCollapsed(): boolean {
    return this.opts.collapseUnchanged && this.foldGroups.some((g) => (this.foldLevels.get(this.foldKey(g)) ?? 0) < g.blocks.length);
  }

  private updateCollapseButton(): void {
    this.buttons?.collapse.setSelected(this.anyCollapsed());
  }

  /** ToggleExpandByDefaultAction */
  private toggleCollapse(): void {
    if (this.anyCollapsed()) {
      for (const g of this.foldGroups) this.foldLevels.set(this.foldKey(g), g.blocks.length);
    } else {
      this.opts.collapseUnchanged = true;
      this.foldLevels.clear();
    }
    this.refresh();
  }

  private dividerFolds(a: ThreeSide, b: ThreeSide): MergeDividerFold[] {
    const va = this.views[a];
    const vb = this.views[b];
    const folds: MergeDividerFold[] = [];
    for (const g of this.foldGroups) {
      const block = g.blocks[this.foldLevels.get(this.foldKey(g)) ?? 0];
      const ra = block?.[a];
      const rb = block?.[b];
      if (!ra || !rb) continue;
      const ba = va.lineBlockAt(lineStart(va.state.doc, ra.startLine));
      const bb = vb.lineBlockAt(lineStart(vb.state.doc, rb.startLine));
      folds.push({ pos1: ba.top + ba.height / 2, pos2: bb.top + bb.height / 2 });
    }
    return folds;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Painting

  private schedulePaint(): void {
    if (this.paintFrame || this.disposed) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const [v0, v1, v2] = this.views;
    this.dividers[0].paint(v0, v1, this.dividerItems[0], this.dividerFolds(0, 1));
    this.dividers[1].paint(v1, v2, this.dividerItems[1], this.dividerFolds(1, 2));
    alignWaves(this.root);
    this.scrollbars.forEach((s) => s.update());
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Merge commands

  /** MergeThreesideViewer.executeMergeCommand: one undoable transaction on the result editor. */
  private execute(task: (cmd: MergeCommand) => void): boolean {
    const view = this.resultView;
    const { changes, states } = this.model;
    const cmd = new MergeCommand(this.texts, changes, view.state.doc, states);
    task(cmd);
    if (!cmd.modified) return false;
    view.dispatch({
      changes: cmd.changeSet,
      effects: setMergeState.of({ changes, states: cmd.states }),
      userEvent: 'input.merge',
    });
    return true;
  }

  private runOperation(gen: number, task: (cmd: MergeCommand) => void): void {
    if (gen !== this.generation || this.disposed) return;
    hideTooltip();
    this.execute(task);
  }

  /** ApplySelectedChangesAction (Diff.ApplyLeftSide / Diff.ApplyRightSide) in editor `editorSide` */
  private applySelectedChanges(side: Side, editorSide: ThreeSide): boolean {
    if (editorSide !== BASE && editorSide !== (side === 0 ? LEFT : RIGHT)) return false;
    const view = this.views[editorSide];
    const doc = view.state.doc;
    const ranges = view.state.selection.ranges.map((r) => [doc.lineAt(r.from).number - 1, doc.lineAt(r.to).number - 1] as const);
    const { changes, states } = this.model;
    const selected = changes
      .map((c, i) => ({ c, i, s: states[i]! }))
      .filter(({ c, s }) => {
        if (isResolved(s) || s.resolved[side]) return false;
        const [l1, l2] = editorSide === BASE ? [s.start, s.end] : [c.startLine[editorSide], c.endLine[editorSide]];
        return ranges.some(([a, b]) => (l1 === l2 ? a <= l1 && l1 <= b + 1 : a < l2 && b >= l1));
      });
    if (!selected.length) return true; // consume the shortcut, like IntelliJ
    this.execute((cmd) => selected.forEach(({ i }) => cmd.replaceChange(i, side, false)));
    return true;
  }

  private scrollToFirstUnresolved(): void {
    const { states } = this.model;
    const i = states.findIndex((s) => !isResolved(s));
    if (i >= 0) this.scrollToChange(i);
  }

  applyNonConflicting(side: 'left' | 'right' | 'all' = 'all'): void {
    const three = side === 'left' ? LEFT : side === 'right' ? RIGHT : BASE;
    this.execute((cmd) => cmd.applyNonConflictedChanges(three));
    this.scrollToFirstUnresolved();
  }

  resolveSimpleConflicts(): void {
    this.execute((cmd) => cmd.applyResolvableConflictedChanges());
    this.scrollToFirstUnresolved();
  }

  acceptSide(side: 'left' | 'right'): void {
    this.execute((cmd) => cmd.acceptRevisionForSide(side === 'left' ? 0 : 1));
  }

  revertResolution(): void {
    this.execute((cmd) => cmd.resetChanges());
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Navigation (MyPrevNextDifferenceIterable / MyPrevNextConflictIterable)

  private navigableChanges(conflictsOnly: boolean, side: ThreeSide): number[] {
    const { changes, states } = this.model;
    const result: number[] = [];
    changes.forEach((c, i) => {
      const s = states[i];
      if (!s || isResolved(s)) return;
      if (conflictsOnly && !isConflict(c)) return;
      if (!conflictsOnly && side !== BASE && !isChange(c, side)) return;
      result.push(i);
    });
    return result;
  }

  private changeLines(i: number, side: ThreeSide): [number, number] {
    const { changes, states } = this.model;
    const c = changes[i]!;
    const s = states[i]!;
    return side === BASE ? [s.start, s.end] : [c.startLine[side], c.endLine[side]];
  }

  private findChange(direction: 1 | -1, conflictsOnly: boolean): number {
    const side = this.lastFocused;
    const view = this.views[side];
    const line = view.state.doc.lineAt(view.state.selection.main.head).number - 1;
    const list = this.navigableChanges(conflictsOnly, side);
    if (direction === 1) return list.find((i) => this.changeLines(i, side)[0] > line) ?? -1;
    for (let k = list.length - 1; k >= 0; k--) {
      const [s, e] = this.changeLines(list[k]!, side);
      if (e <= line && s !== line) return list[k]!;
    }
    return -1;
  }

  /** ThreesideTextDiffViewerEx.doScrollToChange: caret to the change start in every editor, scroll the current one */
  private scrollToChange(index: number): void {
    const side = this.lastFocused;
    this.views.forEach((view, s) => {
      const pos = lineStart(view.state.doc, this.changeLines(index, s as ThreeSide)[0]);
      view.dispatch({
        selection: { anchor: pos },
        effects: s === side ? EditorView.scrollIntoView(pos, { y: 'center' }) : [],
      });
    });
    this.views[side].focus();
    requestAnimationFrame(() => this.sync.sync(side));
  }

  goToNextChange(): void {
    const i = this.findChange(1, false);
    if (i >= 0) this.scrollToChange(i);
  }

  goToPreviousChange(): void {
    const i = this.findChange(-1, false);
    if (i >= 0) this.scrollToChange(i);
  }

  goToNextConflict(): void {
    const i = this.findChange(1, true);
    if (i >= 0) this.scrollToChange(i);
  }

  goToPreviousConflict(): void {
    const i = this.findChange(-1, true);
    if (i >= 0) this.scrollToChange(i);
  }

  private updateNavigationButtons(): void {
    if (!this.buttons) return;
    this.buttons.next.setEnabled(this.findChange(1, false) >= 0);
    this.buttons.prev.setEnabled(this.findChange(-1, false) >= 0);
    this.buttons.nextConflict.setEnabled(this.findChange(1, true) >= 0);
    this.buttons.prevConflict.setEnabled(this.findChange(-1, true) >= 0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Status (MyMergeStatusPanel) + "All changes have been processed" balloon

  private updateStatus(probe: MergeCommand): void {
    const counts = countUnresolved(probe.changes, probe.states);
    const done = counts.changes === 0 && counts.conflicts === 0;
    this.status.replaceChildren();
    if (done) this.status.appendChild(iconEl('generalGreenCheckmark', this.opts.theme));
    this.status.append(statusText(counts));
    this.status.classList.toggle('idd-merge-done', done);

    this.buttons.applyLeft.setEnabled(probe.hasNonConflictedChanges(LEFT));
    this.buttons.applyAll.setEnabled(probe.hasNonConflictedChanges(BASE));
    this.buttons.applyRight.setEnabled(probe.hasNonConflictedChanges(RIGHT));
    this.buttons.magic.setEnabled(probe.hasAutoResolvableConflictedChanges());
    this.buttons.revert.setEnabled(probe.states.some((s) => isResolved(s)));

    const prev = this.lastCounts;
    this.lastCounts = counts;
    if (prev && (prev.changes !== counts.changes || prev.conflicts !== counts.conflicts)) {
      if (done && probe.changes.length > 0) this.showBalloon();
      this.statusListeners.forEach((cb) => cb({ ...counts }));
    } else if (!prev) {
      this.statusListeners.forEach((cb) => cb({ ...counts }));
    }
    if (!done) this.hideBalloon();
  }

  private showBalloon(): void {
    this.balloon.replaceChildren(
      iconEl('generalGreenCheckmark', this.opts.theme),
      el('span', undefined, 'All changes have been processed'),
    );
    const close = el('span', 'idd-merge-balloon-close');
    close.appendChild(iconEl('generalCloseSmall', this.opts.theme));
    close.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.hideBalloon();
    });
    this.balloon.appendChild(close);
    this.balloon.classList.add('idd-visible');
    window.clearTimeout(this.balloonTimer);
    this.balloonTimer = window.setTimeout(() => this.hideBalloon(), 8000);
  }

  private hideBalloon(): void {
    window.clearTimeout(this.balloonTimer);
    this.balloon.classList.remove('idd-visible');
  }

  getStatus(): MergeStatus {
    const { changes, states } = this.model;
    return countUnresolved(changes, states);
  }

  onDidUpdateStatus(cb: (status: MergeStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Toolbar

  private buildToolbar(): Record<ButtonKey, ActionButton> {
    const theme = this.opts.theme;
    const themeClass = () => `idd-theme-${this.opts.theme}`;
    const b = (icon: IconName, tooltip: string, onClick: (e: MouseEvent) => void, shortcut?: string) =>
      actionButton({ icon, theme, tooltip, onClick, shortcut, themeClass });
    const textButton = (icon: IconName, text: string, tooltip: string, onClick: () => void) => {
      const button = b(icon, tooltip, onClick);
      button.dom.classList.add('idd-merge-text-btn');
      button.dom.appendChild(el('span', undefined, text));
      return button;
    };

    const buttons: Record<ButtonKey, ActionButton> = {
      prev: b('generalUp', 'Previous Difference', () => this.goToPreviousChange(), 'Shift+F7'),
      next: b('generalDown', 'Next Difference', () => this.goToNextChange(), 'F7'),
      prevConflict: b('generalChevronUp', 'Previous Conflict', () => this.goToPreviousConflict()),
      nextConflict: b('generalChevronDown', 'Next Conflict', () => this.goToNextConflict()),
      collapse: b('generalCollapseAll', 'Collapse Unchanged Fragments', () => this.toggleCollapse()),
      applyLeft: textButton('diffApplyNotConflictsLeft', 'Left', 'Apply Non-Conflicting Changes from the Left Side', () =>
        this.applyNonConflicting('left'),
      ),
      applyAll: textButton('diffApplyNotConflicts', 'All', 'Apply All Non-Conflicting Changes', () => this.applyNonConflicting('all')),
      applyRight: textButton('diffApplyNotConflictsRight', 'Right', 'Apply Non-Conflicting Changes from the Right Side', () =>
        this.applyNonConflicting('right'),
      ),
      magic: b('diffMagicResolveToolbar', 'Resolve Simple Conflicts', () => this.resolveSimpleConflicts()),
      revert: b('vcsRevert', 'Revert Conflict Resolution', () => this.revertResolution()),
      settings: b('generalSettings', 'Settings', (e) => this.showSettings(e.currentTarget as HTMLElement)),
    };

    const left = el('div', 'idd-toolbar-left');
    left.append(
      buttons.prev.dom,
      buttons.next.dom,
      buttons.prevConflict.dom,
      buttons.nextConflict.dom,
      separator(),
      buttons.collapse.dom,
      separator(),
      el('span', 'idd-merge-label', 'Apply non-conflicting changes:'),
      buttons.applyLeft.dom,
      buttons.applyAll.dom,
      buttons.applyRight.dom,
      separator(),
      buttons.magic.dom,
      buttons.revert.dom,
    );
    const right = el('div', 'idd-toolbar-right');
    right.append(this.status, buttons.settings.dom);
    this.toolbar.append(left, el('div', 'idd-toolbar-spacer'), right);
    return buttons;
  }

  private showSettings(anchor: HTMLElement): void {
    const o = this.opts;
    const entries: MenuEntry[] = [
      { kind: 'check', text: 'Synchronize Scrolling', checked: o.syncScroll, onSelect: () => this.setOptions({ syncScroll: !o.syncScroll }) },
      { kind: 'separator' },
      { kind: 'header', text: 'Ignore Differences' },
      ...IGNORE_POLICIES.map(([policy, text]): MenuEntry => ({
        kind: 'check',
        text,
        checked: o.ignorePolicy === policy,
        onSelect: () => this.setOptions({ ignorePolicy: policy }),
      })),
      { kind: 'separator' },
      { kind: 'header', text: 'Highlighting Differences' },
      ...HIGHLIGHT_POLICIES.map(([policy, text]): MenuEntry => ({
        kind: 'check',
        text,
        checked: o.highlightPolicy === policy,
        onSelect: () => this.setOptions({ highlightPolicy: policy }),
      })),
      { kind: 'separator' },
      { kind: 'header', text: 'Appearance' },
      { kind: 'check', text: 'Show Whitespaces', checked: o.showWhitespaces, onSelect: () => this.setAppearance({ showWhitespaces: !o.showWhitespaces }) },
      { kind: 'check', text: 'Show Line Numbers', checked: o.showLineNumbers, onSelect: () => this.setAppearance({ showLineNumbers: !o.showLineNumbers }) },
      { kind: 'check', text: 'Use Soft Wraps', checked: o.softWraps, onSelect: () => this.setAppearance({ softWraps: !o.softWraps }) },
    ];
    showPopup(anchor, entries, o.theme, `idd-theme-${o.theme}`);
  }

  private setAppearance(a: Partial<Pick<ResolvedMergeOptions, 'showWhitespaces' | 'showLineNumbers' | 'softWraps'>>): void {
    Object.assign(this.opts, a);
    this.views.forEach((view, side) =>
      view.dispatch({
        effects: [
          this.compartments.whitespace.reconfigure(this.opts.showWhitespaces ? highlightWhitespace() : []),
          this.compartments.wrap.reconfigure(this.opts.softWraps ? EditorView.lineWrapping : []),
          this.compartments.lineNumbers[side as ThreeSide].reconfigure(
            this.opts.showLineNumbers ? sideLineNumbers(side === 0 ? 'after' : 'before') : [],
          ),
        ],
      }),
    );
    this.schedulePaint();
  }

  private renderTitles(): void {
    const o = this.opts;
    this.titles.replaceChildren();
    const make = (text: string, readOnly: boolean, cls = '') => {
      const t = el('div', `idd-title ${cls}`);
      if (readOnly) {
        const lock = iconEl('diffDisableEditing', o.theme);
        lock.title = 'Read-only';
        t.appendChild(lock);
      }
      t.appendChild(el('span', 'idd-title-text', text));
      return t;
    };
    this.titles.append(
      make(o.leftTitle ?? '', true),
      el('div', 'idd-title-gap'),
      make(o.baseTitle ?? 'Result', false, 'idd-title-result'),
      el('div', 'idd-title-gap'),
      make(o.rightTitle ?? '', true),
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public API

  getResult(): string {
    return this.resultView.state.doc.toString();
  }

  /** The three CodeMirror views (left, result, right) for advanced integrations. */
  getEditors(): [EditorView, EditorView, EditorView] {
    return this.views;
  }

  onDidChange(cb: (result: string) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  setOptions(o: Partial<MergeViewerOptions>): void {
    let restart: 'none' | 'keep' | 'reset' = 'none';
    const replaceDoc = (side: 0 | 2, text: string) => {
      const view = this.views[side];
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    };
    if (o.left !== undefined && o.left !== this.opts.left) {
      this.opts.left = o.left;
      this.texts = { ...this.texts, left: toText(o.left) };
      replaceDoc(0, o.left);
      restart = 'keep';
    }
    if (o.right !== undefined && o.right !== this.opts.right) {
      this.opts.right = o.right;
      this.texts = { ...this.texts, right: toText(o.right) };
      replaceDoc(2, o.right);
      restart = 'keep';
    }
    if (o.base !== undefined && o.base !== this.opts.base) {
      this.opts.base = o.base;
      this.texts = { ...this.texts, base: toText(o.base) };
      restart = 'reset';
    }
    if (o.theme && o.theme !== this.opts.theme) {
      this.root.classList.replace(`idd-theme-${this.opts.theme}`, `idd-theme-${o.theme}`);
      this.opts.theme = o.theme;
      retheme(this.root, o.theme);
      closePopup();
    }
    if ('language' in o) {
      this.opts.language = o.language;
      this.views.forEach((v) => v.dispatch({ effects: this.compartments.language.reconfigure(o.language ?? []) }));
    }
    if (o.extensions) {
      this.opts.extensions = o.extensions;
      this.views.forEach((v) => v.dispatch({ effects: this.compartments.extensions.reconfigure(o.extensions!) }));
    }
    if (o.leftTitle !== undefined || o.baseTitle !== undefined || o.rightTitle !== undefined) {
      if (o.leftTitle !== undefined) this.opts.leftTitle = o.leftTitle;
      if (o.baseTitle !== undefined) this.opts.baseTitle = o.baseTitle;
      if (o.rightTitle !== undefined) this.opts.rightTitle = o.rightTitle;
      this.renderTitles();
    }
    if (o.ignorePolicy !== undefined && mergeIgnorePolicy(o.ignorePolicy) !== this.opts.ignorePolicy) {
      // IntelliJ restarts the merge (asking to discard edits); we keep the result and re-attach it to the new fragments
      this.opts.ignorePolicy = mergeIgnorePolicy(o.ignorePolicy);
      if (restart === 'none') restart = 'keep';
    }
    let refresh = false;
    if (o.highlightPolicy !== undefined && mergeHighlightPolicy(o.highlightPolicy) !== this.opts.highlightPolicy) {
      this.opts.highlightPolicy = mergeHighlightPolicy(o.highlightPolicy);
      refresh = true;
    }
    if (o.contextLines !== undefined && o.contextLines !== this.opts.contextLines) {
      this.opts.contextLines = o.contextLines;
      refresh = true;
    }
    if (o.collapseUnchanged !== undefined && o.collapseUnchanged !== this.opts.collapseUnchanged) {
      this.opts.collapseUnchanged = o.collapseUnchanged;
      this.foldLevels.clear();
      refresh = true;
    }
    if (o.syncScroll !== undefined) {
      this.opts.syncScroll = o.syncScroll;
      this.sync.enabled = o.syncScroll;
      if (o.syncScroll) this.sync.sync(this.lastFocused);
    }
    if (o.showToolbar !== undefined) {
      this.opts.showToolbar = o.showToolbar;
      this.toolbar.style.display = o.showToolbar ? '' : 'none';
    }
    if (o.autoApplyNonConflicting !== undefined) this.opts.autoApplyNonConflicting = o.autoApplyNonConflicting;

    if (o.result !== undefined) {
      this.restart(o.result, true);
    } else if (restart === 'reset') {
      this.foldLevels.clear();
      this.restart(this.opts.base, false);
    } else if (restart === 'keep') {
      const result = this.getResult();
      this.restart(result, result !== this.opts.base);
    } else if (refresh) {
      this.refresh();
    }
  }

  layout(): void {
    this.views.forEach((v) => v.requestMeasure());
    this.schedulePaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.paintFrame) cancelAnimationFrame(this.paintFrame);
    window.clearTimeout(this.balloonTimer);
    this.resizeObserver.disconnect();
    closePopup();
    hideTooltip();
    this.views.forEach((v) => v.destroy());
    this.root.remove();
    this.changeListeners.clear();
    this.statusListeners.clear();
  }
}

type ThesideInnerOrNull = ThreesideInner | null;

/** Creates a JetBrains-style 3-way merge viewer inside `container` (which should have an explicit height). */
export function createMergeViewer(container: HTMLElement, options: MergeViewerOptions): TextMergeViewer {
  return new TextMergeViewer(container, options);
}
