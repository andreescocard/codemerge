export const MessageType = {
  Refresh: "refresh",
  SelectFile: "selectFile",
  Stage: "stage",
  StageAll: "stageAll",
  Unstage: "unstage",
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
  includeUntracked?: boolean;
  message?: string;
};
