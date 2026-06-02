import type { Branch, Commit, GitFile } from "./types";
import { formatMtime } from "../utils/format";

export type StatusEntry = Omit<GitFile, "mtimeMs" | "mtimeLabel">;

export function parseBranches(output: string): Branch[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [head, name] = line.split("|");
      return { name, current: head === "*" };
    });
}

export function parseCommits(output: string): Commit[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([*|\\/ _.-]+)?([a-f0-9]{40}\x1f.*)$/i);
      const graph = match?.[1]?.trimEnd() || "";
      const payload = match?.[2] || line;
      const [hash, shortHash, refs, subject, author, relativeDate] = payload.split("\x1f");
      return { hash, shortHash, refs, subject, author, relativeDate, graph };
    })
    .filter((commit) => commit.hash && commit.shortHash);
}

export function parseStatus(output: string): StatusEntry[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line[0] ?? " ";
      const workingTree = line[1] ?? " ";
      const filePath = line.slice(3).replace(/^"|"$/g, "");
      const path = filePath.includes(" -> ") ? filePath.split(" -> ").at(-1) ?? filePath : filePath;
      return {
        path,
        index,
        workingTree,
        staged: index !== " " && index !== "?"
      };
    });
}

export function withMtime(entry: StatusEntry, mtimeMs: number): GitFile {
  return {
    ...entry,
    mtimeMs,
    mtimeLabel: formatMtime(mtimeMs)
  };
}
