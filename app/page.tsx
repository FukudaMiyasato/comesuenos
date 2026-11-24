"use client";

import { useCallback, useEffect, useState } from "react";

type Transcript = { id: string; text: string; at: number; seconds: number; error?: boolean };

const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Home() {
  const [items, setItems] = useState<Transcript[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { transcripts: Transcript[]; persistent: boolean };
      setItems(data.transcripts);
      setPersistent(data.persistent);
      setOffline(false);
    } catch {
      setOffline(true);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, [load]);

  const clear = async () => {
    await fetch("/api/transcripts", { method: "DELETE" });
    load();
  };

  const fresh = items?.[0] ? now - items[0].at < 8000 : false;

  return (
    <main>
      <header>
        <div className={`face${fresh ? " fresh" : ""}`} aria-hidden>
          <span className="eye" />
          <span className="eye" />
        </div>
        <div>
          <h1>Comesueños</h1>
          <p className="sub">Lo que escucha el ESP32, transcrito en vivo</p>
        </div>
        <span className="spacer" />
        {items && items.length > 0 && <button onClick={clear}>Limpiar</button>}
      </header>

      {offline && <div className="notice">Sin conexión con el servidor. Reintentando…</div>}
      {!persistent && (
        <div className="notice">
          Guardando en memoria (modo local). En Vercel añade Upstash Redis para que las transcripciones persistan.
        </div>
      )}

      {items === null ? null : items.length === 0 ? (
        <p className="empty">Esperando a que el dispositivo escuche algo…</p>
      ) : (
        <ol>
          {items.map((t) => (
            <li key={t.id} className={t.error ? "error" : undefined}>
              <p className="text">{t.text}</p>
              <div className="meta">
                {time.format(t.at)} · {t.seconds.toFixed(1)} s{t.error ? " · error al transcribir" : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
