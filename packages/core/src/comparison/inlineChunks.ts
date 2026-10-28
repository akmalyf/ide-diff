// Ported from com.intellij.diff.comparison.ByWordRt.getInlineChunks / WordChunk / NewlineChunk
// (JetBrains/intellij-community, Apache-2.0).
import { charCount, codePointAt, isAlpha, isContinuousScript } from '../text/chars';

/**
 * A word (run of word-part code points, or a single continuous-script code point) or a newline.
 * Equality: words by exact content (DEFAULT), all newlines are equal. `key` encodes that equality.
 */
export interface InlineChunk {
  readonly offset1: number;
  readonly offset2: number;
  readonly newline: boolean;
  readonly key: string;
}

const NEWLINE_KEY = '\n'; // a word can never contain '\n'

export function getInlineChunks(text: string): InlineChunk[] {
  const chunks: InlineChunk[] = [];
  const len = text.length;
  let offset = 0;
  let wordStart = -1;
  while (offset < len) {
    const ch = codePointAt(text, offset);
    const count = charCount(ch);
    const alpha = isAlpha(ch);
    const isWordPart = alpha && !isContinuousScript(ch);
    if (isWordPart) {
      if (wordStart === -1) wordStart = offset;
    } else {
      if (wordStart !== -1) {
        chunks.push(word(text, wordStart, offset));
        wordStart = -1;
      }
      if (alpha) {
        // continuous script
        chunks.push(word(text, offset, offset + count));
      } else if (ch === 10) {
        chunks.push({ offset1: offset, offset2: offset + 1, newline: true, key: NEWLINE_KEY });
      }
    }
    offset += count;
  }
  if (wordStart !== -1) chunks.push(word(text, wordStart, len));
  return chunks;
}

function word(text: string, offset1: number, offset2: number): InlineChunk {
  return { offset1, offset2, newline: false, key: text.substring(offset1, offset2) };
}
