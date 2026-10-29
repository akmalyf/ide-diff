// Unified (one-editor) diff viewer: port of com.intellij.diff.tools.fragmented.UnifiedDiffViewer.
// The editor shows a generated document; edits outside deleted blocks are transferred to the right (master)
// text, which is then re-diffed and the unified document rebuilt with a minimal change.
import { Annotation, ChangeSet, Compartment, EditorState, StateEffect, Text, Transaction, type Extension } from '@codemirror/state';
import { EditorView, highlightWhitespace, keymap, type ViewUpdate } from '@codemirror/view';
import { compareTexts, getDiffType, type LineFragment } from '@ide-diff/core';
import type { DiffViewer, DiffViewerOptions } from '../types';
import { injectStyles } from '../theme/styles';
import { diffDecorations, setSideChanges, type SideChange } from '../common/decorations';
import { alignWaves, computeFoldGroups, setFolds, unchangedFolding, type FoldGroup, type FoldRegion } from '../common/folding';
import { OverlayScrollbar, type StripeMark } from '../common/scrollbar';
import { applyModification, lineStart } from '../common/lines';
import { baseEditorExtensions, readOnlyExtension } from '../common/editorBase';
import {
  pluralDifferences,
  resolveOptions,
  resolveReadOnly,
  settingsEntries,
  type AppearanceOptions,
  type ResolvedOptions,
} from '../common/settings';
import { installModifierListener, styleRoot } from '../common/util';
import { gutterOperations, type GutterOperation } from '../sideBySide/gutterActions';
import type { ViewerHooks } from '../sideBySide/SideBySideViewer';
import { DiffToolbar } from '../toolbar/diffToolbar';
import { closePopup, el, hideTooltip, iconEl } from '../toolbar/ui';
import { buildUnified, lineStarts, unifiedToRight, type UnifiedState } from './builder';
import { setLineMaps, unifiedLineMaps, unifiedLineNumbers } from './lineNumbers';

/** Marks transactions produced by the viewer itself (rebuilds), which must not be transferred back. */
const internal = Annotation.define<boolean>();
const setRevertOps = StateEffect.define<GutterOperation[]>();
const setAcceptOps = StateEffect.define<GutterOperation[]>();

export class UnifiedDiffViewer implements DiffViewer {
  private opts: ResolvedOptions;
  private text1: string;
  private text2: string;
  private state: UnifiedState;
  private unifiedStarts: number[] = [0];
  private rightStarts: number[] = [0];
  private dirty = false;
  private rebuildQueued = false;

  private readonly root: HTMLDivElement;
  private readonly toolbar: DiffToolbar;
  private readonly titles: HTMLDivElement;
  private readonly notice: HTMLDivElement;
  private readonly view: EditorView;
  private readonly scrollbar: OverlayScrollbar;
  private readonly compartments = {
    readOnly: new Compartment(),
    language: new Compartment(),
    whitespace: new Compartment(),
    wrap: new Compartment(),
    lineNumbers: new Compartment(),
    extensions: new Compartment(),
  };

  private foldGroups: FoldGroup[] = [];
  private foldLevels = new Map<number, number>();
  private expandedAnchors: Array<{ pos: number; level: number }> = [];
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
    this.opts =
      'mode' in options && Array.isArray(options.readOnly) ? { ...(options as ResolvedOptions) } : resolveOptions(options as DiffViewerOptions);
    this.text1 = this.opts.original;
    this.text2 = this.opts.modified;
    this.state = this.compute();

