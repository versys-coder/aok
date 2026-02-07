import { useEffect, useState } from "react";
import LeftSchedule, { Slot } from "./LeftSchedule";
import DebugBookingFlow from "./DebugBookingFlow";
import ModeSwitch from "./ModeSwitch";
import ExtrasPanel from "./ExtrasPanel";
import ExtrasCart from "./ExtrasCart";
import { ROOMS } from "./rooms";
import type { ExtraService } from "./services";
import { EXTRA_SERVICES } from "./services";
import { tariffSlotStartIso } from "../utils/date";
import LeftScheduleV3 from "./LeftScheduleV3";
import LeftScheduleV4 from "./LeftScheduleV4";
import BookingModal from "./BookingModal";
import V3Constructor from "./V3Constructor";

import "./variant3.css";

function todayIsoKazan(): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export default function DebugApp() {
  const [mode, setMode] = useState<1 | 2 | 3 | 4>(4);

  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [dateIso, setDateIso] = useState<string>(() => todayIsoKazan());

  const [bookingOpen, setBookingOpen] = useState(false);

  const [slot, setSlot] = useState<Slot | null>({
    start_date: `${todayIsoKazan()}T10:00:00`,
    appointment_id: null,
    serviceId: "lux",
    serviceName: "Люкс",
    free: 18,
    total: 18,
  });

  useEffect(() => {
    setSlot((prev) => {
      if (!prev) return prev;
      const time = prev.start_date.slice(11, 16) || "10:00";
      return { ...prev, start_date: tariffSlotStartIso(dateIso, time) };
    });
  }, [dateIso]);

  // ===== МАТРИЦА: какие опции есть в каких категориях =====
  // Берём id опций по их русскому title, чтобы не гадать про "kamenka/steam" и т.п.
  const idByTitle = (title: string) =>
    EXTRA_SERVICES.find((s) => s.title === title)?.id as ExtraService | undefined;

  const OPT = {
    KAMENKA: idByTitle("Каменка"),
    SAUNA: idByTitle("Сауна"),
    POOL: idByTitle("Бассейн"),
    STEAM: idByTitle("Пар"),
  };

  // Любая матрица (пример). Логика: показываем колонку, если она содержит ВСЕ выбранные опции.
  const COLUMN_EXTRAS: Record<string, ExtraService[]> = {
    comfort_elite: [OPT.KAMENKA, OPT.STEAM].filter(Boolean) as ExtraService[],
    lux: [OPT.POOL].filter(Boolean) as ExtraService[],
    premium: [OPT.POOL, OPT.STEAM].filter(Boolean) as ExtraService[],
    sauna: [OPT.SAUNA, OPT.STEAM].filter(Boolean) as ExtraService[],
  };

  const allowedServiceIds =
    extras.length === 0
      ? undefined
      : Object.entries(COLUMN_EXTRAS)
          .filter(([, req]) => extras.every((e) => req.includes(e)))
          .map(([colKey]) => colKey);

  // ===== старый режим 2 оставляем как был =====
  const allowedRoomIds =
    extras.length === 0
      ? undefined
      : ROOMS.filter((r) => extras.every((e) => r.extras.includes(e))).map((r) => r.id);

  const toggleExtra = (e: ExtraService) =>
    setExtras((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  return (
    <div style={{ padding: 12 }}>
      <ModeSwitch value={mode} onChange={setMode} />

      {mode === 1 ? (
        <div className="dbg-shell">
          <LeftSchedule dateIso={dateIso} onDateChange={setDateIso} selected={slot} onSelect={setSlot} />
          <div className="dbg-right">
            <DebugBookingFlow slot={slot!} />
          </div>
        </div>
      ) : mode === 2 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px minmax(0, 1fr) 420px",
            gap: 24,
            alignItems: "start",
          }}
        >
          <ExtrasPanel
            selected={extras}
            onAdd={(e) => setExtras((prev) => (prev.includes(e) ? prev : [...prev, e]))}
          />

          <div>
            <ExtrasCart
              extras={extras}
              onRemove={(e) => setExtras((prev) => prev.filter((x) => x !== e))}
              onClear={() => setExtras([])}
            />

            <LeftSchedule
              dateIso={dateIso}
              onDateChange={setDateIso}
              selected={slot}
              onSelect={setSlot}
              allowedServiceIds={allowedRoomIds}
            />
          </div>

          <div className="dbg-right">
            <DebugBookingFlow slot={slot!} />
          </div>
        </div>
      ) : mode === 3 ? (
        <>
          <div className="v3-shell">
            <div className="v3-center">
              <LeftScheduleV3
                dateIso={dateIso}
                onDateChange={setDateIso}
                selected={slot}
                onSelect={(s) => setSlot(s as any)}
                allowedServiceIds={allowedServiceIds}
                filtersCount={extras.length}
                onSlotClick={(s) => {
                  setSlot(s as any);
                  setBookingOpen(true);
                }}
              />

              <V3Constructor selected={extras} onToggle={toggleExtra} onClear={() => setExtras([])} />
            </div>
          </div>

          <BookingModal open={bookingOpen} slot={slot as any} onClose={() => setBookingOpen(false)} />
        </>
      ) : (
        <>
          <div className="v3-shell">
            <div className="v3-center">
              <LeftScheduleV4
                dateIso={dateIso}
                onDateChange={setDateIso}
                selected={slot}
                onSelect={(s) => setSlot(s as any)}
                allowedServiceIds={allowedServiceIds}
                filtersCount={extras.length}
                onSlotClick={(s) => {
                  setSlot(s as any);
                  setBookingOpen(true);
                }}
              />

              <V3Constructor selected={extras} onToggle={toggleExtra} onClear={() => setExtras([])} />
            </div>
          </div>

          <BookingModal open={bookingOpen} slot={slot as any} onClose={() => setBookingOpen(false)} />
        </>
      )}
    </div>
  );
}
