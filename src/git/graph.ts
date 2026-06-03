import type { Commit, CommitGraphEdge } from "./types";

type GraphInput = Omit<Commit, "lane" | "lanes" | "edges">;

export function assignCommitGraph(commits: GraphInput[]): Commit[] {
  let active: string[] = [];

  return commits.map((commit) => {
    let lane = active.indexOf(commit.hash);
    if (lane === -1) {
      lane = active.length;
      active.push(commit.hash);
    }

    const parents = commit.parents.filter(Boolean);
    if (parents.length) {
      active[lane] = parents[0];
      parents.slice(1).forEach((parent, index) => {
        if (!active.includes(parent)) {
          active.splice(lane + index + 1, 0, parent);
        }
      });
    } else {
      active.splice(lane, 1);
    }

    active = dedupe(active);
    const edges = edgesForParents(lane, parents, active);

    return {
      ...commit,
      lane,
      lanes: Math.max(lane + 1, active.length, ...edges.map((edge) => Math.max(edge.fromLane, edge.toLane) + 1), 1),
      edges
    };
  });
}

function edgesForParents(fromLane: number, parents: string[], active: string[]): CommitGraphEdge[] {
  return parents.map((parent) => {
    const toLane = active.indexOf(parent);
    return { fromLane, toLane: toLane === -1 ? fromLane : toLane };
  });
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
