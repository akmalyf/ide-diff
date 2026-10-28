// Header toolbar of a two-side diff (DiffRequestProcessor top panel):
// [↑ ↓ | collapse, lock] status ...... [side-by-side | unified] [gear]
import { actionButton, el, retheme, separator, showPopup, type ActionButton, type MenuEntry, type ThemeName } from './ui';

export type DiffMode = 'side-by-side' | 'unified';

export interface DiffToolbarHandlers {
  prev: () => void;
  next: () => void;
  toggleCollapse: () => void;
  toggleLock: () => void;
  isLocked: () => boolean;
  switchMode: (mode: DiffMode) => void;
  settings: () => MenuEntry[];
}

export class DiffToolbar {
  readonly dom: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly buttons: Record<'prev' | 'next' | 'collapse' | 'lock' | 'sideBySide' | 'unified' | 'settings', ActionButton>;

  constructor(
    private theme: ThemeName,
    mode: DiffMode,
    private readonly h: DiffToolbarHandlers,
  ) {
    this.dom = el('div', 'idd-toolbar');
    this.status = el('span', 'idd-status');
    const themeClass = () => `idd-theme-${this.theme}`;
    const b = (
      icon: Parameters<typeof actionButton>[0]['icon'],
      tooltip: string | (() => string),
      onClick: (e: MouseEvent) => void,
      shortcut?: string,
    ) => actionButton({ icon, theme, tooltip, onClick, shortcut, themeClass });

    this.buttons = {
      prev: b('generalUp', 'Previous Difference', () => h.prev(), 'Shift+F7'),
      next: b('generalDown', 'Next Difference', () => h.next(), 'F7'),
      collapse: b('generalCollapseAll', 'Collapse Unchanged Fragments', () => h.toggleCollapse()),
      lock: b('diffDisableEditing', () => (h.isLocked() ? 'Enable Editing' : 'Disable Editing'), () => h.toggleLock()),
      sideBySide: b('diffSideBySide', 'Side-by-side viewer', () => h.switchMode('side-by-side')),
      unified: b('diffUnified', 'Unified viewer', () => h.switchMode('unified')),
      settings: b('generalSettings', 'Settings', (e) =>
        showPopup(e.currentTarget as HTMLElement, h.settings(), this.theme, `idd-theme-${this.theme}`),
      ),
    };
    this.buttons.sideBySide.setSelected(mode === 'side-by-side');
    this.buttons.unified.setSelected(mode === 'unified');

    const left = el('div', 'idd-toolbar-left');
    left.append(this.buttons.prev.dom, this.buttons.next.dom, separator(), this.buttons.collapse.dom, this.buttons.lock.dom);
    const segmented = el('div', 'idd-segmented');
    segmented.append(this.buttons.sideBySide.dom, this.buttons.unified.dom);
    const right = el('div', 'idd-toolbar-right');
    right.append(segmented, this.buttons.settings.dom);
    this.dom.append(left, this.status, el('div', 'idd-toolbar-spacer'), right);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setNavigation(canPrev: boolean, canNext: boolean): void {
    this.buttons.prev.setEnabled(canPrev);
    this.buttons.next.setEnabled(canNext);
  }

  setCollapsed(collapsed: boolean): void {
    this.buttons.collapse.setSelected(collapsed);
  }

  setLocked(locked: boolean): void {
    this.buttons.lock.setSelected(locked);
  }

  setVisible(visible: boolean): void {
    this.dom.style.display = visible ? '' : 'none';
  }

  setTheme(theme: ThemeName): void {
    this.theme = theme;
    retheme(this.dom, theme);
  }
}
