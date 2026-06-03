import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import * as path from "node:path";
import { mapWithConcurrency } from "../utils/async";
import { buildSelectedLinesPatch, parseDiff, type DiffSection, type DiffSectionKind } from "./diff";
import { parseBlame, parseBranches, parseCommits, parseConflictFiles, parseRemotes, parseStashes, parseStatus, parseSubmodules, parseTags, withMtime } from "./parsers";
import type { BlameLine, Branch, Commit, ConflictFile, GitFile, MergeState, Remote, Snapshot, Stash, Submodule, Tag } from "./types";

const gitTimeoutMs = 20_000;
const gitNetworkTimeoutMs = 120_000;
const maxStatusFilesWithMtime = 2_000;
export type PullStrategy = "ffOnly" | "merge" | "rebase";
export type ResetMode = "soft" | "mixed" | "hard";
const defaultCommitLimit = 80;

export class GitClient {
  constructor(private readonly cwd: string) {}

  async snapshot(commitLimit = defaultCommitLimit): Promise<Snapshot> {
    const [branch, branches, commitWindow, files, stashes, tags, remotes, submodules, conflicts, mergeState] = await Promise.all([
      this.currentBranch(),
      this.branches(),
      this.commitWindow(commitLimit),
      this.status(),
      this.stashes(),
      this.tags(),
      this.remotes(),
      this.submodules(),
      this.conflicts(),
      this.mergeState()
    ]);

    return {
      root: this.cwd,
      currentBranch: branch,
      detached: !branch,
      branches,
      commits: commitWindow.commits,
      hasMoreCommits: commitWindow.hasMore,
      files,
      stashes,
      tags,
      remotes,
      submodules,
      conflicts,
      mergeState
    };
  }

  async currentBranch(): Promise<string> {
    return (await this.git(["branch", "--show-current"])).trim();
  }

  async branches(): Promise<Branch[]> {
    const output = await this.git(["branch", "--format=%(HEAD)|%(refname:short)"]);
    return parseBranches(output);
  }

  async commits(limit = defaultCommitLimit): Promise<Commit[]> {
    return (await this.commitWindow(limit)).commits;
  }

  async commitWindow(limit = defaultCommitLimit): Promise<{ commits: Commit[]; hasMore: boolean }> {
    const format = "%H%x1f%h%x1f%P%x1f%D%x1f%s%x1f%an%x1f%cr";
    const output = await this.git([
      "log",
      "--topo-order",
      "--decorate=short",
      "--date=relative",
      `--pretty=format:${format}`,
      "-n",
      String(limit + 1)
    ]);
    const commits = parseCommits(output);

    return {
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit
    };
  }

  async status(): Promise<GitFile[]> {
    const files = parseStatus(await this.git(["status", "--porcelain=v1"], gitTimeoutMs));
    const filesForMtime = files.slice(0, maxStatusFilesWithMtime);
    const withMtimes = await mapWithConcurrency(filesForMtime, 64, async (file) => withMtime(file, await this.mtime(file.path)));
    const overflow = files.slice(maxStatusFilesWithMtime).map((file) => ({
      ...file,
      mtimeMs: 0,
      mtimeLabel: "not scanned"
    }));

    return [...withMtimes, ...overflow].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  }

  async conflicts(): Promise<ConflictFile[]> {
    return parseConflictFiles(await this.git(["status", "--porcelain=v1"], gitTimeoutMs));
  }

  async mergeState(): Promise<MergeState> {
    const [mergeHead, cherryPickHead, rebaseMerge, rebaseApply] = await Promise.all([
      this.gitPathExists("MERGE_HEAD"),
      this.gitPathExists("CHERRY_PICK_HEAD"),
      this.gitPathExists("rebase-merge"),
      this.gitPathExists("rebase-apply")
    ]);

    if (rebaseMerge || rebaseApply) {
      return { active: true, operation: "rebase" };
    }
    if (cherryPickHead) {
      return { active: true, operation: "cherryPick" };
    }
    if (mergeHead) {
      return { active: true, operation: "merge" };
    }
    return { active: false };
  }

  async stashes(): Promise<Stash[]> {
    return parseStashes(await this.git(["stash", "list", "--format=%gd%x1f%gs%x1f%cr"], gitTimeoutMs));
  }

  stashPush(message: string, includeUntracked: boolean): Promise<string> {
    const args = ["stash", "push"];
    if (includeUntracked) {
      args.push("--include-untracked");
    }
    if (message.trim()) {
      args.push("-m", message.trim());
    }
    return this.git(args);
  }

  stashApply(ref: string): Promise<string> {
    return this.git(["stash", "apply", ref]);
  }