    this.root = el('div', `idd-root idd-theme-${this.opts.theme} idd-unified`);
    this.toolbar = new DiffToolbar(this.opts.theme, 'unified', {
      prev: () => this.goToPreviousChange(),
      next: () => this.goToNextChange(),
      toggleCollapse: () => this.toggleCollapse(),
      toggleLock: () => this.setReadOnly([this.opts.readOnly[0], !this.opts.readOnly[1]]),
      isLocked: () => this.opts.readOnly[1],
      switchMode: (mode) => {
        if (mode !== 'unified') this.hooks.switchMode?.(mode);
      },
      settings: () =>
        settingsEntries(this.opts, {
          toggleSyncScroll: null,
          setIgnorePolicy: (ignorePolicy) => this.setOptions({ ignorePolicy }),
          setHighlightPolicy: (highlightPolicy) => this.setOptions({ highlightPolicy }),
          setAppearance: (a) => this.setAppearance(a),
        }),
    });
    this.titles = el('div', 'idd-titles');
    this.notice = el('div', 'idd-notice');
    const body = el('div', 'idd-body');
    const pane = el('div', 'idd-pane idd-pane-right');

    this.view = this.createEditor();
    this.scrollbar = new OverlayScrollbar(this.view, 'right');
    pane.append(this.view.dom, this.scrollbar.dom);
    body.append(pane);
    this.root.append(this.toolbar.dom, this.titles, this.notice, body);
    this.toolbar.setVisible(this.opts.showToolbar);
    this.toolbar.setLocked(this.opts.readOnly[1]);
    container.appendChild(this.root);
    this.renderTitles();

    this.view.scrollDOM.addEventListener('scroll', () => this.schedulePaint());
    this.resizeObserver = new ResizeObserver(() => this.schedulePaint());
    this.resizeObserver.observe(this.root);
    this.apply(true);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Editor

  private createEditor(): EditorView {
    const o = this.opts;
    const extensions: Extension[] = [
      keymap.of([
        { key: 'F7', run: () => (this.goToNextChange(), true) },
        { key: 'Shift-F7', run: () => (this.goToPreviousChange(), true) },
      ]),
      unifiedLineMaps(),
      this.compartments.lineNumbers.of(o.showLineNumbers ? unifiedLineNumbers() : []),
      // UnifiedDiffChangeUi.createAcceptOperation: Revert (left → right) and Accept (right → left)
      gutterOperations({
        side: 'right',
        gutterSide: 'before',
        icons: { apply: 'diffRevert', append: 'diffRevert' },
        effect: setRevertOps,
        theme: () => this.opts.theme,
        themeClass: () => `idd-theme-${this.opts.theme}`,
        applyText: () => 'Revert',
        shortcut: '',
        onApply: (index) => this.applyChange(index, 0),
      }),
      gutterOperations({
        side: 'right',
        gutterSide: 'before',
        icons: { apply: 'actionsChecked', append: 'actionsChecked' },
        effect: setAcceptOps,
        theme: () => this.opts.theme,
        themeClass: () => `idd-theme-${this.opts.theme}`,
        applyText: () => 'Accept',
        shortcut: '',
        onApply: (index) => this.applyChange(index, 1),
      }),
      ...baseEditorExtensions(),
      diffDecorations(),
      unchangedFolding(),
      this.compartments.language.of(o.language ?? []),
      this.compartments.whitespace.of(o.showWhitespaces ? highlightWhitespace() : []),
      this.compartments.wrap.of(o.softWraps ? EditorView.lineWrapping : []),
      this.compartments.readOnly.of(readOnlyExtension(o.readOnly[1])),
      this.compartments.extensions.of(o.extensions),
      EditorState.transactionFilter.of((tr) => this.filterTransaction(tr)),
      EditorView.updateListener.of((u) => this.onUpdate(u)),
    ];
    return new EditorView({ state: EditorState.create({ doc: this.state.text, extensions }) });
  }

  /**
   * Edits are allowed outside deleted (left-only) lines. They are transferred to the right text here, while the
   * line maps still describe the transaction's start document.
   */
  private filterTransaction(tr: Transaction): Transaction | readonly [] {
    if (!tr.docChanged || tr.annotation(internal)) return tr;
    if (this.dirty) return []; // a rebuild is pending; maps are stale
    if (!this.transfer(tr)) return [];
    this.transferred.add(tr);
    return tr;
  }

