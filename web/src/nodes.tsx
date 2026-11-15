import { Handle, Position, type Node, type NodeProps, useStore } from "@xyflow/react";
import { Coins, Flag, Globe, KeyRound, Landmark, type LucideIcon } from "lucide-react";
import type { Role } from "./model";

export type VertexData = {
  name: string;
  role: Role;
  dimmed: boolean;
  picked: boolean;
};

export type ProcessData = {
  name: string;
  dimmed: boolean;
  picked: boolean;
  alternative: boolean;
};

type VertexNodeType = Node<VertexData, "vertex">;
type ProcessNodeType = Node<ProcessData, "process">;

const ICONS: Record<Role, LucideIcon> = {
  resource: Landmark,
  external: Globe,
  condition: KeyRound,
  intermediate: Flag,
  outcome: Coins,
};

function useShowDetail(picked: boolean): boolean {
  const zoom = useStore((state) => state.transform[2]);
  return picked || zoom >= 1.15;
}

function Handles() {
  const style = { left: "50%", top: "50%", opacity: 0, pointerEvents: "none" as const };
  const sides = [Position.Top, Position.Right, Position.Bottom, Position.Left];
  return (
    <>
      {sides.map((side) => (
        <Handle key={`in-${side}`} id={`in-${side}`} type="target" position={side} style={style} />
      ))}
      {sides.map((side) => (
        <Handle key={`out-${side}`} id={`out-${side}`} type="source" position={side} style={style} />
      ))}
    </>
  );
}

export function VertexNode({ data }: NodeProps<VertexNodeType>) {
  const Icon = ICONS[data.role];
  const showName = useShowDetail(data.picked);
  return (
    <div className={`vertex ${data.role} ${data.picked ? "is-picked" : ""} ${data.dimmed ? "is-dim" : ""}`}>
      <Handles />
      <div className="bubble" aria-label={data.name} title={data.name}>
        <Icon size={24} strokeWidth={1.75} />
      </div>
      {showName && <span className="node-label">{data.name}</span>}
    </div>
  );
}

export function ProcessNode({ data }: NodeProps<ProcessNodeType>) {
  const showName = useShowDetail(data.picked || data.alternative);
  return (
    <div
      className={`process ${data.picked ? "is-picked" : ""} ${data.dimmed ? "is-dim" : ""} ${data.alternative ? "is-alt" : ""}`}
    >
      <Handles />
      <div className="diamond" aria-label={data.name} title={data.name} />
      {data.alternative && <span className="alt-mark">или</span>}
      {showName && <span className="node-label process-label">процесс</span>}
    </div>
  );
}

export const nodeTypes = {
  vertex: VertexNode,
  process: ProcessNode,
};
