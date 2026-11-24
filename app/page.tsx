"use client";

import { useCallback, useEffect, useState } from "react";

type Transcript = {
  id: string;
  text: string;
  at: number;
  seconds: number;
  error?: boolean;
  audio?: boolean;
  note?: string;
};

const time = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Home() {
  const [items, setItems] = useState<Transcript[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [offline, setOffline] = useState(false);
  const [listening, setListening] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/transcripts", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { transcripts: Transcript[]; persistent: boolean; listening: boolean };
      setItems(data.transcripts);
      setPersistent(data.persistent);
      setListening(data.listening);
      setOffline(false);
    } catch {
      setOffline(true);
    }
    setNow(Date.now());
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

  const clear = async () => {
    await fetch("/api/transcripts", { method: "DELETE" });
    load();
  };

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

  const fresh = items?.[0] ? now - items[0].at < 10000 : false;

  return (
    <main>
      <header>
        <div className={`face${fresh ? " fresh" : ""}${listening ? "" : " asleep"}`} aria-hidden>
          <span className="eye" />
          <span className="eye" />
        </div>
        <div>
          <h1>Comechismes</h1>
          <p className="sub">Lo que escucha el ESP32, transcrito en vivo</p>
        </div>
        <span className="spacer" />
        <label className="switch">
          <input type="checkbox" role="switch" checked={listening} onChange={toggle} />
          <span className="track" aria-hidden />
          <span>{listening ? "Escuchando" : "En pausa"}</span>
        </label>
        {items && items.length > 0 && <button onClick={clear}>Limpiar</button>}
      </header>

      {offline && <div className="notice">Sin conexión con el servidor. Reintentando…</div>}
      {!persistent && (
        <div className="notice">
          Guardando en memoria (modo local). En Vercel añade Upstash Redis para que las transcripciones persistan.
        </div>
      )}

      {!listening && (
        <div className="notice">
          En pausa: nada se transcribe. El dispositivo se duerme en cuanto intenta enviar su próximo audio.
        </div>
      )}

      {items === null ? null : items.length === 0 ? (
        <p className="empty">{listening ? "Esperando a que el dispositivo escuche algo…" : "Escucha en pausa."}</p>
      ) : (
        <ol>
          {items.map((t) => (
            <li key={t.id} className={t.error ? "error" : undefined}>
              {t.text ? <p className="text">{t.text}</p> : <p className="note">{t.note ?? "Sin texto"}</p>}
              {t.audio && <audio controls preload="metadata" src={`/api/audio/${t.id}`} />}
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
