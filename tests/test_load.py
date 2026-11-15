from pathlib import Path

import pytest

from navigator.load import ModelError, load_graph

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"


def test_mvp_matches_stage_registry():
    graph = load_graph(SOURCE, "MVP")
    assert len(graph["vertices"]) == 39
    assert len(graph["processes"]) == 20
    assert sum(len(item["inputs"]) for item in graph["processes"]) == 59
    assert sum(len(item["outputs"]) for item in graph["processes"]) == 28


def test_ids_are_unique_and_processes_have_ends():
    graph = load_graph(SOURCE, "Развитие")
    vertex_ids = [item["id"] for item in graph["vertices"]]
    process_ids = [item["id"] for item in graph["processes"]]
    assert len(vertex_ids) == len(set(vertex_ids))
    assert len(process_ids) == len(set(process_ids))
    assert vertex_ids
    assert all(item["inputs"] and item["outputs"] for item in graph["processes"])


@pytest.mark.parametrize("stage", ["MVP", "Базовый", "Развитие"])
def test_each_stage_loads_with_the_same_code(stage):
    graph = load_graph(SOURCE, stage)
    assert graph["stage"] == stage
    assert graph["vertices"]
    assert graph["processes"]


def test_text_mismatch_is_an_error(tmp_path: Path):
    (tmp_path / "Вершины.csv").write_text(
        "Этап,ID,Вершина,Тип,Вид / свойства,Условия,Источник\n"
        "MVP,S01,Статус,исходное условие,субъект,условие,\n"
        "MVP,D01,Итог,промежуточный результат,информационный,условие,\n",
        encoding="utf-8",
    )
    (tmp_path / "Гиперрёбра.csv").write_text(
        "Этап,ID,Процесс,Входы AND,Выходы,Guard / условие запуска,Статус подтверждения,Источник\n"
        "MVP,H01,Шаг,D01,D01,guard,статус,\n",
        encoding="utf-8",
    )
    (tmp_path / "Этапы.csv").write_text(
        "Этап,Вершины,Гиперрёбра,Входные инцидентности,Выходные инцидентности\n"
        "MVP,2,1,1,1\n",
        encoding="utf-8",
    )
    (tmp_path / "MVP_ВХ.csv").write_text("ID,H01\nS01,1\nD01,0\n", encoding="utf-8")
    (tmp_path / "MVP_ВЫХ.csv").write_text("ID,S01,D01\nH01,0,1\n", encoding="utf-8")

    with pytest.raises(ModelError, match="H01"):
        load_graph(tmp_path, "MVP")
