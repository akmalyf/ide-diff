// WebviewPanel hosting the @ide-diff/viewer bundle (dist/webview.js): init, save-back, dirty title, disk refresh.
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import * as path from 'node:path';
import type { LanguageKey } from './languages';
import { isWebviewMessage, type HostMessage, type InitPayload, type WebviewMessage } from './protocol';
import { detectEol, formatPanelTitle, withEol } from './util';

interface TitleParts {
  fileName: string;
  leftLabel: string;
  rightLabel: string;
}

export interface DiffSource {
  kind: 'diff';
  title: TitleParts;
  original: string;
  modified: string;
  originalTitle: string;
  modifiedTitle: string;
  language: LanguageKey;
  /** real file the modified side is written back to; undefined → modified side read-only */
  target?: vscode.Uri;
  /** real file shown on the original side; refreshed when it changes on disk */
  originalFile?: vscode.Uri;
}

export interface MergeSource {
  kind: 'merge';
  title: TitleParts;
  left: string;
  base: string;
  right: string;
  leftTitle: string;
  baseTitle: string;
  rightTitle: string;
  language: LanguageKey;
  /** the conflicted file the result is written to */
  target: vscode.Uri;
  /** called after a successful save (offers `git add`) */
  afterSave?: (conflicts: number) => Promise<void>;
}

export type PanelSource = DiffSource | MergeSource;

const normalize = (text: string) => text.replace(/\r\n/g, '\n');
const sameUri = (a: vscode.Uri, b: vscode.Uri) => a.toString() === b.toString();

export class IdeDiffPanel implements vscode.Disposable {
  private static readonly open = new Map<string, IdeDiffPanel>();

