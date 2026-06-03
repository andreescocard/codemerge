import * as vscode from "vscode";
import * as path from "node:path";
import { GitClient } from "../git/client";
import { MessageType, type WebviewMessage } from "../protocol";
import { renderHtml } from "./html";
import { blameUri, showUri } from "./gitContent";
export class CodeMergePanel {
  private static currentPanel: CodeMergePanel | undefined;
  private static readonly commitPageSize = 80;
  private readonly client: GitClient;
  private commitLimit = CodeMergePanel.commitPageSize;
  private commitScope: string | undefined;
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
    // The initial load is requested by the webview (refresh/setCommitScope) once
    // its message listener is ready; posting a snapshot here would race that and
    // could be dropped before the webview finishes loading.
  }

  private async handleMessage(message: WebviewMessage) {
    try {
      switch (message.type) {
        case MessageType.Refresh:
          this.commitLimit = CodeMergePanel.commitPageSize;
          await this.refresh();
          break;
        case MessageType.LoadMoreCommits:
          this.commitLimit += CodeMergePanel.commitPageSize;
          await this.refresh();
          break;
        case MessageType.SetCommitScope:
          this.commitScope = message.ref?.trim() || undefined;
          this.commitLimit = CodeMergePanel.commitPageSize;
          await this.refresh();
          break;
        case MessageType.SelectFile:
          this.selectedFile = message.path;
          if (message.hash && message.path) {
            await this.sendCommitDiff(message.hash, message.path);
          } else {
            await this.sendDiff(message.path);
          }
          break;
        case MessageType.SelectCommit:
          if (message.hash) {
            const files = await this.client.commitFiles(message.hash);
            this.panel.webview.postMessage({ type: "commitFiles", hash: message.hash, files });
          }
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
            if (message.amend) {
              await this.client.amendCommit(message.message.trim());
            } else {
              await this.client.commit(message.message.trim());
            }
            await this.refresh();
          }
          break;
        case MessageType.Reset:
          if (message.hash && message.mode) {
            const label = `Reset --${message.mode} to ${message.hash.slice(0, 8)}?`;
            const detail = message.mode === "hard"
              ? "Hard reset discards working tree and index changes."
              : "This moves the current branch to the selected commit.";
            const confirm = await vscode.window.showWarningMessage(label, { modal: message.mode === "hard", detail }, "Reset");
            if (confirm === "Reset") {
              await this.client.reset(message.mode, message.hash);
              await this.refresh();
            }
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
            const branch = message.branch;
            const current = await this.client.currentBranch();
            const confirm = await vscode.window.showWarningMessage(
              `Merge ${branch} into ${current || "detached HEAD"}?`,
              { modal: true },
              "Merge"
            );
            if (confirm === "Merge") {
              await this.runConflictAwareOperation(() => this.client.mergeBranch(branch));
              await this.refresh();
            }
          }
          break;
        case MessageType.RebaseBranch:
          if (message.branch) {
            const branch = message.branch;
            const current = await this.client.currentBranch();
            const confirm = await vscode.window.showWarningMessage(
              `Rebase ${current || "detached HEAD"} onto ${branch}?`,
              { modal: true },
              "Rebase"
            );
            if (confirm === "Rebase") {
              await this.runConflictAwareOperation(() => this.client.rebaseBranch(branch));
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
            const hash = message.hash;
            const confirm = await vscode.window.showWarningMessage(
              `Cherry-pick ${hash.slice(0, 8)} onto the current branch?`,
              { modal: true },
              "Cherry-pick"
            );
            if (confirm === "Cherry-pick") {
              await this.runConflictAwareOperation(() => this.client.cherryPick(hash));
              await this.refresh();
            }
          }
          break;
        case MessageType.UseOurs:
          if (message.path) {
            await this.client.useOurs(message.path);
            await this.refresh(message.path);
          }
          break;
        case MessageType.UseTheirs:
          if (message.path) {
            await this.client.useTheirs(message.path);
            await this.refresh(message.path);
          }
          break;
        case MessageType.MarkResolved:
          if (message.path) {
            await this.client.markResolved(message.path);
            await this.refresh(message.path);
          }
          break;
        case MessageType.AbortOperation: {
          const confirm = await vscode.window.showWarningMessage(
            "Abort the active Git operation?",
            { modal: true },
            "Abort"
          );
          if (confirm === "Abort") {
            await this.client.abortOperation();
            await this.refresh();
          }
          break;
        }
        case MessageType.ContinueOperation:
          await this.client.continueOperation();
          await this.refresh();
          break;
        case MessageType.SkipOperation:
          await this.client.skipOperation();
          await this.refresh();
          break;
        case MessageType.Blame:
          // Open blame in its own read-only tab for legibility, beside the panel.
          if (message.path) {
            const doc = await vscode.workspace.openTextDocument(blameUri(this.root, message.path));
            await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
          }
          break;
        case MessageType.OpenFile:
          // Open the real file in an editable editor tab.
          if (message.path) {
            const uri = vscode.Uri.file(path.join(this.root, message.path));
            await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Beside });
          }
          break;
        case MessageType.ShowDiff:
          // Native side-by-side diff (HEAD vs working tree); left side is read-only.
          if (message.path) {
            const left = showUri(this.root, "HEAD", message.path);
            const right = vscode.Uri.file(path.join(this.root, message.path));
            await vscode.commands.executeCommand(
              "vscode.diff",
              left,
              right,
              `${message.path} (HEAD ↔ Working Tree)`,
              { preview: true, viewColumn: vscode.ViewColumn.Beside }
            );
          }
          break;
        case MessageType.Fetch:
          await this.client.fetch();
          await this.refresh();
          break;
        case MessageType.Pull:
          await this.client.pull(message.strategy);
          await this.refresh();
          break;
        case MessageType.Push:
          await this.client.push();
          await this.refresh();
          break;
        case MessageType.ForcePush: {
          const confirm = await vscode.window.showWarningMessage(
            "Force push the current branch with --force-with-lease?",
            {
              modal: true,
              detail: "This refuses to overwrite remote work you have not fetched, but it can still rewrite remote history."
            },
            "Force Push"
          );
          if (confirm === "Force Push") {
            await this.client.forcePushWithLease();
            await this.refresh();
          }
          break;
        }
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
      const snapshot = await this.client.snapshot(this.commitLimit, this.commitScope);
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

  private async sendCommitDiff(hash: string, filePath: string) {
    const diff = await this.client.commitFileDiff(hash, filePath);
    const structuredDiff = await this.client.structuredCommitFileDiff(hash, filePath);
    this.panel.webview.postMessage({ type: "diff", path: filePath, hash, diff, structuredDiff });
  }

  private async runConflictAwareOperation(operation: () => Promise<string>): Promise<void> {
    try {
      await operation();
    } catch (error) {
      const state = await this.client.mergeState();
      if (state.active) {
        vscode.window.showWarningMessage("Git operation stopped for conflict resolution.");
        return;
      }
      throw error;
    }
  }
}
