/**
 * aok5-backend (полностью переписанный)
 *
 * Что делает:
 *  - /api/rental_times                  прокси к upstream
 *  - /api/availability_grid_elite       ЭЛИТ (автовыбор тарифа по дню/времени) + проверка 2 часов (HH:30 и HH+1:30)
 *  - /api/availability_grid_comfort     КОМФОРТ (по тарифам) -> агрегация в "8 номеров" через веса 2+2+4
 *                                      + проверка 2 часов (HH:30 и HH+1:30)
 *  - /health
 *
 * ВАЖНОЕ ОГРАНИЧЕНИЕ:
 * Upstream rental_times принимает только service_id тарифа, а не id помещения.
 */

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import https from "https";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3003);

app.use(cors());
app.use(express.json());

const httpsAgent =
  String(process.env.ALLOW_INSECURE_TLS || "").toLowerCase() === "true"
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

// -----------------------------
// ENV / HTTP helpers
// -----------------------------
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getAuthHeader() {
  const user = requireEnv("API_USERNAME");
  const pass = requireEnv("API_PASSWORD");
  const b64 = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
  return `Basic ${b64}`;
}

function getBaseUrl() {
  return requireEnv("API_BASE_URL").replace(/\/+$/, "");
}

// путь к rental_times можно переопределять без правки кода
const RENTAL_TIMES_PATH = String(process.env.API_RENTAL_TIMES_PATH || "/hs/api/v3/rental_times");

const FIXED_TOTAL_COMFORT = Number(process.env.FIXED_TOTAL_COMFORT || 8);
const FIXED_TOTAL_ELITE = Number(process.env.FIXED_TOTAL_ELITE || 1);

function buildUrl(path, queryObj = {}) {
  const url = new URL(getBaseUrl() + path);
  for (const [k, v] of Object.entries(queryObj)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function apiGet(path, query) {
  const apiKey = requireEnv("API_KEY");
  const url = buildUrl(path, query);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
      apikey: apiKey,
    },
    agent: httpsAgent,
  });

  const text = await resp.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const err = new Error(`Upstream error ${resp.status}`);
    err.status = resp.status;
    err.details = json || { raw: text };
    throw err;
  }

  return json;
}

// -----------------------------
// Date helpers
// -----------------------------
function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function isoDow(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay(); // 0=Sun..6=Sat
}

/**
 * UI-логика: 00/02/04 относятся к D-1
 */
function realDateForStart(uiDateIso, startHHMM) {
  const hh = Number(startHHMM.slice(0, 2));
  return hh < 6 ? addDaysIso(uiDateIso, -1) : uiDateIso;
}

/**
 * 2 часа окна: проверяем 2 слота HH:30 и (HH+1):30
 */
function slotTime1(startHHMM) {
  const hh = Number(startHHMM.slice(0, 2));
  return `${String(hh).padStart(2, "0")}:30`;
}
function slotTime2(startHHMM) {
  const hh = Number(startHHMM.slice(0, 2));
  const hh2 = (hh + 1) % 24;
  return `${String(hh2).padStart(2, "0")}:30`;
}

// -----------------------------
// Rental_times parsing
// -----------------------------
function normalizeRentalTimesPayload(upstreamJson) {
  return Array.isArray(upstreamJson?.data) ? upstreamJson.data : [];
}

function parseDateTime(item) {
  const s = String(item?.date_time || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!m) return { date: "", time: "" };
  return { date: m[1], time: m[2] };
}

function isFreeItem(it) {
  return !!it && (it.rental_id === null || it.rental_id === undefined);
}

function pickPrice(it1, it2) {
  const p1 = it1 && typeof it1.price === "number" ? it1.price : null;
  if (p1 !== null) return p1;
  const p2 = it2 && typeof it2.price === "number" ? it2.price : null;
  return p2;
}

async function fetchIndexedRentalTimes({ club_id, service_id, start_date, end_date }) {
  const upstream = await apiGet(RENTAL_TIMES_PATH, { club_id, service_id, start_date, end_date });
  const items = normalizeRentalTimesPayload(upstream);

  const byKey = new Map(); // "YYYY-MM-DD|HH:MM" -> item
  for (const it of items) {
    const { date: d, time: t } = parseDateTime(it);
    if (!d || !t) continue;
    byKey.set(`${d}|${t}`, it);
  }
  return byKey;
}

// -----------------------------
// Slots grid
// -----------------------------
const STARTS = ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00", "02:00", "04:00"];

