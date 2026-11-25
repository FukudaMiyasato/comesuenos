import type { Mention, Sentiment } from "./store";

// Datos de demostración: 50 menciones repartidas en las últimas 24 h.
// No se guardan: se generan al vuelo y se mezclan con los reales mientras el
// interruptor "datos falsos" de /admin esté activo.

const TOPICS: [string, Sentiment, number][] = [
  ["le gusta la comida", "positivo", 8],
  ["la atención es lenta", "negativo", 7],
  ["la atención es buena", "positivo", 5],
  ["el local está sucio", "negativo", 5],
  ["le molesta el ruido", "negativo", 5],
  ["no le gusta la comida", "negativo", 3],
  ["le gusta el local", "positivo", 3],
  ["hay buena variedad", "positivo", 3],
  ["los precios son altos", "negativo", 2],
  ["hay poca variedad", "negativo", 2],
  ["el local está limpio", "positivo", 2],
  ["habla de su trabajo", "neutral", 2],
  ["hace planes para mañana", "neutral", 1],
  ["comenta un partido de fútbol", "positivo", 1],
  ["la espera es larga", "negativo", 1],
]; // suman 50

/** Generador pseudoaleatorio con semilla fija: los mismos datos en cada consulta. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Minutos de antigüedad de cada mención, agrupados en momentos del día con más charla.
const SLOTS: number[] = (() => {
  const rand = rng(7);
  const peaks = [40, 150, 320, 560, 780, 1010, 1250]; // minutos atrás
  return Array.from({ length: 50 }, () => {
    const peak = peaks[Math.floor(rand() * peaks.length)];
    return Math.max(2, Math.min(1435, Math.round(peak + (rand() - 0.5) * 150)));
  });
})();

export function fakeMentions(now: number): Mention[] {
  // Se ancla al minuto para que no cambien de sitio entre consultas seguidas.
  const base = Math.floor(now / 60000) * 60000;
  const out: Mention[] = [];
  let i = 0;
  for (const [category, sentiment, n] of TOPICS) {
    for (let k = 0; k < n; k++) out.push([category, sentiment, base - SLOTS[i++] * 60000]);
  }
  return out.sort((a, b) => b[2] - a[2]);
}
