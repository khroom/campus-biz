"""Разбор реестров вершин, гиперрёбер и матриц инцидентности."""

from __future__ import annotations

import csv
import io
from pathlib import Path


class ModelError(Exception):
    """Модель не сходится с реестрами или матрицами."""


STAGE_ORDER = ("MVP", "Базовый", "Развитие")

MATRIX_FILES = {
    "MVP": ("MVP_ВХ.csv", "MVP_ВЫХ.csv"),
    "Базовый": ("БАЗА_ВХ.csv", "БАЗА_ВЫХ.csv"),
    "Развитие": ("РАЗВИТИЕ_ВХ.csv", "РАЗВИТИЕ_ВЫХ.csv"),
}


def load_graph(source_dir: Path | str, stage: str = "MVP") -> dict:
    """Собрать срез модели. Связи берутся из матриц, текст входов и выходов сверяется с ними."""
    source = Path(source_dir)
    if stage not in STAGE_ORDER:
        raise ModelError(f"Неизвестный этап: {stage}")

    vertices = _read_table(source / "Вершины.csv")
    processes = _read_table(source / "Гиперрёбра.csv")
    stages = _read_table(source / "Этапы.csv")
    _require_unique(vertices, "ID", "вершин")
    _require_unique(processes, "ID", "процессов")

    allowed = set(STAGE_ORDER[: STAGE_ORDER.index(stage) + 1])
    vertex_rows = [row for row in vertices if row["Этап"] in allowed]
    process_rows = [row for row in processes if row["Этап"] in allowed]
    vertex_by_id = {row["ID"]: row for row in vertex_rows}
    process_by_id = {row["ID"]: row for row in process_rows}

    in_name, out_name = MATRIX_FILES[stage]
    in_cols, in_rows = _read_matrix(source / in_name)
    out_cols, out_rows = _read_matrix(source / out_name)

    matrix_vertices = set(in_rows)
    matrix_processes = set(in_cols)
    if set(out_rows) != matrix_processes:
        raise ModelError("Строки выходной матрицы не совпадают со столбцами входной.")
    if set(out_cols) != matrix_vertices:
        raise ModelError("Столбцы выходной матрицы не совпадают со строками входной.")
    if matrix_vertices != set(vertex_by_id):
        missing = sorted(set(vertex_by_id) - matrix_vertices)
        extra = sorted(matrix_vertices - set(vertex_by_id))
        raise ModelError(
            f"Вершины этапа {stage} не совпадают с матрицей. Нет в матрице: {missing}. Лишние: {extra}."
        )
    if matrix_processes != set(process_by_id):
        missing = sorted(set(process_by_id) - matrix_processes)
        extra = sorted(matrix_processes - set(process_by_id))
        raise ModelError(
            f"Процессы этапа {stage} не совпадают с матрицей. Нет в матрице: {missing}. Лишние: {extra}."
        )

    inputs_of = {pid: [] for pid in in_cols}
    for vid, flags in in_rows.items():
        for pid in in_cols:
            if flags.get(pid):
                inputs_of[pid].append(vid)

    outputs_of = {pid: [] for pid in out_rows}
    for pid, flags in out_rows.items():
        for vid in out_cols:
            if flags.get(vid):
                outputs_of[pid].append(vid)

    built_processes = []
    input_ones = 0
    output_ones = 0
    for row in process_rows:
        pid = row["ID"]
        text_inputs = _parse_ids(row["Входы AND"])
        text_outputs = _parse_ids(row["Выходы"])
        matrix_inputs = inputs_of[pid]
        matrix_outputs = outputs_of[pid]
        if set(text_inputs) != set(matrix_inputs):
            raise ModelError(
                f"{pid}: входы в реестре {text_inputs} не совпадают с матрицей {matrix_inputs}."
            )
        if set(text_outputs) != set(matrix_outputs):
            raise ModelError(
                f"{pid}: выходы в реестре {text_outputs} не совпадают с матрицей {matrix_outputs}."
            )
        if not matrix_inputs or not matrix_outputs:
            raise ModelError(f"{pid}: у процесса должен быть хотя бы один вход и один выход.")
        input_ones += len(matrix_inputs)
        output_ones += len(matrix_outputs)
        built_processes.append(
            {
                "id": pid,
                "stage": row["Этап"],
                "name": row["Процесс"],
                "guard": row["Guard / условие запуска"],
                "confirmationStatus": row["Статус подтверждения"],
                "source": row["Источник"],
                "inputs": text_inputs,
                "outputs": text_outputs,
            }
        )

    expected = next(row for row in stages if row["Этап"] == stage)
    counts = {
        "Вершины": len(vertex_rows),
        "Гиперрёбра": len(process_rows),
        "Входные инцидентности": input_ones,
        "Выходные инцидентности": output_ones,
    }
    for field, actual in counts.items():
        wanted = int(expected[field])
        if actual != wanted:
            raise ModelError(f"{stage}: {field} = {actual}, в Этапы.csv указано {wanted}.")

    return {
        "stage": stage,
        "vertices": [
            {
                "id": row["ID"],
                "stage": row["Этап"],
                "name": row["Вершина"],
                "type": row["Тип"],
                "kind": row["Вид / свойства"],
                "conditions": row["Условия"],
                "source": row["Источник"],
            }
            for row in vertex_rows
        ],
        "processes": built_processes,
    }


