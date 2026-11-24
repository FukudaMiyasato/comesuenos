"use client";

import { useCallback, useEffect, useState } from "react";
import CatSwitch from "../CatSwitch";

type Settings = { listening: boolean; fake: boolean };

export default function Admin() {
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSettings((await res.json()) as Settings);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const change = async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s)); // respuesta inmediata
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) setSettings((await res.json()) as Settings);
    else load();
  };

  return (
    <main className="admin">
      <p className="back">
        <a href="/">← Volver</a>
      </p>
      <h1>Admin</h1>

      {settings && (
        <ul>
          <li>
            <div>
              <h2>Escucha</h2>
              <p>
                {settings.listening
                  ? "Despierto: cada frase se analiza y suma a su categoría."
                  : "Dormido: no se analiza nada y no hay coste."}
              </p>
            </div>
            <CatSwitch awake={settings.listening} onToggle={() => change({ listening: !settings.listening })} />
          </li>
          <li>
            <div>
              <h2>Datos falsos</h2>
              <p>
                {settings.fake
                  ? "Activos: se muestran 50 datos de ejemplo junto a los reales."
                  : "Apagados: solo se muestra lo que entra de verdad."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.fake}
              aria-label="Datos falsos"
              className={`toggle${settings.fake ? " on" : ""}`}
              onClick={() => change({ fake: !settings.fake })}
            >
              <span aria-hidden />
            </button>
          </li>
        </ul>
      )}
    </main>
  );
}
