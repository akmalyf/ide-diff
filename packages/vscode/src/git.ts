// Git access: the built-in `vscode.git` extension API where it helps (repository lookup, `show`, `add`),
// with a `git` child process as the fallback (and for stage refs :1/:2/:3).
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

/** Minimal slice of the `vscode.git` API (extensions/git/src/api/git.d.ts) that we use. */
interface GitRepository {
  readonly rootUri: vscode.Uri;
  show(ref: string, path: string): Promise<string>;
  add(paths: string[]): Promise<void>;
}
interface GitAPI {
  getRepository(uri: vscode.Uri): GitRepository | null;
}
interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitAPI;
}

async function gitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) return undefined;
  try {
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return exports.enabled ? exports.getAPI(1) : undefined;
  } catch {
    return undefined;
  }
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

export interface RepoFile {
  /** repository root (fs path) */
  root: string;
  /** path relative to the root, with forward slashes */
  relPath: string;
  repo?: GitRepository;
}

export async function locateInRepo(uri: vscode.Uri): Promise<RepoFile> {
  if (uri.scheme !== 'file') throw new Error(`${uri.toString()} is not a local file.`);
  const api = await gitApi();
  const repo = api?.getRepository(uri) ?? undefined;
  let root = repo?.rootUri.fsPath;
  if (!root) {
    try {
      root = (await runGit(path.dirname(uri.fsPath), ['rev-parse', '--show-toplevel'])).trim();
    } catch {
      throw new Error(`${path.basename(uri.fsPath)} is not inside a git repository.`);
    }
  }
  const relPath = path.relative(root, uri.fsPath).split(path.sep).join('/');
  return { root, relPath, repo };
}

/** Content of the file at HEAD, or `undefined` when it does not exist there (new / untracked file). */
export async function showHead(file: RepoFile, fsPath: string): Promise<string | undefined> {
  if (file.repo) {
    try {
      return await file.repo.show('HEAD', fsPath);
    } catch {
      // fall through to the CLI so we can tell "not in HEAD" from other failures
    }
  }
  try {
    return await runGit(file.root, ['show', `HEAD:${file.relPath}`]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|exists on disk, but not in|bad revision|invalid object name|unknown revision/i.test(msg)) return undefined;
    throw e;
  }
}

/** Index stage content (:1 base, :2 ours, :3 theirs); `undefined` when that stage is absent (e.g. add/add). */
export async function showStage(file: RepoFile, stage: 1 | 2 | 3): Promise<string | undefined> {
  try {
    return await runGit(file.root, ['show', `:${stage}:${file.relPath}`]);
  } catch {
    return undefined;
  }
}

export async function stageFile(file: RepoFile, fsPath: string): Promise<void> {
  if (file.repo) {
    await file.repo.add([fsPath]);
    return;
  }
  await runGit(file.root, ['add', '--', file.relPath]);
}
