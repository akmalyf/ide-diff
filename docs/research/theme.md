# IntelliJ New UI theme tokens for the diff viewer

Research notes for `@ide-diff/viewer` (`theme/` and `icons/`). Every value was read from the
intellij-community sources (Apache-2.0) unless it is marked **(unverified)**.

Sources (paths relative to the intellij-community root):

| File | What it gives |
|---|---|
| `platform/platform-resources/src/DefaultColorSchemesManager.xml` | Base editor schemes `Default` (light) and `Darcula` (dark, `parent_scheme="Default"`) |
| `platform/platform-resources/src/themes/islands/IslandSchemeDark.xml` | Editor scheme **"Islands Dark"** (`parent_scheme="Darcula"`), the current default dark scheme (2025.2+) |
| `platform/platform-resources/src/themes/expUI/expUI_darkScheme.xml` | Editor scheme **"Dark"** (New UI 2023–2025.1, `parent_scheme="Darcula"`) |
| `platform/platform-resources/src/themes/expUI/expUI_lightScheme.xml` | Editor scheme **"Light"** (`parent_scheme="Default"`). Both the expUI Light and Islands Light LAFs use it |
| `themes/islands/ManyIslandsDark.theme.json`, `ManyIslandsLight.theme.json` | Islands UI (chrome) colors |
| `themes/expUI/expUI_dark.theme.json`, `expUI_light.theme.json` | expUI UI (chrome) colors, the parents of the Islands themes |
| `platform/diff-impl/.../diff/util/TextDiffTypeFactory.java`, `DiffDrawUtil.java`, `DiffLineMarkerRenderer.kt`, `DiffLineSeparatorRenderer.java` | How the diff colors are applied |
| `platform/platform-impl/.../editor/colors/EditorColors.java`, `EditorGutterComponentImpl.java` | Gutter background rules |
| `platform/editor-ui-api/.../FontPreferences.java` | Default font, size and line spacing |
| `platform/util/resources/misc/registry.properties` | `diff.divider.width=24` |

**Decision for ide-diff:** `theme: 'dark'` follows **Islands Dark**: editor scheme `IslandSchemeDark.xml` and
UI `ManyIslandsDark.theme.json`. `theme: 'light'` follows **Islands Light**: editor scheme
`expUI_lightScheme.xml` and UI `ManyIslandsLight.theme.json`. The older expUI "Dark" values are listed
where they differ, in case we add a `dark-classic` option later.

Scheme inheritance: an attribute missing in a scheme comes from its `parent_scheme`. So the
`DIFF_*` attributes for **both** dark schemes come from **Darcula**, because neither `IslandSchemeDark.xml`
nor `expUI_darkScheme.xml` overrides them. Light gets them from **Default**, except `DIFF_MODIFIED`,
which `expUI_lightScheme.xml` overrides.

Hex values below are `#RRGGBB`, or `#RRGGBBAA` when there is alpha. IntelliJ writes alpha as
`RRGGBBAA` in schemes and theme JSON (for example `ffffff26` is white at 0x26/255 ≈ 15%), and
that is the same order CSS uses for 8-digit hex. Short values in the XML such as `33b3` are
zero-padded on the left (`#0033b3`).

---

## 1. Diff colors

### 1.1 Base attributes (`DiffColors.DIFF_*`)

| Key | Dark (Islands Dark / Dark): background | Dark: error stripe | Light: background | Light: error stripe |
|---|---|---|---|---|
| `DIFF_INSERTED` | `#294436` | `#447152` | `#BEE6BE` | `#AADEAA` |
| `DIFF_DELETED` | `#484A4A` | `#656E76` | `#D6D6D6` | `#C8C8C8` |
| `DIFF_MODIFIED` | `#385570` | `#43698D` | `#C2D8F2` (expUI Light override; Default is `#CAD9FA`) | `#B6D2F2` (Default: `#B8CBF5`) |
| `DIFF_CONFLICT` | `#45302B` | `#8F5247` | `#FFD5CC` | `#FFC8BD` |
| `DIFF_ABSENT` | `#F0F0F0` (inherited from Default and not overridden. Not used by the modern viewers) | – | `#F0F0F0` | – |

None of these attributes set a `FOREGROUND`, so `getIgnoredColor()` always takes the mixing path (§1.2).

Color-blind variants (`deuteranopia`/`protanopia`, Darcula): inserted `#29452E`/stripe `#468058`;
modified stripe `#1C5C99`; conflict `#453900`/stripe `#7A6C25`. Light Default: conflict `#FFEC8C`/stripe `#FAD932`.

### 1.2 Ignored (“soft”) line color: `TextDiffTypeImpl.getIgnoredColor`

```java
// TextDiffTypeFactory.TextDiffTypeImpl
Color getIgnoredColor(Editor editor) {
  Color color = getAttributes(editor).getForegroundColor();   // null for all DIFF_* keys
  if (color != null) return color;
  Color fg = getColor(editor);                                // DIFF_* background
  Color bg = editor.getBackgroundColor();                     // TEXT background
  return ColorUtil.mix(fg, bg, MIDDLE_COLOR_FACTOR);          // MIDDLE_COLOR_FACTOR = 0.6
}
// ColorUtil.mix -> MixedColorProducer: channel = c1 + Math.round(0.6 * (c2 - c1)), alpha mixed the same way
```

So the ignored color is 40% diff color and 60% editor background. In TypeScript:

```ts
const mix = (c1: RGB, c2: RGB, k = 0.6) => c1.map((v, i) => v + Math.floor(k * (c2[i] - v) + 0.5));
```

Pre-computed values:

| Type | Islands Dark (bg `#191A1C`) | expUI Dark (bg `#1E1F22`) | Light (bg `#FFFFFF`) |
|---|---|---|---|
| inserted | `#1F2B26` | `#222E2A` | `#E5F5E5` |
| deleted | `#2C2D2E` | `#2F3032` | `#EFEFEF` |
| modified | `#25323E` | `#283541` | `#E7EFFA` |
| conflict | `#2B2322` | `#2E2626` | `#FFEEEB` |

### 1.3 How the colors are applied (`DiffDrawUtil`, `DiffLineMarkerRenderer`)

