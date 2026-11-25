"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Bubbles from "./Bubbles";
import Timeline from "./Timeline";
import ViewSwitch, { type View } from "./ViewSwitch";
import { keyOf, TONE, type Bubble, type Data } from "./types";

// La app de escritorio no lleva los ojos: allí no hay un dispositivo al que representen.
const DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

const ORDER = ["positivo", "neutral", "negativo"] as const;

/** Resumen del conjunto: cuántas menciones hay y cómo se reparten por sentimiento. Hace también de leyenda. */
function Summary({ bubbles }: { bubbles: Bubble[] }) {
  const total = bubbles.reduce((s, b) => s + b.count, 0);
  if (!total) return null;
  const parts = ORDER.map((sentiment) => {
    const n = bubbles.filter((b) => b.sentiment === sentiment).reduce((s, b) => s + b.count, 0);
    return { sentiment, n, pct: Math.round((n / total) * 100) };
  });
  return (
    <div className="summary-bar">
      <div className="split" role="img" aria-label={parts.map((p) => `${p.pct}% ${p.sentiment}`).join(", ")}>
        {parts.map((p) => p.n > 0 && <i key={p.sentiment} className={TONE[p.sentiment]} style={{ flexGrow: p.n }} />)}
      </div>
      <p>
        <strong>{total}</strong> {total === 1 ? "mención" : "menciones"}
        {parts.map((p) => (
          <span key={p.sentiment} className={TONE[p.sentiment]}>
            <i />
            {p.pct}% {p.sentiment}
          </span>
        ))}
      </p>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null);
  const [view, setView] = useState<View>("circles");
  const [pulsing, setPulsing] = useState<string[]>([]);
  const prev = useRef<{ counts: Map<string, number>; fake: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/data", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Data;
      setData(next);

      // Círculos cuya cuenta subió desde la consulta anterior: palpitan.
      const counts = new Map(next.bubbles.map((b) => [keyOf(b), b.count]));
      const before = prev.current;
      prev.current = { counts, fake: next.fake };
      // En la primera carga, o al encender/apagar los datos falsos, nada es "nuevo".
      if (!before || before.fake !== next.fake) return;
      const grown = [...counts].filter(([k, n]) => n > (before.counts.get(k) ?? 0)).map(([k]) => k);
      if (grown.length) setPulsing(grown);
    } catch {
      // sin conexión: se reintenta en la siguiente vuelta
    }
  }, []);

  // Solo se consulta con la pestaña visible, para no gastar invocaciones en segundo plano.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    tick();
    const id = setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  useEffect(() => {
    if (!pulsing.length) return;
    const id = setTimeout(() => setPulsing([]), 4500);
    return () => clearTimeout(id);
  }, [pulsing]);

  const fresh = pulsing.length > 0;
  const asleep = data ? !data.listening : false;

  return (
    <main className="home">
      <header>
        {!DESKTOP && (
          <div className={`face${fresh ? " fresh" : ""}${asleep ? " asleep" : ""}`} aria-hidden>
            <span className="eye" />
            <span className="eye" />
          </div>
        )}
        <Summary bubbles={data?.bubbles ?? []} />
        <ViewSwitch view={view} onChange={setView} />
      </header>
      {data && data.bubbles.length === 0 ? (
        <p className="empty">{asleep ? "En pausa. Actívame desde Administración." : "Escuchando… todavía no hay nada que mostrar."}</p>
      ) : view === "circles" ? (
        <Bubbles bubbles={data?.bubbles ?? []} pulsing={pulsing} />
      ) : (
        <Timeline mentions={data?.recent ?? []} />
      )}
    </main>
  );
}
