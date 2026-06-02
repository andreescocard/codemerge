import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import * as path from "node:path";

type GitFile = {
  path: string;
  index: string;
  workingTree: string;
  staged: boolean;
  mtimeMs: number;
  mtimeLabel: string;
};

type Commit = {
  hash: string;
  shortHash: string;
  refs: string;
  subject: string;
  author: string;
  relativeDate: string;
  graph: string;
};

type Branch = {
  name: string;
  current: boolean;
};

type Snapshot = {
  root: string;
  currentBranch: string;
  branches: Branch[];
  commits: Commit[];
  files: GitFile[];
};

const selectedRootKey = "codemerge.selectedRoot";

const enum MessageType {
  Refresh = "refresh",
  SelectFile = "selectFile",
  Stage = "stage",
  Unstage = "unstage",
  Discard = "discard",
  Commit = "commit",
  Checkout = "checkout",
  CreateBranch = "createBranch",
  MergeBranch = "mergeBranch",
  DeleteBranch = "deleteBranch",
  RenameBranch = "renameBranch",
  CopyBranch = "copyBranch",
  SetUpstream = "setUpstream",
  CherryPick = "cherryPick",
  Fetch = "fetch",
  Pull = "pull",
  Push = "push"
}

class GitClient {
  constructor(private readonly cwd: string) {}

  async snapshot(): Promise<Snapshot> {
    const [branch, branches, commits, files] = await Promise.all([
      this.currentBranch(),
      this.branches(),
      this.commits(),
      this.status()
    ]);

    return {
      root: this.cwd,
      currentBranch: branch,
      branches,
      commits,
      files
    };
  }

  async currentBranch(): Promise<string> {
    return (await this.git(["branch", "--show-current"])).trim() || "detached";
  }

  async branches(): Promise<Branch[]> {
    const output = await this.git(["branch", "--format=%(HEAD)|%(refname:short)"]);
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [head, name] = line.split("|");
        return { name, current: head === "*" };
      });
  }

  async commits(): Promise<Commit[]> {
    const format = "%H%x1f%h%x1f%D%x1f%s%x1f%an%x1f%cr";
    const output = await this.git([
      "log",
      "--graph",
      "--decorate=short",
      "--date=relative",
      `--pretty=format:${format}`,
      "-n",
      "80"
    ]);

    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^([*|\\/ _.-]+)?([a-f0-9]{40}\x1f.*)$/i);
        const graph = match?.[1]?.trimEnd() || "";
        const payload = match?.[2] || line;
        const [hash, shortHash, refs, subject, author, relativeDate] = payload.split("\x1f");
        return { hash, shortHash, refs, subject, author, relativeDate, graph };
      })
      .filter((commit) => commit.hash && commit.shortHash);
  }

  async status(): Promise<GitFile[]> {
    const output = await this.git(["status", "--porcelain=v1"]);
    const files = output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line[0] ?? " ";
        const workingTree = line[1] ?? " ";
        const filePath = line.slice(3).replace(/^"|"$/g, "");
        return {
          path: filePath.includes(" -> ") ? filePath.split(" -> ").at(-1) ?? filePath : filePath,
          index,
          workingTree,
          staged: index !== " " && index !== "?"
        };
      });

    const withMtime = await Promise.all(
      files.map(async (file) => {
        const mtimeMs = await this.mtime(file.path);
        return {
          ...file,
          mtimeMs,
          mtimeLabel: formatMtime(mtimeMs)
        };
      })
    );

    return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  }

  async diff(filePath: string): Promise<string> {
    const staged = await this.git(["diff", "--cached", "--", filePath]);
    const unstaged = await this.git(["diff", "--", filePath]);
    const chunks = [];

    if (staged.trim()) {
      chunks.push(`Staged changes\n${staged}`);
    }
    if (unstaged.trim()) {
      chunks.push(`Working tree changes\n${unstaged}`);
    }

    return chunks.join("\n\n") || "No textual diff available for this file.";
  }

  stage(filePath: string): Promise<string> {
    return this.git(["add", "--", filePath]);
  }

  unstage(filePath: string): Promise<string> {
    return this.git(["restore", "--staged", "--", filePath]);
  }

  discard(filePath: string): Promise<string> {
    return this.git(["restore", "--", filePath]);
  }

  commit(message: string): Promise<string> {
    return this.git(["commit", "-m", message]);
  }

  checkout(branch: string): Promise<string> {
    return this.git(["checkout", branch]);
  }

  createBranch(name: string, startPoint: string): Promise<string> {
    return this.git(["branch", name, startPoint]);
  }

  mergeBranch(branch: string): Promise<string> {
    return this.git(["merge", branch]);
  }

  deleteBranch(branch: string): Promise<string> {
    return this.git(["branch", "-d", branch]);
  }

  renameBranch(branch: string, newName: string): Promise<string> {
    return this.git(["branch", "-m", branch, newName]);
  }

  setUpstream(branch: string, upstream: string): Promise<string> {
    return this.git(["branch", "--set-upstream-to", upstream, branch]);
  }

  cherryPick(hash: string): Promise<string> {
    return this.git(["cherry-pick", hash]);
  }

  fetch(): Promise<string> {
    return this.git(["fetch", "--all", "--prune"]);
  }

  pull(): Promise<string> {
    return this.git(["pull", "--ff-only"]);
  }

  push(): Promise<string> {
    return this.git(["push"]);
  }

  private git(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.cwd, windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || stdout || error.message).trim()));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private async mtime(filePath: string): Promise<number> {
    try {
      return (await stat(path.join(this.cwd, filePath))).mtimeMs;
    } catch {
      return 0;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CodeMergeSidebarProvider.viewType,
      new CodeMergeSidebarProvider(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codemerge.open", async () => {
      const root = (await resolveGitRoot(context)) ?? (await pickGitRoot(context));
      if (!root) {
        return;
      }

      CodeMergePanel.createOrShow(context.extensionUri, root);
    })
  );
}