  stashPop(ref: string): Promise<string> {
    return this.git(["stash", "pop", ref]);
  }

  stashDrop(ref: string): Promise<string> {
    return this.git(["stash", "drop", ref]);
  }

  stashShow(ref: string): Promise<string> {
    return this.git(["stash", "show", "--patch", ref], gitTimeoutMs);
  }

  async tags(): Promise<Tag[]> {
    return parseTags(await this.git(["tag", "--format=%(refname:short)|%(objectname:short)|%(subject)"], gitTimeoutMs));
  }

  createTag(name: string, ref: string, message?: string): Promise<string> {
    if (message?.trim()) {
      return this.git(["tag", "-a", name, ref, "-m", message.trim()]);
    }
    return this.git(["tag", name, ref]);
  }

  deleteTag(name: string): Promise<string> {
    return this.git(["tag", "-d", name]);
  }

  pushTag(name: string): Promise<string> {
    return this.git(["push", "origin", name], gitNetworkTimeoutMs);
  }

  async remotes(): Promise<Remote[]> {
    return parseRemotes(await this.git(["remote", "-v"], gitTimeoutMs));
  }

  addRemote(name: string, url: string): Promise<string> {
    return this.git(["remote", "add", name, url]);
  }

  removeRemote(name: string): Promise<string> {
    return this.git(["remote", "remove", name]);
  }

  renameRemote(oldName: string, newName: string): Promise<string> {
    return this.git(["remote", "rename", oldName, newName]);
  }

  setRemoteUrl(name: string, url: string): Promise<string> {
    return this.git(["remote", "set-url", name, url]);
  }

