import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  backwardClosure,
  hiddenIds,
  indexGraph,
  isFinalGoal,
  linksOf,
  neighborhood,
  type Graph,
} from "./model";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const graph = JSON.parse(readFileSync(resolve(root, "web/public/graph.json"), "utf8")) as Graph;

describe("проектный путь на карте", () => {
  const index = indexGraph(graph);

  it("показывает всю траекторию первой продажи и не тянет найм", () => {
    const reached = backwardClosure(index, "D20");
    expect(reached.has("D05")).toBe(true);
    expect(reached.has("D18")).toBe(true);
    expect(reached.has("H21") || reached.has("H56")).toBe(true);
    expect(reached.has("D31")).toBe(false);
    expect(reached.has("D32")).toBe(false);
  });

  it("держит у концепции больше одного способа получения", () => {
    expect((index.producers.get("D02") ?? []).length).toBeGreaterThan(1);
  });

  it("раскрывает соседство процесса вместе с его концами", () => {
    const around = neighborhood(index, ["H02"], 1);
    const process = index.processes.get("H02");
    expect(process).toBeTruthy();
    for (const id of [...process!.inputs, ...process!.outputs]) expect(around.has(id)).toBe(true);
  });

  it("прячет ресурсы, когда фильтр оставляет только результаты", () => {
    const hidden = hiddenIds(graph, ["D"], "");
    expect(hidden.has("R01")).toBe(true);
    expect(hidden.has("D20")).toBe(false);
  });

  it("отделяет конечные проектные цели от промежуточных", () => {
    const finals = graph.vertices.filter(isFinalGoal).map((vertex) => vertex.id);
    expect(finals).toEqual(expect.arrayContaining(["D14", "D20", "D41"]));
    expect(finals).not.toContain("D02");
    expect(finals).not.toContain("D05");
  });

  it("достаёт официальные ссылки из источника", () => {
    const exchange = graph.vertices.find((vertex) => vertex.id === "R01");
    expect(linksOf(exchange?.source ?? "").some((link) => link.includes("fa.ru"))).toBe(true);
  });
});