// -----------------------------
// ELITE: tariff selector
// -----------------------------
function pickEliteServiceId(realDateIso, startHHMM) {
  const isDayBand = startHHMM >= "08:00" && startHHMM < "16:00";
  const dow = isoDow(realDateIso);
  const isFriToSun = dow === 5 || dow === 6 || dow === 0; // ПТ, СБ, ВС

  const ID_WEEKDAY_DAY = "23ef0056-cf1c-11ef-849a-00155d0a6605"; // будни 08-16 (1600)
  const ID_WEEKDAY_NIGHT = "5964b552-cf1c-11ef-849a-00155d0a6605"; // будни 16-08 (1800)
  const ID_FRI_SUN_DAY = "a51b1e00-cf1c-11ef-849a-00155d0a6605"; // ПТ-ВС 08-16 (1800)
  const ID_FRI_SUN_NIGHT = "0f8e7e87-cf1d-11ef-849a-00155d0a6605"; // ПТ-ВС 16-08 (2000)

  if (!isFriToSun && isDayBand) return ID_WEEKDAY_DAY;
  if (!isFriToSun && !isDayBand) return ID_WEEKDAY_NIGHT;
  if (isFriToSun && isDayBand) return ID_FRI_SUN_DAY;
  return ID_FRI_SUN_NIGHT;
}

// -----------------------------
// COMFORT: tariff IDs + weights -> "8 номеров"
// -----------------------------
const COMFORT_2F_DAY_FRI_SUN = "0ccb4d08-cf1f-11ef-849a-00155d0a6605";
const COMFORT_2F_NIGHT_FRI_SUN = "2862bb44-cf1f-11ef-849a-00155d0a6605";

const COMFORT_3F_DAY_FRI_SUN = "127add35-cf21-11ef-849a-00155d0a6605";
const COMFORT_3F_NIGHT_FRI_SUN = "2895f67c-cf21-11ef-849a-00155d0a6605";

const COMFORT_45_DAY_FRI_SAT = "5a94032b-cf25-11ef-849a-00155d0a6605";
const COMFORT_45_NIGHT_FRI_SAT = "cd29ef10-cf25-11ef-849a-00155d0a6605";

const COMFORT_WEIGHTS = {
  [COMFORT_2F_DAY_FRI_SUN]: 2,
  [COMFORT_2F_NIGHT_FRI_SUN]: 2,
  [COMFORT_3F_DAY_FRI_SUN]: 2,
  [COMFORT_3F_NIGHT_FRI_SUN]: 2,
  [COMFORT_45_DAY_FRI_SAT]: 4,
  [COMFORT_45_NIGHT_FRI_SAT]: 4,
};

function pickComfortTariffIds(realDateIso, startHHMM) {
  const isDayBand = startHHMM >= "08:00" && startHHMM < "16:00";
  const dow = isoDow(realDateIso);

  const isFriToSun = dow === 5 || dow === 6 || dow === 0; // ПТ СБ ВС
  const isFriToSat = dow === 5 || dow === 6; // ПТ СБ

  const ids = [];
  if (isFriToSun) ids.push(isDayBand ? COMFORT_2F_DAY_FRI_SUN : COMFORT_2F_NIGHT_FRI_SUN);
  if (isFriToSun) ids.push(isDayBand ? COMFORT_3F_DAY_FRI_SUN : COMFORT_3F_NIGHT_FRI_SUN);
  if (isFriToSat) ids.push(isDayBand ? COMFORT_45_DAY_FRI_SAT : COMFORT_45_NIGHT_FRI_SAT);
  return ids;
}

// -----------------------------
// ENDPOINTS
// -----------------------------
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * proxy to upstream rental_times
 * GET /api/rental_times?club_id=...&service_id=...&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 */
app.get("/api/rental_times", async (req, res) => {
  const club_id = req.query.club_id || process.env.DEFAULT_CLUB_ID;
  const service_id = req.query.service_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;

  if (!club_id) return res.status(400).json({ error: "Missing club_id" });
  if (!service_id) return res.status(400).json({ error: "Missing service_id" });

  const q = { club_id, service_id };
  if (start_date) {
    if (!isIsoDate(String(start_date))) return res.status(400).json({ error: "Invalid start_date (YYYY-MM-DD)" });
    q.start_date = String(start_date);
  }
  if (end_date) {
    if (!isIsoDate(String(end_date))) return res.status(400).json({ error: "Invalid end_date (YYYY-MM-DD)" });
    q.end_date = String(end_date);
  }

  try {
    const data = await apiGet(RENTAL_TIMES_PATH, q);
    return res.json(data);
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message, upstream: e.details });
  }
});

/**
 * ELITE grid (2 часа = 2 слота)
 * GET /api/availability_grid_elite?club_id=...&date=YYYY-MM-DD
 */