* **Line background**: `LineHighlighterBuilder.done()`, `HighlighterTargetArea.LINES_IN_RANGE`.
  * Changed block **with inner (word/char) fragments**: `withIgnored(innerFragments != null)` gives
    `PaintMode.IGNORED`, so the whole line range is painted with the **ignored color** (§1.2).
  * Changed block **without inner fragments** (highlight = by line, or the block is too big for inner
    diff): `PaintMode.DEFAULT`, so the full `DIFF_*` background is used.
* **Inner fragments**: `InlineHighlighterBuilder` paints the full `DIFF_*` background
  (`BackgroundType.DEFAULT`) on the exact character range, at `INLINE_LAYER` above the line layer.
  An empty inner range (pure insertion or deletion inside a line) uses `DiffEmptyHighlighterRenderer`,
  which draws a thin vertical marker in the diff color.
  * Side-by-side: the left editor uses the DELETED/MODIFIED type of the fragment, and the right uses
    INSERTED/MODIFIED. For a MODIFIED block both sides use `DIFF_MODIFIED`.
  * Unified (`createUnifiedChunkHighlighters`): deleted lines use `DELETED` and inserted lines use
    `INSERTED`. Inner fragments use `DELETED` on the old lines and `INSERTED` on the new lines. There is
    no MODIFIED color in unified mode.
* **Empty range** (a pure insertion seen from the other side): there is no background. A **2px
  horizontal line** (`drawChunkBorderLine(..., doubleLine = true)`) in the full `DIFF_*` color is drawn at
  the boundary, in both the editor (line separator renderer) and the gutter.
* **Gutter**: `DiffLineMarkerRenderer.drawMarker` fills the **whole gutter width** (line numbers and
  folding area) with the same color as the editor line, which is the ignored color when `editorMode ==
  IGNORED`. The editor and gutter blocks read as one band.
* **Excluded** (unchecked in partial commit): the editor gets `BackgroundType.NONE` with a 1px `LINE`
  border at top and bottom in the diff color. The gutter is ignored-colored and also gets the border.
* **Resolved** (merge): there is no background, and a 1px *bold dotted* border in the diff color
  (`UIUtil.drawBoldDottedLine`).
* **Error stripe / scrollbar marker**: `DiffStripeMarkerTextAttributes` uses `ERROR_STRIPE_COLOR` (the
  table in §1.1).
* **Divider between panes** (`DiffDividerDrawUtil`): curved polygons (cubic Bézier, control points at
  30%/70% of the width, `CTRL_PROXIMITY_X = 0.3`) filled with `getColor()` (the full color, *not*
  ignored), or with the ignored color when the change is excluded. The divider background is the
  gutter background (`getDividerColor = gutter.getBackground()`), and in New UI that is the **editor
  background** (see §2). `diff.divider.width = 24` (px, before scaling).
* **Collapsed unchanged region** (`DiffLineSeparatorRenderer`): a wavy line drawn across editor, gutter
  and divider.
  * Color: `DIFF_SEPARATOR_WAVE` if it is set, otherwise `DIFF_SEPARATORS_BACKGROUND`, otherwise `Gray._128`.
    Resolved values: **dark `#555555`** (Darcula), **light `#D0D0D0`** (Default).
    (`DIFF_SEPARATORS_BACKGROUND`: Islands/expUI dark `#2B2D30`, light `#E4E6EB`. It is deprecated
    and only used as a fallback.)
  * Geometry: step = `max(24/6, 2)` = **4px** (a quarter period, so the wave period is 16px). The
    half-height is **3px** and the AA gap is 1px. The pattern is vertically centered in the line.
    Stroke is 1px, or **2px when hovered**. Each period is built from 4 quadratic segments:
    `M0,1 Q2,1 4,4 Q6,7 8,7 Q10,7 12,4 Q14,1 16,1` (in a 16×8 image).
  * Hovering shows the description ("N unchanged lines") in a hint box styled with `INLINE_PARAMETER_HINT`.

### 1.4 VCS gutter / line-status colors (used for the gutter change bars in the editor, and by some diff markers)

| Key | Islands Dark / Dark | Light |
|---|---|---|
| `ADDED_LINES_COLOR` | `#549159` | `#7FC784` |
| `MODIFIED_LINES_COLOR` | `#375FAD` | `#88ADF7` |
| `DELETED_LINES_COLOR` | `#868A91` | `#767A8A` |
| `IGNORED_ADDED_LINES_BORDER_COLOR` | `#549159` | `#7FC784` |
| `IGNORED_MODIFIED_LINES_BORDER_COLOR` | `#375FAD` | `#88ADF7` |
| `IGNORED_DELETED_LINES_BORDER_COLOR` | `#868A91` | `#767A8A` |
| `WHITESPACES_MODIFIED_LINES_COLOR` | `#52433D` | `#F7E2CB` |

---

## 2. Editor colors

