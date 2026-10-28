// Pure helpers (no `vscode` import) used by the extension host and webview; covered by unit tests.

export const DIRTY_PREFIX = '● ';

/** "OrderService.php (HEAD ↔ Working Tree)", prefixed with "● " while dirty. */
export function formatPanelTitle(fileName: string, leftLabel: string, rightLabel: string, dirty = false): string {
  return `${dirty ? DIRTY_PREFIX : ''}${fileName} (${leftLabel} ↔ ${rightLabel})`;
}

/** "Order.php (HEAD)" pane header. */
export function formatPaneTitle(fileName: string, label?: string): string {
  return label ? `${fileName} (${label})` : fileName;
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Maps the VS Code webview body classes to the viewer theme. */
export function themeFromBodyClasses(classes: Iterable<string>): 'dark' | 'light' {
  const list = [...classes];
  if (list.includes('vscode-high-contrast-light') || list.includes('vscode-light')) return 'light';
  if (list.includes('vscode-dark') || list.includes('vscode-high-contrast')) return 'dark';
  return 'dark';
}

/** True when the text contains git conflict markers (<<<<<<< / ======= / >>>>>>> at line starts). */
export function hasConflictMarkers(text: string): boolean {
  return /^<{7}(?: |$)/m.test(text) && /^={7}$/m.test(text) && /^>{7}(?: |$)/m.test(text);
}

export function detectEol(text: string): '\r\n' | '\n' {
  const crlf = text.indexOf('\r\n');
  if (crlf < 0) return '\n';
  const lf = text.indexOf('\n');
  return lf === crlf + 1 ? '\r\n' : '\n';
}

/** CodeMirror joins lines with "\n"; restore the file's original line separator before writing it back. */
export function withEol(text: string, eol: '\r\n' | '\n'): string {
  const normalized = text.replace(/\r\n/g, '\n');
  return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n');
}