  private readonly transferred = new WeakSet<Transaction>();

  /** Applies a user transaction on the unified document to the right text. Returns false when not allowed. */
  private transfer(tr: Transaction): boolean {
    const edits: Array<{ from: number; to: number; insert: string }> = [];
    let ok = true;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      if (!ok) return;
      const from = unifiedToRight(this.state, this.unifiedStarts, this.rightStarts, fromA);
      const to = unifiedToRight(this.state, this.unifiedStarts, this.rightStarts, toA);
      if (from == null || to == null || to < from || this.touchesDeleted(fromA, toA)) {
        ok = false;
        return;
      }
      edits.push({ from, to, insert: inserted.toString() });
    });
    if (!ok) return false;
    let text = this.text2;
    for (const e of edits.reverse()) text = text.slice(0, e.from) + e.insert + text.slice(e.to);
    this.text2 = text;
    this.dirty = true;
    return true;
  }

  private touchesDeleted(from: number, to: number): boolean {
    for (const c of this.state.changes) {
      if (c.line1 === c.insertedStart) continue;
      const delFrom = this.unifiedStarts[c.line1]!;
      const delTo = c.insertedStart < this.unifiedStarts.length ? this.unifiedStarts[c.insertedStart]! : Infinity;
      if (from === to ? from >= delFrom && from < delTo : from < delTo && to > delFrom) return true;
      // deleting the line break right before a deleted block would merge it into the previous line
      if (to === delFrom && from < to) return true;
    }
    return false;
  }

  private onUpdate(u: ViewUpdate): void {
    if (u.docChanged) {
      for (const tr of u.transactions) {
        for (const a of this.expandedAnchors) a.pos = tr.changes.mapPos(a.pos, -1);
        // unfiltered transactions (undo/redo use filter: false) are transferred after the fact
        if (tr.docChanged && !tr.annotation(internal) && !this.transferred.has(tr)) this.dirty = this.transfer(tr) || true;
      }
      if (this.dirty && !this.rebuildQueued) {
        this.rebuildQueued = true;
        queueMicrotask(() => {
          this.rebuildQueued = false;
          if (this.disposed) return;
          this.changeListeners.forEach((cb) => cb(this.text2));
          this.apply(true);
        });
      }
    }
    if (u.selectionSet || u.docChanged) this.updateNavigation();
    if (u.geometryChanged || u.heightChanged || u.viewportChanged || u.docChanged) this.schedulePaint();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Diff → unified document

  private compute(): UnifiedState {
    let changes: LineFragment[];
    try {
      changes = compareTexts(this.text1, this.text2, { ignorePolicy: this.opts.ignorePolicy, highlightPolicy: this.opts.highlightPolicy });
    } catch (e) {
      console.error('[ide-diff] diff failed', e);
      changes = [];
    }
    return buildUnified(this.text1, this.text2, changes);
  }

  /** Recomputes the diff (if `recompute`) and syncs the editor document, decorations and folds. */
  private apply(recompute: boolean): void {
    if (recompute) this.state = this.compute();
    const st = this.state;
    const current = this.view.state.doc.toString();
    const next = st.text;
    let start = 0;
    const max = Math.min(current.length, next.length);
    while (start < max && current.charCodeAt(start) === next.charCodeAt(start)) start++;
    let endC = current.length;
    let endN = next.length;
    while (endC > start && endN > start && current.charCodeAt(endC - 1) === next.charCodeAt(endN - 1)) {
      endC--;
      endN--;
    }
    const changes = start === endC && start === endN ? [] : [{ from: start, to: endC, insert: next.slice(start, endN) }];

    this.unifiedStarts = lineStarts(next);
    this.rightStarts = lineStarts(this.text2);
    this.dirty = false;

    const doc = Text.of(next.split('\n'));
    const sideChanges: SideChange[] = [];
    const marks: StripeMark[] = [];
    for (const c of st.changes) {
      const f = c.fragment;
      const ignored = f.innerFragments != null;
      const delStart = lineStart(doc, c.line1);
      const insStart = lineStart(doc, c.insertedStart);
      // DiffDrawUtil.createUnifiedChunkHighlighters: DELETED then INSERTED; inner fragments on both blocks
      if (c.line1 < c.insertedStart) {
        sideChanges.push({
          startLine: c.line1,
          endLine: c.insertedStart,
          type: 'DELETED',
          ignored,
          inner: (f.innerFragments ?? []).map((i) => ({ from: delStart + i.startOffset1, to: delStart + i.endOffset1, type: 'DELETED' as const })),
          separatorTop: false,
        });
        marks.push({ from: delStart, to: lineStart(doc, c.insertedStart - 1), type: 'deleted' });
      }
      if (c.insertedStart < c.line2) {
        sideChanges.push({
          startLine: c.insertedStart,
          endLine: c.line2,
          type: 'INSERTED',
          ignored,
          inner: (f.innerFragments ?? []).map((i) => ({ from: insStart + i.startOffset2, to: insStart + i.endOffset2, type: 'INSERTED' as const })),
          separatorTop: false,
        });
        marks.push({ from: insStart, to: lineStart(doc, c.line2 - 1), type: 'inserted' });
      }
    }

    const ops = (editableTarget: boolean): GutterOperation[] =>
      editableTarget ? st.changes.map((c, i) => ({ changeIndex: i, pos: lineStart(doc, c.line1), canAppend: false })) : [];

    this.view.dispatch({
      changes,
      annotations: [internal.of(true), Transaction.addToHistory.of(false)],
      effects: [
        setSideChanges.of(sideChanges),
        setRevertOps.of(ops(!this.opts.readOnly[1])),
        setAcceptOps.of(ops(!this.opts.readOnly[0])),
        setLineMaps.of({
          map1: st.lineMap1,
          map2: st.lineMap2,
          max1: this.text1.split('\n').length,
          max2: this.text2.split('\n').length,
        }),
      ],
    });
    this.scrollbar.setMarks(marks);
    this.updateFolds(true);
    this.toolbar.setStatus(pluralDifferences(st.changes.length));
    this.updateNotice();
    this.updateNavigation();
    this.diffListeners.forEach((cb) => cb(st.changes.map((c) => c.fragment)));
  }

  private updateNotice(): void {
    const identical = this.text1 === this.text2;
    this.notice.textContent = identical ? 'Contents are identical' : '';
    this.notice.classList.toggle('idd-visible', identical);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Folding

  private updateFolds(recompute: boolean): void {
    const doc = this.view.state.doc;
    if (recompute) {
      const levels = new Map<number, number>();
      this.foldGroups = this.opts.collapseUnchanged
        ? computeFoldGroups(
            this.state.changes.map((c) => [c.line1, c.line2, c.line1, c.line2]),
            [doc.lines, doc.lines],
            this.opts.contextLines,
          )
        : [];
      for (const g of this.foldGroups) {
        const p = lineStart(doc, g.anchor[0]);
        const old = this.expandedAnchors.find((a) => a.pos === p);
        if (old) levels.set(g.id, old.level);
      }
      this.foldLevels = levels;
    }
    this.expandedAnchors = this.foldGroups
      .filter((g) => (this.foldLevels.get(g.id) ?? 0) > 0)
      .map((g) => ({ pos: lineStart(doc, g.anchor[0]), level: this.foldLevels.get(g.id)! }));
    const regions: FoldRegion[] = [];
    for (const g of this.foldGroups) {
      const block = g.blocks[this.foldLevels.get(g.id) ?? 0];
      if (block?.[0]) regions.push(block[0]);
    }
    this.view.dispatch({ effects: setFolds.of({ regions, onExpand: (id) => this.expandFold(id) }) });
    this.toolbar.setCollapsed(this.anyCollapsed());
    this.schedulePaint();
  }

  private anyCollapsed(): boolean {
    return this.opts.collapseUnchanged && this.foldGroups.some((g) => (this.foldLevels.get(g.id) ?? 0) < g.blocks.length);
  }

  private expandFold(groupId: number): void {
    this.foldLevels.set(groupId, (this.foldLevels.get(groupId) ?? 0) + 1);
    this.updateFolds(false);
  }

  private toggleCollapse(): void {
    if (this.anyCollapsed()) {
      for (const g of this.foldGroups) this.foldLevels.set(g.id, g.blocks.length);
      this.updateFolds(false);
    } else {
      this.opts.collapseUnchanged = true;
      this.expandedAnchors = [];
      this.foldLevels.clear();
      this.updateFolds(true);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Apply / navigate

  /** UnifiedDiffViewer.replaceChange: sourceSide 0 = revert right to left content, 1 = accept right into left. */
  private applyChange(index: number, sourceSide: 0 | 1): void {
    const c = this.state.changes[index];
    if (!c) return;
    const f = c.fragment;
    const t1 = Text.of(this.text1.split('\n'));
    const t2 = Text.of(this.text2.split('\n'));
    if (sourceSide === 0) {
      if (this.opts.readOnly[1]) return;
      const spec = applyModification(t2, f.startLine2, f.endLine2, t1, f.startLine1, f.endLine1);
      if (!spec) return;
      this.text2 = ChangeSet.of(spec, t2.length).apply(t2).toString();
      this.changeListeners.forEach((cb) => cb(this.text2));
    } else {
      if (this.opts.readOnly[0]) return;
      const spec = applyModification(t1, f.startLine1, f.endLine1, t2, f.startLine2, f.endLine2);
      if (!spec) return;
      this.text1 = ChangeSet.of(spec, t1.length).apply(t1).toString();
    }
    this.apply(true);
  }

  private caretLine(): number {
    return this.view.state.doc.lineAt(this.view.state.selection.main.head).number - 1;
  }

  private findChange(direction: 1 | -1): number {
    const line = this.caretLine();
    const changes = this.state.changes;
    if (direction === 1) return changes.findIndex((c) => c.line1 > line);
    for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.line2 <= line && changes[i]!.line1 < line) return i;
    return -1;
  }

  private scrollToChange(index: number): void {
    const c = this.state.changes[index];
    if (!c) return;
    const pos = lineStart(this.view.state.doc, c.line1);
    this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    this.view.focus();
  }

  goToNextChange(): void {
    const i = this.findChange(1);
    if (i >= 0) this.scrollToChange(i);
  }

  goToPreviousChange(): void {
    const i = this.findChange(-1);
    if (i >= 0) this.scrollToChange(i);
  }

  private updateNavigation(): void {
    this.toolbar?.setNavigation(this.findChange(-1) >= 0, this.findChange(1) >= 0);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Settings

  private schedulePaint(): void {
    if (this.paintFrame || this.disposed) return;
    this.paintFrame = requestAnimationFrame(() => {
      this.paintFrame = 0;
      this.scrollbar.update();
      alignWaves(this.root);
    });
  }

  private setAppearance(a: Partial<AppearanceOptions>): void {
    Object.assign(this.opts, a);
    this.view.dispatch({
      effects: [
        this.compartments.whitespace.reconfigure(this.opts.showWhitespaces ? highlightWhitespace() : []),
        this.compartments.wrap.reconfigure(this.opts.softWraps ? EditorView.lineWrapping : []),
        this.compartments.lineNumbers.reconfigure(this.opts.showLineNumbers ? unifiedLineNumbers() : []),
      ],
    });
    this.schedulePaint();
  }

  private setReadOnly(readOnly: [boolean, boolean]): void {
    this.opts.readOnly = readOnly;
    this.view.dispatch({ effects: this.compartments.readOnly.reconfigure(readOnlyExtension(readOnly[1])) });
    this.toolbar.setLocked(readOnly[1]);
    this.renderTitles();
    this.apply(false);
  }

  private renderTitles(): void {
    const o = this.opts;
    const has = o.originalTitle != null || o.modifiedTitle != null;
    this.titles.style.display = has ? '' : 'none';
    this.titles.replaceChildren();
    const make = (text: string | undefined, readOnly: boolean) => {
      const t = el('div', 'idd-title');
      if (readOnly) t.appendChild(iconEl('diffDisableEditing', o.theme));
      t.appendChild(el('span', 'idd-title-text', text ?? ''));
      return t;
    };
    this.titles.append(make(o.originalTitle, o.readOnly[0]), make(o.modifiedTitle, o.readOnly[1]));
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public API

  getOriginal(): string {
    return this.text1;
  }

  getModified(): string {
    return this.text2;
  }

  setOriginal(text: string): void {
    this.text1 = text;
    this.apply(true);
  }

  setModified(text: string): void {
    this.text2 = text;
    this.apply(true);
  }

  setOptions(o: Partial<DiffViewerOptions>): void {
    let recompute = false;
    if (o.original !== undefined) {
      this.text1 = o.original;
      recompute = true;
    }
    if (o.modified !== undefined) {
      this.text2 = o.modified;
      recompute = true;
    }
    if (o.theme && o.theme !== this.opts.theme) {
      this.root.classList.replace(`idd-theme-${this.opts.theme}`, `idd-theme-${o.theme}`);
      this.opts.theme = o.theme;
      this.toolbar.setTheme(o.theme);
      this.renderTitles();
      closePopup();
      this.apply(false);
    }
    if ('language' in o) {
      this.opts.language = o.language;
      this.view.dispatch({ effects: this.compartments.language.reconfigure(o.language ?? []) });
    }
    if (o.extensions) {
      this.opts.extensions = o.extensions;
      this.view.dispatch({ effects: this.compartments.extensions.reconfigure(o.extensions) });
    }
    if (o.originalTitle !== undefined) this.opts.originalTitle = o.originalTitle;
    if (o.modifiedTitle !== undefined) this.opts.modifiedTitle = o.modifiedTitle;
    if (o.originalTitle !== undefined || o.modifiedTitle !== undefined) this.renderTitles();
    if (o.ignorePolicy && o.ignorePolicy !== this.opts.ignorePolicy) {
      this.opts.ignorePolicy = o.ignorePolicy;
      recompute = true;
    }
    if (o.highlightPolicy && o.highlightPolicy !== this.opts.highlightPolicy) {
      this.opts.highlightPolicy = o.highlightPolicy;
      recompute = true;
    }
    if (o.readOnly !== undefined) this.setReadOnly(resolveReadOnly(o.readOnly));
    if (o.contextLines !== undefined && o.contextLines !== this.opts.contextLines) {
      this.opts.contextLines = o.contextLines;
      recompute = true;
    }
    if (o.collapseUnchanged !== undefined && o.collapseUnchanged !== this.opts.collapseUnchanged) {
      this.opts.collapseUnchanged = o.collapseUnchanged;
      this.expandedAnchors = [];
      this.foldLevels.clear();
      recompute = true;
    }
    if (o.syncScroll !== undefined) this.opts.syncScroll = o.syncScroll;
    if (o.showToolbar !== undefined) {
      this.opts.showToolbar = o.showToolbar;
      this.toolbar.setVisible(o.showToolbar);
    }
    if (recompute) this.apply(true);
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
    return this.state.changes.map((c) => c.fragment);
  }

  getEditor(): EditorView {
    return this.view;
  }

  exportOptions(): ResolvedOptions {
    return { ...this.opts, original: this.text1, modified: this.text2, mode: 'unified' };
  }

  layout(): void {
    this.view.requestMeasure();
    this.schedulePaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.paintFrame) cancelAnimationFrame(this.paintFrame);
    this.resizeObserver.disconnect();
    closePopup();
    hideTooltip();
    this.view.destroy();
    this.root.remove();
    this.changeListeners.clear();
    this.diffListeners.clear();
  }
}
