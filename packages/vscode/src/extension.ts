// Extension entry: registers the IDE Diff commands and opens IdeDiffPanel for each comparison.
import * as vscode from 'vscode';
import * as path from 'node:path';
import { locateInRepo, showHead, showStage, stageFile } from './git';
import { resolveLanguageKey } from './languages';
import { IdeDiffPanel } from './panel';
import { formatPaneTitle, hasConflictMarkers } from './util';

interface FileText {
  text: string;
  languageId?: string;
}

/** Text of a file: the open (possibly dirty) TextDocument when there is one, otherwise the decoded bytes on disk. */
async function readFile(uri: vscode.Uri): Promise<FileText> {
  const doc = await vscode.workspace.openTextDocument(uri);
  return { text: doc.getText(), languageId: doc.languageId };
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function isWritableFile(uri: vscode.Uri): boolean {
  return uri.scheme !== 'untitled' && vscode.workspace.fs.isWritableFileSystem(uri.scheme) === true;
}

/** Command argument → Uri: a Uri (explorer / editor title), an SCM resource state, or the active editor. */
function uriFromArg(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) return arg;
  const resourceUri = (arg as { resourceUri?: unknown } | undefined)?.resourceUri;
  if (resourceUri instanceof vscode.Uri) return resourceUri;
  return vscode.window.activeTextEditor?.document.uri;
}

const nameOf = (uri: vscode.Uri) => path.posix.basename(uri.path);

async function pickFile(title: string, canSelectMany = false): Promise<vscode.Uri[] | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title,
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany,
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    openLabel: 'Compare',
  });
  return picked && picked.length > 0 ? picked : undefined;
}

function report(e: unknown): void {
  void vscode.window.showErrorMessage(`IDE Diff: ${e instanceof Error ? e.message : String(e)}`);
}

