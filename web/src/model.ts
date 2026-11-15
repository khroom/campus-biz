export type Vertex = {
  id: string;
  stage: string;
  name: string;
  type: string;
  kind: string;
  conditions: string;
  source: string;
};

export type Process = {
  id: string;
  stage: string;
  name: string;
  guard: string;
  confirmationStatus: string;
  source: string;
  inputs: string[];
  outputs: string[];
};

export type Graph = {
  stage: string;
  vertices: Vertex[];
  processes: Process[];
};

export type Family = "R" | "S" | "D";

export type Role = "resource" | "external" | "condition" | "intermediate" | "outcome";

export const OUTCOME_TYPES = new Set([
  "экономический результат",
  "финансовый результат",
  "профессиональный результат",
  "организационно-правовой результат",
]);

export type GraphIndex = {
  vertices: Map<string, Vertex>;
  processes: Map<string, Process>;
  producers: Map<string, Process[]>;
  consumers: Map<string, Process[]>;
};

export function indexGraph(graph: Graph): GraphIndex {
  const vertices = new Map(graph.vertices.map((vertex) => [vertex.id, vertex]));
  const processes = new Map(graph.processes.map((process) => [process.id, process]));
  const producers = new Map<string, Process[]>();
  const consumers = new Map<string, Process[]>();
  for (const process of graph.processes) {
    for (const output of process.outputs) {
      producers.set(output, [...(producers.get(output) ?? []), process]);
    }
    for (const input of process.inputs) {
      consumers.set(input, [...(consumers.get(input) ?? []), process]);
    }
  }
  return { vertices, processes, producers, consumers };
}

export function familyOf(id: string): Family | "H" {
  if (id.startsWith("H")) return "H";
  if (id.startsWith("S")) return "S";
  if (id.startsWith("D")) return "D";
  return "R";
}

export function roleOf(vertex: Vertex): Role {
  if (vertex.id.startsWith("R")) {
    return vertex.type.includes("внешн") ? "external" : "resource";
  }
  if (vertex.id.startsWith("S")) return "condition";
  if (OUTCOME_TYPES.has(vertex.type)) return "outcome";
  return "intermediate";
}

export function isFinalGoal(vertex: Vertex): boolean {
  return vertex.id.startsWith("D") && OUTCOME_TYPES.has(vertex.type);
}

export function isIntermediateGoal(vertex: Vertex): boolean {
  return vertex.id.startsWith("D") && !OUTCOME_TYPES.has(vertex.type);
}

export function isGoal(vertex: Vertex): boolean {
  return vertex.id.startsWith("D");
}

export function kindTokens(kind: string): string[] {
  return kind
    .split(";")
    .map((token) => token.trim())
    .filter(Boolean);
}

export function linksOf(source: string): string[] {
  return source.match(/https?:\/\/[^\s;,]+/g) ?? [];
}

export function backwardClosure(index: GraphIndex, goalId: string): Set<string> {
  const seen = new Set<string>([goalId]);
  const stack = [goalId];
  while (stack.length > 0) {
    const vertexId = stack.pop()!;
    for (const process of index.producers.get(vertexId) ?? []) {
      seen.add(process.id);
      for (const input of process.inputs) {
        if (!seen.has(input)) {
          seen.add(input);
          stack.push(input);
        }
      }
    }
  }
  return seen;
}

function openProcesses(index: GraphIndex, seeds: Set<string>): Set<string> {
  const next = new Set(seeds);
  const opened: string[] = [];
  for (const id of seeds) {
    if (index.processes.has(id)) {
      opened.push(id);
      continue;
    }
    const incident = [
      ...(index.producers.get(id) ?? []),
      ...(index.consumers.get(id) ?? []),
    ];
    for (const process of incident) {
      if (!next.has(process.id)) next.add(process.id);
      opened.push(process.id);
    }
  }
  for (const processId of opened) {
    const process = index.processes.get(processId);
    if (!process) continue;
    for (const vertexId of [...process.inputs, ...process.outputs]) next.add(vertexId);
  }
  return next;
}

export function neighborhood(index: GraphIndex, origin: string[], depth: number): Set<string> {
  let current = new Set(origin);
  for (let step = 0; step < depth; step += 1) current = openProcesses(index, current);
  return current;
}

export function hiddenIds(graph: Graph, families: Family[], kind: string): Set<string> {
  const hidden = new Set<string>();
  if (families.length === 0 && !kind) return hidden;
  for (const vertex of graph.vertices) {
    const typeOk = families.length === 0 || families.includes(familyOf(vertex.id) as Family);
    const kindOk = !kind || kindTokens(vertex.kind).includes(kind);
    if (!typeOk || !kindOk) hidden.add(vertex.id);
  }
  for (const process of graph.processes) {
    const ends = [...process.inputs, ...process.outputs];
    if (ends.length > 0 && ends.every((id) => hidden.has(id))) hidden.add(process.id);
  }
  return hidden;
}

export function elementName(index: GraphIndex, id: string): string {
  return index.vertices.get(id)?.name ?? index.processes.get(id)?.name ?? id;
}
