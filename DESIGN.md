---
name: CodeMerge
description: A theme-adaptive, density-first Git client rendered inside VS Code webviews.
colors:
  text: "var(--vscode-foreground)"
  muted: "var(--vscode-descriptionForeground)"
  surface: "var(--vscode-editor-background)"
  pane: "var(--vscode-sideBar-background)"
  pane-alt: "var(--vscode-list-inactiveSelectionBackground)"
  chrome: "var(--vscode-titleBar-activeBackground)"
  line: "var(--vscode-panel-border)"
  line-soft: "var(--vscode-widget-border, var(--vscode-panel-border))"
  blue: "var(--vscode-focusBorder)"
  blue-soft: "var(--vscode-list-activeSelectionBackground)"
  purple: "var(--vscode-charts-purple)"
  green: "var(--vscode-gitDecoration-addedResourceForeground)"
  danger: "var(--vscode-errorForeground)"
  refs-blue: "#3f78b7"
  status-red: "#bc4d4d"
  input: "var(--vscode-input-background)"
  button-bg: "var(--vscode-button-secondaryBackground)"
  row-hover: "var(--vscode-list-hoverBackground)"
typography:
  ui:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "var(--vscode-editor-font-family)"
    fontSize: "var(--vscode-editor-font-size)"
    fontWeight: 400
    lineHeight: 1.45
  subject:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "normal"
  micro:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "10px"
    fontWeight: 400
rounded:
  badge: "2px"
  control: "3px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "18px"
components:
  button-toolbar:
    backgroundColor: "{colors.button-bg}"
    textColor: "var(--vscode-button-secondaryForeground)"
    rounded: "{rounded.control}"
    height: "22px"
    padding: "0 8px"
  button-toolbar-hover:
    backgroundColor: "var(--vscode-button-secondaryHoverBackground)"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    width: "26px"
    height: "24px"
  button-icon-active:
    backgroundColor: "var(--vscode-button-background)"
    textColor: "var(--vscode-button-foreground)"
  row-branch:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    height: "20px"
    padding: "0 10px 0 18px"
  row-branch-current:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.text}"
  row-file:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.text}"
    height: "28px"
  input-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "24px"
    padding: "0 6px"
---

# Design System: CodeMerge

## 1. Overview

**Creative North Star: "The Theme Chameleon"**

CodeMerge owns almost no color of its own. Every surface, border, and accent resolves through a `var(--vscode-*)` token, so the client wears whatever theme the editor wears: Dark+, Light+, Solarized, High Contrast, all of them, with zero per-theme work. Identity here is adaptiveness, not a signature palette. The three hardcoded values in the entire stylesheet (a refs blue, a status red, a menu shadow) are the exceptions that prove the rule, and each is a candidate for tokenization.

The second law is density. The base font is 12px, drops to 11px and 10px for metadata, and the layout is a Sublime Merge-style three-column control surface (locations, commits, content/diff) packed edge to edge. Controls are 22 to 28px tall. Radii are 2 to 3px. There is no decorative padding, no card chrome, no illustration. This is a power tool for developers who already know Git and want to read repo state in under a second, then act in one gesture.

What it rejects: bloated desktop GUI clients with toolbar forests, playful consumer-SaaS gloss (pastel cards, mascots, big rounded corners), and the generic AI-dashboard kit (gradient hero metrics, identical card grids, colored side-stripe borders). None of those appear here, and none may be added.

**Key Characteristics:**
- Color sourced from VS Code theme tokens, never hardcoded.
- Information-dense: 12px base, 10–11px metadata, 20–28px control heights.
- Flat by default; the only shadow lifts floating menus.
- Tight radii (2–3px); no card containers.
- Mono (`--vscode-editor-font-family`) for code, paths, and commit metadata.

## 2. Colors

The palette is not a palette: it is a set of semantic bindings to the active VS Code theme. Describe roles, not hues, because the hue changes with every theme switch.