| Key | Islands Dark | expUI Dark (if different) | Light |
|---|---|---|---|
| `TEXT` background (editor bg) | `#191A1C` | `#1E1F22` | `#FFFFFF` |
| `TEXT` foreground | `#BCBEC4` | | `#080808` |
| `CARET_COLOR` | `#CED0D6` | | `#000000` |
| `CARET_ROW_COLOR` (current line) | `#1F2024` | `#26282E` | `#F5F8FE` |
| `SELECTION_BACKGROUND` | `#214283` (Darcula) | | `#A6D2FF` |
| `SELECTION_FOREGROUND` | empty (keep syntax colors) | | empty |
| `LINE_NUMBERS_COLOR` | `#4B5059` | | `#AEB3C2` |
| `LINE_NUMBER_ON_CARET_ROW_COLOR` | `#A1A3AB` | | `#767A8A` |
| Gutter background | **= editor bg** (`EDITOR_GUTTER_BACKGROUND` is empty, see note) | | **= editor bg** (`GUTTER_BACKGROUND` `#FFFFFF`) |
| `INDENT_GUIDE` | `#323438` | `#313438` | `#EBECF0` |
| `SELECTED_INDENT_GUIDE` | `#4E5157` | `#666870` | `#AEB3C2` |
| `MATCHED_BRACES_INDENT_GUIDE_COLOR` | `#4E5157` | – | `#62B3B3` |
| `VISUAL_INDENT_GUIDE` | `#2B2D30` | | `#DAE6FD` |
| `RIGHT_MARGIN_COLOR` | `#323438` | `#393B40` | `#EBECF0` |
| `WHITESPACES` (rendered whitespace) | `#6F737A` | | `#ADADAD` (Default) |
| `METHOD_SEPARATORS_COLOR` | `#43454A` | | `#DFE1E5` |
| `TEARLINE_COLOR` / `SELECTED_TEARLINE_COLOR` | `#555555` / `#787878` | | `#D4D4D4` / `#9C9C9C` |
| `FOLDED_TEXT_ATTRIBUTES` fg / bg | `#868991` / `#393B40` | | `#414D41` / `#E9F5E6` (effect: underline/box) |
| `FOLDED_TEXT_BORDER_COLOR` | `#2B2D30` | | `#ADD9C7` |
| `MATCHED_BRACE_ATTRIBUTES` | bg `#43454A`, bold | | bg `#93D9D9` |
| `IDENTIFIER_UNDER_CARET_ATTRIBUTES` | bg `#373B39`, stripe `#5B786A` | | bg `#EDEBFC`, stripe `#D0A1FF` |
| `TEXT_SEARCH_RESULT_ATTRIBUTES` | bg `#114957`, effect `#165E70`, stripe `#72D6D6` | | fg `#000000`, bg `#FCD47E`, stripe `#C47233` |
| `SEARCH_RESULT_ATTRIBUTES` | bg `#2D543F`, stripe `#42BD77` | | bg `#CCCCFF`, stripe `#8E8EB2` |
| `INLINE_PARAMETER_HINT` (collapsed-lines hint box) | fg `#858A94`, bg `#393B40` | | (Default) |
| `DOCUMENTATION_COLOR` | `#27282B` | `#2B2D30` | `#FFFFFF` |
| `HINT_BORDER` | `#393B40` | – | – |
| `CONSOLE_BACKGROUND_KEY` | `#191A1C` | `#1E1F22` | `#FFFFFF` |

**Gutter note:** `EditorGutterComponentImpl.getBackground()` calls `EditorGutterColor.getEditorGutterBackgroundColor`.
In New UI that reads `EditorColors.EDITOR_GUTTER_BACKGROUND` ("used in New UI only (instead of
GUTTER_BACKGROUND) and it is null by default"). When it is null, the gutter uses the editor background.
So in both themes the gutter, the line numbers area and the diff divider all use the editor background.

### Scrollbar (editor)

On macOS New UI uses the `ScrollBar.Mac.*` keys from the editor scheme. Other platforms use the
`ScrollBar.*` keys from the UI theme.

| Key | Islands Dark / Dark | Light |
|---|---|---|
| `ScrollBar.Mac.thumbColor` | `#FFFFFF26` | `#00000033` |
| `ScrollBar.Mac.hoverThumbColor` | `#FFFFFF4D` | `#00000080` |
| `ScrollBar.Mac.trackColor` / `hoverTrackColor` | `#80808000` / `#80808000` | same |
| `ScrollBar.thumbColor` (Islands theme JSON) | `#80808059` (border `#26262659`) | `#73737333` (border `#59595933`) |
| `ScrollBar.hoverThumbColor` | `#8080808C` (border `#2626268C`) | `#73737347` (border `#59595947`) |
| `ScrollBar.Transparent.hoverTrackColor` | `#8080801A` | `#8080801A` |

The error stripe (change markers) is drawn in the scrollbar track with `ERROR_STRIPE_COLOR` (§1.1).

---

## 3. UI chrome (toolbar, titles, borders)

Islands values are resolved from the named palette in `ManyIslands*.theme.json`. In the Islands LAF the
diff window sits on a rounded "island" (`Island.arc = 20`, `Island.borderWidth = 6`). The editor area
has the same color as `tool-window-bg`.

| Token | Islands Dark | Islands Light | expUI Dark (for reference) | expUI Light (for reference) |
|---|---|---|---|---|
| Panel / tool window bg (`*.background`, `ToolWindow.background`) | `#191A1C` | `#FFFFFF` (`ToolWindow.background`); dialogs `#F7F8F9` | `#2B2D30` | `#F7F8FA` |
| Main window / outer frame bg (`MainWindow.background`, `MainToolbar.background`) | `#26282C` | `#E9EAEE` | `#2B2D30` | `#27282E` (dark header) |
| Editor bg / `EditorTabs.background` | `#191A1C` | `#FFFFFF` | `#1E1F22` | `#FFFFFF` |
| Borders (`Borders.color`, `EditorPane.splitBorder`, `ToolWindow.Header.borderColor`, `EditorTabs.underTabsBorderColor`, `Editor.Toolbar.borderColor`) | `#26282C` | `#E9EAEE` | `#1E1F22` (`Borders.color`) / `#393B40` (`EditorPane.splitBorder`, `Editor.Toolbar.borderColor`) | `#EBECF0` |
| Text default (`*.foreground`) | `#D1D3D9` | `#000000` | `#DFE1E5` | `#000000` |
| Text muted (`text-muted`) | `#9FA2A8` | `#5F6269` | – | – |
| Info / secondary text (`*.infoForeground`) | `#73767C` | `#73767C` | `#6F737A` | `#818594` |
| Disabled text | `#4C4F56` | `#9FA2A8` | `#5A5D63` | `#A8ADBD` |
| Editor text (`editor-text`) | `#BCBEC4` | `#080808` | `#BCBEC4` | `#080808` |
| Action button hover bg (`ActionButton.hoverBackground`) | `#FFFFFF17` | `#00000012` | `#FFFFFF16` | `#00000012` |
| Action button pressed / toggled bg | `#FFFFFF29` | `#00000020` | `#FFFFFF26` | `#0000001D` |
| Toolbar separator (`ToolBar.separatorColor`) | `#FFFFFF21` | `#00000020` | `#43454A` | `#DFE1E5` |
| Popup bg / border | `#26282C` / `#33353B` | `#FFFFFF` / `#D1D3D9` | `#2B2D30` / `#43454A` | `#FFFFFF` / `#B9BDC9` |
| Selection (list/popup) | `#2A4371` | `#D0DFFE` | `#2E436E` | `#D4E2FF` |
| Inactive selection | `#33353B` | `#E9EAEE` | `#43454A` | – |
| Hover (list) (`selection-bg-hovered`) | `#FFFFFF10` | `#00000008` | `#393B40` | `#EDF3FF` |
| Focus ring / accent (`*.focusColor`, `accent-brand-bg`) | `#3871E1` | `#3871E1` | `#3574F0` | `#3574F0` |
| Link (`Link.activeForeground`) | `#71A1FE` | `#2F5EB9` | `#6B9BFA` | `#315FBD` |
| Control border (`Component.borderColor`, combo) | `#40434A` | `#D1D3D9` | `#4E5157` | `#C9CCD6` |
| Tooltip bg / fg | `#33353B` / `#D1D3D9` | `#FFFFFF` / `#000000` | `#393B40` / `#F0F1F2` | `#27282E` / `#FFFFFF` |
| Icon default stroke (`icon-default-stroke`) | `#C3C5CB` (the SVGs hardcode `#CED0D6`) | `#73767C` (the SVGs hardcode `#6C707E`) | | |
| Error / warning / success text | `#F57E84` / `#D59637` / `#6DB083` | `#C54E58` / … | `#DB5C5C` / `#BA9752` / – | `#DB3B4B` / `#A46704` |
| Merge “no conflicts” status (`VersionControl.Merge.Status.NoConflicts.foreground`) | `#57965C` | `#1F7536` | `#57965C` | `#1F7536` |
| Counter badge bg / fg | `#73767C` / `#000000` | – | `#868A91` / `#000000` | `#A8ADBD` / `#FFFFFF` |

