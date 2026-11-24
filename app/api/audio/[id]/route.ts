import { getAudio } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Devuelve el WAV guardado para reproducirlo en la página.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wav = /^[0-9a-f-]{36}$/.test(id) ? await getAudio(id) : null;
  if (!wav) return Response.json({ error: "audio no encontrado" }, { status: 404 });
  return new Response(new Uint8Array(wav), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