def _read_table(path: Path) -> list[dict[str, str]]:
    text = _read_text(path)
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ModelError(f"Пустой файл: {path.name}")
    rows = []
    for raw in reader:
        row = {(key or "").strip(): (value or "").strip() for key, value in raw.items()}
        if any(row.values()):
            rows.append(row)
    return rows


def _read_matrix(path: Path) -> tuple[list[str], dict[str, dict[str, bool]]]:
    text = _read_text(path)
    grid = list(csv.reader(io.StringIO(text)))
    if not grid:
        raise ModelError(f"Пустая матрица: {path.name}")
    columns = [cell.strip() for cell in grid[0][1:]]
    if not columns or any(not cell for cell in columns):
        raise ModelError(f"В матрице {path.name} пустой заголовок столбца.")
    if len(columns) != len(set(columns)):
        raise ModelError(f"В матрице {path.name} повторяются столбцы.")
    rows: dict[str, dict[str, bool]] = {}
    for line in grid[1:]:
        if not line or not line[0].strip():
            continue
        row_id = line[0].strip()
        if row_id in rows:
            raise ModelError(f"В матрице {path.name} повторяется строка {row_id}.")
        flags: dict[str, bool] = {}
        for index, column in enumerate(columns):
            cell = line[index + 1].strip() if index + 1 < len(line) else "0"
            if cell == "1":
                flags[column] = True
            elif cell not in ("0", ""):
                raise ModelError(f"{path.name}: ячейка {row_id}×{column} = {cell!r}.")
        rows[row_id] = flags
    return columns, rows


def _read_text(path: Path) -> str:
    if not path.exists():
        raise ModelError(f"Нет файла {path.name}")
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        header = text.splitlines()[0] if text else ""
        if "ID" in header or "Этап" in header:
            return text
    raise ModelError(f"Не удалось прочитать {path.name}")


def _require_unique(rows: list[dict[str, str]], field: str, title: str) -> None:
    seen: set[str] = set()
    for row in rows:
        value = row.get(field, "")
        if not value:
            raise ModelError(f"Пустой идентификатор в реестре {title}.")
        if value in seen:
            raise ModelError(f"Повторяющийся идентификатор {title}: {value}.")
        seen.add(value)


def _parse_ids(cell: str) -> list[str]:
    found: list[str] = []
    for part in cell.split(","):
        item = part.strip()
        if item and item not in found:
            found.append(item)
    return found