Diff-specific UI keys (Islands): `Diff.ContentTitle.insets = 6,6,6,6` and `Diff.ContentTitle.gap = 6`
(the per-pane title bar above each editor, which shows the file name or revision). The header toolbar
uses `DiffToolbarIslandPanelUI`. Pane titles use the default label font and `*.foreground`. A
read-only side shows a lock icon (`diffDisableEditing`), and the secondary part of the title (revision
or path) uses `*.infoForeground`.

---

## 4. Fonts and metrics

| Item | Value | Source |
|---|---|---|
| Editor font | **JetBrains Mono** (`FontPreferences.JETBRAINS_MONO`, default since 2020.1) | FontPreferences.java |
| Editor font size | **13** (13 when the font is JetBrains Mono or on Windows, otherwise 12) | `DEFAULT_FONT_SIZE` |
| Line spacing | **1.2** | `DEFAULT_LINE_SPACING = 1.2f` |
| Effective line height | ≈ **22px** at 13px: Java `FontMetrics` for JetBrains Mono (ascender 1020, descender −300 per 1000 em) rounds to ascent 14 + descent 4 = 18, × 1.2, ceil = 22. **(computed, verify visually)** | EditorView metrics |
| Line-number font | editor font, size + `editor.gutter.linenumber.font.size.delta` (advanced setting) **(default unverified, assume 0)** | EditorGutterComponentImpl |
| UI font | Inter, 13px on macOS (New UI) **(unverified here, from JBFont/UISettings defaults)** | – |
| Toolbar icons | 16×16 (general/actions/vcs); gutter diff action icons are **14×14** (`expui/diff/*@14x14.svg`) | icons |
| Divider width | 24px | `diff.divider.width` |
| Ligatures | off by default | – |

Font style codes in schemes: `FONT_TYPE` 0 = plain, 1 = bold, 2 = italic, 3 = bold+italic.
`EFFECT_TYPE` 0 = boxed, 1 = underline, 2 = wave underline, 3 = strikeout, 5 = bold dotted line.

---

## 5. Syntax colors (for CodeMirror `HighlightStyle`)

Resolved per scheme with parent fallback. A dash means not defined in the scheme chain: in IntelliJ
these keys fall back through `TextAttributesKey` fallbacks (for example `DEFAULT_LOCAL_VARIABLE` →
`DEFAULT_IDENTIFIER`, `XML_TAG_NAME` → `DEFAULT_KEYWORD`, `XML_ATTRIBUTE_VALUE` → `DEFAULT_STRING`) to
the "effective" value shown in the last column.

