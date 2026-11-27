/**
 * Offline fallback store when backend is unreachable (strictly live-only: zero demo quotes).
 */
(function (global) {
  const STORAGE_KEY = "skycompare_live_routes_v2";

  const AIRPORTS = {
    SGN: { city: "TP. Hồ Chí Minh", country: "Việt Nam", name: "Tân Sơn Nhất" },
    HAN: { city: "Hà Nội", country: "Việt Nam", name: "Nội Bài" },
    DAD: { city: "Đà Nẵng", country: "Việt Nam", name: "Đà Nẵng" },
    PQC: { city: "Phú Quốc", country: "Việt Nam", name: "Phú Quốc" },
    CXR: { city: "Nha Trang", country: "Việt Nam", name: "Cam Ranh" },
    DLI: { city: "Đà Lạt", country: "Việt Nam", name: "Liên Khương" },
    SIN: { city: "Singapore", country: "Singapore", name: "Changi" },
    BKK: { city: "Bangkok", country: "Thái Lan", name: "Suvarnabhumi" },
    NRT: { city: "Tokyo", country: "Nhật Bản", name: "Narita" },
    ICN: { city: "Seoul", country: "Hàn Quốc", name: "Incheon" },
  };

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }

  global.ClientFlightEngine = {
    async request(url) {
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname === "/api/airports") return { airports: AIRPORTS };
      if (parsed.pathname === "/api/settings") {
        return { settings: { provider: "serpapi", active_provider: "offline", has_serpapi_key: false, has_amadeus_keys: false } };
      }
      if (parsed.pathname === "/api/routes") return { routes: loadStore() };
      if (parsed.pathname === "/api/compare") return { compared: [] };
      throw new Error("Không kết nối được tới máy chủ SerpApi (Render). Vui lòng thử lại sau vài giây.");
    },
  };
})(window);
