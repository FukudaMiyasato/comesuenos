import type { Mention, Sentiment } from "./store";

// Datos de demostración: 50 menciones repartidas en las últimas 24 h.
// No se guardan: se generan al vuelo y se mezclan con los reales mientras el
// interruptor "datos falsos" de /admin esté activo.

const TOPICS: [string, Sentiment, number][] = [
  ["trabajo", "negativo", 8],
  ["trabajo", "positivo", 4],
  ["familia", "positivo", 6],
  ["familia", "negativo", 2],
  ["comida", "positivo", 5],
  ["dinero", "negativo", 5],
  ["dinero", "neutral", 2],
  ["chismes", "neutral", 4],
  ["chismes", "negativo", 3],
  ["salud", "negativo", 3],
  ["salud", "positivo", 1],
  ["pareja", "positivo", 2],
  ["clima", "neutral", 2],
  ["fútbol", "positivo", 2],
  ["tráfico", "negativo", 1],
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
