// Options shared by the two-side viewers (side-by-side and unified) and the settings popup contents
// (SetEditorSettingsActionGroup + TextDiffProviderBase.getDiffSettingsActions).
import type { Extension } from '@codemirror/state';
import type { HighlightPolicy, IgnorePolicy } from '@ide-diff/core';
import type { DiffViewerOptions } from '../types';
import type { MenuEntry, ThemeName } from '../toolbar/ui';

export interface ResolvedOptions {
  original: string;
  modified: string;
  language: Extension | undefined;
  originalTitle: string | undefined;
  modifiedTitle: string | undefined;
  mode: 'side-by-side' | 'unified';
  theme: ThemeName;
  ignorePolicy: IgnorePolicy;
  highlightPolicy: HighlightPolicy;
  readOnly: [boolean, boolean];
  collapseUnchanged: boolean;
  contextLines: number;
  syncScroll: boolean;
  showToolbar: boolean;
  extensions: Extension[];
  showWhitespaces: boolean;
  showLineNumbers: boolean;
  softWraps: boolean;
}

export type AppearanceOptions = Pick<ResolvedOptions, 'showWhitespaces' | 'showLineNumbers' | 'softWraps'>;

export const IGNORE_POLICIES: Array<[IgnorePolicy, string]> = [
  ['DEFAULT', 'None'],
  ['TRIM_WHITESPACES', 'Trim whitespaces'],
  ['IGNORE_WHITESPACES', 'Ignore whitespaces'],
  ['IGNORE_WHITESPACES_CHUNKS', 'Ignore whitespaces and empty lines'],
];

export const HIGHLIGHT_POLICIES: Array<[HighlightPolicy, string]> = [
  ['BY_LINE', 'Lines'],
  ['BY_WORD', 'Words'],
  ['BY_WORD_SPLIT', 'Split changes'],
  ['BY_CHAR', 'Characters'],
  ['DO_NOT_HIGHLIGHT', 'None'],
];

export function resolveReadOnly(ro: DiffViewerOptions['readOnly']): [boolean, boolean] {
  return typeof ro === 'boolean' ? [ro, ro] : [ro?.original ?? true, ro?.modified ?? false];
}

export function resolveOptions(o: DiffViewerOptions): ResolvedOptions {
  return {
    original: o.original,
    modified: o.modified,
    language: o.language,
    originalTitle: o.originalTitle,
    modifiedTitle: o.modifiedTitle,
    mode: o.mode ?? 'side-by-side',
    theme: o.theme ?? 'dark',
    ignorePolicy: o.ignorePolicy ?? 'DEFAULT',
    highlightPolicy: o.highlightPolicy ?? 'BY_WORD',
    readOnly: resolveReadOnly(o.readOnly),
    collapseUnchanged: o.collapseUnchanged ?? true,
    contextLines: o.contextLines ?? 4,
    syncScroll: o.syncScroll ?? true,
    showToolbar: o.showToolbar ?? true,
    extensions: o.extensions ?? [],
    showWhitespaces: false,
    showLineNumbers: true,
    softWraps: false,
  };
}

export interface SettingsHandlers {
  /** null hides "Synchronize Scrolling" (single-editor viewers) */
  toggleSyncScroll: (() => void) | null;
  setIgnorePolicy: (p: IgnorePolicy) => void;
  setHighlightPolicy: (p: HighlightPolicy) => void;
  setAppearance: (a: Partial<AppearanceOptions>) => void;
}

export function settingsEntries(o: ResolvedOptions, h: SettingsHandlers): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (h.toggleSyncScroll) {
    entries.push({ kind: 'check', text: 'Synchronize Scrolling', checked: o.syncScroll, onSelect: h.toggleSyncScroll }, { kind: 'separator' });
  }
  entries.push(
    { kind: 'header', text: 'Ignore Differences' },
    ...IGNORE_POLICIES.map(([policy, text]): MenuEntry => ({
      kind: 'check',
      text,
      checked: o.ignorePolicy === policy,
      onSelect: () => h.setIgnorePolicy(policy),
    })),
    { kind: 'separator' },
    { kind: 'header', text: 'Highlighting Differences' },
    ...HIGHLIGHT_POLICIES.map(([policy, text]): MenuEntry => ({
      kind: 'check',
      text,
      checked: o.highlightPolicy === policy,
      onSelect: () => h.setHighlightPolicy(policy),
    })),
    { kind: 'separator' },
    { kind: 'header', text: 'Appearance' },
    { kind: 'check', text: 'Show Whitespaces', checked: o.showWhitespaces, onSelect: () => h.setAppearance({ showWhitespaces: !o.showWhitespaces }) },
    { kind: 'check', text: 'Show Line Numbers', checked: o.showLineNumbers, onSelect: () => h.setAppearance({ showLineNumbers: !o.showLineNumbers }) },
    { kind: 'check', text: 'Use Soft Wraps', checked: o.softWraps, onSelect: () => h.setAppearance({ softWraps: !o.softWraps }) },
  );
  return entries;
}

export function pluralDifferences(n: number): string {
  return n === 0 ? 'No differences' : n === 1 ? '1 difference' : `${n} differences`;
}

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
