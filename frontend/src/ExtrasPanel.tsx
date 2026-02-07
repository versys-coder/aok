import type { ExtraService } from "./services";
import { EXTRA_SERVICES } from "./services";

type Props = {
  selected: ExtraService[];
  onAdd: (e: ExtraService) => void;
};

export default function ExtrasPanel({ selected, onAdd }: Props) {
  return (
    <div className="ex-panel">
      <div className="ex-head">
        <div className="ex-title">Конструктор</div>
        <div className="ex-sub">Опции</div>
      </div>

      <div className="ex-list">
        {EXTRA_SERVICES.map((s) => {
          const picked = selected.includes(s.id);

          return (
            <div key={s.id} className={`ex-item ${picked ? "picked" : ""}`}>
              <div className="ex-item-title">{s.title}</div>

              <button
                className="ex-add"
                onClick={() => onAdd(s.id)}
                disabled={picked}
                title={picked ? "Уже добавлено" : "Добавить"}
              >
                {picked ? "✓" : "+"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="ex-hint">Нажмите “+”, чтобы добавить опцию.</div>
    </div>
  );
}
