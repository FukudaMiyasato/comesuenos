import { getAudio } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve el WAV guardado para reproducirlo en la página.
// Atiende peticiones por rangos (Range), que Safari exige para reproducir audio.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wav = /^[0-9a-f-]{36}$/.test(id) ? await getAudio(id) : null;
  if (!wav) return Response.json({ error: "audio no encontrado" }, { status: 404 });

  const total = wav.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    return new Response(new Uint8Array(wav.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }

  return new Response(new Uint8Array(wav), { headers: { ...headers, "Content-Length": String(total) } });
}
