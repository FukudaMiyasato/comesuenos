/** Interruptor sin texto: gato dormido a un lado, gato despierto al otro. */
export default function CatSwitch({ awake, onToggle }: { awake: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={awake}
      aria-label={awake ? "Escuchando. Pulsa para dormir" : "Dormido. Pulsa para despertar"}
      className={`cat-switch${awake ? " awake" : ""}`}
      onClick={onToggle}
    >
      <span className="thumb" aria-hidden />
      <svg className="cat sleeping" viewBox="0 0 32 32" aria-hidden>
        <ellipse cx="18.5" cy="22.5" rx="10.5" ry="6.3" />
        <circle cx="8.6" cy="20.4" r="5.4" />
        <path d="M3.9 18.4 3.6 12.6 8.1 15.6Z" />
        <path d="M13.3 18.2 13.8 12.6 9.4 15.5Z" />
        <path className="line" d="M28 24.5C25 30.2 14 30 8.5 27.6" />
        <path className="cut" d="M5.6 20.8q1.1 1 2.2 0M9.6 20.8q1.1 1 2.2 0" />
        <path className="zz" d="M18.5 8.5h4l-4 4.5h4M25 3.5h3l-3 3.5h3" />
      </svg>
      <svg className="cat sitting" viewBox="0 0 32 32" aria-hidden>
        <ellipse cx="15" cy="22.6" rx="6.6" ry="7.6" />
        <circle cx="15" cy="10.6" r="6.2" />
        <path d="M9.2 8.8 9.4 1.8 14.2 5.6Z" />
        <path d="M20.8 8.8 20.6 1.8 15.8 5.6Z" />
        <path className="line" d="M20.5 28C28 29 30 22.5 26.4 19" />
        <circle className="hole" cx="12.7" cy="10.4" r="1.25" />
        <circle className="hole" cx="17.3" cy="10.4" r="1.25" />
      </svg>
    </button>
  );
}
