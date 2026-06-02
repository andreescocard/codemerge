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
  const repoRoot = document.getElementById("repoRoot");
  const currentBranch = document.getElementById("currentBranch");
  const branchTree = document.getElementById("branchTree");
  const branchMenu = document.getElementById("branchMenu");
  const branchCount = document.getElementById("branchCount");
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
  const stageButton = document.getElementById("stageButton");
  const stageAllButton = document.getElementById("stageAllButton");
  const unstageButton = document.getElementById("unstageButton");
  const discardButton = document.getElementById("discardButton");
  const discardAllButton = document.getElementById("discardAllButton");
  const commitForm = document.getElementById("commitForm");
  const commitMessage = document.getElementById("commitMessage");

  restoreLayout();
  if (!document.documentElement.classList.contains("locationsCollapsed")) {
    setLocationsCollapsed(false, false);
  }
  document.querySelectorAll(".columnResizer").forEach((resizer) => {
    resizer.addEventListener("pointerdown", startColumnResize);
  });
  diffResizer.addEventListener("pointerdown", startDiffResize);
  window.addEventListener("click", closeBranchMenu);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBranchMenu();
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
  pullButton.addEventListener("click", () => post("pull"));
  pushButton.addEventListener("click", () => post("push"));
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
  discardButton.addEventListener("click", () => selectedAction("discard"));
  discardAllButton.addEventListener("click", () => post("discardAll"));

  commitForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = commitMessage.value.trim();
    if (message) {
      post("commit", { message });
      commitMessage.value = "";
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
      diffBefore.textContent = message.path ? "Base version\n\n" + trimDiffForPane(message.diff, "before") : "Select a changed file to inspect its diff.";
      diffOutput.textContent = message.diff ? trimDiffForPane(message.diff, "after") : "Select a changed file to inspect its diff.";
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
    commitSummaryCount.textContent = `${snapshot.files.filter((file) => file.staged).length} staged file, ${snapshot.files.filter((file) => !file.staged).length} unstaged files`;
    renderBranches(snapshot);
    renderFiles(snapshot.files);
    renderCommits(snapshot.commits);
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
      const row = document.createElement("article");
      row.className = `commitRow ${commit.hash === state.selectedCommit ? "selected" : ""}`;
      row.addEventListener("click", () => {
        state.selectedCommit = commit.hash;
        renderSummary(commit);
        renderCommits(state.snapshot?.commits || []);
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
      meta.textContent = `${commit.shortHash}  ${commit.author}  ${commit.relativeDate}`;

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

  function basename(filePath) {
    return String(filePath || "").split(/[\\/]/).pop() || "File";
  }

  function empty(text) {
    const element = document.createElement("div");
    element.className = "empty";
    element.textContent = text;
    return element;
  }

  function post(type, payload = {}) {
    vscode.postMessage({ type, ...payload });
  }

  function openBranchMenu(event, branch) {
    closeBranchMenu();
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
