export const MessageType = {
  Refresh: "refresh",
  LoadMoreCommits: "loadMoreCommits",
  SetCommitScope: "setCommitScope",
  SelectCommit: "selectCommit",
  SelectFile: "selectFile",
  Stage: "stage",
  StageHunk: "stageHunk",
  StageLines: "stageLines",
  StageAll: "stageAll",
  Unstage: "unstage",
  UnstageHunk: "unstageHunk",
  UnstageLines: "unstageLines",
  Discard: "discard",
  DiscardAll: "discardAll",
  GenerateCommitMessage: "generateCommitMessage",
  Commit: "commit",
  Reset: "reset",
  Checkout: "checkout",
  CreateBranch: "createBranch",
  MergeBranch: "mergeBranch",
  RebaseBranch: "rebaseBranch",
  DeleteBranch: "deleteBranch",
  RenameBranch: "renameBranch",
  CopyBranch: "copyBranch",
  SetUpstream: "setUpstream",
  CherryPick: "cherryPick",
  UseOurs: "useOurs",
  UseTheirs: "useTheirs",
  MarkResolved: "markResolved",
  AbortOperation: "abortOperation",
  ContinueOperation: "continueOperation",
  SkipOperation: "skipOperation",
  Blame: "blame",
  OpenFile: "openFile",
  ShowDiff: "showDiff",
  Fetch: "fetch",
  Pull: "pull",
  ForcePush: "forcePush",
  Push: "push",
  StashPush: "stashPush",
  StashApply: "stashApply",
  StashPop: "stashPop",
  StashDrop: "stashDrop",
  StashShow: "stashShow",
  CreateTag: "createTag",
  DeleteTag: "deleteTag",
  PushTag: "pushTag",
  AddRemote: "addRemote",
  RemoveRemote: "removeRemote",
  RenameRemote: "renameRemote",
  SetRemoteUrl: "setRemoteUrl"
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export type WebviewMessage = {
  type: MessageType;
  path?: string;
  branch?: string;
  sourceBranch?: string;
  newName?: string;
  upstream?: string;
  hash?: string;
  mode?: "soft" | "mixed" | "hard";
  strategy?: "ffOnly" | "merge" | "rebase";
  ref?: string;
  tag?: string;
  remote?: string;
  url?: string;
  hunkIndex?: number;
  lineIndexes?: number[];
  includeUntracked?: boolean;
  amend?: boolean;
  message?: string;
};
