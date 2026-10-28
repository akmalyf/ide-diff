# @ide-diff/core — porting spec for IntelliJ's diff algorithms

Source: JetBrains/intellij-community (Apache-2.0), sparse clone at
`$IJ = /private/tmp/claude-501/-Users-akmal-Agent-diff-editor/ad0deb11-8363-432b-86ae-2bd930611d14/scratchpad/ij`.

| Area | IntelliJ path |
| --- | --- |
| Algorithms (KMP, pure) | `$IJ/platform/util/diff/src/com/intellij/diff/comparison/**`, `.../diff/util/*`, `.../diff/fragments/*`, `.../diff/tools/util/text/LineOffsets*.kt` |
| LCS engine | `$IJ/platform/util/diff/src/com/intellij/util/diff/{Diff,Reindexer,MyersLCS,PatienceIntLCS,UniqueLCS,BitSet,DiffConfig}.kt`, `.../diff/util/Enumerator.kt` |
| String helpers | `platform/util/base/multiplatform/src/com/intellij/openapi/util/text/StringsKmp.kt`. It is not in the sparse checkout. I pulled a copy with `git show` to `.../scratchpad/StringsKmp.kt`. |
| Orchestration (JVM) | `$IJ/platform/diff-impl/src/com/intellij/diff/comparison/ComparisonManagerImpl.java`, `tools/util/text/{SimpleTextDiffProvider,TwosideTextDiffProviderBase,SimpleThreesideTextDiffProvider}.java`, `tools/util/base/{IgnorePolicy,HighlightPolicy}.java`, `util/DiffUtil.java` (`getLineDiffType`, `compareThreesideInner`), `merge/MergeDiffBuilder.kt` |
| Tests | `$IJ/platform/diff-impl/tests/testSrc/com/intellij/diff/comparison/*.kt`, `../DiffTestCase.kt`, `../HeavyDiffTestCase.kt` |

All `ByLine`, `ByWord` and `DiffIterableUtilEx` classes in diff-impl are thin wrappers that turn a `ProgressIndicator` into a
`CancellationChecker`. The real code lives in the `*Rt` Kotlin objects. **Ignore cancellation in the port.** Use a
no-op checker, or drop the parameter entirely.

All text handling assumes **`\n` line separators only**. IntelliJ documents are always LF-normalised, and CM6 does the same.
"Whitespace" almost always means exactly `' '`, `'\t'` and `'\n'`. Note that **`\r` is NOT whitespace**: it counts as an
alphanumeric "word" char.

---

## 0. Constants (`com.intellij.util.diff.DiffConfig`)

| Constant | Value | Used by |
| --- | --- | --- |
| `USE_PATIENCE_ALG` | `false` | `Diff.doBuildChanges`: try Myers first, then fall back to patience |
| `USE_GREEDY_MERGE_MAGIC_RESOLVE` | `false` | `ComparisonMergeUtil.tryResolveConflict` uses `MergeResolveUtil.tryResolve` (simple) |
| `DELTA_THRESHOLD_SIZE` | `20000` | Myers difference budget (see §2.4) |
| `MAX_BAD_LINES` | `3` | after 3 `DiffTooBigException`s while computing inner fragments, stop trying for later fragments |
| `UNIMPORTANT_LINE_CHAR_COUNT` | `3` | a line with `<= 3` non-whitespace chars is "unimportant" (`{`, `}`, `*/`, empty line…) |
| registry `diff.by.word.deprioritize.line.differences` | `false` | `compareLinesWordFirst` / `LineUplifter` are off by default. **Optional to port.** |
| `ByLineRt.alignExactMatching` brute force limit | `n > 10` | skip the C(n,k) search |

---

## 1. Shared primitives

### 1.1 Character classes (`TrimUtil.kt`, `CharacterUtils.kt`)

```text
isSpaceEnterOrTab(ch)     = ch == '\n' || ch == '\t' || ch == ' '
isWhiteSpaceCodePoint(c)  = c < 128 && isSpaceEnterOrTab(c)
isPunctuation(c)          = c != 95 /* '_' */ && (33..47 || 58..64 || 91..96 || 123..126)
                            // i.e. ASCII  !"#$%&'()*+,-./  :;<=>?@  [\]^`  {|}~   ('_' excluded!)
isAlpha(c)                = !isWhiteSpaceCodePoint(c) && !isPunctuation(c)   // so '\r', '_', digits, control chars, emoji are "alpha"
isContinuousScript(c):
   if c < 128                 -> false
   if isDecimalDigit(c)       -> false          // Unicode Nd
   if c > 0xFFFF (non-BMP)    -> true           // emoji, CJK ext. B…
   if isIdeographic(c)        -> true
   if !isAlphabetic(c)        -> true           // symbols ☺♥, format chars ‎ ‏ ؜ …
   return Hiragana || Katakana || Thai || Javanese (Script property)
