"use client";

import { useEffect, useRef, useState } from "react";

type Level = { level: number; threshold: number; recording: boolean };
type Bridge = { onLevel?: (fn: (l: Level) => void) => () => void };

/**
 * Medidor de volumen del micrófono, abajo a la izquierda. Solo existe en la app de escritorio,
 * que es quien escucha: la barra sigue el volumen, la marca es el umbral a partir del cual graba
 * y el punto se enciende mientras está grabando.
 */
export default function VolumeMeter() {
  const [available, setAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const mark = useRef<HTMLElement>(null);

  useEffect(() => {
    const bridge = (window as unknown as { comechismes?: Bridge }).comechismes;
    if (!bridge?.onLevel) return;
    setAvailable(true);
    // El nivel llega ~15 veces por segundo: se pinta directo en el DOM, sin volver a renderizar.
    return bridge.onLevel((l) => {
      if (bar.current) bar.current.style.transform = `scaleX(${l.level.toFixed(3)})`;
      if (mark.current) mark.current.style.left = `${(l.threshold * 100).toFixed(1)}%`;
      setRecording(l.recording);
    });
  }, []);

  if (!available) return null;
  return (
    <div className={`meter${recording ? " rec" : ""}`} role="status" aria-label={recording ? "Grabando" : "Escuchando"}>
      <span className="dot" />
      <span className="track">
        <i ref={bar} />
        <b ref={mark} />
      </span>
    </div>
  );
}
