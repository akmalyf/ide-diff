// Webview entry (bundled into dist/webview.js): hosts the @ide-diff/viewer diff or merge viewer.
import { createDiffViewer, createMergeViewer, type DiffViewerHost, type MergeViewer } from '@ide-diff/viewer';
import { isHostMessage, type InitPayload, type WebviewMessage } from '../protocol';
import { themeFromBodyClasses } from '../util';
import { languageExtension } from './languages';

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const root = document.getElementById('root') as HTMLElement;

let diff: DiffViewerHost | undefined;
let merge: MergeViewer | undefined;
let editable = false;
/** text of the editable side as last saved / loaded ("clean" state) */
let baseline = '';
let dirty = false;
let editTimer: ReturnType<typeof setTimeout> | undefined;
/** set while the host replaces the text programmatically (external change) */
let suppress = false;

const theme = () => themeFromBodyClasses(document.body.classList);
const currentText = () => (merge ? merge.getResult() : (diff?.getModified() ?? ''));
const post = (m: WebviewMessage) => vscode.postMessage(m);

function onEdited(text: string): void {
  if (suppress) return;
  const nowDirty = text !== baseline;
  clearTimeout(editTimer);
  if (nowDirty !== dirty) {
    dirty = nowDirty;
    post({ type: 'edit', dirty, text });
  } else if (dirty) {
    // keep the host's copy of the text reasonably fresh (used when the panel is closed unsaved)
    editTimer = setTimeout(() => post({ type: 'edit', dirty, text: currentText() }), 300);
  }
}

function init(payload: InitPayload): void {
  diff?.dispose();
  merge?.dispose();
  diff = merge = undefined;
  root.replaceChildren();
  dirty = false;
  const language = languageExtension(payload.language);
  if (payload.kind === 'diff') {
    editable = payload.editable;
    diff = createDiffViewer(root, {
      original: payload.original,
      modified: payload.modified,
      originalTitle: payload.originalTitle,
      modifiedTitle: payload.modifiedTitle,
      language,
      theme: theme(),
      readOnly: { original: true, modified: !payload.editable },
    });
    baseline = diff.getModified();
    diff.onDidChange(onEdited);
  } else {
    editable = true;
    merge = createMergeViewer(root, {
      left: payload.left,
      base: payload.base,
      right: payload.right,
      leftTitle: payload.leftTitle,
      baseTitle: payload.baseTitle,
      rightTitle: payload.rightTitle,
      language,
      theme: theme(),
    });
    baseline = merge.getResult();
    merge.onDidChange(onEdited);
  }
}

function save(): void {
  if (!editable || (!diff && !merge)) return;
  clearTimeout(editTimer);
  post({ type: 'save', text: currentText(), conflicts: merge?.getStatus().conflicts });
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const m = event.data;
  if (!isHostMessage(m)) return;
  switch (m.type) {
    case 'init':
      init(m.payload);
      break;
    case 'saved':
      baseline = m.text;
      dirty = false; // the host marked the panel clean
      onEdited(currentText()); // edits typed while the save was in flight make it dirty again
      break;
    case 'saveFailed':
      break;
    case 'externalChange':
      if (!diff) break;
      if (m.side === 'original') {
        diff.setOriginal(m.text);
      } else if (!dirty) {
        suppress = true;
        try {
          diff.setModified(m.text);
        } finally {
          suppress = false;
        }
        baseline = diff.getModified();
      }
      break;
  }
});

// Ctrl/Cmd+S saves. Bubble phase on `document`, which runs before VS Code's own keydown forwarder on the window:
// keys the viewer already handled (defaultPrevented: undo/redo, search, F7…) are not forwarded to the workbench too,
// which would otherwise run e.g. undo a second time through execCommand.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    e.stopPropagation();
    save();
    return;
  }
  if (e.defaultPrevented) e.stopPropagation();
});

// Theme follows VS Code: it toggles vscode-light / vscode-dark / vscode-high-contrast(-light) on <body>.
new MutationObserver(() => {
  const t = theme();
  diff?.setOptions({ theme: t });
  merge?.setOptions({ theme: t });
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

window.addEventListener('resize', () => {
  diff?.layout();
  merge?.layout();
});

post({ type: 'ready' });
