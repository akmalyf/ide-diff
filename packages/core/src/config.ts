// Ported from com.intellij.util.diff.DiffConfig (JetBrains/intellij-community, Apache-2.0).

/** Use patience diff as the primary algorithm (IntelliJ default: false — Myers first, patience as fallback). */
export const USE_PATIENCE_ALG = false;
/** Use the greedy "magic wand" resolve instead of the simple one (IntelliJ default: false). */
export const USE_GREEDY_MERGE_MAGIC_RESOLVE = false;
/** Myers difference budget. */
export const DELTA_THRESHOLD_SIZE = 20000;
/** Do not try to compare lines by-word after that many prior failures. */
export const MAX_BAD_LINES = 3;
/** A line with <= this many non-whitespace chars is "unimportant". */
export const UNIMPORTANT_LINE_CHAR_COUNT = 3;
