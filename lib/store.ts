export type Sentiment = "positivo" | "neutral" | "negativo";

export type Transcript = {
  id: string;
  text: string;
  at: number; // epoch ms
  seconds: number; // duración del audio
  sentiment?: Sentiment;
  categories?: string[];
};

const KEY = "comechismes:transcripts";
const LISTENING_KEY = "comechismes:listening";
const MAX = 500;

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

// Sin Redis (desarrollo local) se guarda en memoria del proceso.
const g = globalThis as unknown as { __comechismes?: Transcript[]; __comechismesOn?: boolean };
const memory = (g.__comechismes ??= []);

/** Interruptor de la web: si está apagado no se transcribe nada. Encendido por defecto. */
export async function getListening(): Promise<boolean> {
  if (persistent) return (await redis<string | null>("GET", LISTENING_KEY)) !== "0";
  return g.__comechismesOn ?? true;
}

export async function setListening(on: boolean): Promise<void> {
  if (persistent) await redis("SET", LISTENING_KEY, on ? "1" : "0");
  else g.__comechismesOn = on;
}

export async function addTranscript(t: Transcript): Promise<void> {
  if (persistent) {
    await redis("LPUSH", KEY, JSON.stringify(t));
    await redis("LTRIM", KEY, 0, MAX - 1);
  } else {
    memory.unshift(t);
    memory.length = Math.min(memory.length, MAX);
  }
}

/** Más recientes primero. */
export async function listTranscripts(limit = MAX): Promise<Transcript[]> {
  if (persistent) {
    const rows = await redis<string[]>("LRANGE", KEY, 0, limit - 1);
    return rows.map((r) => JSON.parse(r) as Transcript);
  }
  return memory.slice(0, limit);
}

/** Categorías que ya existen, de la más usada a la menos usada. */
export async function listCategories(limit = 60): Promise<string[]> {
  const counts = new Map<string, number>();
  for (const t of await listTranscripts()) {
    for (const c of t.categories ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

export async function clearTranscripts(): Promise<void> {
  if (persistent) await redis("DEL", KEY);
  else memory.length = 0;
}
