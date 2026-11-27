"""Data store and flight route pricing logic for Flight Price Compare."""

from __future__ import annotations

import json
import os
import random
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

AIRLINES_DOMESTIC = [
    {"code": "VJ", "name": "VietJet Air", "baggage": "7kg xách tay", "base_mult": 0.86},
    {"code": "VN", "name": "Vietnam Airlines", "baggage": "23kg ký gửi + 12kg", "base_mult": 1.18},
    {"code": "QH", "name": "Bamboo Airways", "baggage": "20kg ký gửi + 7kg", "base_mult": 1.05},
    {"code": "VU", "name": "Vietravel Airlines", "baggage": "7kg xách tay", "base_mult": 0.91},
]

AIRLINES_INTL = [
    {"code": "VJ", "name": "VietJet Air", "baggage": "7kg xách tay", "base_mult": 0.82},
    {"code": "VN", "name": "Vietnam Airlines", "baggage": "23kg ký gửi + 12kg", "base_mult": 1.22},
    {"code": "SQ", "name": "Singapore Airlines", "baggage": "25kg ký gửi + 7kg", "base_mult": 1.38},
    {"code": "AK", "name": "AirAsia", "baggage": "7kg xách tay", "base_mult": 0.85},
    {"code": "KE", "name": "Korean Air", "baggage": "23kg ký gửi + 10kg", "base_mult": 1.34},
    {"code": "NH", "name": "ANA", "baggage": "2x23kg ký gửi", "base_mult": 1.45},
]

PROVIDERS = ["Trang chủ hãng", "Traveloka", "Skyscanner", "Booking.com", "Momo Travel"]

DEFAULT_ROUTE_SPECS = [
    {
        "id": "sgn-han",
        "origin": "SGN",
        "destination": "HAN",
        "trip_type": "one_way",
        "cabin": "Economy",
        "base_price": 1350000,
        "duration_min": 130,
        "target_price": 1200000,
        "pinned": True,
    },
    {
        "id": "han-dad",
        "origin": "HAN",
        "destination": "DAD",
        "trip_type": "one_way",
        "cabin": "Economy",
        "base_price": 980000,
        "duration_min": 80,
        "target_price": 900000,
        "pinned": True,
    },
    {
        "id": "sgn-pqc",
        "origin": "SGN",
        "destination": "PQC",
        "trip_type": "one_way",
        "cabin": "Economy",
        "base_price": 890000,
        "duration_min": 65,
        "target_price": 800000,
        "pinned": True,
    },
    {
        "id": "sgn-sin",
        "origin": "SGN",
        "destination": "SIN",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "base_price": 2850000,
        "duration_min": 125,
        "target_price": 2600000,
        "pinned": True,
    },
    {
        "id": "sgn-bkk",
        "origin": "SGN",
        "destination": "BKK",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "base_price": 2450000,
        "duration_min": 95,
        "target_price": 2200000,
        "pinned": False,
    },
    {
        "id": "han-icn",
        "origin": "HAN",
        "destination": "ICN",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "base_price": 6200000,
        "duration_min": 270,
        "target_price": 5800000,
        "pinned": False,
    },
    {
        "id": "sgn-nrt",
        "origin": "SGN",
        "destination": "NRT",
        "trip_type": "round_trip",
        "cabin": "Economy",
        "base_price": 8400000,
        "duration_min": 355,
        "target_price": 7800000,
        "pinned": False,
    },
]


def _is_domestic(origin: str, destination: str) -> bool:
    o_country = AIRPORTS.get(origin, {}).get("country", "")
    d_country = AIRPORTS.get(destination, {}).get("country", "")
    return o_country == "Việt Nam" and d_country == "Việt Nam"


def _round_price(val: float) -> int:
    return int(round(val / 10000) * 10000)


