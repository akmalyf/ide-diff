# @ide-diff/react

React components for [`@ide-diff/viewer`](../viewer). The viewer is a JetBrains-style (PhpStorm/IntelliJ) diff and merge viewer built on CodeMirror 6.

```bash
pnpm add @ide-diff/react @codemirror/lang-php
```

```tsx
import { DiffEditor, MergeEditor } from '@ide-diff/react';
import { php } from '@codemirror/lang-php';

const phpLang = php(); // keep extensions stable between renders

export function Review({ before, after, setAfter }) {
  return (
    <DiffEditor
      height={600}
      original={before}
      modified={after}
      language={phpLang}
      originalTitle="Order.php (HEAD)"
      modifiedTitle="Order.php"
      theme="dark"
      mode="side-by-side"
      onChange={setAfter}
    />
  );
}

export function Merge({ ours, base, theirs }) {
  return <MergeEditor height="80vh" left={ours} base={base} right={theirs} language={phpLang} onChange={console.log} />;
}
```

- **Viewer options:** every option of `createDiffViewer` / `createMergeViewer` is a prop. Prop changes are passed to `setOptions`, so the viewer is never re-created.
- **Controlled text:** `original` and `modified` work as controlled values. They are written to the editor only when they differ from its current text, so feeding `onChange` back into `modified` doesn't move the cursor.
- **Instance access:** `ref` and `onMount` give you the viewer instance (`DiffViewerHost` / `TextMergeViewer`) for imperative calls such as `goToNextChange()` or `applyNonConflicting('all')`.
- **Height:** the default height is `100%`, so the parent needs a height.
