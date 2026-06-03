export type GitFile = {
  path: string;
  index: string;
  workingTree: string;
  staged: boolean;
  mtimeMs: number;
  mtimeLabel: string;
};

export type Commit = {
  hash: string;
  shortHash: string;
  refs: string;
  subject: string;
  author: string;
  relativeDate: string;
  graph: string;
};

export type Branch = {
  name: string;
  current: boolean;
};

export type Stash = {
  ref: string;
  subject: string;
  relativeDate: string;
};

export type Tag = {
  name: string;
  object: string;
  subject: string;
};

export type Remote = {
  name: string;
  fetchUrl: string;
  pushUrl: string;
};

export type Submodule = {
  path: string;
  commit: string;
  status: "initialized" | "notInitialized" | "modified" | "conflict";
  description: string;
};

export type ConflictFile = {
  path: string;
  index: string;
  workingTree: string;
  type: string;
};

export type BlameLine = {
  line: number;
  hash: string;
  shortHash: string;
  author: string;
  authorTime: number;
  summary: string;
  text: string;
};

export type MergeState = {
  active: boolean;
  operation?: "merge" | "cherryPick" | "rebase";
};

export type Snapshot = {
  root: string;
  currentBranch: string;
  branches: Branch[];
  commits: Commit[];
  files: GitFile[];
  stashes: Stash[];
  tags: Tag[];
  remotes: Remote[];
  submodules: Submodule[];
  conflicts: ConflictFile[];
  mergeState: MergeState;
};
