import { readFileSync, renameSync, writeFileSync } from "node:fs";

// Por motivos legales NO se guarda ni el audio ni el texto transcrito.
// Lo único que persiste es: categoría + sentimiento + fecha de cada vez que se habló de ella.

export type Sentiment = "positivo" | "neutral" | "negativo";

/** Una mención: [categoría, sentimiento, fecha en ms]. */
export type Mention = [category: string, sentiment: Sentiment, at: number];

/** Un círculo: una categoría con un sentimiento concreto. */
export type Bubble = { category: string; sentiment: Sentiment; count: number; times: number[] };

export type Settings = { listening: boolean; fake: boolean };

type Data = {
  /** Clave "categoría|sentimiento" → cuántas veces y cuándo (últimas fechas). */
  bubbles: Record<string, { n: number; times: number[] }>;
  /** Menciones de las últimas 24 h, para el gráfico por horas. */
  recent: Mention[];
};

const DATA_KEY = "comechismes:data";
const SETTINGS_KEY = "comechismes:settings";
// Claves de versiones anteriores que contenían textos: se borran al limpiar.
const LEGACY_KEYS = ["comechismes:transcripts", "comechismes:listening", "comesuenos:transcripts", "comesuenos:listening"];

const TIMES_PER_BUBBLE = 40;
const RECENT_MAX = 2000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const persistent = Boolean(redisUrl && redisToken);

async function redis<T>(...command: (string | number)[]): Promise<T> {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { result: T }).result;
}

// Sin Redis se guarda en memoria del proceso y, si se define COMECHISMES_DATA_FILE (app de escritorio),
// también en ese archivo JSON, para que los datos sobrevivan al cerrar la app.
const g = globalThis as unknown as { __comechismesData?: Data; __comechismesSettings?: Settings; __comechismesLoaded?: boolean };

const dataFile = process.env.COMECHISMES_DATA_FILE;

function loadFile(): void {
  if (!dataFile || g.__comechismesLoaded) return;
  g.__comechismesLoaded = true;
  try {
    const saved = JSON.parse(readFileSync(dataFile, "utf8")) as { data?: Data; settings?: Settings };
    if (saved.data) g.__comechismesData = { ...emptyData(), ...saved.data };
    if (saved.settings) g.__comechismesSettings = { ...defaults, ...saved.settings };
  } catch {
    // Primera vez (no existe) o archivo dañado: se empieza de cero.
  }
}

function saveFile(): void {
  if (!dataFile) return;
  const tmp = `${dataFile}.tmp`;
  writeFileSync(tmp, JSON.stringify({ data: g.__comechismesData, settings: g.__comechismesSettings }));
  renameSync(tmp, dataFile); // escritura atómica: nunca queda un archivo a medias
}

const emptyData = (): Data => ({ bubbles: {}, recent: [] });
const defaults: Settings = { listening: true, fake: false };

const parse = <T>(raw: string | null, fallback: T): T => (raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback);

// "otros" existió en versiones anteriores como cajón de sastre; ya no se muestra ni se conserva.
const LEGACY_CATEGORIES = new Set(["otros"]);
function prune(data: Data): Data {
  for (const key of Object.keys(data.bubbles)) {
    if (LEGACY_CATEGORIES.has(key.slice(0, key.lastIndexOf("|")))) delete data.bubbles[key];
  }
  data.recent = data.recent.filter((m) => !LEGACY_CATEGORIES.has(m[0]));
  return data;
}

/** Datos y ajustes en una sola lectura (un único comando de Redis por consulta). */
export async function readAll(): Promise<{ data: Data; settings: Settings }> {
  if (persistent) {
    const [d, s] = await redis<(string | null)[]>("MGET", DATA_KEY, SETTINGS_KEY);
    return { data: prune(parse(d, emptyData())), settings: parse(s, defaults) };
  }
  loadFile();
  return { data: prune(g.__comechismesData ?? emptyData()), settings: g.__comechismesSettings ?? defaults };
}

export async function getSettings(): Promise<Settings> {
  if (persistent) return parse(await redis<string | null>("GET", SETTINGS_KEY), defaults);
  loadFile();
  return g.__comechismesSettings ?? defaults;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  if (persistent) await redis("SET", SETTINGS_KEY, JSON.stringify(next));
  else {
    g.__comechismesSettings = next;
    saveFile();
  }
  return next;
}

async function writeData(data: Data): Promise<void> {
  if (persistent) await redis("SET", DATA_KEY, JSON.stringify(data));
  else {
    g.__comechismesData = data;
    saveFile();
  }
}

export const bubbleKey = (category: string, sentiment: Sentiment) => `${category}|${sentiment}`;

/** Suma un punto a cada categoría (con ese sentimiento) y anota la fecha. */
export async function addMentions(data: Data, categories: string[], sentiment: Sentiment, at: number): Promise<void> {
  for (const category of categories) {
    const key = bubbleKey(category, sentiment);
    const b = (data.bubbles[key] ??= { n: 0, times: [] });
    b.n++;
    b.times = [at, ...b.times].slice(0, TIMES_PER_BUBBLE);
    data.recent.unshift([category, sentiment, at]);
  }
  data.recent = data.recent.filter((m) => m[2] > at - DAY_MS).slice(0, RECENT_MAX);
  await writeData(data);
}

/** Categorías que ya existen, de la más usada a la menos usada. */
export function listCategories(data: Data, limit = 60): string[] {
  const counts = new Map<string, number>();
  for (const [key, b] of Object.entries(data.bubbles)) {
    const category = key.slice(0, key.lastIndexOf("|"));
    counts.set(category, (counts.get(category) ?? 0) + b.n);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

export function toBubbles(data: Data): Bubble[] {
  return Object.entries(data.bubbles).map(([key, b]) => {
    const cut = key.lastIndexOf("|");
    return { category: key.slice(0, cut), sentiment: key.slice(cut + 1) as Sentiment, count: b.n, times: b.times };
  });
}

/** Borra todos los datos, incluidas las claves antiguas que guardaban textos. */
export async function clearAll(): Promise<void> {
  if (persistent) await redis("DEL", DATA_KEY, ...LEGACY_KEYS);
  else {
    g.__comechismesData = emptyData();
    saveFile();
  }
}
