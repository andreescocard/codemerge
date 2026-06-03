import * as vscode from "vscode";
import { GitClient } from "../git/client";
import { MessageType, type WebviewMessage } from "../protocol";
import { renderHtml } from "./html";
export class CodeMergePanel {
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

  private async handleMessage(message: WebviewMessage) {
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
        case MessageType.StageHunk:
          if (message.path && message.hunkIndex !== undefined) {
            await this.client.stageHunk(message.path, message.hunkIndex);
            await this.refresh(message.path);
          }
          break;
        case MessageType.StageLines:
          if (message.path && message.hunkIndex !== undefined && message.lineIndexes?.length) {
            await this.client.stageLines(message.path, message.hunkIndex, message.lineIndexes);
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
        case MessageType.UnstageHunk:
          if (message.path && message.hunkIndex !== undefined) {
            await this.client.unstageHunk(message.path, message.hunkIndex);
            await this.refresh(message.path);
          }
          break;
        case MessageType.UnstageLines:
          if (message.path && message.hunkIndex !== undefined && message.lineIndexes?.length) {
            await this.client.unstageLines(message.path, message.hunkIndex, message.lineIndexes);
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
        case MessageType.StashPush: {
          const stashMessage = await vscode.window.showInputBox({
            prompt: "Stash message",
            placeHolder: "WIP",
            ignoreFocusOut: true
          });
          if (stashMessage !== undefined) {
            await this.client.stashPush(stashMessage, Boolean(message.includeUntracked));
            await this.refresh();
          }
          break;
        }
        case MessageType.StashApply:
          if (message.ref) {
            await this.client.stashApply(message.ref);
            await this.refresh();
          }
          break;
        case MessageType.StashPop:
          if (message.ref) {
            await this.client.stashPop(message.ref);
            await this.refresh();
          }
          break;
        case MessageType.StashDrop:
          if (message.ref) {
            const confirm = await vscode.window.showWarningMessage(
              `Drop ${message.ref}?`,
              { modal: true },
              "Drop"
            );
            if (confirm === "Drop") {
              await this.client.stashDrop(message.ref);
              await this.refresh();
            }
          }
          break;
        case MessageType.StashShow:
          if (message.ref) {
            const diff = await this.client.stashShow(message.ref);
            this.panel.webview.postMessage({ type: "diff", path: message.ref, diff });
          }
          break;
        case MessageType.CreateTag: {
          const name = await vscode.window.showInputBox({
            prompt: "Tag name",
            placeHolder: "v1.0.0",
            ignoreFocusOut: true
          });
          if (!name?.trim()) {
            break;
          }
          const ref = await vscode.window.showInputBox({
            prompt: `Create ${name.trim()} at ref`,
            value: "HEAD",
            ignoreFocusOut: true
          });
          if (ref?.trim()) {
            await this.client.createTag(name.trim(), ref.trim());
            await this.refresh();
          }
          break;
        }
        case MessageType.DeleteTag:
          if (message.tag) {
            const confirm = await vscode.window.showWarningMessage(
              `Delete tag ${message.tag}?`,
              { modal: true },
              "Delete"
            );
            if (confirm === "Delete") {
              await this.client.deleteTag(message.tag);
              await this.refresh();
            }
          }
          break;
        case MessageType.PushTag:
          if (message.tag) {
            await this.client.pushTag(message.tag);
            await this.refresh();
          }
          break;
        case MessageType.AddRemote: {
          const name = await vscode.window.showInputBox({
            prompt: "Remote name",
            placeHolder: "origin",
            ignoreFocusOut: true
          });
          if (!name?.trim()) {
            break;
          }
          const url = await vscode.window.showInputBox({
            prompt: `URL for ${name.trim()}`,
            ignoreFocusOut: true
          });
          if (url?.trim()) {
            await this.client.addRemote(name.trim(), url.trim());
            await this.refresh();
          }
          break;
        }
        case MessageType.RemoveRemote:
          if (message.remote) {
            const confirm = await vscode.window.showWarningMessage(
              `Remove remote ${message.remote}?`,
              { modal: true },
              "Remove"
            );
            if (confirm === "Remove") {
              await this.client.removeRemote(message.remote);
              await this.refresh();
            }
          }
          break;
        case MessageType.RenameRemote:
          if (message.remote) {
            const newName = await vscode.window.showInputBox({
              prompt: `Rename ${message.remote}`,
              value: message.remote,
              ignoreFocusOut: true
            });
            if (newName?.trim() && newName.trim() !== message.remote) {
              await this.client.renameRemote(message.remote, newName.trim());
              await this.refresh();
            }
          }
          break;
        case MessageType.SetRemoteUrl:
          if (message.remote) {
            const url = await vscode.window.showInputBox({
              prompt: `Set URL for ${message.remote}`,
              value: message.url,
              ignoreFocusOut: true
            });
            if (url?.trim()) {
              await this.client.setRemoteUrl(message.remote, url.trim());
              await this.refresh();
            }
          }
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
    const structuredDiff = await this.client.structuredDiff(filePath);
    this.panel.webview.postMessage({ type: "diff", path: filePath, diff, structuredDiff });
  }
}
