const state = {
  airports: {},
  routes: [],
  compared: [],
  settings: null,
  selectedDate: null,
  chartRouteId: null,
  sortBy: "price",
  directOnly: false,
  maxPrice: "",
};

const el = (id) => document.getElementById(id);

function formatVND(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
}

function formatShortVND(amount) {
  if (!amount) return "—";
  if (amount >= 1_000_000) {
    return (amount / 1_000_000).toFixed(2).replace(/\.00$/, "") + "tr";
  }
  return Math.round(amount / 1000) + "k";
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}g ${m}p` : `${m}p`;
}

function formatDateLabel(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${weekdays[dt.getDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

let useStaticFallback = false;

async function api(url, options = {}) {
  if (useStaticFallback && window.ClientFlightEngine) {
    return window.ClientFlightEngine.request(url, options);
  }
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("NOT_JSON_BACKEND");
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Đã có lỗi xảy ra");
    }
    return data;
  } catch (err) {
    if (
      window.ClientFlightEngine &&
      (err.message === "NOT_JSON_BACKEND" || err instanceof TypeError || err instanceof SyntaxError)
    ) {
      useStaticFallback = true;
      return window.ClientFlightEngine.request(url, options);
    }
    throw err;
  }
}

function populateAirportSelects() {
  const datalist = el("airports-datalist");
  if (!datalist) return;
  const entries = Object.entries(state.airports);
  datalist.innerHTML = entries
    .map(
      ([code, info]) =>
        `<option value="${code} — ${info.city}, ${info.country} (${info.name})"></option>`
    )
    .join("");
}

function extractIataCode(rawValue) {
  const val = String(rawValue || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(val)) return val;
  const match = val.match(/^([A-Z]{3})\b/);
  return match ? match[1] : val;
}

function populateDateFilter() {
  const dateInput = el("filter-date");
  const today = new Date();
  const minIso = today.toISOString().slice(0, 10);
  const maxDt = new Date(today);
  maxDt.setFullYear(maxDt.getFullYear() + 1);
  const maxIso = maxDt.toISOString().slice(0, 10);

  dateInput.min = minIso;
  dateInput.max = maxIso;

  const firstRoute = state.routes[0];
  const defaultDate =
    firstRoute && firstRoute.daily_min.length ? firstRoute.daily_min[0].date : minIso;

  if (!state.selectedDate) {
    state.selectedDate = defaultDate;
  }
  dateInput.value = state.selectedDate;
}

function populateChartRouteSelect() {
  const sel = el("chart-route-select");
  if (!state.routes.length) {
    sel.innerHTML = "";
    return;
  }
  const pinned = state.routes.filter((r) => r.pinned);
  const pool = pinned.length ? pinned : state.routes;
  if (!state.chartRouteId || !state.routes.some((r) => r.id === state.chartRouteId)) {
    state.chartRouteId = pool[0].id;
  }
  sel.innerHTML = state.routes
    .map((r) => `<option value="${r.id}">${r.origin} → ${r.destination} (${r.trip_type === "round_trip" ? "Khứ hồi" : "1 chiều"})</option>`)
    .join("");
  sel.value = state.chartRouteId;
}

function renderKPIs() {
  if (!state.routes.length) {
    el("kpi-best-route").textContent = "—";
    el("kpi-best-today").textContent = "—";
    el("kpi-savings").textContent = "—";
    el("kpi-alerts").textContent = "0";
    return;
  }

  // Cheapest overall across all tracked routes
  let bestRoute = null;
  for (const r of state.routes) {
    if (!r.cheapest_overall) continue;
    if (!bestRoute || r.cheapest_overall.price_vnd < bestRoute.cheapest_overall.price_vnd) {
      bestRoute = r;
    }
  }
  if (bestRoute) {
    el("kpi-best-route").textContent = `${bestRoute.origin} → ${bestRoute.destination} • ${formatVND(bestRoute.cheapest_overall.price_vnd)}`;
    el("kpi-best-route-sub").textContent = `${bestRoute.cheapest_overall.airline_name} • Ngày ${formatDateLabel(bestRoute.cheapest_date)}`;
  }

  // Cheapest on selected date among compared routes
  const validCompared = state.compared.filter((r) => r.cheapest_filtered);
  if (validCompared.length) {
    const top = validCompared[0];
    el("kpi-best-today").textContent = formatVND(top.cheapest_filtered.price_vnd);
    el("kpi-best-today-sub").textContent = `${top.origin} → ${top.destination} (${top.cheapest_filtered.airline_name})`;
  } else {
    el("kpi-best-today").textContent = "—";
    el("kpi-best-today-sub").textContent = "Chưa có chuyến phù hợp bộ lọc";
  }

  // Max savings vs avg
  const maxSavingsRoute = state.routes.reduce(
    (best, r) => (r.savings_vs_avg > (best?.savings_vs_avg || 0) ? r : best),
    null
  );
  if (maxSavingsRoute && maxSavingsRoute.savings_vs_avg > 0) {
    el("kpi-savings").textContent = formatVND(maxSavingsRoute.savings_vs_avg);
    el("kpi-savings-sub").textContent = `Trên route ${maxSavingsRoute.origin} → ${maxSavingsRoute.destination}`;
  } else {
    el("kpi-savings").textContent = "0 ₫";
    el("kpi-savings-sub").textContent = "Chưa có chênh lệch";
  }

  // Alerts triggered
  const triggered = state.routes.filter((r) => r.alert_triggered);
  el("kpi-alerts").textContent = `${triggered.length} / ${state.routes.length}`;
  el("kpi-alerts-sub").textContent = triggered.length
    ? triggered.map((r) => `${r.origin}→${r.destination}`).join(", ")
    : "Chưa có route dưới giá mục tiêu";
}

function renderSettingsStatus() {
  const pill = el("live-status-pill");
  if (useStaticFallback) {
    pill.textContent = "🌐 GitHub Pages (Static)";
    pill.classList.remove("status-live");
    const settingsBtn = el("btn-open-settings");
    if (settingsBtn) settingsBtn.classList.add("hidden");
    return;
  }
  if (!state.settings) return;
  const active = state.settings.active_provider;
  if (active === "serpapi") {
    pill.textContent = "🟢 Live: SerpApi";
    pill.classList.add("status-live");
  } else if (active === "amadeus") {
    pill.textContent = "🟢 Live: Amadeus";
    pill.classList.add("status-live");
  } else {
    pill.textContent = "🟡 Demo (Chưa gắn API Key)";
    pill.classList.remove("status-live");
  }
}

function renderRouteSidebar() {
  const list = el("route-list");
  el("route-count").textContent = state.routes.length;

  if (!state.routes.length) {
    list.innerHTML = `<div class="empty-state">Chưa có route nào. Nhấn "+ Thêm Route mới" để bắt đầu.</div>`;
    return;
  }

  list.innerHTML = state.routes
    .map((r) => {
      const minPrice = r.cheapest_overall ? formatVND(r.cheapest_overall.price_vnd) : "—";
      const tripLabel = r.trip_type === "round_trip" ? "Khứ hồi" : "1 chiều";
      const alertHtml = r.alert_triggered
        ? `<span class="tag tag-alert">Đạt mục tiêu ≤ ${formatShortVND(r.target_price)}</span>`
        : r.target_price
        ? `<span class="tag">Mục tiêu: ${formatShortVND(r.target_price)}</span>`
        : "";

      return `
        <div class="route-card ${r.pinned ? "pinned" : ""}" data-id="${r.id}">
          <div class="route-card-top">
            <div>
              <div class="route-code">${r.origin} → ${r.destination}</div>
              <div class="route-cities">${r.origin_info.city} → ${r.destination_info.city}</div>
            </div>
            <label class="pin-toggle" title="Ghim để so sánh">
              <input type="checkbox" class="js-pin-route" data-id="${r.id}" ${r.pinned ? "checked" : ""} />
              <span>So sánh</span>
            </label>
          </div>
          <div class="route-meta">
            <span class="route-price">Từ ${minPrice}</span>
            <div class="route-actions">
              <button class="icon-btn js-edit-target" data-id="${r.id}" title="Đặt giá mục tiêu">🎯</button>
              <button class="icon-btn js-refresh-route" data-id="${r.id}" title="Làm mới giá">↻</button>
              <button class="icon-btn js-delete-route" data-id="${r.id}" title="Xoá route">🗑</button>
            </div>
          </div>
          <div class="route-tags">
            <span class="tag">${tripLabel}</span>
            <span class="tag">${r.cabin}</span>
            ${r.data_source && r.data_source !== "demo" ? `<span class="tag tag-live">Live: ${r.data_source}</span>` : ""}
            ${alertHtml}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderChart() {
  const container = el("price-chart");
  const route = state.routes.find((r) => r.id === state.chartRouteId);
  if (!route || !route.daily_min.length) {
    container.innerHTML = `<div class="empty-state">Không có dữ liệu biểu đồ.</div>`;
    return;
  }

  const prices = route.daily_min.map((d) => d.min_price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(1, maxP - minP);
  const cheapestDay = route.daily_min.find((d) => d.min_price === minP);
  const firstD = route.daily_min[0].date;
  const lastD = route.daily_min[route.daily_min.length - 1].date;

  el("chart-subtitle").textContent = `${route.origin} → ${route.destination} (${formatDateLabel(firstD)} – ${formatDateLabel(lastD)}): Giá thấp nhất ${formatVND(minP)} vào ${formatDateLabel(cheapestDay ? cheapestDay.date : route.cheapest_date)}. Nhấp cột để đổi ngày so sánh.`;

  const barsHtml = route.daily_min
    .map((d) => {
      const pct = 28 + Math.round(((d.min_price - minP) / span) * 68);
      const isCheapest = d.min_price === minP;
      const isActive = d.date === state.selectedDate;
      const shortDate = d.date.slice(5).split("-").reverse().join("/");
      return `
        <div class="chart-col ${isCheapest ? "cheapest" : ""} ${isActive ? "active" : ""}" data-date="${d.date}" title="${formatDateLabel(d.date)}: ${formatVND(d.min_price)} (${d.airline_name})">
          <span class="chart-bar-price">${formatShortVND(d.min_price)}</span>
          <div class="chart-bar" style="height: ${pct}%"></div>
          <span class="chart-date">${shortDate}</span>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `<div class="chart-bars">${barsHtml}</div>`;
  const activeCol = container.querySelector(".chart-col.active");
  if (activeCol) {
    activeCol.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
}

function sortCompared(items) {
  const copy = [...items];
  if (state.sortBy === "duration") {
    copy.sort((a, b) => {
      const da = a.cheapest_filtered ? a.cheapest_filtered.duration_min : Infinity;
      const db = b.cheapest_filtered ? b.cheapest_filtered.duration_min : Infinity;
      return da - db;
    });
  } else if (state.sortBy === "savings") {
    copy.sort((a, b) => b.savings_vs_avg - a.savings_vs_avg);
  } else {
    copy.sort((a, b) => {
      const pa = a.cheapest_filtered ? a.cheapest_filtered.price_vnd : Infinity;
      const pb = b.cheapest_filtered ? b.cheapest_filtered.price_vnd : Infinity;
      return pa - pb;
    });
  }
  return copy;
}

function renderComparison() {
  const banner = el("winner-banner");
  const container = el("compare-container");
  const sorted = sortCompared(state.compared);

  el("compare-summary").textContent = `${sorted.length} route • Ngày ${formatDateLabel(state.selectedDate)}`;

  if (!sorted.length) {
    banner.classList.add("hidden");
    container.innerHTML = `<div class="empty-state">Hãy chọn (tick "So sánh") ít nhất 1 route ở cột bên trái để xem bảng so sánh giá.</div>`;
    return;
  }

  // Find overall cheapest quote across all compared routes
  let winnerRoute = null;
  let winnerQuote = null;
  for (const r of sorted) {
    if (r.cheapest_filtered) {
      if (!winnerQuote || r.cheapest_filtered.price_vnd < winnerQuote.price_vnd) {
        winnerQuote = r.cheapest_filtered;
        winnerRoute = r;
      }
    }
  }

  if (winnerRoute && winnerQuote) {
    banner.classList.remove("hidden");
    banner.innerHTML = `
      <div>
        <div class="winner-title">🏆 Lựa chọn rẻ nhất ngày ${formatDateLabel(state.selectedDate)}</div>
        <div class="winner-main">${winnerRoute.origin} → ${winnerRoute.destination} (${winnerRoute.origin_info.city} → ${winnerRoute.destination_info.city})</div>
        <div class="winner-details">${winnerQuote.airline_name} (${winnerQuote.flight_number}) • ${winnerQuote.departure_time} – ${winnerQuote.arrival_time} • ${formatDuration(winnerQuote.duration_min)} • ${winnerQuote.stops === 0 ? "Bay thẳng" : "1 điểm dừng"} • Qua ${winnerQuote.provider}</div>
      </div>
      <div class="winner-price">${formatVND(winnerQuote.price_vnd)}</div>
    `;
  } else {
    banner.classList.add("hidden");
  }

  container.innerHTML = sorted
    .map((r) => {
      const isWinnerRoute = winnerRoute && winnerRoute.id === r.id;
      const quotes = r.quotes_on_date || [];
      const rowsHtml = quotes.length
        ? quotes
            .map((q, idx) => {
              const isBest = idx === 0;
              return `
                <tr class="${isBest ? "best-row" : ""}">
                  <td>
                    <div class="airline-pill">
                      <span class="airline-code">${q.airline_code}</span>
                      <div>
                        <div>${q.airline_name}</div>
                        <small style="color: var(--text-muted)">${q.flight_number}</small>
                      </div>
                    </div>
                  </td>
                  <td><strong>${q.departure_time}</strong> → ${q.arrival_time}</td>
                  <td>${formatDuration(q.duration_min)} • ${q.stops === 0 ? "Bay thẳng" : "1 điểm dừng"}</td>
                  <td>${q.baggage}</td>
                  <td>${q.provider}</td>
                  <td class="price-cell">
                    ${formatVND(q.price_vnd)}
                    ${isBest ? `<span class="pill-cheapest" style="margin-left:6px">Rẻ nhất</span>` : ""}
                  </td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="6" class="empty-state">Không có chuyến bay nào khớp bộ lọc giá/bay thẳng.</td></tr>`;

      return `
        <div class="compare-route-block ${isWinnerRoute ? "is-cheapest" : ""}">
          <div class="compare-route-header">
            <div class="compare-route-title">
              <span>${r.origin} → ${r.destination}</span>
              <span style="font-weight:500;color:var(--text-muted);font-size:0.88rem">(${r.origin_info.city} → ${r.destination_info.city})</span>
              ${isWinnerRoute ? `<span class="pill-cheapest">Route rẻ nhất</span>` : ""}
            </div>
            <div style="font-size:0.85rem;color:var(--text-muted)">
              TB 6 tháng: <strong>${formatVND(r.avg_price)}</strong> • Thấp nhất 6 tháng: <strong style="color:var(--emerald)">${r.cheapest_overall ? formatVND(r.cheapest_overall.price_vnd) : "—"}</strong>
            </div>
          </div>
          <div style="overflow-x:auto">
            <table class="quotes-table">
              <thead>
                <tr>
                  <th>Hãng bay</th>
                  <th>Giờ bay</th>
                  <th>Thời gian &amp; Chặng</th>
                  <th>Hành lý</th>
                  <th>Nguồn giá</th>
                  <th>Giá vé</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join("");
}

async function refreshComparison() {
  const pinnedIds = state.routes.filter((r) => r.pinned).map((r) => r.id);
  const params = new URLSearchParams();
  if (pinnedIds.length) {
    params.set("route_ids", pinnedIds.join(","));
  } else {
    state.compared = [];
    renderKPIs();
    renderComparison();
    return;
  }
  if (state.selectedDate) params.set("date", state.selectedDate);
  if (state.directOnly) params.set("direct_only", "true");
  if (state.maxPrice) params.set("max_price", state.maxPrice);

  const data = await api(`/api/compare?${params.toString()}`);
  state.compared = data.compared;
  renderKPIs();
  renderComparison();
}

async function loadAll() {
  const [airportsRes, routesRes, settingsRes] = await Promise.all([
    api("/api/airports"),
    api(`/api/routes${state.selectedDate ? `?date=${encodeURIComponent(state.selectedDate)}` : ""}`),
    api("/api/settings"),
  ]);
  state.airports = airportsRes.airports;
  state.routes = routesRes.routes;
  state.settings = settingsRes.settings;
  renderSettingsStatus();
  populateAirportSelects();
  populateDateFilter();
  populateChartRouteSelect();
  renderRouteSidebar();
  renderChart();
  await refreshComparison();
}

async function reloadRoutesAndCompare() {
  const routesRes = await api(`/api/routes?date=${encodeURIComponent(state.selectedDate || "")}`);
  state.routes = routesRes.routes;
  populateChartRouteSelect();
  renderRouteSidebar();
  renderChart();
  await refreshComparison();
}

function bindEvents() {
  el("filter-date").addEventListener("change", async (e) => {
    state.selectedDate = e.target.value;
    await reloadRoutesAndCompare();
  });

  el("filter-sort").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    renderComparison();
  });

  el("filter-direct").addEventListener("change", async (e) => {
    state.directOnly = e.target.checked;
    await refreshComparison();
  });

  el("filter-max-price").addEventListener("input", async (e) => {
    state.maxPrice = e.target.value.trim();
    await refreshComparison();
  });

  el("chart-route-select").addEventListener("change", (e) => {
    state.chartRouteId = e.target.value;
    renderChart();
  });

  el("price-chart").addEventListener("click", async (e) => {
    const col = e.target.closest(".chart-col");
    if (!col) return;
    state.selectedDate = col.dataset.date;
    el("filter-date").value = state.selectedDate;
    await reloadRoutesAndCompare();
  });

  el("route-list").addEventListener("change", async (e) => {
    if (!e.target.classList.contains("js-pin-route")) return;
    const id = e.target.dataset.id;
    await api(`/api/routes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ pinned: e.target.checked }),
    });
    await reloadRoutesAndCompare();
  });

  el("route-list").addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".js-delete-route");
    if (delBtn) {
      const id = delBtn.dataset.id;
      await api(`/api/routes/${id}`, { method: "DELETE" });
      showToast("Đã xoá route khỏi danh sách theo dõi.");
      await reloadRoutesAndCompare();
      return;
    }

    const refBtn = e.target.closest(".js-refresh-route");
    if (refBtn) {
      const id = refBtn.dataset.id;
      const dateQuery = state.selectedDate ? `?date=${encodeURIComponent(state.selectedDate)}` : "";
      const res = await api(`/api/routes/${id}/refresh${dateQuery}`, { method: "POST" });
      if (res.route.live_error) {
        showToast(`Lỗi Live API (${res.route.live_error}) — dùng tạm dữ liệu mẫu.`);
      } else if (res.route.data_source !== "demo") {
        showToast(`Đã cập nhật giá LIVE từ ${res.route.data_source}!`);
      } else {
        showToast("Đã cập nhật giá vé mới nhất (Demo).");
      }
      await reloadRoutesAndCompare();
      return;
    }

    const targetBtn = e.target.closest(".js-edit-target");
    if (targetBtn) {
      const id = targetBtn.dataset.id;
      const route = state.routes.find((r) => r.id === id);
      const input = prompt(
        `Nhập giá mục tiêu (VNĐ) cho route ${route.origin} → ${route.destination}:`,
        route.target_price || ""
      );
      if (input === null) return;
      const parsed = input.trim() ? Number(input.trim()) : null;
      if (parsed !== null && (Number.isNaN(parsed) || parsed <= 0)) {
        showToast("Giá mục tiêu không hợp lệ.");
        return;
      }
      await api(`/api/routes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ target_price: parsed }),
      });
      showToast("Đã cập nhật giá mục tiêu.");
      await reloadRoutesAndCompare();
    }
  });

  el("btn-refresh-all").addEventListener("click", async () => {
    const pinned = state.routes.filter((r) => r.pinned);
    if (!pinned.length) {
      showToast("Chưa có route nào được chọn để làm mới.");
      return;
    }
    const dateQuery = state.selectedDate ? `?date=${encodeURIComponent(state.selectedDate)}` : "";
    await Promise.all(pinned.map((r) => api(`/api/routes/${r.id}/refresh${dateQuery}`, { method: "POST" })));
    showToast(`Đã làm mới giá cho ${pinned.length} route.`);
    await reloadRoutesAndCompare();
  });

  // Settings Modal controls
  const settingsModal = el("settings-modal");
  const closeSettings = () => {
    settingsModal.classList.add("hidden");
    el("settings-error").classList.add("hidden");
  };
  el("btn-open-settings").addEventListener("click", () => {
    el("settings-error").classList.add("hidden");
    if (state.settings) {
      el("setting-provider").value = state.settings.provider || "auto";
      el("setting-amadeus-env").value = state.settings.amadeus_env || "test";
      el("setting-serpapi-key").placeholder = state.settings.has_serpapi_key
        ? "•••••••• (Đã lưu — nhập mới nếu muốn đổi)"
        : "Nhập SERPAPI_KEY";
      el("setting-amadeus-id").placeholder = state.settings.has_amadeus_keys
        ? "•••••••• (Đã lưu)"
        : "AMADEUS_CLIENT_ID";
      el("setting-amadeus-secret").placeholder = state.settings.has_amadeus_keys
        ? "•••••••• (Đã lưu)"
        : "AMADEUS_CLIENT_SECRET";
    }
    settingsModal.classList.remove("hidden");
  });
  el("btn-close-settings").addEventListener("click", closeSettings);
  el("btn-cancel-settings").addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  el("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = el("settings-error");
    const saveBtn = el("btn-save-settings");
    errEl.classList.add("hidden");
    saveBtn.disabled = true;
    saveBtn.textContent = "Đang lưu...";

    try {
      const payload = {
        provider: el("setting-provider").value,
        amadeus_env: el("setting-amadeus-env").value,
      };
      const serpKey = el("setting-serpapi-key").value.trim();
      const amaId = el("setting-amadeus-id").value.trim();
      const amaSecret = el("setting-amadeus-secret").value.trim();
      if (serpKey) payload.serpapi_key = serpKey;
      if (amaId) payload.amadeus_client_id = amaId;
      if (amaSecret) payload.amadeus_client_secret = amaSecret;

      const res = await api("/api/settings", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.settings = res.settings;
      renderSettingsStatus();

      // Automatically fetch live prices for the first pinned route to verify and show immediate results
      const targetRoute = state.routes.find((r) => r.pinned) || state.routes[0];
      if (state.settings.active_provider !== "demo" && targetRoute) {
        saveBtn.textContent = "Đang lấy giá Live...";
        const dateQuery = state.selectedDate ? `?date=${encodeURIComponent(state.selectedDate)}` : "";
        const refRes = await api(`/api/routes/${targetRoute.id}/refresh${dateQuery}`, { method: "POST" });
        await reloadRoutesAndCompare();
        if (refRes.route.live_error) {
          errEl.textContent = `Đã lưu key nhưng gọi API lỗi: ${refRes.route.live_error}`;
          errEl.classList.remove("hidden");
          showToast("Key đã lưu nhưng gọi API thất bại.");
          return;
        }
        showToast(`Đã lưu & cập nhật giá LIVE (${targetRoute.origin} → ${targetRoute.destination})!`);
      } else {
        showToast(`Đã lưu cấu hình nguồn dữ liệu (${state.settings.active_provider}).`);
      }

      closeSettings();
      el("settings-form").reset();
    } catch (err) {
      errEl.textContent = `Không thể lưu cấu hình: ${err.message}. Hãy chắc chắn server đã được khởi động lại.`;
      errEl.classList.remove("hidden");
      showToast("Lỗi khi lưu cấu hình!");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Lưu cấu hình";
    }
  });

  // Modal controls
  const modal = el("add-route-modal");
  const closeModal = () => {
    modal.classList.add("hidden");
    el("form-error").classList.add("hidden");
  };

  el("btn-open-modal").addEventListener("click", () => modal.classList.remove("hidden"));
  el("btn-close-modal").addEventListener("click", closeModal);
  el("btn-cancel-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  el("add-route-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = el("form-error");
    errEl.classList.add("hidden");

    const payload = {
      origin: extractIataCode(el("input-origin").value),
      destination: extractIataCode(el("input-destination").value),
      trip_type: el("input-trip-type").value,
      cabin: el("input-cabin").value,
      target_price: el("input-target-price").value ? Number(el("input-target-price").value) : null,
    };

    try {
      const res = await api("/api/routes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      closeModal();
      el("add-route-form").reset();
      state.chartRouteId = res.route.id;
      showToast(`Đã thêm route ${res.route.origin} → ${res.route.destination}`);
      await reloadRoutesAndCompare();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  });
}

bindEvents();
loadAll().catch((err) => {
  console.error(err);
  showToast("Không thể tải dữ liệu từ server.");
});
