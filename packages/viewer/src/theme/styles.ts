// Chrome (toolbar, titles, divider, popups, scrollbars) styles. Injected once per document.
import { themeVarsCss } from './vars';

const chromeCss = `
.idd-root {
  display: flex; flex-direction: column; position: relative;
  width: 100%; height: 100%; min-height: 0; overflow: hidden; box-sizing: border-box;
  background: var(--idd-panel-bg); color: var(--idd-fg);
  font-family: var(--idd-ui-font-family); font-size: var(--idd-ui-font-size);
  -webkit-font-smoothing: antialiased;
}
.idd-root *, .idd-popup * { box-sizing: border-box; }
.idd-icon { display: inline-flex; width: 16px; height: 16px; flex: none; }
.idd-icon svg { width: 100%; height: 100%; display: block; }
.idd-icon-14 { width: 14px; height: 14px; }

/* Header toolbar (DiffRequestProcessor top panel) */
.idd-toolbar {
  display: flex; align-items: center; gap: 2px; flex: none;
  height: 40px; padding: 0 8px; background: var(--idd-toolbar-bg);
  border-bottom: 1px solid var(--idd-border); user-select: none;
}
.idd-toolbar-left, .idd-toolbar-right { display: flex; align-items: center; gap: 2px; }
.idd-toolbar-spacer { flex: 1; min-width: 8px; }
.idd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 26px; min-width: 26px; padding: 0 5px; border: none; border-radius: 6px;
  background: transparent; color: var(--idd-fg); font: inherit; cursor: pointer; outline: none;
}
.idd-btn:hover:not(:disabled) { background: var(--idd-button-hover-bg); }
.idd-btn:active:not(:disabled), .idd-btn.idd-selected { background: var(--idd-button-pressed-bg); }
.idd-btn:focus-visible { box-shadow: 0 0 0 2px var(--idd-focus); }
.idd-btn:disabled { cursor: default; }
.idd-btn:disabled .idd-icon { opacity: .5; }
.idd-sep { width: 1px; height: 20px; margin: 0 5px; background: var(--idd-toolbar-separator); flex: none; }
.idd-status { color: var(--idd-fg-secondary); white-space: nowrap; padding: 0 8px; }

/* SegmentedButtonComponent (diff tool chooser) */
.idd-segmented {
  display: inline-flex; align-items: center; padding: 1px; gap: 1px; margin: 0 4px;
  border: 1px solid var(--idd-control-border); border-radius: 6px;
}
.idd-segmented .idd-btn { height: 22px; min-width: 28px; border-radius: 4px; border: 1px solid transparent; }
.idd-segmented .idd-btn.idd-selected { background: var(--idd-button-pressed-bg); border-color: var(--idd-control-border); }

/* Content titles (Diff.ContentTitle.insets = 6, gap = 6) */
.idd-titles { display: flex; flex: none; border-bottom: 1px solid var(--idd-border); background: var(--idd-panel-bg); }
.idd-title {
  flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 6px;
  color: var(--idd-title-fg); white-space: nowrap; overflow: hidden;
}
.idd-title-text { overflow: hidden; text-overflow: ellipsis; }
.idd-title-secondary { color: var(--idd-title-secondary-fg); overflow: hidden; text-overflow: ellipsis; }
.idd-title-gap { width: var(--idd-divider-width); flex: none; }

/* Notification ("Contents are identical") */
.idd-notice {
  display: none; flex: none; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--idd-border); background: var(--idd-panel-bg); color: var(--idd-fg);
}
.idd-notice.idd-visible { display: flex; }

/* Editors + divider */
.idd-body { display: flex; flex: 1 1 auto; min-height: 0; position: relative; }
.idd-pane { position: relative; flex: 1 1 0; min-width: 0; overflow: hidden; background: var(--idd-editor-bg); }
.idd-pane > .cm-editor { position: absolute; inset: 0; }
.idd-divider {
  position: relative; flex: none; width: var(--idd-divider-width); overflow: hidden;
  background: var(--idd-divider-bg);
}
.idd-divider svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }

/* Hide native vertical scrollbars; the IntelliJ-like overlay scrollbar (with error stripes) replaces them */
.idd-pane .cm-scroller { scrollbar-width: none; }
@supports selector(::-webkit-scrollbar) {
  .idd-pane .cm-scroller { scrollbar-width: auto; }
  .idd-pane .cm-scroller::-webkit-scrollbar { width: 0; height: 8px; background: transparent; }
  .idd-pane .cm-scroller::-webkit-scrollbar-thumb { background: var(--idd-scrollbar-thumb); border-radius: 4px; }
  .idd-pane .cm-scroller::-webkit-scrollbar-thumb:hover { background: var(--idd-scrollbar-thumb-hover); }
  .idd-pane .cm-scroller::-webkit-scrollbar-corner { background: transparent; }
}
.idd-vscroll {
  position: absolute; top: 0; bottom: 0; width: 14px; z-index: 300; background: var(--idd-scrollbar-track);
}
.idd-vscroll-right { right: 0; }
.idd-vscroll-left { left: 0; }
.idd-stripe { position: absolute; left: 4px; right: 4px; min-height: 2px; pointer-events: none; }
.idd-thumb {
  position: absolute; left: 3px; right: 3px; min-height: 16px; border-radius: 4px;
  background: var(--idd-scrollbar-thumb); opacity: 0; transition: opacity .25s, background .15s;
}
.idd-pane:hover .idd-thumb, .idd-vscroll.idd-dragging .idd-thumb { opacity: 1; }
.idd-vscroll:hover .idd-thumb, .idd-vscroll.idd-dragging .idd-thumb { background: var(--idd-scrollbar-thumb-hover); }
.idd-pane-left .cm-content { padding-left: 14px; }
.idd-pane-right .cm-gutters + .cm-content, .idd-pane-right .cm-content { padding-right: 14px; }

/* Gutters */
.idd-linenumbers .cm-gutterElement {
  padding: 0 4px 0 8px; min-width: 24px; text-align: right; font-size: var(--idd-font-size);
}
.idd-pane-left .idd-linenumbers .cm-gutterElement { padding: 0 8px 0 4px; }
.idd-actions .cm-gutterElement { width: 20px; display: flex; align-items: center; justify-content: center; }
.idd-gutter-op {
  display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center;
  border-radius: 4px; cursor: pointer;
}
.idd-gutter-op:hover { background: var(--idd-button-hover-bg); }
.idd-gutter-op svg { width: 14px; height: 14px; display: block; }
.idd-gutter-op .idd-op-append { display: none; }
html.idd-mod-down .idd-gutter-op .idd-op-append { display: block; }
html.idd-mod-down .idd-gutter-op .idd-op-apply:has(+ .idd-op-append) { display: none; }

/* Collapsed unchanged fragment (DiffLineSeparatorRenderer) */
.idd-fold {
  position: relative; height: var(--idd-line-height); cursor: pointer;
  background-repeat: repeat-x; background-position: left center; background-size: 16px 8px;
}
.idd-fold-label {
  position: absolute; top: 50%; transform: translateY(-50%); left: 50%; translate: -50% 0;
  padding: 0 6px; border-radius: 4px; line-height: 18px; font-family: var(--idd-ui-font-family); font-size: 12px;
  color: var(--idd-hint-fg); background: var(--idd-hint-bg); white-space: nowrap; display: none;
}
.idd-fold:hover .idd-fold-label { display: block; }
.idd-fold-gutter { height: var(--idd-line-height); }

/* Popup menu (settings gear) */
.idd-popup {
  position: fixed; z-index: 10000; min-width: 220px; padding: 6px 0;
  background: var(--idd-popup-bg); color: var(--idd-fg); border: 1px solid var(--idd-popup-border);
  border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  font-family: var(--idd-ui-font-family); font-size: var(--idd-ui-font-size); user-select: none;
}
.idd-menu-header { padding: 4px 12px 2px 12px; color: var(--idd-fg-secondary); font-size: 12px; }
.idd-menu-item {
  display: flex; align-items: center; gap: 6px; height: 26px; margin: 0 6px; padding: 0 8px 0 6px;
  border-radius: 4px; cursor: pointer; white-space: nowrap;
}
.idd-menu-item:hover { background: var(--idd-list-selection-bg); }
.idd-menu-check { width: 16px; height: 16px; display: inline-flex; flex: none; }
.idd-menu-check svg { width: 16px; height: 16px; }
.idd-menu-sep { height: 1px; margin: 4px 12px; background: var(--idd-popup-border); }

/* Tooltip */
.idd-tooltip {
  position: fixed; z-index: 10001; padding: 5px 8px; border-radius: 6px; pointer-events: none;
  background: var(--idd-tooltip-bg); color: var(--idd-tooltip-fg); border: 1px solid var(--idd-popup-border);
  font-family: var(--idd-ui-font-family); font-size: 12px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.idd-tooltip-shortcut { color: var(--idd-fg-secondary); margin-left: 8px; }
`;

const STYLE_ID = 'idd-styles';

/** Injects the theme variables and chrome CSS into the document (or shadow root) once. */
export function injectStyles(root: Document | ShadowRoot = document): void {
  const host = root instanceof Document ? root.head : root;
  if (host.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = themeVarsCss + chromeCss;
  host.appendChild(style);
}