  /** Opens (or reveals, when the same comparison is already open) a diff/merge panel. */
  static show(context: vscode.ExtensionContext, key: string, source: PanelSource): void {
    const existing = IdeDiffPanel.open.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    IdeDiffPanel.open.set(key, new IdeDiffPanel(context, key, source));
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private dirty = false;
  /** last text known to be on disk / in the document for the editable side ("\n" line endings) */
  private savedText: string;
  /** latest text from the webview (debounced), used to offer saving when the panel is closed while dirty */
  private pendingText: string | undefined;
  private saving = false;
  private disposed = false;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly key: string,
    private source: PanelSource,
  ) {
    const distUri = vscode.Uri.joinPath(context.extensionUri, 'dist');
    this.panel = vscode.window.createWebviewPanel('ideDiff', this.title(), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distUri],
      enableFindWidget: false,
    });
    this.savedText = normalize(source.kind === 'diff' ? source.modified : source.base);
    this.panel.webview.html = this.html(distUri);
    this.panel.webview.onDidReceiveMessage((m: unknown) => this.onMessage(m), undefined, this.disposables);
    this.panel.onDidDispose(() => this.onPanelClosed(), undefined, this.disposables);
    this.watchFiles();
  }

  private title(): string {
    const { fileName, leftLabel, rightLabel } = this.source.title;
    return formatPanelTitle(fileName, leftLabel, rightLabel, this.dirty);
  }

  private setDirty(dirty: boolean): void {
    if (this.dirty === dirty) return;
    this.dirty = dirty;
    this.panel.title = this.title();
  }

  private post(message: HostMessage): void {
    if (!this.disposed) void this.panel.webview.postMessage(message);
  }

  private initPayload(): InitPayload {
    const s = this.source;
    if (s.kind === 'diff') {
      return {
        kind: 'diff',
        original: s.original,
        modified: s.modified,
        originalTitle: s.originalTitle,
        modifiedTitle: s.modifiedTitle,
        language: s.language,
        editable: !!s.target,
      };
    }
    return {
      kind: 'merge',
      left: s.left,
      base: s.base,
      right: s.right,
      leftTitle: s.leftTitle,
      baseTitle: s.baseTitle,
      rightTitle: s.rightTitle,
      language: s.language,
    };
  }

  private onMessage(raw: unknown): void {
    if (!isWebviewMessage(raw)) return;
    const m: WebviewMessage = raw;
    switch (m.type) {
      case 'ready':
        this.post({ type: 'init', payload: this.initPayload() });
        break;
      case 'edit':
        this.pendingText = m.text;
        this.setDirty(m.dirty);
        break;
      case 'save':
        void this.save(m.text, m.conflicts ?? 0);
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Save-back

  private async save(text: string, conflicts: number): Promise<void> {
    const target = this.source.target;
    if (!target) {
      this.post({ type: 'saveFailed', message: 'This side is read-only.' });
      return;
    }
    if (this.saving) return;
    this.saving = true;
    try {
      if (this.source.kind === 'merge' && conflicts > 0) {
        const choice = await vscode.window.showWarningMessage(
          `${conflicts} unresolved conflict${conflicts === 1 ? '' : 's'} left in ${this.source.title.fileName}. Save the result anyway?`,
          { modal: true },
          'Save',
        );
        if (choice !== 'Save') {
          this.post({ type: 'saveFailed', message: 'Cancelled' });
          return;
        }
      }
      await writeBack(target, text);
      this.savedText = normalize(text);
      this.pendingText = undefined;
      this.post({ type: 'saved', text });
      this.setDirty(false);
      if (this.source.kind === 'merge') await this.source.afterSave?.(conflicts);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      void vscode.window.showErrorMessage(`IDE Diff: could not save ${path.basename(target.fsPath)}: ${message}`);
      this.post({ type: 'saveFailed', message });
    } finally {
      this.saving = false;
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // External changes (diff only: the merge result is derived from the index stages, not from the file)

  private watchFiles(): void {
    if (this.source.kind !== 'diff') return;
    const { target, originalFile } = this.source;
    const watched: Array<{ uri: vscode.Uri; side: 'original' | 'modified' }> = [];
    if (target) watched.push({ uri: target, side: 'modified' });
    if (originalFile && !(target && sameUri(originalFile, target))) watched.push({ uri: originalFile, side: 'original' });

    for (const { uri, side } of watched) {
      // edits in another editor / reloads of a clean document from disk
      vscode.workspace.onDidChangeTextDocument(
        (e) => {
          if (sameUri(e.document.uri, uri) && e.contentChanges.length > 0) this.externalChange(side, e.document.getText());
        },
        undefined,
        this.disposables,
      );
      // files that are not open as a TextDocument
      if (uri.scheme === 'file') {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.Uri.file(path.dirname(uri.fsPath)), path.basename(uri.fsPath)),
        );
        const reload = async () => {
          if (vscode.workspace.textDocuments.some((d) => sameUri(d.uri, uri))) return; // handled above
          try {
            this.externalChange(side, await vscode.workspace.decode(await vscode.workspace.fs.readFile(uri), { uri }));
          } catch {
            // deleted or unreadable: keep what is shown
          }
        };
        watcher.onDidChange(reload, undefined, this.disposables);
        watcher.onDidCreate(reload, undefined, this.disposables);
        this.disposables.push(watcher);
      }
    }
  }

  private externalChange(side: 'original' | 'modified', text: string): void {
    if (this.source.kind !== 'diff' || this.saving) return;
    const normalized = normalize(text);
    if (side === 'original') {
      if (normalized === normalize(this.source.original)) return;
      this.source = { ...this.source, original: text };
      this.post({ type: 'externalChange', side, text });
      return;
    }
    if (this.dirty || normalized === this.savedText) return; // never clobber unsaved edits; ignore our own save
    this.savedText = normalized;
    this.source = { ...this.source, modified: text };
    this.post({ type: 'externalChange', side, text });
  }

  // ---------------------------------------------------------------------------------------------------------------

  private async onPanelClosed(): Promise<void> {
    const wasDirty = this.dirty;
    const text = this.pendingText;
    const target = this.source.target;
    this.dispose();
    if (!wasDirty || text === undefined || !target) return;
    const name = this.source.title.fileName;
    const choice = await vscode.window.showWarningMessage(
      `Do you want to save the changes you made to ${name} in the IDE Diff panel?`,
      { modal: true, detail: "Your changes will be lost if you don't save them." },
      'Save',
      "Don't Save",
    );
    if (choice !== 'Save') return;
    try {
      await writeBack(target, text);
    } catch (e) {
      void vscode.window.showErrorMessage(`IDE Diff: could not save ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private html(distUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js'));
    const csp = [
      "default-src 'none'",
      // the viewer and CodeMirror inject <style> elements at runtime
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
</style>
<title>IDE Diff</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    IdeDiffPanel.open.delete(this.key);
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

/**
 * Writes `text` (with "\n" line endings, as CodeMirror produces) to `uri`. If the file is open as a TextDocument
 * (possibly dirty in another editor) the whole document is replaced with a WorkspaceEdit and saved, so undo history and
 * the document's EOL/encoding are kept; otherwise the bytes go through `workspace.fs` with the file's existing EOL.
 */
export async function writeBack(uri: vscode.Uri, text: string): Promise<void> {
  const doc = vscode.workspace.textDocuments.find((d) => sameUri(d.uri, uri));
  if (doc && !doc.isClosed) {
    const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const content = withEol(text, eol);
    if (doc.getText() !== content) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
      if (!(await vscode.workspace.applyEdit(edit))) throw new Error('the edit was rejected');
    }
    if (doc.isDirty && !(await doc.save())) throw new Error('the document could not be saved');
    return;
  }
  let eol: '\r\n' | '\n' = '\n';
  try {
    eol = detectEol(await vscode.workspace.decode(await vscode.workspace.fs.readFile(uri), { uri }));
  } catch {
    // new file
  }
  await vscode.workspace.fs.writeFile(uri, await vscode.workspace.encode(withEol(text, eol), { uri }));
}
