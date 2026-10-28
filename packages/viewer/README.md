# @ide-diff/viewer

A JetBrains-style (PhpStorm / IntelliJ IDEA New UI) side-by-side diff viewer built on CodeMirror 6.
Diff algorithms come from `@ide-diff/core`, a port of IntelliJ's `com.intellij.diff.comparison`.

```bash
pnpm add @ide-diff/viewer @codemirror/lang-php
```

```ts
import { createDiffViewer } from '@ide-diff/viewer';
import { php } from '@codemirror/lang-php';

const viewer = createDiffViewer(document.getElementById('diff')!, {
  original: oldText,
  modified: newText,
  language: php(),
  originalTitle: 'Order.php (HEAD)',
  modifiedTitle: 'Order.php (Your version)',
  theme: 'dark', // 'dark' (Islands Dark) | 'light' (Islands Light)
});

viewer.onDidChange((text) => save(text));
viewer.goToNextChange();
viewer.dispose();
```

The container needs an explicit height. Styles are injected automatically.

## Features

- Header toolbar: previous/next difference (F7 / Shift+F7), collapse unchanged fragments, read-only lock,
  side-by-side/unified chooser, settings popup (synchronize scrolling, ignore policy, highlighting policy,
  whitespaces, line numbers, soft wraps).
- Line and word/char-level highlighting with IntelliJ colors.
- Curved divider connecting changes.
- `>>` / `<<` gutter actions to accept a change. Hold Ctrl/Cmd to append.
  Keyboard: Ctrl+Alt+R / Ctrl+Alt+A, or ⌃⌘→ / ⌃⌘← on macOS.
- Synchronized scrolling.
- Collapsed unchanged fragments drawn as a wavy separator. Click to expand step by step (4, 8, 16 context lines).
- Overlay scrollbars with change stripes. The left editor's scrollbar is mirrored, like IntelliJ.
- Unified viewer (`mode: 'unified'` or the toolbar chooser). It shows one editor: deleted lines, then inserted
  lines, with two line-number columns. You can edit unchanged and inserted lines, and those edits go to the modified
  text; deleted lines are read-only. Each change has a Revert (left → right) or Accept (right → left) gutter action.
