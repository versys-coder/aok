import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, formatRu, kaz_local_to_utc_ms, todayIso } from "../utils/date";

export type Slot = {
  start_date: string;
  appointment_id: string | null;
  serviceId: string;
  serviceName: string;
  free: number;
  total: number;
};

type Props = {
  dateIso: string;
  onDateChange?: (iso: string) => void;
  selected?: Slot | null;
  onSelect: (slot: Slot) => void;
  onSlotClick?: (slot: Slot) => void;
  /** здесь передаем ключи колонок: comfort_elite/lux/premium/sauna */
  allowedServiceIds?: string[] | null;
  filtersCount?: number;
};

type Service = { id: string; title: string; total: number };
type V3Column = { key: string; title: string; totalLabel: string; svcIds: string[]; img: string };

const V3_ACCENT = "#0EA5A4";
const V3_BG = "linear-gradient(180deg, rgba(189, 189, 189, 0.78), rgba(255,255,255,0.92))";
const V3_CARD = "rgba(255,255,255,0.62)";
const V3_RADIUS = 22;
const V3_FONT_SIZE = 15;
const V3_FONT = "Lora";

const V3_STAGGER_STEP_MS = 10;
const V3_STAGGER_CAP_MS = 240;

const BASE = (import.meta as any).env?.BASE_URL ?? "/";
const p = (path: string) => `${BASE}${path.replace(/^\//, "")}`;
const V3_BG_PHOTO_URL = p("img/schedule-bg.jpg");

const BASE_SERVICES: Service[] = [
  { id: "comfort_elite", title: "Комфорт\nЭлит", total: 9 },
  { id: "lux", title: "Люкс", total: 18 },
  { id: "premium", title: "Премиум", total: 6 },
  { id: "sauna", title: "Сауна", total: 4 },
];

const V3_COLUMNS: V3Column[] = [
  { key: "comfort_elite", title: "КОМФОРТ\nЭЛИТ", totalLabel: "8+1", svcIds: ["comfort_elite"], img: p("rooms/svc-1.jpg") },
  { key: "lux", title: "ЛЮКС", totalLabel: "18", svcIds: ["lux"], img: p("rooms/svc-2.jpg") },
  { key: "premium", title: "ПРЕМИУМ", totalLabel: "6", svcIds: ["premium"], img: p("rooms/svc-3.jpg") },
  { key: "sauna", title: "САУНА", totalLabel: "4", svcIds: ["sauna"], img: p("rooms/svc-4.jpg") },
];

// УТРО/НОЧЬ — секции (свернуты по умолчанию), 10–22 — строки всегда видимы
const MORNING_STARTS = ["06:00", "08:00"] as const; // 06–08, 08–10
const DAY_STARTS = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"] as const; // 10–12 ... 20–22
const NIGHT_STARTS = ["22:00", "00:00", "02:00", "04:00"] as const; // 22–00 ... 04–06

type SectionKey = "morning" | "night";

// Описания только для КОМФОРТ/ЛЮКС (тексты потом замените)
const SERVICE_DESCRIPTIONS: Partial<Record<string, string>> = {
  comfort_elite: `Печь, протопленная дровами, нагревает чугунные чушки и специальные камни.

Самый качественный и высокотемпературный сухой пар из котельной.

Влажный пар  из котельной открыв кран в потребном объеме

Купель с ледяной водой.

Бассейн 1,5 × 2,5 м со специальной водоподготовкой.`,
  lux: ``,
};

function capFirst(s: string) {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function formatDayPillParts(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { date: iso, weekday: "" };

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  // полдень UTC — чтобы не было сдвигов на границе суток
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));

  const dd = String(d).padStart(2, "0");
  const mm = String(mo).padStart(2, "0");

  const weekday = capFirst(new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "Europe/Moscow" }).format(dt));
  return { date: `${dd}.${mm}`, weekday };
}