app.get("/api/availability_grid_elite", async (req, res) => {
  const club_id = req.query.club_id || process.env.DEFAULT_CLUB_ID;
  const date = req.query.date;

  if (!club_id) return res.status(400).json({ error: "Missing club_id" });
  if (!isIsoDate(String(date))) return res.status(400).json({ error: "Missing/invalid date (YYYY-MM-DD)" });

  const uiDate = String(date);
  const start_date = addDaysIso(uiDate, -1);
  const end_date = addDaysIso(uiDate, +1);

  try {
    const meta = [];
    const need = new Set();
    for (const start of STARTS) {
      const realDate = realDateForStart(uiDate, start);
      const sid = pickEliteServiceId(realDate, start);
      need.add(sid);
      meta.push({ start, realDate, sid });
    }
    const sids = Array.from(need);

    const idxBySid = new Map();
    await Promise.all(
      sids.map(async (sid) => {
        const byKey = await fetchIndexedRentalTimes({ club_id, service_id: sid, start_date, end_date });
        idxBySid.set(sid, byKey);
      })
    );

    const grid = {};
    for (const m of meta) {
      const t1 = slotTime1(m.start);
      const t2 = slotTime2(m.start);
      const byKey = idxBySid.get(m.sid);

      const it1 = byKey ? byKey.get(`${m.realDate}|${t1}`) : null;
      const it2 = byKey ? byKey.get(`${m.realDate}|${t2}`) : null;

      const free = isFreeItem(it1) && isFreeItem(it2) ? 1 : 0;
      const price = pickPrice(it1, it2);

      grid[m.start] = { free, price, service_id: m.sid, total_count: FIXED_TOTAL_ELITE };
    }

    return res.json({
      result: true,
      kind: "elite",
      service_name: "Элит",
      club_id,
      date: uiDate,
      slot_minutes: 120,
      upstream_range: { start_date, end_date },
      service_ids_used: sids,
      grid,
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Backend error", upstream: e.details || undefined });
  }
});

/**
 * COMFORT grid (8 номеров через веса) + проверка 2 часов
 * GET /api/availability_grid_comfort?club_id=...&date=YYYY-MM-DD
 */
app.get("/api/availability_grid_comfort", async (req, res) => {
  const club_id = req.query.club_id || process.env.DEFAULT_CLUB_ID;
  const date = req.query.date;

  if (!club_id) return res.status(400).json({ error: "Missing club_id" });
  if (!isIsoDate(String(date))) return res.status(400).json({ error: "Missing/invalid date (YYYY-MM-DD)" });

  const uiDate = String(date);
  const start_date = addDaysIso(uiDate, -1);
  const end_date = addDaysIso(uiDate, +1);

  try {
    const need = new Set();
    const meta = [];
    for (const start of STARTS) {
      const realDate = realDateForStart(uiDate, start);
      const tariffIds = pickComfortTariffIds(realDate, start);
      tariffIds.forEach((id) => need.add(id));
      meta.push({ start, realDate, tariffIds });
    }
    const tariffIdsAll = Array.from(need);

    const idxByTariff = new Map();
    await Promise.all(
      tariffIdsAll.map(async (sid) => {
        const byKey = await fetchIndexedRentalTimes({ club_id, service_id: sid, start_date, end_date });
        idxByTariff.set(sid, byKey);
      })
    );

    const grid = {};
    for (const m of meta) {
      const t1 = slotTime1(m.start);
      const t2 = slotTime2(m.start);

      let total_count = 0;
      let free_count = 0;
      let min_price = null;

      for (const sid of m.tariffIds) {
        const w = COMFORT_WEIGHTS[sid] ?? 1;
        const byKey = idxByTariff.get(sid);

        const it1 = byKey ? byKey.get(`${m.realDate}|${t1}`) : null;
        const it2 = byKey ? byKey.get(`${m.realDate}|${t2}`) : null;

        // тариф учитываем только если оба слота присутствуют
        if (!it1 || !it2) continue;

        total_count += w;

        const free = isFreeItem(it1) && isFreeItem(it2);
        if (free) {
          free_count += w;
          const price = pickPrice(it1, it2);
          if (price !== null) min_price = min_price === null ? price : Math.min(min_price, price);
        }
      }

      if (total_count === 0) total_count = FIXED_TOTAL_COMFORT;

      grid[m.start] = { free_count, total_count, min_price };
    }

    return res.json({
      result: true,
      kind: "comfort",
      service_name: "Комфорт",
      club_id,
      date: uiDate,
      slot_minutes: 120,
      upstream_range: { start_date, end_date },
      service_ids_used: tariffIdsAll,
      grid,
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message || "Backend error", upstream: e.details || undefined });
  }
});

app.listen(PORT, () => {
  console.log(`Backend started: http://127.0.0.1:${PORT}`);
});