```

TS mapping: use precompiled Unicode property regexes on `String.fromCodePoint(c)`, with a fast path for `c < 128`:
`\p{Nd}`, `\p{Ideographic}`, `\p{Alphabetic}`, `\p{Script=Hiragana}`, `\p{Script=Katakana}`, `\p{Script=Thai}`,
`\p{Script=Javanese}`. These match Java's `Character.isAlphabetic` (L* + Nl + Other_Alphabetic) and the Unicode 16 tables
copied into `CharacterUtils.kt`. Small differences between Unicode versions are acceptable. If byte-exact behaviour is
ever needed, copy the range tables from `CharacterUtils.kt` and use the same binary search.

Code points: Kotlin's `codePointAt(index)` combines a high and low surrogate pair, and `charCount = cp >= 0x10000 ? 2 : 1`.
JS `String.prototype.codePointAt` behaves the same way.

### 1.2 String equality and hashing (`ComparisonUtil.kt` + `StringsKmp.kt`)

`ComparisonUtil.isEquals(a, b, policy)` is used for *single* sequences such as lines and words:
- `DEFAULT`: exact equality.
- `TRIM_WHITESPACES`: strip `[ \t\n]` at both ends, then exact equality.
- `IGNORE_WHITESPACES`: `equalsIgnoreWhitespaces`. It is equivalent to comparing after removing every `[ \t\n]`, and the hash
  is computed the same way.

`ComparisonUtil.isEqualTexts(a, b, policy)` is used for *multi-line* texts. It is identical, except for `TRIM_WHITESPACES`,
which uses `ComparisonUtil.equalsTrimWhitespaces`. That function splits both texts on `'\n'` (the newline stays part of the
line), requires the same number of lines (`lastLine1 xor lastLine2 -> false`), and compares line-by-line with
trim-equality. So `"\nXY\n"` equals `"\n XY \n"`, but `"x\n"` does not equal `"x"`. See `ComparisonUtilTest.testTrimEquals`.

**TS recommendation:** the LCS engine needs equality plus hashing (`Enumerator` uses a HashMap). Replace this with a
*canonical string key* per element:

```ts
keyOf(line, 'DEFAULT')            = line
keyOf(line, 'TRIM_WHITESPACES')   = line.replace(/^[ \t\n]+|[ \t\n]+$/g, '')
keyOf(line, 'IGNORE_WHITESPACES') = line.replace(/[ \t\n]+/g, '')
```

Two lines are `Line.equals` under a policy if and only if their keys are equal. The Java hash values (`31*h + c`) never
leave the algorithm, so they do not need to be reproduced.

### 1.3 Ranges

- `Range(start1, end1, start2, end2)`: half-open on both sides. `isEmpty = start1==end1 && start2==end2`.
- `MergeRange(start1,end1, start2,end2, start3,end3)`, where **1 = left, 2 = base, 3 = right**. It is empty when all three
  are empty.
- `MergeLineFragmentImpl(MergeRange)` maps directly: `startLine[LEFT]=start1`, `[BASE]=start2`, `[RIGHT]=start3`.
- `DiffFragmentImpl` requires a non-empty and valid fragment.
- `LineFragmentImpl` requires non-empty lines. **Its constructor calls `dropWholeChangedFragments`:** when `innerFragments`
  has exactly one element that covers `[0,len1)`×`[0,len2)` of the fragment, it is replaced by `null`. Implement this in a
  single factory `createLineFragment(...)` and always construct through it.

### 1.4 Line offsets (`LineOffsetsImpl.kt`, `DiffRangeUtil.kt`)

- `LineOffsetsImpl.create(text)` stores `lineEnds[]`, the index of each `'\n'`, plus a final entry `text.length`.
  - `lineCount = lineEnds.length`. `""` has 1 line. `"a\n"` has 2 lines; the last one is empty.
  - `getLineStart(l) = l==0 ? 0 : lineEnds[l-1]+1`
  - `getLineEnd(l) = lineEnds[l]`, which excludes the newline.
  - `getLineEnd(l, includeNewline) = lineEnds[l] + (includeNewline && l != lineCount-1 ? 1 : 0)`
  - `getLineNumber(offset)`: binary search over `lineEnds`. An `offset` equal to `textLength` returns `lineCount-1`.
- `DiffRangeUtil.getLinesRange(lo, line1, line2, includeNewline)`:
  - if `line1==line2`: returns `start = line1 < lineCount ? lineStart(line1) : textLength` (an empty range)
  - otherwise `[lineStart(line1), lineEnd(line2-1) (+1 if includeNewline && < textLength))`
- `getLinesContent(text, lo, l1, l2)` is the same as `getLinesRange(…, includeNewline = false)`, i.e. **without** the
  trailing newline. The merge code uses it.
- The contract's `lineOffsets(text): number[]` (line *start* offsets) is a separate public helper. Internally, keep the
  `LineOffsets` class shaped like IntelliJ's.

### 1.5 DiffIterable model (`iterables/*`, `DiffIterableUtil.kt`)

A `DiffIterable` has `length1`, `length2`, `changes(): Iterator<Range>` and `unchanged(): Iterator<Range>`. Ranges are
sorted and do not overlap. They are **not** guaranteed to be squashed: two changes may touch each other.
A **FairDiffIterable** is one whose unchanged ranges always satisfy `end1-start1 == end2-start2`. In Kotlin it is only a
marker interface. In TS use a branded type, or simply document it.

Implementations to port:

- **`ChangeDiffIterableBase`**. The derived *unchanged* iterator needs care, because it is used everywhere:
  ```text
  lastIndex1 = lastIndex2 = 0
  if first change exists and starts at (0,0): lastIndex = its end; advance
  next(): if a change remains: yield Range(lastIndex1, ch.start1, lastIndex2, ch.start2); lastIndex = ch.end; advance
          else (only while lastIndex != (length1,length2)): yield Range(lastIndex1, length1, lastIndex2, length2); lastIndex = lengths
  ```
  If two changes touch, it yields an empty unchanged range. Callers loop with `count = end1-start1`, so an empty range is
  harmless. Port the logic verbatim.
- `RangesDiffIterable(changes: Range[], l1, l2)`: `DiffIterableUtil.create(ranges, l1, l2)`.
- `InvertedDiffIterableWrapper`: swaps `changes` and `unchanged`. `createUnchanged(ranges, l1, l2) = invert(create(ranges, l1, l2))`.
- `SubiterableDiffIterable(changed: Range[], start1, end1, start2, end2, firstIndex)` is a window onto a list of changes,
  re-based to `(start1, start2)`. Its `next()` works like this: skip a range when `r.end1 < start1 || r.end2 < start2`; stop
  when `r.start1 > end1 || r.start2 > end2`; otherwise clip it to the window, subtract the window start, and skip it if the
  result is empty.
- `DiffChangeDiffIterable(Diff.Change list)`: each `Change(line0, line1, deleted, inserted)` becomes
  `Range(line0, line0+deleted, line1, line1+inserted)`.
- `DiffIterableUtil.iterateAll(it)` yields `[range, isEqual]` pairs that alternate and together cover everything. It starts
  with the unchanged prefix (if any), then alternates change and following gap, and skips empty gaps.
- `verify*` is test-only. Implement it behind a flag so the Vitest port can turn it on. The checks are: every range is
  valid and non-empty; the ranges fully cover both sides; equal and changed ranges alternate; in a fair iterable, unchanged
  ranges have equal lengths.

**ChangeBuilder** (`DiffIterableUtil.ChangeBuilderBase` / `ChangeBuilder`), the most important helper:

```text
state: index1 = index2 = 0; changes = []
markEqual(i1, i2)              = markEqual(i1, i2, i1+1, i2+1)
markEqual(i1, i2, count)       = markEqual(i1, i2, i1+count, i2+count)
markEqual(i1, i2, end1, end2):
    if i1==end1 && i2==end2: return                     // zero-length: no-op (IMPORTANT, keeps changes un-split)
    assert index1<=i1, index2<=i2, i1<=end1, i2<=end2
    if (index1,index2) != (i1,i2): addChange(index1, index2, i1, i2)
    index1 = end1; index2 = end2
finish(): if (index1,index2) != (length1,length2): addChange(index1, index2, length1, length2)
          return create(changes, length1, length2)
```

`ExpandChangeBuilder(objects1, objects2)` overrides `addChange`. It first calls `expand` on the range, which strips equal
elements from both edges using the elements' `equals`, and adds the range only if the result is non-empty.

### 1.6 TrimUtil (`TrimUtil.kt`)

These are generic over index-based predicates. Port all of them with closures. For hot paths (char loops), inlining by
hand is optional.

- `trimStart(start,end,ignored)` / `trimEnd`: skip ignored indices from the front or the back.
- `trim(text, start, end)` returns an `IntPair`, using `isSpaceEnterOrTab`. `trim(text1, text2, range)` trims each side
  independently.
- `expandForward(start1,start2,end1,end2,equals)` counts equal pairs walking forward. `expandBackward` walks backward and
  returns a count. `expand` runs forward first, then backward on the remainder, and returns the shrunk `Range`. There are
  overloads for lists (element equality) and for strings (char equality).
- `expandIgnoredForward/Backward(…, equals, ignored1)`: same as above, but a step happens only when `equals(i1,i2) &&
  ignored1(i1)`. With `ignored = isSpaceEnterOrTab` this gives `expandWhitespaces*`, which consumes *equal whitespace*
  chars only. There are 3-way variants (`equals12`, `equals13`, `ignored1`).
- `trimExpand(start1,start2,end1,end2, equals, ignored1, ignored2)`: walks forward while either `equals(i1,i2)` holds
  (advance both) or at least one side is ignored (advance each ignored side). Then `trimStart` both sides. It does the
  same backward. It is used only by `compareLinesWithIgnoredRanges` (not needed) and is exported as `trimExpandRange`.
- `isEquals(text1,text2,range)` uses `isEqualTexts(sub1, sub2, DEFAULT)`. `isEqualsIgnoreWhitespaces` uses `IGNORE`. There
  are 3-way variants that compare base against left **and** base against right.

---

## 2. The LCS engine (`com.intellij.util.diff`)

Entry point: `DiffIterableUtil.diff(objects1, objects2)`, which calls `Diff.buildChanges(T[] , T[])` and returns
`fair(create(change, n1, n2))`. If `FilesTooBigForDiffException` is thrown, it is rethrown as `DiffTooBigException`
(TS: `DiffTooBigError`).

TS API suggestion: `diffKeys(keys1: string[], keys2: string[]): FairDiffIterable` and `diffInts(a: Int32Array, b: Int32Array)`.
Callers map their objects to keys (§1.2). Code points are already ints.

### 2.1 `Diff.buildChanges(objects1, objects2)`

```text
startShift = length of common prefix (by equals)
endCut     = length of common suffix, computed AFTER the prefix (size = min(n1,n2) - startShift)
trimmed1 = n1 - startShift - endCut; trimmed2 = n2 - startShift - endCut
if trimmed1 == 0 || trimmed2 == 0:                          // doBuildChangesFast
    return (trimmed1==0 && trimmed2==0) ? null
         : single Change(startShift, startShift, trimmed1, trimmed2)
ints = Enumerator: map each distinct object to 1,2,3… (null -> 0), only for the trimmed middle
return doBuildChanges(ints1, ints2, ChangeBuilder(startShift))
```

`Diff.ChangeBuilder(startShift)` (an LCSBuilder, *not* the DiffIterable one) starts at `index = startShift`.
`addEqual(n)` skips `n` on both sides. `addChange(d, i)` appends `Change(index1, index2, d, i)` and then skips. It
produces a linked list (TS: an array of `Range`).

`doBuildChanges(ints1, ints2, builder)`:

```text
reindexer = Reindexer(); [d1, d2] = reindexer.discardUnique(ints1, ints2)
if d1.empty && d2.empty: builder.addChange(ints1.size, ints2.size); return
try   { lcs = MyersLCS(d1, d2); lcs.executeWithThreshold(); changes = lcs.changes }
catch (FilesTooBig) { p = PatienceIntLCS(d1, d2); p.execute(failOnSmallReduction = true); changes = p.changes }  // may throw -> DiffTooBig
reindexer.reindex(changes, builder)
```

### 2.2 `Reindexer`

- `discardUnique(ints1, ints2)`: `d1` = the elements of `ints1` that occur somewhere in `ints2` (sorted copy plus binary
  search; a `Set` works in TS). `d2` = the elements of `ints2` that occur in `d1`. For each side it remembers `oldIndices[]`
  (the positions in the original array), the original lengths and the discarded lengths.
- `reindex(discardedChanges: [bits1, bits2], builder)`:
  1. If nothing was discarded on either side, use the bitsets as they are.
  2. Otherwise build `changes1`/`changes2` over the original lengths. Walk `x` over `d1` and `y` over `d2`:
     - `x<len(d1) && y<len(d2) && !bits1[x] && !bits2[y]`: both are matched. `x = increment(oldIdx1, x, changes1, origLen1)`,
       and the same for `y`. `increment` marks the gap of discarded originals after `oldIdx[i]` (up to the next kept index,
       or to `origLen`) as changed, and returns `i+1`.
     - `else if bits1[x]`: `changes1[old1[x]] = true; x = increment(...)`
     - `else if bits2[y]`: the same for side 2.

     Bitset reads past the end return `false`. With `Uint8Array`, `undefined` is falsy, so this works.

     Then mark the leading discarded prefix as changed: `changes1.set(0, d1.empty ? origLen1 : old1[0])`, and the same for
     side 2.
  3. Emit through the builder by walking both bitsets in lock-step. Let `eq` = the run where both are unchanged; call
     `addEqual(eq)`. Then `dx` = the run of `changes1` and `dy` = the run of `changes2`; call `addChange(dx, dy)` if
     either is non-zero. After the loop, if either side has elements left, `addChange(rest1, rest2)`.

### 2.3 `MyersLCS(first, second, start1, count1, start2, count2, changes1, changes2)`

This is Myers' O(ND) linear-space bidirectional "middle snake" algorithm. **Port it verbatim**, including the odd index
arithmetic. Tests check exact outputs, and a different LCS tie-break changes the results.

- On construction, mark `[start, start+count)` as changed on both sides. `VForward`/`VBackward` are `Int32Array(count1+count2+1)`.
- `executeWithThreshold()`: `threshold = max(20000 + 10*floor(sqrt(count1+count2)), DELTA_THRESHOLD_SIZE /*20000*/)`. Calls
  `execute(threshold, throwException = true)`.
- `executeLinear()`, used by the patience fallback: `threshold = 20000 + 10*sqrt(n)`, with `throwException = false`.
- `execute(threshold, throw)`: returns if `count1==0 || count2==0`. Otherwise calls
  `execute(0, count1, 0, count2, min(threshold, count1+count2), throw)`.
- The recursive `execute(oldStart, oldEnd, newStart, newEnd, differenceEstimate, throwException)`: copy the Kotlin loop
  exactly (the `L`/`R` bounds use `(d xor len) and 1`, and the forward/backward snakes use
  `commonSubsequenceLengthForward/Backward` with their `maxLength` clamps). If it finds `td > 1`, it recurses on both
  halves with estimates `oldDiff = (td+1)/2` and `td - oldDiff`. If `td` is 0 or 1, it does a greedy walk: take a common
  run if there is one, otherwise advance the longer side. If `td == -1` (budget exhausted) it throws when `throwException`
  is set, and otherwise leaves the range as "all changed".
- `addUnchanged(s1, s2, count)` clears bits in `changes1`/`changes2` at `start + s`.

### 2.4 `PatienceIntLCS` + `UniqueLCS` (fallback for large inputs)

`execute(failOnSmallReduction)` uses `thresholdCheckCounter = fail ? 2 : -1`. The recursive
`execute(s1, c1, s2, c2, counter)`:

1. If both counts are 0, return. If either count is 0, `addChange` (mark both ranges as changed) and return.
2. Strip the common prefix and suffix. If either side is now empty, `addChange` and return.
3. If `counter == 0`, call `checkReduction(c1, c2)`. It **throws** unless `c1*2 < totalCount1 || c2*2 < totalCount2`, i.e.
   the sub-problem must be less than half the original on some side. Then `counter = max(-1, counter-1)`.
4. `UniqueLCS(...).execute()`: elements unique on both sides are matched, followed by a longest increasing subsequence
   (patience sorting with a binary search). It returns `[idx1[], idx2[]]` relative to the window, or `null` if there are no
   unique common elements.
   - On `null`: if `counter >= 0`, `checkReduction`. Then run `MyersLCS(window).executeLinear()` on the shared bitsets.
   - Otherwise recurse on the gap before the first match, every gap between matches (only when some count is > 0), and
     the tail. For the tail: if the last match is at `count-1`, use `s = count-1, c = 0`; otherwise `s = last+1, c = count - s`.

`UniqueLCS.execute` details: `map[value] = (i+1)` the first time a value is seen in side 1, and `-1` when it is seen again.
On side 2, a value with a positive map entry sets `match[i1] = i2+1` the first time (`count++`). The second time it resets
`match` to 0, sets the map to `-1` and does `count--`. The LIS runs over `match[]` with `sequence`, `lastElement` and
`predecessor` arrays. `binarySearch` returns the insertion point.

**Too-big behaviour, end to end:** when Myers exceeds its budget, patience runs with the reduction check. If patience
cannot reduce the problem, the result is `DiffTooBigException`. In practice this only happens on huge, very different
inputs.

---

## 3. ByChar (`ByCharRt.kt`)

Every function compares two `CharSequence`s and returns offsets in UTF-16 code units, but the diff itself runs over
**code points**.

### 3.1 `compare(text1, text2)`: raw char diff (FairDiffIterable)

`cp1 = all code points`, `cp2 = all code points`, then `iterable = diff(cp1, cp2)`. Walk `iterateAll(iterable)` and
convert the code point counts back to char counts (`countChars`). Call `builder.markEqual(offset1, offset2, end1, end2)`
for equal ranges. Return `fair(builder.finish())`.

### 3.2 `compareTwoStep(text1, text2)`: used for `BY_CHAR` with the DEFAULT policy

1. `getNonSpaceCodePoints`: the code points with `!isWhiteSpaceCodePoint`, plus their char offsets (`CodePointsOffsets`
   with `charOffset(i)` and `charOffsetAfter(i) = offset + charCount`).
2. `diff(nonSpace1.codePoints, nonSpace2.codePoints)`.
3. `DefaultCharChangeCorrector` (a `ChangeCorrector`, §3.5) maps it back onto the full text. For every matched
   non-space code point pair, the gap since the previous match is compared with **`ByCharRt.compare` (raw)**. Its
   unchanged runs are marked equal at `start + chunk.start`. Then the code point's own char range is marked equal. The
   tail gap is handled at the end.

### 3.3 `compareTrimWhitespaces` = `compareTwoStep` followed by `ByWordRt.TrimSpacesCorrector` (§4.6). The result is a plain DiffIterable.

### 3.4 `compareIgnoreWhitespaces(text1, text2)`

1. Diff the non-space code points as in §3.2.
2. `matchAdjustmentSpacesIW`. For each **changed** range `ch` in non-space indices:
   - If side 1 is non-empty: `[charOffset(ch.start1), charOffsetAfter(ch.end1-1))`.
   - If side 1 is empty: the insertion point is `expandForwardW(...)`. Let
     `offset1 = ch.start1==0 ? 0 : charOffsetAfter(ch.start1-1)`, with the same formula for `offset2`. Starting there,
     count equal whitespace chars forward in both texts (`expandWhitespacesForward(text1, text2, offset1, offset2, len1, len2)`).
     The point is `offset(side) + count`. The comment's example: `"x y" -> "x zy"` keeps the space matched.
   - The same logic applies to side 2.
3. `DiffIterableUtil.create(ranges, len1, len2)`. This result is **not fair**, so whitespace may be unbalanced.

### 3.5 `comparePunctuation(text1, text2)` (used by the word diff)

`getPunctuationChars` collects `isPunctuation` chars (always 1 UTF-16 char each) and their offsets. They are diffed, and
`transferPunctuation` marks each matched punctuation char equal with `builder.markEqual(off1, off2)`, i.e. one char.
**Every non-punctuation char stays unmatched (changed).** Returns `fair(builder.finish())`.

`ChangeCorrector` base (`ChangeCorrector.kt`):

```text
last1 = last2 = 0
for ch in changes.iterateUnchanged(): for i in 0 until count:
    [s1,e1] = getOriginalRange1(ch.start1+i); [s2,e2] = getOriginalRange2(ch.start2+i)
    matchGap(last1, s1, last2, s2); builder.markEqual(s1, s2, e1, e2); last = (e1,e2)