export function deactivate() {}

class CodeMergeSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "codemerge.sidebar";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };

    webviewView.webview.html = renderSidebarHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: { type: "open" | "openRepository" | "refresh" }) => {
      if (message.type === "open") {
        await vscode.commands.executeCommand("codemerge.open");
      }
      if (message.type === "openRepository") {
        const root = await pickGitRoot(this.context);
        if (root) {
          CodeMergePanel.createOrShow(this.context.extensionUri, root);
          await this.updateSidebar(webviewView);
        }
      }
      if (message.type === "refresh") {
        await this.updateSidebar(webviewView);
      }
    });

    void this.updateSidebar(webviewView);
  }

  private async updateSidebar(webviewView: vscode.WebviewView) {
    const root = await resolveGitRoot(this.context);
    if (!root) {
      webviewView.webview.postMessage({
        type: "state",
        state: {
          root: "No Git repository open",
          branch: "-",
          changed: 0,
          commits: 0,
          ready: false
        }
      });
      return;
    }

    try {
      const snapshot = await new GitClient(root).snapshot();
      webviewView.webview.postMessage({
        type: "state",
        state: {
          root,
          branch: snapshot.currentBranch,
          changed: snapshot.files.length,
          commits: snapshot.commits.length,
          ready: true
        }
      });
    } catch (error) {
      webviewView.webview.postMessage({
        type: "state",
        state: {
          root,
          branch: error instanceof Error ? error.message : String(error),
          changed: 0,
          commits: 0,
          ready: false
        }
      });
    }
  }
}

class CodeMergePanel {
  private static currentPanel: CodeMergePanel | undefined;
  private readonly client: GitClient;
  private selectedFile: string | undefined;

  static createOrShow(extensionUri: vscode.Uri, root: string) {
    if (CodeMergePanel.currentPanel) {
      if (CodeMergePanel.currentPanel.root === root) {
        CodeMergePanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
        return;
      }
      CodeMergePanel.currentPanel.panel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      "codemerge",
      "CodeMerge",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")]
      }
    );

