// Small DOM toolkit for the IntelliJ-style header toolbar: action buttons, toggles, segmented chooser,
// popup menus and tooltips.
import { getIcon, type IconName } from '../icons';

export type ThemeName = 'dark' | 'light';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function iconEl(name: IconName, theme: ThemeName, size: 14 | 16 = 16): HTMLSpanElement {
  const span = el('span', size === 14 ? 'idd-icon idd-icon-14' : 'idd-icon');
  span.dataset.icon = name;
  span.innerHTML = getIcon(name, theme);
  return span;
}

/** Re-render every icon under `root` for a new theme. */
export function retheme(root: ParentNode, theme: ThemeName): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    node.innerHTML = getIcon(node.dataset.icon as IconName, theme);
  });
}

// Tooltip (ActionButton help tooltip: text + shortcut)
let tooltipNode: HTMLDivElement | null = null;
let tooltipTimer = 0;

export function attachTooltip(target: HTMLElement, text: () => string, shortcut?: string, themeClass?: () => string): void {
  const show = () => {
    window.clearTimeout(tooltipTimer);
    tooltipTimer = window.setTimeout(() => {
      hideTooltip();
      const tip = el('div', `idd-tooltip ${themeClass?.() ?? ''}`);
      tip.append(text());
      if (shortcut) tip.append(el('span', 'idd-tooltip-shortcut', shortcut));
      document.body.appendChild(tip);
      const r = target.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      let left = r.left + r.width / 2 - tr.width / 2;
      left = Math.max(4, Math.min(left, window.innerWidth - tr.width - 4));
      let top = r.bottom + 6;
      if (top + tr.height > window.innerHeight) top = r.top - tr.height - 6;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tooltipNode = tip;
    }, 500);
  };
  target.addEventListener('mouseenter', show);
  target.addEventListener('mouseleave', hideTooltip);
  target.addEventListener('mousedown', hideTooltip);
}

export function hideTooltip(): void {
  window.clearTimeout(tooltipTimer);
  tooltipNode?.remove();
  tooltipNode = null;
}

export interface ActionButton {
  dom: HTMLButtonElement;
  setEnabled(enabled: boolean): void;
  setSelected(selected: boolean): void;
}

export function actionButton(opts: {
  icon: IconName;
  theme: ThemeName;
  tooltip: string | (() => string);
  shortcut?: string;
  themeClass: () => string;
  onClick: (e: MouseEvent) => void;
}): ActionButton {
  const button = el('button', 'idd-btn');
  button.type = 'button';
  button.appendChild(iconEl(opts.icon, opts.theme));
  const tooltip = typeof opts.tooltip === 'function' ? opts.tooltip : () => opts.tooltip as string;
  button.setAttribute('aria-label', tooltip());
  attachTooltip(button, tooltip, opts.shortcut, opts.themeClass);
  button.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor focus, like IntelliJ toolbars
  button.addEventListener('click', (e) => {
    if (!button.disabled) opts.onClick(e);
  });
  return {
    dom: button,
    setEnabled: (enabled) => {
      button.disabled = !enabled;
    },
    setSelected: (selected) => {
      button.classList.toggle('idd-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    },
  };
}

export function separator(): HTMLElement {
  return el('span', 'idd-sep');
}

// Popup menu

export type MenuEntry =
  | { kind: 'header'; text: string }
  | { kind: 'separator' }
  | { kind: 'check'; text: string; checked: boolean; onSelect: () => void };

let openPopup: { node: HTMLElement; close: () => void } | null = null;

export function closePopup(): void {
  openPopup?.close();
}

export function showPopup(anchor: HTMLElement, entries: MenuEntry[], theme: ThemeName, themeClass: string): void {
  closePopup();
  const popup = el('div', `idd-popup ${themeClass}`);
  popup.setAttribute('role', 'menu');
  for (const entry of entries) {
    if (entry.kind === 'header') popup.appendChild(el('div', 'idd-menu-header', entry.text));
    else if (entry.kind === 'separator') popup.appendChild(el('div', 'idd-menu-sep'));
    else {
      const item = el('div', 'idd-menu-item');
      item.setAttribute('role', 'menuitemcheckbox');
      item.setAttribute('aria-checked', String(entry.checked));
      const check = el('span', 'idd-menu-check');
      if (entry.checked) check.appendChild(iconEl('actionsChecked', theme));
      item.append(check, el('span', undefined, entry.text));
      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => {
        closePopup();
        entry.onSelect();
      });
      popup.appendChild(item);
    }
  }
  document.body.appendChild(popup);
  const r = anchor.getBoundingClientRect();
  const pr = popup.getBoundingClientRect();
  let left = r.right - pr.width;
  left = Math.max(4, Math.min(left, window.innerWidth - pr.width - 4));
  let top = r.bottom + 4;
  if (top + pr.height > window.innerHeight - 4) top = Math.max(4, r.top - pr.height - 4);
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  anchor.classList.add('idd-selected');

  const onDown = (e: MouseEvent) => {
    if (!popup.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    popup.remove();
    anchor.classList.remove('idd-selected');
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', close);
    openPopup = null;
  };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', close);
  openPopup = { node: popup, close };
}
