// Small shared helpers for the diff viewers.
import type { DiffFragment, TextDiffType } from '@ide-diff/core';

/** DiffUtil.getDiffType for an inner fragment */
export function innerType(f: DiffFragment): TextDiffType {
  const empty1 = f.startOffset1 === f.endOffset1;
  const empty2 = f.startOffset2 === f.endOffset2;
  return empty1 ? 'INSERTED' : empty2 ? 'DELETED' : 'MODIFIED';
}

let modifierListenerInstalled = false;

/** Tracks Ctrl/Cmd on <html> (class idd-mod-down) so gutter operations can show their "append" variant. */
export function installModifierListener(): void {
  if (modifierListenerInstalled || typeof window === 'undefined') return;
  modifierListenerInstalled = true;
  const update = (e: KeyboardEvent | MouseEvent) =>
    document.documentElement.classList.toggle('idd-mod-down', e.ctrlKey || e.metaKey);
  window.addEventListener('keydown', update, true);
  window.addEventListener('keyup', update, true);
  window.addEventListener('mousemove', update, true);
  window.addEventListener('blur', () => document.documentElement.classList.remove('idd-mod-down'));
}

/** Injects styles into the document or the shadow root that hosts `container`. */
export function styleRoot(container: HTMLElement): Document | ShadowRoot {
  const root = container.getRootNode();
  return root instanceof ShadowRoot ? root : document;
}
