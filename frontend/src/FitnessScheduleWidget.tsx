import React, { useEffect, useMemo, useRef, useState } from "react";

type Service = {
  id: string;
  name: string;
  total: number;
  color: string;
  image: string; // путь в /public
};

export type SlotPick = {
  serviceId: string;
  serviceName: string;
  startDateTime: string; // ISO
};

type Props = {
  onSelect: (pick: SlotPick) => void;
};

const SERVICES: Service[] = [
  { id: "svc1", name: "Номера с каменкой", total: 8, color: "#4f7cff", image: "/rooms/svc-1.jpg" },
  { id: "svc2", name: "Номера с сауной и паром, и купелью", total: 18, color: "#27b36a", image: "/rooms/svc-2.jpg" },
  { id: "svc3", name: "Номера с сауной и паром", total: 6, color: "#8c5bff", image: "/rooms/svc-3.jpg" },
  { id: "svc4", name: "Номер «Сауна»", total: 4, color: "#f1a533", image: "/rooms/svc-4.jpg" },
];

const TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00"];

function pad(v: number | string) {
  return v.toString().padStart(2, "0");
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function formatHeader(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" });
}

/** fake API: стабильно для даты+услуги+времени */
function hashSeed(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function fakeFree(dateIso: string, time: string, svc: Service) {
  const seed = hashSeed(dateIso + "|" + time + "|" + svc.id);
  const x = seed % (svc.total + 3);
  const free = Math.max(0, Math.min(svc.total, svc.total - x));
  return free;
}

type Popup = null | {
  x: number;
  y: number;
  svc: Service;
  time: string;
  dateIso: string;
  free: number;
};

export default function FitnessScheduleWidget({ onSelect }: Props) {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<{ svcId: string; time: string; dateIso: string } | null>(null);

  const dateIso = useMemo(() => isoDate(day), [day]);

  const [popup, setPopup] = useState<Popup>(null);

  const clampPopup = (x: number, y: number) => {
    const w = 280;
    const h = 250;
    const pad = 16;
    const nx = Math.min(window.innerWidth - w - pad, x + 14);
    const ny = Math.min(window.innerHeight - h - pad, y + 14);
    return { x: Math.max(pad, nx), y: Math.max(pad, ny) };
  };

  const onMove = (e: React.MouseEvent) => {
    setPopup((p) => {
      if (!p) return p;
      const pos = clampPopup(e.clientX, e.clientY);
      return { ...p, x: pos.x, y: pos.y };
    });
  };

  return (
    <div className="fitness-widget" onMouseMove={onMove}>
      <div className="fitness-sticky-top">
        <div className="fitness-header">
          <div className="fitness-header-left">
            <button className="fitness-nav-btn" onClick={() => setDay((d) => addDays(d, -1))}>
              ← день
            </button>
            <button className="fitness-nav-btn" onClick={() => setDay(startOfDay(new Date()))}>
              сегодня
            </button>
            <button className="fitness-nav-btn" onClick={() => setDay((d) => addDays(d, +1))}>
              день →
            </button>
          </div>

          <div className="fitness-header-title">{formatHeader(day)}</div>

          <div style={{ width: 120 }} />
        </div>
      </div>

      <div className="fitness-grid-wrapper">
        <div
          className="fitness-grid"
          style={{
            gridTemplateColumns: `70px repeat(${SERVICES.length}, minmax(170px, 1fr))`,
          }}
        >
          {/* header row */}
          <div className="fitness-grid-header-cell" />
          {SERVICES.map((s) => (
            <div key={s.id} className="fitness-grid-header-cell">
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>всего: {s.total}</div>
            </div>
          ))}

          {/* section утро */}
          <div className="section-row">УТРО: 08:00–16:00</div>

          {TIMES.map((time) => (
            <React.Fragment key={time}>
              <div className="fitness-time-cell">{time}</div>

              {SERVICES.map((svc) => {
                const free = fakeFree(dateIso, time, svc);
                const disabled = free <= 0;

                const isSelected =
                  selected?.svcId === svc.id && selected?.time === time && selected?.dateIso === dateIso;

                return (
                  <div key={svc.id + time} className="fitness-cell">
                    <div
                      className={`fitness-activity ${disabled ? "disabled" : ""} ${isSelected ? "selected" : ""}`}
                      onMouseEnter={(e) => {
                        const pos = clampPopup(e.clientX, e.clientY);
                        setPopup({ x: pos.x, y: pos.y, svc, time, dateIso, free });
                      }}
                      onMouseLeave={() => setPopup(null)}
                      onClick={() => {
                        if (disabled) return;

                        setSelected({ svcId: svc.id, time, dateIso });

                        // собираем ISO startDateTime
                        const startDateTime = `${dateIso}T${time}:00`;
                        onSelect({
                          serviceId: svc.id,
                          serviceName: svc.name,
                          startDateTime,
                        });
                      }}
                    >
                      <div className="fitness-activity-timebar" style={{ background: svc.color }} />

                      <div className="fitness-act-name">{time}</div>

                      <div className="fitness-act-spots">
                        {free > 0 ? `Свободно ${free}/${svc.total}` : "Нет свободных"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {popup && (
        <div className="room-popup" style={{ left: popup.x, top: popup.y }}>
          <img src={popup.svc.image} alt={popup.svc.name} />
          <div className="room-popup-body">
            <div className="room-popup-title">{popup.svc.name}</div>
            <div className="room-popup-sub">
              {formatHeader(new Date(popup.dateIso + "T00:00:00"))} • {popup.time} •{" "}
              {popup.free > 0 ? `свободно ${popup.free}/${popup.svc.total}` : "нет свободных"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