    CodeMergePanel.currentPanel = new CodeMergePanel(panel, extensionUri, root);
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly root: string
  ) {
    this.client = new GitClient(root);
    this.panel.webview.html = renderHtml(this.panel.webview, extensionUri);
    this.panel.onDidDispose(() => (CodeMergePanel.currentPanel = undefined));
    this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    void this.refresh();
  }

  private async handleMessage(message: {
    type: MessageType;
    path?: string;
    branch?: string;
    sourceBranch?: string;
    newName?: string;
    upstream?: string;
    hash?: string;
    message?: string;
  }) {
    try {
      switch (message.type) {
        case MessageType.Refresh:
          await this.refresh();
          break;
        case MessageType.SelectFile:
          this.selectedFile = message.path;
          await this.sendDiff(message.path);
          break;
        case MessageType.Stage:
          if (message.path) {
            await this.client.stage(message.path);
            await this.refresh(message.path);
          }
          break;
        case MessageType.Unstage:
          if (message.path) {
            await this.client.unstage(message.path);
            await this.refresh(message.path);
          }
          break;
        case MessageType.Discard:
          if (message.path) {
            const confirm = await vscode.window.showWarningMessage(
              `Discard local changes in ${message.path}?`,
              { modal: true },
              "Discard"
            );
            if (confirm === "Discard") {
              await this.client.discard(message.path);
              await this.refresh();
            }
          }
          break;
        case MessageType.Commit:
          if (message.message?.trim()) {
            await this.client.commit(message.message.trim());
            await this.refresh();
          }
          break;
        case MessageType.Checkout:
          if (message.branch) {
            await this.client.checkout(message.branch);
            await this.refresh();
          }
          break;
        case MessageType.CreateBranch:
          if (message.branch?.trim() && message.sourceBranch) {
            await this.client.createBranch(message.branch.trim(), message.sourceBranch);
            await this.refresh();
          }
          break;
        case MessageType.MergeBranch:
          if (message.branch) {
            const current = await this.client.currentBranch();
            const confirm = await vscode.window.showWarningMessage(
              `Merge ${message.branch} into ${current}?`,
              { modal: true },
              "Merge"
            );
            if (confirm === "Merge") {
              await this.client.mergeBranch(message.branch);
              await this.refresh();
            }
          }
          break;
        case MessageType.DeleteBranch:
          if (message.branch) {
            const confirm = await vscode.window.showWarningMessage(
              `Delete branch ${message.branch}?`,
              { modal: true },
              "Delete"
            );
            if (confirm === "Delete") {
              await this.client.deleteBranch(message.branch);
              await this.refresh();
            }
          }
          break;
        case MessageType.RenameBranch:
          if (message.branch) {
            const newName = await vscode.window.showInputBox({
              prompt: `Rename ${message.branch}`,
              value: message.branch,
              ignoreFocusOut: true
            });
            if (newName?.trim() && newName.trim() !== message.branch) {
              await this.client.renameBranch(message.branch, newName.trim());
              await this.refresh();
            }
          }
          break;
        case MessageType.CopyBranch:
          if (message.branch) {
            await vscode.env.clipboard.writeText(message.branch);
            vscode.window.showInformationMessage(`Copied ${message.branch}`);
          }
          break;
        case MessageType.SetUpstream:
          if (message.branch) {
            const upstream = await vscode.window.showInputBox({
              prompt: `Set upstream for ${message.branch}`,
              placeHolder: `origin/${message.branch}`,
              ignoreFocusOut: true
            });
            if (upstream?.trim()) {
              await this.client.setUpstream(message.branch, upstream.trim());
              await this.refresh();
            }
          }
          break;
        case MessageType.CherryPick:
          if (message.hash) {
            const confirm = await vscode.window.showWarningMessage(
              `Cherry-pick ${message.hash.slice(0, 8)} onto the current branch?`,
              { modal: true },
              "Cherry-pick"
            );
            if (confirm === "Cherry-pick") {
              await this.client.cherryPick(message.hash);
              await this.refresh();
            }
          }
          break;
        case MessageType.Fetch:
          await this.client.fetch();
          await this.refresh();
          break;
        case MessageType.Pull:
          await this.client.pull();
          await this.refresh();
          break;
        case MessageType.Push:
          await this.client.push();
          await this.refresh();
          break;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(detail);
      this.panel.webview.postMessage({ type: "error", error: detail });
    }
  }

  private async refresh(selectedPath = this.selectedFile) {
    const snapshot = await this.client.snapshot();
    this.panel.webview.postMessage({ type: "snapshot", snapshot });

    if (selectedPath && snapshot.files.some((file) => file.path === selectedPath)) {
      this.selectedFile = selectedPath;
      await this.sendDiff(selectedPath);
    } else {
      this.selectedFile = undefined;
      this.panel.webview.postMessage({ type: "diff", path: undefined, diff: "" });
    }
  }

  private async sendDiff(filePath: string | undefined) {
    if (!filePath) {
      return;
    }

    const diff = await this.client.diff(filePath);
    this.panel.webview.postMessage({ type: "diff", path: filePath, diff });
  }
}