### Primary
- **Focus Blue** (`var(--vscode-focusBorder)`): the single interaction accent. Hover borders on controls, resizer hover, the commit-graph node, selected-line outline, and the 2px rail on the left of commit rows. This is the "you can act here" color.
- **Selection Blue** (`var(--vscode-list-activeSelectionBackground)`): selected/hovered row fill across branches, files, commits, and the diff/working-dir header bands. The dominant tinted surface.

### Secondary
- **Graph Purple** (`var(--vscode-charts-purple)`): every third commit row's rail, the only non-blue graph accent, used purely to break visual monotony in long histories.

### Tertiary
- **Added Green** (`var(--vscode-gitDecoration-addedResourceForeground)`): staged-file badge text and the inserted-line diff tint. Git semantics, never decoration.
- **Refs Blue** (`#3f78b7`): branch/tag ref labels in commit rows. One of two hardcoded colors; a tokenization candidate (`--vscode-gitDecoration-*` or charts blue).

### Neutral
- **Text** (`var(--vscode-foreground)`): primary content.
- **Muted** (`var(--vscode-descriptionForeground)`): metadata, timestamps, pane headers, inactive tabs, branch rows at rest.
- **Surface** (`var(--vscode-editor-background)`): main content/diff/commit backgrounds.
- **Pane** (`var(--vscode-sideBar-background)`): rails, headers, file rows, list chrome.
- **Pane-Alt** (`var(--vscode-list-inactiveSelectionBackground)`): count chips and small badges.
- **Line / Line-Soft** (`var(--vscode-panel-border)` / `--vscode-widget-border`): hairline dividers and grid separators.
- **Danger** (`var(--vscode-errorForeground)`): discard button text, deleted-line tint fallback. Status-red `#bc4d4d` is a second hardcoded exception on the unstaged status badge.

### Named Rules
**The Borrowed Color Rule.** No hardcoded hex except where a VS Code token genuinely does not exist. Today that is exactly two values (`#3f78b7`, `#bc4d4d`) plus one shadow rgba. Adding a third is forbidden without first proving no `--vscode-*` token fits.

**The One Accent Rule.** Focus Blue is the only interaction accent. Purple is a graph-rhythm device, green/red are Git status semantics. Do not introduce a fourth "brand" color; the theme already has one.

## 3. Typography

