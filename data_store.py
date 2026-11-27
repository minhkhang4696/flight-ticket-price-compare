"""Data store and flight route pricing logic (SerpApi/Amadeus live-only, no demo quotes)."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import live_providers
from airports_data import WORLD_AIRPORTS

DATA_DIR = Path(__file__).parent / "data"
DATA_FILE = DATA_DIR / "flights.json"

AIRPORTS = WORLD_AIRPORTS

DEFAULT_ROUTE_SPECS = [
    {
        "id": "sgn-han",
        "origin": "SGN",
        "destination": "HAN",
        "trip_type": "one_way",
        "cabin": "Economy",
        "target_price": 1200000,
        "pinned": True,
    },
    {
        "id": "han-dad",
        "origin": "HAN",
        "destination": "DAD",
        "trip_type": "one_way",
        "cabin": "Economy",
        "target_price": 900000,
        "pinned": True,
    },
    {
        "id": "sgn-pqc",
        "origin": "SGN",
        "destination": "PQC",
        "trip_type": "one_way",
        "cabin": "Economy",
        "target_price": 800000,
        "pinned": True,
    },
    {
        "id": "sgn-sin",
        "origin": "SGN",
        "destination": "SIN",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "target_price": 2600000,
        "pinned": True,
    },
    {
        "id": "sgn-bkk",
        "origin": "SGN",
        "destination": "BKK",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "target_price": 2200000,
        "pinned": False,
    },
    {
        "id": "han-icn",
        "origin": "HAN",
        "destination": "ICN",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "target_price": 5800000,
        "pinned": False,
    },
    {
        "id": "sgn-nrt",
        "origin": "SGN",
        "destination": "NRT",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "target_price": 7800000,
        "pinned": False,
    },
]


def _build_initial_data() -> dict[str, Any]:
    now = datetime.now().isoformat(timespec="seconds")
    routes: list[dict[str, Any]] = []
    for spec in DEFAULT_ROUTE_SPECS:
        routes.append(
            {
                **spec,
                "data_source": "none",
                "live_error": None,
                "created_at": now,
                "updated_at": now,
                "quotes_by_date": {},
            }
        )
    return {"routes": routes}


def _strip_demo_quotes(data: dict[str, Any]) -> bool:
    """Remove any legacy simulated/non-live quotes from stored routes."""
    changed = False
    for route in data.get("routes", []):
        qmap = route.get("quotes_by_date") or {}
        cleaned: dict[str, list[dict[str, Any]]] = {}
        for d_str, quotes in qmap.items():
            live_only = [q for q in quotes if q.get("is_live") is True]
            if live_only:
                cleaned[d_str] = live_only
            if len(live_only) != len(quotes):
                changed = True
        if cleaned != qmap:
            route["quotes_by_date"] = cleaned
            changed = True
        if not cleaned and route.get("data_source") == "demo":
            route["data_source"] = "none"
            changed = True
    return changed


def load_data() -> dict[str, Any]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        data = _build_initial_data()
        save_data(data)
        return data
    try:
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        data = _build_initial_data()
        save_data(data)
        return data

    if _strip_demo_quotes(data):
        save_data(data)
    return data


def save_data(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_file = DATA_FILE.with_suffix(".tmp")
    with tmp_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, DATA_FILE)


def summarize_route(
    route: dict[str, Any],
    selected_date: str | None = None,
    chart_month: str | None = None,
) -> dict[str, Any]:
    """Return route metadata plus stats computed strictly from live fetched quotes."""
    quotes_by_date: dict[str, list[dict[str, Any]]] = route.get("quotes_by_date", {})
    all_dates = sorted(quotes_by_date.keys())
    best_overall: dict[str, Any] | None = None
    best_date: str | None = None
    all_prices: list[int] = []

    for d_str in all_dates:
        day_quotes = quotes_by_date.get(d_str, [])
        if not day_quotes:
            continue
        cheapest_day = min(day_quotes, key=lambda q: q["price_vnd"])
        for q in day_quotes:
            all_prices.append(q["price_vnd"])
        if best_overall is None or cheapest_day["price_vnd"] < best_overall["price_vnd"]:
            best_overall = cheapest_day
            best_date = d_str

    active_date = selected_date or (all_dates[0] if all_dates else date.today().isoformat())
    active_quotes = quotes_by_date.get(active_date, [])
    cheapest_on_date = min(active_quotes, key=lambda q: q["price_vnd"]) if active_quotes else None

    # Build chart window strictly from fetched live quotes
    window_daily_min: list[dict[str, Any]] = []
    try:
        today_dt = date.today()
        if chart_month and len(chart_month) == 7 and chart_month[4] == "-":
            year_i, month_i = map(int, chart_month.split("-"))
            month_start = date(year_i, month_i, 1)
            next_month = date(year_i + 1, 1, 1) if month_i == 12 else date(year_i, month_i + 1, 1)
            win_start = max(today_dt, month_start)
            win_end = next_month - timedelta(days=1)
        else:
            anchor_dt = date.fromisoformat(active_date)
            win_start = max(today_dt, anchor_dt - timedelta(days=15))
            win_end = anchor_dt + timedelta(days=15)

        for d_str in all_dates:
            d_dt = date.fromisoformat(d_str)
            if win_start <= d_dt <= win_end:
                day_q = quotes_by_date.get(d_str, [])
                if day_q:
                    cheapest_w = min(day_q, key=lambda q: q["price_vnd"])
                    window_daily_min.append(
                        {
                            "date": d_str,
                            "min_price": cheapest_w["price_vnd"],
                            "airline_name": cheapest_w["airline_name"],
                            "airline_code": cheapest_w["airline_code"],
                        }
                    )
    except ValueError:
        window_daily_min = []

    avg_price = int(sum(all_prices) / len(all_prices)) if all_prices else 0
    max_price = max(all_prices) if all_prices else 0
    min_price = best_overall["price_vnd"] if best_overall else 0
    target_price = route.get("target_price")
    alert_triggered = bool(target_price and min_price > 0 and min_price <= target_price)

    return {
        "id": route["id"],
        "origin": route["origin"],
        "destination": route["destination"],
        "origin_info": AIRPORTS.get(
            route["origin"], {"city": route["origin"], "country": "Quốc tế", "name": f"Sân bay {route['origin']}"}
        ),
        "destination_info": AIRPORTS.get(
            route["destination"],
            {"city": route["destination"], "country": "Quốc tế", "name": f"Sân bay {route['destination']}"},
        ),
        "trip_type": route["trip_type"],
        "cabin": route["cabin"],
        "pinned": route.get("pinned", False),
        "target_price": target_price,
        "alert_triggered": alert_triggered,
        "data_source": route.get("data_source", "none"),
        "live_error": route.get("live_error"),
        "updated_at": route.get("updated_at"),
        "cheapest_overall": best_overall,
        "cheapest_date": best_date,
        "cheapest_on_date": cheapest_on_date,
        "active_date": active_date,
        "avg_price": avg_price,
        "max_price": max_price,
        "savings_vs_avg": max(0, avg_price - min_price),
        "daily_min": window_daily_min,
        "quotes_on_date": active_quotes,
    }


def add_route(payload: dict[str, Any]) -> dict[str, Any]:
    origin = str(payload.get("origin", "")).strip().upper()
    destination = str(payload.get("destination", "")).strip().upper()
    if not re.fullmatch(r"[A-Z]{3}", origin) or not re.fullmatch(r"[A-Z]{3}", destination):
        raise ValueError("Mã sân bay đi/đến phải là mã IATA gồm đúng 3 chữ cái (VD: SGN, JFK, LHR).")
    if origin == destination:
        raise ValueError("Điểm đi và điểm đến phải khác nhau.")

    trip_type = payload.get("trip_type", "one_way")
    if trip_type not in ("one_way", "round_trip"):
        trip_type = "one_way"

    cabin = payload.get("cabin", "Economy")
    if cabin not in ("Economy", "Business"):
        cabin = "Economy"

    target_price = payload.get("target_price")
    target_price = int(target_price) if target_price else None

    route_id = f"{origin.lower()}-{destination.lower()}-{uuid.uuid4().hex[:6]}"
    now = datetime.now().isoformat(timespec="seconds")

    new_route = {
        "id": route_id,
        "origin": origin,
        "destination": destination,
        "trip_type": trip_type,
        "cabin": cabin,
        "target_price": target_price,
        "pinned": True,
        "data_source": "none",
        "live_error": None,
        "created_at": now,
        "updated_at": now,
        "quotes_by_date": {},
    }

    data = load_data()
    data["routes"].insert(0, new_route)
    save_data(data)
    return summarize_route(new_route)


def delete_route(route_id: str) -> bool:
    data = load_data()
    before = len(data["routes"])
    data["routes"] = [r for r in data["routes"] if r["id"] != route_id]
    if len(data["routes"]) == before:
        return False
    save_data(data)
    return True


def update_route(route_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    data = load_data()
    for route in data["routes"]:
        if route["id"] == route_id:
            if "pinned" in payload:
                route["pinned"] = bool(payload["pinned"])
            if "target_price" in payload:
                tp = payload["target_price"]
                route["target_price"] = int(tp) if tp else None
            route["updated_at"] = datetime.now().isoformat(timespec="seconds")
            save_data(data)
            return summarize_route(route)
    return None


def refresh_route_prices(route_id: str, target_date: str | None = None) -> dict[str, Any] | None:
    data = load_data()
    for route in data["routes"]:
        if route["id"] == route_id:
            fetch_date = target_date or date.today().isoformat()

            live_quotes, source_used, err_msg = live_providers.fetch_live_quotes_for_date(
                route_id=route["id"],
                origin=route["origin"],
                destination=route["destination"],
                outbound_date=fetch_date,
                trip_type=route.get("trip_type", "one_way"),
                cabin=route.get("cabin", "Economy"),
            )

            if live_quotes is not None and err_msg is None:
                quotes_by_date = route.get("quotes_by_date") or {}
                quotes_by_date[fetch_date] = live_quotes
                route["quotes_by_date"] = quotes_by_date
                route["data_source"] = source_used
                route["live_error"] = None
            else:
                route["live_error"] = err_msg or "Chưa cấu hình API Key SerpApi."

            route["updated_at"] = datetime.now().isoformat(timespec="seconds")
            save_data(data)
            return summarize_route(route, selected_date=fetch_date)
    return None
