"""Нагрузочная проверка чтения модели и отдачи карты."""

from __future__ import annotations

import json
import statistics
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from navigator.load import load_graph

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "source"
GRAPH = ROOT / "web" / "public" / "graph.json"


def test_registry_load_stays_fast_under_repetition():
    started = time.perf_counter()
    samples = []
    for _ in range(40):
        tick = time.perf_counter()
        graph = load_graph(SOURCE, "MVP")
        samples.append(time.perf_counter() - tick)
        assert len(graph["vertices"]) == 39
    elapsed = time.perf_counter() - started
    assert elapsed < 8
    assert statistics.quantiles(samples, n=20)[18] < 0.5


def test_concurrent_readers_receive_the_map():
    payload = GRAPH.read_bytes()

    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = payload if self.path.startswith("/graph.json") else b"ok"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):  # noqa: A003
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}/graph.json"

    def once() -> float:
        tick = time.perf_counter()
        with urllib.request.urlopen(url, timeout=5) as response:
            body = response.read()
            assert response.status == 200
        parsed = json.loads(body)
        assert parsed["stage"] == "MVP"
        assert len(parsed["vertices"]) == 39
        return time.perf_counter() - tick

    try:
        with ThreadPoolExecutor(max_workers=20) as pool:
            samples = list(pool.map(lambda _: once(), range(200)))
    finally:
        server.shutdown()

    assert len(samples) == 200
    assert statistics.quantiles(samples, n=20)[18] < 1.0
