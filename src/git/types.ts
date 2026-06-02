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

export type Snapshot = {
  root: string;
  currentBranch: string;
  branches: Branch[];
  commits: Commit[];
  files: GitFile[];
};
