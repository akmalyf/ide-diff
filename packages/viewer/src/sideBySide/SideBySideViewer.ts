// Side-by-side text diff viewer: port of com.intellij.diff.tools.simple.SimpleDiffViewer + TwosideTextDiffViewer
// with the DiffRequestProcessor header toolbar, rendered with CodeMirror 6.
import { Compartment, EditorState, type ChangeSpec, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, highlightWhitespace, keymap, type ViewUpdate } from '@codemirror/view';
import { compareTexts, getDiffType, type LineFragment } from '@ide-diff/core';
import type { DiffViewer, DiffViewerOptions } from '../types';
import { injectStyles } from '../theme/styles';
import { diffDecorations, setSideChanges, type SideChange } from '../common/decorations';
import { sideLineNumbers } from '../common/lineNumbers';
import { computeFoldGroups, setFolds, unchangedFolding, type FoldGroup, type FoldRegion } from '../common/folding';
import { OverlayScrollbar } from '../common/scrollbar';
import { applyModification, appendModification, lineStart } from '../common/lines';
import { baseEditorExtensions, readOnlyExtension } from '../common/editorBase';
import {
  IS_MAC,
  pluralDifferences,
  resolveOptions,
  resolveReadOnly,
  settingsEntries,
  type AppearanceOptions,
  type ResolvedOptions,
} from '../common/settings';
import { Divider, type DividerChange, type DividerFold } from './divider';
import { SyncScroll } from './syncScroll';
import { gutterOperations, setGutterOperations } from './gutterActions';
import { DiffToolbar, type DiffMode } from '../toolbar/diffToolbar';
import { closePopup, el, hideTooltip, iconEl } from '../toolbar/ui';
import { innerType, installModifierListener, styleRoot } from '../common/util';

type Side = 0 | 1;

/** Internal hooks used by the viewer host (mode switching). */
export interface ViewerHooks {
  switchMode?: (mode: DiffMode) => void;
}

export class SideBySideDiffViewer implements DiffViewer {
  private opts: ResolvedOptions;
  private readonly root: HTMLDivElement;
  private readonly toolbar: DiffToolbar;
  private readonly titles: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private readonly divider = new Divider();
  private readonly views: [EditorView, EditorView];
  private readonly scrollbars: [OverlayScrollbar, OverlayScrollbar];
  private readonly sync: SyncScroll;
  private readonly compartments = {
    readOnly: [new Compartment(), new Compartment()] as [Compartment, Compartment],
    language: new Compartment(),
    whitespace: new Compartment(),
    wrap: new Compartment(),
    lineNumbers: [new Compartment(), new Compartment()] as [Compartment, Compartment],
    extensions: new Compartment(),
  };

