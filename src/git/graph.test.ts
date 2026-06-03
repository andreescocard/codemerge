import { describe, expect, it } from "vitest";
import { assignCommitGraph } from "./graph";

const base = {
  shortHash: "",
  refs: "",
  subject: "",
  author: "",
  relativeDate: "",
  graph: ""
};

describe("assignCommitGraph", () => {
  it("keeps linear history in one lane", () => {
    expect(assignCommitGraph([
      { ...base, hash: "c", parents: ["b"] },
      { ...base, hash: "b", parents: ["a"] },
      { ...base, hash: "a", parents: [] }
    ])).toMatchObject([
      { hash: "c", lane: 0, edges: [{ fromLane: 0, toLane: 0 }] },
      { hash: "b", lane: 0, edges: [{ fromLane: 0, toLane: 0 }] },
      { hash: "a", lane: 0, edges: [] }
    ]);
  });

  it("emits merge edges to active parent lanes", () => {
    const graph = assignCommitGraph([
      { ...base, hash: "m", parents: ["l", "r"] },
      { ...base, hash: "l", parents: ["root"] },
      { ...base, hash: "r", parents: ["root"] },
      { ...base, hash: "root", parents: [] }
    ]);

    expect(graph[0]).toMatchObject({
      hash: "m",
      lane: 0,
      lanes: 2,
      edges: [
        { fromLane: 0, toLane: 0 },
        { fromLane: 0, toLane: 1 }
      ]
    });
    expect(graph[2]).toMatchObject({ hash: "r", lane: 1 });
  });
});
