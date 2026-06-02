import { describe, expect, it } from "vitest";
import { parseBranches, parseCommits, parseStatus } from "./parsers";
import { formatMtime } from "../utils/format";

describe("git parsers", () => {
  it("parses porcelain status entries", () => {
    expect(parseStatus(" M src/app.ts\nA  README.md\nR  old.txt -> new.txt\n?? scratch.txt\n")).toEqual([
      { path: "src/app.ts", index: " ", workingTree: "M", staged: false },
      { path: "README.md", index: "A", workingTree: " ", staged: true },
      { path: "new.txt", index: "R", workingTree: " ", staged: true },
      { path: "scratch.txt", index: "?", workingTree: "?", staged: false }
    ]);
  });

  it("parses formatted branch output", () => {
    expect(parseBranches("*|main\n |feature\n")).toEqual([
      { name: "main", current: true },
      { name: "feature", current: false }
    ]);
  });

  it("parses graph-prefixed commit rows", () => {
    const line = "* 0123456789abcdef0123456789abcdef01234567\x1f0123456\x1fHEAD -> main\x1fInitial commit\x1fAda\x1f2 minutes ago";
    expect(parseCommits(`${line}\n`)).toEqual([
      {
        hash: "0123456789abcdef0123456789abcdef01234567",
        shortHash: "0123456",
        refs: "HEAD -> main",
        subject: "Initial commit",
        author: "Ada",
        relativeDate: "2 minutes ago",
        graph: "*"
      }
    ]);
  });
});

describe("formatMtime", () => {
  it("formats deleted and relative timestamps", () => {
    const now = new Date("2026-06-02T12:00:00Z").getTime();
    expect(formatMtime(0, now)).toBe("deleted");
    expect(formatMtime(now - 30_000, now)).toBe("just now");
    expect(formatMtime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatMtime(now - 3 * 60 * 60_000, now)).toBe("3h ago");
    expect(formatMtime(now - 2 * 24 * 60 * 60_000, now)).toBe("2d ago");
  });
});