async function resolveGitRoot(context?: vscode.ExtensionContext): Promise<string | undefined> {
  const selectedRoot = context?.workspaceState.get<string>(selectedRootKey);
  if (selectedRoot && (await gitRootFor(selectedRoot))) {
    return selectedRoot;
  }

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    return undefined;
  }

  return gitRootFor(folder);
}

async function pickGitRoot(context: vscode.ExtensionContext): Promise<string | undefined> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Open Repository",
    title: "Open Git Repository"
  });

  const folder = selection?.[0]?.fsPath;
  if (!folder) {
    return undefined;
  }

  const root = await gitRootFor(folder);
  if (!root) {
    vscode.window.showErrorMessage("The selected folder is not inside a Git repository.");
    return undefined;
  }

  await context.workspaceState.update(selectedRootKey, root);
  return root;
}

async function gitRootFor(folder: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--show-toplevel"], { cwd: folder, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve(undefined);
        return;
      }
      resolve(stdout.trim() || undefined);
    });
  });
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
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
  <main class="shell">
    <header class="appToolbar">
      <div class="toolbarCluster">
        <button id="toggleLocationsButton" title="Toggle locations">[]</button>
        <button id="backButton" title="Back">&lt;</button>
        <button id="forwardButton" title="Forward">&gt;</button>
      </div>
      <div class="centerBar">
        <button id="historyMenuButton" title="History options">=</button>
        <select id="branchSelect" title="Checkout branch"></select>
        <button id="searchButton" title="Search">Search</button>
        <button id="moreButton" title="More actions">...</button>
      </div>
      <div class="toolbarCluster rightCluster">
        <button id="fetchButton" title="Fetch remotes">Fetch</button>
        <button id="pullButton" title="Pull fast-forward changes">Pull</button>
        <button id="pushButton" title="Push current branch">Push</button>
        <button id="refreshButton" title="Refresh repository">Refresh</button>
      </div>
    </header>

    <section class="mergeLayout">
      <aside class="locationsPane">
        <div class="paneHeader">
          <span>Locations</span>
          <button id="locationSearchButton" title="Search locations">Search</button>
        </div>
        <div class="locationsScroll">
          <section class="locationGroup">
            <div class="locationHeading">Branches <span id="branchCount">0</span></div>
            <div id="branchTree" class="branchTree"></div>
            <div id="branchMenu" class="contextMenu" hidden></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Remotes <span>1</span></div>
            <div class="locationMuted">origin</div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Tags <span>0</span></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Stashes <span>0</span></div>
          </section>
          <section class="locationGroup">
            <div class="locationHeading">Submodules <span>0</span></div>
          </section>
        </div>
      </aside>
      <div class="columnResizer" data-resizer="locations" title="Resize locations"></div>

      <section class="commitPane">
        <div class="paneHeader">
          <span>Commits</span>
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
        <div class="filesStrip">
          <div class="stripTab activeTab">Files <span id="changeCount">0</span></div>
          <input id="fileFilter" class="inlineSearch" type="search" placeholder="Filter changed files">
          <select id="fileSort" class="sortSelect" title="Sort changed files">
            <option value="recent">Recent changes</option>
            <option value="oldest">Oldest changes</option>
            <option value="path">Path</option>
            <option value="status">Status</option>
            <option value="staged">Staged first</option>
          </select>
          <div id="fileList" class="fileList"></div>
        </div>

        <div class="detailTabs">
          <button class="detailTab activeTab" id="summaryTab">Summary</button>
          <button class="detailTab" id="fileTab">checkoutConfirmationThankMessage.jsp</button>
        </div>

        <section class="summaryPane">
          <button class="summaryMenu" title="Summary actions">...</button>
          <dl class="summaryMeta">
            <div><dt>Repository</dt><dd id="repoRoot">Loading repository...</dd></div>
            <div><dt>Branch</dt><dd id="currentBranch">detached</dd></div>
            <div><dt>Commit Hash</dt><dd id="summaryHash">Select a commit</dd></div>
            <div><dt>Author</dt><dd id="summaryAuthor">-</dd></div>
            <div><dt>Date</dt><dd id="summaryDate">-</dd></div>
            <div><dt>Branches</dt><dd id="summaryRefs">-</dd></div>
          </dl>
          <p id="summarySubject" class="summarySubject">Select a commit or changed file to inspect details.</p>
        </section>

        <section class="diffPane">
          <div class="diffHeader">
            <h2 id="diffTitle">Diff</h2>
            <div class="fileActions">
              <button id="stageButton">Stage</button>
              <button id="unstageButton">Unstage</button>
              <button id="discardButton">Discard</button>
            </div>
          </div>
          <div class="splitDiff">
            <pre id="diffBefore" class="diffOutput beforePane">Select a changed file to inspect its diff.</pre>
            <div class="diffResizer" id="diffResizer" title="Resize diff panes"></div>
            <pre id="diffOutput" class="diffOutput afterPane">Select a changed file to inspect its diff.</pre>
          </div>
        </section>

        <form id="commitForm" class="commitBox">
          <textarea id="commitMessage" rows="3" placeholder="Commit message"></textarea>
          <div class="branchCreateInline">
            <input id="newBranchName" class="branchNameInput" type="text" placeholder="New branch">
            <select id="sourceBranchSelect" title="Create from branch"></select>
            <button id="createBranchButton" type="button" title="Create branch from selected source">Create branch</button>
            <button type="submit">Commit staged</button>
          </div>
        </form>
      </section>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function renderSidebarHtml(webview: vscode.Webview) {
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
    h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
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
  <section class="sidebarShell">
    <h2>CodeMerge</h2>
    <dl>
      <dt>Repo</dt><dd id="root">Loading...</dd>
      <dt>Branch</dt><dd id="branch">-</dd>
      <dt>Changes</dt><dd id="changed">0</dd>
      <dt>Commits</dt><dd id="commits">0</dd>
    </dl>
    <button id="openButton">Open Git Client</button>
    <button id="openRepositoryButton" class="secondary">Open Repository...</button>
    <button id="refreshButton" class="secondary">Refresh</button>
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

function formatMtime(mtimeMs: number) {
  if (!mtimeMs) {
    return "deleted";
  }

  const delta = Date.now() - mtimeMs;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) {
    return "just now";
  }
  if (delta < hour) {
    return `${Math.floor(delta / minute)}m ago`;
  }
  if (delta < day) {
    return `${Math.floor(delta / hour)}h ago`;
  }
  if (delta < 14 * day) {
    return `${Math.floor(delta / day)}d ago`;
  }

  return new Date(mtimeMs).toLocaleDateString();
}
