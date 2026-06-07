import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const maxSectionLength = 3_000;
const gitStdoutSoftLimit = 40_000;

export async function generateCommitMessage(cwd: string): Promise<string> {
  const gitContext = await collectGitContext(cwd);
  const { Codex } = await importCodexSdk();
  const codex = new Codex();
  const result = await runWithEffortFallback(codex, buildPrompt(gitContext), cwd);
  const message = cleanGeneratedMessage(result.finalResponse);

  if (!message) {
    throw new Error("No valid commit message was received from Codex.");
  }

  return message;
}

async function importCodexSdk(): Promise<typeof import("@openai/codex-sdk")> {
  const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@openai/codex-sdk")>;
  return nativeImport("@openai/codex-sdk");
}

async function collectGitContext(cwd: string): Promise<string> {
  const gitVersion = await runGitCommand(["--version"], cwd);
  const repoRoot = await runGitCommand(["rev-parse", "--show-toplevel"], cwd);
  const branch = await tryHeadAwareGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd, "No commits yet (HEAD not created)");
  const status = await runGitCommand(["status", "--short", "--branch"], cwd);
  const stagedDiff = await runGitCommand(["diff", "--cached", "--color=never"], cwd, gitStdoutSoftLimit);
  const diffTitle = stagedDiff ? "Staged diff" : "Working tree diff (no staged changes)";
  const diffBody = stagedDiff || await runGitCommand(["diff", "--color=never"], cwd, gitStdoutSoftLimit);
  const untrackedFiles = await runGitCommand(["ls-files", "--others", "--exclude-standard"], cwd);
  const recentCommits = await tryHeadAwareGit(["log", "--oneline", "-5"], cwd, "No commits yet");

  if (!diffBody.trim() && !untrackedFiles.trim()) {
    throw new Error("No staged, unstaged, or untracked changes were found to generate a commit message.");
  }

  return [
    formatSection("Git version", gitVersion),
    formatSection("Repository root", repoRoot),
    formatSection("Current branch", branch),
    formatSection("Status (--short --branch)", status),
    formatSection(diffTitle, diffBody),
    formatSection("Untracked files", untrackedFiles),
    formatSection("Recent commits", recentCommits)
  ].join("\n\n");
}

async function tryHeadAwareGit(args: string[], cwd: string, fallback: string): Promise<string> {
  try {
    return await runGitCommand(args, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isHeadMissingError(message)) {
      return fallback;
    }
    throw error;
  }
}

function buildPrompt(gitContext: string): string {
  return [
    "You are an assistant that drafts commit messages using the provided Git information.",
    "All required Git data has already been collected below. Do not run additional git commands.",
    "Follow the Conventional Commits style (type(scope?): subject) for the summary line and add a body only if it helps explain the change. Write the message in English. Do not use Markdown syntax; write in plain text.",
    "Return only the final commit message proposal.",
    gitContext
  ].join("\n\n");
}

async function runWithEffortFallback(codex: any, prompt: string, cwd: string) {
  const baseOpts = {
    model: "gpt-5.4-mini",
    workingDirectory: cwd,
    skipGitRepoCheck: true,
    modelReasoningEffort: "low"
  } as const;

  try {
    return await codex.startThread(baseOpts).run(prompt);
  } catch {
    return codex.startThread({ ...baseOpts, modelReasoningEffort: "medium" }).run(prompt);
  }
}

function cleanGeneratedMessage(value: unknown): string {
  let message = typeof value === "string" ? value.trim() : "";
  if (message.startsWith("```") && message.endsWith("```")) {
    message = message.slice(3, -3).trim();
  } else if (message.startsWith("`") && message.endsWith("`")) {
    message = message.slice(1, -1).trim();
  } else if (message.startsWith("**") && message.endsWith("**")) {
    message = message.slice(2, -2).trim();
  }
  return message;
}

function formatSection(title: string, body: string): string {
  return `### ${title}\n${truncateForPrompt(body || "N/A", maxSectionLength)}`;
}

function truncateForPrompt(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n... (truncated to ${limit} chars)`;
}

function isHeadMissingError(message: string): boolean {
  return /ambiguous argument 'HEAD'/i.test(message) || /unknown revision/i.test(message) || /does not have any commits yet/i.test(message);
}

async function runGitCommand(args: string[], cwd: string, softLimit?: number): Promise<string> {
  if (softLimit) {
    return runGitCommandWithSoftLimit(args, cwd, softLimit);
  }
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run git ${args.join(" ")}: ${message}`);
  }
}

function runGitCommandWithSoftLimit(args: string[], cwd: string, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const finishSuccess = (value: string) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const finishFailure = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      if (truncated) {
        return;
      }
      const text = chunk.toString();
      if (stdout.length + text.length > limit) {
        stdout += text.slice(0, Math.max(limit - stdout.length, 0));
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      stdout += text;
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      if (!truncated) {
        stderr += chunk.toString();
      }
    });
    child.on("error", (error) => finishFailure(new Error(`Failed to run git ${args.join(" ")}: ${error.message}`)));
    child.on("close", (code, signal) => {
      if (truncated) {
        finishSuccess(`${stdout.trim()}\n... (truncated to ${limit} chars)`.trim());
        return;
      }
      if (code === 0) {
        finishSuccess(stdout.trim());
        return;
      }
      const signalInfo = signal ? ` signal ${signal}` : "";
      finishFailure(new Error(`Failed to run git ${args.join(" ")}: ${stderr.trim() || `exit code ${code ?? "unknown"}${signalInfo}`}`));
    });
  });
}
