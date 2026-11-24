import { addTranscript, clearTranscripts, getListening, listTranscripts, persistent, type Transcript } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { transcripts: await listTranscripts(), persistent, listening: await getListening() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  await clearTranscripts();
  return Response.json({ ok: true });
}

// Solo en desarrollo: inserta textos ya clasificados para probar la interfaz sin el dispositivo.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "no disponible" }, { status: 404 });
  const items = (await req.json()) as Partial<Transcript>[];
  for (const t of items) {
    await addTranscript({ id: crypto.randomUUID(), at: Date.now(), seconds: 2, text: "", ...t });
  }
  return Response.json({ ok: true, added: items.length });
}
