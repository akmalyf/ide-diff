// Typed postMessage protocol between the extension host (panel.ts) and the webview (webview/main.ts).
import { isLanguageKey, type LanguageKey } from './languages';

export type Theme = 'dark' | 'light';

export interface DiffInit {
  kind: 'diff';
  original: string;
  modified: string;
  originalTitle: string;
  modifiedTitle: string;
  language: LanguageKey;
  /** true when the modified side is a real file that can be written back */
  editable: boolean;
}

export interface MergeInit {
  kind: 'merge';
  left: string;
  base: string;
  right: string;
  leftTitle: string;
  baseTitle: string;
  rightTitle: string;
  language: LanguageKey;
}

export type InitPayload = DiffInit | MergeInit;

/** extension host → webview */
export type HostMessage =
  | { type: 'init'; payload: InitPayload }
  /** the save succeeded; `text` is the new clean baseline */
  | { type: 'saved'; text: string }
  | { type: 'saveFailed'; message: string }
  /** the file changed on disk (and the panel was clean) */
  | { type: 'externalChange'; side: 'original' | 'modified'; text: string };

/** webview → extension host */
export type WebviewMessage =
  | { type: 'ready' }
  /** Ctrl/Cmd+S; `conflicts` is set by the merge viewer (unresolved conflicts left) */
  | { type: 'save'; text: string; conflicts?: number }
  /** sent when the dirty state flips and (debounced) while editing, so the host keeps the latest text */
  | { type: 'edit'; dirty: boolean; text: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';

function isInitPayload(p: unknown): p is InitPayload {
  if (!isObj(p) || !isLanguageKey(p.language)) return false;
  if (p.kind === 'diff') {
    return isStr(p.original) && isStr(p.modified) && isStr(p.originalTitle) && isStr(p.modifiedTitle) && typeof p.editable === 'boolean';
  }
  if (p.kind === 'merge') {
    return isStr(p.left) && isStr(p.base) && isStr(p.right) && isStr(p.leftTitle) && isStr(p.baseTitle) && isStr(p.rightTitle);
  }
  return false;
}

export function isHostMessage(m: unknown): m is HostMessage {
  if (!isObj(m)) return false;
  switch (m.type) {
    case 'init':
      return isInitPayload(m.payload);
    case 'saved':
      return isStr(m.text);
    case 'saveFailed':
      return isStr(m.message);
    case 'externalChange':
      return (m.side === 'original' || m.side === 'modified') && isStr(m.text);
    default:
      return false;
  }
}

export function isWebviewMessage(m: unknown): m is WebviewMessage {
  if (!isObj(m)) return false;
  switch (m.type) {
    case 'ready':
      return true;
    case 'save':
      return isStr(m.text) && (m.conflicts === undefined || typeof m.conflicts === 'number');
    case 'edit':
      return typeof m.dirty === 'boolean' && isStr(m.text);
    default:
      return false;
  }
}
