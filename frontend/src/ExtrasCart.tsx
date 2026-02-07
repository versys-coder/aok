import type { ExtraService } from "./services";
import { EXTRA_TITLE } from "./services";

type Props = {
  extras: ExtraService[];
  onRemove: (e: ExtraService) => void;
  onClear: () => void;
};

export default function ExtrasCart({ extras, onRemove, onClear }: Props) {
  return (
    <div className="ex-cart">
      <div className="ex-cart-head">
        <div className="ex-cart-title">Выбранные опции</div>
        <button className="ui-btn ui-btn--ghost" onClick={onClear} disabled={extras.length === 0}>
          Очистить
        </button>
      </div>

      {extras.length === 0 ? (
        <div className="ex-empty">Пока ничего не выбрано</div>
      ) : (
        <div className="ex-chips">
          {extras.map((e) => (
            <div key={e} className="ex-chip">
              <span>{EXTRA_TITLE[e]}</span>
              <button className="ex-chip-x" onClick={() => onRemove(e)} aria-label="Удалить">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
