import { describe, expect, it } from 'vitest';
import { isLanguageKey, resolveLanguageKey } from './languages';
import { isHostMessage, isWebviewMessage } from './protocol';
import { baseName, detectEol, formatPaneTitle, formatPanelTitle, hasConflictMarkers, themeFromBodyClasses, withEol } from './util';

describe('resolveLanguageKey', () => {
  it('maps VS Code languageIds', () => {
    expect(resolveLanguageKey('php')).toBe('php');
    expect(resolveLanguageKey('typescriptreact')).toBe('tsx');
    expect(resolveLanguageKey('jsonc')).toBe('json');
    expect(resolveLanguageKey('scss')).toBe('css');
    expect(resolveLanguageKey('yaml')).toBe('yaml');
  });
  it('falls back to the file extension, then plain text', () => {
    expect(resolveLanguageKey('plaintext', 'src/OrderService.php')).toBe('php');
    expect(resolveLanguageKey(undefined, 'C:\\x\\docker-compose.YML')).toBe('yaml');
    expect(resolveLanguageKey('cobol', 'README')).toBe('plaintext');
    expect(resolveLanguageKey(undefined, '.env')).toBe('plaintext');
  });
  it('guards keys', () => {
    expect(isLanguageKey('php')).toBe(true);
    expect(isLanguageKey('cobol')).toBe(false);
  });
});

describe('protocol guards', () => {
  it('accepts valid host messages', () => {
    expect(
      isHostMessage({
        type: 'init',
        payload: { kind: 'diff', original: 'a', modified: 'b', originalTitle: 'x', modifiedTitle: 'y', language: 'php', editable: true },
      }),
    ).toBe(true);
    expect(
      isHostMessage({
        type: 'init',
        payload: { kind: 'merge', left: '', base: '', right: '', leftTitle: '', baseTitle: 'Result', rightTitle: '', language: 'plaintext' },
      }),
    ).toBe(true);
    expect(isHostMessage({ type: 'saved', text: '' })).toBe(true);
    expect(isHostMessage({ type: 'externalChange', side: 'modified', text: 'x' })).toBe(true);
  });
  it('rejects malformed host messages', () => {
    expect(isHostMessage(null)).toBe(false);
    expect(isHostMessage({ type: 'init', payload: { kind: 'diff', original: 'a' } })).toBe(false);
    expect(isHostMessage({ type: 'init', payload: { kind: 'merge', left: '', base: '', right: '', leftTitle: '', baseTitle: '', rightTitle: '', language: 'cobol' } })).toBe(false);
    expect(isHostMessage({ type: 'externalChange', side: 'base', text: 'x' })).toBe(false);
    expect(isHostMessage({ type: 'nope' })).toBe(false);
  });
  it('validates webview messages', () => {
    expect(isWebviewMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewMessage({ type: 'save', text: 'x' })).toBe(true);
    expect(isWebviewMessage({ type: 'save', text: 'x', conflicts: 2 })).toBe(true);
    expect(isWebviewMessage({ type: 'save', text: 1 })).toBe(false);
    expect(isWebviewMessage({ type: 'edit', dirty: true, text: 'x' })).toBe(true);
    expect(isWebviewMessage({ type: 'edit', dirty: 'yes', text: 'x' })).toBe(false);
    expect(isWebviewMessage('save')).toBe(false);
  });
});

describe('titles', () => {
  it('formats panel and pane titles', () => {
    expect(formatPanelTitle('OrderService.php', 'HEAD', 'Working Tree')).toBe('OrderService.php (HEAD ↔ Working Tree)');
    expect(formatPanelTitle('OrderService.php', 'HEAD', 'Working Tree', true)).toBe('● OrderService.php (HEAD ↔ Working Tree)');
    expect(formatPaneTitle('Order.php', 'HEAD')).toBe('Order.php (HEAD)');
    expect(formatPaneTitle('Order.php')).toBe('Order.php');
    expect(baseName('/a/b/Order.php')).toBe('Order.php');
  });
});

describe('theme / conflicts / eol', () => {
  it('maps body classes to a viewer theme', () => {
    expect(themeFromBodyClasses(['vscode-light'])).toBe('light');
    expect(themeFromBodyClasses(['vscode-high-contrast-light', 'vscode-high-contrast'])).toBe('light');
    expect(themeFromBodyClasses(['vscode-dark'])).toBe('dark');
    expect(themeFromBodyClasses(['vscode-high-contrast'])).toBe('dark');
    expect(themeFromBodyClasses([])).toBe('dark');
  });
  it('detects conflict markers', () => {
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> feature\nb')).toBe(true);
    expect(hasConflictMarkers('a\n<<<<<<< HEAD\nx\n')).toBe(false);
    expect(hasConflictMarkers('const s = "<<<<<<< HEAD";')).toBe(false);
  });
  it('keeps line endings', () => {
    expect(detectEol('a\r\nb')).toBe('\r\n');
    expect(detectEol('a\nb\r\n')).toBe('\n');
    expect(withEol('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
    expect(withEol('a\r\nb', '\n')).toBe('a\nb');
  });
});
