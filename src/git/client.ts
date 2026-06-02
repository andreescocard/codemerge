import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import * as path from "node:path";
import { mapWithConcurrency } from "../utils/async";
import { parseBranches, parseCommits, parseStatus, withMtime } from "./parsers";
import type { Branch, Commit, GitFile, Snapshot } from "./types";

const gitTimeoutMs = 20_000;
const gitNetworkTimeoutMs = 120_000;
const maxStatusFilesWithMtime = 2_000;

export class GitClient {
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
