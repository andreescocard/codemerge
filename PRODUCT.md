# Product

## Register

product

## Users

Developers who already know Git and want a fast visual client instead of typing commands. Their context: mid-task inside VS Code, switching between writing code and managing changes (stage, commit, branch, diff, history). They reach for CodeMerge to do Git work without leaving the editor or remembering exact CLI flags. They value speed and information density over hand-holding; the UI is a power tool, not a tutorial.

## Product Purpose

CodeMerge is a Sublime Merge-inspired Git client rendered inside VS Code webviews. It exists to make everyday Git operations (staging, committing, branching, merging, diffing, fetch/pull/push) fast and visual without a separate desktop app. Success looks like: a developer can read repo state at a glance, act on it in one or two clicks or keystrokes, and trust that destructive actions are guarded. It should feel as quick and dense as the terminal it replaces, while showing more.

## Brand Personality

Powerful, dense, expert. Voice is terse and technical, never chatty. The interface should feel like a precision instrument that rewards mastery: rich information, tight layout, instant response. Emotional goal is confidence and control, not delight or reassurance.

## Anti-references

- **Bloated desktop GUI git clients** (toolbar-stuffed, slow, modal-heavy). Avoid chrome, redundant buttons, and visual weight.
- **Consumer/playful SaaS** (rounded pastel cards, illustrations, mascots, marketing gloss). No friendliness theater.
- **Generic AI dashboard** (gradient hero metrics, identical card grids, side-stripe accent borders). Banned by default.
- **Off-theme custom skins** that ignore VS Code theme tokens and look foreign inside the editor.

## Design Principles

1. **Native by default.** Track `var(--vscode-*)` tokens so the UI is indistinguishable from a first-party panel in any theme, including high-contrast.
2. **Density over decoration.** Every pixel carries information. Earn vertical space; no padding for padding's sake.
3. **Glanceable state.** Repo status (branch, ahead/behind, staged vs unstaged, conflicts) must be readable in under a second.
4. **One gesture to act.** Common Git actions resolve in a click or keystroke; deep menus are a failure.
5. **Guard the irreversible.** Discard, delete-branch, merge, cherry-pick gate behind a modal confirm. Speed never overrides safety on destructive ops.

## Accessibility & Inclusion

- Inherit VS Code theme contrast, including High Contrast and High Contrast Light themes; never hardcode colors that break them.
- Respect `prefers-reduced-motion`; motion is functional, never required to understand state.
- Do not encode status by color alone (staged/unstaged/conflict): pair with glyph, label, or position for color-blind users.
- Full keyboard operability for primary actions; visible focus states using theme focus tokens.
