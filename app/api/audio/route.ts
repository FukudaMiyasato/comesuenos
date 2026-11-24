import { classify } from "@/lib/classify";
import { addMentions, listCategories, readAll } from "@/lib/store";
import { NoProviderError, transcribe } from "@/lib/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // límite de cuerpo de Vercel ≈ 4.5 MB

/** Duración leyendo los chunks "fmt " y "data" del WAV. */
function wavSeconds(buf: ArrayBuffer): number {
  const v = new DataView(buf);
  let byteRate = 0;
  for (let off = 12; off + 8 <= buf.byteLength; ) {
    const id = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(off + 16, true);
    if (id === "data") return byteRate ? Math.min(size, buf.byteLength - off - 8) / byteRate : 0;
    off += 8 + size + (size & 1);
  }
  return 0;
}

// El ESP32 envía el WAV crudo en el cuerpo: POST /api/audio  (Content-Type: audio/wav)
export async function POST(req: Request) {
  const expected = process.env.DEVICE_TOKEN;
  if (expected && req.headers.get("x-device-token") !== expected) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }

  // Interruptor apagado: se descarta el audio sin llamar a ningún modelo.
  const { data, settings } = await readAll();
  if (!settings.listening) {
    await req.body?.cancel().catch(() => {});
    return Response.json({ ok: true, listening: false });
  }

  const wav = await req.arrayBuffer();
  if (wav.byteLength < 44) return Response.json({ error: "audio vacío" }, { status: 400 });
  if (wav.byteLength > MAX_BYTES) return Response.json({ error: "audio demasiado grande" }, { status: 413 });

  const seconds = Math.round(wavSeconds(wav) * 10) / 10;

  // El texto solo existe en memoria durante esta petición: nunca se guarda ni se devuelve.
  let text: string;
  try {
    text = await transcribe(wav);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("transcripción falló:", message);
    return Response.json(
      { ok: false, error: message, seconds },
      { status: err instanceof NoProviderError ? 503 : 502 },
    );
  }
  if (!text) return Response.json({ ok: true, listening: true, seconds });

  // Sentimiento + categorías: primero se intenta encajar en las que ya existen.
  const tags = await classify(text, listCategories(data)).catch((err) => {
    console.error("clasificación falló:", err);
    return null;
  });
  // Sin clasificación no hay nada que guardar: la frase se descarta.
  if (!tags) return Response.json({ ok: true, listening: true, classified: false, seconds });

  // tags.model indica qué modelo respondió (el principal o el de reserva); no se guarda.
  await addMentions(data, tags.categories, tags.sentiment, Date.now());
  return Response.json({ ok: true, listening: true, ...tags, seconds });
}
