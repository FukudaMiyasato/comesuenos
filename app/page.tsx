"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Bubbles from "./Bubbles";
import Timeline from "./Timeline";
import ViewSwitch, { type View } from "./ViewSwitch";
import { keyOf, type Data } from "./types";

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
        <div className={`face${fresh ? " fresh" : ""}${asleep ? " asleep" : ""}`} aria-hidden>
          <span className="eye" />
          <span className="eye" />
        </div>
        <ViewSwitch view={view} onChange={setView} />
      </header>
      {view === "circles" ? (
        <Bubbles bubbles={data?.bubbles ?? []} pulsing={pulsing} />
      ) : (
        <Timeline mentions={data?.recent ?? []} />
      )}
    </main>
  );
}
