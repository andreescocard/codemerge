(function () {
  const vscode = acquireVsCodeApi();
  const state = {
    selectedPath: undefined,
    selectedCommit: undefined,
    hiddenBranches: new Set(vscode.getState()?.hiddenBranches || []),
    snapshot: undefined
  };

  const toggleLocationsButton = document.getElementById("toggleLocationsButton");
  const branchSelect = document.getElementById("branchSelect");
  const newBranchName = document.getElementById("newBranchName");
  const sourceBranchSelect = document.getElementById("sourceBranchSelect");
  const createBranchButton = document.getElementById("createBranchButton");
  const refreshButton = document.getElementById("refreshButton");
  const fetchButton = document.getElementById("fetchButton");
  const pullButton = document.getElementById("pullButton");
  const pushButton = document.getElementById("pushButton");
  const moreButton = document.getElementById("moreButton");
  const repoRoot = document.getElementById("repoRoot");
  const currentBranch = document.getElementById("currentBranch");
  const branchTree = document.getElementById("branchTree");
  const branchMenu = document.getElementById("branchMenu");
  const branchCount = document.getElementById("branchCount");
  const remoteTree = document.getElementById("remoteTree");
  const remoteCount = document.getElementById("remoteCount");
  const tagTree = document.getElementById("tagTree");
  const tagCount = document.getElementById("tagCount");
  const stashTree = document.getElementById("stashTree");
  const stashCount = document.getElementById("stashCount");
  const submoduleTree = document.getElementById("submoduleTree");
  const submoduleCount = document.getElementById("submoduleCount");
  const locationMenu = document.getElementById("locationMenu");
  const commitSummaryCount = document.getElementById("commitSummaryCount");
  const changeCount = document.getElementById("changeCount");
  const fileFilter = document.getElementById("fileFilter");
  const fileSort = document.getElementById("fileSort");
  const fileList = document.getElementById("fileList");
  const commitFilter = document.getElementById("commitFilter");
  const commitList = document.getElementById("commitList");
  const diffTitle = document.getElementById("diffTitle");
  const diffBefore = document.getElementById("diffBefore");
  const diffResizer = document.getElementById("diffResizer");
  const diffOutput = document.getElementById("diffOutput");
  const summaryHash = document.getElementById("summaryHash");
  const summaryAuthor = document.getElementById("summaryAuthor");
  const summaryDate = document.getElementById("summaryDate");
  const summaryRefs = document.getElementById("summaryRefs");
  const summarySubject = document.getElementById("summarySubject");
  const conflictBanner = document.getElementById("conflictBanner");
  const stageButton = document.getElementById("stageButton");
  const stageAllButton = document.getElementById("stageAllButton");
  const unstageButton = document.getElementById("unstageButton");
  const blameButton = document.getElementById("blameButton");
  const discardButton = document.getElementById("discardButton");
  const discardAllButton = document.getElementById("discardAllButton");
  const commitForm = document.getElementById("commitForm");
  const commitMessage = document.getElementById("commitMessage");
  const amendCommit = document.getElementById("amendCommit");

  restoreLayout();
  if (!document.documentElement.classList.contains("locationsCollapsed")) {
    setLocationsCollapsed(false, false);
  }
  document.querySelectorAll(".columnResizer").forEach((resizer) => {
    resizer.addEventListener("pointerdown", startColumnResize);
  });
  diffResizer.addEventListener("pointerdown", startDiffResize);
  window.addEventListener("click", closeMenus);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
    }
  });

  refreshButton.addEventListener("click", () => post("refresh"));
  toggleLocationsButton.addEventListener("click", toggleLocations);
  createBranchButton.addEventListener("click", () => {
    const branch = newBranchName.value.trim();
    const sourceBranch = sourceBranchSelect.value;
    if (branch && sourceBranch) {
      post("createBranch", { branch, sourceBranch });
      newBranchName.value = "";
    }
  });
  fetchButton.addEventListener("click", () => post("fetch"));
  pullButton.addEventListener("click", () => post("pull", { strategy: "ffOnly" }));
  pushButton.addEventListener("click", () => post("push"));
  moreButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openLocationMenu(
      { clientX: rect.left, clientY: rect.bottom + 4 },
      [
        { icon: "file", label: "Stash changes...", action: () => post("stashPush", { includeUntracked: false }) },
        { icon: "file", label: "Stash including untracked...", action: () => post("stashPush", { includeUntracked: true }) },
        { icon: "commit", label: "Create tag...", action: () => post("createTag") },
        { icon: "link", label: "Add remote...", action: () => post("addRemote") },
        { icon: "download", label: "Pull fast-forward only", action: () => post("pull", { strategy: "ffOnly" }) },
        { icon: "download", label: "Pull with merge", action: () => post("pull", { strategy: "merge" }) },
        { icon: "download", label: "Pull with rebase", action: () => post("pull", { strategy: "rebase" }) },
        { icon: "upload", label: "Force push with lease...", action: () => post("forcePush") }
      ]
    );
  });
  fileFilter.addEventListener("input", () => renderFiles(state.snapshot?.files || []));
  fileSort.addEventListener("change", () => renderFiles(state.snapshot?.files || []));
  commitFilter.addEventListener("input", () => renderCommits(state.snapshot?.commits || []));

  branchSelect.addEventListener("change", () => {
    if (branchSelect.value && branchSelect.value !== state.snapshot?.currentBranch) {
      post("checkout", { branch: branchSelect.value });
    }
  });

  stageButton.addEventListener("click", () => selectedAction("stage"));
  stageAllButton.addEventListener("click", () => post("stageAll"));
  unstageButton.addEventListener("click", () => selectedAction("unstage"));
  blameButton.addEventListener("click", () => selectedAction("blame"));
  discardButton.addEventListener("click", () => selectedAction("discard"));
  discardAllButton.addEventListener("click", () => post("discardAll"));

  commitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = commitMessage.value.trim();
    if (message) {
      post("commit", { message, amend: amendCommit.checked });
      commitMessage.value = "";
      amendCommit.checked = false;
    }
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "loading") {
      setLoading(Boolean(message.loading));
    }

    if (message.type === "snapshot") {
      state.snapshot = message.snapshot;
      renderSnapshot(message.snapshot);
    }

    if (message.type === "diff") {
      state.selectedPath = message.path;
      diffTitle.textContent = message.path || "Diff";
      renderDiff(message);
      renderFiles(state.snapshot?.files || []);
    }

    if (message.type === "blame") {
      state.selectedPath = message.path;
      diffTitle.textContent = `Blame: ${message.path}`;
      renderBlame(message.path, message.blame || []);
      renderFiles(state.snapshot?.files || []);
    }

    if (message.type === "error") {
      setLoading(false);
      commitSummaryCount.textContent = "Refresh failed";
      summarySubject.textContent = message.error;
      diffBefore.textContent = "Refresh failed";
      diffOutput.textContent = message.error;
    }
  });

  function renderSnapshot(snapshot) {
    repoRoot.textContent = snapshot.root;
    currentBranch.textContent = snapshot.currentBranch;
    changeCount.textContent = String(snapshot.files.length);
    const stagedCount = snapshot.files.filter((file) => file.staged).length;
    const unstagedCount = snapshot.files.length - stagedCount;
    commitSummaryCount.textContent = `${plural(stagedCount, "staged file")}, ${plural(unstagedCount, "unstaged file")}`;
    renderBranches(snapshot);
    renderRemotes(snapshot.remotes || []);
    renderTags(snapshot.tags || []);
    renderStashes(snapshot.stashes || []);
    renderSubmodules(snapshot.submodules || []);
    renderConflictState(snapshot);
    renderFiles(snapshot.files);
    renderCommits(snapshot.commits);
  }

  function renderConflictState(snapshot) {
    const mergeState = snapshot.mergeState || { active: false };
    const conflicts = snapshot.conflicts || [];
    conflictBanner.hidden = !mergeState.active;
    conflictBanner.innerHTML = "";
    if (!mergeState.active) {
      return;
    }

    const header = document.createElement("div");
    header.className = "conflictHeader";
    header.append(
      textSpan(`${formatOperation(mergeState.operation)} in progress`, "conflictTitle"),
      textSpan(`${conflicts.length} unresolved`, "conflictCount")
    );

    const actions = document.createElement("div");
    actions.className = "conflictActions";
    const abort = document.createElement("button");
    abort.type = "button";
    abort.append(icon("trash"), textSpan("Abort"));
    abort.addEventListener("click", () => post("abortOperation"));
    const resume = document.createElement("button");
    resume.type = "button";
    resume.disabled = conflicts.length > 0;
    resume.append(icon("check"), textSpan("Continue"));
    resume.addEventListener("click", () => post("continueOperation"));
    actions.append(abort, resume);
    header.append(actions);
    conflictBanner.append(header);

    if (!conflicts.length) {
      conflictBanner.append(textBlock("All conflicts are marked resolved.", "conflictEmpty"));
      return;
    }

    const list = document.createElement("div");
    list.className = "conflictList";
    conflicts.forEach((conflict) => {
      const row = document.createElement("div");
      row.className = "conflictRow";
      const details = document.createElement("button");
      details.type = "button";
      details.className = "conflictFile";
      details.append(icon("file"), textSpan(conflict.path), textSpan(conflict.type, "conflictType"));
      details.addEventListener("click", () => post("selectFile", { path: conflict.path }));

      const ours = conflictButton("Use Ours", "useOurs", conflict.path);
      const theirs = conflictButton("Use Theirs", "useTheirs", conflict.path);
      const resolved = conflictButton("Mark Resolved", "markResolved", conflict.path);
      row.append(details, ours, theirs, resolved);
      list.append(row);
    });
    conflictBanner.append(list);
  }

  function conflictButton(label, type, filePath) {
    const button = document.createElement("button");
    button.type = "button";
    button.append(textSpan(label));
    button.addEventListener("click", () => post(type, { path: filePath }));
    return button;
  }

  function formatOperation(operation) {
    if (operation === "cherryPick") return "Cherry-pick";
    if (operation === "rebase") return "Rebase";
    return "Merge";
  }

  function setLoading(loading) {
    refreshButton.disabled = loading;
    if (loading) {
      setButtonContent(refreshButton, "refresh", "Loading...");
      commitSummaryCount.textContent = "Loading changes...";
      return;
    }

    setButtonContent(refreshButton, "refresh", "Refresh");
    if (!state.snapshot) {
      commitSummaryCount.textContent = "No data loaded";
    }
  }

  function renderBranches(snapshot) {
    branchSelect.innerHTML = "";
    sourceBranchSelect.innerHTML = "";
    branchTree.innerHTML = "";
    const visibleBranches = snapshot.branches.filter((branch) => !state.hiddenBranches.has(branch.name));
    branchCount.textContent = String(visibleBranches.length);
    snapshot.branches.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.name;
      option.textContent = branch.current ? `${branch.name} current` : branch.name;
      option.selected = branch.current;
      branchSelect.append(option);

      const sourceOption = document.createElement("option");
      sourceOption.value = branch.name;
      sourceOption.textContent = branch.name;
      sourceOption.selected = branch.current;
      sourceBranchSelect.append(sourceOption);
    });

    visibleBranches.forEach((branch) => {
      const branchRow = document.createElement("button");
      branchRow.className = `branchRow ${branch.current ? "current" : ""}`;
      branchRow.type = "button";
      branchRow.title = branch.name;
      branchRow.append(icon("branch"), textSpan(branch.name, "branchName"));
      branchRow.addEventListener("click", () => {
        if (!branch.current) {
          post("checkout", { branch: branch.name });
        }
      });
      branchRow.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openBranchMenu(event, branch);
      });
      branchTree.append(branchRow);
    });
  }

  function renderRemotes(remotes) {
    remoteTree.innerHTML = "";
    remoteCount.textContent = String(remotes.length);
    if (!remotes.length) {
      remoteTree.append(emptyLocation("No remotes"));
      return;
    }

    remotes.forEach((remote) => {
      const row = locationRow("link", remote.name, remote.fetchUrl || remote.pushUrl || "No URL configured");
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openLocationMenu(event, [
          { icon: "download", label: `Fetch ${remote.name}`, action: () => post("fetch") },
          { icon: "edit", label: `Edit URL...`, action: () => post("setRemoteUrl", { remote: remote.name, url: remote.fetchUrl || remote.pushUrl }) },
          { icon: "edit", label: `Rename ${remote.name}...`, action: () => post("renameRemote", { remote: remote.name }) },
          { icon: "trash", label: `Remove ${remote.name}`, action: () => post("removeRemote", { remote: remote.name }) }
        ]);
      });
      remoteTree.append(row);
    });
  }

  function renderTags(tags) {
    tagTree.innerHTML = "";
    tagCount.textContent = String(tags.length);
    if (!tags.length) {
      tagTree.append(emptyLocation("No tags"));
      return;
    }

    tags.forEach((tag) => {
      const row = locationRow("commit", tag.name, tag.subject || tag.object);
      row.addEventListener("click", () => {
        commitFilter.value = tag.name;
        renderCommits(state.snapshot?.commits || []);
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openLocationMenu(event, [
          { icon: "branch", label: `Checkout ${tag.name}`, action: () => post("checkout", { branch: tag.name }) },
          { icon: "upload", label: `Push ${tag.name}`, action: () => post("pushTag", { tag: tag.name }) },
          { icon: "trash", label: `Delete ${tag.name}`, action: () => post("deleteTag", { tag: tag.name }) }
        ]);
      });
      tagTree.append(row);
    });
  }

  function renderStashes(stashes) {
    stashTree.innerHTML = "";
    stashCount.textContent = String(stashes.length);
    if (!stashes.length) {
      stashTree.append(emptyLocation("No stashes"));
      return;
    }

    stashes.forEach((stash) => {
      const row = locationRow("file", stash.ref, stash.subject || stash.relativeDate);
      row.addEventListener("click", () => post("stashShow", { ref: stash.ref }));
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openLocationMenu(event, [
          { icon: "file", label: `Show ${stash.ref}`, action: () => post("stashShow", { ref: stash.ref }) },
          { icon: "check", label: `Apply ${stash.ref}`, action: () => post("stashApply", { ref: stash.ref }) },
          { icon: "refresh", label: `Pop ${stash.ref}`, action: () => post("stashPop", { ref: stash.ref }) },
          { icon: "trash", label: `Drop ${stash.ref}`, action: () => post("stashDrop", { ref: stash.ref }) }
        ]);
      });
      stashTree.append(row);
    });
  }

  function renderSubmodules(submodules) {
    submoduleTree.innerHTML = "";
    submoduleCount.textContent = String(submodules.length);
    if (!submodules.length) {
      submoduleTree.append(emptyLocation("No submodules"));
      return;
    }

    submodules.forEach((submodule) => {
      submoduleTree.append(locationRow("file", submodule.path, `${submodule.status} ${submodule.commit.slice(0, 8)}`.trim()));
    });
  }

  function renderFiles(files) {
    const query = fileFilter.value.trim().toLowerCase();
    const filteredFiles = query ? files.filter((file) => file.path.toLowerCase().includes(query)) : files;
    const visibleFiles = sortFiles(filteredFiles);
    fileList.innerHTML = "";
    if (!files.length) {
      fileList.append(empty("Working tree clean"));
      return;
    }
    if (!visibleFiles.length) {
      fileList.append(empty("No matching files"));
      return;
    }

    visibleFiles.forEach((file) => {
      const row = document.createElement("button");
      row.className = `fileRow detailTab ${file.path === state.selectedPath ? "activeTab selected" : ""}`;
      row.type = "button";
      row.title = `${file.path} (${file.mtimeLabel})`;
      row.addEventListener("click", () => post("selectFile", { path: file.path }));

      const status = document.createElement("span");
      status.className = `statusBadge ${file.staged ? "staged" : ""}`;
      status.textContent = `${file.index}${file.workingTree}`.trim() || "M";

      const name = document.createElement("span");
      name.className = "filePath";
      name.textContent = file.path;

      const time = document.createElement("span");
      time.className = "fileTime";
      time.textContent = file.mtimeLabel;

      row.append(status, icon("file"), name, time);
      fileList.append(row);
    });
  }

  function sortFiles(files) {
    const sorted = [...files];
    switch (fileSort.value) {
      case "oldest":
        return sorted.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path));
      case "path":
        return sorted.sort((a, b) => a.path.localeCompare(b.path));
      case "status":
        return sorted.sort((a, b) => `${a.index}${a.workingTree}`.localeCompare(`${b.index}${b.workingTree}`) || a.path.localeCompare(b.path));
      case "staged":
        return sorted.sort((a, b) => Number(b.staged) - Number(a.staged) || b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
      case "recent":
      default:
        return sorted.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
    }
  }

  function renderCommits(commits) {
    const query = commitFilter.value.trim().toLowerCase();
    const visibleCommits = query
      ? commits.filter((commit) =>
          [commit.subject, commit.author, commit.shortHash, commit.refs].some((value) =>
            String(value || "").toLowerCase().includes(query)
          )
        )
      : commits;
    commitList.innerHTML = "";
    if (!commits.length) {
      commitList.append(empty("No commits yet"));
      return;
    }
    if (!visibleCommits.length) {
      commitList.append(empty("No matching commits"));
      return;
    }

    visibleCommits.forEach((commit) => {
      const isSelected = commit.hash === state.selectedCommit;
      const row = document.createElement("article");
      row.className = `commitRow ${isSelected ? "selected" : ""}`;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", String(isSelected));
      row.setAttribute("aria-label", `Commit ${commit.shortHash}: ${commit.subject}`);
      const selectCommit = () => {
        state.selectedCommit = commit.hash;
        renderSummary(commit);
        renderCommits(state.snapshot?.commits || []);
      };
      row.addEventListener("click", selectCommit);
      row.addEventListener("keydown", (event) => {
        if (event.target !== row) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectCommit();
        }
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openCommitMenu(event, commit);
      });

      const graph = document.createElement("span");
      graph.className = "graph";
      graph.append(icon("commit"));

      const body = document.createElement("div");
      body.className = "commitBody";

      const top = document.createElement("div");
      top.className = "commitTop";

      const subject = document.createElement("div");
      subject.className = "commitSubject";
      subject.textContent = commit.subject;

      const cherryPick = document.createElement("button");
      cherryPick.className = "commitAction";
      cherryPick.type = "button";
      cherryPick.append(icon("merge"), textSpan("Cherry-pick"));
      cherryPick.addEventListener("click", (event) => {
        event.stopPropagation();
        post("cherryPick", { hash: commit.hash });
      });

      top.append(subject, cherryPick);

      const meta = document.createElement("div");
      meta.className = "commitMeta";
      meta.textContent = `${commit.shortHash} · ${commit.author} · ${commit.relativeDate}`;

      if (commit.refs) {
        const refs = document.createElement("div");
        refs.className = "refs";
        refs.textContent = commit.refs;
        body.append(top, refs, meta);
      } else {
        body.append(top, meta);
      }

      row.append(graph, body);
      commitList.append(row);
    });
  }

  function selectedAction(type) {
    if (state.selectedPath) {
      post(type, { path: state.selectedPath });
    }
  }

  function renderSummary(commit) {
    summaryHash.textContent = commit.hash;
    summaryAuthor.textContent = commit.author || "-";
    summaryDate.textContent = commit.relativeDate || "-";
    summaryRefs.textContent = commit.refs || "-";
    summarySubject.textContent = commit.subject || "Commit selected.";
  }

  function openCommitMenu(event, commit) {
    openLocationMenu(event, [
      { icon: "merge", label: `Cherry-pick ${commit.shortHash}`, action: () => post("cherryPick", { hash: commit.hash }) },
      { icon: "refresh", label: `Soft reset to ${commit.shortHash}`, action: () => post("reset", { hash: commit.hash, mode: "soft" }) },
      { icon: "refresh", label: `Mixed reset to ${commit.shortHash}`, action: () => post("reset", { hash: commit.hash, mode: "mixed" }) },
      { icon: "trash", label: `Hard reset to ${commit.shortHash}`, action: () => post("reset", { hash: commit.hash, mode: "hard" }) },
      { icon: "copy", label: `Copy '${commit.hash}'`, action: () => navigator.clipboard?.writeText(commit.hash) }
    ]);
  }

  function renderDiff(message) {
    if (!message.path) {
      diffBefore.textContent = "Select a changed file to inspect its diff.";
      diffOutput.textContent = "Select a changed file to inspect its diff.";
      return;
    }

    if (!message.structuredDiff?.length) {
      diffBefore.textContent = "Base version\n\n" + trimDiffForPane(message.diff, "before");
      diffOutput.textContent = message.diff ? trimDiffForPane(message.diff, "after") : "No textual diff available for this file.";
      return;
    }

    const hunkCount = message.structuredDiff.reduce(
      (count, section) => count + section.files.reduce((fileCount, file) => fileCount + file.hunks.length, 0),
      0
    );
    diffBefore.replaceChildren(
      diffSummaryLine("File", message.path),
      diffSummaryLine("Sections", message.structuredDiff.map((section) => section.title).join(", ")),
      diffSummaryLine("Hunks", String(hunkCount))
    );

    diffOutput.innerHTML = "";
    message.structuredDiff.forEach((section) => {
      let sectionHunkIndex = 0;
      const sectionElement = document.createElement("section");
      sectionElement.className = "diffSection";
      sectionElement.append(textBlock(section.title, "diffSectionTitle"));

      section.files.forEach((file) => {
        sectionElement.append(textBlock(`${file.oldPath || "/dev/null"} -> ${file.newPath || "/dev/null"}`, "diffFileTitle"));
        file.hunks.forEach((hunk) => {
          const actionIndex = sectionHunkIndex;
          sectionHunkIndex += 1;
          sectionElement.append(renderHunk(section.kind, actionIndex, hunk));
        });
      });

      diffOutput.append(sectionElement);
    });
  }

  function renderBlame(filePath, blame) {
    diffBefore.replaceChildren(
      diffSummaryLine("File", filePath),
      diffSummaryLine("Lines", String(blame.length))
    );
    diffOutput.innerHTML = "";

    if (!blame.length) {
      diffOutput.append(empty("No blame data available"));
      return;
    }

    const view = document.createElement("section");
    view.className = "blameView";
    blame.forEach((line) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "blameRow";
      row.title = `${line.hash} ${line.summary}`;
      row.addEventListener("click", () => {
        commitFilter.value = line.shortHash;
        renderCommits(state.snapshot?.commits || []);
      });
      row.append(
        textSpan(String(line.line), "blameLineNo"),
        textSpan(line.shortHash, "blameHash"),
        textSpan(line.author || "-", "blameAuthor"),
        textSpan(line.summary || "-", "blameSummary"),
        textSpan(line.text, "blameText")
      );
      view.append(row);
    });
    diffOutput.append(view);
  }

  function renderHunk(kind, hunkIndex, hunk) {
    const hunkElement = document.createElement("section");
    hunkElement.className = "diffHunk";
    const selectedLines = new Set();

    const header = document.createElement("div");
    header.className = "diffHunkHeader";
    header.append(textSpan(hunk.header));

    const actions = document.createElement("div");
    actions.className = "diffHunkActions";

    const selectedAction = document.createElement("button");
    selectedAction.type = "button";
    selectedAction.disabled = true;
    selectedAction.append(icon(kind === "staged" ? "refresh" : "check"), textSpan(kind === "staged" ? "Unstage Selected" : "Stage Selected"));
    selectedAction.addEventListener("click", () => {
      if (state.selectedPath && selectedLines.size) {
        post(kind === "staged" ? "unstageLines" : "stageLines", {
          path: state.selectedPath,
          hunkIndex,
          lineIndexes: [...selectedLines].sort((a, b) => a - b)
        });
      }
    });

    const action = document.createElement("button");
    action.type = "button";
    action.append(icon(kind === "staged" ? "refresh" : "check"), textSpan(kind === "staged" ? "Unstage Hunk" : "Stage Hunk"));
    action.addEventListener("click", () => {
      if (state.selectedPath) {
        post(kind === "staged" ? "unstageHunk" : "stageHunk", { path: state.selectedPath, hunkIndex });
      }
    });
    actions.append(selectedAction, action);
    header.append(actions);
    hunkElement.append(header);

    hunk.lines.forEach((line, lineIndex) => {
      const row = document.createElement("div");
      row.className = `diffLine ${line.kind}`;
      if (isConflictMarker(line.text)) {
        row.classList.add("conflictMarker");
      }
      if (line.kind === "add" || line.kind === "del") {
        row.tabIndex = 0;
        row.title = "Click to select this line";
        row.addEventListener("click", () => toggleDiffLineSelection(row, selectedAction, selectedLines, lineIndex));
        row.addEventListener("keydown", (event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            toggleDiffLineSelection(row, selectedAction, selectedLines, lineIndex);
          }
        });
      }
      row.append(
        diffCell(line.oldLine === undefined ? "" : String(line.oldLine), "diffLineNumber"),
        diffCell(line.newLine === undefined ? "" : String(line.newLine), "diffLineNumber"),
        diffCell(diffPrefix(line.kind), "diffPrefix"),
        diffCell(line.text, "diffLineText")
      );
      hunkElement.append(row);
    });

    return hunkElement;
  }

  function toggleDiffLineSelection(row, selectedAction, selectedLines, lineIndex) {
    if (selectedLines.has(lineIndex)) {
      selectedLines.delete(lineIndex);
      row.classList.remove("selected");
    } else {
      selectedLines.add(lineIndex);
      row.classList.add("selected");
    }
    const count = selectedLines.size;
    selectedAction.disabled = count === 0;
    selectedAction.querySelector("span").textContent = count === 1
      ? selectedAction.textContent.replace(/Selected.*$/, "Selected")
      : selectedAction.textContent.replace(/Selected.*$/, `Selected (${count})`);
  }

  function diffSummaryLine(label, value) {
    const row = document.createElement("div");
    row.className = "diffSummaryLine";
    row.append(textSpan(label), textSpan(value));
    return row;
  }

  function textBlock(text, className) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  function diffCell(text, className) {
    const cell = document.createElement("span");
    cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function diffPrefix(kind) {
    if (kind === "add") return "+";
    if (kind === "del") return "-";
    return " ";
  }

  function isConflictMarker(text) {
    return text.startsWith("<<<<<<<") || text.startsWith("=======") || text.startsWith(">>>>>>>");
  }

  function trimDiffForPane(diff, side) {
    if (!diff) {
      return "No textual diff available for this file.";
    }

    const lines = diff.split("\n");
    const filtered = lines.filter((line) => {
      if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") || line.startsWith("diff --git")) {
        return true;
      }
      return side === "before" ? !line.startsWith("+") : !line.startsWith("-");
    });
    return filtered.join("\n");
  }

  function empty(text) {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = text;
    return element;
  }

  function emptyLocation(text) {
    const element = empty(text);
    element.classList.add("locationMuted");
    return element;
  }

  function locationRow(iconName, name, detail) {
    const row = document.createElement("button");
    row.className = "branchRow";
    row.type = "button";
    row.title = detail ? `${name} - ${detail}` : name;
    row.append(icon(iconName), textSpan(name, "branchName"));
    if (detail) {
      row.append(textSpan(detail, "fileTime"));
    }
    return row;
  }

  function post(type, payload = {}) {
    vscode.postMessage({ type, ...payload });
  }

  function openBranchMenu(event, branch) {
    closeMenus();
    const current = state.snapshot?.currentBranch || "current";
    const items = [
      {
        icon: "branch",
        label: `Checkout ${branch.name}`,
        action: () => post("checkout", { branch: branch.name }),
        disabled: branch.current
      },
      {
        icon: "merge",
        label: `Merge ${branch.name} into ${current}...`,
        action: () => post("mergeBranch", { branch: branch.name })
      },
      {
        icon: "trash",
        label: `Delete ${branch.name}`,
        action: () => post("deleteBranch", { branch: branch.name }),
        disabled: branch.current
      },
      {
        icon: "edit",
        label: `Rename ${branch.name}...`,
        action: () => post("renameBranch", { branch: branch.name })
      },
      {
        icon: "copy",
        label: `Copy '${branch.name}'`,
        action: () => post("copyBranch", { branch: branch.name })
      },
      {
        icon: "eye-off",
        label: `Hide ${branch.name}`,
        action: () => hideBranch(branch.name),
        disabled: branch.current
      },
      {
        icon: "eye-off",
        label: `Hide All Branches Except ${branch.name}`,
        action: () => hideAllBranchesExcept(branch.name)
      },
      {
        icon: "eye",
        label: "Show All Hidden Branches",
        action: showAllHiddenBranches,
        disabled: state.hiddenBranches.size === 0
      },
      {
        icon: "link",
        label: "Set Upstream...",
        action: () => post("setUpstream", { branch: branch.name })
      },
      {
        icon: "search",
        label: "Search...",
        action: () => searchBranch(branch.name)
      }
    ];

    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.append(icon(item.icon), textSpan(item.label));
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        closeBranchMenu();
        if (!item.disabled) {
          item.action();
        }
      });
      branchMenu.append(button);
    });

    branchMenu.hidden = false;
    const menuRect = branchMenu.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
    const top = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
    branchMenu.style.left = `${Math.max(4, left)}px`;
    branchMenu.style.top = `${Math.max(4, top)}px`;
  }

  function closeBranchMenu() {
    branchMenu.hidden = true;
    branchMenu.innerHTML = "";
  }

  function closeLocationMenu() {
    locationMenu.hidden = true;
    locationMenu.innerHTML = "";
  }

  function closeMenus() {
    closeBranchMenu();
    closeLocationMenu();
  }

  function openLocationMenu(event, items) {
    closeMenus();
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.append(icon(item.icon), textSpan(item.label));
      button.disabled = Boolean(item.disabled);
      button.addEventListener("click", () => {
        closeMenus();
        if (!item.disabled) {
          item.action();
        }
      });
      locationMenu.append(button);
    });

    locationMenu.hidden = false;
    const menuRect = locationMenu.getBoundingClientRect();
    const left = Math.min(event.clientX, window.innerWidth - menuRect.width - 8);
    const top = Math.min(event.clientY, window.innerHeight - menuRect.height - 8);
    locationMenu.style.left = `${Math.max(4, left)}px`;
    locationMenu.style.top = `${Math.max(4, top)}px`;
  }

  function hideBranch(branchName) {
    state.hiddenBranches.add(branchName);
    persistHiddenBranches();
    renderBranches(state.snapshot);
  }

  function hideAllBranchesExcept(branchName) {
    state.hiddenBranches = new Set(
      (state.snapshot?.branches || [])
        .map((branch) => branch.name)
        .filter((name) => name !== branchName)
    );
    persistHiddenBranches();
    renderBranches(state.snapshot);
  }

  function showAllHiddenBranches() {
    state.hiddenBranches.clear();
    persistHiddenBranches();
    renderBranches(state.snapshot);
  }

  function persistHiddenBranches() {
    vscode.setState({ ...(vscode.getState() || {}), hiddenBranches: [...state.hiddenBranches] });
  }

  function searchBranch(branchName) {
    commitFilter.value = branchName;
    renderCommits(state.snapshot?.commits || []);
  }

  function restoreLayout() {
    const persisted = vscode.getState()?.layout;
    if (!persisted) {
      return;
    }

    if (persisted.locationsWidth) {
      document.documentElement.style.setProperty("--locations-width", `${persisted.locationsWidth}px`);
    }
    if (persisted.commitsWidth) {
      document.documentElement.style.setProperty("--commits-width", `${persisted.commitsWidth}px`);
    }
    if (persisted.diffLeft) {
      document.documentElement.style.setProperty("--diff-left", `${persisted.diffLeft}%`);
    }
    if (persisted.locationsCollapsed) {
      setLocationsCollapsed(true, false);
    }
  }

  function persistLayout(partial) {
    const previous = vscode.getState()?.layout || {};
    const layout = { ...previous, ...partial };
    vscode.setState({ ...(vscode.getState() || {}), layout });
  }

  function startColumnResize(event) {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const rootStyle = getComputedStyle(document.documentElement);
    const key = target.dataset.resizer === "locations" ? "locationsWidth" : "commitsWidth";
    const cssVar = target.dataset.resizer === "locations" ? "--locations-width" : "--commits-width";
    const initialWidth = Number.parseFloat(rootStyle.getPropertyValue(cssVar));
    const startX = event.clientX;
    const min = target.dataset.resizer === "locations" ? 140 : 220;
    const max = target.dataset.resizer === "locations" ? 420 : 620;

    function move(moveEvent) {
      const nextWidth = clamp(initialWidth + moveEvent.clientX - startX, min, max);
      document.documentElement.style.setProperty(cssVar, `${nextWidth}px`);
      persistLayout({ [key]: nextWidth });
    }

    function done(doneEvent) {
      target.releasePointerCapture(doneEvent.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  }

  function toggleLocations() {
    const collapsed = !document.documentElement.classList.contains("locationsCollapsed");
    setLocationsCollapsed(collapsed, true);
  }

  function setLocationsCollapsed(collapsed, persist) {
    document.documentElement.classList.toggle("locationsCollapsed", collapsed);
    toggleLocationsButton.classList.toggle("active", !collapsed);
    toggleLocationsButton.title = collapsed ? "Show locations" : "Hide locations";
    toggleLocationsButton.setAttribute("aria-pressed", String(!collapsed));

    if (persist) {
      persistLayout({ locationsCollapsed: collapsed });
    }
  }

  function startDiffResize(event) {
    event.preventDefault();
    diffResizer.setPointerCapture(event.pointerId);
    const rect = diffResizer.parentElement.getBoundingClientRect();

    function move(moveEvent) {
      const percent = clamp(((moveEvent.clientX - rect.left) / rect.width) * 100, 25, 75);
      document.documentElement.style.setProperty("--diff-left", `${percent}%`);
      persistLayout({ diffLeft: percent });
    }

    function done(doneEvent) {
      diffResizer.releasePointerCapture(doneEvent.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    svg.classList.add("icon");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  }

  function textSpan(text, className) {
    const span = document.createElement("span");
    if (className) {
      span.className = className;
    }
    span.textContent = text;
    return span;
  }

  function setButtonContent(button, iconName, label) {
    button.replaceChildren(icon(iconName), textSpan(label));
  }
})();
