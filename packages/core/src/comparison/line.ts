// Ported from com.intellij.diff.comparison.ByLineRt.Line (JetBrains/intellij-community, Apache-2.0).
import type { ComparisonPolicy } from '../types';
import { isWs } from '../text/chars';
import { keyOf } from '../text/equality';

/** A line compared under `policy`; two lines are equal iff their `key`s are equal. */
export class Line {
  readonly key: string;
  readonly nonSpaceChars: number;

  constructor(
    readonly content: string,
    readonly policy: ComparisonPolicy,
  ) {
    this.key = keyOf(content, policy);
    let nonSpace = 0;
    for (let i = 0; i < content.length; i++) if (!isWs(content, i)) nonSpace++;
    this.nonSpaceChars = nonSpace;
  }

  withPolicy(policy: ComparisonPolicy): Line {
    return policy === this.policy ? this : new Line(this.content, policy);
  }
}
