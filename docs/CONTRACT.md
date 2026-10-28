# Package contracts (source of truth for all implementers)

Monorepo: pnpm workspaces. TypeScript 7 (`tsc` for typecheck/.d.ts), Vite 8 (lib build), Vitest 5.
Always use latest stable dependency versions. All packages ESM-only. License Apache-2.0 (code ported from
JetBrains/intellij-community, Apache-2.0 — keep a NOTICE file crediting it).

## @ide-diff/core (`packages/core`) — no DOM, no deps

Types in `packages/core/src/types.ts` (DO NOT change shape without updating this file).
`packages/core/src/index.ts` must export all types plus:

```ts
compareLines(text1, text2, policy?: ComparisonPolicy): LineFragment[]          // innerFragments = null
compareLinesInner(text1, text2, policy?: ComparisonPolicy): LineFragment[]     // by-word inner fragments
compareWords(text1, text2, policy?): DiffFragment[]
compareChars(text1, text2, policy?): DiffFragment[]
compareTexts(text1, text2, opts?: CompareOptions): LineFragment[]  // what viewers call; maps Ignore/HighlightPolicy like IntelliJ's TextDiffProviderBase
mergeLines(left, base, right, policy?): MergeLineFragmentWithType[] // 3-way, ComparisonMergeUtil + MergeRangeUtil semantics
getDiffType(f: LineFragment): TextDiffType                          // INSERTED/DELETED/MODIFIED like DiffUtil.getLineDiffType
lineOffsets(text): number[]                                         // helper: start offset of each line
```

## @ide-diff/viewer (`packages/viewer`) — CodeMirror 6

Peer-ish deps: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`,
`@lezer/highlight` (regular dependencies). Language support is passed in by the user as a CM `Extension`
(optional `language` option) — do not bundle every grammar.

```ts
export interface DiffViewerOptions {
  original: string; modified: string;
  language?: Extension;                    // e.g. php() from @codemirror/lang-php
  originalTitle?: string; modifiedTitle?: string;   // header above each pane (file name / revision)
  mode?: 'side-by-side' | 'unified';       // default side-by-side
  theme?: 'dark' | 'light';                // IntelliJ New UI Dark (Islands) / Light; default 'dark'
  ignorePolicy?: IgnorePolicy; highlightPolicy?: HighlightPolicy;
  readOnly?: boolean | { original?: boolean; modified?: boolean };  // default: original read-only, modified editable
  collapseUnchanged?: boolean; contextLines?: number;               // default true, 4 (IntelliJ default)
  syncScroll?: boolean;                    // default true
  showToolbar?: boolean;                   // default true
  extensions?: Extension[];                // extra CM extensions for both editors
}
export interface DiffViewer {
  getOriginal(): string; getModified(): string;
  setOriginal(t: string): void; setModified(t: string): void;
  setOptions(o: Partial<DiffViewerOptions>): void;
  onDidChange(cb: (modified: string) => void): () => void;
  onDidUpdateDiff(cb: (changes: LineFragment[]) => void): () => void;
  getChanges(): LineFragment[];
  goToNextChange(): void; goToPreviousChange(): void;
  layout(): void; dispose(): void;
}
export function createDiffViewer(container: HTMLElement, options: DiffViewerOptions): DiffViewer;

export interface MergeViewerOptions { left: string; base: string; right: string; language?: Extension;
  leftTitle?: string; baseTitle?: string; rightTitle?: string; theme?: 'dark'|'light';
  ignorePolicy?: IgnorePolicy; highlightPolicy?: HighlightPolicy; extensions?: Extension[]; }
export interface MergeViewer { getResult(): string; onDidChange(cb:(result:string)=>void): () => void;
  applyNonConflicting(side?: 'left'|'right'|'all'): void; goToNextConflict(): void; goToPreviousConflict(): void;
  setOptions(o: Partial<MergeViewerOptions>): void; dispose(): void; }
export function createMergeViewer(container: HTMLElement, options: MergeViewerOptions): MergeViewer;
```

CSS is injected by the package itself (CM `EditorView.theme` + one injected `<style>` for chrome), so consumers
need no CSS import. All DOM classes prefixed `idd-`. Theme via CSS custom properties `--idd-*` on the root element.

File layout in `packages/viewer/src/` (owner in parentheses — do not edit others' files except `index.ts` exports):
- `theme/` colors, CM themes, injected chrome CSS (side-by-side agent)
- `icons/` SVG strings from intellij-community platform icons (research agent copies, side-by-side agent uses)
- `common/` shared helpers: diff state field, decorations for changes, gutter markers, folding of unchanged (side-by-side agent)
- `toolbar/` toolbar + dropdowns (side-by-side agent)
- `sideBySide/` SimpleDiffViewer port incl. divider canvas/SVG with bezier connectors + apply/revert buttons, sync scroll (side-by-side agent)
- `unified/` UnifiedDiffViewer port (unified agent)
- `merge/` TextMergeViewer port (merge agent)
- `index.ts` public API

## @ide-diff/react (`packages/react`) — `<DiffEditor/>`, `<MergeEditor/>` thin wrappers (react peerDependency).

## ide-diff-vscode (`packages/vscode`) — VS Code extension
Commands: "IDE Diff: Compare with Clipboard", "IDE Diff: Compare Selected Files" (explorer context, 2 files),
"IDE Diff: Compare with HEAD" (SCM resource context, uses git extension API), "IDE Diff: Compare Active File With…".
Opens a WebviewPanel bundling @ide-diff/viewer; edits on the modified side are written back to the file on save
(Ctrl/Cmd+S in webview → postMessage). Theme follows VS Code (body.vscode-dark/light). Build with Vite (webview)
+ esbuild-free `tsc` or Vite for the extension host (CJS output, `vscode` external). Package with `@vscode/vsce`.

## playground (`playground/`) — Vite app demonstrating all modes with PHP/JS samples and a control panel.
