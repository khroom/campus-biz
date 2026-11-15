import {
  backwardClosure,
  indexGraph,
  isFinalGoal,
  type Graph,
  type GraphIndex,
  type Vertex,
} from "./model";

const FAN_SPREAD = Math.PI * 1.22;
export const FAN_START = -Math.PI / 2 - FAN_SPREAD / 2;
export const FAN_END = -Math.PI / 2 + FAN_SPREAD / 2;
const MIN_CHORD = 76;
const RADIAL_GAP = 70;

export type FanLayout = {
  positions: Map<string, { x: number; y: number }>;
  arcs: number[];
  center: { x: number; y: number };
  fanStart: number;
  fanEnd: number;
  sectors: { goalId: string; start: number; end: number }[];
};

export function layoutFan(graph: Graph): FanLayout {
  const index = indexGraph(graph);
  const goals = orderGoals(graph, index);
  const closures = new Map(goals.map((goal) => [goal.id, backwardClosure(index, goal.id)]));
  const slot = (FAN_END - FAN_START) / Math.max(goals.length, 1);
  const bands = assignBands(graph);

  const preferred = (id: string) => {
    const own = goals.findIndex((goal) => goal.id === id);
    if (own >= 0) return FAN_START + (own + 0.5) * slot;
    const sectors: number[] = [];
    goals.forEach((goal, goalIndex) => {
      if (closures.get(goal.id)?.has(id)) sectors.push(goalIndex);
    });
    if (sectors.length === 0) return (FAN_START + FAN_END) / 2;
    const from = FAN_START + (sectors[0] + 0.5) * slot;
    const to = FAN_START + (sectors[sectors.length - 1] + 0.5) * slot;
    return (from + to) / 2;
  };

  const byBand = new Map<number, string[]>();
  for (const [id, band] of bands) {
    const key = Math.round(band * 100) / 100;
    byBand.set(key, [...(byBand.get(key) ?? []), id]);
  }
  const bandKeys = [...byBand.keys()].sort((a, b) => a - b);

  const radiusOf = new Map<number, number>();
  let previous = 0;
  for (const band of bandKeys) {
    const count = byBand.get(band)?.length ?? 1;
    const needed = count <= 1 ? 168 : ((count - 1) * MIN_CHORD) / (FAN_END - FAN_START);
    const radius = previous === 0 ? Math.max(needed, 168) : Math.max(needed, previous + RADIAL_GAP);
    radiusOf.set(band, radius);
    previous = radius;
  }

  const center = { x: 0, y: 0 };
  const positions = new Map<string, { x: number; y: number }>();
  const angleOf = reduceCrossings(
    index,
    untangle(index, bands, byBand, bandKeys, radiusOf, preferred),
    byBand,
    bandKeys,
    radiusOf,
  );
  for (const band of bandKeys) {
    const radius = radiusOf.get(band) ?? 168;
    for (const id of byBand.get(band) ?? []) {
      const angle = angleOf.get(id) ?? preferred(id);
      positions.set(id, {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
  }
  loosen(positions, index, new Set(goals.map((goal) => goal.id)));

  const goalAngle = (id: string) => {
    const point = positions.get(id);
    return point ? Math.atan2(point.y, point.x) : (angleOf.get(id) ?? preferred(id));
  };
  const orderedGoals = goals
    .map((goal) => ({ goal, angle: goalAngle(goal.id) }))
    .sort((left, right) => left.angle - right.angle);
  const sectors = orderedGoals.map((item, index) => {
    const previousAngle = index === 0 ? FAN_START : (orderedGoals[index - 1].angle + item.angle) / 2;
    const nextAngle =
      index === orderedGoals.length - 1 ? FAN_END : (item.angle + orderedGoals[index + 1].angle) / 2;
    return { goalId: item.goal.id, start: previousAngle, end: nextAngle };
  });

  return {
    positions,
    arcs: bandKeys.map((band) => radiusOf.get(band) ?? 0),
    center,
    fanStart: FAN_START,
    fanEnd: FAN_END,
    sectors,
  };
}

function untangle(
  index: GraphIndex,
  bands: Map<string, number>,
  byBand: Map<number, string[]>,
  bandKeys: number[],
  radiusOf: Map<number, number>,
  seed: (id: string) => number,
): Map<string, number> {
  const angle = new Map<string, number>();
  for (const id of bands.keys()) angle.set(id, seed(id));

  const bandOf = (id: string) => Math.round((bands.get(id) ?? 0) * 100) / 100;
  const linked = (id: string): string[] => {
    const process = index.processes.get(id);
    if (process) return [...process.inputs, ...process.outputs];
    return [...(index.producers.get(id) ?? []), ...(index.consumers.get(id) ?? [])].map((item) => item.id);
  };
  const place = (band: number, outward: boolean) => {
    const group = byBand.get(band) ?? [];
    const prefs = group.map((id) => {
      const neighbors = linked(id).filter((neighbor) => {
        const other = bandOf(neighbor);
        return outward ? other < band - 0.001 : other > band + 0.001;
      });
      if (neighbors.length === 0) return angle.get(id) ?? seed(id);
      return median(neighbors.map((neighbor) => angle.get(neighbor) ?? seed(neighbor)));
    });
    const radius = radiusOf.get(band) ?? 168;
    const placed = packAngles(prefs, MIN_CHORD / radius, FAN_START, FAN_END);
    group.forEach((id, index) => angle.set(id, placed[index] ?? seed(id)));
  };

  for (let pass = 0; pass < 5; pass += 1) {
    for (const band of bandKeys.slice(1)) place(band, true);
    for (let index = bandKeys.length - 2; index >= 0; index -= 1) place(bandKeys[index], false);
  }
  for (const band of bandKeys.slice(1)) place(band, true);
  return angle;
}

function reduceCrossings(
  index: GraphIndex,
  angle: Map<string, number>,
  byBand: Map<number, string[]>,
  bandKeys: number[],
  radiusOf: Map<number, number>,
): Map<string, number> {
  const links: [string, string][] = [];
  for (const process of index.processes.values()) {
    for (const input of process.inputs) links.push([input, process.id]);
    for (const output of process.outputs) links.push([process.id, output]);
  }
  const bandById = new Map<string, number>();
  for (const band of bandKeys) for (const id of byBand.get(band) ?? []) bandById.set(id, band);
  const point = (id: string) => {
    const radius = radiusOf.get(bandById.get(id) ?? 0) ?? 168;
    const value = angle.get(id) ?? 0;
    return { x: radius * Math.cos(value), y: radius * Math.sin(value) };
  };
  const turns = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const crosses = (left: [string, string], right: [string, string]) => {
    if (left[0] === right[0] || left[0] === right[1] || left[1] === right[0] || left[1] === right[1]) return false;
    const a = point(left[0]);
    const b = point(left[1]);
    const c = point(right[0]);
    const d = point(right[1]);
    return turns(a, b, c) * turns(a, b, d) < 0 && turns(c, d, a) * turns(c, d, b) < 0;
  };
  let score = 0;
  for (let i = 0; i < links.length; i += 1) {
    for (let j = i + 1; j < links.length; j += 1) if (crosses(links[i], links[j])) score += 1;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (const band of bandKeys.slice(1)) {
      const group = [...(byBand.get(band) ?? [])].sort(
        (left, right) => (angle.get(left) ?? 0) - (angle.get(right) ?? 0),
      );
      for (let index = 0; index < group.length - 1; index += 1) {
        const left = group[index];
        const right = group[index + 1];
        const leftAngle = angle.get(left) ?? 0;
        const rightAngle = angle.get(right) ?? 0;
        angle.set(left, rightAngle);
        angle.set(right, leftAngle);
        let next = 0;
        for (let i = 0; i < links.length; i += 1) {
          for (let j = i + 1; j < links.length; j += 1) if (crosses(links[i], links[j])) next += 1;
        }
        if (next < score) {
          score = next;
          group[index] = right;
          group[index + 1] = left;
        } else {
          angle.set(left, leftAngle);
          angle.set(right, rightAngle);
        }
      }
    }
  }
  return angle;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function orderGoals(graph: Graph, index: GraphIndex): Vertex[] {
  const goals = graph.vertices.filter((vertex) => isFinalGoal(vertex));
  if (goals.length <= 2) return goals;
  const closures = new Map(goals.map((goal) => [goal.id, backwardClosure(index, goal.id)]));
  const affinity = (left: Vertex, right: Vertex) => {
    let sharedProcesses = 0;
    for (const process of index.processes.values()) {
      const touch = new Set([...process.inputs, ...process.outputs]);
      if (touch.has(left.id) && touch.has(right.id)) sharedProcesses += 1;
    }
    const closure = jaccard(closures.get(left.id) ?? new Set(), closures.get(right.id) ?? new Set());
    return closure + sharedProcesses;
  };
  return leafOrder(goals, affinity);
}

function leafOrder(goals: Vertex[], affinity: (left: Vertex, right: Vertex) => number): Vertex[] {
  const clusters = goals.map((goal) => ({ members: [goal], order: [goal] }));
  const link = (left: (typeof clusters)[number], right: (typeof clusters)[number]) => {
    let total = 0;
    for (const a of left.members) for (const b of right.members) total += affinity(a, b);
    return total / (left.members.length * right.members.length);
  };
  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let best = -1;
    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const value = link(clusters[i], clusters[j]);
        if (value > best) {
          best = value;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const left = clusters[bestI];
    const right = clusters[bestJ];
    const leftTail = left.order[left.order.length - 1];
    const rightTail = right.order[right.order.length - 1];
    const options = [
      { order: [...left.order, ...right.order], touch: affinity(leftTail, right.order[0]) },
      { order: [...left.order, ...[...right.order].reverse()], touch: affinity(leftTail, rightTail) },
      { order: [...[...left.order].reverse(), ...right.order], touch: affinity(left.order[0], right.order[0]) },
      { order: [...right.order, ...left.order], touch: affinity(rightTail, left.order[0]) },
    ].sort((a, b) => b.touch - a.touch);
    clusters.splice(Math.max(bestI, bestJ), 1);
    clusters.splice(Math.min(bestI, bestJ), 1);
    clusters.push({ members: [...left.members, ...right.members], order: options[0].order });
  }
  return clusters[0]?.order ?? goals;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

function assignBands(graph: Graph): Map<string, number> {
  const finals = new Set(graph.vertices.filter((vertex) => isFinalGoal(vertex)).map((vertex) => vertex.id));
  const rank = new Map<string, number>();
  for (const vertex of graph.vertices) rank.set(vertex.id, 0);
  for (const process of graph.processes) rank.set(process.id, 0);

  // inner must stay strictly closer to the centre than outer
  const outward: [string, string][] = [];
  const pushOutward = (inner: string, outer: string) => {
    if (finals.has(outer)) return;
    outward.push([inner, outer]);
  };
  for (const finalId of finals) {
    for (const vertex of graph.vertices) if (!finals.has(vertex.id)) pushOutward(finalId, vertex.id);
    for (const process of graph.processes) pushOutward(finalId, process.id);
  }
  for (const process of graph.processes) {
    for (const output of process.outputs) pushOutward(output, process.id);
    for (const input of process.inputs) {
      if (finals.has(input)) pushOutward(input, process.id);
      else pushOutward(process.id, input);
    }
    const resources = process.inputs.filter((id) => id.startsWith("R"));
    const conditions = process.inputs.filter((id) => id.startsWith("S"));
    for (const resource of resources) {
      for (const condition of conditions) pushOutward(condition, resource);
    }
  }

  for (let pass = 0; pass < outward.length; pass += 1) {
    let changed = false;
    for (const [inner, outer] of outward) {
      const next = (rank.get(inner) ?? 0) + 1;
      if (next > (rank.get(outer) ?? 0)) {
        rank.set(outer, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return rank;
}

function loosen(positions: Map<string, { x: number; y: number }>, index: GraphIndex, finals: Set<string>): void {
  const seed = new Map<string, { x: number; y: number }>();
  const body = new Map<string, { x: number; y: number }>();
  for (const [id, point] of positions) {
    if (id.startsWith("caption-")) continue;
    seed.set(id, { ...point });
    body.set(id, { ...point });
  }
  const radius = new Map<string, number>();
  for (const [id, point] of seed) radius.set(id, Math.hypot(point.x, point.y));

  const neighborsOf = (id: string): string[] => {
    const process = index.processes.get(id);
    if (process) return [...process.inputs, ...process.outputs].filter((item) => body.has(item));
    return [...(index.producers.get(id) ?? []), ...(index.consumers.get(id) ?? [])]
      .map((item) => item.id)
      .filter((item) => body.has(item));
  };
  const angleBetween = (from: number, to: number) => {
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  };
  const place = (id: string, angle: number) => {
    const span = radius.get(id) ?? 168;
    const limited = clamp(angle, FAN_START, FAN_END);
    body.set(id, { x: span * Math.cos(limited), y: span * Math.sin(limited) });
  };

  for (let pass = 0; pass < 12; pass += 1) {
    const angles = new Map<string, number>();
    for (const [id, point] of body) {
      const origin = seed.get(id) ?? point;
      const current = Math.atan2(point.y, point.x);
      const neighbors = neighborsOf(id);
      let aimX = Math.cos(Math.atan2(origin.y, origin.x)) * (finals.has(id) ? 3 : 0.55);
      let aimY = Math.sin(Math.atan2(origin.y, origin.x)) * (finals.has(id) ? 3 : 0.55);
      for (const neighbor of neighbors) {
        const other = body.get(neighbor);
        if (!other) continue;
        aimX += Math.cos(Math.atan2(other.y, other.x));
        aimY += Math.sin(Math.atan2(other.y, other.x));
      }
      const aim = Math.atan2(aimY, aimX);
      const gain = finals.has(id) ? 0.06 : 0.3;
      angles.set(id, current + angleBetween(current, aim) * gain);
    }
    for (const [id, angle] of angles) place(id, angle);

    const ids = [...body.keys()];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const left = body.get(ids[i]);
        const right = body.get(ids[j]);
        if (!left || !right) continue;
        const dist = Math.hypot(right.x - left.x, right.y - left.y);
        if (dist >= 74 || dist < 0.1) continue;
        const leftAngle = Math.atan2(left.y, left.x);
        const rightAngle = Math.atan2(right.y, right.x);
        const delta = angleBetween(leftAngle, rightAngle);
        const sign = delta === 0 ? (i < j ? 1 : -1) : Math.sign(delta);
        const push = ((74 - dist) / 74) * 0.08;
        const leftWeight = finals.has(ids[i]) ? 0.15 : 1;
        const rightWeight = finals.has(ids[j]) ? 0.15 : 1;
        place(ids[i], leftAngle - sign * push * leftWeight);
        place(ids[j], rightAngle + sign * push * rightWeight);
      }
    }
  }

  for (const [id, point] of body) positions.set(id, point);
}

function packAngles(preferred: number[], minGap: number, start: number, end: number): number[] {
  const count = preferred.length;
  if (count === 0) return [];
  const order = preferred
    .map((angle, index) => ({ angle, index }))
    .sort((a, b) => a.angle - b.angle || a.index - b.index);
  const result = new Array<number>(count);
  if (count === 1) {
    result[order[0].index] = clamp(order[0].angle, start, end);
    return result;
  }
  const available = end - start;
  if ((count - 1) * minGap > available) {
    const gap = available / (count - 1);
    order.forEach((item, index) => {
      result[item.index] = start + index * gap;
    });
    return result;
  }

  const angles = order.map((item) => clamp(item.angle, start, end));
  for (let index = 1; index < count; index += 1) {
    angles[index] = Math.max(angles[index], angles[index - 1] + minGap);
  }
  if (angles[count - 1] > end) {
    angles[count - 1] = end;
    for (let index = count - 2; index >= 0; index -= 1) {
      angles[index] = Math.min(angles[index], angles[index + 1] - minGap);
    }
  }
  centerCollapsedRuns(order.map((item) => item.angle), angles, minGap, start, end);
  order.forEach((item, index) => {
    result[item.index] = angles[index];
  });
  return result;
}

function centerCollapsedRuns(
  preferred: number[],
  angles: number[],
  minGap: number,
  start: number,
  end: number,
): void {
  let cursor = 0;
  while (cursor < angles.length) {
    let tail = cursor;
    while (
      tail + 1 < angles.length &&
      preferred[tail + 1] - preferred[cursor] < minGap * 0.75 &&
      angles[tail + 1] - angles[tail] <= minGap * 1.2
    ) {
      tail += 1;
    }
    if (tail > cursor) {
      const width = (tail - cursor) * minGap;
      const mean = preferred.slice(cursor, tail + 1).reduce((sum, angle) => sum + angle, 0) / (tail - cursor + 1);
      const previous = cursor === 0 ? start : angles[cursor - 1] + minGap;
      const next = tail === angles.length - 1 ? end : angles[tail + 1] - minGap;
      let left = mean - width / 2;
      if (left < previous) left = previous;
      if (left + width > next) left = next - width;
      if (left >= previous - 1e-6 && left + width <= next + 1e-6) {
        for (let index = cursor; index <= tail; index += 1) {
          angles[index] = left + (index - cursor) * minGap;
        }
      }
    }
    cursor = tail + 1;
  }
}

function clamp(value: number, start: number, end: number): number {
  return Math.min(end, Math.max(start, value));
}
