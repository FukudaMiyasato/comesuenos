export type Transcript = {
  id: string;
  text: string;
  at: number; // epoch ms
  seconds: number; // duración del audio
  error?: boolean;
  audio?: boolean; // hay un WAV guardado en /api/audio/<id>
  note?: string; // por qué no hay texto (sin clave, sin voz reconocible…)
};

const KEY = "comechismes:transcripts";
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
const g = globalThis as unknown as { __comechismes?: Transcript[]; __comechismesOn?: boolean };
const memory = (g.__comechismes ??= []);

const LISTENING_KEY = "comechismes:listening";

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
export async function listTranscripts(limit = 50): Promise<Transcript[]> {
  if (persistent) {
    const rows = await redis<string[]>("LRANGE", KEY, 0, limit - 1);
    return rows.map((r) => JSON.parse(r) as Transcript);
  }
  return memory.slice(0, limit);
}

export async function clearTranscripts(): Promise<void> {
  if (persistent) {
    const ids = (await listTranscripts(MAX)).filter((t) => t.audio).map((t) => AUDIO_KEY + t.id);
    await redis("DEL", KEY, ...ids);
  } else {
    memory.length = 0;
    audioMemory.clear();
  }
}

// ---- Audios ----
// Se guardan los WAV para poder escucharlos desde la web. En Redis caducan solos.
const AUDIO_KEY = "comechismes:audio:";
const AUDIO_TTL_S = 24 * 60 * 60;
const AUDIO_MEMORY_MAX = 40;

const ga = globalThis as unknown as { __comechismesAudio?: Map<string, Buffer> };
const audioMemory = (ga.__comechismesAudio ??= new Map());

export async function saveAudio(id: string, wav: ArrayBuffer): Promise<void> {
  const buf = Buffer.from(wav);
  if (persistent) {
    await redis("SET", AUDIO_KEY + id, buf.toString("base64"), "EX", AUDIO_TTL_S);
  } else {
    audioMemory.set(id, buf);
    while (audioMemory.size > AUDIO_MEMORY_MAX) audioMemory.delete(audioMemory.keys().next().value!);
  }
}

export async function getAudio(id: string): Promise<Buffer | null> {
  if (persistent) {
    const b64 = await redis<string | null>("GET", AUDIO_KEY + id);
    return b64 ? Buffer.from(b64, "base64") : null;
  }
  return audioMemory.get(id) ?? null;
}