def _generate_quotes_for_route(
    route_id: str,
    origin: str,
    destination: str,
    base_price: int,
    duration_min: int,
    cabin: str,
    start_date: date,
    days: int = 180,
    rng: random.Random | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Generate deterministic-yet-realistic airline/OTA quotes across dates."""
    if rng is None:
        rng = random.Random(hash(route_id) & 0xFFFFFFFF)

    domestic = _is_domestic(origin, destination)
    pool = AIRLINES_DOMESTIC if domestic else AIRLINES_INTL
    cabin_mult = 2.4 if cabin == "Business" else 1.0

    daily_quotes: dict[str, list[dict[str, Any]]] = {}
    departure_slots = ["06:15", "08:40", "11:25", "14:50", "18:10", "21:05"]

    for day_offset in range(days):
        d = start_date + timedelta(days=day_offset)
        d_str = d.isoformat()
        # Weekend / Friday surge
        weekday = d.weekday()  # 0=Mon .. 6=Sun
        day_mult = 1.15 if weekday in (4, 6) else (1.08 if weekday == 5 else 0.94)
        # Mid-week dip
        if weekday in (1, 2):
            day_mult *= 0.92

        quotes: list[dict[str, Any]] = []
        selected_airlines = pool if domestic else rng.sample(pool, k=min(4, len(pool)))
        for idx, airline in enumerate(selected_airlines):
            stops = 0 if (domestic or rng.random() > 0.28) else 1
            extra_duration = 0 if stops == 0 else rng.choice([75, 110, 145])
            dep_time = departure_slots[(idx + day_offset) % len(departure_slots)]
            dep_dt = datetime.combine(d, datetime.strptime(dep_time, "%H:%M").time())
            arr_dt = dep_dt + timedelta(minutes=duration_min + extra_duration)

            noise = rng.uniform(0.90, 1.12)
            stop_discount = 0.88 if stops == 1 else 1.0
            price = _round_price(base_price * cabin_mult * airline["base_mult"] * day_mult * noise * stop_discount)

            provider = PROVIDERS[(idx + day_offset) % len(PROVIDERS)]
            quotes.append(
                {
                    "quote_id": f"{route_id}-{d_str}-{airline['code']}-{idx}",
                    "airline_code": airline["code"],
                    "airline_name": airline["name"],
                    "flight_number": f"{airline['code']}{rng.randint(100, 999)}",
                    "provider": provider,
                    "departure_time": dep_time,
                    "arrival_time": arr_dt.strftime("%H:%M"),
                    "duration_min": duration_min + extra_duration,
                    "stops": stops,
                    "baggage": airline["baggage"],
                    "price_vnd": price,
                    "seats_left": rng.randint(2, 9),
                }
            )
        quotes.sort(key=lambda q: q["price_vnd"])
        daily_quotes[d_str] = quotes

    return daily_quotes


def _build_initial_data() -> dict[str, Any]:
    today = date.today()
    routes: list[dict[str, Any]] = []
    for spec in DEFAULT_ROUTE_SPECS:
        quotes_by_date = _generate_quotes_for_route(
            route_id=spec["id"],
            origin=spec["origin"],
            destination=spec["destination"],
            base_price=spec["base_price"],
            duration_min=spec["duration_min"],
            cabin=spec["cabin"],
            start_date=today,
            days=180,
        )
        routes.append(
            {
                **spec,
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "updated_at": datetime.now().isoformat(timespec="seconds"),
                "quotes_by_date": quotes_by_date,
            }
        )
    return {"routes": routes}


def _ensure_horizon_days(data: dict[str, Any], days: int = 180) -> bool:
    """Ensure every route has quotes for at least `days` from today."""
    today = date.today()
    changed = False
    for route in data.get("routes", []):
        qmap = route.get("quotes_by_date") or {}
        target_dates = [(today + timedelta(days=i)).isoformat() for i in range(days)]
        missing = [d for d in target_dates if d not in qmap]
        if missing:
            generated = _generate_quotes_for_route(
                route_id=route["id"],
                origin=route["origin"],
                destination=route["destination"],
                base_price=route.get("base_price", 1500000),
                duration_min=route.get("duration_min", 120),
                cabin=route.get("cabin", "Economy"),
                start_date=today,
                days=days,
            )
            for d in missing:
                qmap[d] = generated[d]
            route["quotes_by_date"] = qmap
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

    if _ensure_horizon_days(data, days=180):
        save_data(data)
    return data


def save_data(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_file = DATA_FILE.with_suffix(".tmp")
    with tmp_file.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_file, DATA_FILE)


def summarize_route(route: dict[str, Any], selected_date: str | None = None) -> dict[str, Any]:
    """Return route metadata plus cheapest price stats."""
    quotes_by_date: dict[str, list[dict[str, Any]]] = route.get("quotes_by_date", {})
    all_dates = sorted(quotes_by_date.keys())
    best_overall: dict[str, Any] | None = None
    best_date: str | None = None
    daily_min: list[dict[str, Any]] = []
    all_prices: list[int] = []

    for d_str in all_dates:
        day_quotes = quotes_by_date.get(d_str, [])
        if not day_quotes:
            continue
        cheapest_day = min(day_quotes, key=lambda q: q["price_vnd"])
        daily_min.append(
            {
                "date": d_str,
                "min_price": cheapest_day["price_vnd"],
                "airline_name": cheapest_day["airline_name"],
                "airline_code": cheapest_day["airline_code"],
            }
        )
        for q in day_quotes:
            all_prices.append(q["price_vnd"])
        if best_overall is None or cheapest_day["price_vnd"] < best_overall["price_vnd"]:
            best_overall = cheapest_day
            best_date = d_str

    active_date = selected_date if selected_date else (all_dates[0] if all_dates else None)
    if active_date and active_date not in quotes_by_date:
        try:
            target_dt = date.fromisoformat(active_date)
            generated_single = _generate_quotes_for_route(
                route_id=route["id"],
                origin=route["origin"],
                destination=route["destination"],
                base_price=route.get("base_price", 1500000),
                duration_min=route.get("duration_min", 120),
                cabin=route.get("cabin", "Economy"),
                start_date=target_dt,
                days=1,
                rng=random.Random(hash(f"{route['id']}-{active_date}") & 0xFFFFFFFF),
            )
            active_quotes = generated_single.get(active_date, [])
        except ValueError:
            active_date = all_dates[0] if all_dates else None
            active_quotes = quotes_by_date.get(active_date, []) if active_date else []
    else:
        active_quotes = quotes_by_date.get(active_date, []) if active_date else []
    cheapest_on_date = min(active_quotes, key=lambda q: q["price_vnd"]) if active_quotes else None

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
        "data_source": route.get("data_source", "demo"),
        "live_error": route.get("live_error"),
        "updated_at": route.get("updated_at"),
        "cheapest_overall": best_overall,
        "cheapest_date": best_date,
        "cheapest_on_date": cheapest_on_date,
        "active_date": active_date,
        "avg_price": avg_price,
        "max_price": max_price,
        "savings_vs_avg": max(0, avg_price - min_price),
        "daily_min": daily_min,
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

    domestic = _is_domestic(origin, destination)
    default_base = 1250000 if domestic else 4200000
    if trip_type == "round_trip":
        default_base = int(default_base * 1.85)
    base_price = int(payload.get("base_price") or default_base)
    duration_min = int(payload.get("duration_min") or (105 if domestic else 210))
    target_price = payload.get("target_price")
    target_price = int(target_price) if target_price else _round_price(base_price * 0.88)

    route_id = f"{origin.lower()}-{destination.lower()}-{uuid.uuid4().hex[:6]}"
    today = date.today()
    quotes_by_date = _generate_quotes_for_route(
        route_id=route_id,
        origin=origin,
        destination=destination,
        base_price=base_price,
        duration_min=duration_min,
        cabin=cabin,
        start_date=today,
        days=180,
        rng=random.Random(),
    )

    new_route = {
        "id": route_id,
        "origin": origin,
        "destination": destination,
        "trip_type": trip_type,
        "cabin": cabin,
        "base_price": base_price,
        "duration_min": duration_min,
        "target_price": target_price,
        "pinned": True,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "quotes_by_date": quotes_by_date,
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
            today = date.today()
            fetch_date = target_date or today.isoformat()

            live_quotes, source_used, err_msg = live_providers.fetch_live_quotes_for_date(
                route_id=route["id"],
                origin=route["origin"],
                destination=route["destination"],
                outbound_date=fetch_date,
                trip_type=route.get("trip_type", "one_way"),
                cabin=route.get("cabin", "Economy"),
            )

            if live_quotes is not None and len(live_quotes) > 0:
                quotes_by_date = route.get("quotes_by_date") or {}
                quotes_by_date[fetch_date] = live_quotes
                route["quotes_by_date"] = quotes_by_date
                route["data_source"] = source_used
                route["live_error"] = None
            else:
                route["quotes_by_date"] = _generate_quotes_for_route(
                    route_id=route["id"],
                    origin=route["origin"],
                    destination=route["destination"],
                    base_price=route.get("base_price", 1500000),
                    duration_min=route.get("duration_min", 120),
                    cabin=route.get("cabin", "Economy"),
                    start_date=today,
                    days=180,
                    rng=random.Random(),
                )
                route["data_source"] = "demo"
                route["live_error"] = err_msg

            route["updated_at"] = datetime.now().isoformat(timespec="seconds")
            save_data(data)
            return summarize_route(route, selected_date=fetch_date)
    return None
