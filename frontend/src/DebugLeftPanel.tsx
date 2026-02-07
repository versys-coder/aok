import React, { useEffect, useState } from "react";

export type SchedulePick = {
  dateIso: string;
  hour: number;
  serviceId: string;
  serviceName: string;
};

type Service = {
  id: string;
  name: string;
  capacity: number;
  color: string;
  image: string;
};

type TimeRow = { startHour: number; label: string };
type Cell = { remaining: number };

type Props = {
  selected: SchedulePick | null;
  onPick: (p: SchedulePick) => void;
};

const BASE = import.meta.env.BASE_URL;

const SERVICES: Service[] = [
  { id: "svc-1", name: "Номера с каменкой", capacity: 8, color: "#2563eb", image: `${BASE}rooms/svc-1.jpg` },
  { id: "svc-2", name: "Номера с сауной и паром,\nбассейном и купелью", capacity: 18, color: "#16a34a", image: `${BASE}rooms/svc-2.jpg` },
  { id: "svc-3", name: "Номера с сауной и паром,\nи купелью", capacity: 6, color: "#7c3aed", image: `${BASE}rooms/svc-3.jpg` },
  { id: "svc-4", name: "Номера «Сауна»", capacity: 4, color: "#f59e0b", image: `${BASE}rooms/svc-4.jpg` },
  { id: "svc-5", name: "Номер «Элит»", capacity: 1, color: "#ef4444", image: `${BASE}rooms/svc-5.jpg` }
];

const MORNING: TimeRow[] = [
  { startHour: 8, label: "08:00" },
  { startHour: 10, label: "10:00" },
  { startHour: 12, label: "12:00" },
  { startHour: 14, label: "14:00" }
];

const EVENING: TimeRow[] = [{ startHour: 16, label: "16:00" }];

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRu(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });
}

/* fake api */
function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function fakeFetchSchedule(dateIso: string): Promise<Record<string, Record<number, Cell>>> {
  const seed = hashSeed(dateIso);
  const hours = [...MORNING, ...EVENING].map((r) => r.startHour);

  const cells: Record<string, Record<number, Cell>> = {};
  for (const svc of SERVICES) {
    const svcCells: Record<number, Cell> = {};
    for (const h of hours) {
      const x = (seed + hashSeed(svc.id) + h * 97) % 100;
      const remaining = Math.max(0, Math.min(svc.capacity, Math.floor((svc.capacity * (100 - x)) / 120)));
      svcCells[h] = { remaining };
    }
    cells[svc.id] = svcCells;
  }
  return new Promise((resolve) => setTimeout(() => resolve(cells), 220));
}

type PreviewState =
  | null
  | { x: number; y: number; svc: Service; timeLabel: string; remaining: number };

export default function DebugLeftPanel({ selected, onPick }: Props) {
  const [dateIso, setDateIso] = useState<string>(() => todayIso());
  const [loading, setLoading] = useState(false);
  const [cells, setCells] = useState<Record<string, Record<number, Cell>> | null>(null);
  const [preview, setPreview] = useState<PreviewState>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fakeFetchSchedule(dateIso).then((res) => {
      if (!alive) return;
      setCells(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [dateIso]);

  const clampPos = (x: number, y: number) => {
    const w = 280;
    const h = 240;
    const pad = 16;
    const nx = Math.min(window.innerWidth - w - pad, x + 14);
    const ny = Math.min(window.innerHeight - h - pad, y + 14);
    return { x: Math.max(pad, nx), y: Math.max(pad, ny) };
  };

  const showPreview = (e: React.MouseEvent, svc: Service, timeLabel: string, remaining: number) => {
    const p = clampPos(e.clientX, e.clientY);
    setPreview({ x: p.x, y: p.y, svc, timeLabel, remaining });
  };

  const movePreview = (e: React.MouseEvent) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const p = clampPos(e.clientX, e.clientY);
      return { ...prev, x: p.x, y: p.y };
    });
  };

  const renderRow = (rows: TimeRow[]) =>
    rows.map((row) => (
      <tr key={row.startHour}>
        <td className="sch-rowtime">{row.label}</td>
        {SERVICES.map((svc) => {
          const remaining = cells?.[svc.id]?.[row.startHour]?.remaining ?? 0;
          const disabled = remaining <= 0;

          const isSelected =
            selected?.dateIso === dateIso &&
            selected?.hour === row.startHour &&
            selected?.serviceId === svc.id;

          return (
            <td key={`${svc.id}-${row.startHour}`}>
              <button
                className={`sch-cellbtn ${disabled ? "is-disabled" : ""} ${isSelected ? "is-selected" : ""}`}
                style={{ borderColor: isSelected ? svc.color : undefined }}
                disabled={disabled}
                onMouseEnter={(e) => showPreview(e, svc, row.label, remaining)}
                onMouseLeave={() => setPreview(null)}
                onClick={() =>
                  onPick({
                    dateIso,
                    hour: row.startHour,
                    serviceId: svc.id,
                    serviceName: svc.name
                  })
                }
              >
                <div className="sch-badge" style={{ background: `${svc.color}1f`, color: svc.color }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: svc.color }} />
                  <span>{remaining > 0 ? "свободно" : "занято"}</span>
                </div>

                <div className="sch-timebig">{row.label}</div>

                <div className="sch-cellmeta">
                  <span>{remaining > 0 ? "свободно" : "нет свободных"}</span>
                  <span>
                    {remaining}/{svc.capacity}
                  </span>
                </div>
              </button>
            </td>
          );
        })}
      </tr>
    ));

  return (
    <div className="sch-root" onMouseMove={movePreview}>
      <div className="sch-topbar">
        <div className="sch-title">DEBUG PANEL</div>

        <button onClick={() => setDateIso((d) => addDays(d, -1))}>← день</button>
        <button onClick={() => setDateIso(todayIso())}>сегодня</button>
        <button onClick={() => setDateIso((d) => addDays(d, +1))}>день →</button>

        <div className="sch-date">{formatRu(dateIso)}</div>
        {loading && <div style={{ opacity: 0.65 }}>загрузка…</div>}
      </div>

      <div className="sch-table-wrap">
        <table className="sch-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Время</th>
              {SERVICES.map((s) => (
                <th key={s.id}>
                  <div className="sch-colhead">
                    <div className="sch-colname">{s.name}</div>
                    <div className="sch-cap">всего: {s.capacity}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="sch-section" colSpan={1 + SERVICES.length}>
                УТРО: 08:00–16:00
              </td>
            </tr>
            {renderRow(MORNING)}

            <tr>
              <td className="sch-section" colSpan={1 + SERVICES.length}>
                ВЕЧЕР: 16:00–08:00
              </td>
            </tr>
            {renderRow(EVENING)}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="sch-preview" style={{ left: preview.x, top: preview.y }}>
          <img
            src={preview.svc.image}
            alt={preview.svc.name}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="sch-preview-body">
            <div className="sch-preview-title">{preview.svc.name}</div>
            <div className="sch-preview-sub">
              {formatRu(dateIso)} • {preview.timeLabel} •{" "}
              {preview.remaining > 0
                ? `свободно ${preview.remaining}/${preview.svc.capacity}`
                : "нет свободных"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
