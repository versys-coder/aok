// V3Constructor.tsx
import React, { useMemo } from "react";
import type { ExtraService } from "./services";
import { EXTRA_SERVICES } from "./services";

type Props = {
  selected: ExtraService[];
  onToggle: (e: ExtraService) => void;
  onClear: () => void;
};

// 4 плитки и порядок
const ORDER: ExtraService[] = ["steam", "sauna", "kupel", "pool"]; // пар, влажный пар, купель, бассейн

export default function V3Constructor({ selected, onToggle, onClear }: Props) {
  const hasSelected = selected.length > 0;

  const cards = useMemo(() => {
    const byId = new Map<ExtraService, (typeof EXTRA_SERVICES)[number]>();
    for (const s of EXTRA_SERVICES) byId.set(s.id, s);

    // ВАЖНО: не сортируем всё, а собираем строго по ORDER и отбрасываем лишнее (kamenka и т.п.)
    return ORDER.map((id) => byId.get(id)).filter(Boolean) as Array<(typeof EXTRA_SERVICES)[number]>;
  }, []);

  return (
    <div className="v3-extras">
      <div className="v3-ctor" role="region" aria-label="Конструктор">
        <div className="v3-ctor__head">
          <div>
            <div className="v3-ctor__title">Конструктор</div>
            <div className="v3-ctor__sub">Опции</div>
          </div>

          <button
            type="button"
            className="v3-ctor__clear"
            onClick={onClear}
            disabled={!hasSelected}
            title={hasSelected ? "Очистить" : "Нечего очищать"}
          >
            Очистить
          </button>
        </div>

        <div className="v3-ctor__list" role="list">
          {cards.map((s) => {
            const picked = selected.includes(s.id);

            return (
              <button
                key={s.id}
                type="button"
                className={`v3-ctor__card ${picked ? "picked" : ""}`}
                onClick={() => onToggle(s.id)}
                role="listitem"
                aria-pressed={picked}
              >
                <div className="v3-ctor__top">
                  <div className="v3-ctor__name">{s.title}</div>
                  <div className={`v3-ctor__badge ${picked ? "on" : "off"}`} aria-hidden="true">
                    {picked ? "✓" : "+"}
                  </div>
                </div>

                <div className="v3-ctor__img" aria-hidden="true">
                  <img src={s.thumb} alt="" loading="lazy" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
