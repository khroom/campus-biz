import { useEffect, useMemo, useState } from "react";
import { layoutFan } from "./layout";
import { MapCanvas, type Frame, type Selection } from "./MapView";
import {
  backwardClosure,
  hiddenIds,
  indexGraph,
  neighborhood,
  type Family,
  type Graph,
} from "./model";
import { DetailCard, FilterPanel, MobileSheet } from "./panels";

export function App() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [depth, setDepth] = useState(1);
  const [families, setFamilies] = useState<Family[]>([]);
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [frame, setFrame] = useState<Frame>({ n: 0, mode: "all", ids: [] });

  useEffect(() => {
    fetch("/graph.json")
      .then((response) => {
        if (!response.ok) throw new Error("Не удалось загрузить карту");
        return response.json() as Promise<Graph>;
      })
      .then((data) => {
        setGraph(data);
        setFrame({ n: 1, mode: "all", ids: [] });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Ошибка загрузки"));
  }, []);

  const index = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);
  const layout = useMemo(() => (graph ? layoutFan(graph) : null), [graph]);

  const bright = useMemo(() => {
    if (!index) return null;
    if (selection?.kind === "vertex" && selection.id.startsWith("D")) {
      const trajectory = backwardClosure(index, selection.id);
      if (depth > 1) return union(trajectory, neighborhood(index, [selection.id], depth - 1));
      return trajectory;
    }
    if (selection?.kind === "vertex" || selection?.kind === "process") {
      return neighborhood(index, [selection.id], depth);
    }
    if (selection?.kind === "edge") {
      const [, source, target] = selection.id.split(":");
      return new Set([source, target].filter((id): id is string => Boolean(id)));
    }
    if (goalId) return backwardClosure(index, goalId);
    return null;
  }, [depth, goalId, index, selection]);

  const alternatives = useMemo(() => {
    const ids = new Set<string>();
    if (!index) return ids;
    const mark = (vertexId: string | null) => {
      if (!vertexId) return;
      const producers = index.producers.get(vertexId) ?? [];
      if (producers.length > 1) for (const process of producers) ids.add(process.id);
    };
    mark(goalId);
    if (selection?.kind === "vertex") mark(selection.id);
    return ids;
  }, [goalId, index, selection]);

  const hidden = useMemo(
    () => (graph ? hiddenIds(graph, families, kind) : new Set<string>()),
    [families, graph, kind],
  );

  const showTrajectory = (id: string) => {
    setGoalId(id);
    setSelection({ kind: "vertex", id });
    setDepth(1);
    const ids = index ? [...backwardClosure(index, id)] : [id];
    setFrame((current) => ({ n: current.n + 1, mode: "nodes", ids }));
  };

  const choose = (next: Selection) => {
    if (next?.kind === "vertex" && next.id.startsWith("D")) {
      showTrajectory(next.id);
      return;
    }
    setSelection(next);
    setDepth(1);
    if (next) setGoalId(null);
  };

  const chooseGoal = (id: string | null) => {
    if (!id) {
      setGoalId(null);
      setSelection(null);
      setDepth(1);
      setFrame((current) => ({ n: current.n + 1, mode: "all", ids: [] }));
      return;
    }
    showTrajectory(id);
  };

  const pickFromSearch = (next: Exclude<Selection, null | { kind: "edge" }>) => {
    setFamilies([]);
    setKind("");
    setQuery("");
    if (next.kind === "vertex" && next.id.startsWith("D")) {
      showTrajectory(next.id);
      return;
    }
    setGoalId(null);
    setSelection(next);
    setDepth(1);
    setFrame((current) => ({ n: current.n + 1, mode: "nodes", ids: [next.id] }));
  };

  const reset = () => {
    setGoalId(null);
    setSelection(null);
    setDepth(1);
    setFrame((current) => ({ n: current.n + 1, mode: "all", ids: [] }));
  };

  if (error) {
    return <p className="boot-error">{error}</p>;
  }
  if (!graph || !index || !layout) {
    return <p className="boot-error">Собираем карту…</p>;
  }

  const filters = {
    graph,
    index,
    goalId,
    families,
    kind,
    query,
    onGoal: chooseGoal,
    onFamilies: setFamilies,
    onKind: setKind,
    onQuery: setQuery,
    onPick: pickFromSearch,
  };
  const card = {
    index,
    selection,
    depth,
    onSelect: choose,
    onExpand: () => setDepth((value) => value + 1),
  };

  return (
    <div className="app">
      <header>
        <div>
          <p className="eyebrow">Деловая среда университета</p>
          <h1>Навигатор студента</h1>
        </div>
        <p className="disclaimer">
          Доход, грант и инвестиции на карте — возможные результаты, а не гарантия.
        </p>
      </header>
      <aside className="side">
        <FilterPanel {...filters} />
      </aside>
      <main className="map">
        <MapCanvas
          graph={graph}
          index={index}
          layout={layout}
          selection={selection}
          bright={bright}
          hidden={hidden}
          alternatives={alternatives}
          goalId={goalId}
          frame={frame}
          onSelect={choose}
          onReset={reset}
        />
      </main>
      <aside className="card">
        <DetailCard {...card} />
      </aside>
      <MobileSheet {...filters} {...card} />
    </div>
  );
}

function union(left: Set<string>, right: Set<string>): Set<string> {
  const next = new Set(left);
  for (const id of right) next.add(id);
  return next;
}
