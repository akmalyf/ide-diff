// Ported from intellij-community platform/diff-impl/tests/.../comparison/TrimUtilTest.kt (JetBrains, Apache-2.0).
import { describe, expect, test } from 'vitest';
import { isAlpha, isContinuousScript, isPunctuation } from './chars';
import { chMan, chSmile } from '../test/dsl';

const PUNCTUATION = "(){}[],./?`~!@#$%^&*-=+|\\;:'\"<>";

function codePoints(text: string): number[] {
  return [...text].map((c) => c.codePointAt(0)!);
}

describe('TrimUtilTest', () => {
  test('testPunctuation', () => {
    for (let c = 0; c <= 0xffff; c++) {
      expect(isPunctuation(c), `'${String.fromCharCode(c)}' - ${c}`).toBe(PUNCTUATION.includes(String.fromCharCode(c)));
    }
  });

  test('testAlphaNumeric', () => {
    const assertIsAlpha = (text: string, expected: boolean): void => {
      for (const cp of codePoints(text)) expect(isAlpha(cp), `${cp}`).toBe(expected);
    };
    assertIsAlpha('!? \t\n+~', false);
    assertIsAlpha('AB12', true);
    assertIsAlpha('АБВ汉语日ひรไ', true);
    assertIsAlpha('óèäñĀ', true);
    assertIsAlpha('\r_\u0001', true);
    assertIsAlpha(`${chSmile}${chMan}`, true);
  });

  test('testContinuousScript', () => {
    const assertIsContinuous = (text: string, expected: boolean): void => {
      for (const cp of codePoints(text)) expect(isContinuousScript(cp), `${cp}`).toBe(expected);
    };
    assertIsContinuous('12_ABZ', false);
    assertIsContinuous('АБВ', false);
    assertIsContinuous('ʁit', false);
    assertIsContinuous('음훈', false);
    assertIsContinuous('óèäñĀ', false);
    assertIsContinuous('\r_\u0001', false);
    assertIsContinuous('象形文字', true);
    assertIsContinuous('อักษรไ', true);
    assertIsContinuous('ひらがなカタカナ日本語', true);
    assertIsContinuous('汉语漢語', true);
    assertIsContinuous('☺♥', true);
    assertIsContinuous(`${chSmile}${chMan}`, true);
    assertIsContinuous('‎‏؜', true);
  });
});
