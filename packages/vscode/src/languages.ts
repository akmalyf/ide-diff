// VS Code languageId / file extension → bundled CodeMirror language key. Pure (no `vscode` import) so it is testable
// and shared by the extension host (which picks the key) and the webview (which maps the key to a CM extension).

export const LANGUAGE_KEYS = [
  'php',
  'javascript',
  'jsx',
  'typescript',
  'tsx',
  'html',
  'css',
  'json',
  'python',
  'markdown',
  'sql',
  'xml',
  'yaml',
  'plaintext',
] as const;

export type LanguageKey = (typeof LANGUAGE_KEYS)[number];

const BY_LANGUAGE_ID: Record<string, LanguageKey> = {
  php: 'php',
  blade: 'php',
  javascript: 'javascript',
  javascriptreact: 'jsx',
  typescript: 'typescript',
  typescriptreact: 'tsx',
  html: 'html',
  vue: 'html',
  svelte: 'html',
  handlebars: 'html',
  twig: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  jsonl: 'json',
  python: 'python',
  markdown: 'markdown',
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'sql',
  xml: 'xml',
  xsl: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  'github-actions-workflow': 'yaml',
  dockercompose: 'yaml',
};

const BY_EXTENSION: Record<string, LanguageKey> = {
  php: 'php',
  phtml: 'php',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  html: 'html',
  htm: 'html',
  vue: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  py: 'python',
  pyi: 'python',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  svg: 'xml',
  xliff: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};

/** Maps a VS Code languageId (preferred) or a file name / path to a language key; falls back to plain text. */
export function resolveLanguageKey(languageId?: string, fileName?: string): LanguageKey {
  if (languageId) {
    const byId = BY_LANGUAGE_ID[languageId.toLowerCase()];
    if (byId) return byId;
  }
  if (fileName) {
    const base = fileName.split(/[\\/]/).pop() ?? '';
    const dot = base.lastIndexOf('.');
    if (dot > 0) {
      const byExt = BY_EXTENSION[base.slice(dot + 1).toLowerCase()];
      if (byExt) return byExt;
    }
  }
  return 'plaintext';
}

export function isLanguageKey(value: unknown): value is LanguageKey {
  return typeof value === 'string' && (LANGUAGE_KEYS as readonly string[]).includes(value);
}
