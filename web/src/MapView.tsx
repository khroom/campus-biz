import {
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ViewportPortal,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import type { FanLayout } from "./layout";
import type { Graph, GraphIndex } from "./model";
import { nodeTypes, type ProcessData, type VertexData } from "./nodes";
import { roleOf } from "./model";

export type Selection =
  | { kind: "vertex" | "process"; id: string }
  | { kind: "edge"; id: string }
  | null;

export type Frame = { n: number; mode: "all" | "nodes"; ids: string[] };

type MapProps = {
  graph: Graph;
  index: GraphIndex;
  layout: FanLayout;
  selection: Selection;
  bright: Set<string> | null;
  hidden: Set<string>;
  alternatives: Set<string>;
  goalId: string | null;
  frame: Frame;
  onSelect: (selection: Selection) => void;
  onReset: () => void;
};

function arcPath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const x1 = cx + radius * Math.cos(start);
  const y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end);
  const y2 = cy + radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

function approach(from: { x: number; y: number }, to: { x: number; y: number }): Position {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
  return dy >= 0 ? Position.Bottom : Position.Top;
}

function opposite(side: Position): Position {
  if (side === Position.Left) return Position.Right;
  if (side === Position.Right) return Position.Left;
  if (side === Position.Top) return Position.Bottom;
  return Position.Top;
}

function edgeEnds(id: string): { role: "input" | "output"; source: string; target: string } | null {
  const [role, source, target] = id.split(":");
  if ((role !== "input" && role !== "output") || !source || !target) return null;
  return { role, source, target };
}

export function MapCanvas(props: MapProps) {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  );
}

function MapInner({
  graph,
  index,
  layout,
  selection,
  bright,
  hidden,
  alternatives,
  frame,
  onSelect,
  onReset,
}: MapProps) {
  const { fitView } = useReactFlow();
  const [overrides, setOverrides] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    setOverrides({});
  }, [layout]);

  const nodes = useMemo(() => {
    const items: Node[] = [];
    for (const vertex of graph.vertices) {
      const center = layout.positions.get(vertex.id);
      if (!center) continue;
      const dimmed = bright !== null && !bright.has(vertex.id);
      items.push({
        id: vertex.id,
        type: "vertex",
        position: overrides[vertex.id] ?? { x: center.x - 28, y: center.y - 28 },
        data: {
          name: vertex.name,
          role: roleOf(vertex),
          dimmed,
          picked: selection?.kind === "vertex" && selection.id === vertex.id,
        } satisfies VertexData,
        hidden: hidden.has(vertex.id),
        draggable: true,
        selectable: true,
        zIndex: selection?.kind === "vertex" && selection.id === vertex.id ? 6 : 3,
      });
    }
    for (const process of graph.processes) {
      const center = layout.positions.get(process.id);
      if (!center) continue;
      const dimmed = bright !== null && !bright.has(process.id);
      items.push({
        id: process.id,
        type: "process",
        position: overrides[process.id] ?? { x: center.x - 18, y: center.y - 18 },
        data: {
          name: process.name,
          dimmed,
          picked: selection?.kind === "process" && selection.id === process.id,
          alternative: alternatives.has(process.id),
        } satisfies ProcessData,
        hidden: hidden.has(process.id),
        draggable: true,
        selectable: true,
        zIndex: 4,
      });
    }
    return items;
  }, [alternatives, bright, graph, hidden, layout, overrides, selection]);

  const edges = useMemo(() => {
    const items: Edge[] = [];
    const push = (role: "input" | "output", source: string, target: string) => {
      if (hidden.has(source) || hidden.has(target)) return;
      const id = `${role}:${source}:${target}`;
      const picked = selection?.kind === "edge" && selection.id === id;
      const dimmed = !picked && bright !== null && (!bright.has(source) || !bright.has(target));
      const color = picked ? "#241f1b" : dimmed ? "#ddd4c6" : role === "input" ? "#7d7468" : "#c45b48";
      const from = layout.positions.get(source);
      const to = layout.positions.get(target);
      const sourcePosition = from && to ? approach(from, to) : Position.Right;
      items.push({
        id,
        source,
        target,
        sourceHandle: `out-${sourcePosition}`,
        targetHandle: `in-${opposite(sourcePosition)}`,
        type: "default",
        className: `${role === "input" ? "edge-input" : "edge-output"}${dimmed ? " dimmed" : ""}${picked ? " picked" : ""}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
        zIndex: picked ? 2 : dimmed ? 0 : 1,
        interactionWidth: 16,
      });
    };
    for (const process of graph.processes) {
      for (const input of process.inputs) push("input", input, process.id);
      for (const output of process.outputs) push("output", process.id, output);
    }
    return items;
  }, [bright, graph.processes, hidden, layout.positions, selection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (frame.mode === "nodes" && frame.ids.length > 0) {
        const visible = frame.ids.filter((id) => index.vertices.has(id) || index.processes.has(id));
        if (visible.length === 0) fitView({ padding: 0.14, duration: 450 });
        else fitView({ nodes: visible.map((id) => ({ id })), padding: 0.42, duration: 450 });
      } else {
        fitView({ padding: 0.14, duration: 450 });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitView, frame, index]);

  const outer = layout.arcs[layout.arcs.length - 1] ?? 400;
  const pad = 160;
  const size = (outer + pad) * 2;
  const minX = layout.center.x - outer - pad;
  const minY = layout.center.y - outer - pad;

  return (
    <div className="map-frame">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode="light"
        fitView
        minZoom={0.12}
        maxZoom={1.75}
        nodesDraggable
        onNodesChange={(changes: NodeChange[]) => {
          const moved = changes.filter(
            (change): change is NodeChange & { type: "position"; id: string; position: { x: number; y: number } } =>
              change.type === "position" && "position" in change && change.position !== undefined,
          );
          if (moved.length === 0) return;
          setOverrides((current) => {
            let changed = false;
            const next = { ...current };
            for (const change of moved) {
              const previous = next[change.id];
              if (previous && previous.x === change.position.x && previous.y === change.position.y) continue;
              next[change.id] = change.position;
              changed = true;
            }
            return changed ? next : current;
          });
        }}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        selectionOnDrag={false}
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => {
          onSelect({ kind: node.type === "process" ? "process" : "vertex", id: node.id });
        }}
        onEdgeClick={(_, edge) => onSelect({ kind: "edge", id: edge.id })}
        onPaneClick={() => onSelect(null)}
      >
        <ViewportPortal>
          <svg
            className="fan-guides"
            viewBox={`${minX} ${minY} ${size} ${size}`}
            style={{ position: "absolute", left: minX, top: minY, width: size, height: size }}
          >
            {layout.arcs.map((radius) => (
              <path
                key={radius}
                d={arcPath(layout.center.x, layout.center.y, radius, layout.fanStart, layout.fanEnd)}
              />
            ))}
            {layout.sectors.slice(1).map((sector) => {
              const inner = layout.arcs[0] ?? 0;
              const x1 = layout.center.x + inner * Math.cos(sector.start);
              const y1 = layout.center.y + inner * Math.sin(sector.start);
              const x2 = layout.center.x + outer * Math.cos(sector.start);
              const y2 = layout.center.y + outer * Math.sin(sector.start);
              return <line key={sector.goalId} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </svg>
        </ViewportPortal>
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <button type="button" className="reset-view" onClick={onReset}>
        К общему виду
      </button>
    </div>
  );
}

export { edgeEnds };
