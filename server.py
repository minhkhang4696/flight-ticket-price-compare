"""HTTP server for the Flight Route Price Comparison web app."""

from __future__ import annotations

import json
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import data_store
import live_providers

STATIC_DIR = Path(__file__).parent / "static"


class FlightCompareHandler(BaseHTTPRequestHandler):
    """Serves static frontend assets and JSON REST APIs."""

    server_version = "FlightCompare/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Keep terminal output concise
        print(f"[{self.log_date_time_string()}] {format % args}")

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return

        if path == "/api/airports":
            self._send_json(HTTPStatus.OK, {"airports": data_store.AIRPORTS})
            return

        if path == "/api/settings":
            self._send_json(HTTPStatus.OK, {"settings": live_providers.get_public_config()})
            return

        if path == "/api/routes":
            qs = parse_qs(parsed.query)
            selected_date = qs.get("date", [None])[0]
            chart_month = qs.get("month", [None])[0]
            data = data_store.load_data()
            summaries = [
                data_store.summarize_route(r, selected_date=selected_date, chart_month=chart_month)
                for r in data["routes"]
            ]
            self._send_json(HTTPStatus.OK, {"routes": summaries})
            return

        if path == "/api/compare":
            qs = parse_qs(parsed.query)
            route_ids_raw = qs.get("route_ids", [""])[0]
            route_ids = [rid.strip() for rid in route_ids_raw.split(",") if rid.strip()]
            selected_date = qs.get("date", [None])[0]
            direct_only = qs.get("direct_only", ["false"])[0].lower() == "true"
            max_price_str = qs.get("max_price", [""])[0]
            max_price = int(max_price_str) if max_price_str.isdigit() else None

            data = data_store.load_data()
            routes = data["routes"]
            if route_ids:
                routes = [r for r in routes if r["id"] in route_ids]
            else:
                routes = [r for r in routes if r.get("pinned")]

            compared: list[dict[str, Any]] = []
            for r in routes:
                summary = data_store.summarize_route(r, selected_date=selected_date)
                quotes = summary["quotes_on_date"]
                if direct_only:
                    quotes = [q for q in quotes if q["stops"] == 0]
                if max_price is not None:
                    quotes = [q for q in quotes if q["price_vnd"] <= max_price]
                summary["quotes_on_date"] = quotes
                summary["cheapest_filtered"] = min(quotes, key=lambda q: q["price_vnd"]) if quotes else None
                compared.append(summary)

            compared.sort(
                key=lambda item: (
                    item["cheapest_filtered"]["price_vnd"]
                    if item["cheapest_filtered"]
                    else float("inf")
                )
            )
            self._send_json(HTTPStatus.OK, {"compared": compared})
            return

        self._serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/routes":
            try:
                body = self._read_json_body()
                created = data_store.add_route(body)
                self._send_json(HTTPStatus.CREATED, {"route": created})
            except ValueError as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            except Exception as exc:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
            return

        if path == "/api/settings":
            try:
                body = self._read_json_body()
                live_providers.save_config(body)
                self._send_json(HTTPStatus.OK, {"settings": live_providers.get_public_config()})
            except Exception as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        if path.startswith("/api/routes/") and path.endswith("/refresh"):
            route_id = path[len("/api/routes/") : -len("/refresh")].strip("/")
            qs = parse_qs(parsed.query)
            target_date = qs.get("date", [None])[0]
            updated = data_store.refresh_route_prices(route_id, target_date=target_date)
            if updated is None:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy route."})
                return
            self._send_json(HTTPStatus.OK, {"route": updated})
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found"})

    def do_PATCH(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/routes/"):
            route_id = path[len("/api/routes/") :].strip("/")
            try:
                body = self._read_json_body()
                updated = data_store.update_route(route_id, body)
                if updated is None:
                    self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy route."})
                    return
                self._send_json(HTTPStatus.OK, {"route": updated})
            except Exception as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found"})

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/routes/"):
            route_id = path[len("/api/routes/") :].strip("/")
            if data_store.delete_route(route_id):
                self._send_json(HTTPStatus.OK, {"deleted": route_id})
            else:
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy route."})
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "Endpoint not found"})

    def _serve_static(self, req_path: str) -> None:
        rel = "index.html" if req_path in ("", "/") else req_path.lstrip("/")
        target = (STATIC_DIR / rel).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.is_file():
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "File not found"})
            return

        mime, _ = mimetypes.guess_type(str(target))
        content = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)


def run_server(host: str = "0.0.0.0", port: int = 8080) -> None:
    data_store.load_data()
    server = ThreadingHTTPServer((host, port), FlightCompareHandler)
    print(f"Flight Price Compare server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8080"))
    run_server(host=host, port=port)