function rangeLabel(startHHMM: string) {
  const [h, m] = startHHMM.split(":").map(Number);
  const endH = (h + 2) % 24;
  return `${startHHMM} - ${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cellDateIso(dateIso: string, startHHMM: string) {
  const hh = Number(startHHMM.slice(0, 2));
  if (hh < 6) return addDays(dateIso, -1);
  return dateIso;
}

function cellStartIso(realDateIso: string, startHHMM: string) {
  return `${realDateIso}T${startHHMM}:00`;
}

function isPastSlotKazan(realDateIso: string, startHHMM: string) {
  const slotUtcMs = kaz_local_to_utc_ms(realDateIso, startHHMM);
  return slotUtcMs < Date.now();
}

/** искусственный free + “красные” для примера */
function fakeFree(dateIso: string, startHHMM: string, service: Service) {
  const weekday = new Date(`${dateIso}T00:00:00`).getDay(); // 0=вс ... 5=пт
  if (service.id === "lux" && startHHMM === "12:00") return 0;
  if (service.id === "sauna" && startHHMM === "18:00") return 0;
  if (service.id === "premium" && weekday === 5 && startHHMM === "20:00") return 0;

  const seed =
    (Number(dateIso.slice(-2)) +
      Number(startHHMM.slice(0, 2)) * 3 +
      Number(startHHMM.slice(3, 5)) +
      service.id.length * 7) %
    11;

  const base = Math.max(0, service.total - (seed % Math.max(1, Math.floor(service.total / 2))));
  const clamp = Math.min(service.total, base);
  if (service.id === "comfort_elite") return Math.min(9, clamp);
  return clamp;
}

export default function LeftScheduleV3({
  dateIso,
  onDateChange,
  selected,
  onSelect,
  onSlotClick,
  allowedServiceIds,
  filtersCount = 0,
}: Props) {
  const today = useMemo(() => todayIso(), []);
  const [stripStartIso, setStripStartIso] = useState(() => dateIso || today);

  useEffect(() => {
    if (stripStartIso > dateIso) setStripStartIso(dateIso);
  }, [dateIso, stripStartIso]);

  // УТРО/НОЧЬ закрыты по умолчанию
  const [openKey, setOpenKey] = useState<SectionKey | null>(null);

  const [bgMode, setBgMode] = useState<"photo" | "gradient">("photo");

  const [tip, setTip] = useState<null | { x: number; y: number; col: V3Column; dateIso: string; start: string; free: number }>(null);
  const hoverTimer = useRef<number | null>(null);

  const [svcInfo, setSvcInfo] = useState<null | { col: V3Column; text: string }>(null);

  useEffect(() => {
    if (!svcInfo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSvcInfo(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [svcInfo]);

  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    setSwitching(true);
    const t = window.setTimeout(() => setSwitching(false), 180);
    return () => window.clearTimeout(t);
  }, [dateIso]);

  // 7 дней
  const weekDays = useMemo(() => {
    const out: { iso: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDays(stripStartIso, i);
      out.push({ iso, isToday: iso === today });
    }
    return out;
  }, [stripStartIso, today]);

  const baseById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of BASE_SERVICES) m.set(s.id, s);
    return m;
  }, []);

  // ===== ВАЖНО: место под 4 колонки всегда одинаковое =====
  const visibleSet = useMemo(() => {
    if (!allowedServiceIds || allowedServiceIds.length === 0) return null;
    return new Set(allowedServiceIds);
  }, [allowedServiceIds]);

  const allColumns = V3_COLUMNS; // порядок фиксируем
  const isVisible = (col: V3Column) => (!visibleSet ? true : visibleSet.has(col.key));

  // gridCols ВСЕГДА на 4 колонки
  const gridCols = useMemo(() => `140px repeat(${allColumns.length}, var(--v3-colW))`, [allColumns.length]);

  const showTip = (e: React.MouseEvent, col: V3Column, start: string, free: number, slotRealDateIso: string) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 320;
    const h = 270;
    const padPx = 16;
    const x = Math.min(window.innerWidth - w - padPx, r.right + 14);
    const y = Math.min(window.innerHeight - h - padPx, r.top);
    setTip({ x: Math.max(padPx, x), y: Math.max(padPx, y), col, dateIso: slotRealDateIso, start, free });
  };

  const hideTip = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setTip(null);
  };

  const openServiceInfo = (col: V3Column) => {
    const text = SERVICE_DESCRIPTIONS[col.key];
    if (!text) return;
    setSvcInfo({ col, text });
  };

  const computeFree = (col: V3Column, realDateIso: string, start: string) => {
    let sum = 0;
    for (const id of col.svcIds) {
      const svc = baseById.get(id);
      if (!svc) continue;
      sum += fakeFree(realDateIso, start, svc);
    }
    return sum;
  };

  const computeTotalNum = (col: V3Column) => {
    let sum = 0;
    for (const id of col.svcIds) {
      const svc = baseById.get(id);
      if (!svc) continue;
      sum += svc.total;
    }
    return sum;
  };

  const renderTimeRows = (starts: readonly string[], rowBaseIndex: number) =>
    starts.map((start, rowIndex) => (
      <div key={start} className="xls-row" style={{ ["--grid-cols" as any]: gridCols } as React.CSSProperties}>
        <div className="xls-time">{rangeLabel(start)}</div>

        {allColumns.map((col, colIndex) => {
          const visible = isVisible(col);

          // если колонка скрыта — рисуем “пустую” ячейку, чтобы не схлопывалось
          if (!visible) {
            return (
              <div key={col.key} className="xls-cell">
                <div className="xls-card ghost" aria-hidden />
              </div>
            );
          }

          const realDateIso = cellDateIso(dateIso, start);
          const start_date = cellStartIso(realDateIso, start);
          const free = computeFree(col, realDateIso, start);
          const totalNum = computeTotalNum(col);

          const past = isPastSlotKazan(realDateIso, start);
          const disabled = free <= 0 || past;

          const availability = free > 0 ? "free" : "busy";
          const active = selected?.serviceId === col.key && selected?.start_date === start_date;

          const idx = (rowBaseIndex + rowIndex) * allColumns.length + colIndex;
          const delay = Math.min(idx * V3_STAGGER_STEP_MS, V3_STAGGER_CAP_MS);

          return (
            <div key={col.key} className="xls-cell">
              <div
                className={`ls-card xls-card ${active ? "active" : ""} ${availability} ${past ? "past" : ""}`}
                style={{ animationDelay: `${delay}ms` }}
                onClick={() => {
                  if (disabled) return;
                  const s: Slot = {
                    start_date,
                    appointment_id: null,
                    serviceId: col.key,
                    serviceName: col.title,
                    free,
                    total: totalNum,
                  };
                  onSelect(s);
                  onSlotClick?.(s);
                }}
                onMouseEnter={(e) => {
                  const ev = e;
                  hoverTimer.current = window.setTimeout(() => showTip(ev, col, start, free, realDateIso), 160);
                }}
                onMouseLeave={hideTip}
                role="button"
                aria-disabled={disabled}
              >
                <div className="xls-timebar" aria-hidden />
                <div className="xls-card-main">
                  <div className="xls-free xls-free--num">{free}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ));

  const shiftWindow = (dirWeeks: number) => {
    const nextStart = addDays(stripStartIso, dirWeeks * 7);
    const clamped = nextStart < today ? today : nextStart;
    setStripStartIso(clamped);
    onDateChange?.(clamped);
  };

  const hasFilters = filtersCount > 0;

  const morningOpen = openKey === "morning";
  const nightOpen = openKey === "night";

  return (
    <div
      className={`ls-root is-v3 ${hasFilters ? "has-filters" : ""}`}
      data-bg={bgMode}
      style={
        {
          ["--v3-accent" as any]: V3_ACCENT,
          ["--v3-bg" as any]: V3_BG,
          ["--v3-card" as any]: V3_CARD,
          ["--v3-radius" as any]: `${V3_RADIUS}px`,
          ["--v3-fontSize" as any]: `${V3_FONT_SIZE}px`,
          ["--v3-font" as any]: `${V3_FONT}, ui-sans-serif, system-ui, -apple-system, Segoe UI, Arial`,
          ["--v3-photo-url" as any]: `url("${V3_BG_PHOTO_URL}")`,
        } as React.CSSProperties
      }
    >
      <div className="ls-topbar">
        <div className="ls-title">Свободно</div>

        <div className="ls-week">
          <button className="ui-btn ui-btn--circle" onClick={() => shiftWindow(-1)} disabled={!onDateChange || stripStartIso <= today}>
            ‹
          </button>

          <div className="ls-days" role="tablist" aria-label="Дни">
            {weekDays.map((d) => {
              const lbl = formatDayPillParts(d.iso);
              const active = d.iso === dateIso;
              return (
                <button
                  key={d.iso}
                  className={`ls-daypill ${active ? "active" : ""}`}
                  onClick={() => onDateChange?.(d.iso)}
                  disabled={!onDateChange}
                >
                  <span className={`ls-daypill-label ${d.isToday ? "today" : ""}`}>
                    <span className="ls-daypill-date">{lbl.date}</span>
                    <span className="ls-daypill-weekday">{lbl.weekday}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button className="ui-btn ui-btn--circle" onClick={() => shiftWindow(+1)} disabled={!onDateChange}>
            ›
          </button>
        </div>

        <div className="v3-bg-toggle">
          <button type="button" className={`v3-bg-toggle__btn ${bgMode === "photo" ? "active" : ""}`} onClick={() => setBgMode("photo")}>
            Фото
          </button>
          <button type="button" className={`v3-bg-toggle__btn ${bgMode === "gradient" ? "active" : ""}`} onClick={() => setBgMode("gradient")}>
            Градиент
          </button>
        </div>
      </div>

      <div className={`xls-wrap v3-wrap ${switching ? "v3-swap" : ""}`}>
        {/* ======= STICKY HEADER (ОБЪЕДИНЕНО: название + цифра) ======= */}
        <div className="xls-sticky">
          <div className="xls-row xls-head xls-head--merged" style={{ ["--grid-cols" as any]: gridCols } as React.CSSProperties}>
            <div className="xls-corner xls-corner--merged">
              Временные
              <br />
              регламенты
            </div>

            {allColumns.map((c) => {
              const visible = isVisible(c);
              const clickable = !!SERVICE_DESCRIPTIONS[c.key];

              return (
                <div
                  key={c.key}
                  className={`xls-headcell xls-headcell--merged ${visible ? "" : "is-hidden"} ${clickable ? "is-clickable" : ""}`}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : -1}
                  onClick={() => clickable && openServiceInfo(c)}
                  onKeyDown={(e) => {
                    if (!clickable) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openServiceInfo(c);
                    }
                  }}
                  title={clickable ? "Описание" : ""}
                >
                  <div className="xls-headcell__title">
                    {c.title.includes("\n")
                      ? c.title.split("\n").map((t, i) => (
                          <React.Fragment key={i}>
                            {t}
                            {i === 0 && <br />}
                          </React.Fragment>
                        ))
                      : c.title}
                  </div>
                  <div className="xls-headcell__total">{c.totalLabel}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ======= BODY ======= */}
        <div className={`xls-body ${switching ? "switching" : ""}`} key={dateIso}>
          {/* УТРО (строка заголовка видна всегда; слоты внутри скрыты по умолчанию) */}
          <div className="xls-section" onClick={() => setOpenKey((prev) => (prev === "morning" ? null : "morning"))} role="button">
            <span className={`xls-arrow ${morningOpen ? "open" : ""}`}>▾</span>
            УТРО
          </div>
          <div className={`xls-acc ${morningOpen ? "open" : ""}`}>{renderTimeRows(MORNING_STARTS, 0)}</div>

          {/* 10–22 (всегда видимо, без заголовка секции) */}
          {renderTimeRows(DAY_STARTS, 10)}

          {/* НОЧЬ */}
          <div className="xls-section" onClick={() => setOpenKey((prev) => (prev === "night" ? null : "night"))} role="button">
            <span className={`xls-arrow ${nightOpen ? "open" : ""}`}>▾</span>
            НОЧЬ
          </div>
          <div className={`xls-acc ${nightOpen ? "open" : ""}`}>{renderTimeRows(NIGHT_STARTS, 40)}</div>
        </div>
      </div>

      {/* ======= TOOLTIP (как было) ======= */}
      {tip &&
        createPortal(
          <div className="ls-tooltip" style={{ left: tip.x, top: tip.y }}>
            <img src={tip.col.img} alt="" />
            <div style={{ fontWeight: 900 }}>{tip.col.title}</div>
            <div className="ls-tip-sub">
              {formatRu(tip.dateIso)} • {rangeLabel(tip.start)} • {tip.free > 0 ? `свободно: ${tip.free}` : "занято"} • всего: {tip.col.totalLabel}
            </div>
          </div>,
          document.body
        )}

      {/* ======= POPUP ОПИСАНИЯ (КОМФОРТ/ЛЮКС) ======= */}
      {svcInfo &&
        createPortal(
          <div
            className="ls-modal"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSvcInfo(null);
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="ls-modal__card">
<button
  type="button"
  className="ls-modal__close"
  aria-label="Закрыть"
  onClick={() => setSvcInfo(null)}
>
  ×
</button>

<div className="ls-modal__text ls-modal__text--only">{svcInfo.text}</div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
