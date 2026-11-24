export type View = "circles" | "day";

/** Interruptor sin texto para cambiar de gráfico: círculos ↔ línea de 24 horas. */
export default function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const day = view === "day";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={day}
      aria-label={day ? "Viendo las últimas 24 horas. Pulsa para ver los círculos" : "Viendo los círculos. Pulsa para ver las últimas 24 horas"}
      className={`icon-switch top-right${day ? " on" : ""}`}
      onClick={() => onChange(day ? "circles" : "day")}
    >
      <span className="thumb" aria-hidden />
      <svg className="icon first" viewBox="0 0 32 32" aria-hidden>
        <circle cx="12" cy="13" r="8" />
        <circle cx="23.5" cy="20.5" r="5.5" />
        <circle cx="11" cy="26" r="3.2" />
      </svg>
      <svg className="icon second" viewBox="0 0 32 32" aria-hidden>
        <path className="line" d="M9 3v26" />
        <circle cx="9" cy="8" r="3" />
        <circle cx="9" cy="16" r="3" />
        <circle cx="9" cy="24" r="3" />
        <path className="line" d="M16 8h11M16 16h7M16 24h9" />
      </svg>
    </button>
  );
}
