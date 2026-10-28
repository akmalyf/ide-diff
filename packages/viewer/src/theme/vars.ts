// Generated from docs/research/theme.md §7 — IntelliJ New UI (Islands) color tokens.
export const themeVarsCss = `
/* IntelliJ New UI — Islands Dark (editor scheme "Islands Dark" + ManyIslandsDark LAF) */
.idd-theme-dark {
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
.idd-theme-light {
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
`;
