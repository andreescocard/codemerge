import { describe, expect, it } from "vitest";
import { buildSelectedLinesPatch, parseDiff } from "./diff";

describe("parseDiff", () => {
  it("parses files, hunks, line kinds, and line numbers", () => {
    const parsed = parseDiff([
      "diff --git a/file.txt b/file.txt",
      "index 5626abf..f719efd 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,3 +1,4 @@",
      " one",
      "-two",
      "+two changed",
      "+three",
      " four"
    ].join("\n"));

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      oldPath: "file.txt",
      newPath: "file.txt",
      hunks: [
        {
          index: 0,
          header: "@@ -1,3 +1,4 @@",
          oldStart: 1,
          oldLines: 3,
          newStart: 1,
          newLines: 4
        }
      ]
    });
    expect(parsed[0].hunks[0].lines).toEqual([
      { kind: "context", text: "one", oldLine: 1, newLine: 1 },
      { kind: "del", text: "two", oldLine: 2 },
      { kind: "add", text: "two changed", newLine: 2 },
      { kind: "add", text: "three", newLine: 3 },
      { kind: "context", text: "four", oldLine: 3, newLine: 4 }
    ]);
    expect(parsed[0].hunks[0].patch).toContain("@@ -1,3 +1,4 @@\n one\n-two\n+two changed\n+three\n four\n");
  });

  it("builds a minimal patch for selected changed lines", () => {
    const [file] = parseDiff([
      "diff --git a/file.txt b/file.txt",
      "index 5626abf..f719efd 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,2 +1,4 @@",
      " one",
      "+selected",
      " two",
      "+unselected"
    ].join("\n"));

    expect(buildSelectedLinesPatch({ file, hunk: file.hunks[0], selectedLineIndexes: [1] })).toBe([
      "diff --git a/file.txt b/file.txt",
      "index 5626abf..f719efd 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,2 +1,3 @@",
      " one",
      "+selected",
      " two",
      ""
    ].join("\n"));
  });
});