matchGap(last1, length1, last2, length2)
return fair(builder.finish())
```

---

## 4. ByWord (`ByWordRt.kt`): inner (word) highlighting

### 4.1 Tokenizer: `getInlineChunks(text)`

Scan by code point:
- `isWordPart = isAlpha(cp) && !isContinuousScript(cp)`. Runs of word parts form a single `WordChunk(offset1, offset2)`.
- `isAlpha && isContinuousScript` (CJK, Thai, emoji, symbols…): the code point is a **single-cp WordChunk** of its own.
- `cp == '\n'`: `NewlineChunk(offset)`, with `offset2 = offset+1`.
- Anything else (`' '`, `'\t'`, ASCII punctuation) produces no chunk. These are the "gaps".

Equality: two `WordChunk`s are equal when their **content is exactly equal** (DEFAULT policy, whatever the comparison
policy is). All `NewlineChunk`s are equal to each other. TS key: `word.content`; for newlines use the key `"\n"`. That is
safe because a word can never contain `'\n'`.

### 4.2 `compare(text1, text2, policy)`: `ComparisonManager.compareWords`

```text
words1, words2 = getInlineChunks
wordChanges   = diff(words1, words2)                                  // §2
wordChanges   = WordChunkOptimizer(words1, words2, text1, text2, wordChanges).build()   // §4.3
delimiters    = AdjustmentPunctuationMatcher(text1, text2, words1, words2, 0, 0, wordChanges).build()  // §4.4 -> fair, char offsets
iterable      = matchAdjustmentWhitespaces(text1, text2, delimiters, policy)   // §4.6
return iterable.changes -> DiffFragment[]
```

### 4.3 `ChunkOptimizer` (generic) and `WordChunkOptimizer` / `LineChunkOptimizer` (`ChunkOptimizer.kt`)

Generic `build()`. It pushes each *unchanged* range onto a stack and calls `processLastRanges()` after each push. At the
end it returns `fair(createUnchanged(ranges, n1, n2))`.

```text
processLastRanges():
  if ranges.size < 2: return
  r1 = ranges[-2]; r2 = ranges[-1]
  if r1.end1 != r2.start1 && r1.end2 != r2.start2: return       // change between them is not a pure insert/delete
  count1 = r1.length; count2 = r2.length
  equalForward  = expandForward (data1, data2, r1.end1, r1.end2, r1.end1+count2, r1.end2+count2)
  equalBackward = expandBackward(data1, data2, r2.start1-count1, r2.start2-count1, r2.start1, r2.start2)
  if both 0: return
  if equalForward == count2:   // [A]B[B] -> [AB]B : slide the insertion to the end, merge the two equal ranges
      pop 2; push Range(r1.start1, r1.end1+count2, r1.start2, r1.end2+count2); processLastRanges(); return
  if equalBackward == count1:  // [A]A[B] -> A[AB]
      pop 2; push Range(r2.start1-count1, r2.end1, r2.start2-count1, r2.end2); processLastRanges(); return
  touchSide = (r1.end1 == r2.start1) ? LEFT : RIGHT       // the side on which the change is empty
  shift = getShift(touchSide, equalForward, equalBackward, r1, r2)
  if shift != 0: pop 2; push Range(r1.start1, r1.end1+shift, r1.start2, r1.end2+shift)
                        push Range(r2.start1+shift, r2.end1, r2.start2+shift, r2.end2)
```

`expandForward`/`expandBackward` use element equality on `data` (words, or `Line`s under their own policy).

**WordChunkOptimizer.getShift.** The goal is to minimise the number of modified "sentences", i.e. runs of words not
separated by whitespace.
- Let `touchWords`/`touchText` be the touch side's words and text, and `touchStart = touchSide.select(r2.start1, r2.start2)`.
- If `isSeparatedWithWhitespace(touchText, words[touchStart-1], words[touchStart])`, return 0. Two words are separated
  when either one is a `NewlineChunk`, or when any char in `[w1.offset2, w2.offset1)` is a space, tab or newline.
- `left = findSequenceEdgeShift(text, words, touchStart, equalForward, leftToRight=true)`. For `i in 0 until count` it
  checks the pair `(words[off+i], words[off+i+1])` and returns `i+1` at the first separated pair, or `-1`. If `left > 0`,
  return `left`.
- `right = findSequenceEdgeShift(text, words, touchStart-1, equalBackward, false)`, which checks the pairs
  `(words[off-i-1], words[off-i])`. If `right > 0`, return `-right`. Otherwise return 0.

**LineChunkOptimizer.getShift.** The goal is to put insertions and deletions next to empty or unimportant lines. It tries
four strategies in order and returns the first non-null result:
1. `getUnchangedBoundaryShift(threshold = 0)`
2. `getChangedBoundaryShift(threshold = 0)`
3. `getUnchangedBoundaryShift(threshold = 3)`
4. `getChangedBoundaryShift(threshold = 3)`
5. `0`

```text
UnchangedBoundary: lines = touchSide data; touchStart = touchSide.select(r2.start1, r2.start2)
   fwd = findNextUnimportantLine(lines, touchStart,   equalForward+1,  threshold)   // first i in [0,count) with lines[off+i].nonSpaceChars <= threshold, else -1
   bwd = findPrevUnimportantLine(lines, touchStart-1, equalBackward+1, threshold)   // lines[off-i]
ChangedBoundary:   lines = OTHER side data; changeStart = other.select(r1.end1, r1.end2); changeEnd = other.select(r2.start1, r2.start2)
   fwd = findNextUnimportantLine(lines, changeStart, equalForward+1, threshold)
   bwd = findPrevUnimportantLine(lines, changeEnd-1, equalBackward+1, threshold)
