<div align="center">

# 🔀 CodeMerge

### A Sublime Merge–inspired Git client that lives inside Visual Studio Code

CodeMerge brings a fast, visual Git workflow into VS Code — a dedicated sidebar, a full merge-style workbench,
branch navigation, recent-change sorting, commit history, file diffs, and common branch operations,
all without ever leaving the editor.

<br />

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.92.0-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Version](https://img.shields.io/badge/version-0.1.0-success?style=for-the-badge)

<a href="https://buymeacoffee.com/andreescocard">
  <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20the%20project-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=000000" alt="Buy me a coffee">
</a>

</div>

---

## 📑 Contents

- [Highlights](#-highlights)
- [Preview](#-preview)
- [Installation](#-installation)
- [Usage](#-usage)
- [Branch Menu](#-branch-menu)
- [Development](#-development)
- [Testing](#-testing)
- [Roadmap](#-roadmap)
- [Support](#-support)
- [License](#-license)

---

## ✨ Highlights

| | Feature |
|---|---|
| 🧭 | **Activity Bar integration** — dedicated CodeMerge sidebar view |
| 📂 | **Open Repository dialog** — choose any local Git repository |
| 🪟 | **Sublime Merge–style layout** — Locations, Commits, Files, Summary, and split diff panes |
| ↔️ | **Resizable columns** — Locations, Commits, and diff panes |
| 🕒 | **Smart sorting** — changed files ordered by most recent modification by default |
| 🔃 | **Flexible sort** — by recent, oldest, path, status, or staged state |
| 🌿 | **Full branch ops** — checkout, create, merge, rebase, delete, rename, upstream, copy, hide/show, search |
| 🖱️ | **Context menu** — branch right-click menu modeled after Sublime Merge |
| 📜 | **Commit history** — graph rail, refs, author, relative time, pagination, and cherry-pick |
| ⚡ | **Staging actions** — stage, unstage, discard, reset, and commit (with amend) |
| 🔬 | **Hunk & line staging** — stage or unstage individual hunks and selected lines |
| 📦 | **Stash workflow** — push, apply, pop, drop, and show stashes |
| 🏷️ | **Tags** — create, delete, and push tags |
| 🛰️ | **Remotes** — add, remove, rename, and set remote URLs |
| ⚔️ | **Conflict-aware** — use ours/theirs, mark resolved, continue/skip/abort merges, rebases, cherry-picks |
| 🔭 | **Blame** — line-level authorship for any tracked file |
| 🔄 | **Sync** — fetch, pull, push, and force-push |
| 🎨 | **Theme-aware UI** — built on VS Code color tokens |

---

## 🖼️ Preview

CodeMerge is designed around a familiar three-panel Git workflow:

```text
┌───────────────────────────────────────────────────────────────┐
│ Toolbar: navigation, branch selector, search, sync actions     │
├───────────────┬───────────────────┬───────────────────────────┤
│ Locations     │ Commits           │ Files / Summary / Diff     │
│ Branches      │ Graph + history   │ Recent changes + split diff│
│ Remotes       │ Cherry-pick       │ Stage / unstage / discard  │
└───────────────┴───────────────────┴───────────────────────────┘
```

> 💡 Add screenshots to `docs/` and embed them here when you're ready.

---

## 📦 Installation

CodeMerge is not on the Marketplace yet — build the VSIX from source:

```powershell
git clone https://github.com/andreescocard/codemerge.git
cd codemerge
npm install
npm run package
```

This produces `codemerge-0.1.0.vsix`. Install it:

```powershell
code --install-extension codemerge-0.1.0.vsix
```

**Or, from inside VS Code:**

1. Open the **Extensions** view.
2. Select the `...` menu.
3. Choose **Install from VSIX...**.
4. Pick the generated `codemerge-0.1.0.vsix`.

---

## 🚀 Usage

1. Open the **CodeMerge** icon from the VS Code Activity Bar.
2. Select **Open Repository...**.
3. Choose a local Git repository folder.
4. Use **Open Git Client** to launch the full CodeMerge workbench.

You can also run it from the Command Palette:

```text
CodeMerge: Open Git Client
```

---

## 🌿 Branch Menu

Right-click a branch in **Locations** to access:

- ✅ Checkout branch
- 🔀 Merge branch into the current branch
- 🪡 Rebase current branch onto the selected branch
- 🗑️ Delete branch
- ✏️ Rename branch
- 📋 Copy branch name
- 🙈 Hide branch
- 🫥 Hide all branches except the selected one
- 👁️ Show all hidden branches
- 🔗 Set upstream
- 🔍 Search commits by branch name

---

## 🛠️ Development

| Task | Command |
|---|---|
| Install dependencies | `npm install` |
| Compile | `npm run compile` |
| Watch (rebuild on save) | `npm run watch` |
| Type checks | `npm run lint` |
| Run tests | `npm test` |
| Package a VSIX | `npm run package` |

**Debug locally:**

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host, open CodeMerge from the Activity Bar.

**Layout:** the extension host lives in `src/` — `git/` (client, diff, graph, status/log parsers, types),
`panel/` (full workbench panel + HTML), `utils/`, `protocol.ts` (the webview message contract), and
`extension.ts` (entry point). The webview client is `media/main.js` + `media/styles.css`.

---

## 🧪 Testing

Unit tests run on [Vitest](https://vitest.dev/) and cover the pure Git helpers — diff, graph, and the
status/log parsers:

```powershell
npm test            # vitest run (one-shot)
```

Extension behavior is verified manually in the Extension Development Host (`F5`).

---

## 🗺️ Roadmap

- [x] Line-level diff controls (hunk and line staging)
- [x] Tag and stash providers
- [x] File-level history (blame)
- [x] Conflict-aware merge, rebase, and cherry-pick flows
- [ ] Richer remote branch grouping
- [ ] Commit detail actions
- [ ] Optional graph density controls

---

## ❤️ Support

If CodeMerge saves you time, you can support development here:

<a href="https://buymeacoffee.com/andreescocard">
  <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-buymeacoffee.com%2Fandreescocard-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=000000" alt="Buy me a coffee">
</a>

---

## 📄 License

Released under the [MIT License](LICENSE) © 2026 Andre Escocard.
