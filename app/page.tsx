"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Bubbles, { type Category, type Tone } from "./Bubbles";
import CatSwitch from "./CatSwitch";

export type Sentiment = "positivo" | "neutral" | "negativo";
export type Transcript = {
  id: string;
  text: string;
  at: number;
  seconds: number;
  sentiment?: Sentiment;
  categories?: string[];
};

const UNCLASSIFIED = "sin clasificar";
const SCORE: Record<Sentiment, number> = { positivo: 1, neutral: 0, negativo: -1 };

/** Agrupa los textos por categoría; el color sale del sentimiento medio de sus textos. */
function groupByCategory(items: Transcript[]): Category[] {
  const map = new Map<string, Transcript[]>();
  for (const t of items) {
    if (!t.text) continue;
    for (const name of t.categories?.length ? t.categories : [UNCLASSIFIED]) {
      const list = map.get(name) ?? [];
      list.push(t);
      map.set(name, list);
    }
  }
  return [...map.entries()].map(([name, list]) => {
    const mean = list.reduce((s, t) => s + SCORE[t.sentiment ?? "neutral"], 0) / list.length;
    const tone: Tone = mean > 0.2 ? "pos" : mean < -0.2 ? "neg" : "neu";
    return { name, tone, items: list };
  });
}

export default function Home() {
  const [items, setItems] = useState<Transcript[]>([]);
  const [listening, setListening] = useState(true);
  const [pulsing, setPulsing] = useState<string[]>([]);
  const [fresh, setFresh] = useState(false);
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { transcripts: Transcript[]; listening: boolean };
      setItems(data.transcripts);
      setListening(data.listening);

      // Textos que no estaban en la consulta anterior: sus círculos palpitan.
      const ids = new Set(data.transcripts.map((t) => t.id));
      const before = seen.current;
      seen.current = ids;
      if (!before) return; // primera carga: nada es "nuevo"
      const arrived = data.transcripts.filter((t) => t.text && !before.has(t.id));
      if (arrived.length) {
        setPulsing([...new Set(arrived.flatMap((t) => (t.categories?.length ? t.categories : [UNCLASSIFIED])))]);
        setFresh(true);
      }
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
    const id = setTimeout(() => {
      setPulsing([]);
      setFresh(false);
    }, 4500);
    return () => clearTimeout(id);
  }, [pulsing]);

  const toggle = async () => {
    const next = !listening;
    setListening(next); // respuesta inmediata; el sondeo confirma el valor real
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listening: next }),
    }).catch(() => {});
    load();
  };

  const categories = useMemo(() => groupByCategory(items), [items]);

  return (
    <main>
      <header>
        <div className={`face${fresh ? " fresh" : ""}${listening ? "" : " asleep"}`} aria-hidden>
          <span className="eye" />
          <span className="eye" />
        </div>
        <CatSwitch awake={listening} onToggle={toggle} />
      </header>
      <Bubbles categories={categories} pulsing={pulsing} />
    </main>
  );
}
