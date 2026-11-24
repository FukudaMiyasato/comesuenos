export type Transcript = {
  id: string;
  text: string;
  at: number; // epoch ms
  seconds: number; // duración del audio
  error?: boolean;
};

const KEY = "comesuenos:transcripts";
const MAX = 200;

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
const g = globalThis as unknown as { __comesuenos?: Transcript[] };
const memory = (g.__comesuenos ??= []);

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
export async function listTranscripts(limit = 50): Promise<Transcript[]> {
  if (persistent) {
    const rows = await redis<string[]>("LRANGE", KEY, 0, limit - 1);
    return rows.map((r) => JSON.parse(r) as Transcript);
  }
  return memory.slice(0, limit);
}

export async function clearTranscripts(): Promise<void> {
  if (persistent) await redis("DEL", KEY);
  else memory.length = 0;
}
