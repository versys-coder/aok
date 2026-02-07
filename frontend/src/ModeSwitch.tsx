type Props = {
  value: 1 | 2 | 3 | 4;
  onChange: (v: 1 | 2 | 3 | 4) => void;
};

export default function ModeSwitch({ value, onChange }: Props) {
  return (
    <div className="mode-switch">
      <button className={`ui-pill ${value === 1 ? "active" : ""}`}
        onClick={() => onChange(1)}>
        Вариант 1
      </button>
      <button className={`ui-pill ${value === 2 ? "active" : ""}`}
        onClick={() => onChange(2)}>
        Вариант 2
      </button>
      <button className={`ui-pill ${value === 3 ? "active" : ""}`}
        onClick={() => onChange(3)}>
        Вариант 18_01_2026
      </button>
      <button className={`ui-pill ${value === 4 ? "active" : ""}`}
        onClick={() => onChange(4)}>
        Вариант 03_02_2026
      </button>
    </div>
  );
}