# CodeMerge

> A Sublime Merge-inspired Git client that lives inside Visual Studio Code.

CodeMerge brings a fast, visual Git workflow into VS Code: a dedicated left-sidebar entry, a full merge-style workbench, branch navigation, recent-change sorting, commit history, file diffs, and common branch operations without leaving the editor.

<p>
  <a href="https://buymeacoffee.com/andreescocard">
    <img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support%20the%20project-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=000000" alt="Buy me a coffee">
  </a>
</p>

## Highlights

- Activity Bar integration with a CodeMerge sidebar view.
- Open Repository dialog for choosing any local Git repository.
- Sublime Merge-style layout with Locations, Commits, Files, Summary, and split diff panes.
- Resizable Locations, Commits, and diff columns.
- Changed files sorted by most recent modification time by default.
- Sort changed files by recent, oldest, path, status, or staged state.
- Branch checkout, creation, merge, delete, rename, upstream setup, copy, hide/show, and search actions.
- Branch right-click context menu modeled after Sublime Merge.
- Commit history with graph rail, refs, author, relative time, and cherry-pick.
- Stage, unstage, discard, commit, fetch, pull, and push actions.
- Theme-aware UI using VS Code color tokens.

## Preview

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

Add screenshots to `docs/` later and embed them here when you are ready.

## Installation

Install the packaged VSIX from this repository:

```powershell
code --install-extension codemerge-0.1.0.vsix
```

Or install it from VS Code:

1. Open the Extensions view.
2. Select `...`.
3. Choose `Install from VSIX...`.
4. Pick `codemerge-0.1.0.vsix`.

## Usage

1. Open the CodeMerge icon from the VS Code Activity Bar.
2. Select `Open Repository...`.
3. Choose a local Git repository folder.
4. Use `Open Git Client` to launch the full CodeMerge workbench.

You can also run:

```text
CodeMerge: Open Git Client
```

from the Command Palette.

## Branch Menu

Right-click a branch in Locations to access:

- Checkout branch
- Merge branch into the current branch
- Delete branch
- Rename branch
- Copy branch name
- Hide branch
- Hide all branches except the selected branch
- Show all hidden branches
- Set upstream
- Search commits by branch name

## Development

Install dependencies:

```powershell
npm install
```

Compile:

```powershell
npm run compile
```

Run type checks:

```powershell
npm run lint
```

Package a VSIX:

```powershell
npm run package
```

Debug locally:

1. Open this folder in VS Code.
2. Press `F5`.
3. In the Extension Development Host, open CodeMerge from the Activity Bar.

## Roadmap

- Richer diff rendering with line-level controls.
- Remote branch grouping and tag/stash providers.
- Commit detail actions and file-level history.
- Conflict-aware merge and cherry-pick flows.
- Optional graph density controls.

## Support

If CodeMerge saves you time, you can support development here:

[buymeacoffee.com/andreescocard](https://buymeacoffee.com/andreescocard)

## License

No license file has been added yet. Add one before publishing publicly if you want to define reuse terms.
