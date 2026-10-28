// Extra chrome / editor CSS for the merge viewer, injected once per document (or shadow root) next to the shared
// `idd-styles`. Uses only the --idd-* theme variables.

const mergeCss = `
/* Toolbar: "Apply non-conflicting changes:" label + text buttons (SHOW_TEXT_IN_TOOLBAR, small font) */
.idd-merge .idd-merge-label { color: var(--idd-fg-secondary); font-size: 12px; white-space: nowrap; padding: 0 4px 0 2px; }
.idd-merge .idd-merge-text-btn { font-size: 12px; padding: 0 6px 0 4px; }
.idd-merge .idd-merge-text-btn:disabled { color: var(--idd-fg-disabled); }
.idd-merge .idd-status { display: inline-flex; align-items: center; gap: 6px; }
.idd-merge .idd-status.idd-merge-done { color: var(--idd-success-fg); }

/* Titles above the three editors */
.idd-merge .idd-title-result { justify-content: flex-start; }

/* Gutter operations column */
.idd-merge-actions .cm-gutterElement { display: flex; align-items: center; justify-content: center; padding: 0 1px; }
.idd-merge-ops { display: inline-flex; align-items: center; gap: 1px; }
.idd-merge-ops + .idd-merge-ops { margin-left: 1px; }

/* PaintMode.RESOLVED: no background, bold dotted border on the first / last line of the change */
.idd-merge .idd-mr-inserted { --idd-mr-color: var(--idd-diff-inserted-bg); }
.idd-merge .idd-mr-deleted { --idd-mr-color: var(--idd-diff-deleted-bg); }
.idd-merge .idd-mr-modified { --idd-mr-color: var(--idd-diff-modified-bg); }
.idd-merge .idd-mr-conflict { --idd-mr-color: var(--idd-diff-conflict-bg); }
.idd-merge .cm-line.idd-mr, .idd-merge .cm-gutterElement.idd-mr {
  --idd-mr-dots: linear-gradient(to right, var(--idd-mr-color) 50%, transparent 50%);
  background-repeat: repeat-x; background-size: 4px 2px;
}
.idd-merge .cm-line.idd-mr-top, .idd-merge .cm-gutterElement.idd-mr-top { background-image: var(--idd-mr-dots); background-position: 0 0; }
.idd-merge .cm-line.idd-mr-bottom, .idd-merge .cm-gutterElement.idd-mr-bottom { background-image: var(--idd-mr-dots); background-position: 0 100%; }
.idd-merge .cm-line.idd-mr-top.idd-mr-bottom, .idd-merge .cm-gutterElement.idd-mr-top.idd-mr-bottom {
  background-image: var(--idd-mr-dots), var(--idd-mr-dots); background-position: 0 0, 0 100%;
}

/* "All changes have been processed" balloon (DiffBalloons.showSuccessPopup) */
.idd-merge-balloon {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 400;
  display: none; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px;
  background: var(--idd-popup-bg); color: var(--idd-fg); border: 1px solid var(--idd-popup-border);
  box-shadow: 0 4px 16px rgba(0,0,0,.25); white-space: nowrap; font-size: var(--idd-ui-font-size);
}
.idd-merge-balloon.idd-visible { display: flex; }
.idd-merge-balloon-close { cursor: pointer; opacity: .7; display: inline-flex; }
.idd-merge-balloon-close:hover { opacity: 1; }
`;

const STYLE_ID = 'idd-merge-styles';

export function injectMergeStyles(root: Document | ShadowRoot = document): void {
  const host = root instanceof Document ? root.head : root;
  if (host.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = mergeCss;
  host.appendChild(style);
}