export function activate(context: vscode.ExtensionContext): void {
  const register = (id: string, run: (...args: unknown[]) => Promise<void>) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: unknown[]) => {
        try {
          await run(...args);
        } catch (e) {
          report(e);
        }
      }),
    );

  /** Two files side by side; the right one is written back on save. */
  const compareFiles = async (left: vscode.Uri, right: vscode.Uri) => {
    const [l, r] = await Promise.all([readFile(left), readFile(right)]);
    const leftName = nameOf(left);
    const rightName = nameOf(right);
    const leftLabel = leftName === rightName ? path.basename(path.dirname(left.fsPath)) + '/' + leftName : leftName;
    const rightLabel = leftName === rightName ? path.basename(path.dirname(right.fsPath)) + '/' + rightName : rightName;
    IdeDiffPanel.show(context, `files:${left.toString()}|${right.toString()}`, {
      kind: 'diff',
      title: { fileName: rightName, leftLabel, rightLabel },
      original: l.text,
      modified: r.text,
      originalTitle: vscode.workspace.asRelativePath(left),
      modifiedTitle: vscode.workspace.asRelativePath(right),
      language: resolveLanguageKey(r.languageId ?? l.languageId, rightName),
      target: isWritableFile(right) ? right : undefined,
      originalFile: left,
    });
  };

  register('ideDiff.compareWithClipboard', async (arg) => {
    const editor = vscode.window.activeTextEditor;
    const argUri = arg instanceof vscode.Uri ? arg : undefined;
    const doc = editor && (!argUri || editor.document.uri.toString() === argUri.toString()) ? editor.document : argUri ? await vscode.workspace.openTextDocument(argUri) : undefined;
    if (!doc) throw new Error('Open an editor to compare with the clipboard.');
    const selection = editor?.document === doc && !editor.selection.isEmpty ? editor.selection : undefined;
    const clipboard = await vscode.env.clipboard.readText();
    const fileName = nameOf(doc.uri);
    const rightLabel = selection ? 'Selection' : 'Editor';
    // a selection is shown read-only (writing a range back would race with edits in the editor)
    const target = !selection && isWritableFile(doc.uri) ? doc.uri : undefined;
    IdeDiffPanel.show(context, `clipboard:${doc.uri.toString()}:${Date.now()}`, {
      kind: 'diff',
      title: { fileName, leftLabel: 'Clipboard', rightLabel },
      original: clipboard,
      modified: selection ? doc.getText(selection) : doc.getText(),
      originalTitle: 'Clipboard',
      modifiedTitle: formatPaneTitle(fileName, selection ? `lines ${selection.start.line + 1}–${selection.end.line + 1}` : undefined),
      language: resolveLanguageKey(doc.languageId, fileName),
      target,
    });
  });

  register('ideDiff.compareSelectedFiles', async (arg, all) => {
    let uris = Array.isArray(all) ? all.filter((u): u is vscode.Uri => u instanceof vscode.Uri) : [];
    if (uris.length !== 2) {
      const first = await pickFile('IDE Diff: select two files to compare', true);
      if (!first) return;
      uris = first.slice(0, 2);
      if (uris.length === 1) {
        const second = await pickFile(`IDE Diff: compare ${nameOf(uris[0])} with…`);
        if (!second) return;
        uris.push(second[0]);
      }
    }
    await compareFiles(uris[0], uris[1]);
  });

  register('ideDiff.compareActiveFileWith', async (arg) => {
    const active = uriFromArg(arg);
    if (!active) throw new Error('Open a file first.');
    const picked = await pickFile(`IDE Diff: compare ${nameOf(active)} with…`);
    if (!picked) return;
    // the chosen file on the left, the active file (the one you are working on) editable on the right
    await compareFiles(picked[0], active);
  });

  register('ideDiff.compareWithHead', async (arg) => {
    const uri = uriFromArg(arg);
    if (!uri) throw new Error('Open a file or select a changed file in Source Control.');
    const repoFile = await locateInRepo(uri);
    const fileName = nameOf(uri);
    const head = await showHead(repoFile, uri.fsPath); // undefined → new / untracked file
    const onDisk = await exists(uri);
    const working = onDisk ? await readFile(uri) : { text: '' };
    IdeDiffPanel.show(context, `head:${uri.toString()}`, {
      kind: 'diff',
      title: { fileName, leftLabel: 'HEAD', rightLabel: 'Working Tree' },
      original: head ?? '',
      modified: working.text,
      originalTitle: formatPaneTitle(fileName, head === undefined ? 'HEAD — new file' : 'HEAD'),
      modifiedTitle: formatPaneTitle(fileName, onDisk ? 'Working Tree' : 'Working Tree — deleted'),
      language: resolveLanguageKey(working.languageId, fileName),
      target: onDisk && isWritableFile(uri) ? uri : undefined,
    });
  });

  register('ideDiff.resolveConflicts', async (arg) => {
    const uri = uriFromArg(arg);
    if (!uri) throw new Error('Open a conflicted file or select it under Merge Changes in Source Control.');
    const repoFile = await locateInRepo(uri);
    const fileName = nameOf(uri);
    const [base, ours, theirs] = await Promise.all([showStage(repoFile, 1), showStage(repoFile, 2), showStage(repoFile, 3)]);
    const current = (await exists(uri)) ? await readFile(uri) : { text: '' };
    if (ours === undefined && theirs === undefined) {
      throw new Error(
        hasConflictMarkers(current.text)
          ? `${fileName} has conflict markers but no unmerged index entries (already marked resolved?).`
          : `${fileName} has no merge conflicts.`,
      );
    }
    IdeDiffPanel.show(context, `merge:${uri.toString()}`, {
      kind: 'merge',
      title: { fileName, leftLabel: 'Yours', rightLabel: 'Theirs' },
      left: ours ?? '',
      base: base ?? '',
      right: theirs ?? '',
      leftTitle: formatPaneTitle(fileName, ours === undefined ? 'Yours — deleted' : 'Yours'),
      baseTitle: 'Result',
      rightTitle: formatPaneTitle(fileName, theirs === undefined ? 'Theirs — deleted' : 'Theirs'),
      language: resolveLanguageKey(current.languageId, fileName),
      target: uri,
      afterSave: async (conflicts) => {
        const detail =
          conflicts > 0 ? `${conflicts} conflict${conflicts === 1 ? ' is' : 's are'} still unresolved.` : 'All conflicts are resolved.';
        const choice = await vscode.window.showInformationMessage(
          `Mark ${fileName} as resolved (git add)?`,
          { modal: true, detail },
          'Mark as Resolved',
        );
        if (choice === 'Mark as Resolved') {
          await stageFile(repoFile, uri.fsPath);
          void vscode.window.showInformationMessage(`IDE Diff: ${fileName} marked as resolved.`);
        }
      },
    });
  });
}

export function deactivate(): void {
  // panels are disposed with their WebviewPanel
}
