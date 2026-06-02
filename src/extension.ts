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
const gitTimeoutMs = 20_000;
const gitNetworkTimeoutMs = 120_000;
const maxStatusFilesWithMtime = 2_000;

const enum MessageType {
  Refresh = "refresh",
  SelectFile = "selectFile",
  Stage = "stage",
  StageAll = "stageAll",
  Unstage = "unstage",
  Discard = "discard",
  DiscardAll = "discardAll",
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
    const output = await this.git(["status", "--porcelain=v1"], gitTimeoutMs);
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

    const filesForMtime = files.slice(0, maxStatusFilesWithMtime);
    const withMtime = await mapWithConcurrency(filesForMtime, 64, async (file) => {
        const mtimeMs = await this.mtime(file.path);
        return {
          ...file,
          mtimeMs,
          mtimeLabel: formatMtime(mtimeMs)
        };
      });

    const overflow = files.slice(maxStatusFilesWithMtime).map((file) => ({
      ...file,
      mtimeMs: 0,
      mtimeLabel: "not scanned"
    }));

    return [...withMtime, ...overflow].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  }

  async diff(filePath: string): Promise<string> {
    const staged = await this.git(["diff", "--cached", "--", filePath], gitTimeoutMs);
    const unstaged = await this.git(["diff", "--", filePath], gitTimeoutMs);
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

  stageAll(): Promise<string> {
    return this.git(["add", "-A"]);
  }

  unstage(filePath: string): Promise<string> {
    return this.git(["restore", "--staged", "--", filePath]);
  }

  discard(filePath: string): Promise<string> {
    return this.git(["restore", "--", filePath]);
  }

  discardAll(): Promise<string> {
    return this.git(["restore", "."]);
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
    return this.git(["fetch", "--all", "--prune"], gitNetworkTimeoutMs);
  }

  async pull(): Promise<string> {
    const branch = await this.currentBranch();
    if (branch === "detached") {
      throw new Error("Cannot pull while HEAD is detached.");
    }

    const upstream = await this.tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream.trim()) {
      return this.git(["pull", "--ff-only"], gitNetworkTimeoutMs);
    }

    const originBranch = await this.tryGit(["show-ref", "--verify", `refs/remotes/origin/${branch}`]);
    if (!originBranch.trim()) {
      throw new Error(
        `No upstream is configured for ${branch}, and origin/${branch} was not found. Set upstream or push the branch first.`
      );
    }

    return this.git(["pull", "--ff-only", "origin", branch], gitNetworkTimeoutMs);
  }

  push(): Promise<string> {
    return this.git(["push"], gitNetworkTimeoutMs);
  }

  private git(args: string[], timeout = gitTimeoutMs): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile("git", args, { cwd: this.cwd, windowsHide: true, timeout, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim();
          reject(new Error(error.killed ? `Git command timed out: git ${args.join(" ")}` : detail));
          return;
        }
        resolve(stdout);
      });
    });
  }

  private tryGit(args: string[], timeout = gitTimeoutMs): Promise<string> {
    return new Promise((resolve) => {
      execFile("git", args, { cwd: this.cwd, windowsHide: true, timeout, maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
        resolve(error ? "" : stdout);
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
  private refreshRequest = 0;

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
        case MessageType.StageAll:
          await this.client.stageAll();
          await this.refresh();
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
        case MessageType.DiscardAll: {
          const confirm = await vscode.window.showWarningMessage(
            "Discard all unstaged local changes?",
            { modal: true },
            "Discard All"
          );
          if (confirm === "Discard All") {
            await this.client.discardAll();
            await this.refresh();
          }
          break;
        }
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
    const request = ++this.refreshRequest;
    this.panel.webview.postMessage({ type: "loading", loading: true });

    try {
      const snapshot = await this.client.snapshot();
      if (request !== this.refreshRequest) {
        return;
      }

      this.panel.webview.postMessage({ type: "snapshot", snapshot });

      if (selectedPath && snapshot.files.some((file) => file.path === selectedPath)) {
        this.selectedFile = selectedPath;
        await this.sendDiff(selectedPath);
      } else {
        this.selectedFile = undefined;
        this.panel.webview.postMessage({ type: "diff", path: undefined, diff: "" });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(detail);
      this.panel.webview.postMessage({ type: "error", error: detail });
    } finally {
      if (request === this.refreshRequest) {
        this.panel.webview.postMessage({ type: "loading", loading: false });
      }
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
          <button class="summaryMenu" title="Summary actions"><svg><use href="#icon-more"></use></svg></button>
          <form id="commitForm" class="commitBox">
            <textarea id="commitMessage" rows="3" placeholder="Commit Message"></textarea>
            <div class="branchCreateInline">
              <input id="newBranchName" class="branchNameInput" type="text" placeholder="New branch">
              <select id="sourceBranchSelect" title="Create from branch"></select>
              <button id="createBranchButton" type="button" title="Create branch from selected source"><svg><use href="#icon-branch"></use></svg>Create branch</button>
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
              <button id="discardButton"><svg><use href="#icon-trash"></use></svg>Discard</button>
            </div>
          </div>
          <div class="splitDiff">
            <pre id="diffBefore" class="diffOutput beforePane">Select a changed file to inspect its diff.</pre>
            <div class="diffResizer" id="diffResizer" title="Resize diff panes"></div>
            <pre id="diffOutput" class="diffOutput afterPane">Select a changed file to inspect its diff.</pre>
          </div>
        </section>

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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