| IntelliJ key | Islands Dark (same in expUI Dark) | Light | Effective / notes |
|---|---|---|---|
| `TEXT` / `DEFAULT_IDENTIFIER` | `#BCBEC4` | `#080808` (`DEFAULT_IDENTIFIER` `#000000`) | base text |
| `DEFAULT_KEYWORD` | `#CF8E6D` | `#0033B3` | |
| `DEFAULT_STRING` | `#6AAB73` | `#067D17` | |
| `DEFAULT_VALID_STRING_ESCAPE` | `#CF8E6D` | `#0037A6` | |
| `DEFAULT_INVALID_STRING_ESCAPE` | `#CF8E6D` + wave underline `#FA6675` | `#067D17` on `#FFCCCC` | |
| `DEFAULT_NUMBER` | `#2AACB8` | `#1750EB` | |
| `DEFAULT_LINE_COMMENT` | `#7A7E85` | `#8C8C8C` *italic* | dark: not italic |
| `DEFAULT_BLOCK_COMMENT` | `#7A7E85` | `#8C8C8C` *italic* | |
| `DEFAULT_DOC_COMMENT` | `#5F826B` *italic* | `#8C8C8C` *italic* | |
| `DEFAULT_DOC_COMMENT_TAG` | `#67A37C` underline | underline `#999999` (color inherited from doc comment) | |
| `DEFAULT_DOC_COMMENT_TAG_VALUE` | `#ABADB3` | `#3D3D3D` *italic* | |
| `DEFAULT_DOC_MARKUP` | `#68A67E` | bg `#E2FFE2` | |
| `DEFAULT_FUNCTION_DECLARATION` | `#56A8F5` | `#00627A` | |
| `DEFAULT_FUNCTION_CALL` | `#BCBEC4` (= identifier) | – (text) | calls are **not** colored |
| `DEFAULT_INSTANCE_METHOD` | `#57AAF7` | – (→ function declaration `#00627A`) | |
| `DEFAULT_STATIC_METHOD` | `#57AAF7` *italic* | `#00627A` *italic* | |
| `DEFAULT_INSTANCE_FIELD` (properties) | `#C77DBB` | `#871094` | |
| `DEFAULT_STATIC_FIELD` | `#C77DBB` *italic* | `#871094` *italic* | |
| `DEFAULT_CONSTANT` | `#C77DBB` *italic* | `#871094` *italic* | |
| `DEFAULT_LOCAL_VARIABLE`, `DEFAULT_PARAMETER`, `DEFAULT_GLOBAL_VARIABLE` | – | – | → identifier |
| `DEFAULT_CLASS_NAME`, `DEFAULT_CLASS_REFERENCE`, `DEFAULT_INTERFACE_NAME` | `#BCBEC4` | – | → identifier |
| `TYPE_PARAMETER_NAME_ATTRIBUTES` | `#16BAAC` | `#007E8A` | |
| `DEFAULT_METADATA` (annotations, attributes `#[...]`) | `#B3AE60` | `#9E880D` | |
| `DEFAULT_OPERATION_SIGN`, `BRACES`, `BRACKETS`, `PARENTHS`, `COMMA`, `SEMICOLON`, `DOT` | `#BCBEC4` | – (text) | |
| `DEFAULT_LABEL` | underline `#808080` | underline `#808080` | |
| `TEMPLATE_VARIABLE_ATTRIBUTES` | `#B189F5` | `#7F0000` *italic* | |
| `NOT_USED_ELEMENT_ATTRIBUTES` | `#6F737A` | `#808080` | |
| `TODO_DEFAULT_ATTRIBUTES` | `#8BB33D` *italic* | `#008DDE` *italic* | |
| `BAD_CHARACTER` | `#F75464` wave | bg `#FFCCCC` | |
| `ERRORS_ATTRIBUTES` | wave `#FA6675`, stripe `#D64D5B` | wave `#FF0000`, stripe `#CF5B56` | |
| `WARNING_ATTRIBUTES` | wave `#F2C55C`, stripe `#C29E4A` | bg `#FCF4D4`, stripe `#F2BF57` | |
| `HYPERLINK_ATTRIBUTES` | `#548AF7` underline | `#006DCC` underline | |
| **Markup** | | | |
| `XML_TAG_NAME` / `HTML_TAG_NAME` | `#D5B778` | – | light → keyword `#0033B3` |
| `XML_TAG` / `HTML_TAG` (`<`, `>`) | `#D5B778` | – | light → text |
| `XML_ATTRIBUTE_NAME` | `#BCBEC4` | – | light → `DEFAULT_ATTRIBUTE` `#174AD4` |
| `HTML_ATTRIBUTE_NAME` | `#BABABA` (Darcula, still inherited) | – | light → `#174AD4` |
| `HTML_ATTRIBUTE_VALUE` / `XML_ATTRIBUTE_VALUE` | `#6AAB73` | – | light → string `#067D17` |
| `XML_ENTITY_REFERENCE` / `HTML_ENTITY_REFERENCE` | `#56A8F5` | – | light → `DEFAULT_ENTITY` `#174BE6` |
| `XML_CUSTOM_TAG_NAME` / `HTML_CUSTOM_TAG_NAME` | `#2FBAA3` | `#008077` | |
| `XML_PROLOGUE` | `#D5B778` | *italic* | |
| `DEFAULT_ATTRIBUTE` (generic markup attribute) | – | `#174AD4` | |
| **CSS / JS** | | | |
| `CSS.COLOR`, `CSS.URL`, `CSS.IMPORTANT` | `#56A8F5`, `#5C92FF`, `#CF8E6D` bold | – | CSS property names fall back to `DEFAULT_INSTANCE_FIELD` (`#C77DBB` / `#871094`) |
| `JS.REGEXP` | `#42C3D4` | `#264EFF` | |
| `JS.GLOBAL_VARIABLE` | `#C77DBA` *italic* | `#830091` | |
| `JS.LOCAL_VARIABLE` | – (identifier) | `#2A8C7C` | |
| `JS.INSTANCE_MEMBER_FUNCTION`, `JS.GLOBAL_FUNCTION` | `#56A8F5` | – (→ function declaration) | |
| `MARKDOWN_CODE_SPAN` | `#BCBEC4` on `#2B2D30` | – | |

### PHP (PhpStorm) **(unverified)**

The PHP plugin and its color-scheme additions (`PHP_VAR`, `PHP_PARAMETER`, `PHP_HEREDOC_*`, …) are
closed source and **not** in intellij-community, so none of these values could be read from source.
What is known:

* Classic **Darcula**: `PHP_VAR` = `#9876AA` (purple).
* In the New UI schemes, PHP keywords, strings, numbers, comments, functions, constants and fields
  use the `DEFAULT_*` values above. `$this` uses the keyword color. `->prop` uses instance field
  (`#C77DBB` / `#871094`). Constants (`FOO`, `true`, `null`) use keyword or constant colors.
  `#[Attr]` uses `DEFAULT_METADATA`.
* Suggested default until checked against a real PhpStorm export (Settings → Editor → Color Scheme
  → Export as XML): `--idd-syntax-php-var` = **dark `#C77DBB`, light `#871094`** (the "variable/field"
  purple of the New UI schemes). Keep it a separate token so it is easy to correct.

### Suggested `@lezer/highlight` tag mapping

| Lezer tag(s) | Token |
|---|---|
| `keyword`, `controlKeyword`, `moduleKeyword`, `operatorKeyword`, `definitionKeyword`, `modifier`, `self`, `null`, `bool`, `atom` | keyword |
| `string`, `special(string)`, `character`, `attributeValue` | string |
| `escape` | string-escape (keyword color) |
| `regexp` | regexp |
| `number`, `integer`, `float` | number |
| `lineComment`, `blockComment`, `comment` | comment |
| `docComment` | doc-comment |
| `function(definition(variableName))`, `function(definition(propertyName))` | function-decl |
| `function(variableName)`, `function(propertyName)` | function-call (= text; IntelliJ does not color calls) |
| `variableName`, `local(variableName)` | text |
| `special(variableName)` (PHP `$var` in lang-php) | php-var |
| `propertyName`, `definition(propertyName)` | field |
| `constant(variableName)`, `standard(variableName)` | constant |
| `typeName`, `className`, `namespace` | text |
| `meta`, `annotation`, `processingInstruction` | metadata |
| `tagName` | tag (dark `#D5B778`, light `#0033B3`) |
| `angleBracket` (in markup) | tag-bracket (dark `#D5B778`, light text) |
| `attributeName` | attribute (dark `#BCBEC4`/`#BABABA`, light `#174AD4`) |
| `invalid` | error |
| `operator`, `punctuation`, `bracket`, `separator` | text |
| `link`, `url` | link |
| `heading` | bold keyword (Markdown) |

