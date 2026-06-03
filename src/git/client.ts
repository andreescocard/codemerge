import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import * as path from "node:path";
import { mapWithConcurrency } from "../utils/async";
import { buildSelectedLinesPatch, parseDiff, type DiffSection, type DiffSectionKind } from "./diff";
import { parseBranches, parseCommits, parseRemotes, parseStashes, parseStatus, parseSubmodules, parseTags, withMtime } from "./parsers";
import type { Branch, Commit, GitFile, Remote, Snapshot, Stash, Submodule, Tag } from "./types";

const gitTimeoutMs = 20_000;
const gitNetworkTimeoutMs = 120_000;
const maxStatusFilesWithMtime = 2_000;

export class GitClient {
  constructor(private readonly cwd: string) {}

  async snapshot(): Promise<Snapshot> {
    const [branch, branches, commits, files, stashes, tags, remotes, submodules] = await Promise.all([
      this.currentBranch(),
      this.branches(),
      this.commits(),
      this.status(),
      this.stashes(),
      this.tags(),
      this.remotes(),
      this.submodules()
    ]);

    return {
      root: this.cwd,
      currentBranch: branch,
      branches,
      commits,
      files,
      stashes,
      tags,
      remotes,
      submodules
    };
  }

  async currentBranch(): Promise<string> {
    return (await this.git(["branch", "--show-current"])).trim() || "detached";
  }

  async branches(): Promise<Branch[]> {
    const output = await this.git(["branch", "--format=%(HEAD)|%(refname:short)"]);
    return parseBranches(output);
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

    return parseCommits(output);
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
}
