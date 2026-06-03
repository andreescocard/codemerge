export const MessageType = {
  Refresh: "refresh",
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
  Commit: "commit",
  Checkout: "checkout",
  CreateBranch: "createBranch",
  MergeBranch: "mergeBranch",
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
  Fetch: "fetch",
  Pull: "pull",
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
  ref?: string;
  tag?: string;
  remote?: string;
  url?: string;
  hunkIndex?: number;
  lineIndexes?: number[];
  includeUntracked?: boolean;
  message?: string;
};
