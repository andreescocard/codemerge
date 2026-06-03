import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitClient } from "./client";

const execFileAsync = promisify(execFile);

describe("GitClient", () => {
  let repo: string;
  let client: GitClient;

  beforeAll(async () => {
    repo = path.join(tmpdir(), `codemerge-${Date.now()}`);
    await mkdir(repo, { recursive: true });
    await git(["init", "-b", "main"]);
    await git(["config", "user.email", "codemerge@example.test"]);
    await git(["config", "user.name", "CodeMerge Tests"]);
    await writeFile(path.join(repo, "file.txt"), "one\n", "utf8");
    await git(["add", "file.txt"]);
    await git(["commit", "-m", "initial"]);
    client = new GitClient(repo);
  });

  afterAll(async () => {
    if (repo) {
      await rm(repo, { recursive: true, force: true });
    }
  });

  it("reads branch and commit state from a real repository", async () => {
    expect(await client.currentBranch()).toBe("main");
    expect(await client.branches()).toContainEqual({ name: "main", current: true });
    expect((await client.commits())[0]).toMatchObject({ subject: "initial", author: "CodeMerge Tests" });
  });

  it("stages and commits working tree changes", async () => {
    await writeFile(path.join(repo, "file.txt"), "one\ntwo\n", "utf8");
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: " ", workingTree: "M", staged: false }]);
    expect(await client.structuredDiff("file.txt")).toMatchObject([
      { kind: "unstaged", files: [{ hunks: [{ index: 0 }] }] }
    ]);

    await client.stageHunk("file.txt", 0);
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: "M", workingTree: " ", staged: true }]);

    await client.unstageHunk("file.txt", 0);
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: " ", workingTree: "M", staged: false }]);

    await client.stage("file.txt");
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: "M", workingTree: " ", staged: true }]);

    await client.commit("update file");
    expect(await client.status()).toEqual([]);
    expect((await client.commits())[0]).toMatchObject({ subject: "update file" });
  });

  it("stages and unstages selected lines", async () => {
    await writeFile(path.join(repo, "file.txt"), "one\nselected\ntwo\nunstaged\n", "utf8");

    await client.stageLines("file.txt", 0, [1]);
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: "M", workingTree: "M", staged: true }]);
    expect(await gitOutput(["diff", "--cached", "--", "file.txt"])).toContain("+selected");
    expect(await gitOutput(["diff", "--cached", "--", "file.txt"])).not.toContain("+unstaged");

    await client.unstageLines("file.txt", 0, [1]);
    expect(await client.status()).toMatchObject([{ path: "file.txt", index: " ", workingTree: "M", staged: false }]);
    await client.discard("file.txt");
  });

  it("amends the last commit message", async () => {
    await writeFile(path.join(repo, "amend.txt"), "amend\n", "utf8");
    await client.stage("amend.txt");
    await client.commit("amend target");

    await client.amendCommit("amended target");
    expect((await client.commits())[0]).toMatchObject({ subject: "amended target" });
  });

  it("reads blame data for a tracked file", async () => {
    const blame = await client.blame("file.txt");
    expect(blame.length).toBeGreaterThan(0);
    expect(blame[0]).toMatchObject({ author: "CodeMerge Tests" });
  });

  it("detects and resolves merge conflicts", async () => {
    await writeFile(path.join(repo, "conflict.txt"), "base\n", "utf8");
    await client.stage("conflict.txt");
    await client.commit("add conflict base");

    await git(["checkout", "-b", "conflict-other"]);
    await writeFile(path.join(repo, "conflict.txt"), "theirs\n", "utf8");
    await client.stage("conflict.txt");
    await client.commit("theirs change");

    await git(["checkout", "main"]);
    await writeFile(path.join(repo, "conflict.txt"), "ours\n", "utf8");
    await client.stage("conflict.txt");
    await client.commit("ours change");

    await expect(client.mergeBranch("conflict-other")).rejects.toThrow();
    expect(await client.mergeState()).toEqual({ active: true, operation: "merge" });
    expect(await client.conflicts()).toEqual([
      { path: "conflict.txt", index: "U", workingTree: "U", type: "both modified" }
    ]);

    await client.useOurs("conflict.txt");
    expect(await client.conflicts()).toEqual([]);
    await client.abortOperation();
  });

  async function git(args: string[]) {
    await execFileAsync("git", args, { cwd: repo, windowsHide: true });
  }

  async function gitOutput(args: string[]) {
    const { stdout } = await execFileAsync("git", args, { cwd: repo, windowsHide: true });
    return stdout;
  }
});