---

## 6. Icons

Copied to `packages/viewer/src/icons/svg/<group>-<file>.svg`. `index.ts` exports `<name>` (light) and
`<name>Dark`, plus `icons`, `getIcon()` and `ALL_ICONS_MAPPING`. The New UI mapping comes from
`platform/icons/src/PlatformIconMappings.json` (`AllIcons.X` resolves to `expui/...`).

| Diff action (IntelliJ class / id) | `AllIcons` | expUI file | Export |
|---|---|---|---|
| Previous / Next Difference (`DiffPreviousDifferenceAction` / `DiffNextDifferenceAction`, ids `PreviousDiff` / `NextDiff`) | `Actions.PreviousOccurence` / `NextOccurence` | `general/up`, `general/down` | `generalUp`, `generalDown` |
| Previous / Next File (`DiffPreviousFileAction` / `DiffNextFileAction`, ids `Diff.PrevChange` / `Diff.NextChange`) | `Actions.Back` / `Actions.Forward` | `general/left`, `general/right` | `generalLeft`, `generalRight` |
| Jump to Source (`Diff.OpenInEditor`) | `Actions.EditSource` | `general/edit` | `generalEdit` |
| Diff settings (gear menu) | `General.GearPlain` | `general/settings` | `generalSettings` |
| Viewer: side-by-side / unified (`Diff.SideBySide` / `Diff.Unified`) | `Diff.SideBySide`, `Diff.Unified` | `diff/sideBySide`, `diff/unified` | `diffSideBySide`, `diffUnified` |
| Collapse unchanged fragments | `Actions.Collapseall` | `general/collapseAll` | `generalCollapseAll` |
| Expand all | `Actions.Expandall` | `general/expandAll` | `generalExpandAll` |
| Synchronize scrolling | `Actions.SynchronizeScrolling` | `actions/synchronizeScrolling` | `actionsSynchronizeScrolling` |
| Swap sides (`SwapSidesInDiffWindow`) | `Actions.SwapPanels` | `actions/swapPanels` | `actionsSwapPanels` |
| Highlighting mode | `Actions.Highlighting` | `actions/highlighting` | `actionsHighlighting` |
| Refresh | `Actions.Refresh` | `general/refresh` | `generalRefresh` |
| Dropdown chevron (combo-box actions) | `General.LinkDropTriangle` / `ArrowDown` | `general/chevronDown` | `generalChevronDown` |
| Checked menu item | `Actions.Checked` | `actions/checked` | `actionsChecked` |
| Read-only lock (`Diff.Lock`, `Ide.Readonly`) | `Diff.Lock` | `diff/disableEditing` | `diffDisableEditing` (also `generalLocked`) |
| Gutter: apply change → / ← (`ApplySelectedChanges`) | `Diff.Arrow`, `Diff.ArrowRight` | `diff/arrow@14x14`, `diff/arrowRight@14x14` | `diffArrow`, `diffArrowRight` |
| Gutter: append (`Diff.AppendLeft/RightSide`) | `Diff.ArrowLeftDown`, `Diff.ArrowRightDown` | `diff/arrowLeftDown@14x14`, `diff/arrowRightDown@14x14` | `diffArrowLeftDown`, `diffArrowRightDown` |
| Gutter: revert (`Diff.Revert`) | `Diff.Revert` | `diff/revert@14x14` | `diffRevert` |
| Gutter: ignore / remove (merge `X`) | `Diff.Remove` | `diff/remove@14x14` | `diffRemove` |
| Gutter: include/exclude checkbox | `Diff.GutterCheckBox*` | `diff/gutterCheckBox*@14x14` | `diffGutterCheckBox`, `…Selected`, `…Indeterminate` |
| Merge: Apply non-conflicting changes (all / left / right) | `Diff.ApplyNotConflicts*` | `diff/applyNotConflicts*` | `diffApplyNotConflicts`, `…Left`, `…Right` |
| Merge: resolve simple conflicts (magic wand) | `Diff.MagicResolve`, `MagicResolveToolbar` | `diff/magicResolve@14x14`, `diff/magicResolveToolbar` | `diffMagicResolve`, `diffMagicResolveToolbar` |
| Merge/3-way: compare panes | `Diff.Compare3LeftMiddle/LeftRight/MiddleRight` | `diff/compare3*` | `diffCompare3*` (and `diffCompare4*`) |
| Arrow left-right (both) | `Diff.ArrowLeftRight` | `diff/arrowLeftRight` | `diffArrowLeftRight` |
| Accept left / right (merge toolbar) | `Vcs.Arrow_left` / `Arrow_right` | `vcs/arrowLeft`, `vcs/arrowRight` | `vcsArrowLeft`, `vcsArrowRight` |
| Compare / diff | `Actions.Diff` | `vcs/diff` | `vcsDiff` |
| Compare with clipboard | `Actions.DiffWithClipboard` | `actions/diffWithClipboard` | `actionsDiffWithClipboard` |
| First / prev / next / last (merge conflict navigation) | `Actions.Play_*` | `actions/play*` | `actionsPlayFirst`, … |
| Close / more / search / copy / undo / redo / soft wrap / show/hide whitespace / help | various | `general/*` | `generalClose`, `generalCloseSmall`, `generalMoreHorizontal`, `generalSearch`, `generalCopy`, `generalUndo`, `generalRedo`, `generalSoftWrap`, `generalShow`, `generalHide`, `generalHelp` |
| Status (identical contents, all resolved, warnings) | `Status.Success`, `General.Warning` | `status/*` | `statusSuccess`, `statusWarning`, `statusError`, `statusInfo` |

Icon colors are hardcoded in the SVGs: light stroke `#6C707E`, dark stroke `#CED0D6`. Accent icons
(green check, status) carry their own colors. Disabled icons in IntelliJ are drawn with reduced
opacity (≈ 0.5). Use `opacity: .5` in CSS.

---

