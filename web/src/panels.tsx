import { useEffect, useMemo, useState } from "react";
import { edgeEnds, type Selection } from "./MapView";
import {
  elementName,
  familyOf,
  isFinalGoal,
  isIntermediateGoal,
  kindTokens,
  linksOf,
  roleOf,
  type Family,
  type Graph,
  type GraphIndex,
  type Role,
} from "./model";

const FAMILIES: { id: Family; label: string }[] = [
  { id: "R", label: "Ресурсы" },
  { id: "S", label: "Условия" },
  { id: "D", label: "Результаты" },
];

const ROLE_LABEL: Record<Role, string> = {
  resource: "Ресурс",
  external: "Внешний ресурс",
  condition: "Условие",
  intermediate: "Промежуточный результат",
  outcome: "Экономический или профессиональный результат",
};

type FilterProps = {
  graph: Graph;
  index: GraphIndex;
  goalId: string | null;
  families: Family[];
  kind: string;
  query: string;
  onGoal: (id: string | null) => void;
  onFamilies: (families: Family[]) => void;
  onKind: (kind: string) => void;
  onQuery: (query: string) => void;
  onPick: (selection: { kind: "vertex" | "process"; id: string }) => void;
};

export function FilterPanel({
  graph,
  index,
  goalId,
  families,
  kind,
  query,
  onGoal,
  onFamilies,
  onKind,
  onQuery,
  onPick,
}: FilterProps) {
  const finals = useMemo(() => graph.vertices.filter((vertex) => isFinalGoal(vertex)), [graph.vertices]);
  const intermediates = useMemo(
    () => graph.vertices.filter((vertex) => isIntermediateGoal(vertex)),
    [graph.vertices],
  );
  const kinds = useMemo(() => {
    const tokens = new Set<string>();
    for (const vertex of graph.vertices) for (const token of kindTokens(vertex.kind)) tokens.add(token);
    return [...tokens].sort((a, b) => a.localeCompare(b, "ru"));
  }, [graph.vertices]);
  const needle = query.trim().toLowerCase();
  const matches =
    needle.length === 0
      ? []
      : [...graph.vertices.map((item) => item.id), ...graph.processes.map((item) => item.id)]
          .filter((id) => {
            const name = elementName(index, id).toLowerCase();
            return id.toLowerCase().includes(needle) || name.includes(needle);
          })
          .slice(0, 8);

  const toggleFamily = (family: Family) => {
    if (families.length === 0) {
      onFamilies(FAMILIES.map((item) => item.id).filter((id) => id !== family));
      return;
    }
    if (families.includes(family)) {
      const next = families.filter((id) => id !== family);
      onFamilies(next.length === 0 ? [] : next);
      return;
    }
    const next = [...families, family];
    onFamilies(next.length === FAMILIES.length ? [] : next);
  };

  return (
    <div className="panel-block">
      <section>
        <h2>Цель</h2>
        <button type="button" className={goalId === null ? "goal on" : "goal"} onClick={() => onGoal(null)}>
          Вся карта
        </button>
        <div className="goal-list">
          <h3>Конечные</h3>
          {finals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={goalId === goal.id ? "goal on" : "goal"}
              onClick={() => onGoal(goalId === goal.id ? null : goal.id)}
            >
              <span>{goal.name}</span>
              <small>{goal.id}</small>
            </button>
          ))}
          <h3>Промежуточные</h3>
          {intermediates.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={goalId === goal.id ? "goal on" : "goal"}
              onClick={() => onGoal(goalId === goal.id ? null : goal.id)}
            >
              <span>{goal.name}</span>
              <small>{goal.id}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Поиск</h2>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Название или идентификатор"
          aria-label="Поиск"
          autoComplete="off"
        />
        {matches.length > 0 && (
          <ul className="matches">
            {matches.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({ kind: index.processes.has(id) ? "process" : "vertex", id })
                  }
                >
                  <small>{id}</small>
                  {elementName(index, id)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>Фильтр</h2>
        <div className="chips">
          {FAMILIES.map((family) => {
            const active = families.length === 0 || families.includes(family.id);
            return (
              <button
                key={family.id}
                type="button"
                className={active ? "chip on" : "chip"}
                aria-pressed={active}
                onClick={() => toggleFamily(family.id)}
              >
                {family.label}
              </button>
            );
          })}
        </div>
        <label className="kind-filter">
          Вид
          <select value={kind} onChange={(event) => onKind(event.target.value)} aria-label="Вид">
            <option value="">Все виды</option>
            {kinds.map((token) => (
              <option key={token} value={token}>
                {token}
              </option>
            ))}
          </select>
        </label>
      </section>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <section className="legend">
      <h2>Легенда</h2>
      <ul>
        <li><i className="swatch resource" /><span>Ресурс</span></li>
        <li><i className="swatch external" /><span>Внешний ресурс</span></li>
        <li><i className="swatch condition" /><span>Условие</span></li>
        <li><i className="swatch intermediate" /><span>Промежуточный результат</span></li>
        <li><i className="swatch outcome" /><span>Экономический или профессиональный итог</span></li>
        <li><i className="swatch diamond" /><span>Процесс: нужны все входы</span></li>
        <li><i className="swatch line-in" /><span>Обязательный вход</span></li>
        <li><i className="swatch line-out" /><span>Выход процесса</span></li>
        <li><span>В центре — конечные цели. Вход процесса дальше от центра, выход — ближе. Вершины можно сдвинуть.</span></li>
      </ul>
    </section>
  );
}

type CardProps = {
  index: GraphIndex;
  selection: Selection;
  depth: number;
  onSelect: (selection: Selection) => void;
  onExpand: () => void;
};

export function DetailCard({ index, selection, depth, onSelect, onExpand }: CardProps) {
  if (!selection) {
    return (
      <div className="detail empty">
        <h2>Карточка</h2>
        <p>Выберите вершину, процесс или связь на карте.</p>
      </div>
    );
  }
  if (selection.kind === "edge") return <EdgeCard index={index} id={selection.id} onSelect={onSelect} />;
  if (selection.kind === "process") {
    const process = index.processes.get(selection.id);
    if (!process) return null;
    return (
      <div className="detail">
        <p className="kicker">Процесс · {process.id}</p>
        <h2>{process.name}</h2>
        <p className="status">{process.confirmationStatus}</p>
        <h3>Обязательные входы (нужны все)</h3>
        <NameList index={index} ids={process.inputs} onSelect={onSelect} />
        <h3>Результаты</h3>
        <NameList index={index} ids={process.outputs} onSelect={onSelect} />
        {process.guard && (
          <>
            <h3>Условие запуска</h3>
            <p>{process.guard}</p>
          </>
        )}
        <Sources source={process.source} />
        <Expand depth={depth} onExpand={onExpand} />
      </div>
    );
  }
  const vertex = index.vertices.get(selection.id);
  if (!vertex) return null;
  const producers = index.producers.get(vertex.id) ?? [];
  const consumers = index.consumers.get(vertex.id) ?? [];
  const role = roleOf(vertex);
  return (
    <div className="detail">
      <p className="kicker">
        {ROLE_LABEL[role]} · {vertex.id}
      </p>
      <h2>{vertex.name}</h2>
      <p className="status">{vertex.type}{vertex.kind ? ` · ${vertex.kind}` : ""}</p>
      {role === "outcome" && <p className="warn">Это возможный результат, а не гарантия.</p>}
      {vertex.conditions && (
        <>
          <h3>Условия</h3>
          <p>{vertex.conditions}</p>
        </>
      )}
      {producers.length > 0 && (
        <>
          <h3>{producers.length > 1 ? "Альтернативные способы" : "Как получить"}</h3>
          <NameList index={index} ids={producers.map((process) => process.id)} onSelect={onSelect} />
        </>
      )}
      {consumers.length > 0 && (
        <>
          <h3>Где используется</h3>
          <NameList index={index} ids={consumers.map((process) => process.id)} onSelect={onSelect} />
        </>
      )}
      <Sources source={vertex.source} />
      <Expand depth={depth} onExpand={onExpand} />
    </div>
  );
}

function EdgeCard({
  index,
  id,
  onSelect,
}: {
  index: GraphIndex;
  id: string;
  onSelect: (selection: Selection) => void;
}) {
  const ends = edgeEnds(id);
  if (!ends) return null;
  const processId = ends.role === "input" ? ends.target : ends.source;
  const vertexId = ends.role === "input" ? ends.source : ends.target;
  const processName = elementName(index, processId);
  const vertexName = elementName(index, vertexId);
  return (
    <div className="detail">
      <p className="kicker">{ends.role === "input" ? "Обязательный вход" : "Выход процесса"}</p>
      <h2>{ends.role === "input" ? "Вход ещё не даёт результат" : "Результат процесса"}</h2>
      {ends.role === "input" ? (
        <p>
          «{vertexName}» — обязательный вход процесса «{processName}». Сам по себе он не достаточен: нужны все входы
          этого процесса.
        </p>
      ) : (
        <p>
          «{vertexName}» появляется на выходе процесса «{processName}», когда выполнены все его входы и условие запуска.
        </p>
      )}
      <h3>Элементы связи</h3>
      <NameList index={index} ids={[vertexId, processId]} onSelect={onSelect} />
    </div>
  );
}

function NameList({
  index,
  ids,
  onSelect,
}: {
  index: GraphIndex;
  ids: string[];
  onSelect: (selection: Selection) => void;
}) {
  return (
    <ul className="name-list">
      {ids.map((id) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onSelect({ kind: familyOf(id) === "H" ? "process" : "vertex", id })}
          >
            <small>{id}</small>
            {elementName(index, id)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Sources({ source }: { source: string }) {
  const links = linksOf(source);
  if (!source) return null;
  return (
    <>
      <h3>Источник</h3>
      {links.length === 0 ? (
        <p>{source}</p>
      ) : (
        <ul className="sources">
          {links.map((link) => (
            <li key={link}>
              <a href={link} target="_blank" rel="noreferrer">
                {linkHost(link)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Expand({ depth, onExpand }: { depth: number; onExpand: () => void }) {
  return (
    <button type="button" className="expand" onClick={onExpand} disabled={depth >= 6}>
      Дальше по связи
      <small>шаг {depth}</small>
    </button>
  );
}

function linkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function MobileSheet(props: FilterProps & CardProps) {
  const [tab, setTab] = useState<"filters" | "card">("filters");
  useEffect(() => {
    if (props.selection) setTab("card");
  }, [props.selection]);
  return (
    <section className="sheet">
      <div className="sheet-tabs">
        <button type="button" className={tab === "filters" ? "on" : ""} onClick={() => setTab("filters")}>
          Фильтры
        </button>
        <button type="button" className={tab === "card" ? "on" : ""} onClick={() => setTab("card")}>
          Карточка
        </button>
      </div>
      <div className="sheet-body">
        {tab === "filters" ? <FilterPanel {...props} /> : <DetailCard {...props} />}
      </div>
    </section>
  );
}
