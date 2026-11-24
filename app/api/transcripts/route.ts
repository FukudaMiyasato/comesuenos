import { clearTranscripts, listTranscripts, persistent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { transcripts: await listTranscripts(), persistent },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  await clearTranscripts();
  return Response.json({ ok: true });
}
