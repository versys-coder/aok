import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, formatRu, todayIso } from "../utils/date";
import "./schedule.css";

/**
 * LeftSchedule.tsx
 * -----------------------------------------------------------------------------
 * ВАЖНО: файл специально оставлен "большим" (500+ строк) — без сокращений архитектуры.
 * Здесь сохранены:
 *  - Excel-подобная структура (шапка категорий + строка "Свободно (...)")
 *  - 3 раскрывающиеся секции (утро / вечер / ночь)
 *  - tooltip (hover) с картинкой и подробностями
 *  - регуляторы "цветности" (toneGrid/toneCards/toneSections)
 *  - логика night (00:00–08:00) на следующий календарный день
 *  - плавное переключение при смене даты
 *
 * Исправлено по твоим требованиям:
 *  1) Полоса дат НЕ "вылезает" (Variant 1 / Variant 2) — dayCount = 1/3/5 максимум,
 *     плюс компактный формат подписи (dd.mm + 2 буквы дня недели).
 *  2) Прошлые дни скрыты (лента начинается не раньше today).
 *  3) Затемнение ПРОШЕДШИХ ЧАСОВ ТОЛЬКО для сегодняшнего дня.
 *     (Нет слова "прошло", просто визуальное затемнение и отключение клика.)
 * -----------------------------------------------------------------------------
 */

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
  onDateChange?: (nextIso: string) => void;
  selected: Slot | null;
  onSelect: (s: Slot) => void;
  allowedServiceIds?: string[];
};

type Service = {
  id: string;
  name: string;
  total: number;
  img: string;
};

const BASE = import.meta.env.BASE_URL;

/**
 * Категории
 * (в плашках длинные названия не используем, но в tooltip/шапке — показываем).
 */
const SERVICES: Service[] = [
  { id: "s1", name: "Номера с каменкой", total: 8, img: `${BASE}rooms/svc-1.jpg` },
  { id: "s2", name: "Номера с сауной и паром, бассейном и купелью", total: 18, img: `${BASE}rooms/svc-2.jpg` },
  { id: "s3", name: "Номера с сауной и паром, и купелью", total: 6, img: `${BASE}rooms/svc-3.jpg` },
  { id: "s4", name: "Номера «Сауна»", total: 4, img: `${BASE}rooms/svc-4.jpg` },
  { id: "s5", name: "Номер «Элит»", total: 1, img: `${BASE}rooms/svc-5.jpg` },
];

/**
 * Секции / интервалы
 *  - УТРО:   08:00–16:00 (старты 08,10,12,14)
 *  - ВЕЧЕР:  16:00–24:00 (старты 16,18,20,22)
 *  - НОЧЬ:   00:00–08:00 (старты 00,02,04,06) — это следующий календарный день
 */
const MORNING_STARTS = ["08:00", "10:00", "12:00", "14:00"];
const EVENING_STARTS = ["16:00", "18:00", "20:00", "22:00"];
const NIGHT_STARTS = ["00:00", "02:00", "04:00", "06:00"];

/**
 * Для компактного отображения дней в полосе:
 * dd.mm + (ПН/ВТ/СР/ЧТ/ПТ/СБ/ВС)
 */
const WEEKDAYS_SHORT_RU = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];

/* =============================================================================
 * Utils (дата/время)
 * ============================================================================= */

function pad(v: number | string) {
  return v.toString().padStart(2, "0");
}

type DayCell = { iso: string; js: Date; isToday: boolean };

