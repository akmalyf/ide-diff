# IDE Diff for VS Code

JetBrains (PhpStorm / IntelliJ IDEA) style diff and 3-way merge views inside VS Code. It is built on
`@ide-diff/viewer` (CodeMirror 6, `packages/viewer` in this repository) and runs in a webview panel.

## Features

- Side-by-side diff with IntelliJ highlighting, a curved change divider, `>>` / `<<` gutter actions,
  collapsed unchanged fragments, synchronized scrolling, and F7 / Shift+F7 navigation. A unified mode is also available.
- 3-way merge (Yours | Result | Theirs) built from the git index stages, with conflict navigation and
  "apply non-conflicting changes".
- Save-back: when the right-hand side is a real file, you can edit it in the panel and press **Ctrl/Cmd+S** to write it.
  The panel title shows `● ` while there are unsaved changes.
- The theme follows VS Code (light, dark and high contrast).
- When the file changes on disk or in another editor, a clean panel refreshes.
- Syntax highlighting for PHP, JavaScript/TypeScript (JSX/TSX), HTML, CSS/SCSS/Less, JSON, Python, Markdown, SQL,
  XML and YAML. Other files are shown as plain text.

## Commands

| Command | Where | What it compares |
| --- | --- | --- |
| **IDE Diff: Compare with Clipboard** | Command Palette, editor context menu | Clipboard (left) ↔ active editor or its selection (right). The whole file can be edited and saved; a selection is read-only. |
| **IDE Diff: Compare Selected Files** | Explorer context menu (exactly 2 files selected), Command Palette (file picker) | First file ↔ second file (the second file can be edited). |
| **IDE Diff: Compare with HEAD** | Source Control resource context menu, editor tab context menu, Command Palette | `git show HEAD:<path>` ↔ working tree (editable). A new or untracked file has an empty left side. |
| **IDE Diff: Compare Active File With…** | Editor tab context menu, Command Palette | Picked file ↔ active file (editable). |
| **IDE Diff: Resolve Conflicts (3-way Merge)** | Source Control "Merge Changes" context menu, editor tab context menu, Command Palette | `:2:` (yours) / `:1:` (base → result) / `:3:` (theirs). Saving writes the result into the file. You are then asked, in a modal, whether to mark the file resolved with `git add`. |

Git content comes from the built-in `vscode.git` extension API. The `git` CLI, run in the repository root, is the
fallback, and is also used for the index stages.

## Build

From the repository root:

```bash
pnpm install
pnpm --filter ide-diff-vscode build     # dist/webview.js (viewer bundle) + dist/extension.cjs
pnpm --filter ide-diff-vscode test
pnpm --filter ide-diff-vscode typecheck
```

`@ide-diff/core` and `@ide-diff/viewer` must be built first. A root `pnpm build` builds them in dependency order.

## Package and install

```bash
pnpm --filter ide-diff-vscode package   # → packages/vscode/ide-diff-vscode-0.1.0.vsix
code --install-extension packages/vscode/ide-diff-vscode-0.1.0.vsix
```

The `.vsix` contains only `dist/extension.cjs`, `dist/webview.js`, `package.json`, this README and `NOTICE`.

## License

Apache-2.0. The package has no LICENSE file of its own. See the repository root `NOTICE`, which is
copied into the package at build time. It covers the Apache-2.0 license and the attribution for the code ported from
JetBrains IntelliJ Platform. JetBrains, IntelliJ IDEA and PhpStorm are trademarks of JetBrains s.r.o. This project is
not affiliated with or endorsed by JetBrains.