getShift(fwd, bwd): null if both -1; 0 if either == 0; else (fwd != -1 ? fwd : -bwd)
```

`nonSpaceChars` counts the chars that are not `isSpaceEnterOrTab`. **Edge case:** `findNext`/`findPrev` with `count+1`
may read one index past `equalForward`. Port it as-is: the indices stay in bounds because of how the ranges are built.

### 4.4 `AdjustmentPunctuationMatcher`

This step matches punctuation in the gaps around matched words, so that `foo(a, b)` vs `foo(a, c)` keeps `(`, `,` and
`)` matched. Example from the source: `"[ X { A ! B } Y ]"` vs `"( X ... Y )"` compares `[` with `(`, `{`+`}` with
`...`, and `]` with `)`.

The output is a fair iterable over **chars**, built with `ChangeBuilder(len1, len2)`. Word offsets are shifted by
`startShift1/2`, which is non-zero only in `compareAndSplit` sub-blocks.

```text
gapBefore(i) on side k = [ i==0 ? 0 : end(word[i-1]),  i==size ? len : start(word[i]) )
gapAfter(i)            = [ i==-1 ? 0 : end(word[i]),   i+1==size ? len : start(word[i+1]) )

execute():
  clearLast(); matchForward(-1,-1)                // remember gapAfter(-1) on both sides as "last"
  for each matched word pair (i1,i2) in wordChanges.iterateUnchanged():
      matchBackward(i1,i2)                        // see below; then clearLast()
      builder.markEqual(start1(i1), start2(i2), end1(i1), end2(i2))   // the word itself
      matchForward(i1,i2)                         // remember gapAfter(i1)/gapAfter(i2)
  matchBackward(size1, size2)

matchBackward(start1,start2,end1,end2 = gapBefore on both sides), with last = (lastStart*, lastEnd*):
  if lastStart1==start1 && lastStart2==start2:      // previous matched pair is adjacent: same gap
      matchRange(start1,start2,end1,end2)
  elif lastStart1<start1 && lastStart2<start2:      // unmatched words on both sides in between
      matchRange(last gap); matchRange(current gap)
  else:                                              // one side adjacent, the other has unmatched words
      matchComplexRange(last gap, current gap)

matchRange(s1,s2,e1,e2): if both empty return
      ch = ByChar.comparePunctuation(text1[s1,e1), text2[s2,e2)); markEqual every unchanged run (shifted by s1/s2)

matchComplexRange(start11,start12,end11,end12, start21,start22,end21,end22):
  if start11==start21 && end11==end21:  // side 1 has ONE gap, side 2 has TWO (last + current)
      comparePunctuation2Side(seq1 = text1[gap], seq21 = text2[lastGap2], seq22 = text2[curGap2])
      -> markEqual pairs of (seq1, seq21) at (start1, start12), then pairs of (seq1, seq22) at (start1, start22)
  elif start12==start22 && end12==end22: mirror (side 2 has one gap, side 1 has two); note swapped ch.*1/ch.*2
  else: throw IllegalStateException

comparePunctuation2Side(text1, text21, text22):
  changes = comparePunctuation(text1, text21 + text22)       // MergingCharSequence = plain concatenation
  split unchanged ranges at offset = len(text21): wholly before -> list1; wholly after -> list2 (shift by -offset);
  straddling -> split into two
  return (fair(createUnchanged(list1, len1, len21)), fair(createUnchanged(list2, len1, len22)))
```

### 4.5 `compareAndSplit(text1, text2, policy)`: used for line-inner `WORDS`

This runs on the `subSequence` of one line fragment, **including** the trailing `\n`, because line fragment offsets
include the newline (§6.2).

```text
words, wordChanges = diff + WordChunkOptimizer          (same as 4.2)
wordBlocks  = LineFragmentSplitter(text1, text2, words1, words2, wordChanges).run()   // §4.7
subIters    = collectWordBlockSubIterables(wordChanges, wordBlocks)                  // SubiterableDiffIterable windows over word indices
for each block i:
   offsets = block.offsets; words = block.words
   sub1 = text1[offsets.start1, end1); sub2 = ...; subwords = words1[words.start1, end1) ...
   delim = AdjustmentPunctuationMatcher(sub1, sub2, subwords1, subwords2, startShift = offsets.start1/2, subIters[i]).build()
   it    = matchAdjustmentWhitespaces(sub1, sub2, delim, policy)
   fragments = it.changes as DiffFragment (relative to block offsets)
   newlines1/2 = count of NewlineChunk in subwords1/2
   LineBlock(fragments, offsets, newlines1, newlines2)
```

In `collectWordBlockSubIterables`, keep `index` into the change list. Advance it while
`range.end1 < words.start1 || range.end2 < words.start2`, then create
`SubiterableDiffIterable(changed, words.start1, words.end1, words.start2, words.end2, index)`.

### 4.6 Whitespace correctors (`matchAdjustmentWhitespaces`)

The input is the fair char-level iterable from the punctuation matcher. Every change is processed independently:

- **DEFAULT → `DefaultCorrector`:**
  `endCut = expandWhitespacesBackward(text1, text2, s1, s2, e1, e2)`, then
  `startCut = expandWhitespacesForward(text1, text2, s1, s2, e1-endCut, e2-endCut)`. The new range is
  `(s+startCut, e-endCut)` on both sides. Drop it if empty. In other words, equal whitespace at the edges of a change is
  given back to the unchanged text.
- **TRIM_WHITESPACES:** run `DefaultCorrector`, then `TrimSpacesCorrector`. For each side:
  `if isLeadingTrailingSpace(text, start)` then `start = trimStart(text, start, end)`, and
  `if isLeadingTrailingSpace(text, end-1)` then `end = trimEnd(text, start, end)`. Drop the range if it is empty **or** if
  `isEquals(text1, text2, range)` (DEFAULT).
  - `isLeadingSpace(text, i)`: `text[i]` is whitespace, and walking left from `i-1` reaches `'\n'` or the start of the text
    passing only whitespace.
  - `isTrailingSpace(text, i)`: `text[i]` is whitespace, and walking right from `i` reaches `'\n'` or the end of the text
    passing only whitespace.
  - Both return `false` for `i < 0` or `i == len`.
- **IGNORE_WHITESPACES → `IgnoreSpacesCorrector`:** `expanded = expandWhitespaces(text1, text2, range)`, which consumes
  equal whitespace forward and backward. Then `trimmed = trim(text1, text2, expanded)`, which strips whitespace from each
  side independently. Drop the range if it is empty or `isEqualsIgnoreWhitespaces`.

The 3-way variants (`MergeDefaultCorrector`, `MergeTrimSpacesCorrector`, `MergeIgnoreSpacesCorrector`) work the same way
on `MergeRange`, using the 3-way `expandWhitespaces*` helpers. Note that these helpers check whitespace only on `text1`
(left); only equality involves base and right. The 3-way `isEquals` compares base with left **and** base with right.

### 4.7 `LineFragmentSplitter` (`LineFragmentSplitter.kt`)

This splits one changed line block into logically separate blocks. The difference between `BY_WORD` and `BY_WORD_SPLIT`
comes from here: `BY_WORD` later squashes the blocks back together (§6.3).

Index convention: `-1` is the start of the text, `words.size` is the end of the text, and anything in between is a chunk
index.

```text
last1 = last2 = -1; pending = null; hasEqualWords = false
for each matched word pair (i1,i2) in iterable.iterateUnchanged():
   if words1[i1] is Newline && words2[i2] is Newline:         // split at matched newlines
       addLineChunk(i1, i2, hasEqualWords); hasEqualWords = false
   else:
       if isFirstInLine(words1,i1) && isFirstInLine(words2,i2): // i==0 or previous chunk is Newline
           addLineChunk(i1-1, i2-1, hasEqualWords); hasEqualWords = false
       hasEqualWords = true
addLineChunk(size1, size2, hasEqualWords)
if pending: result += pending.block

addLineChunk(end1, end2, hasEqualWords):
   if last1 > end1 || last2 > end2: return
   chunk = createChunk(last1, last2, end1, end2, hasEqualWords)
   if chunk.block.offsets.isEmpty: return
   pending = pending == null ? chunk
           : shouldMerge(pending, chunk) ? merge(pending, chunk)
           : (result += pending.block; chunk)
   last1 = end1; last2 = end2

createChunk(start1,start2,end1,end2,hasEq):
   offset(i) = i==-1 ? 0 : i==size ? len : words[i].offset2   // words[i] MUST be a NewlineChunk (assert)
   startOffsets = offset(start*); endOffsets = offset(end*)
   wordRange = Range(max(0,start1+1), min(end1+1,size1), max(0,start2+1), min(end2+1,size2))
   PendingChunk(WordBlock(wordRange, offsetRange), hasEq,
                hasWordsInside = any non-Newline chunk in wordRange on either side,
                isEqualIgnoreWhitespaces = isEquals(sub1, sub2, IGNORE_WHITESPACES))

shouldMerge(c1, c2) = (!c1.hasEqualWords && !c2.hasEqualWords)        // lines matched only by '\n'
                   || (c1.isEqualIW && c2.isEqualIW)                    // whitespace-only changed lines
                   || (!c1.hasWordsInside || !c2.hasWordsInside)        // squash blocks without words
merge: union of word and offset ranges; flags OR, OR, AND
```

### 4.8 3-way word compare `compare(text1=left, text2=base, text3=right, policy)`: `List<MergeWordFragment>`

```text
words* = getInlineChunks
it1 = diff(words2, words1) -> WordChunkOptimizer(text2, text1, ...) -> AdjustmentPunctuationMatcher(text2, text1, ...)   // base vs left
it2 = diff(words2, words3) -> optimizer -> punctuation matcher                                                         // base vs right
conflicts = ComparisonMergeUtil.buildSimple(it1, it2)     // §7.1, char offsets
result = Merge{Default|TrimSpaces|IgnoreSpaces}Corrector(conflicts, text1, text2, text3)  // §4.6, 3-way variants
```

This is used by `MergeResolveUtil` (§7.4) and by `WordMergeComparisonUtilTest`.

### 4.9 Optional: `compareWordsFirst` + `LineUplifter`

These are behind a registry flag that is off by default, so they **are not needed for parity**. `LineUplifterTest` and
`ComparisonUtilAutoTest.testWordsFirst` cover them. Skip them in v1, or port them last.

---

## 5. ByLine (`ByLineRt.kt`)

`Line(content, policy)` caches `key` (§1.2) and `nonSpaceChars`. `getLines(texts, policy)` creates `Line`s with the
**requested** policy. `convertMode(lines, IGNORE)` re-wraps them with the IGNORE policy.

### 5.1 2-way `compare(lines1, lines2, policy)`: FairDiffIterable over lines

```text
if policy == IGNORE_WHITESPACES:
    ch = compareSmart(lines1, lines2)                       // lines already IW
    ch = LineChunkOptimizer(lines1, lines2, ch).build()
    return expandRanges(lines1, lines2, ch)