  async submodules(): Promise<Submodule[]> {
    return parseSubmodules(await this.tryGit(["submodule", "status"], gitTimeoutMs));
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

  async structuredDiff(filePath: string): Promise<DiffSection[]> {
    const [staged, unstaged] = await Promise.all([
      this.git(["diff", "--cached", "--", filePath], gitTimeoutMs),
      this.git(["diff", "--", filePath], gitTimeoutMs)
    ]);
    const sections: DiffSection[] = [];

    if (staged.trim()) {
      sections.push({ kind: "staged", title: "Staged changes", files: parseDiff(staged) });
    }
    if (unstaged.trim()) {
      sections.push({ kind: "unstaged", title: "Working tree changes", files: parseDiff(unstaged) });
    }

    return sections;
  }

  async blame(filePath: string): Promise<BlameLine[]> {
    return parseBlame(await this.git(["blame", "--porcelain", "--", filePath], gitTimeoutMs));
  }

  async stageHunk(filePath: string, hunkIndex: number): Promise<string> {
    const patch = await this.patchForHunk(filePath, "unstaged", hunkIndex);
    return this.gitWithInput(["apply", "--cached", "--unidiff-zero", "-"], patch);
  }

  async unstageHunk(filePath: string, hunkIndex: number): Promise<string> {
    const patch = await this.patchForHunk(filePath, "staged", hunkIndex);
    return this.gitWithInput(["apply", "--cached", "--reverse", "--unidiff-zero", "-"], patch);
  }

  async stageLines(filePath: string, hunkIndex: number, selectedLineIndexes: number[]): Promise<string> {
    const patch = await this.patchForSelectedLines(filePath, "unstaged", hunkIndex, selectedLineIndexes);
    return this.gitWithInput(["apply", "--cached", "--unidiff-zero", "-"], patch);
  }

  async unstageLines(filePath: string, hunkIndex: number, selectedLineIndexes: number[]): Promise<string> {
    const patch = await this.patchForSelectedLines(filePath, "staged", hunkIndex, selectedLineIndexes);
    return this.gitWithInput(["apply", "--cached", "--reverse", "--unidiff-zero", "-"], patch);
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

  amendCommit(message: string): Promise<string> {
    return this.git(["commit", "--amend", "-m", message]);
  }

  reset(mode: ResetMode, ref: string): Promise<string> {
    return this.git(["reset", `--${mode}`, ref]);
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

  rebaseBranch(branch: string): Promise<string> {
    return this.git(["rebase", branch]);
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

  async useOurs(filePath: string): Promise<string> {
    await this.git(["checkout", "--ours", "--", filePath]);
    return this.stage(filePath);
  }

  async useTheirs(filePath: string): Promise<string> {
    await this.git(["checkout", "--theirs", "--", filePath]);
    return this.stage(filePath);
  }

  markResolved(filePath: string): Promise<string> {
    return this.stage(filePath);
  }

  async abortOperation(): Promise<string> {
    const state = await this.mergeState();
    switch (state.operation) {
      case "merge":
        return this.git(["merge", "--abort"]);
      case "cherryPick":
        return this.git(["cherry-pick", "--abort"]);
      case "rebase":
        return this.git(["rebase", "--abort"]);
      default:
        throw new Error("No merge, cherry-pick, or rebase operation is active.");
    }
  }

  async continueOperation(): Promise<string> {
    const state = await this.mergeState();
    switch (state.operation) {
      case "merge":
        return this.git(["commit", "--no-edit"]);
      case "cherryPick":
        return this.git(["cherry-pick", "--continue"]);
      case "rebase":
        return this.git(["rebase", "--continue"]);
      default:
        throw new Error("No merge, cherry-pick, or rebase operation is active.");
    }
  }

  async skipOperation(): Promise<string> {
    const state = await this.mergeState();
    switch (state.operation) {
      case "cherryPick":
        return this.git(["cherry-pick", "--skip"]);
      case "rebase":
        return this.git(["rebase", "--skip"]);
      default:
        throw new Error("Skip is only available during cherry-pick or rebase operations.");
    }
  }

  fetch(): Promise<string> {
    return this.git(["fetch", "--all", "--prune"], gitNetworkTimeoutMs);
  }

  async pull(strategy: PullStrategy = "ffOnly"): Promise<string> {
    const branch = await this.currentBranch();
    if (!branch) {
      throw new Error("Cannot pull while HEAD is detached.");
    }

    const strategyArgs = pullStrategyArgs(strategy);
    const upstream = await this.tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (upstream.trim()) {
      return this.git(["pull", ...strategyArgs], gitNetworkTimeoutMs);
    }

    const originBranch = await this.tryGit(["show-ref", "--verify", `refs/remotes/origin/${branch}`]);
    if (!originBranch.trim()) {
      throw new Error(
        `No upstream is configured for ${branch}, and origin/${branch} was not found. Set upstream or push the branch first.`
      );
    }

    return this.git(["pull", ...strategyArgs, "origin", branch], gitNetworkTimeoutMs);
  }

  push(): Promise<string> {
    return this.git(["push"], gitNetworkTimeoutMs);
  }

  forcePushWithLease(): Promise<string> {
    return this.git(["push", "--force-with-lease"], gitNetworkTimeoutMs);
  }

  private async patchForHunk(filePath: string, kind: DiffSectionKind, hunkIndex: number): Promise<string> {
    return this.hunkFor(filePath, kind, hunkIndex).then(({ hunk }) => hunk.patch);
  }

  private async patchForSelectedLines(
    filePath: string,
    kind: DiffSectionKind,
    hunkIndex: number,
    selectedLineIndexes: number[]
  ): Promise<string> {
    const { file, hunk } = await this.hunkFor(filePath, kind, hunkIndex);
    return buildSelectedLinesPatch({ file, hunk, selectedLineIndexes });
  }

  private async hunkFor(filePath: string, kind: DiffSectionKind, hunkIndex: number) {
    const sections = await this.structuredDiff(filePath);
    const section = sections.find((candidate) => candidate.kind === kind);
    const entries = section?.files.flatMap((file) => file.hunks.map((hunk) => ({ file, hunk }))) ?? [];
    const entry = entries[hunkIndex];

    if (!entry) {
      throw new Error(`Could not find ${kind} hunk ${hunkIndex + 1} for ${filePath}.`);
    }

    return entry;
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

  private gitWithInput(args: string[], input: string, timeout = gitTimeoutMs): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile("git", args, { cwd: this.cwd, windowsHide: true, timeout, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || stdout || error.message).trim();
          reject(new Error(error.killed ? `Git command timed out: git ${args.join(" ")}` : detail));
          return;
        }
        resolve(stdout);
      });
      child.stdin?.end(input);
    });
  }

  private async mtime(filePath: string): Promise<number> {
    try {
      return (await stat(path.join(this.cwd, filePath))).mtimeMs;
    } catch {
      return 0;
    }
  }

  private async gitPathExists(relativePath: string): Promise<boolean> {
    const gitPath = (await this.tryGit(["rev-parse", "--git-path", relativePath])).trim();
    if (!gitPath) {
      return false;
    }
    try {
      await access(path.isAbsolute(gitPath) ? gitPath : path.join(this.cwd, gitPath));
      return true;
    } catch {
      return false;
    }
  }
}

function pullStrategyArgs(strategy: PullStrategy): string[] {
  switch (strategy) {
    case "merge":
      return ["--no-rebase"];
    case "rebase":
      return ["--rebase"];
    case "ffOnly":
    default:
      return ["--ff-only"];
  }
}
