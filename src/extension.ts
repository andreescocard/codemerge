import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { GitClient } from "./git/client";
import { renderSidebarHtml } from "./panel/html";
import { CodeMergePanel } from "./panel/panel";

const selectedRootKey = "codemerge.selectedRoot";

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
