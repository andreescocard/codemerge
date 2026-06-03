import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { GitClient } from "./git/client";
import { renderSidebarHtml } from "./panel/html";
import { CodeMergePanel } from "./panel/panel";
import { registerGitContentProvider } from "./panel/gitContent";

const selectedRootKey = "codemerge.selectedRoot";
const recentRootsKey = "codemerge.recentRoots";
const maxRecentRoots = 8;

export function activate(context: vscode.ExtensionContext) {
  registerGitContentProvider(context);

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

      await recordRecentRoot(context, root);
      CodeMergePanel.createOrShow(context.extensionUri, root);
    })
  );
}

export function deactivate() {}

class CodeMergeSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "codemerge.sidebar";
  private static readonly refreshDebounceMs = 600;

  private view?: vscode.WebviewView;
  private watcher?: vscode.FileSystemWatcher;
  private watchedRoot?: string;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
    };

    webviewView.webview.html = renderSidebarHtml(webviewView.webview);

    // Refresh when the view is shown again, and when the window regains focus.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.scheduleUpdate(0);
      }
    });
    this.context.subscriptions.push(
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused && webviewView.visible) {
          this.scheduleUpdate(0);
        }
      })
    );
    webviewView.onDidDispose(() => this.disposeWatcher());
    webviewView.webview.onDidReceiveMessage(
      async (message: { type: "open" | "openRepository" | "refresh" | "selectRepository" | "removeRepository"; root?: string }) => {
        if (message.type === "open") {
          await vscode.commands.executeCommand("codemerge.open");
        }
        if (message.type === "openRepository") {
          const root = await pickGitRoot(this.context);
          if (root) {
            await recordRecentRoot(this.context, root);
            CodeMergePanel.createOrShow(this.context.extensionUri, root);
            await this.updateSidebar(webviewView);
          }
        }
        if (message.type === "selectRepository" && message.root) {
          if (await gitRootFor(message.root)) {
            await this.context.workspaceState.update(selectedRootKey, message.root);
            await recordRecentRoot(this.context, message.root);
            CodeMergePanel.createOrShow(this.context.extensionUri, message.root);
          } else {
            await removeRecentRoot(this.context, message.root);
            vscode.window.showErrorMessage(`No longer a Git repository: ${message.root}`);
          }
          await this.updateSidebar(webviewView);
        }
        if (message.type === "removeRepository" && message.root) {
          await removeRecentRoot(this.context, message.root);
          await this.updateSidebar(webviewView);
        }
        if (message.type === "refresh") {
          await this.updateSidebar(webviewView);
        }
      }
    );

    void this.updateSidebar(webviewView);
  }

  // Debounced refresh so bursts of file events collapse into a single git read.
  private scheduleUpdate(delay = CodeMergeSidebarProvider.refreshDebounceMs) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      if (this.view) {
        void this.updateSidebar(this.view);
      }
    }, delay);
  }

  // Watch the active repo (working tree + .git) so changes show without manual refresh.
  private ensureWatcher(root: string | undefined) {
    if (this.watchedRoot === root) {
      return;
    }
    this.disposeWatcher();
    this.watchedRoot = root;
    if (!root) {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(root), "**/*")
    );
    const onEvent = () => {
      // Only spend cycles while the view is actually visible.
      if (this.view?.visible) {
        this.scheduleUpdate();
      }
    };
    watcher.onDidChange(onEvent);
    watcher.onDidCreate(onEvent);
    watcher.onDidDelete(onEvent);
    this.watcher = watcher;
    this.context.subscriptions.push(watcher);
  }

  private disposeWatcher() {
    this.watcher?.dispose();
    this.watcher = undefined;
    this.watchedRoot = undefined;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private async updateSidebar(webviewView: vscode.WebviewView) {
    const root = await resolveGitRoot(this.context);
    this.ensureWatcher(root);
    const recent = getRecentRoots(this.context).map((path) => ({ path, name: basename(path) }));

    if (!root) {
      webviewView.webview.postMessage({
        type: "state",
        state: {
          root: "No Git repository open",
          branch: "-",
          changed: 0,
          commits: 0,
          ready: false,
          recent,
          active: undefined
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
          branch: snapshot.detached ? "detached" : snapshot.currentBranch,
          changed: snapshot.files.length,
          commits: snapshot.commits.length,
          ready: true,
          recent,
          active: root
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
          ready: false,
          recent,
          active: root
        }
      });
    }
  }
}

function getRecentRoots(context: vscode.ExtensionContext): string[] {
  return context.globalState.get<string[]>(recentRootsKey, []);
}

async function recordRecentRoot(context: vscode.ExtensionContext, root: string): Promise<void> {
  const next = [root, ...getRecentRoots(context).filter((entry) => entry !== root)].slice(0, maxRecentRoots);
  await context.globalState.update(recentRootsKey, next);
}

async function removeRecentRoot(context: vscode.ExtensionContext, root: string): Promise<void> {
  const next = getRecentRoots(context).filter((entry) => entry !== root);
  await context.globalState.update(recentRootsKey, next);
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
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
