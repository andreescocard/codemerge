import type { Commit, GraphRoute } from "./types";

type GraphInput = Omit<Commit, "lane" | "lanes" | "colorLane" | "routes">;

const maxLanes = 4;
const nodeY = 0.5;

export function assignCommitGraph(commits: GraphInput[]): Commit[] {
  let active: string[] = [];

  return commits.map((commit) => {
    const prevLanes = active.slice();
    let lane = active.indexOf(commit.hash);
    if (lane === -1) {
      lane = active.length;
      active.push(commit.hash);
    }

    const parents = dedupe(commit.parents.filter(Boolean));
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
    const nextLanes = active.slice();
    const routes = routesForCommit(commit.hash, lane, parents, prevLanes, nextLanes);

    return {
      ...commit,
      lane: clampLane(lane),
      lanes: Math.max(
        1,
        Math.min(maxLanes, Math.max(lane + 1, prevLanes.length, nextLanes.length, ...routes.map((route) => Math.max(route.fromLane, route.toLane) + 1)))
      ),
      colorLane: clampLane(lane),
      routes
    };
  });
}

function routesForCommit(hash: string, nodeLane: number, parents: string[], prevLanes: string[], nextLanes: string[]): GraphRoute[] {
  const routes: GraphRoute[] = [];

  prevLanes.forEach((value, fromLane) => {
    if (value === hash) {
      routes.push(route(fromLane, 0, nodeLane, nodeY, nodeLane));
      return;
    }

    const toLane = nextLanes.indexOf(value);
    if (toLane !== -1) {
      routes.push(route(fromLane, 0, toLane, 1, toLane));
    }
  });

  parents.forEach((parent) => {
    const toLane = nextLanes.indexOf(parent);
    routes.push(route(nodeLane, nodeY, toLane === -1 ? nodeLane : toLane, 1, toLane === -1 ? nodeLane : toLane));
  });

  return routes;
}

function route(fromLane: number, fromY: number, toLane: number, toY: number, colorLane: number): GraphRoute {
  return {
    fromLane: clampLane(fromLane),
    fromY,
    toLane: clampLane(toLane),
    toY,
    colorLane: clampLane(colorLane)
  };
}

function clampLane(lane: number): number {
  return Math.min(maxLanes - 1, Math.max(0, lane));
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
