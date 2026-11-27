/**
 * Client-side fallback engine for static hosting (e.g., GitHub Pages).
 * Automatically used when the Python backend (/api/*) is not running.
 */
(function (global) {
  const STORAGE_KEY = "skycompare_static_routes_v1";

  const AIRPORTS = {
    SGN: { city: "TP. Hồ Chí Minh", country: "Việt Nam", name: "Tân Sơn Nhất" },
    HAN: { city: "Hà Nội", country: "Việt Nam", name: "Nội Bài" },
    DAD: { city: "Đà Nẵng", country: "Việt Nam", name: "Đà Nẵng" },
    PQC: { city: "Phú Quốc", country: "Việt Nam", name: "Phú Quốc" },
    CXR: { city: "Nha Trang", country: "Việt Nam", name: "Cam Ranh" },
    DLI: { city: "Đà Lạt", country: "Việt Nam", name: "Liên Khương" },
    HPH: { city: "Hải Phòng", country: "Việt Nam", name: "Cát Bi" },
    HUI: { city: "Huế", country: "Việt Nam", name: "Phú Bài" },
    VCA: { city: "Cần Thơ", country: "Việt Nam", name: "Cần Thơ" },
    SIN: { city: "Singapore", country: "Singapore", name: "Changi" },
    BKK: { city: "Bangkok", country: "Thái Lan", name: "Suvarnabhumi" },
    DMK: { city: "Bangkok", country: "Thái Lan", name: "Don Mueang" },
    HKT: { city: "Phuket", country: "Thái Lan", name: "Phuket" },
    KUL: { city: "Kuala Lumpur", country: "Malaysia", name: "KLIA" },
    CGK: { city: "Jakarta", country: "Indonesia", name: "Soekarno-Hatta" },
    DPS: { city: "Bali", country: "Indonesia", name: "Ngurah Rai" },
    MNL: { city: "Manila", country: "Philippines", name: "Ninoy Aquino" },
    PNH: { city: "Phnom Penh", country: "Campuchia", name: "Phnom Penh" },
    NRT: { city: "Tokyo", country: "Nhật Bản", name: "Narita" },
    HND: { city: "Tokyo", country: "Nhật Bản", name: "Haneda" },
    KIX: { city: "Osaka", country: "Nhật Bản", name: "Kansai" },
    ICN: { city: "Seoul", country: "Hàn Quốc", name: "Incheon" },
    PUS: { city: "Busan", country: "Hàn Quốc", name: "Gimhae" },
    TPE: { city: "Đài Bắc", country: "Đài Loan", name: "Taoyuan" },
    HKG: { city: "Hồng Kông", country: "Trung Quốc", name: "Hong Kong Intl" },
    PEK: { city: "Bắc Kinh", country: "Trung Quốc", name: "Beijing Capital" },
    PVG: { city: "Thượng Hải", country: "Trung Quốc", name: "Pudong" },
    DEL: { city: "New Delhi", country: "Ấn Độ", name: "Indira Gandhi" },
    BOM: { city: "Mumbai", country: "Ấn Độ", name: "Chhatrapati Shivaji" },
    DXB: { city: "Dubai", country: "UAE", name: "Dubai Intl" },
    DOH: { city: "Doha", country: "Qatar", name: "Hamad Intl" },
    IST: { city: "Istanbul", country: "Thổ Nhĩ Kỳ", name: "Istanbul Airport" },
    LHR: { city: "London", country: "Vương quốc Anh", name: "Heathrow" },
    CDG: { city: "Paris", country: "Pháp", name: "Charles de Gaulle" },
    FRA: { city: "Frankfurt", country: "Đức", name: "Frankfurt" },
    MUC: { city: "Munich", country: "Đức", name: "Munich" },
    AMS: { city: "Amsterdam", country: "Hà Lan", name: "Schiphol" },
    ZRH: { city: "Zurich", country: "Thụy Sĩ", name: "Zurich" },
    FCO: { city: "Rome", country: "Ý", name: "Fiumicino" },
    MAD: { city: "Madrid", country: "Tây Ban Nha", name: "Barajas" },
    BCN: { city: "Barcelona", country: "Tây Ban Nha", name: "El Prat" },
    JFK: { city: "New York", country: "Hoa Kỳ", name: "John F. Kennedy" },
    LAX: { city: "Los Angeles", country: "Hoa Kỳ", name: "Los Angeles Intl" },
    SFO: { city: "San Francisco", country: "Hoa Kỳ", name: "San Francisco Intl" },
    SEA: { city: "Seattle", country: "Hoa Kỳ", name: "Seattle-Tacoma" },
    ORD: { city: "Chicago", country: "Hoa Kỳ", name: "O'Hare" },
    YYZ: { city: "Toronto", country: "Canada", name: "Pearson" },
    YVR: { city: "Vancouver", country: "Canada", name: "Vancouver Intl" },
    GRU: { city: "São Paulo", country: "Brazil", name: "Guarulhos" },
    SYD: { city: "Sydney", country: "Úc", name: "Kingsford Smith" },
    MEL: { city: "Melbourne", country: "Úc", name: "Tullamarine" },
    AKL: { city: "Auckland", country: "New Zealand", name: "Auckland" },
    CAI: { city: "Cairo", country: "Ai Cập", name: "Cairo Intl" },
    JNB: { city: "Johannesburg", country: "Nam Phi", name: "O. R. Tambo" },
  };

  const AIRLINES_DOMESTIC = [
    { code: "VJ", name: "VietJet Air", baggage: "7kg xách tay", base_mult: 0.86 },
    { code: "VN", name: "Vietnam Airlines", baggage: "23kg ký gửi + 12kg", base_mult: 1.18 },
    { code: "QH", name: "Bamboo Airways", baggage: "20kg ký gửi + 7kg", base_mult: 1.05 },
    { code: "VU", name: "Vietravel Airlines", baggage: "7kg xách tay", base_mult: 0.91 },
  ];

  const AIRLINES_INTL = [
    { code: "VJ", name: "VietJet Air", baggage: "7kg xách tay", base_mult: 0.82 },
    { code: "VN", name: "Vietnam Airlines", baggage: "23kg ký gửi + 12kg", base_mult: 1.22 },
    { code: "SQ", name: "Singapore Airlines", baggage: "25kg ký gửi + 7kg", base_mult: 1.38 },
    { code: "AK", name: "AirAsia", baggage: "7kg xách tay", base_mult: 0.85 },
    { code: "KE", name: "Korean Air", baggage: "23kg ký gửi + 10kg", base_mult: 1.34 },
    { code: "NH", name: "ANA", baggage: "2x23kg ký gửi", base_mult: 1.45 },
  ];

  const PROVIDERS = ["Trang chủ hãng", "Traveloka", "Skyscanner", "Booking.com", "Momo Travel"];

  const DEFAULT_SPECS = [
    { id: "sgn-han", origin: "SGN", destination: "HAN", trip_type: "one_way", cabin: "Economy", base_price: 1350000, duration_min: 130, target_price: 1200000, pinned: true },
    { id: "han-dad", origin: "HAN", destination: "DAD", trip_type: "one_way", cabin: "Economy", base_price: 980000, duration_min: 80, target_price: 900000, pinned: true },
    { id: "sgn-pqc", origin: "SGN", destination: "PQC", trip_type: "one_way", cabin: "Economy", base_price: 890000, duration_min: 65, target_price: 800000, pinned: true },
    { id: "sgn-sin", origin: "SGN", destination: "SIN", trip_type: "round_trip", cabin: "Economy", base_price: 2850000, duration_min: 125, target_price: 2600000, pinned: true },
    { id: "sgn-bkk", origin: "SGN", destination: "BKK", trip_type: "round_trip", cabin: "Economy", base_price: 2450000, duration_min: 95, target_price: 2200000, pinned: false },
    { id: "han-icn", origin: "HAN", destination: "ICN", trip_type: "round_trip", cabin: "Economy", base_price: 6200000, duration_min: 270, target_price: 5800000, pinned: false },
    { id: "sgn-nrt", origin: "SGN", destination: "NRT", trip_type: "round_trip", cabin: "Economy", base_price: 8400000, duration_min: 355, target_price: 7800000, pinned: false },
  ];

  function seededRand(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isDomestic(o, d) {
    return AIRPORTS[o]?.country === "Việt Nam" && AIRPORTS[d]?.country === "Việt Nam";
  }

  function roundPrice(v) {
    return Math.round(v / 10000) * 10000;
  }

  function addMinutes(timeStr, mins) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const total = (hh * 60 + mm + mins) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function generateQuotes(route, startIso, days = 180, salt = "") {
    const rng = seededRand(`${route.id}-${salt}`);
    const domestic = isDomestic(route.origin, route.destination);
    const pool = domestic ? AIRLINES_DOMESTIC : AIRLINES_INTL.slice(0, 4);
    const cabinMult = route.cabin === "Business" ? 2.4 : 1.0;
    const slots = ["06:15", "08:40", "11:25", "14:50", "18:10", "21:05"];
    const baseDate = new Date(startIso + "T00:00:00");
    const out = {};

    for (let i = 0; i < days; i++) {
      const dt = new Date(baseDate);
      dt.setDate(dt.getDate() + i);
      const iso = dt.toISOString().slice(0, 10);
      const wd = dt.getDay(); // 0=Sun, 5=Fri, 6=Sat
      let dayMult = wd === 5 || wd === 0 ? 1.15 : wd === 6 ? 1.08 : 0.94;
      if (wd === 2 || wd === 3) dayMult *= 0.92;

      const quotes = pool.map((airline, idx) => {
        const stops = domestic || rng() > 0.28 ? 0 : 1;
        const extraDur = stops === 0 ? 0 : [75, 110, 145][Math.floor(rng() * 3)];
        const dep = slots[(idx + i) % slots.length];
        const dur = (route.duration_min || 120) + extraDur;
        const noise = 0.9 + rng() * 0.22;
        const stopDisc = stops === 1 ? 0.88 : 1.0;
        const price = roundPrice(route.base_price * cabinMult * airline.base_mult * dayMult * noise * stopDisc);
        return {
          quote_id: `${route.id}-${iso}-${airline.code}-${idx}`,
          airline_code: airline.code,
          airline_name: airline.name,
          flight_number: `${airline.code}${100 + Math.floor(rng() * 899)}`,
          provider: PROVIDERS[(idx + i) % PROVIDERS.length],
          departure_time: dep,
          arrival_time: addMinutes(dep, dur),
          duration_min: dur,
          stops,
          baggage: airline.baggage,
          price_vnd: price,
        };
      });
      quotes.sort((a, b) => a.price_vnd - b.price_vnd);
      out[iso] = quotes;
    }
    return out;
  }

  function loadStore() {
    const todayIso = new Date().toISOString().slice(0, 10);
    let routes = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) routes = JSON.parse(raw);
    } catch (_) {}
    if (!Array.isArray(routes) || !routes.length) {
      routes = DEFAULT_SPECS.map((s) => ({
        ...s,
        data_source: "demo",
        quotes_by_date: generateQuotes(s, todayIso, 180),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    } else {
      let updated = false;
      for (const r of routes) {
        if (Object.keys(r.quotes_by_date || {}).length < 180) {
          r.quotes_by_date = generateQuotes(r, todayIso, 180);
          updated = true;
        }
      }
      if (updated) localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    }
    return routes;
  }

  function saveStore(routes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  }

  function summarizeRoute(route, selectedDate) {
    const qmap = route.quotes_by_date || {};
    const dates = Object.keys(qmap).sort();
    let bestOverall = null;
    let bestDate = null;
    const dailyMin = [];
    const allPrices = [];

    for (const d of dates) {
      const list = qmap[d] || [];
      if (!list.length) continue;
      const minQ = list.reduce((a, b) => (b.price_vnd < a.price_vnd ? b : a));
      dailyMin.push({ date: d, min_price: minQ.price_vnd, airline_name: minQ.airline_name, airline_code: minQ.airline_code });
      for (const q of list) allPrices.push(q.price_vnd);
      if (!bestOverall || minQ.price_vnd < bestOverall.price_vnd) {
        bestOverall = minQ;
        bestDate = d;
      }
    }

    const activeDate = selectedDate || dates[0] || new Date().toISOString().slice(0, 10);
    let activeQuotes = qmap[activeDate];
    if (!activeQuotes && /^\d{4}-\d{2}-\d{2}$/.test(activeDate)) {
      activeQuotes = generateQuotes(route, activeDate, 1, activeDate)[activeDate] || [];
    }
    activeQuotes = activeQuotes || [];

    const avgPrice = allPrices.length ? Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length) : 0;
    const minPrice = bestOverall ? bestOverall.price_vnd : 0;
    return {
      id: route.id,
      origin: route.origin,
      destination: route.destination,
      origin_info: AIRPORTS[route.origin] || { city: route.origin, country: "Quốc tế", name: `Sân bay ${route.origin}` },
      destination_info: AIRPORTS[route.destination] || { city: route.destination, country: "Quốc tế", name: `Sân bay ${route.destination}` },
      trip_type: route.trip_type,
      cabin: route.cabin,
      pinned: !!route.pinned,
      target_price: route.target_price,
      alert_triggered: Boolean(route.target_price && minPrice > 0 && minPrice <= route.target_price),
      data_source: "demo",
      cheapest_overall: bestOverall,
      cheapest_date: bestDate,
      active_date: activeDate,
      avg_price: avgPrice,
      savings_vs_avg: Math.max(0, avgPrice - minPrice),
      daily_min: dailyMin,
      quotes_on_date: activeQuotes,
    };
  }

  global.ClientFlightEngine = {
    async request(url, options = {}) {
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname;
      const method = (options.method || "GET").toUpperCase();
      const body = options.body ? JSON.parse(options.body) : {};
      let routes = loadStore();

      if (path === "/api/airports") {
        return { airports: AIRPORTS };
      }
      if (path === "/api/settings") {
        return { settings: { provider: "demo", active_provider: "demo", has_serpapi_key: false, has_amadeus_keys: false, amadeus_env: "test" } };
      }
      if (path === "/api/routes" && method === "GET") {
        const d = parsed.searchParams.get("date");
        return { routes: routes.map((r) => summarizeRoute(r, d)) };
      }
      if (path === "/api/routes" && method === "POST") {
        const origin = String(body.origin || "").trim().toUpperCase();
        const destination = String(body.destination || "").trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) {
          throw new Error("Mã sân bay đi/đến phải là 3 chữ cái IATA hợp lệ và khác nhau.");
        }
        const domestic = isDomestic(origin, destination);
        const tripType = body.trip_type === "round_trip" ? "round_trip" : "one_way";
        const basePrice = Math.round((domestic ? 1250000 : 4200000) * (tripType === "round_trip" ? 1.85 : 1));
        const newRoute = {
          id: `${origin.toLowerCase()}-${destination.toLowerCase()}-${Date.now().toString(36)}`,
          origin,
          destination,
          trip_type: tripType,
          cabin: body.cabin === "Business" ? "Business" : "Economy",
          base_price: basePrice,
          duration_min: domestic ? 105 : 210,
          target_price: body.target_price || roundPrice(basePrice * 0.88),
          pinned: true,
          data_source: "demo",
        };
        newRoute.quotes_by_date = generateQuotes(newRoute, new Date().toISOString().slice(0, 10), 180, String(Date.now()));
        routes.unshift(newRoute);
        saveStore(routes);
        return { route: summarizeRoute(newRoute) };
      }
      if (path === "/api/compare") {
        const ids = (parsed.searchParams.get("route_ids") || "").split(",").filter(Boolean);
        const d = parsed.searchParams.get("date");
        const directOnly = parsed.searchParams.get("direct_only") === "true";
        const maxPrice = parsed.searchParams.get("max_price") ? Number(parsed.searchParams.get("max_price")) : null;
        const selected = ids.length ? routes.filter((r) => ids.includes(r.id)) : routes.filter((r) => r.pinned);
        const compared = selected.map((r) => {
          const sum = summarizeRoute(r, d);
          let q = sum.quotes_on_date;
          if (directOnly) q = q.filter((x) => x.stops === 0);
          if (maxPrice) q = q.filter((x) => x.price_vnd <= maxPrice);
          sum.quotes_on_date = q;
          sum.cheapest_filtered = q.length ? q.reduce((a, b) => (b.price_vnd < a.price_vnd ? b : a)) : null;
          return sum;
        });
        compared.sort((a, b) => (a.cheapest_filtered?.price_vnd ?? Infinity) - (b.cheapest_filtered?.price_vnd ?? Infinity));
        return { compared };
      }
      if (path.startsWith("/api/routes/") && path.endsWith("/refresh")) {
        const id = path.slice("/api/routes/".length, -"/refresh".length);
        const r = routes.find((x) => x.id === id);
        if (!r) throw new Error("Không tìm thấy route.");
        r.quotes_by_date = generateQuotes(r, new Date().toISOString().slice(0, 10), 180, String(Date.now()));
        saveStore(routes);
        return { route: summarizeRoute(r, parsed.searchParams.get("date")) };
      }
      if (path.startsWith("/api/routes/") && method === "PATCH") {
        const id = path.slice("/api/routes/".length);
        const r = routes.find((x) => x.id === id);
        if (!r) throw new Error("Không tìm thấy route.");
        if ("pinned" in body) r.pinned = !!body.pinned;
        if ("target_price" in body) r.target_price = body.target_price;
        saveStore(routes);
        return { route: summarizeRoute(r) };
      }
      if (path.startsWith("/api/routes/") && method === "DELETE") {
        const id = path.slice("/api/routes/".length);
        routes = routes.filter((x) => x.id !== id);
        saveStore(routes);
        return { deleted: id };
      }
      throw new Error("Không hỗ trợ thao tác này ở chế độ tĩnh.");
    },
  };
})(window);