**UI Font:** `var(--vscode-font-family)` (the editor's configured UI face)
**Code/Mono Font:** `var(--vscode-editor-font-family)` (used for diffs, file paths, commit hashes, subject lines in the summary pane)

**Character:** There is no type personality of its own, by design: it inherits the developer's chosen editor fonts. The system's expression is scale and weight discipline, not typeface selection. Mono signals "this is data from Git"; UI sans signals "this is chrome."

### Hierarchy
- **Subject** (700, 12–13px): commit subjects and summary headlines. The heaviest weight carries the most-scanned text.
- **Title / Heading** (700, 11–12px, often UPPERCASE): location group headings, working-directory title. Uppercase + bold for sectioning, never for body.
- **Body / UI** (400, 12px, 1.4): default interface text, button labels, rows.
- **Code** (400, `--vscode-editor-font-size`, 1.45): diff text (`white-space: pre`), file paths, hashes, metadata values. Always mono.
- **Micro** (400, 10–11px): timestamps, refs, file times, hunk headers. The density floor.

### Named Rules
**The Mono-Means-Git Rule.** Anything that is literal repository data (paths, hashes, diff lines, commit metadata values) renders in `--vscode-editor-font-family`. Anything that is interface chrome renders in `--vscode-font-family`. Never mix the two roles.

## 4. Elevation

Flat by default. Panes, rows, headers, and diff surfaces sit at a single plane, separated by 1px hairline borders (`--vscode-panel-border` / `--vscode-widget-border`) and tonal background shifts (pane vs surface vs pane-alt), not shadow. Depth is communicated by tone and border, the VS Code way.

### Shadow Vocabulary
- **Menu Lift** (`box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0,0,0,0.24))`): the only shadow in the system. Applied exclusively to floating context menus to separate them from the surface they overlay.

### Named Rules
**The Flat-Plane Rule.** Surfaces are flat at rest and stay flat on hover. Hover changes background tint, never elevation. The single shadow is reserved for genuinely floating layers (context menus). No resting shadows, no card lift, ever.

## 5. Components

### Buttons
- **Shape:** subtle rounding (3px control radius, `--rounded.control`); badges 2px; never pill except graph nodes.
- **Toolbar:** secondary-button tokens, 22px tall, 3px radius, `0 8px` padding; hover swaps to `--vscode-button-secondaryHoverBackground`.
- **Icon:** 26px wide, transparent at rest, currentColor 14px stroke icon; `.active` fills with primary button tokens to show a toggled state.
- **Hover / Focus:** border shifts to Focus Blue, `outline: none`. Interaction is signaled by border color, not glow.
- **Row-revealed actions:** `.commitAction` sits at `opacity: 0` and fades in on row hover/selection. Actions hide until the row is engaged.

### Rows (signature pattern)
- **Branch row:** 20px tall, transparent, muted text; hover fills with `--row-hover` and promotes text to full foreground; `.current` is bold with a 45%-mixed selection-blue fill.
- **File row:** 28px, fixed 160–260px columns in a horizontal strip, 24/14/1fr grid (status badge, icon, path); selected/hover fills selection-blue.
- **Commit row:** 54px min, a 2px left rail (Focus Blue, Graph Purple on every third), a graph node, bold subject, muted mono metadata, and a hidden hover action.

### Status Badges
- **Style:** 26x16px, 2px radius, pane-alt background, 10px 700 text.
- **State:** unstaged uses status-red `#bc4d4d`; `.staged` drops the background to transparent and switches text to Added Green. Status is encoded by color AND glyph/letter, never color alone.

### Inputs / Fields
- **Style:** input-background fill, 1px input-border, 3px radius, 24px tall, `0 6px` padding.
- **Focus:** border shifts to Focus Blue, outline removed. No glow, no ring beyond the border change.
- **Inline search:** borderless, transparent, right-aligned, muted, until promoted to a real bordered field in the working-directory bar.

### Navigation / Tabs
- **Style:** `.detailTab` / `.stripTab` flat, 1px right divider, pane background, muted text; `.activeTab` switches to surface background, full foreground, 600 weight. No underline, no pill, no animation.

### Resizers
- **Style:** 5px col-resize handles between columns and diff panes; 80%-mixed line color at rest, Focus Blue on hover/focus. The only draggable chrome; `--locations-width`, `--commits-width`, `--diff-left` persist layout.

## 6. Do's and Don'ts

### Do:
- **Do** source every color from a `var(--vscode-*)` token so the UI tracks the active theme, including High Contrast and High Contrast Light.
- **Do** keep the base at 12px and reach for 11px/10px for metadata; density is the product.
- **Do** keep radii at 2–3px and dividers at 1px hairlines.
- **Do** use mono (`--vscode-editor-font-family`) for all literal Git data and UI sans for chrome (The Mono-Means-Git Rule).
- **Do** pair status color with a glyph, letter, or position, never color alone (color-blind safety).
- **Do** signal interaction with a Focus Blue border shift; reserve the one shadow for floating menus only.
- **Do** respect `prefers-reduced-motion`; the opacity reveals and hover tints must never be required to understand state.

### Don't:
- **Don't** hardcode a hex without proving no `--vscode-*` token fits; the system has exactly two such exceptions (`#3f78b7`, `#bc4d4d`) and they are debts, not patterns.
- **Don't** add resting shadows or card lift. Flat plane at rest, tint on hover (The Flat-Plane Rule).
- **Don't** use `border-left`/`border-right` over 1px as a colored accent stripe on rows, callouts, or alerts. The 2px commit rail is a graph node connector, not a decorative stripe, and is the only exception.
- **Don't** introduce playful consumer-SaaS gloss: pastel cards, big rounded corners, mascots, illustrations.
- **Don't** ship the generic AI-dashboard kit: gradient hero metrics, identical card grids, gradient text (`background-clip: text`), glassmorphism.
- **Don't** wrap content in card containers; this UI is panes and rows, not cards. Nested cards are always wrong.
- **Don't** add a fourth brand accent. Focus Blue is the accent; purple is graph rhythm; green/red are Git status.
