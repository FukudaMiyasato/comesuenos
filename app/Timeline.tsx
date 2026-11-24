import { TONE, type Mention, type Sentiment } from "./types";

const HOUR = 60 * 60 * 1000;
const hourLabel = new Intl.DateTimeFormat("es", { hour: "2-digit", hour12: false });

type Chip = { category: string; sentiment: Sentiment; count: number };

/** Agrupa menciones por categoría+sentimiento, de más a menos. */
function tally(mentions: Mention[]): Chip[] {
  const map = new Map<string, Chip>();
  for (const [category, sentiment] of mentions) {
    const key = `${category}|${sentiment}`;
    const chip = map.get(key) ?? { category, sentiment, count: 0 };
    chip.count++;
    map.set(key, chip);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/**
 * Últimas 24 horas en una línea vertical: la hora actual arriba y hacia abajo las
 * anteriores. En cada hora, los temas de los que se habló. Arriba, los más hablados.
 */
export default function Timeline({ mentions }: { mentions: Mention[] }) {
  const now = Date.now();
  const thisHour = Math.floor(now / HOUR) * HOUR;
  const day = mentions.filter((m) => m[2] > thisHour - 23 * HOUR);

  // Temas más hablados del día: una fila por categoría con su reparto de sentimiento.
  const totals = new Map<string, Record<Sentiment, number>>();
  for (const [category, sentiment] of day) {
    const t = totals.get(category) ?? { positivo: 0, neutral: 0, negativo: 0 };
    t[sentiment]++;
    totals.set(category, t);
  }
  const sum = (t: Record<Sentiment, number>) => t.positivo + t.neutral + t.negativo;
  const top = [...totals.entries()].sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, 6);
  const max = top.length ? sum(top[0][1]) : 1;

  const hours = Array.from({ length: 24 }, (_, i) => {
    const start = thisHour - i * HOUR;
    return { start, chips: tally(day.filter((m) => m[2] >= start && m[2] < start + HOUR)) };
  });

  return (
    <div className="day">
      {top.length > 0 && (
        <ol className="top" aria-label="Temas más hablados en las últimas 24 horas">
          {top.map(([category, t]) => (
            <li key={category}>
              <span className="label">{category}</span>
              <span className="bar" style={{ width: `${(sum(t) / max) * 100}%` }}>
                {(["positivo", "neutral", "negativo"] as Sentiment[]).map(
                  (s) => t[s] > 0 && <i key={s} className={TONE[s]} style={{ flexGrow: t[s] }} />,
                )}
              </span>
              <span className="n">{sum(t)}</span>
            </li>
          ))}
        </ol>
      )}

      <ol className="hours" aria-label="Temas por hora, de la más reciente a la más antigua">
        {hours.map(({ start, chips }, i) => (
          <li key={start} className={chips.length ? "busy" : "quiet"}>
            <time>{i === 0 ? "ahora" : `${hourLabel.format(start)} h`}</time>
            <span className="dot" aria-hidden />
            <div className="chips">
              {chips.map((c) => (
                <span key={`${c.category}|${c.sentiment}`} className={`chip ${TONE[c.sentiment]}`}>
                  {c.category}
                  {c.count > 1 && <b>{c.count}</b>}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
