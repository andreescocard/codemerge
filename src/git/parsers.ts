import type { Branch, Commit, GitFile, Remote, Stash, Submodule, Tag } from "./types";
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

export function parseStashes(output: string): Stash[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [ref = "", subject = "", relativeDate = ""] = line.split("\x1f");
      return { ref, subject, relativeDate };
    })
    .filter((stash) => stash.ref);
}

export function parseTags(output: string): Tag[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name = "", object = "", subject = ""] = line.split("|");
      return { name, object, subject };
    })
    .filter((tag) => tag.name);
}

export function parseRemotes(output: string): Remote[] {
  const remotes = new Map<string, Remote>();

  output
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/);
      if (!match) {
        return;
      }

      const [, name, url, kind] = match;
      const remote = remotes.get(name) ?? { name, fetchUrl: "", pushUrl: "" };
      if (kind === "fetch") {
        remote.fetchUrl = url;
      } else {
        remote.pushUrl = url;
      }
      remotes.set(name, remote);
    });

  return [...remotes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSubmodules(output: string): Submodule[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const statusMarker = line[0] ?? " ";
      const trimmed = line.trim();
      const [commit = "", path = "", ...descriptionParts] = trimmed.split(/\s+/);
      const status = submoduleStatus(statusMarker);
      return {
        path,
        commit: commit.replace(/^[+\-U]/, ""),
        status,
        description: descriptionParts.join(" ").replace(/^\((.*)\)$/, "$1")
      };
    })
    .filter((submodule) => submodule.path);
}

function submoduleStatus(marker: string): Submodule["status"] {
  switch (marker) {
    case "-":
      return "notInitialized";
    case "+":
      return "modified";
    case "U":
      return "conflict";
    default:
      return "initialized";
  }
}
