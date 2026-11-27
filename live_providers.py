"""Real-time flight price adapters (SerpApi Google Flights & Amadeus API).

Uses Python standard library (urllib) so no external dependencies are required.
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).parent / "data"
CONFIG_FILE = DATA_DIR / "config.json"


def load_config() -> dict[str, Any]:
    """Load provider configuration from data/config.json merged with env vars."""
    cfg: dict[str, Any] = {
        "provider": "auto",  # auto | serpapi | amadeus | demo
        "serpapi_key": "",
        "amadeus_client_id": "",
        "amadeus_client_secret": "",
        "amadeus_env": "test",  # test | production
    }
    if CONFIG_FILE.exists():
        try:
            with CONFIG_FILE.open("r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    cfg.update(saved)
        except Exception:
            pass

    if os.environ.get("SERPAPI_KEY"):
        cfg["serpapi_key"] = os.environ["SERPAPI_KEY"]
    if os.environ.get("AMADEUS_CLIENT_ID"):
        cfg["amadeus_client_id"] = os.environ["AMADEUS_CLIENT_ID"]
    if os.environ.get("AMADEUS_CLIENT_SECRET"):
        cfg["amadeus_client_secret"] = os.environ["AMADEUS_CLIENT_SECRET"]
    if os.environ.get("LIVE_PROVIDER"):
        cfg["provider"] = os.environ["LIVE_PROVIDER"]

    return cfg


def save_config(new_cfg: dict[str, Any]) -> dict[str, Any]:
    """Persist provider settings to data/config.json."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    current = load_config()
    for key in ("provider", "serpapi_key", "amadeus_client_id", "amadeus_client_secret", "amadeus_env"):
        if key in new_cfg and new_cfg[key] is not None:
            current[key] = str(new_cfg[key]).strip()
    with CONFIG_FILE.open("w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)
    return current


def get_public_config() -> dict[str, Any]:
    """Return masked config safe to send to frontend."""
    cfg = load_config()
    active = resolve_active_provider(cfg)
    return {
        "provider": cfg.get("provider", "auto"),
        "active_provider": active,
        "has_serpapi_key": bool(cfg.get("serpapi_key")),
        "has_amadeus_keys": bool(cfg.get("amadeus_client_id") and cfg.get("amadeus_client_secret")),
        "amadeus_env": cfg.get("amadeus_env", "test"),
    }


def resolve_active_provider(cfg: dict[str, Any] | None = None) -> str:
    if cfg is None:
        cfg = load_config()
    pref = cfg.get("provider", "auto")
    has_serp = bool(cfg.get("serpapi_key"))
    has_ama = bool(cfg.get("amadeus_client_id") and cfg.get("amadeus_client_secret"))

    if pref == "demo":
        return "demo"
    if pref == "serpapi":
        return "serpapi" if has_serp else "demo"
    if pref == "amadeus":
        return "amadeus" if has_ama else "demo"
    # auto
    if has_serp:
        return "serpapi"
    if has_ama:
        return "amadeus"
    return "demo"


def _build_ssl_context() -> ssl.SSLContext:
    """Create an SSLContext using certifi or standard macOS/Linux CA bundles."""
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    for ca_path in (
        "/etc/ssl/cert.pem",
        "/opt/homebrew/etc/openssl@3/cert.pem",
        "/usr/local/etc/openssl@3/cert.pem",
        "/etc/ssl/certs/ca-certificates.crt",
    ):
        if os.path.exists(ca_path):
            return ssl.create_default_context(cafile=ca_path)

    return ssl.create_default_context()


def _http_json(url: str, method: str = "GET", data: bytes | None = None, headers: dict[str, str] | None = None, timeout: int = 18) -> dict[str, Any]:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    ctx = _build_ssl_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_serpapi_flights(
    route_id: str,
    origin: str,
    destination: str,
    outbound_date: str,
    trip_type: str,
    cabin: str,
    api_key: str,
) -> list[dict[str, Any]]:
    """Fetch real-time flight offers from SerpApi Google Flights API."""
    travel_class = "3" if cabin == "Business" else "1"
    flight_type = "1" if trip_type == "round_trip" else "2"

    params: dict[str, str] = {
        "engine": "google_flights",
        "departure_id": origin,
        "arrival_id": destination,
        "outbound_date": outbound_date,
        "type": flight_type,
        "travel_class": travel_class,
        "currency": "VND",
        "hl": "vi",
        "gl": "vn",
        "api_key": api_key,
    }
    if trip_type == "round_trip":
        ret_dt = datetime.fromisoformat(outbound_date) + timedelta(days=3)
        params["return_date"] = ret_dt.date().isoformat()

    url = f"https://serpapi.com/search.json?{urllib.parse.urlencode(params)}"
    payload = _http_json(url)
    if "error" in payload:
        raise RuntimeError(payload["error"])

    raw_groups = (payload.get("best_flights") or []) + (payload.get("other_flights") or [])
    quotes: list[dict[str, Any]] = []

    for idx, item in enumerate(raw_groups[:8]):
        flights = item.get("flights") or []
        if not flights:
            continue
        first_seg = flights[0]
        last_seg = flights[-1]
        airline_name = first_seg.get("airline", "Airline")
        flight_no = first_seg.get("flight_number", "")
        airline_code = (flight_no.split()[0] if flight_no else airline_name[:2]).upper()[:2]

        dep_time_full = (first_seg.get("departure_airport") or {}).get("time", "")
        arr_time_full = (last_seg.get("arrival_airport") or {}).get("time", "")
        dep_time = dep_time_full.split(" ")[-1] if dep_time_full else "--:--"
        arr_time = arr_time_full.split(" ")[-1] if arr_time_full else "--:--"

        price = int(item.get("price") or 0)
        if price <= 0:
            continue

        quotes.append(
            {
                "quote_id": f"{route_id}-{outbound_date}-serp-{idx}",
                "airline_code": airline_code,
                "airline_name": airline_name,
                "flight_number": flight_no or f"{airline_code}---",
                "provider": "Google Flights (Live)",
                "departure_time": dep_time,
                "arrival_time": arr_time,
                "duration_min": int(item.get("total_duration") or 0),
                "stops": max(0, len(flights) - 1),
                "baggage": "Theo quy định hãng",
                "price_vnd": price,
                "seats_left": None,
                "is_live": True,
                "booking_url": payload.get("search_metadata", {}).get("google_flights_url"),
            }
        )

    quotes.sort(key=lambda q: q["price_vnd"])
    return quotes


def _parse_iso_duration(iso_dur: str) -> int:
    """Parse ISO-8601 duration like PT2H15M into minutes."""
    if not iso_dur or not iso_dur.startswith("PT"):
        return 0
    s = iso_dur[2:]
    hours = 0
    mins = 0
    if "H" in s:
        h_part, s = s.split("H", 1)
        hours = int(h_part)
    if "M" in s:
        m_part = s.split("M", 1)[0]
        mins = int(m_part)
    return hours * 60 + mins


def fetch_amadeus_flights(
    route_id: str,
    origin: str,
    destination: str,
    outbound_date: str,
    cabin: str,
    client_id: str,
    client_secret: str,
    env: str = "test",
) -> list[dict[str, Any]]:
    """Fetch real-time flight offers from Amadeus Self-Service API."""
    base = "https://api.amadeus.com" if env == "production" else "https://test.api.amadeus.com"
    token_data = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        }
    ).encode("utf-8")
    token_resp = _http_json(
        f"{base}/v1/security/oauth2/token",
        method="POST",
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    access_token = token_resp["access_token"]

    travel_class = "BUSINESS" if cabin == "Business" else "ECONOMY"
    params = urllib.parse.urlencode(
        {
            "originLocationCode": origin,
            "destinationLocationCode": destination,
            "departureDate": outbound_date,
            "adults": "1",
            "travelClass": travel_class,
            "currencyCode": "VND",
            "max": "8",
        }
    )
    offers_resp = _http_json(
        f"{base}/v2/shopping/flight-offers?{params}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    carriers = (offers_resp.get("dictionaries") or {}).get("carriers") or {}
    quotes: list[dict[str, Any]] = []

    for idx, offer in enumerate(offers_resp.get("data") or []):
        itins = offer.get("itineraries") or []
        if not itins:
            continue
        segs = itins[0].get("segments") or []
        if not segs:
            continue
        first_seg = segs[0]
        last_seg = segs[-1]
        carrier_code = first_seg.get("carrierCode", "XX")
        airline_name = carriers.get(carrier_code, carrier_code)
        dep_time = (first_seg.get("departure") or {}).get("at", "")[11:16] or "--:--"
        arr_time = (last_seg.get("arrival") or {}).get("at", "")[11:16] or "--:--"
        price_total = float((offer.get("price") or {}).get("total") or 0)
        if price_total <= 0:
            continue

        quotes.append(
            {
                "quote_id": f"{route_id}-{outbound_date}-ama-{idx}",
                "airline_code": carrier_code,
                "airline_name": airline_name,
                "flight_number": f"{carrier_code}{first_seg.get('number', '')}",
                "provider": "Amadeus GDS (Live)",
                "departure_time": dep_time,
                "arrival_time": arr_time,
                "duration_min": _parse_iso_duration(itins[0].get("duration", "")),
                "stops": max(0, len(segs) - 1),
                "baggage": "Theo hạng vé",
                "price_vnd": int(round(price_total)),
                "seats_left": offer.get("numberOfBookableSeats"),
                "is_live": True,
            }
        )

    quotes.sort(key=lambda q: q["price_vnd"])
    return quotes


def fetch_live_quotes_for_date(
    route_id: str,
    origin: str,
    destination: str,
    outbound_date: str,
    trip_type: str,
    cabin: str,
) -> tuple[list[dict[str, Any]] | None, str, str | None]:
    """Attempt to fetch live quotes for a single date using configured provider.

    Returns (quotes_or_none, provider_used, error_message_or_none).
    """
    cfg = load_config()
    active = resolve_active_provider(cfg)
    if active == "demo":
        return None, "demo", None

    try:
        if active == "serpapi":
            quotes = fetch_serpapi_flights(
                route_id=route_id,
                origin=origin,
                destination=destination,
                outbound_date=outbound_date,
                trip_type=trip_type,
                cabin=cabin,
                api_key=cfg["serpapi_key"],
            )
            return quotes, "serpapi", None
        if active == "amadeus":
            quotes = fetch_amadeus_flights(
                route_id=route_id,
                origin=origin,
                destination=destination,
                outbound_date=outbound_date,
                cabin=cabin,
                client_id=cfg["amadeus_client_id"],
                client_secret=cfg["amadeus_client_secret"],
                env=cfg.get("amadeus_env", "test"),
            )
            return quotes, "amadeus", None
    except urllib.error.HTTPError as exc:
        return None, "demo", f"HTTP {exc.code} từ {active}: {exc.reason}"
    except Exception as exc:
        return None, "demo", f"Lỗi {active}: {exc}"

    return None, "demo", None
