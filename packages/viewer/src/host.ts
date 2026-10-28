// Public DiffViewer handle that owns the active implementation and swaps it when the user switches between the
// side-by-side and unified viewers (DiffRequestProcessor.switchToDiffTool), keeping texts, settings and listeners.
import type { LineFragment } from '@ide-diff/core';
import type { DiffViewer, DiffViewerOptions } from './types';
import { resolveOptions, type ResolvedOptions } from './common/settings';
import { SideBySideDiffViewer } from './sideBySide/SideBySideViewer';
import { UnifiedDiffViewer } from './unified/UnifiedViewer';
import type { DiffMode } from './toolbar/diffToolbar';

type Impl = SideBySideDiffViewer | UnifiedDiffViewer;

export class DiffViewerHost implements DiffViewer {
  private impl: Impl;
  private readonly changeListeners = new Set<(modified: string) => void>();
  private readonly diffListeners = new Set<(changes: LineFragment[]) => void>();
  private readonly modeListeners = new Set<(mode: DiffMode) => void>();

  constructor(
    private readonly container: HTMLElement,
    options: DiffViewerOptions,
  ) {
    this.impl = this.create(resolveOptions(options));
  }

  private create(opts: ResolvedOptions): Impl {
    const hooks = { switchMode: (mode: DiffMode) => this.setMode(mode) };
    const impl = opts.mode === 'unified' ? new UnifiedDiffViewer(this.container, opts, hooks) : new SideBySideDiffViewer(this.container, opts, hooks);
    impl.onDidChange((text) => this.changeListeners.forEach((cb) => cb(text)));
    impl.onDidUpdateDiff((changes) => this.diffListeners.forEach((cb) => cb(changes)));
    return impl;
  }

  get mode(): DiffMode {
    return this.impl instanceof UnifiedDiffViewer ? 'unified' : 'side-by-side';
  }

  setMode(mode: DiffMode): void {
    if (mode === this.mode) return;
    const opts = { ...this.impl.exportOptions(), mode };
    this.impl.dispose();
    this.impl = this.create(opts);
    this.modeListeners.forEach((cb) => cb(mode));
  }

  /** Fired when the viewer mode changes (toolbar chooser or setOptions({ mode })). */
  onDidChangeMode(cb: (mode: DiffMode) => void): () => void {
    this.modeListeners.add(cb);
    return () => this.modeListeners.delete(cb);
  }

  /** The active implementation (SideBySideDiffViewer or UnifiedDiffViewer), e.g. to reach its CodeMirror views. */
  getImplementation(): Impl {
    return this.impl;
  }

  getOriginal(): string {
    return this.impl.getOriginal();
  }

  getModified(): string {
    return this.impl.getModified();
  }

  setOriginal(text: string): void {
    this.impl.setOriginal(text);
  }

  setModified(text: string): void {
    this.impl.setModified(text);
  }

  setOptions(options: Partial<DiffViewerOptions>): void {
    const { mode, ...rest } = options;
    if (mode && mode !== this.mode) this.setMode(mode);
    this.impl.setOptions(rest);
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
    return this.impl.getChanges();
  }

  goToNextChange(): void {
    this.impl.goToNextChange();
  }

  goToPreviousChange(): void {
    this.impl.goToPreviousChange();
  }

  layout(): void {
    this.impl.layout();
  }

  dispose(): void {
    this.impl.dispose();
    this.changeListeners.clear();
    this.diffListeners.clear();
    this.modeListeners.clear();
  }
}
