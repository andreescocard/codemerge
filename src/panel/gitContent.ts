import * as vscode from "vscode";
import { execFile } from "node:child_process";

// Virtual document schemes backing the read-only tabs opened from a file row.
export const gitShowScheme = "codemerge-show";
export const gitBlameScheme = "codemerge-blame";

const maxBuffer = 64 * 1024 * 1024;

function gitText(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, windowsHide: true, maxBuffer }, (error, stdout) => {
      // A missing blob (e.g. a newly added file has no HEAD version) yields empty content.
      resolve(error ? "" : stdout);
    });
  });
}

type ContentQuery = { root: string; ref?: string; path: string };

// Serves file content at a git ref (for diffs) and blame output (for the blame tab).
// Documents under these schemes are read-only by virtue of being content-provider backed.
export class GitContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { root, ref, path: rel } = JSON.parse(uri.query) as ContentQuery;
    if (uri.scheme === gitBlameScheme) {
      return gitText(["blame", "--date=short", "--", rel], root);
    }
    return gitText(["show", `${ref ?? "HEAD"}:${rel}`], root);
  }
}

export function registerGitContentProvider(context: vscode.ExtensionContext): void {
  const provider = new GitContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(gitShowScheme, provider),
    vscode.workspace.registerTextDocumentContentProvider(gitBlameScheme, provider)
  );
}

// path keeps the original extension so VS Code applies syntax highlighting in the diff view.
export function showUri(root: string, ref: string, rel: string): vscode.Uri {
  return vscode.Uri.from({ scheme: gitShowScheme, path: `/${rel}`, query: JSON.stringify({ root, ref, path: rel }) });
}

export function blameUri(root: string, rel: string): vscode.Uri {
  return vscode.Uri.from({ scheme: gitBlameScheme, path: `/${rel}.blame`, query: JSON.stringify({ root, path: rel }) });
}
