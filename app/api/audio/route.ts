import { addTranscript, getListening, saveAudio } from "@/lib/store";
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

  // Interruptor apagado: se descarta el audio sin llamar al servicio de transcripción.
  if (!(await getListening())) {
    await req.body?.cancel().catch(() => {});
    return Response.json({ ok: true, listening: false, text: "" });
  }

  const wav = await req.arrayBuffer();
  if (wav.byteLength < 44) return Response.json({ error: "audio vacío" }, { status: 400 });
  if (wav.byteLength > MAX_BYTES) return Response.json({ error: "audio demasiado grande" }, { status: 413 });

  const seconds = Math.round(wavSeconds(wav) * 10) / 10;
  const id = crypto.randomUUID();

  // El audio se guarda siempre, así se puede escuchar aunque la transcripción falle.
  const audio = await saveAudio(id, wav).then(
    () => true,
    (err) => (console.error("no se pudo guardar el audio:", err), false),
  );
  const base = { id, at: Date.now(), seconds, audio };

  try {
    const text = await transcribe(wav);
    await addTranscript({ ...base, text, ...(text ? {} : { note: "No se reconoció voz" }) });
    return Response.json({ ok: true, listening: true, text, seconds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof NoProviderError) {
      // Sin clave: el audio llegó bien, solo queda sin transcribir.
      await addTranscript({ ...base, text: "", note: "Sin transcribir: falta GROQ_API_KEY u OPENAI_API_KEY" });
      return Response.json({ ok: true, listening: true, text: "", transcribed: false, seconds });
    }
    console.error("transcripción falló:", message);
    await addTranscript({ ...base, text: message, error: true });
    return Response.json({ ok: false, error: message, seconds }, { status: 502 });
  }
}
