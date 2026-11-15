"""Выгрузка среза модели в JSON для веб-клиента."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from navigator.load import load_graph


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Выгрузить граф навигатора в JSON")
    parser.add_argument("--source", type=Path, default=Path("source"))
    parser.add_argument("--stage", default="MVP")
    parser.add_argument("--out", type=Path, default=Path("web/public/graph.json"))
    args = parser.parse_args(argv)
    graph = load_graph(args.source, args.stage)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{args.out}: {len(graph['vertices'])} вершин, {len(graph['processes'])} процессов")


if __name__ == "__main__":
    main()
