import * as vscode from "vscode";

export function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "styles.css"));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>CodeMerge</title>
</head>
<body>
  <svg class="iconSprite" aria-hidden="true">
    <symbol id="icon-panel" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM9 5v14"/></symbol>
    <symbol id="icon-arrow-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
    <symbol id="icon-arrow-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
    <symbol id="icon-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
    <symbol id="icon-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></symbol>
    <symbol id="icon-more" viewBox="0 0 24 24"><path d="M5 12h.01M12 12h.01M19 12h.01"/></symbol>
    <symbol id="icon-download" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></symbol>
    <symbol id="icon-upload" viewBox="0 0 24 24"><path d="M12 21V9m0 0 4 4m-4-4-4 4M5 3h14"/></symbol>
    <symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5M18 3v4h-4M6 21v-4h4"/></symbol>
    <symbol id="icon-branch" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M8 6h8M6 8v8"/></symbol>
    <symbol id="icon-file" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6zM14 3v5h5"/></symbol>
    <symbol id="icon-commit" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/></symbol>
    <symbol id="icon-check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol>
    <symbol id="icon-copy" viewBox="0 0 24 24"><path d="M8 8h11v11H8zM5 16H4V4h12v1"/></symbol>
    <symbol id="icon-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></symbol>
    <symbol id="icon-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M7 7l1 14h8l1-14"/></symbol>
    <symbol id="icon-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
    <symbol id="icon-eye-off" viewBox="0 0 24 24"><path d="m3 3 18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M7.1 7.5C4 9.3 2 12 2 12s4 7 10 7c1.7 0 3.2-.5 4.5-1.2M17.7 14.4C20.3 12.8 22 12 22 12s-4-7-10-7c-1 0-2 .2-2.9.5"/></symbol>
    <symbol id="icon-merge" viewBox="0 0 24 24"><circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v4a6 6 0 0 0 6 6h4M6 16V8"/></symbol>
    <symbol id="icon-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></symbol>
  </svg>
  <main class="shell">
    <header class="appToolbar">
      <div class="toolbarCluster">
        <button class="iconButton" id="toggleLocationsButton" title="Toggle locations"><svg><use href="#icon-panel"></use></svg></button>
        <button class="iconButton" id="backButton" title="Back"><svg><use href="#icon-arrow-left"></use></svg></button>
        <button class="iconButton" id="forwardButton" title="Forward"><svg><use href="#icon-arrow-right"></use></svg></button>
      </div>
      <div class="centerBar">
        <button class="iconButton" id="historyMenuButton" title="History options"><svg><use href="#icon-menu"></use></svg></button>
        <select id="branchSelect" title="Checkout branch"></select>
        <button class="iconButton" id="searchButton" title="Search"><svg><use href="#icon-search"></use></svg></button>
        <button class="iconButton" id="moreButton" title="More actions"><svg><use href="#icon-more"></use></svg></button>
      </div>
      <div class="toolbarCluster rightCluster">
        <button class="toolbarAction" id="fetchButton" title="Fetch remotes"><svg><use href="#icon-download"></use></svg><span>Fetch</span></button>
        <button class="toolbarAction" id="pullButton" title="Pull fast-forward changes"><svg><use href="#icon-download"></use></svg><span>Pull</span></button>
        <button class="toolbarAction" id="pushButton" title="Push current branch"><svg><use href="#icon-upload"></use></svg><span>Push</span></button>
        <button class="toolbarAction" id="refreshButton" title="Refresh repository"><svg><use href="#icon-refresh"></use></svg><span>Refresh</span></button>
      </div>
    </header>

    <section class="mergeLayout">
      <aside class="locationsPane">
        <div class="paneHeader">
          <span><svg><use href="#icon-branch"></use></svg>Locations</span>
          <button class="iconButton subtleButton" id="locationSearchButton" title="Search locations"><svg><use href="#icon-search"></use></svg></button>
        </div>
        <div class="locationsScroll">
          <section class="locationGroup">
            <div class="locationHeading">Branches <span id="branchCount">0</span></div>
            <div id="branchTree" class="branchTree"></div>
            <div id="branchMenu" class="contextMenu" hidden></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Remotes <span id="remoteCount">0</span></div>
            <div id="remoteTree" class="branchTree"></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Tags <span id="tagCount">0</span></div>
            <div id="tagTree" class="branchTree"></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Stashes <span id="stashCount">0</span></div>
            <div id="stashTree" class="branchTree"></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Submodules <span id="submoduleCount">0</span></div>
            <div id="submoduleTree" class="branchTree"></div>
          </section>
          <div id="locationMenu" class="contextMenu" hidden></div>
        </div>
      </aside>
      <div class="columnResizer" data-resizer="locations" title="Resize locations"></div>

      <section class="commitPane">
        <div class="paneHeader">
          <span><svg><use href="#icon-commit"></use></svg>Commits</span>
          <input id="commitFilter" class="inlineSearch" type="search" placeholder="Search">
        </div>
        <div class="commitChangesSummary">
          <strong id="commitSummaryCount">Loading changes...</strong>
          <span>Commit Changes</span>
        </div>
        <div id="commitList" class="commitList"></div>
      </section>
      <div class="columnResizer" data-resizer="commits" title="Resize commits"></div>

      <section class="contentPane">
        <div class="detailTabs">
          <button class="detailTab activeTab" id="summaryTab"><svg><use href="#icon-commit"></use></svg>Summary</button>
          <div id="fileList" class="fileList"></div>
        </div>

        <section class="summaryPane">
          <section id="conflictBanner" class="conflictBanner" hidden></section>
          <button class="summaryMenu" title="Summary actions"><svg><use href="#icon-more"></use></svg></button>
          <form id="commitForm" class="commitBox">
            <textarea id="commitMessage" rows="3" placeholder="Commit Message"></textarea>
            <div class="branchCreateInline">
              <input id="newBranchName" class="branchNameInput" type="text" placeholder="New branch">
              <select id="sourceBranchSelect" title="Create from branch"></select>
              <button id="createBranchButton" type="button" title="Create branch from selected source"><svg><use href="#icon-branch"></use></svg>Create branch</button>
              <label class="amendToggle"><input id="amendCommit" type="checkbox">Amend</label>
              <button type="submit"><svg><use href="#icon-check"></use></svg>Commit staged</button>
            </div>
          </form>
          <dl class="summaryMeta">
            <div><dt>Repository</dt><dd id="repoRoot">Loading repository...</dd></div>
            <div><dt>Branch</dt><dd id="currentBranch">detached</dd></div>
            <div><dt>Commit Hash</dt><dd id="summaryHash">Select a commit</dd></div>
            <div><dt>Author</dt><dd id="summaryAuthor">-</dd></div>
            <div><dt>Date</dt><dd id="summaryDate">-</dd></div>
            <div><dt>Branches</dt><dd id="summaryRefs">-</dd></div>
          </dl>
          <p id="summarySubject" class="summarySubject">Select a commit or changed file to inspect details.</p>
          <div class="workingDirectoryHeader">
            <div class="workingTitle"><svg><use href="#icon-file"></use></svg><span>Working Directory</span><strong id="changeCount">0</strong></div>
            <div class="workingActions">
              <input id="fileFilter" class="inlineSearch" type="search" placeholder="Filter files">
              <select id="fileSort" class="sortSelect" title="Sort changed files">
                <option value="recent">Recent changes</option>
                <option value="oldest">Oldest changes</option>
                <option value="path">Path</option>
                <option value="status">Status</option>
                <option value="staged">Staged first</option>
              </select>
              <button id="discardAllButton" type="button"><svg><use href="#icon-trash"></use></svg>Discard All</button>
              <button id="stageAllButton" type="button"><svg><use href="#icon-check"></use></svg>Stage All</button>
            </div>
          </div>
        </section>

        <section class="diffPane">
          <div class="diffHeader">
            <h2 id="diffTitle">Diff</h2>
            <div class="fileActions">
              <button id="stageButton"><svg><use href="#icon-check"></use></svg>Stage</button>
              <button id="unstageButton"><svg><use href="#icon-refresh"></use></svg>Unstage</button>
              <button id="blameButton"><svg><use href="#icon-eye"></use></svg>Blame</button>
              <button id="discardButton"><svg><use href="#icon-trash"></use></svg>Discard</button>
            </div>
          </div>
          <div class="splitDiff">
            <div id="diffBefore" class="diffOutput beforePane">Select a changed file to inspect its diff.</div>
            <div class="diffResizer" id="diffResizer" title="Resize diff panes"></div>
            <div id="diffOutput" class="diffOutput afterPane">Select a changed file to inspect its diff.</div>
          </div>
        </section>

      </section>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function renderSidebarHtml(webview: vscode.Webview) {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeMerge Sidebar</title>
  <style>
    body {
      margin: 0;
      padding: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .sidebarShell {
      display: grid;
      gap: 12px;
    }
    .iconSprite {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
    }
    svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      flex: 0 0 auto;
    }
    h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    dl {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 6px 10px;
      margin: 0;
    }
    dt {
      color: var(--vscode-descriptionForeground);
    }
    dd {
      margin: 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      width: 100%;
      min-height: 28px;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
      font: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .muted {
      color: var(--vscode-descriptionForeground);
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <svg class="iconSprite" aria-hidden="true">
    <symbol id="icon-repo" viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></symbol>
    <symbol id="icon-folder" viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v10H3z"/></symbol>
    <symbol id="icon-refresh" viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5M18 3v4h-4M6 21v-4h4"/></symbol>
  </svg>
  <section class="sidebarShell">
    <h2><svg><use href="#icon-repo"></use></svg>CodeMerge</h2>
    <dl>
      <dt>Repo</dt><dd id="root">Loading...</dd>
      <dt>Branch</dt><dd id="branch">-</dd>
      <dt>Changes</dt><dd id="changed">0</dd>
      <dt>Commits</dt><dd id="commits">0</dd>
    </dl>
    <button id="openButton"><svg><use href="#icon-repo"></use></svg>Open Git Client</button>
    <button id="openRepositoryButton" class="secondary"><svg><use href="#icon-folder"></use></svg>Open Repository...</button>
    <button id="refreshButton" class="secondary"><svg><use href="#icon-refresh"></use></svg>Refresh</button>
    <p class="muted">Use the full CodeMerge panel for the Sublime Merge-style history, files, summary, and split diff layout.</p>
  </section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById("root");
    const branch = document.getElementById("branch");
    const changed = document.getElementById("changed");
    const commits = document.getElementById("commits");
    document.getElementById("openButton").addEventListener("click", () => vscode.postMessage({ type: "open" }));
    document.getElementById("openRepositoryButton").addEventListener("click", () => vscode.postMessage({ type: "openRepository" }));
    document.getElementById("refreshButton").addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
    window.addEventListener("message", (event) => {
      const state = event.data.state;
      if (!state) return;
      root.textContent = state.root;
      branch.textContent = state.branch;
      changed.textContent = String(state.changed);
      commits.textContent = String(state.commits);
    });
  </script>
</body>
</html>`;
}

function getNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => possible[Math.floor(Math.random() * possible.length)]).join("");
}

