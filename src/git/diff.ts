export type DiffLineKind = "context" | "add" | "del" | "meta";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type DiffHunk = {
  index: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
  patch: string;
};

export type DiffFile = {
  oldPath: string;
  newPath: string;
  header: string[];
  hunks: DiffHunk[];
};

export type SelectedLinesPatchInput = {
  file: DiffFile;
  hunk: DiffHunk;
  selectedLineIndexes: number[];
};

export type DiffSectionKind = "staged" | "unstaged" | "commit";

export type DiffSection = {
  kind: DiffSectionKind;
  title: string;
  files: DiffFile[];
};

const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | undefined;
  let currentHunkLines: string[] = [];
  let oldLine = 0;
  let newLine = 0;

  function finishHunk() {
    if (!currentFile || !currentHunkLines.length) {
      return;
    }

    const [header, ...body] = currentHunkLines;
    const match = header.match(hunkPattern);
    if (!match) {
      currentHunkLines = [];
      return;
    }

    const hunkOldStart = Number(match[1]);
    const hunkOldLines = Number(match[2] ?? "1");
    const hunkNewStart = Number(match[3]);
    const hunkNewLines = Number(match[4] ?? "1");
    oldLine = hunkOldStart;
    newLine = hunkNewStart;

    const lines = body.map((line) => parseDiffLine(line));
    currentFile.hunks.push({
      index: currentFile.hunks.length,
      header,
      oldStart: hunkOldStart,
      oldLines: hunkOldLines,
      newStart: hunkNewStart,
      newLines: hunkNewLines,
      lines,
      patch: [...currentFile.header, ...currentHunkLines].join("\n") + "\n"
    });
    currentHunkLines = [];
  }

  function parseDiffLine(line: string): DiffLine {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const parsed = { kind: "add" as const, text: line.slice(1), newLine };
      newLine += 1;
      return parsed;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      const parsed = { kind: "del" as const, text: line.slice(1), oldLine };
      oldLine += 1;
      return parsed;
    }
    if (line.startsWith(" ")) {
      const parsed = { kind: "context" as const, text: line.slice(1), oldLine, newLine };
      oldLine += 1;
      newLine += 1;
      return parsed;
    }
    return { kind: "meta", text: line };
  }

  raw.replace(/\r?\n$/, "").split(/\r?\n/).forEach((line) => {
    if (line.startsWith("diff --git ")) {
      finishHunk();
      currentFile = { oldPath: "", newPath: "", header: [line], hunks: [] };
      files.push(currentFile);
      return;
    }

    if (!currentFile) {
      return;
    }

    if (line.startsWith("@@ ")) {
      finishHunk();
      currentHunkLines = [line];
      return;
    }

    if (currentHunkLines.length) {
      currentHunkLines.push(line);
      return;
    }

    currentFile.header.push(line);
    if (line.startsWith("--- ")) {
      currentFile.oldPath = normalizeDiffPath(line.slice(4));
    }
    if (line.startsWith("+++ ")) {
      currentFile.newPath = normalizeDiffPath(line.slice(4));
    }
  });

  finishHunk();
  return files.filter((file) => file.hunks.length);
}

export function diffToText(files: DiffFile[]): string {
  return files
    .flatMap((file) => [...file.header, ...file.hunks.flatMap((hunk) => [hunk.header, ...hunk.lines.map(formatDiffLine)])])
    .join("\n");
}

export function buildSelectedLinesPatch({ file, hunk, selectedLineIndexes }: SelectedLinesPatchInput): string {
  const selected = new Set(selectedLineIndexes);
  const patchLines: string[] = [];
  let oldLines = 0;
  let newLines = 0;
  let changedLines = 0;

  hunk.lines.forEach((line, index) => {
    if (line.kind === "add") {
      if (selected.has(index)) {
        patchLines.push(`+${line.text}`);
        newLines += 1;
        changedLines += 1;
      }
      return;
    }

    if (line.kind === "del") {
      if (selected.has(index)) {
        patchLines.push(`-${line.text}`);
        oldLines += 1;
        changedLines += 1;
      } else {
        patchLines.push(` ${line.text}`);
        oldLines += 1;
        newLines += 1;
      }
      return;
    }

    if (line.kind === "context") {
      patchLines.push(` ${line.text}`);
      oldLines += 1;
      newLines += 1;
      return;
    }

    patchLines.push(line.text);
  });

  if (!changedLines) {
    throw new Error("Select at least one added or deleted line.");
  }

  const header = `@@ -${hunk.oldStart},${oldLines} +${hunk.newStart},${newLines} @@`;
  return [...file.header, header, ...patchLines].join("\n") + "\n";
}

function formatDiffLine(line: DiffLine): string {
  switch (line.kind) {
    case "add":
      return `+${line.text}`;
    case "del":
      return `-${line.text}`;
    case "context":
      return ` ${line.text}`;
    default:
      return line.text;
  }
}

function normalizeDiffPath(value: string): string {
  if (value === "/dev/null") {
    return value;
  }
  return value.replace(/^[ab]\//, "");
}
