"""Свойства проектного пути, отделённого от карьерного трека."""

import json
from pathlib import Path

from navigator.load import load_graph

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"

# Конечные результаты проекта. Стажировка, найм и зарплата сюда не входят.
PROJECT_FINALS = {"D14", "D18", "D20", "D27", "D41"}
CAREER_FINALS = {"D30", "D31", "D32"}


def closure(graph: dict, goal_id: str) -> set[str]:
    producers: dict[str, list[dict]] = {}
    for process in graph["processes"]:
        for output in process["outputs"]:
            producers.setdefault(output, []).append(process)
    seen = {goal_id}
    stack = [goal_id]
    while stack:
        vertex_id = stack.pop()
        for process in producers.get(vertex_id, []):
            seen.add(process["id"])
            for incoming in process["inputs"]:
                if incoming not in seen:
                    seen.add(incoming)
                    stack.append(incoming)
    return seen


def test_project_finals_are_outcomes_and_career_is_separate():
    graph = load_graph(SOURCE, "MVP")
    by_id = {item["id"]: item for item in graph["vertices"]}
    outcome_types = {
        "экономический результат",
        "финансовый результат",
        "профессиональный результат",
        "организационно-правовой результат",
    }
    finals = {item["id"] for item in graph["vertices"] if item["type"] in outcome_types}
    assert finals == PROJECT_FINALS | CAREER_FINALS
    assert all(by_id[item_id]["id"].startswith("D") for item_id in PROJECT_FINALS)


def test_sale_trajectory_stays_on_the_project():
    graph = load_graph(SOURCE, "MVP")
    reached = closure(graph, "D20")
    assert {"D05", "D18", "D02"} <= reached
    assert CAREER_FINALS.isdisjoint(reached)
    assert "R03" not in reached


def test_grant_trajectory_does_not_require_employment():
    graph = load_graph(SOURCE, "MVP")
    reached = closure(graph, "D14")
    assert "D13" in reached
    assert CAREER_FINALS.isdisjoint(reached)


def test_concept_has_more_than_one_producer():
    graph = load_graph(SOURCE, "MVP")
    producers = [
        process["id"]
        for process in graph["processes"]
        if "D02" in process["outputs"]
    ]
    assert len(producers) > 1


def test_every_process_input_is_necessary_set_not_a_single_edge():
    graph = load_graph(SOURCE, "MVP")
    assert all(len(process["inputs"]) >= 1 and len(process["outputs"]) >= 1 for process in graph["processes"])
    shared = [
        process
        for process in graph["processes"]
        if len(process["inputs"]) > 1 and set(process["outputs"]) & PROJECT_FINALS
    ]
    assert shared


def test_published_graph_matches_registries():
    graph = load_graph(SOURCE, "MVP")
    published = json.loads((ROOT / "web" / "public" / "graph.json").read_text(encoding="utf-8"))
    assert published == graph
