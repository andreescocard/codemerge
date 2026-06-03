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
  });

  async function git(args: string[]) {
    await execFileAsync("git", args, { cwd: repo, windowsHide: true });
  }

  async function gitOutput(args: string[]) {
    const { stdout } = await execFileAsync("git", args, { cwd: repo, windowsHide: true });
    return stdout;
  }
});
