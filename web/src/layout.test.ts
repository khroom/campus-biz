import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutFan } from "./layout";
import { isFinalGoal, type Graph } from "./model";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const graph = JSON.parse(readFileSync(resolve(root, "web/public/graph.json"), "utf8")) as Graph;

function radius(point: { x: number; y: number }): number {
  return Math.hypot(point.x, point.y);
}

describe("веер", () => {
  const layout = layoutFan(graph);
  const finals = new Set(graph.vertices.filter(isFinalGoal).map((vertex) => vertex.id));

  it("держит конечные цели ближе к центру, чем прототип и ресурсы", () => {
    const finalRadius = Math.max(
      ...[...finals].map((id) => radius(layout.positions.get(id)!)),
    );
    expect(radius(layout.positions.get("D05")!)).toBeGreaterThan(finalRadius);
    expect(radius(layout.positions.get("R01")!)).toBeGreaterThan(radius(layout.positions.get("D05")!));
  });

  it("ставит обычный вход дальше ромба, а выход ближе", () => {
    for (const process of graph.processes) {
      const processRadius = radius(layout.positions.get(process.id)!);
      for (const output of process.outputs) {
        expect(radius(layout.positions.get(output)!)).toBeLessThan(processRadius - 30);
      }
      for (const input of process.inputs) {
        if (finals.has(input)) {
          expect(processRadius).toBeGreaterThan(radius(layout.positions.get(input)!) + 30);
        } else {
          expect(radius(layout.positions.get(input)!)).toBeGreaterThan(processRadius + 30);
        }
      }
    }
  });
});