## 7. CSS custom properties (`--idd-*`)

Ready to paste into the injected stylesheet. Derived values (ignored colors) are pre-computed, so
no runtime mixing is needed for the default themes. If a consumer overrides `--idd-editor-bg` or a
`--idd-diff-*-bg`, the viewer should recompute `--idd-diff-*-ignored-bg` with the §1.2 formula, or use
`color-mix(in srgb, var(--idd-diff-inserted-bg) 40%, var(--idd-editor-bg))`. That gives the same
result within rounding.

```css
/* IntelliJ New UI — Islands Dark (editor scheme "Islands Dark" + ManyIslandsDark LAF) */
.idd-root.idd-theme-dark {
  color-scheme: dark;
  /* fonts */
  --idd-font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --idd-font-size: 13px;
  --idd-line-height: 22px;              /* 13px JetBrains Mono x 1.2 line spacing, as IntelliJ rounds it */
  --idd-ui-font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --idd-ui-font-size: 13px;

  /* editor */
  --idd-editor-bg: #191a1c;
  --idd-editor-fg: #bcbec4;
  --idd-caret: #ced0d6;
  --idd-caret-row-bg: #1f2024;
  --idd-selection-bg: #214283;
  --idd-gutter-bg: #191a1c;             /* New UI: gutter = editor bg */
  --idd-line-number: #4b5059;
  --idd-line-number-caret-row: #a1a3ab;
  --idd-indent-guide: #323438;
  --idd-indent-guide-selected: #4e5157;
  --idd-right-margin: #323438;
  --idd-whitespace: #6f737a;
  --idd-folded-fg: #868991;
  --idd-folded-bg: #393b40;
  --idd-folded-border: #2b2d30;
  --idd-matched-brace-bg: #43454a;
  --idd-search-result-bg: #114957;
  --idd-identifier-under-caret-bg: #373b39;
  --idd-hint-fg: #858a94;               /* INLINE_PARAMETER_HINT (collapsed-lines label) */
  --idd-hint-bg: #393b40;

  /* diff */
  --idd-diff-inserted-bg: #294436;
  --idd-diff-inserted-ignored-bg: #1f2b26;
  --idd-diff-inserted-stripe: #447152;
  --idd-diff-deleted-bg: #484a4a;
  --idd-diff-deleted-ignored-bg: #2c2d2e;
  --idd-diff-deleted-stripe: #656e76;
  --idd-diff-modified-bg: #385570;
  --idd-diff-modified-ignored-bg: #25323e;
  --idd-diff-modified-stripe: #43698d;
  --idd-diff-conflict-bg: #45302b;
  --idd-diff-conflict-ignored-bg: #2b2322;
  --idd-diff-conflict-stripe: #8f5247;
  --idd-diff-separator-wave: #555555;   /* DIFF_SEPARATOR_WAVE (collapsed unchanged lines) */
  --idd-diff-separator-bg: #2b2d30;     /* DIFF_SEPARATORS_BACKGROUND (deprecated fallback) */
  --idd-divider-bg: #191a1c;            /* = gutter bg */
  --idd-divider-width: 24px;
  --idd-vcs-added: #549159;
  --idd-vcs-modified: #375fad;
  --idd-vcs-deleted: #868a91;

  /* scrollbar */
  --idd-scrollbar-thumb: #ffffff26;
  --idd-scrollbar-thumb-hover: #ffffff4d;
  --idd-scrollbar-track: transparent;

  /* chrome */
  --idd-panel-bg: #191a1c;
  --idd-window-bg: #26282c;
  --idd-toolbar-bg: #191a1c;
  --idd-border: #26282c;
  --idd-fg: #d1d3d9;
  --idd-fg-muted: #9fa2a8;
  --idd-fg-secondary: #73767c;
  --idd-fg-disabled: #4c4f56;
  --idd-title-fg: #d1d3d9;
  --idd-title-secondary-fg: #73767c;
  --idd-button-hover-bg: #ffffff17;
  --idd-button-pressed-bg: #ffffff29;
  --idd-toolbar-separator: #ffffff21;
  --idd-popup-bg: #26282c;
  --idd-popup-border: #33353b;
  --idd-list-selection-bg: #2a4371;
  --idd-list-hover-bg: #ffffff10;
  --idd-focus: #3871e1;
  --idd-accent: #3871e1;
  --idd-link: #71a1fe;
  --idd-control-border: #40434a;
  --idd-tooltip-bg: #33353b;
  --idd-tooltip-fg: #d1d3d9;
  --idd-error-fg: #f57e84;
  --idd-warning-fg: #d59637;
  --idd-success-fg: #57965c;

  /* syntax */
  --idd-syntax-keyword: #cf8e6d;
  --idd-syntax-string: #6aab73;
  --idd-syntax-string-escape: #cf8e6d;
  --idd-syntax-number: #2aacb8;
  --idd-syntax-comment: #7a7e85;
  --idd-syntax-comment-style: normal;
  --idd-syntax-doc-comment: #5f826b;
  --idd-syntax-doc-tag: #67a37c;
  --idd-syntax-function-decl: #56a8f5;
  --idd-syntax-method: #57aaf7;
  --idd-syntax-function-call: #bcbec4;
  --idd-syntax-variable: #bcbec4;
  --idd-syntax-field: #c77dbb;
  --idd-syntax-constant: #c77dbb;         /* italic */
  --idd-syntax-global: #c77dba;           /* italic (JS globals) */
  --idd-syntax-type: #bcbec4;
  --idd-syntax-type-parameter: #16baac;
  --idd-syntax-metadata: #b3ae60;
  --idd-syntax-operator: #bcbec4;
  --idd-syntax-tag: #d5b778;
  --idd-syntax-tag-bracket: #d5b778;
  --idd-syntax-attribute: #bababa;
  --idd-syntax-attribute-value: #6aab73;
  --idd-syntax-entity: #56a8f5;
  --idd-syntax-regexp: #42c3d4;
  --idd-syntax-label: #bcbec4;
  --idd-syntax-todo: #8bb33d;
  --idd-syntax-link: #548af7;
  --idd-syntax-invalid: #f75464;
  --idd-syntax-php-var: #c77dbb;          /* unverified (PhpStorm-only key) */
}

/* IntelliJ New UI — Islands Light (editor scheme "Light" + ManyIslandsLight LAF) */
.idd-root.idd-theme-light {
  color-scheme: light;
  --idd-font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --idd-font-size: 13px;
  --idd-line-height: 22px;
  --idd-ui-font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --idd-ui-font-size: 13px;

  --idd-editor-bg: #ffffff;
  --idd-editor-fg: #080808;
  --idd-caret: #000000;
  --idd-caret-row-bg: #f5f8fe;
  --idd-selection-bg: #a6d2ff;
  --idd-gutter-bg: #ffffff;
  --idd-line-number: #aeb3c2;
  --idd-line-number-caret-row: #767a8a;
  --idd-indent-guide: #ebecf0;
  --idd-indent-guide-selected: #aeb3c2;
  --idd-right-margin: #ebecf0;
  --idd-whitespace: #adadad;
  --idd-folded-fg: #414d41;
  --idd-folded-bg: #e9f5e6;
  --idd-folded-border: #add9c7;
  --idd-matched-brace-bg: #93d9d9;
  --idd-search-result-bg: #fcd47e;
  --idd-identifier-under-caret-bg: #edebfc;
  --idd-hint-fg: #6c707e;               /* (unverified, Default INLINE_PARAMETER_HINT) */
  --idd-hint-bg: #ebecf0;

  --idd-diff-inserted-bg: #bee6be;
  --idd-diff-inserted-ignored-bg: #e5f5e5;
  --idd-diff-inserted-stripe: #aadeaa;
  --idd-diff-deleted-bg: #d6d6d6;
  --idd-diff-deleted-ignored-bg: #efefef;
  --idd-diff-deleted-stripe: #c8c8c8;
  --idd-diff-modified-bg: #c2d8f2;
  --idd-diff-modified-ignored-bg: #e7effa;
  --idd-diff-modified-stripe: #b6d2f2;
  --idd-diff-conflict-bg: #ffd5cc;
  --idd-diff-conflict-ignored-bg: #ffeeeb;
  --idd-diff-conflict-stripe: #ffc8bd;
  --idd-diff-separator-wave: #d0d0d0;
  --idd-diff-separator-bg: #e4e6eb;
  --idd-divider-bg: #ffffff;
  --idd-divider-width: 24px;
  --idd-vcs-added: #7fc784;
  --idd-vcs-modified: #88adf7;
  --idd-vcs-deleted: #767a8a;

  --idd-scrollbar-thumb: #00000033;
  --idd-scrollbar-thumb-hover: #00000080;
  --idd-scrollbar-track: transparent;

  --idd-panel-bg: #ffffff;
  --idd-window-bg: #e9eaee;
  --idd-toolbar-bg: #ffffff;
  --idd-border: #e9eaee;
  --idd-fg: #000000;
  --idd-fg-muted: #5f6269;
  --idd-fg-secondary: #73767c;
  --idd-fg-disabled: #9fa2a8;
  --idd-title-fg: #000000;
  --idd-title-secondary-fg: #73767c;
  --idd-button-hover-bg: #00000012;
  --idd-button-pressed-bg: #00000020;
  --idd-toolbar-separator: #00000020;
  --idd-popup-bg: #ffffff;
  --idd-popup-border: #d1d3d9;
  --idd-list-selection-bg: #d0dffe;
  --idd-list-hover-bg: #00000008;
  --idd-focus: #3871e1;
  --idd-accent: #3871e1;
  --idd-link: #2f5eb9;
  --idd-control-border: #d1d3d9;
  --idd-tooltip-bg: #ffffff;
  --idd-tooltip-fg: #000000;
  --idd-error-fg: #c54e58;
  --idd-warning-fg: #a46704;
  --idd-success-fg: #1f7536;

  --idd-syntax-keyword: #0033b3;
  --idd-syntax-string: #067d17;
  --idd-syntax-string-escape: #0037a6;
  --idd-syntax-number: #1750eb;
  --idd-syntax-comment: #8c8c8c;
  --idd-syntax-comment-style: italic;
  --idd-syntax-doc-comment: #8c8c8c;      /* italic */
  --idd-syntax-doc-tag: #8c8c8c;          /* underline #999999 */
  --idd-syntax-function-decl: #00627a;
  --idd-syntax-method: #00627a;
  --idd-syntax-function-call: #080808;
  --idd-syntax-variable: #080808;
  --idd-syntax-field: #871094;
  --idd-syntax-constant: #871094;         /* italic */
  --idd-syntax-global: #830091;
  --idd-syntax-type: #080808;
  --idd-syntax-type-parameter: #007e8a;
  --idd-syntax-metadata: #9e880d;
  --idd-syntax-operator: #080808;
  --idd-syntax-tag: #0033b3;
  --idd-syntax-tag-bracket: #080808;
  --idd-syntax-attribute: #174ad4;
  --idd-syntax-attribute-value: #067d17;
  --idd-syntax-entity: #174be6;
  --idd-syntax-regexp: #264eff;
  --idd-syntax-label: #080808;
  --idd-syntax-todo: #008dde;
  --idd-syntax-link: #006dcc;
  --idd-syntax-invalid: #f50000;
  --idd-syntax-php-var: #871094;          /* unverified (PhpStorm-only key) */
}
```

Optional expUI “Dark” (2023–2025.1 New UI) overrides on top of the Islands Dark block:
`--idd-editor-bg/--idd-gutter-bg/--idd-divider-bg: #1e1f22; --idd-caret-row-bg: #26282e;
--idd-indent-guide: #313438; --idd-indent-guide-selected: #666870; --idd-right-margin: #393b40;
--idd-diff-inserted-ignored-bg: #222e2a; --idd-diff-deleted-ignored-bg: #2f3032;
--idd-diff-modified-ignored-bg: #283541; --idd-diff-conflict-ignored-bg: #2e2626;
--idd-panel-bg/--idd-toolbar-bg/--idd-window-bg: #2b2d30; --idd-border: #1e1f22; --idd-fg: #dfe1e5;
--idd-fg-secondary: #6f737a; --idd-popup-border: #43454a; --idd-list-selection-bg: #2e436e;
--idd-accent/--idd-focus: #3574f0; --idd-link: #6b9bfa; --idd-toolbar-separator: #43454a`.
