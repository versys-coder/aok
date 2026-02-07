import type { ExtraService } from "./services";
import { EXTRA_TITLE } from "./services";
import { ROOMS } from "./rooms";
import type { Slot } from "./LeftSchedule";

type Props = {
  extras: ExtraService[];
  onPickRoom: (slot: Slot) => void;
  dateIso: string;
};

export default function FilteredRooms({ extras, onPickRoom, dateIso }: Props) {
  const allRooms = Object.values(ROOMS);

  const matched =
    extras.length === 0
      ? allRooms
      : allRooms.filter((r) => extras.every((e) => r.extras.includes(e)));

  if (matched.length === 0) {
    return (
      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 12,
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.10)",
        }}
      >
        Нет номеров с выбранным набором услуг
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Подходящие номера: {matched.length}
      </div>

      {extras.length > 0 && (
        <div style={{ marginBottom: 10, color: "rgba(15,23,42,0.65)", fontWeight: 700 }}>
          Фильтр: {extras.map((e) => EXTRA_TITLE[e]).join(", ")}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {matched.map((r) => (
          <div
            key={r.id}
            onClick={() =>
              onPickRoom({
                start_date: new Date(`${dateIso}T10:00:00`).toISOString(),
                appointment_id: null,
                serviceId: r.id,
                serviceName: r.name,
                free: 1,
                total: 1,
              })
            }
            style={{
              cursor: "pointer",
              borderRadius: 18,
              border: `1px solid ${r.color}33`,
              background: r.bg,
              boxShadow: "0 12px 30px rgba(15,23,42,0.10)",
              overflow: "hidden",
              transition: "transform .15s ease, box-shadow .15s ease",
            }}
          >
            <div style={{ height: 160, background: "#fff" }}>
              <img
                src={r.image}
                alt={r.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>

            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 900, color: r.color }}>{r.name}</div>
              <div
                style={{
                  marginTop: 6,
                  color: "rgba(15,23,42,0.65)",
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Услуги: {r.extras.map((e) => EXTRA_TITLE[e]).join(", ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