else:
    iw1, iw2 = convertMode(lines, IGNORE)
    ch = compareSmart(iw1, iw2)                             // first pass: ignore whitespace
    ch = LineChunkOptimizer(lines1, lines2, ch).build()     // NOTE: optimizer uses the ORIGINAL-policy lines' equality
    return correctChangesSecondStep(lines1, lines2, ch)
```

**`compareSmart(lines1, lines2)`** is a two-step diff that ignores unimportant lines on the first pass:

```text
threshold = 3
big* = lines with nonSpaceChars > 3, plus their original indices
changes = diff(big1, big2)
return SmartLineChangeCorrector(indexes1, indexes2, lines1, lines2, changes).build()
   // ChangeCorrector §3.5 with getOriginalRange(i) = (indexes[i], indexes[i]+1) and:
   matchGap(s1,e1,s2,e2):
       ex = expand(lines1, lines2, s1, s2, e1, e2)           // strip equal lines at both ends
       inner = diff(lines1[ex.start1, ex.end1), lines2[ex.start2, ex.end2))
       markEqual(s1, s2, ex.start1, ex.start2)                // equal prefix
       for u in inner.unchanged: markEqual(ex.start1+u.start1, ex.start2+u.start2, u.length)
       markEqual(ex.end1, ex.end2, e1, e2)                    // equal suffix
```

**`expandRanges` (IGNORE only):** for each change, `expand(lines1, lines2, ch)` (Line equality, IW). Keep the non-empty
results and wrap them in `fair(create(...))`.

**`correctChangesSecondStep(lines1, lines2, iwChanges)`.** IW-matched lines are not necessarily equal under
DEFAULT/TRIM, so this pass re-matches them so that as many exactly-equal pairs as possible are matched. It never matches
lines that were unmatched in the first step.

```text
builder = ExpandChangeBuilder(lines1, lines2)           // Line equality under requested policy
sample = null; last1 = last2 = 0
for u in iwChanges.iterateUnchanged(): for i in 0 until u.length:
    i1 = u.start1+i; i2 = u.start2+i
    if !isEquals(sample, lines1[i1].content, IGNORE):      // left the current IW-equal group (null sample => always true)
        if lines1[i1] == lines2[i2]:                       // equal under requested policy
            flush(i1, i2); builder.markEqual(i1, i2)
        else:
            flush(i1, i2); sample = lines1[i1].content
flush(iwChanges.length1, iwChanges.length2)
return fair(builder.finish())

flush(line1, line2):
    if sample == null: return
    start1 = max(last1, builder.index1); start2 = max(last2, builder.index2)
    sub1 = [i in start1 until line1 where isEquals(sample, lines1[i].content, IGNORE)]   (last1 = i+1 for each)
    sub2 = same for side 2
    assert sub1, sub2 non-empty
    alignExactMatching(sub1, sub2); sample = null

alignExactMatching(sub1, sub2):
    n = max(|sub1|, |sub2|)
    if n > 10 || |sub1| == |sub2|:                        // pair in order
        for i in 0 until min: if lines1[sub1[i]] == lines2[sub2[i]]: markEqual(sub1[i], sub2[i])
        return
    if |sub1| < |sub2|: m = getBestMatchingAlignment(sub1, sub2, lines1, lines2)
                        for i: if lines1[sub1[i]] == lines2[sub2[m[i]]]: markEqual(sub1[i], sub2[m[i]])
    else:               m = getBestMatchingAlignment(sub2, sub1, lines2, lines1)   // mirrored
                        for i: if lines1[sub1[m[i]]] == lines2[sub2[i]]: markEqual(sub1[m[i]], sub2[i])

getBestMatchingAlignment(small, big):          // brute force over all C(|big|, |small|) increasing combinations
    best = [0,1,...,k-1]; bestWeight = 0
    combinations in lexicographic order (recursive: comb[k] = i for i in start..n)
    weight = #{i : lines(small[i]) == lines(big[comb[i]])}
    if weight > bestWeight (strictly): best = copy(comb)
```

### 5.2 3-way: `compare` (`keepIgnoredChanges = false`) and `merge` (`keepIgnoredChanges = true`)

The parameters are `(lines1 = left, lines2 = base, lines3 = right)`.

```text
iw* = convertMode(lines*, IGNORE)
it1 = correctChangesSecondStep(base, left,  LineChunkOptimizer(base, left,  compareSmart(iwBase, iwLeft)))
it2 = correctChangesSecondStep(base, right, LineChunkOptimizer(base, right, compareSmart(iwBase, iwRight)))
if keepIgnoredChanges && policy != DEFAULT:
    return ComparisonMergeUtil.buildMerge(it1, it2, trueEquality = (l,b,r) ->
              isEquals(base[b], left[l], DEFAULT) && isEquals(base[b], right[r], DEFAULT))
else:
    return ComparisonMergeUtil.buildSimple(it1, it2)
```

Note that the 3-way path **always** uses the two-step (non-IGNORE) branch, even when the policy is IGNORE. The `Line`s
still carry the requested policy, so `correctChangesSecondStep` compares with it.

---

## 6. ComparisonManagerImpl (diff-impl), the orchestration

### 6.1 `compareLines(text1, text2, policy)`: `LineFragment[]` with `innerFragments = null`

```text
lo1, lo2 = LineOffsetsImpl.create
lines* = [text.substring(lineStart(i), lineEnd(i)) for every line]   // WITHOUT '\n'
it = ByLine.compare(lines1, lines2, policy)
for ch in it.changes: createLineFragment(ch.start1, ch.end1, ch.start2, ch.end2, lo1, lo2)
```

`createLineFragment`: offsets come from `getOffsets(lo, start, end)`:
- empty range: `offset = start < lineCount ? lineStart(start) : lineEnd(lineCount-1, includeNewline = true)`. The latter is
  `textLength` because the last line has no newline.
- otherwise `[lineStart(start), lineEnd(end-1, includeNewline = true))`. **The trailing `\n` is included**, except on the
  last line.

Examples from `ComparisonUtilTest.testLineFragment`, written as (offsets1)(offsets2)(lines1)(lines2):
- `"x"` vs `"x\n"` → `[1,1) [2,2) lines [1,1) [1,2)`
- `" "` vs `"\n "` → `[0,0) [0,1) lines [0,0) [0,1)`

Port that test first.

### 6.2 `compareLinesInner(text1, text2, lo1, lo2, policy, fragmentsPolicy: NONE|WORDS|CHARS)`

The registry flag is false, so the word-first path is skipped.

```text
lineFragments = compareLines(...)
if fragmentsPolicy == NONE: return lineFragments
tooBig = 0; result = []
for f in lineFragments:
   try: result += createInnerFragments(f, ..., tryComputeDifferences = tooBig < MAX_BAD_LINES /*3*/)
   catch DiffTooBig: result += f; tooBig++

createInnerFragments(f):
   sub1 = text1[f.startOffset1, f.endOffset1); sub2 = ...
   if f is pure insertion/deletion (startLine1==endLine1 || startLine2==endLine2):
       return isEqualTexts(sub1, sub2, policy) ? [LineFragment(f, inner = [])]   // whitespace-only insert/delete => "ignored" change
                                               : [f]
   if !tryComputeDifferences: return [f]
   WORDS: createInnerWordFragments; CHARS: [LineFragment(f, compareChars(sub1, sub2, policy))]

createInnerWordFragments(f, sub1, sub2):
   blocks = ByWord.compareAndSplit(sub1, sub2, policy)       // non-empty
   cur1 = f.startLine1; cur2 = f.startLine2
   for i, block in blocks:
       end1 = (i != last) ? cur1 + block.newlines1 : f.endLine1    // last block takes the remainder (handles missing final '\n')
       end2 = (i != last) ? cur2 + block.newlines2 : f.endLine2
       chunk = createLineFragment(cur1, end1, cur2, end2,
                    block.offsets.start1 + f.startOffset1, block.offsets.end1 + f.startOffset1,
                    block.offsets.start2 + f.startOffset2, block.offsets.end2 + f.startOffset2,
                    inner = block.fragments)                 // dropWholeChangedFragments applies
       cur = end
