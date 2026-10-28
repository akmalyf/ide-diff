// Ported from com.intellij.diff.comparison.TrimUtil / CharacterUtils (JetBrains/intellij-community, Apache-2.0).

/** '\n', '\t' or ' ' (char code). Note: '\r' is NOT whitespace here. */
export function isSpaceEnterOrTab(c: number): boolean {
  return c === 10 || c === 9 || c === 32;
}

/** Same as {@link isSpaceEnterOrTab}, checked on a char of a string. */
export function isWs(text: string, index: number): boolean {
  const c = text.charCodeAt(index);
  return c === 10 || c === 9 || c === 32;
}

export function isWhiteSpaceCodePoint(c: number): boolean {
  return c < 128 && isSpaceEnterOrTab(c);
}

export function isPunctuation(b: number): boolean {
  if (b === 95) return false; // exclude '_'
  return (
    (b >= 33 && b <= 47) || // !"#$%&'()*+,-./
    (b >= 58 && b <= 64) || // :;<=>?@
    (b >= 91 && b <= 96) || // [\]^_`
    (b >= 123 && b <= 126) // {|}~
  );
}

export function isAlpha(c: number): boolean {
  if (isWhiteSpaceCodePoint(c)) return false;
  return !isPunctuation(c);
}

const RE_DECIMAL = /^\p{Nd}$/u;
const RE_IDEOGRAPHIC = /^\p{Ideographic}$/u;
const RE_ALPHABETIC = /^\p{Alphabetic}$/u;
const RE_SCRIPTS = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Javanese}]$/u;

const continuousCache = new Map<number, boolean>();

export function isContinuousScript(c: number): boolean {
  if (c < 128) return false;
  const cached = continuousCache.get(c);
  if (cached !== undefined) return cached;
  const result = computeContinuousScript(c);
  if (continuousCache.size < 65536) continuousCache.set(c, result);
  return result;
}

function computeContinuousScript(c: number): boolean {
  const s = String.fromCodePoint(c);
  if (RE_DECIMAL.test(s)) return false;
  if (c > 0xffff) return true;
  if (RE_IDEOGRAPHIC.test(s)) return true;
  if (!RE_ALPHABETIC.test(s)) return true;
  return RE_SCRIPTS.test(s);
}

/** Kotlin CharSequence.codePointAt: combines a valid surrogate pair, otherwise returns the char code. */
export function codePointAt(text: string, index: number): number {
  return text.codePointAt(index)!;
}

export function charCount(cp: number): number {
  return cp >= 0x10000 ? 2 : 1;
}