  private changes: LineFragment[] = [];
  private foldGroups: FoldGroup[] = [];
  private foldLevels = new Map<number, number>();
  /** expanded fold groups, as (mapped) gap-start offsets on each side */
  private expandedAnchors: Array<{ pos: [number, number]; level: number }> = [];
  private lastFocused: Side = 1;
  private rediffTimer = 0;
  private paintFrame = 0;
  private disposed = false;
  private readonly changeListeners = new Set<(modified: string) => void>();
  private readonly diffListeners = new Set<(changes: LineFragment[]) => void>();
  private readonly resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    options: DiffViewerOptions | ResolvedOptions,
    private readonly hooks: ViewerHooks = {},
  ) {
    injectStyles(styleRoot(container));
    installModifierListener();
    this.opts = 'mode' in options && Array.isArray(options.readOnly) ? { ...(options as ResolvedOptions) } : resolveOptions(options as DiffViewerOptions);

    this.root = el('div', `idd-root idd-theme-${this.opts.theme}`);
    this.toolbar = new DiffToolbar(this.opts.theme, 'side-by-side', {
      prev: () => this.goToPreviousChange(),
      next: () => this.goToNextChange(),
      toggleCollapse: () => this.toggleCollapse(),
      toggleLock: () => this.toggleLock(),
      isLocked: () => this.opts.readOnly[1],
      switchMode: (mode) => {
        if (mode !== 'side-by-side') this.hooks.switchMode?.(mode);
      },
      settings: () =>
        settingsEntries(this.opts, {
          toggleSyncScroll: () => this.setOptions({ syncScroll: !this.opts.syncScroll }),
          setIgnorePolicy: (ignorePolicy) => this.setOptions({ ignorePolicy }),
          setHighlightPolicy: (highlightPolicy) => this.setOptions({ highlightPolicy }),
          setAppearance: (a) => this.setAppearance(a),
        }),
    });
    this.titles = el('div', 'idd-titles');
    this.notice = el('div', 'idd-notice');
    const body = el('div', 'idd-body');
    const panes = [el('div', 'idd-pane idd-pane-left'), el('div', 'idd-pane idd-pane-right')] as const;

    this.views = [this.createEditor(0), this.createEditor(1)];
    this.scrollbars = [new OverlayScrollbar(this.views[0], 'left'), new OverlayScrollbar(this.views[1], 'right')];
    this.sync = new SyncScroll(this.views);
    this.sync.enabled = this.opts.syncScroll;

    panes[0].append(this.views[0].dom, this.scrollbars[0].dom);
    panes[1].append(this.views[1].dom, this.scrollbars[1].dom);
    body.append(panes[0], this.divider.dom, panes[1]);

    this.root.append(this.toolbar.dom, this.titles, this.notice, body);
    this.toolbar.setVisible(this.opts.showToolbar);
    this.toolbar.setLocked(this.opts.readOnly[1]);
    container.appendChild(this.root);
    this.renderTitles();

    this.views.forEach((view, side) => {
      view.scrollDOM.addEventListener('scroll', () => {
        this.sync.onScroll(side as Side);
        this.schedulePaint();
      });
    });
    this.resizeObserver = new ResizeObserver(() => this.schedulePaint());
    this.resizeObserver.observe(this.root);

    this.rediff();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Editors

  private createEditor(side: Side): EditorView {
    const o = this.opts;
    const mod = IS_MAC ? 'Ctrl-Cmd' : 'Ctrl-Alt';
    const diffKeymap = keymap.of([
      { key: 'F7', run: () => (this.goToNextChange(), true) },
      { key: 'Shift-F7', run: () => (this.goToPreviousChange(), true) },
      { key: IS_MAC ? `${mod}-ArrowRight` : 'Ctrl-Alt-r', run: () => this.applySelectedChanges(0) },
      { key: IS_MAC ? `${mod}-ArrowLeft` : 'Ctrl-Alt-a', run: () => this.applySelectedChanges(1) },
    ]);
    const extensions: Extension[] = [
      diffKeymap,
      this.compartments.lineNumbers[side].of(o.showLineNumbers ? sideLineNumbers(side === 0 ? 'after' : 'before') : []),
      gutterOperations({
        side: side === 0 ? 'left' : 'right',
        theme: () => this.opts.theme,
        themeClass: () => `idd-theme-${this.opts.theme}`,
        applyText: () => 'Accept',
        shortcut: side === 0 ? (IS_MAC ? '⌃⌘→' : 'Ctrl+Alt+R') : IS_MAC ? '⌃⌘←' : 'Ctrl+Alt+A',
        onApply: (index, append) => this.applyChange(index, side, append),
      }),
      ...baseEditorExtensions(),
      diffDecorations(),
      unchangedFolding(),
      this.compartments.language.of(o.language ?? []),
      this.compartments.whitespace.of(o.showWhitespaces ? highlightWhitespace() : []),
      this.compartments.wrap.of(o.softWraps ? EditorView.lineWrapping : []),
      this.compartments.readOnly[side].of(readOnlyExtension(o.readOnly[side])),
      this.compartments.extensions.of(o.extensions),
      EditorView.updateListener.of((u) => this.onEditorUpdate(side, u)),
      EditorView.domEventHandlers({
        focus: () => {
          this.lastFocused = side;
        },
      }),
    ];
    return new EditorView({
      state: EditorState.create({ doc: side === 0 ? o.original : o.modified, extensions }),
    });
  }

  private onEditorUpdate(side: Side, u: ViewUpdate): void {
    if (u.docChanged) {
      for (const tr of u.transactions) this.mapAnchors(side, tr);
      if (side === 1) {
        const text = u.state.doc.toString();
        this.changeListeners.forEach((cb) => cb(text));
      }
      this.scheduleRediff();
    }
    if (u.selectionSet || u.docChanged) this.updateNavigationButtons();
    if (u.geometryChanged || u.heightChanged || u.viewportChanged || u.docChanged) this.schedulePaint();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Diff computation

  private scheduleRediff(): void {
    window.clearTimeout(this.rediffTimer);
    this.rediffTimer = window.setTimeout(() => this.rediff(), 30);
  }

  private rediff(): void {
    if (this.disposed) return;
    window.clearTimeout(this.rediffTimer);
    const [v1, v2] = this.views;
    const text1 = v1.state.doc.toString();
    const text2 = v2.state.doc.toString();
    let changes: LineFragment[];
    try {
      changes = compareTexts(text1, text2, { ignorePolicy: this.opts.ignorePolicy, highlightPolicy: this.opts.highlightPolicy });
    } catch (e) {
      console.error('[ide-diff] diff failed', e);
      changes = [];
    }
    this.changes = changes;

    const sides: [SideChange[], SideChange[]] = [[], []];
    changes.forEach((f, i) => {
      const type = getDiffType(f);
      const prev = i > 0 ? changes[i - 1] : undefined;
      for (const side of [0, 1] as const) {
        const start = side === 0 ? f.startLine1 : f.startLine2;
        const end = side === 0 ? f.endLine1 : f.endLine2;
        const base = side === 0 ? f.startOffset1 : f.startOffset2;
        const prevStart = prev ? (side === 0 ? prev.startLine1 : prev.startLine2) : 0;
        const prevEnd = prev ? (side === 0 ? prev.endLine1 : prev.endLine2) : -1;
        sides[side].push({
          startLine: start,
          endLine: end,
          type,
          ignored: f.innerFragments != null,
          inner: (f.innerFragments ?? []).map((inner) => ({
            from: base + (side === 0 ? inner.startOffset1 : inner.startOffset2),
            to: base + (side === 0 ? inner.endOffset1 : inner.endOffset2),
            type: innerType(inner),
          })),
          separatorTop: !!prev && start !== end && prevStart !== prevEnd && prevEnd === start,
        });
      }
    });

    this.views.forEach((view, side) => {
      const other = (1 - side) as Side;
      const ops = this.opts.readOnly[other]
        ? []
        : changes.map((f, i) => ({
            changeIndex: i,
            pos: side === 0 ? f.startOffset1 : f.startOffset2,
            canAppend: getDiffType(f) === 'MODIFIED',
          }));
      view.dispatch({ effects: [setSideChanges.of(sides[side as Side]), setGutterOperations.of(ops)] });
      this.scrollbars[side as Side].setMarks(
        sides[side as Side].map((c) => ({
          from: lineStart(view.state.doc, c.startLine),
          to: c.startLine === c.endLine ? lineStart(view.state.doc, c.startLine) : lineStart(view.state.doc, c.endLine - 1),
          type: c.type.toLowerCase(),
        })),
      );
    });

    this.sync.setChanges(this.dividerChanges());
    this.updateFolds(true);
    this.updateCollapseButton();
    this.updateStatus(text1 === text2);
    this.updateNavigationButtons();
    this.schedulePaint();
    this.diffListeners.forEach((cb) => cb(changes));
  }

  private dividerChanges(): DividerChange[] {
    return this.changes.map((f) => ({
      startLine1: f.startLine1,
      endLine1: f.endLine1,
      startLine2: f.startLine2,
      endLine2: f.endLine2,
      type: getDiffType(f),
    }));
  }

  private updateStatus(identical: boolean): void {
    this.toolbar.setStatus(pluralDifferences(this.changes.length));
    this.notice.textContent = '';
    if (identical) {
      this.notice.append('Contents are identical');
      this.notice.classList.add('idd-visible');
    } else {
      this.notice.classList.remove('idd-visible');
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Folding (collapse unchanged fragments)

  private mapAnchors(side: Side, tr: Transaction): void {
    for (const anchor of this.expandedAnchors) anchor.pos[side] = tr.changes.mapPos(anchor.pos[side], -1);
  }

  private updateFolds(recompute: boolean): void {
    const [v1, v2] = this.views;
    if (recompute) {
      const levels = new Map<number, number>();
      this.foldGroups = this.opts.collapseUnchanged
        ? computeFoldGroups(
            this.changes.map((f) => [f.startLine1, f.endLine1, f.startLine2, f.endLine2]),
            [v1.state.doc.lines, v2.state.doc.lines],
            this.opts.contextLines,
          )
        : [];
      for (const g of this.foldGroups) {
        const p1 = lineStart(v1.state.doc, g.anchor[0]);
        const p2 = lineStart(v2.state.doc, g.anchor[1]);
        const old = this.expandedAnchors.find((a) => a.pos[0] === p1 || a.pos[1] === p2);
        if (old) levels.set(g.id, old.level);
      }
      this.foldLevels = levels;
    }
    this.expandedAnchors = this.foldGroups
      .filter((g) => (this.foldLevels.get(g.id) ?? 0) > 0)
      .map((g) => ({
        pos: [lineStart(v1.state.doc, g.anchor[0]), lineStart(v2.state.doc, g.anchor[1])],
        level: this.foldLevels.get(g.id)!,
      }));

    const regions: [FoldRegion[], FoldRegion[]] = [[], []];
    for (const g of this.foldGroups) {
      const block = g.blocks[this.foldLevels.get(g.id) ?? 0];
      if (!block) continue;
      if (block[0]) regions[0].push(block[0]);
      if (block[1]) regions[1].push(block[1]);
    }
    const onExpand = (groupId: number) => this.expandFold(groupId);
    v1.dispatch({ effects: setFolds.of({ regions: regions[0], onExpand }) });
    v2.dispatch({ effects: setFolds.of({ regions: regions[1], onExpand }) });
    this.schedulePaint();
  }

  private expandFold(groupId: number): void {
    this.foldLevels.set(groupId, (this.foldLevels.get(groupId) ?? 0) + 1);
    this.updateFolds(false);
    this.updateCollapseButton();
  }

  private dividerFolds(): DividerFold[] {
    const [v1, v2] = this.views;
    const folds: DividerFold[] = [];
    for (const g of this.foldGroups) {
      const block = g.blocks[this.foldLevels.get(g.id) ?? 0];
      if (!block || !block[0] || !block[1]) continue;
      const b1 = v1.lineBlockAt(lineStart(v1.state.doc, block[0].startLine));
      const b2 = v2.lineBlockAt(lineStart(v2.state.doc, block[1].startLine));
      folds.push({ pos1: b1.top + b1.height / 2, pos2: b2.top + b2.height / 2 });
    }
    return folds;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Painting (divider + scrollbars)

  private schedulePaint(): void {
    if (this.paintFrame || this.disposed) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const [v1, v2] = this.views;
    this.divider.paint(v1, v2, this.dividerChanges(), this.dividerFolds());
    this.scrollbars[0].update();
    this.scrollbars[1].update();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Apply / navigate

  /** SimpleDiffViewer.replaceChange / appendChange: copy change from `sourceSide` into the other side. */
  private applyChange(index: number, sourceSide: Side, append: boolean): void {
    const f = this.changes[index];
    if (!f) return;
    const target = (1 - sourceSide) as Side;
    if (this.opts.readOnly[target]) return;
    const src = this.views[sourceSide].state.doc;
    const dst = this.views[target].state.doc;
    const [sS, eS] = sourceSide === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2];
    const [sT, eT] = target === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2];
    const spec: ChangeSpec | null = append ? appendModification(dst, eT, src, sS, eS) : applyModification(dst, sT, eT, src, sS, eS);
    if (!spec) return;
    this.views[target].dispatch({ changes: spec, userEvent: 'input.diff' });
    this.rediff();
  }

  /** ApplySelectedChangesAction: apply every change touching the selection of the focused editor. */
  private applySelectedChanges(sourceSide: Side): boolean {
    const target = (1 - sourceSide) as Side;
    if (this.opts.readOnly[target]) return false;
    const focused = this.lastFocused;
    const view = this.views[focused];
    const lines = view.state.selection.ranges.map((r) => [
      view.state.doc.lineAt(r.from).number - 1,
      view.state.doc.lineAt(r.to).number - 1,
    ]);
    const selected = this.changes
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => {
        const [s, e] = focused === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2];
        return lines.some(([a, b]) => (s === e ? a! <= s && s <= b! + 1 : a! < e && b! >= s));
      });
    if (!selected.length) return false;
    // apply bottom-up so earlier line numbers stay valid
    for (const { i } of selected.reverse()) {
      const f = this.changes[i]!;
      const src = this.views[sourceSide].state.doc;
      const dst = this.views[target].state.doc;
      const [sS, eS] = sourceSide === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2];
      const [sT, eT] = target === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2];
      const spec = applyModification(dst, sT, eT, src, sS, eS);
      if (spec) this.views[target].dispatch({ changes: spec, userEvent: 'input.diff' });
    }
    this.rediff();
    return true;
  }

  private caretLine(side: Side): number {
    const view = this.views[side];
    return view.state.doc.lineAt(view.state.selection.main.head).number - 1;
  }

  private findChange(direction: 1 | -1): number {
    const side = this.lastFocused;
    const line = this.caretLine(side);
    const starts = this.changes.map((f) => (side === 0 ? [f.startLine1, f.endLine1] : [f.startLine2, f.endLine2]) as [number, number]);
    if (direction === 1) return starts.findIndex(([s]) => s > line);
    for (let i = starts.length - 1; i >= 0; i--) {
      const [s, e] = starts[i]!;
      if (s < line && e <= line) return i;
    }
    return -1;
  }

  private scrollToChange(index: number): void {
    const f = this.changes[index];
    if (!f) return;
    const side = this.lastFocused;
    const view = this.views[side];
    const line = side === 0 ? f.startLine1 : f.startLine2;
    const pos = lineStart(view.state.doc, line);
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    view.focus();
    requestAnimationFrame(() => this.sync.sync(side));
  }

  goToNextChange(): void {
    const i = this.findChange(1);
    if (i >= 0) this.scrollToChange(i);
  }

  goToPreviousChange(): void {
    const i = this.findChange(-1);
    if (i >= 0) this.scrollToChange(i);
  }

  private updateNavigationButtons(): void {
    this.toolbar?.setNavigation(this.findChange(-1) >= 0, this.findChange(1) >= 0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Toolbar

  private updateCollapseButton(): void {
    const anyCollapsed = this.opts.collapseUnchanged && this.foldGroups.some((g) => (this.foldLevels.get(g.id) ?? 0) < g.blocks.length);
    this.toolbar.setCollapsed(this.opts.collapseUnchanged && anyCollapsed);
  }

  private updateLockButton(): void {
    this.toolbar.setLocked(this.opts.readOnly[1]);
  }

  /** ToggleExpandByDefaultAction */
  private toggleCollapse(): void {
    const anyCollapsed = this.opts.collapseUnchanged && this.foldGroups.some((g) => (this.foldLevels.get(g.id) ?? 0) < g.blocks.length);
    if (anyCollapsed) {
      for (const g of this.foldGroups) this.foldLevels.set(g.id, g.blocks.length);
      this.updateFolds(false);
    } else {
      this.opts.collapseUnchanged = true;
      this.expandedAnchors = [];
      this.foldLevels.clear();
      this.updateFolds(true);
    }
    this.updateCollapseButton();
  }

  /** EditorReadOnlyLockAction (for the modified side) */
  private toggleLock(): void {
    this.setReadOnly([this.opts.readOnly[0], !this.opts.readOnly[1]]);
  }

  private setReadOnly(readOnly: [boolean, boolean]): void {
    this.opts.readOnly = readOnly;
    this.views.forEach((view, side) =>
      view.dispatch({ effects: this.compartments.readOnly[side as Side].reconfigure(readOnlyExtension(readOnly[side as Side])) }),
    );
    this.updateLockButton();
    this.renderTitles();
    this.rediff();
  }

  private setAppearance(a: Partial<AppearanceOptions>): void {
    Object.assign(this.opts, a);
    this.views.forEach((view, side) =>
      view.dispatch({
        effects: [
          this.compartments.whitespace.reconfigure(this.opts.showWhitespaces ? highlightWhitespace() : []),
          this.compartments.wrap.reconfigure(this.opts.softWraps ? EditorView.lineWrapping : []),
          this.compartments.lineNumbers[side as Side].reconfigure(
            this.opts.showLineNumbers ? sideLineNumbers(side === 0 ? 'after' : 'before') : [],
          ),
        ],
      }),
    );
    this.schedulePaint();
  }

  private renderTitles(): void {
    const o = this.opts;
    const has = o.originalTitle != null || o.modifiedTitle != null;
    this.titles.style.display = has ? '' : 'none';
    this.titles.replaceChildren();
    const make = (text: string | undefined, readOnly: boolean) => {
      const t = el('div', 'idd-title');
      if (readOnly) {
        const lock = iconEl('diffDisableEditing', o.theme);
        lock.title = 'Read-only';
        t.appendChild(lock);
      }
      t.appendChild(el('span', 'idd-title-text', text ?? ''));
      return t;
    };
    this.titles.append(make(o.originalTitle, o.readOnly[0]), el('div', 'idd-title-gap'), make(o.modifiedTitle, o.readOnly[1]));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public API

  getOriginal(): string {
    return this.views[0].state.doc.toString();
  }

  getModified(): string {
    return this.views[1].state.doc.toString();
  }

  setOriginal(text: string): void {
    this.replaceDoc(0, text);
  }

  setModified(text: string): void {
    this.replaceDoc(1, text);
  }

  private replaceDoc(side: Side, text: string): void {
    const view = this.views[side];
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    this.rediff();
  }

  setOptions(o: Partial<DiffViewerOptions>): void {
    let rediff = false;
    if (o.original !== undefined) this.replaceDoc(0, o.original);
    if (o.modified !== undefined) this.replaceDoc(1, o.modified);
    if (o.theme && o.theme !== this.opts.theme) {
      this.root.classList.replace(`idd-theme-${this.opts.theme}`, `idd-theme-${o.theme}`);
      this.opts.theme = o.theme;
      this.toolbar.setTheme(o.theme);
      this.renderTitles();
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
    if (o.originalTitle !== undefined || o.modifiedTitle !== undefined) {
      if (o.originalTitle !== undefined) this.opts.originalTitle = o.originalTitle;
      if (o.modifiedTitle !== undefined) this.opts.modifiedTitle = o.modifiedTitle;
      this.renderTitles();
    }
    if (o.ignorePolicy && o.ignorePolicy !== this.opts.ignorePolicy) {
      this.opts.ignorePolicy = o.ignorePolicy;
      rediff = true;
    }
    if (o.highlightPolicy && o.highlightPolicy !== this.opts.highlightPolicy) {
      this.opts.highlightPolicy = o.highlightPolicy;
      rediff = true;
    }
    if (o.readOnly !== undefined) {
      this.setReadOnly(resolveReadOnly(o.readOnly));
    }
    if (o.contextLines !== undefined && o.contextLines !== this.opts.contextLines) {
      this.opts.contextLines = o.contextLines;
      rediff = true;
    }
    if (o.collapseUnchanged !== undefined && o.collapseUnchanged !== this.opts.collapseUnchanged) {
      this.opts.collapseUnchanged = o.collapseUnchanged;
      this.expandedAnchors = [];
      this.foldLevels.clear();
      rediff = true;
    }
    if (o.syncScroll !== undefined) {
      this.opts.syncScroll = o.syncScroll;
      this.sync.enabled = o.syncScroll;
      if (o.syncScroll) this.sync.sync(this.lastFocused);
    }
    if (o.showToolbar !== undefined) {
      this.opts.showToolbar = o.showToolbar;
      this.toolbar.setVisible(o.showToolbar);
    }
    if (rediff) this.rediff();
    this.updateCollapseButton();
  }

  onDidChange(cb: (modified: string) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  onDidUpdateDiff(cb: (changes: LineFragment[]) => void): () => void {
    this.diffListeners.add(cb);
    return () => this.diffListeners.delete(cb);
  }

  getChanges(): LineFragment[] {
    return this.changes;
  }

  /** The two CodeMirror views (left = original, right = modified) for advanced integrations. */
  getEditors(): [EditorView, EditorView] {
    return this.views;
  }

  /** Current options and texts, used to hand the state over when switching viewer mode. */
  exportOptions(): ResolvedOptions {
    return { ...this.opts, original: this.getOriginal(), modified: this.getModified(), mode: 'side-by-side' };
  }

  layout(): void {
    this.views.forEach((v) => v.requestMeasure());
    this.schedulePaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.rediffTimer);
    if (this.paintFrame) cancelAnimationFrame(this.paintFrame);
    this.resizeObserver.disconnect();
    closePopup();
    hideTooltip();
    this.views.forEach((v) => v.destroy());
    this.root.remove();
    this.changeListeners.clear();
    this.diffListeners.clear();
  }
}
