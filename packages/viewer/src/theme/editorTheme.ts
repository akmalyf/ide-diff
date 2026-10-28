// CodeMirror theme + syntax highlighting mirroring IntelliJ New UI editor schemes.
// All colors come from the --idd-* custom properties defined in ./vars.ts, so one theme serves dark and light.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

const diffTypes = ['inserted', 'deleted', 'modified', 'conflict'] as const;

function diffLineRules(): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  for (const type of diffTypes) {
    // DiffLineMarkerRenderer: editor line and gutter share the same color (full or "ignored" when inner fragments exist)
    rules[`.cm-line.idd-l-${type}, .cm-gutterElement.idd-l-${type}`] = { backgroundColor: `var(--idd-diff-${type}-bg)` };
    rules[`.cm-line.idd-l-${type}-ign, .cm-gutterElement.idd-l-${type}-ign`] = {
      backgroundColor: `var(--idd-diff-${type}-ignored-bg)`,
    };
    // Empty range on this side: 2px border line at the line boundary (DiffDrawUtil.drawChunkBorderLine, doubleLine)
    rules[`.cm-line.idd-e-top-${type}, .cm-gutterElement.idd-e-top-${type}`] = {
      boxShadow: `inset 0 2px 0 0 var(--idd-diff-${type}-bg)`,
    };
    rules[`.cm-line.idd-e-bottom-${type}, .cm-gutterElement.idd-e-bottom-${type}`] = {
      boxShadow: `inset 0 -2px 0 0 var(--idd-diff-${type}-bg)`,
    };
    // InlineHighlighterBuilder: full DIFF_* color on the inner (word/char) range
    rules[`.idd-i-${type}`] = { backgroundColor: `var(--idd-diff-${type}-bg)` };
    // DiffEmptyHighlighterRenderer: thin marker for an empty inner range
    rules[`.idd-i-empty-${type}`] = { backgroundColor: `var(--idd-diff-${type}-bg)` };
  }
  // createNonSquashedChangesSeparator: 1px MODIFIED line between two adjacent changes
  rules['.cm-line.idd-sep-top, .cm-gutterElement.idd-sep-top'] = {
    boxShadow: 'inset 0 1px 0 0 var(--idd-diff-modified-bg)',
  };
  return rules;
}

export const ideEditorTheme: Extension = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--idd-editor-bg)',
    color: 'var(--idd-editor-fg)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--idd-font-family)',
    fontSize: 'var(--idd-font-size)',
    lineHeight: 'var(--idd-line-height)',
    fontVariantLigatures: 'none',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--idd-caret)' },
  '.cm-line': { padding: '0 8px 0 6px' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--idd-caret)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--idd-selection-bg)' },
  '.cm-activeLine': { backgroundColor: 'var(--idd-caret-row-bg)' },
  '.cm-gutters': {
    backgroundColor: 'var(--idd-gutter-bg)',
    color: 'var(--idd-line-number)',
    border: 'none',
  },
  '.cm-gutterElement': { padding: '0' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--idd-caret-row-bg)', color: 'var(--idd-line-number-caret-row)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--idd-matched-brace-bg)',
    color: 'inherit',
  },
  '.cm-nonmatchingBracket': { color: 'var(--idd-syntax-invalid)' },
  '.cm-searchMatch': { backgroundColor: 'var(--idd-search-result-bg)' },
  '.cm-highlightSpace': {
    backgroundImage: 'radial-gradient(circle at 50% 55%, var(--idd-whitespace) 11%, transparent 5%)',
  },
  '.cm-highlightTab': {
    backgroundImage:
      'linear-gradient(to right, transparent 15%, var(--idd-whitespace) 15%, var(--idd-whitespace) 85%, transparent 85%)',
    backgroundSize: 'auto 1px',
    backgroundPosition: 'left 55%',
    backgroundRepeat: 'no-repeat',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--idd-popup-bg)',
    border: '1px solid var(--idd-popup-border)',
    color: 'var(--idd-fg)',
  },
  ...diffLineRules(),
});

const italic = 'italic';

/** Lezer tag → IntelliJ TextAttributesKey mapping from docs/research/theme.md §5. */
export const ideHighlightStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self, t.null, t.bool, t.atom],
    color: 'var(--idd-syntax-keyword)',
  },
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: 'var(--idd-syntax-string)' },
  { tag: t.escape, color: 'var(--idd-syntax-string-escape)' },
  { tag: t.regexp, color: 'var(--idd-syntax-regexp)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--idd-syntax-number)' },
  { tag: [t.lineComment, t.blockComment, t.comment], color: 'var(--idd-syntax-comment)', fontStyle: 'var(--idd-syntax-comment-style)' },
  { tag: t.docComment, color: 'var(--idd-syntax-doc-comment)', fontStyle: italic },
  {
    tag: [t.function(t.definition(t.variableName)), t.function(t.definition(t.propertyName))],
    color: 'var(--idd-syntax-function-decl)',
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--idd-syntax-function-call)' },
  { tag: [t.variableName, t.local(t.variableName)], color: 'var(--idd-syntax-variable)' },
  { tag: t.special(t.variableName), color: 'var(--idd-syntax-php-var)' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--idd-syntax-field)' },
  { tag: [t.constant(t.variableName), t.standard(t.variableName)], color: 'var(--idd-syntax-constant)', fontStyle: italic },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--idd-syntax-type)' },
  { tag: [t.meta, t.annotation, t.processingInstruction], color: 'var(--idd-syntax-metadata)' },
  { tag: t.tagName, color: 'var(--idd-syntax-tag)' },
  { tag: t.angleBracket, color: 'var(--idd-syntax-tag-bracket)' },
  { tag: t.attributeName, color: 'var(--idd-syntax-attribute)' },
  { tag: t.invalid, color: 'var(--idd-syntax-invalid)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'var(--idd-syntax-operator)' },
  { tag: [t.link, t.url], color: 'var(--idd-syntax-link)', textDecoration: 'underline' },
  { tag: t.heading, color: 'var(--idd-syntax-keyword)', fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: italic },
  { tag: t.strong, fontWeight: 'bold' },
]);

export const ideSyntaxHighlighting: Extension = syntaxHighlighting(ideHighlightStyle);
