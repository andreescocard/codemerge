import { describe, expect, it } from "vitest";
import { assignCommitGraph } from "./graph";

const base = {
  shortHash: "",
  refs: "",
  subject: "",
  author: "",
  relativeDate: "",
  committedAt: "",
  filesChanged: 0,
  graph: ""
};

describe("assignCommitGraph", () => {
  it("keeps linear history in one lane", () => {
    expect(assignCommitGraph([
      { ...base, hash: "c", parents: ["b"] },
      { ...base, hash: "b", parents: ["a"] },
      { ...base, hash: "a", parents: [] }
    ])).toMatchObject([
      { hash: "c", lane: 0, colorLane: 0, routes: [{ fromLane: 0, fromY: 0.5, toLane: 0, toY: 1, colorLane: 0 }] },
      { hash: "b", lane: 0, colorLane: 0, routes: [{ fromLane: 0, fromY: 0, toLane: 0, toY: 1, colorLane: 0 }] },
      { hash: "a", lane: 0, colorLane: 0, routes: [{ fromLane: 0, fromY: 0, toLane: 0, toY: 0.5, colorLane: 0 }] }
    ]);
  });

  it("emits continuous routes to active parent lanes", () => {
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
      routes: [
        { fromLane: 0, fromY: 0.5, toLane: 0, toY: 1, colorLane: 0 },
        { fromLane: 0, fromY: 0.5, toLane: 1, toY: 1, colorLane: 1 }
      ]
    });
    expect(graph[2]).toMatchObject({ hash: "r", lane: 1 });
    expect(graph[1].routes.some((route) => route.fromY === 0 && route.toY === 1)).toBe(true);
  });
});
