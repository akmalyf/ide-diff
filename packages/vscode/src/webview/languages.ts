// Language key → bundled CodeMirror language support.
import type { Extension } from '@codemirror/state';
import { php } from '@codemirror/lang-php';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import type { LanguageKey } from '../languages';

export function languageExtension(key: LanguageKey): Extension | undefined {
  switch (key) {
    case 'php':
      return php();
    case 'javascript':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'typescript':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'html':
      return html();
    case 'css':
      return css();
    case 'json':
      return json();
    case 'python':
      return python();
    case 'markdown':
      return markdown();
    case 'sql':
      return sql();
    case 'xml':
      return xml();
    case 'yaml':
      return yaml();
    case 'plaintext':
      return undefined;
  }
}
