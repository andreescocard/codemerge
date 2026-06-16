import type { BlameLine, Branch, Commit, ConflictFile, GitFile, Remote, Stash, Submodule, Tag } from "./types";
import { formatMtime } from "../utils/format";
import { assignCommitGraph } from "./graph";

export type StatusEntry = Omit<GitFile, "mtimeMs" | "mtimeLabel">;

export function parseBranches(output: string): Branch[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [head, name = "", upstream = "", tracking = ""] = line.split("|");
      const ahead = Number(tracking.match(/ahead\s+(\d+)/)?.[1] ?? 0);
      const behind = Number(tracking.match(/behind\s+(\d+)/)?.[1] ?? 0);
      return { name, current: head === "*", upstream: upstream || undefined, ahead, behind };
    });
}

export function parseCommits(output: string): Commit[] {
  const commits: Array<Omit<Commit, "lane" | "lanes" | "colorLane" | "routes">> = [];
  let current: Omit<Commit, "lane" | "lanes" | "colorLane" | "routes"> | undefined;

  output.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([*|\\/ _.-]+)?([a-f0-9]{40}\x1f.*)$/i);
    if (match) {
      const graph = match[1]?.trimEnd() || "";
      const payload = match[2] || line;
      const [hash, shortHash, parents = "", refs = "", subject = "", author = "", relativeDate = "", committedAt = ""] = payload.split("\x1f");
      current = {
        hash,
        shortHash,
        parents: parents.split(" ").filter(Boolean),
        refs,
        subject,
        author,
        relativeDate,
        committedAt,
        filesChanged: 0,
        graph
      };
      if (current.hash && current.shortHash) {
        commits.push(current);
      }
      return;
    }

    const shortstat = line.match(/(\d+)\s+files?\s+changed/i);
    if (current && shortstat) {
      current.filesChanged = Number(shortstat[1]);
    }
  });

  return assignCommitGraph(commits);
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

export function parseConflictFiles(output: string): ConflictFile[] {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line[0] ?? " ";
      const workingTree = line[1] ?? " ";
      const filePath = line.slice(3).replace(/^"|"$/g, "");
      const path = filePath.includes(" -> ") ? filePath.split(" -> ").at(-1) ?? filePath : filePath;
      return { path, index, workingTree, type: conflictType(index, workingTree) };
    })
    .filter((file) => file.type !== "none");
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

export function parseBlame(output: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const commits = new Map<string, { author: string; authorTime: number; summary: string }>();
  let currentHash = "";
  let currentLine = 0;
  let currentMeta = { author: "", authorTime: 0, summary: "" };

  output.split(/\r?\n/).forEach((line) => {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)(?:\s+\d+)?$/i);
    if (header) {
      currentHash = header[1];
      currentLine = Number(header[2]);
      currentMeta = commits.get(currentHash) ?? { author: "", authorTime: 0, summary: "" };
      return;
    }

    if (line.startsWith("author ")) {
      currentMeta = { ...currentMeta, author: line.slice("author ".length) };
      commits.set(currentHash, currentMeta);
      return;
    }

    if (line.startsWith("author-time ")) {
      currentMeta = { ...currentMeta, authorTime: Number(line.slice("author-time ".length)) };
      commits.set(currentHash, currentMeta);
      return;
    }

    if (line.startsWith("summary ")) {
      currentMeta = { ...currentMeta, summary: line.slice("summary ".length) };
      commits.set(currentHash, currentMeta);
      return;
    }

    if (line.startsWith("\t")) {
      lines.push({
        line: currentLine,
        hash: currentHash,
        shortHash: currentHash.slice(0, 8),
        author: currentMeta.author,
        authorTime: currentMeta.authorTime,
        summary: currentMeta.summary,
        text: line.slice(1)
      });
    }
  });

  return lines;
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

function conflictType(index: string, workingTree: string): string {
  const code = `${index}${workingTree}`;
  switch (code) {
    case "DD":
      return "both deleted";
    case "AU":
      return "added by us";
    case "UD":
      return "deleted by them";
    case "UA":
      return "added by them";
    case "DU":
      return "deleted by us";
    case "AA":
      return "both added";
    case "UU":
      return "both modified";
    default:
      return "none";
  }
}
