// Ported from intellij-community platform/diff-impl/tests/.../comparison/ComparisonUtilTest.kt (JetBrains, Apache-2.0).
import { describe, expect, test } from 'vitest';
import { compareLines } from './comparisonManager';
import { isEqualTexts } from '../text/equality';
import { parseSource } from '../test/dsl';

function doTestTrim(expected: boolean, string1: string, string2: string): void {
  expect(isEqualTexts(string1, string2, 'TRIM_WHITESPACES'), `${JSON.stringify(string1)} vs ${JSON.stringify(string2)}`).toBe(expected);
}

function doTestLineFragment(
  string1: string, string2: string,
  offsets1: [number, number], offsets2: [number, number], lines1: [number, number], lines2: [number, number],
): void {
  const fragments = compareLines(parseSource(string1), parseSource(string2), 'DEFAULT');
  expect(fragments.length).toBe(1);
  const f = fragments[0];
  expect([f.startOffset1, f.endOffset1]).toEqual(offsets1);
  expect([f.startOffset2, f.endOffset2]).toEqual(offsets2);
  expect([f.startLine1, f.endLine1]).toEqual(lines1);
  expect([f.startLine2, f.endLine2]).toEqual(lines2);
}

describe('ComparisonUtilTest', () => {
  test('testTrimEquals', () => {
    doTestTrim(true, "", "")
    doTestTrim(true, "", "   ")
    doTestTrim(true, "   ", "   ")
    doTestTrim(true, "\n   ", "  \n")
    doTestTrim(true, "asd ", "asd  ")
    doTestTrim(true, "    asd", "asd")
    doTestTrim(true, "\n\n\n", "\n\n\n")
    doTestTrim(true, "\n  \n  \n ", "  \n \n\n  ")
    doTestTrim(false, "\n\n", "\n\n\n")

    doTestTrim(false, "\nasd ", "asd\n  ")
    doTestTrim(true, "\nasd \n", "\n asd\n  ")
    doTestTrim(false, "x", "y")
    doTestTrim(false, "\n", " ")

    doTestTrim(true, "\t ", "")
    doTestTrim(false, "", "\t\n \n\t")
    doTestTrim(false, "\t", "\n")

    doTestTrim(true, "x", " x")
    doTestTrim(true, "x", "x ")
    doTestTrim(false, "x\n", "x")

    doTestTrim(false, "abc", "a\nb\nc\n")
    doTestTrim(true, "\nx y x\n", "\nx y x\n")
    doTestTrim(false, "\nxyx\n", "\nx y x\n")
    doTestTrim(true, "\nx y x", "\nx y x")
    doTestTrim(false, "\nxyx", "\nx y x")
    doTestTrim(true, "x y x", "x y x")
    doTestTrim(false, "xyx", "x y x")
    doTestTrim(true, "  x y x  ", "x y x")

    doTestTrim(false, "x", "\t\n ")
    doTestTrim(false, "", " x ")
    doTestTrim(false, "", "x ")
    doTestTrim(false, "", " x")
    doTestTrim(false, "xyx", "xxx")
    doTestTrim(false, "xyx", "xYx")
  });

  test('testLineFragment', () => {
    doTestLineFragment(
      "", "x",
      [0, 0], [0, 1],
      [0, 1], [0, 1])

    doTestLineFragment(
      "x", "y",
      [0, 1], [0, 1],
      [0, 1], [0, 1])

    doTestLineFragment(
      "x_", "y_",
      [0, 2], [0, 2],
      [0, 1], [0, 1])

    doTestLineFragment(
      "x", "y_",
      [0, 1], [0, 2],
      [0, 1], [0, 2])

    doTestLineFragment(
      "x", "x_",
      [1, 1], [2, 2],
      [1, 1], [1, 2])

    doTestLineFragment(
      "x_y_z_", "x_Y_z_",
      [2, 4], [2, 4],
      [1, 2], [1, 2])

    doTestLineFragment(
      "x_y_z_", "x_y_Z_",
      [4, 6], [4, 6],
      [2, 3], [2, 3])

    doTestLineFragment(
      "x_y_z_", "x_y_Z_",
      [4, 6], [4, 6],
      [2, 3], [2, 3])

    doTestLineFragment(
      "x_y_z_", "x_y_Z",
      [4, 6], [4, 5],
      [2, 4], [2, 3])

    doTestLineFragment(
      "x_y_z", "x_y_Z_",
      [4, 5], [4, 6],
      [2, 3], [2, 4])

    doTestLineFragment(
      " ", "_ ",
      [0, 0], [0, 1],
      [0, 0], [0, 1])

    doTestLineFragment(
      " ", " _",
      [1, 1], [2, 2],
      [1, 1], [1, 2])
  });
});