```

`compareChars(text1, text2, policy)` (`doCompareChars`): DEFAULT uses `ByChar.compareTwoStep`, TRIM uses
`compareTrimWhitespaces`, IGNORE uses `compareIgnoreWhitespaces`. The changes become `DiffFragment[]`.
`compareWords` = `ByWord.compare`. `isEquals` = `isEqualTexts`.

**innerFragments semantics for the viewer:**
- `null` means the whole block is highlighted (BY_LINE, too big, or no common words).
- `[]` (an empty list) means "whitespace-only change". IntelliJ paints it as an *ignored* change: a lighter colour with no
  inner highlighting. `IGNORE_WHITESPACES_CHUNKS` trims these away.
- non-empty means word or char ranges, **relative** to the fragment's start offsets.

### 6.3 Post-processing: `squash` and `processBlocks(fragments, t1, t2, policy, squash, trim)`

- `processAdjoining` splits the list into groups of *adjoining* fragments. Two fragments adjoin when `prev.endLine1 ==
  next.startLine1 && prev.endLine2 == next.startLine2 && prev.endOffset1 == next.startOffset1 && prev.endOffset2 ==
  next.startOffset2`. They are adjoining exactly when they came from the same `compareAndSplit` call.
- `processBlocks`: if neither `squash` nor `trim` is set, return the input. For each group:
  - If `trim && policy == IGNORE_WHITESPACES`: drop fragments from the start of the group while
    `!((inner == null || inner.nonEmpty) && !isEquals(sub1, sub2, IGNORE))`. In words, a fragment is dropped when its
    inner is `[]` or its content is IW-equal. Drop from the end of the group the same way.
  - If nothing is left, skip the group. If `squash`, emit `doSquash(group)`; otherwise emit the group.
- `doSquash(group)` with a single fragment returns it. Otherwise it concatenates all inner fragments, re-based to the first
  fragment. A fragment with `inner == null` contributes one fragment covering its full length. Fragments are merged when
  `prev.end == cur.start + shift` on both sides. The result is
  `LineFragment(first.startLine*, last.endLine*, first.startOffset*, last.endOffset*, merged)`, built through the factory
  so that `dropWholeChangedFragments` applies.
- `squash(fragments)` is `doSquash` applied to each adjoining group. The tests use it.

### 6.4 TextDiffProviderBase / SimpleTextDiffProvider → contract `compareTexts(text1, text2, opts)`

`IgnorePolicy.getComparisonPolicy()`:

| IgnorePolicy | ComparisonPolicy | `isShouldTrimChunks` | `isShouldSquash` |
| --- | --- | --- | --- |
| `DEFAULT` | DEFAULT | no | yes |
| `TRIM_WHITESPACES` | TRIM_WHITESPACES | no | yes |
| `IGNORE_WHITESPACES` | IGNORE_WHITESPACES | no | yes |
| `IGNORE_WHITESPACES_CHUNKS` | IGNORE_WHITESPACES | **yes** | yes |

(`FORMATTING` and `IGNORE_LANGUAGE_SPECIFIC_CHANGES` are out of scope.)

`HighlightPolicy`:

| HighlightPolicy | InnerFragmentsPolicy | `isShouldSquash` | `isShouldCompare` |
| --- | --- | --- | --- |
| `BY_LINE` | NONE | yes | yes |
| `BY_WORD` (the IntelliJ default) | WORDS | yes | yes |
| `BY_WORD_SPLIT` | WORDS | **no** | yes |
| `BY_CHAR` | CHARS | yes | yes |
| `DO_NOT_HIGHLIGHT` | NONE | yes | **no** |

`TwosideTextDiffProviderBase.compare`, followed by `SimpleTextDiffProvider.compareRange`, ported:

```ts
function compareTexts(t1, t2, { ignorePolicy = 'DEFAULT', highlightPolicy = 'BY_WORD' } = {}): LineFragment[] {
  if (highlightPolicy === 'DO_NOT_HIGHLIGHT') return [];          // IntelliJ returns null => viewer shows no changes at all
  const policy = toComparisonPolicy(ignorePolicy);
  const inner = highlightPolicy === 'BY_LINE' ? 'NONE' : highlightPolicy === 'BY_CHAR' ? 'CHARS' : 'WORDS';
  const fragments = compareLinesInner(t1, t2, lo1, lo2, policy, inner);   // §6.2
  const squash = highlightPolicy !== 'BY_WORD_SPLIT';             // && ignorePolicy.isShouldSquash (always true here)
  const trim = ignorePolicy === 'IGNORE_WHITESPACES_CHUNKS';
  return processBlocks(fragments, t1, t2, policy, squash, trim);  // §6.3
}
```

`SimpleTextDiffProvider` also supports `linesRanges` (compare only explicit line blocks). `BlocksComparisonUtilTest`
exercises it, but the viewers do not need it. It is optional: an internal `compareTextsInRanges(t1, t2, ranges, opts)`
that calls `compareLinesInner(boundaryRange, …)` for each range, using the same algorithm on the sub-list of lines, with
line and offset numbers shifted by `boundaryRange.start*`.

**Too big:** `DiffTooBigException` from the *line* pass propagates out of the provider, and `SimpleDiffViewer` shows a
"Contents are too big" notification without highlighting. Inner-pass failures are swallowed (§6.2). **Open contract
question:** `types.ts` says `DiffTooBigError` is "thrown internally (and caught)". My recommendation is that
`compareTexts` rethrow it at line level, so that the viewer can show IntelliJ's notification. Otherwise the result would
be indistinguishable from "no changes". The orchestrator should decide.

### 6.5 `getDiffType(f)` (`DiffUtil.getLineDiffType`)

`left = startLine1 != endLine1; right = startLine2 != endLine2` → both → `MODIFIED`; only left → `DELETED`; only right →
`INSERTED`; neither → `MODIFIED`, which IntelliJ logs as an error. For inner `DiffFragment`s, `DiffUtil.getDiffType(DiffFragment)`
uses offsets instead of lines. Export it too, because the viewer colours inner fragments the same way.

---

## 7. Merge (3-way)

### 7.1 `ComparisonMergeUtil.buildSimple(it1: base→left, it2: base→right)` / `buildMerge(…, trueEquality)`

Both iterables share side 1, the **base**, so `assert it1.length1 == it2.length1`. `FairMergeBuilder` walks the
*unchanged* ranges of both with peekable iterators:

```text
while u1.hasNext && u2.hasNext:
    r1 = u1.peek; r2 = u2.peek          // r.start1/end1 = base, r.start2/end2 = left (r1) or right (r2)
    if r1.end1 <= r2.start1: advance u1; continue
    if r2.end1 <= r1.start1: advance u2; continue
    startBase = max(r1.start1, r2.start1); endBase = min(r1.end1, r2.end1); count = endBase - startBase
    startLeft  = r1.start2 + (startBase - r1.start1); startRight = r2.start2 + (startBase - r2.start1)
    builder.markEqual(startLeft, startBase, startRight, startLeft+count, endBase, startRight+count)
    advance (r1.end1 <= r2.end1) ? u1 : u2
return builder.finish(it1.length2 /*left*/, it1.length1 /*base*/, it2.length2 /*right*/)
```

The 3-way `ChangeBuilder`: `markEqual(s1,s2,s3,e1,e2,e3)` asserts monotonicity, then `processChange(index*, s*)`, then
`index = e`. `finish(l1,l2,l3)` calls `processChange(index*, l*)`. In the plain version, `processChange = addChange`,
which skips the change if all three sides are empty. The resulting `MergeRange` uses 1 = left, 2 = base, 3 = right.

`IgnoringChangeBuilder` (buildMerge) overrides `processChange`. Before adding the real change, it scans the unchanged
stretch from the previous change's end (or 0) up to the change start. That stretch has equal lengths on all sides. Each
maximal run of indices with `!trueEquality(l+i, b+i, r+i)` is emitted as its own change: lines that are equal under the
policy but differ in whitespace become separate "ignored" changes. Then it adds the real change.

### 7.2 `MergeRangeUtil.getMergeType(emptiness, equality, trueEquality?, conflictResolver)` → `MergeConflictType`

```text
L,B,R empty flags; assert not all empty
if B empty:
   L empty           -> INSERTED (left=false, right=true)        // --=
   R empty           -> INSERTED (true, false)                   // =--
   eq(LEFT,RIGHT)    -> INSERTED (true, true)
   else              -> CONFLICT (true, true, resolution = null)
else:
   L && R empty      -> DELETED (true, true)                     // -=-
   uL = eq(BASE,LEFT); uR = eq(BASE,RIGHT)
   if uL && uR:      // only possible for "ignored" blocks from buildMerge
        tL = trueEq(BASE,LEFT); tR = trueEq(BASE,RIGHT); assert !(tL && tR)
        -> MODIFIED (!tL, !tR)
   if uL             -> (R empty ? DELETED : MODIFIED) (false, true)
   if uR             -> (L empty ? DELETED : MODIFIED) (true, false)
   if eq(LEFT,RIGHT) -> MODIFIED (true, true)
   canBeResolved = !L empty && !R empty && conflictResolver()
   -> CONFLICT (true, true, resolution = canBeResolved ? TEXT : null)
```

`MergeConflictType.canBeResolved()` is `resolutionStrategy != null`. Every non-CONFLICT type is created with the
`DEFAULT` strategy, so it is **resolvable (true)**. A CONFLICT is resolvable only when `tryResolve` succeeds. Map this to
the contract's `canBeResolved` boolean. `isChange(BASE)` is always true.

Line flavours:
- `getLineMergeType(fragment, [left, base, right], lineOffsets, policy)` is what the merge viewer uses.
  `equality(s1, s2)` = the same line count, and every line pair satisfies `isEqualTexts(lineContent, lineContent, policy)`.
  The line content comes from `getLinesContent(…, l, l+1)`, without the newline. `trueEquality` is the same with DEFAULT.
  `conflictResolver = tryResolveConflict(getLinesContent(left range), getLinesContent(base range), getLinesContent(right range)) != null`.
- `getLineThreeWayDiffType` is the same with `trueEquality = null`. The 3-way *diff* viewer uses it.
- `getWordMergeType`: equality is `isEqualTexts` of the sub-strings, and the resolver is always false. `MergeResolveUtil`
  uses it.
- `getLeftToRightDiffType` is only used by a colour mode. **Not needed.**

### 7.3 Contract `mergeLines(left, base, right, policy)` → `MergeLineFragmentWithType[]`

This mirrors `MergeDiffBuilder.rediff` (the merge viewer) together with `MergeThreesideViewer`'s inner pass:

```text
fragments = ByLine.merge(lines(left), lines(base), lines(right), policy)  // §5.2 keepIgnoredChanges=true -> MergeLineFragment
for f in fragments:
   type = getLineMergeType(f, [left, base, right], lineOffsets, policy)
   chunks[side] = (!type.isChange(side) || startLine==endLine) ? null : getLinesContent(side text, start, end)  // no trailing '\n'
   inner = compareThreesideInner(chunks, policy)
```

`DiffUtil.compareThreesideInner(chunks, policy)` returns per-side `TextRange` lists, or `null`:

```text
if all chunks null: null
if policy == IGNORE && isEqualTexts(c0 ?? "", c1 ?? "", IGNORE) && isEqualTexts(c0 ?? "", c2 ?? "", IGNORE): ([], [], [])   // whitespace-only
if two chunks are null: null
if all three present:
    f1 = ByWord.compare(base, left, policy); f2 = ByWord.compare(base, right, policy)
    base ranges = f1.side1 ranges ++ f2.side1 ranges        // NOT sorted / may overlap — concatenated as in IntelliJ
    left = f1.side2 ranges; right = f2.side2 ranges
else (exactly one null):
    side1 = left present ? LEFT : BASE; side2 = right present ? RIGHT : BASE
    w = ByWord.compare(chunk(side1), chunk(side2), policy)
    side1 gets w.*1 ranges, side2 gets w.*2 ranges, the third side null