function isTodayDate(d: Date) {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * Возвращает N последовательных дней, начиная со startIso (YYYY-MM-DD)
 * startIso мы держим "не раньше today" (см. эффекты ниже).
 */
function getConsecutiveDays(startIso: string, count: number): DayCell[] {
  const res: DayCell[] = [];
  for (let i = 0; i < count; i++) {
    const iso = addDays(startIso, i);
    const d = new Date(`${iso}T00:00:00`);
    res.push({ iso, js: d, isToday: isTodayDate(d) });
  }
  return res;
}

/**
 * Компактный формат для пилюль дат:
 *  "24.12 СР"
 * Если today — можем выделять стилем, но текст оставляем компактным (без "СЕГОДНЯ"),
 * чтобы гарантированно влезало.
 */
function formatDayPill(d: DayCell) {
  const dd = pad(d.js.getDate());
  const mm = pad(d.js.getMonth() + 1);
  const wd = WEEKDAYS_SHORT_RU[d.js.getDay()];
  return `${dd}.${mm} ${wd}`;
}

/**
 * Вспомогательное: добавить N часов к "HH:MM"
 */
function addHoursLabel(hhmm: string, delta: number) {
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(3, 5));
  const n = (hh + delta + 24) % 24;
  return `${String(n).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Отображение интервала (2 часа)
 * "08:00 - 10:00"
 */
function rangeLabel(start: string) {
  return `${start} - ${addHoursLabel(start, 2)}`;
}

/**
 * Ночная секция (00-08) относится к следующему календарному дню.
 * Для простоты: все старты < 08:00 — это следующий день относительно displayDateIso.
 */
function isAfterMidnight(start: string) {
  return start === "00:00" || start === "02:00" || start === "04:00" || start === "06:00";
}

/**
 * Для конкретной ячейки (displayDateIso = выбранный день в UI),
 * рассчитываем реальный календарный день слота.
 */
function cellDateIso(displayDateIso: string, start: string) {
  return isAfterMidnight(start) ? addDays(displayDateIso, 1) : displayDateIso;
}

/**
 * Полная ISO-метка старта слота "YYYY-MM-DDTHH:MM:00"
 */
function cellStartIso(displayDateIso: string, start: string) {
  return `${cellDateIso(displayDateIso, start)}T${start}:00`;
}

/**
 * Прошедшее/не прошедшее
 * Слот 2 часа: если end <= now -> прошедший.
 */
function isPastSlot(startIso: string) {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return end.getTime() <= Date.now();
}

/* =============================================================================
 * Fake availability (демо-данные)
 * ============================================================================= */

/**
 * Хэш-стабилизатор (чтобы числа выглядели "разными", но повторяемыми)
 */
function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Фейковое "сколько свободно" для конкретного сервиса и слота:
 *  - иногда 0 (занято)
 *  - иначе: 1..total
 *
 * Мы используем (slotDateIso, start, svc.id), чтобы "ночь" считалась на правильную дату.
 */
function fakeFree(slotDateIso: string, start: string, svc: Service) {
  const seed = hashSeed(`${slotDateIso}|${start}|${svc.id}`);
  const r = seed % 100;

  // ~18% полностью занято
  if (r < 18) return 0;

  // иначе — чуть "съедаем" места, но оставляем 1..total
  const maxTake = Math.max(1, Math.min(5, svc.total));
  const take = seed % maxTake;
  return Math.max(1, svc.total - take);
}

/* =============================================================================
 * Tooltip types
 * ============================================================================= */

type Tip = null | {
  x: number;
  y: number;
  svc: Service;
  dateIso: string; // реальный календарный день слота
  start: string;
  free: number;
};

/* =============================================================================
 * Responsive: сколько показывать дней в полосе, чтобы ВЛЕЗАЛО всегда
 * ============================================================================= */

/**
 * Мы сознательно держим максимум 5 дат.
 * Это решает "Не влезает ни в вариант 1 ни в вариант 2".
 */
function calcDayCount() {
  if (typeof window === "undefined") return 5;
  const w = window.innerWidth;

  // очень узко — 1
  if (w < 520) return 1;

  // планшет/узко — 3
  if (w < 900) return 3;

  // всё остальное — 5 (не 7!)
  return 5;
}

/* =============================================================================
 * Component
 * ============================================================================= */

export default function LeftSchedule({
  dateIso,
  onDateChange,
  selected,
  onSelect,
  allowedServiceIds,
}: Props) {
  /* -------------------- UI states -------------------- */

  const [openMorning, setOpenMorning] = useState(true);
  const [openEvening, setOpenEvening] = useState(false);
  const [openNight, setOpenNight] = useState(false);

  const [tip, setTip] = useState<Tip>(null);
  const hoverTimer = useRef<number | null>(null);

  const [switching, setSwitching] = useState(false);

  // Цветность (UI регуляторы)
  const [toneGrid, setToneGrid] = useState(100);
  const [toneCards, setToneCards] = useState(100);
  const [toneSections, setToneSections] = useState(100);

  const today = todayIso();

  /* -------------------- date strip model (keep architecture) -------------------- */

  // Окно полосы дат: всегда начинается не раньше today
  const [stripStartIso, setStripStartIso] = useState<string>(() => {
    const base = dateIso || today;
    return base < today ? today : base;
  });

  // Сколько дней в окне (ограничено 1/3/5)
  const [dayCount, setDayCount] = useState<number>(() => calcDayCount());

  // ресайз — обновляем dayCount
  useEffect(() => {
    const onResize = () => setDayCount(calcDayCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // выбранная дата не должна быть в прошлом
  useEffect(() => {
    if (!onDateChange) return;
    if (dateIso < today) onDateChange(today);
  }, [dateIso, onDateChange, today]);

  // окно дат не должно уходить в прошлое + подтягиваем окно, если выбранный день вне окна
  useEffect(() => {
    if (stripStartIso < today) setStripStartIso(today);

    const end = addDays(stripStartIso, dayCount - 1);

    // если выбрали дату за пределами окна справа — сдвигаем окно к выбранной
    if (dateIso > end) setStripStartIso(dateIso);

    // если каким-то образом слева — поджимаем к today
    if (dateIso < stripStartIso) setStripStartIso(dateIso < today ? today : dateIso);
  }, [dateIso, stripStartIso, today, dayCount]);

  const weekDays = useMemo(() => getConsecutiveDays(stripStartIso, dayCount), [stripStartIso, dayCount]);

  /* -------------------- switching animation on date change -------------------- */

  useEffect(() => {
    setSwitching(true);
    const t = window.setTimeout(() => setSwitching(false), 220);
    return () => window.clearTimeout(t);
  }, [dateIso]);

  /* -------------------- services filtered -------------------- */

  const services = useMemo(
    () => SERVICES.filter((s) => !allowedServiceIds || allowedServiceIds.includes(s.id)),
    [allowedServiceIds]
  );

  /* -------------------- grid columns (keep excel-ish header) -------------------- */

  const gridCols = useMemo(
    () => `140px repeat(${services.length}, minmax(0, 1fr))`,
    [services.length]
  );

  /* -------------------- header "free by selected time" -------------------- */

  const fallbackStart = MORNING_STARTS[0];

  // Берём время/дату из выбранного слота, иначе — дефолт (утро 08:00)
  const headerTime = selected?.start_date?.slice(11, 16) || fallbackStart;
  const headerRealDate = selected?.start_date?.slice(0, 10) || cellDateIso(dateIso, headerTime);
  const headerLabel = rangeLabel(headerTime);

  /* =============================================================================
   * Tooltip helpers
   * ============================================================================= */

  const showTip = (
    e: React.MouseEvent,
    svc: Service,
    start: string,
    free: number,
    slotRealDateIso: string
  ) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = 320;
    const h = 270;
    const padPx = 16;

    const x = Math.min(window.innerWidth - w - padPx, r.right + 14);
    const y = Math.min(window.innerHeight - h - padPx, r.top);

    setTip({
      x: Math.max(padPx, x),
      y: Math.max(padPx, y),
      svc,
      dateIso: slotRealDateIso,
      start,
      free,
    });
  };

  const hideTip = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setTip(null);
  };

  /* =============================================================================
   * PAST hours shading (today only)
   * =============================================================================
   * Требование: "Делаем затемненными прошедшие часы сегодняшнего дня."
   *
   * Логика:
   *  - past = (display day is today) AND (slot ended)
   *  - для ночных слотов (00:00..06:00) реальная дата = tomorrow, значит не past сегодня.
   *    Это корректно, потому что cellStartIso(dateIso,start) для ночи даст tomorrow.
   * ============================================================================= */

  function isPastForUI(startIso: string) {
    // затемнение только если выбранный день = сегодня
    if (dateIso !== today) return false;
    return isPastSlot(startIso);
  }

  /* =============================================================================
   * RENDER rows
   * ============================================================================= */

  const renderTimeRows = (starts: string[], rowBaseIndex: number) =>
    starts.map((start, rowIndex) => {
      return (
        <div
          key={start}
          className="xls-row"
          style={{ ["--grid-cols" as any]: gridCols } as React.CSSProperties}
        >
          <div className="xls-time">{rangeLabel(start)}</div>

          {services.map((svc, colIndex) => {
            const start_date = cellStartIso(dateIso, start);
            const realDateIso = cellDateIso(dateIso, start);

            const free = fakeFree(realDateIso, start, svc);

            const past = isPastForUI(start_date);
            const disabled = free <= 0 || past;

            const availability = free > 0 ? "free" : "busy";

            const active =
              selected?.serviceId === svc.id &&
              selected?.start_date === start_date;

            // Небольшая "лесенка" появления (оставляем твой стиль)
            const delay = (rowBaseIndex + rowIndex) * 55 + colIndex * 35;

            return (
              <div key={svc.id} className="xls-cell">
                <div
                  className={`ls-card xls-card ${active ? "active" : ""} ${availability} ${past ? "past" : ""}`}
                  style={{ animationDelay: `${delay}ms` }}
                  onClick={() => {
                    if (disabled) return;
                    onSelect({
                      start_date,
                      appointment_id: null,
                      serviceId: svc.id,
                      serviceName: svc.name,
                      free,
                      total: svc.total,
                    });
                  }}
                  onMouseEnter={(e) => {
                    const ev = e;
                    hoverTimer.current = window.setTimeout(
                      () => showTip(ev, svc, start, free, realDateIso),
                      160
                    );
                  }}
                  onMouseLeave={hideTip}
                  role="button"
                  aria-disabled={disabled}
                >
                  {/* ВАЖНО: пользователь просил убрать "верхнюю подпись время в плашке даты".
                      В текущей архитектуре timebar — это как раз верхняя полоса.
                      Но ты ранее просил время по центру плашки.
                      Поэтому:
                      - timebar оставляем как "фон/акцент" можно отключить стилями,
                      - фактический текст времени делаем в центре (см. .xls-card-main ниже).
                  */}
                  <div className="xls-timebar" aria-hidden />

                  <div className="xls-card-main">
                    <div className="xls-timecenter">{rangeLabel(start)}</div>
                    <div className="xls-free">Свободно {free} из {svc.total}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    });

  /* =============================================================================
   * Handlers (week shift)
   * ============================================================================= */

  const shiftWindow = (dirWeeks: number) => {
    const nextStart = addDays(stripStartIso, dirWeeks * 7);

    // прошлые дни запрещены: clamp к today
    const clamped = nextStart < today ? today : nextStart;

    setStripStartIso(clamped);

    // Чтобы UX был предсказуемым: при сдвиге окна меняем выбранный день на начало окна
    onDateChange?.(clamped);
  };

  /* =============================================================================
   * RENDER
   * ============================================================================= */

  return (
    <div
      className="ls-root"
      style={{
        ["--toneGrid" as any]: (toneGrid / 100).toFixed(2),
        ["--toneCards" as any]: (toneCards / 100).toFixed(2),
        ["--toneSections" as any]: (toneSections / 100).toFixed(2),
      } as React.CSSProperties}
    >
      {/* ===================== TOPBAR ===================== */}
      <div className="ls-topbar">
        <div className="ls-title">Расписание</div>

        {/* ---------- week strip ---------- */}
        <div className="ls-week">
          <button
            className="ui-btn ui-btn--circle"
            onClick={() => shiftWindow(-1)}
            disabled={!onDateChange || stripStartIso <= today}
            aria-label="Предыдущая неделя"
            title="Предыдущая неделя"
          >
            ‹
          </button>

          <div className="ls-days" role="tablist" aria-label="Дни">
            {weekDays.map((d) => {
              const lbl = formatDayPill(d);
              const active = d.iso === dateIso;
              return (
                <button
                  key={d.iso}
                  className={`ls-daypill ${active ? "active" : ""}`}
                  onClick={() => onDateChange?.(d.iso)}
                  disabled={!onDateChange}
                  role="tab"
                  aria-selected={active}
                  title={formatRu(d.iso)}
                >
                  <span className={`ls-daypill-label ${d.isToday ? "today" : ""}`}>{lbl}</span>
                </button>
              );
            })}
          </div>

          <button
            className="ui-btn ui-btn--circle"
            onClick={() => shiftWindow(+1)}
            disabled={!onDateChange}
            aria-label="Следующая неделя"
            title="Следующая неделя"
          >
            ›
          </button>
        </div>

        {/* ---------- tuners ---------- */}
        <div className="ls-tuner" aria-label="Регуляторы цветности">
          <div className="ls-tuner-row">
            <span>Сетка</span>
            <input
              type="range"
              min={0}
              max={100}
              value={toneGrid}
              onChange={(e) => setToneGrid(Number(e.target.value))}
            />
          </div>
          <div className="ls-tuner-row">
            <span>Плашки</span>
            <input
              type="range"
              min={0}
              max={100}
              value={toneCards}
              onChange={(e) => setToneCards(Number(e.target.value))}
            />
          </div>
          <div className="ls-tuner-row">
            <span>Секции</span>
            <input
              type="range"
              min={0}
              max={100}
              value={toneSections}
              onChange={(e) => setToneSections(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ===================== BODY ===================== */}
      {services.length === 0 ? (
        <div className="xls-empty">Нет подходящих категорий под выбранные опции</div>
      ) : (
        <div className="xls-wrap">
          {/* ---------- sticky header ---------- */}
          <div className="xls-sticky">
            <div
              className="xls-row xls-head"
              style={{ ["--grid-cols" as any]: gridCols } as React.CSSProperties}
            >
              <div className="xls-corner" />
              {services.map((svc) => (
                <div key={svc.id} className="xls-headcell">
                  {svc.name}
                </div>
              ))}
            </div>

            <div
              className="xls-row xls-count"
              style={{ ["--grid-cols" as any]: gridCols } as React.CSSProperties}
            >
              <div className="xls-corner xls-corner--sub">Свободно ({headerLabel})</div>
              {services.map((svc) => (
                <div key={svc.id} className="xls-countcell">
                  {fakeFree(headerRealDate, headerTime, svc)}
                </div>
              ))}
            </div>
          </div>

          {/* ---------- content (with switch fade) ---------- */}
          <div className={`xls-body ${switching ? "switching" : ""}`} key={dateIso}>
            {/* ===================== MORNING ===================== */}
            <div className="xls-section" onClick={() => setOpenMorning((v) => !v)} role="button">
              <span className={`xls-arrow ${openMorning ? "open" : ""}`}>▾</span>
              УТРО: 8:00-16:00
            </div>
            {openMorning && renderTimeRows(MORNING_STARTS, 0)}

            {/* ===================== EVENING ===================== */}
            <div className="xls-section" onClick={() => setOpenEvening((v) => !v)} role="button">
              <span className={`xls-arrow ${openEvening ? "open" : ""}`}>▾</span>
              ВЕЧЕР: 16:00-24:00
            </div>
            {openEvening && renderTimeRows(EVENING_STARTS, MORNING_STARTS.length + 1)}

            {/* ===================== NIGHT ===================== */}
            <div className="xls-section" onClick={() => setOpenNight((v) => !v)} role="button">
              <span className={`xls-arrow ${openNight ? "open" : ""}`}>▾</span>
              НОЧЬ: 00:00-08:00
            </div>
            {openNight && renderTimeRows(NIGHT_STARTS, MORNING_STARTS.length + EVENING_STARTS.length + 2)}
          </div>
        </div>
      )}

      {/* ===================== TOOLTIP ===================== */}
      {tip &&
        createPortal(
          <div className="ls-tooltip" style={{ left: tip.x, top: tip.y }}>
            <img
              src={tip.svc.img}
              alt=""
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div style={{ fontWeight: 900 }}>{tip.svc.name}</div>
            <div className="ls-tip-sub">
              {formatRu(tip.dateIso)} • {rangeLabel(tip.start)} •{" "}
              {tip.free > 0 ? `свободно ${tip.free}/${tip.svc.total}` : "занято"}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/**
 * -----------------------------------------------------------------------------
 * Примечание по CSS (обязательно применить в schedule.css, если ещё не внесено):
 *
 * 1) Чтобы полоса дат точно влезала:
 *    .ls-days { overflow:hidden; max-width:100%; gap:6px; }
 *    .ls-daypill { white-space:nowrap; flex-shrink:0; }
 *
 * 2) Чтобы затемнять прошедшие слоты:
 *    .xls-card.past { opacity:.45; filter: grayscale(.15); pointer-events:none; }
 *
 * 3) Чтобы убрать "верхнюю подпись времени" и сделать время по центру:
 *    .xls-timebar { display:none; } (или оставить как тонкую линию)
 *    .xls-timecenter { text-align:center; font-weight:700; }
 *
 * 4) Шрифт Roboto Condensed Medium должен быть подключен глобально.
 * -----------------------------------------------------------------------------
 */