```

The ranges are relative to the chunk start, i.e. the line start offset of `startLine` on that side.

**Contract gap:** `MergeLineFragmentWithType.innerFragments` is typed as `[DiffFragment[]|null ×3]`, but IntelliJ produces
one-sided `TextRange`s. Suggestion: encode each range as `{startOffset1: s, endOffset1: e, startOffset2: s, endOffset2: e}`
and document that only `*1` matters. A better option is to add a `TextRange` type in a contract revision.

Also note that the merge viewer recomputes inner fragments only for changes that are not resolved. That is viewer state;
`mergeLines` computes them for all changes.

### 7.4 `MergeResolveUtil.tryResolve(left, base, right)` (the "magic wand"; needed for `canBeResolved`)

```text
tryResolve = trySimple(DEFAULT) ?? trySimple(IGNORE_WHITESPACES)   (any DiffTooBig -> null)
SimpleHelper(policy):
   changes = ByWordRt.compare(left, base, right, policy)          // §4.8 MergeWordFragments
   last = (0,0,0); out = ""
   for f in changes:
       appendBase(MergeRange(last -> f.start)); last = f.start
       if !appendConflict(MergeRange(last -> f.end), policy): return null; last = f.end
   appendBase(MergeRange(last -> (len_l, len_b, len_r)))
   return out
appendBase(r): skip empty; if base==left && base==right (DEFAULT) -> append base slice
               else t = getWordMergeType(r, DEFAULT): t.isChange(LEFT) ? left slice : t.isChange(RIGHT) ? right slice : base slice
appendConflict(r): t = getWordMergeType(r, policy); CONFLICT -> fail; else append (t.isChange(LEFT) ? left : right) slice
```

`tryGreedyResolve` (`GreedyHelper`) is only used when `USE_GREEDY_MERGE_MAGIC_RESOLVE` is set, which is false. It is
small, though, and `MergeResolveUtilTest` checks both versions, so port it too. It runs 2-way `ByWord.compare(base, left)`
and `(base, right)`, walks the changes in base order and groups the ones that intersect. Deletions are merged. If one
side's insertions are empty, the other side's insertions are taken. Equal insertions (under the policy) keep the shorter
one. Different insertions on both sides cause a failure.

`ComparisonManager.compareLines(t1, t2, t3, policy)`, the 3-way *diff* path without ignored blocks, is
`ByLine.compare(…)`. Expose it internally for the tests (`lines_diff`).

---

## 8. Recommended TS module layout (`packages/core/src`)

```
src/
  types.ts                         (exists; contract types — do not change shape)
  index.ts                         public API per CONTRACT.md + re-exports of types
  config.ts                        DiffConfig constants (§0)
  text/
    chars.ts                       isSpaceEnterOrTab, isWhiteSpaceCodePoint, isPunctuation, isAlpha, isContinuousScript,
                                   codePointAt/charCount helpers                        (TrimUtil.kt, CharacterUtils.kt)
    equality.ts                    isEquals, isEqualTexts, equalsTrimWhitespaces (multi-line), lineKey(policy)
                                                                                         (ComparisonUtil.kt, StringsKmp.kt)
    lineOffsets.ts                 LineOffsets class, getLinesRange/getLinesContent, public lineOffsets()
                                                                                         (LineOffsetsImpl.kt, DiffRangeUtil.kt)
  util/
    range.ts                       Range, MergeRange (+isEmpty), Side/ThreeSide helpers  (Range.kt, MergeRange.kt, Side.kt, ThreeSide.kt)
    trim.ts                        trim/expand/expandWhitespaces/trimExpand (2- and 3-way) (TrimUtil.kt)
    fragments.ts                   createDiffFragment, createLineFragment (dropWholeChangedFragments), createMergeLineFragment
                                                                                         (DiffFragmentImpl.kt, LineFragmentImpl.kt)
  lcs/
    enumerator.ts                  keys -> Int32Array                                    (Enumerator.kt)
    diff.ts                        buildChanges (prefix/suffix strip, fast path, Myers->Patience fallback) (Diff.kt)
    reindexer.ts                   (Reindexer.kt)
    myers.ts                       (MyersLCS.kt)  — Int32Array V, Uint8Array change bits
    patience.ts                    PatienceIntLCS + UniqueLCS                             (PatienceIntLCS.kt, UniqueLCS.kt)
  iterables/
    diffIterable.ts                DiffIterable/FairDiffIterable, RangesDiffIterable, inverted, subiterable,
                                   create/createUnchanged/fair/iterateAll/verify          (iterables/*.kt, DiffIterableUtil.kt)
    changeBuilder.ts               ChangeBuilder, ExpandChangeBuilder, diff(keys1, keys2)  (DiffIterableUtil.kt)
  comparison/
    chunkOptimizer.ts              ChunkOptimizer + Word/Line variants                    (ChunkOptimizer.kt)
    changeCorrector.ts             ChangeCorrector + DefaultChar/SmartLine variants        (ChangeCorrector.kt)
    byChar.ts                      compare, compareTwoStep, compareTrim/IgnoreWhitespaces, comparePunctuation (ByCharRt.kt)
    byWord.ts                      getInlineChunks, compare (2/3-way), compareAndSplit, punctuation matcher,
                                   whitespace correctors (2/3-way)                        (ByWordRt.kt)
    lineFragmentSplitter.ts        (LineFragmentSplitter.kt)
    byLine.ts                      Line, compare (2-way), compare/merge (3-way), correctChangesSecondStep (ByLineRt.kt)
    comparisonMergeUtil.ts         buildSimple/buildMerge, tryResolveConflict             (ComparisonMergeUtil.kt)
    mergeResolveUtil.ts            tryResolve, tryGreedyResolve                           (MergeResolveUtil.kt)
    comparisonManager.ts           compareLines, compareLinesInner, compareWords, compareChars, isEquals,
                                   squash, processBlocks, compareLines3/mergeLines3       (ComparisonManagerImpl.java)
  merge/
    mergeRangeUtil.ts              getMergeType, getLineMergeType, getLineThreeWayDiffType, getWordMergeType (MergeRangeUtil.kt, MergeConflictType.kt)
    threesideInner.ts              compareThreesideInner                                  (DiffUtil.compareThreesideInner)
  provider/
    textDiffProvider.ts            compareTexts (IgnorePolicy/HighlightPolicy mapping)     (SimpleTextDiffProvider, TwosideTextDiffProviderBase, *Policy.java)
    mergeProvider.ts               mergeLines (contract)                                  (MergeDiffBuilder.rediff + MergeThreesideViewer inner pass)
    diffType.ts                    getDiffType(LineFragment), getDiffFragmentType          (DiffUtil.getLineDiffType/getDiffType)
test/
  dsl.ts, *.test.ts                (§9)
```

Public `index.ts` mapping (CONTRACT.md):

| Contract | Implementation |
| --- | --- |
| `compareLines(t1, t2, policy = 'DEFAULT')` | `comparisonManager.compareLines` |
| `compareLinesInner(t1, t2, policy)` | `compareLinesInner(…, 'WORDS')` without squash (IntelliJ `ComparisonManager.compareLinesInner` does not squash) |
| `compareWords`, `compareChars` | as in §6.2 |
| `compareTexts` | §6.4 |
| `mergeLines` | §7.3 |
| `getDiffType` | §6.5 |
| `lineOffsets` | line start offsets |

Also export `squash`, `processBlocks`, `isEqualTexts`, `tryResolve` and `getDiffFragmentType` as extras. Tests and
viewers need them.

Implementation notes:
- Use plain `{start1, end1, start2, end2}` objects or a small `class Range`; the hot loops are inside LCS. Iterables can be
  arrays plus generators, since the sizes are small after LCS.
- Bitsets: `Uint8Array(length)`. Reads past the end are `undefined`, which is falsy. That matches Kotlin's `BitSet.get`.
- Enumerator: `Map<string, number>`, numbered from 1.
- Keep the comments `// ported from com.intellij.diff.comparison.ByWordRt#…` on each function.
- Do not use JS `String.prototype.trim` (it strips more whitespace kinds) or `\s` in regexes. Always use `[ \t\n]`.

---

## 9. Test inventory and DSL (for the Vitest port)

Location: `$IJ/platform/diff-impl/tests/testSrc/com/intellij/diff/comparison/`. The support code is in `../DiffTestCase.kt`
and `../HeavyDiffTestCase.kt`.

| File | Kotlin test fns / cases (approx.) | Exercises | Priority |
| --- | --- | --- | --- |
| `ComparisonUtilTest.kt` | 2 / ~47 | `isEquals(TRIM)` multi-line semantics; `compareLines` fragment offsets/lines (`!line - col` helpers) | P0 |
| `TrimUtilTest.kt` | 2 | `isPunctuation` for all chars 0..0xFFFF vs the set ``(){}[],./?`~!@#$%^&*-=+|\;:'"<>``; `isAlpha`/`isContinuousScript` samples | P0 |
| `LineComparisonUtilTest.kt` | 23 / ~70 | `lines {}`: ByLine incl. unimportant lines, second step, chunk optimizer | P0 |
| `WordComparisonUtilTest.kt` | 13 / ~78 | `words {}` + `lines_inner {}` (compareLinesInner + squash **and** compareWords), punctuation, trim/ignore | P0 |
| `CharComparisonUtilTest.kt` | 11 / ~71 | `chars {}` (compareChars + raw ByChar for DEFAULT), `chars_smart`, `chars_raw`, surrogate pairs (`chSmile` etc.) | P0 |
| `SplitComparisonUtilTest.kt` | 3 / ~26 | `splitter(squash, trim) {}`: compareLinesInner + processBlocks → line ranges | P0 |
| `LineComparisonMergeUtilTest.kt` | 2 / ~40 | `lines_diff {}` (3-way compare) and `lines_merge {}` (3-way merge) | P0 |
| `CharComparisonMergeUtilTest.kt` | 4 / ~52 | `chars {}` 3-way: `ByChar.compare(base, x)` ×2 + `buildSimple` | P1 |
| `WordMergeComparisonUtilTest.kt` | 2 / ~13 | `words {}` with 3 texts: `ByWordRt.compare(l, b, r)` | P1 |
| `MergeResolveUtilTest.kt` | 11 / ~16 | `test(base, left, right, expected[, expectedGreedy])` → tryResolve + tryGreedyResolve | P1 |
| `BlocksComparisonUtilTest.kt` | 8 / ~29 | provider with explicit `linesRanges` × Ignore/Highlight policies; also `ignore_chunks()` | P2 (needs `compareTextsInRanges`) |
| `ComparisonUtilAutoTest.kt` | 9 | random fuzzing with invariants (see below) | P1 (excellent safety net) |
| `IgnoreComparisonUtilTest.kt` | 10 / ~87 | `compareLinesWithIgnoredRanges` (char-level ignored ranges) | skip (feature not used) |
| `LineUplifterTest.kt` | 2 / 7 | `compareLinesWordFirst` | skip unless §4.9 is ported |

### 9.1 Source notation (`DiffTestCase.parseSource`)

- In test *texts*, `'_'` stands for `'\n'` (`parseSource = replace('_', '\n')`). `.plainSource()` on a helper opts out.
- Special strings: `chSmile = "😂"`, `chGun = "🔫"`, plus `chFace`/`chMan`. Copy them from `DiffTestCase.kt`.

### 9.2 Two-way DSL (`ComparisonUtilTestBase.TestBuilder`)

```kotlin
lines_inner {                         // TestType: LINE | LINE_INNER | WORD | CHAR | CHAR_SMART | CHAR_RAW | SPLITTER
  (" x z" - "y z")                    // 1st "a - b": sets the two TEXTS (parseSource applied)
  ("--  " - "-  ").default()          // later "a - b": a MATCHING (changed-char mask) for a policy
  (" -  " - "-  ").trim()             // .default() / .trim() / .ignore()
  testAll()                           // run DEFAULT, TRIM, IGNORE   (or testDefault/testTrim/testIgnore)
}
lines {
  ("x_z" - "y_z")
  default(mod(0, 0, 1, 1))            // or expected CHANGES: mod/del/ins (see below), per policy: default(...)/trim(...)/ignore(...)
  testAll()
}
```

- **Policy fallback** (`PolicyData.get`): IGNORE uses `ignore ?: trim ?: default`; TRIM uses `trim ?: default`; DEFAULT
  uses `default`. Each run needs at least one of matchings or changes.
- **Char matching** (`parseMatching`): first remove every `'.'` from the mask (used only for visual alignment). The mask
  length must equal the text length. A non-space char marks a changed char. The assertion compares the union of fragment
  ranges with the mask, as bitsets.
- **Line matching** (`parseLineMatching`, used only by `lines {}`): the mask has the same length as the text. Split it on
  `'_'` or `'*'`, the terminators. A line is changed if its segment, including the terminator, contains any char other
  than `' '` and `'_'`. So `'*'` is used to mark an *empty* line as changed. Inside a changed line every char must be
  non-space. Compare with the union of `[startLine, endLine)` of the fragments.
- **Expected changes**:
  - `mod(l1, l2, c1, c2)` = `([l1, l1+c1), [l2, l2+c2))`
  - `del(l1, l2, c1)` = `([l1, l1+c1), [l2, l2))`
  - `ins(l1, l2, c2)` = `([l1, l1), [l2, l2+c2))`
  
  These compare ordered lists of `(start1, end1), (start2, end2)` against line ranges (`lines`, `splitter`) or offset
  ranges (`words`, `chars`).
- What each type runs:
  - `LINE`: `compareLines(policy)` + `checkConsistency` + line matching/changes.
  - `LINE_INNER`: (a) `squash(compareLinesInner(policy))`, which must give exactly one fragment covering both whole texts;
    its `innerFragments` (not null) are checked. (b) `compareWords(policy)` with the same expectations.
  - `WORD`: `compareWords`. With 3 texts it is `ByWordRt.compare(left, base, right)`, and a matching has three masks.
  - `CHAR`: `compareChars(policy)`, plus for DEFAULT also the raw `ByChar.compare`.
  - `CHAR_SMART`: only `compareChars`.
  - `CHAR_RAW`: only raw, DEFAULT only.
  - `SPLITTER`: `compareLinesInner(policy)` → `processBlocks(squash, trim)` → expected line changes (no matchings allowed).
- **`checkConsistency`** (run on every result): ranges are valid. `DiffFragment`s are non-empty. `LineFragment`s have
  non-empty lines, `0 <= startLine` and `endLine <= lineCount` (lineCount = `LineOffsets.lineCount`), and their offsets
  agree with the lines: non-empty means `[lineStart(start), lineEnd(end-1) + (1 if < textLength))`; empty means
  `offset = startLine == lineCount ? textLength : lineStart(startLine)`. Inner fragments are checked recursively.
- **3-way word DSL**: `("L" - "B" - "R")` gives `before = L, base = B, after = R`, because
  `Helper.minus` shifts its arguments. The matching masks follow the same order, and expected changes are `Trio`s.

**Suggested Vitest translation.** It is mechanical: the Kotlin can be converted with regexes.

```ts
// test/dsl.ts
lines(t => {
  t.$('x_z', 'y_z');                  // ("x_z" - "y_z")
  t.default(mod(0, 0, 1, 1));
  t.testAll();
});
lines_inner(t => {
  t.$(' x z', 'y z');
  t.$('--  ', '-  ').default();       // ("--  " - "-  ").default()
  t.$(' -  ', '-  ').trim();
  t.testAll();
});
words(t => { t.$('a b', 'a b', 'a b'); t.$('   ', '   ', '   ').default(); t.testAll(); });   // 3-way
splitter({ squash: true }, t => { ... });
```

`t.$(a, b, c?)` sets the texts on the first call and returns a matching helper with `.default()`, `.trim()`, `.ignore()`
and `.plainSource()`. The builder throws if `testX()` never ran (`assertExecuted`). Regex hint:
`\("([^"]*)" - "([^"]*)"\)` → `t.$('$1', '$2')`. Watch out for Kotlin string templates (`$chSmile`) and escapes.

### 9.3 Merge DSL (`ComparisonMergeUtilTestBase.MergeTestBuilder`)

```kotlin
lines_merge {                 // or lines_diff { } (3-way compare, no ignored blocks) / chars { } (ByChar ×2 + buildSimple)
  ("x" - "x_y" - "x")         // first triple = texts (left, base, right), parseSource applied
  (" " - " _-" - " ").matching()    // optional line (or char for chars{}) masks, same rules as §9.2
  changes(mod(0, 0, 0, 1, 1, 1))    // mod(l1, l2, l3, c1, c2, c3) -> ([l1,l1+c1), [l2,l2+c2), [l3,l3+c3)) in left/base/right order
  test()                       // DEFAULT; test(ComparisonPolicy.X) for others (chars{} allows only DEFAULT)
}
```

`checkConsistency` (chars only): each change is non-empty, the changes are ordered (`last <= start <= end` per side), and
no change is "squashed", i.e. none starts on all sides exactly where the previous one ended.

### 9.4 Other test helpers

- `MergeResolveUtilTest`: `test(base, left, right, expected)` checks both `tryResolve(left, base, right)` and
  `tryGreedyResolve`. The 5-argument form gives different expected values for the simple and greedy versions. Note the
  argument order: the test passes **base first**.
- `ComparisonUtilTest`: `doTestTrim(expected, s1, s2)` → `isEqualTexts(s1, s2, TRIM)`.
  `doTestLineFragment(s1, s2, !o1s - o1e, !o2s - o2e, !l1s - l1e, !l2s - l2e)` → exactly one `compareLines` fragment. In
  that helper, `!a - b` simply means the pair `(a, b)`.
- `BlocksComparisonUtilTest` (if ported): `Test(in1, in2).blocks(Range…).expected(Range…).default()/trim()/ignore()/ignore_chunks()`
  runs both BY_LINE and BY_WORD and compares `(startLine1, endLine1, startLine2, endLine2)`. `.inner("--  ", " -")` checks
  absolute inner char masks.

### 9.5 Auto (fuzz) test (`ComparisonUtilAutoTest`)

- **Generator** (`DiffTestCase.generateText`): length is uniform in `[0, 300]`. Each char comes from
  `rnd = nextInt(12)`: indices 0..7 map to `["\n", "\n", "\t", " ", " ", ".", "<", "!"]`, and anything else is
  `char(rnd + 97)` (`i`..`l`). With `useHighSurrogates`, `count += 4` and the four surrogate-pair chars are added.
  30 runs per test, with a seeded RNG; in TS use a small seeded PRNG.
- **Invariants:**
  - Consistency as in §9.2, with ordered, non-overlapping fragments.
  - `checkValidRanges`: every unchanged stretch between fragments must be equal (IW-equal when the policy is not
    DEFAULT), and every changed fragment must be *not* equal (IW-not-equal for IGNORE).
  - `checkCodePoints`: no fragment boundary splits a surrogate pair.
  - Line results: `checkCantTrimLines`, i.e. the first and last line of a change cannot be trimmed off as equal unless the
    lines are short or the result is not squashed.
  - Merge results: the 3-way equivalents, and with `allowIgnoredBlocks` for `mergeLines` with a non-DEFAULT policy.
- **Scenarios:** char, word, line (WORDS and CHARS inner), line + squash, line + processBlocks(trim), words-first,
  explicit blocks (provider), merge, and 3-way diff.

Enable `verify` in iterables (§1.5) during tests, like `DiffIterableUtil.setVerifyEnabled(true)` in `DiffTestCase.setUp`.
It catches most porting mistakes early.

---

## 10. Implementation notes from the `@ide-diff/core` port (appended after implementation)

- **Too big at line level.** `compareTexts` never throws: if `DiffTooBigError` escapes the line pass it returns one
  `LineFragment` covering both whole texts (`innerFragments = null`), or `[]` when the texts are equal under the policy.
  `compareTextsStrict` (same options) rethrows, for viewers that want IntelliJ's "Contents are too big" notice.
  `mergeLines` still throws `DiffTooBigError` from the line pass; inner (word) failures are swallowed (`innerFragments = null`).
- **Merge inner fragments.** `MergeLineFragmentWithType.innerFragments[side]` encodes IntelliJ's one-sided `TextRange`s as
  `{startOffset1: s, endOffset1: e, startOffset2: s, endOffset2: e}`; only `*1` is meaningful. They are relative to the start
  of the chunk's first line on that side. Base ranges are concatenated (base-vs-left, then base-vs-right), so they are not sorted.
- **§9.5 correction.** IntelliJ's `checkValidRanges` for *line* results uses `skipLastNewline`: an unchanged gap may differ
  by a trailing `'\n'` (e.g. `"x"` vs `"x\n"` gives fragment `[1,1)-[1,2)` with empty offsets, so the newline lives in the
  "unchanged" text). Offset-based reconstruction is therefore only exact for char/word results.
- **§9 counts.** `MergeResolveUtilTest` has 7 test functions (not 11).
- **verify.** As in Kotlin, `verify` also rejects empty ranges in `unchanged()`; with verification on, all ported tests pass,
  so touching changes do not occur in practice.
